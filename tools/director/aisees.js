// "What the AI sees": draws one AI car's own plan into the 3D world while the director films it (marketing only; it
// never touches the race). Loaded into the game page by director.mjs when a shot has "aiSees": true.
//   - the plan: a ribbon along its racing line (sim.line), ~300 m ahead, colored by what its speed plan does there:
//     green = throttle, yellow = lift, red = brake (the game's own racing-line thresholds: the plan's deceleration under
//     0.6 m/s² is throttle, 0.6-1.2 lift, over that brake; js/race.js buildRacingLine)
//   - braking points: a post where the plan starts braking for each corner ahead (js/racecraft.js brakePoint)
//   - target corner speeds: the plan's speed at each corner's apex (sim.corners.list[].apex), in mph
//   - the pass planner, when it's attacking someone (car.ai.pass): what it's going for
// The plan read is the car's own as it drives it right now: car._sv.V (drivenPlan: its learned plan scaled by its grip
// now), falling back to car.lineV, then sim.lineV.
import * as THREE from 'three';
import { surfaceY } from '/js/track.js';
import { brakePoint } from '/js/racecraft.js';

const AHEAD = 300, BEHIND = 6, HALF = 0.45;               // metres of plan shown; ribbon half-width
const COL = { go: [0.36, 0.86, 0.38], lift: [0.96, 0.85, 0.28], brake: [0.9, 0.1, 0.06] }; // (the game's LINE_COL; red a touch deeper so it survives the PSX look)
const MPH = 2.23694;
const FONT_UI = "'SV UI', 'Helvetica Neue', Arial, sans-serif", FONT_NUM = "'SV Num', 'SV UI', 'Helvetica Neue', Arial, sans-serif";

// a text label drawn the game's way: the colour's own soft glow, no dark shadow (BRAND §2)
function label(w = 512, h = 160) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true, fog: false }));
  sp.renderOrder = 10; sp.visible = false;
  const L = { sp, cv, tex, key: '' };
  L.draw = (key, fn) => { if (L.key === key) return; L.key = key; const g = cv.getContext('2d'); g.clearRect(0, 0, w, h); fn(g, w, h); tex.needsUpdate = true; };
  return L;
}
const glowText = (g, txt, x, y, font, col, align = 'center') => {
  g.font = font; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillStyle = col;
  g.shadowColor = col; g.shadowBlur = 14; g.fillText(txt, x, y); g.shadowBlur = 5; g.fillText(txt, x, y); g.shadowBlur = 0;
};

export function install(sim) {
  const T = sim.T, N = T.N, ds = T.ds, root = new THREE.Group(); root.visible = false; sim.scene.add(root);
  const n = Math.ceil((AHEAD + BEHIND) / ds) + 2;
  // the plan ribbon (rebuilt in place every frame around the car)
  const pos = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 4), idx = [];
  for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
  const ribbon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, fog: false }));
  ribbon.frustumCulled = false; ribbon.renderOrder = 3; root.add(ribbon);
  // braking posts + their labels, apex speed labels (a small pool each)
  const postGeo = new THREE.BoxGeometry(0.22, 2.6, 0.22), postMat = new THREE.MeshBasicMaterial({ color: 0xff2b00, fog: false });
  const barGeo = new THREE.BoxGeometry(1, 0.06, 0.5), barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const POOL = 4, posts = [], bars = [], brakeL = [], speedL = [];
  for (let k = 0; k < POOL; k++) {
    const p = new THREE.Mesh(postGeo, postMat); p.visible = false; root.add(p); posts.push(p);
    const b = new THREE.Mesh(barGeo, barMat); b.visible = false; b.renderOrder = 4; root.add(b); bars.push(b);
    const lb = label(320, 110); root.add(lb.sp); brakeL.push(lb);
    lb.draw('brake', (c, w, h) => { glowText(c, 'BRAKE', w / 2, 76, `500 54px ${FONT_UI}`, '#ff2b00'); });
    const ls = label(420, 160); root.add(ls.sp); speedL.push(ls);
  }
  const passL = label(560, 110); root.add(passL.sp);
  const KIND = { inside: 'GOING INSIDE', outside: 'AROUND THE OUTSIDE', brake: 'OUT-BRAKING', tow: 'IN THE TOW', cut: 'SWITCHBACK' };

  const yAt = (i, s) => surfaceY(T, i, 0, s) + (sim.A && sim.A.LIFT ? sim.A.LIFT[i] : 0);
  const fwd = (a, b) => ((b - a) % N + N) % N;
  // (labels: sized in metres, growing with distance from the camera up to a cap, so a far one still reads and a near
  // one doesn't fill the frame)
  const size = (at, k, lo, hi) => Math.max(lo, Math.min(hi, sim.camera.position.distanceTo(at) * k));
  function update(car) {
    if (!car) return;
    const V = (car._sv && car._sv.V) || car.lineV || sim.lineV, O = sim.line;
    // ribbon
    const i0 = (car.idx - Math.round(BEHIND / ds) + N) % N;
    for (let k = 0; k < n; k++) {
      const i = (i0 + k) % N, j = (i + 1) % N, o = O[i];
      const a = V[i], b = V[j], dec = (a * a - b * b) / (2 * ds);
      const c = dec < 0.6 ? COL.go : dec < 1.2 ? COL.lift : COL.brake;
      const dist = (k * ds) - BEHIND, fade = dist < 0 ? Math.max(0, 1 + dist / BEHIND) : Math.max(0, Math.min(1, (AHEAD - dist) / 80));
      for (let s = 0; s < 2; s++) {
        const off = o + (s ? HALF : -HALF), v = (k * 2 + s);
        pos[v * 3] = T.X[i] + T.RX[i] * off; pos[v * 3 + 1] = yAt(i, off) + 0.04; pos[v * 3 + 2] = T.Z[i] + T.RZ[i] * off;
        col[v * 4] = c[0]; col[v * 4 + 1] = c[1]; col[v * 4 + 2] = c[2]; col[v * 4 + 3] = 0.82 * fade;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    // corners ahead: braking post at the brake point, target speed over the apex
    const list = (sim.corners && sim.corners.list) || [];
    const ahead = list.map(c => ({ c, d: fwd(car.idx, c.apex) * ds })).filter(x => x.d > 4 && x.d < AHEAD).sort((x, y) => x.d - y.d).slice(0, POOL);
    for (let k = 0; k < POOL; k++) {
      const a = ahead[k];
      posts[k].visible = bars[k].visible = brakeL[k].sp.visible = speedL[k].sp.visible = false;
      if (!a) continue;
      const c = a.c, bp = brakePoint(T, V, c), dB = fwd(car.idx, bp) * ds;
      // (only a corner the plan really brakes for gets a post: more than 3 mph off between the brake point and the apex)
      const brakes = (V[bp] - V[c.apex]) * MPH > 3;
      if (brakes && dB > 2 && dB < a.d) {
        const o = O[bp], out = o + (c.dir > 0 ? -1 : 1) * 2.2; // (the post stands on the outside of the line)
        posts[k].position.set(T.X[bp] + T.RX[bp] * out, yAt(bp, out) + 1.3, T.Z[bp] + T.RZ[bp] * out); posts[k].visible = true;
        bars[k].position.set(T.X[bp] + T.RX[bp] * o, yAt(bp, o) + 0.07, T.Z[bp] + T.RZ[bp] * o);
        bars[k].rotation.set(0, Math.atan2(-T.RZ[bp], T.RX[bp]), 0); // (local x across the road) bars[k].scale.set(HALF * 2 + 0.6, 1, 1); bars[k].visible = true;
        const L = brakeL[k]; L.sp.position.set(posts[k].position.x, posts[k].position.y + 2.0, posts[k].position.z);
        const wB = size(L.sp.position, 0.12, 2.5, 12); L.sp.scale.set(wB, wB * 110 / 320, 1); L.sp.visible = true;
      }
      const mph = Math.round(V[c.apex] * MPH), S = speedL[k], o = O[c.apex];
      S.draw('s' + mph, (g2, w, h) => { glowText(g2, String(mph), w / 2 - 30, 116, `500 104px ${FONT_NUM}`, '#ff6a1c'); glowText(g2, 'MPH', w / 2 + 120, 116, `500 38px ${FONT_UI}`, '#ff2b00', 'left'); });
      S.sp.position.set(T.X[c.apex] + T.RX[c.apex] * o, yAt(c.apex, o) + 4.2, T.Z[c.apex] + T.RZ[c.apex] * o);
      const wS = size(S.sp.position, 0.2, 4, 24); S.sp.scale.set(wS, wS * 160 / 420, 1); S.sp.visible = true;
    }
    // the pass planner
    const P = car.ai && car.ai.pass;
    passL.sp.visible = false;
    if (P && P.o && (P.stage === 'out' || P.stage === 'dive')) { // (only once it's committed to a move)
      const txt = KIND[P.kind] || 'ATTACKING';
      passL.draw('p' + txt, (g2, w, h) => { glowText(g2, txt, w / 2, 74, `500 50px ${FONT_UI}`, '#ffc21a'); });
      const p = car.phys; passL.sp.position.set(p.x, car.y + 2.6, p.z); passL.sp.scale.set(4.2, 4.2 * 110 / 560, 1); passL.sp.visible = true;
    }
  }
  return { root, update, show(on) { root.visible = !!on; } };
}
