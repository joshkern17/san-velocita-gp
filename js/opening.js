// The opening: the living room of your trailer, at night, sat on the couch in front of the TV. Just the set for now
// (what happens in it comes later). The room is models/trailer.glb (from the PSX "Trailer Park" pack, converted in
// Blender: the trailer at the origin and what you can see from its windows); the TV's screen is a canvas (this.tv)
// for whatever's on. Look around with the mouse or the right stick.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

let roomLoad = null;
function loadRoom() {
  const url = (typeof window !== 'undefined' && window.__SVGP_TRAILER_GLB) || 'models/trailer.glb';
  return roomLoad || (roomLoad = new GLTFLoader().loadAsync(url).then(g => g.scene, () => null));
}

// sat on the couch (metres; the model's Y is up, the TV against the wall at x = 0.4, the couch at x = 3.1)
const SEAT = new THREE.Vector3(3.0, 1.15, -0.5), TV_AT = new THREE.Vector3(0.36, 0.95, -0.35);

export class Opening {
  constructor(renderer, post) {
    this.r = renderer; this.post = post;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 25, 70);
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 200);
    this.yaw = 0; this.pitch = 0; this.drag = null; this.ready = false; this.t = 0;
    // night: a faint sky, the ceiling bulb, a table lamp, and the TV's glow
    this.scene.add(new THREE.HemisphereLight(0x8090b0, 0x201810, 0.25));
    const bulb = new THREE.PointLight(0xffd9a0, 6, 9, 1.6); bulb.position.set(1.7, 2.35, 1.0);
    const lamp = new THREE.PointLight(0xffc27a, 3, 5, 1.8); lamp.position.set(3.1, 1.25, 0.8);
    this.glow = new THREE.PointLight(0x9fc0ff, 2.5, 5, 1.5); this.glow.position.set(0.9, 1.0, -0.35);
    const moon = new THREE.DirectionalLight(0x8ea4d0, 0.35); moon.position.set(-10, 12, 6);
    this.scene.add(bulb, lamp, this.glow, moon);
    // the TV's picture (static until something's on)
    const c = document.createElement('canvas'); c.width = 256; c.height = 192;
    this.tv = c; this.tvTex = new THREE.CanvasTexture(c); this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tvTex.magFilter = THREE.NearestFilter;
    this.load();
  }

  load() {
    loadRoom().then(m => {
      if (!m) return;
      m.traverse(o => {
        if (!o.isMesh) return;
        for (const mat of [].concat(o.material)) { if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.minFilter = THREE.NearestMipmapNearestFilter; } mat.metalness = 0; }
        if (/^TV\.?002$/.test(o.name)) this.fitScreen(o); // (the TV by the couch; the loader drops the dot)
      });
      this.scene.add(m); this.ready = true;
    });
  }

  // the screen: a plane just in front of the tube, on the TV's face towards the couch (+x). (Measured off the model:
  // the tube is the left-hand part of the front, the dials are on the right.)
  fitScreen(tv) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    scr.rotation.y = Math.PI / 2;
    scr.position.set(0.583, 0.882, -0.243);
    this.screen = scr; this.scene.add(scr);
  }

  // static, while nothing's on
  snow() {
    const g = this.tv.getContext('2d'), img = g.createImageData(this.tv.width, this.tv.height), d = img.data;
    for (let k = 0; k < d.length; k += 4) { const v = 70 + Math.random() * 185; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; }
    g.putImageData(img, 0, 0); this.tube(g); this.tvTex.needsUpdate = true;
  }

  // the tube's curve: dark rounded corners and a soft edge over whatever's drawn
  tube(g) {
    const w = this.tv.width, h = this.tv.height;
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  }

  enter() {
    this.yaw = 0; this.pitch = 0;
    const el = this.r.domElement;
    this.onDown = (e) => { this.drag = [e.clientX, e.clientY]; };
    this.onMove = (e) => { if (!this.drag) return; this.look((e.clientX - this.drag[0]) * -0.004, (e.clientY - this.drag[1]) * -0.004); this.drag = [e.clientX, e.clientY]; };
    this.onUp = () => { this.drag = null; };
    el.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
  }
  leave() {
    const el = this.r.domElement;
    el.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
  }
  look(dy, dp) {
    this.yaw = Math.max(-2.4, Math.min(2.4, this.yaw + dy));
    this.pitch = Math.max(-0.7, Math.min(0.6, this.pitch + dp));
  }

  update(dt) {
    this.t += dt;
    const p = navigator.getGamepads ? [...navigator.getGamepads()].find(x => x) : null;
    if (p) { const ax = p.axes[2] || 0, ay = p.axes[3] || 0; if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) this.look(-ax * dt * 2, -ay * dt * 1.4); }
    if (!this.onAir) { this.snowT = (this.snowT || 0) + dt; if (this.snowT > 1 / 15) { this.snowT = 0; this.snow(); } }
    this.glow.intensity = 2.2 + Math.sin(this.t * 23) * 0.25 + Math.sin(this.t * 7.3) * 0.2;
  }

  render() {
    const el = this.r.domElement, cam = this.camera;
    cam.aspect = el.width / el.height; cam.updateProjectionMatrix();
    cam.position.copy(SEAT);
    const to = TV_AT.clone().sub(SEAT), base = Math.atan2(-to.x, -to.z);
    cam.rotation.set(this.pitch - 0.08, base + this.yaw, 0, 'YXZ');
    this.post.render(this.scene, cam, { trails: 0, grade: [1.02, 1, 0.98] });
  }
}
