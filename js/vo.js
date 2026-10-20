// Recorded voices (ElevenLabs clips made by tools/voice/gen.mjs from assets/voice/san_velocita_lines_with_announcer.txt):
// your race engineer on the radio, and the broadcast booth. assets/voice/manifest.json maps each line id to its clip;
// a line can have takes (id, id.2, id.3...) and one is picked at random.
// The engineer is recorded clean and goes through a team-radio chain here (band-limited, a little drive, a faint static
// bed, a squelch on key-up and key-down). The booth plays clean. The engineer always comes first: the booth dips under
// him. While anyone talks the music dips too (audio.js setMusicDuck), and comes back up slowly.
// Single-file build: the clips arrive inline in window.__SVGP_VOICE = { manifest, files: { 'eng/x.mp3': base64 } }
// (a page opened from disk can't read files beside it into Web Audio); otherwise they're fetched from assets/voice/.
import { voiceBus as audioBus, setMusicDuck } from './audio.js'; // (the voices' own level: Options > Sound)

const embedded = () => (typeof window !== 'undefined' && window.__SVGP_VOICE) || null;
const DIR = 'assets/voice/';
let manifest = null, enabled = { eng: true, booth: true };
const loading = (async () => {
  try { manifest = embedded() ? embedded().manifest : await fetch(DIR + 'manifest.json').then(r => (r.ok ? r.json() : null)); }
  catch (e) { manifest = null; }
})();
export const voReady = () => loading;
// after recording something new (your own name, main.js): read the list of clips again
export async function voReload() { if (embedded()) return; try { const m = await fetch(DIR + 'manifest.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)); if (m) manifest = m; } catch (e) {} }
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
// the takes of a line: id, id.2, id.3... (exact: just that one)
function takes(sec, id, exact) {
  const S = manifest && manifest[sec]; if (!S) return [];
  if (exact) return S[id] ? [S[id].file] : [];
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
  now[kind] = null; settle(); p.done(false);
}
// the music dips while anyone's talking; the booth dips under the engineer
function settle() {
  setMusicDuck(now.eng || now.booth ? 0.45 : 1);
  if (boothOut) boothOut.gain.setTargetAtTime(now.eng ? 0.3 : 0.85, radio.ctx.currentTime, 0.12);
}
// plays a line; resolves when it's over (or cut off), false if there was nothing to play
async function start(kind, sec, id, exact) {
  const files = takes(sec, id, exact); if (!files.length || !chains()) return false;
  const buf = await buffer(files[Math.floor(Math.random() * files.length)]); if (!buf) return false;
  const { ctx } = radio, t0 = ctx.currentTime + 0.02;
  const src = ctx.createBufferSource(); src.buffer = buf;
  let done; const over = new Promise(r => { done = r; });
  const p = { src, extra: [], ends: t0, done };
  if (kind === 'eng') {
    // key-up squelch, the voice, a faint static bed under it, key-down squelch
    p.extra.push(noise(t0, 0.07, 0.2, 900, 4500), noise(t0 + 0.04, buf.duration + 0.16, 0.012));
    src.connect(radio.input); src.start(t0 + 0.06);
    p.extra.push(noise(t0 + 0.11 + buf.duration, 0.11, 0.26, 900, 4500, 0.06));
    p.ends = t0 + 0.25 + buf.duration;
  } else { src.connect(boothOut); src.start(t0); p.ends = t0 + buf.duration; }
  stop(kind); now[kind] = p; settle();
  src.onended = () => setTimeout(() => { done(true); if (now[kind] === p) { now[kind] = null; settle(); next(); } }, kind === 'eng' ? 200 : 0);
  return over;
}
function next() {
  // what's waiting and still worth saying (a call that's 6 seconds stale is news nobody needs)
  const t = performance.now();
  while (queue.length && t - queue[0].at > 6000) queue.shift();
  const i = queue.findIndex(q => !now[q.kind] && !(q.kind === 'booth' && now.eng)); if (i < 0) return;
  const q = queue.splice(i, 1)[0]; start(q.kind, q.sec, q.id, q.exact);
}
// The engineer says a line: o.urgent cuts in over whatever he's saying (box now, wing gone); otherwise it waits its turn.
export function engSay(id, o = {}) {
  if (!enabled.eng || !manifest || !hasLine('eng', id)) return;
  if (o.urgent || !now.eng) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'eng') queue.splice(i, 1); start('eng', 'eng', id); }
  else if (queue.filter(q => q.kind === 'eng').length < 2) queue.push({ kind: 'eng', sec: 'eng', id, at: performance.now() });
}
// The booth plays an exchange (both commentators in one take). Waits for the engineer; skips if they're mid-exchange
// unless o.force (a finish call beats whatever they were chatting about). o.exact: that take, not a random one of id's.
export function boothSay(id, o = {}) {
  if (!enabled.booth || !manifest || !takes('booth', id, o.exact).length) return;
  if (now.booth && !o.force) return;
  if (now.eng && !o.force) { queue.push({ kind: 'booth', sec: 'booth', id, exact: o.exact, at: performance.now() }); return; }
  start('booth', 'booth', id, o.exact);
}
// The pre-race broadcast: exchanges one after another, a short pause between (missing ones skipped). Resolves when
// it's over or cut off (stopBooth): true if it played to the end.
export async function boothSequence(ids, pause = 0.6) {
  if (!enabled.booth || !manifest) return false;
  seq = {};
  const mine = seq;
  for (const id of ids) {
    if (seq !== mine) return false;
    if (!takes('booth', id, true).length) continue;
    const ok = await start('booth', 'booth', id, true);
    if (!ok || seq !== mine) return false;
    await new Promise(r => setTimeout(r, pause * 1000));
  }
  return seq === mine;
}
let seq = null;
export function stopBooth() { seq = null; for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'booth') queue.splice(i, 1); stop('booth'); }
// the booth's recorded exchanges (the director only calls moments it has lines for)
export const boothLines = () => new Set(manifest && manifest.booth ? Object.keys(manifest.booth) : []);
// any section's recorded lines (the director's play-by-play pieces: 'pbp', the names: 'name')
export const lineSet = (sec) => new Set(manifest && manifest[sec] ? Object.keys(manifest[sec]) : []);

// ---------- play-by-play: a call stitched from pieces ----------
// (each clip carries a little silence at both ends: where its speech starts and stops, found once per clip)
const SPEECH = new WeakMap();
function speech(buf) {
  let r = SPEECH.get(buf); if (r) return r;
  const d = buf.getChannelData(0), th = 0.006; let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < th) a++;
  while (b > a && Math.abs(d[b]) < th) b--;
  r = [Math.max(0, a / buf.sampleRate - 0.02), Math.min(buf.duration, b / buf.sampleRate + 0.05)];
  SPEECH.set(buf, r); return r;
}
// the pause between two pieces: a name runs straight into what it did; a position or a second name a touch later
const pieceGap = (a, b) => b.startsWith('pbp.up.') ? 0.14 : a.startsWith('name.') ? 0.07 : 0.05;
// A live call: parts are line ids ('call.pass.valdez', 'pbp.sbs.2', 'pbpc.bold'), usually one, played back to back. It doesn't talk over anyone unless o.force (the win, a crash). Resolves when done.
export async function pbpSay(parts, o = {}) {
  if (!enabled.booth || !manifest || !parts.length) return false;
  if ((now.booth || now.eng) && !o.force) return false;
  const files = parts.map(id => { const S = manifest[id.split('.')[0]]; return S && S[id] && S[id].file; }); // (the section is the id's first word: call., pbp., pbpc.)
  if (files.some(f => !f) || !chains()) return false;
  const bufs = await Promise.all(files.map(buffer)); if (bufs.some(b => !b)) return false;
  if (now.eng && !o.force) return false;
  const { ctx } = radio; let t = ctx.currentTime + 0.03; const srcs = [];
  bufs.forEach((buf, i) => {
    const [s0, s1] = speech(buf), src = ctx.createBufferSource(); src.buffer = buf; src.connect(boothOut);
    src.start(t, s0, s1 - s0); srcs.push(src);
    t += s1 - s0 + (i < bufs.length - 1 ? pieceGap(parts[i], parts[i + 1]) : 0);
  });
  let done; const over = new Promise(r => { done = r; });
  const p = { src: srcs[srcs.length - 1], extra: srcs.slice(0, -1), ends: t, done };
  stop('booth'); now.booth = p; settle();
  p.src.onended = () => { done(true); if (now.booth === p) { now.booth = null; settle(); next(); } };
  return over;
}
// ---------- your engineer answering a question (radioask.js): whole sentences, one after another ----------
// parts: [engs] clip ids ('engs.pace.q.t4': "They're four tenths a lap quicker than you."), through the radio with a
// breath between sentences and one squelch either side. You asked, so it cuts in over whatever the engineer was
// saying. A sentence missing (not recorded yet): it stays text only.
const engGap = () => 0.28;
// a line's words, as recorded (no [direction] tags): the radio panel shows what he says
export const lineText = (id) => String(manifest?.[id.split('.')[0]]?.[id]?.text || '').replace(/\[[^\]]*\]\s*/g, '').trim();
export async function engSeq(parts) {
  if (!enabled.eng || !manifest || !parts || !parts.length) return false;
  const files = parts.map(id => { const S = manifest[id.split('.')[0]]; return S && S[id] && S[id].file; });
  if (files.some(f => !f) || !chains()) return false;
  const bufs = await Promise.all(files.map(buffer)); if (bufs.some(b => !b)) return false;
  // (at the speed recorded: played any quicker, the pitch goes up with it and he sounds like a chipmunk)
  const { ctx } = radio, t0 = ctx.currentTime + 0.02, RATE = 1; let t = t0 + 0.06; const srcs = [];
  bufs.forEach((buf, i) => {
    const [s0, s1] = speech(buf), src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = RATE; src.connect(radio.input);
    src.start(t, s0, s1 - s0); srcs.push(src);
    t += (s1 - s0) / RATE + (i < bufs.length - 1 ? engGap(parts[i], parts[i + 1]) : 0);
  });
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'eng') queue.splice(i, 1);
  stop('eng');
  let done; const over = new Promise(r => { done = r; });
  const extra = [...srcs.slice(0, -1), noise(t0, 0.07, 0.2, 900, 4500), noise(t0 + 0.04, t - t0 + 0.06, 0.012), noise(t + 0.05, 0.11, 0.26, 900, 4500, 0.06)];
  const p = { src: srcs[srcs.length - 1], extra, ends: t + 0.16, done };
  now.eng = p; settle();
  p.src.onended = () => setTimeout(() => { done(true); if (now.eng === p) { now.eng = null; settle(); next(); } }, 200);
  return over;
}
// anyone talking (the director waits)
export const voBusy = () => !!(now.eng || now.booth);
export const boothBusy = () => !!now.booth;
export function voStopAll() { queue.length = 0; seq = null; stop('eng'); stop('booth'); }
// (for dev tools and tests: who's talking right now)
export const voState = () => ({ manifest: !!manifest, eng: !!now.eng, booth: !!now.booth, queued: queue.length });
