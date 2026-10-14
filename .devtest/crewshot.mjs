// dev: what you see when your co-driver has the car (the call box: X watch faster, B skip) and when you skip
//   node .devtest/crewshot.mjs <outdir>
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
    window.__autopilot = true;
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 7, car: window.__svgp.settings.car, extra: { duration: 1350, clockK: 16, startHour: 13, strategy: false, codriver: { name: 'Ana Silva', paceK: 0.96 } } }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const s = window.__svgp.sim; s.crewSwap(s.player); });
  await pg.waitForTimeout(1200); await pg.screenshot({ path: join(out, 'crew_driving.png') });
  await pg.keyboard.press('Digit1'); await pg.waitForTimeout(1500); await pg.screenshot({ path: join(out, 'crew_4x.png') });
  console.log('ff after X:', await pg.evaluate(() => window.__svgp.sim.ff));
  await pg.keyboard.press('Digit2'); await pg.waitForTimeout(2500); await pg.screenshot({ path: join(out, 'crew_skip.png') });
  console.log('skipping:', await pg.evaluate(() => [window.__svgp.sim.skipping, window.__svgp.sim.raceTime.toFixed(0)]));
} finally { await b.close(); server.kill(); }
