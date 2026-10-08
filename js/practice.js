// Practice programmes: the engineer's run plan, F1's "getting track data". Each job is something to do on track; each
// one done pays off where you can see it later in the weekend (never a hidden stat). The track data a session gathers
// (race.tdata) is carried on to the sessions after it (main.js: the weekend, a World Career week, co-op).
//
// Mini-Sectors: the lap cut into short stretches, about one a corner (the three sectors' splits among the cuts). Each
// has a target, the reference lap's time through it plus a margin (looser in slower cars and at easier levels): beat it
// on two laps and it lights for good. 80% lit does the job. The payoff: your practice best through each one is on the
// board in qualifying, every mini-sector green or yellow against it as you cross it, under the sector it's in.
//
// Track Acclimatization: gates on the racing line at the brake points, apexes and exits, each with the speed to carry
// through it (red: braking, amber: the apex, green: back on the power). Through the middle of a gate at its speed is
// PERFECT, in the gate and near the speed is GOOD; a lap's gates add up to a rating, and a lap of 70% or better does
// the job. The payoff: every brake point you nail gets a marker board at the side of the track for the rest of the
// weekend.
import * as THREE from 'three';
import { surfaceY } from './track.js';
import { CARS } from './cars.js';

export const ACCLIM_PASS = 0.7;
export const MSEC_PASS = 0.8;
// (the programmes' tolerances, by the difficulty: Rookie gets the most room)
const TOL_DIFF = { easy: 1.5, medium: 1.25, hard: 1, alien: 0.9, phantom: 0.85, godlike: 0.8 };
export const PROGRAMMES = [
  { id: 'acclim', name: 'Track Acclimatization', short: 'Acclimatization',
    pass: ACCLIM_PASS, desc: 'Gates on the racing line at the brake points, apexes and exits, each with the speed to carry through it. Red is braking, amber the apex, green back on the power. A lap rated 70% or better does the job, and every brake point you nail gets a marker board beside the track for the rest of the weekend.' },
  { id: 'msec', name: 'Mini-Sectors', short: 'Mini-Sectors', pass: MSEC_PASS,
    desc: 'No gates: the lap in short stretches, about one a corner, each with a target time. Beat a target on two laps and that mini-sector lights for good; light 80% of them to do the job. Then in qualifying every mini-sector shows green or yellow against your practice best, under the sector it\'s in, so you see which corner cost you.' },
];
// the margin on a mini-sector's target (a fraction of the reference lap's time through it), by class and difficulty
const MSEC_TOL = { shitbox: 0.06, street: 0.05, fun: 0.05, gt: 0.04, gt1: 0.04, gt2: 0.04, f1: 0.035 };
export const msecTol = (cls, diff) => (MSEC_TOL[cls] ?? 0.04) * (TOL_DIFF[diff] ?? 1.25);

// Where the mini-sectors split: halfway between one corner's apex and the next (corners closer than 120 m share one),
// the three sectors' splits always among them (a cut within 60 m of one gives way to it); a sector left with a
// single stretch is cut in two. From the circuit alone, so they're the same in every session and every car.
// Returns { cut: [samples, in lap order, not the line], per: [mini-sectors in each sector] }
export function planMinis(T, corners, secCut) {
  const N = T.N, ds = T.ds, end = T.open ? T.finish : N;
  const apex = corners.list.map(c => c.apex).filter(i => i > 0 && i < end).sort((a, b) => a - b);
  const groups = [];
  for (const a of apex) { const g = groups[groups.length - 1]; if (g && (a - g[g.length - 1]) * ds < 120) g.push(a); else groups.push([a]); }
  let cut = [];
  for (let k = 1; k < groups.length; k++) cut.push(Math.round((groups[k - 1][groups[k - 1].length - 1] + groups[k][0]) / 2));
  cut = cut.filter(c => secCut.every(s => Math.abs(c - s) * ds >= 60) && c * ds > 60 && (end - c) * ds > 60).concat(secCut).sort((a, b) => a - b);
  // a sector with one stretch: cut it in half
  const bounds = [0, secCut[0], secCut[1], end];
  for (let k = 0; k < 3; k++) if (!cut.some(c => c > bounds[k] && c < bounds[k + 1])) cut.push(Math.round((bounds[k] + bounds[k + 1]) / 2));
  cut.sort((a, b) => a - b);
  const per = [0, 1, 2].map(k => cut.filter(c => c > bounds[k] && c <= bounds[k + 1]).length + (k === 2 ? 1 : 0));
  return { cut, per, n: cut.length + 1 };
}
export const progById = (id) => PROGRAMMES.find(p => p.id === id) || null;
// gate colors: the racing line's (race.js updateRacingLine), brighter so they glow
const KIND_COL = { brake: [0.91, 0.2, 0.16], apex: [0.95, 0.82, 0.23], exit: [0.24, 0.86, 0.29] };
const KIND_CSS = { brake: '#e8331f', apex: '#f2d13a', exit: '#3ddb4a' };
// how close to the speed: perfect / good, as a fraction of it (a gate taken slower is let off a little more than one
// taken faster). Looser in the slower, looser cars.
const TOL = { shitbox: [0.08, 0.16], street: [0.07, 0.14], fun: [0.07, 0.14], gt: [0.06, 0.12], f1: [0.05, 0.1] };
const SLOW_K = 1.3;

const GLOW = 1.25; // (a touch over 1: into the bloom, still its color)

// Where the gates go, from a reference lap's speeds V (m/s per sample: the Lap Review's reference, a clean lap in your
// car at a quick driver's pace, so the speeds out of a corner are ones the car can really reach): at each corner it slows for, a red
// gate partway down the braking (40% of the way from the brake point to the slowest point), an amber one at the
// slowest point, a green one where it's picked up half the speed it lost. A corner it only lifts for gets the amber
// one; a quick one it doesn't slow for at all, a green one at the apex (the line's still worth hitting).
// Each gate: { i (sample), kind, v (m/s), b (the brake point's sample, red gates) }; the Acclimatization adds o, where
// across the road it is
export function planGates(T, V0, corners) {
  const N = T.N, ds = T.ds, h = Math.max(1, Math.round(6 / ds)), V = new Float32Array(N);
  // (smoothed over ~12 m: a driven lap's speed ripples as the brakes and throttle are worked)
  for (let i = 0; i < N; i++) { let a = 0; for (let k = -h; k <= h; k++) a += V0[(i + k + N) % N]; V[i] = a / (2 * h + 1); }
  const at = (i) => V[(i % N + N) % N];
  const lo = T.open ? Math.round(30 / ds) : 0, hi = T.open ? T.finish - Math.round(20 / ds) : N; // (point-to-point: the run itself)
  const clear = Math.round(15 / ds); // (none just either side of the line: a lap's gates belong to that lap)
  const win = Math.max(2, Math.round(30 / ds)), out = [];
  const add = (i, kind, b) => {
    i = (i % N + N) % N;
    if (!T.open && (i < clear || i > N - clear)) return;
    if (T.open && (i < lo || i > hi)) return;
    out.push({ i, kind, v: at(i), b });
  };
  for (let m = lo; m < hi; m++) {
    // the slowest point of a corner: the lowest within 30 m either way (the first of a flat run)
    let min = true;
    for (let k = 1; k <= win && min; k++) if (at(m - k) <= at(m) || at(m + k) < at(m)) min = false;
    if (!min) continue;
    // the brake point: back up the slowing down to where it started (a dip of under 1 m/s on the way doesn't stop it)
    let b = m, j = m, n = 0;
    while (n < Math.round(600 / ds) && at(j - 1) > at(b) - 1 && at(j - 1) >= at(m)) { j--; n++; if (at(j) > at(b)) b = j; }
    const drop = at(b) - at(m);
    if (drop < 2) continue; // (barely a lift: the quick corners below)
    let e = m; n = 0; const half = at(m) + drop * 0.5;
    for (let k = m; n < Math.round(250 / ds) && at(k + 1) > at(e) - 1 && at(e) < half; n++) { k++; if (at(k) > at(e)) e = k; }
    // (the red gate 40% of the way down the braking, and at least 25 m before the apex: both get a gate)
    if (drop >= 6) add(Math.max(b, Math.min(b + Math.round((m - b) * 0.4), m - Math.round(25 / ds))), 'brake', (b % N + N) % N);
    add(m, 'apex');
    if ((e - m) * ds >= 25) add(e, 'exit');
  }
  // the quick corners: the line still matters
  for (const c of corners.list) {
    if (c.apex < lo || c.apex > hi) continue;
    if (out.some(g => Math.min(Math.abs(g.i - c.apex), N - Math.abs(g.i - c.apex)) * ds < 70)) continue;
    if (Math.abs(T.K[c.apex]) < 1 / 120) continue;
    add(c.apex, 'exit');
  }
  out.sort((a, b) => a.i - b.i);
  // no two within 20 m (the first kept, or the red one: it carries a brake point)
  const kept = [];
  for (const g of out) {
    const p = kept[kept.length - 1];
    if (p && (g.i - p.i) * ds < 20) { if (g.kind === 'brake' && p.kind !== 'brake') kept[kept.length - 1] = g; continue; }
    kept.push(g);
  }
  if (!T.open && kept.length > 1 && (kept[0].i + N - kept[kept.length - 1].i) * ds < 20) kept.pop();
  return kept;
}

// the label over a gate: the speed to carry, in the gate's color
function speedLabel(v, units, kind) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d'), n = Math.round(units === 'mph' ? v * 2.23694 : v * 3.6), col = KIND_CSS[kind];
  // (on a dark plate edged in its color, so it reads against a bright sky)
  c.fillStyle = 'rgba(5,6,12,0.72)'; c.fillRect(20, 6, 216, 120); c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(22, 8, 212, 116);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.shadowColor = col; c.shadowBlur = 6; c.fillStyle = col;
  c.font = "700 92px 'SV Display', 'Helvetica Neue', Arial, sans-serif"; c.fillText(String(n), 128, 92);
  c.font = "500 26px 'SV UI', 'Helvetica Neue', Arial, sans-serif"; c.fillText(units === 'mph' ? 'MPH' : 'KM/H', 128, 122);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Acclimatization {
  constructor(race) {
    this.race = race; this.id = 'acclim';
    const T = race.T, cls = CARS[race.player?.carId]?.cls || 'gt';
    const dk = TOL_DIFF[race.opts.difficulty] ?? 1.25;
    this.tol = (TOL[cls] || TOL.gt).map(t => t * dk);
    // (half the gate's width, m: a clean lap by the AI is up to ~1.6 m off the drawn line at a gate; PERFECT is the
    // middle 60%)
    this.half = cls === 'street' || cls === 'shitbox' || cls === 'fun' ? 2.8 : 2.5;
    // (the speeds: the Lap Review's reference lap in your car; the racing line's plan if there isn't one)
    const ref = race.referenceTelemetry(race.player.carId, race.condTyre('soft')), V = new Float32Array(T.N);
    if (ref) { const v = ref.ch.v, n = v.length; for (let i = 0; i < T.N; i++) V[i] = v[Math.min(i, n - 1)]; } else V.set(race.refV);
    this.gates = planGates(T, V, race.corners);
    // each gate where that lap went through it (most cars within half a meter of the drawn line; a car that can't hold
    // the line through a slow corner runs wider, and its gate is where it can really go), kept on the road
    for (const g of this.gates) {
      const o = ref ? ref.ch.s[Math.min(g.i, ref.ch.s.length - 1)] : race.line[g.i], lim = Math.max(0, T.W[g.i] / 2 - 1);
      g.o = Math.max(-lim, Math.min(lim, isFinite(o) ? o : race.line[g.i]));
    }
    this.group = new THREE.Group(); race.scene.add(this.group);
    this.build();
    this.lap = { pts: 0, n: 0, res: [] };
    this.last = null; // { res, dv, kind } the gate just passed (the HUD)
    this.lastIdx = null;
    this.next = 0;
    this.on = true;
  }
  build() {
    const T = this.race.T, units = this.race.units;
    // (big and bright: they're read at 150 m at PS2 resolution)
    const post = new THREE.BoxGeometry(0.22, 2.6, 0.22), bar = new THREE.BoxGeometry(1, 0.22, 0.22), strip = new THREE.PlaneGeometry(1, 0.6).rotateX(-Math.PI / 2);
    this.geo = [post, bar, strip];
    for (const g of this.gates) {
      const i = g.i, o = g.o, col = new THREE.Color(...KIND_COL[g.kind]).multiplyScalar(GLOW);
      // (no fog: a guide, it stays its color at any distance)
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false });
      const grp = new THREE.Group();
      grp.position.set(T.X[i] + T.RX[i] * o, surfaceY(T, i, 0, o) + this.race.A.LIFT[i], T.Z[i] + T.RZ[i] * o);
      grp.rotation.y = Math.atan2(-T.RZ[i], T.RX[i]); // (local x across the track)
      for (const s of [-1, 1]) { const p = new THREE.Mesh(post, mat); p.position.set(s * this.half, 1.0, 0); grp.add(p); }
      const top = new THREE.Mesh(bar, mat); top.scale.x = this.half * 2 + 0.22; top.position.y = 2.2; grp.add(top);
      const floor = new THREE.Mesh(strip, mat); floor.scale.x = this.half * 2; floor.position.y = 0.14; floor.renderOrder = 3; grp.add(floor); // (the line to cross)
      const tex = speedLabel(g.v, units, g.kind);
      const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      lbl.scale.set(3.2, 1.6, 1); lbl.position.y = 3.3; grp.add(lbl);
      grp.visible = false;
      this.group.add(grp);
      g.obj = grp; g.mat = mat; g.lbl = lbl; g.flash = 0; g.res = null;
    }
  }
  // the first gate ahead of a sample
  sync(idx) { const k = this.gates.findIndex(g => g.i > idx); this.next = k < 0 ? 0 : k; }
  // a new lap starts (race.completeLap): the one just done is rated if every gate on it was passed
  lapDone() {
    const L = this.lap, total = this.gates.length;
    this.lap = { pts: 0, n: 0, res: [] };
    if (!total || L.n < total) return null;
    return L.pts / (100 * total);
  }
  // you've been put somewhere (out of the garage, a reset): the lap so far no longer counts
  restart() { this.lap = { pts: 0, n: 0, res: [] }; this.lastIdx = null; }
  update(dt, car, live) {
    const T = this.race.T, N = T.N;
    if (!this.on || !car || car.gone) { this.group.visible = false; return []; }
    this.group.visible = true;
    const passed = [];
    if (live) {
      if (this.lastIdx == null) { this.lastIdx = car.idx; this.sync(car.idx); }
      const d = (car.idx - this.lastIdx + N) % N;
      if (d > N / 2) this.sync(car.idx); // (went backwards, or was put somewhere)
      else if (d > 0 && this.gates.length) {
        // every gate between where it was and where it is
        for (let guard = 0; guard < this.gates.length; guard++) {
          const g = this.gates[this.next], ahead = (g.i - this.lastIdx + N) % N;
          if (ahead === 0 || ahead > d) break;
          passed.push(this.judge(g, car, d * T.ds > 25)); // (put down past it: a reset, not driven through)
          this.next = (this.next + 1) % this.gates.length;
          if (T.open && this.next === 0) break;
        }
      }
      this.lastIdx = car.idx;
    }
    // what you see: the next few gates ahead, the one you just went through flashing its verdict
    let shown = 0;
    for (let k = 0; k < this.gates.length; k++) {
      const g = this.gates[k], ahead = ((g.i - car.idx + N) % N) * T.ds;
      if (g.flash > 0) {
        g.flash -= dt; const f = Math.max(0, g.flash / 0.6);
        g.obj.visible = f > 0; g.mat.opacity = 0.95 * f; g.lbl.material.opacity = f;
        if (f <= 0) { g.mat.color.setRGB(...KIND_COL[g.kind]).multiplyScalar(GLOW); }
        continue;
      }
      const vis = ahead > 4 && ahead < 650 && shown < 6 && (!T.open || g.i > car.idx);
      g.obj.visible = vis;
      if (vis) { shown++; const fade = Math.min(1, (650 - ahead) / 150); g.mat.opacity = 0.9 * fade; g.lbl.material.opacity = fade; }
    }
    return passed;
  }
  // the verdict on a gate: where you were across it and how fast
  judge(g, car, skipped) {
    const lat = car.s - g.o, v = Math.max(0, car.phys.u ?? car.phys.speed), dv = (v - g.v) / Math.max(1, g.v);
    const [tp, tg] = this.tol, inGate = !skipped && Math.abs(lat) <= this.half;
    const within = (t) => dv <= t && dv >= -t * SLOW_K;
    const res = !inGate ? 'wide' : within(tp) && Math.abs(lat) <= this.half * 0.6 ? 'perfect' : within(tg) ? 'good' : dv > 0 ? 'fast' : 'slow';
    const pts = res === 'perfect' ? 100 : res === 'good' ? 50 : 0;
    this.lap.pts += pts; this.lap.n++; this.lap.res.push(res);
    g.res = res; g.flash = 0.6;
    g.mat.color.set(res === 'perfect' ? 0xffffff : res === 'good' ? 0xffc21a : 0x555566).multiplyScalar(res === 'perfect' ? 1.6 : 1);
    this.last = { res, dv: v - g.v, kind: g.kind, v: g.v, t: performance.now() };
    return { g, res, pts, dv: v - g.v };
  }
  dispose() {
    this.race.scene.remove(this.group);
    for (const g of this.gates) { if (g.mat) g.mat.dispose(); if (g.lbl) { g.lbl.material.map.dispose(); g.lbl.material.dispose(); } }
    if (this.geo) this.geo.forEach(x => x.dispose());
  }
}

// The Mini-Sectors job: each mini-sector's target (the reference lap's time through it, plus the margin). The timing
// and what's lit live in race.js (miniDone) and the weekend's track data (tdata.msec); there's nothing on track.
export class MiniSectors {
  constructor(race) {
    this.race = race; this.id = 'msec';
    const T = race.T, M = race.mini, cls = CARS[race.player?.carId]?.cls, tol = msecTol(cls, race.opts.difficulty);
    const ref = race.referenceTelemetry(race.player.carId, race.condTyre('soft'));
    // the reference's time at each cut (no reference: the line's speeds, added up)
    let at;
    if (ref) { const t = ref.ch.t; at = (i) => i == null ? ref.time : t[Math.min(i, t.length - 1)]; }
    else { const V = race.refV, cum = new Float64Array(T.N + 1); for (let i = 0; i < T.N; i++) cum[i + 1] = cum[i] + T.ds / Math.max(5, V[i]); at = (i) => cum[i == null ? (T.open ? T.finish : T.N) : i]; }
    const ends = [...M.cut, null];
    this.target = ends.map((c, j) => (at(c) - (j ? at(M.cut[j - 1]) : 0)) * (1 + tol));
  }
  update() { return []; }
  restart() {}
  lapDone() { return null; }
  dispose() {}
}

// The payoff: a marker board beside the track at each brake point you've nailed (the side the racing line comes in
// on, so it's where you're looking), for the rest of the weekend.
export class BrakeMarkers {
  constructor(race) { this.race = race; this.group = new THREE.Group(); race.scene.add(this.group); this.key = ''; }
  set(marks) {
    const key = (marks || []).join(',');
    if (key === this.key) return;
    this.key = key; this.clear();
    if (!marks || !marks.length) return;
    const race = this.race, T = race.T, line = race.line;
    const geo = this.geo = [new THREE.BoxGeometry(0.14, 1.6, 0.14), new THREE.BoxGeometry(1.3, 0.8, 0.08), new THREE.BoxGeometry(1.1, 0.13, 0.09)];
    const pole = this.pole = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    const face = this.face = new THREE.MeshBasicMaterial({ color: 0x0a0a0e });
    const glow = this.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0).multiplyScalar(1.2), toneMapped: false });
    for (const i of marks) {
      if (i < 0 || i >= T.N) continue;
      const side = Math.sign(line[i]) || 1, s = side * (T.W[i] / 2 + 1.1);
      const g = new THREE.Group();
      g.position.set(T.X[i] + T.RX[i] * s, surfaceY(T, i, 0, Math.sign(s) * T.W[i] / 2) + race.A.LIFT[i], T.Z[i] + T.RZ[i] * s);
      g.rotation.y = Math.atan2(T.FX[i], T.FZ[i]); // (its lit face, local -z, toward the cars coming)
      const p = new THREE.Mesh(geo[0], pole); p.position.y = 0.8; g.add(p);
      const b = new THREE.Mesh(geo[1], face); b.position.y = 1.9; g.add(b);
      for (const y of [2.1, 1.9, 1.7]) { const r = new THREE.Mesh(geo[2], glow); r.position.set(0, y, -0.05); g.add(r); }
      this.group.add(g);
    }
  }
  show(on) { this.group.visible = on; }
  clear() {
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    if (this.geo) { this.geo.forEach(x => x.dispose()); this.geo = null; }
    for (const m of [this.pole, this.face, this.glow]) if (m) m.dispose();
  }
  dispose() { this.clear(); this.race.scene.remove(this.group); }
}
