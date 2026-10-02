// compare line setups across cars: a solo clean lap (learned plan, pace 1) and a 2-lap 12-car race (AI mistakes off),
// `runs` races each. Setups: JSON [{name, opts}] (Race opts: lineKind, lineMargin, lineComb, offSlow).
// node .devtest/linebench/matrix.mjs '<setups>' gtr,m1procar,f1 [runs] [diff]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8500 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const setups = JSON.parse(process.argv[2]), cars = (process.argv[3] || 'gtr,m1procar,f1').split(','), runs = +(process.argv[4] || 2), diff = process.argv[5] || 'hard', TRK = process.argv[6] || '/.devtest/auburn2.json';
const b = await chromium.launch({ channel: 'chrome', headless: true });
// (the dev server answers one request at a time: pages load their modules one after another, then run in parallel)
let loading = Promise.resolve();
const job = async (id, su) => {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  const ready = loading.then(async () => { for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); return; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } } });
  loading = ready.catch(() => {}); await ready;
  const r = await pg.evaluate(async ([id, su, runs, diff, TRK]) => {
    const { Race } = await import('/js/race.js'); const t = await (await fetch(TRK)).json();
    const car = { chassis: id === 'f1' ? 'custom' : id };
    const solo = new Race(JSON.parse(JSON.stringify(t)), { mode: 'test', laps: 3, opponents: 0, difficulty: diff, freshPlans: true, ...su.opts, car }, null);
    const lap = solo.simLap(id, { pace: 1, power: solo.diff.power, grip: solo.diff.grip, tyre: 'soft' });
    let walls = 0, offs = 0, time = 0, worst = 0;
    for (let k = 0; k < runs; k++) {
      const race = new Race(JSON.parse(JSON.stringify(t)), { mode: 'race', laps: 2, opponents: 11, difficulty: diff, aiChassis: 'class', aiMistakes: 'off', damage: 'normal', ...su.opts, car }, null);
      race.state = 'racing'; race.stateT = 0;
      const c0 = race.crashed.bind(race); race.crashed = (c, vn) => { if (vn > 4) walls++; return c0(c, vn); };
      const was = new Map();
      for (let f = 0; f < 60 * 400; f++) {
        race.update(1 / 60, race.aiControlsFor(race.player, 1 / 60), {});
        for (const c of race.cars) { if (was.get(c) && !c.onRoad) offs++; was.set(c, c.onRoad); }
        if (race.cars.every(c => c.finished || c.gone)) break;
      }
      // the winner's time, and how many AI cars lost 15 s+ to it in 2 laps (caught in an incident: a pile-up, a spin)
      const ts = race.cars.filter(c => !c.isPlayer).map(c => c.finished ? c.finishTime : 999).sort((a, b) => a - b);
      time += ts[0]; worst += ts.filter(x => x > ts[0] + 15).length;
    }
    return { lap: +lap.toFixed(2), walls: walls / runs, offs: offs / runs, time: +(time / runs).toFixed(1), worst: +(worst / runs).toFixed(1) };
  }, [id, su, runs, diff, TRK]);
  await pg.close();
  return { id, name: su.name, ...r };
};
try {
  const jobs = []; for (const id of cars) for (const su of setups) jobs.push([id, su]);
  const res = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => { while (next < jobs.length) { const [id, su] = jobs[next++]; res.push(await job(id, su)); } }));
  for (const id of cars) { console.log(id); for (const su of setups) { const r = res.find(x => x.id === id && x.name === su.name); console.log('  ' + su.name.padEnd(14), 'solo', String(r.lap).padEnd(7), 'race: walls', String(r.walls).padEnd(5), 'offs', String(r.offs).padEnd(5), 'winner', r.time, 'cars 15s+ down', r.worst); } }
} finally { await b.close(); server.kill(); }
