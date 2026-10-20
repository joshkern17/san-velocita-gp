// Circuit Designer, 3D VIEW: the track's points edited where they are (stage 2 of the 3D editor). Drawn over the world,
// always on top, straight from the editor's own track (so they move the moment you do; the world behind catches up
// when you let go, ed3d.js rebuild3d): the road's edges, a marker on every point, problem pins, and on the picked
// point a gizmo:
//   the point itself - drag to slide it over the ground · the arrow - drag up / down for its height
//   the ring - drag left / right to bank the road there · the dots either side - drag in / out for its width
// Picking is done on screen (what's within reach of the cursor), so it never waits on the world's meshes. Every edit
// goes through the editor's own undo, recompute and panels: the map and the 3D view are one track.
import * as THREE from 'three';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const AMBER = 0xffc21a, ROAD = 0xffc21a, PICK = 16; // (px: how near the cursor a point or handle has to be)
const W_MIN = 8, W_MAX = 22, B_MAX = 15; // (the panel's ranges: editor.js renderNodeTab)
const r1 = (v) => Math.round(v * 10) / 10;

export function installEdit3d(Ed) {
  const P = Ed.prototype;

  // ---- the overlay: made once per view, carried over to each rebuilt world ----
  P.ov3d = function () {
    const v = this.v3d; if (!v) return null;
    if (v.ov) return v.ov;
    const top = (m) => { m.depthTest = false; m.depthWrite = false; m.transparent = true; m.fog = false; return m; };
    const group = new THREE.Group(); group.renderOrder = 999;
    const road = new THREE.LineSegments(new THREE.BufferGeometry(), top(new THREE.LineBasicMaterial({ color: ROAD, opacity: 0.6 })));
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), top(new THREE.MeshBasicMaterial({ color: 0xffffff })), 512);
    marks.count = 0; marks.frustumCulled = false;
    const gz = new THREE.Group();
    const mat = (c) => top(new THREE.MeshBasicMaterial({ color: c }));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0), mat(AMBER));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 10).translate(0, 0.25, 0), mat(AMBER));
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, k) => new THREE.Vector3(Math.cos(k / 48 * Math.PI * 2), Math.sin(k / 48 * Math.PI * 2), 0))), top(new THREE.LineBasicMaterial({ color: 0x8fd0ff, opacity: 0.85 })));
    const ball = (c) => new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat(c));
    const knob = ball(0x8fd0ff), wl = ball(0x6ae04a), wr = ball(0x6ae04a);
    for (const o of [road, marks, shaft, tip, ring, knob, wl, wr]) o.renderOrder = 999;
    gz.add(shaft, tip, ring, knob, wl, wr); gz.visible = false;
    group.add(road, marks, gz);
    v.S.scene.add(group);
    v.ov = { group, road, marks, gz, shaft, tip, ring, knob, wl, wr, T: null, nodeI: [], handles: {} };
    return v.ov;
  };
  // the sample each point sits on (as recompute's nodeD), for its height on the road
  P.nodeSamples3d = function (T) {
    const n = this.track.points.length, best = new Float32Array(n).fill(9), I = new Int32Array(n).fill(0);
    for (let i = 0; i < T.N; i++) { const r = Math.round(T.NODE[i]) % n, f = Math.abs(T.NODE[i] - Math.round(T.NODE[i])); if (f < best[r]) { best[r] = f; I[r] = i; } }
    return I;
  };
  P.pointPos3d = function (k, out = new THREE.Vector3()) {
    const p = this.track.points[k], ov = this.v3d.ov, T = this.T, i = ov && ov.nodeI[k];
    return out.set(p.x, T && i != null && i < T.N ? T.Y[i] + 0.35 : p.e, p.z);
  };
  // (screen position of a world point, in client px; null behind the camera)
  P.toScreen3d = function (p) {
    const v = this.v3d, el = v.el; if (!el) return null;
    const q = (this._q3 ||= new THREE.Vector3()).copy(p).project(v.cam);
    if (q.z > 1) return null;
    const r = el.getBoundingClientRect();
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];
  };
  // where the ray through client (x, y) meets the level plane at height y0
  P.rayPlane3d = function (cx, cy, y0) {
    const v = this.v3d, r = v.el.getBoundingClientRect();
    const ndc = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = (this._rc3 ||= new THREE.Raycaster()); rc.setFromCamera(ndc, v.cam);
    const d = rc.ray.direction; if (Math.abs(d.y) < 1e-4) return null;
    const t = (y0 - rc.ray.origin.y) / d.y; if (t < 0) return null;
    return rc.ray.origin.clone().addScaledVector(d, t);
  };

  // ---- each frame, before drawing: the overlay follows the track ----
  P.ovFrame3d = function () {
    const v = this.v3d, ov = this.ov3d(); if (!ov) return;
    const T = this.T, Ps = this.track.points;
    ov.group.visible = this.mode === 'shape' && !!T;
    if (!T) return this.tags3d(null);
    if (ov.T !== T) { // (the road's edges, and where each point sits on it)
      ov.T = T; ov.nodeI = this.nodeSamples3d(T);
      const a = new Float32Array(T.N * 12); let q = 0;
      for (let i = 0; i < T.N; i++) {
        if (T.open && i === T.cut) continue;
        const j = (i + 1) % T.N;
        for (const s of [-1, 1]) {
          a[q++] = T.X[i] + T.RX[i] * s * T.W[i] / 2; a[q++] = T.Y[i] + 0.3; a[q++] = T.Z[i] + T.RZ[i] * s * T.W[i] / 2;
          a[q++] = T.X[j] + T.RX[j] * s * T.W[j] / 2; a[q++] = T.Y[j] + 0.3; a[q++] = T.Z[j] + T.RZ[j] * s * T.W[j] / 2;
        }
      }
      ov.road.geometry.dispose(); ov.road.geometry = new THREE.BufferGeometry(); ov.road.geometry.setAttribute('position', new THREE.BufferAttribute(a.subarray(0, q), 3));
    }
    // the points: about 10 px whatever the distance; picked amber, under the cursor white, the start green
    const cam = v.cam.position, m4 = new THREE.Matrix4(), c = new THREE.Color(), p = new THREE.Vector3();
    if (ov.marks.count !== Ps.length && Ps.length > ov.marks.instanceMatrix.count) { ov.group.remove(ov.marks); ov.marks.dispose(); ov.marks = new THREE.InstancedMesh(ov.marks.geometry, ov.marks.material, Ps.length + 256); ov.marks.frustumCulled = false; ov.marks.renderOrder = 999; ov.group.add(ov.marks); }
    ov.marks.count = Ps.length;
    const startK = this.track.open ? 0 : this.track.start;
    for (let k = 0; k < Ps.length; k++) {
      this.pointPos3d(k, p);
      const s = Math.max(0.25, p.distanceTo(cam) * 0.012) * (this.sel.has(k) || this.hover3d === k ? 1.35 : 1);
      ov.marks.setMatrixAt(k, m4.makeScale(s, s, s).setPosition(p));
      ov.marks.setColorAt(k, c.set(this.sel.has(k) ? 0xffd66b : this.hover3d === k ? 0xffffff : k === startK ? 0x6ae04a : this.track.open && k === Ps.length - 1 ? 0xff6a5a : 0xb8c8e8));
    }
    ov.marks.instanceMatrix.needsUpdate = true; if (ov.marks.instanceColor) ov.marks.instanceColor.needsUpdate = true;
    // the gizmo, on the first picked point
    const k = this.sel.size ? [...this.sel][0] : -1;
    ov.gz.visible = k >= 0 && k < Ps.length;
    ov.handles = {};
    if (ov.gz.visible) {
      const pt = Ps[k], i = ov.nodeI[k] ?? 0, o = this.pointPos3d(k, new THREE.Vector3()), d = o.distanceTo(cam);
      const L = Math.max(2.5, Math.min(60, d * 0.12)), th = Math.max(0.6, d * 0.01), fx = T.FX[i], fz = T.FZ[i], rx = T.RX[i], rz = T.RZ[i];
      ov.shaft.position.copy(o); ov.shaft.scale.set(th, L, th);
      ov.tip.position.copy(o).y += L; ov.tip.scale.setScalar(th * 2.2);
      // the ring stands across the road (its axis the road's heading); the knob on it shows the banking
      const R = pt.w / 2 + 1.5, b = (pt.b || 0) * Math.PI / 180;
      ov.ring.position.copy(o); ov.ring.scale.setScalar(R); ov.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(fx, 0, fz));
      const kp = o.clone().add(new THREE.Vector3(rx * Math.sin(b) * R, Math.cos(b) * R, rz * Math.sin(b) * R));
      ov.knob.position.copy(kp); ov.knob.scale.setScalar(th * 1.6);
      const wlp = o.clone().add(new THREE.Vector3(-rx * pt.w / 2, 0, -rz * pt.w / 2)), wrp = o.clone().add(new THREE.Vector3(rx * pt.w / 2, 0, rz * pt.w / 2));
      ov.wl.position.copy(wlp); ov.wr.position.copy(wrp); ov.wl.scale.setScalar(th * 1.3); ov.wr.scale.setScalar(th * 1.3);
      ov.handles = { height: o.clone().setY(o.y + L + th * 0.6), bank: kp, wl: wlp, wr: wrp, k, o, R: [rx, rz] };
    }
    this.tags3d(k);
  };

  // ---- labels over the view: the picked point's numbers, and a pin on each problem (edcheck.js) ----
  P.tags3d = function (k) {
    let box = $('ed3d-tags');
    if (!box) { box = document.createElement('div'); box.id = 'ed3d-tags'; box.className = 'ed3d-tags'; $('s-editor').appendChild(box); }
    if (!this.v3d || k === null) { box.innerHTML = ''; return; }
    const html = [], R = $('ed-wrap').getBoundingClientRect(), seen = (s) => s && s[0] > R.left && s[0] < R.right && s[1] > R.top && s[1] < R.bottom; // (only over the view, not the panels)
    if (k >= 0 && this.v3d.ov.handles.o) {
      const s = this.toScreen3d(this.v3d.ov.handles.o), p = this.track.points[k];
      if (seen(s)) html.push(`<div class="ed3d-val" style="left:${Math.round(s[0] + 18)}px;top:${Math.round(s[1] + 14)}px">Node ${k} · <b>${r1(p.e)} m</b> high · <b>${Math.round(p.b || 0)}°</b> bank · <b>${r1(p.w)} m</b> wide</div>`);
    }
    const T = this.T;
    (this.problems || []).forEach((q, n) => {
      if (q.whole || !T) return;
      const s = this.toScreen3d(new THREE.Vector3(T.X[q.i], T.Y[q.i] + 3, T.Z[q.i])); if (!seen(s)) return;
      html.push(`<div class="ed3d-pin${q.block ? ' block' : ''}" style="left:${Math.round(s[0])}px;top:${Math.round(s[1])}px">${n + 1}</div>`);
    });
    box.innerHTML = html.join('');
  };

  // ---- picking: a gizmo handle first, then the nearest point, within PICK px of the cursor ----
  P.pick3d = function (cx, cy) {
    const v = this.v3d, ov = v && v.ov; if (!ov || !this.T || this.mode !== 'shape') return null;
    let best = null, bd = PICK;
    const test = (what, p, k, r = PICK) => { const s = this.toScreen3d(p); if (!s) return; const d = Math.hypot(s[0] - cx, s[1] - cy); if (d < Math.min(bd, r)) { bd = d; best = { what, k }; } };
    const H = ov.handles;
    if (H.o) { test('height', H.height, H.k, PICK + 4); test('bank', H.bank, H.k, PICK + 4); test('width', H.wl, H.k, PICK + 2); test('width', H.wr, H.k, PICK + 2); }
    if (best) return best;
    const p = new THREE.Vector3();
    for (let k = 0; k < this.track.points.length; k++) test('point', this.pointPos3d(k, p), k);
    return best;
  };

  // ---- dragging ----
  P.down3d = function (e) {
    const hit = this.pick3d(e.clientX, e.clientY); if (!hit) return false;
    const k = hit.k, P0 = this.track.points;
    if (hit.what === 'point') {
      if (e.shiftKey) { this.sel.has(k) ? this.sel.delete(k) : this.sel.add(k); }
      else if (!this.sel.has(k)) { this.sel.clear(); this.sel.add(k); }
      this.renderPanels(); this.showTab('node');
    }
    const o = this.pointPos3d(k), sel = [...this.sel];
    this.drag3d = { what: hit.what, k, x: e.clientX, y: e.clientY, moved: false, y0: o.y - 0.35, hit0: this.rayPlane3d(e.clientX, e.clientY, o.y - 0.35),
      orig: sel.map(i => ({ i, x: P0[i].x, z: P0[i].z, e: P0[i].e, b: P0[i].b || 0, w: P0[i].w })), dist: o.distanceTo(this.v3d.cam.position) };
    sfx.move();
    return true;
  };
  P.move3dDrag = function (e) {
    const d = this.drag3d, P0 = this.track.points;
    if (!d.moved) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) return; d.moved = true; this.push(); }
    if (d.what === 'point') {
      const h = this.rayPlane3d(e.clientX, e.clientY, d.y0); if (!h || !d.hit0) return;
      let dx = h.x - d.hit0.x, dz = h.z - d.hit0.z;
      if (this.snap) { const a = d.orig.find(o => o.i === d.k); const [sx, sz] = this.snapPt(a.x + dx, a.z + dz); dx = sx - a.x; dz = sz - a.z; }
      for (const o of d.orig) { P0[o.i].x = r1(o.x + dx); P0[o.i].z = r1(o.z + dz); }
    } else if (d.what === 'height') {
      const v = this.v3d, mpp = 2 * d.dist * Math.tan(v.cam.fov * Math.PI / 360) / Math.max(1, v.el.clientHeight);
      const de = (d.y - e.clientY) * mpp;
      for (const o of d.orig) P0[o.i].e = Math.max(0, Math.round((o.e + de) * 2) / 2);
    } else if (d.what === 'bank') {
      const db = (e.clientX - d.x) * 0.15;
      for (const o of d.orig) P0[o.i].b = Math.max(-B_MAX, Math.min(B_MAX, Math.round(o.b + db)));
    } else if (d.what === 'width') {
      const h = this.rayPlane3d(e.clientX, e.clientY, d.y0); if (!h) return;
      const p = P0[d.k], [rx, rz] = this.v3d.ov.handles.R || [1, 0], lat = Math.abs((h.x - p.x) * rx + (h.z - p.z) * rz);
      const w = Math.max(W_MIN, Math.min(W_MAX, Math.round(lat * 2 * 2) / 2)), dw = w - d.orig.find(o => o.i === d.k).w;
      for (const o of d.orig) P0[o.i].w = Math.max(W_MIN, Math.min(W_MAX, o.w + dw));
    }
    this.dragRecompute(); this.dirty = true;
  };
  P.up3d = function () {
    const d = this.drag3d; this.drag3d = null; clearTimeout(this.rcT);
    if (d && d.moved) { sfx.place(); this.changed(true); }
  };
  // the cursor over the view, no button down: what it's on
  P.hoverAt3d = function (cx, cy) {
    const h = this.pick3d(cx, cy), k = h ? h.k : -1, what = h ? h.what : null;
    this.hover3d = what === 'point' ? k : -1;
    const el = this.v3d && this.v3d.el; if (el) $('s-editor').style.cursor = what === 'point' ? 'move' : what === 'height' ? 'ns-resize' : what === 'bank' || what === 'width' ? 'ew-resize' : '';
  };
}
