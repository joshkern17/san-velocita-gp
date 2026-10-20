// dev: the pit wall past the garages, used like a player: PIT LANE (P), drag the wall's white dots out along the lane
// (each way): the wall runs on beside the lane up to where it meets the track, never on the track or the lane, the
// garages stay put; undo; then the 3D view at the wall's new start.
//   node .devtest/edpitwall.mjs <file.json> <outdir>
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const file = process.argv[2], out = process.argv[3] || '/tmp';
const PORT = 9800 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), JSON.parse(readFileSync(file, 'utf8')));
  await pg.waitForTimeout(2500);
  const ev = (fn, a) => pg.evaluate(fn, a);
  const scr = (x, z) => ev(([x, z]) => { const e = window.__svgp.editor, r = e.canvas.getBoundingClientRect(), [sx, sy] = e.w2s(x, z); return [r.left + sx, r.top + sy]; }, [x, z]);
  await pg.click('#ed-tools [data-tool="pit"]'); await pg.waitForTimeout(300);
  const st = () => ev(() => { const e = window.__svgp.editor, p = e.pit, T = e.T; let w = 0, g = 0, bad = 0;
    for (let i = 0; i < T.N; i++) { if (!isNaN(p.WALL[i])) { w++; if (p.WALL[i] < T.W[i] / 2 + 0.79 || p.WALL[i] > p.CEN[i] - p.width / 2 - 0.29) bad++; } if (p.MAIN[i]) g++; }
    const o = e.pitNodes(); return { wallM: w * T.ds, garM: g * T.ds, bad, boxes: p.boxes.length, ends: e.pitWallEnds(o), own: o.wall || null }; });
  const s0 = await st(); console.log('before', JSON.stringify(s0));
  // drag a white dot along the lane: the lane's sample `dPos` m from the dot, at the wall's line
  const dragDot = async (e, metres) => {
    const at = await ev(([e, m]) => { const ed = window.__svgp.editor, o = ed.pitNodes(), T = ed.T, d = ed.pitWallEnds(o)[e];
      const [x, z] = ed.pitWallXZ(o, d), i = ((Math.round((d + m) / T.ds) % T.N) + T.N) % T.N, [tx, tz] = ed.barXZ(o.side, T.D[i], 1);
      ed.view.cx = (x + tx) / 2; ed.view.cz = (z + tz) / 2; ed.view.scale = 3; ed.dirty = true; return { x, z, tx, tz }; }, [e, metres]);
    await pg.waitForTimeout(300);
    const [sx, sy] = await scr(at.x, at.z), [ex, ey] = await scr(at.tx, at.tz);
    await pg.mouse.move(sx, sy); await pg.mouse.down(); for (let q = 1; q <= 12; q++) await pg.mouse.move(sx + (ex - sx) * q / 12, sy + (ey - sy) * q / 12); await pg.mouse.up(); await pg.waitForTimeout(600);
  };
  await dragDot(0, -150);
  const s1 = await st(); console.log('start dragged back 150 m', JSON.stringify(s1));
  ok(s1.own && s1.wallM > s0.wallM + 20, `the wall starts earlier (${s0.wallM.toFixed(0)} -> ${s1.wallM.toFixed(0)} m)`);
  ok(s1.garM === s0.garM && s1.boxes === s0.boxes, `the garages stay put (${s1.garM.toFixed(0)} m, ${s1.boxes} boxes)`);
  ok(s1.bad === 0, 'the wall is never on the track or the lane');
  await pg.screenshot({ path: join(out, 'pitwall_start.png') });
  await dragDot(1, 150);
  const s2 = await st(); console.log('end dragged on 150 m', JSON.stringify(s2));
  ok(s2.wallM > s1.wallM + 20 && s2.bad === 0, `and ends later (${s2.wallM.toFixed(0)} m), still clear`);
  await pg.screenshot({ path: join(out, 'pitwall_end.png') });
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  ok(Math.abs((await st()).wallM - s1.wallM) < 0.5, 'undo takes the end back');
  await pg.keyboard.press('Control+Shift+z').catch(() => {}); await pg.waitForTimeout(300);
  // 3D: from just before the wall's new start, looking down the track
  await ev(() => { const e = window.__svgp.editor, p = e.pit, T = e.T, i = (p.start + p.wallStart + T.N) % T.N; e.mouse.inside = true; e.mouse.wx = T.X[i] - T.FX[i] * 10; e.mouse.wz = T.Z[i] - T.FZ[i] * 10; });
  await ev(() => window.__svgp.editor.open3d()); await pg.waitForTimeout(6000);
  await pg.screenshot({ path: join(out, 'pitwall_3d.png') });
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
} finally { await b.close(); server.kill(); }
