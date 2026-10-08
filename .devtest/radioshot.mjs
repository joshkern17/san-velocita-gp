// dev: screenshots of the race radio (a message, a call, a call answered)   node .devtest/radioshot.mjs [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '/tmp';
const { chromium } = await import('/Users/joshkern/Downloads/Racing Game/tools/node_modules/playwright-core/index.mjs');
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: +(process.env.W || 1600), height: +(process.env.H || 900) });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
  await pg.evaluate(async () => {
    const t = await (await fetch('/.devtest/auburn2.json')).json(); t.env.weather = 'clear';
    window.__svgp.startRace(t, { mode: 'race', laps: 3, opponents: 9, aiChassis: 'class', grid: 'back', car: window.__svgp.settings.car }, 'menu');
  });
  await pg.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.cars && window.__svgp.sim.cars.length > 2 && (window.__svgp.sim.state === 'strategy' || window.__svgp.sim.raceTime > 0), null, { timeout: 120000 }).catch(e => console.log('wait', e.message));
  for (let i = 0; i < 20 && await pg.evaluate(() => !!document.querySelector('#s-strat.active') || window.__svgp.sim.state === 'strategy'); i++) { await pg.keyboard.press('Enter'); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => window.__svgp.sim.raceTime > 1 && !document.querySelector('#h-lights.on'), null, { timeout: 240000 }).catch(e => console.log('wait go', e.message));
  const H = 'window.__svgp.hud';
  // (headless frames are slow: hold the messages and the EQ still so each shot shows its state)
  await pg.evaluate(`${H}.dropRadio = (el) => { window.__dropped = (window.__dropped || 0) + 1; };`);
  const shot = async (n) => { await pg.evaluate(() => { document.querySelectorAll('#h-radio .rd-msg').forEach(e => { e.style.transition = 'none'; e.classList.add('on'); }); const l = document.querySelector('#h-radio .rd-msg:last-child'); if (l && !l.classList.contains('old')) l.classList.add('talk'); }); await pg.waitForTimeout(300); await pg.evaluate(() => document.getAnimations().forEach(a => { if (String(a.animationName).startsWith('rd-eq')) { a.pause(); a.currentTime = 410; } })); await pg.waitForTimeout(200); console.log(n, await pg.evaluate(() => document.getElementById('h-radio').children.length + ' dropped ' + (window.__dropped || 0))); await pg.screenshot({ path: `${OUT}/${n}.png` }); };
  await pg.evaluate(`${H}.padGlyphs = true; ${H}.radio('eng', 'Gap to Moreau is 1.4. He is struggling on the rears, push now.', { name: 'Engineer · Rossi' })`);
  await pg.waitForTimeout(600); console.log(await pg.evaluate(() => { const r = document.getElementById('h-radio'); const i = r.querySelector('.rd-eq i:nth-child(2)'), cs = getComputedStyle(i, '::after'); return r.children.length + ' ' + r.firstChild.className + ' ' + cs.animationName + ' ' + cs.clipPath + ' ' + JSON.stringify(r.getBoundingClientRect()); })); await shot('1-msg');
  await pg.evaluate(`${H}.radio('mate', 'Copy. I can hold him through the esses.', { name: 'Teammate · Okafor', color: '#ffb000' })`);
  await pg.waitForTimeout(600); await shot('2-two');
  await pg.evaluate(`${H}.radioCall('eng', 'Undercut window on Moreau. Box this lap?', 'Box, box', 'Stay out', 'a', { name: 'Engineer · Rossi' }); ${H}.callTick(0.62)`);
  await pg.waitForTimeout(700); await shot('3-call');
  await pg.evaluate(`${H}.callDone('a')`);
  await pg.waitForTimeout(400); await shot('4-done');
} finally { await b.close(); server.kill(); }
