// dev: the computer's taskbar shows your balance in every app and website (and updates when you spend).
// Screenshots to argv[2].   node .devtest/pcbalance.mjs <outdir>
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
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.sitDown('team'); }); await pg.waitForTimeout(4000);
  const tray = () => pg.evaluate(() => { const e = document.querySelector('.pc-task .pc-bal'); return e ? { text: e.textContent, vis: e.getBoundingClientRect().width > 0, bal: window.__svgp.world.money.balance } : null; });
  const money$ = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  for (const app of ['team', 'parts', 'classifieds', 'bank', 'mail']) {
    await pg.evaluate((a) => { const pc = window.__svgp.pc; pc.launch(a); }, app); await pg.waitForTimeout(500);
    const t = await tray(); check(t && t.vis && t.text === money$(t.bal), `${app}: tray shows ${t && t.text} (balance ${t && t.bal})`);
    await pg.screenshot({ path: join(out, `pcbal-${app}.png`) });
  }
  // spend: the tray follows
  const before = await tray();
  await pg.evaluate(async () => { const WC = await import('/js/wcareer.js'), w = window.__svgp.world, pc = window.__svgp.pc; pc.launch('parts'); WC.buyFit(w, WC.catalogue(w)[0]); pc.render(); });
  await pg.waitForTimeout(300); const after = await tray();
  check(after.bal < before.bal && after.text === money$(after.bal), `after buying a part: ${before.text} -> ${after.text}`);
  await pg.screenshot({ path: join(out, 'pcbal-spent.png') });
  await pg.evaluate(() => { window.__svgp.world.money.balance = -4200; window.__svgp.pc.render(); }); await pg.waitForTimeout(200);
  check(await pg.evaluate(() => document.querySelector('.pc-task .pc-bal').classList.contains('neg')), 'overdrawn: the tray goes red');
  await pg.locator('.pc-task').screenshot({ path: join(out, 'pcbal-neg-task.png') });
  check(!frameErrs, `no errors while running (${frameErrs})`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
