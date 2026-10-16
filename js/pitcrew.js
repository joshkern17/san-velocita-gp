// A team's people in its box in practice and qualifying, when the boxes are from your model (js/pitbox.js): the
// engineers sat at the computers, the rest in twos and threes talking, or off doing something (at the car's wheels,
// in the tool chests, at the tire stacks, looking up at the timing screen), getting up, walking round what's in the
// way, starting a new conversation. With the car out on a run most of them are in the door watching the lane.
// Each box rolls its own dice (seeded by the box), so no two are doing the same thing.
//
//   new BoxCrew(life, b, tpl)    // b: js/pitlife.js's box (its crew, its driver), tpl: the model
//   crew.update(dt, { out, vis, step, floorY })
//
// Everything here is in the box's own frame (F.P(x, z, y): x along its front, z in from the door), metres.
import * as THREE from 'three';
import { BOX } from './pitboxes.js';

const CELL = 0.25, SPEED = 1.35, LANE = -2.2;
const TALK = ['talk', 'talk_2', 'talk_3'], LISTEN = ['idle', 'idle_look', 'idle'];
// what each kind of spot has you doing there: [clip, turned away from it (leaning back on it)]
const AT = { tires: [['kneel', 0], ['idle_look', 0]], chest: [['idle_look', 0], ['kneel', 0], ['idle', 0]], bench: [['lean', 1], ['idle_look', 0]],
  shelf: [['idle_look', 0], ['idle_stretch', 0]], screen: [['idle_look', 0], ['point', 0]], wheel: [['kneel', 0], ['kneel_point', 0]], car: [['point', 0], ['idle_look', 0], ['idle', 0]] };

function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const lerpYaw = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)); if (d < 0) d += Math.PI * 2; return a + (d - Math.PI) * t; };

export class BoxCrew {
  constructor(life, b, tpl) {
    this.life = life; this.b = b; this.F = b.F; this.r = rng(b.k * 7919 + 13);
    const F = this.F, wx = F.wx, d = BOX.depth;
    this.car = tpl.car(F);
    this.seats = tpl.seats(F).filter(s => !(b.mine && s.player)).map(s => ({ ...s, who: null })); // (yours is yours)
    this.spots = tpl.spots(F).map(s => ({ ...s, who: null }));
    // round the car: its four wheels and a corner either side of its nose (taken when it's in)
    const cx = this.car.x, cz = this.car.z;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.spots.push({ x: cx + sx * 1.35, z: cz + sz * 1.45, face: [-sx, 0], kind: 'wheel', car: true, who: null });
    for (const sx of [-1, 1]) this.spots.push({ x: cx + sx * 1.6, z: cz - 2.7, face: [-sx * 0.6, 1], kind: 'car', car: true, who: null });
    // the floor, in cells: what's in the way (the walls, what stands on the floor; the car when it's in)
    this.nx = Math.ceil(2 * (wx + 0.5) / CELL); this.nz = Math.ceil((d - LANE) / CELL);
    const base = new Uint8Array(this.nx * this.nz);
    const foot = tpl.footprints(F);
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) {
      const x = this.cx(i), z = this.cz(j);
      let bad = Math.abs(x) > wx - 0.3 || z > d - 0.3;
      if (z < BOX.frontT + 0.3 && Math.abs(x) > F.dw - 0.35) bad = true; // (the front wall: the door's the only way out)
      if (!bad) for (const r of foot) if (x > r[0] - 0.28 && x < r[1] + 0.28 && z > r[2] - 0.28 && z < r[3] + 0.28) { bad = true; break; }
      base[i * this.nz + j] = bad ? 1 : 0;
    }
    this.gridOut = base; this.gridIn = base.slice();
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) {
      const x = this.cx(i), z = this.cz(j);
      if (Math.abs(x - cx) < 1.25 && Math.abs(z - cz) < 2.75) this.gridIn[i * this.nz + j] = 1;
    }
    this.people = []; this.groups = []; this.out = null;
  }
  cx(i) { return -this.F.wx - 0.5 + (i + 0.5) * CELL; }
  cz(j) { return LANE + (j + 0.5) * CELL; }
  ci(x) { return Math.max(0, Math.min(this.nx - 1, Math.floor((x + this.F.wx + 0.5) / CELL))); }
  cj(z) { return Math.max(0, Math.min(this.nz - 1, Math.floor((z - LANE) / CELL))); }
  get grid() { return this.out ? this.gridOut : this.gridIn; }
  free(x, z) { return !this.grid[this.ci(x) * this.nz + this.cj(z)]; }

  // the way from a to b round what's in the way (A* on the cells, then straightened): [[x, z], ...] ending at b
  path(a, b) {
    const G = this.grid, nz = this.nz, nx = this.nx, N = nx * nz;
    const s = this.near(this.ci(a[0]), this.cj(a[1])), t = this.near(this.ci(b[0]), this.cj(b[1]));
    if (s < 0 || t < 0) return [b];
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const open = [s]; g[s] = 0;
    const h = (k) => Math.hypot(Math.floor(k / nz) - Math.floor(t / nz), (k % nz) - (t % nz));
    let it = 0;
    while (open.length && it++ < 6000) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (g[open[q]] + h(open[q]) < g[open[bi]] + h(open[bi])) bi = q;
      const k = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (k === t) break; if (done[k]) continue; done[k] = 1;
      const i = Math.floor(k / nz), j = k % nz;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const kk = ii * nz + jj; if (G[kk] || done[kk]) continue;
        if (di && dj && (G[ii * nz + j] || G[i * nz + jj])) continue; // (no cutting a corner)
        const c = g[k] + (di && dj ? 1.414 : 1);
        if (c < g[kk]) { g[kk] = c; from[kk] = k; open.push(kk); }
      }
    }
    if (from[t] < 0 && s !== t) return [b];
    const cells = []; for (let k = t; k >= 0 && k !== s; k = from[k]) cells.push(k); cells.reverse();
    // (straightened: from each point, on to the furthest one it can see)
    const pts = cells.map(k => [this.cx(Math.floor(k / nz)), this.cz(k % nz)]);
    const out = []; let cur = a;
    for (let q = 0; q < pts.length;) {
      let far = q; for (let w = pts.length - 1; w > q; w--) if (this.sees(cur, pts[w])) { far = w; break; }
      out.push(pts[far]); cur = pts[far]; q = far + 1;
    }
    out.push(b); return out;
  }
  near(i, j) { // (the free cell nearest i, j)
    for (let r = 0; r < 8; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
      if (!this.grid[ii * this.nz + jj]) return ii * this.nz + jj;
    }
    return -1;
  }
  sees(a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.5));
    for (let q = 1; q < n; q++) { const f = q / n; if (!this.free(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)) return false; }
    return true;
  }

  // ---------- who does what ----------
  init() {
    const b = this.b, r = this.r;
    for (const m of b.crew) {
      this.people.push({ m, role: 'crew' });
      // (no wheel guns, lollipops or jacks about the garage: they're for the stops)
      const hand = m.ch.bone && m.ch.bone('RightHand');
      if (hand) for (const c of hand.children) if (!c.isBone) c.visible = false;
      if (m.jack) m.jack.visible = false;
    }
    if (b.driver) this.people.push({ m: b.dm ||= { ch: b.driver, x: 0, z: 0, yaw: 0, k: 0, kT: 0, role: 'DR' }, role: 'driver' });
    for (const p of this.people) { p.x = 0; p.z = 0; p.yaw = 0; p.t = 0; p.path = []; p.act = null; }
    // (how many sat at the computers: one to all of them, by the box)
    const n = Math.min(this.seats.length, 1 + Math.floor(r() * this.seats.length));
    const crew = this.people.filter(p => p.role === 'crew');
    for (let q = 0; q < n && q < crew.length; q++) crew[q].engineer = true;
    for (const p of this.people) this.choose(p, true);
  }
  release(p) {
    if (p.seat) { p.seat.who = null; p.seat = null; }
    if (p.spot) { p.spot.who = null; p.spot = null; }
    if (p.group) { const g = p.group; g.who = g.who.filter(q => q !== p); p.group = null; if (g.who.length < 2) this.endGroup(g); }
  }
  endGroup(g) {
    this.groups = this.groups.filter(x => x !== g);
    for (const q of g.who) { q.group = null; q.t = Math.min(q.t, 0.5 + this.r() * 3); }
  }
  // what next (now: put there, not walked)
  choose(p, now = false) {
    const r = this.r, out = this.out;
    this.release(p);
    // the car's out: most go and watch from the door
    if (out && p.role !== 'driver' && !(p.engineer && r() < 0.85) && r() < 0.75) return this.watch(p, now);
    if (p.engineer && r() < 0.8) { const s = this.seats.find(x => !x.who); if (s) return this.sit(p, s, now); }
    const w = r();
    if (w < (p.role === 'driver' ? 0.7 : 0.42)) { if (this.talk(p, now)) return; }
    const spots = this.spots.filter(s => !s.who && !(s.car && out));
    const want = spots.filter(s => s.car).length && w > 0.7 ? spots.filter(s => s.car) : spots;
    if (want.length) return this.task(p, pick(r, want), now);
    this.talk(p, now, true) || this.wait(p);
  }
  go(p, x, z, face, clip, secs, now, lift = 0) {
    p.act = { x, z, face, clip, lift }; p.t = secs;
    if (now) { p.x = x; p.z = z; p.yaw = Math.atan2(face[0], face[1]); p.path = []; }
    else p.path = this.path([p.x, p.z], [x, z]);
  }
  sit(p, s, now) {
    s.who = p; p.seat = s;
    this.go(p, s.x, s.z, s.face, 'sit_desk', 30 + this.r() * 70, now, 0.06);
  }
  task(p, s, now) {
    s.who = p; p.spot = s; const [clip, away] = pick(this.r, AT[s.kind] || AT.car);
    this.go(p, s.x, s.z, away ? [-s.face[0], -s.face[1]] : s.face, clip, 8 + this.r() * 18, now);
  }
  watch(p, now) {
    const dw = this.F.dw - 0.8, x = (this.r() * 2 - 1) * dw, z = -0.6 + this.r() * 1.8;
    this.go(p, x, z, [(this.r() - 0.5) * 0.6, -1], pick(this.r, ['idle_look', 'idle', 'idle_look', 'point']), 10 + this.r() * 20, now);
  }
  wait(p) { p.act = p.act || { x: p.x, z: p.z, face: [0, -1], clip: 'idle', lift: 0 }; p.act.clip = 'idle'; p.t = 3 + this.r() * 4; p.path = []; }
  // into a conversation: one that's going (with room), else a new one somewhere clear with someone else who's free
  talk(p, now, any = false) {
    const r = this.r;
    const g0 = this.groups.filter(g => g.who.length < 4 && g.t > 6);
    if (g0.length && (r() < 0.6 || any)) { this.join(p, pick(r, g0), now); return true; }
    const others = this.people.filter(q => q !== p && !q.group && !q.seat && (q.t < 6 || q.spot));
    const seated = this.people.filter(q => q.seat && q.t < 20);
    const mate = others.length ? pick(r, others) : (p.role === 'driver' && seated.length ? pick(r, seated) : null); // (the driver gets an engineer up)
    if (!mate) return false;
    // somewhere clear for it: near whichever of them, in the open
    let c = null;
    for (let tries = 0; tries < 30 && !c; tries++) {
      const base = tries < 15 ? mate : p, x = base.x + (r() - 0.5) * 4, z = Math.max(0.2, base.z + (r() - 0.5) * 4);
      if (this.clear(x, z, 0.95)) c = [x, z];
    }
    if (!c) return false;
    const g = { x: c[0], z: c[1], who: [], t: 14 + r() * 26, speaker: 0, st: 2 + r() * 3, a0: r() * Math.PI * 2 };
    this.groups.push(g);
    this.join(p, g, now); this.release(mate); this.join(mate, g, now);
    return true;
  }
  clear(x, z, rad) {
    for (let a = 0; a < 8; a++) if (!this.free(x + Math.cos(a * Math.PI / 4) * rad, z + Math.sin(a * Math.PI / 4) * rad)) return false;
    if (!this.free(x, z)) return false;
    for (const g of this.groups) if (Math.hypot(g.x - x, g.z - z) < 2.4) return false;
    for (const s of this.seats) if (Math.hypot(s.x - x, s.z - z) < 1.3) return false;
    return true;
  }
  join(p, g, now) {
    this.release(p); g.who.push(p); p.group = g;
    this.place(g, now);
  }
  // (round the middle, evenly, facing in)
  place(g, now) {
    const n = g.who.length, rad = n <= 2 ? 0.55 : 0.7;
    g.who.forEach((q, i) => {
      const a = g.a0 + i / n * Math.PI * 2, x = g.x + Math.cos(a) * rad, z = g.z + Math.sin(a) * rad;
      const same = q.act && Math.hypot(q.act.x - x, q.act.z - z) < 0.05;
      if (!same) this.go(q, x, z, [g.x - x, g.z - z], 'idle', 1e9, now);
      q.t = 1e9;
    });
  }

  update(dt, { out, vis, step, floorY }) {
    if (!this.people.length) { this.out = out; this.init(); }
    const b = this.b, F = this.F, r = this.r;
    if (out !== this.out) { // (the car's gone out, or come back in: everyone not sat down has a rethink)
      this.out = out;
      for (const p of this.people) if (!p.seat && (out || !this.free(p.x, p.z) || r() < 0.6)) { p.t = r() * 2.5; }
    }
    if (b.driver) b.driver.object.visible = !out;
    // the conversations: whose turn it is, and when they break up
    for (const g of [...this.groups]) {
      g.t -= dt; g.st -= dt;
      if (g.st <= 0) { g.speaker = (g.speaker + 1 + Math.floor(r() * Math.max(1, g.who.length - 1))) % Math.max(1, g.who.length); g.st = 2.5 + r() * 4.5; }
      if (g.t <= 0) this.endGroup(g);
    }
    for (const p of this.people) {
      if (p.held) continue; // (pushing your car: js/pushcar.js has them)
      if (p.role === 'driver' && out) continue;
      if (!p.group) { p.t -= dt; if (p.t <= 0) this.choose(p, !vis); }
      const m = p.m, a = p.act; if (!a) continue;
      // (walking: along the path; there: turned the way the thing wants)
      let clip = a.clip, moving = false;
      if (!vis) { p.x = a.x; p.z = a.z; p.yaw = Math.atan2(a.face[0], a.face[1]); p.path = []; }
      else if (p.path.length) {
        const [tx, tz] = p.path[0], dx = tx - p.x, dz = tz - p.z, dd = Math.hypot(dx, dz);
        if (dd < 0.06) p.path.shift();
        else { const mv = Math.min(dd, SPEED * dt); p.x += dx / dd * mv; p.z += dz / dd * mv; p.yaw = lerpYaw(p.yaw, Math.atan2(dx, dz), Math.min(1, dt * 9)); moving = true; clip = 'walk'; }
      } else p.yaw = lerpYaw(p.yaw, Math.atan2(a.face[0], a.face[1]), Math.min(1, dt * 5));
      if (!moving && p.group) { const g = p.group; clip = g.who[g.speaker] === p ? TALK[(this.people.indexOf(p) + Math.floor(g.t / 7)) % 3] : LISTEN[this.people.indexOf(p) % 3]; }
      // (spoken to: the driver turns to you)
      if (m === b.dm && b.talkT > 0) {
        b.talkT -= dt; const L = this.toBox(b.talkAt); if (!moving) { p.yaw = lerpYaw(p.yaw, Math.atan2(L[0] - p.x, L[1] - p.z), Math.min(1, dt * 6)); clip = 'talk'; }
      }
      // into the world
      const P = F.P(p.x, p.z, 0), A = F.P(p.x + Math.sin(p.yaw), p.z + Math.cos(p.yaw), 0);
      m.x = P[0]; m.z = P[2]; m.yaw = Math.atan2(A[0] - P[0], A[2] - P[2]);
      m.ch.play(clip, { fade: 0.35 });
      m.ch.object.position.set(m.x, floorY + (moving ? 0 : a.lift || 0) - (p.z < BOX.frontT ? BOX.floor : 0), m.z); m.ch.object.rotation.y = m.yaw;
      if (vis && step) m.ch.update(step);
    }
  }
  // a point in the world -> this box's frame
  toBox(w) {
    const F = this.F, o = F.P(0, 0, 0), x1 = F.P(1, 0, 0), z1 = F.P(0, 1, 0);
    const tx = x1[0] - o[0], tz = x1[2] - o[2], nx = z1[0] - o[0], nz = z1[2] - o[2], dx = w.x - o[0], dz = w.z - o[2];
    const det = tx * nz - tz * nx;
    return [(dx * nz - dz * nx) / det, (tx * dz - tz * dx) / det];
  }
}
