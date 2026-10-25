# Before tools/cars/hdcar.py, for a source whose tires hdcar can't find by one material name: gives the tire faces a
# material of their own, 'hd_tire' (then pass hd_tire as hdcar's tire material).
#   Blender -b -P tools/cars/hdprep.py -- <source.glb> <out.glb> '<json>'
# json (either or both):
#   "merge": ["matA", "matB"]           the tires are in several materials (one per side, or tread + sidewall): all of
#                                       those faces become hd_tire
#   "near": ["mat", "anchor", R]        the tires share "mat" with other parts (window seals, trim): only its faces within
#                                       R m (source units) of a wheel's centre become hd_tire; the wheel centres are the
#                                       four corner clusters of the "anchor" material's faces (brake discs, rims)
#   "rename": {"Material.004": "glass"} materials to rename: hdcar knows windows by 'glass' / 'window' in the name, and
#                                       a source with numbered material names needs telling
#   "color": {"Metallic_1": [0.8, 0.8, 0.82]} plain colours to set (texture links cut): the Supra's headlight reflectors
#                                       are painted deep blue in the source
# Names match exactly (Blender's names on import), case-insensitive.
import bpy, sys, json
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out, opt = a[0], a[1], json.loads(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in obs:
    o.data = o.data.copy() if o.data.users > 1 else o.data
low = lambda m: (m.name if m else '').lower()
tire = None
def tire_slot(me):
    global tire
    if tire is None:
        first = next((m for o in obs for m in o.data.materials if m and low(m) in want), None)
        tire = first.copy() if first else bpy.data.materials.new('hd_tire'); tire.name = 'hd_tire'
    if tire not in list(me.materials): me.materials.append(tire)
    return list(me.materials).index(tire)
want = {x.lower() for x in opt.get('merge', [])} | ({opt['near'][0].lower()} if 'near' in opt else set())
centres = None
if 'near' in opt:
    anchor = opt['near'][1].lower(); pts = []
    for o in obs:
        W = o.matrix_world
        for p in o.data.polygons:
            if low(o.data.materials[p.material_index] if o.data.materials else None) == anchor: pts.append(W @ p.center)
    cx = sum(p.x for p in pts) / len(pts); cy = sum(p.y for p in pts) / len(pts)
    q = {}
    for p in pts: q.setdefault((p.x > cx, p.y > cy), []).append(p)
    centres = [sum(v, Vector()) / len(v) for v in q.values()]
    print('HDPREP wheel centres', [[round(c, 3) for c in v] for v in centres])
n = 0
for o in obs:
    me = o.data; W = o.matrix_world
    for p in me.polygons:
        m = low(me.materials[p.material_index] if me.materials else None)
        if m in {x.lower() for x in opt.get('merge', [])}: p.material_index = tire_slot(me); n += 1
        elif centres and m == opt['near'][0].lower():
            c = W @ p.center
            if min((c - w).length for w in centres) < opt['near'][2]: p.material_index = tire_slot(me); n += 1
print('HDPREP tire faces', n)
for k, v in opt.get('rename', {}).items():
    m = next((m for m in bpy.data.materials if m.name.lower() == k.lower()), None)
    if m: m.name = v; print('HDPREP renamed', k, '->', m.name)
for k, v in opt.get('color', {}).items():
    m = next((m for m in bpy.data.materials if m.name.lower() == k.lower()), None)
    b = m and m.use_nodes and next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if b:
        for l in list(b.inputs['Base Color'].links): m.node_tree.links.remove(l)
        b.inputs['Base Color'].default_value = (*v, 1); print('HDPREP colour', k, v)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
