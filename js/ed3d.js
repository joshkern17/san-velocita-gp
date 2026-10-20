// Circuit Designer: 3D VIEW (V). The track as it is right now, in the game's own world and look (the same scenery
// build and PS2 post as a race), without starting one: fly round it, look at what you just changed, press V to go
// back to the map. It opens where the mouse is on the map (else the middle of the view), looking down the track.
// The world is built a few milliseconds a frame (race.js buildScenerySteps), so the map carries on while it's made:
// V again (or Esc) stops it, and a change made meanwhile starts it again with the change in. rebuild3d() makes a new
// one under the open view the same way and swaps it in when it's done (the 3D editor's edits, next).
//   mouse: drag to look, wheel forward / back · W A S D move, Q / E down / up, Shift faster · pad: sticks, triggers
import * as THREE from 'three';
import { buildScenerySteps } from './race.js';
import { stepFor } from './world.js';
import { cloneTrack } from './track.js';
import { loadEnvModels } from './envlib.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const BUDGET = 24; // (ms of building a frame: the map, or the open view, carries on at about 30 a second meanwhile)

export function installView3d(Ed) {
  const P = Ed.prototype;

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
  P.open3d = async function () {
    if (this.job3d) return this.close3d(); // (V again while it's being built: never mind)
    if (!this.T || this.v3d) return;
    this.toast('BUILDING THE 3D VIEW… (V: CANCEL)', 60000);
    const at = this.mouse.inside ? [this.mouse.wx, this.mouse.wz] : [this.view.cx, this.view.cz];
    this.job3d = { j: null }; // (a placeholder while the models load)
    await loadEnvModels(); // (the scenery's models: usually long loaded)
    if (!this.job3d || !this.active) return;
    this.build3d((S) => {
      if (!S) return;
      if (!this.active) return S.dispose();
      this.toast('3D VIEW', 900);
      // where to start: the track under the mouse (or the middle of the view), from 14 m behind and 5 m up
      const T = S.T, [wx, wz] = at;
      let i = 0, bd = Infinity; for (let k = 0; k < T.N; k++) { const d = (T.X[k] - wx) ** 2 + (T.Z[k] - wz) ** 2; if (d < bd) { bd = d; i = k; } }
      const near = Math.sqrt(bd) < 60, back = 14;
      const pos = near ? new THREE.Vector3(T.X[i] - T.FX[i] * back, T.Y[i] + 5, T.Z[i] - T.FZ[i] * back) : new THREE.Vector3(wx, S.world.groundHeight(wx, wz) + 30, wz + 40);
      const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 6000);
      S.scene.add(cam);
      this.v3d = { S, cam, pos, yaw: near ? Math.atan2(-T.FX[i], -T.FZ[i]) : 0, pitch: near ? -0.15 : -0.5, keys: {}, look: null };
      this.cb.show3d && this.cb.show3d(true);
      $('s-editor').classList.add('v3d');
      this.bar3d().hidden = false;
      sfx.move();
    });
  };
  // a new world under the open view, swapped in when it's ready (the camera stays where it is)
  P.rebuild3d = function () {
    if (!this.v3d) return;
    this.build3d((S) => {
      const v = this.v3d; if (!S) return; if (!v) return S.dispose();
      const old = v.S; v.S = S; S.scene.add(v.cam); old.dispose();
    });
  };
  P.close3d = function () {
    if (this.job3d) { this.stop3d(); if (!this.v3d) { this.toast('3D VIEW CANCELLED', 900); return; } }
    const v = this.v3d; if (!v) return;
    this.v3d = null;
    $('s-editor').classList.remove('v3d');
    this.bar3d().hidden = true;
    this.cb.show3d && this.cb.show3d(false);
    v.S.dispose();
    this.dirty = true;
  };
  // the strip over the 3D view: back to the map, and what moves you
  P.bar3d = function () {
    let el = $('ed-v3d');
    if (el) return el;
    el = document.createElement('div'); el.id = 'ed-v3d'; el.className = 'ed-v3d'; el.hidden = true;
    el.innerHTML = `<button id="ed-v3d-back">Back To Map (V)</button><span>Drag to look · W A S D move · Q / E down / up · Shift faster · wheel forward / back</span>`;
    $('s-editor').appendChild(el);
    $('ed-v3d-back').addEventListener('click', () => { sfx.move(); this.close3d(); });
    // (the whole screen is the view: drag anywhere on it to look)
    const scr = $('s-editor');
    scr.addEventListener('pointerdown', (e) => { if (!this.v3d || e.target.closest('#ed-v3d')) return; this.v3d.look = { x: e.clientX, y: e.clientY }; scr.setPointerCapture(e.pointerId); });
    scr.addEventListener('pointermove', (e) => { const v = this.v3d; if (!v || !v.look) return; v.yaw -= (e.clientX - v.look.x) * 0.004; v.pitch = Math.max(-1.45, Math.min(1.3, v.pitch - (e.clientY - v.look.y) * 0.004)); v.look = { x: e.clientX, y: e.clientY }; });
    scr.addEventListener('pointerup', () => { if (this.v3d) this.v3d.look = null; });
    scr.addEventListener('wheel', (e) => { if (!this.v3d) return; e.preventDefault(); this.move3d(-e.deltaY * 0.06, 0, 0); }, { passive: false });
    window.addEventListener('keyup', (e) => { if (this.v3d) this.v3d.keys[e.code] = false; });
    return el;
  };
  // keys while in 3D (from onKey): true if it took it
  P.key3d = function (e) {
    const v = this.v3d; if (!v) return false;
    if (e.code === 'KeyV' || e.code === 'Escape') { this.close3d(); return true; }
    v.keys[e.code] = true;
    return true;
  };
  // forward (where you look, flat), right, up
  P.move3d = function (f, r, u) {
    const v = this.v3d, sy = Math.sin(v.yaw), cy = Math.cos(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    v.pos.x += -sy * cp * f + cy * r; v.pos.z += -cy * cp * f - sy * r; v.pos.y += sp * f + u;
  };
  // a frame (main.js's loop, while the 3D view is open): move, then draw it the game's way
  P.render3d = function (dt, post, renderer) {
    const v = this.v3d; if (!v) return;
    const k = v.keys, sp = (k.ShiftLeft || k.ShiftRight ? 60 : 18) * dt;
    this.move3d(((k.KeyW || k.ArrowUp) ? sp : 0) - ((k.KeyS || k.ArrowDown) ? sp : 0), ((k.KeyD || k.ArrowRight) ? sp : 0) - ((k.KeyA || k.ArrowLeft) ? sp : 0), (k.KeyE ? sp : 0) - (k.KeyQ ? sp : 0));
    // a controller: left stick moves, right stick looks, triggers up / down, B back to the map
    const pad = navigator.getGamepads && [...navigator.getGamepads()].find(p => p && p.connected);
    if (pad) {
      const ax = (n) => { const a = pad.axes[n] || 0; return Math.abs(a) < 0.15 ? 0 : a; }, bt = (n) => (pad.buttons[n] ? pad.buttons[n].value : 0);
      const fast = bt(10) > 0.5 ? 3 : 1;
      this.move3d(-ax(1) * 18 * fast * dt, ax(0) * 18 * fast * dt, (bt(7) - bt(6)) * 10 * fast * dt);
      v.yaw -= ax(2) * 2.2 * dt; v.pitch = Math.max(-1.45, Math.min(1.3, v.pitch - ax(3) * 1.8 * dt));
      const b = bt(1) > 0.5; if (b && !v.padB) { v.padB = true; this.close3d(); return; } v.padB = b;
    }
    // (never under the ground)
    const g = v.S.world.groundHeight(v.pos.x, v.pos.z); if (v.pos.y < g + 0.6) v.pos.y = g + 0.6;
    const c = v.cam, el = renderer.domElement;
    c.aspect = el.clientWidth / Math.max(1, el.clientHeight); c.updateProjectionMatrix();
    c.position.copy(v.pos); c.rotation.set(v.pitch, v.yaw, 0, 'YXZ'); c.updateMatrixWorld();
    v.S.world.update(dt, c, [], []);
    post.render(v.S.scene, c, { trails: 0, grade: v.S.world.P.grade, look: v.S.world.P.look });
  };
}
