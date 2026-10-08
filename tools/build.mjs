// Builds a single self-contained HTML file of the game (no server needed, runs from a double-click
// on Windows, macOS or Linux in Chrome / Edge / Firefox), plus a zip ready to send to a friend.
//   cd tools && npm install && node build.mjs
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const out = await esbuild.build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'none',
  alias: { three: path.join(root, 'vendor/three.module.min.js'), postprocessing: path.join(root, 'vendor/postprocessing/index.js') },
});
const js = out.outputFiles[0].text;
const inlineScript = (code, type = '') => `<script${type ? ` type="${type}"` : ''}>${code.replace(/<\/script/gi, '<\\/script')}</script>`;

let html = read('index.html');
const swap = (from, to) => { if (!html.includes(from)) throw new Error('build: not found in index.html: ' + from); html = html.replace(from, () => to); };
swap('<link rel="stylesheet" href="css/fonts.css">', `<style>${read('css/fonts.css')}</style>`);
swap('<link rel="stylesheet" href="css/sv.css">', `<style>${read('css/sv.css')}</style>`);
swap('<link rel="stylesheet" href="css/style.css">', `<style>${read('css/style.css')}</style>`);
swap('<script src="vendor/peerjs.min.js"></script>', inlineScript(read('vendor/peerjs.min.js')));
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
// the imported car model travels inside the file too (the game reads it from window.__SVGP_CAR_GLB)
const glbPath = path.join(root, 'models/car.glb');
const glbTag = fs.existsSync(glbPath) ? inlineScript(`window.__SVGP_CAR_GLB = "data:model/gltf-binary;base64,${fs.readFileSync(glbPath).toString('base64')}";`) : '';
// the scenery library too (assets/env: catalogue + one .glb per pack), read from window.__SVGP_ENV
const envDir = path.join(root, 'assets/env');
let envTag = '';
if (fs.existsSync(path.join(envDir, 'catalog.json'))) {
  const catalog = JSON.parse(fs.readFileSync(path.join(envDir, 'catalog.json'), 'utf8'));
  const glbs = {};
  for (const pack of new Set(catalog.assets.map(a => a.pack))) glbs[pack] = 'data:model/gltf-binary;base64,' + fs.readFileSync(path.join(envDir, pack + '.glb')).toString('base64');
  envTag = inlineScript(`window.__SVGP_ENV = ${JSON.stringify({ catalog, glbs })};`);
}
// your garage model (models/garage.glb), if there is one: read from window.__SVGP_GARAGE_GLB (js/pitgarage.js)
const garagePath = path.join(root, 'models/garage.glb');
const garageTag = fs.existsSync(garagePath) ? inlineScript(`window.__SVGP_GARAGE_GLB = "data:model/gltf-binary;base64,${fs.readFileSync(garagePath).toString('base64')}";`) : '';
// the career phone (models/phone.glb): window.__SVGP_PHONE_GLB (js/phone.js)
const phonePath = path.join(root, 'models/phone.glb');
const phoneTag = fs.existsSync(phonePath) ? inlineScript(`window.__SVGP_PHONE_GLB = "data:model/gltf-binary;base64,${fs.readFileSync(phonePath).toString('base64')}";`) : '';
// the people (models/characters.glb): window.__SVGP_CHARACTERS_GLB (js/characters.js)
const charsPath = path.join(root, 'models/characters.glb');
const charsTag = fs.existsSync(charsPath) ? inlineScript(`window.__SVGP_CHARACTERS_GLB = "data:model/gltf-binary;base64,${fs.readFileSync(charsPath).toString('base64')}";`) : '';
// the bleachers (models/bleachers.glb): window.__SVGP_BLEACHERS_GLB (js/crowd.js)
const blPath = path.join(root, 'models/bleachers.glb');
const blTag = fs.existsSync(blPath) ? inlineScript(`window.__SVGP_BLEACHERS_GLB = "data:model/gltf-binary;base64,${fs.readFileSync(blPath).toString('base64')}";`) : '';
// the GT / street / utility cars (models/cars/*.glb), read from window.__SVGP_CARS
const carsDir = path.join(root, 'models/cars');
const carGlbs = {};
if (fs.existsSync(carsDir)) for (const f of fs.readdirSync(carsDir)) if (f.endsWith('.glb')) carGlbs[f.slice(0, -4)] = 'data:model/gltf-binary;base64,' + fs.readFileSync(path.join(carsDir, f)).toString('base64');
const carsTag = inlineScript(`window.__SVGP_CARS = ${JSON.stringify(carGlbs)};`);
// the real-world circuits (tracks/real: index + one file each), read from window.__SVGP_REAL (js/realtracks.js)
const realDir = path.join(root, 'tracks/real');
let realTag = '';
if (fs.existsSync(path.join(realDir, 'index.json'))) {
  const index = JSON.parse(fs.readFileSync(path.join(realDir, 'index.json'), 'utf8')), files = {};
  for (const e of index) files[e.file] = JSON.parse(fs.readFileSync(path.join(realDir, e.file), 'utf8'));
  realTag = inlineScript(`window.__SVGP_REAL = ${JSON.stringify({ index, files })};`);
}
// the photo textures (assets/textures/*.png: ground, asphalt, concrete), read from window.__SVGP_TEXTURES (js/textures.js)
const texDir = path.join(root, 'assets/textures'), texPngs = {};
if (fs.existsSync(texDir)) for (const f of fs.readdirSync(texDir)) if (f.endsWith('.png')) texPngs[f.slice(0, -4)] = 'data:image/png;base64,' + fs.readFileSync(path.join(texDir, f)).toString('base64');
const texTag = inlineScript(`window.__SVGP_TEXTURES = ${JSON.stringify(texPngs)};`);
// the soundtrack is too big to inline: it goes in a music/ folder beside the HTML (js/audio.js reads __SVGP_MUSIC_DIR)
const musicTag = inlineScript(`window.__SVGP_MUSIC_DIR = 'music/';`);
swap('<script type="module" src="js/main.js"></script>', glbTag + garageTag + phoneTag + charsTag + blTag + envTag + carsTag + realTag + texTag + musicTag + inlineScript(js, 'module'));

fs.mkdirSync(dist, { recursive: true });
const name = 'San Velocita GP.html';
fs.writeFileSync(path.join(dist, name), html);
const musicSrc = path.join(root, 'assets/music'), musicOut = path.join(dist, 'music');
fs.rmSync(musicOut, { recursive: true, force: true });
fs.cpSync(musicSrc, musicOut, { recursive: true, filter: (f) => !path.basename(f).startsWith('.') });
// the wheel force feedback helper (Windows: Start Wheel FFB.bat)
const ffbOut = path.join(dist, 'wheelffb');
fs.rmSync(ffbOut, { recursive: true, force: true });
fs.copyFileSync(path.join(root, 'tools/Play San Velocita.bat'), path.join(dist, 'Play San Velocita.bat'));
fs.cpSync(path.join(root, 'tools/wheelffb'), ffbOut, { recursive: true, filter: (f) => !path.basename(f).startsWith('.') && !f.includes('__pycache__') });
fs.writeFileSync(path.join(dist, 'READ ME.txt'), [
  'SAN VELOCITA GRAND PRIX',
  '',
  'To play: double-click "Play San Velocita.bat" (Windows; it also starts wheel force feedback),',
  'or double-click "San Velocita GP.html".',
  'It opens in your web browser (Chrome or Edge recommended, Firefox works too).',
  'Keep the "music" folder next to it: that is the soundtrack.',
  'No install, no internet needed except for Online play and the map editor.',
  '',
  'Online with a friend:',
  '  1. One player picks Online > Host Game and reads out the 5-letter room code.',
  '  2. The other picks Online > Join Game, types the code and presses Enter.',
  '  3. The host picks the circuit and presses Start Race.',
  '  Both of you need the same version of this file.',
  '',
  'Controls: W/A/S/D or arrow keys, SPACE handbrake, C camera, R reset, ESC pause, F fullscreen.',
  'Xbox / PlayStation controllers work too: RT throttle, LT brake, A handbrake, left stick steer.',
  'Racing wheel: plug it in, then Options > Wheel > Set Up Wheel (once, with the keyboard). Set Wheel Rotation to',
  'match your wheel\'s own control panel (Thrustmaster Control Panel or G HUB).',
  'Force feedback (Windows): "Play San Velocita.bat" starts it (the first time it installs Python and a wheel library',
  'by itself, which takes a minute or two). Then Options > Wheel > Test Force Feedback.',
  '',
  'Tip: your garage car, saved tracks and career are stored by the browser for this file.',
  'Keep the file in the same place (e.g. your Documents folder) so they stay put.',
  '',
].join('\r\n'));
const zip = path.join(dist, 'San Velocita GP.zip');
fs.rmSync(zip, { force: true });
try { execFileSync('zip', ['-q', '-r', zip, 'Play San Velocita.bat', name, 'READ ME.txt', 'music', 'wheelffb', '-x', 'wheelffb/.ready'], { cwd: dist }); } catch (e) { console.warn('zip not available, skipped'); }
const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(1) + ' MB';
console.log(`built dist/${name} (${mb(path.join(dist, name))})` + (fs.existsSync(zip) ? `, dist/San Velocita GP.zip (${mb(zip)})` : ''));
