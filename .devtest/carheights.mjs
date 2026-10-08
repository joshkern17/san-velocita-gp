// dev: each car's model size (bounding box height / length), as the chase camera sees it   node .devtest/carheights.mjs [ids]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const id of (process.argv[2] || 'transit,hearse,rs964,m1procar,mustang').split(',')) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 640, height: 360 });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
    await pg.evaluate(async (id) => { const t = await (await fetch('/.devtest/auburn2.json')).json(); window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id };
      window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, car: window.__svgp.settings.car }, 'menu'); }, id);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player, null, { timeout: 120000 }); await pg.waitForTimeout(4000);
    console.log(id.padEnd(10), await pg.evaluate(() => { const c = window.__svgp.sim.player, T = window.__svgp.THREE || null; const g = c.model.group; g.updateMatrixWorld(true);
      let y0 = Infinity, y1 = -Infinity; g.traverse(o => { if (o.isMesh && o.visible && o.geometry) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); y0 = Math.min(y0, bb.min.y); y1 = Math.max(y1, bb.max.y); } });
      return `car.y ${c.y.toFixed(2)}  top ${(y1 - c.y).toFixed(2)}  bottom ${(y0 - c.y).toFixed(2)}  wheelbase ${c.phys.spec ? (c.phys.spec.a + c.phys.spec.b).toFixed(2) : '?'}`; }));
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
