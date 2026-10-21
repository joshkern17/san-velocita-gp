// The menu backdrop's camera (attract mode): a small film director over the race behind the menus. It cuts between
// cinematic shots, each picked for a car that's in a fit state to film (on the road, at speed), never the same shot
// twice running, hard cuts only. The subject is framed right of centre, clear of the menu column on the left.
//   side   - rides alongside at wheel height
//   headon - a long lens at the end of a straight, the car growing toward you
//   chase  - low behind, through a bend
//   duel   - two cars nose to tail, a crane rising and pulling back
//   apex   - a fixed camera low on the inside curb, whipping round as the car clips it
//   detail - locked to the car's body: the front wheel, the rear wing
//   drone  - high and steep over a car with others round it
import * as THREE from 'three';

const SHOTS = { side: 6, headon: 7, chase: 6, duel: 7, apex: 6, detail: 5, drone: 6 }; // hold times (s)
const RIGHT = 0.24; // where the subject sits: this far right of centre, as a share of the half width

export class MenuCam {
  constructor(race) { this.race = race; this.shot = null; this.last = []; }

  update(dt, snap) {
    const R = this.race, cam = R.camera;
    if (snap || !this.shot || this.shot.t > this.shot.hold || !this.fit(this.shot.car) || this.shot.done) this.next();
    const s = this.shot; if (!s) return;
    s.t += dt;
    this[s.kind](s, dt, s.t === dt);
    cam.up.set(0, 1, 0);
    cam.lookAt(s.look);
    // nudge the subject right of centre: turn the camera left by the angle that moves the aim point RIGHT of the way out
    const hf = Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
    cam.rotateY(Math.atan(Math.tan(hf) * RIGHT));
    cam.updateProjectionMatrix();
    R.camPos.copy(cam.position);
    R.focus = s.car;
  }

  // a car worth filming: moving, on the road, not sideways
  fit(car) {
    if (!car) return false;
    const p = car.phys, sp = Math.hypot(p.vx, p.vz);
    return car.onRoad && sp > 15 && Math.abs(car.s) < this.race.T.W[car.idx] / 2 + 0.5 && (p.slipR ?? 0) < 0.35;
  }

  // the next shot: shuffled, not one of the last two, and one that can be set up here (a straight ahead, a corner, a pair)
  next() {
    const R = this.race, cars = R.cars.filter(c => this.fit(c));
    if (!cars.length) { if (!this.shot) this.shot = this.make('chase', R.cars[0]); else this.shot.t = 0; return; }
    const kinds = Object.keys(SHOTS).filter(k => !this.last.includes(k)).sort(() => Math.random() - 0.5);
    for (const kind of kinds) {
      for (const car of [...cars].sort(() => Math.random() - 0.5)) {
        const s = this.make(kind, car);
        if (s) { this.shot = s; this.last = [kind, ...this.last].slice(0, 2); return; }
      }
    }
    this.shot = this.make('chase', cars[0]);
  }

  make(kind, car) {
    const s = { kind, car, t: 0, hold: SHOTS[kind], look: new THREE.Vector3(), pos: new THREE.Vector3(), side: Math.random() < 0.5 ? -1 : 1 };
    const R = this.race, T = R.T, N = T.N;
    if (kind === 'headon') {
      // the furthest point ahead the car can be seen from down a straight (the heading turns < ~7°), 70-260 m off
      let turn = 0, j = car.idx, d = 0;
      for (let k = 1; k * T.ds < 260; k++) { const i = (car.idx + k) % N; turn += T.K[i] * T.ds; if (Math.abs(turn) > 0.12) break; j = i; d = k * T.ds; }
      if (d < 70) return null;
      s.i = j; s.lat = THREE.MathUtils.clamp(car.s, -T.W[j] / 2 + 1, T.W[j] / 2 - 1);
    }
    if (kind === 'apex') {
      // the tightest bend 60-220 m ahead; the camera on its inside, just off the road
      let best = -1, bk = 0.012;
      for (let k = Math.round(60 / T.ds); k * T.ds < 220; k++) { const i = (car.idx + k) % N; if (Math.abs(T.K[i]) > bk) { bk = Math.abs(T.K[i]); best = i; } }
      if (best < 0) return null;
      s.i = best; s.lat = Math.sign(T.K[best]) * (T.W[best] / 2 + 1.2); // (K > 0 turns toward +s: the inside)
      s.hold = 12;
    }
    if (kind === 'duel' || kind === 'drone') {
      // another car close behind (duel: within 18 m; drone: two more within 40 m either way)
      const gap = (a, b) => { let g = ((b.idx - a.idx + N) % N) * T.ds; if (g > T.ds * N / 2) g -= T.ds * N; return g; };
      const near = R.cars.filter(c => c !== car && this.fit(c)).map(c => ({ c, g: gap(car, c) }));
      if (kind === 'duel') { const b = near.filter(o => o.g < 0 && o.g > -18).sort((x, y) => y.g - x.g)[0]; if (!b) return null; s.other = b.c; }
      else if (near.filter(o => Math.abs(o.g) < 40).length < 2) return null;
    }
    if (kind === 'detail') s.part = Math.random() < 0.5 ? 'wheel' : 'wing';
    return s;
  }

  // the track's frame at a car (smoothed, so a twitch of the car doesn't shake the camera)
  frame(car, i = car.idx) {
    const T = this.race.T;
    return { fx: T.FX[i], fz: T.FZ[i], rx: T.RX[i], rz: T.RZ[i] };
  }
  carPos(car) { return car.model.group.position; }
  // ease an offset from the subject, never a world position (one eased after a car at 50 m/s trails metres behind it)
  ease(v, to, dt, k, first) { if (first) v.copy(to); else v.lerp(to, 1 - Math.exp(-dt * k)); }

  side(s, dt, first) {
    const R = this.race, cam = R.camera, c = this.carPos(s.car), F = this.frame(s.car), T = R.T;
    // ride on the side of the car with the most road, so the camera doesn't go through the barrier
    if (first) s.side = s.car.s > 0 ? -1 : 1;
    const along = 1.6 - s.t / s.hold * 3.4; // drifts from just ahead of the front wheel to the rear quarter
    const lat = 5.2 * s.side;
    this.ease(s.pos, new THREE.Vector3(F.rx * lat + F.fx * along, 0.55, F.rz * lat + F.fz * along), dt, 4, first);
    cam.position.copy(c).add(s.pos);
    s.look.set(c.x + F.fx * 0.4, c.y + 0.5, c.z + F.fz * 0.4);
    cam.fov = 42;
  }

  headon(s, dt, first) {
    const R = this.race, cam = R.camera, T = R.T, i = s.i, c = this.carPos(s.car);
    cam.position.set(T.X[i] + T.RX[i] * s.lat, T.Y[i] + 1.1, T.Z[i] + T.RZ[i] * s.lat);
    s.look.set(c.x, c.y + 0.6, c.z);
    const d = cam.position.distanceTo(s.look);
    cam.fov = THREE.MathUtils.clamp(2 * Math.atan(3 / d) * 180 / Math.PI, 3, 45); // the car about the same size in frame
    // cut away before it runs over the lens
    if (d < 22) s.done = true;
  }

  chase(s, dt, first) {
    const R = this.race, cam = R.camera, c = this.carPos(s.car), p = s.car.phys;
    // behind the way it's travelling, that direction smoothed (the camera swings out a little as it turns in)
    const v = new THREE.Vector3(p.vx, 0, p.vz).normalize();
    if (first || !s.dir) s.dir = v.clone(); else s.dir.lerp(v, 1 - Math.exp(-dt * 3)).normalize();
    cam.position.set(c.x - s.dir.x * 6.5, c.y + 1.0, c.z - s.dir.z * 6.5);
    s.look.set(c.x + s.dir.x * 5, c.y + 0.7, c.z + s.dir.z * 5);
    cam.fov = 48;
  }

  duel(s, dt, first) {
    const R = this.race, cam = R.camera, a = this.carPos(s.car), b = this.carPos(s.other), F = this.frame(s.car);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    // a crane behind the pair, rising and dropping back; kept over the road (out wide, it went through the fences)
    const k = s.t / s.hold, back = 12 + k * 6, up = 4.5 + k * 6, W = this.race.T.W[s.car.idx] / 2 - 1;
    const ms = s.other.s, lat = THREE.MathUtils.clamp(-ms * 0.5 + 2.5 * (ms > 0 ? -1 : 1), -W - ms, W - ms);
    this.ease(s.pos, new THREE.Vector3(-F.fx * back + F.rx * lat, up, -F.fz * back + F.rz * lat), dt, 4, first);
    cam.position.copy(b).add(s.pos); // (behind the car that's chasing, so both are ahead of the lens)
    s.look.copy(mid).setY(mid.y + 0.5);
    cam.fov = 40;
  }

  apex(s, dt, first) {
    const R = this.race, cam = R.camera, T = R.T, i = s.i, c = this.carPos(s.car), N = T.N;
    cam.position.set(T.X[i] + T.RX[i] * s.lat, T.Y[i] + 0.45, T.Z[i] + T.RZ[i] * s.lat);
    s.look.set(c.x, c.y + 0.55, c.z);
    const d = cam.position.distanceTo(s.look);
    cam.fov = THREE.MathUtils.clamp(2 * Math.atan(4.5 / d) * 180 / Math.PI, 8, 55);
    // two seconds after it's gone by
    const past = ((s.car.idx - i + N) % N) * T.ds;
    if (past > 0 && past < 200) { s.gone ??= s.t; if (s.t - s.gone > 2) s.done = true; }
  }

  detail(s, dt, first) {
    const R = this.race, cam = R.camera, g = s.car.model.group, k = s.t / s.hold;
    if (first) s.side = Math.random() < 0.5 ? -1 : 1;
    const sz = R.camSize(s.car), L = sz.back, x = s.side;
    // in the car's own frame (+z forward): a slow push along it
    const [from, at] = s.part === 'wheel'
      ? [new THREE.Vector3(x * 2.9, 0.5, L * 1.1 - k * 1.2), new THREE.Vector3(x * 0.9, 0.4, L * 0.45)]
      : [new THREE.Vector3(x * (2.3 - k * 0.5), sz.h + 0.4, -L - 2.2 + k * 0.6), new THREE.Vector3(0, sz.h * 0.8, -L * 0.85)];
    g.updateMatrixWorld();
    cam.position.copy(g.localToWorld(from));
    s.look.copy(g.localToWorld(at));
    cam.fov = 38;
  }

  drone(s, dt, first) {
    // high and steep, a little behind: the top of the frame is the way they're going (straight down, with the camera's
    // up turned to the track, the frame could tip up to the sky)
    const R = this.race, cam = R.camera, c = this.carPos(s.car), F = this.frame(s.car);
    this.ease(s.pos, new THREE.Vector3(-F.fx * 9, 26 - s.t * 0.8, -F.fz * 9), dt, 3, first);
    cam.position.copy(c).add(s.pos);
    s.look.set(c.x + F.fx * 5, c.y, c.z + F.fz * 5);
    cam.fov = 42;
  }

}
