// Renders the Steam capsule drafts (marketing/steam/capsules/<direction>/) from capsule.html at Valve's exact sizes
// (research/steam-store-specs.md), plus a review sheet (capsules/review.png) and the small capsule at Steam's
// own 184x69 / 120x45 downscales, the size the wordmark has to survive.
//   node marketing/steam/capsules/src/render.mjs [A|B|C]
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..', '..', '..'), CAPS = join(HERE, '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const D = JSON.parse(readFileSync(join(HERE, 'directions.json'), 'utf8'));
const only = process.argv[2];

// a real circuit's outline as an SVG path in a 0..1 box (for direction C)
const outline = (id, rot = 0) => {
  const j = JSON.parse(readFileSync(join(ROOT, 'tracks/real/index.json'), 'utf8')), a = Array.isArray(j) ? j : (j.tracks || Object.values(j));
  const t = a.find(x => x.real.id === id), c = Math.cos(rot), s = Math.sin(rot);
  const P = t.points.map(p => [p.x * c - p.z * s, p.x * s + p.z * c]);
  const xs = P.map(p => p[0]), zs = P.map(p => p[1]), mnx = Math.min(...xs), mnz = Math.min(...zs), sc = Math.max(Math.max(...xs) - mnx, Math.max(...zs) - mnz);
  const ox = (1 - (Math.max(...xs) - mnx) / sc) / 2, oz = (1 - (Math.max(...zs) - mnz) / sc) / 2;
  const Q = P.map(p => [+(ox + (p[0] - mnx) / sc).toFixed(4), +(oz + (p[1] - mnz) / sc).toFixed(4)]);
  return { d: 'M' + Q.map(q => q.join(',')).join('L') + (t.open ? '' : 'Z'), nodes: Q.filter((q, i) => i % 9 === 0) };
};

const SIZES = { header: [920, 430], small: [462, 174], main: [1232, 706], vertical: [748, 896], library: [600, 900], hero: [3840, 1240], logo: [1280, 720], background: [1438, 810] };
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [key, dir] of Object.entries(D)) {
    if (only && key !== only) continue;
    const out = join(CAPS, key); mkdirSync(out, { recursive: true });
    for (const [asset, cfg] of Object.entries(dir.assets)) {
      const [w, h] = SIZES[asset];
      const C = { w, h, ...cfg, art: cfg.art ? pathToFileURL(join(ROOT, cfg.art)).href : null };
      if (cfg.track) C.track = { ...cfg.track, ...outline(cfg.track.id, cfg.track.rot || 0) };
      const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await pg.goto(pathToFileURL(join(HERE, 'capsule.html')).href);
      await pg.evaluate(() => document.fonts.ready);
      await pg.evaluate((C) => window.build(C), C);
      if (C.art) await pg.waitForFunction(() => { const i = document.getElementById('art'); return !i || i.complete; });
      await pg.waitForTimeout(200);
      const file = join(out, `${asset}_${w}x${h}.png`);
      await pg.locator('#cap').screenshot({ path: file, omitBackground: !!cfg.clear });
      await pg.close();
      console.log(key, asset, `${w}x${h}`);
      if (asset === 'small') for (const [sw, sh] of [[184, 69], [120, 45]]) // (Steam's own downscales: the wordmark check)
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `scale=${sw}:${sh}:flags=lanczos`, join(out, `small_preview_${sw}x${sh}.png`)]);
    }
  }
} finally { await b.close(); }
