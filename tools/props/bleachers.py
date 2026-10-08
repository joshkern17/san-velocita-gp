# Compact bleachers (your Maya / FBX model) -> models/bleachers.glb
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/props/bleachers.py -- "<compact bleachers.fbx>" models/bleachers.glb
# The FBX is in centimetres at a tiny scale (52 cm wide): scaled so a row is 0.67 m deep and 0.35 m up (11 rows, about
# 7.8 m wide, 4.8 m tall). Black steel frame (pCube203), aluminium benches (pCube170) and footboards (pCube171), as in
# your render; the baked metal texture is left out (flat colours, PS1 style). Placed like the game's grandstands:
# centred across, the front edge at z = 0 facing +Z (the track), rising toward -Z, standing on y = 0.
import bpy, sys
from mathutils import Vector
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
K = 15.0  # (the importer already turned centimetres into metres: x15 more)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
cols = {'pCube203': ('Steel', (0.035, 0.035, 0.04, 1)), 'pCube170': ('Aluminium', (0.62, 0.64, 0.67, 1)), 'pCube171': ('Aluminium', (0.62, 0.64, 0.67, 1))}
mats = {}
objs = [o for o in bpy.data.objects if o.type == 'MESH']
for o in objs:
    name, rgba = cols.get(o.name, ('Steel', (0.035, 0.035, 0.04, 1)))
    if name not in mats:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = rgba; b.inputs['Metallic'].default_value = 0; b.inputs['Roughness'].default_value = 0.8
        mats[name] = m
    o.data.materials.clear(); o.data.materials.append(mats[name])
    o.data.uv_layers.clear() if hasattr(o.data.uv_layers, 'clear') else None
    o.scale = o.scale * K; o.location = o.location * K
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Blender is Z up, -Y = glTF +Z (front): bounds over everything
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
x0 = min(p.x for p in pts); x1 = max(p.x for p in pts); y0 = min(p.y for p in pts); z0 = min(p.z for p in pts)
off = Vector((-(x0 + x1) / 2, -y0, -z0))   # (front = the lowest Blender y)
for o in objs:
    o.data.transform(__import__('mathutils').Matrix.Translation(off)); o.data.update()
bpy.ops.object.join()
o = bpy.context.view_layer.objects.active; o.name = 'Bleachers'
pts = [v.co for v in o.data.vertices]
print('SIZE', round(max(p.x for p in pts) - min(p.x for p in pts), 2), round(max(p.y for p in pts) - min(p.y for p in pts), 2), round(max(p.z for p in pts), 2))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_texcoords=False, export_normals=True, export_apply=True, export_yup=True)
