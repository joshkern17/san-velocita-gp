# Sebring's landmarks, in the game's PS1-plus style, where the real ones stand: the SEVEN Sebring Raceway Hotel (built
# 2000 as the Chateau Elan) on the map's outline by the Hairpin, its two four-storey wings in cream render under steep
# slate hip roofs, balconies down the track side ("Hairpin view" rooms) and a taller entrance tower at the kink; and
# the airfield's control tower at the map's tower, the Hendricks Field (WWII B-17 base) kind: a white three-level base,
# the glass cab on top with its catwalk, a beacon. The grandstands are the modular kit's (sebring-kit.json ->
# tools/tracks/kitstands.mjs); the pit building is the game's own (classic).
#   Blender -b --python-exit-code 1 --python tools/tracks/landmarks/sebring.py -- [--blend]
#   node tools/tracks/landmarks.mjs sebring
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lmkit as K
importlib.reload(K)
args = K.setup('sebring', seed=1950)
M, G = K.M, K.G

# ---------------- materials ----------------
room = K.windows('Sb_Rooms', (0.88, 0.83, 0.7), glass=(0.13, 0.16, 0.2), frame=(0.95, 0.94, 0.9), w=0.5, h=0.62, sill=0.12)
lobby = K.curtain('Sb_Lobby', (0.16, 0.22, 0.27), (0.92, 0.91, 0.86), cols=3, rows=1)
render = G.plain_mat('Sb_Render', (0.88, 0.83, 0.7), dirt=0.14)
trim = G.plain_mat('Sb_Trim', (0.95, 0.94, 0.9), dirt=0.1)
slate = G.plain_mat('Sb_Slate', (0.25, 0.28, 0.33), dirt=0.2, rough=0.6)
tw_wall = K.windows('Sb_TowerWall', (0.9, 0.9, 0.87), glass=(0.12, 0.15, 0.18), frame=(0.36, 0.38, 0.4), w=0.34, h=0.42, sill=0.3, dirt=0.22)
cab = K.curtain('Sb_Cab', (0.2, 0.3, 0.34), (0.32, 0.34, 0.36), cols=4, rows=1)
beacon = G.plain_mat('Sb_Beacon', (0.95, 0.75, 0.2), dirt=0.05)

FLOOR, NF = 3.0, 4          # storeys
TOP = FLOOR * NF


def wing(key, a, b, depth, toward):
    # one wing from game point a to b (its middle line), `depth` deep, its front (balconies) towards the track
    L = math.hypot(b[0] - a[0], b[1] - a[1]); rot = math.atan2(b[1] - a[1], b[0] - a[0])
    cx, cz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    F = K.Frame(cx, cz, rot, toward); r = K.root(key, cx, cz, L / 2, depth / 2, rot)
    u0, u1, v0, v1 = -L / 2, L / 2, -depth / 2, depth / 2
    K.box_f(r, key + '_core', F, u0 + 0.1, u1 - 0.1, v0 + 0.1, v1 - 0.1, -0.5, TOP, render)
    # each storey's rooms all round (the ground floor's lobby glass down the back, where the cars come in)
    for f in range(NF):
        h0, h1 = f * FLOOR, (f + 1) * FLOOR
        for side in ('front', 'back', 'left', 'right'):
            mat = lobby if (f == 0 and side == 'back') else room
            K.wall_f(r, f'{key}_w{f}{side}', F, side, u0, u1, v0, v1, h0, h1, mat, u=3.6)
        K.box_f(r, f'{key}_band{f}', F, u0 - 0.05, u1 + 0.05, v0 - 0.05, v1 + 0.05, h1 - 0.18, h1, trim)   # (the floor line)
    # the balconies: one a room on the track side, each floor above the ground, a slab and its railing
    n = int(L // 3.6)
    for f in range(1, NF):
        h = f * FLOOR
        for q in range(n):
            ua = u0 + (q + 0.12) * L / n; ub = u0 + (q + 0.88) * L / n
            K.box_f(r, f'{key}_bal{f}_{q}', F, ua, ub, v1, v1 + 1.3, h - 0.1, h + 0.1, trim)
            pa, pb = F.at(ua, v1 + 1.3), F.at(ub, v1 + 1.3)
            K.face(r, f'{key}_rail{f}_{q}', pa, pb, h + 0.1, h + 1.05, M['railing'], F.out(0, 1), u=1.2)
    # the roof: a steep slate hip (a pitched roof, its ends cut back), over a cornice
    K.box_f(r, key + '_cornice', F, u0 - 0.35, u1 + 0.35, v0 - 0.35, v1 + 0.35, TOP, TOP + 0.35, trim)
    K.gable_f(r, key + '_roof', F, u0 + 2.5, u1 - 2.5, v0, v1, TOP + 0.35, 4.2, slate, over=0.6)
    for s, (ua, ub) in enumerate(((u0, u0 + 2.5), (u1 - 2.5, u1))):   # (the hip ends)
        p = lambda u, v, hh: K.P(*F.at(u, v), hh)
        end = ub if s == 0 else ua; tip = ua if s == 0 else ub
        K.mesh(r, f'{key}_hip{s}', [p(tip + (-0.6 if s == 0 else 0.6), v0 - 0.6, TOP + 0.35), p(tip + (-0.6 if s == 0 else 0.6), v1 + 0.6, TOP + 0.35), p(end, 0, TOP + 4.55)], [(0, 1, 2)], slate)
    # dormers along the roof, track side: the château look
    for q in range(1, n, 2):
        u = u0 + (q + 0.5) * L / n
        K.box_f(r, f'{key}_dorm{q}', F, u - 0.9, u + 0.9, v1 - 2.4, v1 - 0.6, TOP + 0.35, TOP + 2.2, render)
        K.wall_f(r, f'{key}_dormw{q}', F, 'front', u - 0.9, u + 0.9, v1 - 2.4, v1 - 0.6, TOP + 0.35, TOP + 2.2, room)
        K.gable_f(r, f'{key}_dormr{q}', F, u - 0.9, u + 0.9, v1 - 2.4, v1 - 0.6, TOP + 2.2, 0.8, slate, over=0.15)
    return F


def hotel():
    # the map's outline: a bar with a kink, the east wing ~42 m, the west ~56 m, both ~20 m deep; the track (the
    # straight into the Hairpin) is north of it
    K_ = (-657.0, 62.0)
    wing('hotel_e', K_, (-616.0, 52.0), 19.0, -1)
    wing('hotel_w', K_, (-705.0, 33.0), 19.0, 1)
    # the entrance tower over the kink: a storey taller, a steep pyramid roof, the lobby glass at its foot
    x, z, w = K_[0], K_[1] - 1.0, 5.0; r = K.root('hotel_tower', x, z, w, w, 0.0)
    K.blk(r, 'tw_core', x - w, x + w, z - w, z + w, -0.5, TOP + FLOOR, render)
    for f in range(NF + 1):
        for k, (a, b, o) in enumerate((((x - w, z - w), (x + w, z - w), (0, -1)), ((x + w, z - w), (x + w, z + w), (1, 0)), ((x + w, z + w), (x - w, z + w), (0, 1)), ((x - w, z + w), (x - w, z - w), (-1, 0)))):
            a2 = (a[0] + o[0] * 0.03, a[1] + o[1] * 0.03); b2 = (b[0] + o[0] * 0.03, b[1] + o[1] * 0.03)
            K.face(r, f'tw_w{f}_{k}', a2, b2, f * FLOOR, (f + 1) * FLOOR, lobby if f == 0 else room, o, u=3.4)
    h = TOP + FLOOR
    K.blk(r, 'tw_cornice', x - w - 0.4, x + w + 0.4, z - w - 0.4, z + w + 0.4, h, h + 0.4, trim)
    c = [(x - w - 0.5, z - w - 0.5), (x + w + 0.5, z - w - 0.5), (x + w + 0.5, z + w + 0.5), (x - w - 0.5, z + w + 0.5)]
    K.mesh(r, 'tw_roof', [K.P(*q, h + 0.4) for q in c] + [K.P(x, z, h + 7.5)], [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], slate)
    K.cylv(r, 'tw_finial', x, z, 0.12, h + 7.3, h + 9.0, M['dark'], verts=6)


def control_tower():
    # the map's tower (6.4 m square), the WWII airfield kind: three white storeys, the glass cab, its catwalk, a beacon
    x, z, w = 581.3, -601.7, 3.2; r = K.root('ctower', x, z, w + 1.2, w + 1.2, 0.0)
    K.blk(r, 'ct_base', x - w, x + w, z - w, z + w, -0.5, 9.0, M['white'])
    sides = (((x - w, z - w), (x + w, z - w), (0, -1)), ((x + w, z - w), (x + w, z + w), (1, 0)), ((x + w, z + w), (x - w, z + w), (0, 1)), ((x - w, z + w), (x - w, z - w), (-1, 0)))
    for f in range(3):
        for k, (a, b, o) in enumerate(sides):
            a2 = (a[0] + o[0] * 0.03, a[1] + o[1] * 0.03); b2 = (b[0] + o[0] * 0.03, b[1] + o[1] * 0.03)
            K.face(r, f'ct_w{f}_{k}', a2, b2, f * 3.0, (f + 1) * 3.0, tw_wall, o, u=2.1)
    # the catwalk round the cab, its railing, the cab (glass all round, leaning out a little), its flat roof
    K.blk(r, 'ct_deck', x - w - 1.1, x + w + 1.1, z - w - 1.1, z + w + 1.1, 9.0, 9.25, M['concrete'])
    K.rail_ring(r, 'ct_rail', x - w - 1.05, x + w + 1.05, z - w - 1.05, z + w + 1.05, 9.25)
    cw = w - 0.4
    K.blk(r, 'ct_cabsill', x - cw, x + cw, z - cw, z + cw, 9.25, 10.0, M['white'])
    for k, (a, b, o) in enumerate((((x - cw, z - cw), (x + cw, z - cw), (0, -1)), ((x + cw, z - cw), (x + cw, z + cw), (1, 0)), ((x + cw, z + cw), (x - cw, z + cw), (0, 1)), ((x - cw, z + cw), (x - cw, z - cw), (-1, 0)))):
        K.face(r, f'ct_cab{k}', a, b, 10.0, 12.2, cab, o, u=1.4)
    K.blk(r, 'ct_cabfill', x - cw + 0.2, x + cw - 0.2, z - cw + 0.2, z + cw - 0.2, 10.0, 12.2, M['dark'])
    K.blk(r, 'ct_roof', x - cw - 0.5, x + cw + 0.5, z - cw - 0.5, z + cw + 0.5, 12.2, 12.55, M['white'])
    K.cylv(r, 'ct_mast', x, z, 0.08, 12.55, 15.2, M['steel'], verts=6)
    K.cylv(r, 'ct_beacon', x, z, 0.3, 14.6, 15.1, beacon, verts=10)
    # the outside stair up the side, a door at its foot
    for q in range(9):
        K.blk(r, f'ct_step{q}', x + w + 0.05, x + w + 1.05, z - w + 0.4 + q * 0.62, z - w + 1.0 + q * 0.62, q * 1.0, q * 1.0 + 0.15, M['steel'])
    K.face(r, 'ct_door', (x - 0.6, z + w + 0.04), (x + 0.6, z + w + 0.04), 0.0, 2.2, M['dark'], (0, 1))


hotel(); control_tower()
import bmesh
for o, _ in K.PARTS:
    if o.type != 'MESH': continue
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
# (the circuit's grounds: the map's and the scan's buildings in here are its sheds, garages and offices, not homes)
K.finish('sebring', [], grounds=[-820, 640, -720, 560], args=args)
