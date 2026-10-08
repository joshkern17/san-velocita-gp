// Frame-time profile of a race (needs Chrome + tools/node_modules: cd tools && npm install). Starts its own server.
//
//   node .devtest/perf.mjs [track.json] [seconds] [car]   default .devtest/auburn2.json (the user's heavily decorated
//                                                          circuit), 20 s, m3gtr
// Options (environment): PROFILE=1 top JS functions · DIAG=1 scenery batches drawn per category · DIAG=2 the model
// library's materials / triangles · KINDS=1 meshes by material · SET='{"shadows":false}' game settings for the run ·
// HIDE='o => ...' hide matching objects · SHOTS=prefix screenshots from fixed cameras (compare looks before / after)
// DRIFT=1 the drift scorer gets a scripted slide every 3.5 s (HUD cost: "frames over 24 ms" near chain starts and
// elsewhere) · DRIFT=real the autopilot flicks the handbrake (smoke, skids and all) · CSS='...' extra page styles ·
// REWARM=1 run the shader warm-up again at the start and report what it still had to compile.
// Any shader compiled mid-race is listed with the object that needed it (should be none: Race.warmUp).
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools', 'node_modules', 'playwright-core', 'index.mjs'));
const [file = join(HERE, 'auburn2.json'), secs = '20', car = 'm3gtr'] = process.argv.slice(2);
const track = JSON.parse(readFileSync(file, 'utf8')); delete track.hidden;
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await pg.waitForTimeout(1500);
  const t0 = Date.now();
  await pg.evaluate(async ({ track, car, set }) => {
    const G = window.__svgp; Object.assign(G.settings, set); (await import('/js/world.js')).setWorldOptions({ shadows: G.settings.shadows }); G.settings.drift = 'on'; G.settings.car = { ...G.settings.car, chassis: car };
    G.startRace(track, { mode: 'test', laps: 9, opponents: 0 }, 'setup');
  }, { track, car, set: JSON.parse(process.env.SET || '{}') }); // (SET='{"shadows":false}': game settings for the run)
  await pg.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 120000 });
  const load = (Date.now() - t0) / 1000;
  await pg.waitForTimeout(1500);
  if (process.env.REWARM) await pg.evaluate(() => { window.__rewarm = true; });
  pg.on('console', m => { if (/second warm-up/.test(m.text())) console.log(m.text()); });
  if (process.env.DRIFT) await pg.evaluate(([mode, css]) => { if (mode === 'real') window.__driftReal = true; else window.__driftScript = true; if (css) document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`); }, [process.env.DRIFT, process.env.CSS || '']); // (CSS='...': extra rules, e.g. to hide parts of the HUD)
  if (process.env.HIDE) await pg.evaluate((f) => { window.__hide = eval(f); }, process.env.HIDE); // (HIDE='o => ...': hide matching objects)
  if (process.env.SHOTS) { // SHOTS=prefix: fixed camera views round the circuit, to compare looks before / after a change
    const views = [[0.1, 2.5, 0], [0.3, 6, 0], [0.55, 40, 60], [0.8, 15, 25]]; // [lap fraction, height, offset to the side]
    for (let v = 0; v < views.length; v++) {
      await pg.evaluate(([f, h, off]) => {
        const sim = window.__svgp.sim, T = sim.T, i = Math.floor(f * T.N), j = (i + Math.round(60 / T.ds)) % T.N;
        const x = T.X[i] + T.RX[i] * off, z = T.Z[i] + T.RZ[i] * off;
        sim.updateCamera = function () { this.camera.position.set(x, T.Y[i] + h, z); this.camera.lookAt(T.X[j], T.Y[j] + 1, T.Z[j]); };
      }, views[v]);
      await pg.waitForTimeout(700); await pg.screenshot({ path: `${process.env.SHOTS}${v}.png` });
    }
  }
  let cdp = null;
  if (process.env.PROFILE) { cdp = await pg.context().newCDPSession(pg); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const r = await pg.evaluate(async (secs) => {
    const G = window.__svgp, sim = G.sim, R = G.post.r, gl = R.getContext(), px = new Uint8Array(4);
    sim.player.autoT = 1e9; // the AI drives your car
    // (DRIFT=1: the drift scorer is fed a scripted slide every 3.5 s, 1.5 s long, so chains start / bank on cue)
    // (DRIFT=real: the autopilot flicks the handbrake every 4 s for a real slide: smoke, skids, squeal and all)
    if (window.__driftReal) {
      const ai0 = sim.aiControlsFor.bind(sim); let ht = 0;
      sim.aiControlsFor = (car, dt) => { const c = ai0(car, dt); if (!car.isPlayer) return c; car.phys.aid = { abs: true, tc: 0, stab: false, cs: 0, steer: false, brake: false }; ht += dt; const k = ht % 4; if (k < 0.35) { c.handbrake = 1; c.steer = (c.steer || 0) < 0 ? -1 : 1; } if (k < 1.6) c.throttle = 1; return c; };
    } else if (window.__driftScript && sim.drift) {
      const D = sim.drift, up = D.update.bind(D); let ct = 0;
      D.update = (dt, car, racing) => { ct += dt; const k = ct % 3.5, sl = k < 1.5 ? 0.6 : 0; up(dt, { phys: { u: 25, v: 25 * sl, speed: 25 }, onRoad: true, impact: 0 }, true); };
    }
    const loaf = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) loaf.push({ t: e.startTime, d: e.duration, block: e.blockingDuration, style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, scripts: e.scripts.map(x => `${x.invoker} ${x.sourceURL.split('/').pop()}:${x.sourceCharPosition} ${x.duration.toFixed(1)}`) }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) {}
    const links = []; { const lp = gl.linkProgram.bind(gl); gl.linkProgram = (pr) => { links.push(new Error().stack.split('\n').slice(2, 14).map(l => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' < ')); return lp(pr); }; }
    const firstDraws = []; { const rb = R.renderBufferDirect.bind(R); R.renderBufferDirect = (c, sc, g, m, o, gr) => { const n0 = R.info.programs.length; rb(c, sc, g, m, o, gr); if (R.info.programs.length > n0) { const nk = R.info.programs[R.info.programs.length - 1].cacheKey, ok = R.info.programs.slice(0, -1).filter(q => q.name === R.info.programs[R.info.programs.length - 1].name).map(q => q.cacheKey); const A = nk.split(','); let best = null; for (const k of ok) { const B = k.split(','), d = A.map((x, i) => x !== B[i] ? i + ':' + B[i] + '->' + x : null).filter(Boolean); if (!best || d.length < best.length) best = d; } firstDraws.push('  key diff vs nearest existing: ' + (best ? best.join(' ') : 'no other program of this kind')); const path = []; for (let q = o; q; q = q.parent) path.push(q.name || q.type); firstDraws.push(`${m.type}${m.map ? ' map' : ''}${m.alphaTest ? ' alphaTest' : ''} side${m.side} for ${o.type} (${path.slice(0, 5).join(' < ')}) castShadow=${o.castShadow} matVisible=${o.material && o.material.visible}`); } }; }
    if (window.__rewarm) { const n0 = R.info.programs.length; sim.warmUp(G.post, G.settings); console.log('second warm-up added programs: ' + (R.info.programs.length - n0) + ' / ' + n0); }
    sim.__seen = new Set(); sim.scene.traverse(o => sim.__seen.add(o));
    const startTimes = [], newProgs = []; sim.__np = (R.info.programs || []).length;
    if (window.__hide) sim.scene.traverse(o => { if (window.__hide(o)) o.visible = false; });
    const ms = { up: 0, ren: 0, full: 0 }, frames = [];
    const up0 = sim.update.bind(sim), ren0 = sim.render.bind(sim);
    let starts = 0, fStart = 0; R.info.autoReset = false; let calls = 0, tris = 0, nf = 0;
    sim.update = (...a) => { const t = performance.now(); const n0 = sim.drift ? sim.drift.events.filter(e => e.type === 'start').length : 0; up0(...a); ms.up = performance.now() - t; if (sim.drift && sim.drift.events.filter(e => e.type === 'start').length > n0) { starts++; fStart = 1; startTimes.push(performance.now()); } };
    sim.render = (...a) => {
      R.info.reset(); const t = performance.now(); ren0(...a); calls += R.info.render.calls; tris += R.info.render.triangles; nf++; ms.ren = performance.now() - t;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // wait for the GPU
      ms.full = performance.now() - t + ms.up;
      frames.push({ up: ms.up, ren: ms.ren, full: ms.full, start: fStart }); fStart = 0;
      const np = (R.info.programs || []).length; if (np !== (sim.__np ?? np)) newProgs.push({ ms: ms.full.toFixed(0), at: (performance.now() / 1000).toFixed(2), progs: R.info.programs.slice(sim.__np).map(p => p.name + ' ' + p.cacheKey.slice(0, 120)), added: (() => { const a = []; sim.scene.traverse(o => { if (!sim.__seen.has(o)) { sim.__seen.add(o); a.push(`${o.type}:${o.name || ''}:${o.material ? o.material.type + (o.material.alphaTest ? ' alphaTest' : '') + (o.material.side ? ' side' + o.material.side : '') : ''}:${o.castShadow ? 'shadow' : ''}${o.parent ? ' in ' + (o.parent.name || o.parent.type) : ''}`); } }); return a.slice(0, 12); })() }); sim.__np = np;
    };
    let last = performance.now(); const gaps = [], gapT = [];
    await new Promise(res => { const end = last + secs * 1000; const f = () => { const n = performance.now(); gaps.push(n - last); gapT.push(n); last = n; if (n < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    sim.update = up0; sim.render = ren0; R.info.autoReset = true;
    let inst = 0, meshes = 0; const kinds = {};
    sim.scene.traverse(o => { if (o.isInstancedMesh) inst += o.count; if (!o.isMesh) return; meshes++; const k = (o.isInstancedMesh ? 'inst ' : 'mesh ') + (o.material && o.material.type) + (o.castShadow ? ' shadow' : '') + (o.material && o.material.transparent ? ' transp' : ''); kinds[k] = (kinds[k] || 0) + 1; });
    const gapAt = []; { let t = 0; } // (rAF gaps in the 300 ms after each chain start)
    return { firstDraws, links, newProgs, gapT, loaf, startTimes, frames, gaps, calls: Math.round(calls / nf), tris: tris / nf, inst, meshes, kinds, starts, drift: sim.drift ? Math.round(sim.drift.total) : 0 };
  }, +secs);
  if (cdp) { // self time per function, top 25
    const { profile } = await cdp.send('Profiler.stop'), self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map(n => [n.id, n]));
    let tot = 0; profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); tot += dt[i] || 0; });
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(100 * v / tot).toFixed(1).padStart(5)}%  ${k}`).join('\n'));
  }
  if (process.env.DIAG) console.log(JSON.stringify(await pg.evaluate(async (f) => (await import('/.devtest/perfdiag.js'))[f](), process.env.DIAG === '2' ? 'library' : 'visible'), null, 1));
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const row = (name, a) => console.log(`${name.padEnd(22)} p50 ${q(a, 0.5).toFixed(2).padStart(6)}  p95 ${q(a, 0.95).toFixed(2).padStart(6)}  max ${Math.max(...a).toFixed(2).padStart(6)} ms`);
  console.log(`${file.split('/').pop()}  load ${load.toFixed(1)} s  frames ${r.frames.length}  draw calls ${r.calls}  triangles ${(r.tris / 1e6).toFixed(2)} M  meshes ${r.meshes}  instances ${r.inst}`);
  if (process.env.KINDS) console.log(Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(6)} ${k}`).join('\n'));
  row('update (JS)', r.frames.map(f => f.up));
  row('render (JS)', r.frames.map(f => f.ren));
  row('frame (incl. GPU)', r.frames.map(f => f.full));
  row('rAF interval', r.gaps.slice(5));
  const st = r.frames.map((f, i) => f.start ? Math.max(...r.frames.slice(i, i + 3).map(g => g.full)) : null).filter(x => x !== null);
  if (process.env.DRIFT) {
    const near = (t) => r.gapT.map((g, i) => [g, r.gaps[i]]).filter(([g]) => g > t && g < t + 400).map(([, d]) => d);
    console.log('rAF gaps in the 400 ms after each chain start:'); r.startTimes.forEach(t => console.log('  ' + near(t).map(d => d.toFixed(0)).join(' ')));
    const inStart = new Set(); r.startTimes.forEach(t => r.gapT.forEach((g, i) => { if (g > t && g < t + 400) inStart.add(i); }));
    const slow = (pick) => r.gaps.filter((d, i) => i > 5 && pick(i) && d > 24).length, nS = inStart.size, nO = r.gaps.length - 5 - nS;
    console.log(`frames over 24 ms: near chain starts ${slow(i => inStart.has(i))} / ${nS}, elsewhere ${slow(i => !inStart.has(i))} / ${nO}`);
    console.log('long frames:'); r.loaf.forEach(l => { const s = r.startTimes.find(t => l.t > t - 50 && l.t < t + 400); console.log(`  ${l.d.toFixed(0)} ms${s !== undefined ? ' (at a chain start)' : ''}  style+layout ${l.style.toFixed(1)}  render ${l.render.toFixed(1)}  ${l.scripts.slice(0, 4).join(' | ')}`); });
  }
  if (r.newProgs.length) { console.log('shaders compiled mid-race:'); r.newProgs.forEach(n => console.log(`  frame ${n.ms} ms at ${n.at}s: ${n.progs.join(' || ')}\n    objects added since the start: ${n.added.join(', ') || 'none'}`)); }
  if (r.firstDraws.length) console.log('new programs mid-race, for:\n' + r.firstDraws.map(l => '  ' + l).join('\n'));
  console.log(`drift starts ${r.starts}  total ${r.drift}` + (st.length ? `  worst frame at a start: p50 ${q(st, 0.5).toFixed(2)}  max ${Math.max(...st).toFixed(2)} ms` : ''));
} finally { await b.close(); server.kill(); }
