# tools/workshop/setup.py: run inside tools/garage-workshop.py (exec'd with its globals). Step 3: bay 1's setup pad.
# A real team's patch of floor where the car's set up: levelled to half a millimetre, a stainless trim round it, brass
# datum buttons, the stencil at its nose end. Four flush corner-weight scales (turn plates on the fronts) sit under the
# car's wheels: each is a SCALEPAD_<corner> group the game moves under that car's own wheels (js/pitgarage.js padTick:
# wheelbases differ), the cables run from them to the readout on its stand (SCALE_READOUT: where they plug in, drawn by
# the game). The alignment trolley behind the car: two laser heads and their toe plates, the camber gauge, a ride
# height gauge, the string-line reels, the setup sheet on its clipboard. Objects Su_..., art ws_su_* (art_setup.py).
import subprocess

ART = os.path.join(SRC, 'workshop_art'); A = lambda n: os.path.join(ART, n + '.png')
if not all(os.path.exists(A(n)) for n in ('ws_su_readout', 'ws_su_stencil', 'ws_su_turnplate', 'ws_su_sheet', 'ws_su_scale_lf', 'ws_su_laser')):
    subprocess.run(['python3', os.path.join(WS, 'art_setup.py')], check=True)
for o in [o for o in B.objects if o.name.startswith('SetupPad_Plate')]: bpy.data.objects.remove(o, do_unlink=True)   # (the blockout's)

SU = collection('shell_workshop setup pad', shell)
padc = np.ones((64, 64, 3), np.float32) * np.array([0.5, 0.52, 0.55], np.float32)
padc *= (1 + (np.random.default_rng(9).random((64, 64)) > 0.95)[..., None] * 0.06)
padc = grime(padc, (fbm(64, 64, (32, 8), wrap=True) - 0.5) * 0.1)
pad_floor = mat_img('Su_PadFloor', save('su_pad_floor', padc), 0.45)
stainless = plain_mat('Su_Stainless', (0.72, 0.74, 0.76), dirt=0.05, rough=0.3)
brass = plain_mat('Su_Brass', (0.72, 0.56, 0.22), dirt=0.08, rough=0.35)
yellowp = plain_mat('Su_Yellow', (0.9, 0.7, 0.08), dirt=0.1)
blackp = plain_mat('Su_Black', (0.05, 0.05, 0.06), dirt=0.05)
greyp = plain_mat('Su_Grey', (0.45, 0.47, 0.5), dirt=0.08)
redp = plain_mat('Su_Red', (0.72, 0.1, 0.07), dirt=0.08)
alum = grimy_tile('Su_Alu', 'galvanized_metal.png', dirt=0.06)
tread = grimy_tile('Su_Tread', 'metal_plate_03.png', dirt=0.08, tint=(0.62, 0.64, 0.66))
rubberb = plain_mat('Su_Rubber', (0.08, 0.08, 0.09), dirt=0.03)
def art(name, png, dirt=0.1, emit=None): return art_mat(name, A(png), dirt=dirt, emit=emit)

# ---------------- the pad: 3.6 x 7 m round bay 1, flush with the floor ----------------
PX0, PX1, PY0, PY1 = BAY1.x - 1.8, BAY1.x + 1.8, BAY1.y - 3.5, BAY1.y + 3.5
o = quad('Su_Pad', SU, [(PX0, PY0, 0.0015), (PX1, PY0, 0.0015), (PX1, PY1, 0.0015), (PX0, PY1, 0.0015)], pad_floor, (0, 0, 1),
         [(0, 0), ((PX1 - PX0) / 1.6, 0), ((PX1 - PX0) / 1.6, (PY1 - PY0) / 1.6), (0, (PY1 - PY0) / 1.6)])
for k, (a, b) in enumerate((((PX0, PY0), (PX1, PY0)), ((PX1, PY0), (PX1, PY1)), ((PX1, PY1), (PX0, PY1)), ((PX0, PY1), (PX0, PY0)))):   # (the trim: a stainless angle)
    beam(f'Su_Trim_{k}', SU, (a[0], a[1], 0.002), (b[0], b[1], 0.002), 0.04, 0.004, stainless)
for k, (x, y) in enumerate(((PX0 + 0.15, PY0 + 0.15), (PX1 - 0.15, PY0 + 0.15), (PX0 + 0.15, PY1 - 0.15), (PX1 - 0.15, PY1 - 0.15))):   # (datum buttons)
    cy(f'Su_Datum_{k}', SU, 0.025, 0.004, (x, y, 0.003), brass, verts=10)
    cy(f'Su_Datum_{k}_Dot', SU, 0.006, 0.002, (x, y, 0.0055), blackp, verts=6)
cd('Su_Stencil', SU, 1.6, 0.4, (BAY1.x, PY0 + 0.1, 0.0025), art('Su_Stencil', 'ws_su_stencil', 0.25), tilt=-D90)   # (at the nose end, read from the door)

# ---------------- the scales: SCALEPAD_<corner> groups (the game moves each under its wheel) ----------------
def group_under(root, objs):
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = root; o.matrix_parent_inverse = root.matrix_world.inverted(); o.matrix_world = mw
TRACK, WB = 0.8, 1.42   # (where they wait with no car: a mid-sized car's wheels)
for c, sx, sy in (('LF', 1, -1), ('RF', -1, -1), ('LR', 1, 1), ('RR', -1, 1)):
    x, y = BAY1.x + sx * TRACK, BAY1.y + sy * WB
    root = empty('SCALEPAD_' + c, SU, (x, y, 0.0), kind='CUBE', size=0.25)
    parts = []
    # the recess's frame (yellow steel), the platform (aluminium tread) a hair below the floor, its four corner bolts
    for k, (w, d, dx, dy) in enumerate(((0.6, 0.04, 0, -0.28), (0.6, 0.04, 0, 0.28), (0.04, 0.52, -0.28, 0), (0.04, 0.52, 0.28, 0))):
        parts.append(bx(f'Su_Scale{c}_Frame{k}', SU, (w, d, 0.004), (x + dx, y + dy, 0.002), yellowp))
    parts.append(bx(f'Su_Scale{c}_Plate', SU, (0.52, 0.52, 0.004), (x, y, 0.0015), tread))
    for k, (dx, dy) in enumerate(((-0.23, -0.23), (0.23, -0.23), (-0.23, 0.23), (0.23, 0.23))):
        parts.append(cy(f'Su_Scale{c}_Bolt{k}', SU, 0.012, 0.003, (x + dx, y + dy, 0.004), stainless, verts=6))
    # the label on the outside edge, the cable's socket beside it
    parts.append(cd(f'Su_Scale{c}_Label', SU, 0.2, 0.075, (x + sx * 0.2, y - 0.16 * sy, 0.0045), art(f'Su_Label{c}', 'ws_su_scale_' + c.lower(), 0.1), rotz=(D90 if sx > 0 else -D90), tilt=-D90))
    parts.append(bbox(f'Su_Scale{c}_Socket', SU, (0.05, 0.07, 0.025), (x + sx * 0.33, y + 0.12 * sy, 0.0125), blackp, bev=0.004))
    if sy < 0:   # (the fronts: a turn plate on the scale, its degree ring and pointer, so the wheels can be steered)
        parts.append(lathe(f'Su_Scale{c}_Turn', SU, [(0.0, 0.0), (0.2, 0.0), (0.205, 0.004), (0.2, 0.008), (0.0, 0.008)], (x, y, 0.0015), stainless, segs=16))
        parts.append(cd(f'Su_Scale{c}_TurnRing', SU, 0.38, 0.38, (x, y - 0.19, 0.0097), art(f'Su_Turn{c}', 'ws_su_turnplate', 0.08), tilt=-D90))
        parts.append(bx(f'Su_Scale{c}_Pointer', SU, (0.012, 0.06, 0.004), (x, y - 0.235, 0.008), redp))
    group_under(root, parts)

# ---------------- the readout, on its wheeled stand by the tire stacks (its screen to where the engineer stands) ----------------
RX, RY = BAY1.x - 2.05, BAY1.y - 2.6
lathe('Su_Stand_Base', SU, [(0.0, 0.03), (0.26, 0.03), (0.26, 0.05), (0.04, 0.07), (0.0, 0.07)], (RX, RY, 0), greyp, segs=5)   # (a five-star base)
for k in range(5):
    a = k * math.tau / 5; d = Vector((math.cos(a), math.sin(a), 0))
    cy(f'Su_Stand_Castor{k}', SU, 0.028, 0.02, Vector((RX, RY, 0.028)) + d * 0.24, rubberb, rot=(D90, 0, a), verts=8)
    bx(f'Su_Stand_Fork{k}', SU, (0.02, 0.03, 0.03), Vector((RX, RY, 0.05)) + d * 0.24, greyp)
cy('Su_Stand_Pole', SU, 0.022, 0.95, (RX, RY, 0.07 + 0.475), alum, verts=10)
bx('Su_Stand_Hook', SU, (0.1, 0.02, 0.02), (RX + 0.06, RY, 0.75), greyp)
lathe('Su_Stand_Coil', SU, [(0.07, 0.0), (0.09, 0.02), (0.07, 0.04), (0.09, 0.06), (0.07, 0.08)], (RX + 0.11, RY, 0.62), blackp, segs=8, rot=(D90, 0, 0), cap0=False, cap1=False)   # (a spare cable, coiled on the hook)
tilt = 0.45   # (the box tipped back toward who's reading it, its screen to -X)
bbox('Su_Readout_Box', SU, (0.13, 0.38, 0.27), (RX, RY, 1.13), greyp, rot=(0, tilt, 0), bev=0.012)
bx('Su_Readout_Mount', SU, (0.06, 0.08, 0.1), (RX + 0.02, RY, 1.03), greyp)
n = Vector((-math.cos(tilt), 0, math.sin(tilt)))   # (the face's outward normal)
cd('Su_Readout_Screen', SU, 0.3, 0.2, Vector((RX, RY, 1.13)) + n * 0.066 + Vector((-math.sin(tilt), 0, -math.cos(tilt))) * 0.09, art('Su_Screen', 'ws_su_readout', 0.02, emit=1.1), rotz=-D90, tilt=-tilt)
for k, col in enumerate((redp, greyp, greyp, plain_mat('Su_Green', (0.1, 0.6, 0.2), dirt=0.05))):   # (the buttons under the screen)
    p = Vector((RX, RY - 0.12 + k * 0.08, 1.13)) + n * 0.068 + Vector((-math.sin(tilt), 0, -math.cos(tilt))) * -0.105
    cy(f'Su_Readout_Btn{k}', SU, 0.013, 0.01, p, col, rot=(0, -D90 + tilt, 0), verts=8)
rd('Su_Readout_Handle', SU, (RX + 0.04, RY - 0.17, 1.3), (RX + 0.04, RY + 0.17, 1.3), 0.01, blackp, verts=6)
for s in (-1, 1): rd(f'Su_Readout_HandleArm{s}', SU, (RX + 0.04, RY + s * 0.17, 1.3), (RX + 0.05, RY + s * 0.17, 1.24), 0.009, blackp, verts=6)
empty('SCALE_READOUT', SU, (RX + 0.03, RY, 0.96), kind='SPHERE', size=0.05)   # (the four cables plug in under the box)
for k in range(4): cy(f'Su_Readout_Plug{k}', SU, 0.011, 0.04, (RX + 0.03, RY - 0.06 + k * 0.04, 0.985), blackp, verts=6)

# (the stand turned to face the doors, where you see it from the floor: built screen to -X, turned a quarter round)
bpy.context.view_layer.update()
Mturn = Matrix.Translation(Vector((RX, RY, 0))) @ Matrix.Rotation(D90, 4, 'Z') @ Matrix.Translation(Vector((-RX, -RY, 0)))
for o in [o for o in SU.objects if o.name.startswith(('Su_Stand', 'Su_Readout', 'SCALE_READOUT'))]: o.matrix_world = Mturn @ o.matrix_world

# ---------------- the alignment trolley, behind the car ----------------
TX, TY = BAY1.x - 0.2, BAY1.y + 4.25
W2, D2 = 0.9, 0.5
for sx in (-1, 1):
    for sy in (-1, 1):
        bx(f'Su_Trolley_Leg{sx}{sy}', SU, (0.03, 0.03, 0.82), (TX + sx * (W2 / 2 - 0.02), TY + sy * (D2 / 2 - 0.02), 0.1 + 0.41), greyp)
        cy(f'Su_Trolley_Wheel{sx}{sy}', SU, 0.04, 0.025, (TX + sx * (W2 / 2 - 0.04), TY + sy * (D2 / 2 - 0.02), 0.04), rubberb, rot=(0, D90, 0), verts=8)
        bx(f'Su_Trolley_Fork{sx}{sy}', SU, (0.04, 0.04, 0.05), (TX + sx * (W2 / 2 - 0.04), TY + sy * (D2 / 2 - 0.02), 0.09), greyp)
for z, nm in ((0.15, 'Low'), (0.9, 'Top')):
    bbox(f'Su_Trolley_Tray{nm}', SU, (W2, D2, 0.025), (TX, TY, z), greyp, bev=0.006)
    for s in (-1, 1): bx(f'Su_Trolley_Lip{nm}{s}', SU, (W2, 0.012, 0.04), (TX, TY + s * (D2 / 2 - 0.006), z + 0.03), greyp)
for s in (-1, 1): rd(f'Su_Trolley_HandlePost{s}', SU, (TX + s * (W2 / 2 - 0.02), TY + D2 / 2 - 0.02, 0.92), (TX + s * (W2 / 2 - 0.02), TY + D2 / 2 + 0.06, 1.02), 0.012, greyp, verts=6)
rd('Su_Trolley_Handle', SU, (TX - W2 / 2 + 0.02, TY + D2 / 2 + 0.06, 1.02), (TX + W2 / 2 - 0.02, TY + D2 / 2 + 0.06, 1.02), 0.014, rubberb, verts=6)
TOP = 0.9 + 0.0125
# two laser heads: a body, a lens with a red window, the warning label, a clamp arm
for k, dx in enumerate((-0.28, -0.06)):
    bbox(f'Su_Laser{k}_Body', SU, (0.14, 0.09, 0.08), (TX + dx, TY - 0.08, TOP + 0.04), plain_mat('Su_LaserBody', (0.85, 0.85, 0.82), dirt=0.06), bev=0.01)
    lathe(f'Su_Laser{k}_Lens', SU, [(0.0, 0.0), (0.025, 0.0), (0.025, 0.03), (0.02, 0.035), (0.0, 0.035)], (TX + dx, TY - 0.125, TOP + 0.045), blackp, segs=10, rot=(D90, 0, 0))
    cy(f'Su_Laser{k}_Window', SU, 0.016, 0.003, (TX + dx, TY - 0.161, TOP + 0.045), plain_mat('Su_LaserRed', (0.9, 0.08, 0.05), dirt=0.0), rot=(D90, 0, 0), verts=10)
    cd(f'Su_Laser{k}_Label', SU, 0.09, 0.022, (TX + dx, TY - 0.126, TOP + 0.064), art('Su_LaserLabel', 'ws_su_laser', 0.05))
    bx(f'Su_Laser{k}_Clamp', SU, (0.03, 0.03, 0.12), (TX + dx + 0.075, TY - 0.08, TOP + 0.06), alum)
# the toe plates: two big flat aluminium plates leaning against the handle side
for k in range(2):
    bbox(f'Su_ToePlate{k}', SU, (0.6, 0.012, 0.36), (TX + 0.08 + k * 0.02, TY + D2 / 2 - 0.03 - k * 0.016, TOP + 0.18), alum, rot=(-0.12, 0, 0), bev=0.004)
    bx(f'Su_ToePlate{k}_Scale', SU, (0.5, 0.002, 0.02), (TX + 0.08 + k * 0.02, TY + D2 / 2 - 0.038 - k * 0.016, TOP + 0.3), blackp, rot=(-0.12, 0, 0))
# the camber gauge: an aluminium bar with three feet, a bubble and a little LCD
bbox('Su_Camber_Bar', SU, (0.04, 0.42, 0.05), (TX + 0.33, TY - 0.05, TOP + 0.03), alum, rot=(0, 0, 0.1), bev=0.005)
for k in (-1, 0, 1): cy(f'Su_Camber_Foot{k}', SU, 0.012, 0.025, (TX + 0.33 - k * 0.02, TY - 0.05 + k * 0.18, TOP + 0.012), blackp, verts=6)
bx('Su_Camber_LCD', SU, (0.042, 0.08, 0.025), (TX + 0.33, TY - 0.05, TOP + 0.065), plain_mat('Su_LCD', (0.55, 0.65, 0.45), dirt=0.02))
cy('Su_Camber_Vial', SU, 0.008, 0.06, (TX + 0.33, TY + 0.06, TOP + 0.06), plain_mat('Su_Vial', (0.6, 0.8, 0.3), dirt=0.0), rot=(D90, 0, 0), verts=6)
# the ride height gauge: a stepped aluminium block; the string-line reels on the lower tray; the clipboard
bbox('Su_RideGauge', SU, (0.1, 0.08, 0.06), (TX + 0.1, TY - 0.18, TOP + 0.03), alum, bev=0.004)
bbox('Su_RideGauge_Step', SU, (0.1, 0.04, 0.03), (TX + 0.1, TY - 0.24, TOP + 0.015), alum, bev=0.003)
for k in range(2):
    lathe(f'Su_Reel{k}', SU, [(0.0, 0.0), (0.06, 0.0), (0.06, 0.008), (0.03, 0.01), (0.03, 0.05), (0.06, 0.052), (0.06, 0.06), (0.0, 0.06)], (TX - 0.25 + k * 0.16, TY, 0.15 + 0.013), yellowp, segs=12)
    cy(f'Su_Reel{k}_String', SU, 0.034, 0.038, (TX - 0.25 + k * 0.16, TY, 0.163 + 0.03), plain_mat('Su_String', (0.9, 0.9, 0.85), dirt=0.02), verts=12)
bx('Su_Toolcase', SU, (0.34, 0.24, 0.12), (TX + 0.2, TY + 0.05, 0.15 + 0.073), plain_mat('Su_Case', (0.12, 0.12, 0.13), dirt=0.08))
bbox('Su_Clipboard', SU, (0.23, 0.31, 0.008), (TX + 0.02, TY + 0.1, TOP + 0.004), plain_mat('Su_Board', (0.45, 0.32, 0.18), dirt=0.08), rot=(0, 0, 0.15), bev=0.002)
cd('Su_Sheet', SU, 0.2, 0.267, (TX + 0.02 - 0.0, TY + 0.1 - 0.133, TOP + 0.0095), art('Su_Sheet', 'ws_su_sheet', 0.05), tilt=-D90)
bx('Su_Clip', SU, (0.08, 0.03, 0.012), (TX + 0.0, TY + 0.235, TOP + 0.014), stainless)
rd('Su_Pen', SU, (TX + 0.16, TY + 0.02, TOP + 0.012), (TX + 0.17, TY + 0.15, TOP + 0.012), 0.005, plain_mat('Su_Pen', (0.1, 0.2, 0.7), dirt=0.0), verts=5)

# where they work: reading the scales, at the trolley
empty('STAND_engineer.020', hooks, (RX, RY - 0.55, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='lean', role='engineer')   # (in front of the screen, facing it)
empty('STAND_mechanic.020', hooks, (TX, TY - 0.6, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='lean', role='mechanic')
