// dev: what the pack costs each car off the line. Every grid slot timed from the lights to points 500 m and 1000 m up
// the road from pole: once in the full race (12 cars on Alien, you on the AI from the back), then each car alone from
// its own slot. The difference is what fighting the others cost it; a clean human driver from the back pays little of
// it, and gains those places.
//   node .devtest/startcost.mjs [car] [diff]      EXTRA='{"opt":v}' sets race options
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', diff = process.argv[3] || 'alien';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, diff]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.difficulty = diff; S.grid = 'back';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 11, aiChassis: 'class', car: S.car }, 'menu');
  }, [id, diff]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const out = await pg.evaluate(([extra, Q]) => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    Object.assign(sim.opts, extra);
    sim.player.autoT = 1e9;
    const grid = [...sim.cars].sort((a, b) => b.progress - a.progress);
    const pose = new Map(grid.map(c => [c, { x: c.phys.x, z: c.phys.z, h: c.phys.h, ai: c.ai ? JSON.parse(JSON.stringify(c.ai)) : null }]));
    const P0 = grid[0].progress, marks = [500, 1000];
    const go = (cars, frames) => {
      sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; sim.raceTime = 0;
      const t = new Map(cars.map(c => [c, []]));
      let hits = 0; const fc = sim.rc.contact; sim.rc.contact = (...a) => { hits++; return fc.apply(sim.rc, a); };
      for (let f = 1; f <= frames; f++) {
        sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
        for (const c of cars) { const r = t.get(c); if (r.length < marks.length && c.progress - P0 >= marks[r.length]) r.push(f / 60); }
        if (cars.every(c => t.get(c).length === marks.length)) break;
      }
      sim.rc.contact = fc;
      return { t, hits };
    };
    const pack = go(grid, 60 * 60);
    // each car alone from its slot (the rest parked out of the way)
    const lone = new Map();
    for (const c of grid) {
      for (const o of grid) { const q = pose.get(o); o.gone = o !== c; o.phys.place(o === c ? q.x : 1e5 + Math.random() * 1e4, o === c ? q.z : 1e5, q.h); o.phys.vx = o.phys.vz = 0; if (o.ai) o.ai = JSON.parse(JSON.stringify(q.ai)); o.lap = 0; sim.updateTracker(o, true); }
      lone.set(c, go([c], 60 * 60).t.get(c));
    }
    const rows = grid.map((c, i) => { const a = pack.t.get(c), l = lone.get(c); return { i, name: c.isPlayer ? 'YOU' : c.name, d: marks.map((_, j) => (a[j] ?? 99) - (l[j] ?? 0)) }; });
    const mean = marks.map((_, j) => rows.reduce((s, r) => s + r.d[j], 0) / rows.length);
    const sum = `pack cost (s, mean of 12): ${marks.map((m, j) => m + 'm ' + mean[j].toFixed(2)).join('  ')}  back half @1000: ${(rows.slice(6).reduce((s, r) => s + r.d[1], 0) / 6).toFixed(2)}  contacts ${pack.hits}`;
    return Q ? sum : sum + '\n' + rows.map(r => `P${String(r.i + 1).padStart(2)} ${r.name.padEnd(12)} ${r.d.map(x => x.toFixed(2).padStart(6)).join(' ')}`).join('\n');
  }, [JSON.parse(process.env.EXTRA || '{}'), !!process.env.Q]);
  console.log(out);
} finally { await b.close(); server.kill(); }
