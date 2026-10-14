// F1 car: low-poly model + bicycle-model tyre physics
import * as THREE from 'three';
import { getTextures } from './textures.js';

export const TEAMS = [
  { name: 'Volta Racing',   main: 0xc8141c, accent: 0xf4f4f2, helmet: 0xffd21a, driver: 'YOU' },
  { name: 'Kobra Oil GP',   main: 0x0a0a0c, accent: 0xc9a23a, helmet: 0xe33030, driver: 'R. VALDEZ' },
  { name: 'Azure Motorsport', main: 0x1450b4, accent: 0xd0202a, helmet: 0xffffff, driver: 'K. TANAKA' },
  { name: 'Verde Corse',    main: 0x1a8a3a, accent: 0xf4f4f2, helmet: 0x1c7a3a, driver: 'S. ROSSI' },
  { name: 'Neon FM Racing', main: 0xf4f4f2, accent: 0x1c9a3a, helmet: 0xff5ce1, driver: 'J. MOREAU' },
  { name: 'Sunset Motel',   main: 0xf06a1a, accent: 0x111114, helmet: 0xfff4d0, driver: 'M. OKAFOR' },
  { name: 'Silverline',     main: 0xf4f4f2, accent: 0x0e2a55, helmet: 0x0bb3a8, driver: 'T. LINDQVIST' },
  { name: 'Burger Duck',    main: 0xf4c01a, accent: 0xd01818, helmet: 0x3a2a10, driver: 'D. KOWALSKI' },
  { name: 'Rapid Tyres',    main: 0xf4f4f2, accent: 0x0e2a55, helmet: 0x1a4fb0, driver: 'A. FERREIRA' },
  { name: 'Bayside Blue',   main: 0x1a5ad0, accent: 0xf4f4f2, helmet: 0xd02a2a, driver: 'L. NAKAMURA' },
  { name: 'Mesa Energy',    main: 0xf4f4f2, accent: 0x007a3a, helmet: 0xffffff, driver: 'P. SCHMIDT' },
  { name: 'Pine Hollow',    main: 0x0f3a24, accent: 0xf2d22a, helmet: 0xa4e04a, driver: 'E. OKONKWO' },
];

// ---------------- model ----------------

// cross-section loft. sections: [z, halfW, yBottom, yTop]
function loft(sections, xOff = 0) {
  const ring = (s) => {
    const [z, w, yb, yt] = s;
    const ym = yb + (yt - yb) * 0.45;
    return [
      [xOff - w * 0.85, yb, z], [xOff + w * 0.85, yb, z], [xOff + w, ym, z],
      [xOff + w * 0.55, yt, z], [xOff - w * 0.55, yt, z], [xOff - w, ym, z],
    ];
  };
  const pos = [];
  const rings = sections.map(ring);
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      tri(A[k], B[k], B[k2]); tri(A[k], B[k2], A[k2]);
    }
  }
  const cap = (R, flip) => {
    for (let k = 1; k < 5; k++) flip ? tri(R[0], R[k + 1], R[k]) : tri(R[0], R[k], R[k + 1]);
  };
  cap(rings[0], false); cap(rings[rings.length - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, x, y, z, mat, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}

const wheelTex = {};
function wheelTexture(c) {
  if (wheelTex[c]) return wheelTex[c];
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#141414'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(16, 16, 11, 0, 7); g.fill();
  g.fillStyle = '#9a9aa2'; g.beginPath(); g.arc(16, 16, 8, 0, 7); g.fill();
  g.fillStyle = '#555'; g.beginPath(); g.arc(16, 16, 3, 0, 7); g.fill();
  g.strokeStyle = TYRES[c].css; g.lineWidth = 1.6; g.beginPath(); g.arc(16, 16, 12.7, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (wheelTex[c] = t);
}

export function buildCarModel(team, opts = {}) {
  const tx = getTextures();
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const paint = new THREE.MeshPhongMaterial({ color: team.main, specular: 0x555555, shininess: 70, flatShading: true, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhongMaterial({ color: team.accent, specular: 0x444444, shininess: 60, flatShading: true, side: THREE.DoubleSide });
  const carbon = new THREE.MeshLambertMaterial({ map: tx.carbon, color: 0x777777 });
  const black = new THREE.MeshLambertMaterial({ color: 0x151518 });
  const helmetMat = new THREE.MeshPhongMaterial({ color: team.helmet, shininess: 90, flatShading: true });

  // chassis / nose
  const chassis = new THREE.Mesh(loft([
    [2.55, 0.07, 0.19, 0.27], [2.1, 0.15, 0.17, 0.4], [1.3, 0.24, 0.15, 0.55], [0.55, 0.34, 0.12, 0.62],
    [-0.3, 0.42, 0.1, 0.62], [-1.15, 0.34, 0.12, 0.7], [-1.9, 0.19, 0.16, 0.52], [-2.35, 0.1, 0.24, 0.4],
  ]), paint);
  body.add(chassis);
  // nose stripe (accent) – slightly bigger thin loft on top
  const stripe = new THREE.Mesh(loft([[2.45, 0.03, 0.26, 0.29], [1.3, 0.1, 0.5, 0.565], [0.6, 0.12, 0.58, 0.63]]), accent);
  body.add(stripe);
  // sidepods
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(loft([
      [0.45, 0.06, 0.14, 0.4], [0.15, 0.26, 0.11, 0.54], [-0.7, 0.25, 0.11, 0.5], [-1.55, 0.08, 0.13, 0.28],
    ], s * 0.62), paint);
    body.add(pod);
    const inlet = box(0.34, 0.2, 0.05, s * 0.66, 0.36, 0.47, black, body);
    inlet.rotation.y = 0;
  }
  // airbox / engine cover
  body.add(new THREE.Mesh(loft([[-0.32, 0.12, 0.6, 0.98], [-0.75, 0.15, 0.6, 0.92], [-1.7, 0.06, 0.6, 0.7]]), accent));
  // shark fin
  const fin = new THREE.Mesh(loft([[-0.9, 0.012, 0.6, 0.9], [-2.0, 0.012, 0.5, 0.86]]), paint);
  body.add(fin);
  // floor
  box(1.45, 0.05, 2.7, 0, 0.08, -0.6, carbon, body);
  // cockpit opening
  box(0.44, 0.04, 0.8, 0, 0.625, 0.05, black, body);
  // driver helmet
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), helmetMat);
  helmet.position.set(0, 0.73, -0.05); helmet.scale.set(1, 1, 1.12); body.add(helmet);
  box(0.24, 0.06, 0.05, 0, 0.75, 0.1, black, body);
  // halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 4, 10, Math.PI), black);
  halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI; halo.position.set(0, 0.86, -0.1); halo.scale.set(1, 1.35, 1);
  body.add(halo);
  const hp = box(0.05, 0.3, 0.05, 0, 0.72, 0.38, black, body); hp.rotation.x = -0.5;
  // mirrors
  for (const s of [-1, 1]) box(0.14, 0.06, 0.04, s * 0.48, 0.72, 0.5, paint, body);

  // front wing (own group so it can bend / break off)
  const fwing = new THREE.Group(); fwing.position.set(0, 0.15, 2.5); body.add(fwing);
  box(1.95, 0.035, 0.42, 0, -0.03, 0.02, accent, fwing);
  box(1.8, 0.03, 0.2, 0, 0.04, -0.08, paint, fwing);
  for (const s of [-1, 1]) box(0.03, 0.26, 0.55, s * 0.98, 0.05, 0, black, fwing);
  // rear wing
  const rwing = new THREE.Group(); rwing.position.set(0, 0.8, -2.35); body.add(rwing);
  box(1.05, 0.04, 0.34, 0, 0.08, 0, paint, rwing);
  box(1.05, 0.03, 0.18, 0, 0.17, -0.1, accent, rwing);
  for (const s of [-1, 1]) box(0.035, 0.62, 0.52, s * 0.54, -0.14, 0, paint, rwing);
  box(0.06, 0.45, 0.1, 0, 0.62, -2.3, black, body);
  // diffuser
  box(1.1, 0.18, 0.4, 0, 0.14, -2.15, carbon, body);
  // rain / brake light
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x551010 });
  const brakeLight = box(0.12, 0.06, 0.03, 0, 0.3, -2.5, lightMat, body);

  // suspension arms
  const arm = (x1, y1, z1, x2, y2, z2) => {
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len), black);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.lookAt(x2, y2, z2); body.add(m);
  };
  for (const s of [-1, 1]) {
    arm(s * 0.2, 0.42, 1.95, s * 0.75, 0.38, 1.75); arm(s * 0.2, 0.2, 1.55, s * 0.75, 0.26, 1.75);
    arm(s * 0.3, 0.45, -1.5, s * 0.72, 0.42, -1.6); arm(s * 0.3, 0.2, -1.3, s * 0.72, 0.26, -1.6);
  }

  // wheels
  const tread = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const rim = new THREE.MeshLambertMaterial({ map: wheelTexture('medium') });
  const wheels = [];
  const mk = (x, z, r, w, front) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const geo = new THREE.CylinderGeometry(r, r, w, 12, 1);
    geo.rotateZ(Math.PI / 2);
    const wm = new THREE.Mesh(geo, [tread, rim, rim]);
    pivot.add(wm);
    group.add(pivot);
    wheels.push({ pivot, mesh: wm, r, front });
  };
  mk(0.83, 1.75, 0.34, 0.34, true); mk(-0.83, 1.75, 0.34, 0.34, true);
  mk(0.8, -1.6, 0.36, 0.42, false); mk(-0.8, -1.6, 0.36, 0.42, false);

  // blob shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.2), new THREE.MeshBasicMaterial({ map: tx.blob, transparent: true, depthWrite: false, opacity: 0.8, color: 0x000000 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;

  // light coronas (night / rain)
  const coronaMat = new THREE.SpriteMaterial({ map: tx.corona, color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const tail = new THREE.Sprite(coronaMat);
  tail.position.set(0, 0.3, -2.55); tail.scale.set(1.2, 1.2, 1); body.add(tail);

  group.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
  const model = { group, body, wheels, shadow, brakeLight, lightMat, tail, coronaMat, fwing, rwing, rim };
  model.setCompound = (c) => { rim.map = wheelTexture(c); rim.needsUpdate = true; };
  // bend, then lose, wings as damage builds up
  model.setDamage = (d) => {
    const wob = (g, v, dir) => {
      g.visible = v < 0.72;
      g.rotation.z = v > 0.3 ? (v - 0.3) * 0.5 * dir : 0;
      g.rotation.x = v > 0.3 ? (v - 0.3) * 0.35 : 0;
    };
    wob(fwing, d.fw, model.pull || 1); wob(rwing, d.rw, -(model.pull || 1));
    body.rotation.z = d.ch * 0.03;
  };
  return model;
}

// the car physics (CarPhysics, tyres, specs) live in physics.js: no THREE there, so the tests run it in plain node
export * from './physics.js';
