// Director stills: 1920x1080 screenshots of the game's own screens for the Steam page (marketing/steam/). The race
// rigs (director.mjs) only grab the 3D canvas; these scenes keep the DOM, so the HUD and the editor / designer UI show.
//   node tools/director/stills.mjs <stills.json> [--only name] [--headed]
// stills.json: { "out": "marketing/steam/screenshots/raw", "scenes": [ { "name": "...", "type": "...", ... } ] }
// Scene types:
//   livery  { car, livery: {pattern, main, accent, detail, number, sponsor}, view: three|left|right|top|rear|front, tab: team|decals|helmet|suit }
//   editor  { track: {preset|real|file}, tab: node|track|world|map, tool: draw|edit|..., view: {cx, cz, scale}, v3d: {at, side, h, back, pitch} }
//   career  { spot: door|car|sim|calendar|... (walk the home garage to it), cam: {yaw, pitch, dist} }
//   race    { track, env, race: {car, livery, team, opponents, aiChassis, grid}, settings, wait (s of real-time racing),
//             camera: chase|far|bumper|tcam (the game's own), shots: [wait s, ...] (more stills from the same race) }
// The race type runs in real time (the HUD only draws from the game's own loop) with the AI driving your car.
import { spawn } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const args = process.argv.slice(2), opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const L = JSON.parse(readFileSync(resolve(args.find(a => a.endsWith('.json'))), 'utf8'));
const OUT = join(ROOT, L.out || 'marketing/steam/screenshots/raw'); mkdirSync(OUT, { recursive: true });
const ONLY = opt('--only');

const PORT = 9100 + Math.floor(Math.random() * 200);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });

// a track from a scene's {preset|real|file}
const loadTrack = async (pg, tr, env) => pg.evaluate(async ([tr, env]) => {
  let t;
  if (tr.real) { const R = await import('/js/realtracks.js'); await R.realTracksReady(); t = JSON.parse(JSON.stringify(R.realTracks().find(x => x.real.id === tr.real))); if (tr.hydrate) { const { cloneTrack } = await import('/js/track.js'); t = await R.hydrateReal(cloneTrack(t)); } }
  else if (tr.preset) { const T = await import('/js/track.js'); t = T.cloneTrack(T.presetTracks().find(x => x.name === tr.preset)); }
  else t = await (await fetch('/' + tr.file)).json();
  if (!t) throw new Error('track not found: ' + JSON.stringify(tr));
  t.env = { ...(t.env || {}), ...(env || {}) };
  window.__stillTrack = t; return t.name;
}, [tr, env || {}]);

const setCar = (pg, car, livery, team) => pg.evaluate(async ([car, livery, team]) => {
  const S = window.__svgp.settings, tl = team ? (await import('/js/teamliveries.js')).teamLivery(team) : null;
  S.car = { ...S.car, ...(car ? { chassis: car } : {}), ...(tl || {}), ...(livery || {}) };
}, [car, livery, team]);

try {
  for (const sc of L.scenes) {
    if (ONLY && sc.name !== ONLY) continue;
    const t0 = Date.now();
    const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    pg.on('pageerror', e => console.log('  PAGE ERROR', e.message));
    await pg.addInitScript((seed) => {
      navigator.getGamepads = () => []; // (the dev's controller would drive the menus)
      try { localStorage.clear(); } catch (e) {} // (a clean profile: no saved settings from other runs)
      let a = seed * 2654435761 >>> 0;
      Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    }, sc.seed ?? 1);
    await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
    await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1200);
    await pg.evaluate((st) => { const S = window.__svgp.settings; S.music = 0; S.volume = 0; S.commentary = 'off'; Object.assign(S, st || {}); }, sc.settings);
    if (sc.tips !== true) await pg.addStyleTag({ content: '#lv-hint, #ed-hint { display: none !important; }' }); // (no how-to tips over a screenshot)
    const file = (suffix = '') => join(OUT, `${sc.name}${suffix}.png`);

    if (sc.type === 'livery') {
      await setCar(pg, sc.car, sc.livery, sc.team);
      await pg.evaluate(() => window.__svgp.open.garage()); await pg.waitForTimeout(1500);
      await pg.evaluate(() => { const it = [...document.querySelectorAll('#s-garage .item')].find(e => /Livery Designer/.test(e.textContent)); it && it.click(); });
      await pg.waitForTimeout(2500);
      if (sc.tab) await pg.click(`#lv-tabs [data-tab="${sc.tab}"]`);
      if (sc.view) await pg.click(`#lv-views [data-v="${sc.view}"]`);
      await pg.waitForTimeout(2000);
      await pg.screenshot({ path: file() });
    } else if (sc.type === 'editor') {
      await loadTrack(pg, sc.track, sc.env);
      await pg.evaluate(() => window.__svgp.openEditor(window.__stillTrack)); await pg.waitForTimeout(3000);
      if (sc.tool) await pg.click(`#ed-tools [data-tool="${sc.tool}"]`).catch(() => {});
      if (sc.tab) await pg.click(`[data-tab="${sc.tab}"]`).catch(() => {});
      await pg.evaluate((v) => { // (no tool tips over the map; the view where the scene wants it)
        document.querySelectorAll('#s-editor .ed-hint, #s-editor .hint, #ed-hint').forEach(e => e.style.display = 'none');
        const e = window.__svgp.editor; if (v && e && e.view) { Object.assign(e.view, v); e.dirty = true; }
      }, sc.view || null);
      await pg.waitForTimeout(1200);
      await pg.screenshot({ path: file() });
      if (sc.v3d) {
        await pg.keyboard.press('v');
        await pg.waitForFunction(() => window.__svgp.editor.v3d, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
        await pg.evaluate((o) => { const v = window.__svgp.editor.v3d, T = v.S.T, i = Math.round(o.at / T.ds) % T.N, s = o.side ?? 1, back = Math.round((o.back ?? 30) / T.ds);
          const j = (i - back + T.N) % T.N; v.pos.set(T.X[j] + T.RX[j] * s * (o.off ?? 4), T.Y[j] + (o.h ?? 8), T.Z[j] + T.RZ[j] * s * (o.off ?? 4));
          v.yaw = Math.atan2(-T.FX[j], -T.FZ[j]) - s * (o.turn ?? 0.3); v.pitch = o.pitch ?? -0.3; }, sc.v3d);
        await pg.waitForTimeout(1500);
        await pg.screenshot({ path: file('-3d') });
      }
    } else if (sc.type === 'career') {
      await setCar(pg, sc.car, sc.livery, sc.team);
      await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
      await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
      await pg.evaluate(async (sc) => { // (past the setup as the dev tests do it: registered, lottery, a team, its car)
        const d = window.__svgp.dbg, w = window.__svgp.world, WC = await import('/js/wcareer.js'); if (d.tsw && d.tsw.isOpen) d.tsw.close();
        const S = window.__svgp.settings;
        WC.registerTeam(w, { name: 'Sam Reyes', team: sc.teamName || 'Reyes Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
        WC.claimLottery(w, 'lump'); WC.setupPick(w, 'entry', 'takeover'); WC.setupPick(w, 'sponsor', 0); WC.setupPick(w, 'mate', w.setup.drivers[0]); WC.setupApply(w);
        w.livery = { ...S.car }; w.liveryDone = true; WC.setWhy(w, 'prove'); WC.setAmbition(w, WC.ambitionChoices(w)[1].t);
        const t = w.teams[w.player.team]; t.fac = { ...(t.fac || { base: 0 }), tools: 1, sim: 1 };
        d.openHub(); }, sc);
      await pg.waitForFunction(() => /^home:/.test(String(window.__svgp.dbg.pitGarage && window.__svgp.dbg.pitGarage.custom)), null, { timeout: 30000 }); await pg.waitForTimeout(2500);
      await pg.evaluate(() => { const d = window.__svgp.dbg; if (d.pitGarage.shot === 'seat') d.standUp(); }); await pg.waitForTimeout(1200);
      for (let i = 0; i < 4 && await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(900); }
      await pg.screenshot({ path: file('-hub') });
      if (sc.walk !== false) {
        await pg.evaluate(() => window.__svgp.dbg.startWalk());
        await pg.waitForFunction(() => window.__svgp.dbg.walk.active, null, { timeout: 20000 }); await pg.waitForTimeout(800);
        if (sc.spot) await pg.evaluate(([key, near, turn]) => { const w = window.__svgp.dbg.walk, s = w.spots.find(x => x.key === key); if (!s) return;
          const a = w.anchor(s), d = new w.pos.constructor(a.x - w.pos.x, 0, a.z - w.pos.z); const L = d.length(); d.normalize();
          w.pos.set(a.x - d.x * Math.min(L, near), 0, a.z - d.z * Math.min(L, near)); w.push(); w.heading = Math.atan2(a.x - w.pos.x, a.z - w.pos.z); w.camYaw = w.heading + turn; }, [sc.spot, sc.near ?? 2.5, sc.camTurn || 0]);
        await pg.waitForTimeout(1500);
        await pg.screenshot({ path: file('-walk') });
      }
    } else if (sc.type === 'race') {
      await loadTrack(pg, sc.track, sc.env);
      const R = sc.race || {};
      await setCar(pg, R.car, R.livery, R.team);
      await pg.evaluate((R) => { const G = window.__svgp, S = G.settings; S.aiMistakes = 'off'; if (G.hud && S.units) G.hud.units = S.units;
        G.startRace(window.__stillTrack, { mode: 'race', laps: R.laps ?? 5, opponents: R.opponents ?? 7, grid: R.grid || 'middle', aiChassis: R.aiChassis || 'class', car: S.car, camera: R.camera || 'chase', extra: R.extra || {} }, 'menu'); }, { ...R, camera: sc.camera });
      await pg.waitForFunction(() => { const s = window.__svgp.sim; return s && s.cars && s.cars.length && s.lineV && ['strategy', 'intro', 'carselect', 'countdown', 'racing', 'broadcast'].includes(s.state); }, null, { timeout: 180000 });
      await pg.evaluate((sc) => { const s = window.__svgp.sim; if (s.state === 'strategy' && s.confirmStrategy) s.confirmStrategy(null);
        s.state = 'racing'; s.stateT = 0; s.goAt = 0; if (s.player) s.player.autoT = 1e9; if (s.aiWantsPit) s.aiWantsPit = () => false; }, sc);
      const waits = sc.shots || [sc.wait ?? 20];
      for (let k = 0; k < waits.length; k++) {
        await pg.waitForTimeout(waits[k] * 1000);
        await pg.screenshot({ path: file(waits.length > 1 ? '-' + (k + 1) : '') });
        console.log('  ' + JSON.stringify(await pg.evaluate(() => { const s = window.__svgp.sim, p = s.player; return { pos: s.order.indexOf(p) + 1, kmh: +(p.phys.speed * 3.6).toFixed(0), onRoad: p.onRoad, pit: !!p.pitting, tS: p.phys.tS ? Array.from(p.phys.tS, v => +v.toFixed(0)) : null }; })));
      }
    }
    await pg.close();
    console.log(`${sc.name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally { await b.close(); server.kill(); }
