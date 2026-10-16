// dev: where a clip puts the hands and hips over time (the character's own frame: +Z forward, y up), for timing
// props to it.   node .devtest/clipmeasure.mjs pit_off,pit_on [step]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const CLIPS = (process.argv[2] || 'pit_off,pit_on').split(','), STEP = +(process.argv[3] || 0.2);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  const out = await pg.evaluate(async ([CLIPS, STEP]) => {
    const THREE = await import('three'), C = await import('/js/characters.js');
    await C.loadCharacters();
    const ch = C.makeCharacter({ look: 'racer', clip: 'idle', seed: 1 }), o = ch.object, res = {};
    for (const clip of CLIPS) {
      ch.play(clip, { fade: 0, once: true }); const dur = ch.action.getClip().duration, rows = [];
      for (let t = 0; t <= dur + 1e-6; t += STEP) {
        ch.action.time = t; ch.mixer.update(0); o.updateMatrixWorld(true);
        const w = (n) => o.worldToLocal(ch.bone(n).getWorldPosition(new THREE.Vector3()));
        const l = w('LeftHand'), r = w('RightHand'), h = w('Hips'), m = l.clone().add(r).multiplyScalar(0.5);
        rows.push(`${t.toFixed(2)} hands (${m.x.toFixed(2)},${m.y.toFixed(2)},${m.z.toFixed(2)}) apart ${l.distanceTo(r).toFixed(2)} hips (${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)})`);
      }
      res[clip] = { dur: +dur.toFixed(2), rows };
    }
    return res;
  }, [CLIPS, STEP]);
  for (const [k, v] of Object.entries(out)) { console.log(k, 'duration', v.dur); for (const r of v.rows) console.log('  ' + r); }
} finally { await b.close(); server.kill(); }
