# The pro simulator (the home garage's station_sim2, Simulator level 2, see docs/GARAGE-KIT.md): a 2000s F1 team's
# driver-in-the-loop simulator, made the garage-station way (.claude/skills/garage-station). A real carbon monocoque,
# no wheels, on a hexapod motion platform (six actuators between a base frame and the top plate), facing a 180-degree
# wraparound projection screen on its steel frame, three projectors on a gantry over the driver's head, a safety rail
# round the platform with the steps up, the engineer's desk behind with the telemetry and the platform's status, the
# E-stop. In use: the track on the screen, the desk's screens on, the projectors lit; idle: dark. AO baked.
# For the factory's sim suite (tools/garage-factory.py SLOT_sim2): its back on y = 0 against the wall, its front -Y,
# x -3.2..3.2, y -5..0, under a 3 m ceiling. The driver faces the screen (+Y): the room sees the screen over him.
#   Blender --background --python tools/garage-sim2.py -- [--out models/garage/station_sim2.glb] [--blend] [--noao]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_sim2.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=9021)
if not os.path.exists(os.path.join(ART, 's2_track.png')): subprocess.run(['/usr/local/bin/python3', os.path.join(HERE, 'garage-signs-sim2truck.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
P = lambda x, y, z=0.0: Vector((x, y, z))
kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
S = collection('station_sim2', stations); S.instance_offset = (0, 0, 0)

# ---------------- materials ----------------
steel = grimy_tile('S2_Steel', 'dark_industrial_metal.png', dirt=0.12, rust=0.0)
frame = grimy_tile('S2_Frame', 'painted_metal.png', dirt=0.08, tint=(0.14, 0.15, 0.17))
alu = grimy_tile('S2_Alu', 'galvanized_metal.png', dirt=0.06)
yellow = grimy_tile('S2_Yellow', 'painted_metal.png', dirt=0.1, tint=(0.88, 0.68, 0.08))
hazard = grimy_tile('S2_Hazard', 'hazard_stripes_01.png', dirt=0.12)
tread = grimy_tile('S2_Tread', 'metal_plate_03.png', dirt=0.1, tint=(0.5, 0.52, 0.55))
chrome = plain_mat('S2_Chrome', (0.78, 0.8, 0.83), dirt=0.02, rough=0.2)
black = plain_mat('S2_Black', (0.05, 0.05, 0.06), dirt=0.03)
deskm = plain_mat('S2_Desk', (0.2, 0.21, 0.23), dirt=0.05)
whitep = plain_mat('S2_White', (0.85, 0.86, 0.87), dirt=0.05)
dull = plain_mat('S2_ScreenOff', (0.1, 0.11, 0.12), dirt=0.02, rough=0.4)
red = plain_mat('S2_Red', (0.7, 0.06, 0.05), dirt=0.04)
# carbon fibre: a 2x2 twill, the tub's and the wheel's
n = 32; yy, xx = np.mgrid[0:n, 0:n]; tw = (((xx // 4) + (yy // 4)) % 2).astype(np.float32)
carbon = mat_img('S2_Carbon', px_tex('S2_Carbon', np.stack([0.08 + 0.05 * tw] * 3, -1) * np.array([1, 1, 1.08])), 0.3)
seatm = plain_mat('S2_Seat', (0.06, 0.06, 0.07), dirt=0.05, rough=0.9)
lens = mat_img('S2_Lens', None, 0.3, emit=((0.75, 0.85, 1.0), 4.0))
def glow(name, png, k=1.4): return art_mat(name, A(png), dirt=0.02, emit=k, rough=0.3)
def print_(name, png, d=0.1): return art_mat(name, A(png), dirt=d)

C = P(0, -2.45)   # (the platform's centre, the driver's hips over it)

# ================= the screen: a 180-degree band round the driver, its frame behind =================
R_IN, R_OUT, SZ0, SZ1, NS = 1.85, 1.95, 0.45, 2.45, 24
def band(name, mat_in, mat_out):
    # a closed curved slab: the inner face (mat_in, its picture across it), the outer, the top, bottom and the ends
    bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    ring = lambda r, z: [bm.verts.new((C.x + r * math.cos(math.pi * k / NS), C.y + r * math.sin(math.pi * k / NS), z)) for k in range(NS + 1)]
    ib, it, ob, ot = ring(R_IN, SZ0), ring(R_IN, SZ1), ring(R_OUT, SZ0), ring(R_OUT, SZ1)
    def quad(a, b, c, d, m, uvs):
        f = bm.faces.new((a, b, c, d)); f.material_index = m
        for l, t in zip(f.loops, uvs): l[uv].uv = t
    for k in range(NS):
        u0, u1 = 1 - k / NS, 1 - (k + 1) / NS   # (left to right as the driver sees it)
        quad(ib[k], ib[k + 1], it[k + 1], it[k], 0, [(u0, 0), (u1, 0), (u1, 1), (u0, 1)])
        quad(ob[k + 1], ob[k], ot[k], ot[k + 1], 1, [(0, 0), (1, 0), (1, 1), (0, 1)])
        quad(it[k], it[k + 1], ot[k + 1], ot[k], 1, [(0, 0), (1, 0), (1, 1), (0, 1)])
        quad(ob[k], ob[k + 1], ib[k + 1], ib[k], 1, [(0, 0), (1, 0), (1, 1), (0, 1)])
    for e in (0, NS): quad(ib[e], ob[e], ot[e], it[e], 1, [(0, 0), (1, 0), (1, 1), (0, 1)])
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    me.materials.append(mat_in); me.materials.append(mat_out)
    o = bpy.data.objects.new(name, me); S.objects.link(o); return mk(o)
band('BUSY_sim2_Screen', glow('S2_Track', 's2_track', 1.1), frame)
band('IDLE_sim2_Screen', dull, frame)
# its frame: posts behind the band, a top and a bottom rail following the curve, feet
for k in range(0, NS + 1, 4):
    a = math.pi * k / NS; p = C + P(math.cos(a), math.sin(a)) * (R_OUT + 0.08)
    bx(f'S2_ScreenPost{k}', S, (0.06, 0.06, SZ1 + 0.1), (p.x, p.y, (SZ1 + 0.1) / 2), frame, rot=(0, 0, a))
    bbox(f'S2_ScreenFoot{k}', S, (0.3, 0.12, 0.03), (p.x, p.y, 0.015), steel, rot=(0, 0, a), bev=0.006)
for z, nm in ((SZ0 - 0.05, 'Bot'), (SZ1 + 0.05, 'Top')):
    sweep(f'S2_ScreenRail{nm}', S, [C + P(math.cos(math.pi * k / 12), math.sin(math.pi * k / 12), 0) * (R_OUT + 0.08) + P(0, 0, z) for k in range(13)], 0.025, frame, segs=6, per_m=4)

# ================= the motion platform: a base frame, six actuators, the top plate =================
BZ, TZ = 0.12, 0.62
bbox('S2_Base', S, (2.0, 1.7, BZ), (C.x, C.y, BZ / 2), frame, bev=0.02)
for s in (-1, 1): bbox(f'S2_BaseRail{s}', S, (2.1, 0.12, 0.08), (C.x, C.y + s * 0.85, 0.04), steel, bev=0.01)
bbox('S2_Top', S, (1.5, 1.2, 0.08), (C.x, C.y, TZ + 0.04), frame, bev=0.015)
lo = [C + P(0.85 * math.cos(math.radians(a)), 0.7 * math.sin(math.radians(a)), BZ) for a in (20, 100, 140, 220, 260, 340)]
hi = [C + P(0.62 * math.cos(math.radians(a)), 0.5 * math.sin(math.radians(a)), TZ) for a in (60, 80, 180, 200, 300, 320)]
for k, (a, b) in enumerate(zip(lo, hi)):   # (each: the cylinder, its rod, a joint each end)
    m = a + (b - a) * 0.55
    rd(f'S2_ActBody{k}', S, a, m, 0.045, yellow, verts=8)
    rd(f'S2_ActRod{k}', S, m, b, 0.022, chrome, verts=6)
    for p_, nm in ((a, 'Lo'), (b, 'Hi')): lathe(f'S2_Joint{nm}{k}', S, [(0, -0.04), (0.04, -0.03), (0.045, 0.0), (0.04, 0.03), (0, 0.04)], p_, steel, segs=8)
# ================= the tub: a carbon monocoque (no wheels), its nose to the screen =================
def loft(name, secs, mat, nr=10):
    # rings of rounded-rectangle sections along +Y: (y, half width, bottom z, top z), capped both ends
    bm = bmesh.new(); rings = []
    for (y, hw, z0, z1) in secs:
        rz, ring = (z1 - z0) / 2, []
        for k in range(nr):
            a = k / nr * math.tau; c, s_ = math.cos(a), math.sin(a)
            x = C.x + hw * (abs(c) ** 0.5) * (1 if c >= 0 else -1); z = (z0 + z1) / 2 + rz * (abs(s_) ** 0.6) * (1 if s_ >= 0 else -1)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(nr): bm.faces.new((r0[k], r0[(k + 1) % nr], r1[(k + 1) % nr], r1[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    uv = me.uv_layers.new()
    for f in me.polygons:
        for li in f.loop_indices: v = me.vertices[me.loops[li].vertex_index].co; uv.data[li].uv = (v.y * 2, (v.x + v.z) * 2)
    o = bpy.data.objects.new(name, me); S.objects.link(o); return mk(o)
TB = TZ + 0.08
loft('S2_Tub', [(C.y - 1.05, 0.32, TB, TB + 0.55), (C.y - 0.5, 0.38, TB, TB + 0.62), (C.y + 0.2, 0.36, TB, TB + 0.6), (C.y + 0.8, 0.26, TB + 0.05, TB + 0.5),
                (C.y + 1.3, 0.16, TB + 0.1, TB + 0.36), (C.y + 1.55, 0.06, TB + 0.16, TB + 0.24)], carbon)
# the cockpit opening (a dark recess on top), the seat's back showing, the headrest, the roll hoop
bbox('S2_Cockpit', S, (0.46, 0.85, 0.06), (C.x, C.y - 0.2, TB + 0.6), black, bev=0.02)
bbox('S2_Headrest', S, (0.5, 0.18, 0.14), (C.x, C.y - 0.7, TB + 0.66), carbon, bev=0.04)
lathe('S2_Hoop', S, [(0.0, 0.0), (0.12, 0.0), (0.09, 0.28), (0.0, 0.32)], P(C.x, C.y - 0.95, TB + 0.55), carbon, segs=10)
bbox('S2_SeatBack', S, (0.4, 0.06, 0.35), (C.x, C.y - 0.6, TB + 0.42), seatm, rot=(0.25, 0, 0), bev=0.02)
# the steering wheel on its column: a carbon rim, grips, the display, two paddles
WC = P(C.x, C.y + 0.18, TB + 0.62)
lathe('S2_WheelRim', S, [(0.13, -0.015), (0.155, -0.015), (0.155, 0.015), (0.13, 0.015)], WC, carbon, segs=14, rot=(D90, 0, 0))
bbox('S2_WheelBody', S, (0.24, 0.05, 0.13), WC, carbon, bev=0.015)
cd('S2_WheelDisplay', S, 0.09, 0.04, WC + P(-0.045, -0.03, -0.02), glow('S2_WheelLCD', 's2_motion', 0.8))
for s in (-1, 1): bbox(f'S2_Grip{s}', S, (0.05, 0.06, 0.12), WC + P(s * 0.13, 0, 0), seatm, bev=0.015); bx(f'S2_Paddle{s}', S, (0.06, 0.01, 0.07), WC + P(s * 0.09, 0.04, 0.02), alu)
rd('S2_Column', S, WC + P(0, 0.03, 0), WC + P(0, 0.35, -0.08), 0.02, alu, verts=6)
# mirrors, and a carbon front bulkhead plate where the nose would bolt on
for s in (-1, 1): bbox(f'S2_Mirror{s}', S, (0.12, 0.04, 0.06), (C.x + s * 0.42, C.y + 0.35, TB + 0.62), carbon, bev=0.01); rd(f'S2_MirrorArm{s}', S, (C.x + s * 0.3, C.y + 0.32, TB + 0.55), (C.x + s * 0.4, C.y + 0.35, TB + 0.6), 0.008, carbon, verts=4)

# ================= the rail round the platform, the steps up its right side =================
RAILX, RAILY = 1.25, 1.05
posts = [(-RAILX, -RAILY), (-RAILX, RAILY), (RAILX, RAILY), (RAILX, 0.25), (RAILX, -0.55), (RAILX, -RAILY), (0, -RAILY)]
for k, (x, y) in enumerate(posts):
    p = C + P(x, y); bx(f'S2_RailPost{k}', S, (0.05, 0.05, 1.1), (p.x, p.y, 0.55), yellow); bx(f'S2_RailFoot{k}', S, (0.14, 0.14, 0.01), (p.x, p.y, 0.005), steel)
for k, (a, b) in enumerate(((0, 1), (2, 3), (4, 5), (5, 6), (6, 0))):   # (the gap between posts 3 and 4: the steps)
    pa, pb = C + P(*posts[a]), C + P(*posts[b])
    for z in (0.55, 1.08): rd(f'S2_Rail{k}_{z}', S, (pa.x, pa.y, z), (pb.x, pb.y, z), 0.022, yellow, verts=6)
cd('S2_WarnSign', S, 0.4, 0.1, C + P(0.2, -RAILY - 0.03, 0.72), print_('S2_Warn', 's2_warn', 0.08))
for k, (a, b) in enumerate(((0, 1), (1, 2), (5, 6), (6, 0))):   # (the hazard tape on the floor round it)
    pa, pb = C + P(*posts[a]) + P(0, 0, 0.003), C + P(*posts[b]) + P(0, 0, 0.003); beam(f'S2_FloorTape{k}', S, pa, pb, 0.08, 0.004, hazard)
# the steps: three treads on stringers, a handrail each side, up to the top plate from the room's side (+X)
for i in range(3):
    z = (i + 1) * TZ / 3.0; x = C.x + RAILX + 0.85 - i * 0.28
    bbox(f'S2_Step{i}', S, (0.3, 0.8, 0.04), (x, C.y - 0.15, z), tread, bev=0.005)
for s in (-1, 1):
    beam(f'S2_StepStringer{s}', S, (C.x + RAILX + 1.05, C.y - 0.15 + s * 0.42, 0.02), (C.x + RAILX + 0.05, C.y - 0.15 + s * 0.42, TZ + 0.02), 0.04, 0.16, frame)
    rd(f'S2_StepRail{s}', S, (C.x + RAILX + 1.0, C.y - 0.15 + s * 0.42, 0.95), (C.x + RAILX + 0.05, C.y - 0.15 + s * 0.42, TZ + 0.95), 0.02, yellow, verts=6)
    rd(f'S2_StepRailPost{s}', S, (C.x + RAILX + 1.0, C.y - 0.15 + s * 0.42, 0.02), (C.x + RAILX + 1.0, C.y - 0.15 + s * 0.42, 0.95), 0.02, yellow, verts=6)
bbox('S2_Deck', S, (RAILX * 2 - 0.1, RAILY * 2 - 0.1, 0.04), (C.x, C.y, TZ - 0.0), tread, bev=0.005)   # (round the tub: you step on to it)

# ================= the gantry over the driver: three projectors aimed at the screen =================
GY_ = C.y - 1.35
for s in (-1, 1):
    bx(f'S2_GantryPost{s}', S, (0.08, 0.08, 2.75), (C.x + s * 2.35, GY_, 1.375), frame); bbox(f'S2_GantryFoot{s}', S, (0.3, 0.3, 0.02), (C.x + s * 2.35, GY_, 0.01), steel, bev=0.005)
bx('S2_GantryBeam', S, (4.8, 0.1, 0.12), (C.x, GY_, 2.72), frame)
for k, a in enumerate((-0.75, 0.0, 0.75)):   # (each aimed at its third of the screen)
    c = P(C.x + k * 1.0 - 1.0, GY_ + 0.1, 2.5)
    bbox(f'S2_Proj{k}', S, (0.36, 0.42, 0.16), c, whitep, rot=(0, 0, a), bev=0.02)
    lathe(f'S2_ProjLens{k}', S, [(0.0, 0.0), (0.05, 0.0), (0.05, 0.06), (0.0, 0.06)], c + P(-math.sin(a) * 0.21, math.cos(a) * 0.21, 0), black, segs=10, rot=(-D90, 0, -a))
    cy(f'BUSY_sim2_ProjGlow{k}', S, 0.04, 0.005, c + P(-math.sin(a) * 0.275, math.cos(a) * 0.275, 0), lens, rot=(D90, 0, -a), verts=10)
    rd(f'S2_ProjHanger{k}', S, c + P(0, 0, 0.08), (c.x, GY_, 2.66), 0.015, steel, verts=5)
sweep('S2_GantryCable', S, [P(C.x - 2.35, GY_ + 0.06, 0.4), P(C.x - 2.35, GY_ + 0.06, 2.6), P(C.x - 1.0, GY_ + 0.05, 2.62), P(C.x + 1.0, GY_ + 0.05, 2.62)], 0.012, black, segs=4, per_m=4)

# ================= the engineer's desk, facing the screen; the E-stop =================
DY = -4.25; TOPZ = 0.74
bbox('S2_DeskTop', S, (2.4, 0.8, 0.04), (-1.3, DY, TOPZ), deskm, bev=0.006)
for x in (-2.4, -0.2):
    bbox(f'S2_DeskLeg{x}', S, (0.05, 0.7, TOPZ - 0.02), (x, DY, (TOPZ - 0.02) / 2), alu, bev=0.004)
bbox('S2_DeskModesty', S, (2.2, 0.02, 0.45), (-1.3, DY + 0.36, TOPZ - 0.245), deskm, bev=0.004)   # (up to the top's underside)
for k, (x, png) in enumerate(((-1.85, 's2_tele'), (-0.85, 's2_motion'))):   # (two early flat screens, facing the engineer at -Y)
    bbox(f'S2_MonBezel{k}', S, (0.52, 0.05, 0.36), (x, DY + 0.15, TOPZ + 0.4), black, bev=0.01)
    cd(f'BUSY_sim2_Mon{k}', S, 0.46, 0.3, (x, DY + 0.124, TOPZ + 0.25), glow(f'S2_Mon{k}', png, 1.1))
    cd(f'IDLE_sim2_Mon{k}', S, 0.46, 0.3, (x, DY + 0.124, TOPZ + 0.25), dull)
    bx(f'S2_MonNeck{k}', S, (0.05, 0.04, 0.2), (x, DY + 0.19, TOPZ + 0.12), alu); bbox(f'S2_MonFoot{k}', S, (0.22, 0.16, 0.02), (x, DY + 0.16, TOPZ + 0.03), alu, bev=0.004)
bbox('S2_Keyboard', S, (0.44, 0.15, 0.025), (-1.35, DY - 0.15, TOPZ + 0.033), black, bev=0.005)
bbox('S2_Mouse', S, (0.06, 0.1, 0.03), (-1.0, DY - 0.16, TOPZ + 0.035), black, bev=0.012)
bbox('S2_Radio', S, (0.18, 0.12, 0.06), (-2.25, DY - 0.1, TOPZ + 0.05), black, bev=0.008); rd('S2_RadioAerial', S, (-2.2, DY - 0.1, TOPZ + 0.08), (-2.2, DY - 0.1, TOPZ + 0.3), 0.004, black, verts=4)
for s in (-1, 1): lathe(f'S2_HeadsetCup{s}', S, [(0, 0), (0.04, 0), (0.04, 0.035), (0, 0.04)], P(-0.45 + s * 0.08, DY - 0.1, TOPZ + 0.06), black, segs=8, rot=(0, s * D90, 0))
sweep('S2_HeadsetBand', S, [P(-0.53, DY - 0.1, TOPZ + 0.08), P(-0.45, DY - 0.1, TOPZ + 0.17), P(-0.37, DY - 0.1, TOPZ + 0.08)], 0.008, black, segs=4)
# the chair: a 0.48 m seat on a five-star base, facing the screen (+Y)
CH = P(-1.3, DY - 0.65)
lathe('S2_ChairBase', S, [(0.0, 0.05), (0.3, 0.05), (0.3, 0.07), (0.04, 0.09), (0.0, 0.09)], CH, black, segs=5)
for k in range(5): a = k / 5 * math.tau; cy(f'S2_ChairCastor{k}', S, 0.03, 0.025, CH + P(math.cos(a) * 0.28, math.sin(a) * 0.28, 0.03), black, rot=(D90, 0, a), verts=6)
rd('S2_ChairPost', S, CH + P(0, 0, 0.09), CH + P(0, 0, 0.42), 0.025, chrome, verts=6)
bbox('S2_ChairSeat', S, (0.48, 0.46, 0.08), CH + P(0, 0, 0.44), seatm, bev=0.03)
bbox('S2_ChairBack', S, (0.44, 0.07, 0.55), CH + P(0, -0.25, 0.82), seatm, rot=(-0.12, 0, 0), bev=0.03)
bx('S2_ChairSpine', S, (0.06, 0.04, 0.2), CH + P(0, -0.25, 0.53), black)   # (the back on its spine, down to the seat)
# the E-stop on its post by the steps, where the engineer and the driver can both reach it
bx('S2_EStopPost', S, (0.06, 0.06, 1.0), (1.2, -4.35, 0.5), yellow); bbox('S2_EStopBox', S, (0.16, 0.12, 0.16), (1.2, -4.35, 1.08), yellow, bev=0.01)
lathe('S2_EStop', S, [(0.0, 0.0), (0.04, 0.0), (0.05, 0.03), (0.0, 0.045)], P(1.2, -4.42, 1.08), red, segs=12, rot=(D90, 0, 0))
cd('S2_EStopLabel', S, 0.12, 0.12, P(1.2, -4.415, 1.0), print_('S2_EStopLbl', 's2_estop', 0.05))
# cable channel from the desk to the platform, across the floor
bbox('S2_CableRamp', S, (0.2, 1.4, 0.04), (-0.4, -3.35, 0.02), yellow, bev=0.01)

# ================= hooks =================
empty('STAND_driver', S, (C.x + RAILX + 1.45, C.y - 0.15, 0), rotz=-D90, kind='SINGLE_ARROW', size=0.5, clip='idle', role='driver')   # (at the foot of the steps, facing up them)
empty('STAND_engineer', S, (CH.x, CH.y, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='sit_desk', role='engineer')   # (in the chair, facing the screen)
empty('INTERACT_sim', S, (C.x + RAILX + 0.9, C.y - 0.6, 1.1), kind='SPHERE', size=0.25, label='The simulator')

if '--noao' not in args:
    print('AO baked on', bake_ao(S, skip=()), 'objects')
export_station(S, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'sim2-start.blend'))
print('SIM2 objects', len(S.all_objects), 'triangles', tris(S))
