# tools/workshop/services.py: run inside tools/garage-workshop.py (exec'd with its globals: the plan's numbers, B, dress,
# lights, hooks, garagelib's helpers). See that script's header for the layout.
# What's on the walls: the air main and its drops, trunking and sockets, the board, cable trays, heaters, fire
# kit, the signs and the team's banner.
#
# Heights on the left wall, bottom up: trunking 1.15, the air main 2.75, the heaters 3.1-3.75, the cable tray 3.95-4.05,
# the high windows 4.2-5.6, the gas main 5.7. On the back row's partition: trunking 0.9 (under the dyno window), the
# air main 2.75 (over the doors and the window), signs and the clock above. Everything here is named Sv_.
import subprocess
SV_ART = os.path.join(SRC, 'stations_gen', 'art')
if not os.path.exists(os.path.join(SV_ART, 'ws_sv_spons_d.png')) or '--art' in args:
    subprocess.run(['python3', os.path.join(os.path.dirname(os.path.abspath(f)), 'services_art.py')], check=True)
SA = lambda n: os.path.join(SV_ART, f'ws_sv_{n}.png')

# ---- a wall's frame: u along it, off out from its face into the room, z up; th turns a piece's -Y to face the room
class Wall:
    def __init__(self, o, th): self.O = Vector(o); self.th = th; self.R = Matrix.Rotation(th, 4, 'Z')
    def P(self, u, off, z): return self.O + self.R @ Vector((u, -off, z))
    def rot(self, m=None): return (self.R @ (m if m is not None else Matrix.Identity(4))).to_euler()
WL = Wall((X0, 0, 0), D90)               # the left wall: u is world y
WP = Wall((0, BACK_Y - 0.1, 0), 0.0)     # the back row's partition, its hall face: u is world x
WF = Wall((0, Y0, 0), math.pi)           # the front wall: u is -x
WB = Wall((0, Y1, 0), 0.0)               # the back wall's liner (above the back rooms): u is world x
AX_U = Matrix.Rotation(D90, 4, 'Y')      # (a lathe's axis along the wall)
AX_N = Matrix.Rotation(D90, 4, 'X')      # (a lathe's axis out of the wall, into the room)

def wbox(W, name, size, u, off, z, mat, bev=0.004, m=None):
    # a box on a wall: size (along, out, up), its middle at u, off, z
    return bbox(name, B, size, W.P(u, off, z), mat, rot=W.rot(m), bev=bev) if bev else bx(name, B, size, W.P(u, off, z), mat, rot=W.rot(m))
def wrod(W, name, a, b, r, mat, verts=8): return rd(name, B, W.P(*a), W.P(*b), r, mat, verts=verts)
def wsweep(W, name, pts, r, mat, segs=6, per_m=10, **k): return sweep(name, B, [W.P(*p) for p in pts], r, mat, segs=segs, per_m=per_m, **k)
def wlathe(W, name, prof, u, off, z, mat, axis=None, segs=12, **k): return lathe(name, B, prof, W.P(u, off, z), mat, segs=segs, rot=W.rot(axis), **k)
_arts = {}
def amat(n, dirt=0.12, emit=None):
    if n not in _arts: _arts[n] = art_mat('Sv_' + n, SA(n), dirt=dirt, emit=emit, rough=0.6)
    return _arts[n]
def wcard(W, name, w, h, u, z, art, off=0.008, back=0.004, spin=0.0, backmat=None, dirt=0.12):
    # a printed sign on a wall: the print w x h (its bottom middle at u, z), on a plastic backing; spin turns it in the wall's plane
    o = cd(name, B, w, h, W.P(u, off, z), amat(art, dirt) if isinstance(art, str) else art, rotz=W.th)
    if spin: o.rotation_euler = (W.R @ Matrix.Rotation(spin, 4, 'Y')).to_euler()
    if back: wbox(W, name + '_Back', (w, back, h), u, off - back / 2 - 0.0005, z + h / 2, backmat or plastic_w, bev=0, m=Matrix.Rotation(spin, 4, 'Y'))
    return o
def fillet(pts, r=0.12, n=4):
    # a polyline with its corners rounded (radius r, n points round each): pipes bend, they don't kink
    P = [Vector(p) for p in pts]; out = [P[0]]
    for a, b, c in zip(P, P[1:], P[2:]):
        d0, d1 = (b - a).normalized(), (c - b).normalized(); k = min(r, (b - a).length / 2, (c - b).length / 2)
        p0, p1 = b - d0 * k, b + d1 * k
        for i in range(n + 1):
            t = i / n; out.append((p0 * (1 - t) + b * t) * (1 - t) + (b * (1 - t) + p1 * t) * t)
    out.append(P[-1]); return [tuple(p) for p in out]
def straight(pts, step=1.5):
    # long straight runs given points every `step` m (a sweep's spline stays straight between close points)
    out = [Vector(pts[0])]
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b); n = max(1, int((b - a).length / step))
        out += [a + (b - a) * (i / n) for i in range(1, n + 1)]
    return [tuple(p) for p in out]

# ---- materials
air_blue = plain_mat('Sv_AirPipe', (0.13, 0.32, 0.64), dirt=0.1, rough=0.45)
galv = grimy_tile('Sv_Galv', 'galvanized_metal.png', dirt=0.1)
grey_paint = plain_mat('Sv_GreyPaint', (0.6, 0.62, 0.62), dirt=0.1)
plastic_w = plain_mat('Sv_PlasticWhite', (0.9, 0.9, 0.88), dirt=0.06)
red_paint = plain_mat('Sv_RedPaint', (0.74, 0.07, 0.06), dirt=0.06, rough=0.35)
blk = solid_mat('Sv_Black', (0.04, 0.04, 0.045), 0.5)
rubber_b = solid_mat('Sv_Rubber', (0.025, 0.025, 0.03), 0.8)
brass = solid_mat('Sv_Brass', (0.72, 0.55, 0.24), 0.35)
amber = solid_mat('Sv_FilterBowl', (0.62, 0.42, 0.12), 0.15)
gas_y = plain_mat('Sv_GasPipe', (0.86, 0.68, 0.1), dirt=0.1, rough=0.45)
heater_case = plain_mat('Sv_HeaterCase', (0.68, 0.66, 0.6), dirt=0.12)
flue_m = grimy_tile('Sv_Flue', 'galvanized_metal.png', dirt=0.35)
blue16 = plain_mat('Sv_Blue16A', (0.16, 0.36, 0.76), dirt=0.06, rough=0.4)
green_box = plain_mat('Sv_GreenBox', (0.1, 0.5, 0.26), dirt=0.06, rough=0.4)
cork = plain_mat('Sv_Cork', (0.62, 0.44, 0.26), dirt=0.1, fleck=0.14)
wood_fr = plain_mat('Sv_FrameWood', (0.42, 0.28, 0.16), dirt=0.08)
alu_fr = plain_mat('Sv_FrameAlu', (0.7, 0.71, 0.72), dirt=0.05, rough=0.35)
hose_m = plain_mat('Sv_AirHose', (0.86, 0.42, 0.08), dirt=0.1, rough=0.5)
accent = plain_mat('TeamAccent_SvFrame', (0.9, 0.9, 0.9), dirt=0.05, rough=0.4)   # (the game: the team's accent, multiplied over)
cable_m = solid_mat('Sv_Cable', (0.08, 0.08, 0.09), 0.7)
cable_g = solid_mat('Sv_CableGrey', (0.45, 0.46, 0.47), 0.7)

# ======================================================================================================================
# the compressed-air main: out of the parts store (the compressor's in there) through the partition at x 1.3, along
# the partition 2.75 up, round the corner and down the left wall to the front, capped with a drain valve. Drops off
# its top (swan necks: the water stays in the main) to a filter-regulator, a gauge, a ball valve and a coupler
ZA, OFF_L, OFF_P = 2.75, 0.36, 0.25
cx = X0 + OFF_L; cyp = BACK_Y - 0.1 - OFF_P
main_pts = [(1.3, BACK_Y + 0.05, ZA), (1.3, cyp, ZA), (cx, cyp, ZA), (cx, Y0 + 0.5, ZA)]
sweep('Sv_AirMain', B, fillet(straight(main_pts, 1.6), 0.16, 5), 0.026, air_blue, segs=8, per_m=3)
rd('Sv_AirMain_WallSleeve', B, (1.3, BACK_Y - 0.08, ZA), (1.3, BACK_Y - 0.13, ZA), 0.045, galv, verts=10)
lathe('Sv_AirMain_Cap', B, [(0.0, 0.0), (0.03, 0.0), (0.03, 0.05), (0.022, 0.065), (0.0, 0.068)], (cx, Y0 + 0.52, ZA), air_blue, segs=10, rot=(D90, 0, 0))
# (the drain: a short leg down off the cap end, a ball valve with its red lever)
rd('Sv_AirMain_DrainLeg', B, (cx, Y0 + 0.55, ZA - 0.02), (cx, Y0 + 0.55, ZA - 0.32), 0.012, air_blue, verts=6)
rd('Sv_AirMain_DrainValve', B, (cx, Y0 + 0.55, ZA - 0.3), (cx, Y0 + 0.55, ZA - 0.36), 0.02, brass, verts=8)
bx('Sv_AirMain_DrainLever', B, (0.09, 0.012, 0.008), (cx + 0.04, Y0 + 0.55, ZA - 0.33), red_paint)
# its brackets: an arm off the wall and a clamp every ~1.8 m; on a frame column, off the column's face
COLS = (-8.85, -3.0, 3.0, 8.85)
def bracket(W, u, off, name, from_off=0.0):
    wbox(W, name + '_Arm', (0.04, off - from_off + 0.02, 0.012), u, (off + from_off) / 2, ZA - 0.034, galv, bev=0)
    wbox(W, name + '_Plate', (0.06, 0.008, 0.08), u, from_off + 0.004, ZA - 0.03, galv, bev=0)
    wlathe(W, name + '_Clamp', [(0.03, -0.018), (0.031, 0.0), (0.03, 0.018)], u, off, ZA, galv, axis=AX_U, segs=8, cap0=False, cap1=False)
for k, y in enumerate(np.arange(Y0 + 1.0, BACK_Y - 0.4, 1.8)):
    near = [c for c in COLS if abs(y - c) < 0.45]
    bracket(WL, near[0] if near else y, OFF_L, f'Sv_AirBr_L{k}', 0.3 if near else 0.0)
for k, x in enumerate(np.arange(X0 + 0.9, 1.0, 1.9)): bracket(WP, x, OFF_P, f'Sv_AirBr_P{k}')

def air_drop(W, u, off, name, coil=False, side=1):
    # off the main's top: up, over and down the wall (a swan neck), clipped to the wall, to the filter-regulator at 1.7
    s = side
    wsweep(W, name + '_Neck', fillet([(u, off, ZA + 0.02), (u, off, ZA + 0.14), (u, 0.12, ZA + 0.14), (u, 0.12, ZA - 0.1), (u, 0.12, 1.9)], 0.06, 4), 0.012, air_blue, segs=6, per_m=12)
    rd(name + '_Tee', B, W.P(u, off, ZA + 0.015), W.P(u, off, ZA + 0.05), 0.017, air_blue, verts=8)
    for z in (2.35, 2.05): wbox(W, f'{name}_Clip{z}', (0.05, 0.12, 0.02), u, 0.06, z, galv, bev=0)
    # the ball valve, its red lever
    wrod(W, name + '_Valve', (u, 0.12, 1.92), (u, 0.12, 1.86), 0.02, brass)
    wbox(W, name + '_ValveLever', (0.012, 0.09, 0.008), u, 0.17, 1.9, red_paint, bev=0)
    # the filter-regulator on its wall plate: body, bowl, the knob on top, the gauge facing out
    wbox(W, name + '_Plate', (0.14, 0.008, 0.2), u, 0.004, 1.74, galv, bev=0)
    wbox(W, name + '_Body', (0.08, 0.075, 0.09), u, 0.12, 1.79, grey_paint, bev=0.008)
    wrod(W, name + '_Knob', (u, 0.12, 1.835), (u, 0.12, 1.87), 0.022, blk, verts=10)
    wlathe(W, name + '_Bowl', [(0.0, 0.0), (0.016, 0.005), (0.028, 0.03), (0.03, 0.08), (0.032, 0.09)], u, 0.12, 1.655, amber, segs=10)
    wlathe(W, name + '_GaugeCase', [(0.0, 0.0), (0.033, 0.0), (0.035, 0.012), (0.033, 0.022)], u, 0.16, 1.8, blk, axis=AX_N, segs=12, cap1=False)
    cd(name + '_GaugeFace', B, 0.056, 0.056, W.P(u, 0.183, 1.772), amat('gauge', 0.03), rotz=W.th)
    # out of its side and down to the coupler, which hangs ready
    wsweep(W, name + '_Out', fillet([(u, 0.12, 1.75), (u + 0.09 * s, 0.12, 1.75), (u + 0.09 * s, 0.12, 1.36)], 0.04, 3), 0.01, air_blue, segs=6, per_m=12)
    wlathe(W, name + '_Coupler', [(0.0, 0.0), (0.014, 0.0), (0.016, 0.03), (0.019, 0.034), (0.019, 0.06), (0.012, 0.07)], u + 0.09 * s, 0.12, 1.29, brass, segs=10)
    if coil:
        # a coiled hose on a hook beside it: the hook, three loops hanging off it, its end with a coupler
        hu = u - 0.24 * s
        wbox(W, name + '_HookPlate', (0.06, 0.008, 0.1), hu, 0.004, 1.62, galv, bev=0)
        wsweep(W, name + '_Hook', [(hu, 0.0, 1.6), (hu, 0.1, 1.6), (hu, 0.13, 1.64)], 0.008, galv, segs=5, per_m=20)
        for i in range(3):
            r = 0.15 + 0.008 * i; o = 0.055 + i * 0.022; cz = 1.6 - r + 0.012; du = (i - 1) * 0.02
            pts = [(hu + du + math.sin(a) * r, o, cz + math.cos(a) * r) for a in np.linspace(0, math.tau, 13)[:-1]]
            wsweep(W, f'{name}_Loop{i}', pts, 0.011, hose_m, segs=5, per_m=8, closed=True)
        wsweep(W, name + '_HoseEnd', [(hu + 0.05, 0.1, 1.29), (hu + 0.08, 0.11, 1.18), (hu + 0.07, 0.12, 1.06)], 0.011, hose_m, segs=5, per_m=10)
        wlathe(W, name + '_HoseCoupler', [(0.0, 0.0), (0.013, 0.0), (0.016, 0.03), (0.012, 0.055)], hu + 0.07, 0.12, 1.0, brass, segs=8)
air_drop(WL, -3.85, OFF_L, 'Sv_AirDrop_L0', coil=True, side=1)
air_drop(WL, 2.0, OFF_L, 'Sv_AirDrop_L1', coil=True, side=-1)
air_drop(WP, -11.2, OFF_P, 'Sv_AirDrop_P0', coil=False, side=1)    # (in the corner left of the dyno window)
air_drop(WP, 1.5, OFF_P, 'Sv_AirDrop_P1', coil=False, side=1)      # (past the stores door, which folds back flat to x 1.4)

# ======================================================================================================================
# electrics: galvanised trunking along the blockwork with sockets on it (blue 16 A industrial, white twin 13 A); the
# distribution board by the front of the left wall, conduits up to a cable tray along under the high windows
def trunk(W, name, u0, u1, z):
    wbox(W, name, (u1 - u0, 0.075, 0.075), (u0 + u1) / 2, 0.0375, z, galv, bev=0.004)
    wbox(W, name + '_Lid', (u1 - u0 - 0.01, 0.006, 0.05), (u0 + u1) / 2, 0.078, z, galv, bev=0)   # (its lid's seam)
    for k, u in enumerate((u0, u1)): wbox(W, f'{name}_End{k}', (0.008, 0.082, 0.082), u, 0.039, z, galv, bev=0)
def sock16(W, name, u, z):
    wbox(W, name, (0.09, 0.07, 0.11), u, 0.11, z, blue16, bev=0.008)
    wrod(W, name + '_Sock', (u, 0.145, z - 0.005), (u, 0.17, z - 0.005), 0.032, blue16, verts=10)
    wbox(W, name + '_Lid', (0.07, 0.012, 0.075), u, 0.178, z + 0.008, blue16, bev=0.004, m=Matrix.Rotation(-0.35, 4, 'X'))
def sock13(W, name, u, z):
    wbox(W, name, (0.16, 0.04, 0.085), u, 0.095, z, plastic_w, bev=0.006)
    cd(name + '_Face', B, 0.15, 0.075, W.P(u, 0.1162, z - 0.0375), amat('socket', 0.05), rotz=W.th)
TZ_L, TZ_P = 1.15, 0.9
for k, (a, b) in enumerate(((-8.7, -3.15), (0.45, 2.85), (3.15, 4.3))): trunk(WL, f'Sv_Trunk_L{k}', a, b, TZ_L)
for k, (a, b) in enumerate(((X0 + 0.15, -6.7), (-4.05, -0.7))): trunk(WP, f'Sv_Trunk_P{k}', a, b, TZ_P)
for k, (W, u, z, kind) in enumerate(((WL, -7.2, TZ_L, 16), (WL, -5.4, TZ_L, 13), (WL, 1.2, TZ_L, 13), (WL, 2.45, TZ_L, 16),
                                     (WP, -11.0, TZ_P, 13), (WP, -8.0, TZ_P, 16), (WP, -3.2, TZ_P, 16), (WP, -1.6, TZ_P, 13))):
    (sock16 if kind == 16 else sock13)(W, f'Sv_Socket_{k}', u, z)

# the distribution board and its isolator (left wall, by the front, above where the tires stack)
DBU = -8.15
wbox(WL, 'Sv_DB', (0.6, 0.2, 0.85), DBU, 0.1, 1.95, grey_paint, bev=0.01)
wbox(WL, 'Sv_DB_DoorSeam', (0.56, 0.004, 0.8), DBU, 0.2015, 1.95, blk, bev=0)
wbox(WL, 'Sv_DB_Door', (0.555, 0.006, 0.795), DBU, 0.204, 1.95, grey_paint, bev=0)
wbox(WL, 'Sv_DB_Handle', (0.02, 0.03, 0.12), DBU + 0.22, 0.22, 1.95, blk, bev=0.004)
wcard(WL, 'Sv_DB_Label', 0.24, 0.12, DBU - 0.05, 2.15, 'db', off=0.209, back=0)
wbox(WL, 'Sv_Isolator', (0.2, 0.14, 0.26), DBU + 0.55, 0.07, 1.82, grey_paint, bev=0.008)
wcard(WL, 'Sv_Isolator_Plate', 0.11, 0.11, DBU + 0.55, 1.77, gas_y, off=0.142, back=0)
wbox(WL, 'Sv_Isolator_Handle', (0.03, 0.04, 0.13), DBU + 0.55, 0.17, 1.82, red_paint, bev=0.006, m=Matrix.Rotation(0.6, 4, 'Y'))
wcard(WL, 'Sv_Isolator_Label', 0.18, 0.068, DBU + 0.55, 1.98, 'isolator', off=0.006, back=0.003)
# conduits: three up from the board's top into the tray, two down into the trunking, one over to the isolator
TRAY_Z, TRAY_OFF, TRAY_W = 3.95, 0.45, 0.3
for k, du in enumerate((-0.18, 0.0, 0.18)):
    u = DBU + du
    wsweep(WL, f'Sv_DB_Up{k}', fillet([(u, 0.06 + 0.02 * k, 2.37), (u, 0.06 + 0.02 * k, TRAY_Z - 0.2), (u, TRAY_OFF - 0.06 + 0.06 * k, TRAY_Z + 0.03)], 0.1, 4), 0.012, galv, segs=6, per_m=6)
    for z in (2.7, 3.2, 3.6): wbox(WL, f'Sv_DB_Up{k}_Saddle{z}', (0.035, 0.03, 0.012), u, 0.055 + 0.02 * k, z, galv, bev=0)
for k, du in enumerate((-0.12, 0.12)):
    wrod(WL, f'Sv_DB_Down{k}', (DBU + du, 0.05, 1.52), (DBU + du, 0.05, TZ_L + 0.035), 0.012, galv)
wsweep(WL, 'Sv_DB_ToIso', [(DBU + 0.3, 0.06, 1.75), (DBU + 0.38, 0.06, 1.75), (DBU + 0.45, 0.06, 1.78)], 0.01, galv, segs=5, per_m=10)
# a conduit down from the tray to the trunking, mid-wall; another from the partition's trunking up the corner to the tray
wsweep(WL, 'Sv_Drop_L', fillet([(2.55, TRAY_OFF, TRAY_Z), (2.55, 0.03, TRAY_Z - 0.18), (2.55, 0.03, TZ_L + 0.04)], 0.1, 4), 0.012, galv, segs=6, per_m=4)
wsweep(WP, 'Sv_Drop_P', fillet([(X0 + 0.12, 0.03, TZ_P + 0.04), (X0 + 0.12, 0.03, ROOM_H - 0.05), (X0 + 0.12, 0.25, ROOM_H + 0.2), (X0 + 0.12, 0.3, TRAY_Z + 0.03)], 0.1, 4), 0.012, galv, segs=6, per_m=4)

# the cable tray: under the high windows the whole length of the left wall, on arms off the wall (off a column's face
# where one stands), cables laid in it
TY0, TY1 = Y0 + 0.4, Y1 - 0.4
TL = TY1 - TY0
wbox(WL, 'Sv_Tray_Base', (TL, TRAY_W, 0.006), (TY0 + TY1) / 2, TRAY_OFF, TRAY_Z, galv, bev=0)
for s in (-1, 1): wbox(WL, f'Sv_Tray_Side{s}', (TL, 0.006, 0.06), (TY0 + TY1) / 2, TRAY_OFF + s * TRAY_W / 2, TRAY_Z + 0.027, galv, bev=0)
for k, y in enumerate(np.arange(TY0 + 0.3, TY1, 1.5)):
    near = [c for c in COLS if abs(y - c) < 0.4]; y = near[0] if near else y; f0 = 0.3 if near else 0.0
    wbox(WL, f'Sv_Tray_Arm{k}', (0.04, TRAY_OFF + TRAY_W / 2 - f0 + 0.02, 0.03), y, (TRAY_OFF + TRAY_W / 2 + f0) / 2, TRAY_Z - 0.018, galv, bev=0)
    wbox(WL, f'Sv_Tray_ArmPlate{k}', (0.08, 0.008, 0.12), y, f0 + 0.004, TRAY_Z - 0.04, galv, bev=0)
for k, (o, m) in enumerate(((0.36, cable_m), (0.42, cable_g), (0.47, cable_m), (0.53, cable_g))):
    rng = np.random.default_rng(40 + k)
    pts = [(y, o + rng.uniform(-0.015, 0.015), TRAY_Z + 0.016 + (k % 2) * 0.012) for y in np.arange(TY0 + 0.05, TY1, 1.2)]
    wsweep(WL, f'Sv_Tray_Cable{k}', pts, 0.011 + 0.003 * (k % 2), m, segs=4, per_m=2)

# ======================================================================================================================
# two gas warm-air heaters, high on the left wall between the windows: a cased burner and fan on angle brackets,
# louvres angled down at the floor, the flue out through the wall, fed by a yellow gas pipe from the main under the eaves
GZ = 5.72
# (in through the wall by the front, round the frame column at y -3: out in front of it and back)
wsweep(WL, 'Sv_GasMain', fillet(straight([(Y0 + 0.35, 0.05, GZ), (-3.42, 0.05, GZ), (-3.27, 0.37, GZ), (-2.73, 0.37, GZ), (-2.58, 0.05, GZ), (2.05, 0.05, GZ)], 1.6), 0.08, 4), 0.02, gas_y, segs=6, per_m=3)
rd('Sv_GasMain_Sleeve', B, WL.P(Y0 + 0.35, -0.02, GZ), WL.P(Y0 + 0.35, 0.02, GZ), 0.035, galv, verts=8)
for k, y in enumerate([y for y in np.arange(Y0 + 1.0, 2.0, 1.5) if abs(y + 3.0) > 0.5]): wbox(WL, f'Sv_GasMain_Saddle{k}', (0.03, 0.05, 0.05), y, 0.03, GZ, galv, bev=0)
for k, hy in enumerate((-3.85, 1.5)):
    n = f'Sv_Heater{k}'; z0, z1, o0, o1, w = 3.1, 3.75, 0.15, 0.7, 0.9
    wbox(WL, n + '_Case', (w, o1 - o0, z1 - z0), hy, (o0 + o1) / 2, (z0 + z1) / 2, heater_case, bev=0.015)
    wbox(WL, n + '_Front', (w - 0.06, 0.015, z1 - z0 - 0.08), hy, o1 + 0.005, (z0 + z1) / 2 - 0.02, blk, bev=0)
    for i in range(6):
        wbox(WL, f'{n}_Louvre{i}', (w - 0.1, 0.07, 0.008), hy, o1 + 0.03, z0 + 0.1 + i * 0.085, heater_case, bev=0, m=Matrix.Rotation(-0.45, 4, 'X'))
    cd(n + '_Plate', B, 0.24, 0.06, WL.P(hy, o1 + 0.008, z1 - 0.075), amat('heaterplate', 0.08), rotz=WL.th)
    wbox(WL, n + '_Grille', (0.4, 0.006, 0.3), hy, o0 - 0.003, (z0 + z1) / 2, blk, bev=0)   # (the fan's intake behind)
    for s in (-1, 1):   # (two angle brackets off the wall, braced)
        wbox(WL, f'{n}_Bracket{s}', (0.04, 0.64, 0.04), hy + s * 0.34, 0.32, z0 - 0.02, galv, bev=0)
        wsweep(WL, f'{n}_Brace{s}', [(hy + s * 0.34, 0.0, z0 - 0.3), (hy + s * 0.34, 0.5, z0 - 0.04)], 0.012, galv, segs=4, per_m=4)
        wbox(WL, f'{n}_BracketPlate{s}', (0.07, 0.008, 0.36), hy + s * 0.34, 0.004, z0 - 0.18, galv, bev=0)
    # the flue: up off the top at the back, elbow, out through the wall (a collar where it goes)
    wsweep(WL, n + '_Flue', fillet([(hy - 0.2, 0.32, z1 - 0.02), (hy - 0.2, 0.32, 3.86), (hy - 0.2, -0.05, 3.86)], 0.08, 4), 0.06, flue_m, segs=10, per_m=8)
    wrod(WL, n + '_FlueCollar', (hy - 0.2, -0.01, 3.86), (hy - 0.2, 0.025, 3.86), 0.085, galv, verts=12)
    # the gas: down off the main, an isolating valve with its yellow lever, into the case's back corner
    gy = hy + 0.3
    wsweep(WL, n + '_Gas', fillet([(gy, 0.05, GZ), (gy, 0.05, z1 + 0.12), (gy, 0.2, z1 + 0.02)], 0.06, 4), 0.012, gas_y, segs=6, per_m=10)
    wrod(WL, n + '_GasValve', (gy, 0.05, 4.62), (gy, 0.05, 4.7), 0.02, brass)
    wbox(WL, n + '_GasLever', (0.1, 0.012, 0.01), gy + 0.04, 0.08, 4.66, gas_y, bev=0)
    wrod(WL, n + '_GasTee', (gy, 0.05, GZ - 0.03), (gy, 0.05, GZ + 0.03), 0.026, gas_y)
# the heaters' controller: a box with a dial and two lamps on the left wall by the eye wash
wbox(WL, 'Sv_HeatCtrl', (0.16, 0.06, 0.22), 2.7, 0.03, 1.55, plastic_w, bev=0.008)
wrod(WL, 'Sv_HeatCtrl_Dial', (2.7, 0.06, 1.58), (2.7, 0.08, 1.58), 0.03, blk, verts=12)
for k, (dz, c) in enumerate(((0.07, (0.1, 0.9, 0.2)), (0.07, (0.95, 0.4, 0.05)))):
    rd(f'Sv_HeatCtrl_Lamp{k}', B, WL.P(2.66 + k * 0.08, 0.06, 1.48), WL.P(2.66 + k * 0.08, 0.072, 1.48), 0.009, mat_img(f'Sv_Lamp{k}', None, 0.4, emit=(c, 3.0)), verts=8)
wsweep(WL, 'Sv_HeatCtrl_Feed', fillet([(2.7, 0.022, 1.66), (2.7, 0.022, 3.2), (2.58, 0.022, 3.32)], 0.06, 3), 0.009, plastic_w, segs=4, per_m=6)   # (into the conduit beside it)

# ======================================================================================================================
# fire kit: two fire points (a board, FIRE POINT, an ID sign over each extinguisher, the call point), a CO2 by the
# small door (for the electrics), the alarm's bells; extinguishers hang on hooks with their hoses clipped
def extinguisher(W, name, u, z0, kind):
    body = red_paint if kind != 'co2' else blk
    o = 0.09   # (the body's middle, off the wall)
    wlathe(W, name + '_Body', [(0.0, 0.0), (0.06, 0.0), (0.075, 0.02), (0.077, 0.4), (0.07, 0.45), (0.045, 0.48), (0.02, 0.495)], u, o, z0, body, segs=12)
    wlathe(W, name + '_Neck', [(0.022, 0.0), (0.022, 0.03), (0.016, 0.04)], u, o, z0 + 0.49, brass if kind != 'co2' else galv, segs=8)
    wbox(W, name + '_Head', (0.045, 0.06, 0.05), u, o, z0 + 0.55, blk, bev=0.006)
    wbox(W, name + '_Handle', (0.03, 0.12, 0.014), u, o + 0.03, z0 + 0.585, blk, bev=0.004)
    wbox(W, name + '_Lever', (0.028, 0.12, 0.012), u, o + 0.035, z0 + 0.61, blk, bev=0.004, m=Matrix.Rotation(-0.25, 4, 'X'))
    wbox(W, name + '_Pin', (0.004, 0.035, 0.004), u + 0.02, o + 0.02, z0 + 0.59, (gas_y), bev=0)
    if kind != 'co2':
        wrod(W, name + '_Gauge', (u - 0.03, o + 0.0, z0 + 0.55), (u - 0.045, o + 0.0, z0 + 0.55), 0.016, galv)
        wsweep(W, name + '_Hose', [(u + 0.025, o, z0 + 0.54), (u + 0.08, o + 0.02, z0 + 0.46), (u + 0.085, o + 0.03, z0 + 0.2), (u + 0.08, o + 0.03, z0 + 0.1)], 0.009, rubber_b, segs=5, per_m=10)
        wlathe(W, name + '_Nozzle', [(0.0, 0.0), (0.008, 0.0), (0.013, 0.04)], u + 0.08, o + 0.03, z0 + 0.06, blk, segs=8)
    else:
        wsweep(W, name + '_Hose', [(u + 0.025, o, z0 + 0.54), (u + 0.08, o + 0.03, z0 + 0.48), (u + 0.09, o + 0.04, z0 + 0.36)], 0.011, rubber_b, segs=5, per_m=10)
        wlathe(W, name + '_Horn', [(0.012, 0.0), (0.02, 0.04), (0.045, 0.2), (0.042, 0.2)], u + 0.09, o + 0.04, z0 + 0.16, blk, segs=10, cap1=False)
    wbox(W, name + '_Clip', (0.03, 0.03, 0.02), u + 0.07, o + 0.06, z0 + 0.25, blk, bev=0)
    lab = {'water': 'lab_water', 'co2': 'lab_co2', 'foam': 'lab_foam'}[kind]
    cd(name + '_Label', B, 0.1, 0.05, W.P(u, o + 0.079, z0 + 0.22), amat(lab, 0.06), rotz=W.th)
    # the hook it hangs on: a wall plate, a hook up behind the head
    wbox(W, name + '_HookPlate', (0.06, 0.008, 0.12), u, 0.004, z0 + 0.5, galv, bev=0)
    wbox(W, name + '_Hook', (0.03, 0.02, 0.06), u, 0.015, z0 + 0.52, galv, bev=0)
def call_point(W, name, u, z):
    wbox(W, name, (0.09, 0.05, 0.09), u, 0.025, z, red_paint, bev=0.006)
    cd(name + '_Face', B, 0.07, 0.07, W.P(u, 0.0505, z - 0.035), amat('callpoint', 0.04), rotz=W.th)
def bell(W, name, u, z):
    wrod(W, name + '_Back', (u, 0.0, z), (u, 0.05, z), 0.06, red_paint, verts=12)
    wlathe(W, name + '_Dome', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.02), (0.085, 0.06), (0.04, 0.085), (0.0, 0.09)], u, 0.06, z, red_paint, axis=AX_N, segs=14)
    wrod(W, name + '_Striker', (u, 0.15, z), (u, 0.17, z), 0.012, galv, verts=6)
def fire_point(W, name, u, kinds):
    wbox(W, name + '_Board', (0.62, 0.01, 1.2), u, 0.005, 1.42, plastic_w, bev=0.003)
    wcard(W, name + '_Head', 0.56, 0.14, u, 1.86, 'firepoint', off=0.011, back=0)
    for i, kd in enumerate(kinds):
        du = (i - 0.5) * 0.28
        wcard(W, f'{name}_ID{i}', 0.15, 0.2, u + du, 1.56, {'water': 'id_water', 'co2': 'id_co2', 'foam': 'id_foam'}[kd], off=0.011, back=0)
        extinguisher(W, f'{name}_Ext{i}', u + du, 0.86, kd)
    call_point(W, name + '_Call', u, 2.25)
fire_point(WF, 'Sv_FP_Front', -5.3, ('water', 'co2'))            # (right of the small door, past its chain and controls)
fire_point(WP, 'Sv_FP_Back', -4.43, ('foam', 'co2'))             # (between the dyno door, folded back to x -4.8, and the hatch)
bell(WP, 'Sv_Bell_Back', -8.75, 3.07)
bell(WF, 'Sv_Bell_Front', 10.6, 3.3)

# ======================================================================================================================
# signs: the dyno's door, the fab shop's header, no smoking by the big door, the clock, first aid, eye wash, the notice
# board with the shop's papers
wcard(WP, 'Sv_Sign_Ears', 0.24, 0.3, -6.83, 1.4, 'ears')   # (the door's own TEST CELL sign is the structure's, over it)
wcard(WP, 'Sv_Sign_FabHead', 1.5, 0.28, 3.5, 3.07, 'fabhead', dirt=0.08)
wcard(WP, 'Sv_Sign_Welding', 0.4, 0.2, 5.0, 3.1, 'welding')
wcard(WP, 'Sv_Sign_Eyes', 0.2, 0.25, 1.95, 3.08, 'eyes')
wcard(WF, 'Sv_Sign_NoSmoking', 0.24, 0.3, 10.35, 1.7, 'nosmoking')
# the clock: a case, its face, two hands
wlathe(WP, 'Sv_Clock_Case', [(0.0, 0.0), (0.16, 0.0), (0.165, 0.02), (0.16, 0.045), (0.145, 0.05)], -2.5, 0.0, 3.1, blk, axis=AX_N, segs=20, cap1=False)
cd('Sv_Clock_Face', B, 0.27, 0.27, WP.P(-2.5, 0.04, 3.1 - 0.135), amat('clock', 0.05), rotz=WP.th)
for k, (L, a, wdt) in enumerate(((0.1, 0.9, 0.012), (0.075, -1.9, 0.016))):   # (ten to two-ish)
    wbox(WP, f'Sv_Clock_Hand{k}', (wdt, 0.004, L), -2.5 + math.sin(a) * L / 2, 0.044 + k * 0.003, 3.1 + math.cos(a) * L / 2, blk, bev=0, m=Matrix.Rotation(a, 4, 'Y'))
# first aid: a green box with its cross, on the partition left of the dyno window
FAU = -10.75
wbox(WP, 'Sv_FirstAid', (0.3, 0.12, 0.3), FAU, 0.06, 1.48, green_box, bev=0.012)
cd('Sv_FirstAid_Face', B, 0.27, 0.27, WP.P(FAU, 0.1205, 1.345), amat('firstaid', 0.05), rotz=WP.th)
wbox(WP, 'Sv_FirstAid_Catch', (0.04, 0.015, 0.02), FAU, 0.125, 1.61, plastic_w, bev=0)
# the eye wash station: its board, a little shelf, two bottles of eye wash
wcard(WL, 'Sv_EyeWash', 0.32, 0.4, 0.95, 1.4, 'eyewash')
wbox(WL, 'Sv_EyeWash_Shelf', (0.3, 0.12, 0.015), 0.95, 0.06, 1.245, green_box, bev=0)
wbox(WL, 'Sv_EyeWash_Lip', (0.3, 0.01, 0.04), 0.95, 0.12, 1.265, green_box, bev=0)
for k in range(2):
    wlathe(WL, f'Sv_EyeWash_Bottle{k}', [(0.0, 0.0), (0.035, 0.0), (0.036, 0.13), (0.015, 0.16), (0.012, 0.19), (0.0, 0.19)], 0.89 + k * 0.12, 0.06, 1.2525, plain_mat(f'Sv_EyeWashBottle{k}', (0.85, 0.88, 0.9), dirt=0.03), segs=10)
    wlathe(WL, f'Sv_EyeWash_Cap{k}', [(0.0, 0.0), (0.014, 0.0), (0.014, 0.03), (0.0, 0.03)], 0.89 + k * 0.12, 0.06, 1.44, green_box, segs=8)
# the notice board: a cork board in a wooden frame, the shop's papers pinned at angles
NBU, NBZ, NBW, NBH = 3.7, 1.65, 0.85, 0.75
wbox(WL, 'Sv_Notice_Cork', (NBW, 0.015, NBH), NBU, 0.0075, NBZ, cork, bev=0)
for k, (du, dz, w, h) in enumerate(((0, NBH / 2, NBW + 0.05, 0.03), (0, -NBH / 2, NBW + 0.05, 0.03), (-NBW / 2, 0, 0.03, NBH), (NBW / 2, 0, 0.03, NBH))):
    wbox(WL, f'Sv_Notice_Frame{k}', (w, 0.03, h), NBU + du, 0.015, NBZ + dz, wood_fr, bev=0.004)
for k, (art, du, dz, sp) in enumerate((('n_rules', -0.27, 0.0, 0.03), ('n_rota', -0.08, 0.06, -0.05), ('n_bbq', 0.12, -0.05, 0.06), ('n_cal', 0.3, 0.07, -0.02), ('n_wanted', 0.05, -0.27, 0.1))):
    w, h = 0.16, 0.21
    wcard(WL, f'Sv_Notice_{art}', w, h, NBU + du, NBZ + dz - h / 2, art, off=0.016 + k * 0.0012, back=0, spin=sp, dirt=0.08)
    wrod(WL, f'Sv_Notice_Pin{k}', (NBU + du, 0.015, NBZ + dz + h / 2 - 0.02), (NBU + du, 0.03 + k * 0.0012, NBZ + dz + h / 2 - 0.02), 0.007, red_paint if k % 2 else blue16, verts=6)

# ======================================================================================================================
# the team: a big TeamBand on the back wall's liner over the back row (the game paints the team's name on it), in a
# frame in the team's accent; the sponsors' boards beside it and over the big door
BAND_X, BAND_Z, BAND_W, BAND_H = -3.0, 4.6, 8.0, 2.0
band = cd('TeamBand_Workshop', B, BAND_W, BAND_H, WB.P(BAND_X, 0.05, BAND_Z), plain_mat('Sv_TeamBand', (0.92, 0.92, 0.92), dirt=0.0), rotz=WB.th)
wbox(WB, 'Sv_Band_Back', (BAND_W, 0.03, BAND_H), BAND_X, 0.03, BAND_Z + BAND_H / 2, galv, bev=0)
for k, (du, dz, w, h) in enumerate(((0, BAND_H + 0.05, BAND_W + 0.2, 0.1), (0, -0.05, BAND_W + 0.2, 0.1), (-BAND_W / 2 - 0.05, BAND_H / 2, 0.1, BAND_H), (BAND_W / 2 + 0.05, BAND_H / 2, 0.1, BAND_H))):
    wbox(WB, f'Sv_Band_Frame{k}', (w, 0.07, h), BAND_X + du, 0.04, BAND_Z + dz, accent, bev=0.01)
for k, du in enumerate((-3.0, -1.0, 1.0, 3.0)):   # (the brackets it's bolted to the wall with, showing below)
    wbox(WB, f'Sv_Band_Bracket{k}', (0.06, 0.08, 0.12), BAND_X + du, 0.04, BAND_Z - 0.14, galv, bev=0)
def sponsor_board(W, name, art, u, z, w, h):
    wcard(W, name, w, h, u, z, art, off=0.022, back=0, dirt=0.06)
    wbox(W, name + '_Back', (w, 0.02, h), u, 0.01, z + h / 2, plastic_w, bev=0)
    for k, (du, dz, ww, hh) in enumerate(((0, h, w + 0.06, 0.03), (0, 0, w + 0.06, 0.03), (-w / 2, h / 2, 0.03, h), (w / 2, h / 2, 0.03, h))):
        wbox(W, f'{name}_Edge{k}', (ww, 0.03, hh), u + du, 0.015, z + dz, alu_fr, bev=0)
sponsor_board(WB, 'Sv_Spons_BackL', 'spons_c', -9.6, 4.9, 3.0, 1.0)
sponsor_board(WB, 'Sv_Spons_BackR', 'spons_d', 3.6, 4.9, 3.0, 1.0)
sponsor_board(WF, 'Sv_Spons_DoorL', 'spons_a', 7.45, 5.15, 3.2, 0.8)
sponsor_board(WF, 'Sv_Spons_DoorR', 'spons_b', 4.05, 5.15, 3.2, 0.8)

print('services: built', sum(1 for o in B.objects if o.name.startswith(('Sv_', 'TeamBand'))), 'objects')
