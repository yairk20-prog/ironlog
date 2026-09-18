/* ==========================================================================
   chart.js — small SVG charts drawn to a single scale.
   One accent series, a soft area under it, an emphasised last point, and
   labels that always name a value the chart actually reaches.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

const node = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * Line chart with an area fill.
 * @param {Array<{x:number|string, y:number, label?:string}>} points ordered oldest → newest
 * @param {object} opts
 * @returns {SVGElement|null}
 */
export function lineChart(points, { height = 132, unit = '', format = null } = {}) {
  if (!points || points.length < 2) return null;

  const W = 320;
  const H = height;
  const padTop = 14;
  const padBottom = 22;
  const padStart = 34;   // room for the value axis
  const padEnd = 10;

  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (max === min) { max = min + 1; min = Math.max(0, min - 1); }
  const span = max - min;
  min = Math.max(0, min - span * 0.12);
  max += span * 0.12;

  const plotW = W - padStart - padEnd;
  const plotH = H - padTop - padBottom;
  const X = (i) => padStart + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const Y = (v) => padTop + plotH - ((v - min) / (max - min)) * plotH;

  const svg = node('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': 'גרף התקדמות'
  });

  const gradId = `chartFill${++uid}`;
  const defs = node('defs');
  const grad = node('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(node('stop', { offset: '0%', 'stop-color': '#FF8A3D', 'stop-opacity': '.34' }));
  grad.appendChild(node('stop', { offset: '100%', 'stop-color': '#FF8A3D', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const fmt = format || ((v) => (Math.round(v * 10) / 10).toString());

  /* grid + value labels at the extremes and the midpoint */
  [max, (max + min) / 2, min].forEach((v) => {
    const y = Y(v);
    svg.appendChild(node('line', { class: 'c-grid', x1: padStart, y1: y, x2: W - padEnd, y2: y }));
    const t = node('text', { class: 'c-label', x: padStart - 5, y: y + 3, 'text-anchor': 'end' });
    t.textContent = fmt(v);
    svg.appendChild(t);
  });

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  svg.appendChild(node('path', {
    class: 'c-area',
    fill: `url(#${gradId})`,
    d: `${line} L${X(points.length - 1).toFixed(1)} ${padTop + plotH} L${X(0).toFixed(1)} ${padTop + plotH} Z`
  }));
  svg.appendChild(node('path', { class: 'c-line', d: line }));

  points.forEach((p, i) => {
    const lastOne = i === points.length - 1;
    svg.appendChild(node('circle', {
      class: 'c-dot',
      cx: X(i), cy: Y(p.y),
      r: lastOne ? 4.5 : 2.6
    }));
  });

  /* first and last x labels only — more than that collides at phone width */
  [0, points.length - 1].forEach((i, k) => {
    if (points.length < 2) return;
    const t = node('text', {
      class: 'c-label',
      x: X(i),
      y: H - 6,
      'text-anchor': k === 0 ? 'start' : 'end'
    });
    t.textContent = points[i].label ?? '';
    svg.appendChild(t);
  });

  /* the newest value, called out */
  const lastPoint = points[points.length - 1];
  const callout = node('text', {
    class: 'c-label',
    x: X(points.length - 1),
    y: Y(lastPoint.y) - 9,
    'text-anchor': 'end',
    fill: '#FF8A3D',
    'font-weight': '800'
  });
  callout.textContent = `${fmt(lastPoint.y)}${unit ? ` ${unit}` : ''}`;
  svg.appendChild(callout);

  return svg;
}
