// dev: how the AI starts a race. Seeded standing starts (aibatch's seeding: same seed = same start), 12 cars, you on
// the AI from the back; the first SECS (default 25) of each. Per start, over the field:
//   loss   metres each car covers less than its model does alone from pole (from its own grid spot), mean
//   held   seconds a car ahead held it under the speed it wanted (race.js follow: slowTo under its target), mean
//   wide   seconds with a car alongside (overlapping, 1.8-4.2 m to the side), summed
//   gain   places the back half of the grid made up (a human there is the comparison: the user went last -> 2nd)
//   hits   car-to-car contacts (> 18 km/h closing)
//   node .devtest/startbench.mjs <car> <seeds, e.g. 1-6>    TRK=/tracks/real/willow.json  SECS=25  VARIANTS='[{},{...}]'
// ROWS=1: each seed's line; CARS=1: each car's (grid -> place, loss, held, what held it longest)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const LIMIT = +(process.env.LIMIT || 900);
let b = null; setTimeout(async () => { console.log(`GAVE UP after ${LIMIT}s`); try { await b?.close(); } catch {} server.kill(); process.exit(2); }, LIMIT * 1000).unref();
b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', [s0, s1] = (process.argv[3] || '1-4').split('-').map(Number);
const SECS = +(process.env.SECS || 25), TRK = process.env.TRK || '/tracks/real/willow.json';
const VARS = process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : [JSON.parse(process.env.EXTRA || '{}')];
const rng = (seed) => `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;

async function start(ctx, seed, extra, opp, car = id) {
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  if (process.env.TA && opp) { await pg.addInitScript((w) => { window.__TA = w.split('-'); }, process.env.TA); pg.on('console', m => { if (m.text().startsWith('t')) console.log('   ' + m.text()); }); }
  if (process.env.TB && opp) { await pg.addInitScript(() => { window.__TB = 1; }); pg.on('console', m => { if (m.text().startsWith('t')) console.log('   ' + m.text()); }); }
  if (process.env.SLT && opp) { await pg.addInitScript(() => { window.__SLT = 1; }); pg.on('console', m => { if (m.text().startsWith('t')) console.log('   ' + m.text()); }); }
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  const SEEDRNG = rng(seed);
  await pg.evaluate(async ([id, extra, SEEDRNG, trk, opp]) => {
    const t = await (await fetch(trk)).json(); t.env = { ...(t.env || {}), weather: 'clear' };
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade'; S.difficulty = 'alien'; S.grid = 'back';
    (0, eval)(SEEDRNG);
    const R = (await import('/js/race.js')).Race;
    if (!R.prototype.__seedHook) { for (const k of ['prepare', 'finish']) { const f = R.prototype[k]; R.prototype[k] = function (...a) { (0, eval)(SEEDRNG); return f.apply(this, a); }; } R.prototype.__seedHook = 1; }
    window.__svgp.startRace(t, { mode: 'race', laps: 2, opponents: opp, aiChassis: 'class', grid: 'back', car: S.car, extra: { aiMistakes: 'off', ...extra } }, 'menu');
  }, [car, extra, SEEDRNG, TRK, opp]);
  const r = await pg.evaluate(async ([SEEDRNG, SECS]) => {
    const ok = () => { const x = window.__svgp.sim; return x && x.mode === 'race' && x.player && x.cars && x.cars.length > 0 && x.lineV; };
    for (let k = 0; k < 1800 && !ok(); k++) await new Promise(r => setTimeout(r, 100));
    if (!ok()) return { error: 'no race' };
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false;
    (0, eval)(SEEDRNG);
    for (const c of sim.cars) if (c.ai) { c.ai.pace = sim.diff.pace * (1 - Math.random() * sim.diff.spread); c.ai.bias = (Math.random() - 0.5) * 1.2; c.ai.react = 0.06 + Math.random() * 0.14; delete c.ai.aggr; delete c.ai.craft; }
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; sim.player.autoT = 1e9;
    let hits = 0; const fc = sim.rc.contact.bind(sim.rc); sim.rc.contact = (a, b2, ia, ib, v) => { if (v > 5) hits++; return fc(a, b2, ia, ib, v); };
    // (held: the follow rule's speed under what it wanted; who: the nearest car ahead in its lane then)
    const dbg = new Map(); sim.aiDbg = (car, d) => dbg.set(car, d);
    for (const c of sim.cars) { c._held = 0; c._wide = 0; c._by = {}; c._g = c.startPos; c._p0 = c.progress; }
    for (let f = 0; f < SECS * 60; f++) {
      dbg.clear(); sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (window.__SLT && f % 60 === 0) console.log(`t${f / 60} ` + sim.cars.slice().sort((x, y) => y.progress - x.progress).map(c => `${c.startPos}:${(c.progress - c._p0).toFixed(0)}@${c.s.toFixed(1)}${c.ai && c.ai.sl != null ? '>' + c.ai.sl.toFixed(1) : ''}${c.ai && c.ai.pass ? '[' + c.ai.pass.stage + ']' : ''}`).join(' '));
      if (window.__TA && f % 6 === 0 && f / 60 >= +window.__TA[0] && f / 60 <= +window.__TA[1]) console.log(`t${(f / 60).toFixed(1)} ` + sim.cars.slice().sort((x, y) => y.progress - x.progress).map(c => { const d = dbg.get(c), pl = (c.lineV || sim.lineV)[c.idx] * (c.ai ? c.ai.pace : 1); return `P${c.startPos}:u${(c.phys.u * 3.6).toFixed(0)}/p${(pl * 3.6).toFixed(0)}${c.ctl.brake > 0.05 ? 'B' + c.ctl.brake.toFixed(1) : ''}${d && isFinite(d.slowTo) && d.slowTo <= d.vt + 0.01 ? 'F' + (d.slowTo * 3.6).toFixed(0) : ''}${c.ai && c.ai.pass ? '[' + c.ai.pass.stage + ']' : ''}s${c.s.toFixed(1)}`; }).join(' '));
      if (window.__TB && f % 12 === 0) { const c = sim.player, d = dbg.get(c), pl = (c.lineV || sim.lineV)[c.idx] * c.ai.pace, ah = sim.cars.filter(x => x !== c && x.progress > c.progress && x.progress - c.progress < 30).sort((x, y) => x.progress - y.progress)[0]; const dd = c.progress - c._p0; if (dd > 100 && dd < 750) console.log(`t${(f / 60).toFixed(1)} d${dd.toFixed(0)} u${(c.phys.u * 3.6).toFixed(0)} plan${(pl * 3.6).toFixed(0)} vt${d ? (d.vt * 3.6).toFixed(0) : '-'} slowTo${d && isFinite(d.slowTo) ? (d.slowTo * 3.6).toFixed(0) : '-'} thr${c.ctl.throttle.toFixed(2)} brk${c.ctl.brake.toFixed(2)} wake${(c.phys.wake || 0).toFixed(2)} s${c.s.toFixed(1)} ${c.ai.pass ? c.ai.pass.stage : ''} ahead:${ah ? `g${(ah.progress - c.progress).toFixed(1)} ds${(ah.s - c.s).toFixed(1)} u${(ah.phys.u * 3.6).toFixed(0)}` : '-'}`); }
      for (const c of sim.cars) { const k = Math.floor((c.progress - c._p0) / 50); if (k >= 0) { (c._tb ||= {})[k] = (c._tb[k] || 0) + 1 / 60; } }
      for (const c of sim.cars) {
        const d = dbg.get(c);
        if (d && d.slowTo <= d.vt + 0.01 && d.slowTo < c.phys.u + 3 && c.phys.u > 3) { // (the follow rule setting the speed (vt is already capped by it), at about what it's doing)
          c._held += 1 / 60;
          const ah = sim.cars.filter(x => x !== c && x.progress > c.progress && x.progress - c.progress < 40).sort((x, y) => (Math.abs(x.s - c.s) - Math.abs(y.s - c.s)))[0];
          if (ah) c._by[ah.name] = (c._by[ah.name] || 0) + 1 / 60;
        }
        if (sim.cars.some(x => x !== c && Math.abs(x.progress - c.progress) < 5 && Math.abs(x.s - c.s) > 1.8 && Math.abs(x.s - c.s) < 4.2)) c._wide += 1 / 60;
      }
    }
    return { hits, N: sim.cars.length, cars: sim.cars.map(c => ({ n: c.isPlayer ? 'YOU(ai)' : c.name, id: c.carId, grid: c._g, pos: c.pos, d: +(c.progress - c._p0).toFixed(1), held: +c._held.toFixed(2), wide: +c._wide.toFixed(2), by: Object.entries(c._by).sort((a, b) => b[1] - a[1])[0]?.[0] || '', tb: c._tb || {} })) };
  }, [SEEDRNG, SECS]);
  await pg.close();
  return r;
}

try {
  for (const v of VARS) {
    const ctx = await b.newContext(), t0 = Date.now(), solo = {}, rows = [];
    for (let s = s0; s <= s1; s++) {
      const r = await start(ctx, s, v, 11); if (r.error) { console.log(`  seed ${s}: ${r.error}`); continue; }
      // (each model alone from pole, once per variant: where the field's cars would be with nobody in the way)
      for (const m of new Set(r.cars.map(c => c.id))) if (solo[m] == null) { const a = await start(ctx, s, v, 0, m); solo[m] = a.cars ? a.cars[0].d : NaN; }
      if (process.env.BINS) { const sr = await start(ctx, s, v, 0, r.cars.find(c => c.n === 'YOU(ai)').id), so = sr.cars[0].tb, me = r.cars.find(c => c.n === 'YOU(ai)').tb; const ks = Object.keys(so).map(Number).sort((a, b) => a - b); console.log('   bins (50 m: back car s - alone s): ' + ks.map(k => `${k * 50}:${((me[k] ?? 0) - so[k]).toFixed(2)}`).join(' ')); const fr = r.cars.find(c => c.grid === 1); console.log('   pole car vs alone:                ' + ks.map(k => `${k * 50}:${((fr.tb[k] ?? 0) - so[k]).toFixed(2)}`).join(' ')); }
      rows.push({ s, r });
    }
    for (const { s, r } of rows) {
      const back = r.cars.filter(c => c.grid > r.N / 2);
      for (const c of r.cars) c.loss = +(solo[c.id] - c.d).toFixed(1);
      const m = (k) => r.cars.reduce((a, c) => a + c[k], 0) / r.cars.length;
      r.sum = { loss: m('loss'), held: m('held'), wide: r.cars.reduce((a, c) => a + c.wide, 0), gain: back.reduce((a, c) => a + (c.grid - c.pos), 0), hits: r.hits };
      if (process.env.ROWS || process.env.CARS) console.log(`  seed ${s}: loss ${r.sum.loss.toFixed(1)} m · held ${r.sum.held.toFixed(2)} s · wide ${r.sum.wide.toFixed(1)} s · back half gained ${r.sum.gain} · hits ${r.hits}`);
      if (process.env.CARS) for (const c of r.cars.sort((a, b) => a.grid - b.grid)) console.log(`     P${String(c.grid).padStart(2)}->P${String(c.pos).padStart(2)} ${c.n.padEnd(14)} ${c.id.padEnd(11)} loss ${String(c.loss).padStart(6)} m  held ${c.held.toFixed(2)} s  wide ${c.wide.toFixed(1)} s  ${c.by ? 'held by ' + c.by : ''}`);
    }
    const A = (k) => rows.reduce((a, x) => a + x.r.sum[k], 0) / rows.length;
    console.log(`${id} ${JSON.stringify(v)} ${TRK.split('/').pop()} seeds ${s0}-${s1}, ${SECS} s: loss ${A('loss').toFixed(1)} m/car · held ${A('held').toFixed(2)} s/car · wide ${A('wide').toFixed(1)} s · back half gained ${A('gain').toFixed(1)} places · hits ${A('hits').toFixed(1)}  (solo ${JSON.stringify(solo)}, ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
} finally { await b.close(); server.kill(); }
