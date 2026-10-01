async (page) => {
  const SP = '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/6d908471-10f4-4903-b3e8-864f5a655a2a/scratchpad/';
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ping/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await page.goto('http://localhost:8123/');
  const J = await page.evaluate(() => fetch('/.devtest/drive.json?' + Date.now()).then(r => r.json()));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.__svgp, null, { timeout: 30000 });
  await page.waitForTimeout(800);
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
    await page.waitForTimeout(600);
    await page.keyboard.down('KeyW');
    for (let k = 0; k < (job.shots || 3); k++) {
      await page.waitForTimeout(job.every || 2200);
      await page.screenshot({ path: SP + job.name + k + '.png' });
    }
    await page.keyboard.up('KeyW');
  }
  return errs;
}
