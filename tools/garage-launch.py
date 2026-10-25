# The season launch, set up in the home garage (World Career's press day and car reveal; the method:
# .claude/skills/garage-station/SKILL.md, the kit: docs/GARAGE-KIT.md). What a club team's launch in its own unit is:
#   - a stage of hired decks (2 x 1 m, carpet on ply, steel legs, aluminium edge trim), a pleated black skirt round the
#     front and sides, a two-tread step with hazard tape, white spike-tape marks where people stand, gaffer over cables
#   - the backdrop: a step-and-repeat banner (the team and its sponsors) bungeed to a box truss, a lone balloon tied on
#   - the car, under a fitted satin cover in the team's colour, Danny's DO NOT LIFT note taped to it, a pull cord
#   - the top table: a folding table under the team's cloth with its printed banner, two desk mics on goosenecks with
#     their cables taped off the back, water, glasses, folded name cards; two chairs behind
#   - the host's lectern at the side (a gooseneck mic, the running order taped on), a mic stand in the aisle for questions
#   - the press: three rows of folding chairs with an aisle (notepads, a bag, coffee under the seats, one seat reserved
#     for The Paddock Wire), a yellow tape line for the photographers, a TV camera on its tripod at the back
#   - two lamps on stands (fresnels, barn doors) and two PA speakers on poles, their cables to an extension reel
#   - the press table: the coffee machine, a stack of cups, a box of donuts (ONE EACH), and PRESS THIS WAY on a board
# Built round its own origin like a station: the floor at z 0, the back of the stage (the backdrop) on y = 0, the room
# down -Y. In the unit it stands at SLOT_launch, the stage against the mezzanine, the press towards the door.
# Hooks (the game, js/launch.js to come):
#   LAUNCH_CAR (empty: car one on the stage, nose down its -Y), LAUNCH_COVER... (the cover and what's on it: lifted off
#   at the reveal), LAUNCH_BACKDROP (plane, 3:1: printed with the team and its sponsors), LAUNCH_NAME_1/2 (planes: the
#   name cards), LAUNCH_TABLECLOTH (the cloth's printed front), LAUNCH_SEAT_1/2 (you and car two's driver at the top
#   table), LAUNCH_HOST, LAUNCH_ASK (the question mic), LAUNCH_PRESS_nn (seats), LAUNCH_PHOTO_nn (the photographers'
#   line), CAM_launch_<shot> (empties: props tx ty tz = what it looks at, fov). Seats/stands face their empty's -Y.
#   Blender --background --python tools/garage-launch.py -- [--out models/garage/event_launch.glb] [--blend] [--noao]
#   or inside a running Blender (the MCP add-on): exec it; it builds into a new scene "Launch" and leaves yours alone.
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'launch_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'event_launch.glb')
LIVE = not bpy.app.background

if LIVE:   # (in your Blender: a scene of its own)
    sc = bpy.data.scenes.get('Launch') or bpy.data.scenes.new('Launch')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'launch_gen'), seed=2027)
if not os.path.exists(os.path.join(ART, 'backdrop.png')):
    for py in ('/usr/local/bin/python3', '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3', 'python3'):
        if subprocess.run([py, os.path.join(HERE, 'garage-launch-art.py')]).returncode == 0: break
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()
P = lambda x, y, z=0.0: (x, y, z)
R = np.random.default_rng(2027)
def jit(a): return float(R.uniform(-a, a))

# ---------------- materials ----------------
steel = grimy_tile('La_Steel', 'dark_industrial_metal.png', dirt=0.3, rust=0.15)
alu = grimy_tile('La_Alu', 'galvanized_metal.png', dirt=0.12, tint=(0.82, 0.83, 0.85))
frame = grimy_tile('La_ChairFrame', 'painted_metal.png', dirt=0.25, rust=0.05, tint=(0.2, 0.21, 0.22))
lampbody = grimy_tile('La_LampBody', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.11, 0.11, 0.12))
ply = grimy_tile('La_Ply', 'wood.png', dirt=0.25, tint=(0.36, 0.33, 0.29))
hazard = grimy_tile('La_Hazard', 'hazard_stripes_01.png', dirt=0.35, wear_light=0.2)
rubber = grimy_tile('La_Rubber', 'rubber.png', dirt=0.2)
cardboard = grimy_tile('La_Cardboard', 'cardboard.png', dirt=0.25)
carpet = plain_mat('La_Carpet', (0.11, 0.12, 0.14), dirt=0.14, fleck=0.14, rough=0.95)
velour = plain_mat('La_Velour', (0.03, 0.03, 0.035), dirt=0.06, fleck=0.1, rough=0.95)
seatpad = plain_mat('La_SeatPad', (0.07, 0.07, 0.08), dirt=0.12, fleck=0.06, rough=0.8)
laminate = plain_mat('La_Laminate', (0.62, 0.6, 0.56), dirt=0.16)
gaffer = plain_mat('La_Gaffer', (0.05, 0.05, 0.05), dirt=0.1, rough=0.55)
tape_w = plain_mat('La_TapeW', (0.86, 0.86, 0.83), dirt=0.15, rough=0.6)
tape_y = plain_mat('La_TapeY', (0.86, 0.68, 0.08), dirt=0.2, rough=0.6)
camgrey = plain_mat('La_CamGrey', (0.16, 0.16, 0.17), dirt=0.12, rough=0.5)
paper = plain_mat('La_Paper', (0.9, 0.89, 0.85), dirt=0.08, rough=0.9)
canvas = plain_mat('La_Bag', (0.2, 0.22, 0.17), dirt=0.2, rough=0.9)
cable = solid_mat('La_Cable', (0.025, 0.025, 0.028), 0.6)
water = solid_mat('La_Water', (0.5, 0.68, 0.86), 0.08)
glassm = solid_mat('La_Glass', (0.72, 0.78, 0.8), 0.05)
dough = solid_mat('La_Dough', (0.72, 0.5, 0.26), 0.8)
icing = [solid_mat('La_IcePink', (0.92, 0.5, 0.62), 0.4), solid_mat('La_IceChoc', (0.25, 0.13, 0.06), 0.4), solid_mat('La_IceWhite', (0.93, 0.9, 0.84), 0.4)]
black = solid_mat('La_Black', (0.03, 0.03, 0.035), 0.6)
lens_on = mat_img('La_LampLens', None, 0.3, emit=((1.0, 0.9, 0.72), 9.0))
redlight = mat_img('La_Tally', None, 0.3, emit=((1.0, 0.08, 0.05), 6.0))
string = solid_mat('La_String', (0.85, 0.85, 0.8), 0.8)
# the team's colours: the game sets these (no texture: the colour is replaced), the preview's brown and cream
team = mat_img('TeamMain_Launch', None, 0.45); team.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.36, 0.27, 0.22, 1)
accent = mat_img('TeamAccent_Launch', None, 0.5); accent.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.95, 0.92, 0.84, 1)
def print_(name, png, d=0.15, rough=0.85): return art_mat(name, A(png), dirt=d, rough=rough)

# ---------------- props from the packs ----------------
S_ = lambda n: os.path.join(ST, n)
lib('speaker', S_('speaker.glb'), height=0.62); lib('coffee', S_('coffee_machine.glb'), height=0.38)
lib('coffee_cup', S_('trash_and_debris/scene.gltf'), 'Coffee_Cup_WithLid', height=0.13); lib('can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12)
lib('papers', S_('paper_stack_large.glb'), scale=0.7)

LA = collection('event_launch')

# ================= the stage =================
SW, SD, SH = 6.0, 4.0, 0.3          # (3 x 4 decks of 2 x 1 m, 30 cm up)
for i in range(3):
    for j in range(4):
        cx, cyy = -SW / 2 + 1 + i * 2, -0.5 - j
        o = bbox(f'Stage_Deck_{i}{j}', LA, (1.985, 0.985, 0.04), P(cx, cyy, SH - 0.02), carpet, bev=0.006); grid_out(o, 0.5)
        bbox(f'Stage_Ply_{i}{j}', LA, (1.97, 0.97, 0.018), P(cx, cyy, SH - 0.049), ply, bev=0.003)
for i in range(4):   # (the legs: shared at the corners, steel tube with a foot)
    for j in range(5):
        x, y = -SW / 2 + i * 2, -j * 1.0
        x += 0.04 if i == 0 else -0.04 if i == 3 else 0; y += -0.04 if j == 0 else 0.04 if j == 4 else 0
        rd(f'Stage_Leg_{i}{j}', LA, P(x, y, 0.012), P(x, y, SH - 0.058), 0.022, steel, verts=6)
        cy(f'Stage_Foot_{i}{j}', LA, 0.045, 0.012, P(x, y, 0.006), rubber, verts=8)
# the aluminium trim round the front and sides
bbox('Stage_TrimFront', LA, (SW + 0.02, 0.025, 0.05), P(0, -SD - 0.005, SH - 0.025), alu, bev=0.004)
for s in (-1, 1): bbox(f'Stage_TrimSide_{s:+d}', LA, (0.025, SD, 0.05), P(s * (SW / 2 + 0.005), -SD / 2, SH - 0.025), alu, bev=0.004)

def skirt(name, x0, y0, x1, y1, top, pleat=0.09, depth=0.025):
    # a pleated drape from the floor to `top` along a straight run (out from the stage by `depth` at each fold)
    a, b = Vector((x0, y0)), Vector((x1, y1)); L = (b - a).length; d = (b - a).normalized(); n = Vector((d.y, -d.x))   # (n: outwards)
    k = max(2, int(L / pleat)); verts, faces = [], []
    for i in range(k + 1):
        p = a + d * (L * i / k) + n * (depth if i % 2 else 0.003)
        verts += [(p.x, p.y, 0.005), (p.x, p.y, top)]
    for i in range(k): faces.append((i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new()
    for f in me.polygons:
        for li in f.loop_indices: vi = me.loops[li].vertex_index; uv.data[li].uv = ((vi // 2) / k * L / 0.5, (vi % 2) * top / 0.5)
    me.validate(); me.update(); o = G._obj(name, LA, me, velour)
    if o.data.polygons[0].normal.dot(Vector((n.x, n.y, 0))) < 0: o.data.flip_normals()
    return o
skirt('Stage_Skirt_Front', -SW / 2 - 0.02, -SD - 0.02, SW / 2 + 0.02, -SD - 0.02, SH - 0.05)
skirt('Stage_Skirt_Left', -SW / 2 - 0.02, -0.05, -SW / 2 - 0.02, -SD - 0.02, SH - 0.05)
skirt('Stage_Skirt_Right', SW / 2 + 0.02, -SD - 0.02, SW / 2 + 0.02, -0.05, SH - 0.05)
# the step: two treads at the front right, hazard tape on the nosings
for k, (h, dy) in enumerate(((0.1, 0.56), (0.2, 0.28))):
    bbox(f'Stage_Step_{k}', LA, (1.0, 0.28, h), P(2.3, -SD - dy, h / 2), ply, bev=0.006)
    bbox(f'Stage_StepTread_{k}', LA, (1.0, 0.28, 0.012), P(2.3, -SD - dy, h + 0.006), carpet, bev=0.003)
    bx(f'Stage_StepTape_{k}', LA, (1.0, 0.05, 0.004), P(2.3, -SD - dy - 0.115, h + 0.014), hazard)
bx('Stage_EdgeTape', LA, (1.0, 0.05, 0.004), P(2.3, -SD + 0.025, SH + 0.002), hazard)

# ================= the backdrop on its truss =================
TX, TY, TH, TS = 3.15, -0.22, 2.45, 0.29   # (the uprights' x, their y, the top truss's underside, the section)
def truss(name, p0, p1, along):
    # a box truss: four chords and zigzag lacing on each face, every section length
    p0, p1 = Vector(p0), Vector(p1); L = (p1 - p0).length; d = (p1 - p0).normalized()
    u = Vector((0, 0, 1)) if abs(d.z) < 0.5 else Vector((1, 0, 0)); v = d.cross(u).normalized(); u = v.cross(d).normalized()
    h = TS / 2 - 0.02; corners = [u * h + v * h, u * h - v * h, -u * h - v * h, -u * h + v * h]
    for k, c in enumerate(corners): rd(f'{name}_Chord{k}', LA, p0 + c, p1 + c, 0.024, alu, verts=6)
    n = max(1, int(L / TS))
    for f in range(4):
        a, b = corners[f], corners[(f + 1) % 4]
        for i in range(n):
            q0, q1 = p0 + d * (L * i / n), p0 + d * (L * (i + 1) / n)
            rd(f'{name}_Lace{f}_{i}', LA, q0 + (a if i % 2 == 0 else b), q1 + (b if i % 2 == 0 else a), 0.009, alu, verts=4)
for s in (-1, 1):
    truss(f'Truss_Up_{s:+d}', P(s * TX, TY, 0.02), P(s * TX, TY, TH + TS), 'z')
    bbox(f'Truss_Base_{s:+d}', LA, (0.6, 0.6, 0.012), P(s * TX, TY, 0.006), steel, bev=0.004)
    for k in range(4): cy(f'Truss_BaseBolt_{s:+d}_{k}', LA, 0.012, 0.02, P(s * TX + (0.25 if k % 2 else -0.25), TY + (0.25 if k // 2 else -0.25), 0.02), steel, verts=6)
truss('Truss_Top', P(-TX + TS / 2, TY, TH + TS / 2), P(TX - TS / 2, TY, TH + TS / 2), 'x')
BW, BH, BZ = 6.0, 2.0, SH + 0.1
mk(card('LAUNCH_BACKDROP', LA, BW, BH, P(0, TY - TS / 2 - 0.015, BZ), print_('La_Backdrop', 'backdrop', 0.05)))
bx('Backdrop_Back', LA, (BW, 0.004, BH), P(0, TY - TS / 2 - 0.011, BZ + BH / 2), black)   # (its back: the banner's other side)
for k in range(7):   # bungees: the banner's top edge to the top truss, its sides to the uprights
    x = -BW / 2 + 0.15 + k * (BW - 0.3) / 6
    sweep(f'Backdrop_Bungee_{k}', LA, [P(x, TY - TS / 2 - 0.02, BZ + BH - 0.02), P(x, TY - TS / 2 + 0.02, TH + 0.04)], 0.006, black, segs=4, per_m=6)
for s in (-1, 1):
    for z in (BZ + 0.2, BZ + 1.0, BZ + 1.8):
        sweep(f'Backdrop_Side_{s:+d}_{z:.1f}', LA, [P(s * (BW / 2 - 0.02), TY - TS / 2 - 0.02, z), P(s * (TX - TS / 2), TY - 0.1, z)], 0.006, black, segs=4, per_m=6)
# the balloon: one, in the team's colour, tied to the left upright (a bit soft by now)
lathe('Balloon', LA, [(0, 0), (0.06, 0.02), (0.15, 0.12), (0.17, 0.24), (0.14, 0.34), (0.07, 0.39), (0, 0.4)], P(-TX - 0.25, TY - 0.3, 2.15), team, segs=12, rot=(0.25, -0.2, 0))
sweep('Balloon_String', LA, [P(-TX - 0.21, TY - 0.33, 2.14), P(-TX - 0.12, TY - 0.2, 1.9), P(-TX - 0.15, TY - 0.15, 1.6)], 0.003, string, segs=3, per_m=8)

# ================= the car, under its cover =================
CAR = Vector((-0.4, -1.5, SH)); CROT = math.radians(80)   # (nose down the empty's -Y: turned 80°, it points stage right and a little at the press)
empty('LAUNCH_CAR', LA, tuple(CAR), rotz=CROT, kind='SINGLE_ARROW', size=0.8)
def cover(name, L=4.45, W=1.86, H=1.27, hem=0.07):
    # a fitted car cover: sections along the car (its length on -Y, as a car's), each an arch from hem to hem over the
    # roof; the ends roll down over the bumpers; folds in the skirt. Built about the car's middle, then placed
    nL, nA = 30, 22; verts, faces = [], []
    def roof(t):   # height along the car, 0 = nose .. 1 = tail: bonnet, screen, roof, rear screen, boot
        pts = [(0.0, 0.62), (0.12, 0.72), (0.3, 0.84), (0.36, 0.9), (0.47, H), (0.66, H), (0.78, 1.0), (0.86, 0.94), (1.0, 0.86)]   # (low nose, the screen's rake, roof, fastback, boot)
        for (a, za), (b, zb) in zip(pts, pts[1:]):
            if a <= t <= b: k = (t - a) / (b - a); k = k * k * (3 - 2 * k); return za + (zb - za) * k
        return pts[-1][1]
    for i in range(nL + 1):
        t = i / nL; y = -L / 2 + L * t          # (nose at -Y)
        e = 1 - abs(2 * t - 1) ** 5; r = max(0.0, e) ** 0.35        # (the ends roll down)
        top = hem + (roof(t) - hem) * r; half = W / 2 * (0.9 + 0.1 * r)
        ck = max(0.0, min(1.0, (t - 0.33) / 0.1, (0.82 - t) / 0.1)); cab = 0.92 - 0.3 * ck   # (the cabin narrower than the body: the arch pinches in up top, the shoulders show)
        for j in range(nA + 1):
            a = j / nA * math.pi; c, s_ = math.cos(a), math.sin(a)
            sx = (1 if c >= 0 else -1) * abs(c) ** 0.28; sz = abs(s_) ** 0.55
            x = sx * half * (1 - (1 - cab) * min(1.0, max(0.0, sz - 0.62) / 0.2)) if sz > 0.62 else sx * half
            z = hem + (top - hem) * sz
            fold = 0.025 * math.sin(t * 38 + j) * max(0.0, 0.45 - sz) * 2   # (folds in the lower skirt)
            # the wheel arches and the mirrors showing through: the cloth pushed out over each wheel, a bump by the screen
            for wt in (0.17, 0.8):
                k_ = max(0.0, 1 - abs(t - wt) / 0.085); arch = k_ * k_ * (3 - 2 * k_) * max(0.0, 1 - abs(sz - 0.42) / 0.3)
                fold += 0.085 * arch
            mir = max(0.0, 1 - abs(t - 0.38) / 0.03) * max(0.0, 1 - abs(sz - 0.72) / 0.08); fold += 0.09 * mir
            x += (1 if c >= 0 else -1) * (fold + (0.03 if sz < 0.12 else 0))  # (the hem flares out a little)
            verts.append((x, y, z))
    m = nA + 1
    for i in range(nL):
        for j in range(nA): faces.append((i * m + j, i * m + j + 1, (i + 1) * m + j + 1, (i + 1) * m + j))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new()
    for f in me.polygons:
        for li in f.loop_indices: vi = me.loops[li].vertex_index; i, j = divmod(vi, m); uv.data[li].uv = (j / nA * 3, i / nL * 5)
    me.validate(); me.update()
    for p in me.polygons: p.use_smooth = True
    o = G._obj(name, LA, me, team); o.location = tuple(CAR); o.rotation_euler = (0, 0, CROT)
    if sum(p.normal.z for p in me.polygons) < 0: me.flip_normals()
    return o
cov = cover('LAUNCH_COVER')
# Danny's note taped to the bonnet, the pull cord off the tail corner to the stage edge
bpy.context.view_layer.update()
loc = lambda lx, ly, lz: tuple(cov.matrix_world @ Vector((lx, ly, lz)))
mk(card('LAUNCH_COVER_Note', LA, 0.26, 0.16, loc(0.1, -1.6, 0.8), print_('La_NoteCover', 'sign_cover', 0.2), rotz=CROT, tilt=-1.25))
c0, c1 = Vector(loc(0.95, 2.1, 0.55)), Vector(loc(0.95, 2.1, 0.55)) + Vector((0.2, -0.9, -0.35))
sweep('LAUNCH_COVER_Cord', LA, [c0, (c0 + c1) / 2 + Vector((0, 0, -0.12)), c1, Vector((c1.x + 0.15, c1.y - 0.3, SH + 0.01))], 0.008, string, segs=4, per_m=8)
lathe('LAUNCH_COVER_Tassel', LA, [(0, 0), (0.025, 0.01), (0.03, 0.06), (0.01, 0.08), (0, 0.08)], (c1.x + 0.15, c1.y - 0.3, SH + 0.005), accent, segs=8)

# ================= the top table =================
TBX, TBY, TTZ = 0.95, -3.5, SH + 0.74   # (its middle; the top's height)
bbox('Table_Top', LA, (1.8, 0.6, 0.03), P(TBX, TBY, TTZ - 0.015), laminate, bev=0.006)
for sx in (-1, 1):   # (folding legs: a U each end with its brace)
    for sy in (-1, 1): rd(f'Table_Leg_{sx:+d}{sy:+d}', LA, P(TBX + sx * 0.8, TBY + sy * 0.24, SH), P(TBX + sx * 0.8, TBY + sy * 0.24, TTZ - 0.03), 0.013, frame, verts=6)
    rd(f'Table_LegBar_{sx:+d}', LA, P(TBX + sx * 0.8, TBY - 0.24, SH + 0.12), P(TBX + sx * 0.8, TBY + 0.24, SH + 0.12), 0.01, frame, verts=6)
    rd(f'Table_Brace_{sx:+d}', LA, P(TBX + sx * 0.8, TBY, SH + 0.12), P(TBX + sx * 0.35, TBY, TTZ - 0.04), 0.008, frame, verts=4)
# the cloth: over the top, down the front and the ends to just off the stage; the printed banner on the front
bbox('Table_Cloth', LA, (1.84, 0.64, 0.006), P(TBX, TBY, TTZ + 0.003), team, bev=0.002)
bx('Table_ClothFront', LA, (1.84, 0.006, TTZ - SH - 0.02), P(TBX, TBY - 0.322, SH + 0.02 + (TTZ - SH - 0.02) / 2), team)
for sx in (-1, 1): bx(f'Table_ClothEnd_{sx:+d}', LA, (0.006, 0.64, TTZ - SH - 0.02), P(TBX + sx * 0.922, TBY, SH + 0.02 + (TTZ - SH - 0.02) / 2), team)
mk(card('LAUNCH_TABLECLOTH', LA, 1.2, 0.375, P(TBX, TBY - 0.327, SH + 0.3), print_('La_TableBanner', 'table_banner', 0.08)))
# on the table: two desk mics (weighted base, gooseneck, the capsule, a flag in the team's accent), water, glasses,
# the name cards, a sheet of notes
def mic_head(name, at, toward, mat=camgrey):
    # a mic's head on the end of its neck, aimed at whoever talks into it (the lathe's axis turned onto the aim)
    d = (Vector(toward) - Vector(at)).normalized()
    return lathe(name, LA, [(0, 0), (0.012, 0), (0.016, 0.03), (0.018, 0.09), (0, 0.095)], tuple(at), mat, segs=10, rot=d.to_track_quat('Z', 'Y').to_euler())
MOUTH = SH + 1.18   # (a seated driver's mouth)
for k, dx in enumerate((-0.42, 0.42)):
    bx_, by_ = TBX + dx, TBY + 0.05
    mb = (bx_, TBY - 0.12, TTZ + 0.006); tip = Vector((bx_ + 0.01 * (1 - 2 * k), TBY + 0.08, TTZ + 0.33))
    lathe(f'Table_MicBase_{k}', LA, [(0, 0), (0.06, 0), (0.065, 0.012), (0.05, 0.03), (0, 0.032)], mb, black, segs=12)
    sweep(f'Table_MicNeck_{k}', LA, [P(bx_, TBY - 0.12, TTZ + 0.035), P(bx_, TBY - 0.11, TTZ + 0.18), P(bx_ + 0.005 * (1 - 2 * k), TBY - 0.02, TTZ + 0.3), tip], 0.006, black, segs=5, per_m=30)
    mic_head(f'Table_MicHead_{k}', tip, (bx_, TBY + 0.62, MOUTH))
    bbox(f'Table_MicFlag_{k}', LA, (0.05, 0.05, 0.05), tuple(tip - Vector((0, 0.035, 0.012))), accent, bev=0.004)
    sweep(f'Table_MicCable_{k}', LA, [P(bx_, TBY - 0.08, TTZ + 0.01), P(bx_ + 0.05, TBY + 0.3, TTZ + 0.008), P(bx_ + 0.07, TBY + 0.34, TTZ - 0.2), P(bx_ + 0.12, TBY + 0.4, SH + 0.01), P(1.9 + k * 0.08, -2.6, SH + 0.006), P(SW / 2 - 0.05, -2.2 + k * 0.06, SH + 0.006)], 0.005, cable, segs=4, per_m=8)
    lathe(f'Table_Bottle_{k}', LA, [(0, 0), (0.033, 0), (0.034, 0.16), (0.02, 0.2), (0.013, 0.215), (0.013, 0.23), (0, 0.23)], P(bx_ + 0.22, by_ + 0.05, TTZ + 0.006), water, segs=10)
    lathe(f'Table_Glass_{k}', LA, [(0, 0), (0.03, 0), (0.035, 0.11), (0.031, 0.11), (0.027, 0.006), (0, 0.006)], P(bx_ + 0.15, by_ - 0.12, TTZ + 0.006), glassm, segs=10, cap1=False)
    # the name card: a folded tent (the two halves meet at the top), the printed face to the press, left of the mic
    TT, TH_ = 0.32, 0.085; ny = TBY - 0.25
    mk(card(f'LAUNCH_NAME_{k + 1}', LA, 0.22, TH_, P(bx_ - 0.15, ny, TTZ + 0.006), print_(f'La_Tent{k + 1}', f'tent_{k + 1}', 0.05), tilt=-TT))
    mk(card(f'Table_TentBack_{k}', LA, 0.22, TH_, P(bx_ - 0.15, ny + 2 * TH_ * math.sin(TT), TTZ + 0.006), paper, rotz=math.pi, tilt=-TT))
put('papers', LA, P(TBX + 0.05, TBY + 0.1, TTZ + 0.006), 0.3, s=0.6)
# the two chairs behind it (padded stacking chairs) and where you sit
def chair(name, x, y, rotz, pad=seatpad, fold=False, sk=1.0):
    # a folding/stacking chair, its front to -Y (turned rotz): the frame, the seat (top at 0.48), the back
    M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rotz, 4, 'Z'); Q = lambda a, b, c: tuple(M @ Vector((a, b, c)))
    for s in (-1, 1):
        rd(f'{name}_LegF_{s:+d}', LA, Q(s * 0.2, -0.2, 0.0), Q(s * 0.2, -0.17, 0.46), 0.011, frame, verts=6)
        rd(f'{name}_LegB_{s:+d}', LA, Q(s * 0.19, 0.22, 0.0), Q(s * 0.19, 0.17, 0.9), 0.011, frame, verts=6)
        rd(f'{name}_Rail_{s:+d}', LA, Q(s * 0.2, -0.18, 0.44), Q(s * 0.19, 0.18, 0.44), 0.009, frame, verts=4)
    rd(f'{name}_Bar', LA, Q(-0.2, -0.19, 0.14), Q(0.2, -0.19, 0.14), 0.008, frame, verts=4)
    bbox(f'{name}_Seat', LA, (0.42, 0.4, 0.04), Q(0, 0.0, 0.46), pad, rot=(0, 0, rotz), bev=0.01)
    bbox(f'{name}_Back', LA, (0.4, 0.025, 0.2), Q(0, 0.185, 0.76), pad, rot=(-0.1, 0, rotz), bev=0.008)
SEATS = [(TBX - 0.42, TBY + 0.62), (TBX + 0.42, TBY + 0.62)]
for k, (x, y) in enumerate(SEATS):
    chair(f'Table_Chair_{k}', x, y, jit(0.06), sk=1.0)
    for o in [o for o in LA.objects if o.name.startswith(f'Table_Chair_{k}')]: o.location.z += SH
    empty(f'LAUNCH_SEAT_{k + 1}', LA, P(x, y, SH), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='sit_idle', role='driver')
# spike marks: white tape crosses where you stand for the reveal (beside the car)
for k, (x, y) in enumerate(((1.75, -2.75), (-2.6, -2.85))):
    for a in (0.785, -0.785): bx(f'Stage_Spike_{k}_{a:+.1f}', LA, (0.16, 0.03, 0.003), P(x, y, SH + 0.003), tape_w, rot=(0, 0, a))
    empty(f'LAUNCH_REVEAL_{k + 1}', LA, P(x, y, SH), rotz=-0.38 if k == 0 else 0.38, kind='SINGLE_ARROW', size=0.5, clip='idle', role='driver')
# gaffer over the mic cables where they cross the stage
for k, (x, y) in enumerate(((1.95, -2.62), (2.6, -2.35))): bx(f'Stage_Gaffer_{k}', LA, (0.05, 0.28, 0.003), P(x, y, SH + 0.009), gaffer, rot=(0, 0, 0.5))

# ================= the host's lectern (floor, stage left) and the question mic =================
LX, LY = -3.55, -4.55
bbox('Lectern_Body', LA, (0.55, 0.42, 1.0), P(LX, LY, 0.5), ply, rot=(0, 0, 0.35), bev=0.01)
bbox('Lectern_Top', LA, (0.62, 0.46, 0.03), P(LX, LY, 1.08), laminate, rot=(-0.3, 0, 0.35), bev=0.006)
mk(card('Lectern_Panel', LA, 0.42, 0.56, P(LX - 0.28 * math.sin(0.35) * 0.75, LY - 0.215 * math.cos(0.35) - 0.005, 0.32), team, rotz=0.35))
mk(card('Lectern_RunningOrder', LA, 0.15, 0.2, P(LX + 0.05, LY - 0.05, 1.1), print_('La_RunningOrder', 'running_order', 0.15), rotz=0.35, tilt=-1.27))
HB = Vector((-math.sin(0.35), math.cos(0.35), 0))   # (from the lectern towards the host behind it)
lm = Vector((LX, LY, 1.1)) - HB * 0.08; ltip = lm + HB * 0.16 + Vector((0, 0, 0.27))
sweep('Lectern_Neck', LA, [lm, lm + HB * 0.01 + Vector((0, 0, 0.15)), lm + HB * 0.09 + Vector((0, 0, 0.25)), ltip], 0.006, black, segs=5, per_m=30)
mic_head('Lectern_MicHead', ltip, Vector((LX, LY, 1.6)) + HB * 0.5)
empty('LAUNCH_HOST', LA, tuple(Vector((LX, LY, 0)) + HB * 0.48), rotz=0.35, kind='SINGLE_ARROW', size=0.5, clip='idle', role='host')
def mic_stand(name, x, y, h=1.5):
    lathe(f'{name}_Base', LA, [(0, 0), (0.14, 0), (0.15, 0.015), (0.03, 0.03), (0, 0.03)], P(x, y, 0), black, segs=14)
    rd(f'{name}_Pole', LA, P(x, y, 0.03), P(x, y, h - 0.12), 0.011, steel, verts=6)
    rd(f'{name}_Clutch', LA, P(x, y, 0.9), P(x, y, 0.96), 0.016, black, verts=8)
    sweep(f'{name}_Neck', LA, [P(x, y, h - 0.12), P(x, y - 0.03, h - 0.02), P(x, y - 0.1, h)], 0.006, black, segs=4, per_m=30)
    lathe(f'{name}_Head', LA, [(0, 0), (0.012, 0), (0.017, 0.03), (0.019, 0.1), (0, 0.105)], P(x, y - 0.1, h), camgrey, segs=10, rot=(-D90 + 0.3, 0, math.pi))
    sweep(f'{name}_Cable', LA, [P(x, y - 0.1, h - 0.02), P(x + 0.02, y, h - 0.25), P(x + 0.02, y, 0.3), P(x + 0.1, y + 0.12, 0.006), P(x + 1.5, y + 0.6, 0.006), P(SW / 2 - 0.2, -SD - 0.2, 0.006)], 0.005, cable, segs=4, per_m=6)
mic_stand('AskMic', -0.38, -4.95)   # (off the middle of the aisle: the TV camera at the back looks down it)
empty('LAUNCH_ASK', LA, P(-0.38, -5.35), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle', role='press')

# ================= the press: three rows with an aisle, the photographers' line =================
rows = (-5.6, -6.5, -7.4); cols = (-1.95, -1.4, -0.85, 0.85, 1.4, 1.95)
n = 0
for r, y in enumerate(rows):
    for c, x in enumerate(cols):
        dx, dy, a = jit(0.04), jit(0.05), jit(0.09)
        chair(f'Press_Chair_{r}{c}', x + dx, y + dy, math.pi + a)
        empty(f'LAUNCH_PRESS_{n:02d}', LA, P(x + dx, y + dy), rotz=math.pi + a, kind='SINGLE_ARROW', size=0.4, clip='sit_idle', role='press'); n += 1
# what the press left on and under the seats
mk(card('Press_Reserved', LA, 0.22, 0.1, P(-0.85, rows[0] - 0.02, 0.485), print_('La_Reserved', 'sign_reserved', 0.15), rotz=math.pi, tilt=-D90 + 0.02))
for k, (x, y) in enumerate(((-1.4, rows[0]), (1.95, rows[1]), (0.85, rows[2]))): bbox(f'Press_Notepad_{k}', LA, (0.15, 0.21, 0.012), P(x + 0.03, y + 0.02, 0.486), paper, rot=(0, 0, 0.3 * k), bev=0.002)
for k, (x, y) in enumerate(((-1.95, rows[0] + 0.25), (1.4, rows[1] + 0.25), (-0.85, rows[2] + 0.25), (0.85, rows[0] + 0.25))): put('coffee_cup', LA, P(x + 0.12, y, 0.0), k * 0.9)
bbox('Press_Bag', LA, (0.36, 0.14, 0.26), P(1.4 + 0.25, rows[0] + 0.2, 0.13), canvas, rot=(0, 0, 0.4), bev=0.02)
sweep('Press_BagStrap', LA, [P(1.55, rows[0] + 0.15, 0.26), P(1.62, rows[0] + 0.22, 0.38), P(1.75, rows[0] + 0.28, 0.26)], 0.008, canvas, segs=4, per_m=10)
put('can', LA, P(-1.4 + 0.2, rows[2] + 0.3, 0.0), 0.7)
bx('Press_Line', LA, (5.2, 0.05, 0.003), P(0.0, -4.4, 0.0015), tape_y)
for k, x in enumerate((-2.2, -1.1, 1.1, 2.2)): empty(f'LAUNCH_PHOTO_{k + 1:02d}', LA, P(x, -4.7), rotz=math.pi + (0.15 if x < 0 else -0.15), kind='SINGLE_ARROW', size=0.4, clip='idle', role='press')

# ================= the TV camera at the back =================
CX_, CY_, CZ_ = 0.0, -8.45, 1.42
for k in range(3):
    a = k / 3 * math.tau + 0.4; fx, fy = CX_ + 0.42 * math.sin(a), CY_ - 0.42 * math.cos(a)
    rd(f'Cam_Leg_{k}', LA, P(fx, fy, 0.02), P(CX_ + 0.06 * math.sin(a), CY_ - 0.06 * math.cos(a), CZ_ - 0.18), 0.016, alu, verts=6)
    rd(f'Cam_Spreader_{k}', LA, P(CX_ + 0.2 * math.sin(a), CY_ - 0.2 * math.cos(a), 0.12), P(CX_, CY_, 0.16), 0.008, black, verts=4)
    cy(f'Cam_Foot_{k}', LA, 0.025, 0.02, P(fx, fy, 0.01), rubber, verts=8)
lathe('Cam_Bowl', LA, [(0, 0), (0.07, 0.0), (0.09, 0.08), (0, 0.09)], P(CX_, CY_, CZ_ - 0.2), black, segs=12)
bbox('Cam_Head', LA, (0.16, 0.2, 0.1), P(CX_, CY_, CZ_ - 0.07), black, bev=0.012)
rd('Cam_PanBar', LA, P(CX_ + 0.05, CY_ - 0.05, CZ_ - 0.06), P(CX_ + 0.3, CY_ - 0.6, CZ_ - 0.18), 0.012, black, verts=6)
bbox('Cam_Body', LA, (0.15, 0.42, 0.2), P(CX_, CY_ + 0.02, CZ_ + 0.1), camgrey, bev=0.02)
lathe('Cam_Lens', LA, [(0.045, 0), (0.05, 0.08), (0.06, 0.2), (0.068, 0.24), (0.068, 0.27), (0, 0.27)], P(CX_, CY_ + 0.22, CZ_ + 0.11), black, segs=12, rot=(-D90, 0, 0))
bbox('Cam_Viewfinder', LA, (0.07, 0.14, 0.07), P(CX_ - 0.1, CY_ + 0.14, CZ_ + 0.19), black, bev=0.01)
bbox('Cam_Battery', LA, (0.12, 0.08, 0.14), P(CX_, CY_ - 0.23, CZ_ + 0.1), black, bev=0.01)
sweep('Cam_Handle', LA, [P(CX_, CY_ - 0.12, CZ_ + 0.2), P(CX_, CY_ - 0.08, CZ_ + 0.29), P(CX_, CY_ + 0.12, CZ_ + 0.29), P(CX_, CY_ + 0.16, CZ_ + 0.2)], 0.014, black, segs=6, per_m=20)
cy('Cam_Tally', LA, 0.012, 0.012, P(CX_ + 0.06, CY_ + 0.2, CZ_ + 0.21), redlight, verts=8)
sweep('Cam_Cable', LA, [P(CX_, CY_ - 0.27, CZ_ + 0.05), P(CX_ + 0.05, CY_ - 0.3, CZ_ - 0.4), P(CX_ + 0.1, CY_ - 0.2, 0.01), P(CX_ + 0.6, CY_ - 0.1, 0.006), P(CX_ + 0.9, CY_ - 0.35, 0.006), P(CX_ + 0.7, CY_ - 0.6, 0.006), P(CX_ + 0.45, CY_ - 0.4, 0.006), P(CX_ + 0.7, CY_ - 0.15, 0.006), P(CX_ + 2.4, CY_ + 1.6, 0.006)], 0.007, cable, segs=4, per_m=8)

# ================= lamps and the PA =================
def lamp(name, x, y, aim, h=2.5):
    for k in range(3):
        a = k / 3 * math.tau; fx, fy = x + 0.45 * math.sin(a), y - 0.45 * math.cos(a)
        rd(f'{name}_Leg_{k}', LA, P(fx, fy, 0.0), P(x, y, 0.55), 0.012, black, verts=5)
        rd(f'{name}_Brace_{k}', LA, P(x + 0.22 * math.sin(a), y - 0.22 * math.cos(a), 0.27), P(x, y, 0.42), 0.007, black, verts=4)
    rd(f'{name}_Pole', LA, P(x, y, 0.4), P(x, y, h - 0.15), 0.014, black, verts=6)
    rd(f'{name}_PoleTop', LA, P(x, y, h - 0.6), P(x, y, h - 0.12), 0.011, alu, verts=6)
    p = Vector((x, y, h)); d = (Vector(aim) - p).normalized(); q = d.to_track_quat('Z', 'Y')
    yoke = sweep(f'{name}_Yoke', LA, [p + Vector((0, 0, -0.14)), p + Vector((0.12, 0, -0.1)), p + Vector((0.13, 0, 0.02))], 0.008, black, segs=4, per_m=40)
    body = lathe(f'{name}_Body', LA, [(0.0, -0.16), (0.1, -0.16), (0.11, -0.1), (0.11, 0.08), (0.12, 0.09), (0.12, 0.11), (0.0, 0.11)], tuple(p), lampbody, segs=12, rot=q.to_euler())
    lathe(f'{name}_Lens', LA, [(0.0, 0.0), (0.095, 0.0), (0.0, 0.012)], tuple(p + d * 0.11), lens_on, segs=12, rot=q.to_euler())
    M = Matrix.Translation(p) @ q.to_matrix().to_4x4()
    for k in range(4):   # (barn doors, open)
        a = k * D90; dx, dy = math.cos(a), math.sin(a)
        c = M @ Vector((dx * 0.14, dy * 0.14, 0.16)); door = bx(f'{name}_Door_{k}', LA, (0.2 if k % 2 else 0.05, 0.05 if k % 2 else 0.2, 0.006), tuple(c), black)
        door.rotation_euler = (q @ Matrix.Rotation(0.9, 4, 'Y' if k % 2 == 0 else 'X').to_quaternion()).to_euler() if k < 2 else (q @ Matrix.Rotation(-0.9, 4, 'Y' if k % 2 == 0 else 'X').to_quaternion()).to_euler()
    sweep(f'{name}_Cable', LA, [p + Vector((0, 0.05, -0.16)), Vector((x + 0.02, y + 0.03, h - 0.4)), Vector((x + 0.02, y + 0.03, 0.5)), Vector((x + 0.15, y + 0.1, 0.006)), Vector((3.55, -4.1, 0.006))], 0.006, cable, segs=4, per_m=6)
    L = bpy.data.lights.new(f'Light_{name}', 'SPOT'); L.energy = 520; L.color = (1.0, 0.9, 0.74); L.spot_size = math.radians(55); L.spot_blend = 0.45; L.shadow_soft_size = 0.3
    o = bpy.data.objects.new(f'Light_{name}', L); o.location = tuple(p + d * 0.12); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); LA.objects.link(o)
lamp('LampL', -3.55, -5.5, (-0.6, -2.0, 1.0)); lamp('LampR', 3.55, -5.5, (0.6, -2.4, 1.0))
for s in (-1, 1):   # (the PA: a cab on a pole on a tripod each side of the stage front)
    x, y = s * 3.45, -4.25
    for k in range(3):
        a = k / 3 * math.tau + 0.5; rd(f'PA_{s:+d}_Leg_{k}', LA, P(x + 0.4 * math.sin(a), y - 0.4 * math.cos(a), 0.0), P(x, y, 0.5), 0.012, black, verts=5)
    rd(f'PA_{s:+d}_Pole', LA, P(x, y, 0.45), P(x, y, 1.55), 0.017, black, verts=6)
    put('speaker', LA, P(x, y, 1.55), -s * 0.25, name=f'PA_{s:+d}_Cab')   # (the pack's speaker has its grille to -Y: to the press, toed in)
# the extension reel the cables run to (stage right, by the step)
lathe('Reel_Drum', LA, [(0.05, 0), (0.16, 0), (0.16, 0.012), (0.08, 0.012), (0.08, 0.16), (0.16, 0.16), (0.16, 0.172), (0.05, 0.172)], P(3.55, -4.1, 0.17), mat_img('La_ReelOrange', None, 0.6), segs=14, rot=(D90, 0, 0.3))
bpy.data.materials['La_ReelOrange'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.32, 0.04, 1)
cy('Reel_Hub', LA, 0.07, 0.15, P(3.55, -4.1, 0.17), mat_img('La_ReelCord', None, 0.7), rot=(D90, 0, 0.3), verts=12)
bbox('Reel_Socket', LA, (0.1, 0.06, 0.08), P(3.55, -4.1, 0.37), black, bev=0.008)

# ================= coffee and donuts (stage right, against the side) =================
KX, KY = 3.55, -6.9
bbox('Coffee_Table', LA, (0.6, 1.2, 0.03), P(KX, KY, 0.735), laminate, bev=0.006)
for sx in (-1, 1):
    for sy in (-1, 1): rd(f'Coffee_Leg_{sx:+d}{sy:+d}', LA, P(KX + sx * 0.26, KY + sy * 0.55, 0), P(KX + sx * 0.26, KY + sy * 0.55, 0.72), 0.012, frame, verts=6)
put('coffee', LA, P(KX + 0.05, KY + 0.35, 0.75), -D90 + 0.1)
for k in range(2): lathe(f'Coffee_Cups_{k}', LA, [(0.0, 0.0), (0.03, 0.0), (0.04, 0.09 + k * 0.05), (0.0, 0.09 + k * 0.05)], P(KX - 0.12, KY + 0.05 + k * 0.1, 0.75), paper, segs=10)
bbox('Donut_Box', LA, (0.36, 0.36, 0.06), P(KX, KY - 0.3, 0.78), cardboard, bev=0.004)
bx('Donut_Lid', LA, (0.36, 0.004, 0.36), P(KX, KY - 0.3 + 0.18, 0.81 + 0.18), cardboard, rot=(-0.35, 0, 0))
mk(card('Donut_Sign', LA, 0.2, 0.12, P(KX, KY - 0.3 + 0.18 - 0.13 * math.tan(0.35) - 0.004, 0.86), print_('La_DonutSign', 'sign_donuts', 0.2), tilt=-0.35))   # (on the open lid's inside)
ring = [(0.05 + 0.025 * math.cos(t), 0.025 * math.sin(t)) for t in np.linspace(-math.pi, math.pi, 9)]
top_ = [(0.05 + 0.027 * math.cos(t), 0.027 * math.sin(t) + 0.002) for t in np.linspace(-0.2, math.pi + 0.2, 6)]
for k, (dx, dy) in enumerate(((-0.1, -0.1), (0.02, -0.11), (0.11, -0.05), (-0.09, 0.04), (0.06, 0.07))):   # (five left of six)
    q = P(KX + dx, KY - 0.3 + dy, 0.78)
    lathe(f'Donut_{k}', LA, ring, q, dough, segs=10); lathe(f'Donut_Ice_{k}', LA, top_, q, icing[k % 3], segs=10, cap0=False, cap1=False)
# PRESS THIS WAY, on an A-board by the door
BX_, BY_ = -1.2, -9.6
for s in (-1, 1): bbox(f'ABoard_Panel_{s:+d}', LA, (0.5, 0.02, 0.8), P(BX_, BY_ + s * 0.13, 0.42), ply, rot=(s * 0.32, 0, 0), bev=0.004)
mk(card('ABoard_Sign', LA, 0.42, 0.25, P(BX_, BY_ - 0.13 + 0.08 * math.tan(0.32) - 0.012, 0.5), print_('La_SignPress', 'sign_press', 0.2), tilt=-0.32))   # (flat on the front board)

# ================= the cameras the game cuts between =================
def cam(name, at, look, fov):
    empty(f'CAM_launch_{name}', LA, tuple(at), kind='CONE', size=0.3, tx=look[0], ty=look[1], tz=look[2], fov=fov)
cam('wide', (2.6, -9.4, 2.4), (0.0, -2.2, 0.9), 52)          # (from the back corner, over the press: the whole room)
cam('qa', (0.12, -7.9, 1.45), (TBX - 0.1, TBY, TTZ + 0.25), 30)  # (the TV camera's view of the top table)
cam('ask', (1.0, -3.6, 1.35), (-0.38, -5.4, 1.3), 40)           # (a question from the floor)
cam('reveal', (-3.1, -7.2, 1.25), tuple(CAR + Vector((0.3, 0, 0.55))), 46)   # (low, three-quarter on the car, the table out of the way)
cam('close', (3.85, -3.1, 1.15), tuple(CAR + Vector((1.7, -0.3, 0.45))), 50)  # (stage right, on the nose as the cover comes off)

if '--noao' not in args:
    print('AO baked on', bake_ao(LA, skip=(lens_on, redlight), wall=False), 'objects')
if not LIVE or '--export' in args: export_station(LA, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'launch-start.blend'))
print('LAUNCH objects', len(LA.all_objects), 'triangles', tris(LA))
