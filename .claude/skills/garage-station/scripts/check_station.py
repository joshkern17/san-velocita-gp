# Checks a built station before anyone looks at it: the things that went wrong before, found by measuring.
#   Blender -b <the .blend> --python .claude/skills/garage-station/scripts/check_station.py -- station_dyno [budget]
# Reports (and exits 1 on errors):
#   FLOATING   a mesh whose bottom is in the air with nothing under it and nothing it touches (the dyno's CRTs, set at the
#              height of a bridge that had been made shorter). Lamps, chains, ducts and things on the back wall are fine
#   HOOKS      STAND_ empties without clip/role; no STAND_ at all; a kneel STAND_ with nothing 0.55 m in front at knee
#              height (people would kneel at nothing: js/homecrew.js drops those)
#   BUSY/IDLE  in-use pieces with no idle state for the station at all
#   BUDGET     triangles over the budget (default 16000)
import bpy, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
name = args[0] if args else 'station_dyno'; budget = int(args[1]) if len(args) > 1 else 16000
coll = bpy.data.collections[name]
dg = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in coll.all_objects if o.type == 'MESH' and not o.name.startswith(('GUIDE', 'TMP', 'IDLE_'))]
errors, warns = [], []

def wbox(o):
    vs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))

boxes = {o: wbox(o) for o in meshes}
trees = {}
def tree(o):
    if o not in trees: trees[o] = BVHTree.FromObject(o, dg, deform=False)
    return trees[o]

def solid(p):   # (can hold something up: not a flat card or a thin wire)
    lo, hi = boxes[p]; return len(p.data.polygons) > 1 and min(hi - lo) > 0.006

def overlap(a, b):   # how much of a's box is inside b's
    (al, ah), (bl, bh) = boxes[a], boxes[b]; v = 1.0; va = 1.0
    for i in range(3):
        d = min(ah[i], bh[i]) - max(al[i], bl[i]); v *= max(0.0, d); va *= max(1e-6, ah[i] - al[i])
    return v / va

def touches(a, b, pad=0.012):
    (al, ah), (bl, bh) = boxes[a], boxes[b]
    return all(al[i] - pad <= bh[i] and bl[i] - pad <= ah[i] for i in range(3))

def resting(o, p, tol=0.03):   # p's top meets o's bottom, under o's middle
    (ol, oh), (pl, ph) = boxes[o], boxes[p]; c = (ol + oh) / 2
    return pl.x - 0.02 <= c.x <= ph.x + 0.02 and pl.y - 0.02 <= c.y <= ph.y + 0.02 and abs(ph.z - ol.z) <= tol

HANGS = ('Lamp', 'Chain', 'Duct', 'Hanger', 'Sign', 'Light', 'Louvre', 'Fan', 'Tray', 'Cable', 'Beacon', 'Bulb', 'Note', 'Screen', 'Hook', 'Ear', 'Plate', 'Print', 'Gauges', 'Switches', 'Mesh', 'Flex', 'Header', 'Hose', 'Belt', 'Line', 'Rail', 'Post', 'Shade')
for o in meshes:
    lo, hi = boxes[o]
    if lo.z < 0.03 or hi.y > -0.12: continue                  # (on the floor, or on the back wall)
    if any(k in o.name for k in HANGS): continue
    sup = [p for p in meshes if p is not o and solid(p)]
    if any(touches(o, p) for p in sup): continue                # (touching something solid: resting on it or fixed to it)
    # nothing it rests on or sits in: how far down is whatever is under its middle?
    mid = (lo + hi) / 2; hit = None
    for p in sup:
        r = tree(p).ray_cast(p.matrix_world.inverted() @ Vector((mid.x, mid.y, lo.z + 0.001)), (p.matrix_world.inverted().to_3x3() @ Vector((0, 0, -1))).normalized(), 3)
        if r[0] is not None:
            d = (lo.z + 0.001) - (p.matrix_world @ r[0]).z
            if hit is None or d < hit: hit = d
    gap = hit if hit is not None else lo.z
    if gap > 0.02: errors.append(f'FLOATING {o.name}: bottom at {lo.z:.3f} m, {gap:.3f} m over what is under it')

stands = [o for o in coll.all_objects if o.type == 'EMPTY' and o.name.startswith('STAND_')]
if not stands: errors.append('HOOKS no STAND_ empties: nobody works here')
for s in stands:
    if 'clip' not in s.keys() or 'role' not in s.keys(): errors.append(f'HOOKS {s.name}: needs clip and role')
    if str(s.get('clip', '')).startswith('kneel'):
        f = (s.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized(); a = s.matrix_world.translation + f * 0.55; a.z += 0.35
        if not any(boxes[o][0].x - 0.15 < a.x < boxes[o][1].x + 0.15 and boxes[o][0].y - 0.15 < a.y < boxes[o][1].y + 0.15 and boxes[o][0].z < a.z < boxes[o][1].z + 0.2 for o in meshes):
            errors.append(f'HOOKS {s.name}: kneels at nothing (nothing 0.55 m in front at knee height)')
busy = {o.name.split('_')[1] for o in coll.all_objects if o.name.startswith('BUSY_')}
idle = {o.name.split('_')[1] for o in coll.all_objects if o.name.startswith('IDLE_')}
for k in busy - idle: warns.append(f'BUSY/IDLE {k}: in-use pieces but nothing for when it is idle')
t = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in coll.all_objects if o.type == 'MESH')
(errors if t > budget else []).append(f'BUDGET {t} triangles (budget {budget})')
for m in warns: print('WARN ', m)
for m in errors: print('ERROR', m)
print(f'CHECK {name}: {len(meshes)} meshes, {len(stands)} STAND_, {t} triangles, {len(errors)} errors, {len(warns)} warnings')
sys.exit(1 if errors else 0)
