// dev: a 24-car multiclass Quick Race: the field fills (the extra rival teams), the tower's two views (your class / the
// whole field, Tab) and its cut (leaders, then the cars round you) fit the column   node .devtest/bigfield.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = join(ROOT, '.devtest/out');
let bad = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); bad++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  // the cut on its own
  const cut = await pg.evaluate(async () => {
    const { towerCut } = await import('/js/hud.js'), R = (n, me) => Array.from({ length: n }, (_, k) => ({ pos: k + 1, isPlayer: k === me }));
    const f = (a) => a.map(x => typeof x === 'number' ? `(${x})` : x.pos + (x.isPlayer ? '*' : '')).join(' ');
    return [f(towerCut(R(10, 5), 12)), f(towerCut(R(24, 4), 12)), f(towerCut(R(24, 15), 12)), f(towerCut(R(24, 23), 12))];
  });
  cut.forEach(c => console.log('     cut: ' + c));
  check(cut.slice(1).every(c => c.split(' ').length <= 12) && cut[2].startsWith('1 2 3 (') && cut[2].includes('16*') && cut[3].endsWith('24*'), 'tower cut: leaders, then round you, in 12 lines');
  await pg.evaluate(async () => {
    const t = (await import('/js/track.js')).presetTracks().find(t => t.name === 'Maple Ridge GP'); t.env.weather = 'clear';
    window.__autopilot = true; window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: 'm3gtr' };
    window.__svgp.startRace(t, { mode: 'race', laps: 5, opponents: 23, grid: 'back', car: window.__svgp.settings.car, extra: { car: window.__svgp.settings.car, mixCls: { cls: 'gt1' }, strategy: false } }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.state === 'racing' && window.__svgp.sim.player, null, { timeout: 240000 });
  const f = await pg.evaluate(() => { const s = window.__svgp.sim; return { n: s.cars.length, teams: new Set(s.cars.map(c => c.team.name)).size, names: new Set(s.cars.map(c => c.name)).size, cls: [...new Set(s.cars.map(c => c.cls))] }; });
  check(f.n === 24 && f.teams === 24 && f.names === 24 && f.cls.length === 2, `24 cars, each its own team and driver, two classes: ${JSON.stringify(f)}`);
  const t0 = Date.now();
  await pg.evaluate(() => { const s = window.__svgp.sim; for (let k = 0; k < 60 * 60; k++) s.update(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, {}); });
  console.log(`     60 s of race stepped in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await pg.waitForTimeout(1200);
  const tower = () => pg.evaluate(() => { const t = document.getElementById('h-tower'), col = t.parentElement.getBoundingClientRect(), r = t.getBoundingClientRect();
    return { head: t.querySelector('.h .n').textContent, rows: t.querySelectorAll('.r:not(.sep)').length, seps: t.querySelectorAll('.r.sep').length, me: !!t.querySelector('.r.me'), fits: r.bottom <= col.bottom }; });
  let a = await tower(); check(a.me && a.fits && a.head !== 'ALL', 'class view: ' + JSON.stringify(a));
  await pg.screenshot({ path: join(out, 'bigfield-class.png') });
  await pg.keyboard.press('Tab'); await pg.waitForTimeout(1200);
  a = await tower(); check(a.me && a.fits && a.head === 'ALL', 'whole field view: ' + JSON.stringify(a));
  await pg.screenshot({ path: join(out, 'bigfield-all.png') });
  // a short window: the cut
  await pg.setViewportSize({ width: 1280, height: 560 }); await pg.waitForTimeout(2500);
  a = await tower(); check(a.me && a.fits && a.seps > 0, 'short window, cut to fit: ' + JSON.stringify(a));
  await pg.screenshot({ path: join(out, 'bigfield-cut.png') });
  await pg.keyboard.press('Tab'); await pg.waitForTimeout(400);
} finally { await b.close(); server.kill(); }
console.log(bad ? `${bad} FAILED` : 'ALL OK'); process.exit(bad ? 1 : 0);
