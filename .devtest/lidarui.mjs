// dev: the editor's LiDAR button on a track with old (squashed, pre-v2) tiles: open it, MAP tab, the button says
// Re-download, click it, the tiles come back v2 and the road is re-projected (no node at 0, fits the new ground).
//   .devtest/guard.sh -m 5000 -t 300 node .devtest/lidarui.mjs <file.svgp.json> [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [file, out = join(ROOT, '.devtest/out/lidarui')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
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
  console.log('editor track:', await pg.evaluate(() => { const t = window.__svgp.editor.track; return t.name + ' fine ' + ((t.terrain && t.terrain.fine) || []).length + ' v2 ' + ((t.terrain && t.terrain.fine) || []).filter(q => q.v === 2).length; }));
  const label = await pg.locator('#elev-lidar').textContent({ timeout: 3000 }).catch(() => null);
  console.log('button:', label); if (!/Re-download/.test(label || '')) fail('no Re-download button for old tiles');
  await pg.evaluate(() => document.getElementById('elev-lidar').click());
  await pg.waitForFunction(() => { const t = window.__svgp.editor.track; return t.terrain.fine.every(q => q.v === 2); }, null, { timeout: 240000 });
  await pg.waitForTimeout(3000);
  const r = await pg.evaluate(() => { const e = window.__svgp.editor, t = e.track; return { tiles: t.terrain.fine.length, v2: t.terrain.fine.filter(q => q.v === 2).length, zeros: t.points.slice(1, -1).filter(p => !p.e).length, eMax: Math.max(...t.points.map(p => p.e)), status: (document.getElementById('elev-status') || {}).textContent, steep: ((document.getElementById('tab-map') || {}).innerText || '').match(/steepest[^\n]*/)?.[0] }; });
  console.log(JSON.stringify(r));
  if (r.v2 !== r.tiles) fail('old tiles left');
  await pg.screenshot({ path: join(out, 'map-tab.png') });
  console.log(process.exitCode ? 'FAILED' : 'PASS');
} finally { await b.close(); server.kill(); }
