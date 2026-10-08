// dev: what the AI field loses off the line. A full grid on Alien, everyone on the AI (you too, from the back): each
// grid slot's distance gained at 4/8/14/20 s against the pole car's (clear road), and how long each spent off the
// throttle (lifting, braking, squeezed) on the way to the first corners. A clean driver loses none of that, which is
// how you gain places at the start.
//   node .devtest/startloss.mjs [car] [diff] [secs]   Q=1 (summary only), EXTRA='{"opt":v}' race options,
//   TR=all|lead|<grid slot> (traces). The why / follow-limited / trace columns read ai.__dbg, a temporary hook in
//   race.js aiControls ({ vt0: vt before slowTo, slowTo, sq: squeezed, offK, plan } and the throttle cuts): add it back to use them.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', diff = process.argv[3] || 'alien', secs = +(process.argv[4] || 20);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate((o) => { window.__OPP = o; }, +(process.env.OPP ?? 11));
  await pg.evaluate(async ([id, diff]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.difficulty = diff; S.grid = 'back';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: +(window.__OPP ?? 11), aiChassis: 'class', car: S.car }, 'menu');
  }, [id, diff]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  const out = await pg.evaluate(([secs, extra, process_Q, process_TR]) => { const TR = [];
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    Object.assign(sim.opts, extra);
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; sim.player.autoT = 1e9;
    const grid = [...sim.cars].sort((a, b) => b.progress - a.progress), p0 = new Map(grid.map(c => [c, c.progress]));
    const at = [4, 8, 14, 20].filter(t => t <= secs), gain = new Map(grid.map(c => [c, []]));
    const st = new Map(grid.map(c => [c, { lift: 0, brake: 0, why: {} }]));
    let hits = 0; const fc = sim.rc.contact.bind(sim.rc); sim.rc.contact = (...a) => { hits++; return fc(...a); };
    for (let f = 1; f <= secs * 60; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      const t = f / 60, pole = grid[0];
      if (process_TR === 'all' && f % 15 === 0 && t > 10.5 && t < 14.6) { TR.push(t.toFixed(2) + ' ' + [...sim.cars].sort((a, b) => b.progress - a.progress).map(c => { const d = c.ai?.__dbg || {}; return `${c.isPlayer ? 'YOU' : c.name.slice(3, 7)}@${(c.progress - grid[0].progress).toFixed(0)} ${(c.phys.u * 3.6).toFixed(0)}/${((d.vt0 || 0) * 3.6).toFixed(0)}${isFinite(d.slowTo) && d.slowTo < d.vt0 ? 'F' : ''}${d.sq ? 'S' : ''}${(c.ctl.brake || 0) > 0.05 ? 'b' : ''} s${c.s.toFixed(0)}`; }).join(' | ')); }
      if (process_TR === 'lead' && f % 6 === 0 && t > 9 && t < 13.5) { const c = [...sim.cars].sort((a, b) => b.progress - a.progress)[0], d = c.ai?.__dbg || {}; TR.push(`${t.toFixed(2)} ${c.name} u${(c.phys.u*3.6).toFixed(0)} s${c.s.toFixed(1)} line${sim.line[c.idx].toFixed(1)} W/2 ${(sim.T.W[c.idx]/2).toFixed(1)} over${c.ai.over.toFixed(1)} thr${c.ctl.throttle.toFixed(2)} thr0 ${(d.thr0??0).toFixed(2)} steer${c.ctl.steer.toFixed(2)} gripF${(d.gripF??0).toFixed(2)} push${(d.push??0).toFixed(2)} wide${(d.wide??0).toFixed(1)} room${(d.room??0).toFixed(1)} slipR${(d.slipR??0).toFixed(2)} rearOver${(d.rearOver??0).toFixed(2)} err${((d.err??0)*3.6).toFixed(0)} onRoad${d.onRoad} oops${d.oops} goBy${c.ai.goBy && sim.raceTime < c.ai.goBy.until ? c.ai.goBy.side : 0} wake${(c.phys.wakeLoss||0).toFixed(2)} K${(sim.T.K[c.idx]*1000).toFixed(1)} beta${(c.phys.beta*57.3).toFixed(1)}`); }
      if (process_TR && !isNaN(+process_TR) && f % 15 === 0) { const c = grid[+process_TR]; const d = c.ai.__dbg || {}; const ah = sim.cars.filter(o => o !== c && o.progress > c.progress && o.progress - c.progress < 40).sort((a, b) => a.progress - b.progress).slice(0, 3); TR.push(`${t.toFixed(2)} u${(c.phys.u*3.6).toFixed(0)} s${c.s.toFixed(1)} line${sim.line[c.idx].toFixed(1)} thr${(c.ctl.throttle||0).toFixed(2)} brk${(c.ctl.brake||0).toFixed(2)} vt0 ${((d.vt0||0)*3.6).toFixed(0)} slowTo ${isFinite(d.slowTo) ? (d.slowTo*3.6).toFixed(0) : '-'} sq${d.sq?1:0} K${(sim.T.K[c.idx]*1000).toFixed(1)} goBy${c.ai.goBy && sim.raceTime < c.ai.goBy.until ? c.ai.goBy.side : 0} | ` + ah.map(o => `${o.name.slice(3,9)} +${(o.progress - c.progress).toFixed(1)}m s${o.s.toFixed(1)} u${(o.phys.u*3.6).toFixed(0)}`).join(', ')); }
      for (const c of grid) {
        const s = st.get(c), k = c.ctl || {}, pk = pole.ctl || {};
        // (off the throttle where the pole car, at the same point of the lap earlier, was flat: compare to the plan's speed)
        const plan = (c.lineV || sim.lineV)[c.idx] * (c.ai?.pace || 1);
        if (t > 0.3 && c.phys.u < plan - 3) { if ((k.brake || 0) > 0.05) s.brake += 1 / 60; else if ((k.throttle || 0) < 0.9) s.lift += 1 / 60;
          const d = c.ai?.__dbg; if (d && ((k.brake || 0) > 0.05 || (k.throttle || 0) < 0.9)) { const w = d.sq ? 'squeeze' : d.slowTo < d.vt0 - 0.5 ? 'follow' + (t < 4 ? 'A' : t < 8 ? 'B' : 'C') + ((k.brake || 0) > 0.05 ? 'brk' : '') : (d.offK ?? 1) < 0.98 ? 'offline' : d.vt0 < d.plan - 1 ? 'other-vt' : 'plan/ctl'; s.why[w] = (s.why[w] || 0) + 1 / 60; } }
        if (at.some(a => Math.abs(a - t) < 1e-6)) gain.get(c).push(c.progress - p0.get(c));
      }
    }
    const ref = gain.get(grid[0]);
    const order = [...sim.cars].sort((a, b) => b.progress - a.progress);
    const tot = at.map((_, j) => grid.reduce((a, c) => a + gain.get(c)[j], 0) / grid.length);
    const sum = `pole ${ref.map((g, j) => at[j] + 's ' + g.toFixed(0)).join(' ')}  field mean gain ${at.map((a, j) => a + 's ' + tot[j].toFixed(0)).join(' ')}  follow-limited ${(grid.reduce((a, c) => a + Object.entries(st.get(c).why).filter(([k]) => k.startsWith('follow')).reduce((x, [, v]) => x + v, 0), 0) / grid.length).toFixed(1)}s/car  contacts ${hits}`;
    if (process_TR) return TR.join('\n') + '\n' + sum;
    if (process_Q) return sum;
    return sum + '\n' + grid.map((c, i) => `P${String(i + 1).padStart(2)} ${(c.isPlayer ? 'YOU' : c.name).padEnd(12)} ` + gain.get(c).map((g, j) => `${at[j]}s ${(g - ref[j]).toFixed(0).padStart(4)}m`).join(' ') + `  lift ${st.get(c).lift.toFixed(1)}s brake ${st.get(c).brake.toFixed(1)}s ${Object.entries(st.get(c).why).map(([k, v]) => k + ' ' + v.toFixed(1)).join(' ')}  now P${order.indexOf(c) + 1}`).join('\n');
  }, [secs, JSON.parse(process.env.EXTRA || '{}'), !!process.env.Q, process.env.TR]);
  console.log(out);
} finally { await b.close(); server.kill(); }
