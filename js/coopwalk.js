// Co-op World Career: the two of you about the same garage. Each copy sends where its walker is (where, which way,
// what it's doing) ten times a second over the fast link, and shows the other's: at home (the host's premises, on both
// copies) and in the pit lane at a race weekend (in the track's world, so whichever box either of you is in).
//
//   const msg = walkerState(pitGarage, walk, space)   // { t: 'wk', sp, ... } to send; sp null: not about (hidden)
//   const friend = new FriendWalker(pitGarage);  friend.setLook({ livery, face });
//   friend.space = space; friend.set(msg); friend.update(dt); friend.dispose();
//   friend.pos                                         // where they are (the room's frame), or null: walk round them
//
// space: which garage you're in ('home', or 'pit:<race id>'); the other's shown only when it's the same.
import * as THREE from 'three';
import { loadCharacters, makeCharacter, alignedClip, hasClip, CLIP_INFO } from './characters.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3();
const frameOf = (pg) => (pg.track ? pg.track.a : pg.scene);
// a heading (rad, about +Y) in o's frame <-> the world's
const yawTo = (h, m) => { _d.set(Math.sin(h), 0, Math.cos(h)).transformDirection(m); return Math.atan2(_d.x, _d.z); };

// what to send: your walker (on your feet, or sat at the computer), in the world's frame
export function walkerState(pg, walk, space) {
  const me = walk && walk.me, live = me && (walk.active || pg.parked);
  if (!space || !live || !pg.active) return { t: 'wk', sp: null };
  const o = me.object; o.updateMatrixWorld(true); o.getWorldPosition(_p);
  const F = frameOf(pg); F.updateMatrixWorld(true);
  const clip = /^move/.test(me.clip || '') ? 'move' : me.clip || 'idle';
  return { t: 'wk', sp: space, x: +_p.x.toFixed(3), y: +_p.y.toFixed(3), z: +_p.z.toFixed(3), h: +yawTo(o.rotation.y, F.matrixWorld).toFixed(3),
    c: clip, v: +(walk.speed || 0).toFixed(2), r: walk.nav && walk.nav.inBox && !walk.nav.inBox(walk.pos) ? 1 : 0, vis: o.visible || pg.parked ? 1 : 0 }; // (sat at the computer: you're hidden from your own camera, not theirs)
}

export class FriendWalker {
  constructor(pg) { this.pg = pg; this.ch = null; this.want = null; this.pos = null; this.look = null; this.lookKey = ''; this.madeKey = null; this.space = null; this.alive = true; }
  // their latest (shown while it's the garage you're in)
  set(m) { this.want = m && m.sp ? m : null; this.seen = performance.now(); }
  // how they look: { livery, face } (a new livery or face: a new character)
  setLook(L) { const k = JSON.stringify(L || {}); if (k !== this.lookKey) { this.look = L; this.lookKey = k; } }
  async make() {
    const k = this.lookKey; if (this.making || (this.ch && k === this.madeKey)) return;
    this.making = true;
    const ok = await loadCharacters(); this.making = false; if (!ok || !this.alive) return;
    if (this.ch) { this.ch.dispose(); this.ch.object.removeFromParent(); }
    const L = this.look || {};
    this.ch = makeCharacter({ look: 'racer', clip: 'idle', livery: L.livery || null, face: L.face ?? null, helmet: false, seed: 23 });
    this.madeKey = k; this.ch.object.visible = false; this.at = null;
  }
  update(dt) {
    const pg = this.pg, m = this.want;
    // (nothing heard for a few seconds: they've gone)
    if (m && performance.now() - this.seen > 3000) this.want = null;
    if (!this.want || this.want.sp !== this.space || !pg.active) { if (this.ch) this.ch.object.visible = false; this.pos = null; return; }
    if (!this.ch || this.madeKey !== this.lookKey) { this.make(); if (!this.ch) return; }
    const ch = this.ch, F = frameOf(pg);
    if (ch.object.parent !== F) { F.add(ch.object); this.at = null; }
    // where they are, in this frame: eased there (snapped if it's a jump: a new garage, a door)
    F.updateMatrixWorld(true);
    const inv = F.matrixWorld.clone().invert(), p = _p.set(m.x, m.y, m.z).applyMatrix4(inv), h = yawTo(m.h, inv);
    if (!this.at || this.at.distanceTo(p) > 2.5) this.at = p.clone(), this.h = h;
    else { this.at.lerp(p, Math.min(1, dt * 10)); this.h += Math.atan2(Math.sin(h - this.h), Math.cos(h - this.h)) * Math.min(1, dt * 10); }
    ch.object.position.copy(this.at); ch.object.rotation.y = this.h; ch.object.visible = !!m.vis;
    // what they're doing: walking (at their pace), else their clip ('sit_desk@sit_down': lined up as theirs is)
    if (m.c === 'move') ch.move(Math.max(0.3, m.v || CLIP_INFO.walk.speed), { run: !!m.r });
    else { const [a, b] = String(m.c).split('@'), c = b ? alignedClip(a, b) : a; if (hasClip(a)) ch.play(c, { fade: 0.3 }); }
    ch.update(dt);
    this.pos = ch.object.visible ? this.at : null;
  }
  dispose() { this.alive = false; if (this.ch) { this.ch.dispose(); this.ch.object.removeFromParent(); this.ch = null; } this.pos = null; }
}
