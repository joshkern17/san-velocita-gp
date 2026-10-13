// dev: an AI car pits (entry ramp, stop, exit) on a preset or real track: its path against the lane's, wall contact
//   node .devtest/pitrun.mjs [preset name | real id]   (OWNOUT=m: a hand-placed lane, m further out)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9390 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([name, OWNOUT]) => { const { presetTracks, archivedTracks, cloneTrack } = await import('/js/track.js'); let t = [...presetTracks(), ...archivedTracks()].find(t => t.name === name);
    if (!t) { const R = await import('/js/realtracks.js'); t = await R.hydrateReal(cloneTrack(R.realTracks().find(p => p.real.id === name))); }
    // (OWNOUT=m: its pit lane placed by hand instead, as the Circuit Designer's PIT LANE tool keeps it, its middle moved m further out)
    if (OWNOUT) { const M = await import('/js/track.js'), R2 = await import('/js/runoff.js'), T = M.sampleTrack(t), A = M.analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
      const p = M.buildPitLane(T, A, t.env, t.osm && t.osm.pitLane, R2.surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit), own = M.pitToOwn(T, p);
      own.pts = own.pts.map((q, k) => (k === 0 || k === own.pts.length - 1 ? q : [q[0], q[1] + OWNOUT])); t.dress = { ...(t.dress || {}), pit: own }; }
    t.env.weather = 'clear'; window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 3, strategy: false, car: window.__svgp.settings.car }, 'menu'); }, [process.argv[2] || 'Maple Ridge GP', +(process.env.OWNOUT || 0)]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, N = T.N, P = sim.pit; sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const c = sim.cars.find(c => !c.isPlayer && c.ai), step = () => sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
    for (let f = 0; f < 60 * 300; f++) { step(); const d = ((P.start - c.idx + N) % N) * T.ds; if (d < 260 && d > 200) break; }
    c.pitting = true; c.pitPhase = 'in'; c.pitReq = { tyre: 'soft', repair: false };
    const log = [], seen = new Set(); let hits = 0, crash0 = c.crashT, maxOut = 0, t = 0, entered = false;
    for (let f = 0; f < 60 * 120; f++) {
      step(); t += 1 / 60;
      if (c.crashT !== crash0) { hits++; crash0 = c.crashT; log.push(`HIT v${(c.crashV || 0).toFixed(0)} @${P.REG[c.idx]}`); }
      const reg = P.REG[c.idx];
      if (reg >= 0) { entered = true; const sl = c.s * P.side; maxOut = Math.max(maxOut, sl - (isNaN(P.WALL[c.idx]) ? P.OUT[c.idx] : P.CEN[c.idx] + P.width / 2));
        const key = Math.floor(reg / 10); if (!seen.has(key)) { seen.add(key); log.push(`${reg}:${c.pitPhase || '-'} s${sl.toFixed(1)} cen${P.CEN[c.idx].toFixed(1)} out${P.OUT[c.idx].toFixed(1)} v${c.phys.speed.toFixed(0)}`); } }
      if (entered && reg < 0 && !c.pitting) return { ok: true, t: +t.toFixed(1), hits, maxPastTarmac: +maxOut.toFixed(2), nRamp: P.nRamp, log };
    }
    return { ok: false, phase: c.pitPhase, hits, log };
  });
  console.log(JSON.stringify({ ...r, log: undefined })); console.log(r.log.join('\n'));
} finally { await b.close(); server.kill(); }
