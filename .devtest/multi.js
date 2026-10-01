async (page) => {
  const SP = '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/6d908471-10f4-4903-b3e8-864f5a655a2a/scratchpad/';
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8123/');
  const J = await page.evaluate(() => fetch('/.devtest/multi.json?' + Date.now()).then(r => r.json()));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const info = {};
  for (const job of J.jobs) {
    await page.evaluate(async (j) => {
      const h = await import('/.devtest/harness.js?' + Date.now());
      window.__h = h;
      const t = h.testTrack(j.theme, j.opts);
      if (j.time) t.env.time = j.time; if (j.weather) t.env.weather = j.weather;
      window.__svgp.startRace(t, { mode: 'test', laps: 3, opponents: 0 }, 'menu');
    }, job);
    await page.waitForTimeout(800);
    await page.waitForFunction(() => window.__svgp.screen === 'hud', null, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(1200);
    info[job.name] = await page.evaluate(() => { const s = window.__svgp.sim; let tris = 0, draws = 0; s.world.root.traverse(o => { if (o.isMesh) { draws++; const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; tris += n * (o.count || 1); } }); return { draws, tris: Math.round(tris) }; });
    for (let k = 0; k < J.views.length; k++) {
      await page.evaluate((v) => { window.__h.look(window.__svgp.sim, ...v); document.querySelectorAll('#hud, .hud').forEach(e => e.style.opacity = 0); }, J.views[k]);
      await page.waitForTimeout(300);
      await page.screenshot({ path: SP + job.name + k + '.png' });
    }
  }
  return { errs, info };
}
