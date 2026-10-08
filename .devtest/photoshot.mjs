// dev: photo mode: a race on the grid, paused, photo mode open, a few poses / lenses screenshotted
//   node .devtest/photoshot.mjs [car] [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), id = process.argv[2] || 'm1procar', OUT = process.argv[3] || '/tmp';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ acceptDownloads: true }); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text().slice(0, 200)); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (id) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 5, aiChassis: 'class', grid: 'back', car: window.__svgp.settings.car }, 'menu');
  }, id);
  for (let i = 0; i < 40; i++) { const st = await pg.evaluate(() => [window.__svgp.screen, window.__svgp.sim?.state, window.__svgp.sim?.drivers?.people?.length]); if (i % 5 === 0) console.log(st); if (st[0] === 'hud' && st[2] > 3) break; if (st[0] === 's-carsel' || st[0] === 's-strat') await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); }
  await pg.waitForTimeout(800);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  await pg.locator('#m-pause .item', { hasText: 'Photo Mode' }).click(); await pg.waitForTimeout(1500);
  console.log('screen', await pg.evaluate(() => window.__svgp.screen));
  const fr = () => pg.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => (++n < 10 ? requestAnimationFrame(f) : r((performance.now() - t0) / 10)); requestAnimationFrame(f); }));
  console.log('ms/frame', await fr());
  console.log(await pg.evaluate(() => { const s = window.__svgp.sim, c = s.camera, g = s.player.model.group; const P = window.__svgp.photo, gp = [...navigator.getGamepads()].filter(Boolean).map(p => [p.id, p.mapping, p.axes.map(v => +v.toFixed(2)), p.buttons.map(b => +b.value.toFixed(2))]); return JSON.stringify({ gp, P: [P.yaw, P.pitch, P.dist, P.mm, P.slide, P.lift], cam: c.position.toArray().map(v => +v.toFixed(2)), car: g.position.toArray().map(v => +v.toFixed(2)), gh: s.world.groundHeight(c.position.x, c.position.z), fov: c.fov, near: c.near, far: c.far, carY: s.player.y }); }));
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await pg.keyboard.press(k); await pg.waitForTimeout(1300); } };
  // 135 mm, f/1.4 (Lens row: right x3 from 35-ish; Aperture: 6 rows down, left once from f/2.8)
  await key('ArrowRight', 3); await key('ArrowDown', 6); await key('ArrowLeft'); await pg.waitForTimeout(2000);
  await pg.screenshot({ path: `${OUT}/photo-${id}-2.png` });
  // look off to the right of the car
  await pg.keyboard.down('KeyL'); await pg.waitForTimeout(2500); await pg.keyboard.up('KeyL'); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: `${OUT}/photo-${id}-3.png` });
  await key('KeyC'); await pg.waitForTimeout(1500);
  const dl = pg.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await pg.keyboard.press('Space');
  const d = await dl; if (d) { await d.saveAs(`${OUT}/photo-${id}-shot.png`); console.log('saved', d.suggestedFilename()); } else console.log('NO DOWNLOAD');
  await pg.waitForTimeout(1000);
  await pg.screenshot({ path: `${OUT}/photo-${id}-4.png` });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(3000);
  console.log('back to', await pg.evaluate(() => window.__svgp.screen));
} finally { await b.close(); server.kill(); }
