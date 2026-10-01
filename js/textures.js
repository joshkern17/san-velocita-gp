// Procedural low-res "PS2" textures painted on canvas
import * as THREE from 'three';

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

const cache = {};
export function getTextures() {
  if (cache.asphalt) return cache;
  seed = 1337;

  // asphalt with painted edge lines (u across width, v along track)
  {
    const [c, g] = canvas(128, 128);
    noiseFill(g, 128, 128, '#4a4a4e', 0.22, 1);
    blotches(g, 128, 128, 30, ['rgba(20,20,24,0.18)', 'rgba(120,120,120,0.08)'], 3, 12);
    // racing line rubber
    const grd = g.createLinearGradient(0, 0, 128, 0);
    grd.addColorStop(0.2, 'rgba(0,0,0,0)'); grd.addColorStop(0.45, 'rgba(10,10,10,0.18)');
    grd.addColorStop(0.6, 'rgba(10,10,10,0.18)'); grd.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e8e8e0'; g.fillRect(3, 0, 3, 128); g.fillRect(122, 0, 3, 128);
    cache.asphalt = tex(c);
  }
  // city asphalt (dashed centre line)
  {
    const [c, g] = canvas(128, 128);
    noiseFill(g, 128, 128, '#414147', 0.2, 1);
    blotches(g, 128, 128, 26, ['rgba(20,20,24,0.2)', 'rgba(130,130,130,0.07)'], 3, 14);
    g.fillStyle = '#d9c85a'; g.fillRect(3, 0, 3, 128); g.fillRect(122, 0, 3, 128);
    g.fillStyle = 'rgba(230,230,230,0.8)'; g.fillRect(62, 0, 3, 64);
    cache.asphaltCity = tex(c);
  }
  // kerb red/white
  {
    const [c, g] = canvas(16, 64);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#e9e6df' : '#c3221f'; g.fillRect(0, i * 16, 16, 16); }
    noiseFill(g, 16, 64, 'rgba(0,0,0,0)', 0.1, 1);
    const t = tex(c); cache.kerb = t;
  }
  // grass
  {
    const [c, g] = canvas(128, 128);
    noiseFill(g, 128, 128, '#6f8f45', 0.28, 2);
    blotches(g, 128, 128, 40, ['rgba(60,90,30,0.35)', 'rgba(150,160,80,0.25)', 'rgba(90,70,40,0.2)'], 4, 16);
    cache.grass = tex(c);
  }
  // sand
  {
    const [c, g] = canvas(128, 128);
    noiseFill(g, 128, 128, '#c89a62', 0.22, 2);
    blotches(g, 128, 128, 40, ['rgba(160,100,50,0.3)', 'rgba(230,190,130,0.3)'], 4, 18);
    cache.sand = tex(c);
  }
  // concrete / pavement
  {
    const [c, g] = canvas(128, 128);
    noiseFill(g, 128, 128, '#8f8c86', 0.2, 2);
    g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 1;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    blotches(g, 128, 128, 20, ['rgba(40,40,30,0.15)'], 3, 10);
    cache.concrete = tex(c);
  }
  // gravel
  {
    const [c, g] = canvas(64, 64);
    noiseFill(g, 64, 64, '#a89878', 0.4, 1);
    cache.gravel = tex(c);
  }
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
  // armco
  {
    const [c, g] = canvas(64, 32);
    const grd = g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, '#d8dce0'); grd.addColorStop(0.3, '#9aa0a8'); grd.addColorStop(0.5, '#e8ecf0');
    grd.addColorStop(0.7, '#8a9098'); grd.addColorStop(1, '#6a7078');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#444'; g.fillRect(30, 0, 4, 32);
    cache.armco = tex(c);
  }
  // concrete wall with ad banners
  {
    const [c, g] = canvas(256, 32);
    noiseFill(g, 256, 32, '#b5b0a6', 0.15, 2);
    const ads = [['VOLTA COLA', '#c01818', '#fff'], ['KOBRA OIL', '#111', '#f2c21b'], ['RAPID TYRES', '#1a4fb0', '#fff'], ['NEON 98.1 FM', '#6a1ab0', '#ffe0ff']];
    ads.forEach((a, i) => {
      g.fillStyle = a[1]; g.fillRect(i * 64 + 2, 6, 60, 18);
      g.fillStyle = a[2]; g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(a[0], i * 64 + 32, 15.5);
    });
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 28, 256, 4);
    cache.wall = tex(c);
  }
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
  // billboards
  cache.billboards = [
    ['VOLTA', 'COLA', '#c01818', '#ffffff', '#ffd23a'],
    ['KOBRA', 'MOTOR OIL', '#101010', '#f2c21b', '#e33'],
    ['BURGER', 'DUCK', '#f4c01a', '#b31313', '#3a2a10'],
    ['RAPID', 'TYRES', '#1a4fb0', '#ffffff', '#9fd0ff'],
    ['NEON', '98.1 FM', '#26104a', '#ff5ce1', '#6ff'],
    ['SUNSET', 'MOTEL', '#f07a2a', '#fff4d0', '#6a1a0a'],
  ].map(([a, b, bg, fg, acc]) => {
    const [c, g] = canvas(128, 64);
    g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
    g.fillStyle = acc; g.fillRect(0, 50, 128, 6);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = 'bold 30px Impact, Arial Black, sans-serif'; g.fillText(a, 64, 32);
    g.font = 'bold 12px Arial'; g.fillText(b, 64, 47);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(2, 2, 124, 60);
    return tex(c, false);
  });
  // checkered start line
  {
    const [c, g] = canvas(64, 16);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f0f0f0'; g.fillRect(x * 4, y * 4, 4, 4); }
    cache.checker = tex(c, true, true);
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
  // road asphalt, no painted lines (8 m square per repeat): aggregate, tar-sealed cracks, patches, oil stains, wear
  {
    const W = 256, [c, g] = canvas(W, W);
    g.fillStyle = '#48494e'; g.fillRect(0, 0, W, W);
    grain(g, W, W, 0.16);
    speckle(g, W, W, 2600, ['#5d5e63', '#393a3e', '#6b6a66', '#2e2f33']);
    // big soft tonal variation
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * W, rr = 20 + r() * 50, dark = r() < 0.5; wrap(W, W, (ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr); gr.addColorStop(0, dark ? 'rgba(20,20,24,0.16)' : 'rgba(150,150,150,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2); }); }
    // patch repairs (slightly darker, crisp edges)
    for (let i = 0; i < 3; i++) { const x = r() * W, y = r() * W, w = 24 + r() * 40, h = 16 + r() * 50, col = r() < 0.6 ? 'rgba(28,28,32,0.22)' : 'rgba(110,110,112,0.12)'; wrap(W, W, (ox, oy) => { g.fillStyle = col; g.fillRect(x + ox, y + oy, w, h); g.strokeStyle = 'rgba(15,15,18,0.25)'; g.lineWidth = 1; g.strokeRect(x + ox + 0.5, y + oy + 0.5, w, h); }); }
    // cracks sealed with tar: wandering dark lines
    for (let i = 0; i < 9; i++) {
      let x = r() * W, y = r() * W, a = r() * Math.PI * 2; const pts = [[x, y]], n = 6 + Math.floor(r() * 10);
      for (let k = 0; k < n; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 4; y += Math.sin(a) * 4; pts.push([x, y]); }
      wrap(W, W, (ox, oy) => { g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2.6; g.stroke(); g.strokeStyle = 'rgba(18,18,20,0.4)'; g.lineWidth = 1; g.stroke(); });
    }
    // oil drips (the texture is mapped in world space, so they're scattered, not in lanes)
    for (let i = 0; i < 30; i++) { const x = r() * W, y = r() * W, rr = 1.5 + r() * 5; wrap(W, W, (ox, oy) => { g.fillStyle = `rgba(10,10,12,${0.15 + r() * 0.25})`; g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * (1 + r()), 0, 0, 7); g.fill(); }); }
    cache.roadAsphalt = tex(c); cache.roadAsphalt.anisotropy = 4;
  }
  // paving slabs: 2 m square per repeat, 3 x 3 slabs with joints, a few cracked / stained / replaced ones, gum
  {
    const W = 128, n = 3, sz = W / n, [c, g] = canvas(W, W);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const t = (r() - 0.5) * 18, warm = r() < 0.15 ? 10 : 0;
      g.fillStyle = `rgb(${178 + t + warm},${174 + t + warm * 0.6},${164 + t})`; g.fillRect(a * sz, b * sz, sz, sz);
    }
    grain(g, W, W, 0.12);
    speckle(g, W, W, 500, ['rgba(90,86,80,0.5)', 'rgba(220,216,206,0.5)']);
    for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * W, rr = 3 + r() * 9; wrap(W, W, (ox, oy) => { g.fillStyle = 'rgba(70,64,52,0.13)'; g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * 0.7, r() * 3, 0, 7); g.fill(); }); }
    speckle(g, W, W, 14, ['rgba(40,40,40,0.55)', 'rgba(230,230,225,0.7)'], 2); // chewing gum
    // joints: dark groove + light bevel
    for (let k = 0; k < n; k++) {
      g.fillStyle = 'rgba(55,52,48,0.85)'; g.fillRect(k * sz, 0, 1.5, W); g.fillRect(0, k * sz, W, 1.5);
      g.fillStyle = 'rgba(235,232,224,0.35)'; g.fillRect(k * sz + 1.5, 0, 1, W); g.fillRect(0, k * sz + 1.5, W, 1);
    }
    // a couple of cracked slabs
    for (let i = 0; i < 2; i++) { const a = Math.floor(r() * n), b = Math.floor(r() * n); g.strokeStyle = 'rgba(50,48,44,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a * sz + 2, b * sz + r() * sz); g.lineTo(a * sz + sz * 0.5, b * sz + r() * sz); g.lineTo(a * sz + sz - 2, b * sz + r() * sz); g.stroke(); }
    cache.pavement = tex(c);
  }
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
