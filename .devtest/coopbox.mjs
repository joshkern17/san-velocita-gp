// dev: co-op World Career at a race weekend: one box for the team, and the field out on its runs on both screens. Two
// copies over the real PeerJS link (needs the internet), qualifying at TRACK (Spa by default). Checks: the same box for
// both of you on both machines, the host's car on your model's side and the guest's across from it (both machines
// agree), the live session running on both (the guest's a follower), the host's AI out on a run shown on the guest's
// track where the host has it, and the partner's car stood in its side of the box while they're in the garage.
//   node .devtest/coopbox.mjs [save.txt (saves/storage/svgp.world.*)] [outdir]
import { spawn } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const S = join(ROOT, 'saves/storage'), file = process.argv[2] || join(S, readdirSync(S).filter(f => /^svgp\.world\.w/.test(f)).sort((a, b) => readFileSync(join(S, b)).length - readFileSync(join(S, a)).length)[0]);
const out = process.argv[3] || join(ROOT, '.devtest/out');
const save = JSON.parse(readFileSync(file, 'utf8'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const page = async (name, token) => {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } }), pg = await ctx.newPage();
  await pg.addInitScript((t) => { navigator.getGamepads = () => []; try { localStorage.setItem('svgp.coopToken', t); } catch (e) {} }, token);
  pg.on('pageerror', e => { console.log(name, 'PAGE ERROR', e.stack); fails++; });
  pg.on('console', m => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) console.log(name, 'console:', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  return pg;
};
try {
  const host = await page('host', 'hosttok'), guest = await page('guest', (save.coop && save.coop.token) || 'friendtok'); // (a save with a co-owner already: them)
  // the host: the career, with the friend in it already, and the room open
  const code = await host.evaluate(async (w) => {
    const d = window.__svgp.dbg; w.preview = false; d.playWorld(w);
    if (!w.coop) d.coopOp('coopJoin', { first: 'Sam', last: 'Rivera', number: 7, kind: 'car', token: 'friendtok' });
    await d.coopHost(); return d.coop && d.coop.code;
  }, save);
  ok(!!code, `room open: ${code}`);
  // the friend joins
  await guest.evaluate((c) => { const e = document.getElementById('on-code'); e.value = c; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, code);
  await guest.waitForFunction(() => window.__svgp.screen === 's-hub', null, { timeout: 60000, polling: 500 }).catch(() => {});
  console.log('  host:', await host.evaluate(() => { const c = window.__svgp.dbg.coop; return JSON.stringify({ peer: c && c.peer, name: c && c.name, wc: window.__svgp.dbg.coop && !!window.__svgp.world }); }), 'guest token', await guest.evaluate(() => localStorage.getItem('svgp.coopToken')), 'toasts', await guest.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(e => e.textContent).join(' | ')));
  console.log('  join status:', await guest.evaluate(() => [...document.querySelectorAll('#on-status, .on-status, #s-online .status')].map(e => e.textContent).join(' | ')));
  ok(await guest.evaluate(() => window.__svgp.screen) === 's-hub', 'the friend is in the garage: ' + await guest.evaluate(() => window.__svgp.screen));
  await guest.waitForTimeout(2000);
  await host.evaluate((T) => { const w = window.__svgp.world, S = w.series[w.player.series], R = S.cal[w.round]; if (R) R.name = T; w.opts.weekend = 'quali'; window.__svgp.dbg.startWorldRound(); }, process.env.TRACK || 'Spa-Francorchamps');
  for (const [n, pg] of [['host', host], ['guest', guest]]) {
    await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage' && window.__svgp.dbg.pitGarage.active, null, { timeout: 180000, polling: 500 }).catch(() => {});
    ok(await pg.evaluate(() => window.__svgp.screen) === 's-pitgarage', `${n} in the pit garage (${await pg.evaluate(() => window.__svgp.screen)})`);
  }
  await guest.waitForFunction(() => { const s = window.__svgp.sim; return s && s.live; }, null, { timeout: 30000, polling: 500 }).catch(() => {});
  const state = (pg) => pg.evaluate(() => { const s = window.__svgp.sim, L = s.pitLife, me = s.player, them = s.cars.find(c => c.remote && c.human);
    return { box: [s.boxSlot(me.teamIdx), them ? s.boxSlot(them.teamIdx) : null], side: [L.sideOf(me), them ? L.sideOf(them) : null], live: s.live ? { follow: !!s.live.follow, n: s.live.runners.length } : null,
      bay: window.__svgp.dbg.pitGarage.track && window.__svgp.dbg.pitGarage.track.side }; });
  const hs = await state(host), gs = await state(guest);
  console.log('  host', JSON.stringify(hs), '\n  guest', JSON.stringify(gs));
  ok(hs.box[0] === hs.box[1] && gs.box[0] === gs.box[1] && hs.box[0] === gs.box[0], `one box for the team: host sees ${hs.box}, guest sees ${gs.box}`);
  ok(hs.side[0] === 0 && hs.side[1] === 1 && gs.side[0] === 1 && gs.side[1] === 0 && hs.bay === 0 && gs.bay === 1, `sides agree: host's car near side, guest's across (host ${hs.side} bay ${hs.bay}, guest ${gs.side} bay ${gs.bay})`);
  ok(hs.live && !hs.live.follow && gs.live && gs.live.follow && hs.live.n === gs.live.n && hs.live.n > 0, `live session on both: host ${JSON.stringify(hs.live)}, guest ${JSON.stringify(gs.live)}`);
  // the partner's car in its side of the box, on each screen
  for (const [n, pg] of [['host', host], ['guest', guest]]) {
    const r = await pg.evaluate(() => { const s = window.__svgp.sim, c = s.cars.find(x => x.remote && x.human), p = s.pitLife.parkPose(c), g = c.model.group;
      return { ig: !!c.inGarage, vis: g.visible, off: p ? Math.hypot(g.position.x - p.at[0], g.position.z - p.at[2]) : null }; });
    ok(r.ig && r.vis && r.off != null && r.off < 0.2, `${n}: the partner's car stands in its side of the box (in garage ${r.ig}, shown ${r.vis}, ${r.off == null ? 'no pose' : r.off.toFixed(2) + ' m off'})`);
  }
  // the host's first three cars out now (rather than waiting out the quiet start)
  await host.evaluate(() => { const L = window.__svgp.sim.live; L.runners.slice(0, 3).forEach(R => { R.earliest = 0; const r = R.e.plan.find(x => !x.done); if (r) r.at = 0; }); });
  let seen = null;
  for (let k = 0; k < 40 && !(seen && seen.out.length); k++) {
    await host.waitForTimeout(3000);
    const hcars = await host.evaluate(() => window.__svgp.sim.live.runners.map(R => ({ k: R.car.key, ig: !!R.car.inGarage, x: R.car.phys.x, z: R.car.phys.z })));
    const gcars = await guest.evaluate(() => window.__svgp.sim.live.runners.map(R => ({ k: R.car.key, ig: !!R.car.inGarage, vis: R.car.model.group.visible, x: R.car.model.group.position.x, z: R.car.model.group.position.z })));
    const out = hcars.filter(h => !h.ig).map(h => { const g = gcars.find(x => x.k === h.k); return { k: h.k, g: g && !g.ig && g.vis, d: g ? Math.hypot(g.x - h.x, g.z - h.z) : null }; });
    seen = { out };
  }
  // (a moment for the guest to hear of it, then again once it's driving: the copy keeps up)
  const compare = async () => {
    const hcars = await host.evaluate(() => window.__svgp.sim.live.runners.map(R => ({ k: R.car.key, ig: !!R.car.inGarage, x: R.car.phys.x, z: R.car.phys.z, v: R.car.phys.speed || 0 })));
    const gcars = await guest.evaluate(() => window.__svgp.sim.live.runners.map(R => ({ k: R.car.key, ig: !!R.car.inGarage, vis: R.car.model.group.visible, x: R.car.model.group.position.x, z: R.car.model.group.position.z })));
    return hcars.filter(h => !h.ig).map(h => { const g = gcars.find(x => x.k === h.k); return { k: h.k, v: +h.v.toFixed(1), g: g && !g.ig && g.vis, d: g ? Math.hypot(g.x - h.x, g.z - h.z) : null }; });
  };
  await host.waitForTimeout(3000); seen.out = await compare();
  console.log('  just out:', JSON.stringify(seen.out.map(o => ({ ...o, d: o.d && +o.d.toFixed(1) }))));
  await host.waitForTimeout(12000); const driving = await compare();
  console.log('  driving:', JSON.stringify(driving.map(o => ({ ...o, d: o.d && +o.d.toFixed(1) }))));
  ok(driving.length > 0 && driving.some(o => o.v > 5) && driving.every(o => o.g && o.d < 25), `driving: the guest's copies keep up with the host's cars`);
  console.log('  out on a run:', JSON.stringify(seen.out.map(o => ({ ...o, d: o.d && +o.d.toFixed(1) }))));
  ok(seen.out.length > 0 && seen.out.every(o => o.g && o.d < 25), `the host's cars out on a run are out on the guest's track too, near where the host has them`);
  for (const [n, pg] of [['host', host], ['guest', guest]]) await pg.screenshot({ path: join(out, `coopbox-${n}.png`) });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
