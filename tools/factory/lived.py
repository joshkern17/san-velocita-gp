# tools/factory/lived.py: run inside tools/garage-factory.py after rooms.py and boulevard.py (exec'd with their globals:
# the plan's numbers, dress, lights, garagelib's helpers, rooms.py's finishes and builders).
# The factory, lived in (Oct 2026: "the workshop is cooler, there's more texture, more to look at"). Clean but used, not
# a showroom: work going on round the cars (a parts trolley, drip trays, wheels on a dolly, a gearbox on its cradle, a
# front wing on padded stands, a tire warmer trolley, a delivery not unpacked yet, somebody's coffee), a warm task light
# over the bench, and one ground floor texture, world-wide (as the workshop's): each area's finish, the paths everyone
# walks worn in, rubber where the cars roll, drips, scuffed doorways, the pours' saw cuts, the bays' paint, the light
# pools, and the shadow under everything that stands on it (the floors are too few vertices for the AO bake).
FL = dress
_fl_arts = {}
def rm_art(png, dirt=0.06):   # (rooms.py's printed art: its art() is boulevard.py's by now)
    if png not in _fl_arts: _fl_arts[png] = art_mat(f'Fl_Art_{png}', os.path.join(SRC, 'factory_art', 'rooms', 'fa_rm_' + png + '.png'), dirt=dirt)
    return _fl_arts[png]
carbon = plain_mat('Fl_Carbon', (0.07, 0.07, 0.08), dirt=0.02, fleck=0.12, rough=0.3)
foam = plain_mat('Fl_Foam', (0.22, 0.24, 0.28), dirt=0.05, fleck=0.1, rough=0.95)
gcase = plain_mat('Fl_Gearcase', (0.38, 0.39, 0.4), dirt=0.1, fleck=0.06, rough=0.35)   # (machined: titanium grey)
card_m = plain_mat('Fl_Cardboard', (0.62, 0.48, 0.3), dirt=0.08, fleck=0.1, rough=0.95)
tape = plain_mat('Fl_Tape', (0.78, 0.64, 0.38), dirt=0.03, rough=0.4)
oil_m = plain_mat('Fl_Oil', (0.025, 0.025, 0.02), dirt=0.0, fleck=0.02, rough=0.08)
rag_m = plain_mat('Fl_Rag', (0.55, 0.12, 0.09), dirt=0.2, fleck=0.12, rough=0.95)
gold = plain_mat('Fl_Caliper', (0.62, 0.48, 0.16), dirt=0.06, rough=0.35)
binm = plain_mat('Fl_PartsBin', (0.16, 0.32, 0.6), dirt=0.06, rough=0.5)
mugw = plain_mat('Fl_Mug', (0.9, 0.9, 0.88), dirt=0.03, rough=0.3)
coffee = plain_mat('Fl_Coffee', (0.12, 0.07, 0.04), dirt=0.0, rough=0.1)
enamel = plain_mat('Fl_Enamel', (0.1, 0.11, 0.12), dirt=0.05, rough=0.4)
lampw = mat_img('Fl_LampWarm', None, 0.4, emit=((1.0, 0.78, 0.52), 6.0))

def castor(name, P, r, x, y, rotz, h=0.11):
    # a swivel castor: its plate, the fork, the wheel on its axle
    bx(f'{name}_Plate', FL, (0.06, 0.06, 0.008), P(x, y, h), steel, rot=r)
    bx(f'{name}_Fork', FL, (0.035, 0.045, h - 0.05), P(x, y, h - (h - 0.05) / 2), steel, rot=r)
    cy(f'{name}_Wheel', FL, 0.045, 0.028, P(x, y, 0.045), rubber, rot=(0, D90, rotz), verts=10)

def tray(name, P, r, w, d, z, h, mat):
    # a pressed tray: its floor and four lips (8 mm: thin enough to look pressed, thick enough to stand on)
    bx(f'{name}_Floor', FL, (w, d, 0.012), P(0, 0, z), mat, rot=r)
    for s in (-1, 1):
        bx(f'{name}_LipX{s}', FL, (w, 0.008, h), P(0, s * (d / 2 - 0.004), z + h / 2), mat, rot=r)
        bx(f'{name}_LipY{s}', FL, (0.008, d, h), P(s * (w / 2 - 0.004), 0, z + h / 2), mat, rot=r)

# ---------------------------------------------------------------------------------------------------------------------
# a parts trolley between the cars: two trays on chrome posts, castors, the push handle; on top a brake disc, its
# caliper, the wheel nuts, a torque wrench and a rag; underneath, the parts bins
def parts_trolley(name, loc, rotz):
    P, r = T(loc, rotz); w, d = 0.9, 0.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            castor(f'{name}_Castor{sx}{sy}', P, r, sx * 0.39, sy * 0.19, rotz)
            rd(f'{name}_Post{sx}{sy}', FL, P(sx * 0.43, sy * 0.23, 0.11), P(sx * 0.43, sy * 0.23, 0.86), 0.012, chrome, verts=6)
    for k, z in enumerate((0.24, 0.82)): tray(f'{name}_Tray{k}', P, r, w, d, z, 0.045, steel)
    for sy in (-1, 1): rd(f'{name}_HandleArm{sy}', FL, P(0.43, sy * 0.2, 0.85), P(0.53, sy * 0.2, 1.0), 0.012, chrome, verts=6)
    rd(f'{name}_Handle', FL, P(0.53, -0.22, 1.0), P(0.53, 0.22, 1.0), 0.018, blk, verts=8)
    top = 0.826
    lathe(f'{name}_Disc', FL, [(0.09, 0.0), (0.139, 0.0), (0.139, 0.032), (0.09, 0.032), (0.09, 0.0)], P(-0.2, 0.02, top), carbon, segs=16, cap0=False, cap1=False)
    lathe(f'{name}_DiscBell', FL, [(0.0, 0.012), (0.095, 0.012), (0.095, 0.05), (0.06, 0.055), (0.0, 0.055)], P(-0.2, 0.02, top), silver, segs=14)
    bbox(f'{name}_Caliper', FL, (0.2, 0.07, 0.09), P(0.08, 0.12, top + 0.045), gold, rot=(0, 0, rotz + 0.25), bev=0.015)
    for k in range(2): cy(f'{name}_CaliperBolt{k}', FL, 0.012, 0.012, P(0.02 + k * 0.12, 0.085, top + 0.09), silver, rot=(0, 0, rotz), verts=6)
    for k in range(4): cy(f'{name}_Nut{k}', FL, 0.032, 0.036, P(0.12 + (k % 2) * 0.075, -0.12 - (k // 2) * 0.07, top + 0.018), silver, rot=(0, 0, rotz + k * 0.3), verts=6)
    rd(f'{name}_Wrench', FL, P(-0.32, -0.17, top + 0.016), P(0.3, -0.09, top + 0.016), 0.011, chrome, verts=6)
    bbox(f'{name}_WrenchHead', FL, (0.06, 0.04, 0.028), P(-0.34, -0.172, top + 0.016), blk, rot=(0, 0, rotz + 0.13), bev=0.006)
    rd(f'{name}_WrenchGrip', FL, P(0.18, -0.105, top + 0.016), P(0.33, -0.085, top + 0.016), 0.017, blk, verts=8)
    bbox(f'{name}_Rag', FL, (0.2, 0.15, 0.012), P(0.3, 0.12, top + 0.006), rag_m, rot=(0.02, 0, rotz + 0.5), bev=0.005)
    for k, x in enumerate((-0.22, 0.18)):
        bbox(f'{name}_Bin{k}', FL, (0.34, 0.3, 0.14), P(x, 0, 0.246 + 0.07), binm, bev=0.01, rot=r)
        cd(f'{name}_BinLabel{k}', FL, 0.12, 0.05, P(x, -0.152, 0.33), rm_art('case', 0.08), rotz=rotz)

# a drip tray under a car's gearbox: pressed steel, oil in the bottom
def drip_tray(name, loc, rotz):
    P, r = T(loc, rotz); tray(name, P, r, 0.8, 0.5, 0.006, 0.04, steel)
    bx(f'{name}_Oil', FL, (0.6, 0.32, 0.003), P(0.04, -0.02, 0.0135), oil_m, rot=(0, 0, rotz + 0.1))

# a wheel dolly: a square frame on four castors, two wheels stacked flat on it
def wheel_dolly(name, loc, rotz):
    P, r = T(loc, rotz)
    for s in (-1, 1):
        bx(f'{name}_RailX{s}', FL, (0.72, 0.04, 0.04), P(0, s * 0.34, 0.12), redp, rot=r)
        bx(f'{name}_RailY{s}', FL, (0.04, 0.72, 0.04), P(s * 0.34, 0, 0.12), redp, rot=r)
        for t in (-1, 1): castor(f'{name}_Castor{s}{t}', P, r, s * 0.32, t * 0.32, rotz, h=0.1)
    bx(f'{name}_Deck', FL, (0.66, 0.66, 0.012), P(0, 0, 0.146), steel, rot=r)
    for k in range(2): wheel(f'{name}_Wheel{k}', P(0.01 * k, -0.015 * k, 0.152 + 0.13 + k * 0.262), (0, 0, rotz + k * 0.6))

# a gearbox on its cradle: the stand (runners, castors, uprights, saddles with rubber pads); the case (ribbed, machined),
# its bellhousing flange forward, the rear cover, the output flanges, the suspension pickups, the shift actuator and its
# hydraulic lines, a rag over the top
def gearbox_cradle(name, loc, rotz):
    P, r = T(loc, rotz)
    for s in (-1, 1):
        bx(f'{name}_Runner{s}', FL, (0.07, 0.9, 0.06), P(s * 0.3, 0, 0.13), steel, rot=r)
        bx(f'{name}_Cross{s}', FL, (0.6, 0.06, 0.06), P(0, s * 0.4, 0.13), steel, rot=r)
        for t in (-1, 1): castor(f'{name}_Castor{s}{t}', P, r, s * 0.3, t * 0.4, rotz, h=0.1)
        bx(f'{name}_Upright{s}', FL, (0.06, 0.06, 0.5), P(s * 0.3, 0.0, 0.41), steel, rot=r)
        bx(f'{name}_Saddle{s}', FL, (0.12, 0.28, 0.05), P(s * 0.24, 0.0, 0.68), steel, rot=r)
        bx(f'{name}_Pad{s}', FL, (0.11, 0.26, 0.02), P(s * 0.22, 0.0, 0.715), rubber, rot=r)
    z = 0.855
    bbox(f'{name}_Case', FL, (0.3, 0.64, 0.26), P(0, 0, z), gcase, rot=r, bev=0.03)
    for k in range(5): bbox(f'{name}_Rib{k}', FL, (0.322, 0.014, 0.21), P(0, -0.24 + k * 0.12, z - 0.01), gcase, rot=r, bev=0.004)
    cy(f'{name}_Flange', FL, 0.2, 0.03, P(0, -0.335, z), silver, rot=(D90, 0, rotz), verts=16)
    for k in range(8):
        a = k / 8 * math.tau; cy(f'{name}_FlangeBolt{k}', FL, 0.01, 0.02, P(math.cos(a) * 0.17, -0.355, z + math.sin(a) * 0.17), blk, rot=(D90, 0, rotz), verts=6)
    cy(f'{name}_Spigot', FL, 0.07, 0.06, P(0, -0.38, z), gcase, rot=(D90, 0, rotz), verts=12)
    bbox(f'{name}_RearCover', FL, (0.24, 0.06, 0.2), P(0, 0.35, z - 0.01), silver, rot=r, bev=0.01)
    for s in (-1, 1):
        cy(f'{name}_Output{s}', FL, 0.065, 0.05, P(s * 0.175, 0.12, z - 0.03), silver, rot=(0, D90, rotz), verts=12)
        cy(f'{name}_OutputCup{s}', FL, 0.045, 0.06, P(s * 0.23, 0.12, z - 0.03), blk, rot=(0, D90, rotz), verts=10)
        for t in (-1, 1): bx(f'{name}_Pickup{s}{t}', FL, (0.04, 0.05, 0.07), P(s * 0.14, t * 0.2 + 0.06, z + 0.16), silver, rot=r)
    cy(f'{name}_Actuator', FL, 0.03, 0.17, P(0.07, -0.05, z + 0.16), silver, rot=(D90, 0, rotz), verts=10)
    bbox(f'{name}_Valve', FL, (0.1, 0.08, 0.06), P(-0.06, 0.06, z + 0.16), blk, rot=r, bev=0.01)
    for k, (a_, b_) in enumerate(((P(0.07, 0.04, z + 0.16), P(-0.04, 0.06, z + 0.19)), (P(0.07, -0.13, z + 0.16), P(-0.08, 0.04, z + 0.19)))):
        mid = (a_ + b_) / 2 + Vector((0, 0, 0.05)); sweep(f'{name}_Line{k}', FL, [a_, mid, b_], 0.006, blk, segs=4, per_m=24)
    bbox(f'{name}_Rag', FL, (0.16, 0.2, 0.008), P(-0.05, 0.24, z + 0.134), rag_m, rot=(0, 0, rotz + 0.3), bev=0.003)

# a front wing in its stands, the way it comes off the car: two T-stands (a foot, the post, a padded U-cradle), the main
# plane (the team's colour) and its two flaps, the endplates and their footplates (the team's accent)
def wing_stands(name, loc, rotz):
    P, r = T(loc, rotz)
    for k, sx in enumerate((-0.5, 0.5)):
        bbox(f'{name}_Foot{k}', FL, (0.08, 0.55, 0.04), P(sx, 0.05, 0.02), blk, rot=r, bev=0.008)
        bbox(f'{name}_FootX{k}', FL, (0.3, 0.06, 0.04), P(sx, 0.05, 0.02), blk, rot=r, bev=0.008)
        rd(f'{name}_Post{k}', FL, P(sx, 0.05, 0.04), P(sx, 0.05, 0.5), 0.022, silver, verts=8)
        bbox(f'{name}_Cradle{k}', FL, (0.09, 0.46, 0.035), P(sx, 0.05, 0.52), blk, rot=r, bev=0.006)
        for t in (-1, 1): bbox(f'{name}_CradleArm{k}{t}', FL, (0.09, 0.03, 0.14), P(sx, 0.05 + t * 0.215, 0.6), blk, rot=r, bev=0.006)
        bbox(f'{name}_Foam{k}', FL, (0.085, 0.4, 0.03), P(sx, 0.05, 0.553), foam, rot=r, bev=0.008)
    bbox(f'{name}_Main', FL, (1.75, 0.38, 0.03), P(0, 0.0, 0.585), TMb, rot=(-0.06, 0, rotz), bev=0.01)
    bbox(f'{name}_Flap1', FL, (1.68, 0.17, 0.02), P(0, 0.21, 0.615), carbon, rot=(-0.32, 0, rotz), bev=0.006)
    bbox(f'{name}_Flap2', FL, (1.58, 0.13, 0.016), P(0, 0.31, 0.665), carbon, rot=(-0.55, 0, rotz), bev=0.005)
    for s in (-1, 1):
        bbox(f'{name}_Endplate{s}', FL, (0.018, 0.56, 0.3), P(s * 0.885, 0.12, 0.69), TAb, rot=r, bev=0.006)
        bbox(f'{name}_Footplate{s}', FL, (0.08, 0.48, 0.014), P(s * 0.86, 0.1, 0.56), carbon, rot=r, bev=0.004)

# a tire warmer trolley: a frame on castors, two shelves, four tires in their blankets (the team's colour), the control
# box on top with its display, the leads down to each blanket and the supply lead off to the floor
def warmer_trolley(name, loc, rotz):
    P, r = T(loc, rotz); w, d = 1.36, 0.46
    for sx in (-1, 1):
        for sy in (-1, 1):
            castor(f'{name}_Castor{sx}{sy}', P, r, sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), rotz)
            bx(f'{name}_Post{sx}{sy}', FL, (0.035, 0.035, 1.42), P(sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), 0.82), steel, rot=r)
    for k, z in enumerate((0.13, 0.78)):
        for sy in (-1, 1): bx(f'{name}_Rail{k}{sy}', FL, (w, 0.035, 0.035), P(0, sy * (d / 2 - 0.02), z), steel, rot=r)
        for sx in (-1, 0, 1): bx(f'{name}_Slat{k}{sx}', FL, (0.035, d, 0.025), P(sx * 0.4, 0, z + 0.02), steel, rot=r)
        for j, sx in enumerate((-0.34, 0.34)): tire_cover(f'{name}_Tire{k}{j}', P(sx, 0, z + 0.035 + 0.32), (D90, 0, rotz))
    for sy in (-1, 1): bx(f'{name}_TopRail{sy}', FL, (w, 0.035, 0.035), P(0, sy * (d / 2 - 0.02), 1.52), steel, rot=r)
    bx(f'{name}_TopShelf', FL, (w * 0.5, d, 0.02), P(0.3, 0, 1.54), steel, rot=r)
    bbox(f'{name}_Box', FL, (0.3, 0.16, 0.22), P(0.3, 0.0, 1.66), lacg, rot=r, bev=0.012)
    bx(f'{name}_Display', FL, (0.14, 0.008, 0.05), P(0.3, -0.084, 1.7), glow_r, rot=r)
    for k in range(3): bx(f'{name}_Key{k}', FL, (0.025, 0.008, 0.02), P(0.24 + k * 0.06, -0.084, 1.62), blk, rot=r)
    top = P(0.18, 0.0, 1.56)
    for k, (tx, tz) in enumerate(((-0.34, 1.455), (0.34, 1.455), (-0.34, 0.805), (0.34, 0.805))):
        end = P(tx, -0.08, tz); sweep(f'{name}_Lead{k}', FL, [top, P((tx + 0.18) / 2, -0.24, (tz + 1.56) / 2 + 0.05), end], 0.006, blk, segs=4, per_m=8)
    sweep(f'{name}_Supply', FL, [P(0.42, 0.08, 1.56), P(0.6, 0.3, 1.2), P(0.5, 0.45, 0.4), P(0.9, 0.75, 0.01), P(1.6, 0.9, 0.01)], 0.008, blk, segs=4, per_m=6)

# a delivery not unpacked yet: boxes on a pallet, taped, a strap round them, the note; and a flight case by it with
# somebody's coffee left on the lid
def delivery(name, loc, rotz):
    P, r = T(loc, rotz); pallet(f'{name}_Pallet', loc, rotz)
    for k, (dx, dy, dz, sw, sd, sh) in enumerate(((-0.28, -0.22, 0.122, 0.52, 0.44, 0.42), (0.27, -0.2, 0.122, 0.5, 0.48, 0.42), (-0.02, 0.24, 0.122, 1.06, 0.44, 0.36),
                                                   (-0.12, -0.08, 0.542, 0.6, 0.5, 0.3))):
        bbox(f'{name}_Box{k}', FL, (sw, sd, sh), P(dx, dy, dz + sh / 2), card_m, rot=(0, 0, rotz + (0.04 if k == 3 else 0)), bev=0.006)
        bx(f'{name}_Tape{k}', FL, (0.06, sd + 0.004, 0.003), P(dx, dy, dz + sh + 0.001), tape, rot=r)
    bx(f'{name}_Strap', FL, (1.1, 0.025, 0.004), P(0, -0.22, 0.545), blk, rot=r)
    cd(f'{name}_Note', FL, 0.18, 0.13, P(0.27, -0.445, 0.3), rm_art('pallet', 0.06), rotz=rotz)
def coffee_case(name, loc, rotz):
    P, r = T(loc, rotz); flight_case(f'{name}_Case', loc, rotz, 0.85, 0.58, 0.62, stencil=False)
    cd(f'{name}_Stencil', FL, 0.5, 0.2, P(0, -0.294, 0.28), rm_art('case', 0.08), rotz=rotz)
    lathe(f'{name}_Mug', FL, [(0.0, 0.0), (0.04, 0.0), (0.043, 0.095), (0.039, 0.095), (0.036, 0.012), (0.0, 0.012)], P(0.22, 0.08, 0.62), mugw, segs=12)
    cy(f'{name}_Coffee', FL, 0.037, 0.004, P(0.22, 0.08, 0.62 + 0.075), coffee, verts=12)
    sweep(f'{name}_MugHandle', FL, [P(0.262, 0.08, 0.62 + 0.075), P(0.285, 0.08, 0.62 + 0.05), P(0.262, 0.08, 0.62 + 0.025)], 0.006, mugw, segs=4, per_m=40)
    bbox(f'{name}_Clipboard', FL, (0.24, 0.32, 0.008), P(-0.16, -0.02, 0.624), lacg, rot=(0, 0, rotz - 0.2), bev=0.003)
    cd(f'{name}_Sheet', FL, 0.2, 0.27, P(-0.16, -0.02, 0.629), rm_art('case', 0.05), rotz=rotz - 0.2, tilt=-D90)

# ---------------------------------------------------------------------------------------------------------------------
# where (round the bays, the lanes left clear: the front lane to the doorways, between the cars, the way behind them
# to the tools bench, the tunnel hall's door and the corridor)
parts_trolley('Fl_Trolley', (-1.5, 0.7, 0), D90 + 0.08)
for k, b in enumerate((BAY1, BAY2)): drip_tray(f'Fl_DripTray{k}', (b.x + 0.05, b.y + 1.75, 0), 0.06 * (1 - 2 * k))
wheel_dolly('Fl_WheelDolly', (-1.45, -2.35, 0), 0.35)
gearbox_cradle('Fl_Gearbox', (-1.3, 4.3, 0), 0.18)
stool('Fl_Stool', (-0.45, 3.75, 0), h=0.62)
wing_stands('Fl_Wing', (2.5, 4.45, 0), -0.08)
warmer_trolley('Fl_Warmers', (5.2, 3.3, 0), 0.32)
delivery('Fl_Delivery', (8.45, 4.55, 0), 0.22)
coffee_case('Fl_FlightCase', (6.75, 4.95, 0), -0.12)

# ---------------------------------------------------------------------------------------------------------------------
# light: warm over the bench (a pendant off a boom on the tool wall), the machine shop warm, the dock a touch darker
BX, BY, BZ = -5.0, 5.0, 3.05
bx('Fl_BenchBoomPlate', FL, (0.16, 0.02, 0.22), (BX, AY1 - 0.01, 3.4), enamel)
rd('Fl_BenchBoom', FL, (BX, AY1 - 0.02, 3.42), (BX, BY, 3.38), 0.022, enamel, verts=8)
rd('Fl_BenchDrop', FL, (BX, BY, 3.38), (BX, BY, BZ + 0.2), 0.005, blk, verts=4)
lathe('Fl_BenchShade', FL, [(0.03, 0.2), (0.05, 0.18), (0.08, 0.08), (0.24, 0.0), (0.235, -0.005), (0.075, 0.07), (0.045, 0.17)], (BX, BY, BZ), enamel, segs=16, cap0=False, cap1=False)
cy('Fl_BenchLamp', FL, 0.07, 0.01, (BX, BY, BZ + 0.06), lampw, verts=12)
bulb('Light_Task_Bench', lights, (BX, BY, BZ - 0.05), 260, (1.0, 0.8, 0.58))
for n, rgb, w in (('Light_Room_3', (1.0, 0.86, 0.66), 750), ('Light_Room_7', None, 300)):
    L = bpy.data.objects.get(n)
    if L: L.data.energy = w; L.data.color = rgb or L.data.color
POOLS = [((BX, BY - 0.4), 2.3, 0.14, True), ((-13.5, 3.8), 3.0, 0.1, True), ((-13.0, -3.2), 3.0, 0.06, False)] + [((b.x, b.y), 3.4, 0.06, False) for b in (BAY1, BAY2, BAY3)]

# ---------------------------------------------------------------------------------------------------------------------
# the ground floor: one texture over all of it, 40 px a metre (x X0..X1, y -14..Y1)
import time; _t0 = time.time()
PPM = 40; FY0 = -14.0
fw, fh = int((X1 - X0) * PPM), int((Y1 - FY0) * PPM)
yy, xx = np.mgrid[0:fh, 0:fw].astype(np.float32); wx, wy = xx / PPM + X0 + 0.5 / PPM, yy / PPM + FY0 + 0.5 / PPM
rr = np.random.default_rng(2006)
blvd = wy < GY; atr = (wx >= AX0) & (wx < AX1) & (wy >= GY) & (wy < AY1); room = ~(blvd | atr)
base = np.where(blvd[..., None], np.array([0.22, 0.23, 0.25], np.float32), np.where(atr[..., None], np.array([0.62, 0.64, 0.66], np.float32), np.array([0.5, 0.52, 0.54], np.float32)))
fcol = base.copy()
fcol *= (1 + (rr.random((fh, fw)) > 0.95)[..., None] * 0.03)
fcol *= (1 + (fbm(fh, fw, (160, 40, 10)) - 0.5) * np.where(room, 0.1, 0.06))[..., None]          # (the pours' mottle: more in the work rooms)
gx = np.minimum(np.mod(wx, 2.0), 2.0 - np.mod(wx, 2.0)) < 0.016; gy_ = np.minimum(np.mod(wy, 2.0), 2.0 - np.mod(wy, 2.0)) < 0.016
fcol *= np.where((gx | gy_) & blvd, 0.8, np.where((gx | gy_) & atr, 0.93, 1.0))[..., None]   # (the tiles' joints, as before)
# the pours' saw cuts across the atrium and the rooms, a little ragged
cut = np.zeros((fh, fw), np.float32); wob = (vnoise(fh, fw, 30) - 0.5) * 0.02
for x in (-2.0, 4.0, -13.5, 14.5): cut = np.maximum(cut, (np.abs(wx - x + wob) < 0.014) * ~blvd)
for y in (-0.5, 10.75): cut = np.maximum(cut, (np.abs(wy - y + wob) < 0.014) * ~blvd)
fcol *= (1 - cut * 0.22)[..., None]

def seg_d(a, b):
    ax, ay = a; bx_, by = b; dx, dy = bx_ - ax, by - ay; L2 = max(dx * dx + dy * dy, 1e-6)
    t = np.clip(((wx - ax) * dx + (wy - ay) * dy) / L2, 0, 1); return np.hypot(wx - ax - t * dx, wy - ay - t * dy)
def path_d(pts):
    d = np.full((fh, fw), 99.0, np.float32)
    for a, b in zip(pts, pts[1:]): d = np.minimum(d, seg_d(a, b))
    return d
def offset(pts, o):   # the line o to the left of a path (a car's wheel track either side of its middle)
    out = []
    for i, p in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]; dx, dy = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dy) or 1
        out.append((p[0] - dy / n * o, p[1] + dx / n * o))
    return out
br = vnoise(fh, fw, 12) * 0.6 + 0.4   # (breaks every wear mark up a little)

# the ways everyone walks: worn in (darker on the pale floors, the polish scuffed lighter on the Boulevard's dark one)
WALKS = [  # (points, width m, strength)
    ([(-5.7, -6.5), (-5.2, -5.3), (-1.5, -4.6), (3.0, -4.4), (7.4, -5.4), (8.55, -6.5)], 0.9, 0.12),          # (the front lane, doorway to doorway)
    ([(-7.3, -4.7), (-6.5, -5.5), (-5.7, -6.5)], 0.7, 0.12),                                                  # (off the stairs)
    ([(-1.5, -4.6), (-1.6, -1.2), (-1.7, 2.6), (-3.0, 3.8), (-5.0, 4.25)], 0.8, 0.12),                        # (between the cars to the bench)
    ([(-1.7, 2.6), (1.5, 3.1), (4.0, 2.4), (7.5, 2.2), (10.0, 1.95)], 0.8, 0.1),                              # (behind the cars to the tunnel hall)
    ([(-8.0, 4.2), (-6.4, 3.7), (-3.0, 3.6)], 0.7, 0.1),                                                      # (the machine shop's door)
    ([(-8.0, 6.75), (19.0, 6.75)], 1.0, 0.16),                                                               # (the service corridor)
    ([(-6.7, 6.75), (-6.7, 8.6)], 0.9, 0.14), ([(0.4, 6.75), (0.4, 8.6)], 0.8, 0.12), ([(8.4, 6.75), (8.4, 8.6)], 0.8, 0.12), ([(11.6, 6.6), (12.4, 4.6)], 0.7, 0.1),
    ([(-13.4, -9.6), (-8.5, -8.7), (0.0, -8.3), (12.0, -8.6), (18.0, -9.2)], 1.3, 0.1),                       # (the Boulevard, along the cars)
    ([(-7.6, -8.5), (-5.7, -6.6)], 0.8, 0.1), ([(-13.0, -8.8), (-13.0, -6.5), (-13.0, -3.9), (-14.2, -3.4)], 0.8, 0.14), ([(-13.0, -3.9), (-8.8, -3.4)], 0.7, 0.12),
    ([(-8.0, 4.2), (-12.0, 4.6), (-13.5, 6.4)], 0.8, 0.14), ([(-8.0, 6.75), (-10.5, 6.6)], 0.7, 0.12),
    ([(-18.5, 10.75), (-13.0, 10.75), (-8.0, 9.6), (-6.7, 8.0)], 1.2, 0.2), ([(-13.0, 10.75), (-15.0, 12.2)], 0.9, 0.16),
    ([(10.0, 1.95), (12.5, 1.0), (14.0, -1.8)], 0.9, 0.12), ([(12.5, 1.0), (15.5, 3.4)], 0.7, 0.1),
    ([(0.4, 8.6), (0.0, 11.5)], 0.8, 0.12), ([(8.4, 8.6), (9.2, 11.0)], 0.9, 0.14), ([(12.5, 10.1), (15.7, 11.0)], 0.8, 0.12)]
wear = np.zeros((fh, fw), np.float32)
for pts, w, k in WALKS:
    d = path_d(pts); wear = np.maximum(wear, k * np.clip(1 - d / (w / 2), 0, 1) ** 0.8)
wear *= br * np.where(room, 1.6, 1.0)   # (the work rooms used harder, and dimmer: it has to show)
# rubber: the cars rolled out of the bays and back, the wheels' patches where they stand, the jack's run under the nose,
# the trolleys' castor lines from the bench; the lift's bay, the tire bay round the changer, forklift and pallet truck
tracks = np.zeros((fh, fw), np.float32)
for b, k in ((BAY1, 0.2), (BAY2, 0.2), (BAY3, 0.14)):
    mid = [(b.x, b.y + 2.4), (b.x, b.y - 1.0), (b.x + 0.15, b.y - 4.2), (b.x + 0.4, b.y - 5.6)]
    for o in (-0.8, 0.8):
        d = path_d(offset(mid, o)); fade = np.clip((wy - (b.y - 5.8)) / 2.5, 0, 1)
        tracks = np.maximum(tracks, k * np.clip(1 - d / 0.13, 0, 1) * fade * (0.5 + 0.5 * vnoise(fh, fw, 6)))
    for o in (-0.16, 0.16):
        d = seg_d((b.x + o, b.y - 2.9), (b.x + o, b.y - 4.8)); tracks = np.maximum(tracks, 0.1 * np.clip(1 - d / 0.035, 0, 1))
patch = [((b.x + sx * 0.8 - X0) * PPM, (b.y + dy - FY0) * PPM, 0.28, 0.22) for b in (BAY1, BAY2) for sx in (-1, 1) for dy in (-1.95, 1.6)]
for (a, b_) in (((-5.0, 4.3), (-3.3, 0.2)), ((-5.0, 4.3), (-0.2, 1.8)), ((-1.5, 0.7), (-1.5, -2.3))):
    for o in (-0.22, 0.22):
        (ax, ay), (bx_, by) = offset([a, b_], o)
        tracks = np.maximum(tracks, 0.07 * np.clip(1 - seg_d((ax, ay), (bx_, by)) / 0.025, 0, 1) * br)
for pts, o, k in (([(-18.5, 10.75), (-14.6, 10.2), (-14.6, 8.4)], 0.42, 0.32), ([(-18.5, 10.75), (-12.0, 10.9), (-9.2, 13.0)], 0.2, 0.3)):
    for s in (-1, 1): tracks = np.maximum(tracks, k * np.clip(1 - path_d(offset(pts, s * o)) / 0.08, 0, 1) * br)
rubber_dust = blobs(fh, fw, [((-14.2 - X0) * PPM, (-2.7 - FY0) * PPM, 1.1, 0.35), ((-12.0 - X0) * PPM, (-2.7 - FY0) * PPM, 0.8, 0.25), ((-16.6 - X0) * PPM, (-3.2 - FY0) * PPM, 0.9, 0.2)], PPM)
tracks = np.maximum(tracks, rubber_dust * (vnoise(fh, fw, 3) > 0.45) * 0.45)
# drips: under the cars' gearboxes, round the lift, the dyno cells, the machine shop's coolant, the forklift's spot
spots = patch + [((b.x + dx - X0) * PPM, (b.y + dy - FY0) * PPM, r_, k) for b in (BAY1, BAY2) for dx, dy, r_, k in ((0.3, 1.5, 0.16, 0.3), (-0.25, 2.1, 0.1, 0.25))]
spots += [((x - X0) * PPM, (y - FY0) * PPM, r_, k) for x, y, r_, k in ((6.2, -0.6, 0.4, 0.3), (5.4, 0.6, 0.18, 0.25), (9.2, 11.4, 0.6, 0.45), (8.4, 12.6, 0.3, 0.35), (15.7, 11.4, 0.5, 0.4),
                                                                 (-13.5, 6.4, 0.5, 0.25), (-12.6, 5.8, 0.25, 0.2), (-14.6, 8.6, 0.35, 0.35), (-11.0, 10.8, 0.7, 0.3))]
oil = blobs(fh, fw, spots, PPM)
# the doorways: scuffed, where everyone turns
DOORS = [(-5.7, -6.5), (8.55, -6.5), (-8.0, 4.2), (-8.0, 6.75), (10.0, 1.95), (11.6, 6.0), (-6.7, 7.5), (0.4, 7.5), (8.4, 7.5), (12.5, 10.1), (-7.3, -4.7), (-13.0, -6.5), (-18.6, 10.75)]
scuff = blobs(fh, fw, [((x - X0) * PPM, (y - FY0) * PPM, 0.65, 0.16) for x, y in DOORS], PPM)
wear = np.maximum(wear, scuff * br)
# the bays' paint (pale lines round car one and two, worn where the wheels cross), the lift's bay hatched yellow and black
paint = np.zeros((fh, fw), np.float32); hatch = np.zeros((fh, fw), np.float32)
for b in (BAY1, BAY2):
    for s in (-1, 1): paint = np.maximum(paint, (np.abs(wx - (b.x + s * 1.45)) < 0.03) * (np.abs(wy - (b.y - 0.2)) < 3.1))
    for e in (-3.3, 2.9): paint = np.maximum(paint, (np.abs(wy - (b.y + e)) < 0.03) * (np.abs(wx - b.x) < 1.48))
hx0, hx1, hy0, hy1 = BAY3.x - 2.15, BAY3.x + 2.15, BAY3.y - 3.25, BAY3.y + 1.35
hring = ((wx > hx0) & (wx < hx1) & (wy > hy0) & (wy < hy1)) & ~((wx > hx0 + 0.1) & (wx < hx1 - 0.1) & (wy > hy0 + 0.1) & (wy < hy1 - 0.1))
hatch = hring * 1.0
stripe = (np.mod(wx + wy, 0.3) < 0.15)
keep = np.clip(vnoise(fh, fw, 5) * 1.3 + 0.1, 0, 1) * np.clip(1 - tracks * 3, 0, 1)
paint *= keep * 0.55; hatch *= keep * 0.75
fcol = fcol * (1 - paint[..., None]) + np.array([0.88, 0.88, 0.86], np.float32) * paint[..., None]
hc = np.where(stripe[..., None], np.array([0.82, 0.64, 0.1], np.float32), np.array([0.08, 0.08, 0.09], np.float32))
fcol = fcol * (1 - hatch[..., None]) + hc * hatch[..., None]
# the edges: dust along the walls (heavier in the work rooms)
RECTS = [(AX0, GY, AX1, AY1, 0.1), (X0, GY, AX0, 0, 0.22), (X0, 0, AX0, CY1, 0.25), (AX1, GY, X1, AY1, 0.22), (AX0, AY1, X1, CY1, 0.18),
         (X0, CY1, -3.0, Y1, 0.3), (-3.0, CY1, 6.0, Y1, 0.22), (6.0, CY1, 12.5, Y1, 0.28), (12.5, CY1, X1, Y1, 0.28)]
edge = np.zeros((fh, fw), np.float32)
for x0, y0, x1, y1, k in RECTS:
    inside = (wx >= x0) & (wx < x1) & (wy >= y0) & (wy < y1)
    e = np.minimum.reduce([wx - x0, x1 - wx, wy - y0, y1 - wy]); edge = np.where(inside, k * np.clip(1 - e / 0.7, 0, 1) ** 1.6, edge)
edge = np.where(blvd, 0.08 * np.clip(1 - np.minimum(GY - wy, wy - (FRONT_END + (FRONT_MID - FRONT_END) * (1 - (wx / X1) ** 2))) / 0.6, 0, 1) ** 1.6, edge)
dirt = edge * (0.7 + 0.6 * fbm(fh, fw, (60, 20)))
# the work rooms' own mess: resin and dust in composites (pale specks), swarf by the machine shop's back wall (bright)
spk = rr.random((fh, fw))
comp = (wx > -3) & (wx < 6) & (wy > CY1) & (wy < Y1); mach = (wx < AX0) & (wy > 0) & (wy < CY1)
fcol = np.where((comp & (spk > 0.985))[..., None], fcol * 0.6 + np.array([0.75, 0.62, 0.35], np.float32) * 0.4, fcol)
fcol = np.where((mach & (spk > 0.997) & (wy > 5.6))[..., None], np.minimum(1, fcol * 1.25), fcol)
# the shadow under everything that stands on the floor (its footprint, blurred), the shell's own pieces: walls, racks,
# the forklift, the cases, the new clusters
def blur(a, r):
    for _ in range(3):
        c = np.cumsum(np.pad(a, ((0, 0), (r + 1, r))), axis=1); a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
        c = np.cumsum(np.pad(a, ((r + 1, r), (0, 0))), axis=0); a = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
    return a
foot = np.zeros((fh, fw), np.float32)
bpy.context.view_layer.update()
SKIPN = ('Floor_', 'WALK_', 'NAV_', 'COL_', 'GUIDE', 'Out_', 'Roof', 'Ceil', 'Rot_Floor', 'Rot_Inlay', 'Light')
for o in shell.all_objects:
    if o.type != 'MESH' or o.name.startswith(SKIPN) or any(m and m.surface_render_method == 'BLENDED' for m in o.data.materials): continue
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]; z0, z1 = min(c.z for c in cs), max(c.z for c in cs)
    if z0 > 0.12 or z1 - z0 < 0.025: continue
    k = float(np.clip((z1 - z0) / 0.6, 0.35, 1.0))
    i0, i1 = int((min(c.x for c in cs) - X0) * PPM), int((max(c.x for c in cs) - X0) * PPM) + 1
    j0, j1 = int((min(c.y for c in cs) - FY0) * PPM), int((max(c.y for c in cs) - FY0) * PPM) + 1
    i0, j0 = max(0, i0), max(0, j0); i1, j1 = min(fw, i1), min(fh, j1)
    if i1 > i0 and j1 > j0: foot[j0:j1, i0:i1] = np.maximum(foot[j0:j1, i0:i1], k)
shade = np.clip(blur(foot, 4) * 0.2 + blur(foot, 12) * 0.18, 0, 0.3)   # (a soft contact shadow, never a black mat)
# the light: warm pools under the task lights, a little lift under the bays' spots, the gaps between a shade darker
pool = np.zeros((fh, fw), np.float32); warmk = np.zeros((fh, fw), np.float32)
for (px_, py_), r_, k, warm_ in POOLS:
    p = np.clip(1 - np.hypot(wx - px_, wy - py_) / r_, 0, 1) ** 1.5 * k; pool = np.maximum(pool, p)
    if warm_: warmk = np.maximum(warmk, p)
# assemble
fcol = grime(fcol, dirt); fcol = grime(fcol, np.where(blvd, 0, wear)); fcol = fcol * (1 + np.where(blvd, wear * 0.9, 0))[..., None]
fcol = grime(fcol, np.clip(tracks, 0, 1), OIL); fcol = grime(fcol, oil * 0.6, OIL)
fcol *= (1 - shade)[..., None]
fcol *= (np.where(atr | room, 0.93, 1.0) + pool * 1.0)[..., None]
fcol = fcol * (1 - warmk[..., None] * 1.5) + fcol * np.array([1.12, 1.0, 0.82], np.float32) * warmk[..., None] * 1.5
floor_worn = mat_img('FA_FloorWorn', save('fa_floor_worn', np.clip(fcol, 0, 1)), 0.35)
n = 0
for o in list(B.objects):
    if not o.name.startswith('Floor_') or o.name.startswith('Floor_ExitLine') or o.type != 'MESH': continue
    me = o.data; me.materials.clear(); me.materials.append(floor_worn); uv = me.uv_layers[0]
    for poly_ in me.polygons:
        for li in poly_.loop_indices:
            v = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co; uv.data[li].uv = ((v.x - X0) / (X1 - X0), (v.y - FY0) / (Y1 - FY0))
    n += 1
print(f'lived: the floor ({fw}x{fh}) on {n} floors in {time.time() - _t0:.0f} s')

# ---------------------------------------------------------------------------------------------------------------------
# the walls (the ground floor's): each face finished for the room it faces, one texture over the whole height (64 px a
# metre, 8 m along x 8.5 m up, so the bands sit at their heights and nothing repeats in a doorway's width). The work
# rooms (the tire bay, the machine shop, the corridor, the dock, composites, the dyno cells, the tunnel hall): painted
# blockwork, a darker kick-proof dado to 1.2 m with a blue line on it, grime at the foot, the trolleys' scuffs, hands
# where people push doors. The atrium: big composite panels over a brushed steel kick plate. The Boulevard's stay.
_t0 = time.time()
WPM = 64; WU, WV = 8.0, 8.5
ww, wh = int(WU * WPM), int(WV * WPM)
yy, xx = np.mgrid[0:wh, 0:ww].astype(np.float32); wu, wz = xx / WPM, yy / WPM   # (row 0 at the floor: Blender's images run bottom up)
rr = np.random.default_rng(1997)
def tone(cells_u, cells_z, off, k, z0=0.0):   # a tone per block (or panel): its own shade, a course offset every other row
    row = np.floor((wz - z0) / cells_z); col_ = np.floor((wu + (row % 2) * off) / cells_u)
    h = np.sin(row * 12.9898 + col_ * 78.233) * 43758.5453; return 1 + ((h - np.floor(h)) - 0.5) * k
# blockwork: 440 x 215 courses (0.5 x 0.25 here, so the 8 m tile closes), mortar a shade darker
bcol = np.ones((wh, ww, 3), np.float32) * np.array([0.64, 0.65, 0.66], np.float32)
bcol *= tone(0.5, 0.25, 0.25, 0.05)[..., None]
mort = (np.mod(wz, 0.25) < 0.012) | (np.mod(wu + (np.floor(wz / 0.25) % 2) * 0.25, 0.5) < 0.012)
bcol *= np.where(mort, 0.86, 1.0)[..., None]
bcol *= (1 + (fbm(wh, ww, (96, 24, 6), wrap=True) - 0.5) * 0.08)[..., None]
dado = wz < 1.2
bcol = np.where(dado[..., None], bcol * np.array([0.56, 0.6, 0.66], np.float32), bcol)   # (the dado: a darker blue-grey paint)
line = (wz >= 1.2) & (wz < 1.24); bcol = np.where(line[..., None], np.array([0.12, 0.35, 0.72], np.float32), bcol)
foot = np.clip(1 - wz / 0.28, 0, 1) ** 1.4 * (0.55 + 0.45 * fbm(wh, ww, (48, 12), wrap=True)) * 0.5
scuff = np.zeros((wh, ww), np.float32)
for _ in range(26):   # (trolleys, kicks: short dark streaks low down)
    u0, z0 = rr.uniform(0, WU), rr.uniform(0.12, 0.95); L = rr.uniform(0.15, 0.7)
    d = np.minimum(np.abs(wu - u0), WU - np.abs(wu - u0))
    scuff = np.maximum(scuff, (d < L / 2) * np.clip(1 - np.abs(wz - z0) / rr.uniform(0.008, 0.025), 0, 1) * rr.uniform(0.25, 0.5))
hands = blobs(wh, ww, [(rr.uniform(0, ww), rr.uniform(1.0, 1.5) * WPM, rr.uniform(0.1, 0.2), rr.uniform(0.05, 0.1)) for _ in range(10)], WPM)
top = np.clip((wz - 3.6) / 4.5, 0, 1) * 0.18 * fbm(wh, ww, (64, 16), wrap=True)   # (dust up where nobody cleans: the tall walls)
streak = (vnoise(wh, ww, 3, wrap=True)[0:1, :] > 0.82) * np.clip((3.8 - wz) / 1.2, 0, 1) * (wz < 3.8) * (wz > 1.3) * 0.05
bcol = grime(bcol, foot); bcol = grime(bcol, scuff * (0.6 + 0.4 * vnoise(wh, ww, 4, wrap=True))); bcol = grime(bcol, hands); bcol = grime(bcol, top + streak)
wall_work = mat_img('FA_WallWork', save('fa_wall_work', np.clip(bcol, 0, 1)), 0.8)
# the atrium's panels: 1.6 x 2.8 (five to the 8 m tile), fine joints, each its own shade; a kick plate of brushed steel to 0.25 m
pcol = np.ones((wh, ww, 3), np.float32) * np.array([0.8, 0.81, 0.82], np.float32)
pcol *= tone(1.6, 2.8, 0.0, 0.03, z0=0.25)[..., None]
joint = (np.mod(wu + 0.006, 1.6) < 0.013) | (np.mod(wz - 0.25 + 0.006, 2.8) < 0.013)
pcol *= np.where(joint, 0.62, 1.0)[..., None]
kick = wz < 0.25
brushed = np.array([0.58, 0.6, 0.63], np.float32) * (1 + (np.random.default_rng(5).random((wh, ww)) - 0.5)[..., None] * 0.08)
pcol = np.where(kick[..., None], brushed, pcol); pcol = np.where(((wz >= 0.25) & (wz < 0.262))[..., None], pcol * 0.55, pcol)
pcol = grime(pcol, np.clip(1 - wz / 0.12, 0, 1) * 0.25 + scuff * 0.3 * (wz < 0.9))
wall_panel = mat_img('FA_WallPanel', save('fa_wall_panel', np.clip(pcol, 0, 1)), 0.45)
# which faces: the ground floor's wall pieces (their names from the plan), each face by the room in front of it
import re as _re
WALLS = _re.compile(r'^(Wall_(L|R|Back)|TireBay_(Front_[LR]|Lintel|Atrium)|Machine_(Front|Dado|End)|Tunnel_(AtriumA|AtriumDado|AtriumHead|AtriumB|HallBack)|Back_(Front|Side)|Atrium_ToolWall|Dyno_Split)')
def zone(x, y): return 'blvd' if y < GY else 'atr' if (AX0 < x < AX1 and GY < y < AY1) else 'work'
nf = {'work': 0, 'atr': 0}
for o in list(B.objects):
    if o.type != 'MESH' or not WALLS.match(o.name): continue
    me = o.data; mw = o.matrix_world; nm3 = mw.to_3x3().inverted().transposed()
    base_n = len(me.materials); me.materials.append(wall_work); me.materials.append(wall_panel)
    uv = me.uv_layers[0] if me.uv_layers else me.uv_layers.new()
    for f in me.polygons:
        n = (nm3 @ f.normal).normalized()
        if abs(n.z) > 0.5: continue
        c = mw @ f.center + n * 0.3; z_ = zone(c.x, c.y)
        if z_ == 'blvd': continue
        f.material_index = base_n + (0 if z_ == 'work' else 1); nf[z_] += 1
        along_x = abs(n.y) >= abs(n.x)
        for li in f.loop_indices:
            p = mw @ me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((p.x if along_x else p.y) / WU, p.z / WV)
print(f'lived: walls ({nf["work"]} faces of blockwork, {nf["atr"]} of panels) in {time.time() - _t0:.0f} s')
