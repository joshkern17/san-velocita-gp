# The data room, made properly (the home garage's station_data, see docs/GARAGE-KIT.md and the garage-station skill):
# a small race team's engineering office on the mezzanine, its desks along the rail looking out over the workshop.
# A run of workstations on a steel frame (CRTs on telemetry and timing, the Win95 box, towers under, keyboards, setup
# sheets, desk lamps), the laptop with the car's download loom coiled on the floor, the pit radios in their chargers;
# along the back wall the network cabinet with its blinking rack, the dot-matrix printer on its cart spilling fanfold,
# the whiteboard, a cork board of photos and timing sheets, and the coffee corner (machine, mugs, a box of donuts).
# Carpet tiles over the deck, cables taped down across it, strip lights on chains. In use: the screens and the laptop
# lit (and their glow). Ambient occlusion baked into the vertex colours. Same footprint and hooks as the old one in
# tools/garage-stations.py (STAND_data seats, STAND_manager, STAND_any at the whiteboard and the printer), so it drops
# into the same SLOT_data on the unit's deck.
#   Blender --background --python tools/garage-data.py -- [--out models/garage/station_data.glb] [--blend]
import bpy, bmesh, math, os, sys, subprocess
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.path.expanduser('~'), 'Downloads', 'Racing Game', 'tools')
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'models', 'garage', 'src'); ST = os.path.join(SRC, 'stations'); ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTGLB = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'models', 'garage', 'station_data.glb')
LIVE = not bpy.app.background

if LIVE:   # (in your Blender: a scene of its own)
    sc = bpy.data.scenes.get('Data room') or bpy.data.scenes.new('Data room')
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.window.scene = sc
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import importlib, garagelib as G
importlib.reload(G)
from garagelib import *
from garagelib import LIB, BUILT
G.configure(os.path.join(SRC, 'stations_gen'), seed=7731)
for art_, script_ in (('dyno_plate', 'garage-signs.py'), ('data_laptop', 'garage-signs-data.py')):
    if not os.path.exists(os.path.join(ART, art_ + '.png')): subprocess.run(['python3', os.path.join(HERE, script_)], check=True)
A = lambda n: os.path.join(ART, n + '.png')
D90 = math.pi / 2
BUILT.clear()

# ---------------- materials ----------------
steel = grimy_tile('Da_Steel', 'dark_industrial_metal.png', dirt=0.3, rust=0.2)
frame = grimy_tile('Da_Frame', 'painted_metal.png', dirt=0.3, rust=0.1, tint=(0.2, 0.21, 0.23))
grey = grimy_tile('Da_Grey', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.46, 0.48, 0.49))
def plain(name, rgb, dirt=0.25, fleck=0.03, rough=0.7):
    # a smooth surface (laminate, beige plastic): its colour with a fine fleck and soft grime, not a metal's blotches
    m_ = 64; c = np.ones((m_, m_, 3), np.float32) * np.array(rgb, np.float32)
    c = c * (1 + fleck * (vnoise(m_, m_, 1, wrap=True) - 0.5) * 2)[..., None]
    return mat_img(name, px_tex(name, grime(c, np.clip(fbm(m_, m_, (32, 8), wrap=True) - 0.35, 0, 1) * dirt)), rough)
laminate = plain('Da_Laminate', (0.62, 0.6, 0.55), dirt=0.3, fleck=0.05)
beige = plain('Da_Beige', (0.76, 0.72, 0.62), dirt=0.2)
alloy = grimy_tile('Da_Alloy', 'galvanized_metal.png', dirt=0.2)
wood = grimy_tile('Da_Wood', 'wood.png', dirt=0.35)
hazard = grimy_tile('Da_Hazard', 'hazard_stripes_01.png', dirt=0.45, wear_light=0.3)
rubber = grimy_tile('Da_Rubber', 'rubber.png', dirt=0.2)
# carpet tiles: blue-grey, a fine pile, the tile seams every 50 cm (one tile of texture), worn and stained
n = 64; yy, xx = np.mgrid[0:n, 0:n]
pile = vnoise(n, n, 1, wrap=True) * 0.5 + fbm(n, n, (8, 2), wrap=True) * 0.5
col = np.stack([0.3 + 0.08 * pile, 0.33 + 0.08 * pile, 0.37 + 0.09 * pile], -1)
col[(xx < 1) | (yy < 1)] *= 0.7
col = grime(col, np.clip((fbm(n, n, (32, 8), wrap=True) - 0.55) * 2.0, 0, 1) * 0.5)
carpet = mat_img('Da_Carpet', px_tex('Da_Carpet', col), 0.95)
# cork: brown speckle
g = vnoise(n, n, 1, wrap=True); col = np.stack([0.52 + 0.2 * g, 0.36 + 0.14 * g, 0.2 + 0.08 * g], -1) * (0.8 + 0.25 * (vnoise(n, n, 2, wrap=True) > 0.6)[..., None])
cork = mat_img('Da_Cork', px_tex('Da_Cork', grime(col, fbm(n, n, (16, 4), wrap=True) * 0.25)), 0.95)
black = solid_mat('Da_Black', (0.03, 0.03, 0.035), 0.6)
glass = solid_mat('Da_Glass', (0.05, 0.04, 0.03), 0.15)
coffee = solid_mat('Da_Coffee', (0.06, 0.03, 0.015), 0.2)
pinred = solid_mat('Da_PinRed', (0.7, 0.05, 0.04), 0.4); pinblue = solid_mat('Da_PinBlue', (0.08, 0.2, 0.7), 0.4)
led_g = mat_img('Da_LedGreen', None, 0.4, emit=((0.25, 1.0, 0.35), 4.0)); led_r = mat_img('Da_LedRed', None, 0.4, emit=((1.0, 0.2, 0.15), 3.0))
tube = mat_img('Da_Tube', None, 0.5, emit=((0.92, 0.96, 1.0), 9.0))
screen_off = solid_mat('Da_ScreenOff', (0.02, 0.03, 0.03), 0.3)
markers = [solid_mat(f'Da_Marker{k}', c, 0.5) for k, c in enumerate(((0.05, 0.1, 0.5), (0.6, 0.05, 0.05), (0.05, 0.35, 0.1), (0.05, 0.05, 0.05)))]
def glow(name, png, k=1.6): return art_mat(name, A(png), dirt=0.05, emit=k, rough=0.3)
def print_(name, png, d=0.3): return art_mat(name, A(png), dirt=d)
paper = print_('Da_Printout', 'printout', 0.15)

# ---------------- props from the packs ----------------
S_ = lambda n: os.path.join(ST, n)
lib('crtmon', S_('CrtMonitor.glb'), height=0.4); lib('kbd', S_('keyboard.glb'), scale=0.9); lib('mouse', S_('mouse.glb'), scale=0.8)
lib('tower', S_('computer_tower.glb'), height=0.42); lib('floppy', S_('floppy35.glb'))
lib('chair_k', S_('office_chair_black.glb'), height=0.95); lib('chair_g', S_('office_chair_grey.glb'), height=0.95); lib('chair_b', S_('office_chair_blue.glb'), height=0.95)
lib('phone', S_('desk_phone_with_cable.glb'), scale=0.55); lib('lamp', S_('square_desklamp.glb'), scale=0.9); lib('mug', S_('mug_alt.glb'), height=0.1)
lib('binder', S_('file_binder.glb'), scale=0.8); lib('binder2', S_('file_binder_alt.glb'), scale=0.8)
lib('cab_low', S_('file_cabinet_larger.glb'), scale=0.72); lib('papers', S_('paper_stack_large.glb'), scale=0.7)
lib('win95', S_('psx_win95_pc._90s/scene.gltf'), ('Old_PC_crt', 'Old_PC_WinBox', 'Old_PC_Keyboard', 'Old_PC_Mouse'), height=0.42)
lib('ashtray', S_('psx_style_smoking_pack/scene.gltf'), ('Cube', 'Cigarette'), height=0.06)
lib('can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12); lib('can_crushed', S_('trash_and_debris/scene.gltf'), 'Can_3_Crushed', height=0.1)
lib('coffee_cup', S_('trash_and_debris/scene.gltf'), 'Coffee_Cup_WithLid', height=0.13)

kit = collection('KIT (each collection is one .glb)'); stations = collection('STATIONS', kit)
dt = collection('station_data', stations); dt.instance_offset = (0, 0, 0)
P = lambda x, y, z=0.0: Vector((x, y, z))

# ================= the office floor: carpet tiles over the deck, to the rail =================
cp = bx('Data_Carpet', dt, (8.9, 3.32, 0.008), P(0, -1.7, 0.004), carpet); grid_out(cp, 0.45); retile(cp, 2.0)

# ================= the desk run along the rail =================
DT = 0.73; DX0, DX1, DY = -3.5, 3.5, -3.0       # (its top, its ends, its middle: back edge at the rail)
bbox('Data_DeskTop', dt, (DX1 - DX0, 0.72, 0.03), P(0, DY, DT - 0.015), laminate, bev=0.006)
bx('Data_DeskEdge', dt, (DX1 - DX0, 0.012, 0.035), P(0, DY + 0.36, DT - 0.017), black)
for k, x in enumerate((DX0 + 0.05, -1.2, 1.2, DX1 - 0.05)):
    for y in (DY - 0.3, DY + 0.3): bx(f'Data_DeskLeg_{k}_{y:+.2f}', dt, (0.04, 0.04, DT - 0.03), P(x, y, (DT - 0.03) / 2), frame)
    bx(f'Data_DeskFoot_{k}', dt, (0.05, 0.66, 0.03), P(x, DY, 0.015), frame)
    bx(f'Data_DeskRail_{k}', dt, (0.04, 0.6, 0.04), P(x, DY, DT - 0.05), frame)
bx('Data_Modesty', dt, (DX1 - DX0 - 0.1, 0.015, 0.45), P(0, DY - 0.33, 0.45), grey)        # (the panel on the rail side, seen from below)
bx('Data_CableTray', dt, (DX1 - DX0 - 0.3, 0.14, 0.012), P(0, DY - 0.2, DT - 0.16), alloy)
bx('Data_CableTrayLip', dt, (DX1 - DX0 - 0.3, 0.012, 0.06), P(0, DY - 0.13, DT - 0.13), alloy)
for k, c in enumerate((0.012, 0.009, 0.01)):
    sweep(f'Data_TrayCable_{k}', dt, [P(DX0 + 0.3, DY - 0.2 + k * 0.025, DT - 0.15), P(0, DY - 0.21 + k * 0.025, DT - 0.148), P(DX1 - 0.3, DY - 0.2 + k * 0.025, DT - 0.15)], c, black if k else rubber, segs=4, per_m=2)

# the workstations: a CRT (its glass faces -Y: turned to the seat behind it), keyboard, mouse, a tower under the desk
def crt(name, x, y, art, a=math.pi):
    put('crtmon', dt, P(x, y, DT), a, name=name)
    sp = P(x + 0.17 * math.sin(a), y - 0.17 * math.cos(a), DT + 0.09)
    cd(f'BUSY_data_{name}_Screen', dt, 0.3, 0.23, sp, glow(f'Da_{name}', art), rotz=a, tilt=-0.08)
    cd(f'IDLE_data_{name}_Screen', dt, 0.3, 0.23, sp, screen_off, rotz=a, tilt=-0.08)
for i, (x, art, chair, cz) in enumerate(((-2.2, 'screen_tele', 'chair_g', 0.25), (2.0, 'screen_timing', 'chair_k', -0.2))):
    crt(f'CRT{i}', x - 0.05, DY - 0.1, art, math.pi - 0.08 * (1 if i else -1))
    put('kbd', dt, P(x - 0.05, DY + 0.18, DT), 0.0, name=f'Data_Kbd_{i}'); put('mouse', dt, P(x + 0.25, DY + 0.18, DT), 0.2, name=f'Data_Mouse_{i}')
    put('tower', dt, P(x + 0.5, DY - 0.05, 0.008), 0.0, name=f'Data_Tower_{i}')
    put(chair, dt, P(x, -2.15), cz, name=f'Data_Chair_{i}')
    put('lamp', dt, P(x - 0.62, DY - 0.18, DT), 0.5 * (1 if i else -1), name=f'Data_Lamp_{i}')
    put('mug', dt, P(x + 0.48, DY + 0.12, DT), i * 2.0, name=f'Data_Mug_{i}')
# the middle one: the Win95 box (its own screen), the laptop with the car's download loom
put('win95', dt, P(-0.35, DY - 0.08, DT), math.pi, name='Data_Win95')
LX, LY = 0.45, DY + 0.06
bbox('Data_LaptopBase', dt, (0.32, 0.23, 0.022), P(LX, LY, DT + 0.011), black, bev=0.004)
mk(box('Data_LaptopLid', dt, (0.32, 0.012, 0.22), P(LX, LY - 0.115 - 0.11 * math.sin(0.3), DT + 0.022 + 0.11 * math.cos(0.3)), black, rot=(0.3, 0, 0)))
lid_y = LY - 0.115 + 0.008; lid_z = DT + 0.024
cd('BUSY_data_LaptopScreen', dt, 0.28, 0.18, P(LX, lid_y + 0.0, lid_z + 0.015), glow('Da_Laptop', 'data_laptop', 1.3), rotz=math.pi, tilt=-0.3)
cd('IDLE_data_LaptopScreen', dt, 0.28, 0.18, P(LX, lid_y + 0.0, lid_z + 0.015), screen_off, rotz=math.pi, tilt=-0.3)
sweep('Data_Loom', dt, [P(LX + 0.16, LY + 0.02, DT + 0.01), P(LX + 0.3, LY + 0.12, DT + 0.01), P(LX + 0.38, DY + 0.38, DT - 0.05), P(LX + 0.4, DY + 0.45, 0.3), P(LX + 0.5, -2.45, 0.02), P(LX + 0.85, -2.3, 0.02)], 0.009, black, segs=5)
for k in range(3):   # (the rest of the loom, coiled on the carpet, its connector)
    r = 0.16 - k * 0.012; c = P(LX + 1.0, -2.25, 0.018 + k * 0.016)
    sweep(f'Data_LoomCoil_{k}', dt, [c + Vector((math.cos(a) * r, math.sin(a) * r * 0.85, 0)) for a in [j / 8 * math.tau for j in range(8)]], 0.009, black, segs=5, per_m=6, closed=True, caps=False)
bbox('Data_LoomPlug', dt, (0.06, 0.04, 0.03), P(LX + 1.12, -2.08, 0.025), alloy, bev=0.006)
put('floppy', dt, P(-0.85, DY + 0.18, DT), 0.3); put('floppy', dt, P(-0.82, DY + 0.2, DT + 0.003), 0.6, name='floppy.001')
cd('Data_SetupSheet', dt, 0.21, 0.29, P(1.15, DY + 0.05, DT + 0.002), print_('Da_Setup', 'data_setup', 0.2), rotz=0.15, tilt=-D90)
cd('Data_SetupSheet2', dt, 0.21, 0.29, P(-1.6, DY + 0.08, DT + 0.002), print_('Da_Setup2', 'data_setup', 0.3), rotz=-0.3, tilt=-D90)
put('papers', dt, P(-1.15, DY + 0.0, DT), 0.4, name='Data_Papers'); put('phone', dt, P(2.75, DY + 0.05, DT), 0.3)
put('ashtray', dt, P(-2.9, DY + 0.15, DT), 0.0); put('can', dt, P(2.65, DY + 0.25, DT), 0.0); put('can_crushed', dt, P(-2.6, -2.35, 0.008), 1.0)
for k in range(5): put('binder' if k % 2 else 'binder2', dt, P(-1.45 + k * 0.09, DY - 0.24, DT), 0.0, name=f'Data_Binder_{k}')
# the pit radios in their chargers at the desk's end, the label strip, a green light on each
RX = 3.12
bbox('Data_ChargerBase', dt, (0.5, 0.14, 0.05), P(RX, DY - 0.08, DT + 0.025), black, bev=0.008)
cd('Data_RadioLabel', dt, 0.36, 0.034, P(RX, DY - 0.152, DT + 0.008), print_('Da_Radios', 'data_radios', 0.15))
for k in range(6):
    x = RX - 0.2 + k * 0.08
    if k != 3:
        bbox(f'Data_Radio_{k}', dt, (0.05, 0.034, 0.15), P(x, DY - 0.07, DT + 0.12), black, bev=0.006)
        rd(f'Data_RadioAerial_{k}', dt, P(x + 0.012, DY - 0.07, DT + 0.195), P(x + 0.012, DY - 0.07, DT + 0.3), 0.006, rubber, verts=5)
    bx(f'Data_ChargerLed_{k}', dt, (0.012, 0.004, 0.008), P(x, DY - 0.152, DT + 0.042), led_g if k != 3 else led_r)
put('coffee_cup', dt, P(RX - 0.1, DY + 0.2, DT), 0.0)

# ================= along the back wall =================
# the network cabinet in the corner: rack front, its door frame, a cable loom down from the tray
NX = -4.05
bbox('Data_NetCab', dt, (0.55, 0.55, 1.25), P(NX, -0.34, 0.625), frame, bev=0.012)
cd('Data_NetFront', dt, 0.46, 1.08, P(NX, -0.618, 0.09), glow('Da_RackFront', 'rack_front', 0.9))
bx('Data_NetDoorFrame', dt, (0.5, 0.012, 0.03), P(NX, -0.62, 1.2), steel)
for k in range(2): bx(f'Data_NetVent_{k}', dt, (0.4, 0.4, 0.015), P(NX, -0.34, 1.255 + 0.001 * k), steel)
# cables from it, across the carpet to the desks, taped down
for k, (yo, c) in enumerate(((0.0, 0.009), (0.05, 0.007))):
    sweep(f'Data_FloorCable_{k}', dt, [P(NX + 0.2, -0.62, 0.3), P(NX + 0.25, -0.68, 0.012), P(-3.2, -1.3 + yo, 0.012), P(-2.4, -2.0 + yo, 0.012), P(-1.4, -2.45 + yo, 0.012), P(-1.2, DY + 0.36, 0.012), P(-1.2, DY + 0.25, 0.4), P(-1.2, DY - 0.2, DT - 0.15)], c, black if k else rubber, segs=4, per_m=5)
for k, (x, y, a) in enumerate(((-3.55, -1.15, -0.8), (-2.85, -1.75, -0.7), (-2.0, -2.25, -0.55))):
    bx(f'Data_Tape_{k}', dt, (0.08, 0.22, 0.003), P(x, y, 0.0105), hazard, rot=(0, 0, a))
# the dot-matrix printer on its steel cart, fanfold up through it and out over the top, folding onto the carpet
PX, PT = -1.6, 0.74
for x in (PX - 0.27, PX + 0.27):
    for y in (-0.2, -0.6):
        bx(f'Data_CartLeg_{x:+.2f}_{y:+.2f}', dt, (0.03, 0.03, PT - 0.05), P(x, y, (PT - 0.05) / 2 + 0.05), frame)
        cy(f'Data_CartWheel_{x:+.2f}_{y:+.2f}', dt, 0.03, 0.025, P(x, y, 0.03), rubber, rot=(0, D90, 0), verts=8)
bbox('Data_CartTop', dt, (0.6, 0.46, 0.025), P(PX, -0.4, PT - 0.0125), frame, bev=0.005)
bbox('Data_CartShelf', dt, (0.6, 0.46, 0.02), P(PX, -0.4, 0.2), frame, bev=0.005)
bbox('Data_Fanfold', dt, (0.4, 0.3, 0.14), P(PX, -0.4, 0.28), beige, bev=0.004)
bbox('Data_Printer', dt, (0.55, 0.32, 0.15), P(PX, -0.38, PT + 0.075), beige, bev=0.02)
bbox('Data_PrinterLid', dt, (0.46, 0.16, 0.03), P(PX, -0.33, PT + 0.16), grey, bev=0.01)
for s in (-1, 1): lathe(f'Data_PlatenKnob_{s:+d}', dt, [(0, 0), (0.03, 0), (0.03, 0.025), (0, 0.03)], P(PX + s * 0.275, -0.42, PT + 0.1), black, segs=8, rot=(0, s * D90, 0))
bx('Data_PrinterLed', dt, (0.015, 0.004, 0.008), P(PX + 0.2, -0.542, PT + 0.12), led_g)
cd('Data_FanfoldFeed', dt, 0.36, 0.42, P(PX, -0.165, 0.35), paper, rotz=math.pi)   # (up the back from the box into the printer)
cd('Data_PrintoutUp', dt, 0.36, 0.42, P(PX, -0.47, PT + 0.17), paper, tilt=-0.55)
for k in range(6):   # (folded on the carpet in front, zigzag)
    cd(f'Data_PrintoutFold_{k}', dt, 0.36, 0.2, P(PX, -0.8 - k * 0.028, 0.012 + k * 0.012), paper, tilt=-1.42 + (k % 2) * 0.18)
put('cab_low', dt, P(-2.75, -0.32), math.pi, name='Data_Cab'); put('papers', dt, P(-2.75, -0.32, 0.7), 0.2, name='Data_CabPapers')
# the whiteboard: an aluminium frame, the board, its tray with markers and the eraser
WX = 0.6
bbox('Data_BoardFrame', dt, (1.92, 0.035, 1.0), P(WX, -0.02, 1.4), alloy, bev=0.008)
cd('Data_Whiteboard', dt, 1.84, 0.92, P(WX, -0.042, 0.94), art_mat('Da_Whiteboard', A('whiteboard'), dirt=0.15))
bbox('Data_BoardTray', dt, (1.5, 0.08, 0.025), P(WX, -0.075, 0.885), alloy, bev=0.006)
for k, m in enumerate(markers): cy(f'Data_Marker_{k}', dt, 0.009, 0.13, P(WX - 0.5 + k * 0.06, -0.08, 0.907), m, rot=(0, D90, 0), verts=6)
bbox('Data_Eraser', dt, (0.13, 0.05, 0.035), P(WX + 0.45, -0.08, 0.915), black, bev=0.008)
# the cork board: photos, the timing sheets, pins
KX = 2.4
bbox('Data_CorkFrame', dt, (1.12, 0.03, 0.82), P(KX, -0.018, 1.35), wood, bev=0.008)
bx('Data_Cork', dt, (1.04, 0.012, 0.74), P(KX, -0.036, 1.35), cork)
for k, (x, z, w, h, png, a) in enumerate(((-0.36, 1.48, 0.12, 0.14, 'data_photo_car', 0.06), (-0.2, 1.5, 0.12, 0.14, 'data_photo_team', -0.05), (-0.3, 1.18, 0.12, 0.14, 'data_photo_trophy', 0.03),
                                          (0.08, 1.12, 0.21, 0.29, 'data_setup', -0.03), (0.33, 1.08, 0.2, 0.45, 'printout', 0.04), (-0.05, 1.47, 0.22, 0.17, 'screen_timing', 0.0))):
    o = cd(f'Data_Pinned_{k}', dt, w, h, P(KX + x, -0.044, z - h / 2), print_(f'Da_Pinned_{k}', png, 0.25), rotz=0.0)
    o.rotation_euler.y = a
    lathe(f'Data_Pin_{k}', dt, [(0, 0), (0.008, 0), (0.008, 0.01), (0, 0.012)], P(KX + x, -0.046, z - 0.02), pinred if k % 2 else pinblue, segs=6, rot=(D90, 0, 0))
# the coffee corner: a low cupboard, the machine, mugs, the donuts
CX = 3.95
bbox('Data_CoffeeCab', dt, (0.8, 0.5, 0.85), P(CX, -0.3, 0.425), grey, bev=0.012)
bbox('Data_CoffeeTop', dt, (0.84, 0.54, 0.03), P(CX, -0.3, 0.865), laminate, bev=0.006)
for k, x in enumerate((-0.2, 0.2)): bx(f'Data_CoffeeDoor_{k}', dt, (0.36, 0.01, 0.7), P(CX + x, -0.556, 0.42), frame)
CT = 0.88
# a filter coffee maker: its base and warming plate, the water tower behind, the filter head, a glass jug half full
MX = CX - 0.2
bbox('Data_CoffeeBase', dt, (0.2, 0.26, 0.04), P(MX, -0.3, CT + 0.02), black, bev=0.008)
bbox('Data_CoffeeTower', dt, (0.2, 0.09, 0.32), P(MX, -0.2, CT + 0.16), black, bev=0.012)
bbox('Data_CoffeeHead', dt, (0.2, 0.17, 0.07), P(MX, -0.3, CT + 0.285), black, bev=0.012)
cy('Data_CoffeePlate', dt, 0.07, 0.008, P(MX, -0.34, CT + 0.044), steel, verts=10)
lathe('Data_CoffeeJug', dt, [(0.0, 0.0), (0.07, 0.0), (0.075, 0.03), (0.07, 0.11), (0.05, 0.15), (0.052, 0.17)], P(MX, -0.34, CT + 0.048), glass, segs=10, cap1=False)
lathe('Data_CoffeeIn', dt, [(0.0, 0.0), (0.068, 0.0), (0.072, 0.03), (0.07, 0.07), (0.0, 0.07)], P(MX, -0.34, CT + 0.05), coffee, segs=10)
bx('Data_CoffeeHandle', dt, (0.02, 0.06, 0.1), P(MX + 0.085, -0.36, CT + 0.12), black)
bx('Data_CoffeeLed', dt, (0.012, 0.004, 0.008), P(MX + 0.06, -0.431, CT + 0.022), led_r)
for k in range(3): put('mug', dt, P(CX + 0.12 + k * 0.1, -0.42 + (k % 2) * 0.06, CT), k * 1.3, name=f'Data_CoffeeMug_{k}')
lathe('Data_Sugar', dt, [(0, 0), (0.045, 0), (0.045, 0.1), (0.035, 0.12), (0, 0.12)], P(CX + 0.3, -0.2, CT), glass, segs=10)
bbox('Data_DonutBox', dt, (0.3, 0.28, 0.07), P(CX + 0.18, -0.25, CT + 0.035), beige, bev=0.006)
cd('Data_DonutLid', dt, 0.29, 0.27, P(CX + 0.18, -0.38, CT + 0.071), print_('Da_Donuts', 'data_donuts', 0.25), tilt=-D90)

# ================= lights: two strip lights on chains over the desks =================
for k, x in enumerate((-1.6, 1.6)):
    bbox(f'Data_StripLight_{k}', dt, (1.3, 0.18, 0.06), P(x, -2.6, 2.02), grey, bev=0.01)
    bx(f'Data_StripDiffuser_{k}', dt, (1.2, 0.12, 0.01), P(x, -2.6, 1.99), tube)
    for s in (-1, 1): rd(f'Data_StripChain_{k}_{s:+d}', dt, P(x + s * 0.5, -2.6, 2.05), P(x + s * 0.5, -2.6, 2.3), 0.005, steel, verts=4)
bulb('Light_DataDesks', dt, P(-0.6, -2.6, 1.85), 120, (1.0, 0.92, 0.82))
bulb('BUSY_data_Light_Screens', dt, P(0.2, -2.5, 1.0), 45, (0.6, 0.85, 1.0))

# ================= where people stand (the old one's hooks) =================
empty('STAND_any', dt, P(WX, -0.75), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='point', role='any')            # (at the whiteboard)
empty('STAND_any.001', dt, P(PX, -1.25), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='any')      # (reading the printout)
empty('STAND_any.002', dt, P(CX, -0.95), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='drink', role='any')          # (the coffee)
for i, x in enumerate((-2.2, 2.0)): empty(f'STAND_data.{i:03d}', dt, P(x, -2.15), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='sit_desk', role='data')
empty('STAND_manager', dt, P(0.9, -1.45), rotz=math.pi + 0.5, kind='SINGLE_ARROW', size=0.5, clip='talk_2', role='manager')

if '--noao' not in args:
    print('AO baked on', bake_ao(dt), 'objects')
if not LIVE or '--export' in args: export_station(dt, OUTGLB)
if '--blend' in args: bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'garage', 'data-start.blend'))
print('DATA objects', len(dt.all_objects), 'triangles', tris(dt))
