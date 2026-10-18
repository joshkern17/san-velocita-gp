# Renders a station from four angles (front, from the left, close on its main piece, close on where people work), in
# use (IDLE_ hidden), against a floor and a back wall, plus a 2x2 sheet. For looking at it before the game does.
#   Blender -b <the .blend> --python .claude/skills/garage-station/scripts/render_station.py -- station_dyno <outdir> [idle] [nowall] [studio]
# The station's back is on y = 0, its front down -Y (the kit's convention); the shots are framed from its own box.
import bpy, sys, os, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
name, out = args[0], args[1]; idle = 'idle' in args[2:]; nowall = 'nowall' in args[2:]; studio = 'studio' in args[2:]
os.makedirs(out, exist_ok=True)
coll = bpy.data.collections[name]
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 960, 600
for o in sc.objects:
    if o.name.startswith('IDLE_' if not idle else 'BUSY_') or o.name.startswith(('GUIDE', 'TMP', 'LIB_')): o.hide_render = True
w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
bpy.ops.mesh.primitive_plane_add(size=16, location=(0, -4, -0.002))
if not nowall: bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0.06, 4), rotation=(math.pi / 2, 0, 0))
if studio:   # (a piece with few lights of its own: a soft key and fill so it isn't black)
    for loc, e in (((-3, -5, 5), 900), ((4, -3, 4), 400)):
        L = bpy.data.lights.new('Studio', 'AREA'); L.energy = e; L.size = 4; o = bpy.data.objects.new('Studio', L); o.location = loc
        o.rotation_euler = (Vector((0, -1, 1)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(o)
vs = [o.matrix_world @ Vector(c) for o in coll.all_objects if o.type == 'MESH' and not o.hide_render for c in o.bound_box]
lo = Vector((min(v.x for v in vs), min(v.y for v in vs), 0)); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
c = (lo + hi) / 2; W, Dp = hi.x - lo.x, hi.y - lo.y
# where people work: the STAND_ empties' middle; the main piece: the biggest mesh that isn't on the wall
st = [o.matrix_world.translation for o in coll.all_objects if o.name.startswith('STAND_')]
work = sum(st, Vector()) / len(st) if st else c
big = max((o for o in coll.all_objects if o.type == 'MESH' and not o.hide_render and (o.matrix_world @ Vector(o.bound_box[6])).y < -0.15),
          key=lambda o: (Vector(o.bound_box[6]) - Vector(o.bound_box[0])).length * max(o.scale), default=None)
main = (big.matrix_world @ ((Vector(big.bound_box[0]) + Vector(big.bound_box[6])) / 2)) if big else c
bz = [o.matrix_world @ ((Vector(o.bound_box[0]) + Vector(o.bound_box[6])) / 2) for o in coll.all_objects if o.type == 'MESH' and o.name.startswith('BUSY_') and not o.hide_render]
if bz and not idle: main = sum(bz, Vector()) / len(bz)   # (in use: what's being worked on)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 24
shots = (('front', Vector((c.x, lo.y - max(W, Dp) * 1.05, hi.z * 0.75)), Vector((c.x, c.y, hi.z * 0.35))),
         ('left', Vector((lo.x - W * 0.55, lo.y - Dp * 0.8, hi.z * 0.8)), Vector((c.x, c.y, hi.z * 0.3))),
         ('main', main + Vector((0.7, -1.3, 0.8)), main),
         ('work', work + Vector((-0.6, -1.4, 1.2)), work + Vector((0, 0.6, 0.6))))
for n, pos, at in shots:
    cam.location = pos; cam.rotation_euler = (at - pos).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, f'r-{n}.png'); bpy.ops.render.render(write_still=True)
try:   # (a sheet of the four, if Pillow's there)
    import subprocess
    subprocess.run(['python3', '-c', f'''
from PIL import Image
im = Image.new("RGB", (1920, 1200))
for k, f in enumerate(["front", "left", "main", "work"]): im.paste(Image.open("{out}/r-" + f + ".png"), ((k % 2) * 960, (k // 2) * 600))
im.save("{out}/sheet.png")'''], check=False)
except Exception: pass
print('RENDERED', out)
