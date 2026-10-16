// Walking the pit lane in practice and qualifying (js/garagewalk.js, with the garage menu in your box: js/pitgarage.js
// useTrack): where you can go and what's in the way. Everything here is in your box's frame (the garage's room: x
// across, the door at z = 0, +z out to the lane), as the walker works in.
//
//   const nav = new PitNav(sim, pitGarage);   // after the box is up (pitGarage.track)
//   nav.push(pos, r)                          // pos (x, z) out of things and back onto somewhere you can stand
//   nav.spawn / nav.heading                   // where you get up from: beside your car, facing the door
//   nav.hits                                  // what the camera can't go through (meshes, in the world)
//
// Where you can stand: the pit lane in front of the garages (from their fronts out to the lane's far edge, short of
// the pit wall's stands) along the whole block, and in every team's box (in through its door; not a shut one). In
// the way: the garages' pillars, what's in the boxes (js/pitboxes.js dressBox: the bench, the tires, the tool chests),
// your car and your desk, and the crews stood at their boxes.
import * as THREE from 'three';
import { pitSlots, BOX } from './pitboxes.js';
import { PROP_OBSTACLES } from './pitprops.js';

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class PitNav {
  constructor(sim, pg) {
    this.sim = sim; this.pg = pg;
    const a = pg.track.a; a.updateMatrixWorld(true);
    const M = this.M = new THREE.Matrix4().copy(a.matrixWorld).invert();
    const L = (arr) => { const p = v3(arr).applyMatrix4(M); return { x: p.x, z: p.z, y: p.y }; };
    const { T, A, pit } = sim, life = sim.pitLife;
    // the lane: the garage line (js/pitboxes.js pitSlots), each stretch's way in (to the garages), its length along
    const G = pitSlots(T, A, pit);
    this.line = G.G.map(L); this.S = G.S; this.Send = G.S[G.S.length - 1];
    this.nIn = this.line.slice(0, -1).map((p, j) => {
      const q = this.line[j + 1], len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      let nx = -(q.z - p.z) / len, nz = (q.x - p.x) / len;
      const i = G.byReg[G.rMin + j], c = L([T.X[i], T.Y[i], T.Z[i]]);   // (away from the track's middle line)
      if ((p.x - c.x) * nx + (p.z - c.z) * nz < 0) { nx = -nx; nz = -nz; }
      return { x: nx, z: nz };
    });
    this.D = pit.width + 0.6 - 0.35;   // (out to the lane's far edge: js/track.js puts it there, the stands' strip beyond)
    // the boxes with a team in them: open, and walkable
    this.rooms = []; this.obs = [];
    for (const b of life ? life.boxes : []) {
      const F = b.F; if (!F) continue;
      const o = L(F.P(0, 0, 0)), px = L(F.P(1, 0, 0)), pz = L(F.P(0, 1, 0));
      const fr = { o, t: { x: px.x - o.x, z: px.z - o.z }, n: { x: pz.x - o.x, z: pz.z - o.z }, wx: F.wx, dw: F.dw, F };
      this.rooms.push(fr);
      this.dress(fr, b === life.mine, F.mirror, life.boxModel && F);
    }
    // your car and your desk (in this frame already: the garage's room)
    const parts = [];
    if (pg.car && pg.car.group.visible) parts.push(pg.car.group);
    pg.room.children.forEach(c => { if (c.isGroup) parts.push(...c.children); });
    for (const o of parts) {
      const bb = this.localBox(o);
      if (bb && !bb.isEmpty() && bb.max.y > 0.15 && bb.min.y < 1.7) this.obs.push({ box: [bb.min.x, bb.max.x, bb.min.z, bb.max.z] });
    }
    // the crews (where they stand: looked at again now and then)
    this.crewT = 0; this.crew = [];
    // where you get up: in front of your car's nose, facing out of the door (the camera over the car, clear of the air
    // lines either side)
    const C = pg.carCentre(); this.spawn = new THREE.Vector3(C.x, 0, C.z + 3.9); this.heading = 0;
    // what the camera can't go through: the garages (fronts, rooms, shutters) and your desk
    this.hits = [];
    sim.scene.getObjectByName('PitBoxes')?.traverse(o => { if (o.isMesh && !(o.material && o.material.toneMapped === false)) this.hits.push(o); });
    pg.room.traverse(o => { if (o.isMesh && o.visible && !o.userData.pcScreen) this.hits.push(o); });
    for (const g of life ? life.root.children : []) if (g.name === 'BoxDress') g.traverse(o => { if (o.isMesh && !o.material.transparent) this.hits.push(o); }); // (the air lines, the benches)
  }
  // a thing's box in this frame
  localBox(o) {
    const bb = new THREE.Box3(), m = new THREE.Matrix4(), s = this.pg.car && this.pg.car.shadow;
    o.updateWorldMatrix(true, true);
    o.traverse(c => {
      if (!c.isMesh || c === s || (s && s.children.includes(c))) return;
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      bb.union(c.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(this.M, c.matrixWorld)));
    });
    return bb;
  }
  // what's in a box (js/pitboxes.js dressBox's things, in its frame: x along its front, z in from it)
  // (model: js/pitbox.js's, when the boxes are from models/pitbox.glb: what's in them is whatever's in that)
  dress(fr, mine, mirror, model) {
    const { wx, dw } = fr, d = BOX.depth, R = (x0, x1, z0, z1) => this.obs.push({ fr, r: [x0, x1, z0, z1] }), Cc = (x, z, r) => this.obs.push({ fr, c: [x, z, r] });
    for (const s of [-1, 1]) R(s < 0 ? -wx - 0.3 : dw, s < 0 ? -dw : wx + 0.3, -0.05, BOX.frontT); // (the pillars either side of the door)
    if (model) { for (const r of this.sim.pitLife.boxModel.footprints(model, mine)) R(...r); return; }
    // (against a wall, each runs on through it: stood in one, the nearest way out is into the room)
    R(-3.65, 3.65, d - 1.05, d + 1);                   // the engineers' bench, its stools
    for (const x of [-2.2, 0, 2.2]) Cc(x, d - 1.6, 0.25);
    R(-wx - 1, -wx + 0.92, 2.6, 10.6);                 // the tires down the left wall
    R(wx - 0.8, wx + 1, 2.95, 6.5); R(wx - 0.88, wx + 1, 7.15, 10.65); // the tool chests, the bench by them
    for (const s of [-1, 1]) Cc(s * (wx - 0.25), 1.0, 0.12);  // the fire extinguishers
    for (const s of [-1, 1]) for (const z of [4.6, 9.8]) if (!(mine && z > 9 && s === (mirror ? 1 : -1))) Cc(s * 2.4, z, 0.14); // the air lines
    for (const r of PROP_OBSTACLES(wx)) R(...r);       // the furniture (js/pitprops.js)
  }
  // a point in a box's frame and back
  inFr(fr, p) {
    const dx = p.x - fr.o.x, dz = p.z - fr.o.z;
    return { x: dx * fr.t.x + dz * fr.t.z, z: dx * fr.n.x + dz * fr.n.z };
  }
  outFr(fr, q, p) { p.x = fr.o.x + fr.t.x * q.x + fr.n.x * q.z; p.z = fr.o.z + fr.t.z * q.x + fr.n.z * q.z; }
  refreshCrew(dt) {
    if ((this.crewT -= dt) > 0) return; this.crewT = 0.5;
    const life = this.sim.pitLife, out = [], p = new THREE.Vector3();
    for (const b of life ? life.boxes : []) for (const ch of [...b.crew.map(m => m.ch), ...(b.driver && b.driver.object.visible ? [b.driver] : [])]) { ch.object.getWorldPosition(p).applyMatrix4(this.M); out.push([p.x, p.z]); }
    this.crew = out;
  }
  // out of anything in the way (a circle of radius r against rectangles and circles)
  clear(p, r) {
    const circ = (cx, cz, cr) => {
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = cr + r;
      if (d >= m) return;
      if (d < 1e-4) { p.x += m; return; }
      p.x = cx + dx / d * m; p.z = cz + dz / d * m;
    };
    const rect = (q, [x0, x1, z0, z1]) => {
      const cx = Math.max(x0, Math.min(x1, q.x)), cz = Math.max(z0, Math.min(z1, q.z));
      const dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) return false;
      if (d < 1e-4) { // (inside it: out the nearest side)
        const o = [[x0 - r - q.x, 0], [x1 + r - q.x, 0], [0, z0 - r - q.z], [0, z1 + r - q.z]].sort((u, v) => Math.hypot(...u) - Math.hypot(...v))[0];
        q.x += o[0]; q.z += o[1];
      } else { q.x = cx + dx / d * r; q.z = cz + dz / d * r; }
      return true;
    };
    for (const o of this.obs) {
      if (o.box) { rect(p, o.box); continue; }
      if (o.c) { const q = this.inFr(o.fr, p), [x, z, cr] = o.c, dx = q.x - x, dz = q.z - z, d = Math.hypot(dx, dz), m = cr + r;
        if (d < m) { if (d < 1e-4) q.x += m; else { q.x = x + dx / d * m; q.z = z + dz / d * m; } this.outFr(o.fr, q, p); } continue; }
      const q = this.inFr(o.fr, p); if (rect(q, o.r)) this.outFr(o.fr, q, p);
    }
    for (const [x, z] of this.crew) circ(x, z, 0.26);
  }
  // in a team's box (past its door's sill), or out in the lane
  inBox(p) {
    for (const fr of this.rooms) { const q = this.inFr(fr, p); if (q.z > BOX.frontT - 0.1 && Math.abs(q.x) < fr.wx) return true; }
    return false;
  }
  // somewhere you can stand: in the lane, in a box, in its door. The nearest of them if you're in none
  contain(p, r) {
    let best = null, bd = Infinity;
    const take = (x, z) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = [x, z]; } };
    // the lane: nearest stretch of the garage line, how far along it, how far out from it
    let j0 = 0, u0 = 0, dmin = Infinity;
    for (let j = 0; j < this.line.length - 1; j++) {
      const a = this.line[j], b = this.line[j + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2)), d = Math.hypot(p.x - a.x - ex * u, p.z - a.z - ez * u);
      if (d < dmin) { dmin = d; j0 = j; u0 = u; }
    }
    if (this.line.length > 1) {
      const a = this.line[j0], b = this.line[j0 + 1], n = this.nIn[j0], len = this.S[j0 + 1] - this.S[j0];
      const s = this.S[j0] + u0 * len, bx = a.x + (b.x - a.x) * u0, bz = a.z + (b.z - a.z) * u0;
      const din = (p.x - bx) * n.x + (p.z - bz) * n.z;
      const sc = Math.max(r, Math.min(this.Send - r, s)), dc = Math.max(-this.D, Math.min(-r, din));
      if (sc === s && dc === din) return; // (in the lane)
      // (clamped along the line: back along this stretch)
      const uc = Math.max(0, Math.min(1, u0 + (sc - s) / (len || 1))), cx = a.x + (b.x - a.x) * uc, cz = a.z + (b.z - a.z) * uc;
      take(cx + n.x * dc, cz + n.z * dc);
    }
    // the boxes: the room, and its door
    for (const fr of this.rooms) {
      const q = this.inFr(fr, p);
      for (const [x0, x1, z0, z1] of [[-fr.wx + r, fr.wx - r, BOX.frontT + r, BOX.depth - r], [-fr.dw + r, fr.dw - r, -1.2, BOX.frontT + r + 0.1]]) {
        const x = Math.max(x0, Math.min(x1, q.x)), z = Math.max(z0, Math.min(z1, q.z));
        if (x === q.x && z === q.z) return; // (in it)
        const w = { x: 0, z: 0 }; this.outFr(fr, { x, z }, w); take(w.x, w.z);
      }
    }
    if (best) { p.x = best[0]; p.z = best[1]; }
  }
  // the ground's height under p (this frame's y): a box's floor in it (its door too: the floor runs out under it), else
  // the lane's, from the garage line. Your box's floor is y = 0 here; along a pit lane that climbs or drops, the
  // others aren't (standing at 0 everywhere, you sank into the lane as it rose)
  groundY(p) {
    for (const fr of this.rooms) {
      const q = this.inFr(fr, p);
      if (q.z > 0 && q.z < BOX.depth && Math.abs(q.x) < (q.z > BOX.frontT ? fr.wx : fr.dw)) return v3(fr.F.P(q.x, q.z, BOX.floor)).applyMatrix4(this.M).y;
    }
    let y = 0, dmin = Infinity;
    for (let j = 0; j < this.line.length - 1; j++) {
      const a = this.line[j], b = this.line[j + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2)), d = Math.hypot(p.x - a.x - ex * u, p.z - a.z - ez * u);
      if (d < dmin) { dmin = d; y = a.y + (b.y - a.y) * u + 0.004; } // (the lane's tarmac: js/world.js buildPitLane, a hair over the line)
    }
    return y;
  }
  push(p, r, dt = 1 / 60) {
    this.refreshCrew(dt);
    for (let k = 0; k < 3; k++) { this.clear(p, r); this.contain(p, r); } // (in a tight spot the two can disagree: a few rounds settles it)
  }
}
