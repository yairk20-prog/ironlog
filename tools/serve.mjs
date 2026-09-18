/* A local stand-in for the Netlify deploy: correct MIME types, the same
   single-page fallback, and — with COACH=1 — a stubbed /api/coach so the
   hosted-coach path can be exercised without a real key or the network.
   Run: node tools/serve.mjs [port] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.argv[2] || 8777);
const COACH = process.env.COACH === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const send = (res, status, body, type) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/coach') {
    if (!COACH) return send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')), TYPES['.html']);
    if (req.method === 'GET') {
      return send(res, 200, JSON.stringify({ available: true, model: 'stub' }), TYPES['.json']);
    }
    return send(res, 200, JSON.stringify({
      content: [{ type: 'text', text: 'תשובת מאמן לדוגמה מהשרת.' }]
    }), TYPES['.json']);
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.join(ROOT, pathname);

  /* Never serve outside the project, whatever the request says. */
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');

  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file);
    return send(res, 200, fs.readFileSync(file), TYPES[ext] || 'application/octet-stream');
  }

  /* Single-page fallback, exactly as netlify.toml declares it. */
  send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')), TYPES['.html']);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}${COACH ? ' (coach stub on)' : ''}`));
