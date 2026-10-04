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
const STAND = P(-20.2, 18.55);
// the doors: a pair of leaves each (the model's node names, the hinge's z, which way it swings open), the gap you walk
// through (x across the wall, z along it), and where you walk from and to going through (in: towards +x)
const DOORS = {
  pizza: { leaves: [['Door', -17.77, -1], ['Door001', -19.40, 1]], x: -15.98, z0: -19.4, z1: -17.77, inside: P(-16.75, 18.58), outside: P(-14.7, 18.58), bell: false },
  store: { leaves: [['Door002', -23.85, -1], ['Door_01', -26.03, 1]], x: 9.27, z0: -26.03, z1: -23.85, inside: P(10.7, 24.94), outside: P(8.2, 24.94), bell: true },
};
const COUNTER = P(13.0, 31.2), CLERK = P(13.4, 33.8);
// at the counter, through your own eyes: where you're looking from, and at (his face, the bottles behind him)
const COUNTER_EYE = P(13.0, 30.7, 1.7), COUNTER_LOOK = P(13.35, 33.8, 1.42);
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
        for (const mat of [].concat(o.material)) {
          if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestMipmapNearestFilter; } mat.metalness = 0;
          // (the packs' glass came through the conversion opaque grey)
          if (/^Glass/.test(mat.name)) { mat.transparent = true; mat.opacity = 0.16; mat.color.setHex(0xbfd8e6); mat.depthWrite = false; mat.roughness = 0.1; }
        }
      });
      this.scene.add(m); m.updateMatrixWorld(true);
      this.blocks = this.findBlocks(m);
      this.hingeDoors(m);
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

  // each door leaf on a pivot at its hinge, so it can swing
  hingeDoors(root) {
    for (const D of Object.values(DOORS)) {
      D.piv = [];
      for (const [name, hz, dir] of D.leaves) {
        const leaf = root.getObjectByName(name); if (!leaf) continue;
        const piv = new THREE.Group(); piv.position.set(D.x, 0, hz); this.scene.add(piv); piv.updateMatrixWorld(); piv.attach(leaf);
        D.piv.push({ piv, dir });
      }
      D.k = 0; D.open = false;
    }
  }
  // open a door, walk through it (in or out), and it swings shut behind you; then
  throughDoor(key, out, then) {
    const D = DOORS[key], snd = this.h.snd;
    this.stage = 'door'; this.targets = []; this.h.say('');
    D.open = true; D.want = 1;
    snd?.hiss(0.5, 700, 0.03, { room: true }); snd?.note(140, 0.25, 0.03, { room: true, slide: 0.7 }); // (the handle, the push)
    if (D.bell) { snd?.note(1568, 1.2, 0.03, { room: true, delay: 0.1 }); snd?.note(2093, 1.0, 0.02, { room: true, delay: 0.25 }); }
    const a = out ? D.inside : D.outside, b = out ? D.outside : D.inside;
    this.auto = { path: [a, b], i: 0, delay: 0.35, then: () => { D.want = 0; setTimeout(() => { D.open = false; snd?.hiss(0.15, 500, 0.03, { room: true }); }, 700); this.stage = 'walk'; then(); } };
  }

  // what stands in your way, from the model: anything waist high with a small footprint inside where you can walk
  // (booths, tables, the counter, shelves, trees, lamp posts), as boxes [x0, z0, x1, z1]
  findBlocks(root) {
    const out = [], b = new THREE.Box3();
    root.traverse(o => {
      if (!o.isMesh || /^(Door|Rug|Tiles|Road|Light|Lines|Crosswalk|Glasses)/i.test(o.name)) return;
      b.setFromObject(o);
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      if (b.min.y > 1.2 || b.max.y < 0.35 || w * d > 14 || w > 9 || d > 9 || Math.min(w, d) < 0.3) return; // (thin: a shop front or its glass)
      const box = [b.min.x, b.min.z, b.max.x, b.max.z, b.max.y];
      if (NAV.some(n => box[0] < n[2] && box[2] > n[0] && box[1] < n[3] && box[3] > n[1])) out.push(box);
    });
    return out;
  }
  free(x, z) {
    if (!NAV.some(n => x > n[0] && x < n[2] && z > n[1] && z < n[3])) return false;
    for (const D of Object.values(DOORS)) if (!D.open && Math.abs(x - D.x) < R + 0.12 && z > D.z0 - 0.3 && z < D.z1 + 0.3) return false; // (shut)
    return !(this.blocks || []).some(b => x > b[0] - R && x < b[2] + R && z > b[1] - R && z < b[3] + R);
  }

  // h: { snd, say(html), line(text), choices(list, pick), btn(), pad(), divorce(): canvas, ticket(): canvas,
  // done() }
  start(h) {
    this.h = h; this.t = 0; this.stage = 'booth'; this.k = -1; this.lineT = 0; this.targets = []; this.walkT = 0;
    this.yaw = 0; this.pitch = 0; this.camYaw = -Math.PI / 2; this.camPitch = 0.2; this.keys = new Set(); this.goal = null;
    this.papers?.removeFromParent(); this.ticketObj?.removeFromParent(); this.auto = null;
    for (const D of Object.values(DOORS)) { D.k = 0; D.want = 0; D.open = false; }
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
      this.stage = 'walk'; this.camYaw = -Math.PI / 2; this.camPitch = 0.18; this.snapCam = true;
      this.h.black(false);
      this.h.say(this.h.pad() ? 'Left stick &nbsp;Walk &nbsp;&nbsp;&nbsp; Right stick &nbsp;Look around' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp;Walk &nbsp;&nbsp;&nbsp; Drag &nbsp;Look around');
      setTimeout(() => { if (this.goal === 'out') this.h.say('Head out.'); }, 5000);
      this.setGoal('out');
    }, 1200);
  }
  // what you're heading for, and its marker
  setGoal(g) {
    this.goal = g;
    const T = {
      out: { at: DOORS.pizza.outside.clone().setY(2.2), label: 'Door', near: DOORS.pizza.inside, r: 1.5, go: () => this.throughDoor('pizza', true, () => { this.h.say('Get a drink. The 6twelve\'s across the street.'); this.setGoal('store'); }) },
      store: { at: DOORS.store.inside.clone().setY(3.0), label: '6twelve', near: DOORS.store.outside, r: 1.8, go: () => this.throughDoor('store', false, () => { this.h.say(''); this.setGoal('counter'); }) },
      counter: { at: COUNTER.clone().setY(1.9), label: 'The counter', near: COUNTER, r: 1.4, go: () => this.atCounter() },
      leave: { at: DOORS.store.outside.clone().setY(2.2), label: 'Door', near: DOORS.store.inside, r: 1.6, go: () => this.throughDoor('store', true, () => this.goHome()) },
    }[g];
    this.goalT = T; this.targets = T ? [{ at: T.at, label: T.label, objs: [], hot: () => this.near() }] : [];
    this.nearSaid = false;
  }
  near() { const T = this.goalT, p = this.me?.object.position; return !!(T && p && Math.hypot(p.x - T.near.x, p.z - T.near.z) < T.r); }

  // ---- the store: at the counter, through your own eyes ----
  // The camera glides from behind you into your eyes, the clerk across the counter with the bottles behind him; a few
  // lines (you pick yours, as in the booth); you think better of the bottle and buy a ticket; then it glides back out.
  atCounter() {
    this.stage = 'counter'; this.targets = []; this.h.say(''); this.face(CLERK); this.counterWant = 1;
    const T = (ms, f) => { this.tt = setTimeout(f, ms); };
    const line = (who, s) => { this.h.line(who ? `<i>${who}:</i> ${s}` : s); if (who) this.murmur(s, who === 'You' ? 120 : 150); return Math.max(1800, s.split(' ').length * 330 + 900); };
    const ask = (opts, then) => this.h.choices(opts, (i) => then(opts[i]));
    T(1300, () => T(line('Clerk', 'Evening. What can I get you?'), () => ask(['A bottle of bourbon.', 'Whatever\'s cheapest. In a bottle.'], (you) => {
      T(line('You', you), () => {
        this.clerkTurn = 1; // (he turns to the shelf)
        T(line('Clerk', 'Sure thing.'), () => {
          T(line(null, 'Your car keys are still in your hand.'), () => T(line(null, 'You\'re driving.'), () => ask(['Actually, forget the bottle. Just a Mega 6.', 'Never mind. A lottery ticket.'], (you2) => {
            T(line('You', you2), () => {
              this.clerkTurn = 0;
              T(line('Clerk', 'Quick pick? Jackpot\'s four hundred grand tonight.'), () => T(line('Clerk', 'That\'s a dollar.'), () => {
                this.h.line(''); this.h.snd?.note(1900, 0.06, 0.03, { room: true }); this.h.snd?.hiss(0.6, 3000, 0.02, { room: true, delay: 0.1 }); // (the printer)
                this.showTicket();
                T(3200, () => { this.hideTicket(); this.counterWant = 0; T(1200, () => { this.stage = 'walk'; this.setGoal('leave'); this.h.say('Drive home.'); }); });
              }));
            });
          })));
        });
      });
    })));
  }
  showTicket() {
    const t = sheet(this.h.ticket(), 0.09, 0.13, 0.0006, 0xf2efe8, false);
    this.ticketObj = t; this.camera.add(t); t.position.set(0, -0.01, -0.24); t.rotation.set(-0.1, 0, 0.03); this.ticketK = 0;
  }
  hideTicket() { this.ticketObj?.removeFromParent(); this.ticketObj = null; }
  goHome() { this.stage = 'done'; this.targets = []; this.h.say(''); this.h.done(); }
  face(p) { if (!this.me) return; const o = this.me.object.position; this.me.object.rotation.y = Math.atan2(p.x - o.x, p.z - o.z); this.camYaw = this.me.object.rotation.y + Math.PI; }

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
    this.counterK = clamp((this.counterK || 0) + ((this.counterWant || 0) ? dt : -dt) / 1.1, 0, 1);
    if (this.clerk) { const want = (this.clerkTurn || 0) * Math.PI; this.clerk.object.rotation.y += (want - this.clerk.object.rotation.y) * Math.min(1, dt * 3); }
    for (const D of Object.values(DOORS)) if (D.piv) {
      D.k += ((D.want || 0) - D.k) * Math.min(1, dt * 4.5);
      for (const { piv, dir } of D.piv) piv.rotation.y = dir * D.k * Math.PI * 0.5;
    }
    if (this.stage === 'door' && this.auto && this.me) { // (walking yourself through)
      const A = this.auto, o = this.me.object, p = o.position;
      if (A.delay > 0) { A.delay -= dt; this.me.play('idle'); }
      else {
        const to = A.path[A.i], dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz), v = 1.4 * dt;
        if (d < v) { p.x = to.x; p.z = to.z; if (++A.i >= A.path.length) { this.auto = null; this.me.play('idle'); A.then(); return; } }
        else { p.x += dx / d * v; p.z += dz / d * v; let r = Math.atan2(dx, dz) - o.rotation.y; r = Math.atan2(Math.sin(r), Math.cos(r)); o.rotation.y += r * Math.min(1, dt * 8); this.me.play('walk', { speed: 1.4 / CLIP_INFO.walk.speed }); }
        let c = (o.rotation.y + Math.PI) - this.camYaw; c = Math.atan2(Math.sin(c), Math.cos(c)); this.camYaw += c * Math.min(1, dt * 2);
      }
      return;
    }
    // (at a door, or what you came for: the button)
    if (this.stage === 'walk' && this.goalT && this.near() !== this.nearSaid) {
      this.nearSaid = this.near();
      const verb = { out: 'Open the door', store: 'Go in', leave: 'Open the door', counter: 'Walk up' }[this.goal];
      if (this.nearSaid && verb) this.h.say(`${this.h.btn()} &nbsp;${verb}`); else if (!this.nearSaid && this.goal !== 'out') this.h.say('');
    }
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
      const dist = 2.6, room = ROOMS.find(r => o.x > r[0] && o.x < r[2] && o.z > r[1] && o.z < r[3]) || ROOMS[1];
      const at = (yaw) => {
        const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(yaw) * Math.cos(this.camPitch));
        const w = head.clone().addScaledVector(back, dist);
        w.x = clamp(w.x, room[0] + 0.25, room[2] - 0.25); w.z = clamp(w.z, room[1] + 0.25, room[3] - 0.25); w.y = clamp(w.y, 0.6, room[4] - 0.2);
        return w;
      };
      // (a wall right behind you, just out of a door: swing round to where there's room to stand back)
      let want = at(this.camYaw);
      if (head.distanceTo(want) < dist * 0.75 && this.stage === 'walk') {
        for (const d of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) { const w = at(this.camYaw + d); if (head.distanceTo(w) > dist * 0.85) { this.camYaw += d * Math.min(1, 0.06); break; } }
      }
      // (and short of anything in the way: shelves, the counter, the booths)
      for (let k = 1; k <= 12; k++) {
        const q = head.clone().lerp(want, k / 12);
        if ((this.blocks || []).some(b => q.y < b[4] + 0.15 && q.x > b[0] - 0.15 && q.x < b[2] + 0.15 && q.z > b[1] - 0.15 && q.z < b[3] + 0.15)) { want.copy(head.clone().lerp(want, (k - 1) / 12)); break; }
      }
      if (!this.tp || this.snapCam) this.tp = want.clone(); else this.tp.lerp(want, 0.2);
      this.snapCam = false;
      // (at the counter: blended into your own eyes, and back out)
      const k = ease(this.counterK || 0), look = head.clone().add(new THREE.Vector3(0, 0.05, 0));
      cam.position.copy(this.tp);
      if (k > 0) {
        cam.position.lerp(COUNTER_EYE.clone().add(new THREE.Vector3(0, Math.sin(this.t * 1.1) * 0.004, 0)), k);
        look.lerp(COUNTER_LOOK, k); cam.fov = 62 - 8 * k;
      }
      this.me.object.visible = k < 0.55; // (not the inside of your own head)
      cam.lookAt(look);
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    post.render(this.scene, cam, { trails: 0, grade: [1.02, 1, 0.97] });
  }
}
