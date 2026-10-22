# The modular grandstand kit: three heights of stand built from 12 m bays, so a stand can be any length.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/props/grandstands.py -- [--blend] [--only S,M,L]
#
# Heights (each one: a straight bay, a bay with a tunnel entrance, and a left and right end with a stair tower):
#   S  club stand: 10 rows on an open steel frame, no roof (~5 m)
#   M  main stand: 18 rows on concrete rakers, a cantilever roof with a sponsor fascia, clad back (~16 m)
#   L  the big one: a 15-row lower deck, a glass-fronted hospitality level with a balcony, a 14-row upper deck above it,
#      a 17 m cantilever roof (~27 m), the size of the stands on the front straights of Indy, Suzuka, COTA
#
# Built in Blender's own space with the track side down -Y (the front of the stand at y = 0, going back +Y), the bay
# running along X from -6 to 6 (end caps beside it: the left one at x < 0, the right one at x > 0), the ground at z = 0.
# The export (later: the env library, front +Z) recentres them. Every seat is recorded (GS_SEATS in the .blend's text,
# and models/trackside/grandstands.json): the crowd sits a fan on each.
#
# Seats run every 0.5 m along a row with one 1.5 m aisle per bay, so a line of bays reads as one stand: the seat
# pattern carries on over the joins. Every custom surface is a PSX tile with grime (tools/garagelib.py) and AO baked
# into vertex colours.
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
bpy.ops.wm.read_factory_settings(use_empty=True)
import garagelib as G
from garagelib import bbox, bx, cy, rd, sweep, lathe, mk, grimy_tile, plain_mat, solid_mat, mat_img, cutout_mat, px_tex, save

ROOT = G.ROOT
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = next((a.split('=')[1] if '=' in a else args[args.index(a) + 1] for a in args if a.startswith('--only')), 'S,M,L').split(',')
OUTDIR = os.path.join(ROOT, 'models', 'trackside'); os.makedirs(OUTDIR, exist_ok=True)
GEN = os.path.join(OUTDIR, 'src', 'grandstand_gen')
G.configure(GEN, seed=2026)
G.TEX = os.path.join(ROOT, 'models', 'garage', 'src', 'psx_industrial')

BAY = 12.0          # one bay along X
AISLE = 0.75        # the aisle's half width (seats from 1.0 m either side of it, every 0.5 m, carrying on over the joins)
PITCH = 0.5
SEATS_X = sorted(((1.0 + PITCH * i + 6) % BAY) - 6 for i in range(21))   # -6.0 .. 5.5

# ---------------------------------------------------------------- the stands, as numbers
# a deck: its gangway (floor z, from y_g to y0), then n rows (tread deep, rise high) from y0
SPEC = {
  'S': dict(label='Club Grandstand', decks=[dict(z=1.1, yg=0.35, y0=1.4, n=10, tread=0.8, rise=0.36)],
            roof=None, back='frame', tunnel_rows=7, frames=(-4, 0, 4)),
  'M': dict(label='Main Grandstand', decks=[dict(z=2.4, yg=0.35, y0=1.7, n=18, tread=0.85, rise=0.44)],
            roof=dict(zb=14.6, zf=15.4, yf=1.2, depth_b=2.6, depth_f=0.7), back='clad', tunnel_rows=6, frames=(-4, 0, 4)),
  'L': dict(label='Grand Stand', decks=[dict(z=2.6, yg=0.35, y0=1.7, n=15, tread=0.85, rise=0.40),
                                        dict(z=13.2, yg=14.75, y0=16.3, n=14, tread=0.85, rise=0.54)],
            vip=dict(z=8.6, yb=14.45, yglass=16.1, top=12.5, slab=13.2),
            roof=dict(zb=26.0, zf=27.2, yf=12.6, depth_b=3.6, depth_f=0.8), back='clad', tunnel_rows=7, frames=(-4, 0, 4)),
}
for k, s in SPEC.items():
    d = s['decks'][-1]; s['yback'] = d['y0'] + d['n'] * d['tread']; s['ztop'] = d['z'] + d['n'] * d['rise']
    s['depth'] = s['yback'] + 0.35

def rows(d):   # [(y front, y back, floor z)] of a deck's rows
    return [(d['y0'] + k * d['tread'], d['y0'] + (k + 1) * d['tread'], d['z'] + (k + 1) * d['rise']) for k in range(d['n'])]

# ---------------------------------------------------------------- materials
M = {}
def mats():
    M['conc'] = grimy_tile('GS_Concrete', 'concrete_02.png', dirt=0.28)
    M['conc_floor'] = grimy_tile('GS_ConcreteFloor', 'dirty_concrete.png', dirt=0.3)
    M['steel'] = grimy_tile('GS_Steel', 'painted_metal.png', dirt=0.22, tint=(0.36, 0.40, 0.46))
    M['galv'] = grimy_tile('GS_Galv', 'galvanized_metal.png', dirt=0.15)
    M['roof'] = grimy_tile('GS_Roof', 'corrugated_metal.png', dirt=0.2, tint=(0.78, 0.80, 0.82))
    M['clad'] = grimy_tile('GS_Clad', 'corrugated_metal.png', dirt=0.18, tint=(0.70, 0.72, 0.76))
    M['clad_band'] = plain_mat('GS_CladBand', (0.62, 0.07, 0.05), dirt=0.12)    # the team band along the back
    M['seat'] = plain_mat('GS_Seat', (0.08, 0.20, 0.55), dirt=0.08, rough=0.45)    # (the game can recolour this)
    M['seat_faded'] = plain_mat('GS_SeatFaded', (0.16, 0.29, 0.58), dirt=0.12, rough=0.6)   # sun-bleached ones
    M['nosing'] = plain_mat('GS_Nosing', (0.86, 0.70, 0.08), dirt=0.2)
    M['white'] = plain_mat('GS_White', (0.86, 0.87, 0.86), dirt=0.14)
    M['dark'] = solid_mat('GS_Dark', (0.025, 0.025, 0.028), rough=0.9)
    M['glass'] = plain_mat('GS_Glass', (0.10, 0.17, 0.22), dirt=0.05, fleck=0.01, rough=0.08)
    M['lamp'] = solid_mat('GS_LampLens', (0.95, 0.93, 0.85), rough=0.2)
    M['rubber'] = plain_mat('GS_Rubber', (0.07, 0.07, 0.07), dirt=0.05)
    # roller shutters: horizontal slats, light grey
    n = 64; sl = np.ones((n, n, 3), np.float32) * np.array([0.62, 0.64, 0.66], np.float32); sl[::4] *= 0.7; sl[1::4] *= 0.86
    M['shutter'] = mat_img('GS_Shutter', save('GS_Shutter', G.grime(sl, np.clip(G.fbm(n, n, (32, 8), wrap=True) - 0.4, 0, 1) * 0.5)))
    # see-through steel mesh (the small stand's back and the stair towers' sides)
    n = 64; a = np.ones((n, n), np.float32) * 0.0; a[::8, :] = 1; a[:, ::8] = 1; a[1::8, :] = 1; a[:, 1::8] = 1
    col = np.ones((n, n, 3), np.float32) * np.array([0.42, 0.44, 0.46], np.float32)
    M['mesh'] = cutout_mat('GS_Mesh', col, a)
    M['boards'] = boards_mat()
    M['flag'] = M['boards'].copy(); M['flag'].name = 'GS_Flag'; M['flag'].use_backface_culling = False

# The sponsor boards: one atlas of eight panels (4 x 2, each 4:1), the game's own sponsors on their colours
BOARDS = [('volta-cola', 'main', (0.97, 0.96, 0.92)), ('apex-energy', 'white', (0.08, 0.08, 0.09)),
          ('svgp', 'white', (0.80, 0.10, 0.05)), ('triton-watches', 'main', (0.95, 0.95, 0.95)),
          ('neon-fm', 'white', (0.10, 0.12, 0.30)), ('dales-tire-and-lube', 'main', (0.97, 0.85, 0.15)),
          ('kobra', 'white', (0.06, 0.32, 0.18)), ('gold-coast-airlines', 'main', (0.96, 0.96, 0.94))]
def boards_mat():
    cw, ch = 256, 64; W, H = cw * 4, ch * 2; out = np.zeros((H, W, 3), np.float32)
    for k, (key, var, bg) in enumerate(BOARDS):
        cx, cyy = (k % 4) * cw, (1 - k // 4) * ch   # (row 0 of pixels is the bottom)
        cell = np.ones((ch, cw, 3), np.float32) * np.array(bg, np.float32)
        im = bpy.data.images.load(os.path.join(ROOT, 'assets', 'sponsors', key, var + '.webp'))
        w, h = im.size; px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
        s = min((cw - 24) / w, (ch - 10) / h); tw, th = int(w * s), int(h * s)
        sm = G.resample(px, th, tw); ox, oy = (cw - tw) // 2, (ch - th) // 2
        a = sm[..., 3:4]; cell[oy:oy + th, ox:ox + tw] = cell[oy:oy + th, ox:ox + tw] * (1 - a) + sm[..., :3] * a
        cell[:2] *= 0.55; cell[-2:] *= 0.55   # (a dark edge top and bottom: the frame)
        out[cyy:cyy + ch, cx:cx + cw] = cell
    out = G.grime(out, np.clip(G.fbm(H, W, (64, 16, 4)) - 0.5, 0, 1) * 0.35)
    return mat_img('GS_Boards', save('GS_Boards', out), rough=0.6)

def board(name, coll, x0, x1, z0, z1, y, k, face=-1):
    # a flat sponsor board from x0 to x1 (any number of panels along it), facing -Y (face=-1) or +Y; k: first panel
    L = x1 - x0; n = max(1, round(L / ((z1 - z0) * 4))); w = L / n; vs, fs, uvs = [], [], []
    for i in range(n):
        c = (k + i) % 8; u0, v0 = (c % 4) / 4, (1 - c // 4) / 2
        xa, xb = x0 + i * w, x0 + (i + 1) * w
        if face > 0: xa, xb = xb, xa
        b = len(vs); vs += [(xa, y, z0), (xb, y, z0), (xb, y, z1), (xa, y, z1)]
        uvs += [(u0 + 0.002, v0 + 0.004), (u0 + 0.248, v0 + 0.004), (u0 + 0.248, v0 + 0.496), (u0 + 0.002, v0 + 0.496)]
        fs.append((b, b + 1, b + 2, b + 3))
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs)
    uv = me.uv_layers.new()
    for f in me.polygons:
        for li in f.loop_indices: uv.data[li].uv = uvs[me.loops[li].vertex_index]
    return G._obj(name, coll, me, M['boards'])

# ---------------------------------------------------------------- a mesh builder (terraces, seats: thousands of faces)
class Build:
    def __init__(s): s.v, s.f, s.m = [], [], []
    def quad(s, pts, mi=0):
        b = len(s.v); s.v += [tuple(p) for p in pts]; s.f.append(tuple(range(b, b + len(pts)))); s.m.append(mi)
    def box(s, lo, hi, mi=0, skip=()):
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        F = {'-z': [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], '+z': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
             '-y': [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], '+y': [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)],
             '-x': [(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], '+x': [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]}
        for k, p in F.items():
            if k not in skip: s.quad(p, mi)
    def obj(s, name, coll, mlist, uvs=0.5):
        me = bpy.data.meshes.new(name); me.from_pydata(s.v, [], s.f)
        for m in mlist: me.materials.append(m)
        for p, mi in zip(me.polygons, s.m): p.material_index = mi
        me.validate(); me.update(); G.uv_world(me, Matrix.Identity(4), uvs)
        o = bpy.data.objects.new(name, me); coll.objects.link(o); return mk(o)

# a seat: a moulded bucket on a pedestal, front edge at y = 0 facing -Y, sitting on the tread at z = 0
SEAT = None
def seat_template():
    # (light: there are hundreds a bay. Pan top and lip, the back's face in three facets (curved round the sides), its
    # rear and top, and the pedestal's front: 16 triangles)
    b = Build(); w, pz, pd = 0.44, 0.42, 0.40
    b.quad([(-w / 2, 0.0, pz), (w / 2, 0.0, pz), (w / 2, pd, pz), (-w / 2, pd, pz)][::-1], 0)                               # pan
    b.quad([(-w / 2 + 0.02, -0.025, pz - 0.07), (w / 2 - 0.02, -0.025, pz - 0.07), (w / 2, 0.0, pz), (-w / 2, 0.0, pz)], 0)   # (the lip)
    t = math.radians(14); bb, bh, th = pd - 0.04, 0.44, 0.035
    def P(x, h, d): return (x, bb + math.sin(t) * h + d, pz + math.cos(t) * h)
    for (xa, xb, da, db) in ((-w / 2, -w / 2 + 0.07, -0.05, 0.0), (-w / 2 + 0.07, w / 2 - 0.07, 0.0, 0.0), (w / 2 - 0.07, w / 2, 0.0, -0.05)):
        b.quad([P(xa, -0.02, da), P(xb, -0.02, db), P(xb, bh, db), P(xa, bh, da)], 0)                               # face
    b.quad([P(w / 2, -0.02, th), P(-w / 2, -0.02, th), P(-w / 2, bh, th), P(w / 2, bh, th)], 0)                       # rear
    b.quad([P(-w / 2, bh, -0.05), P(w / 2, bh, -0.05), P(w / 2, bh, th), P(-w / 2, bh, th)], 0)                       # top
    b.quad([(-0.04, 0.16, 0.0), (0.04, 0.16, 0.0), (0.04, 0.16, pz - 0.01), (-0.04, 0.16, pz - 0.01)], 1)            # pedestal
    return b

def add_seats(b, xs, y, z, rng, seats_out, mi_seat=0, mi_faded=1, mi_post=2):
    for x in xs:
        mi = mi_faded if rng.random() < 0.07 else mi_seat
        base = len(b.v)
        for (px, py, pz) in SEAT.v: b.v.append((px + x, py + y, pz + z))
        for f, m in zip(SEAT.f, SEAT.m): b.f.append(tuple(i + base for i in f)); b.m.append(mi_post if m == 1 else mi)
        seats_out.append((x, y + 0.2, z + 0.42))

# ---------------------------------------------------------------- the pieces
def terrace(name, coll, d, x0, x1, cut=None, front_face=True):
    # a deck's stepped concrete across x0..x1: gangway, then each row's riser and tread, split every metre (for the AO);
    # cut: (xa, xb, rows) leaves those first rows out between xa and xb (the tunnel)
    b = Build(); R = rows(d); xs = [x0] + [float(x) for x in range(math.floor(x0) + 1, math.ceil(x1))] + [x1]
    if cut: xs = sorted(set(xs) | {cut[0], cut[1]})
    for xa, xb in zip(xs, xs[1:]):
        inc = cut and xa >= cut[0] - 1e-6 and xb <= cut[1] + 1e-6
        b.quad([(xa, d['yg'], d['z']), (xb, d['yg'], d['z']), (xb, d['y0'], d['z']), (xa, d['y0'], d['z'])][::-1], 0)   # gangway
        zprev = d['z']
        for k, (ya, yb, z) in enumerate(R):
            if inc and k < cut[2]: zprev = z; continue
            if inc and k == cut[2]: zprev = d['z']   # (the tunnel's mouth: the riser goes down to the gangway)
            b.quad([(xa, ya, zprev), (xb, ya, zprev), (xb, ya, z), (xa, ya, z)], 0)     # riser
            b.quad([(xa, ya, z), (xb, ya, z), (xb, yb, z), (xa, yb, z)][::-1], 1)       # tread
            zprev = z
    # (faces: the builder's winding is checked below)
    o = b.obj(name, coll, [M['conc'], M['conc_floor']])
    fix_normals(o); return o

def fix_normals(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # (open meshes: point everything towards the front/top, where it's seen from)
    for f in bm.faces:
        n = f.normal
        if (abs(n.z) > 0.7 and n.z < 0) or (abs(n.y) > 0.7 and n.y > 0): f.normal_flip()
    bm.to_mesh(o.data); bm.free()

def aisle(coll, d, name, cut=None):
    # the aisle down the middle: two steps a row (a half-height step on each tread), yellow nosings, a handrail
    b = Build(); R = rows(d); a = AISLE - 0.1
    for k, (ya, yb, z) in enumerate(R):
        if cut and k < cut: continue
        ym, zm = (ya + yb) / 2, z + d['rise'] / 2
        b.box((-a, ym, z), (a, yb, zm), 0, skip=('-z', '+y'))
        b.box((-a, ya - 0.0, z - 0.004), (a, ya + 0.06, z + 0.006), 1, skip=('-z',))    # nosing on the row's edge
        b.box((-a, ym, zm - 0.004), (a, ym + 0.06, zm + 0.006), 1, skip=('-z',))        # and on the half step
    o = b.obj(name + '_steps', coll, [M['conc'], M['nosing']])
    # handrail down the middle: posts every three rows, a rail on top
    start = cut or 0; P = []
    for k in range(start, d['n'], 3):
        ya, yb, z = R[k]; y = (ya + yb) / 2
        rd(f'{name}_post{k}', coll, (0, y, z + d['rise'] / 2), (0, y, z + d['rise'] / 2 + 0.95), 0.025, M['galv'], verts=6)
        P.append((0, y, z + d['rise'] / 2 + 0.95))
    if len(P) > 1:
        sweep(f'{name}_rail', coll, P, 0.025, M['galv'], segs=6, per_m=1)
    return o

def railing(name, coll, pts, h=1.05, post=1.5, rails=(0.5,), mat=None):
    # a steel railing along a polyline on the floor (pts at floor height): posts, a top rail, mid rails
    mat = mat or M['galv']; P = [Vector(p) for p in pts]
    for i, (a, b) in enumerate(zip(P, P[1:])):
        n = max(1, round((b - a).length / post))
        for k in range(n + (1 if i == len(P) - 2 else 0)):
            p = a + (b - a) * (k / n); rd(f'{name}_p{i}_{k}', coll, p, p + Vector((0, 0, h)), 0.022, mat, verts=6)
    for r in (h,) + tuple(rails):
        sweep(f'{name}_r{r}', coll, [p + Vector((0, 0, r)) for p in P], 0.024 if r == h else 0.015, mat, segs=6, per_m=0.5)

def front_wall(name, coll, d, x0, x1, kstart, boards=True):
    # the wall in front of a deck, up to a parapet a metre over its gangway; the sponsor boards on its face
    zt = d['z'] + 1.0
    bbox(name, coll, (x1 - x0, 0.3, zt), ((x0 + x1) / 2, 0.15, zt / 2), M['conc'], bev=0.03)
    bbox(name + '_cap', coll, (x1 - x0, 0.42, 0.08), ((x0 + x1) / 2, 0.15, zt + 0.04), M['conc'], bev=0.02)
    if boards: board(name + '_boards', coll, x0, x1, max(0.25, zt - 1.25), zt - 0.2, -0.012, kstart)
    # a glass-less steel balustrade on the cap (rails to stop the crowd falling over: the wall's not tall enough)
    railing(name + '_rail', coll, [(x0 + 0.1, 0.15, zt + 0.08), (x1 - 0.1, 0.15, zt + 0.08)], h=0.45, post=2.0, rails=())

def raker_frames(coll, s, d, name, under=True, skip0=False):
    # the steel (S) or concrete (M, L) frames under a deck at each frame x: a sloped raker, columns down to the ground
    R = rows(d); steel = s['back'] == 'frame'; mat = M['steel'] if steel else M['conc']
    y_top, z_top = R[-1][1], R[-1][2]
    for fx in s['frames']:
        if skip0 and fx == 0: continue
        w = 0.22 if steel else 0.45
        # the raker: a beam under the row noses from the gangway to the back
        p0 = Vector((fx, d['y0'], d['z'] - 0.05)); p1 = Vector((fx, y_top, z_top - d['rise'] - 0.05))
        dv = p1 - p0; L = dv.length; pitch = math.atan2(dv.z, dv.y)
        hh = 0.32 if steel else 0.6
        o = bbox(f'{name}_raker{fx}', coll, (w, L, hh), (fx, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2 - hh / 2), mat, rot=(pitch, 0, 0), bev=0.015)
        if not under: continue
        # columns every ~3 m along it (steel), or a front and back pier (concrete)
        ys = [d['y0'] + 0.3 + i * (L * math.cos(pitch) - 0.6) / max(1, round(L / 3)) for i in range(round(L / 3) + 1)] if steel else [d['y0'] + 0.4, (d['y0'] + y_top) / 2, y_top - 0.4]
        for y in ys:
            zt = d['z'] + (y - d['y0']) * math.tan(pitch) - hh - 0.05
            if zt < 0.4: continue
            if steel:
                bbox(f'{name}_col{fx}_{y:.1f}', coll, (0.2, 0.2, zt), (fx, y, zt / 2), mat, bev=0.01)
                bbox(f'{name}_foot{fx}_{y:.1f}', coll, (0.45, 0.45, 0.12), (fx, y, 0.06), M['conc'], bev=0.02)
            else:
                bbox(f'{name}_pier{fx}_{y:.1f}', coll, (0.5, 0.5, zt), (fx, y, zt / 2), mat, bev=0.03)
        if steel:   # diagonal bracing between the columns (front-back), and the knee braces
            for y0_, y1_ in zip(ys, ys[1:]):
                z0_ = d['z'] + (y0_ - d['y0']) * math.tan(pitch) - hh - 0.1; z1_ = d['z'] + (y1_ - d['y0']) * math.tan(pitch) - hh - 0.1
                if z0_ > 0.8: rd(f'{name}_br{fx}_{y0_:.1f}', coll, (fx, y0_, 0.3), (fx, y1_, z1_ - 0.1), 0.035, M['steel'], verts=6)

def side_bracing(coll, s, d, x0, x1, name):
    # along X between the frames (S): cross bracing in the back and a tie at the top of the columns
    R = rows(d); fr = [f for f in s['frames']]
    pairs = list(zip(fr, fr[1:]))
    y = R[-1][1] - 0.4; zt = R[-1][2] - d['rise'] - 0.45
    for a, b in pairs:
        rd(f'{name}_x1_{a}', coll, (a, y, 0.25), (b, y, zt), 0.03, M['steel'], verts=6)
        rd(f'{name}_x2_{a}', coll, (b, y, 0.25), (a, y, zt), 0.03, M['steel'], verts=6)
    bbox(f'{name}_tie', coll, (x1 - x0, 0.16, 0.2), ((x0 + x1) / 2, y, zt + 0.1), M['steel'], bev=0.01)

def soffit(name, coll, d, x0, x1):
    # the underside of a deck (seen from behind and below on the open stand): a sloped steel deck under the rows
    R = rows(d); y0, z0 = d['y0'], d['z'] - 0.08; y1, z1 = R[-1][1], R[-1][2] - 0.08
    b = Build(); b.quad([(x0, y0, z0 - 0.02), (x0, y1, z1 - d['rise'] - 0.02), (x1, y1, z1 - d['rise'] - 0.02), (x1, y0, z0 - 0.02)], 0)
    b.quad([(x0, d['yg'], d['z'] - 0.1), (x0, y0, d['z'] - 0.1), (x1, y0, d['z'] - 0.1), (x1, d['yg'], d['z'] - 0.1)], 0)
    o = b.obj(name, coll, [M['galv']]); G.grid_out(o, 1.0)
    for p in o.data.polygons: p.normal  # (faces point down: built that way)
    return o

def back(coll, s, x0, x1, name, kb):
    # the back of the stand: a rail on the top row (S: open frame behind it), or a clad wall up to the roof (M, L)
    d = s['decks'][-1]; R = rows(d); yb, zt = R[-1][1], R[-1][2]
    if s['back'] == 'frame':
        bbox(name + '_kerb', coll, (x1 - x0, 0.25, 0.25), ((x0 + x1) / 2, yb + 0.12, zt + 0.12), M['conc'], bev=0.02)
        railing(name + '_rail', coll, [(x0 + 0.1, yb + 0.12, zt + 0.25), (x1 - 0.1, yb + 0.12, zt + 0.25)], h=1.0, post=2.0, rails=(0.5,))
        board(name + '_bboards', coll, x0, x1, zt - 1.3, zt - 0.3, yb + 0.02, kb, face=1)   # (sponsors on the back too: it faces the paddock)
        return
    top = s['roof']['zb'] - 0.2; y = s['depth'] - 0.18
    o = bx(name + '_clad', coll, (x1 - x0, 0.3, top), ((x0 + x1) / 2, y, top / 2), M['clad']); G.grid_out(o, 1.0)
    G.retile(o, 0.5)
    # a red band and a line of windows (the concourse) along the back; downpipes at the frames
    bbox(name + '_band', coll, (x1 - x0, 0.06, 1.2), ((x0 + x1) / 2, y + 0.18, top - 1.6), M['clad_band'], bev=0.01)
    yo = y + 0.15
    # steel columns standing proud of the cladding at the frames, a white floor band at each level
    for fx in s['frames']:
        bbox(f'{name}_pc{fx}', coll, (0.5, 0.4, top), (fx, yo + 0.2, top / 2), M['steel'], bev=0.02)
        rd(f'{name}_dp{fx}', coll, (fx + 0.4, yo + 0.12, 0.1), (fx + 0.4, yo + 0.12, top - 0.3), 0.07, M['galv'], verts=8)
    levels = [s['decks'][0]['z'] + 1.2] + ([s['vip']['z'], s['vip']['slab']] if 'vip' in s else [])
    for z in levels: bbox(f'{name}_lvl{z:.1f}', coll, (x1 - x0, 0.25, 0.45), ((x0 + x1) / 2, yo + 0.1, z), M['white'], bev=0.02)
    # the hospitality level's ribbon window (L), round the back too
    if 'vip' in s:
        v = s['vip']; zc = (v['z'] + v['slab']) / 2 + 0.1; hh = v['slab'] - v['z'] - 1.0
        bx(name + '_ribbon', coll, (x1 - x0, 0.08, hh), ((x0 + x1) / 2, yo + 0.02, zc), M['glass'])
        for k in range(9): bx(f'{name}_rm{k}', coll, (0.1, 0.16, hh), (x0 + k * (x1 - x0) / 8, yo + 0.05, zc), M['white'])
    else:   # (M: a row of small concourse windows high up)
        for k in range(6):
            cx = x0 + (k + 0.5) * (x1 - x0) / 6; z = top - 3.0
            bbox(f'{name}_win{k}', coll, (1.3, 0.06, 0.8), (cx, yo + 0.03, z), M['glass'], bev=0.01)
            bbox(f'{name}_winf{k}', coll, (1.42, 0.05, 0.92), (cx, yo + 0.015, z), M['white'], bev=0.01)
    # at the ground: the concourse's kiosks and gates under a canopy (roller shutters, a lit sign over each)
    zc = s['decks'][0]['z'] + 1.2 - 0.25
    G.mk(G.beam(name + '_canopy', coll, (x0, yo + 1.0, zc + 0.15), (x1, yo + 1.0, zc + 0.15), 2.0, 0.18, M['white']))
    for k, (cx, kind) in enumerate(((x0 + 4.0, 'shutter'), (x0 + 8.2, 'gate'))):
        if kind == 'shutter':
            sh = G.tiled_card(f'{name}_sh{k}', coll, 2.6, 2.3, (cx, yo + 0.04, 0.0), M['shutter'], tile=1.0); sh.rotation_euler = (0, 0, math.pi)
            bbox(f'{name}_shf{k}', coll, (2.9, 0.2, 0.25), (cx, yo + 0.05, 2.42), M['steel'], bev=0.02)
            board(f'{name}_sign{k}', coll, cx - 1.3, cx + 1.3, 2.6, 3.25, yo + 0.12, k * 3 + 1, face=1)
            bbox(f'{name}_counter{k}', coll, (2.6, 0.45, 0.1), (cx, yo + 0.3, 1.05), M['steel'], bev=0.01)
        else:
            bx(f'{name}_gate{k}', coll, (2.8, 0.05, 2.6), (cx, yo + 0.01, 1.3), M['dark'])
            for gx in (-1.05, -0.35, 0.35, 1.05):
                bbox(f'{name}_turn{k}_{gx:.1f}', coll, (0.3, 0.5, 1.0), (cx + gx, yo + 0.35, 0.5), M['galv'], bev=0.03)
    # the inside face: dark under the rows (seen through the gap between the top row and the roof)
    if 'vip' not in s:
        bbox(name + '_backrail', coll, (x1 - x0, 0.12, 1.1), ((x0 + x1) / 2, yb + 0.06, zt + 0.55), M['conc'], bev=0.02)

def roof(coll, s, x0, x1, name, kb):
    r = s['roof']; yb = s['depth'] - 0.2; yf = r['yf']; L = yb - yf
    zf, zb = r['zf'], r['zb']
    # the deck: corrugated sheet, a little slope up to the front edge
    pitch = math.atan2(zf - zb, -(yf - yb))
    o = bx(name + '_deck', coll, (x1 - x0, L, 0.12), ((x0 + x1) / 2, (yf + yb) / 2, (zf + zb) / 2 + 0.06), M['roof'], rot=(-math.atan2(zf - zb, L), 0, 0))
    G.grid_out(o, 1.5); G.retile(o, 0.5)
    # cantilever trusses at the frames: a top chord under the deck, a bottom chord rising to the tip, posts and diagonals
    for fx in s['frames']:
        top0, top1 = Vector((fx, yb, zb - 0.05)), Vector((fx, yf + 0.4, zf - 0.05))
        bot0, bot1 = Vector((fx, yb, zb - r['depth_b'])), Vector((fx, yf + 0.4, zf - r['depth_f']))
        G.mk(G.beam(f'{name}_tc{fx}', coll, top0, top1, 0.22, 0.22, M['steel']))
        G.mk(G.beam(f'{name}_bc{fx}', coll, bot0, bot1, 0.22, 0.26, M['steel']))
        n = max(4, round(L / 2.4)); prev = None
        for i in range(n + 1):
            f = i / n; t = top0.lerp(top1, f); bt = bot0.lerp(bot1, f)
            rd(f'{name}_tv{fx}_{i}', coll, t, bt, 0.06, M['steel'], verts=6)
            if prev is not None: rd(f'{name}_td{fx}_{i}', coll, prev, t if i % 2 else bt, 0.05, M['steel'], verts=6)
            prev = bt if i % 2 == 0 else t
        # the back column holding it up, inside the clad wall line
        bbox(f'{name}_col{fx}', coll, (0.45, 0.3, zb), (fx, yb + 0.02, zb / 2), M['steel'], bev=0.015)
    # purlins along X under the deck
    for i in range(1, 6):
        f = i / 6; y = yb + (yf - yb) * f; z = zb + (zf - zb) * f - 0.2
        bbox(f'{name}_pur{i}', coll, (x1 - x0, 0.12, 0.18), ((x0 + x1) / 2, y, z), M['steel'], bev=0.01)
    # the fascia along the front: sponsor boards on a white box, a lamp strip under it (the floodlights)
    bbox(name + '_fascia', coll, (x1 - x0, 0.5, 1.5), ((x0 + x1) / 2, yf + 0.25, zf - 0.55), M['white'], bev=0.03)
    board(name + '_fboards', coll, x0, x1, zf - 1.2, zf + 0.05, yf - 0.012, kb)
    for k in range(3):
        cx = x0 + (k + 0.5) * (x1 - x0) / 3
        bbox(f'{name}_lamp{k}', coll, (0.9, 0.45, 0.32), (cx, yf + 0.9, zf - 1.5), M['steel'], bev=0.02)
        bx(f'{name}_lens{k}', coll, (0.78, 0.03, 0.24), (cx, yf + 0.665, zf - 1.5), M['lamp'])
    # the gutter at the back
    bbox(name + '_gutter', coll, (x1 - x0, 0.3, 0.3), ((x0 + x1) / 2, yb + 0.05, zb + 0.15), M['galv'], bev=0.02)

def vip(coll, s, x0, x1, name, rng, seats_out, kb, interior=True):
    v = s['vip']; up = s['decks'][1]
    # the hospitality level: a floor over the lower deck's back, a balcony with a glass rail, the glazed front, and the
    # upper deck's slab over it with the sponsor fascia
    bbox(name + '_floor', coll, (x1 - x0, v['yglass'] - v['yb'] + 0.4, 0.3), ((x0 + x1) / 2, (v['yb'] + v['yglass']) / 2, v['z'] - 0.15), M['conc'], bev=0.02)
    o = bx(name + '_glass', coll, (x1 - x0, 0.08, v['top'] - v['z']), ((x0 + x1) / 2, v['yglass'], (v['z'] + v['top']) / 2), M['glass'])
    for k in range(9 if interior else 0):
        x = x0 + k * (x1 - x0) / 8
        bx(f'{name}_mull{k}', coll, (0.08, 0.14, v['top'] - v['z']), (x, v['yglass'] - 0.03, (v['z'] + v['top']) / 2), M['white'])
    bx(name + '_transom', coll, (x1 - x0, 0.14, 0.08), ((x0 + x1) / 2, v['yglass'] - 0.03, v['z'] + 2.4), M['white'])
    # the balcony rail: a low wall with a glass panel on it (glass: the dark tint, cut by posts)
    bbox(name + '_balwall', coll, (x1 - x0, 0.2, 0.45), ((x0 + x1) / 2, v['yb'] + 0.1, v['z'] + 0.22), M['conc'], bev=0.02)
    railing(name + '_balrail', coll, [(x0 + 0.1, v['yb'] + 0.1, v['z'] + 0.45), (x1 - 0.1, v['yb'] + 0.1, v['z'] + 0.45)], h=0.65, post=1.5, rails=(0.3,))
    # a row of seats on the balcony (the guests watch from out here too), a few doors open behind
    xs = [x for x in SEATS_X if abs(x) > AISLE and x0 - 0.01 <= x < x1]
    if xs: b = Build(); add_seats(b, xs, v['yb'] + 0.55, v['z'], rng, seats_out); b.obj(name + '_seats', coll, [M['seat'], M['seat_faded'], M['steel']])
    # the upper slab: the floor of the upper deck's gangway, its front with sponsor boards
    bbox(name + '_slab', coll, (x1 - x0, up['y0'] - up['yg'] + 1.6, v['slab'] - v['top']), ((x0 + x1) / 2, (up['yg'] + up['y0'] + 1.6) / 2, (v['top'] + v['slab']) / 2), M['conc'], bev=0.03)
    zt = up['z'] + 1.0
    bbox(name + '_upwall', coll, (x1 - x0, 0.3, zt - v['top']), ((x0 + x1) / 2, up['yg'] - 0.15, (v['top'] + zt) / 2), M['conc'], bev=0.03)
    board(name + '_upboards', coll, x0, x1, v['top'] + 0.15, zt - 0.15, up['yg'] - 0.312, kb)
    railing(name + '_uprail', coll, [(x0 + 0.1, up['yg'] - 0.15, zt), (x1 - 0.1, up['yg'] - 0.15, zt)], h=0.45, post=2.0, rails=())
    # the interior seen through the glass: a dark back wall, ceiling lights, round tables
    if not interior: return
    bx(name + '_inback', coll, (x1 - x0, 0.1, v['top'] - v['z']), ((x0 + x1) / 2, v['yglass'] + 5.5, (v['z'] + v['top']) / 2), M['dark'])
    bx(name + '_inceil', coll, (x1 - x0, 5.5, 0.06), ((x0 + x1) / 2, v['yglass'] + 2.75, v['top'] - 0.03), M['white'])
    for k in range(4):
        x = x0 + (k + 0.5) * (x1 - x0) / 4
        lathe(f'{name}_table{k}', coll, [(0.0, 0.0), (0.25, 0.0), (0.05, 0.03), (0.05, 0.72), (0.55, 0.72), (0.55, 0.76), (0.0, 0.76)], (x, v['yglass'] + 2.2, v['z']), M['white'], segs=10)
        bx(f'{name}_light{k}', coll, (1.2, 0.3, 0.04), (x, v['yglass'] + 2.2, v['top'] - 0.08), M['lamp'])

def stair_tower(coll, s, side, name):
    # an open steel stair tower beside the stand's back half: four columns, landings, switchback flights with rails,
    # mesh on the outer faces. side: -1 left (x < 0), +1 right
    ztop = s['ztop']; yb = s['depth'] - 0.3
    W, Ld = 3.0, 6.4; xin = side * 0.7; xout = side * (0.7 + W); xa, xb = min(xin, xout), max(xin, xout)
    ya, yz = yb - Ld, yb
    n = max(1, round(ztop / 2.6)); h = ztop / n
    for (x, y) in ((xa, ya), (xb, ya), (xa, yz), (xb, yz)):
        bbox(f'{name}_c{x:.1f}{y:.1f}', coll, (0.2, 0.2, ztop + 1.1), (x, y, (ztop + 1.1) / 2), M['steel'], bev=0.01)
    xm = (xa + xb) / 2
    for i in range(n + 1):
        z = i * h
        # landing at each end
        for yl in ((ya + 0.1, ya + 1.4) if i % 2 else (yz - 1.4, yz - 0.1),):
            if i == 0: continue
            bbox(f'{name}_land{i}', coll, (W, yl[1] - yl[0], 0.12), (xm, (yl[0] + yl[1]) / 2, z - 0.06), M['steel'], bev=0.01)
        if i == n: break
        # the flight from this landing to the next: steps in the half of the tower its turn uses
        half = (xa + 0.1, xm - 0.05) if i % 2 == 0 else (xm + 0.05, xb - 0.1)
        y0, y1 = (yz - 1.4, ya + 1.4) if i % 2 == 0 else (ya + 1.4, yz - 1.4)
        steps = max(8, round(h / 0.18)); b = Build()
        for k in range(steps):
            yy0 = y0 + (y1 - y0) * k / steps; yy1 = y0 + (y1 - y0) * (k + 1) / steps
            zz = z + h * (k + 1) / steps
            b.box((half[0], min(yy0, yy1), zz - 0.05), (half[1], max(yy0, yy1), zz), 0, skip=())
        b.obj(f'{name}_flight{i}', coll, [M['galv']])
        # stringers and a handrail on the open side
        xs_ = half[1] if i % 2 == 0 else half[0]
        for xx in (half[0], half[1]):
            G.mk(G.beam(f'{name}_str{i}{xx:.1f}', coll, (xx, y0, z - 0.1), (xx, y1, z + h - 0.1), 0.05, 0.25, M['steel']))
        rd(f'{name}_hr{i}', coll, (xs_, y0, z + 1.0), (xs_, y1, z + h + 1.0), 0.025, M['galv'], verts=6)
    # mesh panels on the outer side and the back (see-through), a rail round the top
    for (p0, p1) in (((xout, ya), (xout, yz)), ((xa, yz + 0.01), (xb, yz + 0.01)), ((xa, ya - 0.01), (xb, ya - 0.01))):
        P0, P1 = Vector((*p0, 0.0)), Vector((*p1, 0.0)); L = (P1 - P0).length
        z0 = 2.3 if abs(p0[1] - (yz + 0.01)) < 1e-3 else 0.0   # (the back: open at the bottom, the way in)
        c = G.tiled_card(f'{name}_mesh{p0[0]:.1f}{p0[1]:.1f}', coll, L, ztop + 1.0 - z0, ((P0 + P1) / 2 + Vector((0, 0, z0))).to_tuple(), M['mesh'], tile=1.0,
                         rotz=math.atan2((P1 - P0).y, (P1 - P0).x))
        c.data.polygons[0].use_smooth = False
    return (xa, xb, ya, yz)

def side_wall(coll, s, side, name):
    # the end wall closing the stand's side, its top following the rows (concrete), a parapet on it
    xw = side * 0.55; poly = [(0.0, 0.0)]
    for d in s['decks']:
        zt = d['z'] + 1.0; poly += [(d['yg'] - 0.3 if d is s['decks'][0] else d['yg'] - 0.3, zt)]
        R = rows(d); poly += [(R[-1][1], R[-1][2] + 1.0)]
    if s['roof']: poly += [(s['depth'], s['roof']['zb'])]
    poly += [(s['depth'], 0.0)]
    # (L: under the upper deck's front the wall comes forward to the VIP balcony)
    pts = [(xw - 0.15 * side, y, z) for (y, z) in poly]
    b = Build(); n = len(pts)
    # the two faces and the top edge (an extruded polygon, triangulated as a fan from the back bottom corner)
    o_in = [(x, y, z) for (x, y, z) in pts]; o_out = [(x + 0.3 * side, y, z) for (x, y, z) in pts]
    me = bpy.data.meshes.new(name); verts = o_in + o_out
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me.from_pydata(verts, [], faces); me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    G.uv_world(me, Matrix.Identity(4), 0.5); o = G._obj(name, coll, me, M['conc'])
    return o

def end_cap(coll, s, side, name, rng, seats_out):
    # the end of a stand: a stub of terrace to the end wall (the last bay's edge seat hangs over it), the wall, a stair
    # tower beside the back; built at x 0 (the bay's edge) going out to side
    for i, d in enumerate(s['decks']):
        xa, xb = (-0.55, 0.0) if side < 0 else (0.0, 0.55)
        terrace(f'{name}_stub{i}', coll, d, xa, xb)
        front_wall(f'{name}_fw{i}', coll, d, xa, xb, 0, boards=False) if i == 0 else None
    if 'vip' in s: vip(coll, s, *((-0.55, 0.0) if side < 0 else (0.0, 0.55)), name + '_vip', rng, seats_out, 0, interior=False)
    side_wall(coll, s, side, name + '_wall')
    t = stair_tower(coll, s, side, name + '_tower')
    # the end wall's outside: concrete fins every 4 m, and a big sponsor sign up high near the front
    xo = side * 0.71; R0 = rows(s['decks'][0])
    for k, y in enumerate(range(4, int(s['depth'] - 7), 4)):
        zt = min(s['decks'][0]['z'] + (y - s['decks'][0]['y0']) / s['decks'][0]['tread'] * s['decks'][0]['rise'] + 0.6, s['ztop'])
        if y > R0[-1][1] and len(s['decks']) > 1: zt = s['vip']['slab']
        if zt > 1.5: bbox(f'{name}_fin{k}', coll, (0.3, 0.4, zt), (xo + side * 0.15, y, zt / 2), M['conc'], bev=0.03)
    if s['roof']:
        # (on the wall below its sloping top, ending before the stair tower)
        d0 = s['decks'][0]; hs = 2.0 if len(s['decks']) == 1 else 3.2
        ys1 = t[2] - 0.3; ys0 = ys1 - hs * 4
        zs = max(1.2, d0['z'] + 1.0 + (ys0 - d0['y0']) / d0['tread'] * d0['rise'] - hs - 0.5)
        me_ = bpy.data.meshes.new(name + '_bigsign'); c_ = 2 if side < 0 else 6; u0, v0 = (c_ % 4) / 4, (1 - c_ // 4) / 2
        yA, yB = (ys1, ys0) if side < 0 else (ys0, ys1)
        me_.from_pydata([(xo + side * 0.07, yA, zs), (xo + side * 0.07, yB, zs), (xo + side * 0.07, yB, zs + hs), (xo + side * 0.07, yA, zs + hs)], [], [(0, 1, 2, 3)])
        uv = me_.uv_layers.new()
        for li, (u, vv) in zip(me_.polygons[0].loop_indices, ((u0 + 0.002, v0 + 0.004), (u0 + 0.248, v0 + 0.004), (u0 + 0.248, v0 + 0.496), (u0 + 0.002, v0 + 0.496))): uv.data[li].uv = (u, vv)
        if (me_.polygons[0].normal.x > 0) != (side > 0): me_.flip_normals()
        G._obj(name + '_bigsign', coll, me_, M['boards'])
        bbox(name + '_bigsignf', coll, (0.1, ys1 - ys0 + 0.3, hs + 0.3), (xo + side * 0.0, (ys0 + ys1) / 2, zs + hs / 2), M['white'], bev=0.02)
    # the walkway from the tower's top landing over to the top row, through the wall: a gap in the rail, a gate
    if s['roof']:
        rf = s['roof']; xa_, xb_ = (-0.55, 0.0) if side < 0 else (0.0, 0.55)
        o = bx(name + '_rclad', coll, (0.6, 0.3, rf['zb']), (side * 0.3, s['depth'] - 0.18, rf['zb'] / 2), M['clad']); G.grid_out(o, 1.0)
        # the roof's end: its deck runs over the end wall, the fascia wraps round
        yb = s['depth'] - 0.2; yf = rf['yf']; L = yb - yf
        bx(name + '_rdeck', coll, (0.7, L, 0.12), (side * 0.35, (yf + yb) / 2, (rf['zf'] + rf['zb']) / 2 + 0.06), M['roof'], rot=(-math.atan2(rf['zf'] - rf['zb'], L), 0, 0))
        bbox(name + '_rfascia', coll, (0.7, 0.5, 1.5), (side * 0.35, yf + 0.25, rf['zf'] - 0.55), M['white'], bev=0.03)
        # side fascia along the roof's edge
        G.mk(G.beam(name + '_rside', coll, (side * 0.7, yb, rf['zb'] - 0.4), (side * 0.7, yf + 0.5, rf['zf'] - 0.4), 0.12, 0.9, M['white']))
    # a flag pole on the top corner (club stands: on the back rail; roofed stands: on the roof's front corner)
    if s['roof']:
        base = Vector((side * 0.6, s['roof']['yf'] + 0.6, s['roof']['zf'] + 0.05)); hgt = 6.0
    else:
        base = Vector((side * 0.4, s['yback'] + 0.1, s['ztop'] + 0.25)); hgt = 5.0
    lathe(name + '_pole', coll, [(0.07, 0.0), (0.05, 0.3), (0.035, hgt), (0.06, hgt), (0.06, hgt + 0.08), (0.0, hgt + 0.12)], base.to_tuple(), M['galv'], segs=8)
    flag(name + '_flag', coll, base + Vector((0, 0, hgt - 1.3)), side, 2 if side < 0 else 6)
    return t

def bay(coll, s, name, rng, seats_out, tunnel=False, kb=0):
    x0, x1 = -BAY / 2, BAY / 2; cut = None
    for i, d in enumerate(s['decks']):
        c = (-1.5, 1.5, s['tunnel_rows']) if (tunnel and i == 0) else None
        terrace(f'{name}_terr{i}', coll, d, x0, x1, cut=c)
        aisle(coll, d, f'{name}_aisle{i}', cut=s['tunnel_rows'] if c else None)
        if i == 0: front_wall(f'{name}_fw', coll, d, x0, x1, kb)
        raker_frames(coll, s, d, f'{name}_fr{i}', under=(i == 0), skip0=bool(c))
        # the seats
        b = Build()
        for k, (ya, yb, z) in enumerate(rows(d)):
            xs = [x for x in SEATS_X if abs(x) > AISLE]
            if c and k < c[2]: xs = [x for x in xs if abs(x) - 0.23 > 1.65]
            add_seats(b, xs, ya + 0.3, z, rng, seats_out)
        b.obj(f'{name}_seats{i}', coll, [M['seat'], M['seat_faded'], M['steel']])
        if c: tunnel_mouth(coll, s, d, f'{name}_tun')
    if s['back'] == 'frame':
        soffit(name + '_soffit', coll, s['decks'][0], x0, x1); side_bracing(coll, s, s['decks'][0], x0, x1, name + '_sb')
    back(coll, s, x0, x1, name + '_back', kb + 3)
    if 'vip' in s: vip(coll, s, x0, x1, name + '_vip', rng, seats_out, kb + 5)
    if s['roof']: roof(coll, s, x0, x1, name + '_roof', kb + 1)

def tunnel_mouth(coll, s, d, name):
    # the vomitory: a passage in from the gangway under the first rows, side walls stepping up with the rows, the
    # mouth's dark opening, a rail round the top
    R = rows(d); n = s['tunnel_rows']; ym = R[n][0]; zr = R[n - 1][2]; xa, xb = -1.5, 1.5
    for sx in (xa, xb):
        b = Build(); t = 0.25 * (1 if sx > 0 else -1)
        x0_, x1_ = (sx, sx + t) if t > 0 else (sx + t, sx)
        for k in range(n):
            ya, yb, z = R[k]
            b.box((x0_, ya, d['z']), (x1_, yb, z + 0.9), 0, skip=('-z',))
        b.obj(f'{name}_side{sx}', coll, [M['conc']])
    # the opening in the mouth wall
    bx(name + '_dark', coll, (2.4, 0.05, 2.25), (0, ym - 0.03, d['z'] + 1.125), M['dark'])
    bbox(name + '_lintel', coll, (3.0, 0.3, 0.25), (0, ym - 0.15, d['z'] + 2.4), M['conc'], bev=0.02)
    bx(name + '_floor', coll, (3.0, ym - d['y0'], 0.02), (0, (ym + d['y0']) / 2, d['z'] + 0.01), M['conc_floor'])
    # signs over it: the gate number
    for sx in (xa - 0.12, xb + 0.12):
        pts = [(sx, R[0][0], R[0][2] + 0.9), (sx, R[n - 1][1], R[n - 1][2] + 0.9)]
        railing(f'{name}_rail{sx}', coll, pts, h=0.6, post=1.4, rails=())
    railing(name + '_railm', coll, [(xa, ym + 0.05, zr + 0.9), (xb, ym + 0.05, zr + 0.9)], h=0.6, post=1.4, rails=())

def flag(name, coll, at, side, k):
    # a sponsor flag flying off the pole (away from the stand), in four waved strips, both faces printed
    L, H = 2.4, 1.2; c = k % 8; u0, v0 = (c % 4) / 4, (1 - c // 4) / 2; vs, fs, uvs = [], [], []
    n = 6
    for i in range(n + 1):
        f = i / n; x = at.x + side * (0.05 + L * f); y = at.y + math.sin(f * math.pi * 1.6) * 0.18 * f; dz = -0.12 * f * f
        vs += [(x, y, at.z + dz), (x, y, at.z + H + dz * 0.5)]; uu = u0 + 0.004 + 0.242 * (f if side > 0 else 1 - f)
        uvs += [(uu, v0 + 0.004), (uu, v0 + 0.496)]
    for i in range(n): fs.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); uv = me.uv_layers.new()
    for f_ in me.polygons:
        for li in f_.loop_indices: uv.data[li].uv = uvs[me.loops[li].vertex_index]
    return G._obj(name, coll, me, M['flag'])

# ---------------------------------------------------------------- AO, joining, the scene
def finish(coll):
    # AO into vertex colours against a big ground, then one object a material (fewer draw calls, a lighter .blend)
    objs = [o for o in coll.all_objects if o.type == 'MESH']
    occ = bpy.data.materials.get('TMP_Occluder') or mat_img('TMP_Occluder', None)
    ground = G.box('TMP_Ground', coll, (80, 80, 0.02), (0, 10, -0.01), occ)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    if not sc.world: sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = 1.6
    sc.cycles.samples = 24
    for o in objs:
        a = o.data.color_attributes.get('AO') or o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER'); o.data.color_attributes.active_color = a
    skip = {M['mesh']}
    bake = [o for o in objs if not any(m in skip for m in o.data.materials)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in bake: o.select_set(True)
    bpy.context.view_layer.objects.active = bake[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for o in objs:
        a = o.data.color_attributes['AO']; v = np.empty(len(a.data) * 4, np.float32); a.data.foreach_get('color', v); v = v.reshape(-1, 4)
        if o in bake: k = 0.56 + 0.44 * np.clip(v[:, 0], 0, 1) ** 0.85; v[:, 0] = k; v[:, 1] = k * 0.985; v[:, 2] = k * 0.96  # (lifted: the game's light is flatter and darker than Blender's)
        else: v[:, :3] = 1
        v[:, 3] = 1; a.data.foreach_set('color', v.ravel())
    bpy.data.objects.remove(ground, do_unlink=True)
    # join
    objs = [o for o in coll.all_objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.active_object; o.name = coll.name; o.data.name = coll.name
    return o

def ao_materials():
    for m in bpy.data.materials:
        if not m.name.startswith('GS_') or not m.node_tree: continue
        nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
        if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'AO'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        src = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
        if src: nt.links.new(src, mix.inputs['A'])
        else: mix.inputs['A'].default_value = p.inputs['Base Color'].default_value
        nt.links.new(ca.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])

def main():
    global SEAT
    mats(); SEAT = seat_template()
    root = G.collection('GRANDSTANDS'); info = {}
    rng = np.random.default_rng(7)
    for key in ONLY:
        s = SPEC[key]; parent = G.collection(f'gs_{key}', root); info[key] = {}
        pieces = [('bay', lambda c, so: bay(c, s, c.name, rng, so)), ('tunnel', lambda c, so: bay(c, s, c.name, rng, so, tunnel=True, kb=2)),
                  ('endL', lambda c, so: end_cap(c, s, -1, c.name, rng, so)), ('endR', lambda c, so: end_cap(c, s, 1, c.name, rng, so))]
        for pk, fn in pieces:
            c = G.collection(f'gs_{key}_{pk}', parent); seats = []
            G.BUILT.clear(); fn(c, seats); bpy.context.view_layer.update()
            o = finish(c)
            info[key][pk] = dict(tris=G.tris(c), seats=[[round(v, 3) for v in p] for p in seats])
            print(f'{key} {pk}: {info[key][pk]["tris"]} tris, {len(seats)} seats', flush=True)
        info[key]['spec'] = dict(label=s['label'], depth=round(s['depth'], 2), ztop=round(s['ztop'], 2), roof=bool(s['roof']))
    ao_materials()
    # a preview layout: each height as a 5-bay stand (L end, bay, bay, tunnel, bay, bay, R end) side by side
    lay = G.collection('PREVIEW (linked copies)')
    off = 0.0
    for key in ONLY:
        seq = ['endL', 'bay', 'bay', 'tunnel', 'bay', 'bay', 'endR']
        x = off
        for i, pk in enumerate(seq):
            src = bpy.data.objects[f'gs_{key}_{pk}']
            o = bpy.data.objects.new(f'P_{key}_{i}_{pk}', src.data); lay.objects.link(o)
            if pk == 'endL': o.location = (x - BAY / 2, 0, 0)
            elif pk == 'endR': o.location = (x + (len(seq) - 2) * BAY - BAY / 2, 0, 0)
            else: o.location = (x + (i - 1) * BAY, 0, 0)
        off += (len(seq) - 2) * BAY + 30
    for key in ONLY:   # the source pieces sit off to the side, hidden in the viewport
        bpy.data.collections[f'gs_{key}'].hide_viewport = False
        for c in bpy.data.collections[f'gs_{key}'].children: c.hide_viewport = True; c.hide_render = True
    txt = bpy.data.texts.new('GS_SEATS'); txt.write(json.dumps(info))
    with open(os.path.join(OUTDIR, 'grandstands.json'), 'w') as f: json.dump(info, f)
    if '--export' in args: export_kit(info)
    if '--blend' in args:
        p = os.path.join(OUTDIR, 'grandstands.blend'); bpy.ops.wm.save_as_mainfile(filepath=p); print('saved', p)

# ---------------------------------------------------------------- the game's scenery library
# Each piece to assets/env/grandstands.glb (its own node, named by its id) and its entry in assets/env/catalog.json:
# centred on x/z with its base at y = 0 and its front (the track side) facing +Z, like every library model; kit.ox / kit.oz
# say where the piece's centre sits from the stand's front line at the middle of the bay (x along it, z towards the
# track), so the game lines the pieces up exactly (js/gstands.js). seats: [x, pan height, z] in the piece's space.
# ao: the shading baked here stays (the library's own ground gradient isn't put over it).
ROLE_LABEL = {'bay': 'Bay', 'tunnel': 'Tunnel Bay', 'endL': 'Left End', 'endR': 'Right End'}
def export_kit(info):
    out_glb = os.path.join(ROOT, 'assets', 'env', 'grandstands.glb'); cat_p = os.path.join(ROOT, 'assets', 'env', 'catalog.json')
    ex = bpy.data.scenes.new('EXPORT'); entries = []
    for key in ONLY:
        for role in ('bay', 'tunnel', 'endL', 'endR'):
            src = bpy.data.objects[f'gs_{key}_{role}']; src.name = f'gs_{key}_{role}_src'   # (the export node keeps the plain id)
            me = src.data.copy(); me.transform(src.matrix_world)
            xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
            cx, cy, z0 = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
            me.transform(Matrix.Translation(Vector((-cx, -cy, -z0))))
            pid = f'gs_{key}_{role}'; o = bpy.data.objects.new(pid, me); ex.collection.objects.link(o)
            o.data.color_attributes.active_color = o.data.color_attributes.get('AO')
            seats = [[round(x - cx, 3), round(z - z0, 3), round(-(y - cy), 3)] for (x, y, z) in info[key][role]['seats']]
            sp = SPEC[key]
            entries.append({'cat': 'trackside', 'cls': f'gs_{key}', 'tags': ['circuit'], 'id': pid, 'pack': 'grandstands',
                            'label': sp['label'] + ('' if role == 'bay' else ' · ' + ROLE_LABEL[role]),
                            'w': round(max(xs) - min(xs), 2), 'h': round(max(zs) - min(zs), 2), 'd': round(max(ys) - min(ys), 2),
                            'tris': sum(len(p.vertices) - 2 for p in me.polygons), 'seats': seats, 'ao': 1,
                            'kit': {'role': role, 'ox': round(cx, 3), 'oz': round(-cy, 3), 'bay': BAY, 'depth': round(sp['depth'], 2),
                                    'front': round(-(0 - cy), 3), 'rows': sum(d['n'] for d in sp['decks'])},
                            **({} if role == 'bay' else {'hidden': 1})})
    win = bpy.context.window
    if win: win.scene = ex
    with bpy.context.temp_override(scene=ex):
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=False, use_active_scene=True, export_apply=True,
                                  export_yup=True, export_image_format='WEBP', export_texcoords=True, export_normals=True,
                                  export_vertex_color='ACTIVE', export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
    for o in list(ex.collection.objects): o.name.endswith(('.001', '.002')) and print('WARNING name', o.name)
    # positions / normals / colours stored small (KHR_mesh_quantization, which the game's loader reads): ~35% smaller
    import subprocess, shutil
    q = out_glb + '.q.glb'
    try:
        subprocess.run(['npx', '-y', '@gltf-transform/cli@4.1.1', 'quantize', out_glb, q], check=True, cwd=GEN, capture_output=True, timeout=300)
        shutil.move(q, out_glb)
    except Exception as e: print('(not quantized:', e, ')')
    cat = json.load(open(cat_p))
    cat['packs']['grandstands'] = {'title': 'San Velocita modular grandstands (tools/props/grandstands.py)', 'author': 'San Velocita GP', 'license': 'own', 'source': ''}
    cat['assets'] = [a for a in cat['assets'] if a.get('pack') != 'grandstands'] + entries
    open(cat_p, 'w').write(json.dumps(cat, indent=1, ensure_ascii=False))
    print('grandstands', len(entries), 'pieces', round(os.path.getsize(out_glb) / 1024), 'KB', flush=True)

if __name__ == '__main__': main()   # (tools/props/pitstyles.py imports this for its materials and parts)
