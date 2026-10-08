// standing starts from a grid slot, alone: the AI's own launch vs flat out on less traction control. node launch.mjs cars [slot]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8100 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const cars = (process.argv[2] || 'm3gtr,m1procar,f1').split(','), TRK = process.argv[3] || '/.devtest/auburn2.json';
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage();
  for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); break; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } }
  for (const id of cars) {
    const r = await pg.evaluate(async ([id, TRK]) => {
      const { Race } = await import('/js/race.js'); const { AI_AIDS } = await import('/js/aids.js'); const t = await (await fetch(TRK)).json();
      const run = (mode, tc) => {
        const race = new Race(JSON.parse(JSON.stringify(t)), { mode: 'race', laps: 2, difficulty: 'hard', opponents: 0, car: { chassis: id === 'f1' ? 'custom' : id } }, null);
        race.state = 'racing'; race.stateT = 0;
        const me = race.player; me.phys.setAids({ ...AI_AIDS, tc });
        const marks = [100, 300, 600], at = []; let dist = 0;
        for (let f = 0; f < 60 * 60 && at.length < marks.length; f++) {
          let ctl = race.aiControlsFor(me, 1 / 60); me.phys.setAids({ ...AI_AIDS, tc }); // (the autopilot resets aids)
          if (mode === 'flat' && me.phys.speed < 40) ctl = { ...ctl, throttle: 1, brake: 0 };
          race.update(1 / 60, ctl, {}); if (race.raceTime > 0) dist += me.phys.speed / 60;
          while (at.length < marks.length && dist >= marks[at.length]) at.push(race.raceTime.toFixed(2));
        }
        return at.join(' / ');
      };
      return `${id}: AI launch, TC high ${run('ai', 1)} | flat out, TC low ${run('flat', 0.5)} | flat out, TC off ${run('flat', 0)}  (s to 100 / 300 / 600 m)`;
    }, [id, TRK]);
    console.log(r);
  }
} finally { await b.close(); server.kill(); }
