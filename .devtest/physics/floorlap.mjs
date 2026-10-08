// Realistic damage (physics.js floorHit): how often a car bottoms out over two AI laps (stock ride height, and the
// lowest a setup allows, -12 mm), and the floor damage it adds up to   node .devtest/physics/floorlap.mjs [cars] [track]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8500 + Math.floor(Math.random() * 90), cars = (process.argv[2] || 'f1,m1procar,jsport').split(','), TRK = process.argv[3] || '/.devtest/auburn2.json';
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  for (const id of cars) console.log(await pg.evaluate(async ([id, TRK, STOCK]) => {
    const { Race } = await import('/js/race.js'); const S = await import('/js/setup.js'); const { CARS } = await import('/js/cars.js');
    const t = await (await fetch(TRK)).json(); t.env.weather = 'clear';
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
    const out = [];
    for (const low of (STOCK ? [0] : [0, -12])) {
      let p0 = null;
      let minH = 1;
      race.simLap(id, { tyre: 'medium', laps: 2, probe: (p) => { if (p.flH) minH = Math.min(minH, ...p.flH); if (p0 !== p) { p0 = p; p.engOn = true; if (low) { const st = S.defaultSetup(id); st.rhF = st.rhR = low; p.p = S.applySetup(CARS[id].spec, st, id); p.setupSuspension(); } } } });
      out.push(`${low ? 'low (-12 mm)' : 'stock'}: lowest ${(minH * 1000).toFixed(0)} mm, ${p0.floorHits || 0} hits, floor ${(100 * (p0.dmg.fl || 0)).toFixed(0)}%`);
    }
    return `${id.padEnd(9)} ${out.join('   ')}`;
  }, [id, TRK, !!process.env.STOCK]));
} finally { await b.close(); server.kill(); }
