// dev: the pre-race broadcast in the real game: the race goes to the flyover (state 'broadcast') with the right
// exchanges for the track and conditions, the booth starts talking, the HUD hides, the camera cuts between shots, and
// Enter skips it to the grid. node .devtest/flyover.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden; track.env.weather = 'rain'; track.env.time = 'day';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const expect = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };
try {
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.mouse.click(320, 180);
  await pg.evaluate((track) => { const S = window.__svgp.settings; S.commentary = 'full'; window.__svgp.startRace(track, { mode: 'race', laps: 1, opponents: 3, car: S.car }, 'menu'); }, track);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.lineV && ['strategy', 'intro', 'carselect'].includes(window.__svgp.sim.state), null, { timeout: 120000 });
  // (headless draws no frames: step the race and its events here, as the game loop would)
  const step = (n, skip = false) => pg.evaluate(([n, skip]) => { const s = window.__svgp.sim; for (let k = 0; k < n; k++) { s.update(1 / 30, { steer: 0, throttle: 0, brake: 0 }, { skip: skip && k === 0 }); window.__svgp.handleRaceEvents(); } }, [n, skip]);
  const ids = await pg.evaluate(() => { const s = window.__svgp.sim; if (s.state === 'strategy') s.confirmStrategy(null); const ev = []; const push = s.events.push.bind(s.events); s.events.push = (e) => { ev.push(e); return push(e); }; s.update(1 / 30, { steer: 0, throttle: 0, brake: 0 }, {}); const got = ev.find(e => e.type === 'booth-intro'); window.__svgp.handleRaceEvents(); return { state: s.state, ids: got && got.ids }; });
  expect(ids.state === 'broadcast', 'the race opens on the broadcast', ids.state);
  expect(ids.ids && ids.ids.includes('cond.rain') && ids.ids[0] === 'intro.debut', 'your first race: its own opening, then the rain exchange (a track without its own welcome)', JSON.stringify(ids.ids));
  expect(await pg.evaluate(() => !!localStorage.getItem('svgp.raced')), 'and the game remembers you\'ve raced (the next one opens normally)');
  await pg.waitForTimeout(800);
  expect((await pg.evaluate(async () => (await import('/js/vo.js')).voState())).booth, 'the booth is talking');
  expect(await pg.evaluate(() => document.getElementById('hud').classList.contains('bcast')), 'the HUD is hidden');
  const cams = [];
  for (let k = 0; k < 3; k++) { await step(200); cams.push(await pg.evaluate(() => { const p = window.__svgp.sim.camera.position; return [p.x, p.y, p.z].map(v => Math.round(v)); })); }
  const moved = cams.slice(1).every((c, k) => Math.hypot(c[0] - cams[k][0], c[2] - cams[k][2]) > 30);
  expect(moved, 'the camera cuts to new shots round the track', JSON.stringify(cams));
  expect(await pg.evaluate(() => window.__svgp.sim.state) === 'broadcast', 'still on the broadcast 20 s in');
  await step(2, true);
  const after = await pg.evaluate(async () => ({ state: window.__svgp.sim.state, booth: (await import('/js/vo.js')).voState().booth, hud: document.getElementById('hud').classList.contains('bcast') }));
  expect(after.state === 'intro' && !after.booth && !after.hud, 'Enter skips to the grid: the booth stops, the HUD is back', JSON.stringify(after));
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
