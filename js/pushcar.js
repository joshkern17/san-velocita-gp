// Your crew pushing your car, in practice and qualifying, on a track with real garages built from your box model
// (js/pitbox.js, js/pitcrew.js): out of the box onto the pit lane when you pick Drive Out, and back in, tail first,
// when you pull up at your box at the end of a run, you still in it. The camera eases off whatever it was on (the
// garage menu's shot, the chase cam) into a shot from the lane, follows the car, and eases on into the next one (the
// chase cam as you drive off, the garage menu's shot once you're parked): no cuts, no fades. A / Enter / B skips.
//
//   const push = new CarPush(pitGarage)
//   push.out(sim, done)        // from the garage menu (open, in your box): done(ahead) once the car's out in the lane,
//                              // ahead: how far along the lane from your box it stands (sim.leaveGarage's)
//   push.in(sim, car, done)    // your car's stopped at your box: done() once it's parked where the menu's car stands
//   push.update(dt)            // every frame while push.active
//   push.skip()
//
// Everything's worked out in your box's frame (the garage menu's: pitGarage.track.a, x across, z out of the door into
// the lane, your box's floor at y = 0), and put into the world from there.
import * as THREE from 'three';
import { CLIP_INFO } from './characters.js';
import { PitNav } from './pitwalk.js';

const V = 0.85;            // pushing pace, m/s (the push clips' own feet go at about 0.4: played faster)
const ACC = 0.55;          // getting it rolling, and stopping it, m/s²
const JOG = 2.3;           // the crew getting to the car
const WB = 2.6;            // (a wheelbase, for the steering)
const ease = (k) => k * k * (3 - 2 * k);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// a cubic from a to d (x, z), handles b, c: n points with the distance along them
function curve(a, b, c, d, n = 160) {
  const P = [], S = [0];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    P.push({ x: w[0] * a.x + w[1] * b.x + w[2] * c.x + w[3] * d.x, z: w[0] * a.z + w[1] * b.z + w[2] * c.z + w[3] * d.z });
    if (i) S.push(S[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  }
  return { P, S, len: S[n] };
}
// where along it, s metres in: the point and the way it's going there
function along(C, s) {
  const { P, S } = C; s = Math.max(0, Math.min(C.len, s));
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const f = (s - S[lo]) / ((S[hi] - S[lo]) || 1), a = P[lo], b = P[hi];
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dir: Math.atan2(b.x - a.x, b.z - a.z) };
}
const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class CarPush {
  constructor(pg) { this.pg = pg; this.active = false; }

  // ---------- setting up ----------
  // (what's needed: your box from your model, with a crew to take off what they're doing)
  ready(sim) {
    const pg = this.pg, life = sim && sim.pitLife, b = life && life.mine;
    return !!(pg.track && pg.track.sim === sim && b && b.brain && b.brain.people.some(p => p.role === 'crew') && !sim.T.open);
  }
  // near: the car's middle, this frame (x, z): the crew nearest it go
  begin(sim, kind, carObj, done, near = null) {
    const pg = this.pg, A = pg.track.a; A.updateMatrixWorld(true);
    this.sim = sim; this.kind = kind; this.done = done; this.t = 0; this.phase = 'gather'; this.s = 0; this.v = 0; this.skipped = false; this.blendK = 0; this.prevH = null; this.steer = 0;
    this.Mw = A.matrixWorld.clone(); this.Mi = this.Mw.clone().invert();
    const f = new THREE.Vector3(0, 0, 1).transformDirection(this.Mw); this.yawA = Math.atan2(f.x, f.z);
    this.nav = new PitNav(sim, pg);
    this.carObj = carObj;
    // the car's size (its own frame): half its length, half its width, the middle's offset along it
    const g = carObj.group, inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), bb = new THREE.Box3(), all = new THREE.Box3(), m = new THREE.Matrix4();
    g.updateMatrixWorld(true);
    g.traverse(o => { if (o.isMesh && o.visible && o.geometry && o !== carObj.shadow) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); all.union(bb.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
    this.hw = all.isEmpty() ? 0.95 : Math.max(0.7, (all.max.x - all.min.x) / 2);
    this.zf = all.isEmpty() ? 2.2 : Math.max(1.4, all.max.z); this.zr = all.isEmpty() ? -2.2 : Math.min(-1.4, all.min.z); // (its nose, its tail, from its origin)
    this.home = { pos: g.position.clone(), rot: g.rotation.clone() };
    // the crew: the ones on their feet nearest the car first, up to four
    const B = sim.pitLife.mine.brain, C = this.spot(), sg = pg.track.F.mirror ? -1 : 1, fx = near ? sg * near.x : C.fx, fz = near ? -near.z : C.fz;
    const ppl = B.people.filter(p => p.role === 'crew').sort((p, q) => (!!p.seat - !!q.seat) || (Math.hypot(p.x - fx, p.z - fz) - Math.hypot(q.x - fx, q.z - fz))).slice(0, 4);
    this.brain = B; this.crew = [];
    const slots = this.slots(ppl.length);
    ppl.forEach((p, k) => {
      B.release(p); p.held = true; p.path = [];
      const w = p.m.ch.object.position.clone().applyMatrix4(this.Mi);
      this.crew.push({ p, ch: p.m.ch, x: w.x, z: w.z, yaw: wrap(p.m.ch.object.rotation.y - this.yawA), slot: slots[k], path: null, there: false });
    });
    this.active = true;
  }
  // where the car parks in your box (this frame): its middle; and in the box's own frame (js/pitcrew.js's: fx, fz)
  spot() {
    const pg = this.pg, c = pg.carCentre(), s = pg.track.F.mirror ? -1 : 1;
    return { x: c.x, z: c.z, h: 0, fx: s * c.x, fz: -c.z };
  }
  // the lane spot ahead of your box (sim.leaveGarage's, ahead m along): this frame's x, z, the car's heading there
  laneAt(ahead) {
    const sim = this.sim, T = sim.T, pit = sim.pit, N = T.N, b0 = pit.boxes[sim.boxSlot(sim.player.teamIdx)];
    const b = ((b0 + Math.round(ahead / T.ds)) % N + N) % N, off = pit.side * (pit.CEN[b] + 2.4);
    const w = new THREE.Vector3(T.X[b] + T.RX[b] * off, 0, T.Z[b] + T.RZ[b] * off).applyMatrix4(this.Mi);
    return { x: w.x, z: w.z, h: wrap(Math.atan2(T.FX[b], T.FZ[b]) - this.yawA) };
  }
  // where each of them pushes from (the car's frame: a across, b along from its origin, which way they face: +1 the
  // car's nose, -1 its tail). Out: at the back, pushing it forward; in: at the nose, pushing it back. Stood off it by
  // the clip's reach (push: hands 0.74 m out in front, push_2: 0.62). The fourth walks by the front wheel
  slots(n) {
    const out = this.kind === 'out', W = this.hw, end = (r) => out ? this.zr - r : this.zf + r, f = out ? 1 : -1;
    return [
      { a: -(W - 0.42), b: end(0.6), face: f, clip: 'push' }, { a: W - 0.42, b: end(0.6), face: f, clip: 'push' },
      // (the middle one: the higher hands on the back of it; on the nose, lower down, the same as the others)
      out ? { a: 0, b: end(0.5), face: f, clip: 'push_2' } : { a: 0, b: end(0.6), face: f, clip: 'push' }, { a: -(W + 0.6), b: this.zf * 0.45, face: f, clip: 'walk' },
    ].slice(0, n);
  }

  // ---------- out ----------
  out(sim, done) {
    if (!this.ready(sim)) return false;
    const pg = this.pg;
    this.begin(sim, 'out', pg.car, done);
    const C = this.spot();
    // which way the lane runs to the exit (this frame's x: +1 or -1), and the spot out there, far enough along to
    // turn into: past the car's own spot along the lane, a car and a bit
    const L0 = this.laneAt(0), dx = Math.sign(Math.sin(L0.h)) || 1;
    let ahead = (C.x - L0.x) * dx + 6.5, E = this.laneAt(ahead);
    // (the lane's sample: whole metres, so the end's where the car will be put)
    this.ahead = ahead;
    const D = { x: C.x, z: C.z }, k1 = Math.max(2.5, (E.z - C.z) * 0.62), k2 = Math.max(2.2, Math.abs(E.x - C.x) * 0.5);
    this.path = curve(D, { x: C.x, z: C.z + k1 }, { x: E.x - Math.sin(E.h) * k2, z: E.z - Math.cos(E.h) * k2 }, { x: E.x, z: E.z });
    this.end = E; this.dirSign = dx; this.rev = false;
    // the shot: from out in the lane, up the lane from the box (behind the car once it's turned: the chase cam's side)
    const lw = this.laneWidth();
    this.shotA = { pos: new THREE.Vector3(C.x * 0.35 - dx * 1.6, 1.45, Math.min(lw - 1.2, 7.8)), fov: 50 }; // (out in front of the door: the walls either side out of the way)
    this.shotB = { pos: new THREE.Vector3(E.x - dx * 6.2, 1.9, Math.min(lw - 1.4, 6.2)), fov: 52 };
    this.camFrom = { pos: pg.camera.position.clone(), quat: pg.camera.quaternion.clone(), fov: pg.camera.fov, shift: pg.shiftNow ?? pg.shift ?? 0 };
    this.look = new THREE.Vector3(C.x, 0.7, C.z);
    this.place(0);
    return true;
  }
  // ---------- in ----------
  in(sim, car, done) {
    if (!this.ready(sim)) return false;
    const p = car.phys, A = this.pg.track.a; A.updateMatrixWorld(true);
    const w = new THREE.Vector3(p.x, 0, p.z).applyMatrix4(new THREE.Matrix4().copy(A.matrixWorld).invert());
    this.begin(sim, 'in', car.model, done, w);
    this.car = car;
    const C = this.spot();
    // (it was still rolling: it rolls on to a stop first)
    const h = wrap(p.h - this.yawA), v0 = Math.max(0, Math.min(3, p.u || p.speed || 0));
    const roll = v0 * v0 / (2 * 4.5); this.coast = { x: w.x, z: w.z, h, v0, d: roll, T: v0 / 4.5 };
    const S = { x: w.x + Math.sin(h) * roll, z: w.z + Math.cos(h) * roll };
    // back along the lane, tail first, then round into the box: it ends nose to the door on the spot
    const dist = Math.hypot(S.x - C.x, S.z - C.z), k1 = Math.max(2.5, dist * 0.42), k2 = Math.max(2.8, Math.min(5, C.z < 0 ? -C.z + 2.4 : 4));
    this.path = curve(S, { x: S.x - Math.sin(h) * k1, z: S.z - Math.cos(h) * k1 }, { x: C.x, z: C.z + k2 }, { x: C.x, z: C.z });
    this.rev = true; this.h0 = h;
    // the shot: from across the lane, on the side the car's come from, panning with it into the box
    const lw = this.laneWidth(), dx = Math.sign(Math.sin(h)) || 1;
    this.dirSign = dx;
    this.shotA = { pos: new THREE.Vector3(C.x - dx * 4.6, 1.6, Math.min(lw - 1.2, 7.6)), fov: 50 };
    this.shotB = { pos: new THREE.Vector3(C.x - dx * 1.8, 1.75, Math.min(lw - 1.4, 6.8)), fov: 48 };
    const cam = sim.camera; cam.updateMatrixWorld(true);
    this.camFrom = { pos: cam.position.clone().applyMatrix4(this.Mi), quat: new THREE.Quaternion().setFromRotationMatrix(_m.extractRotation(this.Mi)).multiply(cam.quaternion), fov: cam.fov, shift: 0 };
    this.look = new THREE.Vector3(w.x, 0.7, w.z);
    // the session's camera follows ours from here (the garage menu's, in your box)
    sim.camHold = this.pg.track.hold;
    this.pg.camera.position.copy(this.camFrom.pos); this.pg.camera.quaternion.copy(this.camFrom.quat); this.pg.camera.fov = this.camFrom.fov;
    this.phase = 'coast'; this.place(0);
    return true;
  }
  // the lane's width out from the garages (to the pit wall's side)
  laneWidth() { return this.nav.D; }

  // ---------- each frame ----------
  update(dt) {
    if (!this.active) return;
    if (!this.pg.track || this.pg.track.sim !== this.sim) { this.active = false; return; } // (the session's gone)
    dt = Math.min(dt, 0.05); this.t += dt;
    const ph = this.phase;
    if (ph === 'coast') { // (your car rolling to a stop)
      const c = this.coast, k = c.T > 0 ? Math.min(1, this.t / c.T) : 1, d = c.d * (1 - (1 - k) * (1 - k));
      this.pose(c.x + Math.sin(c.h) * d, c.z + Math.cos(c.h) * d, c.h, (c.v0 * (1 - k)) * dt);
      if (k >= 1) { this.phase = 'gather'; this.t = 0; }
    } else if (ph === 'gather' || ph === 'brace') {
      if (ph === 'gather' && this.crew.every(c => c.there)) { this.phase = 'brace'; this.bt = 0; }
      if (ph === 'brace' && (this.bt += dt) > 0.6) { this.phase = 'push'; this.pt = 0; }
      if (ph === 'gather' && this.t > 7) for (const c of this.crew) c.there = true; // (someone stuck: there anyway)
      this.place(0);
    } else if (ph === 'push') {
      const left = this.path.len - this.s;
      const want = Math.min(V, Math.sqrt(Math.max(0, 2 * ACC * left)));
      this.v += Math.max(-ACC * 1.6 * dt, Math.min(ACC * dt, want - this.v));
      if (left < 0.02 || (this.v < 0.02 && left < 0.25)) { this.s = this.path.len; this.v = 0; this.phase = 'hold'; this.ht = 0; }
      const s0 = this.s; this.s = Math.min(this.path.len, this.s + this.v * dt);
      this.place(this.s - s0);
    } else if (ph === 'hold') {
      this.place(0);
      if ((this.ht += dt) > (this.kind === 'out' ? 0.5 : 0.8)) return this.finish();
    }
    this.crewStep(dt);
    this.camStep(dt);
  }
  // the car on the curve, ds just travelled along it
  place(ds) {
    const q = along(this.path, this.s), h = this.rev ? wrap(q.dir + Math.PI) : q.dir;
    if (this.phase === 'coast') return;
    const fwd = this.rev ? -ds : ds;
    const dh = this.prevH == null ? 0 : wrap(h - this.prevH); this.prevH = h;
    const steer = Math.abs(fwd) > 1e-4 ? Math.max(-0.55, Math.min(0.55, Math.atan(WB * dh / fwd))) : (this.steer || 0);
    this.steer = (this.steer || 0) + (steer - (this.steer || 0)) * 0.2;
    this.pose(q.x, q.z, h, fwd);
  }
  // the car at x, z (this frame), heading h; moved fwd metres forward (negative: back)
  pose(x, z, h, fwd) {
    const y = this.nav.groundY({ x, z }), g = this.carObj.group;
    this.cx = x; this.cz = z; this.ch = h; this.cy = y;
    const ox = x, oz = z;
    if (this.kind === 'out') { // (the garage menu's car: in the bay, in this frame)
      const bay = this.pg.bay.position; g.position.set(ox - bay.x, y, oz - bay.z); g.rotation.set(0, h, 0);
    } else {
      g.position.set(ox, y, oz).applyMatrix4(this.Mw); g.quaternion.setFromAxisAngle(UP, h + this.yawA);
    }
    this.carObj.animate({ steer: this.steer || 0, spin: fwd || 0, heave: 0, pitch: 0, roll: 0 });
  }
  crewStep(dt) {
    const h = this.ch, sn = Math.sin(h), cs = Math.cos(h), B = this.brain, s = this.pg.track.F.mirror ? -1 : 1;
    for (const c of this.crew) {
      const sl = c.slot, rx = -cs, rz = sn; // (the car's right: its frame's -x)
      const tx = this.cx + rx * sl.a + sn * sl.b, tz = this.cz + rz * sl.a + cs * sl.b;
      const fyaw = sl.face > 0 ? h : wrap(h + Math.PI);
      let clip = 'idle', speed = 1, moving = false;
      if (!c.there) {
        // (round what's in the box: js/pitcrew.js's way, in its frame)
        if (!c.path) { c.path = B.path([s * c.x, -c.z], [s * tx, -tz]).map(([px, pz]) => ({ x: s * px, z: -pz })); c.path.push({ x: tx, z: tz }); }
        const n = c.path[0], dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.08) { c.path.shift(); if (!c.path.length) c.there = true; }
        else { const mv = Math.min(d, JOG * dt); c.x += dx / d * mv; c.z += dz / d * mv; c.yaw = lerpYaw(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); moving = true; }
        if (moving) c.ch.move(JOG);
      }
      if (c.there) {
        // (on its slot, which moves with the car)
        const dx = tx - c.x, dz = tz - c.z;
        c.x = tx; c.z = tz; c.yaw = lerpYaw(c.yaw, fyaw, Math.min(1, dt * 6));
        const v = this.phase === 'push' ? this.v : 0, info = CLIP_INFO[sl.clip] || {};
        if (sl.clip === 'walk') { if (v > 0.05) { clip = 'walk'; speed = v / (info.speed || 1.35); } else clip = 'idle'; }
        else { clip = sl.clip; speed = this.phase === 'brace' || this.phase === 'hold' ? 0.25 : Math.max(0.25, v / (info.speed || 0.4)); }
        if (Math.hypot(dx, dz) > 0.5) c.there = false, c.path = null; // (left behind: catch up)
        c.ch.play(clip, { fade: 0.3, speed });
      }
      const y = this.nav.groundY({ x: c.x, z: c.z });
      c.ch.object.position.set(c.x, y, c.z).applyMatrix4(this.Mw); c.ch.object.rotation.y = c.yaw + this.yawA;
      c.ch.object.visible = true;
      c.ch.update(dt);
    }
  }
  // the camera: eased off where it was onto the lane shot, which drifts along and keeps the car in frame
  camStep(dt) {
    const pg = this.pg, cam = pg.camera;
    this.blendK = Math.min(1, (this.blendK || 0) + dt / 2.2);
    const prog = this.path.len ? this.s / this.path.len : 0;
    const want = new THREE.Vector3(this.cx, (this.cy || 0) + 0.75, this.cz);
    this.look.lerp(want, Math.min(1, dt * 2.5));
    const pos = this.shotA.pos.clone().lerp(this.shotB.pos, ease(prog)), fov = this.shotA.fov + (this.shotB.fov - this.shotA.fov) * prog;
    pos.y += this.nav.groundY(pos);
    const quat = new THREE.Quaternion().setFromRotationMatrix(_m.lookAt(pos, this.look, UP));
    const f = this.camFrom, e = ease(this.blendK);
    cam.position.lerpVectors(f.pos, pos, e); cam.quaternion.slerpQuaternions(f.quat, quat, e); cam.fov = f.fov + (fov - f.fov) * e;
    pg.shiftNow = (f.shift || 0) * (1 - e);
    cam.updateMatrixWorld(true);
  }

  skip() {
    if (!this.active) return;
    this.skipped = true;
    this.s = this.path.len; this.v = 0; this.phase = 'hold'; this.prevH = null;
    this.place(0); for (const c of this.crew) c.there = true;
    this.finish();
  }
  finish() {
    if (!this.active) return;
    this.active = false;
    // the crew back to what they were doing (where they are now)
    for (const c of this.crew) {
      const p = c.p, s = this.pg.track.F.mirror ? -1 : 1;
      p.held = false; p.x = s * c.x; p.z = -c.z; p.yaw = Math.atan2(s * Math.sin(c.yaw), -Math.cos(c.yaw)); p.act = null; p.t = 0.3 + Math.random() * 0.9; p.path = [];
      c.ch.play('idle', { fade: 0.4 }); // (straightening up, till they've thought what next)
    }
    const cam = this.pg.camera; cam.updateMatrixWorld(true);
    // (where the camera is, in the world and in this frame: the next one eases on from here)
    const from = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, shift: 0 };
    const world = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: cam.fov }; cam.matrixWorld.decompose(world.pos, world.quat, _v);
    const done = this.done; this.done = null;
    if (this.kind === 'out') {
      // (the menu's car back where it parks, for next time)
      this.carObj.group.position.copy(this.home.pos); this.carObj.group.rotation.copy(this.home.rot);
    }
    if (done) done({ ahead: this.ahead || 0, from, world, skipped: this.skipped });
  }
}
function lerpYaw(a, b, t) { return a + wrap(b - a) * t; }
