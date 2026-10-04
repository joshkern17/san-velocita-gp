// The opening: the living room of your trailer, at night, sat on the couch in front of the TV. A race is on. You're
// prompted to look left, at the pile on the side table (a racing magazine, the divorce papers, a video shop's late
// notice and, at the bottom, a lottery ticket), then back at the TV: the remote comes up, the channel changes to the
// lottery draw, and you hold the ticket up while the numbers come out, each one lighting up on the paper as it's drawn.
// The room is models/trailer.glb (from the PSX "Trailer Park" pack, converted in Blender: the trailer at the origin and
// what you can see from its windows); the remote is models/tv_remote.glb ("TV Remote - (PSX)" by Kasugay, CC-BY-4.0);
// the papers and both TV channels are drawn on canvases. Look around with the mouse (drag) or either stick.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { audioBus } from './audio.js';
import { LOTTERY } from './wcareer.js';
import { hash, paperCanvas, text, lines, barcode, sheet, paperMats } from './papers.js';
import { ClaimOffice } from './claimoffice.js';

const loader = new GLTFLoader(), loads = {};
const loadGlb = (url) => loads[url] || (loads[url] = loader.loadAsync(url).then(g => g.scene, () => null));
const roomUrl = () => (typeof window !== 'undefined' && window.__SVGP_TRAILER_GLB) || 'models/trailer.glb';

// sat on the couch (metres; the model's Y is up, the TV against the wall at x = 0.4, the couch at x = 3.1, the side
// table with the lamp on it at your left, z = 0.77)
const SEAT = new THREE.Vector3(3.0, 1.15, -0.5), TV_AT = new THREE.Vector3(0.36, 0.95, -0.35);
const SCREEN_AT = new THREE.Vector3(0.583, 0.882, -0.243), PILE_AT = new THREE.Vector3(2.93, 0.795, 0.6);
const FOV = 55;
const W = 320, H = 240; // the TV's picture

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const smooth = (k) => k * k * (3 - 2 * k);
const money$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pad2 = (n) => String(n).padStart(2, '0');
// a pseudo-random number from an integer (the crowd's speckle, the drum's balls)

// when the draw's balls come out (seconds into the lottery show), the last one after a long wait
const BALL_T = [7.5, 13, 18.5, 24.5, 31, 41.5];
const SHOW_END = BALL_T[5] + 8;

// ---------------------------------------------------------------- the papers --------------------------------------
// a race car side on (the magazine's cover photo, the TV's tracking shot)
function carSide(g, x, y, s, body, stripe, wheelRot = 0) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-78, 9, 156, 5); // shadow
  g.fillStyle = body;
  g.beginPath(); g.moveTo(-76, 4); g.lineTo(-74, -12); g.lineTo(-40, -16); g.lineTo(-22, -30); g.lineTo(18, -31); g.lineTo(38, -17);
  g.lineTo(74, -12); g.lineTo(80, -2); g.lineTo(78, 4); g.closePath(); g.fill();
  g.fillStyle = stripe; g.fillRect(-74, -8, 152, 5);
  g.fillStyle = '#1a2230'; g.beginPath(); g.moveTo(-18, -27); g.lineTo(15, -28); g.lineTo(31, -17); g.lineTo(-30, -16); g.closePath(); g.fill(); // glass
  g.fillStyle = '#111'; g.fillRect(-82, -24, 16, 4); g.fillRect(-74, -22, 3, 10); // wing
  g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(-4, -9, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.fillText('7', -4, -5);
  for (const wx of [-50, 52]) {
    g.fillStyle = '#0c0c0c'; g.beginPath(); g.arc(wx, 4, 12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a8a8a'; g.lineWidth = 2;
    for (let k = 0; k < 3; k++) { const a = wheelRot + k * Math.PI / 1.5; g.beginPath(); g.moveTo(wx, 4); g.lineTo(wx + Math.cos(a) * 7, 4 + Math.sin(a) * 7); g.stroke(); }
  }
  g.restore();
}

function magazine(name) {
  const [c, g] = paperCanvas(384, 512, '#14161c');
  const sky = g.createLinearGradient(0, 0, 0, 380); sky.addColorStop(0, '#1b2440'); sky.addColorStop(0.55, '#c8562b'); sky.addColorStop(1, '#f2b25a');
  g.fillStyle = sky; g.fillRect(0, 0, 384, 380);
  g.fillStyle = '#2a2730'; g.fillRect(0, 352, 384, 160);
  g.fillStyle = '#d43a2a'; for (let i = 0; i < 12; i++) g.fillRect(i * 36, 346, 18, 6);
  carSide(g, 196, 366, 2.05, '#e8e4da', '#d02a1a');
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 384, 104);
  g.font = '700 66px "SV Display", Arial'; const sw = g.measureText('SPEED ').width, ww = g.measureText('WEEKLY').width, fit = Math.min(1, 348 / (sw + ww));
  g.save(); g.translate(18, 66); g.scale(fit, 1);
  text(g, 'SPEED', 0, 0, '700 66px "SV Display", Arial', '#ff2b00'); text(g, 'WEEKLY', sw, 0, '700 66px "SV Display", Arial', '#fff');
  g.restore();
  text(g, 'No. 412  ·  $4.95', 366, 92, '500 14px "SV UI", Arial', '#fff', 'right');
  text(g, 'PRIVATEER SPECIAL', 18, 140, '700 22px "SV Display", Arial', '#ffc21a');
  text(g, 'Running a team on a shoestring:', 18, 164, '500 17px "SV UI", Arial', '#fff');
  text(g, 'we asked twelve owners how.', 18, 184, '500 17px "SV UI", Arial', '#fff');
  text(g, 'STREET CUP', 18, 226, '700 22px "SV Display", Arial', '#ffc21a');
  text(g, 'Who\'s in, who\'s broke', 18, 248, '500 17px "SV UI", Arial', '#fff');
  // the subscription label
  g.save(); g.translate(206, 430); g.rotate(-0.03);
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 162, 64);
  text(g, (name || 'Driver').toUpperCase(), 10, 20, '700 13px "Courier New", monospace', '#222');
  text(g, 'LOT 14, PALM ACRES', 10, 36, '700 12px "Courier New", monospace', '#222');
  text(g, 'LAST ISSUE: RENEW NOW', 10, 54, '700 12px "Courier New", monospace', '#b3261e');
  g.restore();
  barcode(g, 22, 440, 70, 44, 3);
  return c;
}

function divorce(name) {
  const [c, g] = paperCanvas(400, 566);
  const nm = (name || 'Driver').toUpperCase();
  text(g, 'SUPERIOR COURT OF THE STATE', 200, 40, '700 15px "Times New Roman", serif', '#1b1a18', 'center');
  text(g, 'COUNTY OF SAN VELOCITA', 200, 58, '700 15px "Times New Roman", serif', '#1b1a18', 'center');
  g.fillStyle = '#1b1a18'; g.fillRect(40, 70, 320, 1.5);
  text(g, 'JUDGMENT', 200, 104, '700 26px "Times New Roman", serif', '#1b1a18', 'center');
  text(g, 'DISSOLUTION OF MARRIAGE', 200, 128, '700 16px "Times New Roman", serif', '#1b1a18', 'center');
  text(g, `Respondent: ${nm}`, 40, 166, '500 14px "Times New Roman", serif');
  text(g, 'Case No. FL-0419-26', 360, 166, '500 14px "Times New Roman", serif', '#1b1a18', 'right');
  const item = (y, s) => text(g, s, 40, y, '500 14px "Times New Roman", serif');
  item(202, '1. The marriage is dissolved.');
  item(230, '2. The Petitioner is awarded: the house, the car,');
  item(248, '    the savings account, the dog, the friends.');
  item(276, '3. The Respondent is awarded: the television,');
  item(294, '    the couch and the trailer (lot fees owing).');
  lines(g, 40, 318, 320, 9, 12, 21);
  text(g, 'x', 92, 476, 'italic 22px "Times New Roman", serif');
  g.fillStyle = '#1b1a18'; g.fillRect(108, 478, 120, 1.2);
  text(g, 'Respondent', 108, 494, '500 12px "Times New Roman", serif');
  // her signature's already on it
  g.strokeStyle = '#1d3a8a'; g.lineWidth = 2; g.beginPath(); g.moveTo(250, 470);
  for (let i = 0; i < 9; i++) g.quadraticCurveTo(258 + i * 11, 450 + hash(i) * 30, 262 + i * 11, 468 - hash(i + 5) * 8);
  g.stroke(); g.fillStyle = '#1b1a18'; g.fillRect(250, 478, 110, 1.2);
  text(g, 'Petitioner', 250, 494, '500 12px "Times New Roman", serif');
  // the SIGN HERE flag and the staple
  g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(0, 456); g.lineTo(74, 456); g.lineTo(86, 470); g.lineTo(74, 484); g.lineTo(0, 484); g.fill();
  text(g, 'SIGN HERE', 6, 475, '700 12px Arial', '#5a4300');
  g.fillStyle = '#8d8d92'; g.save(); g.translate(24, 22); g.rotate(-0.6); g.fillRect(-11, -1.5, 22, 3); g.restore();
  return c;
}

function lateNotice() {
  const [c, g] = paperCanvas(400, 260, '#f6e9c8');
  g.fillStyle = '#1d3f9a'; g.fillRect(0, 0, 400, 58);
  text(g, 'VIDEO VAULT', 20, 41, '700 32px "SV Display", Arial', '#ffd21f');
  text(g, 'SECOND NOTICE', 382, 37, '700 15px Arial', '#fff', 'right');
  text(g, 'Our records show the following is overdue:', 20, 88, '500 15px Arial', '#2a2620');
  text(g, 'DAYS OF THUNDER (VHS)', 20, 120, '700 22px "Courier New", monospace', '#111');
  const row = (y, a, b) => { text(g, a, 20, y, '500 15px Arial', '#2a2620'); text(g, b, 380, y, '700 15px "Courier New", monospace', '#111', 'right'); };
  row(152, 'Days overdue', '41'); row(174, 'Late fees', '$61.50'); row(196, 'Rewind charge', '$1.00');
  text(g, 'Please return it. We only have the one.', 20, 236, 'italic 500 14px Arial', '#2a2620');
  return c;
}

// the ticket: its print, and a matching canvas of just the glow (black, the lit numbers bright)
function ticket(nums, lit, pulse) {
  const [c, g] = paperCanvas(300, 434, '#f7f4ee');
  const [gc, gg] = paperCanvas(300, 434, '#000');
  g.fillStyle = '#ff2b00'; g.fillRect(0, 0, 300, 70);
  text(g, 'SAN VELOCITA STATE LOTTERY', 150, 26, '700 15px "SV UI", Arial', '#fff', 'center');
  text(g, 'MEGA 6', 150, 60, '700 34px "SV Display", Arial', '#ffd21f', 'center');
  text(g, 'SAT  ·  DRAW 1742  ·  QUICK PICK', 150, 96, '500 13px "Courier New", monospace', '#222', 'center');
  g.fillStyle = '#222'; g.fillRect(16, 108, 268, 1);
  text(g, 'A', 22, 158, '700 18px "Courier New", monospace', '#222');
  nums.forEach((n, i) => {
    const x = 60 + i * 41, y = 158, on = lit.has(n);
    text(g, pad2(n), x, y, '700 24px "Courier New", monospace', on ? '#e85d00' : '#151515', 'center');
    if (on) { // (the glow layer adds light: a halo round the number and a thin ring, brighter as it lands)
      const k = (pulse.get(n) || 0);
      gg.save(); gg.shadowColor = '#ff9a2a'; gg.shadowBlur = 8 + k * 22;
      for (let j = 0; j < 3; j++) text(gg, pad2(n), x, y, '700 24px "Courier New", monospace', '#000', 'center');
      gg.shadowBlur = 6 + k * 10; gg.strokeStyle = `rgba(255,170,60,${0.55 + k * 0.45})`; gg.lineWidth = 1.5;
      gg.beginPath(); gg.arc(x, y - 8, 18, 0, Math.PI * 2); gg.stroke(); gg.restore();
    }
  });
  g.fillStyle = '#222'; g.fillRect(16, 182, 268, 1);
  text(g, '1 PLAY  ·  $1.00', 150, 208, '700 15px "Courier New", monospace', '#222', 'center');
  text(g, `JACKPOT ESTIMATE ${money$(LOTTERY.jackpot)}`, 150, 230, '500 13px "Courier New", monospace', '#222', 'center');
  barcode(g, 40, 252, 220, 46, 77);
  text(g, '0417 2290 1742 6618 0035', 150, 316, '500 12px "Courier New", monospace', '#222', 'center');
  const fine = ['Odds of winning the jackpot: 1 in 13,983,816.', 'Prizes must be claimed within 180 days.', 'Winnings over $600 are subject to state and', 'federal withholding. The State thanks you', 'for your contribution.'];
  fine.forEach((s, i) => text(g, s, 150, 346 + i * 15, '500 11px Arial', '#555', 'center'));
  return [c, gc];
}


// ---------------------------------------------------------------- the TV's sound ----------------------------------
// everything on the TV goes through a little speaker (band-limited); the room's sounds (the remote's click, your
// heartbeat, the ring in your ears at the end) don't
class TVSound {
  constructor() {
    const a = audioBus(); if (!a) return;
    const { ctx } = a; this.a = a; this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 240;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    this.out.connect(hp); hp.connect(lp); lp.connect(a.out);
    this.room = ctx.createGain(); this.room.gain.value = 1; this.room.connect(a.out);
    // the race: an engine note and a crowd
    this.eng = ctx.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 160;
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square'; this.eng2.frequency.value = 80;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    const eLp = ctx.createBiquadFilter(); eLp.type = 'lowpass'; eLp.frequency.value = 1400;
    this.eng.connect(eLp); this.eng2.connect(eLp); eLp.connect(this.engG); this.engG.connect(this.out);
    this.crowd = ctx.createBufferSource(); this.crowd.buffer = a.noise; this.crowd.loop = true;
    const cBp = ctx.createBiquadFilter(); cBp.type = 'bandpass'; cBp.frequency.value = 900; cBp.Q.value = 0.7;
    this.crowdG = ctx.createGain(); this.crowdG.gain.value = 0;
    this.crowd.connect(cBp); cBp.connect(this.crowdG); this.crowdG.connect(this.out);
    // the lottery show: a held synth chord (the studio's music bed)
    this.padG = ctx.createGain(); this.padG.gain.value = 0; this.padG.connect(this.out);
    this.pads = [220, 277.2, 329.6, 440.4].map((f, i) => { const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 6; o.connect(this.padG); return o; });
    // static
    this.snow = ctx.createBufferSource(); this.snow.buffer = a.noise; this.snow.loop = true;
    this.snowG = ctx.createGain(); this.snowG.gain.value = 0; this.snow.connect(this.snowG); this.snowG.connect(this.out);
    for (const o of [this.eng, this.eng2, this.crowd, this.snow, ...this.pads]) o.start();
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
  }
  now() { return this.ctx.currentTime; }
  set(g, v, tc = 0.15) { if (this.ctx) g.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }
  // a short note, to the TV or the room
  note(f, dur, vol, { type = 'sine', delay = 0, room = false, slide = 0 } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(room ? this.room : this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, f, vol, { delay = 0, room = false, q = 1 } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.a.noise; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(room ? this.room : this.out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  click() { this.note(2600, 0.025, 0.05, { type: 'square', room: true }); this.hiss(0.03, 3000, 0.05, { room: true }); }
  heartbeat(vol) { this.note(58, 0.16, vol, { room: true, slide: 0.7 }); this.note(52, 0.2, vol * 0.75, { room: true, slide: 0.7, delay: 0.26 }); }
  drumroll(dur) { for (let t = 0; t < dur; t += 0.05) this.hiss(0.06, 260, 0.02 + 0.05 * (t / dur), { delay: t, q: 2 }); }
  ballOut() { this.note(1046, 0.6, 0.05, { type: 'triangle' }); this.note(1568, 0.5, 0.03, { delay: 0.08 }); this.note(2093, 0.8, 0.025, { delay: 0.16 }); }
  match(k) { this.note(880 * Math.pow(2, k / 12), 1.1, 0.05, { room: true }); this.note(1760 * Math.pow(2, k / 12), 0.7, 0.015, { room: true }); this.note(110, 0.8, 0.07, { room: true, slide: 0.8 }); }
  ring() { this.note(3100, 7, 0.018, { room: true }); this.note(46, 2.2, 0.3, { room: true, slide: 0.6 }); }
  stop() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.25); this.room.gain.setTargetAtTime(0, t, 0.6);
    setTimeout(() => { for (const o of [this.eng, this.eng2, this.crowd, this.snow, ...this.pads]) try { o.stop(); } catch (e) {} this.out.disconnect(); this.room.disconnect(); }, 3000);
  }
}

// ---------------------------------------------------------------- the scene ---------------------------------------
export class Opening {
  constructor(renderer, post) {
    this.r = renderer; this.post = post;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 25, 70);
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.03, 200);
    this.scene.add(this.camera);
    this.yaw = 0; this.pitch = 0; this.drag = null; this.ready = false; this.t = 0; this.flash = 0; this.dim = 0;
    // night: a faint sky, the ceiling bulb, a table lamp, and the TV's glow
    this.hemi = new THREE.HemisphereLight(0x8090b0, 0x201810, 0.25);
    this.bulb = new THREE.PointLight(0xffd9a0, 6, 9, 1.6); this.bulb.position.set(1.7, 2.35, 1.0);
    this.lamp = new THREE.PointLight(0xffc27a, 3, 5, 1.8); this.lamp.position.set(3.1, 1.25, 0.8);
    this.glow = new THREE.PointLight(0x9fc0ff, 2.5, 5, 1.5); this.glow.position.set(0.9, 1.0, -0.35);
    const moon = new THREE.DirectionalLight(0x8ea4d0, 0.35); moon.position.set(-10, 12, 6);
    // (what you hold catches a little light)
    this.handLight = new THREE.PointLight(0xffe2b8, 0.5, 1.2, 2); this.handLight.position.set(0, -0.05, 0.05); this.camera.add(this.handLight);
    this.scene.add(this.hemi, this.bulb, this.lamp, this.glow, moon);
    // the TV's picture
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    this.tv = c; this.tvTex = new THREE.CanvasTexture(c); this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tvTex.magFilter = THREE.NearestFilter;
    this.office = new ClaimOffice(); // (where it goes after the draw)
    this.load();
  }

  load() {
    loadGlb(roomUrl()).then(m => {
      if (!m) return;
      m.traverse(o => {
        if (!o.isMesh) return;
        for (const mat of [].concat(o.material)) { if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestMipmapNearestFilter; } mat.metalness = 0; }
        if (/^TV\.?002$/.test(o.name)) { this.tvSet = o; this.fitScreen(o); } // (the TV by the couch; the loader drops the dot)
      });
      this.scene.add(m); this.ready = true;
    });
    loadGlb('models/tv_remote.glb').then(m => { if (m) this.fitRemote(m); });
  }

  // the screen: a plane just in front of the tube, on the TV's face towards the couch (+x). (Measured off the model:
  // the tube is the left-hand part of the front, the dials are on the right.)
  fitScreen() {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    scr.rotation.y = Math.PI / 2;
    scr.position.copy(SCREEN_AT);
    this.screen = scr; this.scene.add(scr);
  }

  // the remote, held in front of you: the model's own frame is turned and scaled by its Sketchfab wrapper, so take the
  // mesh alone (its node's axes run along the remote: y the length, z the thickness), centre it, and lay it pointing
  // away from you, buttons up, 17 cm long
  fitRemote(root) {
    let mesh = null; root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return;
    const node = mesh.parent; node.updateMatrix();
    const geo = mesh.geometry.clone(); geo.applyMatrix4(node.matrix);
    geo.computeBoundingBox(); const bb = geo.boundingBox, mid = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
    geo.translate(-mid.x, -mid.y, -mid.z);
    const s = 0.17 / size.y; geo.scale(s, s, s);
    geo.rotateX(-Math.PI / 2); geo.rotateZ(Math.PI); // (y, the length, now points away; the buttons, on -z, up)
    for (const mat of [].concat(mesh.material)) { if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestMipmapNearestFilter; } mat.metalness = 0; }
    this.remote = new THREE.Mesh(geo, mesh.material);
    this.remote.visible = false; this.camera.add(this.remote);
  }

  // the pile on the side table, top to bottom: the magazine, the divorce papers, the late notice, the ticket
  buildPile() {
    if (this.pile) for (const it of this.pile) it.obj.removeFromParent();
    paperMats.length = 0;
    const nm = this.name;
    const mag = sheet(magazine(nm), 0.21, 0.28, 0.005, 0xdedad0);
    const div = new THREE.Group(), d0 = sheet(divorce(nm), 0.21, 0.297, 0.0012);
    div.add(d0);
    for (let k = 1; k <= 3; k++) { const u = sheet(paperCanvas(8, 8)[0], 0.21, 0.297, 0.0012); u.position.set(k * 0.002, -k * 0.003, -k * 0.0014); u.rotation.z = (hash(k) - 0.5) * 0.04; div.add(u); }
    const vid = sheet(lateNotice(), 0.15, 0.0975, 0.0008);
    const tk = this.drawTicket(true);
    const items = [['magazine', mag, 0.34], ['divorce', div, 0.37], ['notice', vid, 0.21], ['ticket', tk, 0.19]];
    let y = PILE_AT.y;
    this.pile = items.reverse().map(([key, obj, hold], i) => {
      const thick = key === 'magazine' ? 0.005 : key === 'divorce' ? 0.006 : 0.0012;
      y += thick / 2;
      const p = new THREE.Vector3(PILE_AT.x + (hash(i + 9) - 0.5) * 0.03, y, PILE_AT.z + (hash(i + 3) - 0.5) * 0.03);
      y += thick / 2 + 0.0005;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, (hash(i + 1) - 0.5) * 0.7 + 1.5, 'XYZ'));
      obj.position.copy(p); obj.quaternion.copy(q); this.scene.add(obj);
      return { key, obj, hold, home: { p, q }, state: 'pile', from: null, k: 1 };
    }).reverse();
  }
  drawTicket(make) {
    const [c, gc] = ticket(this.nums, this.lit, this.pulse);
    if (make) {
      const t = sheet(c, 0.09, 0.13, 0.0006, 0xf2efe8);
      this.tkTex = t.userData.tex;
      this.glowTex = new THREE.CanvasTexture(gc); this.glowTex.colorSpace = THREE.SRGBColorSpace;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.13), new THREE.MeshBasicMaterial({ map: this.glowTex, color: new THREE.Color(2.6, 2.6, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.position.z = 0.0006; t.add(glow);
      return t;
    }
    this.tkTex.image = c; this.tkTex.needsUpdate = true; this.glowTex.image = gc; this.glowTex.needsUpdate = true;
  }

  // ---------------------------------------------------------- entering, leaving, input ----------------------------
  // opts: { name: your name (the papers are addressed to you), done: what happens after (or on skip), pad: () => true
  // when the last input was a pad (the prompts' button) }
  enter(opts = {}) {
    this.name = opts.name || 'Driver'; this.done = opts.done || null; this.isPad = opts.pad || (() => false);
    this.yaw = 0; this.pitch = 0; this.aim = null; this.t = 0; this.stageT = 0; this.lean = 0; this.fov = FOV; this.dim = 0; this.shake = 0; this.flash = 0;
    this.cur = undefined; this.busy = false; this.pressed = false; this.beatT = 0; this.rolled = new Set();
    // the numbers: a quick pick, drawn out in a different order
    const pool = Array.from({ length: 49 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.nums = pool.slice(0, 6).sort((a, b) => a - b); this.order = pool.slice(0, 6);
    this.lit = new Set(); this.pulse = new Map(); this.drawn = 0;
    this.channel = 'race'; this.tvT = 0; this.osd = 0; this.switchT = -1;
    this.balls = Array.from({ length: 22 }, (_, i) => ({ x: (hash(i) - 0.5) * 70, y: (hash(i + 40) - 0.5) * 70, vx: (hash(i + 80) - 0.5) * 60, vy: (hash(i + 120) - 0.5) * 60, n: 1 + Math.floor(hash(i + 7) * 49) }));
    this.buildPile();
    if (this.remote) this.remote.visible = false; this.remT = -1;
    this.ui = {
      root: document.getElementById('s-opening'), tag: document.getElementById('op-tag'), say: document.getElementById('op-say'),
      tag2: document.getElementById('op-tag2'), line: document.getElementById('op-line'), edgeL: document.getElementById('op-edge-l'), edgeR: document.getElementById('op-edge-r'), white: document.getElementById('op-white'), hint: document.querySelector('#s-opening .op-hint'),
    };
    this.ui.white.className = ''; this.ui.hint.textContent = `Esc / B  ${opts.skipLabel || 'Back'}`;
    this.say(''); this.fadeText(this.ui.line, ''); this.target = null; this.ended = false; this.result = null;
    this.stage = 'race';
    this.snd = new TVSound();
    const el = this.r.domElement;
    this.onDown = (e) => { this.drag = [e.clientX, e.clientY]; this.moved = 0; };
    this.onMove = (e) => { if (!this.drag) { if (this.stage === 'office') this.office.hover(this.pick(e.clientX, e.clientY, this.office.camera, this.office.forms.map(f => f.obj))); return; } const dx = e.clientX - this.drag[0], dy = e.clientY - this.drag[1]; this.moved += Math.abs(dx) + Math.abs(dy); if (this.free()) this.look(dx * -0.004, dy * -0.004); else if (this.stage === 'office') this.office.look(dx * -0.003, dy * -0.003); this.drag = [e.clientX, e.clientY]; };
    this.onUp = (e) => { if (this.drag && this.moved < 6) this.click(e.clientX, e.clientY); this.drag = null; };
    this.onTag = (e) => {
      e.stopPropagation();
      if (this.stage !== 'office') return this.activate();
      const f = this.office.forms[e.currentTarget === this.ui.tag2 ? 1 : 0]; if (this.office.stage === 'choose') this.office.pick(f);
    };
    el.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    this.ui.tag.addEventListener('pointerup', this.onTag); this.ui.tag2.addEventListener('pointerup', this.onTag);
  }
  leave() {
    const el = this.r.domElement;
    el.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    this.ui.tag.removeEventListener('pointerup', this.onTag); this.ui.tag2.removeEventListener('pointerup', this.onTag);
    this.ui.tag.classList.remove('on'); this.ui.tag2.classList.remove('on'); this.fadeText(this.ui.line, ''); this.office.leave(); this.ui.edgeL.classList.remove('on'); this.ui.edgeR.classList.remove('on');
    if (this.snd) { this.snd.stop(); this.snd = null; }
  }
  // Esc / B: skip (or, from the main menu's preview, back); at the claim office, with a form in your hand: put it back
  back() { if (this.stage === 'office' && this.office.back()) return; this.skip(); }
  skip() { if (this.ended) return; this.ended = true; this.leave(); if (this.done) this.done(this.result); }
  // left / right: between the forms
  nav(d) { if (this.stage === 'office') this.office.nav(d); }
  free() { return this.stage === 'race' || this.stage === 'turn'; }
  look(dy, dp) {
    this.aim = null;
    this.yaw = clamp(this.yaw + dy, -2.4, 2.4);
    this.pitch = clamp(this.pitch + dp, -0.7, 0.6);
  }
  // the yaw and pitch (relative to facing the TV) that look at a point
  aimAt(p) {
    const c = this.eye(), d = p.clone().sub(c), to = TV_AT.clone().sub(SEAT), base = Math.atan2(-to.x, -to.z);
    let y = Math.atan2(-d.x, -d.z) - base; y = Math.atan2(Math.sin(y), Math.cos(y));
    return { yaw: y, pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) + 0.08 };
  }
  eye() { const to = TV_AT.clone().sub(SEAT).setY(0).normalize(); return SEAT.clone().addScaledVector(to, this.lean); }

  // A / Enter: use what's prompted when it's in view, or turn towards it when it isn't
  confirm() {
    if (this.stage === 'office') return this.office.confirm();
    if (this.stage === 'pile') return this.next();
    if (!this.target) return;
    if (this.onScreen) this.activate(); else this.aim = { ...this.aimAt(this.target.at), k: 3 };
  }
  // what's under the pointer, of objs
  pick(x, y, cam, objs) {
    const r = this.r.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), cam);
    return ray.intersectObjects(objs, true).map(h => h.object);
  }
  click(x, y) {
    if (this.stage === 'office') return this.office.click(this.pick(x, y, this.office.camera, this.office.forms.map(f => f.obj)));
    if (this.stage === 'pile') return this.next();
    if (!this.target || !this.tagXY) return;
    const r = this.r.domElement.getBoundingClientRect(), [tx, ty] = this.tagXY;
    let hit = Math.hypot(x - tx, y - ty) < 150;
    if (!hit) hit = this.pick(x, y, this.camera, this.target.objs).length > 0;
    if (hit) this.activate();
  }
  activate() {
    if (!this.target) return;
    const t = this.target; this.target = null; t.go();
  }
  say(s) { this.fadeText(this.ui.say, s); }
  // a line of text that fades out, then in with what's new
  fadeText(el, s) {
    if (el.dataset.s === s) return;
    el.dataset.s = s; el.classList.remove('on');
    clearTimeout(el._t); if (s) el._t = setTimeout(() => { el.innerHTML = s; el.classList.add('on'); }, el.innerHTML ? 260 : 0);
  }
  btn() { return this.isPad() ? '<kbd class="pb a">A</kbd>' : 'Click'; }
  backBtn() { return this.isPad() ? '<kbd class="pb b">B</kbd>' : '<kbd>Esc</kbd>'; }

  // the claim office: after the draw's gone to black
  startOffice() {
    this.setStage('office'); this.ui.white.className = ''; this.target = null;
    this.office.start({ snd: this.snd, say: (s) => this.say(s), line: (s) => this.fadeText(this.ui.line, s), btn: () => this.btn(), back: () => this.backBtn(),
      done: (choice) => { this.result = choice ? { lottery: choice } : null; this.skip(); } });
  }

  // ---------------------------------------------------------- the story ------------------------------------------
  setStage(s) { this.stage = s; this.stageT = 0; }
  // look left, at the pile
  promptPile() {
    this.say('Look to your left.');
    this.target = { at: this.pile[0].home.p.clone().add(new THREE.Vector3(0, 0.03, 0)), label: 'The pile', objs: this.pile.map(i => i.obj), go: () => this.openPile() };
  }
  openPile() {
    this.setStage('pile'); this.say('');
    this.aim = { ...this.aimAt(PILE_AT), k: 2.2 };
    this.cur = -1; setTimeout(() => this.next(), 500);
  }
  // the next thing off the pile (the one you're holding goes on the couch, except the ticket: you keep that)
  next() {
    if (this.busy) return;
    const it = this.pile[this.cur];
    if (it) this.move(it, it.key === 'ticket' ? 'pocket' : 'away');
    this.cur++;
    if (this.cur >= this.pile.length) { this.promptTV(); return; }
    const n = this.pile[this.cur]; this.move(n, 'held');
    this.busy = true; setTimeout(() => { this.busy = false; }, 650);
    this.snd?.hiss(0.25, 2200, 0.025, { room: true });
    const last = n.key === 'ticket';
    this.say(last ? `${this.btn()} &nbsp;Keep hold of it` : `${this.btn()} &nbsp;Next`);
  }
  promptTV() {
    this.setStage('turn'); this.aim = null;
    this.say('Look back at the TV.');
    this.target = { at: TV_AT.clone().add(new THREE.Vector3(0, 0.1, 0)), label: 'The TV', objs: [this.screen, this.tvSet].filter(Boolean), go: () => this.useRemote() };
  }
  // the remote comes up, a press, the channel changes
  useRemote() {
    this.setStage('remote'); this.say('');
    this.aim = { ...this.aimAt(TV_AT), k: 2.5 };
    this.remT = 0;
  }

  move(it, state) {
    const o = it.obj, cam = this.camera;
    it.local = it.state !== 'pile' && state !== 'pile'; // (from one place in your hands to another: move with the camera)
    it.from = it.local ? { p: cam.worldToLocal(o.position.clone()), q: cam.quaternion.clone().invert().multiply(o.quaternion) } : { p: o.position.clone(), q: o.quaternion.clone() };
    it.state = state; it.k = 0;
    it.dur = state === 'held' ? 0.75 : state === 'raised' ? 1.6 : 0.6;
  }
  // where a thing goes, in the world, for its state (the held ones relative to the camera, which moves)
  poseOf(it) {
    const cam = this.camera;
    if (it.state === 'pile') return it.home;
    const L = {
      held: [0, 0.012 * it.hold / 0.3, -it.hold, -0.1, 0, 0.02],
      away: [0.42, -0.5, -0.45, -1.1, 0.4, -0.5],
      pocket: [-0.16, -0.24, -0.3, -0.7, 0.25, 0.15],
      raised: [-0.075, -0.042, -0.25, -0.12, 0.22, 0.07],
    }[it.state];
    const p = cam.localToWorld(new THREE.Vector3(L[0], L[1], L[2]));
    let rx = L[3], ry = L[4], rz = L[5];
    if (it.state === 'raised' || it.state === 'held') { // (your hands aren't still: worse as the numbers come in)
      const s = this.shake, t = this.t;
      p.add(new THREE.Vector3(Math.sin(t * 9.1) + Math.sin(t * 13.7) * 0.6, Math.sin(t * 11.3) + Math.sin(t * 7.9) * 0.5, 0).multiplyScalar(0.0006 + s * 0.0016).applyQuaternion(cam.quaternion));
      rz += Math.sin(t * 10.3) * (0.003 + s * 0.012); rx += Math.sin(t * 0.7) * 0.02;
    }
    const q = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)));
    return { p, q };
  }

  // ---------------------------------------------------------- per frame ------------------------------------------
  update(dt) {
    this.t += dt; this.stageT += dt;
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const p of pads) {
      const ax = Math.abs(p.axes[2] || 0) > 0.15 ? p.axes[2] : Math.abs(p.axes[0] || 0) > 0.2 ? p.axes[0] : 0;
      const ay = Math.abs(p.axes[3] || 0) > 0.15 ? p.axes[3] : Math.abs(p.axes[1] || 0) > 0.2 ? p.axes[1] : 0;
      if ((ax || ay) && this.free()) this.look(-ax * dt * 2, -ay * dt * 1.4);
      if ((ax || ay) && this.stage === 'office') this.office.look(-ax * dt * 0.8, -ay * dt * 0.6);
    }
    if (this.stage === 'office') { this.office.update(dt); return; }
    if (this.aim) { const k = 1 - Math.exp(-dt * this.aim.k); this.yaw += (this.aim.yaw - this.yaw) * k; this.pitch += (this.aim.pitch - this.pitch) * k; }
    const s = this.stage;
    if (s === 'race' && this.stageT > 3.5 && !this.target && this.cur === undefined) this.promptPile();
    if (s === 'remote') this.remoteTick(dt);
    if (this.remote && this.remT >= 0) { // (up, a press, back down)
      const t = this.remT += dt, R = this.remote;
      const up = smooth(clamp(t / 0.6, 0, 1)), down = smooth(clamp((t - 2.0) / 0.7, 0, 1)), press = t > 0.9 && t < 1.15 ? Math.sin((t - 0.9) / 0.25 * Math.PI) : 0;
      R.position.set(0.075, -0.33 + 0.235 * up - 0.3 * down - press * 0.006, -0.29);
      R.rotation.set(0.3 - press * 0.07, -0.1, 0.06);
      R.visible = down < 1; if (down >= 1) this.remT = -1;
    }
    if (s === 'draw' || s === 'end') this.drawTick(dt);
    // the TV
    this.tvT += dt; this.osd = Math.max(0, this.osd - dt);
    this.drawTV(dt);
    // the room's light follows the picture
    const tvLum = this.channel === 'lotto' ? 0.9 - this.dim * 0.35 : this.channel === 'snow' ? 1.4 : 1;
    this.glow.intensity = (2.2 + Math.sin(this.t * 23) * 0.25 + Math.sin(this.t * 7.3) * 0.2) * tvLum * (1 + this.flash * 1.5);
    this.glow.color.setHex(this.channel === 'lotto' ? 0xa8a0ff : 0x9fc0ff);
    this.bulb.intensity = 6 * (1 - this.dim * 0.92); this.lamp.intensity = 3 * (1 - this.dim * 0.85); this.hemi.intensity = 0.25 * (1 - this.dim * 0.75);
    this.handLight.intensity = 0.5 + this.dim * 0.25;
    const paper = 0.95 - this.dim * 0.4 + this.flash * 0.25;
    for (const m of paperMats) m.color.setScalar(paper);
    this.flash = Math.max(0, (this.flash || 0) - dt * 2.5);
    if (this.snd && this.snd.ctx) {
      const race = this.channel === 'race', sn = this.snd;
      sn.set(sn.engG, race ? 0.03 : 0, 0.08); sn.set(sn.crowdG, race ? 0.02 : 0, 0.08); sn.set(sn.padG, this.channel === 'lotto' ? 0.014 * (1 - this.dim * 0.5) : 0, 0.4); sn.set(sn.snowG, this.channel === 'snow' ? 0.05 : 0, 0.02);
      if (race) { const ph = (this.tvT * 0.37) % 1; sn.eng.frequency.setTargetAtTime(150 + ph * 120 + Math.sin(this.tvT * 2) * 6, sn.now(), 0.05); sn.eng2.frequency.setTargetAtTime(75 + ph * 60, sn.now(), 0.05); }
    }
  }

  remoteTick() {
    const t = this.stageT;
    if (t > 0.9 && !this.pressed) { this.pressed = true; this.snd?.click(); this.channel = 'snow'; this.tvT = 0; }
    if (t > 1.35 && this.channel === 'snow') { this.channel = 'lotto'; this.tvT = 0; this.osd = 2.5; this.setStage('draw'); this.drawn = 0; }
  }

  // the draw: the ticket comes up, the lights go down, the numbers come out
  drawTick(dt) {
    const t = this.tvT, tk = this.pile[this.pile.length - 1];
    if (this.stage === 'draw') {
      if (t > 2.2 && tk.state === 'pocket') this.move(tk, 'raised');
      this.dim = smooth(clamp((t - 2) / 8, 0, 1)) * 0.6 + smooth(clamp((t - BALL_T[4]) / 6, 0, 1)) * 0.4;
      this.lean = smooth(clamp((t - 3) / 30, 0, 1)) * 0.35 + smooth(clamp((t - BALL_T[4] - 2) / 7, 0, 1)) * 0.25;
      this.fov = FOV - smooth(clamp((t - 3) / 30, 0, 1)) * 9 - smooth(clamp((t - BALL_T[4] - 2) / 7, 0, 1)) * 6;
      this.shake = Math.min(1, this.lit.size / 6 + (t > BALL_T[4] + 2 ? 0.25 : 0));
      this.aim = { ...this.aimAt(SCREEN_AT.clone().add(new THREE.Vector3(0, -0.05, 0))), k: 1.5 };
      // the heart, from the third ball, quicker as it goes
      if (this.drawn >= 2) {
        const bpm = 70 + this.drawn * 9 + (t > BALL_T[4] + 2 ? 25 : 0);
        this.beatT = (this.beatT || 0) + dt;
        if (this.beatT > 60 / bpm) { this.beatT = 0; this.snd?.heartbeat(0.06 + this.drawn * 0.025); }
      }
      for (let i = 0; i < 6; i++) {
        if (this.drawn === i && t > BALL_T[i] - (i === 5 ? 4.5 : 1.6) && !this.rolled.has(i)) { this.rolled.add(i); this.snd?.drumroll(i === 5 ? 4.5 : 1.6); }
        if (this.drawn === i && t > BALL_T[i]) { this.drawn = i + 1; this.snd?.ballOut(); }
        const n = this.order[i];
        if (this.drawn > i && !this.lit.has(n) && t > BALL_T[i] + (i === 5 ? 2.0 : 1.0)) {
          this.lit.add(n); this.pulse.set(n, 1); this.flash = 0.6 + i * 0.08; this.snd?.match(i * 2);
        }
      }
      if (t > BALL_T[5] + 7) { this.setStage('end'); this.snd?.ring(); this.ui.white.className = 'flash'; this.snd?.set(this.snd.out, 0, 1.2); }
    } else if (this.stage === 'end') {
      if (this.stageT > 1.2 && this.ui.white.className === 'flash') this.ui.white.className = 'black';
      if (this.stageT > 4.2 && !this.ended) this.startOffice();
    }
    let any = false;
    for (const [n, v] of this.pulse) { const nv = Math.max(0, v - dt * 0.7); this.pulse.set(n, nv); any = any || v > 0; }
    if (any || this.litDrawn !== this.lit.size) { this.litDrawn = this.lit.size; this.drawTicket(false); }
  }

  // ---------------------------------------------------------- the TV's picture -----------------------------------
  drawTV(dt) {
    const g = this.tv.getContext('2d');
    if (this.channel === 'snow') this.drawSnow(g);
    else if (this.channel === 'lotto') this.drawLotto(g, this.tvT, dt);
    else this.drawRace(g, this.tvT);
    if (this.osd > 0) { g.font = '28px VT323, monospace'; g.textAlign = 'right'; g.fillStyle = '#5dff6a'; g.fillText('CH 07', W - 20, 34); }
    // scanlines and the tube's curve
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.tvTex.needsUpdate = true;
  }
  drawSnow(g) {
    const img = g.createImageData(W, H), d = img.data;
    for (let k = 0; k < d.length; k += 4) { const v = 70 + Math.random() * 185; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
    g.putImageData(img, 0, 0);
    const y = (this.tvT * 600) % H; g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y, W, 18);
  }

  // a race: a chase camera down the road, cut with a tracking shot alongside, the broadcast's graphics over it
  drawRace(g, t) {
    const shot = Math.floor(t / 5.5) % 2, pos = t * 55;
    const cars = [['#e8e4da', '#d02a1a'], ['#1f4fd8', '#ffd21f'], ['#1d1d22', '#3ad06a']];
    if (shot === 0) {
      const hor = 92, f = 170, camH = 1.6, k = Math.sin(pos * 0.0025) * 0.005;
      const sky = g.createLinearGradient(0, 0, 0, hor); sky.addColorStop(0, '#24345e'); sky.addColorStop(1, '#d88850');
      g.fillStyle = sky; g.fillRect(0, 0, W, hor);
      g.fillStyle = '#2b3348'; g.beginPath(); g.moveTo(0, hor);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, hor - 10 - Math.sin((x + k * 4000) * 0.04) * 6 - Math.sin(x * 0.11) * 3);
      g.lineTo(W, hor); g.fill();
      for (let y = H - 1; y > hor; y--) {
        const z = camH * f / (y - hor), cx = W / 2 + 0.5 * k * z * f, rw = 5.5 * f / z, band = Math.floor((z + pos) / 5) % 2;
        g.fillStyle = band ? '#34602a' : '#2d5524'; g.fillRect(0, y, W, 1);
        g.fillStyle = band ? '#d8d8d8' : '#c4281c'; g.fillRect(cx - rw * 1.12, y, rw * 2.24, 1);
        g.fillStyle = band ? '#5c5c62' : '#56565c'; g.fillRect(cx - rw, y, rw * 2, 1);
        if (band && z > 4) { g.fillStyle = '#d8d8d8'; g.fillRect(cx - rw * 0.02, y, Math.max(1, rw * 0.04), 1); }
      }
      // the cars, furthest first
      const list = [[28 + Math.sin(t * 0.3) * 6, Math.sin(t * 0.21) * 2, 2], [12 + Math.sin(t * 0.45) * 4, Math.sin(t * 0.33) * 1.8, 1], [5.5, Math.sin(t * 0.5) * 0.3, 0]];
      for (const [z, x, ci] of list) {
        const s = f / z, sy = hor + camH * f / z, sx = W / 2 + x * s + 0.5 * k * z * f, cw = 1.9 * s, ch = 0.9 * s;
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(sx - cw * 0.55, sy - ch * 0.1, cw * 1.1, ch * 0.15);
        g.fillStyle = '#0d0d0d'; g.fillRect(sx - cw * 0.5, sy - ch * 0.42, cw * 0.18, ch * 0.42); g.fillRect(sx + cw * 0.32, sy - ch * 0.42, cw * 0.18, ch * 0.42);
        g.fillStyle = cars[ci][0]; g.fillRect(sx - cw * 0.42, sy - ch * 0.9, cw * 0.84, ch * 0.62);
        g.fillStyle = cars[ci][1]; g.fillRect(sx - cw * 0.42, sy - ch * 0.5, cw * 0.84, ch * 0.08);
        g.fillStyle = '#1a2230'; g.fillRect(sx - cw * 0.28, sy - ch * 0.9, cw * 0.56, ch * 0.22);
        g.fillStyle = '#111'; g.fillRect(sx - cw * 0.5, sy - ch * 1.05, cw, ch * 0.1);
        g.fillStyle = '#ff3a2a'; g.fillRect(sx - cw * 0.38, sy - ch * 0.42, cw * 0.12, ch * 0.08); g.fillRect(sx + cw * 0.26, sy - ch * 0.42, cw * 0.12, ch * 0.08);
      }
    } else {
      const sky = g.createLinearGradient(0, 0, 0, 70); sky.addColorStop(0, '#2a3a66'); sky.addColorStop(1, '#c47a4c');
      g.fillStyle = sky; g.fillRect(0, 0, W, 70);
      g.fillStyle = '#3a3a44'; g.fillRect(0, 60, W, 82);
      const sc = pos * 9;
      for (let i = 0; i < 260; i++) { const x = ((i * 37 - sc * 0.5) % (W + 40) + W + 40) % (W + 40) - 20, y = 66 + (i % 13) * 6; g.fillStyle = ['#d8c6a8', '#c03a2a', '#e8e0d0', '#3a5aa8', '#f0c040'][i % 5]; g.fillRect(x, y, 3, 3); }
      g.fillStyle = '#9a9aa2'; for (let x = -(sc * 1.4) % 24; x < W; x += 24) g.fillRect(x, 136, 3, 22);
      g.fillStyle = '#9a9aa2'; g.fillRect(0, 140, W, 2);
      g.fillStyle = '#32602a'; g.fillRect(0, 158, W, 16);
      g.fillStyle = '#56565c'; g.fillRect(0, 174, W, 66);
      for (let x = -(sc * 1.6) % 40; x < W; x += 40) { g.fillStyle = '#c4281c'; g.fillRect(x, 172, 20, 5); g.fillStyle = '#e0e0e0'; g.fillRect(x + 20, 172, 20, 5); }
      const ci = Math.floor(t / 11) % 3;
      carSide(g, 160 + Math.sin(t * 1.3) * 6, 206 + Math.sin(t * 21) * 0.6, 1.25, cars[ci][0], cars[ci][1], -t * 30);
    }
    // the graphics: the order, the lap, the channel's bug
    const lap = 31 + Math.floor(t / 22);
    g.fillStyle = 'rgba(8,10,18,0.75)'; g.fillRect(12, 12, 96, 58);
    g.font = '15px VT323, monospace'; g.textAlign = 'left';
    [['1', 'HARLAND'], ['2', 'OKAFOR'], ['3', 'VIDAL']].forEach(([p, n], i) => { g.fillStyle = '#ffd21f'; g.fillText(p, 18, 28 + i * 16); g.fillStyle = '#fff'; g.fillText(n, 32, 28 + i * 16); });
    g.fillStyle = 'rgba(8,10,18,0.75)'; g.fillRect(W - 84, 12, 72, 20);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(`LAP ${lap}/48`, W - 48, 27);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '18px VT323, monospace'; g.textAlign = 'right'; g.fillText('SVTV', W - 16, H - 16);
  }

  // the lottery: a studio, the drum of balls, the six slots along the bottom; each ball gets a close-up
  drawLotto(g, t, dt) {
    const bg = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, W * 0.7);
    bg.addColorStop(0, '#3a2a8a'); bg.addColorStop(1, '#0c0828'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // the beams
    g.save(); g.globalAlpha = 0.08; g.fillStyle = '#c8b8ff';
    for (let i = 0; i < 6; i++) { const a = t * 0.3 + i * 1.05; g.beginPath(); g.moveTo(W / 2, -20); g.lineTo(W / 2 + Math.cos(a) * 420 - 30, H); g.lineTo(W / 2 + Math.cos(a) * 420 + 30, H); g.fill(); }
    g.restore();
    const title = (s, y, size, col = '#ffd21f') => { g.font = `700 ${size}px "SV Display", Arial`; g.textAlign = 'center'; g.fillStyle = col; g.fillText(s, W / 2, y); };
    if (t < 4) { // the opening titles
      title('SAN VELOCITA STATE LOTTERY', 70, 16, '#fff');
      title('MEGA 6', 130, 58 + Math.sin(t * 3) * 1.5);
      title('TONIGHT\'S JACKPOT', 168, 14, '#fff');
      title(money$(LOTTERY.jackpot), 196, 26);
      for (let i = 0; i < 14; i++) { const a = hash(i) * W, b = hash(i + 50) * H, tw = (Math.sin(t * 6 + i) + 1) / 2; g.fillStyle = `rgba(255,240,200,${tw})`; g.fillRect(a, b, 2, 2); }
      return;
    }
    // which ball's in close-up (2.2 s from when it comes out, longer for the last)
    const cl = this.order.findIndex((n, i) => t >= BALL_T[i] && t < BALL_T[i] + (i === 5 ? 3.4 : 2.2));
    const shown = BALL_T.filter((b, i) => t >= b + (i === 5 ? 3.4 : 2.2)).length;
    if (cl >= 0) {
      const k = clamp((t - BALL_T[cl]) / (cl === 5 ? 1.6 : 0.6), 0, 1), x = W / 2 + (1 - ease(k)) * 220, n = this.order[cl];
      g.save(); g.translate(x, H / 2 - 6);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 78, 60, 10, 0, 0, Math.PI * 2); g.fill();
      const bg2 = g.createRadialGradient(-22, -24, 6, 0, 0, 76); bg2.addColorStop(0, '#fffbe8'); bg2.addColorStop(0.5, '#ffd84a'); bg2.addColorStop(1, '#a86a00');
      g.fillStyle = bg2; g.beginPath(); g.arc(0, 0, 72, 0, Math.PI * 2); g.fill();
      // the number rolls round to face you
      const face = Math.cos((1 - ease(k)) * 3.2);
      g.scale(Math.max(0.05, face), 1);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#181010'; g.font = '700 50px "SV Display", Arial'; g.textAlign = 'center'; g.fillText(String(n), 0, 18);
      g.restore();
      g.font = '17px VT323, monospace'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(cl === 5 ? 'THE FINAL BALL' : `BALL ${cl + 1}`, W / 2, H - 14);
      return;
    }
    // the drum: the balls tumble, faster when one's about to come out
    const next = BALL_T.findIndex(b => b > t), soon = next >= 0 && BALL_T[next] - t < (next === 5 ? 4.5 : 1.6), kick = soon ? 260 : 90;
    const cx = W / 2, cy = 100, R = 62;
    g.strokeStyle = 'rgba(220,220,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(200,200,255,0.08)'; g.fill();
    for (const b of this.balls) {
      b.vx += (Math.random() - 0.5) * kick * dt * 8; b.vy += (Math.random() - 0.5) * kick * dt * 8 + 40 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const d = Math.hypot(b.x, b.y); if (d > R - 7) { const nx = b.x / d, ny = b.y / d, vn = b.vx * nx + b.vy * ny; b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; b.x = nx * (R - 7); b.y = ny * (R - 7); }
      const sp = Math.hypot(b.vx, b.vy), lim = soon ? 220 : 120; if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
      g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(cx + b.x, cy + b.y, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + b.x - 2, cy + b.y - 2, 2, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(220,220,255,0.5)'; g.fillRect(cx - 4, cy + R, 8, 14);
    title('MEGA 6', 26, 18);
    if (soon) { g.font = '20px VT323, monospace'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(next === 5 ? 'AND THE FINAL BALL...' : `BALL ${next + 1}`, cx, 186); }
    // the slots
    for (let i = 0; i < 6; i++) {
      const x = W / 2 - 100 + i * 40, y = 212, on = i < shown;
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.stroke();
      if (on) {
        g.fillStyle = '#ffd84a'; g.fill();
        g.fillStyle = '#181010'; g.font = '700 15px "SV Display", Arial'; g.textAlign = 'center'; g.fillText(String(this.order[i]), x, y + 5);
      }
    }
    if (t > BALL_T[5] + 3.4) { g.fillStyle = 'rgba(12,8,40,0.6)'; g.fillRect(0, 168, W, 22); g.font = '20px VT323, monospace'; g.fillStyle = '#ffd21f'; g.textAlign = 'center'; g.fillText(`JACKPOT ${money$(LOTTERY.jackpot)}`, cx, 185); }
  }

  // ---------------------------------------------------------- drawing --------------------------------------------
  render() {
    if (this.stage === 'office') { this.office.render(this.post, this.r.domElement.width / this.r.domElement.height); this.tag(); return; }
    const el = this.r.domElement, cam = this.camera;
    cam.aspect = el.width / el.height; cam.fov = this.fov ?? FOV; cam.updateProjectionMatrix();
    cam.position.copy(this.eye ? this.eye() : SEAT);
    const to = TV_AT.clone().sub(SEAT), base = Math.atan2(-to.x, -to.z);
    cam.rotation.set(this.pitch - 0.08, base + this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    // the things off the pile
    if (this.pile) for (const it of this.pile) {
      if (it.state === 'pile' && it.k >= 1) continue;
      const to2 = this.poseOf(it), o = it.obj;
      if (it.k < 1 && it.from) {
        it.k = Math.min(1, it.k + (this.lastDt || 1 / 60) / it.dur);
        const e = ease(it.k);
        if (it.local) {
          const toL = { p: cam.worldToLocal(to2.p.clone()), q: cam.quaternion.clone().invert().multiply(to2.q) };
          o.position.lerpVectors(it.from.p, toL.p, e); o.quaternion.slerpQuaternions(it.from.q, toL.q, e);
          o.position.applyMatrix4(cam.matrixWorld); o.quaternion.premultiply(cam.quaternion);
        } else {
          o.position.lerpVectors(it.from.p, to2.p, e); o.quaternion.slerpQuaternions(it.from.q, to2.q, e);
          if (it.state !== 'pile') o.position.y += Math.sin(e * Math.PI) * 0.04; // (lifted, not slid)
        }
      } else { o.position.copy(to2.p); o.quaternion.copy(to2.q); }
      o.visible = !(it.state === 'away' && it.k >= 1);
    }
    this.lastDt = Math.min(0.05, (performance.now() - (this.lastNow || performance.now())) / 1000) || 1 / 60; this.lastNow = performance.now();
    this.tag();
    this.post.render(this.scene, cam, { trails: 0, grade: [1.02, 1, 0.98] });
  }

  // the marker over what's prompted (or an arrow at the edge of the screen, the way to turn, when it's out of view)
  // (the claim office has two, one over each form; the selected one lit)
  tag() {
    const u = this.ui; if (!u) return;
    const office = this.stage === 'office', cam = office ? this.office.camera : this.camera;
    const list = office ? this.office.targets : this.target ? [this.target] : [];
    const r = this.r.domElement.getBoundingClientRect(), z = parseFloat(getComputedStyle(u.root).zoom) || 1; // (the screens are CSS-zoomed to fit the window)
    this.tagXY = null; this.onScreen = false;
    [u.tag, u.tag2].forEach((el, i) => {
      const T = list[i]; if (!T) { el.classList.remove('on'); return; }
      const v = T.at.clone().project(cam), x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
      const inView = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9;
      el.classList.toggle('on', inView);
      if (i === 0) { this.onScreen = inView; if (inView) this.tagXY = [x, y]; }
      if (!inView) return;
      el.style.left = x / z + 'px'; el.style.top = (y - 6 + Math.sin(this.t * 3 + i) * 3) / z + 'px';
      el.querySelector('b').textContent = T.label;
      el.querySelector('small').innerHTML = this.isPad() ? 'A' : 'Click';
      el.classList.toggle('hot', T.hot ? T.hot() : Math.abs(v.x) < 0.35 && Math.abs(v.y) < 0.45);
    });
    const T = !office && this.target, a = T && this.aimAt(T.at), left = T && a.yaw - this.yaw > 0;
    u.edgeL.classList.toggle('on', !!T && !this.onScreen && left); u.edgeR.classList.toggle('on', !!T && !this.onScreen && !left);
  }
}
