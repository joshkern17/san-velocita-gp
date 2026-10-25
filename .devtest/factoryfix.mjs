// dev: the factory's lag + the stair-top fall (2026-10-25): draw calls and meshes in the room, what you walk into (blockedCells: the crew grid's cells with something standing in them, per floor), the
// crew's floor probed across the seams upstairs (the stairs stop 5 cm short of the landing), then ~30 s of the crew:
// anyone dropping more than 0.3 m in a frame is a fall.   NOMERGE=1 (no merge, for before/after)   node .devtest/factoryfix.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  await pg.addInitScript((nm) => { navigator.getGamepads = () => []; if (nm) window.__SVGP_NOMERGE = 1; }, !!process.env.NOMERGE);
  if (process.env.SHELL_WS) await pg.addInitScript((sh) => { const m = {}; for (const n of ['shell_lockup', 'shell_unit', 'shell_workshop', 'shell_factory', 'station_tools', 'station_tools2', 'station_dyno', 'station_fab', 'station_sim', 'station_data']) m[n] = `models/garage/${n}.glb`;
    m.shell_factory = `models/garage/${sh}.glb`; window.__SVGP_KIT = m; }, process.env.SHELL_WS);   // (SHELL_WS=shell_factory_<tag>: that build)
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: 'factory', fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true, crew: true, busy: true }); });
  await pg.waitForFunction(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; return !!(h && h.ready && h.floors); }, null, { timeout: 120000, polling: 500 });
  await pg.waitForTimeout(1500);
  console.log('room:', JSON.stringify(await pg.evaluate(async () => {
    const P = window.__svgp.dbg.pitGarage, h = P.homeCrew, R = P.r; let meshes = 0, merged = 0; P.room.traverse(o => { if (o.isMesh) { meshes++; if (o.userData.solids) merged++; } });
    R.info.autoReset = false; const per = [];
    const t = []; await new Promise(r => { let last = performance.now(), k = 0; const f = () => { const now = performance.now(); t.push(now - last); last = now; if (k > 0) per.push(R.info.render.calls); R.info.reset(); if (++k < 90) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    R.info.autoReset = true; per.sort((a, b) => a - b); const calls = per[per.length >> 1];
    const left = {}; P.room.traverse(o => { if (!o.isMesh || o.userData.solids) return; const k = o.material.transparent ? 'transparent' : (o.name || '?').replace(/[_.]?\d+$/, '').split('_').slice(0, 2).join('_'); left[k] = (left[k] || 0) + 1; });
    window.__left = Object.entries(left).sort((a, b) => b[1] - a[1]).slice(0, 25);
    t.sort((a, b) => a - b);
    return { meshes, merged, callsPerFrame: calls, left: window.__left, frameMsMedian: +t[45].toFixed(1), blockedCells: h.floors.map(F => F.g.reduce((a, v) => a + (v ? 1 : 0), 0)) };
  })));
  // the crew's floor along the stairs' top and across the joins upstairs (game frame: glb x + 4, glb z - 6.8)
  console.log('probes:', JSON.stringify(await pg.evaluate(() => {
    const h = window.__svgp.dbg.pitGarage.homeCrew, out = {};
    for (const z of [-1.3, -1.42, -1.44, -1.5]) out['stairTop z' + z] = +h.floorAt(-7.3 + 4, 4.15, z - 6.8).toFixed(2);
    out['office|left x-10'] = +h.floorAt(-10 + 4, 4.2, 3 - 6.8).toFixed(2);
    out['left|front z6.5'] = +h.floorAt(-9 + 4, 4.2, 6.5 - 6.8).toFixed(2);
    out['stairs mid'] = +h.floorAt(-7.3 + 4, 2.1, 1.6 - 6.8).toFixed(2);
    return out;
  })));
  if (process.env.GRIDOUT) { const G = await pg.evaluate(() => { const F = window.__svgp.dbg.pitGarage.homeCrew.floors[0]; return { x0: F.x0, z0: F.z0, nx: F.nx, nz: F.nz, g: Array.from(F.g) }; }); (await import('fs')).writeFileSync(process.env.GRIDOUT, JSON.stringify(G)); }   // (the ground floor's grid, for a diff)
  // one of the crew sent from the foot of the stairs up to the walkway (OLDFLOOR=1: the floor check as it was)
  const climb = await pg.evaluate(async (old) => {
    const T3 = await import('three'), h = window.__svgp.dbg.pitGarage.homeCrew, p = h.people[0], s = h.stairs[0];
    if (old) { const ray = new T3.Raycaster(), o = new T3.Vector3(), dn = new T3.Vector3(0, -1, 0);
      h.floorAt = (x, y, z) => { ray.set(o.set(x, y + 1, z), dn); ray.far = 9; const k = ray.intersectObjects(h.navMeshes, false)[0]; return k ? k.point.y : y; }; }
    const goal = [s.hi.x, s.hi.z - 0.3]; // (on the landing)
    p.x = s.lo.x; p.z = s.lo.z; p.y = 0; p.L = s.loL; p.group = null;
    p.act = { L: s.hiL, x: goal[0], z: goal[1], yaw: 0, clip: 'idle' }; p.t = 99; p.path = [[s.hi.x, s.hi.z], goal];
    const ys = []; for (let i = 0; i < 14; i++) { await new Promise(r => setTimeout(r, 500)); ys.push([+p.y.toFixed(2), +p.z.toFixed(2)]); }
    return ys;
  }, !!process.env.OLDFLOOR);
  console.log('npc up the stairs (y, z):', JSON.stringify(climb));
  await pg.evaluate(() => { const h = window.__svgp.dbg.pitGarage.homeCrew, T = window.__ff = { falls: [], climbs: 0, frames: 0 }; const last = new Map(); const u = h.update.bind(h);
    h.update = (dt) => { u(dt); T.frames++; for (const p of h.people) { const y0 = last.get(p); if (y0 != null) { if (y0 - p.y > 0.3) T.falls.push([p.role, +y0.toFixed(2), +p.y.toFixed(2), +p.x.toFixed(2), +p.z.toFixed(2)]); if (y0 < 2.1 && p.y >= 2.1) T.climbs++; } last.set(p, p.y); } }; });
  if (!process.env.NOWATCH) await pg.waitForTimeout(30000);
  console.log('crew 30 s:', JSON.stringify(await pg.evaluate(() => window.__ff)));
} finally { await b.close(); server.kill(); }
