// dev: the sim rig (station_sim) in the Home Garage preview, in a premises: three shots of it, plus (CREW=1) the crew on
// and a close shot of whoever's sat in it. Waits for the garage view, not the title screen.
//   PREMISES=unit|lockup KIT=station_sim=station_sim_v2 CREW=1 node .devtest/simshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', K = 'sim';
const PORT = 8600 + Math.floor(Math.random() * 150);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  if (process.env.KIT) await pg.addInitScript((swap) => { const m = {}; for (const n of ['shell_lockup', 'shell_unit', 'station_tools', 'station_tools2', 'station_dyno', 'station_fab', 'station_sim', 'station_data']) m[n] = `models/garage/${n}.glb`;
    for (const kv of swap.split(',')) { const [a, c] = kv.split('='); m[a] = `models/garage/${c}.glb`; } window.__SVGP_KIT = m; }, process.env.KIT);
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.dbg, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  const crew = process.env.CREW === '1';
  const open = () => pg.evaluate(({ p, crew }) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: p, fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true, crew, busy: true }); }, { p: process.env.PREMISES || 'unit', crew });
  await open();
  await pg.waitForFunction((k) => { const P = window.__svgp.dbg.pitGarage; return window.__svgp.screen === 's-homeview' && P.kit && P.kit.stations && P.kit.stations[k]; }, K, { timeout: 60000, polling: 300 });
  await pg.waitForTimeout(3500);
  const ensure = async () => { if (await pg.evaluate(() => window.__svgp.screen) !== 's-homeview') { await open(); await pg.waitForTimeout(3000); } };
  for (const [n, fwd, side, up, at] of [['front', 3.0, 0.0, 1.6, 0.7], ['left', 2.4, -2.0, 1.9, 0.7], ['close', 1.5, 0.9, 1.3, 0.7]]) {
    await ensure();
    await pg.evaluate(({ k, fwd, side, up, at }) => { const P = window.__svgp.dbg.pitGarage, o = P.kit.stations[k], V = P.camera.position.constructor;
      const c = o.getWorldPosition(new V()), q = o.getWorldQuaternion(new P.camera.quaternion.constructor());
      const f = new V(0, 0, 1).applyQuaternion(q).setY(0).normalize(), s = new V(-f.z, 0, f.x), mid = c.clone().addScaledVector(f, 0.9);
      P.cine({ pos: mid.clone().addScaledVector(f, fwd).addScaledVector(s, side).setY(c.y + up), at: mid.clone().setY(c.y + at), fov: 64, shift: 0.16 }, 0); }, { k: K, fwd, side, up, at });
    await pg.waitForTimeout(600); await pg.screenshot({ path: join(out, `st-sim-${n}.png`) });
  }
  if (crew) {   // whoever's in the seat: wait for someone sat at the rig's STAND_driver, then close on them
    const sat = await pg.waitForFunction(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; if (!h || !h.people) return false;
      const p = h.people.find(q => q.spot && q.spot.role === 'driver' && q.spot.st === 'sim' && !q.path.length); if (!p) { const d = h.people.find(q => q.role === 'driver'), s = (h.spots || []).find(x => x.st === 'sim'); if (d && s && d.spot !== s) { if (d.group) h.endGroup(d.group); h.release(d); h.task(d, s); d.t = 1e9; } return false; }
      return true; }, null, { timeout: 90000, polling: 500 }).then(() => true, () => false);
    console.log('driver sat in the rig:', sat);
    console.log(await pg.evaluate(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; if (!h) return 'no crew'; return JSON.stringify({ spots: (h.spots || []).filter(s => s.st === 'sim' || s.role === 'driver').map(s => [s.role, s.st, s.clip, s.who && s.who.role, +s.x.toFixed(1), +s.z.toFixed(1)]), people: h.people.map(p => [p.role, p.spot && (p.spot.st || p.spot.role), p.group ? 'talk' : '', p.path.length]) }); }));
    await pg.waitForTimeout(2500);
    const info = await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, h = P.homeCrew, p = h.people.find(q => q.spot && q.spot.st === 'sim'); if (!p) return null;
      const V = P.camera.position.constructor, f = new V(Math.sin(p.yaw), 0, Math.cos(p.yaw)), s = new V(-f.z, 0, f.x);
      const c = new V(p.x, p.y, p.z); P.cine({ pos: c.clone().addScaledVector(f, 1.3).addScaledVector(s, 1.0).setY(p.y + 1.4), at: c.clone().setY(p.y + 0.7), fov: 55, shift: 0 }, 0);
      return { clip: p.ch.clip, x: p.x, z: p.z }; });
    console.log('sitter:', JSON.stringify(info));
    await pg.waitForTimeout(600); await pg.screenshot({ path: join(out, 'st-sim-driver.png') });
    await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, h = P.homeCrew, p = h.people.find(q => q.spot && q.spot.st === 'sim'); if (!p) return;
      const V = P.camera.position.constructor, f = new V(Math.sin(p.yaw), 0, Math.cos(p.yaw)), s = new V(-f.z, 0, f.x), c = new V(p.x, p.y, p.z);
      P.cine({ pos: c.clone().addScaledVector(f, -0.3).addScaledVector(s, 1.4).setY(p.y + 1.1), at: c.clone().addScaledVector(f, 0.3).setY(p.y + 0.6), fov: 55, shift: 0 }, 0); });
    await pg.waitForTimeout(600); await pg.screenshot({ path: join(out, 'st-sim-driver-side.png') });
  }
} finally { await b.close(); server.kill(); }
