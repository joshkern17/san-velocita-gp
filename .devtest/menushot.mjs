// dev: screenshot the menus   node .devtest/menushot.mjs <outdir> [only,these]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.', ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await pg.waitForTimeout(1500);
  const shot = async (n, js, wait = 900) => {
    if (ONLY && !ONLY.includes(n)) return;
    try { await pg.evaluate(js); } catch (e) { console.log(n, 'ERR', e.message.slice(0, 120)); return; }
    await pg.waitForTimeout(wait); await pg.screenshot({ path: join(OUT, n + '.png') }); console.log('shot', n);
  };
  const key = async (k) => { await pg.keyboard.press(k); await pg.waitForTimeout(250); };
  await shot('main', () => __svgp.open.main(), 1500);
  await shot('setup', () => __svgp.open.setup(), 2000);
  if (!ONLY || ONLY.includes('raceset')) { await key('Enter'); await pg.waitForTimeout(1200); await pg.screenshot({ path: join(OUT, 'raceset.png') }); console.log('shot raceset'); }
  await shot('career', () => __svgp.open.career(), 1200);
  await shot('online', () => __svgp.open.online());
  await shot('garage', () => __svgp.open.garage(), 2500);
  if (!ONLY || ONLY.some(n => n.startsWith('options'))) await pg.evaluate(() => __svgp.open.options()); await shot('options', () => 0);
  for (let t = 1; t < 5; t++) { if (ONLY && !ONLY.some(n => n.startsWith('options'))) break; await key('KeyE'); if (ONLY && !ONLY.includes('options' + t)) continue; await pg.screenshot({ path: join(OUT, 'options' + t + '.png') }); console.log('shot options' + t); }
  if (!ONLY || ONLY.some(n => n.startsWith('help'))) await pg.evaluate(() => __svgp.open.help()); await shot('help', () => 0);
  for (let t = 1; t < 4; t++) { if (ONLY && !ONLY.some(n => n.startsWith('help'))) break; await key('KeyE'); if (ONLY && !ONLY.includes('help' + t)) continue; await pg.screenshot({ path: join(OUT, 'help' + t + '.png') }); console.log('shot help' + t); }
  await shot('credits', () => __svgp.open.credits());
} finally { await b.close(); server.kill(); }
