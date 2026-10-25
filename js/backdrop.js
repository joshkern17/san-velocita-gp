// The land beyond the circuit's ground: hills, mountains or alps all the way round, out to ~15 km, with woods on the
// nearer slopes. (The old horizon, a painted band, is what the other settings still get: world.js buildHorizon.)
//
// One mesh, a ring whose inner edge follows the edge of the ground grid (tucked just under it, so a long thin track
// has no gap down its sides) and runs out in rows ever further apart. The ground rises from the grid's edge: rolling
// foothills first, then ridges (ridged noise: sharp crests), the big peaks furthest out. Its light is baked into the
// vertex colours (sun on the slopes, rock where it's steep, snow up high).
//
// The haze is the scene's own fog, capped: each vertex carries how hazy it may get (aHaze). Down at the grid's edge
// the cap is 1, so the foothills melt into the fog exactly as the ground beside them does; higher up and further away
// it drops, so the ridges and peaks stand out of the haze, each layer paler than the one in front: the look of a
// valley on a hazy afternoon. Woods: cards (a pine, a round broadleaf) on the slopes below the tree line, hazed the same.
//
//   backdropKind(env, theme, track)  -> 'hills' | 'mountains' | 'alps' | 'flat' | null (null: the old horizon)
//   buildBackdrop(kind, { env, P, rect: [x0, z0, x1, z1], base, seed, night })  -> THREE.Group
import * as THREE from 'three';

export const BACKDROPS = { auto: 'Auto', flat: 'Flat', hills: 'Hills', mountains: 'Mountains', alps: 'Alps' };
export const HILLSIDES = { auto: 'Auto', green: 'Green', golden: 'Golden', autumn: 'Autumn', desert: 'Red Rock' };
export function backdropKind(env, theme) {
  const k = env.backdrop || 'auto';
  if (k !== 'auto') return k;
  return theme === 'grass' || theme === 'forest' || theme === 'desert' ? 'hills' : null; // (city, coast: their painted horizon for now)
}

// value noise + ridged fbm (seeded)
function hash(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, s, o = 4) => { let t = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { t += a * vnoise(x * f, z * f, s + k); n += a; f *= 2.07; a *= 0.5; } return t / n; };
const ridged = (x, z, s, o = 5) => { let t = 0, a = 0.5, f = 1, n = 0, w = 1; for (let k = 0; k < o; k++) { let r = 1 - Math.abs(2 * vnoise(x * f, z * f, s + k) - 1); r = r * r * w; w = Math.min(1, r * 2); t += a * r; n += a; f *= 2.13; a *= 0.5; } return t / n; };
// the haze cap for land h m up, d m out: 1 at the valley floor (as foggy as the ground), the near ridges ~0.3, the far
// peaks ~0.7 (in fog or rain more)
const hazeCap = (h, d, thick) => Math.min(1, 0.2 + 0.8 * (1 - smooth(20, 360, h)) + 0.45 * smooth(1500, 15000, d) + thick);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// how high the land is d metres out from the ground's edge, at (x, z): each kind its own profile
const PROFILE = {
  flat:      { near: 25, far: 70, peak: 110, nearAt: 2500, farAt: 9000, ridge: 0.2, snow: Infinity, treeline: 600 },
  hills:     { near: 160, far: 620, peak: 900, nearAt: 1600, farAt: 6000, ridge: 0.4, snow: Infinity, treeline: 1000 },
  mountains: { near: 240, far: 1400, peak: 2600, nearAt: 1400, farAt: 5500, ridge: 0.7, snow: 1900, treeline: 1250 },
  alps:      { near: 340, far: 2000, peak: 4200, nearAt: 1200, farAt: 5000, ridge: 0.85, snow: 1500, treeline: 1100 },
};
function heightAt(pr, x, z, d, s) {
  if (d <= 0) return -30 + 28 * smooth(-60, 0, d);
  const rise = smooth(0, pr.nearAt, d), up = smooth(pr.nearAt * 0.6, pr.farAt, d);
  // (detail the mesh can show there: fewer octaves further out, where the points are further apart. Finer noise than the
  // spacing came out as thin spikes, stretched into vertical streaks between the rows)
  const oc = d < 2500 ? 5 : d < 6000 ? 4 : 3;
  const roll = fbm(x / 1400, z / 1400, s, Math.min(4, oc)) * pr.near * rise;                     // foothills
  const rid = (ridged(x / 3400, z / 3400, s + 11, oc) * pr.ridge + fbm(x / 2800, z / 2800, s + 7, oc - 1) * (1 - pr.ridge)) * pr.far * up;
  const peaks = Math.pow(ridged(x / 7000, z / 7000, s + 23, oc - 1), 1.5) * pr.peak * smooth(pr.farAt * 0.6, pr.farAt * 1.5, d);
  return -2 + roll + rid + peaks;
}

const COL = {
  green:  { low: 0x5a7a3c, high: 0x4c6634, rock: 0x7a746a, snow: 0xeef2f6 },
  golden: { low: 0xd8a446, high: 0xb48434, rock: 0x8c7a5e, snow: 0xf2f0ea },
  autumn: { low: 0x7e7a3e, high: 0x6a5a34, rock: 0x7a7066, snow: 0xeef0f2 },
  desert: { low: 0xb47a50, high: 0x9a5e3e, rock: 0x8a6650, snow: 0xf0e8e0 },
};

// ground(x, z) (optional): the real ground's height out there (a real place's elevation reaches past the grid): the
// ring starts on it at the grid's edge, all the way round, and eases onto `base` and its own hills over ~2.5 km. One
// height all round left a cliff where the edge is low: on a long road over hilly ground (Joeger 2's north end, 140 m
// under the median) a wall 520 m off that filled the sky
export function buildBackdrop(kind, { env = {}, P, rect, base = 0, seed = 7, night = false, theme = 'grass', ground = null }) {
  const pr = PROFILE[kind] || PROFILE.hills;
  const side = env.hillside && env.hillside !== 'auto' ? env.hillside : theme === 'desert' ? 'golden' : 'green'; // (the desert circuits are California's dry golden hills)
  const C = COL[side] || COL.green;
  const [x0, z0, x1, z1] = rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
  const sun = new THREE.Vector3(...(P.sun || [0.4, 0.7, 0.3])).normalize();
  const dark = night ? 0.32 : 1, s = seed % 997;
  // rows: metres out from the grid's edge
  // (rows spaced like the points round the ring at that distance, a little longer: near-square cells everywhere, so a
  // peak is a peak, not a curtain between two far-apart rows)
  const NA = 720, D = [-60, -8];
  for (let d = 40; d < 16500; ) { D.push(d); d += Math.max(50, (900 + d) * 2.2 * Math.PI * 2 / NA); }
  const nr = D.length;
  const rin = (c, sn) => Math.min(Math.abs(c) > 1e-6 ? hw / Math.abs(c) : Infinity, Math.abs(sn) > 1e-6 ? hd / Math.abs(sn) : Infinity);
  const pos = new Float32Array((NA + 1) * nr * 3), col = new Float32Array((NA + 1) * nr * 3), haze = new Float32Array((NA + 1) * nr);
  const H = new Float32Array((NA + 1) * nr), X = new Float32Array((NA + 1) * nr), Z = new Float32Array((NA + 1) * nr);
  for (let a = 0; a <= NA; a++) {
    const t = (a % NA) / NA * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), r0 = rin(c, sn);
    for (let k = 0; k < nr; k++) {
      const id = a * nr + k, r = r0 + D[k], x = cx + c * r, z = cz + sn * r;
      const h = heightAt(pr, x, z, D[k], s);
      // (its foot: the real ground near the edge, easing onto the one base height further out)
      const foot = ground ? base + (ground(x, z) - base) * (1 - smooth(200, 2500, D[k])) : base;
      X[id] = x; Z[id] = z; H[id] = h + (foot - base);
      pos[id * 3] = x; pos[id * 3 + 1] = foot + h; pos[id * 3 + 2] = z;
    }
  }
  // light, ground cover and haze per vertex
  const n = new THREE.Vector3(), cl = new THREE.Color(), tmp = new THREE.Color();
  const lowC = new THREE.Color(C.low), highC = new THREE.Color(C.high), rockC = new THREE.Color(C.rock), snowC = new THREE.Color(C.snow);
  const thick = env.weather === 'fog' || env.weather === 'rain' ? 0.35 : 0; // (in fog / rain the far land fades out more)
  for (let a = 0; a <= NA; a++) for (let k = 0; k < nr; k++) {
    const id = a * nr + k, aa = Math.min(NA, a + 1) * nr + k, ab = Math.max(0, a - 1) * nr + k, ka = a * nr + Math.min(nr - 1, k + 1), kb = a * nr + Math.max(0, k - 1);
    const dx1 = X[aa] - X[ab], dy1 = H[aa] - H[ab], dz1 = Z[aa] - Z[ab], dx2 = X[ka] - X[kb], dy2 = H[ka] - H[kb], dz2 = Z[ka] - Z[kb];
    n.set(dy1 * dz2 - dz1 * dy2, dz1 * dx2 - dx1 * dz2, dx1 * dy2 - dy1 * dx2).normalize(); if (n.y < 0) n.negate();
    const h = H[id], steep = 1 - n.y, lit = 0.34 + 0.8 * Math.max(0, n.dot(sun)) + 0.12 * n.y;
    cl.copy(lowC).lerp(highC, smooth(0, pr.treeline, h));
    // woods: darker patches below the tree line (the cards stand on them near by; far off this is all there is)
    const wood = smooth(0.42, 0.6, vnoise(X[id] / 650, Z[id] / 650, s + 31)) * (1 - smooth(pr.treeline * 0.7, pr.treeline, h)) * smooth(3, 40, h);
    cl.lerp(tmp.setHex(side === 'autumn' ? 0x6a4a28 : side === 'golden' ? 0x5a6038 : 0x2e4426), wood * 0.75);
    // rock bands on the steeper slopes
    const band = vnoise(X[id] / 180, (Z[id] + h * 4) / 180, s + 41);
    cl.lerp(rockC, Math.min(1, smooth(0.22, 0.45, steep) * (0.6 + 0.6 * band)) * smooth(80, 400, h));
    // snow lies on the high, gentler ground; the steep faces stay rock (that's what shows a mountain's shape)
    if (h > pr.snow - 200) cl.lerp(snowC, smooth(pr.snow - 100, pr.snow + 400, h + (1 - steep) * 150) * (1 - smooth(0.22, 0.42, steep)));
    cl.multiplyScalar(lit * dark * (0.94 + 0.12 * vnoise(X[id] / 300, Z[id] / 300, s + 3)));
    col[id * 3] = cl.r; col[id * 3 + 1] = cl.g; col[id * 3 + 2] = cl.b;
    // the haze cap: 1 down at the ground's edge (as foggy as the ground there), less as the land rises out of the
    // valley haze, more again with distance (the far ranges paler)
    const d = D[k];
    haze[id] = hazeCap(h, d, thick);
  }
  const idx = [];
  for (let a = 0; a < NA; a++) for (let k = 0; k < nr - 1; k++) {
    const i0 = a * nr + k, i1 = (a + 1) * nr + k;
    idx.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aHaze', new THREE.BufferAttribute(haze, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  const mat = hazed(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const land = new THREE.Mesh(g, mat); land.name = 'backdrop'; land.frustumCulled = false; land.renderOrder = -4;
  const grp = new THREE.Group(); grp.name = 'Backdrop'; grp.add(land);
  // ---- woods on the nearer slopes
  const trees = woods(pr, side, { X, Z, H, D, NA, nr, base, s, sun, dark, thick });
  if (trees) grp.add(trees);
  return grp;
}

// the scene's fog, capped per vertex by aHaze (a varying from the attribute, or the instance's for the woods)
// Its depth goes in a thin band at the very back (just in front of the sky's), ordered by distance: the screen-space
// fog and aerial tint (js/post.js) take anything that deep for sky and leave it alone (they'd fog 10 km of mountains to
// a flat silhouette), everything in the world (never that deep: it's ~30 km) draws in front, and ridges and woods
// still hide each other.
function hazed(mat, instanced = false) {
  mat.fog = true;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute float aHaze;\nvarying float vHaze;\nvarying float vDist;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvHaze = aHaze;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvDist = length( mvPosition.xyz );`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vHaze;\nvarying float vDist;`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG\n  float fogF = smoothstep( fogNear, fogFar, vFogDepth );\n  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, min( fogF, vHaze ) );\n#endif\n  gl_FragDepth = 0.999992 + 0.0000075 * clamp( vDist / 32000.0, 0.0, 1.0 );`);
  };
  mat.customProgramCacheKey = () => 'backdropHaze' + (instanced ? 'I' : '');
  return mat;
}

// tree cards: a pine and a round broadleaf on a 2-cell texture, crossed planes, one instanced batch
let _treeTex = null;
function treeTexture() {
  if (_treeTex) return _treeTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  // pine (left): tiers of dark triangles on a trunk
  g.fillStyle = '#3a2a1c'; g.fillRect(30, 104, 4, 24);
  for (let k = 0; k < 6; k++) { const y = 8 + k * 16, w = 8 + k * 4.6; g.fillStyle = k % 2 ? '#2f4a2a' : '#284224'; g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y + 26); g.lineTo(32 + w, y + 26); g.closePath(); g.fill(); }
  // broadleaf (right): lumpy round crown on a trunk
  g.fillStyle = '#3a2a1c'; g.fillRect(94, 84, 5, 44);
  for (const [x, y, r] of [[96, 50, 24], [82, 62, 16], [110, 62, 16], [96, 30, 15], [88, 72, 12], [104, 72, 12]]) { g.fillStyle = '#3e5a2c'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.arc(90, 40, 12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return (_treeTex = t);
}
function woods(pr, side, { X, Z, H, D, NA, nr, base, s, sun, dark, thick }) {
  if (typeof document === 'undefined') return null;
  const out = [];
  let r = s * 7919 + 13; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const maxRow = D.findIndex(d => d > 4600);
  for (let tries = 0; tries < 60000 && out.length < 16000; tries++) {
    const a = Math.floor(rnd() * NA), k = 1 + Math.floor(Math.pow(rnd(), 1.6) * (maxRow - 1)), f = rnd(), q = rnd();
    const i00 = a * nr + k, i01 = a * nr + k + 1, i10 = (a + 1) * nr + k, i11 = (a + 1) * nr + k + 1;
    const lerp = (A) => (A[i00] * (1 - f) + A[i10] * f) * (1 - q) + (A[i01] * (1 - f) + A[i11] * f) * q;
    const x = lerp(X), z = lerp(Z), h = lerp(H), d = D[k] * (1 - q) + D[k + 1] * q;
    if (d < 40 || h > pr.treeline || h < 3) continue;
    if (vnoise(x / 650, z / 650, s + 31) < 0.42 + 0.25 * smooth(pr.treeline * 0.5, pr.treeline, h)) continue; // (woods in patches, thinning up the slope)
    const steep = Math.abs(H[i01] - H[i00]) / Math.max(1, D[k + 1] - D[k]); if (steep > 0.75) continue;
    const pine = pr === PROFILE.mountains || pr === PROFILE.alps ? rnd() < 0.85 : rnd() < 0.45;
    const tall = (pine ? 18 : 14) + rnd() * 12;
    out.push({ x, y: base + h - 1, z, tall, pine, d, h });
  }
  if (!out.length) return null;
  // two crossed planes, the texture's half for the kind chosen per instance (uv offset by instance)
  const geo = new THREE.BufferGeometry(), P = [], U = [];
  for (const rot of [0, Math.PI / 2]) {
    const c = Math.cos(rot) * 0.5, sn = Math.sin(rot) * 0.5;
    P.push(-c, 0, -sn, c, 0, sn, c, 1, sn, -c, 0, -sn, c, 1, sn, -c, 1, -sn);
    U.push(0, 0, 0.5, 0, 0.5, 1, 0, 0, 0.5, 1, 0, 1);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const aHaze = new Float32Array(out.length), aKind = new Float32Array(out.length);
  const tint = { green: [0x9fb48a, 0xb6c896], golden: [0x8aa070, 0xc8b070], autumn: [0x8aa070, 0xd08a40], desert: [0x9a9a70, 0xb0a070] }[side] || [0x9fb48a, 0xb6c896];
  const autumnCols = [0xd8742c, 0xe0a83a, 0xc04a28, 0xb8b040];
  const im = new THREE.InstancedMesh(geo, null, out.length), m4 = new THREE.Matrix4(), cl = new THREE.Color();
  out.forEach((t, i) => {
    m4.makeScale(t.tall * (t.pine ? 0.55 : 0.8), t.tall, t.tall * (t.pine ? 0.55 : 0.8)).setPosition(t.x, t.y, t.z); im.setMatrixAt(i, m4);
    cl.setHex(side === 'autumn' && !t.pine ? autumnCols[i % autumnCols.length] : tint[t.pine ? 0 : 1]).multiplyScalar(dark * (0.85 + 0.3 * ((i * 0.618) % 1)));
    im.setColorAt(i, cl);
    aHaze[i] = hazeCap(t.h, t.d, thick);
    aKind[i] = t.pine ? 0 : 0.5;
  });
  geo.setAttribute('aHaze', new THREE.InstancedBufferAttribute(aHaze, 1)); geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(aKind, 1));
  const mat = hazed(new THREE.MeshBasicMaterial({ map: treeTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), true);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => { prev(sh); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.x += aKind;\n#endif'); };
  im.material = mat; im.frustumCulled = false; im.renderOrder = -3; im.name = 'backdropWoods';
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}
