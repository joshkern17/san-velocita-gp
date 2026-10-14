// dev: Team Setup clicked through like a player (a new club career): Next on each step's first pick, then Start the
// season. Prints each step, any toast, and whether the season started.   node .devtest/setupclick.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  await pg.evaluate(async () => { const w = window.__svgp.world, WC = await import('/js/wcareer.js'), S = window.__svgp.settings;
    WC.registerTeam(w, { name: 'Test Driver', team: 'Driver Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
    WC.claimLottery(w, 'lump'); window.__svgp.dbg.openTeamSetup(); });
  await pg.waitForTimeout(1500);
  for (let k = 0; k < 9; k++) {
    const st = await pg.evaluate(() => { const t = window.__svgp.dbg.tsw; return t && t.isOpen ? { step: t.step, sel: t.sel, n: t.options().length, next: document.querySelector('.tsw-next')?.textContent, money: window.__svgp.world.money.balance } : null; });
    console.log(k, JSON.stringify(st));
    if (!st) break;
    await pg.screenshot({ path: join(out, `setup_${k}_${st.step}.png`) });
    const btn = await pg.$('.tsw-next'); const box = btn && await btn.boundingBox();
    const hit = box && await pg.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.className || e.tagName) + ' ' + (e.textContent || '').slice(0, 30) : null; }, [box.x + box.width / 2, box.y + box.height / 2]);
    console.log('   button at', box && [Math.round(box.x), Math.round(box.y)], 'top element there:', hit);
    await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await pg.waitForTimeout(st.step === 'ready' ? 6000 : 900);
    const toast = await pg.evaluate(() => [...document.querySelectorAll('.toast, #toast, .pc-toast')].map(e => e.textContent).filter(Boolean).join(' | '));
    if (toast) console.log('   toast:', toast);
  }
  console.log('after:', await pg.evaluate(() => { const w = window.__svgp.world, t = window.__svgp.dbg.tsw; return { open: !!(t && t.isOpen), setup: !!w.setup, done: !!(w.setup && w.setup.done), car: !!w.car, screen: window.__svgp.screen }; }));
} finally { await b.close(); server.kill(); }
