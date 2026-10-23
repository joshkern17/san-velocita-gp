// Car physics: the vehicle model every car drives on (player, AI, the ghost's reference lap, the AI's learning).
// Kept free of THREE / the DOM so it runs in plain node: the tests in .devtest/physics/ import it directly.
// The plan this is being built to (and where it's up to) is in docs/PHYSICS.md.
import { AI_AIDS } from './aids.js';

// ---------------- physics ----------------

// bump whenever the physics changes how a car drives: learned AI speed plans saved by an older version are relearned
export const PHYS_VERSION = 9;

export const CARSPEC = {
  mass: 740, inertia: 1100, a: 1.85, b: 1.75, L: 3.6, cgh: 0.22,
  mu: 1.79, kd: 2.2, rearGrip: 1.08, drag: 0.9, roll: 14,
  power: 720000, maxForce: 14000, maxSteer: 0.36,
  gears: [0, 24, 34, 43, 52, 61, 70, 80, 94],
  redline: 12500, idle: 4000, box: 'seamless', shift: 0.03,
  // handling (see cars.js): slicks peak early (~5°) and the fronts fall away past it; the rears stay a touch flatter
  slipFall: 1.4, slipPeak: 0.085, slipFallR: 1.3, slipPeakR: 0.09, brakeF: 0.64,
  engineI: 0.05, // (a Formula car's small, light engine: little inertia to spin up through the gearbox)
  lsd: [100, 0.5, 0.3], // (a race diff: locks well on power for traction, less off it so the car still turns in)
  aeroH: [0.04, 0.02], aeroYaw: 4, // (wings + floor close to the road: ride height matters a lot; stalls when sideways)
  wake: [0.15, 0.06], // (a car length behind another: 15% of the front wing's downforce gone, 6% at the rear. Was 0.4 / 0.18: true to modern F1, but a follower couldn't stay close enough to race, 2026-10-09)
  floorH: 0.085, // (the floor's height off the road standing still, m: Realistic damage's floorCheck)
  tyreT: 20, // (°C over the compound's usual best: a Formula tyre's stiffer build works hotter, ~105-125: tyreHeat)
  // suspension: stiff, on a stiff chassis (aero needs the ride height held): ~4.5-5 Hz, half a degree of roll per g
  body: [2.95, 2.7, 1.0], // (the body in plan, m: front / rear of the centre of mass, half width. contact.js bodyBox)
  travel: [0.045, 0.03], // (m: little travel, the car is held at the ride height its floor needs)
  track: 1.6, rideHz: [4.5, 5], damp: 0.6, rollGrad: 0.5, unsprung: 20, rollBias: 0.05, rcH: 0.04, antiDive: 0.5, antiSquat: 0.5,
};

const G = 9.81, D2R = Math.PI / 180;
// the engine's water: heat per second flat out, cooling per °C over the air at speed (88°C racing, undamaged)
const ENG = { heat: 2.8, cool: 0.044, tow: 0.15 }, ENG_COOK = 140; // (cool: a healthy car flat out in clean air on a 30°C day settles ~94°C; tow: the air a car ahead takes off the radiator) // (°C·s over 132°C before it lets go: ~14 s at 142°C, a minute at 134°C)
// the floor: static height h (m, a spec's floorH else this); touching down closing faster than v m/s knocks off hit × (the
// excess); scraping, per cm under per s at 40 m/s; off-track grinding per wheel per s at 30 m/s
const FLOOR = { h: 0.11, v: 0.25, hit: 0.04, grind: 0.006, scrape: 0.004 };
const BENT_TOE = 3 * Math.PI / 180; // (a corner bent all the way: its toe 3° out (or in))
// dirty air: the share of each axle's downforce lost right behind another car (CarPhysics.aero; F1 / GT specs their own)
export const WAKE = [0.25, 0.1];

// tyre compounds: grip multiplier and wear per metre (at typical race usage a Medium lasts ~25 km), and the temperature
// (°C) each works best at (tyreHeat): softer ones lower, so they come in sooner and overheat sooner
export const TYRES = {
  soft:   { label: 'Soft',   short: 'S', grip: 1.035, rate: 5.0e-5, opt: 85, color: 0xe0302a, css: '#e0302a' },
  medium: { label: 'Medium', short: 'M', grip: 1.0,   rate: 2.8e-5, opt: 95, color: 0xf2d22a, css: '#f2d22a' },
  hard:   { label: 'Hard',   short: 'H', grip: 0.972, rate: 1.75e-5, opt: 105, color: 0xf0f0f0, css: '#f0f0f0' },
  wet:    { label: 'Wet',    short: 'W', grip: 0.9,   rate: 2.8e-5, opt: 55, color: 0x2a7ae0, css: '#3a8af0' },
  dirt:   { label: 'Dirt',   short: 'D', grip: 1.0,   rate: 2.6e-5, opt: 50, color: 0xa8743a, css: '#b8824a' }, // (block tread: for dirt tracks)
};
// Tyre temperatures (CarPhysics.tyreHeat), by mode: 1 Normal (one temperature per tyre, a wide window), 2 Realistic
// (a surface that heats and cools fast over a core that's slow; a narrower window, more grip lost outside it). win:
// °C from the best temperature where a tyre has lost k of its grip (×(Δ/win)²), at most max.
export const TEMP = { 1: { win: 35, k: 0.02, max: 0.08 }, 2: { win: 25, k: 0.03, max: 0.15 } };
export const tempGrip = (T, c, mode, dT = 0) => { const m = TEMP[mode]; if (!m) return 1; const x = (T - TYRES[c].opt - dT) / m.win; return 1 - Math.min(m.max, m.k * x * x); };
// heating and cooling (per second): sliding (the tyre's force × how fast it slides over the road, per the load on it:
// a tyre pressed down by downforce is a bigger, heavier one, so it's how hard it slides that counts), rolling (the carcass flexing: speed × its load), and the air (more the faster it's going, much more in the wet)
const HEAT = { slide: 0.42, roll: 0.011, air0: 0.004, air1: 0.0004, wet: 2.5 };
// grip left in a tyre: gentle fade, then a cliff below 30%
export const wearGrip = (w) => w > 0.3 ? 1 - 0.08 * (1 - w) / 0.7 : 0.92 - 0.7 * (0.3 - w);
// dirt: on a dirt track's dirt (race.js sets CarPhysics.onDirt). Dirt tyres are what the dirt's grip is measured on;
// tarmac tyres there have ~11% less (the wet a little more), and dirt tyres on tarmac have 12% less, like wets in the dry
export function tyreGrip(c, rain, dirt = false) {
  if (dirt) return c === 'dirt' ? (rain ? 0.95 : 1) : TYRES[c].grip * (c === 'wet' ? 0.94 : 0.89) * (rain ? 0.85 : 1);
  if (c === 'dirt') return rain ? 0.9 : 0.88;
  if (c === 'wet') return rain ? 0.97 : 0.9;
  return TYRES[c].grip * (rain ? 0.82 : 1);
}
// how much faster than its own rate a compound wears on this surface: the wrong tyre for it (wets on a dry road, dirt
// tyres on tarmac) chunks its tread, 3x; tarmac compounds on dirt tear a little on the stones, 1.2x
// grip on a road that's partly wet (wet: 0 dry .. 1 soaked): between the two (race.js changes it as the weather does)
export const tyreGripAt = (c, wet, dirt = false) => wet <= 0 ? tyreGrip(c, false, dirt) : wet >= 1 ? tyreGrip(c, true, dirt) : tyreGrip(c, false, dirt) * (1 - wet) + tyreGrip(c, true, dirt) * wet;
export const wearMul = (c, rain, dirt = false) => dirt ? (c === 'dirt' || c === 'wet' ? 1 : 1.2) : (c === 'wet' && !rain) || c === 'dirt' ? 3 : 1;
// speed-sensitive steering lock (lower = more lock at speed). 0.05 limited fast corners to ~77% of front grip.
export const LOCK_K = 0.035;
// tyre side force vs slip angle (a simplified Pacejka curve): rises to a peak at spec.slipPeak (rad), then falls toward
// sin(C * pi/2) of the peak. C = spec.slipFall: 1.45 drops 24% (snappy), 1.25 keeps 92% (slides stay catchable)
export const tyreCurve = (C, peak) => { const B = Math.tan(Math.PI / (2 * C)) / peak; return (a) => Math.sin(C * Math.atan(B * a)); };
// torque multiplier from a curve of [rpm fraction, multiplier] points
export function torqueAt(C, x) {
  x = Math.min(1, Math.max(0, x));
  for (let i = 1; i < C.length; i++) if (x <= C[i][0]) { const [x0, y0] = C[i - 1], [x1, y1] = C[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1); }
  return C[C.length - 1][1];
}

// Combined-slip tyre force (Pacejka's similarity method): sx, sy = longitudinal and lateral slip, each over its peak.
// Their length s is how hard the tyre is worked. Under the peak (s < 1) each direction reads its own curve at s
// (sideways C/B, along the road CX/BX) and takes its share by direction; past it the tyre is sliding, and one curve
// (the two blended by direction) gives the force along the slip. Both are 1 at the peak, so they meet there.
// Writes TF[0] (along the wheel), TF[1] (across).
// (the blended curve under the peak too swapped the sideways curve for the along-the-road one the moment a tyre was
// driven: the rears lost ~40% of their cornering stiffness on any throttle, and cars wove on the straights)
const TF = [0, 0];
// per-wheel scratch for CarPhysics.step (steps never run inside each other, so one set serves every car)
const W4 = {}; for (const k of ['n', 'cap', 'a', 'sy', 'u', 'y', 'x', 'abt', 'lim', 'fx', 'fy', 'tb', 'sfx']) W4[k] = new Float64Array(4);
function tyreForce(cap, C, B, CX, BX, sx, sy) {
  const s2 = sx * sx + sy * sy;
  if (s2 < 1e-12) { TF[0] = TF[1] = 0; return; }
  const s = Math.sqrt(s2), wx = sx * sx / s2;
  // (a curve only for a direction with slip: half the trig when it's all one way)
  const fY = sy === 0 ? 0 : Math.sin(C * Math.atan(B * s)), fX = sx === 0 ? 0 : Math.sin(CX * Math.atan(BX * s));
  if (s < 1) { const k = cap / s; TF[0] = k * fX * sx; TF[1] = -k * fY * sy; return; }
  const F = cap * (fY * (1 - wx) + fX * wx) / s; TF[0] = F * sx; TF[1] = -F * sy;
}

// A pad's steering lock at speed, per car: the wheel angle where it corners hardest at each speed (a slow steering
// ramp, speed held, on its own copy of the car), so full stick can be put just past it (see step). Measured once per
// spec (a setup is a new spec), 40-90 ms: at the grid (CarPhysics.warmPad), or else the first time a pad steers it.
// [m/s, rad] pairs.
const PAD_V = [15, 25, 35, 50, 65, 80, 95], padCals = new WeakMap();
function padCal(spec) {
  let cal = padCals.get(spec);
  if (cal) return cal;
  cal = [];
  const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
  // (a car that pulls one way on its own, a sprint car's stagger: held straight on the run up, and swept the way it turns)
  const dir = (spec.stagger ?? 0) > 0 ? -1 : 1;
  for (const vt of PAD_V) {
    const c = new CarPhysics(spec); c.fitTyres('medium'); c.place(0, 0, 0);
    let t = 0;
    for (; t < 30 && c.speed < vt; t += DT) c.step(DT, { throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, c.h * 3 + c.r * 0.6)), handbrake: 0, analog: true }, ENV);
    if (c.speed < vt - 1) break; // (past its top speed: the last angle carries on)
    let best = 0, at = 0;
    for (let k = 0; k < 3 / DT; k++) {
      const e = vt - c.speed;
      c.step(DT, { throttle: Math.max(0, Math.min(1, e * 0.8)), brake: Math.max(0, Math.min(1, -e * 0.5)), steer: dir * k * DT / 3, handbrake: 0, analog: true }, ENV);
      if (Math.abs(c.beta) > 0.15) break;
      if (Math.abs(c.latG) > best) { best = Math.abs(c.latG); at = Math.abs(c.delta); }
    }
    if (!(at > 0)) break; // (never measured: the last angle carries on, rather than a lock of 0)
    cal.push([vt, at]);
  }
  padCals.set(spec, cal);
  return cal;
}
const padLock = (cal, u) => {
  if (!cal.length) return Infinity;
  if (u <= cal[0][0]) return cal[0][1];
  for (let i = 1; i < cal.length; i++) if (u <= cal[i][0]) { const [v0, a0] = cal[i - 1], [v1, a1] = cal[i]; return a0 + (a1 - a0) * (u - v0) / (v1 - v0); }
  return cal[cal.length - 1][1];
};

export class CarPhysics {
  constructor(spec = CARSPEC) {
    this.p = spec;
    // front and rear tyre curves: the fronts fall off more past the peak (pushing too hard is felt, and costs you), the
    // rears stay flatter so a slide is catchable
    this.curve = tyreCurve(spec.slipFall ?? 1.45, spec.slipPeak ?? 0.169);
    this.curveR = tyreCurve(spec.slipFallR ?? spec.slipFall ?? 1.45, spec.slipPeakR ?? spec.slipPeak ?? 0.169);
    // the same curves over normalised slip (1 = the peak): the combined-slip force in step()
    this.nCF = spec.slipFall ?? 1.45; this.nBF = Math.tan(Math.PI / (2 * this.nCF));
    this.nCR = spec.slipFallR ?? spec.slipFall ?? 1.45; this.nBR = Math.tan(Math.PI / (2 * this.nCR));
    // wheels (see step): per-wheel spin (rad/s), slip ratio and ABS pressure, order FL FR RL RR; the axle means alongside
    this.ws = new Float64Array(4); this.ks = new Float64Array(4); this.absK = new Float64Array(4).fill(1);
    this.wF = this.wR = 0; this.kF = this.kR = 0; this.tcK = 1; this.wInit = false;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0;
    this.vx = 0; this.vz = 0; this.r = 0;
    this.steer = 0; this.delta = 0;
    this.gear = 1; this.rpm = spec.idle; this.shiftT = 0; this.revT = 0;
    this.axPrev = 0; this.ayPrev = 0; this.loadT = 0;
    this.escK = 1; this.escB = 0; this.pitch = 0; this.roll = 0; this.heave = 0;
    this.setupSuspension();
    this.u = 0; this.v = 0; this.speed = 0;
    this.slipF = 0; this.slipR = 0; this.spin = 0; this.braking = 0; this.throttle = 0;
    this.auto = true;
    // driver aids (see aids.js physAids). aidBase = the driver's choice; `tc = false` switches traction + stability
    // off for a moment (an AI spin), `tc = true` puts the driver's choice back
    this.setAids(AI_AIDS);
    this.aidT = { abs: 0, tc: 0, stab: 0, cs: 0, steer: 0, brake: 0 }; // > 0 while an aid is stepping in (for the HUD)
    this.lockF = false; this.lockR = false; // wheels locked under braking (ABS off)
    this.powerMul = 1; this.gripMul = 1;
    this.isAI = false; // an AI driver: never gets the drift mode of the traction control (it doesn't drift on purpose)
    this.tyre = { c: 'medium', wf: 1, wr: 1 };
    this.dmg = { fw: 0, rw: 0, ch: 0, rad: 0, gb: 0, fl: 0 }; // (rad: the radiator, gb: the gearbox, fl: the floor and diffuser; Realistic damage)
    // detailed damage (Realistic: bentOn): each corner's suspension bent 0..1 (FL FR RL RR), its toe knocked out or in
    // (bentDir, -1 out mostly) and its camber with it: that wheel scrubs and grips less, and the car pulls. dmg.ch is
    // then the worst corner (what repairs, the pit wall and the HUD read); its own all-round grip loss and pull step back
    this.bentOn = false; this.bent = new Float64Array(4); this.bentDir = new Int8Array(4);
    this.engOn = false; this.engT = 88; this.engK = 1; this.engCook = 0; this.engBlown = false; // (the engine's heat: engineHeat)
    this.lostGear = 0; this.gbBroken = false; this.missT = 0; // (the gearbox: gbHurt)
    this.pull = Math.random() < 0.5 ? -1 : 1;
    this.wearK = 1; this.rain = false;
    this.dfMul = 1; this.dragMul = 1; this.brakeMul = 1; this.Df = this.Dr = 0;
    this.hitT = 0; // s: just hit something (contact.js knock): the yaw aids stand back
    this.slip = 0; // 0..1 slipstream from a car ahead (set by the race each frame)
    this.wake = 0; // 0..1 how deep in a car ahead's dirty air (set by the race each frame: aero)
    this.wakeLoss = 0; // the share of the car's grip that dirty air is taking right now (the HUD's DIRTY AIR)
    // tyre temperatures (tyreHeat; the race sets these): tempMode 0 off / 1 Normal / 2 Realistic, ambT the air + road
    // a tyre cools toward (°C), blankets: race tyres come out of warmers, road tyres at the air's temperature
    this.tempMode = 0; this.ambT = 25; this.blankets = false;
    this.latW = new Float64Array(4).fill(0.5); // (each tyre's share of its work that's sideways: camberGrip)
    this.tS = new Float64Array(4).fill(25); this.tC = new Float64Array(4).fill(25); this.tempG = new Float64Array(4).fill(1); this.tempGrip = 1;
  }

  // The suspension, from the numbers an engineer would quote (all optional in the spec; class defaults in cars.js):
  //   rideHz [front, rear]  natural frequency of each end on its springs (road car ~1.5-1.8, GT racer ~2.5, F1 ~4.5)
  //   damp                  damping ratio (0.3 soft road car .. 0.6 race car)
  //   rollGrad              body roll per g of cornering, degrees (road ~3, sports ~2, GT racer ~1.2, F1 ~0.5)
  //   rollF                 the front's share of the roll stiffness (the anti-roll bars): more = more understeer.
  //   rollBias              ...or set relative to the weight split (default): front share = front weight share + this. Cars
  //                         are set up with the front a little stiffer than its weight share, so at the limit the front
  //                         lets go first (stable understeer): road cars ~0.1, race cars ~0.05 (more neutral, more grip)
  //   unsprung              kg per corner (wheel, tyre, brake, hub, half the links); track m; cgh m
  //   rcH                   roll-centre height, m: the links carry the cornering load transfer that acts below it
  //                         straight to the tyres, so only the rest leans the body on its springs (road ~0.08, F1 ~0.04)
  //   antiDive / antiSquat  share of the braking / accelerating load transfer the links carry instead of the springs
  //                         (0.2-0.5): the tyres' loads shift just the same, the nose dives / squats that much less
  //   tyreK                 the tyre's vertical stiffness, N/m
  //   travel [droop, bump]  how far each wheel can drop below / rise above where it sits at rest, m. Past full droop
  //                         the wheel hangs from the body (lift the body and the wheel comes off the road with it);
  //                         past the bump travel the bump stop takes it. (The bump stop sits further in by however
  //                         much the downforce squashes the car at its top speed: normal driving never reaches either)
  //   A setup (setup.js applySetup) adds: springK / arbK [front, rear] (× the springs' frequency / the bars' stiffness, on
  //   top of the car's own), rideOff [front, rear] (m lower / higher than standard: the aero map and the bump travel),
  //   and keeps the car's standard figures where something else is measured from them (gearsRef, kdRef, aeroFRef).
  setupSuspension() {
    const P = this.p, tw = P.track ?? 1.6, mu = P.unsprung ?? 40, ms = P.mass - 4 * mu, h = P.cgh; // (mu here: unsprung kg per corner)
    const [fF, fR] = P.rideHz ?? [1.7, 1.9], z = P.damp ?? 0.4, SK = P.springK ?? [1, 1], AK = P.arbK ?? [1, 1], RO = P.rideOff ?? [0, 0];
    const top0 = (P.gearsRef ?? P.gears)[(P.gearsRef ?? P.gears).length - 1], kd0 = P.kdRef ?? P.kd;
    const mcF = ms * P.b / P.L / 2, mcR = ms * P.a / P.L / 2; // sprung mass on each front / rear corner
    const kF0 = mcF * (2 * Math.PI * fF) ** 2, kR0 = mcR * (2 * Math.PI * fR) ** 2; // (the car's own springs: the bars and the aero map are set from them)
    const kF = kF0 * SK[0] * SK[0], kR = kR0 * SK[1] * SK[1];
    const cF = 2 * z * Math.sqrt(kF * mcF), cR = 2 * z * Math.sqrt(kR * mcR);
    // roll stiffness for the roll gradient, shared by rollF; the springs give k·tw²/2 per axle, the bars the rest
    const rc = Math.min(h * 0.8, P.rcH ?? 0.08);
    const Kroll = ms * G * (h - rc) / ((P.rollGrad ?? 2.5) * Math.PI / 180), rollF = P.rollF ?? Math.min(0.8, P.b / P.L + (P.rollBias ?? 0.1));
    // (a setup's bars: each step adds or takes away a share of that axle's roll stiffness, so it works the same on a car
    // whose springs alone already hold it up, F1's, with no bar to speak of)
    // (a setup's bars: each step adds or takes away a share of that axle's roll stiffness, so it works the same on a car
    // whose springs alone already hold it up past its roll target (F1's, with no bar to speak of): there a softer
    // setting takes some of the springs' roll stiffness away, as a softer bar would on a car that had one)
    const rsF = Math.max(rollF * Kroll, kF0 * tw * tw / 2), rsR = Math.max((1 - rollF) * Kroll, kR0 * tw * tw / 2);
    const arbF = Math.max(-0.2 * kF0, Math.max(0, (rollF * Kroll - kF0 * tw * tw / 2) / (tw * tw)) + (AK[0] - 1) * rsF / (tw * tw));
    const arbR = Math.max(-0.2 * kR0, Math.max(0, ((1 - rollF) * Kroll - kR0 * tw * tw / 2) / (tw * tw)) + (AK[1] - 1) * rsR / (tw * tw));
    this.susp = { tw, ms, h, rc, antiD: P.antiDive ?? 0.3, antiS: P.antiSquat ?? 0.3, kF, kR, cF, cR, arbF, arbR, Ixx: ms * (tw / 2) ** 2 * 0.6, Iyy: ms * (P.L / 2) ** 2,
      nF: P.mass * G * P.b / P.L / 2, nR: P.mass * G * P.a / P.L / 2 };
    // each tyre's static load (FL FR RL RR): the axle's share, split left / right by where the centre of mass sits across
    // the car (cgY m, + left: a sprint car's chassis is offset to the left, ~55-60% of its weight on the left tyres)
    const cy = P.cgY ?? 0, sL = 0.5 + cy / tw, sR = 1 - sL, S0 = this.susp;
    S0.n4 = new Float64Array([2 * S0.nF * sL, 2 * S0.nF * sR, 2 * S0.nR * sL, 2 * S0.nR * sR]);
    // (the body's own roll / pitch frequencies on its springs, rad/s: contact.js rock sizes a jolt by them)
    this.susp.wRoll = Math.sqrt(Kroll / this.susp.Ixx); this.susp.wPitch = Math.sqrt(2 * (kF * P.a * P.a + kR * P.b * P.b) / this.susp.Iyy);
    // each wheel: its unsprung mass on the tyre's own spring (tyreK N/m, ~200-300k: the tyre is the stiffest spring in
    // the car), so a kerb's stripes shake the wheel and only some of that reaches the body, and a wheel can leave the road
    const kt = P.tyreK ?? 230000;
    Object.assign(this.susp, { mu, kt, ct: 2 * 0.05 * Math.sqrt(kt * mu) });
    // the travel limits: a stiff stop (the bump rubber, or the dampers / links at full droop), damped against the body's
    // corner as a rubber is (it soaks a hit up: an undamped stop bounced a car landing on one side right off the road),
    // within what the wheel's half step stays stable with (c·dt/2 < 2·unsprung)
    const [dr, bu] = P.travel ?? [0.1, 0.08], v2 = top0 ** 2, aF0 = P.aeroFRef ?? P.aeroF ?? P.b / P.L, kS = 4 * kt;
    // (a lower car has that much less bump travel before the stop)
    Object.assign(this.susp, { droop: dr, bumpF: Math.max(0.012, bu + 1.15 * kd0 * aF0 * v2 / 2 / kF0 + RO[0]), bumpR: Math.max(0.012, bu + 1.15 * kd0 * (1 - aF0) * v2 / 2 / kR0 + RO[1]), rideOff: RO,
      kS, cS: Math.min(2 * 0.7 * Math.sqrt(kS * Math.min(mcF, mcR)), 1.5 * mu * 480) });
    // the aero map's reference ride heights: where each axle sits (relative to standing still: springs and tyres
    // squashed) under its downforce at ~200 km/h (or the car's top speed if lower), the height kd and aeroF describe
    // (from the car's own springs and aero: stiffer springs hold the car up higher at speed, and that costs downforce)
    const vRef = Math.min(55, top0 * 0.9) ** 2, aF = aF0;
    this.susp.zRefF = -kd0 * aF * vRef / 2 * (1 / kF0 + 1 / kt);
    this.susp.zRefR = -kd0 * (1 - aF) * vRef / 2 * (1 / kR0 + 1 / kt);
    this.body = { z: 0, th: 0, ph: 0, vz: 0, vth: 0, vph: 0 }; // heave (m, up), pitch (rad, nose up), roll (rad, +v side up)
    this.wz = new Float64Array(4); this.wv = new Float64Array(4); this.wr = new Float64Array(4); // wheel height / speed, road height
    this.we = new Float64Array(4); // the road height each tyre actually rides (enveloped: see bodyStep)
    this.suspFS = new Float64Array(4); // each corner's suspension force on the body beyond its static share (N, up)
    this.suspF = new Float64Array(4); // each tyre's load beyond its static share (N): what step() reads
  }
  // the body and wheels for one step (two half steps: the wheels on their tyres are quick): the suspension's forces
  // (springs, dampers, bars) between each corner of the body and its wheel; the body pushed by the car's acceleration at
  // its centre-of-mass height and by the downforce; each wheel between its spring and its tyre on the road (zr: the
  // ground's height under each wheel, m, or none for a flat road); then the load each tyre will carry next step
  bodyStep(dt, ax, ay, Df, Dr, zr = null, speed = 0) {
    const S = this.susp, B = this.body, P = this.p, F = this.suspF, FS = this.suspFS, tw = S.tw, WZ = this.wz, WV = this.wv, WR = this.wr, WE = this.we;
    const h = dt / 2;
    // the links' share of the load transfer (roll centre, anti-dive / anti-squat): straight from the body to each wheel,
    // without leaning the body on its springs. Cornering: below the roll-centre height, each axle by its share of the
    // car's weight; braking / accelerating: the anti share
    const gyF = S.ms * P.b / P.L * ay * S.rc / tw, gyR = S.ms * P.a / P.L * ay * S.rc / tw;
    const gx = S.ms * ax * S.h * (ax < 0 ? S.antiD : S.antiS) / P.L / 2;
    // tyre enveloping: a tyre doesn't follow a step or a sharp edge in the road instantly, it wraps round it and rolls up
    // over about its own contact length, so the road height it rides climbs at most ~35° per metre travelled
    const climb = Math.max(0.5, speed) * 0.7 * dt;
    if (zr) for (let i = 0; i < 4; i++) WE[i] += Math.max(-climb, Math.min(climb, zr[i] - WE[i]));
    else WE.fill(0);
    for (let sub = 0; sub < 2; sub++) {
      // each corner: compression (+ = squashed: wheel up toward the body) and its rate; spring + damper + bar
      for (let ax2 = 0; ax2 < 2; ax2++) {
        const x = ax2 ? -P.b : P.a, k = ax2 ? S.kR : S.kF, c = ax2 ? S.cR : S.cF, arb = ax2 ? S.arbR : S.arbF, L = ax2 * 2, Rw = L + 1;
        const zb = B.z + x * B.th, vb = B.vz + x * B.vth, rz = (tw / 2) * B.ph, rv = (tw / 2) * B.vph;
        const sL = WZ[L] - (zb + rz), sR = WZ[Rw] - (zb - rz), vL = WV[L] - (vb + rv), vR = WV[Rw] - (vb - rv);
        const gl = ax2 ? gx : -gx, gy = ax2 ? gyR : gyF;
        FS[L] = k * sL + c * vL + arb * (sL - sR) + gl - gy;
        FS[Rw] = k * sR + c * vR - arb * (sL - sR) + gl + gy;
        // (at the end of its travel: the stop)
        const bmp = ax2 ? S.bumpR : S.bumpF;
        if (sL < -S.droop) FS[L] += S.kS * (sL + S.droop) + S.cS * vL; else if (sL > bmp) FS[L] += S.kS * (sL - bmp) + S.cS * vL;
        if (sR < -S.droop) FS[Rw] += S.kS * (sR + S.droop) + S.cS * vR; else if (sR > bmp) FS[Rw] += S.kS * (sR - bmp) + S.cS * vR;
      }
      let Fz = -(Df + Dr), Mth = -Df * P.a + Dr * P.b + S.ms * ax * S.h, Mph = S.ms * ay * S.h - (Df + Dr) * (P.aeroY ?? 0);
      for (let i = 0; i < 4; i++) { const x = i < 2 ? P.a : -P.b, y = (i & 1 ? -1 : 1) * tw / 2; Fz += FS[i]; Mth += x * FS[i]; Mph += y * FS[i]; }
      B.vz += Fz / S.ms * h; B.vth += Mth / S.Iyy * h; B.vph += Mph / S.Ixx * h;
      B.z += B.vz * h; B.th += B.vth * h; B.ph += B.vph * h;
      // each wheel: the tyre pushes it up off the road (never pulls: a wheel can lift), the spring pushes it down
      for (let i = 0; i < 4; i++) {
        const z0 = WE[i], vr = sub === 0 ? (z0 - WR[i]) / dt : 0; if (sub === 0) WR[i] = z0;
        const n0 = S.n4[i];
        const Ft = Math.max(-n0, S.kt * (z0 - WZ[i]) + S.ct * (vr - WV[i])); // (beyond the static load)
        WV[i] += (Ft - FS[i]) / S.mu * h; WZ[i] += WV[i] * h;
        F[i] = Ft;
      }
    }
    this.pitch = B.th; this.roll = B.ph; this.heave = B.z; // (for the car model on screen; the wheels: wz)
    if (this.engOn) this.floorCheck(dt, speed);
  }
  // The floor's clearance (Realistic damage): its four corners (a little inside the wheels) at the car's static floor
  // height (floorH, m, tuned so a car on its standard setup keeps ~8 mm on a clean lap) plus a setup's ride height, moved by the body (heave, pitch, roll:
  // downforce squashing it, braking, cornering) and lifted by a curb under it. Touching down closing faster than
  // FLOOR.v knocks a piece off (floorHit); scraping along wears it.
  floorCheck(dt, speed) {
    const S = this.susp, B = this.body, P = this.p, RO = S.rideOff, WE = this.we, tw = S.tw, c0 = P.floorH ?? FLOOR.h;
    const FH = this.flH || (this.flH = new Float64Array(4).fill(c0)), TU = this.flTouch || (this.flTouch = new Uint8Array(4));
    for (let i = 0; i < 4; i++) {
      const fr = i < 2, x = fr ? P.a * 0.8 : -P.b * 0.8, y = (i & 1 ? -1 : 1) * tw * 0.35;
      const h = c0 + RO[fr ? 0 : 1] + B.z + x * B.th + y * B.ph - Math.max(0, WE[i]) * 0.3, vh = (h - FH[i]) / Math.max(dt, 1e-4); FH[i] = h;
      if (h < 0) {
        if (!TU[i]) this.floorHit(-vh);
        if (speed > 8) this.dmg.fl = Math.min(1, (this.dmg.fl || 0) + FLOOR.scrape * -h * 100 * speed / 40 * dt);
      }
      TU[i] = h < 0;
    }
  }
  // the body for a car this machine doesn't simulate (an online rival): the same suspension, pushed by the g-forces and
  // speed it sends (in small steps, so the stiffest springs stay stable at any frame rate)
  bodyFromG(dt) {
    for (let n = Math.min(12, Math.ceil(Math.min(dt, 0.05) * 240)), k = 0; k < n; k++) { this.aero(this.u, 0); this.bodyStep(Math.min(dt, 0.05) / n, (this.lonG || 0) * G, (this.latG || 0) * G, this.Df, this.Dr); }
  }
  // Downforce on each axle (N, into this.Df / this.Dr), from the car's aero map. kd·u² is the car's downforce at its
  // reference ride height (see setupSuspension), shared front / rear by aeroF. Two things move it from there:
  //   ride height (aeroH [front, rear]: the share each axle gains per cm lower): a wing or a floor close to the road
  //     works harder (ground effect), so when the nose dips under braking the front gains downforce and the rear, lifted,
  //     loses some: the balance moves forward into a corner and back on the power out of it. Bumps and kerbs move it too.
  //   yaw (aeroYaw: the loss at the body's slip angle β, as 1 − aeroYaw·β²): wings and floors are made to work with
  //     the air coming straight at them; sideways they stall, so a car sliding (or drifting) loses much of its downforce.
  //   dirty air (wake [front, rear]: the share lost right behind a car, × this.wake): the turbulent air off a car ahead
  //     feeds the wings and floor less, the front wing worst, so a car following closely through a corner pushes wide
  //     and can't stay as close as on the straight (where the same air is a tow: this.slip, less drag).
  // Damage to a wing takes away part of that axle's share (as before).
  aero(u, beta) {
    const P = this.p, S = this.susp, B = this.body, D = P.kd * this.dfMul * u * u, aF = P.aeroF ?? P.b / P.L, H = P.aeroH;
    const yaw = Math.max(0.3, 1 - (P.aeroYaw ?? 0) * beta * beta), wk = this.wake, W = P.wake ?? WAKE;
    const RO = S.rideOff;
    const hF = H ? Math.max(0.7, Math.min(1.3, 1 + H[0] * (S.zRefF - (B.z + P.a * B.th + RO[0])) * 100)) : 1;
    const hR = H ? Math.max(0.7, Math.min(1.3, 1 + H[1] * (S.zRefR - (B.z - P.b * B.th + RO[1])) * 100)) : 1;
    const fl = this.dmg.fl || 0; // (a damaged floor: the diffuser at the back works least)
    this.Df = D * aF * hF * yaw * (1 - 0.55 * this.dmg.fw) * (1 - W[0] * wk) * (1 - 0.2 * fl); this.Dr = D * (1 - aF) * hR * yaw * (1 - 0.55 * this.dmg.rw) * (1 - W[1] * wk) * (1 - 0.45 * fl);
    this.wakeLoss = wk > 0.01 ? D * wk * (aF * W[0] + (1 - aF) * W[1]) / (P.mass * G + D) : 0;
  }

  warmPad() { padCal(this.p); }
  setAids(a) { this.aidBase = { ...a }; this.aid = { ...a }; }
  get tc() { return this.aid.stab; }
  set tc(v) { this.aid = v ? { ...this.aidBase } : { ...this.aidBase, tc: 0, stab: false }; }

  // 0..1 damage on 'fw' front wing, 'rw' rear wing, 'ch' chassis/suspension
  addDamage(part, amt) { this.dmg[part] = Math.min(1, this.dmg[part] + amt); }
  // a corner's suspension bent by a hit (k: FL FR RL RR): which way its toe goes is decided by the first knock
  addBend(k, amt) {
    if (!(amt > 0)) return;
    if (!this.bent[k]) this.bentDir[k] = Math.random() < 0.7 ? -1 : 1;
    this.bent[k] = Math.min(1, this.bent[k] + amt); this.dmg.ch = Math.max(this.dmg.ch, ...this.bent);
  }
  // everything fixed (a pit stop, the garage)
  repairAll() { this.dmg = { fw: 0, rw: 0, ch: 0, rad: 0, gb: 0, fl: 0 }; this.bent.fill(0); this.lostGear = 0; this.gbBroken = false; }
  // The floor and diffuser (Realistic damage: engOn). Bottoming out (a corner hitting its bump stop closing faster than
  // FLOOR.v m/s: a curb, a bump, a car run too low) knocks a piece off; running through gravel, grass or sand at speed
  // grinds it (not grass). A damaged floor makes less downforce, the rear (the diffuser) most: aero.
  floorHit(v) { if (this.engOn && v > FLOOR.v && this.speed > 8) { this.dmg.fl = Math.min(1, (this.dmg.fl || 0) + FLOOR.hit * (v - FLOOR.v)); this.floorHits = (this.floorHits || 0) + 1; } }
  // some of it fixed (a pit stop where you chose: Race.pitParts keys fw rw su rad gb)
  repairParts(keys) {
    const d = this.dmg;
    for (const k of keys) {
      if (k === 'su') { d.ch = 0; this.bent.fill(0); }
      else if (k === 'gb') { d.gb = 0; this.lostGear = 0; this.gbBroken = false; }
      else if (k === 'fl') d.fl = 0;
      else d[k] = 0;
    }
  }
  // The gearbox (Realistic damage: engOn). Damaged (dmg.gb) it shifts slower (up to 4x), from 0.35 now and then misses a
  // shift (a moment in neutral: missT), from 0.65 loses a gear (lostGear: the box skips it), at 1 it's broken
  // (gbBroken: the race retires the car). A manual downshift that would spin the engine past 106% of the redline costs it.
  gbHurt(amt) {
    if (!this.engOn || !(amt > 0)) return;
    const d = this.dmg; d.gb = Math.min(1, (d.gb || 0) + amt);
    if (d.gb >= 0.65 && !this.lostGear) { const n = this.p.gears.length - 1; this.lostGear = 2 + Math.floor(Math.random() * Math.max(1, n - 1)); }
    if (d.gb >= 1) this.gbBroken = true;
  }
  // a shift into gear g: how long it takes (and whether it's missed), on a damaged box
  gbShift(base) {
    const gb = this.engOn ? this.dmg.gb || 0 : 0;
    this.shiftT = base * (1 + 3 * gb);
    if (gb > 0.35 && Math.random() < (gb - 0.35) * 0.8) this.missT = 0.45;
  }
  // the next usable gear from g going dir (a lost gear's skipped); g itself when there's none
  gbNext(g, dir) { const n = this.p.gears.length - 1; let k = g + dir; if (k === this.lostGear) k += dir; return k >= 1 && k <= n ? k : g; }
  // the speed (m/s) this car's radiator is sized for: 60% of its top speed (where its power meets the drag, or its top
  // gear runs out), 25-60 m/s
  get coolV() {
    const P = this.p; if (this._coolP === P) return this._coolV;
    let v = P.gears[P.gears.length - 1];
    for (let lo = 0, hi = v, i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (P.drag * m * m * m + P.roll * m * m > P.power) hi = v = m; else lo = m; }
    this._coolP = P; return (this._coolV = Math.max(25, Math.min(60, 0.6 * v))); // (cached per spec: a setup swaps it)
  }
  // The engine's water temperature (Realistic damage: engOn). It makes heat with the throttle (and the revs), the
  // radiator takes it away with the air through it (a fan's worth standing still, less in another car's tow: slip), and
  // a thermostat holds it at ~88°C when there's cooling to spare. Every car's radiator is sized for its own speeds (the
  // air's measured against coolV: 60% of its top speed), with the margin to run flat out in clean air on a hot day and
  // still take a long tow (~105°C). A damaged radiator (dmg.rad) has less to spare: the temperature climbs to where it
  // balances. Over 112°C the engine protects itself (power down, to 55% at ~140°C);
  // held over 132°C it's cooking (engCook), and past ENG_COOK it lets go (engBlown: the race retires the car).
  engineHeat(dt, thr, speed) {
    const rpmK = Math.min(1, Math.max(0.2, this.rpm / this.p.redline));
    const heat = ENG.heat * (0.25 + 0.75 * thr * rpmK);
    const air = (0.35 + 0.65 * Math.min(1, speed / this.coolV)) * (1 - ENG.tow * (this.slip || 0)) * (1 - 0.6 * (this.dmg.rad || 0));
    const T = this.engT, open = T < 86 ? 0.25 : T < 90 ? 0.25 + 0.75 * (T - 86) / 4 : 1; // (the thermostat opening)
    this.engT = T + (heat - ENG.cool * air * open * (T - this.ambT)) * dt;
    this.engK = this.engT > 112 ? Math.max(0.55, 1 - (this.engT - 112) / 62) : 1;
    if (this.engT > 132) this.engCook += (this.engT - 132) * dt; else this.engCook = Math.max(0, this.engCook - dt * 2);
    if (this.engCook > ENG_COOK) this.engBlown = true;
  }
  fitTyres(c) {
    this.tyre = { c, wf: 1, wr: 1 };
    // (out of the warmers a little under their best; road tyres at the air's temperature, a little warmed by the sun)
    const t0 = this.blankets ? this.tyreOpt - 12 : this.ambT + 5;
    this.tS.fill(t0); this.tC.fill(t0); this.tempGrips();
  }
  // Camber (a setup's): each tyre's grip against what it'd have at the car's standard camber. Sideways, a tyre grips
  // best leaning in about 2.5° to the road (loaded up, it rolls onto its outer shoulder); along the road (braking,
  // traction), best upright. The body's roll leans the outside wheels out (×0.7: the links gain some back), so a car
  // that rolls a lot wants more negative camber. latW: how much of each tyre's work is sideways (last step).
  camberGrip() {
    const P = this.p, out = this.camG || (this.camG = new Float64Array(4)), roll = this.body.ph / D2R;
    const lat = (g) => 1 - 0.0035 * (g + 2.5) * (g + 2.5), lon = (g) => 1 - 0.0025 * g * g;
    for (let i = 0; i < 4; i++) {
      const k = i < 2 ? 0 : 1, sd = (i & 1) ? -1 : 1, g = P.camber[k], g0 = P.camber0[k], w = this.latW[i], dyn = -sd * 0.7 * roll;
      out[i] = (lat(g + dyn) * w + lon(g) * (1 - w)) / (lat(g0 + dyn) * w + lon(g0) * (1 - w));
    }
    return out;
  }
  // the temperature this car's tyres work best at (°C): the compound's, plus the car's own (tyreT: a Formula tyre's hotter)
  // (a cooler-working road tyre's offset is for the dry compounds: wets already work cool, in rain that keeps them there)
  get tyreOpt() { const c = this.tyre.c, d = this.p.tyreT || 0; return TYRES[c].opt + (d < 0 && (c === 'wet' || c === 'dirt') ? 0 : d); }
  // each tyre's grip from its temperature (tempG), and the four's mean (tempGrip: the AI reads it)
  tempGrips() {
    const c = this.tyre.c, m = this.tempMode, dT = this.tyreOpt - TYRES[c].opt; let a = 0;
    for (let i = 0; i < 4; i++) a += this.tempG[i] = m ? tempGrip(0.65 * this.tS[i] + 0.35 * this.tC[i], c, m, dT) : 1;
    this.tempGrip = a / 4;
  }
  // Tyre temperatures (tempMode 1 / 2): heated by sliding (the tyre's force × how fast it slides over the road) and by
  // rolling (the carcass flexing under load), cooled by the air rushing past (much more in the wet: a slick can't stay
  // warm on a wet road, a wet tyre on a dry one overheats). The surface takes the sliding heat and cools fast (a big
  // slide spikes it, then it's gone), the core takes the rolling heat and swaps heat with the surface slowly; grip from
  // 65% surface + 35% core. Both modes heat the same way, only the window differs (TEMP). (Normal had one temperature
  // per tyre, cooled as fast as a surface: it settled ~20 °C under Realistic, so nobody's tyres ever came in, 2026-10-15)
  tyreHeat(dt, FX, FY, A, WS, WU, WN, R, speed) {
    const st = this.p.mass * G / 4, wet = this.wet ?? (this.rain ? 1 : 0), amb = this.ambT, H = HEAT;
    const air = (H.air0 + H.air1 * speed) * (1 + H.wet * wet), moving = Math.min(1, speed / 2);
    for (let i = 0; i < 4; i++) {
      const vy = Math.abs(Math.tan(A[i])) * Math.max(Math.abs(WU[i]), 1), vx = Math.abs(WS[i] * (typeof R === 'number' ? R : R[i]) - WU[i]);
      const qS = H.slide * moving * (Math.abs(FY[i]) * Math.min(vy, 30) + Math.abs(FX[i]) * Math.min(vx, 30)) / Math.max(st, WN[i]), qR = H.roll * speed * Math.sqrt(Math.max(0, WN[i]) / st); // (sqrt: downforce loads a tyre more than it flexes it)
      const s = this.tS[i], c = this.tC[i];
      this.tS[i] = s + (qS * 3 + (c - s) * 0.25 - (s - amb) * air * 1.2) * dt;
      this.tC[i] = c + (qR + (s - c) * 0.08 - (c - amb) * air * 0.5) * dt;
    }
    this.tempGrips();
  }
  gripNow() {
    const t = this.tyre, g = (this.wet != null ? tyreGripAt(t.c, this.wet, this.onDirt) : tyreGrip(t.c, this.rain, this.onDirt)) * (1 - 0.08 * (this.bentOn ? 0 : this.dmg.ch));
    return g * (wearGrip(t.wf) + wearGrip(t.wr)) / 2;
  }

  // (the wheels pick up the car's speed on the next step: callers set a velocity straight after placing)
  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.vx = this.vz = this.r = 0; this.hitT = 0; this.gear = 1; this.steer = 0; this.wInit = false;
    if (this.body) { Object.assign(this.body, { z: 0, th: 0, ph: 0, vz: 0, vth: 0, vph: 0 }); this.suspF.fill(0); this.suspFS.fill(0); this.wz.fill(0); this.wv.fill(0); this.wr.fill(0); this.we.fill(0); } }

  shift(dir) {
    if (dir > 0 && this.gear < this.p.gears.length - 1 && this.gear >= 1) { const g = this.gbNext(this.gear, 1); if (g !== this.gear) { this.gear = g; this.gbShift(this.p.shift ?? 0.07); } }
    else if (dir > 0 && this.gear === -1) this.gear = 1;
    else if (dir < 0 && this.gear > 1) {
      const g = this.gbNext(this.gear, -1); if (g === this.gear) return;
      // (a money shift: the engine spun past its redline by the drop; the gearbox takes it)
      const over = (this.speed || 0) / this.p.gears[g] - 1.06;
      if (over > 0) { this.gbHurt(over * 1.5); this.overRev = (this.overRev || 0) + 1; }
      this.gear = g; this.gbShift((this.p.shift ?? 0.07) * 0.8);
    }
  }

  // ctl: steer (-1..1, +right), throttle, brake (0..1)
  // env: mu (surface multiplier), extraDrag, gF/gL (gravity accel in car frame); optional wheels: { mu, drag, z }
  // (Float64Array(4) each, FL FR RL RR: the surface grip and drag under each wheel, and the ground's height there
  // relative to the road, m: kerbs, grass, bumps). Without it every wheel gets mu / extraDrag on a flat road.
  step(dt, ctl, env) {
    const P = this.p;
    const sn = Math.sin(this.h), cs = Math.cos(this.h);
    let u = this.vx * sn + this.vz * cs;
    let v = this.vx * cs - this.vz * sn;
    const speed = Math.hypot(u, v);

    // body slip: angle between where the car points and where it's going (+ = sliding toward +v)
    const uA0 = Math.max(Math.abs(u), 4);
    const beta = speed > 4 ? Math.atan2(v, uA0) : 0;
    // how much we're in a slide (0 below ~5 degrees, 1 from ~14)
    const slideW = Math.min(1, Math.max(0, (Math.abs(beta) - 0.09) / 0.15));
    const drifty = !!P.drift;
    this.beta = beta; this.drifting = drifty && slideW > 0.3 && speed > 8;

    // steering with speed-sensitive lock. In a slide the speed limit on the lock is released (you need it to
    // counter-steer): the same stick position always gives the same wheel angle once you're sideways, whatever the angle.
    // A light counter-steer assist nudges the wheels toward where the car is going so a slide can be caught with the
    // stick; it steps aside completely once you're counter-steering yourself (the two added up used to snap the car
    // straight the moment you touched the stick)
    let maxLock = P.maxSteer / (1 + Math.abs(u) * LOCK_K);
    maxLock += (P.maxSteer * 1.25 - maxLock) * slideW;
    const zeroSlip = Math.atan2(v + P.a * this.r, uA0); // the steer angle at which the fronts roll straight
    const A = this.aid, aT = this.aidT;
    for (const k in aT) if (aT[k] > 0) aT[k] -= dt;
    const selfCatch = Math.sign(-ctl.steer) === Math.sign(zeroSlip) ? Math.min(1, Math.abs(ctl.steer) * 4) : 0;
    // counter-steer help: light (the tuned default: eases the fronts toward the slide) or strong (aims a little past
    // it, so the fronts pull the car straight: catches a snap that would otherwise spin)
    const csBase = !A.cs ? 0 : A.cs === 2 ? 1.2 : drifty ? 0.3 : A.stab ? 0.35 : 0.15;
    const csK = csBase * slideW * (1 - selfCatch);
    if (csK * Math.abs(zeroSlip) > 0.02) aT.cs = 0.25;
    // a pad at speed: full stick = just past the angle where this car corners hardest at this speed (padCal). The flat
    // speed lock above left the F1 at its peak by half stick at 250 km/h: the whole corner squeezed into a thumb's few
    // mm (twitchy, weaving on the straights) and the top half of the stick only scrubbing wide (understeer). Faded in
    // from 45 to 90 km/h (hairpins and turning round keep the full lock), and out in a slide, where counter-steer needs it
    if (ctl.pad && ctl.steer && slideW < 1 && !globalThis.__padOld) { // (__padOld: dev, the old mapping, for .devtest/physics/padweave.mjs)
      // (plus, mid-S with the car still turning the other way, however far the fronts are rolling that way: the
      // calibrated angle is a settled corner's, and capping a change of direction at it made fast esses go dead)
      const zs = -Math.sign(ctl.steer) * zeroSlip, win = padLock(padCal(P), Math.abs(u)) * 1.15 + Math.max(0, zs);
      const w = Math.min(1, Math.max(0, (Math.abs(u) - 12.5) / 12.5)) * (1 - slideW);
      if (win < maxLock) maxLock += (win - maxLock) * w;
    }
    let target = -ctl.steer * maxLock + csK * zeroSlip - (this.bentOn ? 0 : this.dmg.ch) * 0.006 * this.pull;
    // steering assist: never turn the fronts past their peak grip (past it they only scrub and push wide). Not in a
    // slide, where the wheels need to go wherever the counter-steer takes them.
    if (A.steer && speed > 8 && slideW < 0.5) {
      const pk = (P.slipPeak ?? 0.169) * 1.05, lo = zeroSlip - pk, hi = zeroSlip + pk;
      if (target < lo || target > hi) { target = Math.max(lo, Math.min(hi, target)); if (Math.abs(ctl.steer) > 0.1) aT.steer = 0.25; }
    }
    const rate = (Math.abs(target) < Math.abs(this.delta) ? 5.5 : 3.2) * P.maxSteer;
    const d = target - this.delta;
    // analog: straight to the stick (AI), or through a short smoothing for a pad (ctl.lag s, default 50 ms), so a flick
    // of the thumb doesn't slam the wheels across in one frame; up to 2.4x that from 110 to 250 km/h for small moves,
    // where a twitch of the thumb weaved the car down the straights. A big move (a fast S, a catch) goes through at the
    // normal 50 ms: the extra smoothing slowed a change of direction as much as a twitch. Keys: rate-limited.
    if (ctl.pad) {
      const small = 1 - Math.min(1, Math.abs(d) / Math.max(1e-4, 0.4 * maxLock)), slow = Math.min(1, Math.max(0, (speed - 30) / 40));
      this.delta += d * Math.min(1, dt / ((ctl.lag || 0.05) * (globalThis.__padOld ? 1 : 1 + 1.4 * slow * small)));
    }
    else if (ctl.analog) this.delta = target;
    else this.delta += Math.max(-rate * dt, Math.min(rate * dt, d));
    const delta = this.delta;
    this.steer = -delta / P.maxSteer;

    // loads
    const mu = P.mu * env.mu * this.gripMul;
    const dm = this.dmg, ty = this.tyre;
    const W = P.mass * G;
    this.aero(u, beta);
    const Df = this.Df, Dr = this.Dr;
    const N = W + Df + Dr;
    // ---- the body on its springs: what each tyre carries ----
    // The sprung body bounces, pitches and rolls on a spring + damper at each corner, with an anti-roll bar across each
    // axle (stiffnesses from the car's ride frequency, damping ratio and roll gradient: see the constructor). Braking,
    // accelerating and cornering push on the body at its centre-of-mass height; downforce presses on it too. Each tyre
    // carries its static share of the car plus whatever its corner's suspension is pushing (state from the last step:
    // see the end of step), so weight transfer, its timing and the front / rear split of it in corners all come out of
    // the suspension. Load sensitivity is per tyre (loadK): a tyre gives less grip per kilo the more it carries, so the
    // outside tyre gains less than the inside one loses (what costs a leaning car grip, and keeps a braking one straight).
    const LS = P.loadK ?? 0.15;
    // (dirtGrip: a car built for dirt, a sprint car's big soft dirt tyres and its suspension, grips that much more there)
    const tg = (this.wet != null ? tyreGripAt(ty.c, this.wet, this.onDirt) : tyreGrip(ty.c, this.rain, this.onDirt)) * (1 - 0.08 * (this.bentOn ? 0 : dm.ch)) * (this.onDirt ? P.dirtGrip ?? 1 : 1);
    const S = this.susp, tw = S.tw;
    const hb = ctl.handbrake || 0;
    const uA = Math.max(Math.abs(u), 4);
    const sgn = u >= 0 ? 1 : -1;
    const af = Math.atan2(v + P.a * this.r, uA) - delta * sgn; // (the axle-centre slip angles: wear, sounds, skids)
    const ar = Math.atan2(v - P.b * this.r, uA);
    const aFp = P.slipPeak ?? 0.169, aRp = P.slipPeakR ?? aFp;
    const tgF = tg * wearGrip(ty.wf), tgR = tg * wearGrip(ty.wr) * P.rearGrip;
    const WN = W4.n, WC = W4.cap, WA = W4.a, WSY = W4.sy, WU = W4.u, WY = W4.y, WX = W4.x, SF = this.suspF;
    const EW = env.wheels, muW = EW ? EW.mu : null;
    // alignment (a setup's: setup.js), against the car's standard: toe [front, rear] ° (+ in: each wheel turned toward
    // the middle, a small slip angle of its own), camber [front, rear] ° (- = the top leaning in): see camberGrip
    const toe = P.toe ? [(P.toe[0] - P.toe0[0]) * D2R, (P.toe[1] - P.toe0[1]) * D2R] : null, cam = P.camber ? this.camberGrip() : null;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, side = (i & 1) ? -1 : 1, y = side * tw / 2 - (P.cgY ?? 0); // (from the centre of mass)
      const n = Math.max(0, S.n4[i] + SF[i]);
      WN[i] = n; WY[i] = y; WX[i] = front ? P.a : -P.b;
      WC[i] = (muW ? P.mu * muW[i] * this.gripMul : mu) * n * (front ? tgF : tgR) * this.tempG[i] * (cam ? cam[i] : 1) * (1 - 0.15 * this.bent[i]) * Math.max(0.75, Math.min(1.25, 1 - LS * (Math.max(n, 1) / (S.n4[i] + (front ? Df : Dr) / 2) - 1)));
      const ui = u - this.r * y, uAi = Math.max(Math.abs(ui), 4);
      WU[i] = ui;
      WA[i] = (front ? Math.atan2(v + P.a * this.r, uAi) - delta * sgn : Math.atan2(v - P.b * this.r, uAi)) + (toe ? side * toe[front ? 0 : 1] * sgn : 0) + (this.bent[i] ? side * this.bentDir[i] * this.bent[i] * BENT_TOE * sgn : 0);
      WSY[i] = WA[i] / (front ? aFp : aRp);
    }
    this.loadT = Math.min(1, Math.max(Math.abs(WN[0] - WN[1]) / Math.max(1, WN[0] + WN[1]), Math.abs(WN[2] - WN[3]) / Math.max(1, WN[2] + WN[3])));
    const capF = WC[0] + WC[1], capR = WC[2] + WC[3];

    // throttle / brake / reverse
    let thr = ctl.throttle, brk = ctl.brake, drive = 0, braking = 0;
    // rolling radius per wheel (RW, FL FR RL RR): R the rears' mean (the gearing's), wheelRF the fronts' if they differ,
    // and the rears' stagger (m of circumference, the right rear bigger: a sprint car's): on a locked axle the bigger
    // tyre covers more road a turn than the smaller one, so the car wants to turn left
    const R = P.wheelR ?? 0.33, fd = P.drive || 0, RW = this.RW || (this.RW = new Float64Array(4)), stg = (P.stagger ?? 0) / (4 * Math.PI);
    RW[0] = RW[1] = P.wheelRF ?? R; RW[2] = R - stg; RW[3] = R + stg;
    if (!this.wInit) { for (let i = 0; i < 4; i++) this.ws[i] = u / RW[i]; this.ks.fill(0); this.absK.fill(1); this.tcK = 1; this.wInit = true; }
    const WS = this.ws, KS = this.ks, AB = this.absK;
    // (the engine turns with the driven wheels: wheelspin revs it)
    const wheelV = (1 - fd) * (WS[2] * RW[2] + WS[3] * RW[3]) / 2 + fd * (WS[0] * RW[0] + WS[1] * RW[1]) / 2;
    if (this.gear === -1) {
      if (thr > 0.1 && u > -0.8) { this.gear = 1; }
      else { drive = u > -11 ? -brk * 6000 : 0; braking = thr; }
    } else {
      if (brk > 0.1 && u < 0.8 && thr < 0.05) { this.revT += dt; if (this.revT > 0.3) this.gear = -1; }
      else this.revT = 0;
      if (this.gear >= 1) {
        const top = P.gears[this.gear];
        this.rpm = Math.max(P.idle, Math.min(P.redline + 200, (Math.max(0, wheelV) / top) * P.redline));
        let f = Math.min(P.maxForce, (P.power * this.powerMul * this.engK * (1 - 0.06 * dm.ch)) / Math.max(wheelV, 1));
        const x = (this.rpm - P.idle) / (P.redline - P.idle);
        f *= P.torque ? torqueAt(P.torque, x) : 0.85 + 0.15 * Math.sin(Math.min(1, Math.max(0, x)) * Math.PI);
        if (!this.auto) {
          // (a manual launch: in first the clutch slips, holding the engine up to where it pulls with the throttle until
          // the wheels catch up; without it a standing start sat at idle, bogged to 35%)
          const bogR = 0.56 * P.redline;
          if (this.gear === this.gbNext(0, 1)) this.rpm = Math.max(this.rpm, P.idle + thr * (bogR - P.idle));
          f *= Math.min(1, Math.max(0.35, this.rpm / bogR)); // (manual, bogged down low in the revs: was a fixed 7000 rpm, the F1's 56%, so a road car on manual never got its full pull)
        }
        if (this.rpm >= P.redline) f *= 0.1;
        if (this.shiftT > 0) f *= 0.25;
        if (this.missT > 0) f = 0; // (a missed shift: nothing driving for a moment)
        drive = thr * f;
        // engine braking: off the throttle the engine drags the driven wheels (more at high revs), so lifting slows a
        // spinning rear back to road speed and it grips again
        if (this.shiftT <= 0) drive -= (1 - thr) * (P.engineBrake ?? 0.12) * P.maxForce * Math.min(1, Math.max(0.2, x));
      }
      braking = brk;
    }
    if (this.gear === -1) this.rpm = Math.max(P.idle, Math.min(9000, P.idle + Math.abs(u) * 500));
    if (this.shiftT > 0) this.shiftT -= dt;
    if (this.missT > 0) this.missT -= dt;

    // automatic box, on the car's road speed (not the wheels': a wheelspinning launch doesn't shift up; not the speed
    // along the nose: a car going sideways in a drift isn't slow, and mustn't drop into first)
    const kpk = P.kappaPeak ?? 0.1;
    if (this.auto && this.gear >= 1) {
      const rpmRoad = (speed / P.gears[this.gear]) * P.redline;
      // (also on the engine's own revs when the wheels are only slipping the usual few percent, or it would sit on the
      // limiter until the road speed caught up)
      const kd = (1 - fd) * this.kR + fd * this.kF, near = rpmRoad > P.redline - 400 || (this.rpm > P.redline - 400 && kd < 0.15);
      if (near && this.gear < P.gears.length - 1 && thr > 0.2) { const g = this.gbNext(this.gear, 1); if (g !== this.gear) { this.gear = g; this.gbShift(P.shift ?? 0.07); } }
      else if (this.gear > 1 && speed < P.gears[this.gbNext(this.gear, -1)] * 0.7) { this.gear = this.gbNext(this.gear, -1); }
    }

    // ---- the wheels: spin, slip ratio, and the tyre forces they make ----
    // Each wheel spins against the road's grip; the engine's torque and inertia reach the driven pair through the
    // differential. Slip ratio κ = (wheel speed − road speed) / road speed, carried as a state that builds over the
    // tyre's relaxation length σ, so it still behaves at walking pace (the low-speed tyre model in Pacejka, "Tire and
    // Vehicle Dynamics"). The force comes from both slips together (the similarity method, same book): longitudinal
    // slip over its peak and slip angle over its peak make one slip vector; its length picks the force off the tyre
    // curve, its direction shares it out. So a spinning or locked tyre has little side grip left, and braking hard
    // while turning trades steering for stopping, the way a real tyre does.
    // Each axle's pair moves in two ways (the standard way to split it): together (the mean speed: carries the engine's
    // inertia through the gearbox on a driven axle) and against each other (the difference: just the wheels, held back by
    // the differential on a driven axle; a free axle's wheels are independent). With both wheels alike it's exactly
    // stage 1's axle model.
    // The differential on a driven axle is a clutch-type limited-slip diff (the Salisbury type most performance and race
    // cars use): its clutches lock the two wheels together up to a friction torque made of a preload plus a share of the
    // torque going through it, a bigger share on power (`lsd[1]`) than off it (`lsd[2]`, coast: engine braking). Once
    // one wheel's road torque differs from the other's by more than that, the wheels slip against each other. An open
    // diff is lsd [0, 0, 0]: the inside wheel of a corner, unloaded, spins up on power. A locked one: the pair is a solid
    // axle that pushes on power and holds a slide. What it does to the car is how the rear behaves on and off the power
    // in a corner (and in a drift).
    // ABS (one channel per wheel) and traction control are real controllers on top.
    const kp = kpk, sigma = P.relaxX ?? 0.12;
    const wI = P.wheelI ?? 2.2; // kg m² per axle (two wheels, hubs, brakes)
    // the engine's inertia through the gearbox (nothing while the clutch is out for a shift)
    const gear = this.gear === -1 ? 1 : Math.max(1, this.gear);
    const Gr = (P.redline * Math.PI / 30) / (P.gears[gear] / R);
    const refl = this.shiftT > 0 ? 0 : (P.engineI ?? 0.15) * Gr * Gr;
    // (a handbrake turn is done with the clutch in: while it's up, and until the freed rears have spun back up to road
    // speed, they're free of the engine: light, so they pick up grip again straight away, and not driven)
    const clutchIn = hb > 0.2 || (this.hbT > 0 && this.kR * (u >= 0 ? 1 : -1) < -0.1);
    const IF = wI + refl * fd, IR = wI + refl * (1 - fd) * (clutchIn ? 0 : 1);
    // brakes: a fixed torque from the pedal (hard enough to lock the wheels at low speed), shared by the brake balance
    const bF = P.brakeF ?? 0.66;
    const G0 = P.gearsRef ?? P.gears, brakeT = (P.brakeK ?? 1.5) * P.mu * (W + (P.kdRef ?? P.kd) * Math.pow(0.7 * G0[G0.length - 1], 2)) * R * this.brakeMul * (P.brakeP ?? 1);
    const sgnU = u >= 0 ? 1 : -1;
    const lowStop = braking > 0 && Math.abs(u) < 1.2; // (walking pace: the old direct stop, the tyre model can't hold a car still)
    // Drift cars, once you're clearly drifting (the handbrake in the last second and a half, or past ~20° sideways):
    // traction control switches to a drift mode like a modern performance car's (BMW's M Dynamic Mode, Ford's Drift
    // Mode): it lets the rears spin up enough to hold an angle on the throttle, but not so far they give up all their
    // side grip and the car spins. A snap of oversteer on its own is still caught the normal way.
    this.hbT = hb > 0.2 ? 1.5 : Math.max(0, (this.hbT || 0) - dt);
    // (never for the AI: it doesn't drift on purpose, so its traction control always catches a slide)
    const drifting = drifty && !this.isAI && (this.hbT > 0 || Math.abs(beta) > 0.35);
    const tcOn = A.tc > 0 && drive > 0;
    const tcTarget = drifting ? (A.tc >= 1 ? P.driftSlip ?? 0.35 : (P.driftSlip ?? 0.35) * 1.6) : kp * (A.tc >= 1 ? 1.1 : 1.45);
    const syF = (WSY[0] + WSY[1]) / 2, syR = (WSY[2] + WSY[3]) / 2;
    // (a locked or spinning tyre keeps ~75% of its peak along the road, P.slipFallX; sideways the car's own curve)
    const CX = P.slipFallX ?? 1.5, BX = Math.tan(Math.PI / (2 * CX));
    const au = Math.abs(u), hasABS = A.abs && au > 3;
    // (4 sub-steps: the slip ratio's decay is implicit, so this only has to keep the wheel's spin-up stable)
    const nSub = 4, h = dt / nSub;
    // what doesn't change between the sub-steps
    // ABS targets per wheel: slip held just under the tyre's peak (a little lower while it's turning, so the fronts keep
    // steering). Electronic brake-force distribution holds the rears well under their peak, lower still while cornering,
    // so the back of the car keeps its side grip; cornering brake control does the same on the fronts.
    const ABT = W4.abt;
    for (let i = 0; i < 4; i++) ABT[i] = i < 2 ? -kp * (0.95 - 0.35 * Math.min(1, Math.abs(WSY[i]))) : -kp * Math.max(0.15, 0.9 - 0.8 * Math.min(1, Math.abs(WSY[i])));
    // a car built to be driven sideways (slideOK rad: a sprint car on dirt runs ~10-20° of slide all the way round): the
    // stability aids take that much rear slip as driving, not a slide to catch (as slip over the rears' peak)
    const okR = (P.slideOK ?? 0) / aRp;
    // TC target on the driven wheels (lower while cornering, so the rear keeps its side grip; the drift mode excepted)
    const sdT = Math.min(1, Math.max(0, Math.abs(fd >= 1 ? syF : syR) - okR));
    const tcT = drifting ? tcTarget : tcTarget * (1 - (A.tc >= 1 ? 0.6 : 0.3) * sdT);
    // limits as torque the tyres can take: ABS on each wheel's brake, TC on each axle's drive (both ride just over the
    // peak when nothing's slipping, and come down as the wheels slip past the target), plus the torque it takes to speed
    // the wheels and the engine up or slow them down with the car
    const accW = Math.abs(this.axPrev) / R;
    const LIM = W4.lim;
    for (let i = 0; i < 4; i++) LIM[i] = WC[i] * RW[i] * 1.15 + (i < 2 ? IF : IR) / 2 * accW;
    const limF = LIM[0] + LIM[1], limR = LIM[2] + LIM[3];
    // brakes: the proportioning valve every road car's brake lines have (past its knee the rears get a third of any more
    // pedal, so a hard stamp locks the fronts first, never the rears; with ABS off too)
    const rMax = brakeT * (1 - bF), knee = rMax * (P.brakeKnee ?? 0.65), rIn = braking * rMax;
    const pedF = lowStop ? 0 : braking * brakeT * bF / 2, pedR = lowStop ? 0 : (rIn > knee ? knee + (rIn - knee) * 0.33 : rIn) / 2; // (per wheel)
    const hbT = hb * brakeT * (P.handbrakeK ?? 0.27) / 2; // (per rear wheel: the handbrake skips the ABS, and isn't as strong as the footbrake)
    // (a sprint car has no right-front brake, brakeRF 0: the left front's drag helps turn it into a left-hander)
    const brakeRF = P.brakeRF ?? 1;
    // stability control's engine cut (what real ESC does besides braking wheels): past the rears' sideways grip peak
    // on the throttle, it eases the power until they hook up again. Off with SC off, and in the drift mode.
    const escOn = A.stab && !drifting && drive > 0 && fd < 1, escE = Math.abs(syR) - 0.9 - okR;
    this.escK = escOn && escE > 0 ? Math.max(0.2, (this.escK ?? 1) - dt * 10 * escE) : Math.min(1, (this.escK ?? 1) + dt * 3);
    if (this.escK < 0.9 && thr > 0.3) aT.stab = 0.25;
    // ...and its brake (what real ESC mostly is): when the rear is past its grip and the car is rotating faster than the
    // steering asks for (the yaw rate the front wheels' angle gives, capped by what the tyres can hold), it brakes the
    // outside front wheel, whose drag swings the nose back out. Any pedal: lifting off can start a slide too.
    const au0 = Math.abs(u);
    const rRef = Math.max(-1, Math.min(1, u * delta / P.L / Math.max(1e-3, 0.85 * mu * G / Math.max(au0, 1)))) * 0.85 * mu * G / Math.max(au0, 1);
    const yawE = Math.sign(this.r) === Math.sign(rRef) || Math.abs(rRef) < 0.02 ? Math.abs(this.r) - Math.abs(rRef) : Math.abs(this.r);
    const escBt = A.stab && !drifting && au0 > 5 && escE > 0 && yawE > 0.03 ? Math.min(1, escE * 3) * Math.min(1, (yawE - 0.03) / 0.12) : 0;
    this.escB = (this.escB ?? 0) + (escBt - (this.escB ?? 0)) * Math.min(1, dt * 25);
    const escW = this.r > 0 ? 1 : 0; // (the outside front: the right one when rotating to the left)
    if (this.escB > 0.1) aT.stab = 0.25;
    const escK = drive > 0 ? this.escK : 1;
    const drF = drive * R * fd * escK, drR = clutchIn ? 0 : drive * R * (1 - fd) * escK; // (per axle, split evenly by the diff)
    const CF = this.nCF, BF = this.nBF, CR = this.nCR, BRr = this.nBR;
    // the diff on each driven axle: [preload N·m, power lock, coast lock] (lock = the share of the torque through the diff
    // that its clutches can pass between the wheels). A non-driven axle's wheels turn freely.
    const lsdR = P.lsd ?? [60, 0.3, 0.15], lsdF = P.lsdF ?? [0, 0, 0];
    const spool = lsdR[1] >= 1 && lsdR[2] >= 1;
    const FXs = W4.fx, FYs = W4.fy, TB = W4.tb;
    FXs.fill(0); FYs.fill(0);
    let absAct = false, tcAct = false, tcK = this.tcK;
    for (let k = 0; k < nSub; k++) {
      // ABS: each wheel's pressure eases off in proportion to how far past the target it is, and builds back. The fronts
      // are controlled one by one; the rears "select-low", like real ABS: both get the pressure that suits the one with
      // less grip, so braking the back of the car never twists it
      for (let i = 0; i < 4; i++) {
        if (hasABS && braking > 0.05) { const e = (ABT[i] - KS[i] * sgnU) / kp; AB[i] = e > 0 ? Math.max(0.2, AB[i] - h * 40 * e) : Math.min(1, AB[i] + h * 2); }
        else AB[i] = 1;
      }
      if (hasABS) AB[2] = AB[3] = Math.min(AB[2], AB[3]);
      for (let i = 0; i < 4; i++) {
        let tb = i < 2 ? pedF * (i === 1 ? brakeRF : 1) : pedR;
        if (hasABS && tb > AB[i] * LIM[i]) { tb = AB[i] * LIM[i]; if (AB[i] < 0.98) absAct = true; }
        TB[i] = tb + (i >= 2 ? hbT : 0);
      }
      if (this.escB > 0.01) TB[escW] = Math.max(TB[escW], this.escB * 0.8 * WC[escW] * R);
      // TC: engine torque eases off in proportion to the worst driven wheel's spin past the target, and comes back as
      // it hooks up
      // (a locked rear axle, a spool, spins up as one: its mean slip, or a staggered pair's permanent difference reads as
      // wheelspin and the power never comes back)
      const kdw = fd >= 1 ? Math.max(KS[0] * sgnU, KS[1] * sgnU) : fd > 0 ? Math.max(KS[0] * sgnU, KS[1] * sgnU, KS[2] * sgnU, KS[3] * sgnU) : spool ? (KS[2] + KS[3]) / 2 * sgnU : Math.max(KS[2] * sgnU, KS[3] * sgnU);
      const e = (kdw - tcT) / kp;
      // (the power comes back as the slip falls under the target, slower the closer it is, so it settles at the torque
      // the tyres can take instead of cutting and restoring it several times a second: that pulsing, through a
      // limited-slip diff whose lock follows the torque, kicked the rear from side to side)
      tcK = tcOn && e > 0 ? Math.max(0.05, tcK - h * 30 * e) : Math.min(1, tcK + h * (tcOn ? 6 * Math.min(1, -e * 2) : 50));
      // (and eases off as the slip climbs toward the target, before it's past it: with only the above, a light car on a
      // short gear (the Capri, the F1 in 1st and 2nd) spun up past the peak before the cut caught it, cut too far, got
      // its power back and spun up again, 3-4 times a second: the tires screeching on and off)
      const de = e - (this.tcE ?? e); this.tcE = e;
      if (tcOn && de > 0 && e > -0.3) tcK = Math.max(0.05, tcK - 2 * de);
      let TdF = drF, TdR = drR;
      if (tcOn) { const lF = tcK * limF, lR = tcK * limR; if (TdF > lF) { TdF = lF; tcAct = true; } if (TdR > lR) { TdR = lR; tcAct = true; } }
      // tyre forces from each wheel's slip
      for (let i = 0; i < 4; i++) {
        tyreForce(WC[i], i < 2 ? CF : CR, i < 2 ? BF : BRr, CX, BX, KS[i] / kp, WSY[i]);
        W4.sfx[i] = TF[0]; FXs[i] += TF[0]; FYs[i] += TF[1];
      }
      // each axle's pair: together (drive − road torque on the pair's inertia, engine included) and against each other
      // (left − right road torque on the wheels alone, the diff's viscous coupling holding them together); then the brakes
      // (a brake can stop a wheel, never turn it backwards)
      for (let ax = 0; ax < 2; ax++) {
        const L = ax * 2, Rw = L + 1, Iax = ax ? IR : IF, Td = ax ? TdR : TdF, Dl = ax ? (fd < 1 ? lsdR : null) : (fd > 0 ? lsdF : null);
        // the most the diff's clutches can pass from one wheel to the other (the difference in torque they allow, each way)
        const Tlock = Dl ? Dl[0] + (Td >= 0 ? Dl[1] : Dl[2]) * Math.abs(Td) : 0;
        // (the brakes act against each wheel's spin in the same sums, so a driven pair's engine inertia slows with them)
        const wL0 = WS[L], wR0 = WS[Rw];
        const TL = Td / 2 - W4.sfx[L] * RW[L] - Math.sign(wL0) * TB[L], TR = Td / 2 - W4.sfx[Rw] * RW[Rw] - Math.sign(wR0) * TB[Rw];
        let m = (wL0 + wR0) / 2, d = (wL0 - wR0) / 2;
        m += h * (TL + TR) / Iax;
        // the difference: free, then the clutches' friction (−Tc on the left wheel, +Tc on the right) takes out as much of
        // it as they can hold (implicit, so locked wheels stay locked at any step size)
        d += h * (TL - TR) / wI;
        const Tc = Math.max(-Tlock / 2, Math.min(Tlock / 2, d * wI / (2 * h)));
        d -= 2 * h * Tc / wI;
        // a brake can stop a wheel, never turn it backwards (it holds a stopped wheel until the road torque beats it)
        let wl = m + d, wr = m - d;
        if (TB[L] > 0 && (wl * wL0 < 0 || (wL0 === 0 && Math.abs(W4.sfx[L] * RW[L]) <= TB[L]))) wl = 0;
        if (TB[Rw] > 0 && (wr * wR0 < 0 || (wR0 === 0 && Math.abs(W4.sfx[Rw] * RW[Rw]) <= TB[Rw]))) wr = 0;
        WS[L] = wl; WS[Rw] = wr;
      }
      // slip ratios, relaxed over σ (implicit in the decay, so it's stable at any speed)
      for (let i = 0; i < 4; i++) {
        const q = h * Math.abs(WU[i]) / sigma;
        KS[i] = Math.max(-1.5, Math.min(3, (KS[i] + h * (WS[i] * RW[i] - WU[i]) / sigma) / (1 + q)));
      }
    }
    this.tcK = tcK;
    // the axle means (what the gearbox, the HUD and older readers use)
    this.wF = (WS[0] + WS[1]) / 2; this.wR = (WS[2] + WS[3]) / 2; this.kF = (KS[0] + KS[1]) / 2; this.kR = (KS[2] + KS[3]) / 2;
    for (let i = 0; i < 4; i++) { FXs[i] /= nSub; FYs[i] /= nSub; this.latW[i] = Math.abs(FYs[i]) / (Math.abs(FXs[i]) + Math.abs(FYs[i]) + 1); }
    // how close each end is to its grip limit (the most-worked tyre): combined slip over its peak (1 = right at it), and
    // the share of its grip in use (the pad reads both)
    this.gripF = Math.max(Math.hypot(KS[0] / kp, WSY[0]), Math.hypot(KS[1] / kp, WSY[1]));
    this.gripR = Math.max(Math.hypot(KS[2] / kp, WSY[2]), Math.hypot(KS[3] / kp, WSY[3]));
    const use = (i) => Math.hypot(FXs[i], FYs[i]) / Math.max(1, WC[i]);
    this.useF = Math.max(use(0), use(1)); this.useR = Math.max(use(2), use(3));
    this.wheelLoad = WN; // (per wheel, N: for the HUD / debugging)
    if (absAct) aT.abs = 0.2;
    if (tcAct && thr > 0.3) aT.tc = 0.25;
    if (!tcOn) this.tcK = 1;
    // walking pace under braking: stop the car directly, wheels turning with it
    if (lowStop) {
      const bfl = braking * brakeT / R, stop = Math.max(-bfl, Math.min(bfl, -u * P.mass / dt * 0.5));
      FXs[0] = FXs[1] = stop * 0.325; FXs[2] = FXs[3] = stop * 0.175;
      for (let i = 0; i < 4; i++) { WS[i] = WU[i] / RW[i]; KS[i] = 0; }
    }
    // what the HUD, sounds, skid marks and telemetry read: wheelspin and locked wheels, from the slip itself
    const lockW = (i) => Math.abs(u) > 3 && KS[i] * sgnU < -0.5;
    const lockF = braking > 0 && (lockW(0) || lockW(1)), lockR = (braking > 0 || hb > 0) && (lockW(2) || lockW(3));
    this.lockF = lockF; this.lockR = lockR;
    this.spin = Math.max(0, Math.max(KS[2] * sgnU, KS[3] * sgnU) / kp - 1.3) * 0.2;
    this.slipRatioF = this.kF; this.slipRatioR = this.kR;

    // low-speed fade of lateral tyre forces
    const lowK = Math.min(1, speed / 3);
    for (let i = 0; i < 4; i++) FYs[i] *= lowK;

    // the forces on the body: the fronts turned by the steering; the yaw moment from where each tyre sits
    const cd = Math.cos(delta), sd = Math.sin(delta);
    let FXB = 0, FYB = 0, Tz = 0;
    for (let i = 0; i < 4; i++) {
      const fx = i < 2 ? FXs[i] * cd - FYs[i] * sd : FXs[i], fy = i < 2 ? FYs[i] * cd + FXs[i] * sd : FYs[i];
      FXB += fx; FYB += fy; Tz += WX[i] * fy - WY[i] * fx;
    }
    const Fxf = FXs[0] + FXs[1], Fyf = FYs[0] + FYs[1], Fxr = FXs[2] + FXs[3], Fyr = FYs[2] + FYs[3]; // (axle totals: wear)
    // force feedback: what the steering rack pushes back with. The front tyres' side force acting through their trail
    // (the trail shrinks as the slip nears the tyre's peak, so the wheel goes light as the front starts to wash out),
    // plus a share through the caster that stays. Per unit of the fronts' load: about -1..1 hard in a corner.
    const syFa = Math.min(1.3, (Math.abs(WSY[0]) + Math.abs(WSY[1])) / 2);
    this.ffb = Math.max(-1.5, Math.min(1.5, Fyf / Math.max(1, WN[0] + WN[1]) * (0.3 + 0.7 * Math.max(0, 1 - 0.85 * syFa))));
    const dragK = P.drag * (1 - 0.12 * dm.rw) * this.dragMul * (1 - (this.towCut ?? 0.3) * this.slip); // (towCut: the race's slipstream strength)
    let Fx = FXB - dragK * u * Math.abs(u) - P.roll * u;
    // grass / gravel drag: on each wheel when the track says what's under each (a pair of wheels in the gravel drags
    // that side back, and turns the car toward it), else on the car as a whole
    if (EW) for (let i = 0; i < 4; i++) { const f = EW.drag[i] / 4 * u; Fx -= f; Tz += WY[i] * f; }
    // (two wheels or more in the gravel or sand at speed: the floor takes it; grass is kind to it)
    if (EW && this.engOn && speed > 15) { let off = 0; for (let i = 0; i < 4; i++) if (EW.drag[i] > 150) off++; if (off >= 2) this.dmg.fl = Math.min(1, (this.dmg.fl || 0) + FLOOR.grind * off * speed / 30 * dt); }
    else Fx -= env.extraDrag * u;

    if (this.tempMode) this.tyreHeat(dt, FXs, FYs, WA, WS, WU, WN, RW, speed);
    if (this.engOn) this.engineHeat(dt, this.throttle || 0, speed);
    // tyre wear: more when the tyre is worked hard, much more when it's sliding (and, past its best, when it's hot)
    if (this.wearK > 0 && speed > 1) {
      const def = TYRES[ty.c];
      // (on dirt: how abrasive the dirt is right there (onDirtWear: tacky and loose easy on tyres, a dry-slick groove
      // eats them), and sliding is how you get round, so it costs half what it does on tarmac; spinning up and locking
      // the wheels still cost the full amount)
      const rate = def.rate * this.wearK * wearMul(ty.c, this.wet != null ? this.wet > 0.3 : this.rain, this.onDirt) * (this.onDirt ? this.dirtWear ?? 1 : 1) * speed * dt;
      const uF = Math.min(1.3, Math.hypot(Fyf, Fxf) / Math.max(1, capF)), uR = Math.min(1.3, Math.hypot(Fyr, Fxr) / Math.max(1, capR));
      const slideK = this.onDirt ? 1.5 : 3;
      const sF = lockF ? 3 : Math.abs(af) > 0.18 ? slideK : 1, sR = this.spin > 0 || lockR ? 3 : Math.abs(ar) > 0.18 ? slideK : 1;
      const hot = (a, b) => this.tempMode ? 1 + Math.max(0, Math.max(this.tS[a], this.tS[b]) - this.tyreOpt - 12) / 20 : 1;
      ty.wf = Math.max(0, ty.wf - rate * (0.25 + 1.5 * uF * uF) * sF * hot(0, 1));
      ty.wr = Math.max(0, ty.wr - rate * (0.25 + 1.5 * uR * uR) * sR * hot(2, 3));
    }
    // the air against the car's side as it slides (sideK; a sprint car's wing boards and side panels make a big one):
    // it acts behind the centre of mass (sideX m, + ahead), so it also swings the tail back in line
    const sideF = -(P.sideK ?? 0.6) * v * Math.abs(v);
    let Fy = FYB + sideF; Tz += (P.sideX ?? 0) * sideF;
    Fx += P.mass * env.gF; Fy += P.mass * env.gL;

    const axL = Fx / P.mass, ayL = Fy / P.mass;
    this.bodyStep(dt, axL, ayL, Df, Dr, EW ? EW.z : null, speed);
    this.axPrev += (axL - this.axPrev) * Math.min(1, dt * 12);
    this.ayPrev += (ayL - this.ayPrev) * Math.min(1, dt * 12);
    this.vx += (axL * sn + ayL * cs) * dt;
    this.vz += (axL * cs - ayL * sn) * dt;
    this.r += (Tz / P.inertia) * dt;
    // (a little artificial yaw damping; the tyres do most of it)
    this.r *= 1 - dt * 0.25;
    // stability assist: cap yaw rate to what the tyres can sustain
    // (drift cars: a looser cap, or the car could never rotate into a slide; the slide limiter below takes over)
    const driftingNow = drifty && (hb > 0 || (slideW > 0.3 && thr > 0.3));
    // (with stability control off a much looser cap stays: it's what stops a spin turning into a helicopter)
    // (just after a hit, contact.js knock: both stand back, then fade in again, so the spin the hit gave plays out)
    const held = this.hitT > 0 ? Math.max(0, 1 - this.hitT / 0.5) : 1;
    if (this.hitT > 0) this.hitT -= dt;
    if (A.stab && speed > 8 && !driftingNow) {
      const rMax = (mu * N / P.mass) / Math.max(6, Math.abs(u)) * 1.08;
      const ar2 = Math.abs(this.r);
      if (ar2 > rMax) { this.r -= Math.sign(this.r) * (ar2 - rMax) * Math.min(1, dt * 10) * held; if (ar2 - rMax > 0.03 && held > 0.5) aT.stab = 0.25; }
    } else if (speed > 8) {
      const rMax = (mu * N / P.mass) / Math.max(6, Math.abs(u)) * 1.6;
      const ar2 = Math.abs(this.r);
      if (ar2 > rMax) this.r -= Math.sign(this.r) * (ar2 - rMax) * Math.min(1, dt * 3) * held;
    }
    // slide limiter: past the car's maximum drift angle, turn the nose back toward the direction of travel (it's what
    // keeps a drift from becoming a spin). Drift cars allow big angles; with assists on the F1 car catches small ones.
    // (driftMax 0 = no limit: the car can go as sideways as you let it, and spin)
    const bMax = drifty ? (P.driftMax ? P.driftMax + (A.stab ? 0 : 0.3) : 0) : A.stab ? 0.3 : 0;
    if (bMax && speed > 6 && held > 0) {
      const ex = Math.abs(beta) - bMax;
      if (ex > 0) {
        if (A.stab) aT.stab = 0.25;
        this.r += Math.sign(beta) * Math.min(0.4, ex) * 28 * dt * held;
        if (Math.sign(this.r) === -Math.sign(beta)) this.r *= 1 - Math.min(1, dt * 6 * Math.min(1, ex * 6)) * held; // stop it rotating further
      }
    }

    // kinematic blend at walking pace
    const blend = Math.max(0, 1 - speed / 5);
    if (blend > 0) {
      u = this.vx * sn + this.vz * cs; v = this.vx * cs - this.vz * sn;
      const rk = u * Math.tan(delta) / P.L;
      this.r += (rk - this.r) * Math.min(1, blend * dt * 25);
      v *= 1 - Math.min(1, blend * dt * 10);
      if (speed < 0.4 && thr < 0.05 && braking < 0.05 && Math.abs(drive) < 1) u *= 1 - Math.min(1, dt * 4);
      this.vx = u * sn + v * cs; this.vz = u * cs - v * sn;
    }

    this.h += this.r * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.u = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
    this.v = this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h);
    this.speed = Math.hypot(this.vx, this.vz);
    this.slipF = Math.abs(af) * lowK; this.slipR = Math.abs(ar) * lowK;
    // (a locked wheel skids: marks, smoke and squeal like any slide)
    if (lockF) this.slipF = Math.max(this.slipF, 0.25);
    if (lockR) this.slipR = Math.max(this.slipR, 0.25);
    this.braking = braking; this.throttle = thr;
    this.latG = ayL / G; this.lonG = axL / G;
  }
}
