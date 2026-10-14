// dev: a multiclass race's screens: the HUD (your class's tower, your place in class) and the results (class column)
//   node .devtest/multishot.mjs <outdir>
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
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async () => {
    const t = (await import('/js/track.js')).presetTracks().find(t => t.name === 'Maple Ridge GP'); t.env.weather = 'clear';
    window.__autopilot = true; window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: 'm3gtr' };
    window.__svgp.startRace(t, { mode: 'race', laps: 5, opponents: 11, grid: 'back', car: window.__svgp.settings.car, extra: { car: window.__svgp.settings.car, mixCls: { cls: 'gt1' }, strategy: false } }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.state === 'racing' && window.__svgp.sim.player, null, { timeout: 180000 });
  // (on a few laps, stepped: the classes spread out)
  await pg.evaluate(() => { const s = window.__svgp.sim; for (let f = 0; f < 60 * 150; f++) s.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); });
  await pg.waitForTimeout(1500); await pg.screenshot({ path: join(out, 'multi_hud.png') });
  await pg.evaluate(() => window.__svgp.dbg.showResults()); await pg.waitForTimeout(1500); await pg.screenshot({ path: join(out, 'multi_results.png') });
} finally { await b.close(); server.kill(); }
