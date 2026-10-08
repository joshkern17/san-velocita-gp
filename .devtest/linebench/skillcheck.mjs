// does a World Career driver's rating give the gap it should? For ratings 85 / 65 / 45: the race measures their flaws
// and pace (techFor / techPace), then they drive `laps` real laps; gap vs a clean driver. node skillcheck.mjs cars [laps] [track]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8300 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const cars = (process.argv[2] || 'm3gtr,m1procar,aventus,f1').split(','), LAPS = +(process.argv[3] || 4), TRK = process.argv[4] || '/.devtest/auburn2.json';
const b = await chromium.launch({ channel: 'chrome', headless: true });
let loading = Promise.resolve();
const job = async (id) => {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  const ready = loading.then(async () => { for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); return; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } } });
  loading = ready.catch(() => {}); await ready;
  const r = await pg.evaluate(async ([id, LAPS, TRK]) => {
    const THREE = await import('three'); const { Race } = await import('/js/race.js'); const { CARS } = await import('/js/cars.js'); const { CarPhysics } = await import('/js/car.js');
    const { AI_AIDS } = await import('/js/aids.js'); const SK = await import('/js/aiskill.js');
    const t = await (await fetch(TRK)).json(), cls = CARS[id].cls;
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'hard', freshPlans: true, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
    const T = race.T, N = T.N, V = race.limitsFor(id), spec = CARS[id].spec;
    const drive = (pace, skill, tc) => {
      const c = { phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
        ai: { pace, bias: 0, over: 0, stuckT: 0, react: 0, aggr: 0, skill }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} } };
      c.phys.wearK = 0; c.phys.isAI = true; c.phys.fitTyres('soft'); if (tc != null) c.phys.setAids({ ...AI_AIDS, tc });
      c.phys.place(T.X[0] + T.RX[0] * race.line[0], T.Z[0] + T.RZ[0] * race.line[0], Math.atan2(T.FX[0], T.FZ[0]));
      c.phys.vx = T.FX[0] * V[0] * 0.9; c.phys.vz = T.FZ[0] * V[0] * 0.9; c.phys.gear = Math.min(5, spec.gears.length - 1); c.idx = 0; race.updateTracker(c, true);
      const sv = [race.state, race.damageK, race.laps, race.cars]; race.state = 'racing'; race.damageK = 0; race.laps = Infinity; race.cars = [];
      let lap = 0, last = 0, tt = 0, t1 = 0, offs = 0, was = true;
      for (let f = 0; f < 60 * 300 * LAPS && lap <= LAPS; f++) {
        const ctl = race.aiControls(c, 1 / 60);
        for (let k = 0; k < 4; k++) { c.phys.step(1 / 240, ctl, race.surfaceEnv(c)); race.updateTracker(c); race.barriers(c); }
        tt += 1 / 60; if (c.idx < last - N / 2) { lap++; if (lap === 1) t1 = tt; } last = c.idx;
        if (lap >= 1 && was && !c.onRoad) offs++; was = c.onRoad;
      }
      [race.state, race.damageK, race.laps, race.cars] = sv;
      return { t: (tt - t1) / LAPS, offs };
    };
    const clean = drive(1, null, null), rows = [`${id}: clean ${clean.t.toFixed(2)}`];
    for (const [k, r] of [85, 65, 45].entries()) {
      const kn = SK.knobsFor(cls, SK.ratingGap(r), (88 - (r - 5)) / 40, (85 - 55) / 45);
      race.opts.entries = { [k + 1]: { gap: kn.gap, skill: kn.skill, tc: kn.tc } };
      const tf = race.techFor(k + 1, id), pace = race.techPace(1, tf, id);
      const d = drive(pace, tf.skill, tf.skill ? tf.tc : null);
      rows.push(`  r${r}: target ${kn.gap.toFixed(2)}%  measured flaws ${tf.cost.toFixed(2)}% pace ${pace.toFixed(3)}  -> real gap ${((d.t / clean.t - 1) * 100).toFixed(2)}% offs ${d.offs}`);
    }
    rows.push('  pace curve ' + JSON.stringify(race.paceCurve(id).C.map(x => x.map(v => +v.toFixed(2)))));
    return rows.join('\n');
  }, [id, LAPS, TRK]);
  await pg.close(); return r;
};
try {
  const out = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, cars.length) }, async () => { while (next < cars.length) { const id = cars[next++]; out.push(await job(id)); } }));
  out.forEach(x => console.log(x));
} finally { await b.close(); server.kill(); }
