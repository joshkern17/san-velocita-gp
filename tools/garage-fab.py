# The fabrication bay, made properly (the home garage's station_fab, Fab level 1; see docs/GARAGE-KIT.md and
# .claude/skills/garage-station). A race team's fab corner: a fixture table (thick top, a grid of holes, chalk on it) with
# a jig and a tube front clip clamped up on it, tacked and being welded (sparks, the arc's light), the MIG welder on its
# trolley with the gas bottle chained on, its torch lead and earth to the table, orange PVC weld curtains on a wheeled
# frame, a wall rack of tube stock, sheet offcuts leant on the wall, a tube notcher and a ratchet bender on their
# stands, a pedestal grinder, the bench vice, F-clamps, the fire blanket and an extinguisher, the offcut bin. Idle: the
# helmet and gloves on the table instead of a frame. AO baked into the vertex colours.
# Same footprint and hooks as the old one in tools/garage-stations.py (STAND_fab, STAND_any; BUSY_fab_ / IDLE_fab_), so
# it drops into SLOT_fab.
#   Blender --background --python tools/garage-fab.py -- [--out models/garage/station_fab.glb] [--blend]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_fab.glb')
LIVE = not bpy.app.background

if LIVE:   # (in your Blender: a scene of its own)
    sc = bpy.data.scenes.get('Fab') or bpy.data.scenes.new('Fab')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=7117)
if not os.path.exists(os.path.join(ART, 'sign_weld.png')): subprocess.run(['python3', os.path.join(HERE, 'garage-signs.py')], check=True)
if not os.path.exists(os.path.join(ART, 'fab_welder.png')) or '--art' in args: subprocess.run(['python3', os.path.join(HERE, 'garage-signs-fab.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()

# ---------------- materials ----------------
TEXD = G.TEX
steel = grimy_tile('Fb_Steel', 'dark_industrial_metal.png', dirt=0.4, rust=0.4)
blue = grimy_tile('Fb_Blue', 'painted_metal.png', dirt=0.35, rust=0.1, wear_light=0.2, tint=(0.16, 0.32, 0.62))
red = grimy_tile('Fb_Red', 'painted_metal.png', dirt=0.4, rust=0.2, wear_light=0.25, tint=(0.66, 0.1, 0.07))
yellow = grimy_tile('Fb_Yellow', 'painted_metal.png', dirt=0.45, rust=0.2, wear_light=0.25, tint=(0.82, 0.62, 0.06))
grey = grimy_tile('Fb_Grey', 'painted_metal.png', dirt=0.35, rust=0.1, tint=(0.44, 0.46, 0.47))
dark = grimy_tile('Fb_Dark', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.13, 0.14, 0.15))
green = grimy_tile('Fb_GasGreen', 'painted_metal.png', dirt=0.4, rust=0.2, tint=(0.16, 0.3, 0.2))
alloy = grimy_tile('Fb_Alloy', 'galvanized_metal.png', dirt=0.25)
bright = grimy_tile('Fb_Bright', 'galvanized_metal.png', dirt=0.15, tint=(0.8, 0.81, 0.82))
cast = grimy_tile('Fb_Cast', 'scratched_metal.png', dirt=0.5, rust=0.25, tint=(0.4, 0.39, 0.37))
rubber = grimy_tile('Fb_Rubber', 'rubber.png', dirt=0.2)
brass = grimy_tile('Fb_Brass', 'cooper.png', dirt=0.3, tint=(0.66, 0.52, 0.2))
tube = grimy_tile('Fb_Tube', 'galvanized_metal.png', dirt=0.25, rust=0.1, tint=(0.66, 0.66, 0.67))   # (tube stock: mill-scaled steel)
black = solid_mat('Fb_Black', (0.03, 0.03, 0.035), 0.7)
leather = grimy_tile('Fb_Leather', 'painted_metal.png', dirt=0.5, tint=(0.55, 0.38, 0.2))
# the fixture table's top: blue-grey ground steel, a grid of holes every 10 cm, burnt spatter
n = 128; yy, xx = np.mgrid[0:n, 0:n]; holes = ((((xx % 16) - 7.5) ** 2 + ((yy % 16) - 7.5) ** 2) < 11).astype(np.float32)
col = np.stack([0.36, 0.39, 0.42], -1) * np.ones((n, n, 3), np.float32) * (0.85 + 0.3 * vnoise(n, n, 4, wrap=True)[..., None])
col = grime(col, fbm(n, n, (32, 16, 4), wrap=True) * 0.55); col = col * (1 - 0.8 * holes[..., None])
fixture = mat_img('Fb_Fixture', px_tex('Fb_Fixture', col), 0.5)
# the floor under it: steel plate, scorched and spattered where the sparks land
n = 128; base = G.tile(load_px(os.path.join(TEXD, 'metal_plate_02.png')), n, n, 64, 64)
burn = np.clip((fbm(n, n, (32, 8, 2)) - 0.45) * 2.2, 0, 1) * 0.65
spat = (vnoise(n, n, 1) > 0.93).astype(np.float32) * 0.5
floorm = mat_img('Fb_Floor', px_tex('Fb_Floor', grime(base, np.clip(burn + spat + fbm(n, n, (16, 4)) * 0.2, 0, 1))), 0.8)
# the weld curtains: orange PVC you see through (blended), streaked
n = 32; c = np.stack([0.95, 0.4, 0.06], -1) * np.ones((n, n, 3), np.float32) * (0.8 + 0.25 * vnoise(n, n, 2)[..., None])
curtain = mat_img('Fb_Curtain', px_tex('Fb_Curtain', grime(c, fbm(n, n, (8, 2)) * 0.3)), 0.4)
_p = curtain.node_tree.nodes['Principled BSDF']; _p.inputs['Alpha'].default_value = 0.7
_p.inputs['Emission Color'].default_value = (0.9, 0.32, 0.04, 1); _p.inputs['Emission Strength'].default_value = 0.2
curtain.surface_render_method = 'BLENDED'
def glow(name, png, k=1.6): return art_mat(name, A(png), dirt=0.05, emit=k, rough=0.3)
def print_(name, png, d=0.4): return art_mat(name, A(png), dirt=d)

def art_cutout(name, png, emit=None):
    # a printed card with its own transparency (chalk, a spark): glTF MASK; emit: strength, for something that glows
    im = bpy.data.images.load(png, check_existing=True); m = bpy.data.materials.new(name)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']; t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    g = nt.nodes.new('ShaderNodeMath'); g.operation = 'GREATER_THAN'; g.inputs[1].default_value = 0.5
    nt.links.new(t.outputs['Alpha'], g.inputs[0]); nt.links.new(g.outputs[0], p.inputs['Alpha'])
    p.inputs['Roughness'].default_value = 0.9; p.inputs['Metallic'].default_value = 0.0
    if emit: nt.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    return m
chalk = art_cutout('Fb_Chalk', A('fab_chalk'))
spark = art_cutout('Fb_Spark', A('fab_spark'), emit=6.0)
weldglow = mat_img('Fb_WeldGlow', None, 0.4, emit=((1.0, 0.55, 0.15), 8.0))
bulbm = mat_img('Fb_Bulb', None, 0.5, emit=((1.0, 0.9, 0.7), 14.0))

# ---------------- props from the packs ----------------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'pitprops.glb'))
for o in [o for o in bpy.data.objects if o not in before]:
    if o.type == 'MESH': o.rotation_mode = 'XYZ'; link(o, G.lib_collection()); o.hide_set(True); LIB[o.name] = o; o.name = 'LIB_' + o.name
    else: bpy.data.objects.remove(o, do_unlink=True)
S_ = lambda n: os.path.join(ST, n)
lib('scrap', S_('trash_and_debris/scene.gltf'), 'Sheet_Metal_1', scale=0.5)
IND = os.path.join(SRC, 'psx_industrial_pack.glb'); lib('trashcan', IND, 'TrashCan_M')

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
fb = collection('station_fab', stations); fb.instance_offset = (0, 0, 0)
P = lambda x, y, z=0.0: Vector((x, y, z))

# ================= the floor and the wall =================
fl = bx('Fab_FloorPlate', fb, (2.5, 1.55, 0.012), P(-0.3, -1.6, 0.006), floorm); grid_out(fl, 0.36)
cd('Fab_WeldSign', fb, 0.44, 0.33, P(-0.25, -0.03, 2.08), print_('Fb_SignWeld', 'sign_weld'))

# ================= the fixture table =================
TX, TY, TW, TD, TOPZ = -0.3, -1.6, 1.9, 0.95, 0.9
bbox('Fab_TableTop', fb, (TW, TD, 0.07), P(TX, TY, TOPZ - 0.035), fixture, bev=0.01)
retile(bpy.data.objects['Fab_TableTop'], 1.25)
for sx in (-1, 1):
    for sy in (-1, 1):
        bbox(f'Fab_TableLeg_{sx:+d}{sy:+d}', fb, (0.1, 0.1, 0.83), P(TX + sx * (TW / 2 - 0.12), TY + sy * (TD / 2 - 0.12), 0.415), dark, bev=0.008)
        bx(f'Fab_TableFoot_{sx:+d}{sy:+d}', fb, (0.16, 0.16, 0.012), P(TX + sx * (TW / 2 - 0.12), TY + sy * (TD / 2 - 0.12), 0.006), steel)
for sy in (-1, 1): bbox(f'Fab_TableRail_{sy:+d}', fb, (TW - 0.24, 0.06, 0.06), P(TX, TY + sy * (TD / 2 - 0.12), 0.22), dark, bev=0.006)
bbox('Fab_TableShelf', fb, (TW - 0.34, TD - 0.3, 0.025), P(TX, TY, 0.26), steel, bev=0.005)
cd('Fab_Chalk', fb, 0.5, 0.25, P(-0.95, -2.0, TOPZ + 0.002), chalk, tilt=-D90)
# the jig: two square-tube posts with stops, bolted down through the holes
for x in (-1.08, 0.48):
    bbox(f'Fab_JigPost_{x:+.2f}', fb, (0.05, 0.05, 0.42), P(x, TY, TOPZ + 0.21), yellow, bev=0.005)
    bbox(f'Fab_JigFoot_{x:+.2f}', fb, (0.16, 0.12, 0.02), P(x, TY, TOPZ + 0.01), yellow, bev=0.004)
    bx(f'Fab_JigStop_{x:+.2f}', fb, (0.06, 0.08, 0.04), P(x + (0.04 if x < 0 else -0.04), TY, TOPZ + 0.3), steel)
# V-blocks the frame sits on
for k, (x, y) in enumerate(((-0.9, -1.3), (0.3, -1.3), (-0.9, -1.9), (0.3, -1.9))):
    bbox(f'Fab_VBlock_{k}', fb, (0.08, 0.06, 0.04), P(x, y, TOPZ + 0.02), steel, bev=0.004)

# ================= in use: a tube front clip, tacked up on the jig, being welded =================
R_ = 0.019; FZ = TOPZ + 0.06
X0, X1, YA, YB = -0.95, 0.35, -1.3, -1.9
for k, (a, b) in enumerate((((X0, YA), (X1, YA)), ((X0, YB), (X1, YB)), ((X0, YA), (X0, YB)), ((X1, YA), (X1, YB)), ((-0.3, YA), (-0.3, YB)), ((X0, YA), (-0.3, YB)))):
    rd(f'Frame_Base_{k}', fb, P(*a, FZ), P(*b, FZ), R_, tube, verts=8)
# the front hoop (bent, over the X1 end), the top rails sloping back from it, uprights, a diagonal brace
sweep('Frame_Hoop', fb, [P(X1, YA, FZ), P(X1, YA, FZ + 0.3), P(X1, YA - 0.12, FZ + 0.46), P(X1, YB + 0.12, FZ + 0.46), P(X1, YB, FZ + 0.3), P(X1, YB, FZ)], R_, tube, segs=8, per_m=14)
for y in (YA, YB):
    sweep(f'Frame_TopRail_{y:+.1f}', fb, [P(X1, y + (-0.06 if y == YA else 0.06), FZ + 0.42), P(-0.3, y, FZ + 0.3), P(X0, y, FZ + 0.16)], R_ * 0.85, tube, segs=6, per_m=8)
    rd(f'Frame_Upright_{y:+.1f}', fb, P(-0.3, y, FZ), P(-0.3, y, FZ + 0.3), R_, tube, verts=8)
    rd(f'Frame_Rear_{y:+.1f}', fb, P(X0, y, FZ), P(X0, y, FZ + 0.16), R_, tube, verts=8)
rd('Frame_Brace', fb, P(-0.3, YA, FZ + 0.3), P(X1, YB, FZ + 0.05), R_ * 0.8, tube, verts=8)
rd('Frame_Cross', fb, P(-0.3, YA, FZ + 0.3), P(-0.3, YB, FZ + 0.3), R_ * 0.85, tube, verts=8)
# tacks: little blued beads at the joints, one glowing where the arc is
for k, p in enumerate((P(X1, YA, FZ), P(-0.3, YB, FZ), P(X0, YA, FZ), P(-0.3, YA, FZ + 0.3))):
    lathe(f'Frame_Tack_{k}', fb, [(0, -0.012), (0.026, 0.0), (0, 0.012)], p, cast, segs=6)
lathe('Frame_Weld', fb, [(0, -0.012), (0.028, 0.0), (0, 0.014)], P(X1, YB, FZ + 0.3), weldglow, segs=6)
for k, (rz, tl) in enumerate(((0.3, 0.2), (1.4, -0.3), (2.4, 0.5))):   # (sparks off the arc)
    cd(f'Frame_Spark_{k}', fb, 0.24, 0.24, P(X1 + 0.02, YB - 0.02, FZ + 0.18), spark, rotz=rz, tilt=tl)
bulb('BUSY_fab_Light_Weld', fb, P(X1 - 0.05, YB - 0.15, FZ + 0.35), 45, (0.6, 0.78, 1.0))   # (the arc's blue-white on the frame)
# F-clamps holding the base rails down to the table's edge
def fclamp(name, x, y, side):
    # a bar up the table's edge, the fixed jaw over the top, the sliding jaw under, the screw and its handle
    bbox(f'{name}_Bar', fb, (0.025, 0.012, 0.3), P(x, y + side * 0.02, TOPZ - 0.05), steel, bev=0.003)
    bbox(f'{name}_Top', fb, (0.03, 0.1, 0.03), P(x, y - side * 0.02, TOPZ + 0.095), red, bev=0.005)
    bbox(f'{name}_Low', fb, (0.03, 0.09, 0.03), P(x, y - side * 0.015, TOPZ - 0.15), red, bev=0.005)
    rd(f'{name}_Screw', fb, P(x, y - side * 0.05, TOPZ - 0.17), P(x, y - side * 0.05, TOPZ - 0.06), 0.006, bright, verts=6)
    lathe(f'{name}_Handle', fb, [(0, 0), (0.018, 0.0), (0.018, 0.105), (0, 0.105)], P(x, y - side * 0.05, TOPZ - 0.27), dark, segs=8)
for k, (x, y, s) in enumerate(((-0.6, TY - TD / 2, -1), (0.1, TY - TD / 2, -1), (-0.6, TY + TD / 2, 1))): fclamp(f'Clamp_{k}', x, y, s)
for o in list(fb.objects):
    if o.name.startswith(('Frame_', 'Clamp_')): o.name = 'BUSY_fab_' + o.name
# idle: the helmet and gloves on the table, the frame's not there
bbox('IDLE_fab_Helmet', fb, (0.22, 0.26, 0.2), P(-0.85, -1.55, TOPZ + 0.1), dark, bev=0.05)
cd('IDLE_fab_HelmetLens', fb, 0.11, 0.05, P(-0.85, -1.682, TOPZ + 0.12), solid_mat('Fb_Lens', (0.05, 0.12, 0.08), 0.15))
for k, (x, r) in enumerate(((-0.45, 0.4), (-0.3, -0.2))):
    bbox(f'IDLE_fab_Glove_{k}', fb, (0.11, 0.24, 0.035), P(x, -1.72, TOPZ + 0.018), leather, rot=(0, 0, r), bev=0.012)

# ================= the welder on its trolley, the gas bottle, the leads =================
WX, WY = 0.95, -1.18
bbox('Fab_TrolleyBase', fb, (0.42, 0.78, 0.04), P(WX, WY + 0.08, 0.17), dark, bev=0.006)
for s in (-1, 1): lathe(f'Fab_Wheel_{s:+d}', fb, [(0, -0.025), (0.09, -0.025), (0.095, 0.0), (0.09, 0.025), (0, 0.025)], P(WX + s * 0.23, WY + 0.38, 0.095), rubber, segs=12, rot=(0, D90, 0))
rd('Fab_Axle', fb, P(WX - 0.23, WY + 0.38, 0.095), P(WX + 0.23, WY + 0.38, 0.095), 0.012, steel, verts=6)
for s in (-1, 1):
    cy(f'Fab_Castor_{s:+d}', fb, 0.035, 0.03, P(WX + s * 0.15, WY - 0.25, 0.035), rubber, rot=(0, D90, 0), verts=8)
    bx(f'Fab_CastorFork_{s:+d}', fb, (0.04, 0.05, 0.1), P(WX + s * 0.15, WY - 0.25, 0.1), steel)
sweep('Fab_TrolleyHandle', fb, [P(WX - 0.18, WY + 0.44, 0.19), P(WX - 0.18, WY + 0.46, 1.0), P(WX - 0.1, WY + 0.47, 1.08), P(WX + 0.1, WY + 0.47, 1.08), P(WX + 0.18, WY + 0.46, 1.0), P(WX + 0.18, WY + 0.44, 0.19)], 0.014, dark, segs=6, per_m=8)
bbox('Fab_Welder', fb, (0.34, 0.6, 0.44), P(WX, WY - 0.05, 0.41), blue, bev=0.02)
bbox('Fab_WelderLid', fb, (0.35, 0.36, 0.02), P(WX, WY + 0.05, 0.64), grey, bev=0.006)
cd('Fab_WelderPanel', fb, 0.3, 0.225, P(WX, WY - 0.352, 0.24), glow('Fb_WelderPanel', 'fab_welder', 0.35))
for k, dx in enumerate((-0.07, 0.07)): lathe(f'Fab_Knob_{k}', fb, [(0, 0), (0.024, 0), (0.024, 0.025), (0, 0.03)], P(WX + dx, WY - 0.352, 0.36), black, segs=8, rot=(D90, 0, 0))
lathe('Fab_EuroSocket', fb, [(0, 0), (0.022, 0), (0.022, 0.04), (0, 0.04)], P(WX, WY - 0.352, 0.27), brass, segs=8, rot=(D90, 0, 0))
cd('Fab_GasNote', fb, 0.08, 0.08, P(WX + 0.12, WY - 0.352, 0.53), print_('Fb_NoteGas', 'note_gas', 0.3), rotz=-0.06)
# the bottle on the trolley's back, chained to the handle, regulator and gauges, the gas hose round to the welder
GX, GY, GZ = WX, WY + 0.32, 0.19
lathe('Fab_Bottle', fb, [(0, 0), (0.1, 0), (0.105, 0.02), (0.105, 0.95), (0.08, 1.04), (0.03, 1.08), (0, 1.08)], P(GX, GY, GZ), green, segs=14)
cy('Fab_BottleValve', fb, 0.022, 0.08, P(GX, GY, GZ + 1.12), brass, verts=8)
bx('Fab_Regulator', fb, (0.05, 0.06, 0.06), P(GX, GY - 0.05, GZ + 1.14), brass)
for k, dx in enumerate((-0.045, 0.045)):
    lathe(f'Fab_Gauge_{k}', fb, [(0, 0), (0.032, 0), (0.032, 0.02), (0, 0.022)], P(GX + dx, GY - 0.08, GZ + 1.17), alloy, segs=10, rot=(D90, 0, 0))
sweep('Fab_Chain', fb, [P(GX - 0.18, GY + 0.14, 0.95), P(GX - 0.1, GY - 0.11, 0.94), P(GX + 0.1, GY - 0.11, 0.94), P(GX + 0.18, GY + 0.14, 0.95)], 0.006, steel, segs=4, per_m=10)
sweep('Fab_GasHose', fb, [P(GX, GY - 0.1, GZ + 1.12), P(GX + 0.14, GY - 0.2, GZ + 0.9), P(WX + 0.16, WY + 0.2, 0.6), P(WX + 0.1, WY + 0.15, 0.55)], 0.008, black, segs=5, per_m=8)
# the torch lead from the socket, across the floor, up onto the table, the torch laid by the frame's end
sweep('Fab_TorchLead', fb, [P(WX, WY - 0.39, 0.27), P(WX - 0.05, WY - 0.6, 0.12), P(0.75, -2.2, 0.03), P(0.62, -2.3, 0.4), P(0.6, -2.12, TOPZ + 0.02), P(0.45, -2.0, TOPZ + 0.02)], 0.014, rubber, segs=6, per_m=8)
sweep('Fab_Torch', fb, [P(0.45, -2.0, TOPZ + 0.02), P(0.3, -1.98, TOPZ + 0.025), P(0.22, -1.96, TOPZ + 0.05)], 0.018, black, segs=6, per_m=20)
lathe('Fab_TorchNozzle', fb, [(0.0, 0), (0.016, 0), (0.014, 0.06), (0.0, 0.065)], P(0.22, -1.96, TOPZ + 0.05), brass, segs=8, rot=(0, -1.2, 0))
# the earth lead and clamp on the table's corner
sweep('Fab_EarthLead', fb, [P(WX + 0.1, WY - 0.39, 0.22), P(WX + 0.2, WY - 0.7, 0.05), P(0.75, -2.0, 0.03), P(0.66, -2.08, 0.5), P(0.63, -2.06, TOPZ - 0.04)], 0.012, rubber, segs=5, per_m=8)
bbox('Fab_EarthClamp', fb, (0.04, 0.09, 0.07), P(0.63, -2.06, TOPZ - 0.005), anod := solid_mat('Fb_Copper', (0.55, 0.3, 0.12), 0.4), bev=0.008)

# ================= the vice on the table's end =================
VX, VY = 0.45, -1.2
bbox('Fab_ViceBase', fb, (0.14, 0.14, 0.04), P(VX, VY, TOPZ + 0.02), blue, bev=0.008)
bbox('Fab_ViceBody', fb, (0.1, 0.26, 0.09), P(VX, VY, TOPZ + 0.085), blue, bev=0.012)
for k, dy in enumerate((-0.07, 0.03)): bx(f'Fab_ViceJaw_{k}', fb, (0.14, 0.02, 0.05), P(VX, VY + dy, TOPZ + 0.15), steel)
rd('Fab_ViceScrew', fb, P(VX, VY - 0.13, TOPZ + 0.09), P(VX, VY - 0.2, TOPZ + 0.09), 0.009, bright, verts=6)
rd('Fab_ViceBar', fb, P(VX - 0.09, VY - 0.2, TOPZ + 0.09), P(VX + 0.09, VY - 0.2, TOPZ + 0.09), 0.006, bright, verts=6)

# ================= the weld curtains: PVC on a wheeled frame along the side =================
CX = -1.62
for y in (-0.3, -1.3, -2.3):
    rd(f'Fab_CurtainPost_{y:+.1f}', fb, P(CX, y, 0.08), P(CX, y, 1.9), 0.018, yellow, verts=8)
    bbox(f'Fab_CurtainFoot_{y:+.1f}', fb, (0.5, 0.05, 0.04), P(CX, y, 0.08), yellow, bev=0.005)
    for s in (-1, 1): cy(f'Fab_CurtainCastor_{y:+.1f}{s:+d}', fb, 0.03, 0.025, P(CX + s * 0.22, y, 0.03), rubber, rot=(D90, 0, 0), verts=8)
rd('Fab_CurtainRail', fb, P(CX, -0.3, 1.9), P(CX, -2.3, 1.9), 0.014, yellow, verts=6)
for k in range(6):   # (strips, overlapping, hung off the rail)
    y = -0.47 - k * 0.33; c_ = cd(f'Fab_Curtain_{k}', fb, 0.36, 1.68, P(CX + (0.006 if k % 2 else -0.006), y, 0.2), curtain, rotz=D90)

# ================= tube stock on wall arms, sheet offcuts, the notcher, the bender, the grinder =================
for x in (-1.25, -0.25, 0.75):
    bbox(f'Fab_RackUpright_{x:+.2f}', fb, (0.06, 0.04, 0.85), P(x, -0.02, 1.62), dark, bev=0.006)
    for z in (1.3, 1.7): bbox(f'Fab_RackArm_{x:+.2f}_{z}', fb, (0.04, 0.34, 0.04), P(x, -0.2, z), dark, bev=0.005)
stock = ((1.3, -0.1, 0.0254, 'r'), (1.3, -0.17, 0.019, 'r'), (1.3, -0.24, 0.016, 'r'), (1.3, -0.31, 0.025, 's'),
         (1.7, -0.1, 0.019, 'r'), (1.7, -0.17, 0.0127, 'r'), (1.7, -0.24, 0.02, 's'), (1.7, -0.31, 0.019, 'r'))
for k, (z, y, r, kind) in enumerate(stock):
    zz = z + 0.02 + r
    if kind == 'r': rd(f'Fab_Stock_{k}', fb, P(-1.48, y, zz), P(1.42 - (k % 3) * 0.22, y, zz), r, tube, verts=8)
    else: bbox(f'Fab_Stock_{k}', fb, (2.9 - (k % 3) * 0.22, r * 2, r * 2), P(-0.03 - (k % 3) * 0.11, y, zz), tube, bev=0.003)
for k, (x, t, w, h, m) in enumerate(((0.4, 0.13, 0.55, 0.9, alloy), (0.52, 0.17, 0.45, 0.7, steel), (0.62, 0.21, 0.35, 0.55, alloy))):
    bx(f'Fab_Sheet_{k}', fb, (w, 0.005, h), P(x, -0.06 - k * 0.035 - math.sin(t) * h / 2, math.cos(t) * h / 2), m, rot=(t, 0, 0))
# the tube notcher: a post on a cross foot, the hole saw and its vise, the drill motor
NX, NY = -1.12, -0.48
bbox('Fab_NotcherFoot', fb, (0.4, 0.4, 0.03), P(NX, NY, 0.015), dark, bev=0.005)
rd('Fab_NotcherPost', fb, P(NX, NY, 0.03), P(NX, NY, 0.86), 0.035, dark, verts=10)
bbox('Fab_NotcherHead', fb, (0.12, 0.22, 0.1), P(NX, NY - 0.03, 0.91), yellow, bev=0.01)
lathe('Fab_HoleSaw', fb, [(0, 0), (0.035, 0), (0.035, 0.06), (0.03, 0.06)], P(NX, NY - 0.14, 0.93), bright, segs=10, rot=(D90, 0, 0), cap1=False)
cy('Fab_NotcherMotor', fb, 0.045, 0.2, P(NX, NY + 0.15, 0.93), red, rot=(D90, 0, 0), verts=10)
bbox('Fab_NotcherVise', fb, (0.1, 0.08, 0.06), P(NX, NY - 0.22, 0.89), steel, bev=0.008)
# the ratchet bender: a short pedestal, the die, the lever
BX, BY = -0.32, -0.5
bbox('Fab_BenderFoot', fb, (0.36, 0.36, 0.03), P(BX, BY, 0.015), dark, bev=0.005)
bbox('Fab_BenderPed', fb, (0.12, 0.12, 0.62), P(BX, BY, 0.34), yellow, bev=0.01)
lathe('Fab_BenderDie', fb, [(0, 0), (0.14, 0), (0.14, 0.012), (0.12, 0.022), (0.14, 0.032), (0.14, 0.045), (0, 0.045)], P(BX, BY, 0.65), steel, segs=16)
rd('Fab_BenderLever', fb, P(BX, BY, 0.7), P(BX + 0.56, BY - 0.42, 0.74), 0.016, steel, verts=8)
lathe('Fab_BenderGrip', fb, [(0, 0), (0.022, 0), (0.022, 0.14), (0, 0.14)], P(BX + 0.56, BY - 0.42, 0.74), black, segs=8, rot=(0, D90, -0.64))
# the pedestal grinder
GRX, GRY = 1.38, -0.42
bbox('Fab_GrinderFoot', fb, (0.3, 0.3, 0.025), P(GRX, GRY, 0.0125), grey, bev=0.005)
rd('Fab_GrinderPed', fb, P(GRX, GRY, 0.02), P(GRX, GRY, 0.84), 0.04, grey, verts=10)
cy('Fab_GrinderMotor', fb, 0.08, 0.22, P(GRX, GRY, 0.92), blue, rot=(0, D90, 0), verts=12)
for s in (-1, 1):
    lathe(f'Fab_GrinderWheel_{s:+d}', fb, [(0, 0), (0.09, 0), (0.09, 0.028), (0, 0.028)], P(GRX + s * 0.13, GRY, 0.92), cast, segs=12, rot=(0, s * D90, 0))
    bbox(f'Fab_GrinderGuard_{s:+d}', fb, (0.05, 0.2, 0.1), P(GRX + s * 0.14, GRY + 0.02, 0.99), grey, bev=0.02)
# the fire blanket on the wall, the extinguisher by the trolley, the offcut bin
bbox('Fab_BlanketPouch', fb, (0.26, 0.05, 0.32), P(1.42, -0.03, 1.5), red, bev=0.015)
cd('Fab_BlanketFace', fb, 0.24, 0.3, P(1.42, -0.056, 1.35), print_('Fb_Blanket', 'fab_blanket', 0.35))
lathe('Fab_Extinguisher', fb, [(0, 0), (0.075, 0), (0.075, 0.44), (0.055, 0.5), (0.02, 0.53), (0, 0.53)], P(1.55, -0.95, 0.0), red, segs=12)
sweep('Fab_ExtHose', fb, [P(1.57, -1.0, 0.5), P(1.62, -1.05, 0.35), P(1.6, -1.02, 0.2)], 0.01, black, segs=4, per_m=10)
put('trashcan', fb, P(1.45, -2.3), 0.3, s=0.72, name='Fab_OffcutBin')
for k in range(5):
    a = k * 1.3; rd(f'Fab_Offcut_{k}', fb, P(1.45 + 0.05 * math.cos(a), -2.3 + 0.05 * math.sin(a), 0.25), P(1.45 + 0.09 * math.cos(a + 0.4), -2.3 + 0.09 * math.sin(a + 0.4), 0.85 - k * 0.05), 0.014, tube, verts=6)
put('hammer', fb, P(0.2, -2.0, TOPZ), 1.4, tilt=(D90, 0)); put('tape', fb, P(-1.1, -1.25, TOPZ), 0.0)
put('scrap', fb, P(-0.55, -1.6, 0.273), 0.4)

# ================= light: a lamp on a chain over the table =================
for k, dx in enumerate((-0.25, 0.25)): rd(f'Fab_LampChain_{k}', fb, P(TX + dx, TY, 3.1), P(TX + dx * 0.5, TY, 2.5), 0.006, steel, verts=4)
bbox('Fab_LampHousing', fb, (0.9, 0.18, 0.08), P(TX, TY, 2.46), dark, bev=0.01)
bx('Fab_LampTube', fb, (0.82, 0.05, 0.02), P(TX, TY, 2.415), bulbm)
spot('Light_Fab', fb, P(TX, TY, 2.4), 300, (1.0, 0.9, 0.75), deg=115)

# ================= where people stand =================
empty('STAND_fab', fb, P(TX, -2.5), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='fab')
empty('STAND_any', fb, P(WX, -2.0), rotz=math.pi - 0.4, kind='SINGLE_ARROW', size=0.5, clip='talk', role='any')

if '--noao' not in args:
    print('AO baked on', bake_ao(fb, skip=(chalk, spark, curtain, weldglow)), 'objects')
if not LIVE or '--export' in args: export_station(fb, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'fab-start.blend'))
print('FAB objects', len(fb.all_objects), 'triangles', tris(fb))
