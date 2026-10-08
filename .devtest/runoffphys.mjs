// dev: what a car feels on the runoff: surface under the wheels, and speed lost coasting 1 s from 30 m/s
//   node .devtest/runoffphys.mjs [preset name]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9090 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async (name) => { const { presetTracks } = await import('/js/track.js'); const t = presetTracks().find(t => t.name === name);
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu'); }, process.argv[2] || 'Maple Ridge GP');
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player && window.__svgp.sim.A.run, null, { timeout: 120000 });
  const out = await pg.evaluate(async () => {
    const s = window.__svgp.sim, T = s.T, A = s.A, car = s.player, p = car.phys, N = T.N;
    const { runoffKind } = await import('/js/runoff.js');
    const res = [];
    // for each kind of ground, a spot where it carries on 10 m ahead: the car along the track at 30 m/s, coasting 0.25 s
    const want = new Set([0, 1, 2]);
    for (let i = 0; i < N && want.size; i += 3) for (const sd of [0, 1]) for (let t = 1.5; t < A.run.reach[sd][i] - 2; t += 1) {
      const k = runoffKind(A.run, i, sd, t); if (!want.has(k)) continue;
      let same = true; for (let a = 1; a <= 6; a++) if (runoffKind(A.run, (i + a) % N, sd, t) !== k || runoffKind(A.run, (i + a) % N, sd, t - 1.2) !== k || runoffKind(A.run, (i + a) % N, sd, t + 1.2) !== k) same = false;
      if (!same || A.KERB[i] || Math.abs(T.K[i]) > 1 / 200) continue;
      want.delete(k);
      const side = sd ? 1 : -1, s0 = T.W[i] / 2 + t;
      p.x = T.X[i] + T.RX[i] * side * s0; p.z = T.Z[i] + T.RZ[i] * side * s0; p.h = Math.atan2(T.FX[i], T.FZ[i]);
      p.vx = T.FX[i] * 30; p.vz = T.FZ[i] * 30; p.r = 0; car.idx = i; s.updateTracker(car, true);
      const env = s.surfaceEnv(car), surf = car.surface, onRoad = car.onRoad;
      const wheels = [...Array(4)].map((_, w) => env.wheels.mu[w].toFixed(2) + '/' + env.wheels.drag[w] + '@' + env.wheels.z[w].toFixed(3)).join(' ');
      for (let n = 0; n < 60; n++) { p.step(1 / 240, { steer: 0, throttle: 0, brake: 0 }, s.surfaceEnv(car)); s.updateTracker(car); }
      res.push({ kind: ['ground', 'paved', 'gravel'][k], i, t, surface: surf, onRoad, wheels, decel_g: +((30 - Math.hypot(p.vx, p.vz)) / 0.25 / 9.81).toFixed(2), endSurface: car.surface });
      break;
    }
    return res;
  });
  for (const r of out) console.log(JSON.stringify(r));
} finally { await b.close(); server.kill(); }
