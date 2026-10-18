# tools/workshop/trophies.py: run inside tools/garage-workshop.py (exec'd with its globals). Step 4: the trophy wall in
# reception, against the right wall between the frame's columns. A lit cabinet: a cupboard below, a display case with
# two glass shelves behind three sliding glass doors, a light strip in its canopy, HALL OF FAME over it. The game fills
# it (js/pitgarage.js setMemories, wcareer.js memoriesOf().shelf): TROPHY_00..15 are its places, the bottom shelf's four
# for the big ones (custom prop size: big); TROPHY_NOTE is Danny's note on the glass, shown till there's a trophy.
# PHOTO_00..03: framed photos of past seasons either side (the plane PHOTO_nn gets the picture; PHOTO_nn_... are its
# frame and mount, hidden with it when there's no season for it). Objects Tr_..., art ws_su_* (art_setup.py).
import subprocess

ART = os.path.join(SRC, 'workshop_art'); A = lambda n: os.path.join(ART, n + '.png')
if not all(os.path.exists(A(n)) for n in ('ws_su_halloffame', 'ws_su_reserved')):
    subprocess.run(['python3', os.path.join(WS, 'art_setup.py')], check=True)
for o in [o for o in dress.objects if o.name.startswith('Trophy_Cabinet')]: bpy.data.objects.remove(o, do_unlink=True)   # (the blockout's)

TR = collection('shell_workshop trophies', shell)
lam = plain_mat('Tr_Laminate', (0.07, 0.07, 0.08), dirt=0.05, rough=0.4)
velvet = plain_mat('Tr_Velvet', (0.06, 0.08, 0.16), dirt=0.02, fleck=0.06, rough=0.95)   # (the case's back: deep blue)
chrome = plain_mat('Tr_Chrome', (0.75, 0.77, 0.8), dirt=0.03, rough=0.2)
lampm = mat_img('Tr_Strip', None, 0.4, emit=((1.0, 0.95, 0.85), 5.0))
case_glass = solid_mat('Tr_Glass', (0.2, 0.24, 0.27), 0.05)   # (dark and nearly clear: pale glass went milky in the game and hid what's inside)
case_glass.surface_render_method = 'BLENDED'; case_glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.06
def art(name, png, dirt=0.06, emit=None): return art_mat(name, A(png), dirt=dirt, emit=emit)

# the cabinet: x from the wall (12) out 0.52, y -7.6 to -4.4
CX1, CX0, CY0, CY1 = X1 - 0.02, X1 - 0.54, -7.6, -4.4
CYM, W, D = (CY0 + CY1) / 2, CY1 - CY0, CX1 - CX0
XM = (CX0 + CX1) / 2
BASE, TOP = 0.5, 2.25
# the cupboard below: plinth, carcass, three doors with handles, the top it all stands on
bx('Tr_Plinth', TR, (D - 0.04, W - 0.04, 0.08), (XM + 0.02, CYM, 0.04), plain_mat('Tr_Plinth', (0.03, 0.03, 0.03), dirt=0.05))
bbox('Tr_Cupboard', TR, (D, W, BASE - 0.1), (XM, CYM, 0.08 + (BASE - 0.1) / 2), lam, bev=0.006)
for k in range(3):
    y = CY0 + W * (k + 0.5) / 3
    bbox(f'Tr_Door{k}', TR, (0.012, W / 3 - 0.02, BASE - 0.14), (CX0 - 0.004, y, 0.08 + (BASE - 0.1) / 2), lam, bev=0.004)
    rd(f'Tr_Handle{k}', TR, (CX0 - 0.03, y - 0.12, 0.42), (CX0 - 0.03, y + 0.12, 0.42), 0.007, chrome, verts=6)
    for s in (-1, 1): rd(f'Tr_HandleArm{k}{s}', TR, (CX0 - 0.03, y + s * 0.12, 0.42), (CX0 - 0.008, y + s * 0.12, 0.42), 0.006, chrome, verts=5)
bbox('Tr_CaseFloor', TR, (D + 0.02, W + 0.02, 0.025), (XM - 0.01, CYM, BASE - 0.0125), lam, bev=0.004)
# the display case: velvet back, laminate sides and top, the canopy's light strip, two glass shelves on chrome studs
bx('Tr_Back', TR, (0.02, W - 0.04, TOP - BASE), (CX1 - 0.01, CYM, (BASE + TOP) / 2), velvet)
for s, y in ((-1, CY0 + 0.015), (1, CY1 - 0.015)):
    bbox(f'Tr_Side{s}', TR, (D, 0.03, TOP - BASE + 0.15), (XM, y, (BASE + TOP + 0.15) / 2), lam, bev=0.004)
bbox('Tr_Canopy', TR, (D + 0.03, W + 0.03, 0.15), (XM - 0.015, CYM, TOP + 0.075), lam, bev=0.006)
bx('Tr_Strip', TR, (0.04, W - 0.1, 0.01), (CX0 + 0.08, CYM, TOP - 0.006), lampm)
SHELVES = (BASE, 1.07, 1.64)
for k, z in enumerate(SHELVES[1:]):
    bx(f'Tr_Shelf{k}', TR, (D - 0.06, W - 0.06, 0.012), (XM + 0.01, CYM, z - 0.006), case_glass)
    for y in (CY0 + 0.05, CY1 - 0.05):
        for x in (CX0 + 0.08, CX1 - 0.06): cy(f'Tr_Stud{k}_{y:.1f}_{x:.1f}', TR, 0.006, 0.02, (x, y, z - 0.022), chrome, verts=6)
# three sliding glass doors in chrome frames, on a track top and bottom; a lock on the middle one
bx('Tr_TrackTop', TR, (0.04, W - 0.04, 0.025), (CX0 + 0.02, CYM, TOP - 0.0125), chrome)
bx('Tr_TrackBot', TR, (0.04, W - 0.04, 0.02), (CX0 + 0.02, CYM, BASE + 0.01), chrome)
for k in range(3):
    y0, y1 = CY0 + 0.03 + (W - 0.06) * k / 3 - (0.02 if k else 0), CY0 + 0.03 + (W - 0.06) * (k + 1) / 3 + (0.02 if k < 2 else 0)
    x = CX0 + 0.012 + (k % 2) * 0.016
    bx(f'Tr_Glass{k}', TR, (0.006, y1 - y0 - 0.03, TOP - BASE - 0.07), (x, (y0 + y1) / 2, (BASE + TOP) / 2), case_glass)
    for yy in (y0 + 0.008, y1 - 0.008): bx(f'Tr_GlassStile{k}_{yy:.2f}', TR, (0.012, 0.016, TOP - BASE - 0.05), (x, yy, (BASE + TOP) / 2), chrome)
bx('Tr_Lock', TR, (0.012, 0.03, 0.05), (CX0 + 0.004, CYM + 0.12, BASE + 0.12), chrome)
# HALL OF FAME on the canopy's front
cd('Tr_Header', TR, 2.4, 0.3, (CX0 - 0.031, CYM, TOP + 0.0), art('Tr_Header', 'ws_su_halloffame', 0.04, emit=0.5), rotz=-D90)
# the places: the bottom shelf's four for titles and championship trophies, six on each glass shelf
k = 0
for z, n, size in ((SHELVES[0], 4, 'big'), (SHELVES[1], 6, 'small'), (SHELVES[2], 6, 'small')):
    for i in range(n):
        y = CY0 + 0.18 + (W - 0.36) * (i / (n - 1))
        empty(f'TROPHY_{k:02d}', TR, (XM + 0.03, y, z), rotz=-D90, kind='SINGLE_ARROW', size=0.15, size_kind=size); k += 1
# Danny's note, taped on the middle door's glass (shown till the first trophy)
cd('TROPHY_NOTE', TR, 0.2, 0.14, (CX0 + 0.004, CYM - 0.15, 1.28), art('Tr_Note', 'ws_su_reserved', 0.04), rotz=-D90)
for s in (-1, 1): bx(f'TROPHY_NOTE_Tape{s}', TR, (0.002, 0.05, 0.018), (CX0 + 0.002, CYM - 0.15 + s * 0.07, 1.42), plain_mat('Tr_Tape', (0.85, 0.82, 0.7), dirt=0.02), rot=(s * 0.4, 0, 0))

# the photos either side: a black frame, a white mount, the picture (the game draws it), its hook and wire
photo_blank = plain_mat('Tr_PhotoBlank', (0.5, 0.5, 0.52), dirt=0.0)
for k, (y, z) in enumerate(((-8.2, 1.75), (-8.2, 1.15), (-3.82, 1.75), (-3.82, 1.15))):
    x = X1 - 0.02
    bbox(f'PHOTO_{k:02d}_Frame', TR, (0.025, 0.52, 0.42), (x - 0.0125, y, z), lam, bev=0.004)
    cd(f'PHOTO_{k:02d}_Mount', TR, 0.48, 0.38, (x - 0.026, y, z - 0.19), plain_mat('Tr_Mount', (0.9, 0.89, 0.86), dirt=0.02), rotz=-D90)
    cd(f'PHOTO_{k:02d}', TR, 0.4, 0.3, (x - 0.027, y, z - 0.15), photo_blank, rotz=-D90)
    cy(f'PHOTO_{k:02d}_Hook', TR, 0.008, 0.02, (x - 0.01, y, z + 0.29), chrome, rot=(0, D90, 0), verts=6)
    for s in (-1, 1): rd(f'PHOTO_{k:02d}_Wire{s}', TR, (x - 0.006, y + s * 0.18, z + 0.205), (x - 0.01, y, z + 0.285), 0.002, chrome, verts=4)   # (the wire up to its hook)
