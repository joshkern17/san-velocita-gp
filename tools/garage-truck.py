# The transporter (the home garage's station_truck, see docs/GARAGE-KIT.md): a 2000s F1 team's race truck, backed
# into the factory's loading dock, made the garage-station way (.claude/skills/garage-station). The tractor unit (its
# cab with the windscreen and side windows, grille, lamps, mirrors on their arms, the steps, the roof fairing, the
# fuel tanks, the fifth wheel) and a box trailer in the team's livery (TeamMain / TeamAccent: the game tints them):
# the team's name along it, a side door, the skirts, the tri-axle, the landing legs. Its rear barn doors stand open
# flat to its sides and the tail lift is down as a ramp: inside, the upper deck with a car under its cover, the lower
# deck's cabinets and the tire racks, lit. AO baked (wall=False: it stands out in the room).
# Built round its middle: local y from the cab's nose (-7.6) to the ramp's end (+7.0), x +-1.3. The factory's
# SLOT_truck turns it so its nose points at the dock's roller door (tools/garage-factory.py).
#   Blender --background --python tools/garage-truck.py -- [--out models/garage/station_truck.glb] [--blend] [--noao]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_truck.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=5150)
if not os.path.exists(os.path.join(ART, 'tk_script.png')): subprocess.run(['/usr/local/bin/python3', os.path.join(HERE, 'garage-signs-sim2truck.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
P = lambda x, y, z=0.0: Vector((x, y, z))
kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
T = collection('station_truck', stations); T.instance_offset = (0, 0, 0)

# ---------------- materials ----------------
def team_mat(name, dirt):   # (TeamMain / TeamAccent: near-white paint the game tints with the team's colours)
    m = bpy.data.materials.new(name); src = plain_mat(name + '_tex', (0.9, 0.9, 0.9), dirt=dirt)
    t = [n for n in src.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = t; tx.interpolation = 'Closest'; nt.links.new(tx.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.35; bpy.data.materials.remove(src); return m
TM = team_mat('TeamMain_Truck', 0.1); TA = team_mat('TeamAccent_Truck', 0.08)
chassis = grimy_tile('Tk_Chassis', 'dark_industrial_metal.png', dirt=0.25, rust=0.05)
alu = grimy_tile('Tk_Alu', 'galvanized_metal.png', dirt=0.08)
chrome = plain_mat('Tk_Chrome', (0.8, 0.82, 0.85), dirt=0.03, rough=0.2)
black = plain_mat('Tk_Black', (0.05, 0.05, 0.06), dirt=0.05)
grey = plain_mat('Tk_Grey', (0.35, 0.36, 0.38), dirt=0.08)
glassd = plain_mat('Tk_Glass', (0.08, 0.1, 0.12), dirt=0.02, rough=0.1)
tyre = grimy_tile('Tk_Tyre', 'rubber.png', dirt=0.12)
tread = grimy_tile('Tk_Tread', 'metal_plate_03.png', dirt=0.12, tint=(0.55, 0.57, 0.6))
cover = plain_mat('Tk_Cover', (0.12, 0.13, 0.16), dirt=0.05, rough=0.9)
cab_white = plain_mat('Tk_Cabinet', (0.85, 0.86, 0.87), dirt=0.06)
lampw = mat_img('Tk_LampW', None, 0.3, emit=((1.0, 0.97, 0.9), 2.0))
lampr = mat_img('Tk_LampR', None, 0.3, emit=((0.9, 0.05, 0.04), 1.6))
lampa = mat_img('Tk_LampA', None, 0.3, emit=((1.0, 0.6, 0.1), 1.6))
inside = mat_img('Tk_InsideLight', None, 0.4, emit=((0.95, 0.97, 1.0), 3.0))
def print_(name, png, d=0.08): return art_mat(name, A(png), dirt=d)
script = art_cutout('Tk_Script', A('tk_script'))

W2 = 1.27          # (half the width: 2.54 m)
# ================= the wheels: a tyre, the rim, its nuts; duals at the back =================
def wheel(name, x, y, dual=False, r=0.5, w=0.3):
    s = 1 if x > 0 else -1
    lathe(f'{name}_Tyre', T, [(0.32, -w / 2), (r * 0.94, -w / 2), (r, -w * 0.38), (r, w * 0.38), (r * 0.94, w / 2), (0.32, w / 2)], P(x, y, r), tyre, segs=16, rot=(0, D90, 0), cap0=False, cap1=False)
    lathe(f'{name}_Rim', T, [(0.0, 0.0), (0.3, 0.0), (0.32, 0.03), (0.32, w * 0.9), (0.0, w * 0.9)], P(x - s * w * 0.45, y, r), alu, segs=12, rot=(0, s * D90, 0))
    cy(f'{name}_Hub', T, 0.1, 0.06, P(x + s * w * 0.5, y, r), chrome, rot=(0, D90, 0), verts=8)
    if dual: wheel(name + 'D', x - s * (w + 0.02), y, False, r, w)

# ================= the tractor unit =================
CAB0, CAB1, CZ0, CZ1 = -7.6, -5.4, 1.05, 3.25   # (the cab: its nose, its back; its floor and roof)
bbox('Tk_Frame', T, (0.9, 4.2, 0.3), (0, -5.5, 0.85), chassis, bev=0.02)   # (the chassis rails)
bbox('Tk_Cab', T, (W2 * 2 - 0.04, CAB1 - CAB0, CZ1 - CZ0), (0, (CAB0 + CAB1) / 2, (CZ0 + CZ1) / 2), TM, bev=0.12)
bbox('Tk_CabStripe', T, (W2 * 2 - 0.02, CAB1 - CAB0 - 0.2, 0.18), (0, (CAB0 + CAB1) / 2 + 0.05, CZ0 + 0.45), TA, bev=0.04)
bbox('Tk_Fairing', T, (W2 * 2 - 0.1, 1.6, 0.42), (0, CAB1 - 0.9, CZ1 + 0.2), TM, rot=(0.18, 0, 0), bev=0.1)   # (the roof spoiler, rising to the trailer)
bbox('Tk_Windscreen', T, (2.2, 0.03, 0.95), (0, CAB0 - 0.005, CZ1 - 0.62), glassd, rot=(0.08, 0, 0), bev=0.01)
bbox('Tk_Visor', T, (2.3, 0.3, 0.06), (0, CAB0 + 0.05, CZ1 - 0.08), black, bev=0.01)
for s in (-1, 1):
    bbox(f'Tk_SideWin{s}', T, (0.03, 0.85, 0.7), (s * (W2 - 0.005), CAB0 + 0.62, CZ1 - 0.6), glassd, bev=0.01)
    bx(f'Tk_DoorLine{s}', T, (0.01, 0.02, 1.7), (s * (W2 + 0.002), CAB0 + 1.15, CZ0 + 0.95), black)
    bx(f'Tk_DoorHandle{s}', T, (0.03, 0.18, 0.04), (s * (W2 - 0.008), CAB0 + 1.0, CZ0 + 1.1), chrome)
    # mirrors: a curved arm out from the door's front, two glasses in a black housing
    sweep(f'Tk_MirrorArm{s}', T, [P(s * (W2 - 0.02), CAB0 + 0.15, CZ1 - 0.3), P(s * (W2 + 0.2), CAB0 + 0.0, CZ1 - 0.25), P(s * (W2 + 0.3), CAB0 + 0.1, CZ1 - 0.5)], 0.02, black, segs=5, per_m=8)
    bbox(f'Tk_Mirror{s}', T, (0.06, 0.24, 0.42), (s * (W2 + 0.32), CAB0 + 0.12, CZ1 - 0.72), black, bev=0.02)
    bx(f'Tk_MirrorGlass{s}', T, (0.005, 0.2, 0.36), (s * (W2 + 0.32), CAB0 + 0.25, CZ1 - 0.72), glassd)
    # the steps up, a grab handle
    for k, z in enumerate((0.45, 0.8)): bbox(f'Tk_Step{s}{k}', T, (0.22, 0.45, 0.04), (s * (W2 - 0.1), CAB0 + 1.15, z), tread, bev=0.005)
    rd(f'Tk_Grab{s}', T, P(s * (W2 + 0.03), CAB0 + 1.5, CZ0 + 0.2), P(s * (W2 + 0.03), CAB0 + 1.5, CZ0 + 1.1), 0.018, chrome, verts=6)
    for k, z in enumerate((CZ0 + 0.22, CZ0 + 1.08)): bx(f'Tk_GrabBracket{s}{k}', T, (0.07, 0.03, 0.03), (s * (W2 + 0.0), CAB0 + 1.5, z), chrome)   # (on standoffs to the cab)
    # the fuel tank, its strap and filler; the wheel arch
    cy(f'Tk_Tank{s}', T, 0.3, 1.05, (s * (W2 - 0.3), -4.85, 0.75), alu, rot=(D90, 0, 0), verts=12)
    for k, y in enumerate((-5.25, -4.45)): lathe(f'Tk_TankStrap{s}{k}', T, [(0.31, -0.02), (0.31, 0.02)], P(s * (W2 - 0.3), y, 0.75), black, segs=12, rot=(D90, 0, 0), cap0=False, cap1=False)
    cy(f'Tk_TankCap{s}', T, 0.06, 0.04, (s * (W2 - 0.3), -4.85, 1.07), black, verts=8)
    bbox(f'Tk_Arch{s}', T, (0.36, 1.2, 0.08), (s * (W2 - 0.2), -6.75, 1.12), black, bev=0.02)
# the front: the grille (bars), the bumper, the lamps, the plate
bbox('Tk_Grille', T, (1.6, 0.04, 0.75), (0, CAB0 - 0.01, CZ0 + 0.55), black, bev=0.01)
for k in range(6): bx(f'Tk_GrilleBar{k}', T, (1.5, 0.02, 0.025), (0, CAB0 - 0.035, CZ0 + 0.27 + k * 0.11), chrome)
bbox('Tk_Bumper', T, (W2 * 2, 0.3, 0.42), (0, CAB0 + 0.05, 0.62), grey, bev=0.05)
for s in (-1, 1):
    bbox(f'Tk_Headlamp{s}', T, (0.42, 0.04, 0.18), (s * 0.82, CAB0 - 0.1, 0.72), lampw, bev=0.02)
    bbox(f'Tk_Indicator{s}', T, (0.14, 0.04, 0.1), (s * 1.1, CAB0 - 0.1, 0.72), lampa, bev=0.01)
cd('Tk_PlateFront', T, 0.52, 0.11, (0, CAB0 - 0.12, 0.47), print_('Tk_Plate', 'tk_plate'))
for k in range(4): bbox(f'Tk_RoofLamp{k}', T, (0.12, 0.08, 0.06), (-0.45 + k * 0.3, CAB0 + 0.1, CZ1 + 0.03), lampa, bev=0.01)
# the fifth wheel under the trailer's nose, the air and electric lines up to it
cy('Tk_FifthWheel', T, 0.42, 0.08, (0, -4.0, 1.12), black, verts=14)
for k, col in enumerate((red if False else lampr, lampa, black)):
    sweep(f'Tk_Line{k}', T, [P(-0.25 + k * 0.12, CAB1 + 0.05, 2.2), P(-0.25 + k * 0.12, CAB1 + 0.4, 1.7), P(-0.2 + k * 0.1, -4.6, 1.5)], 0.015, black if k == 2 else col, segs=5, per_m=6)
wheel('Tk_WheelF_L', W2 - 0.18, -6.75); wheel('Tk_WheelF_R', -(W2 - 0.18), -6.75)
for y in (-4.55, -3.55): wheel(f'Tk_WheelR_L{y}', W2 - 0.18, y, dual=True); wheel(f'Tk_WheelR_R{y}', -(W2 - 0.18), y, dual=True)
bbox('Tk_RearGuard', T, (W2 * 2 - 0.2, 1.8, 0.06), (0, -4.05, 1.06), black, bev=0.01)

# ================= the trailer: a box in the livery, open at the back =================
TR0, TR1, FZ, RZ = -4.75, 5.95, 1.15, 3.6    # (its nose, its rear; its floor, its roof)
L = TR1 - TR0; YM = (TR0 + TR1) / 2; WT = 0.05
for s in (-1, 1):
    bbox(f'Tk_Side{s}', T, (WT, L, RZ - FZ), (s * (W2 - WT / 2), YM, (FZ + RZ) / 2), TM, bev=0.01)
    bx(f'Tk_Band{s}', T, (0.012, L - 0.1, 0.32), (s * (W2 + 0.004), YM, FZ + 0.45), TA)
    cd(f'Tk_Script{s}', T, 7.2, 0.9, (s * (W2 + 0.012), YM + 0.3 * s, FZ + 1.1), script, rotz=s * D90)
    # the side door (its outline, the handle, a step under it), the skirts, the marker lamps along it
    for (dy, dz, w, h) in ((0, 0.0, 0.9, 0.02), (0, 2.0, 0.9, 0.02), (-0.45, 1.0, 0.02, 2.0), (0.45, 1.0, 0.02, 2.0)):
        bx(f'Tk_DoorEdge{s}{dy}{dz}', T, (0.012, w if h < 0.1 else 0.02, h if h > 0.1 else 0.02), (s * (W2 + 0.006), -2.6 + dy, FZ + 0.1 + dz), black)
    bx(f'Tk_SideDoorHandle{s}', T, (0.02, 0.04, 0.22), (s * (W2 + 0.012), -2.25, FZ + 1.1), chrome)
    bbox(f'Tk_Skirt{s}', T, (0.04, 5.2, 0.55), (s * (W2 - 0.1), 0.4, FZ - 0.35), TM, bev=0.01)
    for k in range(5): bbox(f'Tk_Marker{s}{k}', T, (0.02, 0.08, 0.05), (s * (W2 + 0.012), TR0 + 1.0 + k * 2.2, FZ + 0.1), lampa, bev=0.005)
    # the rear doors, open flat against the sides (hinged at the back edge)
    bbox(f'Tk_RearDoor{s}', T, (0.05, W2 - 0.02, RZ - FZ - 0.05), (s * (W2 + 0.04), TR1 - (W2 - 0.02) / 2, (FZ + RZ) / 2), TM, bev=0.01)
    for k in range(2): rd(f'Tk_DoorBar{s}{k}', T, P(s * (W2 + 0.075), TR1 - 0.25 - k * 0.6, FZ + 0.1), P(s * (W2 + 0.075), TR1 - 0.25 - k * 0.6, RZ - 0.1), 0.015, chrome, verts=5)
    for k, z in enumerate((FZ + 0.2, RZ - 0.25)): bx(f'Tk_Hinge{s}{k}', T, (0.06, 0.1, 0.08), (s * (W2 + 0.02), TR1 - 0.02, z), chrome)
    # the rear lamps, a corner post each side
    bbox(f'Tk_TailLamp{s}', T, (0.3, 0.04, 0.1), (s * (W2 - 0.2), TR1 + 0.02, FZ - 0.18), lampr, bev=0.01)
    bx(f'Tk_RearPost{s}', T, (0.08, 0.08, RZ - FZ), (s * (W2 - 0.04), TR1 - 0.04, (FZ + RZ) / 2), alu)
bbox('Tk_Roof', T, (W2 * 2, L, WT), (0, YM, RZ - WT / 2), TM, bev=0.01)
bbox('Tk_Front', T, (W2 * 2, WT, RZ - FZ), (0, TR0 + WT / 2, (FZ + RZ) / 2), TM, bev=0.01)
bbox('Tk_Floor', T, (W2 * 2, L, 0.12), (0, YM, FZ - 0.06), chassis, bev=0.01)
bx('Tk_RoofRail', T, (W2 * 2 + 0.02, 0.12, 0.08), (0, TR1 - 0.06, RZ - 0.04), alu)
for k, y in enumerate((-1.0, 3.0)): bbox(f'Tk_Rail{k}', T, (0.9, 6.0, 0.25), (0, 0.5 + k * 0, FZ - 0.28), chassis, bev=0.01) if k == 0 else None
# the trailer's legs (wound up), its axles behind the skirts, the mudguards, the bumper bar
for s in (-1, 1):
    bx(f'Tk_Leg{s}', T, (0.12, 0.12, 0.7), (s * 0.85, -2.9, FZ - 0.45), chassis); bbox(f'Tk_LegFoot{s}', T, (0.25, 0.25, 0.05), (s * 0.85, -2.9, FZ - 0.82), chassis, bev=0.01)
for y in (3.15, 4.15, 5.15):
    wheel(f'Tk_WheelT_L{y}', W2 - 0.18, y, dual=False, r=0.42, w=0.38); wheel(f'Tk_WheelT_R{y}', -(W2 - 0.18), y, dual=False, r=0.42, w=0.38)
    rd(f'Tk_Axle{y}', T, P(-W2 + 0.3, y, 0.42), P(W2 - 0.3, y, 0.42), 0.06, chassis, verts=8)   # (into the hubs)
for s in (-1, 1): bbox(f'Tk_Mudguard{s}', T, (0.42, 3.2, 0.05), (s * (W2 - 0.18), 4.15, 0.92), black, bev=0.01)
bbox('Tk_UnderRun', T, (W2 * 2 - 0.3, 0.12, 0.12), (0, TR1 - 0.3, 0.5), grey, bev=0.01)
cd('Tk_PlateRear', T, 0.52, 0.11, (0, TR1 + 0.03, FZ - 0.4), print_('Tk_PlateR', 'tk_plate'), rotz=math.pi)

# ================= inside: the upper deck with the car under its cover, the lower deck's cabinets, the tire racks =================
UD = 2.55   # (the upper deck's floor)
bbox('Tk_UpperDeck', T, (W2 * 2 - 0.14, 4.6, 0.08), (0, TR1 - 2.4, UD), alu, bev=0.005)
for s in (-1, 1): bx(f'Tk_DeckBeam{s}', T, (0.08, 0.08, UD - FZ), (s * (W2 - 0.12), TR1 - 0.15, (UD + FZ) / 2), alu)
# the car up there under its fitted cover: a long body shape, the wheels' bumps, the rear wing's hump
loft_secs = [(TR1 - 4.5, 0.35, UD + 0.05, UD + 0.35), (TR1 - 3.8, 0.55, UD + 0.05, UD + 0.55), (TR1 - 2.6, 0.75, UD + 0.05, UD + 0.75), (TR1 - 1.2, 0.7, UD + 0.05, UD + 0.68), (TR1 - 0.5, 0.6, UD + 0.05, UD + 0.85)]
bm = bmesh.new(); rings = []
for (y, hw, z0, z1) in loft_secs:
    ring = []
    for k in range(10):
        a = k / 10 * math.tau; c_, s_ = math.cos(a), math.sin(a)
        ring.append(bm.verts.new((hw * (abs(c_) ** 0.5) * (1 if c_ >= 0 else -1), y, (z0 + z1) / 2 + (z1 - z0) / 2 * (abs(s_) ** 0.6) * (1 if s_ >= 0 else -1))))
    rings.append(ring)
for r0, r1 in zip(rings, rings[1:]):
    for k in range(10): bm.faces.new((r0[k], r0[(k + 1) % 10], r1[(k + 1) % 10], r1[k]))
bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Tk_CarCover'); bm.to_mesh(me); bm.free(); me.materials.append(cover); uv = me.uv_layers.new()
o = bpy.data.objects.new('Tk_CarCover', me); T.objects.link(o); mk(o)
for (x, y) in ((0.72, TR1 - 3.9), (-0.72, TR1 - 3.9), (0.72, TR1 - 1.1), (-0.72, TR1 - 1.1)):
    cy(f'Tk_CoverWheel{x:+.1f}{y:.1f}', T, 0.33, 0.32, (x, y, UD + 0.37), cover, rot=(0, D90, 0), verts=10)
for s in (-1, 1): bx(f'Tk_Strap{s}', T, (W2 * 2 - 0.2, 0.05, 0.01), (0, TR1 - 3.9 + s * 0.4, UD + 0.05), TA)
bx('Tk_DeckLight', T, (0.15, 4.0, 0.03), (0, TR1 - 2.4, RZ - 0.07), inside)
bx('Tk_LowerLight', T, (0.15, 4.0, 0.03), (0, TR1 - 2.4, UD - 0.06), inside)
# the lower deck: cabinets each side (white, drawers, handles), tire racks at the front end
for s in (-1, 1):
    for k in range(3):
        y = TR1 - 0.6 - k * 1.05
        bbox(f'Tk_Cab{s}{k}', T, (0.55, 1.0, 1.15), (s * (W2 - 0.33), y, FZ + 0.6), cab_white, bev=0.01)
        for d in range(4): bx(f'Tk_CabHandle{s}{k}{d}', T, (0.01, 0.5, 0.02), (s * (W2 - 0.61), y, FZ + 0.3 + d * 0.26), alu)
    bbox(f'Tk_Worktop{s}', T, (0.58, 3.2, 0.04), (s * (W2 - 0.33), TR1 - 1.65, FZ + 1.2), grey, bev=0.005)
for k in range(3):
    for j in range(2):
        lathe(f'Tk_RackTyre{k}{j}', T, [(0.18, -0.15), (0.31, -0.15), (0.33, -0.1), (0.33, 0.1), (0.31, 0.15), (0.18, 0.15)], P(-0.6 + j * 1.2, TR1 - 4.2, FZ + 0.15 + k * 0.3), tyre, segs=12, rot=(0, 0, 0))   # (lying flat, stacked)
bx('Tk_RackPost', T, (0.06, 0.06, 1.3), (0, TR1 - 4.2, FZ + 0.65), alu)
# the tail lift, down: its platform at the floor (KEEP CLEAR, the chevrons on its edge), the rams up to the trailer
bbox('Tk_TailLift', T, (W2 * 2 - 0.1, 1.0, 0.06), (0, TR1 + 0.55, 0.03), tread, bev=0.006)
cd('Tk_Chevron', T, W2 * 2 - 0.2, 0.08, (0, TR1 + 1.04, 0.065), print_('Tk_Chev', 'tk_chevron'), tilt=-D90)
cd('Tk_KeepClear', T, 1.0, 0.25, (0, TR1 + 0.5, 0.0625), print_('Tk_Keep', 'tk_keepclear'), rotz=math.pi, tilt=-D90)
for s in (-1, 1):
    rd(f'Tk_LiftRam{s}', T, P(s * (W2 - 0.25), TR1 + 0.15, 0.06), P(s * (W2 - 0.25), TR1 - 0.25, FZ - 0.15), 0.04, chrome, verts=8)
    beam(f'Tk_LiftArm{s}', T, (s * (W2 - 0.12), TR1 + 0.45, 0.06), (s * (W2 - 0.12), TR1 - 0.2, FZ - 0.12), 0.1, 0.12, chassis); mk(T.objects[f'Tk_LiftArm{s}'])
bbox('Tk_Ramp', T, (W2 * 2 - 0.4, 0.5, 0.04), (0, TR1 + 1.28, 0.02), tread, rot=(-0.08, 0, 0), bev=0.005)   # (the lip down to the floor)

# ================= hooks =================
empty('STAND_mechanic', T, (0.8, TR1 + 1.9, 0), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='lean', role='mechanic')   # (at the ramp, facing in)

if '--noao' not in args:
    skip = tuple(m for m in bpy.data.materials if m.name == 'Tk_Script')
    print('AO baked on', bake_ao(T, skip=skip, wall=False), 'objects')
export_station(T, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'truck-start.blend'))
print('TRUCK objects', len(T.all_objects), 'triangles', tris(T))
