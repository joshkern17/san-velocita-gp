# tools/factory/rooms.py: run inside tools/garage-factory.py (exec'd with its globals: the plan's numbers, B, dress,
# lights, hooks, garagelib's helpers). See that script's header for the layout.
# The rooms' furnishing, in the Technology Centre's way: white lacquer, brushed aluminium, black glass, leather, early
# flat screens, a blue LED line here and there; moody, not bright. Every thing from its real parts and closed all round
# (no cards to see behind), standing or hung the way it would be. The office (the boss's), race ops, the cafe, the sim
# suite, the tunnel's control pod, the tire bay (a showroom of tires off the Boulevard), reception's lounge, the
# corridor's lockers, the loading dock. Printed bits: tools/factory/art_rooms.py (fa_rm_*.png, system Python + Pillow).
import subprocess
from mathutils import Euler, Quaternion
FR = dress
Z = UZ   # (upstairs)
for o in [o for o in dress.objects if o.name.startswith('TireRack_')]: bpy.data.objects.remove(o, do_unlink=True)   # (the blockout's)

# ---------------------------------------------------------------------------------------------------------------------
# printed art
ART = os.path.join(SRC, 'factory_art', 'rooms')   # (its own folder: not GEN, which garagelib's import resets)
if not os.path.exists(os.path.join(ART, 'fa_rm_roundel.png')):
    py = '/usr/local/bin/python3' if os.path.exists('/usr/local/bin/python3') else 'python3'   # (needs Pillow)
    subprocess.run([py, os.path.join(os.path.dirname(os.path.abspath(f)), 'art_rooms.py'), ART], check=True)
A_ = lambda n: os.path.join(ART, 'fa_rm_' + n + '.png')
_arts = {}
def art(png, dirt=0.05, emit=None):
    k = (png, emit)
    if k not in _arts: _arts[k] = art_mat(f'Fr_Art_{png}' + ('_glow' if emit else ''), A_(png), dirt=dirt, emit=emit)
    return _arts[k]

# ---------------------------------------------------------------------------------------------------------------------
# finishes
lac = plain_mat('Fr_Lacquer', (0.9, 0.91, 0.92), dirt=0.03, rough=0.35)
lacg = plain_mat('Fr_LacquerGrey', (0.3, 0.32, 0.35), dirt=0.03, rough=0.35)
silver = plain_mat('Fr_Silver', (0.66, 0.68, 0.71), dirt=0.02, rough=0.3)
chrome = plain_mat('Fr_Chrome', (0.76, 0.78, 0.8), dirt=0.02, rough=0.2)
blk = plain_mat('Fr_Black', (0.05, 0.05, 0.06), dirt=0.02, rough=0.4)
blkglass = plain_mat('Fr_BlackGlass', (0.03, 0.035, 0.045), dirt=0.01, rough=0.15)
lw = plain_mat('Fr_LeatherWhite', (0.84, 0.83, 0.8), dirt=0.03, rough=0.55)
lb = plain_mat('Fr_LeatherBlack', (0.07, 0.07, 0.08), dirt=0.02, rough=0.5)
fab = plain_mat('Fr_Fabric', (0.26, 0.28, 0.32), dirt=0.03, fleck=0.08, rough=0.95)
fab2 = plain_mat('Fr_Fabric2', (0.14, 0.16, 0.2), dirt=0.03, fleck=0.08, rough=0.95)
stone = plain_mat('Fr_Stone', (0.2, 0.21, 0.22), dirt=0.02, fleck=0.1, rough=0.3)
blue = plain_mat('Fr_Blue', (0.12, 0.35, 0.72), dirt=0.02, rough=0.4)
yel = plain_mat('Fr_Yellow', (0.9, 0.68, 0.06), dirt=0.08)
redp = plain_mat('Fr_Red', (0.72, 0.08, 0.06), dirt=0.05)
green_p = plain_mat('Fr_Leaf', (0.16, 0.36, 0.14), dirt=0.02, fleck=0.1)
soil = plain_mat('Fr_Soil', (0.14, 0.1, 0.07), dirt=0.1)
woodm = plain_mat('Fr_Wood', (0.52, 0.36, 0.22), dirt=0.05, fleck=0.12)
rubber = grimy_tile('Fr_Rubber', 'rubber.png', dirt=0.05)
steel = grimy_tile('Fr_Steel', 'galvanized_metal.png', dirt=0.06)
TMb = plain_mat('TeamMain_FrBlanket', (0.86, 0.86, 0.86), dirt=0.04, fleck=0.06, rough=0.9)   # (the tire covers: the team's colour over it)
TAb = plain_mat('TeamAccent_FrTrim', (0.88, 0.88, 0.88), dirt=0.03)
glow_b = mat_img('Fr_GlowBlue', None, 0.4, emit=((0.25, 0.6, 1.0), 3.0))
glow_w = mat_img('Fr_GlowWhite', None, 0.4, emit=((0.95, 0.97, 1.0), 2.5))
glow_r = mat_img('Fr_GlowRed', None, 0.4, emit=((1.0, 0.2, 0.1), 3.0))
glow_g = mat_img('Fr_GlowGreen', None, 0.4, emit=((0.2, 1.0, 0.4), 3.0))
def see(name, rgb, a, rough=0.05):
    m = solid_mat(name, rgb, rough); m.surface_render_method = 'BLENDED'; m.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = a; return m
shelfglass = see('Fr_ShelfGlass', (0.6, 0.78, 0.85), 0.3)
frost = see('Fr_Frost', (0.88, 0.92, 0.96), 0.55, 0.3)
domeglass = see('Fr_Dome', (0.85, 0.9, 0.95), 0.2)
_cols = {}
def col(rgb):
    k = tuple(round(c, 2) for c in rgb)
    if k not in _cols: _cols[k] = plain_mat(f'Fr_Col_{len(_cols)}', k, dirt=0.02, rough=0.4)
    return _cols[k]

# pack props (their own textures)
S_ = lambda f: os.path.join(SRC, 'stations', f); U_ = lambda f: os.path.join(SRC, 'unit', f)
lib('fr_chair', S_('office_chair_black.glb'), height=0.95); lib('fr_phone', S_('desk_phone_with_cable.glb'), scale=0.55)
lib('fr_papers', S_('paper_stack_large.glb'), scale=0.7); lib('fr_mug', S_('mug_alt.glb'), height=0.1); lib('fr_binder', S_('file_binder.glb'), scale=0.8)
lib('fr_cooler', U_('water_cooler.glb'), height=1.15)

# ---------------------------------------------------------------------------------------------------------------------
# helpers: a frame (things built facing their own -Y, turned rotz, at loc)
def T(loc, rotz=0.0):
    M = Matrix.Rotation(rotz, 4, 'Z'); L = Vector(loc)
    return (lambda a, b, c: L + M @ Vector((a, b, c))), (0, 0, rotz)
def stand(n, loc, rotz, clip, role='any'): return empty(f'STAND_any.{n:03d}', hooks, loc, rotz=rotz, kind='SINGLE_ARROW', size=0.5, clip=clip, role=role)

def flat_screen(name, loc, rotz, w, png, desk=True, emit=1.2):
    # an early flat panel: a silver bezel, the picture just in front of it (glowing: on), the slim back, the neck and the
    # round foot (desk) or a bracket to the wall. loc: its foot (desk) or its middle (wall)
    h = w * 0.62; P, r = T(loc, rotz); zc = 0.2 + h / 2 if desk else 0.0
    bbox(f'{name}_Bezel', FR, (w, 0.045, h), P(0, 0, zc), silver, rot=r, bev=0.008)
    cd(f'{name}_Picture', FR, w - 0.05, h - 0.05, P(0, -0.024, zc - (h - 0.05) / 2), art(png, 0.01, emit), rotz=rotz)
    bbox(f'{name}_Back', FR, (w * 0.55, 0.05, h * 0.5), P(0, 0.045, zc), blk, rot=r, bev=0.01)
    if desk:
        bx(f'{name}_Neck', FR, (0.05, 0.03, 0.22), P(0, 0.06, 0.11), silver, rot=r)
        lathe(f'{name}_Foot', FR, [(0.0, 0.0), (0.12, 0.0), (0.12, 0.012), (0.03, 0.02), (0.0, 0.02)], P(0, 0.04, 0), silver, segs=12)
    else: bx(f'{name}_Bracket', FR, (0.12, 0.08, 0.12), P(0, 0.09, zc), blk, rot=r)
def framed(name, loc, rotz, w, h, png, frame_mat=None, depth=0.03, emit=None):
    # a picture in a frame on a wall: the frame's box, the print just proud of it. loc: its bottom middle, on the wall
    P, r = T(loc, rotz)
    bbox(f'{name}_Frame', FR, (w + 0.06, depth, h + 0.06), P(0, depth / 2, h / 2), frame_mat or blk, rot=r, bev=0.006)
    cd(f'{name}_Print', FR, w, h, P(0, -0.002, 0), art(png, 0.04, emit), rotz=rotz)
def sofa(name, loc, rotz, L, mat=lw, d=0.85):
    # a low modern sofa: chrome feet, a lacquered base, a seat cushion a seat, the back, two arms. Sat on facing -Y
    P, r = T(loc, rotz); n = max(1, round((L - 0.32) / 0.65))
    for sx in (-1, 1):
        for sy in (-1, 1): cy(f'{name}_Foot{sx}{sy}', FR, 0.025, 0.12, P(sx * (L / 2 - 0.12), sy * (d / 2 - 0.12), 0.06), chrome, verts=8)
    bbox(f'{name}_Base', FR, (L, d, 0.2), P(0, 0, 0.22), lacg, rot=r, bev=0.02)
    cw = (L - 0.32) / n
    for k in range(n): bbox(f'{name}_Seat{k}', FR, (cw - 0.02, d - 0.22, 0.13), P(-L / 2 + 0.16 + cw * (k + 0.5), -0.09, 0.385), mat, rot=r, bev=0.035)
    for k in range(n): bbox(f'{name}_Back{k}', FR, (cw - 0.02, 0.18, 0.36), P(-L / 2 + 0.16 + cw * (k + 0.5), d / 2 - 0.12, 0.5), mat, rot=(-0.12, 0, rotz), bev=0.04)
    for s in (-1, 1): bbox(f'{name}_Arm{s}', FR, (0.16, d, 0.28), P(s * (L / 2 - 0.08), 0, 0.46), mat, rot=r, bev=0.03)
def low_table(name, loc, rotz, w, d, h=0.38):
    P, r = T(loc, rotz)
    bx(f'{name}_Top', FR, (w, d, 0.015), P(0, 0, h), shelfglass, rot=r)
    for sx in (-1, 1):
        for sy in (-1, 1): bx(f'{name}_Leg{sx}{sy}', FR, (0.03, 0.03, h - 0.01), P(sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), (h - 0.01) / 2), chrome, rot=r)
    bbox(f'{name}_Shelf', FR, (w - 0.1, d - 0.1, 0.02), P(0, 0, 0.12), blk, rot=r, bev=0.004)
    for sx in (-1, 1): bx(f'{name}_Rail{sx}', FR, (0.03, d - 0.08, 0.03), P(sx * (w / 2 - 0.05), 0, h - 0.025), chrome, rot=r)
def magazine(name, loc, rotz, k):
    P, r = T(loc, rotz)
    bx(f'{name}_Pages', FR, (0.21, 0.28, 0.006), P(0, 0, 0.003), lac, rot=r)
    cd(f'{name}_Cover', FR, 0.2, 0.27, P(0, -0.135, 0.0065), art(f'mag{k}', 0.05), rotz=rotz, tilt=-D90)
def table_round(name, loc, r_=0.45, h=0.74, top=None):
    lathe(f'{name}_Pedestal', FR, [(0.0, 0.0), (0.28, 0.0), (0.28, 0.02), (0.05, 0.05), (0.035, h - 0.04), (0.06, h - 0.03), (0.0, h - 0.03)], loc, silver, segs=14)
    lathe(f'{name}_Top', FR, [(0.0, h - 0.03), (r_, h - 0.03), (r_, h), (0.0, h)], loc, top or lac, segs=20)
def cafe_chair(name, x, y, face, z=Z):
    # a polypropylene chair: the white shell seat and back on a chrome tube frame, the seat 0.46 up. face: the way you sit
    P, r = T((x, y, z), face)
    for sx in (-1, 1):
        for sy in (-1, 1): rd(f'{name}_Leg{sx}{sy}', FR, P(sx * 0.2, sy * 0.19, 0.0), P(sx * 0.18, sy * 0.17, 0.44), 0.011, chrome, verts=5)
        rd(f'{name}_Post{sx}', FR, P(sx * 0.18, 0.17, 0.44), P(sx * 0.19, 0.24, 0.84), 0.011, chrome, verts=5)
    bbox(f'{name}_Seat', FR, (0.42, 0.42, 0.03), P(0, 0, 0.455), lac, rot=(-0.04, 0, face), bev=0.012)
    bbox(f'{name}_Back', FR, (0.42, 0.03, 0.26), P(0, 0.225, 0.71), lac, rot=(-0.18, 0, face), bev=0.012)
def stool(name, loc, h=0.75):
    lathe(f'{name}_Base', FR, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.015), (0.03, 0.03), (0.025, h - 0.03), (0.0, h - 0.03)], loc, silver, segs=12)
    lathe(f'{name}_Ring', FR, [(0.15, 0.28), (0.165, 0.28), (0.165, 0.3), (0.15, 0.3)], loc, chrome, segs=12)
    lathe(f'{name}_Seat', FR, [(0.0, h - 0.03), (0.17, h - 0.03), (0.18, h), (0.16, h + 0.03), (0.0, h + 0.035)], loc, lb, segs=14)
def plant(name, x, y, z=0.0, hgt=1.2, n=14):
    # a pot (a lathe, closed), its soil, and a fan of long blades: each a thin board, angled out (3D from every side)
    lathe(f'{name}_Pot', FR, [(0.0, 0.0), (0.17, 0.0), (0.21, 0.42), (0.0, 0.42)], (x, y, z), lacg, segs=12)
    cy(f'{name}_Soil', FR, 0.19, 0.015, (x, y, z + 0.42), soil, verts=12)
    rr = np.random.default_rng(len(name))
    for k in range(n):
        a = k / n * math.tau + rr.uniform(-0.2, 0.2); tilt = rr.uniform(0.2, 0.6); L = hgt * rr.uniform(0.55, 1.0)
        bbox(f'{name}_Blade{k}', FR, (0.05, 0.008, L), (x + math.cos(a) * 0.05 + math.sin(tilt) * math.cos(a) * L / 2, y + math.sin(a) * 0.05 + math.sin(tilt) * math.sin(a) * L / 2, z + 0.42 + math.cos(tilt) * L / 2),
             green_p, rot=(0, tilt, a), bev=0.002)
def cup(name, loc, s=1.0, mat=None):
    lathe(name, FR, [(0.0, 0.0), (0.03 * s, 0.0), (0.034 * s, 0.09 * s), (0.031 * s, 0.09 * s), (0.0, 0.012 * s)], loc, mat or lac, segs=10)
def trophy(name, loc, s=1.0, mat=None):
    m = mat or col((0.85, 0.66, 0.2))
    bx(f'{name}_Base', FR, (0.08 * s, 0.08 * s, 0.03 * s), Vector(loc) + Vector((0, 0, 0.015 * s)), blk)
    lathe(f'{name}_Cup', FR, [(0.0, 0.0), (0.03, 0.0), (0.012, 0.02), (0.01, 0.08), (0.04, 0.1), (0.05, 0.17), (0.0, 0.16)], Vector(loc) + Vector((0, 0, 0.03 * s)), m, segs=12)
def coffee_machine(name, loc, rotz):
    # a bean-to-cup machine: brushed body, the black panel with its lit buttons, the spout, the drip tray, the hopper
    P, r = T(loc, rotz)
    bbox(f'{name}_Body', FR, (0.34, 0.42, 0.44), P(0, 0.02, 0.22), silver, rot=r, bev=0.02)
    bx(f'{name}_Panel', FR, (0.28, 0.01, 0.12), P(0, -0.195, 0.36), blk, rot=r)
    for k in range(4): bx(f'{name}_Btn{k}', FR, (0.03, 0.006, 0.015), P(-0.09 + k * 0.06, -0.202, 0.35), glow_b, rot=r)
    bx(f'{name}_Spout', FR, (0.08, 0.06, 0.04), P(0, -0.2, 0.25), blk, rot=r)
    bbox(f'{name}_Tray', FR, (0.26, 0.12, 0.03), P(0, -0.22, 0.015), blk, rot=r, bev=0.005)
    cup(f'{name}_Cup', P(0, -0.22, 0.03), 0.9)
    lathe(f'{name}_Hopper', FR, [(0.0, 0.0), (0.08, 0.0), (0.09, 0.08), (0.0, 0.08)], P(0.06, 0.1, 0.44), see(f'{name}_Beans', (0.3, 0.2, 0.12), 0.7), segs=10)
def clock(name, loc, rotz, k):
    # a wall clock: the rim, its back, the face (the city printed under it on a plate)
    P, r = T(loc, rotz)
    lathe(f'{name}_Rim', FR, [(0.0, 0.0), (0.17, 0.0), (0.18, 0.04), (0.0, 0.04)], P(0, 0.0, 0), silver, segs=18, rot=(-D90, 0, rotz))
    cd(f'{name}_Face', FR, 0.3, 0.366, P(0, -0.003, -0.21), art(f'clock{k}', 0.02), rotz=rotz)
    bx(f'{name}_Plate', FR, (0.3, 0.02, 0.07), P(0, 0.008, -0.175), blk, rot=r)   # (behind the city's name)
def headset(name, loc, rotz):
    P, r = T(loc, rotz)
    sweep(f'{name}_Band', FR, [P(-0.09, 0, -0.08), P(-0.06, 0, 0.04), P(0.06, 0, 0.04), P(0.09, 0, -0.08)], 0.012, blk, segs=5, per_m=20)
    for s in (-1, 1): cy(f'{name}_Cup{s}', FR, 0.045, 0.035, P(s * 0.095, -0.01, -0.12), blk, rot=(0, D90, rotz), verts=10)
    rd(f'{name}_Mic', FR, P(-0.11, -0.01, -0.12), P(-0.05, -0.08, -0.17), 0.006, blk, verts=4)
def rack19(name, loc, rotz, h=1.8):
    # a 19-inch rack: the black cabinet, a glass door, the kit in it (radios, a switch, the timing receiver), lit
    P, r = T(loc, rotz); w, d = 0.6, 0.7
    for s in (-1, 1): bx(f'{name}_Side{s}', FR, (0.02, d, h), P(s * (w / 2 - 0.01), 0, h / 2), blk, rot=r)
    for z in (0.01, h - 0.01): bx(f'{name}_Cap{z:.2f}', FR, (w, d, 0.02), P(0, 0, z), blk, rot=r)
    bx(f'{name}_BackPanel', FR, (w, 0.02, h), P(0, d / 2 - 0.01, h / 2), blk, rot=r)
    for k in range(8):
        z = 0.15 + k * 0.19; bbox(f'{name}_Unit{k}', FR, (w - 0.06, d - 0.1, 0.13), P(0, 0.02, z), lacg if k % 2 else blk, rot=r, bev=0.004)
        for j in range(3): bx(f'{name}_Led{k}{j}', FR, (0.015, 0.006, 0.008), P(-0.2 + j * 0.03, -d / 2 + 0.07, z + 0.03), glow_g if (k + j) % 3 else glow_b, rot=r)
        bx(f'{name}_Knob{k}', FR, (0.04, 0.02, 0.04), P(0.18, -d / 2 + 0.07, z), silver, rot=r)
    bx(f'{name}_Door', FR, (w - 0.02, 0.01, h - 0.04), P(0, -d / 2 + 0.005, h / 2), see(f'{name}_DoorGlass', (0.15, 0.2, 0.25), 0.35), rot=r)
    rd(f'{name}_Handle', FR, P(w / 2 - 0.06, -d / 2 - 0.02, h / 2 - 0.15), P(w / 2 - 0.06, -d / 2 - 0.02, h / 2 + 0.15), 0.008, chrome, verts=5)
def model_car(name, loc, rotz, main, acc, s=1.0):
    # a scale model on its little stand: the tub, the sidepods, the nose, both wings, four wheels, a driver's helmet
    # (s: its size over 1:18)
    P0, r = T(loc, rotz); P = lambda a, b, c: P0(a * s, b * s, c * s); cm, ca = col(main), col(acc)
    S3 = lambda v: tuple(x * s for x in v)
    bx(f'{name}_Stand', FR, S3((0.1, 0.28, 0.008)), P(0, 0, 0.004), blkglass, rot=r)
    bbox(f'{name}_Tub', FR, S3((0.05, 0.2, 0.03)), P(0, 0.01, 0.033), cm, rot=r, bev=0.006 * s)
    for sd in (-1, 1): bbox(f'{name}_Pod{sd}', FR, S3((0.03, 0.08, 0.022)), P(sd * 0.035, 0.03, 0.03), cm, rot=r, bev=0.005 * s)
    bbox(f'{name}_Nose', FR, S3((0.026, 0.08, 0.016)), P(0, -0.115, 0.026), ca, rot=(0.12, 0, rotz), bev=0.004 * s)
    bx(f'{name}_FWing', FR, S3((0.1, 0.022, 0.004)), P(0, -0.15, 0.014), ca, rot=r)
    bx(f'{name}_RWing', FR, S3((0.08, 0.02, 0.012)), P(0, 0.12, 0.062), cm, rot=r)
    for sd in (-1, 1): bx(f'{name}_RPlate{sd}', FR, S3((0.003, 0.03, 0.03)), P(sd * 0.04, 0.12, 0.05), ca, rot=r)
    for sx in (-1, 1):
        for sy, rr in ((-1, 0.015), (1, 0.018)): cy(f'{name}_Wheel{sx}{sy}', FR, rr * s, 0.016 * s, P(sx * 0.05, sy * 0.085 + 0.01, rr), blk, rot=(0, D90, rotz), verts=8)
    lathe(f'{name}_Helmet', FR, [(0.0, 0.0), (0.009 * s, 0.0), (0.01 * s, 0.008 * s), (0.0, 0.014 * s)], P(0, -0.01, 0.046), col((0.95, 0.85, 0.2)), segs=8)
def glass_shelf(name, loc, rotz, w, d=0.28):
    P, r = T(loc, rotz)
    bx(f'{name}_Glass', FR, (w, d, 0.012), P(0, 0, 0), shelfglass, rot=r)
    for s in (-1, 1): bx(f'{name}_Bracket{s}', FR, (0.03, d - 0.04, 0.03), P(s * (w / 2 - 0.15), 0.01, -0.02), chrome, rot=r)
    bx(f'{name}_LED', FR, (w - 0.04, 0.012, 0.006), P(0, -d / 2 + 0.01, -0.01), glow_w, rot=r)   # (a light strip under its front edge: the models lit)
def low_cabinet(name, loc, rotz, w, h=0.7, d=0.48, mat=lac, top=None, doors=2):
    P, r = T(loc, rotz)
    bx(f'{name}_Plinth', FR, (w - 0.06, d - 0.06, 0.06), P(0, 0.02, 0.03), blk, rot=r)
    bbox(f'{name}_Body', FR, (w, d, h - 0.06), P(0, 0, 0.06 + (h - 0.06) / 2), mat, rot=r, bev=0.006)
    if top: bx(f'{name}_Top', FR, (w + 0.02, d + 0.02, 0.025), P(0, 0, h + 0.0125), top, rot=r)
    for k in range(doors):
        x = -w / 2 + w * (k + 0.5) / doors; bx(f'{name}_Gap{k}', FR, (0.004, 0.004, h - 0.12), P(-w / 2 + w * k / doors, -d / 2 - 0.001, 0.06 + (h - 0.06) / 2), blk, rot=r) if k else None
        bx(f'{name}_Pull{k}', FR, (0.16, 0.012, 0.012), P(x, -d / 2 - 0.006, h - 0.07), silver, rot=r)

# =====================================================================================================================
# YOUR OFFICE (upstairs, x -19..-10, y -6.5..0): the desk from the lock-up against the back wall at x -14.5, its chair
# in front; the credenza and its screens to its right, the season plan over a cabinet to its left, the wall of models
# on the left wall with the livery drawings over them, the lounge by the glass, a plant in the corner
OX0, OX1 = X0 + 0.02, AX0 - 2.0
# the credenza: white lacquer, black glass top, two flat screens, the phone, the coffee machine at its end
low_cabinet('Fr_Off_Credenza', (-12.1, -0.37, Z), 0.0, 2.6, h=0.72, d=0.5, top=blkglass, doors=4)
flat_screen('Fr_Off_ScreenA', (-12.8, -0.42, Z + 0.745), 0.12, 0.5, 'tele')
flat_screen('Fr_Off_ScreenB', (-12.15, -0.4, Z + 0.745), -0.05, 0.5, 'timing')
put('fr_phone', FR, (-11.65, -0.45, Z + 0.745), math.pi + 0.3, name='Fr_Off_Phone')
coffee_machine('Fr_Off_Coffee', (-11.15, -0.36, Z + 0.745), 0.0)
cup('Fr_Off_CupA', (-11.45, -0.52, Z + 0.745))
# the trophy shelf over it, three cups and a plate
glass_shelf('Fr_Off_TrophyShelf', (-12.1, -0.25, Z + 1.75), 0.0, 2.2, d=0.26)
for k, x in enumerate((-12.9, -12.3, -11.6)): trophy(f'Fr_Off_Trophy{k}', (x, -0.26, Z + 1.756), 1.0 if k != 1 else 1.3, None if k != 2 else col((0.75, 0.76, 0.8)))
bx('Fr_Off_Plate', FR, (0.2, 0.02, 0.14), (-11.15, -0.16, Z + 1.83), silver, rot=(0.1, 0, 0))
# the season plan: a glass board on standoffs over a low grey cabinet (binders on it)
low_cabinet('Fr_Off_Cabinet', (-17.4, -0.37, Z), 0.0, 2.2, h=0.62, d=0.48, mat=lacg, top=blkglass, doors=3)
for k in range(5): put('fr_binder', FR, (-18.2 + k * 0.09, -0.37, Z + 0.645), 0.0, name=f'Fr_Off_Binder{k}')
bx('Fr_Off_PlanGlass', FR, (2.2, 0.012, 1.1), (-17.4, -0.16, Z + 1.65), frost)
cd('Fr_Off_PlanPrint', FR, 2.12, 1.06, (-17.4, -0.168, Z + 1.12), art('season', 0.02))
for sx in (-1, 1):
    for sz in (-1, 1): cy(f'Fr_Off_Standoff{sx}{sz}', FR, 0.015, 0.06, (-17.4 + sx * 1.0, -0.13, Z + 1.65 + sz * 0.45), chrome, rot=(D90, 0, 0), verts=8)
# the wall of models: four glass shelves on the left wall, four 1:18 cars a shelf (every livery the team's run), lit
LIV = [((0.8, 0.1, 0.1), (0.95, 0.95, 0.95)), ((0.1, 0.18, 0.5), (0.95, 0.78, 0.1)), ((0.08, 0.08, 0.09), (0.3, 0.75, 1.0)), ((0.95, 0.95, 0.95), (0.85, 0.1, 0.1)),
       ((0.1, 0.45, 0.25), (0.95, 0.95, 0.9)), ((0.95, 0.55, 0.1), (0.1, 0.1, 0.12)), ((0.55, 0.6, 0.65), (0.1, 0.3, 0.8)), ((0.9, 0.8, 0.1), (0.1, 0.1, 0.1))]
bbox('Fr_Off_ModelPanel', FR, (0.03, 4.4, 1.6), (OX0 + 0.015, -3.6, Z + 1.45), lacg, bev=0.004)   # (a dark panel behind them)
for i, z in enumerate((0.85, 1.2, 1.55, 1.9)):
    glass_shelf(f'Fr_Off_ModelShelf{i}', (OX0 + 0.17, -3.6, Z + z), D90, 4.2)
    for j in range(3):   # (1:12: big enough to tell apart from across the room)
        m, a = LIV[(i * 3 + j) % len(LIV)]
        model_car(f'Fr_Off_Model{i}{j}', (OX0 + 0.17, -5.0 + j * 1.4, Z + z + 0.006), D90 - 0.4, m, a, s=1.5)
# the livery drawings over them, framed
for k, y in enumerate((-5.0, -3.6, -2.2)): framed(f'Fr_Off_Livery{k}', (OX0 + 0.035, y, Z + 2.25), D90, 0.84, 0.52, f'livery{k}', frame_mat=silver)
# the lounge: a white leather sofa facing the lake, a glass table with the magazines, an armchair; the rug under them
rectf('WALK_Fr_Off_Rug', -18.0, -6.25, -13.6, -3.8, Z + 0.006, fab2)
bx('Fr_Off_RugEdge', FR, (4.4, 2.45, 0.006), (-15.8, -5.025, Z + 0.003), blk)
sofa('Fr_Off_Sofa', (-16.7, -4.45, Z), 0.0, 2.2)
low_table('Fr_Off_Table', (-16.7, -5.55, Z), 0.0, 1.1, 0.55)
for k in range(3): magazine(f'Fr_Off_Mag{k}', (-16.95 + k * 0.22, -5.55 + (k % 2) * 0.05, Z + 0.39), 0.25 * (k - 1), k)
sofa('Fr_Off_Armchair', (-14.4, -5.3, Z), -D90 - 0.3, 0.95, mat=lb)
plant('Fr_Off_Plant', -18.35, -5.95, Z, 1.0)
stand(20, (-16.7, -4.55, Z), 0.0, 'sit_idle')

# =====================================================================================================================
# RACE OPS (upstairs, x -19..-10, y 0..7.5; the data station along its back): the video wall on the left wall, the
# strategy table, the clocks and the headsets on the front wall, the radio rack by the glass
bbox('Fr_Ops_WallBack', FR, (0.04, 3.6, 1.7), (X0 + 0.04, 2.2, Z + 1.7), blk, bev=0.004)
for k, (png, y, zz) in enumerate((('tele', 1.0, 2.15), ('timing', 2.2, 2.15), ('trackmap', 3.4, 2.15), ('weather', 1.0, 1.28), ('runlog', 2.2, 1.28), ('cfd', 3.4, 1.28))):
    flat_screen(f'Fr_Ops_Wall{k}', (X0 + 0.15, y, Z + zz), D90, 1.1, png, desk=False, emit=1.0)
# the strategy table: white lacquer on two pedestals, the circuit lit in its glass top, chairs round it
bbox('Fr_Ops_TableTop', FR, (2.6, 1.15, 0.05), (-14.6, 1.95, Z + 0.74), lac, bev=0.02)
cd('Fr_Ops_TableMap', FR, 1.5, 0.9, (-14.6, 1.5, Z + 0.767), art('trackmap', 0.01, 0.9), tilt=-D90)
for s in (-1, 1): lathe(f'Fr_Ops_TablePed{s}', FR, [(0.0, 0.0), (0.3, 0.0), (0.3, 0.02), (0.06, 0.05), (0.05, 0.72), (0.0, 0.72)], (-14.6 + s * 0.8, 1.95, Z), silver, segs=12)
for k, (x, y, rz) in enumerate(((-15.6, 1.1, 0.0), (-14.6, 1.1, 0.0), (-13.6, 1.1, 0.0), (-15.6, 2.8, math.pi), (-13.6, 2.8, math.pi))):
    put('fr_chair', FR, (x, y, Z), rz + 0.15 * (k % 2), name=f'Fr_Ops_Chair{k}')
put('fr_papers', FR, (-15.2, 2.1, Z + 0.765), 0.3, name='Fr_Ops_Papers'); put('fr_mug', FR, (-13.9, 2.25, Z + 0.765), 0.0, name='Fr_Ops_Mug')
# the clocks along the front wall (it's the office's back: a white wall this side too), over the headset rail
for k, x in enumerate((-17.9, -17.0, -16.1, -15.2)): clock(f'Fr_Ops_Clock{k}', (x, 0.12, Z + 2.45), math.pi, k)
bx('Fr_Ops_HookRail', FR, (1.4, 0.03, 0.04), (-12.1, 0.12, Z + 1.62), silver)
for k in range(4):
    x = -12.65 + k * 0.37; bx(f'Fr_Ops_Hook{k}', FR, (0.02, 0.08, 0.02), (x, 0.17, Z + 1.6), silver)
    headset(f'Fr_Ops_Headset{k}', (x, 0.2, Z + 1.6), math.pi)
rack19('Fr_Ops_Rack', (-10.6, 0.7, Z), -D90)
stand(21, (-14.6, 0.75, Z), math.pi, 'talk'); stand(22, (-13.3, 1.0, Z), math.pi + 0.5, 'talk')

# =====================================================================================================================
# THE CAFE (upstairs, x -19..2, y 7.5..14): the back run (fridges, the coffee bar) under the menu, the serving counter
# with its glass and the cakes, round tables, a ledge of stools along the glass to the atrium
CZ = Z
for k, x in enumerate((-18.5, -17.85)):   # (two glass-door fridges: a lit inside, the bottles, the door)
    P, r = T((x, 13.62, CZ), 0.0)
    for s in (-1, 1): bx(f'Fr_Cafe_Fridge{k}_Side{s}', FR, (0.03, 0.6, 1.9), P(s * 0.3, 0, 0.95), lac)
    for zz in (0.02, 1.88): bx(f'Fr_Cafe_Fridge{k}_Cap{zz:.2f}', FR, (0.6, 0.6, 0.04), P(0, 0, zz), lac)
    bx(f'Fr_Cafe_Fridge{k}_Back', FR, (0.57, 0.02, 1.84), P(0, 0.27, 0.95), glow_w)
    bx(f'Fr_Cafe_Fridge{k}_Head', FR, (0.6, 0.04, 0.18), P(0, -0.28, 1.78), blue)
    for j, zz in enumerate((0.25, 0.65, 1.05, 1.45)):
        bx(f'Fr_Cafe_Fridge{k}_Shelf{j}', FR, (0.55, 0.5, 0.01), P(0, 0, zz), shelfglass)
        for b in range(5): cy(f'Fr_Cafe_Fridge{k}_Bottle{j}{b}', FR, 0.03, 0.22, P(-0.2 + b * 0.1, -0.08, zz + 0.12), col(((0.8, 0.2, 0.1), (0.1, 0.4, 0.8), (0.9, 0.8, 0.2), (0.2, 0.7, 0.3))[(b + j) % 4]), verts=8)
    bx(f'Fr_Cafe_Fridge{k}_Door', FR, (0.58, 0.015, 1.7), P(0, -0.3, 0.9), see(f'Fr_Cafe_FridgeGlass{k}', (0.7, 0.85, 0.95), 0.2))
    rd(f'Fr_Cafe_Fridge{k}_Handle', FR, P(0.24, -0.33, 0.6), P(0.24, -0.33, 1.2), 0.01, chrome, verts=5)
low_cabinet('Fr_Cafe_BackRun', (-15.2, 13.65, CZ), 0.0, 4.4, h=0.9, d=0.6, top=stone, doors=6)
coffee_machine('Fr_Cafe_Coffee1', (-16.4, 13.68, CZ + 0.925), 0.0); coffee_machine('Fr_Cafe_Coffee2', (-15.7, 13.68, CZ + 0.925), 0.0)
for k in range(6): cup(f'Fr_Cafe_Stack{k}', (-14.8, 13.7, CZ + 0.925 + k * 0.07), 1.0)
put('fr_cooler', FR, (-12.6, 13.6, CZ), math.pi, name='Fr_Cafe_Cooler')
bbox('Fr_Cafe_MenuFrame', FR, (1.5, 0.04, 1.9), (-15.2, 13.95, CZ + 2.05), blk, bev=0.01)
cd('Fr_Cafe_Menu', FR, 1.4 * 0.8, 1.4, (-15.2, 13.925, CZ + 1.35), art('menu', 0.03))
# the serving counter: white lacquer, a stone top, the sneeze glass on chrome posts, two cake domes, a till
bbox('Fr_Cafe_Counter', FR, (5.0, 0.7, 1.0), (-15.5, 12.25, CZ + 0.5), lac, bev=0.01)
bx('Fr_Cafe_CounterTop', FR, (5.1, 0.78, 0.04), (-15.5, 12.25, CZ + 1.02), stone)
strip('Fr_Cafe_CounterLED', (-18.0, 11.88), (-13.0, 11.88), CZ + 0.06)
bx('Fr_Cafe_Sneeze', FR, (3.0, 0.012, 0.4), (-15.9, 12.35, CZ + 1.3), shelfglass)
for k, x in enumerate((-17.35, -14.45)): rd(f'Fr_Cafe_SneezePost{k}', FR, (x, 12.35, CZ + 1.04), (x, 12.35, CZ + 1.5), 0.012, chrome, verts=6)
for k, x in enumerate((-17.0, -16.2)):
    lathe(f'Fr_Cafe_CakePlate{k}', FR, [(0.0, 0.0), (0.16, 0.0), (0.16, 0.012), (0.0, 0.012)], (x, 12.15, CZ + 1.04), lac, segs=14)
    cy(f'Fr_Cafe_Cake{k}', FR, 0.11, 0.08, (x, 12.15, CZ + 1.092), col(((0.45, 0.25, 0.12), (0.9, 0.85, 0.7))[k]), verts=12)
    lathe(f'Fr_Cafe_Dome{k}', FR, [(0.15, 0.0), (0.15, 0.12), (0.1, 0.2), (0.0, 0.22)], (x, 12.15, CZ + 1.052), domeglass, segs=14, cap0=False)
bbox('Fr_Cafe_Till', FR, (0.32, 0.3, 0.12), (-13.6, 12.2, CZ + 1.1), blk, bev=0.01)
flat_screen('Fr_Cafe_TillScreen', (-13.6, 12.25, CZ + 1.16), 0.0, 0.26, 'menu', emit=0.6)
# the tables: four round, three or four chairs each; a plant; the ledge along the glass with its stools
for t, (x, y, n) in enumerate(((-10.2, 10.2, 3), (-7.0, 12.3, 4), (-4.0, 10.3, 3), (-1.0, 12.4, 3))):
    table_round(f'Fr_Cafe_Table{t}', (x, y, CZ))
    for k in range(n):
        a = k / n * math.tau + t; cafe_chair(f'Fr_Cafe_Chair{t}{k}', x + math.cos(a) * 0.72, y + math.sin(a) * 0.72, a - D90)
    cup(f'Fr_Cafe_Cup{t}', (x + 0.1, y - 0.1, CZ + 0.74)); magazine(f'Fr_Cafe_Paper{t}', (x - 0.12, y + 0.1, CZ + 0.74), 0.4 + t, t % 3) if t % 2 else None
bbox('Fr_Cafe_Ledge', FR, (8.3, 0.34, 0.04), (-2.85, CY1 + 0.22, CZ + 1.04), stone, bev=0.006)   # (from past the door at x -8.5..-7.4: it ran across it)
for k, x in enumerate((-6.6, -4.6, -2.6, -0.6, 1.0)):
    rd(f'Fr_Cafe_LedgeBracket{k}', FR, (x, CY1 + 0.06, CZ + 1.0), (x, CY1 + 0.3, CZ + 1.0), 0.01, chrome, verts=4)
for k in range(6): stool(f'Fr_Cafe_Stool{k}', (-6.3 + k * 1.4, CY1 + 0.7, CZ))
plant('Fr_Cafe_Plant', 1.4, 13.5, CZ, 1.4)
stand(23, (-7.0 + 0.72 * math.cos(1.0), 12.3 + 0.72 * math.sin(1.0), CZ), 1.0 - D90, 'sit_idle'); stand(24, (-4.6, CY1 + 0.75, CZ), math.pi, 'lean')

# =====================================================================================================================
# THE SIM SUITE (upstairs, x 2..19, y 7.5..14; the sims on its back wall): dark on purpose, designed: fabric acoustic
# panels all round, a blue LED line along the floor's edge, a low wall with the viewing sofa behind it, the big screen
SZ = Z
rectf('WALK_Fr_Sim_Carpet', 2.05, CY1 + 0.05, X1 - 0.05, Y1 - 0.05, SZ + 0.004, fab2)
for k in range(10):   # (acoustic panels: the left wall, the front wall either side of the door; alternate tones, a gap)
    for z0 in (0.4, 1.5):
        if k < 5: bbox(f'Fr_Sim_PanelL{k}{z0}', FR, (0.06, 1.15, 1.0), (2.12, 8.2 + k * 1.2, SZ + z0 + 0.5), fab if (k + int(z0)) % 2 else fab2, bev=0.02)
        else:
            x = 5.0 + (k - 5) * 1.3
            if x < 4.6: continue
            bbox(f'Fr_Sim_PanelF{k}{z0}', FR, (1.25, 0.06, 1.0), (x, CY1 + 0.12, SZ + z0 + 0.5), fab if (k + int(z0)) % 2 else fab2, bev=0.02)
for k, y in enumerate((8.2, 13.1)):   # (either side of the big screen)
    for z0 in (0.4, 1.5): bbox(f'Fr_Sim_PanelR{k}{z0}', FR, (0.06, 1.15, 1.0), (X1 - 0.12, y, SZ + z0 + 0.5), fab2 if (k + int(z0)) % 2 else fab, bev=0.02)
for nm, a, b in (('L', (2.15, CY1 + 0.15), (2.15, Y1 - 0.15)), ('R', (X1 - 0.15, CY1 + 0.15), (X1 - 0.15, Y1 - 0.15)), ('B', (2.15, Y1 - 0.15), (X1 - 0.15, Y1 - 0.15)), ('F', (4.3, CY1 + 0.15), (X1 - 0.15, CY1 + 0.15))):
    strip(f'Fr_Sim_LED{nm}', a, b, SZ + 0.012, w=0.03, h=0.01)
for nm, a, b in (('CoveL', (2.25, CY1 + 0.3), (2.25, Y1 - 0.3)), ('CoveF', (4.5, CY1 + 0.25), (X1 - 0.3, CY1 + 0.25)), ('CoveB', (2.4, Y1 - 0.25), (X1 - 0.3, Y1 - 0.25))):
    strip(f'Fr_Sim_{nm}', a, b, SZ + 2.75, w=0.05, h=0.02)   # (a cove of blue light up under the ceiling: the room's glow)
# the big screen on the right wall: telemetry from whoever's driving
bbox('Fr_Sim_BigScreen', FR, (0.08, 2.9, 1.5), (X1 - 0.1, 10.75, SZ + 1.65), silver, bev=0.01)
cd('Fr_Sim_BigPicture', FR, 2.8, 1.4, (X1 - 0.145, 10.75, SZ + 0.95), art('simtele', 0.01, 1.2), rotz=-D90)
# the low wall and the viewing sofa behind it
bbox('Fr_Sim_LowWall', FR, (9.0, 0.2, 1.0), (10.5, 10.1, SZ + 0.5), lacg, bev=0.01)
bx('Fr_Sim_LowWallTop', FR, (9.04, 0.24, 0.03), (10.5, 10.1, SZ + 1.015), blkglass)
strip('Fr_Sim_LowWallLED', (6.0, 9.97), (15.0, 9.97), SZ + 0.98, w=0.02, h=0.01)
sofa('Fr_Sim_Sofa', (9.0, 9.2, SZ), math.pi, 2.8, mat=lb)
sofa('Fr_Sim_Sofa2', (12.6, 9.2, SZ), math.pi, 2.2, mat=lb)
low_table('Fr_Sim_SideTable', (14.4, 9.0, SZ), 0.0, 0.5, 0.5, h=0.45)
for k in range(2): cy(f'Fr_Sim_Can{k}', FR, 0.033, 0.12, (14.3 + k * 0.15, 9.0, SZ + 0.52), col(((0.1, 0.2, 0.7), (0.85, 0.1, 0.1))[k]), verts=8)
stand(25, (9.0, 9.1, SZ), math.pi, 'sit_idle')

# =====================================================================================================================
# THE TUNNEL'S CONTROL POD (upstairs, x 10..19, y -6.5..-3.4, glass all round): the console along the hall's glass,
# its screens, the operators' chairs, the printer by the door
CZ2 = Z
bbox('Fr_Ctl_Console', FR, (6.8, 0.75, 0.72), (15.2, -3.85, CZ2 + 0.36), lacg, bev=0.01)
bx('Fr_Ctl_ConsoleTop', FR, (6.9, 0.85, 0.03), (15.2, -3.85, CZ2 + 0.735), blkglass)
strip('Fr_Ctl_ConsoleLED', (11.8, -4.24), (18.6, -4.24), CZ2 + 0.06, w=0.02, h=0.01)
for k, (x, png) in enumerate(((12.2, 'cfd'), (13.3, 'runlog'), (14.6, 'cfd'), (15.9, 'tele'), (17.0, 'runlog'), (18.1, 'weather'))):
    flat_screen(f'Fr_Ctl_Screen{k}', (x, -3.7, CZ2 + 0.75), (k - 2.5) * 0.06, 0.52, png)
for k, x in enumerate((12.4, 14.0, 15.9, 17.6)):
    bbox(f'Fr_Ctl_Keyboard{k}', FR, (0.42, 0.14, 0.02), (x, -4.05, CZ2 + 0.76), blk, bev=0.004)
    put('fr_chair', FR, (x, -4.75, CZ2), math.pi + 0.1 * (k - 1.5), name=f'Fr_Ctl_Chair{k}')
bbox('Fr_Ctl_PrinterStand', FR, (0.6, 0.5, 0.7), (18.4, -6.05, CZ2 + 0.35), lac, bev=0.008)
bbox('Fr_Ctl_Printer', FR, (0.5, 0.42, 0.3), (18.4, -6.05, CZ2 + 0.85), col((0.78, 0.78, 0.76)), bev=0.02)
bx('Fr_Ctl_PrinterTray', FR, (0.36, 0.2, 0.02), (18.4, -5.78, CZ2 + 0.82), col((0.6, 0.6, 0.6)))
cd('Fr_Ctl_Printout', FR, 0.21, 0.28, (18.4, -5.72, CZ2 + 0.835), art('runlog', 0.03), rotz=0.0, tilt=-D90)
stand(26, (15.2, -4.6, CZ2), math.pi, 'talk', 'engineer')

# =====================================================================================================================
# THE TIRE BAY (ground, x -19..-8, y -6.5..0, open to the Boulevard): heated racks along its back wall, every set in
# its cover (the team's colour), the wheels on a wall rack, the tire changer and the balancer, a warmer trolley, the air
# drop from the ceiling. (The game stacks your tires from the TIRES hook at (-18.4, -5.6) along +Y: that strip's clear)
def tire_cover(name, loc, rot, r=0.32, w=0.27):
    # a tire in its heated cover: the cover (team colour) round it, its black band, the cable's plug
    cy(f'{name}_Cover', FR, r, w, loc, TMb, rot=rot, verts=16)
    cy(f'{name}_Band', FR, r + 0.006, 0.05, loc, blk, rot=rot, verts=16)
def heated_rack(name, x):
    w, d = 2.5, 0.8; y = -0.12 - d / 2
    for sx in (-1, 1):
        for sy in (-1, 1): bx(f'{name}_Post{sx}{sy}', FR, (0.05, 0.05, 2.3), (x + sx * (w / 2 - 0.025), y + sy * (d / 2 - 0.025), 1.15), steel)
    for j, z in enumerate((0.06, 0.8, 1.54)):
        bx(f'{name}_Shelf{j}', FR, (w, d, 0.03), (x, y, z), steel)
        for k in range(3): tire_cover(f'{name}_T{j}{k}', (x - 0.8 + k * 0.8, y, z + 0.015 + 0.32), (D90, 0, 0))
    bbox(f'{name}_Heater', FR, (w, d, 0.3), (x, y, 2.45), lacg, bev=0.01)
    for k in range(8): bx(f'{name}_Grille{k}', FR, (0.02, 0.012, 0.18), (x - 1.0 + k * 0.28, y - d / 2 - 0.006, 2.45), blk)
    bx(f'{name}_Display', FR, (0.22, 0.012, 0.08), (x + 1.05, y - d / 2 - 0.008, 2.45), glow_r)
    strip(f'{name}_LED', (x - w / 2, y - d / 2 - 0.02), (x + w / 2, y - d / 2 - 0.02), 0.02, w=0.02, h=0.01)
for k, x in enumerate((-16.2, -13.5, -10.8)): heated_rack(f'Fr_Tire_Rack{k}', x)
# the wheel rack on the atrium's wall (x -8): rims with their tires on pegs, two rows
bx('Fr_Tire_WheelRail', FR, (0.06, 4.6, 0.08), (AX0 - 0.13, -3.4, 1.85), steel); bx('Fr_Tire_WheelRail2', FR, (0.06, 4.6, 0.08), (AX0 - 0.13, -3.4, 0.95), steel)
def wheel(name, loc, rot):
    lathe(f'{name}_Tire', FR, [(0.21, -0.13), (0.3, -0.13), (0.325, -0.1), (0.325, 0.1), (0.3, 0.13), (0.21, 0.13), (0.21, -0.13)], loc, rubber, segs=14, rot=rot)
    lathe(f'{name}_Rim', FR, [(0.0, 0.09), (0.21, 0.08), (0.21, -0.1), (0.0, -0.06)], loc, silver, segs=14, rot=rot)
    cy(f'{name}_Nut', FR, 0.045, 0.06, Vector(loc) + Euler(rot).to_matrix() @ Vector((0, 0, 0.11)), blk, rot=rot, verts=6)
for row, z in enumerate((0.62, 1.52)):
    for k in range(5):
        y = -5.6 + k * 1.05; rd(f'Fr_Tire_Peg{row}{k}', FR, (AX0 - 0.13, y, z + 0.33), (AX0 - 0.45, y, z + 0.33), 0.02, steel, verts=6)
        wheel(f'Fr_Tire_Wheel{row}{k}', (AX0 - 0.42, y, z + 0.33), (0, -D90, 0))   # (the rim's face to the room)
# the tire changer: its base, the turntable and its jaws, the column, the arm and the mount head, the pedals, a tank
def changer(name, loc, rotz):
    P, r = T(loc, rotz)
    bbox(f'{name}_Base', FR, (0.85, 0.6, 0.72), P(0, 0, 0.36), col((0.22, 0.24, 0.27)), rot=r, bev=0.02)
    bx(f'{name}_Stripe', FR, (0.86, 0.61, 0.06), P(0, 0, 0.6), redp, rot=r)
    cy(f'{name}_Table', FR, 0.3, 0.05, P(-0.05, -0.02, 0.745), silver, verts=16)
    for k in range(4): bx(f'{name}_Jaw{k}', FR, (0.08, 0.04, 0.05), P(-0.05 + math.cos(k * D90) * 0.24, -0.02 + math.sin(k * D90) * 0.24, 0.79), blk, rot=(0, 0, rotz + k * D90))
    bbox(f'{name}_Column', FR, (0.14, 0.14, 1.1), P(0.3, 0.22, 1.27), col((0.22, 0.24, 0.27)), rot=r, bev=0.01)
    bbox(f'{name}_Arm', FR, (0.5, 0.1, 0.1), P(0.08, 0.22, 1.75), col((0.22, 0.24, 0.27)), rot=r, bev=0.01)
    rd(f'{name}_Bar', FR, P(-0.12, 0.22, 1.75), P(-0.12, 0.0, 1.0), 0.025, silver, verts=8)
    bbox(f'{name}_Head', FR, (0.08, 0.1, 0.08), P(-0.12, 0.0, 0.96), blk, rot=r, bev=0.01)
    for k in range(3): bbox(f'{name}_Pedal{k}', FR, (0.08, 0.16, 0.04), P(-0.18 + k * 0.12, -0.36, 0.05), silver, rot=(0.25, 0, rotz), bev=0.006)
    cy(f'{name}_Tank', FR, 0.12, 0.5, P(0.48, 0.0, 0.3), redp, rot=(0, D90, rotz), verts=12)
changer('Fr_Tire_Changer', (-14.4, -2.7, 0), 0.0)
# the balancer: its base, the shaft with a wheel on it, the hood, the head with its display
P, r = T((-11.8, -2.7, 0), 0.0)
bbox('Fr_Tire_Balancer', FR, (0.55, 0.55, 0.9), P(0, 0, 0.45), col((0.22, 0.24, 0.27)), rot=r, bev=0.02)
rd('Fr_Tire_BalShaft', FR, P(-0.27, 0, 0.62), P(-0.55, 0, 0.62), 0.03, silver, verts=8)
wheel('Fr_Tire_BalWheel', P(-0.48, 0, 0.62), (0, -D90, 0))
# (the hood: a steel guard over the wheel's top half, raised on its hinge arm: a curved top in three panels, two cheeks)
for k, (ang, ln) in enumerate(((-0.75, 0.32), (0.0, 0.36), (0.75, 0.32))):
    bbox(f'Fr_Tire_BalHood{k}', FR, (0.36, ln, 0.03), P(-0.48, math.sin(ang) * 0.4, 0.62 + math.cos(ang) * 0.4), col((0.22, 0.24, 0.27)), rot=(-ang, 0, 0), bev=0.006)
for s_ in (-1, 1): bx(f'Fr_Tire_BalCheek{s_}', FR, (0.02, 0.62, 0.22), P(-0.48 + s_ * 0.18, 0.0, 0.92), col((0.22, 0.24, 0.27)))
rd('Fr_Tire_BalHinge', FR, P(-0.3, 0.3, 0.85), P(-0.12, 0.25, 0.75), 0.02, silver, verts=6)
bbox('Fr_Tire_BalHead', FR, (0.4, 0.2, 0.3), P(0.05, 0.12, 1.05), col((0.22, 0.24, 0.27)), rot=(-0.3, 0, 0), bev=0.02)
cd('Fr_Tire_BalDisplay', FR, 0.32, 0.18, P(0.05, 0.005, 0.96), art('tele', 0.01, 0.9), tilt=0.3)
bx('Fr_Tire_BalWeights', FR, (0.4, 0.12, 0.04), P(0.0, -0.22, 0.92), silver, rot=r)
# the warmer trolley: two stacks of covered tires on a steel trolley, the control box, its cables
bx('Fr_Tire_TrolleyDeck', FR, (1.4, 0.75, 0.04), (-16.6, -3.2, 0.18), steel)
for sx in (-1, 1):
    for sy in (-1, 1):
        bx(f'Fr_Tire_TrolleyLeg{sx}{sy}', FR, (0.04, 0.04, 0.14), (-16.6 + sx * 0.65, -3.2 + sy * 0.33, 0.09), steel)
        cy(f'Fr_Tire_TrolleyWheel{sx}{sy}', FR, 0.05, 0.04, (-16.6 + sx * 0.65, -3.2 + sy * 0.33, 0.05), rubber, rot=(0, D90, 0), verts=8)
for sx in (-1, 1):
    for j in range(2): tire_cover(f'Fr_Tire_Warm{sx}{j}', (-16.6 + sx * 0.36, -3.2, 0.2 + 0.135 + j * 0.28), (0, 0, 0))
bbox('Fr_Tire_WarmCtl', FR, (0.3, 0.16, 0.36), (-16.6, -2.72, 0.5), lacg, bev=0.01)
for k in range(4): bx(f'Fr_Tire_WarmLed{k}', FR, (0.04, 0.008, 0.02), (-16.7 + k * 0.065, -2.8, 0.6), glow_g if k < 3 else glow_r)
for sx in (-1, 1): sweep(f'Fr_Tire_WarmCable{sx}', FR, [(-16.6 + sx * 0.12, -2.72, 0.35), (-16.6 + sx * 0.3, -2.9, 0.28), (-16.6 + sx * 0.36, -3.05, 0.3)], 0.01, blk, segs=4, per_m=14)
# the air drop: a pipe down from the ceiling, its regulator, a coiled hose on a hook
rd('Fr_Tire_AirPipe', FR, (-9.0, -0.25, RH), (-9.0, -0.25, 1.4), 0.025, blue, verts=8)
bbox('Fr_Tire_AirReg', FR, (0.1, 0.1, 0.18), (-9.0, -0.25, 1.32), silver, bev=0.01)
cy('Fr_Tire_AirGauge', FR, 0.04, 0.02, (-9.0, -0.31, 1.36), glow_w, rot=(D90, 0, 0), verts=10)
lathe('Fr_Tire_AirCoil', FR, [(0.13, 0.0), (0.15, 0.03), (0.13, 0.06), (0.15, 0.09), (0.13, 0.12)], (-9.0, -0.4, 0.9), col((0.9, 0.4, 0.05)), segs=10, rot=(D90, 0, 0), cap0=False, cap1=False)
lathe('Fr_Tire_AirCoilCore', FR, [(0.0, 0.0), (0.12, 0.0), (0.12, 0.12), (0.0, 0.12)], (-9.0, -0.4, 0.9), blk, segs=10, rot=(D90, 0, 0))
stand(27, (-14.45, -3.5, 0), math.pi, 'kneel', 'mechanic')   # (facing the changer's front)

# =====================================================================================================================
# RECEPTION'S LOUNGE (the rotunda; the desk is the structure's): two white leather chairs and a glass table with the
# magazines, the factory's own model under an acrylic cover on a plinth
def lounge_chair(name, loc, rotz):
    P, r = T(loc, rotz)
    lathe(f'{name}_Foot', FR, [(0.0, 0.0), (0.26, 0.0), (0.26, 0.015), (0.04, 0.03), (0.035, 0.2), (0.0, 0.2)], P(0, 0, 0), silver, segs=12)
    bbox(f'{name}_Seat', FR, (0.72, 0.68, 0.18), P(0, -0.02, 0.32), lw, rot=r, bev=0.06)
    bbox(f'{name}_Back', FR, (0.74, 0.18, 0.5), P(0, 0.3, 0.6), lw, rot=(-0.2, 0, rotz), bev=0.06)
    for s in (-1, 1): bbox(f'{name}_Arm{s}', FR, (0.12, 0.6, 0.22), P(s * 0.36, 0.02, 0.48), lw, rot=r, bev=0.04)
RC = ROT
lounge_chair('Fr_Rec_Chair0', (RC.x - 2.15, RC.y + 0.55, 0), D90 + 0.2 + math.pi)
lounge_chair('Fr_Rec_Chair1', (RC.x - 1.65, RC.y + 1.55, 0), math.pi * 0.8 + math.pi)
low_table('Fr_Rec_Table', (RC.x - 1.35, RC.y + 0.65, 0), 0.4, 0.7, 0.5, h=0.4)
for k in range(2): magazine(f'Fr_Rec_Mag{k}', (RC.x - 1.45 + k * 0.2, RC.y + 0.62, 0.41), 0.4 + k * 0.5, k)
# the factory's model: a white plinth, the acrylic cover, inside: the lake, the curved glass front, the roof, the drum
MP = Vector((RC.x - 0.5, RC.y + 2.35, 0))
bbox('Fr_Rec_ModelPlinth', FR, (0.8, 0.6, 0.95), MP + Vector((0, 0, 0.475)), lac, bev=0.01)
bx('Fr_Rec_ModelBase', FR, (0.74, 0.54, 0.02), MP + Vector((0, 0, 0.96)), col((0.2, 0.32, 0.42)))
bbox('Fr_Rec_ModelBlock', FR, (0.6, 0.32, 0.12), MP + Vector((0, 0.06, 1.03)), lac, bev=0.01)
lathe('Fr_Rec_ModelFront', FR, [(0.3, 0.0), (0.3, 0.12)], MP + Vector((0, 0.0, 0.97)), see('Fr_Rec_ModelGlass', (0.4, 0.6, 0.8), 0.6), segs=14, rot=(0, 0, math.pi), cap0=False, cap1=False)
lathe('Fr_Rec_ModelDrum', FR, [(0.0, 0.0), (0.05, 0.0), (0.05, 0.08), (0.0, 0.09)], MP + Vector((-0.28, -0.08, 0.97)), lac, segs=10)
bx('Fr_Rec_ModelCover', FR, (0.76, 0.56, 0.28), MP + Vector((0, 0, 1.11)), see('Fr_Rec_Acrylic', (0.85, 0.9, 0.95), 0.15))
cd('Fr_Rec_ModelPlate', FR, 0.3, 0.06, MP + Vector((0, -0.301, 0.7)), art('case', 0.02))

# =====================================================================================================================
# THE CORRIDOR (y 6..7.5): a bank of lockers past the dyno's door, the notice board by the composites' window
for k in range(8):
    x = 8.5 + k * 0.45
    bbox(f'Fr_Cor_Locker{k}', FR, (0.44, 0.45, 1.85), (x, CY1 - 0.33, 0.925), lacg, bev=0.006)
    bx(f'Fr_Cor_LockerDoor{k}', FR, (0.4, 0.012, 1.7), (x, CY1 - 0.561, 0.95), col((0.36, 0.4, 0.46)))
    for j in range(4): bx(f'Fr_Cor_LockerVent{k}{j}', FR, (0.22, 0.006, 0.012), (x, CY1 - 0.569, 1.6 + j * 0.04), blk)
    bx(f'Fr_Cor_LockerHandle{k}', FR, (0.02, 0.025, 0.12), (x + 0.15, CY1 - 0.58, 1.0), silver)
    bx(f'Fr_Cor_LockerTag{k}', FR, (0.1, 0.006, 0.04), (x, CY1 - 0.569, 1.4), lac)
bbox('Fr_Cor_NoticeFrame', FR, (1.4, 0.03, 0.9), (1.7, CY1 - 0.12, 1.55), silver, bev=0.006)
bx('Fr_Cor_NoticeCork', FR, (1.32, 0.012, 0.82), (1.7, CY1 - 0.14, 1.55), col((0.6, 0.44, 0.28)))
for k, (dx, png, w, h) in enumerate(((-0.35, 'rota', 0.24, 0.32), (0.05, 'pallet', 0.2, 0.15), (0.4, 'forklift', 0.18, 0.24))):
    cd(f'Fr_Cor_Note{k}', FR, w, h, (1.7 + dx, CY1 - 0.147 - k * 0.0005, 1.3 + (0.12 if k == 1 else 0)), art(png, 0.08), rotz=0.0)

# =====================================================================================================================
# THE LOADING DOCK (ground, x -19..-3, y 7.5..14; the transporter's lane x -19..-3, y 9.25..12.25 kept clear): the dock
# leveller at the door, pallet racking along the back wall with the flight cases, the forklift and a pallet truck
# parked along the front, its warning sign; nothing in the way of the corridor's door (x -7.6..-5.8)
bx('Fr_Dock_Leveller', FR, (1.8, 2.8, 0.01), (X0 + 0.95, 10.0, 0.005), grimy_tile('Fr_Chequer', 'metal_plate_03.png', dirt=0.12, tint=(0.5, 0.52, 0.55)))
for s in (-1, 1): bx(f'Fr_Dock_LevEdge{s}', FR, (1.8, 0.08, 0.012), (X0 + 0.95, 10.0 + s * 1.42, 0.006), yel)
def racking(name, x0, x1, y0, y1, levels=(0.15, 1.2, 2.25)):
    for x in (x0, (x0 + x1) / 2, x1):
        for y in (y0, y1): bx(f'{name}_Up{x:.1f}{y:.1f}', FR, (0.08, 0.08, 3.1), (x, y, 1.55), blue)
    for z in levels:
        for y in (y0, y1): bx(f'{name}_Beam{z}{y:.1f}', FR, (x1 - x0, 0.05, 0.1), ((x0 + x1) / 2, y, z), col((0.9, 0.42, 0.08)))
        bx(f'{name}_Deck{z}', FR, (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.06), steel)
def flight_case(name, loc, rotz, w, d, h, stencil=True):
    P, r = T(loc, rotz)
    bbox(f'{name}_Body', FR, (w, d, h), P(0, 0, h / 2), blk, rot=r, bev=0.012)
    for zz in (0.02, h - 0.02):
        for sy in (-1, 1): bx(f'{name}_Edge{zz:.2f}{sy}', FR, (w + 0.01, 0.02, 0.025), P(0, sy * d / 2, zz), silver, rot=r)
    for sx in (-1, 1): bx(f'{name}_Corner{sx}', FR, (0.03, d + 0.01, h + 0.01), P(sx * w / 2, 0, h / 2), silver, rot=r)
    if stencil: cd(f'{name}_Stencil', FR, min(0.5, w * 0.6), min(0.2, w * 0.24), P(0, -d / 2 - 0.004, h * 0.45), art('case', 0.08), rotz=rotz)
racking('Fr_Dock_Rack', -18.6, -12.4, 12.6, 13.85)
for k, (x, z, w, h) in enumerate(((-17.8, 0.23, 1.0, 0.6), (-16.4, 0.23, 1.2, 0.8), (-14.7, 0.23, 1.0, 0.55), (-13.3, 0.23, 0.9, 0.7), (-17.5, 1.28, 1.3, 0.5), (-15.6, 1.28, 1.1, 0.7),
                                  (-13.6, 1.28, 1.2, 0.6), (-17.2, 2.33, 1.2, 0.5), (-14.6, 2.33, 1.6, 0.45))):
    flight_case(f'Fr_Dock_Case{k}', (x, 13.2, z), 0.0, w, 0.9, h, stencil=z < 1.3)
for k, (x, rz) in enumerate(((-11.4, 0.05), (-10.3, -0.04))): flight_case(f'Fr_Dock_FloorCase{k}', (x, 13.4, 0), rz, 0.95, 0.75, 0.9)
flight_case('Fr_Dock_FloorCaseTop', (-10.85, 13.45, 0.9), 0.1, 1.0, 0.7, 0.5)
# a pallet with boxes, its note
def pallet(name, loc, rotz):
    P, r = T(loc, rotz)
    for k in range(3): bx(f'{name}_Runner{k}', FR, (1.2, 0.1, 0.1), P(0, -0.45 + k * 0.45, 0.05), woodm, rot=r)
    for k in range(7): bx(f'{name}_Slat{k}', FR, (0.1, 1.0, 0.022), P(-0.55 + k * 0.183, 0, 0.111), woodm, rot=r)
pallet('Fr_Dock_Pallet', (-6.0, 13.35, 0), 0.0)
for k, (dx, dy, dz, s) in enumerate(((-0.28, -0.2, 0.122, 0.5), (0.25, -0.2, 0.122, 0.5), (0.0, 0.25, 0.122, 0.5), (-0.1, -0.1, 0.622, 0.45))):
    bbox(f'Fr_Dock_Box{k}', FR, (s, s * 0.8, s * 0.9), (-6.0 + dx, 13.35 + dy, dz + s * 0.45), col((0.62, 0.48, 0.3)), bev=0.006)
cd('Fr_Dock_PalletNote', FR, 0.18, 0.13, (-6.28, 12.945, 0.3), art('pallet', 0.06))
# the forklift: the chassis and counterweight, four wheels, the overhead guard, the seat and wheel, the mast and its forks
def forklift(name, loc, rotz):
    P, r = T(loc, rotz)
    bbox(f'{name}_Chassis', FR, (1.0, 1.7, 0.55), P(0, 0.05, 0.5), yel, rot=r, bev=0.04)
    bbox(f'{name}_Counter', FR, (1.02, 0.45, 0.7), P(0, 0.8, 0.6), col((0.15, 0.15, 0.16)), rot=r, bev=0.06)
    for sx in (-1, 1):
        cy(f'{name}_WheelF{sx}', FR, 0.27, 0.22, P(sx * 0.45, -0.5, 0.27), rubber, rot=(0, D90, rotz), verts=14)
        cy(f'{name}_WheelR{sx}', FR, 0.21, 0.18, P(sx * 0.43, 0.65, 0.21), rubber, rot=(0, D90, rotz), verts=14)
        for sy in (-1, 1): rd(f'{name}_Guard{sx}{sy}', FR, P(sx * 0.45, sy * 0.45 + 0.1, 0.78), P(sx * 0.45, sy * 0.45 + 0.1, 2.1), 0.025, blk, verts=6)
    bx(f'{name}_GuardTop', FR, (0.95, 1.0, 0.04), P(0, 0.1, 2.12), blk, rot=r)
    for k in range(5): bx(f'{name}_GuardBar{k}', FR, (0.03, 0.96, 0.03), P(-0.36 + k * 0.18, 0.1, 2.09), blk, rot=r)
    bbox(f'{name}_Seat', FR, (0.45, 0.45, 0.1), P(0, 0.35, 0.83), lb, rot=r, bev=0.03); bbox(f'{name}_SeatBack', FR, (0.45, 0.1, 0.4), P(0, 0.55, 1.05), lb, rot=r, bev=0.03)
    rd(f'{name}_Column', FR, P(0, -0.15, 0.78), P(0, -0.05, 1.15), 0.025, blk, verts=6)
    lathe(f'{name}_Wheel', FR, [(0.14, 0.0), (0.16, 0.0), (0.16, 0.025), (0.14, 0.025)], P(0, -0.03, 1.17), blk, segs=12, rot=(-0.6, 0, rotz))
    for sx in (-1, 1): bx(f'{name}_Mast{sx}', FR, (0.08, 0.12, 2.2), P(sx * 0.32, -0.88, 1.15), col((0.15, 0.15, 0.16)), rot=r)
    bx(f'{name}_MastBar', FR, (0.72, 0.1, 0.08), P(0, -0.88, 2.2), col((0.15, 0.15, 0.16)), rot=r)
    bx(f'{name}_Carriage', FR, (0.8, 0.06, 0.45), P(0, -0.96, 0.35), col((0.15, 0.15, 0.16)), rot=r)
    for sx in (-1, 1): bx(f'{name}_Fork{sx}', FR, (0.1, 1.0, 0.045), P(sx * 0.24, -1.48, 0.06), steel, rot=r)
    bx(f'{name}_Beacon', FR, (0.08, 0.08, 0.06), P(0, 0.3, 2.17), col((1.0, 0.55, 0.05)), rot=r)
forklift('Fr_Dock_Forklift', (-14.6, 8.35, 0), -D90)
# the pallet truck by the racking's end, its handle up
bx('Fr_Dock_PTForks', FR, (1.15, 0.52, 0.06), (-9.2, 13.3, 0.05), redp)
for s in (-1, 1): bx(f'Fr_Dock_PTFork{s}', FR, (1.15, 0.16, 0.08), (-9.2, 13.3 + s * 0.18, 0.05), redp)
bbox('Fr_Dock_PTPump', FR, (0.22, 0.4, 0.3), (-8.55, 13.3, 0.22), redp, bev=0.02)
rd('Fr_Dock_PTHandle', FR, (-8.55, 13.3, 0.35), (-8.4, 13.3, 1.2), 0.02, blk, verts=6)
bx('Fr_Dock_PTGrip', FR, (0.06, 0.36, 0.06), (-8.4, 13.3, 1.22), blk)
for s in (-1, 1): cy(f'Fr_Dock_PTWheel{s}', FR, 0.09, 0.06, (-8.55, 13.3 + s * 0.14, 0.09), rubber, rot=(D90, 0, 0), verts=10)
# the warning sign on the corridor's wall, dock side
bbox('Fr_Dock_SignBack', FR, (0.5, 0.02, 0.66), (-12.0, CY1 + 0.12, 2.1), lac, bev=0.004)
cd('Fr_Dock_Sign', FR, 0.46, 0.62, (-12.0, CY1 + 0.131, 1.79), art('forklift', 0.06), rotz=math.pi)
stand(28, (-10.4, 12.55, 0), 0.0, 'lean')
