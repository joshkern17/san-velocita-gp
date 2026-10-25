// dev: the menu backdrop's cinematic shots (js/menucam.js): each shot forced in turn on the main menu, screenshotted.
//   node .devtest/menushots.mjs <outdir> [castIdx]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 });
  await pg.waitForTimeout(1500); await pg.click('#s-boot'); await pg.waitForTimeout(1500); await pg.evaluate(() => window.__svgp.show('s-main'));
  for (let k = 0; k < 6; k++) { await pg.waitForTimeout(5000); console.log(await pg.evaluate(() => { const s = window.__svgp.sim; return JSON.stringify({ scr: window.__svgp.screen, mode: s?.mode, state: s?.state, n: s?.cars?.length, mc: !!s?.menuCam, v: s?.cars?.map(c => Math.round(Math.hypot(c.phys.vx, c.phys.vz))) }); })); }
  await pg.waitForFunction(() => { const s = window.__svgp.sim; return s && s.mode === 'attract' && s.menuCam && s.cars.some(c => Math.hypot(c.phys.vx, c.phys.vz) > 20); }, null, { timeout: 90000 });
  await pg.waitForTimeout(4000);
  console.log('cast:', await pg.evaluate(() => window.__svgp.sim.cars.map(c => c.carId).join(' ')));
  for (const kind of ['side', 'headon', 'chase', 'duel', 'apex', 'detail', 'drone']) {
    const got = await pg.evaluate(async (kind) => {
      const s = window.__svgp.sim, M = s.menuCam;
      for (let tries = 0; tries < 40; tries++) {
        for (const c of s.cars) { if (!M.fit(c)) continue; const sh = M.make(kind, c); if (sh) { if (sh.hold < 8) sh.hold = 8; M.shot = sh; return c.carId; } }
        await new Promise(r => setTimeout(r, 250));
      }
      return null;
    }, kind);
    if (!got) { console.log(kind, ': no setup found'); continue; }
    await pg.waitForTimeout(kind === 'headon' || kind === 'apex' ? 2500 : 1800);
    const now = await pg.evaluate(() => { const S = window.__svgp.sim, M = S.menuCam, v = M.shot.car.model.group.position.clone().project(S.camera); return M.shot.kind + ' t=' + M.shot.t.toFixed(1) + ` subject at x ${((v.x + 1) / 2).toFixed(2)} y ${((1 - v.y) / 2).toFixed(2)}${v.z > 1 ? ' BEHIND' : ''}`; });
    console.log(kind, got, '->', now);
    await pg.screenshot({ path: join(out, `menu-${kind}.png`) });
  }
} finally { await b.close(); server.kill(); }
