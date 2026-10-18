# The engine dyno, made properly (the home garage's station_dyno, see docs/GARAGE-KIT.md): a test cell, not a bench.
# A V8 on a steel bed with its trumpets and heat-blued headers, the driveshaft in its guard, an eddy-current absorber
# on trunnions with its torque arm and load cell, a cooling module, the fuel cart, extraction ducting up to the window,
# acoustic panels and tread plate, a mesh screen with the way in, the beacon and the ENGINE RUNNING sign, and the
# operator's console: instrument bridge, switch panel, throttle lever, E-stop, CRTs, the rack. Ambient occlusion is
# baked into the vertex colours (the PS1 way: the dark under the engine and in the corners, no extra lights).
# Same footprint and hooks as the old one in tools/garage-stations.py (STAND_dyno / STAND_any / STAND_dynobed,
# BUSY_dyno_ / IDLE_dyno_), so it drops into the same SLOT_dyno.
#   Blender --background --python tools/garage-dyno.py -- [--out models/garage/station_dyno_v2.glb (to compare)] [--blend]
#   or inside a running Blender (the MCP add-on): exec it; it builds into a new scene "Dyno" and leaves yours alone.
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_dyno.glb')
LIVE = not bpy.app.background

if LIVE:   # (in your Blender: a scene of its own)
    sc = bpy.data.scenes.get('Dyno') or bpy.data.scenes.new('Dyno')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=4512)
if not os.path.exists(os.path.join(ART, 'dyno_plate.png')): subprocess.run(['python3', os.path.join(HERE, 'garage-signs.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()

# ---------------- materials ----------------
TEXD = G.TEX
steel = grimy_tile('Dy_Steel', 'dark_industrial_metal.png', dirt=0.35, rust=0.35)
blue = grimy_tile('Dy_Blue', 'painted_metal.png', dirt=0.35, rust=0.15, wear_light=0.2, tint=(0.16, 0.32, 0.62))
yellow = grimy_tile('Dy_Yellow', 'painted_metal.png', dirt=0.45, rust=0.2, wear_light=0.25, tint=(0.82, 0.62, 0.06))
grey = grimy_tile('Dy_Grey', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.46, 0.48, 0.49))
dark = grimy_tile('Dy_Dark', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.14, 0.15, 0.16))
cast = grimy_tile('Dy_Cast', 'scratched_metal.png', dirt=0.5, rust=0.25, tint=(0.4, 0.39, 0.37))
alloy = grimy_tile('Dy_Alloy', 'galvanized_metal.png', dirt=0.25)
galv = grimy_tile('Dy_Galv', 'galvanized_metal.png', dirt=0.45, rust=0.1)
tread = grimy_tile('Dy_Tread', 'metal_plate_02.png', dirt=0.6, rust=0.25)
grate = grimy_tile('Dy_Grate', 'metal_grating.png', dirt=0.5, rust=0.3)
rubber = grimy_tile('Dy_Rubber', 'rubber.png', dirt=0.2)
hazard = grimy_tile('Dy_Hazard', 'hazard_stripes_01.png', dirt=0.55, wear_light=0.3)
top = grimy_tile('Dy_Worktop', 'painted_metal.png', dirt=0.4, tint=(0.24, 0.25, 0.27))
# red crinkle paint (the cam covers): fine wrinkle noise in deep red
n = 128; g = vnoise(n, n, 2, wrap=True) * 0.6 + fbm(n, n, (16, 4), wrap=True) * 0.4
crinkle = mat_img('Dy_Crinkle', px_tex('Dy_Crinkle', np.stack([0.55 + 0.25 * g, 0.05 + 0.05 * g, 0.04 + 0.04 * g], -1)), 0.6)
# heat-blued headers: straw and gold at the ports, purple, blue, then a burnt grey-brown (v runs down the pipe)
h, w = 256, 32; v = np.linspace(1, 0, h)[:, None, None] * np.ones((1, w, 1))
stops = np.array([[0.62, 0.5, 0.26], [0.5, 0.3, 0.38], [0.22, 0.26, 0.5], [0.3, 0.32, 0.38], [0.34, 0.3, 0.26]], np.float32)
k = np.clip(v[..., 0] * 4, 0, 3.999); i0 = k.astype(int); f = (k - i0)[..., None]
col = stops[i0] * (1 - f) + stops[np.minimum(i0 + 1, 4)] * f
col = grime(col * (0.85 + 0.3 * fbm(h, w, (16, 4))[..., None]), fbm(h, w, (8, 2)) * 0.35)
headers = mat_img('Dy_Headers', px_tex('Dy_Headers', col), 0.5)
# polished alloy (trumpets, collectors): bright, a little grimy
trumpet = grimy_tile('Dy_Polish', 'galvanized_metal.png', dirt=0.15, tint=(0.82, 0.83, 0.84))
# flex duct: ribs across it (v along)
h, w = 64, 16; rib = (np.sin(np.linspace(0, 16 * math.tau, h, endpoint=False)) * 0.5 + 0.5)[:, None]
col = np.stack([0.22 + 0.25 * rib, 0.22 + 0.25 * rib, 0.23 + 0.25 * rib], -1) * np.ones((1, w, 1)); col = grime(col, fbm(h, w, (8, 2)) * 0.4)
flex = mat_img('Dy_Flex', px_tex('Dy_Flex', col), 0.8)
# braided steel hose: a fine crosshatch
h, w = 32, 32; yy, xx = np.mgrid[0:h, 0:w]; br = (((xx + yy) // 3) % 2 ^ ((xx - yy) // 3) % 2).astype(np.float32)
col = np.stack([0.38 + 0.25 * br] * 3, -1); col = grime(col, fbm(h, w, (8, 2)) * 0.3)
braid = mat_img('Dy_Braid', px_tex('Dy_Braid', col), 0.6)
anod_r = mat_img('Dy_AnodRed', None, 0.35); anod_r.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.05, 0.08, 1)
anod_b = mat_img('Dy_AnodBlue', None, 0.35); anod_b.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.06, 0.16, 0.55, 1)
# acoustic panels: perforated grey sheet, the holes dark
h, w = 64, 64; yy, xx = np.mgrid[0:h, 0:w]; hole = (((xx % 6) - 3) ** 2 + ((yy % 6) - 3) ** 2 < 3).astype(np.float32)
col = np.full((h, w, 3), 0.5, np.float32) * (1 - 0.75 * hole[..., None]); col = grime(col, fbm(h, w, (16, 4)) * 0.35)
acoustic = mat_img('Dy_Acoustic', px_tex('Dy_Acoustic', col), 0.9)
# welded mesh (the screen): wires with holes you see through (alpha clipped: glTF MASK)
h, w = 64, 64; yy, xx = np.mgrid[0:h, 0:w]; wire = ((xx % 16 < 2) | (yy % 16 < 2)).astype(np.float32)
col = np.full((h, w, 3), 0.42, np.float32); col = grime(col, fbm(h, w, (8, 2)) * 0.4)
meshmat = cutout_mat('Dy_Mesh', col, wire)
def glow(name, png, k=1.6): return art_mat(name, A(png), dirt=0.05, emit=k, rough=0.3)
def print_(name, png, d=0.4): return art_mat(name, A(png), dirt=d)
amber_on = mat_img('Dy_BeaconOn', None, 0.4, emit=((1.0, 0.55, 0.08), 6.0))
amber_off = mat_img('Dy_BeaconOff', None, 0.4); amber_off.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.18, 0.03, 1)
bulbm = mat_img('Dy_Bulb', None, 0.5, emit=((1.0, 0.88, 0.66), 14.0))
screen_off = mat_img('Dy_ScreenOff', None, 0.3); screen_off.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.03, 0.03, 1)
estop = mat_img('Dy_EStop', None, 0.5); estop.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.7, 0.04, 0.03, 1)
black = mat_img('Dy_Black', None, 0.7); black.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.03, 0.03, 0.035, 1)

# ---------------- props from the packs ----------------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'pitprops.glb'))
for o in [o for o in bpy.data.objects if o not in before]:
    if o.type == 'MESH': o.rotation_mode = 'XYZ'; link(o, G.lib_collection()); o.hide_set(True); LIB[o.name] = o; o.name = 'LIB_' + o.name
    else: bpy.data.objects.remove(o, do_unlink=True)
S_ = lambda n: os.path.join(ST, n)
lib('crtmon', S_('CrtMonitor.glb'), height=0.4); lib('kbd', S_('keyboard.glb'), scale=0.9); lib('mouse', S_('mouse.glb'), scale=0.8)
lib('chair_k', S_('office_chair_black.glb'), height=0.95); lib('phone', S_('desk_phone_with_cable.glb'), scale=0.55); lib('mug', S_('mug_alt.glb'), height=0.1)
lib('papers', S_('paper_stack_large.glb'), scale=0.7); lib('binder', S_('file_binder.glb'), scale=0.8)
lib('coffee_cup', S_('trash_and_debris/scene.gltf'), 'Coffee_Cup_WithLid', height=0.13); lib('can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12)
IND = os.path.join(SRC, 'psx_industrial_pack.glb'); lib('jerrycan', IND, 'Jerrycan_M', height=0.45); lib('trashcan', IND, 'TrashCan_M')

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
dy = collection('station_dyno', stations); dy.instance_offset = (0, 0, 0)
P = lambda x, y, z=0.0: Vector((x, y, z))

# ================= the cell: floor, wall, screen =================
fl = bx('Dyno_FloorPlate', dy, (3.44, 2.15, 0.016), P(0, -1.075, 0.008), tread); grid_out(fl, 0.36)
bx('Dyno_FloorEdge', dy, (3.44, 0.06, 0.02), P(0, -2.15, 0.01), hazard)
bx('Dyno_Drain', dy, (2.5, 0.16, 0.02), P(-0.35, -1.95, 0.012), grate)
for i, x in enumerate((-1.14, 0.0, 1.14)):   # acoustic panels on a frame, the cable tray over them
    for j, z in enumerate((0.95, 2.05)):
        p = bx(f'Dyno_Acoustic_{i}{j}', dy, (1.1, 0.05, 1.08), P(x, -0.04, z), acoustic); grid_out(p); retile(p, 5.0)
for x in (-1.71, -0.57, 0.57, 1.71): bx(f'Dyno_PanelRail_{x:+.2f}', dy, (0.04, 0.06, 2.3), P(x, -0.05, 1.5), dark)
bx('Dyno_TrayBack', dy, (3.4, 0.02, 0.1), P(0, -0.1, 2.68), galv); bx('Dyno_TrayBase', dy, (3.4, 0.22, 0.012), P(0, -0.2, 2.63), galv)
for k, (yy, c) in enumerate(((-0.14, 0.03), (-0.19, 0.022), (-0.24, 0.026))):
    sweep(f'Dyno_TrayCable_{k}', dy, [P(-1.7, yy, 2.65), P(0.0, yy + 0.01, 2.655), P(1.0, yy, 2.65), P(1.25, yy - 0.05, 2.5), P(1.3, -0.35, 1.2), P(1.35, -0.6, 0.03)], c, black if k else rubber, segs=4, per_m=4)
# the screen between the cell and the room: posts, kick plates, welded mesh, the way in at the right
xs = (-1.72, -0.62, 0.48, 0.98)
for x in xs + (1.72,):
    bbox(f'Dyno_Post_{x:+.2f}', dy, (0.06, 0.06, 2.1), P(x, -2.15, 1.05), yellow, bev=0.006)
    bx(f'Dyno_PostFoot_{x:+.2f}', dy, (0.16, 0.16, 0.012), P(x, -2.15, 0.006), steel)
for a, b in zip(xs, xs[1:]):
    w = b - a - 0.06; c = (a + b) / 2
    bx(f'Dyno_Kick_{c:+.2f}', dy, (w, 0.02, 0.24), P(c, -2.15, 0.14), steel)
    for z in (0.26, 2.06): bx(f'Dyno_MeshFrame_{c:+.2f}_{z}', dy, (w, 0.03, 0.03), P(c, -2.15, z), dark)
    tiled_card(f'Dyno_Mesh_{c:+.2f}', dy, w, 1.78, P(c, -2.15, 0.27), meshmat)
bx('Dyno_DoorHead', dy, (0.74, 0.06, 0.06), P(1.35, -2.15, 2.1), yellow)
mk(card('Dyno_DoorTape', dy, 0.72, 0.1, P(1.35, -2.2, 0.0), hazard, tilt=-D90))
mk(card('Dyno_EarsSign', dy, 0.36, 0.27, P(-0.07, -2.175, 1.25), print_('Dy_SignEars', 'sign_ears')))
mk(card('Dyno_DangerSign', dy, 0.44, 0.33, P(-1.17, -2.175, 1.45), print_('Dy_SignDyno', 'sign_dyno')))
mk(card('BUSY_dyno_RunSign', dy, 0.64, 0.16, P(1.35, -2.19, 2.16), glow('Dy_Running', 'sign_running', 2.2)))
mk(card('IDLE_dyno_RunSign', dy, 0.64, 0.16, P(1.35, -2.19, 2.16), print_('Dy_RunningOff', 'sign_running_off', 0.3)))
bx('Dyno_RunSignBox', dy, (0.68, 0.06, 0.2), P(1.35, -2.15, 2.24), dark)
# the beacon on the door post: amber dome on a black base
lathe('Dyno_BeaconBase', dy, [(0.0, 0), (0.05, 0), (0.05, 0.04), (0.0, 0.04)], P(0.98, -2.15, 2.1), black, segs=10)
lathe('BUSY_dyno_Beacon', dy, [(0.042, 0), (0.042, 0.06), (0.03, 0.09), (0.0, 0.1)], P(0.98, -2.15, 2.14), amber_on, segs=10)
lathe('IDLE_dyno_Beacon', dy, [(0.042, 0), (0.042, 0.06), (0.03, 0.09), (0.0, 0.1)], P(0.98, -2.15, 2.14), amber_off, segs=10)
bulb('BUSY_dyno_Light_Beacon', dy, P(0.98, -2.3, 2.2), 40, (1.0, 0.55, 0.12))

# ================= the bed =================
for y in (-1.05, -1.55):
    ibeam(f'Dyno_Rail_{y:+.2f}', dy, -1.45, 1.05, y, 0.075, steel)
    for x in (-1.3, -0.35, 0.55):
        cy(f'Dyno_Iso_{x:+.2f}_{y:+.2f}', dy, 0.055, 0.06, P(x, y, 0.045), rubber, verts=10)
        bx(f'Dyno_IsoPlate_{x:+.2f}_{y:+.2f}', dy, (0.16, 0.16, 0.015), P(x, y, 0.008), steel)
for x in (-1.25, -0.25, 0.75): bbox(f'Dyno_Cross_{x:+.2f}', dy, (0.08, 0.62, 0.08), P(x, -1.3, 0.27), steel, bev=0.008)
# the drip tray under the engine: a steel pan, a dark puddle of oil in it
tray = grimy_tile('Dy_Tray', 'dark_industrial_metal.png', dirt=0.7, rust=0.3)
bx('Dyno_DripTray', dy, (1.0, 0.7, 0.012), P(-0.7, -1.3, 0.245), tray)
for k, (x, y, w, d) in enumerate(((-0.7, 0.0, 0.98, 0.04), (-0.7, -0.7, 0.98, 0.04))): bx(f'Dyno_TrayLip_{k}', dy, (w, 0.012, d), P(x, -1.3 + 0.344 * (1 if k == 0 else -1), 0.26), tray)
for k, x in enumerate((-1.19, -0.21)): bx(f'Dyno_TrayEnd_{k}', dy, (0.012, 0.7, 0.04), P(x, -1.3, 0.26), tray)
oil = mat_img('Dy_OilPuddle', None, 0.15); oil.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.012, 0.011, 0.01, 1)
lathe('Dyno_OilPuddle', dy, [(0.0, 0.0), (0.24, 0.0)], P(-0.78, -1.32, 0.2525), oil, segs=11, cap0=False)

# ================= the engine: a V8, crank along X at z 0.64, nose at -X =================
EC, Z0, Y0 = -0.72, 0.64, -1.3
E = lambda x, y, z: P(EC + x, Y0 + y, z)
bbox('Engine_Sump', dy, (0.56, 0.3, 0.1), E(0, 0, 0.42), cast)
cy('Engine_SumpPump', dy, 0.045, 0.3, E(-0.1, 0.19, 0.44), alloy, rot=(0, D90, 0), verts=10)
bbox('Engine_Crankcase', dy, (0.62, 0.42, 0.2), E(0, 0, 0.56), cast)
for s in (-1, 1):   # each bank, 45 degrees out
    up = Vector((0, s * math.sin(math.radians(45)), math.cos(math.radians(45)))); a = -s * math.radians(45)
    c = Vector((EC, Y0, Z0))
    bbox(f'Engine_Bank_{s:+d}', dy, (0.6, 0.2, 0.3), c + up * 0.22, cast, rot=(a, 0, 0))
    bbox(f'Engine_Head_{s:+d}', dy, (0.62, 0.23, 0.1), c + up * 0.42, alloy, rot=(a, 0, 0))
    bbox(f'Engine_Cover_{s:+d}', dy, (0.58, 0.17, 0.06), c + up * 0.5, crinkle, rot=(a, 0, 0), bev=0.02)
    for i in range(5): bx(f'Engine_CoverRib_{s:+d}_{i}', dy, (0.012, 0.12, 0.016), c + up * 0.54 + Vector((-0.2 + i * 0.1, 0, 0)), alloy, rot=(a, 0, 0))
    out = Vector((0, s * math.cos(math.radians(45)), -math.sin(math.radians(45))))
    for i in range(4):   # the coil packs on the inner edge, the headers from the outer side
        x = EC - 0.225 + i * 0.15 + (0.035 if s > 0 else -0.035)
        cp = c + up * 0.5 - out * 0.07; bx(f'Engine_Coil_{s:+d}_{i}', dy, (0.03, 0.04, 0.05), Vector((x, cp.y, cp.z + 0.04)), black, rot=(a, 0, 0))
        port = c + up * 0.4 + out * 0.12; port.x = x
        col = Vector((0.0, Y0 + s * 0.52, 0.4))
        sweep(f'Engine_Header_{s:+d}_{i}', dy, [port, port + out * 0.07, Vector((x, Y0 + s * 0.5, 0.62)), Vector((x * 0.55 - 0.08, Y0 + s * 0.53, 0.47)), col + Vector((-0.12, 0, 0.02)), col], 0.02, headers, segs=6, per_m=14)
    lathe(f'Engine_Collector_{s:+d}', dy, [(0.03, 0), (0.06, 0.05), (0.05, 0.2), (0.048, 0.24)], Vector((0.0, Y0 + s * 0.52, 0.4)), trumpet, segs=12, rot=(0, D90, 0), cap0=False)
    # the flexible extraction hose from each collector's tail up to the duct
    tail = Vector((0.26, Y0 + s * 0.52, 0.4)); drop = Vector((-0.1 if s > 0 else 0.55, -0.35, 2.32))
    sweep(f'Engine_Flex_{s:+d}', dy, [tail, tail + Vector((0.12, 0, 0.05)), tail + Vector((0.18, s * 0.05, 0.5)), (tail + drop) / 2 + Vector((0.15, s * 0.15 + 0.2, 0.55)), drop + Vector((0, 0, -0.35)), drop], 0.065, flex, segs=10, per_m=8, vscale=3.0)
# the intake: eight trumpets on their throttle bodies in the V
bbox('Engine_IntakeBase', dy, (0.6, 0.14, 0.05), E(0, 0, 1.0), alloy)
for row in (-1, 1):
    for i in range(4):
        x = EC - 0.225 + i * 0.15 + (0.035 if row > 0 else -0.035); y = Y0 + row * 0.04
        cy(f'Engine_Throttle_{row:+d}_{i}', dy, 0.026, 0.05, Vector((x, y, 1.05)), alloy, verts=10)
        lathe(f'Engine_Trumpet_{row:+d}_{i}', dy, [(0.026, 0), (0.024, 0.06), (0.028, 0.1), (0.042, 0.125), (0.05, 0.13)], Vector((x, y, 1.075)), trumpet, segs=12, rot=(row * 0.12, 0, 0), cap0=False, cap1=False)
rd('Engine_Linkage', dy, E(-0.3, 0.0, 1.03), E(0.3, 0.0, 1.03), 0.006, steel, verts=6)
sweep('Engine_FuelRail', dy, [E(-0.3, 0.09, 1.07), E(0.3, 0.09, 1.07)], 0.012, anod_r, segs=6)
# the nose: timing cover, damper, pulleys, belt, alternator, water pump; oil filter
bbox('Engine_TimingCover', dy, (0.05, 0.4, 0.42), E(-0.33, 0, 0.66), alloy, bev=0.015)
lathe('Engine_Damper', dy, [(0, 0), (0.085, 0), (0.09, 0.01), (0.09, 0.035), (0.085, 0.045), (0, 0.045)], E(-0.4, 0, 0.56), steel, segs=14, rot=(0, -D90, 0))
for nm, y, z, r in (('WaterPump', 0.0, 0.84, 0.055), ('Alternator', -0.17, 0.95, 0.04), ('Idler', 0.14, 0.78, 0.03)):
    lathe(f'Engine_Pulley_{nm}', dy, [(0, 0), (r, 0), (r * 0.85, 0.012), (r, 0.024), (0, 0.024)], E(-0.4, y, z), steel, segs=12, rot=(0, -D90, 0))
cy('Engine_AltBody', dy, 0.06, 0.12, E(-0.31, -0.17, 0.95), alloy, rot=(0, D90, 0), verts=12)
sweep('Engine_Belt', dy, [E(-0.395, 0.0, 0.47), E(-0.395, 0.09, 0.56), E(-0.395, 0.15, 0.76), E(-0.395, 0.04, 0.9), E(-0.395, -0.16, 1.0), E(-0.395, -0.21, 0.94), E(-0.395, -0.08, 0.56)], 0.008, black, segs=4, closed=True, caps=False)
lathe('Engine_OilFilter', dy, [(0, 0), (0.045, 0), (0.048, 0.01), (0.048, 0.1), (0.04, 0.11), (0, 0.11)], E(-0.12, 0.21, 0.5), anod_b, segs=12, rot=(-D90, 0, 0))
# the back: bellhousing and the shaft (with its guard) to the absorber
lathe('Engine_Bell', dy, [(0.2, 0), (0.18, 0.08), (0.12, 0.14)], E(0.31, 0, Z0), alloy, segs=14, rot=(0, D90, 0), cap0=False)
for x in (-0.38, -1.06): pass
rd('Dyno_Shaft', dy, P(-0.25, Y0, Z0), P(0.13, Y0, Z0), 0.028, steel, verts=10)
for x in (-0.22, 0.1): bx(f'Dyno_ShaftUJ_{x:+.2f}', dy, (0.05, 0.07, 0.07), P(x, Y0, Z0), steel)
sg = lathe('Dyno_ShaftGuard', dy, [(0.13, 0), (0.13, 0.36)], P(-0.24, Y0, Z0), meshmat, segs=12, rot=(0, D90, 0), cap0=False, cap1=False)
for d in sg.data.uv_layers[0].data: d.uv = (d.uv[0] * 2.7, d.uv[1] * 1.2)
for x in (-0.24, 0.12): lathe(f'Dyno_GuardRing_{x:+.2f}', dy, [(0.135, 0), (0.135, 0.02)], P(x, Y0, Z0), yellow, segs=12, rot=(0, D90, 0), cap0=False, cap1=False)
for x in (-0.1, 0.0): bx(f'Dyno_GuardFoot_{x:+.2f}', dy, (0.03, 0.03, 0.36), P(x, Y0 - 0.1, 0.4), yellow)
# mounts: the engine plates down to the bed
for x in (-0.95, -0.45):
    for s in (-1, 1): bbox(f'Engine_Mount_{x:+.2f}_{s:+d}', dy, (0.06, 0.06, 0.2), P(x, Y0 + s * 0.22, 0.4), steel, bev=0.008)

# ================= the absorber: an eddy-current unit on trunnions, its torque arm and load cell =================
AX = 0.42
lathe('Dyno_Absorber', dy, [(0.06, -0.02), (0.2, 0.0), (0.3, 0.03), (0.31, 0.06), (0.31, 0.3), (0.3, 0.33), (0.2, 0.36), (0.06, 0.38)], P(AX - 0.18, Y0, Z0), blue, segs=18, rot=(0, D90, 0))
for i in range(14):
    a = i / 14 * math.tau
    bx(f'Dyno_Fin_{i:02d}', dy, (0.22, 0.012, 0.05), P(AX, Y0 + math.cos(a) * 0.33, Z0 + math.sin(a) * 0.33), blue, rot=(a, 0, 0))
for x in (AX - 0.23, AX + 0.23):
    bbox(f'Dyno_Trunnion_{x:+.2f}', dy, (0.06, 0.3, 0.36), P(x, Y0, 0.42), steel, bev=0.01)
    cy(f'Dyno_Bearing_{x:+.2f}', dy, 0.08, 0.08, P(x, Y0, Z0), dark, rot=(0, D90, 0), verts=12)
mk(card('Dyno_Plate', dy, 0.22, 0.083, P(AX, Y0 - 0.335, Z0 - 0.04), print_('Dy_Plate', 'dyno_plate', 0.25)))
bx('Dyno_PlateBoss', dy, (0.24, 0.02, 0.1), P(AX, Y0 - 0.322, Z0 + 0.0), blue)
beamm = bbox('Dyno_TorqueArm', dy, (0.05, 0.5, 0.05), P(AX + 0.12, Y0 - 0.45, Z0 - 0.08), steel, rot=(0.45, 0, 0), bev=0.006)
cy('Dyno_LoadCell', dy, 0.03, 0.09, P(AX + 0.12, Y0 - 0.68, 0.3), alloy, verts=10)
bbox('Dyno_LoadPost', dy, (0.07, 0.07, 0.24), P(AX + 0.12, Y0 - 0.68, 0.14), yellow, bev=0.006)
sweep('Dyno_LoadCable', dy, [P(AX + 0.12, Y0 - 0.71, 0.3), P(AX + 0.2, Y0 - 0.8, 0.12), P(AX + 0.5, Y0 - 0.75, 0.025), P(1.25, -0.6, 0.025), P(1.35, -0.6, 0.03)], 0.007, black, segs=5)
for k, (y0, mat) in enumerate(((-0.05, anod_b), (0.05, anod_r))):   # water in and out, to the cooling cart
    sweep(f'Dyno_WaterHose_{k}', dy, [P(AX, Y0 + 0.3, Z0 + 0.12 + y0), P(AX + 0.2, Y0 + 0.5, Z0 + 0.3), P(AX + 0.55, -0.55, 0.5), P(1.2, -0.45 + y0, 0.55)], 0.022, braid, segs=8, vscale=8)

# ================= the cooling module (at the nose) and the fuel cart (by the wall) =================
CX = -1.55
bbox('Dyno_CoolFrame', dy, (0.06, 0.6, 0.62), P(CX, Y0, 0.78), dark, bev=0.01)
bx('Dyno_CoolCore', dy, (0.04, 0.52, 0.54), P(CX + 0.03, Y0, 0.78), grate)
lathe('Dyno_FanShroud', dy, [(0.24, 0), (0.24, 0.08)], P(CX - 0.1, Y0, 0.78), dark, segs=16, rot=(0, D90, 0), cap0=False, cap1=False)
for i in range(5):
    a = i / 5 * math.tau
    bx(f'Dyno_FanBlade_{i}', dy, (0.012, 0.07, 0.2), P(CX - 0.06, Y0 + math.cos(a) * 0.11, 0.78 + math.sin(a) * 0.11), black, rot=(a + D90, 0.4, 0))
cy('Dyno_FanHub', dy, 0.04, 0.06, P(CX - 0.06, Y0, 0.78), steel, rot=(0, D90, 0), verts=10)
for y in (-1.55, -1.05): rd(f'Dyno_CoolLeg_{y:+.2f}', dy, P(CX, y, 0.0), P(CX, y, 0.48), 0.018, dark, verts=6)
sweep('Engine_CoolHoseTop', dy, [P(CX + 0.05, Y0 + 0.15, 0.98), P(CX + 0.35, Y0 + 0.2, 1.0), P(EC - 0.42, Y0 + 0.02, 0.86)], 0.025, rubber, segs=8)
sweep('Engine_CoolHoseLow', dy, [P(CX + 0.05, Y0 - 0.18, 0.56), P(CX + 0.3, Y0 - 0.22, 0.5), P(EC - 0.4, Y0 - 0.1, 0.62)], 0.025, rubber, segs=8)
# the fuel cart: a tank on a wheeled frame, a gauge, the line to the rail
FX, FY = 1.32, -0.5
for x in (FX - 0.2, FX + 0.2):
    for y in (FY - 0.15, FY + 0.15):
        cy(f'Dyno_CartWheel_{x:+.2f}_{y:+.2f}', dy, 0.04, 0.03, P(x, y, 0.04), rubber, rot=(D90, 0, 0), verts=10)
        rd(f'Dyno_CartLeg_{x:+.2f}_{y:+.2f}', dy, P(x, y, 0.06), P(x, y, 0.5), 0.012, steel, verts=6)
bbox('Dyno_CartShelf', dy, (0.48, 0.38, 0.025), P(FX, FY, 0.2), steel, bev=0.006); bbox('Dyno_CartTop', dy, (0.48, 0.38, 0.025), P(FX, FY, 0.5), steel, bev=0.006)
lathe('Dyno_FuelTank', dy, [(0, 0), (0.14, 0), (0.15, 0.03), (0.15, 0.36), (0.13, 0.4), (0.04, 0.42), (0, 0.42)], P(FX - 0.03, FY, 0.513), mat_img('Dy_FuelRed', save('Dy_FuelRedT', grime(G.tile(load_px(os.path.join(TEXD, 'painted_metal.png')), 64, 64, 64, 64) * np.array([1.1, 0.25, 0.2]), fbm(64, 64, (8, 2)) * 0.4)), 0.6), segs=14)
lathe('Dyno_FuelGauge', dy, [(0, 0), (0.04, 0), (0.04, 0.02), (0, 0.02)], P(FX + 0.17, FY - 0.12, 0.62), alloy, segs=10, rot=(D90, 0, 0))
put('jerrycan', dy, P(FX, FY, 0.213), 0.4)
sweep('Engine_FuelLine', dy, [P(FX - 0.05, FY - 0.05, 0.93), P(FX - 0.3, FY - 0.2, 1.1), P(0.3, -0.85, 1.2), P(EC + 0.3, Y0 + 0.09, 1.07)], 0.009, braid, segs=6, vscale=10)

# ================= extraction: duct along the wall, the fan box in the window =================
bbox('Dyno_Duct', dy, (1.6, 0.3, 0.26), P(0.25, -0.33, 2.32), galv, bev=0.01)
bbox('Dyno_DuctElbow', dy, (0.3, 0.3, 0.55), P(-0.55, -0.33, 2.6), galv, bev=0.01)
bbox('Dyno_FanBox', dy, (0.6, 0.12, 0.5), P(-0.55, -0.08, 2.9), dark)
for i in range(5): bx(f'Dyno_Louvre_{i}', dy, (0.52, 0.03, 0.02), P(-0.55, -0.15, 2.72 + i * 0.09), steel, rot=(0.5, 0, 0))
for x in (-0.1, 0.55): lathe(f'Dyno_DuctDrop_{x:+.2f}', dy, [(0.08, 0), (0.08, 0.12)], P(x, -0.35, 2.08), galv, segs=12, cap0=False)
for x in (-0.3, 0.6, 1.0): bx(f'Dyno_DuctHanger_{x:+.2f}', dy, (0.03, 0.03, 0.6), P(x, -0.33, 2.75), steel)

# ================= lights: a cage lamp over the engine =================
for k, dx in enumerate((-0.2, 0.2)): rd(f'Dyno_LampChain_{k}', dy, P(-0.4 + dx, Y0, 3.1), P(-0.4 + dx * 0.4, Y0, 2.42), 0.006, steel, verts=4)
lathe('Dyno_LampShade', dy, [(0.06, 0.12), (0.26, 0.0), (0.27, -0.015)], P(-0.4, Y0, 2.3), dark, segs=14, cap0=False, cap1=False)
lathe('Dyno_LampBulb', dy, [(0.0, 0.08), (0.05, 0.06), (0.06, 0.02), (0.0, 0.0)], P(-0.4, Y0, 2.3), bulbm, segs=10)
spot('Light_Dyno', dy, P(-0.4, Y0, 2.3), 360, (1.0, 0.86, 0.65), deg=115)

# ================= the console (the operator faces the cell, +Y) =================
CC, CY = -0.25, -2.62
bbox('Dyno_ConsoleBase', dy, (1.7, 0.56, 0.7), P(CC, CY, 0.35), grey, bev=0.015)
for i, x in enumerate((-0.55, 0.0, 0.55)): bx(f'Dyno_ConsoleDoor_{i}', dy, (0.48, 0.01, 0.55), P(CC + x, CY - 0.285, 0.36), dark)
TOPZ = 0.7375
bbox('Dyno_ConsoleTop', dy, (1.8, 0.66, 0.035), P(CC, CY - 0.03, 0.72), top, bev=0.008)
# the instrument bridge in the middle, gauges and switches on its face; a CRT on the desk either side, turned in
bridge = bbox('Dyno_Bridge', dy, (0.9, 0.18, 0.2), P(CC, CY + 0.22, 0.84), dark, rot=(-0.35, 0, 0), bev=0.01)
mk(card('Dyno_Gauges', dy, 0.4, 0.26, P(CC - 0.235, CY + 0.098, 0.775), glow('Dy_Gauges', 'panel_gauges', 0.6), tilt=-0.35))
mk(card('Dyno_Switches', dy, 0.46, 0.153, P(CC + 0.235, CY + 0.098, 0.8), glow('Dy_Switches', 'dyno_switches', 0.5), tilt=-0.35))
for k, (sx, art) in enumerate(((-1, 'screen_dyno'), (1, 'screen_tele'))):
    a = -sx * 0.25; cx, cyy = CC + sx * 0.66, CY + 0.08   # (the model's glass faces -Y: the screen 0.17 in front, 0.09 up)
    put('crtmon', dy, P(cx, cyy, TOPZ), a, name=f'DynoCRT{k}')
    sp = P(cx + 0.17 * math.sin(a), cyy - 0.17 * math.cos(a), TOPZ + 0.09); nm = '' if k == 0 else '2'
    mk(card(f'BUSY_dyno_Screen{nm}', dy, 0.3, 0.23, sp, glow(f'Dy_Screen{k}', art), rotz=a, tilt=-0.08))
    mk(card(f'IDLE_dyno_Screen{nm}', dy, 0.3, 0.23, sp, screen_off, rotz=a, tilt=-0.08))
# the throttle quadrant, the E-stop, the keyboard and the clutter
bbox('Dyno_Quadrant', dy, (0.1, 0.18, 0.08), P(CC + 0.35, CY - 0.18, 0.78), dark, bev=0.01)
rd('Dyno_ThrottleLever', dy, P(CC + 0.35, CY - 0.16, 0.8), P(CC + 0.35, CY - 0.06, 0.95), 0.008, steel, verts=6)
lathe('Dyno_ThrottleKnob', dy, [(0, 0), (0.022, 0.01), (0.022, 0.03), (0, 0.04)], P(CC + 0.35, CY - 0.06, 0.94), black, segs=8)
bbox('Dyno_EStopBox', dy, (0.09, 0.09, 0.06), P(CC + 0.62, CY - 0.27, 0.765), yellow, bev=0.008)
lathe('Dyno_EStop', dy, [(0, 0), (0.015, 0), (0.015, 0.02), (0.035, 0.025), (0.035, 0.04), (0, 0.045)], P(CC + 0.62, CY - 0.27, 0.795), estop, segs=12)
put('kbd', dy, P(CC - 0.1, CY - 0.18, 0.737), math.pi); put('mouse', dy, P(CC + 0.15, CY - 0.2, 0.737), math.pi + 0.3)
put('papers', dy, P(CC - 0.45, CY - 0.25, TOPZ), 0.25); put('mug', dy, P(CC + 0.8, CY - 0.26, TOPZ), 1.2); put('phone', dy, P(CC - 0.8, CY - 0.24, TOPZ), 0.4)
mk(card('Dyno_Note', dy, 0.09, 0.09, P(CC + 0.02, CY + 0.12, 0.885), print_('Dy_NoteDanny', 'note_danny', 0.3), rotz=0.05, tilt=-0.35))
put('chair_k', dy, P(CC, -3.22), math.pi + 0.15, name='DynoChair')
put('coffee_cup', dy, P(0.75, -2.45, 0.0), 0.0); put('can', dy, P(-1.62, -1.9, 0.016), 0.7)
# the rack: a steel cabinet with its instruments, the printer on top with today's sheet
RX = -1.42   # (the rack at the left end, side on: its front to the room's right, the way you come in)
bbox('Dyno_Rack', dy, (0.55, 0.55, 1.45), P(RX, -2.8, 0.725), dark, bev=0.012)
mk(card('Dyno_RackFront', dy, 0.48, 1.2, P(RX + 0.28, -2.8, 0.15), glow('Dy_RackFront', 'rack_front', 0.9), rotz=D90))
bbox('Dyno_Printer', dy, (0.42, 0.3, 0.15), P(RX, -2.8, 1.53), grey, bev=0.015)
mk(card('Dyno_PrintSheet', dy, 0.2, 0.4, P(RX + 0.16, -2.8, 1.2), print_('Dy_Printout', 'printout', 0.2), rotz=D90, tilt=0.1))
# ear defenders on a hook by the way in, the extinguisher
bx('Dyno_Hook', dy, (0.02, 0.06, 0.02), P(1.72, -2.25, 1.55), steel)
for s in (-1, 1): lathe(f'Dyno_EarCup_{s:+d}', dy, [(0, 0), (0.045, 0), (0.045, 0.04), (0, 0.045)], P(1.72 + s * 0.07, -2.3, 1.42), yellow, segs=10, rot=(0, s * D90, 0))
sweep('Dyno_EarBand', dy, [P(1.65, -2.3, 1.44), P(1.72, -2.3, 1.55), P(1.79, -2.3, 1.44)], 0.01, black, segs=5)
lathe('Dyno_Extinguisher', dy, [(0, 0), (0.08, 0), (0.08, 0.46), (0.06, 0.52), (0.02, 0.55), (0, 0.55)], P(1.6, -0.15, 0.3), estop, segs=12)
bx('Dyno_ExtBracket', dy, (0.12, 0.05, 0.05), P(1.6, -0.08, 0.55), steel)

# ================= in use or not; where people stand =================
for o in list(dy.objects):
    if o.name.startswith(('Engine_', 'Dyno_Shaft')): o.name = 'BUSY_dyno_' + o.name
put('box_b', dy, P(-0.8, -1.25, 0.265), 0.2, name='IDLE_dyno_Box'); put('toolbox', dy, P(-0.2, -1.05, 0.29), 1.5, name='IDLE_dyno_Toolbox')
put('box_a', dy, P(-1.1, -1.5, 0.265), -0.3, name='IDLE_dyno_Box2')
empty('STAND_dyno', dy, P(CC, -3.22), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='sit_desk', role='dyno')
empty('STAND_any', dy, P(AX + 0.05, -1.95), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='kneel', role='any')
empty('STAND_dynobed', dy, P(EC - 0.05, -1.95), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='kneel_point', role='mechanic')   # (at the engine: busy only)

if '--noao' not in args:
    print('AO baked on', bake_ao(dy, skip=(meshmat,)), 'objects')

if not LIVE or '--export' in args: export_station(dy, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'dyno-start.blend'))
print('DYNO objects', len(dy.all_objects), 'triangles', tris(dy))
