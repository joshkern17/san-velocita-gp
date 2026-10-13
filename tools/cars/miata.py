# Mazda MX-5 Miata NA: a ready-made low-poly model (Sketchfab "low poly mazda mx-5 miata NA") -> the game's car.
#   Blender -b -P tools/cars/miata.py -- <src.glb> <out.blend>      (then export_game.py on the blend)
# - real size: the model is 5.74 m long; a real NA is 3.97 m (that also gives its 1.18 m height, 1.68 m width)
# - centred across and along on the wheels, tyres on the ground
# - the four wheels (one mesh) split into Wheel_FL/FR/RL/RR; the lamp lenses split off as Light_Head / Light_Tail
# - one white texture for the whole body: the model's paint is a flat red colour (no texture), and the game repaints
#   a car (and puts a livery on it) only from a mostly white photo texture. Everything is baked into a new atlas
#   (Cycles diffuse colour, with the paint set to white, times a soft ambient occlusion so the white keeps some depth)
# - body roughness 1, specular 0 (the user's setting for game cars)
import bpy, bmesh, sys, math, mathutils
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
REAL_LEN, TEX = 3.97, 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects:
    if o.type != 'MESH': bpy.data.objects.remove(o)
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def bbox(o):
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    return mathutils.Vector([min(v[i] for v in ws) for i in range(3)]), mathutils.Vector([max(v[i] for v in ws) for i in range(3)])

# scale + centre: along on the wheelbase's middle, across on the wheels, tyres on z = 0
lo, hi = mathutils.Vector((1e9,) * 3), mathutils.Vector((-1e9,) * 3)
for o in objs:
    a, b = bbox(o); lo = mathutils.Vector([min(lo[i], a[i]) for i in range(3)]); hi = mathutils.Vector([max(hi[i], b[i]) for i in range(3)])
K = REAL_LEN / (hi.y - lo.y)
wl, wh = bbox(bpy.data.objects['wheels'])
shift = mathutils.Vector((-(wl.x + wh.x) / 2, -(wl.y + wh.y) / 2, -wl.z))
for o in objs:
    o.data.transform(mathutils.Matrix.Scale(K, 4) @ mathutils.Matrix.Translation(shift)); o.data.update()
print('scale', round(K, 4), 'length', round((hi.y - lo.y) * K, 3), 'height', round((hi.z - wl.z) * K, 3))

# wheels: loose parts -> corners (nose = -Y, left = +X)
W = bpy.data.objects['wheels']
bpy.context.view_layer.objects.active = W
for o in bpy.data.objects: o.select_set(o == W)
bpy.ops.mesh.separate(type='LOOSE')
corner = {}
for o in [o for o in bpy.data.objects if o.name.startswith('wheels')]:
    a, b = bbox(o); c = (a + b) / 2
    k = ('F' if c.y < 0 else 'R') + ('L' if c.x > 0 else 'R'); corner.setdefault(k, []).append(o)
for k, parts in corner.items():
    for o in bpy.data.objects: o.select_set(o in parts)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    w = bpy.context.view_layer.objects.active; w.name = w.data.name = 'Wheel_' + k
    a, b = bbox(w); c = (a + b) / 2
    w.data.transform(mathutils.Matrix.Translation(-c)); w.location = c
    print('wheel', k, [round(x, 3) for x in c], 'r', round((b.z - a.z) / 2, 3))

# body: everything else joined
body = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Wheel_')]
for o in bpy.data.objects: o.select_set(o in body)
bpy.context.view_layer.objects.active = bpy.data.objects['body']
bpy.ops.object.join()
B = bpy.context.view_layer.objects.active; B.name = B.data.name = 'Body'

# paint -> white for the bake (a plain light grey-white: the game's 'white car' test wants light neutral texels)
for m in B.data.materials:
    if not m or not m.node_tree: continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf and m.name == 'Paint': bsdf.inputs['Base Color'].default_value = (0.92, 0.92, 0.92, 1)

# a new UV for the atlas (every face its own texels: left and right never share)
uv_old = B.data.uv_layers[0].name
atlas = B.data.uv_layers.new(name='Atlas')
B.data.uv_layers.active = atlas
bpy.context.view_layer.objects.active = B
for o in bpy.data.objects: o.select_set(o == B)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0, correct_aspect=True, scale_to_bounds=True)
bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
for u in B.data.uv_layers: u.active_render = (u.name == uv_old)   # (the materials still read the model's own UVs)

S = bpy.context.scene; S.render.engine = 'CYCLES'; S.cycles.samples = 64; S.cycles.device = 'CPU'
def bake(kind, name):
    img = bpy.data.images.new(name, TEX, TEX); img.generated_color = (1, 0, 1, 1)  # (magenta: texels no face uses)
    for m in B.data.materials:
        if not m: continue
        m.use_nodes = True; nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; n.name = 'BAKE'
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'Atlas'; nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
        nt.nodes.active = n
    if kind == 'DIFFUSE':
        S.render.bake.use_pass_direct = False; S.render.bake.use_pass_indirect = False; S.render.bake.use_pass_color = True
    S.render.bake.margin = 4; S.render.bake.use_clear = False
    bpy.ops.object.bake(type=kind)
    for m in B.data.materials:
        if not m: continue
        nt = m.node_tree
        for n in [n for n in nt.nodes if n.name == 'BAKE' or (n.type == 'UVMAP' and n.uv_map == 'Atlas')]: nt.nodes.remove(n)
    return img
col = bake('DIFFUSE', 'miata_col')
S.world = bpy.data.worlds.new('w') if not S.world else S.world
ao = bake('AO', 'miata_ao')
import numpy as np
c = np.array(col.pixels[:]).reshape(-1, 4); a = np.array(ao.pixels[:]).reshape(-1, 4)
unused = (c[:, 0] > 0.99) & (c[:, 1] < 0.01) & (c[:, 2] > 0.99)
k = 0.55 + 0.45 * a[:, :1]                 # (soft: the deepest crease keeps 55%)
c[:, :3] *= k
# (texels no face uses: plain paint white. The game tells a white car by its share of light neutral texels, and
# the unused space would otherwise be most of the texture)
c[unused, :3] = 0.92
print('unused texels', round(float(unused.mean()), 3))
tex = bpy.data.images.new('miata_body', TEX, TEX); tex.pixels = c.ravel().tolist()
tex.filepath_raw = out.replace('.blend', '_body.png'); tex.file_format = 'PNG'; tex.save()

# one material on the atlas for the body; glass dark in the photo, lamps the same texture
mat = bpy.data.materials.new('Body'); mat.use_nodes = True; nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 1.0
if 'Specular IOR Level' in bsdf.inputs: bsdf.inputs['Specular IOR Level'].default_value = 0.0
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = tex; nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
lens = {'LED': 'Light_Head', 'taillights': 'Light_Tail'}
lens_idx = {i: lens[m.name] for i, m in enumerate(B.data.materials) if m and m.name in lens}
for p in B.data.polygons: p.material_index = len(B.data.materials) + (1 if lens_idx.get(p.material_index) == 'Light_Head' else 2 if lens_idx.get(p.material_index) == 'Light_Tail' else 0)
B.data.materials.append(mat); B.data.materials.append(mat.copy()); B.data.materials.append(mat.copy())
B.data.materials[-2].name = 'Light_Head'; B.data.materials[-1].name = 'Light_Tail'
n0 = len(B.data.materials) - 3
for p in B.data.polygons: p.material_index -= 0  # (indices set above, relative to the new three)
for i in range(n0): B.data.materials.pop(index=0)
uv_keep = 'Atlas'
for u in [u for u in B.data.uv_layers if u.name != uv_keep]: B.data.uv_layers.remove(u)
B.data.uv_layers[0].active = True; B.data.uv_layers[0].active_render = True
# lamps: their own objects (the game finds them by name)
for name in ('Light_Head', 'Light_Tail'):
    bpy.context.view_layer.objects.active = B
    for o in bpy.data.objects: o.select_set(o == B)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT')
    B.active_material_index = [m.name for m in B.data.materials].index(name)
    bpy.ops.object.material_slot_select(); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    L = [o for o in bpy.context.selected_objects if o != B][0]; L.name = L.data.name = name
    print('lamp', name, len(L.data.polygons), 'faces')
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(30))
    if o.name.startswith('Light_') or o == B:
        for i in range(len(o.data.materials) - 1, -1, -1):
            if not any(p.material_index == i for p in o.data.polygons): o.data.materials.pop(index=i)
for o in bpy.data.objects: print('OUT', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons) if o.type == 'MESH' else '', [m.name for m in o.data.materials] if o.type == 'MESH' else '')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out)
