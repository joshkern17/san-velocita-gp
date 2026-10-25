# dev: close-ups of the launch set's small props (front and behind), the way the skill asks: <out>/cu_<name>.png
#   Blender -b models/garage/launch-start.blend --python .devtest/launch/closeups.py -- <outdir>
import bpy, sys, os, math
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]; os.makedirs(out, exist_ok=True)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 640, 400
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
for k, (loc, e) in enumerate((((0, -6, 5.5), 900), ((4, -2, 5), 500), ((-3, 1, 4), 300))):
    L = bpy.data.lights.new(f'A{k}', 'AREA'); L.energy = e; L.size = 4; o = bpy.data.objects.new(f'A{k}', L); o.location = loc; sc.collection.objects.link(o)
cam = bpy.data.objects.new('C', bpy.data.cameras.new('C')); sc.collection.objects.link(cam); sc.camera = cam
T = lambda n: bpy.data.objects[n].matrix_world.translation.copy()
shots = {
  'table_front': (T('LAUNCH_NAME_1') + Vector((0.45, -1.1, 0.35)), T('LAUNCH_NAME_1') + Vector((0.42, 0.1, 0.12)), 50),
  'table_side': (T('LAUNCH_NAME_2') + Vector((1.1, 0.2, 0.3)), T('LAUNCH_NAME_2') + Vector((-0.1, 0.25, 0.15)), 45),
  'table_driver': (T('LAUNCH_SEAT_1') + Vector((0.1, 0.25, 1.25)), T('LAUNCH_NAME_1') + Vector((0.2, 0.0, 0.1)), 60),
  'lectern': (T('LAUNCH_HOST') + Vector((1.2, -1.6, 0.9)), T('LAUNCH_HOST') + Vector((0.0, -0.4, 0.9)), 45),
  'lectern_back': (T('LAUNCH_HOST') + Vector((-0.3, 0.9, 1.3)), T('LAUNCH_HOST') + Vector((0.1, -0.45, 1.1)), 50),
  'speaker': (Vector((3.0, -6.2, 1.75)), Vector((3.45, -4.25, 1.85)), 30),
  'aboard': (Vector((-0.6, -11.0, 0.8)), Vector((-1.2, -9.6, 0.45)), 35),
  'donuts': (Vector((2.9, -7.6, 1.3)), Vector((3.55, -7.15, 0.85)), 40),
}
for n, (p, t, fov) in shots.items():
    cam.location = p; cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler(); cam.data.angle = math.radians(fov)
    sc.render.filepath = os.path.join(out, f'cu_{n}.png'); bpy.ops.render.render(write_still=True)
print('CLOSEUPS', out)
