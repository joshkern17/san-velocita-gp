// dev: pictures of a live session (js/livesession.js): a box with two cars in it (one each side), an AI car being
// pushed out of its box and back in, from the lane.   [OPP=15] node .devtest/liveshot.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const OUT = process.argv[2] || '/tmp', OPP = +(process.env.OPP || 15);
const PORT = 8990 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TRACK, OPP]) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = 'day';
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: OPP, pick: false }, 'setup', 'quali', [1200, 1200]);
  }, [process.env.TRACK, OPP]);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 180000 });
  // out of the garage on a flying lap (your car drives itself), the race's camera then held where we say
  await pg.evaluate(() => [...document.querySelectorAll('#m-pitgarage .item')].find(e => e.textContent.trim() === 'Flying Lap').click());
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 30000 });
  await pg.addStyleTag({ content: '.screen, #hud, #toast { visibility: hidden !important; }' });
  await pg.evaluate(() => { const s = window.__svgp.sim; window.__cam = null; const V = s.camera.position.constructor; s.player.autoT = 1e9;
    const uc = s.updateCamera.bind(s); s.updateCamera = (dt) => { if (window.__cam) { s.camera.position.copy(window.__cam[0]); s.camera.lookAt(window.__cam[1]); } else uc(dt); };
    // (from out in the lane, looking into box b: back d m from its door, h up)
    window.__lookBox = (b, d = 9, side = 0) => { const F = b.F, P = (x, z, y) => new V(...F.P(x, z, y)); window.__cam = [P(side, -d, 2.4), P(side * 0.5, 5, 0.6)]; }; });
  const shot = async (name) => { await pg.evaluate(() => window.__svgp.sim.update(1 / 60, {}, {})); await pg.waitForTimeout(500); await pg.screenshot({ path: join(OUT, name) }); console.log('shot', name); };
  // (no box shared here? make one: a second team put in the first AI team's box, as a team of two would be)
  await pg.evaluate(() => { const s = window.__svgp.sim, L = s.pitLife;
    if (L.boxes.some(b => L.boxCars(b).length > 1)) return;
    const R = s.live.runners, a = R[0].car, c = R[1].car, kA = s.boxSlot(a.teamIdx), kC = s.boxSlot(c.teamIdx), bs = s.boxSlot.bind(s);
    s.boxSlot = (t) => t === c.teamIdx ? kA : bs(t);
    for (const b of L.boxes) if (b.k === kA || b.k === kC) { b.carSpots = null; if (b.brain) { for (const p of b.brain.people) p.held = false; b.brain = null; } }
    for (const x of R) { x.car.parkShown = false; if (x.st === 'garage') s.live.show(x.car); } });
  const shared = await pg.evaluate(() => { const s = window.__svgp.sim, L = s.pitLife, b = L.boxes.find(b => L.boxCars(b).length > 1 && b.F && !b.mine) || L.boxes.find(b => L.boxCars(b).length > 1 && b.F);
    if (!b) return null; window.__lookBox(b, 10); return b.k + ' ' + L.boxCars(b).map(c => c.name + '@' + L.sideOf(c)).join(', '); });
  console.log('shared box', shared);
  if (shared) await shot('live-shared.png');
  await pg.evaluate(() => { const s = window.__svgp.sim; window.__lookBox(s.pitLife.mine, 10); });
  await shot('live-mine.png');
  // on till a push out starts, then pictures of it from the lane
  for (const kind of ['out', 'in']) {
    const got = await pg.evaluate((kind) => { const s = window.__svgp.sim, L = s.live;
      for (let i = 0; i < 60 * 600; i++) {
        // (the camera by every box, so a push is shown: near one with a car about to go)
        s.update(1 / 60, {}, {});
        const P = L.pushes.find(p => p.active && p.kind === kind && p.crew.length);
        if (P && P.phase === 'push') { window.__P = P; return P.car.name + ' box ' + P.b.k + ' crew ' + P.crew.length; }
        // (keep the camera near whichever car's next: so its push isn't skipped as unseen)
        if (i % 30 === 0) { const R = L.runners.find(R => kind === 'out' ? R.st === 'garage' : R.st === 'in' && R.car.pitting); if (R) { const pp = s.pitLife.parkPose(R.car); if (pp) window.__lookBox(pp.b, 9); } }
      }
      return null; }, kind);
    console.log('push', kind, got);
    if (!got) continue;
    for (const k of [0, 1, 2]) {
      await pg.evaluate(() => { const s = window.__svgp.sim, P = window.__P; window.__lookBox(P.b, 8, P.sg * (P.cx || 0) * 0.6); for (let i = 0; i < 90; i++) s.update(1 / 60, {}, {}); });
      await shot(`live-push-${kind}-${k}.png`);
    }
  }
} finally { await b.close(); server.kill(); }
