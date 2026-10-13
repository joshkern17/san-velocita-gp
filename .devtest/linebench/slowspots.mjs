// dev: where the AI leaves time on a circuit: the line model's speed (raceline.js lineProfile: what the car could do on
// the line) against the AI's learned plan (race.lineV) and the corner list, stretch by stretch. A stretch where the plan
// sits 8%+ under the model for 25 m+ is listed, with the corners round it (a chicane or an S the AI takes as two corners
// shows as a run of them).
//   node .devtest/linebench/slowspots.mjs [car] [track json path] [opts json]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8600 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2000));
const id = process.argv[2] || 'm1procar', TRK = process.argv[3] || '/.devtest/tmp/panorama.json', OPTS = JSON.parse(process.argv[4] || '{}');
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  const r = await pg.evaluate(async ([id, TRK, OPTS]) => {
    const { Race } = await import('/js/race.js'); const { lineProfile, lineCar } = await import('/js/raceline.js'); const { CARS } = await import('/js/cars.js');
    const t = await (await fetch(TRK)).json();
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, ...OPTS, car: { chassis: id } }, null);
    const T = race.T, N = T.N, O = race.line, V = race.lineV, P = lineProfile(T, O, lineCar(CARS[id].spec)), PV = P.v || P;
    const out = []; let run = null;
    for (let i = 0; i < N; i++) {
      const k = V[i] / PV[i];
      if (k < 0.92) { if (!run) run = { a: i, min: k, at: i }; if (k < run.min) { run.min = k; run.at = i; } }
      else if (run) { if ((i - run.a) * T.ds >= 25) out.push(run); run = null; }
    }
    // every corner: where, which way, the line's slowest speed through it and how much of the road it uses there
    const C = race.corners.list.map((c, k) => { let vmin = 1e9, at = c.apex; for (let i = c.entry; i <= c.exit; i++) if (V[i % N] < vmin) { vmin = V[i % N]; at = i % N; } const nx = race.corners.list[k + 1];
      return `T${c.n} ${c.dir > 0 ? 'L' : 'R'} ${(c.entry * T.ds).toFixed(0)}-${(c.exit * T.ds).toFixed(0)}m R${(1 / c.peak).toFixed(0)} min ${(vmin * 3.6).toFixed(0)} km/h, line ${O[at].toFixed(1)} of ±${(T.W[at] / 2).toFixed(1)}${nx && (nx.entry - c.exit) * T.ds < 60 ? `  ~${((nx.entry - c.exit) * T.ds).toFixed(0)} m to T${nx.n}${nx.dir !== c.dir ? ' (S)' : ''}` : ''}`; });
    const cn = (i) => { const c = race.corners.at[i]; return c > 0 ? 'T' + c : '-'; };
    return { C, lap: race.simLap(id, { pace: 1, tyre: 'soft' }), L: T.L, spots: out.map(r => `${(r.a * T.ds).toFixed(0)}-${((r.a * T.ds) + 0).toFixed(0)}m worst @${(r.at * T.ds).toFixed(0)}m ${cn(r.at)}: plan ${(V[r.at] * 3.6).toFixed(0)} vs model ${(PV[r.at] * 3.6).toFixed(0)} km/h (${((1 - r.min) * 100).toFixed(0)}% under); line ${O[r.at].toFixed(1)} of ±${(T.W[r.at] / 2).toFixed(1)}`) };
  }, [id, TRK, OPTS]);
  console.log(`${id} clean lap ${r.lap.toFixed(2)} s, ${r.L.toFixed(0)} m`); for (const s of r.spots) console.log('  ' + s); for (const c of r.C) console.log('  ' + c);
} finally { await b.close(); server.kill(); }
