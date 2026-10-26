// dev: a viewing in co-op (WC.viewStart): a fresh career, the friend joins over the offline stand-in for PeerJS
// (.devtest/loopnet.mjs: no internet, connects at once), both walking; the host books a viewing of the industrial unit
// and both of you are there (the unit, empty, no car, the agent, each sees the other); the friend leaves it and both
// are home again. Screenshots to argv[2].   .devtest/guard.sh -m 6000 node .devtest/coopview.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loopNet } from './loopnet.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || join(ROOT, '.devtest/out');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
try {
  const ctxs = await Promise.all([0, 1].map(() => b.newContext({ viewport: { width: 1280, height: 720 } })));
  const [host, guest] = await Promise.all(ctxs.map(c => c.newPage()));
  await loopNet([host, guest]);
  for (const [n, pg, tok] of [['host', host, 'hosttok'], ['guest', guest, 'friendtok']]) {
    await pg.addInitScript((t) => { navigator.getGamepads = () => []; try { localStorage.setItem('svgp.coopToken', t); } catch (e) {} }, tok);
    pg.on('pageerror', e => { console.log(n, 'PAGE ERROR', e.stack.split('\n').slice(0, 4).join(' | ')); fails++; });
  }
  await Promise.all([host, guest].map(async pg => { await pg.goto(`http://127.0.0.1:${PORT}/index.html`); await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); }));
  // the host: a fresh career, set up, through the Season Launch (Enter on each answer), then the friend's in it and the room's open
  await host.evaluate(() => window.__svgp.dbg.startWorld(false));
  await host.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  await host.evaluate(async () => { const w = window.__svgp.world, WC = await import('/js/wcareer.js'), S = window.__svgp.settings, d = window.__svgp.dbg;
    WC.registerTeam(w, { name: 'Test Driver', team: 'Driver Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
    WC.claimLottery(w, 'lump'); if (d.tsw && d.tsw.isOpen) d.tsw.close();
    WC.setupPick(w, 'entry', 'fresh'); WC.setupPick(w, 'car', w.ads.find(x => x.tip).id); WC.setupPick(w, 'sponsor', 0); WC.setupPick(w, 'mate', w.setup.drivers[1]);
    d.standUp(); d.tsw.src.apply(); });
  await host.waitForTimeout(3000);
  const pressOn = () => host.evaluate(() => document.getElementById('s-hub').classList.contains('wizard'));
  for (let i = 0; i < 80 && await pressOn(); i++) { await host.keyboard.press('Enter'); await host.waitForTimeout(600); }
  ok(!(await pressOn()), `host through the Season Launch (${at()})`);
  // (The List asks why first, on a new career: an answer, and back)
  await host.keyboard.press('Enter'); await host.waitForTimeout(1500); await host.keyboard.press('Escape'); await host.waitForTimeout(1000);
  const code = await host.evaluate(async () => { const d = window.__svgp.dbg; d.coopOp('coopJoin', { first: 'Sam', last: 'Rivera', number: 7, kind: 'car', token: 'friendtok' }); await d.coopHost(); return d.coop && d.coop.code; });
  ok(!!code, `room open: ${code} (${at()})`);
  await guest.evaluate((c) => { const e = document.getElementById('on-code'); e.value = c; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, code);
  await guest.waitForFunction(() => window.__svgp.screen === 's-hub', null, { timeout: 60000, polling: 300 }).catch(() => {});
  ok(await guest.evaluate(() => window.__svgp.screen) === 's-hub', `the friend's in the garage (${at()})`);
  const walking = async () => { for (const [n, pg] of [['host', host], ['guest', guest]]) {
    await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 30000, polling: 300 }).catch(() => {});
    if (!await pg.evaluate(() => window.__svgp.dbg.walk.active)) { await pg.evaluate(() => window.__svgp.dbg.startWalk()); await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000, polling: 300 }).catch(() => {}); }
  } };
  await walking();
  const state = (pg) => pg.evaluate(() => { const d = window.__svgp.dbg, P = d.pitGarage, w = window.__svgp.world;
    return { room: P.custom || '', viewing: w.viewing ? w.viewing.base : null, walk: d.walk.active, car: !!(P.car && P.car.group.visible), crew: P.homeCrew ? P.homeCrew.list.map(p => p.key) : [],
      friend: !!(P.friend && P.friend.ch && P.friend.ch.object.visible), spots: d.walk.spots ? d.walk.spots.map(s => s.key) : [], next: document.getElementById('walk-next')?.innerText.slice(0, 90) }; });
  const h0 = await state(host), g0 = await state(guest);
  ok(h0.walk && g0.walk && /lockup/.test(h0.room) && /lockup/.test(g0.room), `both walking at home (host ${h0.room}, guest ${g0.room})`);
  // the host books the viewing: both go
  await host.evaluate(() => window.__svgp.dbg.startViewing(1));
  await host.waitForTimeout(1500); await walking(); await host.waitForTimeout(3500);
  const h1 = await state(host), g1 = await state(guest);
  console.log('  host', JSON.stringify(h1)); console.log('  guest', JSON.stringify(g1));
  for (const [n, s] of [['host', h1], ['guest', g1]]) {
    ok(s.viewing === 1 && /home:unit/.test(s.room), `${n} at the viewing, in the unit (${s.room})`);
    ok(s.walk && !s.car && s.crew.join() === 'agent', `${n} on their feet, no car, just the agent (car ${s.car}, crew ${s.crew.join(',')})`);
    ok(s.spots.join() === 'door', `${n}: the only spot is the way out (${s.spots.join(',')})`);
    ok(s.friend, `${n} sees the other one there`);
  }
  await host.screenshot({ path: join(out, 'view-host.png') }); await guest.screenshot({ path: join(out, 'view-guest.png') });
  // the friend's had enough: both home
  await guest.evaluate(() => window.__svgp.dbg.endViewing());
  await host.waitForTimeout(1500); await walking(); await host.waitForTimeout(2500);
  const h2 = await state(host), g2 = await state(guest);
  for (const [n, s] of [['host', h2], ['guest', g2]]) ok(s.viewing === null && /lockup/.test(s.room) && s.car && s.walk, `${n} home again (${s.room}, car ${s.car}, walking ${s.walk})`);
  // and the factory, two rungs up: you can look at what you can't afford
  await host.evaluate(() => window.__svgp.dbg.startViewing(3));
  await host.waitForTimeout(1500); await walking(); await host.waitForTimeout(4000);
  for (const [n, pg] of [['host', host], ['guest', guest]]) { const s = await state(pg); ok(s.viewing === 3 && /home:factory/.test(s.room) && s.walk && s.friend, `${n} at the factory (${s.room}, friend ${s.friend})`); }
  await host.screenshot({ path: join(out, 'view-factory.png') });
  await host.evaluate(() => window.__svgp.dbg.endViewing()); await host.waitForTimeout(3000);
  ok(/lockup/.test((await state(host)).room), 'host home from the factory');
  console.log(`  took ${at()}`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
