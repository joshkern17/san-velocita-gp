// Car physics: the vehicle model every car drives on (player, AI, the ghost's reference lap, the AI's learning).
// Kept free of THREE / the DOM so it runs in plain node: the tests in .devtest/physics/ import it directly.
// The plan this is being built to (and where it's up to) is in docs/PHYSICS.md.
import { AI_AIDS } from './aids.js';

// ---------------- physics ----------------

// bump whenever the physics changes how a car drives: learned AI speed plans saved by an older version are relearned
export const PHYS_VERSION = 3;

export const CARSPEC = {
  mass: 740, inertia: 1100, a: 1.85, b: 1.75, L: 3.6, cgh: 0.22,
  mu: 1.75, kd: 2.2, rearGrip: 1.08, drag: 0.9, roll: 14,
  power: 720000, maxForce: 14000, maxSteer: 0.36,
  gears: [0, 24, 34, 43, 52, 61, 70, 80, 94],
  redline: 12500, idle: 4000, box: 'seamless', shift: 0.03,
  // handling (see cars.js): slicks peak early (~5°) and the fronts fall away past it; the rears stay a touch flatter
  slipFall: 1.4, slipPeak: 0.085, slipFallR: 1.3, slipPeakR: 0.09, brakeF: 0.64,
  engineI: 0.05, // (a Formula car's small, light engine: little inertia to spin up through the gearbox)
};

const G = 9.81;

// tyre compounds: grip multiplier and wear per metre (at typical race usage a Medium lasts ~25 km)
export const TYRES = {
  soft:   { label: 'Soft',   short: 'S', grip: 1.035, rate: 5.0e-5, color: 0xe0302a, css: '#e0302a' },
  medium: { label: 'Medium', short: 'M', grip: 1.0,   rate: 2.8e-5, color: 0xf2d22a, css: '#f2d22a' },
  hard:   { label: 'Hard',   short: 'H', grip: 0.972, rate: 1.75e-5, color: 0xf0f0f0, css: '#f0f0f0' },
  wet:    { label: 'Wet',    short: 'W', grip: 0.9,   rate: 2.8e-5, color: 0x2a7ae0, css: '#3a8af0' },
};
// grip left in a tyre: gentle fade, then a cliff below 30%
export const wearGrip = (w) => w > 0.3 ? 1 - 0.08 * (1 - w) / 0.7 : 0.92 - 0.7 * (0.3 - w);
export function tyreGrip(c, rain) {
  if (c === 'wet') return rain ? 0.97 : 0.9;
  return TYRES[c].grip * (rain ? 0.82 : 1);
}
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
// Their length picks the force off the tyre curve (the car's own sideways shape C/B blended toward the along-the-road
// shape CX/BX by direction), their direction shares it out. Writes TF[0] (along the wheel), TF[1] (across).
const TF = [0, 0];
// per-wheel scratch for CarPhysics.step (steps never run inside each other, so one set serves every car)
const W4 = {}; for (const k of ['n', 'cap', 'a', 'sy', 'u', 'y', 'x', 'abt', 'lim', 'fx', 'fy', 'tb', 'sfx']) W4[k] = new Float64Array(4);
function tyreForce(cap, C, B, CX, BX, sx, sy) {
  const s = Math.hypot(sx, sy);
  if (s < 1e-6) { TF[0] = TF[1] = 0; return; }
  const wx = sx * sx / (s * s), f = Math.sin(C * Math.atan(B * s)) * (1 - wx) + Math.sin(CX * Math.atan(BX * s)) * wx;
  const F = cap * f / s; TF[0] = F * sx; TF[1] = -F * sy;
}

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
    this.axPrev = 0; this.ayPrev = 0; this.axLT = 0; this.loadT = 0;
    this.u = 0; this.v = 0; this.speed = 0;
    this.slipF = 0; this.slipR = 0; this.spin = 0; this.braking = 0; this.throttle = 0;
    this.auto = true;
    // driver aids (see aids.js physAids). aidBase = the driver's choice; `tc = false` switches traction + stability
    // off for a moment (an AI spin), `tc = true` puts the driver's choice back
    this.setAids(AI_AIDS);
    this.aidT = { abs: 0, tc: 0, stab: 0, cs: 0, steer: 0, brake: 0 }; // > 0 while an aid is stepping in (for the HUD)
    this.lockF = false; this.lockR = false; // wheels locked under braking (ABS off)
    this.powerMul = 1; this.gripMul = 1;
    this.aiCarve = 0; // AI drivers of drift cars: share of the drift carve they get while gripping (see step)
    this.tyre = { c: 'medium', wf: 1, wr: 1 };
    this.dmg = { fw: 0, rw: 0, ch: 0 };
    this.pull = Math.random() < 0.5 ? -1 : 1;
    this.wearK = 1; this.rain = false;
    this.dfMul = 1; this.dragMul = 1; this.brakeMul = 1;
    this.slip = 0; // 0..1 slipstream from a car ahead (set by the race each frame)
  }

  setAids(a) { this.aidBase = { ...a }; this.aid = { ...a }; }
  get tc() { return this.aid.stab; }
  set tc(v) { this.aid = v ? { ...this.aidBase } : { ...this.aidBase, tc: 0, stab: false }; }

  // 0..1 damage on 'fw' front wing, 'rw' rear wing, 'ch' chassis/suspension
  addDamage(part, amt) { this.dmg[part] = Math.min(1, this.dmg[part] + amt); }
  fitTyres(c) { this.tyre = { c, wf: 1, wr: 1 }; }
  gripNow() {
    const t = this.tyre, g = tyreGrip(t.c, this.rain) * (1 - 0.08 * this.dmg.ch);
    return g * (wearGrip(t.wf) + wearGrip(t.wr)) / 2;
  }

  // (the wheels pick up the car's speed on the next step: callers set a velocity straight after placing)
  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.vx = this.vz = this.r = 0; this.gear = 1; this.steer = 0; this.wInit = false; }

  shift(dir) {
    if (dir > 0 && this.gear < this.p.gears.length - 1 && this.gear >= 1) { this.gear++; this.shiftT = this.p.shift ?? 0.07; }
    else if (dir > 0 && this.gear === -1) this.gear = 1;
    else if (dir < 0 && this.gear > 1) { this.gear--; this.shiftT = (this.p.shift ?? 0.07) * 0.8; }
  }

  // ctl: steer (-1..1, +right), throttle, brake (0..1)
  // env: mu (surface multiplier), extraDrag, gF/gL (gravity accel in car frame)
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
    let target = -ctl.steer * maxLock + csK * zeroSlip - this.dmg.ch * 0.006 * this.pull;
    // steering assist: never turn the fronts past their peak grip (past it they only scrub and push wide). Not in a
    // slide, where the wheels need to go wherever the counter-steer takes them.
    if (A.steer && speed > 8 && slideW < 0.5) {
      const pk = (P.slipPeak ?? 0.169) * 1.05, lo = zeroSlip - pk, hi = zeroSlip + pk;
      if (target < lo || target > hi) { target = Math.max(lo, Math.min(hi, target)); if (Math.abs(ctl.steer) > 0.1) aT.steer = 0.25; }
    }
    const rate = (Math.abs(target) < Math.abs(this.delta) ? 5.5 : 3.2) * P.maxSteer;
    const d = target - this.delta;
    // analog: straight to the stick (AI), or through a short smoothing for a pad (ctl.lag s, default 50 ms), so a flick
    // of the thumb doesn't slam the wheels across in one frame. Keys: rate-limited.
    if (ctl.pad) this.delta += d * Math.min(1, dt / (ctl.lag || 0.05));
    else if (ctl.analog) this.delta = target;
    else this.delta += Math.max(-rate * dt, Math.min(rate * dt, d));
    const delta = this.delta;
    this.steer = -delta / P.maxSteer;

    // loads
    const mu = P.mu * env.mu * this.gripMul;
    const dm = this.dmg, ty = this.tyre;
    const W = P.mass * G, D = P.kd * this.dfMul * u * u;
    const aF = P.aeroF ?? P.b / P.L;
    const Df = D * aF * (1 - 0.55 * dm.fw), Dr = D * (1 - aF) * (1 - 0.55 * dm.rw);
    const N = W + Df + Dr;
    // front/rear load transfer follows the g on the springs (axLT settles in ~0.25 s, like a car pitching on its
    // dampers, instead of the instant shift it used to be)
    // (pitchK: road cars' suspension anti-dive / arcade softening, so braking doesn't unload the rear so hard it spins)
    // (and less of it at high speed: downforce and the springs' stiffer end hold the car flatter, so braking into a
    // fast kink doesn't unload the rear enough to swap ends; full effect below ~110 km/h, two-thirds by ~235)
    const pitchV = 1 - 0.35 * Math.min(1, Math.max(0, (Math.abs(u) - 30) / 35));
    // (only when braking: pulling away, the full m·a·h/L goes onto the rears, whatever the springs do; the softening was
    // only ever meant for the brakes, and it left the rears light just as you powered out of a corner)
    const tr = P.mass * this.axLT * P.cgh / P.L * (this.axLT < 0 ? (P.pitchK ?? 1) * pitchV : 1);
    const Nf0 = W * P.b / P.L + Df, Nr0 = W * P.a / P.L + Dr; // axle loads with no transfer
    const Nf = Math.max(0.15 * N, Nf0 - tr);
    const Nr = Math.max(0.15 * N, Nr0 + tr);
    // load sensitivity: a tyre gives less grip per kilo the more it's loaded, so the axle that gains load under braking
    // gains less grip than the other loses (it's what keeps a braking car from swapping ends)
    const LS = P.loadK ?? 0.2, lsK = (n, n0) => Math.max(0.75, Math.min(1.25, 1 - LS * (n / n0 - 1)));
    const tg = tyreGrip(ty.c, this.rain) * (1 - 0.08 * dm.ch);
    const gF = tg * wearGrip(ty.wf) * lsK(Nf, Nf0), gR = tg * wearGrip(ty.wr) * lsK(Nr, Nr0);

    // ---- four tyres ----
    // Each wheel (0 front-left, 1 front-right, 2 rear-left, 3 rear-right; "left" = the +v side) has its own load, slip
    // angle, spin and slip ratio. Loads: the axle's (the front / rear transfer above) split left / right by the
    // lateral transfer m·ay·h / track, shared between the axles by rollF (until stage 2b's sprung body works it out
    // from the springs and anti-roll bars). Load sensitivity is per tyre (loadK): the outside tyre gains less grip than
    // the inside one loses, which is the real reason a leaning car loses grip.
    const tw = P.track ?? 1.6, rollF = P.rollF ?? P.b / P.L;
    const dLat = P.mass * this.ayPrev * P.cgh / tw; // signed: load moves to the -v side when accelerating toward +v
    this.loadT = Math.min(1, 2 * Math.abs(dLat) / N);
    const hb = ctl.handbrake || 0;
    const uA = Math.max(Math.abs(u), 4);
    const sgn = u >= 0 ? 1 : -1;
    const af = Math.atan2(v + P.a * this.r, uA) - delta * sgn; // (the axle-centre slip angles: wear, sounds, skids)
    const ar = Math.atan2(v - P.b * this.r, uA);
    const aFp = P.slipPeak ?? 0.169, aRp = P.slipPeakR ?? aFp;
    const tgF = tg * wearGrip(ty.wf), tgR = tg * wearGrip(ty.wr) * P.rearGrip;
    const WN = W4.n, WC = W4.cap, WA = W4.a, WSY = W4.sy, WU = W4.u, WY = W4.y, WX = W4.x;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, side = (i & 1) ? -1 : 1, y = side * tw / 2;
      const Na = front ? Nf : Nr, n = Math.max(0, Na / 2 - side * dLat * (front ? rollF : 1 - rollF));
      WN[i] = n; WY[i] = y; WX[i] = front ? P.a : -P.b;
      WC[i] = mu * n * (front ? tgF : tgR) * lsK(Math.max(n, 1), (front ? Nf0 : Nr0) / 2);
      const ui = u - this.r * y, uAi = Math.max(Math.abs(ui), 4);
      WU[i] = ui;
      WA[i] = front ? Math.atan2(v + P.a * this.r, uAi) - delta * sgn : Math.atan2(v - P.b * this.r, uAi);
      WSY[i] = WA[i] / (front ? aFp : aRp);
    }
    const capF = WC[0] + WC[1], capR = WC[2] + WC[3];

    // throttle / brake / reverse
    let thr = ctl.throttle, brk = ctl.brake, drive = 0, braking = 0;
    const R = P.wheelR ?? 0.33, fd = P.drive || 0;
    if (!this.wInit) { const w0 = u / R; this.ws.fill(w0); this.ks.fill(0); this.absK.fill(1); this.tcK = 1; this.wInit = true; }
    const WS = this.ws, KS = this.ks, AB = this.absK;
    // (the engine turns with the driven wheels: wheelspin revs it)
    const wheelV = ((1 - fd) * (WS[2] + WS[3]) / 2 + fd * (WS[0] + WS[1]) / 2) * R;
    if (this.gear === -1) {
      if (thr > 0.1 && u > -0.8) { this.gear = 1; }
      else { drive = u > -11 ? -brk * 6000 : 0; braking = thr; }
    } else {
      if (brk > 0.1 && u < 0.8 && thr < 0.05) { this.revT += dt; if (this.revT > 0.3) this.gear = -1; }
      else this.revT = 0;
      if (this.gear >= 1) {
        const top = P.gears[this.gear];
        this.rpm = Math.max(P.idle, Math.min(P.redline + 200, (Math.max(0, wheelV) / top) * P.redline));
        let f = Math.min(P.maxForce, (P.power * this.powerMul * (1 - 0.06 * dm.ch)) / Math.max(wheelV, 1));
        const x = (this.rpm - P.idle) / (P.redline - P.idle);
        f *= P.torque ? torqueAt(P.torque, x) : 0.85 + 0.15 * Math.sin(Math.min(1, Math.max(0, x)) * Math.PI);
        if (!this.auto) f *= Math.min(1, Math.max(0.35, this.rpm / 7000));
        if (this.rpm >= P.redline) f *= 0.1;
        if (this.shiftT > 0) f *= 0.25;
        drive = thr * f;
        // engine braking: off the throttle the engine drags the driven wheels (more at high revs), so lifting slows a
        // spinning rear back to road speed and it grips again
        if (this.shiftT <= 0) drive -= (1 - thr) * (P.engineBrake ?? 0.12) * P.maxForce * Math.min(1, Math.max(0.2, x));
      }
      braking = brk;
    }
    if (this.gear === -1) this.rpm = Math.max(P.idle, Math.min(9000, P.idle + Math.abs(u) * 500));
    if (this.shiftT > 0) this.shiftT -= dt;

    // automatic box, on the car's road speed (not the wheels': a wheelspinning launch doesn't shift up; not the speed
    // along the nose: a car going sideways in a drift isn't slow, and mustn't drop into first)
    const kpk = P.kappaPeak ?? 0.1;
    if (this.auto && this.gear >= 1) {
      const rpmRoad = (speed / P.gears[this.gear]) * P.redline;
      // (also on the engine's own revs when the wheels are only slipping the usual few percent, or it would sit on the
      // limiter until the road speed caught up)
      const kd = (1 - fd) * this.kR + fd * this.kF, near = rpmRoad > P.redline - 400 || (this.rpm > P.redline - 400 && kd < 0.15);
      if (near && this.gear < P.gears.length - 1 && thr > 0.2) { this.gear++; this.shiftT = P.shift ?? 0.07; }
      else if (this.gear > 1 && speed < P.gears[this.gear - 1] * 0.7) { this.gear--; }
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
    // the differential: a viscous limited-slip diff on the driven axle, diffVisc N·m·s/rad; a free axle's wheels are
    // independent). With both wheels alike it's exactly stage 1's axle model.
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
    const brakeT = (P.brakeK ?? 1.5) * P.mu * (W + P.kd * Math.pow(0.7 * P.gears[P.gears.length - 1], 2)) * R * this.brakeMul;
    const sgnU = u >= 0 ? 1 : -1;
    const lowStop = braking > 0 && Math.abs(u) < 1.2; // (walking pace: the old direct stop, the tyre model can't hold a car still)
    // Drift cars, once you're clearly drifting (the handbrake in the last second and a half, or past ~20° sideways):
    // traction control switches to a drift mode like a modern performance car's (BMW's M Dynamic Mode, Ford's Drift
    // Mode): it lets the rears spin up enough to hold an angle on the throttle, but not so far they give up all their
    // side grip and the car spins. A snap of oversteer on its own is still caught the normal way.
    this.hbT = hb > 0.2 ? 1.5 : Math.max(0, (this.hbT || 0) - dt);
    // (never for the AI: it doesn't drift on purpose, so its traction control always catches a slide)
    const drifting = drifty && !this.aiCarve && (this.hbT > 0 || Math.abs(beta) > 0.35);
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
    // TC target on the driven wheels (lower while cornering, so the rear keeps its side grip; the drift mode excepted)
    const sdT = Math.min(1, Math.abs(fd >= 1 ? syF : syR));
    const tcT = drifting ? tcTarget : tcTarget * (1 - (A.tc >= 1 ? 0.6 : 0.3) * sdT);
    // limits as torque the tyres can take: ABS on each wheel's brake, TC on each axle's drive (both ride just over the
    // peak when nothing's slipping, and come down as the wheels slip past the target), plus the torque it takes to speed
    // the wheels and the engine up or slow them down with the car
    const accW = Math.abs(this.axPrev) / R;
    const LIM = W4.lim;
    for (let i = 0; i < 4; i++) LIM[i] = WC[i] * R * 1.15 + (i < 2 ? IF : IR) / 2 * accW;
    const limF = LIM[0] + LIM[1], limR = LIM[2] + LIM[3];
    // brakes: the proportioning valve every road car's brake lines have (past its knee the rears get a third of any more
    // pedal, so a hard stamp locks the fronts first, never the rears; with ABS off too)
    const rMax = brakeT * (1 - bF), knee = rMax * (P.brakeKnee ?? 0.65), rIn = braking * rMax;
    const pedF = lowStop ? 0 : braking * brakeT * bF / 2, pedR = lowStop ? 0 : (rIn > knee ? knee + (rIn - knee) * 0.33 : rIn) / 2; // (per wheel)
    const hbT = hb * brakeT * (P.handbrakeK ?? 0.27) / 2; // (per rear wheel: the handbrake skips the ABS, and isn't as strong as the footbrake)
    // stability control's engine cut (what real ESC does besides braking wheels): past the rears' sideways grip peak
    // on the throttle, it eases the power until they hook up again. Off with SC off, and in the drift mode.
    const escOn = A.stab && !drifting && drive > 0 && fd < 1, escE = Math.abs(syR) - 0.9;
    this.escK = escOn && escE > 0 ? Math.max(0.2, (this.escK ?? 1) - dt * 10 * escE) : Math.min(1, (this.escK ?? 1) + dt * 3);
    if (this.escK < 0.9 && thr > 0.3) aT.stab = 0.25;
    const escK = drive > 0 ? this.escK : 1;
    const drF = drive * R * fd * escK, drR = clutchIn ? 0 : drive * R * (1 - fd) * escK; // (per axle, split evenly by the diff)
    const CF = this.nCF, BF = this.nBF, CR = this.nCR, BRr = this.nBR;
    const cDiff = P.diffVisc ?? 60;
    const FXs = W4.fx, FYs = W4.fy, TB = W4.tb;
    FXs.fill(0); FYs.fill(0);
    let absAct = false, tcAct = false, tcK = this.tcK;
    for (let k = 0; k < nSub; k++) {
      // ABS: each wheel's pressure eases off in proportion to how far past the target it is, and builds back
      for (let i = 0; i < 4; i++) {
        if (hasABS && braking > 0.05) { const e = (ABT[i] - KS[i] * sgnU) / kp; AB[i] = e > 0 ? Math.max(0.2, AB[i] - h * 40 * e) : Math.min(1, AB[i] + h * 2); }
        else AB[i] = 1;
        let tb = i < 2 ? pedF : pedR;
        if (hasABS && tb > AB[i] * LIM[i]) { tb = AB[i] * LIM[i]; if (AB[i] < 0.98) absAct = true; }
        TB[i] = tb + (i >= 2 ? hbT : 0);
      }
      // TC: engine torque eases off in proportion to the worst driven wheel's spin past the target, and comes back as
      // it hooks up
      const kdw = fd >= 1 ? Math.max(KS[0] * sgnU, KS[1] * sgnU) : fd > 0 ? Math.max(KS[0] * sgnU, KS[1] * sgnU, KS[2] * sgnU, KS[3] * sgnU) : Math.max(KS[2] * sgnU, KS[3] * sgnU);
      const e = (kdw - tcT) / kp;
      tcK = tcOn && e > 0 ? Math.max(0.05, tcK - h * 30 * e) : Math.min(1, tcK + h * (tcOn ? 6 : 50));
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
        const L = ax * 2, Rw = L + 1, Iax = ax ? IR : IF, Td = ax ? TdR : TdF, c = ax ? (fd < 1 ? cDiff : 0) : (fd > 0 ? cDiff : 0);
        // (the brakes act against each wheel's spin in the same sums, so a driven pair's engine inertia slows with them)
        const wL0 = WS[L], wR0 = WS[Rw];
        const TL = Td / 2 - W4.sfx[L] * R - Math.sign(wL0) * TB[L], TR = Td / 2 - W4.sfx[Rw] * R - Math.sign(wR0) * TB[Rw];
        let m = (wL0 + wR0) / 2, d = (wL0 - wR0) / 2;
        m += h * (TL + TR) / Iax;
        d = (d + h * (TL - TR) / wI) / (1 + h * 4 * c / wI);
        // a brake can stop a wheel, never turn it backwards (it holds a stopped wheel until the road torque beats it)
        let wl = m + d, wr = m - d;
        if (TB[L] > 0 && (wl * wL0 < 0 || (wL0 === 0 && Math.abs(W4.sfx[L] * R) <= TB[L]))) wl = 0;
        if (TB[Rw] > 0 && (wr * wR0 < 0 || (wR0 === 0 && Math.abs(W4.sfx[Rw] * R) <= TB[Rw]))) wr = 0;
        WS[L] = wl; WS[Rw] = wr;
      }
      // slip ratios, relaxed over σ (implicit in the decay, so it's stable at any speed)
      for (let i = 0; i < 4; i++) {
        const q = h * Math.abs(WU[i]) / sigma;
        KS[i] = Math.max(-1.5, Math.min(3, (KS[i] + h * (WS[i] * R - WU[i]) / sigma) / (1 + q)));
      }
    }
    this.tcK = tcK;
    // the axle means (what the gearbox, the HUD and older readers use)
    this.wF = (WS[0] + WS[1]) / 2; this.wR = (WS[2] + WS[3]) / 2; this.kF = (KS[0] + KS[1]) / 2; this.kR = (KS[2] + KS[3]) / 2;
    for (let i = 0; i < 4; i++) { FXs[i] /= nSub; FYs[i] /= nSub; }
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
      for (let i = 0; i < 4; i++) { WS[i] = WU[i] / R; KS[i] = 0; }
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
    const dragK = P.drag * (1 - 0.12 * dm.rw) * this.dragMul * (1 - 0.3 * this.slip);
    let Fx = FXB - dragK * u * Math.abs(u) - P.roll * u - env.extraDrag * u;
    // keep a held drift from scrubbing all the speed away (an arcade cheat: real slides are slower)
    if (drifty && thr > 0 && u > 5) Fx += P.mass * (P.driftPush ?? 0) * thr * slideW;

    // tyre wear: more when the tyre is worked hard, much more when it's sliding
    if (this.wearK > 0 && speed > 1) {
      const def = TYRES[ty.c];
      const rate = def.rate * this.wearK * (ty.c === 'wet' && !this.rain ? 3 : 1) * speed * dt;
      const uF = Math.min(1.3, Math.hypot(Fyf, Fxf) / Math.max(1, capF)), uR = Math.min(1.3, Math.hypot(Fyr, Fxr) / Math.max(1, capR));
      const sF = Math.abs(af) > 0.18 || lockF ? 3 : 1, sR = Math.abs(ar) > 0.18 || this.spin > 0 || lockR ? 3 : 1;
      ty.wf = Math.max(0, ty.wf - rate * (0.25 + 1.5 * uF * uF) * sF);
      ty.wr = Math.max(0, ty.wr - rate * (0.25 + 1.5 * uR * uR) * sR);
    }
    let Fy = FYB - 0.6 * v * Math.abs(v);
    Fx += P.mass * env.gF; Fy += P.mass * env.gL;

    const axL = Fx / P.mass, ayL = Fy / P.mass;
    this.axPrev += (axL - this.axPrev) * Math.min(1, dt * 12);
    this.ayPrev += (ayL - this.ayPrev) * Math.min(1, dt * 12);
    this.axLT += (this.axPrev - this.axLT) * Math.min(1, dt * 5);
    this.vx += (axL * sn + ayL * cs) * dt;
    this.vz += (axL * cs - ayL * sn) * dt;
    this.r += (Tz / P.inertia) * dt;
    // (a little artificial yaw damping; the tyres do most of it)
    this.r *= 1 - dt * 0.25;
    // stability assist: cap yaw rate to what the tyres can sustain
    // (drift cars: a looser cap, or the car could never rotate into a slide; the slide limiter below takes over)
    const driftingNow = drifty && (hb > 0 || (slideW > 0.3 && thr > 0.3));
    // (with stability control off a much looser cap stays: it's what stops a spin turning into a helicopter)
    if (A.stab && speed > 8 && !driftingNow) {
      const rMax = (mu * N / P.mass) / Math.max(6, Math.abs(u)) * 1.08;
      const ar2 = Math.abs(this.r);
      if (ar2 > rMax) { this.r -= Math.sign(this.r) * (ar2 - rMax) * Math.min(1, dt * 10); if (ar2 - rMax > 0.03) aT.stab = 0.25; }
    } else if (speed > 8) {
      const rMax = (mu * N / P.mass) / Math.max(6, Math.abs(u)) * 1.6;
      const ar2 = Math.abs(this.r);
      if (ar2 > rMax) this.r -= Math.sign(this.r) * (ar2 - rMax) * Math.min(1, dt * 3);
    }
    // slide limiter: past the car's maximum drift angle, turn the nose back toward the direction of travel (it's what
    // keeps a drift from becoming a spin). Drift cars allow big angles; with assists on the F1 car catches small ones.
    // (driftMax 0 = no limit: the car can go as sideways as you let it, and spin)
    const bMax = drifty ? (P.driftMax ? P.driftMax + (A.stab ? 0 : 0.3) : 0) : A.stab ? 0.3 : 0;
    if (bMax && speed > 6) {
      const ex = Math.abs(beta) - bMax;
      if (ex > 0) {
        if (A.stab) aT.stab = 0.25;
        this.r += Math.sign(beta) * Math.min(0.4, ex) * 28 * dt;
        if (Math.sign(this.r) === -Math.sign(beta)) this.r *= 1 - Math.min(1, dt * 6 * Math.min(1, ex * 6)); // stop it rotating further
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

    // drift carve, eased in: the longer you hold a drift on the throttle, the more your direction of travel is drawn
    // toward where the nose points (into the corner), so long corners can be held without being pushed wide. Nothing
    // for the first ~0.4 s (flicks and short slides feel untouched), full strength after ~2 s, fades fast on exit.
    if (drifty && this.drifting && thr > 0.2) this.driftT = (this.driftT || 0) + dt;
    else this.driftT = Math.max(0, (this.driftT || 0) - dt * 3);
    if (drifty && P.driftCarve && !this.aiCarve && this.driftT > 0.4 && thr > 0 && speed > 8) {
      const x = Math.min(1, (this.driftT - 0.4) / 1.6), ramp = x * x * (3 - 2 * x);
      const b2 = Math.atan2(this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h), this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h));
      const phi = -Math.sign(b2) * Math.min(Math.abs(b2) * 0.5, P.driftCarve * ramp * thr * slideW * dt);
      const c = Math.cos(phi), s = Math.sin(phi), vx = this.vx;
      this.vx = vx * c + this.vz * s; this.vz = -vx * s + this.vz * c;
      this.h += phi * 0.5; // the nose follows half-way, so the drift angle is kept
    }
    // the AI can't hold a drift, so it gets the carve's extra cornering while gripping instead: near the tyres' limit
    // its direction of travel (and the nose with it, so it doesn't look sideways) is drawn round the corner the way a
    // held drift's would be. Without this a drifting player corners at about twice the AI's g in the road cars.
    // (a slide counts as being at the limit too, so it doesn't cut out the moment the car steps sideways)
    if (this.aiCarve && drifty && P.driftCarve && speed > 8) {
      const use = Math.min(1, Math.max(slideW, (Math.abs(ayL) / (mu * N / P.mass) - 0.5) / 0.35));
      if (use > 0) {
        const phi = Math.sign(ayL) * P.driftCarve * this.aiCarve * use * dt;
        const c = Math.cos(phi), s = Math.sin(phi), vx = this.vx;
        this.vx = vx * c + this.vz * s; this.vz = -vx * s + this.vz * c;
        this.h += phi;
      }
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
