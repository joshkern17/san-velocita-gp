async (page) => {
  const SP = '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/6d908471-10f4-4903-b3e8-864f5a655a2a/scratchpad/cat/';
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:8123/.devtest/catalog.html');
  await page.waitForFunction(() => window.ready);
  const J = await page.evaluate(() => fetch('/.devtest/catjobs.json?' + Date.now()).then(r => r.json()));
  const out = {};
  for (const j of J) {
    out[j.name] = await page.evaluate(([u, o]) => window.show(u, o), [j.url, j.o || {}]);
    await page.screenshot({ path: SP + j.name + '.png' });
  }
  return out;
}
