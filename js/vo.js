// Recorded voices (ElevenLabs clips made by tools/voice/gen.mjs from assets/voice/san_velocita_lines_with_announcer.txt):
// your race engineer on the radio, and the broadcast booth. assets/voice/manifest.json maps each line id to its clip;
// a line can have takes (id, id.2, id.3...) and one is picked at random.
// The engineer is recorded clean and goes through a team-radio chain here (band-limited, a little drive, a faint static
// bed, a squelch on key-up and key-down). The booth plays clean. The engineer always comes first: the booth dips under
// him. While anyone talks the music dips too (audio.js setMusicDuck), and comes back up slowly.
// Single-file build: the clips arrive inline in window.__SVGP_VOICE = { manifest, files: { 'eng/x.mp3': base64 } }
// (a page opened from disk can't read files beside it into Web Audio); otherwise they're fetched from assets/voice/.
import { audioBus, setMusicDuck } from './audio.js';

const embedded = () => (typeof window !== 'undefined' && window.__SVGP_VOICE) || null;
const DIR = 'assets/voice/';
let manifest = null, enabled = { eng: true, booth: true };
const loading = (async () => {
  try { manifest = embedded() ? embedded().manifest : await fetch(DIR + 'manifest.json').then(r => (r.ok ? r.json() : null)); }
  catch (e) { manifest = null; }
})();
export const voReady = () => loading;
// Options: the engineer's voice and the commentary can each be turned off
export function setVoiceOn(kind, on) { enabled[kind] = !!on; if (!on) stop(kind); }

const buffers = new Map(); // file -> Promise<AudioBuffer>
function buffer(file) {
  const bus = audioBus(); if (!bus) return Promise.resolve(null);
  if (!buffers.has(file)) {
    const E = embedded();
    const bytes = E ? Promise.resolve(Uint8Array.from(atob(E.files[file] || ''), c => c.charCodeAt(0)).buffer)
      : fetch(DIR + file).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(file))));
    buffers.set(file, bytes.then(b => bus.ctx.decodeAudioData(b)).catch(() => null));
  }
  return buffers.get(file);
}
// the takes of a line: id, id.2, id.3...
function takes(sec, id) {
  const S = manifest && manifest[sec]; if (!S) return [];
  return Object.keys(S).filter(k => k === id || (k.startsWith(id + '.') && /^\d+$/.test(k.slice(id.length + 1)))).map(k => S[k].file);
}
export const hasLine = (sec, id) => takes(sec, id).length > 0;
// decode a race's worth of lines ahead of time, so the first call isn't late
export function preload(sec) { if (manifest && manifest[sec]) for (const k in manifest[sec]) buffer(manifest[sec][k].file); }

// ---------- the radio chain (built once) ----------
let radio = null, boothOut = null;
function chains() {
  const bus = audioBus(); if (!bus) return false;
  if (radio) return true;
  const { ctx, out } = bus;
  const f = (type, freq, q = 0.7, gain = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = q; n.gain.value = gain; return n; };
  const hp1 = f('highpass', 380), hp2 = f('highpass', 380), lp1 = f('lowpass', 3300), lp2 = f('lowpass', 3300), mid = f('peaking', 1800, 1.2, 4);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.08;
  const drive = ctx.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.atan(x * 1.2) / Math.atan(1.2); }
  drive.curve = curve;
  const level = ctx.createGain(); level.gain.value = 1.9;
  hp1.connect(hp2); hp2.connect(lp1); lp1.connect(lp2); lp2.connect(mid); mid.connect(comp); comp.connect(drive); drive.connect(level); level.connect(out);
  radio = { input: hp1, ctx, out };
  boothOut = ctx.createGain(); boothOut.gain.value = 0.85; boothOut.connect(out);
  return true;
}
// band-limited noise: the static bed under the voice, and the squelch bursts
function noise(t0, dur, gain, lo = 500, hi = 3500, fade = 0.03) {
  const { ctx, out } = radio, bus = audioBus();
  const src = ctx.createBufferSource(); src.buffer = bus.noise; src.loop = true;
  const a = ctx.createBiquadFilter(); a.type = 'highpass'; a.frequency.value = lo;
  const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = hi;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.setValueAtTime(gain, t0 + Math.max(0.006, dur - fade)); g.gain.linearRampToValueAtTime(0, t0 + dur);
  src.connect(a); a.connect(b); b.connect(g); g.connect(out);
  src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  return src;
}

// ---------- playing ----------
const now = { eng: null, booth: null };   // what's playing: { src, extra[], ends }
const queue = [];                          // { kind, sec, id, at }
function stop(kind) {
  const p = now[kind]; if (!p) return;
  try { p.src.stop(); } catch (e) {}
  p.extra.forEach(s => { try { s.stop(); } catch (e) {} });
  now[kind] = null; settle();
}
// the music dips while anyone's talking; the booth dips under the engineer
function settle() {
  setMusicDuck(now.eng || now.booth ? 0.45 : 1);
  if (boothOut) boothOut.gain.setTargetAtTime(now.eng ? 0.3 : 0.85, radio.ctx.currentTime, 0.12);
}
async function start(kind, sec, id) {
  const files = takes(sec, id); if (!files.length || !chains()) return false;
  const buf = await buffer(files[Math.floor(Math.random() * files.length)]); if (!buf) return false;
  const { ctx } = radio, t0 = ctx.currentTime + 0.02;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const p = { src, extra: [], ends: t0 };
  if (kind === 'eng') {
    // key-up squelch, the voice, a faint static bed under it, key-down squelch
    p.extra.push(noise(t0, 0.07, 0.2, 900, 4500), noise(t0 + 0.04, buf.duration + 0.16, 0.012));
    src.connect(radio.input); src.start(t0 + 0.06);
    p.extra.push(noise(t0 + 0.11 + buf.duration, 0.11, 0.26, 900, 4500, 0.06));
    p.ends = t0 + 0.25 + buf.duration;
  } else { src.connect(boothOut); src.start(t0); p.ends = t0 + buf.duration; }
  stop(kind); now[kind] = p; settle();
  src.onended = () => setTimeout(() => { if (now[kind] === p) { now[kind] = null; settle(); next(); } }, kind === 'eng' ? 200 : 0);
  return true;
}
function next() {
  // what's waiting and still worth saying (a call that's 6 seconds stale is news nobody needs)
  const t = performance.now();
  while (queue.length && t - queue[0].at > 6000) queue.shift();
  const i = queue.findIndex(q => !now[q.kind] && !(q.kind === 'booth' && now.eng)); if (i < 0) return;
  const q = queue.splice(i, 1)[0]; start(q.kind, q.sec, q.id);
}
// The engineer says a line: o.urgent cuts in over whatever he's saying (box now, wing gone); otherwise it waits its turn.
export function engSay(id, o = {}) {
  if (!enabled.eng || !manifest || !hasLine('eng', id)) return;
  if (o.urgent || !now.eng) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'eng') queue.splice(i, 1); start('eng', 'eng', id); }
  else if (queue.filter(q => q.kind === 'eng').length < 2) queue.push({ kind: 'eng', sec: 'eng', id, at: performance.now() });
}
// The booth plays an exchange (both commentators in one take). Waits for the engineer; skips if they're mid-exchange
// unless o.force (a finish call beats whatever they were chatting about).
export function boothSay(id, o = {}) {
  if (!enabled.booth || !manifest || !hasLine('booth', id)) return;
  if (now.booth && !o.force) return;
  if (now.eng && !o.force) { queue.push({ kind: 'booth', sec: 'booth', id, at: performance.now() }); return; }
  start('booth', 'booth', id);
}
export const boothBusy = () => !!now.booth;
export function voStopAll() { queue.length = 0; stop('eng'); stop('booth'); }
// (for dev tools and tests: who's talking right now)
export const voState = () => ({ manifest: !!manifest, eng: !!now.eng, booth: !!now.booth, queued: queue.length });
