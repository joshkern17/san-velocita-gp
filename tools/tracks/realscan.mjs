// A real circuit's LiDAR ground and its real buildings and trees (USA), the way the Circuit Designer's MAP tab gets
// them (js/lidar.js fetchLidar, js/scan.js fetchScan): the bare-earth 3DEP tiles round the track into
// terrain.fine (the land beside the road at 4 m, not the 30 m grid), then every FEMA building outline at its laser
// height and every laser-scanned tree within `band` m of the road into track.scan. Kept in tracks/real/scan/<id>.json
// (build.mjs puts it back on every build) and written into tracks/real/<id>.json.
//   node tools/tracks/realscan.mjs <id> [band m, default 250]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const require = createRequire(path.join(ROOT, 'tools/package.json'));
const { chromium } = require('playwright-core');
const [id, bandArg] = process.argv.slice(2), BAND = +(bandArg || 250);
const file = path.join(ROOT, 'tracks/real', id + '.json');
if (!id || !fs.existsSync(file)) { console.error('no such circuit: ' + id); process.exit(1); }
const track = JSON.parse(fs.readFileSync(file, 'utf8'));

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await b.newPage();
  await page.route('http://svgp.local/**', (r) => {
    // (the game's pages sit at the root: scan.js loads its LAZ decoder from vendor/ relative to the page)
    const p = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/tools\/tracks\/vendor\//, '/vendor/'));
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  page.on('console', (m) => console.log('  ' + m.text()));
  page.on('pageerror', (e) => console.log('  PAGE ERROR ' + e.message));
  await page.goto('http://svgp.local/tools/tracks/bake.html');
  await page.waitForFunction(() => window.bakeReady, null, { timeout: 30000 });
  const out = await page.evaluate(async ([t, band]) => {
    const { sampleTrack } = await import('/js/track.js'), L = await import('/js/lidar.js'), S = await import('/js/scan.js');
    let last = '', say = (m) => { if (m !== last) { last = m; if (!/…\s*\d+\/\d+$/.test(m) || /(\d+)\/\1$/.test(m)) console.log(m); } };
    const T = sampleTrack(t);
    const r = await L.fetchLidar(t, T, { onStatus: say });
    t.terrain = { ...t.terrain, fine: [...(t.terrain.fine || []).filter(q => q.v === 2), ...r.tiles] };
    const st = L.lidarStats(t.terrain);
    console.log(`LiDAR ground: ${st.tiles} tiles, ${Math.round(st.cover * 100)}% covered, ${st.kb} KB`);
    const scan = await S.fetchScan(t, T, { band, onStatus: say });
    const s = S.scanStats(scan);
    console.log(`scan: ${s.houses} buildings, ${s.trees} trees within ${band} m, ${s.kb} KB (${scan.secs} s)`);
    return { fine: t.terrain.fine, scan, credit: L.LIDAR_ATTR + ' · ' + S.SCAN_ATTR };
  }, [track, BAND]);
  const sf = path.join(ROOT, 'tracks/real/scan', id + '.json');
  fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, JSON.stringify(out));
  track.terrain.fine = out.fine; track.scan = out.scan;
  if (!track.real.source.includes(out.credit)) track.real.source += ' · ' + out.credit;
  fs.writeFileSync(file, JSON.stringify(track));
  console.log(`written: tracks/real/scan/${id}.json (${(fs.statSync(sf).size / 1024).toFixed(0)} KB) and tracks/real/${id}.json`);
} finally { await b.close(); }
