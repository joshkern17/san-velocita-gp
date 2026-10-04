// The prologue, before the trailer: a booth in a pizzeria, your wife across the table and the divorce papers between
// you. Then you're on your feet (third person): out of the door, across the street to the 6twelve for a drink, where
// it dawns on you that you're driving, and you buy a lottery ticket instead. Part of the opening (js/opening.js
// drives it: the markers, the prompts, the input it doesn't read itself).
// The town is models/opening/prologue.glb: the "Pizzeria" pack's block of streets with the "6twelve" pack's store set
// in across the road from the pizzeria (merged in Blender: tools notes in the commit). Its map, in the model's own
// metres (x east, y north, z up, the street at z = 20.6), is what the P() spots below are measured off.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { loadCharacters, makeCharacter, femaleFace, CLIP_INFO } from './characters.js';
import { sheet } from './papers.js';

const GROUND = 20.6;
// a spot off the model's map (x east, y north) -> the scene (y up, the street at 0)
const P = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

// the booth (by the window side of the room, the second from the door): you on the bench facing the door, her facing you
const SEAT = P(-20.3, 20.15, 1.18), HER = P(-18.72, 20.15), TABLE = P(-19.55, 20.2, 0.905);
// on foot: where you stand up, the doors, the counter
const STAND = P(-20.2, 18.55), PIZZA_DOOR = P(-15.9, 18.6), STORE_DOOR = P(9.2, 24.95);
const COUNTER = P(13.0, 31.2), BOTTLES = P(13.6, 35.5, 1.6), LOTTO = P(11.2, 32.2, 1.75), CLERK = P(13.4, 33.8);
// where you can walk: [x0, z0, x1, z1] in scene metres (the aisle, the door, the street, the store's door and floor);
// what stands in it (booths, shelves, the counter, trees) is found from the model
const NAV = [
  [-22.4, -19.35, -16.2, -17.75], [-16.5, -19.3, -14.8, -17.9],
  [-15.0, -40, 9.1, 0], [8.8, -26.0, 10.1, -23.9], [9.6, -31.55, 26.3, -15.6],
];
// the rooms the camera stays inside (it doesn't go through walls): the pizzeria, the street, the store
const ROOMS = [[-31.0, -20.85, -16.1, -16.25, 3.4], [-15.4, -60, 9.0, 20, 30], [9.4, -34.6, 26.6, -15.3, 3.6]];
const R = 0.28; // your radius, walking

// what's said in the booth. Hers, then your answer (each choice gets its own reply)
const TALK = [
  { her: 'Thanks for coming. I didn\'t want to do this over email.',
    you: [['It\'s fine.', 'Okay. Good.'], ['You picked the place we had our first date.', 'It\'s the only place in town that\'s open past nine.'], ['Is the lawyer coming?', 'He bills by the quarter hour. He\'s waiting in the car.']] },
  { her: 'So. The papers. He says it\'s all standard. I keep the house, the car and the dog.', papers: true,
    you: [['And the friends.', 'They picked. I didn\'t make them pick.'], ['What do I get?', 'The TV. The couch. Your uncle\'s trailer.'], ['The dog liked me better.', 'The dog likes whoever\'s holding the leash.']] },
  { her: 'You just have to sign. Page four. By the yellow flag.',
    you: [['Sign it.', 'Thank you.', 'sign'], ['I want to read it first.', 'It\'s forty pages. ... Fine. Sign it and mail it. Please.']] },
  { her: 'What are you going to do now?',
    you: [['Go racing.', 'With what money?'], ['No idea.', 'Yeah. Me neither.'], ['Get a drink.', 'Don\'t. You\'re driving.']] },
  { her: 'I should go. Take care of yourself.', you: null },
];

export class Prologue {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a14);
    this.scene.fog = new THREE.Fog(0x070a14, 30, 140);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 400);
    this.scene.add(this.camera);
    // night: a dark blue sky, the street lights, the pizzeria's and the store's strip lights
    this.scene.add(new THREE.HemisphereLight(0x5a6a9a, 0x1a1410, 0.55));
    const moon = new THREE.DirectionalLight(0x9aaad0, 0.4); moon.position.set(-30, 60, 20); this.scene.add(moon);
    for (const [x, y] of [[-19.3, 19.6], [-19.3, 17.6], [-23.1, 18.6], [-28.6, 18.5]]) { const l = new THREE.PointLight(0xffd8a0, 3.2, 7, 1.6); l.position.copy(P(x, y, 3.2)); this.scene.add(l); }
    for (const [x, y] of [[13, 30], [13, 24], [13, 18], [21, 30], [21, 24], [21, 18]]) { const l = new THREE.PointLight(0xe8f4ff, 2.6, 8, 1.6); l.position.copy(P(x, y, 3.3)); this.scene.add(l); }
    for (const [x, y] of [[-10, 30], [-10, 6], [4, 30], [4, 6], [8, 22]]) { const l = new THREE.PointLight(0xffc070, 5, 16, 1.5); l.position.copy(P(x, y, 5.5)); this.scene.add(l); }
    this.load();
  }

  load() {
    new GLTFLoader().loadAsync('models/opening/prologue.glb').then(g => {
      const m = g.scene; m.position.y = -GROUND;
      m.traverse(o => {
        if (!o.isMesh) return;
        for (const mat of [].concat(o.material)) { if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestMipmapNearestFilter; } mat.metalness = 0; }
      });
      this.scene.add(m); m.updateMatrixWorld(true);
      this.blocks = this.findBlocks(m);
      this.ready = true;
    }, () => { this.failed = true; }); // (no town: the opening starts in the trailer)
    loadCharacters().then(ok => {
      if (!ok) { this.failed = true; return; }
      this.her = makeCharacter({ look: 'polo_beige', clip: 'sit_idle', face: femaleFace(2), helmet: false, seed: 11 });
      this.her.object.position.copy(HER); this.her.object.rotation.y = -Math.PI / 2; this.scene.add(this.her.object);
      this.me = makeCharacter({ look: 'tee_maroon', clip: 'idle', seed: 7 }); this.me.object.visible = false; this.scene.add(this.me.object);
      this.clerk = makeCharacter({ look: 'polo_navy', clip: 'idle', seed: 5 });
      this.clerk.object.position.copy(CLERK); this.clerk.object.rotation.y = 0; this.scene.add(this.clerk.object);
      this.chars = true;
    });
  }

  // what stands in your way, from the model: anything waist high with a small footprint inside where you can walk
  // (booths, tables, the counter, shelves, trees, lamp posts), as boxes [x0, z0, x1, z1]
  findBlocks(root) {
    const out = [], b = new THREE.Box3();
    root.traverse(o => {
      if (!o.isMesh || /^(Door|Rug|Tiles|Road|Light|Lines|Crosswalk|Glasses)/i.test(o.name)) return;
      b.setFromObject(o);
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      if (b.min.y > 1.2 || b.max.y < 0.35 || w * d > 14 || w > 9 || d > 9) return;
      const box = [b.min.x, b.min.z, b.max.x, b.max.z, b.max.y];
      if (NAV.some(n => box[0] < n[2] && box[2] > n[0] && box[1] < n[3] && box[3] > n[1])) out.push(box);
    });
    return out;
  }
  free(x, z) {
    if (!NAV.some(n => x > n[0] && x < n[2] && z > n[1] && z < n[3])) return false;
    return !(this.blocks || []).some(b => x > b[0] - R && x < b[2] + R && z > b[1] - R && z < b[3] + R);
  }

  // h: { snd, say(html), line(text), choices(list, pick), btn(), pad(), divorce(): canvas, ticket(): canvas,
  // done() }
  start(h) {
    this.h = h; this.t = 0; this.stage = 'booth'; this.k = -1; this.lineT = 0; this.targets = []; this.walkT = 0;
    this.yaw = 0; this.pitch = 0; this.camYaw = -Math.PI / 2; this.camPitch = 0.2; this.keys = new Set(); this.goal = null;
    this.papers?.removeFromParent(); this.ticketObj?.removeFromParent();
    this.papers = sheet(h.divorce(), 0.21, 0.297, 0.004, 0xe9e4d8, true); this.papers.visible = false; this.scene.add(this.papers);
    if (this.her) { this.her.object.visible = true; this.her.object.position.copy(HER); this.her.play('sit_idle', { fade: 0 }); }
    if (this.me) this.me.object.visible = false;
    this.onKey = (e) => { const k = e.code; if (e.type === 'keydown') this.keys.add(k); else this.keys.delete(k); };
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    setTimeout(() => this.nextTalk(), 1800);
  }
  leave() { removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey); this.h?.choices(null); }

  // ---- the booth ----
  nextTalk() {
    if (this.stage !== 'booth') return;
    this.k++; const T = TALK[this.k];
    if (!T) return this.standUp();
    this.h.line(`<i>Her:</i> ${T.her}`); this.murmur(T.her, 190);
    if (T.papers) this.slidePapers();
    const wait = Math.max(2.2, T.her.split(' ').length * 0.3);
    clearTimeout(this.tt);
    this.tt = setTimeout(() => {
      if (!T.you) { this.tt = setTimeout(() => this.standUp(), 1200); return; }
      this.h.choices(T.you.map(c => c[0]), (i) => this.answer(T.you[i]));
    }, wait * 1000);
  }
  answer([you, her, act]) {
    this.h.choices(null);
    this.h.line(`<i>You:</i> ${you}`); this.murmur(you, 120);
    if (act === 'sign') this.signPapers();
    this.tt = setTimeout(() => {
      this.h.line(`<i>Her:</i> ${her}`); this.murmur(her, 190);
      this.tt = setTimeout(() => this.nextTalk(), Math.max(2.4, her.split(' ').length * 0.32) * 1000);
    }, 1800);
  }
  murmur(s, f) { const snd = this.h.snd; if (snd) s.split(' ').forEach((w, i) => snd.note(f + ((w.length * 37) % 40), 0.08, 0.012, { room: true, delay: 0.04 + i * 0.15 })); }
  slidePapers() {
    const p = this.papers; p.visible = true;
    p.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2 + 0.08));
    this.paperFrom = TABLE.clone().add(new THREE.Vector3(0.32, 0.003, 0)); this.paperTo = TABLE.clone().add(new THREE.Vector3(-0.12, 0.003, 0.02)); this.paperK = 0; p.position.copy(this.paperFrom);
    this.h.snd?.hiss(0.4, 1600, 0.02, { room: true });
  }
  signPapers() { const s = this.h.snd; if (s) for (let k = 0; k < 8; k++) s.hiss(0.06, 4400, 0.016, { room: true, delay: 0.3 + k * 0.1 }); this.paperBack = 1.4; }

  // you're on your feet: she's gone, the camera's behind you
  standUp() {
    this.stage = 'fade'; this.h.choices(null); this.h.line('');
    this.h.black(true);
    setTimeout(() => {
      if (this.her) this.her.object.visible = false;
      if (this.me) { this.me.object.visible = true; this.me.object.position.copy(STAND); this.me.object.rotation.y = Math.PI / 2; this.me.play('idle', { fade: 0 }); }
      this.papers.visible = false;
      this.stage = 'walk'; this.camYaw = -Math.PI / 2; this.camPitch = 0.18;
      this.h.black(false);
      this.h.say('Get a drink. The 6twelve\'s across the street.');
      this.setGoal('store');
    }, 1200);
  }
  // what you're heading for, and its marker
  setGoal(g) {
    this.goal = g;
    const T = {
      store: { at: STORE_DOOR.clone().setY(2.6), label: '6twelve', near: STORE_DOOR, r: 1.6, go: () => this.setGoal('counter') },
      counter: { at: COUNTER.clone().setY(1.9), label: 'The counter', near: COUNTER, r: 1.3, go: () => this.atCounter() },
      bottles: { at: BOTTLES, label: 'Something to drink', near: COUNTER, r: 2.2, go: () => this.thinkTwice() },
      lotto: { at: LOTTO, label: 'Mega 6', near: COUNTER, r: 2.6, go: () => this.buyTicket() },
      leave: { at: STORE_DOOR.clone().setY(2.4), label: 'Home', near: STORE_DOOR, r: 1.4, go: () => this.goHome() },
    }[g];
    this.goalT = T; this.targets = T ? [{ at: T.at, label: T.label, objs: [], hot: () => this.near() }] : [];
  }
  near() { const T = this.goalT, p = this.me?.object.position; return !!(T && p && Math.hypot(p.x - T.near.x, p.z - T.near.z) < T.r); }

  // ---- the store ----
  atCounter() {
    this.stage = 'counter'; this.face(BOTTLES);
    this.h.line('<i>Clerk:</i> Evening.'); this.murmur('Evening.', 150);
    setTimeout(() => { this.h.say(''); this.setGoal('bottles'); this.stage = 'walk'; }, 1500);
  }
  thinkTwice() {
    this.stage = 'counter'; this.targets = [];
    this.h.line('You reach for your wallet. Your car keys come out with it.');
    setTimeout(() => this.h.line('You\'re driving.'), 2600);
    setTimeout(() => { this.h.line(''); this.stage = 'walk'; this.setGoal('lotto'); this.face(LOTTO); }, 5000);
  }
  buyTicket() {
    this.stage = 'counter'; this.targets = [];
    const lines = [['You', 'Just a Mega 6. Quick pick.'], ['Clerk', 'Jackpot\'s four hundred grand tonight.'], ['Clerk', 'A dollar.']];
    lines.forEach(([who, s], i) => setTimeout(() => { this.h.line(`<i>${who}:</i> ${s}`); this.murmur(s, who === 'You' ? 120 : 150); }, i * 2300));
    setTimeout(() => {
      this.h.snd?.note(1900, 0.06, 0.03, { room: true }); this.h.snd?.hiss(0.6, 3000, 0.02, { room: true, delay: 0.1 }); // (the printer)
      this.showTicket();
    }, 7000);
    setTimeout(() => { this.h.line(''); this.hideTicket(); this.stage = 'walk'; this.setGoal('leave'); this.h.say('Drive home.'); }, 11000);
  }
  showTicket() {
    const t = sheet(this.h.ticket(), 0.09, 0.13, 0.0006, 0xf2efe8, false);
    this.ticketObj = t; this.camera.add(t); t.position.set(0, -0.01, -0.24); t.rotation.set(-0.1, 0, 0.03); this.ticketK = 0;
  }
  hideTicket() { this.ticketObj?.removeFromParent(); this.ticketObj = null; }
  goHome() { this.stage = 'done'; this.targets = []; this.h.say(''); this.h.done(); }
  face(p) { if (!this.me) return; const o = this.me.object.position; this.me.object.rotation.y = Math.atan2(p.x - o.x, p.z - o.z); this.camYaw = this.me.object.rotation.y + Math.PI; this.lookAt = p.clone ? p.clone() : null; }

  // ---- input (from js/opening.js) ----
  look(dy, dp) {
    if (this.stage === 'booth') { this.yaw = clamp(this.yaw + dy, -1.2, 1.2); this.pitch = clamp(this.pitch + dp, -0.5, 0.4); return; }
    this.camYaw += dy * 1.4; this.camPitch = clamp(this.camPitch - dp, -0.15, 0.7);
  }
  nav(d, axis) { if (axis === 'y') this.h.choiceNav(d); }
  confirm() {
    if (this.h.choiceOk()) return;
    if (this.stage === 'walk' && this.goalT && this.near()) this.goalT.go();
  }
  click() { this.confirm(); }
  back() { return false; }

  // ---- per frame ----
  update(dt) {
    this.t += dt;
    for (const c of [this.her, this.me, this.clerk]) c?.update(dt);
    if (this.paperFrom && this.paperK < 1) { this.paperK = Math.min(1, this.paperK + dt / 0.9); this.papers.position.lerpVectors(this.paperFrom, this.paperTo, ease(this.paperK)); }
    if (this.paperBack > 0) { this.paperBack -= dt; if (this.paperBack <= 0) { this.paperFrom = this.papers.position.clone(); this.paperTo = TABLE.clone().add(new THREE.Vector3(0.3, 0.003, 0)); this.paperK = 0; } }
    if (this.stage !== 'walk' || !this.me) { if (this.me && this.me.clip !== 'idle' && this.stage !== 'booth') this.me.play('idle'); return; }
    // walking: the left stick or WASD, relative to the camera
    let mx = 0, mz = 0;
    const K = this.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) mz += 1; if (K.has('KeyS') || K.has('ArrowDown')) mz -= 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) mx -= 1; if (K.has('KeyD') || K.has('ArrowRight')) mx += 1;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (pad) { const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0; if (Math.hypot(ax, ay) > 0.2) { mx = ax; mz = -ay; } }
    const amt = Math.min(1, Math.hypot(mx, mz)), o = this.me.object;
    if (amt > 0.05) {
      // forward is where the camera looks
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw), rx = -fz, rz = fx;
      let dx = (fx * mz + rx * mx) / amt, dz = (fz * mz + rz * mx) / amt;
      const v = 1.55 * amt, sx = dx * v * dt, sz = dz * v * dt, p = o.position;
      if (this.free(p.x + sx, p.z + sz)) { p.x += sx; p.z += sz; } else if (this.free(p.x + sx, p.z)) p.x += sx; else if (this.free(p.x, p.z + sz)) p.z += sz;
      const want = Math.atan2(dx, dz); let d = want - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += d * Math.min(1, dt * 10);
      this.me.play('walk', { speed: v / CLIP_INFO.walk.speed });
      // the camera swings round behind you as you go
      let c = (o.rotation.y + Math.PI) - this.camYaw; c = Math.atan2(Math.sin(c), Math.cos(c)); this.camYaw += c * Math.min(1, dt * 1.2) * amt;
    } else this.me.play('idle');
  }

  render(post, aspect) {
    const cam = this.camera; cam.aspect = aspect;
    if (this.stage === 'booth' || (this.stage === 'fade' && !this.me?.object.visible)) {
      cam.fov = 58; cam.position.copy(SEAT).add(new THREE.Vector3(0, Math.sin(this.t * 1.1) * 0.004, 0));
      const look = HER.clone().setY(1.12).add(new THREE.Vector3(0, -0.05, 0));
      cam.lookAt(look); cam.rotateY(this.yaw); cam.rotateX(this.pitch);
    } else if (this.me) {
      // over the shoulder, kept inside the room you're in
      cam.fov = 62;
      const o = this.me.object.position, head = o.clone().setY(1.55);
      const dist = 2.6, back = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
      const want = head.clone().addScaledVector(back, dist);
      const room = ROOMS.find(r => o.x > r[0] && o.x < r[2] && o.z > r[1] && o.z < r[3]) || ROOMS[1];
      want.x = clamp(want.x, room[0] + 0.25, room[2] - 0.25); want.z = clamp(want.z, room[1] + 0.25, room[3] - 0.25); want.y = clamp(want.y, 0.6, room[4] - 0.2);
      // (at the counter: over your shoulder, close)
      const close = this.stage === 'counter' || ['bottles', 'lotto'].includes(this.goal);
      if (close) {
        const f = this.me.object.rotation.y, side = new THREE.Vector3(-Math.cos(f), 0, Math.sin(f));
        want.copy(head).add(new THREE.Vector3(-Math.sin(f) * 0.95, 0.2, -Math.cos(f) * 0.95)).addScaledVector(side, 0.38);
      } else {
        // (and short of anything in the way: shelves, the counter, the booths)
        for (let k = 1; k <= 12; k++) {
          const q = head.clone().lerp(want, k / 12);
          if ((this.blocks || []).some(b => q.y < b[4] + 0.15 && q.x > b[0] - 0.15 && q.x < b[2] + 0.15 && q.z > b[1] - 0.15 && q.z < b[3] + 0.15)) { want.copy(head.clone().lerp(want, (k - 1) / 12)); break; }
        }
      }
      cam.position.lerp(want, this.snapCam ? 1 : close ? 0.1 : 0.2); this.snapCam = false;
      const aim = close && this.goalT ? this.goalT.at.clone().lerp(head, 0.35) : this.stage === 'counter' && this.lookAt ? this.lookAt : head.clone().add(new THREE.Vector3(0, 0.05, 0));
      cam.lookAt(aim);
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    post.render(this.scene, cam, { trails: 0, grade: [1.02, 1, 0.97] });
  }
}
