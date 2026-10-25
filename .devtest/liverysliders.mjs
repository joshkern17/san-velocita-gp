// dev: the designer's Place mode sliders: they follow the decal, a drag moves it, Drop / Put Back.
// node .devtest/liverysliders.mjs [shotdir]  (run via .devtest/guard.sh)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 9600 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 820 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.open.garage());
  await pg.waitForFunction(() => window.__svgp.screen === 's-garage', null, { timeout: 30000 });
  await pg.waitForTimeout(1200);
  const rows = await pg.$$eval('#m-garage .item', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  console.log(' ', rows.join(' | '));
  await pg.evaluate(() => { const e = [...document.querySelectorAll('#m-garage .item')].find(e => /design|paint|livery designer/i.test(e.innerText) && !/saved/i.test(e.innerText)); e && e.click(); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-livery', null, { timeout: 10000 });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => document.querySelector('#lv-tabs span[data-k="decals"]').click()); await pg.waitForTimeout(300);
  // add a text decal, then Move It
  await pg.evaluate(() => { const e = [...document.querySelectorAll('#m-livery .item')].find(e => /Add A Decal/i.test(e.innerText)); e.click(); }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const e = [...document.querySelectorAll('#m-livery .item')].find(e => /^Text/i.test(e.innerText.trim())); e.click(); }); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const e = [...document.querySelectorAll('#m-livery .item')].find(e => /^Move It/i.test(e.innerText.trim())); e.click(); }); await pg.waitForTimeout(600);
  ok(await pg.$eval('#lv-sliders', e => getComputedStyle(e).display === 'block' && e.querySelectorAll('input[type=range]').length === 5), 'sliders shown in Place mode');
  const dec = () => pg.evaluate(() => { const c = window.__svgp.settings.car; return c.decals[c.decals.length - 1]; });
  const d0 = await dec();
  await pg.screenshot({ path: join(out, 'lv-sliders.png') });
  // drag Left / Right and Rotation
  for (const [k, f] of [['x', 0.85], ['rot', 0.75]]) {
    const r = await pg.$eval(`#lv-sliders input[data-k="${k}"]`, e => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; });
    await pg.mouse.click(r[0] + r[2] * f, r[1] + r[3] / 2); await pg.waitForTimeout(200);
  }
  const d1 = await dec(); console.log('  x', d0.x, '→', d1.x, ' rot', d0.rot, '→', d1.rot);
  ok(d1.x > d0.x && d1.rot > 40, 'slider drags move and turn the decal');
  ok(await pg.evaluate(() => document.activeElement.tagName !== 'INPUT'), 'slider lets go of focus (pad / keys work again)');
  // the stick's way (keys): the readout follows
  const before = await pg.$eval('#lv-sliders input[data-k="x"]', e => +e.value);
  await pg.keyboard.down('KeyA'); await pg.waitForTimeout(500); await pg.keyboard.up('KeyA'); await pg.waitForTimeout(200);
  const after = await pg.$eval('#lv-sliders input[data-k="x"]', e => +e.value);
  ok(after < before && Math.abs(after - (await dec()).x) <= 0.005, 'slider follows the keys');
  await pg.screenshot({ path: join(out, 'lv-sliders2.png') });
  await pg.click('#lv-sliders button[data-a="back"]'); await pg.waitForTimeout(300);
  const d2 = await dec(); ok(d2.x === d0.x && (d2.rot || 0) === (d0.rot || 0) && !(await pg.evaluate(() => document.querySelector('#s-livery').classList.contains('placing'))), 'Put Back restores it and leaves Place mode');
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
