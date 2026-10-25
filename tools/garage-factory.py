# Builds models/garage/factory-start.blend: the Factory (World Career premises level 3, "SVGP Technology Centre"), see
# docs/GARAGE-KIT.md.
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-factory.py               (the .blend)
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-factory.py -- --export   (+ shell_factory.glb)
#   FA_TAG=<tag>: a build of its own (factory-start-<tag>.blend, shell_factory_<tag>.glb), to look at beside the real one
#
# The team's made it: a technology centre in the McLaren mould, built round its cars. You come in off the lake through a
# glass rotunda into the Boulevard, a dim gallery along the curved glass where the cars of your career stand in pools of
# light (they fill it season by season). Behind its glass: the atrium, two floors high, your three bays under a ring of
# light, and everything wraps round it and looks down on it: the walkway, your office, race ops, the tunnel's control
# room upstairs; the tire bay, machine shop and the wind tunnel's test section below, the composites shop, dyno cells and
# the loading dock behind. Lit for contrast, not flat: cool pools on the cars, blue LED strips along the edges, warm
# offices, golden hour off the lake. (the plan: .devtest/out/factory/factory-plan-v2.png)
#
# Layout (metres, floor Z = 0; the lake, and the cars' noses, down -Y), 38 x ~28 m:
#   the front: curved glass, y -11 at the ends to -14 in the middle; the rotunda (the way in and out) at its left end
#   the Boulevard: from the glass back to the atrium's glass at y -6.5 (x -15..19); the tire bay opens off it (x -19..-8)
#   the atrium (x -8..10, y -6.5..6): car one (the setup pad), car two, the lift's bay; the stairs up its left edge
#   the machine shop (x -19..-8, y 0..7.5); the wind tunnel's test section (x 10..19, y -6.5..6)
#   the service corridor (y 6..7.5); behind it the loading dock (x -19..-3), composites (x -3..6), dyno cells (x 6..19)
#   the tunnel hall is open to the roof (the tunnel's return runs overhead); its control room a glass pod up off the walkway
#   upstairs (z 4.2): the walkway round the atrium (front, left, back), your office over the tire bay, race ops over the
#   machine shop, the staff cafe (x -19..2) and the sim suite (x 2..19) over the back
# Detail goes in tools/factory/*.py (a file each, as the workshop's did): this is step 1, the blockout.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from mathutils import Vector, Matrix, Euler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'models', 'garage', 'src')
OUT = os.path.join(ROOT, 'models', 'garage')
TAG = os.environ.get('FA_TAG')
GEN = os.path.join(SRC, 'factory_gen' + ('_' + TAG if TAG else ''))
KIT = os.path.join(OUT, 'kit-start.blend')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
os.makedirs(GEN, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
D90 = math.pi / 2

# ---- the plan ----
X0, X1, Y1 = -19.0, 19.0, 14.0
FRONT_END, FRONT_MID = -11.0, -14.0
def front_y(x): return FRONT_END + (FRONT_MID - FRONT_END) * (1 - (x / X1) ** 2)
H = 8.5                                      # (the roof)
GY = -6.5                                    # (the atrium's glass: the Boulevard's back)
AX0, AX1, AY1 = -8.0, 10.0, 6.0              # (the atrium)
CY1 = 7.5                                    # (the service corridor's back: the back row from here)
UZ = 4.2                                     # (upstairs)
RH = 3.8                                     # (the ground floor rooms' ceilings)
BAY1, BAY2, BAY3 = Vector((-4.0, -0.3, 0)), Vector((1.0, -0.3, 0)), Vector((6.0, -0.3, 0))
ROT = Vector((-16.6, -9.6, 0)); ROT_R = 3.2  # (the rotunda)
ST_X0, ST_X1, ST_Y0, ST_Y1 = -8.0, -6.6, -4.6, 1.4   # (the stairs, up the atrium's left edge; 1.9 m back from its glass and doorway)
WALK_W = 1.5                                 # (the walkways' width)
CTL_Y1 = -3.4                                # (the tunnel's control pod: over the hall's front, x 10..19, y -6.5..-3.4)

import garagelib as G
from garagelib import *
GEN = os.path.join(SRC, 'factory_gen' + ('_' + TAG if TAG else ''))   # (again: garagelib's * brought its own GEN, the unit's)
G.configure(GEN, seed=2006); RNG = G.RNG
lib_coll = G.lib_collection()

kit = collection('KIT (each collection is one .glb)')
shell = collection('shell_factory', kit)
build = collection('shell_factory build', shell)
dress = collection('shell_factory dressing', shell)
lights = collection('shell_factory lights', shell)
hooks = collection('shell_factory hooks', shell)
B = build

# ======================================================================================================================
# finishes (the blockout's; step 2 makes them properly)
white = plain_mat('FA_White', (0.86, 0.87, 0.88), dirt=0.04, rough=0.5)
greyw = plain_mat('FA_GreyWall', (0.55, 0.57, 0.6), dirt=0.05)
alu = plain_mat('FA_Alu', (0.62, 0.64, 0.67), dirt=0.03, rough=0.3)
dark = plain_mat('FA_Dark', (0.12, 0.13, 0.15), dirt=0.03)
glass = solid_mat('FA_Glass', (0.3, 0.42, 0.5), 0.05)
glass.surface_render_method = 'BLENDED'; glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.1
led = mat_img('FA_LED', None, 0.4, emit=((0.25, 0.6, 1.0), 4.0))
green = mat_img('FA_ExitGreen', None, 0.4, emit=((0.15, 0.9, 0.35), 3.0))
warm = mat_img('FA_Warm', None, 0.4, emit=((1.0, 0.85, 0.65), 4.0))
cool = mat_img('FA_Cool', None, 0.4, emit=((0.9, 0.95, 1.0), 5.0))
def floor_tex(name, rgb, grid=None, fleck=0.03):
    n = 128; c = np.ones((n, n, 3), np.float32) * np.array(rgb, np.float32)
    c *= (1 + (fbm(n, n, (64, 16), wrap=True) - 0.5) * 0.05)[..., None]
    c *= (1 + (np.random.default_rng(len(name)).random((n, n)) > 0.95)[..., None] * fleck)
    if grid: c[:, :2] *= grid; c[:2, :] *= grid
    return mat_img(name, save(name, c), 0.3)
f_blvd = floor_tex('fa_floor_blvd', (0.22, 0.23, 0.25), grid=0.8)      # (polished dark: the cars' light pools on it)
f_atrium = floor_tex('fa_floor_atrium', (0.62, 0.64, 0.66), grid=0.9)
f_room = floor_tex('fa_floor_room', (0.5, 0.52, 0.54))
f_up = floor_tex('fa_floor_up', (0.26, 0.28, 0.32))                     # (upstairs: dark carpet tiles)

# ======================================================================================================================
# helpers
def poly(name, coll, pts, mat, up=True, uvs=0.5):
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p in pts], [], [tuple(range(len(pts)))])
    if (me.polygons[0].normal.z < 0) == up: me.flip_normals()
    uv = me.uv_layers.new()
    for li in me.polygons[0].loop_indices: v = me.vertices[me.loops[li].vertex_index].co; uv.data[li].uv = (v.x * uvs, v.y * uvs)
    o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return o
def rectf(name, x0, y0, x1, y1, z, mat, up=True, coll=None): return poly(name, coll or B, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], mat, up)
def glass_wall(name, a, b, h, opens=(), z0=0.0):
    # glass a -> b, panes ~1.5 m between mullions, a head; opens [(u0, u1)]: doorways left clear
    a, b = Vector(a), Vector(b); L = (b - a).length; d = (b - a) / L; ang = math.atan2(d.y, d.x); n = max(1, round(L / 1.5))
    for k in range(n):
        u0, u1 = L * k / n, L * (k + 1) / n
        if any(o[0] < (u0 + u1) / 2 < o[1] for o in opens): continue
        c = a + d * ((u0 + u1) / 2); box(f'{name}_Pane{k}', B, (u1 - u0 - 0.04, 0.025, h - 0.08), (c.x, c.y, z0 + h / 2), glass, rot=(0, 0, ang))
        p = a + d * u0; box(f'{name}_Mull{k}', B, (0.05, 0.07, h), (p.x, p.y, z0 + h / 2), alu, rot=(0, 0, ang))
    box(f'{name}_MullEnd', B, (0.05, 0.07, h), (b.x, b.y, z0 + h / 2), alu, rot=(0, 0, ang))
    c = a + d * (L / 2); box(f'{name}_Head', B, (L, 0.09, 0.08), (c.x, c.y, z0 + h), alu, rot=(0, 0, ang))
def solid(name, a, b, h, mat=greyw, t=0.2, opens=(), z0=0.0):
    # a wall in pieces round its doorways [(u0, u1, top)] (the walker blocks each piece's box, never the gap)
    a, b = Vector(a), Vector(b); L = (b - a).length; d = (b - a) / L; ang = math.atan2(d.y, d.x); u = 0.0; k = [0]
    def piece(u0, u1, za, zb):
        if u1 - u0 < 0.01 or zb - za < 0.01: return
        c = a + d * ((u0 + u1) / 2); box(f'{name}_{k[0]}', B, (u1 - u0, t, zb - za), (c.x, c.y, z0 + (za + zb) / 2), mat, rot=(0, 0, ang)); k[0] += 1
    for (u0, u1, top) in sorted(opens): piece(u, u0, 0, h); piece(u0, u1, top, h); u = u1
    piece(u, L, 0, h)
def strip(name, a, b, z, mat=led, w=0.04, h=0.015):   # a line of LED light, a -> b
    a, b = Vector((*a, z)), Vector((*b, z)); beam(name, B, a, b, w, h, mat)

# ======================================================================================================================
# the outside: the lake at golden hour, its far shore, the sky (lit by themselves), the terrace round the glass
def emit_png(name, col, k): save(name, col); return art_mat(name, os.path.join(GEN, name + '.png'), dirt=0.0, emit=k)
h = 96; sky = np.zeros((h, 4, 3), np.float32)
for i in range(h):
    t = i / (h - 1)   # (top to the horizon: deep blue, pale, a warm band low down)
    sky[i, :] = np.array([0.18, 0.3, 0.55]) * (1 - t) ** 2 + np.array([0.75, 0.62, 0.55]) * 2 * t * (1 - t) + np.array([1.0, 0.62, 0.3]) * t ** 2
sky_mat = emit_png('fa_sky', sky, 1.0)
lake = np.zeros((48, 48, 3), np.float32)
for i in range(48): lake[i, :] = np.array([0.12, 0.2, 0.3]) + np.array([0.5, 0.3, 0.1]) * np.exp(-((i - 30) / 7) ** 2)   # (the sun's road on it)
lake *= (1 + (fbm(48, 48, (24, 4), wrap=True) - 0.5) * 0.25)[..., None]
lake_mat = emit_png('fa_lake', lake, 0.8)
shore = np.ones((16, 64, 3), np.float32) * np.array([0.12, 0.13, 0.12], np.float32); shore *= (1 + (fbm(16, 64, (8, 2), wrap=True) - 0.5) * 0.4)[..., None]
shore_mat = emit_png('fa_shore', shore, 0.6)
# (all inside the camera's 120 m: the garage's camera stops there)
quad('Out_Lake', B, [(-95, -15.5, -0.5), (95, -15.5, -0.5), (95, -80, -0.5), (-95, -80, -0.5)], lake_mat, (0, 0, 1), [(0, 1), (1, 1), (1, 0), (0, 0)])   # (once across: repeated, its ripples read as a checker from afar)
quad('Out_Shore', B, [(-95, -80, -0.5), (95, -80, -0.5), (95, -80, 5), (-95, -80, 5)], shore_mat, (0, 1, 0), [(0, 0), (6, 0), (6, 1), (0, 1)])
quad('Out_Sky', B, [(-95, -86, -0.5), (95, -86, -0.5), (95, -86, 60), (-95, -86, 60)], sky_mat, (0, 1, 0), [(0, 1), (1, 1), (1, 0), (0, 0)])
for s in (-1, 1): quad(f'Out_SkySide{s}', B, [(s * 95, -86, -0.5), (s * 95, -5, -0.5), (s * 95, -5, 60), (s * 95, -86, 60)], sky_mat, (-s, 0, 0), [(0, 1), (1, 1), (1, 0), (0, 0)])
arc = [(X0 + (X1 - X0) * k / 24, front_y(X0 + (X1 - X0) * k / 24)) for k in range(25)]
poly('Out_Terrace', B, [(x, y - 3.5, -0.03) for x, y in reversed(arc)] + [(x, y, -0.03) for x, y in arc], plain_mat('FA_Terrace', (0.42, 0.42, 0.4), dirt=0.05), uvs=0.5)

# ======================================================================================================================
# the shell: floors, the curved glass front, walls, the roof
poly('Floor_Blvd', B, [(x, y, 0) for x, y in arc] + [(X1, GY, 0), (X0, GY, 0)], f_blvd)
rectf('Floor_Atrium', AX0, GY, AX1, AY1, 0.0, f_atrium)
for nm, a in (('Tire', (X0, GY, AX0, 0)), ('Machine', (X0, 0, AX0, CY1)), ('Tunnel', (AX1, GY, X1, AY1)), ('Corridor', (AX0, AY1, X1, CY1)), ('Back', (X0, CY1, X1, Y1))):
    rectf(f'Floor_{nm}', *a, 0.0, f_room)
poly('Roof', B, [(x, y, H) for x, y in arc] + [(X1, Y1, H), (X0, Y1, H)], dark, up=False)
# the glass front: a pane a segment between slim mullions, a white fascia at the top; the rotunda breaks it at its left
for k in range(24):
    (xa, ya), (xb, yb) = arc[k], arc[k + 1]
    c = Vector(((xa + xb) / 2, (ya + yb) / 2, 0)); L = math.hypot(xb - xa, yb - ya); ang = math.atan2(yb - ya, xb - xa)
    if (c - ROT).length < ROT_R + 0.3: continue   # (the rotunda's there)
    box(f'Front_Glass_{k:02d}', B, (L - 0.04, 0.03, H - 0.8), (c.x, c.y, (H - 0.8) / 2 + 0.15), glass, rot=(0, 0, ang))
    box(f'Front_Mull_{k:02d}', B, (0.07, 0.16, H), (xa, ya, H / 2), alu, rot=(0, 0, ang))
    box(f'Front_Fascia_{k:02d}', B, (L + 0.02, 0.25, 0.65), (c.x, c.y, H - 0.32), white, rot=(0, 0, ang))
    box(f'Front_Cill_{k:02d}', B, (L + 0.02, 0.2, 0.15), (c.x, c.y, 0.075), dark, rot=(0, 0, ang))
    strip(f'Front_LED_{k:02d}', (xa, ya + 0.15), (xb, yb + 0.15), 0.155)
for nm, a, b, inward in (('L', (X0, FRONT_END, 0), (X0, Y1, 0), (1, 0, 0)), ('R', (X1, FRONT_END, 0), (X1, Y1, 0), (-1, 0, 0)), ('Back', (X0, Y1, 0), (X1, Y1, 0), (0, -1, 0))):
    opens = [(10.75 - FRONT_END - 2.4, 10.75 - FRONT_END + 2.4, 0, 4.3)] if nm == 'L' else []   # (the dock's door, x -19 at y 10.75: in line with the transporter)
    wall(f'Wall_{nm}', B, a, b, lambda u: H, opens, greyw, inward, (Vector(b) - Vector(a)).length, H)

# the rotunda: a glass drum at the Boulevard's left end, the doors out to the terrace, a glowing ring under its dome
NR = 16
for k in range(NR):
    a0, a1 = k / NR * math.tau, (k + 1) / NR * math.tau; am = (a0 + a1) / 2
    p0 = ROT + Vector((math.cos(a0), math.sin(a0), 0)) * ROT_R; p1 = ROT + Vector((math.cos(a1), math.sin(a1), 0)) * ROT_R; c = (p0 + p1) / 2
    ang = math.atan2(p1.y - p0.y, p1.x - p0.x); L = (p1 - p0).length
    out = math.pi * 0.95 < am < math.pi * 1.55   # (the doors: to the terrace, the lake side)
    inn = am > math.pi * 1.85 or am < math.pi * 0.35    # (open into the Boulevard)
    box(f'Rot_Mull{k}', B, (0.08, 0.12, 5.0), (p0.x, p0.y, 2.5), alu)
    if inn: continue
    if out: box(f'Rot_Transom{k}', B, (L, 0.03, 2.4), (c.x, c.y, 2.6 + 1.2), glass, rot=(0, 0, ang))
    else: box(f'Rot_Glass{k}', B, (L, 0.03, 4.9), (c.x, c.y, 2.5), glass, rot=(0, 0, ang))
lathe('Rot_Dome', B, [(ROT_R + 0.2, 5.0), (ROT_R, 5.3), (ROT_R * 0.7, 6.1), (0.0, 6.4)], ROT, white, segs=24, cap0=False)
lathe('Rot_Ring', B, [(ROT_R - 0.35, 4.9), (ROT_R - 0.2, 4.9), (ROT_R - 0.2, 4.95), (ROT_R - 0.35, 4.95)], ROT, cool, segs=24, cap0=False, cap1=False)
poly('Rot_Floor', B, [(ROT.x + math.cos(k / 24 * math.tau) * ROT_R, ROT.y + math.sin(k / 24 * math.tau) * ROT_R, 0.004) for k in range(24)], f_atrium)
lathe('Rot_Inlay', B, [(0.0, 0.006), (1.2, 0.006), (1.25, 0.007), (0.0, 0.007)], ROT, led, segs=24)   # (the team's roundel in the floor, lit)
bbox('Rot_Desk', B, (0.7, 2.6, 1.05), (ROT.x + 1.6, ROT.y + 1.3, 0.525), white, rot=(0, 0, -0.5), bev=0.03)   # (reception: a curved desk, blockout)
box('Rot_ExitSign', B, (0.5, 0.05, 0.2), (ROT.x - ROT_R * 0.8, ROT.y - ROT_R * 0.55, 3.0), green, rot=(0, 0, -0.95))

# ======================================================================================================================
# inside, the ground floor
glass_wall('AtriumGlass', (AX0, GY, 0), (AX1, GY, 0), UZ - 0.2, opens=((1.7, 2.9), (15.8, 17.3)))   # (doorways: by the stairs, past the lift's bay)
glass_wall('TunnelWindow', (AX1, GY, 0), (X1, GY, 0), UZ - 0.2)
# the tire bay: open to the Boulevard (its tires on show), a wall to the atrium; the machine shop behind it
solid('TireBay_Front_L', (X0, GY, 0), (-16.0, GY, 0), RH, white); solid('TireBay_Front_R', (-10.0, GY, 0), (AX0, GY, 0), RH, white)
box('TireBay_Lintel', B, (6.0, 0.2, RH - 3.0), (-13.0, GY, 3.0 + (RH - 3.0) / 2), white)
solid('TireBay_Atrium', (AX0, GY, 0), (AX0, 0, 0), RH, white)
solid('Machine_Front', (X0, 0, 0), (AX0, 0, 0), RH, greyw)
glass_wall('Machine_Glass', (AX0, 0, 1.0), (AX0, CY1 - 1.5, 1.0), RH - 1.0, opens=((3.0, 4.2),), z0=1.0)   # (to the atrium: glass over a dado, a door)
solid('Machine_Dado', (AX0, 0, 0), (AX0, CY1 - 1.5, 0), 1.0, white, opens=((3.0, 4.2, 1.0),))
solid('Machine_End', (AX0, CY1 - 1.5, 0), (AX0, CY1, 0), RH, greyw, opens=((0.05, 1.45, 2.2),))   # (its door to the corridor)
for nm, a in (('Tire', (X0, GY, AX0, 0)), ('Machine', (X0, 0, AX0, CY1))): rectf(f'Ceil_{nm}', *a, RH, white, up=False)
# the tunnel hall: a wall to the atrium with a window and a door
solid('Tunnel_AtriumA', (AX1, GY, 0), (AX1, GY + 1.0, 0), RH, greyw)   # (the window's opening z 1..3 between: the atrium sees the test section)
solid('Tunnel_AtriumDado', (AX1, GY + 1.0, 0), (AX1, GY + 7.5, 0), 1.0, greyw)
box('Tunnel_AtriumHead', B, (0.2, 6.5, RH - 3.0), (AX1, GY + 4.25, 3.0 + (RH - 3.0) / 2), greyw)
solid('Tunnel_AtriumB', (AX1, GY + 7.5, 0), (AX1, AY1, 0), RH, greyw, opens=((1.1, 2.3, 2.2),))
solid('Tunnel_HallBack', (AX1, AY1, 0), (X1, AY1, 0), RH, greyw, opens=((1.0, 2.2, 2.2),))   # (the hall's back to the corridor: the model shop stands against it)
glass_wall('Tunnel_AtriumWin', (AX1 - 0.12, GY + 1.0, 1.0), (AX1 - 0.12, GY + 7.5, 1.0), 2.0, z0=1.0)
# (the tunnel hall: no ceiling, open to the roof: the tunnel's return runs overhead)
# the corridor's back wall: doors to the dock, composites, the dyno cells; the back row's walls
solid('Back_Front', (X0, CY1, 0), (X1, CY1, 0), RH, greyw, opens=((11.4, 13.2, 3.0), (17.6, 18.8, 2.2), (25.6, 26.8, 2.2)))
for x in (-3.0, 6.0): solid(f'Back_Side{x:+.0f}', (x, CY1, 0), (x, Y1, 0), RH, greyw)
rectf('Ceil_Back', X0, CY1, X1, Y1, RH, white, up=False)
rectf('Ceil_Corridor', AX0, AY1, X1, CY1, RH, white, up=False)
solid('Atrium_ToolWall', (-6.7, AY1 + 0.1, 0), (-3.3, AY1 + 0.1, 0), RH, white)   # (behind the bench, SLOT_tools: its rack and air reel hang on it; open to the corridor, they floated)
solid('Dyno_Split', (12.5, CY1, 0), (12.5, Y1, 0), RH, dark, opens=((2.0, 3.2, 2.2),))   # (two cells; the control between, later)

# ======================================================================================================================
# upstairs: the floor slab (its pieces), the walkway's glass balustrade with its LED strip, the rooms' walls
upm = plain_mat('FA_Slab', (0.8, 0.81, 0.83), dirt=0.03)
UPS = (('Front', (AX0 - 2.0, GY - WALK_W, X1, GY)), ('Left', (AX0 - 2.0, GY, AX0, AY1)), ('Back', (AX0 - 2.0, AY1, X1, CY1)),
       ('Office', (X0, GY, AX0 - 2.0, 0)), ('Ops', (X0, 0, AX0 - 2.0, CY1)), ('Cafe', (X0, CY1, 2.0, Y1)), ('Sim', (2.0, CY1, X1, Y1)), ('Control', (AX1, GY, X1, CTL_Y1)))
for nm, a in UPS:
    rectf(f'WALK_Up_{nm}', *a, UZ, f_up)
    x0, y0, x1, y1 = a; box(f'WALK_UpSlab_{nm}', B, (x1 - x0, y1 - y0, 0.3), ((x0 + x1) / 2, (y0 + y1) / 2, UZ - 0.16), upm)
# (the walkway's edges: the balcony over the Boulevard, round the atrium's opening) glass, its head as the rail, the LED
glass_wall('Rail_Blvd', (AX0 - 2.0, GY - WALK_W, UZ), (X1, GY - WALK_W, UZ), 1.05, z0=UZ)
glass_wall('Rail_AtriumFront', (ST_X1 + 0.05, GY, UZ), (AX1, GY, UZ), 1.05, z0=UZ)
glass_wall('Rail_AtriumLeft', (AX0, ST_Y1 + 1.2, UZ), (AX0, AY1, UZ), 1.05, z0=UZ)
glass_wall('Rail_AtriumBack', (AX0, AY1, UZ), (X1, AY1, UZ), 1.05, z0=UZ)   # (on along the tunnel hall's back: it's open below)
for nm, a, b in (('Blvd', (AX0 - 2.0, GY - WALK_W + 0.08), (X1, GY - WALK_W + 0.08)), ('AF', (ST_X1 + 0.05, GY + 0.08), (AX1, GY + 0.08)),
                 ('AL', (AX0 + 0.08, ST_Y1 + 1.2), (AX0 + 0.08, AY1)), ('AB', (AX0, AY1 - 0.08), (X1, AY1 - 0.08))):
    strip(f'WALK_UpLED_{nm}', a, b, UZ + 0.01)
# the rooms upstairs: glass to the walkway and the views, a door each
glass_wall('Office_Front', (X0, GY, UZ), (AX0 - 2.0, GY, UZ), 3.0, z0=UZ)                          # (to the lake)
glass_wall('Office_Side', (AX0 - 2.0, GY, UZ), (AX0 - 2.0, 0, UZ), 3.0, opens=((3.0, 4.1),), z0=UZ)   # (to the atrium; its door)
solid('Office_Back', (X0, 0, UZ), (AX0 - 2.0, 0, UZ), 3.0, white, z0=UZ)
glass_wall('Ops_Side', (AX0 - 2.0, 0, UZ), (AX0 - 2.0, CY1, UZ), 3.0, opens=((1.6, 2.9),), z0=UZ)   # (its door at y 1.5..3: the data station fills the far end)
solid('Cafe_Front_L', (X0, CY1, UZ), (AX0 - 2.0, CY1, UZ), 3.0, white, z0=UZ)
glass_wall('Cafe_Front', (AX0 - 2.0, CY1, UZ), (2.0, CY1, UZ), 3.0, opens=((1.0, 2.2),), z0=UZ)
solid('Sim_Front', (2.0, CY1, UZ), (X1, CY1, UZ), 3.0, greyw, opens=((1.0, 2.1, 2.2),), z0=UZ)   # (the sim suite: dark inside, lit by its screens)
solid('Sim_Side', (2.0, CY1, UZ), (2.0, Y1, UZ), 3.0, greyw, z0=UZ)
# the tunnel's control pod: glass to the walkway (its door), to the atrium, and down into the tunnel hall
glass_wall('Control_Front', (AX1, GY, UZ), (X1, GY, UZ), 3.0, opens=((0.3, 1.4),), z0=UZ)
glass_wall('Control_Side', (AX1, GY, UZ), (AX1, CTL_Y1, UZ), 3.0, z0=UZ)
glass_wall('Control_Back', (AX1, CTL_Y1, UZ), (X1, CTL_Y1, UZ), 3.0, z0=UZ)
for nm, a in (('Office', (X0, GY, AX0 - 2.0, 0)), ('Ops', (X0, 0, AX0 - 2.0, CY1)), ('Cafe', (X0, CY1, 2.0, Y1)), ('Sim', (2.0, CY1, X1, Y1)), ('Control', (AX1, GY, X1, CTL_Y1))):
    rectf(f'Ceil_Up_{nm}', *a, UZ + 3.0, white, up=False)
glass_wall('TunnelHall_Glass', (AX1, CTL_Y1, RH), (AX1, AY1, RH), H - RH, z0=RH)   # (above the hall's ground-floor wall: the atrium sees into the tunnel hall)
# the stairs: up the atrium's left edge from by the Boulevard's doorway to a landing on the left walkway; glass sides, LEDs
tread = plain_mat('FA_Tread', (0.3, 0.31, 0.34), dirt=0.03)
nst = 26; run = ST_Y1 - ST_Y0; sw = ST_X1 - ST_X0
for i in range(nst):
    y = ST_Y0 + run * (i + 0.5) / nst; z = UZ * (i + 1) / nst
    box(f'WALK_Stair_{i:02d}', B, (sw, run / nst + 0.03, 0.05), ((ST_X0 + ST_X1) / 2, y, z - 0.025), tread)
    strip(f'WALK_StairLED_{i:02d}', (ST_X0 + 0.05, y - run / nst / 2 + 0.02), (ST_X1 - 0.05, y - run / nst / 2 + 0.02), z + 0.002, w=0.02, h=0.006)
for x in (ST_X0, ST_X1): beam(f'WALK_Stair_Stringer_{x:.1f}', B, (x, ST_Y0, 0.15), (x, ST_Y1, UZ - 0.05), 0.05, 0.32, white)
rectf('WALK_Landing', ST_X0 - 2.0, ST_Y1, ST_X1, ST_Y1 + 1.2, UZ, f_up)
box('WALK_LandingSlab', B, (sw + 2.0, 1.2, 0.3), ((ST_X0 - 2.0 + ST_X1) / 2, ST_Y1 + 0.6, UZ - 0.16), upm)
for k in range(8):
    t = (k + 0.5) / 8; box(f'Stair_GlassSide_{k}', B, (0.02, run / 8 - 0.03, 1.0), (ST_X1 + 0.04, ST_Y0 + run * t, UZ * t + 0.5), glass)
box('Landing_Glass', B, (sw + 0.05, 0.02, 1.05), ((ST_X0 + ST_X1) / 2, ST_Y1 + 1.2, UZ + 0.52), glass)

# ======================================================================================================================
# the wind tunnel: its station (station_tunnel2) stands in the hall at SLOT_tunnel2; nothing of it in the shell
TS = Vector((14.5, 0.5, 0))

# ======================================================================================================================
# your desk (kit-start.blend's, as in every premises): in your office upstairs, its back to the office's back wall
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
Mdesk = Matrix.Translation(Vector((-14.5, 0.0, UZ))) @ Matrix.Rotation(-D90, 4, 'Z') @ Matrix.Translation(-Vector((-4.15, 3.85, 0)))
for n in KEEP_DESK:
    if n in mine: o = mine[n]; o.matrix_world = Mdesk @ o.matrix_world; link(o, lights if o.type == 'LIGHT' else dress)
cal = Mdesk @ Vector((-4.0, 3.42, 2.1))

# placeholders (made properly in the later steps): the Boulevard's plinths, the tire bay's racks
PLINTHS = []
for k in range(6):
    x = -11.0 + k * 5.4; y = front_y(x) + 2.5; PLINTHS.append(Vector((x, y, 0)))
    bbox(f'Blvd_Plinth_{k}', dress, (5.2, 2.6, 0.12), (x, y, 0.06), dark, bev=0.03)
    strip(f'Blvd_PlinthLED_{k}', (x - 2.6, y - 1.32), (x + 2.6, y - 1.32), 0.02)
for k in range(5): bbox(f'TireRack_{k}', dress, (1.2, 0.6, 2.2), (-17.8 + k * 1.6, -0.45, 1.1), plain_mat('FA_Rack', (0.25, 0.27, 0.3), dirt=0.04), bev=0.02)
# the way out, lit: a strip in the floor from the atrium's doorway along the Boulevard to the rotunda; the dock's EXIT sign
pts = [(AX0 + 2.3, GY - 0.6), (-12.0, GY - 1.6), (ROT.x + ROT_R + 0.2, ROT.y + 0.6)]
for k, (a, b) in enumerate(zip(pts, pts[1:])): strip(f'Floor_ExitLine_{k}', a, b, 0.004, w=0.08, h=0.006)
box('Dock_ExitSign', B, (0.05, 0.6, 0.22), (X0 + 0.06, Y1 - 5.0, 4.7), green)

# ======================================================================================================================
# lights: contrast, not flat. Three spots on the bays (the only shadows), a pool on each career car, warm rooms
for n, b in enumerate((BAY1, BAY2, BAY3)): spot(f'Light_Bay_{n}', lights, (b.x, b.y, H - 0.6), 3000, (0.92, 0.96, 1.0), deg=95)
AC = Vector(((AX0 + AX1) / 2, (GY + AY1) / 2, 0))
lathe('Atrium_Ring', lights, [(5.6, 0.0), (5.8, 0.0), (5.8, 0.12), (5.6, 0.12)], (AC.x, AC.y, H - 1.4), cool, segs=48, cap0=False, cap1=False)
for k in range(3):
    p = AC + Vector((math.cos(k * math.tau / 3), math.sin(k * math.tau / 3), 0)) * 5.7
    rd(f'Atrium_RingHanger{k}', lights, (p.x, p.y, H - 1.28), (p.x, p.y, H), 0.01, alu, verts=4)
for k, p in enumerate(PLINTHS):
    bulb(f'Light_Plinth_{k}', lights, (p.x, p.y, 3.4), 420, (1.0, 0.95, 0.85))
    lathe(f'Plinth_Downlight_{k}', lights, [(0.0, 0.0), (0.18, 0.0), (0.2, 0.1), (0.0, 0.12)], (p.x, p.y, H - 0.1), dark, segs=10, rot=(math.pi, 0, 0))
    cy(f'Plinth_DownlightLens_{k}', lights, 0.15, 0.01, (p.x, p.y, H - 0.11), warm, verts=10)
bulb('Light_Rotunda', lights, (ROT.x, ROT.y, 4.4), 500, (1.0, 0.92, 0.8))
for n, (x, y, z, w, rgb) in enumerate(((-14.5, -3.2, UZ + 2.7, 350, (1.0, 0.86, 0.68)), (-14.5, 3.8, UZ + 2.7, 400, (0.9, 0.95, 1.0)), (-13.0, -3.2, RH - 0.3, 450, (1.0, 0.95, 0.9)),
                                       (-13.5, 3.8, RH - 0.3, 850, (0.95, 0.97, 1.0)), (0.0, 10.7, UZ + 2.7, 450, (1.0, 0.88, 0.7)), (14.5, 1.0, H - 1.0, 1100, (0.9, 0.95, 1.0)),
                                       (1.5, 10.7, RH - 0.3, 800, (0.95, 0.97, 1.0)), (-11.0, 10.7, RH - 0.3, 400, (0.95, 0.97, 1.0)))):
    bulb(f'Light_Room_{n}', lights, (x, y, z), w, rgb)

# ======================================================================================================================
# the detail, a file each (tools/factory/): one that fails is reported and left out, so the rest still builds
import traceback
FA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'factory')
for part in ('structure', 'rooms', 'boulevard', 'lived', 'diner'):
    f = os.path.join(FA, part + '.py')
    if not os.path.exists(f): continue
    try: exec(compile(open(f).read(), f, 'exec'), globals())
    except Exception: print('FAILED', part); traceback.print_exc()

# ======================================================================================================================
# hooks
empty('BAY_1', hooks, BAY1, kind='SINGLE_ARROW', size=1.0, label='Car one')
empty('BAY_2', hooks, BAY2, kind='SINGLE_ARROW', size=1.0, label='Car two')
empty('SPAWN', hooks, ((BAY1.x + BAY2.x) / 2, -4.5, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.6)
dp = ROT + Vector((math.cos(math.pi * 1.25), math.sin(math.pi * 1.25), 0)) * (ROT_R - 0.7)
empty('INTERACT_door', hooks, (dp.x, dp.y, 1.6), kind='SPHERE', size=0.25, label='Head out')
empty('INTERACT_calendar', hooks, tuple(cal), kind='SPHERE', size=0.25, label='The calendar')
empty('POSTER', hooks, (AX0 - 2.1, -1.2, UZ + 1.5), rotz=-D90, kind='PLAIN_AXES', size=0.3)
empty('TIRES', hooks, (-18.4, -5.6, 0), kind='ARROWS', size=0.4)
for k, loc, rz in (('tools', (-5.0, AY1 - 0.05, 0), 0.0), ('tools2', (BAY3.x - 0.1, BAY3.y, 0), 0.0), ('tools3', (-13.5, CY1 - 0.05, 0), 0.0),
                   ('dyno', (9.2, Y1 - 0.05, 0), 0.0), ('fab', (-0.6, Y1 - 0.05, 0), 0.0), ('fab2', (3.6, Y1 - 0.05, 0), 0.0),
                   ('data', (-14.5, CY1 - 0.05, UZ), 0.0), ('sim', (6.0, Y1 - 0.05, UZ), 0.0), ('sim2', (12.5, Y1 - 0.05, UZ), 0.0),
                   ('truck', (-11.0, 10.75, 0), -D90), ('tunnel', (17.2, AY1 - 0.05, 0), 0.0), ('tunnel2', (TS.x, TS.y, 0), 0.0)):
    empty('SLOT_' + k, hooks, loc, rotz=rz, kind='ARROWS', size=0.5)
for name, loc, rz, clip, role in (
        ('STAND_mechanic', (BAY1.x - 1.15, -1.6, 0), D90, 'kneel', 'mechanic'), ('STAND_mechanic.001', (BAY2.x + 1.1, 1.0, 0), -D90, 'lean', 'mechanic'),
        ('STAND_visitor', (ROT.x + 1.0, ROT.y + 0.4, 0), 0.0, 'talk', 'visitor'),
        ('STAND_any.001', (-2.0, GY - 2.2, 0), math.pi, 'talk', 'any'), ('STAND_any.002', (-1.2, GY - 2.6, 0), D90 + 0.6, 'talk', 'any'),
        ('STAND_any.003', (0.0, AY1 + 0.75, UZ), math.pi, 'lean', 'any'), ('STAND_any.004', (4.0, GY - 0.6, UZ), 0.0, 'lean', 'any')):
    empty(name, hooks, loc, rotz=rz, kind='SINGLE_ARROW', size=0.5, clip=clip, role=role)
def navq(name, pts):
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p in pts], [], [tuple(range(len(pts)))])
    if me.polygons[0].normal.z < 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); hooks.objects.link(o); o.display_type = 'WIRE'; o.hide_render = True; return o
def navr(name, x0, y0, x1, y1, z, m=0.15): return navq(name, [(x0 + m, y0 + m, z), (x1 - m, y0 + m, z), (x1 - m, y1 - m, z), (x0 + m, y1 - m, z)])
navq('NAV_floor', [(x, y + 0.3, 0) for x, y in arc[1:-1]] + [(X1 - 0.15, arc[-1][1] + 0.3, 0), (X1 - 0.15, Y1 - 0.15, 0), (X0 + 0.15, Y1 - 0.15, 0), (X0 + 0.15, arc[0][1] + 0.3, 0)])
navq('NAV_rotunda', [(ROT.x + math.cos(k / 16 * math.tau) * (ROT_R - 0.3), ROT.y + math.sin(k / 16 * math.tau) * (ROT_R - 0.3), 0) for k in range(16)])
navq('NAV_stairs', [(ST_X0, ST_Y0, 0), (ST_X1, ST_Y0, 0), (ST_X1, ST_Y1, UZ), (ST_X0, ST_Y1, UZ)])
navr('NAV_landing', ST_X0 - 2.0, ST_Y1, ST_X1, ST_Y1 + 1.2, UZ, 0.05)
for nm, a in UPS: navr('NAV_up_' + nm.lower(), *a, UZ, 0.05)
ghost = bpy.data.materials.new('COL')
for k in range(8):   # (the stairs' open side, toward the tire bay's wall: stepped, so it's there at every height)
    y0 = ST_Y0 + 0.4 + k * (run - 0.4) / 8; y1 = y0 + (run - 0.4) / 8; hh = UZ * (y1 - ST_Y0) / run + 1.0
    box(f'COL_Stairs_Side_{k}', hooks, (0.1, y1 - y0, hh), (ST_X0 - 0.06, (y0 + y1) / 2, hh / 2), ghost)
box('COL_Stairs_Under', hooks, (sw + 0.1, 0.2, 2.4), ((ST_X0 + ST_X1) / 2, ST_Y1 - 0.3, 1.2), ghost)
for o in hooks.objects:
    if o.name.startswith('COL_'): o.display_type = 'WIRE'; o.hide_render = True

guides = collection('GUIDES (left out by the game)')
gm = mat_img('GUIDE', None, 0.9); gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.1, 0.1, 1)
for i, b in ((1, BAY1), (2, BAY2), (3, BAY3)):
    g = box(f'GUIDE_Car{i}', guides, (2.0, 5.6, 1.0), (b.x, b.y, 0.5), gm); g.display_type = 'WIRE'
for o in guides.objects: o.hide_render = True

# ======================================================================================================================
# baked shadows (garagelib bake_ao, as the workshop's): -- --noao skips it (a quick look: it takes minutes)
if '--noao' not in args:
    import time; t0 = time.time()
    def see_through(m):
        p = m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None
        return bool(p) and (p.inputs['Alpha'].is_linked or p.inputs['Alpha'].default_value < 0.999)
    n = bake_ao(shell, skip={m for m in bpy.data.materials if see_through(m)}, distance=0.6, samples=32, wall=False)
    print(f'AO baked on {n} objects in {time.time() - t0:.0f} s')

# ======================================================================================================================
EXPORT = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'garage-unit.py')).read().split("EXPORT = r'''")[1].split("'''")[0]
t = bpy.data.texts.new('export_kit'); t.write(EXPORT)
path = os.path.join(OUT, f'factory-start-{TAG}.blend' if TAG else 'factory-start.blend')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=path)
print('wrote', path)
if '--export' in args:
    import tempfile, shutil
    ns = {'__name__': 'kit'}; exec(EXPORT, ns)
    if TAG:
        tmp = tempfile.mkdtemp(); ns['export_kit'](tmp, only=['shell_factory'])
        shutil.move(os.path.join(tmp, 'shell_factory.glb'), os.path.join(OUT, f'shell_factory_{TAG}.glb')); print('exported', f'shell_factory_{TAG}.glb')
    else: ns['export_kit'](OUT, only=['shell_factory'])
