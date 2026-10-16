// dev: F8 in a race (main.js -> race.js devPitStop): your car's put short of the pit entry, boxing, and the crew
// drives it in to a stop at your box. FAIL lines are problems.   node .devtest/f8pit.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 5, grid: 'back', strategy: false, car: window.__svgp.settings.car }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.pitLife, null, { timeout: 180000 });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 60000 }).catch(async () => console.log('screen', await pg.evaluate(() => window.__svgp.screen)));
  await pg.evaluate(() => { const sim = window.__svgp.sim; sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9; });
  await pg.waitForTimeout(1000);
  // (F8 on the HUD calls this; the strategy screen's in the way headless)
  console.log('devPitStop', await pg.evaluate(() => window.__svgp.sim.devPitStop()));
  const s0 = await pg.evaluate(() => { const p = window.__svgp.sim.player; return { pitting: p.pitting, phase: p.pitPhase, req: p.pitReq }; });
  console.log(JSON.stringify(s0));
  check(s0.pitting && s0.phase === 'in', 'F8: boxing');
  // (headless is slow: the race run on by hand till the stop)
  const st = await pg.evaluate(() => {
    const sim = window.__svgp.sim, p = sim.player, seen = new Set();
    for (let i = 0; i < 60 * 40 && !(p.pitPhase === 'out' && seen.has('stop')); i++) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {}); seen.add(p.pitPhase); }
    return { seen: [...seen], phase: p.pitPhase, tyre: p.phys.tyre.c };
  });
  console.log(JSON.stringify(st));
  check(st.seen.includes('stop') && st.phase === 'out', `stopped at the box and out again (${st.seen.join(' > ')}, on ${st.tyre})`);
  await pg.screenshot({ path: join(OUT, 'f8-out.png') });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
