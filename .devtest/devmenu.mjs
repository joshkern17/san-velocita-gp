// dev: the main menu's Development list (main.js DEV_ITEMS): in and back out, and its Pit Stop: a race that boxes
// your car as soon as it's green. FAIL lines are problems.   node .devtest/devmenu.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await pg.waitForTimeout(2500);
  console.log('screen', await pg.evaluate(() => window.__svgp.screen));
  for (let k = 0; k < 6 && (await pg.evaluate(() => window.__svgp.screen)) !== 's-main'; k++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
  const items = () => pg.evaluate(() => [...document.querySelectorAll('#m-main .item')].map(e => e.textContent.trim().split('\n')[0].trim()));
  const click = (re) => pg.evaluate((re) => { [...document.querySelectorAll('#m-main .item')].find(e => new RegExp(re, 'i').test(e.textContent)).click(); }, re);
  const main = await items(); console.log(JSON.stringify(main));
  check(main.some(l => /^Development/.test(l)) && !main.some(l => /^(The Opening|The Ending|Home Garage)/.test(l)), 'main menu: Development, the previews moved off it');
  await click('^\\s*Development'); await pg.waitForTimeout(400);
  const dev = await items(); console.log(JSON.stringify(dev));
  check(['Pit Stop', 'The Opening', 'The Ending', 'Home Garage', 'Back'].every(l => dev.some(d => d.startsWith(l))), 'Development lists the pit stop and the previews');
  await pg.screenshot({ path: join(OUT, 'devmenu.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  check((await items()).some(l => /^Quick Race/.test(l)), 'B / Esc: back to the main menu');
  await click('^\\s*Development'); await pg.waitForTimeout(400);
  await click('^\\s*Pit Stop');
  for (let k = 0; k < 24; k++) {
    await pg.waitForTimeout(10000);
    const s = await pg.evaluate(() => { const S = window.__svgp.sim; return { screen: window.__svgp.screen, state: S && S.state, t: S && +S.stateT.toFixed(1), pitting: S && S.player && S.player.pitting }; });
    console.log(JSON.stringify(s)); if (s.pitting) break;
  }
  const st = await pg.evaluate(() => ({ phase: window.__svgp.sim.player.pitPhase, req: window.__svgp.sim.player.pitReq, track: window.__svgp.sim.track.name }));
  console.log(JSON.stringify(st));
  check(st.phase === 'in' && st.req && st.req.tyre, `Pit Stop: a race at ${st.track}, your car boxing`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
