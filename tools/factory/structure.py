# tools/factory/structure.py: run inside tools/garage-factory.py (exec'd with its globals: the plan's numbers, B, dress,
# lights, hooks, the helpers, garagelib's). See that script's header for the layout.
# The building's fabric, made like the real thing, every piece closed (no open shells or one-sided cards to see
# through): the curved glass front (capped mullions, transoms, the stone cill and its LED, the canopy outside with its
# soffit lights), the roof's white steel with its baffles, the skylight over the atrium and the services up there (the
# spiral duct, cable trays, the sprinkler main); the rotunda (its drum, the revolving door, the dome and its lit ring,
# the curved reception desk); the feature stair (closed stringers, treads with LED nosings, glass balustrade, handrails);
# the walkways' edges (the slab's fascia and LED, glass in a shoe, a stainless handrail on clamps); the atrium's light
# rings and the bays' spot fittings, the downlights, linear lights and emergency lights; the doors (the atrium's
# sliding glass, every room's door standing open flat to its wall, the dock's roller door with its EXIT sign). Objects
# Fs_..., signs fa_st_* drawn by tools/factory/art_structure.py.
import subprocess

ARTD = os.path.join(SRC, 'factory_art'); AR = lambda n: os.path.join(ARTD, n + '.png')
if not all(os.path.exists(AR(n)) for n in ('fa_st_exit', 'fa_st_emerg', 'fa_st_door_office', 'fa_st_keepclear', 'fa_st_buttons', 'fa_st_skylight')):
    subprocess.run(['/usr/local/bin/python3', os.path.join(FA, 'art_structure.py')], check=True)

# (the blockout's pieces made properly below)
for o in [o for o in list(bpy.data.objects) if o.name.startswith(('Front_', 'Rot_Mull', 'Rot_Transom', 'Rot_Glass', 'Rot_Dome', 'Rot_Ring', 'Rot_Desk', 'Rot_ExitSign',
                                                                  'Rail_', 'WALK_UpLED_', 'Stair_GlassSide_', 'Landing_Glass', 'WALK_Stair_', 'Atrium_Ring',
                                                                  'Plinth_Downlight', 'Dock_ExitSign', 'Cafe_Front_Pane1'))]:
    bpy.data.objects.remove(o, do_unlink=True)

FS = collection('shell_factory structure', shell)
steel = plain_mat('Fs_Steel', (0.9, 0.91, 0.92), dirt=0.03, rough=0.35)        # (the roof's white steel)
stain = plain_mat('Fs_Stainless', (0.78, 0.8, 0.82), dirt=0.02, rough=0.18)
stone = plain_mat('Fs_Stone', (0.17, 0.17, 0.18), dirt=0.03, fleck=0.05, rough=0.3)
galv = grimy_tile('Fs_Galv', 'galvanized_metal.png', dirt=0.05)
blk = plain_mat('Fs_Black', (0.05, 0.05, 0.06), dirt=0.02, rough=0.4)
rubber = plain_mat('Fs_Rubber', (0.07, 0.07, 0.08), dirt=0.02)
red = plain_mat('Fs_Red', (0.7, 0.08, 0.06), dirt=0.03)
brass = plain_mat('Fs_Brass', (0.72, 0.58, 0.28), dirt=0.02, rough=0.3)
deskw = plain_mat('Fs_DeskWhite', (0.92, 0.92, 0.9), dirt=0.02, rough=0.25)   # (Corian-ish)
frost = mat_img('Fs_Frost', None, 0.3, emit=((0.82, 0.88, 0.95), 0.9))        # (frosted, softly lit)
warmline = mat_img('Fs_WarmLine', None, 0.4, emit=((1.0, 0.86, 0.66), 3.0))
panel = mat_img('Fs_Panel', None, 0.4, emit=((0.9, 0.94, 1.0), 2.2))
dimpanel = mat_img('Fs_PanelWarm', None, 0.4, emit=((1.0, 0.9, 0.75), 1.8))
def art(name, png, emit=None, dirt=0.02): return art_mat(name, AR(png), dirt=dirt, emit=emit)

# ---------------- helpers: closed solids ----------------
def mesh_obj(name, verts, faces, mat, coll=FS):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    uv_world(me, Matrix.Identity(4), 0.5); return G._obj(name, coll, me, mat)
def extrude(name, prof, a, b, mat, coll=FS, side=None):
    # a closed prism: prof [(across, up)] carried from a to b (up stays up; across is to the line's right)
    a, b = Vector(a), Vector(b); d = (b - a).normalized()
    s = side or d.cross(Vector((0, 0, 1)))
    if s.length < 1e-6: s = Vector((1, 0, 0))
    s = s.normalized(); u = s.cross(d).normalized(); n = len(prof)
    verts = [a + s * p + u * q for p, q in prof] + [b + s * p + u * q for p, q in prof]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return mesh_obj(name, verts, faces, mat, coll)
def isec(name, a, b, mat, w=0.2, h=0.45, t=0.018, coll=FS):   # an I-section a -> b, its bottom on the line
    pr = [(-w / 2, 0), (w / 2, 0), (w / 2, t), (t / 2, t), (t / 2, h - t), (w / 2, h - t), (w / 2, h), (-w / 2, h), (-w / 2, h - t), (-t / 2, h - t), (-t / 2, t), (-w / 2, t)]
    return extrude(name, pr, a, b, mat, coll)
def ring(name, c, r0, r1, z0, z1, mat, segs=32, coll=FS, rot=(0, 0, 0)):   # a closed ring (a box-section torus)
    return lathe(name, coll, [(r0, z0), (r1, z0), (r1, z1), (r0, z1), (r0, z0)], c, mat, segs=segs, rot=rot, cap0=False, cap1=False)
def arc_solid(name, c, r0, r1, a0, a1, z0, z1, mat, segs=16, coll=FS):
    # a closed curved slab: radii r0..r1 round c, angles a0..a1, heights z0..z1
    verts, faces = [], []
    for j in range(segs + 1):
        a = a0 + (a1 - a0) * j / segs; ca, sa = math.cos(a), math.sin(a)
        for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0, z1)): verts.append((c.x + r * ca, c.y + r * sa, z))
    for j in range(segs):
        for k in range(4): faces.append((j * 4 + k, j * 4 + (k + 1) % 4, (j + 1) * 4 + (k + 1) % 4, (j + 1) * 4 + k))
    faces.append((3, 2, 1, 0)); faces.append(tuple(segs * 4 + k for k in range(4)))
    return mesh_obj(name, verts, faces, mat, coll)
def para(name, x, ya, yb, za, zb, h, t, mat, coll=FS):   # a pane following a slope: a parallelogram slab at x
    vs = []
    for dx in (-t / 2, t / 2): vs += [(x + dx, ya, za), (x + dx, yb, zb), (x + dx, yb, zb + h), (x + dx, ya, za + h)]
    fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh_obj(name, vs, fs, mat, coll)
def facing(nrm):   # a card's rotz so its face (built to -Y) looks along nrm (x, y)
    return math.atan2(nrm[0], -nrm[1])
def sign(name, png, at, nrm, w, h, emit=None, depth=0.03, frame=alu):
    # a sign: a closed plate, the art on its face (to nrm), a hair proud of it
    at = Vector(at); n = Vector((nrm[0], nrm[1], 0)).normalized(); rz = facing(nrm)
    bbox(f'{name}_Plate', FS, (w + 0.03, depth, h + 0.03), at, frame, rot=(0, 0, rz), bev=0.004)
    return cd(name, FS, w, h, at + n * (depth / 2 + 0.002) - Vector((0, 0, h / 2)), art(name, png, emit), rotz=rz)
def emerg(name, at, nrm):   # an emergency light: a white box, its lens, the green strip
    at = Vector(at); n = Vector((nrm[0], nrm[1], 0)).normalized(); rz = facing(nrm)
    bbox(f'{name}_Box', FS, (0.34, 0.06, 0.1), at, plain_mat('Fs_EmBox', (0.92, 0.92, 0.9), dirt=0.02), rot=(0, 0, rz), bev=0.006)
    cd(f'{name}_Face', FS, 0.3, 0.08, at + n * 0.032 - Vector((0, 0, 0.04)), art(f'{name}_Art', 'fa_st_emerg', 0.8), rotz=rz)

# ======================================================================================================================
# the curved glass front
def slope(x): return 6 * x / 361 * (FRONT_END - FRONT_MID) / 3   # (dy/dx of front_y)
def out_n(x): n = Vector((slope(x), -1, 0)); return n.normalized()   # (toward the lake)
segs = []
for k in range(24):
    (xa, ya), (xb, yb) = arc[k], arc[k + 1]; c = Vector(((xa + xb) / 2, (ya + yb) / 2, 0))
    if (c - ROT).length < ROT_R + 0.3: continue
    segs.append((k, Vector((xa, ya, 0)), Vector((xb, yb, 0)), c))
TIERS = (0.18, 3.0, 6.0, H - 0.65)
mull_at = sorted({(p.x, p.y) for _, a, b, _ in segs for p in (a, b)})
for i, (x, y) in enumerate(mull_at):
    p = Vector((x, y, 0)); n = out_n(x); t = Vector((-n.y, n.x, 0)); rz = math.atan2(t.y, t.x)
    bbox(f'Fs_Front_Mull{i:02d}', FS, (0.06, 0.26, H), p - n * 0.1 + Vector((0, 0, H / 2)), alu, rot=(0, 0, rz), bev=0.008)      # (the fin, inside)
    bbox(f'Fs_Front_MullCap{i:02d}', FS, (0.11, 0.035, H), p + n * 0.035 + Vector((0, 0, H / 2)), alu, rot=(0, 0, rz), bev=0.008)  # (the cap, outside)
for k, a, b, c in segs:
    L = (b - a).length; d = (b - a) / L; rz = math.atan2(d.y, d.x); n = out_n(c.x)
    for j in range(3):   # (three tiers of glass between the transoms)
        z0, z1 = TIERS[j] + 0.02, TIERS[j + 1] - 0.02
        box(f'Fs_Front_Glass{k:02d}_{j}', FS, (L - 0.06, 0.024, z1 - z0), c + Vector((0, 0, (z0 + z1) / 2)), glass, rot=(0, 0, rz))
    for z in TIERS[1:3]: bx(f'Fs_Front_Transom{k:02d}_{z:.0f}', FS, (L, 0.2, 0.07), c - n * 0.07 + Vector((0, 0, z)), alu, rot=(0, 0, rz))
    bbox(f'Fs_Front_Cill{k:02d}', FS, (L + 0.02, 0.42, 0.18), c - n * 0.12 + Vector((0, 0, 0.09)), stone, rot=(0, 0, rz), bev=0.01)
    bx(f'Fs_Front_CillLED{k:02d}', FS, (L - 0.02, 0.03, 0.015), c - n * 0.3 + Vector((0, 0, 0.185)), led, rot=(0, 0, rz))
    bbox(f'Fs_Front_Fascia{k:02d}', FS, (L + 0.02, 0.32, 0.62), c - n * 0.16 + Vector((0, 0, H - 0.31)), white, rot=(0, 0, rz), bev=0.01)
    # the canopy outside: a white blade out over the terrace, its edge fascia, downlights in its soffit
    bbox(f'Fs_Canopy{k:02d}', FS, (L + 0.06, 2.6, 0.2), c + n * 1.35 + Vector((0, 0, H + 0.02)), white, rot=(0, 0, rz), bev=0.02)
    bbox(f'Fs_CanopyEdge{k:02d}', FS, (L + 0.06, 0.1, 0.42), c + n * 2.65 + Vector((0, 0, H - 0.08)), white, rot=(0, 0, rz), bev=0.01)
    if k % 2 == 0:
        p = c + n * 1.7 + Vector((0, 0, H - 0.09)); cy(f'Fs_CanopyLight{k:02d}', FS, 0.12, 0.02, p, warm, verts=12)
        ring(f'Fs_CanopyLightRim{k:02d}', p - Vector((0, 0, 0.01)), 0.12, 0.15, 0.0, 0.025, alu, segs=8)

# ======================================================================================================================
# the roof: white steel I-beams front to back every 3 m, the Boulevard's ceiling of baffles between them, the skylight
for i, x in enumerate(range(-16, 19, 3)):
    y0 = front_y(x) + 0.4; isec(f'Fs_RoofBeam{i:02d}', (x, y0, H - 0.5), (x, Y1 - 0.15, H - 0.5), steel, w=0.22, h=0.48)
    bx(f'Fs_RoofBeamEnd{i:02d}', FS, (0.3, 0.06, 0.5), (x, y0 - 0.03, H - 0.25), steel)   # (its end plate on the front's fascia)
for i, y in enumerate((-9.0, -2.5, 3.5, 10.0)):   # (purlins across, on the beams)
    x0 = -15.0 if y < -6 else X0 + 0.2
    isec(f'Fs_RoofPurlin{i}', (x0, y, H - 0.68), (X1 - 0.2, y, H - 0.68), steel, w=0.12, h=0.18, t=0.012)
bl = []   # (the baffles: aluminium blades over the Boulevard, 0.4 m apart, front to the balcony)
x = -13.2
while x < 18.7:
    y0, y1 = front_y(x) + 0.75, GY - WALK_W - 0.25
    bx(f'Fs_Baffle{len(bl):03d}', FS, (0.025, y1 - y0, 0.32), (x, (y0 + y1) / 2, H - 0.95), alu); bl.append(x); x += 0.4
bx('Fs_BaffleCarrierA', FS, (31.9, 0.04, 0.05), (2.75, GY - WALK_W - 0.5, H - 0.77), alu)
bx('Fs_BaffleCarrierB', FS, (31.9, 0.04, 0.05), (2.75, -9.8, H - 0.77), alu)
for i, x in enumerate(range(-12, 19, 3)):
    if x % 6 == 0: rd(f'Fs_BaffleHanger{i}', FS, (x, GY - WALK_W - 0.5, H - 0.75), (x, GY - WALK_W - 0.5, H - 0.5), 0.006, stain, verts=4)
# the skylight over the atrium: a frame of white steel, frosted glazing lit softly from above, its glazing bars
SK = (AC.x, AC.y); SW, SD = 12.0, 7.0
for nm, sz, at in (('N', (SW + 0.4, 0.3, 0.4), (SK[0], SK[1] + SD / 2 + 0.15)), ('S', (SW + 0.4, 0.3, 0.4), (SK[0], SK[1] - SD / 2 - 0.15)),
                   ('W', (0.3, SD, 0.4), (SK[0] - SW / 2 - 0.15, SK[1])), ('E', (0.3, SD, 0.4), (SK[0] + SW / 2 + 0.15, SK[1]))):
    bbox(f'Fs_SkyFrame{nm}', FS, sz, (at[0], at[1], H - 0.2), steel, bev=0.01)
cd('Fs_SkyGlass', FS, SW, SD, (SK[0], SK[1] + SD / 2, H - 0.03), art('Fs_SkyGlass', 'fa_st_skylight', 0.55), tilt=D90)   # (face down: its top edge toward -Y)
bx('Fs_SkyGlassBack', FS, (SW, SD, 0.02), (SK[0], SK[1], H - 0.015), blk)   # (its back: closed)
for i in range(1, 6): bx(f'Fs_SkyBarX{i}', FS, (0.06, SD, 0.08), (SK[0] - SW / 2 + i * SW / 6, SK[1], H - 0.07), steel)
for i in range(1, 3): bx(f'Fs_SkyBarY{i}', FS, (SW, 0.06, 0.08), (SK[0], SK[1] - SD / 2 + i * SD / 3, H - 0.07), steel)
# services: the spiral duct along the back over the walkway (its seams, hangers, two drops with diffusers), the
# cable tray beside it, the sprinkler main across the atrium with its drops and heads
DY, DZ = 6.9, H - 1.25
cy('Fs_Duct', FS, 0.32, 27.0, (4.5, DY, DZ), galv, rot=(0, D90, 0), verts=20)
for i in range(14):
    x = -8.5 + i * 2.0; ring(f'Fs_DuctSeam{i:02d}', Vector((x, DY, DZ)), 0.32, 0.34, -0.02, 0.02, galv, segs=12, rot=(0, D90, 0))
    if i % 2 == 0:
        rd(f'Fs_DuctHangerA{i}', FS, (x + 0.6, DY - 0.34, DZ), (x + 0.6, DY - 0.34, H - 0.5), 0.008, stain, verts=4)
        rd(f'Fs_DuctHangerB{i}', FS, (x + 0.6, DY + 0.34, DZ), (x + 0.6, DY + 0.34, H - 0.5), 0.008, stain, verts=4)
        bx(f'Fs_DuctStrap{i}', FS, (0.04, 0.72, 0.03), (x + 0.6, DY, DZ - 0.34), stain)
for i, x in enumerate((0.0, 14.5)):
    cy(f'Fs_DuctDrop{i}', FS, 0.22, 0.6, (x, DY, DZ - 0.45), galv, verts=16)   # (its diffuser 2.2 m over the walkway: clear of heads)
    bbox(f'Fs_Diffuser{i}', FS, (0.6, 0.6, 0.12), (x, DY, DZ - 0.8), alu, bev=0.01)
    for j in range(3): ring(f'Fs_DiffuserRing{i}_{j}', Vector((x, DY, DZ - 0.875)), 0.08 + j * 0.08, 0.1 + j * 0.08, 0.0, 0.015, dark, segs=10)
TY, TZ = 7.35, H - 0.75
for s in (-1, 1): bx(f'Fs_TrayRail{s}', FS, (27.0, 0.02, 0.1), (4.5, TY + s * 0.2, TZ), galv)
for i in range(46): bx(f'Fs_TrayRung{i:02d}', FS, (0.03, 0.4, 0.02), (-8.5 + i * 0.6, TY, TZ - 0.04), galv)
for j, (dy, col) in enumerate(((-0.1, (0.15, 0.15, 0.17)), (0.0, (0.75, 0.2, 0.1)), (0.1, (0.1, 0.25, 0.6)))):
    rd(f'Fs_TrayCable{j}', FS, (-8.4, TY + dy, TZ - 0.01), (17.6, TY + dy, TZ - 0.01), 0.025, plain_mat(f'Fs_Cable{j}', col, dirt=0.02), verts=6)
for i in range(9): rd(f'Fs_TrayHanger{i}', FS, (-8.0 + i * 3.2, TY - 0.2, TZ + 0.05), (-8.0 + i * 3.2, TY - 0.2, H - 0.5), 0.006, stain, verts=4)
SPY = AY1 - 1.0
rd('Fs_Sprinkler', FS, (AX0, SPY, H - 0.6), (X1 - 0.3, SPY, H - 0.6), 0.04, red, verts=8)
for i in range(9):
    x = AX0 + 1.0 + i * 3.0
    rd(f'Fs_SprinklerDrop{i}', FS, (x, SPY, H - 0.6), (x, SPY, H - 0.95), 0.015, red, verts=6)
    lathe(f'Fs_SprinklerHead{i}', FS, [(0.0, 0.0), (0.035, 0.0), (0.02, 0.03), (0.012, 0.06), (0.0, 0.06)], (x, SPY, H - 1.01), brass, segs=6)
    rd(f'Fs_SprinklerClip{i}', FS, (x + 1.5, SPY, H - 0.56), (x + 1.5, SPY, H - 0.5), 0.008, stain, verts=4)

# ======================================================================================================================
# the rotunda: its base, the drum's frames and glass, the head ring, the dome (a thick shell: inside and out), its lit
# ring, the revolving door to the terrace, the curved reception desk
NR = 16; DOOR_A = math.pi * 1.25
def on(a, r, z=0.0): return Vector((ROT.x + math.cos(a) * r, ROT.y + math.sin(a) * r, z))
open_in = lambda am: am > math.pi * 1.85 or am < math.pi * 0.35
for k in range(NR):
    a0, a1 = k / NR * math.tau, (k + 1) / NR * math.tau; am = (a0 + a1) / 2
    p0, p1 = on(a0, ROT_R), on(a1, ROT_R); c = (p0 + p1) / 2; L = (p1 - p0).length; rz = math.atan2(p1.y - p0.y, p1.x - p0.x)
    door = abs(((am - DOOR_A + math.pi) % math.tau) - math.pi) < math.pi / NR * 1.6
    prev_glass = not open_in(am - math.tau / NR); mid_door = abs(((a0 - DOOR_A + math.pi) % math.tau) - math.pi) < 0.05
    if (not open_in(am) or prev_glass) and not mid_door:   # (a mullion at each edge of glass, none in the revolving door's middle)
        bbox(f'Fs_Rot_Mull{k:02d}', FS, (0.07, 0.2, 5.0), (p0.x, p0.y, 2.5), alu, rot=(0, 0, rz), bev=0.008)
    if open_in(am): continue
    bbox(f'Fs_Rot_Base{k:02d}', FS, (L + 0.02, 0.3, 0.12), (c.x, c.y, 0.06), stone, rot=(0, 0, rz), bev=0.008) if not door else None
    if not door: box(f'Fs_Rot_GlassLo{k:02d}', FS, (L - 0.06, 0.024, 2.4), (c.x, c.y, 0.14 + 1.2), glass, rot=(0, 0, rz))
    box(f'Fs_Rot_GlassHi{k:02d}', FS, (L - 0.06, 0.024, 2.3), (c.x, c.y, 2.62 + 1.15), glass, rot=(0, 0, rz))
    bbox(f'Fs_Rot_Transom{k:02d}', FS, (L + 0.02, 0.18, 0.08), (c.x, c.y, 2.58), alu, rot=(0, 0, rz), bev=0.006)
ring('Fs_Rot_Head', ROT, ROT_R - 0.18, ROT_R + 0.22, 4.95, 5.25, white, segs=32)
lathe('Fs_Rot_Dome', FS, [(ROT_R + 0.22, 5.25), (ROT_R + 0.05, 5.55), (ROT_R * 0.72, 6.25), (0.0, 6.55), (0.0, 6.4), (ROT_R * 0.7, 6.1), (ROT_R - 0.18, 5.4), (ROT_R - 0.18, 5.25), (ROT_R + 0.22, 5.25)],
      ROT, white, segs=32, cap0=False, cap1=False)
ring('Fs_Rot_LitRing', ROT, ROT_R - 0.55, ROT_R - 0.32, 4.86, 4.93, cool, segs=32)
ring('Fs_Rot_LitRingBody', ROT, ROT_R - 0.58, ROT_R - 0.29, 4.93, 5.0, alu, segs=32)
for k in range(4): rd(f'Fs_Rot_LitHanger{k}', FS, on(k * math.tau / 4 + 0.3, ROT_R - 0.43, 5.0), on(k * math.tau / 4 + 0.3, ROT_R - 0.43, 5.5), 0.008, stain, verts=4)
# the revolving door: a glass drum of its own, half in, half out, four wings, its canopy; a mat in front of it
DQ = on(DOOR_A, ROT_R); du = Vector((math.cos(DOOR_A), math.sin(DOOR_A), 0)); dp_ = Vector((-du.y, du.x, 0)); DR = 1.3
for s in (-1, 1):
    for j in range(7):   # (its curved sides: across the drum's line, the openings in and out)
        b0 = math.atan2(dp_.y * s, dp_.x * s) - math.pi * 0.27 + j * math.pi * 0.54 / 7; b1 = b0 + math.pi * 0.54 / 7
        q0 = DQ + Vector((math.cos(b0), math.sin(b0), 0)) * DR; q1 = DQ + Vector((math.cos(b1), math.sin(b1), 0)) * DR; qc = (q0 + q1) / 2
        box(f'Fs_Rev_Side{s}_{j}', FS, ((q1 - q0).length - 0.02, 0.02, 2.3), (qc.x, qc.y, 0.05 + 1.15), glass, rot=(0, 0, math.atan2(q1.y - q0.y, q1.x - q0.x)))
    for j in (0, 7):
        b = math.atan2(dp_.y * s, dp_.x * s) - math.pi * 0.27 + j * math.pi * 0.54 / 7; q = DQ + Vector((math.cos(b), math.sin(b), 0)) * DR
        bbox(f'Fs_Rev_Post{s}_{j}', FS, (0.07, 0.07, 2.4), (q.x, q.y, 1.2), stain, bev=0.008)
ring('Fs_Rev_Canopy', DQ, 0.0001, DR + 0.08, 2.35, 2.62, stain, segs=32)
ring('Fs_Rev_CanopyLED', DQ, DR - 0.1, DR + 0.0, 2.33, 2.35, cool, segs=32)
cy('Fs_Rev_Floor', FS, DR, 0.01, (DQ.x, DQ.y, 0.005), rubber, verts=24)
cy('Fs_Rev_Post', FS, 0.06, 2.3, (DQ.x, DQ.y, 1.18), stain, verts=10)
for w in range(4):
    b = DOOR_A + math.pi / 4 + w * D90; e = Vector((math.cos(b), math.sin(b), 0))
    c = DQ + e * (DR - 0.06) / 2; rz = math.atan2(e.y, e.x)
    box(f'Fs_Rev_Wing{w}', FS, (DR - 0.12, 0.02, 2.15), (c.x, c.y, 1.18), glass, rot=(0, 0, rz))
    bbox(f'Fs_Rev_WingTop{w}', FS, (DR - 0.06, 0.05, 0.06), (c.x, c.y, 2.27), stain, rot=(0, 0, rz), bev=0.005)
    bbox(f'Fs_Rev_WingBot{w}', FS, (DR - 0.06, 0.05, 0.08), (c.x, c.y, 0.08), stain, rot=(0, 0, rz), bev=0.005)
    bbox(f'Fs_Rev_WingEdge{w}', FS, (0.05, 0.05, 2.25), (DQ.x + e.x * (DR - 0.06), DQ.y + e.y * (DR - 0.06), 1.17), rubber, rot=(0, 0, rz), bev=0.005)
    rd(f'Fs_Rev_PushBar{w}', FS, (DQ.x + e.x * 0.35, DQ.y + e.y * 0.35, 1.0), (DQ.x + e.x * (DR - 0.25), DQ.y + e.y * (DR - 0.25), 1.0), 0.016, stain, verts=6)
bbox('Fs_Rev_Mat', FS, (2.2, 1.4, 0.012), (DQ.x - du.x * 2.0, DQ.y - du.y * 2.0, 0.006), rubber, rot=(0, 0, DOOR_A + D90), bev=0.004)
# the EXIT sign over the door, inside, on stand-offs from the canopy
sp = DQ - du * 0.95 + Vector((0, 0, 2.86))
sign('Fs_Rot_Exit', 'fa_st_exit', sp, (-du.x, -du.y), 0.56, 0.2, emit=1.4)
for s in (-1, 1): rd(f'Fs_Rot_ExitPost{s}', FS, sp + dp_ * s * 0.2 - Vector((0, 0, 0.26)), sp + dp_ * s * 0.2 - Vector((0, 0, 0.12)), 0.008, stain, verts=4)
# the reception desk: curved round the far side (its back to the tire bay), layered: a recessed plinth, the white body
# with a lit band, the counter, the raised ledge for visitors, the work top behind it
A0, A1 = math.pi * 0.42, math.pi * 0.86
arc_solid('Fs_Desk_Plinth', ROT, 2.05, 2.55, A0 + 0.02, A1 - 0.02, 0.0, 0.08, blk, segs=18)
arc_solid('Fs_Desk_Body', ROT, 1.98, 2.6, A0, A1, 0.08, 1.04, deskw, segs=18)
arc_solid('Fs_Desk_Band', ROT, 1.96, 1.985, A0 + 0.01, A1 - 0.01, 0.2, 0.26, cool, segs=18)
arc_solid('Fs_Desk_Counter', ROT, 1.88, 2.66, A0 - 0.01, A1 + 0.01, 1.04, 1.09, deskw, segs=18)
arc_solid('Fs_Desk_Ledge', ROT, 1.86, 2.02, A0 + 0.04, A1 - 0.04, 1.09, 1.17, stain, segs=18)
arc_solid('Fs_Desk_Worktop', ROT, 2.3, 2.62, A0 + 0.03, A1 - 0.03, 0.72, 0.75, stone, segs=18)
for a in (A0 + 0.05, (A0 + A1) / 2, A1 - 0.05): p = on(a, 2.46); bbox(f'Fs_Desk_Leg{a:.2f}', FS, (0.05, 0.05, 0.64), (p.x, p.y, 0.4), stain, bev=0.008)

# ======================================================================================================================
# the feature stair: closed white stringers, dark treads with lit nosings, glass to the atrium in a shoe with a
# stainless handrail on clamps, a wall rail on the tire bay's side
run = ST_Y1 - ST_Y0; nst = 26; sw = ST_X1 - ST_X0; slope_a = math.atan2(UZ, run)
for i in range(nst):
    y = ST_Y0 + run * (i + 0.5) / nst; z = UZ * (i + 1) / nst
    bx(f'WALK_Fs_Tread{i:02d}', FS, (sw - 0.1, run / nst + 0.03, 0.05), ((ST_X0 + ST_X1) / 2, y, z - 0.025), stone)
    bx(f'WALK_Fs_TreadLED{i:02d}', FS, (sw - 0.16, 0.02, 0.01), ((ST_X0 + ST_X1) / 2, y - run / nst / 2 + 0.03, z + 0.001), led)
for nm, x in (('Wall', ST_X0 + 0.03), ('Atrium', ST_X1 - 0.03)):
    para(f'WALK_Fs_Stringer{nm}', x, ST_Y0 - 0.25, ST_Y1, -0.12, UZ - 0.32, 0.4, 0.05, steel)
NP = 8
for k in range(NP):
    ya, yb = ST_Y0 + run * k / NP + 0.015, ST_Y0 + run * (k + 1) / NP - 0.015
    za, zb = UZ * (ya - ST_Y0) / run, UZ * (yb - ST_Y0) / run
    para(f'Fs_StairGlass{k}', ST_X1 + 0.05, ya, yb, za + 0.12, zb + 0.12, 0.95, 0.016, glass)
    for f, yy in (('a', ya + 0.06), ('b', yb - 0.06)):
        zz = UZ * (yy - ST_Y0) / run; bx(f'Fs_StairClamp{k}{f}', FS, (0.05, 0.05, 0.07), (ST_X1 + 0.05, yy, zz + 1.08), stain)
para('Fs_StairShoe', ST_X1 + 0.05, ST_Y0, ST_Y1, -0.02, UZ - 0.02, 0.16, 0.07, alu)
rd('Fs_StairRail', FS, (ST_X1 + 0.05, ST_Y0 - 0.2, 1.1 - 0.2 * UZ / run), (ST_X1 + 0.05, ST_Y1, UZ + 1.1), 0.024, stain, verts=10)
rd('Fs_StairWallRail', FS, (ST_X0 + 0.09, ST_Y0 - 0.2, 0.92 - 0.2 * UZ / run), (ST_X0 + 0.09, ST_Y1, UZ + 0.92), 0.02, stain, verts=10)
for k in range(6):
    t = (k + 0.5) / 6; y = ST_Y0 + run * t; z = UZ * t + 0.92
    bx(f'Fs_StairWallBracket{k}', FS, (0.09, 0.02, 0.02), (ST_X0 + 0.045, y, z - 0.05), stain)
    cy(f'Fs_StairWallRose{k}', FS, 0.03, 0.01, (ST_X0 + 0.005, y, z - 0.05), stain, rot=(0, D90, 0), verts=8)

# ======================================================================================================================
# the walkways' edges: the slab's white fascia with a lit line under it, a shoe on the slab, glass in it, a stainless
# handrail on clamps along the top; the floor's LED along the inside
def edge(name, a, b, out, glass_too=True, fascia=True):
    a, b = Vector((*a, 0)), Vector((*b, 0)); L = (b - a).length; d = (b - a) / L; n = Vector((*out, 0)); rz = math.atan2(d.y, d.x); c = (a + b) / 2
    if fascia:
        bbox(f'{name}_Fascia', FS, (L, 0.06, 0.42), c + n * 0.03 + Vector((0, 0, UZ - 0.21)), white, rot=(0, 0, rz), bev=0.008)
        bx(f'{name}_FasciaLED', FS, (L - 0.04, 0.02, 0.025), c + n * 0.07 + Vector((0, 0, UZ - 0.39)), led, rot=(0, 0, rz))
    if not glass_too: return
    bbox(f'{name}_Shoe', FS, (L, 0.1, 0.1), c - n * 0.07 + Vector((0, 0, UZ + 0.05)), alu, rot=(0, 0, rz), bev=0.008)
    np_ = max(1, round(L / 1.25))
    for k in range(np_):
        pc = a + d * (L * (k + 0.5) / np_) - n * 0.07
        box(f'{name}_Glass{k:02d}', FS, (L / np_ - 0.02, 0.016, 0.95), pc + Vector((0, 0, UZ + 0.1 + 0.475)), glass, rot=(0, 0, rz))
        pk = a + d * (L * k / np_) - n * 0.07
        if k: bx(f'{name}_Clamp{k:02d}', FS, (0.05, 0.05, 0.07), pk + Vector((0, 0, UZ + 1.07)), stain, rot=(0, 0, rz))
    rd(f'{name}_Rail', FS, a - n * 0.07 + Vector((0, 0, UZ + 1.1)), b - n * 0.07 + Vector((0, 0, UZ + 1.1)), 0.024, stain, verts=10)
    bx(f'WALK_{name}_FloorLED', FS, (L - 0.1, 0.03, 0.006), c - n * 0.18 + Vector((0, 0, UZ + 0.003)), led, rot=(0, 0, rz))
edge('Fs_EdgeBlvd', (AX0 - 2.0, GY - WALK_W), (X1, GY - WALK_W), (0, -1))
edge('Fs_EdgeBlvdEnd', (AX0 - 2.0, GY - WALK_W), (AX0 - 2.0, GY), (-1, 0))
edge('Fs_EdgeStairFront', (AX0, GY), (ST_X1 + 0.05, GY), (0, 1))
edge('Fs_EdgeAtriumFront', (ST_X1 + 0.05, GY), (AX1, GY), (0, 1))
edge('Fs_EdgeStairSide', (AX0, GY), (AX0, ST_Y1), (1, 0))
edge('Fs_EdgeLandingSide', (ST_X1, ST_Y1), (ST_X1, ST_Y1 + 1.2), (1, 0))
edge('Fs_EdgeLandingBack', (AX0, ST_Y1 + 1.2), (ST_X1, ST_Y1 + 1.2), (0, 1))
edge('Fs_EdgeAtriumLeft', (AX0, ST_Y1 + 1.2), (AX0, AY1), (1, 0))
edge('Fs_EdgeAtriumBack', (AX0, AY1), (X1, AY1), (0, -1))
edge('Fs_EdgeControl', (AX1, CTL_Y1), (X1, CTL_Y1), (0, 1), glass_too=False)   # (the control pod's slab edge, over the tunnel hall)
# the soffit's linear light under the balcony, and its slab's underside lights over the atrium's front
bx('Fs_SoffitLine', FS, (X1 - AX0 + 1.8, 0.06, 0.025), ((AX0 - 2.0 + X1) / 2, GY - WALK_W + 0.35, UZ - 0.325), warmline)
bx('Fs_SoffitLineBody', FS, (X1 - AX0 + 1.9, 0.09, 0.03), ((AX0 - 2.0 + X1) / 2, GY - WALK_W + 0.35, UZ - 0.3), alu)

# ======================================================================================================================
# the atrium's light rings: a real fitting each (an aluminium body, the diffuser under it, hangers to the roof steel
# with their ceiling roses), the inner one smaller and lower; the bays' spot fittings on drop rods
RZ = H - 1.5
ring('Fs_Ring_Body', AC, 5.45, 6.0, RZ, RZ + 0.26, alu, segs=64)
ring('Fs_Ring_Diffuser', AC, 5.5, 5.95, RZ - 0.025, RZ, cool, segs=64)
ring('Fs_Ring_EdgeIn', AC, 5.42, 5.45, RZ - 0.02, RZ + 0.27, stain, segs=64)
ring('Fs_Ring_EdgeOut', AC, 6.0, 6.03, RZ - 0.02, RZ + 0.27, stain, segs=64)
ring('Fs_Ring2_Body', AC, 2.45, 2.8, RZ - 0.6, RZ - 0.42, alu, segs=40)
ring('Fs_Ring2_Diffuser', AC, 2.49, 2.76, RZ - 0.62, RZ - 0.6, cool, segs=40)
for k in range(6):
    a = k * math.tau / 6 + 0.2; p = AC + Vector((math.cos(a), math.sin(a), 0)) * 5.72
    rd(f'Fs_Ring_Hanger{k}', FS, (p.x, p.y, RZ + 0.26), (p.x, p.y, H - 0.5), 0.007, stain, verts=4)
    cy(f'Fs_Ring_Rose{k}', FS, 0.05, 0.03, (p.x, p.y, H - 0.51), stain, verts=10)
    bbox(f'Fs_Ring_Clamp{k}', FS, (0.1, 0.1, 0.06), (p.x, p.y, RZ + 0.29), stain, bev=0.008)
for k in range(3):
    a = k * math.tau / 3 + 0.9; p = AC + Vector((math.cos(a), math.sin(a), 0)) * 2.62
    rd(f'Fs_Ring2_Hanger{k}', FS, (p.x, p.y, RZ - 0.42), (p.x, p.y, H - 0.5), 0.006, stain, verts=4)
for n_, b in enumerate((BAY1, BAY2, BAY3)):
    z = 7.55   # (the lens: the spot itself goes just under it, so its own fitting can't shadow it)
    L_ = bpy.data.objects.get(f'Light_Bay_{n_}')
    if L_: L_.location.z = z - 0.06
    rd(f'Fs_BaySpot_Rod{n_}', FS, (b.x, b.y, z + 0.55), (b.x, b.y, H), 0.012, blk, verts=6)
    bbox(f'Fs_BaySpot_Yoke{n_}', FS, (0.44, 0.05, 0.05), (b.x, b.y, z + 0.55), blk, bev=0.005)
    for s in (-1, 1): bbox(f'Fs_BaySpot_YokeArm{n_}{s}', FS, (0.04, 0.05, 0.36), (b.x + s * 0.2, b.y, z + 0.38), blk, bev=0.005)
    lathe(f'Fs_BaySpot_Head{n_}', FS, [(0.0, 0.42), (0.16, 0.42), (0.18, 0.38), (0.18, 0.06), (0.15, 0.0), (0.0, 0.0)], (b.x, b.y, z), blk, segs=16)
    cy(f'Fs_BaySpot_Lens{n_}', FS, 0.135, 0.01, (b.x, b.y, z - 0.005), cool, verts=16)
    for j in range(5): ring(f'Fs_BaySpot_Fin{n_}_{j}', Vector((b.x, b.y, z + 0.14 + j * 0.05)), 0.18, 0.2, 0.0, 0.015, blk, segs=10)
# the plinths' downlights (closed: a housing, a trim, the lens)
for k, p in enumerate(PLINTHS):
    lathe(f'Fs_PlinthLight{k}', FS, [(0.0, 0.0), (0.13, 0.0), (0.15, 0.03), (0.15, 0.18), (0.0, 0.18)], (p.x, p.y, H - 0.98 - 0.18), blk, segs=10)
    cy(f'Fs_PlinthLightLens{k}', FS, 0.11, 0.01, (p.x, p.y, H - 1.165), warm, verts=14)
    rd(f'Fs_PlinthLightRod{k}', FS, (p.x, p.y, H - 0.98), (p.x, p.y, H - 0.62), 0.01, blk, verts=6)

# ======================================================================================================================
# the rooms' ceiling lights (emissive: the scene's light budget is spent): frames and diffusers
def ceil_light(name, x, y, z, w, d, mat=panel):
    bbox(f'{name}_Frame', FS, (w + 0.06, d + 0.06, 0.05), (x, y, z - 0.025), alu, bev=0.006)
    bx(f'{name}_Lens', FS, (w, d, 0.01), (x, y, z - 0.055), mat)
for nm, pts, z, m in (('Tire', ((-16.0, -3.2), (-11.0, -3.2)), RH, panel), ('Machine', ((-16.5, 2.0), (-11.5, 2.0), (-14.0, 5.5)), RH, panel),
                      ('Corridor', ((-5.0, 6.75), (0.5, 6.75), (6.0, 6.75), (12.5, 6.75), (17.0, 6.75)), RH, panel), ('Dock', ((-15.0, 10.7), (-9.0, 10.7)), RH, panel),
                      ('Comp', ((1.5, 10.7),), RH, panel), ('Dyno', ((9.2, 10.7), (15.8, 10.7)), RH, panel),
                      ('Office', ((-16.5, -3.2), (-12.5, -3.2)), UZ + 3.0, dimpanel), ('Ops', ((-16.5, 2.2), (-12.5, 2.2), (-14.5, 5.2)), UZ + 3.0, panel),
                      ('Cafe', ((-15.0, 10.7), (-9.0, 10.7), (-3.0, 10.7)), UZ + 3.0, dimpanel), ('Control', ((12.5, -4.95), (16.5, -4.95)), UZ + 3.0, panel)):
    for i, (x, y) in enumerate(pts):
        ceil_light(f'Fs_CeilLight_{nm}{i}', x, y, z, 1.2 if nm != 'Corridor' else 0.25, 0.3 if nm != 'Corridor' else 1.2, m)

# ======================================================================================================================
# the doors. The atrium's two: automatic sliding glass, standing open (the leaves parked behind the fixed glass either
# side), a transom over, the operator's box with its sensor, a track in the floor.
def slider(name, x0, x1):
    w = (x1 - x0) / 2; y = GY - 0.07
    for s, xc in ((-1, x0 - w / 2 + 0.02), (1, x1 + w / 2 - 0.02)):
        box(f'{name}_Leaf{s}', FS, (w, 0.014, 2.4), (xc, y, 0.04 + 1.2), glass, rot=(0, 0, 0))
        for zz in (0.1, 2.35):
            for xx in (xc - w / 2 + 0.06, xc + w / 2 - 0.06): bx(f'{name}_Patch{s}_{zz}_{xx:.1f}', FS, (0.1, 0.035, 0.07), (xx, y, zz), stain)
        bbox(f'{name}_Handle{s}', FS, (0.02, 0.05, 0.8), (xc - s * (w / 2 - 0.12), y - 0.035, 1.05), stain, bev=0.006)
    box(f'{name}_Transom', FS, (x1 - x0, 0.024, UZ - 0.2 - 2.65), ((x0 + x1) / 2, GY, 2.65 + (UZ - 0.2 - 2.65) / 2), glass)
    bbox(f'{name}_Operator', FS, (x1 - x0 + 2 * w + 0.1, 0.16, 0.16), ((x0 + x1) / 2, GY - 0.1, 2.56), alu, bev=0.01)
    bx(f'{name}_Sensor', FS, (0.18, 0.04, 0.05), ((x0 + x1) / 2, GY - 0.2, 2.5), blk)
    bx(f'{name}_SensorLED', FS, (0.02, 0.01, 0.01), ((x0 + x1) / 2 + 0.06, GY - 0.222, 2.5), green)
    bx(f'WALK_{name}_Track', FS, (x1 - x0 + 2 * w, 0.03, 0.004), ((x0 + x1) / 2, GY - 0.07, 0.002), alu)
slider('Fs_AtriumDoorL', -6.5, -5.0)
slider('Fs_AtriumDoorR', 8.5, 10.0)
emerg('Fs_EmAtriumL', (-5.75, GY - 0.12, 2.85), (0, -1)); emerg('Fs_EmAtriumR', (9.25, GY - 0.12, 2.85), (0, -1))

def door(name, hinge, other, nrm, h=2.2, z0=0.0, leaf_side=None, glass_leaf=False, sign_png=None, sign_nrm=None, double=False, sign_at=None):
    # a door standing open: its frame round the gap (hinge -> other), the leaf swung flat against the wall on the side
    # leaf_side (a normal), its handle and kick plate; a sign beside it; an emergency light over it
    hn, ot = Vector((*hinge, 0)), Vector((*other, 0)); W = (ot - hn).length; d = (ot - hn) / W; rz = math.atan2(d.y, d.x)
    ls = Vector((*(leaf_side or nrm), 0)); Z = Vector((0, 0, z0))
    for nm, p in (('JambA', hn), ('JambB', ot)): bbox(f'{name}_{nm}', FS, (0.07, 0.22, h + 0.06), p + Z + Vector((0, 0, (h + 0.06) / 2)), alu, rot=(0, 0, rz), bev=0.006)
    bbox(f'{name}_Head', FS, (W + 0.14, 0.22, 0.07), (hn + ot) / 2 + Z + Vector((0, 0, h + 0.035)), alu, rot=(0, 0, rz), bev=0.006)
    leaves = [(hn, -d, W / 2 if double else W)] + ([(ot, d, W / 2)] if double else [])
    for i, (p, away, lw) in enumerate(leaves):
        lc = p + away * (lw / 2 + 0.05) + ls * 0.08 + Z + Vector((0, 0, h / 2))
        if glass_leaf:
            box(f'{name}_Leaf{i}', FS, (lw - 0.04, 0.012, h - 0.12), lc, glass, rot=(0, 0, rz))
            for zz in (-h / 2 + 0.07, h / 2 - 0.07): bbox(f'{name}_Rail{i}_{zz:.1f}', FS, (lw - 0.02, 0.04, 0.1), lc + Vector((0, 0, zz)), alu, rot=(0, 0, rz), bev=0.005)
            for e in (-1, 1): bbox(f'{name}_Stile{i}{e}', FS, (0.05, 0.04, h - 0.02), lc + away * e * (lw / 2 - 0.035), alu, rot=(0, 0, rz), bev=0.005)
        else:
            bbox(f'{name}_Leaf{i}', FS, (lw - 0.02, 0.045, h - 0.02), lc, plain_mat('Fs_DoorLeaf', (0.86, 0.87, 0.88), dirt=0.03, rough=0.4), rot=(0, 0, rz), bev=0.006)
            box(f'{name}_Vision{i}', FS, (0.16, 0.05, 0.8), lc + away * (lw / 2 - 0.3) + Vector((0, 0, 0.25)), glass, rot=(0, 0, rz))
            bx(f'{name}_Kick{i}', FS, (lw - 0.1, 0.05, 0.2), lc - Vector((0, 0, h / 2 - 0.12)), stain, rot=(0, 0, rz))
        hp = lc + away * (lw / 2 - 0.08) + ls * 0.05 - Vector((0, 0, h / 2 - 1.05))
        rd(f'{name}_Handle{i}', FS, hp, hp + away * -0.14, 0.012, stain, verts=6)
        rd(f'{name}_HandleRose{i}', FS, hp - ls * 0.03, hp + ls * 0.01, 0.022, stain, verts=8)
        for zz in (0.25, h - 0.3): bx(f'{name}_Hinge{i}_{zz:.1f}', FS, (0.03, 0.05, 0.1), p + away * 0.02 + ls * 0.06 + Z + Vector((0, 0, zz)), stain, rot=(0, 0, rz))
    sn = Vector((*(sign_nrm or nrm), 0))
    if sign_png:
        at = Vector((*sign_at, 0)) if sign_at else ot + d * 0.45
        sign(f'{name}_Sign', sign_png, at + sn * 0.12 + Z + Vector((0, 0, 1.7)), sign_nrm or nrm, 0.36, 0.09)
    emerg(f'{name}_Em', (hn + ot) / 2 + sn * 0.14 + Z + Vector((0, 0, h + 0.2)), sign_nrm or nrm)
# (hinge, other side, the wall's normal toward where you come from, the side the leaf lies flat on)
door('Fs_Door_Machine', (AX0, 3.0), (AX0, 4.2), (1, 0), leaf_side=(-1, 0), sign_png='fa_st_door_machine', sign_at=(AX0, 4.65))
box('Fs_Door_MachineFill', FS, (0.024, 0.3, RH - 1.0), (AX0, 4.35, 1.0 + (RH - 1.0) / 2), glass)
box('Fs_Door_MachineTransom', FS, (0.024, 1.2, RH - 2.3), (AX0, 3.6, 2.3 + (RH - 2.3) / 2), glass, rot=(0, 0, 0))
door('Fs_Door_MachineBack', (AX0, 6.05), (AX0, 7.45), (1, 0), leaf_side=(-1, 0))
door('Fs_Door_Office', (AX0 - 2.0, -3.25), (AX0 - 2.0, -2.15), (1, 0), z0=UZ, leaf_side=(-1, 0), glass_leaf=True, sign_png='fa_st_door_office', sign_at=(AX0 - 2.0, -1.0))
box('Fs_Door_OfficeTransom', FS, (0.024, 1.1, 0.7), (AX0 - 2.0, -2.7, UZ + 2.6), glass)
box('Fs_Door_OfficeFill', FS, (0.024, 0.5, 3.0 - 0.08), (AX0 - 2.0, -1.88, UZ + 1.5), glass)
door('Fs_Door_Ops', (AX0 - 2.0, 1.55), (AX0 - 2.0, 2.65), (1, 0), z0=UZ, leaf_side=(-1, 0), glass_leaf=True, sign_png='fa_st_door_ops', sign_at=(AX0 - 2.0, 0.9))   # (clear of the data station's desks)
box('Fs_Door_OpsFill', FS, (0.024, 0.33, 3.0 - 0.08), (AX0 - 2.0, 2.83, UZ + 1.5), glass)
box('Fs_Door_OpsTransom', FS, (0.024, 1.1, 0.7), (AX0 - 2.0, 2.1, UZ + 2.6), glass)
door('Fs_Door_Cafe', (-8.5, CY1), (-7.4, CY1), (0, -1), z0=UZ, leaf_side=(0, 1), glass_leaf=True, sign_png='fa_st_door_cafe', sign_at=(-6.4, CY1))
box('Fs_Door_CafeFill', FS, (0.36, 0.024, 3.0 - 0.08), (-7.2, CY1, UZ + 1.5), glass)
box('Fs_Door_CafeTransom', FS, (1.1, 0.024, 0.7), (-7.95, CY1, UZ + 2.6), glass)
door('Fs_Door_Sim', (4.1, CY1), (3.0, CY1), (0, -1), z0=UZ, leaf_side=(0, 1), sign_png='fa_st_door_sim', sign_at=(5.1, CY1))
door('Fs_Door_Control', (11.35, GY), (10.2, GY), (0, -1), z0=UZ, leaf_side=(0, 1), glass_leaf=True, sign_png='fa_st_door_control', sign_at=(12.3, GY))
box('Fs_Door_ControlFill', FS, (0.15, 0.024, 2.92), (11.43, GY, UZ + 1.5), glass)
box('Fs_Door_ControlFill2', FS, (0.16, 0.024, 2.92), (10.08, GY, UZ + 1.5), glass)
box('Fs_Door_ControlTransom', FS, (1.3, 0.024, 0.7), (10.75, GY, UZ + 2.6), glass)
door('Fs_Door_Dock', (-7.6, CY1), (-5.8, CY1), (0, -1), h=2.9, leaf_side=(0, 1), double=True, sign_png='fa_st_door_dock', sign_at=(-4.9, CY1))
door('Fs_Door_Comp', (-0.2, CY1), (-1.4, CY1), (0, -1), leaf_side=(0, 1), sign_png='fa_st_door_composites', sign_at=(-2.3, CY1))
door('Fs_Door_Dyno', (7.8, CY1), (6.6, CY1), (0, -1), leaf_side=(0, 1), sign_png='fa_st_door_dyno', sign_at=(8.7, CY1))
door('Fs_Door_Tunnel', (AX1, 3.3), (AX1, 2.1), (-1, 0), leaf_side=(1, 0), sign_png='fa_st_door_tunnel', sign_at=(AX1, 1.2))
door('Fs_Door_DynoSplit', (12.5, 9.5), (12.5, 10.7), (-1, 0), leaf_side=(1, 0))

# the dock's roller door (closed): its curtain of slats with a row of vision panels, the bottom rail, guides, the hood
# and its motor with the hand chain, the button station, KEEP CLEAR on it, the green EXIT sign over it
RX_ = X0 + 0.08; R0, R1, RHt = 8.35, 13.15, 4.3; RC = (R0 + R1) / 2   # (in line with the transporter, SLOT_truck y 10.75)
bbox('Fs_Roller_Curtain', FS, (0.05, R1 - R0, RHt), (RX_, RC, RHt / 2), galv, bev=0.004)
for i in range(1, 34): bx(f'Fs_Roller_Slat{i:02d}', FS, (0.02, R1 - R0 - 0.02, 0.012), (RX_ + 0.03, RC, i * RHt / 34), galv)
for i in range(6): box(f'Fs_Roller_Vision{i}', FS, (0.06, 0.45, 0.12), (RX_, R0 + 0.55 + i * 0.75, 1.75), glass)
bbox('Fs_Roller_Bottom', FS, (0.12, R1 - R0, 0.1), (RX_ + 0.02, RC, 0.05), alu, bev=0.008)
for s, y in (('A', R0 - 0.06), ('B', R1 + 0.06)): bbox(f'Fs_Roller_Guide{s}', FS, (0.16, 0.12, RHt + 0.15), (RX_ + 0.04, y, (RHt + 0.15) / 2), galv, bev=0.006)
bbox('Fs_Roller_Hood', FS, (0.6, R1 - R0 + 0.5, 0.6), (X0 + 0.32, RC, RHt + 0.35), galv, bev=0.02)
bbox('Fs_Roller_Motor', FS, (0.35, 0.4, 0.35), (X0 + 0.3, R1 + 0.5, RHt + 0.3), plain_mat('Fs_Motor', (0.2, 0.32, 0.55), dirt=0.04), bev=0.02)
cy('Fs_Roller_MotorCan', FS, 0.12, 0.3, (X0 + 0.3, R1 + 0.75, RHt + 0.3), plain_mat('Fs_Motor', (0.2, 0.32, 0.55), dirt=0.04), rot=(D90, 0, 0), verts=12)
for s in (-1, 1): rd(f'Fs_Roller_Chain{s}', FS, (X0 + 0.38 + s * 0.04, R1 + 0.52, RHt + 0.12), (X0 + 0.38 + s * 0.04, R1 + 0.52, 1.3), 0.006, stain, verts=4)
bbox('Fs_Roller_Buttons', FS, (0.08, 0.16, 0.26), (X0 + 0.05, R1 + 0.9, 1.4), plain_mat('Fs_ButtonBox', (0.85, 0.86, 0.86), dirt=0.03), bev=0.01)
cd('Fs_Roller_ButtonsFace', FS, 0.12, 0.2, (X0 + 0.091, R1 + 0.9, 1.3), art('Fs_Buttons', 'fa_st_buttons'), rotz=D90)
rd('Fs_Roller_Conduit', FS, (X0 + 0.04, R1 + 0.9, 1.53), (X0 + 0.04, R1 + 0.9, RHt + 0.3), 0.012, galv, verts=6)
cd('Fs_Roller_KeepClear', FS, 1.6, 0.4, (RX_ + 0.03, RC, 1.0), art('Fs_KeepClear', 'fa_st_keepclear'), rotz=D90)
sign('Fs_Dock_Exit', 'fa_st_exit', (X0 + 0.05, RC, RHt + 0.95), (1, 0), 0.7, 0.25, emit=1.4)
bbox('Fs_Dock_Bumper0', FS, (0.15, 0.3, 0.4), (X0 + 0.1, R0 - 0.4, 0.5), rubber, bev=0.02)
bbox('Fs_Dock_Bumper1', FS, (0.15, 0.3, 0.4), (X0 + 0.1, R1 + 0.4, 0.5), rubber, bev=0.02)

# ======================================================================================================================
# the tunnel hall's divider: the glass over its ground-floor wall gets a head and a base channel; emergency lights along
# the walkway and in the Boulevard
bbox('Fs_TunnelGlassBase', FS, (0.12, AY1 - CTL_Y1, 0.1), (AX1, (AY1 + CTL_Y1) / 2, RH + 0.05), alu, bev=0.006)
edge('Fs_EdgeOffice', (X0, GY), (AX0 - 2.0, GY), (0, -1), glass_too=False)   # (the office's slab edge over the Boulevard)
print('structure tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in FS.all_objects if o.type == 'MESH'))
