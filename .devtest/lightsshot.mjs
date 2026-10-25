// dev: the start from the grid, as the lights come on   node .devtest/lightsshot.mjs <outdir> [preset] [grid pos]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9490 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([name, grid]) => { const { presetTracks } = await import('/js/track.js'); const t = presetTracks().find(t => t.name === name); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 7, grid, strategy: false, car: window.__svgp.settings.car }, 'menu'); }, [process.argv[3] || 'Maple Ridge GP', process.argv[4] || 'front']).catch(() => 0);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV, null, { timeout: 120000 });
  await pg.addStyleTag({ content: '.screen { visibility: hidden !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'countdown'; s.stateT = 0; });
  for (let k = 0; k < 400; k++) {
    const st = await pg.evaluate(() => ({ state: window.__svgp.sim.state, on: window.__svgp.sim.lightsOn, t: window.__svgp.sim.stateT }));
    if (k % 20 === 0) console.log(JSON.stringify(st));
    if (st.on >= +(process.env.ON || 3) || st.state === 'racing') { console.log('shot at', JSON.stringify(st)); break; }
    await pg.waitForTimeout(250);
  }
  await pg.screenshot({ path: join(process.argv[2] || '/tmp', 'lights.png') });
} finally { await b.close(); server.kill(); }
