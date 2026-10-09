// dev: the broadcast package (tvgfx.js) in the real game, each look: the intro card on the flyover, then the ticker,
// a battle box, a lower third, the winner card. Screenshots to .devtest/tmp/tv/. node .devtest/tvshot.mjs [looks...]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), OUT = join(HERE, 'tmp', 'tv');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const looks = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'blade', 'tech', 'local'];
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden; track.env.weather = 'clear'; track.env.time = 'day';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const look of looks) for (let tries = 0; tries < 3; tries++) try {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; localStorage.setItem('svgp.raced', '1'); });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.mouse.click(4, 716);
  {
    await pg.evaluate(([track, look]) => { const S = window.__svgp.settings; S.commentary = 'full'; S.tvLook = look; window.__svgp.startRace(track, { mode: 'race', laps: 3, opponents: 7, car: S.car }, 'menu'); }, [track, look]);
    for (let k = 0; k < 600; k++) { await pg.waitForTimeout(250); if (await pg.evaluate(() => { const s = window.__svgp.sim; return s && s.lineV && ['strategy', 'intro', 'carselect', 'broadcast'].includes(s.state); })) break; }
    if (!await pg.evaluate(() => !!window.__svgp.sim)) throw new Error('the race never started');
    const step = (n, skip = false) => pg.evaluate(([n, skip]) => { const s = window.__svgp.sim; for (let k = 0; k < n; k++) { s.update(1 / 30, { steer: 0, throttle: 0, brake: 0 }, { skip: skip && k === 0 }); window.__svgp.handleRaceEvents(); window.__svgp.tvFrame?.(); } }, [n, skip]);
    await pg.evaluate(() => { const s = window.__svgp.sim; if (s.state === 'strategy') s.confirmStrategy(null); });
    await step(1); await pg.waitForTimeout(150);
    console.log(look, await pg.evaluate(() => ({ state: window.__svgp.sim.state, bc: !!window.__svgp.sim.bcIntro, ic: !!document.querySelector('#tv .ic'), tv: document.getElementById('tv')?.className })));
    await pg.screenshot({ path: join(OUT, `${look}-1-intro-flying.png`) });
    await pg.waitForTimeout(1300);
    await pg.screenshot({ path: join(OUT, `${look}-2-intro.png`) });
    console.log(await pg.evaluate(() => { const e = document.querySelector('#tv .ic'); if (!e) return 'gone'; const r = e.getBoundingClientRect(), cs = getComputedStyle(e), h = document.getElementById('hud'), tv = document.getElementById('tv'); return { cls: e.className, r: [r.x, r.y, r.width, r.height].map(Math.round), op: cs.opacity, hudCls: h.className, tvop: getComputedStyle(tv).opacity, tvdisp: getComputedStyle(tv).display, z: getComputedStyle(tv).zIndex, state: window.__svgp.sim.state }; }));
    await step(2, true); // (Enter: to the grid)
    for (let k = 0; k < 40 && await pg.evaluate(() => window.__svgp.sim.state !== 'racing'); k++) await step(30);
    await step(400); await pg.waitForTimeout(800);
    await pg.screenshot({ path: join(OUT, `${look}-3-ticker.png`) });
    await pg.evaluate(async () => { const { battleOf } = await import('/js/broadcast.js'); const s = window.__svgp.sim, o = s.order; if (!window.__offLog) { window.__offLog = []; const tv = window.__svgp.tv, off = tv.off.bind(tv), stop = tv.stop.bind(tv); tv.off = (k) => { if (k === 'bt' && tv.on.bt) window.__offLog.push(new Error().stack.split('\n').slice(2, 5).join(' | ')); off(k); }; tv.stop = () => { window.__offLog.push('stop'); stop(); }; } const bat = battleOf('battle.pressure', [o[1], o[2]]); window.__svgp.tvTest({ type: 'pbp', bat }); return { bat: !!bat, gfx: !!document.querySelector('#tv .gfx'), n: document.querySelector('#tv .gfx')?.children.length }; }).then(r => console.log('battle', r));
    await pg.waitForTimeout(150); await pg.screenshot({ path: join(OUT, `${look}-4-battle-flying.png`) });
    await pg.waitForTimeout(1200); await pg.screenshot({ path: join(OUT, `${look}-5-battle.png`) });
    console.log('bt', await pg.evaluate(() => { const e = document.querySelector('#tv .bt'); if (!e) return [...document.querySelectorAll('#tv .gfx > *')].map(x => x.className).join(' / ') + ' ' + window.__svgp.sim.state + ' ' + JSON.stringify(window.__offLog); const r = e.getBoundingClientRect(); return { cls: e.className, r: [r.x, r.y, r.width, r.height].map(Math.round), op: getComputedStyle(e).opacity, html: e.innerHTML.slice(0, 200) }; }));
    await pg.evaluate(() => { window.__svgp.tvTest({ type: 'pbp', cap: { tag: 'P3', name: 'VALDEZ', sub: 'UP TO THIRD · +0.42 TO TANAKA' } }); });
    await pg.waitForTimeout(8000); // (the battle box goes after 7 s; then the caption)
    await pg.evaluate(() => { window.__svgp.tvTest({ type: 'pbp', cap: { tag: 'P3', name: 'VALDEZ', sub: 'UP TO THIRD · +0.42 TO TANAKA' } }); });
    await pg.waitForTimeout(1200); await pg.screenshot({ path: join(OUT, `${look}-6-cap.png`) });
    await pg.evaluate(() => { const s = window.__svgp.sim, a = s.order[0], c = s.order[1]; a.finishTime = 300; c.finishTime = 301.234; a.best = 81.2; a.led = 3; s.finishOrder.push(a, c); });
    for (let k = 0; k < 14; k++) { await pg.waitForTimeout(150); await pg.evaluate(() => window.__svgp.tvFrame()); }
    await pg.waitForTimeout(100); await pg.screenshot({ path: join(OUT, `${look}-7-winner-flying.png`) });
    await pg.waitForTimeout(1300); await pg.screenshot({ path: join(OUT, `${look}-8-winner.png`) });
    await pg.evaluate(() => window.__svgp.quitRace ? window.__svgp.quitRace() : null);
    console.log('shot', look);
  }
  await pg.close(); break;
  } catch (e) { console.log(look, 'retry:', e.message.split('\n')[0]); }
} finally { await b.close(); server.kill(); }
