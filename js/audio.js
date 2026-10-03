// Synthesised audio: engines, tyres, wind, impacts, menu blips
import { ENGINES, REF_RPM, synthEngine, physOptions } from './engines.js';
import { ENGINE_WORKLET } from './engineworklet.js';
let ctx = null, master = null, sfxBus = null, noiseBuf = null, workletReady = null;
// engine sound: 'phys' = the physical model (engineworklet.js), 'loop' = the firing-pulse loops (engines.js)
let engineModel = 'phys';
export function setEngineModel(m) { engineModel = m; }
let volume = 0.7;

export function initAudio() {
  startMusic();
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  // the physical engine model runs in an AudioWorklet (loaded from a Blob: works in the single-file build too)
  if (ctx.audioWorklet) workletReady = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' })))
    .then(() => true).catch(e => { console.warn('engine worklet not loaded', e); return false; });
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
export const audioReady = () => !!ctx;

// ---------- soundtrack ----------
// assets/music/t1..t8 in order, then round again. A plain <audio> element rather than the Web Audio graph: it streams
// the MP3s, the engines' compressor doesn't pump it, and it plays from file:// in the single-file build (which sets
// window.__SVGP_MUSIC_DIR to the music/ folder beside the HTML).
export const SOUNDTRACK = ['Changing Light', 'The Web', 'Ligurian Dream', 'A Return From Ashes', 'Shades of Silver', 'Violet Vanish', 'Outlines', 'West Wind'];
const MUSIC_DIR = window.__SVGP_MUSIC_DIR || 'assets/music/';
let music = null, musicIdx = 0, musicVol = 0.5, musicFails = 0;
// The music sits under the game rather than on top of it: the slider is squared (so the low steps are really quiet)
// and each scene plays it at a share of that. Changes ease in and out, so nothing ever jumps.
const MUSIC_MIX = { silent: 0, menu: 0.8, pause: 0.55, grid: 0.12, race: 0.32 };
let musicScene = 'menu', musicLevel = 0;
function musicPlay() { if (music && musicVol > 0) music.play().catch(() => {}); } // blocked until a key / click: initAudio retries
function playTrack(i) {
  musicIdx = i % SOUNDTRACK.length;
  music.src = MUSIC_DIR + 't' + (musicIdx + 1) + '.mp3';
  musicPlay();
}
function startMusic() {
  if (music) { if (music.paused) musicPlay(); return; }
  music = new Audio(); music.volume = 0; // fades in from silence
  music.addEventListener('ended', () => playTrack(musicIdx + 1));
  music.addEventListener('playing', () => { musicFails = 0; });
  music.addEventListener('error', () => { if (++musicFails < SOUNDTRACK.length) playTrack(musicIdx + 1); }); // missing file: skip it
  playTrack(0);
}
export function setMusicVolume(v) { musicVol = v; if (v > 0 && music && music.paused) musicPlay(); }
// 'menu', 'pause', 'grid' (on the grid: the lights and engines take over) or 'race'
export function setMusicScene(s) { musicScene = s; }
// every frame: ease towards the scene's level. Dips in about a second, comes back up slowly (e.g. after the start).
export function updateMusic(dt) {
  if (!music) return;
  const target = musicVol * musicVol * (MUSIC_MIX[musicScene] ?? 1);
  musicLevel += (target - musicLevel) * Math.min(1, dt / (target < musicLevel ? 0.8 : 3.5));
  music.volume = Math.min(1, musicLevel);
  if (musicVol === 0 && musicLevel < 0.002 && !music.paused) music.pause();
}

function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

// ---------- engines ----------
// One voice = one engine: its pulse loops (engines.js) at the rpm, cross-faded on/off throttle, through the profile's
// distortion, exhaust resonances and a throttle-opened lowpass; plus intake roar, turbo whistle + blow-off, overrun
// crackle and (F1) hybrid whine. The player's voice also carries the tyres, wind and gravel.
const engineBufs = {};
function engineBuffer(id, mode) {
  const key = id + ':' + mode;
  if (!engineBufs[key]) {
    const data = synthEngine(ENGINES[id], ctx.sampleRate, mode);
    const b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.copyToChannel(data, 0);
    engineBufs[key] = b;
  }
  return engineBufs[key];
}
function shapeCurve(amount) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
  return c;
}

export class EngineVoice {
  constructor(player = true, profile = 'f1v6') {
    if (!ctx) return;
    this.player = player;
    this.model = engineModel === 'phys' && workletReady ? 'phys' : 'loop';
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    this.pan.connect(this.out); this.out.connect(master);
    // engine: on / off loops -> drive -> resonances -> lowpass -> level
    this.onG = ctx.createGain(); this.offG = ctx.createGain(); this.onG.gain.value = this.offG.gain.value = 0;
    this.drive = ctx.createWaveShaper();
    this.onG.connect(this.drive); this.offG.connect(this.drive);
    this.forms = [0, 1, 2].map(() => { const f = ctx.createBiquadFilter(); f.type = 'peaking'; f.gain.value = 0; return f; });
    this.drive.connect(this.forms[0]); this.forms[0].connect(this.forms[1]); this.forms[1].connect(this.forms[2]);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.9;
    this.forms[2].connect(this.lp);
    this.eng = ctx.createGain(); this.eng.gain.value = 0; this.lp.connect(this.eng); this.eng.connect(this.pan);
    // intake roar
    this.ind = noiseSrc(); this.indBp = ctx.createBiquadFilter(); this.indBp.type = 'bandpass'; this.indBp.Q.value = 1.2;
    this.indG = ctx.createGain(); this.indG.gain.value = 0;
    this.ind.connect(this.indBp); this.indBp.connect(this.indG); this.indG.connect(this.pan); this.ind.start();
    // turbo whistle, hybrid whine
    this.tw = ctx.createOscillator(); this.tw.type = 'sine'; this.twG = ctx.createGain(); this.twG.gain.value = 0;
    this.tw.connect(this.twG); this.twG.connect(this.pan); this.tw.start();
    this.wh = ctx.createOscillator(); this.wh.type = 'triangle'; this.whG = ctx.createGain(); this.whG.gain.value = 0;
    this.wh.connect(this.whG); this.whG.connect(this.pan); this.wh.start();
    // one-shots (blow-off, crackle)
    this.fx = ctx.createGain(); this.fx.connect(this.pan);
    this.load = 0; this.boost = 0; this.prevThr = 0; this.liftT = -9; this.lastT = ctx.currentTime;
    this.setProfile(profile);
    if (player) {
      // tyre squeal
      this.sq = noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 4;
      this.sqGain = ctx.createGain(); this.sqGain.gain.value = 0;
      this.sq.connect(bp); bp.connect(this.sqGain); this.sqGain.connect(master); this.sq.start();
      this.sqBp = bp;
      // wind / road
      this.wind = noiseSrc();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      this.wind.connect(lp); lp.connect(this.windGain); this.windGain.connect(master); this.wind.start();
      this.windLp = lp;
      // gravel rumble
      this.rum = noiseSrc();
      const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 180;
      this.rumGain = ctx.createGain(); this.rumGain.gain.value = 0;
      this.rum.connect(rl); rl.connect(this.rumGain); this.rumGain.connect(master); this.rum.start();
    }
  }
  // switch engine (the AI voices follow whichever cars are nearest)
  setProfile(id) {
    if (!ctx || !this.out) return;
    if (!ENGINES[id]) id = 'f1v6';
    if (id === this.profile) return;
    this.profile = id; const E = this.E = ENGINES[id];
    if (this.model === 'phys') {
      // (the worklet node arrives once the module has loaded; after that a profile change is just a message)
      if (this.core) { this.core.port.postMessage(physOptions(id)); this.physEq(); }
      else if (!this.coreWait) this.coreWait = workletReady.then(ok => {
        if (!ok || !this.out) { this.model = 'loop'; this.profile = null; return this.setProfile(id); }
        this.core = new AudioWorkletNode(ctx, 'svgp-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: physOptions(this.profile) });
        // body: saturation pushed harder on throttle (thickness, grit), a low-shelf boost (depth), a low-mid "throat"
        // bump (growl), a high-shelf cut (less tin), then the load lowpass
        this.push = ctx.createGain();
        this.thick = ctx.createWaveShaper(); this.thick.curve = shapeCurve(2.6);
        this.body = ctx.createBiquadFilter(); this.body.type = 'lowshelf'; this.body.frequency.value = 170;
        this.throat = ctx.createBiquadFilter(); this.throat.type = 'peaking'; this.throat.frequency.value = 320; this.throat.Q.value = 0.9;
        this.tame = ctx.createBiquadFilter(); this.tame.type = 'highshelf'; this.tame.frequency.value = 3000;
        this.core.connect(this.push); this.push.connect(this.thick); this.thick.connect(this.body); this.body.connect(this.throat);
        this.throat.connect(this.tame); this.tame.connect(this.lp);
        this.physEq();
      });
      return;
    }
    for (const s of [this.srcOn, this.srcOff]) if (s) { try { s.stop(); } catch (e) {} s.disconnect(); }
    const loop = (mode, g) => { const s = ctx.createBufferSource(); s.buffer = engineBuffer(id, mode); s.loop = true; s.connect(g); s.start(); return s; };
    this.srcOn = loop('on', this.onG); this.srcOff = loop('off', this.offG);
    this.drive.curve = shapeCurve(E.drive * (this.player ? 1 : 0.6));
    this.forms.forEach((f, k) => { const F = E.formants[k]; f.frequency.value = F ? F[0] : 1000; f.gain.value = F ? F[1] : 0; f.Q.value = F ? F[2] : 1; });
  }
  physEq() {
    const P = physOptions(this.profile);
    this.body.gain.value = P.body ?? 8; this.tame.gain.value = P.bright ?? -7; this.throat.gain.value = P.throat ?? 4.5;
  }
  update(p) {
    if (!ctx || !this.out) return;
    if (p.engine) this.setProfile(p.engine);
    const t = ctx.currentTime, dt = Math.min(0.1, Math.max(0, t - this.lastT)); this.lastT = t;
    const E = this.E, idle = p.idle || 4000, red = p.redline || 12500, thr = p.throttle || 0, lvl = p.gain ?? 1;
    const x = Math.max(0, Math.min(1.05, (p.rpm - idle) / Math.max(1, red - idle)));
    this.load += (thr - this.load) * (1 - Math.exp(-dt * 12));
    const L = this.load;
    if (this.model === 'phys') {
      if (this.core) {
        this.core.parameters.get('rpm').setTargetAtTime(p.rpm * (p.doppler || 1), t, 0.02);
        this.core.parameters.get('throttle').setTargetAtTime(L, t, 0.03);
        if (this.push) this.push.gain.setTargetAtTime(0.9 + 0.8 * L, t, 0.04); // (on throttle the saturation bites harder)
      }
    } else {
      const rate = Math.max(0.05, (p.rpm / REF_RPM) * (p.doppler || 1));
      this.srcOn.playbackRate.setTargetAtTime(rate, t, 0.02); this.srcOff.playbackRate.setTargetAtTime(rate, t, 0.02);
      this.onG.gain.setTargetAtTime(0.3 + 0.7 * L, t, 0.03);
      this.offG.gain.setTargetAtTime((1 - L) * 0.9, t, 0.03);
    }
    const lpK = this.model === 'phys' ? 0.75 : 1; // (the physical model: a darker top end)
    this.lp.frequency.setTargetAtTime(lpK * (E.lp[0] + (E.lp[1] - E.lp[0]) * (0.2 * x + 0.8 * L * (0.35 + 0.65 * x))), t, 0.04);
    this.eng.gain.setTargetAtTime((this.model === 'phys' ? 0.4 : E.gain) * (0.34 + 0.22 * L + 0.2 * x), t, 0.04);
    this.out.gain.setTargetAtTime(lvl * 0.55, t, 0.05);
    this.indBp.frequency.setTargetAtTime(350 + x * 2600, t, 0.05);
    this.indG.gain.setTargetAtTime(L * (0.015 + 0.05 * x) * (E.turbo ? 0.6 : 1), t, 0.05);
    if (this.pan.pan) this.pan.pan.setTargetAtTime(p.pan || 0, t, 0.05);
    // turbo: boost builds with throttle and revs, a whistle rising with it; lifting off with boost up = blow-off
    if (E.turbo) {
      const want = thr * Math.max(0, Math.min(1, (x - 0.12) / 0.4));
      this.boost += (want - this.boost) * (1 - Math.exp(-dt * (want > this.boost ? 2.2 : 7)));
      // (kept below ~3.5 kHz and soft: a pure tone up in the ear's most sensitive range was piercing)
      this.tw.frequency.setTargetAtTime(1100 + 2400 * this.boost, t, 0.05);
      this.twG.gain.setTargetAtTime(E.turbo * this.boost * this.boost * 0.03, t, 0.05);
      if (this.prevThr > 0.55 && thr < 0.25 && this.boost > 0.4) { this.blowOff(E.turbo * this.boost, E.flutter); this.boost *= 0.25; }
    } else this.twG.gain.setTargetAtTime(0, t, 0.05);
    // overrun crackle for a moment after lifting at high revs
    if (this.prevThr > 0.45 && thr < 0.1) this.liftT = t;
    if (E.pops && thr < 0.1 && x > 0.4 && t - this.liftT < 1.8 && Math.random() < dt * E.pops * 10) this.crackle(E.pops * (0.6 + Math.random() * 0.4));
    // hybrid / gear whine with road speed
    if (E.whine) { this.wh.frequency.setTargetAtTime(300 + (p.speed || 0) * 32, t, 0.05); this.whG.gain.setTargetAtTime(E.whine * 0.02 * Math.min(1, (p.speed || 0) / 25) * (0.4 + 0.6 * L), t, 0.05); }
    else this.whG.gain.setTargetAtTime(0, t, 0.05);
    this.prevThr = thr;
    if (this.player) {
      const sq = Math.max(0, Math.min(1, (p.slip - 0.1) * 3)) * Math.min(1, p.speed / 12);
      this.sqGain.gain.setTargetAtTime(sq * 0.14 * (p.onRoad ? 1 : 0.2), t, 0.05);
      this.sqBp.frequency.setTargetAtTime(1200 + sq * 800, t, 0.1);
      const w = Math.min(1, p.speed / 90);
      this.windGain.gain.setTargetAtTime(w * w * 0.22, t, 0.1);
      this.windLp.frequency.setTargetAtTime(300 + w * 1200, t, 0.1);
      this.rumGain.gain.setTargetAtTime((p.offRoad ? 0.35 : 0) * Math.min(1, p.speed / 20) + (p.kerb ? 0.25 : 0), t, 0.04);
    }
  }
  // pssh (with flutter: the compressor chattering against a closed throttle)
  blowOff(k, flutter = 0) {
    const t = ctx.currentTime, s = noiseSrc();
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.setValueAtTime(3200, t); hp.frequency.exponentialRampToValueAtTime(1400, t + 0.4); hp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(hp); hp.connect(g);
    if (flutter) {
      const am = ctx.createGain(), lfo = ctx.createOscillator(), dep = ctx.createGain();
      lfo.frequency.value = 22; dep.gain.value = 0.8 * flutter; am.gain.value = 0.2;
      lfo.connect(dep); dep.connect(am.gain); g.connect(am); am.connect(this.fx); lfo.start(t); lfo.stop(t + 0.5);
    } else g.connect(this.fx);
    s.start(t); s.stop(t + 0.5);
  }
  // one exhaust pop: a thud plus a crack
  crackle(k) {
    const t = ctx.currentTime, s = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + Math.random() * 2200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.05);
    s.connect(f); f.connect(g); g.connect(this.fx); s.start(t, Math.random()); s.stop(t + 0.12);
  }
  silence() {
    if (!this.out) return;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    if (this.sqGain) { this.sqGain.gain.setTargetAtTime(0, t, 0.05); this.windGain.gain.setTargetAtTime(0, t, 0.05); this.rumGain.gain.setTargetAtTime(0, t, 0.05); }
  }
  stop() {
    if (!this.out) return;
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    if (this.core) setTimeout(() => { try { this.core.port.postMessage('stop'); this.core.disconnect(); } catch (e) {} this.core = null; }, 300);
    const nodes = [this.srcOn, this.srcOff, this.ind, this.tw, this.wh, this.sq, this.wind, this.rum].filter(Boolean);
    setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 300);
  }
}

function tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}
function burst(dur, freq, vol, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = noiseSrc();
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
}

// a filtered noise sweep (whooshes)
function sweep(dur, f0, f1, vol, delay = 0, q = 1.5) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = noiseSrc();
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
}
// bell-ish note: sine + a quieter octave-and-a-fifth partial
function bell(freq, dur, vol, delay = 0) { tone(freq, dur, 'sine', vol, 0, delay); tone(freq * 3, dur * 0.5, 'sine', vol * 0.22, 0, delay); tone(freq * 2, dur * 0.7, 'triangle', vol * 0.18, 0, delay); }
// pentatonic steps above A4, for rising "score" sounds
const PENTA = [0, 2, 4, 7, 9];
const note = (step) => 440 * Math.pow(2, (PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);

// Drift pad: a soft chord that swells while a drift chain is alive, climbing with the multiplier
export class DriftPad {
  constructor() {
    if (!ctx) return;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; this.lp = lp;
    this.osc = [0, 7, 12].map((st, k) => {
      const o = ctx.createOscillator(); o.type = k === 2 ? 'sine' : 'triangle';
      o.frequency.value = 220 * Math.pow(2, st / 12); o.detune.value = (k - 1) * 6;
      const g = ctx.createGain(); g.gain.value = k === 2 ? 0.5 : 0.35; o.connect(g); g.connect(lp); o.start(); return o;
    });
    lp.connect(this.out); this.out.connect(sfxBus);
  }
  // level 0..1 (0 = silent), mult = multiplier (raises the pitch), graceK 0..1 (the chain fading between drifts)
  set(level, mult, graceK = 1) {
    if (!this.out) return;
    const t = ctx.currentTime, base = 196 * Math.pow(2, Math.min(12, Math.round((mult - 1) * 2)) / 12);
    this.osc.forEach((o, k) => o.frequency.setTargetAtTime(base * Math.pow(2, [0, 7, 12][k] / 12), t, 0.08));
    this.lp.frequency.setTargetAtTime(700 + level * 1600 + mult * 120, t, 0.1);
    this.out.gain.setTargetAtTime(level * graceK * 0.07, t, 0.12);
  }
  stop() { if (!this.out) return; this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); const os = this.osc; setTimeout(() => os.forEach(o => { try { o.stop(); } catch (e) {} }), 300); }
}

export const sfx = {
  // ---- drift scoring ----
  driftStart: () => sweep(0.35, 500, 2200, 0.05),
  driftTick: (step) => tone(note(step), 0.07, 'triangle', 0.035),
  driftMult: (mult) => { const s = Math.round(mult * 2); bell(note(s + 3), 0.35, 0.09); bell(note(s + 5), 0.45, 0.07, 0.07); },
  driftTransition: () => { sweep(0.45, 3000, 400, 0.09, 0, 2.5); [0, 2, 4, 7].forEach((s, i) => tone(note(s + 8), 0.12, 'square', 0.03, 0, 0.05 + i * 0.045)); },
  driftBonus: () => { [0, 4, 7, 9].forEach((s, i) => bell(note(s + 5), 0.3, 0.05, i * 0.05)); },
  driftBank: (k) => {
    // cash-in: rising major arpeggio + shimmer; bigger scores get more notes
    const n = 4 + Math.min(5, Math.floor(k * 5));
    for (let i = 0; i < n; i++) bell(note(i + 3), 0.5, 0.085, i * 0.055);
    burst(0.5, 9000, 0.04, n * 0.055); sweep(0.6, 4000, 9000, 0.03, n * 0.04, 3);
    tone(note(n + 3) / 4, 0.7, 'sine', 0.12, 0, n * 0.055);
  },
  driftLose: () => {
    burst(0.35, 900, 0.22);
    [0, 0.12, 0.24].forEach((d, i) => tone(330 - i * 70, 0.42, 'sawtooth', 0.05, 0.45, d));
    tone(110, 0.6, 'sine', 0.18, 0.5, 0.05);
  },

  move: () => tone(620, 0.06, 'square', 0.05),
  select: () => { tone(740, 0.07, 'square', 0.07); tone(1110, 0.12, 'square', 0.07, 0, 0.07); },
  back: () => { tone(520, 0.07, 'square', 0.06); tone(340, 0.12, 'square', 0.06, 0, 0.07); },
  light: () => tone(440, 0.28, 'sine', 0.2),
  go: () => { tone(880, 0.5, 'sine', 0.22); },
  lap: () => { tone(660, 0.1, 'triangle', 0.15); tone(880, 0.1, 'triangle', 0.15, 0, 0.1); tone(1320, 0.25, 'triangle', 0.15, 0, 0.2); },
  best: () => { [660, 830, 990, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.13, 0, i * 0.08)); },
  finish: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, 0, i * 0.14)); },
  hit: (k) => { burst(0.25, 400 + k * 800, Math.min(0.6, 0.1 + k * 0.5)); tone(90, 0.2, 'sine', Math.min(0.4, k * 0.4), 0.5); },
  scrape: () => burst(0.12, 2500, 0.08),
  shift: () => burst(0.04, 3000, 0.05),
  place: () => tone(980, 0.05, 'square', 0.05),
  del: () => tone(300, 0.08, 'square', 0.06, 0.6),
  error: () => { tone(200, 0.15, 'square', 0.08); tone(160, 0.2, 'square', 0.08, 0, 0.15); },
  // the career phone: a vibrate (low buzz pulses) and the old two-note message tone
  buzz: () => { for (let i = 0; i < 3; i++) tone(92, 0.16, 'sawtooth', 0.045, 0, i * 0.24); tone(1318, 0.07, 'square', 0.035, 0, 0.8); tone(1760, 0.1, 'square', 0.035, 0, 0.9); },
};
