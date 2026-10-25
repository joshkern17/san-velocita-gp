// Long grass: thousands of clumps of blades round the camera, swaying in the wind, pushed aside by the cars.
//
// No grass object is ever moved on the CPU: each clump's place comes from its instance number in the vertex shader. The
// ground round the camera is a grid of tiles (snapped to the camera, so the grass stays put in the world as it moves);
// instance i is clump i % K of tile i / K, at a spot hashed from the tile's world position, so the same tile always
// grows the same grass. Two layers: dense clumps of 7 blades near by, sparser 4-blade clumps further out, each fading
// (shrinking into the ground, thinning by a hash) at its edge, so nothing pops.
//
// Where it grows: a map drawn once per track (a canvas, 1 m a pixel over the ground grid where it fits): white = long grass, grey =
// short, black = none (the track and everything inside its barriers, roads, the pit lane, buildings, stands). Its
// height: the ground grid's heights, as a float texture.
//
//   const g = buildGrass({ quality, colors, rect, step, nx, nz, heights, mask, sun, night, fog })
//   g.mesh (add it to the scene), g.update(t, camera, cars)
import * as THREE from 'three';

export const GRASS_LEVELS = { off: 'Off', short: 'Short', lush: 'Lush' };
// near: radius, tile, clumps a tile, blades a clump; far: the same; h: tallest blade (m)
const Q = {
  short: { near: [26, 3, 20, 6], far: [64, 8, 26, 4], h: 0.55 },
  lush:  { near: [36, 3, 30, 7], far: [112, 8, 40, 4], h: 0.95 },
};
// (the colours as they read in daylight, now lit by the scene: at dusk and night they darken with everything else.
// root, tip, a drier tip on some, and the ground's own colour they fade into far off)
export const GRASS_COLORS = {
  green:  { root: 0x29421c, tip: 0x8cb048, dry: 0xa8b060, ground: 0x4e6a2c },
  golden: { root: 0x6a4e22, tip: 0xe4c46a, dry: 0xf0d890, ground: 0xa88a4e },
  autumn: { root: 0x4e4420, tip: 0xb8a64e, dry: 0xd0a040, ground: 0x7a6a3a },
  desert: { root: 0x6a4e2a, tip: 0xd0b070, dry: 0xe0c890, ground: 0xa08060 },
};

// ---------- where it grows ----------
// rect: [x0, z0, x1, z1] (the ground grid). draw(ctx, toPx) paints on it: black where none, grey where short
export function grassMask(rect, draw, mPerPx = 0) {
  if (typeof document === 'undefined') return null;
  if (!mPerPx) mPerPx = Math.max(1, Math.max(rect[2] - rect[0], rect[3] - rect[1]) / 8000);
  const [x0, z0, x1, z1] = rect, w = Math.ceil((x1 - x0) / mPerPx), h = Math.ceil((z1 - z0) / mPerPx);
  const c = document.createElement('canvas'); c.width = Math.min(8192, w); c.height = Math.min(8192, h);
  const sx = c.width / (x1 - x0), sz = c.height / (z1 - z0);
  const g = c.getContext('2d'); g.fillStyle = 'rgb(255,40,0)'; g.fillRect(0, 0, c.width, c.height); // (green 40: on the grid's own height)
  const P = (x, z) => [(x - x0) * sx, (z - z0) * sz];
  draw(g, P, sx);
  // (soft edges: the grass thins out over a couple of metres)
  const soft = document.createElement('canvas'); soft.width = c.width; soft.height = c.height;
  const sg = soft.getContext('2d'); sg.filter = `blur(${Math.max(1, 1.5 * sx)}px)`; sg.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(soft); t.flipY = false; t.colorSpace = THREE.NoColorSpace; // (row 0 = z0, as the shader reads it) t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// one clump: B blades round its middle, each a tapering blade of 3 triangles (two side by side, one at the tip)
function clumpGeometry(B, spread, seed) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const P = [], T = [], S = [], R = [];
  for (let b = 0; b < B; b++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * spread, ox = Math.cos(a) * d, oz = Math.sin(a) * d, r = rnd();
    const v = (t, side) => { P.push(ox, 0, oz); T.push(t); S.push(side); R.push(r); };
    // base L, base R, mid L, mid R, tip
    const quad = [[0, -1], [0, 1], [0.55, -1], [0.55, 1]], tip = [1, 0];
    const tri = (A, Bv, C) => { v(...A); v(...Bv); v(...C); };
    tri(quad[0], quad[1], quad[2]); tri(quad[1], quad[3], quad[2]); tri(quad[2], quad[3], tip);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aRnd', new THREE.Float32BufferAttribute(R, 1));
  return g;
}

// The grass is the world's own Lambert material (lit by the sun, sky and fog like the ground under it: at dusk it goes
// as dark and warm as everything else) with its vertices placed here: GRASS_POS goes in for <begin_vertex>.
const GRASS_PARS = /* glsl */ `
  attribute float aT, aSide, aRnd;
  uniform sampler2D uHeight, uMask; uniform vec4 uGrid; uniform vec2 uGridN; uniform vec4 uRect;
  uniform vec2 uCamTile; uniform float uTile, uK, uG, uRad, uInner, uH, uWidth, uTime, uLayer;
  uniform vec4 uCars[8];
  varying float vT, vDry, vFar, vCull;
  float h12(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float gridH(vec2 xz) { // the ground grid's height (bilinear)
    vec2 g = (xz - uGrid.xy) / uGrid.z; g = clamp(g, vec2(0.0), uGridN - 1.001);
    vec2 i = floor(g), f = g - i;
    float a = texelFetch(uHeight, ivec2(i), 0).r, b = texelFetch(uHeight, ivec2(i) + ivec2(1, 0), 0).r;
    float c = texelFetch(uHeight, ivec2(i) + ivec2(0, 1), 0).r, d = texelFetch(uHeight, ivec2(i) + ivec2(1, 1), 0).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }`;
const GRASS_POS = /* glsl */ `
  float id = float(gl_InstanceID), ti = floor(id / uK), ci = id - ti * uK;
  vec2 tile = uCamTile + vec2(mod(ti, uG), floor(ti / uG)) - floor(uG * 0.5);
  vec2 base = tile * uTile + vec2(h12(tile + ci * 0.137), h12(tile.yx - ci * 0.291)) * uTile;
  float r1 = h12(base * 0.71 + 3.1), r2 = h12(base * 1.37 - 7.7), r3 = h12(base * 2.11 + 1.3);
  float dist = length(base - cameraPosition.xz);
  // the map: how much grass grows here (0 none .. 1 long); off the ground grid: none. Thin grass (the runoff's) is
  // sparse as well as short
  vec2 muv = (base - uRect.xy) / (uRect.zw - uRect.xy);
  vec4 mk = texture2D(uMask, clamp(muv, 0.0, 1.0));
  float m = (muv.x < 0.0 || muv.y < 0.0 || muv.x > 1.0 || muv.y > 1.0) ? 0.0 : mk.r, lift = (mk.g * 255.0 - 40.0) / 40.0; // (lift: the runoff's surface over the grid)
  // this layer's ring: the near layer thins out over its last fifth as the far one thickens in over the same ring
  // (smoothstep's edges always low to high: reversed is undefined in GLSL, and some GPUs give 0)
  float fadeOut = 1.0 - smoothstep(uRad * 0.8, uRad, dist), fadeIn = uInner > 0.0 ? smoothstep(uInner * 0.8, uInner, dist) : 1.0;
  float keep = step(r2, fadeOut) * step(1.0 - fadeIn, r2) * step(r3, smoothstep(0.05, 0.5, m));
  float hgt = uH * (0.55 + 0.45 * r1) * smoothstep(0.08, 0.45, m) * (0.3 + 0.7 * smoothstep(0.45, 0.85, m)) * (1.0 - smoothstep(uRad * 0.6, uRad, dist));
  vCull = (keep < 0.5 || hgt < 0.03) ? 1.0 : 0.0;
  // the blade: from its root in the clump, facing its own way, tapering, leaning
  float ang = aRnd * 6.2831 + r1 * 3.0, t = aT;
  vec2 root = base + position.xz * (uLayer > 0.5 ? 1.6 : 1.0);
  float bh = hgt * (0.7 + 0.5 * fract(aRnd * 7.31));
  // (narrower the shorter it is: a short tuft at a long blade's width came out as a row of green thorns)
  vec2 across = vec2(cos(ang), sin(ang)) * uWidth * clamp(bh / (uH * 0.7), 0.3, 1.0) * (1.0 - t * 0.85) * aSide;
  // wind: waves rolling across the field, gusts, each blade its own flutter
  vec2 wd = normalize(vec2(1.0, 0.35));
  float wave = sin(dot(root, wd) * 0.11 - uTime * 1.7) * 0.5 + 0.5, gust = sin(dot(root, wd.yx) * 0.023 - uTime * 0.6) * 0.5 + 0.5;
  float bend = (0.12 + 0.5 * wave * (0.4 + 0.6 * gust)) + 0.06 * sin(uTime * 3.1 + aRnd * 40.0);
  vec2 lean = wd * bend + vec2(cos(ang * 1.7), sin(ang * 1.7)) * 0.18;
  // the cars push it aside and flatten it
  for (int k = 0; k < 8; k++) {
    vec4 c = uCars[k]; if (c.w < 0.5) continue;
    vec2 dv = root - c.xz; float dd = length(dv);
    if (dd < 3.2) { float f = 1.0 - dd / 3.2; lean += normalize(dv + 1e-4) * f * 1.6; bh *= 1.0 - 0.6 * f; }
  }
  float tt = t * t;
  vec3 transformed = vec3(root.x + across.x + lean.x * tt * bh, gridH(root) + lift - 0.05 + t * bh * (1.0 - 0.35 * min(1.0, length(lean)) * tt), root.y + across.y + lean.y * tt * bh);
  vT = t; vDry = r1 * r1;
  // far off, the blades take the ground's colour: the grass fades into the land rather than ending in a line
  vFar = smoothstep(uRad * 0.35, uRad * 0.95, dist);`;

export function buildGrass({ quality = 'lush', colors = GRASS_COLORS.green, rect, grid, heights, mask }) {
  const q = Q[quality]; if (!q || !mask) return null;
  const [gx0, gz0, step, nx, nz] = grid;
  // (float textures can't be filtered: anything but Nearest leaves it incomplete and every height reads 0. The shader
  // blends the four texels itself)
  const hTex = new THREE.DataTexture(heights, nx, nz, THREE.RedFormat, THREE.FloatType); hTex.minFilter = hTex.magFilter = THREE.NearestFilter; hTex.generateMipmaps = false; hTex.needsUpdate = true;
  const cars = Array.from({ length: 8 }, () => new THREE.Vector4());
  const group = new THREE.Group(); group.name = 'Grass';
  const layers = [];
  for (const [li, [R, tile, K, B]] of [[0, q.near], [1, q.far]]) {
    const G = Math.ceil((2 * R) / tile) + 1, geo = clumpGeometry(B, li ? 0.7 : 0.35, 17 + li);
    geo.instanceCount = G * G * K;
    const U = {
      uHeight: { value: hTex }, uMask: { value: mask }, uGrid: { value: new THREE.Vector4(gx0, gz0, step, 0) }, uGridN: { value: new THREE.Vector2(nx, nz) },
      uRect: { value: new THREE.Vector4(...rect) }, uCamTile: { value: new THREE.Vector2() }, uTile: { value: tile }, uK: { value: K }, uG: { value: G },
      uRad: { value: R }, uInner: { value: li ? q.near[0] : 0 }, uH: { value: q.h * (li ? 1.1 : 1) }, uWidth: { value: li ? 0.1 : 0.04 }, uTime: { value: 0 }, uLayer: { value: li },
      uCars: { value: cars }, uRoot: { value: new THREE.Color(colors.root) }, uTip: { value: new THREE.Color(colors.tip) }, uDry: { value: new THREE.Color(colors.dry) }, uGround: { value: new THREE.Color(colors.ground) },
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GRASS_PARS)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(cos(aRnd * 6.2831) * 0.35, 1.0, sin(aRnd * 6.2831) * 0.35));')
        .replace('#include <begin_vertex>', GRASS_POS)
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (vCull > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
      // (no flipping the normal on a blade's back: lit from below, the backs came out black)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
        .replace('#include <common>', '#include <common>\nuniform vec3 uRoot, uTip, uDry, uGround; varying float vT, vDry, vFar, vCull;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  vec3 tipC = mix(uTip, uDry, vDry * 0.6);\n  diffuseColor.rgb = mix(mix(uRoot, tipC, smoothstep(0.0, 1.0, vT)), uGround, vFar * 0.75);');
    };
    mat.customProgramCacheKey = () => 'grassLambert';
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = li ? 'grassFar' : 'grassNear';
    group.add(mesh); layers.push({ U, tile });
  }
  return {
    mesh: group,
    update(t, camera, list = []) {
      if (!camera) return;
      for (const L of layers) { L.U.uTime.value = t; L.U.uCamTile.value.set(Math.floor(camera.position.x / L.tile), Math.floor(camera.position.z / L.tile)); }
      for (let k = 0; k < 8; k++) { const c = list[k]; if (c && isFinite(c.x)) cars[k].set(c.x, c.y || 0, c.z, 1); else cars[k].set(0, 0, 0, 0); }
    },
  };
}
