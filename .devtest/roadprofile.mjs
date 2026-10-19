// dev: a real circuit's road as the game builds it, every sample: d, x, z, height, bank, width -> json
//   node .devtest/roadprofile.mjs <id> <out.json>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const id = process.argv[2] || 'indy', out = process.argv[3] || '/tmp/road.json';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  const r = await pg.evaluate(async (id) => {
    const R = await import('./js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
    const TK = await import('./js/track.js');
    const T = TK.sampleTrack(t), r = (v) => Math.round(v * 100) / 100;
    return { ds: T.ds, L: T.L, d: [...T.D].map(r), x: [...T.X].map(r), z: [...T.Z].map(r), y: [...T.Y].map(r), b: [...T.B].map(v => r(v * 180 / Math.PI)), w: [...T.W].map(r) };
  }, id);
  fs.writeFileSync(out, JSON.stringify(r)); console.log(`${r.d.length} samples every ${r.ds.toFixed(2)} m, lap ${r.L.toFixed(0)} m -> ${out}`);
} finally { await b.close(); server.kill(); }
