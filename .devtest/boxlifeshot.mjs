// dev: the boxes at work in a session (js/pitlife.js atWork, js/pitprops.js): walk to the next team's box and look in
// (its car on its stands, the crew at it, the driver talking), the same box with its car out on a run, and a talk with
// its driver. FAIL lines are problems.  [TRACK=...] node .devtest/boxlifeshot.mjs [outdir] [day|night]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', TIME = process.argv[3] || 'day';
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TIME, TRACK]) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = TIME;
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  }, [TIME, process.env.TRACK]);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.boxes.some(b => b.crew.length && b.driver), null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Walk The Pit Lane/i.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.dbg.walk && window.__svgp.dbg.walk.active, null, { timeout: 30000 });
  // the next box with a team in it: stand in its door looking in
  const nb = await pg.evaluate(() => {
    const W = window.__svgp.dbg.walk, nav = W.nav, life = window.__svgp.sim.pitLife;
    const boxes = life.boxes.filter(b => !b.mine && b.driver && b.F);
    const loc = (b) => { const p = new (W.pos.constructor)().fromArray(b.F.P(0, 1.5, 0)).applyMatrix4(nav.M); return p; };
    boxes.sort((a, c) => loc(a).length() - loc(c).length());
    const b = boxes[0], k = life.boxes.indexOf(b), p = loc(b), q = new (W.pos.constructor)().fromArray(b.F.P(0, 7, 0)).applyMatrix4(nav.M);
    W.pos.set(p.x, 0, p.z); W.heading = Math.atan2(q.x - p.x, q.z - p.z); W.camYaw = W.heading; W.camPitch = 0.25;
    // (its runs all late in the session: its car's in now, whatever the random plan said)
    const sim = window.__svgp.sim, e = sim.quali.field.find(x => sim.boxSlot(x.teamIdx) === b.k); for (const r of e.plan) r.at = sim.quali.time - 5;
    return { k, name: b.driverName, team: b.team.name };
  });
  console.log('box', JSON.stringify(nb));
  await pg.waitForFunction(() => !window.__svgp.dbg.walk.camFrom, null, { timeout: 60000, polling: 200 }); // (the camera out of your box first)
  await pg.waitForTimeout(3000);
  const st = () => pg.evaluate((k) => { const b = window.__svgp.sim.pitLife.boxes[k]; return { car: !!(b.parked && b.parked.group.visible), group: !!(b.group && b.group.visible), driver: b.driver.object.visible, clips: b.crew.map(m => m.ch.clip).concat(b.driver.clip) }; }, nb.k);
  let s = await st(); console.log(JSON.stringify(s));
  check(s.car && s.group && s.driver, 'the next box: car on its stands, crew and driver there');
  await pg.screenshot({ path: join(OUT, `life-in-${TIME}.png`) });
  // talk to the driver: walk up to them
  const talk = await pg.evaluate((k) => {
    const W = window.__svgp.dbg.walk, b = window.__svgp.sim.pitLife.boxes[k], p = b.driver.object.getWorldPosition(W.pos.clone()).applyMatrix4(W.nav.M);
    const sp = W.spots.find(s => s.key === 'talk' && s.b === b), dir = { x: W.pos.x - p.x, z: W.pos.z - p.z }, l = Math.hypot(dir.x, dir.z);
    W.pos.set(p.x + dir.x / l * 1.1, 0, p.z + dir.z / l * 1.1); W.heading = Math.atan2(p.x - W.pos.x, p.z - W.pos.z); W.camYaw = W.heading + 0.6;
    return !!sp;
  }, nb.k);
  check(talk, 'the driver has a Talk spot');
  await pg.waitForTimeout(1500);
  const spot = await pg.evaluate(() => window.__svgp.dbg.walk.spot && window.__svgp.dbg.walk.spot.label);
  check(spot && /^Talk to/.test(spot), `walked up: the prompt is "${spot}"`);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1200);
  const said = await pg.evaluate(() => document.getElementById('toast').textContent);
  console.log('said', said);
  check(/“|"/.test(said) && said.length > 20, 'they say something');
  await pg.screenshot({ path: join(OUT, `life-talk-${TIME}.png`) });
  // the same box with its car out on a run
  await pg.evaluate((k) => { const sim = window.__svgp.sim, b = sim.pitLife.boxes[k], q = sim.quali; b.entry.plan.push({ at: q.time - q.left + 30, time: 99, del: false }); const W = window.__svgp.dbg.walk; W.pos.set(W.pos.x, 0, W.pos.z); }, nb.k);
  await pg.evaluate((k) => { const W = window.__svgp.dbg.walk, b = window.__svgp.sim.pitLife.boxes[k], p = new (W.pos.constructor)().fromArray(b.F.P(0, -2.5, 0)).applyMatrix4(W.nav.M), q = new (W.pos.constructor)().fromArray(b.F.P(0, 7, 0)).applyMatrix4(W.nav.M); W.pos.set(p.x, 0, p.z); W.heading = Math.atan2(q.x - p.x, q.z - p.z); W.camYaw = W.heading; }, nb.k);
  await pg.waitForTimeout(5000);
  s = await st(); console.log(JSON.stringify(s));
  check(!s.car && !s.driver, 'on a run: the bay empty, the driver gone');
  await pg.screenshot({ path: join(OUT, `life-out-${TIME}.png`) });
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
