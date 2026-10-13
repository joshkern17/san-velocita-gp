// Walking round the garage (World Career home, Main Menu > Home Garage): you, the racer with the helmet off, the camera
// close behind. The caller feeds input each frame (walk: stick or WASD, relative to the camera; look: the right stick
// or a mouse drag) and gets back the spot you're at, if any: the things you can use (the computer, a car, a station)
// show a prompt when you're close and facing them.
//
//   const walk = new GarageWalk(pitGarage);
//   await walk.start({ livery, face, spots: [{ key, label, at: Vector3 } | { key, label, box: Box3 }] });
//   walk.input = { mx, my, run, lx, ly }; // mx/my walk (-1..1, my +1 forward), run 0..1 (the right trigger: walk to
//                                         // jog), lx/ly look (rad this frame)
//   pitGarage.update(dt)                  // (moves you and the camera while walk.active)
//   walk.spot                             // the spot you'd use, or null
//   await walk.sit();                     // at the desk: walk to the chair, turn to the screen, sit down (resolves seated)
//   walk.park();                          // hand the camera over (the computer): you stay sat in the chair
//   await walk.resume();                  // stand back up out of it and walk on
//   walk.stop();
import * as THREE from 'three';
import { loadCharacters, makeCharacter, alignedClip, CLIP_INFO } from './characters.js';

const R = 0.28;            // your radius (m): how close you get to things
const WALK = CLIP_INFO.walk.speed, RUN = 2.3; // m/s (walking pace; the trigger all the way in: a jog, a bit quicker than the clip's stride)
const ACCEL = 4.5, DECEL = 7;                 // m/s² (speeding up and slowing down: the walk eases into the jog)
const CAM_DIST = 2.7, CAM_HEAD = 1.45, REACH = 1.1;
// sit_down (Mixamo "Sitting", stand to sat): it stands about till 0.25 of the way, is down by 0.65, and sits back
// SIT_BACK m (and SIT_SIDE m to its left) on the way
const SIT_FROM = 0.25, SIT_TO = 0.68, SIT_SPEED = 1.15, SIT_BACK = 0.46, SIT_SIDE = 0.05;
// stand_up (Mixamo "Stand Up", sat to stood): still till 0.2, up by 0.45, steady by 0.6, about 0.43 m forward
const STAND_FROM = 0.15, STAND_TO = 0.6;
const SWIVEL = 2.2; // rad/s, round on the chair

export class GarageWalk {
  constructor(pg) { this.pg = pg; this.active = false; this.me = null; this.input = {}; this.spot = null; this.spots = []; }

  // from: where you come in. null: SPAWN; 'door': in through the roll-up door (back from a race, a gig); 'desk': getting
  // up from the desk chair (the career loaded); 'last': where you were when walking last stopped
  async start({ livery, face, spots = [], from = null }) {
    const pg = this.pg;
    this.spots = spots; this.spot = null; this.input = {}; this.speed = 0; this.act = null; this.ghost = false; this.camFrom = null; this.focus = null; this._hips = null;
    if (!(await loadCharacters())) return false;
    if (this.me) this.me.dispose();
    this.me = makeCharacter({ look: 'racer', clip: 'idle', livery, face, helmet: false, seed: 11 });
    pg.scene.add(this.me.object);
    this.buildColliders();
    // in at SPAWN (the kit's), else in front of the car
    const k = pg.kit, p = new THREE.Vector3(), q = new THREE.Quaternion();
    if (k && k.spawn) { k.spawn.getWorldPosition(p); k.spawn.getWorldQuaternion(q); }
    else p.copy(pg.carCentre()).add(new THREE.Vector3(1.6, 0, 3.6));
    p.y = 0; this.pos = p; this.push();
    // facing: the way the spawn's arrow points; the camera behind you
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q); this.heading = Math.atan2(f.x, f.z); // (Blender's -Y)
    if (!(k && k.spawn)) this.heading = Math.PI;
    this.camYaw = this.heading; this.camPitch = 0.3; this.camDist = CAM_DIST;
    const at = this.entry(from, p.clone());
    this.me.object.position.copy(this.pos); this.me.object.rotation.y = this.heading;
    // (the camera comes round to you from wherever it was: the room's shot, not a cut)
    this.camFrom = { pos: pg.camera.position.clone(), quat: pg.camera.quaternion.clone(), fov: pg.camera.fov, k: 0 };
    this.active = true; pg.walker = this;
    if (at === 'desk') this.resume();
    return true;
  }
  // where you come in (start's from); returns what it set up
  entry(from, spawn) {
    if (from === 'last' && this.last) { this.pos.copy(this.last.pos); this.heading = this.last.heading; this.camYaw = this.last.camYaw; return 'last'; }
    const door = this.spots.find(s => s.key === 'door');
    if (from === 'door' && door) {   // (just inside the door, walking in to SPAWN)
      const d = new THREE.Vector3(spawn.x - door.at.x, 0, spawn.z - door.at.z); if (d.lengthSq() < 0.01) return null;
      this.pos.set(door.at.x, 0, door.at.z); this.heading = Math.atan2(d.x, d.z); this.camYaw = this.heading;
      this.act = { kind: 'enter', step: 'walk', stand: spawn.clone().setY(0), done: () => {} };
      return 'door';
    }
    if (from === 'desk') {           // (sat at the desk, turned to the screen: you get up out of it)
      const s = this.deskSeat(); if (!s || !s.chair) return null;
      const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x)), out = Math.cos(s.chair.face - s.face) < -0.17 ? s.chair.face : s.face + Math.PI;
      this.spin(s.chair.o, s.chair.pivot, wrap(s.face - s.chair.face));
      const fx = Math.sin(s.face), fz = Math.cos(s.face);
      this.pos.copy(s.seat).add(new THREE.Vector3(fx, 0, fz).multiplyScalar(SIT_BACK)).add(new THREE.Vector3(fz, 0, -fx).multiplyScalar(-SIT_SIDE));
      this.heading = s.face; this.camYaw = s.face + Math.PI;   // (the camera out in the room, looking at you at the desk)
      this.me.play(alignedClip('sit_desk', 'sit_down'), { fade: 0 });
      this.act = { kind: 'sit', step: 'sat', seat: s.seat, face: s.face, out, chair: { ...s.chair, left: 0 }, k: 1, done: () => {} };
      return 'desk';
    }
    return null;
  }
  // off doing something (the car, the list, the computer): you stay where you are, the camera's theirs. unpark() picks
  // walking up again from there
  unpark() {
    const pg = this.pg; if (!this.me) return false;
    pg.parked = null; this.me.object.visible = true;
    this.camFrom = { pos: pg.camera.position.clone(), quat: pg.camera.quaternion.clone(), fov: pg.camera.fov, k: 0 };
    this.input = {}; this.speed = 0; this.active = true; pg.walker = this;
    return true;
  }
  stop() {
    if (this.pos) this.last = { pos: this.pos.clone(), heading: this.heading, camYaw: this.camYaw };
    this.active = false; if (this.pg.walker === this) this.pg.walker = null; this.pg.parked = null; this.act = null;
    if (this.me) { this.me.dispose(); this.me.object.removeFromParent(); this.me = null; }
    this.spot = null;
  }

  // what you can't walk through: things standing on the floor (their boxes), the cars, the floor's edge (NAV_floor)
  buildColliders() {
    const pg = this.pg, boxes = [];
    pg.room.updateMatrixWorld(true);
    pg.room.traverse(o => {
      if (!o.isMesh || (!o.visible && !/^COL_/.test(o.name))) return;
      if (/^NAV_/.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty() || b.max.y < 0.15 || b.min.y > 1.7) return;           // (the floor, the roof, things on the walls up high)
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      if (w * d > 8 && w > 0.3 && d > 0.3) return;                           // (a big L of walls: its box is the room)
      boxes.push(b);
    });
    for (const c of [pg.car, pg.car2]) if (c && c.group.parent && c.group.visible) {
      const b = new THREE.Box3(); c.group.updateMatrixWorld(true);
      c.group.traverse(o => { if (o.isMesh && o !== c.shadow && !(c.shadow && c.shadow.children.includes(o))) b.expandByObject(o); });
      if (!b.isEmpty()) boxes.push(b);
    }
    this.boxes = boxes;
    // the floor you can walk on: NAV_floor's box, else the room's walls
    const nav = pg.kit && pg.kit.nav[0];
    this.bounds = nav ? new THREE.Box3().setFromObject(nav) : new THREE.Box3(new THREE.Vector3(-5.6, 0, -13.6), new THREE.Vector3(5.6, 0, -0.4));
    this.camHits = []; pg.room.traverse(o => { if (o.isMesh && o.visible) this.camHits.push(o); });
    // (the camera goes through the desk chair: sat in it, its back would push the camera right in over your head)
    const ds = this.deskSeat(); this.noCam = new Set(); if (ds && ds.chair) ds.chair.o.traverse(m => { if (m.isMesh) this.noCam.add(m); });
  }
  // out of anything you've walked into (a circle against boxes), and inside the floor
  push() {
    const p = this.pos;
    // (just stood up from the chair, tucked in at the desk: what you're stood in, the chair and the desk, doesn't push
    // you till you're out of it; everything else does)
    const inside = (b) => p.x > b.min.x - R && p.x < b.max.x + R && p.z > b.min.z - R && p.z < b.max.z + R;
    if (this.ghost === true) this.ghost = new Set((this.boxes || []).filter(inside));
    if (this.ghost) { for (const b of this.ghost) if (!inside(b)) this.ghost.delete(b); if (!this.ghost.size) this.ghost = null; }
    for (let it = 0; it < 3; it++) for (const b of this.boxes || []) {
      if (this.ghost && this.ghost.has(b)) continue;
      const cx = Math.max(b.min.x, Math.min(b.max.x, p.x)), cz = Math.max(b.min.z, Math.min(b.max.z, p.z));
      let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= R) continue;
      if (d < 1e-4) { // (inside it: out the nearest side)
        const opts = [[b.min.x - R - p.x, 0], [b.max.x + R - p.x, 0], [0, b.min.z - R - p.z], [0, b.max.z + R - p.z]];
        const [ox, oz] = opts.sort((u, v) => Math.hypot(...u) - Math.hypot(...v))[0]; p.x += ox; p.z += oz; continue;
      }
      p.x = cx + dx / d * R; p.z = cz + dz / d * R;
    }
    if (this.bounds) { const B = this.bounds; p.x = Math.max(B.min.x + R, Math.min(B.max.x - R, p.x)); p.z = Math.max(B.min.z + R, Math.min(B.max.z - R, p.z)); }
  }

  update(dt) {
    const pg = this.pg, me = this.me, I = this.input || {}; if (!me) return;
    const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    // the camera turns (right stick / mouse: lx + turns it right)
    this.camYaw -= I.lx || 0; this.camPitch = Math.max(0.05, Math.min(0.9, this.camPitch + (I.ly || 0)));
    // walking, relative to where the camera looks (forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw))
    const busy = this.act && this.acting(dt, wrap); // (sitting down or getting up: the sticks wait)
    const mx = busy ? 0 : I.mx || 0, my = busy ? 0 : I.my || 0, mag = Math.min(1, Math.hypot(mx, my));
    // how fast: the stick's push, at walking pace; the right trigger (or Shift) takes it up to a jog. Eased, so the
    // walk blends into the jog and back (Character.move)
    const run = Math.max(0, Math.min(1, +I.run || 0)), want = mag > 0.15 ? WALK * Math.max(0.45, Math.min(1, mag / 0.9)) * (1 - run) + RUN * run : 0;
    this.speed += Math.max(-DECEL * dt, Math.min(ACCEL * dt, want - this.speed));
    if (mag > 0.15) {
      const c = this.camYaw, vx = Math.sin(c) * my - Math.cos(c) * mx, vz = Math.cos(c) * my + Math.sin(c) * mx;
      this.heading += wrap(Math.atan2(vx, vz) - this.heading) * Math.min(1, dt * 12);
      // (the camera swings round behind you as you go, unless you're turning it yourself)
      if (!I.lx && my > 0.3) this.camYaw += wrap(this.heading - this.camYaw) * Math.min(1, dt * 0.9 * my); // (only walking forward: strafing doesn't spin it)
    }
    if (busy) this.speed = 0;
    else if (want > 0 || this.speed > 0.05) { // (pushing the stick: moving, however slowly it's got going this frame. At 120 fps
                                         // one frame's speeding up is under 0.05: zeroing it there, you never got going)
      const x0 = this.pos.x, z0 = this.pos.z;
      this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
      this.push();
      // (walked into something: only as fast as you actually got anywhere)
      const got = Math.hypot(this.pos.x - x0, this.pos.z - z0) / Math.max(1e-4, dt);
      if (got < this.speed * 0.5) this.speed = Math.max(got, Math.min(this.speed, WALK * 0.5));
      me.move(this.speed);
    } else { this.speed = 0; me.play('idle'); }
    me.object.position.copy(this.pos); me.object.rotation.y = this.heading; me.update(dt);
    // the camera: behind and above, pulled in front of any wall between it and you (sat down: your head, lower and back
    // over the seat)
    // (sitting down or getting up: following your hips, lower as you sit; eased, so it doesn't jump when that starts)
    const A = this.act, aim = A && A.focus ? new THREE.Vector3(A.focus.x, CAM_HEAD - 0.3 * A.k, A.focus.z) : this.pos.clone().setY(CAM_HEAD);
    this.easeT = A ? 0.6 : (this.easeT || 0) - dt; // (walking: right on you; sitting, getting up and just after: eased)
    if (!this.focus) this.focus = aim.clone(); this.focus.lerp(aim, this.easeT > 0 ? Math.min(1, dt * 8) : 1); const head = this.focus.clone();
    const back = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    let dist = CAM_DIST;
    const hit = new THREE.Raycaster(head, back, 0, CAM_DIST + 0.3).intersectObjects(this.camHits, false).find(h => !this.noCam || !this.noCam.has(h.object));
    if (hit) dist = Math.max(0.5, hit.distance - 0.3);
    this.camDist += (dist - this.camDist) * Math.min(1, dt * (dist < this.camDist ? 25 : 4));
    // (pulled in close by a wall behind: up over your shoulder instead, looking down)
    const lift = Math.min(0.5, Math.max(0, CAM_DIST - this.camDist) * 0.25);
    const cam = pg.camera; cam.position.copy(head).addScaledVector(back, this.camDist); cam.position.y += lift; cam.lookAt(head.x, head.y - 0.15 - lift * 0.3, head.z); cam.fov = 58;
    // (back from the computer: out of the screen to here, not a cut)
    if (this.camFrom) {
      const f = this.camFrom, k = (f.k = Math.min(1, f.k + dt / 0.9)), e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(f.pos, cam.position, e); cam.quaternion.slerpQuaternions(f.quat, cam.quaternion, e); cam.fov = f.fov + (58 - f.fov) * e;
      if (k >= 1) this.camFrom = null;
    }
    // the spot you're at: the nearest you're facing, within reach
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading); let best = null, bd = Infinity;
    for (const s of this.act ? [] : this.spots) {
      const px = s.box ? Math.max(s.box.min.x, Math.min(s.box.max.x, this.pos.x)) : s.at.x, pz = s.box ? Math.max(s.box.min.z, Math.min(s.box.max.z, this.pos.z)) : s.at.z;
      const vx = px - this.pos.x, vz = pz - this.pos.z, d = Math.hypot(vx, vz) - (s.box ? R : 0);
      if (d > (s.reach || REACH)) continue;
      const dot = d > 0.4 ? (vx * fx + vz * fz) / Math.hypot(vx, vz) : 1;
      if (dot < 0.35) continue;                                                // (not facing it)
      const score = Math.max(d, 0.1) * (1.5 - dot);                            // (nearer, and more what you're facing: the calendar on the wall over the desk, not the chair in front of it)
      if (score < bd) { best = s; bd = score; }
    }
    this.spot = best;
  }
  // the desk chair: the chair nearest the computer's screen (its middle is the seat), and which way it faces (away
  // from its backrest: the tall part). Without one, a spot in front of the screen. { seat: Vector3 (on the floor),
  // face: heading to the screen (rad), chair: { o, face } | null }
  deskSeat() {
    const pg = this.pg, f = pg.screenFrame(); if (!f) return null;
    let best = null, bd = 1.8;
    pg.room.traverse(o => {
      if (!/chair/i.test(o.name) || /chair/i.test(o.parent && o.parent.name || '') || /^GUIDE/.test(o.name) || !o.visible) return;
      const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return;
      const c = b.getCenter(new THREE.Vector3()), d = Math.hypot(c.x - f.c.x, c.z - f.c.z);
      if (d < bd) { bd = d; best = { o, b, c }; }
    });
    const n = new THREE.Vector3(f.n.x, 0, f.n.z).normalize();
    const seat = best ? best.c.clone().setY(0) : f.c.clone().addScaledVector(n, 0.85).setY(0);
    let chair = null;
    if (best) { // (the backrest: what's in the top quarter of it, off to one side of the middle)
      const top = best.b.max.y - (best.b.max.y - best.b.min.y) * 0.25, v = new THREE.Vector3(), sum = new THREE.Vector3(); let k = 0;
      best.o.updateMatrixWorld(true);
      best.o.traverse(m => { const P = m.isMesh && m.geometry.attributes.position; if (!P) return;
        for (let i = 0; i < P.count; i += 1) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); if (v.y >= top) { sum.add(v); k++; } } });
      if (k) { sum.multiplyScalar(1 / k); const bx = sum.x - best.c.x, bz = sum.z - best.c.z; if (Math.hypot(bx, bz) > 0.05) chair = { o: best.o, face: Math.atan2(-bx, -bz), pivot: seat.clone() }; }
    }
    return { seat, face: Math.atan2(f.c.x - seat.x, f.c.z - seat.z), chair };
  }
  // turn something round the upright through `p` (world) by `ang` (rad)
  spin(o, p, ang) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    o.updateMatrixWorld(true); o.parent.updateMatrixWorld(true);
    const wp = o.getWorldPosition(new THREE.Vector3()).sub(p).applyQuaternion(q).add(p);
    const wq = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
    o.position.copy(wp.applyMatrix4(o.parent.matrixWorld.clone().invert()));
    o.quaternion.copy(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
  }
  // sit down at the desk, the way you would on a swivel chair: walk up to the chair from the room, turn your back to it,
  // sit (the clip sits back SIT_BACK into it), then swivel round to the screen with it. A chair already facing the
  // desk is turned out first, so you never walk in between it and the desk. Resolves once you're round
  sit() {
    const s = this.deskSeat(); if (!s || !this.me) return Promise.resolve(false);
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    const away = s.face + Math.PI, c = s.chair;
    const out = c && Math.cos(c.face - s.face) < -0.17 ? c.face : away;      // (the chair's way, when it faces the room; else straight out)
    const fx = Math.sin(out), fz = Math.cos(out);
    const stand = s.seat.clone().add(new THREE.Vector3(fx, 0, fz).multiplyScalar(SIT_BACK)).add(new THREE.Vector3(fz, 0, -fx).multiplyScalar(-SIT_SIDE));
    const chair = c ? { ...c, left: wrap(out - c.face) } : null;              // (turned out first, if it has to be)
    return new Promise(done => { this.act = { kind: 'sit', step: 'walk', stand, seat: s.seat, face: s.face, out, chair, k: 0, done }; });
  }
  // round on the chair (you and it, about the seat) by `d` rad
  swivel(a, d) {
    const p = this.pos, v = { x: p.x - a.seat.x, z: p.z - a.seat.z }, c = Math.cos(d), sn = Math.sin(d);
    p.x = a.seat.x + v.x * c + v.z * sn; p.z = a.seat.z - v.x * sn + v.z * c; this.heading += d;
    if (a.chair) this.spin(a.chair.o, a.chair.pivot, d);
  }
  // sat at the computer: the camera's the computer's now; you stay in the chair (hidden once the camera's halfway in)
  park() {
    this.active = false; if (this.pg.walker === this) this.pg.walker = null;
    this.pg.parked = this.me ? { object: this.me.object, me: this.me } : null;
  }
  // back from the computer: stand up out of the chair (the sit, backwards), the camera out of the screen behind you
  resume() {
    const pg = this.pg, me = this.me; if (!me || !this.act) return Promise.resolve(false);
    pg.parked = null; me.object.visible = true;
    this.camFrom = { pos: pg.camera.position.clone(), quat: pg.camera.quaternion.clone(), fov: pg.camera.fov, k: 0 };
    this.camYaw = this.act.face; this.camPitch = 0.3;
    this.active = true; pg.walker = this;
    return new Promise(done => { Object.assign(this.act, { kind: 'stand', step: 'out', left: undefined, done }); });
  }
  // where your hips are (world), and how far down into the chair they are (0 standing, 1 sat)
  hips() {
    const me = this.me; me.object.position.copy(this.pos); me.object.rotation.y = this.heading; me.object.updateMatrixWorld(true);
    this._hips = this._hips || me.bone('Hips'); return this._hips.getWorldPosition(new THREE.Vector3());
  }
  // a frame of sitting down / getting up; true while it's got the controls
  acting(dt, wrap) {
    const a = this.act, me = this.me;
    const down = (h) => { a.focus = h; a.k = Math.max(0, Math.min(1, (0.99 - h.y) / (0.99 - 0.61))); };
    const turn = (left) => { const d = Math.sign(left) * Math.min(Math.abs(left), dt * SWIVEL * Math.min(1, 0.25 + Math.abs(left))); return d; }; // (eases in at the end)
    if (a.kind === 'enter') {          // (in through the door: a few steps in to SPAWN, then it's yours)
      const vx = a.stand.x - this.pos.x, vz = a.stand.z - this.pos.z, d = Math.hypot(vx, vz);
      if (d < 0.05) { this.act = null; me.play('idle', { fade: 0.3 }); return false; }
      this.heading += wrap(Math.atan2(vx, vz) - this.heading) * Math.min(1, dt * 10); const v = Math.min(WALK, d / dt);
      this.pos.x += vx / d * v * dt; this.pos.z += vz / d * v * dt; me.move(WALK); this.camYaw += wrap(this.heading - this.camYaw) * Math.min(1, dt * 2);
      return true;
    }
    if (a.kind === 'sit') {
      // (a chair facing the desk: turned out to the room as you come up to it)
      if (a.chair && a.chair.left && a.step !== 'swivel') { const c = a.chair, d = turn(c.left); this.spin(c.o, c.pivot, d); c.left -= d; if (Math.abs(c.left) < 1e-4) c.left = 0; }
      if (a.step === 'walk') {          // (to the spot in front of the chair, straight there)
        const vx = a.stand.x - this.pos.x, vz = a.stand.z - this.pos.z, d = Math.hypot(vx, vz);
        if (d < 0.03) { this.pos.x = a.stand.x; this.pos.z = a.stand.z; a.step = 'turn'; me.play('idle', { fade: 0.25 }); }
        else { this.heading += wrap(Math.atan2(vx, vz) - this.heading) * Math.min(1, dt * 10); const v = Math.min(WALK, d / dt); this.pos.x += vx / d * v * dt; this.pos.z += vz / d * v * dt; me.move(WALK); }
      }
      if (a.step === 'turn') {          // (your back to the chair)
        const e = wrap(a.out - this.heading); this.heading += Math.sign(e) * Math.min(Math.abs(e), dt * 5);
        if (Math.abs(e) < 0.02 && !(a.chair && a.chair.left)) { this.heading = a.out; a.step = 'down'; me.play('sit_down', { once: true, fade: 0.2, offset: SIT_FROM, speed: SIT_SPEED }); }
      }
      if (a.step === 'down' && me.action.time / me.clipDuration('sit_down') >= SIT_TO) {
        a.step = 'swivel'; a.left = wrap(a.face - a.out);
        me.play(alignedClip('sit_desk', 'sit_down'), { fade: 0.6 });     // (settling in at the desk: its idle, lined up with where sitting down left you)
      }
      if (a.step === 'swivel') {        // (round to the screen, chair and all)
        const d = turn(a.left); this.swivel(a, d); a.left -= d;
        if (Math.abs(a.left) < 1e-4) { a.step = 'sat'; a.done(true); }
      }
      // (the camera stays out in the room, looking at the desk: you sit down facing it, then swivel round away from it)
      if (a.step !== 'walk') this.camYaw += wrap(a.face - this.camYaw) * Math.min(1, dt * 2);
      if (a.step !== 'walk' && a.step !== 'turn') down(this.hips());
      return true;
    }
    // getting up: swivel back out to the room, then stand up (stand_up). That clip starts sat a little higher and further
    // back than sit_down ends, so the body's held where it was and eased onto the clip as you rise. You end up where it
    // stood you (its hips)
    if (a.step === 'out') {
      if (a.left === undefined) a.left = wrap(a.out - this.heading);
      const d = turn(a.left); this.swivel(a, d); a.left -= d; down(this.hips());
      if (Math.abs(a.left) < 1e-4) a.step = 'up';
      return true;
    }
    const D = me.clipDuration('stand_up');
    if (a.step === 'up') {
      const H0 = this.hips();
      this.pos.x = a.seat.x; this.pos.z = a.seat.z;
      me.play('stand_up', { once: true, fade: 0, offset: STAND_FROM, speed: SIT_SPEED }); me.body.position.set(0, 0, 0); me.mixer.update(0);
      a.off = H0.sub(this.hips()).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading); a.step = 'rise';
    }
    const t = me.action.time / D, e = Math.max(0, Math.min(1, (t - 0.2) / (0.45 - 0.2)));
    me.body.position.copy(a.off).multiplyScalar(1 - e * e * (3 - 2 * e));
    down(this.hips());
    if (t >= STAND_TO) {
      const h = this.hips(); this.pos.x = h.x; this.pos.z = h.z; me.body.position.set(0, 0, 0);
      me.play('idle', { fade: 0 }); this.act = null; this.ghost = true; a.done(true); return false;
    }
    return true;
  }
  // where a spot's tag hangs: right over the thing, and it stays there as you walk round (a car: over its middle; a
  // spot with its own mark: there; anything else: just above where it is)
  anchor(s) {
    if (s.mark) return s.mark;
    if (s.box) { const c = s.box.getCenter(new THREE.Vector3()); return c.setY(s.box.max.y + 0.2); }
    return s.at.clone().setY(Math.max(1.3, s.at.y + 0.3));
  }
  // every spot's tag this frame: { s, x, y (screen px) | null when off screen or behind a wall, open: the one you'd use }
  // (behind a wall: a ray from the camera hits the room first; checked ten times a second)
  tags(dt) {
    const pg = this.pg, cam = pg.camera.position; this.tagT = (this.tagT || 0) - dt; const look = this.tagT <= 0; if (look) this.tagT = 0.1;
    return this.spots.map(s => {
      const p = this.anchor(s), at = pg.toScreen(p);
      if (look) { const d = p.clone().sub(cam), n = d.length(); s.hidden = n > 0.5 && new THREE.Raycaster(cam, d.normalize(), 0.05, n - 0.35).intersectObjects(this.camHits, false).some(h => !this.noCam || !this.noCam.has(h.object)); }
      const near = p.distanceTo(cam) < 1.2;   // (right by the camera, e.g. the door just as you've come in: it'd float over you)
      return { s, x: at && at.x, y: at && at.y, show: !!at && !s.hidden && !near, open: s === this.spot };
    });
  }
}
