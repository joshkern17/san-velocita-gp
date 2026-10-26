// Snapshots of a car, for the classifieds (js/computer.js): the car parked on a driveway, shot from about head
// height, slightly crooked, a bit soft. Or (look 'track') a team's car in the pit lane, for the series websites.
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
  const ground = document.createElement('canvas'); ground.width = ground.height = 128;
  const gg = ground.getContext('2d'); gg.fillStyle = '#8d8a84'; gg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { gg.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; gg.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  gg.fillStyle = 'rgba(0,0,0,.25)'; gg.fillRect(0, 62, 128, 2); // (an expansion joint)
  const gt = new THREE.CanvasTexture(ground); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(6, 6); gt.colorSpace = THREE.SRGBColorSpace;
  const drive = new THREE.Group(); scene.add(drive);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ map: gt })); floor.rotation.x = -Math.PI / 2; drive.add(floor);
  const fence = new THREE.Mesh(new THREE.BoxGeometry(30, 1.8, 0.1), new THREE.MeshLambertMaterial({ color: 0x7a5e44 })); fence.position.set(0, 0.9, -6); drive.add(fence);
  for (let x = -14; x <= 14; x += 2.4) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.95, 0.14), new THREE.MeshLambertMaterial({ color: 0x5e4632 })); post.position.set(x, 0.97, -5.9); drive.add(post); }
  // the pit lane: dark asphalt, the painted line, the pit wall behind with its fence, garages' roller doors beyond
  const pit = new THREE.Group(); pit.visible = false; scene.add(pit);
  const asph = document.createElement('canvas'); asph.width = asph.height = 128;
  const ag = asph.getContext('2d'); ag.fillStyle = '#3c3d40'; ag.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2200; i++) { ag.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.1})`; ag.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5); }
  const at = new THREE.CanvasTexture(asph); at.wrapS = at.wrapT = THREE.RepeatWrapping; at.repeat.set(10, 10); at.colorSpace = THREE.SRGBColorSpace;
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ map: at })); lane.rotation.x = -Math.PI / 2; pit.add(lane);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.14), new THREE.MeshBasicMaterial({ color: 0xd8d6cc })); line.rotation.x = -Math.PI / 2; line.position.set(0, 0.01, -2.6); pit.add(line);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 1.1, 0.4), new THREE.MeshLambertMaterial({ color: 0xcfcfca })); wall.position.set(0, 0.55, -4.2); pit.add(wall);
  for (let x = -20; x < 20; x += 2) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.42), new THREE.MeshLambertMaterial({ color: 0xc8241c })); b.position.set(x, 0.99, -4.2); pit.add(b); }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.2), new THREE.MeshLambertMaterial({ color: 0x55585c, transparent: true, opacity: 0.45 })); mesh.position.set(0, 2.2, -4.25); pit.add(mesh);
  const boxes = new THREE.Mesh(new THREE.BoxGeometry(60, 5, 1), new THREE.MeshLambertMaterial({ color: 0x8e949a })); boxes.position.set(0, 2.5, -14); pit.add(boxes);
  for (let x = -27; x < 30; x += 6) { const d = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), new THREE.MeshLambertMaterial({ color: 0x2a2c30 })); d.position.set(x, 1.7, -13.49); pit.add(d); }
  scene.add(new THREE.HemisphereLight(0xe6eef6, 0x55524c, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.3); sun.position.set(-4, 7, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(46, PW / PH, 0.1, 80);
  R = { renderer, scene, camera, car: null, drive, pit };
}
// cfg: a car config (chassis + paint); seed: the same listing always gets the same shot; look: 'drive' | 'track'
export function carPhoto(cfg, seed = 1, look = 'drive') {
  if (!R) setup();
  R.drive.visible = look !== 'track'; R.pit.visible = look === 'track';
  const rnd = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  if (R.car) { R.scene.remove(R.car.group); R.car.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  R.car = buildF1(cfg, { texSize: 512 });
  const cam = R.camera, a = 0.55 + rnd(2) * 0.3, d = look === 'track' ? 4.5 + rnd(3) * 0.4 : 5.6 + rnd(3) * 0.8; // (the pit lane: in close)
  R.car.group.rotation.y = a - 0.75 - rnd(1) * 0.3; // a front three-quarter, roughly
  R.scene.add(R.car.group);
  cam.position.set(Math.sin(a) * d, (look === 'track' ? 1.1 : 1.45) + rnd(4) * 0.2, Math.cos(a) * d);
  cam.lookAt(0, look === 'track' ? 0.45 : 0.55, 0);
  cam.rotateZ((rnd(5) - 0.5) * 0.06); // (nobody holds the phone level)
  R.renderer.render(R.scene, cam);
  return R.renderer.domElement.toDataURL('image/jpeg', 0.6);
}
