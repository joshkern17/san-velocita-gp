import { spawn } from 'child_process'; import fs from 'fs';
const ROOT = '/Users/joshkern/Downloads/Racing Game', OUT = process.argv[2], TRK = process.argv[3] || '/.devtest/auburn2.json', CROP = process.argv[4] || '', CAR = process.argv[5] || 'm1procar';
const { chromium } = await import(ROOT + '/tools/node_modules/playwright-core/index.mjs');
const PORT = 8990 + Math.floor(Math.random() * 9);
const server = spawn('python3', [ROOT + '/serve.py', String(PORT), '--no-browser'], { stdio: 'ignore', cwd: ROOT });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1800, height: 1400 } });
  await pg.goto(`http://127.0.0.1:${PORT}/.devtest/handling.html`); await pg.waitForTimeout(1200);
  const info = await pg.evaluate(async ([TRK, CROP, CAR]) => {
    const { sampleTrack, computeRacingLine } = await import('/js/track.js');
    const t = TRK.startsWith('preset:') ? (await import('/js/track.js')).presetTracks()[+TRK.slice(7)] : await (await fetch(TRK)).json();
    const T = sampleTrack(t), O = computeRacingLine(T);
    const RL = await import('/js/raceline.js?' + Date.now()), { CARS } = await import('/js/cars.js');
    const res = {};
    for (const id of CAR.split(',')) { const car = RL.lineCar(CARS[id].spec); const t0 = performance.now(); const r = RL.fastLine(T, O, car, { budgetMs: 60000 }); res[id] = { from: +r.from.toFixed(2), to: +r.time.toFixed(2), evals: r.evals, check: +RL.lineTime(T, r.O, car).toFixed(2), ms: Math.round(performance.now() - t0), O: r.O }; }
    const F = res[CAR.split(',')[0]].O;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    const [c0, c1] = CROP ? CROP.split(':').map(Number) : [0, T.N - 1];
    for (let i = c0; i <= c1; i++) { x0 = Math.min(x0, T.X[i]); x1 = Math.max(x1, T.X[i]); z0 = Math.min(z0, T.Z[i]); z1 = Math.max(z1, T.Z[i]); }
    const pad = CROP ? 15 : 30, W = x1 - x0 + 2 * pad, H = z1 - z0 + 2 * pad, sc = Math.min(1800 / W, 1400 / H);
    const P = (x, z) => `${((x - x0 + pad) * sc).toFixed(1)},${((z - z0 + pad) * sc).toFixed(1)}`;
    const path = (f) => { let d = ''; for (let i = 0; i <= T.N; i++) { const j = i % T.N, [o] = [f(j)]; d += (i ? 'L' : 'M') + P(T.X[j] + T.RX[j] * o, T.Z[j] + T.RZ[j] * o); } return d; };
    let tk = ''; for (let i = 0; i < T.N; i += Math.round((CROP ? 20 : 100) / T.ds)) { const [x, y] = P(T.X[i], T.Z[i]).split(','); tk += `<text x="${x}" y="${y}" font-size="11" fill="#06c">${i}</text>`; }
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1400" style="background:#fff"><path d="${path(j => T.W[j] / 2)}" fill="none" stroke="#000"/><path d="${path(j => -T.W[j] / 2)}" fill="none" stroke="#000"/><path d="${path(j => O[j])}" fill="none" stroke="red" stroke-width="1.5"/><path d="${path(j => F[j])}" fill="none" stroke="#0a0" stroke-width="2"/>${tk}</svg>`;
    document.body.style.margin = 0;
    for (const k in res) delete res[k].O;
    return { res, N: T.N, ds: T.ds, L: T.L, name: t.name, wmin: Math.min(...T.W), wmax: Math.max(...T.W) };
  }, [TRK, CROP, CAR]);
  console.log(JSON.stringify(info));
  await pg.screenshot({ path: OUT });
} finally { await b.close(); server.kill(); }
