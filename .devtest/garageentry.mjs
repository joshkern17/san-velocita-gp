// dev: coming into your garage (back from a race): every frame, whether the fade's still up, which room shows, whether
// the menu shows, how long the frame took. Seen before the garage is ready, or a long frame once it's showing, is a fail.
//   node .devtest/garageentry.mjs <outdir>
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
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => window.__svgp.show('s-round')); await pg.waitForTimeout(500);
  await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage; window.__fr = []; let last = performance.now();
    const f = (t) => { const fade = document.getElementById('fade'), op = +getComputedStyle(fade).opacity, menu = +getComputedStyle(document.querySelector('#s-hub .hub-left')).opacity;
      window.__fr.push({ dt: Math.round(t - last), fade: +op.toFixed(2), room: String(P.custom || P.roomWant || ''), menu: +menu.toFixed(2), walk: window.__svgp.dbg.walk.active, scr: window.__svgp.screen }); last = t; if (window.__fr.length < 400) requestAnimationFrame(f); };
    requestAnimationFrame(f); window.__svgp.dbg.openHub(); });
  await pg.waitForTimeout(6000);
  console.log(await pg.evaluate(() => { const F = window.__fr, seen = F.filter(f => f.fade < 0.95 && f.scr === 's-hub');
    const first = seen[0], wrongRoom = seen.filter(f => !/^home:/.test(f.room)).length, menu = seen.filter(f => f.menu > 0.05).length;
    const long = seen.map((f, i) => [f.dt, i, f.fade]).sort((a, b) => b[0] - a[0]).slice(0, 4), all = F.map(f => f.dt).sort((a, b) => b - a).slice(0, 4);
    return JSON.stringify({ frames: F.length, firstSeen: first, wrongRoomSeen: wrongRoom, menuSeen: menu, longestSeenFrames: long, longestBehindFade: all }); }));
} finally { await b.close(); server.kill(); }
