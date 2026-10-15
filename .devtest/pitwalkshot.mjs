// dev: walking the pit lane (js/pitwalk.js + js/garagewalk.js) from the garage menu in your box: where you can stand
// (random points pushed back in: never in a wall, a bench, a crew), a walk out of your box, along the lane and into the
// next team's, screenshots on the way, B back to the menu. FAIL lines are problems.
//   [TRACK='Pinewood Sprint' | 'Spa-Francorchamps'] node .devtest/pitwalkshot.mjs [outdir] [day|night]
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
  pg.on('console', m => { if (m.type() === 'error' || m.text().startsWith('bad')) console.log('console', m.text().slice(0, 300)); });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async ([TIME, TRACK]) => {
    const { presetTracks } = await import('/js/track.js');
    const real = TRACK && (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
    const t = real || presetTracks().find(q => q.name === (TRACK || 'Pinewood Sprint')); t.env.weather = 'clear'; t.env.time = TIME;
    window.__svgp.dbg.startWeekend(t, { mode: 'race', laps: 3, opponents: 5, pick: false }, 'setup', 'quali', [1200, 600]);
  }, [TIME, process.env.TRACK]);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.sim.pitLife.boxes.some(b => b.crew.length), null, { timeout: 30000 }).catch(() => console.log('no crews'));
  await pg.waitForTimeout(1000);
  await pg.evaluate(() => { [...document.querySelectorAll('#m-pitgarage .item')].find(e => /Walk The Pit Lane/i.test(e.textContent)).click(); });
  console.log(JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll("#m-pitgarage .item")].map(e => e.textContent.trim()))));
  await pg.waitForFunction(() => window.__svgp.dbg.walk && window.__svgp.dbg.walk.active, null, { timeout: 30000 }).catch(async () => console.log("not walking", await pg.evaluate(() => JSON.stringify({ cls: document.getElementById("s-pitgarage").className, toast: document.getElementById("toast")?.textContent }))));
  // where you can stand: random points round your box, pushed in, must end up somewhere walkable and clear
  const r = await pg.evaluate(() => {
    const W = window.__svgp.dbg.walk, nav = W.nav, R = 0.28; let bad = 0, n = 0, worst = 0;
    const inside = (p) => { const q = { ...p }; nav.contain(q, R); return Math.hypot(q.x - p.x, q.z - p.z) < 0.03; };
    const blocked = (p) => { const q = { ...p }; nav.clear(q, R - 0.02); return Math.hypot(q.x - p.x, q.z - p.z); };
    let seed = 3; const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    for (let i = 0; i < 3000; i++) {
      const p = { x: (rnd() - 0.5) * 120, z: -16 + rnd() * 30 };
      nav.push(p, R); n++;
      const dIn = inside(p) ? 0 : 1, dB = blocked(p);
      if (dIn || dB > 0.05) { bad++; worst = Math.max(worst, dB); if (bad < 6) console.log('bad', JSON.stringify(p), dIn, dB.toFixed(3)); }
    }
    return { n, bad, worst: +worst.toFixed(2), rooms: nav.rooms.length, obs: nav.obs.length, crew: nav.crew.length };
  });
  console.log(JSON.stringify(r));
  check(r.bad / r.n < 0.01, `random points pushed somewhere you can stand (${r.bad} of ${r.n} not)`);
  // a walk: out of the door, along the lane to the next box with a team in it, in through its door, to its back
  const walkTo = (x, z, secs = 12) => pg.evaluate(([x, z, secs]) => {
    const W = window.__svgp.dbg.walk, p = W.pos, dt = 1 / 60;
    for (let t = 0; t < secs; t += dt) {
      const vx = x - p.x, vz = z - p.z, d = Math.hypot(vx, vz); if (d < 0.15) break;
      p.x += vx / d * 1.6 * dt; p.z += vz / d * 1.6 * dt; W.push(); W.heading = Math.atan2(vx, vz);
    }
    W.camYaw = W.heading; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
  }, [x, z, secs]);
  const shot = async (name) => { await pg.waitForTimeout(2500); await pg.screenshot({ path: join(OUT, name) }); console.log('shot', name); };
  await pg.waitForFunction(() => !window.__svgp.dbg.walk.camFrom, null, { timeout: 60000, polling: 200 });
  await shot(`walk-spawn-${TIME}.png`);
  const out = await walkTo(1.5, 4); console.log('out of the door', JSON.stringify(out));
  check(out.z > 2, 'walked out of the door into the lane');
  // the next box: its door from the lane, then inside
  const nb = await pg.evaluate(() => {
    const nav = window.__svgp.dbg.walk.nav, me = nav.rooms.find(fr => Math.hypot(fr.o.x, fr.o.z) < 1), o = nav.rooms.filter(fr => fr !== me).sort((a, b) => Math.hypot(a.o.x, a.o.z) - Math.hypot(b.o.x, b.o.z))[0];
    const at = (x, z) => { const w = { x: 0, z: 0 }; nav.outFr(o, { x, z }, w); return w; };
    return { door: at(0, -3), inside: at(0, 7), far: Math.hypot(o.o.x, o.o.z) };
  });
  console.log('next box', JSON.stringify(nb));
  await walkTo(nb.door.x, nb.door.z, 40);
  await shot(`walk-lane-${TIME}.png`);
  const got = await walkTo(nb.inside.x, nb.inside.z, 20);
  check(Math.hypot(got.x - nb.inside.x, got.z - nb.inside.z) < 0.5, `into the next team's box (${JSON.stringify(got)})`);
  await shot(`walk-otherbox-${TIME}.png`);
  // into a wall: you stop at it
  const wall = await walkTo(got.x + 40, got.z, 30);
  check(Math.hypot(wall.x - got.x, wall.z - got.z) < 9, `stopped by the box's side wall (${JSON.stringify(wall)})`);
  // the keys: W walks you (the way the camera looks)
  const k0 = await pg.evaluate(() => { const W = window.__svgp.dbg.walk; W.camYaw += Math.PI; return W.pos.clone(); }); // (turned round, off the wall)
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(2500); await pg.keyboard.up('KeyW');
  const k1 = await pg.evaluate(() => window.__svgp.dbg.walk.pos.clone());
  check(Math.hypot(k1.x - k0.x, k1.z - k0.z) > 0.3, `W walks (${Math.hypot(k1.x - k0.x, k1.z - k0.z).toFixed(2)} m)`);
  // B: back to the menu
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => ({ walking: window.__svgp.dbg.walk.active, cls: document.getElementById('s-pitgarage').className, screen: window.__svgp.screen }));
  check(!st.walking && !/walking/.test(st.cls) && st.screen === 's-pitgarage', 'B: back to the garage menu');
  await shot(`walk-back-${TIME}.png`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'all ok');
