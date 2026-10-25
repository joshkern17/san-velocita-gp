// Pit lane life: each team's sign over its garage (name, driver, where they're running), and the crews who wait
// in front of their box, come out when their car is coming in, work on it, and wave it out.
//
//   race.pitLife = new PitLife(race);   // after the cars are in (signs straight away, crews once the people load)
//   race.pitLife.update(dt);            // each frame, before the cars are placed (it lifts a car on its jacks: car.lift)
//
// It only watches what any car shows (pitting, where it is, its speed), so an online rival's stop gets a crew too.
import * as THREE from 'three';
import { TEAMS } from './car.js';
import { loadCharacters, makeCharacter, classicCrewLook, hasClip, FACES } from './characters.js';
import { fillLivery } from './livery.js';
import { PitWall } from './pitwall.js';
import { dressBox, shutBox, boxFrame, BOX } from './pitboxes.js';
import { furnish } from './pitprops.js';
import { loadPitBox, fitBoxes } from './pitbox.js';
import { BoxCrew } from './pitcrew.js';
import { buildF1, teamCar } from './carmodel.js';
import { driverLivery, driverFace, driverHelmet, teamSuit } from './drivers.js';

const _q = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0), _z = new THREE.Vector3(0, 0, 1);
const turn = (b, axis, a) => { if (b && a) b.quaternion.multiply(_q.setFromAxisAngle(axis, a)); };

// a crouch on top of whatever clip is playing: k 0..1. mode 'gun' (down at a wheel), 'jack' (squatting, leaning back)
export function crouchPose(ch, k, mode = 'gun') {
  const B = ch._bones || (ch._bones = Object.fromEntries(['Spine', 'Spine1', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm'].map(n => [n, ch.bone(n)])));
  if (k <= 0.001) { ch.body.position.y = 0; return; }
  const a = 1.25 * k; // thighs up, knees bent twice as far, feet flat: the hips drop straight down over the feet
  turn(B.LeftUpLeg, _x, a); turn(B.RightUpLeg, _x, a);
  turn(B.LeftLeg, _x, -a * 2); turn(B.RightLeg, _x, -a * 2);
  turn(B.LeftFoot, _x, a); turn(B.RightFoot, _x, a);
  const lean = mode === 'jack' ? -0.15 * k : 0.55 * k;
  turn(B.Spine, _x, lean); turn(B.Spine1, _x, lean * 0.5);
  if (mode === 'gun') { turn(B.LeftArm, _z, 0.9 * k); turn(B.RightArm, _z, -0.9 * k); }
  ch.body.position.y = -0.83 * (1 - Math.cos(a));
}

// ---------- the signs ----------
const SIGN_W = 11, SIGN_H = 1.7, SIGN_Y = 5.05; // metres; centred over the door, under the garage's top windows
const CW = 1024, CH = Math.round(CW * SIGN_H / SIGN_W);
const RED = '#FF2B00';
const css = (c) => '#' + new THREE.Color(c).getHexString();
const surname = (n) => String(n || '').replace(/^[A-Z]\.\s+/i, '').toUpperCase();

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  while (text.length > 1 && g.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}
// text with the house glow: a soft copy in the same colour under the crisp one
function glowText(g, text, x, y, col, blur = 10) {
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = blur; g.fillText(text, x, y);
  g.shadowBlur = 0; g.fillText(text, x, y);
}

// one sign: team colours down the left, the team, then a fixed slot for its driver and their position
function drawSign(sign) {
  const { g, team, mine } = sign, s = sign.state;
  g.clearRect(0, 0, CW, CH);
  g.fillStyle = '#0b0b0e'; g.fillRect(0, 0, CW, CH);
  // team colours: a block of the main colour, a stripe of the accent
  g.fillStyle = css(team.main); g.fillRect(0, 0, 44, CH);
  g.fillStyle = css(team.accent); g.fillRect(44, 0, 10, CH);
  const mid = CH / 2, pad = 34, slotW = 360, slotX = CW - slotW;
  g.textBaseline = 'middle'; g.letterSpacing = '-1px';
  // team name (dimmed when nobody's running for them today)
  // (a long name comes down a size or two before it's cut short)
  const room = slotX - 54 - pad * 2, name = team.name.toUpperCase();
  g.textAlign = 'left';
  for (let px = 62; px >= 44; px -= 3) { g.font = `700 ${px}px "SV Display", "Helvetica Neue", Arial, sans-serif`; if (g.measureText(name).width <= room) break; }
  glowText(g, fit(g, name, room), 54 + pad, mid + 2, s.driver ? '#f2f2f2' : '#6c6c72', 6);
  // the driver slot: a hairline, their name, their position
  g.fillStyle = mine ? RED : '#3a3a40'; g.fillRect(slotX, 22, 2, CH - 44);
  if (s.driver) {
    g.textAlign = 'left'; g.font = '500 40px "SV UI", "Helvetica Neue", Arial, sans-serif';
    glowText(g, fit(g, s.driver, slotW - 150 - pad), slotX + pad, mid + 1, mine ? RED : '#d8d8dc', 6);
    g.textAlign = 'right'; g.font = '700 56px "SV Display", "Helvetica Neue", Arial, sans-serif';
    glowText(g, s.pos, CW - pad, mid + 2, s.pos === 'PIT' || s.pos === 'OUT' ? '#ffb000' : RED, 10);
  }
  // your box: an outline in the house red
  if (mine) { g.strokeStyle = RED; g.lineWidth = 4; g.shadowColor = RED; g.shadowBlur = 8; g.strokeRect(2, 2, CW - 4, CH - 4); g.shadowBlur = 0; }
  sign.tex.needsUpdate = true;
}

// crews dress in the coveralls closest to their team's colours

// a crew: 4 on the wheel guns, a jack at each end, and the lollipop. Slots in the car's frame: [along, across, facing]
// (across > 0 is the garage side; facing is the yaw from the car's heading, 0 = facing the way the car points)
const ROLES = ['FL', 'FR', 'RL', 'RR', 'FJ', 'RJ', 'LP'];
// with the wheel takes (pit_off, pit_on): two more at each wheel, one who pulls the old one off (..o) and one with the
// new one (..n), either side of the gunman
const WHEEL_ROLES = ['FLo', 'FLn', 'FRo', 'FRn', 'RLo', 'RLn', 'RRo', 'RRn'];
const LIFT = 0.11; // (m: how far the jacks lift each end, wheels off the ground)
// The stop, in mocap (characters.js pit_*: Motion Cast's takes). Each role plays a stretch of its take, in seconds:
//   wait: looped while the car's coming in (else they hold the pose at a);
//   a..h: the work, from the car stopping: sped up to fit the stop, held at h if it's a long one (a penalty, repairs);
//   h..r: on the release (the jacks drop it and step away, the lollipop goes up), then they walk back as before.
// at h each one's hips are put on its spot by the car (where they are in the take at that moment: hipAt), the take's
// own forward (where the car was when it was performed) turned to the spot's facing
const MOCAP = {
  FL: 'pit_gun', FR: 'pit_gun', RL: 'pit_gun', RR: 'pit_gun', FJ: 'pit_jack_front', RJ: 'pit_jack_rear', LP: 'pit_lollipop',
  ...Object.fromEntries(WHEEL_ROLES.map(r => [r, r.endsWith('o') ? 'pit_off' : 'pit_on'])),
};
const BASE_MOCAP = ['pit_gun', 'pit_jack_front', 'pit_jack_rear', 'pit_lollipop'];
// by: how far into the stop each gets to h (1: at the release). The car goes up first, the old wheels come off, the new
// ones go on, the guns do them up, and down it comes. up / down: when the jacks lift it and drop it; grab / drop: when
// the old wheel comes off the car and is put down; fit: when the new one's on (the takes' own seconds, measured:
// .devtest/clipmeasure.mjs)
const SEG = {
  pit_gun: { wait: [0.2, 3.0], a: 3.17, h: 8.17, r: 8.17 },     // kneeling: waits, the nut off, waits, the nut on
  pit_jack_front: { a: 2.2, h: 4.67, r: 6.8, by: 0.3, up: [2.5, 3.0], down: [4.8, 5.15] }, // at the nose: levers it up, holds; drops it, backs off
  pit_jack_rear: { a: 2.8, h: 4.8, r: 5.75, by: 0.3, up: [2.8, 3.5], down: [5.0, 5.5] },   // down on the rear jack, holds; up
  pit_lollipop: { a: 1.4, h: 4.67, r: 8.2 },                   // the board down in front of the car; up, steps back
  pit_off: { wait: [0.4, 3.2], a: 3.3, h: 6.1, r: 8.9, by: 0.55, grab: 3.95, drop: 6.0 }, // kneeling: pulls the wheel off, puts it down beside
  pit_on: { wait: [0.2, 2.2], a: 2.3, h: 4.6, r: 5.9, by: 1, fit: 3.3 },              // crouched with the new one: on it goes, holds, steps back
};
// where a take starts: its wait loop, else the work
const take0 = (s) => s.wait ? s.wait[0] : s.a;
// where a take puts the hips (ground, in the character's own frame) and which way they face, at time t: measured once
// on a crew member (every look shares the skeleton)
const _hip = new Map();
function hipAt(ch, clip, t) {
  const key = clip + '@' + t; if (_hip.has(key)) return _hip.get(key);
  const was = ch.clip, o = ch.object, keep = [o.position.clone(), o.rotation.y];
  o.position.set(0, 0, 0); o.rotation.y = 0;
  ch.play(clip, { fade: 0, once: true }); ch.action.time = t; ch.mixer.update(0); o.updateMatrixWorld(true);
  const w = (n) => o.worldToLocal(ch.bone(n).getWorldPosition(new THREE.Vector3()));
  const hp = w('Hips'), l = w('LeftUpLeg'), r = w('RightUpLeg');
  // (facing +Z, the left hip's at +X: the turn from that to where the left hip is now)
  const out = { x: hp.x, z: hp.z, yaw: -Math.atan2(l.z - r.z, l.x - r.x) };
  o.position.copy(keep[0]); o.rotation.y = keep[1]; if (was) ch.play(was, { fade: 0 });
  _hip.set(key, out); return out;
}
// and where its hands are (between them, in its own frame), which way from the hips (yaw), how high: the wheel men
// are put by their hands, on the wheel
const _hand = new Map();
function handAt(ch, clip, t) {
  const key = clip + '@' + t; if (_hand.has(key)) return _hand.get(key);
  const was = ch.clip, o = ch.object, keep = [o.position.clone(), o.rotation.y];
  o.position.set(0, 0, 0); o.rotation.y = 0;
  ch.play(clip, { fade: 0, once: true }); ch.action.time = t; ch.mixer.update(0); o.updateMatrixWorld(true);
  const w = (n) => o.worldToLocal(ch.bone(n).getWorldPosition(new THREE.Vector3()));
  const h = w('LeftHand').add(w('RightHand')).multiplyScalar(0.5), hp = w('Hips');
  const out = { x: h.x, y: h.y, z: h.z, dir: Math.atan2(h.x - hp.x, h.z - hp.z) };
  o.position.copy(keep[0]); o.rotation.y = keep[1]; if (was) ch.play(was, { fade: 0 });
  _hand.set(key, out); return out;
}
// the lollipop's board: BRAKES (red) while they work, GO (green) to go
let _boards = null;
function boardTex() {
  if (_boards) return _boards;
  const mk = (bg, text) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#111'; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 57, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${text.length > 3 ? 28 : 44}px "SV Display", "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 67);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return (_boards = { stop: mk('#d8180c', 'BRAKES'), go: mk('#18b832', 'GO') });
}
const HOME_IDLES = ['idle', 'idle_look', 'idle_stretch', 'kneel', 'kneel_point']; // (waiting at the box)

export class PitLife {
  constructor(race) {
    this.race = race; this.pit = race.pit; this.T = race.T; this.A = race.A;
    this.root = new THREE.Group(); this.root.name = 'PitLife';
    race.scene.add(this.root);
    this.boxes = []; this.alive = true;
    if (!this.pit) return;
    const pit = this.pit, T = this.T, sd = pit.side, n = pit.boxes.length;
    // who's in each box: the team whose cars use it (race.boxSlot: yours is the last), else the team that would be
    const slot = (t) => race.boxSlot(t), field = new Set(race.cars.map(c => slot(c.teamIdx)));
    for (const t of race.qualiTeams || []) if (race.quali) field.add(slot(t));
    pit.boxes.forEach((bi, k) => {
      const cars = race.cars.filter(c => slot(c.teamIdx) === k);
      const pl = cars.find(c => c.isPlayer);
      // (an empty box: the team whose own it'd be, by the same swap)
      const tk = race.player ? [...Array(Math.max(n, TEAMS.length)).keys()].find(t => t < TEAMS.length && slot(t) === k) : k;
      const team = pl ? pl.team : cars[0]?.team || (tk != null && tk < TEAMS.length ? race.teamFor(tk) : null);
      if (!team) { this.shut(k); return; }
      const face = pit.CEN[bi] + pit.width / 2 + 0.6; // the garage fronts
      const b = { k, bi, team, tk: pl ? pl.teamIdx : cars[0] ? cars[0].teamIdx : tk, cars, mine: !!pl, face, crew: [], active: field.has(k), car: null, phase: 'home', t: 0, lift: 0, F: boxFrame(T, this.A, pit, k) };
      this.boxes.push(b);
      this.makeSign(b);
    });
    // what's in the boxes: your model of one (models/pitbox.glb: js/pitbox.js), else the game's own things and
    // furniture (js/pitboxes.js dressBox, js/pitprops.js)
    loadPitBox().then(tpl => {
      if (!this.alive) return;
      const desk = (b) => b.mine && !!race.quali;
      if (tpl) { this.boxModel = tpl; fitBoxes(tpl, this.root, this.boxes.map(b => ({ F: b.F, k: b.k, team: b.team, mine: desk(b) }))); return; }
      for (const b of this.boxes) { const d = dressBox(T, this.A, pit, b.k, b.team, { name: b.team.name, desk: desk(b) }); if (d) this.root.add(d); }
      furnish(this.root, this.boxes.filter(b => b.F).map(b => ({ F: b.F, mine: b.mine }))).then(g => { if (g && !this.alive) g.removeFromParent(); });
    });
    // your box in practice and qualifying is where the garage menu is (js/pitgarage.js): the car parked in it is lit
    // by its ceiling lights, real ones, and its shell keeps the sun off. Here from the start of the session (a light
    // coming and going would rebuild every shader in the scene each time you went in or out)
    const me = race.quali && this.boxes.find(b => b.mine && b.F);
    if (me) {
      this.mine = me;
      for (const z of [3.6, 9.2]) { const l = new THREE.PointLight(0xfff2e0, 9, 12, 1.4); l.position.fromArray(me.F.P(0, z, BOX.ceil - 0.5)); this.root.add(l); }
      race.scene.getObjectByName('PitBoxes')?.traverse(o => { if (o.userData.box === me.k) o.castShadow = true; });
    }
    // fonts: draw again once the house faces are in (the first draw may have used the fallback)
    if (typeof document !== 'undefined' && document.fonts) Promise.all(['700 62px "SV Display"', '500 40px "SV UI"'].map(f => document.fonts.load(f))).then(() => { if (this.alive) for (const b of this.boxes) drawSign(b.sign); }).catch(() => {});
    // the teams' stands on the pit wall, their flags, the flag marshal (js/pitwall.js)
    this.wall = new PitWall(this);
    loadCharacters().then(ok => { if (ok && this.alive) { this.makeCrews(); this.wall.makePeople(); } });
  }

  // a box nobody's using: its shutter down (js/pitboxes.js)
  shut(k) {
    const m = shutBox(this.T, this.A, this.pit, k, this.race.scene.getObjectByName('PitBoxes')?.userData.mat);
    if (m) { m.userData.worldMat = true; this.root.add(m); }
  }

  // a point beside the track at box i: s across from the centre line (on the pit side), y up from the lane
  at(i, s, y = 0) {
    const T = this.T, sd = this.pit.side;
    return new THREE.Vector3(T.X[i] + T.RX[i] * s * sd, this.laneY(i) + y, T.Z[i] + T.RZ[i] * s * sd);
  }
  laneY(i) { const T = this.T, s = this.pit.side * T.W[i] / 2; return T.Y[i] + s * Math.sin(T.B[i]) + this.A.LIFT[i] + 0.024; }

  makeSign(b) {
    const T = this.T, sd = this.pit.side, i = b.bi;
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const g = new THREE.Group();
    // (on its garage's front: js/pitboxes.js; facing out over the lane)
    if (b.F) { g.position.fromArray(b.F.P(0, -0.16, SIGN_Y)); g.rotation.y = Math.atan2(-b.F.n[0], -b.F.n[1]); }
    else { g.position.copy(this.at(i, b.face - 0.16, SIGN_Y)); g.rotation.y = Math.atan2(-T.RX[i] * sd, -T.RZ[i] * sd); }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SIGN_W + 0.24, SIGN_H + 0.24, 0.24), new THREE.MeshLambertMaterial({ color: 0x1a1a1e }));
    frame.position.z = -0.06;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.z = 0.065;
    g.add(frame, face);
    this.root.add(g);
    b.sign = { g: c.getContext('2d'), tex, team: b.team, mine: b.mine, state: { driver: '', pos: '' }, key: '' };
    this.refreshSign(b, true);
  }
  // what the sign says now: the driver, and where they are (P3), in the pits, or out of it
  refreshSign(b, force) {
    const race = this.race, car = b.cars.find(c => c.isPlayer) || b.cars[0];
    let driver = '', pos = '';
    if (car) {
      driver = car.isPlayer ? surname(race.opts.playerName || 'You') : surname(car.name);
      const live = race.state === 'racing' || race.state === 'finished';
      if (race.quali) pos = ''; // (practice / qualifying: in the garage isn't out of it)
      else if (car.gone) pos = 'OUT';
      else if (car.pitting && live && !race.quali) pos = 'PIT';
      else if (live && !race.quali && car.pos) pos = 'P' + car.pos;
      else pos = '';
    } else if (race.quali && b.active) {
      driver = surname(b.team.driver);
      const e = race.quali.field?.find(f => race.boxSlot(f.teamIdx) === b.k);
      if (e) driver = surname(e.name);
    }
    const key = driver + '|' + pos;
    if (!force && key === b.sign.key) return;
    b.sign.key = key; b.sign.state = { driver, pos };
    drawSign(b.sign);
  }

  makeCrews() {
    for (const b of this.boxes) {
      if (!b.active) continue;
      // the team's crew kit (Livery Designer → Uniform): team suits by default, or the stock coveralls in a colour near theirs
      const classic = fillLivery(b.team).crew.style === 'classic', look = classic ? classicCrewLook(b.team) : 'racer';
      b.group = new THREE.Group(); this.root.add(b.group);
      // (the wheel men only for races: practice and qualifying have no stops, and the garages are full enough)
      const roles = !this.race.quali && hasClip('pit_off') && hasClip('pit_on') ? [...ROLES, ...WHEEL_ROLES] : ROLES;
      roles.forEach((role, r) => {
        const ch = makeCharacter({ look, clip: 'idle', seed: b.k * 31 + r * 7 + 1, crew: !classic, livery: classic ? null : b.team, helmet: !this.race.quali, face: this.race.quali ? (b.k * 5 + r * 3) % FACES.length : null }); // (no helmets in the garage)
        const m = { ch, role, k: 0, kT: 0, mode: role.endsWith('J') ? 'jack' : 'gun', x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, idleT: Math.random() * 8 };
        ch.post = (c) => crouchPose(c, c.clip && (c.clip.startsWith('kneel') || c.clip.startsWith('pit_')) ? 0 : m.k, m.mode); // (a kneel clip, or the mocap, is its own pose)
        // a prop in the right hand: the wheel gun, or the lollipop (red: brakes on; green: go)
        if (role === 'LP') m.board = this.attachLollipop(ch, hasClip('pit_lollipop'));
        else if (role.length === 3) m.wheel = true; // (the wheel men: their hands are for the wheels)
        else if (role !== 'FJ' && role !== 'RJ') this.attachGun(ch);
        else if (hasClip(MOCAP[role])) { m.jack = this.makeJack(); b.group.add(m.jack); }
        b.group.add(ch.object); b.crew.push(m);
      });
      this.homeSlots(b, true);
      // (the mocap, when the people file has it: where each take puts the hips, measured now, not mid-stop)
      if (this.mocapOn === undefined) {
        this.mocapOn = BASE_MOCAP.every(hasClip);
        if (this.mocapOn) { const ch = b.crew[0].ch; for (const c of new Set(Object.values(MOCAP))) if (hasClip(c)) { hipAt(ch, c, SEG[c].h); hipAt(ch, c, SEG[c].r); hipAt(ch, c, take0(SEG[c])); } ch.play('idle', { fade: 0 }); }
      }
      // practice and qualifying: the team's driver too, helmet off, about the box while the car's in
      if (this.race.quali && !b.mine && b.F && b.tk != null) {
        const did = this.race.driverId(b.tk, b.team);
        b.driver = makeCharacter({ look: 'racer', clip: 'talk_3', livery: driverLivery(did, b.team), face: driverFace(did), helmet: false, seed: b.k * 17 + 5 });
        b.driverName = b.team.driver || b.team.name; b.group.add(b.driver.object);
      }
    }
    // at night the garages' light spills out onto the crews (else they're black cut-outs against the doors). The people
    // share their materials, so this is undone in dispose()
    if (this.race.world.P.night) {
      this.lit = new Map();
      for (const b of this.boxes) for (const m of b.crew) m.ch.body.traverse(o => {
        if (!o.isSkinnedMesh) return;
        for (const mt of Array.isArray(o.material) ? o.material : [o.material]) if (mt.emissive && !this.lit.has(mt)) {
          this.lit.set(mt, [mt.emissive.getHex(), mt.emissiveMap]);
          mt.emissive.setHex(0x6a5a48); mt.emissiveMap = mt.map; mt.needsUpdate = true;
        }
      });
    }
  }
  attachProp(ch, mesh) {
    const hand = ch.bone('RightHand'); if (!hand) return;
    ch.object.updateMatrixWorld(true);
    const s = new THREE.Vector3(); hand.getWorldScale(s);
    mesh.scale.multiplyScalar(1 / (s.x || 1));
    hand.add(mesh);
  }
  attachGun(ch) {
    const g = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: 0x1c1c20 }), steel = new THREE.MeshLambertMaterial({ color: 0x9a9ca2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.24, 0.09), dark); body.position.y = 0.1;
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8), steel); socket.position.y = 0.25;
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), dark); hose.position.set(0, -0.08, -0.03); hose.rotation.x = 0.5;
    g.add(body, socket, hose);
    this.attachProp(ch, g);
  }
  attachLollipop(ch, mocap) {
    if (mocap) {
      // the grip the mocap was made with (the take's own lollipop on its hand, in this skeleton's RightHand frame,
      // measured in tools: the stick runs out from the palm). The take's pole was short (0.92 m): a real one's longer,
      // out over the car's nose, the board at its end turned to the driver (each frame: faceBoard)
      const a = new THREE.Vector3(-0.06, 0.08, 0.06), dir = new THREE.Vector3(0.79, 0.12, -0.22).sub(a).normalize(), len = 1.55, e = a.clone().addScaledVector(dir, len);
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, len, 6), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
      stick.position.copy(a).add(e).multiplyScalar(0.5); stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const T = boardTex(), mat = new THREE.MeshBasicMaterial({ map: T.stop });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), mat), back = new THREE.Mesh(disc.geometry, mat);
      back.rotation.y = Math.PI; disc.add(back); // (the words the right way round on both sides)
      disc.position.copy(e).addScaledVector(dir, 0.27);
      g.add(stick, disc); this.attachProp(ch, g);
      return { mat, disc, g, dir, go: false, set(go) { if (go !== this.go) { this.go = go; mat.map = go ? T.go : T.stop; mat.needsUpdate = true; } } };
    }
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    stick.position.y = 0.55;
    const T = boardTex(), mat = new THREE.MeshBasicMaterial({ map: T.stop, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), mat);
    disc.position.y = 1.15; disc.rotation.y = Math.PI / 2;
    g.add(stick, disc);
    this.attachProp(ch, g);
    return { mat, disc, go: false, set(go) { if (go !== this.go) { this.go = go; mat.map = go ? T.go : T.stop; mat.needsUpdate = true; } } };
  }

  // a jack (the mocap's jack men hold nothing): a lever from their hands down to the cradle under the car's nose or
  // tail, a foot on the ground there. Placed each frame by jackPose: the bar's a unit long along y, scaled to fit
  makeJack() {
    const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), mat); bar.name = 'bar';
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.42), mat); foot.name = 'foot';
    g.add(bar, foot); g.visible = false;
    return g;
  }
  jackPose(b, m) {
    const J = m.jack; if (!J) return;
    const car = b.car, on = !!m.mc && !!car;
    J.visible = on; if (!on) return;
    const ch = m.ch, hb = m._hands ||= [ch.bone('LeftHand'), ch.bone('RightHand')];
    const l = hb[0].getWorldPosition(new THREE.Vector3()), r = hb[1].getWorldPosition(new THREE.Vector3());
    const h = l.add(r).multiplyScalar(0.5);
    // the cradle: under the nose / tail while the car's there, else on the ground where it was (pulled clear)
    let f;
    if (b.phase === 'ready') { const y = ch.object.rotation.y; f = new THREE.Vector3(ch.object.position.x + Math.sin(y) * 1.1, 0, ch.object.position.z + Math.cos(y) * 1.1); } // (the car's still coming: the jack on the ground in front of them)
    else if (!m.mc.go || car.phys.speed < 1) {
      const P = car.phys.p, ph = car.phys, al = m.role === 'FJ' ? (P.body ? P.body[0] : (P.a ?? 1.6) + (P.ovh?.[0] ?? 0.9)) - 0.15 : -((P.body ? P.body[1] : (P.b ?? 1.6) + (P.ovh?.[1] ?? 0.9)) - 0.2);
      f = new THREE.Vector3(ph.x + Math.sin(ph.h) * al, 0, ph.z + Math.cos(ph.h) * al); m.jackAt = f.clone();
    } else f = m.jackAt || h.clone();
    const i = nearIdx(this.T, b.bi, f.x, f.z); f.y = this.laneY(i) + 0.12;
    const foot = J.getObjectByName('foot'), bar = J.getObjectByName('bar');
    foot.position.set(f.x, f.y - 0.07, f.z); foot.rotation.y = car.phys.h;
    bar.position.copy(f).add(h).multiplyScalar(0.5);
    bar.scale.y = Math.max(0.1, f.distanceTo(h));
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), h.clone().sub(f).normalize());
  }

  // waiting: in the garage door (and not drawn there: 84 people standing about in front of the boxes cost the start
  // straight a third of its frame), facing the lane. They come out of it when their car's coming in
  homeSlots(b, snap) {
    const T = this.T, sd = this.pit.side, N = T.N;
    const gap = Math.min(1.35, ((b.F ? b.F.dw : 5.5) * 2 - 1) / Math.max(1, b.crew.length - 1)); // (the whole crew in the door)
    b.crew.forEach((m, r) => {
      const along = (r - (b.crew.length - 1) / 2) * gap + Math.sin(r * 12.9 + b.k) * gap * 0.18;
      const i = (b.bi + Math.round(along / T.ds) + N) % N;
      const p = b.F ? new THREE.Vector3().fromArray(b.F.P(along, -0.3, 0.004)) : this.at(i, b.face - 0.3);
      m.tx = p.x; m.tz = p.z; m.tyaw = Math.atan2(-T.RX[i] * sd, -T.RZ[i] * sd) + Math.sin(r * 7.3 + b.k) * 0.5; m.kT = 0;
      if (snap) { m.x = m.tx; m.z = m.tz; m.yaw = m.tyaw; }
    });
  }
  // around the car: where its wheels, nose and tail are. pose = { x, z, h } (the car's centre and heading)
  workSlots(b, car, pose, working) {
    const P = car.phys.p, a = P.a ?? 1.6, rb = P.b ?? 1.6, hw = (P.track ?? 1.6) / 2;
    const box = (P.body ? { f: P.body[0], r: P.body[1] } : { f: a + (P.ovh?.[0] ?? 0.9), r: rb + (P.ovh?.[1] ?? 0.9) });
    const fx = Math.sin(pose.h), fz = Math.cos(pose.h);
    // (x, z) = pose + f * along + g * across, where g points to the garage side
    const T = this.T, i = b.bi, sd = this.pit.side;
    let gx = fz, gz = -fx; if (gx * T.RX[i] * sd + gz * T.RZ[i] * sd < 0) { gx = -gx; gz = -gz; }
    const out = hw + 0.62;
    const S = {
      FL: [a, out, 1], FR: [a, -out, -1], RL: [-rb, out, 1], RR: [-rb, -out, -1],
      FJ: [box.f + (working ? 0.75 : 2.4), working ? 0 : hw + 1.0, 0], RJ: working ? [-box.r - 0.85, 0, 2] : [-box.r - 0.6, hw + 0.8, 2],
      LP: [box.f + 0.5, hw + 1.25, 3],
    };
    const yawF = Math.atan2(fx, fz), yawG = Math.atan2(gx, gz);
    b.g = { x: gx, z: gz };
    for (const m of b.crew) {
      if (m.wheel) {
        // the hub (its outside face), and where they hold it from: off the gunman's line, the one taking the old
        // wheel off from behind it, the one with the new one from in front. Their hands, at the moment it comes off /
        // goes on, are on the hub
        const front = m.role[0] === 'F', side = m.role[1] === 'L' ? 1 : -1, off = m.role.endsWith('o');
        const al = front ? a : -rb, hx = pose.x + fx * al + gx * side * (hw + 0.12), hz = pose.z + fz * al + gz * side * (hw + 0.12);
        const clip = MOCAP[m.role], H = handAt(m.ch, clip, off ? SEG[clip].grab : SEG[clip].fit);
        const th = (off ? 1 : -1) * 0.75, ix = -gx * side, iz = -gz * side; // (in, towards the car; turned towards its tail / nose)
        const dx = ix * Math.cos(th) + fx * Math.sin(th), dz = iz * Math.cos(th) + fz * Math.sin(th);
        const yaw = Math.atan2(dx, dz) - H.dir, c = Math.cos(yaw), sn = Math.sin(yaw);
        m.tx = hx - (H.x * c + H.z * sn); m.tz = hz - (-H.x * sn + H.z * c); m.tyaw = yaw; m.kT = 0; m.hub = { x: hx, z: hz };
      } else {
        const [al, ac, f] = S[m.role];
        m.tx = pose.x + fx * al + gx * ac; m.tz = pose.z + fz * al + gz * ac;
        // facing: 1 / -1 towards the car from the garage / far side, 0 back at the nose (jack), 2 at the tail, 3 the cockpit
        m.tyaw = f === 1 ? yawG + Math.PI : f === -1 ? yawG : f === 0 ? yawF + Math.PI : f === 2 ? yawF : Math.atan2(pose.x - m.tx, pose.z - m.tz);
        m.kT = working ? (m.mode === 'jack' ? 0.62 : m.role === 'LP' ? 0 : 0.86) : 0;
      }
      // the far side (the car comes in from there) and the rear jack (it'd drive through him) wait out of its way,
      // stood, and step in once it's stopped
      m.clear = !working && (m.role[1] === 'R' || m.role === 'RJ');
      if (m.clear && m.role !== 'RJ') { m.tx -= gx * 1.6; m.tz -= gz * 1.6; }
      // the take's spot (m.sx/sz), and where they walk to for it: where its hips are as it starts (so it starts where
      // they stand: nobody slides)
      m.sx = m.tx; m.sz = m.tz;
      const clip = MOCAP[m.role];
      if (this.mocapOn && clip && hasClip(clip)) m.kT = 0; // (the take's their pose: no crouch on top, before or after)
      if (this.mocapOn && clip && hasClip(clip) && !m.clear) {
        const s = SEG[clip], o = this.mcOrigin(m, clip, s), H = hipAt(m.ch, clip, take0(s)), c = Math.cos(m.tyaw), sn = Math.sin(m.tyaw);
        m.tx = o.x + H.x * c + H.z * sn; m.tz = o.z - H.x * sn + H.z * c;
      }
    }
  }
  // where a crew member's drawn: (x, z) plus, while a take's fading in or out, the difference between where the two
  // put the hips (going down to nothing as the fade does: m.fo), plus any step out of the car's way (m.dg)
  // (st: the time the animation's moved on this frame, so the two keep in step when it's only every few frames)
  place(b, m, x, z, st) {
    let px = x, pz = z;
    if (m.fo) { const k = 1 - Math.min(1, (m.fo.t += st) / m.fo.T); px -= m.fo.x * k; pz -= m.fo.z * k; if (k <= 0) m.fo = null; }
    if (m.dg) { px += m.dg.x; pz += m.dg.z; }
    const i = nearIdx(this.T, b.bi, px, pz);
    m.ch.object.position.set(px, this.laneY(i), pz);
  }
  // off a take, onto their feet: from where the hips are, the fade's difference taken out as it goes (place)
  leaveTake(m, M) {
    const o = m.ch.object; o.updateMatrixWorld(true);
    const p = (m._hips ||= m.ch.bone('Hips')).getWorldPosition(new THREE.Vector3()), dx = m.dg ? m.dg.x : 0, dz = m.dg ? m.dg.z : 0;
    m.x = p.x - dx; m.z = p.z - dz; m.yaw = M.yaw; // (the root's turn kept: the fade turns the body round)
    m.fo = { x: p.x - o.position.x, z: p.z - o.position.z, t: 0, T: 0.2 };
    m.mc = null; if (m.jack) m.jack.visible = false;
    // (one fade, to what they'll be doing, and nothing else till it's done: three.js fades a clip out from full,
    // whatever it's at, so a second change mid-fade would snap the pose)
    m.ch.play(Math.hypot(m.tx - m.x, m.tz - m.z) > 0.3 ? 'walk' : 'idle', { fade: 0.2 });
  }
  // out of the car's way: anyone in its path as it comes in or goes (or is about to, on the release) steps aside, to
  // the side they're on, and back once it's past
  dodge(b, dt) {
    const car = b.car, ph = car && car.phys;
    const on = ph && (ph.speed > 0.3 || b.phase === 'release') && (b.phase === 'ready' || b.phase === 'release');
    const P = on && ph.p, hw = on ? (P.track ?? 1.6) / 2 : 0;
    const fr = on && (P.body ? P.body[0] : (P.a ?? 1.6) + 0.9), rr = on && (P.body ? P.body[1] : (P.b ?? 1.6) + 0.9);
    const fx = on && Math.sin(ph.h), fz = on && Math.cos(ph.h), lx = fz, lz = -fx;
    const gs = on && b.g ? Math.sign(b.g.x * lx + b.g.z * lz) || 1 : 1, v = new THREE.Vector3();
    for (const m of b.crew) {
      let tx = 0, tz = 0;
      if (on) {
        const h = m._hips ||= m.ch.bone('Hips');
        if (h) h.getWorldPosition(v); else v.copy(m.ch.object.position);
        const dx = v.x - (m.dg ? m.dg.x : 0) - ph.x, dz = v.z - (m.dg ? m.dg.z : 0) - ph.z;
        const f = dx * fx + dz * fz, s = dx * lx + dz * lz, w = hw + 0.5;
        if (f < fr + 0.6 + Math.min(5, ph.speed * 0.6) && f > -rr - 0.25 && Math.abs(s) < w) {
          const to = (Math.abs(s) < 0.15 ? gs : Math.sign(s)) * (w + 0.05);
          tx = lx * (to - s); tz = lz * (to - s);
        }
      }
      const d = m.dg || (m.dg = { x: 0, z: 0 }), ex = tx - d.x, ez = tz - d.z, e = Math.hypot(ex, ez), mv = Math.min(e, 3.2 * dt);
      if (e > 1e-4) { d.x += ex / e * mv; d.z += ez / e * mv; }
      if (!tx && !tz && Math.hypot(d.x, d.z) < 1e-3) m.dg = null;
    }
  }

  update(dt) {
    if (!this.pit || !this.boxes.length) return;
    const race = this.race, T = this.T, N = T.N, cam = race.camera.position;
    this.signT = (this.signT || 0) + dt;
    const signs = this.signT > 0.25; if (signs) this.signT = 0;
    const n = this.pit.boxes.length;
    if (this.wall) this.wall.update(dt, cam);
    // what's inside the boxes, their rooms and all that's in them: only seen through the doors, so not drawn from
    // across the circuit (a hundred and fifty-odd draws for dark specks)
    if (!this.laneBB) {
      this.laneBB = new THREE.Box3(); for (const b of this.boxes) if (b.F) this.laneBB.expandByPoint(new THREE.Vector3().fromArray(b.F.P(0, 7, 0))); this.laneBB.expandByScalar(20);
      this.rooms = []; race.scene.getObjectByName('PitBoxes')?.traverse(o => { if (o.userData.room) this.rooms.push(o); });
    }
    const inside = this.laneBB.isEmpty() || this.laneBB.distanceToPoint(cam) < 250;
    if (inside !== this.inside) { this.inside = inside; for (const o of this.rooms) o.visible = inside; }
    for (const g of this.root.children) if (g.name === 'BoxDress' || g.name === 'PitProps') g.visible = inside;
    for (const b of this.boxes) {
      b.cars = race.cars.filter(c => race.boxSlot(c.teamIdx) === b.k); // (online, cars come and go)
      if (signs) this.refreshSign(b);
      if (race.quali && b.F) { this.atWork(b, dt, cam); b.liftF = b.liftR = 0; } else this.crewUpdate(b, dt, cam);
      for (const c of b.cars) { const on = c === b.car; c.liftF = on ? b.liftF || 0 : 0; c.liftR = on ? b.liftR || 0 : 0; } // (each end, on its jack: race.js placeModel)
    }
  }
  crewUpdate(b, dt, cam) {
    if (!b.crew.length) return;
    const race = this.race, T = this.T, N = T.N, pit = this.pit;
    const bp = this.at(b.bi, b.face - 3), dist = bp.distanceTo(cam);
    // far away: nobody's watching, skip them (and the pose work), but keep the stop logic running
    // (and nobody's out unless their car is coming in, in or just leaving: at home they're in the garage door)
    const inside = b.phase === 'home' && b.crew.every(m => Math.hypot(m.tx - m.x, m.tz - m.z) < 0.06);
    const show = dist < 260 && !inside; b.group.visible = show;
    // the car coming in to this box (the first one that is)
    if (b.served && (!b.served.pitting || b.served.gone)) b.served = null; // (the car just seen out: not again until it's back out on track)
    let car = b.car;
    if (!car || car.gone || !car.pitting) {
      car = null;
      for (const c of b.cars) {
        if (c.gone || !c.pitting || (c.pitReq && (c.pitReq.dt || c.pitReq.garage)) || c.inGarage || c === b.served) continue;
        // (on its way in: before the box. An online rival doesn't say which phase it's in, so go by where it is)
        if (c.remote ? ((b.bi - c.idx + N) % N) * T.ds > T.L / 2 : c.pitPhase !== 'in') continue;
        if (pit.REG[c.idx] < 0 && ((pit.start - c.idx + N) % N) * T.ds > 120) continue;
        car = c; break;
      }
    }
    const toBox = car ? ((b.bi - car.idx + N) % N) * T.ds : 0, fromBox = car ? ((car.idx - b.bi + N) % N) * T.ds : 0;
    const prev = b.phase;
    if (b.phase === 'home' && car) { b.car = car; b.phase = 'ready'; }
    else if (b.phase === 'ready') {
      if (!car || car !== b.car) { b.phase = 'home'; b.car = null; }
      else if (car.phys.speed < 0.4 && (toBox < 2.5 || fromBox < 7) && (car.remote || car.pitPhase === 'stop')) { b.phase = 'work'; b.pose = { x: car.phys.x, z: car.phys.z, h: car.phys.h }; }
    } else if (b.phase === 'work') {
      // the release: the stop's nearly done (or, online, it's already moving)
      const done = !b.car || !b.car.pitting || b.car.pitPhase === 'out' || (b.car.pitPhase === 'stop' && b.car.pitTimer < 0.35) || (b.car.remote && b.car.phys.speed > 0.8);
      if (done) { b.phase = 'release'; b.t = 0; }
    } else if (b.phase === 'release') {
      b.t += dt;
      const gone = !b.car || b.car.gone || !b.car.pitting || ((b.car.idx - b.bi + N) % N) * T.ds > 14 && ((b.car.idx - b.bi + N) % N) * T.ds < T.L / 2;
      if (gone && b.t > 0.8) { b.phase = 'home'; b.served = b.car; b.car = null; b.t = 0; }
    }
    if (b.phase !== prev || b.phase === 'ready' || b.phase === 'work') {
      if (b.phase === 'home') this.homeSlots(b);
      else if (b.phase === 'ready') {
        const i = b.bi, off = pit.CEN[i] + 2.4;
        this.workSlots(b, b.car, { x: T.X[i] + T.RX[i] * off * pit.side, z: T.Z[i] + T.RZ[i] * off * pit.side, h: Math.atan2(T.FX[i], T.FZ[i]) }, false);
      } else if (b.phase === 'work') {
        const p = b.car.phys; b.pose = { x: p.x, z: p.z, h: p.h };
        this.workSlots(b, b.car, b.pose, true);
      } else if (b.phase === 'release' && prev === 'work') {
        for (const m of b.crew) { m.kT = 0; if (m.mc) m.mc.go = true; } // up off the wheels, guns away; the mocap plays on
      }
    }
    // the stop's own clock (seconds into the work), for the takes' timings (stopP)
    if (b.phase === 'work') b.wt = prev === 'work' ? (b.wt || 0) + dt : 0;
    // the wheels back on, whatever happened (a stop cut short, a take abandoned), and the old ones cleared away
    if (b.phase !== prev && (b.phase === 'release' || b.phase === 'home')) this.wheelsBack(b, b.phase === 'home');
    // the car on its jacks: each end up and down as its jack man levers it (else, no takes: both, while they work)
    // (their jack man not under it yet, still on his way: it waits for him)
    const ease = (v, to) => v + (to - v) * Math.min(1, dt * (b.phase === 'work' ? 10 : 16));
    const jack = (role, v) => {
      const m = b.crew.find(q => q.role === role), M = m && m.mc, s = M && M.s;
      if (show && s && s.up && b.car && m.ch.action) { const t = m.ch.action.time; return LIFT * smooth((t - s.up[0]) / (s.up[1] - s.up[0])) * (1 - smooth((t - s.down[0]) / (s.down[1] - s.down[0]))); }
      return ease(v || 0, b.phase === 'work' && !(show && this.mocapOn && m) ? LIFT : 0);
    };
    b.liftF = jack('FJ', b.liftF); b.liftR = jack('RJ', b.liftR);
    // the lollipop: BRAKES while they work, GO to go
    const lp = b.crew.find(m => m.role === 'LP');
    if (lp && lp.board) lp.board.set(b.phase === 'release');
    if (!show) { for (const m of b.crew) { m.x = m.tx; m.z = m.tz; m.yaw = m.tyaw; m.k = m.kT; m.fo = m.dg = null; } return; }
    this.dodge(b, dt);
    // far-ish: animate at a lower rate
    const every = dist < 90 ? 1 : 3;
    b.tick = ((b.tick || 0) + 1) % every; b.acc = (b.acc || 0) + dt;
    const step = b.tick === 0 ? b.acc : 0; if (step) b.acc = 0;
    const hurry = b.phase === 'ready' || b.phase === 'work';
    for (const m of b.crew) {
      if (this.mocap(b, m, dt, step)) continue;
      const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz);
      const v = hurry || b.phase === 'release' ? 2.6 : 1.35, mv = Math.min(d, v * dt);
      let clip, speed = 1;
      // (still fading off a take: on the move, but no turning (it'd swing the take's pose round) or change of clip)
      if (m.fo && m.fo.T === 0.2) {
        if (d > 0.06) { m.x += dx / d * mv; m.z += dz / d * mv; }
        this.place(b, m, m.x, m.z, step); m.ch.object.rotation.y = m.yaw;
        if (step) m.ch.update(step);
        continue;
      }
      if (d > 0.06) {
        m.x += dx / d * mv; m.z += dz / d * mv;
        m.yaw = lerpYaw(m.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
        clip = 'walk'; speed = v / 1.35;
        if (d < 0.4 && m.kT > 0) clip = 'idle'; // (stepping in to a wheel: no stride for the last bit)
      } else {
        m.yaw = lerpYaw(m.yaw, m.tyaw, Math.min(1, dt * 8));
        const gun = m.mode === 'gun' && m.role !== 'LP';
        if (MOCAP[m.role] && this.mocapOn && (b.phase === 'ready' && !m.clear || b.phase === 'work') && b.car) { this.mocapStart(b, m, dt); continue; } // (in place: the mocap from here)
        if (gun && b.phase === 'work' && m.kT > 0) clip = 'kneel'; // on one knee at the wheel
        else if (gun && b.phase === 'ready') clip = 'kneel_down';  // in their spot for the car: down on one knee
        else if (m.role === 'LP' && (b.phase === 'work' || b.phase === 'ready')) clip = 'point';
        else if (b.phase === 'release' && m.role === 'LP') clip = 'wave';
        else if (b.phase === 'home') {
          m.idleT -= dt;
          if (m.idleT <= 0 || !HOME_IDLES.includes(m.ch.clip)) {
            const r = Math.random(); m.idle = r < 0.45 ? 'idle' : r < 0.7 ? 'idle_look' : r < 0.82 ? 'idle_stretch' : r < 0.92 ? 'kneel' : 'kneel_point'; m.idleT = 5 + Math.random() * 9;
          }
          clip = m.idle || 'idle';
        } else clip = 'idle';
      }
      m.k += (m.kT - m.k) * Math.min(1, dt * 9);
      if (clip === 'kneel_down') { if (m.ch.clip !== 'kneel_down' && m.ch.clip !== 'kneel') m.ch.play('kneel_down', { once: true, then: 'kneel', speed: 1.6, fade: 0.2 }); }
      else m.ch.play(clip, { speed, fade: clip === 'kneel' && m.ch.clip === 'walk' ? 0.12 : 0.2 });
      this.place(b, m, m.x, m.z, step);
      m.ch.object.rotation.y = m.yaw;
      if (step) m.ch.update(step);
    }
    // the board out in front of the driver's eyes (the pole pointed there from his hands: the take was made with a
    // shorter man and pole), turned to them
    if (lp && lp.board && b.car && b.phase !== 'home') {
      // (eye: up over the nose, in the driver's line of sight, above the jack man crouched at the nose)
      const p = b.car.phys, B = lp.board, eye = new THREE.Vector3(p.x + Math.sin(p.h) * 1.6, b.car.y + 2.1, p.z + Math.cos(p.h) * 1.6);
      if (B.g && lp.mc) {
        const hand = B.g.parent, grip = hand.getWorldPosition(new THREE.Vector3()), q = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
        B.g.quaternion.setFromUnitVectors(B.dir, eye.clone().sub(grip).normalize().applyQuaternion(q));
      } else if (B.g) B.g.quaternion.identity();
      B.disc.lookAt(p.x, b.car.y + 1.0, p.z);
    }
  }
  // how far through the stop it is (0..1): the car's service clock (after any penalty it sits out first); a rival
  // online doesn't say, so about how long one takes
  stopP(b) {
    const c = b.car;
    if (c && !c.remote && c.pitPhase === 'stop' && c.pitTotal) {
      const pen = c.penServing || 0, T = Math.max(0.5, c.pitTotal - pen - 0.35);
      return Math.max(0, Math.min(1, (c.pitTotal - c.pitTimer - pen) / T));
    }
    return Math.min(1, (b.wt || 0) / 4.5);
  }
  // ---------- the wheels coming off and going on ----------
  // the car's wheel at a wheel man's corner (the model's: js/carmodel.js wheels[], its spinning part), by which end and
  // which side of the car (the garage side: b.g)
  cornerWheel(b, m) {
    const car = b.car, W = car && car.model && car.model.wheels; if (!W || !b.g) return null;
    const front = m.role[0] === 'F', side = m.role[1] === 'L' ? 1 : -1, p = car.phys, v = new THREE.Vector3();
    let best = null, bd = -Infinity;
    for (const w of W) { if (w.front !== front) continue; w.pivot.getWorldPosition(v); const d = side * ((v.x - p.x) * b.g.x + (v.z - p.z) * b.g.z); if (d > bd) { bd = d; best = w; } }
    return best;
  }
  // a wheel to carry: a copy of the car's (its tire, rim, disc), in the world
  wheelCopy(w) {
    const c = w.mesh.clone(true); c.visible = true; c.matrixAutoUpdate = true;
    w.mesh.updateWorldMatrix(true, false); w.mesh.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    this.root.add(c); return c;
  }
  // each frame a wheel man's take plays: the old wheel off the car into his hands, down on the ground; the new one in
  // his hands till it's on
  wheelStep(b, m) {
    const M = m.mc; if (!M || !b.car || !m.ch.action) return;
    const w = m.cw && m.cw.car === b.car ? m.cw.w : (m.cw = { car: b.car, w: this.cornerWheel(b, m) }).w; if (!w) return;
    const t = m.ch.action.time, s = M.s, ch = m.ch, hb = m._hands ||= [ch.bone('LeftHand'), ch.bone('RightHand')];
    const hands = hb[0].getWorldPosition(new THREE.Vector3()).add(hb[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const hub = w.mesh.getWorldPosition(new THREE.Vector3());
    if (M.clip === 'pit_off') {
      if (t < s.grab || b.phase === 'ready') { if (m.prop && !m.prop.userData.down) m.prop.visible = false; return; }
      if (!m.prop) { m.prop = this.wheelCopy(w); m.prop.userData.from = hub.clone(); m.prop.userData.t0 = t; }
      w.mesh.visible = false;
      const P = m.prop, r = w.r || 0.33;
      if (t < s.drop) { const k = smooth((t - P.userData.t0) / 0.3); P.position.copy(P.userData.from).lerp(hands, k); P.visible = true; }
      else if (!P.userData.down) { P.userData.down = true; P.position.y = this.laneY(nearIdx(this.T, b.bi, P.position.x, P.position.z)) + r; } // (put down, stood on its tire)
    } else {
      if (!m.prop) m.prop = this.wheelCopy(w);
      const P = m.prop;
      if (t < s.fit) { P.visible = true; P.position.copy(hands); if (t > s.fit - 0.25) P.position.lerp(hub, smooth((t - (s.fit - 0.25)) / 0.25)); }
      else { P.visible = false; w.mesh.visible = true; }
    }
  }
  // the car's wheels all back on (the release: in case a take didn't get there); home: the old ones taken away too
  wheelsBack(b, all) {
    for (const m of b.crew) {
      if (m.cw && m.cw.w) m.cw.w.mesh.visible = true;
      if (m.prop && (all || m.role.endsWith('n'))) { m.prop.removeFromParent(); m.prop = null; }
      if (all) m.cw = null;
    }
    const c = b.car || b.served; if (c && c.model && c.model.wheels) for (const w of c.model.wheels) w.mesh.visible = true;
  }

  // ---------- the stop, in mocap ----------
  // m.mc: { clip, s (SEG), go (released) } while a crew member's take is playing. Started once they're on their spot
  // with the car coming or in; it owns them (position, clip) until it's played out, then the walking above takes over
  // from wherever the take left them.
  mocapStart(b, m, dt) {
    const clip = MOCAP[m.role], s = SEG[clip], ch = m.ch;
    // (the hips at the work's end on the spot, facing the way the spot faces; a wheel man's spot is where he's put)
    const o = this.mcOrigin(m, clip, s);
    m.mc = { clip, s, go: false, ox: o.x, oz: o.z, yaw: m.tyaw };
    // (drawn from where they stand, over to the take's own place as it fades in)
    m.fo = { x: o.x - m.x, z: o.z - m.z, t: 0, T: 0.25 };
    ch.play(clip, { fade: 0.25, once: true }); ch.action.time = s.wait ? s.wait[0] : s.a; ch.action.timeScale = 0;
  }
  mocap(b, m, dt, step) {
    const M = m.mc; if (!M) { if (m.jack) m.jack.visible = false; return false; }
    const ch = m.ch, A = ch.action, s = M.s, car = b.car;
    if (!A || ch.clip !== M.clip || b.phase === 'home' && !M.go) { m.mc = null; return false; }
    if (b.phase === 'ready') {
      // waiting for the car: the gunners' loop, the others still at a
      if (s.wait) { A.timeScale = 1; if (A.time >= s.wait[1]) A.time = s.wait[0]; } else { A.time = s.a; A.timeScale = 0; }
    } else if (b.phase === 'work' && !M.go) {
      if (!M.t0) { M.t0 = true; if (A.time < s.a) A.time = s.a; }
      // (the spot, now around where the car really stopped: slide over to it if it's close, else walk there and start again)
      const H = hipAt(ch, M.clip, s.h), yaw = m.tyaw, o = this.mcOrigin(m, M.clip, s), ox = o.x, oz = o.z, d = Math.hypot(ox - M.ox, oz - M.oz);
      if (d > 1.0) { this.leaveTake(m, M); return false; }
      if (d > 0.005) { const k = Math.min(1, 2 * dt / d); M.ox += (ox - M.ox) * k; M.oz += (oz - M.oz) * k; }
      M.yaw = lerpYaw(M.yaw, yaw, Math.min(1, dt * 6));
      // through the work as the stop goes (each take its own share of it: SEG by), never backwards, then held at h
      // (behind, having got there late: caught up at up to 3.5x, not jumped, so nothing's missed)
      let want = s.a + (s.h - s.a) * Math.min(1, this.stopP(b) / (s.by || 1));
      // (one thing after another at each corner: the wheel off once its end's up, the new one on once the old one's away)
      if (M.clip === 'pit_off' && (m.role[0] === 'F' ? b.liftF : b.liftR) < LIFT * 0.8) want = Math.min(want, s.grab - 0.05);
      if (M.clip === 'pit_on') { const o = b.crew.find(q => q.role === m.role.slice(0, 2) + 'o'); if (o && (!o.mc || o.ch.action.time < 5.0)) want = Math.min(want, s.fit - 0.35); }
      A.timeScale = 0; A.time = Math.min(s.h, A.time + Math.max(0, Math.min(want - A.time, dt * 3.5)));
    } else {
      // released: the rest of the take at its own pace, then back to walking from where it left them
      if (A.time < s.h) A.time = s.h;
      A.timeScale = 1;
      // (the front jack's man, in front of the car: off as soon as it's down, out of its way, not backing off ahead of it)
      const end = M.clip === 'pit_jack_front' ? s.down[1] + 0.05 : s.r;
      if (A.time >= end - 0.02 || s.r <= s.h) {
        this.leaveTake(m, M);
        if (M.clip === 'pit_jack_front' && b.car && b.g) { const P = b.car.phys.p, w = (P.track ?? 1.6) / 2 + 1.1; m.tx = m.x + b.g.x * w; m.tz = m.z + b.g.z * w; }
        return false;
      }
    }
    this.place(b, m, M.ox, M.oz, step); ch.object.rotation.y = M.yaw;
    if (step) { ch.update(step); ch.object.updateMatrixWorld(true); this.jackPose(b, m); if (m.wheel) this.wheelStep(b, m); }
    return true;
  }
  // where a take's character stands for its spot: a wheel man right where he's put (his hands on the wheel), the rest
  // with their hips on the spot at the work's end
  mcOrigin(m, clip, s) {
    const x = m.sx ?? m.tx, z = m.sz ?? m.tz;
    if (m.wheel) return { x, z };
    const H = hipAt(m.ch, clip, s.h), c = Math.cos(m.tyaw), sn = Math.sin(m.tyaw);
    return { x: x - (H.x * c + H.z * sn), z: z - (-H.x * sn + H.z * c) };
  }

  // ---------- practice and qualifying: the boxes at work ----------
  // The field's laps are worked out, not driven (js/race.js quali.field: each team's runs, plan[].at), so a box shows
  // where its car is: in the box on its stands between runs, the crew round it (on the wheels, at the bench, leaning
  // on the work bench, talking), the driver by it with an engineer; out on a run, an empty bay and the crew in the door
  // watching the track. Your own box: the engineer at the bench, two talking at the back, the rest out front.
  // (positions in the box's frame: x along its front, z in; face: the way they look; a person, or one of the others)
  atWork(b, dt, cam) {
    const race = this.race, q = race.quali, F = b.F, d = BOX.depth, wx = F.wx;
    const mid = new THREE.Vector3().fromArray(F.P(0, 7, 0)), dist = mid.distanceTo(cam);
    // (where the car is: on a run from a couple of laps before its time is posted until it's back in)
    if (!b.mine && !b.entry) b.entry = (q.field || []).find(e => race.boxSlot(e.teamIdx) === b.k) || null;
    const e = b.entry, el = q.time - q.left;
    // (yours: out from when it's left the box till it's back in it; a live session (js/livesession.js): each car in
    // the box on its own side, out when it's out)
    let out, ins = null;
    if (race.live) {
      const cs = this.boxCars(b); b.carSpots ||= this.carSpots(b, cs.length);
      ins = b.carSpots.map((_, k) => cs.some(c => this.sideOf(c) === k && race.live.isIn(c)));
      out = !ins.some(x => x);
    } else out = b.mine ? !!(race.player && !race.player.inGarage) : !!e && e.plan.some(r => el > r.at - 2.3 * e.pot && el < r.at + 0.5 * e.pot);
    // (the camera inside another box (your garage menu, walking round someone's): this one's behind its walls)
    const o = F.P(0, 0, 0), t1 = F.P(1, 0, 0), cx = cam.x - o[0], cz = cam.z - o[2];
    const ax = (cx * (t1[0] - o[0]) + cz * (t1[2] - o[2])), az = cx * F.n[0] + cz * F.n[1];
    const walled = az > 0.3 && Math.abs(ax) > wx;
    const near = dist < 75 && !walled;
    // the car: built when you're near enough to see it, then kept
    if (!b.mine && e && near && !b.parked && !out && !race.live) this.parkCar(b);
    if (b.parked) b.parked.group.visible = !out && dist < 140 && !walled;
    const vis = near && !!b.crew.length; if (b.group) b.group.visible = vis;
    // (further off, the people move on every third frame)
    const every = dist < 30 ? 1 : 3; b.tick = ((b.tick || 0) + 1) % every; b.acc = (b.acc || 0) + dt;
    const step = b.tick === 0 ? b.acc : 0; if (step) b.acc = 0;
    const floorY = F.P(0, 7, BOX.floor)[1];
    // your model's boxes (js/pitbox.js): their people have minds of their own (js/pitcrew.js)
    if (this.boxModel && b.crew.length) { (b.brain ||= new BoxCrew(this, b, this.boxModel)).update(dt, { out, ins, vis, step, floorY }); return 0; }
    const slots = this.workPlan(b, out, wx, d);
    const people = [...b.crew.map((m, r) => ({ m, s: slots[m.role] })), ...(b.driver ? [{ m: b.dm ||= { ch: b.driver, x: 0, z: 0, yaw: 0, k: 0, kT: 0, role: 'DR', placed: false }, s: out ? null : slots.DR }] : [])];
    if (b.driver) b.driver.object.visible = !out;
    for (const { m, s } of people) {
      if (!s) continue;
      const P = F.P(s[0], s[1], 0), A = F.P(s[0] + s[2][0], s[1] + s[2][1], 0);
      m.tx = P[0]; m.tz = P[2]; m.tyaw = Math.atan2(A[0] - P[0], A[2] - P[2]); m.kT = 0;
      if (!m.placed) { m.x = m.tx; m.z = m.tz; m.yaw = m.tyaw; m.placed = true; }
      // (talked to: turned to you for a moment)
      if (m === b.dm && b.talkT > 0) { b.talkT -= dt; m.tyaw = Math.atan2(b.talkAt.x - m.x, b.talkAt.z - m.z); }
      if (!vis) { m.x = m.tx; m.z = m.tz; m.yaw = m.tyaw; continue; }
      const dx = m.tx - m.x, dz = m.tz - m.z, dd = Math.hypot(dx, dz);
      let clip = s[3], speed = 1;
      if (dd > 0.08) { const mv = Math.min(dd, 1.35 * dt); m.x += dx / dd * mv; m.z += dz / dd * mv; m.yaw = lerpYaw(m.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); clip = 'walk'; }
      else { m.yaw = lerpYaw(m.yaw, m.tyaw, Math.min(1, dt * 6)); if (m === b.dm && b.talkT > 0) clip = 'talk'; }
      m.k += (m.kT - m.k) * Math.min(1, dt * 9);
      m.ch.play(clip, { speed, fade: 0.3 });
      m.ch.object.position.set(m.x, floorY + (s[4] || 0) - (s[1] < BOX.frontT ? BOX.floor : 0), m.z); m.ch.object.rotation.y = m.yaw; // (out in the lane: a step down)
      if (step) m.ch.update(step);
    }
    return 0;
  }
  // who stands where (see atWork): role -> [x, z, face, clip, lift]
  workPlan(b, out, wx, d) {
    const toward = (a, c) => [c[0] - a[0], c[1] - a[1]];
    if (b.mine) { // (the desk's side of your box is left alone: the talkers on the other)
      const o = b.F.mirror ? -1 : 1;
      return { RR: [0, d - 1.55, [0, 1], 'sit_desk', 0.03], RJ: [o * 3.4, 10.4, [-o * 0.6, 0.8], 'talk_2'], LP: [o * 2.9, 11.2, [o * 0.6, -0.8], 'talk'],
        FL: [-3.2, -0.9, [0, -1], 'idle_look'], FR: [3.2, -0.9, [0, -1], 'idle'], FJ: [-1.4, -1.1, [0.2, -1], 'idle'], RL: [1.6, -1.0, [-0.2, -1], 'idle_look'] };
    }
    if (out) return { // (the car's out: in the door, watching; the engineer at the screens)
      RR: [0, d - 1.55, [0, 1], 'sit_desk', 0.03], FL: [-3.0, 1.2, [0, -1], 'idle_look'], FR: [-1.5, 1.0, [0.2, -1], 'idle'], FJ: [0.2, 1.3, [0, -1], 'idle_look'],
      RJ: [1.7, 1.1, [-0.2, -1], 'idle'], LP: [3.1, 1.4, [0, -1], 'point'], RL: [wx - 1.15, 8.2, [-1, 0], 'lean'] };
    const D = [-2.3, 7.4], E = [-2.85, 6.4], R1 = [-3.5, 10.2], R2 = [-2.8, 10.9];
    return {
      FL: [-1.35, 4.75, [1, 0], 'kneel_point'], FR: [1.35, 4.9, [-1, 0], 'kneel'],          // on the front wheels
      RL: [wx - 1.15, 8.2, [-1, 0], 'lean'],                                                 // leaning on the work bench
      RR: [0, d - 1.55, [0, 1], 'sit_desk', 0.03],                                          // the engineer at the screens
      FJ: [...E, toward(E, D), 'talk'], DR: [...D, toward(D, E), 'talk_3'],                  // the driver and an engineer
      RJ: [...R1, toward(R1, R2), 'talk_2'], LP: [...R2, toward(R2, R1), 'idle_look'],     // two at the back
    };
  }
  // ---------- the cars' places in a box ----------
  // the cars that belong in box b (yours first, then by team: a team of two shares a box, and so do two teams when
  // there are more teams than boxes)
  // (online, the same on every machine: the cars of everyone's copy count, the host's car first, then its co-op
  // partner's, so a shared box has the host on your model's side and the guest across from it on both screens)
  boxCars(b) {
    const race = this.race, net = race.net;
    const rank = (c) => { if (!net || !c.human) return c.isPlayer ? 0 : 3; const g = net.grid.find(x => 'h:' + x.id === c.key); return g && g.pid === 'P' ? 0 : 1; };
    return race.cars.filter(c => race.boxSlot(c.teamIdx) === b.k).sort((p, q) => (rank(p) - rank(q)) || (p.teamIdx - q.teamIdx) || (p.carId < q.carId ? -1 : p.carId > q.carId ? 1 : 0));
  }
  // where they park, in the box's frame (x along its front, z in): your model's spot (REF_your_car), and a second car
  // mirrored across the box from it
  carSpots(b, n = 2) {
    const c = this.boxModel ? this.boxModel.car(b.F) : { x: -3.35, z: 6.4 };
    return n > 1 ? [{ x: c.x, z: c.z }, { x: -c.x, z: c.z }] : [{ x: c.x, z: c.z }];
  }
  // a car's side of its box (0: your model's spot, 1: the other), and the box
  sideOf(car) {
    const race = this.race, b = this.boxes.find(x => x.k === race.boxSlot(car.teamIdx));
    if (!b) return 0;
    const i = this.boxCars(b).indexOf(car); return i < 0 ? 0 : i % 2;
  }
  // where a car stands parked on its side (the world: [x, y, z], heading h, nose to the door), or null
  parkPose(car) {
    const race = this.race, b = this.boxes.find(x => x.k === race.boxSlot(car.teamIdx)); if (!b || !b.F) return null;
    const n = this.boxCars(b).length, c = this.carSpots(b, Math.max(2, n))[this.sideOf(car)], F = b.F;
    const at = F.P(c.x, c.z, BOX.floor + 0.05), ah = F.P(c.x, c.z - 1, BOX.floor + 0.05);
    return { b, side: this.sideOf(car), spot: c, at, h: Math.atan2(ah[0] - at[0], ah[2] - at[2]) };
  }
  // the team's car in its box, on its stands, nose to the door (a cheap one: the field isn't racing)
  parkCar(b) {
    const race = this.race, t = b.tk, did = race.driverId(t, b.team);
    const cfg = teamCar(b.team, t); cfg.chassis = race.aiChassisFor(t);
    Object.assign(cfg, { helmetDesign: { ...driverHelmet(did), number: true }, helmet: driverHelmet(did).base, suit: teamSuit(b.team) });
    const m = buildF1(cfg, { texSize: 512, low: true }), F = b.F;
    const c = this.boxModel ? this.boxModel.car(F) : { x: 0, z: 6.4 }; // (where your model's box has it)
    const at = F.P(c.x, c.z, BOX.floor + 0.05), ah = F.P(c.x, c.z - 1, BOX.floor + 0.05);
    m.group.position.fromArray(at); m.group.rotation.y = Math.atan2(ah[0] - at[0], ah[2] - at[2]);
    if (m.shadow) { m.group.add(m.shadow); m.shadow.position.y = -0.04; }
    m.group.traverse(o => { if (o.isMesh) o.castShadow = false; });
    m.animate && m.animate({ steer: 0, spin: 0, heave: 0, pitch: 0, roll: 0 });
    this.root.add(m.group); b.parked = m;
  }
  // you've walked up and spoken to box b's driver (at: where you are, in the world): they turn to you a while
  talkTo(b, at) { if (!b.dm) return; b.talkT = 4.5; b.talkAt = at.clone(); }

  dispose() {
    this.alive = false;
    if (this.lit) for (const [mt, [e, map]] of this.lit) { mt.emissive.setHex(e); mt.emissiveMap = map; mt.needsUpdate = true; }
    for (const b of this.boxes) for (const m of b.crew) m.ch.dispose();
    if (this.wall) this.wall.dispose();
    this.root.traverse(o => {
      if (o.isSkinnedMesh) return; // (the people's geometry and materials are shared: characters.js owns them)
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); // (the props' are the model's, kept for next time)
      if (o.userData.worldMat) return; // (a shutter wears the world's facade material)
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const lerpYaw = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)); if (d < 0) d += Math.PI * 2; return a + (d - Math.PI) * t; };
// the track sample nearest (x, z), searching along from i
function nearIdx(T, i, x, z) {
  const along = (x - T.X[i]) * T.FX[i] + (z - T.Z[i]) * T.FZ[i];
  return (i + Math.round(along / T.ds) + T.N) % T.N;
}
