// dev: what's on screen while walking round your career's garage: the status line (team first), the money, the next
// line, the week (slim walking, whole stood still) and the nudged markers. Screenshots to argv[2].
//   node .devtest/walkhud.mjs <outdir>
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
  for (let i = 0; i < 4 && await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(900); }
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active && !window.__svgp.dbg.walk.act, null, { timeout: 15000 });
  const st = () => pg.evaluate(() => ({ cls: document.getElementById('s-hub').className.replace('screen menu-screen active', '').trim(), hud: document.getElementById('walk-hud').textContent.replace(/\s+/g, ' ').trim().slice(0, 160), next: document.getElementById('walk-next').textContent.trim(),
    tags: [...document.querySelectorAll('#walk-tags:not([hidden]) .walk-tag:not(.gone)')].map(e => (e.classList.contains('bad') ? '!' : e.classList.contains('want') ? '~' : '') + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)) }));
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(700); console.log('moving', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'hud-moving.png') }); await pg.keyboard.up('KeyW');
  await pg.waitForTimeout(2200); console.log('still', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'hud-still.png') });
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk, s = w.spots.find(x => x.key === 'computer'), a = s.at; w.pos.set(a.x + 1.0, 0, a.z + 0.3); w.push(); w.heading = Math.atan2(a.x - w.pos.x, a.z - w.pos.z); w.camYaw = w.heading; });
  await pg.waitForTimeout(600); console.log('at the computer', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'hud-computer.png') });
} finally { await b.close(); server.kill(); }
