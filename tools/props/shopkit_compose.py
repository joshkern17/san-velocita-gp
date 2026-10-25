# A look at the shop kit put together (tools/props/shopkit.py -> models/trackside/shopkit.blend): two strip centers
# the way the commercial builder will lay them along a real building, as linked copies of the kit's pieces, with the
# building's body behind them. Saves models/trackside/shopkit_strip.blend (open it in Blender) and renders a few views.
#   Blender -b models/trackside/shopkit.blend --python tools/props/shopkit_compose.py -- [outdir]
import bpy, sys, os, math
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(args[0]) if args else os.path.join(ROOT, '.devtest', 'out', 'shopkit', 'compose')
os.makedirs(OUT, exist_ok=True)
src = {o.name[:-4]: o for o in bpy.data.objects if o.name.endswith('_src')}
sc = bpy.data.scenes.new('STRIP CENTERS'); bpy.context.window.scene = sc if bpy.context.window else sc
col = bpy.data.collections.new('strip'); sc.collection.children.link(col)
for c in list(bpy.data.collections):
    if c.name in src: c.hide_render = True
NAMES = ['Golden Dragon', 'Bella Nails', 'Pizza Factory', 'Sierra Cleaners', 'Taqueria Jalisco', 'Mountain Mike\'s', 'Foothill Vapes', 'Donut Shop', 'H&R Tax', 'Pet Grooming', 'Subs & Co', 'Ace Liquor', 'Thai Basil', 'Insurance']
import subprocess, json as _json
NDIR = os.path.join(ROOT, 'models', 'trackside', 'src', 'shopkit_gen', 'names'); os.makedirs(NDIR, exist_ok=True)
subprocess.run(['/usr/local/bin/python3', '-c', '''
import sys, json
from PIL import Image, ImageDraw, ImageFont
names, out = json.loads(sys.argv[1]), sys.argv[2]
cols = ["#a8241c", "#1c4f8a", "#2a6a3a", "#7a2a6a", "#c07018", "#1e1e1e", "#6a4a2a", "#18707a"]
f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 44)
for i, n in enumerate(names):
    im = Image.new("RGB", (512, 96), (238, 234, 224)); d = ImageDraw.Draw(im)
    t = n.upper(); b = d.textbbox((0, 0), t, font=f); w = b[2] - b[0]
    tim = Image.new("RGBA", (w + 8, 70), (0, 0, 0, 0)); ImageDraw.Draw(tim).text((4 - b[0], 35 - (b[1] + b[3]) / 2), t, font=f, fill=cols[i % len(cols)])
    if w > 470: tim = tim.resize((470, 70))
    im.paste(tim, ((512 - tim.width) // 2, 13), tim); im.save(out + "/n%02d.png" % i)
''', _json.dumps(NAMES), NDIR], check=True)
NAME_MATS = []
for i, n in enumerate(NAMES):
    m = bpy.data.materials.new('sign ' + n); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(NDIR, 'n%02d.png' % i)); t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], p.inputs['Base Color']); nt.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 0.35
    NAME_MATS.append(m)
ni = [0]
def put(pid, x, y=0.0, z=0.0, rot=0.0):
    me = src[pid].data
    if any(m and m.name == 'shop_SignFace' for m in me.materials): # (its own copy, a tenant's name on its sign / the pylon's panels)
        me = me.copy(); slot = [i for i, m in enumerate(me.materials) if m and m.name == 'shop_SignFace'][0]
        polys = [p for p in me.polygons if p.material_index == slot]
        for k, poly in enumerate(polys):
            me.materials.append(NAME_MATS[ni[0] % len(NAME_MATS)]); ni[0] += 1; poly.material_index = len(me.materials) - 1
    # (the kit piece's own frame kept: joining its parts left the mesh relative to its first part, 2.7 m up the wall)
    o = bpy.data.objects.new(pid, me); col.objects.link(o)
    o.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z') @ src[pid].matrix_world; return o
def body(x0, x1, depth, H, y0=0.0):
    # the building behind the fronts: block walls, a gravel roof (plain boxes: the game's own builder draws these)
    me = bpy.data.meshes.new('body'); hw = (x1 - x0) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, y0 + 0.3 + depth / 2, H / 2 - 0.05)); b = bpy.context.active_object
    b.scale = (x1 - x0, depth, H - 0.1); b.name = 'body'
    m = bpy.data.materials.get('shop_Stucco'); b.data.materials.append(m)
    for o in list(b.users_collection): o.objects.unlink(b)
    col.objects.link(b); return b

# ---- center 1: mixed tenants, towers at the ends, a walkway along the middle, units on the roof, the pylon, the bins
row = ['sm_unit_a', 'sm_unit_awn_red', 'sm_unit_c', 'sm_unit_a', 'sm_unit_awn_green', 'sm_unit_awn_tan', 'sm_unit_c']
x = 0.0
put('sm_endtower', x); x += 6
for i, pid in enumerate(row):
    walk = 2 <= i <= 4                      # (under a walkway a plain front: awnings and tile only where it's open)
    put('sm_unit_a' if walk else pid, x)
    if walk: put('sm_walkway', x)
    x += 6
put('sm_endtower', x)
body(-3, x + 3, 22, 5.4)
for k, hx in enumerate((6, 16, 27, 38)): put('rt_hvac', hx, 9 + (k % 2) * 4, 5.35, 0.3 * k)
for hx in (10, 22, 33): put('rt_vent', hx, 16, 5.35)
put('sm_pylon', -9, -16, 0, 0.2)
put('sm_dumpster', x + 7, 14, 0, -math.pi / 2)
X1 = x
# ---- center 2: Spanish, all under tile, the walkway the whole length
x = 0.0; Y2 = 60
for i in range(6):
    put('sm_unit_c' if i in (0, 5) else 'sm_unit_a', x, Y2)
    if 0 < i < 5: put('sm_walkway', x, Y2)
    x += 6
body(-3, x - 3, 18, 5.4, Y2)
for hx in (4, 18, 28): put('rt_hvac', hx, Y2 + 10, 5.35)
put('sm_pylon', x + 4, Y2 - 12, 0, -0.3)

# a ground and a parking lot in front, a sun, the sky
bpy.ops.mesh.primitive_plane_add(size=1, location=(25, 20, -0.02)); g = bpy.context.active_object; g.scale = (220, 220, 1); g.name = 'GROUND'
gm = bpy.data.materials.new('ground'); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.28, 0.12, 1); g.data.materials.append(gm)
for o in list(g.users_collection): o.objects.unlink(g)
col.objects.link(g)
bpy.ops.mesh.primitive_plane_add(size=1, location=(22, -14, -0.01)); lot = bpy.context.active_object; lot.scale = (70, 22, 1); lot.name = 'LOT'
lm = bpy.data.materials.new('asphalt'); lm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.08, 0.085, 1); lot.data.materials.append(lm)
for o in list(lot.users_collection): o.objects.unlink(lot)
col.objects.link(lot)
sun = bpy.data.objects.new('SUN', bpy.data.lights.new('SUN', 'SUN')); col.objects.link(sun); sun.data.energy = 3.4; sun.rotation_euler = (math.radians(52), 0, math.radians(-30))
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.7, 0.86, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
cam = bpy.data.objects.new('CAM', bpy.data.cameras.new('CAM')); col.objects.link(cam); sc.camera = cam
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1280, 640
def shot(name, loc, at, lens=28):
    cam.location = loc; cam.data.lens = lens; cam.rotation_euler = (Vector(at) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
shot('wide', (X1 / 2 - 10, -55, 22), (X1 / 2, 0, 3))
shot('street', (20, -24, 1.7), (20, 0, 3.2), 26)
shot('walk', (30, -1.6, 1.7), (12, -1.6, 2.6), 24)
shot('spanish', (16, Y2 - 30, 6), (16, Y2, 3), 30)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'trackside', 'shopkit_strip.blend'))
print('saved strip centers ->', OUT)
