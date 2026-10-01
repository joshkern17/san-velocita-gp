// Scenery breakdowns for .devtest/perf.mjs (DIAG=1 / DIAG=2), run in the page during a race.
import * as THREE from 'three';
import { envAsset, envModel, envCatalog } from '/js/envlib.js';

// DIAG=1: the scenery batches drawn from the race camera, per category (batches, in the camera's view, instances,
// models, casting shadows), and how many map cells are shown
export function visible() {
  const sim = window.__svgp.sim, cam = sim.camera;
  sim.world.update(0, cam, null, []); cam.updateMatrixWorld();
  const F = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const by = {}; let cells = 0, shown = 0;
  sim.scene.traverse(o => { if (o.name === 'env-cell') { cells++; if (o.visible) shown++; } });
  sim.scene.traverseVisible(o => {
    const a = o.isInstancedMesh && envAsset(o.name); if (!a) return;
    const b = by[a.cat] ||= { batches: 0, inView: 0, inst: 0, models: new Set(), shadow: 0 };
    b.batches++; b.inst += o.count; b.models.add(o.name); if (o.castShadow) b.shadow++; if (F.intersectsObject(o)) b.inView++;
  });
  return { cells, shown, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { ...v, models: v.models.size }])) };
}

// DIAG=2: the model library per category: models, parts, distinct materials, triangles (median / max)
export function library() {
  const by = {};
  for (const a of envCatalog().assets) {
    const m = envModel(a.id); if (!m) continue;
    const b = by[a.cat] ||= { models: 0, parts: 0, mats: new Set(), tris: [] };
    b.models++; b.parts += m.length; m.forEach(p => b.mats.add(p.mat.uuid));
    b.tris.push(m.reduce((s, p) => s + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0));
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => { v.tris.sort((a, b) => a - b); return [k, { models: v.models, parts: v.parts, mats: v.mats.size, trisMed: v.tris[v.tris.length >> 1], trisMax: v.tris[v.tris.length - 1] }]; }));
}
