async (page) => {
  // online: drift option in the lobby, car pick on the grid (both players change car), drift totals into the session table
  const SP = '/private/tmp/claude-501/-Users-joshkern-Downloads-Racing-Game/a3cd3d5c-71f8-417d-b882-b8a5f41ce7ff/scratchpad/';
  const errs = { host: [], guest: [] }; let step = 'boot'; const out = {};
  try {
  for (const o of page.context().pages().filter(x => x !== page)) await o.close();
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
  await page.evaluate(() => { const s = window.__svgp.settings; s.car.chassis = 'aventus'; s.playerName = 'HOSTY'; s.aiChassis = 'class'; });
  await guest.evaluate(() => { const s = window.__svgp.settings; s.car.chassis = 'aventus'; s.playerName = 'GUESTY'; });
  await page.evaluate(() => window.__svgp.open.online());
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById('on-name').value = 'HOSTY'; });
  step = 'host'; await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__svgp.screen === 's-lobby', null, { timeout: 30000 });
  const code = await page.evaluate(() => window.__svgp.lobby.code);
  await guest.evaluate(() => window.__svgp.open.online());
  await guest.waitForTimeout(600);
  await guest.evaluate((code) => { document.getElementById('on-name').value = 'GUESTY'; const e = document.getElementById('on-code'); e.value = code; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, code);
  step = 'join'; await guest.waitForFunction(() => window.__svgp.screen === 's-lobby', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const lobbyItems = await page.evaluate(() => [...document.querySelectorAll('#m-lobby .item, #m-lobby > div')].map(e => e.innerText.replace(/\s+/g, ' ')).filter(Boolean));
  await page.evaluate(() => { const L = window.__svgp.lobby; L.set.ai = 3; L.set.drift = 'on'; });
  await page.keyboard.press('Enter'); // Start Race
  for (const p of [page, guest]) await p.waitForFunction(() => window.__svgp.screen === 's-carsel', null, { timeout: 60000 }).catch(() => {});
  const selScreens = [await page.evaluate(() => window.__svgp.screen), await guest.evaluate(() => window.__svgp.screen)];
  await page.waitForTimeout(1500);
  const goTxt = await page.evaluate(() => document.getElementById('cs-go').innerText);
  await page.screenshot({ path: SP + 'carsel.png' });
  // host: next car in class, lock in. guest: next class (street), then let the timer run out
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.press('Enter');
  await guest.keyboard.press('ArrowDown'); await guest.waitForTimeout(400);
  const guestHighlighted = await guest.evaluate(() => document.querySelector('#cs-cars .on')?.innerText);
  await page.waitForFunction(() => window.__svgp.screen === 's-strat' || window.__svgp.screen === 'hud', null, { timeout: 40000 }).catch(() => {});
  await guest.waitForFunction(() => window.__svgp.screen === 's-strat' || window.__svgp.screen === 'hud', null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const cars = (p) => p.evaluate(() => { const s = window.__svgp.sim; return s.cars.map(c => `${c.name}:${c.carId}${c.remote ? '(r)' : ''}`).join(', '); });
  const afterPick = { host: await cars(page), guest: await cars(guest) };
  // wait for the race to start (strategy window), fake a drift score on the guest
  await page.waitForFunction(() => window.__svgp.sim.state === 'racing', null, { timeout: 60000 }).catch(() => {});
  const driftOn = { host: await page.evaluate(() => !!window.__svgp.sim.drift), guest: await guest.evaluate(() => !!window.__svgp.sim.drift) };
  await guest.evaluate(() => { window.__svgp.sim.drift.total = 4321; });
  await page.evaluate(() => { window.__svgp.sim.drift.total = 1200; });
  await page.waitForTimeout(1500);
  const hostSeesGuestDrift = await page.evaluate(() => window.__svgp.sim.results().filter(r => r.human).map(r => r.name + ':' + r.drift).join(', '));
  // host retires and ends the race for everyone
  const clickItem = async (p, txt) => p.evaluate((txt) => { const el = [...document.querySelectorAll('.screen.on .menu *, .screen.active .menu *')].concat([...document.querySelectorAll('.menu *')]).find(e => e.children.length === 0 && e.textContent.trim().startsWith(txt) && e.offsetParent); if (!el) return false; el.click(); return true; }, txt);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const r1 = await clickItem(page, 'Retire'); await page.waitForTimeout(300); const r2 = await clickItem(page, 'Retire');
  await page.waitForTimeout(1200);
  const e1 = await clickItem(page, 'End Race');
  await page.waitForTimeout(1500);
  const resCaption = await page.evaluate(() => document.querySelector('#results-table caption')?.innerText);
  await page.screenshot({ path: SP + 'netres.png' });
  await clickItem(page, 'Back To Lobby');
  await page.waitForFunction(() => window.__svgp.screen === 's-lobby', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const points = await page.evaluate(() => document.getElementById('lob-points').innerText);
  const lobbyCars = await page.evaluate(() => window.__svgp.lobby.players.map(p => p.name + ':' + p.car.chassis).join(', '));
  await page.screenshot({ path: SP + 'lobby2.png' });
  await guest.close();
  Object.assign(out, { lobbyItems, selScreens, goTxt, guestHighlighted, afterPick, driftOn, hostSeesGuestDrift, clicks: [r1, r2, e1], resCaption, points, lobbyCars });
  } catch (e) { out.fail = step + ': ' + e.message.slice(0, 200); out.hostScreen = await page.evaluate(() => window.__svgp.screen).catch(() => '?'); out.status = await page.evaluate(() => document.getElementById('on-status').textContent).catch(() => '?'); }
  return { ...out, errs };
}
