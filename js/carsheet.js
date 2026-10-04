// The car's performance panel (World Career): on screen whenever you're at the car in the garage, beside it. Six
// stats, each a bar: an amber tick where the car was when it left the factory, the bar where it is today (blue past
// the tick: better than new; a red gap short of it: worse). It follows the menu: on a part, the stats that part moves
// light up and say why ("Worn −10 hp", "Sport exhaust +6 hp"); on Rebuild / New / Remove, the bars show what doing it
// would change, before you pay. The numbers come from the car's physics spec (js/cars.js) and what's acting on it
// (WC.carBreakdown), as far as you know them: an upgrade nobody has measured counts at its maker's claim.
import * as WC from './wcareer.js';
import { CARS, carId } from './cars.js';
import { CarPhysics, torqueAt } from './physics.js';
import { physAids, PRESETS } from './aids.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const G = 9.81, MPH = 0.44704;
const ONE = { power: 1, grip: 1, brake: 1, downforce: 1, drag: 1, damage: 1 };

// ---------- the physics: what a spec does with the race's modifiers (m) ----------
// top speed: in top gear, where the drive (the power through the torque curve, as physics.js has it) meets drag and
// rolling resistance; or the rev limiter
function topSpeed(s, m) {
  const gear = s.gears[s.gears.length - 1], k = s.drag * m.drag;
  const drive = (v) => { const x = (v / gear * s.redline - s.idle) / (s.redline - s.idle);
    return Math.min(s.maxForce, s.power * m.power / Math.max(v, 1)) * (s.torque ? torqueAt(s.torque, x) : 0.85 + 0.15 * Math.sin(Math.min(1, Math.max(0, x)) * Math.PI)); };
  let lo = 0, hi = gear;
  for (let i = 0; i < 40; i++) { const v = (lo + hi) / 2; if (drive(v) > k * v * v + s.roll * v) lo = v; else hi = v; }
  return lo;
}
// 0-60 and 60-0: the car's own physics on a flat, dry plane with the standard aids, the modifiers on as in a race
// (race.js). A run takes a few milliseconds; each is kept.
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 }, DT = 1 / 240, runs = new Map();
function run(s, m, kind, v0) {
  const key = `${kind}|${v0}|${['power', 'grip', 'brake', 'downforce', 'drag'].map(k => m[k].toFixed(5)).join(',')}`, per = runs.get(s) || new Map(); runs.set(s, per);
  if (per.has(key)) return per.get(key);
  const p = new CarPhysics(s); p.setAids(physAids({ ...PRESETS.standard.aids })); p.fitTyres('medium'); p.place(0, 0, 0);
  p.powerMul = m.power; p.gripMul = m.grip; p.dfMul = m.downforce; p.dragMul = m.drag; p.brakeMul = m.brake;
  const stop = kind === 'stop', ctl = { brake: stop ? 1 : 0, throttle: stop ? 0 : 1, steer: 0, handbrake: 0, analog: true, pad: true };
  if (stop) { p.vz = v0; p.gear = Math.max(1, s.gears.findIndex(g => g > v0 * 1.1)); }
  let t = 0, out = NaN;
  for (let i = 0; i < 30 / DT; i++) {
    p.step(DT, ctl, ENV); t += DT;
    if (!stop && p.speed >= v0) { out = t; break; }
    if (stop && i > 20 && p.speed < 0.3) { out = Math.hypot(p.x, p.z); break; }
  }
  per.set(key, out); return out;
}

// ---------- the stats ----------
// val(spec, mods, imperial); fmt -> [number, unit]; lower: smaller is better; parts: what moves it
export const STATS = [
  { key: 'power', name: 'Power', parts: ['engine', 'gearbox'], val: (s, m) => s.power * m.power / 745.7, fmt: (v) => [Math.round(v), 'hp'] },
  { key: 'top', name: 'Top speed', parts: ['engine', 'gearbox', 'aero'], val: (s, m, u) => topSpeed(s, m) * (u ? 1 / MPH : 3.6), fmt: (v, u) => [Math.round(v), u ? 'mph' : 'km/h'] },
  { key: 'accel', name: '0-60 mph', name2: '0-100 km/h', lower: true, parts: ['engine', 'gearbox', 'suspension', 'aero'], val: (s, m, u) => run(s, m, 'go', u ? 60 * MPH : 100 / 3.6), fmt: (v) => [v.toFixed(2), 's'] },
  { key: 'grip', name: 'Cornering', parts: ['suspension', 'chassis', 'aero'], val: (s, m, u) => { const v = u ? 70 * MPH : 110 / 3.6; return s.mu * m.grip * (1 + s.kd * m.downforce * v * v / (s.mass * G)); }, fmt: (v) => [v.toFixed(2), 'g'] },
  { key: 'stop', name: 'Braking 60-0', name2: 'Braking 100-0', lower: true, parts: ['brakes', 'suspension', 'aero'], val: (s, m, u) => run(s, m, 'stop', u ? 60 * MPH : 100 / 3.6) * (u ? 3.281 : 1), fmt: (v, u) => [Math.round(v), u ? 'ft' : 'm'] },
  { key: 'rel', name: 'Failure risk', rel: true, parts: ['engine', 'gearbox', 'brakes', 'suspension'] },
];
const fj = ([n, unit]) => `${n} ${unit}`;
const the = (k) => `the ${WC.PARTS[k].name.toLowerCase()}`, is = (k) => (k === 'brakes' ? 'are' : 'is'), does = (k) => (k === 'brakes' ? 'do' : 'does');
const specOf = (w) => CARS[carId({ chassis: w.car.chassis })].spec;
// the race's modifiers, as you know them
const knownMods = (B) => Object.fromEntries(WC.MOD_CH.map(k => [k, WC.modOf(B[k], 'shown')]));
// where a stat sits on its bar: the car's class decides how full the factory car's bar is (the best in the class
// toward the end, the worst toward the start); a change from the factory figure is magnified so a few percent shows
const classCache = new Map();
function classRange(S, cls, u) {
  const key = `${S.key}|${cls}|${u}`; if (classCache.has(key)) return classCache.get(key);
  const vals = Object.values(CARS).filter(C => C.cls === cls).map(C => S.val(C.spec, ONE, u)), r = [Math.min(...vals), Math.max(...vals)];
  classCache.set(key, r); return r;
}
function barAt(S, v, factory, cls, u) {
  const [lo, hi] = classRange(S, cls, u), n = hi > lo ? (factory - lo) / (hi - lo) : 0.5, base = 0.35 + 0.4 * (S.lower ? 1 - n : n);
  const rel = S.lower ? factory / v : v / factory;
  return Math.max(0.03, Math.min(1, base + (rel - 1) * 3));
}

// what doing something to a part would leave the car as (a copy of the world with that change made)
function after(w, pv) {
  const P = WC.carParts(w), k = pv.part, parts = { ...P, [k]: { ...P[k] } }, w2 = { ...w, car: { ...w.car, parts } };
  if (pv.kind === 'rebuild') parts[k].cond = Math.max(P[k].cond, WC.rebuildTo(w));
  else if (pv.kind === 'self') parts[k].cond = Math.max(P[k].cond, w.background === 'mechanic' ? 0.84 : 0.72);
  else if (pv.kind === 'new') parts[k].cond = 1;
  else if (pv.kind === 'remove') parts[k].fit = null;
  else if (pv.kind === 'map') w2.grey = null;
  return w2;
}
const PREVIEW_HEAD = { rebuild: 'If you rebuild the {}', self: 'If you rebuild the {} yourself', new: 'With a new {}', remove: 'Without the {} upgrade', map: 'Without Kev\'s map' };
const riskWord = (r) => r < 0.03 ? 'Low' : r < 0.08 ? 'Some' : r < 0.15 ? 'High' : 'Very high';

export class CarPanel {
  constructor(el, src) { this.el = el; this.src = src; this.key = ''; }
  // focus: the part you're on (or null); pv: { kind, part } for an action you're on
  render(focus = null, pv = null) {
    const w = this.src.world(); if (!w || !w.car) { this.el.innerHTML = ''; this.key = ''; return; }
    const u = this.src.imperial(), s = specOf(w), cls = CARS[carId({ chassis: w.car.chassis })].cls;
    const B = WC.carBreakdown(w), mods = knownMods(B), w2 = pv ? after(w, pv) : null, mods2 = w2 ? knownMods(WC.carBreakdown(w2)) : null;
    const lvl = WC.dataLevel(w), P = WC.carParts(w);
    const rows = STATS.map(S => {
      const on = !focus || S.parts.includes(focus), name = u ? S.name : S.name2 || S.name;
      if (S.rel) {
        const r = WC.failRisk(w), r2 = w2 ? WC.failRisk(w2) : r, txt = (x) => lvl === 2 ? `${(x * 100).toFixed(1)}%` : riskWord(x);
        const f = (x) => Math.max(0.03, Math.min(1, x / 0.2)), moved = w2 && Math.abs(r2 - r) > 0.0005;
        const odds = WC.failOdds(w), why = focus && odds[focus] != null ? `${WC.PARTS[focus].name} at ${Math.round(P[focus].cond * 100)}%: ${lvl === 2 ? `${(odds[focus] * 100).toFixed(1)}% chance it fails` : `${riskWord(odds[focus] * 2).toLowerCase()} chance it fails`}`
          : focus ? `${WC.PARTS[focus].name} can't break down` : lvl === 2 ? 'Your data engineer\'s numbers' : 'Worn parts and a poor mechanic raise it';
        const val = moved ? (txt(r2) === txt(r) ? `<em class="${r2 < r ? 'gain' : 'neg'}">${r2 < r ? 'Lower' : 'Higher'}</em>` : `<s>${txt(r)}</s> &rarr; <em class="${r2 < r ? 'gain' : 'neg'}">${txt(r2)}</em>`) : `<span class="${r >= 0.08 ? 'neg' : ''}">${txt(r)}</span>`;
        return `<div class="cp-row${on ? '' : ' off'}"><div class="cp-top"><span>${name}</span><b>${val}</b></div>
          <i class="cp-bar risk"><b class="${r >= 0.08 ? 'bad' : 'base'}" style="width:${(f(Math.min(r, r2)) * 100).toFixed(1)}%"></b>${moved ? `<b class="pv${r2 > r ? ' worse' : ''}" style="left:${(f(Math.min(r, r2)) * 100).toFixed(1)}%;width:${(Math.abs(f(r2) - f(r)) * 100).toFixed(1)}%"></b>` : ''}</i>
          <small>${esc(why)}</small></div>`;
      }
      const fac = S.val(s, ONE, u), now = S.val(s, mods, u), nxt = mods2 ? S.val(s, mods2, u) : now;
      const a = barAt(S, fac, fac, cls, u), b = barAt(S, now, fac, cls, u), c = barAt(S, nxt, fac, cls, u);
      const better = (x, y) => S.lower ? x < y : x > y, same = (x, y) => fj(S.fmt(x, u)) === fj(S.fmt(y, u));
      const vs = same(now, fac) ? '' : better(now, fac) ? 'gain' : 'neg', moved = mods2 && !same(nxt, now);
      // the bar: solid to today (to the factory tick at most), past the tick in blue, short of it a red gap; a preview blinks
      const segs = [`<b class="base" style="width:${(Math.min(a, b) * 100).toFixed(1)}%"></b>`];
      if (b > a) segs.push(`<b class="up" style="left:${(a * 100).toFixed(1)}%;width:${((b - a) * 100).toFixed(1)}%"></b>`);
      if (b < a) segs.push(`<b class="down" style="left:${(b * 100).toFixed(1)}%;width:${((a - b) * 100).toFixed(1)}%"></b>`);
      if (moved) segs.push(`<b class="pv${better(nxt, now) ? '' : ' worse'}" style="left:${(Math.min(b, c) * 100).toFixed(1)}%;width:${(Math.abs(c - b) * 100).toFixed(1)}%"></b>`);
      const [n, unit] = S.fmt(now, u), [n2] = S.fmt(nxt, u), [fn] = S.fmt(fac, u);
      const val = moved ? `<s>${n}</s> &rarr; <em class="${better(nxt, now) ? 'gain' : 'neg'}">${n2}</em><small>${unit}</small>` : `<span class="${vs}">${n}</span><small>${unit}</small>`;
      return `<div class="cp-row${on ? '' : ' off'}"><div class="cp-top"><span>${name}</span><b>${val}</b></div>
        <i class="cp-track"><i class="cp-bar">${segs.join('')}</i><i class="fac" style="left:${(a * 100).toFixed(1)}%"></i></i><small>${this.why(S, s, B, mods, focus, u, fn, unit, vs)}</small></div>`;
    }).join('');
    const head = pv ? (PREVIEW_HEAD[pv.kind] || '').replace('{}', WC.PARTS[pv.part].name.toLowerCase()) : focus ? `What ${the(focus)} ${does(focus)}` : 'Performance';
    const key = head + rows;
    if (key === this.key) return; this.key = key;
    this.el.innerHTML = `<div class="cp-head${pv ? ' pv' : ''}"><b>${head}</b></div>${rows}<div class="cp-key"><i class="fac"></i>Factory car<i class="up"></i>Better<i class="down"></i>Worse${pv ? '<i class="pv"></i>Would change' : ''}</div>`;
  }
  // the line under a stat: with a part in focus, what each thing on that part does to it; otherwise against the factory
  why(S, s, B, mods, focus, u, fn, unit, vs) {
    if (!focus) return vs ? `Factory: ${fn} ${unit}` : 'Same as the factory car';
    const now = S.val(s, mods, u), bits = [];
    for (const ch of WC.MOD_CH) for (const x of B[ch]) {
      if (x.part !== focus || bits.some(b => b.label === x.label)) continue;
      // (the stat without it: every channel's item of that name taken out, an upgrade's drag along with its downforce)
      const m2 = Object.fromEntries(WC.MOD_CH.map(k => [k, WC.modOf(B[k].filter(y => !(y.part === focus && y.label === x.label)), 'shown')]));
      const d = now - S.val(s, m2, u), [a] = S.fmt(Math.abs(d), u);
      const who = x.src === 'wear' ? 'Worn' : x.src === 'dev' ? 'Development' : x.label;
      if (x.how === 'unknown') { bits.push({ label: x.label, html: `<span class="q">${esc(who)}: not measured yet</span>` }); continue; }
      if (+a === 0) continue;
      const tag = x.how === 'claimed' ? ' (maker\'s claim)' : x.how === 'rough' ? ' (roughly)' : '';
      bits.push({ label: x.label, html: `<span class="${(S.lower ? d < 0 : d > 0) ? 'gain' : 'neg'}">${esc(who)} ${d > 0 ? '+' : '−'}${a} ${unit}${tag}</span>` });
    }
    if (!bits.length && S.key === 'stop' && focus === 'brakes') return 'Pedal down with ABS, the tires set this, not the brakes';
    return bits.length ? bits.map(b => b.html).join(' &middot; ') : `${WC.PARTS[focus].name} ${is(focus) === 'are' ? 'aren\'t' : 'isn\'t'} changing this`;
  }
}

// one part, in numbers: what its wear is costing, and what a rebuild would give back (for the car menu's descriptions)
export function partEffect(w, k, imperial) {
  const s = specOf(w), P = WC.carParts(w), p = P[k], to = WC.rebuildTo(w);
  const ch = { engine: 'power', suspension: 'grip', brakes: 'brake', chassis: 'damage' }[k];
  if (!ch) return k === 'gearbox' ? 'Wear doesn\'t slow it down; it just gets likelier to fail.' : k === 'aero' ? 'Wear on the bodywork doesn\'t cost pace or reliability.' : '';
  if (ch === 'brake') return `Worn brakes squeeze less for the same pedal (${Math.round((0.9 + 0.1 * p.cond) * 100)}% of new); stamping on them with ABS, the tires stop the car.`;
  if (ch === 'damage') return `A worn chassis takes more damage in a hit (${Math.round((1.15 - 0.15 * p.cond) * 100)}% of new).`;
  const S = STATS.find(x => x.key === (ch === 'power' ? 'power' : 'grip')), f = ch === 'power' ? (x) => 0.9 + 0.1 * x : (x) => 0.96 + 0.04 * x;
  const at = (c) => S.val(s, { ...ONE, [ch]: f(c) }, imperial), fmt = (v) => fj(S.fmt(Math.abs(v), imperial));
  const cost = at(1) - at(p.cond), back = at(Math.max(p.cond, to)) - at(p.cond);
  return `${+S.fmt(cost, imperial)[0] === 0 ? 'Not costing you anything.' : `Its wear costs <b>${fmt(cost)}</b>${ch === 'grip' ? ' of cornering grip' : ''}.`}${+S.fmt(back, imperial)[0] !== 0 ? ` A rebuild gets back about ${fmt(back)}.` : ''}`;
}
