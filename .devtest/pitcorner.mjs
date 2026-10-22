// dev: an AI car's speed into the pit lane against its racing lap through the same stretch (pit entries in a corner)
//   node .devtest/pitcorner.mjs [real id | preset name] [car]   (RAIN=1: a wet race)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 9490 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(async ([name, car, rain]) => { const { presetTracks, archivedTracks, cloneTrack } = await import('/js/track.js'); let t = [...presetTracks(), ...archivedTracks()].find(t => t.name === name);
    if (!t) { const R = await import('/js/realtracks.js'); t = await R.hydrateReal(cloneTrack(R.realTracks().find(p => p.real.id === name))); }
    t.env.weather = rain ? 'rain' : 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 10, opponents: 1, pick: false, extra: { strategy: false, car: { ...window.__svgp.settings.car, chassis: car } } }, 'menu'); }, [process.argv[2] || 'summitpoint', process.argv[3] || 'miata', !!process.env.RAIN]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim, T = sim.T, N = T.N, P = sim.pit; sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const c = sim.cars.find(c => !c.isPlayer && c.ai), step = () => sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
    const toEntry = () => ((P.start - c.idx + N) % N) * T.ds;
    const W = 320, rampEnd = P.limitIn ?? Math.round(P.nRamp * 0.55); // (from 320 m before the entry to the speed line)
    const inWin = () => toEntry() <= W || (P.REG[c.idx] >= 0 && P.REG[c.idx] <= rampEnd + 10);
    const rec = (out) => { const p = c.phys, k = P.REG[c.idx] >= 0 ? 'L' + P.REG[c.idx] : -Math.round(toEntry());
      out[k] ??= { v: Math.round(p.speed * 3.6), slide: Math.round(Math.abs(p.beta) * 57.3), s: +c.s.toFixed(1), brk: +(c.ctl?.brake || 0).toFixed(2), lv: Math.round((c.lineV || sim.lineV)[c.idx] * 3.6), off: Math.abs(c.s) > T.W[c.idx] / 2 + 0.5 && P.REG[c.idx] < 0 }; };
    // a racing lap through the stretch first (out of the window, then through it), then the same car pits
    let f = 0; for (; f < 60 * 400 && inWin(); f++) step();
    for (; f < 60 * 400 && !inWin(); f++) step();
    const base = {}; for (; f < 60 * 400 && inWin(); f++) { step(); rec(base); }
    for (; f < 60 * 400; f++) { step(); const d = toEntry(); if (d < 330 && d > W) break; }
    c.pitChecked = true; c.pitting = true; c.pitPhase = 'in'; c.pitReq = { tyre: c.phys.tyre.c, repair: false };
    const pit = {}; let crash0 = c.crashT, hits = 0;
    for (let g = 0; g < 60 * 60; g++) { step(); if (c.crashT !== crash0) { hits++; crash0 = c.crashT; } if (!inWin() && Object.keys(pit).length > 20) break; rec(pit); }
    const lines = [`${c.carId}: pit speed ${(P.speed * 3.6).toFixed(0)} km/h, rain grip ${sim.rainGrip}, ramp to speed line ${(rampEnd * T.ds).toFixed(0)} m, wall hits ${hits}`, '   at     race v slide  s     |  pit v slide  s    brk'];
    const keys = [...new Set([...Object.keys(base), ...Object.keys(pit)])].sort((a, b) => (a[0] === 'L' ? 1e4 + +a.slice(1) : +a) - (b[0] === 'L' ? 1e4 + +b.slice(1) : +b));
    let n = 0; for (const k of keys) { if (n++ % 5) continue; const a = base[k], q = pit[k];
      lines.push(`${String(k[0] === 'L' ? 'lane+' + (+k.slice(1) * T.ds).toFixed(0) : k).padStart(9)}  ${a ? `${String(a.v).padStart(4)} ${String(a.slide).padStart(4)}° ${String(a.s).padStart(5)}` : ' '.repeat(17)}  |  ${q ? `${String(q.v).padStart(4)} ${String(q.slide).padStart(4)}° ${String(q.s).padStart(5)} ${q.brk.toFixed(2)} plan ${q.lv}${q.off ? ' OFF' : ''}${q.slide > 12 ? ' SLIDE' : ''}` : ''}`); }
    return lines.join('\n');
  });
  console.log(r);
} finally { await b.close(); server.kill(); }
