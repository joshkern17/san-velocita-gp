// dev: Main Menu > Home Garage (the World Career garage previewed): the menu, then a few setups and looks.
// Screenshots to argv[2].   node .devtest/homeview.mjs <outdir>
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
  // from the main menu, as a player would
  const ok = await pg.evaluate(() => { const el = [...document.querySelectorAll('#s-main .item')].find(e => /Home Garage/.test(e.textContent)); if (el) el.click(); return !!el; });
  if (!ok) throw new Error('no Home Garage on the main menu');
  await pg.waitForFunction(() => window.__svgp.screen === 's-homeview' && /^home:/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(2500);
  const st = () => pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; return { room: P.custom, shell: k && k.shell, stations: k && Object.keys(k.stations), car2: !!(P.car2 && P.car2.group.parent),
    menu: [...document.querySelectorAll('#m-homeview .item')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ') }; });
  console.log('open:', JSON.stringify(await st()));
  await pg.screenshot({ path: join(out, 'hv-1-open.png') });
  const step = async (o, name) => { await pg.evaluate((o) => window.__svgp.dbg.homeView(o), o); await pg.waitForTimeout(2600); console.log(name + ':', JSON.stringify(await st())); await pg.screenshot({ path: join(out, `hv-${name}.png`) }); };
  await step({ fac: { tools: 1, sim: 1 }, look: 'room' }, '2-bought');
  await step({ look: 'tools' }, '3-look-tools');
  await step({ look: 'sim' }, '4-look-sim');
  await step({ look: 'car2' }, '5-look-car2');
  await step({ premises: 'unit', fac: { tools: 1, sim: 1, dyno: 1 }, car2: false, look: 'room' }, '6-unit');
  // back to the main menu
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(800);
  console.log('after back:', await pg.evaluate(() => window.__svgp.screen));
} finally { await b.close(); server.kill(); }
