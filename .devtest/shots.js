async (page) => {
  const SP = '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/6d908471-10f4-4903-b3e8-864f5a655a2a/scratchpad/';
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8123/');
  const V = await page.evaluate(() => fetch('/.devtest/views.json?' + Date.now()).then(r => r.json()));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1200);
  await page.evaluate(async (theme) => {
    const h = await import('/.devtest/harness.js?' + Date.now());
    window.__h = h;
    window.__svgp.startRace(h.testTrack(theme.t, theme.o), { mode: 'test', laps: 3, opponents: 0 }, 'menu');
  }, { t: V.theme || 'city', o: V.opts || {} });
  await page.waitForFunction(() => window.__svgp.screen === 'hud' || window.__svgp.screen === 'strategy', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (let k = 0; k < V.views.length; k++) {
    await page.evaluate((v) => { window.__h.look(window.__svgp.sim, ...v); document.querySelectorAll('#hud, .hud').forEach(e => e.style.opacity = 0); }, V.views[k]);
    await page.waitForTimeout(350);
    await page.screenshot({ path: SP + (V.prefix || 's') + k + '.png' });
  }
  return errs.concat(await page.evaluate(() => window.__svgp.sim.A.roadL.junctions.map(j => [j.road, j.side, j.n, j.closed, j.gate])));
}
