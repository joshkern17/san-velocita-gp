// In-game physics checks (needs Chrome + tools/node_modules: cd tools && npm install). Starts its own server.
//
//   node .devtest/physics/browser.mjs ai [cars]      AI learning bench on Maple Ridge: learned lap at 95/97/100% pace,
//                                                     offs per 5 laps, learning rounds (40 = didn't converge)
//   node .devtest/physics/browser.mjs ref [car] [tyre]  the Lap Review reference lap on .devtest/auburn2.json (the
//                                                     user's circuit): time and faults (0 = clean) at each pace
//   node .devtest/physics/browser.mjs load [diff]    race build time incl. AI learning (first time / cached; diff
//                                                     = easy | medium | hard | alien, default medium)
//   node .devtest/physics/browser.mjs cpu            physics cost in the browser (ms per simulated minute, one car)
//
// Targets: AI 0-4 offs per 5 laps at 95-97% pace, learning under 40 rounds; reference faults 0-2; load times in
// docs/PHYSICS.md.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const URL = `http://127.0.0.1:${PORT}`;
const [mode = 'ai', a1, a2] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage();
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`${URL}/.devtest/handling.html`); await pg.waitForTimeout(1500);
  if (mode === 'ai') {
    const cars = (a1 || 'f1,aventus,m1procar,bx300,rmx,testarossa,mustang,m3gtr,rs964,m5,jsport,transit,hearse').split(',');
    const rows = await pg.evaluate(async (cars) => { const m = await import('/.devtest/aibench.js'); return m.bench({ tracks: [1], scales: [0.95, 0.97, 1], cars }); }, cars);
    for (const r of rows) console.log(r.id.padEnd(11), ['x0.95', 'x0.97', 'x1'].map(k => `${k} ${r[k].t}s offs ${r[k].offs}`).join(' | '), '| learn', r.rounds.split(' ').slice(0, 2).join(' '), 'rounds');
  } else if (mode === 'ref') {
    const out = await pg.evaluate(async ([id, tyre]) => {
      const { Race } = await import('/js/race.js'); const { LapRecorder } = await import('/js/telemetry.js');
      const t = await (await fetch('/.devtest/auburn2.json')).json();
      const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, car: { chassis: id } }, null);
      const ref = race.referenceTelemetry(id, tyre), lines = [`reference ${id} on ${tyre}: ${ref.time.toFixed(2)}s, faults ${race.lapFaults(ref)} (learned in ${race.learnRounds} rounds)`];
      for (const pace of [0.97, 0.93, 0.87]) { const rec = new LapRecorder(race.T); const time = race.simLap(id, { pace, tyre, rec }); lines.push(`  pace ${pace}: ${time.toFixed(2)}s faults ${rec.lap ? race.lapFaults(rec.lap) : 'no lap'}`); }
      return lines;
    }, [a1 || 'm1procar', a2 || 'soft']);
    out.forEach(l => console.log(l));
  } else if (mode === 'cpu') {
    await pg.goto(`${URL}/.devtest/physics/cpu.html`); await pg.waitForTimeout(800);
    for (let k = 0; k < 2; k++) console.log(JSON.stringify(await pg.evaluate(() => window.cpu())));
  } else if (mode === 'load') {
    await pg.goto(`${URL}/index.html`); await pg.waitForTimeout(4000);
    for (const [label, aiChassis] of [['one class', 'class'], ['all classes mixed', 'multi'], ['again (cached)', 'multi']]) {
      const ms = await pg.evaluate(async ([aiChassis, difficulty]) => {
        const { Race } = await import('/js/race.js'); const t = await (await fetch('/.devtest/auburn2.json')).json();
        const t0 = performance.now(); new Race(t, { mode: 'race', laps: 3, opponents: 11, difficulty, aiChassis, car: { ...window.__svgp.settings.car, chassis: 'm1procar' } }, null);
        return Math.round(performance.now() - t0);
      }, [aiChassis, a1 || 'medium']);
      console.log(label.padEnd(20), ms + ' ms to build the race at Auburn (AI learning included)');
    }
  }
} finally { await b.close(); server.kill(); }
