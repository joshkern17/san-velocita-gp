// Builds the 3D environment for a track
import * as THREE from 'three';
import { getTextures, getGroundTextures } from './textures.js';
import { circDist, computeSpeedProfile, OPEN_END_WALL, stepIdx, fenceHeight, kerbOn, kerbW, kerbOf, kerbColors, wallTypeAt, KERB_STYLES, SAUSAGE_H } from './track.js';
import { gameHeight } from './terrain.js';
import { applySculpt } from './sculpt.js';
import { footSamples, rectFoot, makePlots } from './pads.js';
import { makeVerge } from './verge.js';
import { placeTrackProps, buildStartGantry, beamCone, beamMaterial, buildCatchFence } from './trackprops.js';
import { runoffLayout, isRunoffPaint, strokeDist, strokeBox, RUN_RES, RUN_SD } from './runoff.js';
import { buildCourthouse, buildBusiness } from './landmarks.js';
import { addRealWorld } from './realworld.js';
import { BUSINESSES } from './zones.js';
import { getBuildingTextures } from './textures.js';
import { collectScenery, polyArea, pointInPoly } from './zones.js';
import { roadLayout } from './roads.js';
import { addEnvInstances, envModel, envAsset, envModelsReady, houseLook } from './envlib.js';
import { settingOf, modelTransform, natureModel, FLORA, PROP_FLORA, fitHouse, randomBuilding, eraser } from './scenery.js';
import { WetReflections } from './weatherfx.js';
import { StreetLife } from './lifefx.js';
import { buildClouds } from './clouds.js';
import { buildPitBoxes, pitCovered, pitBlockTest, pitBlockFloor } from './pitboxes.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';
import { loadCrowd, buildCrowd, makeBleachers, bleacherSeats, paintedPeople, BLEACHERS } from './crowd.js';

// ---------- small utils ----------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// kerb / sidewalk heights above the road, m, shared by the scenery and the physics (race.js groundZ): the circuit's
// painted kerb rises to KERB_H at its outer edge; a circuit sidewalk ramps from there (or the road) up to WALK_H over
// WALK_RAMP; a public road's granite curb stands STREET_CURB over its gutter
export const KERB_H = 0.05, WALK_H = 0.1, WALK_RAMP = 0.9, STREET_CURB = 0.14;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, b) => { let n = a * 374761393 + b * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 0xffff) / 0xffff; };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}
function fbm(x, z, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }

// merge simple geometries with a flat colour each (non-indexed)
function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const T3 = (g, x, y, z) => { g.translate(x, y, z); return g; };

// ---------- environment presets ----------
const TIMES = {
  day:   { top: 0x2f6fc8, hor: 0xc3d8ea, bottom: 0x8a9aa8, sun: [0.45, 0.75, 0.35], sunCol: 0xfff0d6, sunI: 1.7, hemiS: 0xb8d4f4, hemiG: 0x5e5238, hemiI: 0.68, fog: 0xc6d6e2, cloud: 0xffffff, far: 0x9aa4d8, grade: [1.04, 1.0, 0.94], night: 0 },
  dusk:  { top: 0x2a2466, hor: 0xff9a6a, bottom: 0x7a4a6a, sun: [-0.8, 0.12, 0.4], sunCol: 0xffa060, sunI: 1.25, hemiS: 0xb890c8, hemiG: 0x62442e, hemiI: 0.9, fog: 0xe8a08a, cloud: 0xff9a70, far: 0x7a62a8, grade: [1.1, 0.98, 0.9], night: 0 },
  night: { top: 0x03050c, hor: 0x1a2640, bottom: 0x0a0e18, sun: [0.3, 0.6, -0.45], sunCol: 0x9ab4e8, sunI: 0.55, hemiS: 0x55679a, hemiG: 0x1c1e26, hemiI: 0.85, fog: 0x141c2c, cloud: 0x384868, far: 0x241e48, grade: [0.92, 0.97, 1.12], night: 1 },
  // (first light: the sun low in the east, cooler than dusk; an endurance race's clock passes through it)
  dawn:  { top: 0x34447e, hor: 0xffb48a, bottom: 0x6a5a78, sun: [0.8, 0.12, -0.35], sunCol: 0xffb47a, sunI: 1.1, hemiS: 0xa4a8d4, hemiG: 0x52423a, hemiI: 0.82, fog: 0xd8aaa4, cloud: 0xffbca4, far: 0x7a6eb0, grade: [1.06, 0.99, 0.96], night: 0 },
};
// The time of day at an hour (0-24) as a blend of the presets: night until five, first light, day from half past
// seven, dusk round seven in the evening, dark by twenty past eight (an endurance race's clock: setTimeOfDay)
const DAY_KEYS = [[0, 'night'], [5, 'night'], [6.2, 'dawn'], [7.5, 'day'], [17.5, 'day'], [19, 'dusk'], [20.3, 'night'], [24, 'night']];
const COLOR_KEYS = ['top', 'hor', 'bottom', 'sunCol', 'hemiS', 'hemiG', 'fog', 'cloud', 'far'];
function mixDeep(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, k) => mixDeep(v, b[k], t));
  if (a && b && typeof a === 'object') { const o = {}; for (const k of Object.keys(a)) o[k] = k in b ? mixDeep(a[k], b[k], t) : a[k]; return o; }
  return t < 0.5 ? a : b;
}
export function envParamsAt(env, hour) {
  const h = ((hour % 24) + 24) % 24;
  let k = 0; while (k < DAY_KEYS.length - 2 && DAY_KEYS[k + 1][0] <= h) k++;
  const [h0, a] = DAY_KEYS[k], [h1, b] = DAY_KEYS[k + 1], t = h1 > h0 ? (h - h0) / (h1 - h0) : 0, u = t * t * (3 - 2 * t);
  const A = envParams({ ...env, time: a }), B = envParams({ ...env, time: b }), P = mixDeep(A, B, u);
  for (const c of COLOR_KEYS) P[c] = new THREE.Color(A[c]).lerp(new THREE.Color(B[c]), u).getHex();
  const sl = Math.hypot(...P.sun) || 1; P.sun = P.sun.map(v => v / sl);
  P.tod = { a, b, u };
  return P;
}

export function envParams(env) {
  const t = { ...TIMES[env.time] || TIMES.day };
  const w = env.weather;
  const grey = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0x8a9098).multiplyScalar(t.night ? 0.25 : 1), k).getHex();
  t.fogNear = 150; t.fogFar = 1150; t.cloudAmt = 0.5; t.rain = false;
  if (w === 'overcast' || w === 'rain') {
    t.top = grey(t.top, 0.75); t.hor = grey(t.hor, 0.6); t.fog = grey(t.fog, 0.6); t.cloud = grey(t.cloud, 0.4);
    t.sunI *= 0.45; t.hemiI *= 1.05; t.cloudAmt = 1; t.fogFar = 800;
  }
  if (w === 'rain') { t.rain = true; t.fogNear = 40; t.fogFar = 520; t.grip = 0.82; }
  if (w === 'fog') { t.fog = grey(t.fog, 0.5); t.hor = t.fog; t.fogNear = 10; t.fogFar = 260; t.sunI *= 0.6; t.cloudAmt = 0.9; }
  t.grip = t.grip || 1;
  t.look = lookFor(t, env);
  return t;
}

// The grade + atmosphere for the PS2 post pass: split-tone colours, lifted blacks, bloom, and the height mist /
// sun glow the post pass draws from the depth buffer. One per time of day, then the weather shifts it.
function lookFor(t, env) {
  const lin = (hex) => new THREE.Color(hex).toArray();
  const L = {
    day:   { shadow: [0.95, 0.98, 1.06], high: [1.04, 1.0, 0.95], lift: [0.012, 0.014, 0.022], sat: 1.1, contrast: 1.06, bloom: 0.32, bloomThr: 1.05, rays: 0.15,
      haze: { density: 0.0016, base: 0, falloff: 55, sunAmt: 0.5 } },
    dusk:  { shadow: [0.84, 0.85, 1.1], high: [1.14, 0.98, 0.8], lift: [0.035, 0.018, 0.035], sat: 1.14, contrast: 1.08, bloom: 0.5, bloomThr: 0.9, rays: 0.35,
      haze: { density: 0.0015, base: 0, falloff: 32, sunAmt: 0.75 } },
    night: { shadow: [0.8, 0.9, 1.18], high: [1.14, 1.0, 0.78], lift: [0.008, 0.014, 0.036], sat: 1.06, contrast: 1.1, bloom: 0.8, bloomThr: 0.85, rays: 0.05,
      haze: { density: 0.0022, base: 0, falloff: 14, sunAmt: 0.25 } },
    dawn:  { shadow: [0.88, 0.9, 1.08], high: [1.1, 1.0, 0.86], lift: [0.03, 0.022, 0.036], sat: 1.1, contrast: 1.06, bloom: 0.45, bloomThr: 0.92, rays: 0.3,
      haze: { density: 0.0018, base: 0, falloff: 28, sunAmt: 0.7 } },
  }[env.time] || null;
  const k = JSON.parse(JSON.stringify(L || { shadow: [1, 1, 1], high: [1, 1, 1], lift: [0, 0, 0], sat: 1.08, contrast: 1.06, bloom: 0.4, bloomThr: 0.9, haze: { density: 0.0015, base: 0, falloff: 50, sunAmt: 0.4 } }));
  const w = env.weather, h = k.haze;
  if (w === 'overcast') { k.sat *= 0.86; k.shadow = k.shadow.map(v => (v + 1) / 2); k.high = k.high.map(v => (v + 1) / 2); h.density *= 1.5; h.sunAmt *= 0.3; k.rays = (k.rays || 0) * 0.35; }
  if (w === 'rain') { k.sat *= 0.78; k.shadow = [0.9, 0.97, 1.06]; k.high = [0.97, 1.0, 1.02]; h.density *= 1.6; h.falloff = 24; h.sunAmt *= 0.15; k.bloom += 0.15; k.bloomThr *= 0.85; k.rays = 0; }
  if (w === 'fog') { k.sat *= 0.8; h.density = 0.011; h.falloff = 28; h.sunAmt *= 0.5; k.contrast *= 0.96; k.rays = (k.rays || 0) * 0.6; }
  h.color = lin(t.fog); h.farColor = lin(new THREE.Color(t.far ?? t.fog).lerp(new THREE.Color(t.fog), w === 'fog' || w === 'rain' ? 0.7 : 0)); h.sun = lin(t.sunCol).map(v => v * Math.min(1.2, t.sunI)); h.sunDir = t.sun; h.far = t.fogFar;
  return k;
}

// ---------- sky ----------
function buildSky(P) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(P.top) }, hor: { value: new THREE.Color(P.hor) }, bottom: { value: new THREE.Color(P.bottom) },
      sunDir: { value: new THREE.Vector3(...P.sun).normalize() }, sunCol: { value: new THREE.Color(P.sunCol) },
      cloudCol: { value: new THREE.Color(P.cloud) }, night: { value: P.night }, time: { value: 0 }, cloudAmt: { value: P.cloudAmt },
      fogCol: { value: new THREE.Color(P.fog) }, haze: { value: P.fogFar < 400 ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top, hor, bottom, sunDir, sunCol, cloudCol, fogCol; uniform float night, time, cloudAmt, haze;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.07; a*=.5;} return s; }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(hor, top, pow(clamp(h,0.,1.), 0.5));
        col = mix(col, bottom, clamp(-h*5.,0.,1.));
        float sd = max(dot(d, sunDir), 0.);
        col += sunCol * (pow(sd, 900.)*3.0 + pow(sd, 30.)*0.3 + pow(sd, 5.)*0.15*(1.-night));
        if (h > 0.) {
          vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(time*0.004, time*0.001);
          float c = fbm(uv);
          c = smoothstep(0.5 - cloudAmt*0.2, 0.85, c) * smoothstep(0.0, 0.3, h) * (0.35 + cloudAmt*0.55);
          vec3 cc = cloudCol * (0.8 + 0.3*fbm(uv*2.3+3.));
          cc += sunCol * pow(sd, 6.) * 0.4;
          col = mix(col, cc, c);
          if (night > 0.02) { vec3 q = floor(d*260.); float s = hash(q.xy + q.z*17.13); col += step(0.9975, s) * 0.9 * smoothstep(0.,0.3,h) * (1.-c) * smoothstep(0.3, 0.9, night); }
        }
        col = mix(col, fogCol, haze * (1. - smoothstep(0., 0.35, h)) );
        gl_FragColor = vec4(col, 1.);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 12), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// options the game sets from its Options menu (so race.js doesn't have to pass them)
const WORLD_OPTS = { shadows: true };
export function setWorldOptions(o) { Object.assign(WORLD_OPTS, o); }

// ---------- main build ----------
export function buildWorld(track, T, A, opts = {}) {
  let streetStep = () => null; // (set once the streets are built: see below)
  const tx = getTextures();
  const env = track.env;
  const P = envParams(env);
  const theme = env.theme;
  const rng = mulberry(hashStr(track.name || 'x') + T.N);
  const real = collectScenery(track, T, A);
  const hasTown = real.buildings.length > 40;
  const RUN = A.run || (A.run = runoffLayout(T, A, track)); // (the runoff's surfaces: the physics reads them too)
  const pit = A.pit;
  const pitSide = (i, side) => pit && pit.REG[i] >= 0 && side === pit.side;
  const inPitZone = (x, z) => {
    if (!pit) return false;
    let hit = false;
    A.hash.query(x, z, 30, (j) => {
      if (hit || pit.REG[j] < 0) return;
      const sl = ((x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j]) * pit.side;
      const along = Math.abs((x - T.X[j]) * T.FX[j] + (z - T.Z[j]) * T.FZ[j]);
      if (along < T.ds * 2 && sl > T.W[j] / 2 - 1 && sl < pit.CEN[j] + pit.width / 2 + 20) hit = true;
    });
    return hit;
  };
  const root = new THREE.Group();
  const N = T.N;
  const night = P.night > 0;

  // lighting
  const hemi = new THREE.HemisphereLight(P.hemiS, P.hemiG, P.hemiI);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(P.sunCol, P.sunI);
  sun.position.set(...P.sun).multiplyScalar(100);
  root.add(sun); root.add(sun.target);
  // sun shadows (trees, props, buildings) in a box that follows the camera; not at night or under cloud
  // a dirt track's colour (its road material's below: darker in the rain), for its edges drawn by the runoff
  const dirtTint = env.surface === 'dirt' ? new THREE.Color(P.rain ? 0x7a6e66 : 0xffffff) : null;
  const shadowsOn = WORLD_OPTS.shadows && !night && !P.rain && env.weather !== 'overcast' && env.weather !== 'fog';
  if (shadowsOn) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -75; sc.right = sc.top = 75; sc.near = 1; sc.far = 600;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
  }
  // real-elevation tracks: see further in clear / overcast weather so the real hills (and what you built on them) show
  if (track.terrain && track.terrain.ground !== false && !P.rain && env.weather !== 'fog') { P.fogNear = Math.max(P.fogNear, 320); P.fogFar = Math.max(P.fogFar, 1750); }
  const fog = new THREE.Fog(P.fog, P.fogNear, P.fogFar);
  const sky = buildSky(P);
  root.add(sky);
  const clouds = buildClouds(P, env, hashStr(track.name || 'x') % 9973);
  root.add(clouds.mesh);

  // bounds
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, T.X[i]); maxX = Math.max(maxX, T.X[i]); minZ = Math.min(minZ, T.Z[i]); maxZ = Math.max(maxZ, T.Z[i]); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const margin = 520;
  const gx0 = minX - margin, gz0 = minZ - margin;
  const area = (maxX - minX + 2 * margin) * (maxZ - minZ + 2 * margin);
  const step = Math.max(5, Math.min(14, Math.sqrt(area / 110000)));
  const nx = Math.ceil((maxX - minX + 2 * margin) / step) + 1;
  const nz = Math.ceil((maxZ - minZ + 2 * margin) / step) + 1;
  const NV = nx * nz;

  const farD = new Float32Array(NV).fill(1e9);
  const nearD = new Float32Array(NV).fill(1e9);
  const nearI = new Int32Array(NV).fill(-1);
  const cap = new Float32Array(NV).fill(1e9);
  const runoff = env.runoff;

  // far distance field
  const Rf = 380;
  for (let i = 0; i < N; i += 3) {
    const sx = T.X[i], sz = T.Z[i];
    const i0 = Math.max(0, Math.floor((sx - Rf - gx0) / step)), i1 = Math.min(nx - 1, Math.ceil((sx + Rf - gx0) / step));
    const j0 = Math.max(0, Math.floor((sz - Rf - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((sz + Rf - gz0) / step));
    for (let j = j0; j <= j1; j++) {
      const z = gz0 + j * step, dz = z - sz;
      for (let k = i0; k <= i1; k++) {
        const dx = gx0 + k * step - sx; const d2 = dx * dx + dz * dz;
        const id = j * nx + k; if (d2 < farD[id]) farD[id] = d2;
      }
    }
  }
  for (let i = 0; i < NV; i++) farD[i] = Math.sqrt(farD[i]);
  // near field (embankments)
  for (let i = 0; i < N; i++) {
    const sx = T.X[i], sz = T.Z[i], half = T.W[i] / 2, Y = T.Y[i];
    const bridge = A.BRIDGE[i];
    const inner = Math.max(half + runoff, A.BL[i], A.BR[i]) + 3, slope = 28 + Math.abs(Y) * 2.4;
    const R = bridge ? half + 3 : inner + slope;
    const i0 = Math.max(0, Math.floor((sx - R - gx0) / step)), i1 = Math.min(nx - 1, Math.ceil((sx + R - gx0) / step));
    const j0 = Math.max(0, Math.floor((sz - R - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((sz + R - gz0) / step));
    for (let j = j0; j <= j1; j++) {
      const dz = gz0 + j * step - sz;
      for (let k = i0; k <= i1; k++) {
        const dx = gx0 + k * step - sx; const d = Math.sqrt(dx * dx + dz * dz);
        if (d > R) continue;
        const id = j * nx + k;
        if (!bridge) {
          if (d < nearD[id]) { nearD[id] = d; nearI[id] = i; }
          // exact cap: never above the road surface directly over this point
          const along = dx * T.FX[i] + dz * T.FZ[i];
          if (Math.abs(along) <= T.ds * 0.6) {
            const lat = dx * T.RX[i] + dz * T.RZ[i];
            if (Math.abs(lat) < half + step * 1.2) {
              const c = Y + Math.max(-half, Math.min(half, lat)) * Math.sin(T.B[i]) - 0.15 - (Math.abs(lat) > half - 1 ? Math.abs(Math.sin(T.B[i])) * 1.6 : 0);
              if (c < cap[id]) cap[id] = c;
            }
          }
        }
      }
    }
  }
  const H = new Float32Array(NV);
  const hillK = track.osm ? 0.25 : 1;
  const baseH0 = (x, z, fd) => {
    if (theme === 'grass') return (fbm(x / 340, z / 340) * 70 - 22) * smoothstep(90, 380, fd) + (fbm(x / 60, z / 60) - 0.5) * 3;
    if (theme === 'desert') { const r = 1 - Math.abs(fbm(x / 260, z / 260) * 2 - 1); return (r * r * 45 - 6) * smoothstep(80, 340, fd) + (fbm(x / 40, z / 40) - 0.5) * 2; }
    if (theme === 'coast') return lerp(2.5, -14, smoothstep(70, 230, fd)) + (fbm(x / 120, z / 120) - 0.5) * 8 * smoothstep(30, 120, fd);
    return (fbm(x / 500, z / 500) - 0.5) * 2 * smoothstep(100, 300, fd);
  };
  // real-world elevation (from the map) replaces the made-up hills
  const terr = track.terrain && track.terrain.ground !== false ? track.terrain : null;
  const baseH = terr ? (x, z) => gameHeight(terr, x, z) - 0.4
    : (x, z, fd) => theme === 'coast' ? baseH0(x, z, fd) : baseH0(x, z, fd) * hillK;
  // the land (made-up hills or the real ground) blended into the circuit's embankments, then your sculpting
  // (editor SCULPT tool) on top of that, fading out only right at the runoff / barriers: a hill you build 30 m from
  // the track is really there, and flattening next to a raised track levels what you see
  const sculptFade = new Float32Array(NV).fill(1);
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const id = j * nx + k, x = gx0 + k * step, z = gz0 + j * step;
    let h = baseH(x, z, farD[id]);
    // embankment: follow the NEAREST road sample (incl. its banking) so hills stay supported
    const ni = nearI[id];
    if (ni >= 0) {
      const d = nearD[id], half = T.W[ni] / 2, Yi = T.Y[ni];
      const sl = (x - T.X[ni]) * T.RX[ni] + (z - T.Z[ni]) * T.RZ[ni];
      const yn = Yi + Math.max(-half, Math.min(half, sl)) * Math.sin(T.B[ni]) - 0.18;
      // real terrain: cuttings / embankments only as wide as the height difference needs (about 2:1)
      const inner = Math.max(half + runoff, A.BL[ni], A.BR[ni]) + 3, slope = terr ? 8 + Math.abs(yn - h) * 2 : 28 + Math.abs(Yi) * 2.4;
      const w = d < inner ? 1 : 1 - smoothstep(0, 1, (d - inner) / slope);
      h = lerp(h, yn, w);
      sculptFade[id] = smoothstep(inner, inner + 14, d);
    }
    H[id] = h;
  }
  if (track.sculpt && track.sculpt.length) {
    const S = H.slice(); applySculpt(track.sculpt, S, nx, nz, gx0, gz0, step);
    for (let i = 0; i < NV; i++) H[i] += (S[i] - H[i]) * sculptFade[i];
  }
  // every building's footprint: each gets a level plot cut into / built up from the hillside (pads.js, below)
  const padFeet = [];
  {
    const feet = padFeet; feet.push(...real.buildings.filter(b => !b.far && b.p && b.p.length >= 3).map(b => b.p));
    for (const p of track.props || []) {
      const d = BUSINESSES[p.type] ? { w: BUSINESSES[p.type].w, d: BUSINESSES[p.type].d } : p.type === 'courthouse' ? { w: 44, d: 32 } : p.type === 'building' ? { w: 22, d: 18 } : p.type === 'tower' ? { w: 24, d: 24 } : null;
      if (d) feet.push(rectFoot(p.x, p.z, p.rot || 0, d.w / 2, d.d / 2));
    }
  }
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const id = j * nx + k;
    let h = Math.min(H[id], cap[id]);
    const border = Math.min(k, j, nx - 1 - k, nz - 1 - j) * step;
    if (theme !== 'coast' && !terr) h = lerp(-1.5, h, smoothstep(0, 120, border));
    H[id] = h;
  }
  // ---- barriers are never buried: a flat shelf behind every barrier, then the ground may rise at 1:1 ----
  {
    const sep = Math.ceil(40 / T.ds), shelf = Math.max(2.5, step * 1.5); // (wide enough that no grid triangle leans over the barrier)
    for (let i = 0; i < N; i++) {
      if (A.BRIDGE[i]) continue;
      const half = T.W[i] / 2, reach = Math.max(A.BL[i], A.BR[i]) + shelf + 30;
      const win = Math.max(T.ds, step) * 0.75;
      const k0 = Math.max(0, Math.floor((T.X[i] - reach - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((T.X[i] + reach - gx0) / step));
      const j0 = Math.max(0, Math.floor((T.Z[i] - reach - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((T.Z[i] + reach - gz0) / step));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const x = gx0 + k * step, z = gz0 + j * step, dx = x - T.X[i], dz = z - T.Z[i];
        if (Math.abs(dx * T.FX[i] + dz * T.FZ[i]) > win) continue;
        const lat = dx * T.RX[i] + dz * T.RZ[i], side = lat < 0 ? -1 : 1, al = Math.abs(lat);
        if (al < half) continue;
        const off = side < 0 ? A.BL[i] : A.BR[i];
        if (al > off + shelf + 30) continue;
        const id = j * nx + k, ni = nearI[id];
        // this section's own runoff, up to its barrier, is always clear down to its track edge (even where a higher
        // section's runoff overlaps it, back to back at a hairpin: the barriers there become a retaining wall);
        // beyond the barrier, ground nearest another (higher) section is that section's, from a grid cell past this
        // barrier on (cutting it all away left switchbacks perched on cliffs). Within that cell this section wins:
        // where two runoffs at different heights meet back to back, the grid can't make a step at the barrier, and
        // the higher runoff dipping a little at its wall beats ground rising up in front of the lower barrier.
        const inside = al <= off + 0.6;
        if (!inside && ni >= 0 && circDist(ni, i, N) > sep && T.Y[ni] > T.Y[i] + 1 && al > off + step * 1.05) continue;
        const edgeY = T.Y[i] + side * half * Math.sin(T.B[i]);
        const c = inside ? edgeY - 0.1 : edgeY + 0.5 + Math.max(0, al - off - shelf);
        if (H[id] > c) H[id] = c;
      }
    }
  }
  // ---- public roads (editor ROADS tool): level the ground under them, never inside the circuit's own area ----
  const roadL = A.roadL || ((track.roads || []).length ? roadLayout(track, T, A) : null);
  if (roadL && roadL.pieces.length) {
    const hAt = (x, z) => {
      const fx = Math.max(0, Math.min(nx - 1.001, (x - gx0) / step)), fz = Math.max(0, Math.min(nz - 1.001, (z - gz0) / step));
      const k = Math.floor(fx), j = Math.floor(fz), u = fx - k, v = fz - j;
      return (H[j * nx + k] * (1 - u) + H[j * nx + k + 1] * u) * (1 - v) + (H[(j + 1) * nx + k] * (1 - u) + H[(j + 1) * nx + k + 1] * u) * v;
    };
    const rw = new Float32Array(NV), ry = new Float32Array(NV), CY = new Float32Array(NV).fill(Infinity);
    const RD = new Float32Array(NV).fill(Infinity), CD = new Float32Array(NV).fill(Infinity);
    const GRADE = 0.07, CLEAR = 7.6; // ramp gradient; height of a bridge deck over (or tunnel floor under) the track
    for (const pc of roadL.pieces) {
      const S = pc.s, raw = S.map(q => hAt(q.x, q.z));
      const ys = raw.map((_, i) => { let a = 0, n = 0; for (let k = -4; k <= 4; k++) { const q = raw[i + k]; if (q !== undefined) { a += q; n++; } } return a / n; }); // smooth along the road
      // bridges over / tunnels under the circuit: a flat span + ramps at GRADE either side
      for (let i = 0; i < S.length;) {
        if (!S[i].span) { i++; continue; }
        let e = i; while (e + 1 < S.length && S[e + 1].span && !!S[e + 1].br === !!S[i].br) e++;
        const over = !!S[i].br, ty = S.slice(i, e + 1).map(q => q.ti >= 0 ? T.Y[q.ti] + A.LIFT[q.ti] : 0);
        const lvl = over ? Math.max(...ty, ...raw.slice(i, e + 1)) + CLEAR : Math.min(...ty) - CLEAR;
        const d0 = S[i].d, d1 = S[e].d;
        for (let q = 0; q < S.length; q++) {
          const dist = S[q].d < d0 ? d0 - S[q].d : S[q].d > d1 ? S[q].d - d1 : 0;
          ys[q] = over ? Math.max(ys[q], lvl - dist * GRADE) : Math.min(ys[q], lvl + dist * GRADE);
        }
        i = e + 1;
      }
      // open junctions: meet the track edge exactly
      S.forEach((q, i) => {
        if (!q.blend) return;
        const ti = q.blend.ti, edgeY = T.Y[ti] + q.blend.side * T.W[ti] / 2 * Math.sin(T.B[ti]) + A.LIFT[ti] + 0.02;
        ys[i] = lerp(ys[i], edgeY, smoothstep(0, 1, q.blend.t));
      });
      S.forEach((q, i) => { q.rawY = raw[i]; q.y = ys[i]; q.elev = ys[i] - raw[i] > 1.2; q.elevLow = ys[i] < raw[i] - 1.2; });
      pc.y = ys;
      const R0 = pc.w / 2 + pc.walk + 0.8 + step * 1.05, R1 = R0 + Math.max(6, step * 1.6); // flat out a full grid cell past the edge so no triangle can cover the road
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
        if (a.elev || b.elev || a.hide || b.hide) continue; // raised on a deck (pillars) / underground in a tunnel
        const carve = false; // (walled cuttings removed: dips are levelled with gentle slopes like any road)
        const k0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R1 - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + R1 - gx0) / step));
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R1 - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z) + R1 - gz0) / step));
        for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          const id = j * nx + k, x = gx0 + k * step, z = gz0 + j * step;
          const ni = nearI[id];
          if (ni >= 0 && nearD[id] < Math.max(T.W[ni] / 2 + runoff, A.BL[ni], A.BR[ni]) + 3) continue; // the circuit's ground always wins
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
          const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
          if (d > R1) continue;
          const wgt = d < R0 ? 1 : 1 - smoothstep(R0, R1, d);
          const yy = pc.y[i] + (pc.y[i + 1] - pc.y[i]) * t - 0.06;
          // every point near the road takes the road's height at its NEAREST point (no stair-steps)
          if (carve) { if (d < R0 + step * 0.5 && d < CD[id]) { CD[id] = d; CY[id] = yy; } continue; } // tunnel cutting: walls hide the edge
          if (d < R0) { if (d < RD[id]) { RD[id] = d; rw[id] = 1; ry[id] = yy; } }
          else if (wgt > rw[id]) { rw[id] = wgt; ry[id] = yy; }
        }
      }
    }
    // junction aprons (and the sidewalks round their corners) sit on levelled ground too, even inside the
    // circuit's runoff: it's never raised above the track surface (cap), so the track edge stays clear
    for (const jn of roadL.junctions || []) {
      if (jn.E.y === undefined) continue;
      const P = jn.poly, e0 = T.Y[P[0].ti] + jn.side * T.W[P[0].ti] / 2 * Math.sin(T.B[P[0].ti]) + A.LIFT[P[0].ti];
      const R0 = jn.walk + 0.8 + step * 1.05, R1 = R0 + Math.max(4, step);
      const k0 = Math.max(0, Math.floor((jn.bb[0] - R1 - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((jn.bb[2] + R1 - gx0) / step));
      const j0 = Math.max(0, Math.floor((jn.bb[1] - R1 - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((jn.bb[3] + R1 - gz0) / step));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const id = j * nx + k, x = gx0 + k * step, z = gz0 + j * step, ni = nearI[id];
        if (ni < 0 || ((x - T.X[ni]) * T.RX[ni] + (z - T.Z[ni]) * T.RZ[ni]) * jn.side < 0) continue; // (not the far side of the track)
        let inside = false, d = Infinity;
        for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
          const p = P[a], q = P[b];
          if ((p.z > z) !== (q.z > z) && x < (q.x - p.x) * (z - p.z) / (q.z - p.z) + p.x) inside = !inside;
          const dx = q.x - p.x, dz = q.z - p.z, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1e-9)));
          d = Math.min(d, Math.hypot(x - p.x - dx * t, z - p.z - dz * t));
        }
        if (inside) d = 0;
        if (d > R1) continue;
        const wgt = d < R0 ? 1 : 1 - smoothstep(R0, R1, d);
        const gap = Math.max(0, nearD[id] - T.W[ni] / 2), wE = Math.min(1, gap / jn.gapE);
        const yy = T.Y[ni] + jn.side * T.W[ni] / 2 * Math.sin(T.B[ni]) + A.LIFT[ni] + wE * (jn.E.y - e0) - 0.06;
        if (wgt >= rw[id]) { rw[id] = wgt; ry[id] = yy; }
      }
    }
    for (let i = 0; i < NV; i++) { if (rw[i] > 0) H[i] = Math.min(cap[i], lerp(H[i], ry[i], rw[i])); if (CY[i] < H[i]) H[i] = CY[i]; }
  }
  const gx1 = gx0 + (nx - 1) * step, gz1 = gz0 + (nz - 1) * step;
  // the ground: the terrain, plus the building plots once they're made (with the terrain mesh, below)
  let plotDelta = null, verge = null;
  const groundHeight = (x, z) => {
    // (on the runoff: flat at the track edge, exactly, up to the barrier: verge.js)
    if (verge) { const a = verge.at(x, z); if (a) return a.y; }
    const h = terrainHeight(x, z); return plotDelta ? h + plotDelta(x, z) : h;
  };
  const terrainHeight = (x, z) => {
    if (terr && (x < gx0 || z < gz0 || x > gx1 || z > gz1)) return gameHeight(terr, x, z) - 0.4;
    const fx = (x - gx0) / step, fz = (z - gz0) / step;
    const k = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - k)), v = Math.max(0, Math.min(1, fz - j));
    const a = H[j * nx + k], b = H[j * nx + k + 1], c = H[(j + 1) * nx + k], d = H[(j + 1) * nx + k + 1];
    // match triangle split used by the mesh
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const farDist = (x, z) => {
    const k = Math.max(0, Math.min(nx - 1, Math.round((x - gx0) / step))), j = Math.max(0, Math.min(nz - 1, Math.round((z - gz0) / step)));
    return farD[j * nx + k];
  };

  // ---- painted ground (editor PAINT tool): rasterise the brush strokes onto the terrain grid ----
  // value per vertex 0..1 (soft edges); later strokes win, "erase" strokes remove paint
  let PM = null;
  if (track.paint && track.paint.length) {
    PM = new Float32Array(NV);
    for (const st of track.paint) {
      if (st.kind === 'flora' && !(FLORA[st.mix] || FLORA.mixed).ground) continue; // (desert scrub, rocks: no grass under them)
      if (isRunoffPaint(st)) continue; // (paved and gravel: the runoff's own, runoff.js)
      if (st.kind === 'crowd') continue; // (people stand on whatever ground is there)
      if (st.kind === 'erase' && st.what && !st.what.includes('g')) continue; // (an eraser set to leave the grass alone)
      const r = st.r || 8, pts = st.pts || [], erase = st.kind === 'erase';
      if (st.area) { // (a shape: everything inside its outline, the edge softened over a grid step)
        if (pts.length < 3) continue;
        const [x0, z0, x1, z1] = strokeBox(st);
        const k0 = Math.max(0, Math.floor((x0 - 2 - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((x1 + 2 - gx0) / step));
        const j0 = Math.max(0, Math.floor((z0 - 2 - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((z1 + 2 - gz0) / step));
        for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          const cover = 1 - smoothstep(r - Math.min(3, step) / 2, r + Math.min(3, step) / 2, strokeDist(st, gx0 + k * step, gz0 + j * step));
          if (cover <= 0) continue;
          const id = j * nx + k; PM[id] = Math.max(PM[id], cover);
        }
        continue;
      }
      for (let s = 0; s < pts.length; s++) {
        const a = pts[s], b = pts[Math.min(pts.length - 1, s + 1)];
        const x0 = Math.min(a[0], b[0]) - r - 2, x1 = Math.max(a[0], b[0]) + r + 2, z0 = Math.min(a[1], b[1]) - r - 2, z1 = Math.max(a[1], b[1]) + r + 2;
        const k0 = Math.max(0, Math.floor((x0 - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((x1 - gx0) / step));
        const j0 = Math.max(0, Math.floor((z0 - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((z1 - gz0) / step));
        const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
        for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          const x = gx0 + k * step, z = gz0 + j * step;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
          const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
          const cover = 1 - smoothstep(r - Math.min(3, step), r + 1, d);
          if (cover <= 0) continue;
          const id = j * nx + k;
          PM[id] = erase ? PM[id] * (1 - cover) : Math.max(PM[id], cover);
        }
      }
    }
  }
  const paintAt = (x, z) => {
    if (!PM) return 0;
    const k = Math.max(0, Math.min(nx - 1, Math.round((x - gx0) / step))), j = Math.max(0, Math.min(nz - 1, Math.round((z - gz0) / step)));
    return PM[j * nx + k];
  };

  // ---- terrain mesh ----
  {
    const pos = new Float32Array(NV * 3), col = new Float32Array(NV * 3), uv = new Float32Array(NV * 2);
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
      const id = j * nx + k, x = gx0 + k * step, z = gz0 + j * step, h = H[id];
      pos[id * 3] = x; pos[id * 3 + 1] = h; pos[id * 3 + 2] = z;
      uv[id * 2] = x / 10; uv[id * 2 + 1] = z / 10;
      const n1 = fbm(x / 45, z / 45), n2 = vnoise(x / 9, z / 9);
      const nd = nearD[id], ni = nearI[id];
      const half = ni >= 0 ? T.W[ni] / 2 : 6;
      const inRun = nd < half + runoff + 2;
      if (theme === 'grass') {
        c.setRGB(0.3 + n1 * 0.16, 0.44 + n1 * 0.16, 0.18 + n2 * 0.06);
        if (h > 12) c.lerp(new THREE.Color(0.52, 0.5, 0.3), smoothstep(12, 40, h) * 0.5);
        if (inRun) { const stripe = (Math.floor((x + z) / 12) % 2) ? 0.04 : 0; c.setRGB(0.38 + stripe, 0.56 + stripe, 0.24); }
      } else if (theme === 'desert') {
        c.setRGB(0.78 + n1 * 0.12, 0.55 + n1 * 0.1, 0.34 + n2 * 0.08);
        if (h > 8) c.lerp(new THREE.Color(0.62, 0.32, 0.2), smoothstep(8, 30, h) * 0.7);
        if (inRun) c.setRGB(0.84, 0.66, 0.44);
      } else if (theme === 'city') {
        const g = 0.32 + n2 * 0.06;
        c.setRGB(g, g, g * 1.04);
        if (nd < half + runoff + 7) c.setRGB(0.56 + n2 * 0.05, 0.55 + n2 * 0.05, 0.52);
        else if (n1 > 0.62 && farD[id] > 40) c.setRGB(0.3, 0.45, 0.2);
      } else {
        if (h < -0.3) c.setRGB(0.52 + n2 * 0.08, 0.48, 0.34);
        else if (h < 1.4) c.setRGB(0.86 + n2 * 0.06, 0.77 + n2 * 0.05, 0.56);
        else c.setRGB(0.32 + n1 * 0.12, 0.5 + n1 * 0.14, 0.22);
        if (inRun && h >= 1.4) c.setRGB(0.4, 0.56, 0.26);
      }
      if (PM && PM[id] > 0) { // painted grass (mown stripes)
        const stripe = (Math.floor((x + z * 0.35) / 9) % 2) ? 0.035 : 0;
        const gcol = new THREE.Color(0.27 + n1 * 0.1 + stripe, 0.47 + n1 * 0.12 + stripe, 0.18 + n2 * 0.05);
        c.lerp(gcol, Math.min(1, PM[id]));
      }
      col[id * 3] = c.r; col[id * 3 + 1] = c.g; col[id * 3 + 2] = c.b;
    }
    // building plots (pads.js): level ground cut into / built up from the hillside under every building. The grid
    // cells they touch are re-meshed at ~2 m (below) instead of drawn here.
    const plotAvoid = (x, z) => {
      if (roadL && roadL.onRoad(x, z, 0.8)) return 0;
      let f = 1;
      A.hash.query(x, z, 60, (j) => { const need = Math.max(A.BL[j], A.BR[j], T.W[j] / 2 + runoff) + 1, d = Math.hypot(x - T.X[j], z - T.Z[j]); if (d < need + 6) f = Math.min(f, smoothstep(need, need + 6, d)); });
      return roadL && roadL.onRoad(x, z, 3.5) ? f * 0.4 : f;
    };
    const plots = makePlots(padFeet, terrainHeight, plotAvoid);
    const cellMask = new Uint8Array((nx - 1) * (nz - 1));
    if (plots) for (const m of plots.list) {
      const k0 = Math.max(0, Math.floor((m.bb[0] - gx0) / step)), k1 = Math.min(nx - 2, Math.floor((m.bb[2] - gx0) / step));
      const j0 = Math.max(0, Math.floor((m.bb[1] - gz0) / step)), j1 = Math.min(nz - 2, Math.floor((m.bb[3] - gz0) / step));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) cellMask[j * (nx - 1) + k] = 1;
    }
    // The runoff (verge.js): its own mesh following the circuit, flat at the track edge out to the barrier. The
    // terrain under it is tucked out of sight, and just behind a wall it's tucked down too (the wall's top caps it),
    // so where two levels meet the step is exactly at the wall. Grid cells that need it are re-meshed (~3 m).
    const fineN = Math.max(1, Math.round(step / 3.6)), fineS = step / fineN, trenchW = fineS * 1.3 + 0.3;
    const V = makeVerge(T, A, env, roadL);
    const tucked = (x, z, h) => {
      const a = V.at(x, z); if (a) h = Math.min(h, a.y - 0.15);
      const w = V.behindWall(x, z, trenchW); if (w !== null) h = Math.min(h, w - 0.15);
      // under the pit garages: below their floor, out past the walls far enough that no ~3 m triangle can bring it up
      // through a room's floor, then a bank back up to the ground round it
      const g = blockFloor && blockFloor(x, z); if (g) h = Math.min(h, g.y - 0.12 + Math.max(0, g.d - blockM) * 0.5);
      return h;
    };
    const blockM = fineS * 1.5 + 0.3, blockFloor = pitBlockFloor(T, A, A.pit, blockM + 30);
    let reach = 0; for (let i = 0; i < N; i++) reach = Math.max(reach, V.EXT[0][i], V.EXT[1][i]);
    reach += trenchW;
    for (let j = 0; j < nz - 1; j++) for (let k = 0; k < nx - 1; k++) {
      const cell = j * (nx - 1) + k; if (cellMask[cell]) continue;
      const a = j * nx + k; if (Math.min(nearD[a], nearD[a + 1], nearD[a + nx], nearD[a + nx + 1]) > reach + step * 1.5 && !(blockFloor && blockFloor(gx0 + (k + 0.5) * step, gz0 + (j + 0.5) * step))) continue;
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const x = gx0 + (k + u) * step, z = gz0 + (j + v) * step, h = terrainHeight(x, z);
        if (h - tucked(x, z, h) > 0.05) { cellMask[cell] = 2; break; }
      }
    }
    // (plus a ring of one cell round them, so the tucked ground sits inside and the ring's outer edge meets the grid)
    { const C = nx - 1, ring = [];
      for (let j = 0; j < nz - 1; j++) for (let k = 0; k < C; k++) if (cellMask[j * C + k] === 2)
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const jj = j + b, kk = k + a; if (jj >= 0 && kk >= 0 && jj < nz - 1 && kk < C && !cellMask[jj * C + kk]) ring.push(jj * C + kk); }
      for (const c of ring) cellMask[c] = 2; }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let k = 0; k < nx - 1; k++) {
      if (cellMask[j * (nx - 1) + k]) continue;
      const a = j * nx + k, b = a + 1, c2 = a + nx, d = c2 + 1;
      idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx.subarray(0, q), 1));
    g.computeVertexNormals();
    const terrMat = groundMaterial(theme);
    const m = new THREE.Mesh(g, terrMat);
    root.add(m);
    // the plot cells, re-meshed at ~3 m: the coarse surface (so the seams with the grid match exactly) plus the
    // plots' cut and fill, coloured like the ground around them
    const colAt = (x, z) => { // bilinear ground colour
      const fx = Math.max(0, Math.min(nx - 1.001, (x - gx0) / step)), fz = Math.max(0, Math.min(nz - 1.001, (z - gz0) / step));
      const k = Math.floor(fx), j = Math.floor(fz), u = fx - k, v = fz - j, a = j * nx + k;
      return [0, 1, 2].map(c => (col[a * 3 + c] * (1 - u) + col[(a + 1) * 3 + c] * u) * (1 - v) + (col[(a + nx) * 3 + c] * (1 - u) + col[(a + nx + 1) * 3 + c] * u) * v);
    };
    if (plots || cellMask.includes(2)) {
      const n = fineN, fs = fineS, map = new Map(), P = [], Cc = [], Uv = [], I = [];
      const vid = (gk, gj) => {
        const key = gj * (nx * n + 1) + gk; let i = map.get(key);
        if (i === undefined) {
          const x = gx0 + gk * fs, z = gz0 + gj * fs, c = colAt(x, z);
          // (the exact runoff only where every cell round this point is re-meshed: on an edge shared with the coarse
          // grid it must match the grid, or the ground would crack)
          const ck = Math.floor(gk / n), cj = Math.floor(gj / n), ks = gk % n ? [ck] : [ck - 1, ck], js = gj % n ? [cj] : [cj - 1, cj];
          let all = true, corr = false;
          for (const jj of js) for (const kk of ks) { if (jj < 0 || kk < 0 || jj > nz - 2 || kk > nx - 2) { all = false; continue; } const m = cellMask[jj * (nx - 1) + kk]; if (!m) all = false; if (m === 2) corr = true; }
          const h0 = terrainHeight(x, z), pd = plots ? plots.delta(x, z) : 0;
          const d = (all && corr ? tucked(x, z, h0 + pd) : h0 + pd) - h0;
          // (cut faces and banks a touch darker and browner: bare earth showing through)
          const e = Math.min(1, Math.abs(d) / 3) * 0.25;
          i = P.length / 3; map.set(key, i);
          P.push(x, terrainHeight(x, z) + d, z); Cc.push(c[0] * (1 - e) + 0.36 * e, c[1] * (1 - e) + 0.3 * e, c[2] * (1 - e) + 0.2 * e); Uv.push(x / 10, z / 10);
        }
        return i;
      };
      for (let j = 0; j < nz - 1; j++) for (let k = 0; k < nx - 1; k++) {
        if (!cellMask[j * (nx - 1) + k]) continue;
        for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
          const gk = k * n + a, gj = j * n + b;
          const v00 = vid(gk, gj), v10 = vid(gk + 1, gj), v01 = vid(gk, gj + 1), v11 = vid(gk + 1, gj + 1);
          I.push(v00, v01, v10, v10, v01, v11); // (same split as the coarse grid, so its diagonal crease lines up)
        }
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      pg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      pg.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
      pg.setIndex(I);
      pg.computeVertexNormals();
      const pm = new THREE.Mesh(pg, terrMat); pm.name = 'plots';
      root.add(pm);
      if (plots) plotDelta = plots.delta;
    }
    // the runoff itself: a strip each side from just under the road edge out to its reach, flat at the track edge,
    // in the ground's own colours, with its paved, gravel and painted grass on top (runoffMaterial). run: per vertex
    // the sample (unwrapped, so a loop's last row interpolates into its first), m from the track edge, side, and 1
    // on the top (0 down the earth skirt)
    {
      const P = [], Cc = [], Uv = [], I = [], Rn = [];
      for (let sd = 0; sd < 2; sd++) {
        const side = sd ? 1 : -1, EXT = V.EXT[sd], AY = V.AY[sd];
        let prev = null;
        for (let i = 0; i <= N; i++) {
          const k = i % N;
          if (i === N && T.open) break;
          if (T.open && k === T.cut + 1) prev = null; // (nothing joins the end of the run-off to the back of the grid)
          if (!EXT[k]) { prev = null; continue; }
          const half = T.W[k] / 2, e = EXT[k], cols = [half - 0.4, Math.min(e, half + 1.6), (Math.min(e, half + 1.6) + e) / 2, e];
          const row = cols.map(t => {
            const x = T.X[k] + T.RX[k] * side * t, z = T.Z[k] + T.RZ[k] * side * t, c = colAt(x, z);
            P.push(x, AY[k], z); Cc.push(c[0], c[1], c[2]); Uv.push(x / 10, z / 10); Rn.push(i, t - half, sd, 1); return P.length / 3 - 1;
          });
          // an earth skirt down the outer edge, wherever the ground beyond falls away below the runoff
          { const x = T.X[k] + T.RX[k] * side * (e + 0.05), z = T.Z[k] + T.RZ[k] * side * (e + 0.05);
            const nat = terrainHeight(x, z) + (plots ? plots.delta(x, z) : 0), c = colAt(x, z);
            P.push(x, Math.min(AY[k], nat) - 0.4, z); Cc.push(c[0] * 0.6 + 0.12, c[1] * 0.55 + 0.1, c[2] * 0.5 + 0.07); Uv.push(x / 10, z / 10 + 0.3); Rn.push(i, e - half, sd, 0); row.push(P.length / 3 - 1); }
          if (prev) for (let c = 0; c < 4; c++) {
            const a = prev[c], b = prev[c + 1], c2 = row[c], d = row[c + 1];
            if (side > 0) I.push(a, c2, b, b, c2, d); else I.push(a, b, c2, b, d, c2);
          }
          prev = row;
        }
      }
      if (I.length) {
        const vg = new THREE.BufferGeometry();
        vg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        vg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
        vg.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
        vg.setAttribute('run', new THREE.Float32BufferAttribute(Rn, 4));
        vg.setIndex(I); vg.computeVertexNormals();
        const vm = new THREE.Mesh(vg, runoffMaterial(groundMaterial(theme), RUN, theme, dirtTint)); vm.material.side = THREE.DoubleSide; vm.name = 'verge';
        vm.material.polygonOffset = true; vm.material.polygonOffsetFactor = -1; vm.material.polygonOffsetUnits = -1;
        root.add(vm);
      }
      // a dirt track's edges: the runoff's surface laid over the last DIRT_EDGE m of the track, showing through the
      // dirt in ragged clumps (runoffMaterial) that close up solid at the track's edge. All on the track, so what
      // looks like grass or gravel is grass or gravel, and the dirt's look never reaches past the dirt
      if (dirtTint && RUN) {
        const Pb = [], Cb = [], Ub = [], Ib = [], Rb = [];
        for (let sd = 0; sd < 2; sd++) {
          const side = sd ? 1 : -1, EXT = V.EXT[sd];
          let prev = null;
          for (let i = 0; i <= N; i++) {
            const k = i % N;
            if (i === N && T.open) break;
            if (T.open && k === T.cut + 1) prev = null;
            if (!EXT[k]) { prev = null; continue; }
            const half = T.W[k] / 2;
            const row = [half - DIRT_EDGE, half - DIRT_EDGE / 2, half].map(t => {
              const x = T.X[k] + T.RX[k] * side * t, z = T.Z[k] + T.RZ[k] * side * t, c = colAt(x, z);
              Pb.push(x, T.Y[k] + side * t * Math.sin(T.B[k]) + A.LIFT[k] + 0.02, z); Cb.push(c[0], c[1], c[2]); Ub.push(x / 10, z / 10); Rb.push(i, t - half, sd, 1);
              return Pb.length / 3 - 1;
            });
            if (prev) for (let c = 0; c < 2; c++) {
              const a = prev[c], b = prev[c + 1], c2 = row[c], d = row[c + 1];
              if (side > 0) Ib.push(a, c2, b, b, c2, d); else Ib.push(a, b, c2, b, d, c2);
            }
            prev = row;
          }
        }
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(Pb, 3));
        bg.setAttribute('color', new THREE.Float32BufferAttribute(Cb, 3));
        bg.setAttribute('uv', new THREE.Float32BufferAttribute(Ub, 2));
        bg.setAttribute('run', new THREE.Float32BufferAttribute(Rb, 4));
        bg.setIndex(Ib); bg.computeVertexNormals();
        const bm = new THREE.Mesh(bg, runoffMaterial(groundMaterial(theme), RUN, theme, dirtTint)); bm.material.side = THREE.DoubleSide; bm.name = 'dirtEdge';
        bm.material.polygonOffset = true; bm.material.polygonOffsetFactor = -3; bm.material.polygonOffsetUnits = -3; // (over the track's -2)
        root.add(bm);
      }
      verge = V; verge.trenchW = trenchW;
    }
    // real elevation: a coarser ring of ground out to ~1.6 km so the hills you see from the track are real.
    // It dips 1 m under the detailed patch (which draws over it) and eases down to the ground plane at its rim.
    if (terr) {
      // (older tracks downloaded a smaller area: stop at the edge of the data instead of stretching it)
      const FAR = 1600, fs = 32;
      const fx0 = Math.max(minX - FAR, terr.x0), fz0 = Math.max(minZ - FAR, terr.z0);
      const fx1 = Math.min(maxX + FAR, terr.x0 + (terr.nx - 1) * terr.step), fz1 = Math.min(maxZ + FAR, terr.z0 + (terr.nz - 1) * terr.step);
      const fnx = Math.max(2, Math.ceil((fx1 - fx0) / fs) + 1), fnz = Math.max(2, Math.ceil((fz1 - fz0) / fs) + 1);
      const fp = new Float32Array(fnx * fnz * 3), fc = new Float32Array(fnx * fnz * 3), fu = new Float32Array(fnx * fnz * 2);
      const cc = new THREE.Color();
      for (let j = 0; j < fnz; j++) for (let k = 0; k < fnx; k++) {
        const id = j * fnx + k, x = fx0 + k * fs, z = fz0 + j * fs;
        const inside = x > gx0 + step && x < gx1 - step && z > gz0 + step && z < gz1 - step;
        const rim = Math.min(k, j, fnx - 1 - k, fnz - 1 - j) * fs;
        let h = gameHeight(terr, x, z) - 0.4 - (inside ? 1.2 : 0.35);
        h = lerp(-1.6, h, smoothstep(0, 300, rim));
        fp[id * 3] = x; fp[id * 3 + 1] = h; fp[id * 3 + 2] = z;
        fu[id * 2] = x / 10; fu[id * 2 + 1] = z / 10;
        const n1 = fbm(x / 45, z / 45), n2 = vnoise(x / 9, z / 9);
        if (theme === 'desert') { cc.setRGB(0.78 + n1 * 0.12, 0.55 + n1 * 0.1, 0.34 + n2 * 0.08); if (h > 8) cc.lerp(new THREE.Color(0.62, 0.32, 0.2), smoothstep(8, 30, h) * 0.7); }
        else if (theme === 'city') { const gg = 0.32 + n2 * 0.06; cc.setRGB(gg, gg, gg * 1.04); if (n1 > 0.55) cc.setRGB(0.3, 0.45, 0.2); }
        else { cc.setRGB(0.3 + n1 * 0.16, 0.44 + n1 * 0.16, 0.18 + n2 * 0.06); if (h > 12) cc.lerp(new THREE.Color(0.52, 0.5, 0.3), smoothstep(12, 40, h) * 0.5); }
        fc[id * 3] = cc.r; fc[id * 3 + 1] = cc.g; fc[id * 3 + 2] = cc.b;
      }
      // cut a hole where the detailed ground is: the far ring still has the raw hills in it, and they'd poke
      // up through the flattened runoff / cuttings next to the track. Keep only a thin overlap at the edge.
      const inHole = (k, j) => { const x = fx0 + k * fs, z = fz0 + j * fs; return x > gx0 + fs && x < gx1 - fs && z > gz0 + fs && z < gz1 - fs; };
      const fidx = new Uint32Array((fnx - 1) * (fnz - 1) * 6); let fq = 0;
      for (let j = 0; j < fnz - 1; j++) for (let k = 0; k < fnx - 1; k++) {
        if (inHole(k, j) && inHole(k + 1, j) && inHole(k, j + 1) && inHole(k + 1, j + 1)) continue;
        const a = j * fnx + k, b2 = a + 1, c3 = a + fnx, d2 = c3 + 1;
        fidx[fq++] = a; fidx[fq++] = c3; fidx[fq++] = b2; fidx[fq++] = b2; fidx[fq++] = c3; fidx[fq++] = d2;
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3)); fg.setAttribute('uv', new THREE.BufferAttribute(fu, 2));
      fg.setIndex(new THREE.BufferAttribute(fidx.subarray(0, fq), 1)); fg.computeVertexNormals();
      root.add(new THREE.Mesh(fg, terrMat));
    }
    // outer ground plane
    const gc = new THREE.Color(theme === 'grass' ? 0x4d6a2e : theme === 'desert' ? 0xc08c5a : theme === 'city' ? 0x4a4a4e : 0x2a5a6a);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshLambertMaterial({ color: gc }));
    plane.rotation.x = -Math.PI / 2; plane.position.set(cx, theme === 'coast' ? -16 : -1.6, cz);
    root.add(plane);
  }

  // water
  let water = null;
  if (theme === 'coast') {
    const wt = waterTexture();
    water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000),
      new THREE.MeshPhongMaterial({ color: night ? 0x0c2436 : 0x2a6f8c, specular: 0x88aacc, shininess: 60, map: wt, transparent: true, opacity: 0.88 }));
    wt.repeat.set(700, 700);
    water.rotation.x = -Math.PI / 2; water.position.set(cx, -0.7, cz);
    root.add(water);
  }

  // ---- lamps (positions first, used by road light pools) ----
  const lamps = [];
  // (env.timeFlow: an endurance race, its time of day moving with the race clock: the lamps and floodlights are built
  // in whatever the hour, and setTimeOfDay fades them in and out)
  const flow = !!env.timeFlow, nightish = night || flow;
  const lampsLit = nightish || (P.rain && env.time === 'dusk'); // streetlights come on for a wet dusk too
  // env.circuitLights: 'masts' (the circuit's own lamps, the default), 'banners' (the race-track pack's lamp posts with
  // sponsor banners, their lamp out over the track: lampModels, drawn with the scenery) or 'off'
  const lightsKind = env.circuitLights || 'masts', bannerPosts = lightsKind === 'banners' && envModelsReady() && envAsset('tp_lamppost_0');
  const lampModels = [];
  // (banner posts stand by day too: they're dressing as well as lights)
  const wantLamps = (lampsLit || theme === 'city' || bannerPosts) && lightsKind !== 'off';
  if (wantLamps) {
    const every = Math.round((nightish ? 34 : 50) / T.ds);
    for (let i = 0, n = 0; i < N; i += every, n++) {
      const side = n % 2 ? 1 : -1;
      const has = side < 0 ? A.HAS_L[i] : A.HAS_R[i];
      if ((!has && !nightish) || pitSide(i, side) || A.BRIDGE[i]) continue;
      // behind the barrier, or (open sections at night) out past the runoff
      const off = has ? (side < 0 ? A.BL[i] : A.BR[i]) + 1.5 : T.W[i] / 2 + Math.max(4, runoff * 0.7);
      const x = T.X[i] + T.RX[i] * off * side, z = T.Z[i] + T.RZ[i] * off * side;
      const y = A.BRIDGE[i] ? T.Y[i] : groundHeight(x, z);
      if (bannerPosts) {
        // (each post's front, the lamp's arm, toward the track; the five banners in turn; its lamp at the arm's end)
        const id = 'tp_lamppost_' + (n % 5), a = envAsset(id) || bannerPosts, rot = Math.atan2(-T.RX[i] * side, -T.RZ[i] * side);
        lampModels.push({ id, x, y: y - 0.03, z, rot, s: 1 });
        const fz = a.d / 2 - 0.35, hx = x + Math.sin(rot) * fz, hz = z + Math.cos(rot) * fz, hy = y + a.h - 0.9;
        lamps.push({ i, side, x, z, y, h: hy - y + 0.25, model: id, hx, hy, hz });
      } else lamps.push({ i, side, x, z, y, h: nightish ? 13 : 10 });
    }
  }

  // public road surfaces, sidewalks, markings, street lamps (editor ROADS tool)
  if (roadL && roadL.pieces.length) buildRoads(root, roadL, tx, lamps, step, theme, groundHeight, T, A, env);
  // ---- road ----
  const roadMat = new THREE.MeshPhongMaterial({
    map: env.surface === 'dirt' ? tx.dirt : theme === 'city' ? tx.asphaltCity : tx.asphalt, vertexColors: true,
    // (dirt: mud in the rain, darker and only a little shiny)
    color: P.rain ? (env.surface === 'dirt' ? 0x7a6e66 : 0x9a9aa4) : 0xffffff, specular: P.rain ? (env.surface === 'dirt' ? 0x3a3530 : 0x7a7a88) : env.surface === 'dirt' ? 0x080604 : 0x1a1a1a, shininess: P.rain ? (env.surface === 'dirt' ? 30 : 90) : 8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const surfY = (i, s) => T.Y[i] + s * Math.sin(T.B[i]) + A.LIFT[i] + 0.02;
  {
    const cols = 5, rows = N + 1;
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), col = new Float32Array(rows * cols * 3), rub = new Float32Array(rows * cols * 4);
    for (let r = 0; r < rows; r++) {
      const i = r % N, d = r === N ? T.L : T.D[i];
      const w = T.W[i];
      for (let c = 0; c < cols; c++) {
        const s = -w / 2 + (w * c) / (cols - 1);
        const id = r * cols + c;
        pos[id * 3] = T.X[i] + T.RX[i] * s; pos[id * 3 + 1] = surfY(i, s); pos[id * 3 + 2] = T.Z[i] + T.RZ[i] * s;
        uv[id * 2] = c / (cols - 1); uv[id * 2 + 1] = d / 14;
        rub[id * 4] = c / (cols - 1); rub[id * 4 + 1] = r / N; rub[id * 4 + 2] = d; rub[id * 4 + 3] = w; // (the rubber: rubber.js)
        const edge = (c === 0 || c === cols - 1) && env.surface !== 'dirt' ? 0.9 : 1; // (dirt: no dark edge, its edge blends into the runoff)
        const n = 0.93 + vnoise(d / 30, c) * 0.1;
        col[id * 3] = col[id * 3 + 1] = col[id * 3 + 2] = edge * n;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      if (r === T.cut) continue; // (point-to-point: no road from the end of the run-off to the back of the grid)
      const a = r * cols + c, b = a + 1, c2 = a + cols, d = c2 + 1;
      idx.push(a, b, c2, b, d, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRub', new THREE.BufferAttribute(rub, 4));
    g.setIndex(idx); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, roadMat));

    // skirts / bridge undersides
    const sp = [], su = [];
    const quad = (a, b, c, d, ua, ub) => {
      const vc = Math.max(0.3, (a[1] - c[1]) / 4), vd = Math.max(0.3, (b[1] - d[1]) / 4);
      sp.push(...a, ...b, ...c, ...b, ...d, ...c); su.push(ua, 0, ub, 0, ua, vc, ub, 0, ub, vd, ua, vc);
    };
    for (let i = 0; i < N; i++) {
      if (i === T.cut) continue;
      const j = (i + 1) % N;
      for (const side of [-1, 1]) {
        const e = (k) => { const s = side * T.W[k] / 2; return [T.X[k] + T.RX[k] * s, surfY(k, s), T.Z[k] + T.RZ[k] * s]; };
        const a = e(i), b = e(j);
        // non-bridge edges drop all the way to the ground (retaining wall) so nothing floats
        const foot = (p, k) => A.BRIDGE[k] ? p[1] - 1.4 : Math.min(p[1] - 0.8, groundHeight(p[0], p[2]) - 0.4);
        const a2 = [a[0], foot(a, i), a[2]], b2 = [b[0], foot(b, j), b[2]];
        if (side < 0) quad(a, b, a2, b2, T.D[i] / 4, T.D[i] / 4 + 0.5); else quad(b, a, b2, a2, 0, 0.5);
      }
      if (A.BRIDGE[i]) {
        const l = (k, d) => { const s = -T.W[k] / 2; return [T.X[k] + T.RX[k] * s, surfY(k, s) - d, T.Z[k] + T.RZ[k] * s]; };
        const rr = (k, d) => { const s = T.W[k] / 2; return [T.X[k] + T.RX[k] * s, surfY(k, s) - d, T.Z[k] + T.RZ[k] * s]; };
        quad(l(j, 1.4), l(i, 1.4), rr(j, 1.4), rr(i, 1.4), 0, 1);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sg.computeVertexNormals();
    root.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0x9a968e, side: THREE.DoubleSide })));
  }

  // kerbs: each stretch in its own colors, width (tapered at its ends: A.KW) and profile (track.js KERB_TYPES): raised
  // and sawtooth slope up to KERB_H at the outer edge, flat lies on the road, a sausage is a round hump
  {
    const bufs = {};
    for (let i = 0; i < N; i++) {
      if (i === T.cut) continue;
      const j = (i + 1) % N;
      if (!A.KERB[i] && !A.KERB[j]) continue;
      for (const side of [-1, 1]) {
        // (a curb's first and last 2 m close off to nothing; where two meet, the first runs square up to the next)
        const ki = kerbOf(A, i, side), kj = kerbOf(A, j, side), k = ki || kj;
        if (!k) continue;
        const wi = ki === k ? kerbW(A, i, side) : 0, wj = kj === k ? kerbW(A, j, side) : kj ? wi : 0;
        if (wi < 0.02 && wj < 0.02) continue;
        if (A.pit && A.pit.side === side && (A.pit.REG[i] >= 0 || A.pit.REG[j] >= 0)) continue;
        const cols = kerbColors(k), type = k.type || 'raised', key = cols.join('|');
        const buf = bufs[key] ??= { p: [], u: [], cols }, kp = buf.p, ku = buf.u;
        const p = (q, s, lift) => [T.X[q] + T.RX[q] * s, surfY(q, side * T.W[q] / 2) + lift, T.Z[q] + T.RZ[q] * s];
        const si = side * T.W[i] / 2, sj = side * T.W[j] / 2, vi = T.D[i] / 8, vj = (j === 0 ? T.L : T.D[j]) / 8;
        // across it: [fraction of its width, height] (raised / saw: up to the top; flat; sausage: up and back down)
        const prof = type === 'flat' ? [[0, 0], [1, 0]] : type === 'sausage' ? [[0, 0], [0.25, SAUSAGE_H * 0.7], [0.5, SAUSAGE_H], [0.75, SAUSAGE_H * 0.7], [1, 0]] : [[0, 0], [1, KERB_H]];
        for (let q = 0; q + 1 < prof.length; q++) {
          const [f0, h0] = prof[q], [f1, h1] = prof[q + 1];
          const a = p(i, si + side * wi * f0, h0 + 0.012), b = p(j, sj + side * wj * f0, h0 + 0.012), c = p(i, si + side * wi * f1, h1 + 0.012), d = p(j, sj + side * wj * f1, h1 + 0.012);
          if (side > 0) { kp.push(...a, ...c, ...b, ...b, ...c, ...d); ku.push(f0, vi, f1, vi, f0, vj, f0, vj, f1, vi, f1, vj); }
          else { kp.push(...a, ...b, ...c, ...b, ...d, ...c); ku.push(f0, vi, f0, vj, f1, vi, f0, vj, f1, vj, f1, vi); }
        }
      }
    }
    for (const { p: kp, u: ku, cols } of Object.values(bufs)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(kp, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(ku, 2));
      g.computeVertexNormals();
      const std = cols[0] === KERB_STYLES.rw.c[0] && cols[1] === KERB_STYLES.rw.c[1];
      root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: std ? tx.kerb : kerbTexture(cols), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    }
  }

  // start line + grid boxes: painted decals that follow the road surface (slopes & banking)
  {
    // point on the road at distance d along the lap and lateral offset s
    const at = (d, sl, lift = 0.03) => {
      const u = ((d / T.ds) % N + N) % N, i = Math.floor(u) % N, j = (i + 1) % N, f = u - Math.floor(u);
      const L = (a, b) => a + (b - a) * f;
      const rx = L(T.RX[i], T.RX[j]), rz = L(T.RZ[i], T.RZ[j]);
      const y = L(surfY(i, sl), surfY(j, sl));
      return [L(T.X[i], T.X[j]) + rx * sl, y + lift, L(T.Z[i], T.Z[j]) + rz * sl];
    };
    // quad strip patch: d0..d1 along, s0..s1 across, uv spans u0..u1 / v0..v1
    const patch = (buf, d0, d1, s0, s1, cols, u1 = 1, v1 = 1) => {
      for (let c = 0; c < cols; c++) {
        const sa = s0 + (s1 - s0) * c / cols, sb = s0 + (s1 - s0) * (c + 1) / cols;
        const ua = u1 * c / cols, ub = u1 * (c + 1) / cols;
        const A = at(d0, sa), B = at(d0, sb), C = at(d1, sa), D = at(d1, sb);
        buf.p.push(...A, ...B, ...C, ...B, ...D, ...C);
        buf.u.push(ua, 0, ub, 0, ua, v1, ub, 0, ub, v1, ua, v1);
      }
    };
    const mesh = (buf, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.u, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.renderOrder = 1; root.add(m);
    };
    const w0 = T.W[0];
    const chk = { p: [], u: [] };
    patch(chk, -0.9, 0.9, -w0 / 2, w0 / 2, 8, w0 / 4, 1);
    if (T.open) { const df = T.D[T.finish], wf = T.W[T.finish]; patch(chk, df - 0.9, df + 0.9, -wf / 2, wf / 2, 8, wf / 4, 1); } // (point-to-point: the finish line too)
    mesh(chk, new THREE.MeshLambertMaterial({ map: tx.checker, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
    const bars = { p: [], u: [] };
    for (let k = 0; k < 16; k++) {
      const back = 10 + k * 8 - 2.8;
      let idx = ((Math.round(-back / T.ds) % N) + N) % N;
      const sc = (k % 2 === 0 ? -1 : 1) * T.W[idx] * 0.22;
      patch(bars, -back - 0.12, -back + 0.12, sc - 1.2, sc + 1.2, 2);
    }
    mesh(bars, new THREE.MeshLambertMaterial({ color: 0xe8e8e0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
  }

  // start gantry with lights (point-to-point: a plain gantry over the finish line too)
  const startLights = [];
  const gantry = (i, lights) => {
    const w = T.W[i];
    const gy = T.Y[i];
    const grp = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0x3a3c44 });
    const pole = new THREE.BoxGeometry(0.5, 8, 0.5);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(pole, metal); p.position.set(s * (w / 2 + 2), 4, 0); grp.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 4.5, 0.9, 0.9), metal); beam.position.y = 7.6; grp.add(beam);
    if (lights) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 })); panel.position.set(0, 6.6, -0.3); grp.add(panel);
      for (let k = 0; k < 5; k++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x220606 });
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), mat);
        l.position.set(-1.6 + k * 0.8, 6.6, -0.52); l.rotation.y = Math.PI;
        grp.add(l); startLights.push(mat);
      }
    }
    for (const rot of [0, Math.PI]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(w + 3, 1.2), new THREE.MeshBasicMaterial({ map: lights ? tx.billboards[0] : tx.checker }));
      if (!lights) { banner.material.map = tx.checker.clone(); banner.material.map.wrapS = THREE.RepeatWrapping; banner.material.map.repeat.set((w + 3) / 2.4, 1); banner.material.map.needsUpdate = true; }
      banner.position.set(0, 8.7, rot ? -0.01 : 0.01); banner.rotation.y = rot; grp.add(banner);
    }
    grp.position.set(T.X[i], gy, T.Z[i]);
    grp.rotation.y = Math.atan2(T.FX[i], T.FZ[i]);
    root.add(grp);
  };
  const dressed = env.dress !== false, walls = env.barrier !== 'none'; // (a road, not a circuit: no gantries or boards; no walls, only the world's edge)
  // (the pack's gantry with its five lamp boxes when the scenery models are in: js/trackprops.js; else the old one)
  let startG = null;
  if (dressed) {
    const gi = Math.round(-3 / T.ds + N) % N;
    startG = envModelsReady() ? buildStartGantry({ T, i: gi, root, y: T.Y[gi] + A.LIFT[gi] }) : null;
    if (startG) startLights.push(...startG.lights); else gantry(gi, true);
  }
  if (T.open) {
    if (dressed) gantry(T.finish, false);
    // walls across the road at the end of the run-off and behind the grid
    const mat = new THREE.MeshLambertMaterial({ map: env.barrier === 'tires' ? tx.tires : env.barrier === 'armco' ? tx.armco : tx.wall });
    if (walls) for (const [i, dir] of [[T.cut, 1], [(T.cut + 1) % N, -1]]) {
      const l = A.BL[i] + 1.5, r = A.BR[i] + 1.5, h = env.barrier === 'tires' ? 1.1 : 1.2;
      const g = new THREE.BoxGeometry(l + r, h, 1.0);
      g.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * (l + r) / 4; });
      const m = new THREE.Mesh(g, mat);
      const along = dir * (OPEN_END_WALL + 0.5), mid = (r - l) / 2;
      const x = T.X[i] + T.FX[i] * along + T.RX[i] * mid, z = T.Z[i] + T.FZ[i] * along + T.RZ[i] * mid;
      m.position.set(x, Math.min(T.Y[i], groundHeight(x, z) + 0.05) - 0.1 + h / 2, z);
      m.rotation.y = Math.atan2(T.FX[i], T.FZ[i]);
      root.add(m);
    }
  }

  // barriers
  if (walls) buildBarriers(root, T, A, env, surfY, groundHeight, tx, night, verge);
  const distBoards = (dressed && buildCornerBoards(root, T, A, env, surfY, groundHeight, roadL, night)) || []; // (where each one stands: the Lap Review measures from them)
  buildWalkways(root, T, A, env, surfY, groundHeight, tx);
  if (pit) buildPitLane(root, T, pit, surfY, tx, night, env, A);

  // bridge pillars — never on (or in the runoff of) a road passing underneath
  {
    const pill = [];
    const every = Math.round(18 / T.ds);
    const sep = Math.ceil(40 / T.ds);
    const blocked = (i, x, z) => {
      let hit = false;
      A.hash.query(x, z, 40, (j) => {
        if (hit || circDist(i, j, N) < sep || T.Y[j] > T.Y[i] - 2.5) return;
        if (roadL && roadL.underRoad(x, z, 1.5)) { hit = true; return; }
        const clear = (A.BRIDGE[j] ? T.W[j] / 2 + 1 : Math.max(A.BL[j], A.BR[j])) + 1.8;
        if (Math.hypot(x - T.X[j], z - T.Z[j]) < clear) hit = true;
      });
      return hit;
    };
    for (const s of [-0.3, 0.3]) {
      let last = -1e9;
      const pt = (i) => [T.X[i] + T.RX[i] * s * T.W[i], T.Z[i] + T.RZ[i] * s * T.W[i]];
      for (let i = 0; i < N; i++) {
        if (!A.BRIDGE[i]) continue;
        const top = T.Y[i] - 1.3;
        const [x, z] = pt(i);
        const gh = groundHeight(x, z);
        if (top - gh < 1 || blocked(i, x, z)) continue;
        // always support the deck right at the edge of a gap over a lower road
        const nx = pt((i + 1) % N), px = pt((i - 1 + N) % N);
        const edge = (A.BRIDGE[(i + 1) % N] && blocked((i + 1) % N, nx[0], nx[1])) || (A.BRIDGE[(i - 1 + N) % N] && blocked((i - 1 + N) % N, px[0], px[1]));
        if (!edge && i - last < every) continue;
        if (i - last < 3) continue;
        last = i;
        pill.push({ x, z, y0: gh - 0.5, y1: top });
      }
    }
    if (pill.length) {
      const geo = new THREE.BoxGeometry(1.4, 1, 1.4);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xb0aaa0 }), pill.length);
      const m = new THREE.Matrix4();
      pill.forEach((p, k) => { m.makeScale(1, p.y1 - p.y0, 1); m.setPosition(p.x, (p.y0 + p.y1) / 2, p.z); im.setMatrixAt(k, m); });
      root.add(im);
    }
  }

  // ---------- scenery ----------
  const clearance = (x, z, r) => {
    let ok = true;
    A.hash.query(x, z, r + 40, (j) => {
      if (!ok) return;
      const need = (A.BRIDGE[j] ? T.W[j] / 2 + 3 : Math.max(A.BL[j], A.BR[j]) + 3) + r;
      if (Math.hypot(x - T.X[j], z - T.Z[j]) < need) ok = false;
    });
    return ok;
  };
  // (the garage block's rooms reach back behind its front: nothing of the scenery in them)
  const inBlock = pitBlockTest(T, A, pit) || (() => false);
  const keepProp = (p) => {
    // (its footprint: a stand's length and depth, a model's size from the catalogue, else a couple of metres round it)
    const a = envAsset(p.type), sx = p.sx || 1;
    const [hw, hd] = p.type === 'grandstand' ? [(p.len || 50) / 2, 8] : p.type === 'bleachers' ? [BLEACHERS.w / 2, 8] : a && a.w ? [a.w * sx / 2, a.d / 2] : [0, 0];
    if (!hw) return !inBlock(p.x, p.z, 2.5);
    const cs = Math.cos(p.rot || 0), sn = Math.sin(p.rot || 0), stX = Math.max(1, hw / Math.ceil(hw / 3)), stZ = Math.max(1, hd / Math.ceil(hd / 3));
    for (let lx = -hw; lx <= hw + 0.01; lx += stX) for (let lz = -hd; lz <= hd + 0.01; lz += stZ) if (inBlock(p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs, 1)) return false;
    return true;
  };
  const inst = { tree: [], pine: [], palm: [], cactus: [], rock: [], bush: [], tires: [], cones: [] };
  const buildings = [];
  const stands = [];
  const boards = [];
  const envPl = []; // PS1-style model placements (settings, model buildings, their trees and props)
  // trees, bushes and rocks come from the PS1 model library (the track's tree mix) once it's loaded;
  // the old procedural shapes are only a fallback while it isn't
  const addInst = (type, x, z, rot, sc, auto = true) => {
    if (inBlock(x, z, 2)) return;
    const m = envModelsReady() ? natureModel(type, auto ? rng : mulberry(Math.floor(x * 31.7) ^ Math.floor(z * 57.3)), env, auto) : null;
    if (m && envModel(m.id)) { envPl.push({ id: m.id, x, z, y: groundHeight(x, z) - 0.1, rot, s: +(m.s * (auto ? sc : 1)).toFixed(2) }); return; }
    const t = inst[type] ? type : ['blossom', 'autumn', 'birch', 'willow', 'bare'].includes(type) ? 'tree' : type === 'flowers' ? 'bush' : null;
    if (t && inst[t]) inst[t].push({ x, z, rot, sc: auto ? sc : 1, y: groundHeight(x, z) });
  };

  const density = env.scenery ?? 0.7;
  const setOn = settingOf(env).kind !== 'none'; // a generated setting replaces the procedural trees / city blocks
  const types = theme === 'grass' ? [['tree', 0.5], ['pine', 0.4], ['bush', 0.08], ['rock', 0.02]]
    : theme === 'desert' ? [['cactus', 0.45], ['rock', 0.3], ['bush', 0.25]]
    : theme === 'coast' ? [['palm', 0.6], ['bush', 0.2], ['tree', 0.12], ['rock', 0.08]]
    : [['tree', 1]];
  const pick = () => { let r = rng(), a = 0; for (const [t, p] of types) { a += p; if (r <= a) return t; } return types[0][0]; };
  const nTrees = setOn ? 0 : Math.floor(density * (theme === 'city' ? 250 : 1600) * (hasTown ? 0.3 : 1));
  const erasedN = eraser(track, 'n'), erasedB = eraser(track, 'b'); // (the PAINT tool's eraser clears these too)
  for (let n = 0, tries = 0; n < nTrees && tries < nTrees * 6; tries++) {
    const x = gx0 + 60 + rng() * (nx * step - 120), z = gz0 + 60 + rng() * (nz * step - 120);
    const fd = farDist(x, z);
    if (fd > 480) continue;
    if (fd < 30 && rng() < 0.5) continue;
    const t = pick();
    if (!clearance(x, z, t === 'rock' ? 5 : 2.5)) continue;
    if (real.grid.hits(x, z, 3) || inPitZone(x, z) || (roadL && roadL.onRoad(x, z, 2)) || (erasedN && erasedN(x, z))) continue;
    const gh = groundHeight(x, z);
    if (theme === 'coast' && gh < (t === 'palm' ? 0.2 : 1.5)) continue;
    // clumping
    if (vnoise(x / 70, z / 70) < 0.35 && rng() < 0.7) continue;
    addInst(t, x, z, rng() * Math.PI * 2, 0.75 + rng() * 0.6);
    n++;
  }

  // city blocks along the track
  if ((theme === 'city' || density > 0) && !hasTown && !setOn) {
    const bStep = Math.round(26 / T.ds);
    const wantCity = theme === 'city';
    for (let i = 0; i < N; i += bStep) {
      for (const side of [-1, 1]) {
        if (!wantCity && rng() > 0.05 * density) continue;
        if (wantCity && rng() > 0.35 + density * 0.6) continue;
        const w = 14 + rng() * 16, d = 12 + rng() * 14, h = wantCity ? 10 + rng() * rng() * 70 : 6 + rng() * 6;
        const off = (side < 0 ? A.BL[i] : A.BR[i]) + 7 + d / 2 + rng() * 4;
        const x = T.X[i] + T.RX[i] * off * side, z = T.Z[i] + T.RZ[i] * off * side;
        const r = Math.max(w, d) * 0.55;
        if (!clearance(x, z, r)) continue;
        if (buildings.some(b => Math.hypot(b.x - x, b.z - z) < (b.r + r) * 0.9) || real.grid.hits(x, z, r) || inPitZone(x, z) || (roadL && roadL.onRoad(x, z, r)) || (erasedB && erasedB(x, z))) continue;
        buildings.push({ x, z, w, d, h, rot: Math.atan2(T.FX[i], T.FZ[i]), r, v: Math.floor(rng() * 4), y: groundHeight(x, z) });
      }
    }
    if (wantCity) {
      const nB = Math.floor(160 * density + 60);
      for (let n = 0, tries = 0; n < nB && tries < nB * 8; tries++) {
        const x = gx0 + 80 + rng() * (nx * step - 160), z = gz0 + 80 + rng() * (nz * step - 160);
        if (farDist(x, z) > 420) continue;
        const w = 16 + rng() * 24, d = 14 + rng() * 22, h = 12 + rng() * rng() * 110;
        const r = Math.max(w, d) * 0.6;
        if (!clearance(x, z, r + 4)) continue;
        if (buildings.some(b => Math.hypot(b.x - x, b.z - z) < (b.r + r)) || real.grid.hits(x, z, r) || inPitZone(x, z) || (roadL && roadL.onRoad(x, z, r)) || (erasedB && erasedB(x, z))) continue;
        buildings.push({ x, z, w, d, h, rot: Math.round(rng() * 4) * Math.PI / 2 + 0.3, r, v: Math.floor(rng() * 4), y: groundHeight(x, z) });
        n++;
      }
    }
  }

  // grandstands: start straight + a few corners
  const standSpots = [];
  {
    const i = Math.round(N - 30 / T.ds) % N;
    standSpots.push(i);
    const corners = [];
    for (let k = 0; k < N; k += Math.round(20 / T.ds)) if (Math.abs(T.K[k]) > 1 / 80) corners.push(k);
    for (let n = 0; n < Math.min(3, corners.length); n++) standSpots.push(corners[Math.floor(rng() * corners.length)]);
  }
  for (const i of env.autoStands === false ? [] : standSpots) { // (real circuits bring their own, from the map)
    for (const side of (i === standSpots[0] ? [-1, 1] : [T.K[i] > 0 ? -1 : 1])) {
      if (!(side < 0 ? A.HAS_L[i] : A.HAS_R[i]) || pitSide(i, side)) continue;
      const off = (side < 0 ? A.BL[i] : A.BR[i]) + 4 + 7;
      const x = T.X[i] + T.RX[i] * off * side, z = T.Z[i] + T.RZ[i] * off * side;
      if (!clearance(x, z, 10)) continue;
      const face = Math.atan2(-T.RX[i] * side, -T.RZ[i] * side);
      stands.push({ x, z, rot: face, len: 50 + rng() * 20, y: groundHeight(x, z) });
      break;
    }
  }
  // billboards
  {
    const nb = 8;
    for (let n = 0; n < nb; n++) {
      const i = Math.floor(rng() * N);
      const side = rng() < 0.5 ? -1 : 1;
      if (!(side < 0 ? A.HAS_L[i] : A.HAS_R[i]) || pitSide(i, side)) continue;
      const off = (side < 0 ? A.BL[i] : A.BR[i]) + 3;
      const x = T.X[i] + T.RX[i] * off * side, z = T.Z[i] + T.RZ[i] * off * side;
      if (!clearance(x, z, 2)) continue;
      boards.push({ x, z, rot: Math.atan2(-T.RX[i] * side, -T.RZ[i] * side), v: n % tx.billboards.length, y: groundHeight(x, z) });
    }
  }
  // imported / zone trees
  for (const [x, z, id, sc] of real.trees) {
    if (inPitZone(x, z)) continue;
    if (id && envModel(id)) { envPl.push({ id, x, z, y: groundHeight(x, z) - 0.1, rot: rng() * Math.PI * 2, s: sc || 1 }); continue; }
    addInst('tree', x, z, rng() * Math.PI * 2, 0.8 + rng() * 0.5);
  }
  // sit a landmark on the lowest corner of its footprint so it never floats on a slope
  // Where a building stands: on the highest ground under it (never buried in the slope), with a concrete
  // foundation down to the lowest wherever the ground still falls away under it (the pads make that rare)
  const plinths = [];
  function seat(p) {
    let lo = Infinity, hi = -Infinity;
    for (const q of footSamples(p)) { const g = groundHeight(q[0], q[1]); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const y = hi - 0.06;
    if (hi - lo > 0.3) plinths.push({ p, y0: lo - 0.5, y1: y + 0.04 });
    return y;
  }
  function placeLandmark(m, x, z, rot, hw, hd) {
    m.position.set(x, seat(rectFoot(x, z, rot, hw, hd)), z); m.rotation.y = rot;
    root.add(m);
  }
  // user props
  for (const p of track.props || []) {
    if (!keepProp(p)) continue;
    const y = groundHeight(p.x, p.z);
    const rot = p.rot || 0;
    if (inst[p.type] || PROP_FLORA[p.type]) addInst(p.type, p.x, p.z, rot, 1, false);
    else if (p.type === 'building' || p.type === 'tower') { // (old tracks' grey boxes: a building model now)
      const a = envModelsReady() && randomBuilding(p.type === 'tower' ? 'tower' : 'apartment', mulberry(Math.floor(p.x * 31.7) ^ Math.floor(p.z * 57.3)));
      if (a && envModel(a.id)) envPl.push({ id: a.id, x: p.x, z: p.z, y: y - 0.12, rot, s: 1 });
      else buildings.push(p.type === 'tower' ? { x: p.x, z: p.z, w: 24, d: 24, h: 90, rot, r: 14, v: 1, y } : { x: p.x, z: p.z, w: 22, d: 18, h: 18, rot, r: 12, v: 0, y });
    }
    else if (p.type === 'grandstand') stands.push({ x: p.x, z: p.z, rot, len: p.len || 50, y });
    else if (p.type === 'billboard') boards.push({ x: p.x, z: p.z, rot, v: Math.floor(Math.abs(p.x + p.z)) % tx.billboards.length, y });
    else if (p.type === 'lamp') lamps.push({ i: -1, x: p.x, z: p.z, y, h: 14, user: true, k: p.light ?? 1 });
    else if (p.type === 'courthouse') placeLandmark(buildCourthouse(night), p.x, p.z, rot, 22, 16);
    else if (BUSINESSES[p.type]) placeLandmark(buildBusiness(p.type, night), p.x, p.z, rot, BUSINESSES[p.type].w / 2, BUSINESSES[p.type].d / 2);
  }

  buildInstances(root, inst, rng);
  // bleachers (your model, PROPS > Trackside) with their crowd, and the people the PAINT tool's Crowd brush put down.
  // The characters load on first use: the stands and people join the world when they're in (a moment, the first time)
  {
    const bl = (track.props || []).filter(p => p.type === 'bleachers' && keepProp(p)), painted = (track.paint || []).some(s => s.kind === 'crowd');
    const frac = (v) => v - Math.floor(v), h01 = (a, b, k) => frac(Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453);
    const place = () => {
      const people = [];
      for (const p of bl) {
        const rot = p.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), W = BLEACHERS.w / 2, D = BLEACHERS.d;
        // on the highest ground under it (its legs reach down to the rest)
        let y = -Infinity;
        for (const [lx, lz] of [[-W, 0], [W, 0], [-W, -D], [W, -D], [0, -D / 2]]) y = Math.max(y, groundHeight(p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs));
        const m = makeBleachers();
        if (m) { m.position.set(p.x, y - 0.03, p.z); m.rotation.y = rot; root.add(m); }
        if (p.crowd === false) continue;
        bleacherSeats().forEach((st, k) => {
          if (h01(p.x, p.z, k) > (p.fill ?? 0.8)) return; // (some seats empty)
          const j = h01(p.z, p.x, k);
          people.push({ x: p.x + st.x * cs + st.z * sn, y: y + st.y, z: p.z - st.x * sn + st.z * cs, rot: rot + (j - 0.5) * 0.35, sit: true, s: j });
        });
      }
      if (painted) {
        // (not in a building: the setting's, the map's, placed ones, or the classic boxes)
        const inBld = (x, z) => real.buildings.some(b => b.p && pointInPoly(x, z, b.p)) || buildings.some(b => Math.hypot(b.x - x, b.z - z) < b.r);
        const ok = (x, z) => clearance(x, z, 0.6) && !(roadL && roadL.onRoad(x, z, 0.6)) && !inPitZone(x, z) && !inBld(x, z);
        for (const q of paintedPeople(track, ok)) {
          // facing the nearest bit of the track (give or take)
          let best = Infinity, bi = 0;
          for (let i = 0; i < N; i += 3) { const d = (T.X[i] - q.x) ** 2 + (T.Z[i] - q.z) ** 2; if (d < best) { best = d; bi = i; } }
          people.push({ x: q.x, y: groundHeight(q.x, q.z), z: q.z, rot: Math.atan2(T.X[bi] - q.x, T.Z[bi] - q.z) + (q.s - 0.5) * 0.8, sit: false, s: q.s });
        }
      }
      root.add(buildCrowd(people));
    };
    // (always after the build: the houses fitted below are in the lists by then. No characters: the stands still go up, empty)
    if (bl.length || painted) loadCrowd().then(place);
  }
  const foot = buildings.map(b => rectFootprint(b, theme));
  // the classic scenery's houses: PSX houses too (no more extruded boxes with pitched roofs)
  if (envModelsReady()) {
    const hr = mulberry(7177);
    for (let i = foot.length - 1; i >= 0; i--) {
      const b = foot[i]; if (b.s !== 'house' || !fitHouse(b, hr, roadL, T, A)) continue;
      foot.splice(i, 1); real.buildings.push(b);
    }
  }
  for (const b of real.buildings) {
    if (b.biz && BUSINESSES[b.biz]) { placeLandmark(buildBusiness(b.biz, night), b.c[0], b.c[1], b.face, BUSINESSES[b.biz].w / 2, BUSINESSES[b.biz].d / 2); continue; }
    if (b.m && envModel(b.m)) { // a PS1-style model: sits on the lowest corner of its footprint so it never floats
      const t = modelTransform(b);
      if (t) {
        const gy = seat(b.p) + 0.1;
        // (a PSX house wears its wall / roof / paint; any other model can carry a paint tint)
        envPl.push({ id: b.m, x: t.x, z: t.z, y: gy - 0.12, rot: t.rot, sx: t.sx, sy: t.sy, sz: t.sz, look: t.a.paint ? houseLook(b.hv, t.x, t.z) : undefined, paint: !t.a.paint && b.hv && b.hv.c || undefined });
        continue;
      }
    }
    const gh = groundHeight(b.p[0][0], b.p[0][1]);
    if (theme === 'coast' && gh < -0.3) continue;
    if (setOn) continue; // a setting is on: only the PS1 models
    foot.push(b);
  }
  buildFootprints(root, foot, night, groundHeight, rng);
  if (plinths.length) buildPlinths(root, plinths, tx);
  const realW = track.real ? addRealWorld(root, track, T, { groundHeight, night }) : null; // real circuits: sea, lakes, tunnels, Ferris wheels
  // street surfaces (road deck and raised sidewalks) for things lying on them
  const rGrid = new Map(), RC = 12;
  if (roadL) for (const pc of roadL.pieces) { if (!pc.y) continue; pc.s.forEach((q, k) => { if (q.elev) return; const key = Math.floor(q.x / RC) + ',' + Math.floor(q.z / RC); let a = rGrid.get(key); if (!a) rGrid.set(key, a = []); a.push([q.x, q.z, pc.y[k], q.tx, q.tz, pc.w / 2, pc.walk]); }); }
  // the nearest street sample to a point (within 4 m) and how far across it the point is, or null
  const streetNear = (x, z) => {
    let best = null, bd = 16;
    for (let cx = Math.floor(x / RC) - 1; cx <= Math.floor(x / RC) + 1; cx++) for (let cz = Math.floor(z / RC) - 1; cz <= Math.floor(z / RC) + 1; cz++) {
      const a = rGrid.get(cx + ',' + cz); if (!a) continue;
      for (const r of a) { const d = (r[0] - x) ** 2 + (r[1] - z) ** 2; if (d < bd) { bd = d; best = r; } }
    }
    return best && { r: best, lat: Math.abs((x - best[0]) * -best[4] + (z - best[1]) * best[3]) };
  };
  const streetAt = (x, z) => {
    const n = streetNear(x, z); if (!n) return null;
    return n.lat < n.r[5] ? n.r[2] + 0.045 : n.lat < n.r[5] + n.r[6] + 0.1 ? n.r[2] + STREET_CURB + 0.005 : null;
  };
  // a public road's sidewalk step under a point, m above its road deck (0 on the deck, null off the streets)
  streetStep = (x, z) => { const n = streetNear(x, z); if (!n) return null; return n.lat < n.r[5] ? 0 : n.lat < n.r[5] + n.r[6] + 0.1 ? STREET_CURB - 0.04 : null; };
  const surfAt = (x, z) => { // top of the track surface if the point is on it, else a street / sidewalk, else the ground
    const st = streetAt(x, z); if (st !== null) return st;
    let bj = -1, bd = Infinity;
    A.hash.query(x, z, 30, (j) => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bj = j; } });
    const g = groundHeight(x, z);
    if (bj < 0) return g;
    const lat = (x - T.X[bj]) * T.RX[bj] + (z - T.Z[bj]) * T.RZ[bj], side = lat < 0 ? -1 : 1, al = Math.abs(lat);
    const top = surfY(bj, Math.max(-T.W[bj] / 2, Math.min(T.W[bj] / 2, lat))) + 0.02;
    const we = walkEdge(T, A, env, bj, side); // on the circuit's raised sidewalk?
    if (we >= 0 && al >= we && al <= we + walkWidth(T, A, env, bj, side) + 0.2) return top + WALK_H;
    if (kerbOn(A, bj, side) && al > T.W[bj] / 2 && al < T.W[bj] / 2 + kerbW(A, bj, side)) return top + KERB_H + 0.01;
    return al < T.W[bj] / 2 + 1.5 ? Math.max(g, top) : g;
  };
  const movers = [];
  for (const p of real.props || []) {
    if (inPitZone(p.x, p.z)) continue;
    const e = { id: p.id, x: p.x, z: p.z, y: (p.lit ? surfAt(p.x, p.z) + 0.005 : groundHeight(p.x, p.z) - 0.02) + (p.y || 0), rot: p.rot || 0, s: p.s || 1, tx: p.tx, tz: p.tz, sp: p.sp, round: p.round, mv: p.mv };
    envPl.push(e); if (e.mv) movers.push(e);
  }
  // the race-track pack's props (PROPS > Trackside): models with the rest, fans in their stands, floodlights at night
  const tpFx = placeTrackProps({ track: { ...track, props: (track.props || []).filter(keepProp) }, T, A, root, envPl, groundHeight, night, lit: nightish || env.time === 'dusk' });
  for (const q of lampModels) envPl.push(q); // (the circuit's banner lamp posts)
  for (let k = envPl.length - 1; k >= 0; k--) if (inBlock(envPl[k].x, envPl[k].z, 2)) envPl.splice(k, 1); // (out of the garages)
  const envCells = addEnvInstances(root, envPl, { night });
  addContactShadows(root, envPl, groundHeight, night);
  if (real.paving && real.paving.length) buildPaving(root, real.paving, groundHeight, tx);
  // blowing litter, steam, pigeons, glowing vending machines (the setting's Ambient life slider)
  const stS = settingOf(env);
  const lifeTrees = setOn ? envPl.filter(p => { const a = envAsset(p.id); return a && a.cat === 'tree'; }).map(p => [p.x, p.y, p.z, envAsset(p.id).h * (p.s || 1)]) : [];
  const life = setOn && real.life && stS.life > 0 ? new StreetLife(root, { ...real.life, trees: lifeTrees, movers }, { surf: surfAt, life: stS.life, night, dusk: env.time === 'dusk', rain: P.rain, fog: env.weather === 'fog', seed: stS.seed, gh: groundHeight }) : null;
  for (const s of stands) if (keepProp({ ...s, type: 'grandstand' })) root.add(buildStand(s, tx, groundHeight));
  for (const b of boards) if (!inBlock(b.x, b.z, 6)) root.add(buildBoard(b, tx, groundHeight));
  const lampFx = buildLamps(root, lamps, T, A, surfY, lampsLit, tx, roadMat);
  // rain: the lights reflect on the wet road
  let wet = null;
  if (P.rain) {
    wet = new WetReflections(root);
    const roadY = (x, z) => {
      let bj = -1, bd = Infinity;
      A.hash.query(x, z, 30, (j) => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bj = j; } });
      if (bj >= 0) { const lat = (x - T.X[bj]) * T.RX[bj] + (z - T.Z[bj]) * T.RZ[bj]; if (Math.abs(lat) < T.W[bj] / 2 + 1.5) return surfY(bj, Math.max(-T.W[bj] / 2, Math.min(T.W[bj] / 2, lat))); }
      return groundHeight(x, z) + 0.08;
    };
    if (lampsLit) for (const l of lamps) if (l.hx !== undefined) { const y = roadY(l.hx, l.hz); wet.addFixed({ x: l.hx, y, z: l.hz, h: l.hy - y, r: 0.62, g: 0.46, b: 0.28, w: l.user ? 1.0 : 1.4 }); }
  }

  // distant ring
  root.add(buildHorizon(theme, P, cx, cz, Math.max(maxX - minX, maxZ - minZ) / 2 + 1500, rng, tx, night));

  // rain (a race whose weather may change has it too, hidden till it's needed: setWeather)
  let rain = null;
  if (P.rain || env.wxChange) {
    const n = 2600, pos = new Float32Array(n * 6);
    for (let k = 0; k < n; k++) {
      const x = (rng() - 0.5) * 80, y = rng() * 40, z = (rng() - 0.5) * 80;
      pos.set([x, y, z, x + 0.1, y - 1.1, z], k * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: night ? 0x8aa0c0 : 0xc8d4e0, transparent: true, opacity: P.rain ? 0.45 : 0, fog: false }));
    rain.frustumCulled = false; rain.visible = !!P.rain;
    root.add(rain);
  }
  // the weather changing in a race (race.js): rk, how hard it's raining (0..1); wet, how wet the road is (0..1). The
  // rain's lines, the road's sheen and the fog follow; a world built wet starts at 1, 1.
  const roadDry = { c: new THREE.Color(0xffffff), s: new THREE.Color(env.surface === 'dirt' ? 0x080604 : 0x1a1a1a), h: 8 };
  const roadWet = { c: new THREE.Color(env.surface === 'dirt' ? 0x7a6e66 : 0x9a9aa4), s: new THREE.Color(env.surface === 'dirt' ? 0x3a3530 : 0x7a7a88), h: env.surface === 'dirt' ? 30 : 90 };
  const fog0 = { near: P.fogNear, far: P.fogFar };
  const setWeather = (rk, wetK) => {
    if (rain) { rain.visible = rk > 0.02; rain.material.opacity = 0.45 * rk; }
    const k = P.rain ? 1 : wetK; // (built wet: it stays looking wet; the grip is the race's business)
    roadMat.color.copy(roadDry.c).lerp(roadWet.c, k); roadMat.specular.copy(roadDry.s).lerp(roadWet.s, k); roadMat.shininess = roadDry.h + (roadWet.h - roadDry.h) * k;
    if (!P.rain) { fog.near = fog0.near * (1 - 0.5 * rk); fog.far = fog0.far * (1 - 0.4 * rk); }
  };

  // TV camera spots
  const tvCams = [];
  for (let i = 0; i < N; i += Math.round(120 / T.ds)) {
    let side = T.K[i] > 0 ? -1 : 1;
    if (pitSide(i, side)) side = -side;
    // somewhere clear of buildings (a setting's front row stands right behind the barriers): try further out,
    // then the other side, then just behind the barrier
    let x, z, found = false;
    for (const sd of [side, -side]) {
      if (pitSide(i, sd)) continue;
      for (const extra of [9, 4, 1.5]) {
        const off = (sd < 0 ? A.BL[i] : A.BR[i]) + extra;
        x = T.X[i] + T.RX[i] * off * sd; z = T.Z[i] + T.RZ[i] * off * sd;
        if (!real.grid.hits(x, z, 3)) { found = true; break; }
      }
      if (found) break;
    }
    if (!found) { const off = (side < 0 ? A.BL[i] : A.BR[i]) - 0.8; x = T.X[i] + T.RX[i] * off * side; z = T.Z[i] + T.RZ[i] * off * side; } // (just inside the barrier)
    tvCams.push({ i, x, z, y: Math.max(groundHeight(x, z), T.Y[i]) + 6 + rng() * 8 });
  }

  let t = 0;
  function update(dt, camera, moving, cars) {
    t += dt;
    envCells.update(camera);
    clouds.update(dt, camera);
    if (shadowsOn && camera) { // keep the shadow box centred just ahead of the camera, snapped to its texels (no shimmer)
      camera.getWorldDirection(_sdir);
      const snap = 150 / 2048, fx = Math.round((camera.position.x + _sdir.x * 35) / snap) * snap, fz = Math.round((camera.position.z + _sdir.z * 35) / snap) * snap;
      const fy = camera.position.y;
      sun.target.position.set(fx, fy, fz); sun.position.set(fx + P.sun[0] * 250, fy + P.sun[1] * 250, fz + P.sun[2] * 250);
      sun.target.updateMatrixWorld();
    }
    if (wet) wet.update(camera, moving);
    if (life) life.update(dt, t, camera, cars, fog);
    sky.position.copy(camera.position);
    sky.material.uniforms.time.value = t;
    if (water) water.material.map.offset.set(t * 0.003, t * 0.002);
    if (realW) realW.update(t);
    if (rain) {
      rain.position.set(camera.position.x, camera.position.y - 15, camera.position.z);
      const p = rain.geometry.attributes.position.array;
      const fall = dt * 38;
      for (let k = 0; k < p.length; k += 6) {
        p[k + 1] -= fall; p[k + 4] -= fall;
        if (p[k + 4] < 0) { p[k + 1] += 40; p[k + 4] += 40; }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    lampFx && lampFx.update(t, camera);
    tpFx && tpFx.update(t, camera);
    if (nightGroups.length && nightK < 0.999) for (const g of nightGroups) g.traverse(o => { if (o.isLight) o.intensity *= nightK; }); // (a moving clock: their real light fades too)
    startG && startG.update(t);
  }

  // PSX vertex snapping + affine texture mapping (vendor/psx), on the world's own materials. The amounts are global
  // uniforms (Options → PSX Materials), so every world shares the patched programs.
  // Only on meshes made of small triangles (buildings, props, trees): the library's snapping is meant for ~2 m
  // triangles, and on the huge ground / road / ground-plane triangles passing right by the camera it can fling
  // vertices across the screen (a big green sheet flashing over the view). A material shared with any big mesh is
  // left alone too.
  const bigOf = new Map();
  root.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh) || o.isSprite || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const r = o.userData.partR ?? (o.geometry.boundingSphere ? o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) : Infinity); // (merged scenery: its pieces' size)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) bigOf.set(m, Math.max(bigOf.get(m) || 0, r));
  });
  for (const [m, r] of bigOf) {
    if (r > 40 || m.userData.psx || m.isShaderMaterial || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
    if (!(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial || m.isMeshStandardMaterial)) continue;
    applyPSXMaterial(m, { snap: true, affine: m.map ? 0.6 : 0 }); m.userData.psx = true;
  }
  if (shadowsOn) root.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.material && !o.material.transparent && !(o.material.isMeshBasicMaterial)) o.receiveShadow = true; });
  // ---- an endurance race's clock (env.timeFlow): the time of day at hour h, the sky, sun, fog, clouds and grade
  // blended (envParamsAt), the lamps' and floodlights' glow, beams, pools and lights faded in with the dark ----
  let nightK = P.night;
  const nightGroups = flow ? ['lampsNight', 'floodlights'].map(n => root.getObjectByName(n)).filter(Boolean) : [];
  const base = new Map(), faceDay = new THREE.Color(0xb8bcc4), faceLit = new THREE.Color(0xffdca8).multiplyScalar(2.6);
  function setTimeOfDay(h) {
    if (!flow) return;
    const Q = envParamsAt(env, h), keep = { fogNear: P.fogNear, fogFar: P.fogFar, grip: P.grip, rain: P.rain };
    Object.assign(P, Q, keep); nightK = Q.night;
    hemi.color.setHex(Q.hemiS); hemi.groundColor.setHex(Q.hemiG); hemi.intensity = Q.hemiI;
    sun.color.setHex(Q.sunCol); sun.intensity = Q.sunI; if (!shadowsOn) sun.position.set(...Q.sun).multiplyScalar(100);
    fog.color.setHex(Q.fog);
    const u = sky.material.uniforms;
    u.top.value.setHex(Q.top); u.hor.value.setHex(Q.hor); u.bottom.value.setHex(Q.bottom); u.sunDir.value.set(...Q.sun).normalize();
    u.sunCol.value.setHex(Q.sunCol); u.cloudCol.value.setHex(Q.cloud); u.night.value = Q.night; u.fogCol.value.setHex(Q.fog);
    if (clouds.setTime) clouds.setTime(Q.tod.a, Q.tod.b, Q.tod.u, Q);
    for (const g of nightGroups) {
      g.visible = nightK > 0.01;
      g.traverse(o => {
        for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
          if (!base.has(m)) base.set(m, m.isShaderMaterial && m.uniforms.k ? m.uniforms.k.value : m.opacity);
          if (m.isShaderMaterial && m.uniforms.k) m.uniforms.k.value = base.get(m) * nightK; else if (m.transparent) m.opacity = base.get(m) * nightK;
        }
      });
      if (g.userData.face) g.userData.face.color.copy(faceDay).lerp(faceLit, nightK);
    }
  }
  const roadAt = (x, z) => !!(roadL && roadL.onGroundRoad(x, z, -1.6));
  const roadLines = roadL ? roadL.pieces.map(pc => pc.s.map(q => [q.x, q.z])) : [];
  return { root, fog, P, update, setWeather, setTimeOfDay, nightK: () => nightK, road: env.surface === 'dirt' ? null : { mat: roadMat }, groundHeight, paintAt, roadAt, streetStep: (x, z) => streetStep(x, z), roadLines, tvCams, startLights, life, boards: distBoards, center: new THREE.Vector3(cx, 0, cz), bounds: { minX, maxX, minZ, maxZ } };
}

// ---------- the runoff's surfaces ----------
// The runoff mesh's material: the ground's own colours (vertex colours x the detail texture), with paved, gravel
// and painted grass drawn over them where the layout (runoff.js) puts them. The layout goes up as a texture, one
// texel per 0.5 m cell (how far inside each surface it is); each pixel blends its four cells exactly as runoffKind
// does for the physics and takes the surface it's deepest inside, so the edges are crisp curves (smoothed over a
// pixel).
const RUN_ROWS = 8192; // (texture rows: a longer circuit is packed in blocks side by side)
// dirt: a dirt track's colour (dirtTint), for its edges, where the runoff shows through the dirt (DIRT_EDGE)
const DIRT_EDGE = 2.2;
function runoffMaterial(mat, RUN, theme, dirt = null) {
  if (!RUN) return mat;
  const { C, N, cells } = RUN, B = Math.ceil(N / RUN_ROWS), H = Math.ceil(N / B), W = 2 * C * B;
  if (!RUN.tex) { // (made once: a dirt track's edges share it)
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < N; i++) {
      const b = Math.floor(i / H), r = i - b * H;
      data.set(cells.subarray(i * 2 * C * 4, (i + 1) * 2 * C * 4), (r * W + b * 2 * C) * 4);
    }
    const t = RUN.tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  }
  const map = RUN.tex;
  const tx = getTextures();
  const tint = theme === 'desert' ? [1.3, 1.1, 0.92] : theme === 'coast' ? [1.25, 1.22, 1.16] : [1.18, 1.14, 1.04];
  const ground = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    ground(sh, r);
    Object.assign(sh.uniforms, {
      runMap: { value: map }, runInfo: { value: new THREE.Vector4(C, N, H, RUN_RES) }, runSD: { value: RUN_SD },
      runPaved: { value: tx.runoffAsphalt }, runGravel: { value: tx.gravel }, runTint: { value: new THREE.Vector3(...tint) },
      runClay: { value: getGroundTextures().clay }, runDirt: { value: new THREE.Vector4(...(dirt ? [dirt.r, dirt.g, dirt.b, 1] : [1, 1, 1, 0])) },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 run;\nvarying vec4 vRun;\nvarying vec2 vRunXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRun = run; vRunXZ = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2D runMap; uniform vec4 runInfo; uniform float runSD; uniform sampler2D runPaved, runGravel, runClay; uniform vec3 runTint; uniform vec4 runDirt;
varying vec4 vRun; varying vec2 vRunXZ;
vec3 runCell(float row, float side, float c) {
  float N = runInfo.y, C = runInfo.x, H = runInfo.z;
  row = mod(row, N); c = clamp(c, 0.0, C - 1.0);
  float b = floor(row / H);
  return texelFetch(runMap, ivec2(int(b * 2.0 * C + side * C + c), int(row - b * H)), 0).rgb;
}
vec3 runAt(float row, float side, float t) {
  float x = max(t, 0.0) / runInfo.w - 0.5, c0 = max(0.0, floor(x)), fc = clamp(x - c0, 0.0, 1.0);
  float r0 = floor(row), fr = row - r0;
  return mix(mix(runCell(r0, side, c0), runCell(r0, side, c0 + 1.0), fc), mix(runCell(r0 + 1.0, side, c0), runCell(r0 + 1.0, side, c0 + 1.0), fc), fr);
}`)
      .replace(GROUND_LINE, `${GROUND_LINE}
if (vRun.w > 0.5) {
  // how far inside paved, gravel, painted grass (m), and the ground's own: inside where none of them are
  vec3 d3 = (runAt(vRun.x, vRun.z, vRun.y) * 255.0 - 128.0) * runSD / 127.0;
  vec4 W = vec4(d3, -max(max(d3.x, d3.y), d3.z));
  // each surface's lead over the best of the rest: the one ahead takes the pixel, blended over a pixel at the edge
  vec4 lead = W - vec4(max(max(W.y, W.z), W.w), max(max(W.x, W.z), W.w), max(max(W.x, W.y), W.w), max(max(W.x, W.y), W.z));
  vec4 a = clamp(0.5 + lead / max(fwidth(lead), vec4(1e-3)), 0.0, 1.0);
  a /= max(a.x + a.y + a.z + a.w, 1e-3);
  vec3 paved = texture(runPaved, vRunXZ / 6.0).rgb;
  // (gravel a touch darker at its edge, where it's been kicked up onto the grass and swept back)
  vec3 gravel = texture(runGravel, vRunXZ / 2.5).rgb * runTint * mix(0.82, 1.0, smoothstep(0.0, 0.6, W.y));
  vec3 grass = groundColor(vec3(0.27, 0.47, 0.18), vMapUv);
  diffuseColor.rgb = diffuseColor.rgb * a.w + paved * a.x + gravel * a.y + grass * a.z;
  if (runDirt.w > 0.5 && vRun.y < 0.0) {
    // a dirt track's edge (on the track): the runoff's surface (the cell at the edge) scattered through the dirt,
    // from none DIRT_EDGE in to solid at the edge, dusted with the dirt the further in it is. Each 12 cm square takes
    // it or not by a random number mixed with the ground's grey detail (clumps)
    float f = smoothstep(-${DIRT_EDGE.toFixed(2)}, -0.1, vRun.y);
    float h = fract(sin(dot(floor(vRunXZ * 8.0), vec2(12.9898, 78.233))) * 43758.5453);
    float clump = clamp((texture(map, vRunXZ / 3.0).r - 0.62) / 0.32, 0.0, 1.0);
    if (mix(h, clump, 0.45) > f) discard;
    vec3 clay = mix(texture(runClay, vRunXZ / 6.5).rgb, vec3(0.43, 0.27, 0.14), 0.45) * runDirt.rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, clay, (1.0 - f) * 0.6);
  }
}`);
  };
  return mat;
}

// ---------- the natural ground ----------
// The terrain keeps its vertex colours (the theme's ground, hills, painted grass and its mown stripes, banks), and
// each pixel draws the PSX ground texture that colour is: green is grass, olive dry grass, light tan sand (the
// desert's or the beach's), dark brown earth, blended where one turns into the next. The texture keeps its own
// colours, shaded by how this spot's colour differs from the usual for that ground. Grey (the city) keeps the old
// grey detail texture.
const GROUND_LINE = 'diffuseColor.rgb = groundColor(vColor.rgb, vMapUv);'; // (the runoff draws its surfaces after it)
function groundMaterial(theme) {
  const G = getGroundTextures();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      gGrass: { value: G.grass }, gDry: { value: G.dry }, gSand: { value: theme === 'desert' ? G.desert : G.beach }, gEarth: { value: G.earth },
    });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
uniform sampler2D gGrass, gDry, gSand, gEarth;
vec3 groundShade(vec3 v, vec3 usual) { vec3 k = v / usual; return mix(vec3(dot(k, vec3(0.3, 0.55, 0.15))), k, 0.4); }
vec3 groundColor(vec3 v, vec2 uv) {
  float G = v.g - v.r, lum = dot(v, vec3(0.3, 0.55, 0.15)), chroma = max(max(v.r, v.g), v.b) - min(min(v.r, v.g), v.b);
  float wGrass = smoothstep(0.03, 0.11, G), wDry = (1.0 - wGrass) * smoothstep(-0.09, -0.02, G);
  float bare = 1.0 - wGrass - wDry, wSand = bare * smoothstep(0.42, 0.58, lum), wEarth = bare - wSand;
  vec3 c = texture(gGrass, uv).rgb * groundShade(v, vec3(0.36, 0.51, 0.2)) * wGrass
         + texture(gDry, uv).rgb * groundShade(v, vec3(0.46, 0.48, 0.26)) * wDry
         + texture(gSand, uv).rgb * groundShade(v, vec3(0.82, 0.64, 0.42)) * wSand
         + texture(gEarth, uv).rgb * groundShade(v, vec3(0.38, 0.3, 0.2)) * wEarth;
  return mix(c, v * texture(map, uv).rgb, 1.0 - smoothstep(0.05, 0.12, chroma));
}`)
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GROUND_LINE);
  };
  return mat;
}

// ---------- textures local to world ----------
let _detail = null;
function detailTexture() {
  if (_detail) return _detail;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = mulberry(99);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = 200 + (r() - 0.5) * 70 + (vnoise(x / 6, y / 6) - 0.5) * 60;
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1);
  }
  _detail = new THREE.CanvasTexture(c); _detail.wrapS = _detail.wrapT = THREE.RepeatWrapping; _detail.colorSpace = THREE.SRGBColorSpace;
  return _detail;
}
function waterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = 190 + (vnoise(x / 5, y / 3) - 0.5) * 90;
    g.fillStyle = `rgb(${v},${v + 10},${v + 20})`; g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _fenceMat = null;
const fenceMaterial = () => _fenceMat || (_fenceMat = new THREE.MeshLambertMaterial({ map: fenceTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
function fenceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(200,205,210,0.9)'; g.lineWidth = 1.2;
  for (let k = -32; k < 64; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 32, 32); g.stroke(); g.beginPath(); g.moveTo(k + 32, 0); g.lineTo(k, 32); g.stroke(); }
  g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, 32, 2);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


// ---------- pit lane: tarmac, pit wall, garages, lines ----------
function buildPitLane(root, T, pit, surfY, tx, night, env, A) {
  const N = T.N, sd = pit.side;
  const idx = [];
  for (let i = 0; i < N; i++) if (pit.REG[i] >= 0) idx.push(i);
  idx.sort((a, b) => pit.REG[a] - pit.REG[b]);
  const edgeY = (i) => surfY(i, sd * T.W[i] / 2);
  const at = (i, s, lift = 0) => [T.X[i] + T.RX[i] * s * sd, edgeY(i) + lift, T.Z[i] + T.RZ[i] * s * sd];
  const lane = { p: [], u: [] }, wall = { p: [], u: [] }, fence = [], gar = { p: [], u: [] }, roof = { p: [], u: [] }, marks = { p: [], c: [] };
  const quad = (buf, a, b, c, d, ua, ub, va, vb) => { // a,b bottom (i, j)  c,d top
    buf.p.push(...a, ...b, ...c, ...b, ...d, ...c);
    buf.u.push(ua, va, ub, va, ua, vb, ub, va, ub, vb, ua, vb);
  };
  const flip = sd > 0, covered = pitCovered(T, A, pit);
  const face = (buf, a, b, c, d, ua, ub, va, vb) => flip ? quad(buf, b, a, d, c, ub, ua, va, vb) : quad(buf, a, b, c, d, ua, ub, va, vb);
  for (let k = 0; k < idx.length - 1; k++) {
    const i = idx[k], j = idx[k + 1];
    const oi = pit.CEN[i] + pit.width / 2, oj = pit.CEN[j] + pit.width / 2;
    const vi = T.D[i] / 12, vj = vi + T.ds / 12;
    // tarmac from the track edge out to the lane edge (on the ramps, tapering out of the track edge)
    // (along the garages, on under their fronts: no strip of grass at the doors)
    const under = (q) => (pit.MAIN ? pit.MAIN[q] : !isNaN(pit.WALL[q])) ? 0.9 : 0;
    const ti = (pit.OUT ? pit.OUT[i] : oi) + under(i), tj = (pit.OUT ? pit.OUT[j] : oj) + under(j), R = pit.reach || oi - T.W[i] / 2;
    const ui = (ti - T.W[i] / 2) / R, uj = (tj - T.W[j] / 2) / R;
    // (along the garages: from the pit wall out; the runoff in front of it is the circuit's own)
    const si = isNaN(pit.WALL[i]) ? T.W[i] / 2 - 0.05 : pit.WALL[i], sj = isNaN(pit.WALL[j]) ? T.W[j] / 2 - 0.05 : pit.WALL[j];
    const a = at(i, si, 0.004), b = at(j, sj, 0.004), c = at(i, ti, 0.004), d = at(j, tj, 0.004);
    if (flip) { lane.p.push(...a, ...c, ...b, ...b, ...c, ...d); lane.u.push(0, vi, ui, vi, 0, vj, 0, vj, ui, vi, uj, vj); }
    else { lane.p.push(...a, ...b, ...c, ...b, ...d, ...c); lane.u.push(0, vi, 0, vj, ui, vi, 0, vj, uj, vj, ui, vi); }
    if (!isNaN(pit.WALL[i]) && !isNaN(pit.WALL[j])) {
      const wi = pit.WALL[i], wj = pit.WALL[j];
      for (const off of [-0.25, 0.25]) face(wall, at(i, wi + off), at(j, wj + off), at(i, wi + off, 1.1), at(j, wj + off, 1.1), T.D[i] / 4, T.D[i] / 4 + T.ds / 4, 0, 0.3);
      quad(wall, at(i, wi - 0.25, 1.1), at(j, wj - 0.25, 1.1), at(i, wi + 0.25, 1.1), at(j, wj + 0.25, 1.1), 0, 0.1, T.D[i] / 4, T.D[j] / 4);
      // (open at the finish line, where the flag marshal's plinth is: js/pitwall.js)
      const fin = T.open ? T.finish : 0;
      if (Math.min(circDist(i, fin, N), circDist(j, fin, N)) * T.ds > 0.7) fence.push({ a: at(i, wi, 1.1), b: at(j, wj, 1.1), nx: -T.RX[i] * sd, nz: -T.RZ[i] * sd });
      // garages
      const gi = oi + 0.6, gj = oj + 0.6, depth = 16, hgt = 7.5;
      if (!covered(i, j)) face(gar, at(i, gi), at(j, gj), at(i, gi, hgt), at(j, gj, hgt), T.D[i] / 7.5, T.D[i] / 7.5 + T.ds / 7.5, 0, 1); // (the boxes have fronts of their own: js/pitboxes.js)
      face(gar, at(j, gj + depth), at(i, gi + depth), at(j, gj + depth, hgt), at(i, gi + depth, hgt), 0, 0.1, 0.9, 0.95);
      quad(roof, at(i, gi, hgt), at(j, gj, hgt), at(i, gi + depth, hgt), at(j, gj + depth, hgt), 0, 1, T.D[i] / 8, T.D[j] / 8);
    }
  }
  // end caps of the garage block
  const main = idx.filter(i => !isNaN(pit.WALL[i]));
  for (const [i, dir] of [[main[0], 1], [main[main.length - 1], -1]]) {
    if (i === undefined) continue;
    const g0 = pit.CEN[i] + pit.width / 2 + 0.6;
    const q = [at(i, g0), at(i, g0 + 16), at(i, g0, 7.5), at(i, g0 + 16, 7.5)];
    (dir > 0) === flip ? quad(gar, q[0], q[1], q[2], q[3], 0, 0.1, 0.9, 0.95) : quad(gar, q[1], q[0], q[3], q[2], 0, 0.1, 0.9, 0.95);
  }
  // painted lines on the lane (the teams' boxes are marked by their signs: js/pitlife.js)
  const markQuad = (i, j, s0, s1, col) => {
    const c = new THREE.Color(col);
    const a = at(i, s0, 0.008), b = at(j, s0, 0.008), cc = at(i, s1, 0.008), d = at(j, s1, 0.008);
    const P = flip ? [a, cc, b, b, cc, d] : [a, b, cc, b, d, cc];
    for (const v of P) { marks.p.push(...v); marks.c.push(c.r, c.g, c.b); }
  };
  // a line along the lane from sample to sample: s(i) its inner edge, w wide
  const lineAlong = (i, j, si, sj, w, col) => {
    const c = new THREE.Color(col);
    const a = at(i, si, 0.008), b = at(j, sj, 0.008), cc = at(i, si + w, 0.008), d = at(j, sj + w, 0.008);
    const P = flip ? [a, cc, b, b, cc, d] : [a, b, cc, b, d, cc];
    for (const v of P) { marks.p.push(...v); marks.c.push(c.r, c.g, c.b); }
  };
  // The lane's lines, solid white: the pit entry (and exit) line, leaving the track's edge line at the lane's mouth
  // and running out to the nose of the pit wall (keep to the lane side of it); the lane's outer edge, from where the
  // lane is wide enough to have one; along the garages, the line between the fast lane and the boxes
  if (pit.OUT && main.length) {
    const w0 = pit.WALL[main[0]], w1 = pit.WALL[main[main.length - 1]], nR = pit.nRamp, nRo = pit.nRampOut ?? nR, cnt = pit.count;
    const entryS = (i) => {
      const pos = pit.REG[i], half = T.W[i] / 2;
      const f = pos < nR ? pos / nR : pos > cnt - nRo ? (cnt - pos) / nRo : 1, e = f * f * (3 - 2 * f);
      return half + 0.12 + ((pos < nR ? w0 : w1) - 0.3 - half - 0.12) * e;
    };
    for (let k = 0; k < idx.length - 1; k++) {
      const i = idx[k], j = idx[k + 1], inMain = !isNaN(pit.WALL[i]) && !isNaN(pit.WALL[j]);
      if (!inMain) lineAlong(i, j, entryS(i), entryS(j), 0.18, 0xffffff);
      const ei = inMain ? pit.WALL[i] : entryS(i), ej = inMain ? pit.WALL[j] : entryS(j);
      if (pit.OUT[i] - 0.55 > ei + 2.5 && pit.OUT[j] - 0.55 > ej + 2.5) lineAlong(i, j, pit.OUT[i] - 0.55, pit.OUT[j] - 0.55, 0.15, 0xffffff);
      if (inMain) lineAlong(i, j, pit.CEN[i] + pit.width / 2 - 3.6, pit.CEN[j] + pit.width / 2 - 3.6, 0.15, 0xffffff);
      // and behind the wall, the edge of the strip the teams' stands stand on (js/pitwall.js)
      if (inMain && pit.strip) lineAlong(i, j, pit.WALL[i] + 0.25 + pit.strip, pit.WALL[j] + 0.25 + pit.strip, 0.15, 0xffffff);
    }
  }
  // speed limit lines across the lane (white), and the pit entry line where the wall starts (yellow: past it you're in)
  const lines = [[pit.limitIn ?? Math.round(pit.nRamp * 0.55), 0xffffff], [pit.limitOut ?? pit.count - Math.round(pit.nRamp * 0.45), 0xffffff], [pit.commitAt ?? pit.nRamp, 0xffd23a]];
  for (const [pos, col] of lines) {
    const i = idx.find(q => pit.REG[q] === pos), j = idx.find(q => pit.REG[q] === pos + 1);
    if (i === undefined || j === undefined) continue;
    markQuad(i, j, isNaN(pit.WALL[i]) ? T.W[i] / 2 + 0.2 : pit.WALL[i] + 0.4 + (pit.strip || 0), pit.CEN[i] + pit.width / 2, col);
  }
  const mk = (buf, mat) => {
    if (!buf.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    if (buf.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.u, 2));
    if (buf.c) g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); root.add(m); return m;
  };
  mk(lane, new THREE.MeshLambertMaterial({ map: tx.pitAsphalt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mk(wall, new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xd8d4cc, side: THREE.DoubleSide }));
  { const inB = pitBlockTest(T, A, pit); buildCatchFence(root, inB ? fence.filter(f => !inB(f.a[0], f.a[2], 0.3) && !inB(f.b[0], f.b[2], 0.3)) : fence, fenceHeight(env, 2.3), fenceMaterial()); } // (none through the garages' rooms)
  const garMat = night ? new THREE.MeshLambertMaterial({ map: garageTexture(), emissive: 0xffffff, emissiveMap: garageTexture(true), emissiveIntensity: 0.8, color: 0x8890a0, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ map: garageTexture(), side: THREE.DoubleSide });
  mk(gar, garMat);
  buildPitBoxes(root, T, A, pit, { mat: garMat });
  mk(roof, new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xe4e2dc, side: THREE.DoubleSide }));
  const mm = mk(marks, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  if (mm) mm.renderOrder = 1;
  // a crash cushion over the pit wall's nose, facing the cars coming at it (over the wall's first 3 m, so it's where
  // the wall is: you hit it as you'd hit the wall)
  if (main.length > 2) {
    const i = main[0], j = main[Math.min(main.length - 1, Math.max(1, Math.round(3 / T.ds)))];
    const p0 = at(i, pit.WALL[i]), p1 = at(j, pit.WALL[j]), len = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.18, len + 0.4), new THREE.MeshLambertMaterial({ map: cushionTexture() }));
    box.position.set((p0[0] + p1[0]) / 2 - T.FX[i] * 0.2, (p0[1] + p1[1]) / 2 + 0.59, (p0[2] + p1[2]) / 2 - T.FZ[i] * 0.2);
    box.rotation.y = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
    root.add(box);
  }
}
// yellow and black chevrons (a crash cushion's face)
let _cushion = null;
function cushionTexture() {
  if (_cushion) return _cushion;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c21b'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#16161a';
  for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 8, 64); g.lineTo(k + 40, 32); g.lineTo(k + 8, 0); g.lineTo(k, 0); g.lineTo(k + 32, 32); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 60, 64, 4);
  _cushion = new THREE.CanvasTexture(c); _cushion.colorSpace = THREE.SRGBColorSpace;
  return _cushion;
}

const _gar = {};
function garageTexture(lit = false) {
  const k = lit ? 'lit' : 'day';
  if (_gar[k]) return _gar[k];
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  if (lit) {
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff2d0'; g.fillRect(6, 30, 52, 34);
  } else {
    g.fillStyle = '#d8d8dc'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2a2f3a'; g.fillRect(0, 0, 64, 8);            // roof band
    g.fillStyle = '#e8b13a'; g.fillRect(0, 8, 64, 3);
    g.fillStyle = '#9aa0aa'; g.fillRect(4, 14, 56, 12);          // upper windows
    g.fillStyle = '#3c4a5c'; for (let x = 6; x < 60; x += 9) g.fillRect(x, 16, 7, 8);
    g.fillStyle = '#1c1e24'; g.fillRect(6, 30, 52, 34);          // garage opening
    g.fillStyle = '#444a56'; for (let y = 32; y < 64; y += 4) g.fillRect(6, y, 52, 1);
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 28, 64, 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (_gar[k] = t);
}

// ---------- barriers ----------
// ---------- corner distance boards (150 / 100 / 50 m) ----------
// Corners that need real braking are found from the track's own speed profile (the maths the AI drives by): a
// slow point with a big speed drop from the straight before it. Distances are measured along the lap to the
// corner's turn-in (where it starts to bend properly). Boards go on the outside of the corner, bolted to the top
// of the barrier on short brackets and facing the driver; with no barrier there, on a short post by the runoff.
let _boardTex = null;
function boardTextures() {
  if (_boardTex) return _boardTex;
  let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const mk = (label) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 128, 96);
    g.strokeStyle = '#141414'; g.lineWidth = 6; g.strokeRect(5, 5, 118, 86);                   // black border
    g.fillStyle = '#111'; g.font = 'bold 58px Impact, "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 64, 52);
    // weathering: grime towards the bottom, a few scuffs and rain streaks
    const gr = g.createLinearGradient(0, 40, 0, 96); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.28)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 96);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(40,36,30,${0.05 + rnd() * 0.12})`; g.fillRect(rnd() * 128, rnd() * 96, 1 + rnd() * 3, 4 + rnd() * 20); }
    for (let k = 0; k < 400; k++) { const v = rnd() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${rnd() * 0.08})`; g.fillRect(rnd() * 128, rnd() * 96, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  return (_boardTex = { 150: mk('150'), 100: mk('100'), 50: mk('50') });
}
function buildCornerBoards(root, T, A, env, surfY, groundHeight, roadL, night) {
  const N = T.N, ds = T.ds;
  const { V } = computeSpeedProfile(T, new Float32Array(N), { mu: 2.3, kdm: 0.0035, vmax: 88, brake: 1.0 });
  const K = new Float32Array(N), w = Math.max(1, Math.round(10 / ds));
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -w; k <= w; k++) s += Math.abs(T.K[(i + k + N) % N]); K[i] = s / (2 * w + 1); }
  const idx = (j) => ((j % N) + N) % N;
  // slow points: local minima of the speed envelope with a big drop from the fastest point in the 300 m before
  const corners = [], look = Math.round(300 / ds);
  for (let i = 0; i < N; i++) {
    const v = V[i]; if (v >= V[idx(i - 1)] || v > V[idx(i + 1)]) continue;
    let vmax = 0; for (let k = 1; k <= look; k++) vmax = Math.max(vmax, V[idx(i - k)]);
    if (vmax - v < 15) continue; // under ~55 km/h of braking: a lift, not a braking zone
    // turn-in: walking back from the slow point, where the bend drops below 40% of its sharpness
    let e = i; for (let k = 0; k < look; k++) { const j = idx(i - k); if (K[j] < K[i] * 0.4) { e = j; break; } }
    corners.push({ min: i, entry: e });
  }
  // one set of boards per braking zone, never mixed with the next corner's: corners in lap order, and a board may
  // only stand after the previous corner's slowest point (so a chicane's second part, or a corner right after
  // another, never has its 100 appear straight after the first corner's 50). Too close behind: no boards at all.
  corners.sort((a, b) => a.entry - b.entry);
  for (let k = corners.length - 1; k > 0; k--) if (circDist(corners[k].entry, corners[k - 1].entry, N) * ds < 30) corners.splice(k, 1);
  corners.forEach((c, k) => {
    const p = corners[(k - 1 + corners.length) % corners.length];
    c.room = corners.length > 1 ? idx(c.entry - p.min) * ds : Infinity; // metres from the previous slow point to this turn-in
  });
  const T0 = boardTextures(), items = { 150: [], 100: [], 50: [] }, frames = [], brackets = [], poles = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const topOf = (i, sd) => ({ tires: 1.1, armco: 0.95, concrete: 1.2, fence: 0 }[wallTypeAt(A, i, sd, env)] ?? 1.1), BW = 1.6, BH = 1.1;
  const usedAt = [], placed = []; // placed: { i (track sample), dist (150 / 100 / 50), entry (turn-in sample), min (slowest point) }
  for (const c of corners) {
    const side = T.K[c.min] > 0 ? -1 : 1; // the outside of the corner
    if (c.room < 70) continue; // part of a chicane / complex: the first corner's boards cover it
    for (const dist of [150, 100, 50]) {
      if (dist > c.room - 20) continue; // would stand in (or before) the previous corner
      const i = idx(c.entry - Math.round(dist / ds));
      // only on the straight leading in (never inside the previous corner), not on top of another board
      if (K[i] > 1 / 220 || usedAt.some(j => circDist(j, i, N) * ds < 12)) continue;
      let sd = side;
      const blocked = (s2) => (A.pit && A.pit.side === s2 && A.pit.REG[i] >= 0) || (A.OVERPASS && A.OVERPASS[i]);
      if (blocked(sd)) { sd = -sd; if (blocked(sd)) continue; }
      const has = (sd < 0 ? A.HAS_L : A.HAS_R)[i] && !((sd < 0 ? A.GATE_L : A.GATE_R) || [])[i];
      const fx = T.FX[i], fz = T.FZ[i], rx = T.RX[i] * sd, rz = T.RZ[i] * sd;
      let bx, bz, by, mount;
      if (has) {
        const off = (sd < 0 ? A.BL : A.BR)[i];
        const x0 = T.X[i] + rx * off, z0 = T.Z[i] + rz * off;
        const foot = A.BRIDGE[i] ? surfY(i, sd * T.W[i] / 2) : Math.min(surfY(i, sd * T.W[i] / 2), groundHeight(x0, z0) + 0.05) - 0.1;
        by = foot + topOf(i, sd) + 0.3 + BH / 2; mount = 'wall';
        // cantilevered off the top of the wall, leaning in over the runoff towards the track (buildings often stand
        // right behind the wall), but never out over the racing surface
        const inner = Math.max(T.W[i] / 2 + 0.8, off - BW - 0.15), cOff = inner + BW / 2;
        bx = T.X[i] + rx * cOff; bz = T.Z[i] + rz * cOff;
        brackets.push([x0, foot + topOf(i, sd), z0, 0.3]);                                                          // post on the wall
        const toward = cOff < off ? -1 : 1; // arm runs from the wall post towards the board's middle
        brackets.push([x0, foot + topOf(i, sd) + 0.3, z0, 0.08, Math.abs(cOff - off) + 0.1, Math.atan2(-rz * toward, rx * toward)]); // arm
      } else {
        const off = T.W[i] / 2 + Math.max(2.5, (env.runoff || 6) * 0.6);
        bx = T.X[i] + rx * (off + BW / 2); bz = T.Z[i] + rz * (off + BW / 2);
        if (roadL && roadL.onRoad(bx, bz, 0.5)) continue;
        const g0 = groundHeight(bx, bz);
        by = g0 + 1.0 + BH / 2; mount = 'post';
        poles.push([bx, g0, bz, 1.0]);
      }
      // face the car coming towards it, turned a touch towards the track so it reads from the racing line
      const nx = -fx - rx * 0.2, nz = -fz - rz * 0.2;
      q.setFromAxisAngle(up, Math.atan2(nx, nz));
      items[dist].push(m4.compose(new THREE.Vector3(bx, by, bz), q, new THREE.Vector3(1, 1, 1)).clone());
      frames.push(m4.clone());
      usedAt.push(i);
      placed.push({ i, dist, entry: c.entry, min: c.min });
    }
  }
  const mat = (map) => new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: night ? 0.4 : 0.22, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); // (retro-reflective white: readable in shadow)
  const board = new THREE.PlaneGeometry(BW, BH).translate(0, 0, 0.1); // (well clear of the backing box: no z-fighting at range)
  for (const d of [150, 100, 50]) {
    if (!items[d].length) continue;
    const im = new THREE.InstancedMesh(board, mat(T0[d]), items[d].length);
    items[d].forEach((mm, k) => im.setMatrixAt(k, mm)); root.add(im);
  }
  if (frames.length) { // the steel backing box behind the face
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(BW + 0.08, BH + 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0x3a3c40 }), frames.length);
    frames.forEach((mm, k) => im.setMatrixAt(k, mm)); root.add(im);
  }
  const posts = [...brackets.filter(b => !b[4]).map(b => [b[0], b[1], b[2], b[3], 0.09]), ...poles.map(p => [p[0], p[1], p[2], p[3] + 0.1, 0.1])];
  const arms = brackets.filter(b => b[4]);
  if (posts.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x55585e }), posts.length);
    posts.forEach(([x, y, z, h, t], k) => im.setMatrixAt(k, m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(t, h, t)))); root.add(im);
  }
  if (arms.length) { // horizontal arms from the wall post out under the board (laid along the track's right vector)
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x55585e }), arms.length);
    arms.forEach(([x, y, z, t, len, yaw], k) => im.setMatrixAt(k, m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(len, t, t)))); root.add(im);
  }
  return placed;
}

function buildBarriers(root, T, A, env, surfY, groundHeight, tx, night, verge) {
  const inBlk = pitBlockTest(T, A, A.pit);
  const N = T.N;
  // (the track's barrier, or stretch by stretch what a real circuit's dressing has: track.js WALL_TYPES)
  const mains = {}, tops = {}, fence = [];
  const bufOf = (o, k) => (o[k] ??= { p: [], u: [] });
  const push = (buf, a, b, c, d, u0, u1, v0, v1) => {
    buf.p.push(...a, ...b, ...c, ...b, ...d, ...c);
    buf.u.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
  };
  const posts = [], gate = { p: [], u: [] }, gatePosts = [], retain = { p: [], u: [] };
  for (const side of [-1, 1]) {
    const has = side < 0 ? A.HAS_L : A.HAS_R;
    const off = side < 0 ? A.BL : A.BR, cap = A.BMAX && A.BMAX[side < 0 ? 0 : 1];
    // Where the barrier stands: its foot reaches down to the ground (never floating over a drop) and it rises from
    // the higher of the track edge and the ground at / just behind it (never buried in a bank). Where the ground
    // there is higher than the track, a concrete retaining wall fills in under it. The level runs smooth along the
    // barrier (the highest ground over ~20 m, eased), like a wall someone built, not stepping with every bump.
    const FOOT = new Float32Array(N), LVL = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const s = side * off[k], x = T.X[k] + T.RX[k] * s, z = T.Z[k] + T.RZ[k] * s, edge = surfY(k, side * T.W[k] / 2);
      if (A.BRIDGE[k]) { FOOT[k] = edge; LVL[k] = 0; continue; } // (a deck: no wall; LVL is height above the edge here)
      // (the ground beyond the runoff and the tuck behind the wall: what the wall holds back)
      const bk = verge ? verge.EXT[side < 0 ? 0 : 1][k] - off[k] + verge.trenchW + 0.4 : 0.7;
      const g = Math.max(groundHeight(x, z), groundHeight(x + T.RX[k] * side * bk, z + T.RZ[k] * side * bk));
      FOOT[k] = Math.min(edge, g + 0.05) - 0.1;
      LVL[k] = Math.max(edge - 0.1, Math.min(g + 0.05, edge + 4)) - (edge - 0.1); // (above the track edge)
    }
    {
      const w = Math.max(2, Math.round(10 / T.ds)), mx = new Float32Array(N);
      for (let k = 0; k < N; k++) { let v = 0; for (let q = -w; q <= w; q++) v = Math.max(v, LVL[stepIdx(T, k, q)]); mx[k] = v; }
      for (let k = 0; k < N; k++) { let v = 0; for (let q = -w; q <= w; q++) v += mx[stepIdx(T, k, q)]; LVL[k] = v / (2 * w + 1) + surfY(k, side * T.W[k] / 2) - 0.1; }
      for (let k = 0; k < N; k++) if (A.BRIDGE[k]) LVL[k] = FOOT[k];
      // (never more than the most a wall here needs: 4 m over the track edge)
      for (let k = 0; k < N; k++) LVL[k] = Math.min(LVL[k], surfY(k, side * T.W[k] / 2) + 4);
    }
    for (let i = 0; i < N; i++) {
      if (i === T.cut) continue;
      const j = (i + 1) % N;
      if (!has[i] || !has[j]) continue;
      if (A.OVERPASS && (A.OVERPASS[i] || A.OVERPASS[j])) continue; // the overpass has its own parapet + fence
      if (A.pit && A.pit.side === side && (A.pit.HIDE[i] || A.pit.HIDE[j])) continue;
      if (inBlk && (() => { // (through the garages' rooms: none. Any of it, ends or middle: at Monaco another stretch's wall cut through a room)
        const xa = T.X[i] + T.RX[i] * side * off[i], za = T.Z[i] + T.RZ[i] * side * off[i], xb = T.X[j] + T.RX[j] * side * off[j], zb = T.Z[j] + T.RZ[j] * side * off[j];
        return inBlk(xa, za, 0.3) || inBlk(xb, zb, 0.3) || inBlk((xa + xb) / 2, (za + zb) / 2, 0.3);
      })()) continue;
      const gateArr = side < 0 ? A.GATE_L : A.GATE_R, isGate = gateArr && (gateArr[i] || gateArr[j]);
      const la = [FOOT[i], LVL[i]], lb = [FOOT[j], LVL[j]];
      const P = (k, extra = 0) => { // (its top, fence and what it holds back: no further out than the line can go without folding)
        const s = side * (cap ? Math.min(off[k] + extra, Math.max(off[k], cap[k])) : off[k] + extra);
        return [T.X[k] + T.RX[k] * s, (k === i ? la : lb)[1], T.Z[k] + T.RZ[k] * s];
      };
      const a = P(i), b = P(j);
      if (la[1] - la[0] > 0.12 || lb[1] - lb[0] > 0.12) { // the retaining wall (both faces, a little proud of the barrier line)
        const ra = [a[0], la[0], a[2]], rb = [b[0], lb[0], b[2]];
        retain.p.push(ra[0], ra[1], ra[2], rb[0], rb[1], rb[2], a[0], a[1], a[2], rb[0], rb[1], rb[2], b[0], b[1], b[2], a[0], a[1], a[2]);
        const ua0 = T.D[i] / 4, ub0 = (j === 0 ? T.L : T.D[j]) / 4;
        retain.u.push(ua0, la[0] / 4, ub0, lb[0] / 4, ua0, la[1] / 4, ub0, lb[0] / 4, ub0, lb[1] / 4, ua0, la[1] / 4);
        // its top: back over the tuck behind the wall, level with the ground it holds back
        if (verge) {
          const si = side < 0 ? 0 : 1, wa = verge.EXT[si][i] - off[i] + verge.trenchW, wb = verge.EXT[si][j] - off[j] + verge.trenchW;
          const a2 = P(i, wa), b2 = P(j, wb); a2[1] = la[1] + 0.04; b2[1] = lb[1] + 0.04; const a1 = [a[0], la[1] + 0.04, a[2]], b1 = [b[0], lb[1] + 0.04, b[2]];
          const across = (u, t) => [0, 2].map(c => ((1 - u) * a1[c] + u * b1[c]) * (1 - t) + ((1 - u) * a2[c] + u * b2[c]) * t);
          if (!(inBlk && [0, 0.5, 1].some(u => [0.25, 0.5, 0.75, 1].some(t => { const q = across(u, t); return inBlk(q[0], q[1], 0.3); })))) { // (not reaching back into a garage)
            retain.p.push(...a1, ...b1, ...a2, ...b1, ...b2, ...a2);
            retain.u.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1);
          }
        }
      }
      const ua = T.D[i], ub = j === 0 ? T.L : T.D[j];
      const up = (p, h) => [p[0], p[1] + h, p[2]];
      // the catch fence on top (leaning in toward the track)
      const fenceAt = (i, j, a1, b1, h) => fence.push({ a: up(a1, h), b: up(b1, h), nx: -side * (T.RX[i] + T.RX[j]) / 2, nz: -side * (T.RZ[i] + T.RZ[j]) / 2 });
      const order = (buf, lo, hi, a1, b1, u0, u1) => side > 0
        ? push(buf, up(a1, lo), up(b1, lo), up(a1, hi), up(b1, hi), -u0, -u1, 0, 1)
        : push(buf, up(b1, lo), up(a1, lo), up(b1, hi), up(a1, hi), u1, u0, 0, 1);
      const type = wallTypeAt(A, i, side, env), main = bufOf(mains, type), top = bufOf(tops, type);
      if (isGate) { // a closed gate where a road meets the circuit: see-through fence + rails
        order(gate, 0, 2.3, a, b, ua / 3, ub / 3);
        if (!gateArr[(i - 1 + N) % N] || !gateArr[(j + 1) % N]) gatePosts.push(up(gateArr[(i - 1 + N) % N] ? b : a, 0));
        continue;
      }
      if (type === 'tires') {
        order(main, 0, 1.1, a, b, ua, ub);
        const a2 = P(i, 1.0), b2 = P(j, 1.0);
        push(top, up(a, 1.1), up(b, 1.1), up(a2, 1.1), up(b2, 1.1), 0, 1, ua / 4, ub / 4);
      } else if (type === 'armco') {
        order(main, 0.35, 0.95, a, b, ua / 4, ub / 4);
        if (i % 2 === 0) posts.push(up(a, 0));
        fenceAt(i, j, P(i, 0.6), P(j, 0.6), 0.95);
      } else if (type === 'fence') { // a catch fence on its own, from the ground
        if (i % 3 === 0) posts.push(up(a, 0));
        fenceAt(i, j, a, b, 0);
      } else {
        order(main, 0, 1.2, a, b, ua / 16, ub / 16);
        const a2 = P(i, 0.5), b2 = P(j, 0.5);
        push(top, up(a, 1.2), up(b, 1.2), up(a2, 1.2), up(b2, 1.2), 0, 1, ua / 4, ub / 4);
        fenceAt(i, j, P(i, 0.25), P(j, 0.25), 1.2);
      }
    }
  }
  const mk = (buf, mat) => {
    if (!buf.p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.u, 2));
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, mat));
  };
  for (const [type, main] of Object.entries(mains)) {
    const mainTex = type === 'tires' ? tx.tires : type === 'armco' ? tx.armco : tx.wall;
    mk(main, new THREE.MeshLambertMaterial({ map: mainTex, side: THREE.DoubleSide }));
    mk(tops[type], new THREE.MeshLambertMaterial({ color: type === 'tires' ? 0x1a1a1a : 0xa8a49c, side: THREE.DoubleSide }));
  }
  mk(retain, new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xb8b4aa, side: THREE.DoubleSide }));
  if (gate.p.length) {
    mk(gate, new THREE.MeshLambertMaterial({ map: gateTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    for (const p of gatePosts) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), new THREE.MeshLambertMaterial({ color: 0xd8d4c8 })); m.position.set(p[0], p[1] + 1.3, p[2]); root.add(m); }
  }
  if (fence.length) buildCatchFence(root, inBlk ? fence.filter(f => !inBlk(f.a[0], f.a[2], 0.3) && !inBlk(f.b[0], f.b[2], 0.3)) : fence, fenceHeight(env), fenceMaterial());
  if (posts.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 0.12), new THREE.MeshLambertMaterial({ color: 0x6a6e76 }), posts.length);
    const m = new THREE.Matrix4();
    posts.forEach((p, k) => { m.makeTranslation(p[0], p[1] + 0.5, p[2]); im.setMatrixAt(k, m); });
    root.add(im);
  }
}

// ---------- instanced vegetation etc ----------
function protoGeometry(type) {
  const brown = 0x6a4a2a;
  if (type === 'tree') {
    const f = new THREE.IcosahedronGeometry(3, 0); f.scale(1, 0.85, 1);
    const f2 = new THREE.IcosahedronGeometry(2.1, 0);
    return mergeParts([
      { geo: T3(new THREE.CylinderGeometry(0.3, 0.45, 3.4, 5), 0, 1.7, 0), color: brown },
      { geo: T3(f, 0, 5, 0), color: 0x4a7a2e }, { geo: T3(f2, 1.2, 6.2, 0.6), color: 0x5a8a34 },
    ]);
  }
  if (type === 'pine') return mergeParts([
    { geo: T3(new THREE.CylinderGeometry(0.25, 0.4, 3, 5), 0, 1.5, 0), color: brown },
    { geo: T3(new THREE.ConeGeometry(2.6, 4.2, 6), 0, 4.2, 0), color: 0x2e5a30 },
    { geo: T3(new THREE.ConeGeometry(2.0, 3.6, 6), 0, 6.4, 0), color: 0x356636 },
    { geo: T3(new THREE.ConeGeometry(1.3, 3.0, 6), 0, 8.4, 0), color: 0x3a7038 },
  ]);
  if (type === 'palm') {
    const parts = [];
    for (let k = 0; k < 5; k++) parts.push({ geo: T3(new THREE.CylinderGeometry(0.22, 0.28, 1.9, 5), k * 0.18, 0.95 + k * 1.8, 0), color: 0x8a6a44 });
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.BoxGeometry(0.9, 0.06, 4.2); leaf.translate(0, 0, 2.1); leaf.rotateX(0.45); leaf.rotateY((k / 7) * Math.PI * 2);
      leaf.translate(0.9, 9.2, 0); parts.push({ geo: leaf, color: k % 2 ? 0x4f8a2a : 0x3f7a26 });
    }
    return mergeParts(parts);
  }
  if (type === 'cactus') return mergeParts([
    { geo: T3(new THREE.CylinderGeometry(0.38, 0.42, 4.6, 6), 0, 2.3, 0), color: 0x4f7a34 },
    { geo: T3(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 5).rotateZ(Math.PI / 2), 0.8, 2.0, 0), color: 0x4f7a34 },
    { geo: T3(new THREE.CylinderGeometry(0.22, 0.25, 1.6, 5), 1.35, 2.7, 0), color: 0x578a38 },
    { geo: T3(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 5).rotateZ(Math.PI / 2), -0.7, 2.8, 0), color: 0x4f7a34 },
    { geo: T3(new THREE.CylinderGeometry(0.2, 0.22, 1.2, 5), -1.15, 3.3, 0), color: 0x578a38 },
  ]);
  if (type === 'rock') { const g = new THREE.DodecahedronGeometry(2.4, 0); g.scale(1.4, 0.8, 1.1); return mergeParts([{ geo: T3(g, 0, 0.6, 0), color: 0x8a6e58 }]); }
  if (type === 'bush') { const g = new THREE.IcosahedronGeometry(1.3, 0); g.scale(1.3, 0.8, 1.3); return mergeParts([{ geo: T3(g, 0, 0.7, 0), color: 0x5a6a30 }]); }
  if (type === 'tires') {
    const parts = [];
    for (let k = 0; k < 4; k++) parts.push({ geo: T3(new THREE.TorusGeometry(0.45, 0.2, 4, 8).rotateX(Math.PI / 2), 0, 0.2 + k * 0.4, 0), color: k % 2 ? 0xd02020 : 0x1a1a1a });
    return mergeParts(parts);
  }
  if (type === 'cones') {
    const parts = [];
    for (let k = 0; k < 3; k++) {
      parts.push({ geo: T3(new THREE.ConeGeometry(0.25, 0.75, 6), k * 1.2 - 1.2, 0.37, 0), color: 0xff6a10 });
      parts.push({ geo: T3(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 6), k * 1.2 - 1.2, 0.45, 0), color: 0xffffff });
    }
    return mergeParts(parts);
  }
  return null;
}

function buildInstances(root, inst, rng) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (const type in inst) {
    const list = inst[type];
    if (!list.length) continue;
    const geo = protoGeometry(type);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, k) => {
      q.setFromAxisAngle(up, o.rot); s.setScalar(o.sc); p.set(o.x, o.y - 0.2, o.z);
      m.compose(p, q, s); im.setMatrixAt(k, m);
      const v = 0.82 + rng() * 0.3; c.setRGB(v, v * (0.95 + rng() * 0.1), v * (0.9 + rng() * 0.1)); im.setColorAt(k, c);
    });
    im.computeBoundingSphere();
    root.add(im);
  }
}

// concrete foundations under buildings where the ground falls away: sides from below the ground up to the
// building's base, and a top slab (shows round porches and between garages), one merged mesh
function buildPlinths(root, list, tx) {
  const P = [], U = [], C = [];
  for (const { p, y0, y1 } of list) {
    // a little outside the footprint so the walls stand on it
    let cx = 0, cz = 0; for (const q of p) { cx += q[0]; cz += q[1]; } cx /= p.length; cz /= p.length;
    const q = p.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + dx / l * 0.12, z + dz / l * 0.12]; });
    let acc = 0;
    for (let k = 0; k < q.length; k++) {
      const a = q[k], b = q[(k + 1) % q.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u0 = acc / 4, u1 = (acc + len) / 4; acc += len;
      // (both windings: footprints come either way round)
      for (const [A, B, ua, ub] of [[a, b, u0, u1], [b, a, u1, u0]]) {
        P.push(A[0], y0, A[1], B[0], y0, B[1], B[0], y1, B[1], A[0], y0, A[1], B[0], y1, B[1], A[0], y1, A[1]);
        U.push(ua, y0 / 4, ub, y0 / 4, ub, y1 / 4, ua, y0 / 4, ub, y1 / 4, ua, y1 / 4);
        C.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.9, 0.9, 0.9, 0.55, 0.55, 0.55, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9);
      }
    }
    for (let k = 1; k + 1 < q.length; k++) for (const [A, B] of [[q[k], q[k + 1]], [q[k + 1], q[k]]]) {
      P.push(q[0][0], y1, q[0][1], A[0], y1, A[1], B[0], y1, B[1]);
      U.push(q[0][0] / 4, q[0][1] / 4, A[0] / 4, A[1] / 4, B[0] / 4, B[1] / 4);
      C.push(0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tx.concrete, vertexColors: true, color: 0xb8b2a6 }));
  m.castShadow = true; m.receiveShadow = true; m.name = 'plinths';
  root.add(m);
}

// legacy box buildings (auto scenery / props) -> footprint
function rectFootprint(b, theme) {
  const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
  const c = (lx, lz) => [b.x + lx * cs + lz * sn, b.z - lx * sn + lz * cs];
  const hw = b.w / 2, hd = b.d / 2;
  const style = b.style || (b.h > 60 ? 'tower' : b.h < 14 ? (theme === 'city' ? 'shop' : 'house') : ['apartment', 'office', 'apartment', 'office'][b.v || 0]);
  return { p: [c(-hw, -hd), c(hw, -hd), c(hw, hd), c(-hw, hd)], h: b.h, s: style, r: style === 'house' ? 'gable' : 'flat' };
}

const WALL_TINTS = {
  house: [0xf2ead8, 0xe8d8a8, 0xc8d8e8, 0xd0e4c8, 0xecd0c8, 0xffffff, 0xd8c8b0],
  shop: [0xffffff, 0xf0e0c0, 0xe0e8f0, 0xf4d8c0],
  apartment: [0xffffff, 0xe8dcc8, 0xd8d0c8, 0xf0e4d0, 0xc8c0b8],
  office: [0xffffff, 0xe0e8f0, 0xd0d8e0],
  tower: [0xffffff, 0xd8e0f0, 0xc0d0e8],
  warehouse: [0xffffff, 0xe8e0d0, 0xd0d8d8, 0xc8b8a0],
};
const ROOF_TINTS = [0xb05a3c, 0x5a6070, 0x7a5a40, 0x8a3a30, 0x606058];

// extrude building footprints: walls + flat or pitched roofs, merged per style
function buildFootprints(root, list, night, groundHeight, rng) {
  const BT = getBuildingTextures();
  const walls = {};
  const flat = { P: [], U: [], C: [] }, gable = { P: [], U: [], C: [] };
  const col = new THREE.Color();
  const tri = (buf, a, b, c, ua, ub, uc, color) => {
    // force upward/outward facing normals for roof triangles
    buf.P.push(...a, ...b, ...c); buf.U.push(...ua, ...ub, ...uc);
    for (let k = 0; k < 3; k++) buf.C.push(color.r, color.g, color.b);
  };
  const upTri = (buf, a, b, c, color) => {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny < 0) [b, c] = [c, b];
    tri(buf, a, b, c, [a[0] / 6, a[2] / 6], [b[0] / 6, b[2] / 6], [c[0] / 6, c[2] / 6], color);
  };
  for (const bd of list) {
    let p = bd.p;
    if (!p || p.length < 3) continue;
    if (polyArea(p) > 0) p = p.slice().reverse();
    const style = BT[bd.s] ? bd.s : 'apartment';
    const S = BT[style];
    let gmin = Infinity, gmax = -Infinity;
    for (const q of footSamples(p)) { const g = groundHeight(q[0], q[1]); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
    const base = gmax - 0.05, y0 = gmin - 1.5, top = base + bd.h; // (on the highest ground: never sunk into a slope)
    const tints = WALL_TINTS[style];
    col.setHex(tints[Math.floor(rng() * tints.length)]);
    const w = walls[style] || (walls[style] = { P: [], U: [], C: [] });
    let acc = 0;
    const v0 = (y0 - base) / S.tileH, v1 = bd.h / S.tileH;
    for (let k = 0; k < p.length; k++) {
      const a = p[k], c = p[(k + 1) % p.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const u0 = acc / S.tileW, u1 = (acc + len) / S.tileW; acc += len;
      w.P.push(a[0], y0, a[1], c[0], y0, c[1], a[0], top, a[1], c[0], y0, c[1], c[0], top, c[1], a[0], top, a[1]);
      w.U.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
      for (let n = 0; n < 6; n++) w.C.push(col.r, col.g, col.b);
    }
    if (bd.r === 'gable' && p.length === 4) {
      // ridge runs along the longer axis
      let q = p;
      const e01 = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), e12 = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
      if (e12 > e01) q = [q[1], q[2], q[3], q[0]];
      const short = Math.min(e01, e12);
      const rh = Math.min(4.5, short * 0.38);
      const T3 = (pt) => [pt[0], top, pt[1]];
      const mid = (a, b) => [(a[0] + b[0]) / 2, top + rh, (a[1] + b[1]) / 2];
      const m12 = mid(q[1], q[2]), m30 = mid(q[3], q[0]);
      const p0 = T3(q[0]), p1 = T3(q[1]), p2 = T3(q[2]), p3 = T3(q[3]);
      // gable ends use the wall material
      for (const [a, b, r] of [[p1, p2, m12], [p3, p0, m30]]) {
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]) / S.tileW;
        w.P.push(...a, ...b, ...r); w.U.push(0, v1, L, v1, L / 2, v1 + rh / S.tileH);
        for (let n = 0; n < 3; n++) w.C.push(col.r, col.g, col.b);
      }
      const rc = new THREE.Color(ROOF_TINTS[Math.floor(rng() * ROOF_TINTS.length)]);
      const slopeLen = Math.hypot(short / 2, rh) / 3, runLen = Math.max(e01, e12) / 3;
      const quad = (a, b, c, d) => { // a,b eave  c,d ridge (c above b, d above a)
        tri(gable, a, b, c, [0, 0], [runLen, 0], [runLen, slopeLen], rc);
        tri(gable, a, c, d, [0, 0], [runLen, slopeLen], [0, slopeLen], rc);
      };
      quad(p0, p1, m12, m30);
      quad(p2, p3, m30, m12);
    } else {
      const shape = p.map(v => new THREE.Vector2(v[0], v[1]));
      let faces = [];
      try { faces = THREE.ShapeUtils.triangulateShape(shape, []); } catch (e) { faces = []; }
      const rc = new THREE.Color().setHSL(0, 0, 0.72 + rng() * 0.25);
      for (const f of faces) upTri(flat, [p[f[0]][0], top, p[f[0]][1]], [p[f[1]][0], top, p[f[1]][1]], [p[f[2]][0], top, p[f[2]][1]], rc);
    }
  }
  const mesh = (buf, mat) => {
    if (!buf.P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(buf.C, 3));
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, mat));
  };
  for (const style in walls) {
    const S = BT[style];
    const mat = new THREE.MeshLambertMaterial({ map: S.day, vertexColors: true });
    if (night) { mat.color.setHex(0x6a7084); mat.emissive.setHex(0xffffff); mat.emissiveMap = S.lit; mat.emissiveIntensity = 0.9; }
    mesh(walls[style], mat);
  }
  mesh(gable, new THREE.MeshLambertMaterial({ map: BT.roofTiles, vertexColors: true, side: THREE.DoubleSide, color: night ? 0x70788a : 0xffffff }));
  mesh(flat, new THREE.MeshLambertMaterial({ map: BT.roofFlat, vertexColors: true, color: night ? 0x70788a : 0xffffff }));
}

// A grandstand: a row of modules (about 12 m each) along its length, each sat on the ground under it. A module's
// seating rises 1.2 m at the front to 10 m at the back, so it stands at the height that keeps all of the ground under
// it below the seats (dug into a bank behind if need be) and never lower than the ground at its front, with a
// concrete base down to the lowest ground under it. Along a climbing straight the modules step up the hill.
const STAND_D = 12.4; // depth (local -z, front at z = 0 facing the track)
// one of the classic made-in-code props on its own, at the origin facing +Z (the editor's picture of it): grandstand,
// billboard, tire stack, cones, floodlight. null for anything else
export function classicPropModel(type) {
  const tx = getTextures(), g = new THREE.Group(), flat = () => 0;
  if (type === 'grandstand') g.add(buildStand({ x: 0, z: 0, rot: 0, len: 24, y: 0 }, tx, flat));
  else if (type === 'billboard') g.add(buildBoard({ x: 0, z: 0, rot: 0, v: 0, y: 0 }, tx, flat));
  else if (type === 'tires' || type === 'cones') buildInstances(g, { [type]: [{ x: 0, z: 0, rot: 0.4, sc: 1, y: 0.2 }] }, () => 0.5);
  else if (type === 'lamp') buildLamps(g, [{ i: -1, x: 0, z: 0, y: 0, h: 14, user: true, rot: Math.PI }], null, null, null, false, tx, null);
  else return null;
  return g;
}
function buildStand(s, tx, groundHeight) {
  const g = new THREE.Group();
  const L = s.len, n = Math.max(1, Math.round(L / 12)), w = L / n;
  const conc = new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xc8c4bc });
  const crowdTex = tx.crowd.clone(); crowdTex.needsUpdate = true; crowdTex.repeat.set(w / 6, 3);
  const crowd = new THREE.MeshLambertMaterial({ map: crowdTex }), roofM = new THREE.MeshLambertMaterial({ color: 0x2a4a8a });
  const cs = Math.cos(s.rot), sn = Math.sin(s.rot);
  const world = (lx, lz) => [s.x + lx * cs + lz * sn, s.z - lx * sn + lz * cs];
  let top = -Infinity;
  for (let m = 0; m < n; m++) {
    const x0 = -L / 2 + m * w, xc = x0 + w / 2;
    // the height that keeps the ground under the seats, and the lowest ground under the module
    let y = -Infinity, lo = Infinity;
    for (const fx of [0, 0.5, 1]) for (const lz of [0.3, -3, -6, -9, -STAND_D]) {
      const [wx, wz] = world(x0 + w * fx, lz), gh = groundHeight(wx, wz), depth = -lz;
      const allow = depth < 0.5 ? 0 : 1.0 + depth * 0.68;
      y = Math.max(y, gh - allow + 0.05); lo = Math.min(lo, gh);
    }
    const mod = new THREE.Group(); mod.position.set(xc, y, 0);
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(w, 14.5), crowd);
    slope.rotation.x = -(Math.PI / 2 - Math.atan2(12, 8)); slope.position.set(0, 5, -6); mod.add(slope);
    const box = (bw, bh, bd, x, yy, z, mat = conc) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); b.position.set(x, yy, z); mod.add(b); return b; };
    box(w, 1.2, 0.4, 0, 0.6, 0);                 // front wall
    box(w, 10, 0.6, 0, 5, -12.2);                // back wall
    for (const sx of [-1, 1]) box(0.5, 10, STAND_D, sx * w / 2, 5, -6); // (both ends of every module: steps read as separate stands)
    const roof = box(w + 0.6, 0.4, 15, 0, 13.2, -5.5, roofM); roof.rotation.x = -0.08;
    for (const px of [-w / 2 + 0.3, w / 2 - 0.3]) box(0.35, 13, 0.35, px, 6.5, -12);
    // the concrete base, down to the lowest ground under it (hidden in the ground where the bank is high)
    const depth = y - lo + 0.6;
    if (depth > 0.7) box(w, depth, STAND_D + 0.2, 0, -depth / 2 + 0.05, -STAND_D / 2 + 0.1);
    g.add(mod);
    top = Math.max(top, y);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(L * 0.5, 26), 2), new THREE.MeshLambertMaterial({ map: tx.billboards[3], side: THREE.DoubleSide }));
  sign.position.set(0, top + 14.6, 1.5); g.add(sign);
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.rot;
  return g;
}

// A billboard on two legs, its board level at the higher leg's ground; each leg reaches down to its own ground.
function buildBoard(b, tx, groundHeight) {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x55585e });
  const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
  const gl = [-1, 1].map(sx => groundHeight(b.x + sx * 5 * cs, b.z - sx * 5 * sn));
  const y0 = Math.max(...gl);
  [-1, 1].forEach((sx, k) => { const h = 6 + (y0 - gl[k]) + 0.4; const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), metal); p.position.set(sx * 5, 6 - h / 2, -0.2); g.add(p); });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshLambertMaterial({ map: tx.billboards[b.v] }));
  board.position.set(0, 7, 0.02); g.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(12.4, 6.4, 0.2), metal); frame.position.set(0, 7, -0.15); g.add(frame);
  g.position.set(b.x, y0, b.z); g.rotation.y = b.rot;
  return g;
}

function buildLamps(root, lamps, T, A, surfY, night, tx, roadMat) {
  if (!lamps.length) return null;
  // floodlight mast: pole + arm reaching over the track edge + housing with a light panel underneath
  const pole = mergeParts([
    { geo: T3(new THREE.CylinderGeometry(0.12, 0.22, 1, 6), 0, 0.5, 0), color: 0x6a6e76 },
    { geo: T3(new THREE.CylinderGeometry(0.34, 0.4, 0.05, 6), 0, 0.02, 0), color: 0x55585e },
  ]);
  const head = mergeParts([
    { geo: T3(new THREE.BoxGeometry(0.1, 0.1, 2.4), 0, 0.1, -1.1), color: 0x5a5e66 },  // arm
    { geo: T3(new THREE.BoxGeometry(1.6, 0.34, 0.9), 0, 0, -2.2), color: 0x2c3036 },  // housing
  ]);
  // (lamps with a model of their own, the banner posts, are drawn with the scenery: here they only shine)
  const posts = lamps.filter(l => !l.model), models = lamps.filter(l => l.model);
  lamps = [...posts, ...models];
  const im = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ vertexColors: true }), posts.length);
  const ih = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ vertexColors: true }), posts.length);
  const face = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 0.72).rotateX(Math.PI / 2).translate(0, -0.18, -2.2),
    night ? new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffdca8).multiplyScalar(2.6), fog: false, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: 0xb8bcc4, side: THREE.DoubleSide }), posts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const glowP = [];
  posts.forEach((l, k) => {
    m.makeScale(1, l.h, 1); m.setPosition(l.x, l.y, l.z); im.setMatrixAt(k, m);
    // point the arm at the track (towards the nearest road sample); user lamps just face +z
    let rot = l.rot || 0;
    if (l.i >= 0) rot = Math.atan2(-T.RX[l.i] * l.side, -T.RZ[l.i] * l.side) + Math.PI;
    q.setFromAxisAngle(up, rot);
    m.compose(new THREE.Vector3(l.x, l.y + l.h, l.z), q, one); ih.setMatrixAt(k, m); face.setMatrixAt(k, m);
    // light position = under the housing
    const fx = l.x - Math.sin(rot) * 2.2, fz = l.z - Math.cos(rot) * 2.2;
    l.hx = fx; l.hz = fz; l.hy = l.y + l.h - 0.25;
    glowP.push(fx, l.hy, fz);
  });
  for (const l of models) glowP.push(l.hx, l.hy, l.hz);
  if (posts.length) { root.add(im); root.add(ih); root.add(face); }
  if (!night) return null;
  // (everything from here on only shines: one group, so an endurance race's night can fade it: setTimeOfDay)
  const ng = new THREE.Group(); ng.name = 'lampsNight'; root.add(ng); ng.userData.face = posts.length ? face.material : null;

  // glows: a small bright core + a wide faint halo (bloom in the PS2 post pass does the rest)
  // (each lamp's strength, k: a placed floodlight's own setting, else 1, scales its glow, beam, pool and light)
  const kOf = (l) => Math.max(0, l.k ?? 1), gk = [];
  for (const l of lamps) gk.push(kOf(l), kOf(l), kOf(l));
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glowP, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(gk, 3));
  const glowTex = softGlow();
  ng.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 2.4, color: new THREE.Color(0xffd49a).multiplyScalar(1.8), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false })));
  ng.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 11, color: 0xffa860, vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true })));

  // faint light beams down to the road (hazy night air)
  // (the soft volumetric beam of the floodlights, js/trackprops.js: no facets, no hard edge; one draw for them all)
  const beams = new THREE.InstancedMesh(beamCone(6.5), beamMaterial(0.3, 6.5), lamps.length);
  beams.frustumCulled = false;
  const kc = new THREE.Color();
  lamps.forEach((l, k) => { m.compose(new THREE.Vector3(l.hx, l.hy, l.hz), new THREE.Quaternion(), new THREE.Vector3(1, l.h - 0.3, 1)); beams.setMatrixAt(k, m); beams.setColorAt(k, kc.setScalar(kOf(l))); });
  beams.renderOrder = 5;
  ng.add(beams);

  // light pools painted on the road (for lamps too far away to get a real light)
  const pp = [], pu = [];
  const pool = poolTexture();
  for (const l of lamps) {
    if (l.i < 0) continue;
    const R = 19, span = Math.ceil(R / T.ds);
    for (let k = -span; k < span; k++) {
      const i = (l.i + k + T.N) % T.N, j = (i + 1) % T.N;
      const cols = 6;
      for (let c = 0; c < cols; c++) {
        const s0 = -T.W[i] / 2 - 1.5 + ((T.W[i] + 3) * c) / cols, s1 = -T.W[i] / 2 - 1.5 + ((T.W[i] + 3) * (c + 1)) / cols;
        const pt = (ii, s) => [T.X[ii] + T.RX[ii] * s, surfY(ii, Math.max(-T.W[ii] / 2, Math.min(T.W[ii] / 2, s))) + 0.03, T.Z[ii] + T.RZ[ii] * s];
        const a = pt(i, s0), b = pt(i, s1), c2 = pt(j, s0), d = pt(j, s1);
        const uvf = (p) => [0.5 + (p[0] - l.hx) / (2 * R), 0.5 + (p[2] - l.hz) / (2 * R)];
        pp.push(...a, ...b, ...c2, ...b, ...d, ...c2);
        pu.push(...uvf(a), ...uvf(b), ...uvf(c2), ...uvf(b), ...uvf(d), ...uvf(c2));
      }
    }
  }
  let poolMat = null;
  if (pp.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
    poolMat = new THREE.MeshBasicMaterial({ map: pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffb472, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const mm = new THREE.Mesh(g, poolMat);
    mm.renderOrder = 2;
    ng.add(mm);
  }

  const street = lamps.filter(l => l.i < 0);
  if (street.length) {
    const disc = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffb472, opacity: 0.38, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), street.length);
    const R = Math.min(15, 5 + street[0].h * 1.2);
    street.forEach((l, k) => { m.compose(new THREE.Vector3(l.hx, l.y + 0.1, l.hz), new THREE.Quaternion(), new THREE.Vector3(R * 2, 1, R * 2)); disc.setMatrixAt(k, m); disc.setColorAt(k, kc.setScalar(Math.min(1.8, kOf(l)))); });
    disc.renderOrder = 2; ng.add(disc);
  }

  // Real lights on the lamps nearest the camera, for the extra light they throw on the cars, barriers and
  // buildings. They're gentle (the painted pools do most of the work) and each lamp's share eases in and out
  // over a second or so, so nothing ever snaps on as you drive up to it.
  const K = 8, WANT = 5, lights = [];
  for (let k = 0; k < K; k++) { const pl = new THREE.PointLight(0xffbe7c, 0, 46, 1.6); ng.add(pl); lights.push(pl); }
  const w = new Float32Array(lamps.length), order = lamps.map((l, k) => k);
  let lastT = null;
  return {
    update(t, camera) {
      if (!camera) return;
      const dt = lastT === null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const cx = camera.position.x, cz = camera.position.z;
      // look a little ahead of the camera so lights arrive before you do
      camera.getWorldDirection(_dir);
      const fx = cx + _dir.x * 25, fz = cz + _dir.z * 25;
      order.sort((a, b) => ((lamps[a].hx - fx) ** 2 + (lamps[a].hz - fz) ** 2) - ((lamps[b].hx - fx) ** 2 + (lamps[b].hz - fz) ** 2));
      for (let k = 0; k < order.length; k++) {
        const i = order[k], l = lamps[i], d = Math.hypot(l.hx - fx, l.hz - fz);
        const target = k < WANT ? Math.max(0, Math.min(1, (110 - d) / 50)) : 0;
        w[i] += (target - w[i]) * Math.min(1, dt * 1.6);
        if (k > WANT + 12 && w[i] < 0.002) w[i] = 0;
      }
      // hand the lights to the lamps with the biggest share
      const lit = order.filter(i => w[i] > 0.003).sort((a, b) => w[b] - w[a]);
      for (let k = 0; k < K; k++) {
        const i = lit[k], pl = lights[k];
        if (i === undefined) { pl.intensity = 0; continue; }
        const l = lamps[i];
        pl.position.set(l.hx, l.hy - 0.6, l.hz);
        pl.intensity = 170 * kOf(l) * w[i];
      }
    },
  };
}
const _dir = new THREE.Vector3(), _sdir = new THREE.Vector3();
let _glow = null;
function softGlow() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.12, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

let _pool = null;
function poolTexture() {
  if (_pool) return _pool;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _pool = new THREE.CanvasTexture(c); _pool.colorSpace = THREE.SRGBColorSpace;
  return _pool;
}

function buildHorizon(theme, P, cx, cz, R, rng, tx, night) {
  const fogC = new THREE.Color(P.fog);
  const seg = 160;
  const pos = [], col = [];
  const base = theme === 'grass' ? new THREE.Color(0x3e5a34) : theme === 'desert' ? new THREE.Color(0xa8583a) : theme === 'coast' ? new THREE.Color(0x46643e) : new THREE.Color(0x3a3e4a);
  const mixK = night ? 0.3 : 0.55;
  const top = base.clone().lerp(fogC, mixK), bot = base.clone().lerp(fogC, mixK + 0.25);
  if (night) { top.multiplyScalar(0.5); bot.multiplyScalar(0.5); }
  const heights = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    let h;
    const n = fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10);
    if (theme === 'desert') h = n > 0.5 ? 150 + n * 60 : 30 + n * 40;
    else if (theme === 'city') h = 40 + Math.floor(rng() * 6) * 30 * (rng() < 0.7 ? 1 : 0.3);
    else if (theme === 'coast') h = (Math.sin(a * 1.0 + 1) > 0.2 ? 60 + n * 220 : 0);
    else h = 60 + n * 260;
    heights.push(h);
  }
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * R, z0 = cz + Math.sin(a0) * R, x1 = cx + Math.cos(a1) * R, z1 = cz + Math.sin(a1) * R;
    const h0 = heights[k], h1 = theme === 'city' ? heights[k] : heights[k + 1];
    const yb = -20;
    pos.push(x0, yb, z0, x1, yb, z1, x0, h0, z0, x1, yb, z1, x1, h1, z1, x0, h0, z0);
    col.push(bot.r, bot.g, bot.b, bot.r, bot.g, bot.b, top.r, top.g, top.b, bot.r, bot.g, bot.b, top.r, top.g, top.b, top.r, top.g, top.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -5;
  return m;
}

// Soft dark patches on the ground under buildings (rectangular, spilling a little past the walls), trees and
// props (round): the cheap PS1-era trick that stops things looking pasted on.
let _shadowTex = null;
function shadowTextures() {
  if (_shadowTex) return _shadowTex;
  const mk = (rect) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const u = Math.abs((x + 0.5) / 32 - 1), v = Math.abs((y + 0.5) / 32 - 1);
      const d = rect ? Math.max(u, v) : Math.hypot(u, v);
      const a = rect ? 1 - Math.min(1, Math.max(0, (d - 0.62) / 0.38)) : Math.max(0, 1 - d) ** 1.4;
      const i = (y * 64 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = 255 * a;
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  };
  return (_shadowTex = { round: mk(false), rect: mk(true) });
}
function addContactShadows(root, list, gh, night) {
  const R = [], Q = [];
  for (const p of list) {
    const a = envAsset(p.id); if (!a || a.cat === 'skyline' || a.cls === 'litter' || (p.y || 0) > 0.5 + gh(p.x, p.z)) continue;
    const sx = p.sx ?? p.s ?? 1, sz = p.sz ?? p.s ?? 1;
    if (a.cat === 'building' || a.cat === 'landmark') { if (a.w * sx > 4) Q.push([p, a.w * sx + 3.5, a.d * sz + 3.5]); else R.push([p, Math.max(a.w * sx, a.d * sz) * 1.5 + 0.6]); }
    else if (a.cat === 'tree') R.push([p, Math.max(a.w, a.d) * sx * 0.75]);
    else if (a.cat !== 'lamp' && a.cat !== 'sign') R.push([p, Math.max(a.w * sx, a.d * sz) * 1.35 + 0.35]);
  }
  const T = shadowTextures(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const make = (items, tex, op, rect) => {
    if (!items.length) return;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), items.length);
    items.forEach(([p, w, d], k) => { q.setFromAxisAngle(up, p.rot || 0); v.set(p.x, gh(p.x, p.z) + 0.07, p.z); sc.set(w, 1, rect ? d : w); im.setMatrixAt(k, m4.compose(v, q, sc)); });
    im.renderOrder = 1; root.add(im);
  };
  make(Q, T.rect, night ? 0.35 : 0.5, true);
  make(R, T.round, night ? 0.3 : 0.45, false);
}

// paved forecourts / pavements a setting lays between the barriers and the shopfronts (follow the ground)
function buildPaving(root, list, gh, tx) {
  const bufs = { slabs: { p: [], u: [] }, concrete: { p: [], u: [] } };
  for (const pv of list) {
    const b = bufs[pv.k] || bufs.slabs, [a, c1, c2, d] = pv.p;
    const L = Math.hypot(c1[0] - a[0], c1[1] - a[1]), Wd = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const nu = Math.max(1, Math.ceil(L / 4)), nv = Math.max(1, Math.ceil(Wd / 4));
    const P = (u, v) => { const x = a[0] + (c1[0] - a[0]) * u + (d[0] - a[0]) * v, z = a[1] + (c1[1] - a[1]) * u + (d[1] - a[1]) * v; return [x, gh(x, z) + 0.06, z]; };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
      const q = [P(u0, v0), P(u1, v0), P(u0, v1), P(u1, v1)];
      b.p.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
      const uv = [[u0 * L / 2, v0 * Wd / 2], [u1 * L / 2, v0 * Wd / 2], [u0 * L / 2, v1 * Wd / 2], [u1 * L / 2, v1 * Wd / 2]];
      b.u.push(...uv[0], ...uv[1], ...uv[2], ...uv[1], ...uv[3], ...uv[2]);
    }
  }
  for (const [k, b] of Object.entries(bufs)) {
    if (!b.p.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: k === 'concrete' ? tx.concrete : tx.pavement, color: k === 'concrete' ? 0xb8b4ac : 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
  }
}

// ---------- public roads ----------
let _gate = null;
function gateTexture() {
  if (_gate) return _gate;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#c8ccd2'; g.lineWidth = 2;
  for (let k = -64; k < 64; k += 8) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); }
  g.fillStyle = '#e0dcd0'; g.fillRect(0, 0, 64, 5); g.fillRect(0, 59, 64, 5); g.fillRect(0, 30, 64, 4);
  g.fillStyle = '#c8141c'; g.fillRect(26, 14, 12, 12); g.fillStyle = '#fff'; g.fillRect(28, 18, 8, 4);
  _gate = new THREE.CanvasTexture(c); _gate.colorSpace = THREE.SRGBColorSpace; _gate.wrapS = THREE.RepeatWrapping;
  return _gate;
}
// a curb's stripes in its two colors (track.js KERB_STYLES, or its own), drawn as the red / white one is (textures.js)
const _kerbTex = {};
function kerbTexture(cols) {
  const key = cols.join('|');
  if (_kerbTex[key]) return _kerbTex[key];
  const [c1, c2] = cols;
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(0, i * 16, 16, 16); }
  let h = 7; const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) { const v = (rnd() - 0.5) * 0.1; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2;
  return (_kerbTex[key] = t);
}
let _marks = {};
function markingsTexture(kind) {
  if (_marks[kind]) return _marks[kind];
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 128, 64);
  const line = (u, w, col, dash) => { g.fillStyle = col; if (dash) g.fillRect(u * 128 - w / 2, 0, w, 32); else g.fillRect(u * 128 - w / 2, 0, w, 64); };
  if (kind === 'dash') { line(0.05, 3, '#e8e8e8'); line(0.95, 3, '#e8e8e8'); line(0.5, 3, '#f2d24a', true); }
  else if (kind === 'freeway') { line(0.03, 2.5, '#e8e8e8'); line(0.97, 2.5, '#e8e8e8'); line(0.46, 2, '#f2c21b'); line(0.54, 2, '#f2c21b'); for (const u of [0.17, 0.31, 0.69, 0.83]) line(u, 2, '#e8e8e8', true); }
  else if (kind === 'double') { line(0.04, 3, '#e8e8e8'); line(0.96, 3, '#e8e8e8'); line(0.485, 2.5, '#f2c21b'); line(0.515, 2.5, '#f2c21b'); line(0.25, 2, '#e8e8e8', true); line(0.75, 2, '#e8e8e8', true); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (_marks[kind] = t);
}
function buildRoads(root, L, tx, lamps, step, theme, gh, T, A, env) {
  const pieces = L.pieces;
  const RD = { p: [], u: [] }, GT = { p: [], u: [] }, KS = { p: [], u: [] }, PV = { p: [], u: [] }, ST = { p: [] };
  const K = { p: [] }, J = { p: [] }, G = { p: [] }, D = { p: [] }, M = {}, PIL = [];
  const capW = step * 2.7 + 1;
  const quad = (buf, a, b, c, d, uv) => { buf.p.push(...a, ...b, ...c, ...b, ...d, ...c); if (uv) buf.u.push(...uv[0], ...uv[1], ...uv[2], ...uv[1], ...uv[3], ...uv[2]); };
  const wuv = (p) => [p[0] / 8, p[2] / 8]; // asphalt is mapped in world space, so pieces and junction aprons join seamlessly
  const CURB = STREET_CURB, GUT = 0.4, KTOP = 0.26;
  // Kerbed sidewalk along a kerb line: pts [{ x, z, y, nx, nz, d }] (y = road surface, n = unit normal out of
  // the road). Gutter channel on the road side, granite kerb (face + top), paving slabs, outer edge into the ground.
  // pts[i].wk (optional) scales the width, so a sidewalk can taper away to nothing at its end
  const sidewalk = (pts, walk) => {
    const P = (q, off, dy) => [q.x + q.nx * off, q.y + dy, q.z + q.nz * off];
    const foot = (q, off) => { const p = P(q, off, 0); p[1] = Math.min(q.y - 0.5, gh(p[0], p[2]) - 0.3); return p; };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], va = a.d, vb = b.d;
      const wa = walk * (a.wk ?? 1), wb = walk * (b.wk ?? 1), ka = Math.min(KTOP, wa), kb = Math.min(KTOP, wb);
      quad(GT, P(a, -GUT, 0.045), P(a, 0, 0.045), P(b, -GUT, 0.045), P(b, 0, 0.045), [[0, va / 12], [1, va / 12], [0, vb / 12], [1, vb / 12]]);
      quad(KS, P(a, 0, 0.04), P(b, 0, 0.04), P(a, 0, CURB), P(b, 0, CURB), [[va / 2, 0], [vb / 2, 0], [va / 2, 0.4], [vb / 2, 0.4]]);
      quad(KS, P(a, 0, CURB), P(b, 0, CURB), P(a, ka, CURB), P(b, kb, CURB), [[va / 2, 1], [vb / 2, 1], [va / 2, 1 - ka / KTOP * 0.55], [vb / 2, 1 - kb / KTOP * 0.55]]);
      if (wa > KTOP || wb > KTOP) quad(PV, P(a, ka, CURB), P(b, kb, CURB), P(a, wa, CURB), P(b, wb, CURB), [[ka / 2, va / 2], [kb / 2, vb / 2], [wa / 2, va / 2], [wb / 2, vb / 2]]);
      quad(K, P(a, wa, CURB), P(b, wb, CURB), foot(a, wa), foot(b, wb));
    }
  };
  let lampN = 0;
  for (const pc of pieces) {
    const S = pc.s, hw = pc.w / 2, walk = pc.walk;
    const at = (i, off, dy) => { const q = S[i]; return [q.x - q.tz * off, pc.y[i] + dy, q.z + q.tx * off]; };
    const mk = M[pc.lines] || (M[pc.lines] = { p: [], u: [] });
    const portal = (k, dir) => {
      const edge = hw + walk + 0.3, q = S[k], H0 = 5.8;
      let top = H0 + 1.5; for (const f of [-1, 0, 1]) { const o = f * (edge + capW); top = Math.max(top, gh(q.x - q.tz * o, q.z + q.tx * o) - pc.y[k] + 0.3); }
      const P = (o, dy) => at(k, o, dy);
      // face above the opening + the pillars either side of it, then a dark opening set back a little
      quad(K, P(-edge - 1.2, H0), P(edge + 1.2, H0), P(-edge - 1.2, top), P(edge + 1.2, top));
      for (const sd of [-1, 1]) quad(K, P(sd * edge, 0), P(sd * (edge + 1.2), 0), P(sd * edge, H0), P(sd * (edge + 1.2), H0));
      const back = (o, dy) => { const p0 = at(k, o, dy); return [p0[0] + q.tx * dir * 0.6, p0[1], p0[2] + q.tz * dir * 0.6]; };
      quad(D, back(-edge, 0), back(edge, 0), back(-edge, H0), back(edge, H0));
      // a lintel ledge on top
      quad(K, P(-edge - 1.5, top), P(edge + 1.5, top), back(-edge - 1.5, top), back(edge + 1.5, top));
    };
    for (let i = 0; i < S.length - 1; i++) {
      if (S[i].hide || S[i + 1].hide) {
        // tunnel portal where the road goes underground
        const k = !S[i].hide ? i : !S[i + 1].hide ? i + 1 : -1;
        if (k >= 0) portal(k, k === i ? 1 : -1);
        continue;
      }
      const r0 = [at(i, -hw, 0.04), at(i, hw, 0.04), at(i + 1, -hw, 0.04), at(i + 1, hw, 0.04)];
      quad(RD, ...r0, r0.map(wuv));
      const junction = S[i].j || S[i + 1].j;
      if (!junction && pc.lines !== 'none') {
        const m0 = S[i].d / 6, m1 = S[i + 1].d / 6;
        quad(mk, at(i, -hw, 0.05), at(i, hw, 0.05), at(i + 1, -hw, 0.05), at(i + 1, hw, 0.05), [[0, m0], [1, m0], [0, m1], [1, m1]]);
      }
      const hi = S[i].elev || S[i + 1].elev, edge = hw + walk;
      if (hi) for (const sd of [-1, 1]) { // bridge deck: parapet walls + deck edge + underside
        const o = sd * edge;
        const [p0, p1, q0, q1] = [at(i, o, 0.04), at(i + 1, o, 0.04), at(i, o, 1.05), at(i + 1, o, 1.05)];
        quad(K, p0, p1, q0, q1);
        quad(K, at(i, o, -1.2), at(i + 1, o, -1.2), p0, p1);
        if (sd > 0) quad(K, at(i, -edge, -1.2), at(i, edge, -1.2), at(i + 1, -edge, -1.2), at(i + 1, edge, -1.2));
      }
      if (pc.kind === 'freeway') for (const o of [-hw + 0.3, 0, hw - 0.3]) { // jersey barriers: both edges + median
        if (hi && o !== 0) continue;
        const w2 = o === 0 ? 0.35 : 0.25;
        for (const sd of [-1, 1]) quad(J, at(i, o + sd * w2, 0.04), at(i + 1, o + sd * w2, 0.04), at(i, o + sd * w2 * 0.5, 0.85), at(i + 1, o + sd * w2 * 0.5, 0.85));
        quad(J, at(i, o - w2 * 0.5, 0.85), at(i, o + w2 * 0.5, 0.85), at(i + 1, o - w2 * 0.5, 0.85), at(i + 1, o + w2 * 0.5, 0.85));
      }
    }
    // kerbed sidewalks both sides, broken where another road joins (s.j) or the road goes underground
    if (walk > 0) for (const sd of [-1, 1]) {
      let run = [];
      const flush = () => { if (run.length >= 2) sidewalk(run, walk); run = []; };
      S.forEach((q, i) => {
        if (q.j || q.hide) { flush(); return; }
        const nx = -q.tz * sd, nz = q.tx * sd;
        run.push({ x: q.x + nx * hw, z: q.z + nz * hw, y: pc.y[i], nx, nz, d: q.d });
      });
      flush();
    }
    // stop line where the road meets the circuit
    if (pc.lines !== 'none') for (const k of [0, S.length - 1]) {
      if (!S[k].jend) continue;
      const q = S[k], dir = k === 0 ? 1 : -1, back = (o, b) => { const p = at(k, o, 0.055); return [p[0] + q.tx * dir * b, p[1], p[2] + q.tz * dir * b]; };
      const e = hw - (walk > 0 ? GUT : 0.3);
      quad(ST, back(-e, 0.6), back(e, 0.6), back(-e, 1.1), back(e, 1.1));
    }
    // pillars under raised sections (never on the circuit itself: spans over it are unsupported)
    for (let i = 2, last = -99; i < S.length - 2; i++) {
      const q = S[i]; if (!q.elev || q.span || i - last < 8) continue;
      const h = pc.y[i] - 1.2 - (q.rawY - 0.4); if (h < 1.5) continue;
      last = i;
      for (const o of pc.w > 14 ? [-hw * 0.55, hw * 0.55] : [0]) PIL.push([q.x - q.tz * o, q.rawY - 0.4, q.z + q.tx * o, h]);
    }
    // street lamps on the pavement every ~40 m, alternating sides
    if (walk > 0) for (let i = 4; i < S.length - 2; i += 13) {
      if (S[i].j || S[i].hide || S[i].elevLow) continue;
      const sd = lampN++ % 2 ? 1 : -1, q = S[i], off = sd * (hw + walk - 0.4);
      const x = q.x - q.tz * off, z = q.z + q.tx * off;
      const dx = -(-q.tz * sd), dz = -(q.tx * sd); // towards the road's middle
      lamps.push({ i: -1, x, z, y: pc.y[i] + 0.17, h: 7.5, user: true, rot: Math.atan2(-dx, -dz) });
    }
  }
  // junction aprons: asphalt from the road's end to the track edge, flaring out in curves, with sidewalks
  // wrapping round the corners. Heights ease from the road's end to exactly the track edge.
  const edgeY = (i, side) => T.Y[i] + side * T.W[i] / 2 * Math.sin(T.B[i]) + A.LIFT[i] + 0.02;
  for (const jn of L.junctions || []) {
    if (jn.E.y === undefined) continue;
    const e0 = edgeY(jn.poly[0].ti, jn.side), yE = jn.E.y + 0.04;
    const hgt = (v) => edgeY(v.ti, jn.side) + v.w * (yE - e0);
    const P = jn.poly.map(v => [v.x, hgt(v), v.z]);
    const tris = THREE.ShapeUtils.triangulateShape(jn.poly.map(v => new THREE.Vector2(v.x, v.z)), []);
    for (const [a, b, c] of tris) { RD.p.push(...P[a], ...P[b], ...P[c]); RD.u.push(...wuv(P[a]), ...wuv(P[b]), ...wuv(P[c])); }
    for (const w of jn.walks) {
      const pts = w.pts, n = pts.length, line = [];
      let d = 0, pn = null;
      for (let k = 0; k < n; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
        let tx2 = b.x - a.x, tz2 = b.z - a.z; const tl = Math.hypot(tx2, tz2) || 1; tx2 /= tl; tz2 /= tl;
        let nx = -tz2, nz = tx2;
        if (k === 0) { const e = jn.E; nx = pts[0].x - e.x; nz = pts[0].z - e.z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
        else if (nx * pn[0] + nz * pn[1] < 0) { nx = -nx; nz = -nz; }
        pn = [nx, nz];
        if (k > 0) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
        line.push({ x: pts[k].x, z: pts[k].z, y: hgt(pts[k]), nx, nz, d: jn.E.d + d });
      }
      // it runs out along the track edge: on to meet the circuit's own sidewalk where that resumes (same inner
      // edge, width and height, so there's no gap), or, without one, taper it away
      const jb = w.jb, ce = jb !== undefined ? walkEdge(T, A, env, jb, jn.side) : -1, cw = ce >= 0 ? walkWidth(T, A, env, jb, jn.side) : 0;
      if (cw >= 0.8) {
        const q = line[n - 1], x = T.X[jb] + T.RX[jb] * jn.side * ce, z = T.Z[jb] + T.RZ[jb] * jn.side * ce;
        line.push({ x, z, y: edgeY(jb, jn.side) - 0.01, nx: T.RX[jb] * jn.side, nz: T.RZ[jb] * jn.side, d: q.d + Math.hypot(x - q.x, z - q.z), wk: cw / jn.walk });
      } else for (let k = 0; k < 4; k++) line[n - 1 - k].wk = k / 4;
      sidewalk(line, jn.walk);
    }
  }
  const mesh = (buf, mat, uv) => {
    if (!buf.p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.u, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); root.add(m); return m;
  };
  mesh(RD, new THREE.MeshLambertMaterial({ map: tx.roadAsphalt, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), true);
  for (const [kind, buf] of Object.entries(M)) {
    const m = mesh(buf, new THREE.MeshLambertMaterial({ map: markingsTexture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), true);
    if (m) m.renderOrder = 2;
  }
  const stop = mesh(ST, new THREE.MeshLambertMaterial({ color: 0xe6e6e0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  if (stop) stop.renderOrder = 2;
  mesh(GT, new THREE.MeshLambertMaterial({ map: tx.gutter, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), true);
  mesh(KS, new THREE.MeshLambertMaterial({ map: tx.kerbStone, side: THREE.DoubleSide }), true);
  mesh(PV, new THREE.MeshLambertMaterial({ map: tx.pavement, side: THREE.DoubleSide }), true);
  mesh(K, new THREE.MeshLambertMaterial({ color: 0x9a968e, side: THREE.DoubleSide }));
  mesh(J, new THREE.MeshLambertMaterial({ color: 0xc8c4ba, side: THREE.DoubleSide }));
  mesh(D, new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.DoubleSide }));
  mesh(G, new THREE.MeshLambertMaterial({ color: { grass: 0x66883e, desert: 0xcfa070, city: 0x5c5c60, coast: 0x66883e }[theme] || 0x66883e, side: THREE.DoubleSide }));
  if (PIL.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1, 1.6), new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xb0aaa0 }), PIL.length);
    const m = new THREE.Matrix4();
    PIL.forEach(([x, y, z, h], k) => { m.makeScale(1, h, 1); m.setPosition(x, y + h / 2, z); im.setMatrixAt(k, m); });
    root.add(im);
  }
}

// sidewalk inner edge (metres from the centre line) for a sample, or -1 if none there
export function walkEdge(T, A, env, i, side) {
  if (A.OVERPASS && A.OVERPASS[i]) return T.W[i] / 2;
  if (!env.walks || (A.BRIDGE[i])) return -1;
  if (side < 0 ? A.NOWALK_L && A.NOWALK_L[i] : A.NOWALK_R && A.NOWALK_R[i]) return -1; // a road's junction apron
  if (A.pit && A.pit.side === side && A.pit.REG[i] >= 0) return -1;
  const inner = T.W[i] / 2 + kerbW(A, i, side), bar = side < 0 ? A.BL[i] : A.BR[i];
  return bar - inner < 1.2 ? -1 : inner;
}
export const walkWidth = (T, A, env, i, side) => {
  if (A.OVERPASS && A.OVERPASS[i]) return 2.4;
  const bar = side < 0 ? A.BL[i] : A.BR[i], inner = T.W[i] / 2 + kerbW(A, i, side);
  return Math.max(0, Math.min(env.walkW || 2.5, bar - inner - 0.4));
};

// kerbed sidewalks (circuit option) + track overpasses over roads: deck, sidewalks, parapet, curved fence
function buildWalkways(root, T, A, env, surfY, groundHeight, tx) {
  const N = T.N, top = { p: [], u: [] }, face = { p: [] }, conc = { p: [], u: [] }, fence = { p: [], u: [] }, ramp = { p: [], u: [] }, posts = [];
  const q = (buf, a, b, c, d) => buf.p.push(...a, ...b, ...c, ...b, ...d, ...c);
  const qu = (buf, a, b, c, d, u0, u1, v0, v1) => { buf.p.push(...a, ...b, ...c, ...b, ...d, ...c); buf.u.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1); };
  const P = (k, s, dy) => [T.X[k] + T.RX[k] * s, surfY(k, Math.max(-T.W[k] / 2, Math.min(T.W[k] / 2, s))) + dy, T.Z[k] + T.RZ[k] * s];
  const H = WALK_H;
  for (const side of [-1, 1]) for (let i = 0; i < N; i++) {
    if (i === T.cut) continue; // (point-to-point: the run-off end doesn't join the back of the grid)
    const j = (i + 1) % N;
    const ei = walkEdge(T, A, env, i, side), ej = walkEdge(T, A, env, j, side);
    if (ei < 0 || ej < 0) continue;
    const wi = walkWidth(T, A, env, i, side), wj = walkWidth(T, A, env, j, side);
    if (wi < 0.8 || wj < 0.8) continue;
    const s = side, o = (k, e, w) => s * (e + w);
    // painted kerb ramp up from the track (like a street circuit's pavement edge), top, outer face
    const R = WALK_RAMP, a0 = P(i, s * (ei + R), H), b0 = P(j, s * (ej + R), H), a1 = P(i, o(i, ei, wi), H), b1 = P(j, o(j, ej, wj), H);
    const vi0 = T.D[i] / 2, vj0 = (j === 0 ? T.L : T.D[j]) / 2;
    qu(top, a0, b0, a1, b1, vi0, vj0, R / 2, (wi + wj) / 4);
    // (the ramp starts from the kerb's top where there's a kerb, so the two make one smooth climb)
    const k0 = P(i, s * ei, kerbOn(A, i, s) ? KERB_H + 0.012 : 0.012), k1 = P(j, s * ej, kerbOn(A, j, s) ? KERB_H + 0.012 : 0.012), vi = T.D[i] / 8, vj = (j === 0 ? T.L : T.D[j]) / 8;
    qu(ramp, k0, k1, a0, b0, 0, 0, vi, vj);
    ramp.u.splice(ramp.u.length - 12, 12, 0, vi, 0, vj, 1, vi, 0, vj, 1, vj, 1, vi);
    const over = A.OVERPASS && A.OVERPASS[i] && A.OVERPASS[j];
    const gi = over ? a1[1] - 1.6 : Math.min(a1[1] - 0.3, groundHeight(a1[0], a1[2]) - 0.3), gj = over ? b1[1] - 1.6 : Math.min(b1[1] - 0.3, groundHeight(b1[0], b1[2]) - 0.3);
    const f0 = [a1[0], gi, a1[2]], f1 = [b1[0], gj, b1[2]];
    side > 0 ? q(face, a1, b1, f0, f1) : q(face, b1, a1, f1, f0);
    if (!over) continue;
    // overpass: deck underside, parapet wall, tall fence that curves in over the track at the top
    const ui = P(i, 0, -1.6), uj = P(j, 0, -1.6);
    side > 0 ? q(face, [ui[0], ui[1], ui[2]], [uj[0], uj[1], uj[2]], f0, f1) : q(face, [uj[0], uj[1], uj[2]], [ui[0], ui[1], ui[2]], f1, f0);
    const pw = 0.4, oi = s * (ei + wi), oj = s * (ej + wj);
    const at = (k, off, dy) => { const p0 = P(k, off, 0); p0[1] = (k === i ? a1[1] : b1[1]) - H + dy; return p0; };
    const u0 = T.D[i] / 3, u1 = u0 + T.ds / 3;
    for (const [off0, off1] of [[oi, oj], [oi + s * pw, oj + s * pw]]) qu(conc, at(i, off0, 0), at(j, off1, 0), at(i, off0, 1.1), at(j, off1, 1.1), u0, u1, 0, 0.4);
    qu(conc, at(i, oi, 1.1), at(j, oj, 1.1), at(i, oi + s * pw, 1.1), at(j, oj + s * pw, 1.1), u0, u1, 0, 0.1);
    // fence: straight 2.3 m, then curving 1.3 m in over the sidewalk in 4 steps
    const prof = [[0, 1.1], [0, 3.4]];
    for (let k = 1; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; prof.push([-(1 - Math.cos(a)) * 1.3, 3.4 + Math.sin(a) * 0.9]); }
    const fo = s * pw * 0.5;
    for (let k = 0; k < prof.length - 1; k++) {
      const [d0, h0] = prof[k], [d1, h1] = prof[k + 1];
      qu(fence, at(i, oi + fo + s * d0, h0), at(j, oj + fo + s * d0, h0), at(i, oi + fo + s * d1, h1), at(j, oj + fo + s * d1, h1), u0, u1, h0 / 1.2, h1 / 1.2);
    }
    if (i % 2 === 0) posts.push({ base: at(i, oi + fo, 1.1), dir: [T.RX[i] * s, T.RZ[i] * s], prof });
  }
  const mk = (buf, mat, uv) => {
    if (!buf.p.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.u, 2));
    g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); root.add(m); return m;
  };
  mk(top, new THREE.MeshLambertMaterial({ map: tx.pavement, side: THREE.DoubleSide }), true);
  mk(ramp, new THREE.MeshLambertMaterial({ map: tx.kerb, side: THREE.DoubleSide }), true);
  mk(face, new THREE.MeshLambertMaterial({ color: 0x8e8a82, side: THREE.DoubleSide }));
  mk(conc, new THREE.MeshLambertMaterial({ map: tx.concrete, color: 0xb8b2a6, side: THREE.DoubleSide }), true);
  mk(fence, new THREE.MeshLambertMaterial({ map: fenceTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), true);
  // fence posts following the curve
  if (posts.length) {
    const segs = [];
    for (const p of posts) for (let k = 0; k < p.prof.length - 1; k++) {
      const [d0, h0] = p.prof[k], [d1, h1] = p.prof[k + 1];
      segs.push([[p.base[0] + p.dir[0] * d0, p.base[1] - 1.1 + h0, p.base[2] + p.dir[1] * d0], [p.base[0] + p.dir[0] * d1, p.base[1] - 1.1 + h1, p.base[2] + p.dir[1] * d1]]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1, 0.09).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x5a5e66 }), segs.length);
    const m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), qq = new THREE.Quaternion();
    segs.forEach(([a, b], k) => { v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = v.length(); qq.setFromUnitVectors(up, v.normalize()); m.compose(new THREE.Vector3(...a), qq, new THREE.Vector3(1, L, 1)); im.setMatrixAt(k, m); });
    root.add(im);
  }
}
