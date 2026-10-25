// The pit wall: each team's stand on the lane side of the wall (a canopy in their colours over a row of stools,
// screens along the desk, the team's name on the fascia, rails along the lane), their engineers sat on it in the
// team kit with headsets on, watching the track; the team's flags on the garage roof (the pack's sponsor flag,
// painted in their colours); and the flag marshal on a plinth on the wall at the finish line, who waves the green
// at the start and the chequered flag once the leader's home.
//
//   new PitWall(pitLife)   (js/pitlife.js: after its boxes; the people come once the characters load)
//   .update(dt, cam)       each frame
//   .dispose()
//
// The stands stick out into the lane (pit.STAND: how far past the wall's lane face, per sample) and race.js's pit
// wall stops a car there as it would at the wall.
import * as THREE from 'three';
import { makeCharacter, classicCrewLook } from './characters.js';
import { fillLivery } from './livery.js';
import { envModel } from './envlib.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { loadRoom } from './pitgarage.js';

const SW = 6.6, SD = 1.25, RAIL = 0.3;   // a stand: long, deep (metres), and its rails this far out in the lane
const FLOOR = 0.32, DESK = 1.2, ROOF = 2.75, SEAT = 1.1;
const SEATS = [-2.4, -1.2, 0, 1.2, 2.4];
const css = (c) => '#' + new THREE.Color(c).getHexString();
const surname = (n) => String(n || '').replace(/^[A-Z]\.\s+/i, '').toUpperCase();

export class PitWall {
  constructor(life) {
    this.life = life; const race = life.race, pit = life.pit, T = life.T, N = T.N;
    this.root = new THREE.Group(); this.root.name = 'PitWall'; life.root.add(this.root);
    this.stands = []; this.people = []; this.mats = []; this.texs = [];
    this.night = !!race.world.P.night;
    // the marshal's plinth: on the wall at the finish line (where there's a wall there)
    const fin = T.open ? T.finish : 0;
    this.finIdx = !isNaN(pit.WALL[fin]) ? fin : -1;
    // a stand across the lane from each team's box (none where the marshal stands)
    pit.STAND = new Float32Array(N);
    for (const b of life.boxes) {
      const i = b.bi;
      if (isNaN(pit.WALL[i])) continue;
      if (this.finIdx >= 0 && Math.min((i - this.finIdx + N) % N, (this.finIdx - i + N) % N) * T.ds < SW / 2 + 2) continue;
      const half = Math.ceil((SW / 2 + 0.3) / T.ds);
      let ok = true;
      for (let q = -half; q <= half; q++) if (isNaN(pit.WALL[(i + q + N) % N])) ok = false;
      if (!ok) continue;
      for (let q = -half; q <= half; q++) pit.STAND[(i + q + N) % N] = SD + RAIL + 0.05;
      this.stands.push(this.makeStand(b));
      this.makeFlags(b);
    }
    if (this.finIdx >= 0) this.makePlinth();
    this.merge();
    this.alive = true;
    loadRoom().then(scene => this.addComputers(scene)).catch(e => console.warn('pit wall computers:', e && e.message));
  }
  // all of it in a few draws: the meshes merged by material (the groups stay, for the people to sit in)
  merge() {
    // (a box with a material per face is six draws: a mesh per face first, so its plain faces merge with the rest)
    const multi = []; this.root.traverse(o => { if (o.isMesh && Array.isArray(o.material) && o.geometry.index) multi.push(o); });
    for (const o of multi) {
      const src = o.geometry;
      for (const gr of src.groups) {
        const g = new THREE.BufferGeometry();
        for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
        g.setIndex(Array.from(src.index.array.slice(gr.start, gr.start + gr.count)));
        const m = new THREE.Mesh(g, o.material[gr.materialIndex]); m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
        o.parent.add(m);
      }
      o.parent.remove(o);
    }
    this.root.updateMatrixWorld(true);
    const inv = this.root.matrixWorld.clone().invert(), by = new Map(), m = new THREE.Matrix4();
    this.root.traverse(o => { if (o.isMesh && !Array.isArray(o.material)) (by.get(o.material) || by.set(o.material, []).get(o.material)).push(o); });
    for (const [mat, list] of by) {
      if (list.length < 2) continue;
      const geos = list.map(o => { const g = o.geometry.clone(); g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)); return g; });
      const keep = Object.keys(geos[0].attributes), ok = geos.every(g => Object.keys(g.attributes).length === keep.length && keep.every(k => g.attributes[k]) && !!g.index === !!geos[0].index);
      if (!ok) { geos.forEach(g => g.dispose()); continue; }
      const merged = mergeGeometries(geos);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      for (const o of list) { o.parent.remove(o); if (!o.userData.shared) o.geometry.dispose(); }
      this.root.add(new THREE.Mesh(merged, mat));
    }
  }

  // a material we made (disposed with us)
  mat(m) { this.mats.push(m); return m; }
  // (one per colour: stands that share one merge into one draw)
  lambert(color, extra = {}) {
    const key = color + JSON.stringify(extra), C = this.lam || (this.lam = new Map());
    return C.get(key) || C.set(key, this.mat(new THREE.MeshLambertMaterial({ color, ...extra }))).get(key);
  }
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.texs.push(t); return { g: c.getContext('2d'), t }; }

  // the stand's frame: x along the lane, +z toward the track, y up from the lane
  frame(i, s) {
    const life = this.life, T = life.T, sd = life.pit.side;
    const g = new THREE.Group();
    g.position.copy(life.at(i, s));
    g.rotation.y = Math.atan2(-T.RX[i] * sd, -T.RZ[i] * sd);
    this.root.add(g);
    return g;
  }

  makeStand(b) {
    const pit = this.life.pit, i = b.bi, team = b.team;
    const g = this.frame(i, pit.WALL[i] + 0.25 + SD / 2);
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
    const main = this.lambert(team.main), dark = this.lambert(0x15161a), metal = this.lambert(0xb8bcc4), glass = this.lambert(0x2a3440, { transparent: true, opacity: 0.45 });
    // the plinth: its lane face in blocks of the team's colours over a strip of light
    const base = this.canvas(512, 32);
    { const q = base.g, cols = [team.main, team.accent, team.main, team.accent];
      cols.forEach((c, k) => { q.fillStyle = css(c); q.fillRect(k * 128, 0, 128, 28); });
      q.fillStyle = '#f4f4f0'; q.fillRect(0, 28, 512, 4); }
    const plinthM = [dark, dark, dark, dark, dark, this.mat(new THREE.MeshLambertMaterial({ map: base.t, emissive: 0xffffff, emissiveMap: base.t, emissiveIntensity: this.night ? 0.35 : 0.08 }))];
    box(SW, FLOOR, SD, 0, FLOOR / 2, 0, plinthM); // (BoxGeometry's faces: +x -x +y -y +z -z; the lane is -z)
    // the desk, and the panel under it facing the track: the team's colours, name and drivers. The computers on the
    // desk (the CRT and keyboard off your own desk: addComputers) come once the garage model's in
    box(SW - 0.3, 0.06, 0.62, 0, DESK, SD / 2 - 0.33, dark);
    const info = this.teamPanel(b, 1024, 144), im = this.mat(new THREE.MeshLambertMaterial({ map: info.t, emissive: 0xffffff, emissiveMap: info.t, emissiveIntensity: this.night ? 0.45 : 0.12 }));
    box(SW - 0.3, DESK - FLOOR, 0.06, 0, (DESK + FLOOR) / 2, SD / 2 - 0.05, [dark, dark, dark, dark, im, dark]);
    // the ends: glass in a dark frame, an edge in the team's colour; the canopy over it all
    for (const s of [-1, 1]) {
      box(0.06, ROOF - FLOOR, SD, s * SW / 2, (ROOF + FLOOR) / 2, 0, glass);
      box(0.1, ROOF - FLOOR, 0.1, s * SW / 2, (ROOF + FLOOR) / 2, -SD / 2 + 0.05, dark);
      box(0.1, ROOF - FLOOR, 0.1, s * SW / 2, (ROOF + FLOOR) / 2, SD / 2 - 0.05, dark);
      box(0.12, 0.08, SD + 0.1, s * SW / 2, FLOOR + 0.04, 0, main);
    }
    box(SW + 0.3, 0.22, SD + 0.5, 0, ROOF + 0.11, -0.15, main);
    // and under the canopy's track edge, the same again (what the cars see going past)
    const top = this.teamPanel(b, 1024, 96), tm = this.mat(new THREE.MeshBasicMaterial({ map: top.t, toneMapped: false, color: this.night ? 0xffffff : 0xd0d0d0 }));
    const tp = new THREE.Mesh(new THREE.PlaneGeometry(SW, SW * 96 / 1024), tm); tp.position.set(0, ROOF - 0.33, SD / 2 + 0.1); g.add(tp);
    // the fascia under the canopy's lane edge: the team's name (both faces)
    const fas = this.canvas(1024, 96);
    { const q = fas.g; q.fillStyle = '#101114'; q.fillRect(0, 0, 1024, 96);
      q.fillStyle = css(team.accent); q.fillRect(0, 0, 1024, 6);
      q.textBaseline = 'middle'; q.textAlign = 'center'; q.letterSpacing = '-1px';
      q.font = '700 54px "SV Display", "Helvetica Neue", Arial, sans-serif'; q.fillStyle = '#f2f2f2';
      q.fillText(team.name.toUpperCase(), 512, 52); }
    const fm = this.mat(new THREE.MeshBasicMaterial({ map: fas.t, side: THREE.DoubleSide, toneMapped: false, color: this.night ? 0xffffff : 0xd0d0d0 }));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(SW, SW * 96 / 1024), fm);
    f.position.set(0, ROOF - 0.33, -SD / 2 - 0.38); f.rotation.y = Math.PI; g.add(f);
    // stools
    for (const x of SEATS) {
      box(0.06, SEAT - FLOOR - 0.04, 0.06, x, (SEAT + FLOOR) / 2, -0.05, metal);
      box(0.42, 0.07, 0.38, x, SEAT - 0.035, -0.05, dark);
      box(0.4, 0.34, 0.06, x, SEAT + 0.2, -0.27, dark);
    }
    // the rails along the lane: hoops of tube
    const tube = (x0, y0, z0, x1, y1, z1) => {
      const a = new THREE.Vector3(x0, y0, z0), c = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(c);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), metal);
      m.position.copy(a).add(c).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.sub(a).normalize()); g.add(m);
    };
    const rz = -SD / 2 - RAIL;
    for (const x of [-2.3, 0, 2.3]) { tube(x - 0.6, 0, rz, x - 0.6, 1.0, rz); tube(x + 0.6, 0, rz, x + 0.6, 1.0, rz); tube(x - 0.6, 1.0, rz, x + 0.6, 1.0, rz); }
    return { b, g, people: [] };
  }

  // a panel in the team's colours: their main colour, an accent stripe, the name, and who's driving for them
  teamPanel(b, W, H) {
    const { g, t } = this.canvas(W, H), team = b.team;
    const light = new THREE.Color(team.main).getHSL({}).l > 0.6, ink = light ? '#121214' : '#f4f4f0';
    g.fillStyle = css(team.main); g.fillRect(0, 0, W, H);
    g.fillStyle = css(team.accent); g.fillRect(0, 0, W, H * 0.09); g.fillRect(0, H * 0.91, W, H * 0.09); g.fillRect(0, 0, H * 0.22, H);
    g.textBaseline = 'middle'; g.letterSpacing = '-1px'; g.fillStyle = ink;
    const names = [...new Set((b.cars || []).map(c => surname(c.isPlayer ? this.life.race.opts.playerName || 'You' : c.name)).filter(Boolean))];
    if (!names.length && team.driver && team.driver !== 'YOU') names.push(surname(team.driver));
    const right = names.join('  ·  ');
    g.font = `500 ${Math.round(H * 0.34)}px "SV UI", "Helvetica Neue", Arial, sans-serif`;
    const rw = right ? g.measureText(right).width : 0;
    g.textAlign = 'right'; if (right) g.fillText(right, W - H * 0.3, H / 2 + 2);
    const room = W - H * 0.55 - rw - H * 0.6, name = team.name.toUpperCase();
    for (let px = Math.round(H * 0.56); px > 16; px -= 3) { g.font = `700 ${px}px "SV Display", "Helvetica Neue", Arial, sans-serif`; if (g.measureText(name).width <= room) break; }
    g.textAlign = 'left'; g.fillText(name, H * 0.42, H / 2 + 2);
    return { g, t };
  }

  // the computers on the desks: the CRT and keyboard from your garage desk (models/garage.glb), one in front of each
  // stool, all of them drawn as instances (a draw per part; the screens in six pictures)
  addComputers(scene) {
    if (!this.alive || !scene || !this.stands.length) return;
    const parts = (name) => {
      const n = scene.getObjectByName(name); if (!n) return null;
      scene.updateMatrixWorld(true);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(), n.getWorldQuaternion(new THREE.Quaternion()), n.getWorldScale(new THREE.Vector3()));
      const inv = n.matrixWorld.clone().invert(), out = [];
      n.traverse(o => {
        if (!o.isMesh) return;
        const m = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        const geo = o.geometry.clone().applyMatrix4(m);
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        const src = Array.isArray(o.material) ? o.material[0] : o.material;
        const mat = this.mat(new THREE.MeshLambertMaterial({ map: src.map || null, color: src.color ? src.color.clone() : 0xffffff }));
        out.push({ geo, mat });
      });
      return { out, base };
    };
    const crt = parts('CrtMonitor'), kb = parts('Keyboard');
    if (!crt) return;
    // the screen: where the garage lays it over the CRT's glass (js/pitgarage.js), facing the way the glass does
    const glass = new THREE.Vector3(-0.0015, 0.30, 0.2245).applyMatrix4(crt.base), facing = new THREE.Vector3(0, 0, 1).transformDirection(crt.base);
    const sc = crt.base.elements, sx = Math.hypot(sc[0], sc[1], sc[2]), sy = Math.hypot(sc[4], sc[5], sc[6]);
    // each model sat at its own origin: its footprint centred, its feet at 0; turned so the glass faces the stool
    const fit = (p) => { const bb = new THREE.Box3(); for (const q of p.out) { q.geo.computeBoundingBox(); bb.union(q.geo.boundingBox); } return bb; };
    const cb = fit(crt), yaw = Math.atan2(facing.x, facing.z) - Math.PI; // (the glass to -z: toward the stool)
    const center = (bb) => new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
    const turn = new THREE.Matrix4().makeRotationY(-yaw);
    const place = (p, bb) => { const c = center(bb); for (const q of p.out) q.geo.translate(-c.x, -c.y, -c.z).applyMatrix4(turn); return c; };
    const cc = place(crt, cb);
    const scr = new THREE.PlaneGeometry(0.391 * sx, 0.34 * sy).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(facing.x, facing.z))).translate(glass.x - cc.x, glass.y - cc.y, glass.z - cc.z).translate(facing.x * 0.004, 0, facing.z * 0.004).applyMatrix4(turn);
    const depth = (() => { const bb = new THREE.Box3(); for (const q of crt.out) { q.geo.computeBoundingBox(); bb.union(q.geo.boundingBox); } return bb; })();
    if (kb) place(kb, fit(kb));
    // where they go: on the desk, the CRT toward the track, the keyboard in front of the stool
    const zC = SD / 2 - 0.08 - depth.max.z, zK = SD / 2 - 0.62 + 0.12, at = [];
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.matrixWorld.clone().invert();
    for (const st of this.stands) for (const x of SEATS) at.push({ m: new THREE.Matrix4().multiplyMatrices(rootInv, st.g.matrixWorld), x, v: (Math.round(x * 7) + st.b.k * 3 + 60) % 6 });
    // (the CRT off to the side of the stool, turned in to face whoever sits there: you can see them past it)
    const SIDE = 0.36, TURN = 0.45;
    const inst = (geo, mat, list, dz, side = 0) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4();
      const local = new THREE.Matrix4().makeTranslation(side, DESK + 0.03, dz).multiply(new THREE.Matrix4().makeRotationY(side ? TURN : 0));
      list.forEach((a, k) => im.setMatrixAt(k, m.multiplyMatrices(a.m, new THREE.Matrix4().makeTranslation(a.x, 0, 0).multiply(local))));
      im.computeBoundingSphere(); this.root.add(im); return im;
    };
    for (const q of crt.out) inst(q.geo, q.mat, at, zC, SIDE);
    if (kb) for (const q of kb.out) inst(q.geo, q.mat, at, zK);
    // the screens: six pictures, a draw each
    const sheet = screens();
    for (let v = 0; v < 6; v++) {
      const list = at.filter(a => a.v === v); if (!list.length) continue;
      const geo = scr.clone(), uv = geo.getAttribute('uv');
      for (let q = 0; q < uv.count; q++) uv.setXY(q, (v % 3 + uv.getX(q)) / 3, (Math.floor(v / 3) + uv.getY(q)) / 2);
      inst(geo, this.mat(new THREE.MeshBasicMaterial({ map: sheet, toneMapped: false, color: 0xd8dce4 })), list, zC, SIDE);
    }
    scr.dispose();
  }

  // the team's flags on the garage roof, either side of their sign
  makeFlags(b) {
    const parts = envModel('tp_flag_0'); if (!parts) return;
    const cloth = parts.find(p => /Brands/.test(p.mat.name)), pole = parts.find(p => p !== cloth);
    if (!cloth || !pole) return;
    const T = this.life.T, N = T.N, team = b.team;
    // the cloth's own UVs, stretched over a picture of the team's colours
    const geo = cloth.geo.clone(), uv = geo.getAttribute('uv');
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < uv.count; k++) { u0 = Math.min(u0, uv.getX(k)); u1 = Math.max(u1, uv.getX(k)); v0 = Math.min(v0, uv.getY(k)); v1 = Math.max(v1, uv.getY(k)); }
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) - u0) / (u1 - u0 || 1), (uv.getY(k) - v0) / (v1 - v0 || 1));
    const tex = this.teamFlag(team, cloth.geo);
    const m = this.mat(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    const face = b.face, life = this.life, sd = life.pit.side;
    for (const along of [-4.6, 4.6]) {
      const i = (b.bi + Math.round(along / T.ds) + N) % N;
      const g = new THREE.Group();
      g.position.copy(life.at(i, face + 1.2, 7.5));
      g.rotation.y = Math.atan2(-T.RX[i] * sd, -T.RZ[i] * sd) + Math.PI / 2; // (side on to the lane: it reads from the track)
      const pm = new THREE.Mesh(pole.geo, pole.mat); pm.userData.shared = true; // (the scenery's own)
      g.add(pm, new THREE.Mesh(geo, m));
      this.root.add(g);
    }
  }
  // a feather flag in the team's colours: the main colour, an accent stripe down the pole side, the name up it
  teamFlag(team, geo) {
    const bb = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position')), W = 128, H = Math.max(256, Math.round(128 * (bb.max.y - bb.min.y) / Math.max(0.2, bb.max.x - bb.min.x)));
    const { g, t } = this.canvas(W, Math.min(1024, H));
    const h = g.canvas.height;
    g.fillStyle = css(team.main); g.fillRect(0, 0, W, h);
    g.fillStyle = css(team.accent); g.fillRect(0, 0, 14, h); g.fillRect(0, h - 10, W, 10);
    g.save(); g.translate(W / 2 + 6, h / 2); g.rotate(-Math.PI / 2);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '-1px';
    const name = team.name.toUpperCase();
    for (let px = 64; px >= 30; px -= 4) { g.font = `700 ${px}px "SV Display", "Helvetica Neue", Arial, sans-serif`; if (g.measureText(name).width < h * 0.86) break; }
    g.fillStyle = new THREE.Color(team.main).getHSL({}).l > 0.6 ? '#121214' : '#f4f4f0';
    g.fillText(name, 0, 0); g.restore();
    return t;
  }

  // the marshal's plinth on the wall at the finish line
  makePlinth() {
    const pit = this.life.pit, i = this.finIdx;
    const g = this.frame(i, pit.WALL[i]);
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.56), this.lambert(0xd8d4cc));
    p.position.y = 0.8; g.add(p);
    const rail = this.lambert(0xf2f2f2);
    for (const x of [-0.6, 0.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), rail); r.position.set(x, 2.1, -0.24); g.add(r); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.05), rail); top.position.set(0, 2.6, -0.24); g.add(top);
    this.plinth = g;
  }

  // the people, once the characters are in
  makePeople() {
    for (const st of this.stands) {
      const b = st.b;
      if (!b.active) continue;
      const classic = fillLivery(b.team).crew.style === 'classic', look = classic ? classicCrewLook(b.team) : 'racer';
      SEATS.forEach((x, k) => {
        if ((b.k * 7 + k * 3) % 5 === 4) return; // (a stool or so empty)
        const ch = makeCharacter({ look, clip: 'sit_idle', seed: b.k * 53 + k * 11 + 3, crew: !classic, livery: classic ? null : b.team, helmet: false, face: (b.k * 5 + k * 3) % 6 });
        ch.object.position.set(x, SEAT - 0.48, -0.05); ch.object.rotation.y = 0;
        this.headset(ch);
        st.g.add(ch.object);
        const m = { ch, t: Math.random() * 6, g: st.g };
        st.people.push(m); this.people.push(m);
      });
    }
    if (this.plinth) {
      const ch = makeCharacter({ look: 'polo_white', clip: 'idle', seed: 77 });
      ch.object.position.set(0, 1.6, 0.02);
      this.plinth.add(ch.object);
      this.marshal = { ch, flag: this.flagProp(ch), wave: '' };
      this.people.push({ ch, g: this.plinth });
    }
  }
  // a headset: a band over the head, a cup over each ear
  headset(ch) {
    const head = ch.bone('Head'); if (!head) return;
    ch.object.updateMatrixWorld(true);
    const s = new THREE.Vector3(); head.getWorldScale(s);
    const k = 1 / (s.x || 1), m = this.hsMat || (this.hsMat = this.lambert(0x141416));
    const geo = this.hsGeo || (this.hsGeo = mergeGeometries([
      new THREE.TorusGeometry(0.105, 0.012, 4, 10, Math.PI).translate(0, 0.1, 0),
      ...[-0.105, 0.105].map(x => new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8).rotateZ(Math.PI / 2).translate(x, 0.1, 0)),
    ]));
    const g = new THREE.Mesh(geo, m); g.userData.shared = true;
    g.scale.setScalar(k); head.add(g);
  }
  // the flag in the marshal's right hand: a stick, and the cloth (green or chequered), rolled up when not in use
  flagProp(ch) {
    const hand = ch.bone('RightHand'); if (!hand) return null;
    ch.object.updateMatrixWorld(true);
    const s = new THREE.Vector3(); hand.getWorldScale(s);
    const g = new THREE.Group(); g.scale.setScalar(1 / (s.x || 1));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 5).translate(0, 0.4, 0), this.lambert(0x2a2a2a)); g.add(stick);
    const chk = this.canvas(64, 48);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { chk.g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; chk.g.fillRect(x * 8, y * 8, 8, 8); }
    chk.t.magFilter = THREE.NearestFilter;
    const cloth = new THREE.PlaneGeometry(0.9, 0.62, 8, 1).translate(0.45, 0, 0);
    this.clothBase = Float32Array.from(cloth.getAttribute('position').array);
    const mat = this.mat(new THREE.MeshLambertMaterial({ map: chk.t, side: THREE.DoubleSide }));
    const c = new THREE.Mesh(cloth, mat); c.position.y = 0.6; g.add(c);
    hand.add(g);
    return { g, cloth: c, mat, chk: chk.t };
  }

  // which flag's out: green for the first seconds of the race, the chequer once anyone's finished
  flagNow() {
    const race = this.life.race;
    if (race.quali) return '';
    if ((race.finishOrder && race.finishOrder.length) || race.state === 'finished') return 'chequer';
    if (race.state === 'racing' && race.raceTime < 6) return 'green';
    return '';
  }

  update(dt, cam) {
    if (!this.people.length) return;
    this.t = (this.t || 0) + dt;
    // the marshal
    const M = this.marshal;
    if (M && M.flag) {
      const want = this.flagNow();
      if (want !== M.wave) {
        M.wave = want;
        M.ch.play(want ? 'wave' : 'idle', { fade: 0.25 });
        M.flag.cloth.visible = !!want;
        if (want === 'green') { M.flag.mat.map = null; M.flag.mat.color.setHex(0x18b03a); }
        else { M.flag.mat.map = M.flag.chk; M.flag.mat.color.setHex(0xffffff); }
        M.flag.mat.needsUpdate = true;
      }
      if (want) { // the cloth ripples as it's swung
        const pos = M.flag.cloth.geometry.getAttribute('position'), B = this.clothBase;
        for (let k = 0; k < pos.count; k++) { const x = B[k * 3]; pos.setZ(k, Math.sin(x * 7 - this.t * 14) * 0.08 * x); }
        pos.needsUpdate = true;
      }
    }
    // only animate who's near enough to see, and further off not draw them at all (a seated engineer at 150 m: a few
    // pixels, but ten draws each and their shadows: a couple of hundred down the pit wall, seen from across the circuit)
    const v = new THREE.Vector3();
    for (const m of this.people) {
      m.g.getWorldPosition(v);
      const d = v.distanceTo(cam);
      m.ch.object.visible = d <= 150;
      if (d > 150) continue;
      // now and then an engineer turns to watch a screen or gestures
      if (m.t !== undefined && (m.t -= dt) < 0) {
        m.t = 6 + Math.random() * 10;
        const r = Math.random();
        m.ch.play(r < 0.8 ? 'sit_idle' : 'sit_rub_arm', { fade: 0.5 }); // ('sit' slumps over the desk)
      }
      m.ch.update(dt);
    }
  }

  dispose() {
    this.alive = false;
    for (const m of this.people) m.ch.dispose();
    if (this.hsGeo) this.hsGeo.dispose();
    this.root.traverse(o => { if (o.isSkinnedMesh) return; if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// the screens on the desks: one sheet of six pictures (timing, the track map, telemetry traces, onboard, weather,
// the gaps), drawn once
let _scr = null;
function screens() {
  if (_scr) return _scr;
  const W = 768, H = 340, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), cw = W / 3, ch = H / 2;
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let v = 0; v < 6; v++) {
    const x0 = (v % 3) * cw, y0 = (1 - Math.floor(v / 3)) * ch; // (row 0 is the bottom of the texture)
    g.fillStyle = '#0a0d14'; g.fillRect(x0, y0, cw, ch);
    g.save(); g.beginPath(); g.rect(x0 + 2, y0 + 2, cw - 4, ch - 4); g.clip();
    if (v === 0 || v === 5) { // timing tower
      for (let r = 0; r < 10; r++) { g.fillStyle = r % 2 ? '#141a26' : '#1a2232'; g.fillRect(x0 + 6, y0 + 8 + r * 16, cw - 12, 14);
        g.fillStyle = ['#e8e8e8', '#ff2b00', '#3ef0ff', '#f2c21b'][r % 4]; g.fillRect(x0 + 10, y0 + 11 + r * 16, 6, 8);
        g.fillStyle = '#c8ccd4'; g.fillRect(x0 + 22, y0 + 12 + r * 16, 40 + rnd() * 50, 6);
        g.fillStyle = v === 5 ? '#7cff8a' : '#ffd23a'; g.fillRect(x0 + cw - 50, y0 + 12 + r * 16, 36, 6); }
    } else if (v === 1) { // the track map
      g.strokeStyle = '#e8e8e8'; g.lineWidth = 3; g.beginPath();
      for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, r = 50 + Math.sin(a * 3) * 14 + Math.cos(a * 2) * 10; const px = x0 + cw / 2 + Math.cos(a) * r * 1.3, py = y0 + ch / 2 + Math.sin(a) * r * 0.9; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke(); for (let k = 0; k < 8; k++) { g.fillStyle = ['#ff2b00', '#3ef0ff', '#f2c21b', '#7cff8a'][k % 4]; const a = rnd() * 6.28; g.fillRect(x0 + cw / 2 + Math.cos(a) * 70 - 3, y0 + ch / 2 + Math.sin(a) * 50 - 3, 6, 6); }
    } else if (v === 2 || v === 4) { // traces
      for (const [col, k0] of [['#3ef0ff', 0], ['#ff2b00', 1], ['#7cff8a', 2]]) {
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
        for (let x = 0; x < cw; x += 4) { const y = y0 + 30 + k0 * 45 + Math.sin(x * 0.05 + k0 * 2 + v) * 14 + (rnd() - 0.5) * 6; x ? g.lineTo(x0 + x, y) : g.moveTo(x0 + x, y); }
        g.stroke();
      }
    } else { // onboard: a road and the sky
      g.fillStyle = '#3a5a8a'; g.fillRect(x0, y0, cw, ch * 0.45); g.fillStyle = '#3c6a34'; g.fillRect(x0, y0 + ch * 0.45, cw, ch);
      g.fillStyle = '#4a4a50'; g.beginPath(); g.moveTo(x0 + cw * 0.46, y0 + ch * 0.45); g.lineTo(x0 + cw * 0.54, y0 + ch * 0.45); g.lineTo(x0 + cw * 0.95, y0 + ch); g.lineTo(x0 + cw * 0.05, y0 + ch); g.fill();
    }
    g.restore();
  }
  _scr = new THREE.CanvasTexture(c); _scr.colorSpace = THREE.SRGBColorSpace;
  return _scr;
}
