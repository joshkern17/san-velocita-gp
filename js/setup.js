// Car setups (the Tuning screen: tuning.js). A setup is a set of adjustments on top of a car's own spec (cars.js);
// applySetup turns it into the spec CarPhysics drives. Two levels of detail over the same numbers:
//   Simple: seven plain-language controls, each moving several of the detailed ones together
//   Realistic: every adjustment on its own: wings, ride height, springs, dampers, anti-roll bars, camber, toe, brake
//   bias and pressure, the differential, the final drive and each gear
// Setups are saved per car under names (svgp.setups), one of them the car's active setup: what it races with
// everywhere (Quick Race, World Career, online: your own car). The AI always races the car's standard setup.
// measure(): quick tests of a spec on the open plane (top speed, 0-100, slow / fast corner grip, braking, balance), so
// the screen can show what a change does before you drive it. No THREE here: it runs in node too.
import { CarPhysics } from './physics.js';
import { CARS } from './cars.js';
import { physAids, PRESETS } from './aids.js';

// the standard alignment per class (° camber, - = the top leaning in; ° toe, + = in): what the car is built with
const ALIGN = {
  f1: { cam: [-3.2, -1.8], toe: [-0.05, 0.2] }, gt1: { cam: [-3, -2], toe: [0, 0.15] }, gt2: { cam: [-2.8, -1.9], toe: [0, 0.15] },
  street: { cam: [-1.2, -1], toe: [0, 0.1] }, shitbox: { cam: [-0.6, -0.5], toe: [0.05, 0.1] }, club: { cam: [-2.5, -1.8], toe: [0, 0.1] }, fun: { cam: [-1, -0.8], toe: [0, 0.1] },
  sprint: { cam: [-1.5, 0], toe: [0, 0] }, // (a solid rear axle: no camber at the back)
};
const alignOf = (id) => ALIGN[CARS[id]?.cls] || ALIGN.street;
// does the car make enough downforce to have wings worth adjusting (race cars), and which axle does the diff sit on
export const hasAero = (id) => (CARS[id]?.spec.kd || 0) >= 0.3;
const diffKey = (spec) => (spec.drive ?? 0) >= 1 ? 'lsdF' : 'lsd';
const gearsOf = (id) => CARS[id].spec.gears.length - 1;

// the standard setup: nothing moved (offsets 0), the car's own alignment, brakes and diff
export function defaultSetup(id) {
  const S = CARS[id].spec, A = alignOf(id), L = S[diffKey(S)] ?? [0, 0, 0];
  return {
    fw: 0, rw: 0, rhF: 0, rhR: 0, sprF: 0, sprR: 0, damp: 0, arbF: 0, arbR: 0,
    camF: A.cam[0], camR: A.cam[1], toeF: A.toe[0], toeR: A.toe[1],
    bias: S.brakeF ?? 0.66, bp: 1, pre: L[0], pow: L[1], coast: L[2],
    final: 0, gears: Array(gearsOf(id)).fill(1),
    // a sprint car (spec.stagger): the stagger (in), the top wing's slider (in back of standard) and its offset to the left (in)
    ...(isSprint(id) ? { stg: Math.round(S.stagger / 0.0254 * 2) / 2, wSlide: 0, wOff: Math.round((S.aeroY ?? 0) / (0.0254 * TOPW) * 2) / 2 } : {}),
  };
}
// a sprint car: staggered rears on a spool, a top wing that slides and sits offset (cars.js: spec.stagger)
export const isSprint = (id) => CARS[id]?.spec.stagger != null;
const TOPW = 0.8; // (the top wing's share of a sprint car's downforce: its slider and offset move that much of it)

// ---------- what each adjustment does to the spec ----------
export function applySetup(spec, st, id) {
  if (!st) return spec;
  const P = { ...spec }, aF = spec.aeroF ?? spec.b / spec.L, A = alignOf(id);
  // wings: each end's downforce ±7% a step; the drag follows the downforce (most of a race car's drag is its wings)
  const ff = 1 + 0.07 * st.fw, fr = 1 + 0.07 * st.rw, kd = spec.kd * (aF * ff + (1 - aF) * fr);
  if (spec.kd > 0 && (st.fw || st.rw)) { P.kd = kd; P.aeroF = spec.kd * aF * ff / kd; P.drag = spec.drag * (1 + 0.6 * Math.min(1, spec.kd) * (kd / spec.kd - 1)); }
  P.kdRef = spec.kd; P.aeroFRef = aF;
  // ride height (mm): the aero map and the bump travel (physics.js), and the centre of mass moves with the body
  P.rideOff = [st.rhF / 1000, st.rhR / 1000]; P.cgh = spec.cgh + (st.rhF + st.rhR) / 2000 * 0.6;
  P.springK = [1 + 0.06 * st.sprF, 1 + 0.06 * st.sprR]; P.damp = (spec.damp ?? 0.4) * (1 + 0.08 * st.damp);
  P.arbK = [1 + 0.12 * st.arbF, 1 + 0.12 * st.arbR]; // (each step ±12% of that axle's roll stiffness: physics.js)
  P.camber = [st.camF, st.camR]; P.camber0 = A.cam; P.toe = [st.toeF, st.toeR]; P.toe0 = A.toe;
  P.brakeF = st.bias; P.brakeP = st.bp;
  if (spec.stagger == null) P[diffKey(spec)] = [st.pre, st.pow, st.coast]; // (a sprint car's spool stays locked)
  else if (st.stg != null) {
    // the stagger; the top wing slid back (its downforce moves back: less on the front) and offset to the left (it leans
    // on the left tyres: physics.js aeroY)
    P.stagger = st.stg * 0.0254;
    P.aeroF = (P.aeroF ?? aF) - (st.wSlide || 0) * 0.0254 * TOPW / spec.L;
    P.aeroY = (st.wOff || 0) * 0.0254 * TOPW;
  }
  const fin = 1 + 0.025 * st.final;
  P.gearsRef = spec.gears; P.gears = spec.gears.map((g, i) => i ? g * fin * (st.gears[i - 1] ?? 1) : g);
  return P;
}

// how a setup changes the car's look (carmodel.js setStance): body height (m) and pitch (rad, + nose down) from the
// ride height, and each axle's camber (rad) against the standard. Null for the standard setup.
export function stanceOf(st, id) {
  if (!st) return null;
  const S = CARS[id].spec, A = alignOf(id), L = S.L ?? (S.a + S.b), d = Math.PI / 180;
  // (a sprint car: its top wing's slide and offset, m, on the model)
  const wing = isSprint(id) && st.wSlide != null ? [st.wSlide * 0.0254, st.wOff * 0.0254] : null;
  const out = { dy: (st.rhF + st.rhR) / 2000, pitch: -((st.rhF - st.rhR) / 1000) / L, cam: [(st.camF - A.cam[0]) * d, (st.camR - A.cam[1]) * d], wing };
  return out.dy || out.pitch || out.cam[0] || out.cam[1] || wing ? out : null;
}

// ---------- the controls ----------
// Each: k, tab, label, min/max/step, fmt (the value as shown), more / less (what turning it up / down does, in plain
// words), and for Simple's: get / set over the detailed numbers. `aero`: only on cars with wings worth adjusting.
const sgn = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const lvl = (v) => String(Math.round(v + 6)).padStart(2, '0'); // (-5..+5 shown as 01..11, the standard 06)
const deg = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '°';
const toeTxt = (v) => Math.abs(v) < 0.005 ? '0.00°' : Math.abs(v).toFixed(2) + '° ' + (v > 0 ? 'IN' : 'OUT');
const pct = (v) => Math.round(v * 100) + '%';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = (a, b) => (a + b) / 2;
// (a speed in the player's units: set by the screen)
export const units = { mph: false };
const spd = (ms) => units.mph ? Math.round(ms * 2.23694) + ' MPH' : Math.round(ms * 3.6) + ' KM/H';
// (a sprint car's: inches, as the pits talk about them)
const STG = (v) => v.toFixed(1) + '"', WSLIDE = (v) => v ? Math.abs(v) + '" ' + (v > 0 ? 'BACK' : 'FORWARD') : 'STANDARD', WOFF = (v) => v ? v.toFixed(1) + '" LEFT' : 'CENTERED';
const STG_NOTE = 'Stagger: how much bigger around the right rear tire is than the left rear. On a track that turns right, it is mirrored for you.';
const topOf = (id, st) => { const G = applySetup(CARS[id].spec, st, id).gears; return G[G.length - 1]; };

export const TABS = [['aero', 'Aero'], ['susp', 'Suspension'], ['align', 'Alignment'], ['brakes', 'Brakes & Diff'], ['gears', 'Gearing']];

export function simpleFields(id) {
  const f = [];
  if (hasAero(id)) {
    f.push({ k: 'downforce', label: 'Downforce', min: -5, max: 5, step: 1, get: s => avg(s.fw, s.rw), set: (s, v) => { const d = v - avg(s.fw, s.rw); s.fw = clamp(s.fw + d, -5, 5); s.rw = clamp(s.rw + d, -5, 5); }, fmt: lvl,
      more: 'More grip in fast corners, lower top speed.', less: 'Faster on the straights, less grip in fast corners.' });
    f.push({ k: 'aeroBal', label: 'Aero Balance', min: -3, max: 3, step: 0.5, get: s => (s.fw - s.rw) / 2, set: (s, v) => { const c = avg(s.fw, s.rw); s.fw = clamp(c + v, -5, 5); s.rw = clamp(c - v, -5, 5); },
      fmt: (v, s) => pct(applySetup(CARS[id].spec, s, id).aeroF) + ' FRONT',
      more: 'More of the downforce on the front: sharper in fast corners, the rear lighter.', less: 'More on the rear: steadier in fast corners, the front lazier.' });
  }
  f.push({ k: 'stiff', label: 'Suspension', min: -5, max: 5, step: 1, get: s => avg(s.sprF, s.sprR), set: (s, v) => { const d = v - avg(s.sprF, s.sprR); s.sprF = clamp(s.sprF + d, -5, 5); s.sprR = clamp(s.sprR + d, -5, 5); s.damp = clamp(s.damp + d, -5, 5); }, fmt: lvl,
    more: 'Stiffer: quicker to respond, less lean. Harsher over curbs and bumps.', less: 'Softer: rides curbs and bumps better, leans more, slower to respond.' });
  f.push({ k: 'handling', label: 'Handling', min: -4, max: 4, step: 1, get: s => (s.arbR - s.arbF) / 2, set: (s, v) => { const c = avg(s.arbF, s.arbR); s.arbF = clamp(c - v, -5, 5); s.arbR = clamp(c + v, -5, 5); },
    fmt: v => v > 0 ? `+${v} AGILE` : v < 0 ? `−${-v} STABLE` : 'NEUTRAL',
    more: 'Agile: turns in harder, the rear more willing to slide.', less: 'Stable: the rear stays planted, the front pushes wide sooner.' });
  const spr = isSprint(id);
  f.push({ k: 'bias', label: 'Brake Bias', min: spr ? 0.2 : 0.5, max: spr ? 0.6 : 0.8, step: 0.01, get: s => s.bias, set: (s, v) => { s.bias = v; }, fmt: v => pct(v) + ' FRONT',
    more: 'More braking on the front: stable, but the fronts lock first.', less: 'More on the rear: the car turns in on the brakes, the rear can step out.' });
  if (spr) {
    f.push({ k: 'stg', label: 'Stagger', min: 2, max: 12, step: 0.5, get: s => s.stg, set: (s, v) => { s.stg = v; }, fmt: STG, note: STG_NOTE,
      more: 'More stagger: the car turns left on its own more easily, but it gets looser (the rear steps out sooner).', less: 'Less: steadier down the straights, but it has to be steered round the turns.' });
    f.push({ k: 'wSlide', label: 'Wing Slider', min: -6, max: 6, step: 1, get: s => s.wSlide, set: (s, v) => { s.wSlide = v; }, fmt: WSLIDE,
      more: 'Wing back: more grip at the rear, the car tightens up and pushes more.', less: 'Wing forward: the front bites, the car frees up and turns more.' });
  } else f.push({ k: 'pow', label: 'Diff Lock', min: 0, max: 0.8, step: 0.05, get: s => s.pow, set: (s, v) => { s.pow = v; }, fmt: pct,
    more: 'Both driven wheels pushed together: better traction out of corners, but it pushes wide on the power.', less: 'Freer: turns better on the power, the inside wheel spins up sooner.' });
  f.push({ k: 'final', label: 'Gearing', min: -5, max: 5, step: 1, get: s => s.final, set: (s, v) => { s.final = v; }, fmt: (v, s) => spd(topOf(id, s)),
    more: 'Longer: a higher top speed, slower to get going.', less: 'Shorter: quicker acceleration, tops out sooner.', note: 'This speed is where top gear runs out of revs. Drag can hold the car below it: Top Speed, above, is what it actually reaches.' });
  return f;
}

export function realisticFields(id) {
  const S = CARS[id].spec, f = [], aero = hasAero(id), n = gearsOf(id);
  const kN = (k) => { const P = new CarPhysics(applySetup(S, null, id)); return k ? P.susp.kR : P.susp.kF; };
  const k0 = [kN(0), kN(1)]; // (the standard springs, N/m: shown in N/mm)
  const add = (tab, k, label, min, max, step, fmt, more, less, extra = {}) => f.push({ tab, k, label, min, max, step, fmt, more, less, get: s => s[k], set: (s, v) => { s[k] = v; }, ...extra });
  const spr = isSprint(id);
  if (aero) {
    add('aero', 'fw', spr ? 'Nose Wing' : 'Front Wing', -5, 5, 0.5, lvl, 'More front downforce: sharper turn-in at speed, a little more drag.', 'Less front downforce: the car understeers more in fast corners.');
    add('aero', 'rw', spr ? 'Top Wing Angle' : 'Rear Wing', -5, 5, 0.5, lvl, spr ? 'More angle: more grip all the way round, a lower top speed.' : 'More rear downforce: planted in fast corners, much more drag.', spr ? 'Less angle: faster down the straights, less grip in the turns.' : 'Less: faster on the straights, the rear lighter in fast corners.');
  }
  if (spr) {
    add('aero', 'wSlide', 'Wing Slider', -6, 6, 1, WSLIDE, 'Wing back: more grip at the rear, the car tightens up and pushes more.', 'Wing forward: the front bites, the car frees up and turns more.');
    add('aero', 'wOff', 'Wing Offset', 0, 6, 0.5, WOFF, 'Further left: the wing leans on the left-side tires, more grip in the turns.', 'Centered: the same on both sides.');
  }
  add('aero', 'rhF', 'Ride Height Front', -12, 12, 2, v => sgn(v) + ' MM', 'Higher: more room over curbs, less ground effect.', 'Lower: more downforce' + (aero ? '' : ' (what little there is)') + ', a lower center of mass. Too low and it bottoms out.');
  add('aero', 'rhR', 'Ride Height Rear', -12, 12, 2, v => sgn(v) + ' MM', 'Higher: more room over curbs, the nose pitched down (more front downforce on wing cars).', 'Lower: more rear grip from the floor. Too low and it bottoms out.');
  add('susp', 'sprF', 'Front Springs', -5, 5, 1, (v) => Math.round(k0[0] * (1 + 0.06 * v) ** 2 / 1000) + ' N/MM', 'Stiffer front: sharper response, the front lets go sooner in long corners.', 'Softer front: more front grip over bumps, more dive under braking.');
  add('susp', 'sprR', 'Rear Springs', -5, 5, 1, (v) => Math.round(k0[1] * (1 + 0.06 * v) ** 2 / 1000) + ' N/MM', 'Stiffer rear: the car rotates more, less squat on the power.', 'Softer rear: more traction, steadier on the power.');
  add('susp', 'damp', 'Dampers', -5, 5, 1, lvl, 'Firmer: the body settles faster, harsher over curbs.', 'Softer: rides bumps, but the car wallows in quick changes of direction.');
  add('susp', 'arbF', 'Front Anti-Roll Bar', -5, 5, 1, lvl, 'Stiffer: less lean, more understeer (the front lets go first).', 'Softer: more front grip in long corners, more lean.');
  add('susp', 'arbR', 'Rear Anti-Roll Bar', -5, 5, 1, lvl, 'Stiffer: the rear steps out sooner, the car turns in more.', 'Softer: more rear grip, more stable.');
  add('align', 'camF', 'Front Camber', -4.5, 0, 0.1, deg, 'Less negative: better braking, less cornering grip at the front.', 'More negative: more front grip in corners, a little less under braking.');
  add('align', 'camR', 'Rear Camber', -4, 0, 0.1, deg, 'Less negative: better traction out of slow corners.', 'More negative: more rear grip in corners, less traction.');
  add('align', 'toeF', 'Front Toe', -0.4, 0.4, 0.05, toeTxt, 'Toe-in: steadier on the straights, lazier turn-in.', 'Toe-out: sharper turn-in, a bit nervous on the straights. Either way more scrub and tire heat.');
  add('align', 'toeR', 'Rear Toe', -0.2, 0.6, 0.05, toeTxt, 'Toe-in: a planted rear, more stable everywhere.', 'Less toe-in: the rear rotates more freely. Toe-out is unstable.');
  if (spr) add('align', 'stg', 'Stagger', 2, 12, 0.5, STG, 'More stagger: the car turns left on its own more easily, but it gets looser (the rear steps out sooner).', 'Less: steadier down the straights, but it has to be steered round the turns.', { note: STG_NOTE });
  add('brakes', 'bias', 'Brake Bias', spr ? 0.2 : 0.5, spr ? 0.6 : 0.8, 0.01, v => pct(v) + ' FRONT', 'More on the front: stable, but the fronts lock first.', 'More on the rear: the car turns in on the brakes, the rear can step out.', spr ? { note: 'A sprint car has no right-front brake: the front share is all on the left front.' } : {});
  add('brakes', 'bp', 'Brake Pressure', 0.8, 1.1, 0.02, pct, 'Harder: shorter stops, easier to lock up.', 'Softer: easier to brake at the limit, longer stops.');
  if (!spr) { // (a sprint car's rears are on a spool: locked together, nothing to set)
    add('brakes', 'pre', 'Diff Preload', 0, 200, 10, v => Math.round(v) + ' NM', 'More: the driven wheels held together everywhere: stable, slower to turn in.', 'Less: turns in easily, the inside wheel spins up sooner.');
    add('brakes', 'pow', 'Diff Power Lock', 0, 0.8, 0.05, pct, 'More: better traction out of corners, pushes wide on the power.', 'Less: turns better on the power, more wheelspin.');
    add('brakes', 'coast', 'Diff Coast Lock', 0, 0.8, 0.05, pct, 'More: stable off the throttle into corners.', 'Less: rotates more as you lift and turn in.');
  }
  f.push({ tab: 'gears', k: 'final', label: 'Final Drive', min: -5, max: 5, step: 1, get: s => s.final, set: (s, v) => { s.final = v; }, fmt: (v, s) => spd(topOf(id, s)),
    more: 'Longer: every gear longer, a higher top speed.', less: 'Shorter: every gear shorter, quicker acceleration.', note: 'This speed is where top gear runs out of revs. Drag can hold the car below it: Top Speed, above, is what it actually reaches.' });
  for (let g = 1; g <= n; g++) f.push({ tab: 'gears', k: 'g' + g, label: `Gear ${g}`, min: 0.8, max: 1.2, step: 0.02, get: s => s.gears[g - 1], set: (s, v) => { s.gears[g - 1] = v; },
    fmt: (v, s) => { const G = applySetup(S, s, id).gears; return spd(G[g]); },
    more: `Longer ${g === 1 ? 'first gear: less wheelspin off the line and out of hairpins' : g === n ? 'top gear: more top speed, if the engine can pull it' : 'gear: fewer shifts, a softer pull'}.`,
    less: `Shorter: ${g === n ? 'reaches the limiter sooner on a long straight' : 'a harder pull through it, shifting sooner'}.`, gearCheck: g });
  return f;
}

// (gears must stay in order: each one longer than the one before)
export function fixGears(st, id) {
  const G = CARS[id].spec.gears;
  for (let g = 2; g < G.length; g++) { const lo = (G[g - 1] * st.gears[g - 2]) / G[g] + 0.02; if (st.gears[g - 1] < lo) st.gears[g - 1] = Math.min(1.2, lo); }
}

// ---------- saved setups ----------
const KEY = 'svgp.setups';
let store = null;
function load() { if (store) return store; try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { store = {}; } return store; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
// a car's entry: { active: name | null, list: [{ name, s, at }] }
const entry = (id) => { const S = load(); return S[id] || (S[id] = { active: null, list: [] }); };
export const setupList = (id) => entry(id).list;
export const activeName = (id) => entry(id).active;
// what the car races with: its active setup (merged over the standard one, so older saves gain new adjustments)
export function activeSetup(id) {
  const e = entry(id), it = e.active && e.list.find(x => x.name === e.active);
  return it ? { ...defaultSetup(id), ...JSON.parse(JSON.stringify(it.s)) } : null;
}
export function saveSetup(id, name, s) {
  const e = entry(id), it = e.list.find(x => x.name === name), copy = JSON.parse(JSON.stringify(s));
  if (it) { it.s = copy; it.at = Date.now(); } else e.list.push({ name, s: copy, at: Date.now() });
  e.active = name; save();
}
export function useSetup(id, name) { entry(id).active = name; save(); }
export function deleteSetup(id, name) { const e = entry(id); e.list = e.list.filter(x => x.name !== name); if (e.active === name) e.active = null; save(); }
export const isStandard = (id, s) => JSON.stringify(s) === JSON.stringify(defaultSetup(id));
// the next free name: "Setup 1", "Setup 2"... or, given one (the circuit you're at), "Auburn", "Auburn 2"...
export function nextName(id, base = null) {
  const L = setupList(id), taken = (n) => L.some(x => x.name.toLowerCase() === n.toLowerCase());
  if (base) { if (!taken(base)) return base; let n = 2; while (taken(`${base} ${n}`)) n++; return `${base} ${n}`; }
  let n = L.length + 1; while (taken(`Setup ${n}`)) n++; return `Setup ${n}`;
}
// a new name for a saved setup (kept unique for the car: "Wet" taken, it becomes "Wet 2"); returns the name it got
export function renameSetup(id, from, to) {
  const e = entry(id), it = e.list.find(x => x.name === from); to = String(to || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!it || !to || to === from) return from;
  const L = e.list.filter(x => x !== it), taken = (n) => L.some(x => x.name.toLowerCase() === n.toLowerCase());
  let name = to, n = 2; while (taken(name)) name = `${to} ${n++}`;
  it.name = name; if (e.active === from) e.active = name; save(); return name;
}

// ---------- what a setup does: quick tests on the open plane ----------
// top speed and 0-100 (a straight), steady cornering grip in a slow (60 km/h) and a fast corner (200 km/h, or 80%
// of top speed), the stop from 160 km/h, and the balance at the limit: how hard the rears work against the fronts
// (> 0 the rear goes first: oversteer). ~60 ms a car. Standard aids, stability control off (it would hide balance).
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 }, DT = 1 / 240; // (the game's step: stiff setups need it)
const AIDS = physAids({ ...PRESETS.standard.aids, stab: 'off' });
function mk(spec, v = 0, gear = 1) { const p = new CarPhysics(spec); p.setAids(AIDS); p.fitTyres('medium'); p.place(0, 0, 0); p.vz = v; p.gear = gear; return p; }
// (steer straight to the wheels, not as a pad: a pad's lock at speed is measured per car, and these sweeps want angles)
function run(p, T, ctl, each) { for (let t = 0; t < T; t += DT) { p.step(DT, { brake: 0, throttle: 0, steer: 0, handbrake: 0, analog: true, ...ctl(t, p) }, ENV); if (each && each(t, p) === false) break; } }
function corner(spec, V) {
  let best = 0, bal = 0;
  // (a steering sweep, held 2.5 s each, the grip the car settles at; it stops at a spin: past that the rear's gone)
  for (const st of [0.04, 0.07, 0.1, 0.14, 0.19, 0.25, 0.33, 0.43, 0.56, 0.72]) {
    const p = mk(spec, V, 3); let g = 0, n = 0, b = 0, spun = false;
    run(p, 2.5, (t, p) => ({ steer: st, throttle: p.speed < V ? 0.7 : 0.15 }), (t, p) => { if (Math.abs(p.beta) > 0.35) { spun = true; return false; } if (t > 1.7) { g += Math.abs(p.latG); b += (p.gripR - p.gripF); n++; } });
    if (spun || !n) { bal = Math.max(bal, 0.3); break; }
    if (g / n > best) { best = g / n; bal = b / n; } else if (g / n < best * 0.97) break; // (past the peak: understeering, no point going on)
  }
  return { g: best, bal };
}
export function measure(spec) {
  let top = 0, t100 = 0, t60 = 0;
  const p = mk(spec); run(p, 70, () => ({ throttle: 1 }), (t, p) => { if (!t60 && p.speed >= 26.82) t60 = t; if (!t100 && p.speed >= 27.78) t100 = t; top = Math.max(top, p.speed); });
  const slow = corner(spec, 16.7), fast = corner(spec, Math.min(55.6, top * 0.8));
  let stop = 0; const b = mk(spec, 44.4, 4); run(b, 10, () => ({ brake: 1 }), (t, p) => { stop = Math.hypot(p.x, p.z); if (p.speed < 0.3) return false; });
  return { top, t100, t60, slowG: slow.g, fastG: fast.g, stop, bal: (slow.bal + fast.bal) / 2, balSlow: slow.bal, balFast: fast.bal };
}
const baseCache = {};
export const measureBase = (id) => baseCache[id] || (baseCache[id] = measure(applySetup(CARS[id].spec, defaultSetup(id), id)));
