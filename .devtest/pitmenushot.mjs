// dev: the race's pit menu with damage to choose from (Realistic damage): as it opens, and with one part left
//   node .devtest/pitmenushot.mjs <outdir> [car]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.', CAR = process.argv[3] || 'm1procar';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate(async (c) => { const S = window.__svgp.settings; S.damage = 'high'; S.car = { ...S.car, chassis: c };
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0, car: S.car }, 'menu'); }, CAR);
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player && window.__svgp.sim.lineV, null, { timeout: 240000 });
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(() => { const s = window.__svgp.sim, pl = s.player, p = pl.phys; s.state = 'racing';
    p.dmg.fw = 0.4; p.addBend(1, 0.3); p.dmg.rad = 0.06; p.gbHurt(0.5);
    const fix = {}; for (const x of s.pitParts(pl)) fix[x.k] = x.dmg > 0.08;
    pl.pitReq = { tyre: 'medium', repair: fix }; pl.pitting = true; pl.pitPhase = 'in'; s.pitUpdate = () => {}; // (held in its pit approach for the shot)
    return { parts: s.pitParts(pl).map(x => x.k + ' ' + x.dmg.toFixed(2) + ' ' + x.secs.toFixed(1)), est: s.serviceTime(pl).toFixed(1) }; });
  console.log(JSON.stringify(r));
  await pg.waitForTimeout(800); await pg.screenshot({ path: join(OUT, 'pitmenu.png') });
  const key = async (k) => { await pg.keyboard.down(k); await pg.waitForTimeout(110); await pg.keyboard.up(k); await pg.waitForTimeout(200); };
  await key('ArrowDown'); await key('ArrowDown'); await key('ArrowRight'); await pg.waitForTimeout(600);
  console.log(await pg.evaluate(() => { const s = window.__svgp.sim, pl = s.player; return JSON.stringify({ repair: pl.pitReq.repair, est: s.serviceTime(pl).toFixed(1) }); }));
  await pg.screenshot({ path: join(OUT, 'pitmenu2.png') });
} finally { await b.close(); server.kill(); }
