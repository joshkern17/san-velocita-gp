// dev: a World Career day on foot: the week bar while walking, the door (the day's away choices), the car's day of work
// (X / F), the sim rig, the calendar, Esc's pause menu. Screenshots to argv[2].   node .devtest/garageday.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  // (past the setup, as the ending preview does it: registered, the lottery claimed, a team taken over with its car; the
  // tools and the sim rig bought)
  await pg.evaluate(async () => { const d = window.__svgp.dbg, w = window.__svgp.world, WC = await import('/js/wcareer.js'); if (d.tsw && d.tsw.isOpen) d.tsw.close();
    const name = 'Test Driver', S = window.__svgp.settings;
    WC.registerTeam(w, { name, team: 'Driver Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
    WC.claimLottery(w, 'lump'); WC.setupPick(w, 'entry', 'takeover'); WC.setupPick(w, 'sponsor', 0); WC.setupPick(w, 'mate', w.setup.drivers[0]); WC.setupApply(w);
    w.livery = { ...S.car }; w.liveryDone = true; WC.setWhy(w, 'prove'); WC.setAmbition(w, WC.ambitionChoices(w)[1].t);
    const t = w.teams[w.player.team]; t.fac = { ...(t.fac || { base: 0 }), tools: 1, sim: 1 }; w.money.balance = Math.max(w.money.balance, 50000);
    if (w.car && w.car.parts) for (const k of Object.keys(w.car.parts).slice(0, 1)) { const P = w.car.parts[k]; if (P && typeof P === "object") P.cond = Math.min(P.cond ?? 1, 0.4); }   // (a worn part: a day's rebuild on offer)
    d.openHub(); });
  await pg.waitForFunction(() => /^home:.*sim/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const d = window.__svgp.dbg; if (window.__svgp.dbg.pitGarage.shot === 'seat') d.standUp(); }); await pg.waitForTimeout(1200);
  for (let i = 0; i < 4 && await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(900); } // (off The List, if the career opened on it)
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000 }); await pg.waitForTimeout(800);
  const st = () => pg.evaluate(() => { const d = window.__svgp.dbg, w = d.walk;
    return { spot: w.spot && w.spot.key, tags: [...document.querySelectorAll('#walk-tags:not([hidden]) .walk-tag:not(.gone)')].map(e => (e.classList.contains('open') ? '*' : '') + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)),
      week: !document.getElementById('hub-week').hidden, weekFull: document.getElementById('hub-week').classList.contains('full'), planner: d.dayPlan.isOpen, plan: d.dayPlan.isOpen ? d.dayPlan.opts.map(o => o.key).join(',') : null,
      menu: [...document.querySelectorAll('#m-hub .item')].filter(e => e.offsetParent).map(e => e.textContent.slice(0, 18)).join(' | '), cls: document.getElementById('s-hub').className }; });
  const go = (key) => pg.evaluate((key) => { const w = window.__svgp.dbg.walk, s = w.spots.find(x => x.key === key); if (!s) return 'no ' + key;
    const a = w.anchor(s), d = new w.pos.constructor(a.x - w.pos.x, 0, a.z - w.pos.z); const L = d.length(); d.normalize();
    w.pos.set(a.x - d.x * Math.min(L, 0.9), 0, a.z - d.z * Math.min(L, 0.9)); w.push(); w.heading = Math.atan2(a.x - w.pos.x, a.z - w.pos.z); w.camYaw = w.heading; return 'ok'; }, key);
  console.log('walking', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-0-walk.png') });
  console.log('to the door', await go('door')); await pg.waitForTimeout(500); console.log(JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-1-door.png') });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); console.log('door, Enter', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-2-planner.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500); console.log('planner, Esc', JSON.stringify(await st()));
  console.log('to the car', await go('car')); await pg.waitForTimeout(500); console.log(JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-3-car.png') });
  await pg.keyboard.press('KeyF'); await pg.waitForTimeout(1500); console.log('car, F', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-3b-carday.png') }); if (await pg.evaluate(() => window.__svgp.dbg.dayPlan.isOpen)) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500); }
  console.log('to the sim', await go('sim')); await pg.waitForTimeout(500); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); console.log('sim, Enter', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-4-sim.png') }); if (await pg.evaluate(() => window.__svgp.dbg.dayPlan.isOpen)) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500); }
  console.log('to the calendar', await go('calendar')); await pg.waitForTimeout(500); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600); console.log('calendar, Enter', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-5-calendar.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); console.log('Esc', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'day-6-pause.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); console.log('Esc again', JSON.stringify(await st()));
} finally { await b.close(); server.kill(); }
