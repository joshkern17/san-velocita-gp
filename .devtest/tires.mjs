// dev: the tire stacks (walk up, order, a stack goes up) and walking from the first day (setup at the computer)

//   node .devtest/tires.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.stack));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  const S = (o) => pg.evaluate(o);
  // a brand new career: on your feet before anything's done; the computer says what's next
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  await pg.evaluate(() => { const d = window.__svgp.dbg; if (d.tsw && d.tsw.isOpen) d.tsw.close(); });
  for (let i = 0; i < 12; i++) { await pg.waitForTimeout(500); const r = await S(() => { const d = window.__svgp.dbg, w = d.walk; return { walking: w.active, act: w.act && w.act.kind, pc: !!d.pcSeat, next: document.getElementById('walk-next').textContent, comp: (w.spots || []).find(s => s.key === 'computer')?.want }; }); if (i % 3 === 2 || r.walking) console.log('new career', JSON.stringify(r)); if (r.walking && !r.act) break; }
  await pg.screenshot({ path: join(out, 'tires-new.png') });
  // (it opens at the computer, on Form SV-1: stand up, and you're on your feet with the computer asking for it)
  for (let i = 0; i < 4 && !(await S(() => window.__svgp.dbg.walk.active)); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); }
  for (let i = 0; i < 8; i++) { await pg.waitForTimeout(500); const r = await S(() => { const d = window.__svgp.dbg, w = d.walk; return { walking: w.active, act: w.act && w.act.kind, next: document.getElementById('walk-next').textContent, comp: (w.spots || []).find(s => s.key === 'computer')?.want }; }); if (r.walking && !r.act) { console.log('stood up', JSON.stringify(r)); break; } }
  await pg.screenshot({ path: join(out, 'tires-new-up.png') });
  // set up (as onfoot does), stock empty
  await pg.evaluate(async () => { const d = window.__svgp.dbg, w = window.__svgp.world, WC = await import('/js/wcareer.js'); if (d.tsw && d.tsw.isOpen) d.tsw.close();
    const S = window.__svgp.settings;
    WC.registerTeam(w, { name: 'Test Driver', team: 'Driver Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
    WC.claimLottery(w, 'lump'); WC.setupPick(w, 'entry', 'takeover'); WC.setupPick(w, 'sponsor', 0); WC.setupPick(w, 'mate', w.setup.drivers[0]); WC.setupApply(w);
    w.livery = { ...S.car }; w.liveryDone = true; WC.setWhy(w, 'prove'); WC.setAmbition(w, WC.ambitionChoices(w)[1].t);
    const t = w.teams[w.player.team]; t.fac = { ...(t.fac || { base: 0 }), tools: 1, sim: 1 }; w.money.balance = Math.max(w.money.balance, 50000);
    w.tyreStock = { soft: 1, medium: 0, hard: 1, wet: 0, dirt: 0 };
    d.openHub(); });
  await pg.waitForFunction(() => /^home:.*sim/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(2500);
  for (let i = 0; i < 4 && await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(900); }
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active && !window.__svgp.dbg.walk.act, null, { timeout: 15000 });
  const info = () => S(() => { const d = window.__svgp.dbg, P = d.pitGarage, w = d.walk, s = w.spots.find(x => x.key === 'tires');
    return { stacks: P.tyreStacks ? P.tyreStacks.children.length : -1, area: s && [s.box.min.toArray().map(v => +v.toFixed(2)), s.box.max.toArray().map(v => +v.toFixed(2))], want: s && s.want, stock: { ...window.__svgp.world.tyreStock }, walking: w.active, mode: document.getElementById('s-hub').className.replace('screen menu-screen active', '').trim() }; });
  console.log('home', JSON.stringify(await info()));
  // over to the stacks
  await pg.evaluate(() => { const w = window.__svgp.dbg.walk, s = w.spots.find(x => x.key === 'tires'), a = w.anchor(s), c = window.__svgp.dbg.pitGarage.carCentre();
    const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz); w.pos.set(a.x + dx / l * 1.0, 0, a.z + dz / l * 1.0); w.push(); w.heading = Math.atan2(a.x - w.pos.x, a.z - w.pos.z); w.camYaw = w.heading; });
  await pg.waitForTimeout(1500); console.log('at the stacks', JSON.stringify(await S(() => window.__svgp.dbg.walk.spot?.key)));
  await pg.screenshot({ path: join(out, 'tires-walk.png') });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1300);
  console.log('tire view', JSON.stringify(await info()), JSON.stringify(await S(() => window.__svgp.dbg.menus ? null : [...document.querySelectorAll('#m-hub .item, #m-hub li, #m-hub > *')].map(e => e.textContent.trim()).slice(0, 8))));
  await pg.screenshot({ path: join(out, 'tires-view.png') });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(200); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
  console.log('ordered', JSON.stringify(await info()));
  await pg.screenshot({ path: join(out, 'tires-ordered.png') });
  await pg.keyboard.press('Escape');
  for (let i = 0; i < 6; i++) { await pg.waitForTimeout(500); const r = await info(); if (r.walking) { console.log('back', JSON.stringify(r)); break; } }
  // the season's over: the door is the next one (once the SVMA's answered)
  console.log('over', JSON.stringify(await S(async () => { const d = window.__svgp.dbg, w = window.__svgp.world; w.over = true; d.renderHub && d.renderHub(); await new Promise(r => setTimeout(r, 600));
    const sp = d.walk.spots.find(x => x.key === 'door'); const r = { walking: d.walk.active, next: document.getElementById('walk-next').textContent, door: sp.label, want: sp.want }; w.over = false; return r; })));
} finally { await b.close(); server.kill(); }
