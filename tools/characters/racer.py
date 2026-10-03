# Add the racer (long-sleeve suit + gloves + helmet) to the rebuilt NPCs, between rebuild.py and mixamo.py:
#   blender -b <clean.blend> --python tools/characters/racer.py -- <helmet-paint.glb> <out.blend>
# helmet-paint.glb is exported from models/racer/helmet-paint.blend: the body ("Body (reference)") and the painted
# helmet ("Helmet", world-map UVs, models/racer/helmet_detail.png). The body has no rig of its own, so:
#   - skin weights are copied from the coveralls guy (same body, same pose) by nearest surface
#   - the helmet is weighted 100% to the head
#   - the suit is split into torso / each arm / each leg / boots with "tube" UVs (UVSuit) laid out like
#     js/livery.js paintSuit (u 0 = front, .25 = his left, .5 = back; v 1 = top of the part), and the coveralls'
#     creases are baked into each part as a greyscale detail texture that the game multiplies under the design
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
SIZE = 256

scene = bpy.context.scene
skel = bpy.data.objects['Skeleton']
donor = bpy.data.objects['coveralls_gray']
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=SRC)
new = [o for o in bpy.data.objects if o not in before]
body = next(o for o in new if o.name.startswith('Body'))
helmet = next(o for o in new if o.name.startswith('Helmet'))
for o in new:
    if o not in (body, helmet): bpy.data.objects.remove(o, do_unlink=True)
for o in (body, helmet):
    o.parent = None
    o.data.transform(o.matrix_world); o.matrix_world.identity()
    for c in list(o.users_collection): c.objects.unlink(o)
    scene.collection.objects.link(o)
body.name = body.data.name = 'racer'
helmet.name = helmet.data.name = 'racer_helmet'
bb = lambda o: [tuple(round(min(v.co[i] for v in o.data.vertices), 3) for i in range(3)), tuple(round(max(v.co[i] for v in o.data.vertices), 3) for i in range(3))]
print('BBOX racer', bb(body), 'donor', bb(donor))

def ctx(o): return bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o])

# --- weights from the donor
m = body.modifiers.new('weights', 'DATA_TRANSFER')
m.object = donor; m.use_object_transform = True
m.use_vert_data = True; m.data_types_verts = {'VGROUP_WEIGHTS'}; m.vert_mapping = 'POLYINTERP_NEAREST'
m.layers_vgroup_select_src = 'ALL'; m.layers_vgroup_select_dst = 'NAME'
with ctx(body): bpy.ops.object.datalayout_transfer(modifier=m.name); bpy.ops.object.modifier_apply(modifier=m.name)
print('GROUPS', len(body.vertex_groups))
hg = helmet.vertex_groups.new(name='spine.006'); hg.add(range(len(helmet.data.vertices)), 1.0, 'REPLACE')
# Racer.glb's helmet is inside-out: make sure every face points outwards
bm = bmesh.new(); bm.from_mesh(helmet.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(helmet.data); bm.free()

# --- split the suit into parts by which bones move it
names = {vg.index: vg.name for vg in body.vertex_groups}
def part_of(name):
    if name.startswith(('foot', 'toe')): return 'boots'
    if name.startswith(('thigh', 'shin')): return 'legs'
    if name.startswith(('upper_arm', 'forearm', 'hand')): return 'arms'
    return 'torso'
me = body.data
mats = list(me.materials)
cloth = next(i for i, mt in enumerate(mats) if mt and mt.name.startswith('job-male'))
for mt in mats:  # imported alpha-blended: make solid
    if not mt: continue
    mt.surface_render_method = 'DITHERED'
    for l in [l for l in mt.node_tree.links if l.to_socket.name == 'Alpha']: mt.node_tree.links.remove(l)
src_img = next(n.image for n in mats[cloth].node_tree.nodes if n.type == 'TEX_IMAGE')
# parts: torso, each arm, each leg (own canvases: a decal can sit on one sleeve) and the boots (painted as racing boots)
PARTS = ('torso', 'armL', 'armR', 'legL', 'legR', 'boots')
MAT_NAME = {'torso': 'SuitTorso', 'armL': 'SuitArmL', 'armR': 'SuitArmR', 'legL': 'SuitLegL', 'legR': 'SuitLegR', 'boots': 'Boots'}
PART_MAT = {}
for part in PARTS:
    mt = bpy.data.materials.new(MAT_NAME[part]); mt.use_nodes = True
    me.materials.append(mt); PART_MAT[part] = len(me.materials) - 1
vpart = []
for v in me.vertices:
    acc = {}
    for g in v.groups: acc[part_of(names[g.group])] = acc.get(part_of(names[g.group]), 0) + g.weight
    vpart.append(acc)
face_part = {}
for p in me.polygons:
    if p.material_index != cloth: continue
    acc = {}
    for vi in p.vertices:
        for k, w in vpart[vi].items(): acc[k] = acc.get(k, 0) + w
    part = max(acc, key=acc.get) if acc else 'torso'
    if part in ('arms', 'legs'): part = part[:3] + ('L' if p.center.x > 0 else 'R')
    p.material_index = PART_MAT[part]; face_part[p.index] = part
print('PARTS', {k: sum(1 for x in face_part.values() if x == k) for k in PARTS})

# --- tube UVs (UVSuit), all with the torso's handedness: u 0 = front, .25 = his left, .5 = back, .75 = his right
# (so text reads the right way round on every part, and the left/right limbs mirror at u -> 1 - u)
uvs = me.uv_layers.new(name='UVSuit')
B = {b.name: b for b in skel.data.bones}
def head(n): return skel.matrix_world @ B[n].head_local
def verts_of(part): return [me.vertices[vi].co for i, pt in face_part.items() if pt == part for vi in me.polygons[i].vertices]
torso_v = verts_of('torso')
tz0, tz1 = min(c.z for c in torso_v), max(c.z for c in torso_v)
ty = sum(c.y for c in torso_v) / len(torso_v)
def limb(a, b):  # axis from joint a to joint b: returns (origin, axis unit, length, fwd, left)
    o, e = head(a), head(b); ax = (e - o); L = ax.length; ax.normalize()
    fwd = Vector((0, -1, 0)); fwd = (fwd - ax * fwd.dot(ax)).normalized()
    left = Vector((1, 0, 0)); left = (left - ax * left.dot(ax) - fwd * left.dot(fwd)).normalized()
    return o, ax, L, fwd, left
LIMBS = {'legL': limb('thigh.L', 'foot.L'), 'legR': limb('thigh.R', 'foot.R'), 'armL': limb('upper_arm.L', 'hand.L'), 'armR': limb('upper_arm.R', 'hand.R')}
BOOTS = {}
for side in 'LR':
    bv = [me.vertices[vi].co for i, pt in face_part.items() if pt == 'boots' for vi in me.polygons[i].vertices if (me.vertices[vi].co.x > 0) == (side == 'L')]
    BOOTS[side] = (sum(c.x for c in bv) / len(bv), sum(c.y for c in bv) / len(bv), min(c.z for c in bv), max(c.z for c in bv))
def uv_for(part, co):
    if part == 'torso':
        return (math.atan2(co.x, -(co.y - ty)) / (2 * math.pi)) % 1, (co.z - tz0) / (tz1 - tz0)
    if part == 'boots':  # a tube round each foot: v 1 = the top of the boot, 0 = the sole
        cx, cy, z0, z1 = BOOTS['L' if co.x > 0 else 'R']
        return (math.atan2(co.x - cx, -(co.y - cy)) / (2 * math.pi)) % 1, (co.z - z0) / (z1 - z0)
    o, ax, L, fwd, left = LIMBS[part]
    d = co - o; t = d.dot(ax) / L; r = d - ax * d.dot(ax)
    return (math.atan2(r.dot(left), r.dot(fwd)) / (2 * math.pi)) % 1, 1 - t
for i, part in face_part.items():
    p = me.polygons[i]
    vals = [uv_for(part, me.vertices[me.loops[li].vertex_index].co) for li in p.loop_indices]
    us = [u for u, _ in vals]
    if max(us) - min(us) > 0.5: us = [u + 1 if u < 0.5 else u for u in us]  # faces across the seam (front)
    for li, u, (_, v) in zip(p.loop_indices, us, vals): uvs.data[li].uv = (u, min(1, max(0, v)))

# --- bake the coveralls' creases into each part (greyscale; the cloth's own tone becomes white)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 4; sc.cycles.device = 'CPU'; sc.render.bake.margin = 6
targets = {}
def bake_part(part):  # one part per bake: a temporary copy holding only that part's faces, one material
    tmp = body.copy(); tmp.data = body.data.copy(); scene.collection.objects.link(tmp); tmp.parent = None
    for mod in list(tmp.modifiers): tmp.modifiers.remove(mod)
    bm = bmesh.new(); bm.from_mesh(tmp.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != PART_MAT[part]], context='FACES'); bm.to_mesh(tmp.data); bm.free()
    tmp.data.uv_layers.active = tmp.data.uv_layers['UVSuit']
    size = SIZE if part == 'torso' else SIZE // 2 if part == 'boots' else SIZE
    img = bpy.data.images.new(f'suit_{part}_detail', size, size, alpha=False); targets[part] = img
    mt = bpy.data.materials.new('bake_' + part); mt.use_nodes = True; nt = mt.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
    srcn = nt.nodes.new('ShaderNodeTexImage'); srcn.image = src_img; srcn.interpolation = 'Closest'
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(uvn.outputs['UV'], srcn.inputs['Vector']); nt.links.new(srcn.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    tgt = nt.nodes.new('ShaderNodeTexImage'); tgt.image = img; nt.nodes.active = tgt
    tmp.data.materials.clear(); tmp.data.materials.append(mt)
    for p in tmp.data.polygons: p.material_index = 0
    for o in bpy.context.view_layer.objects: o.select_set(False)
    tmp.select_set(True); bpy.context.view_layer.objects.active = tmp
    bpy.ops.object.bake(type='EMIT')
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.materials.remove(mt)
for part in PARTS: bake_part(part)
for part, img in targets.items():
    n = img.size[0]
    px = np.array(img.pixels[:]).reshape(-1, 4)
    lum = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
    ref = np.percentile(lum[lum > 0.05], 85) if (lum > 0.05).any() else 1
    g = np.clip(lum / ref, 0, 1); g[lum <= 0.02] = 1  # unbaked gutters: white
    if part.startswith('arm'):  # below the old short sleeve the added sleeve samples a stretched strip: plain cloth there
        v = (np.arange(n * n) // n + 0.5) / n
        w = np.clip((0.53 - v) / 0.06, 0, 1)
        g = g * (1 - w) + 0.97 * w
    if part == 'boots': g = 1 - (1 - g) * 0.55  # work-boot leather: keep only a hint of it under the racing boots
    px[:, 0] = px[:, 1] = px[:, 2] = g; px[:, 3] = 1
    img.pixels.foreach_set(px.astype(np.float32).ravel()); img.pack()
    # the part's material shows its detail texture through UVSuit (the game swaps in team canvases at runtime)
    mt = me.materials[PART_MAT[part]]; nt = mt.node_tree; bsdf = nt.nodes['Principled BSDF']
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVSuit'
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Closest'; t.extension = 'REPEAT'
    nt.links.new(uvn.outputs['UV'], t.inputs['Vector']); nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    print('DETAIL', part, 'ref', round(float(ref), 3), 'mean', round(float(g.mean()), 3))
me.uv_layers.active = me.uv_layers['UVMap']
for l in me.uv_layers: l.active_render = (l.name == 'UVMap')

# --- rig both to the skeleton (mixamo.py moves everything onto the Mixamo rig from here)
for o in (body, helmet):
    o.parent = skel; o.matrix_parent_inverse = skel.matrix_world.inverted()
    o.modifiers.new('Armature', 'ARMATURE').object = skel
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('WROTE', OUT)
