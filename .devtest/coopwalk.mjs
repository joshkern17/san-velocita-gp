// dev: co-op World Career, two copies in one garage (js/coopwalk.js): the host opens a room on a career save with the
// friend already its co-owner, the friend joins (the real PeerJS link: needs the internet), and both walk about the
// host's premises. Checks each sees the other where they are, no stand-in double of the friend, and whose car is whose.
//   node .devtest/coopwalk.mjs [save.txt (saves/storage/svgp.world.*)] [outdir]
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
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
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
  // both on their feet (walking starts by itself once the garage is quiet)
  for (const [n, pg] of [['host', host], ['guest', guest]]) {
    await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 30000, polling: 500 }).catch(() => {});
    if (!await pg.evaluate(() => window.__svgp.dbg.walk.active)) await pg.evaluate(() => window.__svgp.dbg.startWalk());
    await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 30000, polling: 500 }).catch(() => {});
    ok(await pg.evaluate(() => window.__svgp.dbg.walk.active), `${n} walking`);
  }
  // the friend walks off a few metres
  await guest.evaluate(() => { const w = window.__svgp.dbg.walk; w.pos.x += 1.5; w.pos.z -= 1.0; });
  await host.waitForTimeout(2500);
  const seen = async (pg, other) => {
    const o = await other.evaluate(() => { const w = window.__svgp.dbg.walk; return [w.pos.x, w.pos.y, w.pos.z]; });
    const f = await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, f = P.friend; return f && f.ch && f.ch.object.visible ? [f.ch.object.position.x, f.ch.object.position.y, f.ch.object.position.z, f.ch.clip] : null; });
    return { o, f, d: f ? Math.hypot(o[0] - f[0], o[2] - f[2]) : null };
  };
  const a = await seen(host, guest), c = await seen(guest, host);
  ok(a.f && a.d < 0.4, `the host sees the friend where they are (${a.d && a.d.toFixed(2)} m off, ${a.f && a.f[3]})`);
  ok(c.f && c.d < 0.4, `the friend sees the host where they are (${c.d && c.d.toFixed(2)} m off, ${c.f && c.f[3]})`);
  // no stand-in: the friend isn't also an NPC driver in the room
  for (const [n, pg] of [['host', host], ['guest', guest]]) {
    const r = await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, h = P.homeCrew; return { crew: h ? h.list.map(p => p.role) : [], people: (P.people || []).length }; });
    ok(!r.crew.includes('driver') && r.people === 0, `${n}: no stand-in for the friend (crew ${r.crew.join(',')}, people ${r.people})`);
  }
  // whose car is whose: the host's spots have car one, the friend's car two (as "car"), neither the other's
  const spots = async (pg) => pg.evaluate(() => { const w = window.__svgp.dbg.walk, P = window.__svgp.dbg.pitGarage;
    const near = (x, bx) => { if (!x || !x.group || !bx) return false; const p = x.group.getWorldPosition(x.group.position.clone()); return p.x > bx.min.x && p.x < bx.max.x && p.z > bx.min.z && p.z < bx.max.z; };
    return w.spots.filter(s => /^car/.test(s.key)).map(s => `${s.key}:${near(P.car, s.box) ? 'car1' : near(P.car2, s.box) ? 'car2' : '?'}`).join(' '); });
  const hs = await spots(host), gs = await spots(guest);
  ok(hs === 'car:car1', `host's car spots: ${hs}`);
  ok(gs === 'car:car2', `friend's car spots: ${gs}`);
  // the friend's car: a day on it, with the host first
  const ch = await guest.evaluate(() => { const d = window.__svgp.dbg; return null; });
  // a race weekend online: qualifying, both of you in the pit garage, then out walking the pit lane
  if (process.env.PIT !== '0') {
    await host.evaluate((T) => { const w = window.__svgp.world, S = w.series[w.player.series], R = S.cal[w.round]; if (R) R.name = T; w.opts.weekend = 'quali'; /* (a circuit with a pit lane and garages) */ window.__svgp.dbg.startWorldRound(); }, process.env.TRACK || 'Spa-Francorchamps');
    for (const [n, pg] of [['host', host], ['guest', guest]]) {
      await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage' && window.__svgp.dbg.pitGarage.active, null, { timeout: 180000, polling: 500 }).catch(() => {});
      ok(await pg.evaluate(() => window.__svgp.screen) === 's-pitgarage', `${n} in the pit garage (${await pg.evaluate(() => window.__svgp.screen)})`);
    }
    await host.waitForTimeout(3000);
    for (const [n, pg] of [['host', host], ['guest', guest]]) {
      console.log('  ', n, await pg.evaluate(() => { const d = window.__svgp.dbg, P = d.pitGarage, sm = window.__svgp.sim; return JSON.stringify({ tname: sm && sm.track.name, open: sm && sm.T.open, pit: !!(sm && sm.pit), ref: !!(sm && sm.track.refModel), life: !!(sm && sm.pitLife), mine: !!(sm && sm.pitLife && sm.pitLife.mine), boxes: sm && sm.pitLife && sm.pitLife.boxes.filter(b => b.mine).length, net: !!(sm && sm.net), track: !!P.track, walk: d.walk.active, mode: P.mode, items: [...document.querySelectorAll('#s-pitgarage .menu-item, #s-pitgarage li')].map(e => e.textContent.trim().slice(0, 24)).slice(0, 12) }); }));
      await pg.evaluate(() => window.__svgp.dbg.startPitWalk());
      await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 30000, polling: 500 }).catch(() => {});
      ok(await pg.evaluate(() => window.__svgp.dbg.walk.active), `${n} walking the pit lane`);
    }
    await host.waitForTimeout(2500);
    const wpos = (pg) => pg.evaluate(() => { const w = window.__svgp.dbg.walk, o = w.me.object.getWorldPosition(w.me.object.position.clone()); return [o.x, o.y, o.z]; });
    const fpos = (pg) => pg.evaluate(() => { const f = window.__svgp.dbg.pitGarage.friend; if (!f.ch || !f.ch.object.visible || !f.ch.object.parent) return null; const o = f.ch.object.getWorldPosition(f.ch.object.position.clone()); return [o.x, o.y, o.z, f.ch.clip]; });
    for (const [n, pg, other] of [['host', host, guest], ['guest', guest, host]]) {
      const o = await wpos(other), f = await fpos(pg), d = f ? Math.hypot(o[0] - f[0], o[2] - f[2]) : null;
      ok(f && d < 0.5, `pit lane: the ${n} sees the other where they are (${d == null ? 'not shown' : d.toFixed(2) + ' m off'}; they're at ${o.map(v => v.toFixed(1)).join(',')})`);
    }
    for (const [n, pg] of [['host', host], ['guest', guest]]) await pg.screenshot({ path: join(out, `coop-pit-${n}.png`) });
  }
  // shots: each sees the other
  for (const [n, pg] of [['host', host], ['guest', guest]]) await pg.screenshot({ path: join(out, `coop-${n}.png`) });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
