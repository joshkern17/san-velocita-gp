// dev: Start/Finish moved on a dressed circuit (EDIT, pick a node, Set Start): curbs, barriers and the pit lane stay put on the ground; undo puts the start back.
//   node .devtest/edstart.mjs <file.json> <outdir>
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
  // (world spots of the curb ends and pit lane nodes, and the barrier nodes)
  const spots = () => ev(() => { const e = window.__svgp.editor, d = e.track.dress, out = [];
    for (const k of d.kerbs) out.push(e.barXZ(k.side, k.a, 0), e.barXZ(k.side, k.b, 0));
    for (const b of d.barriers) for (const p of b.pts) out.push(e.barXZ(b.side, p[0], p[1]));
    for (const p of d.pit.pts) out.push(e.barXZ(d.pit.side, p[0], p[1]));
    return { out, start: e.track.start }; });
  const s0 = await spots();
  await pg.click('#ed-tools [data-tool="edit"]');
  const ns = await ev(() => { const e = window.__svgp.editor, k = Math.floor(e.track.points.length / 2), p = e.track.points[k]; e.view.cx = p.x; e.view.cz = p.z; e.view.scale = 2; e.dirty = true; return k; });
  await pg.waitForTimeout(400);
  const [x, y] = await ev((k) => { const e = window.__svgp.editor, p = e.track.points[k], r = e.canvas.getBoundingClientRect(), [sx, sy] = e.w2s(p.x, p.z); return [r.left + sx, r.top + sy]; }, ns);
  await pg.mouse.click(x, y); await pg.waitForTimeout(400);
  ok(await ev(() => !!document.getElementById('n-start')), 'a picked node offers the start/finish button');
  await pg.click('#n-start'); await pg.waitForTimeout(800);
  const s1 = await spots();
  const moved = Math.max(...s0.out.map((p, i) => Math.hypot(p[0] - s1.out[i][0], p[1] - s1.out[i][1])));
  ok(s1.start === ns, `the start is node ${s1.start}`);
  ok(moved < 0.5, `curbs, barrier nodes and the pit lane stayed put (${moved.toFixed(2)} m at most, ${s0.out.length} spots)`);
  await pg.screenshot({ path: join(out, 'start_moved.png') });
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  const s2 = await spots();
  ok(s2.start === s0.start && Math.max(...s0.out.map((p, i) => Math.hypot(p[0] - s2.out[i][0], p[1] - s2.out[i][1]))) < 0.01, 'undo puts the start back, everything where it was');
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
