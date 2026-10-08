// dev: practice's run plan (practice.js) in the pit garage: the menu, the job's panel, the brake markers carried to
// qualifying. node .devtest/runplanshot.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const out = process.argv[2] || HERE;
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden; track.env.weather = 'clear';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.waitForTimeout(1000);
  await pg.evaluate((track) => window.__svgp.dbg.startWeekend(track, { mode: 'race', laps: 3, opponents: 3, pick: false }, 'setup', 'full', [600, 300]), track);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForTimeout(1500);
  const rows = () => pg.evaluate(() => [...document.querySelectorAll('#m-pitgarage .item')].map(e => e.textContent.trim()));
  console.log('menu', JSON.stringify(await rows()));
  // Run Plan
  const pick = async (label) => { await pg.evaluate((label) => { const m = [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim().startsWith(label)); m.click(); }, label); await pg.waitForTimeout(400); };
  await pick('Run Plan');
  console.log('plan', JSON.stringify(await rows()));
  await pg.screenshot({ path: join(out, 'runplan-menu.png') });
  await pick('Track Acclimatization');
  console.log('after', JSON.stringify(await rows()), 'prog', await pg.evaluate(() => window.__svgp.sim.prog && window.__svgp.sim.prog.gates.length));
  // pretend a lap's been done: two brake points nailed, a 74% lap
  await pg.evaluate(() => { const sim = window.__svgp.sim, bs = sim.prog.gates.filter(g => g.kind === 'brake'); sim.nailBrake(bs[0].b); sim.nailBrake(bs[1].b);
    sim.prog.lap = { pts: sim.prog.gates.length * 74, n: sim.prog.gates.length, res: [] }; sim.programmeLap(); });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => { const g = window.__svgp; g.sim.events.length = 0; });
  // the garage panel redraws on its timer
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: join(out, 'runplan-garage.png') });
  console.log('tdata', JSON.stringify(await pg.evaluate(() => window.__svgp.sim.tdata)));
  // end practice, on to qualifying: the markers come too
  await pg.evaluate(() => window.__svgp.sim.qualiEnd());
  await pg.waitForFunction(() => window.__svgp.screen === 's-results', null, { timeout: 20000 });
  await pg.evaluate(() => { [...document.querySelectorAll('#s-results .item')].find(e => /Qualifying/.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage' && window.__svgp.sim.quali.kind === 'quali', null, { timeout: 120000 });
  console.log('quali', JSON.stringify(await pg.evaluate(() => { const s = window.__svgp.sim; return { tdata: s.tdata, boards: s.markers.group.children.length, prog: !!s.prog, menu: [...document.querySelectorAll('#m-pitgarage .item')].map(e => e.textContent.trim()).slice(0, 4) }; })));
  // the boards, from the track: a frame 70 m before the first
  await pg.evaluate(() => { const g = window.__svgp; [...document.querySelectorAll('#m-pitgarage .item')][0].click(); });
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { const sim = window.__svgp.sim, b = sim.tdata.acclim.marks[0], i = (b - Math.round(28 / sim.T.ds) + sim.T.N) % sim.T.N; sim.camMode = 0; sim.player.idx = i; sim.resetCar(sim.player); const p = sim.player.phys; p.vx = p.vz = 0; });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(out, 'runplan-boards.png') });
} finally { await b.close(); server.kill(); }
