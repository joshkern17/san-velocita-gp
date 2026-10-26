// dev: a guest drive (WC.guestOffer): a fresh career, a podium's invitation from the rung above, yes by email, the day
// in the planner, their car at their circuit (the test day's mode), handed back: their email, the Wire. Screenshots
// to argv[2].   .devtest/guard.sh node .devtest/guestdrive.mjs <outdir>
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
let fails = 0; const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.stack); fails++; });
  let frameErrs = 0; pg.on('console', m => { if (/launch set|launch/i.test(m.text()) && m.type() === 'warning') console.log('WARN', m.text().slice(0, 400)); if (m.type() === 'error' && /^frame/.test(m.text()) && frameErrs++ < 1) m.args()[1]?.evaluate(e => e.stack).then(s => console.log('FRAME ERROR (once):', s.split('\n').slice(0, 5).join(' | '))).catch(() => {}); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  await pg.evaluate(async () => { const w = window.__svgp.world, WC = await import('/js/wcareer.js'), S = window.__svgp.settings, d = window.__svgp.dbg;
    WC.registerTeam(w, { name: 'Test Driver', team: 'Driver Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
    WC.claimLottery(w, 'lump'); if (d.tsw && d.tsw.isOpen) d.tsw.close();
    WC.setupPick(w, 'entry', 'fresh'); WC.setupPick(w, 'car', w.ads.find(x => x.tip).id); WC.setupPick(w, 'sponsor', 0); WC.setupPick(w, 'mate', w.setup.drivers[1]);
    d.standUp(); d.tsw.src.apply(); });
  await pg.waitForTimeout(3000);
  // (the Season Launch press day opens after the setup: through it, as a player would, Enter on each answer)
  const pressOn = () => pg.evaluate(() => document.getElementById('s-hub').classList.contains('wizard'));
  for (let i = 0; i < 80 && await pressOn(); i++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(700); }
  check(!(await pressOn()), 'through the Season Launch');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500); // (The List's why)
  const o = await pg.evaluate(async () => { const WC = await import('/js/wcareer.js'), w = window.__svgp.world; WC.guestOffer(w, { pos: 2, dnf: false }); if (w.guestOffer) w.guestOffer.r = w.round; return { o: w.guestOffer, subj: w.mail[0]?.subj, choices: w.mail[0]?.choices }; });
  check(o.o && o.subj === 'A test day' && o.choices?.length === 2, `the invitation: ${o.o && `${o.o.team}'s ${o.o.car} at ${o.o.track}`}`);
  const r = await pg.evaluate(async () => { const WC = await import('/js/wcareer.js'); return WC.answerGuest(window.__svgp.world, 'yes'); });
  check(r === 'booked', `said yes: ${r}`);
  const ch = await pg.evaluate(() => window.__svgp.dbg.dayPlanSrc.choices().map(c => c.key));
  check(ch.includes('guest'), `it's in the day planner (${ch.join(',')})`);
  await pg.evaluate(() => window.__svgp.dbg.dayPlanSrc.choices().find(c => c.key === 'guest').run());
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.mode === 'test' && window.__svgp.sim.player, null, { timeout: 60000, polling: 300 }).catch(() => {});
  const car = await pg.evaluate(() => { const s = window.__svgp.sim; return s && { mode: s.mode, track: s.track.name, id: s.player.carId, chassis: s.player.cfg?.chassis }; });
  console.log('  on track:', JSON.stringify(car), JSON.stringify(o.o && { chassis: o.o.chassis, track: o.o.track }));
  check(car && car.mode === 'test' && car.track === o.o.track && String(car.id).includes(o.o.chassis), `driving their car at their circuit`);
  await pg.waitForTimeout(5000); await pg.screenshot({ path: join(out, 'guest-drive.png') });
  await pg.evaluate(() => window.__svgp.dbg.guestFinish()); await pg.waitForTimeout(1500);
  const after = await pg.evaluate(() => ({ screen: window.__svgp.screen, mail: window.__svgp.world.mail[0]?.subj, st: window.__svgp.world.guestDrive?.status, day: window.__svgp.world.week?.used }));
  check(after.screen === 's-round' && after.mail === 'Thanks for coming down' && after.st === 'done', `handed back: ${JSON.stringify(after)}`);
  await pg.screenshot({ path: join(out, 'guest-done.png') });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
