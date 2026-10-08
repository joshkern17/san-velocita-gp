// dev: the Tuning screen, opened from the Garage like a player would (the Tuning row, Enter), each tab, a few
// adjustments made   node .devtest/tuneshot.mjs <outdir> [car chassis]
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
  await pg.addInitScript(() => { navigator.getGamepads = () => []; try { localStorage.removeItem('svgp.setups'); } catch (e) {} });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  await pg.evaluate((c) => { window.__svgp.settings.car.chassis = c; window.__svgp.open.garage(); }, CAR); await pg.waitForTimeout(2500);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await pg.keyboard.press(k); await pg.waitForTimeout(140); } };
  await key('ArrowDown'); await key('Enter'); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(OUT, 'tune-simple.png') }); console.log('shot simple');
  await key('ArrowDown'); await key('ArrowRight', 3); await key('ArrowDown', 2); await key('ArrowRight', 2); await pg.waitForTimeout(900);
  await pg.screenshot({ path: join(OUT, 'tune-simple-changed.png') }); console.log('shot simple changed');
  await key('KeyE'); await pg.waitForTimeout(900); await pg.screenshot({ path: join(OUT, 'tune-realistic.png') }); console.log('shot realistic');
  await key('ArrowDown', 12); await pg.waitForTimeout(600); await pg.screenshot({ path: join(OUT, 'tune-realistic2.png') }); console.log('shot realistic 2');
  await key('KeyE'); await pg.waitForTimeout(700); await pg.screenshot({ path: join(OUT, 'tune-saved.png') }); console.log('shot saved');
  // the Name row: a suggestion, then typing one
  await key('ArrowDown'); await key('ArrowRight'); await pg.waitForTimeout(300); await key('Enter'); await pg.waitForTimeout(300);
  await pg.keyboard.type('Monza Low'); await pg.waitForTimeout(200); await pg.screenshot({ path: join(OUT, 'tune-typing.png') }); console.log('shot typing');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(500); await pg.screenshot({ path: join(OUT, 'tune-named.png') }); console.log('shot named');
  // no sideways scrolling anywhere in the list, on every tab; and dragging turns the car
  for (let t = 0; t < 3; t++) { await key('KeyE'); console.log('tab', t, await pg.evaluate(() => { const m = document.getElementById('m-tuning'); return `scrollWidth ${m.scrollWidth} clientWidth ${m.clientWidth}`; })); }
  const before = await pg.evaluate(() => window.__svgp.garage ? window.__svgp.garage.yaw : null);
  await pg.mouse.move(1100, 450); await pg.mouse.down(); await pg.mouse.move(900, 430, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(500);
  await pg.screenshot({ path: join(OUT, 'tune-dragged.png') }); console.log('shot dragged');
  console.log('saved setups', await pg.evaluate(() => localStorage.getItem('svgp.setups')));
} finally { await b.close(); server.kill(); }
