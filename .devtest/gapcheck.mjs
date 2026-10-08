// dev: does a World Career driver's gap (their rating's % behind a clean lap) come out as that much lap time? For each
// gap, the career's knobs (aiskill knobsFor: flaws for a typical driver, the pace multiplier making up the rest, as
// race.js techFor / techPace do), then two clean-air laps (seeded): % behind the same car's flawless lap.
//   node .devtest/gapcheck.mjs [circuit name=Laguna Seca] [car=r34] [difficulty=phantom]     LIMIT=secs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 400);
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const [name = 'Laguna Seca', car = 'r34', diff = 'phantom'] = process.argv.slice(2);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async ([name, car, diff]) => {
    const RT = await import('/js/realtracks.js'), { presetTracks } = await import('/js/track.js'), A = await import('/js/aiskill.js');
    await RT.realTracksReady();
    let t = [...presetTracks(), ...RT.realTracks()].find(x => x.name === name); if (!t) return { err: 'no circuit ' + name };
    t = JSON.parse(JSON.stringify(t)); await RT.hydrateReal(t); t.env = { ...(t.env || {}), weather: 'clear' };
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: car }; S.difficulty = diff;
    window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 1, aiChassis: 'same', car: S.car, extra: { balance: false } }, 'menu');
    for (let k = 0; k < 2400 && !(window.__svgp.sim && window.__svgp.sim.lineV); k++) await new Promise(r => setTimeout(r, 100));
    const sim = window.__svgp.sim; sim.setPaused(true); sim.cars = [];
    const seed = (n) => { let a = n * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let x = Math.imul(a ^ a >>> 15, 1 | a); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; };
    const E = sim.edgeFor(car), out = { track: t.name, rows: [] };
    seed(1); const clean = sim.simLap(car, { pace: sim.diff.pace, power: E.power, grip: E.grip, laps: 2 });
    out.clean = clean;
    // a typical driver's flaws (pace 50, consistency 60: wcareer raceKnobs)
    const f = (88 - 50) / 40, g = (85 - 60) / 45;
    for (const gap of [0.5, 1, 2, 3, 4]) {
      const k = A.knobsFor('street', gap, f, g);
      // (as race.js techFor: the flaws' cost measured at full pace against the curve's clean laps)
      const cv = sim.paceCurve(car); seed(7);
      const mc = k.skill ? (sim.simLap(car, { pace: 1, power: sim.diff.power, grip: sim.diff.grip, tyre: 'soft', laps: 2, skill: k.skill, tc: k.tc }) / cv.t - 1) * 100 : 0;
      const tf = { skill: k.skill, tc: k.tc, cost: Math.min(mc, 0.9 * gap), gap };
      const pace = sim.techPace(sim.diff.pace, tf, car);
      const laps = []; for (const s of [11, 12, 13]) { seed(s); laps.push(sim.simLap(car, { pace, power: E.power, grip: E.grip, skill: tf.skill, tc: tf.tc, laps: 2 })); }
      laps.sort((a, b) => a - b);
      out.rows.push({ gap, pace: +pace.toFixed(4), lap: laps[1], spread: laps[2] - laps[0] });
    }
    out.curve = sim.paceCurve(car).C;
    // the pieces apart, at the level's own pace: the flaws alone, and the lower traction control alone
    const k3 = A.knobsFor('street', 3, f, g);
    const at = (o) => { const l = []; for (const s of [11, 12, 13]) { seed(s); l.push(sim.simLap(car, { pace: sim.diff.pace, power: E.power, grip: E.grip, laps: 2, ...o })); } return l.sort((a, b) => a - b)[1]; };
    out.parts = { flawsAndTc: at({ skill: k3.skill, tc: k3.tc }), flawsOnly: at({ skill: k3.skill }), tcOnly: at({ tc: k3.tc }), skill: k3.skill, tc: k3.tc };
    return out;
  }, [name, car, diff]);
  if (r.err) { console.log(r.err); process.exit(1); }
  console.log(`${r.track}, ${car}, ${diff}: clean lap ${r.clean.toFixed(2)}s`);
  for (const x of r.rows) console.log(`  gap ${x.gap.toFixed(1)}%  -> pace ${x.pace}  lap ${x.lap.toFixed(2)}s  = ${((x.lap / r.clean - 1) * 100).toFixed(2)}% behind  (3 seeds, spread ${x.spread.toFixed(2)}s)`);
  console.log('  curve (pace, % lost):', JSON.stringify(r.curve));
  const P = r.parts, pc = (x) => `${((x / r.clean - 1) * 100).toFixed(2)}%`;
  console.log(`  at full pace, typical flaws ${JSON.stringify(P.skill)} tc ${P.tc.toFixed(2)}: flaws + low TC ${pc(P.flawsAndTc)}, flaws only ${pc(P.flawsOnly)}, low TC only ${pc(P.tcOnly)}`);
} finally { await b.close(); server.kill(); }
