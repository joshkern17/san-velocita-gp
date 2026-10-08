// Force feedback for racing wheels: browsers can't drive a wheel's motor, so a small helper on the same computer does
// (tools/wheelffb: "Start Wheel FFB.bat" on Windows). The game sends it the force it wants about 60 times a second
// over a local WebSocket: { f: -1..1 constant force (+ = toward the right), d: 0..1 damper, s: 0..1 spring }.
// With the helper not running nothing happens (it's tried again every few seconds while force feedback is on).
const URL = 'ws://127.0.0.1:8766';
export const ffb = { on: false, live: false, wheel: null };
let ws = null, retryAt = 0, sent = '', sentAt = 0;

function connect() {
  if (ws || performance.now() < retryAt) return;
  retryAt = performance.now() + 3000;
  try { ws = new WebSocket(URL); } catch (e) { ws = null; return; }
  ws.onopen = () => { ffb.live = true; ws.send(JSON.stringify({ hello: 1 })); };
  ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if ('wheel' in m) ffb.wheel = m.wheel; } catch (er) {} };
  ws.onclose = ws.onerror = () => { ffb.live = false; ws = null; };
}

// every frame: the force (0 when off); sends when it changes, and at least every 200 ms so the helper knows the game's
// still here (it lets go of the wheel after half a second of silence)
export function ffbSend(f, d = 0, s = 0) {
  if (!ffb.on) { if (ws && ffb.live && sent !== '0') { ws.send('{"f":0,"d":0,"s":0}'); sent = '0'; } return; }
  connect();
  if (!ws || !ffb.live || ws.readyState !== 1) return;
  const m = `{"f":${f.toFixed(3)},"d":${d.toFixed(2)},"s":${s.toFixed(2)}}`, now = performance.now();
  if (m === sent && now - sentAt < 200) return;
  ws.send(m); sent = m; sentAt = now;
}
