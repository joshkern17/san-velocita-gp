// Circuit Designer, 3D VIEW: sculpting the land where it is (stage 3 of the 3D editor), with the SCULPT tool (Scenery).
// The brush is a ring on the ground under the cursor, in its mode's colour, dimmed where the land is the road's (the
// track, its runoff and embankments always win: world.js fades sculpting out there, and so does the ring). Hold the
// left button to paint (Raise, Lower, Smooth, Flatten, or To Track: down to the nearest road's height): the ground under the brush rises or falls on a patch drawn over the world as you go (amber
// where it's grown too steep to stand on), and on letting go the stroke is the circuit's like any other (the same
// track.sculpt format as the map's tool, one undo each) and the world behind is built again with it. The right button
// turns the camera round, the wheel zooms; [ ] the brush size, Shift [ ] its strength.
import * as THREE from 'three';
import { SCULPT_MODES, SCULPT_MAX, applySculpt, strokeBox, trackHeightAt } from './sculpt.js';
import { sfx } from './audio.js';

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const STEEP = 0.7; // (rise over run: about 35 degrees, more than a car or a stand can sit on)

export function installSculpt3d(Ed) {
  const P = Ed.prototype;

  P.sculpting3d = function () { return !!this.v3d && this.tool === 'sculpt'; };
  // where the ray through client (x, y) meets the ground (the world's), or null
  P.groundHit3d = function (cx, cy) {
    const v = this.v3d, el = v.el; if (!el) return null;
    const r = el.getBoundingClientRect(), rc = (this._rcS ||= new THREE.Raycaster());
    rc.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), v.cam);
    const o = rc.ray.origin, d = rc.ray.direction, gh = v.S.world.groundHeight, above = (t) => o.y + d.y * t - gh(o.x + d.x * t, o.z + d.z * t);
    let a = 0.5, b = 0.5;
    for (let t = 0.5; t < 6000; t += 0.5 + t * 0.03) { if (above(t) <= 0) { b = t; break; } a = t; if (t + 0.5 + t * 0.03 >= 6000) return null; }
    for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if (above(m) > 0) a = m; else b = m; }
    return new THREE.Vector3(o.x + d.x * b, 0, o.z + d.z * b);
  };
  // how much of a stroke reaches (x, z): 0 on the road, its runoff and embankment, eased in over 14 m past them
  // (world.js sculptFade, from the editor's own analysis)
  P.sculptReach3d = function (x, z) {
    const T = this.T, A = this.A; if (!T || !A) return 1;
    let f = 1;
    A.hash.query(x, z, 70, (i) => {
      if (A.BRIDGE[i]) return;
      const inner = Math.max(T.W[i] / 2 + (this.track.env.runoff || 0), A.BL[i], A.BR[i]) + 3, d = Math.hypot(x - T.X[i], z - T.Z[i]);
      if (d < inner + 14) f = Math.min(f, smoothstep(inner, inner + 14, d));
    });
    return f;
  };
  P.stroke3d = function () {
    const m = this.sculptMode;
    return { m, r: Math.round(this.sculptR), k: m === 'up' || m === 'down' ? this.sculptK : this.sculptS, pts: [] };
  };

  // ---- the ring, each frame (while the Sculpt tool's open in 3D) ----
  P.sculptFrame3d = function () {
    const v = this.v3d; if (!v) return;
    let g = v.sc;
    if (!this.sculpting3d()) { if (g) g.group.visible = false; return; }
    if (!g) {
      const ring = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, fog: false }));
      ring.renderOrder = 999; ring.frustumCulled = false;
      const group = new THREE.Group(); group.add(ring); v.S.scene.add(group);
      g = v.sc = { group, ring, patch: null, at: null };
    }
    if (g.group.parent !== v.S.scene) v.S.scene.add(g.group);
    g.group.visible = true;
    const c = this.sculptLive ? this.sculptLive.last : g.at;
    g.ring.visible = !!c;
    if (!c) return;
    // (round the brush, on the ground: dim where the land is the road's)
    const R = this.sculptR, n = 64, pos = new Float32Array((n + 1) * 3), col = new Float32Array((n + 1) * 3), base = new THREE.Color(SCULPT_MODES[this.sculptMode].color), dim = new THREE.Color(0x404850);
    const gh = v.S.world.groundHeight, cc = new THREE.Color();
    for (let k = 0; k <= n; k++) {
      const a = k / n * Math.PI * 2, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R, f = this.sculptReach3d(x, z);
      pos.set([x, gh(x, z) + 0.4, z], k * 3); cc.copy(dim).lerp(base, f); col.set([cc.r, cc.g, cc.b], k * 3);
    }
    g.ring.geometry.dispose(); g.ring.geometry = new THREE.BufferGeometry();
    g.ring.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.ring.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  P.sculptHover3d = function (cx, cy) { const v = this.v3d; if (v && v.sc) v.sc.at = this.groundHit3d(cx, cy); else if (v) { this.sculptFrame3d(); if (v.sc) v.sc.at = this.groundHit3d(cx, cy); } };

  // ---- painting ----
  P.sculptDown3d = function (e) {
    const h = this.groundHit3d(e.clientX, e.clientY); if (!h) return false;
    const st = this.stroke3d(); st.pts.push([+h.x.toFixed(1), +h.z.toFixed(1)]);
    this.sculptLive = { st, last: h };
    this.sculptPatch3d();
    sfx.move();
    return true;
  };
  P.sculptMove3d = function (e) {
    const L = this.sculptLive, h = this.groundHit3d(e.clientX, e.clientY); if (!h) return;
    const q = L.st.pts[L.st.pts.length - 1];
    L.last = h;
    if (Math.hypot(h.x - q[0], h.z - q[1]) > Math.max(1, L.st.r * 0.35)) { L.st.pts.push([+h.x.toFixed(1), +h.z.toFixed(1)]); this.sculptPatch3d(); }
  };
  P.sculptUp3d = function () {
    const L = this.sculptLive; this.sculptLive = null; if (!L) return;
    this.push(); this.track.sculpt.push(L.st); this.sculptView = null;
    sfx.place();
    this.changed(); // (a new world with it: ed3d.js rebuild3d; the patch stays till that's in)
    if (this.tool === 'sculpt') this.renderSculptTab();
  };
  // the stroke so far on a patch of ground over the world: the world's own ground under it, the stroke applied (as
  // world.js does, faded out where the road's), tinted the brush's colour, amber where it's too steep
  P.sculptPatch3d = function () {
    const v = this.v3d, L = this.sculptLive; if (!v || !L) return;
    const st = L.st, [x0, z0, x1, z1] = strokeBox(st, 4), step = Math.max(1.5, Math.min(4, st.r / 8));
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    if (nx * nz > 90000) return; // (a very long stroke: the world shows it when it's built)
    const gh = v.S.world.groundHeight, B = new Float32Array(nx * nz), H = new Float32Array(nx * nz), F = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) { const x = x0 + k * step, z = z0 + j * step, i = j * nx + k; B[i] = H[i] = gh(x, z); F[i] = this.sculptReach3d(x, z); }
    applySculpt([st], H, nx, nz, x0, z0, step, this.T && this.A ? trackHeightAt(this.T, this.A.hash) : null);
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 4), base = new THREE.Color(SCULPT_MODES[st.m].color), steep = new THREE.Color(0xffb020);
    const Y = new Float32Array(nx * nz);
    for (let i = 0; i < nx * nz; i++) Y[i] = B[i] + (H[i] - B[i]) * F[i];
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
      const i = j * nx + k, d = Y[i] - B[i];
      pos.set([x0 + k * step, Y[i] + 0.06, z0 + j * step], i * 3);
      const sx = (Y[j * nx + Math.min(nx - 1, k + 1)] - Y[j * nx + Math.max(0, k - 1)]) / (2 * step), sz = (Y[Math.min(nz - 1, j + 1) * nx + k] - Y[Math.max(0, j - 1) * nx + k]) / (2 * step);
      const c = Math.hypot(sx, sz) > STEEP && Math.abs(d) > 0.2 ? steep : base, a = Math.min(0.75, Math.abs(d) * 0.6); // (clear where nothing's changed)
      col.set([c.r, c.g, c.b, a], i * 4);
    }
    const idx = []; for (let j = 0; j < nz - 1; j++) for (let k = 0; k < nx - 1; k++) { const a = j * nx + k; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setIndex(idx); geo.computeVertexNormals();
    const g = v.sc;
    if (!g.patch) { g.patch = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })); g.patch.renderOrder = 998; g.group.add(g.patch); }
    else { g.patch.geometry.dispose(); g.patch.geometry = geo; }
    g.patch.visible = true;
  };
  // (the world's been built again with the stroke in: the patch goes)
  P.sculptSwapped3d = function () { const g = this.v3d && this.v3d.sc; if (g && g.patch && !this.sculptLive) g.patch.visible = false; };
  // [ ] the brush size, Shift [ ] its strength (as on the map); true if it took the key
  P.sculptKey3d = function (e) {
    if (!this.sculpting3d() || (e.code !== 'BracketLeft' && e.code !== 'BracketRight')) return false;
    const up = e.code === 'BracketRight', m = this.sculptMode;
    if (e.shiftKey) { if (m === 'up' || m === 'down') this.sculptK = Math.max(0.5, Math.min(SCULPT_MAX, Math.round(this.sculptK * (up ? 1.25 : 0.8) * 2) / 2)); else this.sculptS = Math.max(0.1, Math.min(1, Math.round((this.sculptS + (up ? 0.1 : -0.1)) * 20) / 20)); }
    else this.sculptR = Math.max(8, Math.min(150, Math.round(this.sculptR * (up ? 1.25 : 0.8))));
    this.renderSculptTab(); sfx.move();
    return true;
  };
}
