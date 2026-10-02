// Pit garage: your team's box during practice and qualifying. A plain room for now (models/garage.glb replaces it if it
// exists: see loadRoom), your car in the bay beside the menu, a timing monitor on the wall showing the session live.
// The same room is your base in World Career (openHome): the camera looks over the desk, and sitting down at the
// computer pushes it into the CRT (setZoom) until the screen fills the view (js/computer.js draws what's on it).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { buildF1 } from './carmodel.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const TYRE_CSS = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0' };
// the room: x across (-W/2..W/2), z from the back wall (-D) to the door (0), the car in the middle facing the door
const W = 12, D = 14, H = 4.6, CAR_Z = -6.5;
const BULB_SCALE = 0.0006;
const ENGINE_REAR = new Set(['rs964', 'testarossa', 'custom', 'svgp']); // (cars with the engine behind the driver) // exported point / spot light intensity -> the game's (a 300 W Blender bulb ≈ 10)

// your own garage model (Blender -> models/garage.glb, metres, the door facing Blender -Y, the floor at Z = 0, the
// car's spot at the origin; see docs/GARAGE-MODEL.md for the named hooks). The single-file build carries it in
// window.__SVGP_GARAGE_GLB.
let roomLoad = null;
function loadRoom() {
  if (roomLoad) return roomLoad;
  const url = (typeof window !== 'undefined' && window.__SVGP_GARAGE_GLB) || 'models/garage.glb';
  // (serve.py answers /__exists quietly; anywhere else a missing file is just a 404 once)
  const exists = () => fetch('__exists?p=' + encodeURIComponent(url)).then(r => r.ok ? r.json().then(j => j.ok) : fetch(url, { method: 'HEAD' }).then(h => h.ok), () => false);
  const local = typeof location !== 'undefined' && location.protocol === 'file:'; // (the single-file build: it'd be embedded)
  roomLoad = (url.startsWith('data:') ? Promise.resolve(true) : local ? Promise.resolve(false) : exists())
    .then(ok => ok ? new GLTFLoader().loadAsync(url).then(g => g.scene, () => null) : null);
  return roomLoad;
}

export class PitGarage {
  constructor(renderer, post) {
    this.r = renderer; this.post = post;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);
    this.room = new THREE.Group(); this.scene.add(this.room);
    this.bay = new THREE.Group(); this.scene.add(this.bay);
    this.t = 0; this.car = null; this.active = false;
    this.shift = 0.2; // the car sits to the right of the menu
    this.mode = 'pit'; this.shot = 'room'; this.blendK = 1; this.screen = null; this.pcTexes = [];
    // lights: the ceiling panels + daylight through the door
    const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x3a3a40, 0.9);
    const key = new THREE.DirectionalLight(0xfff4e6, 1.1); key.position.set(-3, 8, 4);
    const door = new THREE.DirectionalLight(0xcfe0ff, 0.7); door.position.set(0, 3, 12);
    const back = new THREE.PointLight(0xffe2b0, 0.6, 14); back.position.set(0, 3.6, -8);
    this.lights = [hemi, key, door, back]; this.scene.add(...this.lights);
    this.buildRoom();
  }

  // ---------- the default room ----------
  buildRoom() {
    const R = this.room;
    const lam = (color, map) => new THREE.MeshLambertMaterial({ color, map: map || null });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); R.add(m); return m; };
    // floor: grey epoxy, the painted bay around the car
    const fc = document.createElement('canvas'); fc.width = 256; fc.height = 384;
    const g = fc.getContext('2d');
    g.fillStyle = '#5b5f68'; g.fillRect(0, 0, 256, 384);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 384, 2, 2); }
    this.floorCanvas = fc;
    this.floorTex = new THREE.CanvasTexture(fc); this.floorTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshPhongMaterial({ map: this.floorTex, specular: 0x333333, shininess: 40 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -D / 2; R.add(floor);
    // walls + ceiling
    const wallMat = lam(0xc9ccd2);
    box(W, H, 0.2, wallMat, 0, H / 2, -D - 0.1);
    for (const s of [-1, 1]) box(0.2, H, D, wallMat, s * (W / 2 + 0.1), H / 2, -D / 2);
    box(W + 0.4, 0.2, D, lam(0x2a2d34), 0, H + 0.1, -D / 2);
    // the back wall's team band (painted when a car arrives: see setTeam)
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 128;
    this.bandCanvas = bc; this.bandTex = new THREE.CanvasTexture(bc); this.bandTex.colorSpace = THREE.SRGBColorSpace;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 1.6), new THREE.MeshBasicMaterial({ map: this.bandTex }));
    band.position.set(0, 2.5, -D + 0.01); R.add(band);
    // pegboards + tool cabinets along the side walls
    const pc = document.createElement('canvas'); pc.width = pc.height = 64; const pg = pc.getContext('2d');
    pg.fillStyle = '#8e939c'; pg.fillRect(0, 0, 64, 64); pg.fillStyle = '#50545c'; for (let y = 4; y < 64; y += 8) for (let x = 4; x < 64; x += 8) pg.fillRect(x, y, 2, 2);
    const pt = new THREE.CanvasTexture(pc); pt.wrapS = pt.wrapT = THREE.RepeatWrapping; pt.repeat.set(6, 2); pt.colorSpace = THREE.SRGBColorSpace;
    const cabMat = lam(0xb8221c), drawerMat = lam(0x1c1c20), topMat = lam(0x3a3d44);
    for (const s of [-1, 1]) {
      const peg = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), lam(0xffffff, pt));
      peg.position.set(s * (W / 2 - 0.01), 2.1, -D + 4); peg.rotation.y = -s * Math.PI / 2; R.add(peg);
      for (let k = 0; k < 3; k++) {
        const z = -D + 2.2 + k * 1.3;
        box(0.6, 1.0, 1.2, cabMat, s * (W / 2 - 0.35), 0.5, z);
        box(0.62, 0.05, 1.22, topMat, s * (W / 2 - 0.35), 1.02, z);
        for (let d = 0; d < 4; d++) box(0.02, 0.03, 1.0, drawerMat, s * (W / 2 - 0.66), 0.2 + d * 0.22, z);
      }
    }
    // tyre stacks at the back (the compound you'll go out on: see setTyre)
    this.tyreBands = [];
    const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 18), bandGeo = new THREE.CylinderGeometry(0.365, 0.365, 0.04, 18);
    const rubber = lam(0x141416);
    [[-3.2, -D + 1.2], [-2.3, -D + 1.1], [2.3, -D + 1.1], [3.2, -D + 1.2]].forEach(([x, z]) => {
      for (let k = 0; k < 4; k++) {
        const t = new THREE.Mesh(tyreGeo, rubber); t.position.set(x, 0.15 + k * 0.31, z); R.add(t);
        const b = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({ color: 0xf2d22a })); b.position.set(x, 0.15 + k * 0.31, z); R.add(b); this.tyreBands.push(b);
      }
    });
    // ceiling light panels
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) box(1.6, 0.05, 0.45, lightMat, s * 2.2, H - 0.03, -2 - k * 3.2);
    // the timing monitor on the left wall (see setTiming)
    const tc = document.createElement('canvas'); tc.width = 512; tc.height = 320;
    this.tvCanvas = tc; this.tvTex = new THREE.CanvasTexture(tc); this.tvTex.colorSpace = THREE.SRGBColorSpace;
    box(0.08, 1.05, 1.65, lam(0x111114), -W / 2 + 0.06, 2.6, -4.2);
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.97), new THREE.MeshBasicMaterial({ map: this.tvTex }));
    tv.position.set(-W / 2 + 0.11, 2.6, -4.2); tv.rotation.y = Math.PI / 2; R.add(tv);
    // the door: open onto a bright pit lane
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), lam(0x6c7078)); lane.rotation.x = -Math.PI / 2; lane.position.set(0, -0.01, 8); R.add(lane);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ color: 0xdfe8f4 })); sky.position.set(0, 6, 16); sky.rotation.y = Math.PI; R.add(sky);
    for (const s of [-1, 1]) box(0.4, H, 0.4, lam(0x2a2d34), s * (W / 2 - 0.1), H / 2, 0);
    box(W, 0.5, 0.4, lam(0x2a2d34), 0, H - 0.25, 0);
    // a desk with a CRT by the door (the computer: see attachScreen)
    const deskX = -W / 2 + 0.45, deskZ = -2.4;
    box(0.8, 0.74, 1.6, lam(0x6b4a2e), deskX, 0.37, deskZ);
    const crt = box(0.46, 0.42, 0.5, lam(0xd8d2bc), deskX - 0.05, 0.95, deskZ);
    box(0.3, 0.04, 0.3, lam(0xd8d2bc), deskX - 0.05, 0.76, deskZ);
    this.attachScreen(R, 0.38, 0.3, new THREE.Vector3(deskX + 0.181, 0.96, deskZ), Math.PI / 2);
    this.screenHit = crt;
    // a trolley jack and a wheel gun by the car
    box(0.5, 0.18, 1.2, lam(0xe0b020), 2.4, 0.09, CAR_Z - 3.6);
    box(0.12, 0.12, 0.5, lam(0x303035), -1.9, 0.06, CAR_Z + 2.8);
  }

  // swap the default room for your model (and its lights, if it has any), hooking up its named parts:
  //   GUIDE_GameView (camera) the shot, other GUIDE* (objects) left out, TV_Screen* (object) the live timing, TeamBand* (object) the team banner,
  //   materials TeamMain* / TeamAccent* the team's colours, TyreBand* the compound you'll go out on
  useRoom(m) {
    // the game's camera: GUIDE_GameView, wherever you put it in Blender (export with Cameras on)
    m.position.z = CAR_Z; // (the car's spot is the model's origin)
    m.updateMatrixWorld(true);
    let cam = null;
    m.traverse(o => { if (!cam && o.isCamera && /^(GUIDE_GameView|GameView)/.test(o.name || (o.parent && o.parent.name) || '')) cam = o; });
    this.view = cam ? this.viewFrom(cam) : null;
    const drop = []; let lit = false;
    m.traverse(o => { if (o.isCamera || (o.name || '').startsWith('GUIDE')) drop.push(o); else if (o.isLight) lit = true; });
    for (const o of drop) o.removeFromParent(); // (GUIDE_ objects are modelling aids)
    // a model with its own lights is lit by them alone (plus a faint fill so the shadows aren't pitch black)
    // (Blender's exporter writes bulbs in physical units, ~54 per watt; the game's lights are tuned far lower)
    m.traverse(o => { if (o.isPointLight || o.isSpotLight) o.intensity *= BULB_SCALE; });
    if (lit) { for (const l of this.lights) l.visible = false; this.scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x202024, 0.12)); }
    this.room.clear(); this.tyreBands = []; this.teamMats = []; this.screen = null;
    // glTF uvs are flipped vs canvas textures
    this.tvTex.flipY = false; this.tvTex.needsUpdate = true;
    this.bandTex.flipY = false; this.bandTex.needsUpdate = true;
    const crts = [];
    m.traverse(o => {
      if (!o.isMesh) return;
      const name = o.name || (o.parent && o.parent.name) || '';
      if (name.startsWith('PC_Screen')) { o.material = new THREE.MeshBasicMaterial({ map: this.pcTex(false), color: 0xdddddd }); this.screen = this.screenHit = o; return; }
      if (/^CrtMonitor/.test(name)) crts.push(o);
      if (name.startsWith('TV_Screen')) { o.material = new THREE.MeshBasicMaterial({ map: this.tvTex }); return; }
      if (name.startsWith('TeamBand')) { o.material = new THREE.MeshLambertMaterial({ map: this.bandTex }); return; } // (painted on, so it takes the room's light)
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        const n = mat.name || '';
        if (n.startsWith('TyreBand')) this.tyreBands.push({ material: mat });
        else if (n.startsWith('TeamMain')) this.teamMats.push([mat, 'main']);
        else if (n.startsWith('TeamAccent')) this.teamMats.push([mat, 'accent']);
      }
    });
    // no PC_Screen: a CRT from the asset pack gets a screen laid over its glass
    if (!this.screen && crts.length) this.attachScreen(crts[0], 0.391, 0.34, new THREE.Vector3(-0.0015, 0.30, 0.2245), 0);
    this.room.add(m); this.custom = true;
    if (this.team) this.setTeam(this.team);
    if (this.tyre) this.setTyre(this.tyre);
  }

  // your camera's shot, drifting a little around the point it looks at (above the car)
  viewFrom(cam) {
    const pos = cam.getWorldPosition(new THREE.Vector3()), quat = cam.getWorldQuaternion(new THREE.Quaternion());
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat), h = f.x * f.x + f.z * f.z;
    const s = h > 1e-4 ? Math.max(0.5, -(pos.x * f.x + (pos.z - CAR_Z) * f.z) / h) : 5; // nearest the car's spot
    return { pos, quat, pivot: pos.clone().addScaledVector(f, s), fov: cam.fov };
  }

  // ---------- the computer's screen ----------
  // the canvas the computer draws its idle desktop on (js/computer.js); glTF meshes want it unflipped
  setScreen(canvas) { this.pcCanvas = canvas; for (const t of this.pcTexes) { t.image = canvas; t.needsUpdate = true; } }
  pcTex(flip = true) {
    const t = new THREE.CanvasTexture(this.pcCanvas || document.createElement('canvas'));
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = flip; t.anisotropy = 4; this.pcTexes.push(t); return t;
  }
  refreshScreen() { for (const t of this.pcTexes) t.needsUpdate = true; }
  attachScreen(parent, w, h, pos, rotY) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.pcTex(true), color: 0xdddddd, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.position.copy(pos); mesh.rotation.y = rotY; parent.add(mesh); this.screen = mesh;
    this.screenHit = parent.isMesh ? parent : mesh; // (what a click on the monitor hits)
  }
  // the screen in the world: its centre, the way it faces, its size and corners
  screenFrame() {
    const m = this.screen; if (!m) return null;
    m.updateWorldMatrix(true, false);
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, pts = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(m.matrixWorld));
    const c = new THREE.Vector3(); pts.forEach(p => c.add(p)); c.multiplyScalar(1 / pts.length);
    const nAttr = m.geometry.attributes.normal;
    const n = new THREE.Vector3(nAttr.getX(0), nAttr.getY(0), nAttr.getZ(0)).transformDirection(m.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), side = new THREE.Vector3().crossVectors(n, up).normalize();
    let w = 0, h = 0; for (const p of pts) { const d = p.clone().sub(c); w = Math.max(w, Math.abs(d.dot(side)) * 2); h = Math.max(h, Math.abs(d.dot(up)) * 2); }
    return { c, n, up, side, w, h };
  }
  // where the glass is on screen (CSS pixels), for laying the computer's DOM over it
  screenRect() {
    const f = this.screenFrame(); if (!f) return null;
    const box = this.r.domElement.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
      const p = f.c.clone().addScaledVector(f.side, sx * f.w).addScaledVector(f.up, sy * f.h).project(this.camera);
      const x = box.left + (p.x + 1) / 2 * box.width, y = box.top + (1 - p.y) / 2 * box.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // a point just above the middle of the monitor (CSS pixels), for the hub's tag; null when it's behind the camera
  screenAnchor() {
    const m = this.screenHit || this.screen; if (!m) return null;
    const bb = new THREE.Box3().setFromObject(m);
    return this.toScreen(new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2)); // (the dot touches its top)
  }
  // did a click (CSS pixels) land on the monitor?
  hitScreen(cx, cy) {
    if (!this.screen) return false;
    const box = this.r.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((cx - box.left) / box.width * 2 - 1, -(cy - box.top) / box.height * 2 + 1), this.camera);
    return rc.intersectObject(this.screenHit || this.screen, true).length > 0;
  }

  // ---------- your base (World Career) ----------
  // Three shots, blended between (about three quarters of a second): 'room' (the garage: your car, the desk behind
  // it), 'seat' (sat at the computer: the screen fills the view) and 'car' (at the car, looking at one part).
  openHome(cfg, team) {
    this.open(cfg, team, 'medium', null); this.mode = 'home';
    this.shot = 'room'; this.shotPart = null; this.blendK = 1; this.from = null;
  }
  setView(shot, part = null) {
    if (shot === this.shot && part === this.shotPart) return;
    this.from = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, shift: this.shiftNow ?? 0.2 };
    this.prevShot = this.shot; this.shot = shot; this.shotPart = part; this.blendK = 0;
  }
  setZoom(on) { this.setView(on ? 'seat' : 'room'); }
  get settled() { return this.blendK >= 1; }
  get seated() { return this.shot === 'seat' && this.settled; }
  get atRoom() { return this.shot === 'room' && this.settled; }
  get nearScreen() { return this.shot === 'seat' || (this.prevShot === 'seat' && !this.settled); }
  get zoomK() { return this.shot === 'seat' ? this.blendK : this.prevShot === 'seat' ? 1 - this.blendK : 0; }
  carCentre() { return new THREE.Vector3(0, 0.55, CAR_Z); }
  roomPose(f, t) {
    // from in front of the car, looking past it to the desk: the car in the middle, the computer behind
    const C = this.carCentre(), D = f ? f.c.clone() : C.clone().add(new THREE.Vector3(-3, 0.6, -3));
    const v = new THREE.Vector3(C.x - D.x, 0, C.z - D.z); if (v.lengthSq() < 0.01) v.set(0.6, 0, 0.8); v.normalize();
    const at = C.clone().lerp(D, 0.38); at.y = 0.95;
    const side = new THREE.Vector3(-v.z, 0, v.x);
    const pos = at.clone().addScaledVector(v, 8.2).addScaledVector(side, Math.sin(t * 0.1) * 0.35); pos.y = 2.15 + Math.sin(t * 0.18) * 0.05;
    return { pos, at, fov: 48, shift: 0.18 };
  }
  // at the car: looking at a part (or the whole car)
  carPose(part) {
    const C = this.carCentre();
    if (!part) return { pos: C.clone().add(new THREE.Vector3(3.6, 1.7, 3.8)), at: C.clone(), fov: 46, shift: 0.18 };
    const A = this.partAnchor(part) || C;
    const dir = new THREE.Vector3(A.x - C.x, 0, A.z - C.z); if (dir.lengthSq() < 0.04) dir.set(1, 0, 0.3); dir.normalize();
    const pos = A.clone().addScaledVector(dir, 3.6).add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 1.6);
    return { pos, at: A.clone().lerp(C, 0.35), fov: 46, shift: 0.18 };
  }
  // where each part is on the car (world space), from the car's size; the engine where this car keeps it
  partAnchor(part) {
    if (!this.car) return null;
    const bb = this.carBox(), L = bb.max.z - bb.min.z, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const rear = ENGINE_REAR.has(this.cfgChassis), H = bb.max.y - bb.min.y, y = (k) => bb.min.y + k * H;
    const formula = this.cfgChassis === 'custom' || this.cfgChassis === 'svgp';
    // (heights as fractions of the car's: a road car's bonnet and boot sit at about 60-70%, its roof is the top)
    const at = {
      engine: rear ? [cx, y(formula ? 0.75 : 0.66), bb.min.z + 0.2 * L] : [cx, y(0.6), bb.max.z - 0.2 * L],
      gearbox: [cx, y(0.3), rear ? bb.min.z + 0.34 * L : cz],
      brakes: [bb.max.x - 0.05, y(0.3), bb.max.z - 0.17 * L],
      suspension: [bb.max.x - 0.05, y(0.36), bb.min.z + 0.18 * L],
      aero: formula ? [cx, y(0.95), bb.min.z + 0.05 * L] : [cx, y(0.7), bb.min.z + 0.07 * L],
      chassis: [bb.max.x - 0.02, y(0.45), cz],    }[part];
    return at ? new THREE.Vector3(...at) : null;
  }
  // the car's body (its floor shadow is a big plane under it: left out)
  carBox() {
    const bb = new THREE.Box3(), sh = this.car.shadow;
    this.car.group.updateMatrixWorld(true);
    this.car.group.traverse(o => { if (o.isMesh && o !== sh && !(sh && sh.children && sh.children.includes(o))) bb.expandByObject(o, true); });
    return bb.isEmpty() ? new THREE.Box3().setFromObject(this.car.group) : bb;
  }
  // the car's tag in the room: on the side of the body nearest the camera, low (above the car, it would sit on the desk)
  carAnchor() {
    if (!this.car) return null;
    const bb = this.carBox(), c = this.camera.position;
    const x = Math.max(bb.min.x, Math.min(bb.max.x, c.x)), z = Math.max(bb.min.z, Math.min(bb.max.z, c.z));
    const mx = (bb.min.x + bb.max.x) / 2, mz = (bb.min.z + bb.max.z) / 2;
    return new THREE.Vector3(mx + (x - mx) * 0.7, bb.min.y + (bb.max.y - bb.min.y) * 0.62, mz + (z - mz) * 0.7);
  }
  // a point in the world on the screen (CSS pixels), or null behind the camera
  toScreen(p) {
    const v = p.clone().project(this.camera); if (v.z > 1) return null;
    const box = this.r.domElement.getBoundingClientRect();
    return { x: box.left + (v.x + 1) / 2 * box.width, y: box.top + (1 - v.y) / 2 * box.height };
  }
  // did a click land on the car?
  hitCar(cx, cy) {
    if (!this.car) return false;
    const box = this.r.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((cx - box.left) / box.width * 2 - 1, -(cy - box.top) / box.height * 2 + 1), this.camera);
    return rc.intersectObject(this.car.group, true).length > 0;
  }
  seatPose(f, aspect) {
    // the glass fills 84% of the height, nudged up clear of the button prompts along the bottom
    const fov = 28, tn = Math.tan(fov * Math.PI / 360), fill = 0.84, lift = 0.06;
    const d = Math.max(f.h / 2 / fill / tn, f.w / 2 / fill / (tn * aspect));
    const drop = lift * d * tn; // (moving the camera down moves the screen up the view)
    return { pos: f.c.clone().addScaledVector(f.n, d).addScaledVector(f.up, -drop), at: f.c.clone().addScaledVector(f.up, -drop), fov, shift: 0 };
  }

  // paint the floor bay + back wall in the team's colours
  setTeam(team) {
    this.team = team;
    for (const [mat, k] of this.teamMats || []) mat.color.set(k === 'main' ? team.main : (team.accent ?? 0xffffff));
    const g = this.floorCanvas.getContext('2d'), c = hex(team.main), a = hex(team.accent ?? 0xffffff);
    g.fillStyle = '#5b5f68'; g.fillRect(0, 0, 256, 384);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 384, 2, 2); }
    g.strokeStyle = '#f2c83a'; g.lineWidth = 5; g.strokeRect(48, 70, 160, 290);
    g.fillStyle = c; g.fillRect(0, 0, 256, 18); g.fillStyle = a; g.fillRect(0, 18, 256, 4);
    this.floorTex.needsUpdate = true;
    const b = this.bandCanvas.getContext('2d');
    const grd = b.createLinearGradient(0, 0, 512, 0); grd.addColorStop(0, c); grd.addColorStop(1, a);
    b.fillStyle = grd; b.fillRect(0, 0, 512, 128);
    b.fillStyle = 'rgba(0,0,0,.35)'; b.fillRect(0, 88, 512, 40);
    b.font = "56px Anton"; b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillStyle = '#fff'; b.strokeStyle = 'rgba(0,0,0,.6)'; b.lineWidth = 6;
    const name = (team.name || 'Your Team').toUpperCase();
    b.strokeText(name, 256, 48); b.fillText(name, 256, 48);
    b.font = "20px Anton"; b.fillStyle = 'rgba(255,255,255,.85)'; b.fillText('SAN VELOCITA GRAND PRIX', 256, 108);
    this.bandTex.needsUpdate = true;
  }
  setTyre(c) { this.tyre = c; for (const b of this.tyreBands) b.material.color.set(TYRE_CSS[c] || '#f2d22a'); }
  // the wall monitor: the session's timing screen
  setTiming(title, rows) {
    const g = this.tvCanvas.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#e8b13a'; g.font = "26px Anton"; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(title, 18, 26);
    g.font = "22px VT323";
    rows.slice(0, 10).forEach((r, k) => {
      const y = 62 + k * 25;
      if (r.isPlayer) { g.fillStyle = 'rgba(232,177,58,.25)'; g.fillRect(8, y - 12, 496, 24); }
      g.fillStyle = hex(r.color); g.fillRect(44, y - 9, 5, 18);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(String(r.pos).padStart(2, ' '), 14, y); g.fillText(r.name, 58, y);
      g.textAlign = 'right'; g.fillStyle = '#c6d4ea';
      g.fillText(!isFinite(r.best) ? '-' : r.pos === 1 ? fmt(r.best) : '+' + r.gap.toFixed(3), 498, y);
    });
    this.tvTex.needsUpdate = true;
  }

  // bent / missing wings show on the car in the bay until the crew fixes them
  setDamage(d) { if (this.car && this.car.setDamage && d) this.car.setDamage(d); }
  open(cfg, team, tyre, dmg) {
    this.active = true; this.t = 0; this.mode = 'pit'; this.shot = 'room'; this.prevShot = null; this.blendK = 1; this.from = null;
    // (your own garage model, the first time the garage opens)
    if (!this.custom) loadRoom().then(m => { if (m && !this.custom) this.useRoom(m); });
    this.setCar(cfg);
    this.car.group.position.set(0, 0, CAR_Z);
    this.car.group.add(this.car.shadow); this.car.shadow.position.y = 0.01;
    if (this.car.setCompound) this.car.setCompound(tyre);
    this.bay.add(this.car.group);
    this.setTeam(team); this.setTyre(tyre); this.setDamage(dmg);
  }
  // (a different car in the bay: the one you just bought)
  setCar(cfg) {
    if (this.car) { this.bay.remove(this.car.group); this.car.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.car = buildF1(cfg, { texSize: 1024 }); this.cfgChassis = cfg.chassis || 'custom';
    if (this.active && this.mode === 'home') { this.car.group.position.set(0, 0, CAR_Z); this.car.group.add(this.car.shadow); this.car.shadow.position.y = 0.01; this.bay.add(this.car.group); }
  }
  close() { this.active = false; this.mode = 'pit'; this.shot = 'room'; this.prevShot = null; this.blendK = 1; this.from = null; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.mode === 'home') {
      // the shot we're going to, blended in from wherever the camera was
      const f = this.screenFrame(), el = this.r.domElement;
      const b = this.shot === 'seat' && f ? this.seatPose(f, el.width / el.height) : this.shot === 'car' ? this.carPose(this.shotPart) : this.roomPose(f, this.t);
      const look = (p) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, p.at, new THREE.Vector3(0, 1, 0)));
      this.blendK = Math.min(1, this.blendK + dt / 0.75);
      const k = this.blendK * this.blendK * (3 - 2 * this.blendK), a = this.from || { pos: b.pos, quat: look(b), fov: b.fov, shift: b.shift };
      this.camera.position.lerpVectors(a.pos, b.pos, k);
      this.camera.quaternion.copy(a.quat).slerp(look(b), k);
      this.camera.fov = a.fov + (b.fov - a.fov) * k;
      this.shiftNow = a.shift + (b.shift - a.shift) * k;
      if (this.car) this.car.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6) * 0.003, pitch: 0, roll: 0 });
      return;
    }
    this.shiftNow = this.shift;
    if (this.view) {
      const v = this.view, yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.t * 0.12) * 0.05);
      this.camera.position.copy(v.pos).sub(v.pivot).applyQuaternion(yaw).add(v.pivot);
      this.camera.position.y += Math.sin(this.t * 0.2) * 0.04;
      this.camera.quaternion.copy(yaw).multiply(v.quat);
      this.camera.fov = v.fov;
      if (this.car) this.car.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6) * 0.003, pitch: 0, roll: 0 });
      return;
    }
    // a slow drift around the front three-quarter (staying inside the room)
    const a = 0.62 + Math.sin(this.t * 0.12) * 0.1, r = 7.4;
    const tgt = new THREE.Vector3(0, 0.5, CAR_Z);
    this.camera.position.set(tgt.x + Math.sin(a) * r, 2.0 + Math.sin(this.t * 0.2) * 0.1, tgt.z + Math.cos(a) * r);
    this.camera.lookAt(tgt);
    if (this.car) this.car.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6) * 0.003, pitch: 0, roll: 0 });
  }
  render() {
    const el = this.r.domElement;
    this.camera.aspect = el.width / el.height;
    this.camera.setViewOffset(el.width, el.height, -el.width * (this.shiftNow ?? this.shift), 0, el.width, el.height);
    this.camera.updateProjectionMatrix();
    this.post.render(this.scene, this.camera, { trails: 0, grade: [1.02, 1, 0.98] });
  }
}
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); }
