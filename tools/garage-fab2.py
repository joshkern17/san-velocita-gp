# The composites shop (Fabrication level 2: the home garage's station_fab2, see docs/GARAGE-KIT.md), for the Factory's
# clean room (tools/garage-factory.py: SLOT_fab2 on the composites room's back wall, beside station_fab). A team's carbon
# shop: the autoclave on its cradles against the back wall (the domed door on its hinge arm with the locking ring,
# gauges and the maker's plate, the trolley rails out of it), its controller with the cure cycle on screen and the stack
# light, the shelf of moulds over it; the layup table (cutting mat, plies and templates, a nose mould half laid, the ply
# book), the pre-preg freezer, the flatbed ply cutter with its gantry and the roll, the vacuum pump and its hoses, the
# bagging trolley. In use (BUSY_fab2_): the cure running (screen and green light) and a part bagged on the table under
# vacuum; not (IDLE_fab2_): the screen dark, the plies stacked. Built round its own origin: floor z 0, its back on y 0,
# its front down -Y, within x -2.1..2.2, y -5.2..0 (fab's bay stands left of it).
#   Blender --background --python tools/garage-fab2.py -- [--out ...glb] [--blend] [--noao]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_fab2.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import garagelib as G
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=8812)
if not os.path.exists(os.path.join(ART, 'f2_cure.png')): subprocess.run(['/usr/local/bin/python3', os.path.join(HERE, 'garage-signs-ws3.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
P = lambda x, y, z=0.0: Vector((x, y, z))

# ---------------- materials (a clean room: smooth paint, light grime; the steel of the vessel a little more used) ----
white = plain_mat('F2_White', (0.86, 0.87, 0.88), dirt=0.06, rough=0.5)
greyp = plain_mat('F2_Grey', (0.5, 0.52, 0.55), dirt=0.08)
darkp = plain_mat('F2_Dark', (0.13, 0.14, 0.16), dirt=0.06)
bluep = plain_mat('F2_Blue', (0.14, 0.32, 0.6), dirt=0.06)
vessel = plain_mat('F2_Vessel', (0.78, 0.79, 0.78), dirt=0.1, rough=0.45)   # (smooth paint: the metal tiles read as camouflage over a big vessel)
steel = grimy_tile('F2_Steel', 'galvanized_metal.png', dirt=0.1)
alu = grimy_tile('F2_Alu', 'galvanized_metal.png', dirt=0.05, tint=(0.78, 0.8, 0.82))
rubber = plain_mat('F2_Rubber', (0.06, 0.06, 0.07), dirt=0.02)
mat_green = plain_mat('F2_Mat', (0.12, 0.36, 0.2), dirt=0.04)   # (the cutting mat)
mould = plain_mat('F2_Mould', (0.32, 0.3, 0.28), dirt=0.08, rough=0.4)   # (tooling board, a warm grey)
# carbon: a fine 2x2 twill, glossy black with grey threads
n = 32; yy, xx = np.mgrid[0:n, 0:n]; tw = (((xx // 2) + (yy // 2)) % 4 < 2).astype(np.float32)
carbon = mat_img('F2_Carbon', px_tex('F2_Carbon', np.stack([0.08 + 0.1 * tw] * 3, -1)), 0.3)
# pre-preg on its roll: carbon with a yellow backing paper showing at the edge
prepreg = mat_img('F2_Prepreg', px_tex('F2_Prepreg', np.stack([0.1 + 0.08 * tw, 0.1 + 0.08 * tw, 0.11 + 0.08 * tw], -1)), 0.35)
backing = plain_mat('F2_Backing', (0.86, 0.78, 0.3), dirt=0.03)
bagfilm = solid_mat('F2_BagFilm', (0.75, 0.55, 0.85), 0.2)   # (the vacuum bag: a purple-pink film, as the real nylon)
breather = plain_mat('F2_Breather', (0.9, 0.9, 0.88), dirt=0.02, fleck=0.08, rough=0.95)
red = plain_mat('F2_Red', (0.7, 0.08, 0.06), dirt=0.04)
def glow(name, png, k=1.4): return art_mat(name, A(png), dirt=0.03, emit=k, rough=0.3)
def print_(name, png, d=0.08): return art_mat(name, A(png), dirt=d)
screen_off = solid_mat('F2_ScreenOff', (0.02, 0.025, 0.03), 0.2)
green_on = mat_img('F2_GreenOn', None, 0.4, emit=((0.2, 1.0, 0.35), 6.0)); green_off = solid_mat('F2_GreenOff', (0.05, 0.2, 0.08), 0.4)
amber_off = solid_mat('F2_AmberOff', (0.3, 0.2, 0.04), 0.4); red_off = solid_mat('F2_RedOff', (0.25, 0.04, 0.03), 0.4)
gauge_face = plain_mat('F2_GaugeFace', (0.92, 0.92, 0.9), dirt=0.02)

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
f2 = collection('station_fab2', stations); f2.instance_offset = (0, 0, 0)

# ================= the autoclave: a vessel on its side along the back wall, the door at its right end =================
AY, AZ, AR = -0.85, 1.0, 0.62          # (its axis: y, height; its radius)
AX0, AX1 = -2.0, 0.55                  # (the shell's ends: the back dome, the door's flange)
lathe('F2_Ac_Shell', f2, [(AR, 0.0), (AR, AX1 - AX0)], P(AX0, AY, AZ), vessel, segs=20, rot=(0, D90, 0), cap0=False, cap1=False)
lathe('F2_Ac_BackDome', f2, [(0.0, -0.32), (AR * 0.55, -0.27), (AR * 0.85, -0.16), (AR, 0.0)], P(AX0, AY, AZ), vessel, segs=20, rot=(0, D90, 0), cap1=False)
for k, x in enumerate((AX0 + 0.25, AX0 + 1.25, AX1 - 0.25)):   # (stiffening rings round the shell)
    lathe(f'F2_Ac_Rib{k}', f2, [(AR, -0.04), (AR + 0.035, -0.04), (AR + 0.035, 0.04), (AR, 0.04)], P(x, AY, AZ), vessel, segs=20, rot=(0, D90, 0), cap0=False, cap1=False)
# the door: a flange ring on the shell, the locking ring with its lugs, the dome, the hinge arm to a post
lathe('F2_Ac_Flange', f2, [(AR - 0.02, 0.0), (AR + 0.09, 0.0), (AR + 0.09, 0.1), (AR - 0.02, 0.1)], P(AX1, AY, AZ), steel, segs=20, rot=(0, D90, 0))
lathe('F2_Ac_LockRing', f2, [(AR + 0.0, 0.0), (AR + 0.13, 0.0), (AR + 0.13, 0.08), (AR + 0.0, 0.08)], P(AX1 + 0.1, AY, AZ), darkp, segs=20, rot=(0, D90, 0))
for k in range(8):
    a = k * math.tau / 8
    bx(f'F2_Ac_Lug{k}', f2, (0.1, 0.06, 0.08), P(AX1 + 0.14, AY + math.cos(a) * (AR + 0.16), AZ + math.sin(a) * (AR + 0.16)), darkp, rot=(a, 0, 0))
lathe('F2_Ac_Door', f2, [(0.0, 0.34), (AR * 0.5, 0.3), (AR * 0.82, 0.2), (AR + 0.06, 0.04), (AR + 0.06, 0.0), (0.0, 0.0)], P(AX1 + 0.18, AY, AZ), vessel, segs=20, rot=(0, D90, 0))
rd('F2_Ac_HingeArm', f2, P(AX1 + 0.3, AY, AZ + AR + 0.05), P(AX1 + 0.3, AY - AR - 0.25, AZ + AR + 0.05), 0.035, steel, verts=8)
rd('F2_Ac_HingeKnuckle', f2, P(AX1 + 0.3, AY - AR - 0.25, AZ + AR - 0.2), P(AX1 + 0.3, AY - AR - 0.25, AZ + AR + 0.3), 0.05, steel, verts=8)
bbox('F2_Ac_HingePost', f2, (0.14, 0.14, AZ + AR - 0.2), P(AX1 + 0.3, AY - AR - 0.25, (AZ + AR - 0.2) / 2), greyp, bev=0.01)
bx('F2_Ac_HingePostFoot', f2, (0.26, 0.26, 0.02), P(AX1 + 0.3, AY - AR - 0.25, 0.01), steel)
# its cradles and feet, the pipework on top (the gas in, the safety valve), two gauges and the maker's plate
for k, x in enumerate((AX0 + 0.35, AX1 - 0.35)):
    bbox(f'F2_Ac_Cradle{k}', f2, (0.16, 1.1, AZ - AR * 0.55), P(x, AY, (AZ - AR * 0.55) / 2), greyp, bev=0.01)
    for s in (-1, 1): bx(f'F2_Ac_CradleFoot{k}{s}', f2, (0.24, 0.24, 0.02), P(x, AY + s * 0.42, 0.01), steel)
for k, (x, h_) in enumerate(((AX0 + 0.7, 0.28), (AX0 + 1.5, 0.18))):
    rd(f'F2_Ac_Nozzle{k}', f2, P(x, AY, AZ + AR - 0.02), P(x, AY, AZ + AR + h_), 0.045, steel, verts=10)
    lathe(f'F2_Ac_NozzleFlange{k}', f2, [(0.0, 0.0), (0.08, 0.0), (0.08, 0.025), (0.0, 0.025)], P(x, AY, AZ + AR + h_), steel, segs=10)
sweep('F2_Ac_GasLine', f2, [P(AX0 + 0.7, AY, AZ + AR + 0.3), P(AX0 + 0.7, AY + 0.3, AZ + AR + 0.45), P(AX0 + 0.7, -0.12, AZ + AR + 0.45), P(AX0 + 0.7, -0.08, 2.6)], 0.022, steel, segs=6, per_m=8)
lathe('F2_Ac_SafetyValve', f2, [(0.0, 0.0), (0.05, 0.0), (0.05, 0.12), (0.03, 0.14), (0.03, 0.2), (0.0, 0.22)], P(AX0 + 1.5, AY, AZ + AR + 0.2), red, segs=10)
for k, x in enumerate((AX1 - 0.55, AX1 - 0.3)):   # (gauges on the front of the shell, on stubs)
    rd(f'F2_Ac_GaugeStub{k}', f2, P(x, AY - AR + 0.02, AZ + 0.25), P(x, AY - AR - 0.08, AZ + 0.25), 0.012, steel, verts=6)
    lathe(f'F2_Ac_Gauge{k}', f2, [(0.0, 0.0), (0.07, 0.0), (0.07, 0.04), (0.0, 0.04)], P(x, AY - AR - 0.08, AZ + 0.25), steel, segs=12, rot=(D90, 0, 0))
    cy(f'F2_Ac_GaugeFace{k}', f2, 0.06, 0.004, P(x, AY - AR - 0.122, AZ + 0.25), gauge_face, rot=(D90, 0, 0), verts=12)
    bx(f'F2_Ac_GaugeNeedle{k}', f2, (0.004, 0.003, 0.05), P(x + 0.01, AY - AR - 0.126, AZ + 0.26), red, rot=(0, (0.5, -0.4)[k], 0))
cd('F2_Ac_Plate', f2, 0.3, 0.15, P(AX0 + 0.6, AY - AR - 0.01, AZ + 0.05), print_('F2_PlateArt', 'f2_plate', 0.05), tilt=0.0)
mk(G.card('F2_Ac_PlateBack', f2, 0.3, 0.15, P(AX0 + 0.6, AY - AR + 0.005, AZ + 0.05), greyp, rotz=math.pi))   # (its back: never see-through)
# the trolley rails, out of the vessel along its floor toward the door end, a cart parked at their end with a mould tray
for s in (-1, 1): bx(f'F2_Ac_Rail{s}', f2, (1.0, 0.04, 0.05), P(AX1 + 1.05, AY + s * 0.28, 0.025), steel)
bbox('F2_Ac_Cart', f2, (0.7, 0.66, 0.08), P(AX1 + 1.2, AY, 0.16), steel, bev=0.008)
for sx in (-1, 1):
    for sy in (-1, 1): cy(f'F2_Ac_CartWheel{sx}{sy}', f2, 0.05, 0.03, P(AX1 + 1.2 + sx * 0.25, AY + sy * 0.28, 0.06), rubber, rot=(D90, 0, 0), verts=8)

# ================= the controller: a cabinet at the vessel's door end, the cure on screen, the stack light =================
CX, CY_ = 1.85, -0.3
bbox('F2_Ctl_Cabinet', f2, (0.6, 0.45, 1.8), P(CX, CY_, 0.9), white, bev=0.012)
bx('F2_Ctl_Plinth', f2, (0.56, 0.41, 0.08), P(CX, CY_, 0.04), darkp)
bbox('F2_Ctl_Bezel', f2, (0.44, 0.02, 0.34), P(CX, CY_ - 0.23, 1.38), darkp, bev=0.006)
mk(G.card('BUSY_fab2_Screen', f2, 0.38, 0.285, P(CX, CY_ - 0.242, 1.237), glow('F2_Cure', 'f2_cure', 1.2)))
mk(G.card('IDLE_fab2_Screen', f2, 0.38, 0.285, P(CX, CY_ - 0.242, 1.237), screen_off))
for k, (x, col_) in enumerate(((-0.12, red), (0.0, plain_mat('F2_Btn', (0.85, 0.85, 0.82), dirt=0.02)), (0.12, plain_mat('F2_BtnG', (0.1, 0.55, 0.2), dirt=0.02)))):
    cy(f'F2_Ctl_Btn{k}', f2, 0.022, 0.02, P(CX + x, CY_ - 0.235, 1.05), col_, rot=(D90, 0, 0), verts=10)
bx('F2_Ctl_Handle', f2, (0.02, 0.03, 0.3), P(CX + 0.25, CY_ - 0.235, 0.7), steel)
# the stack light on its pole on top: red, amber, green (green lit while the cure runs)
rd('F2_Ctl_Pole', f2, P(CX - 0.2, CY_, 1.8), P(CX - 0.2, CY_, 2.05), 0.015, steel, verts=8)
for k, (mo, nm) in enumerate(((red_off, 'Red'), (amber_off, 'Amber'))):
    cy(f'F2_Ctl_Stack{nm}', f2, 0.045, 0.08, P(CX - 0.2, CY_, 2.29 - k * 0.085), mo, verts=12)
cy('BUSY_fab2_StackGreen', f2, 0.045, 0.08, P(CX - 0.2, CY_, 2.12), green_on, verts=12)
cy('IDLE_fab2_StackGreen', f2, 0.045, 0.08, P(CX - 0.2, CY_, 2.12), green_off, verts=12)
lathe('F2_Ctl_StackCap', f2, [(0.0, 0.0), (0.05, 0.0), (0.04, 0.03), (0.0, 0.04)], P(CX - 0.2, CY_, 2.335), darkp, segs=12)
sweep('F2_Ctl_Conduit', f2, [P(CX - 0.3, CY_, 0.5), P(CX - 0.55, CY_ - 0.05, 0.5), P(AX1 + 0.4, AY + 0.4, 0.4), P(AX1 + 0.1, AY + 0.4, AZ - 0.4)], 0.02, darkp, segs=5, per_m=6)

# ================= the mould shelf over the vessel: a steel shelf on brackets, moulds on it =================
SZ = 2.25
bbox('F2_Shelf', f2, (4.0, 0.5, 0.04), P(0.0, -0.27, SZ), steel, bev=0.004)
for x in (-1.9, -0.6, 0.7, 1.95): prism_ = bx(f'F2_ShelfBracket{x:+.1f}', f2, (0.04, 0.45, 0.04), P(x, -0.25, SZ - 0.06), steel); bx(f'F2_ShelfStrut{x:+.1f}', f2, (0.03, 0.03, 0.4), P(x, -0.06, SZ - 0.25), steel)
# (a nose mould: half a cone in tooling board; a front wing mould: a long flat block with its profile; a sidepod one)
lathe('F2_MouldNose', f2, [(0.0, 0.0), (0.06, 0.03), (0.13, 0.35), (0.16, 0.7), (0.16, 0.72), (0.0, 0.72)], P(-1.6, -0.27, SZ + 0.02), mould, segs=10, rot=(0, D90, 0))
bbox('F2_MouldWing', f2, (1.2, 0.36, 0.12), P(-0.2, -0.27, SZ + 0.08), mould, bev=0.02)
bx('F2_MouldWingLip', f2, (1.2, 0.04, 0.05), P(-0.2, -0.43, SZ + 0.165), mould)
bbox('F2_MouldPod', f2, (0.8, 0.4, 0.28), P(1.3, -0.27, SZ + 0.16), mould, bev=0.06)
for k, x in enumerate((-0.95, 0.75)): mk(G.card(f'F2_MouldTag{k}', f2, 0.12, 0.05, P(x, -0.525, SZ + 0.03), plain_mat(f'F2_Tag{k}', (0.95, 0.85, 0.2), dirt=0.02)))
# the sign over it all
cd('F2_Sign', f2, 1.6, 0.4, P(0.0, -0.03, 2.75), print_('F2_SignArt', 'f2_sign', 0.04))

# ================= the layup table: white frame, the green cutting mat, plies, templates, the nose mould half laid ===
TX, TY, TZ = 0.25, -2.75, 0.9
bbox('F2_Table_Top', f2, (2.2, 1.2, 0.05), P(TX, TY, TZ - 0.025), white, bev=0.008)
for sx in (-1, 1):
    for sy in (-1, 1): bx(f'F2_Table_Leg{sx}{sy}', f2, (0.06, 0.06, TZ - 0.05), P(TX + sx * 1.0, TY + sy * 0.52, (TZ - 0.05) / 2), alu)
for sy in (-1, 1): bx(f'F2_Table_Rail{sy}', f2, (2.0, 0.04, 0.06), P(TX, TY + sy * 0.52, 0.25), alu)
bx('F2_Table_Shelf', f2, (2.0, 1.0, 0.025), P(TX, TY, 0.28), greyp)
bx('F2_Table_Mat', f2, (2.1, 1.1, 0.006), P(TX, TY, TZ + 0.003), mat_green)
lathe('F2_Table_RollHolder', f2, [(0.04, 0.0), (0.04, 1.1)], P(TX - 1.08, TY - 0.55, TZ + 0.14), steel, segs=8, rot=(-D90, 0, 0))
lathe('F2_Table_Roll', f2, [(0.0, 0.0), (0.1, 0.0), (0.1, 0.9), (0.0, 0.9)], P(TX - 1.08, TY - 0.45, TZ + 0.14), prepreg, segs=12, rot=(-D90, 0, 0))
for s in (-1, 1): bx(f'F2_Table_RollBracket{s}', f2, (0.03, 0.03, 0.16), P(TX - 1.08, TY + s * 0.56, TZ + 0.08), steel)
# (the nose mould on the table, half laid: its dark board with plies over the first half, a couple loose beside it)
lathe('F2_Table_NoseMould', f2, [(0.0, 0.0), (0.05, 0.03), (0.11, 0.3), (0.14, 0.62), (0.14, 0.64), (0.0, 0.64)], P(TX - 0.6, TY + 0.15, TZ + 0.05), mould, segs=10, rot=(0, D90, 0))
lathe('F2_Table_NosePlies', f2, [(0.0, 0.0), (0.056, 0.03), (0.116, 0.3), (0.116, 0.32), (0.0, 0.32)], P(TX - 0.6, TY + 0.15, TZ + 0.05), carbon, segs=10, rot=(0, D90, 0))
for k, (x, y, a, w_, d_) in enumerate(((0.35, 0.2, 0.2, 0.42, 0.28), (0.55, -0.05, -0.3, 0.36, 0.22), (0.2, -0.25, 0.6, 0.3, 0.3))):
    bx(f'F2_Table_Ply{k}', f2, (w_, d_, 0.003), P(TX + x, TY + y, TZ + 0.0075 + k * 0.002), carbon, rot=(0, 0, a))
    bx(f'F2_Table_PlyBacking{k}', f2, (w_ * 0.4, d_, 0.003), P(TX + x - w_ * 0.3 * math.cos(a), TY + y - w_ * 0.3 * math.sin(a), TZ + 0.0095 + k * 0.002), backing, rot=(0, 0, a))
bx('F2_Table_Template', f2, (0.5, 0.3, 0.004), P(TX + 0.85, TY + 0.3, TZ + 0.008), plain_mat('F2_Template', (0.75, 0.78, 0.8), dirt=0.03, rough=0.3), rot=(0, 0, 0.1))
cd('F2_Table_PlyBook', f2, 0.2, 0.26, P(TX + 0.85, TY - 0.32, TZ + 0.009), print_('F2_PlyBookArt', 'f2_plybook', 0.03), rotz=math.pi + 0.15, tilt=-D90)
rd('F2_Table_Knife', f2, P(TX + 0.6, TY - 0.42, TZ + 0.012), P(TX + 0.72, TY - 0.36, TZ + 0.012), 0.008, plain_mat('F2_KnifeY', (0.9, 0.75, 0.1), dirt=0.02), verts=6)
for k in range(2): rd(f'F2_Table_Roller{k}', f2, P(TX + 0.95 + k * 0.08, TY - 0.05, TZ + 0.02), P(TX + 0.95 + k * 0.08, TY + 0.1, TZ + 0.02), 0.015, steel, verts=8)
# in use: a part under its bag on the table's right, the hose to the pump; idle: the plies stacked there instead
bbox('BUSY_fab2_BagPart', f2, (0.62, 0.42, 0.07), P(TX + 0.55, TY - 0.08, TZ + 0.04), bagfilm, bev=0.02)
bx('BUSY_fab2_BagBreather', f2, (0.66, 0.46, 0.005), P(TX + 0.55, TY - 0.08, TZ + 0.0085), breather)
bx('BUSY_fab2_BagTape', f2, (0.7, 0.5, 0.004), P(TX + 0.55, TY - 0.08, TZ + 0.007), plain_mat('F2_Tacky', (0.85, 0.7, 0.2), dirt=0.03))
lathe('BUSY_fab2_BagPort', f2, [(0.0, 0.0), (0.04, 0.0), (0.03, 0.04), (0.015, 0.06), (0.0, 0.06)], P(TX + 0.75, TY - 0.08, TZ + 0.075), darkp, segs=10)
sweep('BUSY_fab2_BagHose', f2, [P(TX + 0.75, TY - 0.08, TZ + 0.13), P(TX + 1.05, TY - 0.1, TZ + 0.2), P(TX + 1.25, TY - 0.25, TZ - 0.1), P(1.75, -2.6, 0.32)], 0.014, rubber, segs=6, per_m=8)
for k in range(5): bx(f'IDLE_fab2_PlyStack{k}', f2, (0.5, 0.36, 0.004), P(TX + 0.55, TY - 0.08, TZ + 0.008 + k * 0.004), carbon if k % 2 else backing, rot=(0, 0, 0.05 * k))

# ================= the vacuum pump on the floor by the table, its gauge and hoses =================
VX, VY = 1.75, -2.6
bbox('F2_Vac_Body', f2, (0.36, 0.28, 0.26), P(VX, VY, 0.17), bluep, bev=0.02)
cy('F2_Vac_Motor', f2, 0.1, 0.24, P(VX - 0.24, VY, 0.17), darkp, rot=(0, D90, 0), verts=12)
for k in range(5): bx(f'F2_Vac_Fin{k}', f2, (0.004, 0.22, 0.2), P(VX - 0.3 - k * 0.0, VY - 0.08 + k * 0.04, 0.17), darkp)
bx('F2_Vac_Base', f2, (0.62, 0.3, 0.04), P(VX - 0.08, VY, 0.02), steel)
rd('F2_Vac_GaugeStub', f2, P(VX + 0.05, VY, 0.3), P(VX + 0.05, VY, 0.38), 0.01, steel, verts=6)
lathe('F2_Vac_Gauge', f2, [(0.0, 0.0), (0.05, 0.0), (0.05, 0.03), (0.0, 0.03)], P(VX + 0.05, VY - 0.015, 0.42), steel, segs=10, rot=(D90, 0, 0))
cy('F2_Vac_GaugeFace', f2, 0.042, 0.003, P(VX + 0.05, VY - 0.047, 0.42), gauge_face, rot=(D90, 0, 0), verts=10)
lathe('F2_Vac_HoseCoil', f2, [(0.12, 0.0), (0.15, 0.02), (0.12, 0.04), (0.15, 0.06), (0.12, 0.08)], P(VX + 0.05, VY + 0.4, 0.0), rubber, segs=12, cap0=False, cap1=False)

# ================= the pre-preg freezer, left of the table, its door to the table =================
FX, FY = -1.75, -2.85
bbox('F2_Freezer', f2, (0.72, 0.75, 1.85), P(FX, FY, 0.925), white, bev=0.02)
bbox('F2_Freezer_Door', f2, (0.03, 0.7, 1.75), P(FX + 0.37, FY, 0.94), white, bev=0.008)
bx('F2_Freezer_Handle', f2, (0.03, 0.04, 0.5), P(FX + 0.4, FY - 0.28, 1.1), steel)
cd('F2_Freezer_Display', f2, 0.16, 0.12, P(FX + 0.388, FY + 0.15, 1.45), glow('F2_FreezerArt', 'f2_freezer', 0.8), rotz=D90)
bx('F2_Freezer_Kick', f2, (0.7, 0.72, 0.06), P(FX, FY, 0.03), darkp)
mk(G.card('F2_Freezer_Log', f2, 0.16, 0.22, P(FX + 0.388, FY + 0.12, 1.1), print_('F2_LogArt', 'f2_plybook', 0.05), rotz=D90))
for k in range(3): lathe(f'F2_Freezer_Roll{k}', f2, [(0.0, 0.0), (0.07, 0.0), (0.07, 0.62), (0.0, 0.62)], P(FX - 0.25 + k * 0.17, FY - 0.31, 1.87), prepreg, segs=10, rot=(-D90, 0, 0))   # (rolls on top, waiting)

# ================= the flatbed ply cutter at the front: its bed, the gantry with the cutting head, the roll feed =====
KX, KY = 1.0, -4.62
bbox('F2_Cut_Bed', f2, (2.1, 0.95, 0.06), P(KX, KY, 0.88), darkp, bev=0.006)
bx('F2_Cut_Felt', f2, (2.0, 0.85, 0.008), P(KX, KY, 0.914), plain_mat('F2_Felt', (0.2, 0.24, 0.28), dirt=0.02, fleck=0.1, rough=0.95))
bbox('F2_Cut_Base', f2, (2.0, 0.85, 0.7), P(KX, KY, 0.45), white, bev=0.01)
bx('F2_Cut_Kick', f2, (1.96, 0.8, 0.08), P(KX, KY, 0.04), darkp)
for s in (-1, 1): bx(f'F2_Cut_Track{s}', f2, (2.1, 0.06, 0.06), P(KX, KY + s * 0.47, 0.94), alu)
GX = KX + 0.2
bbox('F2_Cut_Gantry', f2, (0.14, 1.06, 0.1), P(GX, KY, 1.1), alu, bev=0.01)
for s in (-1, 1): bbox(f'F2_Cut_GantryLeg{s}', f2, (0.14, 0.08, 0.2), P(GX, KY + s * 0.5, 1.0), alu, bev=0.008)
bbox('F2_Cut_Head', f2, (0.16, 0.14, 0.22), P(GX, KY - 0.12, 1.02), white, bev=0.015)
rd('F2_Cut_Knife', f2, P(GX, KY - 0.12, 0.91), P(GX, KY - 0.12, 0.93), 0.008, steel, verts=6)
for k, (x, y, a) in enumerate(((KX - 0.5, KY + 0.1, 0.0), (KX + 0.55, KY - 0.15, 0.4))):
    bx(f'F2_Cut_Ply{k}', f2, (0.5, 0.32, 0.003), P(x, y, 0.92), carbon, rot=(0, 0, a))
lathe('F2_Cut_Roll', f2, [(0.0, 0.0), (0.11, 0.0), (0.11, 0.84), (0.0, 0.84)], P(KX - 1.12, KY - 0.42, 0.8), prepreg, segs=12, rot=(-D90, 0, 0))
for s in (-1, 1): bx(f'F2_Cut_RollArm{s}', f2, (0.04, 0.03, 0.25), P(KX - 1.12, KY + s * 0.44, 0.7), steel)
bbox('F2_Cut_Pendant', f2, (0.24, 0.05, 0.18), P(KX + 0.95, KY - 0.5, 1.1), darkp, bev=0.01, rot=(-0.4, 0, 0))
mk(G.card('F2_Cut_PendantScreen', f2, 0.18, 0.12, P(KX + 0.95, KY - 0.528, 1.05), glow('F2_PendantArt', 'f2_cure', 0.6), tilt=0.4))
rd('F2_Cut_PendantArm', f2, P(KX + 0.95, KY - 0.47, 1.05), P(KX + 0.95, KY - 0.35, 0.92), 0.015, steel, verts=6)

# ================= the bagging trolley, front left: rolls of bag film and breather, tapes, the tool tray =================
BX_, BY_ = -1.55, -4.55
bbox('F2_Trolley_Top', f2, (0.8, 0.5, 0.03), P(BX_, BY_, 0.9), steel, bev=0.005)
bbox('F2_Trolley_Low', f2, (0.8, 0.5, 0.03), P(BX_, BY_, 0.2), steel, bev=0.005)
for sx in (-1, 1):
    for sy in (-1, 1):
        bx(f'F2_Trolley_Post{sx}{sy}', f2, (0.03, 0.03, 0.8), P(BX_ + sx * 0.38, BY_ + sy * 0.23, 0.53), steel)
        cy(f'F2_Trolley_Wheel{sx}{sy}', f2, 0.04, 0.025, P(BX_ + sx * 0.36, BY_ + sy * 0.22, 0.045), rubber, rot=(0, D90, 0), verts=8)
rd('F2_Trolley_Handle', f2, P(BX_ - 0.4, BY_ - 0.22, 1.0), P(BX_ - 0.4, BY_ + 0.22, 1.0), 0.014, darkp, verts=6)
for s in (-1, 1): rd(f'F2_Trolley_HandlePost{s}', f2, P(BX_ - 0.38, BY_ + s * 0.22, 0.9), P(BX_ - 0.4, BY_ + s * 0.22, 1.0), 0.012, steel, verts=6)
for k, (mo, r) in enumerate(((bagfilm, 0.07), (breather, 0.08), (plain_mat('F2_Peel', (0.85, 0.55, 0.45), dirt=0.02), 0.06))):
    lathe(f'F2_Trolley_Roll{k}', f2, [(0.0, 0.0), (r, 0.0), (r, 0.45), (0.0, 0.45)], P(BX_ - 0.2 + k * 0.2, BY_ + 0.22, 0.215 + r), mo, segs=10, rot=(D90, 0, 0))   # (on the low shelf)
for k in range(3): lathe(f'F2_Trolley_Tape{k}', f2, [(0.02, 0.0), (0.045, 0.0), (0.045, 0.02), (0.02, 0.02)], P(BX_ - 0.2 + k * 0.12, BY_ - 0.1, 0.915), plain_mat(f'F2_TapeC{k}', ((0.85, 0.7, 0.2), (0.9, 0.9, 0.88), (0.2, 0.5, 0.8))[k], dirt=0.02), segs=10, cap0=False, cap1=False)
bbox('F2_Trolley_Tray', f2, (0.3, 0.22, 0.05), P(BX_ + 0.2, BY_ - 0.05, 0.94), darkp, bev=0.008)
rd('F2_Trolley_Scissors', f2, P(BX_ + 0.12, BY_ - 0.08, 0.97), P(BX_ + 0.26, BY_ - 0.02, 0.97), 0.006, plain_mat('F2_Orange', (0.9, 0.45, 0.1), dirt=0.02), verts=5)

# ================= where people work =================
empty('STAND_fab', f2, P(TX - 0.1, -1.72), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='lean', role='fab')        # (at the layup table, from the vessel's side)
empty('STAND_fab.001', f2, P(KX + 0.2, -3.75), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='lean', role='fab')     # (at the cutter)
empty('STAND_any', f2, P(CX - 0.05, -0.95), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='any')   # (watching the cure)

if '--noao' not in args:
    print('AO baked on', bake_ao(f2, skip=(bagfilm,)), 'objects')
export_station(f2, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'fab2-start.blend'))
print('FAB2 objects', len(f2.all_objects), 'triangles', tris(f2))
