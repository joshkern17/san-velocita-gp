// dev: on a reference model track, off the road: the physics' ground (surfaceY + groundZ) vs the model's visible
// ground (a ray down onto its meshes), per surface kind; and a car parked in gravel, settled: its wheels vs the gravel.
//   node .devtest/refground.mjs [id=spa_ref]
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
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async (id) => {
    const R = await import('./js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world && window.__svgp.sim.world.root.getObjectByName('refModel'), null, { timeout: 300000 });
  const r = await pg.evaluate(async () => {
    const THREE = await import('three'), { surfaceY } = await import('./js/track.js');
    const s = window.__svgp.sim, T = s.T, ref = s.world.root.getObjectByName('refModel'); ref.updateMatrixWorld(true);
    const ground = []; ref.traverse(o => { if (o.isMesh && /^(sand|grass|GRASS|asph|carpet|Parking|construction|sbancamento|road-ext)/.test(o.material.name || '')) ground.push(o); });
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), by = {}, spots = [];
    for (let i = 0; i < T.N; i += 5) for (const side of [-1, 1]) for (const t of [3, 6, 10, 15]) {
      const sv = side * (T.W[i] / 2 + t), x = T.X[i] + T.RX[i] * sv, z = T.Z[i] + T.RZ[i] * sv;
      const kind = s.surfaceKind(i, sv, x, z); if (!/grass|gravel|runoff/.test(kind)) continue;
      const phys = surfaceY(T, i, 0, sv) + s.groundZ(kind, i, sv, i * T.ds, x, z);
      ray.set(new THREE.Vector3(x, phys + 15, z), down); ray.far = 40;
      const h = ray.intersectObjects(ground, false)[0]; if (!h) continue;
      (by[kind] = by[kind] || []).push(phys - h.point.y);
      if (kind === 'gravel' && t === 6 && spots.length < 400) spots.push([i, sv, h.point.y]);
    }
    const q = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length * p)].toFixed(2); };
    const stats = Object.entries(by).map(([k, a]) => `${k}: n ${a.length}, physics minus model p5 ${q(a, 0.05)} p50 ${q(a, 0.5)} p95 ${q(a, 0.95)} m`);
    // a car parked in gravel, settled 2 s: its wheels' contact vs the gravel
    let settle = 'no gravel spot';
    if (spots.length) {
      const [i, sv, gy] = spots[Math.floor(spots.length / 2)], pl = s.player, p = pl.phys;
      s.state = 'racing'; s.stateT = 0; s.goAt = 0; pl.autoT = 1e9;
      p.place(T.X[i] + T.RX[i] * sv, T.Z[i] + T.RZ[i] * sv, Math.atan2(T.FX[i], T.FZ[i])); p.vx = p.vz = 0; p.u = 0;
      s.updateTracker(pl, true);
      for (let f = 0; f < 120; f++) { s.update(1 / 60, { steer: 0, throttle: 0, brake: 1, handbrake: 1 }, {}); s.events.length = 0; }
      const G = pl.ground, base = surfaceY(T, pl.idx, pl.f, pl.s);
      ray.set(new THREE.Vector3(p.x, base + 15, p.z), down); ray.far = 40; const h2 = ray.intersectObjects(ground, false)[0];
      const moved = Math.hypot(p.x - (T.X[i] + T.RX[i] * sv), p.z - (T.Z[i] + T.RZ[i] * sv));
      settle = `car in gravel at ${Math.round(i * T.ds)} m (moved ${moved.toFixed(1)} m while settling): ground under its centre ${(base + (G.z[0] + G.z[1] + G.z[2] + G.z[3]) / 4).toFixed(2)} vs the model's gravel there ${h2 ? h2.point.y.toFixed(2) : '?'} · body ${(pl.model ? pl.model.group.position.y : NaN).toFixed(2)} · surface ${s.surfaceKind(pl.idx, pl.s, p.x, p.z)}`;
    }
    return [...stats, settle].join('\n');
  });
  console.log(r);
} finally { await b.close(); server.kill(); }
