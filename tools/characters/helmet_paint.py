# Make the racer's helmet paintable: blender -b --python tools/characters/helmet_paint.py -- <Racer.glb> <out dir>
# Writes <out>/helmet-paint.blend (helmet + body for reference) and <out>/helmet_detail.png, the greyscale detail
# layer the game multiplies under every team's helmet design (white = colour untouched, darker = shaded).
# Layout matches js/livery.js paintHelmet(canvas, cfg, front = 0.5): a world-map wrap, visor in the middle of the
# image, his left side at u .75, the back at the left/right edges, the crown along the top.
# The starter image is white with a soft shadow towards the rim.
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
FRONT = 0.5
W, H = 1024, 512

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):  # leftover sub-millimetre bits
    if o.name.startswith('Object_'): bpy.data.objects.remove(o, do_unlink=True)
helmet = bpy.data.objects['Cube']; helmet.name = 'Helmet'; helmet.data.name = 'Helmet'
body = [o for o in bpy.data.objects if o.type == 'MESH' and o is not helmet][0]; body.name = 'Body (reference)'
body.hide_select = True
# Racer.glb's materials come in as alpha-blended, which Blender draws see-through: make them solid
for m in body.data.materials:
    if not m: continue
    m.surface_render_method = 'DITHERED'
    for l in [l for l in m.node_tree.links if l.to_socket.name == 'Alpha']: m.node_tree.links.remove(l)

# bake the object transform into the mesh so positions are plain world metres
helmet.data.transform(helmet.matrix_world); helmet.matrix_world.identity()
vs = [v.co for v in helmet.data.vertices]
c = Vector([(min(v[i] for v in vs) + max(v[i] for v in vs)) / 2 for i in range(3)])
print('HELMET centre', tuple(round(x, 3) for x in c))

bm = bmesh.new(); bm.from_mesh(helmet.data)
uv = bm.loops.layers.uv.verify()
for f in bm.faces:
    us, vv = [], []
    for l in f.loops:
        d = l.vert.co - c
        us.append((FRONT + math.atan2(d.x, -d.y) / (2 * math.pi)) % 1)  # 0 = front (-Y), .25 = his left (+X)
        vv.append(0.5 + math.asin(max(-1, min(1, d.z / d.length))) / math.pi)
    if max(us) - min(us) > 0.5: us = [u + 1 if u < 0.5 else u for u in us]  # faces across the back seam
    for l, u, v in zip(f.loops, us, vv): l[uv].uv = (u, v)
bm.to_mesh(helmet.data); bm.free()
# origin in the middle of the helmet: paint mirroring flips around it
helmet.data.transform(__import__('mathutils').Matrix.Translation(-c)); helmet.location = c

# starter detail layer
u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H
U, V = np.meshgrid(u, v)                                   # row 0 = bottom (Blender pixel order)
val = np.ones((H, W))
val *= 0.82 + 0.18 * np.clip((V - 0.12) / 0.25, 0, 1)      # soft shadow towards the bottom rim
px = np.dstack([val, val, val, np.ones_like(val)]).astype(np.float32)
img = bpy.data.images.new('helmet_detail', W, H, alpha=False)
img.pixels.foreach_set(px.ravel())
img.filepath_raw = os.path.join(os.path.abspath(OUT), 'helmet_detail.png'); img.file_format = 'PNG'; img.save()

mat = bpy.data.materials.new('HelmetShell'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Closest'
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.nodes.active = tex
helmet.data.materials.clear(); helmet.data.materials.append(mat)

for o in bpy.context.view_layer.objects: o.select_set(False)
helmet.select_set(True); bpy.context.view_layer.objects.active = helmet
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.abspath(OUT), 'helmet-paint.blend'), relative_remap=True)
print('WROTE', OUT)
