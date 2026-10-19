# Indianapolis's landmarks, made in the game's own PS1-plus style (never the reference model's meshes: those are only
# measured, see tools/tracks/ref and the indy-rebuild notes): the Pagoda with its decks, leader board and the victory
# podium, the scoring pylon, the media center, Gasoline Alley, the Hall of Fame Museum, the footbridge over the Hulman
# straight, the infield care center, the backstretch suites, the video boards, TV towers, concession and restroom
# blocks, and the town's water tower. Sizes and places are the reference model's, in the track's own frame (game x, z;
# Blender x, -z), each piece's root an empty LM_<key> at the middle of its footprint, at ground level 0: the game
# seats it on its ground (js/realworld.js). Ambient light baked into the vertex colours, PSX textures with grime.
#   python3 tools/tracks/landmarks/indy-art.py   (the printed art, once)
#   Blender -b --python-exit-code 1 --python tools/tracks/landmarks/indy.py -- [--blend]
#   -> models/landmarks/indy.glb + indy.json (footprints: build.mjs / tools/tracks/landmarks.mjs clear the map's
#      buildings and stands under them)
#   or in a running Blender (the MCP add-on): exec it; it builds into a scene "Indy landmarks"
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools', 'tracks', 'landmarks')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
ART = os.path.join(ROOT, 'models', 'landmarks', 'src', 'indy')
OUT = os.path.join(ROOT, 'models', 'landmarks', 'indy.glb')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
LIVE = not bpy.app.background
if LIVE:
    sc = bpy.data.scenes.get('Indy landmarks') or bpy.data.scenes.new('Indy landmarks')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
import importlib, garagelib as G
importlib.reload(G)
from garagelib import grimy_tile, plain_mat, cutout_mat, art_mat, px_tex, mat_img, vnoise, fbm, grime
G.configure(os.path.join(ROOT, 'models', 'landmarks', 'src', 'indy_gen'), seed=1909)
A = lambda n: os.path.join(ART, n + '.png')
TOP = bpy.context.scene.collection

# ---------------- materials ----------------
concrete = grimy_tile('In_Concrete', 'concrete_02.png', dirt=0.25)
concrete_d = grimy_tile('In_ConcreteDark', 'dirty_concrete.png', dirt=0.3)
cream = plain_mat('In_Cream', (0.88, 0.85, 0.76), dirt=0.14)
white = plain_mat('In_White', (0.86, 0.86, 0.83), dirt=0.14)
teal_p = plain_mat('In_TealPaint', (0.08, 0.36, 0.34), dirt=0.12)
roofm = grimy_tile('In_Roof', 'asphalt_02.png', dirt=0.3)
steel = grimy_tile('In_Steel', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.52, 0.54, 0.56))
dark = grimy_tile('In_Dark', 'painted_metal.png', dirt=0.25, tint=(0.11, 0.12, 0.13))
galv = grimy_tile('In_Galv', 'galvanized_metal.png', dirt=0.35)
brick = grimy_tile('In_Brick', 'brick.png', dirt=0.25)


def curtain(name, pane, frame, cols=4, rows=2, lit=0.0):
    # a glass curtain wall tile (2 m): panes with a sky sheen top to bottom, mullions and transoms
    n = 64; col = np.ones((n, n, 3), np.float32) * np.array(pane, np.float32)
    v = np.linspace(1.15, 0.8, n)[:, None, None]; col = col * v
    col = col * (1 + 0.08 * (vnoise(n, n, 8, wrap=True) - 0.5))[..., None]
    for k in range(cols): col[:, k * n // cols:k * n // cols + 2] = frame
    for k in range(rows): col[k * n // rows:k * n // rows + 3, :] = frame
    return mat_img(name, px_tex(name, col), 0.25)


glass_teal = curtain('In_GlassTeal', (0.22, 0.66, 0.62), (0.26, 0.28, 0.29))
glass_dark = curtain('In_GlassDark', (0.12, 0.16, 0.2), (0.3, 0.31, 0.32), cols=3, rows=1)
glass_band = curtain('In_GlassBand', (0.1, 0.3, 0.3), (0.12, 0.13, 0.14), cols=2, rows=1)
# a ribbed facade (the museum): cream fins with shadow between
n = 64; rib = np.ones((n, n, 3), np.float32) * np.array((0.9, 0.87, 0.78), np.float32)
for k in range(4): rib[:, k * 16 + 12:k * 16 + 16] *= 0.74
ribbed = mat_img('In_Ribbed', px_tex('In_Ribbed', grime(rib, np.clip(fbm(n, n, (32, 8), wrap=True) - 0.4, 0, 1) * 0.25)), 0.8)
# railings: a top rail, mid rail and posts, see-through between
n = 32; al = np.zeros((n, n), np.float32); al[:3] = 1; al[n // 2:n // 2 + 2] = 1; al[:, :2] = 1; al[:, n // 2:n // 2 + 2] = 1
railing = cutout_mat('In_Railing', np.ones((n, n, 3), np.float32) * 0.62, al)
# a truss side (the footbridge): diagonals in a frame
n = 64; al = np.zeros((n, n), np.float32); al[:4] = 1; al[-4:] = 1; al[:, :3] = 1; al[:, -3:] = 1
for i in range(n): al[i, max(0, i - 2):i + 2] = 1
truss = cutout_mat('In_Truss', np.ones((n, n, 3), np.float32) * np.array((0.55, 0.57, 0.6), np.float32), al)
pylon_face = art_mat('In_PylonFace', A('pylon_face'), dirt=0.08, emit=0.35)
board = art_mat('In_PagodaBoard', A('pagoda_board'), dirt=0.05, emit=0.4)
screen_m = art_mat('In_Screen', A('screen'), dirt=0.03, emit=0.8)
checker = art_mat('In_Checker', A('checker'), dirt=0.15)
signs = {k: art_mat('In_Sign_' + k, A('sign_' + k), dirt=0.12) for k in ('indy', 'gasoline', 'museum', 'media', 'medical', 'suites')}
doors = [art_mat(f'In_Door{k}', A(f'door_{k}'), dirt=0.3) for k in range(4)]

# ---------------- building blocks (game x, z -> Blender x, -z; h up from the ground) ----------------
PARTS = []          # (object, root) for the shading bake
LM = []             # the footprints written to indy.json
P = lambda x, z, h=0.0: Vector((x, -z, h))


def root(key, cx, cz, hw, hd, rot=0.0, kind='building'):
    e = bpy.data.objects.new('LM_' + key, None); e.location = P(cx, cz); e.empty_display_size = 3; TOP.objects.link(e)
    LM.append({'key': key, 'x': round(cx, 2), 'z': round(cz, 2), 'hw': round(hw, 2), 'hd': round(hd, 2), 'rot': round(rot, 4), 'kind': kind})
    return e


def own(o, r):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy(); o.parent = r; o.matrix_world = mw; PARTS.append((o, r)); return o


def blk(r, name, x0, x1, z0, z1, h0, h1, mat, uvs=0.5, bev=0.0):
    # a box between game x0..x1, z0..z1, h0..h1 (world-mapped UVs: textures tile at their size)
    o = G.box(name, TOP, (abs(x1 - x0), abs(z1 - z0), h1 - h0), P((x0 + x1) / 2, (z0 + z1) / 2, (h0 + h1) / 2), mat, uvs=uvs)
    return own(o, r)


def face(r, name, a, b, h0, h1, mat, out, u=None):
    # a flat card from game point a to b (x, z), h0..h1, facing out ((nx, nz), game), its art stretched once over it
    # unless u (metres per repeat across)
    # (art reads left to right as seen from outside: a is the viewer's left end)
    right = Vector((-out[0], out[1], 0)).cross(Vector((0, 0, 1)))
    if (P(*b) - P(*a)).dot(right) < 0: a, b = b, a
    ax, az = a; bx_, bz = b
    me = bpy.data.meshes.new(name)
    v = [P(ax, az, h0), P(bx_, bz, h0), P(bx_, bz, h1), P(ax, az, h1)]
    me.from_pydata(v, [], [(0, 1, 2, 3)]); uv = me.uv_layers.new(); L = math.hypot(bx_ - ax, bz - az)
    us = (L / u) if u else 1.0
    for li, c in zip(me.polygons[0].loop_indices, ((0, 0), (us, 0), (us, 1), (0, 1))): uv.data[li].uv = c
    me.update(); nrm = me.polygons[0].normal; want = Vector((out[0], -out[1], 0))
    if nrm.dot(want) < 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); TOP.objects.link(o); me.materials.append(mat)
    o.location = (0, 0, 0)
    return own(o, r)


def cylv(r, name, x, z, rad, h0, h1, mat, verts=16):
    o = G.cyl(name, TOP, rad, h1 - h0, P(x, z, (h0 + h1) / 2), mat, verts=verts); return own(o, r)


def rodv(r, name, p0, p1, rad, mat, verts=6):
    o = G.rod(name, TOP, P(*p0), P(*p1), rad, mat, verts=verts); return own(o, r)


def rail_ring(r, name, x0, x1, z0, z1, h, hgt=1.1):
    # railings round a deck's edge
    for k, (a, b, o) in enumerate((((x0, z0), (x1, z0), (0, -1)), ((x1, z0), (x1, z1), (1, 0)), ((x1, z1), (x0, z1), (0, 1)), ((x0, z1), (x0, z0), (-1, 0)))):
        face(r, f'{name}_{k}', a, b, h, h + hgt, railing, o, u=1.2)


def flat_roof(r, name, x0, x1, z0, z1, h, mat=None, parapet=0.6):
    blk(r, name, x0, x1, z0, z1, h, h + 0.3, mat or roofm)
    for k, (a0, a1, b0, b1) in enumerate(((x0, x1, z0, z0 + 0.3), (x0, x1, z1 - 0.3, z1), (x0, x0 + 0.3, z0, z1), (x1 - 0.3, x1, z0, z1))):
        blk(r, f'{name}_p{k}', a0, a1, b0, b1, h + 0.3, h + 0.3 + parapet, concrete)


# ---------------- the Pagoda (start / finish, behind the pit stalls) ----------------
def pagoda():
    r = root('pagoda', -183.5, 74.5, 13, 35)
    # the suites block at its foot: concrete below, a teal glass band facing the track, the name on the fascia
    blk(r, 'base', -194.4, -172.6, 40.4, 108.6, 0, 9, concrete)
    face(r, 'base_glass', (-194.45, 108.6), (-194.45, 40.4), 3.2, 8.2, glass_band, (-1, 0), u=2)
    face(r, 'base_glass_e', (-172.55, 40.4), (-172.55, 108.6), 3.2, 8.2, glass_band, (1, 0), u=2)
    blk(r, 'base_fascia', -195.2, -171.8, 39.8, 109.2, 8.4, 9.6, teal_p)
    face(r, 'base_sign', (-195.25, 92), (-195.25, 57), 8.5, 9.5, signs['indy'], (-1, 0))
    flat_roof(r, 'base_roof', -194.4, -172.6, 40.4, 108.6, 9.6, parapet=0.4)
    # the tower: glass tiers stepping in, a deck cantilevered out at each, railed
    tiers = [(9.6, 20, 60, 106, -191, -176), (20, 29, 62, 104, -191, -176), (29, 38, 65, 101, -190.5, -176.5), (38, 47, 68, 99, -190, -177), (47, 56, 71, 96, -189.5, -177.5)]
    for k, (h0, h1, z0, z1, x0, x1) in enumerate(tiers):
        blk(r, f't{k}', x0, x1, z0, z1, h0, h1, glass_teal)
        if k < 4:
            blk(r, f'deck{k}', -196, -171, z0 - 3, z1 + 3, h1 - 0.5, h1, concrete)
            blk(r, f'deck{k}_edge', -196.1, -170.9, z0 - 3.1, z1 + 3.1, h1 - 0.9, h1 - 0.5, steel)
            rail_ring(r, f'deck{k}_rail', -196, -171, z0 - 3, z1 + 3, h1)
            for zz in (z0 - 2.5, z1 + 2.5):   # (the decks' props, out at the corners)
                for xx in (-195.5, -171.5): rodv(r, f'deck{k}_col', (xx, zz, h1 - 9 if k else 9.6), (xx, zz, h1 - 0.5), 0.18, steel)
    # the concrete core with the stairs and lifts, at the north end, up past the roof
    blk(r, 'core', -189, -180, 100, 110, 9.6, 58.5, concrete)
    for k in range(10): face(r, f'core_slot{k}', (-189.05, 101 + k * 0.9), (-189.05, 101.5 + k * 0.9), 12 + k * 4.4, 14 + k * 4.4, glass_dark, (-1, 0))
    # the leader board along the top cab's front, the roof canopy on its posts, the masts
    face(r, 'board', (-189.6, 95), (-189.6, 72), 51.5, 54.8, board, (-1, 0))
    face(r, 'board_e', (-177.4, 72), (-177.4, 95), 51.5, 54.8, board, (1, 0))
    blk(r, 'canopy', -197, -170, 66, 101, 57, 57.8, white)
    blk(r, 'canopy_edge', -197.2, -169.8, 65.8, 101.2, 56.6, 57, steel)
    for xx in (-196, -171):
        for zz in (67, 83.5, 100): rodv(r, 'canopy_post', (xx, zz, 47), (xx, zz, 56.6), 0.22, steel)
    for xx, zz in ((-186.8, 77), (-186.8, 90), (-180.3, 77), (-180.3, 90)): rodv(r, 'mast', (xx, zz, 57.8), (xx, zz, 71), 0.12, steel, verts=5)
    # the victory podium out front: a round plinth with its checkered band, the steps, the winner's stand on top
    v = root('victory', -199.2, 63.7, 6.4, 6.4)
    cylv(v, 'plinth', -199.2, 63.7, 6.2, 0, 2.4, concrete, verts=20)
    cylv(v, 'band', -199.2, 63.7, 6.25, 2.4, 3.6, checker, verts=20)
    cylv(v, 'top', -199.2, 63.7, 6.4, 3.6, 3.8, white, verts=20)
    for k in range(6): blk(v, f'step{k}', -206.2 + k * 0.5, -205.6 + k * 0.5, 61.2, 66.2, 0, 0.6 + k * 0.6, concrete)
    for k, (dz, hh) in enumerate(((0, 1.0), (-1.6, 0.6), (1.6, 0.4))): blk(v, f'stand{k}', -200, -198.4, 63.7 + dz - 0.75, 63.7 + dz + 0.75, 3.8, 3.8 + hh, white)
    for k in range(4): rodv(v, f'rail{k}', (-199.2 + 6.2 * math.cos(k * 1.57 + 0.78), 63.7 + 6.2 * math.sin(k * 1.57 + 0.78), 3.8), (-199.2 + 6.2 * math.cos(k * 1.57 + 0.78), 63.7 + 6.2 * math.sin(k * 1.57 + 0.78), 4.9), 0.05, steel)


# ---------------- the scoring pylon (beside the pit wall, a little past the line) ----------------
def pylon():
    x, z = -240.0, 222.3   # (the model's, 1.5 m back: its base stood on our road's edge)
    r = root('pylon', x, z, 4.2, 4.2, kind='tower')
    blk(r, 'plinth', x - 1.2, x + 1.2, z - 4.2, z + 4.2, 0, 0.8, concrete)
    for dz in (-3.8, 3.8):   # (the splayed feet)
        for dx in (-0.8, 0.8): rodv(r, 'leg', (x + dx, z + dz, 0.8), (x + dx * 0.6, z + dz * 0.28, 5.2), 0.22, steel, verts=6)
    blk(r, 'column', x - 1.1, x + 1.1, z - 1.25, z + 1.25, 4.8, 33.2, dark)
    face(r, 'face_w', (x - 1.12, z + 1.2), (x - 1.12, z - 1.2), 5.2, 32.8, pylon_face, (-1, 0))
    face(r, 'face_e', (x + 1.12, z - 1.2), (x + 1.12, z + 1.2), 5.2, 32.8, pylon_face, (1, 0))
    blk(r, 'cap', x - 1.3, x + 1.3, z - 1.45, z + 1.45, 33.2, 35.4, dark)
    face(r, 'cap_sign', (x - 1.32, z + 1.4), (x - 1.32, z - 1.4), 33.5, 35.1, signs['indy'], (-1, 0))
    rodv(r, 'flagpole', (x, z, 35.4), (x, z, 39.5), 0.06, steel, verts=5)


# ---------------- the media center (north of the Pagoda) ----------------
def media():
    r = root('media', -170.4, 5.2, 14.3, 43.2)
    blk(r, 'body', -184.6, -156.1, -38, 48.4, 0, 15, concrete)
    for k, h0 in enumerate((2, 6.2, 10.4)):
        face(r, f'win_w{k}', (-184.65, 47.5), (-184.65, -37), h0, h0 + 2.6, glass_dark, (-1, 0), u=3)
        face(r, f'win_e{k}', (-156.05, -37), (-156.05, 47.5), h0, h0 + 2.6, glass_dark, (1, 0), u=3)
    blk(r, 'upper', -182, -162, -28, 43, 15, 19, glass_dark)
    flat_roof(r, 'roof', -184.6, -156.1, -38, 48.4, 15, parapet=0.5)
    blk(r, 'upper_roof', -182.4, -161.6, -28.4, 43.4, 19, 19.5, white)
    face(r, 'sign', (-184.7, 18), (-184.7, -6), 13.4, 14.8, signs['media'], (-1, 0))
    for k in range(4): blk(r, f'plant{k}', -178 + k * 4, -175.5 + k * 4, 30, 36, 19.5, 21.2, galv)


# ---------------- Gasoline Alley: the garage blocks, doors both sides ----------------
def garages():
    blocks = [('ga1', -137, -107, 255, 334), ('ga2', -93, -62.6, 255.5, 308.6), ('ga3', -93, -62.6, 312.5, 334), ('ga4', -124, -103, 229, 252)]
    for key, x0, x1, z0, z1 in blocks:
        r = root(key, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2)
        blk(r, 'walls', x0, x1, z0, z1, 0, 4.4, concrete)
        flat_roof(r, 'roof', x0, x1, z0, z1, 4.4, parapet=0.45)
        blk(r, 'spine', (x0 + x1) / 2 - 2, (x0 + x1) / 2 + 2, z0 + 1, z1 - 1, 4.7, 5.6, roofm)
        nb = int((z1 - z0) / 4.6)
        for side, xx, o in ((0, x0 - 0.02, (-1, 0)), (1, x1 + 0.02, (1, 0))):
            for k in range(nb):
                za = z0 + (z1 - z0) * (k + 0.12) / nb; zb = z0 + (z1 - z0) * (k + 0.88) / nb
                a, b = ((xx, zb), (xx, za)) if side == 0 else ((xx, za), (xx, zb))
                face(r, f'door{side}_{k}', a, b, 0, 3.6, doors[(k + side) % 4], o)
        face(r, 'sign', (x0 - 0.05, z0 + 20), (x0 - 0.05, z0 + 4), 4.45, 5.0, signs['gasoline'], (-1, 0))
    # the low team buildings and the long shed south of them
    for key, x0, x1, z0, z1 in (('acc1', -40.5, -29.2, 218.4, 333.4), ('acc2', -42.8, -34.2, 288.9, 338.9)):
        r = root(key, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2)
        blk(r, 'walls', x0, x1, z0, z1, 0, 4, white); flat_roof(r, 'roof', x0, x1, z0, z1, 4, parapet=0.35)
        for k in range(int((z1 - z0) / 6)): face(r, f'door{k}', (x0 - 0.02, z0 + k * 6 + 5), (x0 - 0.02, z0 + k * 6 + 1), 0, 3.4, doors[k % 4], (-1, 0))
    r = root('shed', -90.7, 202.8, 49.5, 2.6)
    for k in range(12): rodv(r, f'post{k}', (-140 + k * 9, 201, 0), (-140 + k * 9, 201, 3.6), 0.1, steel)
    blk(r, 'roof', -140.2, -41.2, 200.6, 205, 3.6, 4.1, galv)
    blk(r, 'back', -140.2, -41.2, 204.6, 205, 0, 3.6, concrete_d)


# ---------------- the Hall of Fame Museum (south infield) ----------------
def museum():
    r = root('museum', 184, 415.6, 38.5, 52)
    blk(r, 'north', 159.5, 207.5, 430.4, 467.2, 0, 16.5, ribbed, uvs=0.25)
    flat_roof(r, 'north_roof', 159.5, 207.5, 430.4, 467.2, 16.5, mat=concrete, parapet=0.5)
    blk(r, 'middle', 145.5, 222.5, 392, 430.4, 0, 14, ribbed, uvs=0.25)
    flat_roof(r, 'middle_roof', 145.5, 222.5, 392, 430.4, 14, mat=concrete, parapet=0.5)
    # the glass barrel vault along the north block's roof
    me = bpy.data.meshes.new('vault'); bm = bmesh.new(); segs = 8; L0, L1 = 165, 203; zc, rad, hb = 411.2, 3.4, 14.8
    rings = []
    for x in (L0, L1):
        rings.append([bm.verts.new(P(x, zc + rad * math.cos(math.pi * k / segs), hb + rad * math.sin(math.pi * k / segs))) for k in range(segs + 1)])
    for k in range(segs): bm.faces.new((rings[0][k], rings[0][k + 1], rings[1][k + 1], rings[1][k]))
    bm.to_mesh(me); o = bpy.data.objects.new('vault', me); TOP.objects.link(o); me.materials.append(glass_teal); own(o, r)
    G.uv_world(me, Matrix(), 0.5)
    face(r, 'glass', (145.4, 425), (145.4, 397), 2.5, 7.5, glass_dark, (-1, 0), u=3)
    face(r, 'sign', (145.35, 421), (145.35, 401), 9.8, 11.6, signs['museum'], (-1, 0))


# ---------------- the footbridge over the Hulman straight ----------------
def bridge():
    r = root('bridge', 84.5, -79, 31, 9, kind='bridge')
    blk(r, 'tower_w', 52.5, 60.5, -86, -78, 0, 10.5, concrete)
    blk(r, 'tower_e', 102, 115, -87, -69, 0, 12.5, concrete)
    face(r, 'tower_e_glass', (101.95, -70), (101.95, -86), 2, 11.5, glass_dark, (-1, 0), u=2)
    blk(r, 'deck', 60.5, 102, -84, -80, 6.8, 7.4, concrete)
    blk(r, 'roof', 60.5, 102, -84.2, -79.8, 9.6, 9.9, galv)
    for zz, o in ((-84.02, (0, -1)), (-79.98, (0, 1))): face(r, f'truss{zz}', (60.5, zz), (102, zz), 7.4, 9.6, truss, o, u=2.2)
    for x in (60.5, 102): blk(r, f'pier{x}', x - 0.6, x + 0.6, -83.6, -80.4, 0, 6.8, concrete)


# ---------------- smaller buildings: the care center, the suites, concessions, restrooms ----------------
def small():
    for key, cx, cz, L, W, h in (('care1', 39.2, 342.7, 22.7, 10.6, 9.5), ('care2', 69.2, 342.7, 22.1, 9.8, 9.5)):
        r = root(key, cx, cz, W / 2, L / 2)
        x0, x1, z0, z1 = cx - W / 2, cx + W / 2, cz - L / 2, cz + L / 2
        blk(r, 'body', x0, x1, z0, z1, 0, h, white); flat_roof(r, 'roof', x0, x1, z0, z1, h, parapet=0.4)
        face(r, 'win', (x0 - 0.02, z1 - 1), (x0 - 0.02, z0 + 1), 1.2, 3.4, glass_dark, (-1, 0), u=3)
        face(r, 'win2', (x0 - 0.02, z1 - 1), (x0 - 0.02, z0 + 1), 5.2, 7.4, glass_dark, (-1, 0), u=3)
        if key == 'care1': face(r, 'sign', (x0 - 0.05, cz + 8), (x0 - 0.05, cz - 8), 8.2, 9.3, signs['medical'], (-1, 0))
    # the backstretch suites: three floors of glass to the track (west), concrete behind
    cx, cz, L, W = 488.5, 482.8, 115.8, 19
    r = root('suites', cx, cz, W / 2, L / 2, rot=math.radians(10.9))
    blk(r, 'body', cx - W / 2, cx + W / 2, cz - L / 2, cz + L / 2, 0, 18, concrete)
    face(r, 'glass', (cx - W / 2 - 0.05, cz + L / 2 - 2), (cx - W / 2 - 0.05, cz - L / 2 + 2), 3, 17, glass_teal, (-1, 0), u=2)
    flat_roof(r, 'roof', cx - W / 2, cx + W / 2, cz - L / 2, cz + L / 2, 18, parapet=0.6)
    face(r, 'sign', (cx - W / 2 - 0.1, cz + 18), (cx - W / 2 - 0.1, cz - 18), 18.1, 20.2, signs['suites'], (-1, 0))
    spin(r, math.radians(-10.9))   # (its long side 10.9° off north-south)
    # concession stands (awning out front) and restroom blocks, at the model's spots
    conc = [(522.2, -198.4, 35.9, 8.8, 85.3), (35.9, 399.7, 35.9, 8.7, 94.2), (507.4, 66.0, 35.9, 8.7, 80.1), (233.4, 563.5, 21.4, 12.5, -173.5), (403.5, 148.7, 21.3, 12.5, 96.0), (396.1, -70.8, 21.3, 12.4, 91.3)]
    rest = [(-54.6, -694.5, 52.9, 18.4, 161.4), (-109.1, 411.7, 43.9, 12.4, 179.9), (389.7, -132.4, 43.9, 12.2, 88.4), (24.1, 444.8, 43.9, 12.1, -179.8), (373.7, -473.8, 43.9, 12.1, 90.3), (249.1, -729.6, 43.9, 12.1, -159.4), (526.8, -116.4, 43.9, 12.1, 90.2), (361.8, 366.9, 43.9, 12.0, 108.5)]
    for k, (cx, cz, L, W, ang) in enumerate(conc + rest):
        is_c = k < len(conc); key = ('stand' if is_c else 'wc') + str(k)
        r = root(key, cx, cz, L / 2, W / 2, rot=math.radians(ang))
        # (built along x round the root, then turned to the model's heading)
        x0, x1, z0, z1 = cx - L / 2, cx + L / 2, cz - W / 2, cz + W / 2
        h = 4.2 if is_c else 3.6
        blk(r, 'body', x0, x1, z0 + (2.5 if is_c else 0), z1, 0, h, white if is_c else concrete)
        flat_roof(r, 'roof', x0, x1, z0 + (2.5 if is_c else 0), z1, h, parapet=0.3)
        if is_c:
            blk(r, 'awning', x0, x1, z0, z0 + 2.6, h - 0.6, h - 0.3, teal_p)
            for j in range(int(L / 6) + 1): rodv(r, f'post{j}', (x0 + j * L / int(L / 6), z0 + 0.2, 0), (x0 + j * L / int(L / 6), z0 + 0.2, h - 0.6), 0.07, steel)
            face(r, 'hatch', (x0 + 1, z0 + 2.48), (x1 - 1, z0 + 2.48), 1.0, 2.6, glass_dark, (0, -1), u=3)
        else:
            for j in range(3): face(r, f'door{j}', (x0 + L * (j + 0.4) / 3, z0 - 0.02), (x0 + L * (j + 0.6) / 3, z0 - 0.02), 0, 2.4, doors[j % 4], (0, -1))
        spin(r, math.radians(-ang))


def spin(r, a):
    # turn a root (and its children, built round it in game space) about its own vertical axis: game heading a
    bpy.context.view_layer.update(); r.rotation_euler = (0, 0, a)


# ---------------- video boards, TV towers, the water tower ----------------
def towers():
    boards = [(-54.1, -619.1, 131.3), (14.5, 402.2, -148.5), (-173.4, -409.6, 91.1), (243.1, -599.9, 50.8), (112.0, -681.9, -178.8), (342.7, 408.6, 150.6), (166.2, 563.5, -179.0)]
    for k, (cx, cz, ang) in enumerate(boards):
        r = root(f'board{k}', cx, cz, 4.8, 1.6, rot=math.radians(ang), kind='tower')
        for dx in (-2.6, 2.6): rodv(r, f'leg{dx}', (cx + dx, cz, 0), (cx + dx, cz, 13), 0.35, steel, verts=8)
        blk(r, 'frame', cx - 4.8, cx + 4.8, cz - 0.6, cz + 0.6, 12.6, 19.8, dark)
        face(r, 'screen_f', (cx - 4.5, cz - 0.62), (cx + 4.5, cz - 0.62), 13, 19.4, screen_m, (0, -1))
        face(r, 'screen_b', (cx + 4.5, cz + 0.62), (cx - 4.5, cz + 0.62), 13, 19.4, screen_m, (0, 1))
        spin(r, math.radians(-ang))
    tv = [(-257.9, 93.3), (-161.7, 467.3), (328.8, 555.3), (285.1, 238.6), (68.3, -117.1), (67.8, 122.5), (-65.5, -413.2), (-238.0, 94.4), (-205.1, -481.5)]
    for k, (cx, cz) in enumerate(tv):
        r = root(f'tv{k}', cx, cz, 2.2, 1.8, kind='tower')
        for dx in (-1.6, 1.6):
            for dz in (-1.2, 1.2): rodv(r, 'leg', (cx + dx, cz + dz, 0), (cx + dx * 0.8, cz + dz * 0.8, 7.2), 0.08, galv, verts=5)
        blk(r, 'deck', cx - 1.9, cx + 1.9, cz - 1.5, cz + 1.5, 7.2, 7.45, galv)
        rail_ring(r, 'rail', cx - 1.9, cx + 1.9, cz - 1.5, cz + 1.5, 7.45, 1.0)
        blk(r, 'hut', cx - 1.2, cx + 1.2, cz - 1.0, cz + 1.0, 7.45, 9.6, white)
        blk(r, 'hut_roof', cx - 1.4, cx + 1.4, cz - 1.2, cz + 1.2, 9.6, 9.8, dark)
    # the town of Speedway's water tower, out past Turn 3
    cx, cz = 523.0, 1182.0
    r = root('watertower', cx, cz, 9, 9, kind='tower')
    for k in range(6):
        a = k * math.pi / 3; rodv(r, f'leg{k}', (cx + 9 * math.cos(a), cz + 9 * math.sin(a), 0), (cx + 6 * math.cos(a), cz + 6 * math.sin(a), 30), 0.45, white, verts=8)
    o = G.cyl('riser', TOP, 1.2, 30, P(cx, cz, 15), white, verts=10); own(o, r)
    prof = [(0.0, 29.5), (6.5, 30.5), (9.5, 33.5), (10.2, 37.5), (9.4, 41.5), (6, 44.2), (1.2, 45.6), (0.0, 45.8)]
    me = bpy.data.meshes.new('tank'); bm = bmesh.new(); segs = 18; rings = []
    for rad, h in prof: rings.append([bm.verts.new(P(cx + rad * math.cos(2 * math.pi * k / segs), cz + rad * math.sin(2 * math.pi * k / segs), h)) for k in range(segs)])
    for a_, b_ in zip(rings[:-1], rings[1:]):
        for k in range(segs): bm.faces.new((a_[k], a_[(k + 1) % segs], b_[(k + 1) % segs], b_[k]))
    bm.normal_update(); bm.to_mesh(me); o = bpy.data.objects.new('tank', me); TOP.objects.link(o); me.materials.append(white); G.uv_world(me, Matrix(), 0.5); own(o, r)
    face(r, 'tank_sign', (cx - 10.3, cz + 9), (cx - 10.3, cz - 9), 35.5, 39.5, signs['indy'], (-1, 0))


# ---------------- the shading bake: dark at the foot of walls and under overhangs (the PS1 way) ----------------
def shade():
    for o, r in PARTS:
        if o.type != 'MESH': continue
        me = o.data; bpy.context.view_layer.update(); mw = o.matrix_world
        g0 = r.matrix_world.translation.z
        # (tall walls get a cut near their foot, so the dark fades over the first metres, not the whole wall)
        bm = bmesh.new(); bm.from_mesh(me)
        zs = [(mw @ v.co).z - g0 for v in bm.verts]
        if zs and max(zs) - min(zs) > 4 and min(zs) < 0.5:
            inv = mw.inverted()
            for hcut in (1.2, 3.2):
                co = inv @ Vector((0, 0, g0 + hcut)); no = (inv.to_3x3().transposed() @ Vector((0, 0, 1))).normalized()
                bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        bm.to_mesh(me); bm.free()
        a = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER'); me.color_attributes.active_color = a
        nm = mw.to_3x3()
        for poly in me.polygons:
            ny = (nm @ poly.normal).normalized().z
            for li in poly.loop_indices:
                h = (mw @ me.vertices[me.loops[li].vertex_index].co).z - g0
                t = min(1, max(0, h / 3.2)); k = 0.55 + 0.45 * (t * t * (3 - 2 * t))
                if ny < -0.3: k *= 0.72
                a.data[li].color = (k, k * 0.985, k * 0.96, 1)
    # every material: base colour times the AO
    for m in {m for o, _ in PARTS if o.type == 'MESH' for m in o.data.materials if m}:
        nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
        if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'AO'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        src = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
        if src: nt.links.new(src, mix.inputs['A'])
        else: mix.inputs['A'].default_value = p.inputs['Base Color'].default_value
        nt.links.new(ca.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])


pagoda(); pylon(); media(); garages(); museum(); bridge(); small(); towers()


# ---------------- where the grandstands go (the trackside pack's covered and flags stands: the game places them) ----
# The reference's stands (tools/tracks/landmarks/indy-stands.json: stations every 4 m along the oval, the stand's front
# and back m out from the oval's middle line, its height) as smooth curved lines: the front edge eased along each run
# (the real stands are blocks, their fronts step), a node every 9 m, one stand at each, turned to face the track where
# it stands. tools/tracks/landmarks.mjs makes them lines of stands (and drops the map's straight ones along them).
# Inside the front straight: behind the pit garages, clear of the Pagoda and the media center.
GAP = 9.0


def stand_lines():
    R = json.load(open(os.path.join(HERE, 'indy-stands.json')))
    keep_out = [L for L in LM if L['kind'] != 'stand']
    def blocked(x, z, pad):
        for L in keep_out:
            c, s_ = math.cos(L['rot']), math.sin(L['rot']); dx, dz = x - L['x'], z - L['z']
            if abs(dx * c + dz * s_) < L['hw'] + pad and abs(-dx * s_ + dz * c) < L['hd'] + pad: return True
        return False
    def ease(v, k):   # (a moving average, ends held)
        v = np.asarray(v, float); p = np.r_[np.full(k, v[0]), v, np.full(k, v[-1])]
        return np.convolve(p, np.ones(2 * k + 1) / (2 * k + 1), 'valid')
    out = []
    for side, runs in R.items():
        for ri, run in enumerate(runs):
            fam = 'stand_roof' if (side == 'outer') == (ri % 2 == 0) else 'stand_flags'
            dep = 11.2 if fam == 'stand_roof' else 8.1
            C = np.array([[q[0], q[1]] for q in run]); N = np.array([[q[2], q[3]] for q in run])
            a = np.array([q[4] for q in run], float)
            if side == 'inner': a = np.maximum(a, 34)
            a = np.array([np.median(a[max(0, k - 4):k + 5]) for k in range(len(a))]); a = ease(ease(a, 6), 6)   # (the front, smooth)
            Nn = np.c_[ease(N[:, 0], 3), ease(N[:, 1], 3)]; Nn /= np.linalg.norm(Nn, axis=1)[:, None]
            F = C + Nn * (a + dep / 2 + 0.5)[:, None]
            # (every 9 m along that curve: a stand, facing back across it to the track)
            Ls = np.r_[0, np.cumsum(np.linalg.norm(np.diff(F, axis=0), axis=1))]
            pts, faces = [], []
            for u in np.arange(0, Ls[-1] - 4, GAP):
                k = min(len(F) - 2, int(np.searchsorted(Ls, u, 'right') - 1)); f = (u - Ls[k]) / max(1e-6, Ls[k + 1] - Ls[k])
                x, z = F[k] + (F[k + 1] - F[k]) * f; nrm = Nn[k] + (Nn[k + 1] - Nn[k]) * f; nrm /= np.linalg.norm(nrm)
                if blocked(x, z, 6):   # (a break: what's built so far is one line)
                    if len(pts) >= 3: out.append({'pts': pts, 'f': faces, 'fam': fam})
                    pts, faces = [], []; continue
                pts.append([round(float(x), 1), round(float(z), 1)]); faces.append([round(float(-nrm[0]), 3), round(float(-nrm[1]), 3)])
            if len(pts) >= 3: out.append({'pts': pts, 'f': faces, 'fam': fam})
    print('stand lines:', len(out), f"({sum(len(l['pts']) for l in out)} stands)")
    return out


STANDS = stand_lines()
shade()
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o, _ in PARTS if o.type == 'MESH')
print(f'landmarks: {len(LM)} pieces, {tri:,} triangles')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({'url': 'models/landmarks/indy.glb', 'grounds': [-300, 560, -830, 760], 'items': LM, 'standLines': STANDS}, open(OUT.replace('.glb', '.json'), 'w'), indent=0)
if not LIVE or '--export' in args:
    bpy.ops.object.select_all(action='DESELECT')
    for o in TOP.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
                              export_extras=True, export_apply=True, export_yup=True, export_vertex_color='ACTIVE')
    print('exported', OUT)
if '--blend' in args: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'landmarks', 'src', 'indy-landmarks.blend'))
