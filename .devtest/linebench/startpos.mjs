// you (a clean Legend-pace driver with a human start: 0.25 s reaction, flat out on low TC) from 8th on an AI grid:
// your place at D metres and after lap 1. node startpos.mjs '<setups>' car [diff] [runs]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8000 + 100 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const setups = JSON.parse(process.argv[2]), id = process.argv[3] || 'm1procar', diff = process.argv[4] || 'alien', runs = +(process.argv[5] || 3), TRK = process.argv[6] || '/.devtest/auburn2.json';
const b = await chromium.launch({ channel: 'chrome', headless: true });
let loading = Promise.resolve();
const job = async (su) => {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  const ready = loading.then(async () => { for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); return; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } } });
  loading = ready.catch(() => {}); await ready;
  const r = await pg.evaluate(async ([id, diff, runs, su, TRK]) => {
    const { Race } = await import('/js/race.js'); const { AI_AIDS } = await import('/js/aids.js'); const t = await (await fetch(TRK)).json();
    const out = [];
    // the grid in qualifying order: each AI's clean lap in its car (you 8th)
    const probe = new Race(JSON.parse(JSON.stringify(t)), { mode: 'race', laps: 3, opponents: 11, difficulty: diff, aiChassis: 'class', ...su.opts, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
    const qt = probe.cars.filter(c => !c.isPlayer).map(c => ({ k: c.teamIdx, t: probe.simLap(c.carId, { pace: c.ai.pace, power: c.phys.powerMul, grip: probe.diff.grip }) })).sort((a, b) => a.t - b.t);
    const order = qt.map(x => x.k); order.splice(7, 0, 'P');
    for (let k = 0; k < runs; k++) {
      const race = new Race(JSON.parse(JSON.stringify(t)), { mode: 'race', laps: 3, opponents: 11, difficulty: diff, aiChassis: 'class', aiMistakes: 'normal', damage: 'normal',
        gridOrder: order, ...su.opts, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
      race.state = 'racing'; race.stateT = 0;
      const me = race.player; let dist = 0, p1 = null, p2 = null;
      const ev = []; let inCC = false;
      const cc0 = race.collideCars.bind(race); race.collideCars = () => { inCC = true; cc0(); inCC = false; };
      const cr0 = race.crashed.bind(race); race.crashed = (c, vn) => { if (vn > 4 && c.lap <= 1) ev.push(`${inCC ? 'car' : 'wall'}@${c.idx}${c.isPlayer ? 'P' : ''}:${vn.toFixed(0)}`); return cr0(c, vn); };
      const place = () => 1 + race.cars.filter(c => c !== me && c.progress > me.progress).length;
      for (let f = 0; f < 60 * 200; f++) {
        const ctl0 = race.aiControlsFor(me, 1 / 60); me.ai.pace = 1; me.ai.react = 0.25; me.phys.setAids({ ...AI_AIDS, tc: 0.5 });
        const ctl = race.raceTime < 0.25 ? { ...ctl0, throttle: 0 } : me.phys.speed < 30 && Math.abs(ctl0.steer) < 0.15 ? { ...ctl0, throttle: 1, brake: 0 } : ctl0;
        race.update(1 / 60, ctl, {});
        dist += me.phys.speed / 60;
        if (p1 === null && dist >= 1500) p1 = place();
        for (const c of race.cars) if (c.lap >= 2 && c.l1 == null) c.l1 = race.raceTime;
        if (me.lap >= 2) { p2 = place(); }
        if (race.cars.every(c => c.l1 != null)) break;
      }
      (globalThis.SUM ||= []).push({ p1, p2, cc: ev.filter(e => e.startsWith('car')).length / 2, wall: ev.filter(e => e.startsWith('wall')).length, best: race.cars.filter(c => c !== me && isFinite(c.lapTimes[1])).map(c => c.lapTimes[1]) });
      out.push(`${p1}/${p2}` + (k === 0 && su.verbose ? `\n    lap-1 times: you ${me.l1.toFixed(1)} | AI ` + race.cars.filter(c => c !== me).sort((a, b) => a.l1 - b.l1).map(c => `${c.l1.toFixed(1)}(p${c.ai.pace.toFixed(3)}${c.ai.skill ? 's' : ''} ${c.carId} ${c.phys.tyre.c || c.phys.tyre.compound || ''})`).join(' ') + `\n    lap-1 contacts (kind@sample:m/s): ${ev.join(' ')}` + `\n    AI best laps: ` + race.cars.filter(c => c !== me).map(c => (c.lapTimes[1] || c.best || 0).toFixed(1)).join(' ') : ''));
    }
    const S = globalThis.SUM; globalThis.SUM = [];
    const avg = (f) => (S.reduce((a, x) => a + f(x), 0) / S.length).toFixed(1);
    const lap2 = S.flatMap(x => x.best).sort((a, b) => a - b);
    return `${su.name} [grid ${qt.map(x => x.t.toFixed(1)).join(' ')}]: from 8th -> at 1500 m ${avg(x => x.p1)}, after lap 1 ${avg(x => x.p2)} | lap-1 car contacts ${avg(x => x.cc)}, wall ${avg(x => x.wall)} | AI lap-2 median ${lap2[lap2.length >> 1]?.toFixed(1)}  (${out.join(' ')})`;
  }, [id, diff, runs, su, TRK]);
  await pg.close(); return r;
};
try {
  const res = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, setups.length) }, async () => { while (next < setups.length) { const su = setups[next++]; res.push(await job(su)); } }));
  res.forEach(x => console.log(x));
} finally { await b.close(); server.kill(); }
