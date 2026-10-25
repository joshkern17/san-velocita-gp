// dev: an AI scorecard over many seeded races, for judging an AI change when one race's handful of contacts and passes
// is noise. Each variant (race options) gets its own browser context, so what the AI learns and the field's balance are
// worked out once per variant and reused for every seed after (localStorage); each seed is the same race every time
// (seeded as aiseed.mjs, re-seeded as the build starts and the field's drawn). Everyone on the AI (you too, from the back).
//   node .devtest/aibatch.mjs <car> <seeds, e.g. 1-8> [laps]     TRK=/tracks/real/roadatlanta.json  DIFF=alien
//   VARIANTS='[{"calm":false},{}]'   (default: one variant, EXTRA or {}; aiMistakes off unless a variant says otherwise)
// → per variant: totals over the seeds of off-track seconds (AI, all four wheels off), contacts (car to car, > 18 km/h
// closing, until the winner finishes), wall hits, wrecks, passes done / tried (racecraft.js plans, every lap), and the
// mean winner's time and the field's best clean lap (and the 6th best: the middle); per seed on one line with ROWS=1. Run it through .devtest/guard.sh (one browser at a time).
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'f40', [s0, s1] = (process.argv[3] || '1-6').split('-').map(Number), laps = +(process.argv[4] || 2);
const VARS = process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : [JSON.parse(process.env.EXTRA || '{}')];
const rng = (seed) => `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;

async function race(ctx, seed, extra) {
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  const SEEDRNG = rng(seed);
  await pg.evaluate(async ([id, laps, diff, extra, SEEDRNG, trk]) => {
    const t = await (await fetch(trk)).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade'; S.difficulty = diff; S.grid = 'back';
    (0, eval)(SEEDRNG);
    const R = (await import('/js/race.js')).Race;
    if (!R.prototype.__seedHook) { for (const k of ['prepare', 'finish']) { const f = R.prototype[k]; R.prototype[k] = function (...a) { (0, eval)(SEEDRNG); return f.apply(this, a); }; } R.prototype.__seedHook = 1; }
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 11, aiChassis: 'class', car: S.car, extra: { aiMistakes: 'off', ...extra } }, 'menu');
  }, [id, laps, process.env.DIFF || 'alien', extra, SEEDRNG, process.env.TRK || '/.devtest/auburn2.json']);
  // (the race itself, not the menu's backdrop race - with the plans cached that one's there first - taken over in the
  // same tick it's found, before the page's own loop can move on)
  const r = await pg.evaluate(async ([SEEDRNG, TRS, TW, OWS]) => {
    const OW = !!OWS; // (OFFWHY=1: each car's last 1.6 s before every off, every 0.2 s, filtered to OFFWHY=from-to m when given)
    const ok = () => { const x = window.__svgp.sim; return x && x.mode === 'race' && x.player && x.cars && x.cars.length > 1 && x.lineV; };
    for (let k = 0; k < 1800 && !ok(); k++) await new Promise(r => setTimeout(r, 100));
    if (!ok()) return { error: 'no race' };
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false;
    (0, eval)(SEEDRNG);
    for (const c of sim.cars) if (c.ai) { c.ai.pace = sim.diff.pace * (1 - Math.random() * sim.diff.spread); c.ai.bias = (Math.random() - 0.5) * 1.2; c.ai.react = 0.06 + Math.random() * 0.14; delete c.ai.aggr; delete c.ai.craft; }
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9; sim.passLog = []; sim.passDbg = (c) => c.ai.pass && c.ai.pass.pred != null ? +c.ai.pass.pred.toFixed(1) : undefined;
    const T = sim.T, st = { off: 0, contacts: 0, walls: 0 }, om = {}, ow = [];
    let win = 0;
    // (WLOG=1: each wreck, with the contacts it had in the 3 s before: who, how fast, what each was doing)
    const st8 = (c) => { const P = c.ai && c.ai.pass; return P ? `${P.stage}${P.own ? '!' : ''}:${P.kind}>${P.o.name}` : c.ai?.dMove ? 'defend' : 'line'; }, recent = [], wl = [];
    const fc = sim.rc.contact.bind(sim.rc); sim.rc.contact = (a, b2, ia, ib, v) => { if (!win) st.contacts++; recent.push({ t: sim.raceTime, a: a.name, b: b2.name, v: +(+v).toFixed(1), sa: st8(a), sb: st8(b2), ga: +(b2.progress - a.progress).toFixed(1), ds: +(b2.s - a.s).toFixed(1), lap: a.lap, m: Math.round(a.progress % T.L), u: +(a.phys.u * 3.6).toFixed(0) }); return fc(a, b2, ia, ib, v); };
    const wseen = new Set(), tr = [], TR = TRS ? { n: TRS.split(','), a: +TW.split('-')[0], b: +TW.split('-')[1] } : null;
    const fb = sim.breakCheck.bind(sim); sim.breakCheck = (car, v, part, lx, ly, lim) => { if (!win && v > 10 && lim >= 25 && !(sim.raceTime - (car._wT ?? -9) < 1)) { car._wT = sim.raceTime; st.walls++; } return fb(car, v, part, lx, ly, lim); };
    for (let f = 0; sim.state === 'racing' && f < 60 * 60 * 12; f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (!win && sim.cars.some(c => c.finished)) win = sim.raceTime;
      if (win) break;
      // (TRACE='A. NAME,B. NAME' TW=from-to: those cars every 0.1 s in that window: speed, pedals, steer, the car ahead)
      if (TR && sim.raceTime >= TR.a && sim.raceTime <= TR.b && f % 6 === 0) for (const c of sim.cars) if (TR.n.includes(c.name)) {
        const P = c.ai.pass, ah = sim.cars.filter(x => x !== c && x.progress > c.progress && x.progress - c.progress < 25 && Math.abs(x.s - c.s) < 2.4).sort((x, y) => x.progress - y.progress)[0];
        tr.push(`${sim.raceTime.toFixed(1)} ${c.name.padEnd(13)} idx${c.idx} u${c.phys.u.toFixed(1)} acc${(c.acc || 0).toFixed(1)} thr${c.ctl.throttle.toFixed(2)} brk${c.ctl.brake.toFixed(2)} st${c.ctl.steer.toFixed(2)} s${c.s.toFixed(1)} line${sim.line[c.idx].toFixed(1)} plan${((c.lineV || sim.lineV)[c.idx] * c.ai.pace).toFixed(1)} ${P ? P.stage + '>' + P.o.name + ' tb' + (P.tb || 0).toFixed(1) : '-'} ahead:${ah ? ah.name + ' g' + (ah.progress - c.progress).toFixed(1) + ' ds' + (ah.s - c.s).toFixed(1) + ' u' + ah.phys.u.toFixed(1) : '-'}`);
      }
      for (const c of sim.cars) if (c.wreck && !wseen.has(c)) { wseen.add(c); wl.push({ t: +sim.raceTime.toFixed(1), car: c.name, lap: c.lap, at: Math.round(c.progress % T.L), hits: recent.filter(e => sim.raceTime - e.t < 3 && (e.a === c.name || e.b === c.name)).map(e => ({ ...e, t: +e.t.toFixed(1) })) }); }
      if (OW && f % 12 === 0) for (const c of sim.cars) if (c.ai) { const p = c.phys; (c._why ||= []).push(`${(c.progress % T.L).toFixed(0)}m u${(p.u * 3.6).toFixed(0)} thr${c.ctl.throttle.toFixed(2)} st${c.ctl.steer.toFixed(2)} gF${(p.gripF ?? 0).toFixed(2)} gR${(p.gripR ?? 0).toFixed(2)} sl${(p.slipR ?? 0).toFixed(2)} s${c.s.toFixed(1)} line${sim.line[c.idx].toFixed(1)} ${st8(c)}`); if (c._why.length > 8) c._why.shift(); }
      for (const c of sim.cars) if (!c.isPlayer && !c.gone && !c.pitting && !c.wreck && c.lap >= 1 && Math.abs(c.s) > T.W[c.idx] / 2 + 0.95) { st.off += 1 / 60; if (!c._offOn) { c._offOn = 1; if (OW && (c._why || []).length && (OWS === '1' || ((m) => m >= +OWS.split('-')[0] && m <= +OWS.split('-')[1])(c.progress % T.L))) ow.push({ car: c.name, m: Math.round(c.progress % T.L), lap: c.lap, st: st8(c), h: c._why.slice() }); const k = `${Math.floor((c.progress % T.L) / 50) * 50}|${st8(c).split(':')[0].replace('!', '')}|line ${sim.line[c.idx].toFixed(1)}/${(T.W[c.idx] / 2).toFixed(1)}`; om[k] = (om[k] || 0) + 1; } } else if (c._offOn && Math.abs(c.s) < T.W[c.idx] / 2) c._offOn = 0;
    }
    const L = sim.passLog, br = {}, cur = {};
    // (BREAK=1: each try, by kind, and what came of it: the next event of that plan and how the plan ended)
    for (const e of L) {
      const k = e.a; if (e.ev === 'try') (cur[k] ||= []).push((e.lap <= 1 ? 'L1 ' : '') + e.kind);
      else if (cur[k]?.length) { const nx = cur[k].nx ||= []; while (nx.length < cur[k].length) nx.push(e.ev); }
      if (e.ev === 'lunge' && e.kind === 'brake' && e.dB != null) (cur[k].pr ||= []).push([e.dB, e.g, e.dv]);
      if (['done', 'abort', 'drop', 'gaveup'].includes(e.ev)) { for (const [pr, g0, dv] of cur[k]?.pr || []) (br.pred ||= []).push([pr, g0, e.ev, dv]); for (const [i, kd] of (cur[k] || []).entries()) { const key = `${kd}>${cur[k].nx?.[i] || e.ev}>${e.ev}`; br[key] = (br[key] || 0) + 1; } delete cur[k]; }
    }
    return { om, ow, cl: recent.filter(e => !win || e.t < win).map(e => ({ ...e, t: +e.t.toFixed(1), at: undefined })), tr, wl, br, off: +st.off.toFixed(1), contacts: st.contacts, walls: st.walls, wrecks: sim.cars.filter(c => c.wreck).length, passes: L.filter(e => e.ev === 'done').length, tries: L.filter(e => e.ev === 'try').length, win: +win.toFixed(1), lineT: sim.lineCheckT ? sim.lineCheckT.map(t => +t.toFixed(2)).join('/') : undefined, best: +Math.min(...sim.cars.filter(c => !c.isPlayer).map(c => c.best)).toFixed(2), bestMed: +sim.cars.filter(c => !c.isPlayer && isFinite(c.best)).map(c => c.best).sort((x, y) => x - y)[5].toFixed(2) };
  }, [SEEDRNG, process.env.TRACE || '', process.env.TW || '0-0', process.env.OFFWHY || '']);
  await pg.close();
  return r;
}

try {
  for (const v of VARS) {
    const ctx = await b.newContext(), rows = [], t0 = Date.now();
    for (let s = s0; s <= s1; s++) { const r = await race(ctx, s, v); if (r.error) { console.log(`  seed ${s}: ${r.error}`); continue; } rows.push(r); if (process.env.ROWS) { const { br, wl, tr, cl, om, ow, ...x } = r; for (const l of tr) console.log('    ' + l); console.log(`  seed ${s} ${JSON.stringify(x)}`); if (process.env.WLOG) for (const w of wl) console.log('    WRECK', JSON.stringify(w)); if (process.env.OFFWHY) if (process.env.OFFLAPS) console.log(`    offs by lap: ${JSON.stringify(r.ow.reduce((a, w) => (a[w.lap] = (a[w.lap] || 0) + 1, a), {}))}`); else for (const w of r.ow.slice(0, 6)) { console.log(`    OFF ${w.car} lap ${w.lap} at ${w.m} m (${w.st})`); for (const h of w.h) console.log('      ' + h); } if (process.env.CLOG) for (const c of r.cl) console.log('    HIT', JSON.stringify(c)); }; }
    await ctx.close();
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    if (process.env.PRED) { const P = rows.flatMap(r => r.br.pred || []), bins = {}; for (const [pr, g0, ev, dv] of P) { const b = `gap ${Math.floor(g0)} closing ${dv < 1 ? '<1' : dv < 3 ? '1-3' : '3+'}`; (bins[b] ||= { done: 0, n: 0 }); bins[b].n++; if (ev === 'done') bins[b].done++; } for (const b of Object.keys(bins).sort()) console.log(`    lunge ${b}: ${bins[b].done}/${bins[b].n} done`); }
    if (process.env.BREAK) { const B = {}; for (const r of rows) for (const [k, n] of Object.entries(r.br)) if (k !== 'pred') B[k] = (B[k] || 0) + n; for (const [k, n] of Object.entries(B).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${k}`); }
    // (OFFMAP=1: where each run with all four wheels off started, 50 m bins along the lap | what the car was doing then | the line's offset / half width there)
    if (process.env.OFFMAP) { const O = {}; for (const r of rows) for (const [k, n] of Object.entries(r.om)) { const b = k.split('|'); const kk = `${b[0]} m ${b[1]}`; (O[kk] ||= { n: 0, l: b[2] }); O[kk].n += n; } for (const [k, o] of Object.entries(O).sort((a, b) => b[1].n - a[1].n).slice(0, 12)) console.log(`    ${String(o.n).padStart(3)} offs  ${k}  (${o.l})`); const on = Object.entries(O).filter(([k]) => k.endsWith(' line')).reduce((a, [, o]) => a + o.n, 0), all = Object.values(O).reduce((a, o) => a + o.n, 0); console.log(`    offs started on its own line ${on}, racing someone ${all - on}`); }
    console.log(`${id} ${JSON.stringify(v)} seeds ${s0}-${s1} x${laps} laps: off ${sum('off').toFixed(1)} s · contacts ${sum('contacts')} · walls ${sum('walls')} · wrecks ${sum('wrecks')} · passes ${sum('passes')} / tries ${sum('tries')} · win ${(sum('win') / rows.length).toFixed(1)} s · AI best lap ${(sum('best') / rows.length).toFixed(2)} / 6th best ${(sum('bestMed') / rows.length).toFixed(2)} s  (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
} finally { await b.close(); server.kill(); }
