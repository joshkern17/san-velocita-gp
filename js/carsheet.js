// The car's spec sheet (World Career): game UI over the garage, in the day planner's clothes (js/dayplan.js), with
// your car beside it. Down the left, what the car does (power, top speed, 0-60, grip, braking, toughness, reliability),
// each with a bar from the factory figure to today's. Beside it, the one you're on: today's number against the
// factory's, and where the difference comes from, step by step: wear, upgrades, development, this week, the series'
// rules. The numbers come from the car's physics spec (js/cars.js) and what's acting on it (WC.carBreakdown), but only
// as far as you know them: an upgrade nobody has measured shows its maker's claim (or a ?), not what it really does.
// Controls: up / down choose, A / Enter works on the part behind that stat, B / Esc back to the car.
import * as WC from './wcareer.js';
import { CARS, carId } from './cars.js';
import { CarPhysics, torqueAt } from './physics.js';
import { physAids, PRESETS } from './aids.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const flick = (el, d = 0) => !calm() && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: d, easing: 'ease-out', fill: 'backwards' });
const G = 9.81, MPH = 0.44704, LB = 2.20462;
const ENGINE = { f1v6: '1.6 V6 turbo hybrid', v10: '3.0 V10', v8flat: 'Flat-plane V8', v8cross: 'V8', v8truck: 'Big-block V8', i6: 'Straight six', i6turbo: 'Twin-turbo straight six',
  v6turbo: 'Twin-turbo V6', v6na: 'V6', flat6: 'Flat six', flat6turbo: 'Turbo flat six', flat12: 'Flat twelve', i4turbo: 'Turbo four', diesel: 'Turbo diesel' };
const SRC_NAME = { factory: 'Factory', wear: 'Wear', parts: 'Upgrades', dev: 'Development', week: 'This week', rules: 'Series rules' };
const HOW = { claimed: 'claimed', unknown: 'not measured', rough: 'roughly' };

// ---------- the physics, roughly: what a spec does with the race's modifiers (m) ----------
const topSpeed = (s, m) => { // (m/s: in top gear, where the drive (the power, through the engine's torque curve, as
  // physics.js has it) meets drag and rolling resistance; or the rev limiter, if the gearing runs out first)
  const gear = s.gears[s.gears.length - 1], k = s.drag * m.drag;
  const drive = (v) => { const x = (v / gear * s.redline - s.idle) / (s.redline - s.idle);
    return Math.min(s.maxForce, s.power * m.power / Math.max(v, 1)) * (s.torque ? torqueAt(s.torque, x) : 0.85 + 0.15 * Math.sin(Math.min(1, Math.max(0, x)) * Math.PI)); };
  let lo = 0, hi = gear;
  for (let i = 0; i < 40; i++) { const v = (lo + hi) / 2; if (drive(v) > k * v * v + s.roll * v) lo = v; else hi = v; }
  return { v: lo, gear: lo > gear * 0.995 };
};
// 0-60 and 60-0: the car's own physics (js/physics.js) on a flat, dry plane with the standard aids, the modifiers on
// (as in a race: race.js). A run is a few milliseconds; each is kept (by spec and modifiers).
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 }, DT = 1 / 240, runs = new Map();
function run(s, m, kind, v0) {
  const key = `${kind}|${v0}|${MOD_KEYS.map(k => m[k].toFixed(5)).join(',')}`, per = runs.get(s) || new Map(); runs.set(s, per);
  if (per.has(key)) return per.get(key);
  const p = new CarPhysics(s); p.setAids(physAids({ ...PRESETS.standard.aids })); p.fitTyres('medium'); p.place(0, 0, 0);
  p.powerMul = m.power; p.gripMul = m.grip; p.dfMul = m.downforce; p.dragMul = m.drag; p.brakeMul = m.brake;
  const ctl = { brake: kind === 'stop' ? 1 : 0, throttle: kind === 'stop' ? 0 : 1, steer: 0, handbrake: 0, analog: true, pad: true };
  if (kind === 'stop') { p.vz = v0; p.gear = Math.max(1, s.gears.findIndex(g => g > v0 * 1.1)); }
  let t = 0, out = NaN;
  for (let i = 0; i < 30 / DT; i++) {
    p.step(DT, ctl, ENV); t += DT;
    if (kind === 'go' && p.speed >= v0) { out = t; break; }
    if (kind === 'stop' && i > 20 && p.speed < 0.3) { out = Math.hypot(p.x, p.z); break; }
  }
  per.set(key, out); return out;
}
const MOD_KEYS = ['power', 'grip', 'brake', 'downforce', 'drag'];
const sprint = (s, m, to) => run(s, m, 'go', to);
const stopDist = (s, m, from) => run(s, m, 'stop', from);

// ---------- the stats ----------
// val(spec, mods, imperial) -> number; fmt -> [number, unit]; lower: smaller is better; ch: the modifiers it hangs on;
// part: the part to work on for it
export const STATS = [
  { key: 'power', name: 'Power', ch: ['power'], part: 'engine', val: (s, m) => s.power * m.power / 745.7, fmt: (v) => [Math.round(v), 'hp'],
    what: 'Pulls harder out of every corner and down every straight. Each 1% more power is worth about 0.3% of a lap.' },
  { key: 'top', name: 'Top speed', ch: ['power', 'drag'], part: 'aero', val: (s, m, u) => topSpeed(s, m).v * (u ? 1 / MPH : 3.6), fmt: (v, u) => [Math.round(v), u ? 'mph' : 'km/h'],
    what: 'Flat out on the longest straight. Power raises it; a wing\'s drag lowers it.', note: (s, m) => topSpeed(s, m).gear ? 'Top gear runs out before the power does: more power won\'t raise it, only less drag or longer gearing would.' : '' },
  { key: 'accel', name: '0-60', name2: '0-100', ch: ['power', 'grip', 'drag'], part: 'engine', lower: () => true, val: (s, m, u) => sprint(s, m, u ? 60 * MPH : 100 / 3.6), fmt: (v) => [v.toFixed(2), 's'],
    what: 'From a standing start, flat out through the gears. Off the line the tires are the limit; after that, power.' },
  { key: 'grip', name: 'Grip', ch: ['grip'], part: 'suspension', val: (s, m) => s.mu * m.grip, fmt: (v) => [v.toFixed(2), 'g'],
    what: 'How hard it can corner where downforce doesn\'t help: hairpins, chicanes, slow corners. Each 1% is worth about 0.5% of a lap, more than anything else.' },
  { key: 'fast', name: 'Fast corners', ch: ['grip', 'downforce'], part: 'aero', val: (s, m, u) => { const v = u ? 100 * MPH : 160 / 3.6; return s.mu * m.grip * (1 + s.kd * m.downforce * v * v / (s.mass * G)); },
    fmt: (v) => [v.toFixed(2), 'g'], at: (u) => u ? 'at 100 mph' : 'at 160 km/h', what: 'Cornering grip with the downforce a car makes at speed on top. Wings and splitters work here.' },
  { key: 'brake', name: 'Brake force', ch: ['brake'], part: 'brakes', val: (s, m) => m.brake * 100, fmt: (v) => [Math.round(v), '%'],
    what: 'How hard the brakes squeeze for the same push on the pedal, against the factory brakes (100%). Worn pads and discs give less.',
    note: () => 'With the pedal down hard, ABS holds the tires at their limit: there, more brake force barely shortens the stop. It shows when you brake gently, and at high speed.' },
  { key: 'stop', name: '60-0', name2: '100-0', ch: ['grip', 'brake', 'downforce'], part: 'brakes', lower: () => true, val: (s, m, u) => stopDist(s, m, u ? 60 * MPH : 100 / 3.6) * (u ? 3.281 : 1),
    fmt: (v, u) => [Math.round(v), u ? 'ft' : 'm'], what: 'Stopping distance, pedal down hard with ABS. It\'s mostly the tires\' grip: worn suspension and less grip make it longer.' },
  { key: 'tough', name: 'Damage taken', ch: ['damage'], part: 'chassis', lower: () => true, val: (s, m) => m.damage * 100, fmt: (v) => [Math.round(v), '%'],
    what: 'How much a hit hurts, against the factory shell (100%). A tired chassis crumples sooner; a roll cage takes the sting out.' },
  { key: 'rel', name: 'Failure risk', rel: true, part: null, what: 'The chance something on the car lets go in the next race. Worn parts, used or cheap parts, and a tired or poor mechanic all raise it.' },
];
const statName = (S, u) => (u ? S.name : S.name2 || S.name);
const better = (S, u, d) => (S.lower && S.lower(u) ? -d : d);
const fj = ([n, unit]) => (unit === '%' ? `${n}%` : `${n} ${unit}`);

export class CarSheet {
  constructor(el, src) {
    this.el = el; this.src = src; this.isOpen = false; this.sel = 0;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('mousemove', (e) => { const r = e.target.closest('.cs-row'); if (r && +r.dataset.i !== this.sel) this.focus(+r.dataset.i); });
  }
  get w() { return this.src.world(); }
  get stat() { return STATS[this.sel]; }
  // the part to work on for the stat you're on (for the hint and A)
  get part() { const S = this.stat; return S.rel ? this.worstPart() : S.part; }

  open(key) {
    const w = this.w; if (!w || !w.car) return;
    this.isOpen = true; this.sel = Math.max(0, STATS.findIndex(S => S.key === key));
    this.el.innerHTML = `<div class="tsw-shade"></div><div class="tsw-scan"></div>
      <header class="tsw-head"><h1></h1><p></p></header>
      <div class="tsw-money"><div><small>A lap vs factory</small><b data-k="lap"></b><em class="tsw-delta"></em></div><div><small>Failure risk</small><b data-k="risk"></b></div></div>
      <div class="cs-body"><div class="cs-list"></div><div class="cs-pane"></div></div>`;
    this.el.hidden = false; this.el.classList.remove('leave'); this.el.classList.add('enter');
    setTimeout(() => this.el.classList.remove('enter'), 1400);
    this.render(true);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.el.classList.add('leave');
    setTimeout(() => { if (!this.isOpen) { this.el.hidden = true; this.el.innerHTML = ''; this.el.classList.remove('leave'); } }, 300);
  }
  input({ up, down, ok, back }) {
    if (!this.isOpen) return false;
    const n = STATS.length;
    if (up) this.focus((this.sel + n - 1) % n);
    else if (down) this.focus((this.sel + 1) % n);
    else if (ok) this.work();
    else if (back) { this.src.sfx('back'); this.close(); this.src.closed(); }
    return true;
  }
  click(e) {
    const r = e.target.closest('.cs-row'), go = e.target.closest('[data-act="work"]');
    if (r) { const i = +r.dataset.i; if (i !== this.sel) this.focus(i); }
    else if (go) this.work();
  }
  focus(i) {
    if (i === this.sel) return;
    this.sel = i; this.src.sfx('move');
    this.el.querySelectorAll('.cs-row').forEach((r, k) => r.classList.toggle('on', k === i));
    this.pane(); this.src.changed?.();
  }
  work() { const k = this.part; if (!k) return; this.src.sfx('select'); this.close(); this.src.work(k); }

  // ---------- the numbers ----------
  // the car's spec, and the race's modifiers from the given sources (known: what you know; else the truth)
  calc() {
    const w = this.w, C = CARS[carId({ chassis: w.car.chassis })], B = WC.carBreakdown(w), u = this.src.imperial();
    const mods = (srcs) => Object.fromEntries(WC.MOD_CH.map(k => [k, WC.modOf(B[k], 'shown', srcs)]));
    return { w, C, s: C.spec, B, u, mods };
  }
  // one stat: factory, each step, and now (as far as you know); doubt: '?' if something on it is unmeasured
  statOf(S, c) {
    const { s, B, u, mods } = c, steps = [];
    let srcs = [], prev = S.val(s, mods([]), u);
    const factory = prev;
    for (const src of WC.MOD_SRC) {
      srcs = [...srcs, src];
      const items = S.ch.flatMap(k => B[k].filter(x => x.src === src).map(x => ({ ...x, ch: k })));
      if (!items.length) continue;
      const v = S.val(s, mods(srcs), u);
      steps.push({ src, d: v - prev, items }); prev = v;
    }
    const all = steps.flatMap(x => x.items), doubt = all.some(x => x.how === 'unknown') ? 'unknown' : all.some(x => x.how === 'claimed') ? 'claimed' : '';
    return { factory, now: prev, steps, doubt };
  }
  // the whole lap, by WC.LAP_K: how much quicker (+) the car is than it left the factory, as far as you know
  lapGain(c) { const m = c.mods(WC.MOD_SRC); return Object.entries(WC.LAP_K).reduce((a, [k, v]) => a + (m[k] - 1) * v, 0); }
  worstPart() { const P = WC.carParts(this.w), odds = WC.failOdds(this.w); return Object.keys(odds).sort((a, b) => odds[b] - odds[a])[0] || WC.PART_KEYS.slice().sort((a, b) => P[a].cond - P[b].cond)[0]; }
  riskTxt() { const w = this.w, r = WC.failRisk(w); return WC.dataLevel(w) === 2 ? `${(r * 100).toFixed(1)}%` : r < 0.03 ? 'Low' : r < 0.08 ? 'Some' : r < 0.15 ? 'High' : 'Very high'; }

  // ---------- drawing ----------
  render(first = false) {
    const c = this.calc(), { w, C, s, u } = c;
    const h = this.el.querySelector('.tsw-head'), drive = s.drive >= 0.99 ? 'Front-wheel drive' : s.drive > 0.01 ? 'All-wheel drive' : 'Rear-wheel drive';
    h.querySelector('h1').textContent = w.car.name;
    h.querySelector('p').textContent = [WC.carClsOf(w) === 'street' && w.car.year, ENGINE[C.sound], `${s.gears.length - 1}-speed ${s.box || 'manual'}`, drive, u ? `${Math.round(s.mass * LB).toLocaleString('en-US')} lb` : `${s.mass} kg`].filter(Boolean).join(' · ');
    // a lap vs factory: in seconds on a 90-second lap (a typical one), and as a share
    const g = this.lapGain(c), sec = g * 90, lap = this.el.querySelector('[data-k="lap"]');
    const unk = WC.MOD_CH.some(k => c.B[k].some(x => x.how === 'unknown'));
    lap.innerHTML = (Math.abs(sec) < 0.005 ? '±0.00 s' : `${sec > 0 ? '−' : '+'}${Math.abs(sec).toFixed(2)} s`) + (unk ? '<sup>?</sup>' : '');
    lap.className = sec > 0.005 ? 'gain' : sec < -0.005 ? 'neg' : '';
    this.el.querySelector('.tsw-delta').textContent = Math.abs(g) < 0.00005 ? 'as it left the factory' : `${Math.abs(g * 100).toFixed(1)}% ${g > 0 ? 'quicker' : 'slower'}, on a 90 s lap`;
    const risk = this.el.querySelector('[data-k="risk"]'), r = WC.failRisk(w); risk.textContent = this.riskTxt(); risk.className = r >= 0.08 ? 'neg' : '';
    // the list: each stat, a bar from the factory figure to today's, and today's number
    const list = this.el.querySelector('.cs-list');
    list.innerHTML = STATS.map((S, i) => {
      if (S.rel) return `<div class="cs-row${i === this.sel ? ' on' : ''}" data-i="${i}"><i class="tsw-cur"></i><b>${S.name}</b>${this.relBar()}<em class="${r >= 0.08 ? 'neg' : ''}">${this.riskTxt()}</em></div>`;
      const x = this.statOf(S, c), d = better(S, u, x.now - x.factory), [n, unit] = S.fmt(x.now, u);
      return `<div class="cs-row${i === this.sel ? ' on' : ''}" data-i="${i}"><i class="tsw-cur"></i><b>${statName(S, u)}</b>${this.bar(S, x, u)}<em class="${this.cls(S, x, d, u)}">${n}<small>${unit}</small>${x.doubt ? '<sup>?</sup>' : ''}</em></div>`;
    }).join('');
    if (first) [...list.children].forEach((r, i) => flick(r, 380 + i * 45));
    this.pane(first);
  }
  cls(S, x, d, u) { return +S.fmt(Math.abs(x.now - x.factory), u)[0] === 0 ? '' : d > 0 ? 'gain' : 'neg'; } // (only a difference that shows in the number)
  // a bar from the factory's figure to today's: the gain lit cyan, a loss as a red gap (scaled so differences show)
  bar(S, x, u) {
    const lo = S.lower && S.lower(u), f = (v) => Math.max(0.04, Math.min(1, 0.7 + ((lo ? x.factory / v : v / x.factory) - 1) * 3));
    const a = f(x.factory), b = f(x.now);
    return `<i class="cs-bar"><b class="base" style="width:${(Math.min(a, b) * 100).toFixed(1)}%"></b>${b > a ? `<b class="up" style="left:${(a * 100).toFixed(1)}%;width:${((b - a) * 100).toFixed(1)}%"></b>` : b < a ? `<b class="down" style="left:${(b * 100).toFixed(1)}%;width:${((a - b) * 100).toFixed(1)}%"></b>` : ''}<i class="fac" style="left:${(a * 100).toFixed(1)}%"></i></i>`;
  }
  relBar() { const r = WC.failRisk(this.w); return `<i class="cs-bar"><b class="${r >= 0.08 ? 'down' : 'base'}" style="width:${Math.max(3, Math.min(100, r / 0.25 * 100)).toFixed(1)}%"></b></i>`; }

  // the stat you're on: today against the factory, and where the difference comes from
  pane(fresh = true) {
    const el = this.el.querySelector('.cs-pane'), S = this.stat, c = this.calc(), u = c.u;
    if (S.rel) { el.innerHTML = this.relPane(c); if (fresh) flick(el); this.src.changed?.(); return; }
    const x = this.statOf(S, c), [n, unit] = S.fmt(x.now, u), [fn, funit] = S.fmt(x.factory, u), raw = x.now - x.factory, d = better(S, u, raw);
    const dTxt = (v) => { const t = S.fmt(Math.abs(v), u); return `${+t[0] === 0 ? '±' : v > 0 ? '+' : '−'}${fj(t)}`; };
    const top = `<div class="cs-top"><div class="cs-big"><small>${statName(S, u)}${S.at ? ` ${S.at(u)}` : ''}</small><h2>${n}<span>${unit}</span>${x.doubt ? '<sup>?</sup>' : ''}</h2></div>
      <div class="dp-facts cs-facts"><div><small>Factory</small><b>${fn} <small>${funit}</small></b></div><div><small>Difference</small><b class="${this.cls(S, x, d, u)}">${+S.fmt(Math.abs(raw), u)[0] === 0 ? 'None' : dTxt(raw)}</b></div></div></div>
      <p class="cs-what">${S.what}</p>`;
    // the steps: factory, then each source (a bar each way from the middle), then today
    const big = Math.max(...x.steps.map(t => Math.abs(t.d)), 1e-9);
    const item = (it) => { const pct = it.shown * 100, k = it.ch === 'damage' || it.ch === 'drag' ? -1 : 1;
      const v = it.how === 'unknown' ? '?' : `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%${it.ch !== S.ch[0] || S.ch.length > 1 ? ` ${it.ch === 'downforce' ? 'downforce' : it.ch}` : ''}`;
      return `<span class="${it.how === 'unknown' ? 'q' : it.shown * k > 0 ? 'gain' : it.shown * k < 0 ? 'neg' : ''}">${esc(it.label)} <b>${v}</b>${HOW[it.how] ? ` <i>${HOW[it.how]}</i>` : ''}</span>`; };
    const rows = x.steps.map(t => { const dd = better(S, u, t.d), wpc = Math.abs(t.d) / big * 50, doubt = t.items.some(it => it.how === 'unknown');
      return `<div class="cs-step"><span>${SRC_NAME[t.src]}</span><i class="cs-div"><b class="${dd > 0 ? 'up' : 'down'}" style="${dd > 0 ? 'left' : 'right'}:50%;width:${wpc.toFixed(1)}%"></b></i><em class="${Math.abs(t.d) < 1e-9 ? '' : dd > 0 ? 'gain' : 'neg'}">${Math.abs(t.d) < 1e-9 ? (doubt ? '?' : '±0') : dTxt(t.d)}${doubt && Math.abs(t.d) >= 1e-9 ? ' +?' : ''}</em>
        <div class="cs-items">${t.items.map(item).join('')}</div></div>`; }).join('');
    const fall = `<div class="cs-fall"><div class="cs-step end"><span>Factory</span><i class="cs-div"></i><em>${fj([fn, funit])}</em></div>${rows || `<div class="cs-step none"><span></span><p>Nothing on the car changes this yet.</p></div>`}<div class="cs-step end now"><span>Today</span><i class="cs-div"></i><em>${fj([n, unit])}${x.doubt ? '?' : ''}</em></div></div>`;
    const note = S.note ? S.note(c.s, c.mods(WC.MOD_SRC), u) : '', tip = this.tip(S, c);
    el.innerHTML = `${top}${fall}${note || tip ? `<div class="cs-notes">${note ? `<p>${note}</p>` : ''}${tip ? `<p class="tip">${tip}</p>` : ''}</div>` : ''}${this.doubtNote(x)}
      <div class="dp-go"><button class="sv-btn hot" data-act="work">Work on the ${WC.PARTS[this.part].name.toLowerCase()} &rsaquo;</button></div>`;
    if (fresh) flick(el);
    this.src.changed?.();
  }
  // what a rebuild of the part behind this stat would give back
  tip(S, c) {
    const w = this.w, P = WC.carParts(w), k = S.part, p = P[k], to = WC.rebuildTo(w);
    if (!['engine', 'suspension', 'brakes', 'chassis'].includes(k) || p.cond >= to - 0.01 || (w.car.lease && k === 'engine')) return '';
    const cond = { engine: 'power', suspension: 'grip', brakes: 'brake', chassis: 'damage' }[k];
    const was = S.val(c.s, c.mods(WC.MOD_SRC), c.u), fix = { ...c.mods(WC.MOD_SRC) };
    const f = (x) => cond === 'power' || cond === 'brake' ? 0.9 + 0.1 * x : cond === 'grip' ? 0.96 + 0.04 * x : 1.15 - 0.15 * x;
    fix[cond] = fix[cond] / f(p.cond) * f(to);
    const d = S.val(c.s, fix, c.u) - was;
    if (Math.abs(d) < 1e-6 || !S.ch.includes(cond)) return '';
    return `The ${WC.PARTS[k].name.toLowerCase()} ${k === 'brakes' ? 'are' : 'is'} at ${Math.round(p.cond * 100)}%. A rebuild (${WC.money$(WC.rebuildCost(w, k))}) gets it back to about ${Math.round(to * 100)}%: <b>${d > 0 ? '+' : '−'}${fj(S.fmt(Math.abs(d), c.u))}</b>.`;
  }
  doubtNote(x) {
    if (!x.doubt) return '';
    const w = this.w;
    return `<p class="cs-doubt">${x.doubt === 'unknown' ? '? Something here hasn\'t been measured' : 'Claimed: the maker\'s figure, not measured'}. ${WC.staffOf(w, 'engineer') ? `${esc(WC.staffOf(w, 'engineer').first)} measures upgrades after a race.` : 'A data engineer would measure it after a race.'}</p>`;
  }
  // reliability: each part that can fail, its condition and its chance (exact with a senior data engineer)
  relPane(c) {
    const w = this.w, P = WC.carParts(w), odds = WC.failOdds(w), lvl = WC.dataLevel(w), r = WC.failRisk(w), m = WC.staffOf(w, 'mechanic');
    const word = (p) => p < 0.01 ? 'Low' : p < 0.03 ? 'Some' : p < 0.07 ? 'High' : 'Very high';
    const rows = Object.keys(odds).sort((a, b) => odds[b] - odds[a]).map(k => { const p = odds[k], cond = P[k].cond, bad = p >= 0.03;
      return `<div class="cs-step rel"><span>${WC.PARTS[k].name}</span><i class="cs-bar"><b class="${bad ? 'down' : 'base'}" style="width:${Math.max(3, Math.min(100, p / 0.12 * 100)).toFixed(1)}%"></b></i><em class="${bad ? 'neg' : ''}">${lvl === 2 ? `${(p * 100).toFixed(1)}%` : word(p)}</em>
        <div class="cs-items"><span>At ${Math.round(cond * 100)}%</span>${P[k].fit ? `<span>${esc(P[k].fit.name)}${P[k].fit.used ? ' (used)' : ''}</span>` : ''}${w.car.lease && (k === 'engine' || k === 'gearbox') ? `<span>Rebuilt by ${esc(w.car.lease.prog)}</span>` : ''}</div></div>`; }).join('');
    const why = [m ? `${esc(m.first)}${m.morale < 35 ? ' is fed up, and it shows' : ` (skill ${m.skill})`} looks after the car.` : 'No chief mechanic: nobody is looking after the car between races.',
      w.car.dev?.rel ? `Reliability work: ${Math.round(w.car.dev.rel * 100)}% fewer faults.` : '', lvl === 2 ? '' : 'A senior data engineer would put exact numbers on these.'].filter(Boolean).join(' ');
    return `<div class="cs-top"><div class="cs-big"><small>Failure risk, next race</small><h2 class="${r >= 0.08 ? 'neg' : ''}">${this.riskTxt()}</h2></div></div>
      <p class="cs-what">${STATS.find(S => S.rel).what}</p><div class="cs-fall">${rows}</div><div class="cs-notes"><p>${why}</p></div>
      <div class="dp-go"><button class="sv-btn hot" data-act="work">Work on the ${WC.PARTS[this.part].name.toLowerCase()} &rsaquo;</button></div>`;
  }
}

// one part, in numbers: what its wear is costing, and what a rebuild would give back (for the car menu's descriptions)
export function partEffect(w, k, imperial) {
  const C = CARS[carId({ chassis: w.car.chassis })], s = C.spec, P = WC.carParts(w), p = P[k], to = WC.rebuildTo(w);
  const show = { engine: ['power', 'power'], suspension: ['grip', 'grip'], brakes: ['brake', 'brake'], chassis: ['tough', 'damage'] }[k];
  if (!show) return k === 'gearbox' ? 'Wear doesn\'t slow it down; it just gets likelier to fail.' : k === 'aero' ? 'Wear on the bodywork doesn\'t cost pace or reliability.' : '';
  const S = STATS.find(x => x.key === show[0]), f = { power: (x) => 0.9 + 0.1 * x, grip: (x) => 0.96 + 0.04 * x, brake: (x) => 0.9 + 0.1 * x, damage: (x) => 1.15 - 0.15 * x }[show[1]];
  const one = { power: 1, grip: 1, brake: 1, downforce: 1, drag: 1, damage: 1 }, at = (c) => S.val(s, { ...one, [show[1]]: f(c) }, imperial), fmt = (v) => fj(S.fmt(Math.abs(v), imperial));
  const cost = at(p.cond) - at(1), back = at(Math.max(p.cond, to)) - at(p.cond);
  return `${Math.abs(cost) < 1e-6 ? 'Not costing you anything.' : `Its wear costs <b>${fmt(cost)}</b> ${show[1] === 'damage' ? 'more damage taken' : show[1] === 'brake' ? 'of brake force' : show[1] === 'grip' ? 'of grip' : 'of power'}.`}${back > 1e-6 || back < -1e-6 ? ` A rebuild gets back about ${fmt(back)}.` : ''}`;
}
