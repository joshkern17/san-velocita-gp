// Crowds: the rigged fans (js/characters.js) as spectators, hundreds of them for a few draw calls.
// Each fan look is posed on the CPU at two moments of a clip (hands apart / together for a clap, arms down / up for a
// cheer), baked into one static mesh holding both poses; every spectator is an instance of one look + clip, and the
// vertex shader swings between the two poses at the clip's own pace, each spectator at its own phase. About 40% are
// women (the women's heads, js/characters.js). They watch the race: everyone turns toward the nearest cars (a seated
// fan leans round, one on their feet turns right round), and as a car comes past they cheer faster and the ones
// standing jump. race.js tells them where the cars are every frame (setCrowdCars).
//
//   await loadCrowd();                          // characters + bleachers model
//   group.add(buildCrowd([{ x, y, z, rot, sit: true }, ...]));
//   bleacherSeats() -> [{ x, y, z }]            // the bleachers' seats, in the model's space (front at z = 0, facing +Z)
//   paintedPeople(track, ok) -> [{ x, z, s }]   // the spectators the PAINT tool's Crowd brush asks for
//   setCrowdCars(cars, cam)                     // each frame: the cars ({ x, y, z }), the 8 nearest the camera count
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';
import { loadCharacters, makeCharacter, femaleFace, LOOK_GROUPS, CLIP_INFO } from './characters.js';

const SIT = ['sit_clap', 'sit_yell', 'sit_clap_2'];   // in the stands
const STAND = ['idle', 'victory', 'wave'];             // on their feet (painted crowds)
const LOOKS = LOOK_GROUPS.fans, WOMEN = 0.4;
const keyOf = (look, fem, clip) => look + (fem ? '|f|' : '|m|') + clip;

let ready = false, loading = null, bleacherTpl = null;
const BAKED = new Map(); // look|m/f|clip -> { geo, mats, rate }
const clock = { value: 0 };
// the cars the crowd watches: xyz + 1 (0 = none), the 8 nearest the camera
const NCARS = 8, cars = { value: Array.from({ length: NCARS }, () => new THREE.Vector4()) };
export function setCrowdCars(list = [], cam = null, fov = 64) {
  const pick = cam && list.length > NCARS ? [...list].sort((a, b) => ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2) - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2)) : list;
  for (let i = 0; i < NCARS; i++) { const c = pick[i]; if (c && isFinite(c.x)) cars.value[i].set(c.x, c.y || 0, c.z, 1); else cars.value[i].set(0, 0, 0, 0); }
  if (cam) crowdReach(cam, fov);
}

// Only the spectators near the camera are drawn: each look's batch spans every stand on the circuit (one draw call
// for all of them), so it was never culled, and a full set of stands is millions of triangles. Each batch keeps the
// ones within REACH (about 2 pixels tall at 448 lines; further for a zoomed TV camera), packed to the front of its
// instance list, rebuilt when the camera has moved STEP since. Without a camera (the editor) everyone is drawn.
const REACH = 320, STEP = 12, BATCHES = new Set();
let reachAt = null;
function crowdReach(cam, fov) {
  const R = REACH * Math.min(4, Math.max(1, 64 / (fov || 64)));
  if (reachAt && Math.hypot(cam.x - reachAt.x, cam.z - reachAt.z) < STEP && reachAt.r === R) return;
  reachAt = { x: cam.x, z: cam.z, r: R };
  const R2 = (R + STEP) ** 2;
  for (const b of BATCHES) {
    let top = b.im; while (top.parent) top = top.parent;
    if (!top.isScene) { if (b.live) BATCHES.delete(b); continue; } // (not in the scene yet, or a world that's gone)
    b.live = true;
    const { im, xz, all } = b, arr = im.instanceMatrix.array; let n = 0, sig = 0;
    for (let i = 0; i < xz.length / 2; i++) {
      if ((xz[i * 2] - cam.x) ** 2 + (xz[i * 2 + 1] - cam.z) ** 2 > R2) continue;
      if (n !== i) arr.set(all.subarray(i * 16, i * 16 + 16), n * 16);
      n++; sig = (sig * 31 + i) | 0;
    }
    if (n === b.n && sig === b.sig) continue;
    b.n = n; b.sig = sig; im.count = n; im.visible = n > 0;
    if (n) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
}

const bleacherUrl = () => (typeof window !== 'undefined' && window.__SVGP_BLEACHERS_GLB) || 'models/bleachers.glb';
export function loadCrowd() {
  if (loading) return loading;
  loading = Promise.all([
    loadCharacters(),
    new GLTFLoader().loadAsync(bleacherUrl()).then(g => { bleacherTpl = prepBleachers(g.scene); }).catch(e => console.warn('bleachers not loaded:', e && e.message)),
  ]).then(([ok]) => { if (ok) bake(); ready = !!ok; return ready; });
  return loading;
}

// ---------------- bleachers (models/bleachers.glb: tools/props/bleachers.py) ----------------
function prepBleachers(scene) {
  scene.traverse(o => {
    if (!o.isMesh) return;
    const m = new THREE.MeshLambertMaterial({ color: o.material.color.clone() });
    applyPSXMaterial(m, { snap: true, affine: 0 }); o.material = m;
  });
  return scene;
}
export const bleachersReady = () => !!bleacherTpl;
export function makeBleachers() { return bleacherTpl ? bleacherTpl.clone(true) : null; }
// the model's footprint: 7.8 m across, 7.4 m deep behind its front edge
export const BLEACHERS = { w: 7.82, d: 7.38, h: 4.78 };
// 11 rows of benches: each 0.356 m above and 0.656 m behind the last, in three runs of bench with aisles between
// (measured off the model). A seat: where the sitter's feet-floor origin goes (the sit clips put the backside 0.48 m up)
const ROWS = 11, BENCH = [[-3.83, -1.98], [-0.95, 0.91], [1.94, 3.79]];
export function bleacherSeats() {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    const y = 0.47 + 0.356 * r - CLIP_INFO.sit.seat, z = -0.395 - 0.656 * r;
    for (const [a, b] of BENCH) { const n = 3, pitch = (b - a) / n; for (let k = 0; k < n; k++) out.push({ x: a + pitch * (k + 0.5), y, z }); }
  }
  return out;
}

// ---------------- the painted crowd (PAINT > Crowd) ----------------
// stroke: { kind: 'crowd', r, d (density 0..1), seed, pts }. People are scattered over the stroke, about one per
// 1.6 m² at full density; ok(x, z) says where they may stand (off the track and runoff, not in a building). An
// eraser stroke painted later clears them under it.
export function paintedPeople(track, ok = () => true) {
  const strokes = track.paint || [], out = [];
  strokes.forEach((st, si) => {
    if (st.kind !== 'crowd' || !(st.pts || []).length) return;
    let s = (st.seed || 1) >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const r = st.r || 6, per = Math.max(0.05, st.d ?? 0.6) / 1.6;
    // along the stroke, a disc every half radius (overlaps are thinned by a minimum spacing below)
    const pts = st.pts, discs = [];
    for (let i = 0; i < pts.length; i++) {
      discs.push(pts[i]);
      if (i + 1 < pts.length) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / (r * 0.5)); for (let k = 1; k < n; k++) discs.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]); }
    }
    const later = strokes.slice(si + 1).filter(e => e.kind === 'erase');
    const grid = new Map(), cell = 0.75, near = (x, z) => { const cx = Math.floor(x / cell), cz = Math.floor(z / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grid.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(q[0] - x, q[1] - z) < 0.62) return true; return false; };
    for (const [cx, cz] of discs) {
      const n = Math.round(Math.PI * r * r * per * 0.55);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, d = r * Math.sqrt(rnd()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (near(x, z) || !ok(x, z) || later.some(e => e.pts.some(p => Math.hypot(p[0] - x, p[1] - z) < e.r))) continue;
        const key = Math.floor(x / cell) + ',' + Math.floor(z / cell); (grid.get(key) || grid.set(key, []).get(key)).push([x, z]);
        out.push({ x, z, s: rnd() });
      }
    }
  });
  return out;
}

// ---------------- baking ----------------
// a clip's two most different moments (sampled over its first 2.4 s), and how fast to swing between them
function bake() {
  LOOKS.forEach((look, li) => { for (const fem of [false, true]) {
    const face = fem ? femaleFace(li) : null; if (fem && face == null) continue; // (no women's heads file: men only)
    for (const clip of [...SIT, ...STAND]) {
      const ch = makeCharacter({ look, clip, seed: 1, ...(fem ? { face, helmet: false } : {}) });
      const act = ch.action, dur = act.getClip().duration, T = Math.min(dur, 2.4), samples = [];
      for (let k = 0; k < 10; k++) samples.push(pose(ch, (T * k) / 10));
      let best = [0, 1], bd = -1;
      for (let a = 0; a < samples.length; a++) for (let b = a + 1; b < samples.length; b++) {
        const A = samples[a].pos, B = samples[b].pos; let d = 0;
        for (let i = 0; i < A.length; i += 9) d += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (d > bd) { bd = d; best = [a, b]; }
      }
      const A = samples[best[0]], B = samples[best[1]], gap = Math.max(0.15, ((best[1] - best[0]) * T) / 10);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(A.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(A.nrm, 3));
      geo.setAttribute('position2', new THREE.BufferAttribute(B.pos, 3)); geo.setAttribute('normal2', new THREE.BufferAttribute(B.nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(A.uv, 2));
      geo.setIndex(new THREE.BufferAttribute(A.idx, 1));
      A.groups.forEach(g => geo.addGroup(g.start, g.count, g.mat));
      geo.computeBoundingSphere(); geo.boundingSphere.radius += 1;
      BAKED.set(keyOf(look, fem, clip), { geo, mats: A.mats, rate: Math.PI / gap });
      ch.dispose();
    }
  } });
}
// every visible part of a character at time t (skinned, and her head on its bone), in the character's space, merged
// (one group per part)
function pose(ch, t) {
  ch.action.time = t; ch.mixer.update(0); ch.object.updateMatrixWorld(true);
  const parts = []; ch.body.traverseVisible(o => { if (o.isMesh) parts.push(o); });
  let nv = 0, ni = 0; for (const m of parts) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni), groups = [], mats = [];
  const v = new THREE.Vector3(); let ov = 0, oi = 0;
  for (const m of parts) {
    const g = m.geometry, P = g.attributes.position, U = g.attributes.uv, n = P.count;
    for (let i = 0; i < n; i++) {
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
      pos[(ov + i) * 3] = v.x; pos[(ov + i) * 3 + 1] = v.y; pos[(ov + i) * 3 + 2] = v.z;
      if (U) { uv[(ov + i) * 2] = U.getX(i); uv[(ov + i) * 2 + 1] = U.getY(i); }
    }
    const I = g.index, cnt = I ? I.count : n, start = oi;
    for (let k = 0; k < cnt; k++) idx[oi++] = ov + (I ? I.getX(k) : k);
    const ms = Array.isArray(m.material) ? m.material : [m.material];
    if (g.groups.length && ms.length > 1) for (const gr of g.groups) { groups.push({ start: start + gr.start, count: Math.min(gr.count, cnt - gr.start), mat: mats.length + gr.materialIndex }); }
    else groups.push({ start, count: cnt, mat: mats.length });
    mats.push(...ms);
    ov += n;
  }
  const tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tmp.setIndex(new THREE.BufferAttribute(idx, 1)); tmp.computeVertexNormals();
  return { pos, nrm: tmp.attributes.normal.array, uv, idx, groups, mats };
}

// the look's materials, each taught to swing between the two poses and to watch the cars (on top of the PS1 snapping).
// sit: seated fans only lean round (and don't jump)
const MATS = new Map();
function crowdMat(m, rate, sit) {
  const key = m.uuid + '|' + rate.toFixed(2) + (sit ? 's' : '');
  if (MATS.has(key)) return MATS.get(key);
  const c = m.clone(); c.userData = { ...m.userData };
  const prev = m.onBeforeCompile, rateU = { value: rate }, turnU = { value: sit ? 0.45 : 1.25 }, jumpU = { value: sit ? 0 : 1 };
  c.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(c, sh, r);
    Object.assign(sh.uniforms, { uCrowdT: clock, uCrowdRate: rateU, uCars: cars, uTurn: turnU, uJump: jumpU });
    sh.vertexShader = `attribute vec3 position2;\nattribute vec3 normal2;\nuniform float uCrowdT;\nuniform float uCrowdRate;\nuniform vec4 uCars[${NCARS}];\nuniform float uTurn;\nuniform float uJump;\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        #ifdef USE_INSTANCING
          vec3 crowdP = instanceMatrix[3].xyz;
          vec3 crowdF = vec3(instanceMatrix[2].x, 0.0, instanceMatrix[2].z);
        #else
          vec3 crowdP = vec3(0.0), crowdF = vec3(0.0, 0.0, 1.0);
        #endif
        float crowdPh = fract(sin(dot(crowdP.xz, vec2(12.9898, 78.233))) * 43758.5453);
        // the cars: how close the nearest one is (excitement) and which way they are, the near ones counting most
        float crowdE = 0.0; vec2 crowdLook = vec2(0.0);
        for (int i = 0; i < ${NCARS}; i++) {
          vec4 cc = uCars[i]; vec2 dd = cc.xz - crowdP.xz; float L = length(dd) + 0.001;
          crowdE = max(crowdE, cc.w * (1.0 - smoothstep(12.0, 50.0, L)));
          crowdLook += cc.w * (1.0 - smoothstep(30.0, 110.0, L)) * dd / L;
        }
        // turn toward them, as far as uTurn either way from where they face
        float crowdYaw = 0.0, crowdLk = length(crowdLook);
        if (crowdLk > 0.02) {
          float a = atan(crowdLook.x, crowdLook.y) - atan(crowdF.x, crowdF.z);
          a = mod(a + 3.14159265, 6.2831853) - 3.14159265;
          crowdYaw = clamp(a, -uTurn, uTurn) * min(1.0, crowdLk);
        }
        float crowdC = cos(crowdYaw), crowdS = sin(crowdYaw);
        mat3 crowdR = mat3(crowdC, 0.0, -crowdS, 0.0, 1.0, 0.0, crowdS, 0.0, crowdC);
        // their clip at its own pace; a car coming past: a fast cheer
        float crowdW0 = 0.5 + 0.5 * sin(uCrowdT * uCrowdRate * (0.85 + 0.3 * crowdPh) + crowdPh * 6.2832);
        float crowdW1 = 0.5 + 0.5 * sin(uCrowdT * 9.0 * (0.9 + 0.2 * crowdPh) + crowdPh * 6.2832);
        float crowdW = mix(crowdW0, crowdW1, crowdE);
        vec3 objectNormal = crowdR * normalize(mix(normal, normal2, crowdW));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = crowdR * mix(position, position2, crowdW);
        transformed.y += uJump * crowdE * max(0.0, sin(uCrowdT * 7.0 + crowdPh * 6.2832)) * 0.16;`);
  };
  c.customProgramCacheKey = () => 'crowd' + (m.customProgramCacheKey ? m.customProgramCacheKey() : '');
  MATS.set(key, c);
  return c;
}

// people: [{ x, y, z, rot, sit, s (0..1, picks their look + clip) }] -> a group of instanced meshes
export function buildCrowd(people) {
  const g = new THREE.Group(); g.name = 'Crowd'; reachAt = null;
  if (!ready || !people.length) return g;
  const by = new Map();
  for (const p of people) {
    const s = p.s ?? Math.random(), clips = p.sit ? SIT : STAND;
    const look = LOOKS[Math.floor(s * 997) % LOOKS.length], clip = clips[Math.floor(s * 7919) % clips.length];
    const fem = (s * 131) % 1 < WOMEN && BAKED.has(keyOf(look, true, clip));
    const k = keyOf(look, fem, clip) + (p.sit ? '|s' : ''); (by.get(k) || by.set(k, []).get(k)).push(p);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  for (const [k, list] of by) {
    const sit = k.endsWith('|s'), b = BAKED.get(sit ? k.slice(0, -2) : k); if (!b) continue;
    const im = new THREE.InstancedMesh(b.geo, b.mats.map(m => crowdMat(m, b.rate, sit)), list.length);
    list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot || 0); im.setMatrixAt(i, m4.compose(at.set(p.x, p.y, p.z), q, one.setScalar(p.scale || 1))); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    im.onBeforeRender = () => { clock.value = performance.now() / 1000; };
    g.add(im);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    BATCHES.add({ im, xz: Float32Array.from(list.flatMap(p => [p.x, p.z])), all: im.instanceMatrix.array.slice(), n: list.length, sig: null });
  }
  return g;
}
