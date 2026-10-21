// dev: how hard each car can really brake (the physics, the AI's aids: ABS) against how hard the AI's learned plan
// brakes into corners. The gap between the two is what a late-braking move has to work with.
//   node .devtest/brakecap.mjs [cars=miata,jsport,m3gtr,m1procar] [track=/tracks/real/willow.json] [diff=hard]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8600 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2000));
const [ids = 'miata,jsport,m3gtr,m1procar', TRK = '/tracks/real/willow.json', diff = 'hard'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  for (const id of ids.split(',')) {
    const r = await pg.evaluate(async ([id, TRK, diff]) => {
      const { Race } = await import('/js/race.js'); const { CarPhysics } = await import('/js/physics.js'); const { CARS } = await import('/js/cars.js');
      const { AI_AIDS } = await import('/js/aids.js');
      const t = await (await fetch(TRK)).json(); t.env.weather = 'clear';
      const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: diff, car: { chassis: id } }, null);
      const T = race.T, N = T.N, V = race.limitsFor(id, race.diff.grip);
      // the longest straight-ish stretch: start there
      let best = 0, at = 0; for (let i = 0; i < N; i++) { let k = 0; while (k < N && Math.abs(T.K[(i + k) % N]) < 1 / 800) k++; if (k > best) { best = k; at = i; } }
      // full braking from 180 km/h (or top speed) on it: decel by speed band
      const spec = CARS[id].spec, p = new CarPhysics(spec); p.isAI = true; p.gripMul = race.diff.grip; p.fitTyres('medium'); p.setAids && p.setAids(AI_AIDS);
      const car = { phys: p, idx: at, i: at, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0, isPlayer: false, model: { group: { position: { set() {}, copy() {} } }, setDamage() {} } };
      const v0 = Math.min(50, Math.max(...V) * 0.95);
      p.place(T.X[at] + T.RX[at] * race.line[at], T.Z[at] + T.RZ[at] * race.line[at], Math.atan2(T.FX[at], T.FZ[at]));
      p.vx = T.FX[at] * v0; p.vz = T.FZ[at] * v0; p.gear = Math.min(5, spec.gears.length - 1);
      race.updateTracker(car, true);
      const band = {}; let prev = v0;
      for (let f = 0; f < 240 * 8 && (f < 10 || p.u > 12); f++) { p.step(1 / 240, { steer: 0, throttle: 0, brake: 1, handbrake: 0 }, race.surfaceEnv(car)); race.updateTracker(car);
        const b5 = Math.round(p.u * 3.6 / 20) * 20; const a = (prev - p.u) * 240; prev = p.u; if (f > 24) (band[b5] ||= []).push(a); }
      const real = Object.entries(band).sort((x, y) => y[0] - x[0]).map(([k, a]) => `${k}:${(a.reduce((s, x) => s + x, 0) / a.length / 9.81).toFixed(2)}g`).join(' ');
      // the plan's braking: decel it asks for in its braking zones (where it falls), by speed band, its hardest 80th pct
      const pb = {}; for (let i = 0; i < N; i++) { const a = V[i], c = V[(i + 1) % N]; if (c < a - 0.05) { const d = (a * a - c * c) / (2 * T.ds); (pb[Math.round(a * 3.6 / 20) * 20] ||= []).push(d); } }
      const plan = Object.entries(pb).sort((x, y) => y[0] - x[0]).map(([k, a]) => { a.sort((x, y) => x - y); return `${k}:${(a[Math.floor(a.length * 0.8)] / 9.81).toFixed(2)}g`; }).join(' ');
      return { real, plan, v0: v0 * 3.6 };
    }, [id, TRK, diff]);
    console.log(`${id}: full brakes from ${r.v0.toFixed(0)} km/h  ${r.real}\n${' '.repeat(id.length)}  plan brakes at           ${r.plan}`);
  }
} finally { await b.close(); server.kill(); }
