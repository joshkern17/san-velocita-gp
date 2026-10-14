// dev: the rival teams' liveries (js/teamliveries.js) on the garage turntable, each on a few cars, 3/4 and side on.
//   node .devtest/teamliveries.mjs <outdir> [team,team,...] [chassis,chassis,...]
// writes <outdir>/<team>_<chassis>_<view>.png and sheet.png (one row per team)
import { spawn, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 9800 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const shots = [];
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 860 });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  const teams = process.argv[3] ? process.argv[3].split(',') : await pg.evaluate(async () => Object.keys((await import('./js/teamliveries.js')).TEAM_LIVERIES));
  const cars = (process.argv[4] || 'custom,m1procar,porsche935,civic').split(',');
  await pg.evaluate(() => window.__svgp.open.garage()); await pg.waitForTimeout(2500);
  // (the racer stands aside: he's in front of the car side on)
  for (const team of teams) {
    const row = [];
    for (const car of cars) {
      await pg.evaluate(async ([team, car]) => {
        const { teamCar } = await import('./js/carmodel.js'), { TEAMS } = await import('./js/car.js');
        const t = TEAMS.find(x => x.name === team) || { name: team, main: 0x888888, accent: 0x222222, helmet: 0xffffff };
        const cfg = { ...teamCar(t, 3), chassis: car, showNumber: true, showSponsor: true };
        window.__svgp.garage.setCar(cfg);
      }, [team, car]);
      await pg.waitForTimeout(3500);
      for (const v of ['three', 'left']) {
        await pg.evaluate((v) => { const G = window.__svgp.garage; G.table.rotation.y = 0; G.view(v); if (G.driver) G.driver.visible = false; if (G.racer) G.racer.object.visible = false; }, v);
        await pg.waitForTimeout(250);
        const f = join(out, `${team.replace(/\W+/g, '-')}_${car}_${v}.png`);
        await pg.screenshot({ path: f, clip: { x: 470, y: 170, width: 930, height: 540 } });
        row.push(f);
      }
    }
    shots.push(row);
  }
} finally { await b.close(); server.kill(); }
// one row per team: each car 3/4 then side (montage's exit code is no use: it fails on a missing label font)
const rows = shots.map((r, i) => { const f = join(out, `row${i}.png`); spawnSync('montage', [...r, '-geometry', '420x243+2+2', '-tile', `${r.length}x1`, '-background', '#000', f]); return f; });
spawnSync('montage', [...rows, '-geometry', '+0+0', '-tile', '1x', '-background', '#000', join(out, 'sheet.png')]);
console.log(fails ? `${fails} FAILED` : 'wrote ' + join(out, 'sheet.png'));
process.exit(fails ? 1 : 0);
