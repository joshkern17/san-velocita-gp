// dev: two identical AI cars, one just behind the other at racing speed, out of every corner at Auburn: does the one
// behind get past, how (racecraft.js's plan), and does it touch? Repeatable (seeded), no damage, no mistakes, no
// flags: racecraft alone. Each trial: 25 s from 20 m past a corner's exit, the attacker GAP m behind.
//   node .devtest/duel.mjs [car] [gap]     EXTRA='{"pass":"old"}' race options; AGG='0.4,0.9' attacker aggression;
//   DEF='0.3,0.8' defender aggression (over 0.45 defends); LEADPACE=0.9 the leader on 90% of the plan (brakes early,
//   like a careful player: rear-ends); LOG=1 each trial's plan events
// → per trial: passed?, contacts, off-road; totals
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'r34', GAP = +(process.argv[3] || 9);
const AGG = (process.env.AGG || '0.4,0.9').split(',').map(Number), DEF = (process.env.DEF || '0.3,0.8').split(',').map(Number);
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, extra]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'off'; S.rules = 'arcade'; S.difficulty = 'alien';
    window.__svgp.startRace(t, { mode: 'race', laps: 99, opponents: 2, aiChassis: 'same', car: S.car, extra }, 'menu');
  }, [id, JSON.parse(process.env.EXTRA || '{}')]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && window.__svgp.sim.lineV, null, { timeout: 180000 });
  let { out: r, rear } = await pg.evaluate(([GAP, AGG, DEF, LEADPACE]) => {
    const sim = window.__svgp.sim; sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    let a = 7 * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    sim.removeCar(sim.player);
    sim.state = 'racing'; sim.stateT = 0; sim.mistakeP = 0; sim.damageK = 0; sim.raceTime = 60;
    const T = sim.T, N = T.N, [A, D] = sim.cars.filter(c => c.ai);
    let contacts = 0, rear = 0; const fc = sim.rc.contact.bind(sim.rc); sim.rc.contact = (x, y, ia, ib, v) => { contacts++; const [bk, fr] = x.progress < y.progress ? [x, y] : [y, x]; if (fr.progress - bk.progress > 3.5 && Math.abs(fr.s - bk.s) < 1.6) rear++; return fc(x, y, ia, ib, v); };
    const put = (car, i, v) => {
      const p = car.phys, o = sim.line[i], j = (i + 3) % N, oj = sim.line[j];
      const x = T.X[i] + T.RX[i] * o, z = T.Z[i] + T.RZ[i] * o, hx = T.X[j] + T.RX[j] * oj - x, hz = T.Z[j] + T.RZ[j] * oj - z, hl = Math.hypot(hx, hz) || 1;
      p.place(x, z, Math.atan2(hx, hz)); p.vx = hx / hl * v; p.vz = hz / hl * v;
      const G = p.p.gears; let g = 1; while (g < G.length - 1 && v > G[g] * 0.92) g++; p.gear = g;
      car.idx = i; car.lap = 2; car.cpNext = 1; car.pitting = false; car.finished = false; car.wreck = null; car.gone = false;
      Object.assign(car.ai, { pass: null, passCd: 3, passT: 0, dMove: null, def: 0, pOff: 0, over: 0, err: null, errCd: 99, lane: false, started: true });
      sim.updateTracker(car, true);
    };
    const out = [], LOGS = [];
    for (const c of sim.corners.list) for (const ag of AGG) for (const df of DEF) {
      const i = (c.exit + Math.round(20 / T.ds)) % N, v = sim.lineV[i] * 0.97;
      sim.passLog = [];
      put(D, i, v); put(A, (i - Math.round(GAP / T.ds) + N) % N, v);
      A.ai.aggr = ag; D.ai.aggr = df; A.ai.craft = D.ai.craft = 0.7; A.ai.pace = 1; D.ai.pace = LEADPACE; // (LEADPACE < 1: a leader braking early, like a careful player)
      const c0 = contacts; let off = 0, wasOff = false, ahead = 0, offD = 0, minG = 99;
      for (let f = 0; f < 60 * 25; f++) {
        sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
        const o = !A.onRoad; if (o && !wasOff) off++; wasOff = o; if (!D.onRoad && f > 60) offD = 1;
        ahead = (((A.progress - D.progress) % T.L) + T.L * 1.5) % T.L - T.L / 2; if (f === 180) minG = -ahead;
      }
      const ev = sim.passLog.map(e => e.kind === "dbg" ? "[" + e.ev + "]" : `${e.ev}${e.ev === 'try' ? ':' + e.kind : ''}`).join(' ');
      out.push({ c: c.n, ag, df, void: minG > 25, offD, g3: +minG.toFixed(1), passed: ahead > 3, end: +ahead.toFixed(1), contacts: contacts - c0, off, ev });
    }
    return { out, rear };
  }, [GAP, AGG, DEF, +(process.env.LEADPACE || 1)]);
  for (const t of r) if (process.env.LOG) console.log(`T${t.c} att${t.ag} def${t.df} ${t.void ? 'void  ' : t.passed ? 'PASSED' : '      '}${t.offD ? ' Doff' : '     '} g3s${t.g3} end${t.end} hit${t.contacts} off${t.off}  ${t.ev}`);
  const V = r.filter(t => !t.void), n = V.length, P = V.filter(t => t.passed).length;
  const r0 = r; r = V; const _n = n, H = r.reduce((s, t) => s + t.contacts, 0), O = r.reduce((s, t) => s + t.off, 0);
  const tries = r.reduce((s, t) => s + (t.ev.match(/try/g) || []).length, 0);
  console.log(`${id} gap${GAP} ${process.env.EXTRA || ''}: passed ${P}/${n} (${r0.length - n} void), leader off ${V.filter(t => t.offD).length}, contacts ${H} (rear-ends ${rear}, all trials), offs ${O}, tries ${tries}`);
} finally { await b.close(); server.kill(); }
