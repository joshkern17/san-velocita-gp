// Real-world circuits: the things that make a place recognisable, built from the map data baked into the track
// (tools/tracks): the sea at sea level, lakes / harbours / rivers, covered tunnel sections, Ferris wheels.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

let waterTex = null;
function waterMap() {
  if (waterTex) return waterTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2c6a86'; g.fillRect(0, 0, 256, 256);
  // soft ripples: short light / dark strokes, tileable
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 900; k++) {
    const x = rnd() * 256, y = rnd() * 256, l = 4 + rnd() * 14, a = 0.05 + rnd() * 0.12;
    g.strokeStyle = rnd() < 0.5 ? `rgba(200,235,255,${a})` : `rgba(10,40,60,${a})`; g.lineWidth = 1 + rnd() * 1.5;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + l + ox, y + oy + (rnd() - 0.5) * 2); g.stroke(); }
  }
  waterTex = new THREE.CanvasTexture(c);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.colorSpace = THREE.SRGBColorSpace;
  return waterTex;
}
const waterMat = (night) => {
  const t = waterMap().clone(); t.needsUpdate = true; t.repeat.set(1 / 24, 1 / 24);
  return new THREE.MeshStandardMaterial({ map: t, color: night ? 0x3a4a5a : 0xffffff, roughness: 0.18, metalness: 0.25, transparent: true, opacity: 0.94, depthWrite: true });
};
// world-space UVs so the ripples have the same scale everywhere
function planarUV(geo) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// height in game metres of a real altitude (m above sea level), for a track with real terrain
export function altitudeY(track, asl) {
  const t = track.terrain; if (!t) return null;
  return (asl - t.lo - (t.base || 0)) * (t.exag || 1);
}

export function addRealWorld(root, track, T, { groundHeight, night = false } = {}) {
  const o = track.osm || {}, real = track.real || {};
  const out = new THREE.Group(); out.name = 'realworld';
  const anim = [];

  // ---- the sea: one plane at sea level (the elevation data goes below zero offshore) ----
  if (real.sea && track.terrain) {
    const y = altitudeY(track, 0.4);
    let cx = 0, cz = 0; for (let i = 0; i < T.N; i++) { cx += T.X[i]; cz += T.Z[i]; } cx /= T.N; cz /= T.N;
    const g = new THREE.PlaneGeometry(16000, 16000, 1, 1); g.rotateX(-Math.PI / 2); g.translate(cx, y, cz); planarUV(g);
    const m = new THREE.Mesh(g, waterMat(night)); m.receiveShadow = true; out.add(m); anim.push(m.material.map);
  }

  // ---- lakes / harbours / rivers: flat polygons at the level of their shoreline ----
  for (const w of o.water || []) {
    if (!w.p || w.p.length < 3) continue;
    const hs = w.p.map(q => groundHeight(q[0], q[1])).sort((a, b) => a - b);
    const y = (w.y != null ? w.y : hs[Math.floor(hs.length * 0.2)]) + 0.12;
    const contour = w.p.map(q => new THREE.Vector2(q[0], q[1]));
    const holes = (w.h || []).map(h => h.map(q => new THREE.Vector2(q[0], q[1])));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { continue; }
    const all = [...contour, ...holes.flat()], pos = new Float32Array(all.length * 3);
    all.forEach((v, i) => { pos[i * 3] = v.x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = v.y; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // (triangulateShape winds them for a y-up shape; seen from above in x/z they face down, so flip)
    g.setIndex(tris.flatMap(t => [t[0], t[2], t[1]])); g.computeVertexNormals(); planarUV(g);
    const m = new THREE.Mesh(g, waterMat(night)); m.receiveShadow = true; out.add(m); anim.push(m.material.map);
  }

  // ---- tunnels: walls + a lit roof over the covered parts of the lap ----
  for (const tun of real.tunnels || []) buildTunnel(out, T, tun, night);

  // ---- Ferris wheels ----
  for (const f of o.wheels || []) {
    const wheel = buildWheel(f.d || 50, night);
    let gy = groundHeight(f.x, f.z);
    wheel.position.set(f.x, gy - 0.2, f.z); wheel.rotation.y = f.rot || 0;
    out.add(wheel); anim.push(wheel.userData.spin);
  }

  root.add(out);
  if (track.refModel) loadRefModel(root, track.refModel);
  // ripples drift; wheels turn
  return {
    update(t) {
      for (const a of anim) {
        if (a && a.isTexture) a.offset.set(t * 0.004, t * 0.0025);
        else if (a && a.isObject3D) a.rotation.z = t * 0.03;
      }
    },
  };
}

// (dev) a reference model of the circuit (tools/tracks/build.mjs --ref) in place of the game's own scenery: placed
// by its alignment (game x, z = R (x, z) + t; y = (y + dy) * exag), and once it's in, everything else the world drew
// is hidden but the sky (the physics, the cars and the lights carry on as they are). Never in a release: the models
// are reference only.
function loadRefModel(root, M) {
  new GLTFLoader().loadAsync(M.url).then((g) => {
    const [[a, b], [c, d]] = M.R, e = M.exag || 1;
    const wrap = new THREE.Group(); wrap.name = 'refModel'; wrap.matrixAutoUpdate = false;
    wrap.matrix.set(a, 0, b, M.t[0], 0, e, 0, M.dy * e, c, 0, d, M.t[1], 0, 0, 0, 1);
    wrap.add(g.scene);
    root.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      if (o.renderOrder === -10 || (o.material && o.material.side === THREE.BackSide && o.material.isShaderMaterial)) return; // (the sky)
      o.visible = false;
    });
    // (see-through pieces: trees, bushes and fences as cut-outs, so they write depth like anything solid and are
    // drawn in order (blended, the sky showed through them); the rubber laid on the road stays blended, a hair above
    // the tarmac; glass stays glass)
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true; o.castShadow = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const name = m.name || '';
        // (matte: gravel, tarmac and the like came glossy, and caught the sky like wet glass; metal and glass as they are)
        if (!/glass|metal|grail|beam|LED/i.test(name) && m.roughness !== undefined) { m.roughness = Math.max(m.roughness, 0.85); m.metalness = 0; }
        if (!m.transparent && !(m.alphaTest > 0)) continue;
        if (/glass/i.test(name)) continue;
        if (/groove|patch_joint/i.test(name)) { m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; continue; }
        m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.needsUpdate = true;
      }
    });
    root.add(wrap); wrap.updateMatrixWorld(true);
    console.log('reference model in:', M.url);
  }).catch((err) => console.warn('reference model not loaded:', M.url, err && err.message));
}

function buildTunnel(group, T, tun, night) {
  const N = T.N, i0 = Math.max(0, Math.round(tun.from / T.ds) - Math.round(6 / T.ds)), i1 = Math.min(N - 1, Math.round(tun.to / T.ds) + Math.round(6 / T.ds));
  const step = Math.max(1, Math.round(2 / T.ds)), H = 6.2, pos = [], idx = [];
  const ring = (i) => {
    const hw = T.W[i] / 2 + 1.6, x = T.X[i], z = T.Z[i], y = T.Y[i], rx = T.RX[i], rz = T.RZ[i];
    // left foot, left top, right top, right foot (+ the outside of the roof slab)
    return [[x - rx * hw, y - 0.5, z - rz * hw], [x - rx * hw, y + H, z - rz * hw], [x + rx * hw, y + H, z + rz * hw], [x + rx * hw, y - 0.5, z + rz * hw],
      [x - rx * (hw + 0.8), y + H + 1.2, z - rz * (hw + 0.8)], [x + rx * (hw + 0.8), y + H + 1.2, z + rz * (hw + 0.8)]];
  };
  const rings = [];
  for (let i = i0; i <= i1; i += step) rings.push(ring(i));
  if (rings.length < 2) return;
  rings.forEach(r => r.forEach(p => pos.push(...p)));
  const V = 6;
  for (let k = 0; k < rings.length - 1; k++) {
    const a = k * V, b = (k + 1) * V;
    const quad = (p, q, r, s) => idx.push(a + p, b + p, b + q, a + p, b + q, a + q);
    quad(0, 1); quad(1, 2); quad(2, 3); // inside: left wall, ceiling, right wall
    quad(4, 1); quad(5, 4); quad(2, 5); // outside: roof slab
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: night ? 0x6a6a68 : 0x9a968e, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; group.add(m);
  // strip lights down the middle of the ceiling (they glow: the tunnel is dark even at noon)
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), lg = new THREE.BoxGeometry(0.5, 0.12, 2.4);
  const every = Math.max(1, Math.round(9 / T.ds));
  const lamps = new THREE.InstancedMesh(lg, lamp, Math.ceil((i1 - i0 + 1) / every) * 2);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let i = i0 + every; i < i1 - every / 2; i += every) {
    Q.setFromAxisAngle(up, Math.atan2(T.RZ[i], -T.RX[i]) - Math.PI / 2);
    for (const s of [-1, 1]) {
      const off = T.W[i] * 0.22 * s;
      M.compose(new THREE.Vector3(T.X[i] + T.RX[i] * off, T.Y[i] + H - 0.08, T.Z[i] + T.RZ[i] * off), Q, new THREE.Vector3(1, 1, 1));
      lamps.setMatrixAt(n++, M);
    }
  }
  lamps.count = n; group.add(lamps);
}

function buildWheel(D, night) {
  const G = new THREE.Group(), R = D / 2, hubY = R + 4;
  const steel = new THREE.MeshLambertMaterial({ color: 0xe8ecf0 });
  const spin = new THREE.Group(); spin.position.y = hubY; G.add(spin);
  for (const zz of [-1.6, 1.6]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 6, 64), steel); rim.position.z = zz; spin.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, 0.25, 5, 56), steel); inner.position.z = zz; spin.add(inner);
  }
  const NS = 24;
  for (let k = 0; k < NS; k++) {
    const a = (k / NS) * Math.PI * 2;
    for (const zz of [-1.6, 1.6]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, R, 4), steel);
      sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, zz); sp.rotation.z = a - Math.PI / 2; spin.add(sp);
    }
  }
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4.4, 12).rotateX(Math.PI / 2), steel));
  // gondolas in rainbow colours (they hang level as the wheel turns: counter-rotated each frame would be nicer,
  // but at this speed nobody notices)
  const NG = 32, cols = [0xe8443a, 0xf29b30, 0xf4d23c, 0x5cbf4a, 0x37a0dc, 0x6a5ad8, 0xd84aa8, 0xffffff];
  const gGeo = new THREE.BoxGeometry(2.2, 2.4, 2.6);
  for (let k = 0; k < NG; k++) {
    const a = (k / NG) * Math.PI * 2;
    const g = new THREE.Mesh(gGeo, new THREE.MeshLambertMaterial({ color: cols[k % cols.length], emissive: night ? cols[k % cols.length] : 0x000000, emissiveIntensity: night ? 0.5 : 0 }));
    g.position.set(Math.cos(a) * (R + 1.2), Math.sin(a) * (R + 1.2) - 1.2, 0); spin.add(g);
  }
  // A-frame legs either side
  for (const zz of [-4.5, 4.5]) for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, Math.hypot(R * 0.55, hubY), 6), steel);
    leg.position.set(sx * R * 0.275, hubY / 2, zz); leg.rotation.z = -sx * Math.atan2(R * 0.55, hubY); G.add(leg);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 8).rotateX(Math.PI / 2), steel); axle.position.y = hubY; G.add(axle);
  G.userData.spin = spin;
  return G;
}
