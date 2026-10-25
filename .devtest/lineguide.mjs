// dev: does the racing line you're shown (race.js buildRacingLine: green / lift / brake from the speed plan) match what
// the AI does on it? One clean AI lap in your car (simLap, grip 1, the plan the guide is built from), each sample's
// brake / throttle against the guide's severity there. Lists each guide zone that lifts or brakes, with what the AI did
// through it and how straight the road is, and each place the AI brakes the guide doesn't show.
//   node .devtest/lineguide.mjs [car=rx7fd]     TRK=/tracks/real/roadatlanta.json LIMIT=secs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 300);
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'rx7fd';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async ([id, trk]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    const ST = window.__svgp.settings; ST.car = { ...ST.car, chassis: id }; ST.racingLine = "full";
    const prev = window.__svgp.sim; if (prev) prev.setPaused(true);
    window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 1, aiChassis: 'same', car: ST.car, extra: { balance: false } }, 'menu');
    for (let k = 0; k < 1800 && !(window.__svgp.sim && window.__svgp.sim !== prev && window.__svgp.sim.lineBase); k++) await new Promise(r => setTimeout(r, 100));
    const sim = window.__svgp.sim; if (sim === prev || !sim.lineBase) return null; sim.setPaused(true);
    const T = sim.T, N = T.N, parked = sim.cars; sim.cars = [];
    const brk = new Float32Array(N), thr = new Float32Array(N), v = new Float32Array(N), seen = new Uint8Array(N);
    const ac = sim.aiControls; let last = null; sim.aiControls = function (...a) { return (last = ac.apply(this, a)); };
    sim.simLap(sim.mainCarId(), { tyre: 'soft', laps: 2, probe: (p, tt, car) => { if (last && tt > 20) { const i = car.idx; brk[i] = last.brake; thr[i] = last.throttle; v[i] = p.u; seen[i] = 1; } } });
    sim.aiControls = ac; sim.cars = parked;
    // curvature of the drawn line over the next 60 m: how much it turns (deg)
    const head = (i) => { const j = (i + 1) % N; return Math.atan2((T.X[j] + T.RX[j] * sim.line[j]) - (T.X[i] + T.RX[i] * sim.line[i]), (T.Z[j] + T.RZ[j] * sim.line[j]) - (T.Z[i] + T.RZ[i] * sim.line[i])); };
    const turn = (i, m) => { let a = 0; for (let k = 0; k < Math.round(m / T.ds); k++) { let d = head((i + k + 1) % N) - head((i + k) % N); d = Math.atan2(Math.sin(d), Math.cos(d)); a += d; } return Math.abs(a) * 180 / Math.PI; };
    const zones = [], S = sim.lineBase; void S;
    for (let i = 0; i < N; i++) {
      if (S[i] < 0.35 || S[(i - 1 + N) % N] >= 0.35) continue;
      let j = i; while (S[j % N] >= 0.35 && j - i < N) j++;
      let mb = 0, mt = 0, n = 0, maxS = 0; for (let k = i; k < j; k++) { const q = k % N; maxS = Math.max(maxS, S[q]); if (seen[q]) { mb += brk[q]; mt += thr[q]; n++; } }
      zones.push({ m: Math.round(i * T.ds), len: Math.round((j - i) * T.ds), sev: +maxS.toFixed(2), aiBrake: n ? +(mb / n).toFixed(2) : null, aiThr: n ? +(mt / n).toFixed(2) : null, kmh: [Math.round(sim.lineV[i] * 3.6), Math.round(sim.lineV[(j) % N] * 3.6)], ai: [Math.round(v[i] * 3.6), Math.round(v[j % N] * 3.6)], turn: Math.round(turn(i, 120)) });
    }
    // AI brakes the guide doesn't show
    const miss = [];
    for (let i = 0; i < N; i++) if (seen[i] && brk[i] > 0.3 && S[i] < 0.35 && !(brk[(i - 1 + N) % N] > 0.3 && S[(i - 1 + N) % N] < 0.35)) miss.push(Math.round(i * T.ds));
    // the plan's speed, a sample every 10 m, for spotting dips
    const dips = [];
    for (let i = 2; i < N - 2; i++) { const a = sim.lineV[i]; if (a < sim.lineV[i - 1] && a <= sim.lineV[i + 1]) { let lo = i, up = i; while (up < N - 1 && sim.lineV[up + 1] >= sim.lineV[up]) up++; while (lo > 0 && sim.lineV[lo - 1] >= sim.lineV[lo]) lo--; const drop = Math.min(sim.lineV[lo], sim.lineV[up]) - a; if (drop * 3.6 > 4) dips.push({ m: Math.round(i * T.ds), kmh: Math.round(a * 3.6), drop: Math.round(drop * 3.6), turn: Math.round(turn((i - Math.round(40 / T.ds) + N) % N, 80)) }); } }
    const t0 = performance.now(); sim.drivenSpeeds(sim.player.carId, 1); const ms = Math.round(performance.now() - t0);
    return { ms, L: Math.round(T.L), ds: T.ds, zones, miss, dips };
  }, [id, process.env.TRK || '/tracks/real/roadatlanta.json']);
  if (!r) { console.log('(no race)'); process.exit(1); }
  console.log(`${id}: lap ${r.L} m, ds ${r.ds}, the guide's driven lap took ${r.ms} ms`);
  console.log('guide zones (lift >= 0.35, brake >= 0.9): at m, length, severity | AI brake / throttle there | plan km/h in > out | AI km/h in > out | line turns deg over the next 120 m');
  for (const z of r.zones) console.log(`  ${String(z.m).padStart(5)} m ${String(z.len).padStart(4)} m  sev ${z.sev.toFixed(2)} | AI brk ${z.aiBrake} thr ${z.aiThr} | plan ${z.kmh.join('>')} | AI ${z.ai.join('>')} | turn ${z.turn}`);
  console.log('AI brakes the guide shows green:', r.miss.join(', ') || 'none');
  if (process.env.DIPS) console.log('plan dips (local minima, > 4 km/h): ' + r.dips.map(d => `${d.m} m ${d.kmh} (-${d.drop}, turn ${d.turn})`).join(' · '));
} finally { await b.close(); server.kill(); }
