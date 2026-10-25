// dev: screenshot the World Career setup on Race Distance, and the circuit picker   node .devtest/distshot.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => __svgp.open.career()); await pg.waitForTimeout(1200);
  for (let i = 0; i < 12; i++) {
    const t = await pg.evaluate(() => document.querySelector('#s-career .item.sel .lbl')?.textContent || '');
    if (/Race Distance/.test(t)) break;
    await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(200);
  }
  await pg.waitForTimeout(500); await pg.screenshot({ path: join(OUT, 'dist.png') }); console.log('shot dist');
  await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(500); await pg.screenshot({ path: join(OUT, 'dist2.png') }); console.log('shot dist2');
  for (let i = 0; i < 6; i++) {
    const t = await pg.evaluate(() => document.querySelector('#s-career .item.sel .lbl')?.textContent || '');
    if (/Circuits/.test(t)) break;
    await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(200);
  }
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(3500); await pg.screenshot({ path: join(OUT, 'pick.png') }); console.log('shot pick');
} finally { await b.close(); server.kill(); }
