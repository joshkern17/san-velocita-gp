// Pick apart a session file (saves/sessions/, written by js/session.js): where your laps beat the AI's, corner by corner.
//   node tools/session.mjs              the newest session
//   node tools/session.mjs --list       the sessions there are
//   node tools/session.mjs 3            the 3rd newest      (or a path to a .json)
//   --vs <name|car>                     the AI lap to hold yours against (default: an AI in your car, else the quickest)
//   --lap <n>                           your lap n instead of your best
// Speeds km/h, distances m. "plan" = the speed the AI learned it can take at that corner in its car (car.lineV), the
// slowest point of it; if you're quicker than the AI's plan, it's the learned limits that hold it back, not its driving.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyze } from '../js/telemetry.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'saves', 'sessions');
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const vsArg = opt('--vs'), lapArg = opt('--lap');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort().reverse() : [];
if (args.includes('--list')) { files.forEach((f, i) => console.log(String(i + 1).padStart(3), f)); process.exit(0); }
const pick = args[0];
const file = pick && fs.existsSync(pick) ? pick : files[(+pick || 1) - 1] && path.join(DIR, files[(+pick || 1) - 1]);
if (!file) { console.log('No session files in saves/sessions/ yet: drive a session on the game\'s own server (port 8000).'); process.exit(1); }
const S = JSON.parse(fs.readFileSync(file, 'utf8'));

const kmh = (v) => v == null || !isFinite(v) ? '  -' : String(Math.round(v * 3.6)).padStart(3);
const mm = (x) => x == null || !isFinite(x) ? '  -' : String(Math.round(x)).padStart(3);
const sec = (t) => t == null || !isFinite(t) ? '-' : `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
const sgn = (x, d = 2) => (x >= 0 ? '+' : '') + x.toFixed(d);
const median = (a) => { const b = a.filter(isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

const tr = S.track, n = tr.n, T = { N: tr.open ? tr.N : n, ds: tr.ds, open: tr.open, finish: n - 1 };
const se = S.session, o = se.opts || {}, pl = S.player;
console.log(`\n${path.basename(file)}`);
console.log(`${tr.name} (${(tr.L / 1000).toFixed(2)} km) · ${se.kind} · difficulty ${o.difficulty || '?'} · AI cars ${o.aiChassis || o.aiCars || '?'} · balanced ${se.balanced} · ${se.rain ? 'wet' : 'dry'} · ${se.input} · ${o.gearbox || ''}`);
if (se.aids) console.log('aids', JSON.stringify(se.aids));
if (se.diff) console.log('difficulty table', JSON.stringify(se.diff));

// ---------- lap times: you and the field ----------
const validLaps = (c) => c.laps.filter((t, i) => c.valid[i] !== false && t > 0);
const my = validLaps(pl), myBest = Math.min(...my), myMed = median(my);
console.log(`\nYOU  ${pl.carId}  best ${sec(myBest)}  median ${sec(myMed)}  laps ${pl.laps.length}  finished P${pl.pos || '?'}  power ${pl.power?.toFixed(3)} grip ${pl.grip?.toFixed(3)}`);
const rows = S.ai.map(a => ({ a, best: Math.min(...validLaps(a)), med: median(validLaps(a)) })).filter(r => isFinite(r.best)).sort((x, y) => x.best - y.best);
if (rows.length) {
  console.log(`\n  AI (race laps)                    car                 best      vs you   median   traffic+  pace  power  grip  skill`);
  for (const r of rows) console.log(`  ${pad(r.a.name, 32)}  ${pad(r.a.carId, 18)} ${sec(r.best)}  ${sgn((r.best / myBest - 1) * 100, 1).padStart(6)}%  ${sec(r.med)}  ${sgn((r.med / r.best - 1) * 100, 1).padStart(6)}%  ${r.a.pace?.toFixed(3)}  ${r.a.power?.toFixed(2)}  ${r.a.grip?.toFixed(3)}  ${r.a.skill ?? '-'}`);
  console.log(`  field: best of bests ${sgn((rows[0].best / myBest - 1) * 100, 1)}%, median best ${sgn((median(rows.map(r => r.best)) / myBest - 1) * 100, 1)}% vs your best`);
}
if (S.field) {
  const F = S.field.list.slice().sort((x, y) => x.pot - y.pot);
  console.log(`\n  AI (simulated ${se.kind} laps)   car                 potential  vs you   pace  power`);
  for (const e of F) console.log(`  ${pad(e.name, 32)}  ${pad(e.carId, 18)} ${sec(e.pot)}  ${sgn((e.pot / myBest - 1) * 100, 1).padStart(6)}%  ${e.pace?.toFixed(3)}  ${e.power?.toFixed(2)}`);
}

// ---------- your lap vs one AI lap, corner by corner ----------
const mine = (pl.lapsData || []).filter(l => l && l.ch);
const me = lapArg ? mine.find(l => l.lap === +lapArg) : mine.filter(l => l.valid).reduce((b, l) => (!b || l.time < b.time ? l : b), null);
const cands = S.ai.filter(a => a.bestLap).map(a => ({ name: a.name, carId: a.carId, lap: a.bestLap, plan: a.plan }));
if (S.field && S.field.quickest && S.field.quickest.lap) { const q = S.field.quickest; cands.push({ name: q.name + ' (simulated)', carId: q.carId, lap: q.lap, plan: null }); }
const vs = vsArg ? cands.find(c => (c.name + ' ' + c.carId).toLowerCase().includes(vsArg.toLowerCase()))
  : cands.filter(c => c.carId === pl.carId).sort((x, y) => x.lap.time - y.lap.time)[0] || cands.sort((x, y) => x.lap.time - y.lap.time)[0];
if (!me || !vs) { console.log('\n(no full lap of yours or the AI\'s to compare)'); process.exit(0); }

const an = analyze(me, vs.lap, T, tr.corners);
const planMin = (plan, c) => { if (!plan) return null; let m = Infinity; for (let i = Math.max(0, c.entry - 10); i <= Math.min(n - 1, c.exit + 10); i++) m = Math.min(m, plan[i]); return m; };
const s = (lap, i) => lap.ch.s[i], w = (i) => tr.W[i] / 2;
const edge = (lap, i) => { const x = s(lap, i); return `${x >= 0 ? 'R' : 'L'}${Math.abs(x).toFixed(1)}`; }; // (metres off the centre)
console.log(`\nYour lap ${me.lap} ${sec(me.time)} (${me.tyre}) vs ${vs.name} ${vs.carId} lap ${vs.lap.lap ?? '-'} ${sec(vs.lap.time)} (${vs.lap.tyre || ''}): ${sgn(me.time - vs.lap.time, 3)} s`);
console.log('  + = you lose, - = you gain. brake = m before the apex the brakes go on; min/plan = slowest point; line = m off the centre at entry/apex/exit (half width)');
console.log(`  corner                      time    brake you/AI   min you/AI  plan you/AI   thr-on you/AI   exit you/AI   line you: entry apex exit | AI: entry apex exit`);
for (const c of an.corners) {
  const C = tr.corners.find(k => k.n === c.n) || c, y = c.you, t = c.them;
  console.log(`  ${pad(`T${c.n} ${C.name || ''} ${c.dir > 0 ? 'R' : 'L'}`, 24)} ${sgn(c.loss, 3).padStart(7)}   ${mm(y.brakeDist)} /${mm(t.brakeDist)}     ${kmh(y.minV)} /${kmh(t.minV)}    ${kmh(planMin(pl.plan, C))} /${kmh(planMin(vs.plan, C))}       ${mm(y.thrDist)} /${mm(t.thrDist)}       ${kmh(y.exitV)} /${kmh(t.exitV)}    ${edge(me, C.entry)} ${edge(me, C.apex)} ${edge(me, C.exit)} (${w(C.apex).toFixed(1)}) | ${edge(vs.lap, C.entry)} ${edge(vs.lap, C.apex)} ${edge(vs.lap, C.exit)}`);
}

// ---------- the whole lap: where the time is ----------
let brake = 0, mid = 0, exit = 0, straight = 0;
const d = an.delta; // (your time minus theirs, cumulative, per sample)
for (let i = 1; i < n; i++) {
  const g = d[i] - d[i - 1], b = me.ch.brk[i] > 0.1 || vs.lap.ch.brk[i] > 0.1, full = me.ch.thr[i] > 0.95 && vs.lap.ch.thr[i] > 0.95;
  const inC = tr.corners.some(c => i >= c.entry && i <= c.exit);
  if (b) brake += g; else if (inC) mid += g; else if (full) straight += g; else exit += g;
}
const top = (lap) => Math.max(...lap.ch.v.slice(0, n)), fullT = (lap) => lap.ch.thr.slice(0, n).filter(x => x > 0.95).length / n;
console.log(`\nWhere it goes (+ you lose): braking ${sgn(brake)}  mid-corner ${sgn(mid)}  exits / part throttle ${sgn(exit)}  flat out ${sgn(straight)}`);
console.log(`top speed ${kmh(top(me))} / ${kmh(top(vs.lap))} km/h · flat out ${(fullT(me) * 100).toFixed(0)}% / ${(fullT(vs.lap) * 100).toFixed(0)}% of the lap · off-track samples ${me.ch.aid.filter(a => a & 128).length} / ${vs.lap.ch.aid.filter(a => a & 128).length}`);
const gains = an.corners.filter(c => c.loss < -0.02).sort((x, y) => x.loss - y.loss).slice(0, 6);
if (gains.length) {
  console.log('\nYour biggest gains:');
  for (const c of gains) {
    const C = tr.corners.find(k => k.n === c.n) || c, y = c.you, t = c.them, why = [];
    if (y.brakeDist != null && t.brakeDist != null && t.brakeDist - y.brakeDist > 8) why.push(`brakes ${Math.round(t.brakeDist - y.brakeDist)} m later`);
    if (y.minV - t.minV > 1) why.push(`${Math.round((y.minV - t.minV) * 3.6)} km/h more at the slowest point`);
    const pm = planMin(vs.plan, C); if (pm != null && y.minV > pm + 1) why.push(`quicker than the AI's own plan (${kmh(pm).trim()})`);
    if (y.thrDist != null && t.thrDist != null && t.thrDist - y.thrDist > 10) why.push(`throttle ${Math.round(t.thrDist - y.thrDist)} m sooner`);
    if (y.exitV - t.exitV > 1) why.push(`${Math.round((y.exitV - t.exitV) * 3.6)} km/h more on exit`);
    if (t.off > 4 || t.slide > 10 || t.under > 12) why.push(`AI ${t.off > 4 ? 'off the road' : t.slide > 10 ? 'sliding the rear' : 'pushing the front'}`);
    console.log(`  T${c.n} ${C.name || ''}: ${c.loss.toFixed(3)} s · ${why.join(', ') || 'a bit quicker all through'}`);
  }
}
console.log('');
