// Photo mode: from the pause menu, the race frozen, a free camera round your car, your driver out beside it, and a
// shot saved as a PNG. The camera orbits the car (yaw, pitch, distance), then turns its head away from it as you like
// (look: pan and tilt, so the car needn't be in the middle, or in the shot at all), and looks through a lens: a focal
// length on a 35 mm frame (24 mm tall), so 24 mm is wide and 135 mm is tight. The aperture sets the depth of field the
// way a real lens would: a long lens, a wide aperture and a near subject leave less in focus.
//
//   photo.enter(race);                     // from the pause menu (the race is already paused)
//   photo.update(dt, ctl);                 // each frame: ctl = { orbitX, orbitY, lookX, lookY, dolly, zoom } (-1..1)
//   post.setDof(photo.dof());              // the depth of field for this frame (null: none)
//   photo.set('pose', 'lean');             // the options (OPTS below); the driver is rebuilt when one changes
//   photo.capture(canvas) -> Promise       // right after the frame's render: saves the shot, resolves to its URL
//   photo.leave();                         // puts the cockpit driver, the other cars and the camera back
import * as THREE from 'three';
import { loadCharacters } from './characters.js';

export const LENSES = [14, 18, 24, 35, 50, 85, 135, 200]; // (mm)
export const POSES = [['off', 'No driver'], ['lean', 'Leaning on it'], ['lean_2', 'Foot up'], ['stand_pose', 'Arms back'], ['idle', 'Standing'],
  ['idle_look', 'Looking round'], ['wave', 'Waving'], ['victory', 'Celebrating'], ['point', 'Pointing'], ['kneel', 'Kneeling']];
export const OPTS = {
  pose: POSES,
  side: [[1, 'Right'], [-1, 'Left']],
  spot: [['door', 'By the door'], ['front', 'Front wheel'], ['rear', 'Rear wheel']],
  helmet: [[true, 'On'], [false, 'Off']],
  others: [[true, 'Show'], [false, 'Hide']],
  look: [['game', 'Game'], ['sharp', 'Sharp']],
  fstop: [[0, 'Off'], [1.4, 'f/1.4'], [2.8, 'f/2.8'], [5.6, 'f/5.6'], [11, 'f/11']],
  focus: [['car', 'Car'], ['driver', 'Driver'], ['far', 'Background']],
};
const COC = 0.045e-3; // (the blur circle that still reads as sharp, m: a little over a 35 mm frame's 0.03 mm, as the frame has few pixels)
const fovOf = (mm) => 2 * Math.atan(12 / mm) * 180 / Math.PI; // (vertical, a 24 mm tall frame)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _t = new THREE.Vector3(), _dt = new THREE.Vector3(), _upAxis = new THREE.Vector3(0, 1, 0);
const _up75 = new THREE.Vector3(0, 0.75, 0), _up12 = new THREE.Vector3(0, 1.2, 0);

export class PhotoMode {
  constructor() {
    this.on = false;
    this.o = { pose: 'lean', side: 1, spot: 'door', helmet: true, others: true, look: 'game', fstop: 2.8, focus: 'car' };
    this.mm = 35;
  }
  get sharp() { return this.on && this.o.look === 'sharp'; }
  enter(race) {
    this.race = race; this.car = race.player || race.focus; this.on = true;
    const cam = race.camera;
    this.saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone(), fov: cam.fov };
    // start from where the game's camera is, looking at the car
    this.lookYaw = 0; this.lookPitch = 0;
    const d = cam.position.clone().sub(this.target(_t)), len = d.length() || 6;
    // (the game's camera can be far off, the intro's or a TV camera's: start close enough for a portrait)
    this.dist = clamp(len, 4.5, 8); this.yaw = Math.atan2(d.x, d.z); this.pitch = clamp(Math.asin(clamp(d.y / len, -1, 1)), 0.05, 0.5);
    this.mm = LENSES.reduce((a, b) => Math.abs(fovOf(b) - cam.fov) < Math.abs(fovOf(a) - cam.fov) ? b : a);
    this.cockpit = []; this.hidden = [];
    this.applyOthers(); this.applyDriver();
  }
  set(k, v) {
    this.o[k] = v;
    if (k === 'others') this.applyOthers();
    else if (k === 'pose' || k === 'side' || k === 'spot' || k === 'helmet') this.applyDriver();
  }
  // the lens: step to the next longer (d +1) or wider (d -1) of LENSES
  lens(d) { const to = d > 0 ? LENSES.find(x => x > this.mm + 0.5) : [...LENSES].reverse().find(x => x < this.mm - 0.5); if (to) this.mm = to; }
  lensLabel() { return Math.round(this.mm) + ' mm'; }
  // the point the camera turns round: the car's middle, at about door-handle height
  target(v) { return v.copy(this.car.model.group.position).add(_up75); }
  recenter() { this.lookYaw = 0; this.lookPitch = 0; }
  // the depth of field for this frame (null: off). Sharp for N c s^2 / f^2 metres either side of the focus (the thin
  // lens, s the focus distance, f the focal length, N the f-number, c COC); the blur is full a few times further out,
  // and bigger with a longer lens and a wider aperture
  dof() {
    const N = this.o.fstop; if (!this.on || !N) return null;
    const cam = this.race.camera, f = this.mm / 1000;
    let t;
    if (this.o.focus === 'driver' && this.ch) t = this.ch.object.getWorldPosition(_dt).add(_up12);
    else if (this.o.focus === 'far') t = cam.getWorldDirection(_dt).multiplyScalar(80).add(cam.position);
    else t = this.target(_dt);
    const s = cam.position.distanceTo(t), half = N * COC * s * s / (f * f);
    return { target: t, range: clamp(half * 4, 0.4, 400), scale: clamp(1 + (this.mm / 50) * (2.8 / N), 1, 4) };
  }
  update(dt, c = {}) {
    if (!this.on) return;
    this.yaw -= (c.orbitX || 0) * 1.8 * dt;
    this.pitch = clamp(this.pitch + (c.orbitY || 0) * 1.2 * dt, -0.15, 1.45);
    this.dist = clamp(this.dist * Math.exp((c.dolly || 0) * 1.4 * dt), 1.5, 30);
    // (looking about turns slower through a long lens, as a real one would feel)
    const k = Math.min(1, 35 / this.mm);
    this.lookYaw = clamp(this.lookYaw - (c.lookX || 0) * 1.2 * k * dt, -Math.PI, Math.PI);
    this.lookPitch = clamp(this.lookPitch + (c.lookY || 0) * 0.9 * k * dt, -1.2, 1.2);
    // zoom: through the focal lengths at the same pace whichever end (a ratio a second)
    this.mm = clamp(this.mm * Math.exp((c.zoom || 0) * 1.1 * dt), LENSES[0], LENSES[LENSES.length - 1]);
    const cam = this.race.camera, tg = this.target(_t);
    cam.position.set(tg.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, tg.y + Math.sin(this.pitch) * this.dist, tg.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    // never under the ground
    const gh = this.race.world.groundHeight(cam.position.x, cam.position.z);
    if (isFinite(gh)) cam.position.y = Math.max(cam.position.y, gh + 0.25);
    cam.up.set(0, 1, 0); cam.lookAt(tg);
    cam.rotateOnWorldAxis(_upAxis, this.lookYaw); cam.rotateX(this.lookPitch); // (then the head turns: pan, then tilt)
    cam.fov = fovOf(this.mm); cam.updateProjectionMatrix();
    if (this.ch) this.ch.update(dt);
  }
  // the driver out of the car: the cockpit's helmet and shoulders hidden while they stand beside it, and their place
  // on the grid (if the race hasn't started) left empty
  async applyDriver() {
    const tok = this.tok = (this.tok || 0) + 1;
    this.dropDriver();
    const out = this.o.pose !== 'off';
    this.showCockpit(!out);
    this.showGrid(!out);
    if (!out || !(await loadCharacters()) || tok !== this.tok || !this.on) return;
    const D = this.race.drivers; if (!D) return;
    const { ch } = D.posed(this.car, { clip: this.o.pose, side: this.o.side, spot: this.o.spot, helmet: this.o.helmet });
    this.ch = ch; this.race.scene.add(ch.object); ch.update(0);
  }
  dropDriver() { if (this.ch) { this.ch.object.removeFromParent(); this.ch.dispose(); this.ch = null; } }
  showCockpit(on) {
    const m = this.car.model;
    if (!on && !this.cockpit.length) {
      const tex = new Set([m.helTex, m.suitTex, m.limbTex, m.armTex].filter(Boolean));
      m.group.traverse(o => { if (o.isMesh && o.visible && (o.material === m.visorMat || o.material === m.helmet?.material || tex.has(o.material?.map))) { o.visible = false; this.cockpit.push(o); } });
    } else if (on) { for (const o of this.cockpit) o.visible = true; this.cockpit = []; }
  }
  showGrid(on) { for (const p of this.race.drivers?.people || []) if (p.car === this.car) p.object.visible = on; }
  applyOthers() {
    for (const o of this.hidden) o.visible = true; this.hidden = [];
    if (this.o.others) return;
    for (const car of this.race.cars) if (car !== this.car && car.model?.group?.visible) { car.model.group.visible = false; this.hidden.push(car.model.group); }
    for (const p of this.race.drivers?.people || []) if (p.car !== this.car && p.object.visible) { p.object.visible = false; this.hidden.push(p.object); }
  }
  // the frame just drawn, saved: the game look's few lines scaled up crisply to about 1080p or more (Sharp is already
  // full size). Must run right after the render, before the browser clears the canvas
  capture(src, crisp = true) {
    const w = src.width, h = src.height, k = Math.max(1, Math.round(1080 / h));
    const c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = !crisp; g.drawImage(src, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => {
      if (!b) return res(null);
      const url = URL.createObjectURL(b), d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      const a = document.createElement('a'); a.href = url;
      a.download = `San Velocita ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      res(url);
    }, 'image/png'));
  }
  leave() {
    if (!this.on) return;
    this.tok = (this.tok || 0) + 1; this.on = false;
    this.dropDriver(); this.showCockpit(true); this.showGrid(true);
    for (const o of this.hidden) o.visible = true; this.hidden = [];
    const cam = this.race.camera, s = this.saved;
    cam.position.copy(s.pos); cam.quaternion.copy(s.quat); cam.up.copy(s.up); cam.fov = s.fov; cam.updateProjectionMatrix();
    this.race = null; this.car = null;
  }
}
