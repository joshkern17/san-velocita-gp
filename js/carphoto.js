// Snapshots of a car, for the classifieds (js/computer.js): the car parked on a driveway, shot from about head
// height, slightly crooked, a bit soft. Or (look 'studio') a team's car in a photo studio, for the series websites.
// One small renderer of its own, made on first use; photos come back as JPEG data URLs (cached by the caller).
import * as THREE from 'three';
import { buildF1 } from './carmodel.js';

const PW = 400, PH = 260;
let R = null;
function setup() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(PW, PH, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  // an overcast afternoon: a pale sky, a fence, a concrete driveway
  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 64;
  const g = sky.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#9fb3c4'); grd.addColorStop(1, '#dfe4e6');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 64);
  const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
  const dark = new THREE.Color(0x17181c);
  const ground = document.createElement('canvas'); ground.width = ground.height = 128;
  const gg = ground.getContext('2d'); gg.fillStyle = '#8d8a84'; gg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { gg.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; gg.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  gg.fillStyle = 'rgba(0,0,0,.25)'; gg.fillRect(0, 62, 128, 2); // (an expansion joint)
  const gt = new THREE.CanvasTexture(ground); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(6, 6); gt.colorSpace = THREE.SRGBColorSpace;
  const drive = new THREE.Group(); scene.add(drive);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ map: gt })); floor.rotation.x = -Math.PI / 2; drive.add(floor);
  const fence = new THREE.Mesh(new THREE.BoxGeometry(30, 1.8, 0.1), new THREE.MeshLambertMaterial({ color: 0x7a5e44 })); fence.position.set(0, 0.9, -6); drive.add(fence);
  for (let x = -14; x <= 14; x += 2.4) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.95, 0.14), new THREE.MeshLambertMaterial({ color: 0x5e4632 })); post.position.set(x, 0.97, -5.9); drive.add(post); }
  // the studio (look 'studio'): a cyclorama, floor sweeping up into the wall with no corner, dark at the top and
  // lit pale where the car stands, a pool of light under it; a key light front-left and a rim light behind
  const studio = new THREE.Group(); studio.visible = false; scene.add(studio);
  { const prof = []; // (the sweep's profile, front to back: [z, y])
    for (let z = 10; z > -3; z -= 1) prof.push([z, 0]);
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; prof.push([-3 - Math.sin(a) * 3, 3 - Math.cos(a) * 3]); }
    for (let y = 4; y <= 24; y += 2) prof.push([-6, y]);
    const xs = [-40, 40], pos = [], uv = [], idx = [], len = [0];
    for (let i = 1; i < prof.length; i++) len.push(len[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    prof.forEach(([z, y], i) => { for (const x of xs) { pos.push(x, y, z); uv.push(x < 0 ? 0 : 1, len[i] / len.at(-1)); } });
    for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#77797e'); gr.addColorStop(0.42, '#8e9095'); gr.addColorStop(0.6, '#5a5c62'); gr.addColorStop(1, '#17181c'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    studio.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tx })));
    const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d'), rg = pg.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,250,240,0.55)'); rg.addColorStop(1, 'rgba(255,250,240,0)'); pg.fillStyle = rg; pg.fillRect(0, 0, 128, 128);
    const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.01; studio.add(pool);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.1); rim.position.set(3, 4, -7); studio.add(rim);
    const key = new THREE.DirectionalLight(0xfff1de, 0.6); key.position.set(-5, 6, 6); studio.add(key); }
  scene.add(new THREE.HemisphereLight(0xe6eef6, 0x55524c, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.3); sun.position.set(-4, 7, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(46, PW / PH, 0.1, 80);
  R = { renderer, scene, camera, car: null, drive, studio, sky: skyTex, dark };
}
// cfg: a car config (chassis + paint); seed: the same listing always gets the same shot; look: 'drive' | 'studio'
export function carPhoto(cfg, seed = 1, look = 'drive') {
  if (!R) setup();
  const st = look === 'studio'; R.drive.visible = !st; R.studio.visible = st; R.scene.background = st ? R.dark : R.sky;
  const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  if (R.car) { R.scene.remove(R.car.group); R.car.group.traverse(o => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); } }); } // (its livery canvas too: a page of photos is a lot of cars)
  R.car = buildF1(cfg, { texSize: 512 });
  const cam = R.camera, a = 0.55 + rnd(2) * 0.3, d = st ? 6.7 + rnd(3) * 0.3 : 5.6 + rnd(3) * 0.8; // (the studio: further back, a longer lens)
  R.car.group.rotation.y = a - 0.75 - rnd(1) * 0.3; // a front three-quarter, roughly
  R.scene.add(R.car.group);
  cam.fov = st ? 30 : 46; cam.updateProjectionMatrix();
  if (st) R.studio.rotation.y = a; // (the sweep square on to the camera: the wall's always right behind the car)
  cam.position.set(Math.sin(a) * d, (st ? 1.05 : 1.45) + rnd(4) * 0.2, Math.cos(a) * d);
  cam.lookAt(0, st ? 0.5 : 0.55, 0);
  if (!st) cam.rotateZ((rnd(5) - 0.5) * 0.06); // (nobody holds the phone level; the studio's on a tripod)
  R.renderer.render(R.scene, cam);
  return R.renderer.domElement.toDataURL('image/jpeg', 0.6);
}
