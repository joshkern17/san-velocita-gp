// dev: is a racing line's lap time the same at the player's grip and at the AI's (the level's grip / power)? For each
// car, the fitted line out to the edge (LINE_EDGE) and the fit kept to the room (lineMargins), each learned afresh and
// lapped twice (simLap) at grip 1 and at the level's edge, with learnLimits' run-wide check new (0.6 m past the white
// line) and old (1.1 m: opts.lineEdge false).
//   node .devtest/linegrip.mjs [cars=m1procar,rx7fd]     TRK=/tracks/real/roadatlanta.json DIFF=phantom LIMIT=secs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 570);
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ids = (process.argv[2] || 'm1procar,rx7fd').split(',');
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  for (const id of ids) {
    const t0 = Date.now();
    const r = await pg.evaluate(async ([id, trk, diff]) => {
      const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
      const { computeRacingLine } = await import('/js/track.js'); const { fastLine, lineCar } = await import('/js/raceline.js'); const { CARS } = await import('/js/cars.js');
      const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.difficulty = diff;
      const prev = window.__svgp.sim; if (prev) prev.setPaused(true);
      window.__svgp.startRace(t, { mode: 'race', laps: 1, opponents: 1, aiChassis: 'same', car: S.car, extra: { balance: false, lineCheck: false } }, 'menu');
      for (let k = 0; k < 1800 && !(window.__svgp.sim && window.__svgp.sim !== prev && window.__svgp.sim.lineV); k++) await new Promise(r => setTimeout(r, 100));
      const sim = window.__svgp.sim; if (sim === prev) return null; sim.setPaused(true);
      const parked = sim.cars, parkedLine = sim.line; sim.cars = [];
      const mg = sim.lineMargins(id), base = computeRacingLine(sim.T, 1.6), lc = lineCar(CARS[id].spec);
      const lines = { edge: fastLine(sim.T, base, lc, mg).O, room: fastLine(sim.T, base, lc, typeof mg.room === 'number' ? { margin: mg.room } : { margins: mg.room }).O };
      const out = { D: [sim.diff.grip, sim.diff.power] };
      for (const [ln, O] of Object.entries(lines)) for (const chk of ['new', 'old']) for (const [g, pw] of [[1, 1], [sim.diff.grip, sim.diff.power]]) {
        sim.line = O; sim.lineK = null; sim._side = null; sim.limits = {}; sim.opts.lineEdge = chk === 'old' ? false : undefined; sim.opts.freshPlans = true;
        const tt = sim.simLap(id, { grip: g, power: pw, tyre: 'soft', laps: 2 });
        out[`${ln} ${chk} g${g}`] = +tt.toFixed(2);
      }
      sim.opts.lineEdge = undefined; sim.line = parkedLine; sim.cars = parked;
      return out;
    }, [id, process.env.TRK || '/tracks/real/roadatlanta.json', process.env.DIFF || 'phantom']);
    if (!r) { console.log(id, '(no race)'); continue; }
    console.log(`${id} (level grip/power ${r.D.join('/')}, ${Math.round((Date.now() - t0) / 1000)} s)`);
    for (const [k, v] of Object.entries(r)) if (k !== 'D') console.log(`  ${k.padEnd(22)} ${v}`);
  }
} finally { await b.close(); server.kill(); }
