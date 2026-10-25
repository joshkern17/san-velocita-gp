// Screenshots from fixed cameras at given distances round the lap (compare looks before / after a change).
//   node .devtest/spotshots.mjs "track name" 1200,3280 out/prefix   (SERVE=dir: serve that copy of the game instead)
// Per distance: the perfmap chase camera (6 m back, 2.5 m up, 30 m ahead) and a high one (25 m up, 400 m ahead).
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const [which = 'Auburn GP2', at = '1200', out = 'shot'] = process.argv.slice(2);
const all = JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8')), track = (Array.isArray(all) ? all : Object.values(all)).find(t => t.name === which);
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
  await pg.evaluate(async (track) => { const G = window.__svgp; (await import('/js/world.js')).setWorldOptions({ shadows: G.settings.shadows }); G.startRace(track, { mode: 'test', laps: 9, opponents: 0 }, 'setup'); }, track);
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  for (const d of at.split(',').map(Number)) for (const [back, up, ahead, tag] of [[6, 2.5, 30, 'low'], [10, 25, 400, 'high']]) {
    await pg.evaluate(([d, back, up, ahead]) => {
      const sim = window.__svgp.sim, T = sim.T, i = Math.round(d / T.ds) % T.N, a = (i - Math.round(back / T.ds) + T.N) % T.N, j = (i + Math.round(ahead / T.ds)) % T.N;
      sim.updateCamera = function () { this.camera.position.set(T.X[a], T.Y[a] + up, T.Z[a]); this.camera.lookAt(T.X[j], T.Y[j] + 1, T.Z[j]); };
    }, [d, back, up, ahead]);
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: `${out}${d}_${tag}.png` });
  }
  // close-ups (CLOSE=1): the courthouse, if placed, and the first pit-wall stand
  if (process.env.CLOSE) for (const tag of ['courthouse', 'stand']) {
    const ok = await pg.evaluate((tag) => {
      const sim = window.__svgp.sim, T = sim.T, THREE = sim.camera.position.constructor;
      let t = null, eye = null;
      if (tag === 'courthouse') { const p = (sim.track.props || []).find(q => q.type === 'courthouse'); if (!p) return false; let bi = 0, bd = 1e9; for (let i = 0; i < T.N; i++) { const d = Math.hypot(T.X[i] - p.x, T.Z[i] - p.z); if (d < bd) { bd = d; bi = i; } } t = new THREE(p.x, T.Y[bi] + 8, p.z); const dx = T.X[bi] - p.x, dz = T.Z[bi] - p.z, L = Math.hypot(dx, dz) || 1; eye = new THREE(p.x + dx / L * 45, t.y + 22, p.z + dz / L * 45); }
      else { const st = sim.pitLife && sim.pitLife.wall && sim.pitLife.wall.stands[0]; if (!st) return false; t = new THREE(); st.g.getWorldPosition(t); t.y += 1.4; const i = st.b.bi, sd = sim.pitLife.pit.side; eye = new THREE(t.x - T.RX[i] * sd * 7 + T.RZ[i] * 3, t.y + 0.6, t.z - T.RZ[i] * sd * 7 - T.RX[i] * 3); }
      sim.updateCamera = function () { this.camera.position.copy(eye); this.camera.lookAt(t); };
      return true;
    }, tag);
    if (!ok) continue;
    await pg.waitForTimeout(900);
    await pg.screenshot({ path: `${out}${tag}.png` });
  }
} finally { await b.close(); server.kill(); }
