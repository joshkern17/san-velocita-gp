// Director mode: the game films itself for marketing (marketing/STRATEGY.md §4). Loads the game in Chrome, starts an
// AI race (the AI drives your car too), stops the game's own loop, then steps the race exactly 1/60 s per frame, puts
// the camera on a rig (tools/director/rigs.js) and grabs every frame straight off the canvas (no HUD: it's DOM).
// Each shot becomes its own mp4 in marketing/footage/<name>/, plus a log of the focus car's revs/speed/gear per frame
// (for rendering engine audio in sync later).
//   node tools/director/director.mjs <shotlist.json> [--only 2] [--swiftshader] [--headed]
// Shot list: see tools/director/shots/example.json.
import { spawn } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));

const args = process.argv.slice(2), flag = (f) => args.includes(f), opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const listPath = args.find(a => a.endsWith('.json'));
if (!listPath) { console.log('usage: node tools/director/director.mjs <shotlist.json> [--only N] [--swiftshader] [--headed]'); process.exit(1); }
const L = JSON.parse(readFileSync(resolve(listPath), 'utf8'));
const FPS = L.fps || 60, ONLY = opt('--only') ? +opt('--only') : null;
const vertical = (L.aspect || '9:16') === '9:16';
const [OW, OH] = vertical ? [1080, 1920] : [1920, 1080];          // output size
const [VW, VH] = vertical ? [540, 960] : [960, 540];                // the page's CSS size (the game renders at `res` lines)
const RES = L.res || (vertical ? 'hd' : 'ps2');                    // 9:16 needs more lines or it's 250 px wide
const OUT = join(ROOT, 'marketing/footage', L.name || 'take'); mkdirSync(OUT, { recursive: true });

const PORT = 8790 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const gl = flag('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
const b = await chromium.launch({ channel: 'chrome', headless: !flag('--headed'), args: [...gl, '--autoplay-policy=no-user-gesture-required'] });
const t0 = Date.now();
try {
  const pg = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript((seed) => {
    navigator.getGamepads = () => []; // (the dev's real controller would drive the menus)
    let a = seed * 2654435761 >>> 0; // seeded Math.random: the same shot list films the same race
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }, L.seed ?? 1);
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);

  // the race
  await pg.evaluate(async (L) => {
    const G = window.__svgp, S = G.settings, tr = L.track || {};
    let t;
    if (tr.real) { const R = await import('/js/realtracks.js'); await R.realTracksReady(); t = JSON.parse(JSON.stringify(R.realTracks().find(x => x.real.id === tr.real))); }
    else if (tr.preset) { const T = await import('/js/track.js'); t = T.cloneTrack(T.presetTracks().find(x => x.name === tr.preset)); }
    else t = await (await fetch('/' + (tr.file || '.devtest/auburn2.json'))).json();
    if (!t) throw new Error('track not found: ' + JSON.stringify(tr));
    t.env = { ...(t.env || {}), ...(L.env || {}) };
    S.commentary = 'off'; S.engVoice = 'off'; S.volume = 0; S.music = 0;
    Object.assign(S, L.settings || {});
    const R = L.race || {};
    const car = { ...S.car, ...(R.car ? { chassis: R.car } : {}), ...(R.livery || {}) };
    S.car = car; // (startRace reads the chosen car from settings too)
    G.startRace(t, { mode: 'race', laps: R.laps ?? 5, opponents: R.opponents ?? 7, grid: R.grid || 'middle', aiChassis: R.aiChassis || 'class', car, extra: R.extra || {} }, 'menu');
  }, L);
  await pg.waitForFunction(() => { const s = window.__svgp.sim; return s && s.cars && s.cars.length && s.lineV && ['strategy', 'intro', 'carselect', 'countdown', 'racing', 'broadcast'].includes(s.state); }, null, { timeout: 180000 });

  // take the clock: stop the game's own loop, then time only moves when we step it
  await pg.evaluate(async ({ RES, L }) => {
    const G = window.__svgp, s = G.sim;
    window.requestAnimationFrame = () => 0;
    await new Promise(r => setTimeout(r, 120)); // (let the last scheduled frame run out)
    let vt = performance.now(), vd = Date.now(); const base = vd - vt;
    performance.now = () => vt; Date.now = () => Math.round(base + vt);
    window.__dir = { step(dt) { vt += dt * 1000; } };
    const S = G.settings, V = { ...S, ...(L.video || {}) };
    G.post.configure({ crt: V.crt, mode: RES, filter: V.filter, scanlines: V.scan, trails: V.trails, retro: V.retro, palette: V.palette, grain: V.grain, rays: V.rays, fringe: V.fringe, bypass: V.look === 'off' });
    G.post.resize();
    if (s.state === 'strategy' && s.confirmStrategy) s.confirmStrategy(null);
    s.state = 'racing'; s.stateT = 0; s.goAt = 0;
    if (s.player) s.player.autoT = 1e9; // (the AI drives your car)
    s.lineMode = 'off'; // (no racing-line overlay in the shots)
    s.mirror = () => {}; // (no rear-view mirror in the shots)
    const { install } = await import('/tools/director/rigs.js');
    window.__dir.D = install(s);
    window.__dir.frame = (render) => {
      const dt = 1 / 60; window.__dir.step(dt);
      s.update(dt, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {});
      G.handleRaceEvents();
      window.__dir.D.tick(dt);
      if (!render) return null;
      // (no motion trails on a shot's first frames: they'd ghost the previous shot into the cut)
      s.render(G.post, window.__dir.D.t < 0.05 ? { ...G.settings, trails: false } : G.settings);
      const c = s.focus || s.player, p = c && c.phys;
      return { png: G.post.r.domElement.toDataURL('image/png'), rpm: p ? +(p.rpm || 0).toFixed(0) : 0, kmh: p ? +(p.speed * 3.6).toFixed(1) : 0, gear: p ? p.gear : 0 };
    };
  }, { RES, L });

  // warm-up: race on without rendering until the shots start (the field spreads out, tires warm)
  const warm = Math.round((L.warmup ?? 8) * FPS);
  await pg.evaluate((n) => { for (let i = 0; i < n; i++) window.__dir.frame(false); }, warm);
  console.log(`race ready, warm-up ${L.warmup ?? 8} s done (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  const shots = L.shots || [];
  for (let k = 0; k < shots.length; k++) {
    const sh = shots[k], frames = Math.round((sh.dur || 5) * FPS);
    if (ONLY && ONLY !== k + 1) { await pg.evaluate((n) => { for (let i = 0; i < n; i++) window.__dir.frame(false); }, frames); continue; }
    await pg.evaluate((sh) => {
      const s = window.__svgp.sim, f = sh.focus ?? 'player';
      const car = f === 'player' ? s.player : f === 'leader' ? s.order[0] : typeof f === 'number' ? s.order[Math.min(s.order.length, f) - 1] : s.player;
      s.focus = car; window.__dir.D.start(sh, car);
    }, sh);
    const file = join(OUT, `${String(k + 1).padStart(2, '0')}-${sh.rig}${sh.name ? '-' + sh.name : ''}.mp4`);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
      '-vf', `scale=${OW}:${OH}:flags=bicubic`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const log = []; const ts = Date.now();
    for (let i = 0; i < frames; i++) {
      const fr = await pg.evaluate(() => window.__dir.frame(true));
      log.push([i, fr.rpm, fr.kmh, fr.gear]);
      if (!ff.stdin.write(Buffer.from(fr.png.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    writeFileSync(file.replace(/\.mp4$/, '.engine.json'), JSON.stringify({ fps: FPS, cols: ['frame', 'rpm', 'kmh', 'gear'], rows: log }));
    console.log(`shot ${k + 1}/${shots.length} ${sh.rig}: ${frames} frames in ${((Date.now() - ts) / 1000).toFixed(0)} s -> ${file.replace(ROOT + '/', '')}`);
  }
} finally { await b.close(); server.kill(); }
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
