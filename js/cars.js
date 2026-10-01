// Car catalogue: every drivable car = one entry here (physics spec + model + class).
// The F1 cars use the chassis builders in carmodel.js / glbcar.js; the rest are baked models (models/cars/<id>.glb,
// made by tools/assets/bakecars.mjs) built by roadcar.js.
//
// Physics spec fields (see CarPhysics in car.js):
//   mass kg, inertia kg m², a/b = CG to front/rear axle (m), L = a + b, cgh = CG height
//   mu = peak tyre grip (calibrated for the four-tyre model: stage 2 raised every car's by ~5-7% (F1 2%) to keep its
//   cornering g, which the per-tyre load sensitivity had taken down), rearGrip = rear/front grip ratio, kd = downforce N per (m/s)², aeroF = front share of downforce
//   drag = N per (m/s)², roll = rolling resistance, power W, maxForce = traction cap N, maxSteer rad
//   gears = top speed per gear (m/s), redline / idle rpm, torque = [[rpm fraction, torque multiplier]...]
//   drive = front share of the drive (0 rear-wheel drive, 1 front-wheel drive, 0.35 = AWD)
//   box = gearbox type (seamless | sequential | dual-clutch | manual | automatic), shift = s of reduced drive per change
import { CARSPEC } from './physics.js';

export const CLASSES = {
  f1:     { label: 'Formula',  short: 'F1' },
  gt1:    { label: 'GT1 ’90s', short: 'GT1' },
  street: { label: 'Street',  short: 'ST' },
  fun:    { label: 'Utility', short: 'UT' },
};

// torque shapes (fraction of redline -> multiplier on the power-limited force)
const NA = [[0, 0.62], [0.35, 0.86], [0.7, 1], [0.9, 0.97], [1, 0.9]];        // high-revving naturally aspirated
const TURBO = [[0, 0.45], [0.25, 0.62], [0.4, 1], [0.75, 1], [1, 0.86]];    // lag, then a big mid-range
const V8 = [[0, 0.82], [0.3, 0.97], [0.6, 1], [0.85, 0.93], [1, 0.84]];      // flat, torquey
const DIESEL = [[0, 0.7], [0.25, 1], [0.6, 0.95], [1, 0.7]];

// Handling (see CarPhysics.step): slipPeak / slipFall = front tyre curve (the slip angle of peak grip, and how much is
// left once sliding: 1.4 keeps ~85%, 1.25 ~92%), slipPeakR / slipFallR = the same for the rears (default: as the
// fronts), brakeF = front brake share, loadK = tyre load sensitivity, rollF = front share of the roll stiffness (the
// anti-roll bars; default: front weight share; higher = more understeer), suspension: track, rideHz [front, rear] (ride
// frequency), damp (damping ratio), rollGrad (degrees of roll per g), unsprung (kg per corner): see setupSuspension, drift = the drift system (throttle steers the slide, light counter-steer assist, slide limiter at
// driftMax rad), driftSlip = the rear wheelspin traction control's drift mode allows (slip ratio), driftPush = speed kept while drifting
// (m/s² at full throttle), driftCarve = how strongly a held drift is drawn round the corner
// Wheels (defaults in CarPhysics.step; all optional): wheelR m, wheelI kg m² per axle, engineI kg m² (its inertia through
// the gearbox), kappaPeak = slip ratio of peak grip, relaxX = tyre relaxation length m, slipFallX = how much grip a
// locked / spinning tyre keeps along the road (1.5 ≈ 75%), brakeK = brake torque (× the car's grip, 1.5 locks it at low
// speed), brakeKnee = where the proportioning valve starts cutting the rear pressure, handbrakeK = handbrake torque
// (× footbrake), engineBrake = engine braking off the throttle (× maxForce)
const gt = (o) => ({
  mass: 1080, a: 1.42, b: 1.28, cgh: 0.38, mu: 1.58, rearGrip: 1.05, kd: 0.85, aeroF: 0.42,
  drag: 0.46, roll: 18, power: 450000, maxForce: 13500, maxSteer: 0.42,
  gears: [0, 26, 37, 48, 59, 71, 88], redline: 8800, idle: 1400, torque: NA, drive: 0, box: 'sequential', shift: 0.06,
  slipFall: 1.4, slipPeak: 0.09, slipFallR: 1.25, slipPeakR: 0.1, brakeF: 0.68,
  track: 1.6, rideHz: [2.4, 2.6], damp: 0.65, rollGrad: 1.2, unsprung: 35, rollBias: 0.05, rcH: 0.05, antiDive: 0.35, antiSquat: 0.35, // (a '90s GT racer: stiff, low, little roll)
  drift: true, driftMax: 0, driftPush: 0.6, driftCarve: 0.15, gripK: 1.06, ...o,
});
const street = (o) => ({
  mass: 1450, a: 1.3, b: 1.4, cgh: 0.48, mu: 1.33, rearGrip: 1.03, kd: 0.14, aeroF: 0.45,
  drag: 0.4, roll: 22, power: 300000, maxForce: 11500, maxSteer: 0.48,
  gears: [0, 17, 28, 39, 51, 63, 78], redline: 7200, idle: 900, torque: NA, drive: 0, box: 'manual', shift: 0.16,
  slipFall: 1.4, slipPeak: 0.1, slipFallR: 1.22, slipPeakR: 0.11, brakeF: 0.7,
  track: 1.55, rideHz: [1.6, 1.8], damp: 0.65, rollGrad: 2.2, unsprung: 40, rcH: 0.08, antiDive: 0.3, antiSquat: 0.3, // (a road car: comfortable springs, leans in corners)
  drift: true, driftMax: 0, driftPush: 0.8, driftCarve: 0.2, gripK: 1.08, ...o,
});

// id -> { name, cls, sound (engine profile in engines.js), chassis (model builder key), spec, paint: can it be repainted,
//        credit id (models/cars/cars.json) }
export const CARS = {
  f1:     { name: 'Your F1 Car', cls: 'f1', sound: 'f1v6', chassis: 'custom', spec: CARSPEC, paint: true },
  svgp:   { name: 'SVGP Classic', cls: 'f1', sound: 'v10', chassis: 'svgp', spec: CARSPEC, paint: true },

  aventus: { name: 'Emery Aventus ’92', cls: 'gt1', sound: 'v8flat', glb: true, paint: true,
    spec: gt({ mass: 1120, power: 470000, kd: 0.8, drag: 0.44, torque: V8, a: 1.45, b: 1.3 }) },
  bx300:   { name: 'Horai BX300 ’96', cls: 'gt1', sound: 'v6na', glb: true, paint: true,
    spec: gt({ mass: 1040, power: 430000, kd: 0.95, drag: 0.47, mu: 1.61, redline: 9200, torque: NA, a: 1.36, b: 1.3 }) },
  rmx:     { name: 'Kineto RM-X ’94', cls: 'gt1', sound: 'i6turbo', glb: true, paint: false, bodyWheels: 'drop',
    spec: gt({ mass: 1180, power: 500000, kd: 0.7, drag: 0.43, torque: TURBO, drive: 0.3, redline: 8000, a: 1.4, b: 1.32, rearGrip: 1.02 }) },
  m1procar: { name: 'Bavaria M1 ProCar ’79', cls: 'gt1', sound: 'i6', glb: true, paint: false, // your Blender model: own photo livery + Light_* lamps
    spec: gt({ gears: [0, 28, 43, 57, 71, 88], box: 'manual', shift: 0.14, mass: 1020, power: 400000, kd: 0.75, drag: 0.45, torque: NA, redline: 9000, a: 1.3, b: 1.13, rearGrip: 1.07, brakeF: 0.62 }) },

  testarossa: { name: 'Testa Rossa', cls: 'street', sound: 'flat12', glb: true, paint: true,
    spec: street({ mass: 1510, power: 290000, cgh: 0.44, a: 1.4, b: 1.15, mu: 1.35, kd: 0.18, redline: 7400, gears: [0, 20, 34, 48, 63, 80], torque: NA }) },
  jsport:  { name: 'Kaze Sports Coupe', cls: 'street', sound: 'i4turbo', glb: true, paint: false,
    spec: street({ mass: 1400, power: 280000, torque: TURBO, a: 1.3, b: 1.3, redline: 7000, gears: [0, 19, 32, 45, 60, 78] }) },
  rs964:   { name: 'Neun Elf RS', cls: 'street', sound: 'flat6', glb: true, paint: true,
    spec: street({ mass: 1220, power: 195000, a: 1.5, b: 0.8, rearGrip: 1.08, cgh: 0.45, drag: 0.37, brakeF: 0.56, redline: 6900, gears: [0, 18, 30, 42, 55, 72] }) },
  gtr:     { name: 'Godzilla R35', cls: 'street', sound: 'v6turbo', glb: true, paint: false, archFix: true, cutout: 0.5,
    spec: street({ mass: 1740, power: 400000, torque: TURBO, drive: 0.4, mu: 1.37, kd: 0.2, maxForce: 16500, a: 1.3, b: 1.48, redline: 7000, gears: [0, 18, 30, 42, 54, 66, 86], box: 'dual-clutch', shift: 0.05 }) },
  mustang: { name: 'Pony GT 5.0', cls: 'street', sound: 'v8cross', glb: true, paint: true, bodyWheels: 'move', wheelW: 0.3,
    spec: street({ mass: 1690, power: 320000, torque: V8, a: 1.36, b: 1.36, mu: 1.28, rearGrip: 1.0, redline: 7000, gears: [0, 18, 29, 40, 52, 64, 76] }) },
  m5:      { name: 'Bavaria M5 E39', cls: 'street', sound: 'v8cross', glb: true, paint: false, straighten: true, // CC BY-NC-ND: shown unmodified, never repainted
    spec: street({ mass: 1720, power: 294000, torque: V8, a: 1.4, b: 1.44, cgh: 0.5, drag: 0.38, redline: 7000, gears: [0, 17, 28, 40, 52, 64, 78] }) },

  transit: { name: 'Works Van ’99', cls: 'fun', sound: 'diesel', glb: true, paint: false,
    spec: street({ mass: 1950, power: 95000, torque: DIESEL, drive: 0, cgh: 0.8, track: 1.7, rideHz: [1.3, 1.5], damp: 0.45, rollGrad: 5, unsprung: 55, rcH: 0.12, antiDive: 0.15, antiSquat: 0.15, mu: 1.05, kd: 0, drag: 0.62, a: 1.55, b: 1.45, maxSteer: 0.5, redline: 4600, idle: 800, shift: 0.22, gears: [0, 13, 22, 32, 41, 50] }) },
  hearse:  { name: 'Caprice Hearse', cls: 'fun', sound: 'v8truck', glb: true, paint: false,
    spec: street({ mass: 2250, power: 150000, torque: V8, cgh: 0.62, rideHz: [1.2, 1.4], damp: 0.45, rollGrad: 5.5, unsprung: 50, rcH: 0.12, antiDive: 0.15, antiSquat: 0.15, mu: 1.16, kd: 0, drag: 0.5, a: 1.6, b: 1.75, redline: 5200, idle: 700, gears: [0, 15, 27, 40, 55], box: 'automatic', shift: 0.3 }) },
};
// every spec gets its wheelbase + yaw inertia filled in
for (const c of Object.values(CARS)) {
  const s = c.spec;
  if (s.gripK && !s._gripped) { s.mu *= s.gripK; s._gripped = true; } // arcade grip: a touch more than the real car
  s.L = s.a + s.b;
  // yaw inertia: radius of gyration ~1.25 m for a road car (lower made them twitchy)
  if (!s.inertia) s.inertia = s.mass * 1.55;
}

// the car id a garage config drives ('custom' / 'svgp' = the F1 chassis)
export const carId = (cfg) => { const k = (cfg && cfg.chassis) || 'custom'; return k === 'custom' ? 'f1' : CARS[k] ? k : 'f1'; };
export const carOf = (cfg) => CARS[carId(cfg)];
export const classOf = (cfg) => carOf(cfg).cls;
export const carsInClass = (cls) => Object.keys(CARS).filter(k => CARS[k].cls === cls);
// the model key used by buildF1 for a car id
export const chassisKey = (id) => (id === 'f1' ? 'custom' : id);

// model credits (Sketchfab; the CC BY licences ask for attribution) - shown on the Credits screen
export const CAR_CREDITS = {
 "aventus": {
  "title": "PS1 GT1-Style Model - 1992 Emery Aventus",
  "author": "Aike",
  "license": "SKETCHFAB Standard"
 },
 "bx300": {
  "title": "PS1 GT1-Style Model - 1996 Horai BX300",
  "author": "Aike",
  "license": "SKETCHFAB Standard"
 },
 "rmx": {
  "title": "PS1 GT1-Style Model - 1994 Kineto RM-X",
  "author": "Aike",
  "license": "SKETCHFAB Standard"
 },
 "testarossa": {
  "title": "Low Poly PS1-Syle Testarossa",
  "author": "Namahoi",
  "license": "CC-BY-4.0"
 },
 "jsport": {
  "title": "Japanese Low-Poly Sports Car",
  "author": "egor.zuyev",
  "license": "CC-BY-4.0"
 },
 "rs964": {
  "title": "Porsche 911 964 Carrera RS Club Sport",
  "author": "egor.zuyev33",
  "license": "CC-BY-4.0"
 },
 "gtr": {
  "title": "Nissan GT-R (PS1 Low-Poly)",
  "author": "Evgeniy",
  "license": "CC-BY-NC-4.0"
 },
 "mustang": {
  "title": "2016 Ford Mustang GT 5.0",
  "author": "3DCars",
  "license": "CC-BY-4.0"
 },
 "m5": {
  "title": "BMW M5 (E39) [GT2/PSX Style]",
  "author": "Samuel M. Liberato",
  "license": "CC-BY-NC-ND-4.0"
 },
 "transit": {
  "title": "Ford Transit 1999",
  "author": "LEON elenaisakova248",
  "license": "CC-BY-4.0"
 },
 "hearse": {
  "title": "PSX Caprice Hearse",
  "author": "shinpansen",
  "license": "CC-BY-4.0"
 }
};
