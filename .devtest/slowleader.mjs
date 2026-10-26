// dev: a damaged leader at the front of a pack: does the field get by it? (Mount Panorama, Street Cup, 2026-10-26:
// Krol, leading, hit the walls, slowed, and held up everyone behind for laps; nobody went round.) Seeded races, every car
// on the AI; on lap 2 the leader slows to SLOW of its pace (default 0.94: Krol's lap 5), or is damaged (DMG={"ch":0.6,...}), and from then on
// every pass of it is counted, and each car behind it within 25 m logged each second: the train.
//   .devtest/guard.sh -m 7000 -t 600 node .devtest/slowleader.mjs <car> <seeds 1-3> [laps]   TRK=/.devtest/out/panorama.json DIFF=godlike
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'nsx', [s0, s1] = (process.argv[3] || '1-2').split('-').map(Number), laps = +(process.argv[4] || 4);
const DMG = process.env.DMG ? JSON.parse(process.env.DMG) : null, SLOW = +(process.env.SLOW || 0.94), EXTRA = JSON.parse(process.env.EXTRA || '{}');
const rng = (seed) => `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;
async function race(ctx, seed) {
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  const SEEDRNG = rng(seed);
  await pg.evaluate(async ([id, laps, diff, SEEDRNG, trk, extra]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade'; S.difficulty = diff; S.grid = 'back';
    (0, eval)(SEEDRNG);
    const R = (await import('/js/race.js')).Race;
    if (!R.prototype.__seedHook) { for (const k of ['prepare', 'finish']) { const f = R.prototype[k]; R.prototype[k] = function (...a) { (0, eval)(SEEDRNG); return f.apply(this, a); }; } R.prototype.__seedHook = 1; }
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 11, aiChassis: 'class', car: S.car, extra: { aiMistakes: 'off', ...extra } }, 'menu');
  }, [id, laps, process.env.DIFF || 'godlike', SEEDRNG, process.env.TRK || '/.devtest/out/panorama.json', EXTRA]);
  return await pg.evaluate(async ([SEEDRNG, DMG, SLOW]) => {
    const ok = () => { const x = window.__svgp.sim; return x && x.mode === 'race' && x.player && x.cars && x.cars.length > 1 && x.lineV; };
    for (let k = 0; k < 2400 && !ok(); k++) await new Promise(r => setTimeout(r, 100));
    if (!ok()) return { error: 'no race' };
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false;
    (0, eval)(SEEDRNG);
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9; sim.passLog = [];
    let hurt = null, hurtT = 0, behind0 = null; const train = [], passes = [], laps0 = [];
    let defT = 0;
    for (let f = 0; sim.state === 'racing' && f < 60 * 60 * 9; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (sim.cars.some(c => c.finished)) break;
      const order = sim.cars.filter(c => !c.gone).sort((a, b) => b.progress - a.progress);
      if (!hurt && order[0].lap >= 2) { hurt = order[0]; if (DMG) Object.assign(hurt.phys.dmg, DMG); else { const p0 = hurt.ai.pace; Object.defineProperty(hurt.ai, 'pace', { get: () => p0 * SLOW, set() {}, configurable: true }); } hurtT = sim.raceTime; behind0 = new Set(order.slice(1).map(c => c.name)); }
      if (hurt && hurt.ai.dMove) defT += 1 / 60;
      if (hurt && f % 60 === 0) {
        const near = sim.cars.filter(c => c !== hurt && !c.gone && !c.pitting && hurt.progress - c.progress > 0 && hurt.progress - c.progress < 25);
        train.push({ t: +(sim.raceTime - hurtT).toFixed(0), u: +(hurt.phys.u * 3.6).toFixed(0), n: near.length, pit: !!hurt.pitting });
      }
      // (a pass: ahead by under 500 m - a car crossing the line reads a lap up for a moment - and still ahead a second later)
      if (hurt) for (const c of sim.cars) { const g = c.progress - hurt.progress; c._aheadT = behind0.has(c.name) && !c.gone && g > 0 && g < 500 ? (c._aheadT || 0) + 1 / 60 : 0; }
      if (hurt) for (const c of sim.cars) if (c._aheadT >= 1 && !c._by) { c._by = 1; passes.push({ car: c.name, t: +(sim.raceTime - hurtT).toFixed(1), pit: !!hurt.pitting, dbg: `c ${c.progress.toFixed(0)} lap${c.lap} pit${!!c.pitting} | L ${hurt.progress.toFixed(0)} lap${hurt.lap} fin${!!hurt.finished} pl${!!hurt.isPlayer}` }); }
    }
    const L = (sim.passLog || []).filter(e => hurt && e.o === hurt.name || (e.b === hurt?.name));
    const ev = {}; for (const e of sim.passLog || []) if (hurt && (e.o === hurt.name || e.b === hurt.name || e.vs === hurt.name)) ev[e.ev] = (ev[e.ev] || 0) + 1;
    return { defT: +defT.toFixed(0), leader: hurt && hurt.name, laps: hurt && hurt.lapTimes.map(x => +x.toFixed(1)), pits: hurt && hurt.pits, passes, train, ev, sample: (sim.passLog || []).slice(0, 3) };
  }, [SEEDRNG, DMG, SLOW]);
}
try {
  const ctx = await b.newContext();
  for (let s = s0; s <= s1; s++) {
    const t0 = Date.now(), r = await race(ctx, s);
    if (r.error) { console.log(`seed ${s}: ${r.error}`); continue; }
    const tr = r.train, stuck = tr.filter(x => x.n >= 2 && !x.pit).length;
    console.log(`seed ${s}: leader ${r.leader} laps ${JSON.stringify(r.laps)} pits ${r.pits}; passed by ${r.passes.length} (${r.passes.slice(0, 6).map(p => `${p.car}@${p.t}s${p.pit ? ' in pits' : ''}`).join(', ')}); seconds with 2+ cars within 25 m behind it: ${stuck}/${tr.length}; it defended ${r.defT} s; plan events on it ${JSON.stringify(r.ev)} (${Math.round((Date.now() - t0) / 1000)} s)`);
    console.log('   first passes:', r.passes.slice(0, 3).map(p => p.dbg).join(' || '));
    console.log('   train:', tr.filter((x, i) => i % 5 === 0).map(x => `${x.t}s ${x.u}kmh n${x.n}${x.pit ? 'P' : ''}`).join(' | '));
  }
  await ctx.close();
} finally { await b.close(); server.kill(); }
