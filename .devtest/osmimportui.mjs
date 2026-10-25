// dev: the Circuit Designer's MAP tab import with roads, clicked like a player would (the map server answered from the
// cache osmfetch.mjs wrote): the panel, the import, undo, the sidewalk switch, Remove Imported Roads; screenshots.
//   .devtest/guard.sh -m 6000 -t 400 node .devtest/osmimportui.mjs "<track name>" <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [name, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const all = [JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.editorWork.txt'), 'utf8')), ...JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8'))];
const track = all.find(q => q && q.name === name);
const cached = readFileSync(join(ROOT, `.devtest/out/roads/${name.replace(/\W+/g, '_')}.osm.json`), 'utf8');
const data = JSON.stringify(JSON.parse(cached).data);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 900 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => fail('page error ' + e.message));
  let query = '';
  await pg.route(/overpass|interpreter/, (r) => { query = decodeURIComponent((r.request().postData() || '').replace(/^data=/, '')); r.fulfill({ status: 200, contentType: 'application/json', body: data }); });
  await pg.route(/tile\.openstreetmap|arcgisonline/, (r) => r.abort());
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), track);
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__svgp.editor.showTab('map'));
  await pg.waitForTimeout(400);
  await pg.locator('#tab-map').screenshot({ path: join(out, 'panel.png') });
  const before = await pg.evaluate(() => { const r = window.__svgp.editor.track.roads || []; return { own: r.filter(q => !q.osm).length, osm: r.filter(q => q.osm).length }; });
  console.log('before: your roads', before.own, '| imported already', before.osm);
  await pg.click('#map-import');
  await pg.waitForFunction(() => /Imported/.test(document.getElementById('map-status')?.textContent || ''), null, { timeout: 120000 });
  const after = await pg.evaluate(() => { const t = window.__svgp.editor.track; return { roads: t.roads.filter(r => r.osm).length, walks: t.roads.filter(r => r.osm && r.walk > 0).length, lots: t.osm.buildings.filter(b => b.lot).length, map: t.osm.buildings.filter(b => !b.lot).length, status: document.getElementById('map-status').textContent }; });
  const squares = (query.match(/way\["building"\]/g) || []).length;
  console.log('squares along the track:', squares, '| query chars', query.length);
  console.log('after import', JSON.stringify(after));
  if (!after.roads) fail('no roads imported');
  if (squares < 2) fail('query is one box, not squares along the track');
  await pg.waitForTimeout(3000);
  await pg.screenshot({ path: join(out, 'editor.png') });
  await pg.locator('#tab-map').screenshot({ path: join(out, 'panel-after.png') });
  // sidewalks off, then back to the map's
  await pg.click('#map-walk button[data-v="off"]'); await pg.waitForTimeout(300);
  const off = await pg.evaluate(() => window.__svgp.editor.track.roads.filter(r => r.osm && r.walk > 0).length);
  await pg.click('#map-walk button[data-v="map"]'); await pg.waitForTimeout(300);
  const on = await pg.evaluate(() => window.__svgp.editor.track.roads.filter(r => r.osm && r.walk > 0).length);
  console.log('sidewalks off ->', off, '| from map ->', on); if (off !== 0 || on !== after.walks) fail('sidewalk switch');
  // undo the sidewalk changes and the import
  for (let k = 0; k < 3; k++) { await pg.keyboard.press('Meta+z'); await pg.waitForTimeout(400); }
  const undone = await pg.evaluate(() => (window.__svgp.editor.track.roads || []).filter(r => r.osm).length);
  console.log('after 3 undos, imported roads', undone); if (undone !== before.osm) fail('undo did not take the import back');
  for (let k = 0; k < 3; k++) { await pg.keyboard.press('Meta+Shift+z'); await pg.waitForTimeout(400); }
  await pg.evaluate(() => window.__svgp.editor.showTab('map')); await pg.waitForTimeout(300);
  const redone = await pg.evaluate(() => (window.__svgp.editor.track.roads || []).filter(r => r.osm).length);
  if (redone && await pg.$('#map-clear-roads')) {
    await pg.click('#map-clear-roads'); await pg.waitForTimeout(500);
    const left = await pg.evaluate(() => ({ roads: window.__svgp.editor.track.roads.length, lots: (window.__svgp.editor.track.osm?.buildings || []).filter(b => b.lot).length }));
    console.log('remove imported roads ->', JSON.stringify(left), '(had', before.own, 'of your own)'); if (left.roads !== before.own || left.lots) fail('remove imported roads');
  } else console.log('redo:', redone, '(skipped the remove test)');
  console.log(process.exitCode ? 'FAILED' : 'PASS');
} finally { await b.close(); server.kill(); }
