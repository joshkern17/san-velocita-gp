// dev: the data room (station_data, upstairs on the unit's mezzanine) in the game: four shots framed in the station's
// own Blender coordinates (from the workshop floor, along the deck, behind the chairs, at the back wall), in use.
// KIT=station_data=station_data_v2 to load another file for it.   node .devtest/dataShot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  if (process.env.KIT) await pg.addInitScript((swap) => { const m = {}; for (const n of ['shell_lockup', 'shell_unit', 'station_tools', 'station_tools2', 'station_dyno', 'station_fab', 'station_sim', 'station_data']) m[n] = `models/garage/${n}.glb`;
    for (const kv of swap.split(',')) { const [a, c] = kv.split('='); m[a] = `models/garage/${c}.glb`; } window.__SVGP_KIT = m; }, process.env.KIT);
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: 'unit', fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true, crew: false, busy: true }); });
  await pg.waitForFunction(() => { const k = window.__svgp.dbg.pitGarage.kit; return !!(k && k.stations && k.stations.data); }, null, { timeout: 60000, polling: 500 });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => { const k = window.__svgp.dbg.pitGarage.kit; if (k.setBusy) k.setBusy(['dyno', 'fab', 'tools2', 'data']); }); // (the preview only applies it with the crew on)
  for (const [n, pos, at] of [['floor', [0.6, -6.4, 0.9], [0.0, -2.2, 0.7]], ['deck', [4.2, -3.15, 1.6], [-1.0, -1.3, 0.8]], ['desks', [-0.2, -1.0, 1.6], [-0.2, -3.0, 0.8]], ['wall', [1.4, -3.15, 1.45], [1.0, 0.0, 1.15]]]) {
    await pg.evaluate(({ pos, at }) => { const P = window.__svgp.dbg.pitGarage, o = P.kit.stations.data, V = P.camera.position.constructor;
      o.updateMatrixWorld(true); const w = (a) => o.localToWorld(new V(a[0], a[2], -a[1]));
      P.cine({ pos: w(pos), at: w(at), fov: 64, shift: 0 }, 0); }, { pos, at });
    await pg.waitForTimeout(600); await pg.screenshot({ path: join(out, `d-${n}.png`) });
  }
} finally { await b.close(); server.kill(); }
