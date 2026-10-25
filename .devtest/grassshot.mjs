// dev: the long grass (js/grass.js) close up: from the track's edge looking across the runoff (the tufts creeping in)
// and from out in a field, at a few points round the lap.
//   .devtest/guard.sh -m 7000 -t 600 node .devtest/grassshot.mjs <outdir> "<saved or real track>" [time] [hillside]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [out, NAME = 'Joeger Vernon', TIME = 'day', SIDE = 'auto'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const saved = [JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.editorWork.txt'), 'utf8')), ...JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8'))].find(q => q && q.name === NAME) || null;
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ({ NAME, saved, TIME, SIDE }) => {
    const t = saved ? JSON.parse(JSON.stringify(saved)) : (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === NAME);
    t.env.weather = 'clear'; t.env.time = TIME; if (SIDE !== 'auto') t.env.hillside = SIDE;
    window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
  }, { NAME, saved, TIME, SIDE });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 300000 });
  await pg.waitForTimeout(3500);
  await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; this.camera.updateProjectionMatrix(); for (const o of (this.world && this.world.root.children) || []) if (o.material && o.material.uniforms && o.material.uniforms.sunDir && o.geometry && o.geometry.type === 'SphereGeometry') o.position.copy(this.camera.position); if (this.world && this.world.grass) this.world.grass.update(performance.now() / 1000, this.camera); } return r.apply(this, a); }; });
  const views = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, A = sim.A, gh = sim.world.groundHeight, v = [], N = T.cut >= 0 ? T.cut : T.N;
    for (const [k, f] of [[0, 0.2], [1, 0.45], [2, 0.7]]) {
      const i = Math.floor(f * N), sd = A.BL[i] > A.BR[i] ? -1 : 1, o = sd * (T.W[i] / 2 - 0.8);
      const x = T.X[i] + T.RX[i] * o, z = T.Z[i] + T.RZ[i] * o, y = T.Y[i] + 1.2;
      v.push({ name: `runoff${k}`, p: [x, y, z], l: [x + T.FX[i] * 12 + T.RX[i] * sd * 7, y - 1.2, z + T.FZ[i] * 12 + T.RZ[i] * sd * 7] });
      const fo = sd * ((sd < 0 ? A.BL[i] : A.BR[i]) + 25), fx = T.X[i] + T.RX[i] * fo, fz = T.Z[i] + T.RZ[i] * fo, fy = gh(fx, fz) + 1.5;
      v.push({ name: `field${k}`, p: [fx, fy, fz], l: [fx + T.FX[i] * 25, fy - 0.8, fz + T.FZ[i] * 25] });
    }
    return v;
  });
  for (const v of views) { await pg.evaluate((v) => { window.__shot = v; }, v); await pg.waitForTimeout(800); await pg.screenshot({ path: join(out, v.name + '.png') }); }
  console.log(views.length, 'shots');
} finally { await b.close(); server.kill(); }
