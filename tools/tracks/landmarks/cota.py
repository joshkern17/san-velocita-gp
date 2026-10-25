# Circuit of the Americas's landmarks, in the game's PS1-plus style, where the real ones stand: the 76 m Observation
# Tower behind the amphitheatre's stage at Turns 16-18, its red steel veil (the tubes that fall from the top in a curve
# and run on out over the stage as its canopy), the stage, and the fixed seats rising up the bowl in front of it (the
# map's outline of the stage canopy and the LiDAR ground's bowl: tools/tracks/realscan.mjs). Each seat block is a
# landmark of its own, so each sits on the bowl where it is. The grandstands are the modular kit's
# (tools/tracks/landmarks/cota-kit.json -> tools/tracks/kitstands.mjs); the pit building is the game's own (modern).
#   Blender -b --python-exit-code 1 --python tools/tracks/landmarks/cota.py -- [--blend]
#   node tools/tracks/landmarks.mjs cota
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lmkit as K
importlib.reload(K)
args = K.setup('cota', seed=2012)
M, G = K.M, K.G

# ---------------- where (the track's frame, game x, z) ----------------
STAGE = (-338.0, 80.0)                        # the middle of the map's stage canopy outline
TOWER = (-299.0, 126.0)                       # the map's tower (a building there the elevation data has 76 m tall)
FACE = (STAGE[0] - TOWER[0], STAGE[1] - TOWER[1])   # the stage faces up the bowl, away from the tower
fl = math.hypot(*FACE); TD = fl; FACE = (FACE[0] / fl, FACE[1] / fl)
SIDE = (-FACE[1], FACE[0])                    # across the stage
at = lambda o, f, s: (o[0] + FACE[0] * f + SIDE[0] * s, o[1] + FACE[1] * f + SIDE[1] * s)
rot_of = lambda dx, dz: math.atan2(dz, dx)

# ---------------- materials ----------------
red = G.plain_mat('Ct_Red', (0.72, 0.07, 0.05), dirt=0.12, rough=0.45)
white = G.plain_mat('Ct_White', (0.88, 0.88, 0.86), dirt=0.1)
soffit = G.plain_mat('Ct_Soffit', (0.62, 0.63, 0.64), dirt=0.15)
glass = K.curtain('Ct_Glass', (0.2, 0.3, 0.36), (0.75, 0.76, 0.78), cols=4, rows=1)
glass_lo = K.curtain('Ct_GlassLow', (0.18, 0.24, 0.28), (0.3, 0.31, 0.33), cols=3, rows=1)
seat = G.plain_mat('Ct_Seat', (0.16, 0.22, 0.36), dirt=0.12)
stage_dk = G.plain_mat('Ct_StageDark', (0.08, 0.08, 0.09), dirt=0.1)
deck = G.grimy_tile('Ct_Deck', 'concrete_02.png', dirt=0.15)


def lathe(r, name, x, z, prof, mat, segs=16):
    # a profile [(radius, h)] turned round a vertical line at (x, z)
    o = G.lathe(name, K.TOP, prof, K.P(x, z, 0), mat, segs=segs)
    return K.own(o, r)


# ---------------- the Observation Tower ----------------
def tower():
    x, z = TOWER; r = K.root('tower', x, z, 12, 12, rot_of(*FACE))
    # (the plaza deck at its foot, and the glass lobby round the core)
    lathe(r, 'plinth', x, z, [(0, -1.5), (13, -1.5), (13, 0.6), (0, 0.6)], deck, segs=12)
    lathe(r, 'lobby', x, z, [(0, 0.6), (7.2, 0.6), (7.2, 4.6), (0, 4.6)], glass_lo, segs=12)
    lathe(r, 'lobby_roof', x, z, [(0, 4.6), (8.0, 4.6), (8.0, 5.2), (0, 5.2)], white, segs=12)
    # the core: a slender white shaft, a little thicker at the foot
    lathe(r, 'core', x, z, [(3.6, 5.2), (3.1, 30), (2.9, 60.5)], white, segs=10)
    # (the stair and lift guides up its back: two dark slots)
    for k, s in enumerate((-1.2, 1.2)):
        bx, bz = x - FACE[0] * 3.0 + SIDE[0] * s, z - FACE[1] * 3.0 + SIDE[1] * s
        K.rodv(r, f'slot{k}', (bx, bz, 6), (bx, bz, 60), 0.45, stage_dk, verts=4)
    # the deck: its underside flaring out from the shaft, the glass ring, the roof and the crown
    lathe(r, 'soffit', x, z, [(2.9, 60.5), (6.5, 64.5), (10.4, 67.6)], soffit, segs=16)
    lathe(r, 'deck_floor', x, z, [(10.4, 67.6), (10.8, 67.6), (10.8, 68.2)], white, segs=16)
    lathe(r, 'deck_glass', x, z, [(10.6, 68.2), (10.6, 71.2)], glass, segs=16)
    lathe(r, 'deck_roof', x, z, [(11.2, 71.2), (11.2, 71.9), (6.0, 72.4), (0, 72.4)], white, segs=16)
    lathe(r, 'crown', x, z, [(5.0, 72.4), (5.0, 74.4), (0, 74.4)], white, segs=12)
    K.rodv(r, 'mast', (x, z, 74.4), (x, z, 80.5), 0.25, M['steel'])
    # the veil: red tubes from a ring at the top, falling in a curve towards the stage and running on out over it as the
    # canopy (a cubic each: off the top, down the front, swept level over the stage); spread wider as they fall
    n = 17
    for k in range(n):
        t = (k / (n - 1)) * 2 - 1                                  # -1..1 across
        a = t * math.radians(72)
        top = (x + (FACE[0] * math.cos(a) + SIDE[0] * math.sin(a)) * 10.0, z + (FACE[1] * math.cos(a) + SIDE[1] * math.sin(a)) * 10.0, 73.6)
        p1 = (*at(TOWER, 20, t * 10), 60.0)
        p2 = (*at(TOWER, TD * 0.5, t * 17), 22.0)
        p3 = (*at(TOWER, TD + 7, t * 18), 15.5)                     # (out to the stage's front)
        pts = []
        for q in range(15):
            u = q / 14; m = 1 - u
            pts.append(tuple(m ** 3 * top[i] + 3 * m * m * u * p1[i] + 3 * m * u * u * p2[i] + u ** 3 * p3[i] for i in range(3)))
        K.own(G.sweep(f'veil{k}', K.TOP, [K.P(*q) for q in pts], 0.32, red, segs=6, per_m=2), r)
    # (the canopy's cross ties, under the tubes over the stage)
    for k, f in enumerate((TD - 10, TD - 2, TD + 6)):
        a, b = (*at(TOWER, f, -18), 15.6), (*at(TOWER, f, 18), 15.6)
        K.rodv(r, f'tie{k}', a, b, 0.22, M['steel'])


# ---------------- the stage ----------------
def stage():
    x, z = STAGE; r = K.root('stage', x, z, 17, 12, rot_of(*SIDE))
    F = K.Frame(x, z, rot_of(*SIDE), 1)   # (u across the stage, v + towards the seats... set below)
    # local: u along SIDE, v along FACE (toward=1 maps v to F.at's +v: check the sign by FACE)
    vsign = 1 if (F.at(0, 1)[0] - x) * FACE[0] + (F.at(0, 1)[1] - z) * FACE[1] > 0 else -1
    F = K.Frame(x, z, rot_of(*SIDE), vsign)
    K.box_f(r, 'deck', F, -16, 16, -9, 6, -1.5, 1.6, M['concrete_d'])
    K.box_f(r, 'floor', F, -15.5, 15.5, -8.5, 5.5, 1.6, 1.7, stage_dk)
    K.box_f(r, 'house', F, -14, 14, -12, -8.5, -1.5, 13.5, M['concrete'])               # (the back wall)
    K.wall_f(r, 'backdrop', F, 'front', -12.5, 12.5, -12, -8.5, 1.7, 12.0, stage_dk)
    for k, u in enumerate((-15.5, 15.5)):                                                 # (the sound and light towers)
        K.box_f(r, f'pa{k}', F, u - 1.2, u + 1.2, 3.0, 5.0, 1.7, 11.5, stage_dk)
        K.box_f(r, f'pa_top{k}', F, u - 1.6, u + 1.6, 2.6, 5.4, 11.5, 12.2, M['steel'])
    # (the lighting truss across the front, hung from the canopy)
    a, b = F.at(-15, 4.2), F.at(15, 4.2)
    K.rodv(r, 'truss', (*a, 11.2), (*b, 11.2), 0.3, M['steel'], verts=4)
    for k in range(7):
        u = -13 + k * (26 / 6); p = F.at(u, 4.2)
        K.rodv(r, f'hang{k}', (*p, 11.2), (*p, 15.0), 0.05, M['steel'], verts=4)
    # (the walkway down from the tower's plaza to the back of the stage)
    K.box_f(r, 'ramp', F, -3, 3, -TD + 13, -12, -1.5, 0.4, deck)


# ---------------- the seats: terraced blocks round the stage, rising up the bowl ----------------
def seats():
    C = at(STAGE, 8.5, 0)                                     # (the front of the stage)
    rows, r0, tread, span = 14, 11.0, 2.3, math.radians(58)
    for j in range(rows):
        ra, rb = r0 + j * tread, r0 + j * tread + tread - 0.15
        n = max(3, round(2 * span * (ra + rb) / 2 / 11))     # (blocks about 11 m long, aisles between)
        aisle = 1.3 / ((ra + rb) / 2)                          # (radians: 1.3 m of aisle)
        for k in range(n):
            a0 = -span + k * (2 * span / n) + aisle / 2; a1 = a0 + 2 * span / n - aisle
            am = (a0 + a1) / 2
            d = (FACE[0] * math.cos(am) + SIDE[0] * math.sin(am), FACE[1] * math.cos(am) + SIDE[1] * math.sin(am))
            cx, cz = C[0] + d[0] * (ra + rb) / 2, C[1] + d[1] * (ra + rb) / 2
            L = (a1 - a0) * (ra + rb) / 2
            r = K.root(f'seats{j}_{k}', cx, cz, L / 2, tread / 2, rot_of(-d[1], d[0]))
            ring = lambda rr, a: (C[0] + (FACE[0] * math.cos(a) + SIDE[0] * math.sin(a)) * rr, C[1] + (FACE[1] * math.cos(a) + SIDE[1] * math.sin(a)) * rr)
            seg = 4
            vs, fs = [], []
            for q in range(seg + 1):
                a = a0 + (a1 - a0) * q / seg
                for rr, h in ((ra, -2.0), (ra, 0.35), (rb, 0.35), (rb, -2.0)): vs.append(K.P(*ring(rr, a), h))
            for q in range(seg):
                b0, b1 = q * 4, q * 4 + 4
                fs += [(b0, b1, b1 + 1, b0 + 1), (b0 + 1, b1 + 1, b1 + 2, b0 + 2), (b0 + 2, b1 + 2, b1 + 3, b0 + 3)]
            fs += [(0, 1, 2, 3), (seg * 4 + 3, seg * 4 + 2, seg * 4 + 1, seg * 4)]
            o = K.mesh(r, f'step{j}_{k}', vs, fs, M['concrete'])
            # (the seats: a low bench of seat backs along the back of the tread)
            vs, fs = [], []
            for q in range(seg + 1):
                a = a0 + (a1 - a0) * q / seg
                for rr, h in ((rb - 0.95, 0.35), (rb - 0.95, 0.8), (rb - 0.45, 1.15), (rb - 0.3, 1.15), (rb - 0.3, 0.35)): vs.append(K.P(*ring(rr, a), h))
            for q in range(seg):
                b0, b1 = q * 5, q * 5 + 5
                for e in range(4): fs.append((b0 + e, b1 + e, b1 + e + 1, b0 + e + 1))
            K.mesh(r, f'seat{j}_{k}', vs, fs, seat)


tower(); stage(); seats()
# (normals: every mesh made from points faces out)
import bmesh
for o, _ in K.PARTS:
    if o.type != 'MESH': continue
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
# (the circuit's grounds: the map's and the scan's buildings in here are its sheds, offices and stores, not homes)
K.finish('cota', [], grounds=[-860, 760, -470, 720], args=args)
