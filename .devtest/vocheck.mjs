// dev: the recorded engineer voice (js/vo.js) in a real race. Starts a race, pushes radio events the way race.js does,
// and checks the engineer starts talking, queues a second message, lets an urgent one cut in, and stops at the end of
// the line. node .devtest/vocheck.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden; track.env.weather = 'clear';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const expect = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
try {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.mouse.click(640, 360); // (a click: the audio starts)
  await pg.evaluate((track) => window.__svgp.startRace(track, { mode: 'test', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu'), track);
  await pg.waitForFunction(() => window.__svgp.screen === 'hud' && window.__svgp.sim, null, { timeout: 90000 });
  const st = () => pg.evaluate(async () => (await import('/js/vo.js')).voState());
  // (waitForFunction treats an async check as true straight away: poll instead)
  const until = async (f, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise(r => setTimeout(r, 100))) if (f(await st())) return true; return false; };
  await until(s => s.manifest, 10000);
  // (headless Chrome draws no frames, so the game loop doesn't run: the events are handled here, as the loop would)
  const radio = (vo, big) => pg.evaluate(({ vo, big }) => { window.__svgp.sim.events.push({ type: 'radio', vo, msg: vo, big }); window.__svgp.handleRaceEvents(); }, { vo, big });

  await radio('tires.fading', false);
  await until(s => s.eng, 5000);
  expect((await st()).eng, 'engineer starts talking on a radio event');
  await radio('rain.stopped', false);
  await pg.waitForTimeout(150);
  expect((await st()).queued === 1, 'a second message waits its turn');
  await radio('wing.front.gone', true);
  await pg.waitForTimeout(400);
  const s = await st();
  expect(s.eng && s.queued === 0, 'an urgent message cuts in and clears the queue');
  await until(s => !s.eng, 15000);
  expect(!(await st()).eng, 'he stops when the line ends');
  const missing = await pg.evaluate(async () => {
    const vo = await import('/js/vo.js'), m = await fetch('/assets/voice/manifest.json').then(r => r.json());
    return Object.keys(m.eng).filter(k => !vo.hasLine('eng', k));
  });
  expect(missing.length === 0, 'every engineer clip in the manifest resolves');
  expect(await pg.evaluate(() => document.getElementById('h-radio').innerText.length > 0), 'the radio HUD still shows the message');
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
