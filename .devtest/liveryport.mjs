// dev: a team livery's decals moved to a car with no version of it (liveries.js portDecals): decals placed on the M1
// ProCar, saved, then the Civic and the F1 car wear it; shots from the left, the top and behind of each.
//   node .devtest/liveryport.mjs <shotdir>   (run via .devtest/guard.sh -m 5000)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 9700 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 820 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.removeItem('svgp.teams'); } });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { window.__svgp.dbg.switchCar('m1procar'); window.__svgp.open.garage(); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-garage' && window.__svgp.garage.car?.def, null, { timeout: 30000 });
  await pg.waitForTimeout(1500);
  // decals on the M1: a door roundel, a name near the nose on the flank, one on the bonnet, one on the tail
  await pg.evaluate(() => {
    const S = window.__svgp, c = S.settings.car, P = S.garage.car.def.panels, t = (o) => ({ id: 'd' + Math.random().toString(36).slice(2, 7), rot: 0, opacity: 1, mirror: true, flip: false, font: 'impact', color: 0xffffff, outline: 0x000000, ...o });
    c.main = 0x1d4fb8; c.accent = 0xf2f2f2; c.pattern = 'solid'; c.stickers = 'decals';
    c.decals = [t({ panel: 'sideL', x: P.sideL.W * 0.5, y: P.sideL.H * 0.55, size: 0.3, text: 'DOOR' }), t({ panel: 'sideL', x: P.sideL.W * 0.12, y: P.sideL.H * 0.6, size: 0.12, text: 'NOSE' }),
      t({ panel: 'top', x: P.top.W * 0.5, y: P.top.H * 0.15, size: 0.18, text: 'HOOD', rot: -90, mirror: false }), t({ panel: 'rear', x: P.rear.W * 0.5, y: P.rear.H * 0.55, size: 0.12, text: 'TAIL', mirror: false })];
    S.garage.setCar(c);
  });
  const click = (re) => pg.evaluate((re) => { const e = [...document.querySelectorAll('#m-garage .item')].find(e => new RegExp(re, 'i').test(e.innerText)); if (e) e.click(); return !!e; }, re);
  await click('^Saved Liveries'); await pg.waitForTimeout(300); await click('^Save This Livery'); await pg.waitForTimeout(300);
  await pg.fill('.lv-type', 'Port Test'); await pg.press('.lv-type', 'Enter'); await pg.waitForTimeout(500); await click('^Back'); await pg.waitForTimeout(500);
  const shots = async (name) => { for (const v of ['left', 'top', 'rear']) { await pg.evaluate((v) => window.__svgp.garage.view(v), v); await pg.waitForTimeout(1600); await pg.screenshot({ path: join(out, `port-${name}-${v}.png`), clip: { x: 300, y: 120, width: 1100, height: 600 } }); } };
  await shots('m1');
  for (const ch of ['civic', 'custom']) {
    await pg.evaluate((ch) => window.__svgp.dbg.switchCar(ch), ch); await pg.waitForTimeout(1500);
    const r = await pg.evaluate(() => ({ design: window.__svgp.settings.car.design, decals: window.__svgp.settings.car.decals.map(d => `${d.text}:${d.panel} ${d.x},${d.y} s${d.size} r${Math.round(d.rot)}`) }));
    console.log(ch, r.design ? 'in the livery' : 'NOT IN LIVERY', '\n  ' + r.decals.join('\n  '));
    if (!r.design || r.decals.length !== 4) fails++;
    await shots(ch);
  }
  await click('^Saved Liveries'); await pg.waitForTimeout(400);
  console.log('desc:', await pg.evaluate(() => { const e = [...document.querySelectorAll('#m-garage .item')].find(e => /PORT TEST/i.test(e.innerText)); e.dispatchEvent(new MouseEvent('mousemove', { screenX: 5, screenY: 5 })); return document.getElementById('d-garage')?.innerText; }));
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
