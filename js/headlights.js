// Headlights after dark. The car you're watching throws real light: two spot lights shaped like a low beam (a hard
// top edge, a long bright band down the road, softer close in and out to the sides, a little spill up onto the
// signs and trees), so the cars ahead, the barriers and the verges light up as you come at them. Every car paints a
// pool of light on the road ahead of itself (the cheap version: one quad on the car, no real light), and a glare
// shows when a car's lamps face you.
import * as THREE from 'three';

const WARM = 0xfff1dc;
const POOL_W = 24, POOL_L = 46;        // the painted pool: metres across, metres ahead of the nose

let _cookie = null, _pool = null, _glare = null;

// the low beam as the lamp sees it (the spot light's map): a hard cutoff just above the axis (kicked up a little to
// the right), bright just under it where the far road is, dimmer lower down (that's the road close in, which the
// light hits far more squarely), a soft fall-off to the sides and a faint glow above the line
function cookieTexture() {
  if (_cookie) return _cookie;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = 1 - (y + 0.5) / S * 2;     // -1..1, v up
    const cut = 0.035 + (u > 0.08 ? Math.min(0.09, (u - 0.08) * 0.35) : 0);
    const below = cut - v;                                          // how far under the line
    const side = Math.exp(-((u / 0.62) ** 4)) * (0.55 + 0.45 * Math.exp(-((u / 0.3) ** 2)));
    let k;
    if (below < 0) k = 0.07 * Math.exp(below / 0.25);                // spill above the line
    else k = Math.min(1, below / 0.012) * (1 / (1 + (below / 0.1) ** 1.3));
    k *= side;
    const i = (y * S + x) * 4, b = Math.round(255 * Math.min(1, k));
    img.data[i] = b; img.data[i + 1] = b; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _cookie = new THREE.CanvasTexture(c); _cookie.colorSpace = THREE.SRGBColorSpace;
  return _cookie;
}

// the pool on the road (the quad lies flat with the canvas's top row at the bumper): dark right under the bumper, the two lamps' fans merging a few
// metres out, brightest 10-25 m ahead, fading out by the far end
function poolTexture() {
  if (_pool) return _pool;
  const W = 96, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y + 0.5) / H * POOL_L, lat = ((x + 0.5) / W - 0.5) * POOL_W;
    let k = 0;
    for (const lx of [-0.65, 0.65]) {
      const a = Math.atan2(lat - lx, Math.max(0.3, d));
      k += 0.5 * Math.exp(-((a / 0.42) ** 4)) * (0.6 + 0.4 * Math.exp(-((a / 0.2) ** 2)));
    }
    const along = Math.min(1, Math.max(0, (d - 0.8) / 5)) ** 1.5 * (0.75 + 0.25 * Math.min(1, d / 14)) * (d < 20 ? 1 : Math.exp(-(((d - 20) / 15) ** 2)));
    k *= along;
    const i = (y * W + x) * 4, b = Math.round(255 * Math.min(1, k));
    img.data[i] = b; img.data[i + 1] = b; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _pool = new THREE.CanvasTexture(c); _pool.colorSpace = THREE.SRGBColorSpace;
  return _pool;
}

// glare: a hot core and a thin horizontal streak (bloom does the rest)
function glareTexture() {
  if (_glare) return _glare;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.08, 'rgba(255,255,255,0.9)'); r.addColorStop(0.25, 'rgba(255,255,255,0.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
  const s = g.createLinearGradient(0, 0, S, 0);
  s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0.55)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = s; g.fillRect(0, S / 2 - 1.5, S, 3);
  _glare = new THREE.CanvasTexture(c); _glare.colorSpace = THREE.SRGBColorSpace;
  return _glare;
}

// where a model's two headlamps are, in its body's space: its own Light_Head lamps (road cars), else the front of
// its body, low and a little in from each side
function lampAnchors(model) {
  const own = model.headSpots || [];
  if (own.length) {
    const side = (s) => { const l = own.filter(p => Math.sign(p.x || 1) === s); if (!l.length) return null; const v = new THREE.Vector3(); l.forEach(p => v.add(p)); return v.divideScalar(l.length); };
    const L = side(1), R = side(-1);
    if (L && R) return [L, R];
    const one = (L || R).clone(); return [one.clone().setX(0.6), one.setX(-0.6)];
  }
  const body = model.body, box = new THREE.Box3(), b = new THREE.Box3();
  body.updateWorldMatrix(true, true);
  const inv = body.matrixWorld.clone().invert(), m = new THREE.Matrix4();
  body.traverse(o => {
    if (!o.isMesh || !o.geometry || o.isSprite) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); box.union(b);
  });
  if (box.isEmpty()) return [new THREE.Vector3(0.6, 0.55, 2), new THREE.Vector3(-0.6, 0.55, 2)];
  const x = Math.max(0.35, (box.max.x - box.min.x) / 2 - 0.3), y = Math.min(0.75, Math.max(0.35, box.min.y + 0.3 * (box.max.y - box.min.y)));
  return [new THREE.Vector3(x, y, box.max.z - 0.05), new THREE.Vector3(-x, y, box.max.z - 0.05)];
}

export class Headlights {
  constructor(scene) {
    this.scene = scene;
    // the real lights (added once, at the start: a light added mid-race would rebuild every material's shader)
    this.spots = [0, 1].map(() => {
      const s = new THREE.SpotLight(WARM, 0, 140, 0.55, 0.45, 1);
      s.map = cookieTexture();
      scene.add(s, s.target);
      return s;
    });
    // the pools light the road the way light does: what's under them times (1 + pool), so the asphalt keeps its
    // texture, the white lines pop, and overlapping pools on a grid don't add up to a white sheet
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0x000000, transparent: true, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.k = 0;
  }
  // (once per car model: its lamp anchors, its pool, its glare)
  rig(car) {
    const m = car.model;
    if (m.hl && m.hl.model === m) return m.hl;
    const anchors = lampAnchors(m);
    const pool = new THREE.Mesh(this.poolGeo, this.poolMat);
    const nose = Math.max(...anchors.map(a => a.z));
    // (a hand up off the road: its crown and camber hide a flat quad any lower. Drawn before the racing line and the
    // painted overlays (renderOrder 2), so they sit on top unlit: the pool brightens whatever's already drawn)
    pool.scale.set(POOL_W, 1, POOL_L); pool.position.set(0, 0.15, nose + POOL_L / 2 - 0.4); pool.renderOrder = 1;
    m.group.add(pool);
    const glareMat = new THREE.SpriteMaterial({ map: glareTexture(), color: WARM, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const glares = anchors.map(a => { const s = new THREE.Sprite(glareMat); s.position.copy(a).add(new THREE.Vector3(0, 0, 0.08)); s.scale.set(1.2, 1.2, 1); m.body.add(s); return s; });
    m.hl = { model: m, anchors, pool, glareMat, glares };
    return m.hl;
  }
  // k: how dark it is (0 day .. 1 night)
  update(cars, focus, camera, k) {
    this.k = k;
    const on = k > 0.01;
    this.poolMat.color.set(WARM).multiplyScalar(2.6 * k);
    for (const s of this.spots) s.intensity = 0;
    const camP = camera.position;
    for (const car of cars) {
      const m = car.model; if (!m || !m.group) continue;
      const h = this.rig(car), vis = on && m.group.visible && !car.gone && !car.wreck && !car.inGarage;
      h.pool.visible = vis;
      if (!vis) { h.glareMat.opacity = 0; continue; }
      m.body.updateWorldMatrix(true, false);
      _fw.set(0, 0, 1).transformDirection(m.body.matrixWorld);
      // the glare: full when the lamps look straight at the camera, nothing from the side or behind
      _to.copy(camP).sub(m.group.position); const dist = _to.length(); _to.divideScalar(dist || 1);
      const face = Math.max(0, _fw.dot(_to));
      h.glareMat.opacity = 0.6 * k * face ** 3 * Math.min(1, dist / 6);
      // (a road car's own lamp glow: seen over the roof from behind, it'd hang there like two balls)
      if (m.headCorona) m.headCorona.opacity *= 0.1 + 0.9 * Math.min(1, face * 2.5);
      if (car !== focus) continue;
      _dir.copy(_fw).addScaledVector(_up.set(0, 1, 0).applyQuaternion(m.group.quaternion), -0.035).normalize();
      h.anchors.forEach((a, i) => {
        const s = this.spots[i]; if (!s) return;
        _p.copy(a).applyMatrix4(m.body.matrixWorld);
        s.position.copy(_p); s.target.position.copy(_p).addScaledVector(_dir, 30);
        s.target.updateMatrixWorld(); s.intensity = 20 * k;
      });
    }
  }
  dispose() {
    for (const s of this.spots) { s.removeFromParent(); s.target.removeFromParent(); }
    this.poolMat.dispose(); this.poolGeo.dispose();
  }
}
const _fw = new THREE.Vector3(), _up = new THREE.Vector3(), _to = new THREE.Vector3(), _p = new THREE.Vector3(), _dir = new THREE.Vector3();
