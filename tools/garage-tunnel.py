# The Factory's wind tunnels (home-garage stations, see docs/GARAGE-KIT.md and .claude/skills/garage-station):
#   station_tunnel2 "Own wind tunnel": a closed-circuit tunnel in the factory's tunnel hall, round SLOT_tunnel2 (its
#     origin the test section's middle, on the floor; not against a wall). A horizontal loop, so it fits under the
#     control pod (nothing above 4 m over the hall's front): the settling chamber across the front with its screens,
#     the contraction into the test section (glass sides, a turntable, a rolling road on its rollers, the 60% model on
#     its strut from the balance on the roof), the diffuser, the back corner, the return leg with the fan can and its
#     porthole (the blades through the glass) running back to the settling chamber. Every duct a closed solid with
#     flanges and bolts; inside the test section its throats in honeycomb. The light rig over it, the cable tray, the
#     drive cabinets, the access door. In use (BUSY_tunnel2_): the road's streaks, the smoke wand, the screen on;
#     idle (IDLE_tunnel2_): a cover over the model, the screen off.
#   station_tunnel "Wind tunnel time" (rented elsewhere): the model shop corner at SLOT_tunnel, its back to the hall's
#     back wall: the 60% model home in its shipping crate (lid off, leaning), the parts rack with spare wings and floors
#     in labelled bins, the SLA machine that prints them, a laptop on a stand.
#   Blender --background --python tools/garage-tunnel.py -- [--blend] [--noao]
#     -> models/garage/station_tunnel2.glb, station_tunnel.glb (--blend: models/garage/tunnel-start.blend, to look at)
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=6060)
if not os.path.exists(os.path.join(ART, 'tn_smoke.png')): subprocess.run(['/usr/local/bin/python3', os.path.join(HERE, 'garage-signs-tunnel.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
P = lambda x, y, z=0.0: Vector((x, y, z))

# ---------------- materials ----------------
duct = plain_mat('Tn_Duct', (0.74, 0.76, 0.78), dirt=0.1)        # (light grey painted steel: smooth paint, the metal tiles' blotches read as camouflage this big)
duct_dk = plain_mat('Tn_DuctDark', (0.24, 0.26, 0.29), dirt=0.08)
steel = grimy_tile('Tn_Steel', 'dark_industrial_metal.png', dirt=0.2, rust=0.05)
frame = grimy_tile('Tn_Frame', 'painted_metal.png', dirt=0.1, tint=(0.14, 0.15, 0.17))
alloy = grimy_tile('Tn_Alloy', 'galvanized_metal.png', dirt=0.1)
tread = grimy_tile('Tn_Tread', 'metal_plate_02.png', dirt=0.25, tint=(0.5, 0.52, 0.55))
yellow = grimy_tile('Tn_Yellow', 'painted_metal.png', dirt=0.15, tint=(0.88, 0.68, 0.08))
hazard = grimy_tile('Tn_Hazard', 'hazard_stripes_01.png', dirt=0.2)
rubber = grimy_tile('Tn_Rubber', 'rubber.png', dirt=0.06)
# the honeycomb in the throats: dark hexes
n = 64; yy, xx = np.mgrid[0:n, 0:n]; hexes = ((np.abs(((xx + (yy // 6 % 2) * 3) % 6) - 3) < 1) | (yy % 6 == 0)).astype(np.float32)
honey = mat_img('Tn_Honeycomb', px_tex('Tn_Honeycomb', np.stack([0.08 + 0.2 * hexes] * 3, -1)), 0.5)
belt = mat_img('Tn_Belt', px_tex('Tn_Belt', np.stack([0.12 + 0.04 * (np.arange(64)[:, None] % 8 < 1) * np.ones((64, 16))] * 3, -1)), 0.4)
glass = solid_mat('Tn_Glass', (0.45, 0.6, 0.66), 0.05)
glass.surface_render_method = 'BLENDED'; glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.12
model_w = plain_mat('Tn_ModelWhite', (0.86, 0.87, 0.86), dirt=0.04, rough=0.4)
carbon = mat_img('Tn_Carbon', px_tex('Tn_Carbon', np.stack([0.07 + 0.05 * (((xx // 2) + (yy // 2)) % 2)] * 3, -1).astype(np.float32)), 0.4)
canvas = plain_mat('Tn_Cover', (0.42, 0.44, 0.46), dirt=0.1, rough=0.95)
blackm = plain_mat('Tn_Black', (0.04, 0.04, 0.045), dirt=0.02)
lamp = mat_img('Tn_Lamp', None, 0.4, emit=((0.95, 0.97, 1.0), 6.0))
streak = mat_img('Tn_Streak', None, 0.4, emit=((0.35, 0.7, 1.0), 3.0))
screen_off = plain_mat('Tn_ScreenOff', (0.02, 0.03, 0.03), dirt=0.0, rough=0.3)
redm = plain_mat('Tn_Red', (0.7, 0.06, 0.05), dirt=0.05)
greenm = mat_img('Tn_Green', None, 0.4, emit=((0.2, 0.9, 0.3), 3.0))
def glow(name, png, k=1.4): return art_mat(name, A(png), dirt=0.04, emit=k, rough=0.3)
def print_(name, png, d=0.15): return art_mat(name, A(png), dirt=d)

# ---------------- shapes ----------------
def rduct(name, coll, axis, secs, mat):
    # a rectangular duct, closed: sections [(s along the axis, c across, w, z0, h)], its ends capped. axis 'y' or 'x'
    vs, fs = [], []
    for (s, c, w, z0, h) in secs:
        for (a, z) in ((c - w / 2, z0), (c + w / 2, z0), (c + w / 2, z0 + h), (c - w / 2, z0 + h)):
            vs.append((a, s, z) if axis == 'y' else (s, a, z))
    for i in range(len(secs) - 1):
        for k in range(4): a0, a1 = i * 4 + k, i * 4 + (k + 1) % 4; fs.append((a0, a1, a1 + 4, a0 + 4))
    fs.append((3, 2, 1, 0)); L = (len(secs) - 1) * 4; fs.append((L, L + 1, L + 2, L + 3))
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    uv_world(me, Matrix.Identity(4), 0.5); o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return mk(o)
def flange(name, coll, axis, s, c, w, z0, h, mat=frame, t=0.06, lip=0.07, bolts=True):
    # a flanged joint round a duct: a frame proud of it, bolts round it
    for k, (dw, dz, ww, hh) in enumerate(((0, -lip / 2, w + 2 * lip, lip), (0, h + lip / 2, w + 2 * lip, lip), (-(w + lip) / 2, h / 2, lip, h), ((w + lip) / 2, h / 2, lip, h))):
        loc = (c + dw, s, z0 + dz) if axis == 'y' else (s, c + dw, z0 + dz); size = (ww, t, hh) if axis == 'y' else (t, ww, hh)
        bx(f'{name}_{k}', coll, size, loc, mat)
    if not bolts: return
    for j in range(int((w + h) * 2 / 0.35)):
        u = j * 0.35; edge = 0 if u < w else 1 if u < w + h else 2 if u < 2 * w + h else 3
        if edge == 0: a, z = c - w / 2 + u, z0 - lip / 2
        elif edge == 1: a, z = c + w / 2 + lip / 2, z0 + (u - w)
        elif edge == 2: a, z = c + w / 2 - (u - w - h), z0 + h + lip / 2
        else: a, z = c - w / 2 - lip / 2, z0 + h - (u - 2 * w - h)
        loc = (a, s, z) if axis == 'y' else (s, a, z)
        cy(f'{name}_Bolt{j}', coll, 0.018, t + 0.03, loc, steel, rot=((D90, 0, 0) if axis == 'y' else (0, D90, 0)), verts=6)
def prism(name, coll, pts, z0, z1, mat):   # a closed extrusion of a plan outline [(x, y)] from z0 to z1
    n_ = len(pts); vs = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    fs = [tuple(range(n_ - 1, -1, -1)), tuple(range(n_, 2 * n_))] + [(k, (k + 1) % n_, n_ + (k + 1) % n_, n_ + k) for k in range(n_)]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    uv_world(me, Matrix.Identity(4), 0.5); o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return mk(o)

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
tn = collection('station_tunnel2', stations); tn.instance_offset = (0, 0, 0)

# ================= the circuit (numbers in the station's frame: the test section's middle at the origin) =================
TSX, TS0, TS1, TSH = 1.5, -2.6, 1.4, 2.35            # (the test section: half width outside, its ends in y, its height)
SC0, SC1, SCX0, SCX1, SCH = -6.7, -4.8, -2.6, 4.2, 3.7   # (the settling chamber across the front: y, x, height)
RX, RW, RZ0, RH = 3.0, 2.2, 0.25, 2.4                # (the return leg: its middle in x, width, bottom, height)
BK0, BK1 = 2.4, 3.2                                   # (the back corner, y)
# the settling chamber: a big box across the front, its screens' access hatches on top, standing on a plinth
rduct('Tn_Settling', tn, 'y', [(SC0, (SCX0 + SCX1) / 2, SCX1 - SCX0, 0.1, SCH), (SC1, (SCX0 + SCX1) / 2, SCX1 - SCX0, 0.1, SCH)], duct)
bx('Tn_Settling_Plinth', tn, (SCX1 - SCX0 + 0.1, SC1 - SC0 + 0.1, 0.1), ((SCX0 + SCX1) / 2, (SC0 + SC1) / 2, 0.05), frame)
for k, y in enumerate((SC0 + 0.5, SC0 + 1.0, SC0 + 1.45)):   # (the screens' frames, seen as ribs round it)
    bbox(f'Tn_Settling_Rib{k}', tn, (SCX1 - SCX0 + 0.08, 0.08, 0.06), ((SCX0 + SCX1) / 2, y, SCH + 0.13), frame, bev=0.01)
    for s, x in ((-1, SCX0 - 0.03), (1, SCX1 + 0.03)): bx(f'Tn_Settling_RibS{k}{s}', tn, (0.06, 0.08, SCH), (x, y, 0.1 + SCH / 2), frame)
for k, x in enumerate((-1.6, 0.6, 2.8)):   # (hatches on the roof, their handles)
    bbox(f'Tn_Hatch{k}', tn, (0.9, 0.7, 0.04), (x, (SC0 + SC1) / 2, SCH + 0.12), duct_dk, bev=0.01)
    rd(f'Tn_HatchHandle{k}', tn, P(x - 0.2, (SC0 + SC1) / 2 + 0.3, SCH + 0.16), P(x + 0.2, (SC0 + SC1) / 2 + 0.3, SCH + 0.16), 0.012, steel, verts=5)
flange('Tn_Fl_SettlingFront', tn, 'y', SC0, (SCX0 + SCX1) / 2, SCX1 - SCX0, 0.1, SCH)
flange('Tn_Fl_SettlingBack', tn, 'y', SC1, (SCX0 + SCX1) / 2, SCX1 - SCX0, 0.1, SCH)
cd('Tn_Sign_Front', tn, 2.4, 0.6, (-0.4, SC0 - 0.07, 2.6), print_('Tn_Sign', 'tn_sign'), rotz=0.0)   # (on its front, to the walkway's door)
for k in range(9):   # (the settling chamber's front: vertical stiffeners, a band at mid height)
    x = SCX0 + 0.35 + k * (SCX1 - SCX0 - 0.7) / 8
    if -1.6 < x < 0.8: continue   # (the sign's there)
    bbox(f'Tn_SettlingStiff{k}', tn, (0.08, 0.1, SCH - 0.3), (x, SC0 - 0.05, 0.1 + SCH / 2), duct, bev=0.01)
bbox('Tn_SettlingBand', tn, (SCX1 - SCX0, 0.08, 0.12), ((SCX0 + SCX1) / 2, SC0 - 0.04, 1.2), duct_dk, bev=0.01)
# the contraction: the settling chamber's back face narrowing into the test section
rduct('Tn_Contraction', tn, 'y', [(SC1, 0.0, 5.0, 0.1, 3.4), (-4.0, 0.0, 4.2, 0.1, 3.0), (-3.2, 0.0, 3.3, 0.1, 2.5), (TS0, 0.0, 2 * TSX + 0.1, 0.0, TSH)], duct)
flange('Tn_Fl_ContrIn', tn, 'y', TS0 - 0.03, 0.0, 2 * TSX + 0.1, 0.0, TSH, bolts=False)
# the test section: a steel frame with glass sides, the roof plate with the balance, the floor with the turntable and road
for x in (-TSX, TSX):
    for y in (TS0, TS1): bbox(f'Tn_TS_Post{x:+.0f}{y:+.0f}', tn, (0.12, 0.12, TSH), (x, y, TSH / 2), frame, bev=0.01)
    for z in (0.06, TSH - 0.06): bx(f'Tn_TS_Rail{x:+.0f}{z:.1f}', tn, (0.1, TS1 - TS0, 0.12), (x, (TS0 + TS1) / 2, z), frame)
    bx(f'Tn_TS_Glass{x:+.0f}', tn, (0.03, TS1 - TS0 - 0.12, TSH - 0.24), (x, (TS0 + TS1) / 2, TSH / 2), glass)
    bx(f'Tn_TS_Mid{x:+.0f}', tn, (0.08, 0.08, TSH - 0.24), (x, (TS0 + TS1) / 2, TSH / 2), frame)
bbox('Tn_TS_Roof', tn, (2 * TSX + 0.12, TS1 - TS0 + 0.1, 0.16), (0, (TS0 + TS1) / 2, TSH + 0.08), duct, bev=0.015)
bx('Tn_TS_RoofIn', tn, (2 * TSX - 0.1, TS1 - TS0 - 0.1, 0.02), (0, (TS0 + TS1) / 2, TSH - 0.01), duct_dk)   # (the ceiling seen inside)
bx('Tn_TS_Floor', tn, (2 * TSX - 0.1, TS1 - TS0 - 0.05, 0.05), (0, (TS0 + TS1) / 2, 0.025), duct_dk)
cy('Tn_Turntable', tn, 1.35, 0.012, (0, -0.6, 0.056), steel, verts=40)
lathe('Tn_TurntableRing', tn, [(1.33, 0.05), (1.38, 0.05), (1.38, 0.064), (1.33, 0.064)], P(0, -0.6), alloy, segs=40)
for k in range(24):   # (its degree marks)
    a = k / 24 * math.tau; bx(f'Tn_TurnMark{k}', tn, (0.08 if k % 6 else 0.16, 0.012, 0.004), (math.cos(a) * 1.25, -0.6 + math.sin(a) * 1.25, 0.064), yellow, rot=(0, 0, a))
# the rolling road: the belt over its two rollers, in a housing flush with the turntable, the suction slots either side
bbox('Tn_Road_Housing', tn, (0.95, 3.3, 0.06), (0, -0.6, 0.06), frame, bev=0.008)
bx('Tn_Road_Belt', tn, (0.8, 3.0, 0.012), (0, -0.6, 0.095), belt)
for y in (-2.05, 0.85): cy(f'Tn_Road_Roller{y:+.0f}', tn, 0.07, 0.86, (0, y, 0.06), alloy, rot=(0, D90, 0), verts=12)
for s in (-1, 1): bx(f'Tn_Road_Slot{s}', tn, (0.03, 2.8, 0.004), (s * 0.46, -0.6, 0.092), blackm)
for k, y in enumerate((-1.7, -1.1, -0.5, 0.1, 0.6)): bx(f'BUSY_tunnel2_Streak{k}', tn, (0.6, 0.12, 0.003), (0, y, 0.103), streak)   # (the belt running)
# the throats in honeycomb: the contraction's mouth and the diffuser's, seen through the glass
bx('Tn_Throat_In', tn, (2 * TSX - 0.12, 0.02, TSH - 0.12), (0, TS0 + 0.03, TSH / 2), honey)
bx('Tn_Throat_Out', tn, (2 * TSX - 0.12, 0.02, TSH - 0.12), (0, TS1 - 0.03, TSH / 2), duct_dk)
# the access door in the -X glass (the side you see from the atrium) and its plate
bx('Tn_Door_Frame', tn, (0.06, 0.9, 2.0), (-TSX - 0.04, -1.9, 1.0), frame)
bx('Tn_Door_Leaf', tn, (0.04, 0.8, 1.9), (-TSX - 0.07, -1.9, 1.0), duct_dk)
rd('Tn_Door_Handle', tn, P(-TSX - 0.1, -2.2, 0.95), P(-TSX - 0.1, -2.2, 1.15), 0.012, steel, verts=6)   # (on the leaf's face)
cd('Tn_Door_Plate', tn, 0.4, 0.15, (-TSX - 0.1, -1.9, 1.5), print_('Tn_DoorPlate', 'tn_door', 0.1), rotz=-D90)
# the diffuser out of the test section, the back corner turning to the return leg (its outer corners cut at 45)
rduct('Tn_Diffuser', tn, 'y', [(TS1, 0.0, 2 * TSX + 0.1, 0.0, TSH), (BK0, 0.0, 3.4, 0.0, 2.7)], duct)
flange('Tn_Fl_DiffIn', tn, 'y', TS1 + 0.03, 0.0, 2 * TSX + 0.1, 0.0, TSH, bolts=False)
flange('Tn_Fl_DiffOut', tn, 'y', BK0, 0.0, 3.4, 0.0, 2.7)
prism('Tn_BackCorner', tn, [(-1.7, BK0), (RX + RW / 2, BK0), (RX + RW / 2, BK1 - 0.5), (RX + RW / 2 - 0.5, BK1), (-1.2, BK1), (-1.7, BK1 - 0.5)], 0.0, 2.8, duct)
bx('Tn_BackCorner_Cap', tn, (RX + RW / 2 + 1.7 + 0.1, BK1 - BK0 + 0.1, 0.06), ((RX + RW / 2 - 1.7) / 2, (BK0 + BK1) / 2, 2.83), frame)
for k, x in enumerate((-0.6, 1.2, 3.0)):   # (the corner's vane access panels, bolted on)
    bbox(f'Tn_VanePanel{k}', tn, (0.8, 0.03, 1.4), (x, BK1 + 0.0, 1.4), duct_dk, bev=0.006)
    for j, (dx, dz) in enumerate(((-0.35, -0.6), (0.35, -0.6), (-0.35, 0.6), (0.35, 0.6))): cy(f'Tn_VaneBolt{k}{j}', tn, 0.015, 0.04, (x + dx, BK1 + 0.02, 1.4 + dz), steel, rot=(D90, 0, 0), verts=6)
# the return leg: from the back corner forward to the settling chamber, on steel stands; the fan can in it
rduct('Tn_Return_Back', tn, 'y', [(BK0, RX, RW, RZ0, RH), (1.15, RX, RW, RZ0, RH)], duct)
rduct('Tn_Return_Front', tn, 'y', [(-0.65, RX, RW, RZ0, RH), (SC1, RX, RW, RZ0, RH)], duct)
for y in (1.15, -0.65): flange(f'Tn_Fl_Fan{y:+.1f}', tn, 'y', y, RX, RW, RZ0, RH)
flange('Tn_Fl_ReturnIn', tn, 'y', SC1 + 0.03, RX, RW, RZ0, RH, bolts=False)
for k, y in enumerate((-1.4, -2.3, -3.2, -4.1, 2.0)):   # (the return leg's stiffeners: up its outside, over its top)
    bx(f'Tn_RetStiffS{k}', tn, (0.07, 0.09, RH), (RX + RW / 2 + 0.035, y, RZ0 + RH / 2), duct)
    bx(f'Tn_RetStiffT{k}', tn, (RW, 0.09, 0.07), (RX, y, RZ0 + RH + 0.035), duct)
for s_ in (-1, 1):
    for k, y in enumerate((1.75, 2.15)): bx(f'Tn_DiffStiff{s_}{k}', tn, (0.07, 0.09, 2.4), (s_ * (TSX + 0.12 + (y - TS1) * 0.2), y, 1.2), duct)
for y in (2.0, -1.6, -3.4):
    for s in (-1, 1): bbox(f'Tn_Stand{y:+.0f}{s}', tn, (0.1, 0.1, RZ0), (RX + s * (RW / 2 - 0.15), y, RZ0 / 2), frame, bev=0.008)
    bx(f'Tn_StandBeam{y:+.0f}', tn, (RW, 0.12, 0.08), (RX, y, RZ0 - 0.04), frame)
# the fan can: a drum between two transition plates, the motor nacelle and blades seen through its porthole
FY0, FY1, FR = -0.65, 1.15, 1.2
for y in (FY0, FY1): bx(f'Tn_FanPlate{y:+.1f}', tn, (RW + 0.2, 0.08, RH + 0.2), (RX, y, RZ0 + RH / 2), frame)
FC = Vector((RX, (FY0 + FY1) / 2, RZ0 + RH / 2))
def can_shell(name, coll, c, r0, r1, y0, y1, win, mat_out, mat_in, segs=28):
    # a drum along Y, a wall r0..r1 thick, a window [win] (angles round from +X, up is pi/2) cut out of it: outside,
    # inside, the window's edges and the two end rings, all closed
    a0, a1 = win; angs = [a1 + (2 * math.pi - (a1 - a0)) * k / segs for k in range(segs + 1)]
    vs, fs = [], []
    def ring(r, y): base = len(vs); vs.extend((c.x + r * math.cos(a), y, c.z + r * math.sin(a)) for a in angs); return base
    o0, o1, i0, i1 = ring(r1, y0), ring(r1, y1), ring(r0, y0), ring(r0, y1)
    for k in range(segs):
        fs.append((o0 + k, o0 + k + 1, o1 + k + 1, o1 + k)); fs.append((i0 + k, i1 + k, i1 + k + 1, i0 + k + 1))
        fs.append((o0 + k, i0 + k, i0 + k + 1, o0 + k + 1)); fs.append((o1 + k, o1 + k + 1, i1 + k + 1, i1 + k))
    for (oo, ii) in ((0, 0), (segs, segs)): fs.append((o0 + oo, o1 + oo, i1 + ii, i0 + ii))
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    uv_world(me, Matrix.Identity(4), 0.5); o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat_out)
    me.materials.append(mat_in)
    for f in me.polygons:   # (the inside dark)
        n = f.center - Vector((c.x, f.center.y, c.z)); f.material_index = 1 if n.length < (r0 + r1) / 2 - 0.001 else 0
    return mk(o)
WIN = (math.pi / 2 - 0.62, math.pi / 2 + 0.62)
can_shell('Tn_FanCan', tn, FC, FR - 0.05, FR, FY0 + 0.04, FY1 - 0.04, WIN, duct_dk, blackm)
for k in (0, 1):   # (the can's end rings, proud of it)
    y = FY0 + 0.08 if k == 0 else FY1 - 0.08
    lathe(f'Tn_FanRing{k}', tn, [(FR, 0.0), (FR + 0.07, 0.0), (FR + 0.07, 0.08), (FR, 0.08)], P(RX, y - 0.04, FC.z), frame, segs=28, rot=(-D90, 0, 0))
# the fan inside: the nacelle along the can's axis, seven blades round it, the stator vanes behind (seen from above)
lathe('Tn_Nacelle', tn, [(0.0, 0.0), (0.22, 0.1), (0.34, 0.35), (0.34, 1.1), (0.2, 1.45), (0.0, 1.5)], P(RX, FY0 + 0.1, FC.z), alloy, segs=14, rot=(-D90, 0, 0))
for k in range(7):
    a = k / 7 * math.tau + 0.2; d = Vector((math.cos(a), 0, math.sin(a)))
    bbox(f'Tn_Blade{k}', tn, (0.22, 0.04, 0.78), FC + Vector((0, 0.25, 0)) + d * 0.73, alloy, rot=(0.35, math.pi / 2 - a, 0), bev=0.006)
for k in range(5):
    a = k / 5 * math.tau + 0.5; d = Vector((math.cos(a), 0, math.sin(a)))
    bx(f'Tn_Stator{k}', tn, (0.06, 0.03, 0.82), FC + Vector((0, -0.45, 0)) + d * 0.76, frame, rot=(0, math.pi / 2 - a, 0))
# the grille over the window: a frame and bars you see the blades through
GZ = FC.z + FR + 0.02; GW = 2 * FR * math.sin(0.62) + 0.1
for s_ in (-1, 1):
    bx(f'Tn_GrilleSide{s_}', tn, (0.06, FY1 - FY0 - 0.2, FR - FR * math.cos(0.62) + 0.06), (RX + s_ * GW / 2, FC.y, GZ - (FR - FR * math.cos(0.62)) / 2), frame)
for k in range(2): bx(f'Tn_GrilleEnd{k}', tn, (GW, 0.06, 0.06), (RX, FY0 + 0.13 if k == 0 else FY1 - 0.13, GZ), frame)
for k in range(9): bx(f'Tn_GrilleBar{k}', tn, (0.018, FY1 - FY0 - 0.26, 0.03), (RX - GW / 2 + 0.08 + k * (GW - 0.16) / 8, FC.y, GZ), steel)
for k in range(3): bx(f'Tn_GrilleCross{k}', tn, (GW, 0.018, 0.03), (RX, FY0 + 0.45 + k * 0.45, GZ + 0.01), steel)
# the motor's terminal box and the cables up to the tray; the drive cabinets at the front left
bbox('Tn_MotorBox', tn, (0.5, 0.4, 0.35), (RX, 1.75, RZ0 + RH + 0.175), frame, bev=0.015)   # (on the return leg behind the can: the drive's terminal box)
for k, x in enumerate((-4.15, -3.55, -2.95)):
    bbox(f'Tn_Cabinet{k}', tn, (0.58, 0.6, 2.1), (x, -6.25, 1.05), plain_mat('Tn_Cab', (0.82, 0.83, 0.84), dirt=0.06), bev=0.012)
    bx(f'Tn_CabHandle{k}', tn, (0.03, 0.03, 0.25), (x + 0.2, -6.25 + 0.31, 1.1), steel)
    for j in range(3): bx(f'Tn_CabLed{k}{j}', tn, (0.04, 0.01, 0.02), (x - 0.15 + j * 0.08, -6.25 + 0.305, 1.8), greenm if j < 2 else redm)
    bx(f'Tn_CabVent{k}', tn, (0.36, 0.01, 0.2), (x, -6.25 + 0.305, 0.3), blackm)
# the cable tray: from the motor along the return leg's top, over the settling chamber, down to the cabinets
tray = [(RX + 0.75, 1.6, RZ0 + RH + 0.45), (RX + 0.75, SC1, RZ0 + RH + 0.45)]
beam('Tn_Tray_A', tn, P(*tray[0]), P(*tray[1]), 0.3, 0.06, alloy)
beam('Tn_Tray_B', tn, P(RX + 0.75, SC1, SCH + 0.2), P(-2.95, SC1, SCH + 0.2), 0.3, 0.06, alloy)
for k, x in enumerate((-2.8, -3.4)): sweep(f'Tn_Cable{k}', tn, [P(x + 0.1, SC1, SCH + 0.22), P(x - 0.2, SC1 - 0.3, SCH + 0.25), P(x - 0.3, -5.95, 2.2), P(x - 0.3, -5.95, 2.11)], 0.025, blackm, segs=5, per_m=4)
sweep('Tn_CableRise', tn, [P(RX + 0.75, SC1 + 0.1, RZ0 + RH + 0.5), P(RX + 0.75, SC1 - 0.05, SCH + 0.0), P(RX + 0.75, SC1, SCH + 0.22)], 0.04, blackm, segs=5, per_m=6)
sweep('Tn_MotorCable', tn, [P(RX + 0.25, 1.75, RZ0 + RH + 0.2), P(RX + 0.6, 1.7, RZ0 + RH + 0.4), P(RX + 0.75, 1.55, RZ0 + RH + 0.47)], 0.03, blackm, segs=5, per_m=6)
# the light rig over the test section: four posts, a frame, six lamp heads aimed down
for x in (-TSX - 0.35, TSX + 0.25):
    for y in (TS0 + 0.1, TS1 - 0.1): bbox(f'Tn_RigPost{x:+.0f}{y:+.0f}', tn, (0.08, 0.08, 3.4), (x, y, 1.7), frame, bev=0.008)
    bx(f'Tn_RigBeam{x:+.0f}', tn, (0.1, TS1 - TS0, 0.1), (x, (TS0 + TS1) / 2, 3.4), frame)
for y in (TS0 + 0.1, TS1 - 0.1): bx(f'Tn_RigCross{y:+.0f}', tn, (2 * TSX + 0.6, 0.1, 0.1), (-0.05, y, 3.4), frame)
for k, (x, y) in enumerate(((-0.8, -1.9), (0.8, -1.9), (-0.8, -0.6), (0.8, -0.6), (-0.8, 0.7), (0.8, 0.7))):
    lathe(f'Tn_Lamp{k}', tn, [(0.0, 0.0), (0.16, 0.0), (0.12, 0.22), (0.05, 0.25), (0.0, 0.25)], P(x, y, 3.08), frame, segs=10)
    cy(f'Tn_LampLens{k}', tn, 0.15, 0.01, (x, y, 3.075), lamp, verts=10)
    rd(f'Tn_LampHang{k}', tn, P(x, y, 3.33), P(x, y, 3.35), 0.02, steel, verts=5)
    bx(f'Tn_LampBar{k}', tn, (2 * TSX + 0.5, 0.05, 0.05), (-0.05, y, 3.36), frame) if k % 2 == 0 else None

# ================= the 60% model on the road, on its strut from the balance =================
MZ = 0.1   # (the belt's top)
M = collection('tunnel2 model', tn)
def mdl(fn, name, *a, **k): return fn('Tn_Model_' + name, M, *a, **k)
mdl(bbox, 'Plank', (0.5, 2.0, 0.02), (0, -0.55, MZ + 0.07), carbon, bev=0.004)
mdl(bbox, 'Floor', (0.85, 1.4, 0.015), (0, -0.25, MZ + 0.09), carbon, bev=0.004)
mdl(lathe, 'Nose', [(0.0, 0.0), (0.07, 0.04), (0.11, 0.3), (0.14, 0.75), (0.15, 0.95)], P(0, -2.0, MZ + 0.22), model_w, segs=10, rot=(-D90, 0, 0), cap1=True)
mdl(bbox, 'Tub', (0.3, 0.9, 0.24), (0, -0.85, MZ + 0.25), model_w, bev=0.04)
mdl(bbox, 'Cockpit', (0.18, 0.32, 0.04), (0, -0.75, MZ + 0.385), blackm, bev=0.01)
mdl(lathe, 'Airbox', [(0.0, 0.0), (0.09, 0.0), (0.08, 0.2), (0.0, 0.24)], P(0, -0.52, MZ + 0.36), model_w, segs=10)
mdl(prism, 'EngineCover', [(-0.13, -0.5), (0.13, -0.5), (0.07, 0.55), (-0.07, 0.55)], MZ + 0.12, MZ + 0.38, model_w)
for s in (-1, 1):
    mdl(bbox, f'Pod{s}', (0.18, 0.75, 0.2), (s * 0.27, -0.3, MZ + 0.2), model_w, bev=0.04)
    mdl(bbox, f'PodInlet{s}', (0.14, 0.03, 0.14), (s * 0.27, -0.69, MZ + 0.21), blackm, bev=0.01)
    for (y, r, front) in ((-1.55, 0.17, True), (0.5, 0.2, False)):
        x = s * (0.45 if front else 0.44); w = 0.17 if front else 0.22
        mdl(cy, f'Wheel{s}{int(front)}', r, w, (x, y, MZ + r), rubber, rot=(0, D90, 0), verts=14)
        mdl(cy, f'Rim{s}{int(front)}', r * 0.6, w + 0.004, (x, y, MZ + r), alloy, rot=(0, D90, 0), verts=10)
        mdl(rd, f'Wish{s}{int(front)}a', P(s * 0.12, y - 0.06, MZ + 0.22), P(x - s * w / 2, y, MZ + r), 0.008, carbon, verts=4)
        mdl(rd, f'Wish{s}{int(front)}b', P(s * 0.12, y + 0.08, MZ + 0.3), P(x - s * w / 2, y, MZ + r + 0.04), 0.008, carbon, verts=4)
    mdl(bbox, f'FWPlate{s}', (0.015, 0.22, 0.12), (s * 0.55, -2.12, MZ + 0.08), carbon, bev=0.003)
    mdl(bbox, f'RWPlate{s}', (0.015, 0.3, 0.28), (s * 0.38, 0.72, MZ + 0.42), carbon, bev=0.003)
mdl(bbox, 'FrontWing', (1.1, 0.2, 0.015), (0, -2.12, MZ + 0.05), carbon, rot=(0.08, 0, 0), bev=0.003)
mdl(bbox, 'FrontFlap', (1.0, 0.1, 0.012), (0, -2.04, MZ + 0.1), model_w, rot=(0.35, 0, 0), bev=0.003)
mdl(bbox, 'RearWing', (0.74, 0.2, 0.014), (0, 0.7, MZ + 0.48), carbon, rot=(0.12, 0, 0), bev=0.003)
mdl(bbox, 'RearFlap', (0.74, 0.12, 0.012), (0, 0.78, MZ + 0.55), model_w, rot=(0.45, 0, 0), bev=0.003)
mdl(bbox, 'Diffuser', (0.5, 0.25, 0.08), (0, 0.6, MZ + 0.09), carbon, rot=(-0.25, 0, 0), bev=0.005)
mdl(bbox, 'Number', (0.12, 0.01, 0.08), (0, -1.08, MZ + 0.28), redm)   # (a red stripe on the nose: the model's only colour)
# the strut from the balance on the roof, down to the model's spine; the balance's box on the roof
rd('Tn_Strut', tn, P(0, -0.65, TSH), P(0, -0.65, MZ + 0.4), 0.025, steel, verts=8)
bbox('Tn_StrutFairing', tn, (0.06, 0.2, TSH - MZ - 0.5), (0, -0.62, (TSH + MZ + 0.4) / 2), frame, bev=0.02)
bbox('Tn_Balance', tn, (0.8, 0.8, 0.45), (0, -0.65, TSH + 0.38), duct_dk, bev=0.02)
for k in range(3): bx(f'Tn_BalanceFin{k}', tn, (0.82, 0.02, 0.3), (0, -0.85 + k * 0.2, TSH + 0.4), frame)
sweep('Tn_BalanceCable', tn, [P(0.4, -0.65, TSH + 0.5), P(1.6, -0.9, TSH + 0.8), P(RX + 0.75, -0.9, RZ0 + RH + 0.5)], 0.03, blackm, segs=5, per_m=5)
# in use: the smoke wand in front of the nose, its plume; the screen on its stand by the door; idle: the model's cover
rd('BUSY_tunnel2_Wand', tn, P(-0.9, -2.35, TSH - 0.01), P(-0.25, -2.35, MZ + 0.22), 0.01, steel, verts=5)   # (hung from the roof)
mk(card('BUSY_tunnel2_Smoke', tn, 2.3, 0.5, (0, -1.3, MZ + 0.12), art_cutout('Tn_Smoke', A('tn_smoke')), rotz=-D90))
bbox('IDLE_tunnel2_Cover', tn, (1.18, 3.1, 0.5), (0, -0.62, MZ + 0.27), canvas, bev=0.08)
rd('Tn_ScreenPole', tn, P(-2.2, -2.9, 0.0), P(-2.2, -2.9, 1.5), 0.025, steel, verts=8)
lathe('Tn_ScreenFoot', tn, [(0.0, 0.0), (0.25, 0.0), (0.25, 0.02), (0.04, 0.05), (0.0, 0.05)], P(-2.2, -2.9), frame, segs=12)
bbox('Tn_ScreenBox', tn, (0.06, 0.5, 0.34), (-2.2, -2.9, 1.6), blackm, bev=0.01)
for st, mat in (('BUSY', glow('Tn_Screen', 'screen_tele', 1.2)), ('IDLE', screen_off)):
    mk(card(f'{st}_tunnel2_Screen', tn, 0.44, 0.28, (-2.24, -2.9, 1.46), mat, rotz=-D90))   # (to -X: who stands at the glass)
# its own light: one point under the rig, over the model (the hall's only other light is high up: the test section was black)
bulb('Light_TunnelRig', tn, (0.0, -0.6, 3.0), 260, (0.92, 0.96, 1.0))
# hazard tape round the test section's floor; where people stand
for s in (-1, 1): bx(f'Tn_Tape{s}', tn, (0.08, TS1 - TS0 + 0.3, 0.003), (s * (TSX + 0.2), (TS0 + TS1) / 2, 0.002), hazard)
empty('STAND_tunnel', tn, (-2.15, -1.2, 0), rotz=D90, kind='SINGLE_ARROW', size=0.5, clip='lean', role='engineer')     # (at the glass, watching the model)
empty('STAND_any', tn, (-3.55, -5.45, 0), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='engineer')  # (at the drive cabinets)

# ================= station_tunnel: the model shop corner =================
ms = collection('station_tunnel', stations); ms.instance_offset = (0, 0, 0)
wood = grimy_tile('Tn_CrateWood', 'wood_planks.png', dirt=0.15) if os.path.exists(os.path.join(G.TEX, 'wood_planks.png')) else plain_mat('Tn_CrateWood', (0.6, 0.47, 0.3), dirt=0.15)
# the crate: base, sides, the foam inside, the lid leaning on the rack; the model home in it
CW, CD, CH, CY = 3.1, 1.15, 0.7, -1.55
bbox('Tn_Crate_Base', ms, (CW, CD, 0.1), (0, CY, 0.08), wood, bev=0.01)
for k in range(3): bx(f'Tn_Crate_Skid{k}', ms, (0.1, CD, 0.06), (-1.3 + k * 1.3, CY, 0.03), wood)
for s in (-1, 1):
    bbox(f'Tn_Crate_Side{s}', ms, (CW, 0.04, CH), (0, CY + s * (CD / 2 - 0.02), 0.13 + CH / 2), wood, bev=0.005)
    bbox(f'Tn_Crate_End{s}', ms, (0.04, CD - 0.08, CH), (s * (CW / 2 - 0.02), CY, 0.13 + CH / 2), wood, bev=0.005)
mk(card('Tn_Crate_Stencil', ms, 1.5, 0.47, (0.2, CY - CD / 2 - 0.005, 0.25), print_('Tn_Crate', 'tn_crate', 0.25)))
bx('Tn_Crate_Foam', ms, (CW - 0.12, CD - 0.12, 0.12), (0, CY, 0.19), plain_mat('Tn_Foam', (0.2, 0.22, 0.26), dirt=0.05, fleck=0.12))
# the model in it (the same build as the tunnel's, smaller set: a 60% car, lying in the foam)
for name, src in [(o.name, o) for o in list(M.objects)]:
    c = src.copy(); c.data = src.data; ms.objects.link(c); c.name = name.replace('Tn_Model_', 'Tn_Shop_Model_')
    c.matrix_world = Matrix.Translation(Vector((0.6, CY, 0.15))) @ Matrix.Rotation(-D90, 4, 'Z') @ src.matrix_world; mk(c)   # (its middle, y -0.6 in the tunnel, to the crate's)
bbox('Tn_Crate_Lid', ms, (CW, CD, 0.05), (0, -0.62, 0.62), wood, rot=(-1.25, 0, 0), bev=0.008)   # (leaning on the rack)
# the parts rack along the back wall: uprights, shelves, labelled bins, spare wings and floor sections
for x in (-1.65, -0.35, 0.95):
    for y in (-0.05, -0.45): bx(f'Tn_Rack_Up{x:+.1f}{y:+.1f}', ms, (0.04, 0.04, 2.0), (x, y, 1.0), frame)
for k, z in enumerate((0.35, 1.0, 1.6, 1.98)):
    bx(f'Tn_Rack_Shelf{k}', ms, (2.64, 0.42, 0.025), (-0.35, -0.25, z), alloy)
for k in range(8):
    x = -1.5 + k * 0.33
    bbox(f'Tn_Bin{k}', ms, (0.28, 0.36, 0.16), (x, -0.25, 1.1), plain_mat('Tn_BinBlue', (0.14, 0.3, 0.62), dirt=0.05), bev=0.01)
mk(card('Tn_BinLabels', ms, 2.64, 0.17, (-0.35, -0.44, 1.02), print_('Tn_Bins', 'tn_bins', 0.1)))
for k in range(3):   # (spare front wings, stood on edge on the top shelf; floor sections flat on the middle one)
    bbox(f'Tn_SpareWing{k}', ms, (1.0, 0.02, 0.2), (-1.0 + k * 0.08, -0.2 + k * 0.05, 1.75), carbon, rot=(0, 0, 0.05 * k), bev=0.003)
    bbox(f'Tn_SpareFloor{k}', ms, (0.9, 0.36, 0.015), (0.35, -0.25, 1.62 + k * 0.025), carbon, bev=0.003)
bbox('Tn_SpareRearWing', ms, (0.74, 0.2, 0.3), (-0.6, -0.25, 2.15), carbon, bev=0.004)
# the SLA machine: a cabinet with its resin vat window, the screen, the build platform inside
SX = 1.3
bbox('Tn_SLA_Body', ms, (0.7, 0.7, 1.6), (SX, -0.38, 0.8), plain_mat('Tn_SLA', (0.84, 0.85, 0.86), dirt=0.05), bev=0.03)
bx('Tn_SLA_Window', ms, (0.5, 0.02, 0.6), (SX, -0.74, 1.15), solid_mat('Tn_SLAWin', (0.6, 0.35, 0.05), 0.2))
bx('Tn_SLA_Platform', ms, (0.3, 0.02, 0.3), (SX, -0.72, 1.0), alloy)
bx('Tn_SLA_Screen', ms, (0.18, 0.01, 0.12), (SX + 0.18, -0.735, 0.6), glow('Tn_SLAScreen', 'screen_dyno', 0.9))
bx('Tn_SLA_Base', ms, (0.66, 0.02, 0.2), (SX, -0.735, 0.15), blackm)
# the laptop on a stand by the crate, its lid up
rd('Tn_LapPole', ms, P(1.55, -1.9, 0.0), P(1.55, -1.9, 0.95), 0.02, steel, verts=6)
lathe('Tn_LapFoot', ms, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.02), (0.03, 0.04), (0.0, 0.04)], P(1.55, -1.9), frame, segs=10)
bbox('Tn_LapTray', ms, (0.36, 0.28, 0.02), (1.55, -1.9, 0.96), frame, bev=0.004)
bbox('Tn_LapBase', ms, (0.32, 0.22, 0.02), (1.55, -1.9, 0.98), blackm, bev=0.004)
bbox('Tn_LapLid', ms, (0.32, 0.015, 0.22), (1.55, -1.79, 1.09), blackm, rot=(-0.25, 0, 0), bev=0.004)
mk(card('Tn_LapScreen', ms, 0.28, 0.18, (1.55, -1.802, 1.0), glow('Tn_LapScreenM', 'screen_tele', 1.0), rotz=0.0, tilt=0.25))
bulb('Light_ModelShop', ms, (0.0, -1.3, 2.5), 140, (1.0, 0.9, 0.75))   # (a warm one over the crate: the hall's back corner is dark)
empty('STAND_tunnel', ms, (0.0, -2.55, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='kneel', role='engineer')   # (at the crate)

# ================= checks, AO, export =================
skip = (glass, bpy.data.materials.get('Tn_Smoke'))
if '--noao' not in args:
    print('AO tunnel2', bake_ao(tn, skip=skip, wall=False), 'model shop', bake_ao(ms, skip=skip, wall=True))
export_station(tn, os.path.join(ROOT, 'models', 'garage', 'station_tunnel2.glb'))
export_station(ms, os.path.join(ROOT, 'models', 'garage', 'station_tunnel.glb'))
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'tunnel-start.blend'))
print('TUNNEL2 triangles', tris(tn), 'MODEL SHOP triangles', tris(ms))
