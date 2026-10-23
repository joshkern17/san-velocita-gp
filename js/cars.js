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

// (col: the class's colour, on the car select's tabs and a multiclass race's timing tower)
export const CLASSES = {
  f1:     { label: 'Formula',  short: 'F1', col: '#e1261c' },
  groupc: { label: 'Group C', short: 'GPC', col: '#2fb8c8' },
  gt1:    { label: 'GT1 ’90s', short: 'GT1', col: '#2a7fd0' },
  gt2:    { label: 'GT2 ’90s', short: 'GT2', col: '#7a4fc0' },
  street: { label: 'Street',  short: 'ST', col: '#e8b13a' },
  club:   { label: 'Club',    short: 'CL', col: '#2fa59a' },
  shitbox: { label: 'Shitbox', short: 'SB', col: '#a8743a' },
  fun:    { label: 'Utility', short: 'UT', col: '#4f9a3c' },
  sprint: { label: 'Sprint Car', short: 'SPR', col: '#d4582a' },
};

// torque shapes (fraction of redline -> multiplier on the power-limited force)
const NA = [[0, 0.62], [0.35, 0.86], [0.7, 1], [0.9, 0.97], [1, 0.9]];        // high-revving naturally aspirated
const TURBO = [[0, 0.45], [0.25, 0.62], [0.4, 1], [0.75, 1], [1, 0.86]];    // lag, then a big mid-range
const V8 = [[0, 0.82], [0.3, 0.97], [0.6, 1], [0.85, 0.93], [1, 0.84]];      // flat, torquey
const BIGV10 = [[0, 0.6], [0.2, 0.9], [0.4, 1], [0.85, 0.96], [1, 0.88]]; // a big lazy V10: torque from low down, but the slicks limit a standing start like the rest
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
// a '90s GT2 car: a race car built from a road car (the GT racer's stiff low build, its wing and slicks), with the
// power and the downforce a class below GT1: between the street cars and GT1 on pace
const gt2 = (o) => gt({ mass: 1150, power: 310000, mu: 1.5, kd: 0.55, drag: 0.42, maxForce: 12000, rideHz: [2.2, 2.4], rollGrad: 1.4,
  gears: [0, 26, 38, 50, 62, 73, 82], redline: 8000, ...o });

// a Group C prototype ('82-'92 sports car racing): a light ground-effect car, the floor making most of its downforce,
// with the power of the GT1 cars and a lot less weight: between GT1 and the Formula cars on pace. Stiff and low, so the
// ride height matters (aeroH) and it loses grip sooner when sliding (aeroYaw); a five-speed manual
const gc = (o) => gt({ mass: 880, power: 510000, mu: 1.66, kd: 1.6, aeroF: 0.42, drag: 0.6, maxForce: 14000, cgh: 0.32,
  rideHz: [3.2, 3.5], rollGrad: 0.8, travel: [0.06, 0.045], aeroH: [0.035, 0.018], aeroYaw: 3.5, wake: [0.25, 0.1],
  gears: [0, 33, 49, 64, 79, 95], box: 'manual', shift: 0.14, redline: 8200, ...o });

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
//        credit id (models/cars/cars.json), smooth: shade auto smooth at this angle (roadcar.js) }
export const CARS = {
  f1:     { name: 'Your F1 Car', cls: 'f1', sound: 'f1v6', chassis: 'custom', spec: CARSPEC, paint: true },
  svgp:   { name: 'SVGP Classic', cls: 'f1', sound: 'v10', chassis: 'svgp', spec: CARSPEC, paint: true },

  // The GT1 cars are detailed Sketchfab models (placeholders until remodelled: see models/cars/cars.json for each
  // source + licence) put in the game by tools/cars/hdcar.py: the bodywork painted white on its own unwrap (material
  // Livery, ambient occlusion baked in) so it takes full liveries; trim, glass, wheels and cockpit keep their own
  // textures. Where a low-poly car came before, the model's axles sit on its axles and the spec is unchanged (the
  // low-poly cars: ARCHIVED *_lp). 150k-700k triangles each.
  // The M1: a high-revving straight six, a short five-speed, light and nimble. 450 kW (the Group 5 M1s ran far more:
  // on 400 and the least downforce it was the class's slowest by 3%)
  m1procar: { name: 'BMW M1 Turbo', cls: 'gt1', sound: 'i6', glb: true, paint: true, livery: true, smooth: 30, rev: 1,
    liveryLabels: { topNumber: [0.78, 0.5], sideNumber: [0.55, 0.5], sideSponsor: [0.55, 0.8] },
    spec: gt({ body: [2.21, 2.16, 0.89], gears: [0, 28, 43, 57, 71, 88], box: 'manual', shift: 0.14, mass: 1020, power: 450000, kd: 0.85, drag: 0.45, torque: NA, redline: 9000, a: 1.3, b: 1.13, rearGrip: 1.07, brakeF: 0.62 }) },
  // The 935 K3 (Group 5 long tail): the M1's opposite at the same pace: one big turbo (late boost, held to redline), a
  // long slow 4-speed, the engine out back (pushes in, can step out on a lift), a slippery long tail under a big wing:
  // fast on the straights, harder work out of slow corners (510 kW: the real K3 made ~600; the long gears cost it on a
  // tight road like Sakura Pass and win it back on the fast ones)
  porsche935: { name: 'Porsche 935 K3', cls: 'gt1', sound: 'flat6turbo', glb: true, paint: true, livery: true, smooth: 30, rev: 1,
    liveryLabels: { topNumber: [0.78, 0.5], sideNumber: [0.55, 0.5], sideSponsor: [0.55, 0.8] },
    spec: gt({ body: [2.32, 2.52, 0.99], gears: [0, 33, 53, 73, 93], box: 'manual', shift: 0.18, mass: 1030, power: 510000, kd: 0.9, drag: 0.43, torque: BIGTURBO, redline: 7800, a: 1.44, b: 0.96, rearGrip: 1.1, brakeF: 0.56 }) },
  // The Capri: a short, light front-engined car with a tiny turbo four that's all or nothing: the lightest of the GT1
  // cars, a late, violent boost and a short wheelbase that turns in hard but wants a gentle right foot out of slow corners.
  // Built like the Group 5 Capris: the engine set back (49% on the rear) and much wider rear tyres than fronts
  // (rearGrip 1.12), traction capped at 12.5 kN. (At 47% / 1.06 / 13.5 kN it had the most drive per kg on its rears of
  // any car: it spun ~2 s on every start and sat on the edge of grip even on a gentle exit)
  capri: { name: 'Ford Capri Group B', cls: 'gt1', sound: 'i4turbo', glb: true, paint: true, livery: true, smooth: 30, rev: 1,
    liveryLabels: { topNumber: [0.7, 0.5], sideNumber: [0.5, 0.5], sideSponsor: [0.5, 0.8] },
    spec: gt({ body: [2.38, 2.47, 1.04], gears: [0, 30, 45, 59, 72, 85], box: 'manual', shift: 0.16, mass: 960, power: 425000, kd: 0.9, drag: 0.46, torque: BIGTURBO, redline: 9000, a: 1.26, b: 1.32, rearGrip: 1.12, maxForce: 12500, brakeF: 0.6 }) },
  // The F40 (LM, LB-Works kit): the twin-turbo flat-plane V8 behind the driver, a five-speed manual and turbos that
  // arrive all at once. The real LM made up to ~530 kW on full boost; here 520 kW and the LB wing's extra downforce
  // (on 470 it was a class's-worth slow), so it's mid-field. Weight over the rear (42/58) puts the power down well but lets it rotate on a
  // lift; the long rear overhang and big wing keep it steady at speed (aeroF 0.38: the wing's share over the rear. On
  // the class's 0.42, the same split as its weight, the rear let go on a quick turn-in flat out and spun it with the aids off)
  f40: { name: 'Ferrari F40 LB-Works', cls: 'gt1', sound: 'v8flat', glb: true, paint: true, livery: true, smooth: 30, rev: 3,
    liveryLabels: { topNumber: [0.8, 0.5], sideNumber: [0.52, 0.57], sideSponsor: [0.52, 0.82] },
    spec: gt({ body: [2.57, 1.91, 1.05], gears: [0, 31, 48, 64, 79, 93], box: 'manual', shift: 0.15, mass: 1060, power: 520000, kd: 0.95, drag: 0.44, aeroF: 0.38, torque: TURBO, redline: 7800, a: 1.43, b: 1.03, brakeF: 0.58 }) },
  // The '97 CLK GTR: the purpose-built one, a 6.0 V12 (~440 kW, its real ~600 hp) behind the driver, a six-speed
  // sequential and the most downforce in the class: the long wheelbase (2.67 m) and 44/56 weight make it planted and
  // quick through fast corners rather than nimble in slow ones. Body / a / b measured off the model (hdcar.py, CG 0.56).
  // (On 470 kW and kd 1.05, with the only quick-shifting box in the class, it was quickest on every circuit by 1.5%)
  clkgtr: { name: 'Mercedes CLK GTR', cls: 'gt1', sound: 'flat12', glb: true, paint: true, livery: true, smooth: 30, rev: 1,
    liveryLabels: { topNumber: [0.78, 0.5], sideNumber: [0.45, 0.66], sideSponsor: [0.45, 0.85] }, // (lower than the others: the antenna makes the side panel 1.5 m tall)
    spec: gt({ body: [2.63, 2.26, 1.0], gears: [0, 30, 43, 55, 67, 78, 88], box: 'sequential', shift: 0.06, mass: 1050, power: 440000, kd: 1.0, drag: 0.46, aeroF: 0.4, torque: NA, redline: 8000, a: 1.495, b: 1.175, rearGrip: 1.08, brakeF: 0.58 }) },

  // ---- Group C ----
  // Sketchfab models through tools/cars/hdcar.py like the GT1 cars (white Livery body, unseen parts culled); body / a / b
  // measured off each model (CG = the share of the wheelbase behind the front axle)
  // The 962C: the class's benchmark, the 2.8 flat six's turbo (late boost) and a long tail: quick on the straights
  p962c: { name: 'Porsche 962C', cls: 'groupc', sound: 'flat6turbo', glb: true, paint: true, livery: true, smooth: 30,
    liveryLabels: { topNumber: [0.75, 0.5], sideNumber: [0.5, 0.6], sideSponsor: [0.5, 0.85] },
    spec: gc({ body: [2.4, 2.37, 1.01], a: 1.578, b: 1.19, mass: 900, power: 500000, torque: TURBO, rearGrip: 1.08, brakeF: 0.56 }) }, // (CG 0.57)
  // The 787B: the four-rotor (no turbo: power everywhere, revs to 9000) in the lightest car; less top speed. (Its sound
  // for now the flat-plane V8's: a four-rotor fires as often as an eight)
  mazda787b: { name: 'Mazda 787B', cls: 'groupc', sound: 'v8flat', glb: true, paint: true, livery: true, smooth: 30,
    liveryLabels: { topNumber: [0.75, 0.5], sideNumber: [0.5, 0.6], sideSponsor: [0.5, 0.85] },
    spec: gc({ body: [2.46, 2.32, 1.03], a: 1.503, b: 1.181, mass: 845, power: 480000, torque: NA, redline: 9000, gears: [0, 32, 47, 61, 75, 91], rearGrip: 1.07, brakeF: 0.57 }) }, // (CG 0.56)
  // The XJR-9: the 7.0 V12, torque from nowhere and the most power, the heaviest and the longest: a long-legged car
  // for fast circuits. (Traction capped at 12.5 kN: the V12's low-down torque spun the rears off the line past traction
  // control's reach)
  xjr9: { name: 'Jaguar XJR-9', cls: 'groupc', sound: 'flat12', glb: true, paint: true, livery: true, smooth: 30, rev: 1,
    liveryLabels: { topNumber: [0.75, 0.5], sideNumber: [0.5, 0.6], sideSponsor: [0.5, 0.85] },
    spec: gc({ body: [2.67, 2.24, 1.02], a: 1.588, b: 1.198, mass: 910, power: 530000, maxForce: 12500, torque: V8, redline: 7200, gears: [0, 34, 51, 67, 82, 97], rearGrip: 1.08, brakeF: 0.56 }) }, // (CG 0.57)

  // ---- GT2 ----
  // your Blender model (E46 M3 GTR, white photo, full livery): the 2001 ALMS GT car, back in its own class (it was
  // lifted to 460 kW to race in GT1 until GT2 existed). The P60 4.0 V8 at ~335 kW, 1150 kg, a six-speed sequential;
  // the long wheelbase and even weight make it steady rather than sharp: the class's benchmark on power.
  // rev: bumped when a car's spec changes enough that the AI's learned lines for it should be thrown away
  m3gtr: { name: 'BMW M3 GTR', cls: 'gt2', sound: 'v8cross', glb: true, paint: true, livery: true, rev: 3,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: gt2({ body: [2.21, 2.37, 0.93], mass: 1150, power: 325000, kd: 0.6, drag: 0.44, torque: NA, a: 1.37, b: 1.37 }) },
  // the 964 RS's model (for now: a race body kit and wing to come) as the '93 Carrera RSR 3.8: the 3.8 flat six
  // (~280 kW), 1120 kg, a five-speed manual. The engine behind the rear axle: it puts the power down out of slow
  // corners like nothing else in the class, and wants patience on turn-in and a smooth lift
  rsr964: { name: 'Porsche 911 Carrera RSR 3.8 (964)', cls: 'gt2', sound: 'flat6', glb: true, paint: true,
    spec: gt2({ body: [2.12, 2.15, 0.92], mass: 1100, power: 310000, kd: 0.62, mu: 1.56, drag: 0.41, torque: NA, a: 1.385, b: 0.885, cgh: 0.42, rearGrip: 1.15,
      brakeF: 0.56, redline: 7500, gears: [0, 27, 40, 53, 66, 78] }) },
  // your R34 GT-R model (for now: a race body kit and wing to come) as a GT2 racer: the RB26 turned up to ~320 kW,
  // stripped to 1260 kg, the ATTESA kept (mostly rear-driven, up to a fifth to the front), a six-speed sequential.
  // The heaviest in the class and the nose-heaviest: it makes it up out of slow corners and in the wet
  r34gt2: { name: 'Nissan Skyline GT-R R34 GT2', cls: 'gt2', sound: 'i6turbo', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: gt2({ body: [2.28, 2.32, 0.9], mass: 1250, power: 340000, kd: 0.57, drag: 0.43, torque: TURBO, a: 1.2, b: 1.465, cgh: 0.42, drive: 0.2,
      maxForce: 13500, track: 1.52, brakeF: 0.66, redline: 8000 }) },

  // your Blender model (McLaren F1 GTR '95, modelled by hand over the white reference sheet, full livery, its own black
  // wing). In period it was a GT1 car (it won Le Mans outright in '95); here it's restricted to GT2 numbers like the
  // others: the BMW S70 V12 held to ~310 kW on the restrictor, ballasted to 1100 kg, a six-speed sequential. Engine
  // behind the driver (42/58): it puts the power down well and turns in sharply, the short wheelbase keeps it lively
  f1gtr: { name: 'McLaren F1 GTR', cls: 'gt2', sound: 'flat12', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.8, 0.5], sideNumber: [0.52, 0.57], sideSponsor: [0.52, 0.82] },
    spec: gt2({ body: [2.58, 1.67, 0.91], mass: 1100, power: 310000, kd: 0.6, drag: 0.42, torque: NA, a: 1.545, b: 1.119, redline: 7500 }) },

  // your Blender model (Dodge Viper GTS-R, '98-'00 Le Mans GTS class winner, modelled by hand over the white reference
  // sheet, full livery, a simplified copy of its curved wing on two stands and its finned diffuser). The 8.0 pushrod V10
  // held to ~345 kW on the restrictor, 1250 kg, a six-speed sequential. Engine in front but behind the axle (50/50):
  // torque everywhere, so it drives out of slow corners on the throttle; the heaviest in the class with the R34, and
  // the long nose and wide brick body cost it on the straights
  viper: { name: 'Dodge Viper GTS-R', cls: 'gt2', sound: 'v10big', glb: true, paint: true, livery: true, rev: 1,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.45, 0.55], sideSponsor: [0.45, 0.8] },
    spec: gt2({ body: [2.16, 2.23, 0.94], mass: 1250, power: 355000, kd: 0.6, drag: 0.45, torque: BIGV10, a: 1.238, b: 1.238, cgh: 0.4,
      track: 1.55, maxForce: 13500, brakeF: 0.62, redline: 6500, idle: 1000, gears: [0, 27, 39, 51, 63, 74, 84] }) },

  testarossa: { name: 'Testa Rossa', cls: 'street', sound: 'flat12', glb: true, paint: true,
    spec: street({ body: [2.24, 2.27, 1.0], lsd: [50, 0.4, 0.2], mass: 1510, power: 290000, cgh: 0.44, a: 1.4, b: 1.15, mu: 1.35, kd: 0.18, redline: 7400, gears: [0, 20, 34, 48, 63, 80], torque: NA }) },
  jsport:  { name: 'Kaze Sports Coupe', cls: 'street', sound: 'i4turbo', glb: true, paint: false,
    spec: street({ body: [2.22, 2.25, 1.0], lsd: [80, 0.45, 0.3], mass: 1400, power: 280000, torque: TURBO, a: 1.3, b: 1.3, redline: 7000, gears: [0, 19, 32, 45, 60, 78] }) },
  rs964:   { name: 'Porsche 911 Carrera RS (964)', cls: 'street', sound: 'flat6', glb: true, paint: true,
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
      brakeF: 0.74, track: 1.47, rideHz: [1.5, 1.6], damp: 0.45, rollGrad: 3, unsprung: 32, aeroH: [0, 0], aeroYaw: 1, drift: false,
      tyreT: -25 }) }, // (cheap road-legal track tyres: they work cooler, a light slow car can't heat a GT's: physics.js tyreHeat)

  // Spec Miata (the club rung: every car the same). A ready-made low-poly model (tools/cars/miata.py: real size, the
  // paint baked white so it takes liveries). An NA on a club racer's budget: the 1.6 (~115 hp), 5-speed, a Torsen-style
  // diff, coilovers, a cage, racing tyres; 52% on the nose. Light and honest: it rewards carrying speed, not power
  miata: { name: 'Mazda MX-5 Miata NA', cls: 'club', sound: 'i4', glb: true, paint: true, livery: true,
    liveryLabels: { topNumber: [0.42, 0.5], sideNumber: [0.5, 0.55], sideSponsor: [0.5, 0.8] },
    spec: street({ body: [1.91, 2.06, 0.86], mass: 1040, a: 1.115, b: 1.207, cgh: 0.44, power: 85000, maxForce: 7600, torque: NA, drive: 0, lsd: [30, 0.25, 0.15],
      mu: 1.4, rearGrip: 1.03, kd: 0.06, drag: 0.4, maxSteer: 0.5, redline: 7200, idle: 850, gears: [0, 16, 27, 38, 51, 62], shift: 0.15,
      brakeF: 0.68, track: 1.41, rideHz: [1.9, 2.0], damp: 0.6, rollGrad: 1.6, unsprung: 30, aeroH: [0, 0], aeroYaw: 1, floorH: 0.12,
      tyreT: -25 }) }, // (club racing tyres work cooler: a Miata at the limit runs them ~55-80 °C, a GT's best is 95. physics.js tyreHeat)

  transit: { name: 'Works Van ’99', cls: 'fun', sound: 'diesel', glb: true, paint: false,
    spec: street({ body: [2.4, 2.43, 1.05], lsd: [0, 0, 0], mass: 1950, power: 95000, torque: DIESEL, drive: 0, cgh: 0.8, track: 1.7, rideHz: [1.3, 1.5], travel: [0.15, 0.14], solidR: true, damp: 0.45, rollGrad: 5, unsprung: 55, rcH: 0.12, antiDive: 0.15, antiSquat: 0.15, mu: 1.05, kd: 0, drag: 0.62, a: 1.55, b: 1.45, maxSteer: 0.5, redline: 4600, idle: 800, shift: 0.22, gears: [0, 13, 22, 32, 41, 50] }) },
  hearse:  { name: 'Caprice Hearse', cls: 'fun', sound: 'v8truck', glb: true, paint: false,
    spec: street({ body: [2.8, 2.83, 1.0], lsd: [0, 0, 0], mass: 2250, power: 150000, torque: V8, cgh: 0.62, rideHz: [1.2, 1.4], travel: [0.15, 0.14], solidR: true, damp: 0.45, rollGrad: 5.5, unsprung: 50, rcH: 0.12, antiDive: 0.15, antiSquat: 0.15, mu: 1.16, kd: 0, drag: 0.5, a: 1.6, b: 1.75, redline: 5200, idle: 700, gears: [0, 15, 27, 40, 55], box: 'automatic', shift: 0.3 }) },
  // your Blender model (tools/cars/sprintcar.py, built from scratch): a winged 410 sprint car, from the real thing
  // (World of Outlaws / Knoxville rules, Hoosier sizes): 1,425 lb with the driver, the 410 methanol V8 at ~900 hp
  // (8-9k rpm) through a direct drive (an in/out box: one gear, ~5.5:1 overall), a spool (both rears locked together),
  // right rear 105" round, left rear ~95" (stagger 10": the car wants to turn left), fronts 85". 57% of the weight on
  // the rear and 57% on the left (the chassis is offset left: cgY). The top wing (25 sq ft at ~28°: ~1,250 lb at
  // 140 mph, three quarters of it on the rear) also drags hard (CdA ~2 m²: top speed ~150 mph) and keeps working
  // sideways (low aeroYaw); its boards push the car toward the inside of a slide (sideK, behind the CG: sideX).
  // Dirt tyres peak at a bigger slip angle and fall away gently (it's driven sideways). No right-front brake.
  // Open cockpit: the racer sits in it, hands on the wheel (cockpit: hip / pedal in car space, wheelR = the wheel's
  // rim, ratio = steering wheel turns per road-wheel angle). Its own class (a series of its own on the dirt ovals to come)
  sprint410: { name: 'Winged 410 Sprint Car', cls: 'sprint', sound: 'v8cross', glb: true, paint: true, livery: true,
    cockpit: { hip: [0, 0.38, -0.18], recline: 12, pedal: [0.11, 0.40, 0.50], wheelR: 0.165, ratio: 3 },
    spec: gt({ body: [1.82, 1.50, 1.04], mass: 650, inertia: 700, power: 670000, torque: V8, maxForce: 14000,
      redline: 8800, idle: 2500, gears: [0, 68], box: 'sequential', shift: 0.06,
      a: 1.216, b: 0.918, cgh: 0.45, cgY: 0.11, track: 1.6, wheelR: 0.4075, wheelRF: 0.344, stagger: 0.1524, wheelI: 4,
      lsd: [20000, 1, 1], brakeF: 0.35, brakeRF: 0, maxSteer: 0.55,
      kd: 1.45, aeroF: 0.4, aeroYaw: 0.6, aeroH: [0, 0], aeroY: 0.04, drag: 1.2, sideK: 2.0, sideX: -0.55, slideOK: 0.3,
      mu: 1.6, dirtGrip: 1.31, rearGrip: 1.45, slipPeak: 0.14, slipFall: 1.25, slipPeakR: 0.16, slipFallR: 1.15, kappaPeak: 0.15,
      rideHz: [1.8, 2.0], damp: 0.5, rollGrad: 2.0, travel: [0.1, 0.08], solidR: true, floorH: 0.2 }) },
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
// archived (2026-10-22): the low-poly GT1 cars (your Blender models, the white-photo pipeline), replaced by the detailed
// models under the same ids (so saved liveries, careers and the AI's learned lines carry over). Same specs; to bring one
// back, give it its own id in CARS
for (const [id, name] of [['m1procar', 'Bavaria M1 ProCar ’79'], ['porsche935', 'Porsche 935'], ['capri', 'Ford Capri Turbo'], ['f40', 'Ferrari F40 LM']])
  ARCHIVED[id + '_lp'] = { ...CARS[id], name, smooth: id === 'm1procar' ? 30 : undefined };
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
 "p962c": {
  "title": "Porsche 962C",
  "author": "JUST GAME",
  "license": "CC-BY-4.0"
 },
 "mazda787b": {
  "title": "Mazda 787B | www.vecarz.com",
  "author": "vecarz",
  "license": "CC-BY-4.0"
 },
 "xjr9": {
  "title": "Jaguar XJR-9 LM (updated)",
  "author": "JUST GAME",
  "license": "CC-BY-4.0"
 },
 "porsche935": {
  "title": "Porsche Kremer Racing 935 K3 Midpoly",
  "author": "yarzav",
  "license": "CC-BY-NC-SA-4.0"
 },
 "m1procar": {
  "title": "BMW M1 Turbo",
  "author": "VTX",
  "license": "CC-BY-NC-SA-4.0"
 },
 "f40": {
  "title": "LB-Works Ferrari F40 | www.vecarz.com",
  "author": "vecarz",
  "license": "CC-BY-NC-SA-4.0"
 },
 "capri": {
  "title": "Ford Capri Group B",
  "author": "Tiaan.Pretorius",
  "license": "CC-BY-4.0"
 },
 "clkgtr": {
  "title": "1997 Mercedes CLK GTR GT1",
  "author": "Dave Love SketchFab",
  "license": "CC-BY-4.0"
 },
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
