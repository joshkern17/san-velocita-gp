async (page) => {
  const SP = '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/6d908471-10f4-4903-b3e8-864f5a655a2a/scratchpad/';
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ping/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await page.goto('http://localhost:8123/');
  const J = await page.evaluate(() => fetch('/.devtest/street.json?' + Date.now()).then(r => r.json()));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1200);
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
    await page.waitForTimeout(800);
    info[job.name] = await page.evaluate((pick) => {
      const s = window.__svgp.sim, L = s.A.roadL;
      const pcs = L.pieces.filter(p => p.s.length > 25 && p.walk > 1).sort((a, b) => b.s.length - a.s.length);
      const pc = pcs[Math.min(pick || 0, pcs.length - 1)], q = pc.s[Math.floor(pc.s.length / 2)], a = pc.s[Math.floor(pc.s.length / 2) + 10];
      const off = pc.w / 2 + pc.walk - 0.6, nx = -q.tz, nz = q.tx;
      const y = s.world.groundHeight(q.x, q.z);
      window.__h.look(s, q.x + nx * off, y + 1.7, q.z + nz * off, a.x + nx * 1, y + 1.2, a.z + nz * 1);
      document.querySelectorAll('#hud, .hud').forEach(e => e.style.opacity = 0);
      return { props: s.world ? 1 : 0 };
    }, job.pick || 0);
    for (let k = 0; k < (job.shots || 2); k++) {
      await page.waitForTimeout(job.every || 1500);
      await page.screenshot({ path: SP + job.name + k + '.png' });
    }
  }
  return { errs, info };
}
