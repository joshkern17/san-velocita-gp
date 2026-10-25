// Houses built from their real outlines (FEMA / the map: zones.js marks them b.build), with the PSX house pack's own
// textures (envlib.js houseMats): its wall and roof for the house's look (paintable, like the pack's own houses) and
// its atlas's windows, front doors and garage doors. A model house fitted to an outline was the wrong size and shape
// for most real ones (a 22 m ranch house, an L); this is the real one.
//
//   planHouse(b)                 the outline tidied and squared to the house's own axes, cut into rectangles (an L
//                                is two wings), its storeys, eave and ridge: { ax, wings: [{ x0, z0, x1, z1 }], walls, eave, ridge }
//   buildHouses(root, list, seat, opts)   list: [{ b, look: { w, r, c }, front: [fx, fz] }] -> meshes, merged by material
//
// Each wing gets a gable roof along its long side (a hip roof when it's near square), the main wing at the house's
// real ridge height, the others at the same pitch (so a narrower wing is lower, as real ones are). Walls run round the
// whole outline from just under the ground to the eaves, gable ends above them; windows every ~3.2 m along each wall
// on each storey, the front door on the street side, a garage door at one end of a wide front.
import * as THREE from 'three';
import { houseMats, envAsset } from './envlib.js';

const UV = { window: [0.015, 0.015, 0.485, 0.625], door: [0.01, 0.655, 0.49, 0.985], garage: [0.51, 0.565, 0.99, 0.99] };
const STOREY = 2.8, OVER = 0.45, WALL_TILE = 1.25, ROOF_TILE = 2.2; // (WALL_TILE: one repeat of the siding (5 boards) is 1.25 m: 25 cm boards)

// ---------------- the plan ----------------
function orient(p) { // the long axis of the outline's smallest rectangle
  let best = null;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, ux, uz };
  }
  return best;
}
export function planHouse(b) {
  const P = b.p; if (!P || P.length < 3) return null;
  const o = orient(P); if (!o) return null;
  const { ux, uz } = o, toL = (q) => [q[0] * ux + q[1] * uz, -q[0] * uz + q[1] * ux], toW = (u, v) => [u * ux - v * uz, u * uz + v * ux];
  // in the house's own axes: drop vertices on a near-straight line or jogs under 0.8 m, then square every edge to
  // the axes (most real houses are: the outline traced from a photo isn't quite)
  let L = P.map(toL);
  for (let pass = 0; pass < 3; pass++) {
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[(i - 1 + L.length) % L.length], q = L[i], c = L[(i + 1) % L.length];
      const d1 = Math.hypot(q[0] - a[0], q[1] - a[1]), d2 = Math.hypot(c[0] - q[0], c[1] - q[1]);
      const cross = Math.abs((q[0] - a[0]) * (c[1] - q[1]) - (q[1] - a[1]) * (c[0] - q[0])) / ((d1 * d2) || 1);
      if (d1 < 0.8 || cross < 0.2) continue; out.push(q);
    }
    if (out.length < 3) break; L = out;
  }
  // squared: each edge runs along u or v (whichever it's nearer); a vertex is where its two edges meet
  const n = L.length, horiz = [];
  for (let i = 0; i < n; i++) { const a = L[i], c = L[(i + 1) % n]; horiz.push(Math.abs(c[0] - a[0]) >= Math.abs(c[1] - a[1])); }
  let rect = true; for (let i = 0; i < n; i++) if (horiz[i] === horiz[(i + 1) % n]) rect = false;
  let poly;
  if (rect && n >= 4 && n <= 12) {
    const lineOf = (i) => { const a = L[i], c = L[(i + 1) % n]; return horiz[i] ? (a[1] + c[1]) / 2 : (a[0] + c[0]) / 2; }; // (an edge's v if along u, its u if along v)
    poly = L.map((_, i) => { const prev = (i - 1 + n) % n; return horiz[i] ? [lineOf(prev), lineOf(i)] : [lineOf(i), lineOf(prev)]; });
  } else { // (not squared: its smallest rectangle)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const q of L) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
    poly = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  }
  // rectangles: horizontal slabs between the outline's v's, merged where the u-span carries on
  const vs = [...new Set(poly.map(q => +q[1].toFixed(2)))].sort((a, c) => a - c), slabs = [];
  for (let k = 0; k + 1 < vs.length; k++) {
    const vm = (vs[k] + vs[k + 1]) / 2, xs = [];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], c = poly[(i + 1) % poly.length]; if ((a[1] > vm) !== (c[1] > vm)) xs.push(a[0] + (vm - a[1]) / (c[1] - a[1]) * (c[0] - a[0])); }
    xs.sort((a, c) => a - c);
    for (let j = 0; j + 1 < xs.length; j += 2) slabs.push({ x0: xs[j], x1: xs[j + 1], z0: vs[k], z1: vs[k + 1] });
  }
  const wings = [];
  for (const s of slabs) { const w = wings.find(r => Math.abs(r.x0 - s.x0) < 0.05 && Math.abs(r.x1 - s.x1) < 0.05 && Math.abs(r.z1 - s.z0) < 0.05); if (w) w.z1 = s.z1; else wings.push({ ...s }); }
  if (!wings.length) return null;
  // (slivers: wings under 2.5 m wide go into their neighbour's roof)
  const big = wings.filter(r => Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 2.5); const W = big.length ? big : wings;
  const hReal = Math.max(3.5, b.h || 5.5), storeys = hReal >= 7.6 ? 2 : 1, eave = storeys * STOREY + 0.25;
  const ridge = Math.max(eave + 1.0, hReal);
  return { toW, wings: W, walls: poly, eave, ridge, storeys };
}

// ---------------- the meshes ----------------
function sink() { return { pos: [], uv: [], col: [] }; }
function quad(S, a, b, c, d, uvs, col) { // a b c d counter-clockwise seen from outside
  for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) { S.pos.push(p[0], p[1], p[2]); S.uv.push(t[0], t[1]); S.col.push(...(p[3] || col)); }
}
function tri(S, a, b, c, uvs, col) { for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]]]) { S.pos.push(p[0], p[1], p[2]); S.uv.push(t[0], t[1]); S.col.push(...col); } }
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export function buildHouses(root, list, seat, opts = {}) {
  const groups = new Map(); // material -> sink
  const sinkFor = (m) => { let s = groups.get(m); if (!s) groups.set(m, s = sink()); return s; };
  let built = 0;
  for (const { b, look, front } of list) {
    const plan = planHouse(b); if (!plan) continue;
    const mats = houseMats(look.w, look.r); if (!mats.wall || !mats.roof || !mats.atlas) continue;
    const { toW, wings, walls, eave, ridge, storeys } = plan;
    const y0 = seat(b.p) - 0.35, col = look.c ? new THREE.Color(look.c).toArray() : [1, 1, 1];
    const W = sinkFor(mats.wall), R = sinkFor(mats.roof), X = sinkFor(mats.atlas);
    const P3 = (u, v, y, c) => { const [x, z] = toW(u, v); return [x, y, z, c]; };
    // which side faces the street: the outward normal (in the house's axes) nearest the front direction
    const [fx, fz] = front || [0, 1], fu = fx * toW(1, 0)[0] + fz * toW(1, 0)[1], fv = fx * toW(0, 1)[0] + fz * toW(0, 1)[1];
    // walls, round the squared outline (counter-clockwise: the outline might run either way)
    let area = 0; for (let i = 0; i < walls.length; i++) { const a = walls[i], c = walls[(i + 1) % walls.length]; area += a[0] * c[1] - c[0] * a[1]; }
    const ring = area < 0 ? walls.slice().reverse() : walls;
    let frontEdge = -1, fBest = -Infinity;
    ring.forEach((a, i) => { const c = ring[(i + 1) % ring.length], du = c[0] - a[0], dv = c[1] - a[1], l = Math.hypot(du, dv) || 1, nu = dv / l, nv = -du / l, s = (nu * fu + nv * fv) * Math.min(1, l / 6); if (s > fBest) { fBest = s; frontEdge = i; } });
    ring.forEach((a, i) => {
      const c = ring[(i + 1) % ring.length], du = c[0] - a[0], dv = c[1] - a[1], l = Math.hypot(du, dv); if (l < 0.3) return;
      const nu = dv / l, nv = -du / l, base = shade(col, 0.72), top = col; // (a little darker at the foot: grounded)
      quad(W, P3(a[0], a[1], y0, base), P3(c[0], c[1], y0, base), P3(c[0], c[1], y0 + eave, top), P3(a[0], a[1], y0 + eave, top),
        [[0, eave / WALL_TILE], [l / WALL_TILE, eave / WALL_TILE], [l / WALL_TILE, 0], [0, 0]], col);
      // openings on this wall: windows every ~3.2 m, a storey at a time; on the front, the door (and a garage door at
      // one end of a wide front)
      const isFront = i === frontEdge, slots = Math.max(0, Math.floor((l - 1.4) / 3.2)); if (!slots) return;
      const off = 0.035, at = (t, h0, h1, w) => { const u = a[0] + du * t, v = a[1] + dv * t, hu = du / l * w / 2, hv = dv / l * w / 2;
        return [P3(u - hu + nu * off, v - hv + nv * off, y0 + 0.35 + h0, top), P3(u + hu + nu * off, v + hv + nv * off, y0 + 0.35 + h0, top), P3(u + hu + nu * off, v + hv + nv * off, y0 + 0.35 + h1, top), P3(u - hu + nu * off, v - hv + nv * off, y0 + 0.35 + h1, top)]; };
      const reg = (r) => [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]];
      const garage = isFront && l >= 9.5 && storeys === 1 ? (rngOf(b) < 0.5 ? 0 : slots - 1) : -1;
      const door = isFront ? (garage === 0 ? Math.min(slots - 1, Math.ceil(slots / 2)) : Math.floor((slots - 1) / 2)) : -1;
      for (let k = 0; k < slots; k++) {
        const t = (k + 0.5) / slots;
        if (k === garage) { quad(X, ...at(t, 0, 2.2, 2.8), reg(UV.garage), top); continue; }
        if (k === door) quad(X, ...at(t, 0, 2.1, 1.0), reg(UV.door), top);
        else quad(X, ...at(t, 0.8, 2.15, 1.3), reg(UV.window), top);
        for (let st = 1; st < storeys; st++) quad(X, ...at(t, 0.8 + st * STOREY, 2.15 + st * STOREY, 1.3), reg(UV.window), top);
      }
    });
    // roofs: the biggest wing at the real ridge, the rest at its pitch
    const main = wings.reduce((m, r) => (r.x1 - r.x0) * (r.z1 - r.z0) > (m.x1 - m.x0) * (m.z1 - m.z0) ? r : m, wings[0]);
    const span = (r) => Math.min(r.x1 - r.x0, r.z1 - r.z0), pitch = (ridge - eave) / (span(main) / 2);
    for (const r of wings) {
      const rise = Math.min(ridge - eave, pitch * span(r) / 2), ye = y0 + eave, yr = ye + rise;
      const alongU = r.x1 - r.x0 >= r.z1 - r.z0, lw = Math.max(r.x1 - r.x0, r.z1 - r.z0), sw = span(r);
      const hip = lw / sw < 1.3; // (near square: a hip roof)
      // in the wing's own frame: a along its length, c across; corners with the overhang
      const fr = (a, c, y) => alongU ? P3(a, c, y, col) : P3(c, a, y, col);
      const A0 = (alongU ? r.x0 : r.z0) - OVER, A1 = (alongU ? r.x1 : r.z1) + OVER, C0 = (alongU ? r.z0 : r.x0) - OVER, C1 = (alongU ? r.z1 : r.x1) + OVER, Cm = (C0 + C1) / 2;
      const yo = ye - OVER * rise / (sw / 2); // (the eave line lowered by the overhang at the same slope)
      const inset = hip ? (C1 - C0) / 2 : 0, ra0 = A0 + inset, ra1 = A1 - inset;
      const sl = Math.hypot((C1 - C0) / 2, rise + (ye - yo));
      // the two long slopes (from each eave up to the ridge); seen from above they face +c and -c
      const s1 = [fr(A0, C0, yo), fr(A1, C0, yo), fr(ra1, Cm, yr), fr(ra0, Cm, yr)], s2 = [fr(A1, C1, yo), fr(A0, C1, yo), fr(ra0, Cm, yr), fr(ra1, Cm, yr)];
      const ruv = (L1, L2) => [[0, sl / ROOF_TILE], [L1 / ROOF_TILE, sl / ROOF_TILE], [(L1 + L2) / 2 / ROOF_TILE, 0], [(L1 - L2) / 2 / ROOF_TILE, 0]];
      const flip = alongU ? 1 : -1; // (the frame swap mirrors it: keep the faces outward)
      const put = (S, q, uvs) => flip > 0 ? quad(S, q[0], q[1], q[2], q[3], uvs, col) : quad(S, q[1], q[0], q[3], q[2], [uvs[1], uvs[0], uvs[3], uvs[2]], col);
      put(R, s1, ruv(A1 - A0, ra1 - ra0)); put(R, s2, ruv(A1 - A0, ra1 - ra0));
      if (hip) { // the two end slopes
        const t1 = [fr(A0, C1, yo), fr(A0, C0, yo), fr(ra0, Cm, yr)], t2 = [fr(A1, C0, yo), fr(A1, C1, yo), fr(ra1, Cm, yr)];
        const tuv = [[0, sl / ROOF_TILE], [(C1 - C0) / ROOF_TILE, sl / ROOF_TILE], [(C1 - C0) / 2 / ROOF_TILE, 0]];
        for (const t of [t1, t2]) flip > 0 ? tri(R, t[0], t[1], t[2], tuv, col) : tri(R, t[1], t[0], t[2], [tuv[1], tuv[0], tuv[2]], col);
      } else { // the gable ends: wall triangles up to the ridge
        const g0 = [fr(A0 + OVER, C1 - OVER, ye), fr(A0 + OVER, C0 + OVER, ye), fr(A0 + OVER, Cm, yr)], g1 = [fr(A1 - OVER, C0 + OVER, ye), fr(A1 - OVER, C1 - OVER, ye), fr(A1 - OVER, Cm, yr)];
        const guv = [[0, rise / WALL_TILE], [sw / WALL_TILE, rise / WALL_TILE], [sw / 2 / WALL_TILE, 0]];
        for (const g of [g0, g1]) flip > 0 ? tri(W, g[0], g[1], g[2], guv, col) : tri(W, g[1], g[0], g[2], [guv[1], guv[0], guv[2]], col);
      }
    }
    built++;
  }
  const out = new THREE.Group(); out.name = 'built-houses';
  for (const [m, S] of groups) {
    if (!S.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(S.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(S.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    // (its own copy: our colours (paint, the darker foot) multiplied in, and both sides drawn so a face wound the other
    //  way round still shows)
    let mat = matCache.get(m); if (!mat) { mat = m.clone(); mat.vertexColors = true; mat.side = THREE.DoubleSide; matCache.set(m, mat); }
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = !!opts.shadows; mesh.receiveShadow = true; out.add(mesh);
  }
  root.add(out);
  return { built, meshes: out.children.length };
}
const matCache = new WeakMap();
function rngOf(b) { const q = b.p[0]; return ((Math.sin(q[0] * 12.9898 + q[1] * 78.233) * 43758.5453) % 1 + 1) % 1; }

// ---------------- shops, banks, schools...: the commercial builder ----------------
// A real commercial building from its outline: a flat gravel roof at its real height behind a parapet, walls in
// stucco / brick / split-face block, and on its street side what that kind of place has there: a strip mall's glass
// shop bays with a door every other one and a sign band over them (the shop's name from the map when it has one), a
// supermarket's sliding-door entrance under its big sign, an auto shop's roll-up service doors, a bank / post office /
// school / civic building's windows all round. list: [{ b, kind, front: [fx, fz], name }]. Textures: assets/textures/shop_*
// (tools/props/shoptextures.py).
// (regions of shop_front.png from its top left; these textures load the right way up (flipY), v counting up from
//  the bottom, so a region's v is 1 - its y: SHOP_UV is [u0, v at its top, u1, v at its bottom], as reg() wants)
const flipV = (r) => [r[0], 1 - r[1], r[2], 1 - r[3]];
const SHOP_UV = { bay: flipV([0, 0, 0.5, 0.5]), door: flipV([0.5, 0, 1, 0.5]), rollup: flipV([0, 0.5, 0.5, 1]), entrance: flipV([0.5, 0.5, 1, 1]) };
const SIGN_COLS = ['#a8241c', '#1c4f8a', '#2a6a3a', '#7a2a6a', '#c07018', '#1e1e1e', '#6a4a2a', '#18707a'];
const shopTex = {};
function shopMat(name) {
  if (typeof document === 'undefined') return null; // (node: no images)
  let m = shopTex[name]; if (m) return m;
  const t = new THREE.TextureLoader().load(((typeof window !== 'undefined' && window.__SVGP_TEXTURES) || {})[name] || `assets/textures/${name}.png`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  // (a little of its own texture as light: a wall in shade keeps its stucco and brick instead of going flat dark grey,
  //  the sky lighting it as it does a real one)
  return (shopTex[name] = new THREE.MeshLambertMaterial({ map: t, vertexColors: true, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.24 }));
}
// the signs: one canvas, a row each (the shop's name, or none: a plain fascia), its colour from the name
function signSheet(names) {
  const rows = Math.max(1, names.length), H = 64, cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.min(4096, rows * H);
  const g = cv.getContext('2d');
  names.forEach((n, i) => {
    let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) | 0;
    g.fillStyle = SIGN_COLS[Math.abs(h) % SIGN_COLS.length]; g.fillRect(0, i * H, 512, H);
    g.fillStyle = '#f4efe2'; g.fillRect(0, i * H, 512, 3); g.fillRect(0, i * H + H - 3, 512, 3);
    g.font = 'bold 40px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = n.toUpperCase(); let s = 1; const w = g.measureText(txt).width; if (w > 480) s = 480 / w;
    g.save(); g.translate(256, i * H + H / 2 + 2); g.scale(s, 1); g.fillText(txt, 0, 0); g.restore();
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return { mat: new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }), rows, row: (i) => flipV([0, (i * H + 2) / cv.height, 1, ((i + 1) * H - 2) / cv.height]) }; // (the canvas loads flipped too)
}
const WALL_OF = { strip: ['shop_stucco', 'shop_stucco', 'shop_brick'], supermarket: ['shop_block'], bank: ['shop_brick', 'shop_stucco'], postoffice: ['shop_brick'], autoshop: ['shop_block', 'shop_stucco'], school: ['shop_brick', 'shop_stucco'], civic: ['shop_brick', 'shop_stucco'] };
// opts.mats(name) / opts.sheet: what the materials and the sign sheet are (a preview outside the game, .devtest/shoppreview.mjs,
// passes names, and gets the geometry back in .groups)
export function buildShops(root, list, seat, opts = {}) {
  if ((typeof document === 'undefined' && !opts.mats) || !list.length) return { built: 0 };
  const matOf = opts.mats || shopMat;
  if (!opts.mats) for (const n of ['shop_front', 'shop_roof', 'shop_stucco', 'shop_brick', 'shop_block']) { const m = shopMat(n); if (m) m.emissiveIntensity = opts.night ? 0.05 : 0.24; }
  const named = [...new Set(list.flatMap(e => [e.name, ...(e.names || [])]).filter(Boolean))], sheet = opts.sheet ? opts.sheet(named) : signSheet(named.length ? named : ['']);
  const groups = new Map(), sinkFor = (m) => { let s = groups.get(m); if (!s) groups.set(m, s = sink()); return s; };
  const front = matOf('shop_front'), roofM = matOf('shop_roof'), SIGN = sinkFor(sheet.mat), F = sinkFor(front), RF = sinkFor(roofM);
  const reg = (r) => [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]];
  let built = 0;
  for (const entry of list) {
    const { b, kind, front: fdir, name } = entry;
    const plan = planHouse(b); if (!plan) continue;
    const { toW, wings, walls } = plan, rng = rngOf(b), choices = WALL_OF[kind] || WALL_OF.strip;
    const kitB = !!(opts.envPl && envAsset('sm_unit_a') && KIT_KINDS.has(kind)), tintHex = kitB ? TINTS[Math.floor(rng * 7919) % TINTS.length] : null;
    const W = sinkFor(matOf(kitB ? 'shop_stucco' : choices[Math.floor(rng * 997) % choices.length])), col = tintHex ? new THREE.Color(tintHex).toArray().map(v => Math.min(1, v * 1.25)) : [1, 1, 1];
    const H = Math.max(3.8, Math.min(14, b.h || 5)), PAR = 0.7, y0 = seat(b.p) - 0.35; let Hk = H;
    const P3 = (u, v, y, c) => { const [x, z] = toW(u, v); return [x, y, z, c]; };
    const [fx, fz] = fdir || [0, 1], fu = fx * toW(1, 0)[0] + fz * toW(1, 0)[1], fv = fx * toW(0, 1)[0] + fz * toW(0, 1)[1];
    let area = 0; for (let i = 0; i < walls.length; i++) { const a = walls[i], c = walls[(i + 1) % walls.length]; area += a[0] * c[1] - c[0] * a[1]; }
    const ring = area < 0 ? walls.slice().reverse() : walls;
    const score = ring.map((a, i) => { const c = ring[(i + 1) % ring.length], du = c[0] - a[0], dv = c[1] - a[1], l = Math.hypot(du, dv) || 1; return (dv / l * fu - du / l * fv) * Math.min(1, l / 8); });
    const best = Math.max(...score), fronts = new Set(score.map((s, i) => s >= best * 0.7 && s > 0.15 ? i : -1).filter(i => i >= 0));
    const signRow = name ? named.indexOf(name) : -1;
    // the shop kit's modelled pieces along the street side (strip malls, supermarkets, gas stations, churches): the
    // builder draws only the rest of the building round them
    let skip = new Set();
    if (opts.envPl && envAsset('sm_unit_a') && KIT_KINDS.has(kind)) {
      const r = layoutKit({ b, kind, entry, ring, fronts, toW, y0: y0 + 0.35, H, rng, envPl: opts.envPl, wings, tint: tintHex, clear: opts.clear,
        sign: (rect, nm) => { const row = nm ? named.indexOf(nm) : -1; if (row < 0) return; quadWorld(SIGN, rect, sheet.row(row)); } });
      if (r.whole) { built++; continue; }
      skip = r.edges; if (r.H) Hk = r.H;
    }
    const top = y0 + 0.35 + Hk;
    ring.forEach((a, i) => {
      if (skip.has(i)) return; // (the kit's pieces make this wall)
      const c = ring[(i + 1) % ring.length], du = c[0] - a[0], dv = c[1] - a[1], l = Math.hypot(du, dv); if (l < 0.3) return;
      const nu = dv / l, nv = -du / l, base = shade(col, 0.75);
      quad(W, P3(a[0], a[1], y0, base), P3(c[0], c[1], y0, base), P3(c[0], c[1], top + PAR, col), P3(a[0], a[1], top + PAR, col), [[0, (Hk + PAR + 0.35) / 2], [l / 2, (Hk + PAR + 0.35) / 2], [l / 2, 0], [0, 0]], col);
      // (the parapet's cap and its inner face)
      const iu = -nu * 0.25, iv = -nv * 0.25;
      quad(W, P3(a[0], a[1], top + PAR, col), P3(c[0], c[1], top + PAR, col), P3(c[0] + iu, c[1] + iv, top + PAR, col), P3(a[0] + iu, a[1] + iv, top + PAR, col), [[0, 0.1], [l / 2, 0.1], [l / 2, 0], [0, 0]], col);
      quad(W, P3(a[0] + iu, a[1] + iv, top, base), P3(c[0] + iu, c[1] + iv, top, base), P3(c[0] + iu, c[1] + iv, top + PAR, col), P3(a[0] + iu, a[1] + iv, top + PAR, col), [[0, PAR / 2], [l / 2, PAR / 2], [l / 2, 0], [0, 0]], col);
      // what's on this wall
      const off = 0.04, at = (t, h0, h1, w, S = F, r = SHOP_UV.bay) => { const u = a[0] + du * t, v = a[1] + dv * t, hu = -du / l * w / 2, hv = -dv / l * w / 2; // (from outside the ring runs right to left: a sign's start is at its far end)
        quad(S, P3(u - hu + nu * off, v - hv + nv * off, y0 + 0.35 + h0, col), P3(u + hu + nu * off, v + hv + nv * off, y0 + 0.35 + h0, col), P3(u + hu + nu * off, v + hv + nv * off, y0 + 0.35 + h1, col), P3(u - hu + nu * off, v - hv + nv * off, y0 + 0.35 + h1, col), reg(r), col); };
      const isFront = fronts.has(i);
      if (isFront && kind === 'supermarket') {
        const n = Math.max(1, Math.floor((l - 2) / 4.5)), mid = Math.floor(n / 2);
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; if (k === mid) at(t, 0, 3.6, 6, F, SHOP_UV.entrance); else at(t, 0.3, 3.0, 4.2, F, SHOP_UV.bay); }
        if (H >= 4.6) at(0.5, Math.min(H - 1.6, 4.0), Math.min(H - 0.2, 5.6), Math.min(l * 0.5, 14), SIGN, signRow >= 0 ? sheet.row(signRow) : flipV([0, 0.3, 0.02, 0.32]));
      } else if (isFront && kind === 'autoshop') {
        const n = Math.max(1, Math.floor((l - 1) / 4.6));
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; if (k === n - 1 && n > 1) at(t, 0, 3.0, 3.6, F, SHOP_UV.door); else at(t, 0, Math.min(H - 0.5, 3.8), 3.6, F, SHOP_UV.rollup); }
        if (signRow >= 0 && H >= 4.2) at(0.5, H - 1.1, H - 0.2, Math.min(l * 0.6, 10), SIGN, sheet.row(signRow));
      } else if (isFront && (kind === 'strip' || kind === 'bank' || kind === 'postoffice')) {
        const n = Math.max(1, Math.floor((l - 0.6) / 4.2));
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; at(t, 0, 3.2, 4.0, F, k % 2 === (n > 1 ? 1 : 0) ? SHOP_UV.door : SHOP_UV.bay); }
        if (H >= 4.2) at(0.5, 3.45, Math.min(H - 0.05, 4.35), l - 0.6, SIGN, signRow >= 0 ? sheet.row(signRow) : flipV([0, 0.3, 0.02, 0.32]));
      } else if (kind === 'school' || kind === 'civic' || kind === 'bank' || kind === 'postoffice' || (isFront && kind !== 'supermarket')) {
        const n = Math.floor((l - 1) / 3.4);
        for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; if (isFront && k === Math.floor(n / 2)) at(t, 0, 2.6, 2.4, F, SHOP_UV.door); else at(t, 0.9, 2.5, 2.4, F, SHOP_UV.bay); }
        if (isFront && signRow >= 0 && H >= 4) at(0.5, Math.min(H - 1.2, 3.0), Math.min(H - 0.3, 3.8), Math.min(l * 0.6, 12), SIGN, sheet.row(signRow));
      }
    });
    // the roof: each wing's rectangle, flat at the top of the walls
    for (const r of wings) quad(RF, P3(r.x0, r.z0, top, col), P3(r.x1, r.z0, top, col), P3(r.x1, r.z1, top, col), P3(r.x0, r.z1, top, col), [[r.x0 / 2, r.z0 / 2], [r.x1 / 2, r.z0 / 2], [r.x1 / 2, r.z1 / 2], [r.x0 / 2, r.z1 / 2]], col);
    built++;
  }
  if (opts.mats) return { built, groups };
  const out = new THREE.Group(); out.name = 'built-shops';
  for (const [m, S] of groups) {
    if (!S.pos.length || !m) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(S.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(S.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = !!opts.shadows; mesh.receiveShadow = true; out.add(mesh);
  }
  root.add(out);
  return { built };
}

// ---------------- the shop kit's pieces along a real building (tools/props/shopkit.py) ----------------
const KIT_KINDS = new Set(['strip', 'supermarket', 'church']);
// stucco colours, one a building (the kit's stucco takes it: envlib.js tint)
const TINTS = ['#c2ad8c', '#dccca8', '#b39a80', '#ccb89c', '#a8a898', '#d6bc92', '#e6e0d0', '#c9a98a', '#b8b2a0'];
// a sign quad in the world: rect = { c: [x, y, z], R: [rx, rz] (the viewer's right), w, h }, uv: [u0, v top, u1, v bottom]
function quadWorld(S, rect, r) {
  const [cx, cy, cz] = rect.c, [rx, rz] = rect.R, hw = rect.w / 2, hh = rect.h / 2, col = [1, 1, 1];
  const P = (s, t) => [cx + rx * s * hw, cy + t * hh, cz + rz * s * hw];
  quad(S, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]], col);
}
// Lays the kit along a building's street side(s). Returns { edges: the walls it made (the builder skips them), H: the
// height the builder's shell should top out at (the pieces' own), whole: the kit made all of it (a church) }.
function layoutKit({ b, kind, entry, ring, fronts, toW, y0, H, rng, envPl, wings, tint, sign, clear }) {
  let k = 0; const R = () => { k++; return ((Math.sin((rng * 1000 + k) * 12.9898) * 43758.5453) % 1 + 1) % 1; };
  // (what stands out in front of the walls, never inside the circuit's barriers: opts.clear(x, z, r) says where it may go)
  const OUT = /^(sm_shrubs|sm_icebox|sm_bikerack|sm_bench|sm_trash|sm_planter|sm_newsbox|sp_carts|gs_)/;
  const put = (id, x, z, rot, extra = {}) => { const a = envAsset(id); if (!a || (clear && OUT.test(id) && !clear(x, z, Math.max(a.w, a.d) / 2))) return false; envPl.push({ id, x, y: y0, z, rot, ...extra }); return true; };
  const edges = new Set();
  // one front edge, as world vectors: A (start), E (along), N (out), its length
  const edgeW = (i) => { const a = ring[i], c = ring[(i + 1) % ring.length], du = c[0] - a[0], dv = c[1] - a[1], l = Math.hypot(du, dv);
    const A = toW(a[0], a[1]), E = toW(du / l, dv / l), N = toW(dv / l, -du / l); return { A, E, N, l }; };
  const signAt = (p, a, rot, sx, sy, nm) => { if (!a.sign || !nm) return; const [x, y, z, w, h] = a.sign, X = [Math.cos(rot), -Math.sin(rot)], F = [Math.sin(rot), Math.cos(rot)];
    sign({ c: [p.x + X[0] * x * sx + F[0] * (z + 0.03), y0 + y * sy, p.z + X[1] * x * sx + F[1] * (z + 0.03)], R: [F[1], -F[0]], w: w * sx, h: h * sy }, nm); };
  const names = [...new Set([entry.name, ...(entry.names || [])].filter(Boolean))];
  // ---- a church: the model fitted to the footprint, its porch to the street
  if (kind === 'church') {
    const fi = [...fronts][0] ?? 0, { N } = edgeW(fi), a = envAsset('ch_church'); if (!a) return { edges };
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const q of ring) { u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); v0 = Math.min(v0, q[1]); v1 = Math.max(v1, q[1]); }
    const rot = Math.atan2(N[0], N[1]), X = [Math.cos(rot), -Math.sin(rot)], F = [N[0], N[1]];
    // (its width across the street side, its length back from it)
    const along = Math.abs(N[0] * toW(1, 0)[0] + N[1] * toW(1, 0)[1]) < 0.5, wid = along ? u1 - u0 : v1 - v0, len = along ? v1 - v0 : u1 - u0;
    const bw = a.box[3] - a.box[0], bl = a.box[5] - a.box[2], sx = Math.max(0.6, Math.min(1.6, wid / bw)), sz = Math.max(0.6, Math.min(1.6, len / bl)), sy = Math.max(0.8, Math.min(1.3, Math.sqrt(sx * sz)));
    const [cu, cv] = [(u0 + u1) / 2, (v0 + v1) / 2], C = toW(cu, cv), oz = (a.box[2] + a.box[5]) / 2 * sz;
    const p = { x: C[0] - F[0] * oz, z: C[1] - F[1] * oz };
    put('ch_church', p.x, p.z, rot, { sx, sy, sz, tint: '#f0ece2' });
    signAt(p, a, rot, sx, sy, names[0]);
    for (const s of [-1, 1]) put('sm_shrubs', p.x + F[0] * (a.box[5] * sz + 1) + X[0] * s * 3.5, p.z + F[1] * (a.box[5] * sz + 1) + X[1] * s * 3.5, rot);
    return { edges, whole: true };
  }
  // ---- strip malls and supermarkets: pieces end to end along each front wall
  const isSuper = kind === 'supermarket', fuel = entry.place === 'fuel';
  const sy = isSuper ? Math.max(0.8, Math.min(1.35, (H + 0.4) / 7.8)) : Math.max(0.8, Math.min(1.4, (H + 0.7) / 5.52));
  const Hs = isSuper ? 7.8 * sy - 0.4 : 5.52 * sy - 0.7;
  let ni = 0; const nextName = () => names[ni++];
  const UNITS = ['sm_unit_a', 'sm_unit_a', 'sm_unit_awn_red', 'sm_unit_awn_green', 'sm_unit_awn_blue', 'sm_unit_awn_tan', 'sm_unit_c', 'sm_unit_peak', 'sm_unit_tower'];
  const UNDER = ['sm_unit_a', 'sm_unit_a', 'sm_unit_peak', 'sm_unit_tower']; // (under a walkway: no awning, no tile)
  let mainEdge = null;
  for (const i of fronts) {
    const { A, E, N, l } = edgeW(i); if (l < 5) continue;
    edges.add(i); if (!mainEdge || l > mainEdge.l) mainEdge = { A, E, N, l };
    const rot = Math.atan2(N[0], N[1]), X = [Math.cos(rot), -Math.sin(rot)], flip = X[0] * E[0] + X[1] * E[1] < 0 ? -1 : 1;
    const at = (d) => [A[0] + E[0] * d, A[1] + E[1] * d];
    const pieces = []; // [id, start, length (m along the wall), its own length]
    if (isSuper) {
      const m = Math.max(0, Math.floor((l - 16) / 8)), left = Math.floor(m / 2), right = m - left, s = m ? (l - 16) / (m * 8) : 1, es = m ? 1 : l / 16;
      let d = 0;
      for (let q = 0; q < left; q++) { pieces.push([q === left - 1 ? 'sp_bay_glass' : 'sp_bay', d, 8 * s, 8]); d += 8 * s; }
      pieces.push(['sp_entry', d, 16 * es, 16]); d += 16 * es;
      for (let q = 0; q < right; q++) { pieces.push([q === 0 ? 'sp_bay_glass' : 'sp_bay', d, 8 * s, 8]); d += 8 * s; }
    } else {
      const n = Math.max(1, Math.round(l / 6)), seg = l / n;
      const towers = n >= 5 && R() < 0.6, walk = n >= 4 && R() < 0.55;
      for (let q = 0; q < n; q++) {
        const end = q === 0 || q === n - 1, under = walk && q > 0 && q < n - 1 && !(towers && end);
        const id = towers && end ? 'sm_endtower' : (under ? UNDER : UNITS)[Math.floor(R() * (under ? UNDER : UNITS).length)];
        pieces.push([id, q * seg, seg, 6, under]);
      }
    }
    for (const [id, d0, len, own, under] of pieces) {
      const a = envAsset(id); if (!a) continue;
      const sx = len / own, [x, z] = at(d0 + len / 2), p = { x, z };
      put(id, x, z, rot, { sx, sy, sz: 1, tint });
      if (id === 'sp_entry') signAt(p, a, rot, sx, sy, entry.name || names[0]);
      else if (id !== 'sm_endtower' && !/^sp_bay/.test(id)) signAt(p, a, rot, sx, sy, nextName());
      if (under) { put('sm_walkway', x, z, rot, { sx, sy: Math.min(sy, 1.15), sz: 1, tint });
        // (life on the walk: a bench, a bin, a planter, newspaper boxes, now and then)
        const r = R(); if (r < 0.7) put(r < 0.25 ? 'sm_bench' : r < 0.4 ? 'sm_trash' : r < 0.55 ? 'sm_planter' : 'sm_newsbox', x + N[0] * 2.2 + E[0] * (R() - 0.5) * 2, z + N[1] * 2.2 + E[1] * (R() - 0.5) * 2, rot + (r < 0.25 ? 0 : R() * 0.4)); }
    }
    // shrub beds off the two front corners, the odd hedge along the frontage
    for (const d of [-2.5, l + 2.5]) { const [x, z] = at(d); put('sm_shrubs', x + N[0] * 1.6, z + N[1] * 1.6, rot); }
    if (!isSuper && !fuel && R() < 0.4) put('sm_icebox', ...at(0.9).map((v, j) => v + N[j] * 1.0), rot);
    if (!isSuper && R() < 0.35) put('sm_bikerack', ...at(l * 0.5).map((v, j) => v + N[j] * 3.6), rot);
    if (isSuper) for (const s of [-1, 1]) { const [x, z] = at(l / 2 + s * 14); put('sp_carts', x + N[0] * 14, z + N[1] * 14, rot + Math.PI / 2); }
  }
  // the roof's units: one per ~350 m², a vent or two
  for (const r of wings) {
    const ar = (r.x1 - r.x0) * (r.z1 - r.z0), n = Math.min(8, Math.floor(ar / 350));
    for (let q = 0; q < n; q++) { const u = r.x0 + 2 + R() * Math.max(0.1, r.x1 - r.x0 - 4), v = r.z0 + 2 + R() * Math.max(0.1, r.z1 - r.z0 - 4), [x, z] = toW(u, v);
      envPl.push({ id: q % 3 === 2 ? 'rt_vent' : 'rt_hvac', x, y: y0 + Hs, z, rot: R() * 0.3 + (R() < 0.5 ? 0 : Math.PI / 2) }); }
  }
  // a gas station: the canopy over its pumps out in front of the store, the price sign by the road, air
  if (fuel && mainEdge) {
    const { A, E, N, l } = mainEdge, rot = Math.atan2(N[0], N[1]), mx = A[0] + E[0] * l / 2, mz = A[1] + E[1] * l / 2, cz = 11;
    const cp = { x: mx + N[0] * cz, z: mz + N[1] * cz }, ca = envAsset('gs_canopy');
    if (put('gs_canopy', cp.x, cp.z, rot, { tint }) && ca) signAt(cp, ca, rot, 1, 1, entry.name || names[0]);
    const tg = entry.tg; const ps = tg ? { x: tg[0] - N[0] * 5 + E[0] * 8, z: tg[1] - N[1] * 5 + E[1] * 8 } : { x: mx + N[0] * 24 + E[0] * (l / 2 + 4), z: mz + N[1] * 24 + E[1] * (l / 2 + 4) };
    const pa = envAsset('gs_price'); if (put('gs_price', ps.x, ps.z, rot) && pa) signAt(ps, pa, rot, 1, 1, entry.name || names[0]);
    put('gs_air', mx + E[0] * (l / 2 + 2.5) + N[0] * 3, mz + E[1] * (l / 2 + 2.5) + N[1] * 3, rot);
  }
  return { edges, H: Hs };
}
