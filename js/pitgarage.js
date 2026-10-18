// Pit garage: your team's box during practice and qualifying. On a track with real garages (js/pitboxes.js) it's your
// box there, the session's world all round it (useTrack); elsewhere a room of its own (models/garage.glb if it exists:
// see loadRoom). Your car in the bay beside the menu, a timing monitor on the wall showing the session live.
// The same room is your base in World Career (openHome): the camera looks over the desk, and sitting down at the
// computer pushes it into the CRT (setZoom) until the screen fills the view (js/computer.js draws what's on it).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { buildF1 } from './carmodel.js';
import { loadCharacters, makeCharacter } from './characters.js';
import { loadKit } from './garagekit.js';
import { HomeCrew } from './homecrew.js';
import { BOX } from './pitboxes.js';
import { loadPitBox } from './pitbox.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const UP = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4(), _sc = new THREE.Vector3();
// a camera turned to look at a point, both in its parent's frame (Object3D.lookAt wants the point in the world's)
const aim = (cam, at) => cam.quaternion.setFromRotationMatrix(_m4.lookAt(cam.position, at, UP));
// the desk and what's on it, from models/garage.glb, for your box at the track (useTrack)
const DESK_PARTS = /^(Desk|Computer|CrtMonitor|Keyboard|Speaker|Lamp Desk|Mouse|disk|office_chair)/;
const TYRE_CSS = { soft: '#e0302a', medium: '#f2d22a', hard: '#f0f0f0', wet: '#3a8af0', dirt: '#b8824a' };
// the room: x across (-W/2..W/2), z from the back wall (-D) to the door (0), the car in the middle facing the door
const W = 12, D = 14, H = 4.6, CAR_Z = -6.5;
const BULB_SCALE = 0.0006;
const ENGINE_REAR = new Set(['rs964', 'rsr964', 'testarossa', 'custom', 'svgp']); // (cars with the engine behind the driver) // exported point / spot light intensity -> the game's (a 300 W Blender bulb ≈ 10)

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

// the tire stacks (setTyres): one lathed tire, shared, and a stripe in the compound's color on the top one
const COMPOUND_ORDER = ['soft', 'medium', 'hard', 'wet', 'dirt'];
const TYRE_STRIPE = { soft: 0xe0302a, medium: 0xf2d22a, hard: 0xf0f0f0, wet: 0x3a8af0, dirt: 0xb8824a };
const TYRE_RUBBER = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92, metalness: 0, flatShading: true, side: THREE.DoubleSide });
let TYRE_GEO = null;
function tyreGeo() {
  if (TYRE_GEO) return TYRE_GEO;
  const R = 0.3, r = 0.19, W = 0.22, e = 0.035;   // (a street tire, lying flat: 0.6 m across, 0.22 m wide)
  const prof = [[r, 0], [R - e, 0], [R, e], [R, W - e], [R - e, W], [r, W], [r, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  return (TYRE_GEO = { W, tyre: new THREE.LatheGeometry(prof, 14), stripe: new THREE.RingGeometry(0.235, 0.258, 14).rotateX(-Math.PI / 2).translate(0, W + 0.003, 0) });
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
    { this.memKey = null; this.setMemories(this.memLast || null); }   // (no career's memories: the cabinet still gets its note, the empty frames go) // (placed against this room)
    if (this.team) this.setTeam(this.team);
    if (this.tyre) this.setTyre(this.tyre);
    if (this.tyreStock) { this.tyreKey = null; this.setTyres(this.tyreStock); }
  }

  // your tires (World Career): one stack for each compound you have, its height the share of your sets (the most you
  // have of any is five high, the rest in proportion, at least one: how much, not the count), the compound's stripe on
  // top. A row along the kit's TIRES hook: the first stands on it, the rest along its +Y in Blender (-Z here). tyreArea
  // is the box they take (at least the first one's spot: the walk spot's still there to order from with none).
  // stock: { soft: 2, ... }, or null for none
  setTyres(stock) {
    this.tyreStock = stock;
    const hook = this.kit && this.kit.tires, key = hook && stock ? `${this.custom}|${COMPOUND_ORDER.map(c => stock[c] || 0).join(',')}` : null;
    if (key === this.tyreKey) return; this.tyreKey = key;
    if (this.tyreStacks) { this.tyreStacks.removeFromParent(); this.tyreStacks.traverse(o => { if (o.isMesh && o.material !== TYRE_RUBBER) o.material.dispose(); }); this.tyreStacks = null; }
    this.tyreArea = null; if (!key) return;
    const G = tyreGeo(), g = new THREE.Group(), have = COMPOUND_ORDER.filter(c => (stock[c] || 0) > 0), most = Math.max(1, ...have.map(c => stock[c]));
    let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    have.forEach((c, i) => {
      const n = Math.max(1, Math.round(5 * stock[c] / most));
      const st = new THREE.Group(); st.position.set(r() * 0.04, 0, -i * 0.66); st.rotation.y = r() * 2;
      for (let j = 0; j < n; j++) {
        const t = new THREE.Mesh(G.tyre, TYRE_RUBBER); t.position.set(r() * 0.02, j * G.W, r() * 0.02); st.add(t);
        if (j === n - 1) { const s = new THREE.Mesh(G.stripe, new THREE.MeshStandardMaterial({ color: TYRE_STRIPE[c], roughness: 0.6 })); s.position.copy(t.position); st.add(s); }
      }
      g.add(st);
    });
    g.traverse(o => { if (o.isMesh) { o.castShadow = this.shadowsOn !== false; o.receiveShadow = this.shadowsOn !== false; } });
    hook.add(g); this.tyreStacks = g; g.updateWorldMatrix(true, true);
    // (the box the walk spot uses: what's there, at least the first stack's spot)
    const a = new THREE.Box3().setFromObject(g), p = hook.getWorldPosition(new THREE.Vector3());
    a.union(new THREE.Box3(p.clone().add(new THREE.Vector3(-0.3, 0, -0.3)), p.clone().add(new THREE.Vector3(0.3, 4 * G.W, 0.3))));
    this.tyreArea = a;
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
    { this.memKey = null; this.setMemories(this.memLast || null); }   // (no career's memories: the cabinet still gets its note, the empty frames go)
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
      if (kit && kit.setBusy && this.crewWant) kit.setBusy(this.crewWant.busy); // (the stations in use, asked for before the room had loaded)
      if (m) this.useRoom(m, key); else this.useDefault();
    });
  }
  // ---------- at the track: your box on the pit lane ----------
  // A race weekend on a track with real garages (js/pitboxes.js): the room is your team's box there. The car, the desk
  // and the people go into the session's scene in the box's frame, laid out as this room's (x across, the door at
  // z = 0, the car at CAR_Z), and the camera goes with them, so every shot here is the same one; what's drawn is the
  // session's world (the pit lane, the crews, the weather), and the session's own camera follows ours (its shadows
  // and sky are round us). F: the box's frame (boxFrame). The box's lights and dressing are js/pitlife.js's
  // side: your car's side of the box (pitlife.js sideOf: 1 for a co-op guest, across from the host's)
  useTrack(sim, F, side = 0) {
    if (this.track && this.track.sim === sim && this.track.F === F && this.track.side === side) { sim.camHold = this.track.hold; return; }
    this.leaveTrack();
    const a = new THREE.Group(); a.name = 'PitGarage'; a.matrixAutoUpdate = false;
    // (x along the box's front, to your right stood in the door looking in; z out of the door; a rotation, never a
    // mirror: the box's own x runs the other way on some lanes)
    const o = F.P(0, 0, 0), x1 = F.P(1, 0, 0), X = new THREE.Vector3(x1[0] - o[0], 0, x1[2] - o[2]).normalize().multiplyScalar(F.mirror ? -1 : 1);
    a.matrix.makeBasis(X, UP, new THREE.Vector3(-F.n[0], 0, -F.n[1])).setPosition(o[0], o[1] + BOX.floor, o[2]);
    a.matrixWorldNeedsUpdate = true;
    sim.scene.add(a); a.add(this.room, this.bay, this.camera); a.updateMatrixWorld(true);
    this.track = { sim, F, a, half: F.wx, side };
    this.camera.near = 0.1; this.camera.far = Math.min(1500, sim.camera.far); this.camera.updateProjectionMatrix();
    sim.camHold = this.track.hold = (cam) => { this.camera.updateWorldMatrix(true, false); this.camera.matrixWorld.decompose(cam.position, cam.quaternion, _sc); cam.fov = this.camera.fov; cam.updateProjectionMatrix(); };
    this.roomWant = 'track'; this.custom = 'track'; this.view = null; this.kit = null; this.flick = null; this.bulbs = []; this.tubes = [];
    this.room.clear(); this.tyreBands = []; this.teamMats = []; this.screen = null; this.screenHit = null; this.listHook = null; this.dropList();
    // the wall's timing screen (js/pitboxes.js dressBox: high on the box's left wall by the door; or your model's
    // TIMING_SCREEN: js/pitbox.js) shows the session
    const s = F.mirror ? -1 : 1, tv = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.61), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    this.tvTex.flipY = true; this.tvTex.needsUpdate = true;
    tv.position.set(s * (-F.wx + 0.145), 3.075, -2.25); tv.rotation.y = s * Math.PI / 2; this.room.add(tv);
    // the desk: your model's (PLAYER_*: js/pitbox.js), else the one from the garage model (where it stands there,
    // from the car)
    this.roomLoading = Promise.all([loadRoom(), loadPitBox()]).then(([m, box]) => {
      if (!this.track || this.track.a !== a) return;
      const f = box && box.tvFrame(F);
      if (f) {
        tv.geometry.dispose(); tv.geometry = new THREE.PlaneGeometry(f.w, f.h);
        tv.position.copy(f.c).addScaledVector(f.n, 0.012); tv.position.y -= BOX.floor; tv.rotation.set(0, Math.atan2(f.n.x, f.n.z), 0);
      }
      // your model's box (js/pitbox.js): the car where it parks there, the computer's screen on PLAYER_COMPUTER's glass
      // (the box is the model's mirror image on some lanes: so is the glass, so its picture's turned back round)
      const sc = box && box.screen(F);
      if (sc) {
        const c = box.car(F); this.bay.position.set(s * c.x * (side ? -1 : 1), 0, -c.z - CAR_Z);
        const geo = sc.geo.clone();
        if (F.mirror) { const uv = geo.attributes.uv; if (uv) { for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); } }
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.pcTex(false), color: 0xdddddd, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(a.matrix).invert().multiply(sc.matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.userData.pcScreen = true; this.screen = mesh; this.screenHit = mesh;
        this.room.add(mesh); return;
      }
      const g = new THREE.Group(); g.position.z = CAR_Z;
      if (!m) { // (no model: the plain room's desk and CRT, where the model's stands)
        const lam = (color) => new THREE.MeshLambertMaterial({ color }), box = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); g.add(o); return o; };
        box(0.8, 0.74, 1.6, lam(0x6b4a2e), -3.5, 0.37, -3.85);
        const crt = box(0.46, 0.42, 0.5, lam(0xd8d2bc), -3.55, 0.95, -3.85); box(0.3, 0.04, 0.3, lam(0xd8d2bc), -3.55, 0.76, -3.85);
        this.attachScreen(g, 0.38, 0.3, new THREE.Vector3(-3.55 + 0.231, 0.96, -3.85), Math.PI / 2); this.screenHit = crt;
        this.room.add(g); this.shade(g); return;
      }
      for (const c of m.children) if (DESK_PARTS.test(c.name || '')) g.add(c.clone());
      const old = []; g.traverse(o => { if (o.userData.pcScreen) old.push(o); }); old.forEach(o => o.removeFromParent()); // (the room's own screen, if it's been used)
      let crt = null; g.traverse(o => { if (!crt && o.isMesh && /^CrtMonitor/.test(o.name || (o.parent && o.parent.name) || '')) crt = o; });
      if (crt) this.attachScreen(crt, 0.391, 0.34, new THREE.Vector3(-0.0015, 0.30, 0.2245), 0);
      this.room.add(g); this.shade(g);
    });
  }
  // back out of the track's scene (the session's over, or you're going home): the room, the car and the camera are
  // this scene's again
  leaveTrack() {
    const t = this.track; if (!t) return;
    if (t.sim.camHold) t.sim.camHold = null;
    this.room.clear(); this.screen = this.screenHit = null;
    this.scene.add(this.room, this.bay); this.camera.removeFromParent(); this.camera.far = 120; this.camera.updateProjectionMatrix();
    t.a.removeFromParent();
    this.track = null; this.roomWant = null; this.roomLoading = null; this.bay.position.set(0, 0, 0);
    this.custom = 'track'; // (an empty room: useDefault fills it again if there's no model to load)
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
    mesh.position.copy(pos); mesh.rotation.y = rotY; mesh.userData.pcScreen = true; parent.add(mesh); this.screen = mesh;
    this.screenHit = parent.isMesh ? parent : mesh; // (what a click on the monitor hits)
  }
  // the screen in the room: its centre, the way it faces, its size and corners (at the track, in the box's frame)
  screenFrame() {
    const m = this.screen; if (!m) return null;
    m.updateWorldMatrix(true, false);
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, pts = [], M = this.track ? new THREE.Matrix4().copy(this.track.a.matrixWorld).invert().multiply(m.matrixWorld) : m.matrixWorld;
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(M));
    const c = new THREE.Vector3(); pts.forEach(p => c.add(p)); c.multiplyScalar(1 / pts.length);
    const nAttr = m.geometry.attributes.normal;
    const n = new THREE.Vector3(nAttr.getX(0), nAttr.getY(0), nAttr.getZ(0)).transformDirection(M);
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
      const p = f.c.clone().addScaledVector(f.side, sx * f.w).addScaledVector(f.up, sy * f.h);
      if (this.track) p.applyMatrix4(this.track.a.matrixWorld); p.project(this.camera);
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
    if (this.memGroup) { this.memGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); for (const mt of [o.material].flat().filter(Boolean)) { if (mt.map) mt.map.dispose(); mt.dispose(); } }); this.memGroup.removeFromParent(); }
    const G = this.memGroup = new THREE.Group(); this.scene.add(G); G.visible = this.mode === 'home';
    const cabinet = this.fillHonors(G, m);   // (a premises with a trophy cabinet: the trophies go there, not on the desk)
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
      const sgn = score(-1) >= score(1) ? -1 : 1; this.clipSide = sgn;
      m.clips.forEach((c, i) => {
        const s = spot(c, i, sgn); if (!s) return;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.W, s.H), new THREE.MeshBasicMaterial({ map: this.clipTex(c), color: 0xc9c3b6, polygonOffset: true, polygonOffsetFactor: -2 }));
        mesh.position.copy(s.hit.point).addScaledVector(lf.n, 0.008 + i * 0.0005); mesh.lookAt(mesh.position.clone().add(lf.n)); mesh.rotateZ(((i * 37) % 9 - 4) * 0.012);
        G.add(mesh);
      });
    }
    // your racing license, on its lanyard: on the list's wall, the other side from the clippings
    if (lf && m.lic) this.hangLicense(G, m.lic, lf, m.clips.length ? -(this.clipSide || -1) : 1, solid);
    // the SVMA's pathway poster: the ladder, on a wall of its own
    this.posterFrame = null; this.posterMesh = null;
    if (m.ladder) this.hangPoster(G, m.ladder, lf, solid);
    if (f) {
      const n = new THREE.Vector3(f.n.x, 0, f.n.z).normalize(), side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize(), deskY = f.c.y - f.h / 2;
      const onDesk = (p) => { const s0 = p.clone(); s0.y += 0.5; const h = new THREE.Raycaster(s0, new THREE.Vector3(0, -1, 0), 0, 1.2).intersectObject(this.room, true).find(solid); return h && h.point.y > deskY - 0.35 && h.point.y < deskY + 0.2 ? h.point : null; };
      // trophies: in a row on the other side of the screen from the notice, the big ones at the back
      if (!cabinet) m.trophies.forEach((k, i) => {
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
  // the license: a pin in the wall beside the list, the lanyard hanging from it, the card at the bottom (tilted a touch).
  // sgn: which side of the list (falls back to the other if there's no wall there)
  hangLicense(G, L, lf, sgn, solid) {
    const W = 0.105, H = 0.15, drop = 0.11;
    for (const s of [sgn, -sgn]) {
      const pin = lf.c.clone().addScaledVector(lf.side, s * (lf.w / 2 + 0.03 + W / 2)).addScaledVector(lf.up, lf.h / 2 - 0.02);
      const hit = new THREE.Raycaster(pin.clone().addScaledVector(lf.n, 0.3), lf.n.clone().negate(), 0, 0.45).intersectObject(this.room, true).find(solid);
      if (!hit || Math.abs(hit.distance - 0.3) > 0.03) continue;
      // (the card's spot must be wall too: a shelf below the pin would cut through it)
      const low = new THREE.Raycaster(pin.clone().addScaledVector(lf.up, -drop - H).addScaledVector(lf.n, 0.3), lf.n.clone().negate(), 0, 0.45).intersectObject(this.room, true).find(solid);
      if (!low || Math.abs(low.distance - 0.3) > 0.03) continue;
      const P = hit.point.clone().addScaledVector(lf.n, 0.004), g = new THREE.Group(); g.position.copy(P); g.lookAt(P.clone().add(lf.n)); G.add(g);
      const tilt = 0.05 * s;
      const pinM = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc8141c, roughness: 0.4 })); g.add(pinM);
      // the lanyard: two straps from the pin to the card's top corners (the SVMA's navy, printed)
      const strap = new THREE.MeshBasicMaterial({ map: this.strapTex(), side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        const a = new THREE.Vector3(0, 0, 0.003), b = new THREE.Vector3(sx * W * 0.32 + Math.sin(tilt) * drop, -drop, 0.006), d = b.clone().sub(a);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.014, d.length()), strap); m.position.copy(a).add(b).multiplyScalar(0.5); m.rotation.z = Math.atan2(d.y, d.x) + Math.PI / 2; g.add(m);
      }
      // the card: laminated (a little gloss), a clip at the top
      const card = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.002), [0, 0, 0, 0, new THREE.MeshStandardMaterial({ map: this.licenseTex(L), roughness: 0.35, metalness: 0 }), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 })].map(x => x || new THREE.MeshStandardMaterial({ color: 0xdedad0 })));
      card.position.set(Math.sin(tilt) * drop, -drop - H / 2 + 0.004, 0.008); card.rotation.z = tilt; g.add(card);
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.006), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.7, roughness: 0.35 })); clip.position.set(card.position.x - Math.sin(tilt) * H / 2, -drop + 0.002, 0.009); clip.rotation.z = tilt; g.add(clip);
      this.licenseMesh = card;
      return;
    }
  }
  // the poster: on a clear stretch of wall away from the list (the walls round the car, tried in turn; along each a few
  // spots, every corner of the sheet on the wall). posterFrame (like listFrame) is what the camera and the walk spot use
  hangPoster(G, L, lf, solid) {
    const W = 0.62, H = 0.88, C = this.carCentre(), d = this.doorDir(), sd = new THREE.Vector3(-d.z, 0, d.x), Y = 1.48;
    const hang = (c, n) => {
      const t = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.posterTex(L), color: 0xd6d0c2, polygonOffset: true, polygonOffsetFactor: -2 }));
      mesh.position.copy(c).addScaledVector(n, 0.01); mesh.lookAt(mesh.position.clone().add(n)); G.add(mesh);
      // (four pins, one a little crooked)
      for (const [a, b] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const pin = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshStandardMaterial({ color: a + b === 0 ? 0x1d3f9a : 0xc8141c, roughness: 0.4 })); pin.position.copy(mesh.position).addScaledVector(t, a * (W / 2 - 0.02)).add(new THREE.Vector3(0, b * (H / 2 - 0.02), 0)).addScaledVector(n, 0.004); G.add(pin); }
      this.posterMesh = mesh; this.posterFrame = { c: mesh.position.clone(), n: n.clone(), up: new THREE.Vector3(0, 1, 0), side: t.clone().negate(), w: W, h: H };
    };
    // the room's own spot for it (a POSTER empty on the wall, facing out of it the way you face at SPAWN), if it has one
    let hook = null; this.room.traverse(o => { if (!hook && /^POSTER/.test(o.name || '')) hook = o; });
    if (hook) {
      hook.updateWorldMatrix(true, false);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(hook.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
      hang(hook.getWorldPosition(new THREE.Vector3()), n); return;
    }
    // (never on a door: a roll-up door isn't flat, and it opens)
    const door = (h) => { for (let o = h.object; o && o !== this.room; o = o.parent) if (/door/i.test(o.name || '')) return true; return false; };
    const wallAt = (from, dir, len = 9) => { const h = new THREE.Raycaster(from, dir, 0, len).intersectObject(this.room, true).find(solid); return h && !door(h) ? h : null; };
    for (const dir of [sd, sd.clone().negate(), d.clone().negate(), d]) {
      const o = C.clone(); o.y = Y; const h = wallAt(o, dir); if (!h || !h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); n.y = 0; if (n.lengthSq() < 0.5) continue; n.normalize(); if (n.dot(dir) > 0) n.negate();
      const t = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
      for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
        const c = h.point.clone().addScaledVector(t, off);
        if (lf && c.distanceTo(lf.c) < 1.3) continue; // (clear of the list, its clippings and the license)
        const ok = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => {
          const p = c.clone().addScaledVector(t, a * W * 0.48).add(new THREE.Vector3(0, b * H * 0.48, 0)).addScaledVector(n, 0.3);
          const x = wallAt(p, n.clone().negate(), 0.45); return x && Math.abs(x.distance - 0.3) < 0.03;
        });
        if (!ok) continue;
        hang(c, n); return;
      }
    }
  }
  // the SVMA's poster: the rungs bottom to top, each with the license it asks (the license card's colours), what
  // else it needs and a season's cost; your team's pin on yours, your finishes on the ones you've raced
  posterTex(L) {
    const cv = document.createElement('canvas'); cv.width = 1240; cv.height = 1760; const g = cv.getContext('2d'); g.scale(2, 2); // (drawn at 620 x 880; twice the pixels, for reading up close)
    const ink = '#1d1d22', F = (w, px) => `${w} ${px}px Arial, Helvetica, sans-serif`;
    g.fillStyle = '#efece3'; g.fillRect(0, 0, 620, 880);
    g.fillStyle = '#1a2a55'; g.fillRect(0, 0, 620, 128);
    g.fillStyle = '#fff'; g.font = F('bold', 54); g.fillText('SVMA', 30, 70); g.font = F('bold', 26); g.fillText('THE PATHWAY', 214, 62);
    g.font = F('', 16); g.fillStyle = '#c9d2ea'; g.fillText('San Velocita Motorsport Association: the sports car ladder', 30, 106);
    const rungs = L.rungs.slice().reverse(), top = 150, bottom = 742, rh = (bottom - top) / rungs.length;
    rungs.forEach((r, i) => {
      const y = top + i * rh, h = rh - 10, branch = r.path !== 'sportscar';
      g.fillStyle = r.you ? '#fff7d6' : r.soon ? '#e2dfd6' : '#f8f6f0'; g.fillRect(30, y, 560, h);
      g.strokeStyle = r.you ? '#c8141c' : '#b9b4a8'; g.lineWidth = r.you ? 4 : 1.5; g.strokeRect(30, y, 560, h);
      g.fillStyle = r.soon ? '#9a958a' : ink; g.font = F('bold', 15); g.fillText(`TIER ${r.tier}${branch ? ' \u00b7 FORMULA PATH' : ''}`, 44, y + 24);
      g.font = F('bold', 25); g.fillText(r.name.toUpperCase(), 44, y + 54);
      g.fillStyle = '#55524b';
      { const t = r.soon ? 'Not running yet.' : [r.cost ? `About $${Math.round(r.cost / 1000)}k a season to run a car` : '', r.needs.length ? `Needs ${r.needs.join(', ')}` : ''].filter(Boolean).join('  \u00b7  ');
        let px = 14; g.font = F('', px); while (g.measureText(t).width > 530 && px > 9) g.font = F('', --px); g.fillText(t, 44, y + 78); } // (a long line: smaller, never off the edge)
      if (r.licName) { g.fillStyle = r.licCol; g.fillRect(456, y + 10, 120, 30); g.fillStyle = r.lic === 0 ? ink : '#fff'; g.font = F('bold', 15); g.textAlign = 'center'; g.fillText(r.licName.toUpperCase(), 516, y + 31); g.textAlign = 'left'; }
      if (r.been.length) { const b = r.been.slice(-3).map(x => `${x.y} P${x.pos}`).join(', '); g.fillStyle = '#1d3f9a'; g.font = F('bold', 14); g.textAlign = 'right'; g.fillText(b, 576, y + h - 12); g.textAlign = 'left'; }
      if (r.you) { g.fillStyle = '#c8141c'; g.beginPath(); g.arc(18, y + h / 2, 11, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(18, y + h / 2, 4, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(440, y + 30); g.rotate(-0.05); g.fillStyle = '#c8141c'; g.font = '600 18px "Bradley Hand", "Segoe Print", cursive'; g.textAlign = 'right'; g.fillText('you are here', 0, 0); g.restore(); g.textAlign = 'left'; }
    });
    g.fillStyle = ink; g.font = F('bold', 15); g.fillText('HOW TO MOVE UP', 30, 772);
    g.font = F('', 14); const words = L.rule.split(' '); let line = '', y = 794;
    for (const wd of words) { if (g.measureText(line + wd).width > 560) { g.fillText(line, 30, y); y += 19; line = ''; } line += wd + ' '; } g.fillText(line, 30, y);
    g.fillStyle = '#8a867c'; g.font = F('', 11); g.fillText('The SVMA reserves the right to add rungs, remove rungs, and redefine the word "ladder".', 30, 862);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  strapTex() {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#1a2a55'; g.fillRect(0, 0, 32, 256); g.fillStyle = '#e8e8e8'; g.font = 'bold 15px Arial'; g.save(); g.translate(21, 0); g.rotate(Math.PI / 2);
    for (let y = 10; y < 256; y += 60) g.fillText('SVMA', y, 0); g.restore();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // the card: the SVMA's header in the grade's colour, a photo, your name and number, the grade in big letters, and
  // the stamps toward the next grade (filled for each clean race). The small print is the Association's
  licenseTex(L) {
    const cv = document.createElement('canvas'); cv.width = 420; cv.height = 600; const g = cv.getContext('2d');
    const ink = '#1d1d22', col = L.col, F = (w, px, fam = 'Arial, Helvetica, sans-serif') => `${w} ${px}px ${fam}`;
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 420, 600);
    g.fillStyle = col; g.fillRect(0, 0, 420, 112); g.fillRect(0, 586, 420, 14);
    g.fillStyle = L.g === 0 ? ink : '#fff'; g.font = F('bold', 15); g.fillText('SAN VELOCITA MOTORSPORT ASSOCIATION', 22, 62); // (below the clip)
    g.font = F('bold', 31); g.fillText('COMPETITION LICENSE', 22, 98);
    g.fillStyle = '#ccc8be'; g.fillRect(22, 136, 132, 164); // (the photo: you, in a helmet, like everyone)
    g.fillStyle = '#7d7a72'; g.beginPath(); g.arc(88, 210, 44, Math.PI, 0); g.lineTo(132, 252); g.lineTo(44, 252); g.closePath(); g.fill();
    g.fillStyle = '#3a3a40'; g.fillRect(52, 204, 72, 18); g.fillStyle = '#7d7a72'; g.fillRect(36, 262, 104, 38);
    g.fillStyle = ink; g.font = F('', 15); g.fillText('NAME', 174, 152); g.fillText('LICENSE NO.', 174, 214); g.fillText('ISSUED', 174, 270);
    const nm = String(L.holder || '').toUpperCase(); let px = 23; g.font = F('bold', px); while (g.measureText(nm).width > 228 && px > 12) g.font = F('bold', --px); g.fillText(nm, 174, 178); // (a long name: smaller, never cut)
    g.font = F('bold', 23); g.fillText(`SV-${L.no}`, 174, 240); g.fillText(String(L.since || ''), 174, 296);
    g.fillStyle = col; g.fillRect(22, 324, 376, 82); g.fillStyle = L.g === 0 ? ink : '#fff'; g.font = F('bold', 56); g.textAlign = 'center'; g.fillText(L.name.toUpperCase(), 210, 386); g.textAlign = 'left';
    if (L.next) {
      g.fillStyle = ink; g.font = F('bold', 15); g.fillText(`CLEAN RACES TO ${L.next.toUpperCase()}`, 22, 438);
      const n = L.need, bw = Math.min(70, (376 - (n - 1) * 10) / n);
      for (let i = 0; i < n; i++) {
        const x = 22 + i * (bw + 10); g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(x, 452, bw, 52);
        if (i < L.c) { g.save(); g.translate(x + bw / 2, 478); g.rotate(-0.25 + (i % 3) * 0.17); g.strokeStyle = '#1d3f9a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.stroke();
          g.fillStyle = '#1d3f9a'; g.font = F('bold', 13); g.textAlign = 'center'; g.fillText('CLEAN', 0, 5); g.restore(); }
      }
    } else { g.fillStyle = ink; g.font = F('bold', 15); g.fillText('VALID FOR ALL SVMA NATIONAL EVENTS', 22, 448); g.fillStyle = '#b89a3a'; g.fillRect(330, 462, 68, 42); }
    g.fillStyle = '#6a675f'; g.font = F('', 12);
    g.fillText('Holder agrees to race in a sporting manner. The stewards decide', 22, 540); g.fillText('what that means, on the day. Not valid as photo ID. Do not bend.', 22, 556);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
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
  // ---------- the trophy cabinet and the photos either side (a kit with TROPHY_ places: the Race Workshop) ----------
  // m.shelf { big: [...], small: [...] } (wcareer.js honorsOf): each { kind: title | season | win | pod, pos, line1,
  // line2 }; m.seasons for the photos. Nothing won yet: Danny's note on the glass. Returns whether there's a cabinet
  fillHonors(G, m) {
    const k = this.kit && /^home:/.test(this.custom || '') ? this.kit : null;
    if (!k || !k.trophies || !k.trophies.length) return false;
    const big = k.trophies.filter(t => t.userData.size_kind === 'big'), small = k.trophies.filter(t => t.userData.size_kind !== 'big');
    const shelf = (m && m.shelf) || { big: [], small: [] }, q = new THREE.Quaternion();
    const put = (list, places) => list.slice(0, places.length).forEach((it, i) => {
      const t = this.cabinetTrophy(it); places[i].getWorldPosition(t.position); places[i].getWorldQuaternion(q); t.quaternion.copy(q);
      t.rotateY(((i * 37) % 7 - 3) * 0.03); G.add(t);   // (not quite lined up: someone put them there)
    });
    put(shelf.big, big); put(shelf.small, small);
    const any = shelf.big.length + shelf.small.length > 0;
    for (const o of k.trophyNote || []) o.visible = !any;
    // the Boulevard (the factory): a car of your career on each plinth, newest first, in your livery; its plaque printed
    const cars = (m && m.cars) || [], base = this.carCfg || {};
    (k.plinths || []).forEach((p, i) => {
      const c = cars[i]; if (!c) return;
      const car = buildF1({ ...base, chassis: c.chassis }, { texSize: 512 }), g = car.group;
      p.at.getWorldPosition(g.position); p.at.getWorldQuaternion(q); g.quaternion.copy(q);
      g.rotateY(Math.PI / 2 - 0.08); g.updateMatrixWorld(true);   // (along its plinth, the nose a touch to the walkway: faced at it, an F1 car hung over the rope)
      if (car.shadow) car.shadow.visible = false;
      G.add(g);
      if (p.plaque) {
        const tex = new THREE.CanvasTexture(this.plaqueCanvas(c)); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
        if (p.plaque.material && p.plaque.material.userData.honors && p.plaque.material.map) p.plaque.material.map.dispose();
        p.plaque.material = new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d8d8 }); p.plaque.material.userData.honors = true;
      }
    });
    const seasons = (m && m.seasons) || [];
    (k.photos || []).forEach((ph, i) => {
      const s = seasons[i]; for (const o of ph.parts) o.visible = !!s;
      if (!s) return;
      const tex = new THREE.CanvasTexture(this.seasonPhoto(s)); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
      if (ph.pic.material && ph.pic.material.map && ph.pic.material.userData.honors) ph.pic.material.map.dispose();
      ph.pic.material = new THREE.MeshLambertMaterial({ map: tex }); ph.pic.material.userData.honors = true;
    });
    return true;
  }
  // a cabinet's trophy, 0.25-0.5 m tall, on its plinth with an engraved plate (to the room: +Z). title: the big gold cup
  // with handles; season: 2nd / 3rd in a series, a silver / bronze cup with handles; win: a gold cup; pod: silver / bronze
  cabinetTrophy(it) {
    const metal = it.kind === 'title' || it.kind === 'win' ? 0xd8a830 : it.pos === 2 ? 0xc8ccd4 : 0xb07040;
    const glow = it.kind === 'title' || it.kind === 'win' ? 0x3a2a08 : it.pos === 2 ? 0x2a2c30 : 0x2a1608;
    const mat = new THREE.MeshPhongMaterial({ color: metal, emissive: glow, specular: 0xffffff, shininess: 80, side: THREE.DoubleSide });
    const h = { title: 0.36, season: 0.28, win: 0.22, pod: 0.17 }[it.kind] || 0.2, handles = it.kind === 'title' || it.kind === 'season';
    const o = new THREE.Group();
    // the plinth: two tiers of black, the plate on its front
    const pw = h * 0.55 + 0.04, ph = h * 0.32;
    const base = new THREE.Mesh(new THREE.BoxGeometry(pw, ph * 0.6, pw), new THREE.MeshPhongMaterial({ color: 0x111113, shininess: 60 })); base.position.y = ph * 0.3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.75, ph * 0.4, pw * 0.75), base.material); top.position.y = ph * 0.6 + ph * 0.2;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.86, ph * 0.5), new THREE.MeshPhongMaterial({ map: this.plateTex(it), color: 0xffffff, shininess: 90 }));
    plate.position.set(0, ph * 0.3, pw / 2 + 0.001); o.add(base, top, plate);
    // the cup: stem, bowl, lip, a lid with a finial on a title
    const s = h / 0.36, P = [[0, 0], [0.05, 0], [0.05, 0.01], [0.02, 0.025], [0.013, 0.06], [0.012, 0.13], [0.02, 0.145], [0.045, 0.16], [0.075, 0.22], [0.085, 0.29], [0.08, 0.3], [0.07, 0.235], [0.04, 0.17], [0, 0.16]];
    const cup = new THREE.Mesh(new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x * s, y * s)), 24), mat); cup.position.y = ph; o.add(cup);
    if (it.kind === 'title') {
      const lid = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.3], [0.082, 0.3], [0.06, 0.33], [0.015, 0.345], [0.012, 0.36], [0.022, 0.375], [0, 0.39]].map(([x, y]) => new THREE.Vector2(x * s, y * s)), 20), mat); lid.position.y = ph; o.add(lid);
    }
    if (handles) for (const sd of [-1, 1]) {   // (ear handles: a half ring each side)
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.045 * s, 0.007 * s, 6, 12, Math.PI), mat);
      hd.rotation.z = sd > 0 ? -Math.PI / 2 : Math.PI / 2; hd.position.set(sd * 0.082 * s, ph + 0.235 * s, 0); o.add(hd);
    }
    return o;
  }
  // a Boulevard plaque: the car, its years, the series and how it went, white on dark brushed steel
  plaqueCanvas(c) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 256); gr.addColorStop(0, '#2a2d33'); gr.addColorStop(1, '#16181c'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#8a9099'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 240);
    g.fillStyle = '#4aa8ff'; g.fillRect(28, 150, 140, 4);
    g.textBaseline = 'alphabetic'; g.fillStyle = '#f2f2ee';
    const fit = (t, size, y, col, w = 456) => { let f = size; do { g.font = `bold ${f}px Helvetica, Arial, sans-serif`; f--; } while (g.measureText(t).width > w && f > 10); g.fillStyle = col; g.fillText(t, 28, y); };
    const ys = c.years.slice().sort((a, b) => a - b), yr = ys.length > 1 ? `${ys[0]}-${String(ys[ys.length - 1]).slice(-2)}` : String(ys[0]);
    fit(String(c.name || c.chassis).toUpperCase(), 46, 82, '#f2f2ee');
    fit(`${yr}  ${c.series || ''}`, 30, 136, '#c9ced6');
    if (c.result) fit(c.result, 34, 204, c.result === 'Champions' ? '#e8c060' : '#f2f2ee');
    return cv;
  }
  plateTex(it) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    const gold = it.kind === 'title' || it.kind === 'win';
    g.fillStyle = gold ? '#c9a043' : '#b8bcc4'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#3a2a10'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 88);
    g.fillStyle = '#2a1e0c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (t, size, y) => { let f = size; do { g.font = `bold ${f}px Helvetica, Arial, sans-serif`; f--; } while (g.measureText(t).width > 230 && f > 9); g.fillText(t, 128, y); };
    fit(String(it.line1 || '').toUpperCase(), 28, 34); fit(String(it.line2 || ''), 24, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // a past season's photo: the car through a corner at speed in the team's colors, the stand behind blurred, the
  // caption along the bottom (the year, the series, where you finished)
  seasonPhoto(s) {
    const W = 320, H = 240, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const main = this.team ? hex(this.team.main) : '#c8102e', acc = this.team ? hex(this.team.accent ?? 0xffffff) : '#ffffff';
    const sky = g.createLinearGradient(0, 0, 0, 90); sky.addColorStop(0, '#8fb4d8'); sky.addColorStop(1, '#d8e4ec'); g.fillStyle = sky; g.fillRect(0, 0, W, 90);
    let r = (s.y * 7919 + (s.pos || 1) * 104729) % 9973; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let x = 0; x < W; x += 6) { g.fillStyle = `hsl(${rnd() * 360},${30 + rnd() * 30}%,${40 + rnd() * 30}%)`; g.fillRect(x, 58 + rnd() * 10, 6, 34); }   // (the crowd, blurred)
    g.fillStyle = '#b8b8b0'; g.fillRect(0, 90, W, 10); g.fillStyle = '#5c5e62'; g.fillRect(0, 100, W, 110);   // (the wall, the track)
    for (let x = 0; x < W; x += 24) { g.fillStyle = (x / 24) % 2 ? '#d8242a' : '#f2f2f2'; g.fillRect(x, 196, 24, 12); }   // (the curb)
    g.globalAlpha = 0.25; for (let k = 0; k < 14; k++) { g.fillStyle = '#ffffff'; g.fillRect(rnd() * W, 110 + rnd() * 80, 40 + rnd() * 60, 2); } g.globalAlpha = 1;   // (motion streaks)
    // the car, side on: the body in the team's main color, a stripe in the accent, the wheels, the driver's helmet
    const cx = 90 + rnd() * 100, cy = 150;
    g.fillStyle = main; g.beginPath(); g.moveTo(cx - 90, cy + 12); g.lineTo(cx - 80, cy - 8); g.lineTo(cx - 20, cy - 14); g.lineTo(cx + 10, cy - 30); g.lineTo(cx + 40, cy - 30); g.lineTo(cx + 70, cy - 12); g.lineTo(cx + 95, cy - 8); g.lineTo(cx + 98, cy + 12); g.closePath(); g.fill();
    g.fillStyle = acc; g.fillRect(cx - 82, cy - 2, 178, 5);
    g.fillStyle = '#1a1a1c'; g.beginPath(); g.arc(cx + 22, cy - 30, 8, 0, Math.PI * 2); g.fill();
    for (const wx of [cx - 55, cx + 62]) { g.fillStyle = '#111'; g.beginPath(); g.arc(wx, cy + 14, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9a9ca0'; g.beginPath(); g.arc(wx, cy + 14, 8, 0, Math.PI * 2); g.fill(); }
    // the caption
    g.fillStyle = 'rgba(10,10,12,0.82)'; g.fillRect(0, H - 34, W, 34); g.fillStyle = '#f2f2ee'; g.font = 'bold 15px Helvetica, Arial, sans-serif'; g.textBaseline = 'middle';
    const pos = s.pos === 1 ? 'Champions' : `${s.pos}${s.pos === 2 ? 'nd' : s.pos === 3 ? 'rd' : 'th'}`;
    g.fillText(`${s.y}  ${s.series}  ${pos}${s.wins ? `, ${s.wins} win${s.wins > 1 ? 's' : ''}` : ''}`.slice(0, 44), 10, H - 17);
    return c;
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
  // the lights come on as you come in: the room dim (the light from outside), then the switch (the lamps and work
  // lights) and the fluorescent tubes catching in a quick run down the room, each with a tick or two before it eases
  // on. Kept brisk and never quite dark: a workshop opening up, not a horror film. sfx(kind) plays the clicks
  flickerOn(sfx = null) {
    if (!this.bulbs || !this.bulbs.length) return;
    let seed = 1 + Math.floor(Math.random() * 2147483000); const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tubes = [...new Set(this.bulbs.filter(b => b.tube !== null).map(b => b.tube))].sort((a, b) => a - b);
    const sw = 0.25, plan = {};    // (tube -> [[time, level, ease s], ...]: the level from that time on)
    tubes.forEach((k, i) => {
      let t = sw + 0.1 + i * 0.13 + r() * 0.08; const ev = [];
      const n = 1 + Math.floor(r() * 2);
      for (let j = 0; j < n; j++) { ev.push([t, 0.6 + r() * 0.3, 0]); t += 0.04 + r() * 0.04; ev.push([t, 0.15, 0]); t += 0.06 + r() * 0.08; }
      ev.push([t, 1, 0.18]); plan[k] = ev;
    });
    this.flick = { t: 0, sw, plan, end: Math.max(sw, ...Object.values(plan).map(e => e[e.length - 1][0] + 0.2)) + 0.05, sfx, heard: new Set() };
    this.flickTick(0);
  }
  flickTick(dt) {
    const f = this.flick; if (!f) return;
    f.t += dt;
    const DIM = 0.3;   // (the room before the lights: dim, not black)
    const at = (k) => {
      if (k === null) return f.t >= f.sw ? 1 : 0;
      let v = 0, prev = 0;
      for (const [t, l, e] of f.plan[k] || []) { if (f.t < t) break; v = e ? prev + (l - prev) * Math.min(1, (f.t - t) / e) : l; prev = l; }
      return v;
    };
    for (const b of this.bulbs) b.l.intensity = b.base * (DIM + (1 - DIM) * at(b.tube));
    for (const m of this.tubes) m.m.emissiveIntensity = m.base * at(m.tube);
    // (the sounds: the switch, then each tube's ticks)
    if (f.sfx) {
      if (f.t >= f.sw && !f.heard.has('sw')) { f.heard.add('sw'); f.sfx('switch'); }
      for (const [k, ev] of Object.entries(f.plan)) ev.forEach(([t, l], i) => { const id = k + ':' + i; if (l > 0.5 && f.t >= t && !f.heard.has(id)) { f.heard.add(id); if (f.t - t < 0.1) f.sfx('tube', l); } });
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
  carCentre() { return new THREE.Vector3(0, 0.55, CAR_Z).add(this.bay.position); } // (the bay's moved to where your model's box has the car)
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
    if (!part) return { pos: C.clone().add(new THREE.Vector3(C.x > 0.5 ? -3.6 : 3.6, 1.7, 3.8)), at: C.clone(), fov: 46, shift: 0 };
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
  // track: { sim, F } your box at the track (useTrack), else the room
  open(cfg, team, tyre, dmg, home = null, track = null) {
    this.active = true; this.t = 0; this.mode = 'pit'; this.shot = 'room'; this.prevShot = null; this.blendK = 1; this.from = null; this.bay.visible = true;
    if (track && !home) this.useTrack(track.sim, track.F, track.side || 0);
    else { this.leaveTrack(); this.pickRoom(home); } // (your own garage model, or home's kit)
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
    this.car = buildF1(cfg, { texSize: 2048 }); this.cfgChassis = cfg.chassis || 'custom'; this.carCfg = cfg; this.car.group.visible = !this.carOff; this.shadeCar(this.car);
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
  // your people at home, about the garage doing their jobs (js/homecrew.js): [{ key, role, look, livery, face, crew }],
  // and the stations in use (['dyno', ...]: their BUSY_ pieces showing). Only in a kit's room; the same again changes
  // nothing, the stations in use change without a rebuild
  setCrew(list = [], busy = []) {
    this.crewWant = { list, busy, key: list.map(p => p.key + ':' + p.role).join('|') };
    if (this.kit && this.kit.setBusy) this.kit.setBusy(busy);
    if (this.homeCrew) this.homeCrew.setBusy(busy);
  }
  // the setup pad's scales (a kit with SCALEPAD_s: the Race Workshop): each under its own wheel of the car in bay one,
  // whatever its wheelbase and track, the cables from them to the readout drawn along the floor. Checked twice a second
  // (a car's model loads after it's put in the bay); with no car they go back where they were built
  padTick(dt) {
    const k = this.mode === 'home' && this.kit && /^home:/.test(this.custom || '') ? this.kit : null, pads = k && k.scalePads;
    if (!pads || !pads.length) { if (this.padCables) { this.padCables.removeFromParent(); this.padCables = null; } return; }
    this.padT = (this.padT || 0) - dt; if (this.padT > 0) return; this.padT = 0.5;
    for (const p of pads) if (!p.userData.home) p.userData.home = p.position.clone();
    const c = this.car, on = c && c.group.parent && c.group.visible && c.wheels && c.wheels.length >= 4;
    const at = [], v = new THREE.Vector3();
    if (on) { c.group.updateMatrixWorld(true); for (const wh of c.wheels) { (wh.pivot || wh.mesh).getWorldPosition(v); at.push(v.clone()); } }
    const key = on ? at.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join('|') : 'home';
    if (key === this.padKey && this.padCables && this.padCables.parent) return; this.padKey = key;
    // each wheel to the pad that waits nearest it (the pads' corners match a car's however it's modelled)
    const free = [...pads];
    for (const p of pads) p.position.copy(p.userData.home);
    if (on) for (const w of at) {
      let best = null, bd = Infinity;
      for (const p of free) { p.parent.localToWorld(v.copy(p.userData.home)); const d = Math.hypot(v.x - w.x, v.z - w.z); if (d < bd) { bd = d; best = p; } }
      if (!best || bd > 1.6) continue; free.splice(free.indexOf(best), 1);
      const loc = best.parent.worldToLocal(new THREE.Vector3(w.x, 0, w.z)); best.position.set(loc.x, best.userData.home.y, loc.z);
    }
    // the cables: from each pad's outer side, along the floor, to the stand's foot, up its pole to the readout
    if (this.padCables) { this.padCables.traverse(o => o.geometry && o.geometry.dispose()); this.padCables.removeFromParent(); }
    const G = this.padCables = new THREE.Group(); G.name = 'ScaleCables'; this.room.parent.add(G);
    const R = k.scaleReadout; if (!R) return;
    this.room.updateMatrixWorld(true); const top = R.getWorldPosition(new THREE.Vector3()), mat = this.padCableMat || (this.padCableMat = new THREE.MeshLambertMaterial({ color: 0x141416 }));
    const foot = new THREE.Vector3(top.x, 0.012, top.z);
    pads.forEach((p, i) => {
      const s = p.getWorldPosition(new THREE.Vector3()), sock = p.getObjectByProperty('name', p.children.map(o => o.name).find(n => /Socket/.test(n)));
      const a = sock ? sock.getWorldPosition(new THREE.Vector3()).setY(0.012) : s.clone().setY(0.012), out = Math.sign(a.x - s.x) || 1, lift = 0.04 * i;
      const pts = [a, new THREE.Vector3(a.x + out * 0.2, 0.012, a.z + 0.08), new THREE.Vector3((a.x + foot.x) / 2, 0.012, (a.z + foot.z) / 2 + 0.25 * (i - 1.5)),
        new THREE.Vector3(foot.x + 0.12, 0.012, foot.z + 0.06 * (i - 1.5)), new THREE.Vector3(foot.x + 0.02, 0.2, foot.z), new THREE.Vector3(top.x, top.y - 0.12 - lift * 0.2, top.z - 0.06 + i * 0.04)];
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.006, 5), mat); G.add(m);
    });
  }
  crewTick(dt) {
    const W = this.crewWant, kit = this.mode === 'home' && this.custom && /^home:/.test(this.custom) ? this.kit : null;
    const want = kit && W && W.list.length ? `${this.custom}|${W.key}` : null;
    if ((this.homeCrew && this.homeCrew.wantKey) !== want) {
      if (this.homeCrew) { this.homeCrew.dispose(); this.homeCrew = null; }
      if (want) { if (kit.setBusy) kit.setBusy(W.busy); this.homeCrew = new HomeCrew(this, kit, W.list, W.busy); this.homeCrew.wantKey = want; }
    }
    if (this.homeCrew) {
      // (a car's come or gone, or been rebuilt: what's in their way again)
      // (measured twice a second: a car's model loads after it's put in the bay, and its box then was a speck: the
      // wheel spots were inside it)
      if ((this.homeCrew.carT = (this.homeCrew.carT || 0) - dt) <= 0) {
        this.homeCrew.carT = 0.5; const bx = new THREE.Box3();
        const ck = [this.car, this.car2].map(c => { if (!(c && c.group.parent && c.group.visible)) return '-'; bx.makeEmpty(); c.group.traverse(o => { if (o.isMesh && o !== c.shadow) bx.expandByObject(o); }); return bx.isEmpty() ? '0' : [bx.min.x, bx.min.z, bx.max.x, bx.max.z].map(v => v.toFixed(1)).join(','); }).join('|');
        if (ck !== this.homeCrew.carKey) { this.homeCrew.carKey = ck; this.homeCrew.floors = null; }
      }
      this.homeCrew.update(dt);
    }
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
  // (at the track: the session's camera back, and the car out of the box: it's on the track now)
  close() { if (this.track) { this.track.sim.camHold = null; this.bay.visible = false; } this.desk = false; if (this.night) this.setNight(false); this.cinePose = null; this.carOff = false; if (this.car) this.car.group.visible = true; this.active = false; this.mode = 'pit'; this.shot = 'room'; this.prevShot = null; this.blendK = 1; this.from = null; }
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
    this.crewTick(dt);
    this.padTick(dt);
    if (this.friend) this.friend.update(dt); // (co-op: the other one of you, js/coopwalk.js)
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
      const b = this.shot === 'cine' && this.cinePose ? this.cinePose : this.shot === 'seat' && f ? this.seatPose(f, el.width / el.height) : this.shot === 'list' && lf ? this.listPose(lf, el.width / el.height) : this.shot === 'poster' && this.posterFrame ? this.listPose(this.posterFrame, el.width / el.height) : this.shot === 'car' ? this.carPose(this.shotPart) : this.roomPose(f, this.t);
      const look = (p) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p.pos, p.at, new THREE.Vector3(0, 1, 0)));
      this.blendK = Math.min(1, this.blendK + dt / (this.shot === 'cine' ? this.cineT || 1e-6 : 0.75));
      const k = this.blendK * this.blendK * (3 - 2 * this.blendK), a = this.from || { pos: b.pos, quat: look(b), fov: b.fov, shift: b.shift };
      this.camera.position.lerpVectors(a.pos, b.pos, k);
      this.camera.quaternion.copy(a.quat).slerp(look(b), k);
      this.camera.fov = a.fov + (b.fov - a.fov) * k;
      this.shiftNow = a.shift + (b.shift - a.shift) * k;
      // (you, sat at the computer after walking up to it: gone halfway in, as the camera comes over your head)
      if (this.parked) { this.parked.object.visible = this.zoomK < 0.5 && !this.hideParked; if (this.parked.object.visible && this.parked.me) this.parked.me.update(dt); } // (still idling in the chair)
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
      const hw = this.track ? this.track.half : W / 2;
      p.x = Math.max(-hw + 0.6, Math.min(hw - 0.6, p.x)); p.z = Math.max(-D + 0.6, Math.min(-0.4, p.z)); p.y = Math.max(0.35, Math.min(H - 0.4, p.y));
      this.camera.position.lerp(p, Math.min(1, dt * 10)); aim(this.camera, C); this.camera.fov = 40;
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
    const tgt = this.carCentre(); tgt.y = 0.5;
    const a = (tgt.x > 0.5 ? -1 : 1) * (0.62 + Math.sin(this.t * 0.12) * 0.1), r = 7.4; // (from the room's middle: a car parked off to one side has a wall beyond it)
    this.camera.position.set(tgt.x + Math.sin(a) * r, 2.0 + Math.sin(this.t * 0.2) * 0.1, tgt.z + Math.cos(a) * r);
    aim(this.camera, tgt); this.camera.fov = 40;
    // (back from walking the pit lane, or your car pushed back in: eased round to it from where the camera was left)
    if (this.from && this.blendK < 1) {
      this.blendK = Math.min(1, this.blendK + dt / (this.from.secs || 0.9)); const k = this.blendK * this.blendK * (3 - 2 * this.blendK), f = this.from; // (secs: slower, in from the lane: js/pushcar.js)
      this.camera.position.lerpVectors(f.pos, this.camera.position, k); this.camera.quaternion.slerpQuaternions(f.quat, this.camera.quaternion.clone(), k);
      this.camera.fov = f.fov + (this.camera.fov - f.fov) * k; this.shiftNow = (f.shift ?? 0) + (this.shift - (f.shift ?? 0)) * k;
      if (this.blendK >= 1) this.from = null;
    }
    if (this.car) this.car.animate({ steer: 0, spin: 0, heave: Math.sin(this.t * 1.6) * 0.003, pitch: 0, roll: 0 });
  }
  render() {
    const el = this.r.domElement;
    this.camera.aspect = el.width / el.height;
    this.camera.setViewOffset(el.width, el.height, -el.width * (this.shiftNow ?? this.shift), 0, el.width, el.height);
    this.camera.updateProjectionMatrix();
    if (this.track) { const P = this.track.sim.world.P; this.post.render(this.track.sim.scene, this.camera, { trails: 0, grade: P.grade, look: P.look }); return; }
    this.post.render(this.scene, this.camera, { trails: 0, grade: [1.02, 1, 0.98] });
  }
}
const SHOW_MATTRESS = false;
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); }
