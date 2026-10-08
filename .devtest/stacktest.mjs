// dev: double stacking. Two AI cars of one team (World Career style entries sharing a team id) sent in together, nose
// to tail before the pit entry: the second must wait short of the shared box until the first has left, never stop on
// top of it.   node .devtest/stacktest.mjs [car]
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
  console.log(await pg.evaluate(async (CAR) => {
    const { Race } = await import('/js/race.js'); const { TEAMS } = await import('/js/car.js');
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
        const race = new Race(t, { mode: 'race', laps: 5, opponents: 5, car: { chassis: CAR }, aiChassis: 'class', aiMistakes: 'off' }, null);
    // (two of the AI cars made one team, as World Career's entries would: the same team id)
    const ais = race.cars.filter(c => !c.isPlayer), pair = [ais[0].teamIdx, ais[1].teamIdx], entries = [];
    for (let k = 0; k < 16; k++) entries[k] = { tid: pair.includes(k) ? 'A' : 'T' + k }; race.opts.entries = entries; race._boxSig = null;
    const T = race.T, N = T.N, pit = race.pit;
    const A = race.cars.find(c => c.teamIdx === pair[0]), B = race.cars.find(c => c.teamIdx === pair[1]);
    if (!A || !B) return 'no team pair: ' + race.cars.map(c => c.teamIdx).join(',');
    const out = [`A box ${race.boxSlot(A.teamIdx) + 1}, B box ${race.boxSlot(B.teamIdx) + 1}, player box ${race.boxSlot(race.player.teamIdx) + 1} of ${pit.boxes.length}`];
    race.state = 'racing'; race.stateT = 0;
    // the others out of the way (far round the lap), A and B nose to tail 350 / 362 m before the entry
    const put = (car, back) => { const i = (pit.start - Math.round(back / T.ds) + N) % N, o = race.line[i]; car.phys.place(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o, Math.atan2(T.FX[i], T.FZ[i])); const v = 35; car.phys.vx = T.FX[i] * v; car.phys.vz = T.FZ[i] * v; car.phys.gear = 4; race.updateTracker(car, true); };
    race.cars.forEach((c, k) => { if (c !== A && c !== B) put(c, 1500 + k * 40); });
    put(A, 350); put(B, 362);
    for (const c of [A, B]) { c.pitting = true; c.pitPhase = 'in'; c.pitReq = { tyre: 'medium', repair: false }; }
    let minGap = 1e9, log = [], last = {};
    for (let f = 0; f < 60 * 120; f++) {
      race.update(1 / 60, race.aiControlsFor(race.player, 1 / 60), {});
      for (const [n, c] of [['A', A], ['B', B]]) if (last[n] !== c.pitPhase) { last[n] = c.pitPhase; log.push(`${(f / 60).toFixed(1)}s ${n} ${c.pitPhase || 'back on track'}`); }
      if (A.pitting && B.pitting) minGap = Math.min(minGap, Math.hypot(A.phys.x - B.phys.x, A.phys.z - B.phys.z));
      if (!A.pitting && !B.pitting && f > 600) break;
    }
    out.push(...log, `closest the two came while both in the lane: ${minGap.toFixed(1)} m; B waited ${(B.pitWait || 0).toFixed(1)} s`);
    return out.join('\n');
  }, CAR));
} finally { await b.close(); server.kill(); }
