# The street kit: the real things along a real town's roads, for the map's street details (js/streetdata.js ->
# js/streetkit.js): road signs, traffic signals, power poles and a transmission tower, driveway gates, the railroad
# crossing, a stretch of track, and road barriers (guard rail, jersey barrier, bollard, board fence, block wall).
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/props/streetkit.py -- [--blend] [--only id,id]
#
# Each piece is modelled from its real parts at its real size (a 30 in stop sign 7 ft up on a square tube post, a
# mast arm with 3-section heads, visors and a backplate, a Class 3 wood pole with an 8 ft crossarm, pin insulators and
# a secondary rack...), PSX tiles with light grime and wear (tools/garagelib.py), and ambient occlusion baked into its
# vertex colours. Blender space: the ground at z = 0, the front (the face drivers see) down -Y. For the line pieces
# (rail, guard rail, wall, fence, jersey barrier) the line runs along X and a piece is one section of it, centred,
# so the game lays them end to end. Exported (like every library model: metres, +Y up, front +Z, centred on x/z, base
# at y 0) to assets/env/streetkit.glb with their entries in assets/env/catalog.json, cat 'street'. Extras there:
#   wires   power poles / tower: where each conductor ties on, [x, y, z] (the game strings them pole to pole)
#   lamps   signals / crossing: the lenses, [x, y, z, colour 'r' | 'y' | 'g' | 'w'] (lit by the game)
#   len     line pieces: the section's length along the line (m)
import bpy, bmesh, sys, os, json, math, subprocess
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
bpy.ops.wm.read_factory_settings(use_empty=True)
import garagelib as G
from garagelib import bbox, bx, cy, rd, sweep, lathe, mk, grimy_tile, plain_mat, solid_mat, mat_img, art_mat, card

ROOT = G.ROOT
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = next((a.split('=')[1] if '=' in a else args[args.index(a) + 1] for a in args if a.startswith('--only')), '')
ONLY = set(ONLY.split(',')) if ONLY else None
OUTDIR = os.path.join(ROOT, 'models', 'trackside'); GEN = os.path.join(OUTDIR, 'src', 'streetkit_gen'); ART = os.path.join(GEN, 'art')
G.configure(GEN, seed=1955)
G.TEX = os.path.join(ROOT, 'models', 'garage', 'src', 'psx_industrial')

# the printed faces first (Pillow: /usr/local/bin/python3)
if not os.path.exists(os.path.join(ART, 'sk_stop_a.png')) or '--art' in args:
    subprocess.run(['/usr/local/bin/python3', os.path.join(ROOT, 'tools', 'props', 'streetsigns.py')], check=True)

# ---------------------------------------------------------------- materials
GALV = grimy_tile('sk_galv', 'galvanized_metal.png', dirt=0.18, wear_light=0.15)
ALU = grimy_tile('sk_alu', 'scratched_metal.png', dirt=0.12, tint=(0.62, 0.63, 0.62))      # (a sign's bare back)
POLEW = grimy_tile('sk_polewood', 'weathered_wood.png', dirt=0.22, tint=(0.33, 0.26, 0.2))  # (creosote-brown, weathered)
ARMW = grimy_tile('sk_armwood', 'wood.png', dirt=0.28, tint=(0.42, 0.36, 0.29))
CONC = grimy_tile('sk_conc', 'concrete_02.png', dirt=0.28)
JERSEY = grimy_tile('sk_jersey', 'concrete_01.png', dirt=0.32, tint=(0.66, 0.64, 0.6))
SIGYEL = plain_mat('sk_sigyellow', (0.74, 0.56, 0.06), dirt=0.16)
BLACKP = plain_mat('sk_blackpaint', (0.055, 0.055, 0.06), dirt=0.1)
GREYP = plain_mat('sk_greypaint', (0.4, 0.43, 0.42), dirt=0.2)
PORC = plain_mat('sk_porcelain', (0.44, 0.47, 0.45), dirt=0.08, rough=0.35)
RUBBER = grimy_tile('sk_rubber', 'rubber.png', dirt=0.1)
IRON = grimy_tile('sk_iron', 'dark_industrial_metal.png', dirt=0.15, rust=0.18, tint=(0.1, 0.1, 0.1))
RAILS = grimy_tile('sk_railside', 'heavily_rusted_metal.png', dirt=0.15)
RAILTOP = grimy_tile('sk_railtop', 'scratched_metal.png', dirt=0.05, tint=(0.75, 0.75, 0.76))
TIE = grimy_tile('sk_tie', 'weathered_wood.png', dirt=0.35, tint=(0.24, 0.2, 0.17))
BALLAST = grimy_tile('sk_ballast', 'stone_02.png', dirt=0.25, tint=(0.52, 0.5, 0.47))
STUCCO = grimy_tile('sk_stucco', 'concrete_03.png', dirt=0.2, tint=(0.8, 0.74, 0.64))
CMU = grimy_tile('sk_cmu', 'brick.png', dirt=0.22, tint=(0.62, 0.6, 0.56))
PLANK = grimy_tile('sk_fenceboard', 'wooden_planks.png', dirt=0.25, tint=(0.56, 0.44, 0.33))
YELP = plain_mat('sk_yellowpaint', (0.8, 0.6, 0.05), dirt=0.2)
WHITEP = plain_mat('sk_whitepaint', (0.82, 0.82, 0.8), dirt=0.15)
REFL = plain_mat('sk_reflective', (0.85, 0.66, 0.1), dirt=0.05, rough=0.3)
DARK = solid_mat('sk_dark', (0.02, 0.02, 0.02), 0.8)
# the lenses: named so the game can light them (js/streetkit.js: sk_Lens*)
LENS = {c: solid_mat('sk_Lens' + c.upper(), rgb, 0.2) for c, rgb in (('r', (0.62, 0.07, 0.05)), ('y', (0.7, 0.42, 0.06)), ('g', (0.06, 0.5, 0.36)), ('w', (0.62, 0.56, 0.44)))}
def art(name, dirt=0.12): return art_mat(name, os.path.join(ART, name + '.png'), dirt=dirt)

PIECES = {}   # id -> dict(coll, label, cls, extras)
def piece(pid, label, cls, **extra):
    def deco(fn):
        if ONLY and pid not in ONLY: return fn
        c = bpy.data.collections.new(pid); bpy.context.scene.collection.children.link(c)
        G.BUILT.clear(); ex = fn(c) or {}
        PIECES[pid] = dict(coll=c, label=label, cls=cls, built=list(G.BUILT), extra={**extra, **ex})
        return fn
    return deco

# ---------------------------------------------------------------- small shared parts
def bolt(c, p, axis='y', r=0.012, L=0.012, mat=None):
    # a carriage-bolt head with its washer, facing along -axis
    rot = {'y': (math.pi / 2, 0, 0), 'x': (0, math.pi / 2, 0), 'z': (0, 0, 0)}[axis]
    return lathe('bolt', c, [(0, 0), (r * 1.7, 0), (r * 1.7, 0.002), (r, 0.003), (r * 0.9, L), (0, L)], p, mat or GALV, segs=6, rot=rot)

def prism(name, c, outline, y0, y1, front_mat, back_mat, rim_mat, uv_box):
    # a flat plate: outline [(x, z)] extruded from y0 (front) to y1; the front face's UVs fit uv_box (x0, z0, x1, z1)
    n = len(outline); verts = [(x, y0, z) for x, z in outline] + [(x, y1, z) for x, z in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free(); me.update()   # (outward, whichever way the outline ran)
    o = G._obj(name, c, me, [front_mat, back_mat, rim_mat])
    uv = me.uv_layers.new(); x0, z0, x1, z1 = uv_box
    for f in me.polygons:
        f.material_index = 0 if f.normal.y < -0.5 else 1 if f.normal.y > 0.5 else 2
        for li in f.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((v.x - x0) / (x1 - x0), (v.z - z0) / (z1 - z0)) if f.material_index == 0 else (v.x * 0.5 + v.y * 0.5, v.z * 0.5)
    return o

def visor(name, c, ctr, r, depth, mat, segs=8, open_down=True):
    # a signal's tunnel visor: the top of a tube (a cap over the lens), sticking out to -Y
    verts, faces = [], []
    for j in range(segs + 1):
        a = math.pi * j / segs if open_down else math.pi + math.pi * j / segs
        for y in (0, -depth): verts.append((ctr[0] + r * math.cos(a), ctr[1] + y, ctr[2] + r * math.sin(a) * (1 if open_down else 1)))
    for j in range(segs): faces.append((j * 2, j * 2 + 1, j * 2 + 3, j * 2 + 2))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate(); me.update()
    o = G._obj(name, c, me, mat); G.uv_world(me, Matrix.Identity(4), 2.0); return o

def disc(name, c, ctr, r, mat, segs=12, t=0.01, axis='y'):
    rot = {'y': (math.pi / 2, 0, 0), 'x': (0, math.pi / 2, 0), 'z': (0, 0, 0)}[axis]
    return lathe(name, c, [(0, 0), (r, 0), (r, t), (0, t)], ctr, mat, segs=segs, rot=rot)

# ---------------------------------------------------------------- road signs
def sign_post(c, top, sleeve=True):
    # a 2 in square perforated steel tube (Telespar), in a breakaway ground sleeve
    bbox('post', c, (0.051, 0.051, top), (0, 0, top / 2), GALV, bev=0.004)
    if sleeve:
        bbox('sleeve', c, (0.064, 0.064, 0.42), (0, 0, 0.21), GALV, bev=0.004)
        for z in (0.12, 0.34): bolt(c, (0, -0.033, z), r=0.007)
    # a little dirt heaped round the foot
    lathe('foot', c, [(0.0, 0.0), (0.16, 0.0), (0.06, 0.035), (0.0, 0.04)], (0, 0, 0), CONC, segs=8)

def oct_outline(cz, flat):
    R0 = flat / 2 / math.cos(math.pi / 8)
    return [(R0 * math.cos(math.pi / 8 + k * math.pi / 4), cz + R0 * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]

for v, face, tilt in (('a', 'sk_stop_a', 0.0), ('b', 'sk_stop_b', 0.02)):
    @piece(f'sk_stop_{v}', 'Stop Sign', 'street_sign')
    def _(c, face=face):
        # R1-1, 30 in (0.76 m) flat to flat, its bottom 7 ft (2.13 m) up
        flat, cz = 0.762, 2.13 + 0.381
        sign_post(c, 2.95)
        prism('plate', c, oct_outline(cz, flat), -0.032, -0.028, art(face), ALU, ALU, (-flat / 2, cz - flat / 2, flat / 2, cz + flat / 2))
        for z in (cz + 0.3, cz - 0.3): bolt(c, (0, -0.033, z), r=0.009)
        bbox('clamp', c, (0.07, 0.006, 0.03), (0, -0.026, cz - 0.3), GALV, bev=0.002)

@piece('sk_yield', 'Yield Sign', 'street_sign')
def _(c):
    # R1-2, 36 in (0.91 m) a side, point down, its tip 7 ft up
    s = 0.914; zt = 2.13; h = s * math.sqrt(3) / 2
    sign_post(c, zt + h + 0.04)
    prism('plate', c, [(-s / 2, zt + h), (0, zt), (s / 2, zt + h)][::-1], -0.032, -0.028, art('sk_yield'), ALU, ALU, (-s / 2, zt + h - s * 222 / 256, s / 2, zt + h))
    for z in (zt + h - 0.12, zt + 0.3): bolt(c, (0, -0.033, z), r=0.009)

# ---------------------------------------------------------------- traffic signals
def signal_head(c, x, z_top, lamps):
    # a 3-section 12 in vehicle head: yellow polycarbonate housing, black backplate with a yellow retroreflective border,
    # three lenses (red, yellow, green, top down) under tunnel visors; hung from a bracket at z_top
    W, D, H = 0.36, 0.26, 1.06
    z0 = z_top - 0.22 - H
    rd('hanger', c, (x, 0, z_top), (x, 0, z_top - 0.22), 0.025, GALV, verts=6)
    bbox('housing', c, (W, D, H), (x, 0, z0 + H / 2), SIGYEL, bev=0.03)
    # the backplate (5 in all round) and its border
    bbox('backplate', c, (W + 0.26, 0.012, H + 0.26), (x, D / 2 + 0.01, z0 + H / 2), BLACKP, bev=0.004)
    for (sx, sz, px, pz) in ((W + 0.26, 0.05, 0, (H + 0.26) / 2 - 0.025), (W + 0.26, 0.05, 0, -(H + 0.26) / 2 + 0.025), (0.05, H + 0.26, (W + 0.26) / 2 - 0.025, 0), (0.05, H + 0.26, -(W + 0.26) / 2 + 0.025, 0)):
        bx('border', c, (sx, 0.004, sz), (x + px, D / 2 + 0.002, z0 + H / 2 + pz), REFL)
    for k, col in enumerate('ryg'):
        zc = z0 + H - 0.18 - k * 0.35
        disc('lens_' + col, c, (x, -D / 2 - 0.001, zc), 0.145, LENS[col], segs=12, t=0.012)
        lathe('bezel', c, [(0.15, 0), (0.17, 0), (0.17, 0.02), (0.15, 0.02)], (x, -D / 2, zc), BLACKP, segs=12, rot=(math.pi / 2, 0, 0))
        visor('visor', c, (x, -D / 2 - 0.01, zc), 0.165, 0.24, BLACKP)
        lamps.append([x, -D / 2 - 0.02, zc, col])

def signal_pole(c, H):
    lathe('footing', c, [(0, 0), (0.42, 0), (0.42, 0.12), (0.38, 0.16), (0, 0.16)], (0, 0, 0), CONC, segs=12)
    bbox('baseplate', c, (0.5, 0.5, 0.04), (0, 0, 0.18), GALV, bev=0.006)
    for sx in (-0.2, 0.2):
        for sy in (-0.2, 0.2): lathe('anchor', c, [(0, 0), (0.035, 0), (0.035, 0.05), (0.02, 0.05), (0.02, 0.09), (0, 0.09)], (sx, sy, 0.2), GALV, segs=6)
    lathe('pole', c, [(0.175, 0.2), (0.165, 1.0), (0.135, H), (0.0, H + 0.02)], (0, 0, 0), GALV, segs=12, vscale=0.5)
    bbox('handhole', c, (0.13, 0.03, 0.22), (0.16, 0, 0.75), GALV, bev=0.005, rot=(0, 0, 0))

for ARM, pid, lab in ((7.2, 'sk_signal', 'Traffic Signal'), (4.6, 'sk_signal_s', 'Traffic Signal (short arm)')):
    @piece(pid, lab, 'street_signal')
    def _(c, ARM=ARM):
        # a galvanized pole on the far corner, its mast arm out over the lanes (to -X: over the road), the heads facing the
        # traffic coming (-Y); a pedestrian push button and a ped head on the pole
        H = 6.6; lamps = []
        signal_pole(c, H)
        za = 5.7
        bbox('clamp', c, (0.42, 0.42, 0.5), (0, 0, za), GALV, bev=0.03)
        sweep('arm', c, [(0, 0, za), (-ARM * 0.4, 0, za + 0.18), (-ARM, 0, za + 0.38)], 0.12, GALV, segs=10, per_m=2, rv=lambda t: 1 - 0.45 * t, vscale=0.5)
        heads = [-ARM + 0.6, -ARM * 0.55] if ARM > 6 else [-ARM + 0.55]
        for x in heads: signal_head(c, x, za + 0.38 * (-x / ARM) - 0.02, lamps)
        # the pedestrian head (hand / walking man), on the pole facing across, and the push button
        bbox('pedhead', c, (0.34, 0.22, 0.34), (0.0, -0.3, 3.0), BLACKP, bev=0.02)
        bx('pedbracket', c, (0.06, 0.12, 0.06), (0, -0.16, 3.0), GALV)
        disc('pedlens', c, (0, -0.415, 3.0), 0.12, LENS['w'], segs=10, t=0.008)
        visor('pedvisor', c, (0, -0.41, 3.0), 0.16, 0.12, BLACKP)
        bbox('button', c, (0.12, 0.08, 0.2), (0, -0.2, 1.1), SIGYEL, bev=0.01)
        disc('buttonface', c, (0, -0.245, 1.07), 0.03, DARK, segs=8, t=0.006)
        lamps.append([0, -0.43, 3.0, 'w'])
        return {'lamps': [[round(a, 3) for a in l[:3]] + [l[3]] for l in lamps]}

@piece('sk_signal_post', 'Traffic Signal (post)', 'street_signal')
def _(c):
    # a pedestal post on a corner: one head side-mounted at the top, facing -Y
    lamps = []
    signal_pole(c, 3.9)
    bx('bracket', c, (0.06, 0.06, 0.4), (0, -0.2, 3.9), GALV)
    signal_head(c, 0, 4.3 + 0.22 - 0.01, lamps)
    return {'lamps': [[round(a, 3) for a in l[:3]] + [l[3]] for l in lamps]}

# ---------------------------------------------------------------- power
def wood_pole(c, H, tag):
    # a Class 3 western red cedar pole, butt 33 cm tapering to a 22 cm top, roof-cut; its tag at eye height and the ground
    # wire's moulding down one face
    lathe('pole', c, [(0.17, -0.05), (0.165, 1.5), (0.115, H), (0.07, H + 0.04), (0.0, H + 0.06)], (0, 0, 0), POLEW, segs=10, vscale=0.5)
    mk(card('tag', c, 0.1, 0.15, (0, -0.171, 1.65), art(tag, 0.06)))
    bx('moulding', c, (0.035, 0.012, H - 0.6), (0.0, 0.142, 0.3 + (H - 0.6) / 2), ARMW)
    for z in (0.35, H - 1.2): bolt(c, (0, 0.152, z), r=0.008)

def pin_ins(c, p):
    # a porcelain pin insulator on its steel pin: a skirt and two sheds, the wire's groove on top
    rd('pin', c, (p[0], p[1], p[2] - 0.08), (p[0], p[1], p[2] + 0.02), 0.012, GALV, verts=6)
    lathe('ins', c, [(0.0, 0.0), (0.075, 0.0), (0.07, 0.03), (0.04, 0.05), (0.062, 0.07), (0.055, 0.1), (0.03, 0.12), (0.034, 0.15), (0.0, 0.16)], (p[0], p[1], p[2]), PORC, segs=10)
    return [p[0], p[1], p[2] + 0.13]

def spool(c, p):
    lathe('spool', c, [(0, 0), (0.045, 0), (0.035, 0.015), (0.035, 0.065), (0.045, 0.08), (0, 0.08)], (p[0], p[1], p[2] - 0.04), PORC, segs=8, rot=(math.pi / 2, 0, 0))
    return [p[0], p[1] - 0.04, p[2]]

def crossarm(c, z, y):
    # an 8 ft (2.44 m) Douglas fir crossarm on the pole's face, two flat steel braces down to the pole
    bbox('crossarm', c, (2.44, 0.09, 0.115), (0, y, z), ARMW, bev=0.008)
    for s in (-1, 1): rd('brace', c, (s * 0.7, y, z - 0.06), (0, y + 0.02, z - 0.72), 0.012, GALV, verts=4)
    bolt(c, (0, y - 0.046, z), r=0.012)
    return [pin_ins(c, (x, y, z + 0.06)) for x in (-1.08, -0.38, 1.08)]

def secondary_rack(c, z):
    # the low-voltage rack: three spools on a steel strap, on the pole's road side
    bx('rack', c, (0.04, 0.015, 0.75), (0, -0.175, z), GALV)
    return [spool(c, (0, -0.18, z + dz)) for dz in (0.28, 0.0, -0.28)]

@piece('sk_pole', 'Power Pole', 'street_power')
def _(c):
    H = 11.6
    wood_pole(c, H, 'sk_poletag_a')
    wires = crossarm(c, H - 0.75, -0.17)
    wires += secondary_rack(c, H - 3.1)
    return {'wires': [[round(a, 3) for a in w] for w in wires]}

@piece('sk_pole_tx', 'Power Pole (transformer)', 'street_power')
def _(c):
    H = 11.6
    wood_pole(c, H, 'sk_poletag_b')
    wires = crossarm(c, H - 0.75, -0.17)
    wires += secondary_rack(c, H - 3.4)
    # the transformer: a 25 kVA pole-top can on a hanger bracket, its HV bushing and cutout fuse up to the line, three
    # black secondaries down to the rack
    zt = H - 2.6
    bx('hanger', c, (0.08, 0.2, 0.9), (0, 0.24, zt + 0.15), GALV)
    lathe('tank', c, [(0, 0), (0.27, 0), (0.29, 0.04), (0.29, 0.86), (0.3, 0.9), (0.22, 0.94), (0, 0.96)], (0, 0.52, zt - 0.45), GREYP, segs=12)
    for a in (0.0, 1.2, 2.4, 3.6, 4.8): rd('fin', c, (0.29 * math.cos(a), 0.52 + 0.29 * math.sin(a), zt - 0.35), (0.33 * math.cos(a), 0.52 + 0.33 * math.sin(a), zt + 0.35), 0.012, GREYP, verts=4)
    mk(card('kva', c, 0.22, 0.22, (0, 0.52 - 0.3, zt - 0.05), art('sk_txlabel', 0.08)))
    lathe('bushing', c, [(0, 0), (0.05, 0), (0.035, 0.04), (0.05, 0.07), (0.03, 0.11), (0.04, 0.14), (0, 0.16)], (0.08, 0.52, zt + 0.51), PORC, segs=8)
    rd('cutout', c, (1.0, -0.2, H - 1.05), (1.0, -0.26, H - 0.7), 0.02, PORC, verts=6)
    sweep('jumper', c, [(0.08, 0.52, zt + 0.67), (0.6, 0.2, H - 1.0), (1.0, -0.23, H - 0.72), (1.08, -0.17, H - 0.56)], 0.008, DARK, segs=4, per_m=6)
    for k in range(3):
        sweep('sec%d' % k, c, [(-0.15 + k * 0.15, 0.52 - 0.25, zt - 0.2), (-0.2 + k * 0.12, 0.1, zt - 0.7), (0, -0.22, H - 3.4 + 0.28 - k * 0.28)], 0.011, DARK, segs=4, per_m=6)
    return {'wires': [[round(a, 3) for a in w] for w in wires]}

@piece('sk_pole_lv', 'Utility Pole (low voltage)', 'street_power')
def _(c):
    H = 9.4
    wood_pole(c, H, 'sk_poletag_a')
    wires = secondary_rack(c, H - 0.9)
    # a cable TV / phone strand lower down, on its clamp
    bx('clamp', c, (0.06, 0.06, 0.08), (0, -0.19, 5.4), GALV)
    wires.append([0, -0.22, 5.4])
    return {'wires': [[round(a, 3) for a in w] for w in wires]}

@piece('sk_tower', 'Transmission Tower', 'street_power')
def _(c):
    # a 230 kV single-circuit lattice tower: four angle-iron legs tapering in to a waist, braced in each face, a peak
    # with two earth-wire points, two crossarms with V-free hanging insulator strings (12 discs)
    def leg_at(z):
        if z <= 18: return 3.0 - (3.0 - 1.1) * z / 18
        return 1.1 - (1.1 - 0.7) * (z - 18) / 10
    Z = [0, 4, 8, 12, 15.5, 18, 21, 24.5, 28]
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z0, z1 in zip(Z, Z[1:]): rd('leg', c, (sx * leg_at(z0), sy * leg_at(z0), z0), (sx * leg_at(z1), sy * leg_at(z1), z1), 0.13, GALV, verts=4)
    for z0, z1 in zip(Z, Z[1:]):
        a0, a1 = leg_at(z0), leg_at(z1)
        for s in (-1, 1):   # (X braces in all four faces)
            rd('br', c, (-a0, s * a0, z0), (a1, s * a1, z1), 0.055, GALV, verts=4); rd('br', c, (a0, s * a0, z0), (-a1, s * a1, z1), 0.055, GALV, verts=4)
            rd('br', c, (s * a0, -a0, z0), (s * a1, a1, z1), 0.055, GALV, verts=4); rd('br', c, (s * a0, a0, z0), (s * a1, -a1, z1), 0.055, GALV, verts=4)
        for s in (-1, 1): rd('hz', c, (-a1, s * a1, z1), (a1, s * a1, z1), 0.06, GALV, verts=4); rd('hz', c, (s * a1, -a1, z1), (s * a1, a1, z1), 0.06, GALV, verts=4)
    wires = []
    for za, reach in ((18.0, 6.2), (21.0, 4.8)):
        a = leg_at(za)
        for s in (-1, 1):
            for sy in (-1, 1): rd('arm', c, (s * a, sy * a, za), (s * reach, sy * 0.25, za), 0.09, GALV, verts=4); rd('armd', c, (s * a, sy * a, za + 1.6), (s * reach, sy * 0.25, za), 0.06, GALV, verts=4)
            # the insulator string: 12 glass discs down from the arm's tip
            rd('string', c, (s * (reach - 0.2), 0, za), (s * (reach - 0.2), 0, za - 2.2), 0.015, GALV, verts=4)
            for k in range(12): disc('disc', c, (s * (reach - 0.2), 0, za - 0.25 - k * 0.15), 0.13, PORC, segs=8, t=0.03, axis='z')
            wires.append([s * (reach - 0.2), 0, za - 2.25])
    for s in (-1, 1): rd('peak', c, (s * 0.7, 0, 28), (s * 0.4, 0, 29.4), 0.05, GALV, verts=4); wires.append([s * 0.4, 0, 29.4])
    for sx in (-1, 1):   # (the footings)
        for sy in (-1, 1): bbox('footing', c, (0.8, 0.8, 0.5), (sx * 3.0, sy * 3.0, 0.1), CONC, bev=0.04)
    return {'wires': [[round(a, 3) for a in w] for w in wires]}

# ---------------------------------------------------------------- gates (across a driveway: the gate along X)
@piece('sk_gate_ranch', 'Ranch Gate', 'street_gate', len=4.6)
def _(c):
    # a 14 ft galvanized tube farm gate on two treated round posts: five rails, uprights, a diagonal brace, two strap
    # hinges, a chain latch
    W = 4.27
    for x in (-W / 2 - 0.15, W / 2 + 0.15):
        lathe('post', c, [(0.11, -0.05), (0.11, 1.55), (0.09, 1.62), (0, 1.64)], (x, 0, 0), POLEW, segs=10, vscale=0.5)
    x0, x1 = -W / 2, W / 2
    for k, z in enumerate((0.22, 0.47, 0.72, 0.97, 1.27)): rd('rail', c, (x0, 0, z), (x1, 0, z), 0.021, GALV, verts=6)
    for x in (x0, x1): rd('upright', c, (x, 0, 0.18), (x, 0, 1.3), 0.024, GALV, verts=6)
    rd('brace', c, (x0 + 0.1, 0, 0.25), (x0 + W * 0.45, 0, 1.25), 0.016, GALV, verts=6)
    rd('brace2', c, (x0 + W * 0.45, 0, 1.25), (x0 + W * 0.45, 0, 0.22), 0.016, GALV, verts=6)
    for z in (0.3, 1.15): bbox('hinge', c, (0.22, 0.05, 0.04), (x0 - 0.06, 0, z), GALV, bev=0.008)
    sweep('chain', c, [(x1, 0, 1.0), (x1 + 0.09, -0.08, 0.9), (x1 + 0.18, -0.1, 0.98)], 0.007, IRON, segs=4, per_m=20)

@piece('sk_gate_iron', 'Iron Driveway Gate', 'street_gate', len=5.2)
def _(c):
    # a double wrought-iron gate between stucco pillars with caps: pickets every 13 cm with spear finials, an arched top
    # rail, two flat bars below, a drop rod
    W = 4.0
    for x in (-W / 2 - 0.3, W / 2 + 0.3):
        bbox('pillar', c, (0.5, 0.5, 1.85), (x, 0, 0.925), STUCCO, bev=0.02)
        bbox('cap', c, (0.62, 0.62, 0.1), (x, 0, 1.9), CONC, bev=0.02)
        lathe('ball', c, [(0, 0), (0.12, 0), (0.14, 0.06), (0.12, 0.17), (0, 0.22)], (x, 0, 1.95), CONC, segs=8)
    for leaf in (-1, 1):
        xa, xb = (-W / 2, -0.02) if leaf < 0 else (0.02, W / 2)
        arch = lambda x: 1.5 + 0.22 * math.sin(math.pi * (x - xa) / (xb - xa))
        sweep('top', c, [(xa + (xb - xa) * k / 6, 0, arch(xa + (xb - xa) * k / 6)) for k in range(7)], 0.018, IRON, segs=4, per_m=4)
        for z in (0.12, 0.95): rd('bar', c, (xa, 0, z), (xb, 0, z), 0.02, IRON, verts=4)
        n = int((xb - xa) / 0.13)
        for k in range(n + 1):
            x = xa + (xb - xa) * k / n; top = arch(x)
            rd('picket', c, (x, 0, 0.08), (x, 0, top + 0.12), 0.011, IRON, verts=4)
            lathe('finial', c, [(0, 0), (0.025, 0.02), (0.0, 0.1)], (x, 0, top + 0.12), IRON, segs=4)
        rd('drop', c, (xb - leaf * 0.15, 0.03, 0.0), (xb - leaf * 0.15, 0.03, 0.6), 0.01, IRON, verts=4)

# ---------------------------------------------------------------- the railroad
@piece('sk_xing', 'Railroad Crossing Signal', 'street_rail')
def _(c):
    # a crossbuck with flashing-light signal: galvanized mast on its foundation, the RAILROAD CROSSING blades, a cross
    # arm with two 12 in red lights under hoods on black backgrounds, a bell on top, the relay case by its foot
    lamps = []
    lathe('found', c, [(0, 0), (0.35, 0), (0.35, 0.2), (0, 0.2)], (0, 0, 0), CONC, segs=10)
    lathe('mast', c, [(0.065, 0.2), (0.065, 4.2), (0.0, 4.22)], (0, 0, 0), GALV, segs=10, vscale=0.5)
    m = art('sk_crossbuck', 0.08)
    for k, ang in enumerate((math.pi / 4, -math.pi / 4)):
        o = card('blade%d' % k, c, 1.22, 0.23, (0, -0.075 - k * 0.01, 3.62), m); G.BUILT.append(o)
        for d in o.data.uv_layers[0].data: d.uv = (d.uv[0], d.uv[1] * 0.5 + (0.5 if k == 0 else 0.0))
        o.data.transform(Matrix.Translation((0, 0, -0.115))); o.rotation_euler = (0, ang, 0); o.location.z = 3.62
        bpy.context.view_layer.update(); o.data.transform(o.matrix_basis); o.matrix_basis = Matrix()
        # (its plain aluminium back, so the words don't show through mirrored)
        b = bx('bladeback%d' % k, c, (1.22, 0.008, 0.23), (0, -0.075 - k * 0.01 + 0.006, 3.62), ALU, rot=(0, ang, 0))
    bbox('crossarm', c, (1.15, 0.08, 0.1), (0, -0.1, 2.75), GALV, bev=0.01)
    for s in (-1, 1):
        x = s * 0.45
        disc('back', c, (x, -0.13, 2.75), 0.3, BLACKP, segs=14, t=0.012)
        disc('lens', c, (x, -0.17, 2.75), 0.15, LENS['r'], segs=12, t=0.02)
        visor('hood', c, (x, -0.17, 2.75), 0.18, 0.22, BLACKP)
        lamps.append([x, -0.2, 2.75, 'r'])
    lathe('bell', c, [(0, 0), (0.14, 0), (0.15, 0.04), (0.1, 0.16), (0, 0.18)], (0, 0, 4.22), BLACKP, segs=10)
    bbox('case', c, (0.5, 0.4, 0.75), (0.6, 0.35, 0.375 + 0.05), GREYP, bev=0.02)
    return {'lamps': [[round(a, 3) for a in l[:3]] + [l[3]] for l in lamps]}

@piece('sk_rail', 'Railroad Track', 'street_line', len=6.0)
def _(c):
    # 6 m of standard-gauge track: a ballast bed, ten treated ties every 0.6 m, two rails (head, web, foot) on tie plates
    L = 6.0
    me = bpy.data.meshes.new('ballast')
    prof = [(-2.3, 0.0), (-1.6, 0.33), (1.6, 0.33), (2.3, 0.0)]
    verts = [(-L / 2, y, z) for y, z in prof] + [(L / 2, y, z) for y, z in prof]
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 2, 1, 0), (4, 5, 6, 7)]
    me.from_pydata(verts, [], faces); me.validate(); me.update(); G.uv_world(me, Matrix.Identity(4), 1.0); G._obj('ballast', c, me, BALLAST)
    for k in range(10):
        x = -L / 2 + 0.3 + k * 0.6
        bbox('tie', c, (0.23, 2.6, 0.18), (x, 0, 0.36), TIE, bev=0.01)
        for s in (-1, 1): bx('plate', c, (0.19, 0.34, 0.02), (x, s * 0.7175, 0.46), RAILS)
    for s in (-1, 1):
        y = s * 0.7175
        bx('foot', c, (L, 0.14, 0.02), (0, y, 0.48), RAILS)
        bx('web', c, (L, 0.018, 0.1), (0, y, 0.54), RAILS)
        bx('head', c, (L, 0.07, 0.04), (0, y, 0.61), RAILS)
        bx('top', c, (L, 0.055, 0.004), (0, y, 0.632), RAILTOP)

# ---------------------------------------------------------------- road barriers (a section of each, along X)
def wbeam(c, x0, x1, z, y, name='wbeam'):
    # the W-beam's section (12 in deep, two humps), along X
    prof = [(0.0, -0.155), (0.06, -0.11), (0.08, -0.06), (0.03, -0.01), (0.03, 0.01), (0.08, 0.06), (0.06, 0.11), (0.0, 0.155),
            (0.004, 0.155), (0.064, 0.11), (0.084, 0.06), (0.034, 0.01), (0.034, -0.01), (0.084, -0.06), (0.064, -0.11), (0.004, -0.155)]
    n = len(prof); verts = [(x0, y - a, z + b) for a, b in prof] + [(x1, y - a, z + b) for a, b in prof]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate(); me.update(); G.uv_world(me, Matrix.Identity(4), 1.0)
    return G._obj(name, c, me, GALV)

@piece('sk_guardrail', 'Guard Rail', 'street_line', len=3.81)
def _(c):
    # one 12.5 ft section of W-beam on two steel posts (6 ft 3 in apart) with wooden blockouts, the splice bolts
    L = 3.81
    wbeam(c, -L / 2, L / 2 + 0.3, 0.55, -0.2)
    for x in (-L / 2 + 0.15, 0.15):
        bbox('post', c, (0.1, 0.15, 0.75), (x, 0.05, 0.375), GALV, bev=0.008)
        bbox('blockout', c, (0.15, 0.2, 0.36), (x, -0.1, 0.55), ARMW, bev=0.01)
        bolt(c, (x, -0.29, 0.55), r=0.014)
    for z in (0.47, 0.63):
        for dx in (0.06, 0.16): bolt(c, (L / 2 + dx, -0.285, z), r=0.011)

@piece('sk_guardrail_end', 'Guard Rail End', 'street_line', len=3.81)
def _(c):
    # the turned-down end: the rail bends down into the ground over its last section, its end marker (OM-3) beside it
    L = 3.81
    pts = [(L / 2 + 0.3, -0.2, 0.55), (0.0, -0.2, 0.55), (-L / 2 + 0.6, -0.25, 0.3), (-L / 2, -0.3, -0.05)]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        o = wbeam(c, 0, 1, 0, 0, 'end%d' % k); me = o.data
        for v in me.vertices:   # (each piece of beam stretched from a to b)
            t = v.co.x; v.co.x = a[0] + (b[0] - a[0]) * t; v.co.y += a[1] + (b[1] - a[1]) * t; v.co.z += a[2] + (b[2] - a[2]) * t
    for x in (0.15,):
        bbox('post', c, (0.1, 0.15, 0.75), (x, 0.05, 0.375), GALV, bev=0.008)
        bbox('blockout', c, (0.15, 0.2, 0.36), (x, -0.1, 0.55), ARMW, bev=0.01)
    bbox('mpost', c, (0.05, 0.05, 1.3), (-L / 2 + 0.2, -0.6, 0.65), GALV, bev=0.004)
    o = card('marker', c, 0.3, 0.9, (-L / 2 + 0.2, -0.63, 0.35), art('sk_endmark', 0.08)); G.BUILT.append(o)

@piece('sk_jersey', 'Jersey Barrier', 'street_line', len=3.05)
def _(c):
    # a 10 ft precast concrete New Jersey barrier: its safety-shape profile, chamfered ends, lifting slots, steel
    # pin-and-loop connectors
    L = 3.05
    prof = [(-0.305, 0), (-0.305, 0.075), (-0.235, 0.33), (-0.075, 0.81), (0.075, 0.81), (0.235, 0.33), (0.305, 0.075), (0.305, 0)]
    n = len(prof); x0, x1 = -L / 2, L / 2
    verts = [(x0, y, z) for y, z in prof] + [(x1, y, z) for y, z in prof]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n - 1)]
    me = bpy.data.meshes.new('jersey'); me.from_pydata(verts, [], faces); me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-6], offset=0.02, segments=1, affect='EDGES')
    bm.to_mesh(me); bm.free(); G.uv_world(me, Matrix.Identity(4), 0.8); o = G._obj('jersey', c, me, JERSEY); G.grid_out(o, 0.4)
    for x in (-0.75, 0.75):
        for s in (-1, 1): bx('slot', c, (0.25, 0.005, 0.08), (x, s * 0.13, 0.7), DARK, rot=(s * -0.34, 0, 0))
    for z in (0.2, 0.6):
        lathe('loop', c, [(0.03, 0), (0.035, 0), (0.035, 0.06), (0.03, 0.06)], (x1 + 0.02, 0, z), GALV, segs=6, rot=(0, math.pi / 2, 0))
    rd('pin', c, (x1 + 0.03, 0, 0.12), (x1 + 0.03, 0, 0.7), 0.012, GALV, verts=6)

@piece('sk_bollard', 'Bollard', 'street_bollard')
def _(c):
    # a 6 in steel pipe bollard filled with concrete, a domed top, safety yellow with two reflective bands
    lathe('pipe', c, [(0.085, -0.05), (0.085, 1.05), (0.07, 1.1), (0.0, 1.12)], (0, 0, 0), YELP, segs=12, vscale=1)
    for z in (0.85, 0.95): lathe('band', c, [(0.087, 0), (0.087, 0.05)], (0, 0, z), WHITEP, segs=12, cap0=False, cap1=False)
    lathe('collar', c, [(0, 0), (0.16, 0), (0.12, 0.03), (0, 0.035)], (0, 0, 0), CONC, segs=10)

@piece('sk_fence_wood', 'Board Fence', 'street_line', len=2.44)
def _(c):
    # an 8 ft panel of 6 ft good-neighbour fence: a 4x4 post, three 2x4 rails, boards alternating either side, a cap
    L = 2.44; H = 1.83
    bbox('post', c, (0.09, 0.09, H + 0.1), (-L / 2, 0, (H + 0.1) / 2), ARMW, bev=0.006)
    for z in (0.25, 0.95, 1.65): bx('rail', c, (L, 0.04, 0.09), (0, 0, z), ARMW)
    n = 16
    for k in range(n):
        x = -L / 2 + 0.08 + k * (L - 0.1) / n; s = 1 if k % 2 else -1
        bx('board', c, (0.14, 0.016, H - 0.08), (x, s * 0.03, 0.05 + (H - 0.08) / 2), PLANK)
    bx('cap', c, (L, 0.14, 0.035), (0, 0, H + 0.0), ARMW)

@piece('sk_wall_cmu', 'Block Wall', 'street_line', len=2.44)
def _(c):
    # an 8 ft run of 6 ft concrete block wall on a footing, a pilaster at one end and a cap course
    L = 2.44; H = 1.8
    o = bbox('wall', c, (L, 0.2, H), (0, 0, H / 2), CMU, bev=0.006); G.retile(o, 0.6); G.grid_out(o, 0.4)
    bbox('pilaster', c, (0.4, 0.4, H + 0.06), (-L / 2, 0, (H + 0.06) / 2), CMU, bev=0.008)
    bbox('cap', c, (L, 0.26, 0.06), (0, 0, H + 0.03), CONC, bev=0.008)
    bbox('pcap', c, (0.46, 0.46, 0.07), (-L / 2, 0, H + 0.095), CONC, bev=0.008)

# ---------------------------------------------------------------- bake, check, export
def finish(pid, P):
    c = P['coll']
    G.BUILT[:] = [o for o in c.objects if o.type == 'MESH']   # (every part: one left out of the bake would be black)
    G.bake_ao(c, wall=False, distance=0.4, samples=32)
    objs = [o for o in c.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.active_object; o.name = pid + '_src'
    return o

entries = []
ex = bpy.data.scenes.new('EXPORT')
for pid, P in PIECES.items():
    o = finish(pid, P)
    me = o.data.copy(); me.transform(o.matrix_world)
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    line = P['cls'] == 'street_line' or P['cls'] == 'street_gate'
    cx, cyy = (0.0, 0.0) if line or P['extra'].get('wires') or P['extra'].get('lamps') else ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    z0 = 0.0
    me.transform(Matrix.Translation(Vector((-cx, -cyy, -z0))))
    e2 = bpy.data.objects.new(pid, me); ex.collection.objects.link(e2)
    me.color_attributes.active_color = me.color_attributes.get('AO')
    tri = sum(len(p.vertices) - 2 for p in me.polygons)
    ent = {'cat': 'street', 'cls': P['cls'], 'tags': ['street'], 'id': pid, 'pack': 'streetkit', 'label': P['label'],
           'w': round(max(xs) - min(xs), 2), 'h': round(max(zs) - min(zs), 2), 'd': round(max(ys) - min(ys), 2), 'tris': tri, 'ao': 1}
    conv = lambda p: [round(p[0] - cx, 3), round(p[2] - z0, 3), round(-(p[1] - cyy), 3)] + list(p[3:])   # (Blender -> library space)
    for k in ('wires', 'lamps'):
        if P['extra'].get(k): ent[k] = [conv(p) for p in P['extra'][k]]
    if P['extra'].get('len'): ent['len'] = P['extra']['len']
    entries.append(ent)
    print(f'{pid:18s} {tri:6d} tris  {ent["w"]} x {ent["d"]} x {ent["h"]} m' + (f'  wires {len(ent["wires"])}' if 'wires' in ent else '') + (f'  lamps {len(ent["lamps"])}' if 'lamps' in ent else ''), flush=True)

if '--blend' in args:
    p = os.path.join(OUTDIR, 'streetkit.blend'); bpy.ops.wm.save_as_mainfile(filepath=p); print('saved', p)

out_glb = os.path.join(ROOT, 'assets', 'env', 'streetkit.glb'); cat_p = os.path.join(ROOT, 'assets', 'env', 'catalog.json')
if '--no-export' not in args:
    win = bpy.context.window
    if win: win.scene = ex
    with bpy.context.temp_override(scene=ex):
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=False, use_active_scene=True, export_apply=True,
                                  export_yup=True, export_image_format='WEBP', export_texcoords=True, export_normals=True,
                                  export_vertex_color='ACTIVE', export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
    import shutil
    q = out_glb + '.q.glb'
    try:
        subprocess.run(['npx', '-y', '@gltf-transform/cli@4.1.1', 'quantize', out_glb, q], check=True, cwd=GEN, capture_output=True, timeout=300)
        shutil.move(q, out_glb)
    except Exception as e: print('(not quantized:', e, ')')
    cat = json.load(open(cat_p))
    cat['packs']['streetkit'] = {'title': 'San Velocita street kit (tools/props/streetkit.py)', 'author': 'San Velocita GP', 'license': 'own', 'source': ''}
    keep = [a for a in cat['assets'] if a.get('pack') != 'streetkit' or (ONLY and a['id'] not in ONLY)]
    cat['assets'] = keep + entries
    open(cat_p, 'w').write(json.dumps(cat, indent=1, ensure_ascii=False))
    print('streetkit', len(entries), 'pieces', round(os.path.getsize(out_glb) / 1024), 'KB', flush=True)
