// dev: a multiclass race (your GT2 car, half the AI field in GT1), every car driven by the AI: the classes ranked by
// pace, the quicker class coming through the slower one's traffic (overtakes, blue flags, contacts between classes),
// everyone finishing on the overall leader's flag, results with places in class.
//   node .devtest/multiclass.mjs [laps=6] [track preset=Maple Ridge GP] [your car=m3gtr] [other class=gt1]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const LAPS = +(process.argv[2] || 6), NAME = process.argv[3] || 'Maple Ridge GP', CAR = process.argv[4] || 'm3gtr', OTHER = process.argv[5] || 'gt1';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([LAPS, NAME, CAR, OTHER]) => {
    const t = (await import('/js/track.js')).presetTracks().find(t => t.name === NAME); t.env.weather = 'clear';
    window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: CAR }; window.__svgp.startRace(t, { mode: 'race', laps: LAPS, opponents: 11, grid: 'back', car: window.__svgp.settings.car, extra: { car: window.__svgp.settings.car, mixCls: { cls: OTHER }, strategy: false } }, 'menu');
  }, [LAPS, NAME, CAR, OTHER]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV && window.__svgp.sim.player && window.__svgp.sim.mode === "race", null, { timeout: 180000 });
  const r = await pg.evaluate(() => {
    const sim = window.__svgp.sim, pl = sim.player;
    sim.state = 'racing'; sim.stateT = 0; sim.goAt = 0; pl.autoT = 1e9;
    const passes = { through: 0, same: 0 }, blues = { cls: 0, lap: 0 }, wasBlue = new Map();
    let cross = 0, contacts = 0; const prev = new Map();
    const hits = [];
    if (sim.rc) { const f = sim.rc.contact.bind(sim.rc); sim.rc.contact = (a, b, ia, ib, v, ...x) => { contacts++; if (a.cls !== b.cls) { cross++; const P = ['F', 'R', 'S']; hits.push(`${a.cls}${P[ia]}>${b.cls}${P[ib]} ${v.toFixed(1)}m/s ${(a.phys.speed * 3.6).toFixed(0)}/${(b.phys.speed * 3.6).toFixed(0)}kmh K${(Math.abs(sim.T.K[a.idx]) * 1000).toFixed(1)} blue:${b.blue === a ? 'b' : a.blue === b ? 'a' : '-'}`); } return f(a, b, ia, ib, v, ...x); }; }
    for (let f = 0; f < 60 * 1500 && !(sim.state === 'finished' && sim.cars.every(c => c.finished || c.gone)); f++) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      if (f % 15) continue;
      // overtakes: a car's running order improving past another car (by class pair)
      const ord = sim.order.map(c => c);
      for (let k = 0; k < ord.length; k++) { const c = ord[k], p = prev.get(c); if (p != null && k < p) for (const o of ord.slice(k + 1, p + 1)) { if (o.cls !== c.cls && sim.clsRank[c.cls] < sim.clsRank[o.cls]) passes.through++; else if (o.cls === c.cls) passes.same++; } }
      ord.forEach((c, k) => prev.set(c, k));
      for (const c of sim.cars) { const now = c.blue ? (c.blueCls ? 'cls' : 'lap') : null; if (now && wasBlue.get(c) !== now) blues[now]++; wasBlue.set(c, now); }
    }
    const res = sim.results();
    const bests = {}; for (const c of sim.cars) (bests[c.cls] ||= []).push(c.best);
    const lims = {}; for (const c of sim.cars) lims[c.cls] = Math.min(lims[c.cls] ?? Infinity, c.lineV.reduce((a, v) => a + sim.T.ds / Math.max(1, v), 0));
    return { hits, bests: Object.fromEntries(Object.entries(bests).map(([k, v]) => [k, v.sort((a, b) => a - b).map(x => x.toFixed(1)).join(' ')])), lims, rank: sim.clsRank, multi: sim.multi, n: sim.cars.reduce((a, c) => (a[c.cls] = (a[c.cls] || 0) + 1, a), {}), passes, blues, cross, contacts, laps: sim.laps, t: sim.raceTime,
      res: res.map(x => ({ pos: x.pos, cls: x.cls, clsPos: x.clsPos, name: x.name, lap: x.lap - 1, fin: x.finished, gap: x.gap, me: x.isPlayer })), hud: sim.hudState() };
  });
  console.log('best laps', JSON.stringify(r.bests), '· limit laps', JSON.stringify(r.lims));
  if (process.env.HITS) console.log(r.hits.join('\n'));
  console.log('classes', JSON.stringify(r.n), 'rank', JSON.stringify(r.rank), `· ${(r.t / 60).toFixed(1)} min`);
  console.log(`overtakes: ${r.passes.through} through a slower class, ${r.passes.same} within a class · blue flags: ${r.blues.cls} class traffic, ${r.blues.lap} lapping · contacts ${r.contacts} (${r.cross} between classes)`);
  for (const x of r.res) console.log(`  P${String(x.pos).padStart(2)} ${x.cls.padEnd(4)} ${String(x.clsPos).padStart(2)} ${x.name.padEnd(14)} laps ${x.lap} ${x.fin ? '' : 'running'} ${x.gap}${x.me ? '  <- you' : ''}`);
  console.log('hud:', JSON.stringify({ pos: r.hud.pos, cls: r.hud.cls, clsPos: r.hud.clsPos, clsN: r.hud.clsN, tower: r.hud.standings.filter(x => x.mine).length }));
  ok(r.multi && r.rank[r.res.find(x => x.me).cls] === 1, 'two classes; yours (GT2) ranked the slower');
  ok(r.passes.through >= 3, `the quicker class came through the traffic (${r.passes.through} overtakes)`);
  ok(r.blues.cls >= 3, `blue flags for the class traffic (${r.blues.cls})`);
  ok(r.res.every(x => x.fin || x.gap === 'DNF'), 'everyone took the flag');
  const g2 = r.res.filter(x => x.cls === 'gt2'), g1 = r.res.filter(x => x.cls === 'gt1');
  ok(g2.every((x, k) => x.clsPos === k + 1) && g1.every((x, k) => x.clsPos === k + 1), 'places in class count up within each class');
  ok(r.res[0].cls === 'gt1', `the overall winner is GT1 (${r.res[0].name})`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
