// Circuit Designer: 3D VIEW (V). The track as it is right now, in the game's own world and look (the same scenery
// build and PS2 post as a race, without the fog: you can see the far side of the circuit), and its points edited
// where they are (ed3dedit.js). The top bar, the panel on the right and the modes stay; only the map gives way.
// The world is built a few milliseconds a frame (race.js buildScenerySteps), so nothing waits while it's made: V again
// (or Esc) stops the first one, and after every change a new one is built under the open view and swapped in when it's
// done (rebuild3d), the camera where it was. Your edits show at once on the overlay meanwhile.
//   orbit (the default): drag empty ground to turn round, right-drag (or Shift-drag) to pan, wheel to zoom,
//   W A S D pan, Q / E zoom · C: fly instead (drag to look, W A S D, Q / E down / up, Shift faster) · F: frame the
//   picked point · pad: the left stick pans (flies), the right stick turns, LT RT zoom (down / up), B back to the map
import * as THREE from 'three';
import { buildScenerySteps } from './race.js';
import { stepFor } from './world.js';
import { cloneTrack } from './track.js';
import { lapShift } from './lapshift.js';
import { loadEnvModels } from './envlib.js';
import { sfx } from './audio.js';
import { installEdit3d } from './ed3dedit.js';
import { installSculpt3d } from './ed3dsculpt.js';

const $ = (id) => document.getElementById(id);
const BUDGET = 24; // (ms of building a frame: the map, or the open view, carries on at about 30 a second meanwhile)
const UI = '.ed-top, .ed-side, .ed-dock, .ed-v3d, .ed-modal, .ed-hint, .ed-toast, #ed3d-tags';

export function installView3d(Ed) {
  const P = Ed.prototype;
  installEdit3d(Ed);
  installSculpt3d(Ed);

  P.toggle3d = function () { return this.v3d || this.job3d ? this.close3d() : this.open3d(); };
  // a world of the track as it is now, built in steps; done(S) when it's ready (null: stopped, or it failed)
  P.build3d = function (done) {
    const job = this.job3d = { j: this.snapshot().j, g: buildScenerySteps(cloneTrack(this.track)), done };
    const pump = () => {
      if (this.job3d !== job) return; // (stopped, or a newer one)
      if (!this.active) { this.job3d = null; return done(null); } // (left the editor)
      let r;
      try { r = stepFor(job.g, BUDGET); } catch (e) { console.error(e); this.job3d = null; this.toast('3D VIEW FAILED: ' + e.message); return done(null); }
      if (!r.done) return requestAnimationFrame(pump);
      this.job3d = null;
      if (this.snapshot().j !== job.j && this.active) { r.value.dispose(); return this.build3d(done); } // (changed meanwhile: again, with the change)
      done(r.value);
    };
    requestAnimationFrame(pump);
  };
  P.stop3d = function () { const j = this.job3d; if (!j) return; this.job3d = null; try { j.g.return(); } catch (e) {} };
  // (the world as the 3D view shows it: no fog, no haze, so the far side of the circuit is as clear as the near)
  const clearAir = (S) => {
    S.scene.fog = null;
    const L = S.world.P.look || {}, H = L.haze || {};
    S.look3d = { ...L, haze: { ...H, density: 0, noise: 0, far: 1e9, farColor: H.color } };
  };
  P.open3d = async function (back = null) {
    if (this.job3d) return this.close3d(); // (V again while it's being built: never mind)
    if (!this.T || this.v3d) return;
    this.toast('BUILDING THE 3D VIEW… (V: CANCEL)', 60000);
    const at = this.sel.size ? [this.track.points[[...this.sel][0]].x, this.track.points[[...this.sel][0]].z] : this.mouse.inside ? [this.mouse.wx, this.mouse.wz] : [this.view.cx, this.view.cz];
    this.job3d = { j: null }; // (a placeholder while the models load)
    await loadEnvModels(); // (the scenery's models: usually long loaded)
    if (!this.job3d || !this.active) return;
    this.build3d((S) => {
      if (!S) return;
      if (!this.active) return S.dispose();
      clearAir(S);
      this.toast('3D VIEW', 900);
      // where to start: looking at the track under the mouse (or the picked point, or the middle of the view), from
      // behind it and above, along the road
      const T = S.T, [wx, wz] = at;
      let i = 0, bd = Infinity; for (let k = 0; k < T.N; k++) { const d = (T.X[k] - wx) ** 2 + (T.Z[k] - wz) ** 2; if (d < bd) { bd = d; i = k; } }
      const near = Math.sqrt(bd) < 80;
      const target = near ? new THREE.Vector3(T.X[i], T.Y[i], T.Z[i]) : new THREE.Vector3(wx, S.world.groundHeight(wx, wz), wz);
      const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 15000);
      S.scene.add(cam);
      this.v3d = { S, cam, mode: 'orbit', target, dist: 70, yaw: near ? Math.atan2(-T.FX[i], -T.FZ[i]) : 0, pitch: -0.5, pos: new THREE.Vector3(), keys: {}, ptr: null, el: null };
      if (back) Object.assign(this.v3d, { target: back.target.clone(), dist: back.dist, yaw: back.yaw, pitch: back.pitch });
      this.place3d();
      this.cb.show3d && this.cb.show3d(true);
      $('s-editor').classList.add('v3d');
      this.bar3d().hidden = false; this.bar3dState();
      this.setHint();
      sfx.move();
    });
  };
  // a new world under the open view, swapped in when it's ready (the camera and the overlay carried over)
  P.rebuild3d = function () {
    if (!this.v3d || !this.T) return;
    this.build3d((S) => {
      const v = this.v3d; if (!S) return; if (!v) return S.dispose();
      clearAir(S);
      const old = v.S; v.S = S; S.scene.add(v.cam); if (v.ov) S.scene.add(v.ov.group); if (v.sc) S.scene.add(v.sc.group);
      old.dispose();
      this.sculptSwapped3d();
    });
  };
  P.close3d = function () {
    if (this.job3d) { this.stop3d(); if (!this.v3d) { this.toast('3D VIEW CANCELLED', 900); return; } }
    const v = this.v3d; if (!v) return;
    if (this.drag3d) this.up3d();
    this.sculptLive = null;
    this.v3d = null; clearTimeout(this.rb3dT);
    $('s-editor').classList.remove('v3d'); $('s-editor').style.cursor = '';
    this.bar3d().hidden = true;
    this.tags3d(null);
    this.cb.show3d && this.cb.show3d(false);
    if (v.ov) v.ov.group.removeFromParent();
    v.S.dispose();
    requestAnimationFrame(() => { this.resize(); this.dirty = true; }); // (the map has its room back)
    this.setHint();
  };
  // the strip over the 3D view: back to the map, how the camera moves
  P.bar3d = function () {
    let el = $('ed-v3d');
    if (el) return el;
    el = document.createElement('div'); el.id = 'ed-v3d'; el.className = 'ed-v3d'; el.hidden = true;
    el.innerHTML = `<button id="ed-v3d-cam" title="C">Orbit</button><button id="ed-v3d-frame" title="F">Frame</button><button id="ed-v3d-test" title="T: a test drive starting here">Test From Here (T)</button><button id="ed-v3d-back" class="hot">Back To Map (V)</button>`;
    $('ed-wrap').appendChild(el);
    $('ed-v3d-back').addEventListener('click', () => { sfx.move(); this.close3d(); });
    $('ed-v3d-cam').addEventListener('click', () => this.camMode3d());
    $('ed-v3d-frame').addEventListener('click', () => this.frame3d());
    $('ed-v3d-test').addEventListener('click', () => this.testHere3d());
    // (the view is everything the editor's panels don't cover)
    const scr = $('s-editor'), inView = (e) => this.v3d && !e.target.closest(UI);
    scr.addEventListener('pointerdown', (e) => {
      if (!inView(e)) return;
      const v = this.v3d; scr.setPointerCapture(e.pointerId);
      if (e.button === 0 && !e.shiftKey && v.mode === 'orbit' && (this.sculpting3d() ? this.sculptDown3d(e) : this.down3d(e))) return;
      // (sculpting: the left button paints, so the right one turns round; else it pans)
      v.ptr = { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.shiftKey || (e.button === 2 && !this.sculpting3d()), moved: false };
    });
    scr.addEventListener('pointermove', (e) => {
      const v = this.v3d; if (!v) return;
      if (this.drag3d) return this.move3dDrag(e);
      if (this.sculptLive) return this.sculptMove3d(e);
      const p = v.ptr;
      if (!p) { if (inView(e)) { if (this.sculpting3d()) this.sculptHover3d(e.clientX, e.clientY); else this.hoverAt3d(e.clientX, e.clientY); } return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 0) p.moved = true;
      if (v.mode === 'fly' || !p.pan) { v.yaw -= dx * 0.005; v.pitch = Math.max(v.mode === 'fly' ? -1.45 : -1.52, Math.min(v.mode === 'fly' ? 1.3 : -0.04, v.pitch - dy * 0.005)); }
      else this.pan3d(-dx * v.dist * 0.0016, dy * v.dist * 0.0016);
    });
    scr.addEventListener('pointerup', (e) => {
      const v = this.v3d; if (!v) return;
      if (this.drag3d) return this.up3d();
      if (this.sculptLive) return this.sculptUp3d();
      const p = v.ptr; v.ptr = null;
      // (a click on empty ground: nothing picked)
      if (p && !p.moved && !p.pan && inView(e) && v.mode === 'orbit' && this.sel.size && !this.sculpting3d()) { this.sel.clear(); this.renderPanels(); }
    });
    scr.addEventListener('contextmenu', (e) => { if (inView(e)) e.preventDefault(); });
    scr.addEventListener('wheel', (e) => {
      const v = this.v3d; if (!v || !inView(e)) return; e.preventDefault();
      if (v.mode === 'fly') this.move3d(-e.deltaY * 0.06, 0, 0); else v.dist = Math.max(4, Math.min(4000, v.dist * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    window.addEventListener('keyup', (e) => { if (this.v3d) this.v3d.keys[e.code] = false; });
    return el;
  };
  P.bar3dState = function () { const b = $('ed-v3d-cam'); if (b && this.v3d) b.textContent = this.v3d.mode === 'orbit' ? 'Orbit (C)' : 'Fly (C)'; };
  // C: orbit round a spot on the ground, or fly free (each picks up where the other is looking)
  P.camMode3d = function () {
    const v = this.v3d; if (!v) return;
    if (v.mode === 'orbit') v.mode = 'fly';
    else { // (the spot ahead where the view meets the ground, else 60 m on)
      const f = new THREE.Vector3(-Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), -Math.cos(v.yaw) * Math.cos(v.pitch));
      let t = 60; if (f.y < -0.05) t = Math.min(800, Math.max(8, (v.pos.y - v.S.world.groundHeight(v.pos.x, v.pos.z)) / -f.y));
      v.target.copy(v.pos).addScaledVector(f, t); v.target.y = v.S.world.groundHeight(v.target.x, v.target.z); v.dist = t;
      v.pitch = Math.min(-0.04, v.pitch); v.mode = 'orbit';
    }
    sfx.move(); this.bar3dState(); this.setHint();
  };
  // F: the picked point (else the road nearest the view's spot) in the middle, close enough to work on
  P.frame3d = function () {
    const v = this.v3d; if (!v) return;
    if (v.mode === 'fly') this.camMode3d();
    if (this.sel.size) { this.pointPos3d([...this.sel][0], v.target); v.target.y -= 0.35; v.dist = 45; }
    else if (this.T) { const T = this.T; let i = 0, bd = Infinity; for (let k = 0; k < T.N; k++) { const d = (T.X[k] - v.target.x) ** 2 + (T.Z[k] - v.target.z) ** 2; if (d < bd) { bd = d; i = k; } } v.target.set(T.X[i], T.Y[i], T.Z[i]); v.dist = 60; }
    sfx.move();
  };
  // orbit: the spot moved across (right) and along (forward, flat) the view, kept on the ground
  P.pan3d = function (r, f) {
    const v = this.v3d, sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
    v.target.x += cy * r - sy * f; v.target.z += -sy * r - cy * f;
    v.target.y = v.S.world.groundHeight(v.target.x, v.target.z);
  };
  // fly: forward (where you look), right, up
  P.move3d = function (f, r, u) {
    const v = this.v3d, sy = Math.sin(v.yaw), cy = Math.cos(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    v.pos.x += -sy * cp * f + cy * r; v.pos.z += -cy * cp * f - sy * r; v.pos.y += sp * f + u;
  };
  // orbit: the camera from the spot, the angles and the distance
  P.place3d = function () {
    const v = this.v3d; if (v.mode !== 'orbit') return;
    const cp = Math.cos(v.pitch);
    v.pos.set(v.target.x + Math.sin(v.yaw) * cp * v.dist, v.target.y - Math.sin(v.pitch) * v.dist, v.target.z + Math.cos(v.yaw) * cp * v.dist);
  };
  // keys while in 3D (from onKey): true if it took it; the rest (undo, delete, save...) go on to the editor's own
  P.key3d = function (e) {
    const v = this.v3d; if (!v) return false;
    if (e.ctrlKey || e.metaKey) return false;
    if (e.code === 'KeyV') { this.close3d(); return true; }
    if (this.sculptKey3d(e)) return true;
    if (e.code === 'Escape') { if (this.drag3d) return true; if (this.sel.size) { this.sel.clear(); this.renderPanels(); } else this.close3d(); return true; }
    if (e.code === 'KeyC') { this.camMode3d(); return true; }
    if (e.code === 'KeyF') { this.frame3d(); return true; }
    if (e.code === 'KeyT') { this.testHere3d(); return true; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { v.keys[e.code] = true; return true; }
    return false;
  };
  // T: a test drive from the point nearest the spot you're looking at (a copy of the track with its start line moved
  // there, lapShift: the circuit itself keeps its own). Back To Editor brings back the circuit, undo and this view.
  P.testHere3d = function () {
    const v = this.v3d; if (!v || !this.needTrack('TEST')) return;
    if (v.mode === 'fly') this.camMode3d();
    const P0 = this.track.points; let ns = 0, bd = Infinity;
    for (let k = 0; k < P0.length; k++) { const d = (P0[k].x - v.target.x) ** 2 + (P0[k].z - v.target.z) ** 2; if (d < bd) { bd = d; ns = k; } }
    const t = cloneTrack(this.track);
    if (!t.open) { lapShift(this.T, t, ns); t.start = ns; }
    this.v3dReturn = { track: cloneTrack(this.track), cam: { target: v.target.clone(), dist: v.dist, yaw: v.yaw, pitch: v.pitch } };
    this.guideStep('driven'); this.saveWork();
    sfx.select(); this.close3d();
    this.cb.onTest(t);
  };
  // (back from that test drive: the circuit as it was, not the copy, and the 3D view where it was)
  const open0 = P.open;
  P.open = function (track, o = {}) {
    const R = this.v3dReturn; this.v3dReturn = null;
    open0.call(this, R && o.resume ? R.track : track, o);
    if (R && o.resume) setTimeout(() => this.open3d(R.cam), 300);
  };
  // after any change: a new world behind the overlay (not while a drag's still going: on letting go)
  const changed0 = P.changed;
  P.changed = function (panels) {
    changed0.call(this, panels);
    if (!this.v3d) return;
    if (!this.T) { this.close3d(); this.toast('NO ROAD TO SHOW IN 3D'); return; }
    clearTimeout(this.rb3dT);
    if (!this.drag3d) this.rb3dT = setTimeout(() => this.rebuild3d(), 150);
  };
  // (the map isn't drawn while it's hidden behind the 3D view)
  const draw0 = P.draw;
  P.draw = function () { if (!this.v3d) draw0.call(this); };
  // the how-to in 3D
  const setHint0 = P.setHint;
  P.setHint = function () {
    setHint0.call(this);
    if (!this.v3d) return;
    const fly = this.v3d.mode === 'fly';
    $('ed-hint').innerHTML = this.tool === 'sculpt' && !fly
      ? '<b>3D VIEW &middot; SCULPT</b> &mdash; <b>hold</b> to paint the land: <b>Raise</b>, <b>Lower</b>, <b>Smooth</b>, <b>Flatten</b> (to the height where you start) or <b>To Track</b> (down to the nearest road\'s height) on the right. The ring dims where the land is the road\'s: the track, its runoff and banks never move. Amber: too steep to stand on. <b>[ ]</b> brush size, <b>Shift [ ]</b> strength. <b>Right-drag</b> to turn round, <b>wheel</b> to zoom, <b>W A S D</b> to pan.'
      : this.mode !== 'shape'
      ? '<b>3D VIEW</b> &mdash; in 3D for now: the <b>Shape</b> mode\'s points, and <b>Sculpt</b> (Scenery). Curbs, barriers and the rest are on the map (<b>V</b>) for now.'
      : fly ? '<b>3D VIEW &middot; FLY</b> &mdash; <b>drag</b> to look, <b>W A S D</b> to fly, <b>Q E</b> down / up, <b>Shift</b> faster. <b>C</b>: back to orbit, to work on the points.'
        : '<b>3D VIEW</b> &mdash; <b>drag a point</b> to slide it over the ground. On the picked point, drag its <b>arrow</b> for its height, its <b>ring</b> to bank the road, the <b>dots</b> either side for its width. <b>Drag</b> empty ground to turn round, <b>right-drag</b> to pan, <b>wheel</b> to zoom. <b>F</b>: frame the point, <b>C</b>: fly, <b>V</b>: the map.';
  };
  // a frame (main.js's loop, while the 3D view is open): move, then draw it the game's way, the overlay on top
  P.render3d = function (dt, post, renderer) {
    const v = this.v3d; if (!v) return;
    v.el = renderer.domElement;
    const k = v.keys, fast = k.ShiftLeft || k.ShiftRight;
    const kf = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0), kr = ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0), ku = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    if (v.mode === 'fly') { const sp = (fast ? 60 : 18) * dt; this.move3d(kf * sp, kr * sp, ku * sp); }
    else { if (kf || kr) this.pan3d(kr * v.dist * 0.9 * dt * (fast ? 3 : 1), kf * v.dist * 0.9 * dt * (fast ? 3 : 1)); if (ku) v.dist = Math.max(4, Math.min(4000, v.dist * Math.exp(-ku * 1.2 * dt))); }
    // a controller: the left stick pans (flies), the right stick turns, the triggers zoom (down / up), B back to the map
    const pad = navigator.getGamepads && [...navigator.getGamepads()].find(p => p && p.connected);
    if (pad) {
      const ax = (n) => { const a = pad.axes[n] || 0; return Math.abs(a) < 0.15 ? 0 : a; }, bt = (n) => (pad.buttons[n] ? pad.buttons[n].value : 0);
      const boost = bt(10) > 0.5 ? 3 : 1;
      if (v.mode === 'fly') this.move3d(-ax(1) * 18 * boost * dt, ax(0) * 18 * boost * dt, (bt(7) - bt(6)) * 10 * boost * dt);
      else { this.pan3d(ax(0) * v.dist * 0.9 * dt * boost, -ax(1) * v.dist * 0.9 * dt * boost); v.dist = Math.max(4, Math.min(4000, v.dist * Math.exp((bt(6) - bt(7)) * 1.2 * dt))); }
      v.yaw -= ax(2) * 2.2 * dt; v.pitch = Math.max(v.mode === 'fly' ? -1.45 : -1.52, Math.min(v.mode === 'fly' ? 1.3 : -0.04, v.pitch - ax(3) * 1.8 * dt));
      const b = bt(1) > 0.5; if (b && !v.padB) { v.padB = true; this.close3d(); return; } v.padB = b;
    }
    this.place3d();
    // (never under the ground)
    const g = v.S.world.groundHeight(v.pos.x, v.pos.z); if (v.pos.y < g + 0.6) v.pos.y = g + 0.6;
    const c = v.cam, el = renderer.domElement;
    c.aspect = el.clientWidth / Math.max(1, el.clientHeight); c.updateProjectionMatrix();
    c.position.copy(v.pos); c.rotation.set(v.pitch, v.yaw, 0, 'YXZ'); c.updateMatrixWorld();
    this.ovFrame3d();
    this.sculptFrame3d();
    v.S.world.update(dt, c, [], []);
    post.render(v.S.scene, c, { trails: 0, grade: v.S.world.P.grade, look: v.S.look3d });
  };
}
