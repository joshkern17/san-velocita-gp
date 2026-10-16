// dev: the boxes' people from your model (js/pitcrew.js): your box's menu shot, then the next team's box looked into
// three times over a minute; what everyone's doing in each box (sat, talking, at something, walking) and whether
// anyone's stood inside something. FAIL lines are problems.  [TRACK=...] node .devtest/boxcrewshot.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp';
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
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async (TRACK) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === 'Pinewood Sprint'); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  }, process.env.TRACK);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.boxes.some(b => b.brain && b.brain.people.length), null, { timeout: 30000 });
  check(await pg.evaluate(() => !!window.__svgp.sim.pitLife.boxModel), 'the boxes are from models/pitbox.glb');
  await pg.waitForTimeout(2500);
  await pg.screenshot({ path: join(OUT, 'crew-menu.png') });
  const report = () => pg.evaluate(() => window.__svgp.sim.pitLife.boxes.filter(b => b.brain).map(b => {
    const B = b.brain, n = { sat: 0, talk: 0, at: 0, walk: 0, other: 0 }; let stuck = 0;
    for (const p of B.people) {
      if (p.role === 'driver' && B.out) continue;
      if (p.path.length) n.walk++; else if (p.seat) n.sat++; else if (p.group) n.talk++; else if (p.spot) n.at++; else n.other++;
      if (!p.path.length && !p.seat && !p.spot && !B.free(p.x, p.z)) stuck++;
    }
    return { k: b.k, mine: b.mine, out: B.out, groups: B.groups.map(g => g.who.length).join('+'), ...n, stuck, clips: B.people.map(p => p.m.ch.clip).join(' ') };
  }));
  const r0 = await report(); for (const r of r0) console.log(JSON.stringify(r));
  check(r0.every(r => r.stuck === 0), 'nobody stood inside anything');
  check(r0.some(r => r.sat > 0), 'someone sat at a computer');
  check(new Set(r0.map(r => r.clips)).size > 1, 'the boxes are not all doing the same thing');
  // walk into the next team's box
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Walk The Pit Lane/i.test(e.textContent)).click(); });
  await pg.waitForFunction(() => window.__svgp.dbg.walk && window.__svgp.dbg.walk.active, null, { timeout: 30000 });
  const nb = await pg.evaluate(() => {
    const W = window.__svgp.dbg.walk, nav = W.nav, life = window.__svgp.sim.pitLife;
    const boxes = life.boxes.filter(b => !b.mine && b.brain && b.F);
    const loc = (b, z) => new (W.pos.constructor)().fromArray(b.F.P(0, z, 0)).applyMatrix4(nav.M);
    boxes.sort((a, c) => loc(a, 1).length() - loc(c, 1).length());
    const b = boxes[0], p = loc(b, -1.2), q = loc(b, 7);
    W.pos.set(p.x, 0, p.z); W.heading = Math.atan2(q.x - p.x, q.z - p.z); W.camYaw = W.heading; W.camPitch = 0.3;
    const sim = window.__svgp.sim, e = sim.quali.field.find(x => sim.boxSlot(x.teamIdx) === b.k); for (const r of e.plan) r.at = sim.quali.time + 999;
    return b.k;
  });
  await pg.waitForFunction(() => !window.__svgp.dbg.walk.camFrom, null, { timeout: 60000, polling: 200 });
  for (const t of [0, 1, 2]) {
    await pg.waitForTimeout(t ? 20000 : 3000);
    await pg.screenshot({ path: join(OUT, `crew-box-${t}.png`) });
    const r = (await report()).find(x => x.k === nb); console.log('next box', t, JSON.stringify(r));
    if (t === 2) check(r.stuck === 0, 'the next box after a while: nobody inside anything');
  }
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
