// dev: screenshots of a car's wheels and suspension in set situations (Auburn): two wheels up the sidewalk, parked;
// and a side-on hit into the wall, frame by frame after it (the far side's wheels lifting, every wheel tilting)
//   node .devtest/wheelshot.mjs [car] [outdir]   (V=<m/s> the side-on hit's speed, default 14)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', out = process.argv[3] || '/tmp';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (id) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'day'; t.env.barrier = 'wall';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player && window.__svgp.screen === 'hud', null, { timeout: 120000 }).catch(e => console.log('wait', e.message));
  await pg.waitForTimeout(2500);
  // freeze the game's own loop: steps only when asked (the scene keeps rendering)
  await pg.evaluate(() => {
    const sim = window.__svgp.sim, orig = sim.update.bind(sim);
    sim.state = 'racing'; sim.stateT = 99;
    window.__step = (n, ctl = {}) => { for (let k = 0; k < n; k++) orig(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...ctl }, {}); };
    sim.update = () => {};
    for (const e of document.body.querySelectorAll('*')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'; window.__svgp.sim.lineMesh && (window.__svgp.sim.lineMesh.visible = false);
  });
  await pg.evaluate((v) => { window.__V = v; }, +(process.env.V || 14)); // (the side-on hit's speed, m/s)
  const shot = async (name) => { await pg.waitForTimeout(250); await pg.screenshot({ path: `${out}/${id}-${name}.png` }); };
  // 1: parked, the left (+R? found by looking) wheels up the sidewalk
  const info = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, car = sim.player, p = car.phys;
    let i0 = -1, sW = 0;
    for (let i = Math.round(40 / T.ds); i < T.N && i0 < 0; i += 3) {
      if (Math.abs(T.B[i]) > 0.01) continue;
      for (let s = T.W[i] / 2; s < T.W[i] / 2 + 4; s += 0.05) if (sim.surfaceKind(i, s, T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s) === 'walk') { i0 = i; sW = s; break; }
    }
    const tw = p.susp.tw, s = sW + 1.1 - tw / 2;
    const h = Math.atan2(T.FX[i0], T.FZ[i0]);
    p.place(T.X[i0] + T.RX[i0] * s, T.Z[i0] + T.RZ[i0] * s, h); car.idx = i0; sim.updateTracker(car, true);
    window.__step(90);
    const x = p.x, z = p.z, y = car.y;
    // camera: in front, low, looking back at the car
    sim.updateCamera = function () { this.camera.position.set(x + T.FX[i0] * 4.2 - T.RX[i0] * 0.8, y + 0.55, z + T.FZ[i0] * 4.2 - T.RZ[i0] * 0.8); this.camera.lookAt(x, y + 0.35, z); };
    window.__step(1);
    return `walk from s=${sW.toFixed(2)} at i${i0}; wheels z ${Array.from(p.wz).map(v => v.toFixed(3))} roll ${(p.roll * 57.3).toFixed(1)}° loads ${Array.from(p.suspF).map(v => v.toFixed(0))}; wheels on screen (x, y, tilt°) ${car.model.wheels.map(w => `${w.pivot.position.x.toFixed(2)},${w.pivot.position.y.toFixed(3)},${(w.pivot.rotation.z * 57.3).toFixed(1)}`).join(' | ')}`;
  });
  console.log(info);
  await shot('sidewalk');
  // 2: side-on into the wall: the car slid sideways at it (the body jolts, the far side's wheels lift)
  const log = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, A = sim.A, car = sim.player, p = car.phys, i0 = Math.round(60 / T.ds), V = window.__V;
    const h = Math.atan2(T.FX[i0], T.FZ[i0]), s = A.BR[i0] - 2.2;
    p.place(T.X[i0] + T.RX[i0] * s, T.Z[i0] + T.RZ[i0] * s, h); car.idx = i0; sim.updateTracker(car, true);
    p.vx = T.RX[i0] * V; p.vz = T.RZ[i0] * V; // 50 km/h sideways
    sim.updateCamera = function () { const q = car.phys; this.camera.position.set(q.x - T.RX[i0] * 7 + T.FX[i0] * 1.5, car.y + 1.4, q.z - T.RZ[i0] * 7 + T.FZ[i0] * 1.5); this.camera.lookAt(q.x, car.y + 0.4, q.z); };
    const rows = [];
    for (let f = 0; f < 40; f++) { window.__step(1); rows.push(`${f} tilt ${car.model.wheels.map(w => (w.pivot.rotation.z * 57.3).toFixed(1)).join(',')} roll ${(p.roll * 57.3).toFixed(1)}° wz ${Array.from(p.wz).map(v => v.toFixed(3))} load ${Array.from(p.suspF).map((v, k) => (v + (k < 2 ? p.susp.nF : p.susp.nR)).toFixed(0))}`); }
    return rows;
  });
  console.log(log.filter((_, k) => k % 3 === 0).join('\n'));
  await pg.evaluate(() => { const sim = window.__svgp.sim, p = sim.player.phys, T = sim.T, i0 = Math.round(60 / T.ds), V = window.__V, s = sim.A.BR[i0] - 2.2, h = Math.atan2(T.FX[i0], T.FZ[i0]); p.place(T.X[i0] + T.RX[i0] * s, T.Z[i0] + T.RZ[i0] * s, h); sim.player.idx = i0; sim.updateTracker(sim.player, true); p.vx = T.RX[i0] * V; p.vz = T.RZ[i0] * V; });
  for (const f of [4, 4, 4, 8]) { await pg.evaluate((f) => window.__step(f), f); await shot(`wall-${f}-${Date.now() % 1000}`); }
} finally { await b.close(); server.kill(); }
