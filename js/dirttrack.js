// A dirt track that changes through a race (race.js, env.surface 'dirt').
//   - Fresh, it's damp and tacky: a little more grip everywhere, drying off over the first ~8 minutes of running
//     (not in the rain: then it stays wet).
//   - Where the cars run, the groove packs down slick: less grip the more it's been driven, up to about -13%.
//   - Cars throw loose dirt up to the outside of the corners (and a little to either side of the groove): a cushion
//     with more bite (+9% at its deepest), so the fast way round moves up the track as the race goes on. Driving through
//     the cushion knocks it down again.
//   - Tyre wear goes with it (abrasion, CarPhysics.dirtWear): the damp early track and the loose cushion are easy on
//     tyres (about half tarmac's wear), a dry-slick groove eats them (up to 1.3x).
// Across the track it's 12 lanes; along it, every sample. An overlay on the road shows it: the groove dark and
// polished, the cushion light and loose.
import * as THREE from 'three';

const LANES = 12;
export const DIRT_MU = 0.68;                  // the dirt's base grip (race.js SURFACES.dirt)
const TACK = 0.05, DRY_S = 480;               // fresh: +0.05, gone after this much running (s)
const SLICK = 0.09, PASSES = 50;              // a fully worn groove: -0.09, after about this many cars over it
const BITE = 0.06;                            // a full cushion: +0.06

export class DirtTrack {
  constructor(T, A, root, rain) {
    this.T = T; this.A = A; this.rain = rain; this.age = 0;
    const N = T.N;
    this.wear = new Float32Array(N * LANES); this.loose = new Float32Array(N * LANES);
    // which way is the outside of the bend at each sample (-1 left, +1 right, 0 straight)
    this.out = new Int8Array(N); this.bend = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, turn = (T.FX[j] - T.FX[i]) * T.RX[i] + (T.FZ[j] - T.FZ[i]) * T.RZ[i];
      this.out[i] = Math.abs(turn) < 1e-4 ? 0 : turn > 0 ? -1 : 1; this.bend[i] = Math.min(1, Math.abs(turn) / T.ds * 60);
    }
    this.mu0 = this.mu(0, 0); // (what the AI learned its pace on: the fresh track)
    // (the AI measures its tyre wear on the fresh track; over a race the groove gets about this much harder on them)
    this.planK = 0.95 / this.abrasion(0, 0);
    this.buildOverlay(root);
    this.dirtyT = 0;
  }
  lane(i, s) { return Math.max(0, Math.min(LANES - 1, Math.floor((s / this.T.W[i] + 0.5) * LANES))); }
  // grip of the dirt at sample i, s metres off the centre line
  mu(i, s) {
    const k = i * LANES + this.lane(i, s);
    const tack = this.rain ? TACK : TACK * Math.max(0, 1 - this.age / DRY_S);
    return DIRT_MU + tack - SLICK * Math.min(1, this.wear[k]) + BITE * Math.min(1, this.loose[k]);
  }
  // how hard the dirt is on tyres there (x their wear on tarmac)
  abrasion(i, s) {
    if (this.rain) return 0.5;
    const k = i * LANES + this.lane(i, s), damp = Math.max(0, 1 - this.age / DRY_S);
    return (0.8 + 0.5 * Math.min(1, this.wear[k])) * (1 - 0.4 * damp) * (1 - 0.5 * Math.min(1, this.loose[k]));
  }
  // a car at sample i, s off centre, moving at v m/s for dt: its tyres pack the groove and throw dirt outward
  drive(i, s, v, dt) {
    if (!(v > 3)) return;
    const T = this.T, d = (v * dt) / T.ds; // (fraction of this sample crossed)
    for (const off of [-0.75, 0.75]) {
      const k = i * LANES + this.lane(i, s + off);
      this.wear[k] = Math.min(1.2, this.wear[k] + d / PASSES);
      this.loose[k] = Math.max(0, this.loose[k] - d * 0.02);
    }
    // the outside of a bend gets most of it (more the tighter and faster), either side of the groove a little
    const o = this.out[i], fling = d * (0.004 + 0.02 * this.bend[i] * Math.min(1, v / 25));
    const toss = (ss, k0) => { const k = i * LANES + this.lane(i, ss); this.loose[k] = Math.min(1.2, this.loose[k] + k0); };
    if (o) { toss(s + o * 2.6, fling); toss(s + o * 3.6, fling * 0.7); }
    toss(s - 2, d * 0.0015); toss(s + 2, d * 0.0015);
  }
  update(dt, running) {
    if (running) this.age += dt;
    if ((this.dirtyT += dt) > 0.5) { this.dirtyT = 0; this.paint(); }
  }

  // ---------------- the overlay ----------------
  buildOverlay(root) {
    const T = this.T, A = this.A, N = T.N, cols = LANES + 1, rows = N + 1;
    this.rowsTex = Math.min(N, 2048);
    this.px = new Uint8Array(LANES * this.rowsTex * 4);
    this.tex = new THREE.DataTexture(this.px, LANES, this.rowsTex, THREE.RGBAFormat);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.needsUpdate = true;
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
    const surfY = (i, s) => T.Y[i] + s * Math.sin(T.B[i]) + A.LIFT[i] + 0.03; // (just above the road: world.js surfY)
    for (let r = 0; r < rows; r++) {
      const i = r % N, w = T.W[i];
      for (let c = 0; c < cols; c++) {
        const s = -w / 2 + (w * c) / LANES, id = r * cols + c;
        pos[id * 3] = T.X[i] + T.RX[i] * s; pos[id * 3 + 1] = surfY(i, s); pos[id * 3 + 2] = T.Z[i] + T.RZ[i] * s;
        uv[id * 2] = c / LANES; uv[id * 2 + 1] = r / N;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      if (r === T.cut) continue;
      const a = r * cols + c, b = a + 1, c2 = a + cols, d = c2 + 1;
      idx.push(a, b, c2, b, d, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.renderOrder = 1; this.mesh.name = 'DirtWear';
    root.add(this.mesh);
  }
  paint() {
    const N = this.T.N, R = this.rowsTex, P = this.px;
    for (let r = 0; r < R; r++) {
      const i0 = Math.floor((r * N) / R), i1 = Math.max(i0 + 1, Math.floor(((r + 1) * N) / R));
      for (let l = 0; l < LANES; l++) {
        let w = 0, lo = 0;
        for (let i = i0; i < i1; i++) { w = Math.max(w, this.wear[i * LANES + l]); lo = Math.max(lo, this.loose[i * LANES + l]); }
        w = Math.min(1, w); lo = Math.min(1, lo);
        const o = (r * LANES + l) * 4;
        if (lo > w * 0.8) { P[o] = 178; P[o + 1] = 140; P[o + 2] = 100; P[o + 3] = Math.round(215 * lo); }  // loose, light
        else { P[o] = 26; P[o + 1] = 17; P[o + 2] = 11; P[o + 3] = Math.round(200 * w); }                     // packed, dark and polished
      }
    }
    this.tex.needsUpdate = true;
  }
}
