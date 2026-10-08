// Tyre temperatures over real laps: the AI driving `laps` laps of a circuit (Race.simLap, from the warmers), the
// tyres' temperatures every 10% of a lap (front / rear, surface / core) and the grip they give, and the lap time
// against the same laps with temperatures off.   node .devtest/physics/templap.mjs [cars] [mode 1|2] [laps] [track] [tyre]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8500 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const cars = (process.argv[2] || 'f1,m1procar,jsport').split(','), mode = +(process.argv[3] || 1), laps = +(process.argv[4] || 3), TRK = process.argv[5] || '/.devtest/auburn2.json', tyre = process.argv[6] || 'medium';
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  for (const id of cars) {
    const r = await pg.evaluate(async ([id, mode, laps, TRK, tyre, COLD, STEP]) => {
      const { Race } = await import('/js/race.js'); const t = await (await fetch(TRK)).json(); t.env.weather = 'clear';
      const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'hard', car: { chassis: id === 'f1' ? 'custom' : id } }, null);
      const off = race.simLap(id, { tyre, laps });
      const rows = []; let next = 0;
      const on = race.simLap(id, { tyre, laps, temps: mode, cold: COLD, probe: (p, t, car) => {
        const f = (car.lap - 1) + car.idx / race.T.N; if (f < next) return; next += STEP;
        rows.push(`lap ${f.toFixed(2)}  F ${p.tS[0].toFixed(0)}/${p.tC[0].toFixed(0)} ${p.tS[1].toFixed(0)}  R ${p.tS[2].toFixed(0)}/${p.tC[2].toFixed(0)} ${p.tS[3].toFixed(0)}  grip ${(p.tempGrip * 100).toFixed(1)}%`); } });
      return { off: off.toFixed(2), on: on.toFixed(2), rows };
    }, [id, mode, laps, TRK, tyre, !!process.env.COLD, +(process.env.STEP || 0.25)]);
    console.log(`== ${id} (${tyre}, mode ${mode}): ${laps}-lap average ${r.on} s with temperatures, ${r.off} s without`);
    for (const x of r.rows) console.log('  ' + x);
  }
} finally { await b.close(); server.kill(); }
