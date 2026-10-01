// Race session: world + cars + AI + rules + cameras
import * as THREE from 'three';
import { sampleTrack, analyzeTrack, computeRacingLine, computeSpeedProfile, surfaceY, gridSlot, circDist, buildPitLane, OPEN_END_WALL } from './track.js';
import { buildWorld, walkEdge, walkWidth, KERB_H, WALK_H, WALK_RAMP } from './world.js';
import { applyRoadsToCircuit, raiseTrackOverRoads } from './roads.js';
import { Spray } from './weatherfx.js';
import { CarPhysics, CARSPEC, TEAMS, TYRES, wearGrip, tyreGrip, LOCK_K, PHYS_VERSION } from './car.js';
import { buildF1, teamCar } from './carmodel.js';
import { CARS, carId, carsInClass, chassisKey } from './cars.js';
import { EngineVoice, sfx } from './audio.js';
import { DriftScore } from './drift.js';
import { getTextures } from './textures.js';
import { RaceControl, findCorners, VSC_PACE } from './racecontrol.js';
import { AI_AIDS, physAids } from './aids.js';
import { LapRecorder, addLap, lapKey, bestLap, loadPB, lapPoseAt } from './telemetry.js';

const STEP = 1 / 240;
// pace = fraction of the learned per-track limit
// grip > 1 is an edge (Legend / Alien): the AI learns each circuit with it (a plan of its own: limitsFor), so it uses it.
// Since the honest physics (stage 3) the road / GT AI's best is a little under a quick human's (it doesn't find the
// fastest line through fast S-bends yet), so the top two levels get a small, labelled edge. Measured on the user's
// circuit in the M1 (their best 1:44.5): Rookie ~1:53, Pro ~1:49.5, Legend ~1:46, Alien ~1:44-1:45.
const DIFF = {
  easy:   { pace: 0.85, power: 0.95, grip: 1, spread: 0.03, rubber: true },
  medium: { pace: 0.93, power: 0.98, grip: 1, spread: 0.025, rubber: true },
  hard:   { pace: 1, power: 1.01, grip: 1.03, spread: 0.015, rubber: false },
  alien:  { pace: 1, power: 1.04, grip: 1.07, spread: 0.006, rubber: false },
};
// the F1 class keeps its table from before (its AI never had the cornering help the road / GT AI lost in stage 3)
const diffFor = (opts) => { const D = (CARS[carId(opts.car)] || CARS.f1).cls === 'f1' ? DIFF_F1 : DIFF; return D[opts.difficulty] || D.medium; };
const DIFF_F1 = {
  easy:   { pace: 0.8,  power: 0.94, grip: 0.97, spread: 0.03, rubber: true },
  medium: { pace: 0.875, power: 0.97, grip: 0.99, spread: 0.025, rubber: true },
  hard:   { pace: 0.945, power: 1.0, grip: 1.0, spread: 0.015, rubber: false },
  alien:  { pace: 0.99, power: 1.0, grip: 1.0, spread: 0.006, rubber: false },
};
// AI mistakes: chance per corner of braking too late / running wide / spinning, by difficulty (x the AI Mistakes option)
const MISTAKE = { easy: 0.03, medium: 0.022, hard: 0.014, alien: 0.008 };
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
export const TYRE_FIT = 20; // seconds of a session to fit a new set of tyres in the garage
const CAMS = ['chase', 'far', 'tcam', 'bumper'];
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)); if (d < 0) d += Math.PI * 2; return a + (d - Math.PI) * t; };

// just the circuit and its world, no cars (for taking pictures of it)
export function buildScenery(track) {
  const T = sampleTrack(track);
  raiseTrackOverRoads(track, T);
  const A = analyzeTrack(T, track.env);
  A.pit = buildPitLane(T, A, track.env);
  applyRoadsToCircuit(track, T, A);
  const world = buildWorld(track, T, A);
  const scene = new THREE.Scene();
  scene.fog = world.fog; scene.add(world.root);
  return { T, world, scene, dispose: () => scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }) };
}

// grip (× the tyres') and drag (N per m/s) of each surface beside the track (Race.surfaceKind)
const SURFACES = { road: [1, 0], kerb: [0.96, 0], walk: [0.92, 10], public: [0.95, 15], city: [0.85, 30], grass: [0.58, 120], gravel: [0.5, 260], sand: [0.55, 190] };

export class Race {
  constructor(track, opts, renderer) {
    this.opts = opts;
    this.mode = opts.mode; // 'race' | 'attract' | 'test'
    this.track = track;
    const T = this.T = sampleTrack(track);
    raiseTrackOverRoads(track, T); // the track bridges roads set to "under"
    const A = this.A = analyzeTrack(T, track.env);
    this.pit = buildPitLane(T, A, track.env);
    A.pit = this.pit;
    applyRoadsToCircuit(track, T, A); // barrier gaps, gates, the track bridging roads that tunnel under it
    this.world = buildWorld(track, T, A);
    this.rain = this.world.P.rain;
    const racey = this.mode !== 'attract';
    this.wearK = racey ? ({ off: 0, normal: 1, fast: 2.5 }[opts.wear || 'normal'] ?? 1) : 0;
    this.damageK = 0;
    this.scene = new THREE.Scene();
    this.scene.fog = this.world.fog;
    this.scene.add(this.world.root);
    if (this.rain) this.spray = new Spray(this.scene);
    this.camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.3, 5000);
    this.scene.add(this.camera);

    this.line = computeRacingLine(T);
    this.corners = findCorners(T);
    this.rec = opts.mode !== 'attract' ? new LapRecorder(T) : null; // your laps, sample by sample (telemetry.js: Lap Review)
    this.cars = [];
    this.diff = diffFor(opts);
    this.mistakeP = this.mode === 'race' ? (MISTAKE[opts.difficulty] ?? MISTAKE.medium) * (MISTAKES[opts.aiMistakes || 'normal'] ?? 1) : 0;
    this.limits = {}; // learned speed plan per car type
    this.lineV = this.limitsFor(this.mainCarId());
    this.damageK = racey ? ({ off: 0, normal: 1, high: 1.8 }[opts.damage || 'normal'] ?? 1) : 0;
    this.laps = this.mode === 'race' ? (T.open ? 1 : opts.laps) : Infinity; // (point-to-point: one run, start to finish)
    this.pitLoss = this.pit ? this.pit.length / this.pit.speed - this.pit.length / 55 + 5 : 30;
    this.units = opts.units || 'kmh';
    this.rainGrip = this.world.P.grip;
    this.night = this.world.P.night > 0;

    this.skids = new SkidMarks(this.scene);
    this.particles = new Particles(this.scene);
    this.cars = [];
    this.net = opts.net || null;
    if (this.net) {
      // online: the host decided the grid; humans drive their own garage cars
      const net = this.net;
      net.grid.forEach((g, slot) => {
        if (g.k === 'h') {
          const me = g.id === net.myId;
          const team = { name: g.teamName && g.teamName !== 'Your Team' ? g.teamName : `${g.name} Racing`, main: g.car.main, accent: g.car.accent, helmet: g.car.accent, driver: g.name };
          this.addCar(team, slot, me, g.team, { cfg: g.car, remote: !me, human: true, key: 'h:' + g.id, name: g.name, tag: !me });
        } else {
          this.addCar(TEAMS[g.team], slot, false, g.team, { remote: !net.host, key: 'a:' + g.team });
        }
      });
    } else {
    // (qualifying: a clear track, the AI field's times are simulated: see qualiStart)
    const nField = Math.min(11, opts.opponents ?? 7);
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
    let aiTeams = TEAMS.map((t, i) => i).filter(i => i !== reserved);
    for (let i = aiTeams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [aiTeams[i], aiTeams[j]] = [aiTeams[j], aiTeams[i]]; }
    // championship: same AI teams every round, grid in championship order
    if (opts.roster) aiTeams = opts.roster.filter(i => i !== reserved);
    this.qualiTeams = aiTeams.slice(0, nField); // (qualifying: who's in the field; the race after it gets the same teams)
    let order;
    if (opts.gridOrder) {
      // gridOrder: list of 'P' / team indices, leader first
      order = opts.gridOrder.filter(k => k === 'P' ? hasPlayer : aiTeams.slice(0, nAI).includes(k));
      for (const k of aiTeams.slice(0, nAI)) if (!order.includes(k)) order.push(k);
      if (hasPlayer && !order.includes('P')) order.push('P');
    } else {
      const ais = aiTeams.slice(0, nAI);
      order = [];
      for (let slot = 0, a = 0; slot < total; slot++) order.push(hasPlayer && slot === playerSlot ? 'P' : ais[a++ % ais.length]);
    }
    order.forEach((k, slot) => {
      const isPlayer = k === 'P';
      const teamIdx = isPlayer ? reserved : k;
      this.addCar(isPlayer ? this.playerTeamObj : TEAMS[teamIdx], slot, isPlayer, teamIdx);
    });
    }
    this.player = this.cars.find(c => c.isPlayer) || null;
    // drift points (race setup option): a scorer for your car (one per car later, for drift battles)
    this.drift = opts.drift === 'on' && this.player ? new DriftScore() : null;
    this.focus = this.player || this.cars[0];
    // flags, track limits, penalties (time trial: track limits delete the lap)
    this.rc = new RaceControl(this, this.mode === 'attract' ? 'off' : (opts.rules || 'arcade'));


    this.afterPick = this.mode === 'race' ? (opts.strategy !== false && this.player ? 'strategy' : 'intro') : 'racing';
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
    if (this.player) { this.buildRacingLine(); this.buildPitGuide(); }
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
  limitsKey(id) {
    const T = this.T; let h = 0;
    for (let i = 0; i < T.N; i += 7) h = (h * 31 + Math.round(T.X[i] * 10) * 7 + Math.round(T.Z[i] * 10) + Math.round(T.W[i] * 10)) | 0;
    return `${this.track.name}|${T.N}|${h}|${this.rain ? 1 : 0}|${id}`;
  }
  learnLimits(spec = CARSPEC, gripEdge = 1) {
    const T = this.T, N = T.N, grip = this.rain ? 0.97 : 1;
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
    car.phys.rain = this.rain; car.phys.wearK = 0; car.phys.isAI = true; car.phys.gripMul = gripEdge; car.phys.fitTyres(this.rain ? 'wet' : 'medium');
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
      car.phys.fitTyres(this.rain ? 'wet' : 'medium'); car.phys.wearK = 1;
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
      this.wearPerM = used / Math.max(1, dist) / TYRES[this.rain ? 'wet' : 'medium'].rate; // usage factor on this track
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
  simLap(id, { pace = 1, power = 1, grip = 1, tyre = 'soft', rec = null } = {}) {
    const T = this.T, N = T.N, spec = CARS[id].spec, V = this.limitsFor(id, grip);
    const saved = { state: this.state, dmg: this.damageK, laps: this.laps, err: this.mistakeP, rc: this.rc };
    this.state = 'racing'; this.damageK = 0; this.laps = Infinity; this.mistakeP = 0; this.rc = null;
    const car = {
      phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
      ai: { pace, bias: 0, over: 0, stuckT: 0, react: 0, errCd: 1e9 }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} },
    };
    const p = car.phys;
    p.rain = this.rain; p.wearK = 0; p.isAI = true; p.powerMul = power; p.gripMul = grip; p.fitTyres(this.rain ? 'wet' : tyre);
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
    for (let f = 0; f < 60 * 240; f++) {
      const ctl = this.aiControls(car, 1 / 60);
      for (let k = 0; k < 4; k++) { p.step(1 / 240, ctl, this.surfaceEnv(car)); this.updateTracker(car); this.barriers(car); if (rec && start >= 0) rec.sample(car, t, start); }
      t += 1 / 60;
      const prev = lastIdx, cur = car.idx; lastIdx = cur;
      if (start < 0) {
        if (T.open ? (prev > T.cut && cur <= T.cut && cur < T.finish / 2) : (prev > N * 0.75 && cur < N * 0.25)) start = t;
      } else if (T.open ? (prev < endAt && cur >= endAt && cur <= T.cut) : (prev > N * 0.75 && cur < N * 0.25 && t - start > 5)) { time = t - start; break; }
    }
    if (rec) rec.lap = isFinite(time) ? rec.finish(car, time, { valid: true, ref: true }, start) : null;
    this.state = saved.state; this.damageK = saved.dmg; this.laps = saved.laps; this.mistakeP = saved.err; this.rc = saved.rc;
    return time;
  }

  // the AI field: 'class' = cars from the same class as yours (the F1 grid drives your F1 model), 'custom' / 'svgp' /
  // 'mixed' = the F1 models, 'multi' = every class mixed. Picked from the team index, so every online client agrees.
  aiChassisFor(teamIdx) {
    const ai = this.opts.aiChassis || 'class';
    const main = this.opts.aiClassCar || this.mainCarId(), cls = (CARS[main] || CARS.f1).cls;
    if (ai === 'mixed') return teamIdx % 2 ? 'custom' : 'svgp';
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
    if (isPlayer && this.opts.car) cfg = this.playerCfg(this.opts.car, team, teamIdx);
    if (extra.cfg) cfg = { ...extra.cfg };
    const id = carId(cfg);
    const phys = new CarPhysics(CARS[id].spec);
    phys.place(g.x, g.z, g.heading);
    const mods = isPlayer ? this.opts.mods : null;
    if (isPlayer) {
      phys.auto = this.opts.gearbox !== 'manual'; phys.setAids(this.opts.aids ? physAids(this.opts.aids) : AI_AIDS);
      if (mods) {
        phys.powerMul = mods.power; phys.dfMul = mods.downforce; phys.dragMul = mods.drag; phys.brakeMul = mods.brake;
        phys.gripMul = mods.grip * (this.rain ? mods.rainGrip : 1) * (mods.softs ? 1.02 : 1);
      }
    } else if (!extra.human) {
      phys.powerMul = this.opts.aiSetup?.[teamIdx]?.power ?? this.diff.power * (1 - Math.random() * this.diff.spread * 0.5);
      phys.gripMul = this.diff.grip;
      phys.isAI = true;
    }
    phys.rain = this.rain; phys.wearK = this.wearK * (mods ? mods.wear : 1);
    const model = buildF1(cfg, { texSize: isPlayer ? 1024 : 512, low: !isPlayer && !extra.human && this.cars.length > 5 });
    if (extra.tag) model.group.add(nameTag(extra.name, cfg.main));
    model.pull = phys.pull;
    model.group.add(model.shadow);
    model.shadow.position.y = 0.03;
    this.scene.add(model.group);
    const car = {
      phys, model, team, teamIdx, isPlayer, carId: id, lineV: this.limitsFor(id, !isPlayer && !extra.human ? this.diff.grip : 1), name: extra.name || (isPlayer ? (this.opts.playerName || 'YOU') : team.driver),
      remote: !!extra.remote, human: !!(extra.human || isPlayer), key: extra.key || null,
      idx: g.idx, i: g.idx, f: 0, s: g.s, lap: 0, cpNext: 1, lapStart: 0, lapTimes: [], best: Infinity, last: 0,
      finished: false, finishTime: 0, progress: -10, surface: 'road', onRoad: true,
      q: new THREE.Quaternion(), y: 0, offT: 0,
      ai: isPlayer || extra.human || extra.remote ? null : { pace: this.diff.pace * (1 - Math.random() * this.diff.spread), bias: (Math.random() - 0.5) * 1.2, over: 0, stuckT: 0, react: 0.15 + Math.random() * 0.45 },
      ctl: { steer: 0, throttle: 0, brake: 0 },
      pos: 0, pits: 0, pitting: false, pitPhase: null, pitTimer: 0, pitReq: null, radio: {},
      startPos: slot + 1, maxDmg: 0, dmgK: mods ? mods.damage : 1, pitBonus: mods ? mods.pitTime : 0, slipK: mods ? mods.slip : 1,
      basePower: phys.powerMul, launch: !!(mods && mods.launch), extra,
    };
    if (car.ai && this.opts.teamPace) car.ai.pace *= this.opts.teamPace[teamIdx] || 1;
    if (car.ai && this.opts.aiSetup?.[teamIdx]) car.ai.pace = this.opts.aiSetup[teamIdx].pace; // (as fast as they were in qualifying)
    // starting tyres
    let start = this.rain ? 'wet' : 'medium';
    if (isPlayer && this.opts.startTyre && this.opts.startTyre !== 'auto') start = this.opts.startTyre;
    if (isPlayer && mods && mods.softs && !this.rain) start = 'soft';
    if (isPlayer && (this.mode === 'quali' || this.mode === 'practice') && !this.rain) start = 'soft'; // (sessions: a fresh set of the fastest tyre)
    if (car.ai) { car.plan = this.planStrategy(); start = car.plan.stints[0].c; }
    phys.fitTyres(start); model.setCompound(start);
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
    if (this.opts.team !== 'garage' && this.opts.team !== undefined) Object.assign(cfg, { main: team.main, accent: team.accent, third: teamCar(team, teamIdx).third, helmet: team.helmet, sponsor: team.name.split(' ')[0] });
    return cfg;
  }
  previewCar(cfg) {
    const pl = this.player; if (!pl) return;
    const model = buildF1(this.playerCfg(cfg, pl.team, pl.teamIdx), { texSize: 1024 });
    model.pull = pl.phys.pull;
    model.group.add(model.shadow); model.shadow.position.y = 0.03;
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
    this.lineV = this.limitsFor(id);
    const meta = this.limitMeta && this.limitMeta[id];
    if (meta) { this.wearPerM = meta.w; this.refGrip = meta.g; }
    // (online the host's lobby car decides the AI field, so only your car changes)
    const all = !this.net && (this.opts.aiChassis || 'class') === 'class' && CARS[id].cls !== before;
    for (const old of all ? [...this.cars] : [this.player]) this.rebuildCar(old, old.isPlayer && old.extra.cfg ? { ...old.extra, cfg: { ...cfg } } : old.extra);
    this.player = this.cars.find(c => c.isPlayer); this.focus = this.player;
    if (this.lineMesh) { this.scene.remove(this.lineMesh); this.lineMesh.geometry.dispose(); this.lineMesh.material.dispose(); this.buildRacingLine(); }
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
    const prev = car.idx;
    car.idx = best;
    // segment projection
    let i = best;
    let along = (p.x - T.X[i]) * T.FX[i] + (p.z - T.Z[i]) * T.FZ[i];
    if (along < 0) { i = (i - 1 + N) % N; along += T.ds; }
    car.i = i; car.f = Math.max(0, Math.min(1, along / T.ds));
    car.s = (p.x - T.X[best]) * T.RX[best] + (p.z - T.Z[best]) * T.RZ[best];
    car.dist = Math.sqrt(bd);
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
      if (this.quali && car.pitting) { car.lap = 0; car.cpNext = 1; car.lapInvalid = null; car.trace = null; return; }
      if (car.lap === 0) { car.lap = 1; car.lapStart = this.raceTime; car.cpNext = 1; car.lapInvalid = null; car.trace = null; }
      else if (car.cpNext >= 4) this.completeLap(car);
    }
    if (car.isPlayer && car.lap > 0) this.traceLap(car, cur);
  }

  // point-to-point: the clock starts when you cross the start line, the run ends at the finish line
  // (checkpoints every quarter of the way make sure you actually drove it)
  onIndexOpen(car, prev, cur) {
    const T = this.T, F = T.finish, q = F / 4, onRoute = (i) => i <= T.cut;
    if (car.lap === 0) {
      if (!onRoute(prev) && onRoute(cur) && cur < F / 2) { car.lap = 1; car.lapStart = this.raceTime; car.cpNext = 1; car.lapInvalid = null; car.trace = null; }
      return;
    }
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
    car.idx = g.idx; car.lap = 0; car.cpNext = 1; car.runoffT = 0; car.lapInvalid = null; if (car.tl) car.tl.out = false;
    if (car.skL) car.skL = null; if (car.skR) car.skR = null;
    this.updateTracker(car, true);
    this.placeModel(car, 1);
    if (car === this.focus) this.snapCamera();
  }

  // time into the lap at every point of it (your best lap's is kept: the live delta on the HUD)
  traceLap(car, idx) {
    if (!car.trace) { car.trace = new Float32Array(this.T.N).fill(NaN); }
    car.trace[idx] = this.raceTime - car.lapStart;
  }
  liveDelta(car) {
    if (!car.bestTrace || car.lap === 0 || car.pitting || car.finished || car.lapInvalid) return null;
    const ref = car.bestTrace[car.idx];
    if (isNaN(ref)) return null;
    return this.raceTime - car.lapStart - ref;
  }

  // ---------- qualifying ----------
  // You on a clear track against the clock; the AI field's laps come from the physics (simLap) at the pace each of them
  // would race at, posted two or three times over the session like real runs. Out of the pit box to start.
  qualiStart() {
    const q = this.quali; if (!q || q.started) return;
    q.started = true;
    const R = Math.random, pl = this.player, dur = q.time;
    // the field
    q.field = this.qualiTeams.map((t) => {
      const team = TEAMS[t], id = carId({ ...teamCar(team, t), chassis: this.aiChassisFor(t) });
      // (the same driver all weekend: practice hands its pace / power on to qualifying through opts.aiSetup)
      const pre = this.opts.aiSetup && this.opts.aiSetup[t];
      const pace = pre ? pre.pace : this.diff.pace * (1 - R() * this.diff.spread) * (this.opts.teamPace ? this.opts.teamPace[t] || 1 : 1);
      const power = pre ? pre.power : this.diff.power * (1 - R() * this.diff.spread * 0.5);
      let pot = this.simLap(id, { pace, power, grip: this.diff.grip, tyre: 'soft' });
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
      return { teamIdx: t, name: team.driver, team, color: team.main, id, pace, power, pot, plan, best: Infinity, when: Infinity };
    });
    // you start in your garage (point-to-point, no pit lane: on the grid, runs from there)
    if (pl && !this.T.open) this.enterGarage(pl, true);
  }
  // ---------- the garage (practice / qualifying) ----------
  // in the garage your car is off the track (gone, like a retired car, but only until you go out); the session goes on
  enterGarage(car, first = false) {
    car.inGarage = true; car.gone = true; car.model.group.visible = false;
    car.pitting = false; car.pitPhase = null; car.pitReq = null; car.lap = 0; car.cpNext = 1; car.trace = null; car.lapInvalid = null;
    car.phys.vx = car.phys.vz = car.phys.r = 0;
    this.events.push({ type: 'garage', first });
  }
  // what the crew would have to do, in seconds of session time per part (a bent wing is quicker than a broken one)
  garageWork(car) {
    const d = car.phys.dmg, t = (x, base, per) => x > 0.03 ? Math.round(base + per * Math.min(1, x)) : 0;
    return { fw: t(d.fw, 60, 90), rw: t(d.rw, 90, 120), ch: t(d.ch, 120, 300) };
  }
  // fix everything: the session clock runs on meanwhile. Returns the seconds it took.
  garageRepair(car) {
    const w = this.garageWork(car), tot = w.fw + w.rw + w.ch;
    if (!tot) return 0;
    this.skipTime(tot);
    car.phys.dmg = { fw: 0, rw: 0, ch: 0 }; car.model.setDamage(car.phys.dmg);
    return tot;
  }
  // back out: 'flying' = straight onto a flying lap, 'drive' = down the pit lane from the box and an out lap.
  // tyre: a new set to fit first (TYRE_FIT seconds of the session), or null to keep the set on the car
  leaveGarage(car, how, tyre) {
    if (tyre) { this.skipTime(TYRE_FIT); car.phys.fitTyres(tyre); car.model.setCompound(tyre); }
    car.inGarage = false; car.gone = false; car.model.group.visible = true;
    if (how === 'drive' && this.pit) {
      const pit = this.pit, b = pit.boxes[car.teamIdx % pit.boxes.length], T = this.T;
      const off = pit.side * (pit.CEN[b] + 2.4);
      car.phys.place(T.X[b] + T.RX[b] * off, T.Z[b] + T.RZ[b] * off, Math.atan2(T.FX[b], T.FZ[b]));
      car.idx = b; car.laneSide = undefined; this.updateTracker(car, true);
      car.pitting = true; car.pitPhase = 'out'; car.pitReq = null; car.lap = 0;
      this.placeModel(car, 1); this.snapCamera();
    } else this.flyingStart(car);
    this.focus = car;
  }
  // the garage's 'skip ahead': the clock jumps on, the AI's laps in that time go up
  skipTime(sec) {
    const q = this.quali; if (!q || q.done) return;
    q.left = Math.max(1, q.left - sec);
    const el = q.time - q.left;
    for (const e of q.field) for (const r of e.plan) if (!r.done && r.at <= el) this.qualiPost(e, r);
  }
  // put a car on the racing line at the apex of the last corner (or ~250 m before the line), at the speed it would
  // carry there on a normal lap, in the right gear
  flyingStart(car) {
    const T = this.T, N = T.N, LV = car.lineV || this.lineV, list = this.corners.list;
    const last = list.length ? list[list.length - 1] : null;
    const back = last ? ((N - last.apex) % N) * T.ds : Infinity;
    const i = last && back > 60 && back < T.L * 0.5 ? last.apex : (N - Math.round(Math.min(250, T.L * 0.25) / T.ds)) % N;
    const p = car.phys, v = Math.max(12, LV[i] * 0.95), o = this.line[i];
    p.place(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o, Math.atan2(T.FX[i], T.FZ[i]));
    p.vx = T.FX[i] * v; p.vz = T.FZ[i] * v;
    const G = p.p.gears; let g = 1; while (g < G.length - 1 && v > G[g] * 0.92) g++;
    p.gear = g;
    car.idx = i; car.pitting = false; car.pitPhase = null; car.pitReq = null; car.lap = 0; car.cpNext = 1; car.laneSide = undefined;
    if (car.isPlayer) car.autoT = 2; // (the first two seconds drive themselves, so you're not thrown in at speed cold)
    this.updateTracker(car, true);
    this.placeModel(car, 1); this.snapCamera();
  }
  qualiUpdate(dt) {
    const q = this.quali; if (!q || !q.started || q.done || this.state !== 'racing') return;
    q.left = Math.max(0, q.left - dt);
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
    const rows = q.field.map(e => ({ key: e.teamIdx, name: e.name, team: e.team.name, color: e.color, best: e.best, when: e.when, flash: e.flash, isPlayer: false }));
    if (pl) rows.push({ key: 'P', name: pl.name, team: pl.team.name, color: pl.team.main, best: pl.best, when: pl.bestWhen ?? Infinity, flash: pl.bestWhen, isPlayer: true });
    rows.sort((a, b) => a.best - b.best || a.when - b.when || (a.isPlayer ? 1 : -1));
    const pole = rows[0] && isFinite(rows[0].best) ? rows[0].best : null;
    rows.forEach((r, k) => { r.pos = k + 1; r.gap = pole && isFinite(r.best) && k ? r.best - pole : null; });
    return rows;
  }
  // what the race after qualifying needs: the grid, the same AI teams, and each AI driver as fast as they were
  qualiGrid() {
    const q = this.quali;
    return {
      gridOrder: this.qualiRows().map(r => r.key),
      roster: q.field.map(e => e.teamIdx),
      aiSetup: Object.fromEntries(q.field.map(e => [e.teamIdx, { pace: e.pace, power: e.power }])),
    };
  }

  completeLap(car) {
    const t = this.raceTime - car.lapStart;
    // (a lap where you broke track limits doesn't count as your best: race control deletes it)
    const valid = !car.lapInvalid;
    car.lapTimes.push(t);
    (car.lapValid || (car.lapValid = [])).push(valid);
    car.last = t; car.lastInvalid = !valid;
    const wasBest = valid && t < car.best;
    if (wasBest) { car.best = t; car.bestWhen = this.raceTime; if (car.trace) car.bestTrace = car.trace; }
    if (car.isPlayer && this.rec) this.recordLap(car, t, valid);
    car.lapInvalid = null; car.trace = null;
    car.lapStart = this.raceTime;
    car.cpNext = 1;
    car.lap++;
    if (car.isPlayer) this.events.push({ type: 'lap', time: t, best: wasBest, lap: car.lap, laps: this.laps, invalid: !valid });
    if (car.isPlayer && this.quali && this.quali.flag) this.qualiEnd();
    if (car.lap > this.laps && !car.finished) {
      car.finished = true; car.finishTime = this.raceTime;
      this.addFinish(car);
      if (car.isPlayer) { this.events.push({ type: 'finish', pos: this.finishOrder.length, pen: car.pen || 0 }); this.state = 'finished'; this.stateT = 0; }
    }
  }

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
  // what's at one spot beside / on the track (track point idx, s m from its centre line, world x / z): 'road', 'walk'
  // (a city sidewalk), 'kerb', 'public' (a public road's concrete), 'city' (city concrete), 'grass', 'gravel', 'sand'
  surfaceKind(idx, s, x, z) {
    const T = this.T, A = this.A, env = this.track.env, half = T.W[idx] / 2, as = Math.abs(s);
    if (as <= half) return 'road';
    const side = s < 0 ? -1 : 1, we = walkEdge(T, A, env, idx, side);
    if (we >= 0 && as >= we && as <= we + walkWidth(T, A, env, idx, side)) return 'walk';
    const pit = this.pit;
    if (pit && pit.REG[idx] >= 0 && s * pit.side > half) return 'road';
    if (A.KERB[idx] && as < half + 1.3) return 'kerb';
    if (A.BRIDGE[idx]) return 'road';
    if (this.world.roadAt(x, z)) return 'public';
    if (this.world.paintAt(x, z) > 0.5) return 'grass'; // painted grass
    if (env.theme === 'city') return 'city';
    if (Math.abs(T.K[idx]) > 1 / 90) return 'gravel';
    if (env.theme === 'desert') return 'sand';
    if (env.theme === 'coast' && this.world.groundHeight(x, z) < 1.2) return 'sand';
    return 'grass';
  }
  // the ground's height at one spot relative to the road surface, m: kerbs ramp up and rumble in time with their stripes
  // (d: distance along the track), a sidewalk is a step up, off-road sits lower (eased down over the first metre past
  // the edge) and grass / gravel / sand are bumpy
  // (x, z: world position, for a public road's sidewalks)
  groundZ(kind, idx, s, d, x = 0, z = 0) {
    if (kind === 'road') return 0;
    if (kind === 'public') return this.world.streetStep?.(x, z) ?? 0;
    const T = this.T, A = this.A, half = T.W[idx] / 2, as = Math.abs(s);
    if (kind === 'kerb') return KERB_H * Math.min(1, Math.max(0, (as - half) / 1.3)) + 0.008 * Math.abs(Math.sin(d * Math.PI / 2));
    if (kind === 'walk') { // (a ramp from the kerb's top, or the road, up to the sidewalk: one smooth climb)
      const we = walkEdge(T, A, this.track.env, idx, s < 0 ? -1 : 1), base = A.KERB[idx] ? KERB_H : 0;
      return base + (WALK_H - base) * Math.min(1, Math.max(0, (as - we) / WALK_RAMP));
    }
    const kerb = A.KERB[idx], edge = half + (kerb ? 1.3 : 0), t = Math.min(1, Math.max(0, (as - edge) / 1.2));
    const rough = kind === 'city' ? 0 : 0.01 * t * (Math.sin(1.57 * d + 1.3 * s) + Math.sin(0.9 * d - 0.7 * s)); // (undulations ~4 and ~7 m long)
    return (kerb ? KERB_H : 0) * (1 - t) - 0.08 * t + rough;
  }

  surfaceEnv(car) {
    const T = this.T, i = car.i, j = i === T.cut ? i : (i + 1) % T.N, p = car.phys;
    const kind = this.surfaceKind(car.idx, car.s, p.x, p.z), [mu, drag] = SURFACES[kind];
    car.surface = kind === 'public' || kind === 'city' ? 'concrete' : kind;
    car.publicRoad = kind === 'public';
    car.onRoad = kind === 'road' || kind === 'kerb' || kind === 'walk';
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
    if (Math.abs(car.s) + 2 < T.W[car.idx] / 2) { if (!G.flat) { G.mu.fill(1); G.drag.fill(0); G.z.fill(0); G.flat = true; } return G; }
    G.flat = false;
    const i0 = car.idx, sn = Math.sin(p.h), cs = Math.cos(p.h), tw = p.susp.tw, d0 = T.D[car.i] + car.f * T.ds;
    for (let w = 0; w < 4; w++) {
      const xw = w < 2 ? P.a : -P.b, yw = (w & 1 ? -1 : 1) * tw / 2;
      const dx = sn * xw + cs * yw, dz = cs * xw - sn * yw; // (the car's +v side is world (cos h, -sin h))
      const along = dx * T.FX[i0] + dz * T.FZ[i0], sW = car.s + dx * T.RX[i0] + dz * T.RZ[i0];
      const iW = (i0 + Math.round(along / T.ds) + N) % N;
      const kind = this.surfaceKind(iW, sW, p.x + dx, p.z + dz), sf = SURFACES[kind];
      G.mu[w] = sf[0]; G.drag[w] = sf[1]; G.z[w] = this.groundZ(kind, iW, sW, d0 + along, p.x + dx, p.z + dz);
      if (kind === 'kerb') car.rumble = 1;
    }
    return G;
  }

  barriers(car) {
    const T = this.T, A = this.A, p = car.phys, i = car.idx;
    const half = 1.0;
    if (T.open && (i === T.cut || i === (T.cut + 1) % T.N)) { // the walls across the road at a point-to-point's two ends
      const dir = i === T.cut ? 1 : -1, fx = T.FX[i] * dir, fz = T.FZ[i] * dir;
      const hit = (p.x - T.X[i]) * fx + (p.z - T.Z[i]) * fz - (OPEN_END_WALL - 2.4);
      if (hit > 0) { p.x -= fx * hit; p.z -= fz * hit; this.bounce(car, fx, fz, 0, hit); }
    }
    let hit = 0, side = 0;
    const lr = A.BR[i] - half, ll = A.BL[i] - half;
    if (A.HAS_R[i] && car.s > lr) { hit = car.s - lr; side = 1; }
    else if (A.HAS_L[i] && car.s < -ll) { hit = -ll - car.s; side = -1; }
    if (!side) return;
    const rx = T.RX[i] * side, rz = T.RZ[i] * side;
    p.x -= rx * hit; p.z -= rz * hit;
    car.s -= side * hit;
    this.bounce(car, rx, rz, side, hit);
  }

  // pit wall between the track and the pit lane
  pitWall(car) {
    const pit = this.pit; if (!pit) return;
    const i = car.idx, w = pit.WALL[i];
    const ss = car.s * pit.side;
    if (isNaN(w)) { car.laneSide = ss > this.T.W[i] / 2 + 0.3; return; }
    if (car.laneSide === undefined) car.laneSide = ss > w;
    const T = this.T;
    if (car.laneSide && ss < w + 1.0) { const d = w + 1.0 - ss; const rx = -T.RX[i] * pit.side, rz = -T.RZ[i] * pit.side; car.phys.x -= rx * d; car.phys.z -= rz * d; car.s += pit.side * d; this.bounce(car, rx, rz, -pit.side, d); }
    else if (!car.laneSide && ss > w - 1.0) { const d = ss - (w - 1.0); const rx = T.RX[i] * pit.side, rz = T.RZ[i] * pit.side; car.phys.x -= rx * d; car.phys.z -= rz * d; car.s -= pit.side * d; this.bounce(car, rx, rz, pit.side, d); }
  }

  bounce(car, rx, rz, side) {
    const p = car.phys;
    const vn = p.vx * rx + p.vz * rz;
    if (vn > 0) {
      car.impact = Math.max(car.impact || 0, vn); // (drift scoring: a hard hit loses the chain)
      if (vn > 3) car.hits = (car.hits || 0) + 1; // (telemetry: where a lap hit something)
      this.crashed(car, vn);
      p.vx -= rx * vn * 1.3; p.vz -= rz * vn * 1.3;
      const k = Math.max(0.55, 1 - vn * 0.02);
      p.vx *= k; p.vz *= k;
      p.r = p.r * 0.5 + side * vn * 0.015 * (Math.random() < 0.5 ? 1 : -1);
      if (vn > 5 && this.damageK > 0) {
        // which end hit the wall?
        const fwd = Math.sin(p.h) * rx + Math.cos(p.h) * rz;
        const amt = Math.min(1, (vn - 5) / 28) * this.damageK;
        if (fwd > 0.5) { this.damage(car, 'fw', amt * 0.8); this.damage(car, 'ch', amt * 0.25); }
        else if (fwd < -0.5) { this.damage(car, 'rw', amt * 0.8); this.damage(car, 'ch', amt * 0.25); }
        else { this.damage(car, 'ch', amt * 0.6); this.damage(car, Math.random() < 0.5 ? 'fw' : 'rw', amt * 0.3); }
      }
      if (vn > 2 && car.hitCd <= 0) {
        car.hitCd = 0.3;
        const dist = car.isPlayer ? 1 : Math.max(0, 1 - this.camera.position.distanceTo(car.model.group.position) / 80);
        if (dist > 0) sfx.hit(Math.min(1, vn / 25) * dist);
        if (car === this.focus) this.shake = Math.min(1, this.shake + vn / 20);
        this.particles.burst(p.x + rx * 1, car.y + 0.5, p.z + rz * 1, 8, this.track.env.barrier === 'tires' ? 0x333333 : 0xcccccc, 3);
        if (vn > 7) this.sparks(p.x + rx, car.y + 0.3, p.z + rz, Math.min(24, vn));
      }
    }
  }

  // a hard hit (race control: a big one brings out the yellow flags)
  crashed(car, v) {
    if (v < 12) return;
    if (!car.crashT || this.raceTime - car.crashT > 1.5 || v > car.crashV) { car.crashT = this.raceTime; car.crashV = v; }
  }

  damage(car, part, amt) {
    if (amt <= 0) return;
    amt *= car.dmgK || 1;
    const d = car.phys.dmg, before = d[part];
    car.phys.addDamage(part, amt);
    car.maxDmg = Math.max(car.maxDmg || 0, d.fw, d.rw, d.ch);
    car.model.setDamage(d);
    if (before < 0.72 && d[part] >= 0.72 && part !== 'ch') {
      // wing breaks off: debris
      this.particles.burst(car.phys.x, car.y + 0.4, car.phys.z, 10, 0x222222, 1.2);
      if (this.rc && !car.remote) this.rc.debris(car);
      if (car.isPlayer) this.events.push({ type: 'radio', msg: `${part === 'fw' ? 'Front' : 'Rear'} wing is gone! Box for a new one.`, big: true });
    } else if (car.isPlayer && before < 0.3 && d[part] >= 0.3) {
      this.events.push({ type: 'radio', msg: part === 'ch' ? 'Suspension damage — the car will pull and feel slower.' : `${part === 'fw' ? 'Front' : 'Rear'} wing damage, we've lost downforce.` });
    }
  }

  sparks(x, y, z, n) { for (let k = 0; k < n; k++) this.particles.spawn(x, y, z, 0xffc040, 0.5, (Math.random() - 0.5) * 10, 3 + Math.random() * 3, (Math.random() - 0.5) * 10, 1, 3); }

  collideCars() {
    const cars = this.cars;
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const ra = cars[a].remote, rb = cars[b].remote;
      if ((ra && rb) || cars[a].gone || cars[b].gone) continue;
      if (this.T.open && (cars[a].lap > 1 || cars[b].lap > 1)) continue; // (point-to-point: done cars park in the run-off)
      if ((cars[a].pitPhase === 'stop' && cars[b].pitting) || (cars[b].pitPhase === 'stop' && cars[a].pitting)) continue;
      const wa = ra ? 0 : rb ? 1 : 0.5, wb = 1 - wa; // share of the push each car takes
      const A = cars[a].phys, B = cars[b].phys;
      const dx0 = B.x - A.x, dz0 = B.z - A.z;
      if (dx0 * dx0 + dz0 * dz0 > 49) continue;
      if (Math.abs(cars[a].y - cars[b].y) > 3) continue;
      const cA = [[Math.sin(A.h) * 1.4, Math.cos(A.h) * 1.4], [-Math.sin(A.h) * 1.3, -Math.cos(A.h) * 1.3]];
      const cB = [[Math.sin(B.h) * 1.4, Math.cos(B.h) * 1.4], [-Math.sin(B.h) * 1.3, -Math.cos(B.h) * 1.3]];
      for (let ia = 0; ia < 2; ia++) for (let ib = 0; ib < 2; ib++) {
        const oa = cA[ia], ob = cB[ib];
        const ax = A.x + oa[0], az = A.z + oa[1], bx = B.x + ob[0], bz = B.z + ob[1];
        const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), R = 1.9;
        if (d < R && d > 1e-4) {
          const nx = dx / d, nz = dz / d, pen = R - d;
          A.x -= nx * pen * wa; A.z -= nz * pen * wa; B.x += nx * pen * wb; B.z += nz * pen * wb;
          const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
          if (rv < 0) {
            const j = -rv * 1.2, ja = j * wa, jb = j * wb;
            cars[a].impact = Math.max(cars[a].impact || 0, -rv); cars[b].impact = Math.max(cars[b].impact || 0, -rv); // (drift scoring)
            if (-rv > 3) { cars[a].hits = (cars[a].hits || 0) + 1; cars[b].hits = (cars[b].hits || 0) + 1; }
            this.crashed(cars[a], -rv); this.crashed(cars[b], -rv);
            if (-rv > 5 && this.rc) this.rc.contact(cars[a], cars[b], ia, ib, -rv);
            A.vx -= nx * ja; A.vz -= nz * ja; B.vx += nx * jb; B.vz += nz * jb;
            A.r += (Math.random() - 0.5) * ja * 0.04; B.r += (Math.random() - 0.5) * jb * 0.04;
            if (-rv > 2 && (cars[a].isPlayer || cars[b].isPlayer)) { sfx.hit(Math.min(0.7, -rv / 20)); this.shake = Math.min(1, this.shake - rv / 25); }
            if (-rv > 6 && this.damageK > 0 && !cars[a].pitting && !cars[b].pitting) {
              const amt = Math.min(0.5, (-rv - 6) / 34) * this.damageK;
              if (!ra) this.damage(cars[a], ia === 0 ? 'fw' : 'rw', amt);
              if (!rb) this.damage(cars[b], ib === 0 ? 'fw' : 'rw', amt);
              if (-rv > 8) this.sparks((ax + bx) / 2, cars[a].y + 0.3, (az + bz) / 2, 10);
            }
          }
        }
      }
    }
  }


  // ---------- strategy & pit stops ----------
  // laps a compound lasts before it hits the 30% cliff (usage calibrated from test laps)
  tyreLife(c) {
    if (!this.wearK) return Infinity;
    // practice runs at the absolute limit; racing laps work the tyres ~10% less
    const perM = TYRES[c].rate * this.wearK * (this.wearPerM || 1) * 0.9 * (c === 'wet' && !this.rain ? 3 : 1);
    return 0.7 / perM / this.T.L;
  }
  planStrategy() {
    const R = this.laps;
    if (!isFinite(R) || !this.wearK) return { stints: [{ c: this.rain ? 'wet' : ['soft', 'medium'][Math.floor(Math.random() * 2)], laps: R }] };
    const opts = this.strategyOptions();
    if (!opts.length) return { stints: [{ c: this.rain ? 'wet' : 'hard', laps: R }] };
    // teams pick from the few best plans so the field splits strategies
    const top = opts.filter(o => o.cost < opts[0].cost + 8).slice(0, 4);
    return top[Math.floor(Math.random() * top.length)];
  }
  // every sensible 1-3 stint plan, cheapest (projected fastest) first
  strategyOptions() {
    const R = this.laps;
    if (!isFinite(R)) return [];
    const pool = this.rain ? ['wet'] : ['soft', 'medium', 'hard'];
    const lap = this.T.L / 50;
    const pace = { soft: -0.022 * lap, medium: 0, hard: 0.016 * lap, wet: 0 };
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
    for (const a of pool) { consider([a]); for (const b of pool) { consider([a, b]); for (const c of pool) consider([a, b, c]); } }
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
    const base = this.baseLap(), pace = { soft: -0.022, medium: 0, hard: 0.016, wet: this.rain ? 0 : 0.09 };
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
      const list = this.rain ? ['wet'] : ['soft', 'medium', 'hard'];
      return list.map((c, k) => ({ key: c, title: `${c[0].toUpperCase() + c.slice(1)} Tyres`, plan: { stints: [{ c, laps: isFinite(R) ? R : 1 }] },
        desc: k === 0 ? 'Tyre wear is off, so the fastest compound is the obvious pick.' : c === 'wet' ? 'Full wets for the rain.' : 'Tyre wear is off: a slower compound for no reason. Brave.' }));
    }
    const opts = this.strategyOptions();
    const out = [];
    const clone = (p) => ({ stints: p.stints.map(s => ({ ...s })) });
    const sig = (p) => p.stints.map(s => s.c[0] + s.laps).join('-');
    if (!opts.length) {
      const c = this.rain ? 'wet' : 'hard';
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
    const nx = this.nextPlannedStop(car); if (!nx) return;
    const T = this.T, toEntry = ((pit.start - car.idx + T.N) % T.N) * T.ds;
    const key = 'stop' + car.pits;
    if (car.lap === nx.lap && toEntry < 700 && !car.planRadio[key]) {
      car.planRadio[key] = true;
      car.pitReq = { tyre: nx.tyre, repair: false };
      this.events.push({ type: 'radio', msg: `Box, box! Box this lap for <b>${nx.tyre.toUpperCase()}S</b>.`, big: true });
    }
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
    const dmg = Math.max(p.dmg.fw, p.dmg.rw);
    const plan = car.plan;
    let due = false;
    if (plan && plan.stints.length > 1) {
      let lapsDone = 0;
      for (let k = 0; k <= car.pits; k++) lapsDone += plan.stints[Math.min(k, plan.stints.length - 1)].laps;
      due = car.pits < plan.stints.length - 1 && car.lap >= lapsDone;
      // a stop under the VSC costs half as much: take it if it was coming up in the next few laps
      if (!due && this.rc && this.rc.vscOn() && car.pits < plan.stints.length - 1 && lapsDone - car.lap <= 4 && left > 3) due = true;
    }
    const need = worst < 0.3 && left > 2 || dmg > 0.45 && left > 2 || (this.rain && p.tyre.c !== 'wet') || (!this.rain && p.tyre.c === 'wet' && left > 2);
    if (!due && !need) return false;
    // next compound
    let next = this.rain ? 'wet' : (plan?.stints[car.pits + 1]?.c || 'medium');
    if (!this.rain && this.tyreLife(next) < left) next = this.tyreLife('hard') >= left ? (this.tyreLife('medium') >= left ? 'medium' : 'hard') : 'hard';
    car.pitReq = { tyre: next, repair: dmg > 0.12 || p.dmg.ch > 0.2 };
    return true;
  }
  serviceTime(car) {
    const r = car.pitReq || {}, d = car.phys.dmg;
    let t = 2.3 + (r.tyre ? 2.2 : 0);
    if (r.repair) t += d.fw * 5 + d.rw * 6 + d.ch * 9;
    return Math.max(1.8, t + (car.pitBonus || 0));
  }
  // driving through the pit lane (player cars are driven automatically, like the F1 games)
  pitControls(car, dt) {
    const T = this.T, N = T.N, pit = this.pit, p = car.phys, u = Math.max(0, p.u);
    const Ld = 4 + u * 0.3;
    const j = (car.idx + Math.round(Ld / T.ds)) % N;
    const box = pit.boxes[car.teamIdx % pit.boxes.length];
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
    if (pos < 0) { // approaching the entry
      const d = ((pit.start - car.idx + N) % N) * T.ds + limitAt * T.ds;
      vt = Math.min((car.lineV || this.lineV)[car.idx] * 0.95, Math.sqrt(pit.speed ** 2 + 2 * 11 * d));
    } else if (pos < limitAt) vt = Math.sqrt(pit.speed ** 2 + 2 * 11 * (limitAt - pos) * T.ds);
    else if (pos <= limitEnd) vt = pit.speed * 0.97;
    else vt = (car.lineV || this.lineV)[car.idx];
    const through = car.pitReq && car.pitReq.dt; // (a drive-through: past the box at the limiter)
    if (car.pitPhase === 'in' && toBox < 200 && !through) vt = Math.min(vt, Math.sqrt(2 * 8 * Math.max(0, toBox - 0.3)));
    if (car.pitPhase === 'in' && fromBox < 8 && !through) vt = 0; // rolled just past the box: stop, the crew will come to you
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
  pitUpdate(car, dt) {
    const pit = this.pit; if (!pit || car.finished || car.remote || car.gone) return;
    const T = this.T, N = T.N, pos = pit.REG[car.idx];
    const ss = car.s * pit.side;
    if (!car.pitting) {
      // decision point ~250m before the entry (AI) / actually driving in (player)
      const toEntry = ((pit.start - car.idx + N) % N) * T.ds;
      if (car.ai && toEntry < 250 && toEntry > 200 && !car.pitChecked) { car.pitChecked = true; if ((this.state === 'racing' || this.state === 'finished') && this.aiWantsPit(car)) car.pitting = true; }
      if (pos >= 0) car.pitChecked = false;
      // you're in once you pass the pit entry line where the wall starts, on the lane side of it; before that you can
      // still steer back onto the track
      const commit = pit.commitAt ?? 0;
      if (car.isPlayer && pos >= commit && pos < commit + Math.round(30 / T.ds) && (commit ? car.laneSide === true : ss > T.W[car.idx] / 2 + 0.2) && this.state === 'racing') {
        car.pitting = true;
        const p = car.phys, dmg = Math.max(p.dmg.fw, p.dmg.rw, p.dmg.ch);
        // (owing a drive-through: this visit is it, no work allowed)
        car.pitReq = car.dt ? { dt: true } : this.quali ? { garage: true } : { tyre: car.pitReq?.tyre || this.nextPlannedStop(car)?.tyre || (this.rain ? 'wet' : p.tyre.c), repair: dmg > 0.05 };
        this.events.push({ type: 'pitIn' });
      }
      if (car.pitting) car.pitPhase = 'in';
      return;
    }
    // safety nets: missed the lane (on the track side of the pit wall), or stuck against a barrier
    if (car.pitPhase !== 'stop') {
      const onTrackSide = !isNaN(pit.WALL[car.idx]) && car.laneSide === false;
      car.pitStuck = car.phys.speed < 1 ? (car.pitStuck || 0) + dt : 0;
      if (onTrackSide || car.pitStuck > 6) {
        if (car.pitStuck > 6) this.resetCar(car);
        car.pitting = false; car.pitPhase = null; car.pitStuck = 0; car.laneSide = undefined;
        if (car.isPlayer && car.pits === 0 && car.pitReq) this.events.push({ type: 'radio', msg: 'We missed the pit entry. Box next lap.' });
        return;
      }
    }
    if (car.pitPhase === 'in') {
      const box = pit.boxes[car.teamIdx % pit.boxes.length];
      const d = ((box - car.idx + N) % N) * T.ds;
      // at the box: stop (also if it arrives a touch quick or rolls a few metres past)
      if (car.pitReq && car.pitReq.garage) { if ((d < 1.5 || d > T.L - 6) && car.phys.speed < 3) this.enterGarage(car); } // (sessions: into the garage)
      else if (car.pitReq && car.pitReq.dt) {
        // drive-through: served once past your box (no stop, and it isn't a pit stop for the strategy)
        if (d < 2 || d > T.L - 30) { car.pitPhase = 'out'; this.rc.driveThroughServed(car); }
      } else if ((d < 1.5 || d > T.L - 6) && car.phys.speed < 3) {
        // time penalties are served first: the crew can't touch the car until they're up
        const pen = car.pen || 0;
        car.pitPhase = 'stop'; car.penServing = pen; car.pen = 0;
        car.pitTimer = this.serviceTime(car) + pen + Math.random() * 0.4; car.pitTotal = car.pitTimer;
        if (pen && car.isPlayer) this.events.push({ type: 'radio', msg: `Serving your <b>${pen} second penalty</b>, then the crew goes to work.` });
      }
      if (pos < 0 && ((car.idx - pit.end + N) % N) < 50) { car.pitting = false; car.pitPhase = null; } // somehow missed the lane
    } else if (car.pitPhase === 'stop') {
      car.pitTimer -= dt;
      if (car.pitTimer <= 0) {
        const r = car.pitReq || {};
        if (r.tyre) { car.phys.fitTyres(r.tyre); car.model.setCompound(r.tyre); }
        if (r.repair) { car.phys.dmg = { fw: 0, rw: 0, ch: 0 }; car.model.setDamage(car.phys.dmg); }
        car.pits++; car.pitPhase = 'out'; car.radio = {}; car.penServing = 0;
        if (car.isPlayer) this.events.push({ type: 'pitOut', time: car.pitTotal });
      }
    } else if (car.pitPhase === 'out') {
      if (pos < 0 || pos >= pit.count - 2) { car.pitting = false; car.pitPhase = null; }
    }
  }
  // cars close behind another car in a straight line get a tow (less drag)
  slipstream(dt) {
    const T = this.T, cars = this.cars;
    for (const c of cars) {
      if (c.remote) continue;
      let best = 0;
      if (!c.pitting && c.phys.speed > 25) for (const o of cars) {
        if (o === c || o.pitting || o.gone) continue;
        const gap = o.progress - c.progress;
        if (gap <= 3 || gap > 45) continue;
        if (Math.abs(o.s - c.s) > 2.6) continue;
        best = Math.max(best, 1 - (gap - 3) / 42);
      }
      const target = Math.min(1, best * (c.slipK || 1));
      c.phys.slip += (target - c.phys.slip) * Math.min(1, dt * 3);
    }
  }

  // team radio about tyres for the player
  tyreRadio(car) {
    if (!this.wearK || car.finished) return;
    const w = Math.min(car.phys.tyre.wf, car.phys.tyre.wr);
    if (w < 0.4 && !car.radio.t40) { car.radio.t40 = true; this.events.push({ type: 'radio', msg: 'Tyres are starting to go off. Box when you can.' }); }
    if (w < 0.25 && !car.radio.t25) { car.radio.t25 = true; this.events.push({ type: 'radio', msg: 'Tyres are gone! <b>Box, box!</b>', big: true }); }
  }

  // ---------- online ----------
  // intro -> lights -> go, all driven by the host's clock so every screen starts together
  netClock() {
    const net = this.net, since = (net.clock() - net.t0) / 1000, e = since - (net.pick || 0) - (net.strat || 0);
    const goAt = 3.2 + net.goDelay;
    if (this.state === 'finished') { this.raceTime = Math.max(this.raceTime, e - goAt); return; }
    if (since < (net.pick || 0) && this.player && !this.pickedCar) { this.state = 'carselect'; this.stateT = net.pick - since; return; } // car pick: seconds left
    if (e < 0 && this.player) { this.state = 'strategy'; this.stateT = -e; return; } // strategy window: seconds left
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
        dm: [r2(p.dmg.fw), r2(p.dmg.rw), r2(p.dmg.ch)], dnf: c.gone ? 1 : 0,
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
    if ((s.pt || 0) !== (car.penTotal || 0)) this.rc.remotePenalty(car, s.pt || 0);
    if ((s.dn || 0) !== (car.dtTotal || 0)) this.rc.remoteDriveThrough(car, s.dn || 0);
    if (s.dq) car.dsq = true;
    if (s.best) car.best = s.best;
    car.last = s.last;
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
    let threat = null;
    ai.over *= 1 - Math.min(1, dt * 0.4);
    if (ai.aggr === undefined) ai.aggr = 0.35 + Math.random() * 0.65;
    // yellow flags here or just ahead: lift, and no overtaking
    const fa = this.rc && this.state === 'racing' ? this.rc.flagAhead(car.idx) : null;
    const yellow = fa && (fa.f === 'y' || fa.f === 'dy' || fa.f === 'vsc') ? fa.f : null;
    if (yellow) ai.over *= 1 - Math.min(1, dt * 2);
    // blue flag: on a straight, move over to the side away from the car lapping us
    if (car.blue && Math.abs(T.K[car.idx]) < 1 / 300) {
      const side = car.s >= car.blue.s ? 1 : -1, want = side * (T.W[car.idx] / 2 - 1.6) - this.line[car.idx];
      ai.over += (want - ai.over) * Math.min(1, dt * 1.5);
    }
    const oops = this.aiMistake(car, dt);
    for (const o of this.cars) {
      if (o === car || o.gone || o.pitting) continue;
      const gap = o.progress - car.progress, ds = o.s - car.s;
      if (gap < -30 || gap > 45) continue;
      // alongside (overlapping): never steer into them, leave a car's width
      if (gap > -5.5 && gap < 5.5 && Math.abs(ds) > 1.8 && Math.abs(ds) < 4.2) {
        if (ds > 0) maxOff = Math.min(maxOff, o.s - 2.6); else minOff = Math.max(minOff, o.s + 2.6);
        continue;
      }
      // a car close behind and quicker: defend
      if (gap < -5.5 && gap > -25 && o.phys.u > u - 2.5) { if (!threat || gap > threat.gap) threat = { o, gap }; continue; }
      if (gap <= 0) continue;
      // a car ahead in our lane: brake in time to not hit it, or go around it
      if (Math.abs(ds) < 2.4) {
        if (u > o.phys.u - 0.5 && gap < 28 && (!yellow || (o.rc && o.rc.hold > 0) || o.phys.speed < 10 || (o.giveBack && o.giveBack.car === car))) {
          const room = T.W[car.idx] / 2 - 2;
          const dir = o.s > this.line[car.idx] ? -1 : 1;
          const want = Math.max(-room, Math.min(room, o.s + dir * 3.2)) - this.line[car.idx];
          ai.over += (want - ai.over) * Math.min(1, dt * 2.5);
        }
        const room = Math.max(0, gap - 6.5);
        slowTo = Math.min(slowTo, Math.sqrt(o.phys.u * o.phys.u + 2 * 16 * room) - (gap < 8 ? 2 : 0));
      }
    }
    // defend: one move to cover the inside of the next corner, then hold it (no weaving)
    let defend = 0;
    // (only from a straight: a move across while still cornering runs the car off the road)
    if (threat && ai.aggr > 0.45 && this.state === 'racing' && Math.abs(T.K[car.idx]) < 1 / 400) {
      let kSum = 0; for (let k = 20; k < 200; k += 4) kSum += T.K[(car.idx + Math.round(k / T.ds)) % N];
      if (Math.abs(kSum) > 0.05) {
        const inside = Math.sign(kSum) * (T.W[car.idx] / 2 - 2.4) * 0.75;
        // only if the attacker is heading for that side (or already sitting in our tow)
        if (Math.sign(threat.o.s - car.s) === Math.sign(kSum) || Math.abs(threat.o.s - car.s) < 1.5) defend = inside;
      }
    }
    ai.def = (ai.def || 0) + ((defend ? defend - this.line[car.idx] : 0) - (ai.def || 0)) * Math.min(1, dt * (defend ? 0.9 : 0.5));
    const Ld = 5 + u * 0.26;
    const j = (car.idx + Math.round(Ld / T.ds)) % N;
    const lim = T.W[j] / 2 - 1.3;
    let off = Math.max(-lim, Math.min(lim, this.line[j] + ai.bias + ai.over + ai.def));
    if (minOff > maxOff) { off = (minOff + maxOff) / 2; slowTo = Math.min(slowTo, Math.max(12, u - 1)); } // squeezed: ease off
    else off = Math.max(minOff, Math.min(maxOff, off));
    off = Math.max(-lim - 0.6, Math.min(lim + 0.6, off));
    // mistake: running wide out of the corner, over the kerb and onto the run-off
    if (oops && oops.type === 'wide' && oops.phase === 1) off = -oops.dir * (lim + oops.far);
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
    const gk = Math.sqrt(p.gripNow() / (this.refGrip || 1) * (1 - 0.4 * Math.max(p.dmg.fw, p.dmg.rw)) * (1 - 0.1 * p.dmg.ch));
    const LV = car.lineV || this.lineV;
    let vt = LV[la] * ai.pace * gk;
    const vt2 = LV[(la + Math.round(15 / T.ds)) % N] * ai.pace * gk;
    vt = Math.min(vt, vt2 + 8);
    if (oops && oops.type === 'late' && oops.phase === 0) vt *= oops.over; // braked too late: carries too much speed in
    // VSC: under the reference pace where the car is now (and where it's heading), slower still if the delta gets tight
    if (yellow === 'vsc') vt = Math.min(vt, Math.min(LV[car.idx], LV[la]) * VSC_PACE * ((car.vscDelta || 0) < 0.4 ? 0.86 : 0.95));
    else if (yellow) vt *= yellow === 'dy' ? 0.86 : 0.95;
    if (car.blue) vt *= 0.93; // being lapped: lift and let them by
    // passed under yellow: lift and let them back past (off the racing line, so they can get by)
    if (car.giveBack) {
      const o = car.giveBack.car, gap = car.progress - o.progress;
      vt = gap < 40 ? Math.min(vt, Math.max(10, o.phys.u - 6)) : vt * 0.85;
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
    const out = Math.sign(p.delta), wide = (car.s - (this.line[car.idx] + ai.bias + ai.over + (ai.def || 0))) * out; // (m outside its line)
    const room = T.W[car.idx] / 2 - car.s * out; // (m to the outside edge)
    if (p.gripF > 0.9 && push > 0.1 && wide > 0.5 && room < 2) throttle *= Math.max(0, 1 - (push - 0.1) * 4 * Math.min(1, wide - 0.5));
    // squeezed on like a driver, not stamped: the throttle comes in over ~0.35 s in a corner (quicker on a straight),
    // the brake trails off rather than dropping; lifting and braking are still instant
    const turning = Math.min(1, Math.abs(steer) * 3);
    ai.thr = throttle > (ai.thr || 0) ? Math.min(throttle, (ai.thr || 0) + dt * (8 - 5 * turning)) : throttle;
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
    if (Math.random() > this.mistakeP * k) return null;
    const r = Math.random();
    const type = r < 0.45 ? 'wide' : r < 0.85 ? 'late' : 'spin';
    ai.errCd = 15;
    ai.err = { type, c: cor, dir: cor.dir, t: 0, phase: 0, dur: 7, over: 1.07 + Math.random() * 0.08, far: 1.5 + Math.random() * 2.5 };
    return ai.err;
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
    if (this.net) this.netClock();
    else if (this.state === 'intro') {
      if (this.stateT > 3.2 || press.skip) { this.state = 'countdown'; this.stateT = 0; this.events.push({ type: 'countdown' }); }
    } else if (this.state === 'countdown') {
      const n = Math.min(5, Math.floor(this.stateT / 0.9));
      if (n > this.lightsOn) { this.lightsOn = n; sfx.light(); this.events.push({ type: 'lights', n }); }
      if (!this.goAt && this.lightsOn >= 5) this.goAt = this.stateT + 0.6 + Math.random() * 1.2;
      if (this.goAt && this.stateT > this.goAt) { this.state = 'racing'; this.stateT = 0; this.lightsOn = 0; sfx.go(); this.events.push({ type: 'go' }); }
    }
    this.world.startLights.forEach((m, k) => m.color.setHex(k < this.lightsOn ? 0xff2010 : 0x220606));

    if (racing && !this.net) this.raceTime += dt;

    // controls
    for (const car of this.cars) {
      if (car.gone) continue;
      if (car.remote) { this.netApply(car, dt); continue; }
      if (car.pitting && this.pit) {
        car.ctl = this.pitControls(car, dt);
      } else if (car.isPlayer) {
        if (this.state === 'finished') car.ctl = this.aiControlsFor(car, dt);
        else if (car.autoT > 0 && this.state === 'racing') { car.autoT -= dt; car.ctl = this.aiControlsFor(car, dt); }
        else car.ctl = this.brakeAssist(car, controls);
      } else {
        car.ctl = this.aiControls(car, dt);
        if (this.state === 'racing' && this.stateT < car.ai.react && this.mode === 'race') car.ctl.throttle = 0;
      }
    }
    if (this.player && press.shiftUp) { this.player.phys.shift(1); sfx.shift(); }
    if (this.player && press.shiftDown) { this.player.phys.shift(-1); sfx.shift(); }
    if (this.player && press.reset && racing && !this.player.finished && !this.player.pitting && !this.player.gone) { if (this.drift && this.drift.active) this.drift.lose('reset'); this.resetCar(this.player); }
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
    for (const car of this.cars) { this.pitUpdate(car, dt); if (car.isPlayer) { this.tyreRadio(car); this.planRadio(car); } }
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
      if (car.finished) car.progress = 1e9 - this.finishOrder.indexOf(car);
      if (car.gone) car.progress = -1e9 - car.startPos;
    }
    // point-to-point outside a race (time trial, menu background): once a run is done, back to the grid
    if (T.open && this.mode !== 'race') for (const car of this.cars) {
      if (car.remote || car.gone || car.lap < 2) continue;
      car.runoffT = (car.runoffT || 0) + dt;
      if ((car.runoffT > 2.5 && car.phys.speed < 4) || car.runoffT > 12) this.restartRun(car);
    }
    const order = [...this.cars].sort((a, b) => b.progress - a.progress);
    order.forEach((c, k) => c.pos = k + 1);
    this.order = order;
    if (this.rc) this.rc.update(dt);
    if (this.quali && !this.paused) this.qualiUpdate(dt);

    // visuals
    if (this.drift && this.player && dt > 0) this.drift.update(dt, this.player, this.state === 'racing' && !this.player.pitting && !this.player.finished && !this.player.gone);
    for (const car of this.cars) if (!car.gone) this.placeModel(car, dt);
    if (this.rec) this.updateGhost(dt);
    this.updateCamera(dt);
    this.world.update(dt, this.camera, this.rain ? this.wetLights() : null, this.cars.filter(c => !c.gone && c.phys).map(c => ({ x: c.phys.x, z: c.phys.z, speed: c.phys.speed || 0, vx: c.phys.vx, vz: c.phys.vz })));
    if (this.spray) this.updateSpray(dt);
    this.skids.update();
    this.updateRacingLine();
    this.updatePitGuide();
    this.particles.update(dt);

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
    if (car.remote) { const kind = this.surfaceKind(car.idx, car.s, p.x, p.z); y += this.groundZ(kind, car.idx, car.s, T.D[car.i] + car.f * T.ds, p.x, p.z); car.rumble = kind === 'kerb' ? 1 : 0; }
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
    m.group.position.set(p.x, y, p.z);
    // suspension: the body rolls / pitches / bounces exactly as the physics' sprung body does (the same springs, dampers
    // and anti-roll bars that set each tyre's load), plus the kerb rumble; the wheels stay planted
    const bump = car.bump || (car.bump = [0, 0, 0, 0]);
    // (each wheel on screen follows its physics wheel; the model's +x side is the physics' left, FL FR RL RR = 0 1 2 3)
    if (p.wz) m.wheels?.forEach((w, k) => { bump[k] = p.wz[(w.front ? 0 : 2) + (w.pivot.position.x > 0 ? 0 : 1)]; });
    m.animate({
      steer: p.delta, spin: p.u * Math.min(dt, 0.05),
      roll: p.roll || 0, pitch: -(p.pitch || 0),
      heave: p.heave || 0, bump,
    });
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
      car[key] = this.skids.add(car[key], mark, wx, y + 0.035, wz, car.onRoad ? 0.55 : 0.35, car.onRoad ? 0x0a0a0a : 0x3a2a18);
    }
    if (dt < 1) {
      const rate = Math.min(1, p.speed / 30);
      if (!car.onRoad && p.speed > 6 && Math.random() < rate) {
        const col = car.surface === 'grass' ? 0x7a6a40 : car.surface === 'concrete' ? 0xa0a0a0 : 0xc49a64;
        this.particles.spawn(p.x - sn * 2.2, y + 0.3, p.z - cs * 2.2, col, 2.5, -p.vx * 0.1, 1.2, -p.vz * 0.1);
      } else if (slide && car.onRoad && p.speed > 6 && Math.random() < 0.6) {
        this.particles.spawn(p.x - sn * 1.7, y + 0.3, p.z - cs * 1.7, 0xdadada, 2.2, 0, 1, 0);
      }
      if (this.rain && p.speed > 15 && Math.random() < rate * 0.45) {
        this.particles.spawn(p.x - sn * 2.8, y + 0.4, p.z - cs * 2.8, 0x9aa4b4, 2.2, p.vx * 0.5, 0.3, p.vz * 0.5, 0.22, 2.2);
      }
    }
  }

  // ---------- racing line (green = throttle, yellow = lift, red = brake) ----------
  buildRacingLine() {
    const T = this.T, N = T.N;
    // reference speed a good human can carry (a touch under the AI limit)
    const ref = this.refV = new Float32Array(N);
    for (let i = 0; i < N; i++) ref[i] = this.lineV[i] * 0.94;
    // static colouring from the speed plan: decel needed at each point
    const base = this.lineBase = new Uint8Array(N); // 0 green, 1 yellow, 2 red
    for (let i = 0; i < N; i++) {
      const a = ref[i], b = ref[(i + 1) % N];
      const dec = (a * a - b * b) / (2 * T.ds);
      base[i] = dec > 6 ? 2 : dec > 1.2 ? 1 : 0;
    }
    // widen braking zones a little so they read clearly
    const b2 = Uint8Array.from(base);
    for (let i = 0; i < N; i++) if (b2[i] === 2) for (let k = -3; k <= 3; k++) { const j = (i + k + N) % N; if (base[j] < 2) base[j] = 2; }
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
  }

  updateRacingLine() {
    const m = this.lineMesh; if (!m) return;
    m.visible = this.lineMode !== 'off' && this.state !== 'finished';
    if (!m.visible) return;
    const T = this.T, N = T.N, col = this.lineCol, pl = this.player, p = pl.phys;
    const C = [[0.24, 0.86, 0.29], [0.95, 0.82, 0.23], [0.91, 0.2, 0.16]];
    const full = this.lineMode === 'full';
    const u = Math.max(0, p.u);
    const aMax = p.p.mu * (9.81 + (p.p.kd / p.p.mass) * u * u) * 0.85;
    const ahead = Math.round(320 / T.ds), behind = Math.round(12 / T.ds);
    const set = (i, c, a) => { for (const k of [0, 1]) col.set([c[0], c[1], c[2], a], (i * 2 + k) * 4); };
    for (let i = 0; i < N; i++) set(i, C[0], 0);
    for (let k = -behind; k < ahead; k++) {
      const i = (pl.idx + k + N) % N;
      let c = this.lineBase[i];
      // dynamic: if you're too fast to make this point, it turns red / yellow
      if (k > 0) {
        const d = k * T.ds, v = this.refV[i];
        if (u > v) {
          const need = (u * u - v * v) / (2 * d);
          if (need > aMax * 0.75) c = 2; else if (need > aMax * 0.35) c = Math.max(c, 1);
        } else if (c === 2 && u < v * 0.9) c = 1;
      }
      if (!full && c === 0) continue;
      const fade = Math.min(1, (k + behind) / behind) * Math.min(1, (ahead - k) / (ahead * 0.35));
      set(i, C[c], (c === 0 ? 0.34 : 0.62) * fade);
    }
    m.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- blue guide into the pits (with the racing line on) ----------
  // Follows the route the pit crew autopilot drives: drift to the pit side before the entry, down the
  // fast lane, into YOUR box and back out, then rejoin the racing line after the exit.
  buildPitGuide() {
    const pit = this.pit, pl = this.player; if (!pit || !pl) return;
    const T = this.T, N = T.N, box = pit.boxes[pl.teamIdx % pit.boxes.length];
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
      const sp = p.speed || 0; if (sp < 12 || car.surface !== 'road' && car.surface !== 'kerb') continue;
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

  updateCamera(dt, snap = false) {
    const car = this.focus, p = car.phys, cam = this.camera;
    if (this.state === 'intro') return this.introCamera(dt);
    if (this.state === 'strategy') return this.stratCamera(dt);
    if (this.state === 'carselect') return this.showroomCamera(dt);
    const useTV = this.mode === 'attract' || (this.state === 'finished' && this.stateT > 2.5);
    this.shake *= Math.exp(-dt * 5);
    if (useTV) return this.tvCamera(dt, snap);
    this.tv = null;
    const mode = CAMS[this.camMode];
    const up = new THREE.Vector3(0, 1, 0);
    if (mode === 'chase' || mode === 'far') {
      const dist = mode === 'chase' ? 6.8 : 10.5, hgt = mode === 'chase' ? 2.1 : 3.3;
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
      cam.lookAt(p.x + Math.sin(p.h) * 3.5, car.y + 1.0, p.z + Math.cos(p.h) * 3.5);
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

  // car select: low, slow showroom orbit, the car right of the panel; swapping cars pulls the camera back and eases in
  showroomCamera(dt) {
    const car = this.player, p = car.phys, cam = this.camera;
    this.showOrbit = (this.showOrbit ?? p.h + 0.75) + (dt || 0) * 0.16;
    this.selPunch = (this.selPunch || 0) * Math.exp(-(dt || 0) * 3.2);
    const k = this.selPunch, d = 9.4 + 1.8 * k;
    const x = p.x + Math.sin(this.showOrbit) * d, z = p.z + Math.cos(this.showOrbit) * d;
    const y = Math.max(car.y + 1.5 + 0.5 * k, this.world.groundHeight(x, z) + 0.7);
    cam.position.set(x, y, z); cam.up.set(0, 1, 0);
    const r = { x: Math.cos(this.showOrbit), z: -Math.sin(this.showOrbit) };
    cam.lookAt(p.x - r.x * 2.2, car.y + 0.3, p.z - r.z * 2.2);
    cam.fov = 42; cam.updateProjectionMatrix();
    this.camPos.copy(cam.position);
  }

  // low tracking shot down the grid before the lights
  introCamera() {
    const T = this.T, N = T.N, cam = this.camera;
    const k = Math.min(1, this.stateT / 3.2);
    const e = k * k * (3 - 2 * k);
    const len = 14 + this.cars.length * 8;
    const d = 12 - e * len;
    const i = ((Math.round(d / T.ds) % N) + N) % N;
    const side = T.W[i] / 2 - 0.6;
    const y = T.Y[i] + 1.1 + e * 1.8;
    cam.position.set(T.X[i] + T.RX[i] * side, y, T.Z[i] + T.RZ[i] * side);
    const j = ((Math.round((d - 16) / T.ds) % N) + N) % N;
    cam.up.set(0, 1, 0);
    cam.lookAt(T.X[j] - T.RX[j] * 1.5, T.Y[j] + 0.6, T.Z[j] - T.RZ[j] * 1.5);
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

  // HUD data snapshot
  hudState() {
    const pl = this.player;
    if (!pl) return null;
    const p = pl.phys;
    const lapNow = pl.finished ? pl.last : pl.lap === 0 ? 0 : this.raceTime - pl.lapStart;
    const leader = this.order[0];
    const standings = this.order.map((c) => {
      let gap = '';
      if (c !== leader) {
        const dp = leader.progress - c.progress;
        if (c.finished && leader.finished) gap = '+' + (c.finishTime - leader.finishTime).toFixed(1);
        else if (dp > this.T.L) gap = '+' + Math.floor(dp / this.T.L) + ' LAP';
        else gap = '+' + (dp / Math.max(20, c.phys.speed || 40)).toFixed(1);
      }
      return { pos: c.pos, name: c.name, color: c.team.main, isPlayer: c.isPlayer, gap, tyre: c.phys.tyre.c, pit: !!c.pitting, pen: c.pen || 0, dt: !!c.dt, blue: !!c.blue };
    });
    return {
      pos: pl.pos, total: this.cars.length, lap: Math.max(1, Math.min(pl.lap, this.laps)), laps: this.laps,
      lapTime: lapNow, best: pl.best, last: pl.last, raceTime: this.raceTime,
      speed: p.speed, gear: p.gear, rpm: p.rpm, standings, wrongWay: this.wrongWay,
      aids: this.aidHud(),
      state: this.state, surface: pl.surface,
      tyre: p.tyre, dmg: p.dmg, wear: this.wearK > 0, damage: this.damageK > 0,
      pitting: pl.pitting, pitPhase: pl.pitPhase, pitTimer: pl.pitTimer, pitTotal: pl.pitTotal, pitReq: pl.pitReq, pits: pl.pits,
      hasPit: !!this.pit, slip: p.slip, plan: pl.plan ? this.nextPlannedStop(pl) : null,
      rc: this.rc.hudFor(pl), lastInvalid: !!pl.lastInvalid, penServing: pl.penServing || 0,
      delta: this.quali || this.mode === 'test' ? this.liveDelta(pl) : null, // (against your best lap: sessions and time trial)
      quali: this.quali ? {
        left: this.quali.left, flag: this.quali.flag, done: this.quali.done, rows: this.qualiRows(),
        status: pl.pitting ? (pl.pitPhase === 'out' || pl.lap === 0 ? 'PIT EXIT' : 'IN LAP')
          : this.T.open ? (pl.lap === 0 ? 'START' : pl.lap > 1 ? 'RUN OVER' : this.quali.flag ? 'LAST RUN' : 'FLYING') // (point-to-point: runs from the grid)
          : pl.lap === 0 ? (pl.pits ? 'OUT LAP' : 'RUN-UP') : this.quali.flag ? 'LAST LAP' : 'FLYING',
      } : null,
    };
  }

  results() {
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
      if (a.finished && b.finished) return time(a) - time(b);
      if (a.finished) return -1; if (b.finished) return 1;
      return prog(b) - prog(a);
    });
    const win = list[0];
    // leader's distance: a finished car stopped counting at the flag
    const lapsDown = (w, c) => Math.floor(((w.finished ? laps * L : w.raw ?? w.progress) - (c.raw ?? c.progress)) / L);
    return list.map((c, k) => ({
      pos: k + 1, name: c.name, team: c.team.name, color: c.team.main, isPlayer: c.isPlayer,
      time: c.finished ? time(c) : null,
      gap: k === 0 ? '' : c.finished && win.finished ? '+' + (time(c) - time(win)).toFixed(3) : lapsDown(win, c) >= 1 ? '+' + lapsDown(win, c) + ' LAP' : 'DNF',
      pen: (c.penTotal || 0) + (c.dt ? 20 : 0), dt: c.dtTotal || 0, dsq: !!c.dsq,
      best: c.best, pits: c.pits, cleanFinish: (c.maxDmg || 0) < 0.25 && !c.penTotal && !c.dtTotal,
      human: c.human, key: c.key, dnf: !!c.gone, finished: c.finished, lap: c.lap,
      drift: Math.round(c.isPlayer && this.drift ? this.drift.total : c.driftTotal || 0),
    })).map(r => (r.dsq ? { ...r, gap: 'DSQ' } : r.dnf ? { ...r, gap: 'DNF' } : r));
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
    post.render(this.scene, this.camera, { trails, grade: this.world.P.grade, look: this.world.P.look });
  }

  dispose() {
    if (this.voice) this.voice.stop();
    this.aiVoices.forEach(v => v.stop());
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
