async (page) => {
  // two browsers in one online room: host drives CAR_A, guest drives CAR_B; checks the lobby, the start, and remote cars moving
  const CAR_A = 'custom', CAR_B = 'transit';
  const errs = { host: [], guest: [] };
  const old = page.context().pages().filter(x => x !== page); for (const o of old) await o.close();
  const guest = await page.context().newPage();
  page.on('pageerror', e => errs.host.push(e.message));
  guest.on('pageerror', e => errs.guest.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.host.push('console: ' + m.text()); });
  guest.on('console', m => { if (m.type() === 'error') errs.guest.push('console: ' + m.text()); });
  for (const p of [page, guest]) {
    await p.setViewportSize({ width: 1100, height: 640 });
    await p.goto('http://localhost:8123/');
    await p.waitForFunction(() => window.__svgp, null, { timeout: 60000 });
    for (let i = 0; i < 40 && await p.evaluate(() => window.__svgp.screen) !== 's-main'; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(700); }
  }
  await page.evaluate((c) => { const s = window.__svgp.settings; s.car.chassis = c; s.playerName = 'HOSTY'; s.aiChassis = 'class'; }, CAR_A);
  await guest.evaluate((c) => { const s = window.__svgp.settings; s.car.chassis = c; s.playerName = 'GUESTY'; }, CAR_B);
  await page.evaluate(() => window.__svgp.open.online());
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById('on-name').value = 'HOSTY'; });
  await page.keyboard.press('Enter'); // Host Game (first item)
  await page.waitForFunction(() => window.__svgp.screen === 's-lobby', null, { timeout: 30000 });
  const code = await page.evaluate(() => window.__svgp.lobby.code);
  await guest.evaluate(() => window.__svgp.open.online());
  await guest.waitForTimeout(600);
  await guest.evaluate((code) => { document.getElementById('on-name').value = 'GUESTY'; const e = document.getElementById('on-code'); e.value = code; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, code);
  await guest.waitForFunction(() => window.__svgp.screen === 's-lobby', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const lobbyInfo = await page.evaluate(() => ({ players: window.__svgp.lobby.players.map(p => [p.name, p.car.chassis]), info: document.getElementById('lob-info').innerText.slice(0, 120) }));
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/a3cd3d5c-71f8-417d-b882-b8a5f41ce7ff/scratchpad/lobby.png' });
  // host: 3 AI, start
  await page.evaluate(() => { window.__svgp.lobby.set.ai = 3; window.__svgp.settings.aiChassis = 'multi'; });
  await page.keyboard.press('Enter'); // Start Race (first item)
  for (const p of [page, guest]) await p.waitForFunction(() => window.__svgp.sim && window.__svgp.sim.net && ['s-strategy', 'hud'].includes(window.__svgp.screen), null, { timeout: 60000 }).catch(() => {});
  const screens = [await page.evaluate(() => window.__svgp.screen), await guest.evaluate(() => window.__svgp.screen)];
  // skip strategy if shown, then hold throttle
  for (const p of [page, guest]) { await p.keyboard.press('Enter'); }
  await page.waitForTimeout(14000);
  for (const p of [page, guest]) await p.keyboard.down('ArrowUp');
  await page.waitForTimeout(6000);
  const snap = (p) => p.evaluate(() => { const s = window.__svgp.sim; return { screen: window.__svgp.screen, state: s.state, cars: s.cars.map(c => ({ name: c.name, car: c.carId, remote: c.remote, human: c.human, spd: Math.round(c.phys.speed || 0), x: Math.round(c.phys.x) })) }; });
  const a = await snap(page), b = await snap(guest);
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/a3cd3d5c-71f8-417d-b882-b8a5f41ce7ff/scratchpad/host.png' });
  await guest.screenshot({ path: '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/a3cd3d5c-71f8-417d-b882-b8a5f41ce7ff/scratchpad/guest.png' });
  for (const p of [page, guest]) await p.keyboard.up('ArrowUp');
  await guest.close();
  return { code, lobbyInfo, screens, host: a, guest: b, errs };
}
