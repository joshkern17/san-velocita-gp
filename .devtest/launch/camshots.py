# dev: the season launch from each of its camera marks (CAM_launch_<shot>: tx ty tz = what it looks at, fov), the way
# the game will cut between them, plus a ground under it and the unit's warm ambient. Writes <out>/cam_<shot>.png
#   Blender -b models/garage/launch-start.blend --python .devtest/launch/camshots.py -- <outdir> [covered|revealed]
import bpy, sys, os, math
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]; out = args[0]; os.makedirs(out, exist_ok=True)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1280, 720
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.82, 0.7, 1)
if 'revealed' in args:
    for o in bpy.data.objects:
        if o.name.startswith('LAUNCH_COVER'): o.hide_render = True
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, -4, 0)); fl = bpy.context.active_object
m = bpy.data.materials.new('Floor'); m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.3, 0.31, 1); fl.data.materials.append(m)
for k, (loc, e) in enumerate((((0, -6, 5.5), 900), ((4, -2, 5), 500))):   # (the unit's ceiling lights, roughly)
    L = bpy.data.lights.new(f'Amb{k}', 'AREA'); L.energy = e; L.size = 4; o = bpy.data.objects.new(f'Amb{k}', L); o.location = loc; sc.collection.objects.link(o)
cam = bpy.data.objects.new('ShotCam', bpy.data.cameras.new('ShotCam')); sc.collection.objects.link(cam); sc.camera = cam
for e in [o for o in bpy.data.objects if o.name.startswith('CAM_launch_')]:
    p = e.matrix_world.translation; t = Vector((e['tx'], e['ty'], e['tz']))
    cam.location = p; cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler(); cam.data.angle = math.radians(e['fov'])
    sc.render.filepath = os.path.join(out, 'cam_' + e.name[len('CAM_launch_'):] + ('_rev' if 'revealed' in args else '') + '.png'); bpy.ops.render.render(write_still=True)
print('SHOTS', out)
