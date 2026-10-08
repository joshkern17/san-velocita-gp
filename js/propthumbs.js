// Pictures of the props for the editor's PROPS panel: each one drawn once, small, from a three-quarter front view in a
// soft studio light, and kept (a data URL). Anything with a scenery model (the race-track pack, trees, houses, model
// buildings) is drawn from that model, so the picture is what you'll get; the classic made-in-code props come from
// world.js, the businesses and the courthouse from landmarks.js, the bleachers from their own model.
//
//   thumb(key) -> Promise<data URL | null>   key: 'env:<asset id>', 'classic:<type>', 'biz:<type>', 'courthouse', 'bleachers'
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { envModel, loadEnvModels } from './envlib.js';
import { classicPropModel } from './world.js';
import { buildBusiness, buildCourthouse } from './landmarks.js';

const W = 192, H = 144;
let R = null, scene = null, cam = null;
const cache = new Map();
let queue = Promise.resolve();

function setup() {
  if (R) return;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setSize(W, H, false); R.setPixelRatio(1); R.outputColorSpace = THREE.SRGBColorSpace; R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x5a5650, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(0.7, 1, 0.9); scene.add(sun);
  cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 2000);
}
// a scenery model as an object (its parts share the library's materials and geometry)
function modelObject(id) {
  const parts = envModel(id); if (!parts) return null;
  const g = new THREE.Group();
  for (const p of parts) g.add(new THREE.Mesh(p.geo, p.mat));
  return g;
}
let bleachers = null;
function bleacherObject() {
  if (!bleachers) bleachers = new GLTFLoader().loadAsync((typeof window !== 'undefined' && window.__SVGP_BLEACHERS_GLB) || 'models/bleachers.glb')
    .then(g => g.scene).catch(() => null);
  return bleachers.then(s => s && s.clone(true));
}
async function objectFor(key) {
  if (key.startsWith('env:')) { await loadEnvModels(); return modelObject(key.slice(4)); }
  if (key.startsWith('classic:')) return classicPropModel(key.slice(8));
  if (key.startsWith('biz:')) return buildBusiness(key.slice(4), false);
  if (key === 'courthouse') return buildCourthouse(false);
  if (key === 'bleachers') return bleacherObject();
  return null;
}
// the camera from in front and to the right, a little above, framing the whole thing
function shoot(obj) {
  setup();
  scene.add(obj); obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) { scene.remove(obj); return null; }
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const r = Math.max(0.3, size.length() / 2), dir = new THREE.Vector3(0.62, 0.42, 1).normalize();
  const fit = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.92;
  cam.position.copy(c).addScaledVector(dir, fit); cam.near = fit / 50; cam.far = fit * 4; cam.updateProjectionMatrix(); cam.lookAt(c);
  R.render(scene, cam);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}
export function thumb(key) {
  if (!key) return Promise.resolve(null);
  if (cache.has(key)) return cache.get(key);
  // (one at a time: a panel full of them doesn't stall the editor)
  const p = queue.then(() => objectFor(key)).then(o => (o ? new Promise(res => requestAnimationFrame(() => res(shoot(o)))) : null)).catch(() => null);
  queue = p;
  cache.set(key, p);
  return p;
}
