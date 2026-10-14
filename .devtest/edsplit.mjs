// dev: the BARRIERS tool's Split Here, used like a player: 0, click a barrier, click one of its nodes, Split Here:
// two barriers where there was one, the whole of it still standing (the map and the game's walls).
//   node .devtest/edsplit.mjs <file.json> <outdir>
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
  await pg.mouse.move(700, 400); await pg.keyboard.press('0'); await pg.waitForTimeout(400);
  const info = () => ev(() => { const e = window.__svgp.editor, A = e.A; let l = 0, r = 0; for (let i = 0; i < e.T.N; i++) { l += A.HAS_L[i]; r += A.HAS_R[i]; }
    return { cov: [l, r], bars: e.barList().map(b => [b.side, b.pts.length, Math.round(e.barLine(b).length)]) }; });
  const b0 = await info(); console.log('before', JSON.stringify(b0));
  // click the barrier, then its 8th node
  const scr = (x, z) => ev(([x, z]) => { const e = window.__svgp.editor, r = e.canvas.getBoundingClientRect(), [sx, sy] = e.w2s(x, z); return [r.left + sx, r.top + sy]; }, [x, z]);
  const K = 8;
  const at = await ev((k) => { const e = window.__svgp.editor, b = e.barList()[0], p = b.pts[k], q = e.barXZ(b.side, p[0], p[1]); e.view.cx = q[0]; e.view.cz = q[1]; e.view.scale = 1.5; e.dirty = true;
    const line = e.barLine(b), mid = line[Math.floor(line.length * 0.6 * k / b.pts.length)]; return { node: q, line: e.barXZ(b.side, (p[0] + b.pts[k + 1][0]) / 2, (p[1] + b.pts[k + 1][1]) / 2) }; }, K);
  await pg.waitForTimeout(400);
  let [x, y] = await scr(...at.line); await pg.mouse.click(x, y); await pg.waitForTimeout(400);
  [x, y] = await scr(...at.node); await pg.mouse.click(x, y); await pg.waitForTimeout(400);
  const picked = await ev(() => [window.__svgp.editor.barSel, window.__svgp.editor.barNode]);
  ok(picked[1] === K, `picked node ${picked[1]} of barrier ${picked[0]}`);
  await pg.screenshot({ path: join(out, 'split_before.png') });
  await pg.click('#br-split'); await pg.waitForTimeout(800);
  const b1 = await info(); console.log('after ', JSON.stringify(b1));
  await pg.screenshot({ path: join(out, 'split_after.png') });
  const sel = await ev(() => { const e = window.__svgp.editor, l = e.track.dress.barriers, a = l[e.barSel - 1], b = l[e.barSel];
    return { node: e.barNode, meet: a.pts[a.pts.length - 1][0] === b.pts[0][0], own: a.pts[a.pts.length - 1][2] !== b.pts[0][2] || !a.pts[a.pts.length - 1][2] }; });
  ok(sel.node === 0 && sel.meet, 'the second half is picked, at its first node, where the first half ends');
  ok(sel.own, 'each half has its own copy of the split node');
  ok(b1.bars.length === b0.bars.length + 1, `one more barrier (${b0.bars.length} -> ${b1.bars.length})`);
  ok(Math.abs(b1.cov[0] - b0.cov[0]) <= 2 && Math.abs(b1.cov[1] - b0.cov[1]) <= 2, `the walls still stand all the way (${b0.cov} -> ${b1.cov})`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
