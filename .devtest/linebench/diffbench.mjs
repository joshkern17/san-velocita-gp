// lap time of the AI at given pace / grip / power edges, per car, on the user's Auburn circuit (or argv[4] track json)
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8890 + Math.floor(Math.random() * 50);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const combos = JSON.parse(process.argv[2]); const ids = (process.argv[3] || 'm1procar').split(','); const trk = process.argv[4] || '/.devtest/auburn2.json';
try {
  const pg = await b.newPage();
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.waitForTimeout(1500);
  for (const id of ids) for (const c of combos) {
    const r = await pg.evaluate(async ([c, id, trk]) => {
      const { Race } = await import('/js/race.js');
      const t = trk.startsWith('preset:') ? (await import('/js/track.js')).presetTracks()[+trk.slice(7)] : await (await fetch(trk)).json();
      if (trk.startsWith('preset:')) { t.env.weather = 'clear'; }
      const race = new Race(t, { mode: 'test', laps: 3, opponents: 0, difficulty: 'alien', freshPlans: true, lineKind: c.line === 'fast' ? 'fit' : undefined, lineMargin: c.margin, holdLine: c.hold, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
      const t0 = performance.now();
      const time = race.simLap(id, { pace: c.pace, power: c.power, grip: c.grip, tyre: 'soft' });
      return { id, trk: t.name, ...c, time: +time.toFixed(2), rounds: race.learnRounds, ms: Math.round(performance.now() - t0) };
    }, [c, id, trk]);
    console.log(JSON.stringify(r));
  }
} finally { await b.close(); server.kill(); }
