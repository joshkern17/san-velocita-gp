// Keyboard + gamepad input
const down = new Set();
const edges = new Set();
let gpPrev = [];
export const gp = { connected: false };
// the last device used, so on-screen prompts can show keyboard keys or pad buttons
export const device = { kind: 'kb', listeners: [] };
function useDevice(k) { if (k === 'pad') hideCursor(true); if (device.kind === k) return; device.kind = k; device.listeners.forEach(f => f(k)); }
// the mouse pointer goes as soon as a pad (or the wheel) is used, and comes back when the mouse really moves
// (a few px: Chrome sends a mousemove when the page changes under a still pointer) or is clicked
let cursorHidden = false, mx = null, my = null;
function hideCursor(on) { if (cursorHidden === on) return; cursorHidden = on; document.documentElement.classList.toggle('no-cursor', on); if (on) mx = null; }
export const onDevice = (f) => device.listeners.push(f);

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    useDevice('kb');
    if (!down.has(e.code)) edges.add(e.code);
    down.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
  window.addEventListener('pointerdown', () => { hideCursor(false); useDevice('kb'); });
  window.addEventListener('mousemove', (e) => {
    if (!cursorHidden) return;
    if (mx == null) { mx = e.screenX; my = e.screenY; return; }
    if (Math.abs(e.screenX - mx) + Math.abs(e.screenY - my) > 6) hideCursor(false);
  });
}

export const isDown = (c) => down.has(c);
export function pressed(c) { if (edges.has(c)) { edges.delete(c); return true; } return false; }
export function clearEdges() { edges.clear(); }

// the pad: the first controller that isn't the set-up wheel
function pad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected && !isWheelPad(p) && !(wheel.raw && (!wheel.rawId || p.id === wheel.rawId))) return p;
  return null;
}

// ---------------- racing wheels ----------------
// A wheel shows up as a "gamepad" whose axes and buttons differ by maker, so it's set up once by pressing things
// (Options > Wheel > Set Up Wheel): wheel.cfg = { id (the browser's name for it), steer { a, l, r } (axis, its value at
// full left and full right), thr / brk { a, rest, full }, btn { ok: { b } | { a, v }, … } (a button, or a hat switch read
// as an axis at value v) }. Its buttons then press the pad's: everything that reads GP0..GP15 works from the wheel.
// rot = the wheel's own rotation in degrees (the maker's control panel), lock = how far you turn it for full lock.
export const wheel = { cfg: null, on: true, rot: 900, lock: 360, raw: false, rawId: null }; // (raw: the setup screen is reading rawId, or every pad while it's finding the wheel)
export const WHEEL_BTNS = [ // [key, the pad button it stands for]
  ['ok', 0], ['back', 1], ['x', 2], ['y', 3], ['lb', 4], ['rb', 5], ['view', 8], ['menu', 9], ['up', 12], ['down', 13], ['left', 14], ['right', 15],
];
export const isWheelPad = (p) => !!(p && wheel.cfg && p.id === wheel.cfg.id);
// does the browser's name for a controller look like a wheel? (Thrustmaster, Logitech, Fanatec, Moza, or 'wheel' / 'racer')
export const looksLikeWheel = (id) => /wheel|racer|thrustmaster|044f|fanatec|0eb7|moza|346e|driving force|g29|g920|g923|g27|g25|simagic|cammus/i.test(id || '');
export function wheelPad() {
  if (!wheel.cfg || !wheel.on) return null;
  for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.connected && isWheelPad(p)) return p;
  return null;
}
export function allPads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : []; }
export function bindHit(p, b) {
  if (!p || !b) return false;
  if (b.b != null) return !!(p.buttons[b.b] && p.buttons[b.b].pressed);
  if (b.a != null) { const v = p.axes[b.a]; return v != null && Math.abs(v - b.v) < 0.1; }
  return false;
}
// a pedal 0..1 from its axis (a few % dead at each end, so a pedal at rest reads 0 and one on the floor reads 1).
// Chrome reports an axis as 0 until it first moves: an untouched pedal whose rest isn't 0 reads as released.
const moved = new Set();
export function pedal(p, c) {
  if (!p || !c) return 0;
  const v = p.axes[c.a]; if (v == null) return 0;
  if (v !== 0) moved.add(c.a + '|' + p.id); else if (!moved.has(c.a + '|' + p.id) && Math.abs(c.rest) > 0.2) return 0;
  const k = (v - c.rest) / ((c.full - c.rest) || 1);
  return Math.max(0, Math.min(1, (k - 0.03) / 0.94));
}
// the wheel's angle, -1 (full left) .. 1 (full right) of its own rotation
export function wheelAngle(p, c) {
  if (!p || !c) return 0;
  // (each side from the centre measured at setup: a wheel's axis isn't always symmetric. Older setups: the midpoint)
  const v = p.axes[c.a] ?? 0, mid = c.c ?? (c.l + c.r) / 2;
  const k = (v - mid) / (Math.sign(v - mid) === Math.sign(c.r - mid) ? (c.r - mid) : (mid - c.l)) || 0;
  return Math.max(-1, Math.min(1, k));
}
const wheelPrev = {};

// the left stick (x, y), deadzoned; zeros with no pad
export function leftStick(dz = 0.18) {
  const p = pad(); if (!p) return [0, 0];
  const f = (v) => Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
  return [f(p.axes[0] || 0), f(p.axes[1] || 0)];
}
// the right stick (x, y), deadzoned; zeros with no pad
export function rightStick(dz = 0.18) {
  const p = pad(); if (!p) return [0, 0];
  const f = (v) => Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
  return [f(p.axes[2] || 0), f(p.axes[3] || 0)];
}

// Right-stick shifting (manual gearbox): flick the stick up to shift up, down to shift down. A flick is the stick out
// past FLICK.out anywhere within FLICK.cone of straight up or down (so a sloppy diagonal still counts; a sideways push
// doesn't), and it re-arms once the stick is back inside FLICK.back. The stick's read on a fast timer as well as every
// frame, so a quick flick between two frames still counts and a run of quick ones (5th to 2nd) each count. For
// FLICK.bounce ms after a flicked stick is back in the centre, a flick the other way is ignored: a stick let go springs
// back past the centre.
// Each shift, and each spring-back ignored, goes in localStorage svgp.flickLog (serve.py mirrors it to saves/storage):
// the stick's x, y and how long it took from inside FLICK.back to out (ms). Logging only: it changes nothing.
// main.js turns it on (stickShift.on) while you drive with a manual box, and takes the counts each frame (takeFlicks).
const FLICK = { out: 0.6, back: 0.32, cone: 62 * Math.PI / 180, bounce: 90, every: 8, moved: 0.25, within: 100, drop: 0.3 };
export const stickShift = { on: false, up: 0, down: 0 };
let flickArmed = true, flickDir = 0, flickBack = 0, flickIn = 0, flickPeak = 0;
const flickHist = []; // ([time, x, y]: the last FLICK.within ms)
const flickLog = []; let flickLogged = 0;
function logFlick(e) {
  flickLog.push({ t: Math.round(performance.now()), ...e }); if (flickLog.length > 80) flickLog.shift();
  if (performance.now() - flickLogged > 500) { flickLogged = performance.now(); try { localStorage.setItem('svgp.flickLog', JSON.stringify(flickLog)); } catch (er) {} }
}
function sampleFlick() {
  if (!stickShift.on) return;
  const p = pad(); if (!p) return;
  const x = p.axes[2] || 0, y = p.axes[3] || 0, r = Math.hypot(x, y), now = performance.now();
  flickHist.push([now, x, y]); while (flickHist.length && now - flickHist[0][0] > FLICK.within) flickHist.shift();
  if (!flickArmed) flickPeak = Math.max(flickPeak, r);
  // (re-arms back near the middle, or once a flick's let go: FLICK.drop under the furthest it went, for a stick that
  // sits partly out after a creep)
  if (r < FLICK.back || (!flickArmed && r < flickPeak - FLICK.drop)) {
    if (!flickArmed) { flickArmed = true; flickBack = now; } // (let go: the spring-back window starts. Not when it next passes the middle: a
    // stick left partly up and flicked down later read as springing back, Road Atlanta's two missed downshifts)
    if (r < FLICK.back) { flickIn = now; flickHist.creep = false; }
    return;
  }
  if (!flickArmed || r < FLICK.out) return;
  // (a flick is quick: the stick moved FLICK.moved in the last FLICK.within ms (how far it went, not how far from the
  // middle: a flick down from a stick sitting up crosses the middle). The stick creeping out to the line
  // over ~1 s is not a shift (Road Atlanta, 2026-10-26: five upshifts nobody asked for, each at exactly 0.60 after
  // ~1000 ms; real flicks took 5-37 ms). It stays armed, so a real flick from there still counts)
  if (!flickHist.some(([, hx, hy]) => Math.hypot(x - hx, y - hy) >= FLICK.moved)) { if (!flickHist.creep) { flickHist.creep = true; logFlick({ x: +x.toFixed(2), y: +y.toFixed(2), ms: Math.round(now - flickIn), ok: false, why: 'creep' }); } return; }
  flickHist.creep = false;
  if (Math.atan2(Math.abs(x), Math.abs(y)) > FLICK.cone) return; // (0 = straight up / down)
  const d = y < 0 ? 1 : -1;
  flickArmed = false; flickPeak = r;
  const L = { x: +x.toFixed(2), y: +y.toFixed(2), ms: Math.round(now - flickIn), d };
  if (d !== flickDir && now - flickBack < FLICK.bounce) { logFlick({ ...L, ok: false }); return; } // (the spring-back from the last one)
  flickDir = d;
  if (d > 0) stickShift.up++; else stickShift.down++;
  logFlick({ ...L, ok: true });
  useDevice('pad');
}
setInterval(sampleFlick, FLICK.every);
export function setStickShift(on) {
  if (on === stickShift.on) return;
  stickShift.on = on; stickShift.up = stickShift.down = 0; flickArmed = false; // (a stick held when it turns on waits for the centre)
}
// the flicks since last asked: { up, down }
export function takeFlicks() {
  sampleFlick();
  const r = { up: stickShift.up, down: stickShift.down };
  stickShift.up = stickShift.down = 0;
  return r;
}

// virtual gamepad buttons become edge codes: GP0..GP15
export function pollGamepad() {
  const p = pad();
  gp.connected = !!p;
  pollWheel();
  if (!p) return null;
  p.buttons.forEach((b, i) => {
    const v = b.pressed;
    if (v && !gpPrev[i]) { edges.add('GP' + i); useDevice('pad'); }
    gpPrev[i] = v;
  });
  // stick as dpad edges for menus
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  const dir = ay < -0.6 ? 'U' : ay > 0.6 ? 'D' : ax < -0.6 ? 'L' : ax > 0.6 ? 'R' : '';
  if (dir && dir !== gp.lastDir) { edges.add('GPS' + dir); useDevice('pad'); }
  gp.lastDir = dir;
  return p;
}
// the set-up wheel's buttons as pad buttons (not while the set-up screen is reading it raw)
function pollWheel() {
  const w = wheelPad(); if (!w) return null;
  if (wheel.raw) return w;
  for (const [k, gpI] of WHEEL_BTNS) {
    const v = bindHit(w, wheel.cfg.btn && wheel.cfg.btn[k]);
    if (v && !wheelPrev[k]) { edges.add('GP' + gpI); useDevice('pad'); }
    wheelPrev[k] = v;
  }
  if (Math.abs(wheelAngle(w, wheel.cfg.steer)) > 0.05 || pedal(w, wheel.cfg.thr) > 0.1 || pedal(w, wheel.cfg.brk) > 0.1) gp.connected = true;
  return w;
}

// controller steering feel (Options > Driving): stick curve exponent (1 = linear), deadzone, smoothing time (s)
export const STEER_CURVES = { linear: 1, normal: 1.6, smooth: 2.2 };
export const DEADZONES = { small: 0.06, normal: 0.12, large: 0.2 };
export const STEER_LAGS = { quick: 0.03, normal: 0.05, smooth: 0.09 };
export const padFeel = { curve: 1.6, dz: 0.12, lag: 0.05, brake: 'linear' };
// brake trigger response: 'progressive' spreads the range where the tyres reach their limit (roughly 60-75% brake)
// over more of the trigger, so it's easier to hold without ABS; a full pull is still full brake. Points: [trigger, brake]
const BRAKE_PROG = [[0, 0], [0.25, 0.35], [0.9, 0.8], [1, 1]];
const brakeCurve = (x) => {
  if (padFeel.brake !== 'progressive') return x;
  for (let i = 1; i < BRAKE_PROG.length; i++) {
    const [x1, y1] = BRAKE_PROG[i];
    if (x <= x1) { const [x0, y0] = BRAKE_PROG[i - 1]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return 1;
};

export function driveControls(p) {
  let steer = 0, throttle = 0, brake = 0, handbrake = 0, analog = false, pad = false;
  if (isDown('ArrowLeft') || isDown('KeyA')) steer -= 1;
  if (isDown('ArrowRight') || isDown('KeyD')) steer += 1;
  if (isDown('ArrowUp') || isDown('KeyW')) throttle = 1;
  if (isDown('ArrowDown') || isDown('KeyS')) brake = 1;
  if (isDown('Space')) handbrake = 1;
  if (p) {
    let sx = p.axes[0] || 0;
    const dz = padFeel.dz;
    if (Math.abs(sx) > dz) {
      sx = Math.sign(sx) * ((Math.abs(sx) - dz) / (1 - dz));
      steer = Math.sign(sx) * Math.pow(Math.abs(sx), padFeel.curve);
      analog = pad = true;
    }
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    if (rt > 0.05) throttle = Math.max(throttle, rt);
    if (lt > 0.05) brake = Math.max(brake, brakeCurve(lt));
    if (p.buttons[2] && p.buttons[2].pressed) brake = 1;
    if (p.buttons[0] && p.buttons[0].pressed) handbrake = 1; // A / Cross (throttle is the trigger)
  }
  // the wheel: its angle over the lock you've set (turn 'lock' degrees for full lock), straight through like the AI's
  // stick (no smoothing: the rim is already smooth), and the pedals as they are
  const w = wheelPad();
  if (w && !wheel.raw) {
    const deg = wheelAngle(w, wheel.cfg.steer) * wheel.rot / 2, s = Math.max(-1, Math.min(1, deg / (wheel.lock / 2)));
    const t = pedal(w, wheel.cfg.thr), b = pedal(w, wheel.cfg.brk);
    if (Math.abs(s) > 0.004 || !pad) { steer = s; analog = true; pad = false; }
    throttle = Math.max(throttle, t); brake = Math.max(brake, b);
  }
  return { steer, throttle, brake, handbrake, analog, pad, lag: padFeel.lag };
}

// controller vibration (Chrome / Edge: 'dual-rumble' on Xbox and PlayStation pads). strong = the big low motor
// (impacts, slides, lock-ups), weak = the small fast one (kerbs, tyre scrub, ABS). Sent every ~50 ms while it changes.
// Only the window you're looking at rumbles: never a test browser (Playwright sets navigator.webdriver, and a headless
// Chrome still sees the real pad), a hidden tab or an unfocused window. Losing focus stops every pad at once.
let rumbleAt = 0, rumbleOn = false;
function rumbleStop() {
  rumbleOn = false;
  for (const p of navigator.getGamepads ? navigator.getGamepads() : []) {
    const a = p && p.vibrationActuator; if (!a) continue;
    try { a.reset ? a.reset() : a.playEffect('dual-rumble', { duration: 0, strongMagnitude: 0, weakMagnitude: 0 }); } catch (e) {}
  }
}
for (const ev of ['blur', 'pagehide']) window.addEventListener(ev, rumbleStop);
document.addEventListener('visibilitychange', () => { if (document.hidden) rumbleStop(); });
export function rumble(strong, weak) {
  const p = pad(), a = p && p.vibrationActuator; if (!a) return;
  strong = Math.min(1, Math.max(0, strong)); weak = Math.min(1, Math.max(0, weak));
  const now = performance.now(), live = !navigator.webdriver && !document.hidden && document.hasFocus();
  const on = live && (strong > 0.02 || weak > 0.02);
  if (!on) { if (rumbleOn) rumbleStop(); return; }
  if (now - rumbleAt < 50) return;
  rumbleAt = now; rumbleOn = true;
  try { a.playEffect('dual-rumble', { startDelay: 0, duration: 90, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {}); } catch (e) {}
}
