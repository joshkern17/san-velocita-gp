// dev: where the sun is drawn (the two-suns bug): at dusk, a camera aimed at the sun's direction, shot as is, with the
// light shafts off, with the sky hidden, and with the backdrop hidden.
//   .devtest/guard.sh -m 7000 -t 600 node .devtest/sunshot.mjs <outdir> "<saved or real track>" [time] [backdrop]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [out, NAME = 'Willow Springs', TIME = 'dusk', BD = 'mountains'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
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
  await pg.evaluate(async ({ NAME, saved, TIME, BD }) => {
    const t = saved ? JSON.parse(JSON.stringify(saved)) : (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === NAME);
    t.env.weather = 'clear'; t.env.time = TIME; t.env.backdrop = BD;
    window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
  }, { NAME, saved, TIME, BD });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 300000 });
  await pg.waitForTimeout(3500);
  await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  const info = await pg.evaluate(() => {
    const s = window.__svgp.sim, r = s.render, P = s.world.P, T = s.T, i = 10;
    const sd = P.sun.slice(), l = Math.hypot(...sd); sd.forEach((v, k) => sd[k] = v / l);
    const p = [T.X[i], T.Y[i] + 3, T.Z[i]];
    window.__shot = { p, l: [p[0] + sd[0] * 100, p[1] + Math.max(sd[1], 0.06) * 100, p[2] + sd[2] * 100] };
    s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = 64; this.camera.updateProjectionMatrix(); for (const o of (this.world && this.world.root.children) || []) if (o.material && o.material.uniforms && o.material.uniforms.sunDir && o.geometry && o.geometry.type === 'SphereGeometry') o.position.copy(this.camera.position); } return r.apply(this, a); };
    return { sun: P.sun, lookSun: P.look && P.look.haze && P.look.haze.sunDir, cam: p };
  });
  console.log(JSON.stringify(info));
  const shot = async (n) => { await pg.waitForTimeout(800); await pg.screenshot({ path: join(out, n + '.png') }); };
  await shot('a-normal');
  await pg.evaluate(() => { window.__svgp.post && window.__svgp.post.configure && window.__svgp.post.configure({ rays: false }); });
  await shot('b-norays');
  await pg.evaluate(() => { window.__svgp.post.configure({ rays: true }); window.__svgp.sim.world.root.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.sunDir && o.geometry && o.geometry.type === 'SphereGeometry') o.visible = false; }); });
  await shot('c-nosky');
  await pg.evaluate(() => { window.__svgp.sim.world.root.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.sunDir && o.geometry && o.geometry.type === 'SphereGeometry') o.visible = true; if (o.name === 'Backdrop') o.visible = false; }); });
  await shot('d-nobackdrop');
} finally { await b.close(); server.kill(); }
