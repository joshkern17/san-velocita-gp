// dev: a real circuit's surroundings from above at its named corners, runoff as the real map has it vs the old guess
//   node .devtest/realshot.mjs <outdir> [id=spa] [names=La Source,Raidillon,...] [STYLES=real,mixed] [H=45] [BACK=40]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp', id = process.argv[3] || 'spa';
const names = (process.argv[4] || 'La Source,Raidillon,Les Combes,Pouhon,Chicane').split(',');
const styles = (process.env.STYLES || 'real,mixed').split(',');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 960, height: 540 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
  for (const style of styles) {
    await pg.evaluate(async ([id, style, TIME, LINE]) => {
      const R = await import('./js/realtracks.js'); await R.realTracksReady();
      const light = R.realTracks().find(t => t.real.id === id);
      const t = await R.hydrateReal(JSON.parse(JSON.stringify(light)));
      t.env.runoffStyle = style; t.env.weather = 'clear'; t.env.time = TIME;
      if (LINE) window.__svgp.settings.racingLine = 'full'; // (LINE=1: the racing line drawn)
      window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 0, grid: 'front', car: window.__svgp.settings.car }, 'menu');
    }, [id, style, process.env.TIME || 'day', !!process.env.LINE]);
    await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.T && window.__svgp.sim.player, null, { timeout: 180000 });
    await pg.waitForTimeout(1500);
    if (await pg.evaluate(() => !!window.__svgp.sim.track.refModel)) {
      const t0 = Date.now();
      await pg.waitForFunction(() => window.__svgp.sim.world.root.getObjectByName('refModel'), null, { timeout: 300000 });
      console.log(`reference model loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s`); await pg.waitForTimeout(1500);
    }
    console.log(style, await pg.evaluate(async () => {
      const s = window.__svgp.sim, T = s.T, A = s.A, R = await import('./js/runoff.js');
      const RW = R.realWallOffsets(T, s.track.osm && s.track.osm.walls, A.hash, Math.ceil(40 / T.ds), 4, R.surfaceGrid(s.track.osm && s.track.osm.surface));
      if (!RW) return 'no mapped barriers';
      const cov = RW.map(a => Math.round(100 * a.filter(v => v === v).length / T.N));
      const q = (a) => { const v = [...a].filter(x => x === x).map((x, i) => x).sort((x, y) => x - y); return v.length ? [0.1, 0.5, 0.9].map(p => v[Math.floor(v.length * p)].toFixed(0)).join('/') : '-'; };
      return `mapped barrier cover L ${cov[0]}% R ${cov[1]}% · offset p10/50/90 L ${q(RW[0])} R ${q(RW[1])} m · pit ${A.pit ? `${A.pit.real ? 'REAL ' : ''}side ${A.pit.side}, ${Math.round(A.pit.start * T.ds)} -> ${Math.round(A.pit.end * T.ds)} m (${Math.round(A.pit.length)} m), ramps ${Math.round(A.pit.nRamp * T.ds)} m, boxes ${A.pit.boxes.map(b => Math.round(b * T.ds)).join(',')}, lane at ${A.pit.CEN[A.pit.boxes[0]].toFixed(1)} m, wall ${A.pit.WALL[A.pit.boxes[0]].toFixed(1)} m` : 'none'}`;
    }));
    if (process.env.EVAL) console.log('EVAL', JSON.stringify(await pg.evaluate(new Function('return (async () => {' + process.env.EVAL + '})()'))));   // (EVAL='js': run in the race's page, its result printed)
    for (const name of names) {
      const ok = await pg.evaluate(([name, H, BACK, CHASE, BACKXZ]) => {
        const s = window.__svgp.sim, T = s.T, N = T.N, pit = s.pit || s.A.pit;
        // (PIT0..PIT11: the car in that garage box; PITIN / PITOUT: the lane's ends)
        const pm = /^PIT(\d+|IN|OUT)$/.exec(name);
        if (pm && pit) {
          const b = pm[1] === 'IN' ? (pit.start + Math.round(pit.nRamp * 0.6)) % N : pm[1] === 'OUT' ? (pit.end - Math.round(pit.nRamp * 0.6) + N) % N : pit.boxes[+pm[1]];
          const pl = s.player, p = pl.phys, o = pit.CEN[b] * pit.side; s.paused = true; s.state = 'racing'; pl.idx = b;
          p.place(T.X[b] + T.RX[b] * o, T.Z[b] + T.RZ[b] * o, Math.atan2(T.FX[b], T.FZ[b])); p.vx = p.vz = 0; p.u = 0;
          s.updateTracker(pl, true); s.placeModel(pl, 1); s.snapCamera(); for (let k = 0; k < 30; k++) s.updateCamera(0.05);
          return true;
        }
        // (XZx/z: looking at that spot from the nearest bit of track, H m up: placed props, stands)
        const xz = /^XZ(-?[\d.]+)\/(-?[\d.]+)$/.exec(name);
        if (xz) {
          const x = +xz[1], z = +xz[2]; let bi = 0, bd = Infinity; for (let k = 0; k < N; k++) { const d = Math.hypot(T.X[k] - x, T.Z[k] - z); if (d < bd) { bd = d; bi = k; } }
          const dx = T.X[bi] - x, dz = T.Z[bi] - z, l = Math.hypot(dx, dz) || 1, y = T.Y[bi];
          s.paused = true; s.state = 'racing'; const c = s.camera; s.updateCamera = () => {};
          const back = BACKXZ; c.position.set(x + dx / l * (l + back), y + H, z + dz / l * (l + back)); c.lookAt(x, y, z); c.updateMatrixWorld();
          return true;
        }
        // (@1234: that far round the lap, in metres, for a circuit without corner names)
        const sec = /^@\d+$/.test(name) ? { from: +name.slice(1), to: +name.slice(1) } : (s.track.real.names || []).find(n => n.name === name);
        if (!sec) return false;
        const i = Math.round(((sec.from + sec.to) / 2) / T.ds) % N, j = (i - Math.round(BACK / T.ds) + N) % N;
        s.paused = true; s.state = 'racing';
        if (CHASE) { // the player's car on the line there, seen from the chase camera
          const pl = s.player, p = pl.phys; pl.idx = j;
          p.place(T.X[j], T.Z[j], Math.atan2(T.FX[j], T.FZ[j])); p.vx = p.vz = 0; p.u = 0;
          s.updateTracker(pl, true); s.placeModel(pl, 1); s.snapCamera(); for (let k = 0; k < 30; k++) { s.updateCamera(0.05); if (s.updateRacingLine) s.updateRacingLine(0.05); }
          return true;
        }
        const c = s.camera; s.updateCamera = () => {};
        c.position.set(T.X[j] - T.FX[i] * 10, T.Y[i] + H, T.Z[j] - T.FZ[i] * 10); c.lookAt(T.X[i], T.Y[i], T.Z[i]);
        c.updateMatrixWorld();
        return true;
      }, [name, +(process.env.H || 45), +(process.env.BACK || 40), !!process.env.CHASE, +(process.env.BACKXZ || 30)]); // (BACKXZ: how far behind the track an XZ shot stands)
      if (!ok) { console.log('no section', name); continue; }
      await pg.addStyleTag({ content: '*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
      await pg.waitForTimeout(700);
      await pg.screenshot({ path: join(out, `${id}-${name.replace(/\W+/g, '_')}-${style}${process.env.CHASE ? '-chase' : ''}.png`) });
    }
    await pg.evaluate(() => { const s = window.__svgp.sim; if (s && s.dispose) s.dispose(); });
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  }
} finally { await b.close(); server.kill(); }
