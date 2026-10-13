// dev: a new World Career's start, as one path: the classifieds (Danny's pick, no buying before the setup), the setup,
// what's in the inbox and on the phone after it, The List opening by itself, then the SVMA poster (its walk spot, its
// 'New' tag, the zoom and the hub card). Screenshots to argv[2].   node .devtest/founding.mjs <outdir>
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const out = process.argv[2] || '/tmp';
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0; const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
try {
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => { console.log('PAGE ERROR', e.stack); fails++; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__svgp.dbg.startWorld(false));
  await pg.waitForFunction(() => window.__svgp.screen === 's-hub' && window.__svgp.world, null, { timeout: 60000 });
  const a = await pg.evaluate(async () => { const w = window.__svgp.world, WC = await import('/js/wcareer.js'), S = window.__svgp.settings;
    const cat = !!(w.carCat && w.carCat.club && w.carCat.club.length);
    WC.registerTeam(w, { name: 'Test Driver', team: 'Driver Racing', colors: [S.car.main, S.car.accent], home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 7 });
    WC.claimLottery(w, 'lump');
    return { series: w.player.series, cat, ads: (w.ads || []).length, tip: (w.ads || []).filter(x => x.tip).length, earlyBuy: WC.buyCar(w, w.ads[0].id), mail: w.mail.map(m => m.subj), texts: (w.msgs || []).length }; });
  check(a.series === 'club', `starts in the club (${a.series})`);
  const cal = await pg.evaluate(() => window.__svgp.world.series.club.cal.map(c => c.name));
  check(cal.includes('Lime Rock Park'), `the club's calendar has its home circuit (${cal.join(', ')})`); check(a.cat, 'car catalogue set before registering'); check(a.ads >= 3 && a.tip === 1, `classifieds: ${a.ads} listings, Danny's pick on one`);
  check(!a.earlyBuy, 'no buying off SVList before the setup'); check(!a.mail.some(s => /found you a car/.test(s)) && a.texts === 0, `before setup: ${a.mail.length} emails (${a.mail.join(' | ')}), ${a.texts} texts`);
  const s = await pg.evaluate(async () => { const d = window.__svgp.dbg, w = window.__svgp.world, WC = await import('/js/wcareer.js'); if (d.tsw && d.tsw.isOpen) d.tsw.close();
    WC.setupPick(w, 'entry', 'fresh'); WC.setupPick(w, 'car', w.ads.find(x => x.tip).id); WC.setupPick(w, 'sponsor', 0); const mate = w.setup.drivers[1]; WC.setupPick(w, 'mate', mate);
    d.standUp(); const r = d.tsw.src.apply(); return { r, mate: w.people[mate].first, mail: w.mail.map(m => m.subj), texts: (w.msgs || []).map(m => m.from) }; });
  check(s.r.ok, 'setup applies'); check(s.mail.filter(x => /Welcome to the/.test(x)).length === 1, `one welcome email (${s.mail.join(' | ')})`);
  check(s.texts.includes(s.mate) && s.texts.filter(x => x !== 'Danny' && x !== s.mate).length === 0, `texts from Danny and the chosen teammate only (${s.texts.join(', ')})`);
  await pg.waitForFunction(() => /^home:/.test(String(window.__svgp.dbg.pitGarage.custom)), null, { timeout: 20000 }); await pg.waitForTimeout(4000);
  check(await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')), 'The List opens by itself after the setup');
  await pg.screenshot({ path: join(out, 'f-1-list.png') });
  for (let i = 0; i < 5 && await pg.evaluate(() => document.getElementById('s-hub').classList.contains('at-list')); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(900); }
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active && !window.__svgp.dbg.walk.act, null, { timeout: 20000 }).catch(() => console.log('(not walking yet)'));
  const p = await pg.evaluate(() => { const d = window.__svgp.dbg, sp = d.walk.spots.find(x => x.key === 'poster'); return { spot: !!sp, want: sp && sp.want ? sp.want.text : null, frame: !!d.pitGarage.posterFrame }; });
  check(p.frame && p.spot, 'the poster is on the wall, with a walk spot'); check(p.want === 'New', `its tag says New (${p.want})`);
  await pg.evaluate(() => { const d = window.__svgp.dbg; d.standUp(); }); await pg.waitForTimeout(1200); // (the skipped opening sat you at the computer after the setup was applied here)
  await pg.waitForFunction(() => window.__svgp.dbg.walk.active && !window.__svgp.dbg.walk.act, null, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(800); // (as a player: walking, then over to it)
  await pg.evaluate(() => window.__svgp.dbg.goToPoster()); await pg.waitForTimeout(2500);
  console.log('at the poster:', await pg.evaluate(() => ({ cls: document.getElementById('s-hub').className, left: getComputedStyle(document.querySelector('#s-hub .hub-left')).opacity, shot: window.__svgp.dbg.pitGarage.shot })).then(JSON.stringify));
  const c = await pg.evaluate(() => ({ card: document.getElementById('hub-card').textContent.replace(/\s+/g, ' ').trim(), menu: [...document.querySelectorAll('#m-hub .item')].map(e => e.textContent.trim()) }));
  check(/Next rung: Street Cup/.test(c.card) && /National license/.test(c.card), `hub card at the poster: ${c.card}`);
  await pg.screenshot({ path: join(out, 'f-2-poster.png') });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(1500);
  const after = await pg.evaluate(() => { const sp = window.__svgp.dbg.walk.spots.find(x => x.key === 'poster'); return sp && sp.want ? sp.want.text : null; });
  check(after === null, `seen: the tag's gone (${after})`);
  // the series website: how to get in, under its name
  await pg.evaluate(() => window.__svgp.dbg.sitDown('series')); await pg.waitForFunction(() => document.querySelector('.ss-entry'), null, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(1500); // (walked round to the chair first)
  const site = await pg.evaluate(() => document.querySelector('.ss-entry')?.textContent || null);
  check(site && /Tier 1/.test(site) && /Novice/.test(site), `series site: ${site}`);
  await pg.screenshot({ path: join(out, 'f-3-site.png') });
  await pg.evaluate(() => window.__svgp.dbg.standUp()); await pg.waitForTimeout(1200);
  // the season's end with an offer: answered from the garage's menu
  const m = await pg.evaluate(async () => { const w = window.__svgp.world, WC = await import('/js/wcareer.js');
    w.over = true; w.lic.g = 2; w.player.offer = { to: 'street', opts: ['street'], answer: null };
    w.mail.unshift({ id: 'eX', y: w.year, r: w.round, from: 'SVMA Competitions', subj: 'Your options for 2027', body: ['Dear T,', 'Street Cup: an entry is yours if you want it. A season costs about $82,000 to run a car, plus the car.', 'SVMA Competitions'], read: false, offer: 'multi', choices: [['move:street', 'Move up to the Street Cup'], ['stay', 'Stay in the Spec Miata Club']] });
    window.__svgp.dbg.renderHub(); await new Promise(r => setTimeout(r, 400));
    const items = [...document.querySelectorAll('#m-hub .item')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
    const el = [...document.querySelectorAll('#m-hub .item')].find(e => /Move Up/i.test(e.textContent)); if (el) el.click(); await new Promise(r => setTimeout(r, 400));
    return { items, answer: w.player.offer.answer, to: w.player.offer.to }; });
  check(m.items.some(x => /Move Up: Street Cup/i.test(x)) && m.answer === 'move' && m.to === 'street', `season end: menu ${m.items.slice(0, 3).join(' | ')} -> ${m.answer} ${m.to}`);
} finally { await b.close(); server.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
