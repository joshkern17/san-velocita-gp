// Paper props drawn on canvases (the opening's pile, the claim forms): a sheet is a thin box with its face printed.
import * as THREE from 'three';

// a pseudo-random number from an integer
export const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function paperCanvas(w, h, bg = '#f1ede2') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  return [c, g];
}
export function text(g, s, x, y, font, color = '#1b1a18', align = 'left') { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); }
// grey lines standing in for small print
export function lines(g, x, y, w, n, gap = 9, seed = 1) {
  g.fillStyle = 'rgba(40,38,34,0.38)';
  for (let i = 0; i < n; i++) g.fillRect(x, y + i * gap, w * (i === n - 1 ? 0.55 : 0.82 + hash(seed + i) * 0.18), 2);
}
export function barcode(g, x, y, w, h, seed) {
  g.fillStyle = '#111';
  for (let k = 0, cx = x; cx < x + w; k++) { const bw = 1 + Math.floor(hash(seed + k) * 3); if (k % 2 === 0) g.fillRect(cx, y, bw, h); cx += bw; }
}


export const paperMats = []; // (every sheet's materials: the paper darkens with the room)
// a sheet of paper as a thin box: its face (+z) printed, the edges and back plain. Unlit (and dimmed with the room,
// paperMats) unless lit: then the scene's lights fall on it
export function sheet(canvas, w, h, thick = 0.0012, back = 0xe9e4d8, lit = false) {
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const M = lit ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
  const face = new M({ map: tex }), edge = new M({ color: back });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), [edge, edge, edge, edge, face, edge]);
  m.userData.tex = tex; m.userData.mats = [face, edge]; if (!lit) paperMats.push(face, edge);
  return m;
}
