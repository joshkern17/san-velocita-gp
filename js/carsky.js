// The sky the cars' clear coat reflects: a small cube map of the track's sky (world.js redraws it from the time of
// day), a dark treeline / stands band at the horizon and the ground below, so a body reads as glossy paint.
import * as THREE from 'three';

const S = 32;
const faces = typeof document !== 'undefined' ? [...Array(6)].map(() => { const c = document.createElement('canvas'); c.width = c.height = S; return c; }) : null;
export const carSky = faces ? new THREE.CubeTexture(faces) : null;
if (carSky) carSky.colorSpace = THREE.SRGBColorSpace;

// each face's pixel -> direction (px, nx, py, ny, pz, nz; row 0 is the top)
const DIR = [(a, b) => [1, -b, -a], (a, b) => [-1, -b, a], (a, b) => [a, 1, b], (a, b) => [a, -1, -b], (a, b) => [a, -b, 1], (a, b) => [-a, -b, -1]];
export function setCarSky(top = 0x2f6fc8, hor = 0xc3d8ea, bottom = 0x8a9aa8) {
  if (!carSky) return;
  // (the zenith a little paler than the sky dome: a deep blue overhead tints the whole roof)
  const T = new THREE.Color(top).lerp(new THREE.Color(hor), 0.35), Hc = new THREE.Color(hor), B = new THREE.Color(bottom), c = new THREE.Color();
  // (and a little greyed: reflections read as gloss, not as a blue tint on black trim)
  for (const k of [T, Hc]) { const l = (k.r + k.g + k.b) / 3; k.lerp(new THREE.Color(l, l, l), 0.4); }
  const sky = (e) => c.copy(Hc).lerp(T, Math.pow(e, 0.6)); // e: 0 at the horizon, 1 straight up
  faces.forEach((cv, f) => {
    const g = cv.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [dx, dy, dz] = DIR[f]((x + 0.5) / S * 2 - 1, (y + 0.5) / S * 2 - 1), l = Math.hypot(dx, dy, dz), e = dy / l;
      // the skyline: a ragged band just above the horizon (by azimuth), dark like trees and stands
      const az = Math.atan2(dz, dx), line = 0.03 + 0.05 * Math.abs(Math.sin(az * 7) * Math.sin(az * 3 + 1));
      if (e > line) sky((e - line) / (1 - line));
      else if (e > 0) c.copy(B).multiplyScalar(0.2);
      else c.copy(B).multiplyScalar(0.3 - 0.15 * Math.min(1, -e * 3));
      const i = (y * S + x) * 4; d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  carSky.needsUpdate = true;
}
setCarSky();
