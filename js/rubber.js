// A tarmac track rubbering in (race.js; a dirt track has its own: dirttrack.js).
//   - A circuit isn't new when you get there: the racing line carries rubber from the racing before (a permanent
//     circuit a good deal, a street circuit, public road most of the year, a little), darkest where the tyres work
//     hardest: braking zones, apexes, the exits.
//   - Every car laps it in further: each wheel's path, more when the tyres are working (braking, cornering, on the
//     power), saturating. A field's practice and qualifying running counts too (their laps are simulated, so their
//     rubber is laid along the line). It carries from session to session through a weekend (opts.rubber).
//   - Grip: relative to how the track was when the session began (what the AI learned its pace on), up to K more where
//     it's fully rubbered. In the wet the rubber is slick: the more of it, the less grip (so the wet line isn't the dry
//     one), and the rain slowly washes it off.
// Across the track it's 24 lanes; along it, every sample. It's drawn by the road's own shader (patchRoad): the
// rubber fills the asphalt's grain and darkens it, in fine streaks along the track (the wheels' paths), and polishes
// it, so it catches the light (more in the wet).
import * as THREE from 'three';

const LANES = 24;
const K = 0.05;          // grip from bare to fully rubbered (x the surface's grip)
const WET = 0.07;        // a fully rubbered line in the wet: that much less grip
const PASS = 0.0025;     // one car over a lane: this share of the way to full (x how hard its tyres work, 0.5-1.7)
const WASH = 0.00012;    // the rain washing it off, per second at fully wet
const USED = { circuit: 0.7, street: 0.35 }; // the line's rubber when the session starts (fresh weekend)

export class Rubber {
  // T the track, line its racing line (offset per sample), V the line's speed plan (m/s), state a saved one
  // (state(): from the session before), street: a street circuit (less rubber to start)
  constructor(T, line, V, { state = null, street = false, wet = 0 } = {}) {
    this.T = T; const N = T.N;
    this.r = new Float32Array(N * LANES); this.r0 = new Float32Array(N * LANES);
    this.work = new Float32Array(N); this.shape = new Float32Array(N * LANES);
    this.layShape(line, V);
    if (state && state.N === N && state.r.length === this.r.length) this.r.set(state.r);
    else { const u = street ? USED.street : USED.circuit; for (let k = 0; k < this.r.length; k++) this.r[k] = u * this.shape[k]; }
    this.r0.set(this.r); // (grip is relative to this: see grip)
    this.wet = wet; this.dirty = true; this.paintT = 0; this.fieldT = 0;
    this.uniforms = null;
  }
  lane(i, s) { return (s / this.T.W[i] + 0.5) * LANES - 0.5; }
  // where the field's rubber goes (0..1 per lane): its wheels' paths around the line, the wheel tracks ~0.8 m either
  // side of it, spread as each car and lap differ a little; darker where the line's speed plan says the tyres work
  // hard. this.work: that, per sample.
  layShape(line, V) {
    const T = this.T, N = T.N, ds = T.ds, W = this.work, S = this.shape, raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const j = (i + 4) % N, d = 4 * ds, vi = V ? V[i] : 20, vj = V ? V[j] : 20;
      const brake = Math.max(0, (vi * vi - vj * vj) / (2 * d)) / 14, power = Math.max(0, (vj * vj - vi * vi) / (2 * d)) / 7;
      const lat = vi * vi * Math.abs(T.K[i] || 0) / 22;
      raw[i] = Math.min(1, Math.max(brake, lat * 0.85, power * 0.6));
    }
    for (let i = 0; i < N; i++) { // (smoothed: braking zones fade in and out, not sample by sample)
      let a = 0, n = 0; for (let k = -6; k <= 6; k++) { a += raw[(i + k + N) % N] * (7 - Math.abs(k)); n += 7 - Math.abs(k); }
      W[i] = a / n;
    }
    for (let i = 0; i < N; i++) {
      const w = T.W[i], o = line ? line[i] : 0, amt = 0.6 + 0.4 * Math.min(1, W[i] * 1.4);
      // (a slow wobble along the track: the rubber isn't laid evenly)
      const vary = 0.88 + 0.12 * Math.sin(i * 0.071) * Math.sin(i * 0.023 + 1.3);
      for (let l = 0; l < LANES; l++) {
        const s = ((l + 0.5) / LANES - 0.5) * w;
        const g = (x, sig) => Math.exp(-0.5 * (x / sig) * (x / sig));
        const tracks = Math.max(g(s - o - 0.8, 0.45), g(s - o + 0.8, 0.45)), haze = g(s - o, 1.9);
        S[i * LANES + l] = Math.min(1, (tracks + 0.35 * haze) * amt * vary);
      }
    }
  }
  // the rubber at sample i, s metres off the centre line (between the lanes)
  at(i, s) {
    const x = Math.max(0, Math.min(LANES - 1, this.lane(i, s))), l = Math.min(LANES - 2, Math.floor(x)), f = x - l, k = i * LANES + l;
    return [this.r[k] * (1 - f) + this.r[k + 1] * f, this.r0[k] * (1 - f) + this.r0[k + 1] * f];
  }
  // grip there (x the surface's): 1 where it's as it was when the session began
  grip(i, s) { const [r, r0] = this.at(i, s); return 1 + K * (r - r0) - WET * this.wet * r; }
  // one car on track: from sample i0 (where it was last time) to i, its wheels s ± tw/2 off centre, its tyres working
  // this hard (0..1+: how much of their grip is in use, more when locking or spinning)
  drive(i0, i, s, tw, work) {
    const T = this.T, N = T.N; if (this.wet > 0.3) return;
    const n = Math.min(12, (i - i0 + N) % N); if (n === 0 || n > 10) return; // (not moved on, or a jump: a reset, the pits)
    const amt = PASS * (0.5 + Math.min(1.2, work));
    for (let k = 1; k <= n; k++) {
      const j = (i0 + k) % N, w = T.W[j];
      for (const ws of [s - tw / 2, s + tw / 2]) {
        if (Math.abs(ws) > w / 2) continue;
        const x = Math.max(0, Math.min(LANES - 1, this.lane(j, ws))), l = Math.min(LANES - 2, Math.floor(x)), f = x - l, b = j * LANES + l;
        this.r[b] = Math.min(1, this.r[b] + (1.1 - this.r[b]) * amt * (1 - f));
        this.r[b + 1] = Math.min(1, this.r[b + 1] + (1.1 - this.r[b + 1]) * amt * f);
      }
    }
    this.dirty = true;
  }
  // a field lapping that isn't on track (practice / qualifying run simulated): `cars` of them on a lap of `lap` s
  field(dt, cars, lap) {
    if (this.wet > 0.3 || !(cars > 0) || !(lap > 0)) return;
    if ((this.fieldT += dt) < 1) return;
    const passes = cars * this.fieldT / lap, R = this.r, S = this.shape, W = this.work; this.fieldT = 0;
    for (let i = 0, N = this.T.N; i < N; i++) {
      const a = 1 - Math.pow(1 - PASS * (0.5 + W[i]), passes);
      for (let l = 0, k = i * LANES; l < LANES; l++, k++) if (S[k] > 0.02) R[k] = Math.min(1, R[k] + (1.1 - R[k]) * a * S[k]);
    }
    this.dirty = true;
  }
  update(dt, wet) {
    this.wet = wet;
    if (wet > 0.05) { const f = 1 - WASH * wet * dt; for (let k = 0; k < this.r.length; k++) this.r[k] *= f; this.dirty = true; }
    if (this.uniforms) this.uniforms.rubWet.value = wet;
    if ((this.paintT += dt) > 1 && this.dirty) { this.paintT = 0; this.paint(); }
  }
  // what the next session starts from
  state() { return { N: this.T.N, r: this.r.slice() }; }

  // ---------------- drawing it ----------------
  // the road (world.js road: its material, with each vertex's aRub: across 0..1, along 0..1, along in m, width in m)
  attach(road) {
    if (!road || !road.mat) return;
    const N = this.T.N, R = this.rows = Math.min(N, 4096);
    this.px = new Uint8Array(LANES * R * 4);
    const tex = this.tex = new THREE.DataTexture(this.px, LANES, R, THREE.RGBAFormat);
    tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    this.paint();
    this.uniforms = patchRoad(road.mat, tex);
    this.uniforms.rubWet.value = this.wet;
  }
  paint() {
    if (!this.px) return;
    const N = this.T.N, R = this.rows, P = this.px, r = this.r;
    for (let row = 0; row < R; row++) {
      const i0 = Math.floor((row * N) / R), i1 = Math.max(i0 + 1, Math.floor(((row + 1) * N) / R));
      for (let l = 0; l < LANES; l++) {
        let a = 0; for (let i = i0; i < i1; i++) a += r[i * LANES + l];
        const o = (row * LANES + l) * 4, v = Math.round(255 * Math.min(1, a / (i1 - i0)));
        P[o] = P[o + 1] = P[o + 2] = v; P[o + 3] = 255;
      }
    }
    this.tex.needsUpdate = true; this.dirty = false;
  }
}

// The road's material, drawn with the rubber: where there's rubber the asphalt's grain fills in (the texture's
// light and dark flattened toward a mid grey), it goes darker, in streaks along the track (each tyre's path a little
// different, finer up close; faded to an even tone where they'd shimmer in the distance), and it's polished:
// a little shine in the dry, a lot in the wet.
export function patchRoad(mat, tex) {
  const uniforms = { rubTex: { value: tex }, rubWet: { value: 0 } }, prev = mat.onBeforeCompile; // (the world's own: the road's concrete)
  mat.onBeforeCompile = (sh, r) => {
    if (prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRub;\nvarying vec4 vRub;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRub = aRub;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D rubTex; uniform float rubWet; varying vec4 vRub; float rubAmt;
float rubH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rubN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rubH(i), rubH(i + vec2(1, 0)), f.x), mix(rubH(i + vec2(0, 1)), rubH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float r = texture2D(rubTex, vRub.xy).r;
  vec2 m = vec2(vRub.x * vRub.w, vRub.z); // (metres: across, along)
  // streaks: tyre-wide lines that wander slowly along the track, and broader patches
  float fine = rubN(vec2(m.x * 6.0 + rubN(vec2(m.y * 0.02, 3.1)) * 3.0, m.y * 0.05));
  float broad = rubN(vec2(m.x * 1.3, m.y * 0.012 + 7.0));
  float fw = clamp(fwidth(m.x * 6.0) * 1.5 - 0.3, 0.0, 1.0); // (far off: the streaks blend to their average)
  float streak = mix(fine * 0.65 + broad * 0.35, 0.5, fw);
  rubAmt = clamp(r * (0.62 + 0.75 * streak) - 0.04, 0.0, 1.0);
  rubAmt = rubAmt * rubAmt * (3.0 - 2.0 * rubAmt) * 0.55 + rubAmt * 0.45;
  vec3 c = diffuseColor.rgb, even = vec3(dot(c, vec3(0.3, 0.5, 0.2)));
  c = mix(c, mix(even, vec3(0.16), 0.35), rubAmt * 0.75); // (the grain filled in)
  diffuseColor.rgb = c * (1.0 - 0.72 * rubAmt) * mix(vec3(1.0), vec3(0.97, 0.98, 1.0), rubAmt); // (darker, a touch cool)
}`)
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 1.0 + rubAmt * (0.25 + 2.2 * rubWet);');
  };
  const key = mat.customProgramCacheKey.bind(mat); mat.customProgramCacheKey = () => 'rubber-road' + key();
  mat.needsUpdate = true;
  return uniforms;
}
