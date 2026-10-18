// dev: the facilities' stations (models/garage/station_*.glb, tools/garage-stations.py) in the Industrial unit, everything
// bought: three shots of each (in front, from the left, close from the right). PREMISES=unit. Screenshots to argv[2].
//   node .devtest/stationshot.mjs <outdir> [station ...]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', only = process.argv.slice(3);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  // KIT=station_dyno=station_dyno_v2,...: load those pieces from other files (a new version, side by side with the old)
  if (process.env.KIT) await pg.addInitScript((swap) => { const m = {}; for (const n of ['shell_lockup', 'shell_unit', 'station_tools', 'station_tools2', 'station_dyno', 'station_fab', 'station_sim', 'station_data']) m[n] = `models/garage/${n}.glb`;
    for (const kv of swap.split(',')) { const [a, b] = kv.split('='); m[a] = `models/garage/${b}.glb`; } window.__SVGP_KIT = m; }, process.env.KIT);
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate((p) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: p, fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true }); }, process.env.PREMISES || 'unit');
  await pg.waitForFunction(() => window.__svgp.screen === 's-homeview' && /dyno/.test(String(window.__svgp.dbg.pitGarage.custom)) && window.__svgp.dbg.pitGarage.kit, null, { timeout: 60000, polling: 300 }); await pg.waitForTimeout(3000);   // (in the garage view, its kit in: not the title screen)
  const keys = await pg.evaluate(() => Object.keys(window.__svgp.dbg.pitGarage.kit.stations));
  console.log('stations:', keys.join(', '));
  for (const k of keys.filter(k => !only.length || only.includes(k))) {
    for (const [n, fwd, side, up, at] of [['front', 3.4, 0.0, 1.7, 0.7], ['left', 2.6, -2.2, 2.0, 0.8], ['close', 1.6, 1.0, 1.4, 0.75]]) {
      await pg.evaluate(({ k, fwd, side, up, at }) => { const P = window.__svgp.dbg.pitGarage, o = P.kit.stations[k], V = P.camera.position.constructor;
        const c = o.getWorldPosition(new V()), q = o.getWorldQuaternion(new P.camera.quaternion.constructor());
        const f = new V(0, 0, 1).applyQuaternion(q).setY(0).normalize(), s = new V(-f.z, 0, f.x), mid = c.clone().addScaledVector(f, k === 'tools2' ? 0 : 1.4);
        P.cine({ pos: mid.clone().addScaledVector(f, fwd).addScaledVector(s, side).setY(c.y + up), at: mid.clone().setY(c.y + at), fov: 64, shift: 0.16 }, 0); }, { k, fwd, side, up, at });
      await pg.waitForTimeout(500); await pg.screenshot({ path: join(out, `st-${k}-${n}.png`) });
    }
  }
} finally { await b.close(); server.kill(); }
