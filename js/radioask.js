// Ask the engineer: the questions you can put on the radio while you drive (d-pad right / T), and their answers.
// The menu is two levels: who (you, the car ahead, the car behind, the leader or the session's fastest, your teammate)
// and what (pace, tires, the gap, where you're losing time, the pit window). Only the rows that apply are offered.
// An answer is { msg (the radio panel's text, numbers in <b>), say (what the engineer says: clip ids from the lines
// file's [engp] section, stitched by vo.js engSay) }. Your engineer's skill (opts.engineer 0..5: World
// Career's data engineer) sets how exact it is: a good one gives tenths and reads the other cars' tires closely, a
// poor one says "about a second" and guesses. Other teams' tire wear is never known exactly: it's read off how long
// their set has run and their lap times, as a real pit wall would.

import { fmtTime } from './hud.js';
import { analyze } from './telemetry.js';
import { nameCorners } from './realtracks.js';
import { fmtSpeed } from './lapreview.js';

const surname = (c) => c.isPlayer ? 'You' : String(c.name).trim().split(/\s+/).pop().toLowerCase().replace(/(^|[-'])\w/g, m => m.toUpperCase());
const TYRE = { soft: 'softs', medium: 'mediums', hard: 'hards', wet: 'wets', dirt: 'dirt tires' };
const skillOf = (R) => Math.max(0, Math.min(5, R.opts.engineer ?? 3));
const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

// a time difference as your engineer would say it: tenths (a good one), halves, or "about a second"
export function amount(R, s) {
  s = Math.abs(s);
  const k = skillOf(R);
  if (k >= 3 || s >= 3) return s < 0.05 ? 'nothing' : `<b>${s.toFixed(1)}</b>`;
  if (k >= 1) { const h = Math.round(s * 2) / 2; return h === 0 ? 'a couple of tenths' : h === 0.5 ? 'about <b>half a second</b>' : `about <b>${h.toFixed(1)}</b>`; }
  return s < 0.6 ? 'a bit' : s < 1.5 ? 'about <b>a second</b>' : `about <b>${Math.round(s)} seconds</b>`;
}

// ---------- the spoken answer: clip ids (assets/voice/engp/), stitched ----------
const V = (...ids) => ids.map(x => 'engp.' + x);
// a whole number: 0-20 as they are, then tens and units ("thirty" "four"), 100 and up as "over a hundred"
function sayNum(n) {
  n = Math.max(0, Math.round(n));
  if (n <= 20) return V('n.' + n);
  if (n >= 100) return V('n.100');
  const t = Math.floor(n / 10) * 10, u = n % 10;
  return u ? V('n.' + t, 'n.' + u) : V('n.' + t);
}
// amount(), spoken: "point four", "one point four", "two seconds", "about half a second", "a bit"
function sayAmount(R, s) {
  s = Math.abs(s);
  const k = skillOf(R), dec = (x) => { const i = Math.floor(x + 1e-6), d = Math.round((x - i) * 10) % 10; return i === 0 ? V('pt.' + d) : d ? [...sayNum(i), ...V('pt.' + d)] : [...sayNum(i), ...V(i === 1 ? 'u.sec1' : 'u.sec')]; };
  if (k >= 3 || s >= 3) { if (s < 0.05) return V('amt.none'); if (s >= 60) return V('amt.min'); return s >= 10 ? [...sayNum(s), ...V('u.sec')] : dec(Math.round(s * 10) / 10); }
  if (k >= 1) { const h = Math.round(s * 2) / 2; return h === 0 ? V('amt.couple') : h === 0.5 ? V('amt.half') : [...V('about'), ...dec(h)]; }
  return s < 0.6 ? V('amt.bit') : s < 1.5 ? V('amt.sec') : [...V('about'), ...sayNum(s), ...V('u.sec')];
}
const sayLaps = (n) => n <= 1 ? V('u.alap') : [...sayNum(n), ...V('u.laps')];
const sayPct = (w) => V('pct.' + Math.max(5, Math.min(100, Math.round(w * 20) * 5)));
const sayTurn = (n) => n >= 1 && n <= 20 ? V('turn.' + n) : [...V('turn'), ...sayNum(n)];
const sayPos = (n) => n >= 1 && n <= 24 ? V('p.' + n) : [...V('p'), ...sayNum(n)];
const COMPOUND = { soft: 't.soft', medium: 't.medium', hard: 't.hard', wet: 't.wet', dirt: 't.dirt' };
const sayTyre = (c) => V(COMPOUND[c] || 't.medium');
// who it's about, as the sentence's start: "Car ahead's", "The leader's"...
const SUBJ = { ahead: 's.ahead', behind: 's.behind', leader: 's.leader', fastest: 's.fastest', mate: 's.mate' };

// a car's pace right now: the average of its last three laps (not a standing start, not one with a stop or a spin in
// it: anything 4% over the others). null: no laps yet.
export function recentPace(R, c) {
  const L = (c.lapTimes || []).slice(R.mode === 'race' ? 1 : 0).filter(t => t > 0);
  if (!L.length) return c.last > 0 && isFinite(c.last) ? c.last : null;
  const last = L.slice(-5), med = [...last].sort((a, b) => a - b)[Math.floor(last.length / 2)];
  const ok = last.filter(t => t < med * 1.04).slice(-3);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}

// tire wear a lap on the set it's on now, measured (each lap's wear: wearLog, kept by completeLap), else what the
// compound's life says. The worse axle.
export function wearRate(R, c) {
  const log = c.wearLog || [], set = [];
  for (let k = log.length - 1; k >= 0; k--) { const e = log[k]; if (e.c !== c.phys.tyre.c || (set.length && e.w < set[0].w - 1e-4)) break; set.unshift(e); }
  if (set.length >= 2) { const a = set[Math.max(0, set.length - 4)], b = set[set.length - 1], n = b.lap - a.lap; if (n > 0 && a.w - b.w > 0) return (a.w - b.w) / n; }
  const life = R.tyreLife(c.phys.tyre.c);
  return isFinite(life) ? 0.7 / life : 0;
}
const worstOf = (c) => Math.min(c.phys.tyre.wf, c.phys.tyre.wr);
// laps until the set's at the cliff (30% left: grip falls away below it, physics.js wearGrip)
export function lapsToCliff(R, c) { const r = wearRate(R, c), w = worstOf(c); return r > 0 ? Math.max(0, (w - 0.3) / r) : Infinity; }

// how worn another car's tires look from the pit wall: the truth, blurred by how good your engineer is (the same
// guess for that car for a lap, so asking twice doesn't give two answers)
function guessWear(R, c) {
  const k = skillOf(R), err = [0.16, 0.12, 0.09, 0.06, 0.04, 0.025][k], g = (c.wearGuess ||= {});
  if (g.lap !== c.lap) { g.lap = c.lap; g.n = (Math.random() * 2 - 1) * err; }
  return Math.max(0, Math.min(1, worstOf(c) + g.n));
}
const WEAR = ['They look <b>fresh</b>.', 'They look <b>good</b>.', 'They\'re <b>past their best</b>.', 'They\'re <b>going off</b>.', 'They\'re <b>gone</b>.'];
const wearK = (w) => w > 0.9 ? 0 : w > 0.7 ? 1 : w > 0.5 ? 2 : w > 0.32 ? 3 : 4;
const lapsText = (n) => n <= 1 ? 'a lap' : `${n} laps`;

// how far apart two cars are: { s (seconds), laps (whole laps, when it's that much) }. The timing line when it has it
// (race.js timeBehind), else the distance at the slower one's pace (a lapped car, or the line's been overwritten)
export function gapOf(R, car, o) {
  const [b, a] = o.pos < car.pos ? [car, o] : [o, car], laps = Math.floor((a.raw - b.raw) / R.T.L);
  if (laps >= 1) return { s: null, laps };
  const g = R.timeBehind(b, a); if (g != null) return { s: g, laps: 0 };
  const p = recentPace(R, b) || R.baseLap();
  return { s: Math.max(0, a.raw - b.raw) / (R.T.L / p), laps: 0 };
}

// the cars around you: the one ahead and behind in your class, the leader, the session's quickest, your teammate
export function neighbours(R, car) {
  const run = (R.order || R.cars).filter(o => !o.gone && (!R.multi || o.cls === car.cls)), i = run.indexOf(car);
  const ahead = i > 0 ? run[i - 1] : null, behind = i >= 0 && i < run.length - 1 ? run[i + 1] : null;
  const leader = run[0] && run[0] !== car && run[0] !== ahead ? run[0] : null;
  const fastest = run.filter(o => o !== car && isFinite(o.best)).sort((a, b) => a.best - b.best)[0] || null;
  const mate = R.mateCar ? R.mateCar() : null;
  return { ahead, behind, leader, fastest, mate: mate && mate !== car ? mate : null };
}

// the menu as it stands: [{ key, label, sub (who, and the gap), items: [{ key, label }] }]
export function radioMenu(R, car) {
  const race = R.mode === 'race', N = neighbours(R, car), out = [];
  const gapTo = (o) => { const g = gapOf(R, car, o); return (o.pos < car.pos ? '+' : '−') + (g.laps ? `${g.laps} LAP${g.laps > 1 ? 'S' : ''}` : g.s.toFixed(1)); };
  const me = [{ key: 'pace', label: 'Pace' }, { key: 'tires', label: 'Tires' }, { key: 'lose', label: 'Where am I losing time' }];
  if (race && R.pit && car.plan) me.push({ key: 'pit', label: 'Pit window' });
  out.push({ key: 'me', label: 'Me', sub: race ? `P${R.multi ? R.classPos(car).pos : car.pos}` : isFinite(car.best) ? fmtTime(car.best, 3) : '', items: me });
  const them = [{ key: 'pace', label: 'Pace' }, { key: 'tires', label: 'Tires' }];
  if (race) {
    if (N.ahead) out.push({ key: 'ahead', label: 'Car Ahead', sub: `${surname(N.ahead)} ${gapTo(N.ahead)}`, items: [...them, { key: 'gap', label: 'Gap' }] });
    if (N.behind) out.push({ key: 'behind', label: 'Car Behind', sub: `${surname(N.behind)} ${gapTo(N.behind)}`, items: [...them, { key: 'gap', label: 'Gap' }] });
    if (N.leader) out.push({ key: 'leader', label: 'Leader', sub: surname(N.leader), items: [...them, { key: 'gap', label: 'Gap' }] });
  } else if (N.fastest) out.push({ key: 'fastest', label: 'Fastest Car', sub: `${surname(N.fastest)} ${fmtTime(N.fastest.best, 3)}`, items: them });
  if (N.mate) {
    // (orders, in a race: let me by / hold position only when they're right there)
    const orders = !race ? [] : [
      ...(N.ahead === N.mate && (gapOf(R, car, N.mate).s ?? 9) < 2 ? [{ key: 'letby', label: 'Let me by' }] : []),
      ...(N.behind === N.mate && (gapOf(R, car, N.mate).s ?? 9) < 2 ? [{ key: 'hold', label: 'Hold position' }] : []),
      { key: 'push', label: 'Push' }, { key: 'save', label: 'Save tires' }];
    out.push({ key: 'mate', label: 'Teammate', sub: `${surname(N.mate)}${race ? ' ' + gapTo(N.mate) : ''}`, items: [{ key: 'both', label: 'Pace & tires' }, ...orders] });
  }
  return out;
}

// the answer to who.what (e.g. 'ahead.pace'): { msg } or null (nothing to say: the car's gone)
export function ask(R, car, q) {
  const [who, what] = q.split('.'), N = neighbours(R, car);
  if (who === 'me') return what === 'pace' ? myPace(R, car) : what === 'tires' ? myTires(R, car) : what === 'lose' ? losing(R, car, N) : what === 'pit' ? pitWindow(R, car) : null;
  const o = N[who]; if (!o) return { msg: 'Lost them on the data, sorry. Ask again.', say: V('lost') };
  if (who === 'mate' && what === 'both') { const a = theirPace(R, car, o, who), b = theirTires(R, car, o, who); return { msg: a.msg + ' ' + b.msg.replace(/^[^:]+: /, ''), say: [...a.say, ...b.say] }; }
  if (who === 'mate' && /^(letby|hold|push|save)$/.test(what)) return R.mateOrder(what);
  return what === 'pace' ? theirPace(R, car, o, who) : what === 'tires' ? theirTires(R, car, o, who) : what === 'gap' ? gapTrend(R, car, o, who) : null;
}

function myPace(R, car) {
  const p = recentPace(R, car);
  if (p == null) return { msg: 'No clean laps yet. Give me one and I\'ll have numbers.', say: V('nolaps') };
  let msg = `Averaging <b>${fmtTime(p, 1)}</b>`, say = [];
  if (isFinite(car.best) && p - car.best > 0.05) { msg += `, ${amount(R, p - car.best)} off your best`; say.push(...V('youre'), ...sayAmount(R, p - car.best), ...V('offbest')); }
  else say.push(...V('onbest'));
  msg += '.';
  // (where that ranks: everyone's recent pace, in your class)
  const field = (R.order || R.cars).filter(o => !o.gone && !o.finished && (!R.multi || o.cls === car.cls)).map(o => ({ o, p: recentPace(R, o) })).filter(x => x.p != null).sort((a, b) => a.p - b.p);
  const k = field.findIndex(x => x.o === car);
  if (field.length > 2 && k >= 0) { msg += k === 0 ? ' <b>Quickest</b> on track right now.' : ` <b>${ord(k + 1)}</b> quickest out there, ${amount(R, p - field[0].p)} off ${surname(field[0].o)}.`; say.push(...V(k === 0 ? 'rank.1' : k < 10 ? 'rank.' + (k + 1) : 'rank.back')); }
  return { msg, say };
}

function myTires(R, car) {
  const t = car.phys.tyre, w = worstOf(car), pct = Math.round(w * 100);
  if (!R.wearK) return { msg: `Tire wear's off today. ${TYRE[t.c] ? TYRE[t.c][0].toUpperCase() + TYRE[t.c].slice(1) : 'They'} will last forever.`, say: V('nowear') };
  const ax = t.wf < t.wr - 0.03 ? 'fronts' : t.wr < t.wf - 0.03 ? 'rears' : null, axle = ax ? ` ${ax === 'fronts' ? 'Fronts' : 'Rears'} are wearing faster.` : '', axSay = ax ? V(ax) : [];
  if (w <= 0.3) return { msg: `Tires are at <b>${pct}%</b>. That's the cliff: you'll feel it everywhere.${axle}`, say: [...V('tiresat'), ...sayPct(w), ...V('cliff'), ...axSay] };
  const n = lapsToCliff(R, car), cliffLap = car.lap + Math.floor(n);
  let msg = `${TYRE[t.c] ? TYRE[t.c][0].toUpperCase() + TYRE[t.c].slice(1) : 'Tires'} at <b>${pct}%</b>.`, say = [...V('tiresat'), ...sayPct(w)];
  if (isFinite(n)) {
    const left = isFinite(R.laps) ? R.laps - car.lap + 1 : Infinity;
    msg += n >= left ? ' They\'ll make the flag.' : n < 1 ? ' They\'ll drop off <b>this lap</b>.' : ` About <b>${lapsText(Math.round(n))}</b> before they drop off${R.mode === 'race' && isFinite(R.laps) ? `, lap ${cliffLap}` : ''}.`;
    say.push(...(n >= left ? V('makeflag') : n < 1 ? V('dropthis') : [...V('about'), ...sayLaps(Math.round(n)), ...V('dropoff')]));
  }
  return { msg: msg + axle, say: [...say, ...axSay] };
}

function pitWindow(R, car) {
  const nx = R.nextPlannedStop(car), n = lapsToCliff(R, car), P = R.pitProjection(car);
  let msg = nx ? `Plan is lap <b>${nx.lap}</b> for <b>${nx.tyre.toUpperCase()}S</b>.` : 'No more stops planned.';
  const say = nx ? [...V('planlap'), ...sayNum(nx.lap), ...V('for'), ...sayTyre(nx.tyre)] : V('nostops');
  if (nx && isFinite(n)) { const cliff = car.lap + Math.floor(n); msg += cliff < nx.lap ? ` Tires won't make it: box by lap ${cliff}.` : cliff > nx.lap + 2 ? ` Tires could go to lap ${cliff}.` : '';
    if (cliff < nx.lap) say.push(...V('wontmake'), ...sayNum(cliff)); else if (cliff > nx.lap + 2) say.push(...V('couldgo'), ...sayNum(cliff)); }
  if (P && nx) { msg += ` Stop now: out <b>P${P.pos}</b>${P.ahead ? `, ${amount(R, P.aheadBy)} behind ${surname({ name: P.ahead })}` : ''}.`; say.push(...V('stopnow'), ...sayPos(P.pos)); }
  return { msg, say };
}

function theirPace(R, car, o, key) {
  const a = recentPace(R, o), b = recentPace(R, car), who = surname(o), subj = V(SUBJ[key] || 's.ahead');
  if (a == null) return { msg: `No laps from ${who} yet.`, say: V('nolapsthem') };
  let msg = `${who}: <b>${fmtTime(a, 1)}</b>`, say = [];
  if (b != null) { const d = a - b; msg += Math.abs(d) < 0.08 ? ', same as you.' : d < 0 ? `, ${amount(R, d)} a lap <b>quicker</b> than you.` : `, ${amount(R, d)} a lap <b>slower</b> than you.`;
    say = Math.abs(d) < 0.08 ? [...subj, ...V('samepace')] : [...subj, ...sayAmount(R, d), ...V(d < 0 ? 'quicker' : 'slower')]; }
  else msg += '.';
  // (practice, qualifying: best laps against each other)
  if (isFinite(o.best) && isFinite(car.best) && R.mode !== 'race') { msg += ` Best ${fmtTime(o.best, 3)}, ${amount(R, o.best - car.best)} ${o.best < car.best ? 'up on' : 'down on'} yours.`;
    say.push(...V('theirbest'), ...sayAmount(R, o.best - car.best), ...V(o.best < car.best ? 'upon' : 'downon')); }
  return { msg, say };
}

function theirTires(R, car, o, key) {
  const who = surname(o), c = o.phys.tyre.c, laps = Math.max(0, o.lap - (o.stintLap || 1));
  const set = `${laps ? `${laps} lap${laps > 1 ? 's' : ''} on ` : 'Fresh '}${TYRE[c] || c}`;
  // ("Car ahead's four laps into their mediums" / "on a fresh set of mediums")
  const setSay = [...V(SUBJ[key] || 's.ahead'), ...(laps ? [...(laps === 1 ? V('lapin') : [...sayNum(laps), ...V('lapsin')])] : V('freshset')), ...sayTyre(c)];
  if (!R.wearK) return { msg: `${who}: ${TYRE[c] || c}. No wear today.`, say: [...setSay, ...V('nowear')] };
  if (o.remote) return { msg: `${who}: ${set}. No data on their wear.`, say: [...setSay, ...V('nodata')] };
  if (R.mateCar && R.mateCar() === o) return { msg: `${who}: ${set}, at <b>${Math.round(worstOf(o) * 100)}%</b>.`, say: [...setSay, ...V('theyreat'), ...sayPct(worstOf(o))] }; // (your own team's car: the real figure)
  const w = guessWear(R, o), mine = worstOf(car);
  let msg = `${who}: ${set}. ${WEAR[wearK(w)]}`;
  const say = [...setSay, ...V('w.' + wearK(w))];
  const k = skillOf(R);
  if (k >= 2) { const s = Math.abs(w - mine) < 0.06 ? 'same' : w > mine ? 'better' : 'worse'; msg += { same: ' About the same as yours.', better: ' Better than yours.', worse: ' Worse than yours.' }[s]; say.push(...V('cmp.' + s)); }
  if (o.plan && R.mode === 'race' && k >= 3) { const nx = R.nextPlannedStop(o); if (nx && nx.lap - o.lap <= 3 && nx.lap >= o.lap && w < 0.7) { msg += ' Expect them to stop soon.'; say.push(...V('stopsoon')); } }
  return { msg, say };
}

function gapTrend(R, car, o, key) {
  const who = surname(o), ahead = o.pos < car.pos, G = gapOf(R, car, o), g = G.s, subj = V(SUBJ[key] || 's.ahead');
  if (G.laps) return { msg: ahead ? `${who} is <b>${lapsText(G.laps)}</b> up the road.` : `${who} is <b>${lapsText(G.laps)}</b> down on you.`, say: [...subj, ...sayLaps(G.laps), ...V(ahead ? 'upahead' : 'downonyou')] };
  const a = recentPace(R, o), b = recentPace(R, car), close = g < 0.15;
  let msg = close ? `${who} is <b>right there</b> with you.` : `${who} is ${amount(R, g)} ${ahead ? 'up the road' : 'behind'}.`;
  const say = close ? [...subj, ...V('rightthere')] : [...subj, ...sayAmount(R, g), ...V(ahead ? 'upahead' : 'behindyou')];
  if (a == null || b == null) return { msg, say };
  const d = ahead ? a - b : b - a; // (> 0: the gap's closing)
  if (Math.abs(d) < 0.08) return { msg: msg + ' The gap\'s holding.', say: [...say, ...V('holding')] };
  if (d > 0) { const n = Math.max(1, Math.round(Math.max(0, g - 0.5) / d)); msg += ahead ? ` Closing ${amount(R, d)} a lap: on them in about <b>${lapsText(n)}</b>.` : ` They're closing ${amount(R, d)} a lap: on you in about <b>${lapsText(n)}</b>.`;
    say.push(...V(ahead ? 'youreclosing' : 'theyreclosing'), ...sayAmount(R, d), ...V('u.alap'), ...V(ahead ? 'onthemin' : 'onyouin'), ...sayLaps(n)); }
  else { msg += ahead ? ` They're pulling away, ${amount(R, d)} a lap.` : ` You're pulling away, ${amount(R, d)} a lap.`; say.push(...V(ahead ? 'theyrepulling' : 'yourepulling'), ...sayAmount(R, d), ...V('u.alap')); }
  return { msg, say };
}

// ---------- where am I losing time ----------
// Your last lap, corner by corner (telemetry.js analyze: the stretch from halfway down the straight before each corner
// to halfway down the one after), against the car ahead's last lap (a race: the AI's laps are recorded, aiRec), the
// session's quickest car's best lap (practice, qualifying), or your own best. The two corners you lost most in, and why.
const WHY = { hit: 'you hit the wall', off: 'you ran wide off the road', lock: 'locking up', late: 'braking too late and overshooting', early: 'braking too early',
  under: 'understeer on the way in', min: 'too slow at the apex', thr: 'late on the throttle', coast: 'coasting between the pedals', slide: 'the rear sliding on exit', tc: 'traction control on exit', exit: 'a slow exit' };
function losing(R, car, N) {
  const mine = (R.sessLaps || []).filter(l => l.ch);
  if (!mine.length) return { msg: 'Need a full lap of data first.', say: V('needlap') };
  const best = mine.filter(l => l.valid).reduce((b, l) => (!b || l.time < b.time ? l : b), null);
  // (your most recent representative lap: not one with a stop or a spin in it)
  const rep = [...mine].reverse().find(l => !best || l.time < best.time * 1.03) || mine[mine.length - 1];
  const rec = (o) => { const r = o && R.aiRec && R.aiRec.get(o); if (!r) return null; return r.last && (!r.best || r.last.time < r.best.time * 1.03) ? r.last : r.best; };
  let cmp = null, vs = '', vsKey = '';
  const other = R.mode === 'race' ? (N.ahead && rec(N.ahead) ? N.ahead : N.fastest) : N.fastest;
  if (other && rec(other)) { cmp = rec(other); vs = `${surname(other)}`; vsKey = other === N.ahead ? 'vs.ahead' : 'vs.fastest'; }
  else if (best && best !== rep) { cmp = best; vs = 'your best'; vsKey = 'vs.best'; }
  if (!cmp && R.referenceTelemetry) { cmp = R.referenceTelemetry(car.carId, car.phys.tyre.c); vs = 'our ideal lap'; vsKey = 'vs.ideal'; }
  if (!cmp) return { msg: 'That was your best lap. Nothing to compare yet.', say: V('needlap') };
  const an = analyze(rep, cmp, R.T, R.corners.list);
  if (R.track) nameCorners(R.track, R.T, an.corners);
  const lost = an.corners.filter(c => c.loss > 0.04).sort((a, b) => b.loss - a.loss).slice(0, 2);
  const tot = rep.time - cmp.time;
  if (!lost.length) return tot > 0.05 ? { msg: `Only small bits everywhere against ${vs}. Nothing big.`, say: [...V(vsKey), ...V('smallbits')] } : { msg: `You're matching ${vs} everywhere. Keep it up.`, say: [...V(vsKey), ...V('matching')] };
  const say = (c, first) => {
    const where = `<b>${c.name || `Turn ${c.n}`}</b>`, k = c.tips && c.tips[0] && c.tips[0].k;
    const why = k === 'min' && c.you && c.them ? `${fmtSpeed(c.them.minV - c.you.minV, R.units)} slower at the apex` : WHY[k];
    return `${first ? 'Most in' : 'Then'} ${where}, ${amount(R, c.loss)}${why ? `: ${why}` : ''}.`;
  };
  let msg = `Against ${vs}: ` + lost.map((c, k) => say(c, k === 0)).join(' ');
  // ("Against the car ahead, you're losing most in Turn four, point three, braking too early. Then Turn nine...")
  const spoken = [...V(vsKey)];
  lost.forEach((c, k) => { const why = c.tips && c.tips[0] && WHY[c.tips[0].k] ? V('why.' + c.tips[0].k) : []; spoken.push(...V(k ? 'then' : 'mostin'), ...sayTurn(c.n), ...sayAmount(R, c.loss), ...why); });
  return { msg, say: spoken };
}
