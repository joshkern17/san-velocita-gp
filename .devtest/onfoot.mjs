// dev: World Career on foot without asking: walking starts by itself (up from the desk when the career's loaded), you're
// back on your feet where you were after the car, and you walk in through the door after a race.
//   node .devtest/onfoot.mjs <outdir>
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
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
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
  const st = () => pg.evaluate(() => { const d = window.__svgp.dbg, w = d.walk, f = (v) => v ? v.toArray().map(x => +x.toFixed(2)) : null;
    return { screen: window.__svgp.screen, walking: w.active, act: w.act && w.act.kind + ':' + w.act.step, pos: f(w.pos), parked: !!d.pitGarage.parked, shot: d.pitGarage.shot, cls: document.getElementById('s-hub').className.replace('screen menu-screen active', '').trim() }; });
  for (let i = 1; i <= 10; i++) { await pg.waitForTimeout(500); const s = await st(); console.log('loaded +' + (i * 0.5) + 's', JSON.stringify(s)); if (i === 4 || i === 7) await pg.screenshot({ path: join(out, `foot-desk-${i}.png`) }); if (i > 3 && s.walking && !s.act) break; }
  for (let i = 0; i < 4 && await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(900); }
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active && !window.__svgp.dbg.walk.act, null, { timeout: 15000 });
  console.log('walking', JSON.stringify(await st()));
  // up to the car, Enter: the car view; Esc: back on your feet where you stood
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk, s = w.spots.find(x => x.key === 'car'), a = w.anchor(s); w.pos.set(a.x + 1.6, 0, a.z); w.push(); w.heading = Math.atan2(a.x - w.pos.x, a.z - w.pos.z); w.camYaw = w.heading; });
  await pg.waitForTimeout(400); const at = await st(); console.log('at the car', JSON.stringify(at));
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); console.log('car view', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'foot-car.png') });
  await pg.keyboard.press('Escape');
  for (let i = 1; i <= 6; i++) { await pg.waitForTimeout(500); const s = await st(); console.log('back +' + (i * 0.5) + 's', JSON.stringify(s)); if (s.walking) break; }
  // a race (any other screen), then home: in through the door
  await pg.evaluate(() => window.__svgp.show('s-round')); await pg.waitForTimeout(400);
  await pg.evaluate(() => window.__svgp.dbg.openHub());
  for (let i = 1; i <= 10; i++) { await pg.waitForTimeout(400); const s = await st(); console.log('home +' + (i * 0.4).toFixed(1) + 's', JSON.stringify(s)); if (i === 5) await pg.screenshot({ path: join(out, 'foot-door.png') }); if (i > 4 && s.walking && !s.act) break; }
} finally { await b.close(); server.kill(); }
