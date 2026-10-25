// dev: an endurance race's moving time of day, seen like a player: a timed race with a start hour, the autopilot
// driving, a chase shot every few seconds of race clock (afternoon, dusk, night, dawn...)
//   node .devtest/todshot.mjs <outdir> [track preset name=Maple Ridge GP] [startHour=14] [real seconds for 24 h=90]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', NAME = process.argv[3] || 'Maple Ridge GP', H0 = +(process.argv[4] || 14), DAY = +(process.argv[5] || 90);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 800, height: 450 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async ([NAME, H0, DAY, PLAIN]) => {
    const { presetTracks } = await import('/js/track.js');
    let t = presetTracks().find(t => t.name === NAME);
    if (!t) { const R = await import('/js/realtracks.js'); await R.realTracksReady(); t = await R.hydrateReal(JSON.parse(JSON.stringify(R.realTracks().find(x => x.name === NAME)))); }
    t.env.weather = 'clear';
    window.__autopilot = true;
    // (PLAIN=night: a plain race at that time of day instead, to compare)
    if (PLAIN) { t.env.time = PLAIN; window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 5, car: window.__svgp.settings.car, extra: { strategy: false } }, 'menu'); return; }
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 5, car: window.__svgp.settings.car, extra: { duration: DAY, clockK: 86400 / DAY, startHour: H0, strategy: false } }, 'menu');
  }, [NAME, H0, DAY, process.env.PLAIN || '']);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.state === 'racing', null, { timeout: 180000 });
  await pg.addStyleTag({ content: '#s-pause{display:none!important}' });
  if (process.env.PLAIN) { await pg.waitForTimeout(3000); await pg.screenshot({ path: join(out, `plain_${process.env.PLAIN}.png`) }); process.exit(0); }
  // (headless draws slowly: the race clock is moved on to each hour, the next frames take the world there)
  for (let k = 0; k < 9; k++) {
    await pg.evaluate(([k, DAY]) => { const s = window.__svgp.sim; s.raceTime = DAY / 9 * k; s.todT = null; }, [k, DAY]);
    await pg.waitForTimeout(1500);
    const h = await pg.evaluate(() => { const s = window.__svgp.sim; return { tod: s.todHour() % 24, k: s.world.nightK(), night: s.night, t: s.raceTime }; });
    const name = `tod_${String(k).padStart(2, '0')}_${h.tod.toFixed(1)}h.png`;
    await pg.screenshot({ path: join(out, name) });
    console.log(`${name}  night ${h.k.toFixed(2)} headlights ${h.night}  race ${h.t.toFixed(0)} s`);
  }
} finally { await b.close(); server.kill(); }
