// dev: the track's rubber (rubber.js), from trackside at the heaviest braking zone and from above: as a session
// starts, and after a weekend's running   node .devtest/rubbershot.mjs <outdir> [track json] [laps of field]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '/tmp', TRK = process.argv[3] || '/.devtest/auburn2.json', LAPS = +(process.argv[4] || 300);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message)); pg.on('console', m => { if (/line|THREE|rubber/i.test(m.text())) console.log(m.text().slice(0, 300)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async (TRK) => { const t = await (await fetch(TRK)).json(); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu'); }, TRK);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.rubber && window.__svgp.sim.player, null, { timeout: 180000 });
  await pg.waitForTimeout(1500);
  // the views: the sample where the field's tyres work hardest, from the side of the track behind it, and above it
  const views = await pg.evaluate(() => {
    const s = window.__svgp.sim, T = s.T, W = s.rubber.work; let best = 0;
    for (let i = 0; i < T.N; i++) if (W[i] > W[best]) best = i;
    s.player.gone = true; s.player.model.group.visible = false; s.updateCamera = () => {}; s.lineMode = 'off';
    for (const el of document.querySelectorAll('body *')) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('canvas')) if (el.getBoundingClientRect().width < 600) el.style.visibility = 'hidden';
    const rr = s.rubber.r, row = Array.from(rr.slice(best * 24, best * 24 + 24)).map(v => v.toFixed(2)).join(' ');
    console.log('line', s.line[best].toFixed(1), 'width', T.W[best].toFixed(1), 'rubber lanes', row);
    const at = (i, side, up, back) => { const j = (i - back + T.N) % T.N, sd = side * (T.W[j] / 2 + 1.5);
      return { x: T.X[j] + T.RX[j] * sd, y: T.Y[j] + up, z: T.Z[j] + T.RZ[j] * sd, tx: T.X[i], ty: T.Y[i], tz: T.Z[i] }; };
    window.__view = (v) => { s.camera.position.set(v.x, v.y, v.z); s.camera.lookAt(v.tx, v.ty, v.tz); s.camera.fov = v.fov || 55; s.camera.updateProjectionMatrix(); };
    // a corner: the tightest one taken quickly (the line's speed x its curvature), its apex seen from above its outside
    let apex = 0; for (let i = 0; i < T.N; i++) if (s.lineV[i] ** 2 * Math.abs(T.K[i]) * (T.W[i] > 9 ? 1 : 0) > s.lineV[apex] ** 2 * Math.abs(T.K[apex])) apex = i;
    const out = -Math.sign(s.line[apex]) || 1;
    const tv = { ...at(apex, out, 7, -10), tx: T.X[apex] + T.RX[apex] * s.line[apex], ty: T.Y[apex], tz: T.Z[apex] + T.RZ[apex] * s.line[apex], fov: 45 };
    return { best, low: at(best, 1, 1.4, 22), wide: at((best + 20) % T.N, -1, 2.2, 45), top: { ...at(best, 0, 28, 6), fov: 50 }, tv };
  });
  console.log('braking zone at sample', views.best);
  const shoot = async (tag) => { for (const k of (process.env.VIEWS || 'tv,wide,top').split(',')) { await pg.evaluate((v) => window.__view(v), views[k]); await pg.waitForTimeout(700); await pg.screenshot({ path: join(OUT, `rubber-${tag}-${k}.png`) }); } };
  await shoot('start');
  await pg.evaluate((laps) => { const r = window.__svgp.sim.rubber; r.fieldT = 1; r.field(0, laps, 1); r.paint(); }, LAPS);
  await shoot("weekend");
  if (process.env.SIDE) { await pg.evaluate(() => { const r = window.__svgp.sim.rubber; r.r.fill(0); for (let k = 0; k < r.r.length; k += 24) for (let l = 0; l < 6; l++) r.r[k + l] = 1; r.paint(); }); await shoot("side"); }
  if (process.env.ZERO) { await pg.evaluate(() => { const r = window.__svgp.sim.rubber; r.r.fill(0); r.paint(); }); await shoot("zero"); }
  if (process.env.FULL) { await pg.evaluate(() => { const r = window.__svgp.sim.rubber; r.r.fill(1); r.paint(); }); await shoot("full"); }
} finally { await b.close(); server.kill(); }
