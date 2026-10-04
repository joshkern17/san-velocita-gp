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
  // each driver beside their car, on the side the intro camera passes, facing out; a few things to do while they wait
  makeGrid() {
    this.grid = true;
    const cars = this.race.cars.filter(c => !c.gone);
    let k = 0;
    const one = () => {
      if (!this.alive || this.started() || k >= cars.length) return;
      const car = cars[k++], who = this.personOf(car), g = car.model.group;
      const clip = ['idle', 'idle_look', 'idle_stretch', 'idle', 'idle_look'][k % 5];
      const ch = makeCharacter({ look: 'racer', clip, livery: who.livery, face: who.face, helmet: false, seed: k * 97 + 5 });
      _f.set(0, 0, 1).applyQuaternion(g.quaternion).setY(0).normalize(); _r.crossVectors(_f, _up).negate(); // (the car's right)
      const T = this.race.T, i = car.idx, side = Math.sign(T.RX[i] * _r.x + T.RZ[i] * _r.z) || 1;
      ch.object.position.copy(g.position).addScaledVector(_r, 1.85 * side).addScaledVector(_f, 0.4);
      ch.object.position.y = g.position.y - 0.05;
      ch.object.rotation.y = Math.atan2(_r.x * side, _r.z * side) - 0.35 * side; // facing out, turned a little to the front
      this.root.add(ch.object); this.people.push(ch);
      setTimeout(one, 0); // (one per tick: painting the kits takes a moment)
    };
    one();
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
