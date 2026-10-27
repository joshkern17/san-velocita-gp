// The session file: when a session ends, everything about how it was driven goes to saves/sessions/ (serve.py), so a
// race where you beat the AI can be picked apart afterwards (tools/session.mjs): your laps sample by sample, each AI
// car's best lap and lap times, the speeds the AI planned for its car, and the settings it was raced on.
// Only on the game's own server (port 8000); nothing on screen.
import { CH, lapLength, LapRecorder } from './telemetry.js';
import { nameCorners } from './realtracks.js';
import { device, wheelPad } from './input.js';

// decimals kept per channel (t in s, v in m/s, s / h in m)
const DP = { t: 3, v: 2, thr: 2, brk: 2, steer: 3, gear: 0, lat: 2, sf: 2, sr: 2, s: 2, h: 2, aid: 0 };
const round = (a, n, dp) => { const k = 10 ** dp, o = new Array(n); for (let i = 0; i < n; i++) o[i] = Math.round((a[i] || 0) * k) / k; return o; };
const packLap = (lap, n) => {
  if (!lap) return null;
  const ch = {}; for (const c of CH) ch[c] = round(lap.ch[c], n, DP[c]);
  const { ch: _, ...meta } = lap; return { ...meta, ch };
};
// the settings, as far as they're plain values (the car's livery and the like left out)
const plain = (o) => { const out = {}; for (const k in o) { const v = o[k]; if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v; } return out; };

export function sessionFile(sim) {
  const T = sim.T, n = lapLength(T), pl = sim.player;
  const corners = nameCorners(sim.track, T, sim.corners.list.map(c => ({ n: c.n, dir: c.dir, entry: c.entry, apex: c.apex, exit: c.exit })));
  const carOf = (car) => ({
    name: car.name, team: car.team && car.team.name, carId: car.carId, start: car.startPos, pos: car.pos, finished: !!car.finished,
    laps: car.lapTimes.map(t => Math.round(t * 1000) / 1000), valid: car.lapValid || [], best: isFinite(car.best) ? car.best : null,
    power: car.phys.powerMul, grip: car.phys.gripMul, pits: car.pits, hits: car.hits || 0,
  });
  const ai = sim.cars.filter(c => c.ai && !c.isPlayer).map(car => {
    const r = sim.aiRec && sim.aiRec.get(car);
    return { ...carOf(car), pace: car.ai.pace, skill: car.ai.skill ?? null, aggr: car.ai.aggr ?? null, plan: round(car.lineV, n, 2), bestLap: packLap(r && r.best, n) };
  });
  // practice / qualifying: the AI field doesn't drive, its laps are simulated (race.js qualiStart). Their times, and one
  // lap of the quickest of them recorded as it'd drive it
  let field = null;
  if (sim.quali && sim.quali.field && sim.quali.field.length) {
    const F = sim.quali.field, q = F.reduce((b, e) => (!b || e.pot < b.pot ? e : b), null);
    let lap = null;
    try { const rec = new LapRecorder(T); sim.simLap(q.id, { pace: q.pace, power: q.power, grip: sim.edgeFor(q.id).grip, tyre: 'soft', temps: sim.tempMode, rec }); lap = rec.lap; } catch (e) {}
    field = { list: F.map(e => ({ name: e.name, team: e.team && e.team.name, carId: e.id, pace: e.pace, power: e.power, pot: e.pot, best: isFinite(e.best) ? e.best : null, runs: e.plan.map(r => r.time) })),
      quickest: { name: q.name, carId: q.id, pace: q.pace, power: q.power, techCost: q.tf ? q.tf.cost : 0, grip: sim.edgeFor(q.id).grip, lap: packLap(lap, n) } };
  }
  return {
    v: 1, when: new Date().toISOString(),
    track: { name: sim.track.name, real: !!sim.track.real, N: T.N, n, ds: T.ds, L: T.L, open: !!T.open, W: round(T.W, n, 1), corners },
    session: { mode: sim.mode, kind: sim.quali ? sim.quali.kind || 'quali' : sim.mode, raceTime: sim.raceTime, laps: sim.laps, rain: !!sim.rain,
      diff: sim.diff, balanced: sim.balancing ? !!sim.balancing() : null, opts: plain(sim.opts), aids: sim.opts.aids || null,
      input: wheelPad() ? 'wheel' : device.kind },
    player: { ...carOf(pl), plan: round(pl.lineV, n, 2), lapsData: sim.sessLaps.map(l => packLap(l, n)) },
    ai, field,
    // every car-to-car hit (race.js noteContact): v = closing speed km/h, behind = which of the two was behind, pre = each
    // car just before, after = the next 1.5 s (most it slid, slowest it got, off the road)
    contacts: (sim.contactLog || []).map(({ cars, last, ...e }) => e),
  };
}

// a session's over (main.js disposeSim): save it if you drove at least a lap. The same file each time (sim.sessName,
// from when it was first saved): a race is saved as it goes too (sessionTick), and the last save wins
export function saveSession(sim) {
  if (!sim || !sim.player || !sim.aiRec || !sim.sessLaps || !sim.sessLaps.length || location.port !== '8000') return;
  try {
    const f = sessionFile(sim);
    sim.sessName ||= `${f.when.slice(0, 16).replace(/[-:T]/g, '')}_${f.track.name}_${f.session.kind}_${f.player.carId}`;
    fetch('/__session?name=' + encodeURIComponent(sim.sessName), { method: 'POST', body: JSON.stringify(f) }).catch(() => {});
  } catch (e) { console.warn('session file', e); }
}
// a race, saved as it goes (each frame, main.js): after each lap you finish and every 30 s of the race, a moment
// later (it's a few MB to put together: not at the line as you cross it). So a race you give up on and quit,
// or close the game out of, still leaves its file up to the last lap. (Races only: practice and qualifying put a lap of
// the AI's together for their file, too much to do every lap)
export function sessionTick(sim) {
  if (!sim || sim.mode !== 'race' || sim.quali || !sim.sessLaps || !sim.sessLaps.length || location.port !== '8000' || sim.sessWait) return;
  const n = sim.sessLaps.length, t = sim.raceTime || 0;
  if (n === sim.sessN && t - (sim.sessT || 0) < 30) return;
  sim.sessN = n; sim.sessT = t; sim.sessWait = true;
  const go = () => { sim.sessWait = false; if (!sim.disposed) saveSession(sim); };
  setTimeout(go, 1500); // (not requestIdleCallback: a page drawing a race every frame is never idle, and it never came)
}
