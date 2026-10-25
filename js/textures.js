// Procedural low-res "PS2" textures painted on canvas
import * as THREE from 'three';
import { logoUrl } from './sponsorlogos.js';

let seed = 1337;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function tex(c, repeat = true, nearest = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 2;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}

function noiseFill(g, w, h, base, amt, size = 1) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const v = (rnd() - 0.5) * amt;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(x, y, size, size);
  }
}

function blotches(g, w, h, n, colors, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin);
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }
}

// The photo textures (assets/textures): the PSX Natural Ground pack (128 px) and the PSX Industrial pack (64 px), all
// seamless. The single-file build carries them in window.__SVGP_TEXTURES
export const textureUrl = (n) => ((typeof window !== 'undefined' && window.__SVGP_TEXTURES) || {})[n] || `assets/textures/${n}.png`;
// The natural ground, drawn by the terrain shader (world.js). grass: Grass_02, dry: Grass_10, desert: Sand_08,
// beach: Sand_03, earth: Dirt_02, gravel: Gravel_02, clay: Dirt_10
const GROUND = ['grass', 'dry', 'desert', 'beach', 'earth', 'gravel', 'clay'];
// (each starts as its usual colour, so nothing draws black before its photo has loaded)
const GROUND_BASE = { grass: '#5b7f25', dry: '#717643', desert: '#c49052', beach: '#dcc8ab', earth: '#624931', gravel: '#897971', clay: '#7f5d49' };
let ground = null;
export function getGroundTextures() {
  if (ground) return ground;
  ground = {};
  for (const n of GROUND) ground[n] = photoTex(128, 128, [n], (g, P) => tilePhoto(g, P(n), 128, 128, GROUND_BASE[n]));
  return ground;
}
// A canvas texture painted over photos: paint(g, P), where P(name) is that photo once it's loaded (null before), is
// called now and again as each photo arrives. It mustn't use the shared random numbers (it runs again later)
const photos = {};
function photo(n) {
  let im = photos[n];
  if (!im) { im = photos[n] = new Image(); im.src = textureUrl(n); }
  return im;
}
function photoTex(w, h, names, paint, logos = [], repeat = true) {
  const [c, g] = canvas(w, h), t = tex(c, repeat);
  const ready = (im) => im.complete && im.naturalWidth > 0;
  const draw = () => { g.clearRect(0, 0, w, h); paint(g, (n) => (ready(photo(n)) ? photo(n) : null), (s) => (ready(logo(s)) ? logo(s) : null)); t.needsUpdate = true; };
  draw();
  for (const n of names) if (!ready(photo(n))) photo(n).addEventListener('load', draw);
  for (const s of logos) if (!ready(logo(s))) logo(s).addEventListener('load', draw);
  return t;
}
// the sponsors' logos (js/sponsorlogos.js), full color
const logos = {};
function logo(slug) {
  let im = logos[slug];
  if (!im) { im = logos[slug] = new Image(); im.src = logoUrl(slug); }
  return im;
}
// a logo fitted inside a box (cx, cy its centre, w x h), or false if it hasn't loaded
function fitLogo(g, im, cx, cy, w, h) {
  if (!im) return false;
  const k = Math.min(w / im.naturalWidth, h / im.naturalHeight), lw = im.naturalWidth * k, lh = im.naturalHeight * k;
  g.drawImage(im, cx - lw / 2, cy - lh / 2, lw, lh);
  return true;
}
// cover the canvas with a photo at its own size (or its usual colour until it's loaded), then lighten it toward
// (screen) a grey: 0 leaves it, 255 is white
function tilePhoto(g, im, w, h, base, lift = 0) {
  if (im) { for (let y = 0; y < h; y += im.height) for (let x = 0; x < w; x += im.width) g.drawImage(im, x, y); }
  else { g.fillStyle = base; g.fillRect(0, 0, w, h); }
  if (lift) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgb(${lift},${lift},${lift})`; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; }
}
const burn = (n) => { for (let k = 0; k < n; k++) rnd(); }; // (random numbers a replaced canvas used, so the textures after keep theirs)
// Paint laid on the asphalt already drawn in g, the way real road paint wears: the photo's grain shows through it
// (lighter and darker with the stone under it) and its deepest pits stay bare. rgb: the paint, 0-255
function paintOn(g, rects, rgb, W = 128, H = 128) {
  const im = g.getImageData(0, 0, W, H), d = im.data, { z } = grainOf(d);
  for (const [x0, y0, w, h] of rects) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const k = (y * W + x) * 4, zk = z(k);
    const sh = Math.max(0.6, Math.min(1.12, 1 + 0.2 * zk)), bare = Math.max(0, Math.min(1, (-1.4 - zk) / 0.6)) * 0.65;
    for (let c = 0; c < 3; c++) d[k + c] = Math.min(255, rgb[c] * sh) * (1 - bare) + d[k + c] * bare;
  }
  g.putImageData(im, 0, 0);
}
// how far each pixel's lightness is from the picture's average, in standard deviations: z(k) for the pixel at byte k
function grainOf(d) {
  const L = (k) => d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11; let m = 0, v = 0; const n = d.length / 4;
  for (let k = 0; k < d.length; k += 4) m += L(k); m /= n;
  for (let k = 0; k < d.length; k += 4) v += (L(k) - m) ** 2; const sd = Math.max(1, Math.sqrt(v / n));
  return { z: (k) => (L(k) - m) / sd };
}
// The asphalt's grain alone, as grey around 0.5 (0.5 = the photo's average, a standard deviation 0.16): the painted lines drawn as meshes and
// the runoff's edge band read it in world space (world.js wornPaint), so their paint wears like the lines in the road
let _grain = null;
export function paintGrain() {
  if (_grain) return _grain;
  _grain = photoTex(128, 128, ['asphalt_01'], (g, P) => {
    tilePhoto(g, P('asphalt_01'), 128, 128, '#4a4a4e');
    const im = g.getImageData(0, 0, 128, 128), d = im.data, { z } = grainOf(d), Z = new Float32Array(d.length / 4);
    for (let k = 0; k < d.length; k += 4) Z[k / 4] = z(k); // (all read before any is written)
    for (let k = 0; k < d.length; k += 4) d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, 128 + Z[k / 4] * 40)); // (1 sd = 40 / 255)
    g.putImageData(im, 0, 0);
  });
  _grain.colorSpace = THREE.NoColorSpace; // (data, not a color)
  return _grain;
}

// a street track's asphalt: the circuit's, with no painted edges (its lines are drawn on top: world.js streetMarkings)
let _street = null;
export function streetAsphalt() { return _street || (_street = photoTex(128, 128, ['asphalt_01'], (g, P) => tilePhoto(g, P('asphalt_01'), 128, 128, '#4a4a4e', 14))); }
// a circuit with a painted edge band (env.edgeLine 'band'): its white lines right on the edge, where the band's color
// starts (the band itself is painted on the runoff: world.js runoffMaterial)
let _band = null;
export function bandAsphalt() {
  return _band || (_band = photoTex(128, 128, ['asphalt_01'], (g, P) => {
    tilePhoto(g, P('asphalt_01'), 128, 128, '#4a4a4e', 14);
    paintOn(g, [[0, 0, 3, 128], [125, 0, 3, 128]], [232, 232, 224]);
  }));
}

const cache = {};
export function getTextures() {
  if (cache.asphalt) return cache;
  seed = 1337;

  // asphalt with painted edge lines (u across width, v along track): asphalt_01, 6.5 m a photo
  cache.asphalt = photoTex(128, 128, ['asphalt_01'], (g, P) => {
    tilePhoto(g, P('asphalt_01'), 128, 128, '#4a4a4e', 14);
    // (the racing line's rubber is drawn by the road's shader, where the line really is: rubber.js)
    paintOn(g, [[3, 0, 3, 128], [122, 0, 3, 128]], [232, 232, 224]);
  });
  burn(128 * 128 + 30 * 14);
  // city asphalt (yellow edges, dashed centre line): cracked_asphalt_01
  cache.asphaltCity = photoTex(128, 128, ['cracked_asphalt_01'], (g, P) => {
    tilePhoto(g, P('cracked_asphalt_01'), 128, 128, '#414147', 8);
    paintOn(g, [[3, 0, 3, 128], [122, 0, 3, 128]], [217, 200, 90]); paintOn(g, [[62, 0, 3, 64]], [214, 214, 214]);
  });
  burn(128 * 128 + 26 * 14);
  // kerb red/white
  {
    const [c, g] = canvas(16, 64);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#e9e6df' : '#c3221f'; g.fillRect(0, i * 16, 16, 16); }
    noiseFill(g, 16, 64, 'rgba(0,0,0,0)', 0.1, 1);
    const t = tex(c); cache.kerb = t;
  }
  // grass and sand: the PSX ground textures (getGroundTextures). (The random numbers their old canvases used, so the
  // textures after keep theirs)
  for (let k = 0; k < 2 * (64 * 64 + 40 * 14); k++) rnd();
  // concrete (walls, the pits' buildings, retaining walls, pillars): concrete_01, 2 x 2 panels with their joints
  cache.concrete = photoTex(128, 128, ['concrete_01'], (g, P) => {
    tilePhoto(g, P('concrete_01'), 128, 128, '#8f8c86');
    g.fillStyle = 'rgba(30,28,24,0.12)'; g.fillRect(0, 0, 128, 128); // (a touch darker: the materials' colours lighten it)
    g.fillStyle = 'rgba(40,40,40,0.35)'; for (const i of [0, 64]) { g.fillRect(i, 0, 1, 128); g.fillRect(0, i, 128, 1); }
  });
  burn(64 * 64 + 20 * 14);
  const seed0 = seed;
  {
    const G = getGroundTextures();
    cache.grass = G.grass; cache.sand = G.desert; cache.gravel = G.gravel;
  }
  // paved runoff: asphalt_01 like the track, lighter (cars rarely run on it)
  cache.runoffAsphalt = photoTex(128, 128, ['asphalt_01'], (g, P) => tilePhoto(g, P('asphalt_01'), 128, 128, '#6a6a70', 55));
  // (the textures after these keep the random numbers they always had)
  seed = seed0; for (let k = 0; k < 64 * 64; k++) rnd();
  // tire wall
  {
    const [c, g] = canvas(64, 32);
    g.fillStyle = '#151515'; g.fillRect(0, 0, 64, 32);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const x = i * 16 + 8 + (r % 2) * 8, y = r * 16 + 8;
      g.fillStyle = '#262626'; g.beginPath(); g.arc(x % 64, y, 7.5, 0, 7); g.fill();
      g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(x % 64, y, 3, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(220,40,40,0.9)'; g.fillRect(0, 13, 64, 5);
    cache.tires = tex(c);
  }
  // armco: the rail's profile, galvanized_metal blended into it
  cache.armco = photoTex(64, 32, ['galvanized_metal'], (g, P) => {
    const grd = g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, '#d8dce0'); grd.addColorStop(0.3, '#9aa0a8'); grd.addColorStop(0.5, '#e8ecf0');
    grd.addColorStop(0.7, '#8a9098'); grd.addColorStop(1, '#6a7078');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 32);
    const im = P('galvanized_metal');
    if (im) { g.globalCompositeOperation = 'luminosity'; g.globalAlpha = 0.25; g.drawImage(im, 0, 0); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.6; g.drawImage(im, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    g.fillStyle = '#444'; g.fillRect(30, 0, 4, 32);
  });
  // concrete wall with ad banners: concrete_03, the sponsors' logos on black boards (painted at 4x: the logos need the
  // pixels; the concrete is drawn 4x up so it keeps its size on the wall)
  const ADS = [['volta-cola', 'VOLTA COLA', '#c01818', '#fff'], ['kobra', 'KOBRA OIL', '#111', '#f2c21b'], ['rapid', 'RAPID TIRES', '#1a4fb0', '#fff'], ['neon-fm', 'NEON 98.1 FM', '#6a1ab0', '#ffe0ff']];
  cache.wall = photoTex(1024, 128, ['concrete_03'], (g, P, LG) => {
    g.save(); g.scale(4, 4);
    tilePhoto(g, P('concrete_03'), 256, 32, '#b5b0a6');
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 28, 256, 4);
    g.restore();
    ADS.forEach(([slug, name, bg, fg], i) => {
      const x = i * 256 + 8, im = LG(slug);
      g.fillStyle = im ? '#0c0b10' : bg; g.fillRect(x, 24, 240, 72);
      if (!fitLogo(g, im, x + 120, 60, 220, 62)) { g.fillStyle = fg; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x + 120, 62); }
    });
  }, ADS.map(a => a[0]));
  burn(128 * 16);
  // building windows (tiles vertically per floor)
  const makeWindows = (base, lit) => {
    const [c, g] = canvas(64, 64);
    noiseFill(g, 64, 64, base, 0.15, 2);
    for (let fy = 0; fy < 4; fy++) for (let wx = 0; wx < 4; wx++) {
      const on = rnd() < lit;
      g.fillStyle = on ? (rnd() < 0.5 ? '#ffe9a8' : '#f7d27a') : (rnd() < 0.5 ? '#2a3440' : '#3a4a5c');
      g.fillRect(wx * 16 + 3, fy * 16 + 4, 10, 9);
      if (!on) { g.fillStyle = 'rgba(160,190,220,0.25)'; g.fillRect(wx * 16 + 3, fy * 16 + 4, 10, 3); }
    }
    return tex(c);
  };
  cache.windowsDay = [makeWindows('#9a8f80', 0.05), makeWindows('#7a8490', 0.05), makeWindows('#b0a088', 0.05), makeWindows('#6a6a70', 0.05)];
  cache.windowsNight = [makeWindows('#3a3630', 0.45), makeWindows('#2a3038', 0.5), makeWindows('#403830', 0.4), makeWindows('#26262a', 0.55)];
  // roof
  {
    const [c, g] = canvas(32, 32);
    noiseFill(g, 32, 32, '#55534f', 0.25, 2);
    cache.roof = tex(c);
  }
  // crowd for grandstands
  {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#2b2b33'; g.fillRect(0, 0, 64, 64);
    const cols = ['#d33', '#fff', '#36c', '#fd3', '#3a3', '#e8b', '#f93', '#222', '#9cf'];
    for (let row = 0; row < 8; row++) for (let i = 0; i < 16; i++) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(i * 4 + (row % 2), row * 8 + 2, 3, 4);
      g.fillStyle = '#e0b090'; g.fillRect(i * 4 + (row % 2), row * 8, 3, 2);
    }
    cache.crowd = tex(c);
  }
  // billboards: a sponsor's logo on black, a stripe of its color along the bottom (its name in letters until the logo
  // has loaded). [0] also hangs on the start gantry and [3] is the long sign, so those two stay put
  cache.billboards = [
    ['volta-cola', 'VOLTA', 'COLA', '#c01818', '#ffffff'],
    ['kobra', 'KOBRA', 'MOTOR OIL', '#2a9a3a', '#f2c21b'],
    ['burger-duck', 'BURGER', 'DUCK', '#f2a21a', '#b31313'],
    ['rapid', 'RAPID', 'TIRES', '#1a8ae0', '#ffffff'],
    ['neon-fm', 'NEON', '98.1 FM', '#e02a9a', '#ff5ce1'],
    ['sunset', 'SUNSET', 'SUNGLASSES', '#f06a2a', '#fff4d0'],
    ['hotline-pizza', 'HOTLINE', 'PIZZA', '#c8141c', '#ffffff'],
    ['apex-energy', 'APEX', 'ENERGY', '#18c040', '#ffffff'],
    ['velocita-state-lottery', 'VELOCITA', 'STATE LOTTERY', '#f2d22a', '#ffffff'],
    ['gold-coast-airlines', 'GOLD COAST', 'AIRLINES', '#c8a020', '#ffffff'],
    ['svgp', 'SVGP', 'GRAND PRIX', '#c8141c', '#ffffff'],
    ['max-hardware', 'MAX', 'HARDWARE', '#e08a1a', '#ffffff'],
  ].map(([slug, a, b, col, fg]) => photoTex(256, 128, [], (g, P, LG) => {
    g.fillStyle = '#0c0b10'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = col; g.fillRect(0, 108, 256, 8);
    if (!fitLogo(g, LG(slug), 128, 56, 228, 92)) {
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.font = 'bold 60px Impact, Arial Black, sans-serif'; g.fillText(a, 128, 64);
      g.font = 'bold 24px Arial'; g.fillText(b, 128, 94);
    }
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 120);
  }, [slug], false));
  // checkered start line
  {
    const [c, g] = canvas(64, 16);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f0f0f0'; g.fillRect(x * 4, y * 4, 4, 4); }
    cache.checker = tex(c, true, true);
  }
  // the Yard of Bricks (Indianapolis's start line, track.dress.start 'bricks'): worn red brick in rows, grey mortar;
  // one tile is 2 m across the track, the strip's 0.9 m along it
  {
    const [c, g] = canvas(64, 16); let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#6d6a63'; g.fillRect(0, 0, 64, 16);
    for (let row = 0; row < 4; row++) for (let k = -1; k < 9; k++) {
      const x = k * 8 + (row % 2) * 4, v = rnd();
      g.fillStyle = `rgb(${92 + v * 40 | 0},${46 + v * 18 | 0},${36 + v * 12 | 0})`; g.fillRect(x + 1, row * 4 + 1, 7, 3);
    }
    cache.bricks = tex(c, true, true);
  }
  // soft round blob (shadows / coronas)
  {
    const [c, g] = canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    cache.blob = tex(c, false);
  }
  {
    const [c, g] = canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    // cross streaks like PS2 coronas
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
    cache.corona = tex(c, false);
  }
  // clouds
  {
    const [c, g] = canvas(256, 128);
    g.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * 256, y = 40 + rnd() * 50, r = 8 + rnd() * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    cache.clouds = tex(c);
  }
  // livery-free carbon
  {
    const [c, g] = canvas(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = ((x >> 1) + (y >> 1)) % 2 ? '#1b1b1f' : '#26262c'; g.fillRect(x, y, 1, 1); }
    cache.carbon = tex(c);
  }
  // tyre sidewall
  {
    const [c, g] = canvas(32, 32);
    g.fillStyle = '#141414'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(16, 16, 11, 0, 7); g.fill();
    g.fillStyle = '#9a9aa2'; g.beginPath(); g.arc(16, 16, 8, 0, 7); g.fill();
    g.fillStyle = '#555'; g.beginPath(); g.arc(16, 16, 3, 0, 7); g.fill();
    g.strokeStyle = '#e2c23a'; g.lineWidth = 1; g.beginPath(); g.arc(16, 16, 12.5, 0.3, 1.2); g.stroke();
    g.beginPath(); g.arc(16, 16, 12.5, 3.4, 4.3); g.stroke();
    cache.wheel = tex(c, false);
  }
  streetTextures(cache);
  // pit lane: oil_stained_asphalt, no lines or rubber (the lane's lines are painted: world.js)
  cache.pitAsphalt = photoTex(128, 128, ['oil_stained_asphalt'], (g, P) => tilePhoto(g, P('oil_stained_asphalt'), 128, 128, '#4c4c51', 48));
  // dirt track (u across the width, v along): the PSX clay (assets/textures) with a darker damp groove where the cars
  // run, loose lighter dirt (the cushion) built up at both edges and tyre lines along it. Painted procedurally until
  // the photo arrives, then again over it. Own seed: the rest don't change
  {
    // (256 px: the clay photo 2 x 2, about 6.5 m a photo, its stones at their size; the rest drawn at 128 and doubled)
    const [c, g] = canvas(256, 256);
    const paint = (img) => {
      const s0 = seed; seed = 4242;
      g.setTransform(2, 0, 0, 2, 0, 0);
      noiseFill(g, 128, 128, '#7a5a3c', 0.24, 1);
      blotches(g, 128, 128, 40, ['rgba(60,40,24,0.22)', 'rgba(150,118,84,0.14)', 'rgba(96,70,46,0.18)'], 3, 14);
      if (img) for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64]]) g.drawImage(img, x, y, 64, 64);
      const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, 'rgba(176,142,104,0.55)'); grd.addColorStop(0.12, 'rgba(150,118,84,0.25)'); grd.addColorStop(0.3, 'rgba(40,26,14,0.22)');
      grd.addColorStop(0.7, 'rgba(40,26,14,0.22)'); grd.addColorStop(0.88, 'rgba(150,118,84,0.25)'); grd.addColorStop(1, 'rgba(176,142,104,0.55)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 14; k++) { const x = 18 + rnd() * 92; g.fillStyle = `rgba(36,22,12,${0.06 + rnd() * 0.08})`; g.fillRect(x, 0, 1 + rnd() * 2, 128); }
      if (!img) for (let k = 0; k < 420; k++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(196,170,136,${0.3 + rnd() * 0.4})` : `rgba(48,32,20,${0.3 + rnd() * 0.4})`; g.fillRect(rnd() * 128, rnd() * 128, 1 + (rnd() < 0.2), 1); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      seed = s0;
    };
    paint(null);
    cache.dirt = tex(c);
    const im = new Image();
    im.onload = () => { paint(im); cache.dirt.needsUpdate = true; };
    im.src = textureUrl('clay');
  }
  return cache;
}

// ---------- street surfaces: road asphalt, paving slabs, kerbstones, gutters (own seed so the rest don't change) ----------
function streetTextures(cache) {
  let sd = 90210;
  const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  // draw something at every wrapped offset so the texture tiles seamlessly
  const wrap = (w, h, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
  const speckle = (g, w, h, n, cols, sz = 1) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), sz, sz); } };
  const grain = (g, w, h, amt) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (r() - 0.5) * amt; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(x, y, 1, 1); } };
  // road asphalt, no painted lines (8 m square per repeat): cracked_asphalt_02, 2 m a photo, with oil stains
  cache.roadAsphalt = photoTex(256, 256, ['cracked_asphalt_02'], (g, P) => {
    const W = 256; sd = 90210;
    tilePhoto(g, P('cracked_asphalt_02'), W, W, '#48494e', 34);
    // oil drips (the texture is mapped in world space, so they're scattered, not in lanes)
    for (let i = 0; i < 30; i++) { const x = r() * W, y = r() * W, rr = 1.5 + r() * 5; wrap(W, W, (ox, oy) => { g.fillStyle = `rgba(10,10,12,${0.15 + r() * 0.25})`; g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * (1 + r()), 0, 0, 7); g.fill(); }); }
  });
  cache.roadAsphalt.anisotropy = 4;
  // paving slabs: 2 m square per repeat, 3 x 3 slabs of concrete_02 with joints, a few cracked / stained / replaced
  // ones, gum
  cache.pavement = photoTex(128, 128, ['concrete_02'], (g, P) => {
    const W = 128, n = 3, sz = W / n; sd = 31337;
    tilePhoto(g, P('concrete_02'), W, W, '#b2aea4');
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const t = (r() - 0.5) * 0.16, warm = r() < 0.15;
      g.fillStyle = warm ? 'rgba(150,120,80,0.1)' : t > 0 ? `rgba(255,255,255,${t})` : `rgba(0,0,0,${-t})`; g.fillRect(a * sz, b * sz, sz, sz);
    }
    for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * W, rr = 3 + r() * 9; wrap(W, W, (ox, oy) => { g.fillStyle = 'rgba(70,64,52,0.13)'; g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * 0.7, r() * 3, 0, 7); g.fill(); }); }
    speckle(g, W, W, 14, ['rgba(40,40,40,0.55)', 'rgba(230,230,225,0.7)'], 2); // chewing gum
    // joints: dark groove + light bevel
    for (let k = 0; k < n; k++) {
      g.fillStyle = 'rgba(55,52,48,0.85)'; g.fillRect(k * sz, 0, 1.5, W); g.fillRect(0, k * sz, W, 1.5);
      g.fillStyle = 'rgba(235,232,224,0.35)'; g.fillRect(k * sz + 1.5, 0, 1, W); g.fillRect(0, k * sz + 1.5, W, 1);
    }
    // a couple of cracked slabs
    for (let i = 0; i < 2; i++) { const a = Math.floor(r() * n), b = Math.floor(r() * n); g.strokeStyle = 'rgba(50,48,44,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a * sz + 2, b * sz + r() * sz); g.lineTo(a * sz + sz * 0.5, b * sz + r() * sz); g.lineTo(a * sz + sz - 2, b * sz + r() * sz); g.stroke(); }
  });
  sd = 4242; // (kerbstones and gutters: their own random numbers)
  // granite kerbstones: 2 m per repeat (two 1 m blocks). v runs across the kerb (top / face)
  {
    const W = 128, H = 32, [c, g] = canvas(W, H);
    g.fillStyle = '#9d9a94'; g.fillRect(0, 0, W, H);
    grain(g, W, H, 0.2);
    speckle(g, W, H, 700, ['#6e6c68', '#c4c1ba', '#55534f', '#b1aea7']);
    for (const x of [0, 64]) { g.fillStyle = 'rgba(40,38,36,0.75)'; g.fillRect(x, 0, 1.5, H); g.fillStyle = 'rgba(230,228,220,0.3)'; g.fillRect(x + 1.5, 0, 1, H); }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, W, 3);          // worn arris along the top
    g.fillStyle = 'rgba(30,28,24,0.25)'; g.fillRect(0, H - 6, W, 6);         // road grime at the foot
    cache.kerbStone = tex(c);
  }
  // gutter channel along the kerb: u 0 = road side, 1 = kerb side; 12 m per repeat with one drain grate
  {
    const W = 16, H = 256, [c, g] = canvas(W, H);
    g.fillStyle = '#6c6b67'; g.fillRect(0, 0, W, H);
    grain(g, W, H, 0.18);
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(35,30,22,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);                                   // grime collects against the kerb
    for (let y = 0; y < H; y += 21) { g.fillStyle = 'rgba(40,40,38,0.5)'; g.fillRect(0, y, W, 1); } // concrete block joints
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(60,48,30,${0.1 + r() * 0.2})`; g.fillRect(W - 3 - r() * 5, r() * H, 3 + r() * 3, 2 + r() * 6); } // leaves / dirt
    // drain grate
    const gy = 120; g.fillStyle = '#1d1d1f'; g.fillRect(2, gy, W - 3, 22); g.fillStyle = '#4a4a4c';
    for (let k = 0; k < 6; k++) g.fillRect(2, gy + 2 + k * 3.4, W - 3, 1.4);
    g.strokeStyle = '#2a2a2c'; g.lineWidth = 1; g.strokeRect(1.5, gy - 0.5, W - 2, 23);
    cache.gutter = tex(c);
  }
}

// ---------- building facades (v=0 is the bottom of the canvas / ground level) ----------
// Each style: { day, lit (emissive mask for night), tileW, tileH } in metres per texture repeat.
const bcache = {};
export function getBuildingTextures() {
  if (bcache.house) return bcache;
  seed = 4242;
  const pair = (w, h, paint) => {
    const [c, g] = canvas(w, h), [cl, gl] = canvas(w, h);
    gl.fillStyle = '#000'; gl.fillRect(0, 0, w, h);
    paint(g, gl);
    return { day: tex(c), lit: tex(cl) };
  };
  const litWin = (gl, x, y, w, h, p = 0.45) => {
    if (rnd() < p) { gl.fillStyle = rnd() < 0.5 ? '#ffe2a0' : '#ffd07a'; gl.fillRect(x, y, w, h); }
  };
  // house: 6m x 3m (one storey), light siding + one window
  bcache.house = { tileW: 6, tileH: 3, ...pair(64, 32, (g, gl) => {
    g.fillStyle = '#e6e2d8'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = 'rgba(0,0,0,0.07)'; for (let y = 1; y < 32; y += 3) g.fillRect(0, y, 64, 1);
    noiseFill(g, 64, 32, 'rgba(0,0,0,0)', 0.08, 2);
    g.fillStyle = '#f8f6f0'; g.fillRect(20, 8, 24, 16);
    g.fillStyle = '#3c4a58'; g.fillRect(22, 10, 20, 12);
    g.fillStyle = 'rgba(170,200,230,0.35)'; g.fillRect(22, 10, 20, 4);
    g.fillStyle = '#f8f6f0'; g.fillRect(31, 10, 2, 12);
    litWin(gl, 22, 10, 20, 12, 0.4);
  }) };
  // shop: 10m x 8m, storefront at the bottom, two windows above
  bcache.shop = { tileW: 10, tileH: 8, ...pair(128, 96, (g, gl) => {
    g.fillStyle = '#c9b89a'; g.fillRect(0, 0, 128, 96);
    noiseFill(g, 128, 96, 'rgba(0,0,0,0)', 0.1, 2);
    for (const x of [18, 74]) { g.fillStyle = '#2c3440'; g.fillRect(x, 12, 36, 26); g.fillStyle = 'rgba(160,190,220,0.3)'; g.fillRect(x, 12, 36, 8); litWin(gl, x, 12, 36, 26, 0.35); }
    const aw = ['#b42222', '#1f5fa8', '#2f8a3a', '#d8a020'][Math.floor(rnd() * 4)];
    for (let x = 0; x < 128; x += 16) { g.fillStyle = (x / 16) % 2 ? '#f0f0e8' : aw; g.fillRect(x, 50, 16, 8); }
    g.fillStyle = '#1c2630'; g.fillRect(6, 58, 116, 36);
    g.fillStyle = 'rgba(190,220,240,0.35)'; g.fillRect(6, 58, 116, 10);
    g.fillStyle = '#8a8070'; for (const x of [6, 46, 86, 120]) g.fillRect(x, 58, 3, 36);
    gl.fillStyle = '#ffe8b0'; gl.fillRect(8, 60, 112, 32);
  }) };
  // apartment: 12m x 12m, 4 floors, balconies
  bcache.apartment = { tileW: 12, tileH: 12, ...pair(64, 64, (g, gl) => {
    g.fillStyle = '#b8a894'; g.fillRect(0, 0, 64, 64);
    noiseFill(g, 64, 64, 'rgba(0,0,0,0)', 0.12, 2);
    for (let fy = 0; fy < 4; fy++) for (let wx = 0; wx < 3; wx++) {
      const x = 4 + wx * 20, y = fy * 16 + 3;
      g.fillStyle = '#2a3440'; g.fillRect(x, y, 14, 9);
      g.fillStyle = 'rgba(160,190,220,0.3)'; g.fillRect(x, y, 14, 3);
      g.fillStyle = '#8a7c6a'; g.fillRect(x - 1, y + 9, 16, 3);
      litWin(gl, x, y, 14, 9, 0.5);
    }
  }) };
  // office: glass curtain wall 12m x 12m
  const glass = (base, frame, lit) => pair(64, 64, (g, gl) => {
    const grd = g.createLinearGradient(0, 0, 64, 64); grd.addColorStop(0, base[0]); grd.addColorStop(1, base[1]);
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, 64, 20);
    g.fillStyle = frame;
    for (let x = 0; x <= 64; x += 8) g.fillRect(x, 0, 1, 64);
    for (let y = 0; y <= 64; y += 16) g.fillRect(0, y, 64, 2);
    for (let fy = 0; fy < 4; fy++) for (let wx = 0; wx < 8; wx++) litWin(gl, wx * 8 + 1, fy * 16 + 2, 7, 14, lit);
  });
  bcache.office = { tileW: 12, tileH: 12, ...glass(['#6f8aa6', '#3c5470'], '#2a3440', 0.35) };
  bcache.tower = { tileW: 12, tileH: 12, ...glass(['#4a6a94', '#1e3050'], '#9aa8b8', 0.3) };
  // warehouse: corrugated metal 12m x 8m with a roller door
  bcache.warehouse = { tileW: 12, tileH: 8, ...pair(64, 48, (g, gl) => {
    g.fillStyle = '#b4b2a8'; g.fillRect(0, 0, 64, 48);
    for (let x = 0; x < 64; x += 3) { g.fillStyle = x % 6 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 2, 48); }
    g.fillStyle = '#7a7c80'; g.fillRect(20, 22, 24, 26);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 24; y < 48; y += 3) g.fillRect(20, y, 24, 1);
    g.fillStyle = '#c8a020'; g.fillRect(0, 44, 64, 4);
    gl.fillStyle = '#000'; gl.fillRect(0, 0, 64, 48);
  }) };
  // roofs
  {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 6, 64, 2);
      for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y, 1, 7); }
    }
    noiseFill(g, 64, 64, 'rgba(0,0,0,0)', 0.12, 2);
    bcache.roofTiles = tex(c);
  }
  {
    const [c, g] = canvas(64, 64);
    noiseFill(g, 64, 64, '#b4b0a6', 0.22, 2);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 6; k++) g.fillRect(Math.floor(rnd() * 56), Math.floor(rnd() * 56), 6 + rnd() * 6, 4 + rnd() * 5);
    bcache.roofFlat = tex(c);
  }
  return bcache;
}
