// dev: does any kerb fling you? Every 20 m round a lap, each side, a car at the speed a driver carries there (90% of
// the racing line's, up to 100 km/h) running wide over the edge onto the kerb and beyond (1.5 s): the hardest the body's thrown upwards (heave speed, m/s) and how high it heaves (m).
// PASS when nothing's thrown up faster than 2 m/s. Run it on every real / reference circuit after it's built. node .devtest/kerbfling.mjs [id]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const id = process.argv[2] || 'spa_ref';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([id, NOGROUND]) => {
    const R = await import('./js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
    if (NOGROUND && t.osm) t.osm.refGround = null; // (A/B: without the reference model's ground)
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
  }, [id, !!process.env.NOGROUND]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.T && window.__svgp.sim.player, null, { timeout: 300000 });
  const r = await pg.evaluate(async () => {
    const { surfaceY } = await import('./js/track.js');
    const s = window.__svgp.sim, T = s.T, pl = s.player, p = pl.phys, out = [];
    s.state = 'racing'; s.stateT = 0; s.goAt = 0; pl.autoT = 1e9;
    for (let i = 0; i < T.N; i += Math.round(20 / T.ds)) for (const side of [-1, 1]) {
      // (on the road 1 m in from the edge, drifting out over it at 1.5 m/s: as you'd run wide onto a kerb)
      // (at the speed a driver carries there: 90% of the racing line's, up to 100 km/h; flat out through a hairpin
      // isn't running wide onto a kerb, it's flying off into the runoff)
      const vl = s.lineV ? s.lineV[i] * 0.9 : 28;
      const sv = side * (T.W[i] / 2 - 1), v = Math.min(28, vl > 5 ? vl : 28), lat = 1.5, vx = T.FX[i] * v + T.RX[i] * side * lat, vz = T.FZ[i] * v + T.RZ[i] * side * lat;
      p.place(T.X[i] + T.RX[i] * sv, T.Z[i] + T.RZ[i] * sv, Math.atan2(vx, vz)); p.vx = vx; p.vz = vz; p.u = Math.hypot(vx, vz);
      s.updateTracker(pl, true);
      let up = 0, lift = 0;
      for (let f = 0; f < 90; f++) {
        s.update(1 / 60, { steer: 0, throttle: 0.4, brake: 0, handbrake: 0 }, {}); s.events.length = 0;
        up = Math.max(up, p.body.vz); lift = Math.max(lift, p.body.z);
      }
      out.push([Math.round(i * T.ds), side, +up.toFixed(2), +lift.toFixed(2)]);
    }
    return out;
  });
  const worst = [...r].sort((a, b) => b[2] - a[2]).slice(0, 10);
  // (pass: nowhere thrown up faster than 2 m/s: a kerb, a bank or the runoff, but never a launch)
  const fails = r.filter(x => x[2] > 2);
  console.log(fails.length ? `FAIL ${id}: thrown up at ${fails.map(([d, sd, u]) => `${d} m ${sd < 0 ? 'L' : 'R'} (${u} m/s)`).join(', ')}` : `PASS ${id}: no launch anywhere (hardest ${worst[0][2]} m/s)`);
  console.log(`${r.length} kerb runs · heave speed p50 ${[...r].sort((a, b) => a[2] - b[2])[r.length >> 1][2]} m/s · over 1 m/s: ${r.filter(x => x[2] > 1).length} · heave over 0.15 m: ${r.filter(x => x[3] > 0.15).length}`);
  console.log('hardest:', worst.map(([d, sd, u, l]) => `${d} m ${sd < 0 ? 'L' : 'R'} ${u} m/s (${l} m)`).join(', '));
} finally { await b.close(); server.kill(); }
