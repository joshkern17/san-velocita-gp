// dev: the land beyond the circuit (js/backdrop.js): a track with each backdrop kind (and hillside), from the driver's
// height looking out at four points round the lap, and one from high above.
//   .devtest/guard.sh -m 6000 -t 900 node .devtest/backdropshot.mjs <outdir> "<saved or real track>" [kinds=hills,mountains,alps] [hillside] [time]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [out, NAME = 'Joeger Vernon', KINDS = 'hills,mountains,alps', SIDE = 'auto', TIME = 'day'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const saved = [JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.editorWork.txt'), 'utf8')), ...JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8'))].find(q => q && q.name === NAME) || null;
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const kind of KINDS.split(',')) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
    await pg.addInitScript(() => { navigator.getGamepads = () => []; });
    pg.on('pageerror', e => console.log('PAGE ERROR', kind, e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
    await pg.evaluate(async ({ NAME, saved, kind, SIDE, TIME }) => {
      const t = saved ? JSON.parse(JSON.stringify(saved)) : (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === NAME);
      t.env.weather = 'clear'; t.env.time = TIME; if (kind === 'old') { delete t.env.backdrop; t.env.theme = 'city'; } else t.env.backdrop = kind; if (SIDE !== 'auto') t.env.hillside = SIDE;
      window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
    }, { NAME, saved, kind, SIDE, TIME });
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 300000 });
    await pg.waitForTimeout(3500);
    await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
    await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; this.camera.updateProjectionMatrix(); for (const o of (this.world && this.world.root.children) || []) if (o.material && o.material.uniforms && o.material.uniforms.sunDir && o.geometry && o.geometry.type === 'SphereGeometry') o.position.copy(this.camera.position); if (this.world && this.world.grass) this.world.grass.update(performance.now() / 1000, this.camera); } return r.apply(this, a); }; });
    const views = await pg.evaluate(() => {
      const sim = window.__svgp.sim, T = sim.T, v = [], N = T.cut >= 0 ? T.cut : T.N;
      for (let k = 0; k < 4; k++) {
        const i = Math.floor((k + 0.5) * N / 4), j = (i + Math.round(60 / T.ds)) % T.N;
        // (looking along the road, a little to the outside)
        v.push({ name: 'lap' + k, p: [T.X[i], T.Y[i] + 2.2, T.Z[i]], l: [T.X[j] + T.RX[j] * 25, T.Y[i] + 6, T.Z[j] + T.RZ[j] * 25] });
      }
      let cx = 0, cz = 0, cy = 0; for (let i = 0; i < T.N; i++) { cx += T.X[i]; cz += T.Z[i]; cy += T.Y[i]; } cx /= T.N; cz /= T.N; cy /= T.N;
      const i = Math.floor(N * 0.3); v.push({ name: 'high', p: [T.X[i] - T.RX[i] * 40, T.Y[i] + 60, T.Z[i] - T.RZ[i] * 40], l: [T.X[i] + T.RX[i] * 3000, T.Y[i] + 250, T.Z[i] + T.RZ[i] * 3000], fov: 60 });
      return v;
    });
    for (const v of views) { await pg.evaluate((v) => { window.__shot = v; }, v); await pg.waitForTimeout(700); await pg.screenshot({ path: join(out, `${kind}-${v.name}.png`) }); }
    console.log(kind, views.length, 'shots');
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
