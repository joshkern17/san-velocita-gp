// dev: computed sizes of each screen's menu rows and headings, and whether its list overflows   node .devtest/menuaudit.mjs
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100);
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1400, height: 820 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { navigator.getGamepads = () => []; });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => window.__svgp, null, { timeout: 60000 }); await pg.waitForTimeout(1500);
  const audit = () => pg.evaluate(() => {
    const s = document.querySelector('.screen.active'), out = [s.id];
    for (const m of s.querySelectorAll('.menu')) {
      if (!m.offsetParent) continue;
      const it = [...m.querySelectorAll('.item:not(.head)')][0], hd = m.querySelector('.item.head');
      const cs = it && getComputedStyle(it), sc = m.closest('[class*=panel]') || m;
      out.push(`  #${m.id} row ${cs ? cs.fontSize + '/' + cs.lineHeight : '-'} h${it ? it.getBoundingClientRect().height.toFixed(0) : '-'} | head ${hd ? getComputedStyle(hd).padding : '-'} | scroll ${m.scrollHeight}/${m.clientHeight} panel ${sc.scrollHeight}/${sc.clientHeight} bottom ${sc.getBoundingClientRect().bottom.toFixed(0)}`);
    }
    const d = s.querySelector('.desc-bar'); if (d) out.push(`  desc top ${d.getBoundingClientRect().top.toFixed(0)}`);
    return out.join('\n');
  });
  for (const [n, js] of [['main', () => __svgp.open.main()], ['setup', () => __svgp.open.setup()], ['career', () => __svgp.open.career()], ['online', () => __svgp.open.online()], ['garage', () => __svgp.open.garage()], ['options', () => __svgp.open.options()]]) {
    await pg.evaluate(js); await pg.waitForTimeout(1200); console.log(await audit());
    if (n === 'setup') { await pg.waitForTimeout(1500); await pg.keyboard.press('Enter'); await pg.waitForFunction(() => __svgp.screen === 's-raceset', null, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(800); console.log(await audit()); }
  }
} finally { await b.close(); server.kill(); }
