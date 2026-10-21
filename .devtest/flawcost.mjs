// dev: what a driver's technique flaws really cost on a lap, against what the quali / practice sims add for them.
// One lone lap each: clean, and with the flaws (car.ai.skill + its traction control), at the same pace and edge.
//   node .devtest/flawcost.mjs [car=miata] [track=/tracks/real/willow.json] [diff=phantom] [tyre=soft]  FLAWS='[[imp,wander,brake],...]'
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8600 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2000));
const [id = 'miata', TRK = '/tracks/real/willow.json', diff = 'phantom', tyre = 'soft'] = process.argv.slice(2);
const FL = JSON.parse(process.env.FLAWS || '[[0.13,0.1,0.0034],[0.53,0.49,0.016],[0.7,0.57,0.019],[0.75,0.9,0.03]]');
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`);
  const r = await pg.evaluate(async ([id, TRK, diff, tyre, FL]) => {
    const { Race } = await import('/js/race.js'); const t = await (await fetch(TRK)).json(); t.env.weather = 'clear';
    const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: diff, temps: 'realistic', car: { chassis: id } }, null);
    const D = race.diff, o = { power: D.power, grip: D.grip, tyre, temps: 2, laps: 2 };
    const clean = race.simLap(id, o), out = [`clean ${clean.toFixed(2)}`];
    for (const [imp, wander, brake] of FL) { const tc = 1 - 0.5 * imp, t = race.simLap(id, { ...o, skill: { imp, wander, brake }, tc }); out.push(`imp ${imp} wander ${wander} brake ${brake}: ${t.toFixed(2)} (${((t / clean - 1) * 100).toFixed(2)}%)`); }
    return out;
  }, [id, TRK, diff, tyre, FL]);
  console.log(`${id} ${TRK} ${diff} ${tyre}`); for (const x of r) console.log('  ' + x);
} finally { await b.close(); server.kill(); }
