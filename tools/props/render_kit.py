# Renders a trackside kit .blend's preview from a few cameras (front three-quarter, behind, track level, close-ups) to
# PNGs and a contact sheet, for checking the models the way a player sees them.
#   Blender -b models/trackside/grandstands.blend --python tools/props/render_kit.py -- <outdir> [shots.json]
# shots.json: [{name, loc:[x,y,z], at:[x,y,z], lens}] in Blender space; default: four views of the PREVIEW collection.
import bpy, sys, os, json, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0]); os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.render.film_transparent = False
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.55, 0.68, 0.85, 1); bg.inputs['Strength'].default_value = 0.9
sun = bpy.data.objects.new('SUN', bpy.data.lights.new('SUN', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), 0, math.radians(-35)); sun.data.angle = math.radians(3)
# a ground
me = bpy.data.meshes.new('GROUND'); me.from_pydata([(-400, -400, 0), (400, -400, 0), (400, 400, 0), (-400, 400, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new('GROUND', me); sc.collection.objects.link(g)
gm = bpy.data.materials.new('GROUNDM'); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.3, 0.12, 1); me.materials.append(gm)
# a strip of track in front
me2 = bpy.data.meshes.new('ROAD'); me2.from_pydata([(-400, -24, 0.02), (400, -24, 0.02), (400, -10, 0.02), (-400, -10, 0.02)], [], [(0, 1, 2, 3)])
r = bpy.data.objects.new('ROAD', me2); sc.collection.objects.link(r)
rm = bpy.data.materials.new('ROADM'); rm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.07, 0.07, 0.075, 1); me2.materials.append(rm)

prev = [o for o in bpy.data.collections['PREVIEW (linked copies)'].objects]
lo = Vector((min(o.location.x for o in prev) - 6, 0, 0)); hi = Vector((max(o.location.x for o in prev) + 6, 30, 28))
c = (lo + hi) / 2
if len(args) > 1: shots = json.load(open(args[1]))
else:
    span = hi.x - lo.x
    shots = [dict(name='front34', loc=[lo.x - 10, -span * 0.55, 18], at=[c.x, 8, 6], lens=30),
             dict(name='front', loc=[c.x, -55, 4], at=[c.x, 10, 8], lens=35),
             dict(name='back34', loc=[hi.x + 15, 75, 22], at=[c.x, 10, 6], lens=30),
             dict(name='car', loc=[c.x - 40, -17, 1.1], at=[c.x + 10, 5, 6], lens=24)]
cam = bpy.data.objects.new('CAM', bpy.data.cameras.new('CAM')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.clip_end = 2000
files = []
for s in shots:
    cam.location = s['loc']; d = Vector(s['at']) - Vector(s['loc'])
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = s.get('lens', 35)
    p = os.path.join(OUT, s['name'] + '.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); files.append(p)
# contact sheet (2 columns)
import numpy as np
ims = []
for p in files:
    im = bpy.data.images.load(p); a = np.array(im.pixels[:], np.float32).reshape(im.size[1], im.size[0], 4); ims.append(a)
h, wd = ims[0].shape[:2]; rows_ = (len(ims) + 1) // 2
sheet = np.ones((h * rows_, wd * 2, 4), np.float32)
for i, a in enumerate(ims):
    r_, c_ = divmod(i, 2); sheet[(rows_ - 1 - r_) * h:(rows_ - r_) * h, c_ * wd:(c_ + 1) * wd] = a
out = bpy.data.images.new('sheet', wd * 2, h * rows_); out.pixels = sheet.ravel(); out.filepath_raw = os.path.join(OUT, 'sheet.png'); out.file_format = 'PNG'; out.save()
print('sheet', os.path.join(OUT, 'sheet.png'))
