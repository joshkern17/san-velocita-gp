# The machine shop (Tools level 3: the home garage's station_tools3, see docs/GARAGE-KIT.md), for the Factory's machine
# shop (tools/garage-factory.py: SLOT_tools3 on the room's back wall). A team's machining cell: two CNC machining centres
# (enclosures with their sliding doors and windows, the spindle head inside over the table and vice, the control pendant
# on its arm with the program on screen, the coolant tank, the chip conveyor out to its swarf bin, the maker's badge),
# a manual lathe on its stand (headstock, chuck, carriage, tailstock, splash guard, chip tray), a CMM on its granite
# table with the bridge and the probe and its PC, the tool cabinet with holders racked, the bench along the side with
# micrometers, the drawing and a tray of machined uprights, the rule board. In use (BUSY_tools3_): the machines' insides
# lit and their screens on; not (IDLE_tools3_): dark. Built round its own origin: floor z 0, its back on y 0, front
# down -Y, within x -5.3..5.3, y -4.0..0.
#   Blender --background --python tools/garage-tools3.py -- [--out ...glb] [--blend] [--noao]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_tools3.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import garagelib as G
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=7733)
if not os.path.exists(os.path.join(ART, 't3_cnc.png')): subprocess.run(['/usr/local/bin/python3', os.path.join(HERE, 'garage-signs-ws3.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
P = lambda x, y, z=0.0: Vector((x, y, z))

# ---------------- materials: machine paint smooth (the tiles' blotches read as camouflage on big panels), steel worked
mgrey = plain_mat('T3_MachineGrey', (0.72, 0.74, 0.76), dirt=0.12, rough=0.45)
mdark = plain_mat('T3_MachineDark', (0.18, 0.19, 0.21), dirt=0.1)
mblue = plain_mat('T3_MachineBlue', (0.12, 0.28, 0.52), dirt=0.1)
lathe_green = plain_mat('T3_LatheGreen', (0.3, 0.42, 0.36), dirt=0.16)   # (an old lathe's machine green)
red = plain_mat('T3_Red', (0.72, 0.1, 0.07), dirt=0.08)
yellow = plain_mat('T3_Yellow', (0.9, 0.72, 0.1), dirt=0.1)
steel = grimy_tile('T3_Steel', 'galvanized_metal.png', dirt=0.18)
bright = grimy_tile('T3_Bright', 'galvanized_metal.png', dirt=0.06, tint=(0.85, 0.86, 0.88))   # (ground and turned faces)
cast = grimy_tile('T3_Cast', 'scratched_metal.png', dirt=0.3, tint=(0.42, 0.43, 0.44))
granite = plain_mat('T3_Granite', (0.16, 0.16, 0.17), dirt=0.02, fleck=0.12, rough=0.35)
rubber = plain_mat('T3_Rubber', (0.06, 0.06, 0.07), dirt=0.03)
wood = grimy_tile('T3_Bench', 'painted_metal.png', dirt=0.15, tint=(0.36, 0.3, 0.22))
glassw = solid_mat('T3_Window', (0.35, 0.42, 0.45), 0.1)
glassw.surface_render_method = 'BLENDED'; glassw.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.35
inside_on = mat_img('T3_InsideOn', None, 0.4, emit=((0.75, 0.92, 1.0), 2.2))   # (the machine's work light, coolant mist)
inside_off = solid_mat('T3_InsideOff', (0.06, 0.07, 0.08), 0.5)
screen_off = solid_mat('T3_ScreenOff', (0.02, 0.025, 0.03), 0.2)
spindle_on = mat_img('T3_SpindleOn', None, 0.4, emit=((0.2, 1.0, 0.4), 5.0)); spindle_off = solid_mat('T3_SpindleOff', (0.06, 0.2, 0.08), 0.4)
swarf = plain_mat('T3_Swarf', (0.55, 0.56, 0.58), dirt=0.05, fleck=0.3, rough=0.3)
coolant = plain_mat('T3_Coolant', (0.2, 0.45, 0.42), dirt=0.05)
def glow(name, png, k=1.3): return art_mat(name, A(png), dirt=0.03, emit=k, rough=0.3)
def print_(name, png, d=0.08): return art_mat(name, A(png), dirt=d)

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
t3 = collection('station_tools3', stations); t3.instance_offset = (0, 0, 0)

# ================= a machining centre: base, enclosure, doors with windows, the inside, the pendant, coolant, chips =====
def cnc(k, cx):
    n = f'T3_Cnc{k}'; W, D, H = 2.1, 1.75, 2.35; cy_ = -D / 2 - 0.05
    bbox(f'{n}_Base', t3, (W, D, 0.12), P(cx, cy_, 0.06), mdark, bev=0.01)
    # the enclosure: its sides, back and roof, the front's frame round the door opening
    bbox(f'{n}_Side0', t3, (0.06, D, H - 0.12), P(cx - W / 2 + 0.03, cy_, 0.12 + (H - 0.12) / 2), mgrey, bev=0.01)
    bbox(f'{n}_Side1', t3, (0.06, D, H - 0.12), P(cx + W / 2 - 0.03, cy_, 0.12 + (H - 0.12) / 2), mgrey, bev=0.01)
    bx(f'{n}_Back', t3, (W - 0.1, 0.05, H - 0.12), P(cx, cy_ + D / 2 - 0.03, 0.12 + (H - 0.12) / 2), mgrey)
    bbox(f'{n}_Roof', t3, (W, D, 0.08), P(cx, cy_, H - 0.04), mgrey, bev=0.01)
    FY = cy_ - D / 2 + 0.03
    bx(f'{n}_FrontLow', t3, (W - 0.1, 0.06, 0.62), P(cx, FY, 0.12 + 0.31), mgrey)
    bx(f'{n}_FrontHigh', t3, (W - 0.1, 0.06, 0.32), P(cx, FY, H - 0.24), mblue)
    bx(f'{n}_FrontPost', t3, (0.18, 0.06, 1.3), P(cx + W / 2 - 0.18, FY, 0.74 + 0.65), mgrey)
    # the two sliding doors, their windows, the handles (one slid half open), the inside lit when it's running
    for d_, (dx, dz) in enumerate(((-0.45, 0.0), (0.15, 0.0))):
        x = cx + dx; z0 = 0.74
        bbox(f'{n}_Door{d_}', t3, (0.78, 0.04, 1.28), P(x, FY - 0.05 - d_ * 0.04, z0 + 0.64), mgrey, bev=0.008)
        bx(f'{n}_Window{d_}', t3, (0.56, 0.02, 0.62), P(x, FY - 0.08 - d_ * 0.04, z0 + 0.78), glassw)
        bx(f'{n}_Handle{d_}', t3, (0.04, 0.05, 0.4), P(x + 0.33, FY - 0.1 - d_ * 0.04, z0 + 0.6), mdark)
    for state, mo in (('BUSY', inside_on), ('IDLE', inside_off)):
        bx(f'{state}_tools3_Cnc{k}_Inside', t3, (W - 0.25, 0.02, 1.1), P(cx, cy_ + D / 2 - 0.07, 0.74 + 0.6), mo)
    # inside: the table and vice, the spindle head on its column, the tool in it
    bbox(f'{n}_Table', t3, (1.2, 0.5, 0.08), P(cx - 0.15, cy_ + 0.1, 0.8), cast, bev=0.006)
    bbox(f'{n}_Vice', t3, (0.24, 0.16, 0.12), P(cx - 0.15, cy_ + 0.1, 0.9), bright, bev=0.006)
    bbox(f'{n}_Part', t3, (0.12, 0.1, 0.06), P(cx - 0.15, cy_ + 0.1, 0.99), bright, bev=0.004)
    bbox(f'{n}_Column', t3, (0.4, 0.35, 1.3), P(cx - 0.15, cy_ + 0.55, 0.74 + 0.65), cast, bev=0.01)
    bbox(f'{n}_Head', t3, (0.32, 0.42, 0.42), P(cx - 0.15, cy_ + 0.25, 1.55), mgrey, bev=0.02)
    lathe(f'{n}_Spindle', t3, [(0.0, 0.0), (0.08, 0.0), (0.08, 0.06), (0.05, 0.1), (0.02, 0.24), (0.0, 0.24)], P(cx - 0.15, cy_ + 0.18, 1.1), bright, segs=12)
    # the pendant on its arm off the right post, the program on screen
    rd(f'{n}_PendantArm', t3, P(cx + W / 2 - 0.12, FY - 0.03, 1.75), P(cx + W / 2 + 0.25, FY - 0.35, 1.75), 0.03, mdark, verts=8)
    bbox(f'{n}_Pendant', t3, (0.5, 0.12, 0.62), P(cx + W / 2 + 0.25, FY - 0.42, 1.45), mdark, bev=0.015, rot=(0, 0, -0.35))
    sp = P(cx + W / 2 + 0.25, FY - 0.42, 1.55) + Vector((math.sin(-0.35) * 0, 0, 0)); ang = -0.35
    off = Vector((math.sin(ang), -math.cos(ang), 0)) * 0.062
    mk(G.card(f'BUSY_tools3_Cnc{k}_Screen', t3, 0.36, 0.27, sp + off + Vector((0, 0, -0.07)), glow(f'T3_CncScreen{k}', 't3_cnc', 1.1), rotz=ang))
    mk(G.card(f'IDLE_tools3_Cnc{k}_Screen', t3, 0.36, 0.27, sp + off + Vector((0, 0, -0.07)), screen_off, rotz=ang))
    for b in range(6):
        cy(f'{n}_PendantKey{b}', t3, 0.018, 0.012, sp + off * 1.05 + Vector((math.cos(ang) * (-0.15 + b * 0.06), math.sin(ang) * (-0.15 + b * 0.06), -0.27)), (red if b == 5 else mgrey), rot=(D90, 0, ang), verts=8)
    cd(f'{n}_Badge', t3, 0.64, 0.12, P(cx - 0.4, FY - 0.035, H - 0.24), print_(f'T3_Badge{k}', 't3_badge', 0.05))
    # the spindle-running lamp on the roof
    cy(f'BUSY_tools3_Cnc{k}_Lamp', t3, 0.04, 0.09, P(cx + W / 2 - 0.2, cy_ - D / 2 + 0.2, H + 0.045), spindle_on, verts=10)
    cy(f'IDLE_tools3_Cnc{k}_Lamp', t3, 0.04, 0.09, P(cx + W / 2 - 0.2, cy_ - D / 2 + 0.2, H + 0.045), spindle_off, verts=10)
    # the coolant tank at its left foot, the chip conveyor out the left side up into the swarf bin
    bbox(f'{n}_CoolantTank', t3, (0.4, 0.9, 0.5), P(cx - W / 2 - 0.22, cy_ + 0.2, 0.25), mdark, bev=0.01)
    bx(f'{n}_CoolantWindow', t3, (0.004, 0.5, 0.06), P(cx - W / 2 - 0.42, cy_ + 0.2, 0.35), coolant)
    beam(f'{n}_Conveyor', t3, P(cx - W / 2 - 0.05, cy_ - 0.35, 0.45), P(cx - W / 2 - 0.55, cy_ - 0.35, 1.0), 0.32, 0.18, mgrey)
    bbox(f'{n}_Bin', t3, (0.5, 0.5, 0.55), P(cx - W / 2 - 0.62, cy_ - 0.35, 0.275), mblue, bev=0.01)
    bx(f'{n}_BinSwarf', t3, (0.44, 0.44, 0.04), P(cx - W / 2 - 0.62, cy_ - 0.35, 0.53), swarf)
    for w in range(2): cy(f'{n}_BinWheel{w}', t3, 0.04, 0.03, P(cx - W / 2 - 0.62 + (w - 0.5) * 0.36, cy_ - 0.58, 0.04), rubber, rot=(0, D90, 0), verts=8)
    return cy_
cnc(0, -2.75); cnc(1, -0.05)

# ================= the lathe: on its two cabinets, along the back wall at the right =================
LX, LY = 2.75, -0.55
for k, x in enumerate((LX - 0.75, LX + 0.75)):
    bbox(f'T3_Lathe_Stand{k}', t3, (0.42, 0.5, 0.8), P(x, LY, 0.4), lathe_green, bev=0.012)
bx('T3_Lathe_ChipTray', t3, (1.9, 0.62, 0.05), P(LX, LY, 0.82), steel)
bx('T3_Lathe_TrayLip', t3, (1.9, 0.02, 0.08), P(LX, LY - 0.31, 0.86), steel)
bbox('T3_Lathe_Bed', t3, (1.7, 0.32, 0.22), P(LX + 0.1, LY + 0.05, 0.96), lathe_green, bev=0.012)
for s in (-1, 1): bx(f'T3_Lathe_Way{s}', t3, (1.6, 0.06, 0.03), P(LX + 0.1, LY + 0.05 + s * 0.11, 1.085), bright)
bbox('T3_Lathe_Headstock', t3, (0.5, 0.42, 0.45), P(LX - 0.75, LY + 0.05, 1.3), lathe_green, bev=0.02)
lathe('T3_Lathe_Chuck', t3, [(0.0, 0.0), (0.13, 0.0), (0.13, 0.1), (0.04, 0.12), (0.0, 0.12)], P(LX - 0.5, LY + 0.05, 1.3), bright, segs=12, rot=(0, D90, 0))
for j in range(3):
    a = j * math.tau / 3; bx(f'T3_Lathe_Jaw{j}', t3, (0.03, 0.03, 0.06), P(LX - 0.37, LY + 0.05 + math.cos(a) * 0.08, 1.3 + math.sin(a) * 0.08), steel, rot=(a, 0, 0))
rd('T3_Lathe_Work', t3, P(LX - 0.37, LY + 0.05, 1.3), P(LX - 0.05, LY + 0.05, 1.3), 0.03, bright, verts=10)
bbox('T3_Lathe_Carriage', t3, (0.3, 0.42, 0.12), P(LX + 0.05, LY + 0.0, 1.16), lathe_green, bev=0.01)
bbox('T3_Lathe_Apron', t3, (0.3, 0.06, 0.28), P(LX + 0.05, LY - 0.2, 1.04), lathe_green, bev=0.01)
for w, x in enumerate((LX - 0.03, LX + 0.13)): cy(f'T3_Lathe_Handwheel{w}', t3, 0.06, 0.02, P(x, LY - 0.24, 1.0), bright, rot=(D90, 0, 0), verts=10)
bbox('T3_Lathe_ToolPost', t3, (0.1, 0.1, 0.1), P(LX + 0.05, LY + 0.0, 1.27), steel, bev=0.008)
bbox('T3_Lathe_Tailstock', t3, (0.22, 0.26, 0.26), P(LX + 0.75, LY + 0.05, 1.23), lathe_green, bev=0.012)
rd('T3_Lathe_Quill', t3, P(LX + 0.64, LY + 0.05, 1.3), P(LX + 0.5, LY + 0.05, 1.3), 0.025, bright, verts=8)
cy('T3_Lathe_TailWheel', t3, 0.07, 0.02, P(LX + 0.87, LY + 0.05, 1.3), bright, rot=(0, D90, 0), verts=10)
bx('T3_Lathe_Guard', t3, (0.4, 0.02, 0.28), P(LX - 0.3, LY - 0.18, 1.42), glassw)
bx('T3_Lathe_Splash', t3, (1.7, 0.02, 0.75), P(LX + 0.1, LY + 0.29, 0.845 + 0.375), steel)   # (standing in the chip tray, up behind the work)
bx('T3_Lathe_Switch', t3, (0.12, 0.06, 0.16), P(LX - 0.75, LY - 0.19, 1.3), mdark)
cy('T3_Lathe_EStop', t3, 0.025, 0.02, P(LX - 0.75, LY - 0.225, 1.33), red, rot=(D90, 0, 0), verts=10)
rd('T3_Lathe_Lamp', t3, P(LX - 0.95, LY + 0.25, 1.52), P(LX - 0.7, LY - 0.05, 1.8), 0.012, mdark, verts=6)
lathe('T3_Lathe_LampShade', t3, [(0.0, 0.0), (0.04, 0.0), (0.07, 0.08), (0.0, 0.09)], P(LX - 0.62, LY - 0.12, 1.72), mdark, segs=10, rot=(2.4, 0, 0))

# ================= the CMM on its granite: bridge, carriage, quill and probe, its PC on a stand =================
MX, MY = 4.35, -2.9
bbox('T3_Cmm_Stand', t3, (1.2, 1.0, 0.65), P(MX, MY, 0.325), mgrey, bev=0.012)
bbox('T3_Cmm_Granite', t3, (1.2, 1.0, 0.22), P(MX, MY, 0.76), granite, bev=0.01)
for s in (-1, 1): bbox(f'T3_Cmm_BridgeLeg{s}', t3, (0.1, 0.16, 0.7), P(MX + s * 0.52, MY + 0.1, 1.22), mgrey, bev=0.008)
bbox('T3_Cmm_Beam', t3, (1.16, 0.18, 0.14), P(MX, MY + 0.1, 1.62), mgrey, bev=0.01)
bbox('T3_Cmm_Carriage', t3, (0.22, 0.26, 0.24), P(MX + 0.1, MY + 0.05, 1.62), mblue, bev=0.012)
bx('T3_Cmm_Quill', t3, (0.07, 0.07, 0.62), P(MX + 0.1, MY - 0.04, 1.26), bright)
lathe('T3_Cmm_Probe', t3, [(0.0, 0.0), (0.006, 0.0), (0.006, 0.06), (0.02, 0.07), (0.02, 0.11), (0.0, 0.12)], P(MX + 0.1, MY - 0.04, 0.83), bright, segs=8)
cy('T3_Cmm_Ruby', t3, 0.008, 0.016, P(MX + 0.1, MY - 0.04, 0.88), red, verts=8)
bbox('T3_Cmm_Upright', t3, (0.14, 0.1, 0.12), P(MX + 0.1, MY - 0.04, 0.93), bright, bev=0.006)   # (an upright on the granite, being measured)
bbox('T3_Cmm_PcStand', t3, (0.12, 0.12, 1.1), P(MX - 0.75, MY - 0.4, 0.55), mdark, bev=0.008)
bx('T3_Cmm_PcFoot', t3, (0.45, 0.45, 0.03), P(MX - 0.75, MY - 0.4, 0.015), mdark)
bbox('T3_Cmm_Monitor', t3, (0.42, 0.05, 0.32), P(MX - 0.75, MY - 0.4, 1.26), mdark, bev=0.01, rot=(0, 0, 0.4))   # (on the stand's top)
mk(G.card('BUSY_tools3_CmmScreen', t3, 0.36, 0.26, P(MX - 0.75 - math.sin(0.4) * -0.0 + math.sin(0.4) * 0.028, MY - 0.4 - math.cos(0.4) * 0.028, 1.13), glow('T3_CmmArt', 't3_drawing', 0.9), rotz=0.4))
mk(G.card('IDLE_tools3_CmmScreen', t3, 0.36, 0.26, P(MX - 0.75 + math.sin(0.4) * 0.028, MY - 0.4 - math.cos(0.4) * 0.028, 1.13), screen_off, rotz=0.4))
bx('T3_Cmm_Shelf', t3, (0.42, 0.28, 0.02), P(MX - 0.75, MY - 0.48, 0.95), mdark)
bx('T3_Cmm_Keyboard', t3, (0.36, 0.14, 0.02), P(MX - 0.75, MY - 0.5, 0.97), mgrey, rot=(0, 0, 0.4))

# ================= the tool cabinet, on the back wall at the far right: holders racked on its open shelves =========
TX_ = 4.75
# (a carcass you can see into: drawers below, open shelves of holders above)
bbox('T3_ToolCab_Lower', t3, (0.9, 0.55, 0.72), P(TX_, -0.3, 0.36), mblue, bev=0.01)
for s_ in (-1, 1): bx(f'T3_ToolCab_Side{s_}', t3, (0.03, 0.55, 1.18), P(TX_ + s_ * 0.435, -0.3, 0.72 + 0.59), mblue)
bx('T3_ToolCab_Back', t3, (0.84, 0.03, 1.18), P(TX_, -0.04, 0.72 + 0.59), mdark)
bbox('T3_ToolCab_Top', t3, (0.9, 0.55, 0.04), P(TX_, -0.3, 1.92), mblue, bev=0.006)
for r in range(3):
    z = 0.85 + r * 0.42
    bx(f'T3_ToolCab_Shelf{r}', t3, (0.82, 0.5, 0.02), P(TX_, -0.33, z), mdark)
    for c in range(5):
        lathe(f'T3_Holder{r}{c}', t3, [(0.0, 0.0), (0.03, 0.0), (0.03, 0.05), (0.045, 0.06), (0.045, 0.08), (0.025, 0.1), (0.012, 0.18), (0.0, 0.2)],
              P(TX_ - 0.32 + c * 0.16, -0.43, z + 0.01), bright, segs=8)
for d in range(3): bx(f'T3_ToolCab_Drawer{d}', t3, (0.84, 0.02, 0.18), P(TX_, -0.585, 0.14 + d * 0.2), mblue)
for d in range(3): bx(f'T3_ToolCab_Pull{d}', t3, (0.3, 0.03, 0.025), P(TX_, -0.6, 0.2 + d * 0.2), bright)
cd('T3_Rules', t3, 1.5, 0.5, P(1.5, -0.03, 2.25), print_('T3_RulesArt', 't3_rules', 0.06))

# ================= the bench along the left: worktop, the drawing on its upstand, micrometers, the tray of uprights ===
BXc = -4.85
bbox('T3_Bench_Top', t3, (0.75, 1.8, 0.05), P(BXc, -2.95, 0.9), wood, bev=0.006)
for sy in (-1, 1):
    for sx in (-1, 1): bx(f'T3_Bench_Leg{sx}{sy}', t3, (0.05, 0.05, 0.87), P(BXc + sx * 0.32, -2.95 + sy * 0.85, 0.435), mdark)
bx('T3_Bench_Shelf', t3, (0.7, 1.7, 0.03), P(BXc, -2.95, 0.25), mdark)
bx('T3_Bench_Upstand', t3, (0.04, 1.8, 0.6), P(BXc - 0.36, -2.95, 1.22), mdark)
cd('T3_Bench_Drawing', t3, 0.56, 0.42, P(BXc - 0.335, -2.7, 1.0), print_('T3_DrawingArt', 't3_drawing', 0.05), rotz=D90)   # (to the room, +X)
bbox('T3_Bench_MicCase', t3, (0.28, 0.4, 0.06), P(BXc + 0.05, -3.5, 0.955), mdark, bev=0.01)
for k in range(3):   # (micrometers in their case: the frame's C, the thimble)
    bx(f'T3_Mic{k}_Frame', t3, (0.18, 0.025, 0.012), P(BXc + 0.05, -3.62 + k * 0.1, 0.99), bright)
    rd(f'T3_Mic{k}_Thimble', t3, P(BXc + 0.13, -3.62 + k * 0.1, 0.99), P(BXc + 0.21, -3.62 + k * 0.1, 0.99), 0.012, bright, verts=8)
bbox('T3_Bench_Tray', t3, (0.45, 0.32, 0.06), P(BXc + 0.05, -2.75, 0.955), mblue, bev=0.01)
for k in range(4):   # (machined uprights in the tray, alternating hands)
    bbox(f'T3_Upright{k}', t3, (0.08, 0.06, 0.16), P(BXc - 0.08 + k * 0.09, -2.75, 1.06), bright, rot=(0, 0.2 * (-1) ** k, 0.3), bev=0.006)
bbox('T3_Bench_Vice', t3, (0.14, 0.2, 0.12), P(BXc + 0.15, -2.2, 0.985), red, bev=0.01)
cy('T3_Bench_HeightGauge', t3, 0.05, 0.02, P(BXc - 0.05, -3.2, 0.935), granite, verts=10)
rd('T3_Bench_HeightPost', t3, P(BXc - 0.05, -3.2, 0.94), P(BXc - 0.05, -3.2, 1.25), 0.012, bright, verts=6)

# ================= where people work =================
empty('STAND_mechanic', t3, P(-2.4, -2.55), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='lean', role='mechanic')    # (at the first machine's pendant)
empty('STAND_mechanic.001', t3, P(LX - 0.1, -1.35), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='lean', role='mechanic')   # (at the lathe)
empty('STAND_any', t3, P(MX - 0.2, -2.05), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='any')          # (at the CMM)

if '--noao' not in args:
    print('AO baked on', bake_ao(t3, skip=(glassw,)), 'objects')
export_station(t3, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'tools3-start.blend'))
print('TOOLS3 objects', len(t3.all_objects), 'triangles', tris(t3))
