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
//   walk.stop();
import * as THREE from 'three';
import { loadCharacters, makeCharacter, CLIP_INFO } from './characters.js';

const R = 0.28;            // your radius (m): how close you get to things
const WALK = CLIP_INFO.walk.speed, RUN = 2.3; // m/s (walking pace; the trigger all the way in: a jog, a bit quicker than the clip's stride)
const ACCEL = 4.5, DECEL = 7;                 // m/s² (speeding up and slowing down: the walk eases into the jog)
const CAM_DIST = 2.7, CAM_HEAD = 1.45, REACH = 1.1;

export class GarageWalk {
  constructor(pg) { this.pg = pg; this.active = false; this.me = null; this.input = {}; this.spot = null; this.spots = []; }

  async start({ livery, face, spots = [] }) {
    const pg = this.pg;
    this.spots = spots; this.spot = null; this.input = {}; this.speed = 0;
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
    this.me.object.position.copy(this.pos); this.me.object.rotation.y = this.heading;
    this.active = true; pg.walker = this;
    return true;
  }
  stop() {
    this.active = false; if (this.pg.walker === this) this.pg.walker = null;
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
  }
  // out of anything you've walked into (a circle against boxes), and inside the floor
  push() {
    const p = this.pos;
    for (let it = 0; it < 3; it++) for (const b of this.boxes || []) {
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
    const mx = I.mx || 0, my = I.my || 0, mag = Math.min(1, Math.hypot(mx, my));
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
    if (this.speed > 0.05) {
      const x0 = this.pos.x, z0 = this.pos.z;
      this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
      this.push();
      // (walked into something: only as fast as you actually got anywhere)
      const got = Math.hypot(this.pos.x - x0, this.pos.z - z0) / Math.max(1e-4, dt);
      if (got < this.speed * 0.5) this.speed = Math.max(got, Math.min(this.speed, WALK * 0.5));
      me.move(this.speed);
    } else { this.speed = 0; me.play('idle'); }
    me.object.position.copy(this.pos); me.object.rotation.y = this.heading; me.update(dt);
    // the camera: behind and above, pulled in front of any wall between it and you
    const head = this.pos.clone().setY(CAM_HEAD);
    const back = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    let dist = CAM_DIST;
    const hit = new THREE.Raycaster(head, back, 0, CAM_DIST + 0.3).intersectObjects(this.camHits, false)[0];
    if (hit) dist = Math.max(0.5, hit.distance - 0.3);
    this.camDist += (dist - this.camDist) * Math.min(1, dt * (dist < this.camDist ? 25 : 4));
    // (pulled in close by a wall behind: up over your shoulder instead, looking down)
    const lift = Math.min(0.5, Math.max(0, CAM_DIST - this.camDist) * 0.25);
    const cam = pg.camera; cam.position.copy(head).addScaledVector(back, this.camDist); cam.position.y += lift; cam.lookAt(head.x, head.y - 0.15 - lift * 0.3, head.z); cam.fov = 58;
    // the spot you're at: the nearest you're facing, within reach
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading); let best = null, bd = Infinity;
    for (const s of this.spots) {
      const px = s.box ? Math.max(s.box.min.x, Math.min(s.box.max.x, this.pos.x)) : s.at.x, pz = s.box ? Math.max(s.box.min.z, Math.min(s.box.max.z, this.pos.z)) : s.at.z;
      const vx = px - this.pos.x, vz = pz - this.pos.z, d = Math.hypot(vx, vz) - (s.box ? R : 0);
      if (d > (s.reach || REACH) || d >= bd) continue;
      if (d > 0.4 && (vx * fx + vz * fz) / Math.hypot(vx, vz) < 0.35) continue;  // (not facing it)
      best = s; bd = d;
    }
    this.spot = best;
  }
  // where to put the prompt: above the spot (screen px), or null
  promptAt() {
    const s = this.spot; if (!s) return null;
    // (a car: over the side nearest you; anything else: just above it)
    const p = s.box ? new THREE.Vector3(Math.max(s.box.min.x, Math.min(s.box.max.x, this.pos.x)), s.box.max.y + 0.35, Math.max(s.box.min.z, Math.min(s.box.max.z, this.pos.z))) : s.at.clone().setY(Math.max(1.3, s.at.y + 0.3));
    return this.pg.toScreen(p);
  }
}
