# Preview shots of the sprint car from the angles of the user's reference photos (Workbench, test livery colour).
#   exec(open('tools/cars/sprintshots.py').read()) with OUT_DIR set, or run after sprintcar.py.
import bpy, math
from mathutils import Vector

OUT = globals().get('OUT_DIR', '/tmp/')
# name: (azimuth deg from the nose, + = car's left side; elevation deg; lens mm)
SHOTS = {'p1_right_front_high': (-38, 34, 200), 'p2_right_front': (-58, 20, 200), 'p3_right_front_low': (-70, 12, 160),
         'side': (90, 0, 120), 'rear34': (150, 22, 120)}
TARGET = Vector((0, 0.05, 0.85))

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True; sh.cavity_type = 'BOTH'
sh.show_shadows = True; sh.shadow_intensity = 0.35
sc.display.shading.background_type = 'VIEWPORT' if hasattr(sh, 'background_type') else None
sc.render.resolution_x, sc.render.resolution_y = 1000, 700
sc.render.film_transparent = False
w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.color = (0.42, 0.33, 0.25)   # dirt-brown backdrop

cam = bpy.data.objects.get('ShotCam')
if not cam:
  cam = bpy.data.objects.new('ShotCam', bpy.data.cameras.new('ShotCam')); sc.collection.objects.link(cam)
sc.camera = cam
for name, (az, el, lens) in SHOTS.items():
  cam.data.lens = lens
  dist = 16.0 * lens / 120
  a, e = math.radians(az), math.radians(el)
  cam.location = TARGET + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
  cam.rotation_euler = (TARGET - cam.location).to_track_quat('-Z', 'Y').to_euler()
  sc.render.filepath = OUT + 'shot_' + name + '.png'
  bpy.ops.render.render(write_still=True)
result = {'shots': list(SHOTS)}
