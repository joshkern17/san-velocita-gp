// a first-time race build, a step at a time: how long each step blocks the page; then picking a car of another class
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8050 + Math.floor(Math.random() * 40);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const [id = 'm1procar', diff = 'alien', pick = 'f1', TRK = '/.devtest/auburn2.json'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); break; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } }
  const out = await pg.evaluate(async ([id, diff, pick, TRK]) => {
    const { Race } = await import('/js/race.js'); const t = await (await fetch(TRK)).json();
    const log = []; let last = performance.now(), lastLabel = 'construct';
    const step = (f, label) => { const now = performance.now(); log.push(`${(now - last).toFixed(0).padStart(6)} ms  ${lastLabel}`); last = now; lastLabel = label; };
    const r = new Race(t, { mode: 'race', laps: 3, opponents: 11, difficulty: diff, aiChassis: 'class', car: { chassis: id === 'f1' ? 'custom' : id }, defer: true }, null);
    await r.prepare(step);
    log.push(`cars ${r.cars.length}, state ${r.state}`);
    lastLabel = '(pick) start'; last = performance.now();
    await r.prepareCar({ chassis: pick === 'f1' ? 'custom' : pick }, step);
    const t0 = performance.now(); r.commitCar({ chassis: pick === 'f1' ? 'custom' : pick }); log.push(`${(performance.now() - t0).toFixed(0).padStart(6)} ms  commitCar (should be quick)`);
    log.push(`after pick: line owner ${r.lineOwner}, cars ${[...new Set(r.cars.map(c => c.carId))].join(',')}`);
    return log.join('\n');
  }, [id, diff, pick, TRK]);
  console.log(out);
} finally { await b.close(); server.kill(); }
