// Rain effects: reflections of lights on the wet road (the classic PS2 streaks running from each light towards
// the camera) and spray thrown up behind the cars.
import * as THREE from 'three';

let _streakTex = null;
function streakTexture() {
  if (_streakTex) return _streakTex;
  const W = 32, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rows = Array.from({ length: H }, () => 0.55 + rnd() * 0.45); // broken up like light on rippling water
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W - 0.5, v = y / (H - 1); // v = 0 at the light, 1 at the far (camera) end
    const across = Math.exp(-u * u * 38) * (1 - v * 0.55), along = Math.pow(1 - v, 1.4) * (v < 0.05 ? v / 0.05 : 1);
    const a = Math.min(1, across * along * rows[y] * 1.25);
    const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * a; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _streakTex = new THREE.CanvasTexture(c); _streakTex.colorSpace = THREE.SRGBColorSpace;
  return _streakTex;
}

// Reflections: static lights (lamps) + moving ones (tail lights), each a streak lying on the road surface,
// pointing from the point under the light towards the camera.
export class WetReflections {
  constructor(root, max = 90) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); // spans local z 0..1
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), max);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    root.add(this.mesh);
    this.max = max; this.fixed = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
  }
  // { x, y (road height under the light), z, h (light height), r, g, b, w (width) }
  addFixed(l) { this.fixed.push(l); }
  update(camera, moving = []) {
    const cx = camera.position.x, cz = camera.position.z, cy = camera.position.y;
    const all = [];
    for (const l of this.fixed) { const d = Math.hypot(l.x - cx, l.z - cz); if (d < 170) all.push([d, l]); }
    for (const l of moving || []) { const d = Math.hypot(l.x - cx, l.z - cz); if (d < 120) all.push([d, l]); } // (null while a changeable race is dry)
    all.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [d, l] of all) {
      if (n >= this.max) break;
      const dx = cx - l.x, dz = cz - l.z, dl = Math.hypot(dx, dz) || 1;
      // a longer streak for high lights seen from low down (mirror geometry, roughly), fading with distance
      const len = Math.min(dl * 0.85, Math.max(3, (l.h || 1) * 2.2 * (1 + dl / Math.max(2, cy) * 0.12)));
      const fade = Math.max(0, 1 - d / (l.h > 3 ? 170 : 120));
      this.q.setFromAxisAngle(this.up, Math.atan2(dx / dl, dz / dl));
      this.p.set(l.x, l.y + 0.03, l.z); this.s.set(l.w || 1, 1, len);
      this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
      this.c.setRGB(l.r * fade, l.g * fade, l.b * fade); this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

// Spray: soft grey puffs kicked up behind fast cars on a wet track
export class Spray {
  constructor(scene, max = 700) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, color: { value: new THREE.Color(0xc4ccd4) }, scale: { value: 300 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: `attribute float life; attribute float size; varying float vA; uniform float scale;
        #include <fog_pars_vertex>
        void main(){ vA = life; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (1.6 - life * 0.6) * scale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA * 0.5);
        #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
  }
  // x, y, z: where; vx, vz: the car's velocity; k: 0..1 how much (speed)
  emit(x, y, z, vx, vz, k) {
    const i = this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x + (Math.random() - 0.5) * 0.5; this.pos[i * 3 + 1] = y + 0.2; this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;
    this.vel[i * 3] = vx * 0.35 + (Math.random() - 0.5) * 2.5; this.vel[i * 3 + 1] = 1.2 + Math.random() * 2.2 * k; this.vel[i * 3 + 2] = vz * 0.35 + (Math.random() - 0.5) * 2.5;
    this.life[i] = 0.6 + Math.random() * 0.4 * k; this.size[i] = 0.9 + Math.random() * 0.9 * k;
  }
  update(dt, fog) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt * 1.3);
      const d = Math.exp(-dt * 2.2);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - dt * 1.5;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += dt * 1.6;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.life.needsUpdate = true; g.attributes.size.needsUpdate = true;
    if (fog) { this.mat.uniforms.fogColor.value.copy(fog.color); this.mat.uniforms.fogNear.value = fog.near; this.mat.uniforms.fogFar.value = fog.far; }
  }
}
