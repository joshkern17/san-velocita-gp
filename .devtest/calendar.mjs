// dev: World Career > Career Options > Season Calendar: a round's circuit replaced from the Circuits picker, then
// checked (the calendar, its lap length, the save); screenshots of each screen.  node .devtest/calendar.mjs <outdir>
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
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  console.log('state:', await pg.evaluate(() => ({ screen: window.__svgp.screen, world: !!window.__svgp.world, series: window.__svgp.world && window.__svgp.world.player.series, wizard: document.querySelector('#s-hub').className })));
  // (the new team's setup wizard first: closed, the garage as it is after it)
  await pg.evaluate(() => { const d = window.__svgp.dbg; if (d.tsw && d.tsw.isOpen) d.tsw.close(); d.openHub(); }); await pg.waitForTimeout(1500);
  const click = async (re, scope = '#s-hub') => {
    const ok = await pg.evaluate(([src, scope]) => { const re = new RegExp(src); const el = [...document.querySelectorAll(`${scope} .item`)].find(e => re.test(e.textContent)); if (!el) return false; el.click(); return true; }, [re.source, scope]);
    if (!ok) throw new Error('no menu item ' + re); await pg.waitForTimeout(500);
  };
  const before = await pg.evaluate(() => { const w = window.__svgp.world; return w.series[w.player.series].cal.map(r => r.name); });
  console.log('calendar before:', before.join(' | '));
  await click(/^Career Options/); await click(/^Season Calendar/);
  await pg.screenshot({ path: join(out, 'cal-list.png') });
  await click(/^Round 3:/); await pg.screenshot({ path: join(out, 'cal-round.png') });
  await click(/^Replace Circuit/); await pg.waitForFunction(() => window.__svgp.screen === 's-circuits', null, { timeout: 10000 }); await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(out, 'cal-pick.png') });
  const pick = await pg.evaluate(() => { const cards = [...document.querySelectorAll('#s-circuits .tk-card')]; const c = cards.find(e => /Spa-Francorchamps/.test(e.textContent) && !/reference/.test(e.textContent)) || cards[cards.length - 1]; const n = c.querySelector('b').textContent; c.click(); return n; });
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub', null, { timeout: 10000 }); await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(out, 'cal-after.png') });
  const after = await pg.evaluate(() => { const w = window.__svgp.world, R = w.series[w.player.series].cal[2]; return { cal: w.series[w.player.series].cal.map(r => r.name), R: { name: R.name, theme: R.theme, surface: R.surface, fc: !!R.fc }, km: w.lapKm && w.lapKm[R.name] }; });
  console.log('picked', pick, '-> round 3:', JSON.stringify(after.R), 'lap km', after.km);
  console.log('calendar after: ', after.cal.join(' | '));
  const saved = await pg.evaluate(() => { for (const k of Object.keys(localStorage)) { let w; try { w = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; } if (w && w.player && w.series && w.series[w.player.series]) return `${w.series[w.player.series].cal[2].name} (${k})`; } return 'no save found'; });
  console.log('saved round 3:', saved);
} finally { await b.close(); server.kill(); }
