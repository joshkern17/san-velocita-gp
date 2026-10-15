// Pit lane life: each team's sign over its garage (name, driver, where they're running), and the crews who wait
// in front of their box, come out when their car is coming in, work on it, and wave it out.
//
//   race.pitLife = new PitLife(race);   // after the cars are in (signs straight away, crews once the people load)
//   race.pitLife.update(dt);            // each frame, before the cars are placed (it lifts a car on its jacks: car.lift)
//
// It only watches what any car shows (pitting, where it is, its speed), so an online rival's stop gets a crew too.
import * as THREE from 'three';
import { TEAMS } from './car.js';
import { loadCharacters, makeCharacter, classicCrewLook } from './characters.js';
import { fillLivery } from './livery.js';
import { PitWall } from './pitwall.js';
import { dressBox, shutBox, boxFrame, BOX } from './pitboxes.js';

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
      const b = { k, bi, team, cars, mine: !!pl, face, crew: [], active: field.has(k), car: null, phase: 'home', t: 0, lift: 0, F: boxFrame(T, this.A, pit, k) };
      this.boxes.push(b);
      this.makeSign(b);
      const dress = dressBox(T, this.A, pit, k, team, { name: team.name, desk: !!pl && !!race.quali });
      if (dress) this.root.add(dress);
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
      ROLES.forEach((role, r) => {
        const ch = makeCharacter({ look, clip: 'idle', seed: b.k * 31 + r * 7 + 1, crew: !classic, livery: classic ? null : b.team });
        const m = { ch, role, k: 0, kT: 0, mode: role.endsWith('J') ? 'jack' : 'gun', x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, idleT: Math.random() * 8 };
        ch.post = (c) => crouchPose(c, c.clip && c.clip.startsWith('kneel') ? 0 : m.k, m.mode); // (a kneel clip is its own pose)
        // a prop in the right hand: the wheel gun, or the lollipop (red: brakes on; green: go)
        if (role === 'LP') m.board = this.attachLollipop(ch);
        else if (role !== 'FJ' && role !== 'RJ') this.attachGun(ch);
        b.group.add(ch.object); b.crew.push(m);
      });
      this.homeSlots(b, true);
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
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.1), new THREE.MeshLambertMaterial({ color: 0x18181a }));
    gun.position.y = 0.1;
    this.attachProp(ch, gun);
  }
  attachLollipop(ch) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    stick.position.y = 0.55;
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8180c, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), mat);
    disc.position.y = 1.15; disc.rotation.y = Math.PI / 2;
    g.add(stick, disc);
    this.attachProp(ch, g);
    return mat;
  }

  // waiting: in the garage door (and not drawn there: 84 people standing about in front of the boxes cost the start
  // straight a third of its frame), facing the lane. They come out of it when their car's coming in
  homeSlots(b, snap) {
    const T = this.T, sd = this.pit.side, N = T.N;
    b.crew.forEach((m, r) => {
      const along = (r - (b.crew.length - 1) / 2) * 1.35 + Math.sin(r * 12.9 + b.k) * 0.25;
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
      FJ: [box.f + (working ? 0.75 : 2.4), working ? 0 : 1.1, 0], RJ: [-box.r - 0.85, 0, 2],
      LP: [box.f + 0.5, hw + 1.25, 3],
    };
    const yawF = Math.atan2(fx, fz), yawG = Math.atan2(gx, gz);
    for (const m of b.crew) {
      const [al, ac, f] = S[m.role];
      m.tx = pose.x + fx * al + gx * ac; m.tz = pose.z + fz * al + gz * ac;
      // facing: 1 / -1 towards the car from the garage / far side, 0 back at the nose (jack), 2 at the tail, 3 the cockpit
      m.tyaw = f === 1 ? yawG + Math.PI : f === -1 ? yawG : f === 0 ? yawF + Math.PI : f === 2 ? yawF : Math.atan2(pose.x - m.tx, pose.z - m.tz);
      m.kT = working ? (m.mode === 'jack' ? 0.62 : m.role === 'LP' ? 0 : 0.86) : 0;
    }
  }

  update(dt) {
    if (!this.pit || !this.boxes.length) return;
    const race = this.race, T = this.T, N = T.N, cam = race.camera.position;
    this.signT = (this.signT || 0) + dt;
    const signs = this.signT > 0.25; if (signs) this.signT = 0;
    const n = this.pit.boxes.length;
    if (this.wall) this.wall.update(dt, cam);
    for (const b of this.boxes) {
      b.cars = race.cars.filter(c => race.boxSlot(c.teamIdx) === b.k); // (online, cars come and go)
      if (signs) this.refreshSign(b);
      const lift = this.crewUpdate(b, dt, cam);
      for (const c of b.cars) c.lift = c === b.car ? lift : 0;
    }
  }
  crewUpdate(b, dt, cam) {
    if (!b.crew.length) return 0;
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
        for (const m of b.crew) m.kT = 0; // up off the wheels, guns away
      }
    }
    // the car on its jacks while they work
    b.lift += ((b.phase === 'work' ? 0.055 : 0) - b.lift) * Math.min(1, dt * (b.phase === 'work' ? 10 : 16));
    // the lollipop: red while they work, green to go
    const lp = b.crew.find(m => m.role === 'LP');
    if (lp && lp.board) lp.board.color.setHex(b.phase === 'release' ? 0x18c838 : 0xd8180c);
    if (!show) { for (const m of b.crew) { m.x = m.tx; m.z = m.tz; m.yaw = m.tyaw; m.k = m.kT; } return b.lift; }
    // far-ish: animate at a lower rate
    const every = dist < 90 ? 1 : 3;
    b.tick = ((b.tick || 0) + 1) % every; b.acc = (b.acc || 0) + dt;
    const step = b.tick === 0 ? b.acc : 0; if (step) b.acc = 0;
    const hurry = b.phase === 'ready' || b.phase === 'work';
    for (const m of b.crew) {
      const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz);
      const v = hurry ? 2.6 : 1.35, mv = Math.min(d, v * dt);
      let clip, speed = 1;
      if (d > 0.06) {
        m.x += dx / d * mv; m.z += dz / d * mv;
        m.yaw = lerpYaw(m.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
        clip = 'walk'; speed = (hurry ? 2.6 : 1.35) / 1.35;
        if (d < 0.4 && m.kT > 0) clip = 'idle'; // (stepping in to a wheel: no stride for the last bit)
      } else {
        m.yaw = lerpYaw(m.yaw, m.tyaw, Math.min(1, dt * 8));
        const gun = m.mode === 'gun' && m.role !== 'LP';
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
      const i = nearIdx(this.T, b.bi, m.x, m.z);
      m.ch.object.position.set(m.x, this.laneY(i), m.z);
      m.ch.object.rotation.y = m.yaw;
      if (step) m.ch.update(step);
    }
    return b.lift;
  }

  dispose() {
    this.alive = false;
    if (this.lit) for (const [mt, [e, map]] of this.lit) { mt.emissive.setHex(e); mt.emissiveMap = map; mt.needsUpdate = true; }
    for (const b of this.boxes) for (const m of b.crew) m.ch.dispose();
    if (this.wall) this.wall.dispose();
    this.root.traverse(o => {
      if (o.isSkinnedMesh) return; // (the people's geometry and materials are shared: characters.js owns them)
      if (o.geometry) o.geometry.dispose();
      if (o.userData.worldMat) return; // (a shutter wears the world's facade material)
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

const lerpYaw = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)); if (d < 0) d += Math.PI * 2; return a + (d - Math.PI) * t; };
// the track sample nearest (x, z), searching along from i
function nearIdx(T, i, x, z) {
  const along = (x - T.X[i]) * T.FX[i] + (z - T.Z[i]) * T.FZ[i];
  return (i + Math.round(along / T.ds) + T.N) % T.N;
}
