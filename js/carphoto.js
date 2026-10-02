// Snapshots of a car, for the classifieds (js/computer.js): the car parked on a driveway, shot from about head
// height, slightly crooked, a bit soft. One small renderer of its own, made on first use; photos come back as JPEG
// data URLs (cached by the caller).
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
  const ground = document.createElement('canvas'); ground.width = ground.height = 128;
  const gg = ground.getContext('2d'); gg.fillStyle = '#8d8a84'; gg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { gg.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; gg.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  gg.fillStyle = 'rgba(0,0,0,.25)'; gg.fillRect(0, 62, 128, 2); // (an expansion joint)
  const gt = new THREE.CanvasTexture(ground); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(6, 6); gt.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ map: gt })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const fence = new THREE.Mesh(new THREE.BoxGeometry(30, 1.8, 0.1), new THREE.MeshLambertMaterial({ color: 0x7a5e44 })); fence.position.set(0, 0.9, -6); scene.add(fence);
  for (let x = -14; x <= 14; x += 2.4) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.95, 0.14), new THREE.MeshLambertMaterial({ color: 0x5e4632 })); post.position.set(x, 0.97, -5.9); scene.add(post); }
  scene.add(new THREE.HemisphereLight(0xe6eef6, 0x55524c, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.3); sun.position.set(-4, 7, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(46, PW / PH, 0.1, 80);
  R = { renderer, scene, camera, car: null };
}
// cfg: a car config (chassis + paint); seed: the same listing always gets the same shot
export function carPhoto(cfg, seed = 1) {
  if (!R) setup();
  const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  if (R.car) { R.scene.remove(R.car.group); R.car.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  R.car = buildF1(cfg, { texSize: 512 });
  const cam = R.camera, a = 0.55 + rnd(2) * 0.3, d = 5.6 + rnd(3) * 0.8;
  R.car.group.rotation.y = a - 0.75 - rnd(1) * 0.3; // a front three-quarter, roughly
  R.scene.add(R.car.group);
  cam.position.set(Math.sin(a) * d, 1.45 + rnd(4) * 0.2, Math.cos(a) * d);
  cam.lookAt(0, 0.55, 0);
  cam.rotateZ((rnd(5) - 0.5) * 0.06); // (nobody holds the phone level)
  R.renderer.render(R.scene, cam);
  return R.renderer.domElement.toDataURL('image/jpeg', 0.6);
}
