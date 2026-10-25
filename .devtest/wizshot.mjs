// dev: a fresh World Career up to the Team Setup Wizard, screenshots  node .devtest/wizshot.mjs <outdir> [steps js]
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const PORT = 8890 + Math.floor(Math.random() * 100), OUT = process.argv[2] || '.';
const server = spawn('python3', [join(ROOT, 'serve.py'), String(PORT), '--no-browser'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage(); await pg.setViewportSize({ width: 1600, height: 900 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | '))); pg.on('console', m => m.type() === 'error' && console.log('ERR', m.text()));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.addInitScript(() => { navigator.getGamepads = () => []; }); await pg.waitForFunction(() => window.__svgp && window.__svgp.screen, null, { timeout: 60000, polling: 200 }); await pg.waitForTimeout(1000);
  await pg.evaluate(async () => {
    const WC = await import('./js/wcareer.js');
    __svgp.dbg.startWorld(); await new Promise(r => setTimeout(r, 400));
    const w = __svgp.world;
    WC.registerTeam(w, { name: 'Sam Carter', team: 'Carter Racing', home: Object.keys(WC.TOWNS)[0], background: Object.keys(WC.BACKGROUNDS)[0], ex: 'Jo', years: 6, colors: [0xff2b00, 0xffffff] });
    WC.claimLottery(w, 'lump');
  });
  await new Promise(r => setTimeout(r, 2500));
  await pg.evaluate(() => { __svgp.dbg.standUp(); __svgp.dbg.renderHub(); });
  await new Promise(r => setTimeout(r, 2500));
  globalThis.pg = pg; globalThis.shot = async (n) => { await pg.screenshot({ path: join(OUT, n + '.png') }); console.log('shot', n); };
  const steps = process.argv[3] ? (await import('file://' + process.argv[3])).default : async () => shot('hub');
  await steps(pg, shot);
} finally { await b.close(); server.kill(); }
