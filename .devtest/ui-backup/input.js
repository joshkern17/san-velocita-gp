// Keyboard + gamepad input
const down = new Set();
const edges = new Set();
let gpPrev = [];
export const gp = { connected: false };
// the last device used, so on-screen prompts can show keyboard keys or pad buttons
export const device = { kind: 'kb', listeners: [] };
function useDevice(k) { if (device.kind === k) return; device.kind = k; device.listeners.forEach(f => f(k)); }
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
  window.addEventListener('pointerdown', () => useDevice('kb'));
}

export const isDown = (c) => down.has(c);
export function pressed(c) { if (edges.has(c)) { edges.delete(c); return true; } return false; }
export function clearEdges() { edges.clear(); }

function pad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

// virtual gamepad buttons become edge codes: GP0..GP15
export function pollGamepad() {
  const p = pad();
  gp.connected = !!p;
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

export function driveControls(p) {
  let steer = 0, throttle = 0, brake = 0, handbrake = 0, analog = false;
  if (isDown('ArrowLeft') || isDown('KeyA')) steer -= 1;
  if (isDown('ArrowRight') || isDown('KeyD')) steer += 1;
  if (isDown('ArrowUp') || isDown('KeyW')) throttle = 1;
  if (isDown('ArrowDown') || isDown('KeyS')) brake = 1;
  if (isDown('Space')) handbrake = 1;
  if (p) {
    let sx = p.axes[0] || 0;
    const dz = 0.12;
    if (Math.abs(sx) > dz) {
      sx = Math.sign(sx) * ((Math.abs(sx) - dz) / (1 - dz));
      steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
      analog = true;
    }
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    if (rt > 0.05) throttle = Math.max(throttle, rt);
    if (lt > 0.05) brake = Math.max(brake, lt);
    if (p.buttons[2] && p.buttons[2].pressed) brake = 1;
    if (p.buttons[0] && p.buttons[0].pressed) handbrake = 1; // A / Cross (throttle is the trigger)
  }
  return { steer, throttle, brake, handbrake, analog };
}
