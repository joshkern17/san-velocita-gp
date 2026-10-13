// dev: the Circuit Designer's 3D VIEW, used like a player: hover a spot on the map, press V, fly forward with W,
// look round with the mouse, press V to go back to the map
//   node .devtest/ed3d.mjs <outdir> [id=zandvoort] [at=m along the lap]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'zandvoort', AT = +(process.argv[4] || 1150);
const PORT = 9500 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async (id) => { const { cloneTrack } = await import('/js/track.js'); const R = await import('/js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(cloneTrack(R.realTracks().find(p => p.real.id === id))); window.__svgp.openEditor(t); }, id);
  await pg.waitForTimeout(2500);
  const p = await pg.evaluate((AT) => { const e = window.__svgp.editor, T = e.T, i = Math.round(AT / T.ds); e.view.cx = T.X[i]; e.view.cz = T.Z[i]; e.view.scale = 2; e.dirty = true;
    const r = e.canvas.getBoundingClientRect(), [x, y] = e.w2s(T.X[i], T.Z[i]); return [r.left + x, r.top + y]; }, AT);
  await pg.mouse.move(...p); await pg.waitForTimeout(300);
  const t0 = Date.now();
  await pg.keyboard.press('v');
  await pg.waitForFunction(() => window.__svgp.editor.v3d, null, { timeout: 60000 });
  console.log(`3D view up in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: join(out, 'ed3d_1.png') });
  await pg.keyboard.down('w'); await pg.waitForTimeout(1500); await pg.keyboard.up('w');
  await pg.mouse.move(700, 430); await pg.mouse.down(); await pg.mouse.move(900, 400, { steps: 8 }); await pg.mouse.up();
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: join(out, 'ed3d_2.png') });
  await pg.keyboard.press('v'); await pg.waitForTimeout(800);
  console.log('back on the map:', await pg.evaluate(() => !window.__svgp.editor.v3d && getComputedStyle(document.getElementById('ed-canvas')).visibility));
  await pg.screenshot({ path: join(out, 'ed3d_3.png') });
} finally { await b.close(); server.kill(); }
