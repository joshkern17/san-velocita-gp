# tools/factory/boulevard.py: run inside tools/garage-factory.py (exec'd with its globals: the plan's numbers, B, dress,
# lights, hooks, garagelib's helpers). See that script's header for the layout.
# The Boulevard, made like a gallery: the career cars' plinths along the curved glass (a dark slab floating on a light
# line, a stainless trim, stanchions and a velvet rope, a plaque on a lectern the game prints on: PLINTH_nn_Plaque; the
# car stands on PLINTH_nn), the Hall of Fame closing the far end (a lit cabinet with TROPHY_ places, Danny's note,
# PHOTO_ frames: the same hooks as the workshop's), the team's banner over the atrium (TeamBand), the team's wall in the
# rotunda (TeamMain / TeamAccent), the partners' board, the timeline under the walkway's edge, the hanging signs and the
# EXIT signs, a lit line in the floor out to the rotunda, and the terrace outside the glass. Objects Fb_..., art fa_bv_*
# (tools/factory/art_boulevard.py, drawn when missing). No lights (the structure's): what glows here is emissive.
# Five plinths, not six: F1-length cars (5.6 m) need ~6.2 m each, and the gallery runs from the rotunda's opening
# (x -13) to the Hall of Fame (x ~18).
import subprocess

ART_FB = os.path.join(SRC, 'factory_art'); AF = lambda n: os.path.join(ART_FB, n + '.png')
if not all(os.path.exists(AF(n)) for n in ('fa_bv_plaque', 'fa_bv_halloffame', 'fa_bv_timeline', 'fa_bv_sponsors', 'fa_bv_exit_up', 'fa_bv_sign_bays_up', 'fa_bv_sign_exit_ahead')):
    py = '/usr/local/bin/python3' if os.path.exists('/usr/local/bin/python3') else 'python3'   # (one with Pillow)
    subprocess.run([py, os.path.join(FA, 'art_boulevard.py')], check=True)
for o in [o for o in bpy.data.objects if o.name.startswith(('Blvd_Plinth_', 'Blvd_PlinthLED_', 'Floor_ExitLine_'))]: bpy.data.objects.remove(o, do_unlink=True)   # (the blockout's)

FB = collection('shell_factory boulevard', shell)
# ---------------- finishes ----------------
slab = plain_mat('Fb_PlinthSlab', (0.045, 0.05, 0.058), dirt=0.02, fleck=0.02, rough=0.22)      # (polished: the light pools on it)
steel = plain_mat('Fb_Stainless', (0.74, 0.76, 0.79), dirt=0.02, rough=0.22)
brushed = plain_mat('Fb_Brushed', (0.6, 0.62, 0.66), dirt=0.02, fleck=0.06, rough=0.35)
blackm = plain_mat('Fb_Black', (0.03, 0.03, 0.035), dirt=0.01, rough=0.4)
velvet = plain_mat('Fb_Velvet', (0.42, 0.04, 0.06), dirt=0.02, fleck=0.05, rough=0.9)
navy = plain_mat('Fb_Navy', (0.05, 0.07, 0.14), dirt=0.01, fleck=0.05, rough=0.95)
edge = mat_img('Fb_EdgeLight', None, 0.4, emit=((0.75, 0.88, 1.0), 6.0))
blue_line = mat_img('Fb_BlueLine', None, 0.4, emit=((0.25, 0.6, 1.0), 5.0))
path_line = mat_img('Fb_PathLine', None, 0.4, emit=((0.55, 1.0, 0.7), 2.6))   # (the way out: a soft green-white)
case_glass = solid_mat('Fb_CaseGlass', (0.2, 0.24, 0.27), 0.05)
case_glass.surface_render_method = 'BLENDED'; case_glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.06
frost = solid_mat('Fb_Frosted', (0.82, 0.88, 0.94), 0.35)
frost.surface_render_method = 'BLENDED'; frost.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.55
TMF = plain_mat('TeamMain_Fb', (0.9, 0.9, 0.9), dirt=0.02)       # (the game multiplies the team's colours over these)
TAF = plain_mat('TeamAccent_Fb', (0.9, 0.9, 0.9), dirt=0.02)
def art(name, png, dirt=0.04, emit=None, rough=0.6): return art_mat(name, AF(png), dirt=dirt, emit=emit, rough=rough)

def at(cx, cy, a, u, v, z=0.0):   # (a point in a frame turned a: u along it, v across, toward the walkway)
    return Vector((cx + u * math.cos(a) - v * math.sin(a), cy + u * math.sin(a) + v * math.cos(a), z))
def framed(name, coll, size, c, mat, bev=0.006, a=0.0):   # (a box in that frame, turned a)
    return bbox(name, coll, size, c, mat, rot=(0, 0, a), bev=bev)

# ======================================================================================================================
# the plinths: five along the curve, each turned with the glass, its slab floating on a line of light
L_P, W_P = 5.4, 2.6
X_FROM, X_TO = -12.9, 16.9   # (the last ends clear of the Hall of Fame's floor: they overlapped)
NP = 5
xs = [X_FROM + L_P / 2 + k * ((X_TO - X_FROM - L_P) / (NP - 1)) for k in range(NP)]
plinths = []
for k, x in enumerate(xs):
    a = math.atan(6 * x / 361)   # (the glass's line there: front_y's slope)
    y = -99.0
    for _ in range(3):   # (as close to the glass as leaves 0.8 m in front of its glass-side corners)
        y = max(front_y(at(x, 0, a, u, -W_P / 2).x) + 0.8 - at(x, 0, a, u, -W_P / 2).y for u in (-L_P / 2, 0, L_P / 2))
    plinths.append((Vector((x, y, 0)), a))
for k, (c, a) in enumerate(plinths):
    n = f'Fb_Plinth{k}'
    framed(f'{n}_Toe', FB, (L_P - 0.16, W_P - 0.16, 0.03), at(c.x, c.y, a, 0, 0, 0.015), blackm, bev=0.003, a=a)
    for j, (u, v, lu, lv) in enumerate(((0, -(W_P / 2 - 0.09), L_P - 0.2, 0.02), (0, W_P / 2 - 0.09, L_P - 0.2, 0.02), (-(L_P / 2 - 0.09), 0, 0.02, W_P - 0.2), (L_P / 2 - 0.09, 0, 0.02, W_P - 0.2))):
        framed(f'{n}_Glow{j}', FB, (lu, lv, 0.012), at(c.x, c.y, a, u, v, 0.024), edge, bev=0.002, a=a)   # (the light under its edge)
    framed(f'{n}_Slab', FB, (L_P, W_P, 0.12), at(c.x, c.y, a, 0, 0, 0.03 + 0.06), slab, bev=0.02, a=a)
    for j, (u, v, lu, lv) in enumerate(((0, -(W_P / 2 - 0.02), L_P, 0.04), (0, W_P / 2 - 0.02, L_P, 0.04), (-(L_P / 2 - 0.02), 0, 0.04, W_P), (L_P / 2 - 0.02, 0, 0.04, W_P))):
        framed(f'{n}_Trim{j}', FB, (lu, lv, 0.012), at(c.x, c.y, a, u, v, 0.156), steel, bev=0.003, a=a)
    framed(f'{n}_Top', FB, (L_P - 0.08, W_P - 0.08, 0.01), at(c.x, c.y, a, 0, 0, 0.155), slab, bev=0.002, a=a)
    # where the car stands (the game puts one there, step 6), its front to the walkway
    p = at(c.x, c.y, a, 0, 0, 0.16); empty(f'PLINTH_{k:02d}', hooks, tuple(p), rotz=a + math.pi, kind='SINGLE_ARROW', size=1.0)
    # the stanchions and the rope along its walkway side
    us = (-L_P / 2 + 0.3, -0.85, 0.85, L_P / 2 - 0.3); tops = []
    for j, u in enumerate(us):
        q = at(c.x, c.y, a, u, W_P / 2 + 0.38)
        lathe(f'{n}_Post{j}', FB, [(0.0, 0.0), (0.16, 0.0), (0.16, 0.02), (0.05, 0.04), (0.022, 0.07), (0.02, 0.86), (0.03, 0.88), (0.035, 0.92), (0.0, 0.95)], q, steel, segs=12)
        tops.append(q + Vector((0, 0, 0.86)))
    for j in range(len(tops) - 1):
        a0, a1 = tops[j], tops[j + 1]; m = (a0 + a1) / 2 - Vector((0, 0, 0.14))
        sweep(f'{n}_Rope{j}', FB, [a0, a0.lerp(m, 0.55) - Vector((0, 0, 0.05)), m, a1.lerp(m, 0.55) - Vector((0, 0, 0.05)), a1], 0.018, velvet, segs=6, per_m=8)
        for t in (a0, a1): cy(f'{n}_RopeHook{j}_{t.x:.1f}', FB, 0.022, 0.03, t + Vector((0, 0, 0.0)), steel, verts=6)
    # the plaque: on a slanted lectern at the plinth's left end, turned to the walkway (the game prints the car on it)
    rotp = a + math.pi - 0.35; tilt = -0.95
    base = at(c.x, c.y, a, -L_P / 2 - 0.15, W_P / 2 + 0.35)
    lathe(f'{n}_LecternFoot', FB, [(0.0, 0.0), (0.18, 0.0), (0.18, 0.015), (0.04, 0.03), (0.0, 0.03)], base, steel, segs=12)
    rd(f'{n}_LecternPost', FB, base + Vector((0, 0, 0.02)), base + Vector((0, 0, 0.92)), 0.028, brushed, verts=8)
    M = Euler((tilt, 0, rotp)).to_matrix()
    bot = base + Vector((0, 0, 0.92)) + M @ Vector((0, 0.0, -0.2))   # (its bottom edge: the plate centred over the post)
    plate_c = bot + M @ Vector((0, 0.012, 0.2))
    bbox(f'{n}_LecternPlate', FB, (0.6, 0.02, 0.44), plate_c, brushed, rot=(tilt, 0, rotp), bev=0.004)
    cd(f'PLINTH_{k:02d}_Plaque', FB, 0.54, 0.372, bot + M @ Vector((0, -0.0015, 0.034)), art('Fb_Plaque', 'fa_bv_plaque', 0.03, rough=0.35), rotz=rotp, tilt=tilt)

# ======================================================================================================================
# the Hall of Fame: the gallery's far end (the building's right wall, x 19, y -11..-6.5): an aluminium feature wall,
# the lit cabinet, the season photos over it, its header high up. The same hooks as the workshop's cabinet
HX = X1 - 0.02; HY0, HY1 = -10.85, -6.65; HYM = (HY0 + HY1) / 2
# the wall: brushed panels with lit seams, a blue line up each side
NPN = 4
for j in range(NPN):
    y0, y1 = HY0 + (HY1 - HY0) * j / NPN, HY0 + (HY1 - HY0) * (j + 1) / NPN
    bbox(f'Fb_HoF_Panel{j}', FB, (0.06, y1 - y0 - 0.02, 5.4), (HX - 0.03, (y0 + y1) / 2, 2.72), brushed, bev=0.005)
for j, y in enumerate((HY0 - 0.03, HY1 + 0.03)): bx(f'Fb_HoF_Edge{j}', FB, (0.05, 0.03, 5.4), (HX - 0.04, y, 2.72), blue_line)
cd('Fb_HoF_Header', FB, 3.4, 0.425, (HX - 0.065, HYM, 4.6), art('Fb_HoF_Header', 'fa_bv_halloffame', 0.0, emit=0.8), rotz=-D90)
bx('Fb_HoF_HeaderBack', FB, (0.03, 3.5, 0.5), (HX - 0.05, HYM, 4.81), blackm)
# the cabinet: x from HX-0.56 out from the wall; a plinth, the cupboard, the case (velvet back, glass shelves, a light
# strip in its canopy, three sliding glass doors)
CX0_, CX1_ = HX - 0.62, HX - 0.07; CW = 3.5; CY0_, CY1_ = HYM - CW / 2, HYM + CW / 2; CXM = (CX0_ + CX1_) / 2; CD = CX1_ - CX0_
BASE_, TOP_ = 0.55, 2.6
bx('Fb_HoF_Plinth', FB, (CD - 0.04, CW - 0.04, 0.08), (CXM + 0.02, HYM, 0.04), blackm)
bbox('Fb_HoF_Cupboard', FB, (CD, CW, BASE_ - 0.1), (CXM, HYM, 0.08 + (BASE_ - 0.1) / 2), slab, bev=0.008)
for j in range(3):
    y = CY0_ + CW * (j + 0.5) / 3
    bbox(f'Fb_HoF_Door{j}', FB, (0.012, CW / 3 - 0.02, BASE_ - 0.14), (CX0_ - 0.004, y, 0.08 + (BASE_ - 0.1) / 2), slab, bev=0.004)
    bx(f'Fb_HoF_Pull{j}', FB, (0.012, 0.3, 0.012), (CX0_ - 0.014, y, BASE_ - 0.08), steel)
bbox('Fb_HoF_CaseFloor', FB, (CD + 0.02, CW + 0.02, 0.025), (CXM - 0.01, HYM, BASE_ - 0.0125), slab, bev=0.004)
bx('Fb_HoF_Back', FB, (0.02, CW - 0.04, TOP_ - BASE_), (CX1_ - 0.01, HYM, (BASE_ + TOP_) / 2), navy)
for s, y in ((-1, CY0_ + 0.015), (1, CY1_ - 0.015)): bbox(f'Fb_HoF_Side{s}', FB, (CD, 0.03, TOP_ - BASE_ + 0.15), (CXM, y, (BASE_ + TOP_ + 0.15) / 2), slab, bev=0.004)
bbox('Fb_HoF_Canopy', FB, (CD + 0.03, CW + 0.03, 0.15), (CXM - 0.015, HYM, TOP_ + 0.075), slab, bev=0.006)
bx('Fb_HoF_Strip', FB, (0.04, CW - 0.1, 0.01), (CX0_ + 0.08, HYM, TOP_ - 0.006), edge)
SH = (BASE_, 1.24, 1.9)
for j, z in enumerate(SH[1:]):
    bx(f'Fb_HoF_Shelf{j}', FB, (CD - 0.06, CW - 0.06, 0.012), (CXM + 0.01, HYM, z - 0.006), case_glass)
    for y in (CY0_ + 0.05, CY1_ - 0.05):
        for x in (CX0_ + 0.08, CX1_ - 0.06): cy(f'Fb_HoF_Stud{j}_{y:.1f}_{x:.2f}', FB, 0.006, 0.02, (x, y, z - 0.022), steel, verts=6)
bx('Fb_HoF_TrackTop', FB, (0.04, CW - 0.04, 0.025), (CX0_ + 0.02, HYM, TOP_ - 0.0125), steel)
bx('Fb_HoF_TrackBot', FB, (0.04, CW - 0.04, 0.02), (CX0_ + 0.02, HYM, BASE_ + 0.01), steel)
for j in range(3):
    y0, y1 = CY0_ + 0.03 + (CW - 0.06) * j / 3 - (0.02 if j else 0), CY0_ + 0.03 + (CW - 0.06) * (j + 1) / 3 + (0.02 if j < 2 else 0)
    x = CX0_ + 0.012 + (j % 2) * 0.016
    bx(f'Fb_HoF_Glass{j}', FB, (0.006, y1 - y0 - 0.03, TOP_ - BASE_ - 0.07), (x, (y0 + y1) / 2, (BASE_ + TOP_) / 2), case_glass)
    for yy in (y0 + 0.008, y1 - 0.008): bx(f'Fb_HoF_Stile{j}_{yy:.2f}', FB, (0.012, 0.016, TOP_ - BASE_ - 0.05), (x, yy, (BASE_ + TOP_) / 2), steel)
# the places: four big ones on the floor of the case, six on each glass shelf (they face out, -X)
kk = 0
for z, n_, size in ((SH[0], 4, 'big'), (SH[1], 6, 'small'), (SH[2], 6, 'small')):
    for i in range(n_):
        y = CY0_ + 0.22 + (CW - 0.44) * (i / (n_ - 1))
        empty(f'TROPHY_{kk:02d}', hooks, (CXM + 0.03, y, z), rotz=-D90, kind='SINGLE_ARROW', size=0.15, size_kind=size); kk += 1
# Danny's note on the glass, till the first trophy (the workshop's note, its tape)
NOTE = os.path.join(SRC, 'workshop_art', 'ws_su_reserved.png')
if os.path.exists(NOTE):
    cd('TROPHY_NOTE_Fb', FB, 0.2, 0.14, (CX0_ + 0.004, HYM - 0.2, 1.3), art_mat('Fb_Note', NOTE, dirt=0.03), rotz=-D90)
    for s in (-1, 1): bx(f'TROPHY_NOTE_Fb_Tape{s}', FB, (0.002, 0.05, 0.018), (CX0_ + 0.002, HYM - 0.2 + s * 0.07, 1.42), plain_mat('Fb_Tape', (0.85, 0.82, 0.7), dirt=0.02), rot=(s * 0.4, 0, 0))
# the season photos: a row of four over the cabinet, black frames, white mounts, the picture (the game draws it)
photo_blank = plain_mat('Fb_PhotoBlank', (0.45, 0.46, 0.5), dirt=0.0)
for j in range(4):
    y = CY0_ + 0.45 + (CW - 0.9) * j / 3; z = 3.15
    bbox(f'PHOTO_{j:02d}_Frame', FB, (0.03, 0.72, 0.56), (HX - 0.075, y, z), blackm, bev=0.004)
    cd(f'PHOTO_{j:02d}_Mount', FB, 0.66, 0.5, (HX - 0.092, y, z - 0.25), plain_mat('Fb_Mount', (0.92, 0.91, 0.88), dirt=0.01), rotz=-D90)
    cd(f'PHOTO_{j:02d}', FB, 0.56, 0.42, (HX - 0.093, y, z - 0.21), photo_blank, rotz=-D90)
    bx(f'PHOTO_{j:02d}_Light', FB, (0.05, 0.4, 0.03), (HX - 0.12, y, z + 0.33), steel)   # (a picture light over each)
    bx(f'PHOTO_{j:02d}_LightLens', FB, (0.03, 0.36, 0.006), (HX - 0.13, y, z + 0.313), edge)
    rd(f'PHOTO_{j:02d}_LightArm', FB, (HX - 0.065, y, z + 0.36), (HX - 0.12, y, z + 0.345), 0.008, steel, verts=5)
# its floor: a dark inlay with a stainless border in front of the wall
poly('Fb_HoF_Floor', FB, [(HX - 1.7, HY0, 0.003), (HX, HY0, 0.003), (HX, HY1, 0.003), (HX - 1.7, HY1, 0.003)], slab)
for j, (a_, b_) in enumerate((((HX - 1.7, HY0), (HX - 1.7, HY1)), ((HX - 1.7, HY0), (HX - 0.6, HY0)), ((HX - 1.7, HY1), (HX - 0.6, HY1)))):
    beam(f'Fb_HoF_Inlay{j}', FB, (*a_, 0.004), (*b_, 0.004), 0.03, 0.004, steel)

# ======================================================================================================================
# branding: the team's banner over the atrium (seen from the Boulevard through the glass), the team's wall in the rotunda,
# the partners' board on the tire bay's front
BX_, BZ0 = (AX0 + AX1) / 2, 6.25
cd('TeamBand_Fb_Atrium', FB, 8.0, 2.0, (BX_, AY1 + 0.55, BZ0), plain_mat('Fb_BandBase', (0.9, 0.9, 0.9), dirt=0.0))
bbox('Fb_Band_Frame', FB, (8.2, 0.08, 2.2), (BX_, AY1 + 0.6, BZ0 + 1.0), brushed, bev=0.01)
bx('Fb_Band_Line', FB, (8.2, 0.02, 0.03), (BX_, AY1 + 0.54, BZ0 - 0.07), blue_line)
for s in (-1, 1): rd(f'Fb_Band_Hanger{s}', FB, (BX_ + s * 3.6, AY1 + 0.6, BZ0 + 2.1), (BX_ + s * 3.6, AY1 + 0.6, H), 0.006, steel, verts=4)
# the rotunda's team wall: a curved panel in the team's colour on the side away from the doors, its accent stripe, the
# roundel, the banner (the reception desk stands in front of it)
A0, A1, NS = math.pi * 0.42, math.pi * 0.88, 8
RW = ROT_R - 0.32
for j in range(NS):
    t0, t1 = A0 + (A1 - A0) * j / NS, A0 + (A1 - A0) * (j + 1) / NS; tm = (t0 + t1) / 2
    p0 = ROT + Vector((math.cos(t0), math.sin(t0), 0)) * RW; p1 = ROT + Vector((math.cos(t1), math.sin(t1), 0)) * RW
    c = (p0 + p1) / 2; ang = math.atan2(p1.y - p0.y, p1.x - p0.x); L = (p1 - p0).length + 0.01
    bx(f'Fb_RotWall{j}', FB, (L, 0.12, 3.2), (c.x, c.y, 1.6 + 0.02), TMF, rot=(0, 0, ang))
    bx(f'Fb_RotWallStripe{j}', FB, (L, 0.13, 0.14), (c.x, c.y, 0.95), TAF, rot=(0, 0, ang))
    bx(f'Fb_RotWallCap{j}', FB, (L, 0.16, 0.04), (c.x, c.y, 3.24), brushed, rot=(0, 0, ang))
    bx(f'Fb_RotWallFoot{j}', FB, (L, 0.15, 0.06), (c.x, c.y, 0.03), blackm, rot=(0, 0, ang))
tm = (A0 + A1) / 2; d_ = Vector((math.cos(tm), math.sin(tm), 0)); face = math.atan2(-d_.x, d_.y)   # (a card turned to face the rotunda's middle)
# (the banner on a flat brushed plaque standing off the curve on four studs: flat against it, its ends were behind it)
PR = RW - 0.26; pc = ROT + d_ * PR
bbox('Fb_RotBandPlaque', FB, (1.96, 0.04, 0.6), (pc.x, pc.y, 2.375), brushed, rot=(0, 0, face), bev=0.006)
cd('TeamBand_Fb_Rotunda', FB, 1.8, 0.45, tuple(ROT + d_ * (PR - 0.022) + Vector((0, 0, 2.15))), plain_mat('Fb_BandBase2', (0.9, 0.9, 0.9), dirt=0.0), rotz=face)
tg = Vector((d_.y, -d_.x, 0))
for su in (-0.85, 0.85):
    for sz in (2.15, 2.6):
        p0 = pc + tg * su; rd(f'Fb_RotBandStud{su:+.1f}_{sz:.1f}', FB, (p0.x, p0.y, sz), tuple(ROT + d_ * (RW - 0.04) + tg * su + Vector((0, 0, sz))), 0.012, steel, verts=6)
rc_ = ROT + d_ * (RW - 0.12) + Vector((0, 0, 1.45))   # (the roundel, clear of the curve too)
lathe('Fb_RotRoundel', FB, [(0.0, 0.0), (0.42, 0.0), (0.44, 0.02), (0.36, 0.035), (0.0, 0.035)], rc_, brushed, segs=24, rot=(D90, 0, face))
lathe('Fb_RotRoundelRing', FB, [(0.30, 0.036), (0.34, 0.036), (0.34, 0.042), (0.30, 0.042)], rc_, blue_line, segs=24, rot=(D90, 0, face), cap0=False, cap1=False)
rd('Fb_RotRoundelStud', FB, rc_, tuple(ROT + d_ * (RW - 0.04) + Vector((0, 0, 1.45))), 0.03, steel, verts=8)
# the partners' board: lit, on the tire bay's front wall right of its opening
PBX = -9.0
bbox('Fb_Partners_Frame', FB, (1.26, 0.06, 2.12), (PBX, GY - 0.13, 1.6), brushed, bev=0.008)
cd('Fb_Partners', FB, 1.1, 1.925, (PBX, GY - 0.165, 0.64), art('Fb_Partners', 'fa_bv_sponsors', 0.02, emit=0.35))
bx('Fb_Partners_Glow', FB, (1.2, 0.02, 0.02), (PBX, GY - 0.17, 2.67), edge)

# ======================================================================================================================
# the timeline: the team from a lottery ticket to this, frosted glass hung under the walkway's edge over the Boulevard
TLX0, TLX1, TLZ0 = -0.5, 5.5, 3.15   # (half size, just under the walkway: at 1.2 m tall from 2.6 it hid the atrium from the Boulevard)
TLY = GY - WALK_W - 0.04
bx('Fb_Timeline_Glass', FB, (TLX1 - TLX0 + 0.04, 0.03, 0.64), ((TLX0 + TLX1) / 2, TLY + 0.02, TLZ0 + 0.3), frost)
cd('Fb_Timeline', FB, TLX1 - TLX0, 0.6, ((TLX0 + TLX1) / 2, TLY, TLZ0), art('Fb_Timeline', 'fa_bv_timeline', 0.0, emit=0.25, rough=0.4))
cd('Fb_Timeline_Back', FB, TLX1 - TLX0, 0.6, ((TLX0 + TLX1) / 2, TLY + 0.04, TLZ0), frost, rotz=math.pi)   # (its back, from the walkway's side)
bx('Fb_Timeline_Line', FB, (TLX1 - TLX0, 0.04, 0.02), ((TLX0 + TLX1) / 2, TLY + 0.02, TLZ0 - 0.01), blue_line)
for x in (TLX0 + 0.3, (TLX0 + TLX1) / 2, TLX1 - 0.3):
    rd(f'Fb_Timeline_Rod{x:.1f}', FB, (x, TLY + 0.02, TLZ0 + 0.6), (x, TLY + 0.02, UZ - 0.31), 0.008, steel, verts=5)

# ======================================================================================================================
# wayfinding: blades hung over the gallery (both faces), signs over the atrium's doorways, the door signs upstairs, the
# EXITs (lit green boxes), the lit line in the floor out to the rotunda
def blade(name, c, facing_x, front_png, back_png, w=1.5, h=0.375, z=2.95, green=False):
    # a hanging blade at c: its faces to +X and -X when facing_x (else +Y / -Y); front_png on the + face
    rot = 0.0 if not facing_x else D90
    bbox(f'{name}_Body', FB, (w + 0.04, 0.05, h + 0.04), (c.x, c.y, z + h / 2), blackm if not green else plain_mat('Fb_ExitBody', (0.05, 0.3, 0.12), dirt=0.0), rot=(0, 0, rot), bev=0.006)
    em = 0.9 if green else 0.35
    if facing_x:   # (a card faces -Y turned rotz: to +X is -90 deg, to -X is +90 deg)
        cd(f'{name}_F', FB, w, h, (c.x + 0.027, c.y, z), art(f'Fb_{front_png}', front_png, 0.0, emit=em), rotz=D90)    # (to +X)
        cd(f'{name}_B', FB, w, h, (c.x - 0.027, c.y, z), art(f'Fb_{back_png}', back_png, 0.0, emit=em), rotz=-D90)  # (to -X)
    else:
        cd(f'{name}_F', FB, w, h, (c.x, c.y + 0.027, z), art(f'Fb_{front_png}', front_png, 0.0, emit=em), rotz=math.pi)
        cd(f'{name}_B', FB, w, h, (c.x, c.y - 0.027, z), art(f'Fb_{back_png}', back_png, 0.0, emit=em))
    along = Vector((0, 1, 0)) if facing_x else Vector((1, 0, 0))
    for s in (-1, 1):   # (hung from the walkway's slab over the gallery, else from the roof)
        p = c + along * s * (w / 2 - 0.1); top = UZ - 0.31 if GY - WALK_W - 0.05 < p.y < GY + 0.05 else H
        rd(f'{name}_Cable{s}', FB, (p.x, p.y, z + h + 0.02), (p.x, p.y, top), 0.004, steel, verts=4)
# over the Boulevard's walkway: going right (toward the Hall of Fame) and going left (toward the way out)
for j, x in enumerate((-12.4, -2.0, 11.5)):
    yb = GY - 1.05
    blade(f'Fb_Blade{j}', Vector((x, yb, 0)), True, 'fa_bv_exit_up' if j == 0 else 'fa_bv_sign_exit_ahead', 'fa_bv_sign_halloffame_ahead', green=False)   # (+X face: to whoever's heading for the way out; -X: heading down the gallery)
# over the atrium's doorways, facing the Boulevard: in to the bays (and the stairs to your office by the left one)
for j, (x, png) in enumerate(((-5.7, 'fa_bv_sign_bays_up'), (8.55, 'fa_bv_sign_bays_right'))):
    bbox(f'Fb_DoorSign{j}', FB, (1.44, 0.04, 0.4), (x, GY - 0.05, 3.42), blackm, bev=0.005)
    for s_ in (-1, 1): rd(f'Fb_DoorSign{j}_Rod{s_}', FB, (x + s_ * 0.6, GY - 0.05, 3.62), (x + s_ * 0.6, GY - 0.05, UZ - 0.2), 0.008, steel, verts=4)   # (from the glass's head)
    cd(f'Fb_DoorSign{j}_Face', FB, 1.4, 0.35, (x, GY - 0.075, 3.25), art(f'Fb_{png}', png, 0.0, emit=0.35))
# the tunnel's window: what it is
bbox('Fb_TunnelSign', FB, (1.44, 0.04, 0.4), (14.5, GY - 0.05, 3.42), blackm, bev=0.005)
for s_ in (-1, 1): rd(f'Fb_TunnelSign_Rod{s_}', FB, (14.5 + s_ * 0.6, GY - 0.05, 3.62), (14.5 + s_ * 0.6, GY - 0.05, UZ - 0.2), 0.008, steel, verts=4)
cd('Fb_TunnelSign_Face', FB, 1.4, 0.35, (14.5, GY - 0.075, 3.25), art('Fb_fa_bv_sign_tunnel_right', 'fa_bv_sign_tunnel_right', 0.0, emit=0.35))
# the EXIT boxes: over the gallery near the rotunda, both faces; over the corridor's door to the dock; at the stairs' foot
def exit_box(name, c, rotz, png_f, png_b, z=2.7, top=H):
    bbox(f'{name}_Box', FB, (0.42, 0.07, 0.16), (c.x, c.y, z + 0.08), plain_mat('Fb_ExitBox', (0.92, 0.93, 0.94), dirt=0.0), rot=(0, 0, rotz), bev=0.008)
    M2 = Euler((0, 0, rotz)).to_matrix()
    if png_f: cd(f'{name}_F', FB, 0.38, 0.127, c + M2 @ Vector((0, -0.037, 0)) + Vector((0, 0, z + 0.017)), art(f'Fb_{png_f}', png_f, 0.0, emit=1.2), rotz=rotz)
    if png_b: cd(f'{name}_B', FB, 0.38, 0.127, c + M2 @ Vector((0, 0.037, 0)) + Vector((0, 0, z + 0.017)), art(f'Fb_{png_b}', png_b, 0.0, emit=1.2), rotz=rotz + math.pi)
    rd(f'{name}_Rod', FB, c + Vector((0, 0, z + 0.16)), c + Vector((0, 0, top)), 0.006 if top - z > 1.5 else 0.008, steel, verts=4)   # (to what holds it up)
exit_box('Fb_Exit_Blvd', Vector((-10.0, GY - 2.6, 0)), D90, 'fa_bv_exit_up', None, z=2.6)   # (one face, to +X: to whoever's heading for the rotunda, it's ahead)
exit_box('Fb_Exit_Dock', Vector((-6.7, CY1 - 0.12, 0)), 0.0, 'fa_bv_exit_up', None, z=2.9, top=RH)                 # (over the corridor's door into the dock)
exit_box('Fb_Exit_StairFoot', Vector((ST_X1 + 0.6, ST_Y0 - 0.5, 0)), 0.0, None, 'fa_bv_exit_up', z=2.6)   # (at the stairs' foot, its face to the atrium: out through the doorway ahead)
# upstairs: signs on the glass by each room's door, the way down at the stairs' head
# (rotz: the way each faces; zz its height. Office, ops: on their glass, to the walkway (+X); the cafe's to the walkway
# (-Y); the way down on the landing's glass, to whoever comes along the walkway to it (+Y))
for j, (c, rotz, png, zz) in enumerate(((Vector((AX0 - 1.95, -3.9, 0)), D90, 'fa_bv_sign_office_left', UZ + 2.25), (Vector((AX0 - 1.95, 4.8, 0)), D90, 'fa_bv_sign_ops_left', UZ + 2.25),
                                        (Vector((AX0 - 0.6, CY1 - 0.05, 0)), 0.0, 'fa_bv_sign_cafe_right', UZ + 2.25), (Vector(((ST_X0 + ST_X1) / 2, ST_Y1 + 1.23, 0)), math.pi, 'fa_bv_sign_stairs_down', UZ + 0.72))):
    M2 = Euler((0, 0, rotz)).to_matrix()
    bbox(f'Fb_UpSign{j}', FB, (0.98, 0.03, 0.27), c + Vector((0, 0, zz)), blackm, rot=(0, 0, rotz), bev=0.004)
    cd(f'Fb_UpSign{j}_Face', FB, 0.96, 0.24, c + M2 @ Vector((0, -0.017, 0)) + Vector((0, 0, zz - 0.12)), art(f'Fb_{png}', png, 0.0, emit=0.35), rotz=rotz)
# the way out, lit in the floor: from the right doorway along the gallery behind the cars, past the left doorway, into
# the rotunda and to its doors; a chevron every 2.4 m pointing the way
path = [Vector((8.55, GY - 0.55, 0)), Vector((-12.0, GY - 0.55, 0)), Vector((ROT.x + 1.4, ROT.y + 0.9, 0)), Vector((ROT.x - 0.4, ROT.y - 0.5, 0)),
        ROT + Vector((math.cos(math.pi * 1.25), math.sin(math.pi * 1.25), 0)) * (ROT_R - 0.5)]
for j, (a_, b_) in enumerate(zip(path, path[1:])):
    beam(f'Fb_Path{j}', FB, (a_.x, a_.y, 0.003), (b_.x, b_.y, 0.003), 0.05, 0.004, path_line)
    L = (b_ - a_).length; dv = (b_ - a_) / L; nv = Vector((-dv.y, dv.x, 0))
    for i in range(int(L / 2.4)):
        p = a_ + dv * (1.2 + i * 2.4); tip = p + dv * 0.22
        for s in (-1, 1): beam(f'Fb_Chev{j}_{i}_{s}', FB, (tip.x, tip.y, 0.004), ((p + nv * s * 0.22).x, (p + nv * s * 0.22).y, 0.004), 0.05, 0.004, path_line)
# stainless inlay strips in the gallery's floor, following the glass
for j, off in enumerate((0.45,)):
    pts_ = [Vector((x, front_y(x) + off, 0.003)) for x in [X_FROM + 0.8 + i * (X_TO - X_FROM - 0.4) / 16 for i in range(17)]]
    for i, (a_, b_) in enumerate(zip(pts_, pts_[1:])): beam(f'Fb_Inlay{j}_{i}', FB, a_, b_, 0.03, 0.004, steel)

# ======================================================================================================================
# the terrace outside the glass: big pale pavers, a stone edge dropping to the water, planters, benches, bollard lights,
# the team's flags (seen through the glass)
n = 64; pv = np.ones((n, n, 3), np.float32) * np.array([0.62, 0.6, 0.56], np.float32)
pv *= (1 + (fbm(n, n, (32, 8), wrap=True) - 0.5) * 0.08)[..., None]
pv[:, :1] *= 0.7; pv[:1, :] *= 0.7   # (the joints: a 1.2 m paver a tile)
pave = mat_img('Fb_Paving', save('fb_paving', pv), 0.8)
TO = 3.4
xs_t = [X0 - 1.0 + (X1 - X0 + 2.0) * i / 30 for i in range(31)]
inner = [(x, front_y(x) - 0.05) for x in xs_t]; outer = [(x, front_y(x) - TO) for x in xs_t]
poly('Fb_Terrace', FB, [(x, y, -0.02) for x, y in reversed(outer)] + [(x, y, -0.02) for x, y in inner], pave, uvs=1 / 1.2)
for i, (a_, b_) in enumerate(zip(outer, outer[1:])):   # (the edge: coping and its face down to the water)
    beam(f'Fb_Coping{i}', FB, (a_[0], a_[1] + 0.15, 0.02), (b_[0], b_[1] + 0.15, 0.02), 0.34, 0.1, plain_mat('Fb_Stone', (0.7, 0.68, 0.64), dirt=0.05))
    beam(f'Fb_EdgeFace{i}', FB, (a_[0], a_[1] - 0.02, -0.26), (b_[0], b_[1] - 0.02, -0.26), 0.04, 0.5, plain_mat('Fb_StoneFace', (0.42, 0.42, 0.4), dirt=0.08))
grass_n = 64; gc = np.zeros((grass_n, grass_n, 3), np.float32); ga = np.zeros((grass_n, grass_n), np.float32)
rng_ = np.random.default_rng(14)
for _ in range(90):   # (blades of an ornamental grass)
    x0 = rng_.integers(4, grass_n - 4); h_ = rng_.integers(grass_n // 2, grass_n - 2); lean = rng_.uniform(-0.35, 0.35)
    for t in range(h_):
        xx = int(x0 + lean * t); yy = grass_n - 1 - t
        if 0 <= xx < grass_n: ga[yy, xx] = 1; gc[yy, xx] = np.array([0.32, 0.42, 0.2]) * (0.7 + 0.5 * t / h_)
grass = cutout_mat('Fb_Grass', gc, ga)
concrete = plain_mat('Fb_Concrete', (0.55, 0.55, 0.53), dirt=0.05)
soil = plain_mat('Fb_Soil', (0.12, 0.09, 0.07), dirt=0.02)
for j, x in enumerate((-9.0, -1.5, 6.0, 13.0)):
    a_ = math.atan(6 * x / 361); y_ = front_y(x) - TO + 0.8
    framed(f'Fb_Planter{j}', FB, (2.4, 0.7, 0.5), Vector((x, y_, 0.25)), concrete, bev=0.02, a=a_)
    framed(f'Fb_PlanterSoil{j}', FB, (2.3, 0.6, 0.02), Vector((x, y_, 0.49)), soil, bev=0.002, a=a_)
    for i in range(4):
        u = -0.85 + i * 0.57; p = at(x, y_, a_, u, 0, 0.5)
        for r_ in (0.0, D90): cd(f'Fb_Grass{j}_{i}_{r_:.1f}', FB, 0.7, 0.7, (p.x, p.y, 0.5), grass, rotz=a_ + r_ + i * 0.4)
wood = plain_mat('Fb_Wood', (0.42, 0.28, 0.16), dirt=0.05, fleck=0.06)
for j, x in enumerate((-5.3, 2.3, 9.5)):
    a_ = math.atan(6 * x / 361); y_ = front_y(x) - TO + 0.9
    for s in (-1, 1): framed(f'Fb_Bench{j}_Leg{s}', FB, (0.12, 0.45, 0.42), at(x, y_, a_, s * 0.75, 0, 0.21), concrete, bev=0.01, a=a_)
    for i in range(4): framed(f'Fb_Bench{j}_Slat{i}', FB, (1.9, 0.09, 0.04), at(x, y_, a_, 0, -0.17 + i * 0.113, 0.44), wood, bev=0.006, a=a_)
for j in range(9):
    x = -14.0 + j * 3.8; y_ = front_y(x) - TO + 0.35
    lathe(f'Fb_Bollard{j}', FB, [(0.0, 0.0), (0.1, 0.0), (0.09, 0.02), (0.08, 0.7), (0.09, 0.72), (0.09, 0.9), (0.0, 0.92)], (x, y_, 0), plain_mat('Fb_BollardBody', (0.18, 0.19, 0.21), dirt=0.02), segs=10)
    lathe(f'Fb_BollardLens{j}', FB, [(0.092, 0.74), (0.092, 0.86)], (x, y_, 0), edge, segs=10, cap0=False, cap1=False)
for j, (x, mat_f) in enumerate(((15.8, TMF), (17.6, TAF))):
    y_ = front_y(x) - TO + 1.0
    lathe(f'Fb_FlagPole{j}', FB, [(0.0, 0.0), (0.12, 0.0), (0.12, 0.08), (0.05, 0.1), (0.04, 9.6), (0.06, 9.65), (0.0, 9.72)], (x, y_, 0), steel, segs=10)
    for i in range(3):   # (the flag: three panels, a gentle wave)
        u0 = 0.05 + i * 0.6; ang_ = 0.25 * math.sin(i * 1.7 + j)
        bx(f'Fb_Flag{j}_{i}', FB, (0.6, 0.012, 1.1), (x + u0 + 0.3, y_ + 0.08 * math.sin(i * 1.5 + j), 8.7), mat_f, rot=(0, 0, ang_))
