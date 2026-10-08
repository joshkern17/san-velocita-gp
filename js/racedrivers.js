// The drivers, in person, at a race (js/drivers.js dresses them): standing beside their cars on the grid until the
// lights come on, and the top three on a podium after the flag.
//
//   race.drivers = new RaceDrivers(race);   // after the cars are in: the grid fills once the people load
//   race.drivers.update(dt);                // each frame (it ticks its own people)
//   race.drivers.podium(order) -> bool      // the podium, a stage of its own: race.render() shows it from then on
import * as THREE from 'three';
import { loadCharacters, charactersReady, makeCharacter } from './characters.js';
import { driverFace } from './drivers.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// leaning on the car (stand_pose is a lean too: feet out, head back, hands behind on a wall), and what a driver who
// isn't leaning does, round the field
const LEANS = ['lean', 'stand_pose', 'lean_2', 'lean', 'stand_pose'];
const STAND = ['idle_look', 'idle_stretch', 'idle', 'idle_look'];
// how far in front of the bodywork the character's origin stands in each lean (its backside is behind its hips)
const LEAN_BACK = { lean: 0.1, lean_2: -0.02, stand_pose: 0.12 };
// where along the car (metres ahead of its middle) to try leaning, and to stand, by the door or a wheel
const SPOT_LEAN = { door: [-0.15, 0.25, -0.5, 0.55], front: [1.0, 0.8, 1.2, 0.6], rear: [-1.0, -0.8, -1.2, -0.6] };
const SPOT_STAND = { door: 0.4, front: 1.4, rear: -1.4 };

// Two-bone arm IK on top of the clip: the hand (side 'Left' / 'Right') onto a world point, the elbow bending towards
// the pole (a world direction). The elbow's place comes from the two bone lengths; then the upper arm aims at it
// and the forearm at the point.
const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _E = new THREE.Vector3(), _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion();
function turnWorld(bone, q) { bone.parent.getWorldQuaternion(_qp); bone.quaternion.premultiply(_qp.clone().invert().multiply(q).multiply(_qp)); bone.updateWorldMatrix(false, true); }
function reach(ch, side, target, pole) {
  const B = ch._arm || (ch._arm = {});
  const A = B[side + 'A'] ||= ch.bone(side + 'Arm'), F = B[side + 'F'] ||= ch.bone(side + 'ForeArm'), H = B[side + 'H'] ||= ch.bone(side + 'Hand');
  if (!A || !F || !H) return;
  A.updateWorldMatrix(true, true);
  A.getWorldPosition(_s); F.getWorldPosition(_e); H.getWorldPosition(_h);
  const la = _s.distanceTo(_e), lb = _e.distanceTo(_h);
  _d.subVectors(target, _s); const d = Math.min(la + lb - 1e-3, Math.max(Math.abs(la - lb) + 1e-3, _d.length())); _d.normalize();
  // the elbow: x along the shoulder-to-hand line, h out from it towards the pole
  const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0); _p.normalize();
  _E.copy(_s).addScaledVector(_d, x).addScaledVector(_p, h);
  turnWorld(A, _qa.setFromUnitVectors(_a1.subVectors(_e, _s).normalize(), _a2.subVectors(_E, _s).normalize()));
  F.getWorldPosition(_e); H.getWorldPosition(_h);
  turnWorld(F, _qa.setFromUnitVectors(_a1.subVectors(_h, _e).normalize(), _a2.subVectors(target, _e).normalize()));
}

export class RaceDrivers {
  constructor(race) {
    this.race = race; this.alive = true; this.people = []; this.grid = false; this.pod = null;
    this.root = new THREE.Group(); this.root.name = 'RaceDrivers'; race.scene.add(this.root);
    // on the grid: a race that hasn't started (not a practice or qualifying session, not a drift run)
    if (race.mode === 'race' && !race.drift && race.state !== 'racing') loadCharacters().then(ok => { if (ok && this.alive && !this.started()) this.makeGrid(); });
  }
  started() { const s = this.race.state; return s === 'countdown' || s === 'racing' || s === 'finished'; }
  // a car's driver: who they are and what they wear (the car's own livery: their helmet, the team's suit)
  personOf(car) {
    const race = this.race, cfg = car.model.cfg || {};
    const id = car.isPlayer ? 'P:' + (race.opts.playerName || 'You') : race.driverId(car.teamIdx, car.team);
    return { livery: cfg, face: cfg.face ?? driverFace(id) };
  }
  // each driver beside their car on the side towards the middle of the track (a car on the right of the grid: its
  // left; on the left: its right), facing the middle where the intro camera comes down the grid, helmet on.
  // Where the car has bodywork at backside height there (a road car's door, a GT's flank) they
  // lean on it (yours always does); every fourth stands, stretches or looks about, and a car with nothing to lean on
  // (an F1 car's low sidepods) gets one of those too: different things, so they don't all move alike
  makeGrid() {
    this.grid = true;
    const cars = this.race.cars.filter(c => !c.gone), T = this.race.T;
    let k = 0;
    const one = () => {
      if (!this.alive || this.started() || k >= cars.length) return;
      const car = cars[k++], who = this.personOf(car), g = car.model.group;
      _f.set(0, 0, 1).applyQuaternion(g.quaternion).setY(0).normalize(); _r.crossVectors(_f, _up).negate(); // (the car's right)
      const i = car.idx, lat = (car.phys.x - T.X[i]) * T.RX[i] + (car.phys.z - T.Z[i]) * T.RZ[i]; // (+: right of the middle)
      const side = (Math.sign(T.RX[i] * _r.x + T.RZ[i] * _r.z) || 1) * (lat > 0 ? -1 : 1);
      const out = _r.clone().multiplyScalar(side), feet = g.position.y - 0.05;
      const stands = !car.isPlayer && k % 4 === 0;
      const lean = !stands && this.leanSpot(car, out, feet);
      const clip = lean ? LEANS[k % LEANS.length] : STAND[(k + car.teamIdx) % STAND.length];
      const ch = makeCharacter({ look: 'racer', clip, livery: who.livery, face: who.face, helmet: true, seed: k * 97 + 5 }); // (on: about to get in)
      this.place(ch, car, out, side, feet, lean, clip);
      ch.car = car;
      this.root.add(ch.object); this.people.push(ch);
      setTimeout(one, 0); // (one per tick: painting the kits takes a moment)
    };
    one();
  }
  // a character beside a car (out: away from it, on side +1 its right / -1 its left): leaning on it with its backside
  // at lean (a point on the bodywork) and hands back on it either side of the hips, or (no lean) standing dist metres
  // clear, along metres ahead of the middle, turned a little to the front
  place(ch, car, out, side, feet, lean, clip, { dist = 1.85, along = 0.4 } = {}) {
    const g = car.model.group;
    if (lean) {
      ch.object.position.copy(lean).addScaledVector(out, LEAN_BACK[clip] ?? 0.1); ch.object.position.y = feet;
      ch.object.rotation.y = Math.atan2(out.x, out.z);
      const xa = new THREE.Vector3(out.z, 0, -out.x); // (the character's left)
      const hand = (sgn) => { // (on the bodywork at hand height, or the top of a lower fender)
        const at = ch.object.position.clone().addScaledVector(xa, 0.3 * sgn);
        for (const h of [0.8, 0.74, 0.68]) { const p = this.surface(car, out, at, feet + h); if (p) return p.addScaledVector(out, 0.05); }
        return null;
      };
      const L = hand(1), R = hand(-1);
      // (elbows back towards the car and a little out from the body, as yours go with your hands behind you)
      const pole = (sgn) => xa.clone().multiplyScalar(0.5 * sgn).addScaledVector(out, -0.85).normalize();
      const pL = pole(1), pR = pole(-1);
      ch.post = (c) => { if (L) reach(c, 'Left', L, pL); if (R) reach(c, 'Right', R, pR); };
    } else {
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion).setY(0).normalize();
      ch.object.position.copy(g.position).addScaledVector(out, dist).addScaledVector(f, along); ch.object.position.y = feet;
      ch.object.rotation.y = Math.atan2(out.x, out.z) - 0.35 * side;
      ch.post = null;
    }
  }
  // photo mode (js/photomode.js): this car's driver out beside it in a clip of your choice. side +1 its right, -1 its
  // left; spot 'door' / 'front' / 'rear'. A lean clip leans where the bodywork's upright at backside height (nothing
  // there, an F1 car's sidepods: they stand instead). -> { ch, leaned }
  posed(car, { clip = 'lean', side = 1, spot = 'door', helmet = true } = {}) {
    const g = car.model.group;
    _f.set(0, 0, 1).applyQuaternion(g.quaternion).setY(0).normalize(); _r.crossVectors(_f, _up).negate();
    const out = _r.clone().multiplyScalar(side), feet = g.position.y - 0.05;
    const lean = clip in LEAN_BACK ? this.leanSpot(car, out, feet, SPOT_LEAN[spot]) : null;
    const use = clip in LEAN_BACK && !lean ? 'idle' : clip, who = this.personOf(car);
    const ch = makeCharacter({ look: 'racer', clip: use, livery: who.livery, face: who.face, helmet, seed: 7 });
    // (kneeling by the wheel: closer in; standing: near enough to be in the same shot)
    this.place(ch, car, out, side, feet, lean, use, { dist: use.startsWith('kneel') ? 1.05 : 1.3, along: SPOT_STAND[spot] });
    return { ch, leaned: !!lean };
  }
  // the bodywork behind a point (out: away from the car), at height y: where a ray in towards the car meets it
  surface(car, out, at, y) {
    const g = car.model.group, ray = this.ray || (this.ray = new THREE.Raycaster());
    const o = at.clone().addScaledVector(out, 1.5); o.y = y;
    ray.set(o, out.clone().negate()); ray.far = 3; ray.camera = this.race.camera;
    const x = ray.intersectObject(g, true).find(x => x.object.isMesh && x.object.visible);
    return x ? x.point.clone() : null;
  }
  // where to lean on this car's side (out: away from the car, on the driver's side): the point on the bodywork at
  // backside height near the door, where the side's upright (the same depth a little lower); null if it's too low there
  leanSpot(car, out, feet, alongs = SPOT_LEAN.door) {
    const g = car.model.group, ray = this.ray || (this.ray = new THREE.Raycaster());
    const hit = (along, h) => {
      const o = g.position.clone().addScaledVector(_f, along).addScaledVector(out, 4); o.y = feet + h;
      ray.set(o, out.clone().negate()); ray.far = 4; ray.camera = this.race.camera; // (the lights' glow sprites need one)
      const x = ray.intersectObject(g, true).find(x => x.object.isMesh && x.object.visible);
      return x ? x.point : null;
    };
    for (const along of alongs) {
      const a = hit(along, 0.88), b = hit(along, 0.62);
      if (!a || !b) continue;
      const da = a.clone().sub(g.position).dot(out), db = b.clone().sub(g.position).dot(out);
      if (da > 0.5 && Math.abs(da - db) < 0.18) return a;
    }
    return null;
  }
  tick2() { const t = performance.now(), dt = this.last2 ? Math.min(0.1, (t - this.last2) / 1000) : 0; this.last2 = t; return dt; }
  tick() { const t = performance.now(), dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0; this.last = t; return dt; }
  clearPeople() { for (const ch of this.people) ch.dispose(); this.people = []; }
  update(dt = this.tick()) {
    if (this.grid && this.started()) { this.grid = false; this.clearPeople(); } // (they've got in)
    for (const ch of this.people) ch.update(dt);
  }

  // ---------------- the podium ----------------
  // A stage of its own (a track's own scenery would be in the way somewhere): three dark steps, P1 in the middle and
  // highest, a black wall with the house's red neon behind, lit like a ceremony. order: the cars, first to last
  podium(order) {
    if (!charactersReady() || !order || order.length < 1) return false;
    this.clearPeople(); this.grid = false;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x060509); scene.fog = new THREE.Fog(0x060509, 9, 22);
    const g = new THREE.Group(); scene.add(g);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x15141a })); floor.rotation.x = -Math.PI / 2; g.add(floor);
    const glowTex = (draw, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const cg = c.getContext('2d'); draw(cg, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    // the steps, each with its number in red
    const steps = [[0, 1.0, 1], [-1.75, 0.7, 2], [1.75, 0.45, 3]];
    for (const [x, h, n] of steps) {
      const tex = glowTex((cg, w, hh) => { cg.fillStyle = '#121216'; cg.fillRect(0, 0, w, hh); cg.fillStyle = n === 1 ? '#ffc21a' : '#FF2B00'; cg.shadowColor = cg.fillStyle; cg.shadowBlur = 14; cg.font = '700 96px "SV Display", Arial'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(String(n), w / 2, hh / 2 + 6); }, 128, 128);
      const side = new THREE.MeshLambertMaterial({ color: 0x1c1b22 }), front = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, h, 1.5), [side, side, side, side, front, side]);
      box.position.set(x, h / 2, 0); g.add(box);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: n === 1 ? 0xffc21a : 0xff2b00, toneMapped: false })); edge.position.set(x, h + 0.01, 0.76); g.add(edge);
    }
    // the wall: black, two neon rules and the name of the place
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), new THREE.MeshLambertMaterial({ color: 0x0b0a0f })); wall.position.set(0, 3.5, -2.4); g.add(wall);
    for (const y of [0.7, 4.65]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2b00, toneMapped: false })); r.position.set(0, y, -2.38); g.add(r); }
    const sign = glowTex((cg, w, h) => { cg.clearRect(0, 0, w, h); cg.fillStyle = '#FF2B00'; cg.shadowColor = '#FF2B00'; cg.shadowBlur = 18; cg.font = '700 120px "SV Display", Arial'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText('SAN VELOCITA', w / 2, h * 0.42); cg.font = '500 44px "SV UI", Arial'; cg.letterSpacing = '18px'; cg.fillText('GRAND PRIX', w / 2, h * 0.82); }, 1024, 256);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false })); sm.position.set(0, 3.75, -2.37); g.add(sm);
    // light: a cool ambient, a warm key from the front, a spot on the winner, a red rim from the wall
    scene.add(new THREE.HemisphereLight(0x8a90b0, 0x1a1010, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.6); key.position.set(2, 5, 7); scene.add(key);
    const spot = new THREE.SpotLight(0xffffff, 40, 14, 0.42, 0.6, 1.5); spot.position.set(0, 7, 3); spot.target.position.set(0, 1.5, 0); scene.add(spot, spot.target);
    const rim = new THREE.DirectionalLight(0xff3a10, 1.4); rim.position.set(0, 3, -6); scene.add(rim);
    // the three: the winner celebrating, the others waving
    const clips = ['victory', 'wave', 'wave'];
    order.slice(0, 3).forEach((car, k) => {
      const who = this.personOf(car), [x, h] = steps[k];
      const ch = makeCharacter({ look: 'racer', clip: clips[k], livery: who.livery, face: who.face, helmet: false, seed: k * 13 + 1 });
      ch.object.position.set(x, h, 0.1); ch.object.rotation.y = k === 1 ? 0.2 : k === 2 ? -0.2 : 0;
      g.add(ch.object); this.people.push(ch);
    });
    const cam = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
    this.pod = { scene, cam, t: 0 };
    return true;
  }
  // a slow push in from the front
  podiumCamera(dt, aspect) {
    const P = this.pod; if (!P) return null;
    P.t += dt;
    const k = Math.min(1, P.t / 7), e = 1 - Math.pow(1 - k, 3);
    P.cam.position.set((0.5 - e) * 0.5, 1.5 + (1 - e) * 0.3, 10 - e * 2.2); P.cam.lookAt(0, 1.05, 0);
    if (aspect) { P.cam.aspect = aspect; P.cam.updateProjectionMatrix(); }
    return P;
  }
  dispose() {
    this.alive = false; this.clearPeople();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
