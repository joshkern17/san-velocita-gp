// dev: the Track Studio headless: load a circuit, find its curbs in the photo, shots of the map + 3D view
//   node .devtest/studio.mjs <outdir> [id=zandvoort] [zoomAt=m along the lap,...]  (AUTO=0: skip the photo search)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'zandvoort', at = (process.argv[4] || '').split(',').filter(Boolean).map(Number);
const PORT = 8900 + Math.floor(Math.random() * 100);
const server = spawn('node', [join(ROOT, 'tools/tracks/studio.mjs'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/studio.html?id=${id}`);
  await pg.waitForFunction(() => window.__studio && window.__studio.S.A, null, { timeout: 60000 });
  await pg.waitForTimeout(4000);
  await pg.screenshot({ path: join(out, 'studio_all.png') });
  if (process.env.AUTO !== '0') {
    await pg.evaluate(() => window.__studio.findKerbs());
    console.log(await pg.evaluate(() => document.getElementById('status').textContent));
    console.log(JSON.stringify(await pg.evaluate(() => window.__studio.S.dress.kerbs)));
    if (process.env.SAVE) { await pg.evaluate(() => window.__studio.save()); console.log(await pg.evaluate(() => document.getElementById('status').textContent)); }
  }
  for (const m of at) {
    await pg.evaluate((m) => { const { S } = window.__studio, T = S.T, i = Math.round(m / T.ds) % T.N; S.view.cx = T.X[i]; S.view.cz = T.Z[i]; S.view.scale = 4; S.dirty = true; }, m);
    await pg.waitForTimeout(3500);
    await pg.screenshot({ path: join(out, `studio_${m}.png`) });
  }
  if (process.env.V3D) {
    const m = +process.env.V3D;
    await pg.evaluate((m) => { const { S, open3d } = window.__studio, T = S.T, i = Math.round(m / T.ds) % T.N; open3d({ i, lat: 0 }); document.getElementById('view3d').classList.add('big'); }, m);
    await pg.waitForTimeout(6000);
    await pg.screenshot({ path: join(out, `studio_3d_${m}.png`) });
  }
} finally { await b.close(); server.kill(); }
