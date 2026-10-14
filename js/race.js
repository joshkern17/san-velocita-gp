// Race session: world + cars + AI + rules + cameras
import * as THREE from 'three';
import { sampleTrack, analyzeTrack, computeRacingLine, computeSpeedProfile, surfaceY, gridSlot, circDist, buildPitLane, OPEN_END_WALL, PIT, kerbOn, kerbW, kerbOf, wallTypeAt, SAUSAGE_H } from './track.js';
import { buildWorld, walkEdge, walkWidth, KERB_H, WALK_H, WALK_RAMP } from './world.js';
import { applyRoadsToCircuit, raiseTrackOverRoads } from './roads.js';
import { runoffKind, groundGrid, groundProfile, profileAt, surfaceGrid, RUN_PAVED, RUN_GRAVEL, RUN_GRASS } from './runoff.js';
import { Spray } from './weatherfx.js';
import { driverHelmet, teamSuit } from './drivers.js';
import { CarPhysics, CARSPEC, TEAMS, TYRES, wearGrip, tyreGrip, tyreGripAt, wearMul, LOCK_K, PHYS_VERSION, WAKE } from './car.js';
import { buildF1, teamCar, setStance, setBend } from './carmodel.js';
import { CARS, CLASSES, carId, carsInClass, chassisKey } from './cars.js';
import { EngineVoice, sfx } from './audio.js';
import { DriftScore } from './drift.js';
import { bodyBox, corners, boxContact, impulse, knock, rock, toLocal, partAt } from './contact.js';
import { getTextures } from './textures.js';
import { RaceControl, findCorners, VSC_PACE } from './racecontrol.js';
import { AI_AIDS, physAids } from './aids.js';
import { fastLine, fastLineSteps, lineCar } from './raceline.js';
import { technique, curveCost, curvePace } from './aiskill.js';
import { passPlan, claimOn } from './racecraft.js';
import { PitLife } from './pitlife.js';
import { RaceDrivers } from './racedrivers.js';
import { LapRecorder, addLap, lapKey, bestLap, loadPB, lapPoseAt } from './telemetry.js';
import { setCrowdCars } from './crowd.js';
import { DirtTrack } from './dirttrack.js';
import { Rubber } from './rubber.js';
import { activeSetup, applySetup, stanceOf } from './setup.js';
import { TireFX, SMOKE, DUST, FX } from './tirefx.js';
import { TEAM_LIVERIES } from './teamliveries.js';
import { Broadcast } from './broadcast.js';
import { Acclimatization, MiniSectors, QualiSim, BrakeMarkers, ACCLIM_PASS, MSEC_PASS, QSIM_NOISE, planMinis } from './practice.js';

const STEP = 1 / 240;
// pace = fraction of the learned per-track limit
// grip > 1 is an edge (Alien and up): the AI learns each circuit with it (a plan of its own: limitsFor), so it uses it.
// Since the car-fitted racing line (raceline.js, 2026-10-02) the AI's honest best is about a quick human's, so Legend
// has no edge; the levels above it are spaced by a labelled one (pace alone tops out: in the F1, pace 0.945 and 0.99
// lapped within a second). Clean AI laps at Auburn on the fitted line (the user's M1 best is 1:44.5), GT-R / M1 /
// Aventus / F1: Pro 2:04.4 / 1:47.6 / 1:47.8 / 1:25.0, no edge 2:01.7 / 1:45.3 / 1:45.7 / 1:24.2,
// 1.04+1.02 2:00.2 / 1:43.5 / 1:43.9 / 1:22.7, 1.08+1.05 1:59.2 / 1:42.6 / 1:43.1 / 1:21.4,
// 1.13+1.08 1:57.7 / 1:40.9 / 1:41.4 / 1:19.7.
// Legend is a clean lap at your best, Alien beats it, Phantom and Godlike are for a career car with upgrades.
// tech: Rookie and Pro drivers' technique flaws (aiskill.js), on top of their pace.
const DIFF = {
  easy:    { pace: 0.85, power: 0.95, grip: 1, spread: 0.03, rubber: true, tech: 1 },
  medium:  { pace: 0.93, power: 0.98, grip: 1, spread: 0.025, rubber: true, tech: 0.5 },
  hard:    { pace: 1, power: 1, grip: 1, spread: 0.012, rubber: false },
  alien:   { pace: 1, power: 1.02, grip: 1.04, spread: 0.006, rubber: false },
  phantom: { pace: 1, power: 1.06, grip: 1.09, spread: 0.004, rubber: false },
  godlike: { pace: 1, power: 1.08, grip: 1.13, spread: 0.003, rubber: false },
};
// the F1 class: its own lower levels (its AI never had the cornering help the road / GT AI lost in stage 3), and the
// top levels one step of edge below the road / GT table's
const diffFor = (opts) => { const D = (CARS[carId(opts.car)] || CARS.f1).cls === 'f1' ? DIFF_F1 : DIFF; return D[opts.difficulty] || D.medium; };
const DIFF_F1 = {
  easy:    { pace: 0.8,  power: 0.94, grip: 0.97, spread: 0.03, rubber: true, tech: 1 },
  medium:  { pace: 0.875, power: 0.97, grip: 0.99, spread: 0.025, rubber: true, tech: 0.5 },
  hard:    { pace: 1, power: 1, grip: 1, spread: 0.012, rubber: false },
  alien:   { pace: 1, power: 1.01, grip: 1.03, spread: 0.006, rubber: false },
  phantom: { pace: 1, power: 1.04, grip: 1.07, spread: 0.004, rubber: false },
  godlike: { pace: 1, power: 1.07, grip: 1.12, spread: 0.003, rubber: false },
};
// AI mistakes: chance per corner of braking too late / running wide / spinning, by difficulty (x the AI Mistakes option)
const MISTAKE = { easy: 0.03, medium: 0.022, hard: 0.012, alien: 0.007, phantom: 0.005, godlike: 0.003 };
const MISTAKES = { off: 0, normal: 1, frequent: 2.2 };
// learned AI speed plans: kept for the play session, and saved in the browser between sessions (the most recent 40
// circuit + car + weather combinations, ~10 KB each), so a race you've run before loads without relearning
const LIMITS_CACHE = new Map(), PLANS_KEY = 'svgp.aiPlans';
function loadPlan(key) {
  try {
    const all = JSON.parse(localStorage.getItem(PLANS_KEY) || '{}'), e = all[key];
    if (!e || e.ver !== PHYS_VERSION) return null;
    return { V: Float32Array.from(e.v), meta: e.meta, rounds: e.rounds };
  } catch (err) { return null; }
}
function savePlan(key, hit) {
  try {
    const all = JSON.parse(localStorage.getItem(PLANS_KEY) || '{}');
    all[key] = { ver: PHYS_VERSION, when: Date.now(), v: Array.from(hit.V, x => Math.round(x * 10) / 10), meta: hit.meta, rounds: hit.rounds };
    const keys = Object.keys(all).sort((a, b) => all[b].when - all[a].when);
    for (const k of keys.slice(40)) delete all[k];
    localStorage.setItem(PLANS_KEY, JSON.stringify(all));
  } catch (err) {}
}
// fitted racing lines (raceline.js), like the plans: kept for the session, the most recent 30 saved in the browser.
// LINE_VERSION: bump when the line fitting changes (old lines, and the AI plans learned on them, are then redone)
const LINES_CACHE = new Map(), LINES_KEY = 'svgp.aiLines', LINE_VERSION = 2; // (2: lines use the kerbs, lineMargins)
function loadLine(key, N) {
  try { const e = JSON.parse(localStorage.getItem(LINES_KEY) || '{}')[key]; return e && e.o.length === N ? Float32Array.from(e.o, x => x / 100) : null; } catch (err) { return null; }
}
function saveLine(key, O) {
  try {
    const all = JSON.parse(localStorage.getItem(LINES_KEY) || '{}');
    all[key] = { when: Date.now(), o: Array.from(O, x => Math.round(x * 100)) };
    const keys = Object.keys(all).sort((a, b) => all[b].when - all[a].when);
    for (const k of keys.slice(30)) delete all[k];
    localStorage.setItem(LINES_KEY, JSON.stringify(all));
  } catch (err) {}
}
// cars' pace curves (Race.paceCurve), like the plans: kept for the session, the most recent 60 saved in the browser
const PACE_CURVES = new Map(), CURVES_KEY = 'svgp.paceCurves';
function loadCurve(key) { try { const e = JSON.parse(localStorage.getItem(CURVES_KEY) || '{}')[key]; return e && e.ver === PHYS_VERSION ? e.c : null; } catch (err) { return null; } }
function saveCurve(key, c) {
  try {
    const all = JSON.parse(localStorage.getItem(CURVES_KEY) || '{}');
    all[key] = { ver: PHYS_VERSION, when: Date.now(), c };
    const keys = Object.keys(all).sort((a, b) => all[b].when - all[a].when);
    for (const k of keys.slice(60)) delete all[k];
    localStorage.setItem(CURVES_KEY, JSON.stringify(all));
  } catch (err) {}
}
// the AI field's balance (Race.balanceField), per circuit, your car and the level: the same store as the pace curves
const BALANCE = new Map(), BALANCE_KEY = 'svgp.aiBalance';
function loadBalance(key) { try { const e = JSON.parse(localStorage.getItem(BALANCE_KEY) || '{}')[key]; return e && e.ver === PHYS_VERSION ? e.b : null; } catch (err) { return null; } }
function saveBalance(key, b) {
  try {
    const all = JSON.parse(localStorage.getItem(BALANCE_KEY) || '{}');
    all[key] = { ver: PHYS_VERSION, when: Date.now(), b };
    const keys = Object.keys(all).sort((x, y) => all[y].when - all[x].when);
    for (const k of keys.slice(60)) delete all[k];
    localStorage.setItem(BALANCE_KEY, JSON.stringify(all));
  } catch (err) {}
}
export const TYRE_FIT = 20;
// a curb's height over the road edge (m), u m out from it, over its width w there; d: distance along (its stripes'
// rumble). track.js KERB_TYPES: raised ramps up to KERB_H, sawtooth too with deep ridges every metre, flat is paint,
// a sausage is a round hump. kerbTop: its height at its outer edge (where the runoff picks up)
export function kerbZ(k, w, u, d) {
  const type = (k && k.type) || 'raised', f = Math.min(1, Math.max(0, u / Math.max(0.05, w)));
  if (type === 'flat') return 0.003 * Math.abs(Math.sin(d * Math.PI / 2));
  if (type === 'sausage') return SAUSAGE_H * Math.sin(Math.PI * f);
  if (type === 'saw') return KERB_H * f + 0.022 * Math.abs(Math.sin(d * Math.PI));
  return KERB_H * f + 0.008 * Math.abs(Math.sin(d * Math.PI / 2));
}
export const kerbTop = (k) => { const type = (k && k.type) || 'raised'; return type === 'flat' ? 0.003 : type === 'sausage' ? 0 : KERB_H; };
// World Career part failures (wcareer.js): the engineer's spoken warning for each written one (vo.js)
const FAIL_VO = { 'Oil pressure is dropping. Nurse it.': 'fail.oil', 'Engine temps are climbing.': 'fail.engine.temps',
  'The gearbox is making a noise.': 'fail.gearbox.noise', 'Shifts are getting slow.': 'fail.gearbox.slow',
  'Brake temperatures are very high.': 'fail.brakes', 'Something is loose at the rear.': 'fail.rear.loose' };
const SEC_KEY = 'svgp.sectorBests'; // (time trial: your best ever through each sector, per circuit + car) // seconds of a session to fit a new set of tyres in the garage
const CAMS = ['chase', 'far', 'tcam', 'bumper'];
// the rear-view mirror (top centre of the HUD): Options > Display > Rear-View Mirror
let MIRROR = true;
export function setMirror(on) { MIRROR = !!on; }
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)); if (d < 0) d += Math.PI * 2; return a + (d - Math.PI) * t; };

// just the circuit and its world, no cars (for taking pictures of it)
export function buildScenery(track) {
  const T = sampleTrack(track);
  raiseTrackOverRoads(track, T);
  const A = analyzeTrack(T, track.env, track.paint, track.osm, track.dress);
  A.pit = buildPitLane(T, A, track.env, track.osm && track.osm.pitLane, surfaceGrid(track.osm && track.osm.surface), track.dress && track.dress.pit);
  applyRoadsToCircuit(track, T, A);
  const world = buildWorld(track, T, A);
  const scene = new THREE.Scene();
  scene.fog = world.fog; scene.add(world.root);
  return { T, A, world, scene, dispose: () => scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }) };
}

// grip (× the tyres') and drag (N per m/s) of each surface beside the track (Race.surfaceKind). runoff: paved
// runoff, asphalt but dusty and unrubbered
// loose ground's dust and what the tires throw up (wet: the dust mostly gone, mud instead)
const LOOSE = {
  dirt:   { dust: 0xb8976e, wetDust: 0x7a6650, dustN: 40, wetK: 0.15, chunk: 0x5e4630, mud: 0x3a2c1e, chunkN: 45, size: 0.16 },
  grass:  { dust: 0x9a8c62, wetDust: 0x6a6a50, dustN: 14, wetK: 0.1,  chunk: 0x4d5a28, mud: 0x3a3a20, chunkN: 40, size: 0.18 },
  gravel: { dust: 0xc2b49a, wetDust: 0x8a8274, dustN: 45, wetK: 0.2,  chunk: 0x8c8478, mud: 0x6a645a, chunkN: 55, size: 0.12 },
  sand:   { dust: 0xd8c090, wetDust: 0x9a8664, dustN: 60, wetK: 0.25, chunk: 0xc4a676, mud: 0x8a7450, chunkN: 34, size: 0.11 },
};
// a car's shadows: it casts one in the sun (when shadows are on), and a soft dark patch under its floor plus a darker
// spot under each tire ground it any time (night, rain, shadows off). Sized from the model itself
const shadowTex = {};
function softTex(key, w, h, draw) {
  if (shadowTex[key]) return shadowTex[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (shadowTex[key] = t);
}
// the racing line's colors (green → yellow → orange → red) for how hard to brake (0..1), and the 3D tiles' layout:
// a tile every `pitch` samples (2 m each), `len` of a sample long, `w` m wide (`taper` at the far edge); shown from `behind`
// to `ahead` m, faded in over `near` m (from you); a tile tips up (hinged on its near edge) by how hard it brakes, a
// little for yellow, up to `tilt` rad for red, blended with its neighbors so the wall rises and falls smoothly (raised
// `raise` m); from `settle[1]`
// m out it starts laying back down, flat by `settle[0]`; `rate`: how quickly they move; `lead`: the yellow → orange
// build-up before a brake point, in seconds at your speed
const LINE_COL = [[0.36, 0.86, 0.38], [0.96, 0.85, 0.28], [1.0, 0.5, 0.16], [0.95, 0.2, 0.13]];
const LINE_TILES = { pitch: 2, len: 0.7, w: 1.45, taper: 0.86, ahead: 300, behind: 6, near: [1.5, 11], alpha: [0.5, 0.8], tilt: 0.6, raise: 0.06, settle: [2, 14], rate: 6, lead: 1.1 };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lineColor = (s) => {
  const x = Math.max(0, Math.min(1, s)) * 3, k = Math.min(2, Math.floor(x)), f = x - k, a = LINE_COL[k], b = LINE_COL[k + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};
function groundCar(model) {
  const g = model.group;
  g.traverse(o => { if (o.isMesh && !(Array.isArray(o.material) ? o.material.some(m => m.transparent) : o.material?.transparent)) o.castShadow = true; });
  // its footprint, in its own frame (the model's built but not placed yet)
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3(), b = new THREE.Box3(), inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m4 = new THREE.Matrix4();
  g.traverse(o => { if (o.isMesh && o.visible && o.geometry && o !== model.shadow) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.union(b.copy(o.geometry.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld))); } });
  const ok = !bb.isEmpty() && bb.max.z - bb.min.z > 1.5;
  const w = ok ? bb.max.x - bb.min.x : 2, l = ok ? bb.max.z - bb.min.z : 4.6, cx = ok ? (bb.max.x + bb.min.x) / 2 : 0, cz = ok ? (bb.max.z + bb.min.z) / 2 : 0;
  // the floor: a soft-edged rounded rectangle, darkest in the middle
  const floor = softTex('floor', 64, 128, (x, W, H) => {
    x.filter = 'blur(7px)'; x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.roundRect(12, 12, W - 24, H - 24, 14); x.fill();
    x.filter = 'blur(10px)'; x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.roundRect(20, 26, W - 40, H - 52, 10); x.fill();
  });
  const sh = model.shadow;
  sh.geometry.dispose(); sh.geometry = new THREE.PlaneGeometry(w + 0.5, l + 0.7);
  // (drawn over the road like the skid marks are: it sits a few cm under the road's camber otherwise)
  sh.material.map = floor; sh.material.opacity = 0.85; sh.material.polygonOffset = true; sh.material.polygonOffsetFactor = sh.material.polygonOffsetUnits = -6; sh.material.needsUpdate = true;
  sh.position.set(cx, 0.03, cz);
  g.add(sh);
  // each tire's contact: small and dark
  const spot = softTex('tire', 32, 32, (x, W) => {
    const r = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.9)'); r.addColorStop(0.5, 'rgba(0,0,0,0.6)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, W, W);
  });
  const mat = new THREE.MeshBasicMaterial({ map: spot, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
  const v = new THREE.Vector3();
  for (const wh of model.wheels || []) {
    wh.pivot.getWorldPosition(v); g.worldToLocal(v);
    const r = wh.r || 0.33, q = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.3, r * 2.2), mat);
    q.rotation.x = -Math.PI / 2; q.position.set(v.x, 0.035, v.z); q.renderOrder = 1;
    g.add(q);
  }
}
// the Quick Race teams (TEAMS), then the other rival teams in their liveries (js/teamliveries.js) for a bigger field
const MORE_DRIVERS = ['C. BRANDT', 'O. NILSEN', 'R. DUARTE', 'F. CALLOWAY', 'H. VOSS', 'G. MARCHETTI', 'N. ABARA', 'I. PETROV', 'W. DEACON', 'Y. HAYASHI', 'B. KESTREL', 'V. ORTEGA',
  'U. LAMBERT', 'Z. HOLLOWAY', 'Q. FONTAINE', 'X. ARANDA', 'S. MCALLISTER', 'D. RENNIE', 'T. OYELARAN', 'M. ESPOSITO', 'K. VARGA', 'L. BRENNAN', 'J. HALVORSEN'];
const ALL_TEAMS = [...TEAMS, ...Object.entries(TEAM_LIVERIES).filter(([n]) => !TEAMS.some(t => t.name === n))
  .map(([name, l], k) => ({ name, main: l.main, accent: l.accent, helmet: l.accent, driver: MORE_DRIVERS[k % MORE_DRIVERS.length] }))];
const WHEEL_SPOTS = [[0.8, 1.4, true], [-0.8, 1.4, true], [0.8, -1.4, false], [-0.8, -1.4, false]];
// classes whose tyres come out of warmers (tyre temperatures); the rest start at the air's temperature
const BLANKETS = new Set(['f1', 'gt1', 'gt2']);
const SURFACES = { road: [1, 0], kerb: [0.96, 0], walk: [0.92, 10], public: [0.95, 15], city: [0.85, 30], runoff: [0.9, 6], grass: [0.58, 120], gravel: [0.5, 260], sand: [0.55, 190],
  dirt: [0.68, 18] }; // (a dirt track's racing surface: loose, about two thirds of tarmac's grip, a little drag)

export class Race {
  constructor(track, opts, renderer) {
    this._cw = new Float64Array(8); this._cd = new Float64Array(4); // (scratch: a car's corners, their depths past a wall)
    this.opts = opts;
    this.mode = opts.mode; // 'race' | 'attract' | 'test'
    this.track = track;
    const T = this.T = sampleTrack(track);
    raiseTrackOverRoads(track, T); // the track bridges roads set to "under"
    const A = this.A = analyzeTrack(T, track.env, track.paint, track.osm, track.dress);
    this.pit = buildPitLane(T, A, track.env, track.osm && track.osm.pitLane, surfaceGrid(track.osm && track.osm.surface), track.dress && track.dress.pit);
    A.pit = this.pit;
    applyRoadsToCircuit(track, T, A); // barrier gaps, gates, the track bridging roads that tunnel under it
    // (a timed race with a start hour: its time of day moves with the race clock - built with the lamps in, the world
    // starts at the time nearest the hour and setTimeOfDay takes it on from there)
    const flow = opts.duration > 0 && opts.startHour != null && this.mode === 'race';
    if (flow) { const h = ((opts.startHour % 24) + 24) % 24; track.env = { ...track.env, timeFlow: true, time: h < 5.6 || h >= 20 ? 'night' : h < 7 ? 'dawn' : h < 18 ? 'day' : 'dusk' }; }
    this.world = buildWorld(track, T, A);
    if (flow) { this.tod0 = opts.startHour; this.world.setTimeOfDay(this.tod0); }
    this.rain = this.world.P.rain;
    // the weather changing in the race (opts.wx: { to: 'rain' | 'dry', at, until }, as shares of the race distance):
    // rainK, how hard it's raining, and wet, how wet the road is (0..1; the grip follows it, wxUpdate)
    this.wx = this.mode === 'race' && opts.wx ? { ...opts.wx } : null; this.rain0 = this.rain;
    this.wet = this.rain ? 1 : 0; this.rainK = this.rain ? 1 : 0;
    this.dirt = track.env.surface === 'dirt'; // a dirt track: its road (and kerb-less edges) drive as dirt
    this.dirtTrack = this.dirt ? new DirtTrack(T, A, this.world.root, this.rain) : null; // (and it changes as the race goes on)
    const racey = this.mode !== 'attract';
    this.wearK = racey ? ({ off: 0, normal: 1, fast: 2.5 }[opts.wear || 'normal'] ?? 1) : 0;
    // tyre temperatures: 0 off, 1 Normal, 2 Realistic; what the tyres cool toward (°C: the air + the road), from the weather
    this.tempMode = racey ? ({ off: 0, normal: 1, realistic: 2 }[opts.temps || 'off'] ?? 0) : 0;
    this.ambT = this.rain ? 16 : this.world.P.night > 0 ? 20 : 30;
    this.damageK = 0;
    this.scene = new THREE.Scene();
    this.scene.fog = this.world.fog;
    this.scene.add(this.world.root);
    if (this.rain) this.spray = new Spray(this.scene);
    this.camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.3, 5000);
    this.scene.add(this.camera);

    this.renderer = renderer;
    this.core();
    // (opts.defer: stop here; prepare() does the slow work a step at a time, so the page stays responsive and can show
    // progress, then finishes the build)
    if (!opts.defer) this.finish();
  }
  // the AI teams, in the order the field is filled from (shuffled once: prepare and finish see the same field)
  // (a field bigger than the 12 TEAMS - a multiclass Quick Race, up to 24 cars: the other rival teams, in their liveries)
  static MAX_FIELD = 23;
  fieldTeams() {
    if (this._teams) return this._teams;
    const opts = this.opts, garage = opts.team === 'garage' || opts.team === undefined, reserved = garage ? 0 : +opts.team;
    let aiTeams = (opts.mixCls ? ALL_TEAMS : TEAMS).map((t, i) => i).filter(i => i !== reserved);
    for (let i = aiTeams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [aiTeams[i], aiTeams[j]] = [aiTeams[j], aiTeams[i]]; }
    // championship: same AI teams every round, grid in championship order
    if (opts.roster) aiTeams = opts.roster.filter(i => i !== reserved);
    return this._teams = aiTeams;
  }
  aiCarId(t) { return carId({ ...teamCar(this.teamFor(t), t), chassis: this.aiChassisFor(t) }); }
  // the slow parts of a build, as steps: [label, fn]. Each fills a cache the build then just reads.
  slowSteps() {
    const opts = this.opts, main = this.mainCarId(), steps = [], seen = new Set();
    const learn = (id, grip, label) => { const k = `${id}|${grip}`; if (seen.has(k)) return; seen.add(k); steps.push([label, () => this.limitsFor(id, grip)]); };
    const learnEdge = (id, label) => steps.push([label, () => this.limitsFor(id, this.edgeFor(id).grip)]); // (at the time it runs)
    steps.push(...this.lineSteps(main).map(st => [st[0], st[1], 'line']));
    learn(main, 1, 'Learning the circuit');
    let ais = [];
    if (this.net) ais = this.net.grid.map(g => g.k === 'h' ? { id: carId(g.car), human: true } : { id: this.aiCarId(g.team), t: g.team });
    else {
      const nField = Math.min(opts.roster ? Math.max(11, opts.roster.length) : opts.mixCls ? Race.MAX_FIELD : 11, opts.opponents ?? 7); // (a multiclass championship round: its whole roster, two classes)
      const n = this.mode === 'test' ? 0 : this.mode === 'attract' ? 8 : nField; // (practice / qualifying: the field's laps are simulated)
      ais = this.fieldTeams().slice(0, n).map(t => ({ id: this.aiCarId(t), t }));
    }
    const types = [...new Set(ais.filter(a => !a.human).map(a => a.id))];
    types.forEach((id, k) => learn(id, this.diff.grip, `The AI is learning the circuit (${k + 1} of ${types.length})`));
    for (const a of ais) if (a.human) learn(a.id, 1, 'Learning the circuit');
    if (this.balancing()) steps.push(['Balancing the field', () => this.balanceField(types)]);
    if (this.trimming()) {
      const ids = this.trimIds(types);
      ids.forEach((id, k) => steps.push([`Balancing the cars (${k + 1} of ${ids.length})`, () => this.trimLap(id)]));
      steps.push(['Balancing the cars', () => this.trimBop(ids)]);
      ids.forEach((id, k) => steps.push([`Checking the balance (${k + 1} of ${ids.length})`, () => this.trimCheck(id)]));
      steps.push(['Checking the balance', () => this.trimDone()]);
      ids.forEach((id, k) => learnEdge(id, `Balancing the cars (${k + 1} of ${ids.length})`)); // (each car's plan at the grip it races with, trim and all)
    }
    // World Career drivers: each car's pace curve here (techPace)
    if (opts.entries) types.forEach((id, k) => steps.push([`Measuring the cars (${k + 1} of ${types.length})`, () => this.paceCurve(id)]));
    return steps;
  }
  // a build that keeps the page responsive: the slow steps one at a time (the page gets a frame between them), with
  // progress (onStep(fraction, label)), then the rest of the build
  async prepare(onStep = () => {}) {
    this.core();
    const steps = this.slowSteps();
    for (let k = 0; k < steps.length; k++) {
      onStep(k / (steps.length + 1), steps[k][0]);
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      steps[k][1]();
    }
    onStep(steps.length / (steps.length + 1), 'Lining up the grid');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    this.finish();
    onStep(1, '');
    return this;
  }
  // the same for a car picked on the grid (commitCar): the line for it and, for a new class, the field's plans
  async prepareCar(cfg, onStep = () => {}) {
    const keep = this.opts.car; this.opts.car = { ...cfg }; this.diff = diffFor(this.opts);
    const changed = this.mainCarId() !== this.lineOwner;
    // (the same car type: its line stays; a new one: its line, then the field's plans learned on it)
    const steps = this.slowSteps().filter(st => changed || st[2] !== 'line');
    for (let k = 0; k < steps.length; k++) {
      onStep(k / steps.length, steps[k][0]);
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      steps[k][1]();
      if (changed && steps[k][2] === 'line' && steps[k + 1]?.[2] !== 'line') { this.limits = {}; this.paceCurves = {}; this.aiTech = {}; }
    }
    this.opts.car = keep; this.diff = diffFor(this.opts);
    onStep(1, '');
  }

  // what the line and the AI need before anything else
  core() {
    this.net = this.opts.net || null;
    this.corners ||= findCorners(this.T); // (before the line: checking a fitted line drives the AI, which needs them)
    this.diff = diffFor(this.opts);
    this.cars ||= []; this.limits ||= {}; // (the AI's hidden practice laps look for traffic; plans learned so far)
  }
  // the rest of the build: the line, the field, the session
  finish() {
    const opts = this.opts, T = this.T, renderer = this.renderer, racey = this.mode !== 'attract';
    this.core();
    // the racing line, fitted to the car the race is built around (lineFor): the one the AI drives and you're shown
    this.line = this.lineFor(this.mainCarId()); this.lineOwner = this.mainCarId(); this.lineK = null;
    this.rec = opts.mode !== 'attract' ? new LapRecorder(T) : null; // your laps, sample by sample (telemetry.js: Lap Review)
    this.cars = [];
    this.log = []; // incidents between named drivers (World Career's ledger)
    this.diff = diffFor(opts);
    this.mistakeP = this.mode === 'race' ? (MISTAKE[opts.difficulty] ?? MISTAKE.medium) * (MISTAKES[opts.aiMistakes || 'normal'] ?? 1) : 0;
    this.limits = {}; // learned speed plan per car type
    this.lineV = this.limitsFor(this.mainCarId());
    // the track's rubber (rubber.js): laid on this line, carried over from the session before in a weekend
    this.rubber = this.dirt || opts.noRubber ? null : new Rubber(T, this.line, this.lineV, { state: opts.rubber, street: this.track.env.theme === 'city', wet: this.wet });
    if (this.rubber) { this.rubber.attach(this.world.road); let lap = 0; for (let i = 0; i < T.N; i++) lap += T.ds / Math.max(5, this.lineV[i]); this.rubberLap = lap; }
    this.damageK = racey ? ({ off: 0, normal: 1, high: 1.8 }[opts.damage || 'normal'] ?? 1) : 0;
    this.laps = this.mode === 'race' ? (T.open ? 1 : opts.laps) : Infinity; // (point-to-point: one run, start to finish)
    // a timed race (endurance): the race runs dur seconds, then the leader takes the flag at the line and everyone else
    // at theirs after. k: race-clock seconds per real second (a 6-hour race run in 22 minutes: 16). Until the flag,
    // this.laps is the laps the leader looks like doing (everything that plans by laps - strategy, the radio - uses it)
    if (this.mode === 'race' && opts.duration > 0 && !T.open) {
      let lap = 0; for (let i = 0; i < T.N; i++) lap += T.ds / Math.max(5, this.lineV[i]);
      // (the limit lap at the field's pace, plus traffic; the race's laps less what the stops cost)
      const pace = Math.max(0.7, Math.min(1, this.diff.pace || 0.9));
      this.timed = { dur: opts.duration, k: opts.clockK || 1, lapEst: lap * 1.12 / pace, flag: false };
      // stints: about one per hour and a half of the race's own time (a 6 Hours: 4), and the tires made to last one
      // (a medium set ~15% longer than a stint: the planner can stretch or split them)
      const hours = opts.duration * this.timed.k / 3600;
      this.timed.stints = opts.stints || Math.max(2, Math.round(hours / 1.5));
      const stopLoss = (this.pit ? this.pit.length / this.pit.speed - this.pit.length / 55 + 5 : 30) + 10; // (the lane, the stop, a driver change)
      this.laps = Math.max(2, Math.ceil((opts.duration - (this.timed.stints - 1) * stopLoss) / this.timed.lapEst));
      // (with this car's own tire use here, learned with its limits: the cars take it when they're added)
      if (this.wearK) {
        const lm = this.limitMeta && (this.limitMeta[this.mainCarId()] || Object.values(this.limitMeta)[0]), w0 = this.wearPerM;
        if (lm) this.wearPerM = lm.w;
        const life = this.tyreLife('medium'), want = this.laps / this.timed.stints * 1.15; if (isFinite(life) && life > 0) this.wearK *= life / want;
        this.wearPerM = w0;
      }
    }
    this.pitLoss = this.pit ? this.pit.length / this.pit.speed - this.pit.length / 55 + 5 : 30;
    this.units = opts.units || 'kmh';
    this.rainGrip = this.world.P.grip;
    this.night = this.world.P.night > 0;
    if (this.tod0 != null) this.night = this.world.nightK() > 0.45;

    this.skids = new SkidMarks(this.scene);
    this.particles = new Particles(this.scene);
    this.fx = new TireFX(this.scene, this.world.P); // (tire smoke, dust, thrown dirt)
    this.cars = [];
    this.net = opts.net || null;
    if (this.net) {
      // online: the host decided the grid; humans drive their own garage cars
      const net = this.net;
      if (net.qualiTeams) this.qualiTeams = net.qualiTeams.slice(); // (an online session: the AI field's slots, simulated like offline)
      net.grid.forEach((g, slot) => {
        if (g.k === 'h') {
          const me = g.id === net.myId;
          const team = g.teamObj || { name: g.teamName && g.teamName !== 'Your Team' ? g.teamName : `${g.name} Racing`, main: g.car.main, accent: g.car.accent, helmet: g.car.accent, driver: g.name };
          const car = this.addCar(team, slot, me, g.team, { cfg: g.car, remote: !me, human: true, key: 'h:' + g.id, name: g.name, tag: !me });
          if (g.pid) car.pid = g.pid; // (a co-op World Career: who's driving it, for the career's records)
        } else {
          this.addCar(this.teamFor(g.team), slot, false, g.team, { remote: !net.host, key: 'a:' + g.team }); // (a World Career field: its own teams)
        }
      });
    } else {
    // (qualifying: a clear track, the AI field's times are simulated: see qualiStart)
    const nField = Math.min(opts.roster ? Math.max(11, opts.roster.length) : opts.mixCls ? Race.MAX_FIELD : 11, opts.opponents ?? 7); // (a multiclass championship round: its whole roster, two classes)
    const nAI = this.mode === 'test' || this.mode === 'quali' || this.mode === 'practice' ? 0 : this.mode === 'attract' ? 8 : nField;
    const garage = opts.team === 'garage' || opts.team === undefined;
    const playerTeam = garage ? -1 : +opts.team;
    const myCar = opts.car || null;
    this.playerTeamObj = garage && myCar
      ? { name: myCar.teamName || 'Your Team', main: myCar.main, accent: myCar.accent, helmet: myCar.accent, driver: 'YOU' }
      : TEAMS[Math.max(0, playerTeam)];
    const hasPlayer = this.mode !== 'attract';
    const total = nAI + (hasPlayer ? 1 : 0);
    let playerSlot = 0;
    if (hasPlayer) playerSlot = opts.grid === 'pole' ? 0 : opts.grid === 'random' ? Math.floor(Math.random() * total) : total - 1;
    const reserved = garage ? 0 : playerTeam; // your team's slot (and pit box); AI teams get the others
    const aiTeams = this.fieldTeams();
    this.qualiTeams = aiTeams.slice(0, nField); // (qualifying: who's in the field; the race after it gets the same teams)
    let order;
    if (opts.gridOrder) {
      // gridOrder: list of 'P' / team indices, leader first
      order = opts.gridOrder.filter(k => k === 'P' ? hasPlayer : aiTeams.slice(0, nAI).includes(k));
      for (const k of aiTeams.slice(0, nAI)) if (!order.includes(k)) order.push(k);
      if (hasPlayer && !order.includes('P')) order.push('P');
    } else {
      const ais = aiTeams.slice(0, nAI);
      // (no qualifying to set it: line the field up about as quick as each car is here, the quickest at the front, with a
      // little shuffle among cars that are close, so the fast cars don't start behind slow ones and spend the race there.
      // A championship keeps its standings order.)
      if (this.mode === 'race' && !opts.roster && opts.paceGrid !== false) {
        const lt = {}, lap = (t) => { const id = this.aiCarId(t); return lt[id] ??= this.limitsFor(id, this.edgeFor(id).grip).reduce((a, v) => a + T.ds / Math.max(1, v), 0); };
        const key = new Map(ais.map(t => [t, lap(t) * (1 + Math.random() * 0.015)]));
        ais.sort((a, b) => key.get(a) - key.get(b));
      }
      order = [];
      for (let slot = 0, a = 0; slot < total; slot++) order.push(hasPlayer && slot === playerSlot ? 'P' : ais[a++ % ais.length]);
    }
    order.forEach((k, slot) => {
      const isPlayer = k === 'P';
      const teamIdx = isPlayer ? reserved : k;
      this.addCar(isPlayer ? this.playerTeamObj : this.teamFor(teamIdx), slot, isPlayer, teamIdx);
    });
    }
    this.player = this.cars.find(c => c.isPlayer) || null;
    this.setupClasses();
    // an endurance race's co-driver (opts.codriver { name, paceK, aggr, craft, mistakes }): shares your car (this.crew)
    if (this.timed && opts.codriver && this.player) this.crew = this.makeCrew(opts.codriver, opts.minShare);
    // drift points (race setup option): a scorer for your car (one per car later, for drift battles)
    this.drift = opts.drift === 'on' && this.player ? new DriftScore() : null;
    this.focus = this.player || this.cars[0];
    // flags, track limits, penalties (time trial: track limits delete the lap)
    this.rc = new RaceControl(this, this.mode === 'attract' ? 'off' : (opts.rules || 'arcade'));


    this.afterPick = this.mode === 'race' ? (opts.strategy !== false && this.player ? 'strategy' : 'intro') : 'racing';
    // the broadcast booth (broadcast.js, main.js plays it): 'full' talks through the race, 'intro' just the flyover
    // before it (offline: online starts run on a shared clock), 'off' neither
    const booth = this.mode === 'race' && this.player ? opts.commentary || 'off' : 'off';
    if (booth === 'full') this.bc = new Broadcast(this);
    this.bcIntro = booth !== 'off' && !this.net;
    // a timed session (practice / qualifying): this.quali holds it either way (kind says which)
    if (this.mode === 'quali' || this.mode === 'practice') {
      const time = (this.mode === 'practice' ? opts.practiceTime : opts.qualiTime) || 300;
      this.quali = { kind: this.mode, time, left: time, flag: false, done: false, field: [] };
    }
    // car select on the grid first (online: while the host's pick window is open)
    this.state = (this.net ? this.net.pick > 0 : opts.pickCar) && this.player && this.mode !== 'attract' ? 'carselect' : this.afterPick;
    this.stateT = 0;
    this.raceTime = 0;
    this.lightsOn = 0;
    this.camMode = CAMS.indexOf(opts.camera || 'chase');
    if (this.camMode < 0) this.camMode = 0;
    this.camYaw = this.focus.phys.h;
    this.camPos = new THREE.Vector3();
    this.shake = 0;
    this.tv = null;
    this.tvTimer = 0;
    this.finishOrder = [];
    this.events = [];
    this.voice = null;
    this.aiVoices = [];
    this.paused = false;
    this.wrongT = 0;
    if (this.mode !== 'attract') {
      this.voice = new EngineVoice(true);
      this.aiVoices = [new EngineVoice(false), new EngineVoice(false)];
    }
    this.lineMode = opts.racingLine || 'off';
    this.lineStyle = opts.lineStyle || 'blocks';
    if (this.player) { this.buildRacingLine(); this.buildPitGuide(); }
    this.buildSectors();
    this.mini = planMinis(this.T, this.corners, this.secCut); // (the mini-sectors: practice.js)
    // the weekend's track data (practice.js): what the run plan's jobs have found so far, and what it pays off with
    this.tdata = JSON.parse(JSON.stringify(opts.trackData || {}));
    this.prog = null;
    this.markers = this.player ? new BrakeMarkers(this) : null;
    if (this.markers) this.markers.set(this.tdata.acclim?.marks);
    if (opts.programme) this.setProgramme(opts.programme); // (a test day: the gates out from the start)
    this.pitLife = this.pit && !this.track.refModel ? new PitLife(this) : null; // (the teams' signs and crews; a reference model has its own garages)
    this.drivers = new RaceDrivers(this); // (the drivers on the grid, and on the podium)
    if (this.quali && this.state === 'racing') this.qualiStart();
    this.snapCamera();
    this.renderer = renderer;
  }

  // Hidden practice: an AI car laps at an optimistic speed plan; wherever it runs wide,
  // slides or leaves the track, it brakes earlier there next lap. Returns the learned limit.
  // the car type the race is built around (yours; online, the host's pick decides the AI's class)
  mainCarId() {
    if (this.net) { const g = this.net.grid.find(g => g.k === 'h' && g.id === this.net.myId); return carId(g && g.car); }
    return carId(this.opts.car);
  }
  // how tight the racing line is at each sample (1/m: the circle through the points ~8 m either side)
  lineCurv() {
    const T = this.T, N = T.N, O = this.line, k = Math.max(1, Math.round(8 / T.ds)), K = this.lineK = new Float32Array(N);
    const px = (i) => T.X[i] + T.RX[i] * O[i], pz = (i) => T.Z[i] + T.RZ[i] * O[i];
    for (let i = 0; i < N; i++) {
      const a = (i - k + N) % N, b = (i + k) % N, ax = px(a), az = pz(a), bx = px(i), bz = pz(i), cx = px(b), cz = pz(b);
      const A2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
      K[i] = 2 * A2 / Math.max(1e-6, Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az));
    }
    return K;
  }
  // the racing line for a car here: the smoothest line (track.js), then fitted to the car's grip, power, drag and
  // downforce (raceline.js: 1-3 s a lap quicker for the AI, and a line worth following). Street and fun cars (heavier,
  // looser) keep 2 m from the edges, the racing classes 1.6. Kept for the play session and saved in the browser (the 30
  // most recent circuit + car combinations, ~10 KB each). (lineKind 'old': the smoothest line, for dev benches)
  lineFor(id) {
    if (!CARS[id]) id = 'f1';
    if (id === 'svgp') id = 'f1';
    if (this.opts.lineKind === 'old') { this.edgeM = null; return computeRacingLine(this.T); }
    const mg = this.lineMargins(id); // (also how close the AI may steer to the edges: this.edgeM, saved line or not)
    // (the smoothest line, the fit's start, held 1.6 m in: starting it on the kerbs too was no quicker, Auburn and
    // Mount Panorama 2026-10-09; opts.kerbBase: try it)
    const base = computeRacingLine(this.T, this.opts.kerbBase ? mg.margins || mg.margin : 1.6);
    const key = this.lineKey(id);
    let O = LINES_CACHE.get(key) || loadLine(key, this.T.N);
    if (!O && this.mode === 'attract') return base; // (the menu's backdrop race doesn't wait for a fit)
    if (!O) {
      const lc = lineCar(CARS[id].spec); if (this.opts.lineComb) lc.comb = this.opts.lineComb;
      O = fastLine(this.T, base, lc, mg).O;
      if (this.opts.lineCheck !== false) O = this.checkLine(id, base, O);
      saveLine(key, O);
    }
    LINES_CACHE.set(key, O);
    return O;
  }
  // How close to the edges the fitted line may go: the car's centre this far in (street and fun cars, heavier and
  // looser, 2 m; the racing classes 1.6), and at the corners' kerbs much closer (kerbMargin: 0.9 / 0.6 m, two wheels on
  // the kerb, as a driver uses them to straighten a chicane or an S; eased in over ~15 m either side so the line doesn't
  // kink where they start). opts.kerbMargin false: the plain margin everywhere, as before. Also sets this.edgeM, how
  // close the AI may steer to each edge (1.3 m in, or the kerb's margin less 0.1).
  lineMargins(id) {
    const T = this.T, N = T.N, KB = this.A.KERB, street = ['street', 'shitbox', 'fun'].includes(CARS[id]?.cls);
    const m0 = this.opts.lineMargin ?? (street ? 2 : 1.6), mkO = this.opts.kerbMargin;
    if (mkO === false || !KB) { this.edgeM = null; return { margin: m0 }; }
    const mk = Math.min(m0, mkO ?? (street ? 0.9 : 0.6)), r = Math.max(1, Math.round(15 / T.ds));
    const M = new Float32Array(N), E = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let k = 0; for (let d = -r; d <= r && k < 1; d++) if (KB[(i + d + N) % N]) k = Math.max(k, 1 - Math.abs(d) / (r + 1));
      M[i] = m0 - (m0 - mk) * k; E[i] = Math.min(1.3, M[i] - 0.1);
    }
    this.edgeM = E;
    return { margins: M };
  }
  // The model behind the fitted line is simple: on a few circuits (Monaco's walls and hairpins) the real car is slower
  // on it. So the first time, the AI learns both lines in the real physics and does a clean lap on each: the quicker
  // one is kept (and its learned plan with it, so the race doesn't learn it again).
  checkLine(id, base, fit) { return this.pickLine(id, [this.tryLine(id, base), this.tryLine(id, fit)]); }
  // the AI learns a line in the real physics and does a clean lap on it
  tryLine(id, O) {
    const savedCars = this.cars, savedLine = this.line;
    this.cars = this.cars || []; this.line = O; this.limits = {};
    const V = this.learnLimits(CARS[id].spec, 1), meta = { w: this.wearPerM, g: this.refGrip }, rounds = this.learnRounds;
    this.limits[id] = V; (this.limitMeta ||= {})[id] = meta;
    const t = this.simLap(id, { tyre: this.condTyre() });
    this.cars = savedCars; this.line = savedLine;
    return { O, V, meta, rounds, t };
  }
  // the quicker of the tries (smooth, fitted), and its plan kept so the race doesn't learn it again
  pickLine(id, tries) {
    const win = tries[1].t < tries[0].t ? tries[1] : tries[0];
    this.limits = { [id]: win.V }; this.limitMeta[id] = win.meta; this.learnRounds = win.rounds;
    const key = this.limitsKey(id, id), hit = { V: win.V, meta: win.meta, rounds: win.rounds }; // (its own line: it's the main car)
    if (!this.opts.freshPlans) { LIMITS_CACHE.set(key, hit); savePlan(key, hit); }
    this.lineCheckT = tries.map(x => x.t); // (dev benches: smooth vs fitted)
    return win.O;
  }
  // lineFor as steps ([label, fn]: the fit a stage at a time, then each check), for a build that keeps the page
  // responsive (prepare); the last step sets the line. Nothing to do when it's saved.
  lineSteps(id) {
    if (!CARS[id]) id = 'f1';
    if (id === 'svgp') id = 'f1';
    const set = () => { this.line = this.lineFor(id); this.lineOwner = id; this.lineK = null; };
    if (this.opts.lineKind === 'old' || this.mode === 'attract') return [['Building the circuit', set]];
    const mg = this.lineMargins(id);
    const key = this.lineKey(id);
    if (LINES_CACHE.get(key) || loadLine(key, this.T.N)) return [['Building the circuit', set]];
    const base = computeRacingLine(this.T, this.opts.kerbBase ? mg.margins || mg.margin : 1.6), lc = lineCar(CARS[id].spec); if (this.opts.lineComb) lc.comb = this.opts.lineComb;
    const gen = fastLineSteps(this.T, base, lc, mg), job = { fit: null, tries: [] };
    const steps = [];
    for (let k = 0; k < 6; k++) steps.push(['Fitting the racing line to your car', () => { for (let n = 0; n < 4 && !job.fit; n++) { const r = gen.next(); if (r.done) job.fit = r.value.O; } }]);
    steps.push(['Fitting the racing line to your car', () => { while (!job.fit) { const r = gen.next(); if (r.done) job.fit = r.value.O; } }]);
    if (this.opts.lineCheck !== false) {
      steps.push(['Testing the line in your car (1 of 2)', () => job.tries.push(this.tryLine(id, base))]);
      steps.push(['Testing the line in your car (2 of 2)', () => job.tries.push(this.tryLine(id, job.fit))]);
    }
    steps.push(['Testing the line in your car (2 of 2)', () => {
      const O = job.tries.length === 2 ? this.pickLine(id, job.tries) : job.fit;
      saveLine(key, O); LINES_CACHE.set(key, O); set();
    }]);
    return steps;
  }

  lineKey(id) {
    const T = this.T; let h = 0;
    for (let i = 0; i < T.N; i += 7) h = (h * 31 + Math.round(T.X[i] * 10) * 7 + Math.round(T.Z[i] * 10) + Math.round(T.W[i] * 10)) | 0;
    return `${this.track.name}|${T.N}|${h}|${id}|${LINE_VERSION}${this.opts.lineMargin ? `|m${this.opts.lineMargin}` : ""}${this.opts.lineComb ? `|c${this.opts.lineComb}` : ""}${this.opts.kerbMargin === false ? '|nokerb' : this.opts.kerbMargin != null ? `|k${this.opts.kerbMargin}` : ''}${this.opts.kerbBase ? '|kb1' : ''}`;
  }
  // grip: the AI's grip edge from the difficulty (DIFF.grip): learned with it, so the plan uses it
  limitsFor(id, grip = 1) {
    if (!CARS[id]) id = 'f1';
    if (id === 'svgp') id = 'f1'; // same physics
    const lk = grip === 1 ? id : `${id}|g${grip}`;
    if (!this.limits[lk]) {
      // (learned once per play session for each circuit, car and weather: practice, qualifying and the race reuse it)
      const key = this.limitsKey(id) + (grip === 1 ? '' : `|g${grip}`);
      let hit = LIMITS_CACHE.get(key);
      if (this.opts.freshPlans) hit = null; // (dev benches: always learn)
      else if (!hit && (hit = loadPlan(key))) LIMITS_CACHE.set(key, hit);
      if (hit) { this.limits[lk] = hit.V; if (grip === 1 || !(this.limitMeta || {})[id]) (this.limitMeta ||= {})[id] = hit.meta; this.learnRounds = hit.rounds; return hit.V; }
      const prev = this.lineV, w = this.wearPerM, rg = this.refGrip;
      this.limits[lk] = this.learnLimits(CARS[id].spec, grip);
      const meta = { w: this.wearPerM, g: this.refGrip }; // (tyre use / grip of this car here: for its strategy)
      if (grip === 1 || !(this.limitMeta || {})[id]) (this.limitMeta ||= {})[id] = meta;
      const fresh = { V: this.limits[lk], meta, rounds: this.learnRounds };
      LIMITS_CACHE.set(key, fresh); savePlan(key, fresh);
      if (prev) { this.lineV = prev; this.wearPerM = w; this.refGrip = rg; }
    }
    return this.limits[lk];
  }
  // the circuit's shape (a cheap fingerprint of its samples, so an edited circuit with the same name learns afresh)
  limitsKey(id, owner = this.lineOwner || this.mainCarId()) {
    const T = this.T; let h = 0;
    for (let i = 0; i < T.N; i += 7) h = (h * 31 + Math.round(T.X[i] * 10) * 7 + Math.round(T.Z[i] * 10) + Math.round(T.W[i] * 10)) | 0;
    // (the plan is learned on a line fitted to the race's main car: whose line it is is part of the key)
    // (a car whose spec was reworked carries a rev: what was learned for it before is no use now)
    const rv = (k) => CARS[k]?.rev ? `${k}r${CARS[k].rev}` : k;
    return `${this.track.name}|${T.N}|${h}|${this.rain ? 1 : 0}${this.dirt ? 'd' : ''}|${rv(id)}${this.opts.lineKind === 'old' ? '' : `|l${LINE_VERSION}${this.opts.kerbMargin === false ? 'nk' : this.opts.kerbMargin != null ? 'k' + this.opts.kerbMargin : ''}|on${rv(owner)}`}`;
  }
  learnLimits(spec = CARSPEC, gripEdge = 1) {
    const T = this.T, N = T.N, grip = (this.rain ? 0.97 : 1) * (this.dirt ? SURFACES.dirt[0] : 1);
    const vmax = Math.min(95, spec.gears[spec.gears.length - 1] * 0.99);
    const base = computeSpeedProfile(T, this.line, { mu: spec.mu * 1.36 * grip, kdm: spec.kd / spec.mass, vmax, brake: 1.05 }).V;
    // scale: how far this car can go past (or must stay under) the textbook speed at each point. It's learned both ways:
    // clean stretches are pushed faster each lap until they go wrong once; that level (minus a margin) becomes the
    // ceiling there. (Only ever slowing down left road cars well under what they can really do.)
    // (where the textbook speed is over the car's top speed, start the scale at top speed: otherwise "slow down here"
    // only trims a number the top-speed cap hides, and a fast kink the car can't take flat never gets slower)
    const scale = new Float32Array(N).fill(1), cap = new Float32Array(N).fill(1.4);
    for (let i = 0; i < N; i++) if (base[i] > vmax) { scale[i] = vmax / base[i]; cap[i] = scale[i]; } // (and never above top speed: raising it there does nothing)
    const floor = Float32Array.from(scale, x => 0.7 * x);
    const V = new Float32Array(N);
    const aBk = spec.mu * grip * 1.05, kdm = spec.kd / spec.mass;
    const apply = () => {
      for (let i = 0; i < N; i++) V[i] = Math.min(vmax, base[i] * scale[i]);
      // braking pass, so a faster corner is still approached from a speed the car can stop from
      for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) {
        if (i === T.cut) continue;
        const nx = V[(i + 1) % N];
        V[i] = Math.min(V[i], Math.sqrt(nx * nx + 2 * aBk * (9.81 + kdm * nx * nx) * T.ds));
      }
    };
    apply();
    this.lineV = V;
    const back = Math.ceil(140 / T.ds), fwd = Math.ceil(10 / T.ds);
    const savedState = this.state, savedDmg = this.damageK, savedLaps = this.laps, savedErr = this.mistakeP; this.state = 'racing'; this.damageK = 0; this.laps = Infinity; this.mistakeP = 0;
    const car = {
      phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
      ai: { pace: 1, bias: 0, over: 0, stuckT: 0, react: 0 }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} },
    };
    car.phys.rain = this.rain; car.phys.wearK = 0; car.phys.isAI = true; car.phys.gripMul = gripEdge; car.phys.fitTyres(this.condTyre());
    this.refGrip = car.phys.gripNow();
    const flying = (idx) => {
      car.phys.place(T.X[idx] + T.RX[idx] * this.line[idx], T.Z[idx] + T.RZ[idx] * this.line[idx], Math.atan2(T.FX[idx], T.FZ[idx]));
      const v = V[idx] * 0.9; car.phys.vx = T.FX[idx] * v; car.phys.vz = T.FZ[idx] * v; car.phys.gear = Math.min(6, spec.gears.length - 1);
      car.idx = idx; this.updateTracker(car, true);
    };
    let rounds = 0, clean = 0, everClean = false;
    this.learnLog = []; // (hits per practice lap, + = still speeding up somewhere: for .devtest/aibench.js)
    const good = Float32Array.from(scale); // the last plan that ran a clean lap
    const MAX_ROUNDS = 40;
    for (; rounds < MAX_ROUNDS; rounds++) {
      // (closed loops: lap after lap without stopping, like in the race, so every corner is tried arriving at the
      // speed it really gets, not from a set-up flying start)
      if (rounds === 0 || T.open) flying(0);
      car.phys.fitTyres(this.condTyre()); car.phys.wearK = 1;
      const hits = [];
      let dist = 0, lastIdx = car.idx, cool = 0;
      for (let f = 0; f < 60 * 150 && dist < (T.open ? T.raceL : T.L); f++) {
        const ctl = this.aiControls(car, 1 / 60);
        for (let k = 0; k < 4; k++) { car.phys.step(1 / 240, ctl, this.surfaceEnv(car)); this.updateTracker(car); this.barriers(car); }
        const d = (car.idx - lastIdx + N) % N; if (d < N / 2) dist += d * T.ds; lastIdx = car.idx;
        const p = car.phys;
        const heading = Math.sin(p.h) * T.FX[car.idx] + Math.cos(p.h) * T.FZ[car.idx];
        // (also: running wide, far off the line and within a car's width of the edge = understeering)
        const wide = Math.abs(car.s) > T.W[car.idx] / 2 - 1.2 && Math.abs(car.s - this.line[car.idx]) > 3;
        const bad = !car.onRoad || wide || p.slipR > 0.3 || heading < 0.8 || Math.abs(car.s) > T.W[car.idx] / 2 + 1.1;
        if (cool > 0) cool--;
        else if (bad) { hits.push(car.idx); cool = 90; }
        if (bad && p.speed < 6) flying((car.idx + 10) % N);
      }
      const used = 1 - Math.min(car.phys.tyre.wf, car.phys.tyre.wr);
      this.wearPerM = used / Math.max(1, dist) / TYRES[this.condTyre()].rate; // usage factor on this track
      if (!hits.length) { good.set(scale); everClean = true; }
      // where it went wrong: slow down, and never try that fast there again
      const hit = new Uint8Array(N);
      for (const h of hits) for (let k = -back; k <= fwd; k++) {
        const j = (h + k + N) % N; hit[j] = 1;
        cap[j] = Math.min(cap[j], scale[j] * 0.97);
        scale[j] = Math.max(floor[j], Math.min(cap[j], scale[j] * 0.965));
      }
      // everywhere else: try a bit faster, up to the ceiling
      const before = Float32Array.from(scale);
      for (let j = 0; j < N; j++) if (!hit[j]) scale[j] = Math.min(cap[j], scale[j] * 1.04);
      // keep the learned limit smooth
      const tmp = Float32Array.from(scale);
      for (let i = 0; i < N; i++) { let m = Infinity; for (let k = -6; k <= 6; k++) m = Math.min(m, tmp[(i + k + N) % N]); scale[i] = m; }
      let raised = false;
      for (let j = 0; j < N; j++) if (scale[j] > before[j] * 1.004) { raised = true; break; }
      this.learnLog.push(hits.length + (raised ? '+' : ''));
      // two clean laps in a row at the final plan (one can be luck)
      if (!hits.length && !raised) { if (++clean >= 2) break; } else clean = 0;
      apply();
    }
    // out of rounds while still probing: fall back to the last plan that was clean (if none ever was, keep what it has
    // learned so far: slower where it went wrong, which beats the untested first guess)
    if (rounds >= MAX_ROUNDS && everClean) { scale.set(good); apply(); }
    this.state = savedState; this.damageK = savedDmg; this.laps = savedLaps; this.mistakeP = savedErr;
    this.learnRounds = rounds;
    return V;
  }

  // One clean, hidden lap in the real physics: the time an AI driver can do here at this pace (qualifying uses it, so
  // the grid order matches how fast everyone really is). Closed loops: from a flying start well before the line, timed
  // line to line. Point-to-point: a standing start from the grid, timed start line to finish line.
  // (rec: a LapRecorder to record the lap with: the Lap Review's reference lap)
  // (laps: on a closed loop, the average of that many laps in a row: a driver with random flaws needs a few)
  // A car's team, for the pit boxes: World Career's real teams (entries' tid: both cars share a garage, you and your
  // teammate too), else each car its own (Quick Race's teams have one car each).
  teamKey(teamIdx) {
    const E = this.opts.entries, e = E && E[teamIdx];
    if (e && e.tid != null) return 't:' + e.tid;
    const pl = this.player || (this.cars || []).find(c => c.isPlayer);
    if (E && pl && pl.teamIdx === teamIdx) { const m = Object.values(E).find(x => x && x.mate); if (m && m.tid != null) return 't:' + m.tid; }
    return 'i:' + teamIdx;
  }
  // which pit box a team uses (an index into pit.boxes, numbered from the pit entry): yours is the last, nearest the exit,
  // so the crew drives you the whole lane and you've time to choose the stop on the way in; every other team its own
  // (its first car's slot, round the boxes there are; the next free one if that's taken). Online: each car's own, as
  // before (every machine would put its own player last).
  boxSlot(teamIdx) {
    const n = this.pit ? this.pit.boxes.length : 1;
    if (!this.pit) return teamIdx % n;
    // (online: the drivers get the boxes nearest the exit, in grid-list order, the same on every copy; the AI share the
    // rest. Box 0 is right by the entry: too close to stop in from pit-entry speed)
    if (this.net) { const H = this.net.grid.filter(g => g.k === 'h').map(g => g.team), h = H.indexOf(teamIdx);
      return h >= 0 ? Math.max(0, n - 1 - h) : teamIdx % Math.max(1, n - H.length); }
    const pl = this.player || (this.cars || []).find(c => c.isPlayer), idxs = [...(this.cars || []).map(c => c.teamIdx), ...(this.quali ? this.qualiTeams || [] : [])];
    const sig = idxs.join() + '|' + (pl ? pl.teamIdx : '') + '|' + teamIdx;
    if (this._boxSig !== sig) {
      this._boxSig = sig;
      const first = new Map(); for (const t of [...idxs, teamIdx].sort((a, b) => a - b)) { const k = this.teamKey(t); if (!first.has(k)) first.set(k, t); }
      const box = this._box = new Map(), used = new Set(), mine = pl ? this.teamKey(pl.teamIdx) : null;
      if (mine) { box.set(mine, n - 1); used.add(n - 1); }
      for (const [k, t] of first) { if (box.has(k)) continue; let b = t % n; for (let g = 0; g < n && used.has(b); g++) b = (b + 1) % n; box.set(k, b); used.add(b); }
    }
    return this._box.get(this.teamKey(teamIdx)) ?? teamIdx % n;
  }
  // the other car of a car's team (World Career), or null
  teamMate(car) { const k = this.teamKey(car.teamIdx); return this.cars.find(o => o !== car && !o.gone && this.teamKey(o.teamIdx) === k) || null; }
  // Double stacking: a car of the same team already at (or nearer) the box, or just pulling out of it. The car behind
  // waits short of the box (in the working lane, between its box and the next one back, out of the fast lane) until
  // it's clear; the wait is the cost of stacking.
  boxBusy(car) {
    const pit = this.pit; if (!pit || this.net) return null;
    const k = this.boxSlot(car.teamIdx), box = pit.boxes[k], N = this.T.N, ds = this.T.ds, to = (c) => ((box - c.idx + N) % N) * ds, from = (c) => ((c.idx - box + N) % N) * ds;
    for (const o of this.cars) {
      if (o === car || !o.pitting || o.gone || this.boxSlot(o.teamIdx) !== k || (o.pitReq && (o.pitReq.dt || o.pitReq.garage))) continue;
      if (o.pitPhase === 'stop' || (o.pitPhase === 'out' && from(o) < 9) || (o.pitPhase === 'in' && pit.REG[o.idx] >= 0 && to(o) < to(car))) return o;
    }
    return null;
  }
  // the car's plan for the HUD's car diagram: its real proportions (body, wheelbase, track, wheels), open-wheeled or
  // not, with a wing worth showing or not
  hudShape(car) {
    const P = car.phys.p, B = bodyBox(P);
    return { open: CARS[car.carId]?.cls === 'f1', aero: (P.kdRef ?? P.kd) >= 0.3, f: B.f, r: B.r, w: B.w, a: P.a, b: P.b, tw: car.phys.susp.tw, wr: P.wheelR ?? 0.33 };
  }
  // your car's setup changed (the Tuning screen, from the pit garage): its physics takes the active setup from now on
  // (the car's standing in the box, so its suspension simply starts again from rest)
  applySetup(car) {
    const id = car.carId; if (!id || this.opts.setups === false) return;
    const st = activeSetup(id); car.phys.p = applySetup(CARS[id].spec, st, id); car.phys.setupSuspension(); setStance(car.model, stanceOf(st, id));
  }
  simLap(id, { pace = 1, power = 1, grip = 1, tyre = 'soft', rec = null, skill = null, tc = null, laps = 1, temps = 0, cold = false, probe = null } = {}) {
    const T = this.T, N = T.N, spec = CARS[id].spec, V = this.limitsFor(id, grip);
    const saved = { state: this.state, dmg: this.damageK, laps: this.laps, err: this.mistakeP, rc: this.rc };
    this.state = 'racing'; this.damageK = 0; this.laps = Infinity; this.mistakeP = 0; this.rc = null;
    const car = {
      phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
      ai: { pace, bias: 0, over: 0, stuckT: 0, react: 0, errCd: 1e9, skill }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} },
    };
    const p = car.phys;
    p.rain = this.rain; p.wearK = 0; p.isAI = true; p.powerMul = power; p.gripMul = grip;
    if (temps) { p.tempMode = temps; p.ambT = this.ambT ?? 30; p.blankets = !cold; } // (benches: tyre temperatures, probe(p, t) each frame)
    p.fitTyres(this.dirt ? 'dirt' : this.rain ? 'wet' : tyre);
    if (tc != null) p.setAids({ ...AI_AIDS, tc });
    let start = -1, time = Infinity, t = 0, lastIdx;
    if (T.open) {
      const g = gridSlot(T, 0); p.place(g.x, g.z, g.heading); car.idx = g.idx;
    } else {
      const i0 = (N - Math.round(Math.min(T.L * 0.3, 300) / T.ds)) % N, v = V[i0] * 0.9;
      p.place(T.X[i0] + T.RX[i0] * this.line[i0], T.Z[i0] + T.RZ[i0] * this.line[i0], Math.atan2(T.FX[i0], T.FZ[i0]));
      p.vx = T.FX[i0] * v; p.vz = T.FZ[i0] * v; p.gear = Math.min(6, spec.gears.length - 1); car.idx = i0;
    }
    this.updateTracker(car, true); lastIdx = car.idx;
    const endAt = T.open ? T.finish : 0;
    let done = 0; if (T.open) laps = 1;
    for (let f = 0; f < 60 * 240 * laps; f++) {
      const ctl = this.aiControls(car, 1 / 60);
      for (let k = 0; k < 4; k++) { p.step(1 / 240, ctl, this.surfaceEnv(car)); this.updateTracker(car); this.barriers(car); if (rec && start >= 0) rec.sample(car, t, start); }
      t += 1 / 60; if (probe) probe(p, t, car);
      const prev = lastIdx, cur = car.idx; lastIdx = cur;
      if (start < 0) {
        if (T.open ? (prev > T.cut && cur <= T.cut && cur < T.finish / 2) : (prev > N * 0.75 && cur < N * 0.25)) start = t;
      } else if (T.open ? (prev < endAt && cur >= endAt && cur <= T.cut) : (prev > N * 0.75 && cur < N * 0.25 && t - start > 5 * (done + 1))) { if (++done >= laps) { time = (t - start) / laps; break; } }
    }
    if (rec) rec.lap = isFinite(time) ? rec.finish(car, time, { valid: true, ref: true }, start) : null;
    this.state = saved.state; this.damageK = saved.dmg; this.laps = saved.laps; this.mistakeP = saved.err; this.rc = saved.rc;
    return time;
  }

  // the AI field: 'class' = cars from the same class as yours (the F1 grid drives your F1 model), 'custom' / 'svgp' /
  // 'mixed' = the F1 models, 'multi' = every class mixed. Picked from the team index, so every online client agrees.
  // World Career: race slots carry real people (their own team, colours and name) instead of the stock TEAMS
  teamFor(teamIdx) { return this.opts.entries?.[teamIdx]?.team || ALL_TEAMS[teamIdx]; }
  // who's in a car, for their looks (js/drivers.js): a World Career person's id, else the stock driver's name
  driverId(teamIdx, team = this.teamFor(teamIdx)) { return this.opts.entries?.[teamIdx]?.pid || team.driver || team.name; }
  aiChassisFor(teamIdx) {
    const ai = this.opts.aiChassis || 'class';
    const main = this.opts.aiClassCar || this.mainCarId(), cls = (CARS[main] || CARS.f1).cls;
    const ent = this.opts.entries?.[teamIdx];
    if (ent && ent.chassis && ai === 'class') return ent.chassis; // (World Career: a team's two cars are the same model)
    // (a multiclass race: opts.mixCls { cls, teams }: those teams race the other class; no list: every other team)
    const mx = this.opts.mixCls; if (mx && mx.cls !== cls && (mx.teams ? mx.teams.includes(teamIdx) : teamIdx % 2 === 1)) { const list = carsInClass(mx.cls); if (list.length) return mx.cls === 'f1' ? 'custom' : chassisKey(list[teamIdx % list.length]); }
    if (ai === 'mixed') return teamIdx % 2 ? 'custom' : 'svgp';
    if (ai === 'same') return main === 'svgp' ? 'svgp' : cls === 'f1' ? 'custom' : chassisKey(main); // (a spec race: everyone in your model)
    if (ai === 'custom' || ai === 'svgp') return ai;
    if (ai === 'multi') { const all = Object.keys(CARS).filter(k => k !== 'svgp'); return chassisKey(all[teamIdx % all.length]); }
    if (cls === 'f1') return 'custom';
    const list = carsInClass(cls);
    return chassisKey(list[teamIdx % list.length]);
  }

  addCar(team, slot, isPlayer, teamIdx, extra = {}) {
    const T = this.T;
    const g = gridSlot(T, slot);
    // which car: yours / the online player's garage car, the AI's from the chosen field
    let cfg = teamCar(team, teamIdx);
    cfg.chassis = this.aiChassisFor(teamIdx);
    // the driver's own helmet (for life) and the team's suit (js/drivers.js)
    if (!isPlayer && !extra.human) { const did = this.driverId(teamIdx, team); Object.assign(cfg, { helmetDesign: { ...driverHelmet(did), number: true }, helmet: driverHelmet(did).base, suit: teamSuit(team) }); }
    if (isPlayer && this.opts.car) cfg = this.playerCfg(this.opts.car, team, teamIdx);
    if (extra.cfg) cfg = { ...extra.cfg };
    const id = carId(cfg);
    // (your car, and an online player's own: the setup they race this car with, setup.js; the AI the standard one.
    // opts.setups false: none, for benches)
    const mine = (isPlayer || (extra.human && !extra.remote)) && this.opts.setups !== false, setup = mine ? activeSetup(id) : null;
    const phys = new CarPhysics(setup ? applySetup(CARS[id].spec, setup, id) : CARS[id].spec);
    phys.place(g.x, g.z, g.heading);
    const mods = isPlayer ? this.opts.mods : null;
    if (isPlayer) {
      phys.auto = this.opts.gearbox !== 'manual'; phys.setAids(this.opts.aids ? physAids(this.opts.aids) : AI_AIDS);
      if (mods) {
        phys.powerMul = mods.power; phys.dfMul = mods.downforce; phys.dragMul = mods.drag; phys.brakeMul = mods.brake;
        phys.gripMul = mods.grip * (this.rain ? mods.rainGrip : 1) * (mods.softs ? 1.02 : 1);
      }
      if (this.bopTrim?.[id]) phys.gripMul *= this.bopTrim[id]; // (World Career: this circuit's trim of your model's balance of performance)
    } else if (!extra.human) {
      phys.powerMul = this.opts.aiSetup?.[teamIdx]?.power ?? this.edgeFor(id).power * (1 - Math.random() * this.diff.spread * 0.5);
      phys.gripMul = this.edgeFor(id).grip;
      phys.isAI = true;
    }
    phys.rain = this.rain; phys.wearK = this.wearK * (mods ? mods.wear : 1);
    // tyre temperatures (physics.js tyreHeat): race classes fit their tyres out of warmers, road cars cold
    phys.tempMode = this.tempMode; phys.ambT = this.ambT; phys.blankets = BLANKETS.has(CARS[id].cls);
    phys.bentOn = phys.engOn = this.damageK >= 1.5; // (Realistic damage: the suspension corner by corner, the radiator and the engine's heat)
    const model = buildF1(cfg, { texSize: isPlayer ? 2048 : 512, low: !isPlayer && !extra.human && this.cars.length > 5 });
    if (setup) setStance(model, stanceOf(setup, id)); // (its ride height and camber, on the model)
    if (phys.bentOn) setBend(model, phys); // (a bent corner's wheel sits crooked)
    if (extra.tag) model.group.add(nameTag(extra.name, cfg.main));
    model.pull = phys.pull;
    groundCar(model);
    this.scene.add(model.group);
    const car = {
      phys, model, team, teamIdx, isPlayer, carId: id, lineV: this.limitsFor(id, !isPlayer && !extra.human ? this.edgeFor(id).grip : 1), name: extra.name || (isPlayer ? (this.opts.playerName || 'YOU') : team.driver),
      remote: !!extra.remote, human: !!(extra.human || isPlayer), key: extra.key || null,
      idx: g.idx, i: g.idx, f: 0, s: g.s, lap: 0, cpNext: 1, lapStart: 0, lapTimes: [], best: Infinity, last: 0,
      finished: false, finishTime: 0, progress: -10, surface: 'road', onRoad: true,
      q: new THREE.Quaternion(), y: 0, offT: 0,
      ai: isPlayer || extra.human || extra.remote ? null : { pace: this.diff.pace * (1 - Math.random() * this.diff.spread), bias: (Math.random() - 0.5) * 1.2, over: 0, stuckT: 0, react: this.opts.startFix === false ? 0.15 + Math.random() * 0.45 : 0.06 + Math.random() * 0.14 },
      ctl: { steer: 0, throttle: 0, brake: 0 },
      pos: 0, pits: 0, pitting: false, pitPhase: null, pitTimer: 0, pitReq: null, radio: {},
      startPos: slot + 1, maxDmg: 0, dmgK: mods ? mods.damage : 1, pitBonus: mods ? mods.pitTime : 0, slipK: mods ? mods.slip : 1,
      basePower: phys.powerMul, launch: !!(mods && mods.launch), extra,
      rub: true, // (on the rubber: wheelGround; the AI's hidden practice laps aren't)
    };
    if (car.ai && this.opts.teamPace) car.ai.pace *= this.opts.teamPace[teamIdx] || 1;
    // their technique (aiskill.js): World Career drivers from their ratings, Rookie / Pro fields from the difficulty
    const tf = car.ai ? this.techFor(teamIdx, id) : null;
    if (tf) {
      car.ai.skill = tf.skill; if (tf.skill) phys.setAids({ ...AI_AIDS, tc: tf.tc });
      if (!this.opts.aiSetup?.[teamIdx]) car.ai.pace = this.techPace(car.ai.pace, tf, id); // (else: qualifying's pace, below)
    }
    // World Career: who's driving (their record is kept by pid), how hard and how cleanly they defend, how often they slip up
    const ent = !isPlayer && !extra.human ? this.opts.entries?.[teamIdx] : null;
    car.pid = isPlayer ? 'P' : ent ? ent.pid : null;
    if (car.ai && ent) { car.ai.aggr = ent.aggr; if (ent.craft != null) car.ai.craft = ent.craft; car.ai.mk = ent.mistakes; if (ent.mate) car.ai.trust = ent.trust; car.story = ent.story || null; car.owe = ent.owe || null; car.hired = !!ent.hired; } // (your teammate: how much they trust you, 0..100; a storyline with you: race.js storyRadio)
    if (car.ai && this.opts.aiSetup?.[teamIdx]) car.ai.pace = this.opts.aiSetup[teamIdx].pace; // (as fast as they were in qualifying)
    // starting tyres
    let start = this.condTyre();
    if (isPlayer && this.opts.startTyre && this.opts.startTyre !== 'auto') start = this.opts.startTyre;
    if (isPlayer && mods && mods.softs && !this.rain) start = 'soft';
    if (isPlayer && (this.mode === 'quali' || this.mode === 'practice') && !this.rain) start = 'soft'; // (sessions: a fresh set of the fastest tyre)
    if (isPlayer && this.opts.startSet) start = this.opts.startSet.c; // (World Career: qualifying starts on the set practice ended on)
    if (car.ai) { car.plan = this.planStrategy(); start = car.plan.stints[0].c; }
    phys.fitTyres(start); model.setCompound(start);
    if (isPlayer && this.opts.startSet) { phys.tyre.wf = this.opts.startSet.wf; phys.tyre.wr = this.opts.startSet.wr; }
    this.cars.push(car);
    this.updateTracker(car, true);
    this.placeModel(car, 1);
    return car;
  }

  // ---------- car select (on the grid, before the strategy) ----------
  // previewCar: only your car's model changes. commitCar: the real thing (physics, speed plan, racing line), and when the
  // AI field follows your class and the class changed, the whole grid is rebuilt in the same slots.
  // your car's look: the garage car, in your team's colours when you race for a team
  playerCfg(car, team, teamIdx) {
    const cfg = { ...car };
    // (racing for a stock team: its colours, and its livery when it has one, js/teamliveries.js)
    if (this.opts.team !== 'garage' && this.opts.team !== undefined) { const tc = teamCar(team, teamIdx); Object.assign(cfg, { main: tc.main, accent: tc.accent, third: tc.third, helmet: team.helmet, sponsor: tc.sponsor, scheme: tc.scheme, sponsorLogo: tc.sponsorLogo ?? cfg.sponsorLogo, sponsorTint: tc.sponsorTint }); }
    return cfg;
  }
  previewCar(cfg) {
    const pl = this.player; if (!pl) return;
    const model = buildF1(this.playerCfg(cfg, pl.team, pl.teamIdx), { texSize: 1024 });
    model.pull = pl.phys.pull;
    groundCar(model);
    model.setCompound(pl.phys.tyre.c);
    this.scene.remove(pl.model.group);
    pl.model = model; this.scene.add(model.group);
    this.placeModel(pl, 1);
    this.selPunch = 1; // camera eases in on the new car
  }
  commitCar(cfg) {
    const before = (CARS[this.player.carId] || CARS.f1).cls; // (the class the grid was built for)
    this.opts.car = { ...cfg }; this.diff = diffFor(this.opts); // (the F1 class has its own difficulty table)
    if (this.net) { const g = this.net.grid.find(g => g.k === 'h' && g.id === this.net.myId); if (g) g.car = { ...cfg }; }
    const id = this.mainCarId();
    // a different car: its own line (and the field's plans, learned on it)
    if (id !== this.lineOwner) { this.line = this.lineFor(id); this.lineOwner = id; this.lineK = null; this.limits = {}; this.paceCurves = {}; this.aiTech = {}; }
    this.lineV = this.limitsFor(id);
    const meta = this.limitMeta && this.limitMeta[id];
    if (meta) { this.wearPerM = meta.w; this.refGrip = meta.g; }
    // (online the host's lobby car decides the AI field, so only your car changes)
    const all = !this.net && (this.opts.aiChassis || 'class') === 'class' && CARS[id].cls !== before;
    for (const old of all ? [...this.cars] : [this.player]) this.rebuildCar(old, old.isPlayer && old.extra.cfg ? { ...old.extra, cfg: { ...cfg } } : old.extra);
    this.player = this.cars.find(c => c.isPlayer); this.focus = this.player; this.setupClasses();
    if (this.lineMesh) { this.disposeRacingLine(); this.buildRacingLine(); }
    if (this.prog) { const id = this.prog.id; this.setProgramme(null); this.setProgramme(id); } // (the gates at the new car's speeds)
    if (this.markers) { this.markers.key = null; this.markers.set(this.tdata.acclim?.marks); }
    this.pickedCar = true;
  }
  startAfterPick() { this.state = this.afterPick; this.stateT = 0; if (this.quali) this.qualiStart(); }
  // a car rebuilt in its grid slot (a new model / physics), keeping who drives it
  rebuildCar(old, extra) {
    this.scene.remove(old.model.group);
    const car = this.addCar(old.team, old.startPos - 1, old.isPlayer, old.teamIdx, extra);
    this.cars.pop(); this.cars[this.cars.indexOf(old)] = car;
    if (this.focus === old) this.focus = car;
    return car;
  }
  // online: another driver picked their car on the grid
  netCarPicked(key, cfg) {
    const old = this.cars.find(c => c.key === key);
    if (!old || !old.remote || old.gone || this.state === 'racing' || this.state === 'finished') return;
    const g = this.net.grid.find(g => g.k === 'h' && 'h:' + g.id === key); if (g) g.car = { ...cfg };
    const car = this.rebuildCar(old, { ...old.extra, cfg: { ...cfg } });
    car.net = old.net; car.netInit = false;
  }

  // ---------- tracking ----------
  updateTracker(car, global = false) {
    const T = this.T, N = T.N, p = car.phys;
    let best = car.idx, bd = Infinity;
    const test = (j) => {
      const dx = p.x - T.X[j], dz = p.z - T.Z[j], dy = (car.y || T.Y[j]) - T.Y[j];
      const d = dx * dx + dz * dz + dy * dy * 9;
      if (d < bd) { bd = d; best = j; }
    };
    if (!global) for (let k = -14; k <= 14; k++) test((car.idx + k + N) % N);
    const lim = T.W[best] / 2 + Math.max(this.A.BL[best], this.A.BR[best]) + 6;
    if (global || bd > lim * lim) {
      const prevBest = best, prevBd = bd;
      this.A.hash.query(p.x, p.z, 80, test);
      if (bd >= prevBd * 0.6) { best = prevBest; bd = prevBd; }
    }
    const prev = car.idx, jump = !global && car.i != null && circDist(prev, best, N) > 3;
    // (the ground under the car as the last stretch has it, relative to its road: see below)
    const g0 = jump && p.body ? this.groundZ(this.surfaceKind(prev, car.s, p.x, p.z), prev, car.s, T.D[car.i] + car.f * T.ds, p.x, p.z) : 0;
    car.idx = best;
    // segment projection
    let i = best;
    let along = (p.x - T.X[i]) * T.FX[i] + (p.z - T.Z[i]) * T.FZ[i];
    if (along < 0) { i = (i - 1 + N) % N; along += T.ds; }
    car.i = i; car.f = Math.max(0, Math.min(1, along / T.ds));
    car.s = (p.x - T.X[best]) * T.RX[best] + (p.z - T.Z[best]) * T.RZ[best];
    car.dist = Math.sqrt(bd);
    // Handed over to another part of the circuit (across a chicane's runoff, inside a hairpin): the car's body and
    // wheels are kept relative to the road under it, so they move by however much the ground under the car, measured
    // from the new stretch's road, differs from the old one's: the car keeps its height over the ground. Where both
    // describe the same ground (a reference model's) that holds it where it is (left alone, it was teleported against
    // its own springs and launched); where each has its own (the plain ground: the road's edge carried out) it's left
    // with the new one's, as it always was.
    if (jump && p.body) {
      const g1 = this.groundZ(this.surfaceKind(best, car.s, p.x, p.z), best, car.s, T.D[car.i] + car.f * T.ds, p.x, p.z), d = g1 - g0;
      if (Math.abs(d) > 1e-3 && Math.abs(d) < 3) {
        p.body.z += d;
        for (const a of [p.wz, p.we, p.wr]) if (a) for (let k = 0; k < a.length; k++) a[k] += d;
      }
    }
    if (!global && prev !== best) this.onIndex(car, prev, best);
  }

  onIndex(car, prev, cur) {
    if (car.remote) return; // laps of remote cars come from their owner
    const T = this.T, N = T.N;
    if (T.open) return this.onIndexOpen(car, prev, cur);
    const q = N / 4;
    if (car.lap > 0 && car.cpNext <= 3) {
      const c = car.cpNext * q;
      if (cur >= c && cur < c + q * 0.8 && prev < c + 2 && prev >= c - q * 0.5) car.cpNext++;
    }
    if (prev > N * 0.75 && cur < N * 0.25) {
      // qualifying: crossing the line in the pit lane doesn't start (or finish) a timed lap: it's an out / in lap
      if (this.quali && car.pitting) { car.lap = 0; car.cpNext = 1; car.lapInvalid = null; car.trace = null; car.sec = null; return; }
      if (car.lap === 0) { car.lap = 1; car.lapStart = this.raceTime; car.cpNext = 1; car.lapInvalid = null; car.trace = null; this.secStart(car); }
      else if (car.cpNext >= 4) this.completeLap(car);
    }
    if (car.lap > 0) this.secCross(car, prev, cur);
    if (car.isPlayer && car.lap > 0) this.traceLap(car, cur);
  }

  // point-to-point: the clock starts when you cross the start line, the run ends at the finish line
  // (checkpoints every quarter of the way make sure you actually drove it)
  onIndexOpen(car, prev, cur) {
    const T = this.T, F = T.finish, q = F / 4, onRoute = (i) => i <= T.cut;
    if (car.lap === 0) {
      if (!onRoute(prev) && onRoute(cur) && cur < F / 2) { car.lap = 1; car.lapStart = this.raceTime; car.cpNext = 1; car.lapInvalid = null; car.trace = null; this.secStart(car); }
      return;
    }
    if (car.lap === 1) this.secCross(car, prev, cur);
    if (car.isPlayer && car.lap === 1) this.traceLap(car, cur);
    if (car.lap !== 1) return;
    if (car.cpNext <= 3) {
      const c = car.cpNext * q;
      if (cur >= c && cur < c + q * 0.8 && prev < c + 2 && prev >= c - q * 0.5) car.cpNext++;
    }
    if (car.cpNext >= 4 && prev < F && cur >= F && cur <= T.cut) this.completeLap(car);
  }

  // point-to-point, time trial / menu background: back to the grid for another run
  restartRun(car) {
    const g = gridSlot(this.T, Math.max(0, (car.startPos || 1) - 1));
    const p = car.phys;
    p.place(g.x, g.z, g.heading); p.vx = p.vz = p.r = 0;
    car.idx = g.idx; car.lap = 0; car.cpNext = 1; car.runoffT = 0; car.lapInvalid = null; car.sec = null; if (car.tl) car.tl.out = false;
    if (car.isPlayer && this.prog) this.prog.restart();
    if (car.skL) car.skL = null; if (car.skR) car.skR = null;
    this.updateTracker(car, true);
    this.placeModel(car, 1);
    if (car === this.focus) this.snapCamera();
  }

  // time into the lap at every point of it (your best lap's is kept: the live delta on the HUD)
  // (the time the car was at the sample itself, not the frame its nearest sample changed: a frame is ~1/3 of a sample)
  traceLap(car, idx) {
    if (!car.trace) { car.trace = new Float32Array(this.T.N).fill(NaN); }
    const T = this.T, here = T.D[car.i] + car.f * T.ds;
    let ahead = here - T.D[idx];
    if (ahead > T.L / 2) ahead -= T.L; else if (ahead < -T.L / 2) ahead += T.L;
    car.trace[idx] = this.raceTime - car.lapStart - ahead / Math.max(5, car.phys.speed || 0);
  }
  // against the best lap at exactly where the car is (between its samples), not the nearest one, which made the
  // delta saw up and down by a sample's worth of time
  liveDelta(car) {
    if (!car.bestTrace || car.lap === 0 || car.pitting || car.finished || car.lapInvalid) return null;
    const B = car.bestTrace, a = B[car.i], b = B[(car.i + 1) % this.T.N];
    if (isNaN(a)) return null;
    const ref = isNaN(b) || b < a ? a : a + (b - a) * car.f;
    return this.raceTime - car.lapStart - ref;
  }

  // timing line: when each car crossed every sample of the race distance (interpolated within the frame), so a gap is
  // the time since the car ahead was exactly where you are now
  timeLine(car) {
    const T = this.T, N = T.N, r = car.raw, t = this.raceTime;
    if (car.finished && car.finRaw == null) car.finRaw = r;
    if (!car.tl2) { car.tl2 = { t: new Float64Array(N).fill(NaN), m: new Int32Array(N).fill(-1e9), r, at: t }; return; }
    const L = car.tl2, r0 = L.r, t0 = L.at;
    if (r > r0 && r - r0 < 60) {
      for (let m = Math.floor(r0 / T.ds) + 1, end = Math.floor(r / T.ds); m <= end; m++) {
        const k = ((m % N) + N) % N;
        L.t[k] = t0 + (t - t0) * (m * T.ds - r0) / (r - r0); L.m[k] = m;
      }
    }
    if (r > r0 || r0 - r > 60) { L.r = r; L.at = t; }
  }
  // when `car` was at race distance x (null if it hasn't been, or it's been overwritten by a later lap)
  timeAt(car, x) {
    const L = car.tl2, T = this.T, N = this.T.N;
    if (!L) return null;
    const m = Math.floor(x / T.ds), f = x / T.ds - m, a = ((m % N) + N) % N, b = (a + 1) % N;
    if (L.m[a] !== m || L.m[b] !== m + 1) return null;
    return L.t[a] + (L.t[b] - L.t[a]) * f;
  }

  // an AI driver's technique, the same all weekend: { skill (car.ai.skill), tc (traction control), cost (% a lap the
  // flaws are counted as costing: aiskill.js' estimate, at most 40% of a World Career driver's gap), gap (% a lap: the
  // World Career driver's gap to a clean lap, from their rating) }. A Rookie / Pro field gets flaws of about the
  // difficulty's size on top of its pace (made up for, its winners got quicker: in an F1, ~4 s a lap). (Measuring what the flaws cost, with hidden laps, was
  // too noisy to use: they're random, and a lap with one off costs more than a whole season of tidy ones.)
  techFor(t, id) {
    const memo = this.aiTech ||= {};
    if (t in memo) return memo[t];
    if (this.opts.noTech) return memo[t] = null; // (dev benches: everyone clean)
    const pre = this.opts.aiSetup?.[t];
    if (pre && 'tf' in pre) return memo[t] = pre.tf; // (the same driver all weekend)
    const ent = this.opts.entries?.[t];
    if (ent && (ent.skill || ent.gap)) {
      // what their flaws really cost in this car here: two laps at full pace with them, against the clean ones the pace
      // curve ran. It can come out negative (an impatient driver on less traction control can be quicker than the
      // careful clean AI in a road car), and then the pace multiplier makes up more; an estimate that assumed flaws
      // always cost had the field's least skilled drivers quickest
      // (measured at the pace they'll race at, not flat out: an impatient driver on less traction control gains at the
      // limit, where the car is, and nothing below it, so a cost measured at full pace over-slowed exactly those drivers)
      // So it's solved, not estimated: a lap with their flaws at the pace the curve suggests, a second at the pace that
      // corrects it, and the pace between the two that gives their gap; cost is set so techPace lands on it.
      const curve = this.paceCurve(id), C = curve.C, base = Math.min(1, this.diff.pace), gap = ent.gap || 0, want = curveCost(C, base) + gap;
      let cost = 0;
      if (ent.skill) {
        const E = this.edgeFor(id), loss = (p) => (this.simLap(id, { pace: p, power: E.power, grip: E.grip, tyre: 'soft', skill: ent.skill, tc: ent.tc ?? 1 }) / curve.t - 1) * 100;
        const p0 = curvePace(C, want), a0 = loss(p0);
        const p1 = Math.max(0.7, Math.min(1, curvePace(C, Math.max(0, curveCost(C, p0) + want - a0)))), a1 = Math.abs(p1 - p0) > 1e-4 ? loss(p1) : a0;
        const p = Math.abs(a1 - a0) > 1e-3 ? Math.max(0.7, Math.min(1, p0 + (p1 - p0) * (want - a0) / (a1 - a0))) : p1;
        cost = isFinite(a0) && isFinite(a1) ? want - curveCost(C, p) : 0; // (techPace: curvePace(C, curveCost(C, base) + gap - cost) = p)
      }
      return memo[t] = { skill: ent.skill || null, tc: ent.tc ?? 1, cost: Math.min(cost, 0.9 * gap), gap };
    }
    const k = !ent && this.diff.tech; if (!k) return memo[t] = null;
    const r = technique(CARS[id]?.cls, k * (0.7 + Math.random() * 0.6), k * (0.7 + Math.random() * 0.6));
    return memo[t] = r.skill ? { skill: r.skill, tc: r.tc, cost: 0, gap: 0 } : null; // (no pace made up: the flaws only add)
  }
  // the pace for a driver with technique tf: the lap time `pace` alone would give (plus their World Career gap), less
  // what their flaws already cost, read off this car's measured pace curve
  techPace(pace, tf, id) {
    if (!tf || (!tf.gap && !tf.cost)) return pace;
    const C = this.paceCurve(id).C;
    return curvePace(C, Math.max(0, curveCost(C, Math.min(1, pace)) + (tf.gap || 0) - tf.cost)) * Math.max(1, pace);
  }
  // The AI field, balanced to your car. A class's cars differ a lot (at Auburn a Phantom 964 laps 6% off a Phantom
  // M3 GTR), so with a mixed field the level said less about how hard the race was than which car you picked: in the
  // quickest car most of the field was slower than you before they'd made a mistake. So each AI model gets its own
  // edge in place of the level's: the power and grip that make one clean lap of it here as quick as one of your car's
  // with the level's edge (a Phantom AI in your car). Power first (no relearning: the plan's corners don't depend on
  // it), within 0.8-1.3x; what that can't close, grip (learning the circuit again with it), then power again to finish.
  // Quick races and championships with a field from your class (not World Career, whose cars differ on purpose; not
  // online; opts.balance false: the level's own edge for every car, as before).
  balancing() {
    const o = this.opts;
    return o.balance !== false && !this.net && !o.entries && this.mode !== 'attract' && this.mode !== 'test' && (o.aiChassis || 'class') === 'class' && !!o.car;
  }
  // (World Career: the series' balance of performance on top, opts.bop { chassis: [power, grip] }, the same for every
  // car; yours comes in through opts.mods)
  edgeFor(id) {
    const e = (this.balance && this.balance[id]) || { grip: this.diff.grip, power: this.diff.power }, b = this.opts.bop?.[id];
    return b ? { grip: +(e.grip * b[1] * (this.bopTrim?.[id] || 1)).toFixed(4), power: e.power * b[0] } : e;
  }
  balanceField(types) {
    const D = this.diff, M = this.mainCarId(), key = this.limitsKey(M) + `|bal|g${D.grip}|p${D.power}`;
    const memo = BALANCE.get(key) || loadBalance(key) || {};
    const lap = (id, grip, power) => this.simLap(id, { pace: 1, power, grip, tyre: 'soft' });
    let tM = memo.__t;
    const out = {};
    for (const id of types) {
      if (id === M) continue;
      if ((CARS[id] || CARS.f1).cls !== (CARS[M] || CARS.f1).cls) continue; // (multiclass: another class keeps the level's edge, its own pace)
      if (memo[id]) { out[id] = memo[id]; continue; }
      tM ??= lap(M, D.grip, D.power);
      let grip = D.grip, power = D.power, t = lap(id, grip, power);
      // power: a secant on log time against log power (a first guess of time ~ power^-0.25), twice
      const fitPower = () => {
        let x0 = Math.log(power), f0 = Math.log(t / tM), x1 = null, f1 = null;
        for (let k = 0; k < 2 && Math.abs(f0) > 0.003; k++) {
          const sl = x1 == null ? 0 : (f0 - f1) / (x0 - x1), slope = sl < -0.02 ? sl : -0.25;
          const x = Math.log(Math.max(0.8 * D.power, Math.min(1.3 * D.power, Math.exp(x0 - f0 / slope))));
          if (Math.abs(x - x0) < 1e-4) break; // (at the limit)
          x1 = x0; f1 = f0; x0 = x; power = Math.exp(x); t = lap(id, grip, power); f0 = Math.log(t / tM);
        }
      };
      fitPower();
      if (Math.abs(t / tM - 1) > 0.005) {
        // grip: a guess of time ~ grip^-0.35, the circuit learned with it, then power again from the level's
        grip = +(D.grip * Math.max(0.85, Math.min(1.35, Math.pow(t / tM, 1 / 0.35)))).toFixed(3);
        power = D.power; this.limitsFor(id, grip); t = lap(id, grip, power);
        fitPower();
      }
      out[id] = { grip, power: +power.toFixed(3), t: +t.toFixed(2) };
    }
    out.__t = tM ?? memo.__t;
    const save = { ...memo, ...out }; BALANCE.set(key, save); saveBalance(key, save);
    this.balance = out;
    if (this.balanceLog) this.balanceLog.push({ main: M, t: tM, ...out });
  }

  // World Career: the series' balance of performance (opts.bop, the season's figures) trimmed for this circuit. Every
  // model in the table runs a clean lap here with the season's figures; about two-thirds of what each is quicker or
  // slower than the middle one comes off (or goes on) its grip, ballast as the bulletin has it; the rest stays, so each
  // car keeps its circuits without deciding a race. The model, not the car: yours gets the same, and your condition and
  // upgrades sit on top. Measured once per circuit, model set and level (the balance store), so a circuit you made is
  // measured the first time it's raced and any after that load as before.
  trimming() { return !!(this.opts.bop && this.opts.entries && !this.net && this.mode !== 'test'); }
  trimIds(types) { const main = this.mainCarId(); return [...new Set([...Object.keys(this.opts.bop), main, ...types])].filter(id => CARS[id] && this.opts.bop[id]); }
  trimKey() { return this.limitsKey('trim') + `|trim|g${this.diff.grip}|p${this.diff.power}|` + Object.entries(this.opts.bop).map(([k, v]) => `${k}${v[0].toFixed(3)}/${v[1].toFixed(3)}`).sort().join(','); }
  trimLap(id) {
    const memo = (this.trimLaps ||= loadBalance(this.trimKey()) || {});
    if (memo.done || memo[id]) return;
    const b = this.opts.bop[id], grip = +(this.diff.grip * b[1]).toFixed(4);
    memo[id] = { t: this.simLap(id, { pace: 1, power: this.diff.power * b[0], grip, tyre: 'soft', laps: 2 }), grip }; // (two laps: a single one from the rolling start can be a percent out)
  }
  trimBop(ids) {
    const key = this.trimKey(), memo = (this.trimLaps ||= loadBalance(key) || {});
    if (memo.done) { this.bopTrim = memo.trim; return; }
    const ok = ids.filter(id => memo[id] && isFinite(memo[id].t));
    if (ok.length < 2) { this.bopTrim = {}; return; }
    const ts = ok.map(id => memo[id].t).sort((a, b) => a - b), mid = ts[Math.floor(ts.length / 2)];
    const E = { street: 0.45, gt2: 0.4, gt1: 0.35, f1: 0.6 }[CARS[ok[0]].cls] || 0.45; // (a percent of grip in lap time, about: .devtest/lapk.mjs)
    const trim = {};
    for (const id of ok) { const d = memo[id].t / mid - 1; trim[id] = +Math.max(0.92, Math.min(1.08, 1 + (2 / 3) * d / E)).toFixed(4); memo[id].want = mid * (1 + d / 3); }
    memo.trim = trim; memo.mid = mid; this.bopTrim = trim;
  }
  // a plan learned at a slightly different grip can come out half a percent either way (the learning's own noise), so
  // each trimmed car runs again, and a second step from the two real laps (no assumed sensitivity) lands on its target
  trimCheck(id) {
    const memo = this.trimLaps; if (!memo || memo.done || !memo.trim || !memo[id] || memo[id].want == null) return;
    const g0 = memo[id].grip, t0 = memo[id].t, tr = memo.trim[id], g1 = +(g0 * tr).toFixed(4), want = memo[id].want;
    const t1 = Math.abs(tr - 1) > 1e-4 ? this.simLap(id, { pace: 1, power: this.diff.power * this.opts.bop[id][0], grip: g1, tyre: 'soft', laps: 2 }) : t0;
    if (!isFinite(t1) || Math.abs(t1 / want - 1) < 0.0015) return;
    const E = { street: 0.45, gt2: 0.4, gt1: 0.35, f1: 0.6 }[CARS[id].cls] || 0.45;
    let k = Math.abs(g1 - g0) > 1e-4 ? Math.log(t1 / t0) / Math.log(g1 / g0) : -E;
    if (!(k < -0.15 && k > -1.2)) k = -E; // (noise can make grip look worthless, or worse: then the usual sensitivity)
    const step = Math.pow(want / t1, 1 / k), first = Math.abs(Math.log(tr)) || 0.01; // (and no more than twice the first step's size)
    memo.trim[id] = +Math.max(0.92, Math.min(1.08, tr * Math.exp(Math.max(-2 * first, Math.min(2 * first, Math.log(step)))))).toFixed(4);
  }
  trimDone() {
    const memo = this.trimLaps; if (!memo || memo.done || !memo.trim) return;
    memo.done = true; this.bopTrim = memo.trim; saveBalance(this.trimKey(), memo);
    if (this.trimLog) this.trimLog.push({ mid: memo.mid, laps: Object.fromEntries(Object.entries(memo).filter(([, v]) => v && v.t).map(([k, v]) => [k, v.t])), trim: memo.trim });
  }

  // how much lap time a car loses here to a lower pace multiplier: clean hidden laps at 1, 0.97, 0.94 and 0.88 (cars
  // differ a lot near 1: an M1 at Auburn loses nothing at 0.97, it can't reach the plan's speed in most places anyway)
  paceCurve(id) {
    // (the car as it races: the level's edge, and in World Career its balance of performance, trim and all)
    const E = this.edgeFor(id), memo = this.paceCurves ||= {}, key = this.limitsKey(id) + `|g${E.grip}|p${(+E.power).toFixed(4)}|c2`; // (c2: six points)
    if (memo[id]) return memo[id];
    const hit = PACE_CURVES.get(key) || loadCurve(key);
    if (hit) return memo[id] = hit;
    const lap = (pace) => this.simLap(id, { pace, power: E.power, grip: E.grip, tyre: 'soft', laps: 2 });
    const t = lap(1), pt = (p, lo) => { const c = (lap(p) / t - 1) * 100; return isFinite(c) ? Math.max(lo, c) : lo + 1; };
    // (six points, not four: a road car often loses nothing down to about 0.92 and then a lot, a bend straight lines
    // between 0.94 and 0.88 couldn't follow, so a World Career driver's first percent or so of gap came out as nothing)
    const C = [[1, 0]]; let lo = 0.02;
    for (const p of [0.97, 0.94, 0.91, 0.88, 0.84, 0.8]) { const c = pt(p, lo); C.push([p, c]); lo = c + 0.05; }
    memo[id] = { t, C: C.map(x => x.map(v => +v.toFixed(3))) };
    PACE_CURVES.set(key, memo[id]); saveCurve(key, memo[id]);
    return memo[id];
  }

  // ---------- qualifying ----------
  // You on a clear track against the clock; the AI field's laps come from the physics (simLap) at the pace each of them
  // would race at, posted two or three times over the session like real runs. Out of the pit box to start.
  qualiStart() {
    const q = this.quali; if (!q || q.started) return;
    q.started = true;
    // (online: the host simulates the field and sends it; everyone else waits for it, netField)
    if (this.net && !this.net.host) { q.field = []; if (this.player) this.enterGarage(this.player, true); return; }
    const R = Math.random, pl = this.player, dur = q.time;
    // the field
    q.field = this.qualiTeams.map((t) => {
      const team = this.teamFor(t), id = carId({ ...teamCar(team, t), chassis: this.aiChassisFor(t) });
      // (the same driver all weekend: practice hands its pace / power on to qualifying through opts.aiSetup)
      const pre = this.opts.aiSetup && this.opts.aiSetup[t];
      const pace0 = this.diff.pace * (1 - R() * this.diff.spread) * (this.opts.teamPace ? this.opts.teamPace[t] || 1 : 1);
      const power = pre ? pre.power : this.edgeFor(id).power * (1 - R() * this.diff.spread * 0.5);
      // (their technique costs what it costs in a race: the clean simulated lap, slowed by that much)
      const tf = this.techFor(t, id), pace = pre ? pre.pace : this.techPace(pace0, tf, id);
      let pot = this.simLap(id, { pace, power, grip: this.edgeFor(id).grip, tyre: 'soft' }) * (1 + (tf ? tf.cost : 0) / 100);
      if (!isFinite(pot)) pot = this.baseLap() * 1.25;
      const plan = [], practice = q.kind === 'practice';
      // qualifying: 2-5 runs, early ones scruffier, the last the real thing. practice: a run every few minutes on
      // heavier fuel and older tyres, getting closer to their pace as the session goes on. Now and then one's deleted.
      const runs = practice ? Math.max(3, Math.min(10, Math.round(dur / 240))) : Math.max(2, Math.min(5, Math.round(dur / 150) + 1));
      for (let k = 0; k < runs; k++) {
        const at = practice ? dur * (k + 0.2 + R() * 0.6) / runs : dur * (k === runs - 1 ? 0.8 + R() * 0.17 : (k + 0.35 + R() * 0.4) / runs);
        const slow = practice ? 0.004 + R() * 0.012 + 0.02 * (1 - k / runs)
          : k === runs - 1 ? (R() - 0.35) * 0.006 : 0.004 + R() * 0.01 - k * 0.003;
        plan.push({ at, time: pot * (1 + slow), del: R() < 0.08 });
      }
      return { teamIdx: t, name: team.driver, team, color: team.main, id, pace, power, tf, pot, plan, best: Infinity, when: Infinity };
    });
    // you start in your garage. Point-to-point sessions are runs, not laps: a few each (practice 4, qualifying 2),
    // each from a standing start at the top, back to the garage after each one (to change tyres), done when they're used
    if (this.T.open) { q.runs = q.kind === 'practice' ? 4 : 2; q.used = 0; }
    if (pl) this.enterGarage(pl, true);
  }
  // online: the host's field for this session ({ teamIdx, name, color, id, pot, plan }), the same laps at the same times
  netField(list) {
    const q = this.quali; if (!q || q.netField) return;
    q.netField = true;
    q.field = list.map(e => { const team = this.teamFor(e.teamIdx); return { ...e, team, color: team.main, best: Infinity, when: Infinity, plan: e.plan.map(r => ({ ...r, done: false })) }; });
  }
  fieldForNet() { return (this.quali?.field || []).map(e => ({ teamIdx: e.teamIdx, name: e.name, id: e.id, pot: e.pot, plan: e.plan.map(r => ({ at: r.at, time: r.time, del: r.del })) })); }
  // ---------- the garage (practice / qualifying) ----------
  // in the garage your car is off the track (gone, like a retired car, but only until you go out); the session goes on
  enterGarage(car, first = false) {
    car.inGarage = true; car.gone = true; car.model.group.visible = false; car.sec = null;
    car.pitting = false; car.pitPhase = null; car.pitReq = null; car.lap = 0; car.cpNext = 1; car.trace = null; car.lapInvalid = null;
    car.phys.vx = car.phys.vz = car.phys.r = 0;
    this.events.push({ type: 'garage', first });
  }
  // what the crew would have to do, in seconds of session time per part (a bent wing is quicker than a broken one)
  garageWork(car) {
    const d = car.phys.dmg, t = (x, base, per) => x > 0.03 ? Math.round(base + per * Math.min(1, x)) : 0;
    return { fw: t(d.fw, 60, 90), rw: t(d.rw, 90, 120), fl: t(d.fl || 0, 90, 180), ch: t(d.ch, 120, 300), rad: t(d.rad || 0, 90, 150), gb: t(d.gb || 0, 120, 240) };
  }
  // fix everything: the session clock runs on meanwhile. Returns the seconds it took.
  // keys: just those parts (fw rw ch rad gb: garageWork's), else all of it
  garageRepair(car, keys = null) {
    const w = this.garageWork(car), ks = keys || Object.keys(w), tot = ks.reduce((a, k) => a + (w[k] || 0), 0); // (fw rw fl ch rad gb)
    if (!tot) return 0;
    this.skipTime(tot);
    if (keys) car.phys.repairParts(keys.map(k => k === 'ch' ? 'su' : k)); else car.phys.repairAll();
    car.model.setDamage(car.phys.dmg);
    return tot;
  }
  // back out: 'flying' = straight onto a flying lap, 'drive' = down the pit lane from the box and an out lap.
  // tyre: a new set to fit first (TYRE_FIT seconds of the session), or null to keep the set on the car
  // the crew fits a set in the garage (new, or a used one off the rack: { c, wf, wr }); the session clock runs on meanwhile
  fitSet(car, set) {
    this.skipTime(TYRE_FIT);
    car.phys.fitTyres(set.c); car.phys.tyre.wf = set.wf ?? 1; car.phys.tyre.wr = set.wr ?? 1;
    car.model.setCompound(set.c);
  }
  leaveGarage(car, how, tyre) {
    if (tyre) { this.skipTime(TYRE_FIT); car.phys.fitTyres(tyre); car.model.setCompound(tyre); }
    car.inGarage = false; car.gone = false; car.model.group.visible = true;
    if (this.T.open) { if (this.quali && car.isPlayer) this.quali.used = (this.quali.used || 0) + 1; this.restartRun(car); car.runoffT = 0; this.snapCamera(); }
    else if (how === 'drive' && this.pit) {
      const pit = this.pit, b = pit.boxes[this.boxSlot(car.teamIdx)], T = this.T;
      const off = pit.side * (pit.CEN[b] + 2.4);
      car.phys.place(T.X[b] + T.RX[b] * off, T.Z[b] + T.RZ[b] * off, Math.atan2(T.FX[b], T.FZ[b]));
      car.idx = b; car.laneSide = undefined; this.updateTracker(car, true);
      car.pitting = true; car.pitPhase = 'out'; car.pitReq = null; car.lap = 0;
      this.placeModel(car, 1); this.snapCamera();
    } else this.flyingStart(car);
    this.focus = car;
    if (car.isPlayer && this.prog) this.prog.restart();
    if (car.isPlayer) this.qsimLeave(car);
  }
  // a point-to-point session run is over (finished, or given up from the pause menu): back to the garage at the top;
  // the last of your runs ends the session
  endRun(car) {
    const q = this.quali; if (!q || q.done) return;
    car.runoffT = 0;
    this.enterGarage(car);
    if (q.runs && q.used >= q.runs) this.qualiEnd();
  }
  // the garage's 'skip ahead': the clock jumps on, the AI's laps in that time go up
  skipTime(sec) {
    const q = this.quali; if (!q || q.done || this.net) return; // (online the clock is everyone's: nobody skips it)
    q.left = Math.max(1, q.left - sec);
    const el = q.time - q.left;
    for (const e of q.field) for (const r of e.plan) if (!r.done && r.at <= el) this.qualiPost(e, r);
  }
  // put a car on the racing line on the straightest bit before the line (80-350 m back), pointed along the line, at
  // the speed it would carry there, in the right gear (not mid-corner: dropped in at an apex it went into the wall)
  flyingStart(car) {
    const T = this.T, N = T.N, LV = car.lineV || this.lineV, ds = T.ds;
    const near = Math.round(80 / ds), far = Math.max(near + 1, Math.round(Math.min(350, T.L * 0.3) / ds)), w = Math.round(30 / ds);
    let i = (N - near) % N, best = Infinity;
    for (let b = near; b <= far; b++) {
      const k = (N - b) % N; let m = 0;
      for (let j = -w; j <= w; j++) m = Math.max(m, Math.abs(T.K[(k + j + N) % N]));
      if (m < best - 1e-5) { best = m; i = k; }
    }
    const p = car.phys, v = Math.max(12, LV[i] * 0.9), o = this.line[i], j = (i + 3) % N, oj = this.line[j];
    const x = T.X[i] + T.RX[i] * o, z = T.Z[i] + T.RZ[i] * o, hx = T.X[j] + T.RX[j] * oj - x, hz = T.Z[j] + T.RZ[j] * oj - z, hl = Math.hypot(hx, hz) || 1;
    p.place(x, z, Math.atan2(hx, hz));
    p.vx = hx / hl * v; p.vz = hz / hl * v;
    const G = p.p.gears; let g = 1; while (g < G.length - 1 && v > G[g] * 0.92) g++;
    p.gear = g;
    car.idx = i; car.pitting = false; car.pitPhase = null; car.pitReq = null; car.lap = 0; car.cpNext = 1; car.laneSide = undefined; car.sec = null;
    if (car.isPlayer) car.autoT = 2; // (the first two seconds drive themselves, so you're not thrown in at speed cold)
    this.updateTracker(car, true);
    this.placeModel(car, 1); this.snapCamera();
  }
  qualiUpdate(dt) {
    const q = this.quali; if (!q || !q.started || q.done || this.state !== 'racing') return;
    // (online: the host's clock, from when everyone had loaded; until then it hasn't started)
    if (this.net) q.left = this.net.goT == null ? q.time : Math.max(0, q.time - Math.max(0, (this.net.clock() - this.net.goT) / 1000));
    else q.left = Math.max(0, q.left - dt);
    const el = q.time - q.left;
    for (const e of q.field) for (const r of e.plan) if (!r.done && r.at <= el) this.qualiPost(e, r);
    const pl = this.player;
    if (!q.flag && q.left <= 0) {
      q.flag = true;
      // (a lap you're already on still counts: finish it)
      const onLap = pl && pl.lap > 0 && !pl.pitting;
      this.events.push({ type: 'qflag', onLap });
      if (!onLap) this.qualiEnd();
    } else if (q.flag && pl && (pl.lap === 0 || pl.pitting)) this.qualiEnd();
  }
  qualiPost(e, r) {
    r.done = true;
    const q = this.quali, where = this.corners.list.length ? 'Turn ' + (1 + Math.floor(Math.random() * this.corners.list.length)) : '';
    if (r.del) { if (this.rc && this.rc.on) this.rc.say(`Lap deleted · ${e.name} · track limits${where ? ' ' + where : ''}`, { cls: 'w' }); return; }
    this.secPosted(e, r.time);
    if (r.time >= e.best) return;
    const pole = this.qualiRows()[0];
    e.best = r.time; e.when = this.raceTime; e.flash = this.raceTime;
    // (a new provisional pole: announced, but not in a burst when the first laps all come in together)
    if ((!pole || r.time < pole.best) && this.raceTime - (q.poleMsg ?? -99) > 6) { q.poleMsg = this.raceTime; this.events.push({ type: 'qpole', name: e.name, time: r.time, kind: q.kind }); }
  }
  // the session is over: every run still to come is posted, then the results
  qualiEnd() {
    const q = this.quali; if (!q || q.done) return;
    for (const e of q.field) for (const r of e.plan) if (!r.done) this.qualiPost(e, r);
    q.done = true; q.left = 0;
    this.state = 'finished'; this.stateT = 0;
    this.events.push({ type: 'qdone' });
  }
  // the timing screen: best laps, fastest first (no time: at the back, in the order they'd be on the grid)
  qualiRows() {
    const q = this.quali; if (!q) return [];
    const pl = this.player;
    const rows = q.field.map(e => ({ key: e.teamIdx, name: e.name, team: e.team.name, color: e.color, best: e.best, when: e.when, flash: e.flash, isPlayer: false, sec: e.secBest || null }));
    if (pl) rows.push({ key: 'P', name: pl.name, team: pl.team.name, color: pl.team.main, best: pl.best, when: pl.bestWhen ?? Infinity, flash: pl.bestWhen, isPlayer: true, sec: pl.secBest || null });
    for (const c of this.cars) if (c.remote && c.human) rows.push({ key: c.teamIdx, name: c.name, team: c.team.name, color: c.team.main, best: c.best, when: c.bestWhen ?? Infinity, flash: c.bestWhen, isPlayer: false, human: true, pid: c.pid });
    // (laps set first, quickest first, earlier breaking a tie; no lap yet behind them. Kept consistent for the sort: two
    // without a time compare as equal, not as Infinity - Infinity, or the order comes out scrambled and a driver with no
    // time can end up first)
    const has = (r) => isFinite(r.best);
    rows.sort((a, b) => (has(b) - has(a)) || (has(a) && a.best !== b.best ? a.best - b.best : 0) || (a.when === b.when ? 0 : a.when < b.when ? -1 : 1) || (a.isPlayer === b.isPlayer ? 0 : a.isPlayer ? 1 : -1));
    const pole = rows[0] && isFinite(rows[0].best) ? rows[0].best : null;
    rows.forEach((r, k) => { r.pos = k + 1; r.gap = pole && isFinite(r.best) && k ? r.best - pole : null; });
    return rows;
  }
  // what the race after qualifying needs: the grid, the same AI teams, and each AI driver as fast as they were
  qualiGrid() {
    const q = this.quali;
    return {
      gridOrder: this.qualiRows().map(r => r.key),
      roster: q.field.map(e => e.teamIdx).concat(this.cars.filter(c => c.remote && c.human).map(c => c.teamIdx)),
      aiSetup: Object.fromEntries(q.field.map(e => [e.teamIdx, { pace: e.pace, power: e.power, tf: e.tf }])),
    };
  }

  completeLap(car) {
    if (this.mode === 'race' && this.order && this.order[0] === car) car.led = (car.led || 0) + 1; // (laps led: World Career's sponsors ask)
    const t = this.raceTime - car.lapStart;
    // (a lap where you broke track limits doesn't count as your best: race control deletes it)
    const valid = !car.lapInvalid;
    car.lapTimes.push(t);
    (car.lapValid || (car.lapValid = [])).push(valid);
    car.last = t; car.lastInvalid = !valid;
    const wasBest = valid && t < car.best;
    if (wasBest) { car.best = t; car.bestWhen = this.raceTime; if (car.trace) car.bestTrace = car.trace; }
    if (car.isPlayer && this.rec) this.recordLap(car, t, valid);
    this.secLap(car, valid);
    car.lapInvalid = null; car.trace = null;
    car.lapStart = this.raceTime;
    if (!this.T.open) this.secStart(car);
    car.cpNext = 1;
    car.lap++;
    if (car.isPlayer) this.events.push({ type: 'lap', time: t, best: wasBest, lap: car.lap, laps: this.laps, invalid: !valid });
    if (car.isPlayer && this.prog) this.programmeLap();
    if (car.isPlayer && this.quali && this.quali.flag) this.qualiEnd();
    if (this.timed && !this.timed.flag && this.order && this.order[0] === car) this.timedLeaderLap(car);
    if ((car.lap > this.laps || (this.timed && this.timed.flag) || (this.multi && this.finishOrder.length > 0)) && !car.finished) {
      car.finished = true; car.finishTime = this.raceTime;
      // (an endurance race: a driver short of the minimum drive time is out of the results)
      if (car.isPlayer && this.crew) { const c = this.crew, m = c.min * this.timed.dur * 0.97; if (c.t.P < m || c.t.C < m) { car.dsq = true; this.events.push({ type: 'radio', vo: null, msg: `We're disqualified: ${c.t.P < m ? 'you' : c.name} didn't drive the minimum time.`, big: true }); } }
      this.addFinish(car);
      if (car.isPlayer) { this.events.push({ type: 'finish', pos: this.finishOrder.length, pen: car.pen || 0 }); this.state = 'finished'; this.stateT = 0; }
    }
  }

  // ---------- multiclass: more than one class in the race ----------
  // Each car's class (car.cls); with two or more (this.multi), their order by pace here (this.clsRank: 0 the
  // quickest, from each class's quickest learned lap). Positions are kept per class as well (classPos), a slower car
  // with a quicker class right behind gets the blue flag (racecontrol.js), and when the overall leader takes the flag
  // the race is over for everyone at their next time over the line (results by laps, then time).
  setupClasses() {
    const T = this.T, lap = {};
    for (const c of this.cars) {
      c.cls = (CARS[c.carId] || CARS.f1).cls;
      const t = (c.lineV || this.lineV).reduce((a, v) => a + T.ds / Math.max(1, v), 0);
      lap[c.cls] = Math.min(lap[c.cls] ?? Infinity, t);
    }
    const ks = Object.keys(lap).sort((a, b) => lap[a] - lap[b]);
    this.multi = ks.length > 1;
    this.clsRank = Object.fromEntries(ks.map((k, i) => [k, i]));
  }
  // a car's place in its class, and how many in it (live, from the running order)
  classPos(car) {
    let p = 0, n = 0; for (const c of this.order || this.cars) { if (c.cls !== car.cls || c.gone) continue; n++; if (c === car) p = n; }
    return { pos: p, n };
  }

  // how many steps a frame the race runs (main.js): your co-driver's stint watched faster
  get ff() { return this.crew && this.crew.cur === 'C' && !this.net ? this.crew.ff : 1; }
  // ---------- an endurance race's co-driver (this.crew) ----------
  // You and your co-driver share the car: cur 'P' (you) or 'C', t: seconds each has driven, min: the share of the race
  // each must drive (the rules). At each stop the engineer asks whether to swap (the radio call, X / B: their pick if
  // you don't answer before the box); a swap the rules need is made for you. While your co-driver drives, the call box
  // is theirs: X watches faster (1x, 4x, 8x), B skips to your next stint (main.js runs the race on, flat out).
  makeCrew(co, min = 0.3) {
    const d = this.diff, ai = { pace: d.pace * (co.paceK ?? 0.97), bias: (Math.random() - 0.5) * 0.6, over: 0, stuckT: 0, react: 0.1, aggr: co.aggr ?? 0.4, craft: co.craft, mk: co.mistakes };
    return { cur: 'P', co, name: co.name || 'Co-driver', t: { P: 0, C: 0 }, min, ai, swap: false, ff: 1 };
  }
  // how long each still has to drive (s), the race time left, a stint's length
  crewNeed() {
    const c = this.crew, t = this.timed, R = Math.max(0, t.dur - this.raceTime);
    return { P: Math.max(0, c.min * t.dur - c.t.P), C: Math.max(0, c.min * t.dur - c.t.C), R, stint: t.dur / t.stints };
  }
  // in for a stop: the call (or the rules' say)
  crewStop(car) {
    const c = this.crew; if (!c || this.timed.flag) return;
    const n = this.crewNeed(), other = c.cur === 'P' ? 'C' : 'P', short = (who) => n[who] > 0 && n[who] >= n.R - n.stint * 1.05;
    const first = c.name.split(' ').pop(), mm = (s) => `${Math.floor(s * this.timed.k / 3600)}h ${String(Math.round(s * this.timed.k / 60) % 60).padStart(2, '0')}m`;
    c.swap = false;
    // (the rules: the other driver can't make their minimum unless they get in now; or the one in the car must stay)
    if (short(other)) { c.swap = true; this.events.push({ type: 'radio', vo: 'crew.must', msg: c.cur === 'P' ? `Box, box: you hand over to <b>${first}</b>. They still need ${mm(n.C)} in the car.` : `<b>${first}</b> is boxing: <b>you're in</b>. You still need ${mm(n.P)} in the car.`, big: true }); return; }
    if (short(c.cur)) { this.events.push({ type: 'radio', vo: 'crew.stay', msg: c.cur === 'P' ? `You stay in: you still need ${mm(n.P)} to make your minimum.` : `${first} stays in this stop.` }); return; }
    if (this.skipping) { c.swap = true; return; } // (skipping to your stint: this is it)
    // (else the engineer's pick: take turns, a stint each)
    const rec = c.cur === 'P' ? (c.t.P >= c.t.C ? 'a' : 'b') : 'a';
    this.openCall({ kind: 'crew', who: 'eng', vo: null, msg: c.cur === 'P' ? `Swap with <b>${first}</b> at this stop?` : `<b>${first}</b> is boxing. Take over?`,
      a: c.cur === 'P' ? `Hand over to ${first}` : 'Take over', b: c.cur === 'P' ? 'Stay in' : `${first} stays in`, rec, until: this.raceTime + 12,
      run: (w) => { c.swap = w === 'a'; this.events.push({ type: 'radio', vo: null, msg: c.swap ? (c.cur === 'P' ? `Copy. ${first} gets in.` : `Copy. You're in, get ready.`) : (c.cur === 'P' ? 'Copy. Double stint.' : `Copy. ${first} stays out.`) }); } });
  }
  // the change, at the end of the stop
  crewSwap(car) {
    const c = this.crew; c.cur = c.cur === 'P' ? 'C' : 'P'; c.swap = false;
    if (this.call && this.call.kind === 'crew') { this.call = null; this.events.push({ type: 'callDone', which: null, late: true }); }
    if (c.cur === 'P') { car.ai = null; c.ff = 1; this.skipping = false; this.events.push({ type: 'crew', who: 'P' }); }
    else { car.ai = c.ai; this.events.push({ type: 'crew', who: 'C' }); this.crewPanel(); }
  }
  // the co-driver's stint: the call box is theirs (X: watch faster, B: skip to your stint)
  crewPanel() {
    const c = this.crew, first = c.name.split(' ').pop(), next = c.ff >= 8 ? 1 : c.ff * 4 > 8 ? 8 : c.ff * 4;
    this.openCall({ kind: 'crewDrive', who: 'eng', vo: null, msg: `<b>${c.name}</b> is driving${c.ff > 1 ? ` · ${c.ff}x` : ''}`, a: next === 1 ? 'Watch at 1x' : `Watch at ${next}x`, b: 'Skip to my stint', rec: null, until: Infinity,
      run: (w) => { if (w === 'a') c.ff = next; else this.skipping = true; if (c.cur === 'C' && !this.skipping) this.crewPanel(); } });
  }

  // a timed race: the leader's done a lap. The clock's run out: this was the last (the flag is out for everyone);
  // else how many more it looks like doing, from its laps so far
  timedLeaderLap(car) {
    const t = this.timed, done = car.lap - 1, left = t.dur - this.raceTime;
    if (left <= 0) { t.flag = true; this.laps = done; this.events.push({ type: 'timedflag' }); return; }
    const avg = done > 0 ? this.raceTime / done : t.lapEst;
    this.laps = Math.max(done + 1, done + Math.ceil(left / avg));
  }
  // the race clock, as the race's own hours (left: still to run)
  timedClock() { const t = this.timed; return t ? { left: Math.max(0, t.dur - this.raceTime) * t.k, total: t.dur * t.k, flag: t.flag, tod: this.tod0 != null ? this.todHour() % 24 : null } : null; }
  // the hour of the day now (an endurance race whose time of day moves: from opts.startHour, on the race clock)
  todHour() { return this.tod0 + this.raceTime * (this.timed ? this.timed.k : 1) / 3600; }

  // the Lap Review's reference: a clean lap by the AI in your car on your tyres, at the pace a quick human drives
  // (a touch under the AI's limit), recorded like one of yours. Cached per car + compound.
  // It has to be clean to be worth copying: a lap that leaves the road, slides wide or hits a wall is driven again a
  // touch slower (a quick car on a tricky corner can be over the edge at the AI's pace), else the tidiest one is kept.
  referenceTelemetry(id, tyre) {
    const k = id + '|' + tyre, c = this.refTel || (this.refTel = {});
    if (!(k in c)) {
      let best = null, bestBad = Infinity;
      for (const pace of [0.97, 0.95, 0.93, 0.9, 0.87, 0.84]) {
        const rec = new LapRecorder(this.T); this.simLap(id, { pace, tyre, rec });
        const lap = rec.lap; if (!lap) continue;
        const bad = this.lapFaults(lap);
        if (bad < bestBad) { best = lap; bestBad = bad; }
        if (bad <= 2) break; // (clean, give or take a blemish of a metre or two)
      }
      c[k] = best;
    }
    return c[k];
  }
  // how untidy a recorded lap is: samples with a wheel off the road, the rear well past its grip, or a hit on a barrier
  // or another car (0 = clean)
  lapFaults(lap) {
    const T = this.T, ch = lap.ch, n = T.open ? T.finish + 1 : T.N;
    let bad = 0;
    let slide = 0;
    for (let i = 1; i < n; i++) {
      if ((ch.aid[i] & (128 | 256)) || Math.abs(ch.s[i]) > T.W[i] / 2 + 0.3) bad++;
      // (a moment of oversteer is fine: only a slide held for more than ~10 m counts)
      slide = ch.sr[i] > 2.2 ? slide + 1 : 0;
      if (slide * T.ds > 10) bad++;
    }
    return bad;
  }

  // hand a finished lap of yours to the Lap Review store (per circuit + car)
  recordLap(car, t, valid) {
    const lap = this.rec.finish(car, t, {
      valid, lap: car.lapTimes.length, mode: this.quali ? this.quali.kind || 'quali' : this.mode, car: car.carId,
      tyre: car.phys.tyre.c, wear: Math.min(car.phys.tyre.wf, car.phys.tyre.wr), rain: !!this.rain, when: Date.now(),
    });
    if (lap) addLap(lapKey(this.track, this.T, car.carId), lap);
    // a new best: that's the ghost to chase from the next lap
    if (lap && lap.valid && this.ghostOn() && (this.opts.ghost || 'best') === 'best' && (!this.ghostLap || lap.time < this.ghostLap.time)) {
      this.ghostLap = lap;
      if (!this.ghost) this.buildGhost();
    }
  }

  // ---------- the ghost car (time trial, practice, qualifying) ----------
  // A see-through copy of your car driving a recorded lap alongside you: your best (today's, or your best ever here if
  // that's quicker) or the Lap Review's reference. It sets off with you at the start of every timed lap, hides while
  // you're in the garage or the pits, and fades as you get close so it never hides the road.
  ghostOn() { return !!this.player && (this.mode === 'test' || !!this.quali) && (this.opts.ghost || 'best') !== 'off'; }
  setGhostMode(m) { this.opts.ghost = m; this.ghostFor = null; }
  pickGhost() {
    const pl = this.player;
    this.ghostLap = null;
    if (!this.ghostOn()) return;
    if (this.opts.ghost === 'ref') { this.ghostLap = this.referenceTelemetry(pl.carId, pl.phys.tyre.c); return; }
    const key = lapKey(this.track, this.T, pl.carId), b = bestLap(key), pb = loadPB(key, this.T);
    this.ghostLap = pb && pb.hasLine && (!b || pb.time < b.time) ? pb : b;
  }
  buildGhost() {
    if (this.ghost) { this.scene.remove(this.ghost.group); this.ghost = null; }
    const pl = this.player, m = buildF1(pl.model.cfg || this.opts.car, { texSize: 256, low: true });
    this.ghost = m; this.ghostQ = new THREE.Quaternion(); this.ghostOp = -1;
    this.ghostMats = [];
    m.group.traverse(o => {
      if (!o.material) return;
      const list = (Array.isArray(o.material) ? o.material : [o.material]).map(x => { const c = x.clone(); c.transparent = true; c.depthWrite = false; this.ghostMats.push(c); return c; });
      o.material = Array.isArray(o.material) ? list : list[0];
      o.castShadow = false; o.renderOrder = 3;
    });
    m.group.visible = false;
    this.scene.add(m.group);
  }
  updateGhost(dt) {
    const pl = this.player; if (!pl) return;
    // (re)pick when the car or the setting changes: sessions can change car between runs
    const want = pl.carId + '|' + (this.opts.ghost || 'best');
    if (this.ghostFor !== want && pl.lap > 0) { const carChanged = !this.ghostFor || this.ghostFor.split('|')[0] !== pl.carId; this.ghostFor = want; this.pickGhost(); if (this.ghostLap && (carChanged || !this.ghost)) this.buildGhost(); }
    const g = this.ghost; if (!g) return;
    let pose = null;
    if (this.ghostLap && this.ghostOn() && this.state === 'racing' && pl.lap > 0 && !pl.finished && !pl.gone && !pl.pitting && !pl.inGarage)
      pose = lapPoseAt(this.ghostLap, this.T, this.raceTime - pl.lapStart);
    g.group.visible = !!pose;
    if (!pose) { this.ghostShown = false; return; }
    const T = this.T, i = pose.i, j = i === T.cut ? i : (i + 1) % T.N, f = pose.f, sv = pose.s;
    const lerp = (a, k) => a[i] + (a[j] - a[i]) * f;
    const x = lerp(T.X) + lerp(T.RX) * sv, z = lerp(T.Z) + lerp(T.RZ) * sv;
    const y = surfaceY(T, i, f, sv) + this.A.LIFT[i];
    // sitting on the road the way your car does (placeModel)
    const slope = (T.Y[j] - T.Y[i]) / T.ds, bank = T.B[i] + (T.B[j] - T.B[i]) * f;
    const t3 = new THREE.Vector3(T.FX[i], slope, T.FZ[i]).normalize();
    const r3 = new THREE.Vector3(T.RX[i] * Math.cos(bank), Math.sin(bank), T.RZ[i] * Math.cos(bank));
    const nrm = new THREE.Vector3().crossVectors(r3, t3).normalize();
    const fw = new THREE.Vector3(Math.sin(pose.h), 0, Math.cos(pose.h)); fw.addScaledVector(nrm, -fw.dot(nrm)).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(nrm, fw), nrm, fw));
    this.ghostQ.slerp(q, this.ghostShown ? Math.min(1, dt * 20) : 1); this.ghostShown = true;
    g.group.quaternion.copy(this.ghostQ);
    g.group.position.set(x, y, z);
    if (g.animate) g.animate({ spin: pose.v * Math.min(dt, 0.05) });
    // fade out close to you (and to the camera behind you)
    const d = Math.hypot(x - pl.phys.x, z - pl.phys.z), op = Math.round(0.36 * Math.min(1, Math.max(0, (d - 2.5) / 9)) * 50) / 50;
    if (op !== this.ghostOp) { this.ghostOp = op; for (const m of this.ghostMats) m.opacity = op; }
  }

  addFinish(car) {
    // (online: a remote finish can arrive late, so keep the order sorted by time)
    this.finishOrder.push(car);
    if (this.net) this.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
  }

  // ---------- per-car physics env ----------
  // what's at one spot beside / on the track (track point idx, s m from its centre line, world x / z; row: how far
  // along, in samples, for the runoff's surfaces, idx if not given): 'road', 'walk' (a city sidewalk), 'kerb',
  // 'public' (a public road's concrete), 'runoff' (paved runoff), 'city' (city concrete), 'grass', 'gravel', 'sand'
  surfaceKind(idx, s, x, z, row = idx) {
    const T = this.T, A = this.A, env = this.track.env, half = T.W[idx] / 2, as = Math.abs(s);
    if (as <= half) return 'road';
    const side = s < 0 ? -1 : 1, we = walkEdge(T, A, env, idx, side);
    if (we >= 0 && as >= we && as <= we + walkWidth(T, A, env, idx, side)) return 'walk';
    const pit = this.pit;
    // (the pit lane: its tarmac, tapering out of the track edge on the ramps; along the garages, behind the wall)
    if (pit && pit.REG[idx] >= 0 && s * pit.side > half && (!isNaN(pit.WALL[idx]) ? as > pit.WALL[idx] - 0.25 : as <= pit.OUT[idx] + 0.2)) return 'road';
    const kw = kerbW(A, idx, side); if (kw > 0.05 && as < half + kw) return 'kerb';
    if (A.BRIDGE[idx]) return 'road';
    if (this.world.roadAt(x, z)) return 'public';
    // the runoff's paved, gravel and painted grass (runoff.js: just as the world draws it)
    const rk = runoffKind(A.run, row, s < 0 ? 0 : 1, as - half);
    if (rk === RUN_PAVED) return 'runoff';
    if (rk === RUN_GRAVEL) return 'gravel';
    if (rk === RUN_GRASS) return 'grass';
    if (this.world.paintAt(x, z) > 0.5) return 'grass'; // painted grass
    if (env.theme === 'city') return 'city';
    if (env.theme === 'desert') return 'sand';
    if (env.theme === 'coast' && this.world.groundHeight(x, z) < 1.2) return 'sand';
    return 'grass';
  }
  // the ground's height at one spot relative to the road surface, m: kerbs ramp up and rumble in time with their stripes
  // (d: distance along the track), a sidewalk is a step up, paved runoff is flush with the road (off the kerb's top
  // where there's one), off-road sits lower (eased down over the first metre past the edge, the gravel a little
  // deeper) and grass / gravel / sand are bumpy
  // (x, z: world position, for a public road's sidewalks)
  groundZ(kind, idx, s, d, x = 0, z = 0) {
    if (kind === 'road') return 0;
    if (kind === 'public') return this.world.streetStep?.(x, z) ?? 0;
    const T = this.T, A = this.A, half = T.W[idx] / 2, as = Math.abs(s);
    if (kind === 'kerb') { const sd = s < 0 ? -1 : 1; return kerbZ(kerbOf(A, idx, sd), kerbW(A, idx, sd), as - half, d); }
    if (kind === 'walk') { // (a ramp from the kerb's top, or the road, up to the sidewalk: one smooth climb)
      const we = walkEdge(T, A, this.track.env, idx, s < 0 ? -1 : 1), base = kerbOn(A, idx, s) ? kerbTop(kerbOf(A, idx, s)) : 0;
      return base + (WALK_H - base) * Math.min(1, Math.max(0, (as - we) / WALK_RAMP));
    }
    const kw = kerbW(A, idx, s), kerb = kw > 0.05, edge = half + (kerb ? kw : 0), ktop = kerb ? kerbTop(kerbOf(A, idx, s)) : 0;
    // a wheel over another part of the circuit's road (cutting across a chicane, inside a hairpin, a section running
    // alongside): that road's own height, so when the tracker hands the car over to it the ground under it stays put
    // (measured from this section's edge, it can be a quarter of a metre out, and the switch kicked the car up)
    if (as > half + 1 && this.track.refModel) { // (with a model's ground: its profile eases onto the other road, runoff.js)
      const o = this.otherRoadY(idx, x, z);
      if (o === o) return o - surfaceY(T, idx, Math.max(0, Math.min(1, ((x - T.X[idx]) * T.FX[idx] + (z - T.Z[idx]) * T.FZ[idx]) / T.ds)), s);
    }
    // (dev: a reference model's own ground: its gravel trap, its bank, at its height, the gravel a little deeper than
    // its top; read off the ground profile beside the road, made once (runoff.js groundProfile: continuous, smoothed,
    // never a step), and eased from the kerb's top (or the road's edge) onto it over 1.5 m)
    const prof = this.track.refModel ? (this._refProf ??= groundProfile(T, groundGrid(this.track.osm && this.track.osm.refGround, this.track.refModel), (i, side) => surfaceY(T, i, 0, side * T.W[i] / 2), (x2, z2, i) => this.otherRoadY(i, x2, z2))) : null;
    if (prof) {
      const row = idx + Math.max(0, Math.min(1, ((x - T.X[idx]) * T.FX[idx] + (z - T.Z[idx]) * T.FZ[idx]) / T.ds));
      const rel = profileAt(prof, row, s < 0 ? 0 : 1, as - half);
      const u = Math.min(1, Math.max(0, (as - edge) / 1.5)), e = u * u * (3 - 2 * u), top = ktop;
      return top + (rel - top) * e - (kind === 'gravel' ? 0.05 : 0) * e + (kind === 'gravel' ? 0.012 : kind === 'runoff' ? 0 : 0.006) * e * (Math.sin(1.57 * d + 1.3 * s) + Math.sin(0.9 * d - 0.7 * s));
    }
    if (kind === 'runoff') { const u = Math.min(1, Math.max(0, (as - edge) / 0.6)); return ktop * (1 - u) - 0.02 * u; }
    const t = Math.min(1, Math.max(0, (as - edge) / 1.2)), gravel = kind === 'gravel';
    const rough = kind === 'city' ? 0 : (gravel ? 0.016 : 0.01) * t * (Math.sin(1.57 * d + 1.3 * s) + Math.sin(0.9 * d - 0.7 * s)); // (undulations ~4 and ~7 m long)
    return ktop * (1 - t) - (gravel ? 0.1 : 0.08) * t + rough;
  }

  // the height of another part of the circuit's road at (x, z) (not the stretch round idx: more than ~40 m of track
  // away), or NaN if (x, z) isn't on one
  otherRoadY(idx, x, z) {
    const T = this.T, A = this.A, N = T.N, sep = Math.ceil(40 / T.ds); let y = NaN;
    if (!A.hash) return y;
    A.hash.query(x, z, 14, (j) => {
      if (y === y || circDist(idx, j, N) < sep) return;
      const dx = x - T.X[j], dz = z - T.Z[j], along = dx * T.FX[j] + dz * T.FZ[j];
      if (along < -0.05 * T.ds || along > 1.05 * T.ds) return;
      const lat = dx * T.RX[j] + dz * T.RZ[j];
      if (Math.abs(lat) <= T.W[j] / 2 && !A.BRIDGE[j] && !A.BRIDGE[idx]) y = surfaceY(T, j, Math.max(0, Math.min(1, along / T.ds)), lat);
    });
    return y;
  }
  // the tyre for the conditions: dirt tyres on a dirt track (wet or dry), wets in the rain, else a tarmac compound
  condTyre(dry = 'medium') { return this.dirt ? 'dirt' : this.rain ? 'wet' : dry; }
  // grip + drag of a surface kind (on a dirt track the road is dirt, the paved pit lane and runoff aside)
  surf(kind, i, s) { return this.dirtAt(kind, i, s) ? [this.dirtTrack.mu(i, s), SURFACES.dirt[1]] : SURFACES[kind]; }
  // on a dirt track's dirt? (its road; the pit lane beside it is paved, as it's drawn)
  dirtAt(kind, i, s) { const pit = this.pit; return this.dirt && kind === 'road' && !(pit && pit.REG[i] >= 0 && s * pit.side > this.T.W[i] / 2); }
  surfaceEnv(car) {
    const T = this.T, i = car.i, j = i === T.cut ? i : (i + 1) % T.N, p = car.phys;
    const kind = this.surfaceKind(car.idx, car.s, p.x, p.z, car.i + car.f), [mu, drag] = this.surf(kind, car.idx, car.s);
    p.onDirt = this.dirtAt(kind, car.idx, car.s); p.dirtWear = p.onDirt ? this.dirtTrack.abrasion(car.idx, car.s) : 1; // (tyre grip + wear: physics.js)
    car.surface = kind === 'public' || kind === 'city' ? 'concrete' : kind;
    car.publicRoad = kind === 'public';
    // (paved runoff drives like the road: skids, spray, no dust. It's still past the white line: track limits)
    car.onRoad = kind === 'road' || kind === 'kerb' || kind === 'walk' || kind === 'runoff';
    const slope = (T.Y[j] - T.Y[i]) / T.ds;
    const bank = car.onRoad ? T.B[i] : 0;
    const gx = -9.81 * (slope * T.FX[i] + Math.sin(bank) * T.RX[i]);
    const gz = -9.81 * (slope * T.FZ[i] + Math.sin(bank) * T.RZ[i]);
    const h = p.h, sn = Math.sin(h), cs = Math.cos(h);
    return { mu, extraDrag: drag, gF: gx * sn + gz * cs, gL: gx * cs - gz * sn, wheels: this.wheelGround(car) };
  }
  // what's under each wheel (FL FR RL RR): surface grip, drag and the ground's height, for the physics (the kerbs and
  // grass work on each wheel: two wheels on a kerb lift that side, two in the gravel drag the car toward it). Well
  // inside the track edges every wheel is on flat road, so that's all it does there.
  wheelGround(car) {
    const T = this.T, p = car.phys, P = p.p, N = T.N;
    const G = car.ground || (car.ground = { mu: new Float64Array(4).fill(1), drag: new Float64Array(4), z: new Float64Array(4), rough: false, flat: true });
    car.rumble = 0;
    // (a dirt track's grip changes across it: every wheel, every time)
    // (the rubber: each wheel's grip where it is on the road, every time)
    const rb = car.rub && this.rubber;
    if (!this.dirt && Math.abs(car.s) + 2 < T.W[car.idx] / 2) {
      if (!G.flat) { G.mu.fill(1); G.drag.fill(0); G.z.fill(0); G.flat = true; }
      if (rb) { const sn = Math.sin(p.h), cs = Math.cos(p.h), tw = p.susp.tw / 2, rx = T.RX[car.idx], rz = T.RZ[car.idx], ls = cs * rx - sn * rz;
        G.mu[0] = G.mu[2] = rb.grip(car.idx, car.s + tw * ls); G.mu[1] = G.mu[3] = rb.grip(car.idx, car.s - tw * ls); }
      return G;
    }
    G.flat = false;
    const i0 = car.idx, sn = Math.sin(p.h), cs = Math.cos(p.h), tw = p.susp.tw, d0 = T.D[car.i] + car.f * T.ds;
    for (let w = 0; w < 4; w++) {
      const xw = w < 2 ? P.a : -P.b, yw = (w & 1 ? -1 : 1) * tw / 2;
      const dx = sn * xw + cs * yw, dz = cs * xw - sn * yw; // (the car's +v side is world (cos h, -sin h))
      const along = dx * T.FX[i0] + dz * T.FZ[i0], sW = car.s + dx * T.RX[i0] + dz * T.RZ[i0];
      const iW = (i0 + Math.round(along / T.ds) + N) % N;
      const kind = this.surfaceKind(iW, sW, p.x + dx, p.z + dz, car.i + car.f + along / T.ds), sf = this.surf(kind, iW, sW);
      G.mu[w] = sf[0] * (rb && kind === 'road' ? rb.grip(iW, sW) : 1); G.drag[w] = sf[1]; G.z[w] = this.groundZ(kind, iW, sW, d0 + along, p.x + dx, p.z + dz);
      if (kind === 'kerb') car.rumble = 1;
    }
    return G;
  }

  // ---------- walls ----------
  // A wall pushes back on the car's box (contact.js): the corners that went past its face, the contact where they went
  // deepest, and the impulse there, so the corner that touches first turns the car (nose in at an angle: it's swung
  // along the wall; a rear corner clipped: the back is kicked round), and a car flat against it just scrapes along.
  barriers(car) {
    const T = this.T, A = this.A, p = car.phys, i0 = car.idx, N = T.N, C = corners(p, this._cw);
    if (T.open && (i0 === T.cut || i0 === (T.cut + 1) % N)) { // the walls across the road at a point-to-point's two ends
      const dir = i0 === T.cut ? 1 : -1, fx = T.FX[i0] * dir, fz = T.FZ[i0] * dir;
      const d0 = (p.x - T.X[i0]) * fx + (p.z - T.Z[i0]) * fz - OPEN_END_WALL;
      this.wallPush(car, fx, fz, (k) => d0 + C[k * 2] * fx + C[k * 2 + 1] * fz);
    }
    const reach = bodyBox(p.p).reach;
    for (const side of [1, -1]) {
      const HAS = side > 0 ? A.HAS_R : A.HAS_L, OFF = side > 0 ? A.BR : A.BL;
      if (side * car.s + reach < OFF[i0] - 1) continue; // (nowhere near this side's wall)
      const rx = T.RX[i0] * side, rz = T.RZ[i0] * side;
      // each corner against the wall beside it (where the barrier is, or isn't, along the car's length)
      this.wallPush(car, rx, rz, (k) => {
        const cx = C[k * 2], cz = C[k * 2 + 1], iC = (i0 + Math.round((cx * T.FX[i0] + cz * T.FZ[i0]) / T.ds) + N) % N;
        return HAS[iC] ? side * car.s + cx * rx + cz * rz - OFF[iC] : -1;
      });
    }
  }

  // pit wall between the track and the pit lane (0.5 m thick, at pit.WALL)
  pitWall(car) {
    const pit = this.pit; if (!pit) return;
    const T = this.T, N = T.N, i = car.idx, w = pit.WALL[i], sd = pit.side;
    const ss = car.s * sd;
    const ST = pit.STAND; // (the teams' stands on the wall's lane side: js/pitwall.js)
    const gap = pit.gap === undefined ? PIT.wallGap : pit.REG[i] > pit.count / 2 ? pit.gapOut : pit.gap; // (where the wall will stand / stood)
    // (before the wall starts: which side of where it will stand. Running wide over the kerb isn't the pit lane)
    if (isNaN(w)) car.laneSide = ss > T.W[i] / 2 + (pit.REG[i] >= 0 ? gap : 0.3);
    else if (car.laneSide === undefined) car.laneSide = ss > w;
    if (Math.abs(ss - (isNaN(w) ? T.W[i] / 2 + gap : w)) > bodyBox(car.phys.p).reach + 1 + (ST ? 1.7 : 0)) return;
    const lane = car.laneSide, C = corners(car.phys, this._cw), nx = T.RX[i] * sd * (lane ? -1 : 1), nz = T.RZ[i] * sd * (lane ? -1 : 1);
    this.wallPush(car, nx, nz, (k) => {
      const cx = C[k * 2], cz = C[k * 2 + 1], iC = (i + Math.round((cx * T.FX[i] + cz * T.FZ[i]) / T.ds) + N) % N, wk = pit.WALL[iC];
      if (isNaN(wk)) return -1;
      const s = ss + (cx * T.RX[i] + cz * T.RZ[i]) * sd, d = lane ? wk + 0.25 + (ST ? ST[iC] : 0) - s : s - (wk - 0.25);
      return d < 1.5 ? d : -1; // (deeper: the corner is round the wall's end, not through its face)
    });
  }

  // push the car out of a wall (n: into the wall; depth(k): how far corner k is past its face, m) and hit it
  wallPush(car, nx, nz, depth) {
    const p = car.phys, C = this._cw, D = this._cd;
    let dMax = 0;
    for (let k = 0; k < 4; k++) { D[k] = depth(k); if (D[k] > dMax) dMax = D[k]; }
    if (dMax <= 0) return;
    // the contact: the deepest corners (two of them when the car's flat against the wall)
    let px = 0, pz = 0, n = 0;
    for (let k = 0; k < 4; k++) if (D[k] > dMax - 0.15 && D[k] > 0) { px += C[k * 2]; pz += C[k * 2 + 1]; n++; }
    p.x -= nx * dMax; p.z -= nz * dMax;
    car.s -= (nx * this.T.RX[car.idx] + nz * this.T.RZ[car.idx]) * dMax;
    this.wallHit(car, { nx, nz, px: p.x + px / n, pz: p.z + pz / n });
  }

  wallHit(car, c) {
    const p = car.phys, tyres = wallTypeAt(this.A, car.idx, car.s, this.track.env) === 'tires';
    if (this.track.env.barrier === 'none') { impulse(p, null, c, { mu: 0.1, e0: 0.05 }); return; } // (no wall: the world's edge, soft and silent)
    // (a tyre wall gives a little and grabs; concrete and armco are hard and the car slides along them)
    const r = impulse(p, null, c, tyres ? { mu: 0.6, e0: 0.35 } : { mu: 0.3, e0: 0.25 });
    if (!r) return;
    const vn = r.vn;
    knock(p, r.dwA, r.j / p.p.mass);
    rock(p, -c.nx * r.j, -c.nz * r.j);
    car.impact = Math.max(car.impact || 0, vn); // (drift scoring: a hard hit loses the chain)
    if (vn > 3) car.hits = (car.hits || 0) + 1; // (telemetry: where a lap hit something)
    this.crashed(car, vn);
    if (vn > 5 && this.damageK > 0) {
      const [lx, ly] = toLocal(p, c.px, c.pz), part = partAt(p, lx), v = this.hitV(car, part, vn);
      if (v > 5) { this.hitDamage(car, part, Math.min(1, (v - 5) / 28) * this.damageK, lx, ly); this.breakCheck(car, v, part, lx, ly, 26); }
    }
    if (vn > 2 && car.hitCd <= 0) {
      car.hitCd = 0.3;
      const near = this.nearCam(car);
      if (near > 0) sfx.hit(Math.min(1, vn / 25) * near);
      if (car === this.focus) this.shake = Math.min(1, this.shake + vn / 20);
      this.fx.burst(c.px, car.y + 0.6, c.pz, 6, tyres ? 0x3a3a3a : this.dirt ? 0xb39470 : 0xbdbdbd, 1.4, car.y);
      if (vn > 7) this.sparks(c.px, car.y + 0.3, c.pz, Math.min(24, vn));
    }
    this.scrape(car, r.vt, c.px, c.pz, !tyres);
  }

  // in the camera's view and near enough to make out (the booth only calls what you can see: broadcast.js)
  onScreen(car, range = 160) {
    if (!car || car.gone || !car.phys) return false;
    const cam = this.camera, F = this._scr || (this._scr = { m: new THREE.Matrix4(), f: new THREE.Frustum(), v: new THREE.Vector3(), t: null });
    if (F.t !== this.raceTime) { F.t = this.raceTime; cam.updateMatrixWorld(); F.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); F.f.setFromProjectionMatrix(F.m); }
    F.v.set(car.phys.x, (car.y || 0) + 0.8, car.phys.z);
    return cam.position.distanceTo(F.v) < range && F.f.containsPoint(F.v);
  }
  // how loud something happening to this car is: 1 for the player, fading out 80 m from the camera
  nearCam(car) { return car.isPlayer ? 1 : Math.max(0, 1 - this.camera.position.distanceTo(car.model.group.position) / 80); }

  // sliding along a wall or another car: a scrape, and sparks off metal
  scrape(car, vt, x, z, metal) {
    if (vt < 4 || car.hitCd > 1e6 || (car.scrapeCd || 0) > this.raceTime) return; // (hitCd 1e9: a lap the AI learns on, unseen)
    car.scrapeCd = this.raceTime + 0.12;
    const near = this.nearCam(car);
    if (near > 0.3) sfx.scrape();
    if (metal && near > 0) this.sparks(x, car.y + 0.25, z, Math.min(6, Math.round(vt / 5)));
  }

  // the speed a hit on one part of the car counts as for damage: the car swinging on along a wall (or off another car)
  // slaps the same part again a moment later, and that adds only what it hit harder than the first time
  hitV(car, part, v) {
    const m = (car.hitMem ||= [[-9, 0], [-9, 0], [-9, 0]])[part], t = this.raceTime, again = t - m[0] < 0.6;
    if (again && v <= m[1]) return 0;
    const eff = again ? v - m[1] + 5 : v;
    m[0] = t; m[1] = v;
    return eff;
  }

  // damage from a hit on one part of the car (0 front, 1 rear, 2 side: the suspension, and the nearer wing a little).
  // Realistic damage (phys.bentOn): the suspension's per corner, the one nearest the hit (lx along, ly across the car)
  hitDamage(car, part, amt, lx, ly = 0) {
    if (car.phys.bentOn) {
      const front = part === 0 ? true : part === 1 ? false : lx > 0, k = (front ? 0 : 2) + (ly >= 0 ? 0 : 1);
      // (the radiator: in the nose of most cars, in the sidepods of a Formula car)
      if (CARS[car.carId]?.cls === 'f1' ? part === 2 : part === 0) this.radDamage(car, amt * (part === 2 ? 0.45 : 0.6));
      // (the gearbox: at the driven end, behind the engine: the tail of most cars, the nose of a front-wheel drive)
      if (part === ((car.phys.p.drive ?? 0) >= 1 ? 0 : 1)) this.gbDamage(car, amt * 0.4);
      // (the diffuser: under the tail)
      if (part === 1 && !this.flagSafe(car)) car.phys.dmg.fl = Math.min(1, (car.phys.dmg.fl || 0) + amt * 0.3 * (car.dmgK || 1));
      if (part === 2) { this.bend(car, k, amt * 0.7); this.damage(car, front ? 'fw' : 'rw', amt * 0.3); }
      else { this.damage(car, front ? 'fw' : 'rw', amt * 0.8); this.bend(car, k, amt * 0.35); }
      return;
    }
    if (part === 0) { this.damage(car, 'fw', amt * 0.8); this.damage(car, 'ch', amt * 0.25); }
    else if (part === 1) { this.damage(car, 'rw', amt * 0.8); this.damage(car, 'ch', amt * 0.25); }
    else { this.damage(car, 'ch', amt * 0.6); this.damage(car, lx > 0 ? 'fw' : 'rw', amt * 0.3); }
  }

  // a hard hit (race control: a big one brings out the yellow flags)
  crashed(car, v) {
    if (v < 12) return;
    if (this.bc && this.state === 'racing') this.bc.hit(car, v);
    if (!car.crashT || this.raceTime - car.crashT > 1.5 || v > car.crashV) { car.crashT = this.raceTime; car.crashV = v; }
  }

  // your car after the flag, on the game's autopilot: nothing it hits counts against you, once it's had time to get the
  // car in hand (about a second per 20 m/s you crossed the line at: a crash already happening then is still yours)
  flagSafe(car) {
    if (!car.isPlayer || car.handT == null) return false;
    return this.raceTime - car.handT > Math.max(0.6, Math.min(3, (car.handV || 0) / 20));
  }

  // the radiator holed (Realistic damage): the engine runs hotter from now on (physics.js engineHeat)
  radDamage(car, amt) {
    if (amt <= 0 || this.flagSafe(car)) return;
    const d = car.phys.dmg, before = d.rad || 0;
    d.rad = Math.min(1, before + amt * (car.dmgK || 1)); car.maxDmg = Math.max(car.maxDmg || 0, d.rad);
    if (car.isPlayer && before < 0.2 && d.rad >= 0.2) this.events.push({ type: 'radio', vo: d.rad > 0.55 ? 'radiator.bad' : 'radiator.hit', msg: d.rad > 0.55 ? 'Radiator\'s badly damaged. Box now or the engine won\'t last.' : 'Radiator damage. Water temps will climb: lift early, short-shift, keep out of the tow.', big: d.rad > 0.55 });
  }
  // the gearbox knocked (Realistic damage: physics.js gbHurt); the radio as it gets worse (engineCheck says the rest)
  gbDamage(car, amt) {
    if (amt <= 0 || this.flagSafe(car)) return;
    car.phys.gbHurt(amt * (car.dmgK || 1)); car.maxDmg = Math.max(car.maxDmg || 0, car.phys.dmg.gb || 0);
  }
  // the engine's heat (Realistic damage), each frame: the engineer's warnings as it climbs, and a cooked engine retires
  // the car (yours: the same moment as crashing out; theirs: it coasts off and stops)
  engineCheck(car) {
    const p = car.phys; if (!p.engOn || car.gone || car.finished || car.wreck || this.state !== 'racing') return;
    if (car.isPlayer) {
      const T = p.engT, deg = (t) => this.units === 'mph' ? Math.round(t * 1.8 + 32) + '°F' : Math.round(t) + '°C';
      if (T > 115 && !car.radio.eng1) { car.radio.eng1 = true; this.events.push({ type: 'radio', vo: 'engine.hot', msg: `Engine's running hot, ${deg(T)}. It's lost some power. Lift and coast where you can.` }); }
      if (T > 128 && !car.radio.eng2) { car.radio.eng2 = true; this.events.push({ type: 'radio', vo: 'engine.critical', msg: `Water's at ${deg(T)}. It won't take much more. <b>Box, or back right off.</b>`, big: true }); }
      if (T < 105) car.radio.eng1 = car.radio.eng2 = false;
      // the gearbox: slow shifts, then missed ones, then a gear gone; and the downshifts that are doing it
      const gb = p.dmg.gb || 0, ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10] || 'th');
      if (gb >= 0.15 && !car.radio.gb1) { car.radio.gb1 = true; this.events.push({ type: 'radio', vo: 'gearbox.hit', msg: 'Gearbox damage. Shifts are slow. Be gentle with it.' }); }
      if (gb >= 0.4 && !car.radio.gb2) { car.radio.gb2 = true; this.events.push({ type: 'radio', vo: 'gearbox.bad', msg: 'The gearbox is missing shifts. Short-shift, no big downshifts.' }); }
      if (p.lostGear && car.radio.gbLost !== p.lostGear) { car.radio.gbLost = p.lostGear; this.events.push({ type: 'radio', vo: 'gearbox.lost.' + p.lostGear, msg: `We've lost ${ord(p.lostGear)} gear. It'll skip it.`, big: true }); }
      if (p.overRev && !car.radio.gbRev) { car.radio.gbRev = true; this.events.push({ type: 'radio', vo: 'gearbox.overrev', msg: 'Careful on the downshifts: you\'re over-revving it and the gearbox is taking it.' }); }
      if (gb === 0) car.radio.gb1 = car.radio.gb2 = car.radio.gbLost = false;
      // the floor: lost downforce, mostly at the rear
      const fl = p.dmg.fl || 0;
      if (fl >= 0.2 && !car.radio.fl1) { car.radio.fl1 = true; this.events.push({ type: 'radio', vo: fl > 0.5 ? 'floor.bad' : 'floor.hit', msg: `Floor damage. We've lost rear downforce: ${fl > 0.5 ? 'it\'ll be loose in the fast stuff. Box when you can.' : 'careful in the fast corners.'}`, big: fl > 0.5 }); }
      if (fl === 0) car.radio.fl1 = false;
    }
    if (p.gbBroken && !p.engBlown) {
      p.engBlown = true; // (the same way out: it coasts to a stop)
      if (car.isPlayer) { this.events.push({ type: 'crashout', title: 'Gearbox failure', why: 'The gearbox has broken. No drive.', v: 0 }); }
      p.gbBrokenSeen = true;
    }
    if (!p.engBlown) return;
    p.powerMul = 0;
    car.wreck = { kind: 'engine', front: false, side: 1, t: this.raceTime, stopT: 0, code: 0, yaw: 0, looked: true, roll: 0, pitch: 0, drop: 0 }; // (nothing broken to see: it coasts to a stop)
    if (!p.gbBrokenSeen) this.particles.burst(p.x, car.y + 0.8, p.z, 26, 0xd8d8d8, 1.6); // (an engine: a cloud of steam and smoke)
    if (this.rc) this.rc.crashOut(car);
    if (car.isPlayer) { if (!p.gbBrokenSeen) this.events.push({ type: 'crashout', title: 'Engine failure', why: 'The engine overheated and let go.', v: 0 }); }
    else if (this.player && !this.player.gone && car.ai && car.ai.trust != null) this.events.push({ type: 'radio', vo: p.gbBrokenSeen ? 'mate.out.gearbox' : 'mate.out.engine', msg: `${car.name} is out. ${p.gbBrokenSeen ? 'Gearbox.' : 'The engine\'s gone.'}` });
  }
  // a corner's suspension bent (Realistic damage): that wheel knocked out of line (physics.js addBend); the radio says
  // which once it's enough to feel
  bend(car, k, amt) {
    if (amt <= 0 || this.flagSafe(car)) return;
    const p = car.phys, before = p.bent[k];
    p.addBend(k, amt * (car.dmgK || 1));
    car.maxDmg = Math.max(car.maxDmg || 0, p.dmg.ch);
    if (car.isPlayer && before < 0.25 && p.bent[k] >= 0.25) {
      const where = `${k < 2 ? 'Front' : 'Rear'} ${k % 2 ? 'right' : 'left'}`;
      this.events.push({ type: 'radio', vo: 'suspension.bent.' + (k < 2 ? 'f' : 'r') + (k % 2 ? 'r' : 'l'), msg: `${where} suspension's bent. The car will pull and that tire will scrub. Box to fix it.` });
    }
  }

  damage(car, part, amt) {
    if (amt <= 0 || this.flagSafe(car)) return;
    amt *= car.dmgK || 1;
    const d = car.phys.dmg, before = d[part];
    car.phys.addDamage(part, amt);
    car.maxDmg = Math.max(car.maxDmg || 0, d.fw, d.rw, d.ch);
    car.model.setDamage(d);
    if (before < 0.72 && d[part] >= 0.72 && part !== 'ch') {
      // wing breaks off: debris
      this.particles.burst(car.phys.x, car.y + 0.4, car.phys.z, 10, 0x222222, 1.2);
      if (this.rc && !car.remote) this.rc.debris(car);
      if (car.isPlayer) this.events.push({ type: 'radio', vo: part === 'fw' ? 'wing.front.gone' : 'wing.rear.gone', msg: `${part === 'fw' ? 'Front' : 'Rear'} wing is gone! Box for a new one.`, big: true });
    } else if (car.isPlayer && before < 0.3 && d[part] >= 0.3) {
      this.events.push({ type: 'radio', vo: part === 'ch' ? 'suspension.hit' : part === 'fw' ? 'wing.front.hit' : 'wing.rear.hit', msg: part === 'ch' ? 'Suspension damage — the car will pull and feel slower.' : `${part === 'fw' ? 'Front' : 'Rear'} wing damage, we've lost downforce.` });
    }
  }

  // ---------- crashing out (Realistic damage) ----------
  // A hit hard enough breaks the car for good: a wheel torn off (open-wheelers mostly; a saloon's arches usually keep
  // it on and the corner folds under instead), or a front or rear corner folded, and the car snaps round on the
  // corner that digs in, slides to a stop and stays there. v: the hit's speed on that part (hitV), m/s; lim: the speed
  // that always does it (a car gives a bit, so less than a wall's; the wall's is race control's heavy crash). Below it
  // the odds fall away (squared) over 6 m/s, so a big hit is a gamble, not a line. A chassis already wrecked by earlier hits (ch at 1) goes on the next one.
  breakCheck(car, v, part, lx, ly, lim) {
    if (this.damageK < 1.5 || car.wreck || car.remote || car.gone || car.finished || car.pitting || this.mode !== 'race' || this.state !== 'racing' || this.drift || this.flagSafe(car)) return;
    const e = v / Math.sqrt(car.dmgK || 1), done = car.phys.dmg.ch >= 0.98 && e > 12;
    if (!done && !(Math.random() < Math.max(0, (e - lim + 6) / 6) ** 2)) return;
    const open = CARS[car.carId]?.cls === 'f1', B = bodyBox(car.phys.p);
    // the corner that took it: the nearer end for a side hit, and the side it came from for a nose or tail
    const front = part === 0 ? true : part === 1 ? false : lx > 0, side = ly >= 0 ? 1 : -1;
    const corner = part === 2 || Math.abs(ly) > B.w * 0.5;
    const kind = corner && Math.random() < (open ? 0.75 : 0.3) ? 'wheel' : 'fold';
    this.wreckCar(car, kind, front, side, e);
  }
  // codes for online: 1..4 a wheel off (FL FR RL RR by the physics' left/right), 5..8 a corner folded
  wreckCar(car, kind, front, side, v = 30) {
    const p = car.phys, k = (front ? 0 : 2) + (side > 0 ? 0 : 1);
    car.wreck = { kind, front, side, t: this.raceTime, stopT: 0, code: (kind === 'wheel' ? 1 : 5) + k };
    p.powerMul = 0;
    // the snap: the broken corner digs in and swings the car round on it (harder for a rear: it's the tail that goes)
    const sp = Math.min(1, p.speed / 40);
    p.r += side * (front ? 1.4 : 2.4) * sp * (0.8 + Math.random() * 0.4);
    car.wreck.yaw = side * (front ? 0.9 : 1.5);
    if (car.ai) car.ai.err = null;
    this.wreckLook(car);
    this.sparks(p.x, car.y + 0.3, p.z, 24);
    this.particles.burst(p.x, car.y + 0.4, p.z, 14, 0x222222, 1.4);
    if (this.rc) this.rc.crashOut(car);
    if (car.isPlayer) {
      const where = this.rc ? this.rc.where(car.idx) : '', fl = `${front ? 'front' : 'rear'} ${side > 0 ? 'left' : 'right'}`;
      const why = kind === 'wheel' ? `The ${fl} wheel's come off${where ? ' at ' + where : ''}.` : `The ${fl} suspension's broken${where ? ' at ' + where : ''}.`;
      this.events.push({ type: 'crashout', why, v });
    } else if (this.player && !this.player.gone && car.ai && car.ai.trust != null) this.events.push({ type: 'radio', vo: 'mate.out.crash', msg: `${car.name} is out. Crashed${this.rc ? ' at ' + this.rc.where(car.idx) : ''}.` });
  }
  // how a wreck looks: the broken corner's wheel gone (and bouncing off down the road) or folded in under the car,
  // the body down on that corner. Also from an online snapshot's code (s.wk) for a car another machine runs.
  wreckLook(car) {
    const W = car.wreck, m = car.model; if (!m || !m.wheels || W.looked) return;
    W.looked = true;
    // (the model's +x is the physics' left)
    const w = m.wheels.find(w => w.front === W.front && Math.sign(w.pivot.position.x || 1) === W.side) || m.wheels[0];
    if (!w) return;
    W.wheel = w;
    if (W.kind === 'wheel') {
      w.pivot.visible = false;
      if (m.group.parent) this.looseWheel(car, w);
    } else {
      w.fold = true;
    }
    // the body sits down on that corner (placeModel adds this after the springs)
    W.roll = -W.side * 0.07 * (W.kind === 'wheel' ? 1.4 : 1); W.pitch = (W.front ? 1 : -1) * 0.035 * (W.kind === 'wheel' ? 1.4 : 1); W.drop = W.kind === 'wheel' ? 0.09 : 0.05;
  }
  // a wheel off the car: it flies off the way the car was going, bounces, and rolls away to lie in the run-off
  looseWheel(car, w) {
    const g = w.pivot.clone(true); g.visible = true;
    const v = new THREE.Vector3(); w.pivot.getWorldPosition(v);
    g.position.copy(v); g.quaternion.copy(car.model.group.quaternion);
    this.scene.add(g);
    const p = car.phys, out = new THREE.Vector3(1, 0, 0).applyQuaternion(car.model.group.quaternion).multiplyScalar(Math.sign(w.pivot.position.x || 1));
    (this.loose ||= []).push({ g, x: v.x, y: v.y, z: v.z, vx: p.vx * 0.9 + out.x * 5, vy: 4 + Math.random() * 3, vz: p.vz * 0.9 + out.z * 5, r: w.r || 0.33, ground: car.y, spin: 8 + Math.random() * 6, tip: (Math.random() - 0.5) * 3, t: 0 });
  }
  looseUpdate(dt) {
    for (const L of this.loose) {
      if (L.rest) continue;
      L.t += dt; L.vy -= 9.8 * dt;
      L.x += L.vx * dt; L.y += L.vy * dt; L.z += L.vz * dt;
      if (L.y < L.ground + L.r) { L.y = L.ground + L.r; if (L.vy < -1.5) { L.vy = -L.vy * 0.45; L.vx *= 0.8; L.vz *= 0.8; } else L.vy = 0; }
      const sp = Math.hypot(L.vx, L.vz), on = L.y <= L.ground + L.r + 0.01;
      if (on && sp > 0) { const k = Math.max(0, 1 - (L.t > 2.5 ? 3 : 0.9) * dt / Math.max(1, sp / 10)); L.vx *= k; L.vz *= k; }
      L.g.position.set(L.x, L.y, L.z);
      L.g.rotateX(L.spin * dt * Math.min(1, sp / 10)); L.g.rotateZ(L.tip * dt);
      // (slowed right down: it falls over and lies flat)
      if (on && sp < 1.2 && L.t > 1) { L.rest = true; L.g.rotation.set(0, Math.random() * 6, Math.PI / 2); L.g.position.y = L.ground + 0.15; }
    }
  }
  // each step for a wrecked car: the broken corner drags along the road, slowing it and pulling it round
  wreckStep(car, h) {
    const p = car.phys, W = car.wreck, sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.05) { const dec = Math.min(sp, (W.kind === 'wheel' ? 7 : 4.5) * h); p.vx -= p.vx / sp * dec; p.vz -= p.vz / sp * dec; }
    p.r += W.yaw * Math.min(1, sp / 20) * h;
    if (sp < 1) p.r *= Math.max(0, 1 - 5 * h);
  }
  // the wreck stays where it stopped while the marshals get to it (under the safety car, if it came out), then it's
  // craned away: out of the race, classified DNF. (Yours: main.js retires you after the crash's moment.)
  wreckUpdate(car, dt) {
    const W = car.wreck; if (car.isPlayer || car.remote) return;
    W.stopT = car.phys.speed < 1 ? W.stopT + dt : 0;
    if ((W.stopT > 8 && this.raceTime - W.t > 25) || this.raceTime - W.t > 60) this.removeCar(car);
  }

  sparks(x, y, z, n) { for (let k = 0; k < n; k++) this.particles.spawn(x, y, z, 0xffc040, 0.5, (Math.random() - 0.5) * 10, 3 + Math.random() * 3, (Math.random() - 0.5) * 10, 1, 3); }

  // Cars hitting cars: boxes, mass and yaw inertia (contact.js). Online, a car another machine simulates is immovable
  // here (its own machine works out what the hit does to it), so the local car takes the whole push.
  collideCars() {
    const cars = this.cars;
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const ra = cars[a].remote, rb = cars[b].remote;
      if ((ra && rb) || cars[a].gone || cars[b].gone) continue;
      if (this.T.open && (cars[a].lap > 1 || cars[b].lap > 1)) continue; // (point-to-point: done cars park in the run-off)
      if ((cars[a].pitPhase === 'stop' && cars[b].pitting) || (cars[b].pitPhase === 'stop' && cars[a].pitting)) continue;
      const A = cars[a].phys, B = cars[b].phys;
      const dx = B.x - A.x, dz = B.z - A.z, reach = bodyBox(A.p).reach + bodyBox(B.p).reach;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (Math.abs(cars[a].y - cars[b].y) > 3) continue;
      const c = boxContact(A, B);
      if (!c) continue;
      // apart, by mass (the lighter car moves more)
      const iA = ra ? 0 : 1 / A.p.mass, iB = rb ? 0 : 1 / B.p.mass, wa = iA / (iA + iB), wb = 1 - wa;
      A.x -= c.nx * c.pen * wa; A.z -= c.nz * c.pen * wa; B.x += c.nx * c.pen * wb; B.z += c.nz * c.pen * wb;
      c.px += c.nx * c.pen * (wb - wa) / 2; c.pz += c.nz * c.pen * (wb - wa) / 2;
      const r = impulse(A, B, c, { mu: 0.2, e0: 0.3, fixA: ra, fixB: rb }); // (bodywork and tyres sliding off each other)
      if (!r) continue;
      const vn = r.vn, [lA, yA] = toLocal(A, c.px, c.pz), [lB, yB] = toLocal(B, c.px, c.pz), pa = partAt(A, lA), pb = partAt(B, lB);
      if (!ra) { knock(A, r.dwA, r.j * iA); rock(A, -c.nx * r.j, -c.nz * r.j); }
      if (!rb) { knock(B, r.dwB, r.j * iB); rock(B, c.nx * r.j, c.nz * r.j); }
      cars[a].impact = Math.max(cars[a].impact || 0, vn); cars[b].impact = Math.max(cars[b].impact || 0, vn); // (drift scoring)
      if (vn > 3) { cars[a].hits = (cars[a].hits || 0) + 1; cars[b].hits = (cars[b].hits || 0) + 1; }
      this.crashed(cars[a], vn); this.crashed(cars[b], vn);
      if (this.bc) this.bc.contact(cars[a], cars[b], vn);
      if (vn > 5 && this.rc) this.rc.contact(cars[a], cars[b], pa, pb, vn);
      const pl = cars[a].isPlayer ? cars[a] : cars[b].isPlayer ? cars[b] : null;
      if (vn > 2 && (cars[a].hitCd <= 0 || cars[b].hitCd <= 0)) {
        cars[a].hitCd = cars[b].hitCd = 0.25;
        const near = pl ? 1 : Math.max(this.nearCam(cars[a]), this.nearCam(cars[b])) * 0.7;
        if (near > 0) sfx.hit(Math.min(0.7, vn / 20) * near);
        if (cars[a] === this.focus || cars[b] === this.focus) this.shake = Math.min(1, this.shake + vn / 25);
        if (vn > 8) this.sparks(c.px, cars[a].y + 0.3, c.pz, Math.min(16, Math.round(vn)));
      }
      this.scrape(pl || cars[a], r.vt, c.px, c.pz, true);
      if (vn > 6 && this.damageK > 0 && !cars[a].pitting && !cars[b].pitting) {
        // (each car's share of the hit by mass: a light car takes more of it than the heavy one that hit it)
        const mA = A.p.mass, mB = B.p.mass;
        const hit = (car, part, m, lx, ly) => { const v = this.hitV(car, part, vn * 2 * m / (mA + mB)); this.hitDamage(car, part, Math.min(0.5, (v - 6) / 34) * this.damageK, lx, ly); this.breakCheck(car, v, part, lx, ly, 23); };
        if (!ra) hit(cars[a], pa, mB, lA, yA);
        if (!rb) hit(cars[b], pb, mA, lB, yB);
      }
    }
  }


  // ---------- strategy & pit stops ----------
  // laps a compound lasts before it hits the 30% cliff (usage calibrated from test laps)
  tyreLife(c) {
    if (!this.wearK) return Infinity;
    // practice runs at the absolute limit; racing laps work the tyres ~10% less
    const perM = TYRES[c].rate * this.wearK * (this.wearPerM || 1) * 0.9 * wearMul(c, this.rain, this.dirt) * (this.dirtTrack ? this.dirtTrack.planK : 1);
    return 0.7 / perM / this.T.L;
  }
  planStrategy() {
    const R = this.laps;
    if (!isFinite(R) || !this.wearK) return { stints: [{ c: this.condTyre(['soft', 'medium'][Math.floor(Math.random() * 2)]), laps: R }] };
    const opts = this.strategyOptions();
    if (!opts.length) return { stints: [{ c: this.condTyre('hard'), laps: R }] };
    // teams pick from the few best plans so the field splits strategies
    const top = opts.filter(o => o.cost < opts[0].cost + 8).slice(0, 4);
    return top[Math.floor(Math.random() * top.length)];
  }
  // every sensible 1-3 stint plan, cheapest (projected fastest) first
  strategyOptions() {
    const R = this.laps;
    if (!isFinite(R)) return [];
    const pool = this.dirt ? ['dirt'] : this.rain ? ['wet'] : ['soft', 'medium', 'hard'];
    const lap = this.T.L / 50;
    const pace = { soft: -0.022 * lap, medium: 0, hard: 0.016 * lap, wet: 0, dirt: 0 };
    const opts = [];
    const consider = (seq) => {
      const lives = seq.map(c => this.tyreLife(c) * 0.92);
      const tot = lives.reduce((a, b) => a + b, 0);
      if (tot < R) return;
      let left = R;
      const stints = seq.map((c, k) => { const n = k === seq.length - 1 ? left : Math.max(1, Math.round(R * lives[k] / tot)); left -= n; return { c, laps: n }; });
      if (stints.some((st, k) => st.laps > lives[k] + 0.5 || st.laps < 1)) return;
      // pit time + compound pace + how much the tyres fade over each stint
      const cost = (seq.length - 1) * this.pitLoss + stints.reduce((a, st, k) => a + st.laps * pace[st.c] + st.laps * lap * 0.03 * (st.laps / lives[k]), 0);
      opts.push({ cost, stints });
    };
    if (this.timed) { // (a timed race: as many stints as it takes, a first set and then one compound)
      const most = Math.max(...pool.map(c => this.tyreLife(c) * 0.92)), n0 = Math.max(1, Math.ceil(R / most));
      for (let n = n0; n <= Math.max(n0, this.timed.stints + 1); n++) for (const a of pool) for (const b of pool) consider([a, ...Array(n - 1).fill(b)]);
    } else for (const a of pool) { consider([a]); for (const b of pool) { consider([a, b]); for (const c of pool) consider([a, b, c]); } }
    // (with tyre wear off every tyre lasts forever: just the compound choice)
    return opts.sort((x, y) => x.cost - y.cost);
  }

  // ---------- pre-race strategy screen ----------
  // a clean lap at the pace a good human carries (a touch under the AI limit)
  baseLap() {
    if (this._baseLap) return this._baseLap;
    let t = 0; for (let i = 0; i < this.T.N; i++) t += this.T.ds / Math.max(8, this.lineV[i] * 0.94);
    return (this._baseLap = t);
  }
  // projected lap times + tyre life for a plan: { stints:[{c,laps}] }
  projectPlan(plan) {
    const base = this.baseLap(), dt = this.dirt ? 0.1 : 0, pace = { soft: -0.022 + dt, medium: dt, hard: 0.016 + dt, wet: this.rain || this.dirt ? 0.02 + dt * 0.4 : 0.09, dirt: this.dirt ? 0 : 0.1 }; // (dirt: tarmac compounds ~11% less grip there)
    if (this.rain) { pace.soft = pace.medium = pace.hard = 0.12; }
    const laps = [], tyre = [];
    let total = 0;
    plan.stints.forEach((st, k) => {
      const life = this.tyreLife(st.c);
      for (let a = 0; a < st.laps; a++) {
        const worn = isFinite(life) ? a / life : 0;
        let t = base * (1 + pace[st.c] + 0.06 * Math.min(1, worn) + (worn > 1 ? 0.08 : 0));
        if (laps.length === 0) t += 2.5; // standing start
        if (a === 0 && k > 0) t += this.pitLoss;
        laps.push(t); total += t;
      }
      tyre.push({ c: st.c, laps: st.laps, life, end: isFinite(life) ? Math.max(0, 1 - 0.7 * st.laps / life) : 1 });
    });
    return { total, laps, tyre, stops: plan.stints.length - 1, cliff: tyre.some(t => t.end < 0.3) };
  }
  // the choices offered: recommended, an alternative, and an undercut
  strategyChoices() {
    const R = this.laps;
    if (!this.wearK || !isFinite(R)) {
      // tyre wear off: it's just which compound to run
      const list = this.dirt ? ['dirt'] : this.rain ? ['wet'] : ['soft', 'medium', 'hard'];
      return list.map((c, k) => ({ key: c, title: `${c[0].toUpperCase() + c.slice(1)} Tyres`, plan: { stints: [{ c, laps: isFinite(R) ? R : 1 }] },
        desc: k === 0 ? 'Tyre wear is off, so the fastest compound is the obvious pick.' : c === 'dirt' ? 'Dirt tyres for the dirt.' : c === 'wet' ? 'Full wets for the rain.' : 'Tyre wear is off: a slower compound for no reason. Brave.' }));
    }
    const opts = this.strategyOptions();
    const out = [];
    const clone = (p) => ({ stints: p.stints.map(s => ({ ...s })) });
    const sig = (p) => p.stints.map(s => s.c[0] + s.laps).join('-');
    if (!opts.length) {
      const c = this.condTyre('hard');
      return [{ key: 'rec', title: 'Recommended Strategy', desc: 'Nurse the tyres all the way — no set lasts a sprint to the flag.', plan: { stints: [{ c, laps: R }] } }];
    }
    const rec = clone(opts[0]);
    out.push({ key: 'rec', title: 'Recommended Strategy', desc: 'The fastest projection for this race: the engineers\' pick.', plan: rec });
    const recStops = rec.stints.length - 1;
    const alt = opts.find(o => o.stints.length !== rec.stints.length) || opts.find(o => sig(o) !== sig(rec));
    if (alt) {
      const more = alt.stints.length > rec.stints.length;
      out.push({ key: 'alt', title: more ? 'Aggressive Strategy' : 'Conservative Strategy', plan: clone(alt),
        desc: more ? 'Push hard on fresh rubber and make an extra stop to stay in the tyres\' sweet spot.' : 'Drive to look after the tyres and make fewer stops. Less time lost in the pit lane.' });
    }
    // undercut: stop earlier than the cars around you and use the fresh-tyre pace to jump them
    const baseU = recStops > 0 ? rec : opts.find(o => o.stints.length === 2);
    if (baseU && R >= 4) {
      const u = clone(baseU), early = Math.max(1, Math.min(3, Math.round(u.stints[0].laps * 0.25)));
      if (u.stints[0].laps - early >= 1) {
        u.stints[0].laps -= early; u.stints[1].laps += early;
        out.push({ key: 'under', title: 'Undercut Strategy', plan: u, desc: `Box ${early} lap${early > 1 ? 's' : ''} before the planned window. Fresh tyres let you jump the cars ahead when they stop.` });
      }
    }
    return out;
  }
  setPlayerPlan(plan) {
    const pl = this.player; if (!pl) return;
    pl.plan = { stints: plan.stints.map(s => ({ ...s })) };
    const c = pl.plan.stints[0].c;
    pl.phys.fitTyres(c); pl.model.setCompound(c);
    pl.pitReq = null; pl.planRadio = {};
    pl.setsUsed = [c]; // (the sets you used this race, for World Career's tyre stock: the start, then each stop)
  }
  confirmStrategy(plan) {
    if (plan) this.setPlayerPlan(plan);
    if (this.state === 'strategy' && !this.net) { this.state = 'intro'; this.stateT = 0; }
    this.stratDone = true;
  }
  // lap on which the player's next planned stop falls (or null)
  nextPlannedStop(car) {
    const plan = car.plan; if (!plan || car.pits >= plan.stints.length - 1) return null;
    let lap = 0; for (let k = 0; k <= car.pits; k++) lap += plan.stints[k].laps;
    return { lap, tyre: plan.stints[car.pits + 1].c };
  }
  // radio call on the lap you should box
  planRadio(car) {
    const pit = this.pit; if (!pit || car.finished || car.pitting || !car.plan) return;
    if (this.wx && this.wet > 0.35) return; // (a dry plan, a wet track: the weather calls decide, wallUpdate)
    const nx = this.nextPlannedStop(car); if (!nx) return;
    const T = this.T, toEntry = ((pit.start - car.idx + T.N) % T.N) * T.ds;
    const key = 'stop' + car.pits;
    if (car.lap === nx.lap && toEntry < 700 && !car.planRadio[key]) {
      car.planRadio[key] = true;
      car.pitReq = { tyre: nx.tyre, repair: false };
      this.events.push({ type: 'radio', vo: 'box.plan.' + nx.tyre, msg: `Box, box! Box this lap for <b>${nx.tyre.toUpperCase()}S</b>.`, big: true });
    }
  }
  // ---------- the race brain: stop now, before the plan says? ----------
  // The plan says when; the race sometimes says otherwise: the car just ahead is close and due too (undercut it: fresh
  // tyres a lap or two before it gets them), the car just behind has stopped and would come out ahead once its new
  // tyres are warm (cover it: stop now, while the gap still holds), a VSC (a stop at about half the cost). The AI asks
  // at its decision point; your engineer asks it about you. { kind: 'undercut' | 'cover' | 'vsc', o (the other car),
  // soon (laps the plan had left) } or null.
  stratCall(car) {
    const plan = car.plan, left = this.laps - car.lap + 1;
    if (!plan || !this.pit || car.finished || car.pitting || car.pits >= plan.stints.length - 1 || left <= 3 || this.rain || this.dirt) return null;
    let due = 0; for (let k = 0; k <= car.pits; k++) due += plan.stints[k].laps;
    const soon = due - car.lap; if (soon <= 0) return null; // (the plan has it this lap: not a call)
    // (stopping early: some set has to last the extra laps; the stop takes the hardest one that needs to)
    const tail = plan.stints.slice(car.pits + 2).reduce((a, st) => a + st.laps, 0);
    if (!['soft', 'medium', 'hard'].some(c => this.tyreLife(c) * 0.98 >= left - tail)) return null;
    if (this.rc && this.rc.vscOn() && soon <= 4) return { kind: 'vsc', soon };
    if (soon > 3) return null;
    // (what a new set is worth a lap over the one on now: measured, about 1.2% of a lap by the time a set's down to the
    // cliff, and the compounds' own pace: a harder set gives some of it back)
    const p = car.phys, worst = Math.min(p.tyre.wf, p.tyre.wr), loss = this.pitLoss + 4.5, PACE = { soft: -0.022, medium: 0, hard: 0.016 };
    const nextC = plan.stints[car.pits + 1].c, gain = this.baseLap() * (0.012 * (1 - worst) / 0.7 + (PACE[p.tyre.c] ?? 0) - (PACE[nextC] ?? 0));
    const ahead = this.order[car.pos - 2], behind = this.order[car.pos];
    // cover: they've stopped (in the last lap or so) and are still behind by more than a stop costs, for now
    if (behind && !behind.gone && !behind.finished && behind.pits > car.pits && (behind.stintLap || 0) >= car.lap - 1) {
      const g = this.timeBehind(behind, car); if (g != null && g > loss + 0.5 && g < loss + gain * soon + 1) return { kind: 'cover', o: behind, soon };
    }
    // undercut: close behind a car on the same stop, on tyres that are going (the older ours, the more a new set gains)
    // (a lap on the new set against theirs on the old, less the out lap's cold tyres)
    if (ahead && !ahead.gone && !ahead.finished && !ahead.pitting && ahead.pits === car.pits && ahead.lap === car.lap && worst < 0.8) {
      const g = this.timeBehind(car, ahead); if (g != null && g < gain * 1.2 - 0.3) return { kind: 'undercut', o: ahead, soon };
    }
    return null;
  }
  // ---------- the pit wall: calls for you to make while you drive ----------
  // One at a time: a question on the radio with two answers (X / 1 and B / 2), your engineer's pick lit. Answer, or
  // don't: when it's too late (the pit entry, or a few seconds for the team's calls) the engineer's pick happens. A
  // cheaper engineer's pick is wrong more often (opts.engineer: 0..5). Your teammate (World Career: the car with
  // ai.trust) answers team orders as they feel about you; this.trustDelta is what the race did to that (main.js gives
  // it to the career). opts.pitWall === false: no calls (the engineer just tells you).
  // this.call: { kind, a, b, rec, open (when it opened), until (raceTime: team calls), entry (pit calls: decide by
  // this far from the pit entry), run(which) }
  wallUpdate(car) {
    if (this.crew && (this.crew.cur === 'C' || (this.call && this.call.kind === 'crew'))) return; // (the co-driver's stint / the swap call: crew's own)
    if (this.mode !== 'race' || this.state !== 'racing' || car.finished || !car.plan && !this.mateCar()) return;
    const T = this.T, N = T.N, toEntry = this.pit ? ((this.pit.start - car.idx + N) % N) * T.ds : Infinity;
    const C = this.call;
    if (C) {
      const k = C.entry != null ? (toEntry - C.entry) / Math.max(1, C.from - C.entry) : (C.until - this.raceTime) / (C.until - C.open);
      C.left = Math.max(0, Math.min(1, k));
      if (k <= 0 || car.pitting || toEntry > (C.from ?? Infinity) + 50) this.answerCall(C.rec, true);
      return;
    }
    if (this.raceTime - (this.callT ?? -99) < 15 || car.pitting || car.lap < 1 || this.laps - car.lap < 1) return;
    const mate = this.mateCar(), name = (c) => String(c.name).split(' ').pop().toLowerCase().replace(/(^|[-'])\w/g, m => m.toUpperCase());
    const wrong = [0.3, 0.22, 0.15, 0.1, 0.06, 0.03][Math.max(0, Math.min(5, this.opts.engineer ?? 3))];
    const pick = (good) => (Math.random() < wrong ? !good : good) ? 'a' : 'b';
    // the pit calls: once a lap, well before the entry
    if (this.pit && toEntry < 1500 && toEntry > 900 && this.callLap !== car.lap) {
      this.callLap = car.lap;
      // the weather: wets when it's raining (how soon is the gamble), slicks when it's drying
      if (this.wx && this.laps - car.lap > 1) {
        const onWets = car.phys.tyre.c === 'wet', dry = this.callTyre(car) === 'wet' ? 'medium' : this.callTyre(car);
        const ask = !onWets && this.wet > 0.18 && this.rainK > 0.5 ? { msg: `It's raining${this.wet > 0.45 ? ' hard' : ''}. Wets now?`, tyre: 'wet', good: this.wet > 0.32 || !this.wx.until }
          : onWets && this.wet < 0.6 && this.rainK < 0.15 ? { msg: `The track's drying${this.wet < 0.35 ? ' fast' : ''}. Slicks now?`, tyre: dry, good: this.wet < 0.45 } : null;
        if (ask) return this.openCall({ kind: 'wx', who: 'eng', vo: ask.tyre === 'wet' ? (this.wet > 0.45 ? 'call.rain.hard' : 'call.rain') : (this.wet < 0.35 ? 'call.drying.fast' : 'call.drying'), msg: ask.msg, a: ask.tyre === 'wet' ? 'Box for wets' : 'Box for slicks', b: 'Stay out', rec: pick(ask.good), from: toEntry, entry: 260,
          run: (w) => { if (w === 'a') { car.pitReq = { tyre: ask.tyre, repair: false }; this.events.push({ type: 'radio', vo: 'box.confirm.' + ask.tyre, msg: `Box, box. <b>${ask.tyre.toUpperCase()}S</b>.`, big: true }); } else this.events.push({ type: 'radio', vo: 'box.stayout', msg: 'Copy. Staying out.' }); } });
      }
      // both of you due this lap or the next: who stops first (the first gets the fresher tyres sooner)
      const mine = this.nextPlannedStop(car), theirs = mate && !mate.pitting ? this.nextPlannedStop(mate) : null;
      if (mine && theirs && mine.lap === car.lap && Math.abs(theirs.lap - mine.lap) <= 1 && this.laps - car.lap > 2) {
        const ahead = mate.pos < car.pos;
        return this.openCall({ kind: 'first', who: 'eng', vo: 'call.whofirst', msg: `You and ${name(mate)} are both due. Who stops first?`, a: 'Me first', b: `${name(mate)} first`, rec: ahead ? 'b' : 'a', from: toEntry, entry: 720,
          run: (w) => { const shift = (c) => { const st = c.plan.stints; if (st[c.pits + 1] && st[c.pits + 1].laps > 1) { st[c.pits].laps++; st[c.pits + 1].laps--; } };
            if (w === 'a') { shift(mate); this.trust(ahead ? -5 : -1); this.mateSay(mate, ahead ? ['Of course you are.', '...Copy. Next lap.'] : ['Copy. I\'ll go next lap.']); }
            else { shift(car); this.trust(3); car.pitReq = null; this.events.push({ type: 'radio', vo: 'call.whofirst.mate', msg: `${name(mate)} first. You box next lap.` }); this.mateSay(mate, ['Copy. Thanks.']); } } });
      }
      if (this.opts.pitWall === false) return;
      const c = this.stratCall(car); if (!c) return;
      const nx = this.callTyre(car), why = c.kind === 'vsc' ? (this.rc.sc ? 'Safety car: a stop costs a lot less now.' : 'The VSC is out: a stop is half price.') : c.kind === 'cover' ? `${name(c.o)} has stopped. Box now to stay ahead?` : `${name(c.o)} is close and due too. Box now for the undercut?`;
      return this.openCall({ kind: c.kind, who: 'eng', vo: c.kind === 'vsc' ? (this.rc.sc ? 'call.sc' : 'call.vsc') : c.kind === 'cover' ? 'call.cover' : 'call.undercut', msg: why, a: 'Box now', b: 'Stay out', rec: pick(true), from: toEntry, entry: 260,
        run: (w) => { if (w === 'a') { car.pitReq = { tyre: nx, repair: Math.max(car.phys.dmg.fw, car.phys.dmg.rw) > 0.12 }; this.events.push({ type: 'radio', vo: 'box.confirm.' + nx, msg: `Box, box. <b>${nx.toUpperCase()}S</b>.`, big: true }); }
          else this.events.push({ type: 'radio', vo: 'box.stayout', msg: 'Copy. Staying out.' }); } });
    }
    // the team's calls: you and your teammate nose to tail, one of you quicker
    if (!mate || mate.pitting || car.lap < 2 || this.raceTime - (this.teamCallT ?? -99) < 90) return;
    const quicker = (a, b) => isFinite(a.last) && isFinite(b.last) && b.last - a.last > 0.4;
    if (this.order[car.pos - 2] === mate && quicker(car, mate)) { const g = this.timeBehind(car, mate); if (g == null || g > 1) return;
      this.teamCallT = this.raceTime;
      return this.openCall({ kind: 'swap', who: 'eng', vo: 'call.swap', msg: `You're quicker than ${name(mate)}. Ask them to let you by?`, a: 'Ask', b: 'Race them', rec: car.last < mate.last - 0.6 ? 'a' : 'b', until: this.raceTime + 7,
        run: (w) => { if (w !== 'a') return this.events.push({ type: 'radio', vo: 'call.raceit', msg: 'Copy. Keep it clean.' });
          const t = mate.ai.trust; if (t >= 50 || (t >= 30 && Math.random() < 0.5)) { mate.ai.yieldTo = { car, until: this.raceTime + 20 }; this.trust(-2); this.mateSay(mate, t >= 50 ? ['Copy.', 'Copy. Go on then.'] : ['...Copy.']); }
          else { this.trust(-1); this.mateSay(mate, ['Negative. Race me.', 'Not happening.']); } } });
    }
    if (this.order[car.pos] === mate && quicker(mate, car)) { const g = this.timeBehind(mate, car); if (g == null || g > 0.8) return;
      this.teamCallT = this.raceTime;
      return this.openCall({ kind: 'letby', who: 'eng', vo: 'call.letby', msg: `${name(mate)} is quicker and right behind you. Let them by?`, a: 'Let them by', b: 'Tell them to hold', rec: mate.last < car.last - 0.6 ? 'a' : 'b', until: this.raceTime + 7,
        run: (w) => { if (w === 'a') { this.letBy = { mate, until: this.raceTime + 25 }; this.events.push({ type: 'radio', vo: 'call.letthrough', msg: `Let ${name(mate)} through.` }); return; }
          const t = mate.ai.trust; if (t < 30) { this.trust(-1); this.mateSay(mate, ['Not happening. I\'m quicker.', 'Negative.']); }
          else { mate.ai.hold = { car, until: this.raceTime + 40 }; this.trust(-2); this.mateSay(mate, t < 50 ? ['...Copy.'] : ['Copy. Holding.']); } } });
    }
  }
  // ---------- the weather, changing ----------
  // Rain comes (or stops) when the forecast said it might: at a share of the race distance, by the leader. It rains
  // harder over ~15 s; the road gets wet over a minute or so and dries far slower. Grip follows how wet it is (every
  // car's physics), the AI choose their moment to change tyres (the bold ones gamble on longer: aiWantsPit), your
  // engineer tells you it's coming and asks you when to change (wallUpdate).
  wxUpdate(dt) {
    const W = this.wx, lead = this.order.find(c => !c.gone) || this.order[0]; if (!lead) return;
    const dist = this.laps * this.T.L, f = Math.max(0, (lead.finished ? dist : lead.raw || 0) / dist);
    const raining = W.to === 'rain' ? f >= W.at && !(W.until && f >= W.until) : f < W.at;
    this.rainK += Math.max(-dt / 25, Math.min(dt / 15, (raining ? 1 : 0) - this.rainK));
    this.wet = Math.max(0, Math.min(1, this.wet + (this.rainK > 0.3 ? dt / 70 * this.rainK : -dt / 220)));
    this.rain = this.wet > 0.5;
    for (const c of this.cars) if (c.phys) c.phys.wet = this.wet;
    if ((this.wxT = (this.wxT || 0) + dt) > 0.25) { this.wxT = 0; if (this.world.setWeather) this.world.setWeather(this.rainK, this.wet); }
    // (the radar: rain about two laps out, or it's stopped)
    const pl = this.player; if (!pl || pl.finished) return;
    const eta = this.wxEta();
    if (W.to === 'rain' && eta != null && eta <= 2.2 && eta > 0.3 && !W.told) { W.told = true; this.events.push({ type: 'radio', vo: eta <= 1.2 ? 'rain.radar.1' : 'rain.radar.2', msg: `Rain on the radar. About <b>${eta <= 1.2 ? 'a lap' : 'two laps'}</b> out.` }); }
    if (!raining && this.rainK < 0.05 && this.wet > 0.3 && !W.toldDry && (W.to === 'dry' || W.until)) { W.toldDry = true; this.events.push({ type: 'radio', vo: 'rain.stopped', msg: 'The rain\'s stopped. It\'ll dry from here.' }); }
  }
  // laps (the leader's) until the rain comes, if it's still coming
  wxEta() {
    const W = this.wx; if (!W || W.to !== 'rain') return null;
    const lead = this.order.find(c => !c.gone), L = this.T.L, at = W.at * this.laps * L;
    return lead && lead.raw < at ? (at - lead.raw) / L : null;
  }
  // ---------- the safety car ----------
  // Race control sends it out for the worst incidents (racecontrol.js setSc). It comes out ahead of the leader and
  // goes round at a safety car's pace; the first car behind follows it and the rest queue up behind them (nobody may
  // overtake, the gaps close up), the pit lane open: a stop costs far less. After two of the leader's laps its lights
  // go out ("in this lap") and it turns into the pit lane; racing resumes. this.sc: { raw (on the race's distance, like
  // a car's), v, lap0, model }
  deploySC() {
    const lead = this.order.find(c => !c.gone && !c.finished && !c.pitting && !c.wreck) || this.order[0];
    // (just up the road from the leader, at the pace the field's slowing to: it slows on gently, so the leader comes up
    // behind it within a few seconds rather than into it)
    this.sc = { raw: lead.raw + 150, v: Math.max(22, Math.min(36, lead.phys.speed * 0.6)), lap0: lead.lap, t0: this.raceTime, model: this.scModel() };
    if (this.sc.model) this.sc.model.visible = true;
  }
  scUpdate(dt) {
    const S = this.sc, T = this.T, N = T.N, LV = this.lineV, d = ((S.raw % T.L) + T.L) % T.L, i = Math.min(N - 1, Math.floor(d / T.ds)), j = (i + 1) % N, f = d / T.ds - i;
    // (its pace: a safety car's; slower while the leader's still a long way back, so the field can catch it)
    const ld = this.order.find(c => !c.gone && !c.finished && !c.pitting && !c.wreck), far = ld ? S.raw - ld.raw > 150 : false;
    // (about 40% of racing speed, 130 km/h at most, so the field, at 70%, catches it inside a lap; once they're all
    // queued up behind it, about 55%, 170 km/h at most, so it isn't a crawl)
    const run = this.cars.filter(c => !c.gone && !c.finished && !c.pitting && !c.wreck && c.raw > S.raw - T.L * 0.9);
    const tail = run.length ? Math.min(...run.map(c => c.raw)) : S.raw, len = S.raw - tail;
    if (!S.formed && len < 32 * run.length + 60) S.formed = true; else if (S.formed && len > 45 * run.length + 150) S.formed = false;
    const want = S.formed ? Math.min(LV[i] * 0.55, 48) : Math.min(LV[i] * (far ? 0.32 : 0.4), far ? 30 : 36); S.v += Math.max(-3 * dt, Math.min(4 * dt, want - S.v));
    // (it drives the racing line; a car in its way ahead of it: it waits behind)
    const ls = this.line[i] || 0; S.s = ls;
    for (const c of this.cars) { if (c.gone || c.finished || c.pitting) continue; const ahead = c.raw - S.raw; if (ahead > 0 && ahead < 14 && Math.abs(c.s - ls) < 2.2) S.v = Math.min(S.v, Math.max(0, c.phys.speed - 1)); }
    S.raw += S.v * dt;
    if (S.model) {
      const m = S.model; m.position.set(T.X[i] + (T.X[j] - T.X[i]) * f + T.RX[i] * ls, surfaceY(T, i, f, ls), T.Z[i] + (T.Z[j] - T.Z[i]) * f + T.RZ[i] * ls); m.rotation.y = Math.atan2(T.FX[i], T.FZ[i]);
      if (m.userData.bar) { const on = this.rc.sc && this.rc.sc.phase === 'out' && Math.floor(this.raceTime * 3) % 2 === 0; m.userData.bar.material.color.setHex(this.rc.sc && this.rc.sc.phase === 'out' ? (on ? 0xffb21a : 0x5a3a08) : 0x222222); }
    }
    const lead = this.order.find(c => !c.gone && !c.finished && !c.pitting && !c.wreck), pl = this.player;
    // it's solid: a car that runs into the back of it is stopped there (pushed back to its bumper, down to its speed)
    for (const c of this.cars) {
      if (c.gone || c.finished || c.pitting || !c.phys) continue;
      const back = c.raw - (S.raw - 4.8), p = c.phys;
      if (back > 0 && c.raw < S.raw && Math.abs(c.s - S.s) < 2.1) {
        p.x -= T.FX[i] * back; p.z -= T.FZ[i] * back;
        if (p.speed > S.v) { const k = Math.max(0, S.v - 1) / Math.max(0.1, p.speed); p.vx *= k; p.vz *= k; }
      }
    }
    // past it (round the side): drop back behind it, or it's a drive-through (12 s to do it)
    if (pl && !pl.pitting && !pl.finished && this.rc.on) {
      if (pl.raw > S.raw + 3) {
        if (S.passT == null) { S.passT = this.raceTime; this.rc.say('Passed the safety car · drop back behind it', { me: true, cls: 'y' }); this.events.push({ type: 'radio', vo: 'sc.passed', msg: 'You\'ve passed the safety car! <b>Lift and let it back past.</b>', big: true }); }
        else if (!S.passed && this.raceTime - S.passT > 12) { S.passed = true; this.rc.driveThrough(pl, 'overtook the safety car'); }
      } else if (S.passT != null && !S.passed) S.passT = null;
    }
    if (this.rc.sc && this.rc.sc.phase === 'out' && lead && lead.lap >= S.lap0 + 2 && this.raceTime - S.t0 > 50 && S.raw - lead.raw < 200) this.rc.setSc('in');
    // in: it turns off into the pit lane (no pit lane: at the line), and it's racing again
    const atPit = this.pit ? ((this.pit.start - i + N) % N) * T.ds < 20 : d < 20;
    if (this.rc.sc && this.rc.sc.phase === 'in' && atPit || !this.rc.sc) { if (S.model) S.model.visible = false; this.sc = null; if (this.rc.sc) this.rc.setSc(null); }
  }
  // its car: a white saloon with a light bar (built once a race)
  scModel() {
    if (this._scModel !== undefined) return this._scModel;
    try {
      const m = buildF1({ ...teamCar(this.teamFor(0), 0), chassis: 'm5', main: 0xf2f2f2, accent: 0x1c1c1c }, { texSize: 512, low: true });
      groundCar(m);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.28), new THREE.MeshBasicMaterial({ color: 0xffb21a }));
      bar.position.set(0, 1.5, -0.2); m.group.add(bar); m.group.userData.bar = bar;
      this.scene.add(m.group); this._scModel = m.group;
    } catch (e) { this._scModel = null; }
    return this._scModel;
  }
  // ---------- the stories, on the radio (World Career) ----------
  // Your engineer tells you who that is when someone you've history with is right there (once a race each: a rival,
  // the one who put you out, a grudge); your teammate talks, as they feel about you: last week, being stuck behind
  // you, passing or being passed. Never over a call, and not more than one every 20 s.
  storyRadio(pl) {
    if (this.call || this.raceTime - (this.storyT ?? -99) < 20 || pl.lap < 1) return;
    const say = (fn) => { this.storyT = this.raceTime; fn(); };
    for (const o of [this.order[pl.pos - 2], this.order[pl.pos]]) {
      if (!o || !o.story || o.storyTold || o.gone || o.pitting) continue;
      const g = o.pos < pl.pos ? this.timeBehind(pl, o) : this.timeBehind(o, pl); if (g == null || g > 1.5) continue;
      o.storyTold = true; return say(() => this.events.push({ type: 'radio', msg: `${o.story.line} ${o.pos < pl.pos ? `${g.toFixed(1)} up the road.` : `${g.toFixed(1)} behind you.`}` }));
    }
    const m = this.mateCar(); if (!m) return;
    const t = m.ai.trust, T = (m.talk ??= {});
    if (m.owe && !T.owe && this.raceTime > 25) { T.owe = true; return say(() => this.mateSay(m, m.owe === 'hit' ? ['You owe me one after last week. Remember that.', 'Last week? Still got the dent.'] : ['Don\'t ask me to move over today.', 'No team orders today, yeah?'])); }
    const behindYou = this.order[pl.pos] === m && (this.timeBehind(m, pl) ?? 9) < 1.2;
    T.stuck = behindYou ? (T.stuck || 0) + 1 : Math.max(0, (T.stuck || 0) - 1);
    if (T.stuck > 150 && !T.stuckSaid && t < 55) { T.stuckSaid = true; return say(() => this.mateSay(m, t < 35 ? ['Are we racing or holding hands?', 'Move. Over.'] : ['I\'m quicker. Just saying.', 'Any chance of a run?'])); }
    const ahead = m.pos < pl.pos, was = T.ahead; T.ahead = ahead;
    if (was === undefined || was === ahead) return;
    if (ahead && t < 35 && !T.passSaid) { T.passSaid = true; return say(() => this.mateSay(m, ['See you.', 'Bye.', 'That\'s how it\'s done.'])); }
    if (!ahead && !T.passedSaid && (t >= 65 || t < 30)) { T.passedSaid = true; return say(() => this.mateSay(m, t >= 65 ? ['Go get \'em.', 'Fair. Go.'] : ['Enjoy it while it lasts.', 'Sure. Whatever.'])); }
  }
  // (your teammate's car, World Career: the AI car that has their trust)
  mateCar() { return this.cars.find(c => c.ai && c.ai.trust != null && !c.gone && !c.finished && !c.wreck) || null; }
  trust(d) { this.trustDelta = (this.trustDelta || 0) + d; const m = this.mateCar(); if (m) m.ai.trust = Math.max(0, Math.min(100, m.ai.trust + d)); }
  mateSay(mate, lines) { this.events.push({ type: 'radio', who: 'mate', name: String(mate.name).split(' ').pop().toLowerCase().replace(/(^|[-'])\w/g, m => m.toUpperCase()), color: '#' + mate.team.main.toString(16).padStart(6, '0'), msg: lines[Math.floor(Math.random() * lines.length)] }); }
  openCall(c) { this.call = { ...c, open: this.raceTime, left: 1 }; this.callT = this.raceTime; this.events.push({ type: 'call', call: this.call }); }
  // the answer (X / 1: a, B / 2: b; late: the engineer's pick)
  answerCall(which, late = false) {
    const C = this.call; if (!C) return; this.call = null; this.callT = this.raceTime;
    this.events.push({ type: 'callDone', which, late });
    C.run(which);
  }
  // the set a stop now would take: the plan's next, or harder if that won't reach the end
  callTyre(car) {
    const left = this.laps - car.lap, plan = car.plan, tail = plan ? plan.stints.slice(car.pits + 2).reduce((a, st) => a + st.laps, 0) : 0;
    let c = plan?.stints[car.pits + 1]?.c || 'medium';
    for (const h of [c, 'medium', 'hard']) if (this.tyreLife(h) * 0.98 >= left - tail) { c = h; break; }
    return c;
  }
  // after "let them by": did you? (and a teammate told to move over: once you're past, that's done)
  wallAfter() {
    const L = this.letBy, pl = this.player;
    if (L) { if (L.mate.pos < pl.pos) { this.letBy = null; this.trust(4); this.mateSay(L.mate, ['Thanks. Owe you one.', 'Cheers.']); }
      else if (this.raceTime > L.until) { this.letBy = null; this.trust(-3); this.mateSay(L.mate, ['So that\'s a no, then.', 'Guess not.']); } }
    for (const c of this.cars) if (c.ai && c.ai.yieldTo && (c.ai.yieldTo.car.pos < c.pos || this.raceTime > c.ai.yieldTo.until)) c.ai.yieldTo = null;
  }
  // AI: decide at the pit-entry decision point whether to come in this lap
  aiWantsPit(car) {
    if (car.finished) return false;
    // penalties first: a drive-through (no stop), a black and orange flag (repairs)
    if (car.dt && car.lap < this.laps) { car.pitReq = { dt: true }; return true; }
    if (car.mo && car.lap < this.laps) { car.pitReq = { tyre: car.phys.tyre.c, repair: true }; return true; }
    if (!isFinite(this.laps) && !this.wearK) return false;
    const p = car.phys, left = this.laps - car.lap + 1;
    if (left <= 1) return false;
    const worst = Math.min(p.tyre.wf, p.tyre.wr);
    const dmg = Math.max(p.dmg.fw, p.dmg.rw, (p.dmg.rad || 0) * 1.4, (p.dmg.gb || 0) * 1.1, (p.dmg.fl || 0) * 0.9); // (a holed radiator: in before the engine cooks; a dying gearbox; a torn floor)
    const plan = car.plan;
    // (the teammate's already in: stack behind them only if it has to come in now; else a lap later, no queue)
    const mateIn = (() => { const m = this.teamMate(car); return m && m.pitting && !(m.pitReq && (m.pitReq.dt || m.pitReq.garage)); })();
    let due = false;
    // (a timed race: each stint runs about the planned time - dur / stints - then it's in, whatever the tires say)
    if (this.timed && !this.timed.flag && left > 1 && this.raceTime - (car.stintT0 || 0) >= this.timed.dur / this.timed.stints * (0.94 + ((car.teamIdx || 0) % 5) * 0.03)) due = true;
    if (plan && plan.stints.length > 1) {
      let lapsDone = 0;
      for (let k = 0; k <= car.pits; k++) lapsDone += plan.stints[Math.min(k, plan.stints.length - 1)].laps;
      due = car.pits < plan.stints.length - 1 && car.lap >= lapsDone;
      // a stop under the VSC costs half as much: take it if it was coming up in the next few laps
      // (each car decides once per VSC / safety car, and not all of them go for it: a pit lane full of everyone helps nobody)
      if (!due && this.rc && this.rc.vscOn() && car.pits < plan.stints.length - 1 && lapsDone - car.lap <= 4 && left > 3) { const k = this.rc.sc ? this.rc.sc.t0 : this.rc.vsc?.t0; if (car.cheapAt !== k) { car.cheapAt = k; car.cheapGo = Math.random() < 0.3 + (lapsDone - car.lap <= 1 ? 0.4 : 0); } due = car.cheapGo; }
      // the race brain (above): an undercut, covering one, a cheap stop; the bolder drivers go for it more often
      if (!due && car.ai) { const c = this.stratCall(car); if (c && c.kind !== 'vsc' && Math.random() < 0.35 + (car.ai.aggr ?? 0.5) * 0.5) { due = true; (this.stratLog ??= []).push({ kind: c.kind, car, o: c.o || null, lap: car.lap, pits: car.pits }); } }
    }
    // (the weather changing: each driver picks their moment; the bold stay out on the wrong tyres longer, gambling)
    // (and a stop that was coming anyway, in a downpour: wets, whoever you are)
    const bold = car.ai ? car.ai.aggr ?? 0.5 : 0.5, wantWets = this.wx ? this.wet > 0.28 + bold * 0.35 || (due && this.rainK > 0.6 && this.wet > 0.12) : this.rain, wantDry = this.wx ? this.wet < 0.5 - bold * 0.3 : !this.rain;
    const need = worst < 0.3 && left > 2 || dmg > 0.45 && left > 2 || (!this.dirt && wantWets && p.tyre.c !== 'wet') || (!this.dirt && wantDry && p.tyre.c === 'wet' && left > 2) || (this.dirt !== (p.tyre.c === 'dirt') && left > 2);
    if (!due && !need) return false;
    if (mateIn && !need && !(this.rc && this.rc.vscOn())) return false;
    if (this.wx && p.tyre.c === 'wet' && !wantDry && !need) return false; // (the plan's stop was for dry running: on wets in the wet, stay out)
    // next compound
    const dryNext = ((c) => c && c !== 'wet' ? c : 'medium')(plan?.stints[car.pits + 1]?.c);
    let next = this.dirt ? 'dirt' : this.wx ? ((p.tyre.c === 'wet' ? !wantDry : wantWets) ? 'wet' : dryNext) : this.rain ? 'wet' : dryNext;
    if (next !== 'wet' && !this.dirt && this.tyreLife(next) < left) next = this.tyreLife('hard') >= left ? (this.tyreLife('medium') >= left ? 'medium' : 'hard') : 'hard';
    car.pitReq = { tyre: next, repair: dmg > 0.12 || p.dmg.ch > 0.2 || (p.dmg.rad || 0) > 0.15 || (p.dmg.gb || 0) > 0.2 || (p.dmg.fl || 0) > 0.25 };
    return true;
  }
  // The parts a pit stop can fix, each one's damage and the seconds it adds: the wings, the suspension (all of it: the
  // chassis figure, or Realistic damage's corners), the radiator and the gearbox (Realistic damage). pitReq.repair is
  // true (fix everything: the AI, and old calls), false, or { part: true } (your choice, from the pit menu).
  pitParts(car) {
    const p = car.phys, d = p.dmg, su = Math.max(d.ch, ...p.bent);
    const all = [['fw', 'Front Wing', d.fw, 5], ['rw', 'Rear Wing', d.rw, 6], ['fl', 'Floor', d.fl || 0, 7], ['su', 'Suspension', su, 9], ['rad', 'Radiator', d.rad || 0, 8], ['gb', 'Gearbox', d.gb || 0, 10]];
    return all.filter(x => x[2] > 0.03).map(([k, label, x, per]) => ({ k, label, dmg: x, secs: x * per }));
  }
  pitFixes(car) {
    const r = car.pitReq || {}, parts = this.pitParts(car);
    return r.repair === true ? parts : r.repair ? parts.filter(x => r.repair[x.k]) : [];
  }
  // the pit menu's choice: one part fixed or left (a fix-everything request becomes a list first)
  toggleFix(car, k) {
    const r = car.pitReq; if (!r) return;
    if (typeof r.repair !== 'object' || !r.repair) { const on = r.repair === true; r.repair = {}; for (const x of this.pitParts(car)) r.repair[x.k] = on; }
    r.repair[k] = !r.repair[k];
  }
  serviceTime(car) {
    const r = car.pitReq || {};
    let t = 2.3 + (r.tyre ? 2.2 : 0);
    for (const x of this.pitFixes(car)) t += x.secs;
    // (an endurance race: a driver change, ~5 s; the AI's cars change at every stop, yours when you swap)
    if (this.timed && (car.isPlayer ? this.crew && this.crew.swap : true)) t += 5;
    return Math.max(1.8, t + (car.pitBonus || 0));
  }
  // driving through the pit lane (player cars are driven automatically, like the F1 games)
  pitControls(car, dt) {
    const T = this.T, N = T.N, pit = this.pit, p = car.phys, u = Math.max(0, p.u);
    const Ld = 4 + u * 0.3;
    const j = (car.idx + Math.round(Ld / T.ds)) % N;
    const box = pit.boxes[this.boxSlot(car.teamIdx)];
    const toBox = ((box - car.idx + N) % N) * T.ds, fromBox = ((car.idx - box + N) % N) * T.ds;
    // stay in the fast lane until just before your own box (boxes are 15 m apart, so cutting
    // across early drives through the box in front, where somebody may be stopped)
    let mix = 0;
    if (car.pitPhase === 'stop') mix = 1;
    else if (car.pitPhase === 'in') mix = Math.min(1, Math.max(0, (18 - toBox) / 10));
    else if (car.pitPhase === 'out') mix = Math.min(1, Math.max(0, 1 - fromBox / 11));
    const lane = -2.0 + 4.4 * mix;
    const main = !isNaN(pit.WALL[j]);
    // approaching the entry: drift over to the pit side in good time (the racing line may be on the far side)
    const toEntry = ((pit.start - car.idx + N) % N) * T.ds;
    const early = car.pitPhase === 'in' && pit.REG[car.idx] < 0 && toEntry < 300 ? Math.min(1, (300 - toEntry) / 180) : 0;
    const offTrack = this.line[j] + (pit.side * (T.W[j] / 2 - 1.3) - this.line[j]) * early;
    const off = pit.REG[j] >= 0 ? pit.side * (pit.CEN[j] + (main ? lane : 0)) : offTrack;
    const tx = T.X[j] + T.RX[j] * off, tz = T.Z[j] + T.RZ[j] * off;
    const dx = tx - p.x, dz = tz - p.z, sn = Math.sin(p.h), cs = Math.cos(p.h);
    const alpha = Math.atan2(dx * cs - dz * sn, dx * sn + dz * cs);
    const delta = Math.atan((2 * p.p.L * Math.sin(alpha)) / Ld);
    const maxLock = p.p.maxSteer / (1 + u * LOCK_K);
    const steer = Math.max(-1, Math.min(1, -delta / maxLock));
    const pos = pit.REG[car.idx];
    const limitAt = pit.limitIn ?? Math.round(pit.nRamp * 0.55), limitEnd = pit.limitOut ?? pit.count - Math.round(pit.nRamp * 0.45);
    let vt;
    // (how hard it can brake here: the dry-tarmac figures, less in the wet and on dirt, where the tyres can't stop the
    // car that quickly and it would slide past the speed line and the box)
    const gk = Math.max(0.4, Math.min(1, this.rainGrip || 1) * (this.dirt ? 0.6 : 1)), decL = 11 * gk, decB = 8 * gk;
    if (pos < 0) { // approaching the entry
      const d = ((pit.start - car.idx + N) % N) * T.ds + limitAt * T.ds;
      vt = Math.min((car.lineV || this.lineV)[car.idx] * 0.95, Math.sqrt(pit.speed ** 2 + 2 * decL * d));
    } else if (pos < limitAt) vt = Math.sqrt(pit.speed ** 2 + 2 * decL * (limitAt - pos) * T.ds);
    else if (pos <= limitEnd) vt = pit.speed * 0.97;
    else vt = (car.lineV || this.lineV)[car.idx];
    const through = car.pitReq && car.pitReq.dt; // (a drive-through: past the box at the limiter)
    if (car.pitPhase === 'in' && toBox < 200 && !through) vt = Math.min(vt, Math.sqrt(2 * decB * Math.max(0, toBox - 0.3)));
    if (car.pitPhase === 'in' && fromBox < 40 && !through) vt = 0; // rolled past the box: stop, the crew will come to you
    // double stacking: your teammate's in the box (or nearer it): stop 7.5 m short and wait for it to clear
    const busy = car.pitPhase === 'in' && !through ? this.boxBusy(car) : null;
    if (busy) { vt = Math.min(vt, Math.sqrt(2 * 8 * Math.max(0, toBox - 7.8))); if (toBox < 12 && car.phys.speed < 1) car.pitWait = (car.pitWait || 0) + dt; }
    car.stackBehind = busy;
    // don't run into a car ahead in the same lane
    for (const o of this.cars) {
      // (cars being serviced in their box are out of the way: never queue behind them)
      if (o === car || !o.pitting || o.pitPhase === 'stop') continue;
      const gap = ((o.idx - car.idx + N) % N) * T.ds;
      if (gap > 0 && gap < 14 && Math.abs(o.s - car.s) < 2.2) vt = Math.min(vt, Math.max(0, (gap - 7) * 1.5));
    }
    const err = vt - p.u;
    return { steer, throttle: err > 0 ? Math.min(1, 0.3 + err * 0.4) : 0, brake: err < -0.3 ? Math.min(1, -err * 0.5) : 0, analog: true };
  }
  // the pit limiter on your own drive out: throttle tapers off just under the pit speed, and brakes if you're over it
  pitLimiter(car, ctl) {
    const pit = this.pit, pos = pit.REG[car.idx], limitEnd = pit.limitOut ?? pit.count - Math.round(pit.nRamp * 0.45);
    car.pitLim = pos >= 0 && pos <= limitEnd;
    if (!car.pitLim) return ctl;
    const u = Math.max(0, car.phys.u), over = u - pit.speed * 0.97;
    return { ...ctl, throttle: Math.min(ctl.throttle, Math.max(0, -over / 1.2)), brake: over > 1 ? Math.max(ctl.brake, Math.min(1, over * 0.3)) : ctl.brake };
  }
  pitUpdate(car, dt) {
    const pit = this.pit; if (!pit || car.finished || car.remote || car.gone || car.wreck) return;
    const T = this.T, N = T.N, pos = pit.REG[car.idx];
    const ss = car.s * pit.side;
    if (!car.pitting) {
      // decision point ~250m before the entry (AI) / actually driving in (player)
      const toEntry = ((pit.start - car.idx + N) % N) * T.ds;
      // (AI cars only: your car can carry an AI brain after its autopilot moments, but you decide when you pit)
      const ai = car.ai && (!car.isPlayer || (this.crew && this.crew.cur === 'C')); // (your co-driver decides like the AI)
      if (ai && toEntry < 250 && toEntry > 200 && !car.pitChecked) { car.pitChecked = true; if ((this.state === 'racing' || this.state === 'finished') && this.aiWantsPit(car)) { car.pitting = true; if (car.isPlayer) this.crewStop(car); } }
      if (pos >= 0) car.pitChecked = false;
      // you're in once you pass the pit entry line where the wall starts, on the lane side of it; before that you can
      // still steer back onto the track
      const commit = pit.commitAt ?? 0;
      if (car.isPlayer && pos >= commit && pos < commit + Math.round(30 / T.ds) && (commit ? car.laneSide === true : ss > T.W[car.idx] / 2 + 0.2) && this.state === 'racing') {
        car.pitting = true;
        const p = car.phys, fix = {};
        // (each damaged part: fixed if it's worth the time, which you can change on the way in)
        for (const x of this.pitParts(car)) fix[x.k] = x.dmg > 0.08;
        // (owing a drive-through: this visit is it, no work allowed)
        car.pitReq = car.dt ? { dt: true } : this.quali ? { garage: true } : { tyre: car.pitReq?.tyre || this.nextPlannedStop(car)?.tyre || (this.dirt ? 'dirt' : this.rain ? 'wet' : p.tyre.c), repair: fix };
        this.events.push({ type: 'pitIn' });
        if (this.crew) this.crewStop(car);
        { const m = this.teamMate(car); if (m && m.pitting && !(car.pitReq && (car.pitReq.dt || car.pitReq.garage))) this.events.push({ type: 'radio', vo: 'box.doublestack', msg: `Double stack: you're in behind ${m.name}. Expect a wait at the box.` }); }
      }
      if (car.pitting) car.pitPhase = 'in';
      return;
    }
    // safety nets: missed the lane (on the track side of the pit wall), or stuck against a barrier
    if (car.pitPhase !== 'stop') {
      const onTrackSide = !isNaN(pit.WALL[car.idx]) && car.laneSide === false;
      car.pitStuck = car.phys.speed < 1 && !(car.isPlayer && car.pitPhase === 'out') ? (car.pitStuck || 0) + dt : 0; // (driving out yourself: take your time)
      if (onTrackSide || car.pitStuck > 6) {
        if (car.pitStuck > 6) this.resetCar(car);
        car.pitting = false; car.pitPhase = null; car.pitStuck = 0; car.laneSide = undefined;
        if (car.isPlayer && car.pits === 0 && car.pitReq) this.events.push({ type: 'radio', vo: 'box.missed.entry', msg: 'We missed the pit entry. Box next lap.' });
        return;
      }
    }
    if (car.pitPhase === 'in') {
      const box = pit.boxes[this.boxSlot(car.teamIdx)];
      const d = ((box - car.idx + N) % N) * T.ds;
      // at the box: stop (also if it arrives a touch quick or rolls a few metres past)
      // (overshot the box, past where it could stop: no stop, out again, the wheel back to you, rather than chasing a box
      // that's behind you)
      const past = T.L - d, at = d < 1.5 || past < 40; // (at the box, or stopped short of 40 m past it: the crew comes to you)
      if (car.pitReq && !car.pitReq.dt && past >= 40 && past < 400) { car.pitPhase = 'out'; if (car.isPlayer) this.events.push({ type: 'radio', vo: car.pitReq.garage ? 'box.pastgarage' : 'box.overshot', msg: car.pitReq.garage ? 'You went past the garage. Come in next lap.' : 'You overshot the box. No stop: come in again next lap.' }); return; }
      if (car.pitReq && car.pitReq.garage) { if (at && car.phys.speed < 3) this.enterGarage(car); } // (sessions: into the garage)
      else if (car.pitReq && car.pitReq.dt) {
        // drive-through: served once past your box (no stop, and it isn't a pit stop for the strategy)
        if (d < 2 || d > T.L - 30) { car.pitPhase = 'out'; this.rc.driveThroughServed(car); }
      } else if (at && car.phys.speed < 3 && !this.boxBusy(car)) {
        // time penalties are served first: the crew can't touch the car until they're up
        const pen = car.pen || 0;
        car.pitPhase = 'stop'; car.penServing = pen; car.pen = 0;
        if (car.isPlayer && this.crew && this.call && this.call.kind === 'crew') this.answerCall(this.call.rec, true); // (in the box: the engineer's pick)
        car.pitTimer = this.serviceTime(car) + pen + Math.random() * 0.4; car.pitTotal = car.pitTimer;
        if (pen && car.isPlayer) this.events.push({ type: 'radio', vo: 'box.penalty', msg: `Serving your <b>${pen} second penalty</b>, then the crew goes to work.` });
      }
      if (pos < 0 && ((car.idx - pit.end + N) % N) < 50) { car.pitting = false; car.pitPhase = null; } // somehow missed the lane
    } else if (car.pitPhase === 'stop') {
      car.pitTimer -= dt;
      if (car.pitTimer <= 0) {
        const r = car.pitReq || {};
        if (r.tyre) { car.phys.fitTyres(r.tyre); car.model.setCompound(r.tyre); car.stintLap = car.lap; if (car.isPlayer) (car.setsUsed = car.setsUsed || []).push(r.tyre); }
        if (r.repair) { const fx = this.pitFixes(car).map(x => x.k); if (r.repair === true) car.phys.repairAll(); else car.phys.repairParts(fx); car.model.setDamage(car.phys.dmg); }
        car.pits++; car.pitPhase = 'out'; car.radio = {}; car.penServing = 0;
        if (car.isPlayer && this.crew) { if (this.crew.swap) this.crewSwap(car); else if (this.crew.cur === 'C') this.crewPanel(); }
        if (car.isPlayer) this.events.push({ type: 'pitOut', time: car.pitTotal });
      }
    } else if (car.pitPhase === 'out') {
      if (pos < 0 || pos >= pit.count - 2) { car.pitting = false; car.pitPhase = null; car.pitOutT = this.raceTime; car.pitLim = false; car.stintT0 = this.raceTime; car.stintCall = false; }
    }
  }
  // cars close behind another car in a straight line get a tow (less drag); the same air costs them downforce (dirty
  // air: phys.wake, physics.js aero), strongest right behind, spreading wider and fading over ~40 m, so through a
  // corner a car that's caught up can't stay as close (a little off to one side, out of the worst of it, it can)
  slipstream(dt) {
    const T = this.T, cars = this.cars;
    for (const c of cars) {
      if (c.remote) continue;
      let best = 0, wake = 0;
      const reach = this.opts.towReach ?? 45; c.phys.towCut = this.opts.towCut ?? 0.3;
      if (!c.pitting && c.phys.speed > 25) for (const o of cars) {
        if (o === c || o.pitting || o.gone || o.wreck) continue;
        const gap = o.progress - c.progress, ds = Math.abs(o.s - c.s);
        if (gap <= 3 || gap > reach) continue;
        // (opts.wake false: no dirty air, for benches)
        if (gap < 40 && o.phys.speed > 20 && this.opts.wake !== false) { const w = 1.3 + gap * 0.03; if (ds < w + 1) wake = Math.max(wake, (1 - (gap - 3) / 37) * Math.min(1, w + 1 - ds) * Math.min(1, (o.phys.speed - 20) / 15)); }
        if (ds > 2.6) continue;
        best = Math.max(best, 1 - (gap - 3) / (reach - 3));
      }
      const target = Math.min(1, best * (c.slipK || 1));
      c.phys.slip += (target - c.phys.slip) * Math.min(1, dt * 3);
      c.phys.wake += (wake - c.phys.wake) * Math.min(1, dt * 4);
    }
  }

  // World Career: a part on your car fails partway through the race (opts.failure: { part, name, at 0..1, fatal, warn,
  // why, hurt }). A radio warning a little before; then either the car dies (powerMul 0, the 'failure' event: main.js
  // plays the moment and retires you) or it limps on.
  failureCheck(car) {
    const f = this.opts.failure; if (!f || this.mode !== 'race' || this.state !== 'racing' || car.finished || f.done) return;
    const len = this.T.open ? this.T.finish + 1 : this.T.N, prog = (car.lap + (car.idx || 0) / len) / Math.max(1, this.laps);
    if (!f.warned && prog > f.at - 0.12) { f.warned = true; this.events.push({ type: 'radio', vo: FAIL_VO[f.warn], msg: f.warn, big: true }); }
    if (prog < f.at) return;
    f.done = true;
    if (f.fatal) { car.phys.powerMul = 0; car.failed = f; }
    else if (f.part === 'brakes') car.phys.brakeMul = (car.phys.brakeMul || 1) * 0.72;
    else if (f.part === 'suspension') car.phys.gripMul *= 0.92;
    else car.phys.powerMul *= 0.82;
    this.events.push({ type: 'failure', ...f });
  }
  // team radio about tyres for the player
  tyreRadio(car) {
    if (!this.wearK || car.finished) return;
    const w = Math.min(car.phys.tyre.wf, car.phys.tyre.wr);
    if (w < 0.4 && !car.radio.t40) { car.radio.t40 = true; this.events.push({ type: 'radio', vo: 'tires.fading', msg: 'Tyres are starting to go off. Box when you can.' }); }
    if (w < 0.25 && !car.radio.t25) { car.radio.t25 = true; this.events.push({ type: 'radio', vo: 'tires.gone', msg: 'Tyres are gone! <b>Box, box!</b>', big: true }); }
  }

  // ---------- online ----------
  // intro -> lights -> go, all driven by the host's clock so every screen starts together
  // Online, nothing starts on a timer: everyone picks their car (if the host allows it) and locks a strategy, and the
  // grid waits; once every driver has locked in the host sets the start a moment ahead for all (net.goT, its clock),
  // and from there it's the intro, the lights and go, on the same clock everywhere.
  netClock() {
    const net = this.net;
    if (net.goT == null) {
      if (net.pick && this.player && !this.pickedCar) { this.state = 'carselect'; this.stateT = 0; return; }
      if (this.player) { this.state = 'strategy'; this.stateT = 0; return; }
      this.state = 'intro'; this.stateT = 0; return;
    }
    const e = (net.clock() - net.goT) / 1000, goAt = 3.2 + net.goDelay;
    if (this.state === 'finished') { this.raceTime = Math.max(this.raceTime, e - goAt); return; }
    if (e < 0 && this.player) { this.state = 'strategy'; this.stateT = 0; return; } // (locked in: the start is a moment away)
    if (e < 3.2) { this.state = 'intro'; this.stateT = Math.max(0, e); return; }
    if (e < goAt) {
      if (this.state === 'intro') { this.state = 'countdown'; this.events.push({ type: 'countdown' }); }
      this.stateT = e - 3.2;
      const n = Math.min(5, Math.floor(this.stateT / 0.9));
      if (n > this.lightsOn) { this.lightsOn = n; sfx.light(); this.events.push({ type: 'lights', n }); }
      return;
    }
    if (this.state !== 'racing') { this.state = 'racing'; this.lightsOn = 0; sfx.go(); this.events.push({ type: 'go' }); }
    this.stateT = e - goAt;
    this.raceTime = Math.max(this.raceTime, e - goAt);
  }
  // states of the cars this machine owns (your car; the host also owns the AI)
  netStates() {
    const out = [], r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
    for (const c of this.cars) {
      if (c.remote || !c.key) continue;
      const p = c.phys;
      out.push({
        k: c.key, x: r2(p.x), z: r2(p.z), h: r3(p.h), vx: r2(p.vx), vz: r2(p.vz), r: r3(p.r), d: r3(p.delta),
        rpm: Math.round(p.rpm), th: r2(p.throttle), b: r2(p.braking), g: p.gear, lg: r2(p.latG || 0), ng: r2(p.lonG || 0),
        sl: p.slipR > 0.16 || p.slipF > 0.2 || p.spin > 0.05 ? 1 : 0,
        lap: c.lap, cp: c.cpNext, fin: c.finished ? 1 : 0, ft: c.finishTime, best: isFinite(c.best) ? r3(c.best) : 0, last: r3(c.last || 0),
        pits: c.pits, ty: p.tyre.c, tw: r2(Math.min(p.tyre.wf, p.tyre.wr)), pit: c.pitting ? 1 : 0,
        dm: [r2(p.dmg.fw), r2(p.dmg.rw), r2(p.dmg.ch)], dnf: c.gone && !c.inGarage ? 1 : 0, wk: c.wreck ? c.wreck.code : 0, ig: c.inGarage ? 1 : 0, qd: c.isPlayer && this.quali?.done ? 1 : 0,
        pn: c.pen || 0, pt: c.penTotal || 0, dn: c.dtTotal || 0, dq: c.dsq ? 1 : 0, cv: c.crashT && this.raceTime - c.crashT < 1.5 ? r2(c.crashV) : 0, ds: c.isPlayer && this.drift ? Math.round(this.drift.total) : 0,
      });
    }
    return out;
  }
  netReceive(list, time) {
    for (const s of list) {
      const car = this.cars.find(c => c.key === s.k);
      if (!car || !car.remote) continue;
      if (car.net && car.net.time > time) continue; // out of order
      car.net = { ...s, time };
    }
  }
  // dead reckoning: extrapolate the last state to "now", then ease the shown car onto it
  netApply(car, dt) {
    const s = car.net, p = car.phys;
    if (!s) return;
    const age = Math.max(0, Math.min(0.4, (this.net.clock() - s.time) / 1000));
    const px = s.x + s.vx * age, pz = s.z + s.vz * age, ph = s.h + s.r * age;
    p.vx = s.vx; p.vz = s.vz; p.r = s.r;
    const ex = px - p.x, ez = pz - p.z;
    if (!car.netInit || ex * ex + ez * ez > 144) { p.x = px; p.z = pz; p.h = ph; car.netInit = true; this.updateTracker(car, true); }
    else {
      const k = 1 - Math.exp(-dt * 9);
      p.x += p.vx * dt; p.z += p.vz * dt; p.h += p.r * dt;
      p.x += (px - p.x) * k; p.z += (pz - p.z) * k; p.h = lerpAngle(p.h, ph, k);
      this.updateTracker(car);
    }
    p.delta = s.d; p.rpm = s.rpm; p.throttle = s.th; p.braking = s.b; p.gear = s.g; p.latG = s.lg; p.lonG = s.ng;
    p.u = p.vx * Math.sin(p.h) + p.vz * Math.cos(p.h); p.speed = Math.hypot(p.vx, p.vz);
    p.slipR = s.sl ? 0.2 : 0; p.slipF = 0; p.spin = 0;
    p.bodyFromG(dt); // (their body leans on its springs from the g-forces they send)
    if (s.ty !== p.tyre.c) { p.fitTyres(s.ty); car.model.setCompound(s.ty); }
    p.tyre.wf = p.tyre.wr = s.tw;
    const d = p.dmg;
    if (d.fw !== s.dm[0] || d.rw !== s.dm[1] || d.ch !== s.dm[2]) { p.dmg = { fw: s.dm[0], rw: s.dm[1], ch: s.dm[2] }; car.model.setDamage(p.dmg); }
    car.lap = s.lap; car.cpNext = s.cp; car.pits = s.pits; car.pitting = !!s.pit; car.driftTotal = s.ds || 0;
    car.pen = s.pn || 0;
    if (s.cv) this.crashed(car, s.cv); // (a big hit on their screen: yellow flags on everyone's)
    if (s.wk && !car.wreck) { // (crashed out on their screen: the wreck here too, and the host's race control acts on it)
      const k = (s.wk - 1) % 4; car.wreck = { kind: s.wk <= 4 ? 'wheel' : 'fold', front: k < 2, side: k % 2 ? -1 : 1, t: this.raceTime, stopT: 0, code: s.wk };
      this.wreckLook(car); if (this.rc) this.rc.crashOut(car);
    }
    if ((s.pt || 0) !== (car.penTotal || 0)) this.rc.remotePenalty(car, s.pt || 0);
    if ((s.dn || 0) !== (car.dtTotal || 0)) this.rc.remoteDriveThrough(car, s.dn || 0);
    if (s.dq) car.dsq = true;
    if (s.best && s.best !== car.best) { car.best = s.best; car.bestWhen = this.raceTime; }
    car.last = s.last;
    // (a session: in their garage they're off the track here too; out again, they appear where they are)
    if (this.quali) { const ig = !!s.ig; if (ig !== !!car.inGarage) { car.inGarage = ig; car.gone = ig; car.model.group.visible = !ig; if (!ig) car.netInit = false; } car.qDone = !!s.qd; }
    if (s.fin && !car.finished) { car.finished = true; car.finishTime = s.ft; this.addFinish(car); }
    if (s.dnf && !car.gone) this.dropCar(car.key);
  }
  // someone left / retired: their car disappears and is classified DNF
  dropCar(key) {
    const car = this.cars.find(c => c.key === key);
    if (!car || car.gone) return;
    car.gone = true; car.model.group.visible = false;
    car.phys.vx = car.phys.vz = 0; car.phys.x = car.phys.z = 1e6;
    if (car === this.focus && this.player && car !== this.player) this.focus = this.player;
  }
  // black flag: the car is taken out of the race (you: straight to the results)
  disqualify(car) {
    car.dsq = true;
    if (car === this.player) { this.events.push({ type: 'dsq' }); this.retire(); return; }
    this.removeCar(car);
  }
  // a wreck's pose on top of the springs: down on the broken corner, a folded wheel tucked in and leaning over
  wreckPose(car) {
    const W = car.wreck, m = car.model; if (!W.looked) return;
    m.body.rotation.z += W.roll; m.body.rotation.x += W.pitch; m.body.position.y -= W.drop;
    const w = W.wheel;
    if (w && w.fold) { w.pivot.rotation.z = W.side * 0.55; w.pivot.rotation.y = (w.front ? 0.45 : -0.25) * W.side; w.pivot.position.y = w.baseY != null ? w.baseY + 0.06 : w.pivot.position.y; }
  }
  // a car taken out of the race (disqualified, or its wreck craned away)
  removeCar(car) {
    if (car.key) return this.dropCar(car.key);
    car.gone = true; car.model.group.visible = false;
    car.phys.vx = car.phys.vz = 0; car.phys.x = car.phys.z = 1e6;
    if (car === this.focus && this.player) this.focus = this.player;
  }
  retire() {
    const pl = this.player; if (!pl || pl.finished) return;
    this.dropCar(pl.key || 'P');
    if (!pl.key) { pl.gone = true; pl.model.group.visible = false; }
    this.focus = this.cars.find(c => !c.gone) || pl;
    this.state = 'finished'; this.stateT = 0;
  }

  // ---------- AI ----------
  aiControls(car, dt) {
    const T = this.T, N = T.N, p = car.phys, ai = car.ai;
    const u = Math.max(0, p.u);
    // ---- racecraft ----
    let slowTo = Infinity;
    let minOff = -Infinity, maxOff = Infinity; // room left for cars alongside
    let threat = null, alongAhead = false;
    // the start: keep the lane you lined up in and merge onto the line as the run to the first corner allows, rather
    // than all diving for it at once (and into each other)
    const fix = this.opts.startFix !== false;
    if (fix && this.state === 'racing' && !ai.started && this.mode === 'race') { ai.started = true; if (car.lap === 0) { ai.over = car.s - this.line[car.idx]; ai.lane = true; } }
    if (ai.lane && (this.raceTime > 12 || car.lap > 1)) ai.lane = false;
    ai.over *= 1 - Math.min(1, dt * (ai.lane ? 0.12 : 0.4));
    if (ai.aggr === undefined) ai.aggr = 0.35 + Math.random() * 0.65;
    // yellow flags here or just ahead: lift, and no overtaking
    const fa = this.rc && this.state === 'racing' ? this.rc.flagAhead(car.idx) : null;
    const yellow = fa && (fa.f === 'y' || fa.f === 'dy' || fa.f === 'vsc' || fa.f === 'sc') ? fa.f : null;
    if (yellow) ai.over *= 1 - Math.min(1, dt * 2);
    // blue flag: on a straight, move over to the side away from the car lapping us
    // (and a teammate told to let you by: the same, for you)
    const yieldTo = ai.yieldTo && ai.yieldTo.car.progress < car.progress && car.progress - ai.yieldTo.car.progress < 40 ? ai.yieldTo.car : null, by = car.blue || yieldTo;
    if (by && Math.abs(T.K[car.idx]) < 1 / 300) {
      const side = car.s >= by.s ? 1 : -1, want = side * (T.W[car.idx] / 2 - 1.6) - this.line[car.idx];
      ai.over += (want - ai.over) * Math.min(1, dt * 1.5);
    }
    const oops = this.aiMistake(car, dt);
    const gkF = Math.min(1.1, p.gripNow() / (this.refGrip || 1)); // (the tyres' grip now against the plan's: worn, cold, wet)
    // a plan to pass the car ahead (racecraft.js): set up early and held; yo = the car we're dropping back behind
    const passOn = this.opts.pass !== 'old' && this.mode === 'race';
    const pp = passOn ? passPlan(this, car, dt, yellow) : null, yo = pp && pp.stage === 'yield' ? pp.o : null;
    for (const o of this.cars) {
      if (o === car || o.gone || o.pitting) continue;
      let gap = o.progress - car.progress;
      const ds = o.s - car.s;
      // (a wreck: where it sits on the road, whatever lap it stopped on, and seen from further off: it isn't moving)
      if (o.wreck) gap = ((gap % T.L) + T.L * 1.5) % T.L - T.L / 2;
      // (and one that's spun, stopped or crawling, with us coming up on it fast: the same, seen from as far off as it
      // takes to slow for it, steered round early and given a wider berth. Seen from 45 m like a car racing, an F1
      // at 170 km/h found it with no room left to stop and ploughed in, and the next ones into it: 8 wrecks in 2 laps)
      const crawl = !o.wreck && this.opts.seeSlow !== false && o.phys.speed < 15 && u > o.phys.speed + 10;
      // (one rejoining: at the edge or off it, slow, holding there for us to go by: go by, yellow or not; queued behind
      // it under a yellow, both sat there nudging each other)
      const edgeWait = this.opts.mirror !== false && Math.abs(o.s) > T.W[o.idx] / 2 - 1.5 && o.phys.speed < 45 && o.phys.speed < u + 2;
      const wk = !!o.wreck || crawl;
      // (a much slower car ahead - a slower class's car in a multiclass race, one being lapped - is seen from as far as it
      // takes to slow to its speed: at 220 km/h onto a GT2 car at 145, 45 m was too late and they were rear-ended)
      const slowAhead = !wk && (o.blue === car || (this.multi && o.cls !== car.cls)) && o.phys.speed < u - 5 && this.opts.mcAI !== false; // (another class's car, or one being lapped; opts.mcAI false: as before, for benches)
      if (gap < -30 || gap > (o.wreck ? 160 : crawl || slowAhead ? Math.max(45, (u * u - o.phys.speed ** 2) / 24 + 25) : 45)) continue;
      // (the lengths below were set for 4.6 m of car between the two centres, nose to gearbox: as the bodies are now)
      const bA = bodyBox(car.phys.p), bO = bodyBox(o.phys.p), len = (gap >= 0 ? bA.f + bO.r : bO.f + bA.r) - 4.6, near = 5.5 + len;
      // under yellow (a VSC, the safety car): no passing in any lane: the car just ahead sets the pace (not one that's
      // stopped or crawling, pulling off for the pits or just out of them, owing us the place, or being lapped)
      if (yellow && gap > 0 && gap < 30 && !o.pitting && o.phys.speed > 8 && !edgeWait && this.raceTime - (o.pitOutT ?? -99) > 10 && !(o.giveBack && o.giveBack.car === car) && !(o.rc && o.rc.hold > 0) && !o.blue) slowTo = Math.min(slowTo, Math.max(0, o.phys.u - 0.3) + Math.max(0, gap - 8) * 0.4);
      // a car that's claimed the corner off us (alongside at the braking point: racecraft.js): leave it a car's width
      // to the exit, wherever it is
      const cl = passOn && claimOn(car, o);
      if (cl && gap > -12 && gap < 10) {
        if (cl.side > 0) maxOff = Math.min(maxOff, o.s - 2.7); else minOff = Math.max(minOff, o.s + 2.7);
        if (gap > 0.5) alongAhead = true;
        continue;
      }
      // alongside (overlapping): never steer into them, leave a car's width
      if (gap > -near && gap < near && Math.abs(ds) > 1.8 && Math.abs(ds) < 4.2) {
        if (ds > 0) maxOff = Math.min(maxOff, o.s - 2.6); else minOff = Math.max(minOff, o.s + 2.6);
        if (gap > 0.5) alongAhead = true;
        if (o !== yo) continue; // (one we're dropping back behind: follow it, below)
      }
      // a car close behind and quicker: defend
      // (not a quicker class's car, nor one we're shown the blue for: it isn't racing us, let it by)
      const notRival = this.opts.mcAI !== false && (car.blue === o || (this.multi && this.clsRank[o.cls] < this.clsRank[car.cls]));
      if (gap < -near && gap > -25 && o.phys.u > u - 2.5 && !notRival) { if (!threat || gap > threat.gap) threat = { o, gap }; continue; }
      if (gap <= 0) continue;
      // a car ahead in our lane: brake in time to not hit it, or go around it
      if (Math.abs(ds) < (wk ? 3.4 : 2.4) || o === yo) {
        // (a teammate told to hold station doesn't go round you)
        const held = ai.hold && ai.hold.car === o && this.raceTime < ai.hold.until;
        // (the launch: the car in front of you on the grid is getting away as fast as you are, so stay in its wheel
        // tracks, don't swing out into the next lane after it; only one that's much slower, or still sat there 2 s in, is gone round)
        const launch = ai.lane && this.raceTime < 6 && o.phys.u > u - 2 && (o.phys.speed > 4 || this.raceTime < 2);
        // (with the racecraft plan, a car racing us is its business; this is for the slow, stopped, crawling or pitting)
        const racingCar = passOn && !wk && !edgeWait && o.phys.speed > 10 && o.phys.u > u - 3 && !o.pitting && this.raceTime - (o.pitOutT ?? -99) >= 10 && !o.blue && !(o.giveBack && o.giveBack.car === car);
        if (!launch && !racingCar && u > o.phys.u - 0.5 && gap < (wk ? 30 + u : slowAhead ? 28 + (u - o.phys.u) * 2 : 28) && (!yellow && !held || edgeWait || (o.rc && o.rc.hold > 0) || o.phys.speed < 10 || o.pitting || this.raceTime - (o.pitOutT ?? -99) < 10 || (o.giveBack && o.giveBack.car === car))) { // (a car pulling off for the pits, or just out and getting going, isn't a place: go round it, yellow or not)
          const room = T.W[car.idx] / 2 - 2;
          // (one moving over for us - the blue flag - goes to the side away from us: we take the other)
          const dir = o.blue === car && this.opts.mcAI !== false ? (o.s >= car.s ? -1 : 1) : o.s > this.line[car.idx] ? -1 : 1;
          const want = Math.max(-room, Math.min(room, o.s + dir * (wk ? 4.2 : 3.2))) - this.line[car.idx];
          ai.over += (want - ai.over) * Math.min(1, dt * 2.5);
        }
        if (this.opts.follow === 'old') { const room = Math.max(0, gap - 6.5 - len); slowTo = Math.min(slowTo, Math.sqrt(o.phys.u * o.phys.u + 2 * 16 * room) - (gap < 8 + len ? 2 : 0)); continue; }
        // follow it like a driver: expect it to slow for what's coming (its own speed plan a little ahead, or the speed
        // it's doing now if that's lower), keep a gap that grows with speed (~0.2 s), and brake no harder than it can
        // (the launch: it's pulling away, so expect the speed it'll have in half a second, not the speed it has now)
        const OV = o.lineV || this.lineV, vNow = o.phys.u + (ai.lane && this.raceTime < 6 ? Math.max(0, o.acc || 0) * 0.5 : 0);
        // (one off its line, defending the inside or alongside someone, slows for the corner more than its plan says: offK)
        const vLead = Math.min(vNow, OV[(o.idx + Math.round((8 + o.phys.u * 0.5) / T.ds)) % N] * (o.ai ? o.ai.pace * (this.opts.defend === 'old' ? 1 : o.ai.offK ?? 1) : 1));
        // (in a plan's tow: closer, as close as the driver's aggression has them)
        // (only on the way down the straight: into the braking zone and through the corner, the usual gap)
        const tow = pp && pp.o === o && pp.stage === 'tow' && pp.tb > 0.6;
        // (and with the braking point over a second away, right up to its gearbox: the slingshot needs the speed the tow gives)
        // (pulling out of it: past its gearbox, not braking to drop back to a following gap and losing the run)
        const sling = tow && pp.tb > 1.2 || pp && pp.o === o && pp.stage === 'out' && Math.abs(ds) > 1.2;
        const room = Math.max(0, gap - (sling ? 1.5 : tow ? 4 : 6) - len - u * (ai.lane && this.raceTime < 6 ? 0.08 : sling ? 0.01 : tow ? pp.hw : this.opts.followH ?? 0.2));
        // (braking no harder than this car really can, 85% of its grip and downforce, not a flat 13 m/s², which a street
        // car can't do and a GT1 car beats; and if the car ahead is braking harder than that right now, braking earlier
        // for it: a player braking before the AI's own plan would was being driven into from behind. Capped at 13, GT1
        // followers dropped back whenever the car ahead braked properly and stopped racing. opts.followA: the old flat figure)
        let aF = this.opts.followA ?? 13, kL = 1;
        if (this.opts.followA == null) { const cap = 9.81 * (p.p.mu || 1.3) * (1 + (p.p.kd || 0) * u * u / (p.p.mass * 9.81)) * gkF; aF = 0.85 * cap; kL = Math.min(1, 0.95 * cap / Math.max(1, -(o.acc || 0))); } // (kL: only a car out-braking what we can do at all; the same car braking as hard as it can isn't one)
        slowTo = Math.min(slowTo, Math.sqrt(vLead * vLead * kL + 2 * aF * room) - (gap < 8 + len ? 2 : 0));
      }
    }
    const Ld = 5 + u * 0.26;
    const j = (car.idx + Math.round(Ld / T.ds)) % N;
    // (your teammate: one who trusts you doesn't fight you for it; one who doesn't, always does)
    const vsYou = threat && threat.o.isPlayer && ai.trust != null, fights = yieldTo || by ? false : vsYou ? ai.trust < 30 || (ai.trust < 55 && ai.aggr > 0.45) : threat && (ai.aggr > 0.45 || threat.o.isPlayer && car.story && car.story.hard); // (and one with a score to settle with you always does)
    if (this.opts.defend === 'old') this.defendOld(car, dt, threat, fights);
    else this.defend(car, dt, threat, fights, j);
    const lim = T.W[j] / 2 - (this.edgeM ? this.edgeM[j] : 1.3); // (at a kerb, two wheels on it: lineMargins)
    // a driver's technique (car.ai.skill: aiskill.js, techFor; none = the clean, quick AI):
    // wander: a less precise driver's line drifts by up to this many metres, a new error every 120-240 m
    const sk = ai.skill;
    if (sk && sk.wander) {
      if (!(car.progress < ai.wNext) || car.progress < ai.wNext - 400) { ai.wTgt = (Math.random() * 2 - 1) * sk.wander; ai.wNext = car.progress + 120 + Math.random() * 120; }
      ai.wOff = (ai.wOff || 0) + (ai.wTgt - (ai.wOff || 0)) * Math.min(1, dt * 0.6);
    }
    // the pass's spot across the road (held by racecraft.js), reached at no more than ~2.2 m/s sideways, and let go of gently
    const base = this.line[j] + ai.bias + ai.over + ai.def + (ai.wOff || 0), pw = pp && pp.at != null ? pp.at - base : 0, po = ai.pOff || 0;
    const pv = pp && pp.stage === 'out' ? 3.5 : 2.2; // (pulling out of a tow: a quick, decided move)
    ai.pOff = po + Math.max(-pv * dt, Math.min(pv * dt, (pw - po) * (pp && pp.at != null ? 5 : 1.6) * dt));
    let off = Math.max(-lim, Math.min(lim, base + ai.pOff));
    // squeezed between cars: take the middle, and ease off only if one of them is ahead (else it's theirs to give)
    if (minOff > maxOff) { off = (minOff + maxOff) / 2; if (alongAhead || !fix) slowTo = Math.min(slowTo, Math.max(12, u - (ai.lane ? 0.3 : 1))); } // (the launch: just off the throttle, no brakes)
    else off = Math.max(minOff, Math.min(maxOff, off));
    off = Math.max(-lim - 0.6, Math.min(lim + 0.6, off));
    // a look in the mirror before moving across (back to the line after a move, a defence or a run wide): never across
    // the nose of a car close behind on that side; hold a car's width clear of it until it's dropped back or come by.
    // (Alongside was covered above; a car half a length back wasn't, and got chopped. opts.mirror false: as before)
    // Measured from the racing line, both cars: following the line's own sweep into a corner isn't a move across (held
    // to where it was, a car with another tucked inside it couldn't turn in and went straight off)
    if (this.opts.mirror !== false && this.opts.mirrorHold !== false && this.mode === 'race') for (const o of this.cars) {
      if (o === car || o.gone || o.pitting || o.wreck) continue;
      const gap = o.progress - car.progress, now = car.s - this.line[car.idx], oRel = o.s - this.line[o.idx], ds = oRel - now, want = off - this.line[j];
      if (gap > 0 || gap < -9 || Math.abs(ds) < 1.8 || Math.sign(want - now) !== Math.sign(ds) || Math.abs(want - now) < 0.3) continue;
      const edge = oRel - Math.sign(ds) * 2.6;
      off = this.line[j] + (ds > 0 ? Math.min(want, Math.max(now, edge)) : Math.max(want, Math.min(now, edge)));
      // (but never held off the road: back to its edge, whoever's there; held out wide, cars drove the sidewalk 3x as long)
      const rim = T.W[j] / 2 - 1.1;
      if (Math.abs(off) > rim) off = Math.sign(off) * rim;
    }
    // mistake: running wide out of the corner, over the kerb and onto the run-off
    if (oops && oops.type === 'wide' && oops.phase === 1) off = -oops.dir * (lim + oops.far);
    // rejoining (out at the edge or off the road, off its line, after a moment or a run wide): back on smoothly, about
    // 2.5 m/s sideways (the steering point's that far across at this speed), never a swerve across; held where it is only
    // while a car's right there behind in the lane it would move into. (Before: held at the edge while anyone quicker
    // was within 70 m, so cars drove the sidewalk for long stretches; before that, they cut straight back across.
    // opts.mirror false: the oldest way, held below 90 km/h for cars 30 km/h quicker within 90 m)
    if (this.opts.mirror === false) {
      if (this.opts.seeSlow !== false && this.state === 'racing' && p.speed < 25 && Math.abs(car.s) > T.W[car.idx] / 2 - 1.5
        && this.cars.some(o => o !== car && !o.gone && !o.pitting && o.phys.speed > p.speed + 8 && car.progress - o.progress > 0 && car.progress - o.progress < 90)) off = car.s;
    } else if (this.state === 'racing' && Math.abs(car.s) > T.W[car.idx] / 2 - 1.5 && Math.abs(car.s - this.line[car.idx]) > 2.5 && !(oops && oops.type === 'wide')) {
      const into = Math.sign(off - car.s);
      const blocked = this.cars.some(o => o !== car && !o.gone && !o.pitting && !o.wreck && car.progress - o.progress > -2
        && car.progress - o.progress < 12 + Math.max(0, o.phys.speed - p.speed) * 1.2 && Math.abs(o.s - (car.s + into * 2.6)) < 2.4);
      const step = blocked ? 0 : 2.5 * Ld / Math.max(u, 5);
      off = car.s + Math.max(-step, Math.min(step, off - car.s));
    }
    const tx = T.X[j] + T.RX[j] * off, tz = T.Z[j] + T.RZ[j] * off;
    const dx = tx - p.x, dz = tz - p.z;
    const sn = Math.sin(p.h), cs = Math.cos(p.h);
    const fwd = dx * sn + dz * cs, left = dx * cs - dz * sn;
    const alpha = Math.atan2(left, fwd);
    // pure pursuit (steer for the arc through a point ahead), damped by the yaw rate: take off steering when the car
    // is already rotating faster than that arc needs, add some when it's slower, like a driver feeling the car turn.
    // Without it the steering chases the car's own response at speed and the car weaves.
    const kap = 2 * Math.sin(alpha) / Ld;
    const delta = Math.atan(p.p.L * kap) - 0.6 * p.p.L * (p.r - p.u * kap) / Math.max(Math.abs(p.u), 5);
    const maxLock = p.p.maxSteer / (1 + Math.abs(p.u) * LOCK_K);
    let steer = Math.max(-1, Math.min(1, -delta / maxLock));
    // like a good driver, never turn the fronts past their peak grip (past it they only scrub and push wide: it's what
    // the Steering Assist does for players), except in a slide, where they go where the catch needs them
    if (p.speed > 8 && Math.abs(p.beta) < 0.12) {
      const zeroSlip = Math.atan2(p.u * Math.tan(p.beta) + p.p.a * p.r, Math.max(Math.abs(p.u), 4)), pk = (p.p.slipPeak ?? 0.169) * 1.05;
      const want = -steer * maxLock, held = Math.max(zeroSlip - pk, Math.min(zeroSlip + pk, want));
      if (held !== want) steer = Math.max(-1, Math.min(1, -held / maxLock));
    }
    // speed target
    const la = (car.idx + Math.round((6 + u * 0.3) / T.ds)) % N;
    // (and in a car's dirty air, like a driver feeling the front go light: what it's costing the car right now. With the
    // per-axle reckoning below this counts it twice, on paper; taken out, seeded F1 races went from 0-2 contacts and 2
    // wall hits to 12-20 and 13-17: the axle reckoning alone under-reads it, so both stay)
    const gk = Math.sqrt(p.gripNow() / (this.refGrip || 1) * (1 - 0.4 * Math.max(p.dmg.fw, p.dmg.rw)) * (1 - 0.1 * p.dmg.ch) * (this.opts.aiWake === false ? 1 : 1 - (p.wakeLoss || 0))
      * (this.dirtTrack ? this.dirtTrack.mu(la, car.s) / this.dirtTrack.mu0 : 1) // (dirt: the groove slicking off, the cushion)
      * (this.rubber && car.rub ? this.rubber.grip(la, car.s) : 1) // (the rubber laid since the session began; slick in the wet)
      * p.tempGrip); // (tyres off their best temperature: cold out of the pits, or overheated)
    const LV = car.lineV || this.lineV;
    let vt = LV[la] * ai.pace * gk;
    const vt2 = LV[(la + Math.round(15 / T.ds)) % N] * ai.pace * gk;
    vt = Math.min(vt, vt2 + 8);
    // in a car ahead's dirty air: less downforce, so the corner is taken a little slower (by the grip the axle that
    // loses most of its load lost at that speed: the front, which would push the car wide)
    if (p.wake > 0.02) { const P = p.p, W = P.wake ?? WAKE, aF = P.aeroF ?? P.b / P.L, D = P.kd * p.dfMul * vt * vt, mgF = P.mass * 9.81 * P.b / P.L, mgR = P.mass * 9.81 - mgF;
      vt *= Math.sqrt(Math.min((mgF + D * aF * (1 - p.wake * W[0])) / (mgF + D * aF), (mgR + D * (1 - aF) * (1 - p.wake * W[1])) / (mgR + D * (1 - aF)))); }
    // brake: how far a driver's braking points vary (each braking zone: the speed it aims for, x 1 + an error of about
    // this size: over = in too fast and running wide, under = time lost)
    if (sk && sk.brake) {
      if (vt < p.u - 2) { if (!ai.bz) { ai.bz = true; ai.bErr = (Math.random() + Math.random() + Math.random() - 1.5) * 1.4 * sk.brake; } }
      else if (vt > p.u + 1) ai.bz = false;
      if (ai.bz) vt *= 1 + ai.bErr;
    }
    if (oops && oops.type === 'late' && oops.phase === 0) vt *= oops.over; // braked too late: carries too much speed in
    if (pp && pp.push) vt *= 1 + pp.push; // (a claimed corner: braking a little later than the plan, to keep it)
    // (hunting the car ahead: pushing, out of the corners: where the plan's speed is rising, not into the braking zones,
    // where pushing only braked late into the back of them)
    else if (pp && (pp.stage === 'tow' || pp.stage === 'cut') && LV[la] >= LV[car.idx]) vt *= 1 + pp.att;
    // VSC: under the reference pace where the car is now (and where it's heading), slower still if the delta gets tight
    if (yellow === 'vsc') vt = Math.min(vt, Math.min(LV[car.idx], LV[la]) * VSC_PACE * ((car.vscDelta || 0) < 0.4 ? 0.86 : 0.95));
    else if (yellow && yellow !== 'sc') vt *= yellow === 'dy' ? 0.86 : 0.95;
    if (this.wx) { const g = tyreGripAt(p.tyre.c, this.wet, this.dirt), g0 = this.rain0 ? tyreGrip('wet', true) : tyreGrip('medium', false); vt *= Math.sqrt(Math.min(1.04, g / g0)); }
    // the safety car: everyone slows at once (a little quicker than it, so the field closes up on it), the first car
    // behind it follows it, and the rest follow them (the queue)
    if (yellow === 'sc' && !car.pitting) vt = Math.min(vt, Math.min(LV[car.idx], LV[la]) * 0.7);
    if (yellow === 'sc' && this.sc && !car.pitting) { const gap = this.sc.raw - car.raw;
      if (gap > 0 && gap < 500 && !this.cars.some(o => o !== car && !o.pitting && !o.gone && !o.wreck && o.raw > car.raw && o.raw < this.sc.raw)) slowTo = Math.min(slowTo, Math.sqrt(this.sc.v ** 2 + 2 * 9 * Math.max(0, gap - 16))); }
    if (car.blue || (ai.yieldTo && ai.yieldTo.car.progress < car.progress && car.progress - ai.yieldTo.car.progress < 40)) vt *= car.blueCls ? 0.98 : 0.93; // being lapped (or letting your teammate by): lift and let them by (a quicker class coming through: a touch, and hold your line)
    // passed under yellow: lift and let them back past (off the racing line, so they can get by)
    if (car.giveBack) {
      const o = car.giveBack.car, gap = car.progress - o.progress;
      vt = gap < 40 ? Math.min(vt, Math.max(10, o.phys.u - 6)) : vt * 0.85;
    }
    // off its line (alongside someone, defending, pushed wide): the learned speeds are for the line's arc. Like a driver
    // on a tighter or wider line than usual, take the corner ahead a little slower, by how far off it and how tight it is
    // (in 12-car races at Auburn it took F1 wall hits from ~30 to ~14 on the old line, and made the fitted one race safe)
    if (this.opts.offSlow !== false) {
      const dev = Math.abs(car.s - this.line[car.idx]), at = this.opts.offSlowAt ?? 0.8;
      if (dev > at) {
        const LK = this.lineK || this.lineCurv();
        let kmax = 0; for (let k = 0, n = Math.round((10 + u * 1.2) / T.ds); k <= n; k += 2) { const kk = LK[(car.idx + k) % N]; if (kk > kmax) kmax = kk; }
        ai.offK = Math.sqrt(Math.max(0.6, 1 - (dev - at) * kmax * (this.opts.offSlowK ?? 2)));
        vt *= pp && (pp.stage === 'dive' || pp.stage === 'out') ? Math.sqrt(ai.offK) : ai.offK; // (out of the tow and diving down the inside: committed to it)
      } else ai.offK = 1;
    }
    if (!car.onRoad) vt = Math.min(vt, 25);
    vt = Math.min(vt, slowTo);
    if (this.mode === 'race' && this.diff.rubber && !this.net && this.player && !this.player.finished) {
      const gap = car.progress - this.player.progress;
      vt *= gap > 250 ? 0.975 : gap < -250 ? 1.03 : 1;
    }
    const err = vt - p.u;
    let throttle = err > 0 ? Math.min(1, 0.3 + err * 0.35) : 0;
    let brake = err < -0.6 ? Math.min(1, -err * 0.4) : 0;
    if (p.slipR > 0.14) throttle *= 0.6;
    // like a driver feeling the rear: when the rears are at their limit and working harder than the fronts (power
    // oversteer on the way, in a fast sweeper or out of a slow corner), ease the throttle until they hook up
    const rearOver = p.gripR - Math.max(0.9, p.gripF);
    if (rearOver > 0) throttle *= Math.max(0.25, 1 - rearOver * 4);
    // ...and the front: when the fronts are at their limit, the car is turning less than the line needs and it's ending
    // up outside its line, near the edge (pushing wide on the power, which a locked diff makes worse), ease off (all the way, if need be: lifting puts weight on the
    // fronts) so they can turn it
    const kNow = p.r / Math.max(Math.abs(p.u), 5), push = kap * kNow > 0 && Math.abs(kap) > 0.004 ? 1 - Math.abs(kNow / kap) : 0;
    const out = Math.sign(p.delta), wide = (car.s - (this.line[car.idx] + ai.bias + ai.over + (ai.def || 0) + (ai.pOff || 0))) * out; // (m outside its line)
    const room = T.W[car.idx] / 2 - car.s * out; // (m to the outside edge)
    if (p.gripF > 0.9 && push > 0.1 && wide > 0.5 && room < 2) throttle *= Math.max(0, 1 - (push - 0.1) * 4 * Math.min(1, wide - 0.5));
    // impatience (0-1): on the power before the car is ready, ignoring that much of what the car is saying (a sliding
    // rear, fronts washing wide)
    if (sk && sk.imp && err > 0) throttle += sk.imp * (Math.min(1, 0.3 + err * 0.35) - throttle);
    // squeezed on like a driver, not stamped: the throttle comes in over ~0.35 s in a corner (quicker on a straight),
    // the brake trails off rather than dropping; lifting and braking are still instant
    const turning = Math.min(1, Math.abs(steer) * 3);
    ai.thr = throttle > (ai.thr || 0) ? Math.min(throttle, (ai.thr || 0) + dt * (8 - 5 * turning * (1 - (sk?.imp || 0)))) : throttle; // (an impatient driver stamps it)
    ai.brk = brake < (ai.brk || 0) ? Math.max(brake, (ai.brk || 0) - dt * 5) : brake;
    throttle = ai.thr; brake = ai.brk;
    if (brake > 0.05) throttle = 0;
    // stuck recovery
    if (this.state === 'racing' && p.speed < 2 && !car.pitting && !(T.open && car.lap > 1)) { ai.stuckT += dt; if (ai.stuckT > 3) { this.resetCar(car); ai.stuckT = 0; } }
    else ai.stuckT = 0;
    // facing the wrong way (after a spin): swing it round on full lock (a little help turning, like a driver would
    // with a flick of throttle) and rejoin
    const want = Math.atan2(T.FX[car.idx], T.FZ[car.idx]);
    let dh = want - p.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    if (Math.cos(dh) < 0.3 && p.speed < 10) {
      const turn = Math.sign(dh) || 1;
      steer = -turn; throttle = 0.45; brake = 0;
      p.r += (turn * 1.3 - p.r) * Math.min(1, dt * 4);
    }
    let handbrake = 0;
    if (oops && oops.type === 'spin' && oops.kicked && oops.t - oops.kickT < 0.5) { throttle = 1; brake = 0; handbrake = 1; steer = -oops.dir; }
    return { steer, throttle, brake, handbrake, analog: true };
  }

  // Defending: one move, made on the straight, to cover the inside of the next corner; held to its apex, then eased
  // back onto the line on the way out. No weaving (the move is decided once, not every frame from where the attacker
  // happens to be), no moving across in a corner, under hard braking or with the car moving around, and never into a
  // car that's already there. How well depends on the driver's racecraft (ai.craft, 0-1: World Career's rating): a
  // good one moves early and smoothly and leaves a car's width; a poor one moves later and quicker and leaves less.
  // (The old way, re-deciding every frame, flicked the car across and back: in two laps at Auburn, 2/3 of the AI's
  // slides and 7 of 9 car-to-car hits came while defending. DEF=old in .devtest/defend.mjs.)
  defend(car, dt, threat, fights, j) {
    const T = this.T, N = T.N, ai = car.ai, p = car.phys;
    if (ai.craft === undefined) ai.craft = 0.4 + Math.random() * 0.5;
    const craft = ai.craft, straight = Math.abs(T.K[car.idx]) < 1 / 400;
    let dm = ai.dMove;
    if (dm) {
      if (threat) dm.seen = this.raceTime;
      // over: past the apex, the attacker's dropped back (for 2 s, and only once on a straight again), or a blue flag
      if (car.progress > dm.end || (this.raceTime - dm.seen > 2 && straight) || threat && !fights || this.state !== 'racing') ai.dMove = dm = null;
    }
    const calm = Math.abs(p.beta) < 0.06 && Math.abs(p.r) < 0.25 && (ai.brk || 0) < 0.3;
    if (!dm && fights && this.state === 'racing' && !ai.lane && straight && calm) { // (not on the launch: weaving off the line only loses ground to the whole field)
      let kSum = 0, kPk = 0, apex = 0;
      for (let k = 20; k < 200; k += 4) { const kk = T.K[(car.idx + Math.round(k / T.ds)) % N]; kSum += kk; if (Math.abs(kk) > kPk) { kPk = Math.abs(kk); apex = k; } }
      if (Math.abs(kSum) > 0.05) {
        const side = Math.sign(kSum), rel = (threat.o.s - car.s) * side;
        // only if the attacker is heading for that side (or sitting in our tow). One already there and close is
        // past defending: a good driver leaves it; a poor one still moves over (as far as the clearance below lets them)
        const close = threat.gap > -(5.5 + 9), late = rel > 1.2 && close;
        // (and only when they're close enough to have a go: within ~16 m, or closing fast)
        const near = threat.gap > -16 || threat.o.phys.u > p.u + 3;
        if (near && (rel > 0 || Math.abs(rel) < 1.5) && (!late || craft < 0.4)) ai.dMove = dm = { side, at: side * (T.W[car.idx] / 2 - 2.4) * 0.75, end: car.progress + apex, seen: this.raceTime };
      }
    }
    // where to be (a lateral position; ai.def is it relative to the line at the steering point): the inside, but a
    // car's width (or less, for a poor driver) clear of an attacker close behind and already on that side
    let want = 0;
    if (dm) {
      let at = dm.at;
      if (threat && threat.gap > -(5.5 + 9) && (threat.o.s - car.s) * dm.side > 1) { const clear = 2.4 + 0.8 * craft, lim = threat.o.s - dm.side * clear; at = dm.side > 0 ? Math.min(at, Math.max(car.s, lim)) : Math.max(at, Math.min(car.s, lim)); }
      want = at - this.line[j];
    }
    // how fast across (m/s): the move itself 2.6 (poor) to 1.8 (good), only on a straight with the car settled; back to
    // the line 1.6 (past the apex that's the way the car's running out anyway: holding it tight there only spins it up)
    const def = ai.def || 0, back = !dm;
    let vMax = back ? 1.6 : 2.6 - 0.8 * craft;
    if (!back && (!calm || !straight)) vMax = 0;
    const v = Math.max(-vMax, Math.min(vMax, (want - def) * 1.5));
    ai.def = def + v * dt;
  }
  defendOld(car, dt, threat, fights) {
    const T = this.T, N = T.N, ai = car.ai;
    let defend = 0;
    // (only from a straight: a move across while still cornering runs the car off the road)
    if (fights && this.state === 'racing' && !ai.lane && Math.abs(T.K[car.idx]) < 1 / 400) { // (not on the launch: weaving off the line only loses ground to the whole field)
      let kSum = 0; for (let k = 20; k < 200; k += 4) kSum += T.K[(car.idx + Math.round(k / T.ds)) % N];
      if (Math.abs(kSum) > 0.05) {
        const inside = Math.sign(kSum) * (T.W[car.idx] / 2 - 2.4) * 0.75;
        // only if the attacker is heading for that side (or already sitting in our tow)
        if (Math.sign(threat.o.s - car.s) === Math.sign(kSum) || Math.abs(threat.o.s - car.s) < 1.5) defend = inside;
      }
    }
    ai.def = (ai.def || 0) + ((defend ? defend - this.line[car.idx] : 0) - (ai.def || 0)) * Math.min(1, dt * (defend ? 0.9 : 0.5));
  }

  // Now and then an AI driver gets a corner wrong: brakes too late, runs wide, or loses the rear on the exit.
  // Rolled once per corner, more likely in the wet, on worn tyres, with damage, under pressure and on the first lap.
  // Returns the mistake in progress: { type, dir, phase } (phase 0 = before the apex, 1 = after it)
  aiMistake(car, dt) {
    const ai = car.ai, T = this.T, N = T.N, p = car.phys;
    const fwd = (a, b) => ((b - a + N) % N) * T.ds;
    if (ai.err) {
      const e = ai.err;
      e.t += dt;
      const past = fwd(e.c.apex, car.idx) < T.L / 2;
      e.phase = past ? 1 : 0;
      // (a spin: stability aids off, a stab of throttle and the rear lets go)
      if (e.type === 'spin' && past && !e.kicked && p.speed > 12) { e.kicked = true; e.kickT = e.t; p.tc = false; p.r += e.dir * 2.5; }
      if (e.t > e.dur || (past && fwd(e.c.exit, car.idx) > 70 && fwd(e.c.exit, car.idx) < T.L / 2)) { ai.err = null; p.tc = true; }
      return ai.err;
    }
    ai.errCd = (ai.errCd || 0) - dt;
    const c = this.corners.at[car.idx];
    if (c === ai.lastC) return null;
    ai.lastC = c;
    if (c <= 0 || !this.mistakeP || this.state !== 'racing' || car.pitting || car.lap === 0 || ai.errCd > 0 || car.giveBack) return null;
    const cor = this.corners.list[c - 1];
    if (fwd(car.idx, cor.entry) > 120) return null; // (only on the way in)
    let k = 1;
    if (this.rain) k *= 1.8;
    if (Math.min(p.tyre.wf, p.tyre.wr) < 0.35) k *= 1.6;
    if (Math.max(p.dmg.fw, p.dmg.rw, p.dmg.ch) > 0.3) k *= 1.3;
    if (car.lap === 1) k *= 1.5;
    if (this.cars.some(o => o !== car && !o.gone && !o.pitting && car.progress - o.progress > 0 && car.progress - o.progress < 15)) k *= 1.4;
    if (Math.random() > this.mistakeP * k * (ai.mk ?? 1)) return null;
    const r = Math.random();
    const type = r < 0.45 ? 'wide' : r < 0.85 ? 'late' : 'spin';
    ai.errCd = 15;
    ai.err = { type, c: cor, dir: cor.dir, t: 0, phase: 0, dur: 7, over: 1.07 + Math.random() * 0.08, far: 1.5 + Math.random() * 2.5 };
    return ai.err;
  }

  // the incident log (World Career keeps it): overtakes between you and another driver, on track (not in the pits)
  notePasses(prev, now) {
    const me = this.player, a = prev.indexOf(me), b = now.indexOf(me);
    // (the first seconds sort the grid out, and a jump of several places in one frame is a reset or the pits, not racing)
    if (a === b || me.pitting || me.gone || me.lap < 1 || this.raceTime < 8 || Math.abs(a - b) > 2) return;
    const t = this.raceTime, lo = Math.min(a, b), hi = Math.max(a, b);
    for (let k = lo; k <= hi; k++) {
      const o = prev[k]; if (o === me || o.pitting || o.gone || !o.pid) continue;
      const key = o.pid; this.passT = this.passT || {};
      if (t - (this.passT[key] ?? -99) < 4) continue; // (side by side through a corner: one pass, not five)
      this.passT[key] = t;
      // a = who made the pass, b = who was passed
      this.log.push(b < a ? { type: 'pass', a: 'P', b: o.pid, lap: me.lap, t } : { type: 'pass', a: o.pid, b: 'P', lap: me.lap, t });
      // past them right after hitting them from behind: a bump and run, if the hit cost them (the stewards decide that
      // 2.5 s on: racecontrol's stewards, which call it then if the pass came first). A tap that didn't isn't one.
      const bt = (this.bumpT || {})[o.pid];
      if (b < a && t - (bt ?? -99) < 3) { if ((this.bumpHurt || {})[o.pid] === bt) this.dirty('bumprun', o); else (this.bumpPass ||= {})[o.pid] = t; }
    }
  }

  // Dirty driving the stewards don't flag, by you (World Career remembers it: grudges, reputation). Forcing someone off:
  // alongside them, moving across at them, and they go off the road a moment later. A brake test: braking hard where
  // nobody brakes, with someone right behind (brakeTestNow).
  // (A bump and run is in notePasses, from the stewards' contact cases: racecontrol sets bumpT and bumpHurt.)
  dirtyCheck(dt) {
    const me = this.player; if (!me || me.gone || me.pitting || me.finished || this.raceTime < 8 || !dt) return;
    const t = this.raceTime, ds = this.squeeze || (this.squeeze = {});
    const vs = (me.s - (me.prevS ?? me.s)) / dt; me.prevS = me.s;
    const bt = this.brakeTestNow(me, dt);
    for (const o of this.cars) {
      if (o === me || o.gone || o.pitting || !o.pid) continue;
      const dp = o.progress - me.progress, gap = o.s - me.s;
      // alongside, close, and closing the gap sideways
      // (on the track: inside the white lines and the kerbs, so onto paved runoff is off too)
      const on = o.onRoad && o.surface !== 'runoff';
      if (Math.abs(dp) < 4.5 && Math.abs(gap) < 2.7 && Math.sign(vs) === Math.sign(gap) && Math.abs(vs) > 1.2 && on) ds[o.pid] = t;
      if (!on && o.wasOn && t - (ds[o.pid] ?? -99) < 1.3) { ds[o.pid] = -99; this.dirty('forcedoff', o); }
      o.wasOn = on;
      // brake test: a real stop (brakeTestNow), someone 3-15 m behind closing fast or on the brakes to miss you
      if (bt && dp < -3 && dp > -15 && ((o.phys.speed || 0) > (me.phys.speed || 0) + 1.5 || (o.ctl?.brake || 0) > 0.3)) this.dirty('braketest', o);
    }
  }
  // Braking with no reason to: held hard for 0.6 s and a real slowing (8 m/s), and no reason in sight. Reasons:
  // a corner anywhere you could be braking for it (early, gently, as people do: anywhere slower within the distance to
  // stop at 5 m/s², not one spot 60 m on, which every early braker and every trail brake got past), a car
  // just ahead, flags, being off the road, or the pits. (It used to fire about every race on clean, early braking.)
  brakeTestNow(me, dt) {
    const v = me.phys.speed || 0, T = this.T, b = me.btk || (me.btk = { t: 0, v0: 0 });
    if ((me.ctl?.brake || 0) < 0.75 || v < 15) { b.t = 0; return false; }
    if (!b.t) b.v0 = v;
    b.t += dt;
    if (b.t < 0.6 || b.v0 - v < 8) return false;
    if (!me.onRoad || me.surface === 'runoff' || me.pitReq || (me.autoT > 0)) return false;
    const fa = this.rc && this.rc.flagAhead ? this.rc.flagAhead(me.idx) : null;
    if (this.sc || (fa && fa.f && fa.f !== 'g')) return false;
    if (this.cars.some(o => o !== me && !o.gone && o.progress - me.progress > -2 && o.progress - me.progress < 40)) return false;
    const reach = Math.min(500, b.v0 * b.v0 / 10 + 40);
    for (let k = -Math.round(30 / T.ds), n = Math.round(reach / T.ds); k <= n; k++) if ((this.lineV[(me.idx + k + T.N) % T.N] ?? 99) < b.v0 * 0.97) return false; // (from just behind: still braking through a corner, past its apex)
    return true;
  }
  dirty(kind, o) {
    const t = this.raceTime, k = kind + o.pid, last = this.dirtyT || (this.dirtyT = {});
    if (t - (last[k] ?? -99) < 8) return;
    last[k] = t;
    this.log.push({ type: kind, a: 'P', b: o.pid, lap: this.player.lap, t });
  }

  resetCar(car) {
    const T = this.T, i = car.idx;
    const s = car.isPlayer ? 0 : this.line[i];
    car.phys.place(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s, Math.atan2(T.FX[i], T.FZ[i]));
    this.updateTracker(car);
    if (car.tl) car.tl.out = false;
    if (car.ai) { car.ai.err = null; car.phys.tc = true; }
  }

  // ---------- main update ----------
  update(dt, controls, press) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 20);
    this.stateT += dt;
    const racing = this.state === 'racing' || this.state === 'finished';

    // state machine (online: everyone follows the host's shared clock)
    if (this.net && !this.quali) this.netClock();
    else if (this.state === 'intro' && this.bcIntro && !this.bcIntroDone) {
      // first, the broadcast: a flyover of the circuit while the booth introduces it (main.js plays it, and sets
      // bcIntroEnd when they're done). Enter / A skips it.
      this.bcIntroDone = true; this.state = 'broadcast'; this.stateT = 0;
      this.events.push({ type: 'booth-intro', ids: this.introIds() });
    } else if (this.state === 'broadcast') {
      if (press.skip || this.bcIntroEnd || this.stateT > 75) {
        if (!this.bcIntroEnd) this.events.push({ type: 'booth-stop' });
        this.state = 'intro'; this.stateT = 0;
      }
    } else if (this.state === 'intro') {
      if (this.stateT > 3.2 || press.skip) { this.state = 'countdown'; this.stateT = 0; this.events.push({ type: 'countdown' }); }
    } else if (this.state === 'countdown') {
      const n = Math.min(5, Math.floor(this.stateT / 0.9));
      if (n > this.lightsOn) { this.lightsOn = n; sfx.light(); this.events.push({ type: 'lights', n }); }
      if (!this.goAt && this.lightsOn >= 5) this.goAt = this.stateT + 0.6 + Math.random() * 1.2;
      if (this.goAt && this.stateT > this.goAt) { this.state = 'racing'; this.stateT = 0; this.lightsOn = 0; sfx.go(); this.events.push({ type: 'go' }); }
    }
    this.world.startLights.forEach((m, k) => m.color.setHex(k < this.lightsOn ? 0xff2010 : 0x220606));

    if (racing && (!this.net || this.quali)) this.raceTime += dt; // (online races take it from the shared start; a session times each car's laps on its own copy)
    if (this.timed && !this.timed.up && racing && this.raceTime >= this.timed.dur) { this.timed.up = true; this.events.push({ type: 'timeup' }); }
    // (a timed race: your stint's up, the engineer says so, once)
    { const pl = this.player; if (this.timed && racing && pl && !pl.finished && !pl.pitting && !pl.stintCall && !this.timed.flag && (!this.crew || this.crew.cur === 'P') && this.raceTime - (pl.stintT0 || 0) >= this.timed.dur / this.timed.stints && this.timed.dur - this.raceTime > this.timed.dur / this.timed.stints * 0.4) {
      pl.stintCall = true; this.events.push({ type: 'radio', vo: null, msg: this.crew ? `That's your stint. <b>Box this lap</b> for tires${this.crew ? ` and ${this.crew.name.split(' ').pop()}` : ''}.` : "That's your stint. <b>Box this lap</b> for tires.", big: true });
    } }
    if (this.crew && racing && this.player && !this.player.finished) {
      this.crew.t[this.crew.cur] += dt; // (who's driven how long)
      // (you're in, and staying out much longer leaves your co-driver short of their minimum: the engineer says so)
      const n = this.crewNeed(), c = this.crew;
      if (c.cur === 'P' && n.C > 0 && n.C >= n.R - n.stint * 1.15 && !this.player.pitting && this.raceTime - (c.warnT ?? -99) > 45) {
        c.warnT = this.raceTime; this.events.push({ type: 'radio', vo: null, msg: `Box this lap: <b>${c.name.split(' ').pop()}</b> has to drive. The rules need them in the car.`, big: true });
      }
    }
    // (the time of day moving with the race clock: four times a second; headlights on once it's dusky)
    if (this.tod0 != null && (this.todT == null || Math.abs(this.raceTime - this.todT) > 0.25)) {
      this.todT = this.raceTime; this.world.setTimeOfDay(this.todHour());
      const k = this.world.nightK(); this.night = k > 0.45; this.ambT = this.rain ? 16 : 30 - 10 * k;
    }

    // controls
    for (const car of this.cars) {
      if (car.gone) continue;
      // (how hard it's accelerating, smoothed over ~0.2 s: what the AI behind it on the launch expects it to keep doing)
      if (dt > 0) { const u = car.phys.u || 0; car.acc = (car.acc || 0) + ((u - (car.uPrev ?? u)) / dt - (car.acc || 0)) * Math.min(1, dt * 5); car.uPrev = u; }
      if (car.remote) { this.netApply(car, dt); continue; }
      if (car.wreck) { car.ctl = { steer: 0, throttle: 0, brake: 0.5 }; continue; } // (nothing left to drive)
      const co = car.isPlayer && this.crew && this.crew.cur === 'C' && !car.finished; // (your co-driver has your car)
      if (car.isPlayer && !co && car.pitting && car.pitPhase === 'out' && this.pit && this.state === 'racing') {
        // out of the box it's yours to drive (the autopilot ran wide at some pit exits, into walls and gravel);
        // the limiter holds you to the pit speed until the line at the end of the lane
        car.ctl = this.pitLimiter(car, this.brakeAssist(car, controls));
      } else if (car.pitting && this.pit) {
        car.ctl = this.pitControls(car, dt);
      } else if (car.isPlayer) {
        if (this.state === 'finished') {
          // the game has your car now (the cool-down lap): an easy pace, and from here on it can't cost you (damage)
          if (car.handT == null) { car.handT = this.raceTime; car.handV = car.phys.speed; car.ai ||= { pace: 0.8, bias: 0, over: 0, stuckT: 0, react: 0 }; car.ai.pace = Math.min(car.ai.pace, 0.72); }
          car.ctl = this.aiControlsFor(car, dt);
        }
        else if (co && this.state === 'racing') { car.ai = this.crew.ai; car.ctl = this.aiControlsFor(car, dt); }
        else if (car.autoT > 0 && this.state === 'racing') { car.autoT -= dt; car.ctl = this.aiControlsFor(car, dt); }
        else car.ctl = this.brakeAssist(car, controls);
      } else {
        car.ctl = this.aiControls(car, dt);
        if (this.state === 'racing' && this.stateT < car.ai.react && this.mode === 'race') car.ctl.throttle = 0;
      }
    }
    if (this.player && press.shiftUp) { this.player.phys.shift(1); sfx.shift(); }
    if (this.player && press.shiftDown) { this.player.phys.shift(-1); sfx.shift(); }
    if (this.player && press.reset && racing && !this.player.finished && !this.player.pitting && !this.player.gone && !this.player.wreck) { if (this.drift && this.drift.active) this.drift.lose('reset'); this.resetCar(this.player); }
    if (press.camera) { this.camMode = (this.camMode + 1) % CAMS.length; }
    if (press.line && this.lineMesh) {
      const modes = ['off', 'brake', 'full'];
      this.lineMode = modes[(modes.indexOf(this.lineMode) + 1) % modes.length];
      this.events.push({ type: 'line', mode: this.lineMode });
    }

    // physics
    const n = Math.ceil(dt / STEP), h = dt / n;
    for (let s = 0; s < n; s++) {
      for (const car of this.cars) {
        if (car.remote || car.gone) continue;
        const locked = !racing;
        const env = this.surfaceEnv(car);
        car.phys.step(h, locked ? { steer: 0, throttle: 0, brake: 0 } : car.ctl, env);
        if (car.wreck) this.wreckStep(car, h);
        if (locked) { car.phys.vx = car.phys.vz = car.phys.r = 0; car.phys.gear = 1; car.phys.revT = 0; car.phys.rpm = car.phys.p.idle * 1.05 + (car.ctl.throttle || 0) * (car.phys.p.redline * 0.72 - car.phys.p.idle); car.phys.throttle = car.ctl.throttle || 0; }
        this.updateTracker(car);
        if (car === this.player && this.rec && car.lap > 0 && !car.finished) this.rec.sample(car, this.raceTime);
        this.barriers(car);
        this.pitWall(car);
        if (car.pitPhase === 'stop') { car.phys.vx = car.phys.vz = car.phys.r = 0; }
      }
      this.collideCars();
    }

    // pit stops
    if (this.letBy || this.cars.some(c => c.ai && c.ai.yieldTo)) this.wallAfter();
    if (this.sc) this.scUpdate(dt);
    if (this.mode === 'race' && this.state === 'racing' && this.player && !this.player.finished && (this.talkT = (this.talkT || 0) + dt) > 1) { this.talkT = 0; this.storyRadio(this.player); }
    if (this.wx && (this.state === 'racing' || this.state === 'finished')) this.wxUpdate(dt);
    for (const car of this.cars) if (car.wreck && !car.gone) this.wreckUpdate(car, dt);
    if (this.loose) this.looseUpdate(dt);
    for (const car of this.cars) { this.pitUpdate(car, dt); this.engineCheck(car); if (car.isPlayer) { this.wallUpdate(car); this.tyreRadio(car); this.planRadio(car); this.failureCheck(car); } }
    this.slipstream(dt);
    for (const car of this.cars) if (car.launch) car.phys.powerMul = car.basePower * (this.state === 'racing' && this.raceTime < 6 ? 1.25 : 1);

    // progress / positions
    const T = this.T;
    for (const car of this.cars) {
      car.hitCd = (car.hitCd || 0) - dt;
      const d = T.D[car.i] + car.f * T.ds;
      if (car.lap === 0) car.progress = d > T.L / 2 ? d - T.L : d;
      else if (car.cpNext === 1 && car.idx > T.N * 0.75) car.progress = (car.lap - 1) * T.L + d - T.L;
      else car.progress = (car.lap - 1) * T.L + d;
      car.raw = car.progress;
      if (racing) this.timeLine(car);
      if (car.finished) car.progress = 1e9 - this.finishOrder.indexOf(car);
      if (car.gone) car.progress = -1e9 - car.startPos;
    }
    // point-to-point outside a race (time trial, menu background): once a run is done, back to the grid
    // (a practice or qualifying run: back up to the garage instead)
    if (T.open && this.mode !== 'race') for (const car of this.cars) {
      if (car.remote || car.gone || car.lap < 2) continue;
      car.runoffT = (car.runoffT || 0) + dt;
      if ((car.runoffT > 2.5 && car.phys.speed < 4) || car.runoffT > 12) { if (this.quali && car.isPlayer && !this.quali.done) this.endRun(car); else this.restartRun(car); }
    }
    const order = [...this.cars].sort((a, b) => b.progress - a.progress);
    if (this.order && this.mode === 'race' && this.state === 'racing' && this.player) { this.notePasses(this.order, order); this.dirtyCheck(dt); }
    order.forEach((c, k) => c.pos = k + 1);
    this.order = order;
    if (this.rc) this.rc.update(dt);
    if (this.bc) this.bc.update(dt);
    if (this.quali && !this.paused) this.qualiUpdate(dt);

    // visuals
    if (this.drift && this.player && dt > 0) this.drift.update(dt, this.player, this.state === 'racing' && !this.player.pitting && !this.player.finished && !this.player.gone);
    if (this.pitLife) this.pitLife.update(dt);
    for (const car of this.cars) if (!car.gone) this.placeModel(car, dt);
    if (this.dirtTrack && dt > 0 && !this.paused) { // (the cars work the dirt: only racing, practice or a test, not on the grid)
      const run = this.state === 'racing';
      if (run) for (const car of this.cars) if (!car.gone && car.phys && car.onRoad) this.dirtTrack.drive(car.idx, car.s, car.phys.speed, dt);
      this.dirtTrack.update(dt, run);
    }
    if (this.rubber && dt > 0 && !this.paused) { // (the cars lay rubber: racing, practice or a test, not on the grid)
      if (this.state === 'racing') for (const car of this.cars) {
        if (car.gone || !car.phys || car.pitting) continue;
        const p = car.phys, i0 = car.rubI ?? car.idx; car.rubI = car.idx;
        if (car.onRoad && p.speed > 8) this.rubber.drive(i0, car.idx, car.s, p.susp ? p.susp.tw : 1.6, Math.max(p.gripF || 0, p.gripR || 0));
      }
      // (practice / qualifying: the field's laps are simulated, so their rubber goes down along the line)
      if (this.state === 'racing' && this.quali && !this.net) this.rubber.field(dt, Math.min(11, this.opts.opponents ?? 7), this.rubberLap);
      this.rubber.update(dt, this.wet);
    }
    if (this.rec) this.updateGhost(dt);
    this.updateCamera(dt);
    this.world.update(dt, this.camera, this.rain ? this.wetLights() : null, this.cars.filter(c => !c.gone && c.phys).map(c => ({ x: c.phys.x, z: c.phys.z, speed: c.phys.speed || 0, vx: c.phys.vx, vz: c.phys.vz })));
    setCrowdCars(this.cars.filter(c => !c.gone && c.phys).map(c => ({ x: c.phys.x, y: c.y, z: c.phys.z })), this.camera.position, this.camera.fov); // (the spectators watch them; the far ones aren't drawn)
    if (this.spray) this.updateSpray(dt);
    this.skids.update();
    this.updateRacingLine(dt);
    this.updatePitGuide();
    this.updateProgramme(dt);
    this.particles.update(dt);
    const fxCars = this._fxCars || (this._fxCars = []); fxCars.length = 0;
    for (const c of this.cars) if (!c.gone && c.phys && c.phys.speed > 2) fxCars.push({ x: c.phys.x, y: c.y, z: c.phys.z, vx: c.phys.vx, vz: c.phys.vz });
    this.fx.update(dt, this.camera, fxCars);

    // wrong way
    if (this.player && racing) {
      const p = this.player.phys, i = this.player.idx;
      const dot = Math.sin(p.h) * T.FX[i] + Math.cos(p.h) * T.FZ[i];
      if (dot < -0.3 && p.speed > 3) this.wrongT += dt; else this.wrongT = 0;
    }
    this.wrongWay = this.wrongT > 1.2;

    // audio
    this.updateAudio();

    if (this.state === 'finished' && this.mode === 'race') {
      if (this.stateT > 5 && !this.resultsSent) { this.resultsSent = true; this.events.push({ type: 'results' }); }
    }
    // attract: cycle focus
    if (this.mode === 'attract') {
      this.tvTimer += dt;
      if (this.tvTimer > 9) { this.tvTimer = 0; this.focus = this.cars[Math.floor(Math.random() * this.cars.length)]; this.tv = null; }
    }
  }

  aiControlsFor(car, dt) {
    if (!car.ai) car.ai = { pace: 0.8, bias: 0, over: 0, stuckT: 0, react: 0 };
    // (your car on autopilot: the cool-down lap, the pit crew: drives with the AI's aids, so it doesn't spin with Sim)
    if (car.isPlayer) { car.phys.aid = { ...AI_AIDS }; car.autoAids = true; }
    return this.aiControls(car, dt);
  }

  // ---------- driver aids ----------
  // change the player's aids mid-race (pause > Options)
  setPlayerAids(aids, gearbox) {
    this.opts.aids = aids;
    const p = this.player && this.player.phys; if (!p) return;
    p.setAids(physAids(aids));
    if (gearbox) p.auto = gearbox !== 'manual';
  }

  // Braking assist: brakes for you when you're arriving at a corner faster than you can make it (the speed a good
  // human carries, from the car's learned speed plan). You can always brake harder yourself. Also where your own
  // aids go back on after the autopilot / pit crew had the car.
  brakeAssist(car, ctl) {
    const p = car.phys;
    if (car.autoAids) { p.aid = { ...p.aidBase }; car.autoAids = false; }
    if (!p.aidBase.brake || this.state !== 'racing' || p.gear < 1) return ctl;
    const T = this.T, N = T.N, u = Math.max(0, p.u);
    if (u < 10) return ctl;
    const V = car.lineV || this.lineV, grip = p.gripNow();
    const a = p.p.mu * grip * (9.81 + (p.p.kd / p.p.mass) * u * u) * 0.72;
    const vk = 0.93 * Math.sqrt(grip);
    let allowed = Infinity;
    for (let k = 1, n = Math.round(260 / T.ds); k <= n; k += 2) {
      const i = (car.idx + k) % N, v = V[i] * vk;
      allowed = Math.min(allowed, Math.sqrt(v * v + 2 * a * k * T.ds));
    }
    if (u <= allowed - 1.5) return ctl;
    const out = { ...ctl, throttle: Math.min(ctl.throttle, Math.max(0, (allowed - u) / 1.5)) };
    if (u > allowed) {
      out.brake = Math.max(ctl.brake, Math.min(1, 0.3 + (u - allowed) * 0.35));
      p.aidT.brake = 0.25;
    }
    return out;
  }

  // the aids for the HUD: the ones you have on, in a fixed order, lit while stepping in
  aidHud() {
    const p = this.player && this.player.phys; if (!p) return [];
    const b = p.aidBase, t = p.aidT;
    return [['abs', 'ABS', b.abs], ['tc', 'TC', b.tc > 0], ['stab', 'SC', b.stab], ['cs', 'CS', b.cs > 0], ['brake', 'BA', b.brake], ['steer', 'SA', b.steer]]
      .filter(x => x[2]).map(([k, s]) => ({ k, s, act: t[k] > 0 }));
  }

  // controller vibration: [strong (big, low motor), weak (small, fast motor)], each 0..1
  feel() {
    const pl = this.player;
    if (!pl || pl.gone || (this.state !== 'racing' && this.state !== 'finished')) return [0, 0];
    const p = pl.phys, P = p.p, sp = p.speed, now = performance.now();
    let s = 0, w = 0;
    if (sp > 1) {
      const v15 = Math.min(1, sp / 15);
      // grip: a light buzz once a tyre is using ~90% of its grip, building to the limit, then more as it slides past it
      // (its slip past the peak): the fronts on the small motor (understeer), the rears on the big one (the back
      // stepping out, wheelspin)
      const g = (use, slip) => use < 0.88 ? 0 : 0.1 + 0.25 * Math.min(1, (use - 0.88) / 0.12) + (slip > 1 ? 0.3 * Math.min(1, (slip - 1) / 0.8) : 0);
      w += g(p.useF || 0, p.gripF || 0) * v15;
      s += g(p.useR || 0, p.gripR || 0) * v15;
      if (p.lockF || p.lockR) { s += 0.3; w += 0.25; }                    // locked wheels
      if ((p.aidT.tc > 0 || p.aidT.stab > 0) && p.throttle > 0.3) s += Math.floor(now / 80) % 2 ? 0.18 : 0; // TC / SC cutting the power: a stutter
      if (p.aidT.abs > 0) w += Math.floor(now / 60) % 2 ? 0.45 : 0.1;     // ABS pulsing the pedal
      if (pl.surface === 'kerb' || pl.rumble) w += 0.35 * v15;            // kerbs
      if (!pl.onRoad) { w += 0.22 * v15; s += 0.12 * v15; }               // grass / gravel
      if (p.rpm >= P.redline - 60 && p.throttle > 0.5) w += 0.12;          // rev limiter
    }
    if (p.gear !== this.feelGear) { if (this.feelGear != null && p.gear > 0 && !p.auto) this.kickAt = now; this.feelGear = p.gear; }
    if (now - (this.kickAt || 0) < 70) s += 0.3;                          // gear change kick (manual)
    s += Math.min(1, this.shake * 1.2);                                   // impacts
    return [s, w];
  }

  placeModel(car, dt) {
    const T = this.T, p = car.phys, m = car.model;
    const i = car.i, j = i === T.cut ? i : (i + 1) % T.N;
    let y = surfaceY(T, i, car.f, car.s) + this.A.LIFT[car.idx];
    // (kerbs, sidewalks, grass: each wheel rides the ground under it in the physics, and the body follows on its springs.
    // An online rival's physics doesn't run here: sit it on the ground under its centre)
    if (car.remote) { const kind = this.surfaceKind(car.idx, car.s, p.x, p.z, car.i + car.f); y += this.groundZ(kind, car.idx, car.s, T.D[car.i] + car.f * T.ds, p.x, p.z); car.rumble = kind === 'kerb' ? 1 : 0; }
    car.y = y;
    const slope = (T.Y[j] - T.Y[i]) / T.ds;
    const bank = T.B[i] + (T.B[j] - T.B[i]) * car.f;
    const t3 = new THREE.Vector3(T.FX[i], slope, T.FZ[i]).normalize();
    const r3 = new THREE.Vector3(T.RX[i] * Math.cos(bank), Math.sin(bank), T.RZ[i] * Math.cos(bank));
    const nrm = new THREE.Vector3().crossVectors(r3, t3).normalize();
    const f = new THREE.Vector3(Math.sin(p.h), 0, Math.cos(p.h));
    f.addScaledVector(nrm, -f.dot(nrm)).normalize();
    const x = new THREE.Vector3().crossVectors(nrm, f);
    const mat = new THREE.Matrix4().makeBasis(x, nrm, f);
    const q = new THREE.Quaternion().setFromRotationMatrix(mat);
    if (dt >= 1) car.q.copy(q); else car.q.slerp(q, Math.min(1, dt * 14));
    m.group.quaternion.copy(car.q);
    m.group.position.set(p.x, y + (car.lift || 0), p.z); // (lift: up on the jacks in a pit stop)
    // suspension: the body rolls / pitches / bounces exactly as the physics' sprung body does (the same springs, dampers
    // and anti-roll bars that set each tyre's load), plus the kerb rumble; each wheel where its physics wheel is (on the
    // road, up a kerb, or hanging from the body at full droop when the body lifts), tilted with its axle and the body
    const bump = car.bump || (car.bump = [0, 0, 0, 0]);
    // (each wheel on screen follows its physics wheel; the model's +x side is the physics' left, FL FR RL RR = 0 1 2 3)
    if (p.wz) m.wheels?.forEach((w, k) => { bump[k] = p.wz[(w.front ? 0 : 2) + (w.pivot.position.x > 0 ? 0 : 1)]; });
    m.animate({
      steer: p.delta, spin: p.u * Math.min(dt, 0.05),
      roll: p.roll || 0, pitch: -(p.pitch || 0),
      heave: p.heave || 0, bump, solidR: !!p.p.solidR,
    });
    if (car.wreck) this.wreckPose(car);
    const braking = p.braking > 0.1 && p.u > 1;
    const flash = this.rain && (Math.floor(this.raceTime * 4) % 2 === 0);
    m.lightMat.color.setHex(braking || flash ? 0xff2a1a : 0x551010);
    m.coronaMat.opacity = (this.night || this.rain) ? (braking || flash ? 0.9 : 0.25) : 0;
    if (m.setLights) m.setLights({ brake: braking || flash, night: this.night, rain: this.rain });

    // skid marks & particles
    const slide = p.slipR > 0.16 || p.slipF > 0.2 || p.spin > 0.05;
    const sn = Math.sin(p.h), cs = Math.cos(p.h);
    for (const side of [-1, 1]) {
      const wx = p.x - sn * 1.6 + cs * 0.8 * side, wz = p.z - cs * 1.6 - sn * 0.8 * side;
      const key = side < 0 ? 'skL' : 'skR';
      const mark = (slide && car.onRoad && p.speed > 4) || (!car.onRoad && p.speed > 3);
      const dirtRoad = this.dirt && car.surface === 'road';
      car[key] = this.skids.add(car[key], mark, wx, y + 0.035, wz, car.onRoad ? 0.55 : 0.35, car.onRoad && !dirtRoad ? 0x0a0a0a : 0x3a2a18);
    }
    if (dt < 1) {
      const rate = Math.min(1, p.speed / 30);
      this.tireFx(car, y, dt);
      if (this.rain && p.speed > 15 && Math.random() < rate * 0.45) {
        this.particles.spawn(p.x - sn * 2.8, y + 0.4, p.z - cs * 2.8, 0x9aa4b4, 2.2, p.vx * 0.5, 0.3, p.vz * 0.5, 0.22, 2.2);
      }
    }
  }

  // where each tire touches the ground in the car's own frame ([x to the model's +x side, z forward, front?]), from its model
  wheelSpots(car) {
    const m = car.model;
    if (car.wSpots && car.wSpotsM === m) return car.wSpots;
    if (!m?.wheels?.length) return WHEEL_SPOTS;
    const g = m.group, v = new THREE.Vector3(), q = g.quaternion.clone(), pos = g.position.clone();
    g.quaternion.identity(); g.position.set(0, 0, 0); g.updateMatrixWorld(true);
    car.wSpots = m.wheels.map(w => { w.pivot.getWorldPosition(v); return [v.x, v.z, !!w.front]; });
    g.quaternion.copy(q); g.position.copy(pos); g.updateMatrixWorld(true);
    car.wSpotsM = m;
    return car.wSpots;
  }

  // tire smoke on tarmac (a tire sliding, spinning or locked), dust and thrown dirt on loose ground; emitted at a steady
  // rate per second from each tire, spread along the frame's path so a fast car leaves an even trail
  tireFx(car, y, dt) {
    const p = car.phys, fx = this.fx, cam = this.camera.position, R = Math.random;
    const dist = Math.hypot(p.x - cam.x, p.z - cam.z); if (dist > 280) return;
    const lod = dist < 70 ? 1 : dist < 160 ? 0.5 : 0.25, big = 1 / Math.sqrt(lod); // (far away: fewer, bigger puffs)
    const sn = Math.sin(p.h), cs = Math.cos(p.h), sp = p.speed, thr = p.throttle || 0;
    const surf = car.surface, kind = this.dirt && surf === 'road' ? 'dirt' : !car.onRoad && LOOSE[surf] ? surf : null, L = kind && LOOSE[kind];
    const spin = Math.min(1, (p.spin || 0) * 5);
    const slideR = Math.min(1, Math.max(0, (p.slipR - 0.14) / 0.3)), slideF = Math.min(1, Math.max(0, (p.slipF - 0.2) / 0.3));
    const lockR = p.lockR && sp > 3 ? 0.8 : 0, lockF = p.lockF && sp > 3 ? 0.8 : 0;
    const acc = car.fxAcc || (car.fxAcc = new Float32Array(8)), W = this.wheelSpots(car);
    for (let w = 0; w < W.length && w < 4; w++) {
      const [lx, lz, front] = W[w];
      const wx = p.x + lx * cs + lz * sn, wz = p.z - lx * sn + lz * cs;
      const slide = front ? Math.max(slideF, lockF) : Math.max(slideR, lockR), sp2 = front ? 0 : spin;
      let rate = 0, pk = 0, kick = 0, chunks = 0;
      if (!L) {
        // tarmac: smoke, thicker the harder it slides (and none at a crawl unless it's spinning on the spot)
        pk = Math.max(slide, sp2) * Math.min(1, (sp + sp2 * 25) / 9) * (this.rain ? 0.3 : 1);
        rate = pk > 0.02 ? 22 + 55 * pk : 0;
        kick = sp2 * 9;
      } else {
        // loose ground: a trail of dust at speed, clouds sliding or spinning up, dirt thrown off the rears
        const k = Math.min(1, sp / 35), wet = (this.rain ? L.wetK : 1) * FX.dirt;
        pk = Math.min(1, k * 0.6 + slide * 0.7 + sp2 * 0.6);
        rate = sp > 3 || sp2 > 0.1 ? (front ? 0.45 : 1) * L.dustN * (k * 0.5 + slide + sp2 * 0.8) * wet : 0;
        chunks = sp > 2 || sp2 > 0.1 ? (front ? 0.3 : 1) * L.chunkN * (k * 0.4 + slide * 0.8 + sp2 * 1.2 + thr * k * 0.3) * (this.rain ? 1.3 : 1) * FX.dirt : 0;
        kick = front ? 2 : 3 + sp2 * 12 + thr * 3;
      }
      if (rate > 0) {
        for (acc[w] += rate * lod * dt; acc[w] >= 1; acc[w]--) {
          const t = R() * dt, keep = L ? 0.3 : 0.15;
          fx.puff(L ? DUST : SMOKE, wx - p.vx * t, y + 0.25, wz - p.vz * t, p.vx * keep - sn * kick * 0.5, p.vz * keep - cs * kick * 0.5,
            L ? (this.rain ? L.wetDust : L.dust) : 0xe4e4e4, pk, y, big);
        }
      } else acc[w] = 0;
      if (chunks > 0) {
        for (acc[w + 4] += chunks * lod * dt; acc[w + 4] >= 1; acc[w + 4]--) {
          const t = R() * dt, back = kick * (0.6 + R() * 0.6), side = (R() - 0.5) * 3 + Math.sign(lx) * R() * 1.5;
          fx.chunk(wx - p.vx * t, y + 0.15, wz - p.vz * t, p.vx * 0.55 - sn * back + cs * side, 1.5 + R() * 3 + kick * 0.25, p.vz * 0.55 - cs * back - sn * side,
            this.rain ? L.mud : L.chunk, L.size * (0.5 + R()) * Math.sqrt(big), y - 0.05);
        }
      } else acc[w + 4] = 0;
    }
  }

  // ---------- racing line (green = throttle, yellow = lift, red = brake) ----------
  // Two looks (settings.lineStyle): 'blocks' (default), tiles along the line like F1 25's 3D line: the color runs
  // green → yellow → orange → red with how hard you need to brake, the orange and red ones tip up off the road to face
  // you (a stepped wall at the brake point), and as they come close they settle flat and fade out so they never get in
  // the way. 'flat': the old ribbon painted on the road.
  buildRacingLine() {
    const T = this.T, N = T.N;
    // reference speed a good human can carry (a touch under the AI limit)
    const ref = this.refV = new Float32Array(N);
    for (let i = 0; i < N; i++) ref[i] = this.lineV[i] * 0.94;
    // how hard each point brakes (0 = throttle, ~0.35 lift, 1 = brake hard), from the decel the speed plan needs there
    const sev = this.lineBase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = ref[i], b = ref[(i + 1) % N];
      const dec = (a * a - b * b) / (2 * T.ds);
      sev[i] = dec < 0.6 ? 0 : dec < 1.2 ? (dec - 0.6) / 0.6 * 0.35 : Math.min(1, 0.35 + (dec - 1.2) / 4.8 * 0.65);
    }
    // widen braking zones a little so they read clearly
    const s2 = Float32Array.from(sev);
    for (let i = 0; i < N; i++) if (s2[i] >= 0.9) for (let k = -3; k <= 3; k++) { const j = (i + k + N) % N; if (sev[j] < s2[i]) sev[j] = s2[i]; }
    this.lineSev = new Float32Array(N);
    const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 4), idx = [];
    const half = 0.34;
    for (let i = 0; i < N; i++) {
      const o = this.line[i];
      for (const [k, s] of [[0, o - half], [1, o + half]]) {
        const x = T.X[i] + T.RX[i] * s, z = T.Z[i] + T.RZ[i] * s;
        pos.set([x, surfaceY(T, i, 0, s) + this.A.LIFT[i] + 0.01, z], (i * 2 + k) * 3);
      }
      const j = (i + 1) % N;
      if (i !== T.cut) idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, fog: true });
    this.lineMesh = new THREE.Mesh(g, mat);
    this.lineMesh.renderOrder = 2;
    this.lineMesh.frustumCulled = false;
    this.scene.add(this.lineMesh);
    this.lineCol = col;
    this.buildLineTiles();
  }

  // the tiles: one every LT.pitch samples, each LT.len of the way to the next sample, LT.w wide at the near edge and a
  // little narrower at the far one (a subtle trapezoid, as in F1). Their flat corners are worked out once; each frame
  // the ones ahead of you are tipped up (hinged on the far edge), colored and faded into a small dynamic mesh.
  buildLineTiles() {
    const T = this.T, N = T.N, LT = LINE_TILES, nT = Math.ceil(N / LT.pitch);
    const C = this.tileC = new Float32Array(nT * 12); // near-left, near-right, far-left, far-right (x, y, z)
    for (let t = 0; t < nT; t++) {
      const i = t * LT.pitch, j = (i + 1) % N, o = this.line[i], oj = this.line[j];
      const ax = T.X[i] + T.RX[i] * o, az = T.Z[i] + T.RZ[i] * o, bx = T.X[j] + T.RX[j] * oj, bz = T.Z[j] + T.RZ[j] * oj;
      const fx = ax + (bx - ax) * LT.len, fz = az + (bz - az) * LT.len, of = o + (oj - o) * LT.len;
      const corner = (k, x, z, s, f, w) => C.set([x + T.RX[i] * s * w, surfaceY(T, i, f, (f ? of : o) + s * w) + this.A.LIFT[i] + 0.02, z + T.RZ[i] * s * w], t * 12 + k * 3);
      corner(0, ax, az, -0.5, 0, LT.w); corner(1, ax, az, 0.5, 0, LT.w);
      corner(2, fx, fz, -0.5, LT.len, LT.w * LT.taper); corner(3, fx, fz, 0.5, LT.len, LT.w * LT.taper);
    }
    this.tileLift = new Float32Array(nT);
    const max = Math.ceil((LT.ahead + LT.behind) / T.ds / LT.pitch) + 4;
    const g = new THREE.BufferGeometry(), idx = [], uv = new Float32Array(max * 8);
    for (let q = 0; q < max; q++) { const v = q * 4; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); uv.set([0, 0, 1, 0, 0, 1, 1, 1], q * 8); }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 12), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 16), 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    // a tile with soft edges (the F1 tiles are a little blurred, never crisp decals)
    const map = softTex('lineTile', 64, 64, (c, w, h) => {
      c.filter = 'blur(2px)'; c.fillStyle = '#fff'; c.fillRect(5, 5, w - 10, h - 10);
    });
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, fog: true });
    this.tileMesh = new THREE.Mesh(g, mat);
    this.tileMesh.renderOrder = 2;
    this.tileMesh.frustumCulled = false;
    this.tileMax = max;
    this.scene.add(this.tileMesh);
  }
  disposeRacingLine() {
    for (const m of [this.lineMesh, this.tileMesh]) if (m) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.lineMesh = this.tileMesh = null;
  }

  updateRacingLine(dt = 0) {
    const m = this.lineMesh; if (!m) return;
    const on = this.lineMode !== 'off' && this.state !== 'finished', blocks = this.lineStyle !== 'flat';
    m.visible = on && !blocks;
    if (this.tileMesh) this.tileMesh.visible = on && blocks;
    if (!on) return;
    const T = this.T, N = T.N, pl = this.player, p = pl.phys, S = this.lineSev;
    const full = this.lineMode === 'full';
    const u = Math.max(0, p.u);
    const aMax = p.p.mu * (9.81 + (p.p.kd / p.p.mass) * u * u) * 0.85;
    const ahead = Math.round(LINE_TILES.ahead / T.ds), behind = Math.round(LINE_TILES.behind / T.ds);
    // how hard to brake at each point ahead: the plan's, raised if you're too fast to make it (lowered if you're slow)
    for (let k = -behind; k < ahead; k++) {
      const i = (pl.idx + k + N) % N;
      let s = this.lineBase[i];
      if (k > 0) {
        const d = k * T.ds, v = this.refV[i];
        if (u > v) {
          const r = (u * u - v * v) / (2 * d) / aMax;
          if (r > 0.35) s = Math.max(s, Math.min(1, 0.35 + (r - 0.35) / 0.4 * 0.65));
        } else if (s > 0.6 && u < v * 0.9) s = 0.5;
      }
      S[i] = s;
    }
    // the build-up: yellow, then orange, over the last `lead` s before each brake point (as F1's does)
    const L = Math.max(25, u * LINE_TILES.lead);
    for (let k = ahead - 1, brk = Infinity; k >= -behind; k--) {
      const i = (pl.idx + k + N) % N;
      if (S[i] >= 0.9) { brk = k; continue; }
      const dd = (brk - k) * T.ds;
      if (dd < L) S[i] = Math.max(S[i], 0.88 * (1 - dd / L));
    }
    if (blocks) return this.updateLineTiles(dt, ahead, behind, full);
    const col = this.lineCol;
    const set = (i, c, a) => { for (const k of [0, 1]) col.set([c[0], c[1], c[2], a], (i * 2 + k) * 4); };
    for (let i = 0; i < N; i++) set(i, LINE_COL[0], 0);
    for (let k = -behind; k < ahead; k++) {
      const i = (pl.idx + k + N) % N, s = S[i];
      if (!full && s < 0.3) continue;
      const fade = Math.min(1, (k + behind) / behind) * Math.min(1, (ahead - k) / (ahead * 0.35));
      set(i, lineColor(s), (s < 0.3 ? 0.34 : 0.62) * fade);
    }
    m.geometry.attributes.color.needsUpdate = true;
  }
  updateLineTiles(dt, ahead, behind, full) {
    const T = this.T, LT = LINE_TILES, pl = this.player, S = this.lineSev, C = this.tileC, lift = this.tileLift;
    const g = this.tileMesh.geometry, P = g.attributes.position.array, Cl = g.attributes.color.array;
    const nT = lift.length, ease = 1 - Math.exp(-LT.rate * dt);
    // the tiles in view, and how far each wants to tip: a little for yellow, more for orange, all the way for red
    const t0 = Math.ceil((pl.idx - behind) / LT.pitch), t1 = Math.floor((pl.idx + ahead) / LT.pitch), n = t1 - t0 + 1;
    const W = this._tileW && this._tileW.length >= n ? this._tileW : (this._tileW = new Float32Array(n + 8)), W2 = this._tileW2 && this._tileW2.length >= n ? this._tileW2 : (this._tileW2 = new Float32Array(n + 8));
    for (let q = 0; q < n; q++) { const s = S[(((t0 + q) % nT + nT) % nT) * LT.pitch]; W[q] = s < 0.15 ? 0 : Math.pow((s - 0.15) / 0.85, 1.3); }
    // smoothed along the line: a raised run tails off over the next few tiles either side, then a soft blur
    for (let q = 1; q < n; q++) W[q] = Math.max(W[q], W[q - 1] * 0.72);
    for (let q = n - 2; q >= 0; q--) W[q] = Math.max(W[q], W[q + 1] * 0.72);
    for (let q = 0; q < n; q++) W2[q] = (W[Math.max(0, q - 1)] + 2 * W[q] + W[Math.min(n - 1, q + 1)]) / 4;
    let q = 0;
    for (let k = 0; k < n && q < this.tileMax; k++) {
      const tt = t0 + k, t = ((tt % nT) + nT) % nT, i = t * LT.pitch;
      if (i === T.cut) continue;
      const d = (tt * LT.pitch - pl.idx) * T.ds, s = S[i];
      // tip up as they come into view, and lay back down as they reach you
      const want = W2[k] * smooth(LT.settle[0], LT.settle[1], d);
      lift[t] += (want - lift[t]) * ease;
      if (!full && s < 0.3) continue;
      // fade in far away, out close up (and out behind you)
      const a = (s < 0.3 ? LT.alpha[0] : LT.alpha[1]) * smooth(LT.near[0], LT.near[1], d) * Math.min(1, (LT.ahead - d) / (LT.ahead * 0.35));
      if (a <= 0.005) continue;
      const th = lift[t] * LT.tilt, cs = Math.cos(th), sn = Math.sin(th), up = lift[t] * LT.raise, b = t * 12, o = q * 12;
      // near edge stays down (the hinge), the far edge swings up
      for (let k2 = 0; k2 < 2; k2++) {
        const nn = b + k2 * 3, f = b + (k2 + 2) * 3;
        const vx = C[f] - C[nn], vy = C[f + 1] - C[nn + 1], vz = C[f + 2] - C[nn + 2], l = Math.hypot(vx, vz);
        P[o + k2 * 3] = C[nn]; P[o + k2 * 3 + 1] = C[nn + 1] + up; P[o + k2 * 3 + 2] = C[nn + 2];
        P[o + (k2 + 2) * 3] = C[nn] + vx * cs; P[o + (k2 + 2) * 3 + 1] = C[nn + 1] + vy * cs + l * sn + up; P[o + (k2 + 2) * 3 + 2] = C[nn + 2] + vz * cs;
      }
      const c = lineColor(s);
      // the raised far edge brightest, the hinge faded: each tile reads as its own step, not one band
      for (let k2 = 0; k2 < 4; k2++) { const lit = k2 < 2 ? 1 : 1 + lift[t] * 0.2; Cl.set([c[0] * lit, c[1] * lit, c[2] * lit, a * (k2 < 2 ? 1 - lift[t] * 0.55 : 1)], q * 16 + k2 * 4); }
      q++;
    }
    g.setDrawRange(0, q * 6);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }

  // ---------- sectors ----------
  // The lap in three, split at a third and two thirds of the way round (each split moved onto the straightest bit of
  // road nearby, so it never falls in a corner). Every car on this machine is timed through them; in practice and
  // qualifying the field's laps are simulated, so each lap they post is split the way the racing line's speeds split
  // a lap (with a little noise). Purple: the quickest anyone's been through it this session (a time trial: your best
  // ever there, in this car); green: your best this session; yellow: slower than that.
  buildSectors() {
    const T = this.T, N = T.N, len = T.open ? T.D[T.finish] : T.L, w = Math.max(1, Math.round(20 / T.ds));
    const bend = (i) => { let a = 0; for (let k = -w; k <= w; k++) a += Math.abs(T.K[(i + k + N) % N]); return a; };
    this.secCut = [1, 2].map(k => {
      const want = Math.round(len * k / 3 / T.ds), span = Math.round(len * 0.08 / T.ds);
      let best = want, bb = Infinity;
      for (let i = want - span; i <= want + span; i++) { const b = bend(i) * (1 + 0.3 * Math.abs(i - want) / span); if (b < bb) { bb = b; best = i; } }
      return (best + N) % N;
    });
    // how a lap splits (for the field's simulated laps): the racing line's speeds, time per sample
    const V = this.lineV, fr = [0, 0, 0];
    if (V) { const end = T.open ? T.finish : N; for (let i = 0; i < end; i++) fr[i < this.secCut[0] ? 0 : i < this.secCut[1] ? 1 : 2] += T.ds / Math.max(5, V[i]); }
    const tot = fr[0] + fr[1] + fr[2]; this.secFrac = tot ? fr.map(x => x / tot) : [1 / 3, 1 / 3, 1 / 3];
    this.secTop = [Infinity, Infinity, Infinity]; // (the session's quickest through each)
    // a time trial: purple is your best ever, kept per circuit and car
    if (this.mode === 'test' && this.player) {
      this.secKey = lapKey(this.track, T, this.player.carId);
      try { const e = JSON.parse(localStorage.getItem(SEC_KEY) || '{}')[this.secKey]; if (e && e.length === 3) this.secTop = e.slice(); } catch (err) {}
    }
  }
  secStart(car) {
    if (!car.team) return;
    car.sec = { k: 0, t0: this.raceTime, cur: [null, null, null] };
    if (car.isPlayer && this.mini) car.ms = { j: 0, t0: this.raceTime, cur: new Array(this.mini.n).fill(null) };
  }
  // crossed a split?
  secCross(car, prev, cur) {
    const S = car.sec; if (!S || !this.secCut) return;
    const N = this.T.N;
    // (yours: the mini-sectors too)
    const M = car.ms;
    if (M && car.isPlayer && M.j < this.mini.cut.length) { const c = this.mini.cut[M.j]; if (prev < c && cur >= c && cur - prev < N / 4) { this.miniDone(car, M.j, this.raceTime - M.t0, !car.lapInvalid); M.t0 = this.raceTime; M.j++; } }
    if (S.k > 1) return;
    const c = this.secCut[S.k];
    if (prev < c && cur >= c && cur - prev < N / 4) { this.secDone(car, S.k, this.raceTime - S.t0, !car.lapInvalid); S.t0 = this.raceTime; S.k++; }
  }
  // the lap's done: its last sector (a lap that didn't go through both splits has no sectors to give)
  secLap(car, valid) {
    const S = car.sec; if (!S) return;
    if (S.k === 2) this.secDone(car, 2, this.raceTime - S.t0, valid);
    if (car.isPlayer) { car.secPrev = S.cur; car.secPrevAt = this.raceTime; }
    const M = car.ms;
    if (M && car.isPlayer) {
      if (M.j === this.mini.cut.length) this.miniDone(car, M.j, this.raceTime - M.t0, valid);
      car.msPrev = M.cur; car.ms = null;
      this.miniLap(M);
    }
    car.sec = null;
  }
  // a sector time: was it a best (yours, everyone's)? What it shows: the time against your best before it
  secDone(car, k, t, valid) {
    const B = car.secBest ||= [Infinity, Infinity, Infinity], pb = B[k], top = this.secTop[k];
    const col = !valid ? 'v' : t < top ? 'p' : t < pb ? 'g' : 'y';
    if (valid) { if (t < pb) B[k] = t; if (t < top) { this.secTop[k] = t; if (this.secKey && car.isPlayer) this.saveSecTop(); } }
    car.sec.cur[k] = { t, d: isFinite(pb) ? t - pb : null, col };
  }
  // a mini-sector of yours: in practice (and on a test day) your best through it is kept for the weekend; with the
  // Mini-Sectors job on, did it beat the target (twice, on two laps, and it's lit for good); in qualifying, once the
  // job's done, green or yellow against your practice best
  miniDone(car, j, t, valid) {
    const D = this.tdata.msec ||= { best: 0, done: false, hits: [], pb: [] }, P = this.prog;
    let col = null;
    if (P && P.id === 'msec') {
      const ok = valid && t <= P.target[j];
      if (ok) D.hits[j] = Math.min(2, (D.hits[j] || 0) + 1);
      col = (D.hits[j] || 0) >= 2 ? 'g' : ok ? 'h' : 'y';
    } else if (this.mode === 'quali' && D.done) col = !valid ? 'v' : D.pb[j] == null || t < D.pb[j] ? 'g' : 'y';
    if (valid && (this.mode === 'practice' || this.mode === 'test') && !(t >= (D.pb[j] ?? Infinity))) { D.pb[j] = Math.round(t * 1000) / 1000; this.msChanged = true; }
    if (col === 'g' || col === 'h') this.msChanged = true;
    car.ms.cur[j] = col;
  }
  // a lap's mini-sectors done: how many are lit, the job done?
  miniLap(M) {
    const D = this.tdata.msec; if (!D) return;
    if (this.prog && this.prog.id === 'msec') {
      const n = this.mini.n, lit = (D.hits || []).filter(h => h >= 2).length, beat = M.cur.filter(c => c === 'g' || c === 'h').length, first = !D.done && lit / n >= MSEC_PASS;
      D.best = Math.max(D.best || 0, lit / n); if (first) D.done = true;
      this.events.push({ type: 'progLap', id: 'msec', lit, n, beat, done: first });
    }
    if (this.msChanged) { this.msChanged = false; this.events.push({ type: 'tdata' }); }
  }
  // one of the field's simulated laps, split into sectors
  secPosted(e, time) {
    if (!this.secFrac) return;
    const n = [0, 1, 2].map(() => (Math.random() - 0.5) * 0.012), f = this.secFrac.map((x, k) => x * (1 + n[k])), tot = f[0] + f[1] + f[2];
    const B = e.secBest ||= [Infinity, Infinity, Infinity];
    f.forEach((x, k) => { const t = time * x / tot; if (t < B[k]) B[k] = t; if (t < this.secTop[k]) this.secTop[k] = t; });
  }
  saveSecTop() {
    try { const all = JSON.parse(localStorage.getItem(SEC_KEY) || '{}'); all[this.secKey] = this.secTop.map(x => Math.round(x * 1000) / 1000); localStorage.setItem(SEC_KEY, JSON.stringify(all)); } catch (err) {}
  }
  // the HUD's sector strip: this lap's (or, for a few seconds after the line, the lap just done), your bests, the ideal
  secHud(pl) {
    const live = pl.sec && pl.sec.cur, recent = pl.secPrev && this.raceTime - pl.secPrevAt < 4 && (!live || !live[0]);
    const B = pl.secBest || [Infinity, Infinity, Infinity];
    // the mini-sectors' pips under the cells: with the job on (lit ones stay lit), or in qualifying once it's done
    const D = this.tdata.msec, job = this.prog && this.prog.id === 'msec', show = !!this.mini && (job || (this.mode === 'quali' && !!D && D.done));
    let pips = null;
    if (show) {
      const cur = recent ? pl.msPrev : pl.ms ? pl.ms.cur : null, at = recent ? -1 : pl.ms ? pl.ms.j : -1;
      pips = { per: this.mini.per, cells: Array.from({ length: this.mini.n }, (_, j) => (cur && cur[j]) || (job && D && D.hits[j] >= 2 ? 'g' : j === at ? 'now' : '')) };
    }
    return { cells: recent ? pl.secPrev : live || [null, null, null], k: recent ? 3 : pl.sec ? pl.sec.k : -1, best: B, ideal: B.every(isFinite) ? B[0] + B[1] + B[2] : null, pips, now: recent ? null : this.secLive(pl) };
  }
  // the sector you're in, as you drive it: your time in it so far against your best through it (that best spread
  // along it the way your best lap went through it, so it lands on the delta the cell fills with at the split); no
  // best yet, or a lap already deleted: the time in it so far. { d: delta } or { t: time }
  secLive(pl) {
    const S = pl.sec; if (!S || S.k > 2 || pl.pitting || pl.finished) return null;
    const el = this.raceTime - S.t0, best = pl.secBest ? pl.secBest[S.k] : Infinity, B = pl.bestTrace;
    if (!isFinite(best) || !B || pl.lapInvalid) return { t: el };
    const at = (i) => B[i], c = this.secCut, start = S.k ? at(c[S.k - 1]) : 0, end = S.k < 2 ? at(c[S.k]) : pl.best;
    const a = at(pl.i), b = at((pl.i + 1) % this.T.N);
    if ([start, end, a].some(x => x == null || isNaN(x)) || end <= start) return { t: el };
    const here = (isNaN(b) || b < a ? a : a + (b - a) * pl.f) - start;
    return { d: el - Math.max(0, here) * best / (end - start) };
  }

  // ---------- the run plan (practice.js) ----------
  // the job you're doing on track (null: free running). Its gates are built for your car's line and speeds.
  setProgramme(id) {
    if (this.prog) { this.prog.dispose(); this.prog = null; }
    if (!this.player || !this.refV) return;
    if (id === 'acclim') this.prog = new Acclimatization(this);
    else if (id === 'msec' && this.mini) { this.prog = new MiniSectors(this); if (this.player.ms) this.player.ms = null; } // (lit from the next lap that starts at the line)
    else if (id === 'qsim') {
      this.prog = new QualiSim(this);
      // (a test day or time trial has no garage: the run starts now, the push lap the next one begun at the line, on
      // whatever set's on)
      const pl = this.player;
      if (this.mode === 'test') this.prog.run = { fresh: true, lap: pl.lapTimes.length + (pl.lap > 0 ? 1 : 0), warm: null, warmM: null, from: pl.idx };
    }
  }
  updateProgramme(dt) {
    const pl = this.player; if (!pl) return;
    this.qsimTick(pl);
    if (!this.prog) return;
    const live = this.state === 'racing' && dt > 0 && !pl.pitting && !pl.gone && !pl.finished;
    for (const p of this.prog.update(dt, pl, live)) {
      // (a red gate taken right: that brake point's yours, marked for the rest of the weekend)
      const nailed = p.g.kind === 'brake' && (p.res === 'perfect' || p.res === 'good') && this.nailBrake(p.g.b);
      this.events.push({ type: 'gate', res: p.res, dv: p.dv, kind: p.g.kind, nailed });
    }
  }
  nailBrake(b) {
    const a = this.tdata.acclim ||= { best: 0, done: false, marks: [] };
    if (b == null || a.marks.includes(b)) return false;
    a.marks.push(b); a.marks.sort((x, y) => x - y);
    if (this.markers) this.markers.set(a.marks);
    this.events.push({ type: 'tdata' });
    return true;
  }
  // a lap done with the gates on: rated if you went through every one of them (from the line round to the line)
  programmeLap() {
    if (this.prog.id === 'qsim') return this.qsimLap(this.player);
    if (this.prog.id !== 'acclim') return; // (Mini-Sectors: miniLap)
    const r = this.prog.lapDone(); if (r == null) return;
    const a = this.tdata.acclim ||= { best: 0, done: false, marks: [] }, first = !a.done && r >= ACCLIM_PASS;
    a.best = Math.max(a.best || 0, r); if (r >= ACCLIM_PASS) a.done = true;
    this.events.push({ type: 'progLap', id: 'acclim', rating: r, best: a.best, done: first, marks: a.marks.length }, { type: 'tdata' });
  }
  // the HUD's programme panel
  // ---- the Qualifying Sim (practice.js) ----
  // the quickest tyre for a lap here (soft; wet in the rain, dirt on dirt), and whether the set on is new
  qsimFresh(car) { const t = car.phys.tyre; return t.c === this.condTyre('soft') && Math.min(t.wf, t.wr) >= 0.995; }
  // are all four tyres up to temperature (tyre temperatures on)? null: they're off, so there's nothing to wait for
  tyresIn(p) {
    if (!p.tempMode) return null;
    for (let i = 0; i < 4; i++) { const m = p.tempMode === 2 ? 0.65 * p.tS[i] + 0.35 * p.tC[i] : p.tS[i]; if ((m - p.tyreOpt) / (p.tempMode === 2 ? 25 : 35) / 1.6 < -0.25) return false; }
    return true;
  }
  // the corner at (or next after) a sample: "T6"
  turnAt(i) {
    const L = this.corners.list; if (!L.length) return null;
    const c = L.find(c => c.exit >= i) || L[0]; return 'T' + c.n;
  }
  // out of the box: with the job on, a run starts (it counts if the set's new); in qualifying the out-lap's watched
  qsimLeave(car) {
    if (this.prog && this.prog.id === 'qsim') this.prog.run = { fresh: this.qsimFresh(car), lap: car.lapTimes.length, warm: null, warmM: null, from: car.idx };
    if (this.mode === 'quali') this.qOut = { started: false };
  }
  qsimTick(pl) {
    const R = this.prog && this.prog.id === 'qsim' ? this.prog.run : null;
    // the out-lap: where the tyres came in
    if (R && R.warm == null && !pl.gone && this.state === 'racing' && this.tyresIn(pl.phys)) {
      R.warm = this.turnAt(pl.idx); R.warmM = Math.round((((pl.idx - R.from) + this.T.N) % this.T.N) * this.T.ds);
    }
    // qualifying: across the line onto a timed lap on cold tyres, the engineer says so (once a run)
    const O = this.qOut;
    if (this.mode === 'quali' && O && !O.started && pl.lap > 0 && !pl.gone) {
      O.started = true;
      const Q = this.tdata.qsim;
      if (this.tyresIn(pl.phys) === false) this.events.push({ type: 'radio', msg: `Tires aren't in yet${Q && Q.warm ? `. In practice they came in by ${Q.warm}` : ''}. Build it up through the first corners.` });
    }
  }
  // the push lap's done: where would that put you? Ranked against the field's qualifying pace (each rival a little
  // quicker or slower than their hidden number, many times over): the range you'd end up in
  qsimLap(pl) {
    const R = this.prog.run; if (!R || pl.lapTimes.length !== R.lap + 1) return; // (only the first timed lap of a run)
    this.prog.run = null;
    const t = pl.last, valid = !pl.lastInvalid;
    if (!R.fresh || !valid) { this.events.push({ type: 'progLap', id: 'qsim', ok: false, why: !R.fresh ? 'tyres' : 'deleted' }); return; }
    const pots = (this.quali ? this.quali.field : []).map(e => e.pot).filter(isFinite);
    let lo = 1, hi = 1, pole = null;
    if (pots.length) {
      const ps = [];
      for (let k = 0; k < 200; k++) { let p = 1; for (const x of pots) if (x * (1 + this.gauss() * QSIM_NOISE) < t) p++; ps.push(p); }
      ps.sort((a, b) => a - b); lo = ps[Math.floor(ps.length * 0.1)]; hi = ps[Math.floor(ps.length * 0.9)]; pole = Math.min(...pots);
    }
    const prev = this.tdata.qsim, first = !prev || !prev.done;
    // (a quicker run replaces the prediction; a slower one doesn't)
    if (!prev || !prev.done || t < prev.lap) this.tdata.qsim = { done: true, best: 1, lap: t, lo, hi, gap: pole != null ? t - pole : null, warm: R.warm ?? prev?.warm ?? null, warmM: R.warmM ?? prev?.warmM ?? null, field: pots.length };
    else if (R.warm && !prev.warm) { prev.warm = R.warm; prev.warmM = R.warmM; }
    const Q = this.tdata.qsim;
    this.events.push({ type: 'progLap', id: 'qsim', ok: true, done: first, lap: t, lo: Q.lo, hi: Q.hi, gap: Q.gap, warm: Q.warm, temps: !!pl.phys.tempMode, field: Q.field, better: t === Q.lap }, { type: 'tdata' });
  }
  gauss() { let u = 0; for (let k = 0; k < 6; k++) u += Math.random(); return (u - 3) / Math.sqrt(0.5); }
  // the HUD's programme panel: its title and rows ([label, value html])
  progHud() {
    const P = this.prog, pl = this.player, of = (a, b) => `${a}<small> / ${b}</small>`, Q = this.tdata.qsim;
    const range = (q) => q.lo === q.hi ? `P${q.lo}` : `P${q.lo}\u2013${q.hi}`;
    // qualifying, after a Qualifying Sim in practice: the plan, on the out-lap
    if (!P && this.mode === 'quali' && Q && Q.done && pl && pl.lap === 0 && !pl.gone)
      return { title: 'QUALIFYING PLAN', rows: [['TARGET', Q.field ? range(Q) : '\u2014'], ['POLE', Q.gap == null ? '\u2014' : Q.gap > 0 ? `${Q.gap.toFixed(1)}<small> QUICKER</small>` : '<span class="done">YOURS</span>'],
        ...(pl.phys.tempMode ? [['TIRES IN BY', Q.warm ? `${Q.warm}${this.tyresIn(pl.phys) ? '<small> \u00b7 IN</small>' : ''}` : '\u2014']] : [])] };
    if (!P) return null;
    const pc = (x) => Math.round(x * 100) + '%';
    if (P.id === 'qsim') {
      const R = P.run, fresh = R ? R.fresh : this.qsimFresh(pl), temps = !!pl.phys.tempMode;
      const tyre = this.condTyre('soft').toUpperCase() + 'S';
      return { title: 'QUALIFYING SIM', rows: [['SET', fresh ? `<span class="done">NEW ${tyre}</span>` : `NEEDS NEW ${tyre}`],
        ...(temps ? [['TIRES IN', R && R.warm ? R.warm : R ? (pl.lap === 0 ? 'WARMING' : '\u2014') : '\u2014']] : []),
        ['RUN', !R ? (Q && Q.done ? `DONE<small> \u00b7 ${Q.field ? range(Q) : ''}</small>` : 'FROM THE BOX') : pl.lap === 0 ? 'OUT-LAP' : 'PUSH LAP'],
        ...(Q && Q.done && Q.field ? [['PREDICTED', range(Q)]] : [])] };
    }
    if (P.id === 'msec') {
      const D = this.tdata.msec || { hits: [] }, n = this.mini.n, lit = (D.hits || []).filter(h => h >= 2).length, M = this.player.ms;
      const beat = M ? M.cur.filter(c => c === 'g' || c === 'h').length : 0, need = Math.ceil(n * MSEC_PASS);
      return { title: 'MINI-SECTORS', rows: [['LIT', of(lit, n)], ['BEATEN THIS LAP', M ? of(beat, M.j) : '\u2014'], ['TO DO THE JOB', D.done ? '<span class="done">DONE</span>' : `${Math.max(0, need - lit)}<small> MORE</small>`]] };
    }
    const a = this.tdata.acclim || { best: 0, done: false, marks: [] }, L = P.lap;
    return { title: 'ACCLIMATIZATION', rows: [['GATES', of(L.n, P.gates.length)], ['THIS LAP', L.n ? pc(L.pts / (100 * L.n)) : '\u2014'],
      ['BEST LAP', a.best ? `<span class="${a.done ? 'done' : ''}">${pc(a.best)}</span>` : '\u2014'], ['BRAKE MARKERS', of(a.marks.length, P.gates.filter(g => g.kind === 'brake').length)]] };
  }

  // ---------- blue guide into the pits (with the racing line on) ----------
  // Follows the route the pit crew autopilot drives: drift to the pit side before the entry, down the
  // fast lane, into YOUR box and back out, then rejoin the racing line after the exit.
  buildPitGuide() {
    const pit = this.pit, pl = this.player; if (!pit || !pl) return;
    const T = this.T, N = T.N, box = pit.boxes[this.boxSlot(pl.teamIdx)];
    const pre = Math.round(300 / T.ds), post = Math.round(90 / T.ds);
    const span = ((pit.end - pit.start + N) % N) + pre + post;
    const pts = [];
    for (let k = 0; k <= span; k++) {
      const i = (pit.start - pre + k + N) % N, reg = pit.REG[i];
      let off, y;
      if (reg >= 0) {
        const main = !isNaN(pit.WALL[i]);
        const toBox = ((box - i + N) % N) * T.ds, fromBox = ((i - box + N) % N) * T.ds;
        const mix = toBox < 18 ? Math.min(1, (18 - toBox) / 10) : fromBox < 11 ? 1 - fromBox / 11 : 0;
        off = pit.side * (pit.CEN[i] + (main ? -2.0 + 4.4 * mix : 0));
        y = surfaceY(T, i, 0, pit.side * T.W[i] / 2) + this.A.LIFT[i] + 0.03;
      } else {
        const before = k < pre;
        const t = before ? Math.min(1, Math.max(0, (k - (pre - Math.round(180 / T.ds))) / Math.round(180 / T.ds))) : Math.max(0, 1 - (k - (span - post)) / post);
        const edge = pit.side * (T.W[i] / 2 - 1.3);
        off = this.line[i] + (edge - this.line[i]) * t;
        y = surfaceY(T, i, 0, off) + this.A.LIFT[i] + 0.015;
      }
      pts.push({ i, off, y, a: Math.min(1, k / (pre * 0.4), (span - k) / (post * 0.6)) });
    }
    const pos = new Float32Array(pts.length * 6), col = new Float32Array(pts.length * 8), idx = [];
    const half = 0.32;
    pts.forEach((q, k) => {
      for (const [m, s] of [[0, q.off - half], [1, q.off + half]]) pos.set([T.X[q.i] + T.RX[q.i] * s, q.y, T.Z[q.i] + T.RZ[q.i] * s], (k * 2 + m) * 3);
      for (const m of [0, 1]) col.set([0.2, 0.55, 1, Math.max(0, q.a)], (k * 2 + m) * 4);
      if (k < pts.length - 1) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9, fog: true });
    this.pitGuide = new THREE.Mesh(g, mat);
    this.pitGuide.renderOrder = 3; this.pitGuide.frustumCulled = false;
    this.scene.add(this.pitGuide);
  }
  updatePitGuide() {
    const m = this.pitGuide; if (!m) return;
    const pl = this.player;
    m.visible = this.lineMode !== 'off' && this.state !== 'finished' && !pl.finished;
    if (!m.visible) return;
    // bright when you should box this lap (plan / engineer's call) or you're already in the pits
    const nx = this.nextPlannedStop(pl);
    const want = pl.pitting || (nx && nx.lap === pl.lap) || (pl.radio && (pl.radio.t25 || pl.radio.t40 && this.wearK)) || Math.max(pl.phys.dmg.fw, pl.phys.dmg.rw) > 0.45;
    const target = want ? 0.8 : 0.22;
    m.material.opacity += (target - m.material.opacity) * 0.08;
  }

  // ---------- rain ----------
  // tail lights (rain lights) as moving reflections on the wet road
  wetLights() {
    const out = [], v = this._wv || (this._wv = new THREE.Vector3());
    for (const car of this.cars) {
      const m = car.model; if (car.gone || !m || !m.tail || m.coronaMat.opacity < 0.05) continue;
      m.tail.getWorldPosition(v);
      const k = m.coronaMat.opacity;
      out.push({ x: v.x, y: car.y, z: v.z, h: 0.35, r: 0.9 * k, g: 0.08 * k, b: 0.05 * k, w: 0.45 });
    }
    return out;
  }
  // spray off the rear wheels, more the faster you go
  updateSpray(dt) {
    for (const car of this.cars) {
      const p = car.phys; if (car.gone || !p) continue;
      const sp = p.speed || 0; if (sp < 12 || car.surface !== 'road' && car.surface !== 'kerb' && car.surface !== 'runoff') continue;
      const k = Math.min(1, (sp - 12) / 50), fx = Math.sin(p.h), fz = Math.cos(p.h);
      const n = Math.min(4, Math.floor(k * 4 + Math.random() * 1.5));
      for (let q = 0; q < n; q++) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        this.spray.emit(p.x - fx * 2.1 + fz * 0.75 * sd, car.y, p.z - fz * 2.1 - fx * 0.75 * sd, p.vx || fx * sp, p.vz || fz * sp, k);
      }
    }
    this.spray.update(dt, this.world.fog);
  }

  // ---------- cameras ----------
  snapCamera() { this.updateCamera(1, true); }

  // a car's size in its own frame, from its model: h = roof height, back = how far its tail sits behind the middle
  // (measured once the model has loaded; until then a typical car)
  camSize(car) {
    if (car.camSz) return car.camSz;
    const g = car.model?.group; if (!g) return { h: 1.3, back: 2.2 };
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4(), bb = new THREE.Box3(), all = new THREE.Box3();
    g.traverse(o => { if (o.isMesh && o.visible && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); all.union(bb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
    if (all.isEmpty() || all.max.y - all.min.y < 0.5) return { h: 1.3, back: 2.2 };
    return (car.camSz = { h: all.max.y, back: -all.min.z });
  }

  updateCamera(dt, snap = false) {
    const car = this.focus, p = car.phys, cam = this.camera;
    if (this.state === 'intro') return this.introCamera(dt);
    if (this.state === 'broadcast') return this.flyCamera(dt);
    if (this.state === 'strategy') return this.stratCamera(dt);
    if (this.state === 'carselect') return this.showroomCamera(dt);
    const useTV = this.mode === 'attract' || (this.state === 'finished' && this.stateT > 2.5);
    this.shake *= Math.exp(-dt * 5);
    if (useTV) return this.tvCamera(dt, snap);
    this.tv = null;
    const mode = CAMS[this.camMode];
    const up = new THREE.Vector3(0, 1, 0);
    if (mode === 'chase' || mode === 'far') {
      // (tuned on a ~1.3 m tall, ~4.4 m long car: anything taller (the van) lifts the camera to see over its roof, and
      // anything longer (the hearse) pulls it back by its extra length behind the middle)
      const sz = this.camSize(car), tall = Math.max(0, sz.h - 1.35), long = Math.max(0, sz.back - 2.2);
      const dist = (mode === 'chase' ? 6.8 : 10.5) + tall * 1.4 + long, hgt = (mode === 'chase' ? 2.1 : 3.3) + tall * 1.25;
      let want = p.h;
      if (p.speed > 6) { const vh = Math.atan2(p.vx, p.vz); want = lerpAngle(p.h, vh, p.u > 0 ? 0.35 : 0); }
      this.camYaw = snap ? want : lerpAngle(this.camYaw, want, 1 - Math.exp(-dt * 5.5));
      const pos = new THREE.Vector3(p.x - Math.sin(this.camYaw) * dist, car.y + hgt, p.z - Math.cos(this.camYaw) * dist);
      const gh = this.world.groundHeight(pos.x, pos.z);
      pos.y = Math.max(pos.y, gh + 0.8, car.y + 1.2);
      if (snap) this.camPos.copy(pos);
      else { this.camPos.x = pos.x; this.camPos.z = pos.z; this.camPos.y += (pos.y - this.camPos.y) * (1 - Math.exp(-dt * 10)); }
      cam.position.copy(this.camPos);
      cam.up.copy(up);
      cam.lookAt(p.x + Math.sin(p.h) * 3.5, car.y + 1.0 + tall * 0.6, p.z + Math.cos(p.h) * 3.5);
      cam.fov = 60 + Math.min(16, p.speed * 0.17);
    } else {
      const g = car.model.group;
      g.updateMatrixWorld();
      const local = mode === 'tcam' ? new THREE.Vector3(0, 1.3, -0.7) : new THREE.Vector3(0, 0.55, 2.2);
      const look = mode === 'tcam' ? new THREE.Vector3(0, 1.0, 12) : new THREE.Vector3(0, 0.45, 14);
      cam.position.copy(local.applyMatrix4(g.matrixWorld));
      cam.up.set(0, 1, 0).applyQuaternion(g.quaternion);
      cam.lookAt(look.applyMatrix4(g.matrixWorld));
      cam.fov = (mode === 'tcam' ? 66 : 70) + Math.min(12, p.speed * 0.12);
      this.camPos.copy(cam.position);
    }
    if (this.shake > 0.01) {
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
    if (car.surface === 'kerb' && p.speed > 5) cam.position.y += (Math.random() - 0.5) * 0.025 * Math.min(1, p.speed / 20);
    else if (!car.onRoad && p.speed > 5) cam.position.y += (Math.random() - 0.5) * 0.06 * Math.min(1, p.speed / 20);
    cam.updateProjectionMatrix();
  }

  // slow orbit around your car on the grid while you pick a strategy
  stratCamera(dt) {
    const car = this.player || this.focus, p = car.phys, cam = this.camera;
    this.orbit = (this.orbit ?? p.h + 2.2) + (dt || 0) * 0.12;
    const d = 7.5, x = p.x + Math.sin(this.orbit) * d, z = p.z + Math.cos(this.orbit) * d;
    const y = Math.max(car.y + 1.6, this.world.groundHeight(x, z) + 1.2);
    cam.position.set(x, y, z); cam.up.set(0, 1, 0);
    // aim a little to the side so the car sits right of the strategy panel
    const r = { x: Math.cos(this.orbit), z: -Math.sin(this.orbit) };
    cam.lookAt(p.x - r.x * 2.6, car.y + 0.5, p.z - r.z * 2.6);
    cam.fov = 48; cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }

  // car select: low, slow showroom orbit, the car right of the panel; swapping cars pulls the camera back and eases in.
  // Drag (or the right stick) to look round it yourself, the wheel to come closer; leave it a few seconds and the slow
  // orbit eases back in from wherever you left it. The camera stays on the track's side of the barrier.
  showroomCamera(dt) {
    const car = this.player, p = car.phys, cam = this.camera, T = this.T, N = T.N;
    dt = dt || 0;
    this.showIdle = (this.showIdle ?? 99) + dt;
    const spin = 0.16 * Math.min(1, Math.max(0, (this.showIdle - 4) / 2)); // (eases back up over 2 s)
    this.showOrbit = (this.showOrbit ?? p.h + 0.75) + dt * spin;
    this.showPitch ??= 0.16; this.showZoom ??= 1;
    this.selPunch = (this.selPunch || 0) * Math.exp(-dt * 3.2);
    const k = this.selPunch, want = (9.4 + 1.8 * k) * this.showZoom, yaw = this.showOrbit, pitch = this.showPitch + 0.05 * k;
    const at = (d) => {
      const h = Math.cos(pitch) * d;
      return { x: p.x + Math.sin(yaw) * h, z: p.z + Math.cos(yaw) * h, y: car.y + 0.3 + Math.sin(pitch) * d };
    };
    // as far as it can go without standing behind the barrier (nearest sample to the camera, its side's wall)
    const inside = (c) => {
      let j = car.idx, bd = Infinity;
      for (let q = -40; q <= 40; q++) { const i = (car.idx + q + N) % N, d = (c.x - T.X[i]) ** 2 + (c.z - T.Z[i]) ** 2; if (d < bd) { bd = d; j = i; } }
      const lat = (c.x - T.X[j]) * T.RX[j] + (c.z - T.Z[j]) * T.RZ[j], side = lat > 0, pit = this.pit;
      if (pit && pit.side === (side ? 1 : -1) && !isNaN(pit.WALL[j]) && Math.abs(lat) > pit.WALL[j] - 0.8) return false; // (the pit wall's fence)
      if (!(side ? this.A.HAS_R : this.A.HAS_L)[j]) return true;
      return Math.abs(lat) < (side ? this.A.BR : this.A.BL)[j] - 0.8;
    };
    let d = want;
    while (d > 3.2 && !inside(at(d))) d *= 0.92;
    this.showD = this.showD == null || dt === 0 ? d : this.showD + (d - this.showD) * (1 - Math.exp(-dt * (d < this.showD ? 12 : 3)));
    const c = at(this.showD);
    const y = Math.max(c.y, this.world.groundHeight(c.x, c.z) + 0.7);
    cam.position.set(c.x, y, c.z); cam.up.set(0, 1, 0);
    const r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    cam.lookAt(p.x - r.x * 2.2, car.y + 0.3, p.z - r.z * 2.2);
    cam.fov = 42; cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }
  // look round the car on the car select: yaw / pitch in radians, zoom as a factor
  showroomLook(dyaw, dpitch, zoom = 1) {
    this.showOrbit = (this.showOrbit ?? this.player.phys.h + 0.75) + dyaw;
    this.showPitch = Math.max(0.02, Math.min(1.1, (this.showPitch ?? 0.16) + dpitch));
    this.showZoom = Math.max(0.45, Math.min(1.6, (this.showZoom ?? 1) * zoom));
    this.showIdle = 0;
  }

  // tracking shot down the middle of the grid before the lights, between the drivers (they stand facing the middle) (the track sampled between its points, so the camera glides
  // instead of stepping 2 m at a time, and the aim eased so it doesn't twitch where the track bends)
  // The pre-race broadcast: the race opening (some of the time, always when the track has no welcome of its own), the
  // track's welcome (real circuits: track.<id>.welcome), then today's conditions.
  introIds() {
    const env = this.track.env || {}, real = this.track.real && this.track.real.id;
    const cond = env.weather === 'rain' || this.wet > 0.3 ? 'rain' : env.time === 'night' ? 'night' : env.time === 'dusk' ? 'dusk' : env.weather === 'overcast' ? 'overcast' : 'day.clear';
    // (the opening: the occasion's own (opts.introKind: the season opener, a title finale, your first race), always;
    // otherwise a general one, every time at a track without its own welcome and half the time at one with)
    const occ = { opener: 'intro.opener', finale: 'intro.championship', debut: 'intro.debut' }[this.opts.introKind];
    return [occ || (!real || Math.random() < 0.5 ? 'intro.standard' : null), real ? `track.${real}.welcome` : null, `cond.${cond}`].filter(Boolean);
  }
  // the flyover: helicopter shots of the circuit, a cut every few seconds, each drifting along its stretch of track
  // (alternately high and wide, and low on the outside), the last ones over the start. Each shot checks it can see
  // the track (a ray from the road back to the camera, at both ends of its drift): a building or a hill in the way
  // and it tries the other side, higher, then straight over the top.
  flyCamera(dt) {
    const T = this.T, N = T.N, cam = this.camera, SHOT = 6;
    const k = Math.floor(this.stateT / SHOT), u = (this.stateT % SHOT) / SHOT;
    const at = (d) => {
      const x = ((d / T.ds) % N + N) % N, i0 = Math.floor(x), f = x - i0, b = (i0 + 1) % N, l = (A) => A[i0] + (A[b] - A[i0]) * f;
      return { x: l(T.X), y: l(T.Y), z: l(T.Z), rx: l(T.RX), rz: l(T.RZ), w: l(T.W) };
    };
    // where the camera is for a shot (side: metres out from the road's edge, -ve the left; h: up) and what it looks at
    const place = (F, u) => {
      const d = F.d0 + u * F.run, c = at(d), side = Math.sign(F.side || 1) * (c.w / 2 + Math.abs(F.side)) * (F.side === 0 ? 0 : 1);
      const t = at(d + F.ahead);
      return { p: new THREE.Vector3(c.x + c.rx * side, c.y + F.h, c.z + c.rz * side), t: new THREE.Vector3(t.x, t.y + 1, t.z), road: new THREE.Vector3(c.x, c.y + 1.5, c.z) };
    };
    if (!this.fly || this.fly.k !== k) {
      const n = 7, d0 = ((k % n) + 1) / (n + 1) * T.L, high = k % 2 === 0, s = (k * 7919) % 3 === 0 ? -1 : 1;
      const tries = high
        ? [{ side: 34 * s, h: 42 }, { side: -34 * s, h: 42 }, { side: 20 * s, h: 65 }, { side: 0, h: 85 }]
        : [{ side: 14 * s, h: 7 }, { side: -14 * s, h: 7 }, { side: 34 * s, h: 42 }, { side: 0, h: 85 }];
      // (what can block a shot: every solid thing taller than a car, as a box, gathered once; the ground and the road,
      // whose boxes are the size of the map, left out. Boxes, not triangles: a city has thousands of them.)
      if (!this.flyBoxes) {
        this.flyBoxes = [];
        this.world.root.updateMatrixWorld(true);
        this.world.root.traverse(o => {
          if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.visible) return;
          const bb = new THREE.Box3().setFromObject(o), sz = bb.getSize(new THREE.Vector3());
          if (sz.y > 4 && sz.x < 250 && sz.z < 250) this.flyBoxes.push(bb);
        });
      }
      const ray = new THREE.Ray(), hit = new THREE.Vector3();
      // (clear: from the camera it can see both the road beside it and the stretch it's looking at)
      const sees = (from, to) => {
        const dir = to.clone().sub(from), dist = dir.length(); ray.set(from, dir.normalize());
        return !this.flyBoxes.some(bb => !bb.containsPoint(from) && ray.intersectBox(bb, hit) && hit.distanceTo(from) < dist - 2);
      };
      const clear = (F) => [0, 0.5, 1].every(u => { const q = place(F, u); return sees(q.road, q.p) && sees(q.t, q.p); });
      this.fly = { k };
      for (const o of tries) { const F = { k, d0, run: o.h > 30 ? 60 : 90, ahead: o.side === 0 ? 170 : o.h > 30 ? 70 : 45, ...o }; if (o === tries[tries.length - 1] || clear(F)) { Object.assign(this.fly, F); break; } }
    }
    const q = place(this.fly, u);
    cam.position.copy(q.p);
    cam.up.set(0, 1, 0);
    cam.lookAt(q.t);
    cam.fov = this.fly.h > 30 ? 45 : 55;
    cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }
  introCamera(dt) {
    const T = this.T, N = T.N, cam = this.camera;
    const at = (d) => {
      const u = d / T.ds, i0 = Math.floor(u), f = u - i0, a = ((i0 % N) + N) % N, b = (a + 1) % N;
      const l = (A) => A[a] + (A[b] - A[a]) * f;
      return { x: l(T.X), y: l(T.Y), z: l(T.Z), rx: l(T.RX), rz: l(T.RZ), w: l(T.W) };
    };
    const k = Math.min(1, this.stateT / 3.2);
    const e = k * k * (3 - 2 * k);
    const len = 14 + this.cars.length * 8;
    const d = 12 - e * len;
    const c = at(d);
    cam.position.set(c.x, c.y + 2.3 + e * 1.4, c.z); // (over the drivers' heads, a metre or so either side)
    const t = at(d - 16), look = new THREE.Vector3(t.x, t.y + 0.5, t.z);
    if (!this.introLook || !dt || this.stateT < 0.05) this.introLook = look.clone();
    else this.introLook.lerp(look, 1 - Math.exp(-dt * 8));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.introLook);
    cam.fov = 50;
    cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }

  tvCamera(dt, snap) {
    const car = this.focus, p = car.phys, cam = this.camera, T = this.T, N = T.N;
    const cams = this.world.tvCams;
    if (!cams.length) return;
    const ahead = (c) => (c.i - car.idx + N) % N;
    if (!this.tv || ahead(this.tv) > N * 0.8 && ((car.idx - this.tv.i + N) % N) * T.ds > 45) {
      let best = null, bd = Infinity;
      for (const c of cams) { const a = ahead(c) * T.ds; if (a > 10 && a < bd) { bd = a; best = c; } }
      this.tv = best || cams[0];
    }
    const c = this.tv;
    cam.position.set(c.x, c.y, c.z);
    cam.up.set(0, 1, 0);
    const target = new THREE.Vector3(p.x + p.vx * 0.12, car.y + 0.7, p.z + p.vz * 0.12);
    if (!this.tvLook || snap) this.tvLook = target.clone(); else this.tvLook.lerp(target, 1 - Math.exp(-dt * 10));
    cam.lookAt(this.tvLook);
    const d = cam.position.distanceTo(target);
    cam.fov = THREE.MathUtils.clamp(2 * Math.atan(9 / d) * 180 / Math.PI, 6, 60);
    cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }

  // ---------- audio ----------
  updateAudio() {
    if (!this.voice) return;
    if (this.paused) { this.voice.silence(); this.aiVoices.forEach(v => v.silence()); return; }
    const pl = this.player;
    if (pl) {
      const p = pl.phys;
      this.voice.update({ ...engineOf(pl), speed: p.speed, slip: Math.max(p.slipR, p.slipF * 0.8, p.braking > 0.9 && p.speed > 20 ? 0.25 : 0), onRoad: pl.onRoad, offRoad: !pl.onRoad, kerb: pl.surface === 'kerb', gain: 1 });
    }
    // nearest two AI
    const cp = this.camera.position;
    const others = this.cars.filter(c => !c.isPlayer).map(c => ({ c, d: cp.distanceTo(c.model.group.position) })).sort((a, b) => a.d - b.d);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.aiVoices.forEach((v, k) => {
      const o = others[k];
      if (!o) return v.silence();
      const g = Math.max(0, 1 - o.d / 120);
      const dir = new THREE.Vector3().subVectors(o.c.model.group.position, cp).normalize();
      const pan = THREE.MathUtils.clamp(dir.dot(right), -1, 1) * 0.8;
      // doppler
      const vrel = pl ? ((o.c.phys.vx - pl.phys.vx) * -dir.x + (o.c.phys.vz - pl.phys.vz) * -dir.z) : 0;
      v.update({ ...engineOf(o.c), speed: o.c.phys.speed, gain: g * g * 0.7, pan, doppler: 1 + THREE.MathUtils.clamp(vrel / 340, -0.2, 0.2) });
    });
  }

  setPaused(p) { this.paused = p; this.updateAudio(); }

  // the tower's interval to the car ahead: the time since it was where this car is now (finished: the finishing
  // times; lapped: laps). Held to a tenth that only moves when the time is clearly past it, so it doesn't flicker
  interval(c, a) {
    const T = this.T;
    if (c.finished && a.finished) return '+' + (c.finishTime - a.finishTime).toFixed(1);
    const ar = a.finished ? a.finRaw ?? a.raw : a.raw, laps = Math.floor((ar - c.raw) / T.L);
    if (laps >= 1) { c.intv = null; return '+' + laps + ' LAP'; }
    const ta = this.timeAt(a, c.raw);
    const v = ta != null ? this.raceTime - ta : Math.max(0, ar - c.raw) / Math.max(20, c.phys.speed || 40);
    const I = c.intv;
    if (!I || I.a !== a || Math.abs(v - I.v) > 0.07) c.intv = { a, v: Math.round(v * 10) / 10 };
    return '+' + c.intv.v.toFixed(1);
  }
  // the time since car a was where car c is now (a ahead: how far ahead it is; null: not known yet)
  timeBehind(c, a) { const t = this.timeAt(a, c.raw); return t != null ? this.raceTime - t : null; }
  // if this car stopped now: where it would come out. The stop's cost (the pit lane against the track, a tyre change)
  // against how far ahead or behind each car is, in time: { pos, loss, ahead (the car it'd come out behind), aheadBy,
  // behind, behindBy }. (It doesn't know about fresh tyres or traffic: it's where you'd be, not where you'd end up.)
  pitProjection(car) {
    if (!this.pit) return null;
    // (under the VSC or the safety car the field's slow too: a stop costs about half)
    const loss = (this.pitLoss + 4.5 + (car.pitBonus || 0)) * (this.rc && this.rc.vscOn() ? 0.5 : 1);
    let pos = 1, ahead = null, aheadBy = Infinity, behind = null, behindBy = Infinity;
    for (const o of this.order) {
      if (o === car || o.gone || o.finished) continue;
      // (d: how far ahead of us it'd be after the stop)
      const g = o.pos < car.pos ? this.timeBehind(car, o) : this.timeBehind(o, car); if (g == null) { if (o.pos < car.pos) pos++; continue; }
      const d = o.pos < car.pos ? g + loss : loss - g;
      if (d > 0) { pos++; if (d < aheadBy) { ahead = o; aheadBy = d; } } else if (-d < behindBy) { behind = o; behindBy = -d; }
    }
    return { pos, loss, ahead: ahead && ahead.name, aheadBy, behind: behind && behind.name, behindBy };
  }
  // the live delta, eased a touch and held to the hundredth until it's clearly moved on
  shownDelta(car) {
    const d = this.liveDelta(car);
    if (d == null) { this.dShow = null; return null; }
    const S = this.dShow, dt = S ? Math.min(0.1, Math.max(0, this.raceTime - S.t)) : 0;
    if (!S || S.lap !== car.lapStart || dt === 0 && this.raceTime !== S.t) { this.dShow = { t: this.raceTime, lap: car.lapStart, sm: d, v: Math.round(d * 100) / 100 }; return this.dShow.v; }
    S.sm += (d - S.sm) * (1 - Math.exp(-dt / 0.12)); S.t = this.raceTime;
    if (Math.abs(S.sm - S.v) > 0.007) S.v = Math.round(S.sm * 100) / 100;
    return S.v;
  }

  // HUD data snapshot
  hudState() {
    const pl = this.player;
    if (!pl) return null;
    const p = pl.phys;
    const lapNow = pl.finished ? pl.last : pl.lap === 0 ? 0 : this.raceTime - pl.lapStart;
    const standings = this.order.map((c, k) => {
      // (multiclass: the gap to the car ahead in the same class, and the place in it)
      const ahead = this.multi ? this.order.slice(0, k).reverse().find(o => o.cls === c.cls && !o.gone) : this.order[k - 1];
      const gap = ahead ? this.interval(c, ahead) : '';
      return { pos: c.pos, name: c.name, color: c.team.main, isPlayer: c.isPlayer, mate: !!(c.ai && c.ai.trust != null), gap, tyre: c.phys.tyre.c, pit: !!c.pitting, pen: c.pen || 0, dt: !!c.dt, blue: !!c.blue,
        ...(this.multi ? { cls: CLASSES[c.cls]?.short || c.cls, clsCol: CLASSES[c.cls]?.col || '#888', mine: c.cls === pl.cls, clsPos: this.classPos(c).pos, gapAll: k ? this.interval(c, this.order[k - 1]) : '' } : {}) };
    });
    // the strategy panel: the set you're on, what a stop now would do (twice a second), your teammate (World Career)
    if (this.mode === 'race' && (!this.stratT || this.raceTime - this.stratT > 0.5 || this.raceTime < this.stratT)) {
      this.stratT = this.raceTime;
      const mate = this.cars.find(c => c.ai && c.ai.trust != null && !c.gone);
      const mg = mate ? (mate.pos < pl.pos ? this.timeBehind(pl, mate) : this.timeBehind(mate, pl)) : null;
      this.strat = { wx: this.wx ? { wet: this.wet, rainK: this.rainK, eta: this.wxEta() } : null, proj: pl.pitting || pl.finished ? null : this.pitProjection(pl), mate: mate ? { pos: mate.pos, name: mate.name, gap: mg == null ? null : mate.pos < pl.pos ? -mg : mg } : null };
    }
    return {
      pos: pl.pos, total: this.cars.length, lap: Math.max(1, Math.min(pl.lap, this.laps)), laps: this.laps,
      // (multiclass: your place in your class, the class, and overall)
      ...(this.multi ? (() => { const cp = this.classPos(pl); return { clsPos: cp.pos, clsN: cp.n, cls: CLASSES[pl.cls]?.short || pl.cls, clsCol: CLASSES[pl.cls]?.col }; })() : {}),
      lapTime: lapNow, best: pl.best, last: pl.last, raceTime: this.raceTime, timed: this.timedClock(), lapNo: pl.lap,
      crew: this.crew ? { cur: this.crew.cur, name: this.crew.name, t: { ...this.crew.t }, need: this.crewNeed(), ff: this.crew.ff, skipping: !!this.skipping } : null,
      speed: p.speed, gear: p.gear, rpm: p.rpm, standings, wrongWay: this.wrongWay,
      aids: this.aidHud(),
      state: this.state, surface: pl.surface,
      tyre: p.tyre, dmg: p.dmg, wear: this.wearK > 0, damage: this.damageK > 0,
      // (the pit menu, on the way in: each damaged part, fixed or not, and the stop it all adds up to)
      pitParts: pl.pitting && pl.pitReq && !pl.pitReq.dt && !pl.pitReq.garage ? this.pitParts(pl).map(x => ({ ...x, fix: pl.pitReq.repair === true || !!(pl.pitReq.repair && pl.pitReq.repair[x.k]) })) : null,
      pitEst: pl.pitting && pl.pitReq && !pl.pitReq.dt && !pl.pitReq.garage ? this.serviceTime(pl) : 0,
      pitStack: pl.pitting && pl.pitPhase === 'in' && pl.stackBehind ? { name: pl.stackBehind.name, left: pl.stackBehind.pitPhase === 'stop' ? Math.max(0, pl.stackBehind.pitTimer) : null } : null,
      pitting: pl.pitting, pitPhase: pl.pitPhase, pitLim: pl.pitPhase === 'out' ? !!pl.pitLim : pl.pitting && pl.pitPhase !== 'stop', pitTimer: pl.pitTimer, pitTotal: pl.pitTotal, pitReq: pl.pitReq, pits: pl.pits,
      // (tyre temperatures: what grip each tyre's temperature is giving, -1 cold .. 0 at its best .. 1 overheated)
      temps: p.tempMode ? Array.from(p.tS, (t, i) => { const m = p.tempMode === 2 ? 0.65 * t + 0.35 * p.tC[i] : t; return Math.max(-1, Math.min(1, (m - p.tyreOpt) / (p.tempMode === 2 ? 25 : 35) / 1.6)); }) : null,
      wake: p.wakeLoss, latG: p.latG, bent: p.bentOn ? Array.from(p.bent) : null, bentDir: p.bentOn ? Array.from(p.bentDir) : null, eng: p.engOn ? { t: p.engT, k: p.engK, rad: p.dmg.rad || 0, gb: p.dmg.gb || 0, fl: p.dmg.fl || 0, lost: p.lostGear, fd: p.p.drive ?? 0 } : null,
      shape: pl.hudShape || (pl.hudShape = this.hudShape(pl)),
      hasPit: !!this.pit, slip: p.slip, plan: pl.plan ? this.nextPlannedStop(pl) : null, strat: this.mode === 'race' ? { ...this.strat, tyreLaps: Math.max(0, pl.lap - (pl.stintLap || 1)) } : null,
      rc: this.rc.hudFor(pl), lastInvalid: !!pl.lastInvalid, penServing: pl.penServing || 0,
      delta: this.quali || this.mode === 'test' ? this.shownDelta(pl) : null, // (against your best lap: sessions and time trial)
      prog: this.progHud(),
      gateNear: this.prog && this.prog.nearInfo || null, // (the acclimatization gate you're closing on: your speed against it)
      sectors: this.secCut ? this.secHud(pl) : null,
      quali: this.quali ? {
        left: this.quali.left, flag: this.quali.flag, done: this.quali.done, rows: this.qualiRows(),
        status: pl.pitting ? (pl.pitPhase === 'out' || pl.lap === 0 ? 'PIT EXIT' : 'IN LAP')
          : this.T.open ? (pl.lap > 1 ? 'RUN OVER' : `RUN ${this.quali.used || 1}/${this.quali.runs || 1}${pl.lap === 0 ? ' · START' : ''}`) // (point-to-point: runs from the top)
          : pl.lap === 0 ? (pl.pits ? 'OUT LAP' : 'RUN-UP') : this.quali.flag ? 'LAST LAP' : 'FLYING',
      } : null,
    };
  }

  // the cars in classified order (the podium takes the first three)
  classified() { return this.results(true); }
  results(cars = false) {
    // penalties not served in the pits are added to the race time (cars still running: worth that much distance)
    const L = this.T.L, laps = this.laps;
    const fastest = Math.min(...this.cars.map(c => c.best));
    const vRef = L / (isFinite(fastest) ? fastest : 90);
    // (a drive-through never served costs 20 s at the flag)
    const owed = (c) => (c.pen || 0) + (c.dt ? 20 : 0);
    const time = (c) => c.finishTime + owed(c);
    const prog = (c) => (c.raw ?? c.progress) - owed(c) * vRef;
    const list = [...this.cars].sort((a, b) => {
      if (a.gone !== b.gone) return a.gone ? 1 : -1;
      if (a.finished && b.finished) return (this.timed || this.multi ? b.lap - a.lap : 0) || time(a) - time(b); // (timed, multiclass: laps first)
      if (a.finished) return -1; if (b.finished) return 1;
      return prog(b) - prog(a);
    });
    if (cars) return list.filter(c => !c.gone && !c.dsq);
    const win = list[0];
    // leader's distance: a finished car stopped counting at the flag
    const lapsDown = (w, c) => Math.floor(((w.finished ? laps * L : w.raw ?? w.progress) - (c.raw ?? c.progress)) / L);
    return list.map((c, k) => ({
      pos: k + 1, name: c.name, team: c.team.name, color: c.team.main, isPlayer: c.isPlayer, pid: c.pid || null,
      time: c.finished ? time(c) : null,
      gap: k === 0 ? '' : (this.timed || this.multi) && c.finished && win.finished && c.lap < win.lap ? '+' + (win.lap - c.lap) + ' LAP' : c.finished && win.finished ? '+' + (time(c) - time(win)).toFixed(3) : lapsDown(win, c) >= 1 ? '+' + lapsDown(win, c) + ' LAP' : 'RUNNING',
      pen: (c.penTotal || 0) + (c.dt ? 20 : 0), dt: c.dtTotal || 0, dsq: !!c.dsq,
      best: c.best, pits: c.pits, led: c.led || 0, grid: c.startPos || null, cleanFinish: (c.maxDmg || 0) < 0.25 && !c.penTotal && !c.dtTotal,
      human: c.human, key: c.key, dnf: !!c.gone, finished: c.finished, lap: c.lap, hired: !!c.hired, cls: c.cls,
      drift: Math.round(c.isPlayer && this.drift ? this.drift.total : c.driftTotal || 0),
    })).map(r => (r.dsq ? { ...r, gap: 'DSQ' } : r.dnf ? { ...r, gap: 'DNF' } : r)).map((r, k, all) => ({ ...r, clsPos: all.slice(0, k + 1).filter(x => x.cls === r.cls).length })); // (the place in its class)
  }

  // Compile every shader behind the loading screen. A normal frame only compiles what the camera sees, so the rest
  // (a building round the corner, leaves in the shadow map) would compile mid-race the moment it first came into
  // view: a stutter of up to a few hundred ms, typically as a drift swings the camera round. One frame with nothing
  // culled or hidden draws (and so compiles) everything, shadow casters included; the next update puts it back.
  // (After a normal frame: three.js draws the shadow map before it sets up the frame's lights, so in a scene's very
  // first frame the shadow shaders are built for "no lights" and every later frame wants different ones.)
  warmUp(post, settings) {
    const S = { ...settings, trails: false }; // (no frame trails: the everything-on frame mustn't linger on screen)
    this.render(post, S);
    const off = [], hidden = [];
    this.scene.traverse(o => { if (o.frustumCulled) { o.frustumCulled = false; off.push(o); } if (!o.visible) { o.visible = true; hidden.push(o); } });
    try { this.render(post, S); } finally {
      for (const o of off) o.frustumCulled = true;
      for (const o of hidden) o.visible = false;
    }
    this.render(post, S); // (and a normal one over it, so the trails' history doesn't hold the everything-on frame)
  }

  render(post, settings) {
    const trails = settings.trails ? 0.22 + Math.min(0.28, (this.focus.phys.speed || 0) * 0.004) : 0;
    this.camera.aspect = post.r.domElement.width / post.r.domElement.height;
    this.camera.updateProjectionMatrix();
    if (this.drivers) this.drivers.update();
    // (after the race: the podium, on its own stage)
    const pod = this.drivers && this.drivers.podiumCamera(this.drivers.tick2(), post.r.domElement.width / post.r.domElement.height);
    if (pod) return post.render(pod.scene, pod.cam, { trails: 0, grade: this.world.P.grade, look: this.world.P.look });
    post.render(this.scene, this.camera, { trails, grade: this.world.P.grade, look: this.world.P.look });
    this.mirror(post.r);
  }

  // The rear-view mirror: a camera on the car's tail, looking back, drawn into the HUD's mirror frame (#h-mirror) at the
  // game's own resolution, flipped left to right as a mirror is. Only while you're driving (not the intro, the TV
  // cameras after the flag, the podium, attract mode), and not while the start lights hang over it.
  mirror(r) {
    const hud = this.mirrorHud ||= document.getElementById('hud'), el = this.mirrorEl ||= document.getElementById('h-mirror');
    const car = this.player, driving = MIRROR && car && this.mode !== 'attract' && !this.tv && ['countdown', 'racing', 'finished'].includes(this.state) && !(this.state === 'finished' && this.stateT > 2.5);
    if (hud && hud.classList.contains('mirror') !== !!driving) hud.classList.toggle('mirror', !!driving);
    if (!driving || !el || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return;
    const rect = el.getBoundingClientRect(), cv = r.domElement.getBoundingClientRect(), pr = r.getPixelRatio();
    if (rect.width < 8 || rect.height < 8) return;
    const W = Math.max(8, Math.round(rect.width * pr)), H = Math.max(4, Math.round(rect.height * pr));
    if (!this.mirrorRT) {
      this.mirrorRT = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      const tex = this.mirrorRT.texture; tex.repeat.x = -1; tex.offset.x = 1; // (left to right, as in a mirror)
      this.mirrorQuad = new THREE.Scene();
      this.mirrorQuad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false })));
      this.mirrorOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.mirrorCam = new THREE.PerspectiveCamera(13, W / H, 0.1, 400);
    }
    if (this.mirrorRT.width !== W || this.mirrorRT.height !== H) { this.mirrorRT.setSize(W, H); this.mirrorCam.aspect = W / H; this.mirrorCam.updateProjectionMatrix(); }
    // the view behind, every other frame (a 30 Hz mirror reads the same and costs half): from just over the tail at roof
    // height, looking back and a touch down, so the road and the cars following sit in the middle
    if ((this.mirrorTick = (this.mirrorTick || 0) + 1) % 2 || !this.mirrorFresh) {
      const g = car.model.group, sz = this.camSize(car), mc = this.mirrorCam; g.updateMatrixWorld();
      mc.position.set(0, sz.h * 0.92, -sz.back - 0.05).applyMatrix4(g.matrixWorld);
      mc.up.set(0, 1, 0); mc.lookAt(this._mlook = (this._mlook || new THREE.Vector3()).set(0, sz.h * 0.92 - 0.5 - Math.max(0, sz.h - 1.3) * 3, -sz.back - 40).applyMatrix4(g.matrixWorld)); // (a tall van's mirror tilts down more: a car on its bumper stays in it)
      const auto = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; // (the shadows are this frame's already)
      r.setRenderTarget(this.mirrorRT); r.clear(); r.render(this.scene, mc); r.setRenderTarget(null);
      r.shadowMap.autoUpdate = auto; this.mirrorFresh = true;
    }
    // into the frame's spot on the screen (viewport in CSS pixels, from the canvas's bottom left)
    const x = rect.left - cv.left, y = cv.bottom - rect.bottom, size = r.getSize(this._msz = this._msz || new THREE.Vector2()), ac = r.autoClear;
    r.setViewport(x, y, rect.width, rect.height); r.setScissor(x, y, rect.width, rect.height); r.setScissorTest(true);
    r.autoClear = false; r.render(this.mirrorQuad, this.mirrorOrtho); r.autoClear = ac;
    r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y);
  }

  dispose() {
    setCrowdCars([]);
    if (this.mirrorRT) { this.mirrorRT.dispose(); this.mirrorQuad.children[0].geometry.dispose(); this.mirrorQuad.children[0].material.dispose(); }
    if (this.mirrorHud) this.mirrorHud.classList.remove('mirror');
    if (this.voice) this.voice.stop();
    this.aiVoices.forEach(v => v.stop());
    if (this.pitLife) this.pitLife.dispose();
    if (this.prog) this.prog.dispose();
    if (this.markers) this.markers.dispose();
    if (this.drivers) this.drivers.dispose();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
}

// what a car's engine sounds like right now: its profile + rev range, and the revs you'd hear (pulling away, the clutch
// slips, so the engine revs above what the road speed gives)
function engineOf(car) {
  const p = car.phys, P = p.p, low = Math.max(0, 1 - p.speed / 9);
  // (a gear change cuts the throttle for a moment: you hear the shift)
  const thr = p.shiftT > 0 ? (p.throttle || 0) * 0.15 : p.throttle || 0;
  const rpm = Math.max(p.rpm, P.idle + (p.throttle || 0) * low * (P.redline * 0.55 - P.idle));
  return { engine: (CARS[car.carId] || CARS.f1).sound, rpm, idle: P.idle, redline: P.redline, throttle: thr };
}

// floating name over an online player's car
function nameTag(name, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = "bold 34px Arimo, Arial, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(248, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(128 - w / 2, 10, w, 44);
  g.fillStyle = '#' + (color >>> 0).toString(16).padStart(6, '0'); g.fillRect(128 - w / 2, 10, 6, 44);
  g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(name, 131, 33);
  g.fillStyle = '#fff'; g.fillText(name, 131, 33);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sp.scale.set(3.2, 0.8, 1); sp.position.set(0, 1.9, 0); sp.renderOrder = 10;
  return sp;
}

// ---------- skid marks (ring buffer of quads) ----------
class SkidMarks {
  constructor(scene) {
    this.max = 1400;
    this.pos = new Float32Array(this.max * 6 * 3);
    this.col = new Float32Array(this.max * 6 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.n = 0; this.dirty = false;
  }
  add(last, on, x, y, z, alpha, color) {
    if (!on) return null;
    if (!last) return { x, y, z };
    const dx = x - last.x, dz = z - last.z, d = Math.hypot(dx, dz);
    if (d < 0.8) return last;
    if (d > 4) return { x, y, z };
    const nx = -dz / d * 0.2, nz = dx / d * 0.2;
    const k = this.n % this.max;
    const P = [last.x - nx, last.y, last.z - nz, last.x + nx, last.y, last.z + nz, x - nx, y, z - nz,
      last.x + nx, last.y, last.z + nz, x + nx, y, z + nz, x - nx, y, z - nz];
    this.pos.set(P, k * 18);
    const c = new THREE.Color(color);
    for (let v = 0; v < 6; v++) this.col.set([c.r, c.g, c.b, alpha], k * 24 + v * 4);
    this.n++; this.dirty = true;
    return { x, y, z };
  }
  update() {
    if (!this.dirty) return;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.min(this.n, this.max) * 6);
    this.dirty = false;
  }
}

// ---------- particles (smoke / dust / spray) ----------
class Particles {
  constructor(scene) {
    this.max = 500;
    const g = new THREE.BufferGeometry();
    this.p = new Float32Array(this.max * 3);
    this.c = new Float32Array(this.max * 4);
    this.s = new Float32Array(this.max);
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1));
    const tx = getTextures();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tx.corona }, scale: { value: 360 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
        uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a * 0.7); }`,
      transparent: true, depthWrite: false,
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false; this.pts.renderOrder = 4;
    scene.add(this.pts);
    this.list = [];
    for (let i = 0; i < this.max; i++) this.list.push({ life: 0 });
    this.k = 0;
  }
  spawn(x, y, z, color, size, vx, vy, vz, alpha = 0.8, decay = 1.1) {
    const q = this.list[this.k]; this.k = (this.k + 1) % this.max;
    const c = new THREE.Color(color);
    Object.assign(q, { x, y, z, vx: vx + (Math.random() - 0.5) * 2, vy: vy + Math.random(), vz: vz + (Math.random() - 0.5) * 2, life: 1, size, r: c.r, g: c.g, b: c.b, a: alpha, decay });
  }
  burst(x, y, z, n, color, size) { for (let i = 0; i < n; i++) this.spawn(x, y, z, color, size, (Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6); }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const q = this.list[i];
      if (q.life > 0) {
        q.life -= dt * (q.decay || 1.1);
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.vx *= 1 - dt * 2; q.vz *= 1 - dt * 2; q.vy *= 1 - dt;
      }
      const a = Math.max(0, q.life);
      this.p[i * 3] = q.x || 0; this.p[i * 3 + 1] = q.y || -999; this.p[i * 3 + 2] = q.z || 0;
      this.c[i * 4] = q.r || 0; this.c[i * 4 + 1] = q.g || 0; this.c[i * 4 + 2] = q.b || 0; this.c[i * 4 + 3] = a * (q.a ?? 0.8);
      this.s[i] = a > 0 ? q.size * (1.8 - a) : 0;
    }
    const g = this.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}
