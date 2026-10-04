// The end of a World Career (the bank closed the account, or the series withdrew the entry): a short scene in your
// garage at night, then the Paddock Wire, then the record. main.js starts it (play) when you come into the garage
// with w.ended and it hasn't been seen, and gives it what it needs (src: the garage, the list's paper, the world,
// the words). Shots, in order:
//   the ad: the computer, close, an SVList listing for the car (or the garage's contents, if the car's gone)
//   Danny: the headlights of his truck through the door; he walks in, and the car rolls out with him behind it
//   the list: on the wall; it comes off the wall towards you
//   the Wire's piece, then the record (the list beside the numbers). Any key moves on; Esc / B skips to the record.
import * as THREE from 'three';
import { loadCharacters, makeCharacter } from './characters.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (k) => k * k * (3 - 2 * k);

export class Ending {
  constructor(el, src) {
    this.el = el; this.src = src; this.active = false; this.t = 0; this.steps = []; this.i = 0;
  }
  get isOpen() { return this.active; }
  // go: the whole thing from the start; recordOnly: straight to the record (a career that's already ended)
  play(recordOnly = false) {
    const G = this.src.garage();
    this.active = true; this.t = 0; this.i = 0; this.stage = null;
    this.el.hidden = false; this.el.className = 'ending on'; this.el.innerHTML = `<div class="en-bar top"></div><div class="en-bar bot"></div><div class="en-black"></div><div class="en-card"></div><div class="en-hint">Esc / B &nbsp;Skip</div>`;
    this.black = this.el.querySelector('.en-black'); this.card = this.el.querySelector('.en-card');
    this.black.style.opacity = 1;
    if (recordOnly || calm()) { this.toRecord(); return; }
    G.setNight(true);
    this.carStart = G.car ? G.car.group.position.clone() : null;
    this.listStart = G.listMesh ? { p: G.listMesh.position.clone(), q: G.listMesh.quaternion.clone() } : null;
    // the computer's screen shows the listing (put back afterwards)
    this.screenWas = G.pcCanvas; G.setScreen(this.adCanvas());
    loadCharacters().then(ok => { if (ok && this.active) this.danny = makeCharacter({ look: 'tee_blue', clip: 'idle', seed: 7 }); });
    const f = G.screenFrame(), aspect = G.r.domElement.width / G.r.domElement.height;
    const seat = f ? G.seatPose(f, aspect) : null;
    const C = G.carCentre(), d = G.doorDir(), side = new THREE.Vector3(-d.z, 0, d.x), room = G.doorRoom();
    this.steps = [
      // the ad: from a little way back, a slow push in to the screen
      { at: 0, run: () => { if (seat) { const far = { ...seat, pos: seat.pos.clone().addScaledVector(f.n, 0.5) }; G.cine(far, 0); G.cine(seat, 5); } this.fade(0, 1.2); } },
      { at: 5.2, run: () => this.fade(1, 0.6) },
      // Danny and the car, from the back of the room
      { at: 6, run: () => {
        G.cine({ pos: C.clone().addScaledVector(d, -5.2).addScaledVector(side, 1.8).setY(1.7), at: C.clone().addScaledVector(d, 2.5).setY(0.9), fov: 46, shift: 0 }, 0);
        G.cine({ pos: C.clone().addScaledVector(d, -4.6).addScaledVector(side, 1.2).setY(1.6), at: C.clone().addScaledVector(d, 3).setY(0.9), fov: 46, shift: 0 }, 9);
        if (this.danny) { const o = this.danny.object; G.bay.add(o); o.position.copy(C).addScaledVector(d, Math.min(room + 1.5, 6)).addScaledVector(side, -1.3).setY(0); o.rotation.y = Math.atan2(-d.x, -d.z); this.danny.play('walk', { fade: 0 }); }
        this.dannyPlan = { from: this.danny ? this.danny.object.position.clone() : null, stop: C.clone().addScaledVector(d, 0.6).addScaledVector(side, -1.3).setY(0) };
        this.fade(0, 0.8);
      } },
      { at: 15.5, run: () => this.fade(1, 0.8) },
      // the list on the wall, and off it
      { at: 16.4, run: () => { if (this.danny) this.danny.object.visible = false; const lf = G.listFrame(); if (lf) G.cine(G.listPose(lf, aspect), 0); this.fade(0, 0.8); } },
      { at: 22, run: () => this.fade(1, 0.5) },
      { at: 22.6, run: () => this.toWire() },
    ];
  }
  // the black over everything: to opacity v over s seconds
  fade(v, s) { this.black.style.transition = `opacity ${s}s ease`; this.black.style.opacity = v; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    while (this.i < this.steps.length && this.t >= this.steps[this.i].at) this.steps[this.i++].run();
    const G = this.src.garage(), C = G.carCentre(), d = G.doorDir();
    // Danny walks in, stops by the car, then the car rolls out with him behind it (no car: he looks around, and goes)
    if (this.danny && this.dannyPlan && this.t >= 6 && this.t < 16.4) {
      const o = this.danny.object, P = this.dannyPlan, k = this.t - 6;
      const walkIn = P.from.distanceTo(P.stop) / 1.35;
      if (k < walkIn) { o.position.lerpVectors(P.from, P.stop, k / walkIn); }
      else if (k < walkIn + 1.6) { if (this.danny.clip !== 'idle_look') this.danny.play('idle_look'); }
      else {
        const r = k - walkIn - 1.6;
        if (this.danny.clip !== 'walk_2') { this.danny.play('walk_2'); o.rotation.y = Math.atan2(d.x, d.z); }
        o.position.copy(P.stop).addScaledVector(d, r * 0.95);
        if (G.car && G.car.group.visible && this.carStart) G.car.group.position.copy(this.carStart).addScaledVector(d, Math.min(G.doorRoom() + 3, r * 0.95));
      }
      this.danny.update(dt);
    }
    // the list comes off the wall, towards you
    if (G.listMesh && this.listStart && this.t >= 18 && this.t < 22.6) {
      const k = ease(Math.min(1, (this.t - 18) / 3.6)), n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.listStart.q);
      G.listMesh.position.copy(this.listStart.p).addScaledVector(n, k * 0.7).add(new THREE.Vector3(0, -k * 0.08, 0));
      G.listMesh.quaternion.copy(this.listStart.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), k * 0.06));
    }
  }
  // the room back as it was (the car back in its bay: the record says what happened to it)
  restore() {
    const G = this.src.garage();
    G.setNight(false);
    if (this.carStart && G.car) G.car.group.position.copy(this.carStart);
    if (this.listStart && G.listMesh) { G.listMesh.position.copy(this.listStart.p); G.listMesh.quaternion.copy(this.listStart.q); }
    if (this.screenWas) { G.setScreen(this.screenWas); this.screenWas = null; }
    if (this.danny) { this.danny.object.removeFromParent(); this.danny.dispose(); this.danny = null; }
    this.dannyPlan = null; this.steps = [];
  }
  toWire() {
    this.restore(); this.stage = 'wire'; this.black.style.transition = 'none'; this.black.style.opacity = 1;
    const p = this.src.wire();
    this.card.className = 'en-card wire'; this.card.innerHTML = `<div class="en-paper"><div class="en-mast">THE PADDOCK WIRE</div><div class="en-date">${p.when}</div><h2>${p.head}</h2>${p.body.map(x => `<p>${x}</p>`).join('')}</div>`;
    this.src.sfx('select');
  }
  toRecord() {
    this.restore(); this.stage = 'record'; this.black.style.transition = 'none'; this.black.style.opacity = 1;
    const r = this.src.record();
    this.card.className = 'en-card record';
    this.el.querySelector('.en-hint')?.remove(); // (nothing to skip now)
    this.card.innerHTML = `<div class="en-sheet"><img src="${r.list}" alt=""></div><div class="en-rec"><div class="en-cap">${r.cap}</div><h2>${r.team}</h2><p class="en-sub">${r.sub}</p>
      <div class="en-cells">${r.cells.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div><p class="en-how">${r.how}</p>
      <div class="en-acts">${r.acts.map((a, k) => `<button class="en-btn${k === 0 ? ' on' : ''}" data-k="${k}">${a.label}</button>`).join('')}</div></div>`;
    this.acts = r.acts; this.sel = 0;
    this.card.querySelectorAll('.en-btn').forEach(b => { b.onclick = () => { this.sel = +b.dataset.k; this.choose(); }; b.onmouseenter = () => { this.sel = +b.dataset.k; this.mark(); }; });
    this.src.seen();
  }
  mark() { this.card.querySelectorAll('.en-btn').forEach((b, k) => b.classList.toggle('on', k === this.sel)); }
  choose() { const a = this.acts && this.acts[this.sel]; if (!a) return; this.close(); a.run(); }
  // { ok, back, up, down }
  input(k) {
    if (!this.active) return;
    if (this.stage === 'record') {
      if (k.up || k.down) { this.sel = (this.sel + (k.down ? 1 : -1) + this.acts.length) % this.acts.length; this.mark(); this.src.sfx('move'); }
      if (k.ok) this.choose();
      return;
    }
    if (this.stage === 'wire') { if (k.ok || k.back) this.toRecord(); return; }
    if (k.back || k.ok) this.toWire();
  }
  close() { this.restore(); this.active = false; this.stage = null; this.el.hidden = true; this.el.className = 'ending'; this.el.innerHTML = ''; }
  // the listing on the computer: the car, or what's left in the garage
  adCanvas() {
    // (drawn at 640 x 512, scaled to the computer's own canvas: the screen's texture keeps its size)
    const a = this.src.ad(), was = this.src.garage().pcCanvas, c = document.createElement('canvas'); c.width = was ? was.width : 640; c.height = was ? was.height : 512;
    const g = c.getContext('2d'); g.scale(c.width / 640, c.height / 512);
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 640, 512);
    g.fillStyle = '#3a1d70'; g.fillRect(0, 0, 640, 46); g.fillStyle = '#fff'; g.font = 'bold 24px Arial'; g.fillText('SVList', 18, 31);
    g.font = '13px Arial'; g.fillText('san velocita > for sale > ' + a.section, 110, 29);
    g.fillStyle = '#111'; g.font = 'bold 26px Arial'; g.fillText(a.title, 22, 92);
    g.fillStyle = '#1f6b2f'; g.font = 'bold 24px Arial'; g.fillText(a.price, 22, 128);
    g.fillStyle = '#ccc'; g.fillRect(22, 146, 250, 180); g.fillStyle = '#888'; g.font = '14px Arial'; g.fillText('(photo coming)', 92, 240);
    g.fillStyle = '#222'; g.font = '16px Arial';
    let y = 160; for (const para of a.body) { const words = para.split(' '); let line = '';
      for (const wd of words) { if (g.measureText(line + wd).width > 320) { g.fillText(line, 292, y); y += 21; line = ''; } line += wd + ' '; }
      g.fillText(line, 292, y); y += 30; }
    g.fillStyle = '#666'; g.font = '13px Arial'; g.fillText(a.foot, 22, 488);
    return c;
  }
}
