// dev: walking round the home garage (Main Menu > Home Garage > Walk Around): keys held, where you end up, what's
// in reach; screenshots to argv[2].   node .devtest/walk.mjs <outdir>
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
  await pg.evaluate(() => window.__svgp.dbg.openHomeView());
  await pg.waitForFunction(() => window.__svgp.screen === 's-homeview' && /^home:/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(() => window.__svgp.dbg.homeView({ fac: { tools: 1, sim: 1 } })); await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__svgp.dbg.startWalk());
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000 }); await pg.waitForTimeout(800);
  const st = () => pg.evaluate(() => { const w = window.__svgp.dbg.walk; return { pos: w.pos.toArray().map(v => +v.toFixed(2)), heading: +w.heading.toFixed(2), spot: w.spot && w.spot.key, prompt: (e => e && (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width)])(e.getBoundingClientRect()))(document.querySelector('#walk-tags:not([hidden]) .walk-tag.open:not(.gone)')),
    marks: document.querySelectorAll('#walk-tags:not([hidden]) .walk-tag:not(.gone):not([hidden])').length,
    spots: w.spots.map(s => s.key).join(','), boxes: w.boxes.length, walking: document.getElementById('s-homeview').classList.contains('walking') }; });
  console.log('start:', JSON.stringify(await st()));
  await pg.screenshot({ path: join(out, 'walk-1-start.png') });
  const hold = async (keys, ms) => { for (const k of keys) await pg.keyboard.down(k); await pg.waitForTimeout(ms); for (const k of keys) await pg.keyboard.up(k); await pg.waitForTimeout(200); };
  await hold(['KeyW'], 2500); console.log('W 2.5s:', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'walk-2-forward.png') });
  await hold(['KeyW'], 6000); console.log('W 6s more (into the back wall?):', JSON.stringify(await st()));
  await hold(['KeyA'], 2500); console.log('A 2.5s:', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'walk-3-left.png') });
  // the sim rig (front-left corner, by the door): from the spawn, strafe left to it
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.walk.stop(); d.startWalk(); }); await pg.waitForFunction(() => window.__svgp.dbg.walk.active); await pg.waitForTimeout(500);
  await hold(['KeyA'], 2600); console.log('to the sim:', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'walk-sim.png') });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(400); console.log('toast:', await pg.evaluate(() => (document.querySelector('.toast, #toast') || {}).textContent));
  await hold(['KeyS'], 6000); console.log('S 6s:', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'walk-4-back.png') });
  await hold(['KeyA'], 1500); console.log('A 1.5s:', JSON.stringify(await st())); await pg.screenshot({ path: join(out, 'walk-5.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(900);
  console.log('after Esc:', JSON.stringify(await pg.evaluate(() => ({ walk: window.__svgp.dbg.walk.active, screen: window.__svgp.screen, shot: window.__svgp.dbg.pitGarage.shot }))));
  await pg.screenshot({ path: join(out, 'walk-6-stopped.png') });
} finally { await b.close(); server.kill(); }
