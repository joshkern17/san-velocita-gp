// Track Viewer (trackview.html): fly round a circuit model (.glb) to see how the real place is laid out, before
// modelling it in the game's own style. Pick one of the reference models (models/tracks), or open / drop any .glb.
//   drag: look · W A S D move, Q / E down / up, Shift fast, Alt slow · wheel: flying speed · double-click: go there at
//   driver height · F: overhead · M: measure (click two points) · pad: sticks, triggers, L3 fast
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb6cc);
scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x5a5448, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(0.5, 1, 0.35); scene.add(sun);
const cam = new THREE.PerspectiveCamera(65, 1, 0.1, 30000);
const st = { yaw: 0, pitch: -0.4, speed: 30, keys: {}, look: null, model: null, size: 1000, mode: 'tex', measure: false, pts: [], mark: null };
cam.position.set(0, 300, 600);

const status = (t, err) => { const s = $('status'); s.textContent = t; s.className = err ? 'err' : 'muted'; };
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---- loading ----
const loader = new GLTFLoader();
let origMats = new Map();
function show(gltf, name) {
  if (st.model) { scene.remove(st.model); st.model.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  clearMeasure();
  const m = gltf.scene; st.model = m; origMats = new Map();
  let tris = 0;
  m.traverse(o => { if (o.isMesh) { origMats.set(o, o.material); const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  scene.add(m);
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
  st.size = Math.max(size.x, size.z, 50); st.box = box;
  st.speed = Math.max(10, Math.min(120, st.size / 40));
  applyMode(); overhead();
  status(`${name}: ${(tris / 1000).toFixed(0)}k triangles, ${size.x.toFixed(0)} × ${size.z.toFixed(0)} m, ${size.y.toFixed(0)} m high.`);
}
function load(url, name) {
  status(`Loading ${name}…`);
  loader.load(url, (g) => show(g, name), (e) => { if (e.total) status(`Loading ${name}… ${(e.loaded / e.total * 100).toFixed(0)}%`); }, (e) => status(`Couldn't load ${name}: ${e.message || e}`, true));
}
function loadFile(f) {
  if (!f) return;
  const url = URL.createObjectURL(f);
  status(`Loading ${f.name}…`);
  loader.load(url, (g) => { show(g, f.name); URL.revokeObjectURL(url); }, undefined, (e) => status(`Couldn't load ${f.name}: ${e.message || e}`, true));
}
$('pick').addEventListener('change', (e) => { const o = e.target.selectedOptions[0]; if (o.value) load(o.value, o.textContent); });
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => loadFile(e.target.files[0]));
addEventListener('dragover', (e) => { e.preventDefault(); $('drop').style.display = 'block'; });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('drop').style.display = 'none'; });
addEventListener('drop', (e) => { e.preventDefault(); $('drop').style.display = 'none'; loadFile(e.dataTransfer.files[0]); });

// ---- look: textures, clay (plain shaded: reads the shapes), wireframe (reads how it's built) ----
const clay = new THREE.MeshLambertMaterial({ color: 0xcfc8bc });
const wire = new THREE.MeshBasicMaterial({ color: 0x20242c, wireframe: true });
function applyMode() {
  if (!st.model) return;
  st.model.traverse(o => { if (o.isMesh) o.material = st.mode === 'tex' ? origMats.get(o) : st.mode === 'clay' ? clay : wire; });
  scene.background.set(st.mode === 'wire' ? 0xe8e8e8 : 0x9fb6cc);
  for (const k of ['tex', 'clay', 'wire']) $(k).classList.toggle('on', st.mode === k);
}
for (const k of ['tex', 'clay', 'wire']) $(k).addEventListener('click', () => { st.mode = k; applyMode(); });

// ---- where you are ----
function overhead() {
  const b = st.box; if (!b) return;
  const c = b.getCenter(new THREE.Vector3());
  cam.position.set(c.x, b.max.y + st.size * 0.6, c.z + st.size * 0.35);
  st.yaw = 0; st.pitch = -1.05;
}
const ray = new THREE.Raycaster();
function hitAt(cx, cy) {
  if (!st.model) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
  const h = ray.intersectObject(st.model, true)[0];
  return h ? h.point : null;
}
// straight down from here: the ground (for driver height)
function groundBelow(p) {
  ray.set(new THREE.Vector3(p.x, (st.box ? st.box.max.y : p.y) + 50, p.z), new THREE.Vector3(0, -1, 0));
  const h = ray.intersectObject(st.model, true)[0];
  return h ? h.point.y : null;
}
function driverHeight() {
  if (!st.model) return;
  const g = groundBelow(cam.position); if (g == null) return;
  cam.position.y = g + 1.1; st.pitch = -0.05; st.speed = Math.min(st.speed, 25);
}
$('top').addEventListener('click', overhead);
$('eye').addEventListener('click', driverHeight);

// ---- measure ----
const markMat = new THREE.MeshBasicMaterial({ color: 0xff2b00, depthTest: false });
function clearMeasure() {
  if (st.mark) { scene.remove(st.mark); st.mark = null; }
  st.pts = []; $('meas').style.display = 'none';
}
function setMeasure(on) { st.measure = on; $('mbtn').classList.toggle('on', on); view.classList.toggle('measure', on); if (!on) clearMeasure(); }
$('mbtn').addEventListener('click', () => setMeasure(!st.measure));
function addPoint(p) {
  if (st.pts.length === 2) clearMeasure();
  st.pts.push(p.clone());
  if (st.mark) scene.remove(st.mark);
  st.mark = new THREE.Group(); st.mark.renderOrder = 9;
  const r = Math.max(0.15, cam.position.distanceTo(p) * 0.006);
  for (const q of st.pts) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), markMat); s.position.copy(q); s.renderOrder = 9; st.mark.add(s); }
  if (st.pts.length === 2) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(st.pts), new THREE.LineBasicMaterial({ color: 0xff2b00, depthTest: false }));
    l.renderOrder = 9; st.mark.add(l);
    const [a, b] = st.pts, flat = Math.hypot(b.x - a.x, b.z - a.z), up = b.y - a.y;
    const m = $('meas'); m.style.display = 'block';
    m.innerHTML = `Distance <b>${a.distanceTo(b).toFixed(2)} m</b><br>Across ${flat.toFixed(2)} m<br>Climbs ${up >= 0 ? '+' : ''}${up.toFixed(2)} m${flat > 0.5 ? ` (${(up / flat * 100).toFixed(1)}%)` : ''}`;
  }
  scene.add(st.mark);
}

// ---- input ----
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', (e) => { st.look = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; cvs.setPointerCapture(e.pointerId); });
cvs.addEventListener('pointermove', (e) => {
  if (!st.look) return;
  st.yaw -= (e.clientX - st.look.x) * 0.004; st.pitch = Math.max(-1.55, Math.min(1.4, st.pitch - (e.clientY - st.look.y) * 0.004));
  st.look.x = e.clientX; st.look.y = e.clientY;
});
cvs.addEventListener('pointerup', (e) => {
  const l = st.look; st.look = null;
  if (st.measure && l && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < 4) { const p = hitAt(e.clientX, e.clientY); if (p) addPoint(p); }
});
cvs.addEventListener('dblclick', (e) => {
  if (st.measure) return;
  const p = hitAt(e.clientX, e.clientY); if (!p) return;
  // land just short of it, facing the way you were looking
  const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
  cam.position.set(p.x - fx * 3, p.y + 1.1, p.z - fz * 3); st.pitch = -0.05; st.speed = Math.min(st.speed, 25);
});
cvs.addEventListener('wheel', (e) => { e.preventDefault(); st.speed = Math.max(2, Math.min(600, st.speed * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  st.keys[e.code] = true;
  if (e.code === 'KeyF') overhead();
  if (e.code === 'KeyM') setMeasure(!st.measure);
  if (e.code === 'Escape') setMeasure(false);
});
addEventListener('keyup', (e) => { st.keys[e.code] = false; });
addEventListener('blur', () => { st.keys = {}; });

// ---- each frame ----
function move(f, r, u) {
  const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
  cam.position.x += -sy * cp * f + cy * r; cam.position.z += -cy * cp * f - sy * r; cam.position.y += sp * f + u;
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const k = st.keys, sp = st.speed * (k.ShiftLeft || k.ShiftRight ? 4 : k.AltLeft || k.AltRight ? 0.25 : 1) * dt;
  move(((k.KeyW || k.ArrowUp) ? sp : 0) - ((k.KeyS || k.ArrowDown) ? sp : 0), ((k.KeyD || k.ArrowRight) ? sp : 0) - ((k.KeyA || k.ArrowLeft) ? sp : 0), (k.KeyE ? sp : 0) - (k.KeyQ ? sp : 0));
  const pad = navigator.getGamepads && [...navigator.getGamepads()].find(p => p && p.connected);
  if (pad) {
    const ax = (n) => { const a = pad.axes[n] || 0; return Math.abs(a) < 0.15 ? 0 : a; }, bt = (n) => (pad.buttons[n] ? pad.buttons[n].value : 0);
    const s = st.speed * (bt(10) > 0.5 ? 4 : 1) * dt;
    move(-ax(1) * s, ax(0) * s, (bt(7) - bt(6)) * s);
    st.yaw -= ax(2) * 2.2 * dt; st.pitch = Math.max(-1.55, Math.min(1.4, st.pitch - ax(3) * 1.8 * dt));
  }
  cam.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
  const p = cam.position;
  $('hud').textContent = st.model ? `x ${p.x.toFixed(0)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(0)}   speed ${st.speed.toFixed(0)} m/s${st.measure ? '   MEASURING: click two points' : ''}` : '';
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// trackview.html?m=zandvoort opens that reference model straight away
const q = new URLSearchParams(location.search).get('m');
if (q) { const o = [...$('pick').options].find(o => o.value.includes(q)); if (o) { $('pick').value = o.value; load(o.value, o.textContent); } }
