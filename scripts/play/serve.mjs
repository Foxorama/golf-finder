// Tiny dependency-free static file server for local Play tracing. Serves the repo
// root so trace-tool.html can fetch Esri tiles for pixel-reads (the 🪄 detect feature),
// which needs a real HTTP origin (file:// is blocked by CORS). No npm, built-in http/fs.
//
//   node serve.mjs [port]        (default 8090)
//
// then open  http://localhost:8090/scripts/play/trace-tool.html
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = +(process.argv[2] || 8090);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..'); // repo root (scripts/play -> up 2)
const TRACE = '/scripts/play/trace-tool.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = TRACE;
    // resolve + confine to ROOT (no path traversal)
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
      const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) { try { res.writeHead(500); res.end(String(e)); } catch {} }
}).listen(PORT, () => {
  console.log('\n  Play trace server running.');
  console.log('  Open this in your browser:\n');
  console.log(`    http://localhost:${PORT}${TRACE}\n`);
  console.log('  (leave this window open while tracing; close it / Ctrl+C when done)\n');
});
