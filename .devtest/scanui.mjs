// dev: the editor's Real Houses & Trees button (scan.js): open the track, MAP tab, click Get Real Houses & Trees, wait
// for it; the track has its scan, the panel says so, the scenery has the real buildings, the file can be written.
//   .devtest/guard.sh -m 6000 -t 400 node .devtest/scanui.mjs <file.svgp.json> [outdir] [--write out.json]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [file, out = join(ROOT, '.devtest/out/scanui')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
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
  const label = await pg.evaluate(() => (document.getElementById('scan-get') || {}).textContent);
  console.log('button:', label); if (!/Real Houses/.test(label || '')) fail('no Get Real Houses & Trees button');
  const t0 = Date.now();
  await pg.evaluate(() => document.getElementById('scan-get').click());
  let last = '';
  for (;;) {
    await pg.waitForTimeout(1000);
    const st = await pg.evaluate(() => ({ done: !!window.__svgp.editor.track.scan, msg: (document.getElementById('scan-status') || {}).textContent || '', err: ((document.getElementById('scan-status') || {}).className || '').includes('err') }));
    if (st.msg !== last && st.msg.split('…')[0] !== last.split('…')[0]) console.log('  ', st.msg); last = st.msg;
    if (st.done || st.err || Date.now() - t0 > 300000) { if (st.err) fail(st.msg); break; }
  }
  await pg.waitForTimeout(4000);
  const r = await pg.evaluate(() => { const e = window.__svgp.editor, sc = e.track.scan; return sc && { houses: sc.houses.length, trees: sc.trees.length, panel: (document.getElementById('tab-map').innerText.match(/Real: [^\n]*/) || [''])[0], attr: document.getElementById('ed-attr').textContent }; });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s:`, JSON.stringify(r));
  if (!r || !r.houses) fail('no scan on the track');
  const wi = process.argv.indexOf('--write');
  if (wi > 0) { const tr = await pg.evaluate(() => JSON.stringify(window.__svgp.editor.track)); (await import('fs')).writeFileSync(process.argv[wi + 1], tr); console.log('wrote', process.argv[wi + 1]); }
  await pg.screenshot({ path: join(out, 'map-tab.png') });
  console.log(process.exitCode ? 'FAILED' : 'PASS');
} finally { await b.close(); server.kill(); }
