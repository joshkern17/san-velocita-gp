// dev: the pit building styles (tools/props/pitstyles.py, js/pitboxes.js styledFront) on a real circuit's pit lane:
// for each style, the garages from the pit lane, from across the track, from the paddock behind, and an end.
//   .devtest/guard.sh -m 6000 -t 900 node .devtest/pitstyleshot.mjs <outdir> [Track name] [styles=classic,modern,...]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [out, TRACK = 'Spa-Francorchamps', STY = 'classic,modern,heritage,shed,terrace'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const style of STY.split(',')) {
    const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
    await pg.addInitScript(() => { navigator.getGamepads = () => []; });
    pg.on('pageerror', e => console.log('PAGE ERROR', style, e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    await pg.evaluate(async ({ TRACK, style }) => {
      const real = (await (await fetch('/tracks/real/index.json')).json()).find(q => q.name === TRACK);
      real.env.weather = 'clear'; real.env.time = 'day'; if (style !== 'classic') real.env.pitStyle = style;
      window.__svgp.startRace(real, { mode: 'race', laps: 1, opponents: 7, grid: 'front', car: window.__svgp.settings.car }, 'menu');
    }, { TRACK, style });
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.world, null, { timeout: 300000 });
    await pg.waitForTimeout(4000);
    await pg.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
    await pg.evaluate(() => { const s = window.__svgp.sim, r = s.render; s.render = function (...a) { const c = window.__shot; if (c) { this.camera.position.set(...c.p); this.camera.lookAt(...c.l); this.camera.fov = c.fov || 64; this.camera.updateProjectionMatrix(); } return r.apply(this, a); }; });
    const views = await pg.evaluate(async () => {
      const { pitSlots, boxFrame } = await import('/js/pitboxes.js');
      const sim = window.__svgp.sim, T = sim.T, A = sim.A, pit = A.pit, L = pitSlots(T, A, pit), n = L.slots.length;
      const mid = L.slots[Math.floor(n / 2)], F = boxFrame(T, A, pit, mid.k >= 0 ? mid.k : (pit.boxes || []).length >> 1) || null;
      const S = L.slots.map(s => s), first = S[0], last = S[S.length - 1];
      const fr = (s) => { const pa = L.G[0]; return s; };
      // frames via boxFrame where possible; else from the slot's own (k -1): a direct import of frameOf isn't exported
      const any = (k) => boxFrame(T, A, pit, k);
      const Fm = F || any(0); if (!Fm) return [];
      const o = Fm.P(0, 0, 0), n2 = Fm.n;
      const v = [];
      v.push({ name: 'lane', p: Fm.P(-34, -9, 2.2), l: Fm.P(-4, 4, 6) });
      v.push({ name: 'across', p: Fm.P(-10, -60, 7), l: Fm.P(0, 6, 7), fov: 58 });
      v.push({ name: 'paddock', p: Fm.P(22, 48, 9), l: Fm.P(0, 12, 6), fov: 60 });
      // an end of the block: from the first garage's frame, out beyond its left end
      const F0 = any(0) || Fm;
      v.push({ name: 'end', p: F0.P(F0.x0 - 60, -12, 8), l: F0.P(F0.x0 + 10, 8, 6), fov: 56 });
      return v;
    });
    for (const v of views) {
      await pg.evaluate((v) => { window.__shot = v; }, v);
      await pg.waitForTimeout(700);
      await pg.screenshot({ path: join(out, `${style}-${v.name}.png`) });
    }
    console.log(style, views.length, 'shots');
    await pg.close();
  }
} finally { await b.close(); server.kill(); }
