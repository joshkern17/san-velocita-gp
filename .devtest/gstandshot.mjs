// dev: the modular grandstands in the game (a track from gstandtrack.mjs): each stand from the track, from the side
// along its length (a podium shows here on a slope), from behind (the cut into the hill), and from high up; plus how
// level each stand is and how far its ground drops / rises under it.
//   .devtest/guard.sh -m 6000 -t 500 node .devtest/gstandshot.mjs <track.json> <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [src, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const { track, spots } = JSON.parse(readFileSync(src, 'utf8'));
track.env.weather = 'clear'; track.env.time = 'day';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 200)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'), track);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 300000 });
  await pg.waitForTimeout(3000);
  await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; this.camera.updateProjectionMatrix(); } return r.apply(this, a); }; });
  const info = await pg.evaluate(async (spots) => {
    const sim = window.__svgp.sim, gh = sim.world.groundHeight, T = sim.T, v = [], rep = [];
    let podium = []; sim.world.root.traverse(o => { if (o.name === 'standPodium') { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; podium.push([+bb.min.y.toFixed(1), +bb.max.y.toFixed(1)]); } });
    for (const s of spots) {
      // the ground under the stand's footprint (front line .. 30 m back, 70 m along)
      let lo = Infinity, hi = -Infinity;
      for (let a = -36; a <= 36; a += 4) for (let b = 0; b <= 30; b += 3) { const x = s.x + s.fx * a - s.nx * b, z = s.z + s.fz * a - s.nz * b, g = gh(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); }
      rep.push({ size: s.size, groundLo: +lo.toFixed(1), groundHi: +hi.toFixed(1) });
      const y = gh(s.x, s.z), H = { S: 6, M: 16, L: 27 }[s.size], X = [s.nz, -s.nx], half = 30 + 4;
      const at = (a, b) => [s.x + X[0] * a - s.nx * b, s.z + X[1] * a - s.nz * b]; // (a along the stand, b back from its front)
      const eye = (a, b, h) => { const q = at(a, b); return [q[0], Math.max(gh(q[0], q[1]) + 1.7, y + h), q[1]]; };
      const look = (a, b, h) => { const q = at(a, b); return [q[0], y + h, q[1]]; };
      v.push({ name: `${s.size}_front`, p: eye(-30, -40, 4), l: look(0, 8, H * 0.35) });
      v.push({ name: `${s.size}_endL`, p: eye(-half - 28, 6, 3), l: look(-half + 2, 10, H * 0.25) });
      v.push({ name: `${s.size}_endR`, p: eye(half + 28, 6, 3), l: look(half - 2, 10, H * 0.25) });
      v.push({ name: `${s.size}_back`, p: eye(18, 40 + H, H * 0.5), l: look(0, 12, H * 0.3) });
    }
    return { v, rep, podium };
  }, spots);
  console.log('podium meshes', info.podium, JSON.stringify(info.rep));
  for (const v of info.v) {
    await pg.evaluate((v) => { window.__shot = v; }, v);
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: join(out, v.name + '.png') });
  }
  console.log(info.v.length, 'shots in', out);
} finally { await b.close(); server.kill(); }
