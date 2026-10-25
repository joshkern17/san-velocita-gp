// Opens the pit garage with models/garage.glb and checks the hooks; screenshot to argv[2]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const shot = process.argv[2] || join(HERE, 'garage.png');
const track = JSON.parse(readFileSync(join(HERE, 'auburn2.json'), 'utf8')); delete track.hidden;
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  await pg.waitForTimeout(1000);
  await pg.evaluate((track) => window.__svgp.dbg.startWeekend(track, { mode: 'race', laps: 3, opponents: 3 }, 'setup'), track);
  await pg.waitForFunction(() => window.__svgp.screen === 's-pitgarage', null, { timeout: 120000 });
  await pg.waitForFunction(() => window.__svgp.dbg.pitGarage.custom, null, { timeout: 20000 });
  await pg.waitForTimeout(2500);
  console.log(JSON.stringify(await pg.evaluate(() => {
    const P = window.__svgp.dbg.pitGarage, names = [];
    P.room.traverse(o => { if (o.name) names.push(o.name); });
    return { custom: P.custom, roomZ: P.room.children[0].position.z, tyreBands: P.tyreBands.length, teamMats: P.teamMats.length,
      tyreColour: P.tyreBands[0] && P.tyreBands[0].material.color.getHexString(), teamColour: P.teamMats[0] && P.teamMats[0][0].color.getHexString(),
      guidesLeft: names.filter(n => n.startsWith('GUIDE')), tv: names.some(n => n.startsWith('TV_Screen')), band: names.some(n => n.startsWith('TeamBand')) };
  })));
  await pg.screenshot({ path: shot });
} finally { await b.close(); server.kill(); }
