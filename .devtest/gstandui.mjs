// dev: drawing a modular grandstand in the Circuit Designer: the PROPS palette, a line drawn as a stand, its panel,
// lengthening it, undo; screenshots.   .devtest/guard.sh -m 6000 -t 300 node .devtest/gstandui.mjs "<track>" <outdir>
import { spawn } from 'child_process';
import { join } from 'path';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = process.cwd();
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [name, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const all = [JSON.parse(readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const track = all.find(q => q && q.name === name);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 900 });
  pg.on('pageerror', e => fail('page error ' + e.message));
  await pg.route(/tile\.openstreetmap|arcgisonline/, (r) => r.abort());
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), track); await pg.waitForTimeout(3000);
  await pg.evaluate(() => { const e = window.__svgp.editor; e.setTool('props'); });
  await pg.waitForTimeout(500);
  const tiles = await pg.evaluate(() => [...document.querySelectorAll('#tab-node *')].map(e => e.textContent).filter(t => /Grandstand|Grand Stand/.test(t || '')).slice(0, 4));
  console.log('palette mentions:', JSON.stringify(tiles.map(t => t.trim().slice(0, 60))));
  await pg.locator('#tab-node').screenshot({ path: join(out, 'palette.png') });
  // draw a 60 m stand beside the track, 30 m off it, at a tenth of the way round
  const r = await pg.evaluate(() => {
    const e = window.__svgp.editor, T = e.T, i = Math.floor(T.N * 0.1), off = -(T.W[i] / 2 + 30);
    const cx = T.X[i] + T.RX[i] * off, cz = T.Z[i] + T.RZ[i] * off;
    e.propType = 'tp:gs_M';
    e.finishPropLine({ x0: cx - T.FX[i] * 30, z0: cz - T.FZ[i] * 30, x1: cx + T.FX[i] * 30, z1: cz + T.FZ[i] * 30 });
    const t = e.track, L = t.propLines[t.propLines.length - 1], ps = t.props.filter(p => p.ln === L.id);
    e.view.cx = cx; e.view.cz = cz; e.view.scale = 3; e.dirty = true;
    return { line: L.type, pieces: ps.map(p => p.type.replace('gs_M_', '')), panel: document.querySelector('#tab-node h4')?.textContent };
  });
  console.log('drawn:', JSON.stringify(r));
  if (r.pieces.join(',') !== 'endL,bay,bay,tunnel,bay,bay,endR') fail('pieces ' + r.pieces);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(out, 'map.png') });
  await pg.locator('#tab-node').screenshot({ path: join(out, 'panel.png') });
  // make it longer: move its second node 24 m further along
  const longer = await pg.evaluate(() => {
    const e = window.__svgp.editor, t = e.track, L = t.propLines[t.propLines.length - 1], [a, b] = L.pts, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    e.push(); L.pts[1] = [b[0] + dx / l * 24, b[1] + dz / l * 24]; e.regenLine(L); e.changed();
    return t.props.filter(p => p.ln === L.id && /_(bay|tunnel)$/.test(p.type)).length;
  });
  console.log('bays after lengthening 24 m:', longer); if (longer !== 7) fail('lengthen');
  await pg.keyboard.press('Meta+z'); await pg.waitForTimeout(300); await pg.keyboard.press('Meta+z'); await pg.waitForTimeout(300);
  const left = await pg.evaluate(() => window.__svgp.editor.track.props.filter(p => /^gs_/.test(p.type)).length);
  console.log('after 2 undos, stand pieces:', left); if (left !== 0) fail('undo');
  console.log(process.exitCode ? 'FAILED' : 'PASS');
} finally { await b.close(); server.kill(); }
