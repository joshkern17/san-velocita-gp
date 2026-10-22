// dev: the OpenStreetMap road import in the game (the track written by osmhouses.mjs <name> <json>): views of the
// junctions where imported streets meet the track (from the track, 3 m up, and from 25 m above), and of the houses
// put on empty lots (from the street).
//   .devtest/guard.sh -t 400 node .devtest/osmshot.mjs .devtest/out/roads/jv_import.json <outdir> [n=6]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [src, out, n = 6] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const { track, jn, lots } = JSON.parse(readFileSync(src, 'utf8'));
track.env.weather = 'clear'; track.env.time = 'day';
if (process.env.STREET) { track.env.markings = 'street'; track.env.kerbs = false; if (process.env.STREET === 'dash') track.env.centre = 'dash'; } // (a street track's lines)
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu'), track);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 300000 });
  await pg.waitForTimeout(3000);
  await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; this.camera.updateProjectionMatrix(); } return r.apply(this, a); }; });
  if (process.env.CORNER) await pg.evaluate(() => { window.__corner = 1; });
  if (process.env.SIDE) await pg.evaluate(() => { window.__side = 1; });
  if (process.env.NEAR) await pg.evaluate(() => { window.__spike = 1; });
  const views = await pg.evaluate(({ jn, lots, n }) => {
    const sim = window.__svgp.sim, T = sim.T, gh = sim.world.groundHeight, v = [];
    const pick = (arr, k) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / k)) === 0).slice(0, k);
    pick(jn, n).forEach(([x, z, side, ti], k) => {
      // from the track: 30 m back along it, on the far side, looking at the junction's mouth
      const i = ((ti - Math.round(30 / T.ds)) % T.N + T.N) % T.N, off = -side * T.W[i] * 0.3;
      v.push({ name: `jn${k}_track`, p: [T.X[i] + T.RX[i] * off, T.Y[i] + 3, T.Z[i] + T.RZ[i] * off], l: [x, gh(x, z) + 1, z] });
      // from above, out over the street
      const ox = T.RX[ti] * side, oz = T.RZ[ti] * side;
      v.push({ name: `jn${k}_high`, p: [x + ox * 30 - T.FX[ti] * 20, gh(x, z) + 26, z + oz * 30 - T.FZ[ti] * 20], l: [x - ox * 4, gh(x, z), z - oz * 4] });
    });
    if (window.__side) { // side-on at ground level, across the street a few metres back from the track edge
      return v.filter(q => q.name.endsWith('_track')).map((q, k) => {
        const [x, z, side, ti] = pick(jn, n)[k], ox = T.RX[ti] * side, oz = T.RZ[ti] * side, cx = x + ox * 8, cz = z + oz * 8, y = gh(cx, cz);
        return { name: `jn${k}_side`, p: [cx + T.FX[ti] * 16, y + 1.4, cz + T.FZ[ti] * 16], l: [cx - ox * 3, y, cz - oz * 3], fov: 60 };
      });
    }
    if (window.__spike) { // closer, lower versions of the high views
      const out = v.filter(q => q.name.endsWith('_high')).map(q => { const l = q.l, d = [q.p[0] - l[0], q.p[1] - l[1], q.p[2] - l[2]]; return { name: q.name.replace('_high', '_near'), p: [l[0] + d[0] * 0.45, l[1] + d[1] * 0.35, l[2] + d[2] * 0.45], l: [l[0] - d[0] * 0.15, l[1], l[2] - d[2] * 0.15] }; });
      return out;
    }
    if (window.__corner) { // close-ups of each junction's flared corners (where its sidewalks meet the track edge)
      v.length = 0;
      const J = sim.A.roadL.junctions;
      pick(J, n).forEach((j, k) => j.walks.forEach((w, q) => { const e = w.pts[Math.floor(w.pts.length / 2)], y = gh(e.x, e.z);
        v.push({ name: `corner${k}_${q}`, p: [e.x + w.out[0] * 7 + 3, y + 2.2, e.z + w.out[1] * 7 + 3], l: [e.x, y, e.z], fov: 70 }); }));
      return v;
    }
    pick(lots, Math.ceil(n / 2)).forEach(([x, z], k) => v.push({ name: `lot${k}`, p: [x + 22, gh(x, z) + 9, z + 22], l: [x, gh(x, z) + 2, z] }));
    return v;
  }, { jn, lots, n: +n });
  for (const v of views) {
    await pg.evaluate((v) => { window.__shot = v; }, v);
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: join(out, v.name + '.png') });
  }
  console.log(views.length, 'shots in', out);
} finally { await b.close(); server.kill(); }
