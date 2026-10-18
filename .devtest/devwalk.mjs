// dev: Development > Walk The Lock-up / Unit / Workshop: each opens and puts you on your feet (walk.active), and in the
// workshop the cabinet has its trophies, the photos their seasons, and the setup pad's scales sit under the car's wheels.
// Shots to argv[2].   node .devtest/devwalk.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8690 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0; const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };
const g = (x, y, z) => ({ x: x + 8.0, y: z, z: -y - 3.0 - 6.5 });   // (Blender in the workshop -> the room)
try {
  for (const prem of ['lockup', 'unit', 'workshop']) {
    const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await pg.addInitScript(() => { navigator.getGamepads = () => []; });
    pg.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    await pg.evaluate((p) => window.__svgp.dbg.devWalkGarage(p), prem);
    const ok = await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 40000 }).then(() => true, () => false);
    const st = await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit; return { custom: P.custom, shell: k && k.shell, troph: k ? k.trophies.length : 0, inCab: P.memGroup ? P.memGroup.children.length : 0,
      note: k && k.trophyNote.length ? k.trophyNote.every(o => o.visible) : null, photos: k ? k.photos.map(p => p.pic.visible) : [] }; });
    check(ok && st.shell === prem, `${prem}: walking (${JSON.stringify(st)})`);
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: join(out, `devwalk-${prem}.png`) });
    if (prem === 'workshop') {
      await pg.waitForTimeout(1500);
      const pads = await pg.evaluate(() => { const P = window.__svgp.dbg.pitGarage, k = P.kit, V = P.camera.position.constructor, v = new V();
        const wh = P.car.wheels.map(w => { (w.pivot || w.mesh).getWorldPosition(v); return [v.x, v.z]; });
        const pd = k.scalePads.map(p => { p.getWorldPosition(v); return [v.x, v.z]; });
        return { off: wh.map(([x, z]) => Math.min(...pd.map(([a, c]) => Math.hypot(a - x, c - z)))), cables: P.padCables ? P.padCables.children.length : 0 }; });
      check(pads.off.every(d => d < 0.05) && pads.cables === 4, `scales under the wheels: off by ${pads.off.map(d => d.toFixed(3)).join(', ')} m, ${pads.cables} cables`);
      await pg.evaluate(() => { const w = window.__svgp.dbg.walk; w.active && window.__svgp.dbg.pitGarage; });
      // look at the cabinet and the pad from the Blender positions (stop walking first: the camera's ours)
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(1200);
      for (const [n, pos, at] of [['cabinet', g(9.6, -6.0, 1.5), g(12, -6.0, 1.2)], ['cabinet-close', g(10.7, -5.4, 1.25), g(12, -5.9, 0.9)], ['photos', g(10.6, -7.6, 1.5), g(12, -8.2, 1.45)],
        ['pad', g(-5.6, -8.0, 2.4), g(-8, -3.5, 0)], ['pad-readout', g(-9.0, -6.6, 1.5), g(-10.05, -5.6, 1.0)], ['pad-trolley', g(-7.0, -0.2, 1.6), g(-8.2, 1.25, 0.9)]]) {
        await pg.evaluate(({ pos, at }) => { const P = window.__svgp.dbg.pitGarage, V = P.camera.position.constructor; P.cine({ pos: new V(pos.x, pos.y, pos.z), at: new V(at.x, at.y, at.z), fov: 55, shift: 0 }, 0); }, { pos, at });
        await pg.waitForTimeout(500); await pg.evaluate(() => { const m = document.getElementById('s-homeview'); if (m) m.style.visibility = 'hidden'; });
        await pg.screenshot({ path: join(out, `devwalk-ws-${n}.png`) });
      }
    }
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
