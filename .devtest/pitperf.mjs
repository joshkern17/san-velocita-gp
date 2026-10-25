// dev: cost of the pit lane life per frame (sim.update with and without it), camera in the pit lane
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => { const t = await (await fetch('/.devtest/auburn2.json')).json(); window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 11, strategy: false, car: window.__svgp.settings.car }, 'menu'); });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.pitLife && window.__svgp.sim.pitLife.boxes.some(b => b.crew.length), null, { timeout: 120000 });
  console.log(await pg.evaluate(() => {
    const sim = window.__svgp.sim, pl = sim.pitLife, b0 = pl.boxes[5];
    sim.state = 'racing'; sim.player.autoT = 1e9;
    const pin = () => { sim.camera.position.copy(pl.at(b0.bi, sim.pit.CEN[b0.bi], 2)); };
    const time = (n) => { const t = performance.now(); for (let f = 0; f < n; f++) { pin(); pl.update(1 / 60); } return (performance.now() - t) / n; };
    const a = time(300);
    return `pit life update: ${a.toFixed(3)} ms/frame with camera in the lane, crews ${pl.boxes.reduce((s, b) => s + b.crew.length, 0)}`;
  }));
} finally { await b.close(); server.kill(); }
