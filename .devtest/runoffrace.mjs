// dev: AI cars racing a while: time each spends on each surface, laps, stuck cars   node .devtest/runoffrace.mjs [preset] [secs] [chassis]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9290 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 480, height: 270 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([name, ch]) => { const { presetTracks } = await import('/js/track.js'); const t = presetTracks().find(t => t.name === name); t.env.weather = 'clear';
    if (ch) window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: ch };
    window.__svgp.startRace(t, { mode: 'race', laps: 20, opponents: 5, car: window.__svgp.settings.car }, 'menu'); }, [process.argv[2] || 'Maple Ridge GP', process.argv[4] || '']);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1, null, { timeout: 120000 });
  if (process.env.DROP) await pg.evaluate(() => { window.__drop = 1; });
  await pg.evaluate(() => { const s = window.__svgp.sim; s.state = 'racing'; s.stateT = 0; s.goAt = 0; s.player.autoT = 1e9;
    window.__acc = new Map(); const tick = () => { for (const c of s.cars) { const m = window.__acc.get(c) || {}; m[c.surface] = (m[c.surface] || 0) + 1; window.__acc.set(c, m); } };
    setInterval(tick, 100);
    // DROP=1: the player's car (AI-driven) put 8 m into the gravel at the fastest corner, at 30 m/s along the track
    if (window.__drop) { const T = s.T, A = s.A, car = s.player, p = car.phys, Z = A.RZ;
      const c = Z.corners.reduce((m, c) => (Z.D[c.sg > 0 ? 0 : 1][c.a] > (m ? Z.D[m.sg > 0 ? 0 : 1][m.a] : -1) ? c : m), null);
      const i = c.a, side = c.sg > 0 ? -1 : 1, s0 = T.W[i] / 2 + 8;
      p.x = T.X[i] + T.RX[i] * side * s0; p.z = T.Z[i] + T.RZ[i] * side * s0; p.h = Math.atan2(T.FX[i], T.FZ[i]); p.vx = T.FX[i] * 30; p.vz = T.FZ[i] * 30; p.r = 0;
      car.idx = i; s.updateTracker(car, true); window.__trace = []; setInterval(() => window.__trace.push(car.surface + ':' + p.speed.toFixed(0)), 500); } });
  await pg.waitForTimeout(+(process.argv[3] || 60) * 1000);
  const r = await pg.evaluate(() => [...window.__acc].map(([c, m]) => ({ car: c.name || c.pid || (c.isPlayer ? 'you' : '?'), lap: c.lap, best: +(c.best || 0).toFixed(2), speed: +c.phys.speed.toFixed(0), ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +(v / 10).toFixed(1)])) })));
  for (const x of r) console.log(JSON.stringify(x));
  if (process.env.DROP) console.log('player trace', (await pg.evaluate(() => window.__trace)).join(' '));
} finally { await b.close(); server.kill(); }
