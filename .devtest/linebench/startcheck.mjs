// race starts: each AI car's time to reach D metres from the green, vs the same car alone from the same grid slot.
// The difference is what the start + first corners cost it in traffic. node startcheck.mjs '<setups>' car [diff] [D] [runs]
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8200 + Math.floor(Math.random() * 90);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 2500));
const setups = JSON.parse(process.argv[2]), id = process.argv[3] || 'm1procar', diff = process.argv[4] || 'alien', D = +(process.argv[5] || 1500), runs = +(process.argv[6] || 2);
const TRK = process.argv[7] || '/.devtest/auburn2.json';
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  for (let k = 0; ; k++) { try { await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.evaluate(async () => { await import('/js/race.js'); }); break; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } }
  for (const su of setups) {
    const r = await pg.evaluate(async ([id, diff, D, runs, su, TRK]) => {
      const { Race } = await import('/js/race.js'); const t = await (await fetch(TRK)).json();
      const car = { chassis: id === 'f1' ? 'custom' : id };
      const go = (opts) => {
        const race = new Race(JSON.parse(JSON.stringify(t)), { mode: 'race', laps: 2, difficulty: diff, aiChassis: 'class', aiMistakes: 'off', damage: 'normal', ...su.opts, ...opts, car }, null);
        race.state = 'racing'; race.stateT = 0;
        const at = new Map();
        for (let f = 0; f < 60 * 120; f++) {
          race.update(1 / 60, race.aiControlsFor(race.player, 1 / 60), {});
          for (const c of race.cars) if (!at.has(c) && c.progress >= D) at.set(c, race.raceTime);
          if (at.size === race.cars.length) break;
        }
        return race.cars.map(c => ({ slot: c.startPos, ai: !!c.ai && !c.isPlayer, t: at.get(c) ?? 99, pos: [...at.entries()].sort((a, b) => a[1] - b[1]).findIndex(e => e[0] === c) + 1 }));
      };
      let loss = 0, n = 0, swaps = 0, worst = 0;
      for (let k = 0; k < runs; k++) {
        const pack = go({ opponents: 11 });
        // alone: one car at a time from its slot (the rest of the grid gone)
        for (const c of pack) {
          if (!c.ai) continue;
          const solo = (() => { const race = new Race(JSON.parse(JSON.stringify(t)), { mode: 'race', laps: 2, difficulty: diff, aiChassis: 'class', aiMistakes: 'off', opponents: 11, ...su.opts, car }, null);
            race.state = 'racing'; race.stateT = 0;
            const me = race.cars.find(x => x.startPos === c.slot); for (const o of race.cars) if (o !== me) { o.gone = true; o.phys.place(0, -9999, 0); o.progress = -1e6; }
            for (let f = 0; f < 60 * 120; f++) { race.update(1 / 60, me.isPlayer ? race.aiControlsFor(me, 1 / 60) : {}, {}); if (me.progress >= D) return race.raceTime; }
            return 99; })();
          const l = c.t - solo; loss += l; n++; worst = Math.max(worst, l);
          if (c.pos < c.slot) swaps += c.slot - c.pos;
        }
      }
      return `${su.name}: mean time lost to traffic by ${D} m ${(loss / n).toFixed(2)} s (worst ${worst.toFixed(2)}), places gained by AI ${(swaps / runs).toFixed(1)}`;
    }, [id, diff, D, runs, su, TRK]);
    console.log(r);
  }
} finally { await b.close(); server.kill(); }
