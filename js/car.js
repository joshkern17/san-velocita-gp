// F1 car: low-poly model + bicycle-model tyre physics
import * as THREE from 'three';
import { getTextures } from './textures.js';
import { AI_AIDS } from './aids.js';

export const TEAMS = [
  { name: 'Volta Racing',   main: 0xc8141c, accent: 0xf2f2f2, helmet: 0xffd21a, driver: 'YOU' },
  { name: 'Kobra Oil GP',   main: 0x121214, accent: 0xf2c21b, helmet: 0xe33030, driver: 'R. VALDEZ' },
  { name: 'Azure Motorsport', main: 0x1d4fb8, accent: 0xff7b1a, helmet: 0xffffff, driver: 'K. TANAKA' },
  { name: 'Verde Corse',    main: 0x1c7a3a, accent: 0xf0e6c8, helmet: 0x1c7a3a, driver: 'S. ROSSI' },
  { name: 'Neon FM Racing', main: 0x8d2bd8, accent: 0x3ef0ff, helmet: 0xff5ce1, driver: 'J. MOREAU' },
  { name: 'Sunset Motel',   main: 0xf07a2a, accent: 0x2a1a60, helmet: 0xfff4d0, driver: 'M. OKAFOR' },
  { name: 'Silverline',     main: 0xb8bcc4, accent: 0x0bb3a8, helmet: 0x0bb3a8, driver: 'T. LINDQVIST' },
  { name: 'Burger Duck',    main: 0xf4c01a, accent: 0xb31313, helmet: 0x3a2a10, driver: 'D. KOWALSKI' },
  { name: 'Rapid Tyres',    main: 0xffffff, accent: 0x1a4fb0, helmet: 0x1a4fb0, driver: 'A. FERREIRA' },
  { name: 'Bayside Blue',   main: 0x0e2a55, accent: 0xe8e8e8, helmet: 0xd02a2a, driver: 'L. NAKAMURA' },
  { name: 'Mesa Energy',    main: 0x7a3b12, accent: 0xffb13a, helmet: 0xffffff, driver: 'P. SCHMIDT' },
  { name: 'Pine Hollow',    main: 0x2c3a2c, accent: 0xa4e04a, helmet: 0xa4e04a, driver: 'E. OKONKWO' },
];

// ---------------- model ----------------

// cross-section loft. sections: [z, halfW, yBottom, yTop]
function loft(sections, xOff = 0) {
  const ring = (s) => {
    const [z, w, yb, yt] = s;
    const ym = yb + (yt - yb) * 0.45;
    return [
      [xOff - w * 0.85, yb, z], [xOff + w * 0.85, yb, z], [xOff + w, ym, z],
      [xOff + w * 0.55, yt, z], [xOff - w * 0.55, yt, z], [xOff - w, ym, z],
    ];
  };
  const pos = [];
  const rings = sections.map(ring);
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      tri(A[k], B[k], B[k2]); tri(A[k], B[k2], A[k2]);
    }
  }
  const cap = (R, flip) => {
    for (let k = 1; k < 5; k++) flip ? tri(R[0], R[k + 1], R[k]) : tri(R[0], R[k], R[k + 1]);
  };
  cap(rings[0], false); cap(rings[rings.length - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, x, y, z, mat, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}

const wheelTex = {};
function wheelTexture(c) {
  if (wheelTex[c]) return wheelTex[c];
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#141414'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(16, 16, 11, 0, 7); g.fill();
  g.fillStyle = '#9a9aa2'; g.beginPath(); g.arc(16, 16, 8, 0, 7); g.fill();
  g.fillStyle = '#555'; g.beginPath(); g.arc(16, 16, 3, 0, 7); g.fill();
  g.strokeStyle = TYRES[c].css; g.lineWidth = 1.6; g.beginPath(); g.arc(16, 16, 12.7, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (wheelTex[c] = t);
}

export function buildCarModel(team, opts = {}) {
  const tx = getTextures();
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const paint = new THREE.MeshPhongMaterial({ color: team.main, specular: 0x555555, shininess: 70, flatShading: true, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhongMaterial({ color: team.accent, specular: 0x444444, shininess: 60, flatShading: true, side: THREE.DoubleSide });
  const carbon = new THREE.MeshLambertMaterial({ map: tx.carbon, color: 0x777777 });
  const black = new THREE.MeshLambertMaterial({ color: 0x151518 });
  const helmetMat = new THREE.MeshPhongMaterial({ color: team.helmet, shininess: 90, flatShading: true });

  // chassis / nose
  const chassis = new THREE.Mesh(loft([
    [2.55, 0.07, 0.19, 0.27], [2.1, 0.15, 0.17, 0.4], [1.3, 0.24, 0.15, 0.55], [0.55, 0.34, 0.12, 0.62],
    [-0.3, 0.42, 0.1, 0.62], [-1.15, 0.34, 0.12, 0.7], [-1.9, 0.19, 0.16, 0.52], [-2.35, 0.1, 0.24, 0.4],
  ]), paint);
  body.add(chassis);
  // nose stripe (accent) – slightly bigger thin loft on top
  const stripe = new THREE.Mesh(loft([[2.45, 0.03, 0.26, 0.29], [1.3, 0.1, 0.5, 0.565], [0.6, 0.12, 0.58, 0.63]]), accent);
  body.add(stripe);
  // sidepods
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(loft([
      [0.45, 0.06, 0.14, 0.4], [0.15, 0.26, 0.11, 0.54], [-0.7, 0.25, 0.11, 0.5], [-1.55, 0.08, 0.13, 0.28],
    ], s * 0.62), paint);
    body.add(pod);
    const inlet = box(0.34, 0.2, 0.05, s * 0.66, 0.36, 0.47, black, body);
    inlet.rotation.y = 0;
  }
  // airbox / engine cover
  body.add(new THREE.Mesh(loft([[-0.32, 0.12, 0.6, 0.98], [-0.75, 0.15, 0.6, 0.92], [-1.7, 0.06, 0.6, 0.7]]), accent));
  // shark fin
  const fin = new THREE.Mesh(loft([[-0.9, 0.012, 0.6, 0.9], [-2.0, 0.012, 0.5, 0.86]]), paint);
  body.add(fin);
  // floor
  box(1.45, 0.05, 2.7, 0, 0.08, -0.6, carbon, body);
  // cockpit opening
  box(0.44, 0.04, 0.8, 0, 0.625, 0.05, black, body);
  // driver helmet
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), helmetMat);
  helmet.position.set(0, 0.73, -0.05); helmet.scale.set(1, 1, 1.12); body.add(helmet);
  box(0.24, 0.06, 0.05, 0, 0.75, 0.1, black, body);
  // halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 4, 10, Math.PI), black);
  halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI; halo.position.set(0, 0.86, -0.1); halo.scale.set(1, 1.35, 1);
  body.add(halo);
  const hp = box(0.05, 0.3, 0.05, 0, 0.72, 0.38, black, body); hp.rotation.x = -0.5;
  // mirrors
  for (const s of [-1, 1]) box(0.14, 0.06, 0.04, s * 0.48, 0.72, 0.5, paint, body);

  // front wing (own group so it can bend / break off)
  const fwing = new THREE.Group(); fwing.position.set(0, 0.15, 2.5); body.add(fwing);
  box(1.95, 0.035, 0.42, 0, -0.03, 0.02, accent, fwing);
  box(1.8, 0.03, 0.2, 0, 0.04, -0.08, paint, fwing);
  for (const s of [-1, 1]) box(0.03, 0.26, 0.55, s * 0.98, 0.05, 0, black, fwing);
  // rear wing
  const rwing = new THREE.Group(); rwing.position.set(0, 0.8, -2.35); body.add(rwing);
  box(1.05, 0.04, 0.34, 0, 0.08, 0, paint, rwing);
  box(1.05, 0.03, 0.18, 0, 0.17, -0.1, accent, rwing);
  for (const s of [-1, 1]) box(0.035, 0.62, 0.52, s * 0.54, -0.14, 0, paint, rwing);
  box(0.06, 0.45, 0.1, 0, 0.62, -2.3, black, body);
  // diffuser
  box(1.1, 0.18, 0.4, 0, 0.14, -2.15, carbon, body);
  // rain / brake light
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x551010 });
  const brakeLight = box(0.12, 0.06, 0.03, 0, 0.3, -2.5, lightMat, body);

  // suspension arms
  const arm = (x1, y1, z1, x2, y2, z2) => {
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len), black);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.lookAt(x2, y2, z2); body.add(m);
  };
  for (const s of [-1, 1]) {
    arm(s * 0.2, 0.42, 1.95, s * 0.75, 0.38, 1.75); arm(s * 0.2, 0.2, 1.55, s * 0.75, 0.26, 1.75);
    arm(s * 0.3, 0.45, -1.5, s * 0.72, 0.42, -1.6); arm(s * 0.3, 0.2, -1.3, s * 0.72, 0.26, -1.6);
  }

  // wheels
  const tread = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const rim = new THREE.MeshLambertMaterial({ map: wheelTexture('medium') });
  const wheels = [];
  const mk = (x, z, r, w, front) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const geo = new THREE.CylinderGeometry(r, r, w, 12, 1);
    geo.rotateZ(Math.PI / 2);
    const wm = new THREE.Mesh(geo, [tread, rim, rim]);
    pivot.add(wm);
    group.add(pivot);
    wheels.push({ pivot, mesh: wm, r, front });
  };
  mk(0.83, 1.75, 0.34, 0.34, true); mk(-0.83, 1.75, 0.34, 0.34, true);
  mk(0.8, -1.6, 0.36, 0.42, false); mk(-0.8, -1.6, 0.36, 0.42, false);

  // blob shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.2), new THREE.MeshBasicMaterial({ map: tx.blob, transparent: true, depthWrite: false, opacity: 0.8, color: 0x000000 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;

  // light coronas (night / rain)
  const coronaMat = new THREE.SpriteMaterial({ map: tx.corona, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const tail = new THREE.Sprite(coronaMat);
  tail.position.set(0, 0.3, -2.55); tail.scale.set(1.2, 1.2, 1); body.add(tail);

  group.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
  const model = { group, body, wheels, shadow, brakeLight, lightMat, tail, coronaMat, fwing, rwing, rim };
  model.setCompound = (c) => { rim.map = wheelTexture(c); rim.needsUpdate = true; };
  // bend, then lose, wings as damage builds up
  model.setDamage = (d) => {
    const wob = (g, v, dir) => {
      g.visible = v < 0.72;
      g.rotation.z = v > 0.3 ? (v - 0.3) * 0.5 * dir : 0;
      g.rotation.x = v > 0.3 ? (v - 0.3) * 0.35 : 0;
    };
    wob(fwing, d.fw, model.pull || 1); wob(rwing, d.rw, -(model.pull || 1));
    body.rotation.z = d.ch * 0.03;
  };
  return model;
}

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
    this.wF = this.wR = 0; this.kF = this.kR = 0; this.absF = this.absR = this.tcK = 1; this.wInit = false; // wheels (see step)
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

    // slip angles
    const uA = Math.max(Math.abs(u), 4);
    const sgn = u >= 0 ? 1 : -1;
    const af = Math.atan2(v + P.a * this.r, uA) - delta * sgn;
    const ar = Math.atan2(v - P.b * this.r, uA);
    // side-to-side load transfer: tyres give less grip per kilo as load goes up, so a high, soft car loses grip in
    // corners (inside tyres unload more than the outside ones gain). rollF = the front's share of the roll stiffness
    // (anti-roll bars): the axle that takes more of the transfer loses more grip, so it's the car's balance knob -
    // more front = safer understeer, more rear = a car that rotates. Default: the front's share of the weight.
    const ltAll = P.mass * Math.abs(this.ayPrev) * P.cgh / (P.track || 1.6);
    const rollF = P.rollF ?? P.b / P.L;
    const ltF = Math.min(1, 2 * ltAll * rollF / Nf), ltR = Math.min(1, 2 * ltAll * (1 - rollF) / Nr);
    const ltLoss = P.ltLoss ?? 0.12;
    const ltKf = 1 - ltLoss * ltF * ltF, ltKr = 1 - ltLoss * ltR * ltR;
    this.loadT = Math.min(1, 2 * ltAll / N);
    const hb = ctl.handbrake || 0;
    const capF = mu * Nf * gF * ltKf, capR = mu * Nr * P.rearGrip * gR * ltKr;

    // throttle / brake / reverse
    let thr = ctl.throttle, brk = ctl.brake, drive = 0, braking = 0;
    const R = P.wheelR ?? 0.33, fd = P.drive || 0;
    // (the engine turns with the driven wheels: wheelspin revs it)
    const wheelV = ((1 - fd) * this.wR + fd * this.wF) * R;
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
    if (this.auto && this.gear >= 1) {
      const rpmRoad = (speed / P.gears[this.gear]) * P.redline;
      // (also on the engine's own revs when the wheels are only slipping the usual few percent, or it would sit on the
      // limiter until the road speed caught up)
      const kd = (1 - fd) * this.kR + fd * this.kF, near = rpmRoad > P.redline - 400 || (this.rpm > P.redline - 400 && kd < 0.15);
      if (near && this.gear < P.gears.length - 1 && thr > 0.2) { this.gear++; this.shiftT = P.shift ?? 0.07; }
      else if (this.gear > 1 && speed < P.gears[this.gear - 1] * 0.7) { this.gear--; }
    }

    // ---- the wheels: spin, slip ratio, and the tyre forces they make ----
    // Each axle's wheels spin with their own inertia (the driven ones also turn the engine through the gearbox): engine
    // and brake torque against the road's grip. Slip ratio κ = (wheel speed − road speed) / road speed, carried as a
    // state that builds over the tyre's relaxation length σ, so it still behaves at walking pace (the low-speed tyre
    // model in Pacejka, "Tire and Vehicle Dynamics"). The force comes from both slips together (the similarity method,
    // same book): longitudinal slip over its peak and slip angle over its peak make one slip vector; its length picks
    // the force off the tyre curve, its direction shares it out. So a spinning or locked tyre has little side grip left,
    // and braking hard while turning trades steering for stopping, the way a real tyre does.
    // ABS and traction control are real controllers on top: ABS eases each axle's brake pressure when its wheels start
    // to lock (and holds the slip lower while you're turning, like cornering brake control), TC cuts engine torque
    // when the driven wheels spin past their target.
    const kp = P.kappaPeak ?? 0.1, sigma = P.relaxX ?? 0.12;
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
    if (!this.wInit) { this.wF = this.wR = u / R; this.kF = this.kR = 0; this.absF = this.absR = this.tcK = 1; this.wInit = true; }
    const aFp = P.slipPeak ?? 0.169, aRp = P.slipPeakR ?? aFp;
    const syF = af / aFp, syR = ar / aRp;
    // (a locked or spinning tyre keeps ~75% of its peak along the road, P.slipFallX; sideways the car's own curve)
    const CX = P.slipFallX ?? 1.5, BX = Math.tan(Math.PI / (2 * CX));
    const au = Math.abs(u), hasABS = A.abs && au > 3;
    // (4 sub-steps: the slip ratio's decay is implicit, so this only has to keep the wheel's spin-up stable)
    const nSub = 4, h = dt / nSub, q = h * au / sigma;
    // what doesn't change between the sub-steps
    // ABS targets: each axle's slip held just under the tyre's peak (a little lower while you're turning, so the fronts
    // keep steering). Electronic brake-force distribution holds the rears well under their peak, lower still while
    // cornering, so the back of the car keeps its side grip; cornering brake control does the same on the fronts.
    const tF = -kp * (0.95 - 0.35 * Math.min(1, Math.abs(syF))), tR = -kp * Math.max(0.15, 0.9 - 0.8 * Math.min(1, Math.abs(syR)));
    // TC target on the driven wheels (lower while cornering, so the rear keeps its side grip; the drift mode excepted)
    const sdT = Math.min(1, Math.abs(fd >= 1 ? syF : syR));
    const tcT = drifting ? tcTarget : tcTarget * (1 - (A.tc >= 1 ? 0.6 : 0.3) * sdT);
    // limits as torque the tyres can take: ABS on each axle's brake, TC on the drive (both ride just over the peak when
    // nothing's slipping, and come down as the wheels slip past the target), plus the torque it takes to speed the
    // wheels and the engine up or slow them down with the car (in first gear the engine's inertia through the gearbox
    // is several times the wheels')
    const accW = Math.abs(this.axPrev) / R, limF = capF * R * 1.15 + IF * accW, limR = capR * R * 1.15 + IR * accW;
    // brakes: the proportioning valve every road car's brake lines have (past its knee the rears get a third of any more
    // pedal, so a hard stamp locks the fronts first, never the rears; with ABS off too)
    const rMax = brakeT * (1 - bF), knee = rMax * (P.brakeKnee ?? 0.65), rIn = braking * rMax;
    const pedF = lowStop ? 0 : braking * brakeT * bF, pedR = lowStop ? 0 : rIn > knee ? knee + (rIn - knee) * 0.33 : rIn;
    const hbT = hb * brakeT * (P.handbrakeK ?? 0.27); // (the handbrake skips the ABS, and isn't as strong as the footbrake)
    const escK = drive > 0 ? (this.escK ?? 1) : 1;
    const drF = drive * R * fd * escK, drR = clutchIn ? 0 : drive * R * (1 - fd) * escK;
    const kdW = 1 - fd, CF = this.nCF, BF = this.nBF, CR = this.nCR, BRr = this.nBR;
    let Fxf = 0, Fxr = 0, Fyf = 0, Fyr = 0, absAct = false, tcAct = false;
    // stability control's engine cut (what real ESC does besides braking wheels): past the rears' sideways grip peak
    // on the throttle, it eases the power until they hook up again. Off with SC off, and in the drift mode.
    const escOn = A.stab && !drifting && drive > 0 && fd < 1, escE = Math.abs(syR) - 0.9;
    this.escK = escOn && escE > 0 ? Math.max(0.2, (this.escK ?? 1) - dt * 10 * escE) : Math.min(1, (this.escK ?? 1) + dt * 3);
    if (this.escK < 0.9 && thr > 0.3) aT.stab = 0.25;
    let wF = this.wF, wR = this.wR, kF = this.kF, kR = this.kR, absF = this.absF, absR = this.absR, tcK = this.tcK;
    for (let k = 0; k < nSub; k++) {
      // ABS: pressure eases off in proportion to how far past the target the wheel is, and builds back
      if (hasABS && braking > 0.05) {
        let e = (tF - kF * sgnU) / kp; absF = e > 0 ? Math.max(0.2, absF - h * 40 * e) : Math.min(1, absF + h * 2);
        e = (tR - kR * sgnU) / kp; absR = e > 0 ? Math.max(0.2, absR - h * 40 * e) : Math.min(1, absR + h * 2);
      } else absF = absR = 1;
      // TC: engine torque eases off in proportion to the spin past the target, and comes back as the wheels hook up
      const e = ((kdW * kR + fd * kF) * sgnU - tcT) / kp;
      tcK = tcOn && e > 0 ? Math.max(0.05, tcK - h * 30 * e) : Math.min(1, tcK + h * (tcOn ? 6 : 50));
      let TbF = pedF, TbR = pedR;
      if (hasABS) {
        if (TbF > absF * limF) { TbF = absF * limF; if (absF < 0.98) absAct = true; }
        if (TbR > absR * limR) { TbR = absR * limR; if (absR < 0.98) absAct = true; }
      }
      TbR += hbT;
      let TdF = drF, TdR = drR;
      if (tcOn) { const lF = tcK * limF, lR = tcK * limR; if (TdF > lF) { TdF = lF; tcAct = true; } if (TdR > lR) { TdR = lR; tcAct = true; } }
      tyreForce(capF, CF, BF, CX, BX, kF / kp, syF); const fxF = TF[0]; Fxf += fxF; Fyf += TF[1];
      tyreForce(capR, CR, BRr, CX, BX, kR / kp, syR); const fxR = TF[0]; Fxr += fxR; Fyr += TF[1];
      // wheel spin: drive and road torque, then the brake (it can stop the wheel, never turn it backwards)
      let free = wF + h * (TdF - fxF * R) / IF, db = h * TbF / IF;
      wF = Math.abs(free) <= db ? 0 : free - Math.sign(free) * db;
      free = wR + h * (TdR - fxR * R) / IR; db = h * TbR / IR;
      wR = Math.abs(free) <= db ? 0 : free - Math.sign(free) * db;
      // slip ratio, relaxed over σ (implicit in the decay, so it's stable at any speed)
      kF = Math.max(-1.5, Math.min(3, (kF + h * (wF * R - u) / sigma) / (1 + q)));
      kR = Math.max(-1.5, Math.min(3, (kR + h * (wR * R - u) / sigma) / (1 + q)));
    }
    this.wF = wF; this.wR = wR; this.kF = kF; this.kR = kR; this.absF = absF; this.absR = absR; this.tcK = tcK;
    // how close each end is to its grip limit: both slips together, over their peaks (1 = right at it; the pad reads this)
    this.gripF = Math.hypot(kF / kp, syF); this.gripR = Math.hypot(kR / kp, syR);
    Fxf /= nSub; Fyf /= nSub; Fxr /= nSub; Fyr /= nSub;
    // how much of its grip each end is using (0..1; the pad reads this with gripF / gripR)
    this.useF = Math.hypot(Fxf, Fyf) / Math.max(1, capF); this.useR = Math.hypot(Fxr, Fyr) / Math.max(1, capR);
    if (absAct) aT.abs = 0.2;
    if (tcAct && thr > 0.3) aT.tc = 0.25;
    if (!tcOn) this.tcK = 1;
    if (this.tcK > 0.97) tcAct = false;
    // walking pace under braking: stop the car directly, wheels turning with it
    if (lowStop) {
      const bfl = braking * brakeT / R, stop = Math.max(-bfl, Math.min(bfl, -u * P.mass / dt * 0.5));
      Fxf = stop * 0.65; Fxr = stop * 0.35; this.wF = this.wR = u / R; this.kF = this.kR = 0;
    }
    // what the HUD, sounds, skid marks and telemetry read: wheelspin and locked wheels, from the slip itself
    const lockF = braking > 0 && Math.abs(u) > 3 && this.kF * sgnU < -0.5, lockR = (braking > 0 || hb > 0) && Math.abs(u) > 3 && this.kR * sgnU < -0.5;
    this.lockF = lockF; this.lockR = lockR;
    this.spin = Math.max(0, (this.kR * sgnU) / kp - 1.3) * 0.2;
    this.slipRatioF = this.kF; this.slipRatioR = this.kR;

    // low-speed fade of lateral tyre forces
    const lowK = Math.min(1, speed / 3);
    Fyf *= lowK; Fyr *= lowK;

    const cd = Math.cos(delta), sd = Math.sin(delta);
    const dragK = P.drag * (1 - 0.12 * dm.rw) * this.dragMul * (1 - 0.3 * this.slip);
    let Fx = Fxr + Fxf * cd - Fyf * sd - dragK * u * Math.abs(u) - P.roll * u - env.extraDrag * u;
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
    let Fy = Fyr + Fyf * cd + Fxf * sd - 0.6 * v * Math.abs(v);
    const Tz = P.a * (Fyf * cd + Fxf * sd) - P.b * Fyr;
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
