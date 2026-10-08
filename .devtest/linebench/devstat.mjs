// how well the AI holds its line on a solo lap: lap time, mean distance off the line in corners (line radius < 150 m),
// 95th percentile and max distance outside it. Setups: JSON [{name, opts}]. node devstat.mjs '<setups>' cars [track]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8400 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const setups = JSON.parse(process.argv[2]), cars = (process.argv[3] || 'm3gtr,m1procar,f1').split(','), TRK = process.argv[4] || '/.devtest/auburn2.json';
const b = await chromium.launch({ channel: 'chrome', headless: true });
let loading = Promise.resolve();
const job = async (id, su) => {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  const ready = loading.then(async () => { for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); return; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } } });
  loading = ready.catch(() => {}); await ready;
  const r = await pg.evaluate(async ([id, su, TRK]) => {
    const THREE = await import('three'); const { Race } = await import('/js/race.js'); const { CARS } = await import('/js/cars.js'); const { CarPhysics } = await import('/js/car.js');
    const t = await (await fetch(TRK)).json();
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'hard', freshPlans: true, ...su.opts, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
    const T = race.T, N = T.N, V = race.limitsFor(id), spec = CARS[id].spec, K = race.lineCurv();
    const time = race.simLap(id, { tyre: 'soft' });
    const c = { phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
      ai: { pace: su.pace ?? 1, bias: 0, over: 0, stuckT: 0, react: 0, aggr: 0, skill: su.skill }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} } };
    c.phys.wearK = 0; c.phys.isAI = true; c.phys.fitTyres('soft'); if (su.aid) c.phys.setAids({ ...c.phys.aidBase, ...su.aid });
    c.phys.place(T.X[0] + T.RX[0] * race.line[0], T.Z[0] + T.RZ[0] * race.line[0], Math.atan2(T.FX[0], T.FZ[0]));
    c.phys.vx = T.FX[0] * V[0] * 0.9; c.phys.vz = T.FZ[0] * V[0] * 0.9; c.phys.gear = Math.min(5, spec.gears.length - 1); c.idx = 0; race.updateTracker(c, true);
    race.state = 'racing'; race.damageK = 0; race.laps = Infinity; race.cars = [];
    const outs = []; let sum = 0, n = 0, lap = 0, last = 0, offs = 0, was = true, tt = 0, t1 = 0; const LAPS = su.laps || 3;
    for (let f = 0; f < 60 * 300 * LAPS && lap <= LAPS; f++) {
      const ctl = race.aiControls(c, 1 / 60);
      for (let k = 0; k < 4; k++) { c.phys.step(1 / 240, ctl, race.surfaceEnv(c)); race.updateTracker(c); race.barriers(c); }
      tt += 1 / 60;
      if (c.idx < last - N / 2) { lap++; if (lap === 1) t1 = tt; } last = c.idx;
      if (lap < 1 || lap > LAPS) continue;
      if (was && !c.onRoad) offs++; was = c.onRoad;
      const i = c.idx; if (K[i] < 1 / 150) continue;
      const q = (i + 4) % N, ins = Math.sign(T.RX[i] * (T.FX[q] - T.FX[i]) + T.RZ[i] * (T.FZ[q] - T.FZ[i]));
      const out = -(c.s - race.line[i]) * ins; outs.push(out); sum += Math.abs(out); n++;
    }
    outs.sort((a, b) => a - b);
    return { time: su.skill || su.pace ? +((tt - t1) / LAPS).toFixed(2) : +time.toFixed(2), mean: +(sum / n).toFixed(2), p95: +outs[Math.floor(outs.length * 0.95)].toFixed(2), max: +outs[outs.length - 1].toFixed(2), offs };
  }, [id, su, TRK]);
  await pg.close(); return { id, name: su.name, ...r };
};
try {
  const jobs = []; for (const id of cars) for (const su of setups) jobs.push([id, su]);
  const res = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => { while (next < jobs.length) { const [id, su] = jobs[next++]; res.push(await job(id, su)); } }));
  for (const id of cars) { console.log(id); for (const su of setups) { const r = res.find(x => x.id === id && x.name === su.name); console.log('  ' + su.name.padEnd(12), 'lap', String(r.time).padEnd(7), 'off-line in corners: mean', String(r.mean).padEnd(5), 'p95 out', String(r.p95).padEnd(5), 'max out', String(r.max).padEnd(5), 'offs', r.offs); } }
} finally { await b.close(); server.kill(); }
