// Tire smoke, dust and thrown dirt: soft billowing puffs lit by the sun and sky, and dirt/stones thrown in arcs off the
// tires. One instanced draw of camera-facing quads, sorted back to front each frame.
import * as THREE from 'three';

const MAX = 4000;
export const SMOKE = 0, DUST = 1, CHUNK = 2;
// player settings: dirt = how much dust and thrown dirt (0 none, 1 as designed, 2 double; the menu's Dirt & Dust)
export const FX = { dirt: 1 };

// value noise (for the puff textures)
function noise2(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
const fbm = (n, x, y, o = 5) => { let v = 0, a = 0.5, t = 0; for (let k = 0; k < o; k++) { v += n(x, y) * a; t += a; x *= 2.03; y *= 2.03; a *= 0.5; } return v / t; };

// a 2x2 atlas: three billowy puffs and one clod. Alpha = density, red = lumpy detail for the shading
let atlas = null;
function puffAtlas() {
  if (atlas) return atlas;
  const S = 128, W = S * 2, data = new Uint8Array(W * W * 4);
  for (let cell = 0; cell < 4; cell++) {
    const n = noise2(17 + cell * 31), ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1, r = Math.hypot(u, v);
      let a, det;
      if (cell < 3) {
        // a puff: a few lumps of cloud round a dense middle, frayed at the edge
        const f = fbm(n, u * 2.6 + 9, v * 2.6 + 4), g = fbm(n, u * 6 + 40, v * 6 + 13, 3);
        const edge = 1 - Math.min(1, r * (0.85 + 0.55 * f));
        a = Math.max(0, Math.min(1, edge * 1.6 * (0.45 + 0.75 * f) - 0.08 + (g - 0.5) * 0.25));
        a = a * a * (3 - 2 * a) * Math.max(0, Math.min(1, (1 - r) * 4));
        det = f * 0.7 + g * 0.3;
      } else {
        // a clod: a rough-edged lump
        const ang = Math.atan2(v, u), r0 = 0.62 + 0.3 * (fbm(n, Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5, 3) - 0.5) * 2;
        a = Math.max(0, Math.min(1, (r0 - r) / 0.08));
        det = fbm(n, u * 4, v * 4, 3);
      }
      const i = ((oy + y) * W + ox + x) * 4;
      data[i] = det * 255; data[i + 1] = data[i + 2] = 255; data[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (atlas = t);
}

const VS = `
attribute vec4 iA; // position, size
attribute vec4 iC; // color, alpha
attribute vec4 iB; // rotation, atlas cell, erosion, ball (1 a lit ball of smoke, 0 a flat clod)
uniform vec3 sunDir;
varying vec2 vQ; varying vec4 vC; varying vec4 vB; varying vec3 vSun; varying vec3 vUp; varying float vNear;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(iA.xyz, 1.0);
  mvPosition.xy += position.xy * iA.w;
  vQ = position.xy * 2.0; vC = iC; vB = iB;
  vSun = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
  vUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  // (smoke right in front of the lens thins out, rather than filling the screen with one blurry sprite)
  vNear = smoothstep(0.3, 1.2 + iA.w * 0.8, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D map; uniform vec3 sunCol; uniform vec3 hemiS; uniform vec3 hemiG; uniform float sunI; uniform float hemiI; uniform float glow;
varying vec2 vQ; varying vec4 vC; varying vec4 vB; varying vec3 vSun; varying vec3 vUp; varying float vNear;
#include <fog_pars_fragment>
void main() {
  float c = cos(vB.x), s = sin(vB.x);
  vec2 r = vec2(c * vQ.x - s * vQ.y, s * vQ.x + c * vQ.y) * 0.5 + 0.5;
  if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) discard;
  vec2 cell = vec2(mod(vB.y, 2.0), floor(vB.y / 2.0)) * 0.5, uv = (r * 0.97 + 0.015) * 0.5 + cell;
  vec4 t = texture2D(map, uv);
  // erosion: as a puff dies its thin parts go first, so it breaks up into wisps instead of fading as one disc
  float a = t.a * smoothstep(vB.z, vB.z + 0.22, t.a) * vC.a * vNear;
  if (a < 0.003) discard;
  // shaded as a ball (lumpy with the texture): the sun side bright, the underside picks up the ground's color
  // (the billows: the density's slope, turned back from the texture's rotation into the quad's frame)
  float e = 1.5 / 256.0;
  vec2 gr = vec2(texture2D(map, uv + vec2(e, 0.0)).a - t.a, texture2D(map, uv + vec2(0.0, e)).a - t.a) * 9.0;
  gr = vec2(c * gr.x + s * gr.y, -s * gr.x + c * gr.y);
  float r2 = min(dot(vQ, vQ), 1.0);
  vec3 n = normalize(vec3(vQ * 0.7 - gr * vB.w, sqrt(1.0 - r2) * 0.8 + 0.3));
  n = normalize(mix(vec3(0.0, 0.0, 1.0), n, vB.w));
  float sun = max(dot(n, vSun), 0.0);
  float sky = dot(n, vUp) * 0.5 + 0.5;
  vec3 L = mix(hemiG, hemiS, sky) * hemiI * 1.1 + sunCol * sunI * (0.1 + 0.42 * sun) + glow;
  // (thick middles shade themselves; thin edges let the light through)
  L *= mix(1.1, 0.8, t.a * vB.w) * (0.78 + 0.44 * t.r);
  gl_FragColor = vec4(vC.rgb * L, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const _col = new Map();
const lin = hex => { let c = _col.get(hex); if (!c) _col.set(hex, c = new THREE.Color(hex)); return c; };

export class TireFX {
  constructor(scene, P) {
    this.scene = scene;
    const f = n => new Float32Array(MAX * n);
    this.pos = f(3); this.vel = f(3); this.age = f(1); this.life = f(1); this.s0 = f(1); this.s1 = f(1); this.grow = f(1);
    this.rot = f(1); this.spin = f(1); this.col = f(4); this.cell = f(1); this.kind = new Uint8Array(MAX); this.gy = f(1);
    this.size = f(1); this.alpha = f(1); this.erode = f(1); this.k = 0; this.n = 0;
    // (a steady breeze for the whole race: what the smoke and dust drift on)
    const wa = Math.random() * Math.PI * 2, ws = 0.5 + Math.random() * 1.1;
    this.wind = [Math.sin(wa) * ws, Math.cos(wa) * ws];
    this.t = 0;

    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA); g.setAttribute('iC', this.aC); g.setAttribute('iB', this.aB);
    g.instanceCount = 0;
    const night = (P.night || 0) > 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        map: { value: null }, sunDir: { value: new THREE.Vector3(...(P.sun || [0.4, 0.8, 0.3])).normalize() },
        sunCol: { value: new THREE.Color(P.sunCol ?? 0xffffff) }, sunI: { value: P.sunI ?? 1.5 },
        hemiS: { value: new THREE.Color(P.hemiS ?? 0xbbccdd) }, hemiG: { value: new THREE.Color(P.hemiG ?? 0x554433) }, hemiI: { value: P.hemiI ?? 0.7 },
        glow: { value: night ? 0.07 : 0 }, // (the track's floodlights)
      }]),
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true,
    });
    this.mat.uniforms.map.value = puffAtlas();
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.order = new Int32Array(MAX); this.depth = new Float32Array(MAX); this.bucket = new Int32Array(129);
    this.sorted = new Int32Array(MAX);
  }

  // one particle. kind SMOKE / DUST / CHUNK; color a hex; s0 -> s1 its size (m) growing at rate grow; life (s); a: opacity; gy: the ground under it
  emit(kind, x, y, z, vx, vy, vz, color, s0, s1, life, a, gy, grow = 1.6) {
    const i = this.k; this.k = (this.k + 1) % MAX;
    const c = lin(color), j = 0.92 + Math.random() * 0.16;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.grow[i] = grow;
    this.rot[i] = Math.random() * Math.PI * 2; this.spin[i] = (Math.random() - 0.5) * (kind === CHUNK ? 14 : 0.9);
    this.col[i * 4] = c.r * j; this.col[i * 4 + 1] = c.g * j; this.col[i * 4 + 2] = c.b * j; this.col[i * 4 + 3] = a;
    this.cell[i] = kind === CHUNK ? 3 : Math.floor(Math.random() * 3); this.kind[i] = kind; this.gy[i] = gy;
  }
  // a puff of smoke or dust: hangs where it's made (carrying a little of the car's speed), swells and drifts
  puff(kind, x, y, z, vx, vz, color, k, gy, big = 1) {
    const dust = kind === DUST, r = Math.random;
    this.emit(kind, x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3,
      vx + (r() - 0.5) * 1.6, (dust ? 0.5 : 0.3) + r() * (dust ? 1.0 : 0.7), vz + (r() - 0.5) * 1.6, color,
      (dust ? 0.9 : 0.55) * (0.8 + 0.4 * r()) * (0.7 + 0.3 * k) * big, ((dust ? 6.5 : 4.2) * (0.75 + 0.5 * r()) * (0.6 + 0.4 * k) + (dust ? 2 : 1.2) * k) * big,
      (dust ? 3.6 : 2.4) * (0.7 + 0.6 * r()) * (0.75 + 0.35 * k), (dust ? 0.17 * Math.min(1.5, 0.5 + 0.5 * FX.dirt) : 0.42) * (0.75 + 0.25 * k), gy, dust ? 1.0 : 1.4);
  }
  // dirt, turf or stones thrown off a tire (vx..vz: their launch velocity)
  chunk(x, y, z, vx, vy, vz, color, s, gy) { this.emit(CHUNK, x, y, z, vx, vy, vz, color, s, s, 0.9 + Math.random() * 0.8, 1, gy, 0); }
  // a cloud from a hit (tire walls, a car into a wall)
  burst(x, y, z, n, color, size, gy = y - 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
      this.emit(DUST, x, y, z, Math.sin(a) * v, 0.8 + Math.random() * 1.5, Math.cos(a) * v, color, size * 0.4, size * (1.4 + Math.random()), 1.4 + Math.random(), 0.45, gy, 1.8);
    }
  }

  // cars: [{ x, z, vx, vz, y }] (their wake stirs the smoke they drive through)
  update(dt, camera, cars) {
    this.t += dt;
    const P = this.pos, V = this.vel, [wx, wz] = this.wind, aA = this.aA.array, aC = this.aC.array, aB = this.aB.array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const fwd = camera.getWorldDirection(this._f || (this._f = new THREE.Vector3()));
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) continue;
      const age = (this.age[i] += dt);
      if (age >= this.life[i]) continue;
      const kd = this.kind[i], i3 = i * 3;
      if (kd === CHUNK) {
        V[i3 + 1] -= 9.81 * dt;
        const d = Math.exp(-dt * 0.4); V[i3] *= d; V[i3 + 2] *= d;
      } else {
        // drag toward the breeze, a slow rise (hot smoke rises more than dust), and a lazy swirl
        const d = 1 - Math.exp(-dt * (kd === SMOKE ? 1.5 : 1.0)), sd = i * 1.618;
        const tx = wx + Math.sin(this.t * 0.9 + sd) * 0.6, tz = wz + Math.cos(this.t * 0.7 + sd * 1.3) * 0.6;
        V[i3] += (tx - V[i3]) * d; V[i3 + 2] += (tz - V[i3 + 2]) * d;
        V[i3 + 1] += ((kd === SMOKE ? 0.45 : 0.1) - V[i3 + 1]) * d * 0.8;
        // a car driving through it drags it along and churns it
        if (cars) for (let c = 0; c < cars.length; c++) {
          const o = cars[c], dx = P[i3] - o.x, dz = P[i3 + 2] - o.z, r2 = dx * dx + dz * dz;
          if (r2 < 9 && P[i3 + 1] - o.y < 2.5) {
            const w = (1 - r2 / 9) * Math.min(1, dt * 4);
            V[i3] += (o.vx * 0.45 - V[i3]) * w; V[i3 + 2] += (o.vz * 0.45 - V[i3 + 2]) * w; V[i3 + 1] += w * 1.2;
          }
        }
      }
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      const f = age / this.life[i];
      let size, alpha, erode = 0;
      if (kd === CHUNK) {
        if (P[i3 + 1] < this.gy[i]) { this.age[i] = this.life[i]; continue; } // (landed)
        size = this.s0[i]; alpha = this.col[i * 4 + 3] * Math.min(1, (1 - f) * 5);
      } else {
        this.spin[i] *= 1 - dt * 0.3;
        size = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - Math.exp(-age * this.grow[i]));
        // in fast, out slowly; the last part of its life it frays apart
        alpha = this.col[i * 4 + 3] * Math.min(1, age / 0.09) * (1 - f * f * 0.5);
        erode = Math.max(0, f - 0.25) * 0.75;
        // (it can't sink into the ground as it swells: it lifts off)
        const floor = this.gy[i] + size * 0.32;
        if (P[i3 + 1] < floor) P[i3 + 1] += (floor - P[i3 + 1]) * Math.min(1, dt * 6);
      }
      const dx = P[i3] - cx, dy = P[i3 + 1] - cy, dz = P[i3 + 2] - cz, dep = dx * fwd.x + dy * fwd.y + dz * fwd.z;
      if (dep < -size) continue; // (behind the camera)
      this.order[n] = i; this.depth[n] = dep; this.size[i] = size;
      // (dust you're looking through thins out the nearer it is, so a dirt race is hazy but never a wall; far clouds stay thick)
      if (kd === DUST) alpha *= 0.2 + 0.8 * Math.min(1, Math.max(0, (dep - 4) / 55));
      this.alpha[i] = alpha; this.erode[i] = erode;
      n++;
    }
    // back to front: a bucket sort on depth (near enough for soft smoke)
    const B = this.bucket; B.fill(0);
    const key = d => Math.max(0, Math.min(127, Math.floor(127 - Math.sqrt(Math.max(0, d)) * 6)));
    for (let k = 0; k < n; k++) B[key(this.depth[k]) + 1]++;
    for (let b = 1; b < 129; b++) B[b] += B[b - 1];
    for (let k = 0; k < n; k++) this.sorted[B[key(this.depth[k])]++] = this.order[k];
    for (let k = 0; k < n; k++) {
      const i = this.sorted[k], o = k * 4;
      aA[o] = P[i * 3]; aA[o + 1] = P[i * 3 + 1]; aA[o + 2] = P[i * 3 + 2]; aA[o + 3] = this.size[i];
      aC[o] = this.col[i * 4]; aC[o + 1] = this.col[i * 4 + 1]; aC[o + 2] = this.col[i * 4 + 2]; aC[o + 3] = this.alpha[i];
      aB[o] = this.rot[i]; aB[o + 1] = this.cell[i]; aB[o + 2] = this.erode[i]; aB[o + 3] = this.kind[i] === CHUNK ? 0 : 1;
    }
    this.n = n;
    this.mesh.geometry.instanceCount = n;
    for (const a of [this.aA, this.aC, this.aB]) { a.clearUpdateRanges?.(); a.addUpdateRange?.(0, n * 4); a.needsUpdate = true; }
  }
}
