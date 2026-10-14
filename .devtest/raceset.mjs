// dev: the Quick Race settings screen: laps / timed rows shown by the format, Start Race under the picture
//   node .devtest/raceset.mjs   (screenshots in .devtest/out/raceset-*.png)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 820 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); bad++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; localStorage.setItem('svgp.settings', JSON.stringify({ raceFormat: 'laps' })); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => __svgp.open.setup()); await pg.waitForTimeout(1500);
  await pg.keyboard.press('Enter'); await pg.waitForFunction(() => __svgp.screen === 's-raceset', null, { timeout: 20000 }); await pg.waitForTimeout(800);
  // (one key a frame or two: the menus read keys once a frame, and headless frames are slow)
  const key = async (k) => { await pg.keyboard.press(k); await pg.waitForTimeout(350); };
  const rows = () => pg.evaluate(() => [...document.querySelectorAll('#m-setup .item:not(.head) .lbl')].map(e => e.textContent));
  const sel = () => pg.evaluate(() => document.querySelector('.screen.active .menu:not(.inactive) .item.sel')?.textContent || '');
  check((await sel()).startsWith('Start Race'), 'opens on Start Race: ' + await sel());
  const go = await pg.evaluate(() => { const r = document.querySelector('#m-rsgo').getBoundingClientRect(), p = document.querySelector('#rs-card .postcard').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, pic: p.bottom, vh: innerHeight }; });
  check(go.top >= go.pic && go.bottom <= go.vh, `buttons under the picture, on screen (${JSON.stringify(go)})`);
  let r = await rows();
  check(r.includes('Laps') && !r.includes('Race Clock') && !r.includes('Co-Driver'), 'laps: ' + r.slice(0, 4).join(', '));
  await pg.screenshot({ path: join(ROOT, '.devtest/out/raceset-laps.png') });
  // to the settings (Tab), down to Format, change it
  // (the first key once the screen has settled: its picture is still being taken just after it opens)
  for (let k = 0; k < 4 && !(await sel()).startsWith('Format'); k++) await key('Tab');
  check((await sel()).startsWith('Format'), 'Tab goes to the settings: ' + await sel());
  await key('ArrowRight');
  r = await rows();
  check(!r.includes('Laps') && ['Race Clock', 'Endurance Length', 'Start Time', 'Co-Driver'].every(x => r.includes(x)), 'timed: ' + r.slice(0, 6).join(', '));
  const lbl = await pg.evaluate(() => document.querySelector('#m-rsgo .item').textContent);
  check(/HOURS/.test(lbl), 'Start Race shows the clock: ' + lbl);
  for (let k = 0; k < 6; k++) await key('ArrowDown');
  check(!(await sel()).startsWith('Laps'), 'cursor skips hidden rows: ' + await sel());
  await pg.screenshot({ path: join(ROOT, '.devtest/out/raceset-timed.png') });
  // A / Enter on a setting: over to Start Race (the setting stays as it was)
  const fmt = await pg.evaluate(() => JSON.parse(localStorage.getItem('svgp.settings')).raceFormat);
  await key('Enter');
  check((await sel()).startsWith('Start Race') && await pg.evaluate(() => JSON.parse(localStorage.getItem('svgp.settings')).raceFormat) === fmt, 'Enter on a setting goes to Start Race: ' + await sel());
  const fill = await pg.evaluate(() => getComputedStyle(document.querySelector('#m-rsgo .item.primary')).backgroundColor);
  check(fill !== 'rgba(0, 0, 0, 0)', 'Start Race filled when selected: ' + fill);
  await pg.screenshot({ path: join(ROOT, '.devtest/out/raceset-go.png') });
  // back to the buttons with Tab, and Time Trial below Start Race
  await key('ArrowDown');
  check((await sel()).startsWith('Time Trial'), 'down from Start Race: ' + await sel());
  // click Start Race: the race loads
  await pg.click('#m-rsgo .item.primary'); await pg.waitForFunction(() => __svgp.screen !== 's-raceset', null, { timeout: 20000 }).catch(() => {});
  check(await pg.evaluate(() => __svgp.screen !== 's-raceset'), 'clicking Start Race starts: ' + await pg.evaluate(() => __svgp.screen));
} finally { await b.close(); server.kill(); }
console.log(bad ? `${bad} FAILED` : 'ALL OK'); process.exit(bad ? 1 : 0);
