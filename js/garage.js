// Garage: turntable showroom for building your car
import * as THREE from 'three';
import { buildF1 } from './carmodel.js';
import { loadCharacters, makeCharacter, kitHit, crewLivery, classicCrewLook } from './characters.js';
import { fillLivery } from './livery.js';

export class Garage {
  constructor(renderer, post) {
    this.r = renderer; this.post = post;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
    // studio backdrop: gradient dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec3 p; void main(){ float h = normalize(p).y;
        vec3 c = mix(vec3(0.05,0.06,0.1), vec3(0.16,0.2,0.32), smoothstep(-0.05, 0.5, h));
        c += vec3(0.9,0.55,0.2) * 0.12 * exp(-abs(h) * 14.);
        gl_FragColor = vec4(pow(c, vec3(2.2)), 1.); }`,
    }));
    scene.add(dome);
    // floor with a soft grid + turntable
    const fc = document.createElement('canvas'); fc.width = fc.height = 256;
    const g = fc.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128); grd.addColorStop(0, '#2a2e3a'); grd.addColorStop(1, '#07080c');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; for (let k = 0; k <= 256; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
    const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshPhongMaterial({ map: ft, specular: 0x222222, shininess: 30 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    this.table = new THREE.Group(); scene.add(this.table);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.9, 0.08, 48), new THREE.MeshPhongMaterial({ color: 0x1a1d26, specular: 0x444444, shininess: 60 }));
    disc.position.y = 0.04; this.table.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.85, 0.03, 4, 64), new THREE.MeshBasicMaterial({ color: 0xe8b13a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.085; this.table.add(ring);
    // lights: key, rim, fill
    scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x201810, 0.75));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.5); key.position.set(4, 7, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb060, 0.9); rim.position.set(-5, 3, -6); scene.add(rim);
    const fill = new THREE.DirectionalLight(0x8aa8ff, 0.5); fill.position.set(-4, 2, 5); scene.add(fill);
    this.yaw = 0.7; this.pitch = 0.2; this.dist = 9.5; this.auto = true; this.t = 0;
    this.drag = null; this.painting = false;
    this.car = null; this.driver = null;
    this.shift = 0.14;            // horizontal view offset (the car sits beside the menu)
    this.target = new THREE.Vector3(0.2, 0.55, 0); this.aim = this.target.clone();
    this.onPick = null;           // (hit, phase) => true if the click was used (livery designer)
    this.ray = new THREE.Raycaster();
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      if (this.onPick && e.button === 0) { const hit = this.pickAny(e.clientX, e.clientY); if (hit && this.onPick(hit, 'down')) { this.painting = true; this.auto = false; return; } }
      this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.auto = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (this.painting) { const hit = this.pickAny(e.clientX, e.clientY); if (hit) this.onPick(hit, 'move'); return; }
      if (!this.drag) return; this.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.008; this.pitch = Math.max(-0.05, Math.min(1.35, this.drag.pitch + (e.clientY - this.drag.y) * 0.006));
    });
    window.addEventListener('pointerup', () => { this.drag = null; if (this.painting && this.onPick) this.onPick(null, 'up'); this.painting = false; });
    el.addEventListener('wheel', (e) => { if (!this.active) return; this.dist = Math.max(1.2, Math.min(18, this.dist * Math.pow(1.001, e.deltaY))); }, { passive: true });
  }
  // screen point -> livery atlas uv on the car body (null if you missed / hit an unpainted part)
  pick(cx, cy) {
    if (!this.car) return null;
    const el = this.r.domElement, r = el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hits = this.ray.intersectObject(this.car.group, true);
    for (const h of hits) {
      if (!h.object.visible || !h.uv) continue;
      if (h.object.material && h.object.material.map === this.car.livTex) return { uv: h.uv, point: h.point };
      if (h.object.material && h.object.material.map !== this.car.livTex) return null; // something else is in front
    }
    return null;
  }
  // what clicks land on: the car's livery, or (pickMode 'racer', the Livery Designer's Uniform tab) the racer's kit
  pickAny(cx, cy) { return this.pickMode === 'racer' ? this.pickRacer(cx, cy) : this.pick(cx, cy); }
  pickRacer(cx, cy) {
    if (!this.racer) return null;
    const el = this.r.domElement, r = el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const h = this.ray.intersectObject(this.racer.body, true)[0];
    const k = h && kitHit(h);
    return k ? { kit: k, point: h.point } : null;
  }
  // a pit crew member on the other side of the car, in the team's crew kit (the Uniform tab shows him)
  showCrew(on) {
    this.crewOn = on;
    if (on && !this.crewGuy) this.dressCrew(this.car && this.car.cfg);
    if (this.crewGuy) this.crewGuy.object.visible = on;
  }
  dressCrew(cfg) {
    if (!cfg || !this.crewOn) return;
    const L = fillLivery(cfg), classic = L.crew.style === 'classic';
    const look = classic ? classicCrewLook(L) : 'racer';
    if (!this.crewGuy) {
      if (!this.racer) return; // (characters not loaded yet: dressDriver calls again)
      this.crewGuy = makeCharacter({ look, clip: 'idle', livery: classic ? null : crewLivery(L), seed: 3 });
      this.crewGuy.object.position.set(-2.4, 0.08, -0.6); this.crewGuy.object.rotation.y = -1.35; // beside the right sidepod
      this.table.add(this.crewGuy.object);
    } else {
      this.crewGuy.setLook(look);
      if (!classic) this.crewGuy.setLivery(crewLivery(L));
    }
  }
  // preset camera shots for the designer
  view(name) {
    this.auto = false;
    const V = {
      three: [0.7, 0.22, 8.5, [0.2, 0.55, 0]], left: [Math.PI / 2, 0.12, 7.5, [0, 0.5, 0]], right: [-Math.PI / 2, 0.12, 7.5, [0, 0.5, 0]],
      top: [Math.PI, 1.3, 7.5, [0, 0.4, 0.2]], rear: [Math.PI, 0.3, 5.5, [0, 0.6, -1.5]], front: [0.001, 0.3, 5.5, [0, 0.4, 1.5]],
      helmet: [0.6, 0.35, 1.6, [0, 0.8, -0.08]], driver: [1.25, 0.12, 4.2, [2.5, 1.0, -0.9]], crew: [-1.35, 0.12, 4.2, [-2.4, 1.0, -0.6]],
    }[name];
    if (!V) return;
    [this.yaw, this.pitch, this.dist] = V; this.target.set(...V[3]);
    if (name === 'driver') { this.yaw = this.table.rotation.y + 1.25; const p = this.driver.getWorldPosition(new THREE.Vector3()); this.target.set(p.x, 1.0, p.z); }
    if (name === 'crew' && this.crewGuy) { this.yaw = this.table.rotation.y - 1.35; this.pitch = 0.12; this.dist = 4.2; const p = this.crewGuy.object.getWorldPosition(new THREE.Vector3()); this.target.set(p.x, 1.0, p.z); }
    // the helmet: the racer's, close up (once the people have loaded; until then the one in the cockpit)
    if (name === 'helmet' && this.racer) { this.yaw = this.table.rotation.y + 1.05; this.pitch = 0.12; this.dist = 1.5; const p = this.driver.getWorldPosition(new THREE.Vector3()); this.target.set(p.x, 1.74, p.z); }
  }
  setCar(cfg) {
    if (this.car) { this.table.remove(this.car.group); this.car.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.car = buildF1(cfg, { texSize: 2048 });
    this.car.group.position.y = 0.08;
    this.car.group.add(this.car.shadow); this.car.shadow.position.y = 0.01;
    this.table.add(this.car.group);
    // the driver, standing next to the car in the race suit (shares the car's helmet + suit textures)
    if (this.driver) { this.table.remove(this.driver); this.driver.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.driver = buildDriver(this.car);
    this.driver.position.set(2.5, 0.08, -0.9); this.driver.rotation.y = 1.25; // beside the left sidepod, facing out
    this.table.add(this.driver);
    this.dressDriver(cfg);
  }
  // the racer (js/characters.js) stands in for that simple driver once the people have loaded, in the same livery
  dressDriver(cfg) {
    if (this.racer) { this.racer.setLivery(cfg); this.driver.visible = false; this.dressCrew(cfg); return; }
    loadCharacters().then(ok => {
      if (!ok || this.racer || !this.car) return;
      this.racer = makeCharacter({ look: 'racer', clip: 'idle', livery: this.car.cfg });
      this.racer.object.position.copy(this.driver.position); this.racer.object.rotation.y = this.driver.rotation.y;
      this.table.add(this.racer.object); this.driver.visible = false;
      this.dressCrew(this.car.cfg);
    });
  }
  // livery edits (the Livery Designer): repaint the car and the racer
  repaint(cfg) { this.car.repaint(cfg); if (this.racer) this.racer.setLivery(cfg); this.dressCrew(cfg); }
  open(cfg) { this.active = true; this.auto = true; this.setCar(cfg); }
  close() { this.active = false; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.auto) this.yaw += dt * 0.35;
    if (this.racer) this.racer.update(dt);
    if (this.crewGuy && this.crewOn) this.crewGuy.update(dt);
    this.aim.lerp(this.target, 1 - Math.exp(-dt * 6));
    // gentle suspension "breathing" so you can see it work (held still while the livery's being designed: still)
    if (this.car && this.still) this.car.animate({ steer: 0, spin: 0, heave: 0, pitch: 0, roll: 0 });
    else if (this.car) this.car.animate({ steer: Math.sin(this.t * 0.7) * 0.25, spin: dt * 1.2, heave: Math.sin(this.t * 2.2) * 0.012, pitch: Math.sin(this.t * 1.3) * 0.006, roll: Math.sin(this.t * 0.9) * 0.008 });
    const c = this.camera;
    const a = this.aim;
    c.position.set(a.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, a.y + Math.sin(this.pitch) * this.dist, a.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    c.lookAt(a);
  }
  render() {
    const el = this.r.domElement;
    this.camera.aspect = el.width / el.height;
    // shift the view so the car sits to the right of the menu panel
    this.camera.setViewOffset(el.width, el.height, -el.width * this.shift, 0, el.width, el.height);
    this.camera.updateProjectionMatrix();
    this.post.render(this.scene, this.camera, { trails: 0, grade: [1.03, 1, 0.97] });
    if (this.afterRender) this.afterRender(); // (the livery shape editor's nodes, drawn over the car)
  }
}

// low-poly driver in the team's race suit + helmet
function buildDriver(model) {
  const g = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ map: model.suitTex }), limb = new THREE.MeshLambertMaterial({ map: model.limbTex }), arm = new THREE.MeshLambertMaterial({ map: model.armTex });
  const dark = new THREE.MeshLambertMaterial({ color: model.cfg.third ?? 0x121214 });
  const mesh = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; g.add(m); return m; };
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.078, 0.066, 0.84, 10), limb, s * 0.1, 0.48, 0);          // legs
    mesh(new THREE.BoxGeometry(0.12, 0.08, 0.27), dark, s * 0.1, 0.04, 0.045);                  // boots
    mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.62, 8), arm, s * 0.265, 1.13, 0, s * 0.1);  // arms
    mesh(new THREE.SphereGeometry(0.052, 8, 6), dark, s * 0.295, 0.8, 0);                        // gloves
  }
  const torso = mesh(new THREE.CylinderGeometry(0.2, 0.165, 0.6, 14), suit, 0, 1.18, 0); torso.scale.set(1.08, 1, 0.72);
  mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.08, 10), suit, 0, 0.9, 0).scale.set(1.5, 1, 1.05);  // hips
  mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), dark, 0, 1.52, 0);                      // neck
  const hel = new THREE.Mesh(model.helmet.geometry, model.helmet.material); hel.position.set(0, 1.66, 0); hel.scale.set(1.05, 1.05, 1.15); g.add(hel);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.158, 10, 4, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.36, Math.PI * 0.17), model.visorMat);
  visor.position.copy(hel.position); visor.scale.copy(hel.scale); g.add(visor);
  return g;
}
