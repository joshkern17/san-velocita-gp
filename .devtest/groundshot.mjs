// dev: a real circuit's ground from a fixed camera at points round the lap (a chase-cam view, 3 m up, looking down the
// road) plus two high views, with and without its ground map (track.ground, js/groundmap.js).
//   node .devtest/groundshot.mjs zandvoort <outdir> [shots=8]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const id = process.argv[2] || 'zandvoort', out = process.argv[3] || '/tmp', SHOTS = +(process.argv[4] || 8);
const track = JSON.parse(readFileSync(join(ROOT, 'tracks/real', id + '.json'), 'utf8'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const mode of (process.env.MODES || 'map,none').split(',')) {
    const t = JSON.parse(JSON.stringify(track)); if (mode === 'none') delete t.ground;
    t.env.weather = 'clear'; t.env.time = 'day';
    // (GRASS=k: a Grass brush patch either side of the road at view k, which should win over the ground map)
    if (process.env.GRASS) { const P = t.points, i = Math.floor(+process.env.GRASS * P.length / SHOTS), a = P[i], b = P[(i + 2) % P.length], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      for (const sd of [-1, 1]) t.paint.push({ kind: 'grass', r: 45, pts: [[a.x - (b.z - a.z) / L * 75 * sd, a.z + (b.x - a.x) / L * 75 * sd], [b.x - (b.z - a.z) / L * 75 * sd + (b.x - a.x) / L * 80, b.z + (b.x - a.x) / L * 75 * sd + (b.z - a.z) / L * 80]] }); }
    const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
    await pg.addInitScript(() => { navigator.getGamepads = () => []; });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    await pg.evaluate((t) => window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'), t);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 180000 });
    await pg.waitForTimeout(3000);
    // (nothing over the view: the strategy screen, the HUD)
    await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
    // the camera: set just before each frame is drawn (the race moves it in its update)
    await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { if (c.top && !this._noClouds) { this._noClouds = 1; this.scene.traverse(o => { if (o.geometry && o.geometry.isInstancedBufferGeometry) o.visible = false; }); } this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; if (this.scene.fog) { this.scene.fog.near = c.top ? 1e5 : this._fogN || (this._fogN = this.scene.fog.near); this.scene.fog.far = c.top ? 1e6 : this._fogF || (this._fogF = this.scene.fog.far); } } return r.apply(this, a); }; });
    const views = await pg.evaluate((SHOTS) => {
      const T = window.__svgp.sim.T, gh = window.__svgp.sim.world.groundHeight, v = [];
      for (let k = 0; k < SHOTS; k++) {
        const i = Math.floor(k * T.N / SHOTS), j = (i + Math.round(40 / T.ds)) % T.N, h = (i - Math.round(9 / T.ds) + T.N) % T.N;
        v.push({ name: 'lap' + k, p: [T.X[h], T.Y[h] + 3.2, T.Z[h]], l: [T.X[j], T.Y[j] + 0.5, T.Z[j]] });
      }
      let cx = 0, cz = 0; for (let i = 0; i < T.N; i++) { cx += T.X[i]; cz += T.Z[i]; } cx /= T.N; cz /= T.N;
      v.push({ name: 'highS', p: [cx, gh(cx, cz) + 260, cz + 620], l: [cx, gh(cx, cz), cz - 60], fov: 60 });
      v.push({ name: 'top', p: [cx, gh(cx, cz) + 620, cz + 0.01], l: [cx, gh(cx, cz), cz], fov: 110, top: true });
      v.push({ name: 'highW', p: [cx - 650, gh(cx, cz) + 220, cz], l: [cx + 80, gh(cx, cz), cz], fov: 60 });
      return v;
    }, SHOTS);
    for (const v of views) {
      await pg.evaluate((v) => { window.__shot = v; }, v);
      await pg.waitForTimeout(700);
      await pg.screenshot({ path: join(out, `${id}-${v.name}-${mode}.png`) });
    }
    console.log(mode, views.length, 'shots');
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
