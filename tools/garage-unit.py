# Builds models/garage/unit-start.blend: the Industrial unit (World Career premises level 1), see docs/GARAGE-KIT.md. Run:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-unit.py               (the .blend)
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-unit.py -- --export   (+ shell_unit.glb)
# Re-running overwrites unit-start.blend: Save As your own copy to edit it, then export from inside Blender (Text
# Editor > export_kit > Run Script). The stations themselves (station_tools, station_sim...) stay in kit-start.blend.
#
# The room: Garage by LunaQuantica (models/garage/src/luna: brick, roll-up door, metal windows, rails, its signs) made
# into a 16 x 14 m unit with a 3.5 m mezzanine along the back you can walk up to. The pack's own pieces keep their
# textures. Everything built here (floor, walls, roof, steelwork, the deck and stairs) is textured from the PSX
# Industrial textures (models/garage/src/psx_industrial) or the pack's brick, with grime baked in: oil under the
# bays, tire tracks from the door, dirt along the walls, rust and drips. The baked textures go in src/unit_gen.
#
# Layout (metres, floor Z = 0, the door down -Y):
#   front wall y -7: the roll-up door over both bays (x 1.3 to 6.3), a window to its left
#   left wing x -8 to -4.3: the dyno's corner by the door, the workbench (SLOT_tools), fabrication behind it
#   bays: a third bay for projects (x -1.55; the lift goes here), car one x 2.3, car two x 5.3
#   right wall: tire stacks by the door, tool chests, the stairs up to the mezzanine
#   under the mezzanine: the parts store, the sim rig, the break area, your desk (from the lock-up)
#   on the mezzanine: storage, till the data room (SLOT_data) goes up there
# Hooks as in docs/GARAGE-KIT.md, plus: NAV_ meshes at every level you walk on (floor, stairs, deck); WALK_... is
# something you walk on (never in your way); WITHOUT_<facility>... shows only till you have that facility (the junk
# where it'll go).
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'models', 'garage', 'src')
OUT = os.path.join(ROOT, 'models', 'garage')
GEN = os.path.join(SRC, 'unit_gen')
UNIT = os.path.join(SRC, 'unit')
TEX = os.path.join(SRC, 'psx_industrial')
LUNA = os.path.join(SRC, 'luna', 'garage.blend')
LUNA_TEX = os.path.join(SRC, 'luna', 'garage_texture.png')
KIT = os.path.join(OUT, 'kit-start.blend')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
os.makedirs(GEN, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
D90 = math.pi / 2

# the room
X0, X1, Y0, Y1 = -8.0, 8.0, -7.0, 7.0
EAVE, RIDGE = 5.0, 6.6
DECK_Y, DECK_Z = 3.5, 2.7                    # (the mezzanine: from its edge at y 3.5 to the back wall, its top 2.7 up)
DOOR_X, DOOR_W, DOOR_H = 3.8, 5.04, 3.09     # (Luna's roll-up door, over both bays)
BAY1, BAY2, BAY3 = Vector((2.3, -2.7, 0)), Vector((5.3, -2.7, 0)), Vector((-1.55, -2.7, 0))
ST_X0, ST_X1, ST_Y0 = 6.7, 7.95, -0.14       # (the stairs up the right wall: x, where they start; they land at the deck's edge)


import garagelib as G
from garagelib import *
G.configure(GEN); RNG = G.RNG
lib_coll = G.lib_collection()

# ======================================================================================================================
kit = collection('KIT (each collection is one .glb)')
shell = collection('shell_unit', kit)
build = collection('shell_unit build', shell)       # (walls, floor, roof, steel, the deck)
dress = collection('shell_unit dressing', shell)    # (the props)
lights = collection('shell_unit lights', shell)
hooks = collection('shell_unit hooks', shell)

# ---- textures for the room ----
PPM = 40   # (floor: pixels a metre; the concrete's 64 px tile is 1.6 m)
fw, fh = int((X1 - X0) * PPM), int((Y1 - Y0) * PPM)
col = tile(load_px(os.path.join(TEX, 'industrial_concrete_floor.png')), fh, fw, 64, 64)
stained = tile(load_px(os.path.join(TEX, 'stained_concrete.png')), fh, fw, 64, 64)
patch = (fbm(fh, fw, (160, 80)) > 0.5)[..., None]
col = np.where(patch, col * 0.65 + stained * 0.35, col)   # (patches of the stained concrete)
P = lambda x, y: ((x - X0) * PPM, (y - Y0) * PPM)
yy, xx = np.mgrid[0:fh, 0:fw].astype(np.float32); wx, wy = xx / PPM + X0, yy / PPM + Y0
# general grime, heavier near the walls and in the corners
edge = np.minimum.reduce([wx - X0, X1 - wx, wy - Y0, Y1 - wy])
dirt = (fbm(fh, fw, (120, 40, 12)) - 0.4) * 0.6 + np.clip(1 - edge / 0.9, 0, 1) ** 1.5 * 0.45
# tire tracks: in at the door to each bay, worn darker where the wheels go
tracks = np.zeros((fh, fw), np.float32)
for bx, k in ((BAY1.x, 0.32), (BAY2.x, 0.32), (BAY3.x, 0.18)):
    for side in (-0.78, 0.78):
        d = np.abs(wx - (bx + side + (vnoise(fh, fw, 60) - 0.5) * 0.25))
        tracks = np.maximum(tracks, k * np.clip(1 - d / 0.17, 0, 1) * np.clip((0.4 - wy) / 1.2, 0, 1) * (0.6 + 0.4 * vnoise(fh, fw, 6)))
# oil: under each car's middle and nose, a drip under the project bay, a big old spill by the left wing
spots = []
for b in (BAY1, BAY2, BAY3):
    for dx, dy, r, k in ((0.1, -1.6, 0.55, 0.75), (-0.2, -0.2, 0.4, 0.55), (0.3, 1.5, 0.3, 0.45)):
        spots.append((*P(b.x + dx + RNG.uniform(-0.2, 0.2), b.y + dy + RNG.uniform(-0.2, 0.2)), r * RNG.uniform(0.8, 1.3), k))
spots += [(*P(-6.0, -2.0), 0.9, 0.5), (*P(-5.2, 1.5), 0.5, 0.45), (*P(7.2, -5.6), 0.45, 0.4), (*P(0.7, 2.2), 0.35, 0.35)]
oil = blobs(fh, fw, spots, PPM)
# faded yellow paint: the walkway either side of the spine and along the cross aisle, worn through where it's driven over
paint = np.zeros((fh, fw), np.float32)
for x in (0.15, 1.25):
    paint = np.maximum(paint, (np.abs(wx - x) < 0.05) * (wy > -6.9) * (wy < 0.3))
paint = np.maximum(paint, (np.abs(wy - 0.35) < 0.05) * (wx > -4.2) * (wx < 6.4))
paint *= np.clip(vnoise(fh, fw, 5) * 1.6 - 0.35, 0, 1) * (1 - tracks * 2.2).clip(0, 1)
col = col * (1 - paint[..., None] * 0.55) + np.array([0.7, 0.55, 0.12], np.float32) * paint[..., None] * 0.55
col = grime(col, dirt); col = grime(col, tracks, OIL); col = grime(col, oil * 0.85, OIL)
# a sheen of rainbow oil in the biggest stains, like the pack's oil slick
slick = tile(load_px(os.path.join(TEX, 'oil_slick_02.png')), fh, fw, 64, 64)
col = col * (1 - (oil > 0.55)[..., None] * 0.12) + slick * (oil > 0.55)[..., None] * 0.12 * 0.4
floor_mat = mat_img('Unit_Floor', save('unit_floor', col), 0.85)

# the walls: Luna's brick (its texture, the brick corner), laid at 3 x 3.2 m, a dirty skirt, drips and soot
luna_px = load_px(LUNA_TEX)
brick = luna_px[146:250, 1:99]                    # (rows from the bottom: the brick square)
WPPM = 32
def wall_tex(name, L, Hmax, seed_spots=()):
    w, h = int(L * WPPM), int(Hmax * WPPM)
    c = tile(brick, h, w, int(3.2 * WPPM), int(3.0 * WPPM))
    zz = np.mgrid[0:h, 0:w][0].astype(np.float32) / WPPM
    g = (fbm(h, w, (96, 32, 8)) - 0.45) * 0.55
    skirt = np.clip(1 - zz / 0.7, 0, 1) ** 1.3 * (0.55 + 0.3 * vnoise(h, w, 10))           # (splashed dirt along the bottom)
    soot = np.clip((zz - 3.0) / 3.0, 0, 1) * 0.35 * (0.6 + 0.4 * vnoise(h, w, 40))         # (old soot up under the roof)
    drips = np.clip(vnoise(1, w, 3)[0] * 1.8 - 1.1, 0, 1)[None, :] * np.clip((zz - 1.2) / 3.5, 0, 1) * (0.5 + 0.5 * vnoise(h, w, 12))  # (rain down from the eaves)
    damp = np.clip((fbm(h, w, (64, 16)) - 0.62) * 3, 0, 1) * 0.5
    c = grime(c, g + soot); c = grime(c, skirt); c = grime(c, drips * 0.7, np.array([0.1, 0.09, 0.07], np.float32))
    c = grime(c, damp, np.array([0.2, 0.22, 0.17], np.float32))
    return mat_img(name, save(name, c), 0.95)


def gable(u, L):   # the gable walls' top: eaves at the ends, the ridge in the middle
    return EAVE + (RIDGE - EAVE) * (1 - abs(u - L / 2) / (L / 2))


WIN = (3.2, 2.51, 4.18)   # (Luna's window: wide, bottom, top)
mat_front, mat_back = wall_tex('unit_wall_front', 16, RIDGE), wall_tex('unit_wall_back', 16, RIDGE)
mat_left, mat_right = wall_tex('unit_wall_left', 14, EAVE), wall_tex('unit_wall_right', 14, EAVE)
win_front = [(-4.8, -7.0)]; win_back = [(-4.0, 7.0), (3.2, 7.0)]; win_left = [(-8.0, -5.0), (-8.0, 1.6)]; win_right = [(8.0, 1.6)]
BACK_WIN = (3.3, 4.97)
wall('Wall_Front', build, (X0, Y0, 0), (X1, Y0, 0), lambda u: gable(u, 16), [(DOOR_X - DOOR_W / 2 + 8, DOOR_X + DOOR_W / 2 + 8, 0, DOOR_H)] + [(x + 8 - 1.6, x + 8 + 1.6, WIN[1], WIN[2]) for x, _ in win_front], mat_front, (0, 1, 0), 16, RIDGE)
wall('Wall_Back', build, (X0, Y1, 0), (X1, Y1, 0), lambda u: gable(u, 16), [(x + 8 - 1.6, x + 8 + 1.6, *BACK_WIN) for x, _ in win_back], mat_back, (0, -1, 0), 16, RIDGE)
wall('Wall_Left', build, (X0, Y0, 0), (X0, Y1, 0), lambda u: EAVE, [(y + 7 - 1.6, y + 7 + 1.6, WIN[1], WIN[2]) for _, y in win_left], mat_left, (1, 0, 0), 14, EAVE)
wall('Wall_Right', build, (X1, Y0, 0), (X1, Y1, 0), lambda u: EAVE, [(y + 7 - 1.6, y + 7 + 1.6, WIN[1], WIN[2]) for _, y in win_right], mat_right, (-1, 0, 0), 14, EAVE)

quad('Floor', build, [(X0, Y0, 0), (X1, Y0, 0), (X1, Y1, 0), (X0, Y1, 0)], floor_mat, (0, 0, 1), [(0, 0), (1, 0), (1, 1), (0, 1)])

# the roof: Luna's corrugated sheet (the top-left of its texture), rust patches and water stains, a tile every 2.5 m
corr = luna_px[253:499, 2:244]
SL = math.hypot(X1, RIDGE - EAVE)   # (a slope's length)
rw, rh = int(14 * 60), int(SL * 60)
rc = tile(corr, rh, rw, 150, 150)
rc = grime(rc, (fbm(rh, rw, (200, 60, 15)) - 0.4) * 0.7)
rc = grime(rc, np.clip((fbm(rh, rw, (90, 30)) - 0.6) * 3, 0, 1) * 0.6, RUST)
roof_mat = mat_img('Unit_Roof', save('unit_roof', rc), 0.9)
quad('Roof_L', build, [(X0, Y0, EAVE), (0, Y0, RIDGE), (0, Y1, RIDGE), (X0, Y1, EAVE)], roof_mat, (0.2, 0, -1), [(0, 0), (1, 0), (1, 1), (0, 1)])
quad('Roof_R', build, [(X1, Y0, EAVE), (0, Y0, RIDGE), (0, Y1, RIDGE), (X1, Y1, EAVE)], roof_mat, (-0.2, 0, -1), [(0, 0), (1, 0), (1, 1), (0, 1)])

# ---- steel: trusses under the roof, the mezzanine's beam and columns, the stairs ----
steel = grimy_tile('Unit_Steel', 'dark_industrial_metal.png', dirt=0.4, rust=0.7)
blue = grimy_tile('Unit_PaintedSteel', 'painted_metal.png', dirt=0.45, rust=0.35, wear_light=0.2)
hazard = grimy_tile('Unit_Hazard', 'hazard_stripes_01.png', dirt=0.55, rust=0.0, wear_light=0.3)
plate = grimy_tile('Unit_Tread', 'metal_plate_03.png', dirt=0.5, rust=0.2)
for i, y in enumerate((-5.25, -1.75, 1.75, 5.25)):
    beam(f'Truss_{i}_Chord', build, (X0, y, EAVE - 0.06), (X1, y, EAVE - 0.06), 0.14, 0.18, steel)
    beam(f'Truss_{i}_RafterL', build, (X0, y, EAVE + 0.05), (0, y, RIDGE - 0.12), 0.14, 0.2, steel)
    beam(f'Truss_{i}_RafterR', build, (X1, y, EAVE + 0.05), (0, y, RIDGE - 0.12), 0.14, 0.2, steel)
    for x in (-5.3, -2.65, 0.0, 2.65, 5.3):
        top = EAVE + (RIDGE - EAVE) * (1 - abs(x) / 8) - 0.15
        box(f'Truss_{i}_Post_{x:+.1f}', build, (0.08, 0.08, top - EAVE + 0.05), (x, y, (top + EAVE) / 2), steel)
    for s in (-1, 1):   # (a diagonal each side)
        beam(f'Truss_{i}_Diag{s}', build, (s * 2.65, y, EAVE), (s * 5.3, y, EAVE + (RIDGE - EAVE) * (1 - 5.3 / 8) - 0.15), 0.07, 0.07, steel)
for x in (-4.0, 4.0):   # (purlins: along the building, carrying the fittings' chains)
    z = EAVE + (RIDGE - EAVE) * (1 - abs(x) / 8) - 0.28
    box(f'Purlin_{x:+.0f}', build, (0.1, 14.0, 0.14), (x, 0, z), steel)

# the mezzanine: a diamond plate deck on a beam and four columns, a kick plate along its edge in hazard stripes
deck_w, deck_d = X1 - X0, Y1 - DECK_Y
DP = 64
dc = tile(load_px(os.path.join(TEX, 'metal_plate_02.png')), int(deck_d * DP), int(deck_w * DP), DP, DP)
dh, dw = dc.shape[:2]; dyy, dxx = np.mgrid[0:dh, 0:dw].astype(np.float32)
walkway = np.exp(-((dyy / DP - 0.9) / 0.5) ** 2) * 0.35   # (scuffed along where people walk, by the rail)
dc = grime(dc, (fbm(dh, dw, (128, 32, 8)) - 0.4) * 0.6 + walkway + np.clip(1 - (deck_d - dyy / DP) / 0.5, 0, 1) * 0.3)
dc = grime(dc, np.clip((fbm(dh, dw, (64, 16)) - 0.65) * 3, 0, 1) * 0.5, RUST)
deck_mat = mat_img('Unit_Deck', save('unit_deck', dc), 0.8)
quad('WALK_Deck', build, [(X0, DECK_Y, DECK_Z), (X1, DECK_Y, DECK_Z), (X1, Y1, DECK_Z), (X0, Y1, DECK_Z)], deck_mat, (0, 0, 1), [(0, 0), (1, 0), (1, 1), (0, 1)])
quad('WALK_DeckUnder', build, [(X0, DECK_Y, DECK_Z - 0.12), (X1, DECK_Y, DECK_Z - 0.12), (X1, Y1, DECK_Z - 0.12), (X0, Y1, DECK_Z - 0.12)], steel, (0, 0, -1), [(0, 0), (8, 0), (8, 1.75), (0, 1.75)])
box('WALK_DeckEdge', build, (deck_w, 0.06, 0.16), (0, DECK_Y - 0.03, DECK_Z - 0.06), hazard)
box('WALK_DeckBeam', build, (deck_w, 0.18, 0.3), (0, DECK_Y + 0.1, DECK_Z - 0.27), steel)
for x in (-5.5, -1.8, 2.0, 5.6):
    box(f'Column_{x:+.1f}', build, (0.2, 0.2, DECK_Z - 0.42), (x, DECK_Y + 0.1, (DECK_Z - 0.42) / 2), blue)
    box(f'Column_{x:+.1f}_Tape', build, (0.22, 0.22, 0.9), (x, DECK_Y + 0.1, 0.45), hazard)
    box(f'Column_{x:+.1f}_Foot', build, (0.36, 0.36, 0.03), (x, DECK_Y + 0.1, 0.015), steel)
# joists under the deck, front to back
for x in np.arange(-7.0, 8.0, 2.0):
    box(f'WALK_Joist_{x:+.0f}', build, (0.1, deck_d - 0.3, 0.2), (x, (DECK_Y + Y1) / 2 + 0.1, DECK_Z - 0.22), steel)

# the stairs: up the right wall to the deck's edge, open treads on two stringers, a handrail on the open side
rise = DECK_Z; nst = 14; run = DECK_Y - ST_Y0; sw = ST_X1 - ST_X0
for i in range(nst):
    y = ST_Y0 + run * (i + 0.5) / nst; z = rise * (i + 1) / nst
    box(f'WALK_Stair_Tread_{i:02d}', build, (sw, run / nst + 0.03, 0.04), ((ST_X0 + ST_X1) / 2, y, z - 0.02), plate)
    box(f'WALK_Stair_Nose_{i:02d}', build, (sw, 0.04, 0.045), ((ST_X0 + ST_X1) / 2, y - run / nst / 2 + 0.02, z - 0.02), hazard)
for x in (ST_X0 + 0.04, ST_X1 - 0.04):
    beam(f'WALK_Stair_Stringer_{x:.1f}', build, (x, ST_Y0, 0.12), (x, DECK_Y, DECK_Z - 0.05), 0.06, 0.26, blue)
for k in range(4):   # (the handrail's posts and rail)
    t = (k + 0.5) / 4; y = ST_Y0 + run * t; z = rise * t
    box(f'WALK_Stair_RailPost_{k}', build, (0.05, 0.05, 1.0), (ST_X0 - 0.03, y, z + 0.5), blue)
beam('WALK_Stair_Rail', build, (ST_X0 - 0.03, ST_Y0 + run * 0.06, rise * 0.06 + 1.0), (ST_X0 - 0.03, DECK_Y, DECK_Z + 1.0), 0.05, 0.05, blue)
# (the bit of deck edge Luna's rails don't cover, between them and the stairs)
for k, x in enumerate((6.05, 6.65)):
    box(f'DeckRail_Post_{k}', build, (0.05, 0.05, 1.0), (x, DECK_Y - 0.04, DECK_Z + 0.5), blue)
box('DeckRail_Top', build, (0.65, 0.05, 0.05), (6.35, DECK_Y - 0.04, DECK_Z + 1.0), blue)
box('DeckRail_Mid', build, (0.65, 0.04, 0.04), (6.35, DECK_Y - 0.04, DECK_Z + 0.5), blue)

# ---- Luna's pieces, from its own file (its textures): door, windows, rails, signs, crates, barrels, tires ----
with bpy.data.libraries.load(LUNA, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in ('door', 'window', 'rails', 'sign1', 'sign2', 'sign3', 'sign4', 'plate', 'plate2', 'tyre', 'tyre2',
                                                   'crate1', 'crate2', 'crate3', 'tyre3', 'tyre4', 'tyre5', 'barrel', 'barrel2', 'barrel3')]
for im in bpy.data.images:
    if 'garage_texture' in (im.filepath or ''): im.filepath = LUNA_TEX; im.reload()
luna = {}
for o in dst.objects:
    if o is None: continue
    build.objects.link(o); o.data = o.data.copy(); luna[o.name] = o
    for m in o.data.materials:
        for n in (m.node_tree.nodes if m and m.node_tree else []):
            if n.type == 'TEX_IMAGE': n.interpolation = 'Closest'
bpy.context.view_layer.update()


def place(o, pivot, to, rotz=0.0, coll=None):
    # move a Luna piece: its pivot point to `to`, turned rotz about Z; baked into the mesh (it's a copy)
    M = Matrix.Translation(Vector(to)) @ Matrix.Rotation(rotz, 4, 'Z') @ Matrix.Translation(-Vector(pivot)) @ o.matrix_world
    o.data.transform(M); o.matrix_world = Matrix.Identity(4)
    me = o.data; c = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)   # (origin in its middle, for editing)
    me.transform(Matrix.Translation(-c)); o.location = c
    if coll: link(o, coll)
    return o


# Luna's door wall is its +Y wall (y 1.5, floor at z -0.5): ours is -Y, so its pieces turn round
place(luna['door'], (6.0, 1.5, -0.5), (DOOR_X, Y0, 0), math.pi).name = 'Door'
WIN_SRC = (-4.0, 1.5, 2.01)
def window(name, at, rotz, zbase=WIN[1]):
    o = luna['window'].copy(); o.data = luna['window'].data.copy(); build.objects.link(o); o.name = name
    place(o, WIN_SRC, (at[0], at[1], zbase), rotz)
for i, (x, y) in enumerate(win_front): window(f'Window_Front_{i}', (x, y), math.pi)
for i, (x, y) in enumerate(win_back): window(f'Window_Back_{i}', (x, y), 0.0, BACK_WIN[0])
for i, (x, y) in enumerate(win_left): window(f'Window_Left_{i}', (x, y), D90)
for i, (x, y) in enumerate(win_right): window(f'Window_Right_{i}', (x, y), -D90)
bpy.data.objects.remove(luna['window'], do_unlink=True)
# the rails along the deck's edge (its deck faces the other way), cut short for the stairs
r = place(luna['rails'], (2.0, -4.54, 1.58), (0.0, DECK_Y - 0.04, DECK_Z), math.pi); r.name = 'DeckRails'
import bmesh
bm = bmesh.new(); bm.from_mesh(r.data); mw = r.matrix_world
bmesh.ops.delete(bm, geom=[f for f in bm.faces if (mw @ f.calc_center_median()).x > 6.0], context='FACES'); bm.to_mesh(r.data); bm.free()
# the signs on its right wall (x 10) go on ours (x 8), along a little; its door-wall posters go either side of our door
for n in ('sign1', 'sign2', 'plate', 'plate2', 'tyre', 'tyre2'):
    place(luna[n], (10.0, 0.0, -0.5), (X1, -0.6, 0.2), 0.0, dress)
for n in ('sign3', 'sign4'):
    place(luna[n], (0.7, 1.5, -0.5), (-1.2, Y0, 0.0), math.pi, dress)
# its crates and the stack of tires off its mezzanine: on ours, at the left end (storage, till the data room)
upstairs_junk = collection('WITHOUT_data (the mezzanine as storage)', dress)
for n in ('crate1', 'crate2', 'crate3', 'tyre3', 'tyre4', 'tyre5'):
    place(luna[n], (2.0, -6.5, 1.58), (-4.8, Y1, DECK_Z), math.pi, upstairs_junk).name = 'WITHOUT_data_' + n
for n in ('barrel', 'barrel2'):
    place(luna[n], (1.9, 0.8, -0.5), (-7.2, -6.2, 0), 0.4, dress)
place(luna['barrel3'], (8.87, -5.51, -0.5), (-6.0, -6.45, 0.08), 1.2, dress)

# ---- your desk and the rest you brought from the lock-up (models/garage/kit-start.blend, as it is there) ----
KEEP_DESK = ('Desk', 'CrtMonitor', 'Computer', 'Keyboard', 'Mouse', 'Speaker', 'Speaker.001', 'Lamp_M_Lamp_0', 'Lamp_M_Nightstand_0',
             'disk', 'disk.001', 'Object_5', 'office_chair_blue_alt', 'Calendar_005_Calendars_0.001', 'Point')
KEEP_VEND = ('Cube_Material_0',)
with bpy.data.libraries.load(KIT, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in KEEP_DESK or n in KEEP_VEND]   # (their parents come along, unlinked)
def world(o):   # (where it is in the lock-up: through its parents, which aren't in this scene)
    return o.matrix_basis.copy() if not o.parent else world(o.parent) @ o.matrix_parent_inverse @ o.matrix_basis
mine = {}
for o in dst.objects:
    if o is None: continue
    mw = world(o); o.parent = None; o.matrix_world = mw; mine[o.name] = (o, mw); dress.objects.link(o)
for o in list(bpy.data.objects):   # (the parents: done with)
    if not o.users_collection and o not in LIB.values(): bpy.data.objects.remove(o, do_unlink=True)
# the desk was against the lock-up's left wall (x -4.15), facing +X: here it's against the back wall, under the
# mezzanine by the stairs, facing the room (-Y)
DESK_TO = Vector((5.3, Y1, 0))
Mdesk = Matrix.Translation(DESK_TO) @ Matrix.Rotation(-D90, 4, 'Z') @ Matrix.Translation(-Vector((-4.15, 3.85, 0)))
for n in KEEP_DESK:
    if n in mine: o = mine[n][0]; o.matrix_world = Mdesk @ o.matrix_world; link(o, lights if o.type == 'LIGHT' else dress)
cal = Mdesk @ Vector((-4.0, 3.42, 2.1))
# the vending machine: against the back wall in the break area, as it stood in the lock-up
if 'Cube_Material_0' in mine:
    o = mine['Cube_Material_0'][0]; o.matrix_world = Matrix.Translation(Vector((2.6, 6.45, 0)) - Vector((-0.09, 5.575, 0))) @ o.matrix_world; link(o, dress); o.name = 'Vending_Machine'

# ---- the props ----
PIT = os.path.join(ROOT, 'models', 'pitprops.glb')
IND = os.path.join(SRC, 'psx_industrial_pack.glb')
U = lambda f: os.path.join(UNIT, f)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=PIT)   # (already one root each, standing on its origin, front to -Y)
for o in [o for o in bpy.data.objects if o not in before]:
    if o.type == 'MESH': o.rotation_mode = 'XYZ'; link(o, lib_coll); o.hide_set(True); LIB[o.name] = o; o.name = 'LIB_' + o.name
    else: bpy.data.objects.remove(o, do_unlink=True)
for k, pre in (('crate_wood', 'CrateWood_M'), ('crate_wood2', 'CrateWood2_M'), ('crate_metal', 'CrateMetal_M'), ('crate_metal2', 'CrateMetal2_M'),
               ('crate', 'Crate_M'), ('pallet', 'Pallet_M'), ('tires', 'Tires_M'), ('tire', 'Tire_M'), ('spool', 'Spool_M'),
               ('pipe_pile', 'MetalPipePile_M'), ('plank', 'PlankWide_M'), ('propane_small', 'PropaneTankSmall_M'),
               ('generator', 'GeneratorPortable_M_Industrial2'), ('locker2', 'Locker2_M'), ('trashcan', 'TrashCan_M'), ('pile_debris', 'PileDebris_M'),
               ('pile_trash', 'PileTrash_M'), ('barrel_oil', 'BarrelOil_M'), ('jerrycan', 'Jerrycan_M'), ('transformer', 'TransformerBox_M')):
    lib(k, IND, pre)
lib('drum_red', U('psx_barrels_pack.glb'), 'Red Steel Drum', height=0.9)
lib('drum_oil', U('psx_barrels_pack.glb'), 'Oil Drum', height=0.9)
lib('drum_blue', U('psx_barrels_pack.glb'), 'Blue Plastic Drum', height=0.95)
lib('drum_rusty', U('psx_barrels_pack.glb'), 'Rusty Leaking Barrel', height=0.9)
lib('shelves_a', U('psx_storage_shelves__cardboard_boxs.glb'), 'Storage_Shelves_01'); lib('shelves_b', U('psx_storage_shelves__cardboard_boxs.glb'), 'Storage_Shelves_03')
lib('cbox1', U('psx_storage_shelves__cardboard_boxs.glb'), 'Cardboard_box_01'); lib('cbox2', U('psx_storage_shelves__cardboard_boxs.glb'), 'Cardboard_box_02')
lib('cbox4', U('psx_storage_shelves__cardboard_boxs.glb'), 'Cardboard_box_04')
lib('couch', U('couch_red.glb'), scale=0.72); lib('armchair', U('armchair_pattern.glb'), scale=0.72)
lib('cooler', U('water_cooler.glb'), height=1.15); lib('mug', U('mug.glb'), height=0.1); lib('clock', U('wall_clock.glb'), scale=0.55, keep_z=True)
lib('tv', U('TV.glb'), height=0.55); lib('cabinet', U('file_cabinet_large.glb'), scale=0.8); lib('paper', U('paper_stack.glb'), scale=0.7)
lib('chair_conf', U('conference_chair_grey.glb'), scale=0.95); lib('tire_stack', U('tire_stack.glb'), height=1.05)
lib('dartboard', U('dart_board.glb'), 'Object_3', height=0.45, keep_z=True)
lib('fridge', os.path.join(SRC, 'psx_style_fridge.glb'), height=1.75); lib('microwave', os.path.join(SRC, 'microwave_psx.glb'), height=0.3)
lib('worklight', U('industrial_standing_light.glb'), 'Standing_light', height=1.9)

R0 = 0.0
# -- the right wall by the door: tire stacks (TIRES), tool chests, the rack above them, cans and a broom
put('tool_chest', dress, (7.78, -3.35, 0), -D90); put('tool_chest', dress, (7.78, -2.5, 0), -D90, name='tool_chest.001')
put('toolbox', dress, (7.76, -3.3, 0.88), -D90 + 0.15); put('screw_bin', dress, (7.7, -2.35, 0.88), -D90)
put('tool_rack', dress, (7.97, -2.9, 1.2), -D90)
for k, n in enumerate(('wrench', 'hammer', 'wrench', 'tape')): put(n, dress, (7.9, -3.6 + k * 0.45, 1.35 if n != 'tape' else 0.92), -D90)
put('shelf', dress, (7.9, -2.9, 2.25), -D90)
for k, n in enumerate(('paint', 'paint', 'spray', 'spray', 'paint')): put(n, dress, (7.88, -3.6 + k * 0.33, 2.46), -D90 + k)
put('jerry', dress, (7.82, -1.95, 0), -D90 + 0.2); put('jerry', dress, (7.8, -1.6, 0), -D90 - 0.3, name='jerry.001')   # (clear of the foot of the stairs)
put('broom', dress, (7.9, -1.25, 0.62), -D90, tilt=(0.0, -0.18))
put('worklight', dress, (6.75, -6.2, 0), math.pi * 0.85)
put('drum_oil', dress, (0.65, -6.5, 0), 0.3, name='drum_oil')   # (by the door, for rubbish)
# -- the project bay (the lift's, later): what's waiting for it. Tires, a pallet of parts, a trolley jack (boxes)
bay_junk = collection('WITHOUT_tools2 (the third bay, till the lift)', dress)
for k_, args_ in enumerate((('tires', (-2.6, -0.8, 0), 0.4), ('tire', (-2.55, -0.75, 0.8), 1.1), ('pallet', (-1.1, -1.2, 0), 0.1),
                            ('crate_wood', (-1.25, -1.15, 0.13), 0.25), ('cbox4', (-0.9, -1.35, 0.73), -0.4), ('mat', (-1.55, -3.3, 0.005), 0.05))):
    put(args_[0], bay_junk, args_[1], args_[2], name=f'WITHOUT_tools2_{args_[0]}')
put('crate_metal2', bay_junk, (-2.95, -5.9, 0), 0.05, s=0.75, name='WITHOUT_tools2_crate_metal2')
# -- the left wing: the bench's corner (SLOT_tools), junk where the dyno and fabrication will go
dyno_junk = collection('WITHOUT_dyno (the dyno corner, empty)', dress)
for args_ in (('pallet', (-7.4, -4.6, 0), 1.6), ('pallet', (-7.4, -3.4, 0), 1.5), ('crate_wood2', (-7.35, -4.55, 0.13), 1.6), ('crate_wood', (-7.4, -3.35, 0.13), 0.3),
              ('crate_wood', (-7.35, -3.4, 0.73), 0.8), ('generator', (-5.6, -4.2, 0), 1.9), ('propane_small', (-7.6, -2.75, 0), 0.0),
              ('pile_debris', (-6.2, -3.0, 0), 0.6), ('drum_rusty', (-5.3, -5.6, 0), 0.2), ('cbox2', (-7.55, -5.6, 0), 0.4)):
    o = put(args_[0], dyno_junk, args_[1], args_[2]); o.name = 'WITHOUT_dyno_' + args_[0]
fab_junk = collection('WITHOUT_fab (fabrication corner, empty)', dress)
for args_ in (('pipe_pile', (-7.3, 2.2, 0), 0.0), ('pallet', (-7.35, 0.75, 0), 0.05), ('plank', (-7.35, 0.75, 0.13), 0.1), ('plank', (-7.3, 0.8, 0.15), 0.35),
              ('spool', (-5.6, 2.9, 0), 0.0), ('crate_metal', (-7.45, 3.05, 0), 0.1), ('propane_small', (-6.2, 3.2, 0), 0.0)):
    o = put(args_[0], fab_junk, args_[1], args_[2], s=(0.5 if args_[0] == 'spool' else 1.0)); o.name = 'WITHOUT_fab_' + args_[0]
put('drum_red', dress, (-4.7, -1.6, 0), 0.6)
put('broom', dress, (-7.92, -0.9, 0.62), D90, tilt=(0.0, 0.2), name='broom.001')
put('fuse', dress, (-7.95, 0.3, 1.5), D90)
# -- under the mezzanine: the parts store at the left end
put('shelves_a', dress, (-6.9, 6.66, 0), 0.0); put('shelves_b', dress, (-7.66, 4.7, 0), -D90)
put('shelves_a', dress, (-4.7, 6.66, 0), 0.0, name='shelves_a.001')
for k, (x, y, z, rz, key) in enumerate(((-7.5, 6.6, 0.0, 0.1, 'cbox1'), (-6.6, 6.5, 0.73, -0.2, 'cbox2'), (-4.4, 6.6, 1.43, 0.2, 'cbox4'),
                                        (-7.6, 5.2, 1.43, 1.4, 'cbox1'), (-6.2, 6.6, 1.43, 0.1, 'cbox4'), (-5.2, 5.6, 0.0, 0.6, 'cbox2'), (-5.3, 5.55, 0.56, 0.4, 'cbox4'))):
    put(key, dress, (x, y, z), rz, s=0.85, name=f'{key}.{k:03d}')
put('tire_stack', dress, (-5.6, 4.4, 0), 0.0); put('tire_stack', dress, (-4.85, 4.3, 0), 0.7, name='tire_stack.001')
# -- the break area: fridge, a crate with the microwave, the couch, a crate for a table, the TV, the cooler
put('fridge', dress, (-1.25, 6.5, 0), 0.0)
put('crate_wood', dress, (-0.35, 6.6, 0), 0.05, name='crate_kettle'); put('microwave', dress, (-0.35, 6.62, 0.6), 0.0)
put('couch', dress, (1.0, 6.45, 0), 0.0)
put('crate_wood2', dress, (1.0, 5.25, 0), 0.08, name='crate_table')
for k, (x, y, rz) in enumerate(((0.7, 5.35, 0.3), (1.25, 5.1, 2.0), (0.95, 5.5, 1.0))): put('mug', dress, (x, y, 0.7), rz, name=f'mug.{k:03d}')
put('paper', dress, (1.3, 5.4, 0.705), 0.5)
put('crate_wood', dress, (1.0, 3.95, 0), 0.0, name='crate_tv'); put('tv', dress, (1.0, 3.95, 0.6), math.pi + 0.1)
put('cooler', dress, (3.6, 6.7, 0), 0.0)
put('dartboard', dress, (2.0, DECK_Y - 0.03, 1.73), 0.0, name='dartboard')   # (on the column, facing the aisle)
put('chair_conf', dress, (3.05, 5.2, 0), 2.4)
# -- by the desk and the stairs: a filing cabinet, a bin
put('cabinet', dress, (7.3, 6.55, 0), 0.0); put('trashcan', dress, (4.15, 6.55, 0), 0.0, name='trashcan.001')
# -- on the mezzanine: storage (till the data room), a worn armchair, boxes on shelves
for args_ in (('armchair', (2.4, 6.3, DECK_Z), 0.4), ('shelving_b', (0.2, 6.8, DECK_Z), 0.0), ('shelving_c', (-1.0, 6.8, DECK_Z), 0.0),
              ('cbox1', (-2.4, 6.4, DECK_Z), 0.3), ('cbox2', (-2.3, 6.45, DECK_Z + 0.67), 0.1), ('cbox4', (-1.7, 5.9, DECK_Z), 1.1),
              ('crate_metal', (4.2, 6.4, DECK_Z), 0.15), ('cbox2', (4.25, 6.4, DECK_Z + 1.0), 0.5), ('box_b', (0.2, 6.75, DECK_Z + 0.75), 0.0),
              ('box_a', (-1.0, 6.75, DECK_Z + 1.3), 0.1), ('chair_conf', (3.4, 5.4, DECK_Z), -0.6)):
    o = put(args_[0], upstairs_junk, args_[1], args_[2]); o.name = 'WITHOUT_data_' + args_[0]
put('clock', dress, (-6.7, Y1 - 0.02, 4.2), 0.0)   # (clear of the data room's whiteboard)

# ---- lights: strip lights on chains over the bays and the wing, bare bulbs under the mezzanine, the windows ----
tube = mat_img('Unit_Fluorescent', None, 0.5, emit=((0.92, 0.96, 1.0), 6.0))
def fitting(n, x, y, z, watts=650, hang_to=None):
    box(f'Fitting_{n}', lights, (0.22, 1.3, 0.07), (x, y, z + 0.04), steel)
    box(f'Tube_{n}', lights, (0.08, 1.2, 0.04), (x, y, z - 0.01), tube)
    top = hang_to if hang_to else EAVE + (RIDGE - EAVE) * (1 - abs(x) / 8) - 0.35
    for k, dy in ((0, -0.45), (1, 0.45)):
        box(f'Chain_{n}_{k}', lights, (0.012, 0.012, top - z), (x, y + dy, (top + z) / 2), steel)
    spot(f'Light_Tube_{n}', lights, (x, y, z - 0.05), watts, (0.9, 0.95, 1.0))
for n, (x, y) in enumerate(((BAY3.x, -3.4), (BAY1.x, -3.4), (BAY2.x, -3.4), (-6.0, -4.0), (-6.0, 1.0), (2.3, 1.75))):
    fitting(n, x, y, 4.05)
fitting(6, -3.6, 5.25, 4.6, 450); fitting(7, 3.6, 5.25, 4.6, 450)   # (over the mezzanine, up near the roof)
bulb('Light_Bulb_Break', lights, (1.0, 5.4, 2.35), 160, (1.0, 0.82, 0.6))
bulb('Light_Bulb_Parts', lights, (-6.0, 5.4, 2.35), 110, (1.0, 0.82, 0.6))
bulb('Light_Bulb_Desk', lights, (5.6, 5.3, 2.35), 90, (1.0, 0.82, 0.6))
bulb('Light_Tires', lights, (7.2, -5.6, 3.0), 160, (1.0, 0.85, 0.65))
for n, (x, y, dx, dy) in enumerate(((-4.8, Y0, 0, 0.7), (X0, -5.0, 0.7, 0))):   # (cool daylight in at two windows)
    bulb(f'Light_Window_{n}', lights, (x + dx, y + dy, 3.4), 120, (0.72, 0.82, 1.0))
bmat = mat_img('Unit_Bulb', None, 0.5, emit=((1.0, 0.82, 0.55), 30.0))
for n, l in (('Break', (1.0, 5.4)), ('Parts', (-6.0, 5.4)), ('Desk', (5.6, 5.3))):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=0.05, location=(*l, 2.42)); s = bpy.context.active_object; s.name = f'Bulb_{n}'
    s.data.materials.append(bmat); link(s, lights)
    box(f'Bulb_{n}_Cord', lights, (0.01, 0.01, 0.12), (*l, 2.52), steel)

# ---- hooks ----
empty('BAY_1', hooks, BAY1, kind='SINGLE_ARROW', size=1.0, label='Car one')
empty('BAY_2', hooks, BAY2, kind='SINGLE_ARROW', size=1.0, label='Car two')
empty('SPAWN', hooks, (DOOR_X, -3.8, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.6)   # (between the cars, room behind you for the camera)
empty('POSTER', hooks, (0.72, Y0 + 0.02, 1.48), rotz=math.pi, kind='PLAIN_AXES', size=0.3)   # (the SVMA's pathway poster: on the front wall by the door, seen on the way out)
empty('INTERACT_door', hooks, (DOOR_X, Y0 + 0.7, 1.6), kind='SPHERE', size=0.25, label='Head out')
empty('INTERACT_calendar', hooks, tuple(cal), kind='SPHERE', size=0.25, label='The calendar')
empty('TIRES', hooks, (7.45, -6.45, 0), kind='ARROWS', size=0.4)
# the stations' slots (backs to the wall, facing in). Only tools and sim exist so far; the rest are for later
for k, loc, rz in (('tools', (X0 + 0.05, -1.2, 0), D90), ('sim', (-2.7, Y1 - 0.05, 0), 0.0), ('dyno', (X0 + 0.05, -5.15, 0), D90),
                   ('fab', (X0 + 0.05, 1.65, 0), D90), ('data', (-1.5, Y1 - 0.05, DECK_Z), 0.0), ('tools2', (BAY3.x - 0.1, BAY3.y, 0), 0.0)):   # (tools2: the lift, Tools level 2)
    empty('SLOT_' + k, hooks, loc, rotz=rz, kind='ARROWS', size=0.5)
# where people stand (they face the empty's -Y, as you do at SPAWN): at the cars, the break area, the rail upstairs
for name, loc, rz, clip, role in (
        ('STAND_mechanic', (BAY1.x - 1.15, -4.3, 0), D90, 'kneel', 'mechanic'), ('STAND_mechanic.001', (BAY2.x + 1.1, -1.2, 0), -D90, 'lean', 'mechanic'),
('STAND_any.001', (1.0, 6.2, 0), 0.0, 'sit_idle', 'any'),
        ('STAND_any.002', (2.6, 5.7, 0), math.pi, 'talk', 'any'), ('STAND_any.003', (3.3, 1.7, 0), -D90 - 0.4, 'talk', 'any'),
        ('STAND_any.004', (4.2, 1.9, 0), D90 + 0.4, 'talk', 'any'), ('STAND_any.005', (-3.0, DECK_Y + 0.45, DECK_Z), 0.0, 'lean', 'any'),
        ('STAND_visitor', (2.2, -6.1, 0), math.pi, 'talk', 'visitor')):
    empty(name, hooks, loc, rotz=rz, kind='SINGLE_ARROW', size=0.5, clip=clip, role=role)
# where you can walk: the floor, the stairs, the deck (hidden in the game; the walker stands on whichever is under it)
def navq(name, pts):
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p in pts], [], [(0, 1, 2, 3)])
    if me.polygons[0].normal.z < 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); hooks.objects.link(o); o.display_type = 'WIRE'; o.hide_render = True; return o
navq('NAV_floor', [(X0 + 0.15, Y0 + 0.15, 0), (X1 - 0.15, Y0 + 0.15, 0), (X1 - 0.15, Y1 - 0.15, 0), (X0 + 0.15, Y1 - 0.15, 0)])
navq('NAV_stairs', [(ST_X0, ST_Y0, 0), (ST_X1, ST_Y0, 0), (ST_X1, DECK_Y, DECK_Z), (ST_X0, DECK_Y, DECK_Z)])
navq('NAV_deck', [(X0 + 0.15, DECK_Y, DECK_Z), (X1 - 0.15, DECK_Y, DECK_Z), (X1 - 0.15, Y1 - 0.15, DECK_Z), (X0 + 0.15, Y1 - 0.15, DECK_Z)])
# invisible walls: the open side of the stairs (stepped, so it's there at every height) and under their top end
ghost = bpy.data.materials.new('COL')
for k in range(6):
    y0 = ST_Y0 + 0.5 + k * (run - 0.5) / 6; y1 = y0 + (run - 0.5) / 6; h = DECK_Z * (y1 - ST_Y0) / run + 1.0
    box(f'COL_Stairs_Side_{k}', hooks, (0.1, y1 - y0, h), (ST_X0 - 0.06, (y0 + y1) / 2, h / 2), ghost)
box('COL_Stairs_Under', hooks, (sw + 0.1, 0.2, 1.6), ((ST_X0 + ST_X1) / 2, DECK_Y - 0.1, 0.8), ghost)
for o in hooks.objects:
    if o.name.startswith('COL_'): o.display_type = 'WIRE'; o.hide_render = True

# ---------------- guides (left out by the game) ----------------
guides = collection('GUIDES (left out by the game)')
gm = mat_img('GUIDE', None, 0.9); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.1, 0.1, 1)
for i, b in ((1, BAY1), (2, BAY2), (3, BAY3)):
    g = box(f'GUIDE_Car{i}', guides, (2.0, 5.6, 1.0), (b.x, b.y, 0.5), gm); g.display_type = 'WIRE'
    n = box(f'GUIDE_Car{i}Nose', guides, (0.7, 0.8, 0.7), (b.x, b.y - 3.2, 0.5), gm); n.display_type = 'WIRE'
for o in guides.objects: o.hide_render = True

# ---------------- the exporter (also kept in the .blend as a text block) ----------------
EXPORT = r'''
import bpy, os
from mathutils import Matrix, Vector
OUT = bpy.path.abspath('//')   # (next to the .blend: models/garage/)
def export_kit(out=OUT, only=None):
    done = []
    for coll in bpy.data.collections:
        if not coll.name.startswith(('shell_', 'station_')) or ' ' in coll.name: continue
        if only and coll.name not in only: continue
        objs = [o for o in coll.all_objects if not o.name.startswith('GUIDE') and o.visible_get()]
        objs += [o for o in coll.all_objects if o.name.startswith(('NAV_', 'COL_')) and o not in objs]   # (hidden in the viewport is fine for these)
        off = Vector(coll.instance_offset) if coll.name.startswith('station_') else None
        roots = [o for o in objs if not o.parent or o.parent not in objs]
        if off is not None:
            for o in roots: o.matrix_world = Matrix.Translation(-off) @ o.matrix_world
        bpy.ops.object.select_all(action='DESELECT')
        hid = [o for o in objs if o.hide_get()]
        for o in hid: o.hide_set(False)
        for o in objs: o.select_set(True)
        path = os.path.join(out, coll.name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_cameras=False, export_lights=True,
                                  export_extras=True, export_apply=True, export_yup=True)
        for o in hid: o.hide_set(True)
        if off is not None:
            for o in roots: o.matrix_world = Matrix.Translation(off) @ o.matrix_world
        done.append(path)
    print('exported:', *done, sep='\n  ')
    return done
if __name__ == '__main__': export_kit()
'''
t = bpy.data.texts.new('export_kit'); t.write(EXPORT)

path = os.path.join(OUT, 'unit-start.blend')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=path)
print('wrote', path)
if '--export' in args:
    ns = {'__name__': 'kit'}; exec(EXPORT, ns); ns['export_kit'](OUT)
