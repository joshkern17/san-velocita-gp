// After the draw, a dream: black, then a light flickers on over a desk in the middle of nothing. A clerk from the State
// Lottery sits behind it and takes you through your claim; you choose how to take the winnings (lump sum or annuity)
// by signing one of two forms. Part of the opening (js/opening.js drives it: the input, the markers, the prompts).
// Desk, CRT, computer and keyboard: the PSX Computer asset pack; the clerk's chair: the OFFICE pack
// (office_chair_grey_alt); the clerk: js/characters.js.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { LOTTERY } from './wcareer.js';
import { loadCharacters, makeCharacter } from './characters.js';
import { hash, paperCanvas, text, lines, sheet } from './papers.js';

const loader = new GLTFLoader(), loads = {};
const glb = (name) => loads[name] || (loads[name] = loader.loadAsync(`models/office/${name}.glb`).then(g => g.scene, () => null));
const money$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

// you sit across the desk from the clerk (metres; the desk at the origin, the clerk at -z facing you, you at +z)
const EYE = new THREE.Vector3(0, 1.16, 1.3), LOOK = new THREE.Vector3(0, 0.98, -0.2);
const LAMP = new THREE.Vector3(0, 2.25, 0.05);
// the light coming on: on/off from the moment it's switched (seconds), then on for good
const FLICKER = [[0, 1], [0.07, 0], [0.22, 1], [0.27, 0], [0.7, 1], [0.8, 0], [0.92, 1], [0.96, 0.3], [1.02, 1]];
const OFF = [[0, 0.2], [0.06, 1], [0.14, 0], [0.32, 0.8], [0.38, 0]];

// the forms: L-1 (lump sum) and A-30 (annuity), carbon-copy pale
const FORMS = {
  lump: { no: 'L-1', tint: '#e7f0e1', what: 'LUMP SUM', big: money$(LOTTERY.lump), sub: ['Paid once, today, after tax.', 'The cash value of the jackpot.'], foot: 'Form L-1 (rev. 1988). Do not fold.' },
  annuity: { no: 'A-30', tint: '#f3e3e6', what: 'ANNUITY', big: `${money$(LOTTERY.annuity)} a year`, sub: [`${LOTTERY.years} yearly payments, the first today.`, `${money$(LOTTERY.annuity * LOTTERY.years)} in total.`], foot: `Form A-${LOTTERY.years} (rev. 1988). Keep for ${LOTTERY.years} years.` },
};
function formCanvas(f, sign = 0, stamp = false) {
  const [c, g] = paperCanvas(400, 520, f.tint);
  text(g, 'PROVINCE OF SAN VELOCITA', 200, 34, '700 13px Arial', '#333', 'center');
  text(g, 'STATE LOTTERY  ·  WINNER SERVICES', 200, 52, '500 12px Arial', '#333', 'center');
  g.fillStyle = '#333'; g.fillRect(30, 64, 340, 1.5);
  text(g, `FORM ${f.no}`, 30, 106, '700 34px "Courier New", monospace', '#151515');
  text(g, 'ELECTION OF PAYMENT', 30, 132, '700 14px Arial', '#333');
  text(g, f.what, 30, 160, '700 24px Arial', '#151515');
  g.strokeStyle = '#333'; g.lineWidth = 1.5; g.strokeRect(30, 182, 340, 96);
  text(g, f.big, 200, 228, '700 34px "Courier New", monospace', '#151515', 'center');
  f.sub.forEach((s, i) => text(g, s, 200, 252 + i * 16, '500 13px Arial', '#333', 'center'));
  lines(g, 30, 302, 340, 6, 11, f.no.length * 7);
  g.strokeRect(30, 384, 12, 12); text(g, 'I understand this choice is final.', 52, 395, '500 13px Arial', '#222');
  text(g, 'x', 34, 452, 'italic 22px "Times New Roman", serif', '#222');
  g.fillStyle = '#222'; g.fillRect(50, 454, 220, 1.2);
  text(g, 'Claimant, ticket no. 1742', 50, 470, '500 11px Arial', '#444');
  text(g, f.foot, 200, 506, '500 10px Arial', '#555', 'center');
  if (sign > 0) { // your signature, as far as the pen's got
    g.strokeStyle = '#1d3a8a'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(60, 446);
    const n = 14, upto = Math.floor(n * sign);
    for (let i = 0; i < upto; i++) g.quadraticCurveTo(66 + i * 13, 420 + hash(i + 3) * 34, 72 + i * 13, 446 - hash(i + 9) * 12);
    g.stroke();
    if (sign >= 1) { g.beginPath(); g.moveTo(36, 386); g.lineTo(40, 394); g.lineTo(46, 382); g.stroke(); } // (the box, ticked)
  }
  if (stamp) {
    g.save(); g.translate(300, 410); g.rotate(-0.22); g.globalAlpha = 0.82; g.strokeStyle = '#c4231a'; g.lineWidth = 3;
    g.strokeRect(-70, -26, 140, 52); text(g, 'RECEIVED', 0, 2, '700 22px Arial', '#c4231a', 'center'); text(g, 'WINNER SERVICES', 0, 18, '700 10px Arial', '#c4231a', 'center');
    g.restore();
  }
  return c;
}

// what the clerk says (a line is shown for its own time, or until you click): before the forms, and after you sign
const INTRO = [
  'Ticket 1742.',
  'Congratulations on your win.',
  `The jackpot is ${money$(LOTTERY.jackpot)}. That's the figure on the posters.`,
  'Of that, the Province keeps a share as a Prosperity Contribution. It pays for the posters.',
  'You can take what\'s left two ways.',
  `The lump sum: the cash value, less tax. ${money$(LOTTERY.lump)}, today.`,
  `Or the annuity: ${money$(LOTTERY.annuity)} a year for ${LOTTERY.years} years. Spread out, less of it goes in tax.`,
  'This choice is final. Most people take the lump sum.',
];
const OUTRO = ['Thank you.', 'We only pay winnings to a registered business. That\'s Form SV-1.', 'Next.'];

export class ClaimOffice {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 2.6, 6.5);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.03, 50);
    this.scene.add(this.camera);
    // the one light: a shade on a flex that goes up into the dark, and a little blue from the clerk's screen
    this.spot = new THREE.SpotLight(0xfff0d2, 0, 7, 0.56, 0.6, 1.2); this.spot.position.copy(LAMP);
    this.spot.target.position.set(0, 0.5, 0.15); this.scene.add(this.spot, this.spot.target);
    this.fill = new THREE.PointLight(0xffe6c0, 0, 3.5, 2); this.fill.position.set(0, 1.6, 0.9); this.scene.add(this.fill); // (bounce off the desk)
    this.crt = new THREE.PointLight(0x8fb4ff, 0, 1.6, 2); this.crt.position.set(0.4, 1.0, -0.42); this.scene.add(this.crt);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0x2e3a2c, side: THREE.DoubleSide }));
    shade.position.copy(LAMP).add(new THREE.Vector3(0, 0.06, 0));
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), this.bulbMat); bulb.position.copy(LAMP);
    const flex = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 4, 4), new THREE.MeshLambertMaterial({ color: 0x111111 })); flex.position.copy(LAMP).add(new THREE.Vector3(0, 2.1, 0));
    this.scene.add(shade, bulb, flex);
    // the floor: only where the light falls (the fog and the cone's edge take the rest)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.MeshLambertMaterial({ color: 0x4a4744 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    // dust in the light
    const n = 36, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = Math.sqrt(hash(i)) * 0.45, a = hash(i + 200) * Math.PI * 2; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.8 + hash(i + 400) * 1.3; pos[i * 3 + 2] = Math.sin(a) * r + 0.1; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({ color: 0xfff1d8, size: 0.004, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dg, this.dustMat); this.scene.add(this.dust);
    this.load();
  }

  load() {
    const put = (name, x, y, z, ry = 0) => glb(name).then(m => {
      if (!m) return; const o = m.clone(true);
      o.traverse(k => { if (k.isMesh) for (const mat of [].concat(k.material)) { if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestMipmapNearestFilter; } mat.metalness = 0; } });
      o.position.set(x, y, z); o.rotation.y = ry; this.scene.add(o); return o;
    });
    // (the desk's top is at 0.75; the CRT and the keyboard face the clerk, at -z; the chair's front is its +x)
    Promise.all([
      put('desk', 0, 0, 0), put('CrtMonitor', 0.6, 0.75, -0.14, Math.PI + 0.75), put('keyboard', 0.05, 0.75, -0.2, Math.PI),
      put('computer', -0.98, 0, -0.1, Math.PI - 0.2), put('office_chair_grey_alt', 0, 0, -0.68, -Math.PI / 2),
    ]).then(() => { this.ready = true; });
    loadCharacters().then(ok => {
      if (!ok) return;
      this.clerk = makeCharacter({ look: 'polo_white', clip: 'sit_idle', seed: 1742 });
      this.clerk.object.position.set(0.02, 0.04, -0.66); this.scene.add(this.clerk.object);
    });
    // the forms, on your side of the desk once they're slid over
    this.forms = ['lump', 'annuity'].map((key, i) => {
      const m = sheet(formCanvas(FORMS[key]), 0.15, 0.195, 0.0008, 0xe0dccf, true);
      const home = { p: new THREE.Vector3(i ? 0.13 : -0.13, 0.7515, 0.16), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, i ? -0.06 : 0.05)) };
      const start = { p: new THREE.Vector3(-0.36 + i * 0.012, 0.7515 + i * 0.001, -0.12 - i * 0.01), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI + 0.1 - i * 0.12)) };
      m.position.copy(start.p); m.quaternion.copy(start.q); m.visible = false; this.scene.add(m);
      return { key, obj: m, home, start, state: 'away', k: 1 };
    });
  }

  // h: { snd (js/opening.js's sound), say(html), line(text), btn(), done(choice) }
  start(h) {
    this.h = h; this.t = 0; this.stage = 'dark'; this.light = 0; this.lineI = -1; this.lineT = 0; this.sel = 0; this.picked = null; this.sign = 0;
    this.yaw = 0; this.pitch = 0; this.targets = []; this.offT = -1; this.stampT = -1;
    for (const f of this.forms) { f.state = 'away'; f.k = 1; f.obj.visible = false; f.obj.position.copy(f.start.p); f.obj.quaternion.copy(f.start.q); this.redraw(f); }
    h.say(''); h.line('');
  }
  redraw(f, sign = 0, stamp = false) { const t = f.obj.userData.tex; t.image = formCanvas(FORMS[f.key], sign, stamp); t.needsUpdate = true; }

  // ---- input (from js/opening.js) ----
  look(dy, dp) { this.yaw = clamp(this.yaw + dy, -0.6, 0.6); this.pitch = clamp(this.pitch + dp, -0.45, 0.3); }
  nav(d) { if (this.stage !== 'choose') return; const n = clamp(this.sel + d, 0, 1); if (n !== this.sel) { this.sel = n; this.h.snd?.hiss(0.12, 2600, 0.015, { room: true }); } }
  hover(objs) { if (this.stage !== 'choose') return; const i = this.forms.findIndex(f => objs.includes(f.obj)); if (i >= 0) this.sel = i; }
  confirm() {
    if (this.stage === 'talk' || this.stage === 'outro') { if (this.lineT > 0.5) this.lineT = 99; return; }
    if (this.stage === 'choose') return this.pick(this.forms[this.sel]);
    if (this.stage === 'held') return this.signIt();
  }
  click(objs) {
    if (this.stage === 'choose') { const f = this.forms.find(x => objs.includes(x.obj)); if (f) this.pick(f); return; }
    this.confirm();
  }
  // B / Esc while holding a form: put it back (true: handled)
  back() { if (this.stage !== 'held') return false; this.move(this.picked, 'desk'); this.picked = null; this.stage = 'choose'; this.prompt(); return true; }

  pick(f) {
    this.picked = f; this.stage = 'held'; this.move(f, 'held');
    this.h.snd?.hiss(0.25, 2200, 0.025, { room: true });
    // a marker on the line you sign (on the form in your hand: it moves with it)
    const sig = new THREE.Vector3(-0.015, -0.068, 0.001), o = f.obj;
    this.targets = [{ get at() { return o.localToWorld(sig.clone()); }, label: 'Sign here', objs: [o], hot: () => true }];
    this.h.say(`${this.h.btn()} &nbsp;Sign it &nbsp;&nbsp;&nbsp; ${this.h.back()} &nbsp;Put it back`);
  }
  // the form the selection frame goes round (while choosing)
  framed() { const f = this.stage === 'choose' && this.forms[this.sel]; return f && f.state === 'desk' && f.k >= 1 ? f.obj : null; }
  signIt() {
    if (this.stage !== 'held') return;
    this.stage = 'signing'; this.signT = 0; this.h.say(''); this.targets = [];
    const s = this.h.snd; if (s) for (let k = 0; k < 9; k++) s.hiss(0.07, 4200 + hash(k) * 1500, 0.02, { room: true, delay: k * 0.09 + hash(k + 4) * 0.04 });
  }
  prompt() {
    this.h.say(this.h.pad() ? '<kbd class="dpad h"></kbd> &nbsp;Choose &nbsp;&nbsp;&nbsp; <kbd class="pb a">A</kbd> &nbsp;Pick it up' : 'Click a form to pick it up');
    this.targets = this.forms.map((f, i) => ({ at: f.home.p.clone().add(new THREE.Vector3(0, 0.07, -0.1)) /* (above the far edge, clear of the frame) */, label: f.key === 'lump' ? 'Lump sum' : 'Annuity', objs: [f.obj], hot: () => this.sel === i }));
  }

  move(f, state) {
    const o = f.obj;
    f.from = { p: o.position.clone(), q: o.quaternion.clone() }; f.state = state; f.k = 0; f.dur = state === 'desk' && f.from.p.z < 0 ? 1.1 : 0.6;
  }
  poseOf(f) {
    if (f.state === 'held') {
      const cam = this.camera, p = cam.localToWorld(new THREE.Vector3(0, 0.018, -0.34));
      return { p, q: cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0.02))) };
    }
    if (f.state === 'back') return f.start;
    return f.home;
  }

  // ---- per frame ----
  update(dt) {
    this.t += dt; const h = this.h, s = h.snd;
    // the light
    if (this.stage === 'dark' && this.t > 1.6) { this.stage = 'on'; this.onT = 0; s?.click(); s?.note(52, 0.5, 0.05, { room: true, slide: 0.9 }); }
    if (this.onT !== undefined && this.onT >= 0) {
      this.onT += dt; let v = 1; for (const [at, x] of FLICKER) if (this.onT >= at) v = x;
      if (v !== this.light && v > 0.5 && s) s.hiss(0.05, 1800, 0.02, { room: true });
      this.light = v;
      if (this.onT > 1.1 && !this.hum) this.startHum();
    }
    if (this.offT >= 0) { this.offT += dt; let v = 1; for (const [at, x] of OFF) if (this.offT >= at) v = x; this.light = v; if (this.offT > 0.4) this.light = 0; if (this.offT > 2.4 && !this.finished) { this.finished = true; this.stopHum(); h.done(this.choice); } }
    const sag = this.stampT >= 0 && this.stampT < 0.25 ? 0.55 : 1; if (this.stampT >= 0) this.stampT += dt;
    const L = this.light * sag * (1 + Math.sin(this.t * 120) * 0.01);
    this.spot.intensity = 7.5 * L; this.fill.intensity = 0.35 * L; this.crt.intensity = 0.7 * L * (0.9 + Math.sin(this.t * 31) * 0.1);
    this.bulbMat.color.setScalar(L * 3); this.dustMat.opacity = 0.35 * L;
    const d = this.dust.geometry.attributes.position; for (let i = 0; i < d.count; i++) { d.array[i * 3 + 1] += dt * 0.012 * (0.4 + hash(i + 7)); if (d.array[i * 3 + 1] > 2.1) d.array[i * 3 + 1] = 0.8; } d.needsUpdate = true;
    // the clock you can't see
    if (this.light > 0 && (this.tick = (this.tick || 0) + dt) > 1) { this.tick = 0; s?.hiss(0.025, 3600, 0.012, { room: true }); }
    if (this.clerk) this.clerk.update(dt);
    // what's being said
    if (this.stage === 'on' && this.onT > 2.6) { this.stage = 'talk'; this.lines = INTRO; this.nextLine(); }
    if (this.stage === 'talk' || this.stage === 'outro') {
      this.lineT += dt;
      const ln = this.lines[this.lineI], hold = Math.max(2.4, ln.split(' ').length * 0.32 + 1.2);
      if (this.lineT > hold) this.nextLine();
    }
    if (this.stage === 'signing') {
      this.signT += dt; this.sign = clamp(this.signT / 0.9, 0, 1); this.redraw(this.picked, this.sign);
      if (this.signT > 1.4) { // back over the desk; the stamp
        this.stage = 'stamp'; this.choice = this.picked.key; this.move(this.picked, 'back'); this.stampAt = this.t + 1.3;
        for (const f of this.forms) if (f !== this.picked) this.move(f, 'back');
      }
    }
    if (this.stage === 'stamp' && this.t > this.stampAt) {
      this.stage = 'outro'; this.stampT = 0; this.redraw(this.picked, 1, true);
      s?.note(70, 0.35, 0.22, { room: true, slide: 0.6 }); s?.hiss(0.12, 500, 0.12, { room: true });
      this.lines = OUTRO; this.lineI = -1; this.lineT = -0.8; this.nextLine(true);
    }
    for (const f of this.forms) if (f.k < 1) f.k = Math.min(1, f.k + dt / f.dur);
  }
  nextLine(keepT) {
    this.lineI++; if (!keepT) this.lineT = 0;
    if (this.lineI >= this.lines.length) {
      this.h.line('');
      if (this.lines === INTRO) { this.stage = 'choose'; this.prompt(); }
      else if (this.offT < 0) { this.offT = 0; this.h.snd?.click(); }
      return;
    }
    const ln = this.lines[this.lineI]; this.h.line(ln);
    // (he mumbles it: a low murmur a word at a time)
    const s = this.h.snd; if (s) ln.split(' ').forEach((w, i) => s.note(120 + hash(i + ln.length) * 50, 0.09, 0.018, { room: true, delay: 0.05 + i * 0.16 }));
    if (this.lines === INTRO && this.lineI === 4) for (const f of this.forms) { f.obj.visible = true; this.move(f, 'desk'); s?.hiss(0.5, 1400, 0.02, { room: true }); } // (he slides the forms over)
  }

  startHum() {
    const s = this.h.snd; if (!s || !s.ctx) return; const c = s.ctx;
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 100;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    this.humG = c.createGain(); this.humG.gain.value = 0; this.humG.gain.setTargetAtTime(0.012, c.currentTime, 0.8);
    this.hum.connect(lp); lp.connect(this.humG); this.humG.connect(s.room); this.hum.start();
  }
  stopHum() { if (!this.hum) return; const c = this.h.snd.ctx; this.humG.gain.setTargetAtTime(0, c.currentTime, 0.05); const o = this.hum; setTimeout(() => { try { o.stop(); } catch (e) {} }, 500); this.hum = null; }
  leave() { if (this.hum) this.stopHum(); }

  render(post, aspect) {
    const cam = this.camera;
    cam.aspect = aspect; cam.updateProjectionMatrix();
    // sat still, breathing; a slow drift, like it's not quite real
    cam.position.copy(EYE).add(new THREE.Vector3(Math.sin(this.t * 0.23) * 0.01, Math.sin(this.t * 1.1) * 0.004, 0));
    cam.lookAt(LOOK); cam.rotateY(this.yaw); cam.rotateX(this.pitch); cam.rotateZ(Math.sin(this.t * 0.17) * 0.006);
    cam.updateMatrixWorld();
    for (const f of this.forms) {
      const to = this.poseOf(f), o = f.obj;
      if (f.k < 1 && f.from) { const e = ease(f.k); o.position.lerpVectors(f.from.p, to.p, e); o.quaternion.slerpQuaternions(f.from.q, to.q, e); if (f.state === 'desk' || f.state === 'held') o.position.y += Math.sin(e * Math.PI) * (f.state === 'held' ? 0.05 : 0.004); }
      else { o.position.copy(to.p); o.quaternion.copy(to.q); }
      // choosing: the selected one lifts off the desk and tips towards you, the other dims
      const on = this.stage !== 'choose' || this.forms[this.sel] === f;
      f.lift = (f.lift || 0) + ((this.stage === 'choose' && on && f.state === 'desk' ? 1 : 0) - (f.lift || 0)) * 0.2;
      if (f.state === 'desk' && f.k >= 1) { o.position.y += f.lift * 0.02; o.rotateX(f.lift * 0.35); }
      for (const m of o.userData.mats) m.color.setScalar(on ? 1 : 0.45);
    }
    post.render(this.scene, cam, { trails: 0, grade: [1.02, 0.99, 0.96] });
  }
}
