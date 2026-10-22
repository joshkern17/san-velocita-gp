# Pit building styles: the outside of the garage block, swapped while the garages (js/pitboxes.js: the rooms, their
# doors, shutters and the teams' signs) stay as they are. A style is four modular pieces the game lays along the
# garage line, one set per garage:
#   bay   everything over a garage door, the roof and the back (paddock side) wall: 14 m wide as made, stretched to
#         each garage's width (12-16 m)
#   pier  the wall between two doors, from the lane to the door's head: 1.5 m wide as made, stretched to fit
#   endL / endR  the block's two ends (side walls, the stairs up)
# Every style keeps a flat fascia from the door's head (4.0 m) to 6.2 m where the teams' signs hang (pitlife.js: 11 x
# 1.7 m at 5.05 m), so the signs read the same on all of them.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/props/pitstyles.py -- [--blend] [--export]
#
# Blender space: x along the garage line (0 = the middle of a garage), the front (the lane side) facing -Y with the
# garage line at y = 0, the block going back to y = 16, z up from the lane. The game maps it onto each garage's frame.
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grandstands as GS            # (its materials, mesh builder, railings, boards, seats; factory settings reset there)
G = GS.G
from garagelib import bbox, bx, cy, rd, sweep, lathe, mk, plain_mat, grimy_tile, solid_mat, cutout_mat

ROOT = G.ROOT
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTDIR = os.path.join(ROOT, 'models', 'trackside'); GEN = os.path.join(OUTDIR, 'src', 'pitstyle_gen')
G.configure(GEN, seed=1971)
G.TEX = os.path.join(ROOT, 'models', 'garage', 'src', 'psx_industrial')
DOOR_H, FASCIA, DEPTH, W, PIER = 4.0, 6.2, 16.0, 14.0, 1.5
M = GS.M

def extra_mats():
    M['render'] = plain_mat('PS_Render', (0.86, 0.82, 0.72), dirt=0.2)                 # painted render, cream
    M['render_trim'] = plain_mat('PS_RenderTrim', (0.64, 0.12, 0.10), dirt=0.15)       # heritage trim band, oxblood
    M['brick'] = grimy_tile('PS_Brick', 'brick.png', dirt=0.25)
    M['panel'] = plain_mat('PS_Panel', (0.20, 0.21, 0.23), dirt=0.08, rough=0.4)        # dark composite cladding
    M['alu'] = plain_mat('PS_Alu', (0.70, 0.72, 0.74), dirt=0.08, rough=0.35)          # brushed aluminium
    M['poly'] = plain_mat('PS_Poly', (0.72, 0.80, 0.82), dirt=0.12, rough=0.2)         # polycarbonate skylight
    M['timber'] = grimy_tile('PS_Timber', 'wood.png', dirt=0.2)
    M['green'] = plain_mat('PS_Green', (0.12, 0.30, 0.20), dirt=0.15)                  # shed doors / heritage windows

# ------------------------------------------------------------------ shared bits
def fascia(c, name, x0, x1, mat, z0=DOOR_H, z1=FASCIA, proud=0.0):
    # the sign band over the doors: flat, at the garage line (the signs hang 0.16 m in front of it)
    o = bx(name, c, (x1 - x0, 0.3, z1 - z0), ((x0 + x1) / 2, 0.15 - proud, (z0 + z1) / 2), mat); G.grid_out(o, 1.0); return o

def back_wall(c, name, x0, x1, top, mat, door=True, windows=(), trim=None):
    # the paddock side: a wall at y = DEPTH, a personnel door and a truck roller door per garage, windows above
    o = bx(name, c, (x1 - x0, 0.3, top), ((x0 + x1) / 2, DEPTH + 0.15, top / 2), mat); G.grid_out(o, 1.0)
    if door:
        sh = G.tiled_card(name + '_roll', c, 4.2, 3.8, (x0 + 4.2, DEPTH + 0.32, 0), M['shutter'], tile=1.0); sh.rotation_euler = (0, 0, math.pi)
        bbox(name + '_rollhead', c, (4.6, 0.25, 0.35), (x0 + 4.2, DEPTH + 0.42, 3.95), M['steel'], bev=0.02)
        bx(name + '_door', c, (1.0, 0.06, 2.1), (x1 - 3.0, DEPTH + 0.32, 1.05), M['green'])
        bbox(name + '_doorf', c, (1.2, 0.05, 2.25), (x1 - 3.0, DEPTH + 0.31, 1.12), M['white'], bev=0.01)
        bbox(name + '_lamp', c, (0.3, 0.2, 0.15), (x1 - 3.0, DEPTH + 0.42, 2.6), M['steel'], bev=0.02)
    for (zc, h, n) in windows:
        for k in range(n):
            xc = x0 + (k + 0.5) * (x1 - x0) / n
            bbox(f'{name}_w{zc:.1f}_{k}', c, (min(2.2, (x1 - x0) / n - 0.6), 0.06, h), (xc, DEPTH + 0.31, zc), M['glass'], bev=0.01)
            bbox(f'{name}_wf{zc:.1f}_{k}', c, (min(2.36, (x1 - x0) / n - 0.44), 0.05, h + 0.16), (xc, DEPTH + 0.305, zc), M['white'], bev=0.01)
    if trim: bbox(name + '_trim', c, (x1 - x0, 0.08, 0.4), ((x0 + x1) / 2, DEPTH + 0.33, top - 0.6), trim, bev=0.01)
    # a downpipe at the middle
    rd(name + '_dp', c, (0, DEPTH + 0.42, 0.1), (0, DEPTH + 0.42, top - 0.2), 0.07, M['galv'], verts=8)

def roof_slab(c, name, x0, x1, z, y0=0.0, y1=DEPTH + 0.3, t=0.35, mat=None):
    o = bx(name, c, (x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, z - t / 2), mat or M['conc']); G.grid_out(o, 2.0); return o

def side_wall(c, name, side, top, mat, y0=0.0, y1=DEPTH + 0.3):
    # an end of the block: the wall across it at x = 0 (the piece runs out to side * thickness)
    return bx(name, c, (0.35, y1 - y0, top), (side * 0.175, (y0 + y1) / 2, top / 2), mat)

def ext_stair(c, name, side, z_top, y_start, mat_tread, mat_side):
    # an outside stair up the end wall: from the paddock end towards the lane, a landing at the top
    rise, tread, w = 0.18, 0.28, 1.4; n = max(2, round(z_top / rise)); x = side * (0.35 + w / 2)
    for k in range(n):
        zt = (k + 1) * z_top / n; y = y_start - k * tread
        bx(f'{name}_s{k}', c, (w, tread, zt), (x, y - tread / 2, zt / 2), mat_side if k % 2 else mat_tread)
    yl = y_start - n * tread
    bx(name + '_land', c, (w, 1.6, 0.25), (x, yl - 0.8, z_top - 0.125), mat_side)                 # the landing: a slab on two posts
    for yy in (yl - 0.15, yl - 1.45): bbox(f'{name}_lp{yy:.1f}', c, (0.25, 0.25, z_top - 0.25), (x + side * (w / 2 - 0.2), yy, (z_top - 0.25) / 2), M['steel'], bev=0.01)
    GS.railing(name + '_rail', c, [(side * (0.35 + w), y_start, 0.2), (side * (0.35 + w), yl, z_top)], h=1.0, post=1.5, rails=(0.5,))
    GS.railing(name + '_railL', c, [(side * (0.35 + w), yl, z_top), (side * (0.35 + w), yl - 1.6, z_top)], h=1.0, post=1.5, rails=(0.5,))

# ------------------------------------------------------------------ the styles
# each returns its pieces' builders: bay(c), pier(c), end(c, side)
def modern():
    TOP = 13.2
    def bay(c):
        x0, x1 = -W / 2, W / 2
        fascia(c, 'fa', x0, x1, M['panel'])
        # the hospitality floor: a balcony slab out over the lane, glass balustrade, a glass wall set back, mullions
        bbox('bal', c, (W, 1.6, 0.25), (0, -0.5, FASCIA + 0.12), M['white'], bev=0.03)
        bx('bal_glass', c, (W, 0.04, 1.05), (0, -1.22, FASCIA + 0.78), M['glass'])
        bbox('bal_cap', c, (W, 0.1, 0.06), (0, -1.22, FASCIA + 1.33), M['alu'], bev=0.01)
        for k in range(11): rd(f'bal_p{k}', c, (x0 + k * W / 10, -1.22, FASCIA + 0.25), (x0 + k * W / 10, -1.22, FASCIA + 1.3), 0.025, M['alu'], verts=6)
        bx('f1_glass', c, (W, 0.06, 3.0), (0, 0.6, FASCIA + 1.75), M['glass'])
        for k in range(11): bx(f'f1_m{k}', c, (0.09, 0.18, 3.0), (x0 + k * W / 10, 0.55, FASCIA + 1.75), M['alu'])
        bx('f1_tr', c, (W, 0.18, 0.08), (0, 0.55, FASCIA + 2.35), M['alu'])
        # (inside, seen through the glass: a dark back, ceiling lights)
        bx('f1_in', c, (W, 0.1, 3.0), (0, 4.5, FASCIA + 1.75), M['dark'])
        bx('f1_ceil', c, (W, 4.0, 0.06), (0, 2.5, FASCIA + 3.2), M['white'])
        for k in range(4): bx(f'f1_l{k}', c, (1.4, 0.25, 0.04), (x0 + (k + 0.5) * W / 4, 2.0, FASCIA + 3.15), M['lamp'])
        # a spandrel, then the offices behind horizontal aluminium louvres
        bx('sp', c, (W, 0.35, 0.5), (0, 0.17, FASCIA + 3.5), M['panel'])
        bx('f2_glass', c, (W, 0.06, 2.8), (0, 0.45, FASCIA + 5.15), M['glass'])
        for k in range(9): bbox(f'f2_lv{k}', c, (W, 0.32, 0.05), (0, 0.05, FASCIA + 3.95 + k * 0.33), M['alu'], bev=0.01)
        for k in range(6): bx(f'f2_fin{k}', c, (0.12, 0.6, 2.9), (x0 + k * W / 5, 0.0, FASCIA + 5.15), M['panel'])
        # the roof: a thin white blade cantilevered out over the lane, downlights under its tip, plant on top
        roof_slab(c, 'roof', x0, x1, TOP, y0=-3.6, t=0.45, mat=M['white'])
        bx('roof_fascia', c, (W, 0.3, 0.7), (0, -3.5, TOP - 0.35), M['panel'])
        for k in range(4):
            xc = x0 + (k + 0.5) * W / 4
            bbox(f'dl{k}', c, (0.8, 0.5, 0.18), (xc, -2.6, TOP - 0.54), M['steel'], bev=0.02)
            bx(f'dll{k}', c, (0.66, 0.38, 0.03), (xc, -2.6, TOP - 0.64), M['lamp'])
        bx('wall_up', c, (W, 0.3, TOP - FASCIA), (0, 4.65, (TOP + FASCIA) / 2), M['clad'])       # (behind the glass floors)
        bbox('ac', c, (3.0, 2.2, 1.4), (2.5, 11.0, TOP + 0.7), M['galv'], bev=0.05)
        for k in range(2): cy(f'acfan{k}', c, 0.55, 0.08, (1.7 + k * 1.6, 11.0, TOP + 1.42), M['dark'], verts=12)
        GS.railing('roofrail', c, [(x0, -3.4, TOP), (x1, -3.4, TOP)], h=0.9, post=2.0, rails=(0.45,))
        back_wall(c, 'back', x0, x1, TOP, M['clad'], windows=((7.6, 1.2, 4), (10.8, 1.2, 4)))
    def pier(c):
        bbox('col', c, (PIER, 0.5, DOOR_H), (0, -0.05, DOOR_H / 2), M['alu'], bev=0.03)
        bx('strip', c, (0.12, 0.04, DOOR_H - 0.6), (0, -0.32, DOOR_H / 2), M['lamp'])          # a light strip down it
        bbox('plinth', c, (PIER + 0.1, 0.6, 0.25), (0, -0.05, 0.125), M['panel'], bev=0.02)
    def end(c, side):
        side_wall(c, 'sw', side, TOP, M['clad'])
        bx('sw_glass', c, (0.06, 4.0, TOP - 5.0), (side * 0.38, 3.0, (TOP + 4.6) / 2), M['glass'])  # the stair core's glass
        for k in range(5): bx(f'sw_m{k}', c, (0.1, 0.1, TOP - 5.0), (side * 0.4, 1.0 + k * 1.0, (TOP + 4.6) / 2), M['alu'])
        bx('sw_roof', c, (0.6, DEPTH + 3.9, 0.45), (side * 0.3, (DEPTH - 3.3) / 2, TOP - 0.22), M['white'])
        bx('sw_fascia', c, (0.3, DEPTH + 3.9, 0.7), (side * 0.45, (DEPTH - 3.3) / 2, TOP - 0.35), M['panel'])
        bbox('sw_bal', c, (0.4, 1.6, 0.25), (side * 0.2, -0.5, FASCIA + 0.12), M['white'], bev=0.03)
        o = GS.board('sw_logo', c, -3.0, 3.0, TOP - 3.0, TOP - 1.5, 0, 2)
        o.data.transform(Matrix.Rotation(-side * math.pi / 2, 4, 'Z')); o.location = (side * 0.37, 9.0, 0)
    return TOP, bay, pier, end

def heritage():
    TOP = 8.0
    def bay(c):
        x0, x1 = -W / 2, W / 2
        fascia(c, 'fa', x0, x1, M['render'])
        bx('trim', c, (W, 0.34, 0.3), (0, 0.13, FASCIA + 0.15), M['render_trim'])                  # a painted band
        bx('up', c, (W, 0.3, TOP - FASCIA - 0.3), (0, 0.15, (TOP + FASCIA + 0.3) / 2), M['render'])
        # the timing rooms' windows: six a garage, green frames, sills
        for k in range(6):
            xc = x0 + (k + 0.5) * W / 6
            bx(f'w{k}', c, (1.3, 0.06, 1.0), (xc, -0.01, 7.0), M['glass'])
            bbox(f'wf{k}', c, (1.46, 0.05, 1.16), (xc, -0.005, 7.0), M['green'], bev=0.01)
            bbox(f'ws{k}', c, (1.6, 0.18, 0.08), (xc, -0.06, 6.42), M['render'], bev=0.02)
        bbox('cornice', c, (W, 0.6, 0.3), (0, 0.0, TOP + 0.15), M['render'], bev=0.04)
        # the flat roof: a spectators' terrace, tubular railing at the front, benches
        roof_slab(c, 'roof', x0, x1, TOP + 0.3, y0=-0.3, t=0.3, mat=M['conc_floor'])
        GS.railing('rail', c, [(x0, -0.1, TOP + 0.3), (x1, -0.1, TOP + 0.3)], h=1.05, post=1.75, rails=(0.35, 0.7))
        for k in range(2):
            xc = -3.5 + k * 7
            bbox(f'bench{k}', c, (3.2, 0.45, 0.06), (xc, 3.0, TOP + 0.75), M['timber'], bev=0.01)
            for sx in (-1.4, 1.4): bbox(f'bl{k}{sx:.0f}', c, (0.08, 0.4, 0.45), (xc + sx, 3.0, TOP + 0.52), M['steel'], bev=0.01)
        cy('pole', c, 0.05, 4.5, (x1 - 0.4, 0.2, TOP + 0.3 + 2.25), M['galv'], verts=8)
        GS.flag('flag', c, Vector((x1 - 0.4, 0.2, TOP + 3.3)), -1, 4)
        back_wall(c, 'back', x0, x1, TOP + 0.3, M['render'], windows=((6.5, 1.0, 6),), trim=M['render_trim'])
    def pier(c):
        bbox('brick', c, (PIER, 0.5, DOOR_H), (0, -0.05, DOOR_H / 2), M['brick'], bev=0.02)
        bbox('cap', c, (PIER + 0.1, 0.56, 0.12), (0, -0.05, DOOR_H - 0.06), M['render'], bev=0.02)
        bbox('base', c, (PIER + 0.1, 0.56, 0.3), (0, -0.05, 0.15), M['conc'], bev=0.02)
    def end(c, side):
        side_wall(c, 'sw', side, TOP + 0.3, M['render'])
        bx('sw_trim', c, (0.06, DEPTH + 0.3, 0.3), (side * 0.37, DEPTH / 2, FASCIA + 0.15), M['render_trim'])
        ext_stair(c, 'st', side, TOP + 0.3, DEPTH - 0.3, M['conc'], M['conc_floor'])
        GS.railing('sw_rail', c, [(side * 0.2, -0.1, TOP + 0.3), (side * 0.2, DEPTH - 3.0, TOP + 0.3)], h=1.05, post=1.75, rails=(0.35, 0.7))
    return TOP + 1.4, bay, pier, end

def shed():
    EAVE, RISE = FASCIA + 0.3, 2.4
    def bay(c):
        x0, x1 = -W / 2, W / 2
        fascia(c, 'fa', x0, x1, M['clad'])
        bx('gut', c, (W, 0.3, 0.25), (0, -0.25, EAVE - 0.1), M['galv'])
        # a barrel vault over the garage, front to back: corrugated sheet on a curve, a skylight strip along its crown
        segs = 10; pts = [(x0 + W * k / segs, EAVE + RISE * math.sin(math.pi * k / segs)) for k in range(segs + 1)]
        b = GS.Build()
        for k in range(segs):
            (xa, za), (xb, zb) = pts[k], pts[k + 1]
            mi = 1 if k in (4, 5) else 0
            b.quad([(xa, -0.4, za), (xb, -0.4, zb), (xb, DEPTH + 0.4, zb), (xa, DEPTH + 0.4, za)][::-1], mi)
            b.quad([(xa, -0.4, za - 0.05), (xb, -0.4, zb - 0.05), (xb, DEPTH + 0.4, zb - 0.05), (xa, DEPTH + 0.4, za - 0.05)], 0)
        o = b.obj('vault', c, [M['roof'], M['poly']])
        # the vault's two gable ends (front: polycarbonate over a steel frame; back: cladding)
        for (y, mat, nm) in ((0.0, M['poly'], 'gf'), (DEPTH + 0.3, M['clad'], 'gb')):
            me = bpy.data.meshes.new(nm); vs = [(x, y, EAVE) for x, _ in pts] + [(x, y, z) for x, z in pts]; n = len(pts)
            me.from_pydata(vs, [], [(k, k + 1, n + k + 1, n + k) for k in range(n - 1)]); G.uv_world(me, Matrix.Identity(4), 0.5)
            G._obj(nm, c, me, mat)
        for k in range(1, 4): rd(f'gfm{k}', c, (x0 + k * W / 4, -0.02, EAVE), (x0 + k * W / 4, -0.02, EAVE + RISE * math.sin(math.pi * k / 4) - 0.05), 0.05, M['steel'], verts=6)
        G.mk(G.beam('gfb', c, (x0, -0.02, EAVE), (x1, -0.02, EAVE), 0.15, 0.2, M['steel']))
        bx('wall_up', c, (W, 0.3, EAVE - FASCIA), (0, 0.15, (EAVE + FASCIA) / 2), M['clad'])
        back_wall(c, 'back', x0, x1, EAVE, M['clad'], windows=((5.2, 0.8, 3),))
    def pier(c):
        G.mk(G.ibeam('col', c, -0.15, 0.15, -0.25, 0, M['steel'], w=0.3, h=0.3, t=0.03)); o = c.objects[-1]
        # (an I-section standing up: built along x, turned upright)
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y')); o.data.transform(Matrix.Translation(Vector((0, 0, 0))))
        bx('clad', c, (PIER, 0.12, DOOR_H), (0, 0.1, DOOR_H / 2), M['clad'])
        G.mk(G.beam('colv', c, (0, -0.12, 0), (0, -0.12, DOOR_H), 0.32, 0.32, M['steel']))
        rd('dp', c, (0.45, -0.22, 0.1), (0.45, -0.22, DOOR_H), 0.06, M['galv'], verts=8)
    def end(c, side):
        side_wall(c, 'sw', side, EAVE, M['clad'])
        sh = G.tiled_card('sw_roll', c, 4.0, 3.6, (side * 0.37, 8.0, 0), M['shutter'], tile=1.0); sh.rotation_euler = (0, 0, -side * math.pi / 2)
        o = GS.board('sw_logo', c, -2.5, 2.5, EAVE - 1.6, EAVE - 0.3, 0, 6)
        o.data.transform(Matrix.Rotation(-side * math.pi / 2, 4, 'Z')); o.location = (side * 0.37, 3.0, 0)
    return EAVE + RISE, bay, pier, end

def terrace():
    BASE = 7.2
    def bay(c):
        x0, x1 = -W / 2, W / 2
        fascia(c, 'fa', x0, x1, M['conc'])
        bx('up', c, (W, 0.3, BASE - FASCIA), (0, 0.15, (BASE + FASCIA) / 2), M['conc'])
        GS.board('ads', c, x0, x1, FASCIA + 0.1, BASE - 0.1, -0.01, 3)                         # sponsor boards under the seats
        roof_slab(c, 'deck', x0, x1, BASE, y0=-0.3, t=0.3, mat=M['conc'])
        # seven rows of seats on the roof, facing the track, a rail in front, a cantilever canopy over them
        d = dict(z=BASE, yg=-0.3, y0=0.9, n=7, tread=0.85, rise=0.42)
        GS.terrace('terr', c, d, x0, x1)
        rng = np.random.default_rng(3); b = GS.Build()
        for k, (ya, yb, z) in enumerate(GS.rows(d)): GS.add_seats(b, [x for x in GS.SEATS_X if abs(x) > 0.75 and x0 <= x < x1], ya + 0.3, z, rng, [])
        b.obj('seats', c, [M['seat'], M['seat_faded'], M['steel']])
        GS.aisle(c, d, 'ai')
        GS.railing('rail', c, [(x0, -0.2, BASE), (x1, -0.2, BASE)], h=1.0, post=2.0, rails=(0.5,))
        yb, zt = d['y0'] + d['n'] * d['tread'], BASE + d['n'] * d['rise']
        bx('rearwall', c, (W, 0.3, zt + 1.0 - BASE), (0, yb + 0.15, (zt + 1.0 + BASE) / 2), M['conc'])
        top = zt + 3.6
        roof_slab(c, 'canopy', x0, x1, top, y0=-1.0, y1=yb + 0.5, t=0.25, mat=M['roof'])
        for fx in (-4.0, 4.0):
            rd(f'cc{fx:.0f}', c, (fx, yb + 0.1, zt), (fx, yb + 0.1, top - 0.25), 0.12, M['steel'], verts=8)
            G.mk(G.beam(f'cb{fx:.0f}', c, (fx, yb + 0.3, top - 0.35), (fx, -0.9, top - 0.35), 0.18, 0.3, M['steel']))
            rd(f'ct{fx:.0f}', c, (fx, yb - 2.5, top - 0.5), (fx, yb + 0.1, zt + 1.6), 0.05, M['steel'], verts=6)
        GS.board('cfas', c, x0, x1, top - 0.95, top - 0.2, -1.02, 5)
        back_wall(c, 'back', x0, x1, BASE, M['conc'], windows=((5.4, 1.0, 4),))
        bx('rear_up', c, (W, 0.3, zt + 1.0 - BASE), (0, DEPTH + 0.15, (zt + 1.0 + BASE) / 2), M['conc'])
        roof_slab(c, 'rear_roof', x0, x1, zt + 1.0, y0=yb, t=0.3, mat=M['conc'])
    def pier(c):
        bbox('col', c, (PIER, 0.55, DOOR_H), (0, -0.07, DOOR_H / 2), M['conc'], bev=0.03)
        bx('num', c, (0.9, 0.04, 0.5), (0, -0.36, DOOR_H - 0.6), M['white'])
    def end(c, side):
        d = dict(z=BASE, yg=-0.3, y0=0.9, n=7, tread=0.85, rise=0.42)
        zt = BASE + d['n'] * d['rise']; yb = d['y0'] + d['n'] * d['tread']
        side_wall(c, 'sw', side, BASE, M['conc'])
        # the terrace's end wall, stepping with the rows
        pts = [(-0.3, BASE), (-0.3, BASE + 1.1)] + [(y, z + 1.0) for (ya, y, z) in GS.rows(d)] + [(DEPTH + 0.3, zt + 1.0), (DEPTH + 0.3, BASE)]
        me = bpy.data.meshes.new('tw'); xin, xout = 0.0, side * 0.3
        vs = [(xin, y, z) for y, z in pts] + [(xout, y, z) for y, z in pts]; n = len(pts)
        me.from_pydata(vs, [], [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)])
        import bmesh as _bm
        bm = _bm.new(); bm.from_mesh(me); _bm.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4]); _bm.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        G.uv_world(me, Matrix.Identity(4), 0.5); G._obj('tw', c, me, M['conc'])
        ext_stair(c, 'st', side, BASE, DEPTH - 0.3, M['conc'], M['conc_floor'])
        bx('sw_can', c, (0.3, yb + 1.5, 0.25), (side * 0.15, (yb - 1.0) / 2, zt + 3.6 - 0.12), M['roof'])
    return BASE + 7 * 0.42 + 3.6, bay, pier, end

STYLES = {'modern': ('Modern', modern), 'heritage': ('Heritage', heritage), 'shed': ('Club Shed', shed), 'terrace': ('Pit Grandstand', terrace)}

# ------------------------------------------------------------------ build, AO, the preview, export
def main():
    GS.mats(); extra_mats(); GS.SEAT = GS.seat_template()
    root = G.collection('PITSTYLES'); info = {}
    for key, (label, fn) in STYLES.items():
        top, bay, pier, end = fn()
        parent = G.collection(f'ps_{key}', root); info[key] = {'label': label, 'top': round(top, 2)}
        for role, build in (('bay', bay), ('pier', pier), ('endL', lambda c: end(c, -1)), ('endR', lambda c: end(c, 1))):
            c = G.collection(f'ps_{key}_{role}', parent)
            G.BUILT.clear(); build(c); bpy.context.view_layer.update()
            # (pieces made outside garagelib's helpers: registered for the AO too)
            for o in c.objects:
                if o.type == 'MESH' and o not in G.BUILT: G.BUILT.append(o)
            GS.finish(c)
            print(f'{key} {role}: {G.tris(c)} tris', flush=True)
    GS.ao_materials()
    for m in bpy.data.materials:   # (the PS_ materials want the AO multiply too)
        if m.name.startswith('PS_') and m.node_tree and not any(n.type == 'VERTEX_COLOR' for n in m.node_tree.nodes):
            nt = m.node_tree; p = nt.nodes.get('Principled BSDF'); ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'AO'
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
            src = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
            if src: nt.links.new(src, mix.inputs['A'])
            nt.links.new(ca.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    # preview: each style as a block of four garages (two of them 13 m, two 15 m) with its ends, in a row
    lay = G.collection('PREVIEW (linked copies)'); off = 0.0
    for key in STYLES:
        widths = [15.0, 13.0, 15.0, 13.0]; x = off
        def put(role, at, sx=1.0):
            src = bpy.data.objects[f'ps_{key}_{role}']; o = bpy.data.objects.new(f'P_{key}_{role}_{at:.0f}', src.data); lay.objects.link(o); o.location = (at, 0, 0); o.scale = (sx, 1, 1)
        put('endL', x)
        for w in widths:
            dw = min(11, w - 3) / 2
            put('bay', x + w / 2, w / W); put('pier', x + (w / 2 - dw) / 2, (w / 2 - dw) / PIER); put('pier', x + w - (w / 2 - dw) / 2, (w / 2 - dw) / PIER)
            x += w
        put('endR', x)
        off = x + 40
    for key in STYLES:
        for ch in bpy.data.collections[f'ps_{key}'].children: ch.hide_viewport = True; ch.hide_render = True
    with open(os.path.join(OUTDIR, 'pitstyles.json'), 'w') as f: json.dump(info, f)
    if '--export' in args: export(info)
    if '--blend' in args: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTDIR, 'pitstyles.blend')); print('saved', flush=True)

def export(info):
    # every piece as it's built (no recentring: its origin is the garage line at the middle of the garage, the lane's
    # level, as the game lays them), to assets/env/pitstyles.glb + catalogue entries (cat 'pitstyle', hidden)
    out_glb = os.path.join(ROOT, 'assets', 'env', 'pitstyles.glb'); cat_p = os.path.join(ROOT, 'assets', 'env', 'catalog.json')
    ex = bpy.data.scenes.new('EXPORT'); entries = []
    for key in STYLES:
        for role in ('bay', 'pier', 'endL', 'endR'):
            src = bpy.data.objects[f'ps_{key}_{role}']; src.name = f'ps_{key}_{role}_src'
            me = src.data.copy(); me.transform(src.matrix_world)
            pid = f'ps_{key}_{role}'; o = bpy.data.objects.new(pid, me); ex.collection.objects.link(o)
            o.data.color_attributes.active_color = o.data.color_attributes.get('AO')
            xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
            entries.append({'cat': 'pitstyle', 'cls': f'ps_{key}', 'id': pid, 'pack': 'pitstyles', 'label': f"{info[key]['label']} · {role}", 'hidden': 1, 'ao': 1,
                            'w': round(max(xs) - min(xs), 2), 'd': round(max(ys) - min(ys), 2), 'h': round(max(zs) - min(zs), 2),
                            'tris': sum(len(p.vertices) - 2 for p in me.polygons),
                            'kit': {'role': role, 'nominal': W if role == 'bay' else PIER if role == 'pier' else 0, 'top': info[key]['top'], 'depth': DEPTH}})
    win = bpy.context.window
    if win: win.scene = ex
    with bpy.context.temp_override(scene=ex):
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=False, use_active_scene=True, export_apply=True,
                                  export_yup=True, export_image_format='WEBP', export_texcoords=True, export_normals=True,
                                  export_vertex_color='ACTIVE', export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
    import subprocess, shutil
    try:
        subprocess.run(['npx', '-y', '@gltf-transform/cli@4.1.1', 'quantize', out_glb, out_glb + '.q.glb'], check=True, cwd=GEN, capture_output=True, timeout=300)
        shutil.move(out_glb + '.q.glb', out_glb)
    except Exception as e: print('(not quantized:', e, ')')
    cat = json.load(open(cat_p))
    cat['packs']['pitstyles'] = {'title': 'San Velocita pit building styles (tools/props/pitstyles.py)', 'author': 'San Velocita GP', 'license': 'own', 'source': ''}
    cat['assets'] = [a for a in cat['assets'] if a.get('pack') != 'pitstyles'] + entries
    open(cat_p, 'w').write(json.dumps(cat, indent=1, ensure_ascii=False))
    print('pitstyles', len(entries), 'pieces', round(os.path.getsize(out_glb) / 1024), 'KB', flush=True)

main()
