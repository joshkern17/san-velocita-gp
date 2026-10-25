// dev: how far apart a class's cars are. One clean lap (Race.simLap: the AI's driving at pace 1, soft tires, no level
// edge, no field balance) for every car in the class on each preset circuit, and the % behind the quickest.
//   node .devtest/carspread.mjs [class=street] [maxTracks=6]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 240); // (seconds: a hung run gives up instead of sitting there)
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const cls = process.argv[2] || 'street', maxT = +(process.argv[3] || 6), seed = +(process.env.SEED || 1), only = process.env.TRACK != null ? +process.env.TRACK : null;
const SEEDRNG = `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  const info = await pg.evaluate(async ([cls, pick]) => {
    const { presetTracks } = await import('/js/track.js'); const { CARS } = await import('/js/cars.js');
    const ids = pick ? pick.split(',') : Object.keys(CARS).filter(k => CARS[k].cls === cls); // (IDS=a,b,c: these cars, any class)
    return { ids, names: ids.map(k => CARS[k].name), tracks: presetTracks().map(t => t.name) };
  }, [cls, process.env.IDS || '']);
  console.log('cars:', info.names.join(', '));
  const rows = [];
  const mains = process.env.ALL ? info.ids.map((_, i) => i) : [+(process.env.MAIN || 0)];
  for (let ti = only ?? 0; ti < (only != null ? only + 1 : Math.min(maxT, info.tracks.length)); ti++) {
    let r = null;
    for (const MAIN_ of mains) {
    const r1 = await pg.evaluate(async ([ti, ids, SEEDRNG, OWNREF, EMPTY, MAIN, FACT, SENS]) => {
      const { presetTracks } = await import('/js/track.js');
      const t = presetTracks()[ti]; t.env = { ...(t.env || {}), weather: 'clear' };
      const S = window.__svgp.settings; S.car = { ...S.car, chassis: ids[MAIN] };
      const prev = window.__svgp.sim; if (prev) prev.setPaused(true);
      (0, eval)(SEEDRNG);
      window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 1, aiChassis: 'class', car: S.car, extra: { balance: false } }, 'menu');
      for (let k = 0; k < 1200 && !(window.__svgp.sim && window.__svgp.sim !== prev && window.__svgp.sim.lineV); k++) await new Promise(r => setTimeout(r, 100));
      const sim = window.__svgp.sim; if (sim === prev) return { track: t.name, km: 0, laps: {}, stale: true }; sim.setPaused(true);
      const out = { track: t.name, km: +(sim.T.L / 1000).toFixed(2), laps: {} };
      out.flags = {};
      const parked = sim.cars; if (EMPTY) sim.cars = []; // (the grid's cars sit on the circuit: the measured car would steer round them)
      for (const id of ids) {
        sim.limitsFor(id, 1);
        // (a clean lap or not: wall hits and jumps along the lap (a reset) are flagged)
        let hits = 0, jump = 0, last = null; const fb = sim.breakCheck?.bind(sim);
        const fbar = sim.barriers.bind(sim); sim.barriers = (car) => { const u0 = Math.hypot(car.phys.vx, car.phys.vz); const r = fbar(car); if (Math.hypot(car.phys.vx, car.phys.vz) < u0 - 3) hits++; return r; };
        const probe = (p, t, car) => { if (last != null) { const d = (car.idx - last + sim.T.N) % sim.T.N; if (d > 40 && d < sim.T.N - 40) jump++; } last = car.idx; };
        const rg0 = sim.refGrip; if (OWNREF) sim.refGrip = sim.limitMeta[id].g; out.rg = { ...(out.rg || {}), [id]: [+rg0.toFixed(3), +sim.limitMeta[id].g.toFixed(3)] };
        const f = FACT[id] || [1, 1]; // (FACT: a BoP table to try, { id: [power, grip] })
        out.laps[id] = +sim.simLap(id, { pace: 1, power: f[0], grip: f[1], tyre: 'soft', probe }).toFixed(2);
        // (SENS: how much the lap moves with 5% less power, and with 3% less grip: for fitting a BoP table)
        if (SENS) (out.sens ||= {})[id] = [+sim.simLap(id, { pace: 1, power: f[0] * 0.95, grip: f[1], tyre: 'soft' }).toFixed(2), +sim.simLap(id, { pace: 1, power: f[0], grip: f[1] * 0.97, tyre: 'soft' }).toFixed(2)];
        sim.refGrip = rg0; sim.barriers = fbar; out.flags[id] = (hits ? ` HIT${hits}` : '') + (jump ? ` JUMP${jump}` : '');
      }
      sim.cars = parked; out.N = sim.T.N; out.open = !!sim.T.open
      return out;
    }, [ti, info.ids, SEEDRNG, process.env.OWNREF !== '0', process.env.EMPTY !== '0', MAIN_, JSON.parse(process.env.FACT || '{}'), !!process.env.SENS]);
    if (!r) r = r1; else if (r1.sens) r.sens = r1.sens; else for (const id of info.ids) if (r1.laps[id] < r.laps[id]) { r.laps[id] = r1.laps[id]; r.flags[id] = r1.flags[id]; r.rg[id] = r1.rg[id]; }
    if (mains.length > 1) console.log(`  (${r1.track}: line of ${info.names[MAIN_]} done)`);
    }
    const best = Math.min(...Object.values(r.laps));
    console.log(`\n${r.track} (${r.km} km${r.open ? ', point to point' : ''})`);
    for (const [i, id] of info.ids.entries()) console.log(`  ${info.names[i].padEnd(26)} ${r.laps[id].toFixed(2).padStart(7)}s  +${((r.laps[id] / best - 1) * 100).toFixed(1)}%${r.flags[id]}  ref ${r.rg[id].join(' own ')}`);
    rows.push(r);
  }
  // the season view: each car's average % behind the quickest car on each circuit
  console.log('\nAVERAGE over', rows.length, 'circuits (% behind the quickest at each)');
  const avg = info.ids.map((id, i) => [info.names[i], rows.reduce((a, r) => a + (r.laps[id] / Math.min(...Object.values(r.laps)) - 1) * 100, 0) / rows.length, Math.max(...rows.map(r => (r.laps[id] / Math.min(...Object.values(r.laps)) - 1) * 100)), Math.min(...rows.map(r => (r.laps[id] / Math.min(...Object.values(r.laps)) - 1) * 100))]).sort((a, b) => a[1] - b[1]);
  for (const [n, a, hi, lo] of avg) console.log(`  ${n.padEnd(26)} +${a.toFixed(1)}%  (best +${lo.toFixed(1)}, worst +${hi.toFixed(1)})`);
  console.log('JSON ' + JSON.stringify(Object.fromEntries(rows.map(r => [r.track, r.laps]))));
  if (process.env.SENS) console.log('SENS ' + JSON.stringify(Object.fromEntries(rows.map(r => [r.track, r.sens]))));
} finally { await b.close(); server.kill(); }
