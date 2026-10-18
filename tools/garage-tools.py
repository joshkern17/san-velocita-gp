# The workbench (the home garage's station_tools, "Proper tools"; see docs/GARAGE-KIT.md and
# .claude/skills/garage-station/SKILL.md): a club racer's proper bench, not a table. A steel-framed bench with a thick
# timber top, the vice, the bench grinder, a parts tray, the torque wrench left out; the pegboard behind with its tools
# hung over their painted outlines (two outlines empty: someone's using them); a shelf of parts bins and tins with a
# strip light under it; the red roll cab with a drawer pulled out and a top chest; the air line reel, the calendar,
# the bin. Ambient occlusion baked into the vertex colours.
# One piece for both premises: the lock-up (tools/garage-kit.py SLOT_tools) and the industrial unit
# (tools/garage-unit.py SLOT_tools), so it keeps between x -1.3 and 1.3 (the unit's dyno and fab corners either side)
# and leaves the floor under the bench clear (the lock-up keeps a box there). Hooks as before: STAND_mechanic (lean),
# INTERACT_tools ("The workbench"), Light_Bench.
#   Blender --background --python tools/garage-tools.py -- [--out models/garage/station_tools.glb] [--blend]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_tools.glb')
LIVE = not bpy.app.background

if LIVE:   # (in your Blender: a scene of its own)
    sc = bpy.data.scenes.get('Workbench') or bpy.data.scenes.new('Workbench')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
BUILT.clear()
G.configure(os.path.join(SRC, 'stations_gen'), seed=7731)
if not os.path.exists(os.path.join(ART, 'tools_pegboard.png')) or '--art' in args: subprocess.run(['python3', os.path.join(HERE, 'garage-signs-tools.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2

def rag(name, coll, loc, size, mat, seed):
    # a crumpled rag: a squashed, knocked-about icosphere
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=loc)
    o = bpy.context.active_object; o.name = name; link(o, coll); rng = np.random.default_rng(seed)
    for v in o.data.vertices: v.co = Vector((v.co.x * size[0] * (0.8 + 0.4 * rng.random()), v.co.y * size[1] * (0.8 + 0.4 * rng.random()), max(-0.3, v.co.z) * size[2] * (0.6 + 0.8 * rng.random())))
    while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.materials.append(mat); uv_world(o.data, o.matrix_world, 4.0); return mk(o)

def ring(name, coll, r_in, r_out, t, loc, mat, rot=(D90, 0, 0), segs=10):
    # a flat ring (a spanner's ring end, a washer): faces -Y once turned D90 about X
    return lathe(name, coll, [(r_in, 0), (r_out, 0), (r_out, t), (r_in, t), (r_in, 0)], loc, mat, segs=segs, rot=rot, cap0=False, cap1=False)

# ---------------- materials ----------------
frame = grimy_tile('Tl_Frame', 'painted_metal.png', dirt=0.4, rust=0.2, wear_light=0.2, tint=(0.2, 0.25, 0.3))
steel = grimy_tile('Tl_Steel', 'dark_industrial_metal.png', dirt=0.35, rust=0.3)
chrome = grimy_tile('Tl_Chrome', 'galvanized_metal.png', dirt=0.18, tint=(0.8, 0.81, 0.83))
timber = grimy_tile('Tl_Top', 'wood.png', dirt=0.6, rust=0.0, wear_light=0.25)
redcab = grimy_tile('Tl_Red', 'painted_metal.png', dirt=0.35, rust=0.1, wear_light=0.25, tint=(0.7, 0.07, 0.05))
reddk = grimy_tile('Tl_RedDark', 'painted_metal.png', dirt=0.45, rust=0.1, tint=(0.42, 0.05, 0.04))
vice_blue = grimy_tile('Tl_Vice', 'painted_metal.png', dirt=0.45, rust=0.25, wear_light=0.3, tint=(0.15, 0.3, 0.55))
grinder = grimy_tile('Tl_Grinder', 'painted_metal.png', dirt=0.4, rust=0.1, tint=(0.25, 0.42, 0.3))
yellow = grimy_tile('Tl_Yellow', 'painted_metal.png', dirt=0.45, rust=0.15, wear_light=0.25, tint=(0.85, 0.65, 0.08))
rubber = grimy_tile('Tl_Rubber', 'rubber.png', dirt=0.25)
mat_floor = grimy_tile('Tl_Mat', 'rubber.png', dirt=0.55)
rag_m = grimy_tile('Tl_Rag', 'painted_metal.png', dirt=0.7, tint=(0.62, 0.18, 0.12))
rag_w = grimy_tile('Tl_RagW', 'painted_metal.png', dirt=0.75, tint=(0.75, 0.73, 0.68))
wheel_m = grimy_tile('Tl_Stone', 'concrete_02.png', dirt=0.3, tint=(0.55, 0.52, 0.48))
handle_w = grimy_tile('Tl_Handle', 'weathered_wood.png', dirt=0.4)
peg = art_mat('Tl_Pegboard', A('tools_pegboard'), dirt=0.45)
cal = art_mat('Tl_Calendar', A('tools_calendar'), dirt=0.35)
oil_l = art_mat('Tl_OilLabel', A('tools_oil'), dirt=0.3); brake_l = art_mat('Tl_BrakeLabel', A('tools_brake'), dirt=0.3)
bin_l = art_mat('Tl_BinLabel', A('tools_bin'), dirt=0.4)
blk = solid_mat('Tl_Black', (0.03, 0.03, 0.035), 0.6)
plast_r = solid_mat('Tl_PlasticRed', (0.55, 0.05, 0.04), 0.4); plast_y = solid_mat('Tl_PlasticYel', (0.75, 0.55, 0.05), 0.4)
bins = [grimy_tile(f'Tl_Bin{i}', 'painted_metal.png', dirt=0.35, tint=t) for i, t in enumerate(((0.12, 0.28, 0.6), (0.65, 0.1, 0.07), (0.78, 0.6, 0.07)))]
tube = mat_img('Tl_Tube', None, 0.4, emit=((0.92, 0.96, 1.0), 9.0))

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
tl = collection('station_tools', stations); tl.instance_offset = (0, 0, 0)
P = lambda x, y, z=0.0: Vector((x, y, z))

# ================= the bench: steel frame, timber top =================
BX, BW, BD, TOP = -0.625, 1.35, 0.72, 0.9          # (its middle, width, depth; the top's surface)
FY = -BD - 0.01                                      # (the front edge)
for sx in (-1, 1):
    for y in (-0.06, -0.66):
        bbox(f'Tl_Leg_{sx:+d}_{y:+.2f}', tl, (0.05, 0.05, 0.84), P(BX + sx * 0.625, y, 0.42), frame, bev=0.006)
        bx(f'Tl_Foot_{sx:+d}_{y:+.2f}', tl, (0.09, 0.09, 0.01), P(BX + sx * 0.625, y, 0.005), steel)
    bbox(f'Tl_SideRail_{sx:+d}', tl, (0.04, 0.62, 0.05), P(BX + sx * 0.625, -0.36, 0.81), frame, bev=0.005)
    bbox(f'Tl_SideLow_{sx:+d}', tl, (0.03, 0.62, 0.03), P(BX + sx * 0.625, -0.36, 0.14), frame, bev=0.004)
for y in (-0.06, -0.66): bbox(f'Tl_Rail_{y:+.2f}', tl, (1.26, 0.04, 0.05), P(BX, y, 0.81), frame, bev=0.005)
bbox('Tl_BackLow', tl, (1.26, 0.03, 0.03), P(BX, -0.06, 0.14), frame, bev=0.004)
top = bbox('Tl_Top', tl, (BW + 0.03, BD + 0.02, 0.06), P(BX, -0.36, TOP - 0.03), timber, bev=0.01); grid_out(top, 0.3)
bx('Tl_TopEdge', tl, (BW + 0.03, 0.012, 0.06), P(BX, FY - 0.006, TOP - 0.03), steel)
# the vice, bolted at the front left corner: base, body, the jaws, the screw and its tommy bar
VX, VY = BX - 0.5, FY + 0.12
bbox('Tl_ViceBase', tl, (0.16, 0.14, 0.03), P(VX, VY, TOP + 0.015), vice_blue, bev=0.006)
bbox('Tl_ViceBody', tl, (0.12, 0.2, 0.08), P(VX, VY - 0.02, TOP + 0.07), vice_blue, bev=0.012)
bbox('Tl_ViceJawFixed', tl, (0.15, 0.04, 0.06), P(VX, VY + 0.07, TOP + 0.14), vice_blue, bev=0.008)
bbox('Tl_ViceJawMove', tl, (0.15, 0.04, 0.06), P(VX, VY - 0.06, TOP + 0.14), vice_blue, bev=0.008)
for y in (VY + 0.045, VY - 0.035): bx(f'Tl_ViceFace_{y:+.3f}', tl, (0.14, 0.008, 0.045), P(VX, y, TOP + 0.15), steel)
rd('Tl_ViceScrew', tl, P(VX, VY - 0.08, TOP + 0.1), P(VX, VY - 0.2, TOP + 0.1), 0.012, chrome, verts=8)
rd('Tl_ViceBar', tl, P(VX - 0.11, VY - 0.2, TOP + 0.1), P(VX + 0.11, VY - 0.2, TOP + 0.1), 0.007, chrome, verts=6)
for s in (-1, 1): lathe(f'Tl_ViceKnob_{s:+d}', tl, [(0, 0), (0.014, 0.005), (0.014, 0.02), (0, 0.025)], P(VX + s * 0.11, VY - 0.2, TOP + 0.1), chrome, segs=8, rot=(0, s * D90, 0))
# the bench grinder at the back right: motor, two wheels in their guards, tool rests, the switch
GX, GY = BX + 0.45, -0.22
bbox('Tl_GrindBase', tl, (0.18, 0.14, 0.05), P(GX, GY, TOP + 0.025), grinder, bev=0.01)
lathe('Tl_GrindMotor', tl, [(0, 0), (0.07, 0), (0.075, 0.02), (0.075, 0.18), (0.07, 0.2), (0, 0.2)], P(GX - 0.1, GY, TOP + 0.13), grinder, segs=12, rot=(0, D90, 0))
for s in (-1, 1):
    wx = GX + s * 0.16
    lathe(f'Tl_GrindWheel_{s:+d}', tl, [(0, 0), (0.07, 0), (0.07, 0.025), (0, 0.025)], P(wx - 0.0125, GY, TOP + 0.13), wheel_m, segs=12, rot=(0, D90, 0))
    lathe(f'Tl_GrindGuard_{s:+d}', tl, [(0.082, 0), (0.082, 0.04)], P(wx - 0.02, GY, TOP + 0.13), grinder, segs=12, rot=(0, D90, 0), cap0=False, cap1=False)
    bx(f'Tl_GrindRest_{s:+d}', tl, (0.04, 0.05, 0.008), P(wx, GY - 0.09, TOP + 0.09), steel)
bx('Tl_GrindSwitch', tl, (0.03, 0.01, 0.025), P(GX, GY - 0.075, TOP + 0.04), plast_y)
# on the top: the parts tray of bolts, the torque wrench left out, a rag, a can of brake cleaner
TX, TY = BX - 0.08, FY + 0.27
bx('Tl_TrayBase', tl, (0.3, 0.2, 0.008), P(TX, TY, TOP + 0.004), steel)
for k, (dx, dy, w, d) in enumerate(((0, 0.1, 0.3, 0.008), (0, -0.1, 0.3, 0.008), (0.15, 0, 0.008, 0.2), (-0.15, 0, 0.008, 0.2))):
    bx(f'Tl_TrayWall_{k}', tl, (w, d, 0.03), P(TX + dx, TY + dy, TOP + 0.019), steel)
rng = np.random.default_rng(5)
for k in range(9):
    x, y = TX + rng.uniform(-0.12, 0.12), TY + rng.uniform(-0.08, 0.08); a = rng.uniform(0, math.pi)
    cy(f'Tl_Bolt_{k}', tl, 0.009, 0.05, P(x, y, TOP + 0.017), chrome, rot=(D90, 0, a), verts=6)
rd('Tl_TorqueBar', tl, P(BX + 0.05, FY + 0.13, TOP + 0.012), P(BX + 0.47, FY + 0.1, TOP + 0.012), 0.011, chrome, verts=8)
bbox('Tl_TorqueHead', tl, (0.05, 0.035, 0.022), P(BX + 0.03, FY + 0.131, TOP + 0.012), chrome, bev=0.006)
lathe('Tl_TorqueGrip', tl, [(0, 0), (0.016, 0.004), (0.016, 0.1), (0, 0.105)], P(BX + 0.47, FY + 0.1, TOP + 0.012), blk, segs=8, rot=(0, D90, -0.07))
rag('Tl_RagBench', tl, P(BX + 0.2, FY + 0.32, TOP + 0.012), (0.09, 0.07, 0.025), rag_m, 1)
lathe('Tl_CleanerCan', tl, [(0, 0), (0.033, 0), (0.033, 0.2), (0.022, 0.22), (0.01, 0.235), (0, 0.235)], P(BX + 0.58, -0.45, TOP), plast_r, segs=10)

# ================= the pegboard, its tools on their outlines; the shelf over it, its strip light =================
PZ0, PZ1, PY = 0.98, 1.93, -0.02
PH = PZ1 - PZ0
bx('Tl_PegBack', tl, (BW, 0.012, PH), P(BX, PY + 0.006, (PZ0 + PZ1) / 2), handle_w)
cd('Tl_Pegboard', tl, BW, PH, P(BX, PY - 0.001, PZ0), peg)
for z in (PZ0 - 0.01, PZ1 + 0.01): bx(f'Tl_PegFrameH_{z:.2f}', tl, (BW + 0.04, 0.025, 0.025), P(BX, PY - 0.006, z), frame)
for sx in (-1, 1): bx(f'Tl_PegFrameV_{sx:+d}', tl, (0.025, 0.025, PH + 0.04), P(BX + sx * (BW / 2 + 0.008), PY - 0.006, (PZ0 + PZ1) / 2), frame)
# art pixel (512 x 384 over the board) -> where on the board, just in front of it
px = lambda u, v, dy=0.0: P(BX - BW / 2 + u / 512 * BW, PY - 0.01 - dy, PZ1 - v / 384 * PH)
# spanners: six outlines, four hung (the 3rd and 5th are out)
for i in range(6):
    if i in (2, 4): continue
    u = 30 + i * 22; L = (70 + i * 8) / 384 * PH; rr = (7 + i) / 512 * BW
    top_ = px(u, 38); rd(f'Tl_Spanner_{i}', tl, top_ - Vector((0, 0, rr)), top_ - Vector((0, 0, L)), 0.006 + i * 0.0008, chrome, verts=4)
    ring(f'Tl_SpannerRing_{i}', tl, rr * 0.55, rr, 0.008, top_ + Vector((0, 0.004, 0)), chrome, segs=8)
    rd(f'Tl_SpannerPeg_{i}', tl, top_ + Vector((0, 0.01, rr * 0.3)), top_ + Vector((0, -0.02, rr * 0.3)), 0.003, steel, verts=4)
# screwdrivers: four outlines, three hung
for i in range(4):
    if i == 1: continue
    u = 190 + i * 22; top_ = px(u, 36); hz = 44 / 384 * PH; sz = 70 / 384 * PH
    lathe(f'Tl_DriverGrip_{i}', tl, [(0.0, 0.0), (0.012, 0.005), (0.014, hz - 0.01), (0.008, hz), (0, hz)], top_ - Vector((0, 0, hz)), plast_y if i % 2 else plast_r, segs=8)
    rd(f'Tl_DriverShaft_{i}', tl, top_ - Vector((0, 0, hz)), top_ - Vector((0, 0, hz + sz)), 0.0035, chrome, verts=4)
# the hammer, the pliers
h0 = px(320, 51); bbox('Tl_HammerHead', tl, (0.14, 0.035, 0.035), h0, steel, bev=0.006)
bbox('Tl_HammerShaft', tl, (0.022, 0.018, 0.27), h0 - Vector((0, 0, 0.15)), handle_w, bev=0.004)
p0 = px(400, 80)
for s in (-1, 1):
    bbox(f'Tl_PliersJaw_{s:+d}', tl, (0.012, 0.01, 0.11), p0 + Vector((s * 0.008, 0, 0.04)), steel, rot=(0, s * 0.12, 0), bev=0.003)
    bbox(f'Tl_PliersGrip_{s:+d}', tl, (0.016, 0.014, 0.13), p0 + Vector((s * 0.025, 0, -0.08)), plast_r, rot=(0, -s * 0.2, 0), bev=0.004)
# the socket rail: eight of ten on it
r0, r1 = px(40, 227), px(300, 227); bbox('Tl_SocketRail', tl, ((r1 - r0).x, 0.02, 0.02), (r0 + r1) / 2, steel, bev=0.004)
for i in range(10):
    if i in (3, 7): continue
    c = px(52 + i * 24, 246, 0.005); r = (6 + i * 0.7) / 512 * BW
    lathe(f'Tl_Socket_{i}', tl, [(0, 0), (r, 0), (r, 0.045), (r * 0.7, 0.045)], c + Vector((0, 0, -0.01)), chrome, segs=8, rot=(D90, 0, 0), cap1=False)
# (the torque wrench's outline is empty: it's out on the bench)
# the shelf: steel, on two brackets; parts bins with their labels, oil and brake fluid, a spray can
SZ, SD = 2.02, 0.3
bbox('Tl_Shelf', tl, (BW + 0.03, SD, 0.025), P(BX, -SD / 2 - 0.01, SZ), steel, bev=0.005)
bx('Tl_ShelfLip', tl, (BW + 0.03, 0.01, 0.04), P(BX, -SD - 0.01, SZ + 0.02), steel)
for sx in (-1, 1):
    bx(f'Tl_Bracket_{sx:+d}', tl, (0.025, 0.02, 0.2), P(BX + sx * 0.6, -0.015, SZ - 0.11), frame)
    beam(f'Tl_BracketStrut_{sx:+d}', tl, P(BX + sx * 0.6, -0.02, SZ - 0.2), P(BX + sx * 0.6, -SD + 0.02, SZ - 0.015), 0.02, 0.02, frame); mk(bpy.data.objects[f'Tl_BracketStrut_{sx:+d}'])
S0 = SZ + 0.0125
for i, (x, m) in enumerate(((BX - 0.5, bins[0]), (BX - 0.33, bins[1]), (BX - 0.16, bins[2]))):
    w, d, h = 0.15, 0.24, 0.13
    bx(f'Tl_BinBottom_{i}', tl, (w, d, 0.008), P(x, -0.15, S0 + 0.004), m)
    for sxx in (-1, 1): bx(f'Tl_BinSide_{i}_{sxx:+d}', tl, (0.008, d, h), P(x + sxx * w / 2, -0.15, S0 + h / 2), m)
    bx(f'Tl_BinBack_{i}', tl, (w, 0.008, h), P(x, -0.03, S0 + h / 2), m)
    bx(f'Tl_BinFront_{i}', tl, (w, 0.008, h * 0.6), P(x, -0.27, S0 + h * 0.3), m)
    cd(f'Tl_BinLabel_{i}', tl, 0.1, 0.037, P(x, -0.2755, S0 + 0.02), bin_l)
    for k in range(4): cy(f'Tl_BinPart_{i}_{k}', tl, 0.011, 0.04, P(x - 0.04 + k * 0.027, -0.13 + (k % 2) * 0.05, S0 + 0.013), chrome, rot=(D90, 0, k * 0.7), verts=6)
for k, (x, lab) in enumerate(((BX + 0.08, oil_l), (BX + 0.22, oil_l), (BX + 0.38, brake_l))):
    r, h = (0.06, 0.2) if lab is oil_l else (0.045, 0.16)
    lathe(f'Tl_TinBody_{k}', tl, [(r, 0), (r, h)], P(x, -0.15, S0), lab, segs=10, cap0=False, cap1=False, rot=(0, 0, -D90 + 0.3 * k))
    lathe(f'Tl_TinCap_{k}', tl, [(0, 0), (r, 0)], P(x, -0.15, S0 + 0.001), steel, segs=10, cap0=False)
    lathe(f'Tl_TinTop_{k}', tl, [(r, 0), (r * 0.8, 0.015), (0.016, 0.02), (0.016, 0.04), (0, 0.04)], P(x, -0.15, S0 + h), steel if lab is oil_l else plast_y, segs=10, cap0=False)
lathe('Tl_SprayCan', tl, [(0, 0), (0.03, 0), (0.03, 0.17), (0.02, 0.19), (0.008, 0.2), (0, 0.2)], P(BX + 0.52, -0.12, S0), plast_y, segs=8)
# the strip light under the shelf, lighting the board and the bench
bbox('Tl_StripHousing', tl, (1.0, 0.07, 0.04), P(BX, -0.2, SZ - 0.035), chrome, bev=0.006)
bx('Tl_StripTube', tl, (0.92, 0.03, 0.012), P(BX, -0.2, SZ - 0.06), tube)
bulb('Light_Bench', tl, P(BX, -0.35, SZ - 0.15), 150, (0.95, 0.95, 1.0))

# ================= the roll cab: red, castors, six drawers (the third pulled out), a top chest =================
CX, CW, CD = 0.5, 0.7, 0.48
CY0 = -0.09 - CD / 2                                 # (its back 9 cm off the wall: a broom leans there in the unit)
for sx in (-1, 1):
    for sy in (-1, 1):
        cx_, cy_ = CX + sx * (CW / 2 - 0.05), CY0 + sy * (CD / 2 - 0.05)
        bx(f'Tl_CastorPlate_{sx:+d}{sy:+d}', tl, (0.06, 0.06, 0.01), P(cx_, cy_, 0.07), steel)
        cy(f'Tl_Castor_{sx:+d}{sy:+d}', tl, 0.035, 0.025, P(cx_, cy_, 0.035), rubber, rot=(0, D90, 0), verts=8)
        bx(f'Tl_CastorFork_{sx:+d}{sy:+d}', tl, (0.035, 0.04, 0.04), P(cx_, cy_, 0.05), steel)
CZ0, CZ1 = 0.075, 1.0
bbox('Tl_Cab', tl, (CW, CD, CZ1 - CZ0), P(CX, CY0, (CZ0 + CZ1) / 2), redcab, bev=0.012)
bbox('Tl_CabTop', tl, (CW + 0.02, CD + 0.02, 0.02), P(CX, CY0, CZ1 + 0.01), rubber, bev=0.004)
FRONT = CY0 - CD / 2
dz = [(0.1, 0.12), (0.24, 0.12), (0.38, 0.12), (0.52, 0.12), (0.66, 0.12), (0.8, 0.16)]
for k, (z0, h) in enumerate(dz):
    pulled = 0.24 if k == 2 else 0.0; zc = CZ0 + z0 + h / 2 - 0.02
    bbox(f'Tl_Drawer_{k}', tl, (CW - 0.06, 0.014, h - 0.014), P(CX, FRONT - 0.007 - pulled, zc), reddk, bev=0.004)
    rd(f'Tl_DrawerPull_{k}', tl, P(CX - 0.25, FRONT - 0.024 - pulled, zc + h / 2 - 0.03), P(CX + 0.25, FRONT - 0.024 - pulled, zc + h / 2 - 0.03), 0.007, chrome, verts=6)
    if pulled:   # (its box out of the cab: sides, a bottom with foam, sockets and spanners in it)
        for sx in (-1, 1): bx(f'Tl_DrawerSide_{sx:+d}', tl, (0.01, pulled + 0.02, h - 0.03), P(CX + sx * (CW / 2 - 0.045), FRONT - pulled / 2, zc - 0.005), steel)
        bx('Tl_DrawerFloor', tl, (CW - 0.1, pulled + 0.02, 0.01), P(CX, FRONT - pulled / 2, zc - h / 2 + 0.02), blk)
        for i in range(7): lathe(f'Tl_DrawerSocket_{i}', tl, [(0, 0), (0.012 + i * 0.0015, 0), (0.012 + i * 0.0015, 0.04), (0.008 + i * 0.001, 0.04)], P(CX - 0.24 + i * 0.065, FRONT - 0.14, zc - h / 2 + 0.025), chrome, segs=8, cap1=False)
        for i in range(3): bx(f'Tl_DrawerSpanner_{i}', tl, (0.022, 0.2, 0.006), P(CX - 0.06 + i * 0.06, FRONT - 0.13, zc - h / 2 + 0.03), chrome, rot=(0, 0, 0.1 * i))
# the top chest: a smaller box with its own drawers and a lid
TZ0 = CZ1 + 0.02
bbox('Tl_Chest', tl, (CW - 0.02, CD - 0.08, 0.3), P(CX, CY0 + 0.03, TZ0 + 0.15), redcab, bev=0.012)
for k in range(3):
    bbox(f'Tl_ChestDrawer_{k}', tl, (CW - 0.08, 0.012, 0.07), P(CX, CY0 + 0.03 - (CD - 0.08) / 2 - 0.006, TZ0 + 0.05 + k * 0.08), reddk, bev=0.003)
    rd(f'Tl_ChestPull_{k}', tl, P(CX - 0.18, CY0 + 0.03 - (CD - 0.08) / 2 - 0.02, TZ0 + 0.07 + k * 0.08), P(CX + 0.18, CY0 + 0.03 - (CD - 0.08) / 2 - 0.02, TZ0 + 0.07 + k * 0.08), 0.005, chrome, verts=6)
bbox('Tl_ChestLid', tl, (CW - 0.01, CD - 0.07, 0.04), P(CX, CY0 + 0.03, TZ0 + 0.32), redcab, bev=0.012)
for sx in (-1, 1): bbox(f'Tl_ChestHandle_{sx:+d}', tl, (0.02, 0.14, 0.03), P(CX + sx * (CW / 2 + 0.005), CY0 + 0.03, TZ0 + 0.22), chrome, bev=0.004)
rag('Tl_RagCab', tl, P(CX + 0.18, CY0 - 0.05, TZ0 + 0.35), (0.08, 0.07, 0.02), rag_w, 2)

# ================= the wall to the right: the air line reel, the calendar; the bin =================
RX, RZ = 1.02, 1.85
bbox('Tl_ReelBracket', tl, (0.08, 0.1, 0.26), P(RX + 0.16, -0.05, RZ), steel, bev=0.006)
lathe('Tl_ReelDrum', tl, [(0.05, 0), (0.17, 0), (0.17, 0.012), (0.08, 0.012), (0.08, 0.1), (0.17, 0.1), (0.17, 0.112), (0.05, 0.112)], P(RX + 0.11, -0.12, RZ), yellow, segs=14, rot=(0, -D90, 0), cap0=False, cap1=False)
lathe('Tl_ReelHose', tl, [(0.08, 0), (0.13, 0), (0.13, 0.085), (0.08, 0.085)], P(RX + 0.1, -0.12, RZ), blk, segs=14, rot=(0, -D90, 0), cap0=False, cap1=False)
sweep('Tl_AirHose', tl, [P(RX - 0.02, -0.12, RZ - 0.12), P(RX - 0.04, -0.13, RZ - 0.4), P(RX - 0.06, -0.12, 1.05), P(RX - 0.08, -0.06, 0.92)], 0.008, blk, segs=5, per_m=6)
lathe('Tl_AirCoupler', tl, [(0, 0), (0.012, 0), (0.014, 0.03), (0.01, 0.05), (0, 0.05)], P(RX - 0.08, -0.06, 0.87), chrome, segs=8)
bx('Tl_AirHook', tl, (0.03, 0.06, 0.012), P(RX - 0.08, -0.03, 0.92), steel)
cd('Tl_Calendar', tl, 0.19, 0.253, P(1.17, -0.006, 1.0), cal, rotz=0.02)
bx('Tl_CalendarNail', tl, (0.008, 0.012, 0.008), P(1.17, -0.008, 1.26), steel)
lathe('Tl_Bin', tl, [(0, 0.0), (0.15, 0.0), (0.17, 0.44), (0.175, 0.45), (0.165, 0.45), (0.145, 0.02), (0, 0.02)], P(1.05, -0.32, 0), steel, segs=12)
rag('Tl_RagBin', tl, P(1.05, -0.32, 0.44), (0.12, 0.11, 0.05), rag_m, 3)
rag('Tl_RagBin2', tl, P(1.08, -0.36, 0.47), (0.07, 0.06, 0.04), rag_w, 4)
# a rubber mat to stand on in front of the bench
m = bx('Tl_FloorMat', tl, (1.2, 0.55, 0.012), P(BX, FY - 0.3, 0.006), mat_floor); grid_out(m, 0.3)

# ================= hooks =================
empty('STAND_mechanic', tl, P(BX - 0.12, FY - 0.42), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='lean', role='mechanic')
empty('INTERACT_tools', tl, P(BX, FY - 0.3, 1.1), kind='SPHERE', size=0.25, label='The workbench')

if '--noao' not in args:
    print('AO baked on', bake_ao(tl), 'objects')
if not LIVE or '--export' in args: export_station(tl, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'tools-start.blend'))
print('TOOLS objects', len(tl.all_objects), 'triangles', tris(tl))
