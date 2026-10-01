// Street life: the little moving things that make a place feel lived in. Paper and leaves blowing along the
// pavements (and kicked up by passing cars), steam from vents in the road, pigeons circling over town, and at night
// vending machines, phone boxes and signs glowing (some of them flickering). All cheap, all around the camera.
import * as THREE from 'three';
import { envMatrix, envAsset } from './envlib.js';

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 4 scraps in one texture: newspaper, white paper, brown bag, leaf
function scrapTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#d8d6cc'; g.fillRect(2, 3, 28, 22); g.fillStyle = '#6a6a66'; for (let y = 6; y < 24; y += 3) g.fillRect(5, y, 22, 1); g.fillRect(5, 5, 22, 3);
  g.fillStyle = '#f0f0ea'; g.beginPath(); g.moveTo(35, 4); g.lineTo(62, 2); g.lineTo(60, 26); g.lineTo(36, 28); g.fill();
  g.fillStyle = '#9a7650'; g.fillRect(3, 36, 26, 24); g.fillStyle = '#7a5a3a'; g.fillRect(3, 36, 26, 4);
  g.fillStyle = '#b8862e'; g.beginPath(); g.ellipse(48, 48, 13, 8, 0.6, 0, 7); g.fill(); g.strokeStyle = '#6a4a1a'; g.beginPath(); g.moveTo(38, 56); g.lineTo(58, 40); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
function softDot(size = 32) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2, grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// point sprites with per-point colour, alpha and size (glows, steam)
function pointsMaterial(additive, fogOn = true) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: softDot(64) }, scale: { value: 320 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    vertexShader: `attribute float size; attribute vec4 tint; varying vec4 vT; uniform float scale;
      #include <fog_pars_vertex>
      void main(){ vT = tint; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vT;
      #include <fog_pars_fragment>
      void main(){ float a = texture2D(map, gl_PointCoord).a * vT.a; if (a < 0.01) discard; gl_FragColor = vec4(vT.rgb, a);
      #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: fogOn, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export class StreetLife {
  // data: { spots: [[x,z]], vents: [[x,z]], glows: [{x,y,z,c,r,f}] }; o: { life 0..1, night, dusk, rain, seed, gh(x,z) }
  constructor(root, data, o) {
    this.o = o; this.gh = o.gh; this.rng = mulberry((o.seed || 1) * 31 + 5);
    const life = o.life ?? 0.6;
    this.spots = data.spots || []; this.near = []; this.nearT = 0;
    this.wind = { x: Math.cos(o.seed || 1), z: Math.sin(o.seed || 1) };
    // ---- blowing scraps ----
    const nS = this.spots.length ? Math.round(life * (o.rain ? 18 : 45)) : 0;
    this.scraps = [];
    if (nS) {
      const geo = new THREE.PlaneGeometry(0.5, 0.38);
      const uv = geo.attributes.uv; // (atlas cell chosen per instance through the colour trick below: use 4 meshes instead)
      this.scrapMeshes = [0, 1, 2, 3].map(k => {
        const g2 = geo.clone(), u = g2.attributes.uv;
        for (let i = 0; i < u.count; i++) u.setXY(i, (k % 2) * 0.5 + u.getX(i) * 0.5, (k < 2 ? 0.5 : 0) + u.getY(i) * 0.5);
        const m = new THREE.InstancedMesh(g2, new THREE.MeshLambertMaterial({ map: this.scrapTex || (this.scrapTex = scrapTexture()), side: THREE.DoubleSide, alphaTest: 0.5, transparent: false, emissive: o.night ? 0x3a3a38 : 0x202020 }), Math.ceil(nS / 4) + 1);
        m.frustumCulled = false; m.count = 0; root.add(m); return m;
      });
      for (let i = 0; i < nS; i++) this.scraps.push({ k: i % 4, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sp: 0, t: 0, dead: true });
    }
    // ---- steam from vents ----
    this.vents = data.vents || [];
    const nP = this.vents.length ? Math.round(life * 260) : 0;
    this.puffs = null;
    if (nP) {
      const g = new THREE.BufferGeometry();
      this.pp = new Float32Array(nP * 3); this.pv = new Float32Array(nP * 3); this.pl = new Float32Array(nP); this.ps = new Float32Array(nP); this.pt = new Float32Array(nP * 4);
      g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.ps, 1)); g.setAttribute('tint', new THREE.BufferAttribute(this.pt, 4));
      this.puffMat = pointsMaterial(false);
      this.puffs = new THREE.Points(g, this.puffMat); this.puffs.frustumCulled = false; this.puffs.renderOrder = 6; root.add(this.puffs);
      this.pi = 0; this.emitAcc = 0;
    }
    // ---- pigeons (day / dusk, dry) ----
    this.flocks = [];
    const nF = !o.night && !o.rain && this.spots.length ? Math.round(life * 5) : 0;
    if (nF) {
      const wing = new THREE.BufferGeometry();
      wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.32, 0.06, -0.05, 0, 0, -0.12, 0, 0, 0.12, 0, 0, -0.12, 0.32, 0.06, -0.05], 3));
      wing.scale(1.7, 1.7, 1.7); wing.computeVertexNormals(); // a touch big, so they read at a distance
      const per = 9;
      this.birds = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: o.dusk ? 0x2a2230 : 0x3a3c44, side: THREE.DoubleSide, fog: true }), nF * per);
      this.birds.frustumCulled = false; root.add(this.birds);
      for (let f = 0; f < nF; f++) {
        const s = this.spots[Math.floor(this.rng() * this.spots.length)];
        const fl = { cx: s[0], cz: s[1], R: 18 + this.rng() * 30, h: 14 + this.rng() * 16, w: (0.25 + this.rng() * 0.3) * (this.rng() < 0.5 ? -1 : 1), a: this.rng() * 6.28, b: [] };
        for (let k = 0; k < per; k++) fl.b.push({ dx: (this.rng() - 0.5) * 7, dy: (this.rng() - 0.5) * 3, dz: (this.rng() - 0.5) * 7, ph: this.rng() * 6.28 });
        this.flocks.push(fl);
      }
    }
    // ---- night glows ----
    this.glows = null;
    const G = (o.night || o.dusk) ? (data.glows || []) : [];
    if (G.length) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(G.length * 3), size = new Float32Array(G.length), tint = new Float32Array(G.length * 4);
      G.forEach((q, i) => { pos.set([q.x, this.gh(q.x, q.z) + q.y, q.z], i * 3); size[i] = q.r * 1.5; tint.set([...q.c, (o.night ? 1 : 0.4) * (q.a ?? 1)], i * 4); });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
      this.glowMat = pointsMaterial(true, false);
      this.glows = new THREE.Points(g, this.glowMat); this.glows.frustumCulled = false; this.glows.renderOrder = 5; root.add(this.glows);
      this.glowData = G;
      // light pools on the pavement in front of them
      if (false) { // (ground light pools removed: they read as a big glowing blob)
        const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), G.length);
        const m = new THREE.Matrix4(), col = new THREE.Color();
        G.forEach((q, i) => { m.makeScale(q.r * 2.2, 1, q.r * 2.2); m.setPosition(q.x, this.gh(q.x, q.z) + 0.08, q.z); pool.setMatrixAt(i, m); col.setRGB(q.c[0] * 0.6, q.c[1] * 0.6, q.c[2] * 0.6); pool.setColorAt(i, col); });
        pool.renderOrder = 3; root.add(pool);
      }
    }
    // ---- dust motes drifting in the air around the camera (catch the low sun at dusk) ----
    this.motes = null;
    const nM = o.rain ? 0 : Math.round(life * 170);
    if (nM) {
      const g = new THREE.BufferGeometry();
      this.mp = new Float32Array(nM * 3); this.mph = new Float32Array(nM);
      const size = new Float32Array(nM), tint = new Float32Array(nM * 4);
      const col = o.night ? [0.7, 0.8, 1, 0.18] : o.dusk ? [1, 0.78, 0.5, 0.55] : o.fog ? [1, 1, 1, 0.3] : [1, 0.96, 0.86, 0.28];
      for (let i = 0; i < nM; i++) { this.mp.set([(this.rng() - 0.5) * 60, 0.4 + this.rng() * 9, (this.rng() - 0.5) * 60], i * 3); this.mph[i] = this.rng() * 6.28; size[i] = 0.08 + this.rng() * 0.1; tint.set(col, i * 4); }
      g.setAttribute('position', new THREE.BufferAttribute(this.mp, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
      this.moteMat = pointsMaterial(true);
      this.motes = new THREE.Points(g, this.moteMat); this.motes.frustumCulled = false; this.motes.renderOrder = 7; root.add(this.motes);
      this.moteBase = null;
    }
    // ---- leaves falling from the trees near the camera ----
    this.trees = data.trees || []; this.leaves = [];
    const nL = this.trees.length && !o.rain ? Math.round(life * 60) : 0;
    if (nL) {
      const g = new THREE.PlaneGeometry(0.22, 0.16), u = g.attributes.uv;
      for (let i = 0; i < u.count; i++) u.setXY(i, 0.5 + u.getX(i) * 0.5, u.getY(i) * 0.5);
      this.leafMesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ map: this.scrapTex || (this.scrapTex = scrapTexture()), side: THREE.DoubleSide, alphaTest: 0.5 }), nL);
      this.leafMesh.frustumCulled = false; this.leafMesh.count = 0; root.add(this.leafMesh);
      const c = new THREE.Color();
      for (let i = 0; i < nL; i++) {
        this.leaves.push({ dead: true, x: 0, y: 0, z: 0, vy: 0, ph: 0, t: 0, g: 0 });
        c.setHSL(0.07 + this.rng() * 0.12, 0.6, 0.35 + this.rng() * 0.2); this.leafMesh.setColorAt(i, c);
      }
      this.nearTrees = []; this.treeT = 0;
    }
    // ---- loose rubbish that moves: cans and bottles roll, wrappers and paper bags blow, bin bags get shoved ----
    this.surf = o.surf || o.gh;
    this.movers = (data.movers || []).filter(p => p._h).map(p => ({ p, a: envAsset(p.id), ox: p.x, oz: p.z, v: 0, vx: 0, vz: 0, vy: 0, air: 0, bx: p.tx || 0, bz: p.tz || 0, wob: 0, th: 1.25 + this.rng() * 0.75 }));
    this.nearM = []; this.mT = 0;
    this.m = new THREE.Matrix4(); this.e = new THREE.Euler(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1);
  }

  updateMovers(dt, t, cx, cz, wx, wz, gust, cars) {
    const rng = this.rng;
    this.mT -= dt;
    if (this.mT <= 0) { this.mT = 0.7; this.nearM = this.movers.filter(m => Math.abs(m.p.x - cx) < 60 && Math.abs(m.p.z - cz) < 60); }
    const dirty = new Set();
    for (const m of this.nearM) {
      const p = m.p, a = m.a; if (!a) continue;
      let moved = false;
      // passing cars: a shove away from the car and along with it
      let kx = 0, kz = 0;
      for (const c of cars) {
        const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz;
        if (d2 < 30 && c.speed > 10) { const d = Math.sqrt(d2) || 1, k = (1 - d / 5.5) * Math.min(1, c.speed / 45); if (k > 0) { kx += (dx / d * 6 + (c.vx || 0) * 0.15) * k; kz += (dz / d * 6 + (c.vz || 0) * 0.15) * k; } }
      }
      if (p.mv === 'roll') {
        // rolls along the direction across its axis; the wind and cars push it, friction slows it
        const fx = Math.sin(p.rot), fz = Math.cos(p.rot), r = Math.max(0.03, Math.min(a.w, a.d) * (p.s || 1) / 2);
        const push = (wx * fx + wz * fz) * (gust > m.th ? 0.45 : 0) + (kx * fx + kz * fz) * 3;
        m.v += push * dt; m.v *= Math.exp(-dt * 1.1);
        if (Math.abs(m.v) > 0.02) {
          p.x += fx * m.v * dt; p.z += fz * m.v * dt; p.sp = (p.sp || 0) + m.v / r * dt;
          p.rot += m.v * dt * 0.05 * Math.sin(t * 0.7 + m.ox); // cans never roll quite straight
          moved = true;
        }
      } else {
        const heavy = p.mv === 'bag', lift = heavy ? 0 : 1;
        // gusts pick up the light stuff (hop and tumble); cars shove everything
        if (!m.air && !heavy && gust > m.th && rng() < dt * 0.5) { m.air = 1; m.vy = 1 + rng() * 1.8; m.vx = wx * 0.6; m.vz = wz * 0.6; }
        if (kx || kz) { m.vx += kx * dt * (heavy ? 1.2 : 5); m.vz += kz * dt * (heavy ? 1.2 : 5); if (!heavy && Math.hypot(kx, kz) > 2) { m.air = 1; m.vy = Math.max(m.vy, 1.5 * lift); } }
        if (m.air) {
          m.vx += (wx - m.vx) * 1.4 * dt; m.vz += (wz - m.vz) * 1.4 * dt; m.vy -= 4 * dt;
          p.tx = (p.tx || 0) + dt * 7; p.tz = (p.tz || 0) + dt * 4.5; p.rot += dt * 2;
        } else {
          const f = Math.exp(-dt * (heavy ? 5 : 3)); m.vx *= f; m.vz *= f;
          if (heavy && gust > m.th + 0.1) m.wob += dt * 6; // bin bags just flap a bit in a strong gust
          p.tx = m.bx + Math.sin(m.wob) * 0.08; p.tz = m.bz + Math.cos(m.wob * 0.7) * 0.06;
        }
        const sp = Math.hypot(m.vx, m.vz);
        if (sp > 0.02 || m.air || (heavy && gust > m.th + 0.1)) {
          p.x += m.vx * dt; p.z += m.vz * dt; m.y = (m.y ?? 0) + m.vy * dt;
          moved = true;
        }
      }
      if (!moved) continue;
      const g = this.surf(p.x, p.z) + 0.005;
      if (p.mv !== 'roll' && m.air) {
        m.y = Math.max(0, (m.y ?? 0)); p.y = g + m.y;
        if (m.y <= 0 && m.vy < 0) { m.air = 0; m.vy = 0; m.y = 0; m.bx = Math.PI / 2 + (rng() - 0.5) * 0.3; m.bz = 0; p.tx = m.bx; p.tz = 0; }
      } else p.y = g;
      envMatrix(p, a, this.m);
      for (const [im, k] of p._h) { im.setMatrixAt(k, this.m); dirty.add(im); }
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }

  // cars: [{ x, z, speed }]
  update(dt, t, camera, cars = [], fog) {
    dt = Math.min(dt, 0.05);
    const cx = camera.position.x, cz = camera.position.z, rng = this.rng;
    // gusty wind that slowly swings round
    const gust = 0.6 + 0.5 * Math.sin(t * 0.37) + 0.35 * Math.sin(t * 1.3 + 1) + (Math.sin(t * 0.11) > 0.7 ? 1.2 : 0);
    const wa = Math.atan2(this.wind.z, this.wind.x) + Math.sin(t * 0.05) * 0.6, wx = Math.cos(wa) * gust * 1.3, wz = Math.sin(wa) * gust * 1.3;
    // pavement spots near the camera (refreshed now and then)
    this.nearT -= dt;
    if (this.nearT <= 0 && this.spots.length) { this.nearT = 0.8; this.near = this.spots.filter(s => Math.abs(s[0] - cx) < 42 && Math.abs(s[1] - cz) < 42); }
    // ---- scraps ----
    if (this.scraps.length) {
      const counts = [0, 0, 0, 0];
      for (const p of this.scraps) {
        if (p.dead || Math.abs(p.x - cx) > 55 || Math.abs(p.z - cz) > 55) {
          if (!this.near.length) { p.dead = true; continue; }
          const s = this.near[Math.floor(rng() * this.near.length)];
          Object.assign(p, { x: s[0] + (rng() - 0.5) * 6, z: s[1] + (rng() - 0.5) * 6, vx: 0, vy: 0, vz: 0, rx: -Math.PI / 2, ry: rng() * 6, rz: 0, sp: 0, t: 6 + rng() * 10, dead: false });
          p.y = this.gh(p.x, p.z) + 0.03;
        }
        const g = this.gh(p.x, p.z) + 0.03, air = p.y > g + 0.05;
        // blown by the wind (lighter ones more), lifted by strong gusts, kicked up by passing cars
        const drag = air ? 1.5 : (gust > 1.25 ? 0.8 : 0.12);
        p.vx += (wx * (p.k === 3 ? 1.3 : 1) - p.vx) * drag * dt; p.vz += (wz - p.vz) * drag * dt;
        if (!air && gust > 1.0 && rng() < dt * 2.5) p.vy = 1.2 + rng() * 2.4;
        for (const c of cars) {
          const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz;
          if (d2 < 49 && c.speed > 12) { const d = Math.sqrt(d2) || 1, k = (1 - d / 7) * Math.min(1, c.speed / 40); p.vx += (dx / d) * k * 14 * dt * 8 + (c.vx || 0) * k * dt * 2; p.vz += (dz / d) * k * 14 * dt * 8 + (c.vz || 0) * k * dt * 2; p.vy = Math.max(p.vy, 2.5 * k + rng()); }
        }
        p.vy -= 3.2 * dt; if (air) p.vy *= Math.exp(-dt * 1.5);
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        if (p.y < g) { p.y = g; p.vy = 0; }
        const speed = Math.hypot(p.vx, p.vz);
        p.sp += (air ? 9 : speed * 3) * dt; // tumbling
        p.t -= dt; if (p.t <= 0) p.dead = true;
        const mesh = this.scrapMeshes[p.k], n = counts[p.k]++;
        this.e.set(air ? p.sp : -Math.PI / 2 + Math.sin(p.sp) * 0.2 * Math.min(1, speed), p.ry + p.sp * 0.3, air ? p.sp * 0.7 : 0);
        this.m.compose(this.v.set(p.x, p.y + (air ? 0 : 0.01), p.z), this.q.setFromEuler(this.e), this.sc);
        mesh.setMatrixAt(n, this.m);
      }
      this.scrapMeshes.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; });
    }
    // ---- steam ----
    if (this.puffs) {
      const max = this.pl.length;
      this.emitAcc += dt * 40;
      const nearV = this.vents.filter(v => Math.abs(v[0] - cx) < 140 && Math.abs(v[1] - cz) < 140);
      while (this.emitAcc > 1 && nearV.length) {
        this.emitAcc--;
        const v = nearV[Math.floor(rng() * nearV.length)], i = this.pi = (this.pi + 1) % max;
        this.pp.set([v[0] + (rng() - 0.5) * 0.6, this.gh(v[0], v[1]) + 0.1, v[1] + (rng() - 0.5) * 0.6], i * 3);
        this.pv.set([(rng() - 0.5) * 0.3, 0.8 + rng() * 0.8, (rng() - 0.5) * 0.3], i * 3);
        this.pl[i] = 1; this.ps[i] = 0.7 + rng() * 0.5;
      }
      if (!nearV.length) this.emitAcc = 0;
      const bright = this.o.night ? 0.5 : 0.85, a0 = this.o.night ? 0.28 : 0.22;
      for (let i = 0; i < max; i++) {
        if (this.pl[i] <= 0) { this.pt[i * 4 + 3] = 0; continue; }
        this.pl[i] -= dt * 0.28;
        this.pv[i * 3] += wx * 0.25 * dt; this.pv[i * 3 + 2] += wz * 0.25 * dt;
        this.pp[i * 3] += this.pv[i * 3] * dt; this.pp[i * 3 + 1] += this.pv[i * 3 + 1] * dt; this.pp[i * 3 + 2] += this.pv[i * 3 + 2] * dt;
        this.ps[i] += dt * 1.1;
        const l = this.pl[i];
        this.pt.set([bright, bright, bright * 1.03, Math.max(0, l * (1 - l) * 4 * a0)], i * 4);
      }
      const g = this.puffs.geometry; g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.tint.needsUpdate = true;
      if (fog) { this.puffMat.uniforms.fogColor.value.copy(fog.color); this.puffMat.uniforms.fogNear.value = fog.near; this.puffMat.uniforms.fogFar.value = fog.far; }
    }
    // ---- pigeons ----
    if (this.flocks.length) {
      let n = 0;
      for (const f of this.flocks) {
        f.a += f.w * dt;
        // flocks that are far away drift over to somewhere near the camera
        if ((Math.abs(f.cx - cx) > 220 || Math.abs(f.cz - cz) > 220) && this.near.length) { const s = this.near[Math.floor(rng() * this.near.length)]; f.cx = s[0] + (rng() - 0.5) * 60; f.cz = s[1] + (rng() - 0.5) * 60; }
        const fx = f.cx + Math.cos(f.a) * f.R, fz = f.cz + Math.sin(f.a) * f.R, fy = this.gh(f.cx, f.cz) + f.h + Math.sin(t * 0.4 + f.R) * 3;
        const head = f.a + (f.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        for (const b of f.b) {
          const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 11 + b.ph));
          this.e.set(0, -head + Math.PI / 2, Math.sin(t * 0.8 + b.ph) * 0.3);
          this.sc.set(1, flap * 2.2 - 0.6, 1);
          this.m.compose(this.v.set(fx + b.dx + Math.sin(t * 0.7 + b.ph) * 1.2, fy + b.dy, fz + b.dz + Math.cos(t * 0.6 + b.ph) * 1.2), this.q.setFromEuler(this.e), this.sc);
          this.birds.setMatrixAt(n++, this.m);
        }
      }
      this.sc.set(1, 1, 1);
      this.birds.instanceMatrix.needsUpdate = true;
    }
    // ---- dust motes: drifting specks in a box around the camera, anchored in the world (wrap round as you move) ----
    if (this.motes) {
      const p = this.mp, n = this.mph.length, cy = camera.position.y;
      const wrap = (v, c, h) => c + ((((v - c + h) % (2 * h)) + 2 * h) % (2 * h)) - h;
      if (!this.moteInit) { this.moteInit = true; for (let i = 0; i < n; i++) { p[i * 3] += cx; p[i * 3 + 1] += cy - 3; p[i * 3 + 2] += cz; } }
      for (let i = 0; i < n; i++) {
        const x = p[i * 3] + (wx * 0.12 + Math.sin(t * 0.7 + this.mph[i]) * 0.15) * dt, z = p[i * 3 + 2] + (wz * 0.12 + Math.cos(t * 0.6 + this.mph[i]) * 0.15) * dt;
        const y = p[i * 3 + 1] + Math.sin(t * 0.9 + this.mph[i] * 2) * 0.05 * dt;
        p[i * 3] = wrap(x, cx, 30); p[i * 3 + 1] = wrap(y, cy + 1.5, 5); p[i * 3 + 2] = wrap(z, cz, 30);
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
      if (fog) { this.moteMat.uniforms.fogColor.value.copy(fog.color); this.moteMat.uniforms.fogNear.value = fog.near; this.moteMat.uniforms.fogFar.value = fog.far; }
    }
    // ---- falling leaves ----
    if (this.leaves.length) {
      this.treeT -= dt;
      if (this.treeT <= 0) { this.treeT = 1; this.nearTrees = this.trees.filter(q => Math.abs(q[0] - cx) < 45 && Math.abs(q[2] - cz) < 45); }
      let n = 0;
      for (const L of this.leaves) {
        if (L.dead) {
          if (this.nearTrees.length && rng() < dt * 0.6) {
            const q = this.nearTrees[Math.floor(rng() * this.nearTrees.length)], r = q[3] * 0.25 * rng(), a = rng() * 6.28;
            Object.assign(L, { dead: false, x: q[0] + Math.cos(a) * r, z: q[2] + Math.sin(a) * r, y: q[1] + q[3] * (0.55 + rng() * 0.35), vy: -0.6 - rng() * 0.5, ph: rng() * 6.28, t: 0, g: 0 });
          } else continue;
        }
        const gy = this.gh(L.x, L.z) + 0.02;
        if (L.y > gy) {
          L.t += dt;
          L.x += (wx * 0.35 + Math.sin(L.t * 2.2 + L.ph) * 0.9) * dt; L.z += (wz * 0.35 + Math.cos(L.t * 1.7 + L.ph) * 0.9) * dt; L.y += L.vy * dt;
          this.e.set(Math.sin(L.t * 3 + L.ph) * 1.2, L.t * 1.5 + L.ph, Math.cos(L.t * 2.5) * 0.9);
        } else { L.y = gy; L.g += dt; this.e.set(-Math.PI / 2, L.ph, 0); if (L.g > 6) { L.dead = true; continue; } }
        this.m.compose(this.v.set(L.x, L.y, L.z), this.q.setFromEuler(this.e), this.sc);
        this.leafMesh.setMatrixAt(n++, this.m);
      }
      this.leafMesh.count = n; this.leafMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.movers.length) this.updateMovers(dt, t, cx, cz, wx, wz, gust, cars);
    // ---- flickering glows ----
    if (this.glows) {
      const tint = this.glows.geometry.attributes.tint, base = this.o.night ? 1 : 0.4;
      let any = false;
      this.glowData.forEach((q, i) => {
        if (!q.f) return;
        const s = Math.sin(t * 23 + i * 7.1) + Math.sin(t * 5.3 + i * 3.7);
        tint.array[i * 4 + 3] = base * (q.a ?? 1) * (s > 1.4 ? 0.1 : s > 1.1 ? 0.5 : 1); any = true;
      });
      if (any) tint.needsUpdate = true;
    }
  }
}
