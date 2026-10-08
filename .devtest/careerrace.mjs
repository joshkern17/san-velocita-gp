// dev: a World Career race from a save, headless: the save's drivers with the knobs the career gives them
// (wcareer raceEntries), on a circuit, seeded; prints each AI driver's rating, gap, best lap and finish. Reads the save
// only. SAME=car puts everyone in one car (driving and team only); otherwise each team's own car and the save's BoP.
//   node .devtest/careerrace.mjs <save.json> [circuit=Laguna Seca] [laps=3] [seed=1]     DIFF=phantom LIMIT=secs
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WC = await import(ROOT + '/js/wcareer.js');
const [save, name = 'Laguna Seca', laps = '3', seed = '1'] = process.argv.slice(2);
const w = JSON.parse(readFileSync(save, 'utf8'));
// your own circuits (the saved editor tracks beside the save), for a circuit that isn't a preset or a real one
let mine = []; try { const d = JSON.parse(readFileSync(join(dirname(save), 'svgp.tracks.txt'), 'utf8')); mine = Array.isArray(d) ? d : Object.values(d.tracks || d); } catch (e) {}
const ent = WC.raceEntries(w), keys = ['testarossa', 'jsport', 'rs964', 'mustang', 'm5', 'r34'];
for (const e of Object.values(ent.entries)) e.chassis = process.env.SAME || WC.teamChassis(w, e.tid, keys);
const bop = process.env.SAME ? null : WC.bopTable(w, keys);
const info = Object.fromEntries(Object.entries(ent.entries).map(([slot, e]) => [slot, { name: e.name, rating: WC.rating(w, e.pid), gap: e.gap, car: e.chassis }]));
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 500);
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async ([name, laps, seed, diff, ent, bop, myCar, solo, mineTracks]) => {
    const RT = await import('/js/realtracks.js'), { presetTracks } = await import('/js/track.js');
    await RT.realTracksReady();
    let t = [...presetTracks(), ...RT.realTracks(), ...mineTracks].find(x => x && x.name === name); if (!t) return { err: 'no circuit ' + name };
    t = JSON.parse(JSON.stringify(t)); await RT.hydrateReal(t); t.env = { ...(t.env || {}), weather: 'clear' };
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: myCar }; S.difficulty = diff;
    let a = seed * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: ent.roster.length, aiChassis: 'class', car: S.car, extra: { entries: ent.entries, teamPace: ent.teamPace, roster: ent.roster, ...(bop ? { bop } : {}), grid: 'back' } }, 'menu');
    for (let k = 0; k < 3000 && !(window.__svgp.sim && window.__svgp.sim.lineV && window.__svgp.sim.cars.length > ent.roster.length); k++) await new Promise(r => setTimeout(r, 100));
    const sim = window.__svgp.sim; if (!sim) return { err: 'no race' };
    sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    // SOLO: each AI driver exactly as the race set them up, alone on the circuit (two laps): pace without traffic
    if (solo) { const cars = sim.cars.filter(c => !c.isPlayer), all = sim.cars; sim.cars = [];
      const rows = cars.map(c => ({ slot: c.teamIdx, best: sim.simLap(c.carId, { pace: c.ai.pace, power: c.phys.powerMul, grip: c.phys.gripMul, skill: c.ai.skill || null, tc: c.ai.skill ? c.phys.aid?.tc ?? null : null, laps: 2 }), pos: 0, done: true, wreck: false, aiPace: c.ai.pace }));
      const models = {}; for (const id of new Set(cars.map(c => c.carId))) { const E = sim.edgeFor(id), cv = sim.paceCurve(id); models[id] = { edge: E, curveT: cv.t, fresh1: sim.simLap(id, { pace: 1, power: E.power, grip: E.grip, tyre: 'soft' }), fresh2: sim.simLap(id, { pace: 1, power: E.power, grip: E.grip, tyre: 'soft', laps: 2 }), trimT: sim.trimLaps?.[id]?.t }; }
      sim.cars = all; rows.sort((x, y) => x.best - y.best).forEach((x, i) => x.pos = i + 1); return { rows, trimLaps: sim.trimLaps, trim: sim.bopTrim, models }; }
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    let f = 0; while (sim.state === 'racing' && f < 60 * 60 * 12) { sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); f++; }
    return { rows: sim.cars.filter(c => !c.isPlayer).map(c => ({ slot: c.teamIdx, best: c.best, pos: c.pos, done: c.finished, wreck: !!c.wreck })) };
  }, [name, +laps, +seed, process.env.DIFF || 'phantom', ent, bop, process.env.SAME || w.car?.chassis || 'r34', !!process.env.SOLO, mine.filter(t => t && t.name === name)]);
  if (r.err) { console.log(r.err); process.exit(1); }
  if (r.trimLaps) { const ok = Object.entries(r.trimLaps).filter(([k, v]) => v && v.t); const ts = ok.map(([, v]) => v.t).sort((a, b) => a - b), mid = ts[Math.floor(ts.length / 2)];
    console.log('  the cars here with the season BoP (clean laps) -> trim: ' + ok.map(([k, v]) => `${k} ${((v.t / mid - 1) * 100).toFixed(1)}% -> grip x${r.trim?.[k] ?? '-'}`).join(', ')); }
  if (r.models) for (const [id, m] of Object.entries(r.models)) console.log(`  ${id.padEnd(11)} edge power ${m.edge.power.toFixed(3)} grip ${m.edge.grip.toFixed(3)} | trim lap ${m.trimT?.toFixed(2)} | curve clean lap (2) ${m.curveT.toFixed(2)} | fresh clean 1 lap ${m.fresh1.toFixed(2)}, 2 laps ${m.fresh2.toFixed(2)}`);
  const rows = r.rows.map(x => ({ ...x, ...info[x.slot] })).filter(x => x.name).sort((a, b) => a.best - b.best);
  const top = rows[0].best;
  console.log(`${name}, ${laps} laps, seed ${seed}, ${process.env.SAME ? 'everyone in ' + process.env.SAME : "each team's car + BoP"}`);
  for (const x of rows) console.log(`  ${x.name.padEnd(9)} ${x.car.padEnd(11)} rating ${x.rating.toFixed(1)}  gap ${x.gap.toFixed(2)}%  best ${isFinite(x.best) ? x.best.toFixed(2) : '-'} (+${((x.best / top - 1) * 100).toFixed(2)}%)  ${process.env.SOLO ? `alone, pace ${x.aiPace?.toFixed(3)}` : `finished P${x.pos}${x.wreck ? ' WRECK' : ''}`}`);
  // rank agreement: rating order vs best-lap order (Spearman)
  const n = rows.length, byR = rows.slice().sort((a, b) => b.rating - a.rating).map(x => x.name), d2 = rows.reduce((s, x, i) => s + (i - byR.indexOf(x.name)) ** 2, 0);
  const rho = 1 - 6 * d2 / (n * (n * n - 1));
  console.log(`  rating order vs best-lap order: Spearman ${rho.toFixed(2)} (1 = same order)`);
  // the check: driving and team decide the order (alone on the circuit), and no model is far clear (its clean lap)
  if (process.env.SOLO && r.models) { const cl = Object.values(r.models).map(m => m.curveT), spread = (Math.max(...cl) / Math.min(...cl) - 1) * 100;
    const ok = rho >= 0.8 && spread <= 1.5; console.log(`  ${ok ? 'PASS' : 'FAIL'}: order ${rho.toFixed(2)} (want 0.8+), cars' clean laps within ${spread.toFixed(2)}% (want 1.5% or less)`); if (!ok) process.exitCode = 1; }
} finally { await b.close(); server.kill(); }
