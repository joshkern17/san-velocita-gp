// dev: the Circuit Designer's Simplify on a real circuit, used like a player: fewer points, the same road (each old
// sample within 0.35 m of the new line), its pit lane, kerbs and barriers where they stood (world positions within
// 0.35 m), the pit boxes the same; undo puts it all back.
//   node .devtest/edsimplify.mjs <id>        (tracks/real/<id>.json + its dress)
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const id = process.argv[2] || 'indy';
const track = JSON.parse(readFileSync(join(ROOT, `tracks/real/${id}.json`), 'utf8'));
const df = join(ROOT, `tracks/real/dress/${id}.json`); if (existsSync(df)) track.dress = JSON.parse(readFileSync(df, 'utf8'));
const PORT = 9800 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const kill = setTimeout(() => { console.log('FAIL timed out'); b.close(); server.kill(); process.exit(1); }, 120000);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), track);
  await pg.waitForTimeout(2500);
  // where everything stands: the road every 2 m, each dressing node on the ground, the pit boxes
  const snap = () => pg.evaluate(async () => {
    const e = window.__svgp.editor, T = e.T, t = e.track, TK = await import('./js/track.js');
    const at = (d, off, side) => { const F = TK.trackFrame(T, d), o = side * (F.w / 2 + off); return [F.x + F.rx * o, F.z + F.rz * o]; };
    const nodes = [], dr = t.dress || {};
    for (const w of dr.barriers || []) for (const p of w.pts) nodes.push(at(p[0], p[1], w.side < 0 ? -1 : 1));
    for (const k of dr.kerbs || []) nodes.push(at(k.a, 0, k.side < 0 ? -1 : 1), at(k.b, 0, k.side < 0 ? -1 : 1));
    if (dr.pit) for (const p of dr.pit.pts) nodes.push(at(p[0], p[1], dr.pit.side < 0 ? -1 : 1));
    const road = []; for (let i = 0; i < T.N; i += Math.max(1, Math.round(2 / T.ds))) road.push([T.X[i], T.Z[i]]);
    return { n: t.points.length, L: T.L, nodes, road, boxes: e.pit ? e.pit.boxes.length : 0 };
  });
  const s0 = await snap();
  await pg.evaluate(() => window.__svgp.editor.simplify()); await pg.waitForTimeout(1500);
  const s1 = await snap();
  ok(s1.n < s0.n, `fewer points (${s0.n} -> ${s1.n})`);
  ok(Math.abs(s1.L - s0.L) < 0.5, `lap ${s0.L.toFixed(1)} -> ${s1.L.toFixed(1)} m`);
  let wr = 0; for (const [x, z] of s0.road) { let best = 1e18; for (let j = 0; j < s1.road.length; j++) { const [ax, az] = s1.road[j], [bx, bz] = s1.road[(j + 1) % s1.road.length], ux = bx - ax, uz = bz - az, l2 = ux * ux + uz * uz || 1, u = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / l2)); best = Math.min(best, (x - ax - ux * u) ** 2 + (z - az - uz * u) ** 2); } wr = Math.max(wr, Math.sqrt(best)); }
  ok(wr < 0.35, `the same road (worst ${wr.toFixed(2)} m off)`);
  const mv = s0.nodes.map((p, i) => Math.hypot(p[0] - s1.nodes[i][0], p[1] - s1.nodes[i][1]));
  ok(s0.nodes.length === s1.nodes.length && Math.max(0, ...mv) < 0.35, `${mv.length} dressing nodes where they stood (worst ${Math.max(0, ...mv).toFixed(2)} m)`);
  ok(s1.boxes === s0.boxes, `pit boxes ${s0.boxes} -> ${s1.boxes}`);
  await pg.keyboard.press('Meta+z'); await pg.waitForTimeout(1200);
  const s2 = await snap();
  ok(s2.n === s0.n, `undo: ${s2.n} points back`);
} finally { clearTimeout(kill); await b.close(); server.kill(); }
console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
