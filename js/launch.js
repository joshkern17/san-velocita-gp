// The season launch (World Career): press day in your own garage. The set (models/garage/event_launch.glb, built by
// tools/garage-launch.py) goes up where the premises has room for it (garagekit.js EVENT_AT): a stage with your car
// under a cover in the team's colour, the sponsors' backdrop behind, you and car two's driver at the top table, the
// press in rows, a host at the lectern. Three questions (wcareer.js pressDayOf / answerPress, the questions in
// js/wpressday.js): each asked from the floor, then three answers to pick from, what each does shown on it before you
// choose; what you said, said; the next. Then the car: you two go to your marks beside it, the cover's dragged off
// its tail in front of everybody, the flashes go, and the season's card (the car, the series, what you promised).
// The Wire's headline at the end. A premises with no room for the set (yet)
// has the same questions over the garage as it is. What's answered is kept as it's answered: quit halfway and the
// day picks up from the next question.
//   const launch = new Launch(el, src); launch.open(); launch.update(dt); launch.input({ left, right, ok, back })
//   src: { world(), pg (the garage), team() { main, accent, name }, me() / mate() { livery, face, name, role } | null,
//          sfx(k), save(), done() (the day's over: back to the garage) }
// The camera cuts between the set's CAM_launch_<shot> marks (2005: cuts and slow pushes, nothing swoops).
import * as THREE from 'three';
import { loadPiece, EVENT_AT } from './garagekit.js';
import { BULB_SCALE } from './pitgarage.js';
import { makeCharacter, loadCharacters } from './characters.js';
import { logoForName, logoUrl } from './sponsorlogos.js';
import * as WC from './wcareer.js';
import { promiseText } from './wpressday.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + ((c ?? 0x888888) >>> 0).toString(16).padStart(6, '0');
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PRESS_LOOKS = ['polo_navy', 'tee_white', 'polo_beige', 'tee_blue', 'polo_maroon', 'tee_beige', 'polo_white', 'tee_maroon'];
const SAY_FOR = 3.2;   // (seconds a line stays up; A moves it on)

export class Launch {
  constructor(el, src) { this.el = el; this.src = src; this.isOpen = false; this.chars = []; this.set = null; el.addEventListener('click', (e) => this.click(e)); }
  get w() { return this.src.world(); }

  async open() {
    if (this.isOpen) return;
    const w = this.w; this.D = WC.pressDayOf(w); this.qi = this.D.answers.filter(a => a != null).length; this.sel = 0;
    this.isOpen = true; this.phase = 'load'; this.t = 0;
    const T = this.src.team(), S = WC.seriesById(w.player.series);
    this.el.innerHTML = `<div class="pd-vig"></div>
      <header class="tsw-head pd-head"><h1>Season Launch</h1><p>${esc(T.name)} &middot; ${esc(S.name)} &middot; ${w.year}</p></header>
      <div class="pd-count"></div>
      <div class="pd-q" hidden><small></small><h2></h2></div>
      <div class="pd-ans" hidden></div><div class="tsw-focus pd-focus" hidden></div>
      <div class="pd-say" hidden><small></small><p></p><div class="pd-tags"></div></div>
      <div class="pd-wire" hidden><small>The Paddock Wire</small><h2></h2><p></p></div>
      <div class="pd-card" hidden><div class="pd-car"><small></small><h2></h2><p></p></div><div class="pd-said"><small>Said at the launch</small><ul></ul></div></div>
`;
    this.el.hidden = false; this.el.classList.remove('leave'); this.el.classList.add('enter'); setTimeout(() => this.el.classList.remove('enter'), 900);
    try { this.set = await this.placeSet(); } catch (e) { console.warn('launch set', e && e.stack || e); this.set = null; }
    if (!this.isOpen) return this.teardown();
    await this.cast();
    this.count();
    // in: the room from the back over the press, the host's welcome, then the first question
    this.shot('wide'); this.go('intro');
  }

  // ---------- the set: in the room, dressed in the team's colours and sponsors ----------
  async placeSet() {
    const pg0 = this.src.pg; if (pg0.roomLoading) await pg0.roomLoading.catch(() => {});   // (the garage may still be loading: the set goes in its room)
    const pg = pg0, kit = pg.kit, at = kit && EVENT_AT.launch[kit.shell];
    this.wasShot = pg.shot === 'cine' ? 'room' : pg.shot;   // (the garage's shot to go back to: the computer's seat, the room)
    if (!at) { console.warn('launch: no room for the set', kit ? kit.shell : 'no kit'); return null; }
    const set = await loadPiece('event_launch'); if (!set) { console.warn('launch: no event_launch.glb'); return null; }
    const room = kit.group.children[0]; set.position.set(at[0], 0, -at[1]); set.rotation.y = at[2]; room.add(set); set.updateMatrixWorld(true);
    const T = this.src.team(), hooks = {};
    set.traverse(o => {
      const n = (o.name || '').replace(/[._]\d{3}$/, ''); if (n) hooks[n] = hooks[n] || o;
      if (o.isLight) o.intensity *= BULB_SCALE;
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = false;
        for (const [k, m] of (Array.isArray(o.material) ? o.material : [o.material]).entries()) {
          const mn = m && m.name || '';
          if (/^TeamMain/.test(mn) || /^TeamAccent/.test(mn)) { const c = m.clone(); c.color.set(/^TeamMain/.test(mn) ? T.main : T.accent); if (Array.isArray(o.material)) o.material[k] = c; else o.material = c; }
        }
      }
    });
    this.hooks = hooks; this.setFrom = set;
    const print = (name, canvas) => { const o = hooks[name]; if (!o) return; o.traverse(m => { if (m.isMesh) { const t = new THREE.CanvasTexture(canvas); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; m.material = new THREE.MeshLambertMaterial({ map: t }); } }); };
    print('LAUNCH_BACKDROP', this.backdropArt(() => print('LAUNCH_BACKDROP', this.backdropArt())));
    print('LAUNCH_TABLECLOTH', this.clothArt(() => print('LAUNCH_TABLECLOTH', this.clothArt())));
    const me = this.src.me(), mate = this.src.mate();
    print('LAUNCH_NAME_1', this.nameArt(me)); if (mate) print('LAUNCH_NAME_2', this.nameArt(mate)); else if (hooks.LAUNCH_NAME_2) hooks.LAUNCH_NAME_2.visible = false;
    // the cars: under the cover (yours), out of the way (car two); your crew are off watching from somewhere else
    this.was = { carOff: pg.carOff, hideParked: pg.hideParked }; pg.showCar(false); pg.hideParked = true;   // (and you, as you were walking about: you're at the table)
    if (pg.homeCrew) pg.homeCrew.root.visible = false;
    // the cover: its cloth as built, to drag off at the reveal; the photographers' flash (in from the start, dark: a
    // light added later would have every material in the room recompile mid-reveal)
    const cv = hooks.LAUNCH_COVER; this.cover = null;
    if (cv) cv.traverse(o => { if (o.isMesh && !this.cover) { o.geometry = o.geometry.clone(); this.cover = { mesh: o, rest: o.geometry.attributes.position.array.slice() }; } });
    this.flash = new THREE.PointLight(0xf4f6ff, 0, 14, 2); room.add(this.flash); this.flashT = 0; this.pull = 0;
    return set;
  }
  // the sponsors, each logo once loaded (then the art's drawn again with it)
  logos(again) {
    const w = this.w, out = [];
    for (const d of WC.dealsOf(w)) {
      const slug = logoForName(WC.sponsorName(d.sid)); if (!slug) continue;
      const im = (this.imgs ||= {})[slug] || (this.imgs[slug] = Object.assign(new Image(), { src: logoUrl(slug) }));
      if (!im.complete && again) im.addEventListener('load', again, { once: true });
      out.push({ im, title: d.slot === 'title', slug });
    }
    return out.sort((a, b) => b.title - a.title);
  }
  backdropArt(again) {
    const T = this.src.team(), W = 1220, H = 400, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d');
    g.fillStyle = '#eeece6'; g.fillRect(0, 0, W, H); g.fillStyle = hex(T.main); g.fillRect(0, 0, W, 56);
    g.fillStyle = hex(T.accent); g.font = '700 34px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${T.name.toUpperCase()}  ·  ${this.w.year} SEASON LAUNCH`, W / 2, 30);
    const L = this.logos(again), tiles = ['team', ...L], cw = 244, ch = 108;
    for (let r = 0; r < 3; r++) for (let k = -1; k <= W / cw; k++) {
      const x = k * cw + (r % 2 ? cw / 2 : 0), y = 64 + r * ch, t = tiles[((k % tiles.length) + tiles.length + r * 2) % tiles.length];
      if (t === 'team') { let s = 30; g.font = `700 ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`; while (g.measureText(T.name.toUpperCase()).width > cw - 40 && s > 12) g.font = `700 ${--s}px "Helvetica Neue", Helvetica, Arial, sans-serif`; g.fillStyle = hex(T.main); g.fillText(T.name.toUpperCase(), x + cw / 2, y + ch / 2); }
      else if (t.im.complete && t.im.naturalWidth) { const k2 = Math.min((cw - 64) / t.im.naturalWidth, (ch - 34) / t.im.naturalHeight); const iw = t.im.naturalWidth * k2, ih = t.im.naturalHeight * k2; g.drawImage(t.im, x + (cw - iw) / 2, y + (ch - ih) / 2, iw, ih); }
    }
    g.fillStyle = '#282624'; g.fillRect(0, H - 14, W, 14);
    return c;
  }
  clothArt(again) {
    const T = this.src.team(), W = 512, H = 160, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d');
    g.fillStyle = hex(T.main); g.fillRect(0, 0, W, H); g.fillStyle = hex(T.accent); g.textAlign = 'center'; g.textBaseline = 'middle';
    let s = 48; g.font = `700 ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`; while (g.measureText(T.name.toUpperCase()).width > W - 60 && s > 16) g.font = `700 ${--s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.fillText(T.name.toUpperCase(), W / 2, 52);
    const t = this.logos(again).find(x => x.title);
    if (t && t.im.complete && t.im.naturalWidth) { const k = Math.min(220 / t.im.naturalWidth, 60 / t.im.naturalHeight); g.drawImage(t.im, (W - t.im.naturalWidth * k) / 2, 92, t.im.naturalWidth * k, t.im.naturalHeight * k); }
    return c;
  }
  nameArt(p) {
    const W = 256, H = 96, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d');
    g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, W, H); g.fillStyle = '#181818'; g.textAlign = 'center';
    const nm = p.name.toUpperCase(); let s = 30; g.font = `700 ${s}px Arial, sans-serif`; while (g.measureText(nm).width > W - 24 && s > 12) g.font = `700 ${--s}px Arial, sans-serif`;
    g.fillText(nm, W / 2, 46); g.fillStyle = '#6e6860'; g.font = '700 17px Arial, sans-serif'; g.fillText(p.role, W / 2, 78);
    return c;
  }

  // ---------- the people: you two at the table, the host, the press, the photographers ----------
  async cast() {
    if (!this.set || !(await loadCharacters())) return;
    const pg = this.src.pg, H = this.hooks, put = (ch, hook) => {
      const o = H[hook]; if (!o) return null; o.getWorldPosition(ch.object.position); const q = o.getWorldQuaternion(new THREE.Quaternion());
      ch.object.rotation.set(0, new THREE.Euler().setFromQuaternion(q, 'YXZ').y, 0); pg.scene.add(ch.object); this.chars.push(ch); return ch;
    };
    const me = this.src.me(), mate = this.src.mate();
    this.drivers = [put(makeCharacter({ look: 'racer', clip: 'sit_idle', livery: me.livery, face: me.face, helmet: false, seed: 11 }), 'LAUNCH_SEAT_1'),
      mate ? put(makeCharacter({ look: 'racer', clip: 'sit_idle', livery: mate.livery, face: mate.face, helmet: false, seed: 23 }), 'LAUNCH_SEAT_2') : null];
    this.host = put(makeCharacter({ look: 'polo_navy', clip: 'idle', seed: 5 }), 'LAUNCH_HOST');
    // the press: front rows first, from the aisle out (the 18 seats: rows of six, across)
    const n = this.D.crowd || WC.pressCrowd(this.w), order = [];
    for (let r = 0; r < 3; r++) for (const c of [2, 3, 1, 4, 0, 5]) order.push(r * 6 + c);
    this.press = order.slice(0, n).map((k, i) => put(makeCharacter({ look: PRESS_LOOKS[(i * 5 + k) % PRESS_LOOKS.length], clip: 'sit_idle', seed: 100 + k }), `LAUNCH_PRESS_${String(k).padStart(2, '0')}`)).filter(Boolean);
    this.photo = [];
    for (let k = 1; k <= Math.min(4, Math.max(1, Math.floor(n / 4))); k++) this.photo.push(put(makeCharacter({ look: PRESS_LOOKS[k % PRESS_LOOKS.length], clip: k % 2 ? 'idle_look' : 'point_fwd', seed: 300 + k }), `LAUNCH_PHOTO_${String(k).padStart(2, '0')}`));
    this.photo = this.photo.filter(Boolean);
    // whoever's asking stands at the aisle mic
    this.asker = put(makeCharacter({ look: 'polo_white', clip: 'idle', seed: 77 }), 'LAUNCH_ASK'); if (this.asker) this.asker.object.visible = false;
  }

  // ---------- the camera: the set's marks ----------
  // shot(name, secs = 0, push = 0): to the mark over secs (0: a cut), push of the way in towards what it looks at
  shot(name, secs = 0, push = 0) {
    const o = this.hooks && this.hooks['CAM_launch_' + name]; if (!o) return;
    const u = o.userData || {}, pos = o.getWorldPosition(new THREE.Vector3()), at = this.setFrom.localToWorld(new THREE.Vector3(u.tx, u.tz, -u.ty));
    if (push) pos.lerp(at, push);
    this.src.pg.cine({ pos, at, fov: u.fov || 45, shift: 0 }, calm() ? 0 : secs);   // (shift: the garage blends its sideways framing too; none here)
  }

  // ---------- the day, step by step ----------
  go(phase) {
    this.phase = phase; this.t = 0;
    const q = this.D.qs[this.qi], $ = (s) => this.el.querySelector(s);
    for (const s of ['.pd-q', '.pd-ans', '.pd-focus', '.pd-say', '.pd-wire', '.pd-card']) $(s).hidden = true;
    if (phase === 'intro') { this.say('Host', `Thanks for coming, everyone. ${this.src.team().name}, the ${this.w.year} season. We've got time for three questions.`); if (this.host) this.host.play('talk'); }
    else if (phase === 'ask') {
      if (this.host) this.host.play('idle');
      if (this.asker) { this.asker.object.visible = true; this.asker.play('talk'); }
      this.shot('ask'); this.sfx('move');
      $('.pd-q small').textContent = `${q.who.name} · ${q.who.outlet}${q.to === 'C' ? ' · to ' + (this.src.mate()?.first || 'your co-owner') : ''}`; $('.pd-q h2').textContent = q.q; $('.pd-q').hidden = false; this.wipe($('.pd-q'));
    } else if (phase === 'choose') {
      if (this.asker) this.asker.object.visible = false;   // (sat back down: the TV camera looks down the aisle past the mic)
      this.shot('qa'); this.sel = Math.min(this.sel, 2);   // (a cut: a move from the floor to the back would go through the crowd)
      $('.pd-q').hidden = false; this.answers(); $('.pd-ans').hidden = false; $('.pd-focus').hidden = false; this.place(true);
    } else if (phase === 'said') {
      if (this.asker) this.asker.object.visible = false;
      const a = q.answers[this.D.answers[this.qi]], who = q.to === 'C' ? (this.src.mate()?.first || 'Co-owner') : this.src.me().first;
      this.say(who, a.text, WC.pressFxTags(this.w, a));
      for (const [i, p] of (this.press || []).entries()) if (a.tone === 'Cheeky' ? i % 2 === 0 : a.tone === 'Bold' && i % 3 === 0) p.play(a.tone === 'Cheeky' ? 'sit_clap' : 'sit_clap_2', { once: true, then: 'sit_idle' });
      this.shot(a.tone === 'Bold' ? 'qa' : 'wide');
    } else if (phase === 'wire') {
      WC.pressDayDone(this.w); this.src.save();
      const n = this.w.news[0]; $('.pd-wire h2').textContent = n ? n.head : ''; $('.pd-wire p').textContent = n ? n.body : ''; $('.pd-wire').hidden = false; this.wipe($('.pd-wire'));
      this.shot('wide'); this.sfx('move');
    } else if (phase === 'reveal') {
      // up to your marks by the car (a cut: you were sat at the table), the car in under the cover, the host's line
      this.carOn(); this.toMarks();
      if (this.host) this.host.play('talk');
      for (const p of this.press || []) p.play('sit_idle');
      this.shot('reveal'); this.shot('reveal', 7, 0.12);   // (a cut to it, then a slow push in)
      this.say('Host', `Enough talking. Ladies and gentlemen, the ${this.w.year} ${this.src.team().name} ${this.w.car?.name || 'car'}.`);
    } else if (phase === 'pull') {
      if (this.host) this.host.play('idle');
      this.pull = 0; if (this.src.pg.car && this.carWas) this.src.pg.car.group.visible = true;
      for (const k of ['LAUNCH_COVER_Note', 'LAUNCH_COVER_Cord', 'LAUNCH_COVER_Tassel']) if (this.hooks[k]) this.hooks[k].visible = false;   // (the note goes with it, the cord's what pulled it)
      this.drivers.forEach((d, i) => d && d.play(i ? 'point_fwd' : 'idle_look'));
      this.sfx('select');
    } else if (phase === 'car') {
      this.coverAt(1); this.flashT = 0.2;
      for (const [i, p] of (this.press || []).entries()) p.play(i % 2 ? 'sit_clap' : 'sit_clap_2');
      this.drivers.forEach((d, i) => d && d.play(i ? 'wave' : 'victory'));
      this.shot('close'); this.shot('close', 9, 0.18);
      this.seasonCard(); this.sfx('best');
    }
    this.count(); this.hint();
  }
  say(who, text, tags = []) {
    const el = this.el.querySelector('.pd-say'); el.querySelector('small').textContent = who; el.querySelector('p').textContent = `“${text}”`;
    el.querySelector('.pd-tags').innerHTML = tags.map(t => `<span class="tsw-tag ${t.promise ? 'pd-promise' : t.good ? 'good' : 'bad'}">${esc(t.text)}</span>`).join('');
    el.hidden = false; this.wipe(el);
  }
  // the season's card: the car and the series, and what was promised (step 5 puts these where you race)
  seasonCard() {
    const w = this.w, S = WC.seriesById(w.player.series), $ = (s) => this.el.querySelector(s), pr = WC.promisesOf(w);
    $('.pd-car small').textContent = `${w.year} · ${S.name}`; $('.pd-car h2').textContent = w.car?.name || 'The car';
    $('.pd-car p').textContent = [this.src.team().name, ...WC.dealsOf(w).map(d => WC.sponsorName(d.sid))].join(' · ');
    $('.pd-said ul').innerHTML = pr.length ? pr.map(p => `<li><span class="tsw-tag pd-promise">Promise</span>${esc(promiseText(p))}</li>`).join('') : `<li class="none">No promises. The Wire noticed.</li>`;
    $('.pd-card').hidden = false; this.wipe($('.pd-card'));
  }
  // your car, out of its bay and onto the stage's mark (under the cover, out of sight till it's pulled)
  carOn() {
    const pg = this.src.pg, c = pg.car, mark = this.hooks && this.hooks.LAUNCH_CAR; if (!c || !mark || this.carWas) return;
    this.carWas = { parent: c.group.parent, pos: c.group.position.clone(), q: c.group.quaternion.clone(), vis: c.group.visible };
    mark.add(c.group); c.group.position.set(0, 0, 0); c.group.quaternion.identity(); c.group.visible = false;   // (shown as the cloth lifts: a cover's a guess at the shape, and a pop-up light or a wing would come through it)
    this.fitCover(c);
  }
  // the cover's made for a car of 4.45 x 1.86 x 1.27 m: let it out to whatever's under it (in the mark's frame, which is
  // the cover's: x across, y up, z along), so no mirror or wing comes through it
  fitCover(c) {
    const C = this.cover; if (!C) return;
    const mark = this.hooks.LAUNCH_CAR; mark.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mark.matrixWorld).invert(), box = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
    c.group.traverse(o => { if (!o.isMesh || o === c.shadow) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); });
    if (box.isEmpty()) return;
    const r = C.rest, cv = new THREE.Box3().setFromArray(r), cs = cv.getSize(new THREE.Vector3()), ks = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const k = [Math.max(1, ks.x * 1.08 / cs.x), Math.max(1, ks.y * 1.05 / cs.y), Math.max(1, ks.z * 1.05 / cs.z)];
    for (let i = 0; i < r.length; i += 3) { r[i] = r[i] * k[0] + mid.x; r[i + 1] *= k[1]; r[i + 2] = r[i + 2] * k[2] + mid.z; }
    this.coverAt(0);
    if (Math.max(...k) > 1.02) for (const n of ['LAUNCH_COVER_Note', 'LAUNCH_COVER_Cord', 'LAUNCH_COVER_Tassel']) if (this.hooks[n]) this.hooks[n].visible = false;   // (they'd be under it now)
  }
  carBack() {
    const w = this.carWas, c = this.src.pg.car; this.carWas = null; if (!w || !c) return;
    (w.parent || this.src.pg.bay).add(c.group); c.group.position.copy(w.pos); c.group.quaternion.copy(w.q); c.group.visible = w.vis;
  }
  // you two, stood on the spike marks either side of the car
  toMarks() {
    this.drivers.forEach((d, i) => {
      const o = d && this.hooks['LAUNCH_REVEAL_' + (i + 1)]; if (!o) return;
      o.getWorldPosition(d.object.position); d.object.rotation.set(0, new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y, 0); d.play('idle', { fade: 0 });
    });
  }
  // the cover, k of the way off: dragged from the tail, the nose last; up over the roof and down in a heap by the tail,
  // at the feet of whoever pulled it, you (in the cloth's own frame: x across, y up, z along with the nose at +z)
  coverAt(k) {
    const C = this.cover; if (!C) return;
    const a = C.mesh.geometry.attributes.position, r = C.rest, L = 4.45, e = (x) => x * x * (3 - 2 * x), t = this.t;
    for (let i = 0; i < a.count; i++) {
      const x = r[i * 3], y = r[i * 3 + 1], z = r[i * 3 + 2], u = Math.min(1, Math.max(0, (z + L / 2) / L));   // (0 at the tail, 1 at the nose)
      const q = e(Math.min(1, Math.max(0, (k - u * 0.45) / 0.55))), h = Math.sin(i * 12.9898) * 43758.5453 % 1;
      const hx = 1.0 + x * 0.22 + h * 0.12, hy = 0.02 + Math.abs(h) * 0.16 * (1 - Math.abs(x)) + u * 0.08, hz = -2.45 + z * 0.1 + y * 0.06;   // (the heap: off the tail's corner on the press side, where the cord was)
      const lift = Math.sin(q * Math.PI) * (0.3 + 0.35 * u), flut = Math.sin(t * 14 + i * 0.7) * 0.025 * Math.sin(q * Math.PI);
      a.array[i * 3] = x + (hx - x) * q; a.array[i * 3 + 1] = y + (hy - y) * q + lift + flut; a.array[i * 3 + 2] = z + (hz - z) * q;
    }
    a.needsUpdate = true; C.mesh.geometry.computeVertexNormals(); C.mesh.geometry.computeBoundingSphere();
  }
  answers() {
    const q = this.D.qs[this.qi];
    this.el.querySelector('.pd-ans').innerHTML = q.answers.map((a, i) => `<div class="pd-a${i === this.sel ? ' on' : ''}" data-i="${i}"><div class="tsw-top"><span class="tsw-tag">${esc(a.tone)}</span></div>
      <p>“${esc(a.text)}”</p><div class="pd-tags">${WC.pressFxTags(this.w, a).map(t => `<span class="tsw-tag ${t.promise ? 'pd-promise' : t.good ? 'good' : 'bad'}">${esc(t.text)}</span>`).join('')}</div></div>`).join('');
  }
  // the bracket: out where it was and in on the answer you're on (no sliding: it's 2005)
  place(snap = false) {
    const f = this.el.querySelector('.pd-focus'), c = this.el.querySelectorAll('.pd-a')[this.sel]; if (!f || !c) return;
    this.el.querySelectorAll('.pd-a').forEach((x, k) => x.classList.toggle('on', k === this.sel));
    const move = () => { const a = c.parentElement; f.style.transform = `translate(${a.offsetLeft + c.offsetLeft}px, ${a.offsetTop + c.offsetTop}px)`; f.style.width = c.offsetWidth + 'px'; f.style.height = c.offsetHeight + 'px'; };   // (in the panel's own frame, as the setup's bracket: not the screen's, which the wipe's clip throws off)
    if (snap || calm()) return move();
    f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' }).onfinish = () => { move(); f.getAnimations().forEach(a => a.cancel()); f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' }); };
  }
  wipe(el) { if (calm()) return; el.classList.remove('pd-wipe'); void el.offsetWidth; el.classList.add('pd-wipe'); }
  count() { const c = this.el.querySelector('.pd-count'); if (c) c.textContent = !['ask', 'choose', 'said'].includes(this.phase) ? '' : `Question ${String(this.qi + 1).padStart(2, '0')} / ${String(this.D.qs.length).padStart(2, '0')}`; }
  hint() { this.src.hints && this.src.hints(); }   // (the footer's keys: main.js HINTS)
  sfx(k) { this.src.sfx(k); }

  next() {
    const after = () => this.go(this.qi < this.D.qs.length ? 'ask' : 'reveal');   // (all answered, last time: straight to the car)
    if (this.phase === 'intro') return after();
    if (this.phase === 'ask') return this.go('choose');
    if (this.phase === 'choose') { const r = WC.answerPress(this.w, this.qi, this.sel); if (!r) return; this.sfx('select'); this.src.save(); return this.go('said'); }
    if (this.phase === 'said') { this.qi++; this.sel = 0; return after(); }
    if (this.phase === 'reveal') return this.go('pull');
    if (this.phase === 'pull') return this.go('car');   // (A: all the way off now)
    if (this.phase === 'car') return this.go('wire');
    if (this.phase === 'wire') return this.close();
  }
  input({ left, right, ok }) {
    if (!this.isOpen) return false;
    if (this.closing) return true;
    if (this.phase === 'load') return true;
    if (this.phase === 'choose' && (left || right)) { const s = Math.max(0, Math.min(2, this.sel + (right ? 1 : -1))); if (s !== this.sel) { this.sel = s; this.sfx('move'); this.place(); } }
    else if (ok) this.next();
    return true;
  }
  click(e) {
    const a = e.target.closest('.pd-a');
    if (a && this.phase === 'choose') { const i = +a.dataset.i; if (i !== this.sel) { this.sel = i; this.place(); this.sfx('move'); } else this.next(); return; }
    if (this.phase !== 'choose') this.next();
  }
  update(dt) {
    if (!this.isOpen) return;
    this.t += dt;
    for (const ch of this.chars) ch.update(dt);   // (the garage ticks only its own people)
    // (the lines move themselves on after a while; the answers wait for you)
    if ((this.phase === 'intro' || this.phase === 'said') && this.t > SAY_FOR + (this.phase === 'said' ? 1.2 : 0)) this.next();
    else if (this.phase === 'ask' && this.t > 2.6) this.next();
    else if (this.phase === 'reveal' && this.t > SAY_FOR + 0.6) this.next();
    else if (this.phase === 'pull') {
      this.pull = Math.min(1, this.t / (calm() ? 0.01 : 2.1)); this.coverAt(this.pull);
      if (this.pull > 0.55 && Math.random() < dt * 5) this.flashT = 0.07;
      if (this.pull >= 1 && this.t > 2.5) this.next();
    } else if (this.phase === 'car' && this.t < 6 && Math.random() < dt * 3 * (1 - this.t / 6)) this.flashT = 0.07;
    // the flashes: a pop at one of the photographers' cameras
    if (this.flash) {
      if (this.flashT > 0 && this.flash.intensity === 0 && this.photo && this.photo.length) {
        const p = this.photo[Math.floor(Math.random() * this.photo.length)].object; this.flash.parent.worldToLocal(this.flash.position.copy(p.position).add(new THREE.Vector3(0, 1.7, 0)));
        this.sfx('shutter');
      }
      this.flash.intensity = this.flashT > 0 && !calm() ? 2.5 : 0; this.flashT -= dt;
    }
  }

  close() {
    if (!this.isOpen || this.closing) return;
    this.closing = true; this.el.classList.add('leave');
    // (open till the set's down: walking picks up the moment this closes, and takes what's solid in the room as it is)
    setTimeout(() => { this.teardown(); this.isOpen = this.closing = false; this.el.hidden = true; this.el.innerHTML = ''; this.el.classList.remove('leave'); this.src.done(); }, 300);
  }
  teardown() {
    const pg = this.src.pg;
    for (const ch of this.chars) { ch.object.removeFromParent(); ch.dispose(); } this.chars = []; this.press = []; this.host = this.asker = null;
    this.carBack(); if (this.flash) { this.flash.removeFromParent(); this.flash = null; } this.cover = null; this.drivers = []; this.photo = [];
    if (this.set) { this.set.removeFromParent(); this.set.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.set = null; }
    if (this.was) { pg.showCar(!this.was.carOff); pg.hideParked = this.was.hideParked; this.was = null; }
    if (pg.homeCrew) pg.homeCrew.root.visible = true;
    if (pg.shot === 'cine') pg.setView(this.wasShot || 'room');   // (the camera's the garage's again)
  }
}
