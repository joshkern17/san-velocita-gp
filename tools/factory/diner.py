# tools/factory/diner.py: run inside tools/garage-factory.py after lived.py (exec'd with the globals: the plan's numbers,
# dress, lights, hooks, garagelib's helpers, rooms.py's finishes and builders, lived.py's).
# The cafe (upstairs, x -19..2, y 7.5..14) made the team's diner, the Pit Stop: an old-school racing diner and bar, the
# place everyone actually goes. A checkered floor, a chrome-edged counter with old tires set into its front and red
# vinyl stools, red-and-white booths along the glass with wheel-rim tables, the walls a red wainscot under cream with
# the stuff of racing on them (posters, signed helmets, a nose cone, the team caps, the wall of shame under the TV), the
# sponsors' neon, a jukebox, the beer taps with gear-knob handles, pennants across the ceiling, the pun menu; lit warm
# and low. Printed bits: tools/factory/art_diner.py. (The fridges, the back run and its coffee machines stay.)
FD = dress
DZ = UZ
for o in [o for o in bpy.data.objects if o.name.startswith(('Fr_Cafe_Counter', 'Fr_Cafe_Sneeze', 'Fr_Cafe_Cake', 'Fr_Cafe_Dome', 'Fr_Cafe_Till', 'Fr_Cafe_Table', 'Fr_Cafe_Chair',
                                                            'Fr_Cafe_Cup', 'Fr_Cafe_Paper', 'Fr_Cafe_Ledge', 'Fr_Cafe_Stool', 'Fr_Cafe_Plant')) or o.name in ('STAND_any.023', 'STAND_any.024')]:
    bpy.data.objects.remove(o, do_unlink=True)
ART_DN = os.path.join(SRC, 'factory_art', 'diner')
if not os.path.exists(os.path.join(ART_DN, 'fa_dn_checker.png')):
    py = '/usr/local/bin/python3' if os.path.exists('/usr/local/bin/python3') else 'python3'   # (needs Pillow)
    subprocess.run([py, os.path.join(FA, 'art_diner.py'), ART_DN], check=True)
DN = lambda n: os.path.join(ART_DN, 'fa_dn_' + n + '.png')
vinyl = plain_mat('Dn_VinylRed', (0.62, 0.07, 0.06), dirt=0.05, fleck=0.05, rough=0.4)
vinylw = plain_mat('Dn_VinylWhite', (0.9, 0.88, 0.84), dirt=0.06, fleck=0.05, rough=0.4)
formica = plain_mat('Dn_Formica', (0.88, 0.84, 0.74), dirt=0.05, fleck=0.12, rough=0.35)
cream = plain_mat('Dn_Cream', (0.86, 0.8, 0.66), dirt=0.08, fleck=0.04, rough=0.8)
wains = plain_mat('Dn_Wainscot', (0.55, 0.07, 0.06), dirt=0.08, fleck=0.03, rough=0.5)
wood = plain_mat('Dn_Wood', (0.42, 0.26, 0.14), dirt=0.08, fleck=0.12, rough=0.6)
ketchup = plain_mat('Dn_Ketchup', (0.75, 0.06, 0.04), dirt=0.02, rough=0.3); mustard = plain_mat('Dn_Mustard', (0.92, 0.72, 0.08), dirt=0.02, rough=0.3)
bun = plain_mat('Dn_Bun', (0.78, 0.52, 0.24), dirt=0.02, fleck=0.15); patty = plain_mat('Dn_Patty', (0.24, 0.13, 0.07), dirt=0.02, fleck=0.2)
shake = plain_mat('Dn_Shake', (0.95, 0.7, 0.74), dirt=0.0, rough=0.5); glassd = see('Dn_Glass', (0.75, 0.85, 0.9), 0.25)
amber = mat_img('Dn_Amber', None, 0.4, emit=((1.0, 0.55, 0.2), 0.9))   # (low: at 3 the back bar burned out white); bubble = mat_img('Dn_Bubble', None, 0.4, emit=((1.0, 0.45, 0.1), 3.5))
lampd = mat_img('Dn_LampWarm', None, 0.4, emit=((1.0, 0.72, 0.42), 6.0))
checker = art_mat('Dn_Checker', DN('checker'), dirt=0.04, rough=0.5)

# ---------------------------------------------------------------------------------------------------------------------
# the walls: a red wainscot to 1.1 m, a checker band and a chrome rail along its top, cream above (cards on each wall's
# face, the cafe's side of it). (x0, y0) -> (x1, y1) along the face, its outward normal
WALLF = [((-18.99, 7.62), (-18.99, 13.3), (1, 0)), ((-19.0, 7.61), (-10.0, 7.61), (0, 1)), ((-19.0, 13.99), (2.0, 13.99), (0, -1)), ((1.89, 7.6), (1.89, 14.0), (-1, 0))]
for k, ((ax, ay), (bx_, by), (nx, ny)) in enumerate(WALLF):
    L = math.hypot(bx_ - ax, by - ay); cx, cy_ = (ax + bx_) / 2, (ay + by) / 2; rz = math.atan2(-nx, ny) if (nx or ny) else 0.0
    rz = {(1, 0): D90, (-1, 0): -D90, (0, 1): math.pi, (0, -1): 0.0}[(nx, ny)]
    cd(f'Dn_Wall{k}_Wainscot', FD, L, 1.1, (cx, cy_, DZ), wains, rotz=rz)
    tiled_card(f'Dn_Wall{k}_Checker', FD, L, 0.12, (cx + nx * 0.004, cy_ + ny * 0.004, DZ + 0.98), checker, tile=0.24, rotz=rz)
    cd(f'Dn_Wall{k}_Upper', FD, L, 1.9, (cx, cy_, DZ + 1.1), cream, rotz=rz)
    a, b = Vector((ax + nx * 0.025, ay + ny * 0.025, DZ + 1.11)), Vector((bx_ + nx * 0.025, by + ny * 0.025, DZ + 1.11)); rd(f'Dn_Wall{k}_Rail', FD, a, b, 0.018, chrome, verts=8)

# ---------------------------------------------------------------------------------------------------------------------
# the counter: its red front with old tires set in it (sidewalls out), a chrome kick and foot rail, the cream formica top
# with its chrome edge; on it the till, the tip jar, the napkins and the sauces, two pie domes, a burger and a shake,
# the beer taps (gear-knob handles); seven stools in front
CX0, CX1, CY0, CYB = -18.2, -11.4, 11.75, 12.45
CW = CX1 - CX0; CXM = (CX0 + CX1) / 2
bbox('Dn_Counter_Body', FD, (CW, CYB - CY0 - 0.06, 0.98), (CXM, (CY0 + CYB) / 2 + 0.03, DZ + 0.49), lacg, bev=0.01)
bx('Dn_Counter_Front', FD, (CW, 0.03, 0.82), (CXM, CY0 + 0.015, DZ + 0.53), vinyl)
for k in range(9):
    x = CX0 + 0.42 + k * (CW - 0.84) / 8
    lathe(f'Dn_Counter_Tire{k}', FD, [(0.17, -0.06), (0.27, -0.06), (0.29, -0.04), (0.29, 0.04), (0.27, 0.06), (0.17, 0.06), (0.17, -0.06)], (x, CY0 - 0.03, DZ + 0.53), rubber, segs=14, rot=(D90, 0, 0))
    cy(f'Dn_Counter_TireHub{k}', FD, 0.17, 0.02, (x, CY0 - 0.01, DZ + 0.53), blk, rot=(D90, 0, 0), verts=12)
bx('Dn_Counter_Kick', FD, (CW, 0.035, 0.1), (CXM, CY0 - 0.005, DZ + 0.05), chrome)
bbox('Dn_Counter_Top', FD, (CW + 0.12, 0.84, 0.05), (CXM, (CY0 + CYB) / 2 - 0.03, DZ + 1.005), formica, bev=0.006)
for yy_ in (CY0 - 0.1, CYB + 0.06): bx(f'Dn_Counter_Edge{yy_:.1f}', FD, (CW + 0.13, 0.012, 0.055), (CXM, yy_ - 0.0, DZ + 1.005), chrome)
rd('Dn_Counter_FootRail', FD, (CX0 + 0.1, CY0 - 0.3, DZ + 0.22), (CX1 - 0.1, CY0 - 0.3, DZ + 0.22), 0.02, chrome, verts=8)
for k in range(5):
    x = CX0 + 0.3 + k * (CW - 0.6) / 4; rd(f'Dn_Counter_RailArm{k}', FD, (x, CY0 - 0.3, DZ + 0.22), (x, CY0, DZ + 0.22), 0.012, chrome, verts=6)
TOP = DZ + 1.03
def diner_stool(name, loc, h=0.76):
    lathe(f'{name}_Base', FD, [(0.0, 0.0), (0.21, 0.0), (0.21, 0.015), (0.06, 0.04), (0.035, 0.06), (0.0, 0.06)], loc, chrome, segs=12)
    rd(f'{name}_Post', FD, Vector(loc) + Vector((0, 0, 0.05)), Vector(loc) + Vector((0, 0, h - 0.06)), 0.03, chrome, verts=8)
    lathe(f'{name}_Ring', FD, [(0.15, 0.3), (0.165, 0.3), (0.165, 0.32), (0.15, 0.32)], loc, chrome, segs=12, cap0=False, cap1=False)
    lathe(f'{name}_SeatPan', FD, [(0.0, h - 0.06), (0.2, h - 0.05), (0.205, h - 0.02), (0.0, h - 0.02)], loc, chrome, segs=14)
    lathe(f'{name}_Seat', FD, [(0.0, h - 0.02), (0.2, h - 0.02), (0.205, h + 0.03), (0.17, h + 0.07), (0.0, h + 0.08)], loc, vinyl, segs=14)
for k in range(7): diner_stool(f'Dn_Stool{k}', (CX0 + 0.55 + k * (CW - 1.1) / 6, CY0 - 0.55, DZ))
# on the counter
bbox('Dn_Till', FD, (0.36, 0.3, 0.16), (CX1 - 0.4, 12.15, TOP + 0.08), col((0.6, 0.6, 0.58)), bev=0.02)
bbox('Dn_TillKeys', FD, (0.3, 0.14, 0.04), (CX1 - 0.4, 12.02, TOP + 0.17), blk, rot=(-0.4, 0, 0), bev=0.005)
bbox('Dn_TillHead', FD, (0.2, 0.06, 0.1), (CX1 - 0.4, 12.24, TOP + 0.21), col((0.6, 0.6, 0.58)), bev=0.01)
lathe('Dn_TipJar', FD, [(0.0, 0.0), (0.07, 0.0), (0.075, 0.18), (0.06, 0.2), (0.06, 0.22), (0.0, 0.22)], (CX1 - 0.95, 12.05, TOP), glassd, segs=12)
for k in range(7): cy(f'Dn_TipCoin{k}', FD, 0.012, 0.003, (CX1 - 0.95 + (k % 3 - 1) * 0.02, 12.05 + (k // 3 - 1) * 0.02, TOP + 0.004 + k * 0.004), col((0.8, 0.7, 0.3)), verts=8)
cd('Dn_TipLabel', FD, 0.12, 0.06, (CX1 - 0.95, 11.97, TOP + 0.07), rm_art('case', 0.05))
for k, x in enumerate((CX0 + 0.8, CX0 + 2.6, CX0 + 4.4)):
    bbox(f'Dn_Napkins{k}', FD, (0.12, 0.08, 0.14), (x, 12.15, TOP + 0.07), chrome, bev=0.01)
    lathe(f'Dn_Ketchup{k}', FD, [(0.0, 0.0), (0.03, 0.0), (0.032, 0.14), (0.012, 0.18), (0.0, 0.19)], (x + 0.12, 12.17, TOP), ketchup, segs=8)
    lathe(f'Dn_Mustard{k}', FD, [(0.0, 0.0), (0.03, 0.0), (0.032, 0.14), (0.012, 0.18), (0.0, 0.19)], (x + 0.2, 12.17, TOP), mustard, segs=8)
for k, x in enumerate((CX0 + 1.5, CX0 + 3.4)):
    lathe(f'Dn_PiePlate{k}', FD, [(0.0, 0.0), (0.17, 0.0), (0.17, 0.012), (0.0, 0.012)], (x, 12.12, TOP), chrome, segs=14)
    cy(f'Dn_Pie{k}', FD, 0.13, 0.05, (x, 12.12, TOP + 0.037), bun, verts=14)
    lathe(f'Dn_PieDome{k}', FD, [(0.16, 0.0), (0.16, 0.1), (0.1, 0.19), (0.0, 0.21)], (x, 12.12, TOP + 0.012), glassd, segs=14, cap0=False)
# a burger on its plate and a shake with its straw, where somebody's sat
lathe('Dn_Plate', FD, [(0.0, 0.0), (0.13, 0.0), (0.14, 0.015), (0.0, 0.012)], (CX0 + 2.0, CY0 + 0.12, TOP), mugw, segs=14)
for j, (r_, z_, m_) in enumerate(((0.06, 0.012, bun), (0.062, 0.035, patty), (0.06, 0.055, bun))): cy(f'Dn_Burger{j}', FD, r_, 0.022, (CX0 + 2.0, CY0 + 0.12, TOP + z_ + 0.01), m_, verts=12)
lathe('Dn_ShakeGlass', FD, [(0.0, 0.0), (0.04, 0.0), (0.025, 0.04), (0.045, 0.2), (0.0, 0.2)], (CX0 + 2.35, CY0 + 0.15, TOP), glassd, segs=12)
cy('Dn_Shake', FD, 0.04, 0.12, (CX0 + 2.35, CY0 + 0.15, TOP + 0.13), shake, verts=12)
rd('Dn_Straw', FD, (CX0 + 2.35, CY0 + 0.15, TOP + 0.12), (CX0 + 2.38, CY0 + 0.13, TOP + 0.3), 0.004, redp, verts=4)
# the beer taps: the chrome tower, three taps, each a gear knob on its handle (the shift pattern on top), the drip tray
TX = CX1 - 1.9
rd('Dn_TapTower', FD, (TX, 12.25, TOP), (TX, 12.25, TOP + 0.42), 0.035, chrome, verts=10)
rd('Dn_TapBar', FD, (TX - 0.28, 12.25, TOP + 0.4), (TX + 0.28, 12.25, TOP + 0.4), 0.03, chrome, verts=10)
for k, dx in enumerate((-0.22, 0.0, 0.22)):
    rd(f'Dn_Tap{k}_Spout', FD, (TX + dx, 12.25, TOP + 0.39), (TX + dx, 12.12, TOP + 0.32), 0.012, chrome, verts=6)
    rd(f'Dn_Tap{k}_Handle', FD, (TX + dx, 12.2, TOP + 0.42), (TX + dx, 12.16, TOP + 0.6), 0.012, blk, verts=6)
    lathe(f'Dn_Tap{k}_Knob', FD, [(0.0, -0.03), (0.025, -0.028), (0.034, 0.0), (0.025, 0.028), (0.0, 0.03)], (TX + dx, 12.16, TOP + 0.63), (blk, silver, redp)[k], segs=10)
bx('Dn_TapDrip', FD, (0.62, 0.14, 0.02), (TX, 12.1, TOP + 0.01), chrome)
# the pendants over the counter: red enamel shades, warm
for k in range(4):
    x = CX0 + 1.0 + k * (CW - 2.0) / 3
    rd(f'Dn_Pendant{k}_Drop', FD, (x, 12.05, DZ + 3.0), (x, 12.05, DZ + 2.45), 0.005, blk, verts=4)
    lathe(f'Dn_Pendant{k}_Shade', FD, [(0.02, 0.2), (0.05, 0.18), (0.09, 0.08), (0.2, 0.0), (0.195, -0.005), (0.085, 0.07), (0.045, 0.17)], (x, 12.05, DZ + 2.25), vinyl, segs=14, cap0=False, cap1=False)
    cy(f'Dn_Pendant{k}_Lamp', FD, 0.06, 0.01, (x, 12.05, DZ + 2.31), lampd, verts=10)

# ---------------------------------------------------------------------------------------------------------------------
# the booths along the glass: red seats with white piping, high backs, a cream table on a wheel-rim pedestal; on each
# table the napkins, the sauces, a menu card. People sit in them (STAND sit_idle)
def booth(name, cx):
    for s in (-1, 1):
        x = cx + s * 0.85
        bbox(f'{name}_Seat{s}', FD, (0.5, 1.3, 0.12), (x, 8.3, DZ + 0.4), vinyl, bev=0.03)
        bbox(f'{name}_SeatBase{s}', FD, (0.46, 1.26, 0.34), (x, 8.3, DZ + 0.17), lacg, bev=0.01)
        bbox(f'{name}_Back{s}', FD, (0.14, 1.3, 0.72), (x + s * 0.2, 8.3, DZ + 0.82), vinyl, rot=(0, s * -0.08, 0), bev=0.04)
        bx(f'{name}_Piping{s}', FD, (0.16, 1.32, 0.03), (x + s * 0.21, 8.3, DZ + 1.19), vinylw)
        bx(f'{name}_Kick{s}', FD, (0.47, 0.02, 0.1), (x, 8.3 + 0.64, DZ + 0.05), chrome)
    lathe(f'{name}_Rim', FD, [(0.0, 0.06), (0.22, 0.05), (0.22, -0.05), (0.0, -0.03)], (cx, 8.25, DZ + 0.06), silver, segs=14)
    rd(f'{name}_Post', FD, (cx, 8.25, DZ + 0.1), (cx, 8.25, DZ + 0.72), 0.04, chrome, verts=8)
    bbox(f'{name}_Top', FD, (0.78, 1.2, 0.04), (cx, 8.25, DZ + 0.74), formica, bev=0.008)
    bx(f'{name}_TopEdge', FD, (0.8, 1.22, 0.02), (cx, 8.25, DZ + 0.715), chrome)
    bbox(f'{name}_Napkins', FD, (0.1, 0.07, 0.12), (cx, 7.8, DZ + 0.82), chrome, bev=0.01)
    lathe(f'{name}_Ketchup', FD, [(0.0, 0.0), (0.028, 0.0), (0.03, 0.13), (0.011, 0.17), (0.0, 0.18)], (cx + 0.1, 7.8, DZ + 0.76), ketchup, segs=8)
    cd(f'{name}_Menu', FD, 0.16, 0.24, (cx - 0.12, 8.5, DZ + 0.765), rm_art('menu', 0.03), tilt=-D90)
for k, cx in enumerate((-6.0, -3.2, -0.4)): booth(f'Dn_Booth{k}', cx)

# ---------------------------------------------------------------------------------------------------------------------
# the walls' stuff
# the TV up in the corner on its bracket, a race on (Wall_L), the wall of shame under it, the caps on their pegs above
TVP = (-18.62, 8.6, DZ + 2.15)
bbox('Dn_TV_Body', FD, (0.62, 0.5, 0.48), TVP, col((0.12, 0.12, 0.13)), rot=(0, 0, D90 - 0.35), bev=0.03)   # (an old CRT, deep)
TVR = D90 - 0.35; TVF = (math.sin(TVR), -math.cos(TVR))   # (it faces out into the room, turned a little toward the door)
cd('Dn_TV_Screen', FD, 0.48, 0.36, (TVP[0] + TVF[0] * 0.26, TVP[1] + TVF[1] * 0.26, TVP[2] - 0.18), art_mat('Dn_TV', DN('tv'), dirt=0.0, emit=1.0), rotz=TVR)
bx('Dn_TV_Shelf', FD, (0.5, 0.56, 0.03), (TVP[0], TVP[1], TVP[2] - 0.255), blk)
for s in (-1, 1): rd(f'Dn_TV_Arm{s}', FD, (-18.98, TVP[1] + s * 0.2, TVP[2] - 0.25), (TVP[0] + 0.2, TVP[1] + s * 0.2, TVP[2] - 0.27), 0.012, blk, verts=4)
for k in range(8):
    y = 9.9 + (k % 4) * 0.62; z = DZ + 1.75 - (k // 4) * 0.5 + ((k * 37) % 5 - 2) * 0.02
    cd(f'Dn_Shame{k}', FD, 0.3, 0.34, (-18.975, y, z - 0.17), art_mat(f'Dn_Shame{k}', DN(f'shame{k}'), dirt=0.06), rotz=D90 + ((k * 13) % 5 - 2) * 0.03)
CAPS = [(0.78, 0.08, 0.06), (0.05, 0.05, 0.06), (0.1, 0.3, 0.7), (0.1, 0.5, 0.25), (0.95, 0.75, 0.1), (0.94, 0.94, 0.92)]
for k, c in enumerate(CAPS):
    y = 9.9 + k * 0.45; z = DZ + 2.55
    rd(f'Dn_CapPeg{k}', FD, (-18.99, y, z + 0.1), (-18.88, y, z + 0.1), 0.008, chrome, verts=4)
    lathe(f'Dn_Cap{k}_Crown', FD, [(0.0, 0.0), (0.09, 0.0), (0.085, 0.05), (0.05, 0.09), (0.0, 0.1)], (-18.9, y, z), col(c), segs=10, rot=(0, -0.3, 0))
    bbox(f'Dn_Cap{k}_Bill', FD, (0.12, 0.15, 0.012), (-18.79, y, z + 0.005), col(c), rot=(0, -0.3, 0), bev=0.004)
# the signed helmets on a shelf (Cafe_Front_L, the cafe's side), the posters beside them, the Volta Cola neon over them
bx('Dn_HelmetShelf', FD, (3.4, 0.3, 0.03), (-16.6, 7.76, DZ + 1.55), wood)
for k, x in enumerate((-17.8, -16.6, -15.4)):
    bx(f'Dn_HelmetShelfBracket{k}', FD, (0.03, 0.26, 0.12), (x, 7.75, DZ + 1.48), chrome)
HEL = [((0.94, 0.94, 0.92), (0.78, 0.08, 0.06)), ((0.95, 0.75, 0.1), (0.05, 0.05, 0.06)), ((0.1, 0.3, 0.7), (0.94, 0.94, 0.92))]
for k, (base, stripe) in enumerate(HEL):
    x = -17.7 + k * 1.1; z = DZ + 1.565
    lathe(f'Dn_Helmet{k}_Shell', FD, [(0.0, 0.0), (0.13, 0.0), (0.15, 0.06), (0.15, 0.16), (0.12, 0.25), (0.06, 0.29), (0.0, 0.3)], (x, 7.78, z), col(base), segs=14)
    lathe(f'Dn_Helmet{k}_Stripe', FD, [(0.152, 0.11), (0.152, 0.15)], (x, 7.78, z), col(stripe), segs=14, cap0=False, cap1=False)
    bbox(f'Dn_Helmet{k}_Visor', FD, (0.2, 0.06, 0.08), (x, 7.92, z + 0.14), col((0.04, 0.05, 0.08)), bev=0.02)
    bbox(f'Dn_Helmet{k}_Chin', FD, (0.18, 0.05, 0.05), (x, 7.91, z + 0.04), col(base), bev=0.015)
    lathe(f'Dn_Helmet{k}_Stand', FD, [(0.0, -0.015), (0.08, -0.015), (0.08, 0.0), (0.0, 0.0)], (x, 7.78, z), blk, segs=10)
cd('Dn_Neon_Volta', FD, 1.5, 0.4, (-16.6, 7.63, DZ + 2.25), art_cutout('Dn_Neon_Volta', DN('neon_volta'), emit=4.0), rotz=math.pi)
for k, x in enumerate((-13.6, -11.4)):
    bbox(f'Dn_Poster{k}_Frame', FD, (0.66, 0.03, 0.96), (x, 7.625, DZ + 1.7), blk, bev=0.005)
    cd(f'Dn_Poster{k}', FD, 0.6, 0.9, (x, 7.645, DZ + 1.25), art_mat(f'Dn_Poster{k}', DN(f'poster{k}'), dirt=0.05), rotz=math.pi)
# the far wall (Sim_Side, the cafe's side): two more posters, the Burger Duck neon, the jukebox in the corner
for k, y in enumerate((8.6, 9.8, 11.0)):
    bbox(f'Dn_Poster{k + 2}_Frame', FD, (0.03, 0.66, 0.96), (1.875, y, DZ + 1.7), blk, bev=0.005)
    cd(f'Dn_Poster{k + 2}', FD, 0.6, 0.9, (1.855, y, DZ + 1.25), art_mat(f'Dn_Poster{k + 2}', DN(f'poster{k + 2}'), dirt=0.05), rotz=-D90)
cd('Dn_Neon_Duck', FD, 1.4, 0.34, (1.86, 12.1, DZ + 2.3), art_cutout('Dn_Neon_Duck', DN('neon_duck'), emit=4.0), rotz=-D90)
def jukebox(name, loc, rotz):
    P, r = T(loc, rotz); w, d = 0.86, 0.6
    bbox(f'{name}_Cabinet', FD, (w, d, 0.95), P(0, 0, 0.475), wood, rot=r, bev=0.02)
    cy(f'{name}_Arch', FD, w / 2, d, P(0, 0, 0.95), wood, rot=(D90, 0, rotz), verts=20)
    cy(f'{name}_ArchFace', FD, w / 2 - 0.07, 0.01, P(0, -d / 2 - 0.006, 0.95), col((0.12, 0.08, 0.06)), rot=(D90, 0, rotz), verts=20)
    sweep(f'{name}_Bubble', FD, [P(-w / 2 + 0.03, -d / 2 - 0.02, 0.15)] + [P(math.cos(a) * (w / 2 - 0.03), -d / 2 - 0.02, 0.95 + math.sin(a) * (w / 2 - 0.03)) for a in np.linspace(math.pi, 0, 9)] + [P(w / 2 - 0.03, -d / 2 - 0.02, 0.15)],
          0.022, bubble, segs=6, per_m=14)
    bx(f'{name}_Window', FD, (w - 0.2, 0.01, 0.22), P(0, -d / 2 - 0.006, 0.86), amber, rot=r)
    for k in range(7): bx(f'{name}_Grille{k}', FD, (w - 0.24, 0.012, 0.016), P(0, -d / 2 - 0.008, 0.25 + k * 0.05), chrome, rot=r)
    bbox(f'{name}_Buttons', FD, (w - 0.26, 0.04, 0.06), P(0, -d / 2 - 0.02, 0.66), chrome, rot=r, bev=0.008)
    for k in range(8): bx(f'{name}_Key{k}', FD, (0.04, 0.012, 0.025), P(-0.24 + k * 0.069, -d / 2 - 0.045, 0.67), (vinylw, redp)[k % 2], rot=r)
jukebox('Dn_Jukebox', (1.5, 13.25, DZ), -D90)
# the back wall: the diner's name in neon, the back bar's shelves (bottles lit from behind), the old nose cone and its
# wing on a plaque, the menu board's new menu (rooms.py's frame)
cd('Dn_Neon_Name', FD, 2.8, 0.875, (-9.4, 13.955, DZ + 1.8), art_cutout('Dn_Neon_Name', DN('neon_name'), emit=4.0))
bx('Dn_NeonBack', FD, (3.0, 0.02, 1.0), (-9.4, 13.975, DZ + 2.24), col((0.06, 0.06, 0.07)))
bx('Dn_BackBar_Glow', FD, (1.9, 0.02, 0.9), (-11.25, 13.975, DZ + 1.6), amber)
for k, z in enumerate((DZ + 1.25, DZ + 1.7)):
    bx(f'Dn_BackBar_Shelf{k}', FD, (1.9, 0.22, 0.02), (-11.25, 13.86, z), glassd)
    for b in range(9): cy(f'Dn_BackBar_Bottle{k}{b}', FD, 0.035, 0.28, (-12.05 + b * 0.2, 13.86, z + 0.15), col(((0.35, 0.2, 0.05), (0.1, 0.35, 0.15), (0.7, 0.7, 0.72), (0.5, 0.12, 0.05))[(b + k) % 4]), verts=8)
bbox('Dn_Nose_Plaque', FD, (0.7, 0.04, 0.5), (-6.0, 13.97, DZ + 1.75), wood, bev=0.01)
o_ = lathe('Dn_Nose', FD, [(0.26, 0.0), (0.22, 0.35), (0.15, 0.8), (0.07, 1.1), (0.0, 1.15)], (-6.0, 13.95, DZ + 1.75), redp, segs=12, rot=(D90, 0, 0)); o_.scale = (1.0, 0.55, 1.0)
lathe('Dn_NoseStripe', FD, [(0.183, 0.6), (0.165, 0.7)], (-6.0, 13.95, DZ + 1.75), vinylw, segs=12, rot=(D90, 0, 0), cap0=False, cap1=False).scale = (1.0, 0.55, 1.0)
bbox('Dn_NoseWing', FD, (1.5, 0.32, 0.03), (-6.0, 13.05, DZ + 1.6), carbon, rot=(-0.08, 0, 0), bev=0.006)   # (its front wing, under the tip on its pylons)
for s in (-1, 1):
    bbox(f'Dn_NoseWingPlate{s}', FD, (0.018, 0.4, 0.22), (-6.0 + s * 0.76, 13.07, DZ + 1.67), redp, bev=0.005)
    bx(f'Dn_NosePylon{s}', FD, (0.02, 0.16, 0.1), (-6.0 + s * 0.08, 13.05, DZ + 1.665), carbon)
for o in [o for o in bpy.data.objects if o.name == 'Fr_Cafe_Menu']:
    o.data.materials[0] = art_mat('Dn_Menu', DN('menu'), dirt=0.03)
cd('Dn_Neon_Open', FD, 0.9, 0.345, (-9.7, 7.6, DZ + 1.3), art_cutout('Dn_Neon_Open', DN('neon_open'), emit=4.0))
# the pennants across the ceiling: two lines of them, sagging, red / white / black / yellow
PEN = [vinyl, vinylw, blk, mustard]
for row, y in enumerate((9.3, 10.9)):
    xs = np.linspace(-18.95, 1.85, 41); sag = lambda x: DZ + 2.85 - 0.25 * (1 - ((x - (-8.55)) / 10.4) ** 2)
    sweep(f'Dn_PennantLine{row}', FD, [(x, y, sag(x)) for x in xs[::5]], 0.003, blk, segs=3, per_m=3)
    for k, x in enumerate(xs[1:-1]):
        me = bpy.data.meshes.new(f'Dn_Pennant{row}_{k}'); z0 = sag(x)
        me.from_pydata([(x - 0.13, y, z0), (x + 0.13, y, z0), (x, y, z0 - 0.3)], [], [(0, 1, 2)]); uv = me.uv_layers.new()
        o = bpy.data.objects.new(me.name, me); FD.objects.link(o); me.materials.append(PEN[(k + row) % 4]); mk(o)
        o2 = o.copy(); o2.data = me.copy(); o2.data.flip_normals(); FD.objects.link(o2); mk(o2)   # (both sides: they're seen from under, from either way)

# ---------------------------------------------------------------------------------------------------------------------
# the floor: black and white checks (0.3 m), the grout, worn dull on the ways in (the door to the counter, the booths,
# behind the counter), scuffed under the stools, the shadow under what stands on it, pools of warm light
_t0 = time.time()
DPPM = 40; DX0, DX1, DY0, DY1 = X0, 2.0, CY1, Y1
dw, dh = int((DX1 - DX0) * DPPM), int((DY1 - DY0) * DPPM)
yy, xx = np.mgrid[0:dh, 0:dw].astype(np.float32); dx_, dy_ = xx / DPPM + DX0 + 0.5 / DPPM, yy / DPPM + DY0 + 0.5 / DPPM
chk = ((np.floor(dx_ / 0.3) + np.floor(dy_ / 0.3)) % 2).astype(bool)
dcol = np.where(chk[..., None], np.array([0.86, 0.85, 0.8], np.float32), np.array([0.07, 0.07, 0.08], np.float32))
dcol *= (1 + (np.random.default_rng(3).random((dh, dw)) - 0.5)[..., None] * 0.06)
grout = (np.minimum(np.mod(dx_, 0.3), 0.3 - np.mod(dx_, 0.3)) < 0.01) | (np.minimum(np.mod(dy_, 0.3), 0.3 - np.mod(dy_, 0.3)) < 0.01)
dcol = np.where(grout[..., None], np.array([0.4, 0.39, 0.36], np.float32), dcol)
def dseg(a, b):
    ax, ay = a; bx2, by2 = b; ex, ey = bx2 - ax, by2 - ay; L2 = max(ex * ex + ey * ey, 1e-6)
    t = np.clip(((dx_ - ax) * ex + (dy_ - ay) * ey) / L2, 0, 1); return np.hypot(dx_ - ax - t * ex, dy_ - ay - t * ey)
dwear = np.zeros((dh, dw), np.float32)
for pts, w, k in (([(-8.4, 7.5), (-9.5, 9.5), (-12.0, 10.9), (-17.5, 11.0)], 1.2, 0.22), ([(-8.4, 7.5), (-7.4, 8.9), (1.0, 9.1)], 1.0, 0.2),
                  ([(CX1 + 0.3, 11.0), (CX1 + 0.3, 12.9), (CX0 + 0.3, 12.9)], 0.8, 0.24), ([(-9.0, 11.5), (-9.2, 13.3)], 0.8, 0.14), ([(-2.0, 9.3), (1.2, 12.8)], 0.8, 0.14)):
    d = np.full((dh, dw), 99.0, np.float32)
    for a, b in zip(pts, pts[1:]): d = np.minimum(d, dseg(a, b))
    dwear = np.maximum(dwear, k * np.clip(1 - d / (w / 2), 0, 1) ** 0.8)
scuffs = np.zeros((dh, dw), np.float32)
for k in range(7):
    sx = CX0 + 0.55 + k * (CW - 1.1) / 6; scuffs = np.maximum(scuffs, np.clip(1 - np.hypot(dx_ - sx, dy_ - (CY0 - 0.55)) / 0.45, 0, 1) ** 1.2 * 0.3)
dwear = np.maximum(dwear, scuffs) * (vnoise(dh, dw, 10) * 0.6 + 0.4)
dfoot = np.zeros((dh, dw), np.float32)
bpy.context.view_layer.update()
for o in shell.all_objects:
    if o.type != 'MESH' or o.name.startswith(SKIPN) or any(m and m.surface_render_method == 'BLENDED' for m in o.data.materials): continue
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]; z0, z1 = min(c.z for c in cs), max(c.z for c in cs)
    if not (DZ - 0.02 < z0 < DZ + 0.12) or z1 - z0 < 0.025: continue
    i0, i1 = max(0, int((min(c.x for c in cs) - DX0) * DPPM)), min(dw, int((max(c.x for c in cs) - DX0) * DPPM) + 1)
    j0, j1 = max(0, int((min(c.y for c in cs) - DY0) * DPPM)), min(dh, int((max(c.y for c in cs) - DY0) * DPPM) + 1)
    if i1 > i0 and j1 > j0: dfoot[j0:j1, i0:i1] = np.maximum(dfoot[j0:j1, i0:i1], float(np.clip((z1 - z0) / 0.6, 0.35, 1.0)))
dshade = np.clip(blur(dfoot, 4) * 0.22 + blur(dfoot, 12) * 0.2, 0, 0.32)
dpool = np.zeros((dh, dw), np.float32)
for (px_, py_), r_ in [((CX0 + 1.0 + k * (CW - 2.0) / 3, 12.05), 1.6) for k in range(4)] + [((-3.2, 8.6), 3.0)]:
    dpool = np.maximum(dpool, np.clip(1 - np.hypot(dx_ - px_, dy_ - py_) / r_, 0, 1) ** 1.5)
edge_ = np.minimum.reduce([dx_ - DX0, DX1 - dx_, dy_ - DY0, DY1 - dy_]); dirt_ = np.clip(1 - edge_ / 0.5, 0, 1) ** 1.6 * 0.25
dcol = grime(dcol, dirt_); dcol = np.where(chk[..., None], grime(dcol, dwear * 0.9), dcol * (1 + dwear * 0.8)[..., None])   # (the white checks go dull, the black ones scuffed lighter)
dcol *= (1 - dshade)[..., None]; dcol = dcol * (0.9 + dpool * 0.18)[..., None]
dcol = dcol * (1 - dpool[..., None] * 0.4) + dcol * np.array([1.1, 0.98, 0.82], np.float32) * dpool[..., None] * 0.4
dmat = mat_img('Dn_FloorCheck', save('dn_floor_check', np.clip(dcol, 0, 1)), 0.3)
for o in list(B.objects):
    if o.name != 'WALK_Up_Cafe' or o.type != 'MESH': continue
    me = o.data; me.materials.clear(); me.materials.append(dmat); uv = me.uv_layers[0]
    for poly_ in me.polygons:
        for li in poly_.loop_indices:
            v = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co; uv.data[li].uv = ((v.x - DX0) / (DX1 - DX0), (v.y - DY0) / (DY1 - DY0))
print(f'diner: the floor ({dw}x{dh}) in {time.time() - _t0:.0f} s')

# ---------------------------------------------------------------------------------------------------------------------
# the light: warm and low. The room's bulb amber and over the booths, one over the counter; the neon and the jukebox
# glow by themselves
L = bpy.data.objects.get('Light_Room_4')
if L: L.location = (-3.2, 9.4, DZ + 2.6); L.data.energy = 420; L.data.color = (1.0, 0.7, 0.42)
bulb('Light_Diner_Counter', lights, (CXM, 11.6, DZ + 2.2), 380, (1.0, 0.74, 0.48))
# the people: one sat in a booth, one leaning on the counter (rooms.py's two, moved here)
stand(23, (-3.2 - 0.85, 8.4, DZ), D90, 'sit_idle'); stand(24, (CX1 - 1.4, CY0 - 0.5, DZ), math.pi, 'lean')
