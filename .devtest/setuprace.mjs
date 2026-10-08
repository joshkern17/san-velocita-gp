// dev: a race picks up your car's active setup (setup.js) and the AI keeps the standard one; Race.applySetup (the pit
// garage, after Tuning) swaps it on the car in the box   node .devtest/setuprace.mjs [car]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8500 + Math.floor(Math.random() * 90), CAR = process.argv[2] || 'm1procar';
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  const r = await pg.evaluate(async (CAR) => {
    localStorage.removeItem('svgp.setups');
    const S = await import('/js/setup.js'); const { Race } = await import('/js/race.js');
    const st = S.defaultSetup(CAR); st.fw = 3; st.rw = 3; st.arbR = 2; st.camF = -3.8; S.saveSetup(CAR, 'Test', st);
    const t = await (await fetch('/.devtest/auburn2.json')).json();
    const race = new Race(t, { mode: 'race', laps: 1, opponents: 3, car: { chassis: CAR }, aiChassis: 'class' }, null);
    const pl = race.player, ai = race.cars.find(c => !c.isPlayer && c.carId === CAR) || race.cars.find(c => !c.isPlayer);
    const out = { playerKd: pl.phys.p.kd, playerCam: pl.phys.p.camber, aiKd: ai.phys.p.kd, aiCam: ai.phys.p.camber ?? null, aiCar: ai.carId };
    S.saveSetup(CAR, 'Test', S.defaultSetup(CAR)); race.applySetup(pl); out.afterKd = pl.phys.p.kd; out.stock = (await import('/js/cars.js')).CARS[CAR].spec.kd;
    for (let f = 0; f < 120; f++) race.update(1 / 60, race.aiControlsFor(pl, 1 / 60), {}); out.nan = !isFinite(pl.phys.x);
    localStorage.removeItem('svgp.setups'); return out;
  }, CAR);
  console.log(JSON.stringify(r));
} finally { await b.close(); server.kill(); }
