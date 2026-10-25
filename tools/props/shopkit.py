# The shop kit: the modelled parts of a real strip mall (supermarkets next), for the commercial builder
# (js/housebuild.js) to put along each real building's street side, so a strip center reads as one: tenant
# storefronts in three styles, a covered walkway, an end tower, the tenant pylon sign by the road, and the rooftop
# and back-of-house bits (a packaged HVAC unit, a mushroom vent, a dumpster enclosure).
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/props/shopkit.py -- [--blend] [--no-export]
#
# Built the way a Placer County strip center is: tan stucco over block, dark bronze aluminium storefronts (mullions,
# a glass door with a pull, a transom, kick plates; the shop's insides behind the glass), a backlit sign cabinet over
# each tenant (its face left blank: the game writes the tenant's name on it), gooseneck lights, coping along the
# parapet, a darker base course; a fabric awning version (4 colours); a Spanish version under a clay-tile mansard with
# rafter tails. Blender space: the facade's face at y = 0 looking down -Y (the street), the building behind it (+Y),
# the ground at z = 0; a module runs along X, centred. Exported to assets/env/shopkit.glb + catalogue cat 'shopkit'
# (hidden from the palettes). Extras: len (a module's width along the wall), sign [x, y, z, w, h] (the sign face's
# middle and size: the game puts the tenant's name there), signs [...] (the pylon's panels), front (how far it
# reaches out in front of the wall).
import bpy, bmesh, sys, os, json, math, subprocess
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
bpy.ops.wm.read_factory_settings(use_empty=True)
import garagelib as G
from garagelib import bbox, bx, cy, rd, sweep, lathe, mk, grimy_tile, plain_mat, solid_mat, mat_img, art_mat, card

ROOT = G.ROOT
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTDIR = os.path.join(ROOT, 'models', 'trackside'); GEN = os.path.join(OUTDIR, 'src', 'shopkit_gen')
G.configure(GEN, seed=1977)
G.TEX = os.path.join(ROOT, 'models', 'garage', 'src', 'psx_industrial')
TX = os.path.join(ROOT, 'assets', 'textures')
if not os.path.exists(os.path.join(TX, 'shop_tile.png')):
    subprocess.run(['/usr/local/bin/python3', os.path.join(ROOT, 'tools', 'props', 'shoptextures.py')], check=True)

# ---------------------------------------------------------------- materials
STUCCO = plain_mat('shop_Stucco', (0.76, 0.68, 0.55), dirt=0.14, fleck=0.05)        # (the game tints it per building)
STUCCO2 = plain_mat('shop_StuccoTrim', (0.66, 0.58, 0.46), dirt=0.16, fleck=0.05)   # (a shade darker: piers, base course)
COPE = plain_mat('shop_Coping', (0.82, 0.78, 0.7), dirt=0.12)
BRONZE = plain_mat('shop_Bronze', (0.16, 0.13, 0.1), dirt=0.06, rough=0.45)
GLASS = solid_mat('shop_Glass', (0.07, 0.09, 0.11), 0.08)
CONC = grimy_tile('shop_Concrete', 'concrete_02.png', dirt=0.25)
GALV = grimy_tile('shop_Galv', 'galvanized_metal.png', dirt=0.15)
UNIT = plain_mat('shop_UnitPaint', (0.72, 0.72, 0.68), dirt=0.12)   # (a rooftop unit's factory paint: smooth, not the galvanized blotches)
GRATE = grimy_tile('shop_Grate', 'metal_grating.png', dirt=0.1)
CMU = grimy_tile('shop_Block', 'brick.png', dirt=0.22, tint=(0.62, 0.6, 0.56))
DARK = solid_mat('shop_Dark', (0.03, 0.03, 0.03), 0.8)
LAMP = solid_mat('shop_Lamp', (0.95, 0.9, 0.72), 0.3)
RAFTER = plain_mat('shop_Rafter', (0.26, 0.17, 0.11), dirt=0.2)
def tex(name, dirt=0.1): return art_mat('shop_' + name, os.path.join(TX, name + '.png'), dirt=dirt)
TILE = tex('shop_tile', 0.12)
SIGNFACE = tex('shop_signface', 0.04); SIGNFACE.name = 'shop_SignFace'
INSIDE = tex('shop_front', 0.05)   # (the shelves behind the glass: the storefront atlas's glass bay)
AWN = {c: tex('shop_awning_' + c, 0.12) for c in ('red', 'green', 'blue', 'tan')}

PIECES = {}
def piece(pid, label, **extra):
    def deco(fn):
        c = bpy.data.collections.new(pid); bpy.context.scene.collection.children.link(c)
        G.BUILT.clear(); ex = fn(c) or {}
        PIECES[pid] = dict(coll=c, label=label, extra={**extra, **ex})
        return fn
    return deco

def bolt_light(c, x, z):
    # a gooseneck sign light: a wall plate, an arm curving out and down, a shade
    bbox('lplate', c, (0.14, 0.04, 0.14), (x, -0.02, z), BRONZE, bev=0.01)
    sweep('larm', c, [(x, -0.04, z), (x, -0.35, z + 0.25), (x, -0.62, z + 0.12)], 0.022, BRONZE, segs=6, per_m=10)
    lathe('lshade', c, [(0.0, 0.0), (0.16, -0.02), (0.18, -0.1), (0.0, -0.06)], (x, -0.64, z + 0.1), BRONZE, segs=10)
    lathe('lbulb', c, [(0.0, -0.1), (0.13, -0.1), (0.0, -0.09)], (x, -0.64, z + 0.1), LAMP, segs=10)

def storefront(c, x0, x1, top, door_at=None):
    # the aluminium storefront in an opening x0..x1, 0..top: head, jambs, sill / kick plate, a transom bar, mullions,
    # glass, the insides behind it, and a glass door with its pull
    w = x1 - x0
    bx('head', c, (w, 0.14, 0.12), ((x0 + x1) / 2, -0.04, top - 0.06), BRONZE)
    for x in (x0 + 0.06, x1 - 0.06): bx('jamb', c, (0.12, 0.14, top), (x, -0.04, top / 2), BRONZE)
    bx('kick', c, (w, 0.14, 0.42), ((x0 + x1) / 2, -0.04, 0.21), BRONZE)
    tz = top - 0.7; bx('transom', c, (w, 0.14, 0.08), ((x0 + x1) / 2, -0.04, tz), BRONZE)
    # the glass: the shop's goods on their shelves behind it and the sky's reflection across it (the atlas's glass bay:
    # one pane's art per ~1.6 m, so a wide window isn't one stretched picture)
    reps = max(1, round(w / 1.6))
    for k in range(reps):
        gx0 = x0 + 0.08 + k * (w - 0.16) / reps
        o = card('glass', c, (w - 0.16) / reps, top - 0.5, (gx0 + (w - 0.16) / reps / 2, -0.01, 0.42), INSIDE); mk(o)
        for d in o.data.uv_layers[0].data: d.uv = (0.04 + d.uv[0] * 0.2, 0.56 + d.uv[1] * 0.3)
    n = max(2, round(w / 1.6)); dx = (x1 - x0) / n
    for k in range(1, n):
        x = x0 + k * dx
        if door_at is not None and abs(x - door_at) < 0.6: continue
        bx('mullion', c, (0.07, 0.12, tz - 0.42), (x, -0.04, 0.42 + (tz - 0.42) / 2), BRONZE)
    if door_at is not None:   # the door: a frame, a closer box, a pull handle, a threshold
        for x in (door_at - 0.5, door_at + 0.5): bx('dstile', c, (0.1, 0.16, tz), (x, -0.06, tz / 2), BRONZE)
        bx('drail', c, (1.0, 0.16, 0.25), (door_at, -0.06, 0.125), BRONZE); bx('dtop', c, (1.0, 0.16, 0.1), (door_at, -0.06, tz - 0.05), BRONZE)
        bx('closer', c, (0.36, 0.08, 0.08), (door_at - 0.2, -0.16, tz - 0.14), BRONZE)
        rd('pull', c, (door_at + 0.36, -0.2, 0.9), (door_at + 0.36, -0.2, 1.5), 0.016, GALV, verts=6)
        for z in (0.95, 1.45): rd('pullstem', c, (door_at + 0.36, -0.2, z), (door_at + 0.36, -0.12, z), 0.01, GALV, verts=4)

def wall_around(c, x0, x1, ox0, ox1, otop, H, mat=STUCCO):
    # a 0.3 m wall from x0 to x1 with an opening ox0..ox1 up to otop; its face at y = 0
    o = bbox('wallL', c, (ox0 - x0, 0.3, H), ((x0 + ox0) / 2, 0.15, H / 2), mat, bev=0.006); G.grid_out(o, 1.4)
    o = bbox('wallR', c, (x1 - ox1, 0.3, H), ((ox1 + x1) / 2, 0.15, H / 2), mat, bev=0.006); G.grid_out(o, 1.4)
    o = bbox('header', c, (ox1 - ox0, 0.3, H - otop), ((ox0 + ox1) / 2, 0.15, (otop + H) / 2), mat, bev=0.006); G.grid_out(o, 1.4)

def parapet_trim(c, x0, x1, H):
    bbox('coping', c, (x1 - x0 + 0.04, 0.42, 0.12), ((x0 + x1) / 2, 0.1, H + 0.06), COPE, bev=0.02)
    bbox('cornice', c, (x1 - x0, 0.14, 0.18), ((x0 + x1) / 2, -0.06, H - 0.35), STUCCO2, bev=0.02)
    bbox('base', c, (x1 - x0, 0.34, 0.5), ((x0 + x1) / 2, 0.13, 0.25), STUCCO2, bev=0.01)

def sign_cabinet(c, x, z, w, h):
    # a backlit sign cabinet on the wall: an aluminium box with a returned edge, its face (the tenant's name goes on it)
    bbox('cabinet', c, (w + 0.16, 0.26, h + 0.16), (x, -0.13, z), BRONZE, bev=0.02)
    o = card('signface', c, w, h, (x, -0.27, z - h / 2), SIGNFACE); mk(o)
    return [x, -0.28, z, w, h]


def halfdisc(name, c, ctr, r, t, mat, segs=14):
    # a flat half-round (an arched parapet, a fanlight): its straight edge along X at ctr, the round side up, t thick in Y
    bm = bmesh.new(); f = [bm.verts.new((ctr[0] + r * math.cos(math.pi * k / segs), ctr[1], ctr[2] + r * math.sin(math.pi * k / segs))) for k in range(segs + 1)]
    face = bm.faces.new(f); ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]: v.co.y += t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); G.uv_world(me, Matrix.Identity(4), 0.5); return G._obj(name, c, me, mat)

W, H = 6.0, 5.4   # (a tenant module: 6 m along the wall, the parapet's top 5.4 m up)

@piece('sm_unit_a', 'Storefront', len=W)
def _(c):
    # the plain one: stucco piers, the storefront, a sign cabinet over it, two gooseneck lights
    ox0, ox1, top = -2.55, 2.55, 3.05
    wall_around(c, -W / 2, W / 2, ox0, ox1, top, H)
    for x in (-W / 2 + 0.2, W / 2 - 0.2): bbox('pier', c, (0.4, 0.12, H - 0.5), (x, -0.06, (H - 0.5) / 2 + 0.25), STUCCO2, bev=0.01)
    storefront(c, ox0, ox1, top, door_at=1.6)
    parapet_trim(c, -W / 2, W / 2, H)
    sg = sign_cabinet(c, 0, 4.05, 4.2, 0.72)
    for x in (-1.4, 1.4): bolt_light(c, x, 4.75)
    rd('downspout', c, (W / 2 - 0.05, -0.07, 0.1), (W / 2 - 0.05, -0.07, H - 0.2), 0.05, GALV, verts=6)
    return {'sign': sg}

for col in ('red', 'green', 'blue', 'tan'):
    @piece('sm_unit_awn_' + col, 'Storefront with Awning', len=W, front=1.4)
    def _(c, col=col):
        # a fabric shed awning over the storefront: a steel frame, the canvas sloping out, a valance; a smaller sign above
        ox0, ox1, top = -2.55, 2.55, 3.05
        wall_around(c, -W / 2, W / 2, ox0, ox1, top, H)
        storefront(c, ox0, ox1, top, door_at=-1.6)
        parapet_trim(c, -W / 2, W / 2, H)
        zi, zo, out = 3.55, 2.95, 1.35
        me = bpy.data.meshes.new('canvas'); me.from_pydata([(-2.75, 0, zi), (2.75, 0, zi), (2.75, -out, zo), (-2.75, -out, zo)], [], [(0, 1, 2, 3)])
        uv = me.uv_layers.new()
        for li, (u, v) in zip(me.polygons[0].loop_indices, ((0, 1), (3, 1), (3, 0), (0, 0))): uv.data[li].uv = (u, v)
        G._obj('canvas', c, me, AWN[col])
        o = card('valance', c, 5.5, 0.32, (0, -out, zo - 0.32), AWN[col]); mk(o)
        for d in o.data.uv_layers[0].data: d.uv = (d.uv[0] * 3, d.uv[1] * 0.3)
        for s in (-1, 1): # (its side panels and frame arms)
            me2 = bpy.data.meshes.new('side'); me2.from_pydata([(s * 2.75, 0, zi), (s * 2.75, -out, zo), (s * 2.75, -out, zo - 0.32)], [], [(0, 1, 2)]); G._obj('side', c, me2, AWN[col])
            rd('arm', c, (s * 2.7, 0, zi - 0.55), (s * 2.7, -out + 0.05, zo - 0.05), 0.018, BRONZE, verts=4)
        sg = sign_cabinet(c, 0, 4.4, 3.4, 0.55)
        return {'sign': sg}

@piece('sm_unit_c', 'Storefront under Tile', len=W, front=1.0)
def _(c):
    # Spanish: a clay-tile mansard over the storefront on exposed rafter tails, the sign below it on the wall
    ox0, ox1, top = -2.55, 2.55, 3.0
    wall_around(c, -W / 2, W / 2, ox0, ox1, top, H)
    storefront(c, ox0, ox1, top, door_at=0.0)
    parapet_trim(c, -W / 2, W / 2, H)
    zi, zo, out = 4.85, 4.1, 0.95
    me = bpy.data.meshes.new('mansard'); me.from_pydata([(-W / 2, 0, zi), (W / 2, 0, zi), (W / 2, -out, zo), (-W / 2, -out, zo)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for li, (u, v) in zip(me.polygons[0].loop_indices, ((0, 1), (4, 1), (4, 0), (0, 0))): uv.data[li].uv = (u, v)
    G._obj('mansard', c, me, TILE)
    bx('ridgecap', c, (W, 0.2, 0.1), (0, -0.05, zi + 0.04), TILE)
    for k in range(13): bx('rafter', c, (0.09, out + 0.1, 0.12), (-W / 2 + 0.25 + k * 0.46, -out / 2 + 0.05, (zi + zo) / 2 - 0.14), RAFTER)
    sg = sign_cabinet(c, 0, 3.42, 3.8, 0.52)
    for x in (-W / 2 + 0.6, W / 2 - 0.6):   # (wall lanterns)
        bbox('lantern', c, (0.22, 0.22, 0.36), (x, -0.2, 2.6), BRONZE, bev=0.02); bbox('lglass', c, (0.16, 0.16, 0.24), (x, -0.2, 2.6), LAMP, bev=0.01)
    return {'sign': sg}

@piece('sm_walkway', 'Covered Walkway', len=W, front=3.4)
def _(c):
    # a covered walkway section along the shops: a stucco column (at its left end: sections line up), the beam, a
    # flat canopy under a clay-tile slope, a soffit light, the walk itself with its curb
    D = 3.2
    bbox('walk', c, (W, D + 0.1, 0.15), (0, -D / 2, 0.075), CONC, bev=0.01)
    bbox('curb', c, (W, 0.15, 0.15), (0, -D - 0.05, 0.075), CONC, bev=0.01)
    x = -W / 2
    bbox('colbase', c, (0.6, 0.6, 0.35), (x, -D + 0.25, 0.32), STUCCO2, bev=0.02)
    o = bbox('column', c, (0.46, 0.46, 3.0), (x, -D + 0.25, 1.95), STUCCO, bev=0.02); G.grid_out(o, 1.4)
    bbox('colcap', c, (0.62, 0.62, 0.22), (x, -D + 0.25, 3.55), STUCCO2, bev=0.02)
    o = bbox('beam', c, (W, 0.5, 0.6), (0, -D + 0.25, 3.95), STUCCO, bev=0.02); G.grid_out(o, 1.4)
    bx('soffit', c, (W, D, 0.06), (0, -D / 2 + 0.05, 3.66), STUCCO2)
    disc = lathe('soffitlight', c, [(0, 0), (0.18, 0), (0.18, -0.04), (0, -0.05)], (0, -D / 2, 3.63), LAMP, segs=10)
    me = bpy.data.meshes.new('tileslope'); me.from_pydata([(-W / 2, 0, 4.9), (W / 2, 0, 4.9), (W / 2, -D - 0.1, 4.25), (-W / 2, -D - 0.1, 4.25)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for li, (u, v) in zip(me.polygons[0].loop_indices, ((0, 2), (4, 2), (4, 0), (0, 0))): uv.data[li].uv = (u, v)
    G._obj('tileslope', c, me, TILE)

@piece('sm_endtower', 'End Tower', len=W, front=1.2)
def _(c):
    # the taller block at the end of a strip center: proud of the wall, a hip tile roof, a recessed panel, a vent
    D = 1.2; HT = 7.6
    o = bbox('tower', c, (W, D + 0.3, HT), (0, -D / 2 + 0.15, HT / 2), STUCCO, bev=0.02); G.grid_out(o, 1.4)
    bbox('panel', c, (W - 1.4, 0.06, 2.0), (0, -D - 0.02, 5.2), STUCCO2, bev=0.01)
    bbox('tcornice', c, (W + 0.12, D + 0.42, 0.22), (0, -D / 2 + 0.15, HT - 0.2), COPE, bev=0.02)
    bbox('tband', c, (W + 0.06, D + 0.36, 0.16), (0, -D / 2 + 0.15, 3.6), STUCCO2, bev=0.01)
    # (an arched niche: a darker recess with a half-round head)
    bx('niche', c, (1.4, 0.05, 1.6), (0, -D - 0.03, 2.0), STUCCO2)
    lathe('nichehead', c, [(0, 0), (0.7, 0), (0.7, 0.05), (0, 0.05)], (0, -D - 0.005, 2.8), STUCCO2, segs=12, rot=(math.pi / 2, 0, 0))
    bbox('vent', c, (0.8, 0.05, 0.5), (0, -D - 0.05, 6.6), GRATE)
    bbox('tbase', c, (W + 0.04, D + 0.34, 0.5), (0, -D / 2 + 0.15, 0.25), STUCCO2, bev=0.01)
    bm = bmesh.new(); hw, hd, z0, z1 = W / 2 + 0.3, (D + 0.6) / 2, HT, HT + 1.8
    cyc = -D / 2 + 0.15
    vs = [bm.verts.new(v) for v in ((-hw, cyc - hd, z0), (hw, cyc - hd, z0), (hw, cyc + hd, z0), (-hw, cyc + hd, z0), (-hw * 0.35, cyc, z1), (hw * 0.35, cyc, z1))]
    for f in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)): bm.faces.new([vs[i] for i in f])
    me = bpy.data.meshes.new('hiproof'); bm.to_mesh(me); bm.free(); G.uv_world(me, Matrix.Identity(4), 0.6); G._obj('hiproof', c, me, TILE)

@piece('sm_pylon', 'Tenant Pylon Sign', front=0)
def _(c):
    # the tenant sign by the road: two stucco legs on a planter base, six tenant panels, a tile cap
    for x in (-1.55, 1.55): o = bbox('leg', c, (0.5, 0.6, 5.2), (x, 0, 2.6), STUCCO, bev=0.02); G.grid_out(o, 1.4)
    bbox('planter', c, (4.2, 1.2, 0.5), (0, 0, 0.25), STUCCO2, bev=0.03)
    bbox('frame', c, (2.7, 0.35, 3.6), (0, 0, 3.0), BRONZE, bev=0.02)
    signs = []
    for k in range(6):
        z = 1.55 + k * 0.58
        o = card('panel', c, 2.5, 0.48, (0, -0.18, z - 0.24), SIGNFACE); mk(o); signs.append([0, -0.19, z, 2.5, 0.48])
    bbox('header', c, (3.7, 0.7, 0.55), (0, 0, 5.05), STUCCO2, bev=0.02)
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in ((-2.0, -0.45, 5.33), (2.0, -0.45, 5.33), (2.0, 0.45, 5.33), (-2.0, 0.45, 5.33), (-1.2, 0, 6.0), (1.2, 0, 6.0))]
    for f in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)): bm.faces.new([vs[i] for i in f])
    me = bpy.data.meshes.new('cap'); bm.to_mesh(me); bm.free(); G.uv_world(me, Matrix.Identity(4), 0.6); G._obj('cap', c, me, TILE)
    return {'signs': signs}

@piece('rt_hvac', 'Rooftop HVAC Unit')
def _(c):
    # a packaged rooftop unit on its curb: a galvanized cabinet, louvred condenser sides, a fan guard on top, a
    # service panel with its latches, the gas line and the duct going down into the roof
    bbox('curb', c, (2.3, 1.4, 0.35), (0, 0, 0.175), UNIT, bev=0.02)
    o = bbox('cabinet', c, (2.2, 1.3, 1.0), (0, 0, 0.85), UNIT, bev=0.03); G.grid_out(o, 0.6)
    for s in (-1, 1):
        o = bx('louver', c, (1.0, 0.03, 0.7), (0.5, s * 0.66, 0.85), GRATE); G.retile(o, 4.0)
        for k in range(6): bx('fin', c, (1.0, 0.05, 0.02), (0.5, s * 0.68, 0.56 + k * 0.11), UNIT)
    o = lathe('fan', c, [(0, 0), (0.42, 0), (0.42, 0.12), (0.4, 0.14), (0, 0.14)], (0.5, 0, 1.35), GRATE, segs=12); G.retile(o, 4.0)
    for k in range(4): bx('panelseam', c, (0.02, 0.01, 0.9), (-0.95 + k * 0.32, -0.655, 0.85), DARK)
    bx('hub', c, (0.12, 0.12, 0.06), (0.5, 0, 1.5), DARK)
    for z in (0.6, 1.1): bx('latch', c, (0.05, 0.03, 0.04), (-0.9, -0.67, z), DARK)
    sweep('gas', c, [(-1.1, 0.3, 0.6), (-1.35, 0.3, 0.6), (-1.35, 0.3, 0.05)], 0.025, solid_mat('shop_GasYellow', (0.8, 0.62, 0.08), 0.5), segs=6, per_m=10)

@piece('rt_vent', 'Roof Vent')
def _(c):
    lathe('vent', c, [(0, 0), (0.14, 0), (0.14, 0.5), (0.3, 0.55), (0.3, 0.62), (0.0, 0.72)], (0, 0, 0), GALV, segs=10)

@piece('sm_dumpster', 'Dumpster Enclosure', front=0)
def _(c):
    # three block walls with a cap course, two steel gates (one ajar), the dumpster inside
    for (sx, sy, x, y) in ((4.0, 0.2, 0, 1.4), (0.2, 3.0, -1.9, 0), (0.2, 3.0, 1.9, 0)):
        o = bbox('cmu', c, (sx, sy, 1.9), (x, y, 0.95), CMU, bev=0.006); G.retile(o, 0.6)
        bbox('cap', c, (sx + 0.06, sy + 0.06, 0.08), (x, y, 1.94), CONC, bev=0.01)
    # the gates: a steel frame with corrugated infill each, hung on the side walls; the right one a little ajar
    bbox('gateL', c, (1.85, 0.06, 1.6), (-0.95, -1.5, 0.95), GALV, bev=0.01)
    a = 0.4; bbox('gateR', c, (1.85, 0.06, 1.6), (1.85 - 0.925 * math.cos(a), -1.5 - 0.925 * math.sin(a), 0.95), GALV, bev=0.01, rot=(0, 0, a))
    for x in (-1.82, 1.82): rd('hingepost', c, (x, -1.5, 0.1), (x, -1.5, 1.8), 0.04, GALV, verts=6)
    o = bbox('dumpster', c, (2.0, 1.2, 1.2), (0, 0.4, 0.72), solid_mat('shop_DumpsterGreen', (0.12, 0.26, 0.16), 0.6), bev=0.04)
    bbox('lid', c, (2.0, 1.2, 0.06), (0, 0.4, 1.36), DARK, bev=0.01)
    for x in (-0.8, 0.8): lathe('wheel', c, [(0, 0), (0.08, 0), (0.08, 0.05), (0, 0.05)], (x, -0.1, 0.08), DARK, segs=8, rot=(0, math.pi / 2, 0))

# ---------------------------------------------------------------- raised parapets (the strip mall's roofline)
def unit_plain(c, door_at=1.6):
    ox0, ox1, top = -2.55, 2.55, 3.05
    wall_around(c, -W / 2, W / 2, ox0, ox1, top, H)
    for x in (-W / 2 + 0.2, W / 2 - 0.2): bbox('pier', c, (0.4, 0.12, H - 0.5), (x, -0.06, (H - 0.5) / 2 + 0.25), STUCCO2, bev=0.01)
    storefront(c, ox0, ox1, top, door_at=door_at)
    bbox('base', c, (W, 0.34, 0.5), (0, 0.13, 0.25), STUCCO2, bev=0.01)
    rd('downspout', c, (W / 2 - 0.05, -0.07, 0.1), (W / 2 - 0.05, -0.07, H - 0.2), 0.05, GALV, verts=6)

@piece('sm_unit_peak', 'Storefront, Raised Gable', len=W)
def _(c):
    # a tenant whose parapet rises to a tile-capped gable over its sign: the roofline's break
    unit_plain(c, door_at=-1.6)
    P = 7.6
    o = bbox('raise', c, (W, 0.3, P - H), (0, 0.15, H + (P - H) / 2), STUCCO, bev=0.006); G.grid_out(o, 1.4)
    bbox('cornice', c, (W, 0.14, 0.18), (0, -0.06, H - 0.35), STUCCO2, bev=0.02)
    # the gable: a triangle of wall, its tile cap on both slopes
    me = bpy.data.meshes.new('gable'); me.from_pydata([(-W / 2, 0, P), (W / 2, 0, P), (0, 0, P + 1.5), (-W / 2, 0.3, P), (W / 2, 0.3, P), (0, 0.3, P + 1.5)], [], [(0, 1, 2), (5, 4, 3)])
    G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('gable', c, me, STUCCO)
    for sg in (-1, 1):   # (a tile cap down each slope: a box along X turned about Y to the slope)
        a, b = Vector((0, 0, P + 1.55)), Vector((sg * (W / 2 + 0.25), 0, P - 0.1)); mid = (a + b) / 2; L = (b - a).length
        ang = math.atan2(b.z - a.z, b.x - a.x)
        bbox('gcap', c, (L, 0.6, 0.12), (mid.x, 0.12, mid.z), TILE, rot=(0, -ang, 0), bev=0.02)
    bbox('pband', c, (W + 0.04, 0.2, 0.16), (0, -0.04, P - 0.05), COPE, bev=0.01)
    sg_ = sign_cabinet(c, 0, 4.4, 4.2, 0.8)
    for x in (-1.5, 1.5): bolt_light(c, x, 5.15)
    bx('medallion', c, (0.9, 0.06, 0.9), (0, -0.03, P + 0.55), STUCCO2)
    return {'sign': sg_}

@piece('sm_unit_tower', 'Storefront, Raised Square', len=W)
def _(c):
    # a raised square parapet with a deep cornice and a recessed panel (the other common roofline break)
    unit_plain(c, door_at=1.6)
    P = 7.0
    o = bbox('raise', c, (W - 0.6, 0.5, P - H + 0.2), (0, 0.05, H + (P - H) / 2 - 0.1), STUCCO, bev=0.01); G.grid_out(o, 1.4)
    bbox('rcornice', c, (W - 0.2, 0.8, 0.28), (0, 0.05, P), COPE, bev=0.03)
    bbox('rpanel', c, (W - 2.0, 0.06, 0.9), (0, -0.22, H + 0.75), STUCCO2, bev=0.01)
    bbox('coping', c, (W + 0.04, 0.42, 0.12), (0, 0.1, H + 0.06), COPE, bev=0.02)
    sg_ = sign_cabinet(c, 0, 4.1, 4.2, 0.72)
    for x in (-1.4, 1.4): bolt_light(c, x, 4.8)
    return {'sign': sg_}

# ---------------------------------------------------------------- life on the walk
BENCHM = plain_mat('shop_BenchGreen', (0.12, 0.22, 0.16), dirt=0.12, rough=0.5)
LEAF = plain_mat('shop_Leaf', (0.2, 0.34, 0.14), dirt=0.08, fleck=0.2)
@piece('sm_bench', 'Bench')
def _(c):
    # a steel slat bench: two cast end frames, five slats, the back
    for x in (-0.8, 0.8):
        bbox('leg', c, (0.06, 0.5, 0.42), (x, 0, 0.21), BENCHM, bev=0.01); bbox('armrest', c, (0.08, 0.55, 0.05), (x, 0.02, 0.66), BENCHM, bev=0.01)
        rd('backpost', c, (x, 0.22, 0.42), (x, 0.3, 0.9), 0.025, BENCHM, verts=6)
    for k in range(5): bbox('slat', c, (1.8, 0.07, 0.035), (0, -0.2 + k * 0.1, 0.44), BENCHM, bev=0.005)
    for k in range(3): bbox('bslat', c, (1.8, 0.03, 0.07), (0, 0.26 + k * 0.012, 0.56 + k * 0.12), BENCHM, bev=0.005)

@piece('sm_planter', 'Planter')
def _(c):
    bbox('box', c, (1.6, 0.8, 0.6), (0, 0, 0.3), STUCCO2, bev=0.03); bbox('lip', c, (1.7, 0.9, 0.06), (0, 0, 0.61), COPE, bev=0.01)
    bx('soil', c, (1.5, 0.7, 0.02), (0, 0, 0.58), DARK)
    for (x, sz) in ((-0.45, 0.42), (0.05, 0.5), (0.5, 0.38)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=sz, location=(x, 0, 0.62 + sz * 0.7)); o = bpy.context.active_object; o.name = 'shrub'
        o.scale = (1, 0.8, 0.85); G.link(o, c); o.data.materials.append(LEAF); G.uv_world(o.data, o.matrix_world, 1.0); mk(o)

@piece('sm_trash', 'Trash Receptacle')
def _(c):
    lathe('can', c, [(0, 0), (0.28, 0), (0.28, 0.9), (0.3, 0.92), (0, 0.92)], (0, 0, 0), BENCHM, segs=12)
    lathe('lid', c, [(0, 0), (0.32, 0), (0.3, 0.08), (0.12, 0.16), (0, 0.17)], (0, 0, 0.92), BENCHM, segs=12)
    for k in range(10): a = k / 10 * math.tau; rd('slat', c, (0.295 * math.cos(a), 0.295 * math.sin(a), 0.08), (0.295 * math.cos(a), 0.295 * math.sin(a), 0.86), 0.018, BENCHM, verts=4)
    bx('mouth', c, (0.3, 0.02, 0.12), (0, -0.33, 1.0), DARK)

@piece('sm_bikerack', 'Bike Rack')
def _(c):
    pts = [(-1.0, 0, 0)]
    for k in range(5): pts += [(-1.0 + k * 0.4 + 0.05, 0, 0.75), (-1.0 + k * 0.4 + 0.2, 0, 0.75), (-1.0 + k * 0.4 + 0.35, 0, 0.02)]
    sweep('wave', c, pts, 0.025, GALV, segs=6, per_m=10)

@piece('sm_newsbox', 'Newspaper Boxes')
def _(c):
    for x, col in ((-0.3, (0.12, 0.3, 0.6)), (0.3, (0.8, 0.62, 0.1))):
        m = plain_mat('shop_News%d' % int(x * 10 + 9), col, dirt=0.15)
        bbox('box', c, (0.5, 0.45, 0.6), (x, 0, 0.75), m, bev=0.02); bx('window', c, (0.38, 0.01, 0.28), (x, -0.23, 0.82), GLASS)
        bbox('coin', c, (0.12, 0.06, 0.1), (x + 0.12, -0.24, 1.0), GALV, bev=0.01)
        for dx in (-0.2, 0.2): rd('leg', c, (x + dx, 0, 0), (x + dx, 0, 0.45), 0.02, GALV, verts=4)

@piece('sm_icebox', 'Ice Merchandiser')
def _(c):
    WHITE = plain_mat('shop_IceWhite', (0.86, 0.88, 0.9), dirt=0.12)
    bbox('body', c, (1.5, 0.75, 1.7), (0, 0, 0.85), WHITE, bev=0.03)
    o = card('label', c, 1.2, 0.6, (0, -0.38, 0.95), tex('shop_ice', 0.06)); mk(o)
    for x in (-0.37, 0.37): bx('door', c, (0.7, 0.02, 0.8), (x, -0.385, 0.5), WHITE); bbox('handle', c, (0.25, 0.04, 0.04), (x, -0.41, 0.85), GALV, bev=0.01)
    bbox('grille', c, (1.3, 0.05, 0.15), (0, -0.39, 0.12), GRATE, bev=0.01)

# ---------------------------------------------------------------- the gas station
RED = plain_mat('shop_CanopyRed', (0.66, 0.08, 0.08), dirt=0.08, rough=0.4)
WHITEP = plain_mat('shop_CanopyWhite', (0.9, 0.9, 0.88), dirt=0.08, rough=0.4)
YEL = plain_mat('shop_Yellow', (0.86, 0.66, 0.06), dirt=0.15)
@piece('gs_canopy', 'Gas Station Canopy', front=0)
def _(c):
    # a 15 x 10 m canopy on four clad columns over two pump islands: a deep fascia (white with a red band), recessed
    # lights under it, a concrete pad; each island a curb with a bollard at each end and two dispensers (screens,
    # nozzles in their holsters, hoses hanging), a trash can and a squeegee bucket
    CW, CD, CH = 15.0, 10.0, 5.2
    o = bbox('pad', c, (CW + 3, CD + 4, 0.12), (0, 0, 0.06), CONC, bev=0.01); G.grid_out(o, 2.0)
    bbox('deck', c, (CW, CD, 0.5), (0, 0, CH + 0.25), WHITEP, bev=0.02)
    o = bbox('fascia', c, (CW + 0.2, CD + 0.2, 1.0), (0, 0, CH + 0.9), WHITEP, bev=0.03)
    for sgn in (-1, 1): bx('band', c, (CW + 0.24, 0.02, 0.32), (0, sgn * (CD / 2 + 0.11), CH + 0.75), RED); bx('bandE', c, (0.02, CD + 0.24, 0.32), (sgn * (CW / 2 + 0.11), 0, CH + 0.75), RED)
    o = card('brand', c, 5.0, 0.55, (0, -CD / 2 - 0.13, CH + 1.0), SIGNFACE); mk(o); sign = [0, -CD / 2 - 0.14, CH + 1.27, 5.0, 0.55]
    for x in (-5.5, -2.7, 0, 2.7, 5.5):
        for y in (-3, 0, 3): lathe('light', c, [(0, 0), (0.3, 0), (0.3, -0.05), (0, -0.06)], (x, y, CH - 0.0), LAMP, segs=8)
    for x in (-4.5, 4.5):
        for y in (-2.2, 2.2):
            lathe('column', c, [(0.3, 0.12), (0.3, CH), (0, CH)], (x, y, 0), WHITEP, segs=10)
            lathe('colbase', c, [(0.42, 0.12), (0.42, 0.9), (0.3, 1.0), (0, 1.0)], (x, y, 0), RED, segs=10)
    for ix in (-4.5, 4.5):  # (the islands, along y)
        bbox('island', c, (1.2, 6.0, 0.2), (ix, 0, 0.22), CONC, bev=0.04)
        for y in (-3.2, 3.2): lathe('bollard', c, [(0, 0.3), (0.12, 0.3), (0.12, 1.3), (0, 1.36)], (ix, y, 0), YEL, segs=10)
        for y, side in ((-1.4, 0), (1.4, 1)):
            bbox('disp', c, (0.7, 1.1, 1.9), (ix, y, 1.27), WHITEP, bev=0.04)
            bbox('dtop', c, (0.75, 1.15, 0.35), (ix, y, 2.4), RED, bev=0.03)
            for sx in (-1, 1):
                bx('screen', c, (0.02, 0.4, 0.3), (ix + sx * 0.36, y, 1.7), GLASS)
                bbox('keypad', c, (0.02, 0.2, 0.18), (ix + sx * 0.36, y + 0.32, 1.35), DARK, bev=0.005)
                for k, ny in enumerate((-0.35, 0.0, 0.35)):
                    bbox('holster', c, (0.08, 0.12, 0.2), (ix + sx * 0.39, y + ny, 1.05), DARK, bev=0.01)
                    sweep('hose', c, [(ix + sx * 0.36, y + ny, 2.2), (ix + sx * 0.7, y + ny, 1.6), (ix + sx * 0.6, y + ny, 0.7), (ix + sx * 0.42, y + ny, 1.0)], 0.018, DARK, segs=4, per_m=6)
        lathe('bin', c, [(0, 0.32), (0.22, 0.32), (0.22, 1.1), (0, 1.1)], (ix, 0, 0), BENCHM, segs=10)
    return {'sign': sign}

@piece('gs_price', 'Gas Price Sign', front=0)
def _(c):
    # the price sign by the road: a brick base, two legs, the brand panel and the three prices
    bbox('base', c, (3.2, 1.0, 0.8), (0, 0, 0.4), CMU, bev=0.02)
    for x in (-1.2, 1.2): bbox('leg', c, (0.3, 0.3, 5.5), (x, 0, 3.2), GALV, bev=0.02)
    bbox('cabinet', c, (2.8, 0.4, 3.6), (0, 0, 4.4), WHITEP, bev=0.04)
    o = card('brand', c, 2.5, 0.9, (0, -0.21, 5.25), SIGNFACE); mk(o)
    o = card('prices', c, 2.5, 1.9, (0, -0.21, 2.95), tex('shop_price', 0.03)); mk(o)
    bx('band', c, (2.84, 0.42, 0.25), (0, 0, 6.12), RED)
    return {'sign': [0, -0.22, 5.7, 2.5, 0.9]}

@piece('gs_air', 'Air and Water Machine', front=0)
def _(c):
    bbox('post', c, (0.3, 0.3, 1.0), (0, 0, 0.5), BENCHM, bev=0.02)
    bbox('box', c, (0.55, 0.4, 0.7), (0, 0, 1.3), RED, bev=0.03); bx('coin', c, (0.2, 0.02, 0.12), (0, -0.21, 1.45), GALV)
    sweep('hose', c, [(0.2, -0.2, 1.1), (0.45, -0.35, 0.6), (0.3, -0.3, 0.2), (0.0, -0.25, 0.35)], 0.015, DARK, segs=4, per_m=8)

# ---------------------------------------------------------------- the church
WHITEW = plain_mat('shop_ChurchWhite', (0.88, 0.86, 0.8), dirt=0.12)
SHINGLE = plain_mat('shop_Shingle', (0.2, 0.2, 0.22), dirt=0.1, fleck=0.12)
DOORW = plain_mat('shop_DoorWood', (0.34, 0.2, 0.12), dirt=0.15)
STAINED = tex('shop_stained', 0.05)
@piece('ch_church', 'Church', front=0)
def _(c):
    # a white clapboard-and-stucco nave (10 x 22 m) under a steep gable roof, five tall arched windows each side,
    # an entry porch with its own gable and double doors, steps, and the steeple at the front: a square tower, a
    # louvred belfry, a tall spire and its cross
    NW, NL, NH = 10.0, 22.0, 5.2
    o = bbox('nave', c, (NW, NL, NH), (0, NL / 2, NH / 2), WHITEW, bev=0.02); G.grid_out(o, 2.0)
    bbox('foundation', c, (NW + 0.2, NL + 0.2, 0.5), (0, NL / 2, 0.25), CONC, bev=0.02)
    ridge = NH + 5.2
    for sg in (-1, 1):   # (the roof's two slopes, with an overhang)
        me = bpy.data.meshes.new('slope'); me.from_pydata([(sg * (NW / 2 + 0.5), -0.4, NH - 0.3), (sg * (NW / 2 + 0.5), NL + 0.4, NH - 0.3), (0, NL + 0.4, ridge), (0, -0.4, ridge)], [], [(0, 1, 2, 3)]); G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('slope', c, me, SHINGLE)
    for y in (0.0, NL):
        me = bpy.data.meshes.new('gableend'); me.from_pydata([(-NW / 2, y, NH), (NW / 2, y, NH), (0, y, ridge - 0.2)], [], [(0, 1, 2)]); G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('gableend', c, me, WHITEW)
    for sg in (-1, 1):
        for k in range(5):
            y = 6.0 + k * 3.4
            o = card('win', c, 1.1, 2.6, (sg * (NW / 2 + 0.01), y, 1.1), STAINED, rotz=sg * math.pi / 2); mk(o)
            o = halfdisc('archhead', c, (0, 0, 0), 0.55, 0.02, STAINED, segs=10); o.data.transform(Matrix.Translation((sg * (NW / 2 + 0.015), y, 3.7)) @ Matrix.Rotation(sg * math.pi / 2, 4, 'Z'))
            bbox('sill', c, (0.15, 1.3, 0.1), (sg * (NW / 2 + 0.06), y, 1.05), WHITEW, bev=0.01)
    # the porch
    bbox('porch', c, (4.6, 3.0, 3.6), (0, -1.4, 1.8), WHITEW, bev=0.02)
    me = bpy.data.meshes.new('pgable'); me.from_pydata([(-2.6, -3.0, 3.5), (2.6, -3.0, 3.5), (0, -3.0, 5.4)], [], [(0, 1, 2)]); G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('pgable', c, me, WHITEW)
    for sg in (-1, 1):
        me = bpy.data.meshes.new('proof'); me.from_pydata([(sg * 2.8, -3.2, 3.4), (sg * 2.8, 0.2, 3.4), (0, 0.2, 5.5), (0, -3.2, 5.5)], [], [(0, 1, 2, 3)]); G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('proof', c, me, SHINGLE)
    for x in (-0.6, 0.6): bx('door', c, (1.1, 0.06, 2.6), (x, -2.93, 1.55), DOORW); bbox('ring', c, (0.06, 0.06, 0.2), (x * 0.25, -2.97, 1.4), BRONZE, bev=0.01)
    halfdisc('fanlight', c, (0, -2.97, 2.85), 1.1, 0.03, STAINED, segs=12)
    for k in range(3): bbox('step', c, (4.0 - k * 0.3, 0.4, 0.18), (0, -3.2 - (2 - k) * 0.4, 0.09 + k * 0.18), CONC, bev=0.01)
    # the steeple: tower, belfry, spire, cross
    TX0, TS = 0.0, 3.6
    o = bbox('tower', c, (TS, TS, 13.0), (0, 1.8, 6.5), WHITEW, bev=0.02); G.grid_out(o, 2.0)
    bbox('tband', c, (TS + 0.2, TS + 0.2, 0.25), (0, 1.8, 10.0), WHITEW, bev=0.02)
    bbox('belfry', c, (TS - 0.6, TS - 0.6, 2.6), (0, 1.8, 14.3), WHITEW, bev=0.02)
    for sg in (-1, 1):
        for k in range(5): bx('louver', c, (1.8, 0.05, 0.06), (0, 1.8 + sg * (TS / 2 - 0.29), 13.6 + k * 0.32), DARK); bx('louverE', c, (0.05, 1.8, 0.06), (sg * (TS / 2 - 0.29), 1.8, 13.6 + k * 0.32), DARK)
    bbox('bcap', c, (TS, TS, 0.3), (0, 1.8, 15.75), WHITEW, bev=0.02)
    bm = bmesh.new(); h0, h1, r = 15.9, 23.5, TS / 2 - 0.1
    vs = [bm.verts.new((x, 1.8 + y, h0)) for x, y in ((-r, -r), (r, -r), (r, r), (-r, r))]; top = bm.verts.new((0, 1.8, h1))
    for i in range(4): bm.faces.new([vs[i], vs[(i + 1) % 4], top])
    me = bpy.data.meshes.new('spire'); bm.to_mesh(me); bm.free(); G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('spire', c, me, SHINGLE)
    bx('crossV', c, (0.12, 0.12, 1.4), (0, 1.8, h1 + 0.7), BRONZE); bx('crossH', c, (0.7, 0.12, 0.12), (0, 1.8, h1 + 0.95), BRONZE)
    o = card('sign', c, 2.4, 0.6, (3.8, -4.5, 1.0), SIGNFACE); mk(o)
    for x in (2.7, 4.9): rd('signpost', c, (x, -4.45, 0), (x, -4.45, 1.7), 0.05, BRONZE, verts=6)
    return {'sign': [3.8, -4.52, 1.3, 2.4, 0.6]}

# ---------------------------------------------------------------- the supermarket
@piece('sp_entry', 'Supermarket Entrance', len=16.0, front=4.2)
def _(c):
    # the entry tower in the middle of a supermarket's front: a tall arched parapet with the store's sign, a vestibule
    # of glass with two sliding-door sets, a canopy out over the sidewalk on four columns, a cart corral each side
    EW, EH = 16.0, 10.5
    # (the tower's wall with the entrance cut through it: 12 m of glass, 4.2 m high, the doors in it)
    wall_around(c, -EW / 2, EW / 2, -6.2, 6.2, 4.2, EH)
    bbox('doorhead', c, (12.6, 0.4, 0.35), (0, -0.05, 4.3), BRONZE, bev=0.01)
    # the arch on top: a half-disc of wall
    halfdisc('arch', c, (0, -0.2, EH), EW / 2 - 1.0, 0.5, STUCCO, segs=18)
    bbox('archband', c, (EW + 0.3, 0.7, 0.3), (0, 0.05, EH + 0.05), COPE, bev=0.03)
    sg = sign_cabinet(c, 0, EH - 1.6, 9.0, 1.4)
    storefront(c, -6.2, -0.1, 4.2, door_at=-3.2); storefront(c, 0.1, 6.2, 4.2, door_at=3.2)
    bx('midpier', c, (0.3, 0.3, 4.2), (0, 0.0, 2.1), STUCCO2)
    for x in (-3.2, 3.2):   # (each door set: the sliding doors' operator box and two leaves of glass)
        bx('sliderhead', c, (2.4, 0.3, 0.35), (x, -0.2, 3.35), GALV)
        for dx in (-0.55, 0.55): bx('leaf', c, (1.05, 0.04, 2.9), (x + dx, -0.12, 1.6), BRONZE); o = card('leafglass', c, 0.9, 2.6, (x + dx, -0.15, 0.3), INSIDE); mk(o)
    CY = -4.0
    bbox('canopy', c, (EW - 1.0, 4.4, 0.45), (0, CY / 2 - 0.1, 4.6), STUCCO2, bev=0.02)
    bbox('cfascia', c, (EW - 0.9, 0.2, 0.7), (0, CY - 0.3, 4.6), COPE, bev=0.02)
    for x in (-6.5, -2.2, 2.2, 6.5):
        o = bbox('ccol', c, (0.5, 0.5, 4.4), (x, CY, 2.2), STUCCO, bev=0.02); bbox('ccap', c, (0.7, 0.7, 0.2), (x, CY, 4.3), STUCCO2, bev=0.02); bbox('cbase', c, (0.7, 0.7, 0.4), (x, CY, 0.2), STUCCO2, bev=0.02)
    o = bbox('walk', c, (EW + 4, 5.0, 0.15), (0, -2.5, 0.075), CONC, bev=0.01); G.grid_out(o, 2.0)
    return {'sign': sg}

@piece('sp_bay', 'Supermarket Wall Bay', len=8.0)
def _(c):
    # a stretch of a supermarket's long front: block wainscot, stucco above, pilasters, a high window band, a cornice
    BW, BH = 8.0, 7.8
    o = bbox('wall', c, (BW, 0.4, BH), (0, 0.2, BH / 2), STUCCO, bev=0.006); G.grid_out(o, 1.6)
    o = bbox('wainscot', c, (BW, 0.46, 1.4), (0, 0.17, 0.7), CMU, bev=0.006); G.retile(o, 0.6)
    for x in (-BW / 2 + 0.3, BW / 2 - 0.3): bbox('pilaster', c, (0.6, 0.2, BH - 0.3), (x, -0.08, BH / 2), STUCCO2, bev=0.01)
    bx('clerestory', c, (BW - 1.6, 0.04, 0.9), (0, -0.02, 5.6), GLASS); bx('cframe', c, (BW - 1.5, 0.08, 0.1), (0, -0.04, 6.1), BRONZE); bx('cframe2', c, (BW - 1.5, 0.08, 0.1), (0, -0.04, 5.15), BRONZE)
    bbox('cornice', c, (BW + 0.02, 0.5, 0.3), (0, 0.05, BH - 0.1), COPE, bev=0.02)

@piece('sp_bay_glass', 'Supermarket Window Bay', len=8.0)
def _(c):
    # the stretch beside a supermarket's entrance: a window wall (the checkouts behind it), a canopy strip over it
    BW, BH = 8.0, 7.8
    wall_around(c, -BW / 2, BW / 2, -3.5, 3.5, 3.6, BH)
    storefront(c, -3.5, 3.5, 3.6)
    for x in (-BW / 2 + 0.3, BW / 2 - 0.3): bbox('pilaster', c, (0.6, 0.2, BH - 0.3), (x, -0.08, BH / 2), STUCCO2, bev=0.01)
    bbox('awningstrip', c, (BW, 1.4, 0.3), (0, -0.7, 3.95), STUCCO2, bev=0.02)
    bx('clerestory', c, (BW - 1.6, 0.04, 0.9), (0, -0.02, 5.6), GLASS)
    bbox('cornice', c, (BW + 0.02, 0.5, 0.3), (0, 0.05, BH - 0.1), COPE, bev=0.02)

@piece('sp_carts', 'Cart Corral', front=0)
def _(c):
    # a steel cart corral (two rails on posts, a sign) with a line of nested carts
    for y in (-0.55, 0.55):
        rd('rail', c, (-2.0, y, 0.95), (2.0, y, 0.95), 0.03, GALV, verts=6); rd('rail2', c, (-2.0, y, 0.5), (2.0, y, 0.5), 0.03, GALV, verts=6)
        for x in (-2.0, 0, 2.0): rd('post', c, (x, y, 0), (x, y, 1.0), 0.035, GALV, verts=6)
    sweep('end', c, [(-2.0, -0.55, 0.95), (-2.35, 0, 0.95), (-2.0, 0.55, 0.95)], 0.03, GALV, segs=6, per_m=10)
    CART = plain_mat('shop_CartRed', (0.7, 0.1, 0.08), dirt=0.08, rough=0.4)
    for k in range(6):
        x = -1.6 + k * 0.55
        o = bbox('basket', c, (0.85, 0.5, 0.45), (x, 0, 0.75), GRATE, bev=0.01); G.retile(o, 3.0)
        bx('handle', c, (0.05, 0.52, 0.05), (x + 0.45, 0, 1.0), CART)
        bx('frame', c, (0.8, 0.45, 0.04), (x, 0, 0.3), GALV)
        for dx in (-0.35, 0.3):
            for dy in (-0.2, 0.2): lathe('wheel', c, [(0, 0), (0.06, 0), (0.06, 0.03), (0, 0.03)], (x + dx, dy, 0.06), DARK, segs=6, rot=(math.pi / 2, 0, 0))

# ---------------------------------------------------------------- planting round the buildings
LEAF2 = plain_mat('shop_LeafDark', (0.13, 0.25, 0.1), dirt=0.06, fleck=0.25)
@piece('sm_hedge', 'Clipped Hedge', len=2.0)
def _(c):
    # 2 m of clipped hedge (sections line up): a squared body, softened by lumps along its top and faces
    bbox('hedge', c, (2.02, 0.8, 0.95), (0, 0, 0.48), LEAF2, bev=0.12)
    for x in (-0.6, 0.0, 0.6):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.38, location=(x, 0, 0.88)); o = bpy.context.active_object; o.name = 'lump'
        o.scale = (1.0, 0.9, 0.45); G.link(o, c); o.data.materials.append(LEAF2); G.uv_world(o.data, o.matrix_world, 1.0); mk(o)

@piece('sm_shrubs', 'Shrub Bed')
def _(c):
    # a bark-mulch bed with a few round shrubs of two greens (round a sign, at a building's corner)
    bbox('mulch', c, (3.0, 1.6, 0.08), (0, 0, 0.04), plain_mat('shop_Mulch', (0.3, 0.18, 0.1), dirt=0.1, fleck=0.2), bev=0.03)
    for (x, y, r, m) in ((-1.0, 0.1, 0.5, LEAF), (-0.1, -0.2, 0.62, LEAF2), (0.85, 0.15, 0.45, LEAF), (0.35, 0.35, 0.35, LEAF2)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, r * 0.8)); o = bpy.context.active_object; o.name = 'shrub'
        o.scale = (1, 1, 0.85); G.link(o, c); o.data.materials.append(m); G.uv_world(o.data, o.matrix_world, 1.0); mk(o)

# ---------------------------------------------------------------- bake, export (the street kit's way)
def finish(pid, P):
    c = P['coll']; G.BUILT[:] = [o for o in c.objects if o.type == 'MESH']
    G.bake_ao(c, wall=False, distance=0.5, samples=32)
    bpy.ops.object.select_all(action='DESELECT')
    objs = [o for o in c.objects if o.type == 'MESH']
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = pid + '_src'
    return o

entries = []; ex = bpy.data.scenes.new('EXPORT')
for pid, P in PIECES.items():
    o = finish(pid, P); me = o.data.copy(); me.transform(o.matrix_world)
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    e2 = bpy.data.objects.new(pid, me); ex.collection.objects.link(e2)   # (kept in its own frame: the facade at y 0, centred on x)
    me.color_attributes.active_color = me.color_attributes.get('AO')
    tri = sum(len(p.vertices) - 2 for p in me.polygons)
    ent = {'cat': 'shopkit', 'cls': pid.split('_')[0] + '_' + pid.split('_')[1], 'tags': ['shop'], 'id': pid, 'pack': 'shopkit', 'label': P['label'],
           'w': round(max(xs) - min(xs), 2), 'h': round(max(zs) - min(zs), 2), 'd': round(max(ys) - min(ys), 2), 'tris': tri, 'ao': 1, 'hidden': 1,
           'box': [round(min(xs), 2), round(min(zs), 2), round(-max(ys), 2), round(max(xs), 2), round(max(zs), 2), round(-min(ys), 2)]}
    conv = lambda p: [round(p[0], 3), round(p[2], 3), round(-p[1], 3)] + list(p[3:])
    if P['extra'].get('sign'): s = P['extra']['sign']; ent['sign'] = conv(s[:3]) + s[3:]
    if P['extra'].get('signs'): ent['signs'] = [conv(s[:3]) + s[3:] for s in P['extra']['signs']]
    for k in ('len', 'front'):
        if k in P['extra']: ent[k] = P['extra'][k]
    entries.append(ent)
    print(f'{pid:18s} {tri:6d} tris  {ent["w"]} x {ent["d"]} x {ent["h"]} m', flush=True)

if '--blend' in args:
    p = os.path.join(OUTDIR, 'shopkit.blend'); bpy.ops.wm.save_as_mainfile(filepath=p); print('saved', p)
if '--no-export' not in args:
    out_glb = os.path.join(ROOT, 'assets', 'env', 'shopkit.glb'); cat_p = os.path.join(ROOT, 'assets', 'env', 'catalog.json')
    win = bpy.context.window
    if win: win.scene = ex
    with bpy.context.temp_override(scene=ex):
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=False, use_active_scene=True, export_apply=True, export_yup=True,
                                  export_image_format='WEBP', export_texcoords=True, export_normals=True, export_vertex_color='ACTIVE', export_materials='EXPORT',
                                  export_cameras=False, export_lights=False, export_extras=False)
    import shutil
    q = out_glb + '.q.glb'
    try: subprocess.run(['npx', '-y', '@gltf-transform/cli@4.1.1', 'quantize', out_glb, q], check=True, cwd=GEN, capture_output=True, timeout=300); shutil.move(q, out_glb)
    except Exception as e: print('(not quantized:', e, ')')
    cat = json.load(open(cat_p))
    cat['packs']['shopkit'] = {'title': 'San Velocita shop kit (tools/props/shopkit.py)', 'author': 'San Velocita GP', 'license': 'own', 'source': ''}
    cat['assets'] = [a for a in cat['assets'] if a.get('pack') != 'shopkit'] + entries
    open(cat_p, 'w').write(json.dumps(cat, indent=1, ensure_ascii=False))
    print('shopkit', len(entries), 'pieces', round(os.path.getsize(out_glb) / 1024), 'KB', flush=True)
