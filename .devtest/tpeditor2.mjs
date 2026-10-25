// dev: PROPS panel with pictures; a line of flags drawn, picked, moved, a node dragged, re-spaced (real mouse
// events on the map)   node .devtest/tpeditor2.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp';
const PORT = 9790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async () => { const { presetTracks } = await import('/js/track.js'); window.__svgp.openEditor(presetTracks().find(t => t.name === 'Maple Ridge GP')); });
  await pg.waitForTimeout(2500);
  await pg.evaluate(async () => { const { loadEnvModels } = await import('/js/envlib.js'); await loadEnvModels();
    const e = window.__svgp.editor; e.setTool('props'); e.propCat = 'track'; e.propType = 'tp:stand_roof'; e.renderItemTab(); });
  await pg.waitForTimeout(6000); // (the pictures)
  await pg.screenshot({ path: join(OUT, 'pe-panel.png'), clip: { x: 1080, y: 50, width: 320, height: 850 } });
  await pg.evaluate(() => { const el = document.getElementById('tab-node'); let p = el; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = 520; });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(OUT, 'pe-panel2.png'), clip: { x: 1080, y: 50, width: 320, height: 850 } });
  // a line of flags with the mouse, along the start straight's right side
  const canvas = await pg.evaluate(() => { const e = window.__svgp.editor, T = e.T, N = T.N; e.propType = 'tp:flag'; e.renderItemTab();
    const i = (k) => ((Math.round(k / T.ds) % N) + N) % N, c = e.canvas.getBoundingClientRect();
    const m = i(-60); e.view.cx = T.X[m]; e.view.cz = T.Z[m]; e.view.scale = 4; e.dirty = true;
    const sc = (d, s) => { const j = i(d); const [x, y] = e.w2s(T.X[j] + T.RX[j] * s, T.Z[j] + T.RZ[j] * s); return [c.left + x, c.top + y]; };
    return { a: sc(-90, 22), b: sc(-30, 22), mid: sc(-60, 22), mid2: sc(-60, 30), end2: sc(-20, 34) }; });
  const drag = async (p0, p1) => { await pg.mouse.move(...p0); await pg.mouse.down(); for (let k = 1; k <= 8; k++) await pg.mouse.move(p0[0] + (p1[0] - p0[0]) * k / 8, p0[1] + (p1[1] - p0[1]) * k / 8); await pg.mouse.up(); await pg.waitForTimeout(200); };
  await drag(canvas.a, canvas.b);
  const st = async (tag) => console.log(tag, JSON.stringify(await pg.evaluate(() => { const e = window.__svgp.editor, t = e.track; return { lines: t.propLines.length, sel: e.selLine, members: t.props.filter(p => p.ln).length, pts: t.propLines[0] && t.propLines[0].pts, gap: t.propLines[0] && t.propLines[0].gap }; })));
  await st('drawn');
  await pg.screenshot({ path: join(OUT, 'pe-line.png') });
  const onLine = async (f) => pg.evaluate((f) => { const e = window.__svgp.editor, L = e.track.propLines[0], c = e.canvas.getBoundingClientRect(); const x = L.pts[0][0] + (L.pts[1][0] - L.pts[0][0]) * f, z = L.pts[0][1] + (L.pts[1][1] - L.pts[0][1]) * f; const [sx, sy] = e.w2s(x, z); return [c.left + sx, c.top + sy]; }, f);
  const m0 = await onLine(0.5);
  await drag(m0, [m0[0] + 40, m0[1] + 30]); await st('moved');
  // the end node: drag it further out
  const endNode = await pg.evaluate(() => { const e = window.__svgp.editor, L = e.track.propLines[0], c = e.canvas.getBoundingClientRect(); const [x, y] = e.w2s(L.pts[1][0], L.pts[1][1]); return [c.left + x, c.top + y]; });
  await drag(endNode, canvas.end2); await st('node');
  // re-space through the panel's slider
  await pg.evaluate(() => { const i = document.getElementById('ln-gap'); i.dispatchEvent(new Event('pointerdown')); i.value = 6; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
  await st('respaced');
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(OUT, 'pe-line2.png') });
  // a single floodlight: its panel (strength)
  await pg.evaluate(() => { const e = window.__svgp.editor, T = e.T; e.selLine = null; e.propType = 'tp:floodmast'; e.finishPropLine({ x0: T.X[0] + T.RX[0] * 40, z0: T.Z[0] + T.RZ[0] * 40, x1: T.X[0] + T.RX[0] * 40, z1: T.Z[0] + T.RZ[0] * 40 }); e.renderItemTab(); });
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: join(OUT, 'pe-light.png'), clip: { x: 1080, y: 50, width: 320, height: 500 } });
} finally { await b.close(); server.kill(); }
