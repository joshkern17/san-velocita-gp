// A real circuit's ground, coloured from open aerial photos (js/groundmap.js, the same as the editor's MAP › Ground
// From Photo, run in a headless page here):  node tools/tracks/ground.mjs <id> [...]
// Writes tracks/real/ground/<id>.json (build.mjs merges it in as track.ground) and patches tracks/real/<id>.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'tracks/real');
const require = createRequire(path.join(ROOT, 'tools/package.json'));
const { chromium } = require('playwright-core');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };

const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await b.newPage();
  await page.route('http://svgp.local/**', (r) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  page.on('console', (m) => console.log('  ' + m.text()));
  await page.goto('http://svgp.local/tools/tracks/bake.html');
  for (const id of process.argv.slice(2)) {
    const f = path.join(OUT, id + '.json'), track = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log(track.name);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of track.points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const t0 = Date.now();
    const G = await page.evaluate(async ([geo, box]) => {
      const m = await import('/js/groundmap.js'); let last = '';
      return m.groundMap(geo, box.map((v, i) => v + (i < 2 ? -m.GROUND_MARGIN : m.GROUND_MARGIN)), (s) => { const k = s.replace(/\d+%/, ''); if (k !== last) console.log(s); last = k; });
    }, [track.geo, [x0, z0, x1, z1]]);
    fs.mkdirSync(path.join(OUT, 'ground'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'ground', id + '.json'), JSON.stringify(G));
    track.ground = G; if (track.osm) delete track.osm.ground;
    if (track.real && !(track.real.source || '').includes(G.credit)) track.real.source = (track.real.source || '') + ' · ' + G.credit;
    fs.writeFileSync(f, JSON.stringify(track));
    console.log(`  ${G.w}x${G.h} at ${G.res} m, ${(G.img.length * 0.75 / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(0)} s -> tracks/real/ground/${id}.json`);
  }
} finally { await b.close(); }
