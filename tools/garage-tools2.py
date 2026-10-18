# The lift and engine hoist, made properly (the home garage's station_tools2: Tools level 2, see docs/GARAGE-KIT.md
# and .claude/skills/garage-station). A two-post lift you could put a car on: channel-section columns on anchored base
# plates, the carriages and four telescoping swing arms with screw pads, the top beam with its overhead shut-off bar,
# the equaliser cables and the hydraulic line, the power unit (motor, pump, reservoir, buttons, lowering handle) on
# one column, the lock racks; a folding engine crane on castors (legs, mast, telescoping boom with its capacity
# sticker, the ram and its hand pump, chain, hook and load leveller); a transmission jack, two axle stands, an oil
# drain caddy, a creeper, a parts washer with its lid up, a work lamp on its hook. In use: an inline four hanging off
# the crane on the leveller, the car's wheels leant on the posts, the creeper rolled out, the lamp lit. AO is baked
# into the vertex colours.
# It stands in a bay, not against a wall: its origin is the middle of the bay, the car's nose down -Y, the posts
# either side at x = +-1.62 (a car fits between them). Same hooks and keys as the old one (tools/garage-stations.py):
# STAND_lift, STAND_any, BUSY_tools2_ / IDLE_tools2_, at the shell's SLOT_tools2 (BAY3 in tools/garage-unit.py).
#   Blender --background --python tools/garage-tools2.py -- [--out models/garage/station_tools2.glb] [--blend]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_tools2.glb')
LIVE = not bpy.app.background

if LIVE:   # (in your Blender: a scene of its own)
    sc = bpy.data.scenes.get('Lift') or bpy.data.scenes.new('Lift')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=7731)
if not os.path.exists(os.path.join(ART, 'tools2_rim.png')): subprocess.run(['python3', os.path.join(HERE, 'garage-signs-tools2.py')], check=True)
if not os.path.exists(os.path.join(ART, 'sign_lift.png')): subprocess.run(['python3', os.path.join(HERE, 'garage-signs.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()

# ---------------- helpers this station needs (garagelib doesn't have them) ----------------
def place(objs, M):
    # built at the origin, then put where it goes: M baked into each one's mesh (so a part made once can stand, lean
    # or hang anywhere, with its UVs and everything)
    for o in objs:
        o.data.transform(M @ o.matrix_basis); o.matrix_basis = Matrix.Identity(4)
    return objs

def built_since(n): return BUILT[n:]

def chain(name, coll, p0, p1, mat, pitch=0.034):
    # a chain from p0 to p1: oval links, each turned 90 degrees to the last, joined into one
    d = Vector(p1) - Vector(p0); L = d.length; n = max(2, int(L / pitch))
    parts = []
    for i in range(n):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.0045, major_segments=6, minor_segments=3,
                                         location=(0, 0, -(i + 0.5) * L / n), rotation=(D90, 0, D90 * (i % 2)))
        t = bpy.context.active_object; t.scale = (1.0, 1.0, 1.55); parts.append(t)
    bpy.ops.object.select_all(action='DESELECT')
    for t in parts: t.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.active_object
    o.name = name; o.data.name = name; link(o, coll); o.data.materials.clear(); o.data.materials.append(mat)
    q = Vector((0, 0, -1)).rotation_difference(d.normalized())
    place([o], Matrix.Translation(Vector(p0)) @ q.to_matrix().to_4x4())
    return mk(o)

def hook(name, coll, top, mat):
    # a crane hook: the eye, the shank, the bill
    p = Vector(top)
    a = sweep(name, coll, [p, p + Vector((0, 0, -0.06)), p + Vector((0.025, 0, -0.11)), p + Vector((0.055, 0, -0.085)), p + Vector((0.05, 0, -0.06))], 0.011, mat, segs=6, per_m=40)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.018, minor_radius=0.005, major_segments=8, minor_segments=3, location=p + Vector((0, 0, 0.012)), rotation=(D90, 0, 0))
    e = bpy.context.active_object; e.name = name + '_Eye'; link(e, coll); e.data.materials.append(mat); mk(e)
    return [a, e]

def castor(name, coll, loc, r, mat_w, mat_f, axis_x=True):
    # a castor: the wheel on the floor, its fork up to what it carries
    x, y, z = loc
    w = lathe(name + '_Wheel', coll, [(0, -0.012), (r, -0.012), (r, 0.012), (0, 0.012)], (x, y, r), mat_w, segs=8, rot=(0, D90, 0) if axis_x else (D90, 0, 0))
    f = bx(name + '_Fork', coll, (0.03, 0.03, max(0.02, z - r)), (x, y, r + max(0.02, z - r) / 2), mat_f)
    return [w, f]

def wheel(name, coll, M):
    # a road wheel off a car: the tyre (tread round it), the alloy's barrel and its five-spoke face; built with its axle
    # along Z at the origin, then M
    n0 = len(BUILT)
    lathe(name + '_Tyre', coll, [(0.2, -0.1), (0.272, -0.106), (0.298, -0.09), (0.306, -0.05), (0.306, 0.05), (0.298, 0.09), (0.272, 0.106), (0.2, 0.1)], (0, 0, 0), tyre, segs=16, cap0=False, cap1=False)
    lathe(name + '_Barrel', coll, [(0.2, -0.094), (0.19, -0.08), (0.19, 0.08), (0.2, 0.094)], (0, 0, 0), alloy, segs=16, cap0=False, cap1=False)
    me = bpy.data.meshes.new(name + '_Face'); r = 0.2
    me.from_pydata([(-r, -r, -0.09), (r, -r, -0.09), (r, r, -0.09), (-r, r, -0.09)], [], [(3, 2, 1, 0)])
    uv = me.uv_layers.new()
    for li, (u, v) in zip(me.polygons[0].loop_indices, ((0, 1), (1, 1), (1, 0), (0, 0))): uv.data[li].uv = (u, v)
    _f = bpy.data.objects.new(name + '_Face', me); coll.objects.link(_f); me.materials.append(rimface); mk(_f)
    return place(built_since(n0), M)

def inline4(name, coll, M):
    # a car's inline four out of its bay, crank along Y, its middle at the origin: block and sump, head, red cam cover,
    # intake runners to the plenum and throttle body, a rusty cast exhaust manifold, the timing cover, pulleys and belt,
    # alternator, flywheel, oil filter, the two lifting eyes the chains go to
    n0 = len(BUILT); E = lambda x, y, z: Vector((x, y, z))
    bbox(name + 'Sump', coll, (0.3, 0.46, 0.14), E(0, 0.01, -0.24), cast, bev=0.02)
    bbox(name + 'Block', coll, (0.34, 0.52, 0.3), E(0, 0, -0.02), cast, bev=0.015)
    for s in (-1, 1):
        for i in range(3): bx(f'{name}Rib_{s:+d}_{i}', coll, (0.012, 0.025, 0.24), E(s * 0.174, -0.16 + i * 0.16, -0.03), cast)
    bbox(name + 'Head', coll, (0.32, 0.52, 0.12), E(0, 0, 0.19), alloy, bev=0.012)
    bbox(name + 'Cover', coll, (0.25, 0.47, 0.07), E(0, 0, 0.285), crinkle, bev=0.02)
    for i in range(4): bx(f'{name}CoverRib_{i}', coll, (0.17, 0.012, 0.012), E(0, -0.15 + i * 0.1, 0.325), alloy)
    lathe(name + 'OilCap', coll, [(0, 0), (0.025, 0), (0.025, 0.02), (0, 0.022)], E(0.06, -0.2, 0.318), black, segs=8)
    for i in range(4):   # (the plug leads, over to the coil pack at the back)
        y = -0.18 + i * 0.12
        sweep(f'{name}Lead_{i}', coll, [E(0.0, y, 0.33), E(0.05, y + 0.03, 0.37), E(0.11, 0.2, 0.33), E(0.13, 0.27, 0.27)], 0.006, black, segs=4, per_m=20)
    bbox(name + 'Coil', coll, (0.06, 0.07, 0.08), E(0.13, 0.27, 0.24), black, bev=0.008)
    # intake on +X: four runners up and out to the plenum, its throttle body at the back
    bbox(name + 'Plenum', coll, (0.08, 0.42, 0.1), E(0.27, 0, 0.26), alloy, bev=0.015)
    for i in range(4):
        y = -0.18 + i * 0.12
        sweep(f'{name}Runner_{i}', coll, [E(0.16, y, 0.18), E(0.2, y, 0.17), E(0.245, y * 0.95, 0.21)], 0.022, alloy, segs=6, per_m=30)
    lathe(name + 'Throttle', coll, [(0.04, 0), (0.042, 0.05), (0.035, 0.07)], E(0.27, 0.21, 0.26), alloy, segs=10, rot=(-D90, 0, 0), cap1=False)
    # exhaust on -X: four cast runners down into the collector
    for i in range(4):
        y = -0.18 + i * 0.12
        sweep(f'{name}Exh_{i}', coll, [E(-0.16, y, 0.17), E(-0.22, y, 0.14), E(-0.24, y * 0.5 + 0.02, 0.02), E(-0.235, 0.03, -0.09)], 0.022, rusty, segs=6, per_m=24)
    lathe(name + 'ExhOut', coll, [(0.045, 0), (0.04, -0.08), (0.042, -0.1), (0.055, -0.1), (0.055, -0.115), (0.03, -0.115)], E(-0.235, 0.03, -0.08), rusty, segs=10, cap0=False)
    # the front (-Y): timing cover, crank pulley, the alternator and the belt round them
    bbox(name + 'TimingCover', coll, (0.28, 0.04, 0.38), E(0, -0.28, 0.06), black, bev=0.02)
    lathe(name + 'CrankPulley', coll, [(0, 0), (0.07, 0), (0.06, 0.01), (0.07, 0.02), (0, 0.022)], E(0, -0.3, -0.13), steel, segs=12, rot=(D90, 0, 0))
    cy(name + 'Alternator', coll, 0.055, 0.12, E(0.19, -0.2, 0.0), alloy, rot=(D90, 0, 0), verts=12)
    lathe(name + 'AltPulley', coll, [(0, 0), (0.032, 0), (0.026, 0.01), (0.032, 0.02), (0, 0.022)], E(0.19, -0.27, 0.0), steel, segs=10, rot=(D90, 0, 0))
    sweep(name + 'Belt', coll, [E(0.0, -0.315, -0.2), E(0.07, -0.315, -0.13), E(0.18, -0.315, 0.035), E(0.215, -0.315, -0.01), E(0.12, -0.315, -0.12), E(-0.06, -0.315, -0.17)], 0.006, black, segs=4, per_m=40, closed=True, caps=False)
    # the back (+Y): the flywheel and its ring gear
    lathe(name + 'Flywheel', coll, [(0, 0), (0.15, 0), (0.15, 0.03), (0, 0.03)], E(0, 0.26, -0.06), steel, segs=16, rot=(-D90, 0, 0))
    lathe(name + 'RingGear', coll, [(0.155, 0), (0.162, 0), (0.162, 0.018), (0.155, 0.018)], E(0, 0.265, -0.06), alloy, segs=16, rot=(-D90, 0, 0), cap0=False, cap1=False)
    lathe(name + 'OilFilter', coll, [(0, 0), (0.045, 0), (0.048, 0.01), (0.048, 0.1), (0.04, 0.11), (0, 0.11)], E(-0.17, -0.06, -0.15), anod_b, segs=10, rot=(0, -D90, 0))
    rd(name + 'Dipstick', coll, E(-0.14, 0.1, -0.05), E(-0.2, 0.12, 0.3), 0.005, steel, verts=4)
    lathe(name + 'DipLoop', coll, [(0.014, -0.004), (0.02, 0), (0.014, 0.004)], E(-0.2, 0.12, 0.31), yellow, segs=8, rot=(0, D90, 0), cap0=False, cap1=False)
    for y in (-0.2, 0.22): bbox(f'{name}Eye_{y:+.2f}', coll, (0.02, 0.06, 0.07), E(0, y, 0.34), steel, bev=0.008)
    return place(built_since(n0), M)

def creeper(name, coll, M):
    # a mechanic's creeper: a padded board on six castors, the head rest; built flat at the origin, then M
    n0 = len(BUILT)
    bbox(name + '_Board', coll, (0.42, 1.0, 0.035), (0, 0, 0.11), creepm, bev=0.012)
    bbox(name + '_Pad', coll, (0.36, 0.8, 0.025), (0, 0.04, 0.14), black, bev=0.01)
    bbox(name + '_Head', coll, (0.28, 0.16, 0.05), (0, -0.4, 0.155), black, bev=0.015)
    for x in (-0.17, 0.17):
        for y in (-0.42, 0.0, 0.42): castor(f'{name}_Castor_{x:+.2f}_{y:+.2f}', coll, (x, y, 0.093), 0.03, rubber, steel)
    return place(built_since(n0), M)

def worklamp(name, coll, M, on):
    # an inspection lamp: rubber handle, the wire cage round the bulb, the hook it hangs by
    n0 = len(BUILT)
    lathe(name + '_Handle', coll, [(0.0, 0.0), (0.022, 0.0), (0.024, 0.14), (0.03, 0.15), (0.0, 0.15)], (0, 0, -0.15), black, segs=8)
    lathe(name + '_Bulb', coll, [(0.0, 0.0), (0.026, 0.01), (0.03, 0.05), (0.0, 0.085)], (0, 0, -0.235), bulb_on if on else bulb_off, segs=8)
    for i in range(4):
        a = i / 4 * math.tau
        rd(f'{name}_Cage_{i}', coll, (math.cos(a) * 0.045, math.sin(a) * 0.045, -0.155), (math.cos(a) * 0.04, math.sin(a) * 0.04, -0.25), 0.003, steel, verts=4)
    lathe(name + '_Ring', coll, [(0.046, -0.152), (0.046, -0.16)], (0, 0, 0), steel, segs=10, cap0=False, cap1=False)
    rd(name + '_Hook', coll, (0, 0, 0.0), (0, 0, 0.05), 0.004, steel, verts=4)
    return place(built_since(n0), M)

def axle_stand(name, coll, x, y):
    # a ratchet axle stand: four legs to the tube, the toothed post, the saddle
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        rd(f'{name}_Leg_{i}', coll, (x + sx * 0.13, y + sy * 0.13, 0.01), (x + sx * 0.035, y + sy * 0.035, 0.32), 0.012, red, verts=6)
        bx(f'{name}_Foot_{i}', coll, (0.05, 0.05, 0.012), (x + sx * 0.13, y + sy * 0.13, 0.006), red)
    lathe(name + '_Tube', coll, [(0.04, 0.1), (0.04, 0.34)], (x, y, 0), red, segs=8, cap0=False)
    bbox(name + '_Post', coll, (0.035, 0.035, 0.26), (x, y, 0.42), ratchet, bev=0.004)
    lathe(name + '_Pawl', coll, [(0.0, 0.0), (0.03, 0.0), (0.03, 0.02), (0.0, 0.02)], (x + 0.045, y, 0.3), steel, segs=6, rot=(0, D90, 0))
    for s in (-1, 1): bx(f'{name}_Saddle_{s:+d}', coll, (0.07, 0.016, 0.045), (x, y + s * 0.022, 0.565), steel, rot=(s * 0.5, 0, 0))
    bx(name + '_SaddleBase', coll, (0.07, 0.06, 0.012), (x, y, 0.548), steel)

# ---------------- materials ----------------
liftred = grimy_tile('Lf_Red', 'painted_metal.png', dirt=0.4, rust=0.2, wear_light=0.25, tint=(0.6, 0.09, 0.07))
red = grimy_tile('Lf_Red2', 'painted_metal.png', dirt=0.45, rust=0.3, wear_light=0.2, tint=(0.66, 0.1, 0.06))
steel = grimy_tile('Lf_Steel', 'dark_industrial_metal.png', dirt=0.35, rust=0.35)
yellow = grimy_tile('Lf_Yellow', 'painted_metal.png', dirt=0.45, rust=0.2, wear_light=0.25, tint=(0.84, 0.64, 0.06))
grey = grimy_tile('Lf_Grey', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.44, 0.46, 0.47))
dark = grimy_tile('Lf_Dark', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.14, 0.15, 0.16))
cast = grimy_tile('Lf_Cast', 'scratched_metal.png', dirt=0.5, rust=0.25, tint=(0.4, 0.39, 0.37))
alloy = grimy_tile('Lf_Alloy', 'galvanized_metal.png', dirt=0.25)
rusty = grimy_tile('Lf_Rust', 'heavily_rusted_metal.png', dirt=0.3)
rubber = grimy_tile('Lf_Rubber', 'rubber.png', dirt=0.2)
hazard = grimy_tile('Lf_Hazard', 'hazard_stripes_01.png', dirt=0.55, wear_light=0.3)
grate = grimy_tile('Lf_Grate', 'metal_grating.png', dirt=0.5, rust=0.3)
plate = grimy_tile('Lf_Plate', 'metal_plate_01.png', dirt=0.55, rust=0.3)
black = solid_mat('Lf_Black', (0.03, 0.03, 0.035), 0.7)
anod_b = solid_mat('Lf_AnodBlue', (0.06, 0.16, 0.55), 0.35)
reservoir = solid_mat('Lf_Reservoir', (0.72, 0.68, 0.55), 0.45)
oil = solid_mat('Lf_OilStain', (0.018, 0.016, 0.012), 0.2)
bulb_on = mat_img('Lf_BulbOn', None, 0.4, emit=((1.0, 0.9, 0.7), 10.0))
bulb_off = solid_mat('Lf_BulbOff', (0.5, 0.48, 0.42), 0.3)
creepm = grimy_tile('Lf_Creeper', 'painted_metal.png', dirt=0.5, rust=0.1, tint=(0.08, 0.2, 0.42))
# red crinkle paint for the cam cover
n = 128; g = vnoise(n, n, 2, wrap=True) * 0.6 + fbm(n, n, (16, 4), wrap=True) * 0.4
crinkle = mat_img('Lf_Crinkle', px_tex('Lf_Crinkle', np.stack([0.55 + 0.25 * g, 0.05 + 0.05 * g, 0.04 + 0.04 * g], -1)), 0.6)
# tyre: rubber with tread blocks across the crown (v runs over the profile: the tread's the middle of it)
h, w = 64, 128; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
crown = (yy > h * 0.33) & (yy < h * 0.67); groove = ((xx % 8) < 2) | (np.abs(yy - h * 0.5) < 1.2) | (((xx + (yy // 6) * 3) % 16) < 1.5)
col = np.full((h, w, 3), 0.085, np.float32) * (1 - 0.55 * (crown & groove))[..., None]
col = grime(col, fbm(h, w, (16, 4)) * 0.18, (0.16, 0.14, 0.11))
tyre = mat_img('Lf_Tyre', px_tex('Lf_Tyre', col), 0.85)
# the ratchet post's teeth (UVs are 2 m a tile: a tooth every 12 mm)
h, w = 64, 64; yy, _ = np.mgrid[0:h, 0:w]; col = np.full((h, w, 3), 0.42, np.float32) * (1 - 0.6 * ((yy % 2) == 0))[..., None]
ratchet = mat_img('Lf_Ratchet', px_tex('Lf_Ratchet', grime(col, fbm(h, w, (8, 2)) * 0.3)), 0.5)
# the lock rack inside each column: a notch every 10 cm (on the 2 m tile: every 3.2 px of 64)
h, w = 64, 64; yy, _ = np.mgrid[0:h, 0:w]; col = np.full((h, w, 3), 0.3, np.float32) * (1 - 0.7 * ((yy % 4) == 0))[..., None]
lockrack = mat_img('Lf_LockRack', px_tex('Lf_LockRack', grime(col, fbm(h, w, (8, 2)) * 0.3)), 0.6)
# the alloy wheel's face: the art's alpha cuts it round (glTF MASK)
rim_im = bpy.data.images.load(A('tools2_rim'))
rimface = mat_img('Lf_RimFace', rim_im, 0.4)
_nt = rimface.node_tree; _t = [n for n in _nt.nodes if n.type == 'TEX_IMAGE'][0]; _g = _nt.nodes.new('ShaderNodeMath'); _g.operation = 'GREATER_THAN'; _g.inputs[1].default_value = 0.5
_nt.links.new(_t.outputs['Alpha'], _g.inputs[0]); _nt.links.new(_g.outputs[0], _nt.nodes['Principled BSDF'].inputs['Alpha'])
# the lamp's cage and the shaft guard: welded wire you see through
h, w = 32, 32; yy, xx = np.mgrid[0:h, 0:w]; wire = ((xx % 8 < 1) | (yy % 8 < 1)).astype(np.float32)
cage = cutout_mat('Lf_Cage', np.full((h, w, 3), 0.45, np.float32), wire)
def print_(name, png, d=0.4): return art_mat(name, A(png), dirt=d)

# ---------------- props from the packs ----------------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'pitprops.glb'))
for o in [o for o in bpy.data.objects if o not in before]:
    if o.type == 'MESH': o.rotation_mode = 'XYZ'; link(o, G.lib_collection()); o.hide_set(True); LIB[o.name] = o; o.name = 'LIB_' + o.name
    else: bpy.data.objects.remove(o, do_unlink=True)
IND = os.path.join(SRC, 'psx_industrial_pack.glb'); lib('jerrycan', IND, 'Jerrycan_M', height=0.45)
S_ = lambda n: os.path.join(ST, n)
lib('can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12); lib('coffee_cup', S_('trash_and_debris/scene.gltf'), 'Coffee_Cup_WithLid', height=0.13)

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
lf = collection('station_tools2', stations); lf.instance_offset = (0, 0, 0)
P = lambda x, y, z=0.0: Vector((x, y, z))

# ================= the lift =================
LX, CH = 1.62, 3.6   # (the posts' middles either side of the bay; their height)
for s in (-1, 1):
    X = s * LX; o_ = -s   # (o_: towards the car)
    bx(f'Lift_Base_{s:+d}', lf, (0.6, 0.72, 0.022), P(X, 0.0, 0.011), plate)
    for bxx in (-0.22, 0.22):
        for byy in (-0.28, 0.28): cy(f'Lift_Anchor_{s:+d}_{bxx:+.2f}_{byy:+.2f}', lf, 0.018, 0.04, P(X + bxx, byy, 0.04), steel, verts=6)
    # the column: a channel open to the car (back plate, two sides, the lips), its foot in hazard stripes
    bbox(f'Lift_ColBack_{s:+d}', lf, (0.02, 0.36, CH), P(X - o_ * 0.14, 0.0, CH / 2 + 0.022), liftred, bev=0.006)
    for t in (-1, 1):
        bbox(f'Lift_ColSide_{s:+d}_{t:+d}', lf, (0.3, 0.02, CH), P(X, t * 0.17, CH / 2 + 0.022), liftred, bev=0.006)
        bx(f'Lift_ColLip_{s:+d}_{t:+d}', lf, (0.02, 0.06, CH), P(X + o_ * 0.14, t * 0.15, CH / 2 + 0.022), liftred)
        bx(f'Lift_Kick_{s:+d}_{t:+d}', lf, (0.31, 0.022, 0.32), P(X, t * 0.181, 0.182), hazard)
    bbox(f'Lift_ColCap_{s:+d}', lf, (0.34, 0.4, 0.02), P(X, 0.0, CH + 0.032), liftred, bev=0.005)
    bx(f'Lift_LockRack_{s:+d}', lf, (0.035, 0.05, CH - 0.5), P(X - o_ * 0.1, 0.08, (CH - 0.5) / 2 + 0.3), lockrack)
    # the carriage (down: nothing on it), its four-sided slide, the lock pawl
    bbox(f'Lift_Carriage_{s:+d}', lf, (0.2, 0.28, 0.62), P(X + o_ * 0.05, 0.0, 0.47), steel, bev=0.012)
    bx(f'Lift_Pawl_{s:+d}', lf, (0.04, 0.05, 0.06), P(X - o_ * 0.06, 0.08, 0.82), yellow)
    # two telescoping swing arms each side, swung in under where the car goes, pads screwed down
    for t, a in ((-1, math.radians(38)), (1, math.radians(28))):
        piv = P(X + o_ * 0.2, t * 0.12, 0.16); d = Vector((o_ * math.cos(a), t * math.sin(a), 0))
        lathe(f'Lift_ArmPin_{s:+d}_{t:+d}', lf, [(0.05, -0.06), (0.05, 0.06)], piv, steel, segs=10)
        lathe(f'Lift_ArmGear_{s:+d}_{t:+d}', lf, [(0.0, 0.0), (0.075, 0.0), (0.075, 0.018), (0.0, 0.018)], piv + Vector((0, 0, 0.06)), steel, segs=10)
        mk(beam(f'Lift_Arm_{s:+d}_{t:+d}', lf, piv, piv + d * 0.72, 0.11, 0.07, steel))
        mk(beam(f'Lift_ArmExt_{s:+d}_{t:+d}', lf, piv + d * 0.6, piv + d * 1.02, 0.085, 0.05, alloy))
        pad = piv + d * 1.0
        lathe(f'Lift_PadScrew_{s:+d}_{t:+d}', lf, [(0.035, 0.0), (0.035, 0.07)], pad + Vector((0, 0, 0.02)), steel, segs=8)
        lathe(f'Lift_Pad_{s:+d}_{t:+d}', lf, [(0, 0), (0.07, 0), (0.07, 0.025), (0.06, 0.03), (0, 0.03)], pad + Vector((0, 0, 0.09)), rubber, segs=10)
# the top beam, its overhead shut-off bar (you raise a car into it, it stops), equaliser cables over the sheaves
bbox('Lift_TopBeam', lf, (2 * LX + 0.36, 0.18, 0.18), P(0, 0.0, CH + 0.132), liftred, bev=0.01)
for x in (-1.1, 1.1): rd(f'Lift_BarHanger_{x:+.1f}', lf, P(x, 0.0, CH + 0.045), P(x, 0.0, CH - 0.12), 0.008, steel, verts=4)
rd('Lift_ShutoffBar', lf, P(-1.25, 0.0, CH - 0.14), P(1.25, 0.0, CH - 0.14), 0.028, hazard, verts=10)
bbox('Lift_LimitSwitch', lf, (0.1, 0.08, 0.12), P(1.38, 0.0, CH - 0.019), grey, bev=0.01)   # (under the beam: the bar's end pushes its lever)
rd('Lift_LimitLever', lf, P(1.34, 0.0, CH - 0.08), P(1.25, 0.0, CH - 0.14), 0.007, steel, verts=4)
for s in (-1, 1): lathe(f'Lift_Sheave_{s:+d}', lf, [(0, -0.015), (0.07, -0.015), (0.06, 0.0), (0.07, 0.015), (0, 0.015)], P(s * (LX - 0.06), -0.12, CH + 0.08), steel, segs=12, rot=(D90, 0, 0))
for k, y in enumerate((-0.105, -0.125)):
    sweep(f'Lift_Cable_{k}', lf, [P(-LX + 0.06, y, 0.8), P(-LX + 0.06, y, CH + 0.02), P(-LX + 0.2, y, CH + 0.15), P(LX - 0.2, y, CH + 0.15), P(LX - 0.06, y, CH + 0.02), P(LX - 0.06, y, 0.8)], 0.005, steel, segs=4, per_m=3)
# the power unit on the left post's outside: bracket, pump block, motor, the oil reservoir under, the lowering handle
PX = -LX - 0.25
bx('Lift_PowerBracket', lf, (0.02, 0.28, 0.6), P(-LX - 0.16, 0.05, 1.15), steel)
bbox('Lift_Pump', lf, (0.16, 0.16, 0.12), P(PX, 0.05, 1.05), grey, bev=0.012)
lathe('Lift_Motor', lf, [(0.0, 0.0), (0.085, 0.0), (0.09, 0.02), (0.09, 0.05), (0.085, 0.06), (0.09, 0.07), (0.09, 0.1), (0.085, 0.11), (0.09, 0.12), (0.09, 0.15), (0.085, 0.16), (0.09, 0.17), (0.09, 0.25), (0.07, 0.28), (0.0, 0.29)], P(PX, 0.05, 1.11), blue_motor := grimy_tile('Lf_Motor', 'painted_metal.png', dirt=0.35, rust=0.1, tint=(0.18, 0.3, 0.52)), segs=12)
bbox('Lift_Reservoir', lf, (0.15, 0.18, 0.3), P(PX, 0.05, 0.84), reservoir, bev=0.015)
lathe('Lift_ResCap', lf, [(0, 0), (0.025, 0), (0.025, 0.02), (0, 0.02)], P(PX + 0.03, 0.12, 0.99), black, segs=8)
rd('Lift_LowerLever', lf, P(PX - 0.08, -0.02, 1.05), P(PX - 0.2, -0.1, 1.18), 0.008, steel, verts=6)
lathe('Lift_LowerKnob', lf, [(0, 0), (0.02, 0.01), (0.02, 0.04), (0, 0.05)], P(PX - 0.2, -0.1, 1.17), red, segs=8)
bbox('Lift_ControlBox', lf, (0.13, 0.06, 0.19), P(-LX, -0.21, 1.2), dark, bev=0.01)
cd('Lift_Buttons', lf, 0.11, 0.165, P(-LX, -0.2405, 1.115), print_('Lf_Buttons', 'tools2_buttons', 0.3))
cd('Lift_Sign', lf, 0.3, 0.225, P(-LX, -0.1815, 1.42), print_('Lf_SignLift', 'sign_lift', 0.45))
cd('Lift_Plate', lf, 0.22, 0.1375, P(LX, -0.1815, 1.35), print_('Lf_Plate', 'tools2_plate', 0.3))
rd('Lift_LockRelease', lf, P(-LX + 0.15, -0.185, 1.65), P(-LX + 0.15, -0.3, 1.58), 0.01, steel, verts=6)
lathe('Lift_LockKnob', lf, [(0, 0), (0.018, 0.0), (0.018, 0.03), (0, 0.035)], P(-LX + 0.15, -0.31, 1.555), black, segs=8, rot=(D90, 0, 0))
# the hydraulic line: pump, up the left post, along the beam's back, down the right post to its cylinder
sweep('Lift_Hydraulic', lf, [P(PX + 0.05, 0.13, 1.0), P(-LX - 0.16, 0.2, 1.2), P(-LX - 0.16, 0.2, CH - 0.1), P(-LX + 0.1, 0.1, CH + 0.13), P(LX - 0.1, 0.1, CH + 0.13), P(LX + 0.16, 0.2, CH - 0.1), P(LX + 0.16, 0.2, 0.75), P(LX + 0.05, 0.12, 0.62)], 0.011, black, segs=5, per_m=4)
for z in (1.8, 2.6, 3.3):
    for s in (-1, 1): bx(f'Lift_HoseClip_{s:+d}_{z}', lf, (0.03, 0.04, 0.03), P(s * (LX + 0.16), 0.19, z), steel)
sweep('Lift_PowerCable', lf, [P(PX, 0.12, 1.35), P(PX - 0.06, 0.22, 1.2), P(PX - 0.05, 0.3, 0.3), P(PX + 0.02, 0.45, 0.012), P(PX + 0.3, 0.9, 0.012), P(-1.4, 1.35, 0.012)], 0.009, black, segs=4, per_m=4)
# old oil on the floor: under the car, by the drain
import random as _rnd; _R = _rnd.Random(31)
for k, (x, y, r) in enumerate(((0.1, -0.85, 0.3), (-0.35, 0.55, 0.16), (1.05, -2.3, 0.22))):
    # a puddle: a flat ragged outline, not a disc
    pts = [(x + math.cos(a) * r * (0.7 + 0.45 * _R.random()), y + math.sin(a) * r * (0.6 + 0.5 * _R.random()), 0.003) for a in (i / 14 * math.tau for i in range(14))]
    me = bpy.data.meshes.new(f'Lift_Stain_{k}'); me.from_pydata(pts, [], [tuple(range(14))]); uv_world(me, Matrix.Identity(4), 0.5)
    so = bpy.data.objects.new(f'Lift_Stain_{k}', me); lf.objects.link(so); me.materials.append(oil); mk(so)

# ================= the engine crane (folded out, by the bay's front left) =================
CX, CY = -1.25, -2.35
MZ, TIP = 1.48, P(CX, CY - 0.6, 1.88)
for s in (-1, 1):
    mk(beam(f'Crane_Leg_{s:+d}', lf, P(CX + s * 0.3, CY + 0.42, 0.11), P(CX + s * 0.32, CY - 0.85, 0.11), 0.07, 0.07, yellow))
    castor(f'Crane_FrontCastor_{s:+d}', lf, (CX + s * 0.32, CY - 0.8, 0.075), 0.045, rubber, steel)
    castor(f'Crane_RearCastor_{s:+d}', lf, (CX + s * 0.3, CY + 0.42, 0.075), 0.045, rubber, steel)
mk(beam('Crane_Cross', lf, P(CX - 0.34, CY + 0.42, 0.13), P(CX + 0.34, CY + 0.42, 0.13), 0.08, 0.08, yellow))
bbox('Crane_Mast', lf, (0.09, 0.09, MZ - 0.17), P(CX, CY + 0.42, (MZ + 0.17) / 2), yellow, bev=0.01)
for s in (-1, 1): mk(beam(f'Crane_Gusset_{s:+d}', lf, P(CX, CY + 0.42, 0.45), P(CX + s * 0.25, CY + 0.42, 0.17), 0.012, 0.06, yellow))
mk(beam('Crane_Brace', lf, P(CX, CY + 0.42, 0.55), P(CX, CY + 0.05, 0.17), 0.05, 0.05, yellow))
lathe('Crane_Pivot', lf, [(0.03, -0.06), (0.03, 0.06)], P(CX, CY + 0.42, MZ), steel, segs=8, rot=(0, D90, 0))
mk(beam('Crane_Boom', lf, P(CX, CY + 0.46, MZ), P(CX, CY - 0.2, MZ + 0.26), 0.085, 0.085, yellow))
mk(beam('Crane_BoomExt', lf, P(CX, CY - 0.1, MZ + 0.22), TIP + Vector((0, 0, 0.03)), 0.065, 0.065, yellow))
cd('Crane_Sticker', lf, 0.3, 0.056, P(CX - 0.044, CY - 0.15, MZ + 0.13), print_('Lf_Crane', 'tools2_crane', 0.35), rotz=-D90, tilt=-0.38)
lathe('Crane_TipPin', lf, [(0.018, -0.05), (0.018, 0.05)], TIP, steel, segs=6, rot=(0, D90, 0))
# the ram: the black body on the mast, the bright rod up to the boom, the hand pump and its lever
RB, RT = P(CX, CY + 0.36, 0.32), P(CX, CY - 0.08, MZ + 0.18)
dv = (RT - RB); body_end = RB + dv * 0.58
rd('Crane_RamBody', lf, RB, body_end, 0.045, black, verts=10)
rd('Crane_RamRod', lf, body_end, RT, 0.02, alloy, verts=8)
bbox('Crane_PumpBlock', lf, (0.1, 0.09, 0.09), P(CX + 0.06, CY + 0.38, 0.3), steel, bev=0.01)
rd('Crane_PumpLever', lf, P(CX + 0.1, CY + 0.42, 0.32), P(CX + 0.14, CY + 0.78, 0.8), 0.013, steel, verts=6)
lathe('Crane_Grip', lf, [(0.018, 0.0), (0.02, 0.01), (0.02, 0.11), (0.018, 0.12)], P(CX + 0.14, CY + 0.78, 0.8), rubber, segs=8, rot=(-0.7, 0.0, 0.0))
lathe('Crane_ReleaseKnob', lf, [(0, 0), (0.02, 0), (0.02, 0.025), (0, 0.03)], P(CX - 0.05, CY + 0.38, 0.32), red, segs=8, rot=(0, -D90, 0))
# the chain and hook off the tip; in use, the load leveller under it and the engine on its two chains
HOOK = TIP + Vector((0, 0, -0.25))
chain('Crane_Chain', lf, TIP + Vector((0, 0, -0.02)), HOOK + Vector((0, 0, 0.03)), steel)
hook('Crane_Hook', lf, HOOK, steel)
LV = HOOK.z - 0.11
bbox('BUSY_tools2_Leveller', lf, (0.05, 0.52, 0.05), P(CX + 0.05, CY - 0.6, LV), black, bev=0.008)
rd('BUSY_tools2_LevCrank', lf, P(CX + 0.05, CY - 0.6 - 0.26, LV), P(CX + 0.05, CY - 0.6 - 0.36, LV), 0.008, steel, verts=6)
lathe('BUSY_tools2_LevKnob', lf, [(0, 0), (0.016, 0), (0.016, 0.05), (0, 0.05)], P(CX + 0.05, CY - 0.6 - 0.36, LV + 0.01), red, segs=8)
EZ = 0.8   # (the engine's crank, hanging)
for k, y in enumerate((-0.2, 0.22)):
    chain(f'BUSY_tools2_EngChain_{k}', lf, P(CX + 0.05, CY - 0.6 + y, LV - 0.03), P(CX, CY - 0.6 + y, EZ + 0.37), steel)
n_eng = len(BUILT)
inline4('BUSY_tools2_Eng_', lf, Matrix.Translation(P(CX, CY - 0.6, EZ)))

# ================= round the lift =================
# the transmission jack, under where the gearbox would be
JX, JY = 1.12, -1.45
for k, (a, b) in enumerate(((P(JX - 0.3, JY - 0.3, 0.09), P(JX + 0.3, JY + 0.3, 0.09)), (P(JX - 0.3, JY + 0.3, 0.09), P(JX + 0.3, JY - 0.3, 0.09)))):
    mk(beam(f'Jack_Base_{k}', lf, a, b, 0.06, 0.05, yellow))
for k, (x, y) in enumerate(((JX - 0.29, JY - 0.29), (JX + 0.29, JY + 0.29), (JX - 0.29, JY + 0.29), (JX + 0.29, JY - 0.29))): castor(f'Jack_Castor_{k}', lf, (x, y, 0.07), 0.04, rubber, steel)
lathe('Jack_Body', lf, [(0.0, 0.0), (0.075, 0.0), (0.075, 0.36), (0.06, 0.38), (0.0, 0.38)], P(JX, JY, 0.11), red, segs=10)
lathe('Jack_Ram', lf, [(0.035, 0.0), (0.035, 0.36)], P(JX, JY, 0.49), alloy, segs=8, cap0=False)
bbox('Jack_Saddle', lf, (0.34, 0.28, 0.04), P(JX, JY, 0.87), yellow, bev=0.01)
for sx in (-1, 1):
    for sy in (-1, 1): bx(f'Jack_Finger_{sx:+d}{sy:+d}', lf, (0.03, 0.03, 0.08), P(JX + sx * 0.15, JY + sy * 0.12, 0.92), yellow)
sweep('Jack_Strap', lf, [P(JX - 0.15, JY - 0.12, 0.95), P(JX, JY - 0.16, 1.0), P(JX + 0.15, JY - 0.12, 0.95)], 0.008, black, segs=4, per_m=20)
rd('Jack_Pedal', lf, P(JX - 0.05, JY - 0.07, 0.2), P(JX - 0.12, JY - 0.36, 0.14), 0.01, steel, verts=6)
bx('Jack_PedalPad', lf, (0.1, 0.06, 0.015), P(JX - 0.12, JY - 0.37, 0.135), black)
# axle stands, ready
axle_stand('Stand_A', lf, 2.02, -0.95); axle_stand('Stand_B', lf, 2.02, -1.4)
# the oil drain caddy: tank on castors, its telescoping post and the big funnel with the strainer
DX, DY = 1.08, -2.45
bbox('Drain_Frame', lf, (0.46, 0.46, 0.04), P(DX, DY, 0.11), steel, bev=0.008)
for k, (x, y) in enumerate(((DX - 0.2, DY - 0.2), (DX + 0.2, DY + 0.2), (DX - 0.2, DY + 0.2), (DX + 0.2, DY - 0.2))): castor(f'Drain_Castor_{k}', lf, (x, y, 0.09), 0.04, rubber, steel)
lathe('Drain_Tank', lf, [(0.0, 0.0), (0.21, 0.0), (0.22, 0.03), (0.22, 0.4), (0.19, 0.46), (0.05, 0.48), (0.0, 0.48)], P(DX, DY, 0.13), yellow, segs=14)
lathe('Drain_Post', lf, [(0.035, 0.0), (0.035, 0.32), (0.025, 0.32), (0.025, 0.58)], P(DX, DY, 0.6), alloy, segs=8, cap0=False)
lathe('Drain_Funnel', lf, [(0.03, 0.0), (0.12, 0.04), (0.29, 0.12), (0.3, 0.14)], P(DX, DY, 1.17), yellow, segs=14, cap0=False, cap1=False)
lathe('Drain_Screen', lf, [(0.0, 0.0), (0.26, 0.0)], P(DX, DY, 1.29), grate, segs=12, cap0=False)
rd('Drain_Handle', lf, P(DX - 0.22, DY + 0.1, 0.55), P(DX - 0.22, DY + 0.1, 0.95), 0.012, steel, verts=6)
sweep('Drain_Hose', lf, [P(DX + 0.18, DY - 0.1, 0.2), P(DX + 0.3, DY - 0.25, 0.1), P(DX + 0.22, DY - 0.4, 0.03), P(DX + 0.0, DY - 0.42, 0.03)], 0.016, black, segs=6, per_m=16)
# the parts washer: a red tank on legs, the lid up on its link, the sink grate, the pump hose and brush, the drum under
WX, WY = 1.86, 1.0
bbox('Washer_Tank', lf, (0.76, 0.5, 0.28), P(WX, WY, 0.86), red, bev=0.015)
bx('Washer_Grate', lf, (0.66, 0.4, 0.012), P(WX, WY, 0.985), grate)
for sx in (-1, 1):
    for sy in (-1, 1): rd(f'Washer_Leg_{sx:+d}{sy:+d}', lf, P(WX + sx * 0.34, WY + sy * 0.21, 0.0), P(WX + sx * 0.34, WY + sy * 0.21, 0.72), 0.014, red, verts=6)
th = -1.35; lid_c = P(WX, WY + 0.25 - 0.25 * math.cos(th), 1.0 - 0.25 * math.sin(th))
bbox('Washer_Lid', lf, (0.76, 0.5, 0.02), lid_c, red, rot=(th, 0, 0), bev=0.006)
rd('Washer_LidLink', lf, P(WX - 0.36, WY + 0.18, 1.0), P(WX - 0.36, WY + 0.2, 1.22), 0.005, steel, verts=4)
cd('Washer_Label', lf, 0.36, 0.135, P(WX, WY - 0.2515, 0.77), print_('Lf_Washer', 'tools2_washer', 0.35))
lathe('Washer_Drum', lf, [(0.0, 0.0), (0.16, 0.0), (0.165, 0.02), (0.165, 0.38), (0.15, 0.4), (0.0, 0.4)], P(WX + 0.12, WY + 0.02, 0.0), dark, segs=12)
sweep('Washer_PumpHose', lf, [P(WX + 0.12, WY + 0.02, 0.4), P(WX + 0.3, WY + 0.25, 0.6), P(WX + 0.3, WY + 0.22, 1.08), P(WX + 0.15, WY + 0.05, 1.12), P(WX + 0.05, WY - 0.02, 1.02)], 0.009, black, segs=5, per_m=14)
rd('Washer_Brush', lf, P(WX - 0.25, WY - 0.08, 1.0), P(WX - 0.05, WY + 0.08, 1.07), 0.01, wood_ := grimy_tile('Lf_Wood', 'wood.png', dirt=0.5), verts=6)
bx('Washer_Bristles', lf, (0.06, 0.04, 0.03), P(WX - 0.27, WY - 0.095, 0.99), black, rot=(0, 0, 0.67))
put('coffee_cup', lf, P(WX + 0.3, WY - 0.12, 1.0), 0.0)
# the work lamp on the right post, by the plate; lit when there's work on
lamp_M = Matrix.Translation(P(LX - 0.19, -0.22, 1.95))
for o in worklamp('BUSY_tools2_Lamp', lf, lamp_M, True): pass
for o in worklamp('IDLE_tools2_Lamp', lf, lamp_M, False): pass
bx('Lift_LampHook', lf, (0.02, 0.06, 0.02), P(LX - 0.19, -0.2, 2.0), steel)
sweep('Lift_LampCord', lf, [P(LX - 0.19, -0.22, 1.69), P(LX - 0.3, -0.35, 1.2), P(LX - 0.35, -0.5, 0.4), P(LX - 0.5, -0.65, 0.012), P(LX - 0.2, -0.95, 0.012)], 0.006, black, segs=4, per_m=6)
bulb('BUSY_tools2_Light_Lamp', lf, P(LX - 0.19, -0.34, 1.75), 30, (1.0, 0.86, 0.62))
# the creeper: rolled out by the jack in use; stood on end against the left post's back when not
creeper('BUSY_tools2_Creeper', lf, Matrix.Translation(P(0.35, -1.05, 0.0)) @ Matrix.Rotation(0.25, 4, 'Z'))
creeper('IDLE_tools2_Creeper', lf, Matrix.Translation(P(-LX, 0.21 + 0.22, 0.52)) @ Matrix.Rotation(-D90 + 0.1, 4, 'X'))
# the car's wheels, off and leant on the posts (in use)
for s in (-1, 1):
    for t in (-1, 1):
        M = Matrix.Translation(P(s * LX + s * 0.03, t * (0.19 + 0.13), 0.3)) @ Matrix.Rotation(-t * 0.16, 4, 'X') @ Matrix.Rotation(D90 * (1 if t < 0 else -1), 4, 'X')
        wheel(f'BUSY_tools2_Wheel_{s:+d}{t:+d}', lf, M)
put('jerrycan', lf, P(-LX - 0.42, 0.75, 0.0), 0.4); put('can', lf, P(1.45, -2.0, 0.0), 0.7)

# ================= where people stand =================
empty('STAND_lift', lf, P(-0.45, -2.5), rotz=-1.107, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='mechanic')   # (at the engine on the crane)
empty('STAND_any', lf, P(JX - 0.56, JY), rotz=D90, kind='SINGLE_ARROW', size=0.5, clip='kneel', role='any')           # (at the transmission jack)
empty('STAND_mechanic', lf, P(WX, WY - 0.62), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='mechanic')   # (at the parts washer)

# ================= AO (the station stands mid-bay: moved back off garagelib's wall at y = 0 while it bakes) =================
SHIFT = Matrix.Translation((0, -2.6, 0))
bpy.context.view_layer.update()   # (new objects' world matrices are stale till this: shifting them otherwise sends them home)
roots = [o for o in lf.all_objects if o.parent is None]
if '--noao' not in args:
    for o in roots: o.matrix_world = SHIFT @ o.matrix_world
    print('AO baked on', bake_ao(lf, skip=(rimface, cage)), 'objects')
    for o in roots: o.matrix_world = SHIFT.inverted() @ o.matrix_world
if not LIVE or '--export' in args: export_station(lf, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'tools2-start.blend'))
print('TOOLS2 objects', len(lf.all_objects), 'triangles', tris(lf))
