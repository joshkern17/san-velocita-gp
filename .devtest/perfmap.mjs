// Where on the lap the frames get heavy (needs Chrome + tools/node_modules). Starts its own server.
//
//   .devtest/guard.sh -t 240 node .devtest/perfmap.mjs ["track name" | track.json] [step m]
//     default: the saved track "Auburn GP2" from saves/storage/svgp.tracks.txt, a station every 40 m
// A fixed chase camera (6 m back, 2.5 m up, looking 30 m ahead) is set at each station round the lap while the game
// runs as normal (shadows, mirror, post); for each it reports the frame time with the GPU waited on, draw calls
// (main view / shadow map / mirror), triangles, and at the worst stations what the calls are spent on (by the
// scene's top-level group and object name). SET='{"shadows":false}' game settings for the run.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const [which = 'Auburn GP2', step = '40'] = process.argv.slice(2);
let track;
if (which.endsWith('.json')) track = JSON.parse(readFileSync(which, 'utf8'));
else { const all = JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8')); track = (Array.isArray(all) ? all : Object.values(all)).find(t => t.name === which); }
if (!track) throw new Error('no track ' + which);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(process.env.SERVE || ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  await pg.waitForTimeout(1500);
  await pg.evaluate(async ({ track, set }) => {
    const G = window.__svgp; Object.assign(G.settings, set); (await import('/js/world.js')).setWorldOptions({ shadows: G.settings.shadows });
    G.startRace(track, { mode: 'test', laps: 9, opponents: 0 }, 'setup');
  }, { track, set: JSON.parse(process.env.SET || '{}') });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  if (process.env.RANGE) await pg.evaluate(v => { window.__range = v; }, process.env.RANGE);
  if (process.env.DEPTH) await pg.evaluate(v => { window.__depth = v; }, +process.env.DEPTH); // (DEPTH=4: longer names) // (RANGE='1100,1400': only those metres)
  const r = await pg.evaluate(async (step) => {
    const G = window.__svgp, sim = G.sim, R = G.post.r, gl = R.getContext(), px = new Uint8Array(4), T = sim.T;
    const wait = (ms) => new Promise(res => setTimeout(res, ms));
    // tag each draw: which pass, and what it is (top-level group under the scene > the object's own name)
    let pass = 'main', tally = null;
    const sr = R.shadowMap.render.bind(R.shadowMap); R.shadowMap.render = (...a) => { const p = pass; pass = 'shadow'; try { sr(...a); } finally { pass = p; } };
    const rb = R.renderBufferDirect.bind(R);
    R.renderBufferDirect = (c, sc, g, m, o, gr) => {
      if (tally) {
        const p = R.getRenderTarget() && R.getRenderTarget() === sim.mirrorRT ? 'mirror' : pass;
        tally[p] = (tally[p] || 0) + 1;
        if (p === 'main') {
          const path = []; for (let q = o.parent; q && q !== sim.scene; q = q.parent) path.unshift(q.name || q.type);
          let k = `${path.filter(n => n !== 'env-cell').slice(0, (window.__depth || 2)).join(' > ')} > ${o.name || o.type}${o.isInstancedMesh ? ' (inst)' : ''}`;
          if (!path.some(n => n !== 'Group' && n !== 'Object3D')) k += ` [${Array.isArray(m) ? 'multi' : m.type}${m.map ? ' map' : ''} ${g.type} ${Math.round((g.index ? g.index.count : g.attributes.position.count) / 3)}t]`;
          if (o.name === 'env-merged' || o.name === 'env-cell') { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const d = o.geometry.boundingSphere.center.distanceTo(sim.camera.position); k += ' ' + (o.userData.cat || '') + ' @' + (d < 150 ? '<150' : d < 400 ? '150-400' : d < 800 ? '400-800' : '800+') + ' m'; }
          tally.what[k] = (tally.what[k] || 0) + 1;
          const tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
          tally.tris[k] = (tally.tris[k] || 0) + tris;
        }
      }
      return rb(c, sc, g, m, o, gr);
    };
    const ren0 = sim.render.bind(sim), up0 = sim.update.bind(sim);
    let frames = null;
    sim.update = (...a) => { const t = performance.now(); up0(...a); if (frames) frames.upMs = performance.now() - t; };
    sim.render = (...a) => {
      if (!frames) return ren0(...a);
      const t = performance.now(); R.info.autoReset = false; R.info.reset(); ren0(...a);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // (wait for the GPU)
      frames.list.push({ ms: performance.now() - t + (frames.upMs || 0), calls: R.info.render.calls, tris: R.info.render.triangles });
    };
    const nStep = Math.max(1, Math.round(step / T.ds)), out = [];
    const [lo, hi] = (window.__range || '0,1e9').split(',').map(Number);
    for (let i = 0; i < T.N; i += nStep) {
      if (i * T.ds < lo || i * T.ds > hi) continue;
      const a = (i - Math.round(6 / T.ds) + T.N) % T.N, j = (i + Math.round(30 / T.ds)) % T.N;
      sim.updateCamera = function () { this.camera.position.set(T.X[a], T.Y[a] + 2.5, T.Z[a]); this.camera.lookAt(T.X[j], T.Y[j] + 1, T.Z[j]); };
      await wait(250); // (the world's cells / lights catch up)
      frames = { list: [] }; tally = { what: {}, tris: {} };
      await wait(400);
      const f = frames.list.slice(1); frames = null; const t = tally; tally = null;
      if (!f.length) continue;
      const n = f.length, med = f.map(x => x.ms).sort((x, y) => x - y)[n >> 1];
      out.push({ i, d: Math.round(i * T.ds), x: Math.round(T.X[i]), z: Math.round(T.Z[i]), ms: med, calls: Math.round(f.reduce((s, x) => s + x.calls, 0) / n), tris: f.reduce((s, x) => s + x.tris, 0) / n,
        main: Math.round((t.main || 0) / n), shadow: Math.round((t.shadow || 0) / n), mirror: Math.round((t.mirror || 0) / n),
        what: Object.entries(t.what).map(([k, v]) => [k, v / n, t.tris[k] / n]).sort((x, y) => y[1] - x[1]) });
    }
    sim.render = ren0; sim.update = up0; R.info.autoReset = true;
    return { out, len: Math.round(T.N * T.ds) };
  }, +step);
  console.log(`${track.name}: ${r.len} m, ${r.out.length} stations\n   dist     x     z   frame ms  calls(main/shadow/mirror)  tris M`);
  const worst = Math.max(...r.out.map(s => s.ms));
  for (const s of r.out) console.log(`${String(s.d).padStart(6)} ${String(s.x).padStart(5)} ${String(s.z).padStart(5)}   ${s.ms.toFixed(1).padStart(6)}   ${String(s.calls).padStart(5)} (${s.main}/${s.shadow}/${s.mirror})`.padEnd(62) + `${(s.tris / 1e6).toFixed(2).padStart(5)}  ${'#'.repeat(Math.round(30 * s.ms / worst))}`);
  const top = [...r.out].sort((a, b) => b.ms - a.ms).slice(0, 3);
  for (const s of top) {
    console.log(`\nat ${s.d} m (${s.x}, ${s.z}): ${s.ms.toFixed(1)} ms, ${s.main} main draws - most calls:`);
    s.what.slice(0, +(process.env.TOP || 18)).forEach(([k, c, t]) => console.log(`  ${c.toFixed(0).padStart(5)} calls ${(t / 1e3).toFixed(0).padStart(6)}k tris  ${k}`));
    console.log('  most triangles:'); [...s.what].sort((a, b) => b[2] - a[2]).slice(0, 8).forEach(([k, c, t]) => console.log(`  ${c.toFixed(0).padStart(5)} calls ${(t / 1e3).toFixed(0).padStart(6)}k tris  ${k}`));
  }
} finally { await b.close(); server.kill(); }
