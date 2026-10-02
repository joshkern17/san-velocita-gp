// The baked GT / street / utility cars (models/cars/<id>.glb from tools/assets/bakecars.mjs) as chassis.
// Objects: Body + Wheel_FL/FR/RL/RR, car space = metres, +Y up, nose +Z, left +X, ground at 0.
// They keep their own textures; "paint" cars get their body colour swapped for the livery's main colour
// (the texture's dominant hue is re-tinted, greys / glass / lights are left alone).
// Optional top-level objects Light_Tail* / Light_Head* are the car's own lamps: drawn unlit in their own texture,
// brighter when braking / at night, with a glow on each (left / right halves of one object get one glow each).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { CHASSIS, driverKit, carLights, blobShadow } from './carmodel.js';
import { fillLivery, paintCar } from './livery.js';
import { CARS } from './cars.js';

const TPL = {}, loading = {};
const urlOf = (id) => (typeof window !== 'undefined' && window.__SVGP_CARS && window.__SVGP_CARS[id]) || `models/cars/${id}.glb`;

export function loadRoadCars() {
  return Promise.all(Object.keys(CARS).filter(id => CARS[id].glb).map(id => loadRoadCar(id)));
}
export function loadRoadCar(id) {
  if (loading[id]) return loading[id];
  return (loading[id] = new GLTFLoader().loadAsync(urlOf(id))
    .then(g => { TPL[id] = makeTemplate(id, g.scene); return true; })
    .catch(e => { console.warn('car model not loaded:', id, e && e.message); return false; }));
}
for (const id of Object.keys(CARS)) if (CARS[id].glb) CHASSIS[id] = { ready: () => !!TPL[id], build: (cfg, opts) => buildRoadCar(id, cfg, opts) };

function makeTemplate(id, scene) {
  scene.updateMatrixWorld(true);
  const T = { body: [], wheels: {}, wheelInfo: {}, tail: [], head: [] };
  scene.traverse(o => {
    if (!o.isMesh) return;
    // (the baker quantises positions / normals to int16 / int8: expand to floats before moving them into car space)
    let geo = o.geometry.clone();
    for (const [k, A] of Object.entries(geo.attributes)) if (!(A.array instanceof Float32Array)) {
      const f = new Float32Array(A.count * A.itemSize);
      for (let i = 0; i < A.count; i++) for (let c = 0; c < A.itemSize; c++) f[i * A.itemSize + c] = A.getComponent ? A.getComponent(i, c) : [A.getX(i), A.getY(i), A.getZ(i), A.getW(i)][c];
      geo.setAttribute(k, new THREE.BufferAttribute(f, A.itemSize));
    }
    geo.applyMatrix4(o.matrixWorld);
    // some source models come without normals (baked as zeros): rebuild them, flat, PS1 style
    const N = geo.attributes.normal;
    let bad = !N; if (N) for (let i = 0; i < N.count && !bad; i += Math.max(1, N.count >> 5)) bad = Math.hypot(N.getX(i), N.getY(i), N.getZ(i)) < 0.5;
    if (bad) { geo = geo.index ? geo.toNonIndexed() : geo; geo.deleteAttribute('normal'); geo.computeVertexNormals(); }
    else orient(geo);
    // zero-area triangles leave zero normals, which light as NaN (and the bloom smears that into a black block)
    const NN = geo.attributes.normal;
    for (let i = 0; i < NN.count; i++) { const x = NN.getX(i), y = NN.getY(i), z = NN.getZ(i), l = Math.hypot(x, y, z); if (!(l > 1e-4)) NN.setXYZ(i, 0, 1, 0); }
    NN.needsUpdate = true;
    let n = o; while (n.parent && n.parent !== scene) n = n.parent;
    const m = o.material;
    const part = { geo, map: m.map || null, color: m.color ? m.color.getHex() : 0xffffff, emissive: m.emissiveMap || null, double: m.side === THREE.DoubleSide,
      cutoff: m.alphaTest || CARS[id].cutout || 0, blend: !!m.transparent, obj: n.name };
    const nm = n.name.trim(), c = (nm.match(/^Wheel_(FL|FR|RL|RR)/) || [])[1], lamp = (nm.match(/^Light_(Tail|Head)/i) || [])[1];
    if (c) (T.wheels[c] ||= []).push(part); else if (lamp) T[lamp.toLowerCase()].push(part); else T.body.push(part);
  });
  // bounds of the vertices the triangles actually use (pieces split off a mesh keep all of its vertices)
  const box = (list) => {
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const p of list) { const P = p.geo.attributes.position, I = p.geo.index; const n = I ? I.count : P.count; for (let k = 0; k < n; k++) b.expandByPoint(v.fromBufferAttribute(P, I ? I.getX(k) : k)); }
    return b;
  };
  const tris = (g) => (g.index ? Array.from(g.index.array) : [...Array(g.attributes.position.count).keys()]);
  const subset = (g, list) => { const s = g.clone(); s.setIndex(list); return s; };
  for (const [c, list] of Object.entries(T.wheels)) {
    const b = box(list);
    let ctr = b.getCenter(new THREE.Vector3()), r = Math.max(0.2, (b.max.y - b.min.y) / 2);
    // wheels baked into the body as well (a stationary copy). Only on the models that really have one (elsewhere this
    // would grab bits of the wheel arches): 'drop' deletes the copy (RM-X: its real wheels are complete),
    // 'move' adds it to the spinning wheel (Mustang: the split-out wheels are only part of the wheel)
    const mode = CARS[id].bodyWheels, v = new THREE.Vector3();
    // (tyre half-width to search: the Mustang's split-out wheels are flat discs, its tyres are further in)
    const hw = CARS[id].wheelW ? CARS[id].wheelW / 2 : Math.max(0.12, (b.max.x - b.min.x) / 2) + 0.04;
    const inX = CARS[id].wheelW ? (x) => (ctr.x > 0 ? x <= ctr.x + 0.03 && x > ctr.x - 2 * hw : x >= ctr.x - 0.03 && x < ctr.x + 2 * hw) : (x) => Math.abs(x - ctr.x) < hw;
    if (mode) for (const p of [...T.body]) {
      const P = p.geo.attributes.position, idx = tris(p.geo), keep = [], take = [];
      const inWheel = (i) => { v.fromBufferAttribute(P, i); return inX(v.x) && Math.hypot(v.y - ctr.y, v.z - ctr.z) < r * 1.02; };
      for (let t = 0; t < idx.length; t += 3) (inWheel(idx[t]) && inWheel(idx[t + 1]) && inWheel(idx[t + 2]) ? take : keep).push(idx[t], idx[t + 1], idx[t + 2]);
      if (!take.length) continue;
      p.geo.setIndex(keep);
      if (mode === 'move') list.push({ ...p, geo: subset(p.geo, take) });
    }
    if (mode === 'move') { // re-centre on the whole wheel so it spins true
      const b2 = box(list); ctr = b2.getCenter(new THREE.Vector3()); r = Math.max(0.2, (b2.max.y - b2.min.y) / 2);
    }
    for (const p of list) p.geo.translate(-ctr.x, -ctr.y, -ctr.z);
    // modelled with the wheel steered (BMW): turn it straight, axle along x (the axle = the wheel's thinnest direction)
    let sxx = 0, szz = 0, sxz = 0, n = 0;
    for (const p of list) { const P = p.geo.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); sxx += x * x; szz += z * z; sxz += x * z; n++; } }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz); // direction of largest spread in x/z
    // the largest spread should be along z (the tyre's diameter); the axle is 90 degrees from it
    let yaw = (szz > sxx ? Math.PI / 2 : 0) - ang; yaw = ((yaw + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
    if (CARS[id].straighten && Math.abs(yaw) > 0.03 && Math.abs(yaw) < 0.6) for (const p of list) p.geo.rotateY(-yaw);
    T.wheelInfo[c] = { ctr, r };
  }
  // flat pieces lying on the ground (fake shadow quads baked into the body mesh): drop them, we draw our own shadow
  for (const p of T.body) {
    const g = p.geo, P = g.attributes.position, idx = g.index ? Array.from(g.index.array) : [...Array(P.count).keys()], keep = [];
    for (let t = 0; t < idx.length; t += 3) if (!(P.getY(idx[t]) < 0.05 && P.getY(idx[t + 1]) < 0.05 && P.getY(idx[t + 2]) < 0.05)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    if (keep.length < idx.length) g.setIndex(keep);
  }
  // flat panels filling the wheel arches (they cover the tyres on some models): drop them
  if (CARS[id].archFix) for (const p of T.body) {
    const g = p.geo, P = g.attributes.position, idx = g.index ? Array.from(g.index.array) : [...Array(P.count).keys()], keep = [];
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      A.fromBufferAttribute(P, idx[t]); B.fromBufferAttribute(P, idx[t + 1]); C.fromBufferAttribute(P, idx[t + 2]);
      const m = A.clone().add(B).add(C).divideScalar(3), n = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
      const inArch = Object.values(T.wheelInfo).some(w => Math.sign(m.x) === Math.sign(w.ctr.x) && Math.hypot(m.y - w.ctr.y, m.z - w.ctr.z) < w.r * 1.02 && Math.abs(n.x) > 0.8);
      if (!inArch) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    g.setIndex(keep);
  }
  T.bb = box(T.body);
  T.tailSpots = lampSpots(T.tail, -1); T.headSpots = lampSpots(T.head, 1);
  // the paintable hue: the most common strongly coloured hue in the body texture
  T.paintHue = null;
  const bodyMap = T.body.map(p => p.map).find(Boolean);
  if (bodyMap && CARS[id].paint) {
    const img = bodyMap.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, bins = new Float32Array(36); let sat = 0, white = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const [h, s, l] = hsl(d[i], d[i + 1], d[i + 2]); n++;
      if (s > 0.35 && l > 0.12 && l < 0.85) { bins[Math.floor(h * 36) % 36]++; sat++; }
      if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 30 && l > 0.6) white++;
    }
    let best = 0; for (let k = 1; k < 36; k++) if (bins[k] > bins[best]) best = k;
    const share = (bins[best] + bins[(best + 1) % 36] + bins[(best + 35) % 36]) / Math.max(1, sat);
    const P = { canvas: c, data: g.getImageData(0, 0, c.width, c.height), flipY: bodyMap.flipY, wrapS: bodyMap.wrapS, wrapT: bodyMap.wrapT };
    // a white car (mostly light neutral texels, colour only in badges / lamps): the whites are the paint, the photo's
    // greys its shading
    if (white > n * 0.3 && sat < n * 0.1) T.paintHue = { ...P, white: true, islands: paintIslands(P.data) };
    else if (sat > 50 && share > 0.4) T.paintHue = { ...P, hue: (best + 0.5) / 36 };
  }
  T.textures = {};
  if (bodyMap && CARS[id].livery && T.paintHue && T.paintHue.white) T.liv = liveryTemplate(id, T, bodyMap);
  return T;
}

// a white body texel: how much of it is paint (k: 0 = trim / glass / lamp, 1 = paint) and its shading relative to
// clean white (sh). Neutral = low chroma: HSL saturation blows up near white, so a faintly blue highlight would
// read as a badge.
function whitePaint(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510;
  return [Math.min(1, Math.max(0, (0.2 - (mx - mn) / 255) / 0.08)) * Math.min(1, Math.max(0, (l - 0.34) / 0.14)), Math.min(1.08, l / 0.9)];
}

// light specks that aren't part of a painted surface: lettering on the glass (the 935's windscreen banner), the white
// of a badge. The photo's light texels in connected patches; patches smaller than ~0.02% of the texture are details,
// kept as photographed (1 in the returned map), the big ones are bodywork.
function paintIslands(img) {
  const { width: w, height: h, data: d } = img, n = w * h, light = new Uint8Array(n), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) light[i] = whitePaint(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])[0] > 0 ? 1 : 0;
  const seen = new Uint8Array(n), stack = new Int32Array(n), min = Math.max(64, n * 0.0002);
  for (let s = 0; s < n; s++) {
    if (!light[s] || seen[s]) continue;
    let top = 0, cnt = 0; stack[top++] = s; seen[s] = 1;
    const patch = [];
    while (top) {
      const i = stack[--top], x = i % w; cnt++; if (cnt < min) patch.push(i);
      if (x > 0 && light[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && light[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (i >= w && light[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
      if (i < n - w && light[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
    }
    if (cnt < min) for (const i of patch) out[i] = 1;
  }
  return { map: out, w, h };
}

// ---------------- full liveries on a white car (livery: true) ----------------
// Like the imported F1 car (glbcar.js): every texel of the body texture knows where it sits on the car, so the
// livery's panels are projected onto the surface and every saved livery / decal ports over. The livery is then laid
// over the photo through its paint mask (whitePaint): glass, lamps, grille and badges stay as photographed, and the
// photo's greys shade the new paint. Needs a body texture with unique UVs (no mirrored halves).
const PICK_RES = 1024; // texel map resolution for the designer's click-to-place
function liveryTemplate(id, T, map) {
  const bb = T.bb, zF = bb.max.z + 0.02, zR = bb.min.z - 0.02, top = bb.max.y + 0.02, half = Math.max(bb.max.x, -bb.min.x) + 0.02, len = zF - zR;
  // proj(x, y, z) -> panel metres (x right, y down, as seen from outside)
  const panels = {
    top:   { W: half * 2, H: len, role: 'top', nose: 'top', label: 'Bonnet, roof + wing', proj: (x, y, z) => [half - x, zF - z] },
    sideL: { W: len, H: top, role: 'side', nose: 'left', pair: 'sideR', label: 'Left side', proj: (x, y, z) => [zF - z, top - y] },
    sideR: { W: len, H: top, role: 'side', nose: 'right', pair: 'sideL', label: 'Right side', proj: (x, y, z) => [z - zR, top - y] },
    front: { W: half * 2, H: top, role: 'end', label: 'Nose', proj: (x, y, z) => [x + half, top - y] },
    rear:  { W: half * 2, H: top, role: 'end', label: 'Tail', proj: (x, y, z) => [half - x, top - y] },
  };
  const L = { id, T, map, panels, names: Object.keys(panels), parts: T.body.filter(p => p.map === map), maps: {} };
  L.def = {
    id: 'road-' + id, aspect: 1, projected: true, panels, startPanel: 'sideL',
    labels: CARS[id].liveryLabels || {},
    paintProjected: (canvas, cfg, drawPanel) => paintProjected(L, canvas, cfg, drawPanel),
    // designer click-to-place: body uv -> panel + metres
    uvToPanel(u, v) {
      const R = PICK_RES, m = texelMap(L, R), px = Math.min(R - 1, Math.max(0, (u * R) | 0)), py = Math.min(R - 1, Math.max(0, (vRow(L, v) * R) | 0));
      const i = py * R + px, k = m.panel[i];
      return k ? { panel: L.names[k - 1], x: m.X[i], y: m.Y[i] } : null;
    },
    // which panel covers which part of the body texture (for modellers)
    template() {
      const R = PICK_RES, m = texelMap(L, R), c = document.createElement('canvas'); c.width = c.height = R;
      const g = c.getContext('2d'), img = g.createImageData(R, R);
      const cols = [[40, 44, 52], [224, 80, 80], [80, 160, 224], [224, 176, 64], [96, 192, 112], [176, 112, 224]];
      for (let i = 0; i < R * R; i++) { const cc = cols[m.panel[i] % cols.length], a = 0.35 + 0.65 * m.mask[i]; img.data.set([cc[0] * a, cc[1] * a, cc[2] * a, 255], i * 4); }
      g.putImageData(img, 0, 0);
      g.font = 'bold 22px Arial';
      L.names.forEach((n, k) => { const cc = cols[(k + 1) % cols.length]; g.fillStyle = `rgb(${cc})`; g.fillRect(12, 12 + k * 28, 20, 20); g.fillStyle = '#fff'; g.fillText(panels[n].label, 40, 30 + k * 28); });
      return c;
    },
  };
  return L;
}
// texture row of a uv's v (glTF textures aren't flipped: v = 0 is the top row)
const vRow = (L, v) => (L.map.flipY ? 1 - v : v);

// which panel a surface point belongs to
function assignPanel(x, nx, ny, nz) {
  if (ny > 0.55) return 'top';
  if (Math.abs(nz) > 0.6 && Math.abs(nz) > Math.abs(nx)) return nz > 0 ? 'front' : 'rear';
  return (Math.abs(nx) > 0.2 ? nx > 0 : x >= 0) ? 'sideL' : 'sideR';
}

// per-texel map at a resolution: panel index + panel metres, and the photo with its paint mask; built once, cached
function texelMap(L, R) {
  if (L.maps[R]) return L.maps[R];
  const n = R * R, panel = new Uint8Array(n), X = new Float32Array(n), Y = new Float32Array(n);
  const idxOf = Object.fromEntries(L.names.map((nm, k) => [nm, k + 1])), SOLID = L.names.length + 1;
  // faces sharing texels (e.g. a nose face unwrapped onto the bonnet's tip in the top photo): the one the photo sees
  // most squarely keeps them, i.e. the least stretched (3D area per texel)
  const stretch = new Float32Array(n).fill(Infinity);
  const solid = [];
  for (const p of L.parts) {
    const g = p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index;
    const cnt = I ? I.count : P.count;
    for (let t = 0; t < cnt; t += 3) {
      const ids = [0, 1, 2].map(k => I ? I.getX(t + k) : t + k);
      const us = ids.map(i => U.getX(i) * R), vs = ids.map(i => vRow(L, U.getY(i)) * R);
      const [x0, x1, x2] = us, [y0, y1, y2] = vs;
      const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      // collapsed uvs (the face samples one texel or a line of them, e.g. the M1's wing + rear deck): those texels
      // take the main colour
      if (Math.abs(den) < 1e-6) {
        for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]]) {
          const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
          for (let s = 0; s <= steps; s++) solid.push(ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps);
        }
        continue;
      }
      // one panel per triangle (from its face normal), so a decal never splits across a seam inside a face
      const [i0, i1, i2] = ids;
      const nx = N.getX(i0) + N.getX(i1) + N.getX(i2), ny = N.getY(i0) + N.getY(i1) + N.getY(i2), nz = N.getZ(i0) + N.getZ(i1) + N.getZ(i2), nl = Math.hypot(nx, ny, nz) || 1;
      const name = assignPanel((P.getX(i0) + P.getX(i1) + P.getX(i2)) / 3, nx / nl, ny / nl, nz / nl), pn = L.panels[name];
      const minX = Math.max(0, Math.floor(Math.min(...us)) - 1), maxX = Math.min(R - 1, Math.ceil(Math.max(...us)) + 1);
      const minY = Math.max(0, Math.floor(Math.min(...vs)) - 1), maxY = Math.min(R - 1, Math.ceil(Math.max(...vs)) + 1);
      // texels whose centre is inside, plus (if nothing else has them) texels the triangle only touches: slivers
      // thinner than a texel cover no centre at all (the M1's rear deck is a strip along the side photo's top edge)
      const ad = Math.abs(den);
      const e1x = P.getX(i1) - P.getX(i0), e1y = P.getY(i1) - P.getY(i0), e1z = P.getZ(i1) - P.getZ(i0), e2x = P.getX(i2) - P.getX(i0), e2y = P.getY(i2) - P.getY(i0), e2z = P.getZ(i2) - P.getZ(i0);
      const st = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x) / ad;
      const ta = 0.71 * Math.hypot(x1 - x2, y1 - y2) / ad, tb = 0.71 * Math.hypot(x2 - x0, y2 - y0) / ad, tc = 0.71 * Math.hypot(x0 - x1, y0 - y1) / ad;
      for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5, cy = py + 0.5, id = py * R + px;
        const a = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / den, b = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / den, c = 1 - a - b;
        if (a < -0.02 || b < -0.02 || c < -0.02) { if (panel[id] || a < -ta || b < -tb || c < -tc) continue; }
        else if (st > stretch[id]) continue;
        else stretch[id] = st;
        const x = P.getX(i0) * a + P.getX(i1) * b + P.getX(i2) * c, y = P.getY(i0) * a + P.getY(i1) * b + P.getY(i2) * c, z = P.getZ(i0) * a + P.getZ(i1) * b + P.getZ(i2) * c;
        const [sx, sy] = pn.proj(x, y, z);
        panel[id] = idxOf[name]; X[id] = Math.min(pn.W, Math.max(0, sx)); Y[id] = Math.min(pn.H, Math.max(0, sy));
      }
    }
  }
  for (let s = 0; s < solid.length; s += 2) {
    const cx = Math.min(R - 1, solid[s] | 0), cy = Math.min(R - 1, solid[s + 1] | 0);
    for (let py = Math.max(0, cy - 1); py <= Math.min(R - 1, cy + 1); py++) for (let px = Math.max(0, cx - 1); px <= Math.min(R - 1, cx + 1); px++) panel[py * R + px] = SOLID;
  }
  // grow islands by a few texels so filtering never shows seams
  for (let pass = 0; pass < 3; pass++) {
    const src = panel.slice();
    for (let py = 0; py < R; py++) for (let px = 0; px < R; px++) {
      const id = py * R + px; if (src[id]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= R || qy >= R) continue;
        const q = qy * R + qx; if (src[q]) { panel[id] = src[q]; X[id] = X[q]; Y[id] = Y[q]; break; }
      }
    }
  }
  // the photo at this resolution (stretched to the square, the same uv space) + its paint mask
  const c = document.createElement('canvas'); c.width = c.height = R;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(L.map.image, 0, 0, R, R);
  const photo = g.getImageData(0, 0, R, R).data, list = [], kl = [], sl = [];
  let mask = null; if (R === PICK_RES) mask = new Float32Array(n);
  const isl = L.T.paintHue.islands;
  for (let i = 0; i < n; i++) {
    let [kk, s] = whitePaint(photo[i * 4], photo[i * 4 + 1], photo[i * 4 + 2]);
    if (kk > 0 && isl.map[Math.min(isl.h - 1, ((i / R | 0) + 0.5) * isl.h / R | 0) * isl.w + Math.min(isl.w - 1, ((i % R) + 0.5) * isl.w / R | 0)]) kk = 0;
    if (mask) mask[i] = kk;
    if (panel[i] && kk > 0) { list.push(i); kl.push(kk); sl.push(s); }
  }
  // kept per paintable texel only (the full-size tables only at the designer's pick resolution)
  const m = { photo, list: Uint32Array.from(list), k: Float32Array.from(kl), sh: Float32Array.from(sl),
    lp: Uint8Array.from(list, i => panel[i]), lx: Float32Array.from(list, i => X[i]), ly: Float32Array.from(list, i => Y[i]) };
  if (mask) Object.assign(m, { panel, X, Y, mask });
  return (L.maps[R] = m);
}

function paintProjected(L, canvas, cfg, drawPanel) {
  const R = canvas.width, m = texelMap(L, R), ppm = Math.max(40, R / 8);
  // each panel drawn on its own canvas (in metres), then looked up per texel
  const datas = [null];
  for (const name of L.names) {
    const p = L.panels[name], pc = document.createElement('canvas');
    pc.width = Math.max(2, Math.ceil(p.W * ppm)); pc.height = Math.max(2, Math.ceil(p.H * ppm));
    const g = pc.getContext('2d', { willReadFrequently: true });
    g.setTransform(ppm, 0, 0, ppm, 0, 0); g.beginPath(); g.rect(0, 0, p.W, p.H); g.clip();
    drawPanel(g, name, p);
    datas.push({ d: g.getImageData(0, 0, pc.width, pc.height).data, w: pc.width, h: pc.height });
  }
  const mc = (cfg.main ?? 0) >>> 0;
  datas.push({ d: [(mc >> 16) & 255, (mc >> 8) & 255, mc & 255, 255], w: 1, h: 1 }); // texelMap's SOLID
  const ctx = canvas.getContext('2d'), out = ctx.createImageData(R, R), o = out.data;
  o.set(m.photo); // everything that isn't paint stays as photographed
  const { photo, list, k, sh, lp, lx, ly } = m;
  for (let n = 0; n < list.length; n++) {
    const j = list[n] * 4, D = datas[lp[n]];
    const q = (Math.min(D.h - 1, (ly[n] * ppm) | 0) * D.w + Math.min(D.w - 1, (lx[n] * ppm) | 0)) * 4, kk = k[n], s = sh[n];
    o[j] = photo[j] + (D.d[q] * s - photo[j]) * kk; o[j + 1] = photo[j + 1] + (D.d[q + 1] * s - photo[j + 1]) * kk; o[j + 2] = photo[j + 2] + (D.d[q + 2] * s - photo[j + 2]) * kk;
  }
  ctx.putImageData(out, 0, 0);
}

// where the glows go: the middle of each lamp object (split into left / right if it spans the car), just outside its
// rear face (dir -1) or front face (dir 1)
function lampSpots(list, dir) {
  const byObj = {}, v = new THREE.Vector3(), out = [];
  for (const p of list) {
    const o = (byObj[p.obj] ||= { L: new THREE.Box3(), R: new THREE.Box3(), all: new THREE.Box3() });
    const P = p.geo.attributes.position, I = p.geo.index, n = I ? I.count : P.count;
    for (let k = 0; k < n; k++) { v.fromBufferAttribute(P, I ? I.getX(k) : k); o.all.expandByPoint(v); if (v.x > 0.05) o.L.expandByPoint(v); else if (v.x < -0.05) o.R.expandByPoint(v); }
  }
  for (const o of Object.values(byObj)) {
    const wide = o.all.max.x - o.all.min.x > 0.5 && !o.L.isEmpty() && !o.R.isEmpty();
    for (const b of wide ? [o.L, o.R] : [o.all]) {
      const c = b.getCenter(new THREE.Vector3()); c.z = dir > 0 ? b.max.z + 0.03 : b.min.z - 0.03;
      out.push(c);
    }
  }
  return out;
}

// some source meshes have triangles wound inside-out (their normals are right): turn each triangle to agree with
// its normals, so back-face culling hides the right side
// which way does each mesh face? Some models have the winding right and the normals wrong (GT-R), others the normals
// right and the winding inside-out (Mustang, Testarossa). Trust whichever points away from the middle more often.
function orient(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  geo.computeBoundingBox(); const ctr = geo.boundingBox.getCenter(new THREE.Vector3());
  const tri = (t) => geo.index ? [geo.index.getX(t), geo.index.getX(t + 1), geo.index.getX(t + 2)] : [t, t + 1, t + 2];
  const cnt = geo.index ? geo.index.count : P.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), n = new THREE.Vector3();
  let wOut = 0, nOut = 0, T = 0;
  for (let t = 0; t < cnt; t += 3) {
    const [i0, i1, i2] = tri(t);
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    m.copy(a).add(b).add(c).divideScalar(3).sub(ctr);
    b.sub(a); c.sub(a); b.cross(c);
    n.set(N.getX(i0) + N.getX(i1) + N.getX(i2), N.getY(i0) + N.getY(i1) + N.getY(i2), N.getZ(i0) + N.getZ(i1) + N.getZ(i2));
    if (b.dot(m) > 0) wOut++; if (n.dot(m) > 0) nOut++; T++;
  }
  if (nOut >= wOut) return fixWinding(geo);
  // winding is the reliable one: rebuild the normals from it (flat, PS1 style)
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) { for (const k of Object.keys(g.attributes)) geo.setAttribute(k, g.attributes[k]); geo.setIndex(null); }
  geo.computeVertexNormals();
}
function fixWinding(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  if (!geo.index) geo.setIndex([...Array(P.count).keys()]);
  const I = geo.index; let flips = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < I.count; t += 3) {
    const i0 = I.getX(t), i1 = I.getX(t + 1), i2 = I.getX(t + 2);
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1).sub(a); c.fromBufferAttribute(P, i2).sub(a);
    n.set(N.getX(i0) + N.getX(i1) + N.getX(i2), N.getY(i0) + N.getY(i1) + N.getY(i2), N.getZ(i0) + N.getZ(i1) + N.getZ(i2));
    if (b.cross(c).dot(n) < 0) { I.setX(t + 1, i2); I.setX(t + 2, i1); flips++; }
  }
  I.needsUpdate = true;
  return flips;
}
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
// the body texture re-tinted to a colour (cached per colour)
function paintedTexture(T, colour) {
  const key = colour >>> 0;
  if (T.textures[key]) return T.textures[key];
  const P = T.paintHue, src = P.data.data, c = document.createElement('canvas'); c.width = P.canvas.width; c.height = P.canvas.height;
  const g = c.getContext('2d'), out = g.createImageData(c.width, c.height), o = out.data;
  const [th, ts, tl] = hsl((colour >> 16) & 255, (colour >> 8) & 255, colour & 255);
  // lightness of the original paint's mid-tone, so shading is kept relative to it
  const base = 0.45;
  const cr = (colour >> 16) & 255, cg = (colour >> 8) & 255, cb = colour & 255;
  for (let i = 0; i < src.length; i += 4) {
    const [h, s, l] = hsl(src[i], src[i + 1], src[i + 2]);
    if (P.white) {
      // the paint takes the colour, shaded like the photo's white (whitePaint)
      let [k, sh] = whitePaint(src[i], src[i + 1], src[i + 2]);
      if (P.islands.map[i >> 2]) k = 0;
      o[i] = src[i] + (Math.min(255, cr * sh) - src[i]) * k; o[i + 1] = src[i + 1] + (Math.min(255, cg * sh) - src[i + 1]) * k; o[i + 2] = src[i + 2] + (Math.min(255, cb * sh) - src[i + 2]) * k;
      o[i + 3] = src[i + 3];
      continue;
    }
    let dh = Math.abs(h - P.hue); dh = Math.min(dh, 1 - dh);
    if (s > 0.25 && dh < 0.07) {
      const nl = Math.max(0, Math.min(1, tl + (l - base) * (tl < 0.2 || tl > 0.85 ? 0.5 : 0.9)));
      const [r, gg, b] = rgb(th, ts, nl);
      const k = Math.min(1, (0.07 - dh) / 0.02); // soft edge at the hue boundary
      o[i] = src[i] + (r - src[i]) * k; o[i + 1] = src[i + 1] + (gg - src[i + 1]) * k; o[i + 2] = src[i + 2] + (b - src[i + 2]) * k;
    } else { o[i] = src[i]; o[i + 1] = src[i + 1]; o[i + 2] = src[i + 2]; }
    o[i + 3] = src[i + 3];
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = P.flipY; t.wrapS = P.wrapS; t.wrapT = P.wrapT; // same sampling as the original map
  t.magFilter = THREE.NearestFilter;
  return (T.textures[key] = t);
}

const shared = new Map();
// bodywork gets a glossy clear-coat look (like the F1 car's paint); tyres / wheels stay matt
function matFor(p, map, shiny = true, cache = true) {
  const key = (map ? map.uuid : 'none') + p.color + p.double + p.cutoff + p.blend + shiny + (p.emissive ? p.emissive.uuid : '');
  if (cache && shared.has(key)) return shared.get(key);
  // (the colour multiplies the texture, as in glTF: e.g. the Kaze's interior is a white texture tinted black)
  const m = new THREE.MeshPhongMaterial({ map, color: p.color, side: p.double ? THREE.DoubleSide : THREE.FrontSide, transparent: p.blend, alphaTest: p.cutoff,
    specular: shiny ? 0x4a4a4a : 0x111111, shininess: shiny ? 70 : 10 });
  if (p.emissive) { m.emissiveMap = p.emissive; m.emissive = new THREE.Color(0xffffff); }
  if (cache) shared.set(key, m);
  return m;
}

function buildRoadCar(id, cfg, opts = {}) {
  cfg = fillLivery({ ...cfg });
  const T = TPL[id];
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  // a full livery (livery: true cars) is painted into this car's own canvas over the photo (sharper than the AI's)
  let livCanvas = null, livTex = null, later = 0;
  const livMats = new Map();
  if (T.liv) {
    livCanvas = document.createElement('canvas'); livCanvas.width = livCanvas.height = opts.texSize >= 1024 ? 2048 : opts.texSize && opts.texSize < 512 ? 512 : 1024;
    livTex = new THREE.CanvasTexture(livCanvas); livTex.colorSpace = THREE.SRGBColorSpace; livTex.anisotropy = 4;
    livTex.flipY = T.liv.map.flipY; livTex.wrapS = T.liv.map.wrapS; livTex.wrapT = T.liv.map.wrapT;
  }
  const paintLiv = () => {
    const again = () => { if (later) return; later = setTimeout(() => { later = 0; paintLiv(); }, 30); };
    paintCar(livCanvas, cfg, T.liv.def, again); livTex.needsUpdate = true;
  };
  if (T.liv && cfg.paint !== 'stock') paintLiv();
  // each body part's material for the current paint: the livery, the re-tinted texture, or the original
  const skin = (p) => {
    if (!p.map || !T.paintHue || cfg.paint === 'stock') return matFor(p, p.map);
    if (!T.liv) return matFor(p, paintedTexture(T, cfg.main));
    if (p.map !== T.liv.map) return matFor(p, p.map);
    // (not in the shared cache: the texture belongs to this car)
    if (!livMats.has(p)) livMats.set(p, matFor(p, livTex, true, false));
    return livMats.get(p);
  };
  for (const p of T.body) body.add(new THREE.Mesh(p.geo, skin(p)));
  const wheels = [];
  for (const c of ['FL', 'FR', 'RL', 'RR']) {
    const info = T.wheelInfo[c], list = T.wheels[c]; if (!info) continue;
    const pivot = new THREE.Group(); pivot.position.copy(info.ctr); group.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    for (const p of list) spin.add(new THREE.Mesh(p.geo, matFor(p, p.map, false)));
    wheels.push({ pivot, mesh: spin, r: info.r, front: c[0] === 'F', baseY: info.ctr.y, corner: c });
  }
  // (the driver kit isn't placed in the car: closed cockpits. The garage still uses it for the driver figure.)
  const kit = driverKit(cfg, { low: true });
  kit.repaint(cfg, () => {});
  // lamps: the car's own (Light_* objects) or the generic centre rain light
  const own = T.tail.length > 0 || T.head.length > 0;
  const lights = carLights(own ? new THREE.Group() : body, 0, Math.max(0.45, T.bb.min.y + 0.55), T.bb.min.z - 0.01);
  let setLights = () => {};
  if (own) {
    const lampMats = (list) => list.map(p => {
      const m = new THREE.MeshBasicMaterial({ map: p.map, color: p.color, side: p.double ? THREE.DoubleSide : THREE.FrontSide, transparent: p.blend, alphaTest: p.cutoff });
      m.userData.base = new THREE.Color(p.color);
      body.add(new THREE.Mesh(p.geo, m));
      return m;
    });
    const tailMats = lampMats(T.tail), headMats = lampMats(T.head);
    const headCorona = lights.coronaMat.clone(); headCorona.color.set(0xfff2d8); headCorona.opacity = 0;
    const glow = (spots, mat, s) => spots.forEach(c => { const sp = new THREE.Sprite(mat); sp.position.copy(c); sp.scale.set(s, s, 1); body.add(sp); });
    glow(T.tailSpots, lights.coronaMat, 0.42);
    glow(T.headSpots, headCorona, 0.7);
    // (race.js reads the tail anchor's position for the wet-road reflection)
    const anchor = new THREE.Object3D();
    if (T.tailSpots.length) T.tailSpots.forEach(c => anchor.position.add(c)), anchor.position.divideScalar(T.tailSpots.length);
    else anchor.position.set(0, Math.max(0.45, T.bb.min.y + 0.55), T.bb.min.z - 0.03);
    body.add(anchor); lights.tail = anchor;
    const level = (mats, k) => mats.forEach(m => m.color.copy(m.userData.base).multiplyScalar(k));
    // (values above 1 go past white into the bloom)
    setLights = ({ brake = false, night = false, rain = false } = {}) => {
      level(tailMats, brake ? 3.2 : night || rain ? 1.5 : 1);
      level(headMats, night ? 2.6 : rain ? 1.4 : 1);
      headCorona.opacity = night ? 0.8 : rain ? 0.3 : 0;
    };
    setLights();
  }
  const shadow = blobShadow((T.bb.max.x - T.bb.min.x) + 0.7, (T.bb.max.z - T.bb.min.z) + 0.9);
  const dummy = new THREE.Group();
  const model = { group, body, wheels, shadow, lightMat: lights.lightMat, tail: lights.tail, coronaMat: lights.coronaMat, fwing: dummy, rwing: dummy,
    cfg, road: true, livery: livCanvas, livTex, def: T.liv ? T.liv.def : undefined, helmet: kit.helmet, visorMat: kit.visorMat, suitTex: kit.suitTex, limbTex: kit.limbTex, armTex: kit.armTex, helTex: kit.helTex, helCanvas: kit.helCanvas };
  model.setCompound = () => {};
  model.setLights = setLights;
  model.setDamage = (d) => { body.rotation.z = (d.ch || 0) * 0.03 * (model.pull || 1); };
  model.repaint = (L) => {
    if (L && L !== model.cfg) Object.assign(model.cfg, fillLivery(L));
    kit.repaint(model.cfg, () => {});
    if (!T.paintHue) return;
    if (T.liv && cfg.paint !== 'stock') paintLiv();
    body.children.forEach((m, k) => { const p = T.body[k]; if (p && p.map) m.material = skin(p); });
  };
  // road cars are softer: more roll and pitch than the F1 car
  model.animate = ({ steer = 0, spin = 0, pitch = 0, roll = 0, heave = 0, bump = [0, 0, 0, 0] } = {}) => {
    body.rotation.x = pitch * 1.6; body.rotation.z = roll * 1.8; body.position.y = heave;
    wheels.forEach((w, k) => {
      w.mesh.rotation.x += spin / w.r;
      if (w.front) w.pivot.rotation.y = steer;
      w.pivot.position.y = w.baseY + (bump[k] || 0);
    });
  };
  group.updateMatrixWorld(true);
  return model;
}
