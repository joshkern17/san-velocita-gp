// Car catalogue: every drivable car = one entry here (physics spec + model + class).
// The F1 cars use the chassis builders in carmodel.js / glbcar.js; the rest are baked models (models/cars/<id>.glb,
// made by tools/assets/bakecars.mjs) built by roadcar.js.
//
// Physics spec fields (see CarPhysics in car.js):
//   mass kg, inertia kg m², a/b = CG to front/rear axle (m), L = a + b, cgh = CG height
//   body [front, rear, half width]: the car's outline in plan from its centre of mass (m), as its model is drawn: what
//   it hits other cars and walls with (contact.js)
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
  club:   { label: 'Club',    short: 'CL' },
  shitbox: { label: 'Shitbox', short: 'SB' },
  fun:    { label: 'Utility', short: 'UT' },
};

// torque shapes (fraction of redline -> multiplier on the power-limited force)
const NA = [[0, 0.62], [0.35, 0.86], [0.7, 1], [0.9, 0.97], [1, 0.9]];        // high-revving naturally aspirated
const TURBO = [[0, 0.45], [0.25, 0.62], [0.4, 1], [0.75, 1], [1, 0.86]];    // lag, then a big mid-range
const V8 = [[0, 0.82], [0.3, 0.97], [0.6, 1], [0.85, 0.93], [1, 0.84]];      // flat, torquey
const BIGTURBO = [[0, 0.42], [0.35, 0.6], [0.5, 0.95], [0.6, 1], [0.9, 1], [1, 0.94]]; // one big turbo: late boost, held to redline
const DIESEL = [[0, 0.7], [0.25, 1], [0.6, 0.95], [1, 0.7]];

// Handling (see CarPhysics.step): slipPeak / slipFall = front tyre curve (the slip angle of peak grip, and how much is
// left once sliding: 1.4 keeps ~85%, 1.25 ~92%), slipPeakR / slipFallR = the same for the rears (default: as the
// fronts), brakeF = front brake share, loadK = tyre load sensitivity, rollF = front share of the roll stiffness (the
// anti-roll bars; default: front weight share; higher = more understeer), suspension: track, rideHz [front, rear] (ride
// frequency), damp (damping ratio), rollGrad (degrees of roll per g), unsprung (kg per corner): see setupSuspension, drift = the drift system (throttle steers the slide, light counter-steer assist, slide limiter at
// driftMax rad), driftSlip = the rear wheelspin traction control's drift mode allows (slip ratio)
// Suspension travel (CarPhysics.setupSuspension): travel [droop, bump] m from rest; solidR = a live rear axle (both rear
// wheels on one beam: they tilt together on screen)
// Wheels (defaults in CarPhysics.step; all optional): wheelR m, wheelI kg m² per axle, engineI kg m² (its inertia through
// the gearbox), kappaPeak = slip ratio of peak grip, relaxX = tyre relaxation length m, slipFallX = how much grip a
// locked / spinning tyre keeps along the road (1.5 ≈ 75%), brakeK = brake torque (× the car's grip, 1.5 locks it at low
// speed), brakeKnee = where the proportioning valve starts cutting the rear pressure, handbrakeK = handbrake torque
// (× footbrake), engineBrake = engine braking off the throttle (× maxForce)
// Differential: lsd = the driven axle's limited-slip diff [preload N·m, power lock, coast lock] (lock = share of the
// torque through it the clutches can pass between the wheels: 0 open, ~0.25 a road car's LSD, ~0.45 a race diff;
// coast lower = turns in more easily off the throttle; a "1.5-way" diff), lsdF = the front axle's on four-wheel drive
// Aero map (CarPhysics.aero): kd / aeroF are at the car's reference ride height (squashed by its downforce at ~200
// km/h); aeroH [front, rear] = share of each axle's downforce gained per cm lower (ground effect), aeroYaw = how fast
// downforce is lost as the car slides sideways (1 − aeroYaw·β²), wake [front, rear] = share of it lost right behind
// another car (dirty air; default physics.js WAKE)
const gt = (o) => ({
  mass: 1080, a: 1.42, b: 1.28, cgh: 0.38, mu: 1.58, rearGrip: 1.05, kd: 0.85, aeroF: 0.42,
  drag: 0.46, roll: 18, power: 450000, maxForce: 13500, maxSteer: 0.42,
  gears: [0, 26, 37, 48, 59, 71, 88], redline: 8800, idle: 1400, torque: NA, drive: 0, box: 'sequential', shift: 0.06,
  slipFall: 1.4, slipPeak: 0.09, slipFallR: 1.25, slipPeakR: 0.1, brakeF: 0.68,
  // (a '90s GT racer: stiff, low, little roll; the rear bar a little softer than the front's weight share, so the
  // outside rear isn't left carrying nearly all of the rear's load in a fast corner: with the diff sending the power to
  // it, the car stepped out on every straight and exit)
  travel: [0.07, 0.05],
  track: 1.6, rideHz: [2.4, 2.6], damp: 0.65, rollGrad: 1.2, unsprung: 35, rollBias: 0.12, rcH: 0.05, antiDive: 0.35, antiSquat: 0.35,
  // (a clutch diff locked by its preload and off the throttle, not harder on the power: these cars put a lot of their
  // weight on the outside rear in a fast corner, and a diff that sends the power there too spun them on the exits and
  // fishtailed them on the straights, traction control or not)
  lsd: [120, 0, 0.25],
  aeroH: [0.025, 0.012], aeroYaw: 3, // (splitter, flat floor, wing)
  wake: [0.3, 0.12], // (dirty air: CarPhysics.aero)
  floorH: 0.087, // (the floor off the road, m, as the body here moves: Realistic damage's floorCheck; stock keeps ~8 mm on a clean lap)
  ovh: [1.0, 0.95], // (body overhangs past the axles, m: contact.js bodyBox, for a car without its own body size)
  drift: true, driftMax: 0, ...o,
});
const street = (o) => ({
  mass: 1450, a: 1.3, b: 1.4, cgh: 0.48, mu: 1.33, rearGrip: 1.03, kd: 0.14, aeroF: 0.45,
  drag: 0.4, roll: 22, power: 300000, maxForce: 11500, maxSteer: 0.48,
  gears: [0, 17, 28, 39, 51, 63, 78], redline: 7200, idle: 900, torque: NA, drive: 0, box: 'manual', shift: 0.16,
  slipFall: 1.4, slipPeak: 0.1, slipFallR: 1.22, slipPeakR: 0.11, brakeF: 0.7,
  travel: [0.11, 0.08],
  track: 1.55, rideHz: [1.6, 1.8], damp: 0.65, rollGrad: 2.2, unsprung: 40, rcH: 0.08, antiDive: 0.3, antiSquat: 0.3, // (a road car: comfortable springs, leans in corners)
  lsd: [50, 0.3, 0.15], // (a performance road car's clutch LSD)
  aeroH: [0.01, 0.005], aeroYaw: 2, // (a little lip and spoiler)
  floorH: 0.17, // (the floor off the road, m, as the body here moves: Realistic damage's floorCheck; stock keeps ~8 mm on a clean lap)
  ovh: [0.9, 0.9],
  drift: true, driftMax: 0, ...o,
});

// id -> { name, cls, sound (engine profile in engines.js), chassis (model builder key), spec, paint: can it be repainted,
//        credit id (models/cars/cars.json) }
export const CARS = {
  f1:     { name: 'Your F1 Car', cls: 'f1', sound: 'f1v6', chassis: 'custom', spec: CARSPEC, paint: true },
  svgp:   { name: 'SVGP Classic', cls: 'f1', sound: 'v10', chassis: 'svgp', spec: CARSPEC, paint: true },

  m1procar: { name: 'Bavaria M1 ProCar ’79', cls: 'gt1', sound: 'i6', glb: true, paint: true, livery: true, // your Blender model: white photo, wears your full livery (see roadcar.js) + Light_* lamps
    liveryLabels: { topNumber: [0.78, 0.5], sideNumber: [0.55, 0.5], sideSponsor: [0.55, 0.8] },
    spec: gt({ body: [2.21, 2.16, 0.89], gears: [0, 28, 43, 57, 71, 88], box: 'manual', shift: 0.14, mass: 1020, power: 400000, kd: 0.75, drag: 0.45, torque: NA, redline: 9000, a: 1.3, b: 1.13, rearGrip: 1.07, brakeF: 0.62 }) },
  // your Blender model (Group 5, '78 long tail): white photo, wears your full livery. The M1's opposite at the same pace:
  // one big turbo (late boost, held to redline), a long slow 4-speed, the engine out back (pushes in, can step out on a
  // lift), a slippery long tail under a big wing: fast on the straights, harder work out of slow corners
  porsche935: { name: 'Porsche 935', cls: 'gt1', sound: 'flat6turbo', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.78, 0.5], sideNumber: [0.55, 0.5], sideSponsor: [0.55, 0.8] },
    spec: gt({ body: [2.32, 2.52, 0.99], gears: [0, 33, 53, 73, 93], box: 'manual', shift: 0.18, mass: 1030, power: 480000, kd: 0.9, drag: 0.43, torque: BIGTURBO, redline: 7800, a: 1.44, b: 0.96, rearGrip: 1.1, brakeF: 0.56 }) },
  // your Blender model (E46 M3 GTR, white photo, full livery): the 2001 race car (the P60 4.0 V8, 1100 kg, a six-speed
  // sequential), lifted to GT1 pace as the M1 ProCar is: the real one made about 330 kW and raced a class below, which
  // here laps 3.7% off the GT1 field. At 460 kW it's mid-field (with the Aventus). The long wheelbase and even weight
  // make it steady rather than sharp. rev: bumped when a car's spec changes enough that the AI's learned lines for it
  // should be thrown away
  m3gtr: { name: 'BMW M3 GTR', cls: 'gt1', sound: 'v8cross', glb: true, paint: true, livery: true, rev: 2,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: gt({ body: [2.21, 2.37, 0.93], mass: 1100, power: 460000, kd: 0.85, drag: 0.46, torque: NA, a: 1.37, b: 1.37 }) },

  // your Blender model (Zakspeed Ford Capri Turbo, Group 5, white photo, full livery): built from a high-poly model with
  // the low-poly pipeline (output/hd-lowpoly). A short, light front-engined car with a tiny turbo four that's all
  // or nothing: the lightest of the GT1 cars, a late, violent boost and a short wheelbase that turns in hard but
  // wants a gentle right foot out of slow corners
  capri: { name: 'Ford Capri Turbo', cls: 'gt1', sound: 'i4turbo', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.7, 0.5], sideNumber: [0.5, 0.5], sideSponsor: [0.5, 0.8] },
    spec: gt({ body: [2.38, 2.47, 1.04], gears: [0, 30, 45, 59, 72, 85], box: 'manual', shift: 0.16, mass: 960, power: 440000, kd: 0.9, drag: 0.46, torque: BIGTURBO, redline: 9000, a: 1.2, b: 1.38, rearGrip: 1.06, brakeF: 0.6 }) },
  // your Blender model (Ferrari F40 LM, the racing F40, with the LB-Works kit, modelled by hand over the white reference
  // sheet, full livery): the twin-turbo flat-plane V8 behind the driver, a five-speed manual and turbos that arrive all
  // at once. The real LM made up to ~530 kW on full boost; here it's held to 470 kW, as BPR GT1 restrictors held the
  // F40 GTE, so it's mid-field. Weight over the rear (42/58) puts the power down well but lets it rotate on a lift; the
  // long rear overhang and big wing keep it steady at speed
  f40: { name: 'Ferrari F40 LM', cls: 'gt1', sound: 'v8flat', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.8, 0.5], sideNumber: [0.52, 0.57], sideSponsor: [0.52, 0.82] },
    spec: gt({ body: [2.57, 1.91, 1.05], gears: [0, 31, 48, 64, 79, 93], box: 'manual', shift: 0.15, mass: 1060, power: 470000, kd: 0.9, drag: 0.44, torque: TURBO, redline: 7800, a: 1.43, b: 1.03, brakeF: 0.58 }) },

  testarossa: { name: 'Testa Rossa', cls: 'street', sound: 'flat12', glb: true, paint: true,
    spec: street({ body: [2.24, 2.27, 1.0], lsd: [50, 0.4, 0.2], mass: 1510, power: 290000, cgh: 0.44, a: 1.4, b: 1.15, mu: 1.35, kd: 0.18, redline: 7400, gears: [0, 20, 34, 48, 63, 80], torque: NA }) },
  jsport:  { name: 'Kaze Sports Coupe', cls: 'street', sound: 'i4turbo', glb: true, paint: false,
    spec: street({ body: [2.22, 2.25, 1.0], lsd: [80, 0.45, 0.3], mass: 1400, power: 280000, torque: TURBO, a: 1.3, b: 1.3, redline: 7000, gears: [0, 19, 32, 45, 60, 78] }) },
  rs964:   { name: 'Neun Elf RS', cls: 'street', sound: 'flat6', glb: true, paint: true,
    spec: street({ body: [2.12, 2.15, 0.92], lsd: [60, 0.4, 0.4], mass: 1220, power: 195000, a: 1.5, b: 0.8, rearGrip: 1.08, cgh: 0.45, drag: 0.37, brakeF: 0.56, redline: 6900, gears: [0, 18, 30, 42, 55, 72] }) },
  mustang: { name: 'Pony GT 5.0', cls: 'street', sound: 'v8cross', glb: true, paint: true, bodyWheels: 'move', wheelW: 0.3,
    spec: street({ body: [2.4, 2.42, 1.0], lsd: [20, 0.43, 0.43], mass: 1690, power: 320000, torque: V8, a: 1.36, b: 1.36, mu: 1.28, rearGrip: 1.0, redline: 7000, gears: [0, 18, 29, 40, 52, 64, 76] }) },
  m5:      { name: 'Bavaria M5 E39', cls: 'street', sound: 'v8cross', glb: true, paint: false, straighten: true, // CC BY-NC-ND: shown unmodified, never repainted
    spec: street({ body: [2.39, 2.42, 0.96], lsd: [40, 0.25, 0.25], mass: 1720, power: 294000, torque: V8, a: 1.4, b: 1.44, cgh: 0.5, drag: 0.38, redline: 7000, gears: [0, 17, 28, 40, 52, 64, 78] }) },
  // your Blender model (R34 GT-R V-Spec, white photo, full livery). RB26DETT twin-turbo six: "280 PS" on paper, ~330 in
  // truth (the makers' gentlemen's agreement); 1560 kg, 55% on the nose. ATTESA E-TS: rear-driven until the rears slip,
  // then up to half to the front, so mostly rear with a pull out of slow corners; active rear LSD, a Getrag 6-speed.
  // Down on power to the rest of the class, it makes it up on traction and the V-Spec's diffuser
  r34: { name: 'Nissan Skyline GT-R R34', cls: 'street', sound: 'i6turbo', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: street({ body: [2.28, 2.32, 0.9], mass: 1560, a: 1.2, b: 1.465, cgh: 0.47, power: 245000, maxForce: 14000, torque: TURBO, drive: 0.2,
      lsd: [60, 0.35, 0.25], lsdF: [0, 0, 0], mu: 1.35, rearGrip: 1.06, kd: 0.18, drag: 0.39, track: 1.485, rollGrad: 1.9, brakeF: 0.72,
      redline: 8000, gears: [0, 18, 30, 42, 54, 65, 75] }) },

  // your Blender model (EK hatch, white photo, full livery). A tired base car, not the Type R in the photo: ~120 hp
  // D16 on its third owner, front-wheel drive with an open diff (the inside front spins up out of slow corners), 61%
  // of its weight on the nose, worn dampers, old tyres. No drift mode: a front-driver can't steer a slide on the throttle
  civic: { name: 'Honda Civic EK', cls: 'shitbox', sound: 'i4', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: street({ body: [2.2, 1.99, 0.86], mass: 1080, a: 1.0, b: 1.56, cgh: 0.5, power: 80000, maxForce: 8200, torque: NA, drive: 1, lsd: [0, 0, 0],
      mu: 1.22, rearGrip: 1.02, kd: 0.05, drag: 0.38, maxSteer: 0.5, redline: 7200, idle: 850, gears: [0, 14, 24, 34, 44, 54], shift: 0.18,
      brakeF: 0.74, track: 1.47, rideHz: [1.5, 1.6], damp: 0.45, rollGrad: 3, unsprung: 32, aeroH: [0, 0], aeroYaw: 1, drift: false }) },

  // Spec Miata (the club rung: every car the same). A ready-made low-poly model (tools/cars/miata.py: real size, the
  // paint baked white so it takes liveries). An NA on a club racer's budget: the 1.6 (~115 hp), 5-speed, a Torsen-style
  // diff, coilovers, a cage, racing tyres; 52% on the nose. Light and honest: it rewards carrying speed, not power
  miata: { name: 'Mazda MX-5 Miata NA', cls: 'club', sound: 'i4', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: street({ body: [1.91, 2.06, 0.86], mass: 1040, a: 1.115, b: 1.207, cgh: 0.44, power: 85000, maxForce: 7600, torque: NA, drive: 0, lsd: [30, 0.25, 0.15],
      mu: 1.4, rearGrip: 1.03, kd: 0.06, drag: 0.4, maxSteer: 0.5, redline: 7200, idle: 850, gears: [0, 16, 27, 38, 51, 62], shift: 0.15,
      brakeF: 0.68, track: 1.41, rideHz: [1.9, 2.0], damp: 0.6, rollGrad: 1.6, unsprung: 30, aeroH: [0, 0], aeroYaw: 1, floorH: 0.12 }) },

  transit: { name: 'Works Van ’99', cls: 'fun', sound: 'diesel', glb: true, paint: false,
    spec: street({ body: [2.4, 2.43, 1.05], lsd: [0, 0, 0], mass: 1950, power: 95000, torque: DIESEL, drive: 0, cgh: 0.8, track: 1.7, rideHz: [1.3, 1.5], travel: [0.15, 0.14], solidR: true, damp: 0.45, rollGrad: 5, unsprung: 55, rcH: 0.12, antiDive: 0.15, antiSquat: 0.15, mu: 1.05, kd: 0, drag: 0.62, a: 1.55, b: 1.45, maxSteer: 0.5, redline: 4600, idle: 800, shift: 0.22, gears: [0, 13, 22, 32, 41, 50] }) },
  hearse:  { name: 'Caprice Hearse', cls: 'fun', sound: 'v8truck', glb: true, paint: false,
    spec: street({ body: [2.8, 2.83, 1.0], lsd: [0, 0, 0], mass: 2250, power: 150000, torque: V8, cgh: 0.62, rideHz: [1.2, 1.4], travel: [0.15, 0.14], solidR: true, damp: 0.45, rollGrad: 5.5, unsprung: 50, rcH: 0.12, antiDive: 0.15, antiSquat: 0.15, mu: 1.16, kd: 0, drag: 0.5, a: 1.6, b: 1.75, redline: 5200, idle: 700, gears: [0, 15, 27, 40, 55], box: 'automatic', shift: 0.3 }) },
};
// archived (2026-10-12): the GT1 cars that aren't our own models. Out of every menu, grid and career; their specs and
// models/cars/*.glb are kept so they can come back (move an entry back into CARS and out of RETIRED)
export const ARCHIVED = {
  aventus: { name: 'Emery Aventus ’92', cls: 'gt1', sound: 'v8flat', glb: true, paint: true,
    spec: gt({ body: [2.4, 2.42, 0.98], mass: 1120, power: 470000, kd: 0.8, drag: 0.44, torque: V8, a: 1.45, b: 1.3 }) },
  bx300:   { name: 'Horai BX300 ’96', cls: 'gt1', sound: 'v6na', glb: true, paint: true,
    spec: gt({ body: [2.25, 2.27, 0.95], mass: 1040, power: 430000, kd: 0.95, drag: 0.47, mu: 1.61, redline: 9200, torque: NA, a: 1.36, b: 1.3 }) },
  rmx:     { name: 'Kineto RM-X ’94', cls: 'gt1', sound: 'i6turbo', glb: true, paint: false, bodyWheels: 'drop',
    spec: gt({ body: [2.2, 2.22, 1.0], mass: 1180, power: 500000, kd: 0.7, drag: 0.43, torque: TURBO, drive: 0.2, redline: 8000, a: 1.4, b: 1.32, rearGrip: 1.02 }) },
};
// every spec gets its wheelbase + yaw inertia filled in
for (const c of [...Object.values(CARS), ...Object.values(ARCHIVED)]) {
  const s = c.spec;
  s.L = s.a + s.b;
  // yaw inertia: radius of gyration ~1.25 m for a road car (lower made them twitchy)
  if (!s.inertia) s.inertia = s.mass * 1.55;
}

// the car id a garage config drives ('custom' / 'svgp' = the F1 chassis)
// cars taken out of the game -> the car that replaced them (saved settings and careers that still name them)
// (the archived GT1 cars go to the custom car nearest in character: the Aventus' V8 to the F40, the light revvy BX300
// to the M1, the turbo RM-X to the 935)
export const RETIRED = { gtr: 'm3gtr', aventus: 'f40', bx300: 'm1procar', rmx: 'porsche935' };
export const carId = (cfg) => { const c = (cfg && cfg.chassis) || 'custom', k = RETIRED[c] || c; return k === 'custom' ? 'f1' : CARS[k] ? k : 'f1'; };
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
