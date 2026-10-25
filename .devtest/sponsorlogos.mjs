// dev: the sponsors' logos in the game (js/sponsorlogos.js). The garage car's sponsor sticker in each version, the
// livery designer's "+ Sponsor logo", the trackside billboards and wall ads, every logo file loading.
//   node .devtest/sponsorlogos.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 9800 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  pg.on('response', r => { if (/assets\/sponsors/.test(r.url()) && r.status() >= 400) { console.log('MISSING', r.url()); fails++; } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  const ev = (fn, a) => pg.evaluate(fn, a);

  // every logo, every version, decodes
  const bad = await ev(async () => {
    const L = await import('./js/sponsorlogos.js'), miss = [];
    // (8 at a time: serve.py drops the odd one when all 128 ask at once)
    const all = Object.keys(L.SPONSOR_LOGOS).flatMap(s => Object.keys(L.LOGO_VERSIONS).map(v => [s, v]));
    for (let k = 0; k < all.length; k += 8) await Promise.all(all.slice(k, k + 8).map(([s, v]) => new Promise(r => { const i = new Image(); i.onload = () => r(); i.onerror = () => { miss.push(s + '/' + v); r(); }; i.src = L.logoUrl(s, v); })));
    return miss;
  });
  ok(!bad.length, `all 32 logos x 4 versions load${bad.length ? ': ' + bad.join(', ') : ''}`);
  // the sticker names on cars find their logos
  const names = await ev(async () => { const L = await import('./js/sponsorlogos.js'); return ['VOLTA', 'KOBRA', 'NEON FM', 'RAPID', 'BURGER DUCK', 'SUNSET', 'SVGP', 'MESA', 'BAYSIDE', 'PINE', 'DALES TIRE &', 'PORT AZURE', 'LUCKY LOUS', 'SCUDERIA'].map(n => [n, L.logoForName(n)]); });
  for (const [n, s] of names) ok(n === 'SCUDERIA' ? !s : !!s, `${n} -> ${s}`);

  // garage: the sponsor sticker on the M1 (flanks) and the F1 (sidepods), each version, seen from the side; the
  // driver with the sponsor on his chest and visor strip
  await ev(() => window.__svgp.open.garage()); await pg.waitForTimeout(2500);
  for (const [car, v] of [['m1procar', 'color'], ['m1procar', 'white'], ['m1procar', 'name'], ['custom', 'color'], ['custom', 'black']]) {
    await ev(([car, v]) => { const s = window.__svgp.settings, G = window.__svgp.garage; Object.assign(s.car, { chassis: car, sponsor: 'KOBRA', sponsorLogo: v, stickers: undefined, showSponsor: true, decals: [] }); G.setCar(s.car); }, [car, v]);
    await pg.waitForTimeout(2500);
    await ev(() => { const G = window.__svgp.garage; G.table.rotation.y = 0; G.spin = 0; G.view('left'); });
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: join(out, `garage_${car}_${v}.png`), clip: { x: 500, y: 150, width: 900, height: 600 } });
  }
  await ev(() => { const s = window.__svgp.settings, G = window.__svgp.garage; s.car.suit = { ...(s.car.suit || {}), chest: 'sponsor' }; s.car.helmetDesign = { ...(s.car.helmetDesign || {}), strip: 'sponsor' }; s.car.sponsorLogo = 'color'; G.setCar(s.car); });
  await pg.waitForTimeout(3000);
  await ev(() => window.__svgp.garage.view('driver')); await pg.waitForTimeout(300);
  await pg.screenshot({ path: join(out, 'garage_driver.png'), clip: { x: 500, y: 100, width: 900, height: 700 } });
  // the livery designer: "+ Sponsor logo" puts Volta Cola on the car; Version swaps it for the white one; the sponsor
  // sticker (a decal now) shows its logo and offers the versions too
  await ev(() => { const s = window.__svgp.settings; Object.assign(s.car, { chassis: 'custom', decals: [], stickers: undefined, sponsor: 'KOBRA', sponsorLogo: 'color' }); window.__svgp.garage.setCar(s.car); });
  await pg.getByText('Livery Designer', { exact: true }).first().click(); await pg.waitForTimeout(1500);
  await pg.click('#lv-tabs button[data-tab="decals"]'); await pg.waitForTimeout(500);
  await pg.selectOption('#lv-addlogo', 'volta-cola'); await pg.waitForTimeout(800);
  const dec = () => ev(() => window.__svgp.settings.car.decals.map(d => d.asset || (d.bind ? 'bind:' + (d.logo || 'color') : '?')));
  const d1 = await dec();
  ok(d1.includes('sp:volta-cola:color'), `+ Sponsor logo added ${JSON.stringify(d1)}`);
  await pg.click('#lv-dlv button[data-v="white"]'); await pg.waitForTimeout(800);
  const d2 = await dec();
  ok(d2.includes('sp:volta-cola:white') && !d2.includes('sp:volta-cola:color'), `Version -> white ${JSON.stringify(d2)}`);
  await pg.click('#lv-list .lv-item[data-i="0"]'); await pg.waitForTimeout(400);
  const hasSeg = await ev(() => !!document.querySelector('#lv-dlv button[data-v="name"]'));
  ok(d2[0].startsWith('bind:') && hasSeg, 'the sponsor sticker decal offers its logo versions and Name only');
  await pg.screenshot({ path: join(out, 'designer.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(800);

  // trackside textures, drawn out flat (once their logos have loaded)
  await ev(async () => (await import('./js/textures.js')).getTextures()); await pg.waitForTimeout(3000);
  const shots = await ev(async () => {
    const T = (await import('./js/textures.js')).getTextures(), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = 1024; c.height = 128 + 4 * 136;
    g.drawImage(T.wall.image, 0, 0);
    T.billboards.forEach((t, i) => g.drawImage(t.image, (i % 4) * 256, 136 + Math.floor(i / 4) * 136));
    return c.toDataURL();
  });
  const fs = await import('fs');
  fs.writeFileSync(join(out, 'trackside.png'), Buffer.from(shots.split(',')[1], 'base64'));
  console.log('wrote', join(out, 'trackside.png'));
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
