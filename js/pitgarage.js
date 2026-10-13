// Pit garage: your team's box during practice and qualifying. A plain room for now (models/garage.glb replaces it if it
// exists: see loadRoom), your car in the bay beside the menu, a timing monitor on the wall showing the session live.
// The same room is your base in World Career (openHome): the camera looks over the desk, and sitting down at the
// computer pushes it into the CRT (setZoom) until the screen fills the view (js/computer.js draws what's on it).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { buildF1 } from './carmodel.js';
import { loadCharacters, makeCharacter } from './characters.js';
import { loadKit } from './garagekit.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const TYRE_CSS = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0', dirt: '#b8824a' };
// the room: x across (-W/2..W/2), z from the back wall (-D) to the door (0), the car in the middle facing the door
const W = 12, D = 14, H = 4.6, CAR_Z = -6.5;
const BULB_SCALE = 0.0006;
const ENGINE_REAR = new Set(['rs964', 'testarossa', 'custom', 'svgp']); // (cars with the engine behind the driver) // exported point / spot light intensity -> the game's (a 300 W Blender bulb ≈ 10)

// your own garage model (Blender -> models/garage.glb, metres, the door facing Blender -Y, the floor at Z = 0, the
// car's spot at the origin; see docs/GARAGE-MODEL.md for the named hooks). The single-file build carries it in
// window.__SVGP_GARAGE_GLB.
let roomLoad = null;
export function loadRoom() {
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
    this.defRoom = { kids: [...this.room.children], tyreBands: this.tyreBands, screen: this.screen, screenHit: this.screenHit }; // (see useDefault)
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
  useRoom(m, key = 'pit') {
    m.position.z = CAR_Z; // (the car's spot is the model's origin)
    m.updateMatrixWorld(true);
    const U = m.userData;
    if (!U.prepped) { // (once per model: it can come back, between the pit box and home)
      // the game's camera: GUIDE_GameView, wherever you put it in Blender (export with Cameras on)
      let cam = null;
      m.traverse(o => { if (!cam && o.isCamera && /^(GUIDE_GameView|GameView)/.test(o.name || (o.parent && o.parent.name) || '')) cam = o; });
      U.view = cam ? this.viewFrom(cam) : null;
      const drop = [];
      m.traverse(o => { if (o.isCamera || (o.name || '').startsWith('GUIDE')) drop.push(o); else if (o.isLight) U.lit = true; });
      for (const o of drop) o.removeFromParent(); // (GUIDE_ objects are modelling aids)
      // (Blender's exporter writes bulbs in physical units, ~54 per watt; the game's lights are tuned far lower)
      m.traverse(o => { if (o.isPointLight || o.isSpotLight) o.intensity *= BULB_SCALE; });
      // (for flickerOn: the lights and the fluorescent tubes' glowing meshes, each tube its own material to blink)
      U.bulbs = []; U.tubes = [];
      m.traverse(o => {
        if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight) { const n = o.name || (o.parent && o.parent.name) || '', t = /Tube_(\d+)/.exec(n); U.bulbs.push({ l: o, base: o.intensity, tube: t ? +t[1] : null }); }
        else if (o.isMesh && /^Tube_\d+/.test(o.name) && o.material && o.material.emissive) { o.material = o.material.clone(); U.tubes.push({ m: o.material, base: o.material.emissiveIntensity, tube: +/^Tube_(\d+)/.exec(o.name)[1] }); }
      });
      U.prepped = true;
    }
    this.shade(m);
    this.view = U.view; this.bulbs = U.bulbs || []; this.tubes = U.tubes || []; this.flick = null;
    // a model with its own lights is lit by them alone (plus a faint fill so the shadows aren't pitch black)
    for (const l of this.lights) l.visible = !U.lit;
    if (this.fill) { this.fill.removeFromParent(); this.fill = null; }
    if (U.lit) { this.fill = new THREE.HemisphereLight(0xc8d0ff, 0x202024, 0.12); this.scene.add(this.fill); }
    this.room.clear(); this.tyreBands = []; this.teamMats = []; this.screen = null; this.listHook = null; this.dropList();
    // glTF uvs are flipped vs canvas textures
    this.tvTex.flipY = false; this.tvTex.needsUpdate = true;
    this.bandTex.flipY = false; this.bandTex.needsUpdate = true;
    const crts = [];
    m.traverse(o => {
      if (!o.isMesh) return;
      const name = o.name || (o.parent && o.parent.name) || '';
      if (name.startsWith('PC_Screen')) { o.material = new THREE.MeshBasicMaterial({ map: this.pcTex(false), color: 0xdddddd }); this.screen = this.screenHit = o; return; }
      if (/^CrtMonitor/.test(name)) crts.push(o);
      if (name.startsWith('ListNote')) { this.listHook = o; o.visible = false; return; }
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
    this.room.add(m); this.custom = key;
    this.placeCar2();
    if (this.memLast) { this.memKey = null; this.setMemories(this.memLast); } // (placed against this room)
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

  // real shadows (the video options' Shadows): the room's spot lights cast them; everything below head height casts
  // (not the walls, floor or roof: a light above the roof line would be shut out), everything takes them, and the cars
  // and people cast too
  setShadows(on) { this.shadowsOn = on !== false; if (this.room.children[0]) this.shade(this.room.children[0]); for (const c of [this.car, this.car2]) if (c) this.shadeCar(c); }
  shade(m) {
    const on = this.shadowsOn !== false;
    m.updateMatrixWorld(true);
    m.traverse(o => {
      if (o.isSpotLight) {
        o.castShadow = on; o.shadow.mapSize.set(1024, 1024); o.shadow.bias = -0.0004; o.shadow.normalBias = 0.03;
        o.shadow.camera.near = 0.1; o.shadow.camera.far = 30; o.shadow.radius = 3;
      }
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(t => t && (t.transparent || t.isMeshBasicMaterial))) { o.castShadow = o.receiveShadow = false; return; }
      const b = new THREE.Box3().setFromObject(o), big = b.max.y - b.min.y > 3 || /^(Floor|Roof|Wall)/.test(o.name);
      o.receiveShadow = on; o.castShadow = on && !big;
    });
  }
  shadeCar(c) { const on = this.shadowsOn !== false; c.group.traverse(o => { if (o.isMesh) { const sh = o === c.shadow || (c.shadow && c.shadow.children.includes(o)); o.castShadow = on && !sh; o.receiveShadow = false; } }); }
  // back to the plain room (the garage you're going to has no model)
  useDefault() {
    if (!this.custom) return;
    const d = this.defRoom;
    this.room.clear(); this.room.add(...d.kids);
    this.tyreBands = d.tyreBands; this.teamMats = []; this.screen = d.screen; this.screenHit = d.screenHit; this.listHook = null; this.dropList();
    this.tvTex.flipY = true; this.tvTex.needsUpdate = true; this.bandTex.flipY = true; this.bandTex.needsUpdate = true;
    for (const l of this.lights) l.visible = true;
    if (this.fill) { this.fill.removeFromParent(); this.fill = null; }
    this.view = null; this.kit = null; this.custom = false; this.placeCar2();
    if (this.memLast) { this.memKey = null; this.setMemories(this.memLast); }
    if (this.team) this.setTeam(this.team);
    if (this.tyre) this.setTyre(this.tyre);
  }
  // the room for where you are: a race weekend's pit box (your models/garage.glb), or home in World Career (the kit for
  // your premises and what you've bought: js/garagekit.js; no kit, the pit box's model). home: { premises, stations }
  pickRoom(home) {
    const key = home ? `home:${home.premises}|${(home.stations || []).join(',')}` : 'pit';
    if (key === this.roomWant) return; this.roomWant = key;
    const get = home ? loadKit(home.premises, home.stations || []).then(k => k ? { m: k.group, kit: k } : loadRoom().then(m => ({ m, kit: null })))
      : loadRoom().then(m => ({ m, kit: null }));
    this.roomLoading = get.then(({ m, kit }) => {
      if (this.roomWant !== key) return;
      this.kit = kit;
      if (m) this.useRoom(m, key); else this.useDefault();
    });
  }
  // when the room you're going to is in (its shots are placed from what's in it)
  roomReady() { return this.roomLoading ? this.roomLoading.then(() => {}, () => {}) : Promise.resolve(); }

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

  // ---------- the list on the wall (World Career: js/thelist.js draws it) ----------
  // Taped to the wall above the desk: a ListNote plane in your model (any size: the sheet keeps its own shape, centred
  // on it), else found by looking straight back from just above the computer's screen to whatever wall is behind it.
  setList(canvas) {
    this.listCanvas = canvas;
    if (!this.listTex) { this.listTex = new THREE.CanvasTexture(canvas); this.listTex.colorSpace = THREE.SRGBColorSpace; this.listTex.anisotropy = 8; }
    else { this.listTex.image = canvas; this.listTex.needsUpdate = true; }
  }
  refreshList() { if (this.listTex) this.listTex.needsUpdate = true; }
  dropList() { if (this.listMesh) { this.listMesh.removeFromParent(); this.listMesh.geometry.dispose(); this.listMesh = null; } }
  placeList() {
    this.dropList();
    const f = this.screenFrame(); if (!this.listTex || (!f && !this.listHook)) return;
    const Wl = 0.3, Hl = Wl * 1088 / 768; // (the sheet: js/thelist.js LIST_W x LIST_H)
    let p, n;
    if (this.listHook) {
      this.listHook.updateWorldMatrix(true, false);
      p = new THREE.Box3().setFromObject(this.listHook).getCenter(new THREE.Vector3());
      const nA = this.listHook.geometry.attributes.normal; n = new THREE.Vector3(nA.getX(0), nA.getY(0), nA.getZ(0)).transformDirection(this.listHook.matrixWorld);
    } else {
      n = new THREE.Vector3(f.n.x, 0, f.n.z).normalize();
      const start = f.c.clone().addScaledVector(new THREE.Vector3(0, 1, 0), f.h / 2 + 0.16 + Hl / 2).addScaledVector(n, 0.35);
      this.room.updateMatrixWorld(true);
      const rc = new THREE.Raycaster(start, n.clone().negate(), 0, 4);
      const hit = rc.intersectObject(this.room, true).find(h => h.object !== this.screen && h.object.visible && h.face);
      if (hit) {
        const hn = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); if (hn.dot(n) < 0) hn.negate();
        if (Math.abs(hn.y) < 0.5) n = hn.setY(0).normalize();
        p = hit.point.clone().addScaledVector(n, 0.012);
      } else p = start.clone().addScaledVector(n, -0.9);
    }
    if (!this.listHook) p.addScaledVector(new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize(), -0.08); // (a little to the right, clear of anything hung beside the desk)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Wl, Hl), new THREE.MeshBasicMaterial({ map: this.listTex, color: 0xc9c3b6, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.copy(p); m.lookAt(p.clone().add(n)); m.rotateZ(-0.03);
    this.scene.add(m); this.listMesh = m; this.listRoom = this.custom;
  }
  // the sheet in the world: centre, facing, size (like screenFrame)
  listFrame() {
    if (this.listCanvas && (!this.listMesh || this.listRoom !== this.custom)) this.placeList();
    const m = this.listMesh; if (!m) return null;
    m.updateWorldMatrix(true, false);
    const c = m.getWorldPosition(new THREE.Vector3()), n = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), side = new THREE.Vector3().crossVectors(n, up).normalize();
    return { c, n, up, side, w: m.geometry.parameters.width, h: m.geometry.parameters.height };
  }
  // the camera at the list: the sheet fills most of the height, right of the menu
  listPose(f, aspect) {
    const fov = 30, tn = Math.tan(fov * Math.PI / 360), d = Math.max(f.h / 2 / 0.86 / tn, f.w / 2 / 0.5 / (tn * aspect));
    return { pos: f.c.clone().addScaledVector(f.n, d), at: f.c.clone(), fov, shift: 0.15 };
  }
  listAnchor() { const f = this.listFrame(); return f ? this.toScreen(f.c.clone().addScaledVector(f.up, f.h / 2 + 0.01)) : null; }
  hitList(cx, cy) {
    if (!this.listMesh) return false;
    const box = this.r.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((cx - box.left) / box.width * 2 - 1, -(cy - box.top) / box.height * 2 + 1), this.camera);
    return rc.intersectObject(this.listMesh, false).length > 0;
  }

  // ---------- the bank's final notice, on the desk beside the computer (World Career) ----------
  setNotice(on) {
    if (!on) { if (this.noticeMesh) this.noticeMesh.visible = false; this.noticeOn = false; return; }
    this.noticeOn = true;
    if (!this.noticeMesh || this.noticeRoom !== this.custom) this.placeNotice();
    if (this.noticeMesh) this.noticeMesh.visible = this.mode === 'home';
  }
  placeNotice() {
    if (this.noticeMesh) { this.noticeMesh.removeFromParent(); this.noticeMesh.geometry.dispose(); this.noticeMesh = null; }
    const f = this.screenFrame(); if (!f) return;
    if (!this.noticeTex) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 340; const g = c.getContext('2d');
      g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 256, 340);
      g.fillStyle = '#1f3c7a'; g.fillRect(0, 0, 256, 34); g.fillStyle = '#fff'; g.font = 'bold 15px Arial'; g.fillText('FIRST VELOCITA BANK', 16, 23);
      g.fillStyle = '#9a9a9a'; for (let y = 70; y < 320; y += 16) g.fillRect(18, y, 150 + ((y * 37) % 60), 3);
      g.save(); g.translate(128, 190); g.rotate(-0.32); g.strokeStyle = '#c8141c'; g.lineWidth = 6; g.strokeRect(-104, -30, 208, 60);
      g.fillStyle = '#c8141c'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINAL NOTICE', 0, 2); g.restore();
      this.noticeTex = new THREE.CanvasTexture(c); this.noticeTex.colorSpace = THREE.SRGBColorSpace;
    }
    // (in front of the screen and off to one side, on whatever's under it: the desk)
    const n = new THREE.Vector3(f.n.x, 0, f.n.z).normalize(), side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    const start = f.c.clone().addScaledVector(n, 0.3).addScaledVector(side, -(f.w / 2 + 0.05)); start.y += 0.4;
    this.room.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(start, new THREE.Vector3(0, -1, 0), 0, 3).intersectObject(this.room, true).find(h => h.object !== this.screen && h.object.visible);
    const p = hit ? hit.point.clone() : start.clone().setY(f.c.y - f.h / 2 - 0.05); p.y += 0.004;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshBasicMaterial({ map: this.noticeTex, color: 0xd6d2c8, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(n.x, n.z) + 0.25; m.rotation.x = -Math.PI / 2;
    m.position.copy(p); this.scene.add(m); this.noticeMesh = m; this.noticeRoom = this.custom;
  }
  noticeAnchor() { const m = this.noticeMesh; return m && m.visible ? this.toScreen(m.position.clone().add(new THREE.Vector3(0, 0.06, 0))) : null; }
  hitNotice(cx, cy) {
    const m = this.noticeMesh; if (!m || !m.visible) return false;
    const box = this.r.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((cx - box.left) / box.width * 2 - 1, -(cy - box.top) / box.height * 2 + 1), this.camera);
    return rc.intersectObject(m, false).length > 0;
  }

  // ---------- the garage remembers (World Career): Mum's clippings beside the list, trophies and the bills on the desk,
  // the mattress on the floor. m: wcareer.js memoriesOf (rebuilt only when it changes) ----------
  setMemories(m) {
    this.memLast = m;
    const key = JSON.stringify(m || null); if (key === this.memKey && this.memRoom === this.custom && this.memGroup && this.memGroup.parent) return;
    this.memKey = key; this.memRoom = this.custom;
    if (this.memGroup) { this.memGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); this.memGroup.removeFromParent(); }
    const G = this.memGroup = new THREE.Group(); this.scene.add(G); G.visible = this.mode === 'home';
    if (!m) return;
    this.room.updateMatrixWorld(true);
    const solid = (h) => h.object !== this.screen && h.object.visible && !G.children.includes(h.object) && h.object !== this.listMesh && h.object !== this.noticeMesh;
    const lf = this.listFrame(), f = this.screenFrame();
    // clippings: on the list's wall, in columns beside it, all on whichever side has the wall for them (a shelf or a
    // poster in the way on one side: the other)
    if (lf && m.clips.length) {
      const spot = (c, i, sgn) => {
        const big = c.kind === 'title', W = big ? 0.17 : 0.13, H = W * 0.8;
        const col = Math.floor(i / 3), row = i % 3, off = lf.w / 2 + 0.03 + W / 2 + col * 0.16, dy = lf.h / 2 - 0.08 - row * 0.15 - (col % 2) * 0.05;
        const want = lf.c.clone().addScaledVector(lf.side, off * sgn).addScaledVector(lf.up, dy);
        const hit = new THREE.Raycaster(want.clone().addScaledVector(lf.n, 0.3), lf.n.clone().negate(), 0, 0.45).intersectObject(this.room, true).find(solid);
        return hit && Math.abs(hit.distance - 0.3) <= 0.03 && /wall/i.test(hit.object.name || '') ? { hit, W, H } : hit && Math.abs(hit.distance - 0.3) <= 0.03 ? { hit, W, H, other: true } : null;
      };
      const score = (sgn) => m.clips.reduce((a, c, i) => { const s = spot(c, i, sgn); return a + (s ? (s.other ? 1 : 2) : 0); }, 0);
      const sgn = score(-1) >= score(1) ? -1 : 1;
      m.clips.forEach((c, i) => {
        const s = spot(c, i, sgn); if (!s) return;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.W, s.H), new THREE.MeshBasicMaterial({ map: this.clipTex(c), color: 0xc9c3b6, polygonOffset: true, polygonOffsetFactor: -2 }));
        mesh.position.copy(s.hit.point).addScaledVector(lf.n, 0.008 + i * 0.0005); mesh.lookAt(mesh.position.clone().add(lf.n)); mesh.rotateZ(((i * 37) % 9 - 4) * 0.012);
        G.add(mesh);
      });
    }
    if (f) {
      const n = new THREE.Vector3(f.n.x, 0, f.n.z).normalize(), side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize(), deskY = f.c.y - f.h / 2;
      const onDesk = (p) => { const s0 = p.clone(); s0.y += 0.5; const h = new THREE.Raycaster(s0, new THREE.Vector3(0, -1, 0), 0, 1.2).intersectObject(this.room, true).find(solid); return h && h.point.y > deskY - 0.35 && h.point.y < deskY + 0.2 ? h.point : null; };
      // trophies: in a row on the other side of the screen from the notice, the big ones at the back
      m.trophies.forEach((k, i) => {
        const p = onDesk(f.c.clone().addScaledVector(n, 0.16 + (i % 2) * 0.09).addScaledVector(side, f.w / 2 + 0.08 + Math.floor(i / 2) * 0.09)); if (!p) return;
        const t = this.trophy(k); t.position.copy(p); t.rotation.y = Math.atan2(n.x, n.z) + i * 0.4; G.add(t);
      });
      // the bills: a pile by the notice, more of them the worse it gets
      const bp = m.bills ? onDesk(f.c.clone().addScaledVector(n, 0.3).addScaledVector(side, -(f.w / 2 + 0.22))) : null;
      for (let i = 0; bp && i < m.bills; i++) {
        const e = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09), new THREE.MeshBasicMaterial({ map: this.billTex(i % 3 === 1), color: 0xd6d2c8, polygonOffset: true, polygonOffsetFactor: -2 }));
        e.rotation.order = 'YXZ'; e.rotation.y = Math.atan2(n.x, n.z) + ((i * 53) % 11 - 5) * 0.09; e.rotation.x = -Math.PI / 2;
        e.position.copy(bp).add(new THREE.Vector3(((i * 29) % 7 - 3) * 0.008, 0.003 + i * 0.004, ((i * 17) % 5 - 2) * 0.008)); G.add(e);
      }
    }
    // the mattress: on the floor, somewhere clear (a few spots tried; none clear, no mattress). Off: it lay in the way of
    // walking round the garage, and it's out of the room (Mum still hears you're sleeping there)
    if (m.mattress && SHOW_MATTRESS) {
      const C = this.carCentre(), d = this.doorDir(), sd = new THREE.Vector3(-d.z, 0, d.x);
      for (const [a, b] of [[-2, 1.2], [-1.6, 1.2], [1.6, -2.4], [-3.5, -3]]) { // (beside the car, in view of the hub camera first) // (in view of the hub camera first)
        const p = C.clone().addScaledVector(sd, a).addScaledVector(d, b); p.y = 1.2;
        const fl = new THREE.Raycaster(p, new THREE.Vector3(0, -1, 0), 0, 2).intersectObject(this.room, true).find(solid);
        if (!fl || fl.point.y > 0.08) continue; // (something's there: not the floor)
        const at = fl.point.clone(); at.y += 0.25;
        const clear = [[d, 0.98], [d.clone().negate(), 0.98], [sd, 0.46], [sd.clone().negate(), 0.46]].every(([v, r]) => !new THREE.Raycaster(at, v, 0, r).intersectObject(this.room, true).find(solid));
        if (!clear) continue;
        G.add(this.mattress(fl.point, Math.atan2(-d.z, d.x))); break; // (lengthways, alongside the car)
      }
    }
  }
  // a clipping from the hometown paper (Mum's note on it)
  clipTex(c) {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#ece6d6'; g.beginPath(); g.moveTo(4, 6); for (let x = 4; x <= 316; x += 12) g.lineTo(x, 4 + ((x * 7) % 5)); g.lineTo(316, 250); for (let x = 316; x >= 4; x -= 12) g.lineTo(x, 250 - ((x * 3) % 5)); g.closePath(); g.fill();
    g.fillStyle = '#555'; g.font = 'italic 13px Georgia, serif'; g.fillText(c.paper, 16, 26); g.fillText(`${c.track ? c.track + ', ' : ''}${c.y}`, 316 - 16 - g.measureText(`${c.track ? c.track + ', ' : ''}${c.y}`).width, 26);
    g.fillStyle = '#222'; g.fillRect(16, 33, 288, 1.5);
    g.font = `bold ${c.kind === 'title' ? 30 : 26}px Georgia, "Times New Roman", serif`; let y = 68, line = '';
    for (const wd of String(c.head).split(' ')) { if (g.measureText(line + wd).width > 288) { g.fillText(line, 16, y); y += 30; line = ''; } line += wd + ' '; }
    g.fillText(line, 16, y); y += 18;
    g.fillStyle = '#9a958a'; for (; y < 200; y += 11) g.fillRect(16, y, 288 - ((y * 13) % 50), 3);
    g.save(); g.translate(206, 226); g.rotate(-0.08); g.fillStyle = '#1d3f9a'; g.font = '600 21px "Bradley Hand", "Segoe Print", cursive'; g.fillText(c.note || '', -g.measureText(c.note || '').width / 2, 0); g.restore();
    g.fillStyle = '#c8141c'; g.beginPath(); g.arc(160, 12, 6, 0, Math.PI * 2); g.fill(); // (the pin)
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  // an envelope: a window, an address, sometimes a red stamp
  billTex(red) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144; const g = cv.getContext('2d');
    g.fillStyle = '#f1ede2'; g.fillRect(0, 0, 256, 144); g.fillStyle = '#d9d4c6'; g.fillRect(24, 52, 120, 40);
    g.fillStyle = '#888'; for (let y = 60; y < 90; y += 9) g.fillRect(30, y, 90, 3);
    if (red) { g.save(); g.translate(190, 40); g.rotate(-0.25); g.strokeStyle = '#c8141c'; g.lineWidth = 4; g.strokeRect(-46, -14, 92, 28); g.fillStyle = '#c8141c'; g.font = 'bold 16px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OVERDUE', 0, 1); g.restore(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // a cup: a title is the big one (gold), a win gold, a podium bronze
  trophy(kind) {
    const s0 = kind === 'title' ? 1.6 : kind === 'win' ? 1 : 0.8, col = kind === 'pod' ? 0xb07040 : 0xd8a830;
    const pts = [[0, 0], [0.032, 0], [0.032, 0.012], [0.02, 0.016], [0.008, 0.022], [0.007, 0.06], [0.012, 0.066], [0.034, 0.08], [0.04, 0.12], [0.036, 0.12], [0.03, 0.084], [0.0, 0.072]].map(([x, y]) => new THREE.Vector2(x * s0, y * s0));
    const t = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshPhongMaterial({ color: col, emissive: kind === 'pod' ? 0x2a1608 : 0x3a2a08, specular: 0xffffff, shininess: 70, side: THREE.DoubleSide }));
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s0, 0.016 * s0, 0.06 * s0), new THREE.MeshLambertMaterial({ color: 0x2a1a10 })); base.position.y = -0.008 * s0;
    const g = new THREE.Group(); t.position.y = 0.0; g.add(base, t); g.position.y = 0.016 * s0; const o = new THREE.Group(); g.position.y += 0.002; o.add(g); return o;
  }
  // the mattress: on the floor, a pillow, a sleeping bag thrown over it
  mattress(at, yaw) {
    const o = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.85), new THREE.MeshLambertMaterial({ color: 0xb9b2a0 })); bed.position.y = 0.08;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.78), new THREE.MeshLambertMaterial({ color: 0x2e4a6a })); bag.position.set(0.3, 0.185, 0.02); bag.rotation.y = 0.05;
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.55), new THREE.MeshLambertMaterial({ color: 0xe6e2d8 })); pil.position.set(-0.75, 0.2, 0); pil.rotation.y = -0.08;
    o.add(bed, bag, pil); o.position.copy(at); o.rotation.y = yaw; return o;
  }

  // ---------- the ending (World Career: js/ending.js): a scripted camera, the room at night, the way out ----------
  // a photo of the room from a pose ({ pos, at, fov }): rendered once, off screen, with the room's own lights; a canvas
  // (the ending's SVList ad: your car, as you'd snap it on your phone before you list it)
  snapshot(pose, W = 500, H = 360) {
    const cam = new THREE.PerspectiveCamera(pose.fov || 50, W / H, 0.05, 120); cam.position.copy(pose.pos); cam.lookAt(pose.at);
    if (pose.roll) cam.rotateZ(pose.roll);
    const rt = new THREE.WebGLRenderTarget(W, H); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const r = this.r, prev = r.getRenderTarget();
    r.setRenderTarget(rt); r.clear(); r.render(this.scene, cam); r.setRenderTarget(prev);
    const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // (the GPU's rows are bottom-up)
    g.putImageData(img, 0, 0);
    return c;
  }
  // the car (or its empty bay) from the front three-quarter, at phone height
  carSnapPose() {
    const C = this.carCentre(), d = this.doorDir(), side = new THREE.Vector3(-d.z, 0, d.x);
    return { pos: C.clone().addScaledVector(d, 3.4).addScaledVector(side, 2.3).setY(1.35), at: C.clone().setY(0.45), fov: 52, roll: -0.035 };
  }
  // cine(pose, secs): move the camera to { pos, at, fov, shift } over secs (0: a cut)
  cine(pose, secs = 0) {
    this.from = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, shift: this.shiftNow ?? 0.2 };
    this.prevShot = this.shot; this.shot = 'cine'; this.cinePose = pose; this.cineT = secs; this.blendK = secs ? 0 : 1;
    if (!secs) { this.camera.position.copy(pose.pos); this.camera.lookAt(pose.at); this.camera.fov = pose.fov; this.shiftNow = pose.shift ?? 0; } // (a cut: there now)
  }
  // the way out: the direction from the car to the door (the room is open that way: the side the default shot faces)
  doorDir() { return new THREE.Vector3(0, 0, 1); }
  // how far the car can roll towards the door before it meets a wall (or 9 m: no wall)
  doorRoom() {
    this.room.updateMatrixWorld(true);
    const from = this.carCentre(), hit = new THREE.Raycaster(from, this.doorDir(), 0, 12).intersectObject(this.room, true).find(h => h.object.visible);
    return hit ? Math.max(0, hit.distance - 2.6) : 9;
  }
  // night: the room's own lights way down, and headlights from outside the door (a truck, backed up to it)
  setNight(on) {
    if (on === !!this.night) return;
    if (on) {
      const keep = [];
      this.scene.traverse(o => { if (o.isLight) { keep.push([o, o.intensity]); o.intensity *= 0.28; } });
      // (the truck's headlights, out past the open side of the room, shining in low)
      const C = this.carCentre(), d = this.doorDir(), out = C.clone().addScaledVector(d, 9.5);
      const lights = [-0.75, 0.75].map(x => { const l = new THREE.SpotLight(0xfff1d0, 15, 30, 0.42, 0.55, 1.1); l.position.copy(out).add(new THREE.Vector3(x, 0.72, 0)); l.target.position.copy(C).addScaledVector(d, -2).add(new THREE.Vector3(x * 0.4, 0.3, 0)); this.scene.add(l, l.target); return l; });
      const glow = new THREE.Group();
      this.night = { keep, lights, glow };
    } else {
      for (const [o, i] of this.night.keep) o.intensity = i;
      for (const l of this.night.lights) { l.removeFromParent(); l.target.removeFromParent(); }
      this.night.glow.removeFromParent(); this.night.glow.traverse(o => o.geometry && o.geometry.dispose());
      this.night = null;
    }
  }

  // ---------- your base (World Career) ----------
  // Three shots, blended between (about three quarters of a second): 'room' (the garage: your car, the desk behind
  // it), 'seat' (sat at the computer: the screen fills the view) and 'car' (at the car, looking at one part).
  // home: { premises, stations, car2 } (World Career: what's yours, js/garagekit.js; car2 the second car's config, or null)
  openHome(cfg, team, home = {}) {
    this.open(cfg, team, 'medium', null, home); this.mode = 'home'; this.setCar2(home.car2 || null);
    this.shot = 'room'; this.shotPart = null; this.blendK = 1; this.from = null;
  }
  setView(shot, part = null) {
    if (shot === this.shot && part === this.shotPart) return;
    this.from = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, shift: this.shiftNow ?? 0.2 };
    this.prevShot = this.shot; this.shot = shot; this.shotPart = part; this.blendK = 0;
  }
  // build every shader the room needs now (its lights, shadows, you), not on the frames as things first show
  compile() { try { this.scene.updateMatrixWorld(true); this.r.compile(this.scene, this.camera); } catch (e) { console.warn('garage compile', e); } }
  // the lights come on as you come in: everything's off, then the switch (the lamps and work lights) and the
  // fluorescent tubes striking one by one, each with a few uneven blinks before it holds. sfx(kind) plays the clicks
  flickerOn(sfx = null) {
    if (!this.bulbs || !this.bulbs.length) return;
    let seed = 1 + Math.floor(Math.random() * 2147483000); const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tubes = [...new Set(this.bulbs.filter(b => b.tube !== null).map(b => b.tube))].sort((a, b) => a - b);
    const sw = 0.45, plan = {};    // (tube -> [[time, level], ...]: the level from that time on)
    tubes.forEach((k, i) => {
      let t = sw + 0.15 + i * 0.42 + r() * 0.25; const ev = [];
      const n = 2 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) { ev.push([t, 0.5 + r() * 0.5]); t += 0.03 + r() * 0.07; ev.push([t, 0]); t += 0.05 + r() * (j === n - 1 ? 0.35 : 0.15); }
      ev.push([t, 1]); plan[k] = ev;
    });
    this.flick = { t: 0, sw, plan, end: Math.max(sw, ...Object.values(plan).map(e => e[e.length - 1][0])) + 0.1, sfx, heard: new Set() };
    this.flickTick(0);
  }
  flickTick(dt) {
    const f = this.flick; if (!f) return;
    f.t += dt;
    const at = (k) => { if (k === null) return f.t >= f.sw ? 1 : 0; let v = 0; for (const [t, l] of f.plan[k] || []) if (f.t >= t) v = l; return v; };
    for (const b of this.bulbs) b.l.intensity = b.base * at(b.tube);
    for (const m of this.tubes) m.m.emissiveIntensity = m.base * at(m.tube);
    // (the sounds: the switch, then each blink of each tube)
    if (f.sfx) {
      if (f.t >= f.sw && !f.heard.has('sw')) { f.heard.add('sw'); f.sfx('switch'); }
      for (const [k, ev] of Object.entries(f.plan)) ev.forEach(([t, l], i) => { const id = k + ':' + i; if (l > 0 && f.t >= t && !f.heard.has(id)) { f.heard.add(id); if (f.t - t < 0.1) f.sfx('tube', l); } });
    }
    if (f.t >= f.end) { for (const b of this.bulbs) b.l.intensity = b.base; for (const m of this.tubes) m.m.emissiveIntensity = m.base; this.flick = null; }
  }
  setZoom(on) { this.setView(on ? 'seat' : 'room'); }
  // back to the room's shot from wherever the camera is now (after walking round)
  toRoom() { this.from = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, shift: this.shiftNow ?? 0 }; this.prevShot = this.shot; this.shot = 'room'; this.shotPart = null; this.blendK = 0; }
  get settled() { return this.blendK >= 1; }
  get seated() { return this.shot === 'seat' && this.settled; }
  get atRoom() { return this.shot === 'room' && this.settled; }
  get atList() { return this.shot === 'list' && this.settled; }
  get nearScreen() { return this.shot === 'seat' || (this.prevShot === 'seat' && !this.settled); }
  get zoomK() { return this.shot === 'seat' ? this.blendK : this.prevShot === 'seat' ? 1 - this.blendK : 0; }
  carCentre() { return new THREE.Vector3(0, 0.55, CAR_Z); }
  // look round the car (dyaw, dpitch rad; zoom × the distance); the first call starts from where the camera is now.
  // look(null) hands the camera back to the room's own shot
  look(dy, dp = 0, zoom = 1) {
    if (dy === null) { this.orbit = null; return; }
    if (!this.orbit) { const C = this.carCentre(), v = this.camera.position.clone().sub(C), r = Math.max(2.5, v.length());
      this.orbit = { yaw: Math.atan2(v.x, v.z), pitch: Math.asin(Math.max(-0.2, Math.min(0.9, v.y / r))), dist: Math.min(7.4, r) }; }
    const o = this.orbit; o.yaw += dy; o.pitch = Math.max(0.02, Math.min(1.1, o.pitch + dp)); o.dist = Math.max(2.6, Math.min(7.4, o.dist * zoom));
  }
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
    // (shift 0: the car sits between the menu on the left and its performance panel on the right)
    if (!part) return { pos: C.clone().add(new THREE.Vector3(3.6, 1.7, 3.8)), at: C.clone(), fov: 46, shift: 0 };
    const A = this.partAnchor(part) || C;
    const dir = new THREE.Vector3(A.x - C.x, 0, A.z - C.z); if (dir.lengthSq() < 0.04) dir.set(1, 0, 0.3); dir.normalize();
    const pos = A.clone().addScaledVector(dir, 3.6).add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 1.6);
    return { pos, at: A.clone().lerp(C, 0.35), fov: 46, shift: 0 };
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
  // at a race weekend's desk: the glass a little smaller than when you sit down at home, and over to the right (the
  // garage menu is on the left)
  setDesk(on) { if (!!on === !!this.desk) return; this.desk = !!on; this.from = on ? { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, shift: this.shiftNow ?? this.shift ?? 0 } : null; this.blendK = on ? 0 : 1; }
  get atDesk() { return !!this.desk && this.blendK >= 1; }
  deskPose(f, aspect) {
    const fov = 28, tn = Math.tan(fov * Math.PI / 360), fill = 0.74;
    const d = Math.max(f.h / 2 / fill / tn, f.w / 2 / (tn * aspect * 0.58));
    const drop = 0.1 * d * tn; // (the glass a little low: the session clock is top right)
    return { pos: f.c.clone().addScaledVector(f.n, d).addScaledVector(f.up, drop), at: f.c.clone().addScaledVector(f.up, drop), fov, shift: 0.165 };
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
      g.fillText(!isFinite(r.best) ? '-' : r.pos === 1 || r.gap == null ? fmt(r.best) : '+' + r.gap.toFixed(3), 498, y);
    });
    this.tvTex.needsUpdate = true;
  }

  // bent / missing wings show on the car in the bay until the crew fixes them
  setDamage(d) { if (this.car && this.car.setDamage && d) this.car.setDamage(d); }
  open(cfg, team, tyre, dmg, home = null) {
    this.active = true; this.t = 0; this.mode = 'pit'; this.shot = 'room'; this.prevShot = null; this.blendK = 1; this.from = null;
    this.pickRoom(home); // (your own garage model, or home's kit)
    if (!home) this.setCar2(null);
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
    this.car = buildF1(cfg, { texSize: 2048 }); this.cfgChassis = cfg.chassis || 'custom'; this.car.group.visible = !this.carOff; this.shadeCar(this.car);
    if (this.active && this.mode === 'home') { this.car.group.position.set(0, 0, CAR_Z); this.car.group.add(this.car.shadow); this.car.shadow.position.y = 0.01; this.bay.add(this.car.group); }
  }
  // an empty bay (World Career: the car's been sold, or burned)
  showCar(on) { this.carOff = !on; if (this.car) this.car.group.visible = on; if (this.car2) this.car2.group.visible = on; }
  // car two, in the kit's second bay (BAY_2) at home; null: none (a room without a second bay doesn't show it)
  setCar2(cfg) {
    const key = cfg ? JSON.stringify(cfg) : null;
    if (key !== this.car2Key) {
      this.car2Key = key;
      if (this.car2) { this.car2.group.removeFromParent(); this.car2.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      this.car2 = cfg ? buildF1(cfg, { texSize: 1024 }) : null;
      if (this.car2) { this.car2.group.add(this.car2.shadow); this.car2.shadow.position.y = 0.01; this.shadeCar(this.car2); }
    }
    this.placeCar2();
  }
  placeCar2() {
    const c = this.car2, bay = this.kit && this.custom && this.kit.bays[1]; if (!c) return;
    if (!bay) { c.group.removeFromParent(); return; }
    this.room.updateMatrixWorld(true);
    bay.getWorldPosition(c.group.position).setY(0); bay.getWorldQuaternion(c.group.quaternion);
    c.group.visible = !this.carOff; this.bay.add(c.group);
  }
  // people in the room (your teammate): [{ key, livery, face, clip }] (js/drivers.js dresses them). They stand behind
  // the car's right side, turned to the camera, helmets off; the same list again changes nothing
  setPeople(list = []) {
    const key = list.map(p => p.key).join('|');
    if (key === this.peopleKey) return; this.peopleKey = key;
    for (const ch of this.people || []) ch.dispose();
    this.people = [];
    if (!list.length) return;
    loadCharacters().then(ok => {
      if (!ok || this.peopleKey !== key) return;
      list.forEach((p, k) => {
        const ch = makeCharacter({ look: 'racer', clip: p.clip || 'idle_look', livery: p.livery, face: p.face, helmet: false, seed: k * 41 + 3 });
        ch.object.position.set(2.5 + k * 0.9, 0, CAR_Z - 1.2 - k * 0.5); ch.faced = false; ch.slot = k;
        this.bay.add(ch.object); this.people.push(ch);
      });
    });
  }
  close() { this.desk = false; if (this.night) this.setNight(false); this.cinePose = null; this.carOff = false; if (this.car) this.car.group.visible = true; this.active = false; this.mode = 'pit'; this.shot = 'room'; this.prevShot = null; this.blendK = 1; this.from = null; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.listMesh) this.listMesh.visible = this.mode === 'home'; // (only at home: not in a race weekend's pit box)
    if (this.memGroup) this.memGroup.visible = this.mode === 'home';
    if (this.noticeMesh) { if (this.noticeOn && this.noticeRoom !== this.custom) this.placeNotice(); this.noticeMesh.visible = this.noticeOn && this.mode === 'home'; }
    for (const ch of this.people || []) {
      // (turned to the camera once it's settled: a little to one side, not straight down the lens)
      if (!ch.faced && this.settled) {
        // at home: between the car and the desk, off to the left of the line between them (in the shot, beside the car)
        const f = this.mode === 'home' ? this.screenFrame() : null;
        if (f) { const C = this.carCentre(), Dk = f.c, v = new THREE.Vector3(Dk.x - C.x, 0, Dk.z - C.z).normalize(), side = new THREE.Vector3(-v.z, 0, v.x);
          ch.object.position.copy(C).lerp(new THREE.Vector3(Dk.x, 0, Dk.z), 0.5).addScaledVector(side, -2.2 - ch.slot * 0.9); ch.object.position.y = 0; }
        const c = this.camera.position, o = ch.object.position; ch.object.rotation.y = Math.atan2(c.x - o.x, c.z - o.z) - 0.35; ch.faced = true;
      }
      ch.update(dt);
    }
    this.flickTick(dt);
    // walking round (js/garagewalk.js): you and the camera behind you
    if (this.walker && this.walker.active) {
      this.walker.update(dt); this.shiftNow = this.walker.shift || 0;
      this.blendK = 1; this.prevShot = this.shot; // (the walk has the camera: no blend in progress, not on the way back from the computer, whose sharp full-res view would stay on)
      for (const c of [this.car, this.car2]) if (c && c.group.parent) c.animate({ steer: 0, spin: 0, heave: 0, pitch: 0, roll: 0 });
      return;
    }
    if (this.mode === 'home') {
      // the shot we're going to, blended in from wherever the camera was
      const f = this.screenFrame(), el = this.r.domElement;
      const lf = this.listCanvas ? this.listFrame() : null;
      const b = this.shot === 'cine' && this.cinePose ? this.cinePose : this.shot === 'seat' && f ? this.seatPose(f, el.width / el.height) : this.shot === 'list' && lf ? this.listPose(lf, el.width / el.height) : this.shot === 'car' ? this.carPose(this.shotPart) : this.roomPose(f, this.t);
      const look = (p) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, p.at, new THREE.Vector3(0, 1, 0)));
      this.blendK = Math.min(1, this.blendK + dt / (this.shot === 'cine' ? this.cineT || 1e-6 : 0.75));
      const k = this.blendK * this.blendK * (3 - 2 * this.blendK), a = this.from || { pos: b.pos, quat: look(b), fov: b.fov, shift: b.shift };
      this.camera.position.lerpVectors(a.pos, b.pos, k);
      this.camera.quaternion.copy(a.quat).slerp(look(b), k);
      this.camera.fov = a.fov + (b.fov - a.fov) * k;
      this.shiftNow = a.shift + (b.shift - a.shift) * k;
      // (you, sat at the computer after walking up to it: gone halfway in, as the camera comes over your head)
      if (this.parked) { this.parked.object.visible = this.zoomK < 0.5; if (this.parked.object.visible && this.parked.me) this.parked.me.update(dt); } // (still idling in the chair)
      if (this.car) this.car.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6) * 0.003, pitch: 0, roll: 0 });
      if (this.car2 && this.car2.group.parent) this.car2.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6 + 2) * 0.003, pitch: 0, roll: 0 });
      return;
    }
    // a race weekend at the desk (World Career): the computer's screen to the right of the menu, the Race Weekend app on it
    if (this.desk) {
      const f = this.screenFrame(), el = this.r.domElement;
      if (f) {
        const b = this.deskPose(f, el.width / el.height), look = (p) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, p.at, new THREE.Vector3(0, 1, 0)));
        this.blendK = Math.min(1, this.blendK + dt / 0.75);
        const k = this.blendK * this.blendK * (3 - 2 * this.blendK), a = this.from || { pos: b.pos, quat: look(b), fov: b.fov, shift: b.shift };
        this.camera.position.lerpVectors(a.pos, b.pos, k); this.camera.quaternion.copy(a.quat).slerp(look(b), k);
        this.camera.fov = a.fov + (b.fov - a.fov) * k; this.shiftNow = a.shift + (b.shift - a.shift) * k;
        return;
      }
    }
    this.shiftNow = this.shift;
    // looking round the car yourself (the Tuning screen: drag, wheel, right stick): an orbit round it, kept in the room
    if (this.orbit) {
      const o = this.orbit, C = this.carCentre();
      const p = new THREE.Vector3(C.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, C.y + Math.sin(o.pitch) * o.dist, C.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
      p.x = Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, p.x)); p.z = Math.max(-D + 0.6, Math.min(-0.4, p.z)); p.y = Math.max(0.35, Math.min(H - 0.4, p.y));
      this.camera.position.lerp(p, Math.min(1, dt * 10)); this.camera.lookAt(C); this.camera.fov = 40;
      if (this.car) this.car.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6) * 0.003, pitch: 0, roll: 0 });
      return;
    }
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
const SHOW_MATTRESS = false;
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); }
