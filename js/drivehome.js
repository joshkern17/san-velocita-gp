// The drive home, in the opening: from the edge of town (the 6twelve's behind you) out along a country road at night
// to the trailer park. A point-to-point road with no barriers, only the world's edge (env.barrier 'none': no walls
// to see, a soft border where the runoff ends) and none of a circuit's dressing (env.dress false: no gantries, no
// corner boards). js/main.js drives it in 'test' mode (no lights, no lap timing) and hands back to the opening
// once you're past the end of the road.
import { defaultEnv } from './track.js';

// x, z (metres), road width, elevation, bank
const pt = (x, z, w = 8, e = 0, b = 0) => ({ x, z, w, e, b });

export function driveHomeTrack() {
  const points = [
    pt(0, 0, 9), pt(170, 0, 9), pt(290, 35, 8, 1), pt(370, 120, 8, 3), pt(410, 250, 8, 5, 2),
    pt(500, 330, 8, 6), pt(640, 335, 8, 6), pt(770, 285, 8, 5, -2), pt(890, 300, 8, 4), pt(970, 395, 8, 3, 2),
    pt(985, 530, 8, 2), pt(935, 640, 8, 2, -2), pt(975, 750, 8, 1), pt(1090, 800, 8, 0), pt(1230, 795, 9, 0),
  ];
  return {
    version: 1, name: 'The Drive Home', open: true, start: 0, story: true,
    desc: 'Story · the road home from the 6twelve, at night',
    env: { ...defaultEnv('grass'), time: 'night', weather: 'clear', laps: 1, opponents: 0, pits: false,
      barrier: 'none', runoff: 16, dress: false,
      setting: { kind: 'country', pitBuildings: false, density: 0.45, height: 0.4, green: 0.5, furniture: 0.4, litter: 0.6, streetTrees: 0.3, life: 0.2, seed: 1742, models: true, flora: 'auto' } },
    props: [], paint: [], points,
  };
}
// where the trailer park is, from the end of the road: metres along past the finish, and out to the right of it
export const PARK = { along: -40, right: 40 };
