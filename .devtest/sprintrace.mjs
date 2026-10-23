// dev: node .devtest/sprintrace.mjs <outdir>  (through .devtest/guard.sh): a test race in the sprint car with a fake pad,
// screenshots of the chase cam steering left, straight and right (the driver's hands on the wheel)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  await pg.addInitScript(() => {
    window.__pad = { steer: 0, thr: 0, brk: 0 };
    const btn = (v) => ({ pressed: v > 0.5, touched: v > 0, value: v });
    navigator.getGamepads = () => [{ id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(),
      axes: [window.__pad.steer, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i === 7 ? window.__pad.thr : i === 6 ? window.__pad.brk : 0)) }];
  });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: 'sprint410' };
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 60000 });
  await pg.waitForTimeout(2500);
  const info = await pg.evaluate(() => { const m = window.__svgp.sim.player.model; return { driver: !!(m.cockpitDriver && m.cockpitDriver()), wheel: !!m.steeringWheel }; });
  console.log('in race:', JSON.stringify(info));
  for (const [name, st] of [['left', -0.8], ['straight', 0], ['right', 0.8]]) {
    await pg.evaluate((s) => { window.__pad.steer = s; }, st); await pg.waitForTimeout(900);
    await pg.screenshot({ path: `${OUT}/race_${name}.png` });
  }
} finally { await b.close(); server.kill(); }
