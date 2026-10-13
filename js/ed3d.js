// Circuit Designer: 3D VIEW (V). The track as it is right now, in the game's own world and look (the same scenery
// build and PS2 post as a race), without starting one: fly round it, look at what you just changed, press V to go
// back to the map. It opens where the mouse is on the map (else the middle of the view), looking down the track.
//   mouse: drag to look, wheel forward / back · W A S D move, Q / E down / up, Shift faster · pad: sticks, triggers
import * as THREE from 'three';
import { buildScenery } from './race.js';
import { cloneTrack } from './track.js';
import { loadEnvModels } from './envlib.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

export function installView3d(Ed) {
  const P = Ed.prototype;

  P.toggle3d = function () { return this.v3d ? this.close3d() : this.open3d(); };
  P.open3d = async function () {
    if (!this.T || this.v3dBusy) return;
    this.v3dBusy = true;
    this.toast('BUILDING THE 3D VIEW…');
    await loadEnvModels(); // (the scenery's models: usually long loaded)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // (the toast paints first)
    let S = null;
    try { S = buildScenery(cloneTrack(this.track)); } catch (e) { console.error(e); this.toast('3D VIEW FAILED: ' + e.message); this.v3dBusy = false; return; }
    this.v3dBusy = false;
    if (!this.active) { S.dispose(); return; }
    // where to start: the track under the mouse (or the middle of the view), from 14 m behind and 5 m up
    const T = S.T, [wx, wz] = this.mouse.inside ? [this.mouse.wx, this.mouse.wz] : [this.view.cx, this.view.cz];
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
  };
  P.close3d = function () {
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
