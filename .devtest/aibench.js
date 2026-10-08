// dev-only: how fast does the AI lap in each car, and how much faster could it go?
// For each car: the learned speed plan's lap time, then the same plan scaled up (x1.05, x1.1 ...) to show headroom.
import * as THREE from 'three';
import { Race } from '../js/race.js';
import { presetTracks } from '../js/track.js';
import { CARS } from '../js/cars.js';
import { CarPhysics } from '../js/car.js';

export function lap(race, id, V, pace = 1) {
  const T = race.T, N = T.N, spec = CARS[id].spec;
  const car = {
    phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
    ai: { pace, bias: 0, over: 0, stuckT: 0, react: 0, aggr: 0 }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} },
  };
  car.phys.wearK = 0; car.phys.isAI = true; car.phys.fitTyres('medium');
  const i0 = 0;
  car.phys.place(T.X[i0] + T.RX[i0] * race.line[i0], T.Z[i0] + T.RZ[i0] * race.line[i0], Math.atan2(T.FX[i0], T.FZ[i0]));
  const v0 = V[i0] * 0.9; car.phys.vx = T.FX[i0] * v0; car.phys.vz = T.FZ[i0] * v0; car.phys.gear = Math.min(5, spec.gears.length - 1);
  car.idx = i0; race.updateTracker(car, true);
  const saved = [race.state, race.damageK, race.laps, race.cars]; race.state = 'racing'; race.damageK = 0; race.laps = Infinity; race.cars = [];
  let dist = 0, last = 0, t = 0, t1 = null, offs = 0, cool = 0, slide = 0;
  for (let f = 0; f < 60 * 300; f++) {
    const ctl = race.aiControls(car, 1 / 60);
    for (let k = 0; k < 4; k++) { car.phys.step(1 / 240, ctl, race.surfaceEnv(car)); race.updateTracker(car); race.barriers(car); }
    t += 1 / 60;
    const d = (car.idx - last + N) % N; if (d < N / 2) dist += d * T.ds; last = car.idx;
    if (t1 === null && dist >= T.L) t1 = t;
    if (t1 !== null) {
      if (cool > 0) cool--; else if (!car.onRoad || Math.abs(car.s) > T.W[car.idx] / 2 + 1.1) { offs++; (race.offAt ||= []).push(car.idx + (car.onRoad ? "" : "!")); cool = 60; }
      slide = Math.max(slide, car.phys.slipR);
    }
    if (dist >= (race.benchLaps || 2) * T.L) break;
  }
  [race.state, race.damageK, race.laps, race.cars] = saved;
  const at = (race.offAt || []).join(' '); race.offAt = []; return { at, t: t1 === null ? NaN : +(t - t1).toFixed(2), offs, slide: +slide.toFixed(2) };
}

export function bench({ tracks = [0, 1], cars = ['f1', 'aventus', 'm1procar', 'testarossa', 'm3gtr', 'mustang', 'rs964', 'transit'], scales = [1, 1.05, 1.1, 1.15, 1.2] } = {}) {
  const out = [];
  for (const ti of tracks) {
    const trk = presetTracks()[ti];
    trk.env.weather = 'clear'; trk.env.pits = false;
    for (const id of cars) {
      const race = new Race(JSON.parse(JSON.stringify(trk)), { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
      race.limits = {}; const t0 = performance.now(); const V = race.limitsFor(id); race.benchLaps = 5; const ms = Math.round(performance.now() - t0);
      const row = { track: trk.name, id, rounds: ms + 'ms ' + race.learnRounds + ' ' + (race.learnLog || []).join(',') };
      for (const s of scales) row['x' + s] = lap(race, id, V.map(v => v * s));
      out.push(row);
      race.world?.root?.traverse?.(o => { o.geometry?.dispose?.(); });
    }
  }
  return out;
}

// where does the time go? per-lap telemetry summary for one car
export function diag({ track = 0, id = 'mustang' } = {}) {
  const trk = presetTracks()[track]; trk.env.weather = 'clear'; trk.env.pits = false;
  const race = new Race(JSON.parse(JSON.stringify(trk)), { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
  const V = race.limitsFor(id), T = race.T, N = T.N, spec = CARS[id].spec;
  const car = { phys: new CarPhysics(spec), lineV: V, idx: 0, i: 0, f: 0, s: 0, y: 0, lap: 1, cpNext: 1, surface: 'road', onRoad: true, progress: 0, hitCd: 1e9, lapTimes: [], best: Infinity, lapStart: 0,
    ai: { pace: 1, bias: 0, over: 0, stuckT: 0, react: 0, aggr: 0 }, isPlayer: false, model: { group: { position: new THREE.Vector3() }, setDamage() {} } };
  car.phys.wearK = 0; car.phys.isAI = true; car.phys.fitTyres('medium');
  car.phys.place(T.X[0] + T.RX[0] * race.line[0], T.Z[0] + T.RZ[0] * race.line[0], Math.atan2(T.FX[0], T.FZ[0]));
  car.phys.vx = T.FX[0] * V[0] * 0.9; car.phys.vz = T.FZ[0] * V[0] * 0.9; car.phys.gear = 4; race.updateTracker(car, true);
  race.state = 'racing'; race.damageK = 0; race.laps = Infinity; race.cars = [];
  const st = { n: 0, sat: 0, cutR: 0, brk: 0, thrFull: 0, lat: 0, latN: 0, under: 0, drift: 0, deficit: 0, errV: 0, maxLat: 0 };
  let dist = 0, last = 0;
  const trace = [];
  for (let f = 0; f < 60 * 300 && dist < 2 * T.L; f++) {
    const ctl = race.aiControls(car, 1 / 60);
    for (let k = 0; k < 4; k++) { car.phys.step(1 / 240, ctl, race.surfaceEnv(car)); race.updateTracker(car); race.barriers(car); }
    const d = (car.idx - last + N) % N; if (d < N / 2) dist += d * T.ds; last = car.idx;
    if (dist < T.L) continue;
    const p = car.phys; st.n++;
    if (Math.abs(ctl.steer) > 0.98) st.sat++;
    if (p.slipR > 0.14) st.cutR++;
    if (ctl.brake > 0.05) st.brk++;
    if (ctl.throttle > 0.95) st.thrFull++;
    if (p.drifting) st.drift++;
    if (Math.abs(p.latG) > 0.3) { st.lat += Math.abs(p.latG); st.latN++; }
    st.maxLat = Math.max(st.maxLat, Math.abs(p.latG));
    if (p.slipF > spec.slipPeak * 1.2) st.under++;
    st.errV += (V[car.idx] - p.u);
    if (f % 20 === 0) trace.push([car.idx, +p.u.toFixed(1), +V[car.idx].toFixed(1), +ctl.steer.toFixed(2), +ctl.throttle.toFixed(2), +ctl.brake.toFixed(2), +p.slipF.toFixed(3), +p.slipR.toFixed(3), +p.latG.toFixed(2), +car.s.toFixed(1), +race.line[car.idx].toFixed(1)]);
  }
  const pc = x => +(100 * x / st.n).toFixed(1);
  return { id, mu: spec.mu, steerSat: pc(st.sat), rearCut: pc(st.cutR), braking: pc(st.brk), fullThr: pc(st.thrFull), drifting: pc(st.drift), frontOverPeak: pc(st.under), avgCornerG: +(st.lat / st.latN).toFixed(2), maxG: +st.maxLat.toFixed(2), meanVdeficit: +(st.errV / st.n).toFixed(2), trace };
}
