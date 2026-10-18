// dev: the home crew's clips close up (js/homecrew.js): one of them made to do each in turn where they stand (the
// phone, the coffee, kneeling, picking up), then everyone as they are after a while, a shot of each.
//   node .devtest/crewclips.mjs <outdir>
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
  const pg = await b.newPage({ viewport: { width: 900, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: 'unit', fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true, crew: true, busy: true }); });
  await pg.waitForFunction(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; return !!(h && h.ready && h.floors); }, null, { timeout: 120000, polling: 500 });
  const look = (i, d = 2.0, h = 1.2) => pg.evaluate(({ i, d, h }) => {
    const P = window.__svgp.dbg.pitGarage, p = P.homeCrew.people[i], V = P.camera.position.constructor, a = p.yaw + 0.25;
    P.cine({ pos: new V(p.x + Math.sin(a) * d, p.y + h, p.z + Math.cos(a) * d), at: new V(p.x, p.y + h * 0.7, p.z), fov: 50, shift: 0 }, 0);
  }, { i, d, h });
  // one of them (standing clear, no talking) doing each clip
  const i = await pg.evaluate(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; return Math.max(0, h.people.findIndex(p => p.role === 'manager')); });
  await pg.evaluate(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; for (const g of [...h.groups]) h.endGroup(g); h._talk = h.talk; h.talk = () => false; }); // (nobody wandering over to chat)
  for (const c of ['phone', 'phone', 'text', 'drink', 'nod_think', 'point_fwd', 'kneel_inspect', 'pick_up', 'bored']) {
    await pg.evaluate(({ i, c }) => { const h = window.__svgp.dbg.pitGarage.homeCrew, p = h.people[i]; h.release(p); p.path = []; p.L = 0; p.y = 0; const F = h.floors[0]; let best = null;
      for (let x = F.x0; x < F.x0 + F.nx * 0.25; x += 0.25) for (let z = F.z0; z < F.z0 + F.nz * 0.25; z += 0.25) if (h.clear(F, x, z, 1.4) && h.clear(F, x + 1.4, z + 1.4, 0.6)) { const d = Math.hypot(x - (F.x0 + F.nx * 0.125), z - (F.z0 + F.nz * 0.125)); if (!best || d < best[2]) best = [x, z, d]; }
      p.x = best[0]; p.z = best[1]; p.yaw = 0.25; p.act = { L: 0, x: p.x, z: p.z, yaw: p.yaw, clip: c }; p.cur = c; p.vt = 1e9; p.t = 1e9; p.intro = 0; }, { i, c });
    await pg.waitForTimeout(c === 'pick_up' ? 2600 : 3000);
    console.log(c, await pg.evaluate(i => { const h = window.__svgp.dbg.pitGarage.homeCrew, p = h.people[i]; return [p.ch.clip, 'grp', p.group ? p.group.who.map(q => q.role).join('+') : '-', 'others', h.people.map(q => q.t.toFixed(0)).join(','), 'phone', p.phone && p.phone.visible, 'cup', p.cup && p.cup.visible, 'prop', p.prop && p.prop.visible, 'path', p.path.length, 'pw', p.phone && p.phone.getWorldPosition(new p.ch.object.position.constructor()).toArray().map(v => v.toFixed(2)).join('/'), 'cw', p.cup && p.cup.getWorldPosition(new p.ch.object.position.constructor()).toArray().map(v => v.toFixed(2)).join('/'), 'ws', p.phone && p.phone.getWorldScale(new p.ch.object.position.constructor()).x.toFixed(3), p.cup && p.cup.getWorldScale(new p.ch.object.position.constructor()).x.toFixed(3), 'parent', p.phone && p.phone.parent && p.phone.parent.name].join(' '); }, i)); await look(i, 2.4, /kneel/.test(c) ? 1.0 : 1.5); await pg.waitForTimeout(300);
    await pg.screenshot({ path: join(out, `clip-${c}.png`) });
    if (/phone|text|drink/.test(c)) { // (a close look at what's in the hand)
      await pg.evaluate(({ i, c }) => { const P = window.__svgp.dbg.pitGarage, p = P.homeCrew.people[i], V = P.camera.position.constructor, o = (c === 'drink' ? p.cup : p.phone).getWorldPosition(new V()), a = p.yaw + 0.25;
        P.cine({ pos: new V(o.x + Math.sin(a) * 0.7, o.y + 0.1, o.z + Math.cos(a) * 0.7), at: o, fov: 50, shift: 0 }, 0); }, { i, c });
      await pg.waitForTimeout(200); await pg.screenshot({ path: join(out, `hand-${c}.png`) });
    }
  }
  await pg.evaluate(({ i }) => { const h = window.__svgp.dbg.pitGarage.homeCrew, p = h.people[i]; h.talk = h._talk; p.t = 0; }, { i });
  if (process.env.ONLY_CLIPS) process.exit(0);
  await pg.waitForTimeout(40000);
  const n = await pg.evaluate(() => window.__svgp.dbg.pitGarage.homeCrew.people.length);
  for (let k = 0; k < n; k++) {
    const s = await pg.evaluate(k => { const p = window.__svgp.dbg.pitGarage.homeCrew.people[k]; return `${p.role} ${p.ch.clip} at ${p.spot ? p.spot.st || p.spot.role : p.group ? 'talk' : '-'}`; }, k);
    console.log(k, s); await look(k, 2.3, 1.4); await pg.waitForTimeout(300); await pg.screenshot({ path: join(out, `crew-${k}.png`) });
  }
} finally { await b.close(); server.kill(); }
