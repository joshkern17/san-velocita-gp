# The sim rig, made properly (the home garage's station_sim, Simulator level 1, see docs/GARAGE-KIT.md): a lottery
# winner's first rig, late-90s, built in the garage. An old bucket seat on a frame of welded box section, a force-
# feedback wheel clamped to a plate on the frame's column, a pedal box on a ply plate, a gear stick on the side; a
# big CRT on a TV stand against the wall (the racing game on it), the beige PC tower beside it with its cables, the
# speakers, a desk fan, three game boxes, an energy drink, the lap sheet and a poster taped to the wall, a carpet
# offcut under it all. Ambient occlusion baked into the vertex colours.
# Fits both premises' SLOT_sim (the lock-up: a 2 m wall between the door and the corner; the unit: between shelves and
# the fridge): x -0.62 to 0.95, out to y -1.9. Hooks as before: STAND_driver (sit_idle, the seat 0.48 m up, like the
# office chair the clip was set for), INTERACT_sim, Light_CRT.
#   Blender --background --python tools/garage-sim.py -- [--out models/garage/station_sim_v2.glb] [--blend]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_sim.glb')
LIVE = not bpy.app.background

if LIVE:
    sc = bpy.data.scenes.get('Sim') or bpy.data.scenes.new('Sim')
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
if not os.path.exists(os.path.join(ART, 'sim_screen.png')): subprocess.run(['python3', os.path.join(HERE, 'garage-signs-sim.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
TEXD = G.TEX

# ---------------- materials ----------------
steel = grimy_tile('Sm_Steel', 'dark_industrial_metal.png', dirt=0.35, rust=0.3)
frame = grimy_tile('Sm_Frame', 'painted_metal.png', dirt=0.4, rust=0.25, wear_light=0.3, tint=(0.12, 0.12, 0.13))   # (black rattle-can on the box section)
alloy = grimy_tile('Sm_Alloy', 'galvanized_metal.png', dirt=0.3)
ply = grimy_tile('Sm_Ply', 'wood.png', dirt=0.45)
stand = grimy_tile('Sm_Stand', 'wood.png', dirt=0.35, tint=(0.3, 0.2, 0.12))         # (the TV stand: dark veneer)
beige = grimy_tile('Sm_Beige', 'painted_metal.png', dirt=0.25, tint=(0.74, 0.7, 0.6))
rubber = grimy_tile('Sm_Rubber', 'rubber.png', dirt=0.2)
black = solid_mat('Sm_Black', (0.03, 0.03, 0.035), 0.7)
grip = solid_mat('Sm_Grip', (0.05, 0.05, 0.055), 0.9)
red = solid_mat('Sm_Red', (0.6, 0.05, 0.04), 0.5)
# the seat: black cloth with a red centre stripe and a worn shine on the bolsters (an old Recaro-ish bucket)
n = 64; g = fbm(n, n, (8, 2), wrap=True); fine = vnoise(n, n, 2, wrap=True)
cloth = np.stack([0.07 + 0.05 * fine, 0.07 + 0.05 * fine, 0.08 + 0.05 * fine], -1); cloth = grime(cloth, (g - 0.4) * 0.3)
seat_cloth = mat_img('Sm_Cloth', px_tex('Sm_Cloth', cloth), 0.95)
st_ = cloth.copy(); x = np.arange(n); band = ((x > n * 0.38) & (x < n * 0.62))[None, :, None]
st_ = np.where(band, np.stack([0.42 + 0.1 * fine, 0.05 + 0.03 * fine, 0.05 + 0.03 * fine], -1), st_)
for k in range(0, n, 6): st_[k:k + 1] *= 0.6   # (the stitched pleats across it)
seat_mid = mat_img('Sm_SeatMid', px_tex('Sm_SeatMid', st_), 0.95)
# a carpet offcut: blue-grey loop pile, a coffee stain, frayed
n = 128; g = fbm(n, n, (16, 4), wrap=True); pile = vnoise(n, n, 1, wrap=True)
carpet = np.stack([0.2 + 0.08 * pile, 0.24 + 0.08 * pile, 0.32 + 0.08 * pile], -1); carpet = grime(carpet, (g - 0.35) * 0.6 + G.blobs(n, n, [(40, 70, 0.12, 0.6)], 64) * 0.7)
rug = mat_img('Sm_Carpet', px_tex('Sm_Carpet', carpet), 1.0)
def glow(name, png, k=1.6): return art_mat(name, A(png), dirt=0.05, emit=k, rough=0.3)
def print_(name, png, d=0.35): return art_mat(name, A(png), dirt=d)
tape = solid_mat('Sm_Tape', (0.75, 0.72, 0.6), 0.8)
shell = grimy_tile('Sm_Shell', 'painted_metal.png', dirt=0.45, rust=0.0, wear_light=0.35, tint=(0.2, 0.2, 0.21))   # (the seat's fibreglass back, scuffed)

# ---------------- props from the packs ----------------
S_ = lambda n: os.path.join(ST, n)
lib('crt', S_('CrtMonitor.glb'), height=0.5); lib('speaker', S_('speaker.glb'), height=0.2)
lib('can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12); lib('can_crushed', S_('trash_and_debris/scene.gltf'), 'Can_3_Crushed', height=0.1)
lib('mug', S_('mug_alt.glb'), height=0.1); lib('floppy', S_('floppy35.glb'))

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
sm = collection('station_sim', stations); sm.instance_offset = (0, 0, 0)
P = lambda x, y, z=0.0: Vector((x, y, z))

# ================= the carpet offcut under the rig =================
rg = bx('Sim_Carpet', sm, (1.25, 1.45, 0.012), P(0.0, -1.2, 0.006), rug); grid_out(rg, 0.3)

# ================= the frame: welded 40 mm box section, painted black =================
T = 0.04
for x in (-0.24, 0.24): bbox(f'Sim_Rail_{x:+.2f}', sm, (T, 1.12, T), P(x, -1.32, 0.032), frame, bev=0.004)
for y in (-0.8, -1.25, -1.86): bbox(f'Sim_Cross_{y:+.2f}', sm, (0.52, T, T), P(0, y, 0.032), frame, bev=0.004)
for x in (-0.24, 0.24):
    for y in (-0.8, -1.86): cy(f'Sim_Foot_{x:+.2f}_{y:+.2f}', sm, 0.03, 0.012, P(x, y, 0.006), rubber, verts=8)
# the seat's mounts: four short posts, the runners on them
for x in (-0.17, 0.17):
    for y in (-1.36, -1.72): bbox(f'Sim_SeatPost_{x:+.2f}_{y:+.2f}', sm, (0.035, 0.035, 0.27), P(x, y, 0.185), frame, bev=0.004)
    bbox(f'Sim_SeatRunner_{x:+.2f}', sm, (0.03, 0.46, 0.025), P(x, -1.54, 0.33), steel, bev=0.004)
# the wheel's column: an upright on each side at the front, a cross tube, the tilted plate the wheel clamps to
CY_ = -0.86
for x in (-0.2, 0.2):
    bbox(f'Sim_Column_{x:+.2f}', sm, (T, T, 0.62), P(x, CY_, 0.36), frame, bev=0.004)
    beam(f'Sim_Brace_{x:+.2f}', sm, P(x, CY_ + 0.02, 0.05), P(x, CY_ - 0.3, 0.05), T * 0.9, T * 0.9, frame); mk(bpy.data.objects[f'Sim_Brace_{x:+.2f}'])
    beam(f'Sim_Strut_{x:+.2f}', sm, P(x, CY_ - 0.3, 0.06), P(x, CY_, 0.5), T * 0.8, T * 0.8, frame); mk(bpy.data.objects[f'Sim_Strut_{x:+.2f}'])
bbox('Sim_ColumnTop', sm, (0.48, T, T), P(0, CY_, 0.67), frame, bev=0.004)
bbox('Sim_WheelPlate', sm, (0.36, 0.26, 0.012), P(0, CY_ - 0.1, 0.705), alloy, rot=(0.32, 0, 0), bev=0.003)

# ================= the wheel: a 90s force-feedback base clamped to the plate, its rim, its cable =================
WB = P(0, CY_ - 0.1, 0.745)
bbox('Sim_WheelBase', sm, (0.24, 0.2, 0.09), WB, black, rot=(0.32, 0, 0), bev=0.02)
for x in (-0.09, 0.09): bbox(f'Sim_Clamp_{x:+.2f}', sm, (0.03, 0.05, 0.08), P(x, CY_ - 0.02, 0.67), steel, bev=0.005)
for x in (-0.09, 0.09): lathe(f'Sim_ClampScrew_{x:+.2f}', sm, [(0, 0), (0.012, 0), (0.012, 0.02), (0.02, 0.025), (0.02, 0.035), (0, 0.035)], P(x, CY_ - 0.02, 0.632), steel, segs=6, rot=(math.pi, 0, 0))
# the rim, leaned back toward the driver: a ring in a plane turned 70 degrees from flat
WC = P(0, CY_ - 0.24, 0.86); tilt = math.radians(70)
ax, up = Vector((1, 0, 0)), Vector((0, -math.cos(tilt), math.sin(tilt))).normalized()   # (in the rim's plane: across, and up its face)
ring = [WC + (ax * math.cos(a) + up * math.sin(a)) * 0.135 for a in (k / 12 * math.tau for k in range(12))]
sweep('Sim_WheelRim', sm, ring, 0.017, grip, segs=6, closed=True, caps=False)
hub = WC - Vector((0, -math.sin(tilt), -math.cos(tilt))) * 0.0
for k, a in enumerate((D90 + math.pi, D90 + math.pi + 2.1, D90 + math.pi - 2.1)):   # (three spokes, the bottom one and the two at quarter to three)
    rd(f'Sim_Spoke_{k}', sm, WC, WC + (ax * math.cos(a) + up * math.sin(a)) * 0.125, 0.012, alloy, verts=6)
nrm = ax.cross(up).normalized()   # (out of the rim's face, toward the driver)
lathe('Sim_Hub', sm, [(0, 0), (0.045, 0), (0.045, 0.03), (0, 0.035)], WC - nrm * 0.0, black, segs=12, rot=nrm.to_track_quat('Z', 'Y').to_euler())
cd('Sim_HubLogo', sm, 0.06, 0.06, WC + nrm * 0.036 - up * 0.03, print_('Sm_Hub', 'sim_hub', 0.2), rotz=0.0, tilt=0.0)
_h = bpy.data.objects['Sim_HubLogo']; _h.rotation_euler = nrm.to_track_quat('-Y', 'Z').to_euler(); _h.location = WC + nrm * 0.037 - up * 0.03
rd('Sim_WheelShaft', sm, WC, WB + Vector((0, 0.0, 0.02)), 0.02, black, verts=8)
sweep('Sim_WheelCable', sm, [WB + Vector((0.1, 0.09, -0.02)), P(0.24, CY_ + 0.05, 0.55), P(0.26, CY_ + 0.1, 0.05), P(0.45, -0.6, 0.012), P(0.62, -0.4, 0.012), P(0.66, -0.3, 0.12)], 0.007, black, segs=4, per_m=5)
# paddle-less: a gear stick on the right of the seat, on its own bracket off the frame (an H-pattern gate)
bbox('Sim_ShifterArm', sm, (0.2, T, T), P(0.34, -1.25, 0.032), frame, bev=0.004)
bbox('Sim_ShifterPost', sm, (T, T, 0.36), P(0.43, -1.25, 0.2), frame, bev=0.004)
bbox('Sim_ShifterBox', sm, (0.1, 0.12, 0.07), P(0.43, -1.25, 0.415), black, bev=0.012)
cd('Sim_ShifterGate', sm, 0.07, 0.08, P(0.43, -1.25 + 0.04, 0.452), solid_mat('Sm_Gate', (0.5, 0.5, 0.52), 0.4), tilt=-D90)
rd('Sim_ShifterRod', sm, P(0.43, -1.26, 0.45), P(0.425, -1.28, 0.6), 0.008, alloy, verts=6)
lathe('Sim_ShifterKnob', sm, [(0, 0), (0.02, 0.005), (0.026, 0.025), (0.02, 0.045), (0, 0.05)], P(0.425, -1.28, 0.595), black, segs=10)

# ================= the pedals: a box on a ply plate, three pedals leaned back =================
bbox('Sim_PedalPlate', sm, (0.42, 0.3, 0.018), P(0, -1.06, 0.06), ply, rot=(-0.28, 0, 0), bev=0.004)
bbox('Sim_PedalBox', sm, (0.36, 0.12, 0.07), P(0, -0.95, 0.12), black, rot=(-0.28, 0, 0), bev=0.012)
for k, x in enumerate((-0.11, 0.0, 0.11)):
    beam(f'Sim_PedalArm_{k}', sm, P(x, -0.97, 0.15), P(x, -1.08, 0.22), 0.012, 0.012, steel); mk(bpy.data.objects[f'Sim_PedalArm_{k}'])
    bbox(f'Sim_Pedal_{k}', sm, (0.06 if k else 0.05, 0.012, 0.09), P(x, -1.09, 0.25), alloy, rot=(-0.55, 0, 0), bev=0.003)
sweep('Sim_PedalCable', sm, [P(0.17, -0.92, 0.12), P(0.3, -0.85, 0.02), P(0.5, -0.62, 0.012), P(0.64, -0.42, 0.012), P(0.66, -0.3, 0.1)], 0.006, black, segs=4, per_m=5)

# ================= the seat: an old bucket on its runners (seat pan top 0.48 m, the clip's) =================
SY, SZ = -1.54, 0.48
bbox('Sim_SeatShell', sm, (0.5, 0.48, 0.1), P(0, SY, SZ - 0.09), black, bev=0.03)
bbox('Sim_SeatCushion', sm, (0.34, 0.42, 0.06), P(0, SY + 0.02, SZ - 0.03), seat_mid, bev=0.025)
for s in (-1, 1):
    bbox(f'Sim_SeatBolster_{s:+d}', sm, (0.08, 0.44, 0.1), P(s * 0.21, SY + 0.01, SZ + 0.0), seat_cloth, rot=(0, s * 0.18, 0), bev=0.03)
BK = math.radians(14)   # (the back leaned back)
# the back: cloth over a fibreglass shell, wide at the shoulders' bolsters and narrowing into the headrest (one piece,
# the bucket's shape), the harness slots through it; the shell shows behind
def back_at(dz, dy=0.0):   # a point on the back's centre plane, dz up it from the seat's rear edge
    return P(0, SY - 0.22 - math.sin(BK) * dz + dy * math.cos(BK), SZ - 0.02 + math.cos(BK) * dz + dy * math.sin(BK))
bbox('Sim_BackLower', sm, (0.5, 0.11, 0.4), back_at(0.2), seat_cloth, rot=(-BK, 0, 0), bev=0.035)
bbox('Sim_BackUpper', sm, (0.36, 0.1, 0.3), back_at(0.54), seat_cloth, rot=(-BK, 0, 0), bev=0.035)
bbox('Sim_BackCushion', sm, (0.26, 0.04, 0.34), back_at(0.22, 0.06), seat_mid, rot=(-BK, 0, 0), bev=0.018)
bbox('Sim_HeadPad', sm, (0.2, 0.03, 0.12), back_at(0.6, 0.055), seat_mid, rot=(-BK, 0, 0), bev=0.012)
bbox('Sim_BackShell', sm, (0.4, 0.025, 0.6), back_at(0.36, -0.065), shell, rot=(-BK, 0, 0), bev=0.01)
_s = cd('Sim_ShellSticker', sm, 0.18, 0.09, back_at(0.42, -0.079), print_('Sm_Sticker', 'sim_sticker', 0.35), rotz=math.pi, tilt=BK)
for s_ in (-1, 1):
    bbox(f'Sim_BackBolster_{s_:+d}', sm, (0.07, 0.12, 0.34), back_at(0.2, 0.03) + Vector((s_ * 0.23, 0, 0)), seat_cloth, rot=(-BK, 0, s_ * -0.3), bev=0.03)
    cd(f'Sim_HarnessSlot_{s_:+d}', sm, 0.045, 0.075, back_at(0.42, 0.057) + Vector((s_ * 0.08, 0, 0)), black, tilt=-BK)
cd('Sim_SeatPatch', sm, 0.08, 0.06, back_at(0.12, 0.062) + Vector((-0.08, 0, 0)), tape, tilt=-BK, rotz=0.2)   # (gaffer tape over a split)

# ================= against the wall: the TV stand, the CRT and the game, the PC, the speakers =================
TS = P(0, -0.27, 0)
bbox('Sim_Stand', sm, (0.95, 0.46, 0.04), TS + Vector((0, 0, 0.66)), stand, bev=0.006)
bbox('Sim_StandShelf', sm, (0.91, 0.42, 0.03), TS + Vector((0, 0, 0.28)), stand, bev=0.004)
for x in (-0.455, 0.455): bbox(f'Sim_StandSide_{x:+.2f}', sm, (0.04, 0.46, 0.64), TS + Vector((x, 0, 0.32)), stand, bev=0.006)
bbox('Sim_StandBack', sm, (0.91, 0.02, 0.62), TS + Vector((0, 0.22, 0.33)), stand)
TOPZ = 0.68
put('crt', sm, P(0.0, -0.24, TOPZ), 0.0, name='SimCRT')   # (the model's glass faces -Y)
k = 0.5 / 0.4
cd('Sim_Screen', sm, 0.3 * k, 0.23 * k, P(0.0, -0.24 - 0.17 * k, TOPZ + 0.09 * k), glow('Sm_Screen', 'sim_screen', 1.8), tilt=-0.08)
bulb('Light_CRT', sm, P(0, -0.75, 1.0), 70, (0.6, 0.75, 1.0))
for x in (-0.4, 0.4): put('speaker', sm, P(x, -0.3, TOPZ), 0.0, name=f'SimSpeaker{x:+.1f}')
# on the shelf: the game boxes, a floppy
for i in range(3): bbox(f'Sim_GameBox_{i}', sm, (0.03, 0.19, 0.24), P(-0.38 + i * 0.032, -0.3, 0.295 + 0.12), black, bev=0.003)
for i in range(3): cd(f'Sim_GameCover_{i}', sm, 0.024, 0.18, P(-0.38 + i * 0.032, -0.396, 0.302), print_(f'Sm_Box{i}', f'sim_box{i}', 0.25))
bbox('Sim_GameBoxFlat', sm, (0.19, 0.24, 0.03), P(-0.1, -0.3, 0.31), black, rot=(0, 0, 0.2), bev=0.003)
cd('Sim_GameBoxFlatCover', sm, 0.18, 0.23, P(-0.1, -0.3, 0.3255), print_('Sm_Box0b', 'sim_box0', 0.25), rotz=0.2, tilt=-D90)
put('floppy', sm, P(0.2, -0.32, 0.295), 0.6)
# the PC tower on the floor at the stand's right, its front to the room, the cables behind
PCX = 0.72
bbox('Sim_PC', sm, (0.2, 0.44, 0.44), P(PCX, -0.3, 0.22), beige, bev=0.01)
cd('Sim_PCFront', sm, 0.19, 0.38, P(PCX, -0.522, 0.03), print_('Sm_PCFront', 'sim_pcfront', 0.3))
sweep('Sim_PCCable', sm, [P(PCX - 0.05, -0.1, 0.35), P(PCX - 0.2, -0.05, 0.3), P(0.35, -0.03, 0.6), P(0.1, -0.05, TOPZ + 0.1)], 0.008, black, segs=4, per_m=5)
sweep('Sim_PowerCable', sm, [P(PCX + 0.05, -0.1, 0.1), P(PCX + 0.1, -0.03, 0.02), P(0.95, -0.02, 0.012)], 0.006, black, segs=4, per_m=5)
# a desk fan on the PC, aimed at the seat; a drink by the seat, a crushed one under the stand; a mug on the stand
lathe('Sim_FanBase', sm, [(0, 0), (0.07, 0), (0.07, 0.02), (0.02, 0.03), (0.015, 0.16), (0, 0.16)], P(PCX, -0.32, 0.44), beige, segs=10)
fan_d = Vector((0.0, -1.0, 0.1)).normalized(); fan_rot = fan_d.to_track_quat('Z', 'Y').to_euler(); FC = P(PCX, -0.36, 0.64)
gr = np.zeros((32, 32), np.float32); gr[::4, :] = 1; gr[:, ::8] = 1   # (v: rings out from the middle; u: spokes round)
grille = cutout_mat('Sm_FanCage', np.full((32, 32, 3), 0.72, np.float32), gr)
for k_, off in enumerate((-0.03, 0.035)):
    lathe(f'Sim_FanGrille_{k_}', sm, [(0.0, 0.0), (0.06, 0.008 if off > 0 else -0.008), (0.105, 0.0)], FC + fan_d * off, grille, segs=12, rot=fan_rot, cap0=False, cap1=False)
ring = [FC + (Vector((math.cos(a), 0, math.sin(a))) * 0.106) for a in (i / 12 * math.tau for i in range(12))]
sweep('Sim_FanRim', sm, ring, 0.007, solid_mat('Sm_FanRim', (0.7, 0.68, 0.62), 0.5), segs=4, closed=True, caps=False)
for i in range(3):
    a = i / 3 * math.tau; d_ = Vector((math.cos(a), 0, math.sin(a)))
    bx(f'Sim_FanBlade_{i}', sm, (0.07, 0.006, 0.04), P(PCX, -0.37, 0.64) + d_ * 0.045, solid_mat('Sm_FanBlade', (0.6, 0.62, 0.66), 0.4), rot=(0, -a, 0))
put('can', sm, P(-0.38, -1.2, 0.012), 0.4, name='SimCan'); put('can_crushed', sm, P(0.3, -0.62, 0.0), 1.1, name='SimCanCrushed')
put('mug', sm, P(0.33, -0.38, TOPZ), 2.0, name='SimMug')

# ================= on the wall: the lap sheet and a poster, taped =================
cd('Sim_LapSheet', sm, 0.21, 0.29, P(-0.62 + 0.18, -0.012, 1.18), print_('Sm_Laps', 'sim_laps', 0.3), rotz=0.0)
_l = bpy.data.objects['Sim_LapSheet']; _l.rotation_euler = (0, 0.04, 0)
for dx, dz in ((-0.09, 0.28), (0.09, 0.28)): cd(f'Sim_Tape_{dx:+.2f}', sm, 0.05, 0.02, P(-0.44 + dx, -0.014, 1.18 + dz), tape, rotz=0.0)
cd('Sim_Poster', sm, 0.42, 0.56, P(0.55, -0.012, 1.2), print_('Sm_Poster', 'sim_poster', 0.4))
for dx, dz in ((-0.19, 0.54), (0.19, 0.54)): cd(f'Sim_PosterTape_{dx:+.2f}', sm, 0.05, 0.02, P(0.55 + dx, -0.014, 1.2 + dz), tape)

# ================= hooks =================
empty('STAND_driver', sm, P(0, SY, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='sit_idle', role='driver')
empty('INTERACT_sim', sm, P(0, -1.6, 1.0), kind='SPHERE', size=0.25, label='The sim rig')

if '--noao' not in args:
    print('AO baked on', bake_ao(sm, skip=tuple(m for m in bpy.data.materials if m.name == 'Sm_FanCage')), 'objects')
if not LIVE or '--export' in args: export_station(sm, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'sim-start.blend'))
print('SIM objects', len(sm.all_objects), 'triangles', tris(sm))
