// dev: the AI learning log for some cars (hits per practice lap) + where the bench laps went off
//   node .devtest/physics/ailog.mjs mustang,aventus [pace]      (TRACK=auburn: the user's circuit; TRACE=1 FROM=i TO=j: log
//   the car through track points i..j)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  if (process.env.TRACK === 'auburn') await pg.addInitScript(() => { window.__auburn = 1; });
  if (process.env.TRACE) await pg.addInitScript(([a, b]) => { window.__trace = 1; window.__from = a; window.__to = b; }, [process.env.FROM || 590, process.env.TO || 670]);
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.waitForTimeout(1500);
  const cars = (process.argv[2] || 'mustang').split(','), pace = +(process.argv[3] || 0.97);
  const rows = await pg.evaluate(async ([cars, pace]) => {
    const m = await import('/.devtest/aibench.js'); const { Race } = await import('/js/race.js'); const { presetTracks } = await import('/js/track.js');
    const out = [];
    for (const id of cars) {
      const trk = window.__auburn ? await (await fetch('/.devtest/auburn2.json')).json() : presetTracks()[1]; trk.env.weather = 'clear'; trk.env.pits = false;
      const race = new Race(JSON.parse(JSON.stringify(trk)), { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, car: { chassis: id } }, null);
      race.limits = {}; const V = race.limitsFor(id); race.benchLaps = 5;
      const tr = []; const orig = race.updateTracker.bind(race); let n = 0;
      race.updateTracker = (car, snap) => { orig(car, snap); const p = car.phys; if (car.idx >= +(window.__from || 590) && car.idx <= +(window.__to || 670) && tr.length < 400 && (n++ % 8 === 0)) tr.push(`${car.idx} v${p.speed.toFixed(1)} plan${(car.lineV[car.idx]).toFixed(1)} g${p.gear} thr${(p.throttle ?? 0).toFixed(2)} brk${(p.braking ?? 0).toFixed(2)} δ${(p.delta * 57.3).toFixed(1)} β${(p.beta * 57.3).toFixed(1)} s${car.s.toFixed(1)}/${(race.line[car.idx]).toFixed(1)} esc${(p.escB ?? 0).toFixed(2)}/${(p.escK ?? 1).toFixed(2)} κ${Array.from(p.ks).map(x => x.toFixed(2)).join(',')} ${car.onRoad ? '' : 'OFF'}`); };
      const r = m.lap(race, id, V.map(v => v * pace)); race.updateTracker = orig;
      if (window.__trace) out.push(tr.slice(0, 120).join('\n'));
      out.push(`${id}: learn ${race.learnRounds} rounds [${race.learnLog.join(',')}] | ${pace}: offs ${r.offs} at ${r.at} | N ${race.T.N}`);
    }
    return out;
  }, [cars, pace]);
  rows.forEach(r => console.log(r));
} finally { await b.close(); server.kill(); }
