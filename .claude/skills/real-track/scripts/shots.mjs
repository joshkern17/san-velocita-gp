// Pictures of a real circuit in the game (day, clear, no HUD), one browser for all of them. Run under the guard:
//   .devtest/guard.sh -m 7000 -t 300 node .claude/skills/real-track/scripts/shots.mjs <id> <outdir> <spot>...
//   spot = d<metres>       chase view: 25 m back along the lap, 3.2 m up, looking 40 m ahead   (d850)
//        | name:cx,cy,cz,tx,ty,tz   camera and target in world x/z, y metres above the ground there  (t1:-200,30,600,-220,0,660)
// --probe: also list what stands on the road surface (merged scenery cat + size, lap metres) and the distance boards
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { chromium } = await import(path.join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const args = process.argv.slice(2), probe = args.includes('--probe'), [id, out, ...spots] = args.filter(a => a !== '--probe');
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [path.join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(600);
  await pg.evaluate(async (id) => {
    const E = await import('./js/envlib.js'); await E.loadEnvCatalog(); await E.loadEnvModels();
    const R = await import('./js/realtracks.js'); await R.realTracksReady();
    const t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(t => t.real.id === id))));
    t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
  }, id);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.T && window.__svgp.sim.world, null, { timeout: 240000 });
  await pg.waitForTimeout(4000);
  if (probe) console.log(await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, w = sim.world, lines = [];
    lines.push('distance boards: ' + (w.boards || []).map(q => `${q.dist}@${Math.round(q.i * T.ds)}`).join(' '));
    const near = (x, z) => { let bb = 1e9, bi = 0; for (let i = 0; i < T.N; i++) { const d = (x - T.X[i]) ** 2 + (z - T.Z[i]) ** 2; if (d < bb) { bb = d; bi = i; } } return [bi, Math.sqrt(bb)]; };
    w.root.updateMatrixWorld(true);
    w.root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, sz = bb.max.clone().sub(bb.min); if (sz.x > 40 || sz.z > 40) return;
      const c = bb.getCenter(bb.min.clone()).applyMatrix4(o.matrixWorld), [i, d] = near(c.x, c.z);
      if (d < T.W[i] / 2 && c.y > T.Y[i] + 0.4 && c.y < T.Y[i] + 4.5) lines.push(`on the road at ${Math.round(i * T.ds)} m: ${o.name} ${o.userData.cat || ''} ${sz.x.toFixed(1)}x${sz.y.toFixed(1)}x${sz.z.toFixed(1)} at ${c.x.toFixed(0)},${c.z.toFixed(0)}, ${d.toFixed(1)} m off the line`);
    });
    return lines.join('\n');
  }));
  await pg.addStyleTag({ content: '*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
  for (const sp of spots) {
    const name = sp.includes(':') ? sp.split(':')[0] : sp;
    await pg.evaluate((sp) => {
      const sim = window.__svgp.sim, T = sim.T, gh = sim.world.groundHeight;
      sim.camera.far = Math.max(sim.camera.far, 4000); sim.camera.updateProjectionMatrix();
      if (/^d-?\d/.test(sp)) {
        const at = (m) => ((Math.round(m / T.ds) % T.N) + T.N) % T.N, d = +sp.slice(1), a = at(d - 25), c = at(d + 40);
        sim.updateCamera = function () { this.camera.position.set(T.X[a], T.Y[a] + 3.2, T.Z[a]); this.camera.lookAt(T.X[c], T.Y[c] + 1, T.Z[c]); };
      } else {
        const [cx, cy, cz, tx, ty, tz] = sp.split(':')[1].split(',').map(Number), y0 = gh(cx, cz), y1 = gh(tx, tz);
        sim.updateCamera = function () { this.camera.position.set(cx, y0 + cy, cz); this.camera.lookAt(tx, y1 + ty, tz); };
      }
    }, sp);
    await pg.waitForTimeout(1800);
    await pg.screenshot({ path: path.join(out, name + '.jpg'), quality: 78 });
    console.log('shot', path.join(out, name + '.jpg'));
  }
} finally { await b.close(); server.kill(); }
