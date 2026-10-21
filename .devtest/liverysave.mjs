// dev: team liveries in the Garage + Designer: an old save upgraded, Save This Livery / Rename typed, New Livery into
// the designer, an SVG pasted as a decal. node .devtest/liverysave.mjs [shotdir]  (run via .devtest/guard.sh)
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
  await pg.addInitScript(() => { navigator.getGamepads = () => []; if (!sessionStorage.seeded) { sessionStorage.seeded = 1;
    localStorage.setItem('svgp.teams', JSON.stringify([{ name: 'OLD GULF', car: { chassis: 'm1procar', teamName: 'OLD GULF', number: 7, sponsor: 'VOLTA', main: 0x88bbee, accent: 0xf07a1a, third: 0x14306a, pattern: 'stripe', decals: [] }, saved: 5 }])); } });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.open.garage());
  await pg.waitForFunction(() => window.__svgp.screen === 's-garage', null, { timeout: 30000 });
  await pg.waitForTimeout(1500);
  const items = (id) => pg.$$eval(`#${id} .item`, els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  const click = async (id, re) => { const hit = await pg.evaluate(([id, re]) => { const e = [...document.querySelectorAll(`#${id} .item`)].find(e => new RegExp(re, 'i').test(e.innerText)); if (e) e.click(); return !!e; }, [id, re]); await pg.waitForTimeout(300); if (!hit) console.log('  (no row', re, ')'); return hit; };
  const type = async (text) => { await pg.waitForSelector('.lv-type', { timeout: 3000 }); await pg.fill('.lv-type', text); await pg.press('.lv-type', 'Enter'); await pg.waitForTimeout(400); };
  const saves = () => pg.evaluate(() => JSON.parse(localStorage.getItem('svgp.teams')));
  await click('m-garage', '^Saved Liveries');
  let rows = await items('m-garage'); console.log(' ', rows.join(' | '));
  ok(rows.some(r => /OLD GULF.*New here.*1 car/i.test(r)), 'old save listed, new on this car');
  ok((await saves())[0].cars?.m1procar, 'old save upgraded');
  await pg.screenshot({ path: join(out, 'lv-list.png') });
  await click('m-garage', '^Save This Livery'); await type('My Test');
  let s = await saves(); ok(s[0].name === 'MY TEST' && Object.keys(s[0].cars).length === 1, 'saved with typed name');
  ok(await pg.evaluate(() => window.__svgp.settings.car.design) === s[0].id, 'car now in it');
  rows = await items('m-garage'); console.log(' ', rows.join(' | '));
  ok(rows.some(r => /Save To MY TEST.*Saved/i.test(r)), 'Save To row, saved');
  await click('m-garage', '^Rename'); await type('Renamed');
  ok((await saves())[0].name === 'RENAMED', 'renamed');
  await pg.screenshot({ path: join(out, 'lv-list2.png') });
  // wear the old one (twice: confirm) and check this car starts in its colors
  await click('m-garage', '^OLD GULF'); await click('m-garage', '^OLD GULF|Wear it');
  const car = await pg.evaluate(() => window.__svgp.settings.car);
  ok(car.main === 0x88bbee && car.pattern === 'stripe' && car.design === s.find(x => x.name === 'OLD GULF').id, 'wore old gulf: its colors on this car');
  await click('m-garage', '^Saved Liveries');
  rows = await items('m-garage'); ok(rows.some(r => /Save To OLD GULF.*New car/i.test(r)), 'Save To adds this car');
  await click('m-garage', '^Save To OLD GULF');
  s = await saves(); ok(Object.keys(s[0].cars).length === 2 && s[0].name === 'OLD GULF', 'this car added as 2nd version');
  // New Livery: typed, then the designer opens on it
  await click('m-garage', '^New Livery'); if (!(await pg.$('.lv-type'))) await click('m-garage', 'New Livery|Unsaved');
  await type('Fresh');
  await pg.waitForFunction(() => window.__svgp.screen === 's-livery', null, { timeout: 10000 });
  ok((await saves())[0].name === 'FRESH', 'new livery saved + designer open');
  await pg.waitForTimeout(1200);
  const n0 = await pg.evaluate(() => window.__svgp.settings.car.decals.length);
  await pg.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '<svg width="100" height="40" viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><g id="Logo_2"><rect width="100" height="40" fill="#ff2b00"/></g></svg>'); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })); });
  await pg.waitForTimeout(1500);
  const dec = await pg.evaluate(() => window.__svgp.settings.car.decals);
  ok(dec.length === n0 + 1 && dec[dec.length - 1].asset && dec[dec.length - 1].name === 'Logo', 'pasted svg became a decal named Logo');
  await pg.screenshot({ path: join(out, 'lv-paste.png') });
  await pg.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/html', '<meta charset="utf-8"><span data-metadata="<!--(figmeta)abc(/figmeta)-->"></span>'); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })); });
  await pg.waitForTimeout(200);
  ok(/COPY AS SVG/.test(await pg.$eval('#lv-toast', e => e.textContent)), 'figma plain copy explains Copy as SVG');
  // the Saved tab
  console.log('  tabs:', await pg.evaluate(() => document.querySelector('#lv-tabs').innerHTML + ' screen ' + window.__svgp.screen));
  await pg.evaluate(() => document.querySelector('#lv-tabs span[data-k="saved"]').click()); await pg.waitForTimeout(300);
  console.log('  tabs after:', await pg.evaluate(() => document.querySelector('#lv-tabs').innerHTML));
  rows = await items('m-livery'); console.log(' ', rows.join(' | '));
  ok(rows.some(r => /Save To FRESH.*Unsaved/i.test(r)), 'designer Saved tab: Save To FRESH, unsaved');
  await pg.screenshot({ path: join(out, 'lv-saved-tab.png') });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
