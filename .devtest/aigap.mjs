// dev: where a lone AI car drives under its own plan, and why. One car (no flaws) laps a circuit with the level's edge;
// on its last lap every 5 m: the plan (car.lineV x pace), the speed it actually had, the throttle / brake, and the
// pieces that scale its speed target (gk: tyre grip vs the plan's, tyre temperature, dirty air). Then per corner:
// plan min vs driven min, and the main suspect.
//   node .devtest/aigap.mjs [car=miata] [track=/tracks/real/indy.json] [diff=phantom] [temps=2] [tyre=medium] [laps=3]
//   EXTRA='{"opt":v}' race options (old-behaviour switches)
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8600 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2000));
const [id = 'miata', TRK = '/tracks/real/indy.json', diff = 'phantom', temps = '2', tyre = 'medium', laps = '3'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  const r = await pg.evaluate(async ([id, TRK, diff, temps, tyre, laps, extra, W, LATE]) => {
    const { Race } = await import('/js/race.js'); const t = await (await fetch(TRK)).json(); t.env.weather = 'clear';
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: diff, temps: ['off', 'normal', 'realistic'][temps], car: { chassis: id }, ...extra }, null);
    const D = race.diff, T = race.T, N = T.N, ds = T.ds;
    let rows = [], done = []; let lastLap = 0;
    const lapT = race.simLap(id, { tyre, laps, power: D.power, grip: D.grip, temps, probe: (p, t, car) => {
      if (LATE != null) car.ai.late = LATE;
      if (car.lap !== lastLap) { lastLap = car.lap; if (rows.length > N * 0.9) done = rows; rows = []; }
      const i = car.idx, r0 = rows[rows.length - 1]; if (r0 && r0.i === i) return;
      rows.push({ t, i, plan: car.lineV[i] * 3.6, u: p.u * 3.6, thr: car.ai.thr || 0, brk: car.ai.brk || 0, tg: p.tempGrip, gn: p.gripNow() / (race.refGrip || 1), slip: p.slipR, gF: p.gripF, gR: p.gripR, off: car.s - race.line[i], beta: p.beta });
    } });
    if (done.length) rows = done;
    // corners: race.corners.list (entry/exit idx)
    const C = race.corners.list.map((c, k) => {
      const seg = rows.filter(x => { const a = c.entry - Math.round(40 / ds), z = c.exit + Math.round(20 / ds); return a <= z ? x.i >= a && x.i <= z : x.i >= a || x.i <= z; });
      if (!seg.length) return null;
      const pm = Math.min(...seg.map(x => x.plan)), um = Math.min(...seg.map(x => x.u));
      const at = seg.reduce((m, x) => x.u < m.u ? x : m, seg[0]);
      const under = seg.filter(x => x.u < x.plan - 3), avg = (f) => under.length ? under.reduce((s, x) => s + f(x), 0) / under.length : 0;
      return `T${k + 1} ${c.dir > 0 ? 'L' : 'R'} ${(c.entry * ds).toFixed(0)}m  plan ${pm.toFixed(0)} drove ${um.toFixed(0)}  under-plan ${under.length * ds}m avg ${avg(x => x.plan - x.u).toFixed(1)}km/h  | there: thr ${avg(x => x.thr).toFixed(2)} brk ${avg(x => x.brk).toFixed(2)} tempG ${avg(x => x.tg).toFixed(3)} gripNow ${avg(x => x.gn).toFixed(3)} slipR ${avg(x => x.slip).toFixed(2)} gF ${avg(x => x.gF).toFixed(2)} gR ${avg(x => x.gR).toFixed(2)} off ${avg(x => x.off).toFixed(1)}m | slowest @${(at.i * ds).toFixed(0)} thr ${at.thr.toFixed(2)} brk ${at.brk.toFixed(2)}`;
    }).filter(Boolean);
    const tot = rows.reduce((s, x) => s + Math.max(0, x.plan - x.u) * ds / Math.max(x.u, 10) / 3.6 * 0 + 0, 0);
    // time lost vs the plan: integrate ds/u - ds/plan
    const lost = rows.reduce((s, x) => s + (x.u > 5 && x.plan > 5 ? ds / (x.u / 3.6) - ds / (x.plan / 3.6) : 0), 0);
    const planT = rows.reduce((s, x) => s + (x.plan > 5 ? ds / (x.plan / 3.6) : 0), 0);
    // braking: decel the car actually made with the brake (near) full, vs what the plan assumes (aBk = mu*grip*1.05 *
    // (g + kd/m v^2)), and vs its cornering grip (mu*1.36)
    const P = race.cars?.[0]?.phys?.p || (await import('/js/cars.js')).CARS[id].spec, kdm = P.kd / P.mass;
    const bk = []; for (let k = 1; k < rows.length; k++) { const a = rows[k - 1], b = rows[k]; if (a.brk > 0.85 && b.brk > 0.85 && b.t > a.t) { const v = (a.u + b.u) / 7.2, dec = (a.u - b.u) / 3.6 / (b.t - a.t); bk.push({ v, dec, ass: P.mu * D.grip * 1.05 * (9.81 + kdm * v * v), crn: P.mu * 1.36 * D.grip * (9.81 + kdm * v * v) }); } }
    const bsum = bk.length ? { n: bk.length, dec: bk.reduce((s, x) => s + x.dec, 0) / bk.length, ass: bk.reduce((s, x) => s + x.ass, 0) / bk.length, crn: bk.reduce((s, x) => s + x.crn, 0) / bk.length } : null;
    // where the time goes on the lap, by what the pedals were doing: braking, part throttle / coasting, flat out
    const by = { brake: 0, part: 0, flat: 0 }; for (const x of rows) { const dt = ds / Math.max(x.u / 3.6, 5); if (x.brk > 0.05) by.brake += dt; else if (x.thr < 0.95) by.part += dt; else by.flat += dt; }
    const dump = W[0] ? rows.filter(x => x.i * ds >= W[0] && x.i * ds <= W[1] && x.i % 2 === 0).map(x => `${(x.i * ds).toFixed(0)}m plan ${x.plan.toFixed(0)} u ${x.u.toFixed(0)} thr ${x.thr.toFixed(2)} brk ${x.brk.toFixed(2)} gF ${x.gF.toFixed(2)} gR ${x.gR.toFixed(2)} slip ${x.slip.toFixed(2)} off ${x.off.toFixed(1)} K ${(T.K[x.i] * 1000).toFixed(1)}`) : [];
    return { dump, bsum, by, lapT, planT, lost, refGrip: race.refGrip, C, tg: rows.reduce((s, x) => s + x.tg, 0) / rows.length };
  }, [id, TRK, diff, +temps, tyre, +laps, JSON.parse(process.env.EXTRA || '{}'), [+(process.env.FROM || 0), +(process.env.TO || 0)], process.env.LATE != null ? +process.env.LATE : null]);
  console.log(`${id} ${TRK} ${diff} temps ${temps} ${tyre}: lap ${r.lapT.toFixed(2)} s, the plan itself ${r.planT.toFixed(2)} s, lost vs plan ${r.lost.toFixed(2)} s, mean tempGrip ${r.tg.toFixed(3)}`);
  for (const d of r.dump) console.log('    ' + d);
  if (r.bsum) console.log(`  braking (brake >85%, ${r.bsum.n} samples): made ${(r.bsum.dec/9.81).toFixed(2)} g, plan assumes ${(r.bsum.ass/9.81).toFixed(2)} g, cornering grip ${(r.bsum.crn/9.81).toFixed(2)} g`);
  console.log(`  time by pedal: brake ${r.by.brake.toFixed(1)} s, part throttle ${r.by.part.toFixed(1)} s, flat ${r.by.flat.toFixed(1)} s`);
  if (!process.env.CORN) process.exit(0);
  for (const c of r.C) console.log('  ' + c);
} finally { await b.close(); server.kill(); }
