// dev: the garage's On Track board (main.js renderTrackBoard) a few minutes into a live session.
//   node .devtest/boardshot.mjs [outdir] [secs into the session]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', SECS = +(process.argv[3] || 150);
const PORT = 8990 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (TRACK) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 9, pick: false }, 'setup', 'quali', [1200, 1200]);
  }, process.env.TRACK);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 180000 });
  await pg.evaluate((secs) => { const s = window.__svgp.sim; for (let i = 0; i < 60 * secs; i++) s.update(1 / 60, {}, {}); }, SECS);
  await pg.waitForTimeout(2500);
  console.log(JSON.stringify(await pg.evaluate(() => window.__svgp.sim.live.board().map(r => r.name + ':' + r.label))));
  await pg.screenshot({ path: join(OUT, 'board.png') });
} finally { await b.close(); server.kill(); }
