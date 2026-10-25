// dev: PICK ROADS (Location mode) clicked like a player would, the map server answered from the cache osmfetch.mjs
// wrote: the streets load, four clicks on streets + the first again close a loop, a point dragged to another street,
// Backspace, Enter makes the track; screenshots of each step.
//   .devtest/guard.sh -m 6000 -t 200 node .devtest/pickui.mjs ["<track name>"] [outdir]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const [name = 'Auburn GP2', out = join(ROOT, '.devtest/out/pick/ui')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const all = [JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.editorWork.txt'), 'utf8')), ...JSON.parse(readFileSync(join(ROOT, 'saves/storage/svgp.tracks.txt'), 'utf8'))];
const track = all.find(q => q && q.name === name);
const data = JSON.stringify(JSON.parse(readFileSync(join(ROOT, `.devtest/out/roads/${name.replace(/\W+/g, '_')}.osm.json`), 'utf8')).data);
const PORT = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 900 });
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  pg.on('pageerror', e => fail('page error ' + e.message));
  let queries = 0;
  await pg.route(/overpass|interpreter/, (r) => { queries++; r.fulfill({ status: 200, contentType: 'application/json', body: data }); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 30000, polling: 200 }); await pg.waitForTimeout(800);
  await pg.evaluate((t) => window.__svgp.openEditor(t), track);
  await pg.waitForTimeout(2000);
  const ed = 'window.__svgp.editor';
  // the view: the middle of the old track, ~1.4 km across
  await pg.evaluate(`(() => { const e = ${ed}, P = e.track.points; let x = 0, z = 0; for (const p of P) { x += p.x; z += p.z; } e.view.cx = x / P.length; e.view.cz = z / P.length; e.view.scale = e.W / 1400; e.dirty = true; })()`);
  await pg.keyboard.press('KeyK');
  await pg.waitForFunction(`!!(${ed}._pk && ${ed}._pk.G)`, null, { timeout: 20000 });
  const st = await pg.evaluate(`({ tool: ${ed}.tool, streets: ${ed}._pk.G.W.length, tab: document.querySelector('.ed-tabs [data-tab="node"]').textContent })`);
  console.log('tool', st.tool, '| streets', st.streets, '| tab', st.tab, '| downloads', queries);
  if (st.tool !== 'pick' || !st.streets) fail('streets did not load');
  await pg.waitForTimeout(1500); // (map tiles)
  await pg.screenshot({ path: join(out, '1-streets.png') });
  // four points round a ring on the streets (no dead ends, nothing driven twice), as screen positions
  const plan = await pg.evaluate(`(async () => {
    const { snapRoad, routeAll, routeOverlaps, routeLine, lineClashes } = await import('./js/roadpick.js');
    const e = ${ed}, G = e._pk.G; let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let tries = 0; tries < 200; tries++) {
      const R = 180 + rnd() * 200, a0 = rnd() * 6.28, cl = [];
      for (let k = 0; k < 4; k++) { const a = a0 + k * 1.571 + (rnd() - 0.5) * 0.5; const s = snapRoad(G, e.view.cx + Math.cos(a) * R, e.view.cz + Math.sin(a) * R, 120, w => w.kind === 'street' || w.kind === 'avenue'); if (s) cl.push(s); }
      if (cl.length < 4) continue;
      const legs = routeAll(G, cl, true); if (legs.some(l => !l) || routeOverlaps(G, legs).length) continue;
      if (lineClashes(routeLine(G, legs, true).pts, true).alongside.length) continue;
      return cl.map(c => e.w2s(c.x, c.z));
    }
    return null;
  })()`);
  if (!plan) throw new Error('no clean loop found');
  const box = await pg.locator('#ed-canvas').boundingBox();
  const click = async ([x, y]) => { await pg.mouse.move(box.x + x, box.y + y); await pg.waitForTimeout(60); await pg.mouse.down(); await pg.mouse.up(); await pg.waitForTimeout(120); };
  for (const p of plan) await click(p);
  await pg.mouse.move(box.x + plan[0][0] + 40, box.y + plan[0][1] + 30); await pg.waitForTimeout(150);
  await pg.screenshot({ path: join(out, '2-four-points.png') });
  let s = await pg.evaluate(`({ clicks: ${ed}._pk.clicks.length, legs: ${ed}._pk.legs.length, closed: ${ed}._pk.closed })`);
  console.log('after 4 clicks', JSON.stringify(s)); if (s.clicks !== 4 || s.legs !== 3) fail('4 clicks -> 3 legs');
  await click(plan[0]);
  s = await pg.evaluate(`({ clicks: ${ed}._pk.clicks.length, legs: ${ed}._pk.legs.length, closed: ${ed}._pk.closed, km: ${ed}._pk.line && ${ed}._pk.line.len / 1000, probs: ${ed}.pickProblems().map(p => p.text) })`);
  console.log('closed', JSON.stringify(s)); if (!s.closed || s.legs !== 4) fail('clicking the first point closes the loop');
  await pg.screenshot({ path: join(out, '3-loop.png') });
  // drag point 2 a little way along (to wherever the nearest street there is)
  const before = s.km;
  const p2 = plan[1], to = [p2[0] + 70, p2[1] - 50];
  await pg.mouse.move(box.x + p2[0], box.y + p2[1]); await pg.mouse.down();
  for (let k = 1; k <= 8; k++) { await pg.mouse.move(box.x + p2[0] + (to[0] - p2[0]) * k / 8, box.y + p2[1] + (to[1] - p2[1]) * k / 8); await pg.waitForTimeout(30); }
  await pg.mouse.up(); await pg.waitForTimeout(200);
  s = await pg.evaluate(`({ km: ${ed}._pk.line && ${ed}._pk.line.len / 1000, legs: ${ed}._pk.legs.filter(Boolean).length })`);
  console.log(`dragged point 2: ${before?.toFixed(2)} km -> ${s.km?.toFixed(2)} km`); if (!s.km || s.legs !== 4) fail('drag re-routes');
  // Backspace takes the last point back (the loop opens), then the first again closes it
  await pg.keyboard.press('Backspace'); await pg.waitForTimeout(150);
  s = await pg.evaluate(`({ clicks: ${ed}._pk.clicks.length, closed: ${ed}._pk.closed })`);
  console.log('backspace', JSON.stringify(s)); if (s.clicks !== 4 || s.closed) fail('backspace opens the loop');
  await pg.keyboard.press('Backspace'); await pg.waitForTimeout(150);
  s = await pg.evaluate(`({ clicks: ${ed}._pk.clicks.length, closed: ${ed}._pk.closed })`);
  console.log('backspace again', JSON.stringify(s)); if (s.clicks !== 3) fail('backspace takes the last point');
  await click(plan[3]); await click(plan[0]);
  // make the track
  const probs = await pg.evaluate(`${ed}.pickProblems().map(p => (p.block ? '! ' : '') + p.text)`);
  if (probs.length) console.log('panel says:', probs);
  await pg.locator('#tab-node').screenshot({ path: join(out, '4-panel.png') });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500);
  const t = await pg.evaluate(`(() => { const t = ${ed}.track, T = ${ed}.T; return { n: t.points.length, open: !!t.open, pick: t.pick && t.pick.clicks.length, km: T && T.L / 1000, blocking: ${ed}.blocking().length, minW: Math.min(...t.points.map(p => p.w)), maxW: Math.max(...t.points.map(p => p.w)) }; })()`);
  console.log('track made', JSON.stringify(t));
  if (!t.n || t.open || t.pick !== 4 || !t.km) fail('Enter makes a circuit from the route');
  if (t.blocking) fail('the new track has blocking problems');
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: join(out, '5-made.png') });
  await pg.evaluate(`${ed}.setTool('edit')`); await pg.waitForTimeout(600);
  await pg.screenshot({ path: join(out, '6-edit.png') });
  console.log(process.exitCode ? 'FAILED' : 'PASS');
} finally { await b.close(); server.kill(); }
