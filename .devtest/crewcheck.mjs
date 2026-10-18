// dev: js/homecrew.js, measured (no screenshots): over ~40 s of the Home Garage preview (the unit, everything bought and
// in use, the crew on), every frame someone's on their way somewhere but not walking (a dip into the next clip), and
// every kneel: is there something solid a hand's reach in front at knee height? PREMISES=unit|lockup.
//   node .devtest/crewcheck.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate((p) => { const d = window.__svgp.dbg; d.openHomeView(); d.homeView({ premises: p, fac: { tools: 2, dyno: 1, fab: 1, sim: 1, data: 1 }, car2: true, crew: true, busy: true }); }, process.env.PREMISES || 'unit');
  await pg.waitForFunction(() => { const h = window.__svgp.dbg.pitGarage.homeCrew; return !!(h && h.ready && h.floors); }, null, { timeout: 120000, polling: 500 });
  await pg.evaluate(() => {
    const h = window.__svgp.dbg.pitGarage.homeCrew, T = window.__crew = { frames: 0, dips: 0, walkFrames: 0, kneels: {}, bad: {} };
    const u = h.update.bind(h);
    h.update = (dt) => {
      u(dt); T.frames++;
      for (const p of h.people) {
        if (p.path.length) { T.walkFrames++; if (p.ch.clip !== 'move' && p.ch.clip !== 'walk_text') T.dips++; }
        if (!p.path.length && /^kneel/.test(p.ch.clip || '') && p.spot) {
          const k = `${p.role}@${p.spot.st || p.spot.role}(${p.spot.x.toFixed(1)},${p.spot.z.toFixed(1)})`;
          if (T.kneels[k]) continue; T.kneels[k] = 1;
          const ax = p.x + Math.sin(p.yaw) * 0.55, az = p.z + Math.cos(p.yaw) * 0.55, ay = p.y + 0.35;
          const P = window.__svgp.dbg.pitGarage, B = new (Object.getPrototypeOf(new P.camera.position.constructor()).constructor === Object ? Object : Object)();
          let hit = false; P.room.traverse(o => { if (hit || !o.isMesh || !o.visible || /^(NAV|WALK|COL)_/.test(o.name)) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (ax > bb.min.x && ax < bb.max.x && az > bb.min.z && az < bb.max.z && ay > bb.min.y - 0.05 && ay < bb.max.y + 0.2) hit = true; });
          for (const c of [P.car, P.car2]) if (!hit && c && c.group.visible) c.group.traverse(o => { if (hit || !o.isMesh || o === c.shadow) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (ax > bb.min.x && ax < bb.max.x && az > bb.min.z && az < bb.max.z) hit = true; });
          // (inside a car: stood where the car is)
          let inside = false; for (const c of [P.car, P.car2]) if (c && c.group.visible) c.group.traverse(o => { if (inside || !o.isMesh || o === c.shadow) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (p.x > bb.min.x + 0.1 && p.x < bb.max.x - 0.1 && p.z > bb.min.z + 0.1 && p.z < bb.max.z - 0.1 && bb.max.y - bb.min.y > 0.3) inside = true; });
          if (!hit || inside) T.bad[k] = inside ? 'inside a car' : 'nothing in front';
        }
      }
    };
  });
  await pg.waitForTimeout(40000);
  const T = await pg.evaluate(() => window.__crew);
  console.log(`frames ${T.frames}, walking ${T.walkFrames} person-frames, dips ${T.dips}`);
  console.log('kneels:', Object.keys(T.kneels).join('  ') || '(none)');
  console.log('bad kneels:', JSON.stringify(T.bad));
} finally { await b.close(); server.kill(); }
