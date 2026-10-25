# Renders each street kit piece (models/trackside/streetkit.blend, tools/props/streetkit.py) on its own: from the
# front three-quarter and from behind, plus close-ups (CLOSE: id=x,y,z,dist;...), to PNGs for a contact sheet.
#   Blender -b models/trackside/streetkit.blend --python tools/props/render_street.py -- <outdir> [id,id]
import bpy, sys, os, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0]); os.makedirs(OUT, exist_ok=True)
ONLY = set(args[1].split(',')) if len(args) > 1 and args[1] else None
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = sc.render.resolution_y = 420
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.58, 0.68, 0.82, 1); bg.inputs['Strength'].default_value = 0.8
sun = bpy.data.objects.new('SUN', bpy.data.lights.new('SUN', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.0; sun.rotation_euler = (math.radians(48), 0, math.radians(-30))
me = bpy.data.meshes.new('GROUND'); me.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new('GROUND', me); sc.collection.objects.link(g)
gm = bpy.data.materials.new('GM'); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.22, 0.1, 1); me.materials.append(gm)
cam = bpy.data.objects.new('CAM', bpy.data.cameras.new('CAM')); sc.collection.objects.link(cam); sc.camera = cam
pieces = [o for o in bpy.data.objects if o.name.endswith('_src') and o.type == 'MESH']
CLOSE = {}
for part in os.environ.get('CLOSE', '').split(';'):
    if '=' in part:
        k, v = part.split('='); CLOSE.setdefault(k, []).append([float(a) for a in v.split(',')])

def shot(target, dist, yaw, pitch, path, lens=50):
    d = Vector((math.cos(pitch) * math.sin(yaw), -math.cos(pitch) * math.cos(yaw), math.sin(pitch)))
    cam.location = target + d * dist; cam.data.lens = lens
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

for o in pieces:
    pid = o.name[:-4]
    if ONLY and pid not in ONLY: continue
    for p in pieces: p.hide_render = p is not o
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = (lo + hi) / 2; size = max((hi - lo).length, 1.0)
    shot(ctr, size * 1.5, math.radians(-30), math.radians(14), os.path.join(OUT, pid + '_front.png'))
    shot(ctr, size * 1.5, math.radians(160), math.radians(14), os.path.join(OUT, pid + '_back.png'))
    for k, (x, y, z, dist) in enumerate(CLOSE.get(pid, [])):
        shot(Vector((x, y, z)), dist, math.radians(-25), math.radians(8), os.path.join(OUT, f'{pid}_close{k}.png'), lens=60)
print('rendered to', OUT)
