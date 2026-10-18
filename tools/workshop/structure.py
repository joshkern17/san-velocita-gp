# tools/workshop/structure.py: run inside tools/garage-workshop.py (exec'd with its globals: the plan's numbers, B, dress,
# lights, hooks, garagelib's helpers). See that script's header for the layout.
# The building's fabric, made like the real thing: the portal frames (I-section columns on base plates, haunched
# rafters to a bolted apex, purlins, eaves struts, skylight trims), the mezzanine's steel (edge beam, hollow columns,
# joists), the stair (channel stringers, chequer treads with yellow nosings, tube handrails both sides, the landing),
# the doors (roll-ups with their drums, motors, hand chains and push-buttons, bollards; the fire exit; the back row's
# doors standing open so the doorways stay walkable; the stores hatch's shutter), the drains inside the roll-ups, and
# the light fittings (high-bays on chains, louvred panels, emergency lights). Objects St_..., signs ws_st_* drawn by
# tools/workshop/art_structure.py.
import subprocess

ART = os.path.join(SRC, 'workshop_art'); A = lambda n: os.path.join(ART, n + '.png')
if not all(os.path.exists(A(n)) for n in ('ws_st_exit', 'ws_st_dyno_sign', 'ws_st_parts', 'ws_st_office', 'ws_st_door_warn', 'ws_st_control')):
    subprocess.run(['python3', os.path.join(WS, 'art_structure.py')], check=True)

# (the blockout's mezzanine edge and columns, made properly below)
for o in [o for o in B.objects if o.name.startswith(('WALK_DeckEdge', 'Mezz_Column_'))]: bpy.data.objects.remove(o, do_unlink=True)

# ---------------- finishes ----------------
yellow = grimy_tile('St_Yellow', 'painted_metal.png', dirt=0.14, tint=(0.88, 0.68, 0.08))
hazard = grimy_tile('St_Hazard', 'hazard_stripes_01.png', dirt=0.15)
galv = grimy_tile('St_Galv', 'galvanized_metal.png', dirt=0.1)
chequer = grimy_tile('St_Chequer', 'metal_plate_03.png', dirt=0.15, tint=(0.5, 0.52, 0.55))   # (grey: the plate's own is rust-orange)
rubber = grimy_tile('St_Rubber', 'rubber.png', dirt=0.08)
black = plain_mat('St_Black', (0.06, 0.06, 0.07), dirt=0.06)
darkg = plain_mat('St_DarkGrey', (0.22, 0.23, 0.25), dirt=0.08)
whitep = plain_mat('St_White', (0.9, 0.9, 0.88), dirt=0.06)
greyp = plain_mat('St_Grey', (0.66, 0.68, 0.7), dirt=0.08)
red = plain_mat('St_Red', (0.72, 0.08, 0.06), dirt=0.06)
greenb = plain_mat('St_Green', (0.08, 0.55, 0.2), dirt=0.05)
doorblue = plain_mat('St_DoorBlue', (0.12, 0.2, 0.42), dirt=0.1)
doorgrey = plain_mat('St_DoorGrey', (0.5, 0.52, 0.55), dirt=0.12)
ss = plain_mat('St_Stainless', (0.72, 0.73, 0.74), dirt=0.05, rough=0.35)

def emit_mat(name, col, k):   # a texture that glows (lenses, louvres, vision panes)
    m = mat_img(name, save(name, col), 0.4)
    p = m.node_tree.nodes['Principled BSDF']; t = [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'][0]
    m.node_tree.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = k
    return m

# roll-up slats: 0.1 m slats with a dark joint, light grime low down (one tile = 0.8 m: 8 slats)
sl = np.ones((64, 64, 3), np.float32) * np.array([0.72, 0.74, 0.76], np.float32)
sl *= (1 - 0.22 * ((np.arange(64) % 8) == 0) - 0.08 * ((np.arange(64) % 8) == 1))[:, None, None]
sl *= (1 + (fbm(64, 64, (32, 8), wrap=True) - 0.5) * 0.05)[..., None]
slat_mat = mat_img('St_Slats', save('ws_st_slats', sl), 0.55)
# the vision strip: a slat with narrow panes every 0.4 m (one tile = 0.8 m wide, 0.2 m tall: two panes)
vs = np.ones((16, 64, 3), np.float32) * np.array([0.38, 0.4, 0.42], np.float32)   # (the strip's dark rubber surround)
for c0 in (8, 40): vs[4:12, c0:c0 + 16] = np.array([0.85, 0.9, 0.96], np.float32)    # (daylight through the panes)
vision_mat = emit_mat('St_Vision', vs, 0.12)
# louvres: a bright diffuser behind a grid of blades
lv = np.ones((32, 64, 3), np.float32) * np.array([0.95, 0.97, 1.0], np.float32)
lv[:, ::8] *= 0.35; lv[::8, :] *= 0.45; lv[15:17, :] *= 0.3
louvre = emit_mat('St_Louvre', lv, 5.0)
lamp = mat_img('St_Lamp', None, 0.5, emit=((1.0, 0.97, 0.9), 8.0))
estrip = mat_img('St_EmergencyStrip', None, 0.5, emit=((0.9, 0.95, 1.0), 2.0))
paned = mat_img('St_DoorPane', None, 0.3, emit=((0.55, 0.62, 0.7), 0.25))

# ---------------- helpers ----------------
def isec(name, p0, p1, depth, width, mat, tf=0.014, tw=0.01, coll=None):
    # a steel I-section from p0 to p1 (not vertical): flanges `width` across, `depth` deep (kept upright)
    coll = coll or B; p0, p1 = Vector(p0), Vector(p1); d = (p1 - p0).normalized(); up = Vector((0, 0, 1))
    n = (up - d * up.dot(d)).normalized()
    beam(f'{name}_TF', coll, p0 + n * (depth / 2 - tf / 2), p1 + n * (depth / 2 - tf / 2), width, tf, mat)
    beam(f'{name}_Web', coll, p0, p1, tw, depth - 2 * tf, mat)
    beam(f'{name}_BF', coll, p0 - n * (depth / 2 - tf / 2), p1 - n * (depth / 2 - tf / 2), width, tf, mat)

def chan(name, p0, p1, depth, flange, mat, out, t=0.012, coll=None):
    # a channel from p0 to p1 (upright web): its flanges run out to the side `out` (+1 / -1 along the horizontal normal)
    coll = coll or B; p0, p1 = Vector(p0), Vector(p1); d = (p1 - p0).normalized(); up = Vector((0, 0, 1))
    n = (up - d * up.dot(d)).normalized(); s = d.cross(n).normalized() * out
    beam(f'{name}_Web', coll, p0, p1, t, depth, mat)
    for k, sg in ((0, 1), (1, -1)):
        o = n * sg * (depth / 2 - t / 2) + s * (flange / 2 - t / 2)
        beam(f'{name}_F{k}', coll, p0 + o, p1 + o, flange, t, mat)

def plate_bolts(name, c, sx, sy, mat, bolts=4, inset=0.05, z=0.0, coll=None):
    # a base plate on the floor (or at z) with its anchor bolts: a stud and a hex nut each
    coll = coll or B
    box(f'{name}_Plate', coll, (sx, sy, 0.02), (c[0], c[1], z + 0.01), mat)
    pts = [(-1, -1), (1, -1), (1, 1), (-1, 1)] if bolts == 4 else [(-1, 0), (1, 0)]
    for k, (a, b) in enumerate(pts):
        x, y = c[0] + a * (sx / 2 - inset), c[1] + b * (sy / 2 - inset)
        cy(f'{name}_Nut{k}', coll, 0.018, 0.016, (x, y, z + 0.028), steel, verts=6)
        cy(f'{name}_Stud{k}', coll, 0.008, 0.035, (x, y, z + 0.045), steel, verts=5)

def prism(name, pts, axis, t, mat, coll=None):
    # a flat plate: the polygon pts (3D, in a plane) thickened t along axis (a haunch's web, a gusset)
    coll = coll or B; ax = Vector(axis).normalized() * t / 2; P = [Vector(p) for p in pts]; n = len(P)
    verts = [p - ax for p in P] + [p + ax for p in P]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate(); me.update()
    if sum((f.normal.dot(f.center - sum(verts, Vector()) / len(verts)) for f in me.polygons)) < 0: me.flip_normals()
    uv_world(me, Matrix.Identity(4), 0.5); o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return o

roof = lambda x: RIDGE - (RIDGE - EAVE) * abs(x) / 12          # (the roof liner's underside)
PD = 0.18; RD = 0.4                                               # (purlin, rafter depth)
zt = lambda x: roof(x) - PD - 0.01                                # (a rafter's top, under the purlins)

# ======================================================================================================================
# the portal frames: four, every ~6 m. Each column an I-section against the side wall (web across it), on a base plate;
# a haunched I-section rafter from its top to the apex plate at the ridge
CI = 12.0 - 0.3          # (the column's inner flange face, |x|)
for i, y in enumerate((Y0 + 0.15, -3.0, 3.0, Y1 - 0.15)):
    for s in (-1, 1):
        n = f'St_Frame{i}_{"L" if s < 0 else "R"}'; top = zt(11.85)
        box(f'{n}_ColIn', B, (0.014, 0.18, top), (s * (CI + 0.007), y, top / 2), frame)
        box(f'{n}_ColOut', B, (0.014, 0.18, top), (s * 11.985, y, top / 2), frame)
        box(f'{n}_ColWeb', B, (0.272, 0.01, top), (s * 11.85, y, top / 2), frame)
        box(f'{n}_Cap', B, (0.32, 0.2, 0.02), (s * 11.85, y, top + 0.01), frame)
        plate_bolts(f'{n}_Base', (s * 11.82, y), 0.42, 0.32, steel)
        for k, z in enumerate((top * 0.35, top * 0.7)):   # (web stiffeners, both sides)
            for sg in (-1, 1): box(f'{n}_Stiff{k}{sg}', B, (0.27, 0.08, 0.012), (s * 11.85, y + sg * 0.045, z), frame)
        # the rafter, from the column's face to the ridge, and its haunch below at the eaves
        p0, p1 = Vector((s * CI, y, zt(CI) - RD / 2)), Vector((0, y, zt(0) - RD / 2))
        isec(f'{n}_Rafter', p0, p1, RD, 0.18, frame)
        zb = lambda x: zt(x) - RD
        prism(f'{n}_HaunchWeb', [(s * CI, y, zb(CI)), (s * 10.2, y, zb(10.2)), (s * CI, y, zb(CI) - 0.45)], (0, 1, 0), 0.01, frame)
        beam(f'{n}_HaunchFlange', B, (s * CI, y, zb(CI) - 0.45 - 0.007), (s * 10.2, y, zb(10.2) - 0.007), 0.18, 0.014, frame)
        box(f'{n}_EndPlate', B, (0.02, 0.2, RD + 0.5), (s * (CI - 0.01), y, zt(CI) - (RD + 0.5) / 2), frame)
        for k, dz in enumerate((0.08, 0.3, 0.55, 0.8)):
            for sg in (-1, 1): cy(f'{n}_EndBolt{k}{sg}', B, 0.014, 0.05, (s * (CI - 0.035), y + sg * 0.06, zt(CI) - dz), steel, rot=(0, D90, 0), verts=6)
    # the apex: the two rafters' end plates bolted together
    box(f'St_Frame{i}_Apex', B, (0.04, 0.2, RD + 0.16), (0, y, zt(0) - (RD + 0.16) / 2 + 0.02), frame)
    for k, dz in enumerate((0.08, 0.22, 0.36, 0.5)):
        for sg in (-1, 1): cy(f'St_Frame{i}_ApexBolt{k}{sg}', B, 0.014, 0.1, (0, y + sg * 0.06, zt(0) - dz), steel, rot=(0, D90, 0), verts=6)
# eaves struts along each side, column top to column top
for s in (-1, 1):
    isec(f'St_EavesStrut_{s}', (s * 11.85, Y0 + 0.25, zt(11.85) - 0.1), (s * 11.85, Y1 - 0.25, zt(11.85) - 0.1), 0.2, 0.1, frame)
# purlins: cold-rolled channels on the rafters, the full length; the skylights sit between the ones at 3 and 5 m
PX = (0.5, 1.75, 3.0, 5.0, 6.25, 7.5, 8.75, 10.0, 11.25)
for s in (-1, 1):
    for x in PX:
        z = roof(x) - 0.01 - PD / 2
        chan(f'St_Purlin_{s * x:+.2f}', (s * x, Y0 + 0.02, z), (s * x, Y1 - 0.02, z), PD, 0.065, galv, out=-s, t=0.008)
# skylight trims: aluminium round each skylight's edge
for s in (-1, 1):
    for y in (-6.5, -2.0, 2.5, 7.0):
        for x in (3.0, 5.0): box(f'St_SkyTrim_{s}_{y}_{x}', B, (0.06, 2.46, 0.05), (s * x, y, roof(x) - 0.035), alu)
        for dy in (-1.2, 1.2): beam(f'St_SkyTrim_{s}_{y}_{dy:+.1f}', B, (s * 3.0, y + dy, roof(3.0) - 0.035), (s * 5.0, y + dy, roof(5.0) - 0.035), 0.06, 0.05, alu)

# ======================================================================================================================
# the mezzanine: an I-section edge beam on square hollow columns, joists across to a ledger on the right wall
EB_X = MX + 0.12
isec('St_Mezz_EdgeBeam', (EB_X, Y0 + 0.02, DECK_Z - 0.15), (EB_X, Y1 - 0.02, DECK_Z - 0.15), 0.3, 0.15, frame)
box('St_Mezz_Ledger', B, (0.06, Y1 - Y0 - 0.04, 0.2), (X1 - 0.03, 0, DECK_Z - 0.35), frame)
for k, y in enumerate(np.arange(Y0 + 0.5, Y1 - 0.4, 1.0)):
    if abs(y - BACK_Y) < 0.2: continue   # (the office's partition comes up there)
    isec(f'St_Mezz_Joist_{k}', (EB_X + 0.08, y, DECK_Z - 0.35), (X1 - 0.06, y, DECK_Z - 0.35), 0.2, 0.1, frame)
for y in (-8.7, -4.5, -1.2, 4.5, 8.7):
    n = f'St_Mezz_Col_{y:+.1f}'; h = DECK_Z - 0.3
    box(n, B, (0.2, 0.2, h - 0.02), (EB_X, y, (h - 0.02) / 2), frame)
    box(f'{n}_Cap', B, (0.26, 0.26, 0.02), (EB_X, y, h - 0.01), frame)
    plate_bolts(f'{n}_Base', (EB_X, y), 0.32, 0.32, steel)
    box(f'{n}_Tape', B, (0.206, 0.206, 0.9), (EB_X, y, 0.47), hazard, uvs=2.5)   # (hazard tape, waist high)

# ======================================================================================================================
# the stair: channel stringers, chequer-plate treads with yellow nosings on cleats, tube handrails both sides, a landing
go, rise = run / nst, DECK_Z / nst; k_sl = rise / go
nose = lambda y: rise + (y - ST_Y0) * k_sl                 # (the line through the treads' front edges)
zc = lambda y: nose(y) - 0.13                              # (the stringers' middle)
ys0 = ST_Y0 + (0.06 + 0.13 - rise) / k_sl; ys1 = ST_Y0 + (DECK_Z - 0.2 + 0.13 - rise) / k_sl
cxs = (ST_X0 + ST_X1) / 2; tw_ = sw - 0.12
for i in range(nst):
    yc = ST_Y0 + run * (i + 0.5) / nst; zt_ = rise * (i + 1)
    box(f'WALK_St_Tread_{i:02d}', B, (tw_, go + 0.03, 0.03), (cxs, yc, zt_ - 0.015), chequer, uvs=2.5)
    box(f'WALK_St_Nose_{i:02d}', B, (tw_, 0.045, 0.032), (cxs, yc - (go + 0.03) / 2 + 0.0225, zt_ - 0.015 + 0.001), yellow, uvs=2.0)
    for s, x in ((-1, ST_X0 + 0.077), (1, ST_X1 - 0.077)): box(f'WALK_St_Cleat_{i:02d}{s}', B, (0.04, go * 0.8, 0.05), (x, yc, zt_ - 0.055), steel)
for s, x in ((-1, ST_X0 + 0.05), (1, ST_X1 - 0.05)):
    chan(f'WALK_St_Stringer_{s}', (x, ys0, zc(ys0)), (x, ys1, zc(ys1)), 0.26, 0.07, frame, out=s)
    box(f'St_StringerFoot_{s}', B, (0.12, 0.3, 0.012), (x, ys0 + 0.05, 0.006), steel)
# the landing: a chequer plate on a channel frame, two posts down to the floor, toe boards, against the office's door
LY1 = BACK_Y - 0.1   # (the fab shop's wall's face)
box('WALK_St_Landing', B, (sw, LY1 - ST_Y1, 0.03), (cxs, (ST_Y1 + LY1) / 2, DECK_Z - 0.015), chequer, uvs=2.5)
for k, (a, b) in enumerate((((ST_X0, ST_Y1), (ST_X0, LY1)), ((ST_X0, LY1), (ST_X1, LY1)), ((ST_X0, ST_Y1), (ST_X1, ST_Y1)))):
    beam(f'WALK_St_Landing_Frame_{k}', B, (a[0] + 0.03 * (k != 1 and k != 2), a[1], DECK_Z - 0.11), (b[0] + 0.03 * (k != 1 and k != 2), b[1], DECK_Z - 0.11), 0.06, 0.16, frame)
for k, (x, y) in enumerate(((ST_X0 + 0.06, ST_Y1 + 0.08), (ST_X0 + 0.06, LY1 - 0.06))):
    box(f'St_Landing_Post_{k}', B, (0.1, 0.1, DECK_Z - 0.19), (x, y, (DECK_Z - 0.19) / 2), frame)
    plate_bolts(f'St_Landing_Post_{k}_Base', (x, y), 0.2, 0.2, steel, inset=0.035)
box('WALK_St_Toe_L', B, (0.012, LY1 - ST_Y1, 0.1), (ST_X0 + 0.006, (ST_Y1 + LY1) / 2, DECK_Z + 0.05), yellow)
box('WALK_St_Toe_B', B, (sw, 0.012, 0.1), (cxs, LY1 - 0.006, DECK_Z + 0.05), yellow)
# handrails: posts bolted to the stringers, a top rail 0.95 m over the nosings and a knee rail, round tube, both sides;
# on the left it carries on round the landing to its back
RAIL = 0.95
def rail_side(s, x, landing):
    posts = [ys0 + (ys1 - ys0) * t for t in (0.04, 0.27, 0.5, 0.73, 0.96)]
    for k, y in enumerate(posts):
        rd(f'WALK_St_RailPost_{s}_{k}', B, (x, y, zc(y) + 0.13), (x, y, nose(y) + RAIL), 0.021, frame, verts=6)
    top = [(x, posts[0] - 0.28, nose(posts[0]) + RAIL - 0.12), (x, posts[0] - 0.22, nose(posts[0]) + RAIL)] + [(x, y, nose(y) + RAIL) for y in posts]
    knee = [(x, y, nose(y) + RAIL - 0.47) for y in posts]
    if landing:
        top += [(x, ST_Y1 + 0.15, DECK_Z + RAIL), (x, LY1 - 0.08, DECK_Z + RAIL), (x + 0.15, LY1 - 0.08, DECK_Z + RAIL), (ST_X1 - 0.02, LY1 - 0.08, DECK_Z + RAIL)]
        knee += [(x, ST_Y1 + 0.15, DECK_Z + RAIL - 0.47), (x, LY1 - 0.08, DECK_Z + RAIL - 0.47), (x + 0.15, LY1 - 0.08, DECK_Z + RAIL - 0.47), (ST_X1 - 0.02, LY1 - 0.08, DECK_Z + RAIL - 0.47)]
        rd(f'WALK_St_RailPost_{s}_L0', B, (x, LY1 - 0.08, DECK_Z), (x, LY1 - 0.08, DECK_Z + RAIL), 0.021, frame, verts=6)
        rd(f'WALK_St_RailPost_{s}_L1', B, ((x + ST_X1) / 2, LY1 - 0.08, DECK_Z), ((x + ST_X1) / 2, LY1 - 0.08, DECK_Z + RAIL), 0.021, frame, verts=6)
        rd(f'WALK_St_RailPost_{s}_L2', B, (ST_X1 - 0.03, LY1 - 0.08, DECK_Z), (ST_X1 - 0.03, LY1 - 0.08, DECK_Z + RAIL), 0.021, frame, verts=6)
    else:
        top += [(x, posts[-1] + 0.2, nose(posts[-1]) + RAIL + 0.05), (x, posts[-1] + 0.26, nose(posts[-1]) + RAIL - 0.08)]
    sweep(f'WALK_St_Rail_{s}', B, top, 0.021, frame, segs=6, per_m=6)
    sweep(f'WALK_St_KneeRail_{s}', B, knee, 0.016, frame, segs=5, per_m=4)
rail_side(-1, ST_X0 + 0.015, True)
rail_side(1, ST_X1 - 0.02, False)

# ======================================================================================================================
# the roll-up doors: slats with a vision strip, bottom rail and seal, guide channels, the drum in its round hood, the motor
# at one end with its hand chain, the push-button station on the wall with the warning under it; bollards, jamb tape
def rollup(nm, x0, x1, h, ctrl_x):
    W = x1 - x0; cx = (x0 + x1) / 2; ly = Y0 + 0.09
    box(f'St_Door{nm}_SlatsLow', B, (W + 0.08, 0.05, 1.42), (cx, ly, 0.08 + 0.71), slat_mat, uvs=1.25)
    box(f'St_Door{nm}_VisionSlat', B, (W + 0.08, 0.05, 0.2), (cx, ly, 1.6), slat_mat, uvs=1.25)
    for f in (-1, 1):   # (the panes: a strip each face, its UVs run along it so a tile is 0.8 m, two panes)
        yy_ = ly + f * 0.0262; u1 = (W + 0.08) / 0.8
        quad(f'St_Door{nm}_Vision{f}', B, [(x0 - 0.04, yy_, 1.5), (x1 + 0.04, yy_, 1.5), (x1 + 0.04, yy_, 1.7), (x0 - 0.04, yy_, 1.7)], vision_mat, (0, f, 0), [(0, 0), (u1, 0), (u1, 1), (0, 1)])
    box(f'St_Door{nm}_SlatsHigh', B, (W + 0.08, 0.05, h - 1.7), (cx, ly, 1.7 + (h - 1.7) / 2), slat_mat, uvs=1.25)
    bbox(f'St_Door{nm}_BottomRail', B, (W + 0.06, 0.07, 0.07), (cx, ly, 0.055), alu, bev=0.008)
    box(f'St_Door{nm}_Seal', B, (W + 0.04, 0.04, 0.02), (cx, ly, 0.01), rubber)
    for k, x in enumerate((x0, x1)):
        o = -1 if k == 0 else 1
        box(f'St_Door{nm}_Guide{k}_Back', B, (0.12, 0.012, h + 0.1), (x + o * 0.02, Y0 + 0.03, (h + 0.1) / 2), galv)
        for dy in (0.06, 0.13): box(f'St_Door{nm}_Guide{k}_Lip{dy}', B, (0.12, 0.012, h + 0.1), (x + o * 0.02, Y0 + dy, (h + 0.1) / 2), galv)
        box(f'St_Door{nm}_Guide{k}_Side', B, (0.012, 0.11, h + 0.1), (x + o * 0.074, Y0 + 0.085, (h + 0.1) / 2), galv)
        box(f'St_Door{nm}_Tape{k}', B, (0.22, 0.004, 2.0), (x + o * 0.2, Y0 + 0.003, 1.0), hazard, uvs=2.5)   # (the jamb's tape)
        plate_bolts(f'St_Door{nm}_Bollard{k}_Base', (x + o * 0.32, Y0 + 0.45), 0.22, 0.22, steel, inset=0.03)
        lathe(f'St_Door{nm}_Bollard{k}', B, [(0.0, 0.02), (0.1, 0.02), (0.1, 1.0), (0.088, 1.07), (0.05, 1.11), (0.0, 1.12)], (x + o * 0.32, Y0 + 0.45, 0), yellow, segs=12)
        for j, z0 in enumerate((0.74, 0.88)): lathe(f'St_Door{nm}_Bollard{k}_Band{j}', B, [(0.102, z0), (0.102, z0 + 0.08)], (x + o * 0.32, Y0 + 0.45, 0), black, segs=12, cap0=False, cap1=False)
    # the drum hood: round, over the opening, its end plates; the motor and gearbox off the right end, the hand chain
    hz = h + 0.36; hy = Y0 + 0.34
    cy(f'St_Door{nm}_Hood', B, 0.32, W + 0.3, (cx, hy, hz), galv, rot=(0, D90, 0), verts=14)
    for k, x in enumerate((x0 - 0.15, x1 + 0.15)): bbox(f'St_Door{nm}_HoodEnd{k}', B, (0.025, 0.7, 0.74), (x, Y0 + 0.35, hz), darkg, bev=0.006)   # (the end brackets)
    box(f'St_Door{nm}_HoodTop', B, (W + 0.3, 0.36, 0.012), (cx, Y0 + 0.18, hz + 0.315), galv)   # (the cover's flat top back to the wall: a D, not a pipe)
    box(f'St_Door{nm}_HoodBack', B, (W + 0.3, 0.012, 0.66), (cx, Y0 + 0.012, hz), galv)
    mx = x1 + 0.3
    bbox(f'St_Door{nm}_Gearbox', B, (0.2, 0.22, 0.24), (mx, hy - 0.02, hz - 0.05), darkg, bev=0.015)
    lathe(f'St_Door{nm}_Motor', B, [(0.0, 0.0), (0.1, 0.0)] + [(0.1 if j % 2 else 0.115, 0.03 + j * 0.03) for j in range(8)] + [(0.1, 0.27), (0.0, 0.29)], (mx, hy - 0.02, hz - 0.17), darkg, segs=10, rot=(math.pi, 0, 0))
    cy(f'St_Door{nm}_ChainWheel', B, 0.11, 0.025, (mx + 0.12, hy - 0.1, hz - 0.05), steel, rot=(0, D90, 0), verts=10)
    for k, dy in enumerate((-0.1, 0.1)):
        rd(f'St_Door{nm}_Chain{k}', B, (mx + 0.13, hy - 0.1 + dy, hz - 0.05), (mx + 0.13, hy - 0.1 + dy, 1.45), 0.006, steel, verts=4)
    sweep(f'St_Door{nm}_ChainLoop', B, [(mx + 0.13, hy - 0.2, 1.46), (mx + 0.13, hy - 0.17, 1.38), (mx + 0.13, hy - 0.1, 1.35), (mx + 0.13, hy - 0.03, 1.38), (mx + 0.13, hy, 1.46)], 0.006, steel, segs=4, per_m=12)
    box(f'St_Door{nm}_Head', B, (W + 0.3, 0.12, 0.1), (cx, Y0 + 0.06, h + 0.05), galv)
    # the push-button station on the wall beside it: grey box, three buttons, the legend, conduit up to the motor
    sy = Y0 + 0.035
    bbox(f'St_Door{nm}_Ctrl', B, (0.13, 0.07, 0.26), (ctrl_x, sy, 1.42), greyp, bev=0.01)
    for k, (z, m, r) in enumerate(((1.5, greenb, 0.018), (1.42, red, 0.026), (1.34, black, 0.018))):
        cy(f'St_Door{nm}_Btn{k}', B, r, 0.025, (ctrl_x + 0.02, sy + 0.045, z), m, rot=(D90, 0, 0), verts=8)
    lx = ctrl_x + (0.13 if ctrl_x > x1 else -0.13)
    cd(f'St_Door{nm}_CtrlLegend', B, 0.09, 0.225, (lx, Y0 + 0.004, 1.305), art_mat(f'St_Ctrl_{nm}', A('ws_st_control'), dirt=0.1), rotz=math.pi)
    cz = hz + 0.42; wy = Y0 + 0.03
    rd(f'St_Door{nm}_Conduit', B, (ctrl_x, wy, 1.55), (ctrl_x, wy, cz), 0.012, greyp, verts=5)
    rd(f'St_Door{nm}_ConduitRun', B, (ctrl_x, wy, cz), (mx, wy, cz), 0.012, greyp, verts=5)
    sweep(f'St_Door{nm}_ConduitDrop', B, [(mx, wy, cz), (mx, wy + 0.12, cz - 0.08), (mx, hy - 0.02, hz + 0.18), (mx, hy - 0.02, hz + 0.07)], 0.012, greyp, segs=5, per_m=10)
    for j, xx in enumerate(np.linspace(min(ctrl_x, mx), max(ctrl_x, mx), max(2, int(abs(mx - ctrl_x) / 1.5)))):   # (saddle clips)
        box(f'St_Door{nm}_Clip{j}', B, (0.03, 0.035, 0.04), (xx, wy, cz), greyp)
    cd(f'St_Door{nm}_Warn', B, 0.32, 0.1, (ctrl_x, Y0 + 0.004, 1.05), art_mat(f'St_Warn_{nm}', A('ws_st_door_warn'), dirt=0.12), rotz=math.pi)
    # the drain just inside: a slot channel with its grating
    dy_ = Y0 + 0.95
    box(f'St_Door{nm}_DrainSlot', B, (W + 0.4, 0.16, 0.002), (cx, dy_, 0.001), black)
    box(f'St_Door{nm}_Grate', B, (W + 0.4, 0.15, 0.002), (cx, dy_, 0.004), grate, uvs=4.0)
    for k, o in enumerate((-0.085, 0.085)): box(f'St_Door{nm}_DrainEdge{k}', B, (W + 0.42, 0.02, 0.006), (cx, dy_ + o, 0.003), galv)
gr = np.ones((16, 16, 3), np.float32) * np.array([0.35, 0.37, 0.39], np.float32); ga = np.ones((16, 16), np.float32)
ga[:, 2::4] = 0.0; ga[:, 3::4] = 0.0; ga[7:9, :] = 1.0   # (bars across the slot every ~6 cm, a tie bar along)
grate = cutout_mat('St_Grate', gr, ga)
rollup('A', DOOR_A[0], DOOR_A[1], DOOR_A[2], DOOR_A[0] - 0.6)
rollup('B', DOOR_B[0], DOOR_B[1], DOOR_B[2], DOOR_B[1] + 0.62)

# the fire exit into reception: frame, the blue leaf (shut: it's the outside), a vision panel, push bar, closer, kick
# plate, hinges, and the lit green running-man sign above
x0, x1, h = SIDE; cx = (x0 + x1) / 2; fy = Y0
for k, x in enumerate((x0 + 0.03, x1 - 0.03)): box(f'St_Exit_Jamb{k}', B, (0.06, 0.1, h + 0.06), (x, fy + 0.05, (h + 0.06) / 2), greyp)
box('St_Exit_Head', B, (x1 - x0, 0.1, 0.06), (cx, fy + 0.05, h + 0.03), greyp)
bbox('St_Exit_Leaf', B, (x1 - x0 - 0.12, 0.045, h - 0.02), (cx, fy + 0.04, (h - 0.02) / 2 + 0.01), doorblue, bev=0.006)
box('St_Exit_VisionFrame', B, (0.24, 0.012, 0.64), (cx, fy + 0.068, 1.5), alu)
box('St_Exit_Vision', B, (0.2, 0.004, 0.6), (cx, fy + 0.075, 1.5), daylight)
box('St_Exit_Kick', B, (x1 - x0 - 0.16, 0.004, 0.25), (cx, fy + 0.064, 0.15), ss)
for k, x in enumerate((x0 + 0.14, x1 - 0.14)): box(f'St_Exit_BarBracket{k}', B, (0.05, 0.08, 0.06), (x, fy + 0.1, 1.0), ss)
rd('St_Exit_PushBar', B, (x0 + 0.1, fy + 0.14, 1.0), (x1 - 0.1, fy + 0.14, 1.0), 0.018, red, verts=8)
bbox('St_Exit_Closer', B, (0.28, 0.06, 0.07), (x1 - 0.3, fy + 0.095, h - 0.08), darkg, bev=0.01)
beam('St_Exit_CloserArm', B, (x1 - 0.18, fy + 0.13, h - 0.05), (x1 - 0.48, fy + 0.2, h + 0.04), 0.02, 0.012, darkg)
beam('St_Exit_CloserArm2', B, (x1 - 0.48, fy + 0.2, h + 0.04), (x1 - 0.62, fy + 0.07, h + 0.04), 0.02, 0.012, darkg)
for k, z in enumerate((0.25, 1.05, 1.85)): cy(f'St_Exit_Hinge{k}', B, 0.012, 0.11, (x1 - 0.07, fy + 0.07, z), ss, verts=6)
bbox('St_Exit_Sign_Box', B, (0.42, 0.07, 0.17), (cx, fy + 0.04, h + 0.25), whitep, bev=0.008)
cd('St_Exit_Sign', B, 0.38, 0.14, (cx, fy + 0.0765, h + 0.18), art_mat('St_ExitSign', A('ws_st_exit'), dirt=0.04, emit=2.2), rotz=math.pi)

# ======================================================================================================================
# the back row's doors: steel frames on both faces, the leaves standing open flat against the hall side (so the
# doorways stay walkable), handles, kick plates, a vision panel in the dyno's; a sign over each
def door(nm, x0, x1, h, hinge, mat, sign=None, swing=math.pi * 0.97, window=False, wall_y=BACK_Y, face=-1):
    # x0..x1 the opening in the wall at y wall_y (0.2 thick); hinge 'L'/'R': the leaf swings out to the hall (face -1)
    cx = (x0 + x1) / 2; fy = wall_y + face * 0.1
    for f in (-1, 1):
        for k, x in enumerate((x0, x1)): box(f'St_{nm}_Arch{f}{k}', B, (0.06, 0.02, h + 0.06), (x + (-1 if k == 0 else 1) * 0.03, wall_y + f * 0.11, (h + 0.06) / 2), galv)
        box(f'St_{nm}_ArchHead{f}', B, (x1 - x0 + 0.12, 0.02, 0.06), (cx, wall_y + f * 0.11, h + 0.03), galv)
    for k, x in enumerate((x0, x1)): box(f'St_{nm}_Liner{k}', B, (0.012, 0.2, h), (x + (1 if k == 0 else -1) * 0.006, wall_y, h / 2), galv)
    box(f'St_{nm}_LinerHead', B, (x1 - x0, 0.2, 0.012), (cx, wall_y, h - 0.006), galv)
    W = x1 - x0 - 0.02; hx = x1 if hinge == 'R' else x0; sg = 1 if hinge == 'R' else -1
    # (shut, the leaf runs from the hinge across the opening, -sg; swung `swing` out to the hall it lies along +sg)
    d = Vector((sg * math.cos(math.pi - swing), face * math.sin(math.pi - swing), 0)).normalized()
    n = Vector((-d.y, d.x, 0)); base = Vector((hx, fy + face * 0.03, 0))
    c = base + d * (W / 2 + 0.02)
    rot = math.atan2(d.y, d.x)
    bbox(f'St_{nm}_Leaf', B, (W, 0.05, h - 0.02), (c.x, c.y, (h - 0.02) / 2 + 0.01), mat, rot=(0, 0, rot), bev=0.006)
    for side in (-1, 1):
        o = n * side * 0.03
        p = base + d * (W - 0.08) + o * 1.4
        box(f'St_{nm}_Handle{side}', B, (0.13, 0.02, 0.02), (p.x - d.x * 0.05, p.y - d.y * 0.05, 1.02), ss, rot=(0, 0, rot))
        cy(f'St_{nm}_Rose{side}', B, 0.028, 0.012, (p.x + o.x * 0.1, p.y + o.y * 0.1, 1.02), ss, rot=(D90, 0, rot), verts=8)
        k_ = base + d * (W / 2 + 0.02) + n * side * 0.027
        box(f'St_{nm}_Kick{side}', B, (W - 0.06, 0.004, 0.22), (k_.x, k_.y, 0.14), ss, rot=(0, 0, rot))
        if window:
            wp = base + d * (W * 0.5 + 0.02) + n * side * 0.027
            box(f'St_{nm}_Vision{side}', B, (0.22, 0.004, 0.34), (wp.x, wp.y, 1.55), paned, rot=(0, 0, rot))
            box(f'St_{nm}_VisionFrame{side}', B, (0.26, 0.003, 0.38), (wp.x - n.x * side * 0.001, wp.y - n.y * side * 0.001, 1.55), ss, rot=(0, 0, rot))
    for k, z in enumerate((0.25, 1.05, h - 0.25)): cy(f'St_{nm}_Hinge{k}', B, 0.012, 0.11, (hx - sg * 0.01, fy + face * 0.01, z), ss, verts=6)
    if sign:
        cd(f'St_{nm}_Sign', B, sign[1], sign[2], (cx + sign[3], wall_y + face * 0.105, h + 0.1), art_mat(f'St_{nm}_SignMat', A(sign[0]), dirt=0.12), rotz=(0 if face < 0 else math.pi))
    box(f'St_{nm}_Emergency', B, (0.3, 0.06, 0.08), (cx, wall_y + face * 0.13, h + (0.52 if sign else 0.2)), whitep)
    box(f'St_{nm}_EmergencyLens', B, (0.24, 0.004, 0.04), (cx, wall_y + face * 0.161, h + (0.52 if sign else 0.2)), estrip)
door('DynoDoor', X0 + 5.4, X0 + 6.3, 2.15, 'R', doorgrey, sign=('ws_st_dyno_sign', 0.42, 0.26, 0.0), window=True)
door('PartsDoor', -0.6, 0.4, 2.15, 'R', doorblue, sign=('ws_st_parts', 0.36, 0.105, 0.0))
door('OfficeDoor', MX + 0.6, MX + 1.6, 2.15, 'R', doorblue, sign=('ws_st_office', 0.32, 0.093, 0.0), swing=math.pi * 0.9)

# the parts store's hatch: a roller shutter half up over the counter, its box, guides; brackets under the counter, a bell
hx0, hx1, hz0, hz1 = -4.0, -1.0, 1.05, 2.3; hfy = BACK_Y - 0.11
box('St_Hatch_Shutter', B, (hx1 - hx0 + 0.06, 0.03, 0.55), ((hx0 + hx1) / 2, hfy - 0.02, hz1 - 0.275 + 0.04), slat_mat, uvs=1.25)
bbox('St_Hatch_ShutterBar', B, (hx1 - hx0 + 0.04, 0.045, 0.045), ((hx0 + hx1) / 2, hfy - 0.02, hz1 - 0.53), alu, bev=0.006)
box('St_Hatch_Handle', B, (0.12, 0.02, 0.02), ((hx0 + hx1) / 2, hfy - 0.06, hz1 - 0.56), ss)
bbox('St_Hatch_Box', B, (hx1 - hx0 + 0.2, 0.2, 0.2), ((hx0 + hx1) / 2, hfy - 0.08, hz1 + 0.12), galv, bev=0.01)
for k, x in enumerate((hx0 - 0.03, hx1 + 0.03)): box(f'St_Hatch_Guide{k}', B, (0.06, 0.06, hz1 - hz0 + 0.04), (x, hfy - 0.02, (hz0 + hz1) / 2), galv)
for k, x in enumerate((hx0 + 0.4, hx1 - 0.4)):
    prism(f'St_Hatch_Bracket{k}', [(x, BACK_Y - 0.1, hz0 - 0.03), (x, BACK_Y - 0.33, hz0 - 0.03), (x, BACK_Y - 0.1, hz0 - 0.3)], (1, 0, 0), 0.012, steel)
lathe('St_Hatch_Bell', B, [(0.0, 0.0), (0.045, 0.0), (0.045, 0.012), (0.04, 0.03), (0.028, 0.05), (0.008, 0.06), (0.006, 0.075), (0.0, 0.078)], (-1.6, BACK_Y - 0.22, hz0 + 0.025), ss, segs=10)

# the engineering office's glass door upstairs: standing open into the office, aluminium framed, a pull handle; jamb
# posts and a glass fanlight over it
GY0, GY1 = ST_Y1, BACK_Y
for k, y in enumerate((GY0, GY1)): box(f'St_GlassDoor_Jamb{k}', B, (0.08, 0.06, 2.5), (MX + 0.1, y, DECK_Z + 1.3), alu)
box('St_GlassDoor_Transom', B, (0.08, GY1 - GY0, 0.05), (MX + 0.1, (GY0 + GY1) / 2, DECK_Z + 2.12), alu)
box('St_GlassDoor_Fanlight', B, (0.03, GY1 - GY0 - 0.06, 0.38), (MX + 0.1, (GY0 + GY1) / 2, DECK_Z + 2.33), glass)
LW = GY1 - GY0 - 0.08
lx0, ly_ = MX + 0.15, GY0 + 0.06   # (hinged at the front jamb, swung in along the glass: clear of the way in)
box('St_GlassDoor_Glass', B, (LW - 0.1, 0.012, 1.95), (lx0 + LW / 2, ly_, DECK_Z + 1.06), glass)
for k, z in enumerate((DECK_Z + 0.04, DECK_Z + 2.08)): box(f'St_GlassDoor_Rail{k}', B, (LW, 0.045, 0.08), (lx0 + LW / 2, ly_, z), alu)
for k, x in enumerate((lx0 + 0.03, lx0 + LW - 0.03)): box(f'St_GlassDoor_Stile{k}', B, (0.06, 0.045, 2.1), (x, ly_, DECK_Z + 1.06), alu)
rd('St_GlassDoor_Pull', B, (lx0 + LW - 0.1, ly_ + 0.06, DECK_Z + 0.8), (lx0 + LW - 0.1, ly_ + 0.06, DECK_Z + 1.4), 0.014, ss, verts=6)
for k, z in enumerate((DECK_Z + 0.82, DECK_Z + 1.38)): box(f'St_GlassDoor_PullFoot{k}', B, (0.02, 0.05, 0.02), (lx0 + LW - 0.1, ly_ + 0.035, z), ss)

# ======================================================================================================================
# light fittings. High-bays: a lathed aluminium reflector, a finned driver above it, the eye, a chain up to a strut
# bolted across two purlins, the cable looped up beside it to a junction box. Only these five spots cast shadows
LAMPS = ((BAY1.x, -3.0), (BAY2.x, -3.0), (BAY3.x, -3.0), (-8.0, 2.0), (-1.0, 2.0))
for n, (x, y) in enumerate(LAMPS):
    z = 5.3; nm = f'St_HighBay_{n}'
    lathe(f'{nm}_Reflector', lights, [(0.3, 0.0), (0.292, 0.035), (0.25, 0.14), (0.18, 0.25), (0.13, 0.31), (0.12, 0.33)], (x, y, z), alu, segs=16, cap0=False, cap1=False)
    lathe(f'{nm}_ReflectorIn', lights, [(0.12, 0.325), (0.175, 0.245), (0.245, 0.135), (0.287, 0.032), (0.295, 0.002)], (x, y, z), whitep, segs=16, cap0=False, cap1=False)
    cy(f'{nm}_Lens', lights, 0.12, 0.01, (x, y, z + 0.3), lamp, verts=12)
    lathe(f'{nm}_Driver', lights, [(0.0, 0.33), (0.13, 0.33)] + [(0.13 if j % 2 == 0 else 0.11, 0.35 + j * 0.022) for j in range(9)] + [(0.1, 0.55), (0.04, 0.57), (0.0, 0.57)], (x, y, z), darkg, segs=12)
    eye_z = z + 0.6
    sweep(f'{nm}_Eye', lights, [(x + 0.025 * math.cos(a), y, eye_z + 0.025 * math.sin(a)) for a in np.linspace(0, math.tau, 9)[:-1]], 0.005, steel, segs=4, per_m=40, closed=True)
    if min(abs(y - fy_) for fy_ in (-3.0, 3.0)) < 0.2:   # (under a rafter: a beam clamp on its bottom flange)
        sz = zt(abs(x)) - RD - 0.03
        bbox(f'{nm}_Clamp', lights, (0.08, 0.2, 0.05), (x, y, sz + 0.005), darkg, bev=0.006)
    else:   # (between frames: a strut bolted across the two purlins either side)
        px0 = max([p for p in PX if p <= abs(x)] or [PX[0]]); px1 = min([p for p in PX if p > abs(x)] or [PX[-1]])
        sx = 1 if x >= 0 else -1; sz = roof((px0 + px1) / 2) - 0.01 - PD - 0.022
        box(f'{nm}_Strut', lights, (abs(px1 - px0) + 0.12, 0.041, 0.041), (sx * (px0 + px1) / 2, y, sz), galv)
    links = int((sz - 0.03 - (eye_z + 0.02)) / 0.05)
    for j in range(links):
        zz = eye_z + 0.03 + j * 0.05
        box(f'{nm}_Link{j}', lights, (0.012 if j % 2 else 0.03, 0.03 if j % 2 else 0.012, 0.055), (x, y, zz + 0.025), steel)
    bbox(f'{nm}_JBox', lights, (0.1, 0.1, 0.06), (x + 0.25, y, sz - 0.05), greyp, bev=0.006)
    sweep(f'{nm}_Cable', lights, [(x + 0.1, y, z + 0.5), (x + 0.2, y + 0.03, z + 0.65), (x + 0.24, y, (z + sz) / 2 + 0.1), (x + 0.25, y, sz - 0.08)], 0.008, black, segs=4, per_m=6)
    spot(f'Light_HighBay_{n}', lights, (x, y, z - 0.05), 1500, (1.0, 0.96, 0.88), deg=110)
# the rooms' panels: a white troffer with a louvred diffuser (points: they cast no shadows). Under the mezzanine they're
# on the joists' undersides
PANELS = ((-8.75, 6.75, ROOM_H, 500), (-2.25, 6.75, ROOM_H, 350), (3.5, 6.75, ROOM_H, 450), (9.0, 6.75, DECK_Z - 0.45, 300),
          (9.0, -6.0, DECK_Z - 0.45, 300), (9.0, 1.5, DECK_Z - 0.45, 300), (9.0, 2.0, DECK_Z + 2.95, 400), (9.0, -6.8, DECK_Z + 2.95, 300))
for n, (x, y, z, w) in enumerate(PANELS):
    bbox(f'St_Panel_{n}', lights, (0.64, 1.24, 0.06), (x, y, z - 0.03), whitep, bev=0.006)
    quad(f'St_Panel_{n}_Louvre', lights, [(x - 0.3, y - 0.6, z - 0.062), (x + 0.3, y - 0.6, z - 0.062), (x + 0.3, y + 0.6, z - 0.062), (x - 0.3, y + 0.6, z - 0.062)], louvre, (0, 0, -1), [(0, 0), (1, 0), (1, 1), (0, 1)])
    bulb(f'Light_Panel_{n}', lights, (x, y, z - 0.3), w, (0.95, 0.97, 1.0))
# emergency lights round the hall: the fire exit's way, the stair foot, the roll-ups
for n, (x, y, z, rz) in enumerate(((-11.9, -4.0, 2.75, -D90), (11.9, 0.0, 2.45, D90), (-5.2, BACK_Y - 0.13, 2.6, 0.0), (-11.0, Y0 + 0.03, 2.6, math.pi))):
    c = Vector((x, y, z)); f = Vector((math.sin(rz) * -1, -math.cos(rz), 0))
    box(f'St_Emergency_{n}', B, (0.3, 0.06, 0.08), tuple(c), whitep, rot=(0, 0, rz))
    box(f'St_Emergency_{n}_Lens', B, (0.24, 0.004, 0.04), tuple(c + f * 0.031), estrip, rot=(0, 0, rz))

ST_TRIS = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for c in (B, lights) for o in c.objects if o.type == 'MESH' and o.name.startswith(('St_', 'WALK_St_')))
print('STRUCTURE tris', ST_TRIS)
