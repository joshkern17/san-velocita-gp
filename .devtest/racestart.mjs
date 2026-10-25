// dev: a race start with a full grid, every car driven by the AI (the player's too), counting the contact
//   node .devtest/racestart.mjs [car] [seconds] [opponents]   (Auburn; ROOT=<another checkout> to compare; EXTRA='{"opt":v}' sets race options)
// → car-on-car hits, spins (> 60° sideways), wall hits, cars that went NaN, damage, and the field's spread at the end
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', secs = +(process.argv[3] || 45), opp = +(process.argv[4] || 9);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, opp]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: opp, aiChassis: 'class', grid: 'back', car: window.__svgp.settings.car }, 'menu');
  }, [id, opp]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV, null, { timeout: 120000 }).catch(e => console.log('wait', e.message));
  const out = await pg.evaluate(([secs, process_WL, process_EX]) => {
    const sim = window.__svgp.sim; Object.assign(sim.opts, process_EX);
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0;
    sim.player.autoT = 1e9;
    for (const c of sim.cars) if (c.ai) c.ai.react = 0.15;
    let spins = 0, nan = 0, carHits = 0;
    const spun = new Set();
    const hits0 = new Map(sim.cars.map(c => [c, 0]));
    // car-on-car contact: count it in the stewards' hook (it's called for every hit over 5 m/s)
    const kinds = {}; globalThis.__WL = process_WL ? [] : null;
    if (sim.rc) { const f = sim.rc.contact.bind(sim.rc); sim.rc.contact = (a, b, ia, ib, v) => { carHits++; const k = ['F', 'R', 'S'][ia] + ['F', 'R', 'S'][ib] + (a.lap <= 1 && sim.raceTime < 12 ? '@start' : ''); kinds[k] = (kinds[k] || 0) + 1; if (globalThis.__WL) { const d = (c) => (c.phys.dmg.fw + c.phys.dmg.rw + c.phys.dmg.ch).toFixed(2); globalThis.__WL.push(`  CAR ${k} t${sim.raceTime.toFixed(1)} i${a.idx} close${v.toFixed(1)} ${a.name} v${(a.phys.speed * 3.6).toFixed(0)} s${a.s.toFixed(1)} dmg${d(a)} | ${b.name} v${(b.phys.speed * 3.6).toFixed(0)} s${b.s.toFixed(1)} dmg${d(b)}  gap${(b.progress - a.progress).toFixed(1)}`); } return f(a, b, ia, ib, v); }; }
    let wallN = 0, wallBig = 0;
    const wk = sim.wallHit ? 'wallHit' : 'bounce', wf = sim[wk].bind(sim);
    sim[wk] = (car, ...a) => { const v0 = car.impact || 0; car.impact = 0; const r = wf(car, ...a); if (car.impact > 3 && !(sim.raceTime - (car._wallT ?? -9) < 1)) { car._wallT = sim.raceTime; wallN++; if (car.impact > 10) wallBig++; if (globalThis.__WL) globalThis.__WL.push(`  wall ${car.name || ''} t${sim.raceTime.toFixed(1)} i${car.idx} v${(car.phys.speed * 3.6).toFixed(0)} hit${car.impact.toFixed(1)} s${car.s.toFixed(1)} BR${sim.A.BR[car.idx].toFixed(1)} BL${sim.A.BL[car.idx].toFixed(1)} W/2 ${(sim.T.W[car.idx] / 2).toFixed(1)} β${((car.phys.beta || 0) * 57.3).toFixed(0)} dmg${(car.phys.dmg.fw + car.phys.dmg.rw + car.phys.dmg.ch).toFixed(2)} hitBy${car._lastCar ?? '-'}`); } car.impact = Math.max(v0, car.impact); return r; };
    const t0 = performance.now();
    for (let f = 0; f < secs * 60; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      for (const c of sim.cars) {
        const p = c.phys;
        if (!isFinite(p.x)) { nan++; continue; }
        if (Math.abs(p.beta || 0) > 1.05 && p.speed > 5 && !spun.has(c)) { spins++; spun.add(c); c._spinAt = f; }
        if (spun.has(c) && f - c._spinAt > 180) spun.delete(c);
      }
    }
    const ms = performance.now() - t0;
    const dmg = sim.cars.reduce((a, c) => a + c.phys.dmg.fw + c.phys.dmg.rw + c.phys.dmg.ch, 0);
    const hits = sim.cars.reduce((a, c) => a + (c.hits || 0), 0);
    const prog = sim.cars.map(c => c.progress || 0).sort((a, b) => b - a);
    return (globalThis.__WL ? globalThis.__WL.join('\n') + '\n' : '') + `cars ${sim.cars.length}  wall incidents ${wallN} (>10: ${wallBig})  contacts>5m/s ${carHits} ${JSON.stringify(kinds)}  hits>3m/s (walls+cars, per car) ${hits}  spins ${spins}  NaN ${nan}  damage total ${dmg.toFixed(2)}  spread ${(prog[0] - prog[prog.length - 1]).toFixed(0)} m  sim ${(ms / secs).toFixed(0)} ms per s`;
  }, [secs, !!process.env.WL, JSON.parse(process.env.EXTRA || '{}')]);
  console.log(out);
} finally { await b.close(); server.kill(); }
