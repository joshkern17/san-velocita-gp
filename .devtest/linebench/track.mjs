// how well the AI follows its line: one solo lap, a stretch of samples: off-line (+ = outside the corner), front / rear
// grip use, speed vs its plan, steering. node .devtest/linebench/track.mjs <car> <from> <to> [old|fit]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8600 + Math.floor(Math.random() * 50);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const [id = 'gtr', a0 = '300', a1 = '420', kind = 'fit', step = '4'] = process.argv.slice(2);
try {
  const pg = await b.newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.waitForTimeout(1200);
  const rows = await pg.evaluate(async ([id, a0, a1, kind, step]) => {
    const THREE = await import('three'); const { Race } = await import('/js/race.js'); const { CARS } = await import('/js/cars.js'); const { CarPhysics } = await import('/js/car.js');
    const t = await (await fetch('/.devtest/auburn2.json')).json();
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'hard', freshPlans: true, lineKind: kind === 'fit' ? 'fit' : undefined, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
    const T = race.T, N = T.N, V = race.limitsFor(id), spec = CARS[id].spec, K = race.lineCurv();
    const c = { phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
      ai: { pace: 1, bias: 0, over: 0, stuckT: 0, react: 0, aggr: 0 }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} } };
    c.phys.wearK = 0; c.phys.isAI = true; c.phys.fitTyres('soft');
    c.phys.place(T.X[0] + T.RX[0] * race.line[0], T.Z[0] + T.RZ[0] * race.line[0], Math.atan2(T.FX[0], T.FZ[0]));
    c.phys.vx = T.FX[0] * V[0] * 0.9; c.phys.vz = T.FZ[0] * V[0] * 0.9; c.phys.gear = Math.min(5, spec.gears.length - 1); c.idx = 0; race.updateTracker(c, true);
    race.state = 'racing'; race.damageK = 0; race.laps = Infinity; race.cars = [];
    const out = []; let lap = 0, last = 0, seen = new Set();
    for (let f = 0; f < 60 * 300 && lap < 2; f++) {
      const ctl = race.aiControls(c, 1 / 60);
      for (let k = 0; k < 4; k++) { c.phys.step(1 / 240, ctl, race.surfaceEnv(c)); race.updateTracker(c); race.barriers(c); }
      if (c.idx < last - N / 2) lap++; last = c.idx;
      const i = c.idx;
      if (lap === 1 && i >= a0 && i <= a1 && (i - a0) % step === 0 && !seen.has(i)) {
        seen.add(i); const p = c.phys, q = (i + 4) % N, ins = Math.sign(T.RX[i] * (T.FX[q] - T.FX[i]) + T.RZ[i] * (T.FZ[q] - T.FZ[i]));
        out.push(`${String(i).padStart(5)} line ${race.line[i].toFixed(1).padStart(5)} edge ±${(T.W[i] / 2).toFixed(1)} off ${(-(c.s - race.line[i]) * ins).toFixed(1).padStart(5)} R ${(1 / Math.max(1e-4, K[i])).toFixed(0).padStart(5)} v ${(p.speed * 3.6).toFixed(0).padStart(4)} plan ${(V[i] * 3.6).toFixed(0).padStart(4)} gripF ${(p.gripF || 0).toFixed(2)} gripR ${(p.gripR || 0).toFixed(2)} steer ${ctl.steer.toFixed(2).padStart(5)} thr ${ctl.throttle.toFixed(2)} brk ${ctl.brake.toFixed(2)}`);
      }
    }
    return out;
  }, [id, +a0, +a1, kind, +step]);
  rows.forEach(r => console.log(r));
} finally { await b.close(); server.kill(); }
