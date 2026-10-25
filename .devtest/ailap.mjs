// dev: one AI car's laps, sampled (through .devtest/guard.sh):  TRK=/.devtest/dirt805L.json node .devtest/ailap.mjs <car> [laps]
// every ~10 m of its last lap: speed, the plan's speed there, pedals, steer, slide, rear slip / grip use; and its lap times
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8990 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'sprint410', laps = +(process.argv[3] || 4);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([id, laps, trk, diff, over]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    if (over) Object.assign((await import('/js/cars.js')).CARS[id].spec, over);   // (SPEC='{"stagger":0}': try a change without editing cars.js)
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.difficulty = diff; S.grid = 'back';
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 1, aiChassis: 'class', car: S.car, extra: { aiMistakes: 'off' } }, 'menu');
  }, [id, laps, process.env.TRK || '/.devtest/dirt805L.json', process.env.DIFF || 'alien', process.env.SPEC ? JSON.parse(process.env.SPEC) : null]);
  const r = await pg.evaluate(async (laps) => {
    const ok = () => { const x = window.__svgp.sim; return x && x.mode === 'race' && x.cars && x.cars.length > 1 && x.lineV; };
    for (let k = 0; k < 1800 && !ok(); k++) await new Promise(r => setTimeout(r, 100));
    if (!ok()) return { error: 'no race' };
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const c = sim.cars.find(x => !x.isPlayer), T = sim.T, rows = [], step = Math.round(10 / T.ds);
    let last = -1;
    for (let f = 0; f < 60 * 60 * 6 && c.lap <= laps; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      const p = c.phys;
      if (c.lap === laps && c.idx % step === 0 && c.idx !== last) {
        last = c.idx;
        rows.push(`m${String(Math.round(c.idx * T.ds)).padStart(4)} v${(p.speed * 3.6).toFixed(0).padStart(4)} plan${((c.lineV || sim.lineV)[c.idx] * 3.6 * c.ai.pace).toFixed(0).padStart(4)} thr${(c.ctl.throttle || 0).toFixed(2)} brk${(c.ctl.brake || 0).toFixed(2)} st${(c.ctl.steer || 0).toFixed(2)} β${(p.beta * 57.3).toFixed(0).padStart(4)} slipR${(p.slipR * 57.3).toFixed(0).padStart(3)} gripR${(p.gripR || 0).toFixed(2)} gripF${(p.gripF || 0).toFixed(2)} κR${p.kR.toFixed(2)} tc${p.tcK.toFixed(2)} s${c.s.toFixed(1)} R${(1 / Math.max(1e-4, Math.abs(T.K ? T.K[c.idx] : 0))).toFixed(0)}`);
      }
    }
    return { laps: c.lapTimes.map(x => +x.toFixed(2)), pace: c.ai.pace, rows };
  }, laps);
  console.log('lap times', JSON.stringify(r.laps), 'pace', r.pace);
  (r.rows || []).forEach(x => console.log(x));
  if (r.error) console.log(r.error);
} finally { await b.close(); server.kill(); }
