// dev: how often cars crash out with Realistic damage in an ordinary race (everyone on the AI, you on autopilot)
//   node .devtest/crashrate.mjs [car] [laps]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', laps = +(process.argv[3] || 3);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, laps]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade';
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 11, aiChassis: 'class', car: S.car }, 'menu');
  }, [id, laps]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1, null, { timeout: 90000 });
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null; // (the page's own loop leaves it alone)
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const hits = [], orig = sim.breakCheck.bind(sim);
    sim.breakCheck = (car, v, part, lx, ly, lim) => { if (v > 14) hits.push(Math.round(v) + (lim < 25 ? 'c' : 'w') + (car.phys.dmg.ch >= 0.98 ? '!' : '') + (sim.cars.some(o => o !== car && o.wreck && Math.hypot(o.phys.x - car.phys.x, o.phys.z - car.phys.z) < 9) ? ' WRECK' : '') + (car.wreck ? ' (dead)' : '')); return orig(car, v, part, lx, ly, lim); };
    let f = 0; while (sim.state === 'racing' && f < 60 * 60 * 12) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {}); f++; }
    return { t: Math.round(f / 60), wrecks: sim.cars.filter(c => c.wreck).map(c => c.name + ' ' + c.wreck.kind + ' L' + c.lap), hits: hits.sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 15), feed: sim.rc.feed.filter(x => /Safety|Out/.test(x.msg)).map(x => x.msg) };
  });
  console.log(JSON.stringify(r, null, 1));
} finally { await b.close(); server.kill(); }
