// dev: is a seeded AI race (aiseed.mjs) the same race twice? Builds the same seed twice, each in a fresh browser
// context (no saved caches), and compares fingerprints: the build (the line, each car's plan, power, grip, driver,
// grid spot) and then every car's position once a second. Prints the first thing that differs, or "same".
//   node .devtest/seedcheck.mjs [car] [seed] [seconds]     TRK=/tracks/real/roadatlanta.json  EXTRA='{"opt":v}'  DIFF=alien
// Run through .devtest/guard.sh (one browser at a time).
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'f40', seed = +(process.argv[3] || 1), secs = +(process.argv[4] || 20);
const SEEDRNG = `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;

async function run() {
  const ctx = await b.newContext(), pg = await ctx.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, diff, extra, SEEDRNG, trk]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade'; S.difficulty = diff; S.grid = 'back';
    (0, eval)(SEEDRNG);
    // (the build waits on frames - loading the track, between its slow steps - and the menu uses Math.random in them a
    // varying number of times: seeded again as the build starts (the teams' shuffle) and as the field's drawn (grid,
    // each car's spread), so neither depends on how many frames ran)
    const R = (await import('/js/race.js')).Race;
    if (!R.prototype.__seedHook) { for (const k of ['prepare', 'finish']) { const f = R.prototype[k]; R.prototype[k] = function (...a) { (0, eval)(SEEDRNG); return f.apply(this, a); }; } R.prototype.__seedHook = 1; }
    window.__seedHooked = R.prototype.__seedHook; window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: +(extra.__opp ?? 11), aiChassis: 'class', car: S.car, extra }, 'menu');
  }, [id, process.env.DIFF || 'alien', JSON.parse(process.env.EXTRA || '{}'), SEEDRNG, process.env.TRK || '/.devtest/auburn2.json']);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const r = await pg.evaluate(([SEEDRNG, secs]) => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    (0, eval)(SEEDRNG);
    for (const c of sim.cars) if (c.ai) { c.ai.pace = sim.diff.pace * (1 - Math.random() * sim.diff.spread); c.ai.bias = (Math.random() - 0.5) * 1.2; c.ai.react = 0.06 + Math.random() * 0.14; delete c.ai.aggr; delete c.ai.craft; }
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const h = (a) => { let x = 2166136261; for (const v of a) { const s = typeof v === 'number' ? v.toFixed(5) : String(v); for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); } return (x >>> 0).toString(16); };
    const build = { line: h(sim.line), lineV: h(sim.lineV), balance: JSON.stringify(sim.balance || null) };
    for (const c of sim.cars) build[c.name] = `${c.carId} plan ${h(c.lineV || [])} p${c.phys.powerMul?.toFixed(5)} g${c.phys.gripMul?.toFixed(5)} x${c.phys.x.toFixed(4)} z${c.phys.z.toFixed(4)} h${c.phys.h.toFixed(5)}`;
    const steps = [];
    for (let f = 1; f <= secs * 60 && sim.state === 'racing'; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (f % 60 === 0) steps.push({ t: f / 60, cars: sim.cars.map(c => `${c.name} x${c.phys.x.toFixed(4)} z${c.phys.z.toFixed(4)} u${c.phys.u.toFixed(4)}`) });
    }
    return { build, steps };
  }, [SEEDRNG, secs]);
  await ctx.close();
  return r;
}
try {
  const A = await run(), B = await run();
  let diffs = 0;
  for (const k of new Set([...Object.keys(A.build), ...Object.keys(B.build)])) if (A.build[k] !== B.build[k]) { if (diffs++ < 8) console.log(`build differs: ${k}\n  1: ${A.build[k]}\n  2: ${B.build[k]}`); }
  let first = null;
  for (let i = 0; i < Math.min(A.steps.length, B.steps.length) && !first; i++) {
    const a = A.steps[i].cars, bb = B.steps[i].cars;
    for (let j = 0; j < a.length; j++) if (a[j] !== bb[j]) { first = `t${A.steps[i].t}s: ${a[j]}  vs  ${bb[j]}`; break; }
  }
  console.log(diffs ? `${diffs} build values differ` : 'build: same');
  console.log(first ? `race splits at ${first}` : `race: same for ${Math.min(A.steps.length, B.steps.length)} s`);
} finally { await b.close(); server.kill(); }
