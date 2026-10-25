// dev: the pit garage's tyre menu with a worn set, before and after rotating it   node .devtest/rotateshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), OUT = process.argv[2] || '/tmp';
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async () => { const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: 'rs964' };
    window.__svgp.startRace(t, { mode: 'practice', practiceTime: 1200, opponents: 2, car: window.__svgp.settings.car }, 'menu'); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 150000 });
  await pg.evaluate(() => { const ty = window.__svgp.sim.player.phys.tyre; ty.wf = 0.62; ty.wr = 0.81; });
  const click = (txt) => pg.evaluate((txt) => { const el = [...document.querySelectorAll('#s-pitgarage .menu-item, #s-pitgarage [class*="item"], #s-pitgarage button, #s-pitgarage li')].find(e => e.textContent.trim().startsWith(txt)); if (!el) return 'missing ' + txt; el.click(); return 'ok'; }, txt);
  console.log('tyres', await click('Tyres')); await pg.waitForTimeout(600);
  await pg.screenshot({ path: join(OUT, 'rot-1.png') });
  console.log('rotate', await click('Rotate')); await pg.waitForTimeout(2500);
  console.log('after', await pg.evaluate(() => { const ty = window.__svgp.sim.player.phys.tyre; return `wf ${ty.wf} wr ${ty.wr}`; }));
  console.log('tyres', await click('Tyres')); await pg.waitForTimeout(600);
  await pg.screenshot({ path: join(OUT, 'rot-2.png') });
} finally { await b.close(); server.kill(); }
