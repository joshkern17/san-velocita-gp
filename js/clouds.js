// Billboard clouds, adapted from the WebGL2 billboard / mesh-cluster path of procedural-clouds-threejs
// (CK42BB): camera-facing soft puffs grouped into broad cumulus shapes on a ring around the circuit, lit with wrap
// diffuse + a subsurface glow towards the sun, darker bases, warm edges at sunset (its time-of-day palette), and
// a slow drift. Cheap: one instanced draw.
import * as THREE from 'three';

// lit side / shadow side per time of day (from the reference's artistic palette table)
const PALETTE = {
  day:   { lit: 0xfff4e0, shade: 0x9aaabb },
  dusk:  { lit: 0xff8a50, shade: 0x5a3a6a },
  night: { lit: 0x2a2e44, shade: 0x12121e },
};

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function buildClouds(P, env, seed = 1) {
  const rng = mulberry(seed * 977 + 11);
  const pal = PALETTE[env.time] || PALETTE.day;
  const heavy = env.weather === 'overcast' || env.weather === 'rain';
  const nClusters = env.weather === 'fog' ? 0 : heavy ? 26 : 16, perCluster = 9;
  const total = nClusters * perCluster;
  const geo = new THREE.PlaneGeometry(1, 1);
  const off = new Float32Array(total * 3), size = new Float32Array(total), seedA = new Float32Array(total);
  let k = 0;
  for (let c = 0; c < nClusters; c++) {
    const ang = rng() * Math.PI * 2, R = 1500 + rng() * 1300, h = 260 + rng() * 260, span = 180 + rng() * 260;
    const cx = Math.cos(ang) * R, cz = Math.sin(ang) * R;
    for (let p = 0; p < perCluster; p++) {
      // a flat base, rounded top: puffs spread wide, piled higher in the middle
      const u = (rng() - 0.5) * 2, v = (rng() - 0.5) * 2;
      const lift = (1 - Math.min(1, u * u + v * v)) * span * 0.35;
      off.set([cx + u * span, h + lift + rng() * 20, cz + v * span * 0.6], k * 3);
      size[k] = span * (0.55 + rng() * 0.5) * (heavy ? 1.3 : 1); seedA[k] = rng() * 100; k++;
    }
  }
  const ig = new THREE.InstancedBufferGeometry().copy(geo);
  ig.instanceCount = total;
  ig.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  ig.setAttribute('size', new THREE.InstancedBufferAttribute(size, 1));
  ig.setAttribute('seed', new THREE.InstancedBufferAttribute(seedA, 1));
  const sun = new THREE.Vector3(...P.sun).normalize();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      camPos: { value: new THREE.Vector3() }, drift: { value: new THREE.Vector2() }, sunDir: { value: sun },
      lit: { value: new THREE.Color(pal.lit).multiplyScalar(heavy ? 0.6 : 1) }, shade: { value: new THREE.Color(pal.shade).multiplyScalar(heavy ? 0.75 : 1) },
      horizon: { value: new THREE.Color(P.hor) }, opacity: { value: heavy ? 0.9 : 0.8 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 offset; attribute float size; attribute float seed;
      uniform vec3 camPos; uniform vec2 drift;
      varying vec2 vUv; varying float vSeed; varying vec3 vCenter; varying float vDist;
      void main() {
        vUv = uv; vSeed = seed;
        vec3 c = offset + vec3(camPos.x + drift.x, 0.0, camPos.z + drift.y); // the ring travels with you
        vCenter = c - camPos; vDist = length(vCenter);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * size;                // camera-facing
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, lit, shade, horizon; uniform float opacity;
      varying vec2 vUv; varying float vSeed; varying vec3 vCenter; varying float vDist;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float r = length(q);
        float fb = n(q * 2.3 + vSeed) * 0.6 + n(q * 5.1 + vSeed * 1.7) * 0.4;
        float a = smoothstep(1.0, 0.35, r + (fb - 0.5) * 0.55);   // soft, lumpy puff
        if (a < 0.02) discard;
        // fake normal of a sphere, then wrap diffuse + subsurface glow + top bias (reference mesh-cloud shading)
        vec3 N = normalize(vec3(q.x, q.y, sqrt(max(0.0, 1.0 - r * r))));
        vec3 V = normalize(-vCenter);
        vec3 L = normalize(sunDir);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), V)), up = cross(V, right);
        vec3 Nw = normalize(right * N.x + up * N.y + V * N.z);
        float diff = dot(Nw, L) * 0.5 + 0.5;
        float sss = pow(max(dot(-V, L), 0.0), 3.0) * 0.6 * (1.0 - a * 0.5);
        float top = smoothstep(-0.2, 0.6, N.y) * 0.25, base = smoothstep(0.3, -0.5, N.y) * 0.3;
        vec3 col = mix(shade, lit, diff) * (1.0 - base) + lit * (top + sss);
        col = mix(col, horizon, smoothstep(1800.0, 3200.0, vDist) * 0.7); // melt into the horizon far away
        gl_FragColor = vec4(col, a * opacity);
      }`,
    transparent: true, depthWrite: false, depthTest: true, fog: false,
  });
  const mesh = new THREE.Mesh(ig, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -9;
  let t = 0;
  const windA = rng() * Math.PI * 2;
  return {
    mesh,
    update(dt, camera) {
      t += dt;
      mat.uniforms.camPos.value.copy(camera.position);
      mat.uniforms.drift.value.set(Math.cos(windA) * t * 1.5, Math.sin(windA) * t * 1.5); // slow drift
    },
  };
}
