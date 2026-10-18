# The race weekend's pit box, made properly (models/pitbox.glb; js/pitbox.js puts it in every team's box):
# a 2000s team garage, branded in each team's colours. The engineers' island as a stand of team cabinets under a
# monitor gantry (the computers and chairs where they were), tire stacks in electric blankets on trolleys with the
# warmers' box, roll cabs and the bench, wheel guns hanging off coiled air lines, the jacks parked, spare nose, wings
# and the parts racks at the back, the team backdrop with the sponsors' boards, painted bays on the floor, the fridge
# and the coffee, the rules sign. Built the garage-station way (.claude/skills/garage-station): grime on what's built,
# chamfered / lathed / swept shapes, ambient occlusion baked into the vertex colours (COLOR_0; the game multiplies its
# room light by it). The frame and the names: docs/PIT-BOX-MODEL.md.
#   Blender -b --python tools/pitbox-build.py -- [--out models/pitbox.glb] [--noao]
# Starts from models/pitbox.blend (its Reference and Spare props, the computers, chairs, timing screen, team name and the
# clutter), takes out the old furniture and builds the new; writes models/pitbox_v2.blend beside it (to look at
# and edit; the game loads models/pitbox.glb).
import bpy, math, os, sys, subprocess
import numpy as np
from contextlib import contextmanager
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); sys.path.insert(0, HERE)
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'pitbox.glb')
OUTBLEND = os.path.join(ROOT, 'models', 'pitbox_v2.blend')
ART = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art')
if not os.path.exists(os.path.join(ART, 'pit_board.png')): subprocess.run(['python3', os.path.join(HERE, 'pitbox-signs.py')], check=True)

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'models', 'pitbox.blend'))
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import BUILT
G.configure(os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen'), seed=7714)
BUILT.clear()
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
P = lambda x, y, z=0.0: Vector((x, y, z))
FL = 0.06   # (the floor's top)

# ---------------- out with the old furniture ----------------
OLD = ('tires', 'tool_chest', 'air_line', 'extinguisher', 'spare_wing', 'team_panel', 'bench_tall', 'shelving_a', 'shelving_c')
for o in list(bpy.data.objects):
    if o.name.startswith(OLD) and not o.name.startswith('REF_'): bpy.data.objects.remove(o, do_unlink=True)
box_coll = bpy.data.collections['Box']
# (the bench's clutter onto the new bench, the stray spray can with it)
for n, loc in (('spray.001', (6.62, 9.05, 1.0)),):
    o = bpy.data.objects.get(n)
    if o: o.location = loc

# every thing the game sees is one top-level object (its bounds: what's in the way, where the crew go: pitbox.js)
GROUPS = {}
@contextmanager
def thing(name):
    n0 = len(BUILT); yield; GROUPS.setdefault(name, []).extend(BUILT[n0:])

# ---------------- materials ----------------
def team_mat(name, base, dirt):
    # TEAM_MAIN / TEAM_ACCENT: a near-white painted texture the game tints with each team's colour (smooth paint with a
    # fleck and soft grime: the metal tiles' blotches were too much over a whole backdrop)
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    src = plain_mat(name + '_tex', (0.88, 0.88, 0.88), dirt=dirt)
    m.node_tree.nodes.clear(); nt = m.node_tree
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.name = 'Principled BSDF'; o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(p.outputs[0], o.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = [n for n in src.node_tree.nodes if n.type == 'TEX_IMAGE'][0].image; t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.6; p.inputs['Metallic'].default_value = 0.0
    bpy.data.materials.remove(src); return m
TM = team_mat('TEAM_MAIN', 'painted_metal.png', 0.16)
TA = team_mat('TEAM_ACCENT', 'painted_metal.png', 0.12)
steel = grimy_tile('Pb_Steel', 'dark_industrial_metal.png', dirt=0.3, rust=0.2)
alloy = grimy_tile('Pb_Alloy', 'galvanized_metal.png', dirt=0.2)
dark = grimy_tile('Pb_Dark', 'painted_metal.png', dirt=0.25, tint=(0.12, 0.13, 0.14))
grey = grimy_tile('Pb_Grey', 'painted_metal.png', dirt=0.25, tint=(0.45, 0.47, 0.48))
rubber = grimy_tile('Pb_Rubber', 'rubber.png', dirt=0.15)
hazard = grimy_tile('Pb_Hazard', 'hazard_stripes_01.png', dirt=0.4, wear_light=0.3)
red = grimy_tile('Pb_Red', 'painted_metal.png', dirt=0.3, tint=(0.7, 0.08, 0.06))
yellow = grimy_tile('Pb_Yellow', 'painted_metal.png', dirt=0.35, tint=(0.85, 0.66, 0.08))
worktop = grimy_tile('Pb_Worktop', 'rubber.png', dirt=0.25, tint=(0.16, 0.16, 0.17))
laptop = plain_mat('Pb_Laptop', (0.2, 0.21, 0.23), dirt=0.1)
white = plain_mat('Pb_White', (0.84, 0.84, 0.82), dirt=0.25)
black = solid_mat('Pb_Black', (0.03, 0.03, 0.035), 0.6)
glass = solid_mat('Pb_Glass', (0.05, 0.06, 0.07), 0.2)
def glow(name, png, k=1.4): return art_mat('GLOW_READ_' + name, A(png), dirt=0.04, emit=k, rough=0.3)
def print_(name, png, d=0.35): return art_mat('READ_Pb_' + name, A(png), dirt=d)
paint_line = TA
BIN_BLUE = plain_mat('Pb_BinBlue', (0.15, 0.3, 0.62), 0.25)
def panel_grid(name, coll, w, h, c, mat, nx, nz):
    # a flat wall panel facing -Y (into the room), in an nx by nz grid: vertices for the AO, few triangles
    verts = [(c.x - w / 2 + w * i / nx, c.y, c.z - h / 2 + h * j / nz) for j in range(nz + 1) for i in range(nx + 1)]
    faces = [(j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i) for j in range(nz) for i in range(nx)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    if me.polygons[0].normal.y > 0: me.flip_normals()
    uv_world(me, Matrix.Identity(4), 0.5); o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return mk(o)

# ================= the engineers' island: team cabinets, the worktop, the monitor gantry =================
with thing('eng_cabinets'):
    bbox('Island_Plinth', box_coll, (0.74, 4.14, 0.06), P(0, 4.5, FL + 0.03), black, bev=0.004)
    bbox('Island_Body', box_coll, (0.8, 4.2, 0.59), P(0, 4.5, FL + 0.06 + 0.295), TM, bev=0.012)
    bbox('Island_Top', box_coll, (0.9, 4.3, 0.04), P(0, 4.5, 0.73), worktop, bev=0.008)
    for s in (-1, 1):
        for row, z in enumerate((0.27, 0.52)):
            for i in range(5): bx(f'Island_Handle_{s}_{row}_{i}', box_coll, (0.012, 0.22, 0.016), P(s * 0.41, 2.85 + i * 0.84, z), alloy)
        bx(f'Island_Stripe_{s}', box_coll, (0.006, 4.16, 0.05), P(s * 0.403, 4.5, 0.64), TA)
with thing('eng_gantry'):
    for y in (2.48, 6.52):
        bx(f'Gantry_Post_{y}', box_coll, (0.07, 0.07, 1.45), P(0, y, 0.75 + 0.725), alloy)
        bx(f'Gantry_Foot_{y}', box_coll, (0.18, 0.18, 0.012), P(0, y, 0.756), steel)
    bbox('Gantry_Beam', box_coll, (0.1, 4.2, 0.08), P(0, 4.5, 2.2), alloy, bev=0.008)
    for k, (y, art) in enumerate(((3.55, 'screen_tele'), (5.45, 'screen_timing'))):
        for s in (-1, 1):
            bbox(f'Gantry_Mon_{k}_{s}', box_coll, (0.04, 0.56, 0.36), P(s * 0.06, y, 1.92), dark, bev=0.008)
            cd(f'Gantry_Scr_{k}_{s}', box_coll, 0.5, 0.31, P(s * 0.081, y, 1.765), glow(f'pit_{art}_{s}', art, 1.3), rotz=s * D90)   # (each screen to its side of the island)
        # the pair's mount: a block between their backs on a drop tube from the beam
        bx(f'Gantry_Mount_{k}', box_coll, (0.08, 0.14, 0.12), P(0, y, 1.95), steel)
        bx(f'Gantry_Drop_{k}', box_coll, (0.04, 0.04, 0.16), P(0, y, 2.08), alloy)

    # two headsets on the posts' hooks
    for k, y in enumerate((2.48, 6.52)):
        bx(f'Headset_Hook_{k}', box_coll, (0.12, 0.02, 0.02), P(0.06, y - 0.045, 1.72), steel)
        for s in (-1, 1): cy(f'Headset_Cup_{k}_{s}', box_coll, 0.045, 0.035, P(0.11, y - 0.06 + s * 0.08, 1.5), black, rot=(D90, 0, 0), verts=7)
        sweep(f'Headset_Band_{k}', box_coll, [P(0.11, y - 0.14, 1.52), P(0.11, y - 0.06, 1.71), P(0.11, y + 0.02, 1.52)], 0.01, black, segs=3, per_m=8)
with thing('eng_laptop'):   # (between the crew computers, open, its log on)
    bbox('Laptop_Base', box_coll, (0.24, 0.32, 0.022), P(-0.18, 4.51, 0.761), laptop, bev=0.004)
    cd('Laptop_Lid', box_coll, 0.32, 0.22, P(-0.07, 4.51, 0.772), glow('pit_laptop', 'data_laptop' if os.path.exists(A('data_laptop')) else 'screen_dyno', 1.1), rotz=-D90, tilt=0.25)
    # the lid's shell behind the screen (the screen alone showed through from the back)
    _r = Euler((0.25, 0, -D90)); bbox('Laptop_Shell', box_coll, (0.33, 0.01, 0.23), P(-0.07, 4.51, 0.772) + _r.to_matrix() @ Vector((0, 0.006, 0.11)), laptop, rot=tuple(_r), bev=0.003)
with thing('eng_clipboards'):
    for k, (x, y, a) in enumerate(((0.22, 2.62, 0.2), (-0.25, 6.38, -0.3))):
        bx(f'Clip_Board_{k}', box_coll, (0.23, 0.31, 0.008), P(x, y, 0.754), dark, rot=(0, 0, a))
        cd(f'Clip_Sheet_{k}', box_coll, 0.2, 0.26, P(x, y - 0.13 * math.cos(a) * 0 , 0.7585), print_(f'Sheet{k}', 'pit_sheet', 0.2), rotz=a + math.pi, tilt=-D90)

# ================= tires: four stacks on trolleys along the left wall, three in electric blankets =================
TX = -6.72
def tire_stack(name, y, blankets=True):
    with thing(name):
        bbox(f'{name}_Dolly', box_coll, (0.72, 0.72, 0.04), P(TX, y, FL + 0.07), steel, bev=0.006)
        for sx in (-1, 1):
            for sy in (-1, 1): cy(f'{name}_Castor_{sx}{sy}', box_coll, 0.035, 0.05, P(TX + sx * 0.28, y + sy * 0.28, FL + 0.035), rubber, rot=(D90, 0, 0), verts=6)
        z0, prof = FL + 0.09, []
        for i in range(4):   # (each wheel: the blanket round its tire, a groove between)
            b = z0 + i * 0.3
            prof += [(0.28, b + 0.01), (0.345, b + 0.08), (0.345, b + 0.22)] + ([(0.28, b + 0.29)] if i == 3 else [])
        lathe(f'{name}_Blankets', box_coll, prof, P(TX, y, 0), TM if blankets else rubber, segs=8, cap0=False, cap1=False)
        top = z0 + 1.2
        lathe(f'{name}_Rim', box_coll, [(0.27, top - 0.005), (0.24, top - 0.02), (0.07, top - 0.06), (0.0, top - 0.06)], P(TX, y, 0), alloy, segs=8, cap0=False)
        if blankets:
            lathe(f'{name}_Band', box_coll, [(0.347, z0 + 0.13), (0.347, z0 + 0.17)], P(TX, y, 0), TA, segs=8, cap0=False, cap1=False)   # (the top blanket's accent band: one, they're all alike)
            sweep(f'{name}_Lead', box_coll, [P(TX - 0.3, y, z0 + 0.6), P(TX - 0.5, y + 0.1, 0.9), P(-7.18, y * 0.5 + 2.3, 1.15)], 0.009, black, segs=4, per_m=5)
for k, (y, bl) in enumerate(((3.1, True), (4.15, True), (5.2, True), (6.25, False))): tire_stack(f'tires_{k + 1}', y, bl)
with thing('tires_warmer_box'):
    bbox('Warmer_Box', box_coll, (0.14, 0.36, 0.28), P(-7.24, 4.6, 1.2), dark, bev=0.01)
    cd('Warmer_Face', box_coll, 0.32, 0.24, P(-7.165, 4.6, 1.08), glow('pit_warmer', 'pit_warmer', 0.9), rotz=D90)
    sweep('Warmer_Feed', box_coll, [P(-7.27, 4.6, 1.06), P(-7.3, 4.75, 0.6), P(-7.3, 4.9, FL + 0.02)], 0.01, black, segs=4, per_m=5)

# ================= the right wall: two roll cabs with their worktops, the bench, the jacks =================
CX = 6.85
for k, y in enumerate((3.25, 4.75)):
    with thing(f'tool_chest_{k + 1}'):
        bbox(f'Cab_{k}_Body', box_coll, (0.72, 1.4, 0.95), P(CX, y, FL + 0.08 + 0.475), TM, bev=0.015)
        bbox(f'Cab_{k}_Top', box_coll, (0.76, 1.44, 0.03), P(CX, y, FL + 1.045), worktop, bev=0.006)
        bx(f'Cab_{k}_Plinth', box_coll, (0.66, 1.34, 0.08), P(CX, y, FL + 0.04), black)
        for i in range(6):
            z = FL + 0.2 + i * 0.14
            bx(f'Cab_{k}_Handle_{i}', box_coll, (0.016, 1.2, 0.018), P(CX - 0.365, y, z), alloy)
        bx(f'Cab_{k}_Stripe', box_coll, (0.006, 1.38, 0.04), P(CX - 0.362, y, FL + 0.95), TA)
        # on top: a torque wrench, the wheel nuts, a socket rail
        rd(f'Cab_{k}_Torque', box_coll, P(CX - 0.15, y - 0.45, FL + 1.075), P(CX - 0.05, y + 0.25, FL + 1.075), 0.012, steel, verts=6)
        bx(f'Cab_{k}_TorqueHead', box_coll, (0.05, 0.05, 0.03), P(CX - 0.15, y - 0.47, FL + 1.075), dark)
        for i in range(3): cy(f'Cab_{k}_Nut_{i}', box_coll, 0.03, 0.03, P(CX + 0.15, y - 0.2 + i * 0.09, FL + 1.075), alloy, verts=6)
        bx(f'Cab_{k}_Rail', box_coll, (0.06, 0.4, 0.02), P(CX + 0.12, y + 0.35, FL + 1.07), red)
with thing('bench_vice'):   # (the old bench's place: its clutter sits on top at z 1.0)
    bbox('Bench_Top', box_coll, (0.86, 2.0, 0.05), P(6.9, 8.9, 0.975), steel, bev=0.008)
    for x in (6.52, 7.26):
        for y in (8.0, 9.8): bx(f'Bench_Leg_{x}_{y}', box_coll, (0.05, 0.05, 0.9), P(x, y, FL + 0.45), dark)
    bx('Bench_Shelf', box_coll, (0.8, 1.9, 0.03), P(6.9, 8.9, 0.25), dark)
    bbox('Vice_Body', box_coll, (0.16, 0.22, 0.12), P(6.55, 9.6, 1.06), red, bev=0.01)
    rd('Vice_Bar', box_coll, P(6.42, 9.6, 1.04), P(6.42, 9.6 - 0.16, 1.04), 0.008, steel, verts=5)
with thing('jack_front'):   # (the long-handled front jack, parked along the wall)
    bbox('FJack_Base', box_coll, (0.32, 0.9, 0.1), P(6.72, 10.8, FL + 0.08), yellow, bev=0.01)
    for sx in (-1, 1):
        for y in (10.42, 11.18): cy(f'FJack_Wheel_{sx}{y}', box_coll, 0.05, 0.04, P(6.72 + sx * 0.17, y, FL + 0.05), rubber, rot=(0, D90, 0), verts=8)
    bbox('FJack_Saddle', box_coll, (0.3, 0.12, 0.06), P(6.72, 10.32, FL + 0.16), black, bev=0.008)
    rd('FJack_Handle', box_coll, P(6.72, 11.2, FL + 0.14), P(6.72, 12.1, 1.0), 0.02, yellow, verts=6)
    bbox('FJack_Grip', box_coll, (0.36, 0.05, 0.05), P(6.72, 12.12, 1.02), black, bev=0.01)
with thing('jack_rear'):
    bbox('RJack_Base', box_coll, (0.36, 0.6, 0.12), P(6.75, 12.6, FL + 0.09), yellow, bev=0.01)
    bbox('RJack_Saddle', box_coll, (0.34, 0.14, 0.07), P(6.75, 12.33, FL + 0.19), black, bev=0.008)
    rd('RJack_Handle', box_coll, P(6.75, 12.85, FL + 0.15), P(6.75, 13.25, 0.7), 0.02, yellow, verts=6)
    for sx in (-1, 1): cy(f'RJack_Wheel_{sx}', box_coll, 0.045, 0.04, P(6.75 + sx * 0.19, 12.75, FL + 0.045), rubber, rot=(0, D90, 0), verts=8)

# ================= the back: the backdrop, the sponsors' boards, spare bodywork, parts racks, coffee =================
with thing('team_backdrop'):
    panel_grid('Backdrop_Panel', box_coll, 11.4, 4.2, P(0, 13.94, FL + 2.1), TM, 12, 5)
    for z in (0.62, 4.0): bx(f'Backdrop_Band_{z}', box_coll, (11.4, 0.05, 0.12), P(0, 13.9, z), TA)
    for k, (x, art) in enumerate(((-3.2, 'pit_sponsors_a'), (3.2, 'pit_sponsors_b'))):
        bx(f'Sponsor_Frame_{k}', box_coll, (3.9, 0.04, 1.04), P(x, 13.88, 1.5), dark)
        cd(f'Sponsor_Board_{k}', box_coll, 3.8, 0.95, P(x, 13.855, 1.025), print_(f'Sponsors{k}', art, 0.15))   # (facing into the room: -Y)
with thing('spare_nose_rack'):   # (a steel stand: the spare nose on its cradle, the front wing hung above it)
    for x in (-3.5, -1.3):
        bx(f'NoseRack_Leg_{x}', box_coll, (0.05, 0.5, 0.05), P(x, 13.35, FL + 0.03), steel)
        bx(f'NoseRack_Post_{x}', box_coll, (0.05, 0.05, 1.7), P(x, 13.55, FL + 0.85), steel)
    bx('NoseRack_Arm', box_coll, (2.25, 0.05, 0.05), P(-2.4, 13.55, 1.72), steel)
    bbox('NoseRack_Cradle', box_coll, (2.25, 0.36, 0.04), P(-2.4, 13.35, 0.62), steel, bev=0.005)
    lathe('Spare_Nose', box_coll, [(0.0, 0.0), (0.06, 0.05), (0.13, 0.35), (0.17, 0.75), (0.19, 1.1), (0.19, 1.2)], P(-1.85, 13.35, 0.82), TM, segs=10, rot=(0, -D90, 0), cap1=True)
    bbox('Spare_FWing', box_coll, (1.8, 0.03, 0.26), P(-2.4, 13.5, 1.45), TM, bev=0.006)
    bbox('Spare_FWingFlap', box_coll, (1.7, 0.025, 0.1), P(-2.4, 13.47, 1.25), TA, bev=0.005)
    for s in (-1, 1): bbox(f'Spare_FWingPlate_{s}', box_coll, (0.02, 0.32, 0.36), P(-2.4 + s * 0.9, 13.45, 1.38), TA, bev=0.005)
    for s in (-1, 1): bx(f'Spare_FWingStrap_{s}', box_coll, (0.03, 0.015, 0.2), P(-2.4 + s * 0.6, 13.53, 1.6), black)   # (hung off the arm on straps)
with thing('spare_wing'):   # (a rear wing on its T-stand)
    bbox('RWing_StandFoot', box_coll, (0.9, 0.5, 0.04), P(1.5, 13.35, FL + 0.02), steel, bev=0.006)
    bx('RWing_StandPost', box_coll, (0.06, 0.06, 0.95), P(1.5, 13.35, FL + 0.5), steel)
    for k, (z, d) in enumerate(((1.08, 0.3), (1.25, 0.18))): bbox(f'RWing_Element_{k}', box_coll, (1.5, d, 0.03), P(1.5, 13.35 + k * 0.08, z), TM if k == 0 else TA, rot=(-0.2, 0, 0), bev=0.006)
    for s in (-1, 1): bbox(f'RWing_Plate_{s}', box_coll, (0.02, 0.5, 0.42), P(1.5 + s * 0.76, 13.38, 1.12), TM, bev=0.006)
with thing('shelving_parts'):   # (the parts racks at the back left: labelled bins)
    for y in (11.95, 13.45):
        for x in (-7.25, -6.82): bx(f'Shelf_Upright_{x}_{y}', box_coll, (0.035, 0.035, 2.0), P(x, y, FL + 1.0), grey)
    for i, z in enumerate((0.15, 0.65, 1.15, 1.65, 2.04)):
        bx(f'Shelf_Board_{i}', box_coll, (0.47, 1.54, 0.025), P(-7.035, 12.7, FL + z), grey)
        if i < 4:
            for j in range(4):
                bx(f'Shelf_Bin_{i}_{j}', box_coll, (0.36, 0.3, 0.17), P(-7.0, 12.15 + j * 0.37, FL + z + 0.1), yellow if (i + j) % 3 else BIN_BLUE)
            cd(f'Shelf_Label_{i}', box_coll, 1.46, 0.045, P(-6.815, 12.7, FL + z - 0.005), print_('Bins', 'pit_bins', 0.2), rotz=D90)   # (to the room: +X)
with thing('fridge'):
    bbox('Fridge_Body', box_coll, (0.6, 0.62, 1.45), P(6.95, 13.5, FL + 0.725), white, bev=0.02)
    bx('Fridge_Line', box_coll, (0.005, 0.6, 0.012), P(6.647, 13.5, FL + 1.05), grey)
    bx('Fridge_Handle', box_coll, (0.02, 0.03, 0.3), P(6.64, 13.25, FL + 1.25), alloy)
    cd('Fridge_Sticker', box_coll, 0.3, 0.135, P(6.645, 13.55, FL + 0.6), print_('Cola', 'pit_cola', 0.25), rotz=-D90)
with thing('bench_coffee'):
    bbox('Coffee_Counter', box_coll, (0.6, 1.0, 0.86), P(6.95, 12.6 - 0.05, FL + 0.43), grey, bev=0.012)
    bbox('Coffee_Machine', box_coll, (0.28, 0.24, 0.32), P(7.05, 12.4, FL + 0.86 + 0.16), black, bev=0.015)
    lathe('Coffee_Jug', box_coll, [(0, 0), (0.06, 0), (0.07, 0.07), (0.05, 0.14), (0, 0.15)], P(6.9, 12.4, FL + 0.865), glass, segs=8)
    for i in range(3): lathe(f'Coffee_Cup_{i}', box_coll, [(0, 0), (0.03, 0), (0.035, 0.09), (0.032, 0.09)], P(6.85, 12.7 + i * 0.08, FL + 0.86), white, segs=8, cap1=False)

# ================= overhead: wheel guns hanging off coiled air lines, a reel each =================
# A gun hangs from its hose where it goes into the grip, so it tips over until its weight is under that point: about 50
# degrees, the socket down and out. The hose drops off the reel, coils, and runs into the grip's end.
GUN_COM = Vector((0, 0, 0.08)); GRIP_END = Vector((0.16, 0, 0.215))
_v = GRIP_END - GUN_COM; GUN_TIP = -math.atan2(_v.x, _v.z)
for k, (side, sx, pos, y) in enumerate((('L', -1, 'front', 3.05), ('L', -1, 'back', 6.05), ('R', 1, 'front', 3.05), ('R', 1, 'back', 6.05))):
    with thing(f'air_line_{side}_{pos}'):
        n = f'Air_{side}{pos}'; x = sx * 2.2
        yaw = (0.4, -0.9, 2.5, 3.6)[k]; sway = (0.05, -0.07, 0.08, -0.04)[k]
        R = (Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(GUN_TIP + sway, 4, 'Y'))
        E = P(x + (0.012, -0.01, 0.015, -0.008)[k], y + (0.01, 0.014, -0.012, 0.0)[k], 1.8)   # (where it hangs from)
        M = Matrix.Translation(E - R @ GRIP_END) @ R; eu = M.to_euler()
        L = lambda vx, vy, vz: M @ Vector((vx, vy, vz))
        def at(ex, ey, ez): return (Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(GUN_TIP + sway, 4, 'Y') @ Euler((ex, ey, ez)).to_matrix().to_4x4()).to_euler()
        # the reel and its bracket
        cy(f'{n}_Reel', box_coll, 0.14, 0.12, P(x, y, 4.42), red, rot=(0, D90, 0), verts=8)
        bx(f'{n}_Bracket', box_coll, (0.16, 0.04, 0.16), P(x, y, 4.53), steel)
        # the gun: motor housing, the team band, the hex socket, the pistol grip, the trigger and the reverse switch
        lathe(f'{n}_Housing', box_coll, [(0.0, 0.0), (0.04, 0.0), (0.048, 0.02), (0.05, 0.17), (0.042, 0.21), (0.0, 0.222)], L(0, 0, 0), dark, segs=10, rot=eu)
        lathe(f'{n}_Band', box_coll, [(0.053, 0.11), (0.053, 0.145)], L(0, 0, 0), TA, segs=10, rot=eu, cap0=False, cap1=False)
        lathe(f'{n}_Socket', box_coll, [(0.0, -0.115), (0.036, -0.115), (0.041, -0.095), (0.041, -0.025), (0.03, 0.0)], L(0, 0, 0), steel, segs=6, rot=eu)
        lathe(f'{n}_Nut', box_coll, [(0.026, -0.118), (0.026, -0.1)], L(0, 0, 0), black, segs=6, rot=eu, cap0=True, cap1=False)
        rd(f'{n}_Grip', box_coll, L(0.035, 0, 0.17), L(0.165, 0, 0.217), 0.021, black, verts=6)
        bx(f'{n}_Trigger', box_coll, (0.018, 0.016, 0.04), L(0.07, 0, 0.155), red, rot=at(0, 0.35, 0))
        bx(f'{n}_Switch', box_coll, (0.03, 0.02, 0.014), L(0.0, 0, 0.226), red, rot=eu)
        # the hose: off the reel, straight down, a loose coil drifting a little, then into the grip's end
        g = (M.to_3x3() @ Vector((0.13, 0, 0.047))).normalized()
        pts = [P(x, y, 4.29), P(x, y, 3.7), P(x + 0.03, y, 3.42)]
        cx, cyy, z0, z1, r, turns = x, y, 3.32, 2.12, 0.06, 9
        for i in range(turns * 5 + 1):
            t = i / (turns * 5); a = i * math.tau / 5 + k
            pts.append(P(cx + r * math.cos(a) + (E.x - x) * t, cyy + r * math.sin(a) + (E.y - y) * t, z0 + (z1 - z0) * t))
        pts += [P(E.x, E.y, 2.0), E + g * 0.07 + Vector((0, 0, 0.05)), E + g * 0.012]
        sweep(f'{n}_Hose', box_coll, pts, 0.012, black, segs=4, per_m=12)

# ================= the floor: the cars' bays painted, the wheel marks, a cable ramp =================
with thing('floor_markings'):
    for sx in (-1, 1):
        cx = sx * 3.35
        for (w, d, x, y) in ((2.7, 0.08, cx, 1.55), (2.7, 0.08, cx, 7.55), (0.08, 6.08, cx - 1.31, 4.55), (0.08, 6.08, cx + 1.31, 4.55)):
            bx(f'Bay_{sx}_{x:.2f}_{y:.2f}', box_coll, (w, d, 0.004), P(x, y, FL + 0.002), paint_line)
        for wx in (-0.82, 0.82):
            for wy in (3.0, 6.1): bx(f'Bay_Mark_{sx}_{wx}_{wy}', box_coll, (0.3, 0.06, 0.004), P(cx + wx, wy, FL + 0.003), white)
    bbox('Cable_Ramp', box_coll, (5.7, 0.26, 0.05), P(-3.35, 8.2, FL + 0.025), hazard, bev=0.012)
    bx('Front_Line', box_coll, (11.0, 0.12, 0.004), P(0, 0.7, FL + 0.002), white)

# ================= the corners: extinguishers, the rules, the pit boards =================
for side, sx in (('L', -1), ('R', 1)):
    with thing(f'extinguisher_{side}'):
        lathe(f'Ext_{side}_Body', box_coll, [(0, 0), (0.085, 0), (0.09, 0.02), (0.09, 0.5), (0.06, 0.58), (0.025, 0.62), (0, 0.62)], P(sx * 7.08, 1.0, FL), red, segs=10)
        bx(f'Ext_{side}_Valve', box_coll, (0.04, 0.12, 0.05), P(sx * 7.08, 1.0, FL + 0.66), steel)
        sweep(f'Ext_{side}_Hose', box_coll, [P(sx * 7.08, 0.94, FL + 0.66), P(sx * 7.0, 0.88, FL + 0.45), P(sx * 7.02, 0.93, FL + 0.2)], 0.012, black, segs=4, per_m=10)
with thing('rules_sign'):
    cd('Rules', box_coll, 0.9, 0.34, P(-6.4, 0.42, 1.55), print_('Rules', 'pit_rules', 0.3), rotz=math.pi)
with thing('pit_boards'):   # (two boards hung on the left wall at the back, ready for the wall)
    for k, y in enumerate((9.3, 9.75)):
        bx(f'PitBoard_Pole_{k}', box_coll, (0.025, 0.025, 1.3), P(-7.27, y, 1.3 - 0.0), alloy)
        bx(f'PitBoard_Frame_{k}', box_coll, (0.02, 0.36, 0.7), P(-7.29, y, 1.9), TA)
        cd(f'PitBoard_{k}', box_coll, 0.32, 0.64, P(-7.275, y, 1.58), print_(f'PitBoard{k}', 'pit_board', 0.15), rotz=D90)
    bx('PitBoard_Hook', box_coll, (0.06, 0.8, 0.03), P(-7.3, 9.52, 2.3), steel)

# ================= AO, then one object a thing =================
if '--noao' not in args:
    # (the room's own walls, floor and ceiling are in Reference: they shade it; no wall of bake_ao's own)
    print('AO baked on', bake_ao(box_coll, wall=False, distance=0.6), 'objects')
done = []
for name, objs in GROUPS.items():
    objs = [o for o in objs if o.name in bpy.data.objects and o.type == 'MESH']
    if not objs: continue
    bpy.ops.object.select_all(action='DESELECT')
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs): bpy.ops.object.join()
    o = objs[0]; o.name = name; o.data.name = name
    if 'AO' in o.data.color_attributes: o.data.color_attributes.active_color = o.data.color_attributes['AO']
    done.append(o)
bpy.context.view_layer.update()

# ---------------- a check: floating things, the bays and the way out clear, the budget ----------------
def wb(o):
    vs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])
tops = [o for o in box_coll.all_objects if o.type == 'MESH' and o.parent is None]
problems = []
HANG = ('air_line', 'pit_boards', 'rules_sign', 'tires_warmer_box', 'team_backdrop', 'TIMING', 'timing', 'team_band', 'TEAM', 'fuse', 'extinguisher')
for o in tops:
    lo, hi = wb(o)
    if lo.z > FL + 0.03 and not o.name.startswith(HANG):
        sup = [p for p in tops if p is not o and all(wb(p)[0][i] - 0.015 <= hi[i] and lo[i] - 0.015 <= wb(p)[1][i] for i in range(3))]
        if not sup: problems.append(f'FLOATING {o.name} (bottom {lo.z:.3f})')
    # (the cars' bays and the way to the door: x 2.0..4.7 either side, y 0..7.6, nothing below the cars' roof)
    for sx in (-1, 1):
        x0, x1 = (2.0, 4.7) if sx > 0 else (-4.7, -2.0)
        if lo.x < x1 and hi.x > x0 and lo.y < 7.6 and lo.z < 1.3 and not o.name.startswith(('floor_markings', 'air_line')):
            problems.append(f'IN A BAY {o.name} x {lo.x:.2f}..{hi.x:.2f} y {lo.y:.2f}..{hi.y:.2f} z {lo.z:.2f}')
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in box_coll.all_objects if o.type == 'MESH')
tri += sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for c in bpy.data.collections if c.name == 'Your desk' for o in c.all_objects if o.type == 'MESH')
chairs = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH' and 'chair' in o.name and not o.name.startswith('REF_'))
tri += chairs
for p in problems: print('CHECK', p)
print(f'PITBOX things {len(tops)}, triangles {tri} (chairs {chairs}), problems {len(problems)}')
for t, c in sorted(((sum(len(p.vertices) - 2 for p in o.data.polygons), o.name) for o in tops), reverse=True)[:12]: print('  TRIS', c, t)

# ---------------- out ----------------
bpy.ops.export_scene.gltf(filepath=OUTGLB, export_format='GLB', export_yup=True, export_apply=True, use_visible=False,
                          export_animations=False, export_lights=False, export_cameras=False, export_vertex_color='ACTIVE')
print('exported', OUTGLB)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=OUTBLEND)
print('saved', OUTBLEND)
