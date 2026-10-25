// dev: a lone standing start, the AI's launch against flat out (you holding full throttle on the car's traction
// control): speed and distance at 1/2/3/4/5 s. Shows how much the AI's own throttle control costs it off the line.
//   node .devtest/launchvs.mjs [car...]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['m1procar'];
try {
  for (const id of ids) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
    await pg.evaluate(async (id) => {
      const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
      window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
      window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, aiChassis: 'class', grid: 'back', car: window.__svgp.settings.car }, 'menu');
    }, id);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
    const out = await pg.evaluate(() => {
      const sim = window.__svgp.sim, pl = sim.player, p = pl.phys;
      const x0 = p.x, z0 = p.z, h0 = p.h, res = {};
      for (const mode of ['ai', 'flat']) {
        p.place(x0, z0, h0); pl.ai = null; pl.handT = null;
        sim.state = 'racing'; sim.stateT = 0; sim.raceTime = 0; pl.autoT = mode === 'ai' ? 1e9 : 0;
        const r = [];
        for (let f = 1; f <= 300; f++) {
          sim.update(1 / 60, { steer: 0, throttle: mode === 'flat' ? 1 : 0, brake: 0, handbrake: 0 }, {});
          if (f % 60 === 0) r.push(`${(p.speed * 3.6).toFixed(0)}km/h ${Math.hypot(p.x - x0, p.z - z0).toFixed(0)}m`);
        }
        res[mode] = r.join('  ');
      }
      return res;
    });
    console.log(`${id}\n  AI    ${out.ai}\n  flat  ${out.flat}`);
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
