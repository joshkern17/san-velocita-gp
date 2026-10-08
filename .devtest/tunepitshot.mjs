// dev: Tuning from the pit garage (a practice session): the Tuning row, the screen over the box, dragging round the
// car, back to the garage   node .devtest/tunepitshot.mjs <outdir> [car]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.', CAR = process.argv[3] || 'm1procar';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (c) => { const S = window.__svgp.settings; S.car = { ...S.car, chassis: c };
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'practice', practiceTime: 900, opponents: 5, car: S.car, pick: false }, 'menu'); }, CAR);
  await pg.waitForFunction(() => document.querySelector('#s-pitgarage.on, #s-pitgarage.show, #s-pitgarage[style*="block"]') || window.__svgp.screen === 's-pitgarage', null, { timeout: 240000 }).catch(e => console.log('wait', e.message));
  await pg.waitForTimeout(2500);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await pg.keyboard.press(k); await pg.waitForTimeout(150); } };
  for (let i = 0; i < 12; i++) { const l = await pg.evaluate(() => document.querySelector('#m-pitgarage .item.sel .lbl')?.textContent || ''); if (/tuning/i.test(l)) break; await key('ArrowDown'); }
  await pg.screenshot({ path: join(OUT, 'pit-menu.png') });
  await key('Enter'); await pg.waitForTimeout(1500); await pg.screenshot({ path: join(OUT, 'pit-tuning.png') }); console.log('shot pit tuning');
  await pg.mouse.move(1000, 500); await pg.mouse.down(); await pg.mouse.move(800, 470, { steps: 10 }); await pg.mouse.up(); await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(OUT, 'pit-tuning-drag.png') }); console.log('shot pit drag');
  await key('Escape'); await pg.waitForTimeout(1200); await pg.screenshot({ path: join(OUT, 'pit-back.png') }); console.log('shot back');
} finally { await b.close(); server.kill(); }
