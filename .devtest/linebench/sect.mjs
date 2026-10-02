// per-section times: real AI lap (learned plan, pace 1) vs the line model, old line vs fast line
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8800 + Math.floor(Math.random() * 50);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const id = process.argv[2] || 'm1procar', SEC = +(process.argv[3] || 100), trk = process.argv[4] || '/.devtest/auburn2.json';
try {
  const pg = await b.newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.waitForTimeout(1200);
  const out = await pg.evaluate(async ([id, SEC, trk]) => {
    const THREE = await import('three');
    const { Race } = await import('/js/race.js'); const { CARS } = await import('/js/cars.js'); const { CarPhysics } = await import('/js/car.js');
    const RL = await import('/js/raceline.js');
    const t = await (await fetch(trk)).json();
    const res = {};
    for (const kind of ['old', 'fast']) {
      const race = new Race(JSON.parse(JSON.stringify(t)), { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, lineKind: kind === 'fast' ? 'fit' : undefined, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
      const T = race.T, N = T.N, V = race.limitsFor(id), spec = CARS[id].spec;
      // model section times on this line
      const car = RL.lineCar(spec);
      // real lap: per-sample arrival time over the 2nd lap
      const c = { phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
        ai: { pace: 1, bias: 0, over: 0, stuckT: 0, react: 0, aggr: 0 }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} } };
      c.phys.wearK = 0; c.phys.isAI = true; c.phys.fitTyres('soft');
      c.phys.place(T.X[0] + T.RX[0] * race.line[0], T.Z[0] + T.RZ[0] * race.line[0], Math.atan2(T.FX[0], T.FZ[0]));
      const v0 = V[0] * 0.9; c.phys.vx = T.FX[0] * v0; c.phys.vz = T.FZ[0] * v0; c.phys.gear = Math.min(5, spec.gears.length - 1);
      c.idx = 0; race.updateTracker(c, true);
      race.state = 'racing'; race.damageK = 0; race.laps = Infinity; race.cars = [];
      const arr = new Float64Array(N).fill(NaN), spd = new Float64Array(N), off = new Float64Array(N);
      let tt = 0, lap = 0, last = 0, offs = 0;
      for (let f = 0; f < 60 * 400 && lap < 2; f++) {
        const ctl = race.aiControls(c, 1 / 60);
        for (let k = 0; k < 4; k++) { c.phys.step(1 / 240, ctl, race.surfaceEnv(c)); race.updateTracker(c); race.barriers(c); }
        tt += 1 / 60;
        if (c.idx < last - N / 2) lap++;
        if (lap === 1 && isNaN(arr[c.idx])) { arr[c.idx] = tt; spd[c.idx] = c.phys.speed; { const i = c.idx, q = (i + 4) % N, ins = Math.sign(T.RX[i] * (T.FX[q] - T.FX[i]) + T.RZ[i] * (T.FZ[q] - T.FZ[i])); off[c.idx] = (c.s - race.line[c.idx]) * ins; } if (!c.onRoad) offs++; }
        last = c.idx;
      }
      for (let i = 1; i < N; i++) if (isNaN(arr[i])) { arr[i] = arr[i - 1]; spd[i] = spd[i - 1]; }
      const prof = RL.lineProfile(T, race.line, car);
      const secs = [];
      for (let s0 = 0; s0 < N; s0 += SEC) {
        const s1 = Math.min(N - 1, s0 + SEC);
        let mx = 0, mn = 0, vmin = 1e9, vplan = 1e9; for (let i = s0; i < s1; i++) { if (off[i] > mx) mx = off[i]; if (off[i] < mn) mn = off[i]; vmin = Math.min(vmin, spd[i]); vplan = Math.min(vplan, V[i]); }
        secs.push({ s0, mod: +(prof.at[s1] - prof.at[s0]).toFixed(2), mvmin: Math.round(Math.min(...prof.V.slice(s0, s1)) * 3.6), real: +(arr[s1] - arr[s0]).toFixed(2), vmin: Math.round(vmin * 3.6), vplan: Math.round(vplan * 3.6), dev: `in ${mx.toFixed(1)} out ${(-mn).toFixed(1)}` });
      }
      res[kind] = { secs, offs, model: +RL.lineTime(T, race.line, car).toFixed(2) };
    }
    return res;
  }, [id, SEC, trk]);
  console.log('model old', out.old.model, 'fast', out.fast.model, 'offs', out.old.offs, out.fast.offs);
  console.log('sec   old(s) fast(s) diff | vmin old/fast (plan old/fast) | max off-line old/fast');
  let so = 0, sf = 0;
  out.old.secs.forEach((o, k) => { const f = out.fast.secs[k]; so += o.real; sf += f.real; console.log(String(o.s0).padStart(5), 'real', o.real.toFixed(2).padStart(6), f.real.toFixed(2).padStart(6), (f.real - o.real).toFixed(2).padStart(6), '| model', o.mod.toFixed(2).padStart(6), f.mod.toFixed(2).padStart(6), (f.mod - o.mod).toFixed(2).padStart(6), '| vmin real', o.vmin, f.vmin, 'model', o.mvmin, f.mvmin, '|', o.vmin, f.vmin, `(${o.vplan} ${f.vplan})`, '|', o.dev, f.dev); });
  console.log('total', so.toFixed(2), sf.toFixed(2));
} finally { await b.close(); server.kill(); }
