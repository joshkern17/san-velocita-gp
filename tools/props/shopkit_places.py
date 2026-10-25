# The shop kit's places side by side along a road, the way the commercial builder will set them (tools/props/shopkit.py
# -> models/trackside/shopkit.blend): a strip center (raised parapets, its walk's benches, planters, bins, a bike rack,
# newspaper boxes, an ice chest), a supermarket (entry, wall bays, cart corrals), a gas station (canopy, its store,
# the price sign, air), a church; each building its own stucco colour, hedges and shrub beds round them. Renders a
# drive-by row (low, from the road, as at speed), close-ups, and saves models/trackside/shopkit_places.blend.
#   Blender -b models/trackside/shopkit.blend --python tools/props/shopkit_places.py
import bpy, sys, os, math, json, subprocess
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, '.devtest', 'out', 'shopkit', 'places'); os.makedirs(OUT, exist_ok=True)
src = {o.name[:-4]: o for o in bpy.data.objects if o.name.endswith('_src')}
sc = bpy.data.scenes.new('PLACES')
if bpy.context.window: bpy.context.window.scene = sc
col = bpy.data.collections.new('places'); sc.collection.children.link(col)
for c in list(bpy.data.collections):
    if c.name in src: c.hide_render = True

# names on the signs
NAMES = ['Golden Dragon', 'Bella Nails', 'Pizza Factory', 'Sierra Cleaners', 'Taqueria Jalisco', 'Foothill Vapes', 'Donut Shop', 'Pet Grooming',
         'Subs & Co', 'Thai Basil', 'Insurance', 'Tax Service', 'FOOTHILL MARKET', 'QUIK FUEL', 'Grace Community Church']
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
    im.paste(tim, ((512 - tim.width) // 2, 13), tim); im.save(out + "/p%02d.png" % i)
''', json.dumps(NAMES), NDIR], check=True)
NM = {}
for i, n in enumerate(NAMES):
    m = bpy.data.materials.new('sign ' + n); nt = m.node_tree; p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(NDIR, 'p%02d.png' % i)); t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], p.inputs['Base Color']); nt.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 0.35
    NM[n] = m
# each building's stucco a colour of its own (the game tints it per building the same way)
TINTS = [(0.76, 0.68, 0.55), (0.86, 0.8, 0.68), (0.7, 0.6, 0.5), (0.8, 0.72, 0.62), (0.66, 0.66, 0.6), (0.84, 0.74, 0.58), (0.9, 0.88, 0.82)]
tint_mats = {}
def stucco_for(k):
    if k in tint_mats: return tint_mats[k]
    base = bpy.data.materials['shop_Stucco']; m = base.copy(); m.name = 'stucco %d' % k
    nt = m.node_tree; mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
    p = nt.nodes['Principled BSDF']; srcsock = p.inputs['Base Color'].links[0].from_socket
    nt.links.new(srcsock, mix.inputs['A']); r, g, b = TINTS[k % len(TINTS)]; mix.inputs['B'].default_value = (r / 0.76, g / 0.68, b / 0.55, 1); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    tint_mats[k] = m; return m
names_q = list(NAMES[:12])
def put(pid, x, y=0.0, z=0.0, rot=0.0, tint=None, name=None):
    me = src[pid].data
    has_sign = any(m and m.name == 'shop_SignFace' for m in me.materials)
    if has_sign or tint is not None:
        me = me.copy()
        if tint is not None:
            for i, m in enumerate(me.materials):
                if m and m.name.startswith('shop_Stucco') and m.name == 'shop_Stucco': me.materials[i] = stucco_for(tint)
        if has_sign:
            slot = [i for i, m in enumerate(me.materials) if m and m.name == 'shop_SignFace'][0]
            for poly in [p for p in me.polygons if p.material_index == slot]:
                n = name or (names_q.pop(0) if names_q else 'Shop'); me.materials.append(NM.get(n) or NM['Insurance']); poly.material_index = len(me.materials) - 1
    o = bpy.data.objects.new(pid, me); col.objects.link(o)
    o.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z') @ src[pid].matrix_world; return o
def body(x0, x1, y0, depth, H, tint):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, y0 + depth / 2, H / 2)); b = bpy.context.active_object; b.scale = (x1 - x0, depth, H)
    b.data.materials.append(stucco_for(tint)); [c.objects.unlink(b) for c in list(b.users_collection)]; col.objects.link(b)
    bpy.ops.mesh.primitive_plane_add(size=1, location=((x0 + x1) / 2, y0 + depth / 2, H + 0.01)); r = bpy.context.active_object; r.scale = (x1 - x0 - 0.4, depth - 0.4, 1)
    r.data.materials.append(bpy.data.materials.get('roofmat') or mk_roof()); [c.objects.unlink(r) for c in list(r.users_collection)]; col.objects.link(r)
def mk_roof():
    m = bpy.data.materials.new('roofmat'); m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.16, 0.17, 1); return m
def hedge_run(x0, x1, y, rot=0.0):
    x = x0
    while x < x1: put('sm_hedge', x + 1, y, 0, rot); x += 2

X = 0.0
# ---- the strip center: tower, mixed tenants with raised parapets, walkway, walk life, hedges along its front lot edge
x = X; put('sm_endtower', x, tint=0); x += 6
row = ['sm_unit_peak', 'sm_unit_awn_red', 'sm_unit_a', 'sm_unit_tower', 'sm_unit_a', 'sm_unit_awn_blue', 'sm_unit_c']
for i, pid in enumerate(row):
    walk = 2 <= i <= 4
    put('sm_unit_a' if walk and pid == 'sm_unit_awn_red' else pid, x, tint=0)
    if walk: put('sm_walkway', x, tint=0)
    x += 6
body(X - 3, x - 3, 0.3, 24, 5.3, 0)
for k, hx in enumerate((X + 8, X + 20, X + 33)): put('rt_hvac', hx, 10 + (k % 2) * 4, 5.3, 0.3 * k)
for (px, pid) in ((X + 13, 'sm_bench'), (X + 16, 'sm_trash'), (X + 19, 'sm_planter'), (X + 24, 'sm_bench'), (X + 28, 'sm_newsbox'), (X + 31, 'sm_bikerack')): put(pid, px, -2.0)
put('sm_icebox', X + 2.6, -1.2); put('sm_pylon', X - 4, -24, 0, 0.15); put('sm_shrubs', X - 4, -24.5)
hedge_run(X + 2, x - 6, -22); STRIP_X1 = x
# ---- the supermarket: bays, the entry, bays, carts in the lot, shrubs by the doors
X = STRIP_X1 + 18; x = X
for pid in ('sp_bay', 'sp_bay_glass'): put(pid, x + 4, tint=2); x += 8
put('sp_entry', x + 8, tint=2, name='FOOTHILL MARKET'); ENTRY = x + 8; x += 16
for pid in ('sp_bay_glass', 'sp_bay'): put(pid, x + 4, tint=2); x += 8
body(X, x, 0.4, 46, 7.6, 2)
for k, hx in enumerate((X + 6, X + 18, X + 30, X + 42)): put('rt_hvac', hx, 18 + (k % 2) * 8, 7.6, 0.2 * k)
put('sp_carts', ENTRY - 14, -14, 0, 0.0); put('sp_carts', ENTRY + 14, -14, 0, 0.0)
put('sm_shrubs', ENTRY - 10, -5); put('sm_shrubs', ENTRY + 10, -5)
hedge_run(X, x, -26); SUP_X1 = x
# ---- the gas station: canopy over the pumps, its store behind (a storefront unit + body), the price sign, air
X = SUP_X1 + 22
put('gs_canopy', X + 9, -12, 0, 0.0, name='QUIK FUEL')
for k, pid in enumerate(('sm_unit_a', 'sm_unit_a')): put(pid, X + 3 + k * 6, 6, tint=4, name='QUIK FUEL' if k == 0 else 'Subs & Co')
body(X, X + 12, 6.3, 12, 5.3, 4)
put('gs_price', X - 4, -24, 0, 0.2, name='QUIK FUEL'); put('sm_shrubs', X - 4, -25.5); put('gs_air', X + 16, 4)
put('sm_icebox', X + 13.4, 5.2); hedge_run(X + 14, X + 22, -24)
GAS_X1 = X + 24
# ---- the church on its lawn, hedge along the front, shrubs by the steps
X = GAS_X1 + 18
put('ch_church', X + 6, 2, 0, 0.0, name='Grace Community Church'); hedge_run(X - 4, X + 3, -6); hedge_run(X + 9, X + 16, -6)
put('sm_shrubs', X + 3.5, -3.5); put('sm_shrubs', X + 8.5, -3.5)
END = X + 20

# ground, lot, road, sun, sky, camera
def plane(name, loc, scale, rgb, z=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(loc[0], loc[1], z)); g = bpy.context.active_object; g.scale = (scale[0], scale[1], 1); g.name = name
    m = bpy.data.materials.new(name); m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1); g.data.materials.append(m)
    [c.objects.unlink(g) for c in list(g.users_collection)]; col.objects.link(g)
plane('GROUND', (END / 2, 0), (END + 200, 200), (0.2, 0.28, 0.12), -0.03)
plane('LOT', (END / 2, -12), (END + 10, 22), (0.09, 0.09, 0.095), -0.02)
plane('ROAD', (END / 2, -32), (END + 200, 12), (0.06, 0.06, 0.065), -0.01)
sun = bpy.data.objects.new('SUN', bpy.data.lights.new('SUN', 'SUN')); col.objects.link(sun); sun.data.energy = 3.4; sun.rotation_euler = (math.radians(52), 0, math.radians(-30))
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.7, 0.86, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
cam = bpy.data.objects.new('CAM', bpy.data.cameras.new('CAM')); col.objects.link(cam); sc.camera = cam
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1280, 560
def shot(name, loc, at, lens=28):
    cam.location = loc; cam.data.lens = lens; cam.rotation_euler = (Vector(at) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)
# (from the road at a driver's height, looking ahead along it: how they read in passing)
shot('drive_strip', (STRIP_X1 + 20, -34, 1.2), (STRIP_X1 - 40, -4, 4), 22)
shot('drive_super', (SUP_X1 + 25, -34, 1.2), (SUP_X1 - 50, -4, 5), 22)
shot('drive_gas_church', (END + 15, -34, 1.2), (GAS_X1 - 30, -4, 5), 22)
shot('overview', (END / 2, -110, 55), (END / 2, 0, 0), 30)
for nm, x in (('strip', (STRIP_X1) / 2), ('super', ENTRY), ('gas', GAS_X1 - 14), ('church', GAS_X1 + 24)):
    shot('front_' + nm, (x - 10, -40, 8), (x, 0, 4), 32)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'trackside', 'shopkit_places.blend'))
print('saved places ->', OUT)
