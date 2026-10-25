# Opens the commercial builder's lineup (.devtest/shoppreview.mjs -> models/trackside/src/shops_preview/shops.obj) in a
# Blender scene to look at: the game's textures pixel-sharp, a ground, a sun, a camera over the front, a label over each.
#   Blender --python tools/props/shops_preview.py      (or -b ... -- --save to write shops_preview.blend)
import bpy, os, json, math, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, 'models', 'trackside', 'src', 'shops_preview')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(D, 'shops.obj'), forward_axis='NEGATIVE_Z', up_axis='Y')
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.interpolation = 'Closest'
    m.use_backface_culling = False
sc = bpy.context.scene
labels = json.load(open(os.path.join(D, 'labels.json')))
xs = [l['x'] for l in labels]; zs = [l['z'] for l in labels]
cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
# the ground (game x, z -> Blender x, -y... the importer turned -Z forward: game z is Blender -y)
bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, -cz, -0.01)); g = bpy.context.active_object; g.scale = (max(xs) - min(xs) + 160, max(zs) - min(zs) + 160, 1); g.name = 'GROUND'
gm = bpy.data.materials.new('ground'); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.28, 0.12, 1); g.data.materials.append(gm)
for l in labels:
    bpy.ops.object.text_add(location=(l['x'], -l['z'] + 4, l['h'] + 4)); t = bpy.context.active_object
    t.data.body = (l['kind'].upper() + ('\n' + l['name'] if l['name'] else '')); t.data.size = 2.2; t.data.align_x = 'CENTER'; t.rotation_euler = (math.radians(70), 0, math.radians(180)); t.name = 'LABEL ' + l['kind']
    tm = bpy.data.materials.new('label'); tm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0.85, 0.2, 1); tm.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 0.85, 0.2, 1); tm.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0; t.data.materials.append(tm)
sun = bpy.data.objects.new('SUN', bpy.data.lights.new('SUN', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(-25))
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.7, 0.85, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
cam = bpy.data.objects.new('CAM', bpy.data.cameras.new('CAM')); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (cx, -min(zs) + 95, 70); cam.rotation_euler = (math.radians(55), 0, math.radians(180)); cam.data.lens = 24
if '--save' in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, 'shops_preview.blend')); print('saved')
    if '--render' in sys.argv:
        sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1400, 800; sc.render.filepath = os.path.join(D, 'preview.png'); bpy.ops.render.render(write_still=True)
