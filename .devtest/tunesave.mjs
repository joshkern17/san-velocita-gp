// dev: Tuning's saving (a draft until Save; Esc with changes warns, a second Esc leaves them) and the setup's look on
// the Garage car (ride height, camber)   node .devtest/tunesave.mjs <outdir> [car]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.', CAR = process.argv[3] || 'm1procar';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message)); 
  await pg.addInitScript(() => { navigator.getGamepads = () => []; try { if (!sessionStorage.getItem('x')) { localStorage.removeItem('svgp.setups'); sessionStorage.setItem('x', 1); } } catch (e) {} });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate((c) => { window.__svgp.settings.car.chassis = c; window.__svgp.open.garage(); }, CAR); await pg.waitForTimeout(2500);
  // (held a moment: headless frames are slow, a quick tap can fall between two of them)
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await pg.keyboard.down(k); await pg.waitForTimeout(110); await pg.keyboard.up(k); await pg.waitForTimeout(140); } };
  const sub = () => pg.evaluate(() => document.getElementById('tn-sub').textContent);
  const store = () => pg.evaluate(() => localStorage.getItem('svgp.setups'));
  const screenNow = () => pg.evaluate(() => [...document.querySelectorAll('.screen')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id).join(','));
  await key('ArrowDown'); await key('Enter'); await pg.waitForTimeout(2200);
  // 1) change something, Esc: it warns; Esc again: out, nothing saved
  console.log('row before:', await pg.evaluate(() => document.querySelector('#m-tuning .item.sel')?.textContent));
  await pg.evaluate(() => document.querySelector('#m-tuning .item.sel .arr[data-d="1"]').click()); await pg.waitForTimeout(300);
  console.log('after a click:', await sub(), await pg.evaluate(() => document.querySelector('#m-tuning .item.sel')?.textContent));
  await key('ArrowRight', 2); console.log('after a change:', await sub());
  console.log('row after:', await pg.evaluate(() => document.querySelector('#m-tuning .item.sel')?.textContent), '| strip busy', await pg.evaluate(() => document.getElementById('tn-resp').className));
  await key('Escape'); await pg.waitForTimeout(300); console.log('first Esc:', await sub(), '| screen', await screenNow());
  await key('Escape'); await pg.waitForTimeout(800); console.log('second Esc: screen', await screenNow(), '| saved:', await store());
  if (process.env.STOP) process.exit(0);
  // 2) the look: back in, the camera still and close, standard vs low + camber
  await key('Enter'); await pg.waitForTimeout(2200);
  await pg.mouse.move(1000, 500); await pg.mouse.down(); await pg.mouse.move(1001, 500); await pg.mouse.up();
  await pg.evaluate(() => { const g = window.__svgp.garage; if (g) { g.yaw = 0.25; g.pitch = 0.05; g.dist = 5.2; } }); await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(OUT, 'look-standard.png') });
  await key('KeyE'); await pg.waitForTimeout(500);
  // (Realistic: Aero head, Front Wing, Rear Wing, Ride Height Front, Ride Height Rear, Suspension..., Alignment: cambers)
  await key('ArrowDown', 2); await key('ArrowLeft', 6); await key('ArrowDown'); await key('ArrowLeft', 6);
  for (let i = 0; i < 12; i++) { const l = await pg.evaluate(() => document.querySelector('#m-tuning .item.sel .lbl')?.textContent || ''); if (/front camber/i.test(l)) break; await key('ArrowDown'); }
  await key('ArrowLeft', 15); await key('ArrowDown'); await key('ArrowLeft', 20);
  await pg.evaluate(() => { const g = window.__svgp.garage; if (g) { g.yaw = 0.25; g.pitch = 0.05; g.dist = 5.2; } }); await pg.waitForTimeout(900);
  await pg.screenshot({ path: join(OUT, 'look-low.png') }); console.log('changed:', await sub());
  // 3) Save: stored, the caption clean
  for (let i = 0; i < 40; i++) { const l = await pg.evaluate(() => document.querySelector('#m-tuning .item.sel .lbl')?.textContent || ''); if (/^save/i.test(l)) break; await key('ArrowDown'); }
  await key('Enter'); await pg.waitForTimeout(400); console.log('after Save:', await sub(), '| saved:', (await store() || '').slice(0, 160));
  await key('Escape'); await pg.waitForTimeout(800); console.log('Esc after saving: screen', await screenNow());
} finally { await b.close(); server.kill(); }
