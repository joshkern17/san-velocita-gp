// dev: the BARRIERS tool's Even Out All, used like a player on an old circuit: 0, set the distance, Even Out All:
// one barrier down each side, every node a curve with handles, the distance kept; undo puts the old ones back.
//   node .devtest/edeven.mjs <file.json> <outdir>
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
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), JSON.parse(readFileSync(file, 'utf8')));
  await pg.waitForTimeout(2500);
  const ev = (fn, a) => pg.evaluate(fn, a);
  await pg.mouse.move(700, 400); await pg.keyboard.press('0'); await pg.waitForTimeout(400);
  const before = await ev(() => { const l = window.__svgp.editor.barList(); return { n: l.length, nodes: l.reduce((s, b) => s + b.pts.length, 0) }; });
  console.log(`before: ${before.n} barriers, ${before.nodes} nodes`);
  await pg.screenshot({ path: join(out, 'even_before.png') });
  ok(await ev(() => !!document.getElementById('br-even')), 'Even Out All is in the panel');
  await pg.$eval('#br-even-d', (e) => { e.value = 10; e.dispatchEvent(new Event('input')); });
  await pg.click('#br-wide button[data-v="0"]'); await pg.waitForTimeout(200); // (Even: the same distance at the corners)
  const t0 = Date.now(); await pg.click('#br-even'); const ms = Date.now() - t0; await pg.waitForTimeout(800);
  const after = await ev(() => { const e = window.__svgp.editor, l = e.track.dress.barriers;
    return { sides: l.map(b => b.side), nodes: l.map(b => b.pts.length), free: l.every(b => b.pts.slice(0, -1).every(p => p[2] && p[2].f && p[2].ho)), max: Math.max(...l.flatMap(b => b.pts.map(p => p[1]))), label: document.getElementById('br-even-v').textContent }; });
  ok(after.sides.includes(-1) && after.sides.includes(1), `a barrier each side (${after.sides.length} in all, nodes ${after.nodes.join('+')}) in ${ms} ms`);
  ok(after.free, 'every stretch is a curve with handles');
  ok(after.max <= 10.01 && after.label === '10m', `10 m out at most (${after.max}), the slider kept (${after.label})`);
  await pg.screenshot({ path: join(out, 'even_after.png') });
  // Wider Outside: further out at the corners, not on the straights
  await pg.click('#br-wide button[data-v="1"]'); await pg.waitForTimeout(200); await pg.click('#br-even'); await pg.waitForTimeout(800);
  const wide = await ev(() => { const l = window.__svgp.editor.track.dress.barriers, o = l.flatMap(b => b.pts.map(p => p[1])); return { max: Math.max(...o), at10: o.filter(v => Math.abs(v - 10) < 0.3).length, n: o.length }; });
  ok(wide.max > 13 && wide.max <= 17.01 && wide.at10 > wide.n / 4, `wider outside the corners (up to ${wide.max.toFixed(1)} m), 10 m on the straights (${wide.at10} of ${wide.n} nodes)`);
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  const undone = await ev(() => { const l = window.__svgp.editor.barList(); return { n: l.length, nodes: l.reduce((s, b) => s + b.pts.length, 0) }; });
  ok(undone.n === before.n && undone.nodes === before.nodes, `undo puts the old barriers back (${undone.n}, ${undone.nodes} nodes)`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
