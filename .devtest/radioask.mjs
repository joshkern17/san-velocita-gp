// dev: ask the engineer every question (radioask.js) in a short seeded race, you on the autopilot from the back.
//   node .devtest/radioask.mjs [car] [seed] [laps]      MODE=practice: a practice session instead; SHOT=dir: menu screenshots
// → every answer's text after each lap (from lap 2), the corner losses' sum against the lap gap, and laps-to-cliff
// as the tires wear (it should fall). Fails loudly on an empty answer or a page error.
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const id = process.argv[2] || 'm1procar', seed = +(process.argv[3] || 1), laps = +(process.argv[4] || 4), MODE = process.env.MODE || 'race', SHOT = process.env.SHOT;
const SEEDRNG = `(() => { let a = ${seed} * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()`;
let bad = 0;
try {
  const pg = await b.newPage(); await pg.setViewportSize(SHOT ? { width: 1600, height: 900 } : { width: 320, height: 180 });
  pg.on('pageerror', e => { bad++; console.log('PAGE ERROR', e.message); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([id, laps, MODE, SEEDRNG]) => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    const S = window.__svgp.settings; S.car = { ...S.car, chassis: id }; S.grid = 'back'; S.wear = 'normal'; S.safetyCar = 'off';
    (0, eval)(SEEDRNG);
    window.__svgp.startRace(t, { mode: MODE, laps, opponents: 9, aiChassis: 'class', car: S.car }, 'menu');
  }, [id, laps, MODE, SEEDRNG]);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 0 && window.__svgp.sim.lineV, null, { timeout: 120000 });
  if (SHOT) await pg.evaluate((n) => { window.__stopLap = n; }, laps - 1);
  const r = await pg.evaluate(async () => {
    const sim = window.__svgp.sim, M = await import('/js/radioask.js');
    sim.setPaused(true); sim.paused = false; window.__svgp.sim = null;
    sim.state = 'racing'; sim.stateT = 0; sim.player.autoT = 1e9;
    const pl = sim.player, out = [], cliff = [];
    // (a teammate, as World Career has: the AI car with a trust figure)
    const mate = sim.cars.find(c => c.ai && !c.isPlayer); mate.ai.trust = 60; let mateCheck = null;
    let f = 0, lap = pl.lap;
    while (sim.state === 'racing' && f < 60 * 60 * 10 && !(window.__stopLap && pl.lap > window.__stopLap)) {
      sim.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); f++;
      if (mateCheck && sim.raceTime > mateCheck.at) { const said = sim.events.filter(e => e.type === 'radio' && e.who === 'mate').map(e => e.msg); out.push(`mate order ${mateCheck.kind}: engineer "${mateCheck.msg}" · mate said ${JSON.stringify(said.slice(-1))} · pace ${mateCheck.pace.toFixed(4)} -> ${mate.ai.pace.toFixed(4)}, wearK ${mateCheck.wear} -> ${mate.phys.wearK.toFixed(2)}${said.length ? '' : ' NO REPLY NULL'}`); mateCheck = null; sim.events.length = 0; }
      if (pl.lap !== lap) {
        lap = pl.lap;
        if (lap < 3) continue;
        const menu = M.radioMenu(sim, pl), lines = [];
        for (const m of menu) for (const it of m.items) { if (/^(letby|hold|push|save)$/.test(it.key)) continue; const a = M.ask(sim, pl, m.key + '.' + it.key); lines.push(`  ${m.key}.${it.key}: ${a ? a.msg.replace(/<\/?b>/g, '') : 'NULL'}`); }
        cliff.push(+M.lapsToCliff(sim, pl).toFixed(1));
        if (lap === 3 && !mate.finished) { sim.events.length = 0; const kind = 'push', pace = mate.ai.pace, wear = mate.phys.wearK.toFixed(2); const a = M.ask(sim, pl, 'mate.' + kind); mateCheck = { kind, msg: a && a.msg, pace, wear, at: sim.raceTime + 2.5 }; const again = M.ask(sim, pl, 'mate.save'); lines.push('  (order again at once): ' + (again && again.msg)); }
        out.push(`lap ${lap - 1} done (${pl.last.toFixed(2)}, P${pl.pos}, wear ${(Math.min(pl.phys.tyre.wf, pl.phys.tyre.wr) * 100).toFixed(0)}%) menu: ${menu.map(m => m.key + (m.sub ? `[${m.sub}]` : '')).join(' ')}\n` + lines.join('\n'));
      }
    }
    // the corner split check: your last two recorded laps, analysed: the losses should add up to the lap gap
    const L = sim.sessLaps.filter(l => l.ch), A = L[L.length - 1], B = L[L.length - 2];
    let sum = null;
    if (A && B) { const { analyze } = await import('/js/telemetry.js'); const an = analyze(A, B, sim.T, sim.corners.list); sum = { corners: +an.corners.reduce((s, c) => s + c.loss, 0).toFixed(3), lap: +(A.time - B.time).toFixed(3) }; }
    window.__svgp.sim = sim; sim.paused = true;
    return { out, cliff, sum, eng: sim.opts.engineer ?? null };
  });
  for (const o of r.out) { console.log(o); if (/NULL|undefined|NaN|Infinity/.test(o)) { bad++; console.log('FAIL: the answers above'); } }
  console.log('laps to cliff by lap:', r.cliff.join(' '));
  if (r.cliff.length > 1 && r.cliff.some((x, k) => k && isFinite(x) && x > r.cliff[k - 1] + 0.6)) { bad++; console.log('FAIL laps-to-cliff went up'); }
  console.log('corner split check:', JSON.stringify(r.sum));
  if (r.sum && Math.abs(r.sum.corners - r.sum.lap) > 0.05) { bad++; console.log('FAIL corner losses do not add up'); }
  if (SHOT) {
    // the menu, both levels, keyboard and pad glyphs (the sim's still: driven by hand here)
    await pg.evaluate(() => { const s = window.__svgp.sim; s.paused = false; s.player.autoT = 1e9; window.__autopilot = true; });
    await pg.keyboard.press('KeyT'); await pg.waitForTimeout(1500);
    console.log('ask state', await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player; return JSON.stringify({ call: !!s.call, mode: s.mode, state: s.state, fin: p.finished, pit: p.pitting, ask: !!window.__svgp.hud.askEl, screen: document.querySelector('.screen.active')?.id }); })); await pg.screenshot({ path: `${SHOT}/ask-top-kb.png` });
    await pg.keyboard.press('Digit2'); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${SHOT}/ask-sub-kb.png` });
    await pg.keyboard.press('Digit1'); await pg.waitForTimeout(900);
    await pg.waitForTimeout(600); await pg.evaluate(() => { window.__svgp.hud.padGlyphs = true; }); await pg.keyboard.press('KeyT'); await pg.waitForFunction(() => document.querySelector('.rd-ask.on')); await pg.waitForTimeout(500); await pg.screenshot({ path: `${SHOT}/ask-top-pad.png` });
    console.log('answer', await pg.evaluate(() => { const r = document.getElementById('h-radio'); return r.className + ' | ' + [...r.children].map(e => e.className + ': ' + e.textContent.slice(0, 120)).join(' || '); })); await pg.screenshot({ path: `${SHOT}/ask-answer.png` });
  }
} finally { await b.close(); server.kill(); }
console.log(bad ? `FAILED (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
