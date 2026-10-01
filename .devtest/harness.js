// dev-only: build a test track with roads meeting the circuit and look at it from fixed cameras
import { archivedTracks as presetTracks } from '../js/track.js';
import { newRoad } from '../js/roads.js';
export function testTrack(theme = 'city', opts = {}) {
  const t = JSON.parse(JSON.stringify(presetTracks()[1]));
  t.name = 'Road Test';
  if (opts.hills) t.points.forEach((p, i) => { if (i >= 16 && i <= 21) p.e = 6; });
  if (opts.noWalks) t.env.walks = false;
  if (opts.setting) t.env.setting = { kind: opts.setting, density: 0.7, height: 0.5, green: 0.5, clutter: 0.6, seed: 3, models: true, ...(opts.set || {}) };
  t.env.time = 'day'; t.env.walks = true; t.env.opponents = 0; t.env.pits = false; t.env.theme = theme;
  const r = (kind, pts, meet) => { const o = newRoad(kind, pts); if (meet) o.meet = meet; return o; };
  t.roads = [
    r('street', [[-360, 70], [-300, 100], [-246, 140]], 'open'),       // angled T into the left side
    r('avenue', [[200, -120], [200, -40], [200, 60], [200, 150]], 'open'), // straight crossing
    r('street', [[-350, 250], [-300, 225], [-246, 205]], 'barrier'),   // angled, closed
    r('street', [[460, 120], [400, 118], [352, 118]], 'gate'),
    r('street', [[60, -110], [60, 110]], 'over'),
    r('avenue', [[20, 320], [20, 530]], 'under'),
    r('street', [[140, -80], [260, -80]], 'barrier'),
    r('street', [[430, 300], [385, 240], [352, 175]], 'open'),   // shallow angle
    r('avenue', [[420, 330], [336, 238]], 'open'),               // into a corner
  ];
  if (opts.noRoads) t.roads = [];
  return t;
}
export function look(sim, x, y, z, tx, ty, tz) {
  sim.updateCamera = function () { this.camera.position.set(x, y, z); this.camera.lookAt(tx, ty, tz); };
}
