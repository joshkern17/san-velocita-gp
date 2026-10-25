// dev: AI defending. An ordinary race, everyone on the AI: how often a defending car weaves (its defensive offset
// reverses within 1.5 s), fishtails, slides, and hits someone. DEF=old runs the previous defending for comparison.
//   node .devtest/defend.mjs [car] [laps]       (DEF=old)
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', laps = +(process.argv[3] || 2), mode = process.env.DEF || 'new';
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 320, height: 180 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, laps, mode, process_EXTRA]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.damage = 'high'; S.rules = 'arcade';
    window.__svgp.startRace(t, { mode: 'race', laps, opponents: 11, aiChassis: 'class', car: S.car, extra: { defend: mode, ...JSON.parse(process_EXTRA) } }, 'menu');
  }, [id, laps, mode, process.env.EXTRA || '{}']);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 1, null, { timeout: 90000 });
  const r = await pg.evaluate((process_env_LOG) => {
    const sim = window.__svgp.sim; if (!sim.opts.defend) throw new Error('defend option missing'); sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const D = (c) => Math.abs(c.ai?.def || 0) > 0.4;
    const st = { win: 0, defFrames: 0, frames: 0, reversals: 0, slides: 0, slidesDef: 0, contacts: 0, contactsDef: 0, wobbles: 0, wobblesDef: 0, walls: 0, wallsDef: 0 };
    const origC = sim.rc.contact.bind(sim.rc);
    const log = [];
    sim.rc.contact = (a, b2, ...x) => { st.contacts++; if (D(a) || D(b2)) st.contactsDef++;
      if (process_env_LOG && log.length < 40) { const [r, f] = a.progress < b2.progress ? [a, b2] : [b2, a]; const ph = (c) => c.ai ? (c.ai.dMove ? 'MOVE' : Math.abs(c.ai.def || 0) > 0.4 ? 'back' : '-') : 'P';
        log.push(`t${sim.raceTime.toFixed(1)} rear ${r.name}(${ph(r)} ${(r.phys.u*3.6).toFixed(0)}kph s${r.s.toFixed(1)} brk${(r.ctl?.brake||0).toFixed(1)}) -> front ${f.name}(${ph(f)} ${(f.phys.u*3.6).toFixed(0)}kph s${f.s.toFixed(1)} line${sim.line[f.idx].toFixed(1)} def${(f.ai?.def||0).toFixed(1)}) gap${(f.progress-r.progress).toFixed(1)} K${(sim.T.K[f.idx]*1000).toFixed(1)} vn${x[2]?.toFixed?.(1)}`); }
      return origC(a, b2, ...x); };
    const origB = sim.breakCheck.bind(sim);
    sim.breakCheck = (car, v, part, lx, ly, lim) => { if (v > 10 && lim >= 25) { st.walls++; if (D(car)) st.wallsDef++; } return origB(car, v, part, lx, ly, lim); };
    const mem = new Map();
    let f = 0; while (sim.state === 'racing' && f < 60 * 60 * 10) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0 }, {}); f++;
      if (!st.win && sim.cars.some(c => c.finished)) st.win = +sim.raceTime.toFixed(1);
      if (sim.raceTime < 12) continue;
      for (const c of sim.cars) {
        if (!c.ai || c.gone || c.pitting || c.wreck) continue;
        const m = mem.get(c) || { d: c.ai.def || 0, dir: 0, sl: false, rt: -9, bs: 0, bt: -9 }; mem.set(c, m);
        const d = c.ai.def || 0, v = (d - m.d) * 60; m.d = d;
        st.frames++; if (D(c)) st.defFrames++;
        if (Math.abs(v) > 0.4) { const s = Math.sign(v); if (m.dir && s !== m.dir) { if (sim.raceTime - m.rt < 1.5) st.reversals++; m.rt = sim.raceTime; } m.dir = s; }
        // fishtail: the body angle swinging from one side to the other (past 3°) inside a second
        const bb = c.phys.beta; if (Math.abs(bb) > 0.05 && c.phys.speed > 15) { const s = Math.sign(bb); if (m.bs && s !== m.bs && sim.raceTime - m.bt < 1) { st.wobbles++; if (D(c)) st.wobblesDef++; } m.bs = s; m.bt = sim.raceTime; }
        const sl = Math.abs(c.phys.beta) > 0.14 && c.phys.speed > 15;
        if (sl && !m.sl) { st.slides++; if (D(c) || Math.abs(v) > 0.4) { st.slidesDef++; if (process_env_LOG && log.length < 60) log.push(`SLIDE t${sim.raceTime.toFixed(1)} ${c.name} ${c.ai.dMove ? 'MOVE' : 'back'} b${(c.phys.beta*57.3).toFixed(0)}° ${(c.phys.u*3.6).toFixed(0)}kph K${(sim.T.K[c.idx]*1000).toFixed(1)} def${(c.ai.def||0).toFixed(1)} v${v.toFixed(1)} s${c.s.toFixed(1)} line${sim.line[c.idx].toFixed(1)} brk${(c.ctl?.brake||0).toFixed(1)} thr${(c.ctl?.throttle||0).toFixed(1)} craft${(c.ai.craft||0).toFixed(2)} err${c.ai.err?c.ai.err.type:'-'} onRoad${c.onRoad}`); } }
        m.sl = sl;
      }
    }
    return { log, t: Math.round(f / 60), ...st, wrecks: sim.cars.filter(c => c.wreck).map(c => c.wreck.kind + " L" + c.lap + (c.ai?.dMove ? " DEF" : "")) };
  }, !!process.env.LOG);
  const { log, ...rest } = r; if (log.length) console.log(log.join('\n'));
  console.log(id, mode, process.env.EXTRA || '', JSON.stringify(rest));
} finally { await b.close(); server.kill(); }
