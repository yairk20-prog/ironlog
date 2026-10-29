/* Builds the rest alarm as an audio file: sounds/rest-end.wav.

   Why files and not only Web Audio: on Android, Chrome plays a short media
   clip (under five seconds) with "transient, may duck" audio focus — the
   music in the headphones is turned down for the length of the clip, then
   back up. A Web Audio tone gets no audio focus, so it is mixed in at the
   music's level and drowned. Same sound as ui.js chime(): square over sine,
   three rising double beeps, twice; mono, 22.05 kHz, 16-bit, peak −1 dBFS.

   node tools/build-sounds.mjs */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const RATE = 22050;

function render(seconds, beeps) {
  const n = Math.round(seconds * RATE);
  const buf = new Float32Array(n);
  for (const { at, freq, dur, level = 1 } of beeps) {
    const start = Math.round(at * RATE);
    const len = Math.round(dur * RATE);
    const ramp = Math.round(0.008 * RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / RATE;
      const env = Math.min(1, i / ramp, (len - i) / ramp) * level;
      const sine = Math.sin(2 * Math.PI * freq * t);
      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      buf[start + i] += env * (0.7 * sine + 0.32 * square);
    }
  }
  /* normalise to −1 dBFS */
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const gain = 0.891 / peak;
  return buf.map((v) => v * gain);
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const alarm = [];
[0, 1.25].forEach((round) => {
  [[0, 1568], [0.13, 1568], [0.36, 1976], [0.49, 1976], [0.72, 2349], [0.85, 2349]]
    .forEach(([dt, freq]) => alarm.push({ at: 0.03 + round + dt, freq, dur: 0.1 }));
});

fs.mkdirSync(path.join(ROOT, 'sounds'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'sounds/rest-end.wav'), wav(render(2.3, alarm)));
console.log('sounds/rest-end.wav');
