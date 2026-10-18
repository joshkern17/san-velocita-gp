// Your people at home (World Career): the staff you've hired and your teammate, about the garage doing what their job
// is. The chief mechanic at the cars' wheels, at the bench, on the lift or the dyno when there's engine work, at the
// welding table for chassis and aero; the data engineer at the data room's desks (or the dyno's), at the whiteboard,
// with the car; the manager on their feet, talking to everyone; your teammate on the sim, at the car, talking. They
// walk there round what's in the way, up and down the mezzanine's stairs, and stop to talk in twos and threes.
//
//   const crew = new HomeCrew(pg, kit, people, busy)   // people: [{ key, role, look, livery, face, crew }], busy: ['dyno', ...]
//   crew.update(dt); crew.setBusy(busy); crew.dispose();
//   crew.people                                         // [{ x, y, z }] (where they are: js/garagewalk.js walks round them)
//
// Where they go is the room's: STAND_<role> empties in the shell and the stations (userData.clip, what they do there;
// they face the empty's -Y), round the cars' wheels, and somewhere clear to talk. The floor is the room's NAV_ meshes,
// in cells, less what stands on it (as the walker sees it, js/garagewalk.js), one grid per floor.
import * as THREE from 'three';
import { makeCharacter, loadCharacters, hasClip } from './characters.js';

const CELL = 0.25, SPEED = 1.3, PAD = 0.26;
const TALK = ['talk', 'talk_2', 'talk_3', 'talk_4'], LISTEN = ['nod', 'idle', 'nod_think', 'idle_look', 'nod_long', 'nod_sarcastic'];
// which spots each job goes to (the spot's role), and how keen (busy stations count four times over)
const GOES = {
  mechanic: { mechanic: 3, any: 1, fab: 2, dyno: 1, lift: 2, wheel: 4, driver: 0 },
  engineer: { data: 4, dyno: 2, any: 1, wheel: 1, manager: 0 },
  manager: { manager: 3, any: 1.5, visitor: 1, wheel: 0.5 },
  driver: { driver: 3, any: 1.5, wheel: 1 },
};
const NO_KNEEL = new Set(['manager']);           // (the manager doesn't get down on the floor)
const SEATED = new Set(['sit_desk', 'sit_idle', 'sit', 'type', 'write', 'sit_talk']);
// what they do at a spot, by the spot's clip: one of these at a time, a new one every so often (the first's first)
const AT = {
  sit_desk: ['type', 'sit_desk', 'write', 'type', 'sit_talk'], kneel: ['kneel', 'kneel_inspect', 'kneel'], kneel_point: ['kneel_point', 'kneel_inspect'],
  idle_look: ['idle_look', 'point_fwd', 'nod_think'], point: ['point', 'point_fwd', 'nod_think'], lean: ['lean', 'text', 'lean'],
};
// on their own with a minute (or at a spot for talking with nobody there), by job
const SPARE = { manager: ['phone', 'text', 'phone'], engineer: ['text', 'drink', 'idle_look'], mechanic: ['drink', 'idle_neck', 'bored'], driver: ['text', 'drink', 'bored', 'idle_neck'] };
// where the desk clips put the hips, against sit_desk's (what the chairs are placed for): [up, back]
const SEAT = { sit_desk: [0.06, 0], type: [0.05, 0], sit_talk: [0.06, 0], write: [-0.01, 0.15] };
const HANDS_FULL = /^(kneel|talk|sit_talk|type|write|phone|text|drink|pick_up)/;

function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _ray = new THREE.Raycaster(), _down = new THREE.Vector3(0, -1, 0);

export class HomeCrew {
  constructor(pg, kit, list, busy = []) {
    this.pg = pg; this.kit = kit; this.busy = new Set(busy); this.r = rng(list.length * 31 + 7);
    this.root = new THREE.Group(); this.root.name = 'HomeCrew'; pg.scene.add(this.root);
    this.people = []; this.groups = []; this.alive = true; this.key = list.map(p => p.key).join('|');
    this.list = list; this.ready = false;
    loadCharacters().then(ok => { if (ok && this.alive) this.make(); });
  }
  dispose() {
    this.alive = false;
    for (const p of this.people) p.ch.dispose();
    this.people = []; this.root.removeFromParent();
  }
  setBusy(busy) {
    const b = new Set(busy); if ([...b].join() === [...this.busy].join()) return;
    this.busy = b; this.floors = null; // (what's on the floor's changed: an engine on the dyno; the grids again)
    for (const p of this.people) if (!p.group && !p.seated) p.t = Math.min(p.t, 1 + this.r() * 4); // (and a rethink)
  }

  // ---------- the room: its floors, what's in the way, the spots ----------
  survey() {
    const pg = this.pg, kit = this.kit; pg.room.updateMatrixWorld(true);
    // the floors: each NAV_ mesh flat ones a level, the sloped one the stairs (its low and high ends)
    const navs = kit.nav.map(n => ({ n, b: new THREE.Box3().setFromObject(n) }));
    this.navMeshes = kit.nav;
    const flat = navs.filter(x => x.b.max.y - x.b.min.y < 0.3), slope = navs.filter(x => x.b.max.y - x.b.min.y >= 0.3);
    const ys = [...new Set(flat.map(x => Math.round(x.b.min.y * 10) / 10))].sort((a, b) => a - b);
    this.stairs = slope.map(({ n, b }) => {
      const pos = n.geometry.attributes.position, lo = new THREE.Vector3(), hi = new THREE.Vector3(); let nl = 0, nh = 0;
      for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld); if (_v.y < b.min.y + 0.1) { lo.add(_v); nl++; } else if (_v.y > b.max.y - 0.1) { hi.add(_v); nh++; } }
      lo.multiplyScalar(1 / Math.max(1, nl)); hi.multiplyScalar(1 / Math.max(1, nh));
      const d = new THREE.Vector3().subVectors(hi, lo).setY(0).normalize();
      return { lo: lo.clone().addScaledVector(d, -0.45), hi: hi.clone().addScaledVector(d, 0.45), loL: this.levelOf(lo.y, ys), hiL: this.levelOf(hi.y, ys) };
    });
    this.ys = ys;
    // what's in the way: the walker's own boxes (what stands on the floor, the cars), by floor
    const boxes = [], shown = (o) => { for (let x = o; x && x !== pg.room; x = x.parent) if (!x.visible) return false; return true; };
    pg.room.traverse(o => {
      if (!o.isMesh || (!shown(o) && !/^COL_/.test(o.name))) return;
      const nm = o.name || '', pn = (o.parent && o.parent.name) || '';
      if (/^(NAV|WALK)_/.test(nm) || /^(NAV|WALK)_/.test(pn)) return;
      const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return;
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z; if (w * d > 8 && w > 0.3 && d > 0.3) return;
      boxes.push(b);
    });
    this.carBoxes = [];
    for (const c of [pg.car, pg.car2]) if (c && c.group.parent && c.group.visible) {
      const b = new THREE.Box3(); c.group.updateMatrixWorld(true);
      c.group.traverse(o => { if (o.isMesh && o !== c.shadow && !(c.shadow && c.shadow.children.includes(o))) b.expandByObject(o); });
      // (and where its wheels really are, along it: an open-wheeler's wings stretch its box well past them)
      if (c.wheels && c.wheels.length) b.wheelZ = c.wheels.map(w => (w.pivot || w.mesh).getWorldPosition(_v).z);
      if (!b.isEmpty()) { boxes.push(b); this.carBoxes.push(b); }
    }
    this.floors = ys.map(y => {
      const areas = flat.filter(x => Math.abs(x.b.min.y - y) < 0.15).map(x => x.b);
      const B = areas.reduce((A, b) => A.union(b), new THREE.Box3());
      const x0 = B.min.x, z0 = B.min.z, nx = Math.ceil((B.max.x - x0) / CELL), nz = Math.ceil((B.max.z - z0) / CELL);
      const g = new Uint8Array(nx * nz), mine = boxes.filter(b => b.max.y >= y + 0.15 && b.min.y <= y + 1.7);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
        let bad = !areas.some(a => x > a.min.x + 0.15 && x < a.max.x - 0.15 && z > a.min.z + 0.15 && z < a.max.z - 0.15);
        if (!bad) for (const b of mine) if (x > b.min.x - PAD && x < b.max.x + PAD && z > b.min.z - PAD && z < b.max.z + PAD) { bad = true; break; }
        g[i * nz + j] = bad ? 1 : 0;
      }
      return { y, x0, z0, nx, nz, g };
    });
    // the spots: the room's STAND_s (on whichever floor), and round each car's wheels
    this.spots = [];
    for (const s of kit.stands) {
      s.getWorldPosition(_v); s.getWorldQuaternion(_q);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(_q); // (Blender's -Y: the way they face)
      let st = null; for (let o = s; o && o !== pg.room; o = o.parent) { const m = /^station_([a-z0-9]+)/.exec(o.name || ''); if (m) { st = m[1]; break; } }
      if (!shown(s)) continue;
      // (down on one knee only at something: a wheel, an engine, a box. Nothing a hand's reach in front at knee height
      // (no car in the bay yet, the lift empty), no kneeling there)
      if (/^kneel/.test(s.userData.clip || '')) {
        const ax = _v.x + f.x * 0.55, az = _v.z + f.z * 0.55, ay = _v.y + 0.35;
        if (!boxes.some(b => ax > b.min.x - 0.15 && ax < b.max.x + 0.15 && az > b.min.z - 0.15 && az < b.max.z + 0.15 && ay > b.min.y && ay < b.max.y + 0.2)) continue;
      }
      this.spots.push({ x: _v.x, z: _v.z, y: _v.y, L: this.levelOf(_v.y, ys), yaw: Math.atan2(f.x, f.z), clip: s.userData.clip || 'idle', role: s.userData.role || 'any', st, who: null,
        busyOnly: /dynobed/.test(s.name) });
    }
    if (kit.tires) { // (sorting the tire stacks: down beside them)
      kit.tires.getWorldPosition(_v); kit.tires.getWorldQuaternion(_q); const f = new THREE.Vector3(-1, 0, 0).applyQuaternion(_q).setY(0).normalize(); // (the stacks run along the wall: from the room side)
      this.spots.push({ x: _v.x + f.x * 0.75, z: _v.z + f.z * 0.75, y: _v.y, L: this.levelOf(_v.y, ys), yaw: Math.atan2(-f.x, -f.z), clip: 'kneel', role: 'mechanic', st: null, who: null });
    }
    for (const b of this.carBoxes) {
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2;
      for (const [sx, sz] of [[-1, -0.62], [1, -0.62], [-1, 0.62], [1, 0.62]]) {
        const want = cz + sz * hz, z = b.wheelZ ? b.wheelZ.reduce((m, q) => Math.abs(q - want) < Math.abs(m - want) ? q : m) : want;   // (at a wheel)
        const x = cx + sx * (hx + 0.32);
        this.spots.push({ x, z, y: 0, L: 0, yaw: Math.atan2(-sx, 0), clip: 'kneel', role: 'wheel', st: null, who: null });
      }
      this.spots.push({ x: cx + hx + 0.6, z: cz + hz * 0.1, y: 0, L: 0, yaw: Math.atan2(-1, 0), clip: 'idle_look', role: 'wheel', st: null, who: null });
    }
  }
  levelOf(y, ys = this.ys) { let k = 0; for (let i = 0; i < ys.length; i++) if (Math.abs(ys[i] - y) < Math.abs(ys[k] - y)) k = i; return k; }
  cellOf(F, x, z) { return [Math.max(0, Math.min(F.nx - 1, Math.floor((x - F.x0) / CELL))), Math.max(0, Math.min(F.nz - 1, Math.floor((z - F.z0) / CELL)))]; }
  free(F, x, z) { const [i, j] = this.cellOf(F, x, z); return !F.g[i * F.nz + j]; }
  near(F, i, j) {
    for (let r = 0; r < 10; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= F.nx || jj >= F.nz) continue;
      if (!F.g[ii * F.nz + jj]) return ii * F.nz + jj;
    }
    return -1;
  }
  sees(F, a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.5));
    for (let q = 1; q < n; q++) { const f = q / n; if (!this.free(F, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)) return false; }
    return true;
  }
  // a to b on one floor, round what's in the way (A*, straightened): [[x, z], ...] ending at b
  pathOn(L, a, b) {
    const F = this.floors[L]; if (!F) return [b];
    const nz = F.nz, N = F.nx * nz, G = F.g;
    const s = this.near(F, ...this.cellOf(F, a[0], a[1])), t = this.near(F, ...this.cellOf(F, b[0], b[1]));
    if (s < 0 || t < 0) return [b];
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N), open = [s]; g[s] = 0;
    const h = (k) => Math.hypot(Math.floor(k / nz) - Math.floor(t / nz), (k % nz) - (t % nz));
    for (let it = 0; open.length && it < 9000; it++) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (g[open[q]] + h(open[q]) < g[open[bi]] + h(open[bi])) bi = q;
      const k = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (k === t) break; if (done[k]) continue; done[k] = 1;
      const i = Math.floor(k / nz), j = k % nz;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= F.nx || jj >= nz) continue;
        const kk = ii * nz + jj; if (G[kk] || done[kk]) continue;
        if (di && dj && (G[ii * nz + j] || G[i * nz + jj])) continue;
        const c = g[k] + (di && dj ? 1.414 : 1); if (c < g[kk]) { g[kk] = c; from[kk] = k; open.push(kk); }
      }
    }
    if (from[t] < 0 && s !== t) return [b];
    const cells = []; for (let k = t; k >= 0 && k !== s; k = from[k]) cells.push(k); cells.reverse();
    const pts = cells.map(k => [F.x0 + (Math.floor(k / nz) + 0.5) * CELL, F.z0 + (k % nz + 0.5) * CELL]);
    const out = []; let cur = a;
    for (let q = 0; q < pts.length;) {
      let far = q; for (let w = pts.length - 1; w > q; w--) if (this.sees(F, cur, pts[w])) { far = w; break; }
      out.push(pts[far]); cur = pts[far]; q = far + 1;
    }
    out.push(b); return out;
  }
  // a (on floor La) to b (on Lb): up or down the stairs on the way
  path(La, a, Lb, b) {
    if (La === Lb) return this.pathOn(La, a, b);
    const s = this.stairs.find(x => (x.loL === La && x.hiL === Lb) || (x.hiL === La && x.loL === Lb)); if (!s) return null;
    const [p, q] = s.loL === La ? [s.lo, s.hi] : [s.hi, s.lo];
    return [...this.pathOn(La, a, [p.x, p.z]), [q.x, q.z], ...this.pathOn(Lb, [q.x, q.z], b)];
  }
  floorAt(x, y, z) {
    _ray.set(_v.set(x, y + 1.0, z), _down); _ray.far = 3.5;
    const h = _ray.intersectObjects(this.navMeshes, false)[0]; return h ? h.point.y : y;
  }

  // ---------- the people ----------
  make() {
    const r = this.r;
    this.list.forEach((d, k) => {
      const ch = makeCharacter({ look: d.look || 'coveralls_navy', clip: 'idle', livery: d.livery || null, crew: !!d.crew, face: d.face ?? null, helmet: false, seed: k * 53 + 11 });
      this.root.add(ch.object);
      const p = { d, ch, role: d.role, x: 0, y: 0, z: 0, yaw: 0, t: 0, path: [], act: null, L: 0, spot: null, group: null };
      if (d.role === 'mechanic') p.prop = this.prop(ch, 'wrench'); else if (d.role === 'engineer' || d.role === 'manager') p.prop = this.prop(ch, 'clipboard');
      p.phone = this.prop(ch, 'phone'); p.cup = this.prop(ch, 'cup', 'LeftHand');
      this.people.push(p);
    });
    this.ready = true;
  }
  // something in their hand: a wrench, a clipboard (put away when they sit), a phone, a coffee
  prop(ch, kind, side = 'RightHand') {
    const hand = ch.bone && ch.bone(side); if (!hand) return null;
    const g = new THREE.Group();
    if (kind === 'phone') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.014), new THREE.MeshLambertMaterial({ color: 0x1c1d20 }));
      const lit = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.11, 0.016), new THREE.MeshBasicMaterial({ color: 0x8fb4d8 })); // (its screen, on)
      g.add(m, lit); g.position.set(0.0, 0.08, 0.035); g.rotation.set(0, 0, Math.PI / 2); g.visible = false;
    } else if (kind === 'cup') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }));
      g.add(m); g.position.set(0.0, 0.08, 0.04); g.rotation.set(0, 0, Math.PI / 2); g.visible = false;
    } else if (kind === 'wrench') {
      const m = new THREE.MeshLambertMaterial({ color: 0x9da2a8 });
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.008), m); shaft.position.y = 0.08;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.01), m); head.position.y = 0.2; g.add(shaft, head);
    } else {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.31, 0.01), new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.002), new THREE.MeshLambertMaterial({ color: 0xe9e6dc })); paper.position.set(0, -0.01, 0.007);
      g.add(board, paper); g.rotation.set(0.3, 0, 1.4); g.position.set(0.02, 0.1, 0.05);
    }
    ch.object.updateMatrixWorld(true); const s = new THREE.Vector3(); hand.getWorldScale(s); g.scale.multiplyScalar(1 / (s.x || 1));
    if (kind === 'phone' || kind === 'cup') g.position.multiplyScalar(1 / (s.x || 1)); // (in the hand's own units: in metres)
    hand.add(g); return g;
  }
  // how keen p is on spot s
  want(p, s) {
    if (s.who) return 0;
    if (s.busyOnly && !this.busy.has(s.st)) return 0;
    if (NO_KNEEL.has(p.role) && /^kneel/.test(s.clip)) return 0;
    const role = s.st === 'tools2' ? 'lift' : s.role, w = (GOES[p.role] || GOES.driver)[role] ?? (role === p.role ? 3 : 0);
    if (!w) return 0;
    if (p.role === 'driver' && s.st && s.st !== 'sim' && /^kneel/.test(s.clip)) return 0; // (your teammate isn't the one on the floor at the dyno)
    if (s.st && this.busy.has(s.st)) return p.role === 'mechanic' || p.role === 'engineer' ? w * 4 : w;
    if (s.st && /^(dyno|fab)$/.test(s.st)) return w * 0.25; // (an idle dyno or bench: a look in now and then)
    return w;
  }
  release(p) {
    if (p.spot) { p.spot.who = null; p.spot = null; }
    if (p.group) { const g = p.group; g.who = g.who.filter(q => q !== p); p.group = null; if (g.who.length < 2) this.endGroup(g); }
  }
  endGroup(g) { this.groups = this.groups.filter(x => x !== g); for (const q of g.who) { q.group = null; q.t = Math.min(q.t, 0.5 + this.r() * 3); } }
  choose(p, now = false) {
    const r = this.r; this.release(p);
    if (r() < (p.role === 'manager' ? 0.5 : p.role === 'driver' ? 0.35 : 0.2) && this.talk(p, now)) return;
    const ws = this.spots.map(s => this.want(p, s)), tot = ws.reduce((a, b) => a + b, 0);
    if (tot > 0) { let x = r() * tot; for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return this.task(p, this.spots[i], now); } }
    this.talk(p, now) || this.wait(p);
  }
  go(p, L, x, z, yaw, clip, secs, now) {
    p.act = { L, x, z, yaw, clip }; p.t = secs; p.cur = null; p.intro = 0;
    p.texting = !now && p.role !== 'mechanic' && this.r() < 0.2 && hasClip('walk_text'); // (head down in the phone on the way)
    if (now) { p.x = x; p.z = z; p.L = L; p.y = this.floors[L] ? this.floors[L].y : 0; p.yaw = yaw; p.path = []; return; }
    p.path = this.path(p.L, [p.x, p.z], L, [x, z]) || [[x, z]];
  }
  task(p, s, now) {
    s.who = p; p.spot = s;
    const sit = SEATED.has(s.clip), secs = sit ? 40 + this.r() * 70 : 10 + this.r() * 22;
    this.go(p, s.L, s.x, s.z, s.yaw, hasClip(s.clip) ? s.clip : 'idle_look', secs, now);
    // (a mechanic getting to a bench, the lift, a car's side: picks something up off the floor first, now and then)
    if (!now && p.role === 'mechanic' && !sit && !/^(kneel|talk|lean)/.test(s.clip) && this.r() < 0.35 && hasClip('pick_up')) p.intro = p.ch.clipDuration('pick_up') / 1.4;
  }
  wait(p) {
    p.act = p.act || { L: p.L, x: p.x, z: p.z, yaw: p.yaw, clip: 'idle' };
    p.act.clip = pick(this.r, SPARE[p.role] || SPARE.driver); p.t = 6 + this.r() * 8; p.path = []; p.cur = null;
  }
  // what p's doing where they've got to: the spot's clip, or one of its others (every so often a new one), after
  // picking something up if that's first. Talking with nobody there: something of their own
  doing(p, a, dt) {
    if (p.intro > 0) { p.intro -= dt; return 'pick_up'; }
    const alts = (AT[a.clip] || [a.clip]).filter(c => hasClip(c));
    if (!p.cur || (p.vt -= dt) <= 0) { p.cur = !p.cur ? alts[0] || a.clip : pick(this.r, alts); p.vt = 7 + this.r() * 12; }
    if (/^(talk|sit_talk)/.test(p.cur) && !this.people.some(q => q !== p && Math.abs(q.y - p.y) < 1 && Math.hypot(q.x - p.x, q.z - p.z) < 1.8))
      return p.cur === 'sit_talk' ? alts[0] : (SPARE[p.role] || SPARE.driver)[this.people.indexOf(p) % 3];
    return p.cur;
  }
  // a conversation: one that's going, else a new one with someone on the same floor who's free, somewhere clear
  talk(p, now) {
    const r = this.r, open = this.groups.filter(g => g.who.length < 3 && g.L === p.L && g.t > 6);
    if (open.length && r() < 0.6) { this.join(p, pick(r, open), now); return true; }
    const others = this.people.filter(q => q !== p && !q.group && q.L === p.L && !(q.spot && SEATED.has(q.spot.clip) && q.t > 15) && (q.t < 8 || r() < 0.3));
    if (!others.length) return false;
    const mate = pick(r, others), F = this.floors[p.L]; if (!F) return false;
    let c = null;
    for (let tries = 0; tries < 30 && !c; tries++) {
      const x = (p.x + mate.x) / 2 + (r() - 0.5) * 3, z = (p.z + mate.z) / 2 + (r() - 0.5) * 3;
      if (this.clear(F, x, z, 0.8)) c = [x, z];
    }
    if (!c) return false;
    const g = { L: p.L, x: c[0], z: c[1], who: [], t: 12 + r() * 22, speaker: 0, st: 2 + r() * 3, a0: r() * Math.PI * 2 };
    this.groups.push(g); this.join(p, g, now); this.release(mate); this.join(mate, g, now);
    return true;
  }
  clear(F, x, z, rad) {
    if (!this.free(F, x, z)) return false;
    for (let a = 0; a < 8; a++) if (!this.free(F, x + Math.cos(a * Math.PI / 4) * rad, z + Math.sin(a * Math.PI / 4) * rad)) return false;
    for (const g of this.groups) if (Math.hypot(g.x - x, g.z - z) < 2.2) return false;
    return true;
  }
  join(p, g, now) {
    this.release(p); g.who.push(p); p.group = g;
    const n = g.who.length, rad = n <= 2 ? 0.55 : 0.68;
    g.who.forEach((q, i) => {
      const a = g.a0 + i / n * Math.PI * 2, x = g.x + Math.cos(a) * rad, z = g.z + Math.sin(a) * rad;
      this.go(q, g.L, x, z, Math.atan2(g.x - x, g.z - z), 'idle', 1e9, now); q.t = 1e9;
    });
  }

  update(dt) {
    if (!this.ready || !this.people.length) return;
    if (!this.floors) { this.survey(); for (const s of this.spots) s.who = null; for (const p of this.people) { p.spot = null; } if (!this.placed) { this.placed = true; for (const p of this.people) this.choose(p, true); } else for (const p of this.people) if (!p.group) p.t = Math.min(p.t, 0.5); }
    const r = this.r;
    for (const g of [...this.groups]) {
      g.t -= dt; g.st -= dt;
      if (g.st <= 0) { g.speaker = (g.speaker + 1) % Math.max(1, g.who.length); g.st = 2.5 + r() * 4.5; }
      if (g.t <= 0) this.endGroup(g);
    }
    for (const p of this.people) {
      if (!p.group) { p.t -= dt; if (p.t <= 0) this.choose(p); }
      const a = p.act; if (!a) continue;
      let clip = a.clip, moving = false;
      if (p.path.length) {
        // (along the path, round each corner without stopping: a stop of even a frame starts the blend into whatever
        // they're going to do there, a kneel, and they dip and snap back up)
        let step = (p.texting ? 0.87 : SPEED) * dt, hx = 0, hz = 0;
        while (p.path.length && step > 1e-6) {
          const [tx, tz] = p.path[0], dx = tx - p.x, dz = tz - p.z, dd = Math.hypot(dx, dz);
          if (dd > 1e-4) { hx = dx; hz = dz; }
          if (dd <= step) { p.x = tx; p.z = tz; step -= dd; p.path.shift(); } else { p.x += dx / dd * step; p.z += dz / dd * step; step = 0; }
        }
        if (hx || hz) p.yaw += wrap(Math.atan2(hx, hz) - p.yaw) * Math.min(1, dt * 8);
        moving = true;
        if (!p.path.length) p.L = a.L;
      } else {
        // there: turned to face it first (on the spot), then what they came to do
        const d = wrap(a.yaw - p.yaw); p.yaw += d * Math.min(1, dt * 6);
        if (Math.abs(d) > 0.4 && !p.group) clip = 'idle';
        else if (!p.group) clip = this.doing(p, a, dt);
      }
      if (!moving && p.group) { const g = p.group, i = this.people.indexOf(p) + Math.floor(g.t / 7); clip = g.who[g.speaker] === p ? TALK[i % TALK.length] : LISTEN[i % LISTEN.length]; if (!hasClip(clip)) clip = 'idle'; }
      const gy = this.floorAt(p.x, p.y, p.z); p.y += (gy - p.y) * Math.min(1, dt * 12);
      const seated = !moving && SEATED.has(clip); p.seated = seated;
      const walkText = moving && p.texting, shows = walkText ? 'walk_text' : moving ? 'walk' : clip;
      if (p.prop) p.prop.visible = !seated && !HANDS_FULL.test(shows);
      if (p.phone) p.phone.visible = /^(phone|text|walk_text)$/.test(shows);
      if (p.cup) p.cup.visible = shows === 'drink';
      if (walkText) p.ch.play('walk_text', { fade: 0.3 }); else if (moving) p.ch.move(SPEED, { fade: 0.3 }); else p.ch.play(clip, { fade: 0.35, speed: clip === 'pick_up' ? 1.4 : 1 });
      const [up, back] = (seated && SEAT[clip]) || [0, 0];
      p.ch.object.position.set(p.x - Math.sin(p.yaw) * back, p.y + up, p.z - Math.cos(p.yaw) * back); p.ch.object.rotation.y = p.yaw;
      p.ch.update(dt);
    }
  }
}
