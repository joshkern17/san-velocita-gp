// The capsule review sheet (marketing/steam/capsules/review.png): one row per direction, every store capsule side by
// side, the small capsule also at Steam's real 184x69 and 120x45 (shown 1:1, where the wordmark has to survive).
//   node marketing/steam/capsules/src/review.mjs
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), CAPS = join(HERE, '..'), ROOT = join(CAPS, '..', '..', '..');
const { chromium } = await import(join(ROOT, 'tools/node_modules/playwright-core/index.mjs'));
const D = JSON.parse(readFileSync(join(HERE, 'directions.json'), 'utf8'));
const img = (k, f, h) => `<figure><img src="${k}/${f}" style="height:${h}px"><figcaption>${f.replace('.png', '').replace('_', ' ')}</figcaption></figure>`;
const rows = Object.entries(D).map(([k, d]) => `<section><h2>${d.name}</h2><div class="row">
  ${img(k, 'header_920x430.png', 300)}${img(k, 'main_1232x706.png', 300)}${img(k, 'vertical_748x896.png', 300)}${img(k, 'library_600x900.png', 300)}
  <div class="col">${img(k, 'small_462x174.png', 120)}<div class="tiny">${img(k, 'small_preview_184x69.png', 69)}${img(k, 'small_preview_120x45.png', 45)}</div></div>
  </div><div class="row">${img(k, 'hero_3840x1240.png', 200)}</div></section>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "SV UI"; src: url("../../site/fonts/SVUI-500.woff2") format("woff2"); }
body { margin: 0; padding: 32px; background: #05060c; color: #ff2b00; font: 500 15px/1.3 "SV UI", Helvetica, sans-serif; width: max-content; }
h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; } p { margin: 0 0 24px; color: #c93216; }
h2 { font-size: 18px; margin: 28px 0 10px; letter-spacing: .02em; }
.row { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 12px; } .col { display: flex; flex-direction: column; gap: 12px; } .tiny { display: flex; gap: 16px; align-items: flex-end; }
figure { margin: 0; } img { display: block; image-rendering: auto; outline: 1px solid #2a1410; } figcaption { margin-top: 4px; font-size: 12px; color: #c93216; }
</style><h1>San Velocita GP: Steam capsule drafts (NEEDS OK)</h1><p>Real director stills (game renders), the game's wordmark, no other text. The small capsule's previews are Steam's real 184x69 and 120x45, shown at 1:1.</p>${rows}`;
writeFileSync(join(CAPS, 'review.html'), html);
const b = await chromium.launch({ channel: 'chrome', headless: true });
try { const pg = await b.newPage({ viewport: { width: 1600, height: 900 } }); await pg.goto(pathToFileURL(join(CAPS, 'review.html')).href);
  await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300);
  await pg.screenshot({ path: join(CAPS, 'review.png'), fullPage: true }); } finally { await b.close(); }
console.log('review.png');
