// dev: the editor's Get Street Details Only button (streetdata.js): open the track, MAP tab, click it, wait; the track
// has osm.street, nothing else in its import changed, the map shows them (a zoomed screenshot at ZOOM=x,z,scale).
//   .devtest/guard.sh -m 6000 -t 300 node .devtest/streetui.mjs <file.svgp.json> [outdir] [--write out.json]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [file, out = join(ROOT, '.devtest/out/streetui')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const j = JSON.parse(readFileSync(file, 'utf8')), track = j.track || j;
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 900 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => fail('page error ' + e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), track);
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => window.__svgp.editor.showTab('map')); await pg.waitForTimeout(600);
  const before = await pg.evaluate(() => { const o = window.__svgp.editor.track.osm; return o ? JSON.stringify({ b: o.buildings.length, t: o.trees.length, w: (o.water || []).length }) : 'none'; });
  const label = await pg.evaluate(() => (document.getElementById('map-street') || {}).textContent);
  console.log('button:', label); if (!/Street Details/.test(label || '')) fail('no Get Street Details Only button');
  const t0 = Date.now();
  await pg.evaluate(() => document.getElementById('map-street').click());
  for (;;) {
    await pg.waitForTimeout(1000);
    const st = await pg.evaluate(() => ({ done: !!(window.__svgp.editor.track.osm && window.__svgp.editor.track.osm.street), msg: (document.getElementById('map-status') || {}).textContent || '', err: ((document.getElementById('map-status') || {}).className || '').includes('err') }));
    if (st.done || st.err || Date.now() - t0 > 200000) { if (st.err) fail(st.msg); break; }
  }
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(() => { const o = window.__svgp.editor.track.osm, s = o.street; return { counts: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length])), after: JSON.stringify({ b: o.buildings.length, t: o.trees.length, w: (o.water || []).length }) }; });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s:`, JSON.stringify(r.counts));
  console.log('import before', before, 'after', r.after); if (before !== r.after) fail('the rest of the import changed');
  const wi = process.argv.indexOf('--write');
  if (wi > 0) { const tr = await pg.evaluate(() => JSON.stringify(window.__svgp.editor.track)); (await import('fs')).writeFileSync(process.argv[wi + 1], tr); console.log('wrote', process.argv[wi + 1]); }
  const Z = (process.env.ZOOM || '').split(',').map(Number);
  if (Z.length === 3) await pg.evaluate(([x, z, s]) => { const e = window.__svgp.editor; e.view.cx = x; e.view.cz = z; e.view.scale = s; e.dirty = true; }, Z);
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(out, 'map.png') });
  console.log(process.exitCode ? 'FAILED' : 'PASS');
} finally { await b.close(); server.kill(); }
