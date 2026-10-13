// Track Studio's server (dev only): node tools/tracks/studio.mjs [port]  ->  http://127.0.0.1:8123/studio.html
// Serves the game's files and saves a real circuit's dressing (its curbs and barriers, stretch by stretch: js/track.js
// KERB_STYLES / WALL_TYPES) to tracks/real/dress/<id>.json, which build.mjs keeps through rebuilds, and into
// tracks/real/<id>.json so the game has it straight away.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = +process.argv[2] || 8123;
const DRESS = path.join(ROOT, 'tracks/real/dress');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };

function save(id, body) {
  if (!/^[a-z0-9_-]+$/.test(id)) throw new Error('bad id');
  const dress = JSON.parse(body);
  if (!dress || typeof dress !== 'object' || !Array.isArray(dress.kerbs) || !Array.isArray(dress.walls)) throw new Error('not a dressing');
  fs.mkdirSync(DRESS, { recursive: true });
  fs.writeFileSync(path.join(DRESS, id + '.json'), JSON.stringify(dress, null, 1));
  const f = path.join(ROOT, 'tracks/real', id + '.json');
  if (fs.existsSync(f)) { const t = JSON.parse(fs.readFileSync(f, 'utf8')); t.dress = dress; fs.writeFileSync(f, JSON.stringify(t)); }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname.startsWith('/__studio/save/')) {
    let body = ''; req.on('data', d => { body += d; if (body.length > 8e6) req.destroy(); });
    req.on('end', () => {
      try { save(url.pathname.slice(15), body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }
      catch (e) { res.writeHead(400); res.end(String(e.message)); }
    });
    return;
  }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const f = path.join(ROOT, p || 'studio.html');
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  const u = `http://127.0.0.1:${PORT}/studio.html`;
  console.log('Track Studio: ' + u);
  if (!process.argv.includes('--no-browser')) spawn('open', [u], { stdio: 'ignore' });
});
