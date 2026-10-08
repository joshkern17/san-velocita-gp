// dev: the race applies a balance of performance table (opts.bop) to the AI cars: their power and grip, and the plan
// they learned for that grip. node .devtest/bopcheck.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
let b = null; setTimeout(async () => { console.log('GAVE UP'); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, 240000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async () => {
    const { presetTracks } = await import('/js/track.js');
    const t = presetTracks()[3]; t.env = { ...(t.env || {}), weather: 'clear' };
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: 'm5' }; S.difficulty = 'hard';
    const bop = { testarossa: [0.93, 0.977], jsport: [0.988, 0.99], rs964: [1.1, 1.04], mustang: [1.1, 1.05], m5: [1.012, 1], r34: [0.943, 0.982] };
    window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 5, aiChassis: 'class', car: S.car, extra: { bop, balance: false } }, 'menu'); // (no quick-race field balance: as in World Career)
    for (let k = 0; k < 1500 && !(window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.cars.length > 5); k++) await new Promise(r => setTimeout(r, 100));
    const sim = window.__svgp.sim; sim.setPaused(true);
    return sim.cars.filter(c => !c.isPlayer).map(c => ({ id: c.carId, power: +c.phys.powerMul.toFixed(3), grip: +c.phys.gripMul.toFixed(3), want: bop[c.carId], planG: Object.keys(sim.limits).filter(k => k.startsWith(c.carId)).join(' ') }));
  });
  for (const c of r) console.log(`${c.id.padEnd(11)} power ${c.power} (table ${c.want[0]}, less up to 0.6% driver spread)  grip ${c.grip} (table ${c.want[1]})  plans: ${c.planG}`);
} finally { await b.close(); server.kill(); }
