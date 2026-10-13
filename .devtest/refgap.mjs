// dev: how far a reference model's road surface is from the game's road (physics) around the lap: rays straight
// down onto the model's asphalt at the centre line and 3 m either side, every 10 m.  node .devtest/refgap.mjs [id]
// ALL=1: onto anything solid of the model (its material names don't say which is asphalt)
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
  await pg.evaluate(async (id) => {
    const R = await import('./js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world && window.__svgp.sim.world.root.getObjectByName('refModel'), null, { timeout: 300000 });
  const r = await pg.evaluate(async (ALL) => {
    const THREE = await import('three'), { surfaceY } = await import('./js/track.js');
    const s = window.__svgp.sim, T = s.T, ref = s.world.root.getObjectByName('refModel');
    ref.updateMatrixWorld(true);
    const road = []; ref.traverse(o => { if (o.isMesh && (ALL ? !o.material.transparent && !(o.material.alphaTest > 0) : /^(asph|groove|line)/.test(o.material.name || ''))) road.push(o); });
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), rows = [];
    const step = Math.round(10 / T.ds);
    for (let i = 0; i < T.N; i += step) for (const off of [-3, 0, 3]) {
      const x = T.X[i] + T.RX[i] * off, z = T.Z[i] + T.RZ[i] * off, y = surfaceY(T, i, 0, off);
      ray.set(new THREE.Vector3(x, y + 20, z), down); ray.far = 40;
      const h = ray.intersectObjects(road, false)[0];
      if (h) rows.push([Math.round(i * T.ds), off, +(y - h.point.y).toFixed(2)]);
    }
    return { n: rows.length, of: Math.ceil(T.N / step) * 3, rows };
  }, !!process.env.ALL);
  const d = r.rows.map(x => x[2]).sort((a, b) => a - b), q = (p) => d[Math.floor(d.length * p)];
  console.log(`hits ${r.n} of ${r.of} · game road minus model road: p5 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} m · min ${d[0]} max ${d[d.length - 1]}`);
  // the worst stretches
  const bad = r.rows.filter(x => Math.abs(x[2]) > 0.15);
  const runs = []; for (const x of bad) { const l = runs[runs.length - 1]; if (l && x[0] - l.to <= 20) { l.to = x[0]; l.worst = Math.abs(x[2]) > Math.abs(l.worst) ? x[2] : l.worst; } else runs.push({ from: x[0], to: x[0], worst: x[2] }); }
  console.log('stretches off by > 15 cm:', runs.map(u => `${u.from}-${u.to} m (${u.worst})`).join(', ') || 'none');
} finally { await b.close(); server.kill(); }
