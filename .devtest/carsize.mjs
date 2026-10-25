// dev: each car model's plan-view size on screen (length front / rear of the centre of mass, half width), next to the
// contact box contact.js gives its physics (bodyBox)
//   node .devtest/carsize.mjs [car ...]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = process.env.ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['f1', 'svgp', 'm1procar', 'porsche935', 'aventus', 'bx300', 'rmx', 'testarossa', 'jsport', 'rs964', 'm3gtr', 'mustang', 'm5', 'civic', 'transit', 'hearse'];
try {
  for (const id of ids) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 480, height: 270 });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await pg.waitForTimeout(1000);
    const t = await pg.evaluate(async () => { const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear'; return t; });
    await pg.evaluate(([t, id]) => { window.__svgp.settings.car = { ...window.__svgp.settings.car, chassis: id }; window.__svgp.startRace(t, { mode: 'test', laps: 1, opponents: 0, car: window.__svgp.settings.car }, 'menu'); }, [t, id]);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.player && window.__svgp.screen === 'hud', null, { timeout: 120000 }).catch(() => {});
    await pg.waitForTimeout(+(process.env.WAIT || 1500)); // (GLB models load in after)
    const r = await pg.evaluate(async (process_LOOSE) => {
      const { bodyBox } = await import('/js/contact.js');
      const car = window.__svgp.sim.player, g = car.model.group, p = car.phys;
      // the model in the car's own frame: measure every mesh's corners
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert();
      g.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.visible || (o.material.transparent && !process_LOOSE) || o.material.depthWrite === false) return; // (not the shadow blob or the glows)
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox, m = inv.clone().multiply(o.matrixWorld), v = bb.min.clone();
        for (let k = 0; k < 8; k++) {
          v.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(m);
          if (v.y < -0.5 || v.y > 3) continue;
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
        }
      });
      const B = bodyBox(p.p);
      return `model front ${maxZ.toFixed(2)} rear ${(-minZ).toFixed(2)} half-width ${((maxX - minX) / 2).toFixed(2)} (x ${minX.toFixed(2)}..${maxX.toFixed(2)})  |  box front ${B.f.toFixed(2)} rear ${B.r.toFixed(2)} half-width ${B.w.toFixed(2)}`;
    }, !!process.env.LOOSE);
    console.log(id.padEnd(11), r);
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
