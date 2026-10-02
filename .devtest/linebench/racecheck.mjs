// a 2-lap race, 11 AI + you on autopilot: offs, wall hits, car-to-car contacts, old line vs fitted line
import { spawn } from 'child_process';
const ROOT = '/Users/joshkern/Downloads/Racing Game';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8700 + Math.floor(Math.random() * 50);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
const [id = 'm1procar', diff = 'hard', trk = '/.devtest/auburn2.json', kinds = 'old,fit'] = process.argv.slice(2);
try {
  const pg = await b.newPage();
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.waitForTimeout(1500);
  for (const kind of kinds.split(',')) {
    const r = await pg.evaluate(async ([id, diff, trk, kind]) => {
      const { Race } = await import('/js/race.js'); const t = await (await fetch(trk)).json();
      const race = new Race(t, { mode: 'race', laps: 2, opponents: 11, difficulty: diff, aiChassis: 'class', aiMistakes: 'off', damage: 'normal', lineKind: kind.startsWith('old') ? undefined : 'fit', lineMargin: /m([\d.]+)/.test(kind) ? +kind.match(/m([\d.]+)/)[1] : undefined, offSlow: !kind.includes('noslow'), car: { chassis: id === 'f1' ? 'custom' : id } }, null);
      race.state = 'racing'; race.stateT = 0;
      const offAt = [], offs = new Map(), wasOn = new Map(); let contacts = 0;
      const crashed0 = race.crashed.bind(race); let walls = 0; const where = []; race.crashed = (c, vn) => { if (vn > 4) { walls++; where.push(`L${c.lap}@${c.idx}:${Math.round(c.phys.speed*3.6)}kmh:${(c.s - race.line[c.idx]).toFixed(1)}/${(T_.W[c.idx] / 2 - Math.abs(c.s)).toFixed(1)}${c.ai && (c.ai.over || c.ai.def) ? 'R' : ''}${c.ai && c.ai.oops ? 'X' : ''}`); } return crashed0(c, vn); };
      const T_ = race.T;
      const dt = 1 / 60;
      for (let f = 0; f < 60 * 400; f++) {
        const ctl = race.aiControlsFor(race.player, dt);
        race.update(dt, ctl, {});
        for (const c of race.cars) { const on = c.onRoad; if (wasOn.get(c) && !on) { offs.set(c, (offs.get(c) || 0) + 1); offAt.push(`L${c.lap}@${c.idx}:${Math.round(c.phys.speed * 3.6)}:${(c.s - race.line[c.idx]).toFixed(1)}${c.isPlayer ? 'P' : ''}`); } wasOn.set(c, on); }
        if (race.cars.every(c => c.finished || c.gone)) break;
      }
      const fin = race.cars.filter(c => c.finished).length;
      const best = Math.min(...race.cars.filter(c => !c.isPlayer).map(c => c.best));
      const offT = [...offs.values()].reduce((a, b) => a + b, 0);
      return `${kind}: finished ${fin}/${race.cars.length}, AI best lap ${best.toFixed(2)}, offs ${offT}, wall hits >4 m/s ${walls}, race time ${race.raceTime.toFixed(1)}s, \n  offs lap@idx:kmh:off-line: ${offAt.join(' ')}\n  hits idx:off-line/room-to-edge: ${where.join(' ')}`;
    }, [id, diff, trk, kind]);
    console.log(id, process.env.HITS ? r : r.split("\n")[0]);
  }
} finally { await b.close(); server.kill(); }
