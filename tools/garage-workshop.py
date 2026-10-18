# Builds models/garage/workshop-start.blend: the Race Workshop (World Career premises level 2), see docs/GARAGE-KIT.md.
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-workshop.py               (the .blend)
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-workshop.py -- --export   (+ shell_workshop.glb)
#
# A late-90s / 2000s GT team's race shop on an industrial estate: the "we're a real team now" step up from the unit.
# Clean and bright but used: a pale epoxy floor with yellow walkways, white-painted blockwork with a team band, lined
# cladding above, a portal-frame roof with skylights and high-bay lamps. Built the garage-station way
# (.claude/skills/garage-station).
#
# Layout (metres, floor Z = 0, the doors down -Y), 24 x 18 m:
#   front wall y -9: the big roll-up door over bays 1 and 2, a smaller one at the project bay, a side door to reception
#   main floor: bay 1 (the setup pad), bay 2 (car two), bay 3 (projects: the lift), the bench (SLOT_tools) on the left
#   back row (behind a block partition at y 4.5): the dyno room (glass window), the parts store (a hatch), the fab
#     shop (open front), your office (under the mezzanine)
#   right side x 6..12: a mezzanine 3 m up the whole depth, stairs up its front edge. On it, behind a glass front: the
#     engineering office (SLOT_data) and the sim room (SLOT_sim). Under it: reception and the trophy wall by the side
#     door, the mess
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'models', 'garage', 'src')
OUT = os.path.join(ROOT, 'models', 'garage')
GEN = os.path.join(SRC, 'workshop_gen' + ('_' + os.environ['WS_TAG'] if os.environ.get('WS_TAG') else ''))   # (a tagged build's textures apart: builds at once)
TEX = os.path.join(SRC, 'psx_industrial')
KIT = os.path.join(OUT, 'kit-start.blend')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
os.makedirs(GEN, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
D90 = math.pi / 2

# ---- the plan ----
X0, X1, Y0, Y1 = -12.0, 12.0, -9.0, 9.0
EAVE, RIDGE = 6.5, 7.6
BACK_Y = 4.5                                   # (the back row's partition)
ROOM_H = 3.4                                   # (the back rooms' walls and ceilings)
MX = 6.0; DECK_Z = 3.0                         # (the mezzanine: x MX to the right wall, the whole depth, its top 3 m up)
BAY1, BAY2, BAY3 = Vector((-8.0, -3.0, 0)), Vector((-3.5, -3.0, 0)), Vector((1.5, -3.0, 0))
DOOR_A = (-9.75, -1.75, 4.5)                   # (the big roll-up: x0, x1, height)
DOOR_B = (-0.75, 3.75, 4.5)                    # (the project bay's)
SIDE = (9.0, 10.0, 2.1)                        # (the side door, into reception)
ST_X0, ST_X1, ST_Y0, ST_Y1 = 4.8, 6.0, -1.0, 3.4   # (the stairs up the mezzanine's front edge; a landing to y 4.5)

import garagelib as G
from garagelib import *
G.configure(GEN, seed=2003); RNG = G.RNG
lib_coll = G.lib_collection()

kit = collection('KIT (each collection is one .glb)')
shell = collection('shell_workshop', kit)
build = collection('shell_workshop build', shell)
dress = collection('shell_workshop dressing', shell)
lights = collection('shell_workshop lights', shell)
hooks = collection('shell_workshop hooks', shell)
B = build

# ======================================================================================================================
# textures
PPM = 40
fw, fh = int((X1 - X0) * PPM), int((Y1 - Y0) * PPM)
yy, xx = np.mgrid[0:fh, 0:fw].astype(np.float32); wx, wy = xx / PPM + X0, yy / PPM + Y0
# the floor: pale grey epoxy, a fine fleck, soft scuffs, tire marks in at the doors, the walkways and bays painted
col = np.ones((fh, fw, 3), np.float32) * np.array([0.68, 0.7, 0.72], np.float32)
col *= (1 + (np.random.default_rng(3).random((fh, fw)) > 0.94)[..., None] * (np.random.default_rng(4).random((fh, fw, 1)) - 0.5) * 0.16)
col *= (1 + (fbm(fh, fw, (160, 60, 20)) - 0.5) * 0.07)[..., None]
tracks = np.zeros((fh, fw), np.float32)
for b, k in ((BAY1, 0.22), (BAY2, 0.22), (BAY3, 0.16)):
    for sd in (-0.8, 0.8):
        d = np.abs(wx - (b.x + sd + (vnoise(fh, fw, 60) - 0.5) * 0.2))
        tracks = np.maximum(tracks, k * np.clip(1 - d / 0.15, 0, 1) * np.clip((b.y + 1.5 - wy) / 4, 0, 1) * (0.6 + 0.4 * vnoise(fh, fw, 6)))
edge = np.minimum.reduce([wx - X0, X1 - wx, wy - Y0, Y1 - wy])
dirt = (fbm(fh, fw, (120, 40, 12)) - 0.5) * 0.25 + np.clip(1 - edge / 0.6, 0, 1) ** 1.5 * 0.3
spots = [(*((b.x + dx - X0) * PPM, (b.y + dy - Y0) * PPM), r, k) for b in (BAY2, BAY3) for dx, dy, r, k in ((0.1, -1.4, 0.35, 0.35), (-0.2, 0.2, 0.25, 0.25))]
oil = blobs(fh, fw, spots, PPM)
paint = np.zeros((fh, fw), np.float32)
line = lambda m: np.clip(m, 0, 1)
# the walkway: from the side door along the mezzanine's front, and across in front of the back row
paint = np.maximum(paint, line((np.abs(wx - 4.55) < 0.05) * (wy > -8.9) * (wy < -1.2)))
paint = np.maximum(paint, line((np.abs(wy - 3.55) < 0.05) * (wx > -11.9) * (wx < 4.6)))
paint = np.maximum(paint, line((np.abs(wy - 2.45) < 0.05) * (wx > -11.9) * (wx < 4.6)))
for b in (BAY1, BAY2, BAY3):   # (each bay's box, 3.4 x 6.4)
    for s in (-1, 1):
        paint = np.maximum(paint, line((np.abs(wx - (b.x + s * 1.7)) < 0.04) * (np.abs(wy - b.y) < 3.2)))
    paint = np.maximum(paint, line((np.abs(wy - (b.y + 3.2)) < 0.04) * (np.abs(wx - b.x) < 1.7)))
paint *= np.clip(vnoise(fh, fw, 5) * 1.2 + 0.2, 0, 1) * (1 - tracks * 2.5).clip(0, 1)
col = col * (1 - paint[..., None] * 0.7) + np.array([0.8, 0.62, 0.1], np.float32) * paint[..., None] * 0.7
col = grime(col, dirt); col = grime(col, tracks, OIL); col = grime(col, oil * 0.6, OIL)
floor_mat = mat_img('WS_Floor', save('ws_floor', col), 0.6)

# blockwork, painted white: 440 x 215 courses, the mortar a shade darker, splashed at the foot; a band at 1.2 m
WPPM = 40
def block_tex(name, L, H, band=True):
    w, h = int(L * WPPM), int(H * WPPM)
    zz, uu = np.mgrid[0:h, 0:w].astype(np.float32) / WPPM; zz = H - zz   # (row 0 is the top)
    c = np.ones((h, w, 3), np.float32) * np.array([0.88, 0.88, 0.86], np.float32)
    course = np.floor(zz / 0.225); off = (course % 2) * 0.225
    mort = ((zz % 0.225) < 0.012) | (((uu + off) % 0.45) < 0.012)
    c *= (1 - mort * 0.12)[..., None]
    c *= (1 + (fbm(h, w, (64, 16, 4)) - 0.5) * 0.05)[..., None]
    if band:
        bnd = (zz > 1.05) & (zz < 1.3)
        c = np.where(bnd[..., None], np.array([0.12, 0.2, 0.42], np.float32) * (1 - mort * 0.1)[..., None], c)
    skirt = np.clip(1 - zz / 0.35, 0, 1) ** 1.5 * (0.35 + 0.25 * vnoise(h, w, 10))
    c = grime(c, skirt + (fbm(h, w, (96, 24)) - 0.55) * 0.12)
    return mat_img(name, save(name, c), 0.9)
# cladding liner above the blockwork: light grey profiled sheet, ribs every 0.25 m, faint streaks
def liner_tex(name, L, H):
    w, h = int(L * 24), int(H * 24)
    zz, uu = np.mgrid[0:h, 0:w].astype(np.float32) / 24
    c = np.ones((h, w, 3), np.float32) * np.array([0.74, 0.76, 0.78], np.float32)
    c *= (1 - 0.1 * (np.abs((uu % 0.25) - 0.125) < 0.03))[..., None]
    c = grime(c, (fbm(h, w, (64, 16)) - 0.5) * 0.15 + np.clip(vnoise(1, w, 3)[0] * 1.6 - 1.2, 0, 1)[None, :] * 0.2)
    return mat_img(name, save(name, c), 0.8)

# ======================================================================================================================
# the shell
BLOCK_H = 3.0
def gable(u, L): return EAVE + (RIDGE - EAVE) * (1 - abs(u - L / 2) / (L / 2))
openF = [(DOOR_A[0] - X0, DOOR_A[1] - X0, 0, DOOR_A[2]), (DOOR_B[0] - X0, DOOR_B[1] - X0, 0, DOOR_B[2]), (SIDE[0] - X0, SIDE[1] - X0, 0, SIDE[2]),
         (7.0 - X0, 8.4 - X0, 1.0, 2.2), (10.6 - X0, 11.6 - X0, 1.0, 2.2), (7.0 - X0, 11.6 - X0, DECK_Z + 0.9, DECK_Z + 2.1)]   # (reception's windows, the sim room's)
# (the block, up to 3 m, with its openings; the liner above it to the eaves / gable)
wall('Wall_Front_Block', B, (X0, Y0, 0), (X1, Y0, 0), lambda u: BLOCK_H, openF, block_tex('ws_block_front', 24, BLOCK_H), (0, 1, 0), 24, BLOCK_H)
wall('Wall_Front_Liner', B, (X0, Y0, 0), (X1, Y0, 0), lambda u: gable(u, 24), [(0, 24, 0, BLOCK_H)] + [o for o in openF if o[3] > BLOCK_H], liner_tex('ws_liner_front', 24, RIDGE), (0, 1, 0), 24, RIDGE)
winL = [(y - Y0 - 1.5, y - Y0 + 1.5, 4.2, 5.6) for y in (-6.0, -1.0, 4.0)]   # (high windows down the left wall)
wall('Wall_Left_Block', B, (X0, Y0, 0), (X0, Y1, 0), lambda u: BLOCK_H, [], block_tex('ws_block_left', 18, BLOCK_H), (1, 0, 0), 18, BLOCK_H)
wall('Wall_Left_Liner', B, (X0, Y0, 0), (X0, Y1, 0), lambda u: EAVE, [(0, 18, 0, BLOCK_H)] + winL, liner_tex('ws_liner_left', 18, EAVE), (1, 0, 0), 18, EAVE)
wall('Wall_Right_Block', B, (X1, Y0, 0), (X1, Y1, 0), lambda u: BLOCK_H, [(y - Y0 - 1.0, y - Y0 + 1.0, DECK_Z + 0.9, DECK_Z + 2.1) for y in (8.0,)], block_tex('ws_block_right', 18, BLOCK_H), (-1, 0, 0), 18, BLOCK_H)
wall('Wall_Right_Liner', B, (X1, Y0, 0), (X1, Y1, 0), lambda u: EAVE, [(0, 18, 0, BLOCK_H)] + [(y - Y0 - 1.0, y - Y0 + 1.0, DECK_Z + 0.9, DECK_Z + 2.1) for y in (8.0,)], liner_tex('ws_liner_right', 18, EAVE), (-1, 0, 0), 18, EAVE)
wall('Wall_Back_Block', B, (X0, Y1, 0), (X1, Y1, 0), lambda u: BLOCK_H, [], block_tex('ws_block_back', 24, BLOCK_H, band=False), (0, -1, 0), 24, BLOCK_H)
wall('Wall_Back_Liner', B, (X0, Y1, 0), (X1, Y1, 0), lambda u: gable(u, 24), [(0, 24, 0, BLOCK_H)], liner_tex('ws_liner_back', 24, RIDGE), (0, -1, 0), 24, RIDGE)
quad('Floor', B, [(X0, Y0, 0), (X1, Y0, 0), (X1, Y1, 0), (X0, Y1, 0)], floor_mat, (0, 0, 1), [(0, 0), (1, 0), (1, 1), (0, 1)])

# the roof: insulated liner panels on the underside, a run of skylights each side
roofc = np.ones((96, 96, 3), np.float32) * np.array([0.8, 0.81, 0.82], np.float32)
roofc *= (1 - 0.12 * ((np.arange(96) % 48) < 2))[None, :, None]
roof_mat = mat_img('WS_Roof', save('ws_roof', grime(roofc, (fbm(96, 96, (48, 12), wrap=True) - 0.5) * 0.12)), 0.85)
for s, xe in ((-1, X0), (1, X1)):
    pts = [(xe, Y0, EAVE), (0, Y0, RIDGE), (0, Y1, RIDGE), (xe, Y1, EAVE)]
    o = quad(f'Roof_{"L" if s < 0 else "R"}', B, pts, roof_mat, (-s * 0.1, 0, -1), [(0, 0), (6, 0), (6, 4.5), (0, 4.5)])
sky = mat_img('WS_Skylight', None, 0.4, emit=((0.85, 0.92, 1.0), 2.2))
for s in (-1, 1):
    for y in (-6.5, -2.0, 2.5, 7.0):
        x0, x1 = s * 3.0, s * 5.0
        z0 = RIDGE - (RIDGE - EAVE) * abs(x0) / 12 - 0.03; z1 = RIDGE - (RIDGE - EAVE) * abs(x1) / 12 - 0.03
        quad(f'Skylight_{s}_{y}', B, [(x0, y - 1.2, z0), (x1, y - 1.2, z1), (x1, y + 1.2, z1), (x0, y + 1.2, z0)], sky, (0, 0, -1))

# the shared steel finishes, and the stairs' numbers (tools/workshop/structure.py builds them)
frame = grimy_tile('WS_Frame', 'painted_metal.png', dirt=0.15, tint=(0.36, 0.42, 0.5))
steel = grimy_tile('WS_Steel', 'dark_industrial_metal.png', dirt=0.3, rust=0.1)
nst = 17; run = ST_Y1 - ST_Y0; sw = ST_X1 - ST_X0

# the back row: a block partition along y 4.5, walls between the rooms, each room's ceiling at 3.4
def partition(name, a, b, opens, mat, H=ROOM_H, t=0.2):
    # a block wall a -> b in separate pieces round its openings [(u0, u1, z0, z1)], so a doorway's gap stays walkable
    a, b = Vector(a), Vector(b); L = (b - a).length; d = (b - a) / L; n = Vector((-d.y, d.x, 0))
    cuts = sorted(opens); u = 0.0; k = 0
    def piece(u0, u1, z0, z1):
        nonlocal k
        if u1 - u0 < 0.01 or z1 - z0 < 0.01: return
        c = a + d * ((u0 + u1) / 2); ang = math.atan2(d.y, d.x)
        box(f'{name}_{k}', B, (u1 - u0, t, z1 - z0), (c.x, c.y, (z0 + z1) / 2), mat, rot=(0, 0, ang)); k += 1
    for (u0, u1, z0, z1) in cuts:
        piece(u, u0, 0, H); piece(u0, u1, 0, z0); piece(u0, u1, z1, H); u = u1
    piece(u, L, 0, H)
pmat = block_tex('ws_block_part', 4, ROOM_H, band=True)
glass = solid_mat('WS_Glass', (0.55, 0.7, 0.78), 0.1)
glass.surface_render_method = 'BLENDED'
bsdf = glass.node_tree.nodes['Principled BSDF']; bsdf.inputs['Alpha'].default_value = 0.22
partition('Part_Dyno', (X0, BACK_Y, 0), (-5.5, BACK_Y, 0), [(1.5, 5.0, 1.0, 2.6), (5.4, 6.3, 0, 2.15)], pmat)   # (the window, the door)
box('Dyno_Window_Glass', B, (3.5, 0.03, 1.6), (X0 + 3.25, BACK_Y, 1.8), glass)
partition('Part_Parts', (-5.5, BACK_Y, 0), (1.0, BACK_Y, 0), [(1.5, 4.5, 1.05, 2.3), (4.9, 5.9, 0, 2.15)], pmat)   # (the hatch, the door)
bbox('Parts_Hatch_Counter', B, (3.1, 0.5, 0.05), (-2.5, BACK_Y - 0.05, 1.05), steel, bev=0.008)
partition('Part_Fab', (1.0, BACK_Y, 0), (MX, BACK_Y, 0), [(0.6, 4.4, 0, 3.0)], pmat)   # (open fronted)
partition('Part_Office', (MX, BACK_Y, 0), (X1, BACK_Y, 0), [(0.6, 1.6, 0, 2.15), (2.4, 5.2, 1.0, 2.2)], pmat, H=DECK_Z)   # (your office: the door, a window)
box('Office_Window_Glass', B, (2.8, 0.03, 1.2), (MX + 3.8, BACK_Y, 1.6), glass)
for x in (-5.5, 1.0):
    partition(f'Part_Side_{x:+.0f}', (x, BACK_Y, 0), (x, Y1, 0), [], pmat)
partition('Part_Side_Office', (MX, BACK_Y, 0), (MX, Y1, 0), [], pmat)
ceil = plain_mat('WS_Ceiling', (0.82, 0.83, 0.84), dirt=0.08)
for nm, x0, x1 in (('Dyno', X0, -5.5), ('Parts', -5.5, 1.0), ('Fab', 1.0, MX)):
    quad(f'Ceiling_{nm}', B, [(x0, BACK_Y, ROOM_H), (x1, BACK_Y, ROOM_H), (x1, Y1, ROOM_H), (x0, Y1, ROOM_H)], ceil, (0, 0, -1), [(0, 0), (3, 0), (3, 2), (0, 2)])
    box(f'Ceiling_{nm}_Top', B, (x1 - x0, Y1 - BACK_Y, 0.08), ((x0 + x1) / 2, (BACK_Y + Y1) / 2, ROOM_H + 0.04), pmat)

# the mezzanine: a deck over the right side, its edge on a beam and columns, a glass front upstairs
deck = grimy_tile('WS_Deck', 'metal_plate_02.png', dirt=0.2)
quad('WALK_Deck', B, [(MX, Y0, DECK_Z), (X1, Y0, DECK_Z), (X1, Y1, DECK_Z), (MX, Y1, DECK_Z)], plain_mat('WS_DeckFloor', (0.34, 0.36, 0.4), dirt=0.12), (0, 0, 1), [(0, 0), (3, 0), (3, 9), (0, 9)])
quad('WALK_DeckUnder', B, [(MX, Y0, DECK_Z - 0.25), (X1, Y0, DECK_Z - 0.25), (X1, Y1, DECK_Z - 0.25), (MX, Y1, DECK_Z - 0.25)], ceil, (0, 0, -1), [(0, 0), (3, 0), (3, 9), (0, 9)])
bbox('WALK_DeckEdge', B, (0.25, Y1 - Y0, 0.3), (MX + 0.12, 0, DECK_Z - 0.15), frame, bev=0.01)
for y in (-8.7, -4.5, -1.2, 4.5, 8.7):
    if Y0 < y < Y1: bbox(f'Mezz_Column_{y:+.1f}', B, (0.2, 0.2, DECK_Z - 0.3), (MX + 0.12, y, (DECK_Z - 0.3) / 2), frame, bev=0.01)
# the glass front upstairs, in panes on mullions; a door at the landing; the sim room's glass wall across
for k, y in enumerate(np.arange(Y0 + 0.1, ST_Y1 + 0.01, 1.55)):
    y1 = min(y + 1.55, ST_Y1)
    if y1 - y < 0.2: continue
    box(f'Office_Glass_{k}', B, (0.03, y1 - y - 0.06, 2.4), (MX + 0.1, (y + y1) / 2, DECK_Z + 1.25), glass)
    box(f'Office_Mullion_{k}', B, (0.08, 0.06, 2.6), (MX + 0.1, y, DECK_Z + 1.3), frame)
box('Office_Glass_Head', B, (0.1, Y1 - Y0, 0.12), (MX + 0.1, 0, DECK_Z + 2.55), frame)
box('Office_Glass_Sill', B, (0.1, ST_Y1 - Y0, 0.08), (MX + 0.1, (Y0 + ST_Y1) / 2, DECK_Z + 0.04), frame)
box('Office_Glass_Top', B, (0.03, Y1 - ST_Y1 - 1.1, 2.4), (MX + 0.1, (ST_Y1 + 1.1 + Y1) / 2, DECK_Z + 1.25), glass)   # (past the door)
for k, x in enumerate(np.arange(MX + 0.15, 10.4, 1.42)):   # (to x 10.4: the sim room's doorway after it)
    x1 = min(x + 1.42, 10.4)
    box(f'Sim_Glass_{k}', B, (x1 - x - 0.06, 0.03, 2.4), ((x + x1) / 2, -4.5, DECK_Z + 1.25), glass)
    box(f'Sim_Mullion_{k}', B, (0.06, 0.08, 2.6), (x, -4.5, DECK_Z + 1.3), frame)
box('Sim_Door_Jamb', B, (0.06, 0.08, 2.6), (10.4, -4.5, DECK_Z + 1.3), frame)
box('Sim_Door_Head', B, (X1 - 10.4, 0.08, 0.5), ((10.4 + X1) / 2, -4.5, DECK_Z + 2.35), frame)
# the outside windows: frosted daylight in an aluminium frame, a mullion every ~1.2 m
day = np.ones((32, 32, 3), np.float32) * np.array([0.8, 0.86, 0.92], np.float32)
day *= (1 + (fbm(32, 32, (16, 4), wrap=True) - 0.5) * 0.08)[..., None]
daylight = mat_img('WS_Daylight', save('ws_daylight', day), 0.3, emit=((0.8, 0.87, 0.95), 1.4))
alu = plain_mat('WS_Alu', (0.62, 0.64, 0.66), dirt=0.08)
def glazing(name, c, w, h, axis):
    # a window in a wall: c its middle (on the wall's inner face), w x h, the wall along x (axis 'x') or y
    c = Vector(c); sx = lambda a, b: (a, b) if axis == 'x' else (b, a)
    box(f'{name}_Pane', B, (*sx(w, 0.02), h), (c.x, c.y, c.z), daylight)
    n = max(1, round(w / 1.2))
    for k in range(n + 1):
        u = -w / 2 + w * k / n; off = Vector((u, 0, 0)) if axis == 'x' else Vector((0, u, 0))
        box(f'{name}_Mullion_{k}', B, (*sx(0.06, 0.08), h), c + off, alu)
    for dz in (-h / 2, h / 2): box(f'{name}_Rail_{dz:+.1f}', B, (*sx(w + 0.06, 0.1), 0.06), c + Vector((0, 0, dz)), alu)
for k, (x0, x1, z0, z1) in enumerate(((7.0, 8.4, 1.0, 2.2), (10.6, 11.6, 1.0, 2.2), (7.0, 11.6, DECK_Z + 0.9, DECK_Z + 2.1))):
    glazing(f'Win_Front_{k}', ((x0 + x1) / 2, Y0 + 0.06, (z0 + z1) / 2), x1 - x0, z1 - z0, 'x')
for k, y in enumerate((-6.0, -1.0, 4.0)):
    glazing(f'Win_Left_{k}', (X0 + 0.06, y, 4.9), 3.0, 1.4, 'y')
glazing('Win_Right_0', (X1 - 0.06, 8.0, DECK_Z + 1.5), 2.0, 1.2, 'y')

# ======================================================================================================================
# your desk, as in the lock-up and the unit (kit-start.blend): in your office, against its back wall
KEEP_DESK = ('Desk', 'CrtMonitor', 'Computer', 'Keyboard', 'Mouse', 'Speaker', 'Speaker.001', 'Lamp_M_Lamp_0', 'Lamp_M_Nightstand_0',
             'disk', 'disk.001', 'Object_5', 'office_chair_blue_alt', 'Calendar_005_Calendars_0.001', 'Point')
with bpy.data.libraries.load(KIT, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in KEEP_DESK]
def world(o): return o.matrix_basis.copy() if not o.parent else world(o.parent) @ o.matrix_parent_inverse @ o.matrix_basis
mine = {}
for o in dst.objects:
    if o is None: continue
    mw = world(o); o.parent = None; o.matrix_world = mw; mine[o.name] = o; dress.objects.link(o)
for o in list(bpy.data.objects):
    if not o.users_collection and o not in LIB.values(): bpy.data.objects.remove(o, do_unlink=True)
Mdesk = Matrix.Translation(Vector((9.0, Y1, 0))) @ Matrix.Rotation(-D90, 4, 'Z') @ Matrix.Translation(-Vector((-4.15, 3.85, 0)))
for n in KEEP_DESK:
    if n in mine: o = mine[n]; o.matrix_world = Mdesk @ o.matrix_world; link(o, lights if o.type == 'LIGHT' else dress)
cal = Mdesk @ Vector((-4.0, 3.42, 2.1))

# placeholders, made properly in the later steps: the setup pad's plates, the trophy cabinet, the mess table
pad = grimy_tile('WS_Pad', 'metal_plate_02.png', dirt=0.15)
for sx in (-1, 1):
    for sy in (-1, 1):
        bbox(f'SetupPad_Plate_{sx}{sy}', B, (0.6, 0.6, 0.012), (BAY1.x + sx * 0.8, BAY1.y + sy * 1.35, 0.006), pad, bev=0.003)
bbox('Trophy_Cabinet', dress, (0.5, 3.0, 2.0), (X1 - 0.3, -6.0, 1.0), plain_mat('WS_Cabinet', (0.1, 0.1, 0.11), dirt=0.08), bev=0.01)

# ======================================================================================================================
# (the office's ceiling upstairs: the liner's too high over a room, so a ceiling at 2.95 over the deck)
quad('Ceiling_Upstairs', B, [(MX, Y0, DECK_Z + 2.95), (X1, Y0, DECK_Z + 2.95), (X1, Y1, DECK_Z + 2.95), (MX, Y1, DECK_Z + 2.95)], ceil, (0, 0, -1), [(0, 0), (3, 0), (3, 9), (0, 9)])

# ======================================================================================================================
# the detail, a file each (tools/workshop/): one that fails is reported and left out, so the rest still builds
import traceback
WS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'workshop')
for part in ('structure', 'services', 'rooms', 'setup', 'trophies'):
    f = os.path.join(WS, part + '.py')
    if not os.path.exists(f): continue
    try: exec(compile(open(f).read(), f, 'exec'), globals())
    except Exception: print('FAILED', part); traceback.print_exc()

# ======================================================================================================================
# hooks
empty('BAY_1', hooks, BAY1, kind='SINGLE_ARROW', size=1.0, label='Car one')
empty('BAY_2', hooks, BAY2, kind='SINGLE_ARROW', size=1.0, label='Car two')
empty('SPAWN', hooks, ((BAY1.x + BAY2.x) / 2, -6.8, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.6)
empty('POSTER', hooks, (-11.0 + 0.0, Y0 + 0.02, 1.5), rotz=math.pi, kind='PLAIN_AXES', size=0.3)
empty('INTERACT_door', hooks, ((DOOR_A[0] + DOOR_A[1]) / 2, Y0 + 0.7, 1.6), kind='SPHERE', size=0.25, label='Head out')
empty('INTERACT_calendar', hooks, tuple(cal), kind='SPHERE', size=0.25, label='The calendar')
empty('TIRES', hooks, (X0 + 0.6, -8.3, 0), rotz=0.0, kind='ARROWS', size=0.4)
for k, loc, rz in (('tools', (X0 + 0.05, -1.0, 0), D90), ('dyno', (-8.75, Y1 - 0.05, 0), 0.0), ('fab', (3.5, Y1 - 0.05, 0), 0.0),
                   ('data', (X1 - 0.35, 2.4, DECK_Z), -D90), ('sim', (X1 - 0.05, -6.8, DECK_Z), -D90), ('tools2', (BAY3.x - 0.1, BAY3.y, 0), 0.0)):
    empty('SLOT_' + k, hooks, loc, rotz=rz, kind='ARROWS', size=0.5)
for name, loc, rz, clip, role in (
        ('STAND_mechanic', (BAY1.x - 1.15, -4.3, 0), D90, 'kneel', 'mechanic'), ('STAND_mechanic.001', (BAY2.x + 1.1, -1.2, 0), -D90, 'lean', 'mechanic'),
        ('STAND_any.001', (9.0, 1.2, 0), D90, 'talk', 'any'), ('STAND_any.002', (10.2, 1.0, 0), -D90, 'talk', 'any'),
        ('STAND_any.003', (-2.5, BACK_Y - 0.5, 0), 0.0, 'lean', 'any'), ('STAND_any.004', (MX - 0.5, -6.0, 0), -D90, 'talk', 'any'),
        ('STAND_visitor', (9.5, -7.6, 0), math.pi, 'talk', 'visitor')):
    empty(name, hooks, loc, rotz=rz, kind='SINGLE_ARROW', size=0.5, clip=clip, role=role)
def navq(name, pts):
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p in pts], [], [(0, 1, 2, 3)])
    if me.polygons[0].normal.z < 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); hooks.objects.link(o); o.display_type = 'WIRE'; o.hide_render = True; return o
navq('NAV_floor', [(X0 + 0.15, Y0 + 0.15, 0), (X1 - 0.15, Y0 + 0.15, 0), (X1 - 0.15, Y1 - 0.15, 0), (X0 + 0.15, Y1 - 0.15, 0)])
navq('NAV_stairs', [(ST_X0, ST_Y0, 0), (ST_X1, ST_Y0, 0), (ST_X1, ST_Y1, DECK_Z), (ST_X0, ST_Y1, DECK_Z)])
navq('NAV_landing', [(ST_X0, ST_Y1, DECK_Z), (MX, ST_Y1, DECK_Z), (MX, BACK_Y, DECK_Z), (ST_X0, BACK_Y, DECK_Z)])
navq('NAV_deck', [(MX, Y0 + 0.15, DECK_Z), (X1 - 0.15, Y0 + 0.15, DECK_Z), (X1 - 0.15, Y1 - 0.15, DECK_Z), (MX, Y1 - 0.15, DECK_Z)])
ghost = bpy.data.materials.new('COL')
for k in range(6):
    y0 = ST_Y0 + 0.5 + k * (run - 0.5) / 6; y1 = y0 + (run - 0.5) / 6; h = DECK_Z * (y1 - ST_Y0) / run + 1.0
    box(f'COL_Stairs_Side_{k}', hooks, (0.1, y1 - y0, h), (ST_X0 - 0.06, (y0 + y1) / 2, h / 2), ghost)
box('COL_Landing_Side', hooks, (0.1, BACK_Y - ST_Y1, DECK_Z + 1.0), (ST_X0 - 0.06, (ST_Y1 + BACK_Y) / 2, (DECK_Z + 1.0) / 2), ghost)
box('COL_Stairs_Right', hooks, (0.1, run, 1.6), (ST_X1 + 0.06, (ST_Y0 + ST_Y1) / 2, 0.8), ghost)   # (the mezzanine's edge beside the stairs, on the floor)
for o in hooks.objects:
    if o.name.startswith('COL_'): o.display_type = 'WIRE'; o.hide_render = True

guides = collection('GUIDES (left out by the game)')
gm = mat_img('GUIDE', None, 0.9); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.1, 0.1, 1)
for i, b in ((1, BAY1), (2, BAY2), (3, BAY3)):
    g = box(f'GUIDE_Car{i}', guides, (2.0, 5.6, 1.0), (b.x, b.y, 0.5), gm); g.display_type = 'WIRE'
for o in guides.objects: o.hide_render = True

# ======================================================================================================================
# baked shadows (garagelib bake_ao: ambient occlusion into the vertex colors, the game multiplies it in): dark under and
# behind things, in corners, where parts meet; the room's own floor and walls are what they're dark against. Not the
# see-through (glass, cutouts: their alpha's in play). -- --noao: skip it (a quick look)
if '--noao' not in args:
    import time; t0 = time.time()
    def see_through(m):
        p = m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None
        return bool(p) and (p.inputs['Alpha'].is_linked or p.inputs['Alpha'].default_value < 0.999)
    skip = {m for m in bpy.data.materials if see_through(m)}
    n = bake_ao(shell, skip=skip, distance=0.6, samples=32, wall=False)
    print(f'AO baked on {n} objects in {time.time() - t0:.0f} s')

EXPORT = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'garage-unit.py')).read().split("EXPORT = r'''")[1].split("'''")[0]
t = bpy.data.texts.new('export_kit'); t.write(EXPORT)
# WS_TAG=<tag>: a build of its own (workshop-start-<tag>.blend, shell_workshop_<tag>.glb), so several can be built at
# once without writing over each other; look at it in the game with SHELL_WS=shell_workshop_<tag> node .devtest/workshopshot.mjs
TAG = os.environ.get('WS_TAG')
path = os.path.join(OUT, f'workshop-start-{TAG}.blend' if TAG else 'workshop-start.blend')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=path)
print('wrote', path)
if '--export' in args:
    import tempfile, shutil
    ns = {'__name__': 'kit'}; exec(EXPORT, ns)
    if TAG:
        tmp = tempfile.mkdtemp(); ns['export_kit'](tmp, only=['shell_workshop'])
        shutil.move(os.path.join(tmp, 'shell_workshop.glb'), os.path.join(OUT, f'shell_workshop_{TAG}.glb')); print('exported', f'shell_workshop_{TAG}.glb')
    else: ns['export_kit'](OUT, only=['shell_workshop'])
