// dev: the editor's PROPS > Trackside: tiles, lines of props (flags, boards, stands), a gantry dropped on the track,
// the logo panel   node .devtest/tpeditor.mjs <out.png>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9690 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async () => { const { presetTracks } = await import('/js/track.js'); window.__svgp.openEditor(presetTracks().find(t => t.name === 'Maple Ridge GP')); });
  await pg.waitForTimeout(2500);
  // (the scenery models: the logo sheet for the panel)
  await pg.evaluate(async () => { const { loadEnvModels } = await import('/js/envlib.js'); await loadEnvModels(); });
  const res = await pg.evaluate(() => {
    const e = window.__svgp.editor, T = e.T, N = T.N;
    e.setTool('props'); e.propCat = 'track';
    const at = (d, s) => { const i = ((Math.round(d / T.ds) % N) + N) % N; return [T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s]; };
    const line = (type, a, b2) => { e.propType = type; const [x0, z0] = a, [x1, z1] = b2; e.finishPropLine({ x0, z0, x1, z1 }); };
    const n0 = e.track.props.length;
    line('tp:flag', at(-120, 22), at(-60, 22));
    line('tp:board', at(-50, 19), at(10, 19));
    line('tp:stand_roof', at(-100, 34), at(-40, 34));
    line('tp:gantry_wide', at(60, 0), at(60, 0));
    e.propType = 'tp:stand_roof'; e.view.cx = T.X[((Math.round(-50 / T.ds) % N) + N) % N]; e.view.cz = T.Z[((Math.round(-50 / T.ds) % N) + N) % N]; e.view.scale = 3.2;
    e.selProp = -1; e.renderItemTab(); e.dirty = true;
    return { placed: e.track.props.length - n0, last: e.track.props.slice(-3) };
  });
  console.log(JSON.stringify(res));
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: process.argv[2] });
  // the panel, scrolled to the lines and logos
  await pg.evaluate(() => { const el = document.getElementById('tab-node'); let p = el; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = p.scrollHeight; });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: process.argv[2].replace('.png', '-panel.png'), clip: { x: 1080, y: 50, width: 320, height: 850 } });
} finally { await b.close(); server.kill(); }
