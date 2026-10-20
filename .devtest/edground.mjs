// dev: MAP › Ground From Photo, used like a player: a real circuit with no ground map, the button, the map it makes
// (size, palette, how much is grass / sand / grey), shown on the 2D map, undo takes it off, redo puts it back.
//   node .devtest/edground.mjs <file.json> <outdir>
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const file = process.argv[2] || join(ROOT, 'tracks/real/zandvoort.json'), out = process.argv[3] || '/tmp';
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
  const t = JSON.parse(readFileSync(file, 'utf8')); delete t.ground;
  await pg.evaluate((t) => window.__svgp.openEditor(t), t);
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.__svgp.editor.showTab('map'));
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => !!document.getElementById('gnd-make')), 'Ground From Photo is in the MAP tab');
  const t0 = Date.now();
  await pg.click('#gnd-make');
  let last = '';
  for (;;) {
    const s = await pg.evaluate(() => { const e = document.getElementById('gnd-status'); return { msg: e ? e.textContent : '', err: e && e.classList.contains('err'), g: !!window.__svgp.editor.track.ground }; });
    if (s.msg !== last && !/\d+%/.test(s.msg + last) || /100%/.test(s.msg) && s.msg !== last) console.log('  ' + s.msg);
    last = s.msg;
    if (s.g || s.err) break;
    if (Date.now() - t0 > 600000) { ok(false, 'finished within 10 min'); break; }
    await pg.waitForTimeout(500);
  }
  const secs = (Date.now() - t0) / 1000;
  const G = await pg.evaluate(() => window.__svgp.editor.track.ground);
  ok(!!G, `made a ground map in ${secs.toFixed(0)} s`);
  if (G) {
    console.log(`  ${G.w}x${G.h} texels at ${G.res} m${G.ir ? ', infrared' : ', color only'}, ${(G.img.length * 0.75 / 1024).toFixed(0)} KB, ${G.credit}`);
    writeFileSync(join(out, 'edground.png'), Buffer.from(G.img.split(',')[1], 'base64'));
    // what it is made of: grass (green over red), sand (warm and bright), grey (paving)
    const mix = await pg.evaluate(async (img) => {
      const im = new Image(); im.src = img; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, k = { grass: 0, dry: 0, sand: 0, grey: 0, other: 0 }, cols = new Set();
      for (let o = 0; o < d.length; o += 4) {
        const r = d[o], gg = d[o + 1], b = d[o + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); cols.add(r << 16 | gg << 8 | b);
        if (mx - mn < 14) k.grey++; else if (gg - r > 8) k.grass++; else if (gg - r > -24 && r < 170) k.dry++; else if (r > 160) k.sand++; else k.other++;
      }
      const n = d.length / 4; for (const q in k) k[q] = Math.round(100 * k[q] / n); k.colours = cols.size; return k;
    }, G.img);
    console.log('  ' + JSON.stringify(mix));
    ok(mix.colours <= 20, 'a small palette');
    ok(mix.grass + mix.dry > 30 && mix.grey + mix.sand > 2 && mix.colours >= 8, 'mostly plants, some bare ground, several shades');
    await pg.screenshot({ path: join(out, 'edground_2d.png') });
    await pg.keyboard.press('Meta+z'); await pg.waitForTimeout(400);
    let g2 = await pg.evaluate(() => !!window.__svgp.editor.track.ground);
    if (g2) { await pg.evaluate(() => window.__svgp.editor.undo()); await pg.waitForTimeout(300); g2 = await pg.evaluate(() => !!window.__svgp.editor.track.ground); }
    ok(!g2, 'undo takes it off');
    await pg.evaluate(() => window.__svgp.editor.redo()); await pg.waitForTimeout(300);
    ok(await pg.evaluate(() => !!window.__svgp.editor.track.ground), 'redo puts it back');
  }
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
