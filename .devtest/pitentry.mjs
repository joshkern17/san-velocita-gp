// dev: AI pit stops, the way in. Every AI is called in on lap 2 (ai.boxNow, as your teammate's radio call does); for each
// one, from 500 m before the pit entry to its box: wall hits, all four wheels off, wrecks (the user's career race at
// Thunderhill, 2026-10-26: "the AI ran wide and crashed trying to enter the pit every time"), and how slow it ran on the
// way in against its plan, with how many cars sat within 25 m behind it (a car held the pack up, then pitted).
//   .devtest/guard.sh -m 7000 -t 600 node .devtest/pitentry.mjs <car> <seeds 1-2>     TRK=/tracks/real/thunderhill.json DIFF=godlike
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'nsx', [s0, s1] = (process.argv[3] || '1-1').split('-').map(Number), EXTRA = JSON.parse(process.env.EXTRA || '{}');
const rng = (seed) => `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;
async function race(ctx, seed) {
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  const SEEDRNG = rng(seed);
  await pg.evaluate(async ([id, diff, SEEDRNG, trk, extra]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade'; S.difficulty = diff; S.grid = 'back';
    (0, eval)(SEEDRNG);
    const R = (await import('/js/race.js')).Race;
    if (!R.prototype.__seedHook) { for (const k of ['prepare', 'finish']) { const f = R.prototype[k]; R.prototype[k] = function (...a) { (0, eval)(SEEDRNG); return f.apply(this, a); }; } R.prototype.__seedHook = 1; }
    window.__svgp.startRace(t, { mode: 'race', laps: 4, opponents: 11, aiChassis: 'class', car: S.car, extra: { aiMistakes: 'off', wear: 'normal', ...extra } }, 'menu');
  }, [id, process.env.DIFF || 'godlike', SEEDRNG, process.env.TRK || '/tracks/real/thunderhill.json', EXTRA]);
  return await pg.evaluate(async ([SEEDRNG]) => {
    const ok = () => { const x = window.__svgp.sim; return x && x.mode === 'race' && x.player && x.cars && x.cars.length > 1 && x.lineV && x.pit; };
    for (let k = 0; k < 2400 && !ok(); k++) await new Promise(r => setTimeout(r, 100));
    if (!ok()) return { error: 'no race (or no pit lane)' };
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false;
    (0, eval)(SEEDRNG);
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const T = sim.T, N = T.N, pit = sim.pit, ev = [], W = {};
    const toEntry = (c) => ((pit.start - c.idx + N) % N) * T.ds;
    const fb = sim.breakCheck.bind(sim); sim.breakCheck = (car, v, part, lx, ly, lim) => { if (v > 8 && lim >= 25 && W[car.name] && !(sim.raceTime - (car._wT ?? -9) < 1)) { car._wT = sim.raceTime; ev.push({ car: car.name, what: 'wall', at: Math.round(toEntry(car)), v: Math.round(v * 3.6), pitting: !!car.pitting, phase: car.pitPhase }); } return fb(car, v, part, lx, ly, lim); };
    for (let f = 0; sim.state === 'racing' && f < 60 * 60 * 9; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (sim.cars.some(c => c.finished)) break;
      for (const c of sim.cars) {
        if (!c.ai || c.isPlayer || c.gone) continue;
        if (c.lap === 2 && !c._called) { c._called = 1; c.ai.boxNow = true; }
        // watching: from 500 m out on the lap it's coming in, till it's stopped in its box
        const d = toEntry(c), w = W[c.name];
        if (c._called && !c._done && (c.pitting || d < 500) && !w) W[c.name] = { slow: [], behind: 0, n: 0, off: 0 };
        const x = W[c.name]; if (!x || c._done) continue;
        if (c.pitPhase === 'box' || c.pitPhase === 'stop' || c.pitPhase === 'service' || (c.pits || 0) >= 1) { c._done = 1; continue; }
        if (!c.pitting && d > 520) { c._done = 1; x.missed = true; continue; } // (went past the entry)
        x.n++;
        const V = c.lineV || sim.lineV; x.slow.push(c.phys.u / Math.max(1, V[c.idx]));
        const behind = sim.cars.filter(o => o !== c && !o.gone && !o.pitting && c.progress - o.progress > 0 && c.progress - o.progress < 25).length; x.behind = Math.max(x.behind, behind);
        if (Math.abs(c.s) > T.W[c.idx] / 2 + 0.95 && !(pit.REG[c.idx] >= 0 && c.s * pit.side > 0)) { if (!x.offOn) { x.offOn = 1; x.off++; ev.push({ car: c.name, what: 'off', at: Math.round(d), v: Math.round(c.phys.u * 3.6), s: +c.s.toFixed(1), half: +(T.W[c.idx] / 2).toFixed(1), pitting: !!c.pitting, phase: c.pitPhase }); } } else x.offOn = 0;
        if (c.wreck && !x.wreck) { x.wreck = 1; ev.push({ car: c.name, what: 'WRECK', at: Math.round(d), pitting: !!c.pitting }); }
      }
    }
    const rows = Object.entries(W).map(([n, x]) => ({ n, minPace: +Math.min(...x.slow).toFixed(2), behind: x.behind, off: x.off, wreck: !!x.wreck, missed: !!x.missed }));
    return { rows, ev, pits: sim.cars.filter(c => c.ai && !c.isPlayer).map(c => c.pits || 0) };
  }, [SEEDRNG]);
}
try {
  const ctx = await b.newContext();
  for (let s = s0; s <= s1; s++) {
    const t0 = Date.now(), r = await race(ctx, s);
    if (r.error) { console.log(`seed ${s}: ${r.error}`); continue; }
    const walls = r.ev.filter(e => e.what === 'wall').length, offs = r.ev.filter(e => e.what === 'off').length, wrecks = r.ev.filter(e => e.what === 'WRECK').length;
    console.log(`seed ${s}: ${r.rows.length} cars came in (pits ${r.pits.join(',')}); on the way in: walls ${walls}, offs ${offs}, wrecks ${wrecks} (${Math.round((Date.now() - t0) / 1000)} s)`);
    for (const e of r.ev.slice(0, 14)) console.log('   ', JSON.stringify(e));
    console.log('   slowest vs plan / most cars queued behind:', r.rows.map(x => `${x.n} ${x.minPace}/${x.behind}${x.missed ? ' MISSED' : ''}`).join(' | '));
  }
  await ctx.close();
} finally { await b.close(); server.kill(); }
