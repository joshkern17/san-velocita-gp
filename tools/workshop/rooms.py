# tools/workshop/rooms.py: run inside tools/garage-workshop.py (exec'd with its globals: the plan's numbers, B, dress,
# lights, hooks, garagelib's helpers). See that script's header for the layout.
# The rooms' furnishing: the mess, reception, the parts store, your office, the engineering office and sim room.
# Built the garage-station way: each thing from its real parts, standing or hung the way it would be, backs on
# anything with a face, light grime on painted and laminate things. Printed bits (magazines, the rota, the planner,
# the bin labels, the TV pictures) are drawn by the system Python with Pillow into <GEN>/rm_art (ws_rm_*.png).
import subprocess
R_ = np.random.default_rng(1404)
RM = dress

# ---------------------------------------------------------------------------------------------------------------------
# printed art (system python3 + Pillow)
ART = os.path.join(GEN, 'rm_art'); os.makedirs(ART, exist_ok=True)
ART_PY = r'''
import os, sys, math, random
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1]; F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s); BOLD = lambda s: font('Arial Bold.ttf', s); ARIAL = lambda s: font('Arial.ttf', s)
HAND = lambda s: font('Noteworthy.ttc', s, 1); MARK = lambda s: font('MarkerFelt.ttc', s, 1); MONO = lambda s: font('Monaco.ttf', s)
R = random.Random(14)
def save(im, n): im.save(os.path.join(OUT, 'ws_rm_' + n + '.png'))
def fit(d, text, f, w):
    while d.textbbox((0, 0), text, font=f)[2] > w and f.size > 6: f = font(os.path.basename(f.path), f.size - 1, getattr(f, 'index', 0))
    return f
def ctext(d, y, text, f, fill, W):
    b = d.textbbox((0, 0), text, font=f); d.text(((W - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)
# magazines: three covers
for k, (title, col, bg, lines) in enumerate((('GRID WEEKLY', (230, 30, 30), (240, 236, 228), ('SPA: THE VERDICT', 'WHO GOES GT1?', 'TESTED: 6 PAD COMPOUNDS')),
                                             ('PIT TALK', (250, 200, 20), (25, 30, 45), ('BUDGET RACING', 'IS IT EVEN POSSIBLE?', 'FREE WALLCHART')),
                                             ('TORQUE', (40, 120, 230), (235, 235, 235), ('ENGINE BUILDS', 'THAT LASTED', '(BOTH OF THEM)')))):
    W, H = 120, 160; im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 30), fill=col); ctext(d, 3, title, fit(d, title, BLACK(20), W - 8), (255, 255, 255) if k != 1 else (20, 20, 20), W)
    # a car on the cover: a low wedge with wheels, on a streak of track
    d.polygon([(14, 104), (30, 86), (70, 80), (104, 94), (108, 106)], fill=(R.randint(60, 220), R.randint(20, 80), R.randint(20, 200)))
    for x in (34, 90): d.ellipse((x - 9, 98, x + 9, 116), fill=(20, 20, 20))
    d.rectangle((0, 116, W, 120), fill=(90, 90, 95))
    tc = (20, 20, 20) if k != 1 else (240, 240, 240)
    for i, t in enumerate(lines): d.text((6, 36 + i * 14), t, font=fit(d, t, BOLD(11), W - 12), fill=tc)
    d.rectangle((W - 30, H - 22, W - 4, H - 6), fill=(255, 255, 255)); d.text((W - 28, H - 20), '3.99', font=BOLD(9), fill=(0, 0, 0))
    save(im, f'mag{k}')
# the tea rota, the milk note, the season's calendar, a postcard, a typed notice
im = Image.new('RGB', (192, 256), (246, 244, 236)); d = ImageDraw.Draw(im)
ctext(d, 6, 'TEA ROTA', BLACK(26), (20, 20, 20), 192)
for i, (day, who) in enumerate((('MON', 'Danny'), ('TUE', 'Kev'), ('WED', 'Mick'), ('THU', 'Sue'), ('FRI', 'whoever lost'))):
    y = 50 + i * 38; d.line((10, y + 30, 182, y + 30), fill=(150, 150, 160)); d.text((12, y), day, font=BOLD(16), fill=(30, 30, 30))
    d.text((70, y - 4), who, font=HAND(22), fill=(30, 40, 150))
save(im, 'rota')
im = Image.new('RGB', (128, 96), (250, 238, 120)); d = ImageDraw.Draw(im)
for i, t in enumerate(('WHOEVER KEEPS', 'NICKING MY MILK', 'I KNOW.', '   - S')): d.text((6, 4 + i * 22), t, font=MARK(16), fill=(30, 30, 30))
save(im, 'milk')
im = Image.new('RGB', (192, 256), (250, 250, 250)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 192, 30), fill=(20, 40, 110)); ctext(d, 5, 'THIS SEASON', BLACK(18), (255, 255, 255), 192)
for i, (r, t) in enumerate((('1', 'Laguna Seca'), ('2', 'Road Atlanta'), ('3', 'Lime Rock'), ('4', 'Watkins Glen'), ('5', 'Summit Point'), ('6', 'Thunderhill'), ('7', 'Spa'), ('8', 'Suzuka'))):
    y = 38 + i * 27; d.text((10, y), 'RD ' + r, font=BOLD(13), fill=(20, 20, 20)); d.text((60, y), t, font=ARIAL(13), fill=(40, 40, 40))
    if i < 3: d.line((58, y + 8, 180, y + 8), fill=(200, 30, 30), width=2)
save(im, 'calendar')
im = Image.new('RGB', (128, 88), (120, 170, 220)); d = ImageDraw.Draw(im)
d.rectangle((0, 50, 128, 88), fill=(60, 130, 60)); d.polygon([(0, 70), (60, 52), (128, 64), (128, 74), (0, 80)], fill=(70, 70, 75))
d.text((6, 6), 'GREETINGS', font=BLACK(14), fill=(255, 240, 80)); d.text((6, 24), 'FROM SPA', font=BLACK(14), fill=(255, 255, 255))
save(im, 'postcard')
im = Image.new('RGB', (128, 176), (248, 248, 246)); d = ImageDraw.Draw(im)
d.text((8, 6), 'HOUSEKEEPING', font=BOLD(13), fill=(0, 0, 0))
for i, t in enumerate(('1. Wash your mug.', '2. Wash YOUR mug.', '3. The fridge is', '   cleared Fridays.', '4. Nothing lives', '   in the microwave.', '', '   Thank you.', '   - Management')):
    d.text((8, 28 + i * 15), t, font=ARIAL(11), fill=(30, 30, 30))
save(im, 'house')
# the season planner (your office's whiteboard): the months across, the race weekends and tests marked in marker
W, H = 512, 256; im = Image.new('RGB', (W, H), (245, 247, 248)); d = ImageDraw.Draw(im)
months = ('MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT'); cw = (W - 40) / len(months)
d.text((10, 6), 'SEASON PLAN', font=MARK(22), fill=(20, 30, 120))
for i, m in enumerate(months):
    x = 30 + i * cw; d.line((x, 40, x, H - 10), fill=(170, 175, 185), width=1); d.text((x + 8, 42), m, font=BOLD(16), fill=(40, 40, 40))
for row in range(4): d.line((30, 70 + row * 44, W - 10, 70 + row * 44), fill=(200, 205, 210))
marks = [(0, 1, 'TEST', (30, 120, 40)), (1, 0, 'RD1', (200, 30, 30)), (1, 2, 'DYNO', (30, 30, 160)), (2, 0, 'RD2', (200, 30, 30)), (2, 3, 'SPONSOR DAY', (120, 30, 140)),
         (3, 0, 'RD3', (200, 30, 30)), (3, 1, 'NEW ENGINE?', (30, 30, 160)), (4, 0, 'RD4', (200, 30, 30)), (5, 0, 'RD5', (200, 30, 30)), (5, 2, 'HOLIDAY (HA)', (30, 120, 40)),
         (6, 0, 'RD6+7', (200, 30, 30)), (7, 0, 'RD8', (200, 30, 30)), (7, 1, 'PRIZE GIVING', (30, 30, 160))]
for m, row, t, c in marks:
    x = 30 + m * cw + 6; y = 76 + row * 44; f = fit(d, t, MARK(17), cw - 10); d.text((x, y), t, font=f, fill=c)
d.ellipse((30 + 3 * cw + 2, 74 + 1 * 44 - 4, 30 + 4 * cw - 4, 74 + 1 * 44 + 28), outline=(200, 30, 30), width=2)
save(im, 'planner')
# bin labels
for k, t in enumerate(('M6 NUTS', 'M8 BOLTS', 'STUDS', 'CABLE TIES', 'FUSES', 'PADS', 'PLUGS', 'O-RINGS', 'CIRCLIPS', 'WASHERS', 'JUBILEE', 'P-CLIPS')):
    im = Image.new('RGB', (64, 24), (250, 250, 245)); d = ImageDraw.Draw(im); ctext(d, 4, t, fit(d, t, BOLD(12), 60), (10, 10, 10), 64); save(im, f'bin{k}')
# the stores sign
im = Image.new('RGB', (192, 128), (250, 250, 250)); d = ImageDraw.Draw(im); d.rectangle((0, 0, 192, 36), fill=(20, 40, 110))
ctext(d, 5, 'STORES', BLACK(24), (255, 255, 255), 192)
for i, t in enumerate(('EVERYTHING SIGNED OUT.', 'EVERYTHING.', 'YES, EVEN THAT.')): ctext(d, 46 + i * 24, t, fit(d, t, BOLD(15), 180), (20, 20, 20), 192)
save(im, 'stores')
# the TVs: the mess's (a race on, the tower down the side) and the sim room's (the sim's onboard view)
W, H = 160, 120; im = Image.new('RGB', (W, H), (110, 160, 210)); d = ImageDraw.Draw(im)
d.rectangle((0, 60, W, H), fill=(70, 130, 60)); d.polygon([(40, H), (78, 60), (98, 60), (150, H)], fill=(70, 70, 76))
d.polygon([(84, 92), (96, 84), (112, 90), (106, 100), (88, 100)], fill=(220, 30, 30)); d.polygon([(70, 74), (78, 70), (86, 74), (82, 78), (72, 78)], fill=(240, 240, 240))
d.rectangle((4, 4, 46, 84), fill=(15, 15, 25))
for i in range(8): d.text((7, 7 + i * 9), f'{i + 1} {"KOB TRI RAP GLD SVR AXL MON NOX".split()[i]}', font=MONO(7), fill=(240, 240, 240))
d.rectangle((W - 32, 4, W - 4, 16), fill=(220, 30, 30)); d.text((W - 29, 5), 'LIVE', font=BOLD(9), fill=(255, 255, 255))
save(im, 'tv_mess')
W, H = 160, 120; im = Image.new('RGB', (W, H), (130, 170, 210)); d = ImageDraw.Draw(im)
d.rectangle((0, 58, W, H), fill=(80, 120, 60)); d.polygon([(10, H), (74, 58), (86, 58), (150, H)], fill=(80, 80, 86))
d.polygon([(0, H), (0, 92), (40, 84), (120, 84), (160, 92), (160, H)], fill=(25, 25, 30)); d.ellipse((58, 90, 102, 134), outline=(60, 60, 66), width=6)
d.text((64, 98), '142', font=BOLD(12), fill=(250, 200, 30)); d.rectangle((4, 4, 50, 16), fill=(15, 15, 25)); d.text((6, 5), 'LAP 7  1:52.3', font=MONO(7), fill=(240, 240, 240))
save(im, 'tv_sim')
# the newspaper, the pizza box's lid, the track map
im = Image.new('RGB', (128, 168), (232, 228, 214)); d = ImageDraw.Draw(im)
ctext(d, 4, 'MOTOR NEWS', BLACK(16), (20, 20, 20), 128); d.line((4, 26, 124, 26), fill=(20, 20, 20), width=2)
d.text((6, 30), 'LOCAL TEAM', font=BOLD(13), fill=(20, 20, 20)); d.text((6, 46), 'SURPRISES', font=BOLD(13), fill=(20, 20, 20))
d.rectangle((6, 66, 70, 110), fill=(120, 120, 120))
for i in range(12): d.line((76, 68 + i * 8, 122, 68 + i * 8), fill=(110, 110, 110))
for i in range(6): d.line((6, 118 + i * 8, 122, 118 + i * 8), fill=(110, 110, 110))
save(im, 'paper')
im = Image.new('RGB', (128, 128), (238, 230, 214)); d = ImageDraw.Draw(im)
d.ellipse((14, 14, 114, 114), outline=(200, 30, 30), width=5); ctext(d, 40, "LUIGI'S", BLACK(20), (200, 30, 30), 128); ctext(d, 68, 'PIZZA', BOLD(14), (30, 120, 40), 128)
save(im, 'pizza')
im = Image.new('RGB', (256, 160), (248, 248, 246)); d = ImageDraw.Draw(im)
d.text((8, 6), 'SPA-FRANCORCHAMPS  7.004 km', font=BOLD(12), fill=(20, 20, 20))
pts = [(40, 120), (60, 128), (120, 126), (200, 110), (230, 80), (214, 56), (170, 50), (150, 34), (110, 36), (80, 60), (70, 88), (44, 100)]
d.line(pts + [pts[0]], fill=(30, 30, 30), width=5); d.line(pts + [pts[0]], fill=(200, 30, 30), width=1)
for i, p in enumerate(pts[::2]): d.text((p[0] + 4, p[1] - 12), str(i + 1), font=BOLD(10), fill=(20, 40, 120))
save(im, 'trackmap')
# the plant's leaves (a yucca: long spiky leaves out of the middle), cut out
W, H = 128, 160; im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
for k in range(16):
    a = -math.pi / 2 + (k - 7.5) / 7.5 * 1.15 + R.uniform(-0.12, 0.12); L = R.uniform(70, 150)
    x0, y0 = W / 2 + R.uniform(-4, 4), H - 4; x1, y1 = x0 + math.cos(a) * L * 0.55, y0 + math.sin(a) * L
    nx, ny = -math.sin(a) * 4, math.cos(a) * 4 * 0.3
    g = R.randint(90, 150); d.polygon([(x0 - 4, y0), (x0 + 4, y0), (x1 + nx * 0.2, y1)], fill=(40, g, 50, 255))
    d.line((x0, y0, x1, y1), fill=(70, g + 40, 70, 255), width=1)
save(im, 'yucca')
'''
if not os.path.exists(os.path.join(ART, 'ws_rm_yucca.png')):
    subprocess.run(['python3', '-', ART], input=ART_PY, text=True, check=True)
A_ = lambda n: os.path.join(ART, 'ws_rm_' + n + '.png')

# ---------------------------------------------------------------------------------------------------------------------
# materials
def tex(name, col, rough=0.8): return mat_img(name, save(name, col), rough)
def fleck(n, base, amt=0.06, cells=(16, 4)):   # (a colour with a soft mottle and a fine fleck)
    c = np.ones((n, n, 3), np.float32) * np.array(base, np.float32)
    return c * (1 + (fbm(n, n, cells, wrap=True) - 0.5)[..., None] * amt * 2 + (R_.random((n, n, 1)) - 0.5) * amt)
carcass = plain_mat('Rm_Carcass', (0.9, 0.9, 0.88), dirt=0.06)
doorf = plain_mat('Rm_KitchenDoor', (0.82, 0.84, 0.86), dirt=0.08)
worktop = tex('Rm_Worktop', fleck(64, (0.62, 0.6, 0.56), 0.08), 0.5)
steelk = grimy_tile('Rm_Steel', 'galvanized_metal.png', dirt=0.08)
chrome = plain_mat('Rm_Chrome', (0.72, 0.74, 0.76), dirt=0.04, rough=0.3)
blackp = plain_mat('Rm_BlackPlastic', (0.06, 0.06, 0.07), dirt=0.05, rough=0.5)
greyp = plain_mat('Rm_GreyPlastic', (0.42, 0.44, 0.46), dirt=0.06)
beige = plain_mat('Rm_Beige', (0.78, 0.76, 0.7), dirt=0.08)
white = plain_mat('Rm_White', (0.92, 0.92, 0.9), dirt=0.05)
t_ = np.ones((64, 64, 3), np.float32) * 0.93; t_[::16, :] = 0.7; t_[:, ::16] = 0.7   # (the splashback: 15 cm tiles, grout lines)
tiles = tex('Rm_Tiles', grime(t_, (fbm(64, 64, (16, 4), wrap=True) - 0.5) * 0.08), 0.3)
wood = np.ones((64, 64, 3), np.float32) * np.array([0.5, 0.34, 0.2], np.float32)
wood *= (1 + 0.12 * np.sin(np.arange(64)[None, :] * 0.9 + fbm(64, 64, (32, 8), wrap=True) * 6))[..., None]
woodm = tex('Rm_Wood', wood, 0.7)
cork = tex('Rm_Cork', fleck(64, (0.62, 0.45, 0.28), 0.25, (8, 2)), 0.9)
poly = plain_mat('Rm_ChairShell', (0.24, 0.33, 0.46), dirt=0.06, rough=0.5)
rubber = grimy_tile('Rm_Rubber', 'rubber.png', dirt=0.12)
rack_blue = plain_mat('Rm_RackBlue', (0.12, 0.24, 0.52), dirt=0.1)
rack_orange = plain_mat('Rm_RackOrange', (0.86, 0.42, 0.08), dirt=0.12)
chip = tex('Rm_Chipboard', fleck(64, (0.66, 0.54, 0.36), 0.18, (8, 2)), 0.9)
bin_blue = plain_mat('Rm_BinBlue', (0.14, 0.3, 0.62), dirt=0.08)
bin_yel = plain_mat('Rm_BinYellow', (0.86, 0.66, 0.1), dirt=0.08)
cw_ = np.zeros((64, 64, 3), np.float32); yy_, xx_ = np.mgrid[0:64, 0:64]
cw_[:] = np.where(((xx_ // 4 + yy_ // 4) % 2)[..., None] == 0, 0.09, 0.14)                  # (carbon weave)
carbon = tex('Rm_Carbon', cw_, 0.35)
TM_ = plain_mat('TeamMain_RmPaint', (0.9, 0.9, 0.9), dirt=0.06)
TA_ = plain_mat('TeamAccent_RmPaint', (0.9, 0.9, 0.9), dirt=0.06)
c_ = fleck(64, (0.2, 0.22, 0.27), 0.12, (8, 2)); c_[0, :] *= 0.7; c_[:, 0] *= 0.7               # (carpet tiles: 50 cm, a seam each)
carpet = tex('Rm_Carpet', c_, 0.95)
c2_ = fleck(64, (0.12, 0.12, 0.14), 0.1, (8, 2)); c2_[0, :] *= 0.7; c2_[:, 0] *= 0.7
carpet_sim = tex('Rm_CarpetSim', c2_, 0.95)
f_ = np.zeros((64, 64, 3), np.float32); u_ = (xx_ % 16) / 16.0; v_ = (yy_ % 16) / 16.0         # (acoustic foam: wedges)
f_[:] = (0.1 + 0.08 * (1 - np.abs(np.where((xx_ // 16 + yy_ // 16) % 2, u_, v_) - 0.5) * 2))[..., None]
foam = tex('Rm_Foam', f_, 0.95)
rg = np.ones((96, 128, 3), np.float32) * np.array([0.46, 0.1, 0.1], np.float32)               # (your office's rug: a border, a medallion)
yy2, xx2 = np.mgrid[0:96, 0:128]; edge2 = np.minimum.reduce([xx2, 127 - xx2, yy2, 95 - yy2])
rg[(edge2 > 4) & (edge2 < 12)] = (0.1, 0.14, 0.32); rg[(edge2 > 6) & (edge2 < 8)] = (0.75, 0.62, 0.3)
md = np.hypot((xx2 - 64) / 1.3, yy2 - 48); rg[(md > 16) & (md < 22)] = (0.1, 0.14, 0.32); rg[md < 8] = (0.75, 0.62, 0.3)
rug = tex('Rm_Rug', grime(rg, (fbm(96, 128, (32, 8)) - 0.5) * 0.15), 0.95)
slat = np.ones((64, 64, 3), np.float32) * 0.86; slat[(yy_ % 4) == 3] = 0.6                    # (venetian slats: 25 mm, a shadow line)
slats = tex('Rm_Blind', slat, 0.6)

def art(name, png, dirt=0.15, emit=None): return art_mat(name, A_(png), dirt=dirt, emit=emit)
def props(o, **k):
    for a, v in k.items(): o[a] = v
    return o

# pack props (their own textures)
U_ = lambda f: os.path.join(SRC, 'unit', f); S_ = lambda f: os.path.join(SRC, 'stations', f)
IND_ = os.path.join(SRC, 'psx_industrial_pack.glb')
lib('rm_fridge', os.path.join(SRC, 'psx_style_fridge.glb'), height=1.75); lib('rm_micro', os.path.join(SRC, 'microwave_psx.glb'), height=0.3)
lib('rm_mug', U_('mug.glb'), height=0.1); lib('rm_mug2', S_('mug_alt.glb'), height=0.1); lib('rm_cooler', U_('water_cooler.glb'), height=1.15)
lib('rm_couch', U_('couch_red.glb'), scale=0.72); lib('rm_armchair', U_('armchair_pattern.glb'), scale=0.72)
lib('rm_chair_conf', U_('conference_chair_grey.glb'), scale=0.95); lib('rm_chair_g', S_('office_chair_grey.glb'), height=0.95)
lib('rm_cab_tall', S_('file_cabinet_small.glb'), height=1.3); lib('rm_cab_low', S_('file_cabinet_larger.glb'), scale=0.72)
lib('rm_bookcase', S_('book_case_with_back_Small.glb'), height=1.9); lib('rm_binder', S_('file_binder.glb'), scale=0.8); lib('rm_binder2', S_('file_binder_alt.glb'), scale=0.8)
lib('rm_papers', S_('paper_stack_large.glb'), scale=0.7); lib('rm_phone', S_('desk_phone_with_cable.glb'), scale=0.55)
lib('rm_cbox1', U_('psx_storage_shelves__cardboard_boxs.glb'), 'Cardboard_box_01'); lib('rm_cbox2', U_('psx_storage_shelves__cardboard_boxs.glb'), 'Cardboard_box_02')
lib('rm_cbox4', U_('psx_storage_shelves__cardboard_boxs.glb'), 'Cardboard_box_04'); lib('rm_coffee_cup', S_('trash_and_debris/scene.gltf'), 'Coffee_Cup_WithLid', height=0.13)
lib('rm_can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12)
def size_of(key):
    vs = [v.co for v in LIB[key].data.vertices]
    return Vector((max(v.x for v in vs) - min(v.x for v in vs), max(v.y for v in vs) - min(v.y for v in vs), max(v.z for v in vs)))

# small built things used in more than one room ------------------------------------------------------------------------
def tire(name, loc, rot, w=0.24, r=0.31, ri=0.2, segs=12):
    # a tire: tread, rounded shoulders, the sidewall down to the bead (open in the middle)
    hw = w / 2
    prof = [(ri, -hw + 0.02), (ri + 0.02, -hw), (r - 0.03, -hw), (r, -hw + 0.03), (r, hw - 0.03), (r - 0.03, hw), (ri + 0.02, hw), (ri, hw - 0.02)]
    return lathe(name, RM, prof, loc, rubber, segs=segs, rot=rot, cap0=False, cap1=False)
def wheel(name, loc, rot, w=0.24):
    # a tire on a rim: the rim's barrel and dished face with five spokes, the centre-lock nut
    tire(name + '_Tire', loc, rot, w)
    M = Euler(rot).to_matrix()
    lathe(name + '_Barrel', RM, [(0.2, -w / 2 + 0.01), (0.2, w / 2 - 0.01)], loc, chrome, segs=12, rot=rot, cap0=False, cap1=False)
    lathe(name + '_Face', RM, [(0.0, w / 2 - 0.06), (0.05, w / 2 - 0.06), (0.06, w / 2 - 0.04), (0.19, w / 2 - 0.02), (0.2, w / 2 - 0.01)], loc, greyp, segs=12, rot=rot, cap0=True, cap1=False)
    for k in range(5):
        a = k * math.tau / 5; d = M @ Vector((math.cos(a) * 0.11, math.sin(a) * 0.11, w / 2 - 0.035))
        o = bbox(f'{name}_Spoke{k}', RM, (0.16, 0.035, 0.03), Vector(loc) + d, greyp, bev=0.005)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = M.to_quaternion() @ Quaternion((0, 0, 1), a)
    cy(name + '_Nut', RM, 0.04, 0.05, Vector(loc) + M @ Vector((0, 0, w / 2 - 0.02)), chrome, rot=rot, verts=6)
from mathutils import Euler, Quaternion

def stack_chair(name, x, y, face, pulled=0.0):
    # a polypropylene stacking chair: the shell seat and back on a tube frame, the seat 0.46 up. face: the way you sit
    M = Matrix.Rotation(face, 4, 'Z'); P = lambda a, b, c: Vector((x, y, 0)) + M @ Vector((a, b, c))
    o0 = len(BUILT)
    for sx in (-1, 1):
        for sy in (-1, 1):
            rd(f'{name}_Leg{sx}{sy}', RM, P(sx * 0.2, sy * 0.19, 0.0), P(sx * 0.18, sy * 0.17, 0.44), 0.011, chrome, verts=5)
        rd(f'{name}_Post{sx}', RM, P(sx * 0.18, 0.17, 0.44), P(sx * 0.19, 0.24, 0.86), 0.011, chrome, verts=5)
        rd(f'{name}_Runner{sx}', RM, P(sx * 0.2, -0.19, 0.01), P(sx * 0.2, 0.19, 0.01), 0.01, chrome, verts=5)
    bbox(f'{name}_Seat', RM, (0.42, 0.42, 0.025), P(0, 0, 0.455), poly, rot=(-0.04, 0, face), bev=0.01)
    bbox(f'{name}_Back', RM, (0.42, 0.025, 0.28), P(0, 0.225, 0.72), poly, rot=(-0.18, 0, face), bev=0.01)
    return P(0, 0, 0.46)

def hanging_jacket(name, loc, rotz, mat=None):
    # a team jacket on a hook: the body hanging from the collar, the sleeves down its sides, the accent stripe
    M = Matrix.Rotation(rotz, 4, 'Z'); P = lambda a, b, c: Vector(loc) + M @ Vector((a, b, c))
    # (a lathe flattened front to back: narrow at the collar, round over the shoulders, straight down to the hem)
    o = lathe(f'{name}_Body', RM, [(0.0, 0.0), (0.06, 0.0), (0.2, -0.06), (0.23, -0.14), (0.22, -0.4), (0.21, -0.68), (0.0, -0.69)], P(0, -0.07, -0.02), mat or TM_, segs=10)
    o.scale = (1.0, 0.28, 1.0); o.rotation_euler = (0.05, 0, rotz)
    for s in (-1, 1):
        sweep(f'{name}_Sleeve{s}', RM, [P(s * 0.2, -0.07, -0.1), P(s * 0.25, -0.07, -0.3), P(s * 0.24, -0.06, -0.58)], 0.045, mat or TM_, segs=6, per_m=10)
        lathe(f'{name}_Cuff{s}', RM, [(0.046, 0.0), (0.046, 0.04)], P(s * 0.24, -0.06, -0.62), TA_, segs=6, cap0=False, cap1=False)
    o = lathe(f'{name}_Stripe', RM, [(0.225, 0.0), (0.225, 0.05)], P(0, -0.07, -0.34), TA_, segs=10, cap0=False, cap1=False); o.scale = (1.0, 0.3, 1.0); o.rotation_euler.z = rotz
    rd(f'{name}_Zip', RM, P(0, -0.135, -0.08), P(0, -0.13, -0.68), 0.006, blackp, verts=4)

def crt_tv(name, loc, rotz, png, w=0.5):
    # a silver 2000s CRT telly: the front with its bezel, the screen a touch in from it (glowing: it's on), the deep
    # back tapering to the vents, the buttons under the screen, little feet. Faces down its own -Y, turned rotz
    h = w * 0.82; M = Matrix.Rotation(rotz, 4, 'Z'); P = lambda a, b, c: Vector(loc) + M @ Vector((a, b, c)); r = (0, 0, rotz)
    silver = plain_mat('Rm_TVSilver', (0.62, 0.64, 0.66), dirt=0.05, rough=0.4) if 'Rm_TVSilver' not in bpy.data.materials else bpy.data.materials['Rm_TVSilver']
    for sx in (-1, 1):
        for sy in (-1, 1): bx(f'{name}_Foot{sx}{sy}', RM, (0.05, 0.05, 0.015), P(sx * w * 0.38, sy * 0.12 + 0.05, 0.0075), blackp, rot=r)
    bbox(f'{name}_Front', RM, (w, 0.1, h), P(0, -0.12, 0.015 + h / 2), silver, rot=r, bev=0.015)
    bbox(f'{name}_Back', RM, (w * 0.72, 0.26, h * 0.76), P(0, 0.06, 0.015 + h * 0.44), plain_mat(name + '_BackMat', (0.24, 0.25, 0.27), dirt=0.08), rot=r, bev=0.03)
    bbox(f'{name}_Bezel', RM, (w * 0.86, 0.01, h * 0.74), P(0, -0.172, 0.015 + h * 0.56), blackp, rot=r, bev=0.004)
    cd(f'{name}_Screen', RM, w * 0.8, h * 0.66, P(0, -0.178, 0.015 + h * 0.23), art(name + '_Picture', png, 0.02, emit=1.3), rotz=rotz)
    for k in range(4): bx(f'{name}_Button{k}', RM, (0.022, 0.01, 0.012), P(-w * 0.3 + k * 0.035, -0.172, 0.015 + h * 0.11), blackp, rot=r)
    cy(f'{name}_Power', RM, 0.01, 0.01, P(w * 0.36, -0.172, 0.015 + h * 0.11), plain_mat('Rm_LED', (0.1, 0.9, 0.2), dirt=0.0), rot=(D90, 0, rotz), verts=6)

def plant(name, x, y, h=1.3):
    lathe(f'{name}_Pot', RM, [(0.0, 0.0), (0.16, 0.0), (0.2, 0.36), (0.21, 0.38), (0.19, 0.38)], (x, y, 0), plain_mat(f'{name}_PotMat', (0.3, 0.31, 0.33), dirt=0.08), segs=10, cap1=False)
    cy(f'{name}_Soil', RM, 0.185, 0.01, (x, y, 0.36), plain_mat(f'{name}_SoilMat', (0.16, 0.11, 0.07), dirt=0.2), verts=10)
    rd(f'{name}_Trunk', RM, (x, y, 0.36), (x + 0.02, y, 0.36 + h * 0.35), 0.03, woodm, verts=6)
    lv = art_cutout(f'{name}_Leaves', A_('yucca'))
    for k in range(3): cd(f'{name}_Leaf{k}', RM, 0.62, h * 0.72, (x, y, 0.36 + h * 0.2), lv, rotz=k * math.pi / 3)

def stand(name, loc, rotz, clip, role='any'):
    return empty(name, hooks, loc, rotz=rotz, kind='SINGLE_ARROW', size=0.5, clip=clip, role=role)

# =====================================================================================================================
# THE MESS (under the mezzanine, x 6..12, y -2..4.5): kitchen run along the right wall, the table, the TV
KY0, KY1, KD = -0.9, 2.7, 0.6       # (the run: along the wall from y KY0 to KY1, KD deep, its back on x 12)
KX = X1 - KD; TOP = 0.9
n_units = 6; uw = (KY1 - KY0) / n_units
bx('Rm_Kitchen_Plinth', RM, (KD - 0.06, KY1 - KY0, 0.1), (X1 - KD / 2 + 0.03, (KY0 + KY1) / 2, 0.05), blackp)
bbox('Rm_Kitchen_Carcass', RM, (KD - 0.02, KY1 - KY0, 0.62), (X1 - KD / 2 + 0.01, (KY0 + KY1) / 2, 0.1 + 0.31), carcass, bev=0.004)   # (low enough for the sink's bowl)
for k in range(n_units):
    y = KY0 + uw * (k + 0.5)
    if k == 2:   # (the sink unit: two doors)
        for s in (-1, 1): bbox(f'Rm_Kitchen_Door{k}{s}', RM, (0.018, uw / 2 - 0.006, 0.7), (KX - 0.012, y + s * uw / 4, 0.48), doorf, bev=0.003)
        for s in (-1, 1): rd(f'Rm_Kitchen_Handle{k}{s}', RM, (KX - 0.04, y + s * 0.04, 0.68), (KX - 0.04, y + s * 0.04, 0.78), 0.007, chrome, verts=5)
    elif k in (0, 5):   # (drawer stacks)
        for j, (z0, h) in enumerate(((0.12, 0.3), (0.43, 0.22), (0.66, 0.16))):
            bbox(f'Rm_Kitchen_Drawer{k}{j}', RM, (0.018, uw - 0.008, h - 0.008), (KX - 0.012, y, z0 + h / 2), doorf, bev=0.003)
            rd(f'Rm_Kitchen_DHandle{k}{j}', RM, (KX - 0.04, y - 0.12, z0 + h - 0.05), (KX - 0.04, y + 0.12, z0 + h - 0.05), 0.007, chrome, verts=5)
    else:
        bbox(f'Rm_Kitchen_Door{k}', RM, (0.018, uw - 0.008, 0.7), (KX - 0.012, y, 0.48), doorf, bev=0.003)
        rd(f'Rm_Kitchen_Handle{k}', RM, (KX - 0.04, y + uw / 2 - 0.06, 0.68), (KX - 0.04, y + uw / 2 - 0.06, 0.78), 0.007, chrome, verts=5)
SY = KY0 + uw * 2.5
def worktop_piece(n, ya, yb, xa=KX - 0.03, xb=X1): bbox(f'Rm_Kitchen_Worktop{n}', RM, (xb - xa, yb - ya, 0.04), ((xa + xb) / 2, (ya + yb) / 2, TOP - 0.02), worktop, bev=0.004)
worktop_piece('A', KY0 - 0.01, SY - 0.35); worktop_piece('C', SY + 0.04, KY1 + 0.01); worktop_piece('Lip', SY - 0.35, SY + 0.04, xb=KX + 0.11)   # (round the sink's bowl)
# the sink: a stainless top with a bowl let into it, a ribbed drainer, the mixer tap
bx('Rm_Sink_RimF', RM, (0.06, 0.9, 0.012), (KX + 0.08, SY + 0.1, TOP + 0.006), steelk)
bx('Rm_Sink_RimB', RM, (0.14, 0.9, 0.012), (X1 - 0.09, SY + 0.1, TOP + 0.006), steelk)
bx('Rm_Sink_RimL', RM, (0.36, 0.06, 0.012), (KX + 0.29, SY - 0.32, TOP + 0.006), steelk)
bx('Rm_Sink_Drainer', RM, (0.36, 0.42, 0.012), (KX + 0.29, SY + 0.34, TOP + 0.006), steelk)
for i in range(7): bx(f'Rm_Sink_Rib{i}', RM, (0.3, 0.008, 0.006), (KX + 0.29, SY + 0.16 + i * 0.05, TOP + 0.015), steelk)
for (sx, sy, w, d) in ((KX + 0.11, SY - 0.13, 0.012, 0.32), (KX + 0.47, SY - 0.13, 0.012, 0.32), (KX + 0.29, SY - 0.29, 0.36, 0.012), (KX + 0.29, SY + 0.03, 0.36, 0.012)):
    bx(f'Rm_Sink_Wall{sx:.2f}{sy:.2f}', RM, (w, d, 0.16), (sx, sy, TOP - 0.08), steelk)
bx('Rm_Sink_Bowl', RM, (0.36, 0.32, 0.01), (KX + 0.29, SY - 0.13, TOP - 0.16), steelk)
cy('Rm_Sink_Plug', RM, 0.03, 0.006, (KX + 0.29, SY - 0.13, TOP - 0.153), chrome, verts=8)
lathe('Rm_Tap_Base', RM, [(0.0, 0.0), (0.028, 0.0), (0.024, 0.05), (0.016, 0.06), (0.0, 0.06)], (X1 - 0.09, SY - 0.13, TOP + 0.012), chrome, segs=8)
sweep('Rm_Tap_Spout', RM, [(X1 - 0.09, SY - 0.13, TOP + 0.06), (X1 - 0.09, SY - 0.13, TOP + 0.24), (X1 - 0.16, SY - 0.13, TOP + 0.3), (X1 - 0.26, SY - 0.13, TOP + 0.24), (X1 - 0.27, SY - 0.13, TOP + 0.2)], 0.012, chrome, segs=6, per_m=16)
bx('Rm_Tap_Lever', RM, (0.012, 0.012, 0.09), (X1 - 0.09, SY - 0.085, TOP + 0.1), chrome, rot=(0.5, 0, 0))
# the splashback, the wall units
tiled_card('Rm_Splashback', RM, KY1 - KY0, 0.55, (X1 - 0.004, (KY0 + KY1) / 2, TOP), tiles, tile=0.6, rotz=-D90)
WZ0, WZ1, WD = 1.45, 2.15, 0.33
bbox('Rm_Wall_Carcass', RM, (WD - 0.02, KY1 - KY0, WZ1 - WZ0), (X1 - WD / 2 + 0.01, (KY0 + KY1) / 2, (WZ0 + WZ1) / 2), carcass, bev=0.004)
for k in range(n_units):
    y = KY0 + uw * (k + 0.5)
    bbox(f'Rm_Wall_Door{k}', RM, (0.018, uw - 0.008, WZ1 - WZ0 - 0.01), (X1 - WD - 0.002, y, (WZ0 + WZ1) / 2), doorf, bev=0.003)
    rd(f'Rm_Wall_Handle{k}', RM, (X1 - WD - 0.03, y + (uw / 2 - 0.06) * (1 if k % 2 else -1), WZ0 + 0.05), (X1 - WD - 0.03, y + (uw / 2 - 0.06) * (1 if k % 2 else -1), WZ0 + 0.15), 0.007, chrome, verts=5)
for k, z in enumerate((WZ0 - 0.005,)): bx('Rm_Wall_Pelmet', RM, (WD, KY1 - KY0, 0.02), (X1 - WD / 2, (KY0 + KY1) / 2, z), carcass)
# the kettle on its base, the toaster, the microwave, mugs, a box of teabags, the washing-up
KTY = KY0 + uw * 4.3
cy('Rm_Kettle_Base', RM, 0.085, 0.02, (KX + 0.3, KTY, TOP + 0.01), blackp, verts=10)
lathe('Rm_Kettle_Body', RM, [(0.0, 0.0), (0.08, 0.0), (0.085, 0.04), (0.075, 0.2), (0.055, 0.24), (0.0, 0.245)], (KX + 0.3, KTY, TOP + 0.02), white, segs=10)
sweep('Rm_Kettle_Handle', RM, [(KX + 0.3, KTY + 0.07, TOP + 0.06), (KX + 0.3, KTY + 0.13, TOP + 0.12), (KX + 0.3, KTY + 0.11, TOP + 0.22), (KX + 0.3, KTY + 0.05, TOP + 0.24)], 0.014, blackp, segs=5, per_m=20)
bx('Rm_Kettle_Spout', RM, (0.05, 0.05, 0.05), (KX + 0.3, KTY - 0.08, TOP + 0.2), white, rot=(0.6, 0, 0))
bx('Rm_Kettle_Window', RM, (0.03, 0.012, 0.12), (KX + 0.24, KTY - 0.035, TOP + 0.13), plain_mat('Rm_KettleGlass', (0.5, 0.6, 0.7), dirt=0.02, rough=0.2), rot=(0, 0, -0.5))
TY_ = KY0 + uw * 5.3
bbox('Rm_Toaster', RM, (0.17, 0.27, 0.19), (KX + 0.3, TY_, TOP + 0.095), chrome, bev=0.03)
for s in (-1, 1): bx(f'Rm_Toaster_Slot{s}', RM, (0.03, 0.2, 0.004), (KX + 0.3 + s * 0.04, TY_, TOP + 0.19), blackp)
bx('Rm_Toaster_Lever', RM, (0.03, 0.02, 0.015), (KX + 0.2, TY_ + 0.08, TOP + 0.12), blackp)
put('rm_micro', RM, (KX + 0.33, KY0 + uw * 0.55, TOP), -D90, name='Rm_Microwave')
for k, (dx, dy, rz) in enumerate(((0.12, 0.25, 0.3), (0.2, 0.33, 1.9), (0.08, 0.41, 4.0))):
    put('rm_mug' if k % 2 else 'rm_mug2', RM, (KX + dx, KTY + dy - 0.25, TOP), rz, name=f'Rm_Mug{k}')
bbox('Rm_Teabags', RM, (0.08, 0.14, 0.1), (KX + 0.45, KTY - 0.23, TOP + 0.05), plain_mat('Rm_TeaBox', (0.75, 0.1, 0.12), dirt=0.05), bev=0.005)
bbox('Rm_WashingUp', RM, (0.05, 0.07, 0.2), (KX + 0.5, SY + 0.32, TOP + 0.1), plain_mat('Rm_Squeezy', (0.2, 0.6, 0.2), dirt=0.02), bev=0.015)
bbox('Rm_Sponge', RM, (0.07, 0.1, 0.03), (KX + 0.4, SY + 0.36, TOP + 0.03), plain_mat('Rm_SpongeMat', (0.85, 0.75, 0.2), dirt=0.05), bev=0.006)
bbox('Rm_TeaTowel', RM, (0.015, 0.3, 0.42), (KX - 0.035, KY0 + uw * 1.5, 0.6), plain_mat('Rm_TowelMat', (0.84, 0.86, 0.9), dirt=0.08), bev=0.004)
rd('Rm_TowelRail', RM, (KX - 0.03, KY0 + uw * 1.5 - 0.2, 0.82), (KX - 0.03, KY0 + uw * 1.5 + 0.2, 0.82), 0.008, chrome, verts=5)
# the paper towel on the wall under the wall units
cy('Rm_KitchenRoll', RM, 0.06, 0.24, (X1 - 0.09, KY0 + 0.35, WZ0 - 0.12), white, rot=(D90, 0, 0), verts=10)
rd('Rm_KitchenRoll_Rod', RM, (X1 - 0.09, KY0 + 0.21, WZ0 - 0.12), (X1 - 0.09, KY0 + 0.49, WZ0 - 0.12), 0.006, chrome, verts=5)
for s in (-1, 1): bx(f'Rm_KitchenRoll_Arm{s}', RM, (0.1, 0.01, 0.03), (X1 - 0.05, KY0 + 0.35 + s * 0.14, WZ0 - 0.11), chrome)
# the fridge past the end of the run (beyond the frame's column), facing the room; a pedal bin
put('rm_fridge', RM, (X1 - 0.36, 3.6, 0), -D90, name='Rm_Fridge')
lathe('Rm_Bin', RM, [(0.0, 0.0), (0.14, 0.0), (0.15, 0.55), (0.0, 0.55)], (X1 - 0.3, KY0 - 0.35, 0), chrome, segs=10)
lathe('Rm_Bin_Lid', RM, [(0.152, 0.55), (0.15, 0.58), (0.08, 0.6), (0.0, 0.6)], (X1 - 0.3, KY0 - 0.35, 0), blackp, segs=10, cap0=False)
bx('Rm_Bin_Pedal', RM, (0.06, 0.08, 0.015), (X1 - 0.46, KY0 - 0.35, 0.03), blackp)

# the table and its chairs (the table along y; a walk past on the left to your office's door)
TX, TY0, TY1 = 9.4, 0.15, 1.95
bbox('Rm_Table_Top', RM, (0.8, TY1 - TY0, 0.03), (TX, (TY0 + TY1) / 2, 0.735), worktop, bev=0.006)
bx('Rm_Table_Edge', RM, (0.81, TY1 - TY0 + 0.01, 0.018), (TX, (TY0 + TY1) / 2, 0.718), blackp)
for sx in (-1, 1):
    for sy in (-1, 1): bx(f'Rm_Table_Leg{sx}{sy}', RM, (0.04, 0.04, 0.71), (TX + sx * 0.34, (TY0 + TY1) / 2 + sy * ((TY1 - TY0) / 2 - 0.06), 0.355), chrome)
    bx(f'Rm_Table_Rail{sx}', RM, (0.02, TY1 - TY0 - 0.12, 0.06), (TX + sx * 0.34, (TY0 + TY1) / 2, 0.68), chrome)
seats = []
for k, (x, y, f) in enumerate(((TX - 0.62, 0.55, D90), (TX - 0.66, 1.45, D90 - 0.25), (TX + 0.62, 0.6, -D90), (TX + 0.75, 1.5, -D90 + 0.5), (TX, -0.25, math.pi + 0.1))):
    seats.append((stack_chair(f'Rm_MessChair{k}', x, y, f), f))
# on the table: two mugs, the paper, a pizza box from last night, the biscuit tin
for k, (x, y) in enumerate(((TX - 0.2, 0.5), (TX + 0.22, 1.55))): put('rm_mug2' if k else 'rm_mug', RM, (x, y, 0.75), 1.1 * k + 0.4, name=f'Rm_TableMug{k}')
cd('Rm_Newspaper', RM, 0.3, 0.38, (TX + 0.12, 0.65, 0.752), art('Rm_PaperArt', 'paper', 0.1), rotz=D90 + 0.2, tilt=-D90)
bbox('Rm_PizzaBox', RM, (0.36, 0.36, 0.04), (TX - 0.1, 1.3, 0.77), plain_mat('Rm_Cardboard', (0.72, 0.6, 0.42), dirt=0.12), rot=(0, 0, 0.3), bev=0.004)
cd('Rm_PizzaLid', RM, 0.32, 0.32, (TX - 0.1 + 0.16 * math.sin(0.3), 1.3 - 0.16 * math.cos(0.3), 0.791), art('Rm_PizzaArt', 'pizza', 0.08), rotz=0.3, tilt=-D90)
lathe('Rm_BiscuitTin', RM, [(0.0, 0.0), (0.12, 0.0), (0.12, 0.08), (0.125, 0.085), (0.125, 0.1), (0.0, 0.1)], (TX + 0.18, 1.0, 0.75), TA_, segs=12)
# the TV, hung under the deck on a pole and shelf, facing the table
TVX, TVY = 8.0, -1.55
bx('Rm_TV_Plate', RM, (0.2, 0.2, 0.012), (TVX, TVY, DECK_Z - 0.256), steel)
rd('Rm_TV_Pole', RM, (TVX, TVY, DECK_Z - 0.26), (TVX, TVY, 2.06), 0.025, steel, verts=6)
bbox('Rm_TV_Shelf', RM, (0.55, 0.42, 0.025), (TVX, TVY, 2.05), steel, bev=0.004)
for s in (-1, 1): rd(f'Rm_TV_Strut{s}', RM, (TVX, TVY, 2.4), (TVX + s * 0.24, TVY, 2.065), 0.01, steel, verts=5)
crt_tv('Rm_TV', (TVX, TVY, 2.063), math.pi - 0.5, 'tv_mess')   # (facing the table)
bx('Rm_TV_Strap', RM, (0.012, 0.44, 0.02), (TVX, TVY, 2.08), blackp)
# the notice board (on the back of reception's team wall, facing the table)

# =====================================================================================================================
# RECEPTION (under the mezzanine, y -9..-2.3, the side door at x 9-10): the team wall, the sofa, armchairs, table
WALLX0, WALLX1, WALLY = 10.05, X1 - 0.01, -2.3
bbox('Rm_TeamWall', RM, (WALLX1 - WALLX0, 0.12, 2.4), ((WALLX0 + WALLX1) / 2, WALLY, 1.2), TM_, bev=0.01)
bx('Rm_TeamWall_Plinth', RM, (WALLX1 - WALLX0, 0.14, 0.08), ((WALLX0 + WALLX1) / 2, WALLY, 0.04), blackp)
bx('Rm_TeamWall_Cap', RM, (WALLX1 - WALLX0 + 0.01, 0.15, 0.03), ((WALLX0 + WALLX1) / 2, WALLY, 2.415), chrome)
bx('Rm_TeamWall_End', RM, (0.03, 0.14, 2.4), (WALLX0 - 0.005, WALLY, 1.2), chrome)
for s in (-1, 1): bx(f'Rm_TeamWall_Stripe{s}', RM, (WALLX1 - WALLX0, 0.004, 0.08), ((WALLX0 + WALLX1) / 2, WALLY + s * 0.062, 0.92), TA_)
cd('TeamBand_Rm_Reception', RM, 1.6, 0.4, ((WALLX0 + WALLX1) / 2, WALLY - 0.064, 1.32), plain_mat('Rm_BandBase', (0.9, 0.9, 0.9), dirt=0.0))
for s in (-1, 1):   # (two little picture lights on the cap, aimed at the band)
    p = Vector(((WALLX0 + WALLX1) / 2 + s * 0.55, WALLY - 0.08, 2.43))
    rd(f'Rm_TeamWall_LampArm{s}', RM, p + Vector((0, 0.07, -0.005)), p + Vector((0, -0.12, 0.04)), 0.008, chrome, verts=5)
    lathe(f'Rm_TeamWall_Lamp{s}', RM, [(0.0, 0.0), (0.03, 0.0), (0.035, 0.08), (0.0, 0.08)], p + Vector((0, -0.14, 0.06)), chrome, segs=8, rot=(2.3, 0, 0))
# the notice board on its back, facing the mess: cork in a frame, the rota, the milk note, the calendar, a postcard
NBX, NBZ = (WALLX0 + WALLX1) / 2, 1.0
bbox('Rm_Notice_Frame', RM, (1.24, 0.03, 0.9), (NBX, WALLY + 0.075, NBZ + 0.45), chrome, bev=0.006)
cd('Rm_Notice_Cork', RM, 1.18, 0.84, (NBX, WALLY + 0.092, NBZ + 0.03), cork, rotz=math.pi)
for k, (dx, dz, w, h, png, rz) in enumerate(((-0.4, 0.4, 0.21, 0.28, 'rota', 0.03), (-0.1, 0.5, 0.13, 0.1, 'milk', -0.08), (0.18, 0.3, 0.21, 0.28, 'calendar', 0.02),
                                             (0.42, 0.55, 0.14, 0.1, 'postcard', 0.12), (0.0, 0.1, 0.14, 0.19, 'house', -0.03))):
    o = cd(f'Rm_Notice_{png}', RM, w, h, (NBX - dx, WALLY + 0.096 + k * 0.0006, NBZ + dz), art(f'Rm_Note_{png}', png, 0.12), rotz=math.pi)
    o.rotation_euler.y = rz
    cy(f'Rm_Notice_Pin{k}', RM, 0.008, 0.01, (NBX - dx, WALLY + 0.1, NBZ + dz + h - 0.02), plain_mat(f'Rm_Pin{k}', ((0.8, 0.1, 0.1), (0.1, 0.3, 0.8), (0.9, 0.8, 0.1), (0.1, 0.6, 0.2), (0.9, 0.9, 0.9))[k], dirt=0.0), rot=(D90, 0, 0), verts=6)

# the sofa under the window, facing in; an armchair either side of the coffee table
cs = size_of('rm_couch'); cz = size_of('rm_armchair')
put('rm_couch', RM, (7.5, Y0 + 0.08 + cs.y / 2, 0), math.pi, name='Rm_Reception_Sofa')
put('rm_armchair', RM, (6.3 + cz.y / 2, -7.35, 0), D90, name='Rm_Reception_Armchair')
put('rm_armchair', RM, (8.55, -6.55, 0), -0.8, name='Rm_Reception_Armchair2')
CTX, CTY = 7.5, -7.55
bbox('Rm_CoffeeTable_Top', RM, (1.0, 0.55, 0.03), (CTX, CTY, 0.42), woodm, bev=0.008)
bbox('Rm_CoffeeTable_Shelf', RM, (0.92, 0.47, 0.02), (CTX, CTY, 0.12), woodm, bev=0.005)
for sx in (-1, 1):
    for sy in (-1, 1): bx(f'Rm_CoffeeTable_Leg{sx}{sy}', RM, (0.035, 0.035, 0.4), (CTX + sx * 0.46, CTY + sy * 0.235, 0.2), blackp)
for k, (dx, dy, rz) in enumerate(((-0.3, 0.02, 0.15), (-0.05, -0.05, -0.25), (0.25, 0.05, 0.4))):
    o = cd(f'Rm_Magazine{k}', RM, 0.21, 0.28, (CTX + dx, CTY + dy - 0.14, 0.436 + k * 0.002), art(f'Rm_Mag{k}', f'mag{k}', 0.1), rotz=rz, tilt=-D90)
for k in range(4): bbox(f'Rm_MagStack{k}', RM, (0.21, 0.28, 0.008), (CTX - 0.2, CTY, 0.135 + k * 0.009), (TM_, white, beige, white)[k], rot=(0, 0, 0.05 * k), bev=0.002)
put('rm_coffee_cup', RM, (CTX + 0.38, CTY - 0.12, 0.435), 0.0, name='Rm_Reception_Cup')
# the plant in the corner, the coat stand by the door with a jacket and a cap, the mat inside the door
plant('Rm_Plant', 11.3, -8.4)   # (clear of the frame's column in the corner)
CRX, CRY = 10.4, -8.55
lathe('Rm_CoatStand', RM, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.02), (0.05, 0.05), (0.022, 0.08), (0.02, 1.7), (0.03, 1.75), (0.0, 1.8)], (CRX, CRY, 0), blackp, segs=10)
for k in range(4):
    a = k * math.tau / 4 + 0.4; d = Vector((math.cos(a), math.sin(a), 0))
    sweep(f'Rm_CoatStand_Hook{k}', RM, [Vector((CRX, CRY, 1.62)), Vector((CRX, CRY, 1.62)) + d * 0.1 + Vector((0, 0, 0.02)), Vector((CRX, CRY, 1.62)) + d * 0.15 + Vector((0, 0, 0.08))], 0.008, blackp, segs=5, per_m=24)
hanging_jacket('Rm_Reception_Jacket', (CRX + 0.13, CRY + 0.05, 1.66), D90 + 0.3)
lathe('Rm_Cap_Crown', RM, [(0.0, 0.1), (0.05, 0.095), (0.085, 0.06), (0.095, 0.0)], (CRX - 0.12, CRY - 0.06, 1.62), TA_, segs=10, rot=(0.5, 0, 0), cap1=False)
bbox('Rm_Cap_Brim', RM, (0.15, 0.1, 0.01), (CRX - 0.12, CRY - 0.17, 1.58), TA_, rot=(0.4, 0, 0), bev=0.004)
bbox('Rm_DoorMat', RM, (1.0, 0.65, 0.014), (9.5, Y0 + 0.5, 0.007), plain_mat('Rm_MatMat', (0.16, 0.15, 0.14), dirt=0.25), bev=0.004)

# =====================================================================================================================
# THE PARTS STORE (behind the partition: x -5.4..0.9 inside, y 4.6..9): racking on the back wall, the tire rack on
# the left, wheels and bodywork on the right, the stool behind the hatch
def racking(name, x0, x1, y0, y1, levels, bays):
    # long-span racking: blue upright frames (two posts and their bracing), orange beams front and back, chipboard decks
    xs = [x0 + (x1 - x0) * i / bays for i in range(bays + 1)]
    for i, x in enumerate(xs):
        for y in (y0 + 0.03, y1 - 0.03): bx(f'{name}_Post{i}{y:.1f}', RM, (0.05, 0.05, levels[-1] + 0.12), (x, y, (levels[-1] + 0.12) / 2), rack_blue)
        for z in (0.1, levels[-1] - 0.1): rd(f'{name}_Tie{i}{z:.1f}', RM, (x, y0 + 0.03, z), (x, y1 - 0.03, z), 0.012, rack_blue, verts=5)
        for k in range(len(levels) - 1):
            za, zb = levels[k] + 0.1, levels[k + 1] - 0.05
            rd(f'{name}_Brace{i}{k}', RM, (x, y0 + 0.03, za), (x, y1 - 0.03, zb), 0.01, rack_blue, verts=5)
        for y in (y0, y1): bx(f'{name}_Foot{i}{y:.1f}', RM, (0.12, 0.1, 0.008), (x, y + (0.03 if y == y0 else -0.03), 0.004), rack_blue)
    for k, z in enumerate(levels):
        for y in (y0, y1): bx(f'{name}_Beam{k}{y:.1f}', RM, (x1 - x0 - 0.05, 0.05, 0.1), ((x0 + x1) / 2, y + (0.025 if y == y0 else -0.025), z - 0.05), rack_orange)
        bx(f'{name}_Deck{k}', RM, (x1 - x0 - 0.05, y1 - y0 - 0.1, 0.018), ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.009), chip)
    return xs
PY0, PY1 = 8.3, 8.95
LV = [0.18, 0.8, 1.42, 2.04]
xs = racking('Rm_Rack', -5.3, -0.4, PY0, PY1, LV, 2)
# lin bins with their labels on the two middle levels, boxes on the bottom and top, a few loose parts
lab = 0
for k in (1, 2):
    for j in range(10):
        x = -5.2 + 0.235 + j * 0.47
        if abs(x - xs[1]) < 0.12: x += 0.12
        if x > -0.6: break
        m = bin_blue if (j + k) % 3 else bin_yel
        bx(f'Rm_Bin{k}{j}_Base', RM, (0.2, 0.36, 0.01), (x, (PY0 + PY1) / 2 + 0.06, LV[k] + 0.023), m)
        for s in (-1, 1): bx(f'Rm_Bin{k}{j}_Side{s}', RM, (0.008, 0.36, 0.17), (x + s * 0.096, (PY0 + PY1) / 2 + 0.06, LV[k] + 0.1), m)
        bx(f'Rm_Bin{k}{j}_Back', RM, (0.2, 0.008, 0.17), (x, (PY0 + PY1) / 2 + 0.236, LV[k] + 0.1), m)
        bx(f'Rm_Bin{k}{j}_Front', RM, (0.2, 0.008, 0.09), (x, (PY0 + PY1) / 2 - 0.116, LV[k] + 0.06), m, rot=(-0.25, 0, 0))
        bx(f'Rm_Bin{k}{j}_Stuff', RM, (0.17, 0.3, 0.04), (x, (PY0 + PY1) / 2 + 0.07, LV[k] + 0.06), (steelk, blackp, chrome, greyp)[(j * 3 + k) % 4])
        cd(f'Rm_Bin{k}{j}_Label', RM, 0.1, 0.035, (x, (PY0 + PY1) / 2 - 0.13, LV[k] + 0.04), art(f'Rm_BinLabel{lab % 12}', f'bin{lab % 12}', 0.05) if f'Rm_BinLabel{lab % 12}' not in bpy.data.materials else bpy.data.materials[f'Rm_BinLabel{lab % 12}'], tilt=0.25)
        lab += 1
for k, (x, key, rz) in enumerate(((-4.9, 'rm_cbox1', 0.1), (-4.25, 'rm_cbox2', -0.15), (-3.4, 'rm_cbox4', 0.05), (-2.0, 'rm_cbox1', 0.2), (-1.2, 'rm_cbox2', 0.0))):
    put(key, RM, (x, (PY0 + PY1) / 2, LV[0] + 0.018), rz, s=0.8, name=f'Rm_StoreBox{k}')
for k, (x, key, rz) in enumerate(((-4.7, 'rm_cbox4', 0.0), (-3.6, 'rm_cbox1', 0.3), (-2.5, 'rm_cbox2', -0.1), (-1.0, 'rm_cbox4', 0.15))):
    put(key, RM, (x, (PY0 + PY1) / 2, LV[3] + 0.018), rz, s=0.75, name=f'Rm_StoreBoxTop{k}')
for k, x in enumerate((-2.9, -2.65)):   # (brake discs on the bottom deck, a coil spring)
    lathe(f'Rm_Disc{k}', RM, [(0.07, 0.0), (0.16, 0.0), (0.16, 0.028), (0.07, 0.028)], (x, PY0 + 0.25, LV[0] + 0.02 + k * 0.03), steelk, segs=14, cap0=False, cap1=False)
sp = [(-1.75 + 0.06 * math.cos(t * 0.6), PY0 + 0.3 + 0.06 * math.sin(t * 0.6), LV[0] + 0.03 + t * 0.006) for t in range(0, 42)]
sweep('Rm_Spring', RM, sp, 0.008, plain_mat('Rm_SpringPaint', (0.9, 0.75, 0.1), dirt=0.08), segs=4, per_m=40)
# the tire rack: two tiers of fresh tires stood on rails along the left wall
TRX0, TRX1, TRY0, TRY1 = -5.35, -4.65, 4.95, 8.1
for i, y in enumerate((TRY0, (TRY0 + TRY1) / 2, TRY1)):
    for x in (TRX0, TRX1): bx(f'Rm_TireRack_Post{i}{x:.1f}', RM, (0.04, 0.04, 1.85), (x, y, 0.925), rack_blue)
    for z in (0.15, 0.95): rd(f'Rm_TireRack_Cross{i}{z}', RM, (TRX0, y, z), (TRX1, y, z), 0.015, rack_blue, verts=5)
for z in (0.15, 0.95):
    for x in (TRX0 + 0.18, TRX1 - 0.18): rd(f'Rm_TireRack_Rail{x:.2f}{z}', RM, (x, TRY0, z), (x, TRY1, z), 0.018, rack_blue, verts=6)
nt = 0
for tier, z in enumerate((0.15, 0.95)):
    for j in range(11):
        y = TRY0 + 0.15 + j * 0.27 + (0.05 if tier else 0)
        if y > TRY1 - 0.12: break
        if tier == 1 and j in (8, 9): continue   # (a gap: two sets out)
        tire(f'Rm_StoreTire{tier}{j}', ((TRX0 + TRX1) / 2, y, z + 0.278), (D90, 0, 0), segs=12); nt += 1   # (its tread on the two rails)
# wheels hung on wall pegs on the right wall, facing into the room
for k, (y, z) in enumerate(((5.6, 1.15), (6.35, 1.15), (5.6, 1.9), (6.35, 1.9))):
    rd(f'Rm_WheelPeg{k}', RM, (0.9, y, z + 0.175), (0.6, y, z + 0.19), 0.02, steel, verts=6)   # (hung by the rim's barrel)
    wheel(f'Rm_Wheel{k}', (0.76, y, z), (0, -D90, 0))
# bodywork on wall brackets: the side skirts on the right wall, a rear wing on the back wall over the racking
for k, z in enumerate((2.45, 2.85)):
    for y in (7.0, 8.3):
        bx(f'Rm_SkirtBracket{k}{y}', RM, (0.25, 0.03, 0.03), (0.78, y, z - 0.04), steel)
    bbox(f'Rm_Skirt{k}', RM, (0.08, 1.9, 0.2), (0.78, 7.65, z + 0.06), TM_, rot=(0.0, 0.15, 0), bev=0.02)
    bx(f'Rm_SkirtStripe{k}', RM, (0.002, 1.88, 0.03), (0.738, 7.65, z + 0.06), TA_)
for y in (8.75, 8.75):
    pass
for x in (-4.0, -2.0):
    bx(f'Rm_WingBracket{x}', RM, (0.03, 0.3, 0.03), (x, 8.82, 2.62), steel)
bbox('Rm_Wing_Main', RM, (2.8, 0.3, 0.035), (-3.0, 8.78, 2.66), carbon, rot=(-0.12, 0, 0), bev=0.008)
bbox('Rm_Wing_Flap', RM, (2.75, 0.16, 0.025), (-3.0, 8.75, 2.75), TM_, rot=(-0.35, 0, 0), bev=0.006)
for s in (-1, 1): bbox(f'Rm_Wing_Endplate{s}', RM, (0.012, 0.42, 0.3), (-3.0 + s * 1.41, 8.76, 2.7), carbon, bev=0.005)
# the stool behind the hatch, the bell, a clipboard and the parts book on the counter, the stores sign inside
lathe('Rm_Stool_Seat', RM, [(0.0, 0.0), (0.17, 0.0), (0.18, 0.04), (0.0, 0.05)], (-1.6, 5.05, 0.72), blackp, segs=12)
for k in range(4):
    a = k * math.tau / 4 + 0.4; rd(f'Rm_Stool_Leg{k}', RM, (-1.6 + math.cos(a) * 0.12, 5.05 + math.sin(a) * 0.12, 0.72), (-1.6 + math.cos(a) * 0.2, 5.05 + math.sin(a) * 0.2, 0.0), 0.012, chrome, verts=5)
lathe('Rm_Stool_Ring', RM, [(0.16, 0.28), (0.165, 0.29), (0.16, 0.3)], (-1.6, 5.05, 0), chrome, segs=12, cap0=False, cap1=False)
CT = 1.075
lathe('Rm_Bell', RM, [(0.0, 0.0), (0.05, 0.0), (0.045, 0.04), (0.02, 0.06), (0.005, 0.07), (0.0, 0.075)], (-1.35, 4.38, CT), chrome, segs=10)
bbox('Rm_Clipboard', RM, (0.23, 0.31, 0.008), (-2.9, 4.42, CT + 0.004), woodm, rot=(0, 0, 0.15), bev=0.002)
cd('Rm_Clipboard_Sheet', RM, 0.2, 0.26, (-2.9 + 0.13 * math.sin(0.15), 4.42 - 0.13 * math.cos(0.15), CT + 0.009), art('Rm_SignOut', 'house', 0.08), rotz=0.15, tilt=-D90)
bbox('Rm_PartsBook', RM, (0.24, 0.32, 0.05), (-2.2, 4.62, CT + 0.025), plain_mat('Rm_BookCover', (0.12, 0.2, 0.45), dirt=0.1), rot=(0, 0, -0.1), bev=0.006)
cd('Rm_StoresSign', RM, 0.42, 0.28, (-4.6, BACK_Y + 0.104, 1.5), art('Rm_Stores', 'stores', 0.1), rotz=math.pi)
cd('Rm_StoresSign_Out', RM, 0.42, 0.28, (-0.1, BACK_Y - 0.104, 2.35), bpy.data.materials['Rm_Stores'])   # (over the door)
# a stepladder leaning on the racking's end
for s in (-1, 1): rd(f'Rm_Ladder_Stile{s}', RM, (-0.25 + s * 0.2, 7.95, 0.0), (-0.3 + s * 0.17, 8.25, 1.75), 0.015, chrome, verts=5)
for k in range(5):
    t = (k + 1) / 6; bx(f'Rm_Ladder_Step{k}', RM, (0.36 - 0.06 * t, 0.08, 0.02), (-0.25 - 0.05 * t, 7.95 + 0.3 * t, 1.75 * t), chrome, rot=(-0.17, 0, 0))

# =====================================================================================================================
# YOUR OFFICE (ground floor, x 6.1..12, y 4.6..9): the desk's already there. The bookcase and a filing cabinet, the
# season planner on the wall, a visitor's chair, the rug, the coat hook by the door
desk = bpy.data.objects.get('Desk'); dlo = dhi = None
if desk:
    bpy.context.view_layer.update()
    cs_ = [desk.matrix_world @ Vector(c) for c in desk.bound_box]; dlo = Vector(map(min, *cs_)); dhi = Vector(map(max, *cs_))
    print('ROOMS: your desk', tuple(round(v, 2) for v in dlo), tuple(round(v, 2) for v in dhi))
DX = (dlo.x + dhi.x) / 2 if dlo else 9.0
bs = size_of('rm_bookcase')
put('rm_bookcase', RM, (6.12 + bs.y / 2, 7.1, 0), D90, name='Rm_Office_Bookcase')
for k in range(7):   # (binders along the second shelf: the bookcase's shelves are at its own heights, so a box of them on top instead)
    pass
for k, key in enumerate(('rm_binder', 'rm_binder2', 'rm_binder', 'rm_binder2')):
    put(key, RM, (6.12 + bs.y / 2, 6.78 + k * 0.08, bs.z), D90, name=f'Rm_Office_Binder{k}')
put('rm_cab_tall', RM, (6.72, 8.6, 0), 0.0, name='Rm_Office_Cabinet')   # (clear of the mezzanine column's base in the corner)
put('rm_papers', RM, (6.72, 8.6, size_of('rm_cab_tall').z), 0.2, name='Rm_Office_Papers')
# the planner: a whiteboard on the right wall, its marker tray, three markers and a rubber
PBY, PBZ, PBW, PBH = 6.6, 1.0, 2.4, 1.2
bbox('Rm_Planner_Frame', RM, (0.03, PBW + 0.04, PBH + 0.04), (X1 - 0.016, PBY, PBZ + PBH / 2), chrome, bev=0.006)
cd('Rm_Planner_Board', RM, PBW, PBH, (X1 - 0.033, PBY, PBZ), art('Rm_PlannerArt', 'planner', 0.06), rotz=-D90)
bx('Rm_Planner_Tray', RM, (0.06, 0.8, 0.02), (X1 - 0.05, PBY + 0.6, PBZ - 0.02), chrome)
for k, c in enumerate(((0.8, 0.1, 0.1), (0.1, 0.2, 0.7), (0.1, 0.1, 0.1))):
    rd(f'Rm_Marker{k}', RM, (X1 - 0.055, PBY + 0.3 + k * 0.07, PBZ - 0.0), (X1 - 0.055, PBY + 0.42 + k * 0.07, PBZ - 0.0), 0.009, plain_mat(f'Rm_MarkerMat{k}', c, dirt=0.0), verts=6)
bbox('Rm_Planner_Rubber', RM, (0.04, 0.12, 0.03), (X1 - 0.055, PBY + 0.82, PBZ + 0.005), blackp, bev=0.005)
# the visitor's chair against the side wall, turned to the desk (not in front of it: that's the way you walk up to
# sit at the computer, and your own chair swivels out there), the rug under it all
put('rm_chair_conf', RM, (11.25, 7.55, 0), math.atan2(-0.93, -0.36), name='Rm_Office_VisitorChair')
o = bbox('Rm_Office_Rug', RM, (2.6, 1.8, 0.008), (DX - 0.1, (dlo.y - 0.55) if dlo else 7.4, 0.004), rug, bev=0.002)
o.data.uv_layers.remove(o.data.uv_layers[0]); uvl = o.data.uv_layers.new()
for f in o.data.polygons:
    for li in f.loop_indices:
        v = o.data.vertices[o.data.loops[li].vertex_index].co; uvl.data[li].uv = (v.x / 2.6 + 0.5, v.y / 1.8 + 0.5)
# the coat hook by the door (on the partition's inside), a jacket on it; a bin by the desk
bx('Rm_Office_HookRail', RM, (0.5, 0.02, 0.06), (8.0, BACK_Y + 0.11, 1.68), woodm)
for k in range(3): sweep(f'Rm_Office_Hook{k}', RM, [(7.84 + k * 0.16, BACK_Y + 0.12, 1.66), (7.84 + k * 0.16, BACK_Y + 0.2, 1.64), (7.84 + k * 0.16, BACK_Y + 0.22, 1.7)], 0.008, chrome, segs=5, per_m=24)
hanging_jacket('Rm_Office_Jacket', (7.84, BACK_Y + 0.21, 1.68), math.pi)
lathe('Rm_Office_Bin', RM, [(0.0, 0.0), (0.12, 0.0), (0.15, 0.32), (0.145, 0.32), (0.115, 0.01)], ((dhi.x + 0.25) if dhi else 10.0, 8.6, 0), plain_mat('Rm_MeshBin', (0.15, 0.15, 0.16), dirt=0.05), segs=10, cap1=False)

# =====================================================================================================================
# UPSTAIRS: the engineering office's carpet, the blinds on the glass front, the printer and filing on the sim room's
# glass wall, the meeting table at the back, the water cooler; the sim room's carpet, foam, sofa and TV
def walk_floor(name, x0, x1, y0, y1, mat, tile=0.5):
    me = bpy.data.meshes.new(name); me.from_pydata([(x0, y0, DECK_Z + 0.006), (x1, y0, DECK_Z + 0.006), (x1, y1, DECK_Z + 0.006), (x0, y1, DECK_Z + 0.006)], [], [(0, 1, 2, 3)])
    if me.polygons[0].normal.z < 0: me.flip_normals()
    uv = me.uv_layers.new()
    for li in me.polygons[0].loop_indices:
        v = me.vertices[me.loops[li].vertex_index].co; uv.data[li].uv = (v.x / tile, v.y / tile)
    o = bpy.data.objects.new(name, me); RM.objects.link(o); me.materials.append(mat); return o
walk_floor('WALK_Rm_Carpet', MX + 0.15, X1, -4.45, Y1, carpet)
walk_floor('WALK_Rm_CarpetSim', MX + 0.15, X1, Y0, -4.55, carpet_sim)
walk_floor('WALK_Rm_CarpetDoor', 10.4, X1, -4.55, -4.45, carpet)
# venetian blinds (inside the glass front, x 6.2): the headrail, the slats let down to a height, the bottom rail, the cord
GT = DECK_Z + 2.45
def blind(name, y0, y1, drop):
    w = y1 - y0 - 0.04; yc = (y0 + y1) / 2
    bbox(f'{name}_Head', RM, (0.05, w + 0.02, 0.05), (MX + 0.2, yc, GT - 0.025), white, bev=0.006)
    if drop > 0.05: tiled_card(f'{name}_Slats', RM, w, drop, (MX + 0.2, yc, GT - 0.05 - drop), slats, tile=0.4, rotz=D90)
    bbox(f'{name}_Bottom', RM, (0.035, w, 0.025), (MX + 0.2, yc, GT - 0.06 - max(drop, 0.06)), white, bev=0.004)
    rd(f'{name}_Cord', RM, (MX + 0.225, y0 + 0.06, GT - 0.05), (MX + 0.225, y0 + 0.06, GT - 1.2), 0.003, white, verts=4)
    lathe(f'{name}_Tassel', RM, [(0.0, 0.0), (0.01, 0.01), (0.008, 0.05), (0.0, 0.055)], (MX + 0.225, y0 + 0.06, GT - 1.25), white, segs=6)
for k, (y0, y1, drop) in enumerate(((-4.25, -2.7, 0.15), (-2.7, -1.15, 1.2), (0.4, 1.95, 0.55), (1.95, 3.4, 0.25), (4.5, 6.75, 1.4), (6.75, 8.95, 0.35),
                                    (-8.9, -7.35, 1.9), (-7.35, -5.8, 1.6), (-5.8, -4.55, 1.9))):
    blind(f'Rm_Blind{k}', y0, y1, drop)
# the printer station against the sim room's glass (office side): a low cabinet, the laser printer and its paper
PRX, PRY = 7.0, -4.25
cl = size_of('rm_cab_low')
put('rm_cab_low', RM, (PRX, -4.47 + cl.y / 2, DECK_Z), math.pi, name='Rm_Up_PrinterCab')
PZ = DECK_Z + cl.z
bbox('Rm_Printer_Body', RM, (0.44, 0.4, 0.26), (PRX, -4.47 + 0.24, PZ + 0.13), beige, bev=0.02)
bx('Rm_Printer_Out', RM, (0.32, 0.2, 0.012), (PRX, -4.47 + 0.24, PZ + 0.262), greyp)
bbox('Rm_Printer_Paper', RM, (0.21, 0.28, 0.02), (PRX, -4.47 + 0.24, PZ + 0.275), white, bev=0.002)
bx('Rm_Printer_Tray', RM, (0.38, 0.015, 0.07), (PRX, -4.47 + 0.44, PZ + 0.06), greyp)
cd('Rm_Printer_Panel', RM, 0.1, 0.05, (PRX + 0.13, -4.47 + 0.441, PZ + 0.17), plain_mat('Rm_PrinterLCD', (0.4, 0.6, 0.3), dirt=0.0), rotz=math.pi)
bbox('Rm_Printer_Ream', RM, (0.21, 0.3, 0.05), (PRX + 0.62, -4.25, DECK_Z + 0.025), white, bev=0.003)   # (a ream on the floor by it)
for k, x in enumerate((7.85, 8.55)): put('rm_cab_low', RM, (x, -4.47 + cl.y / 2, DECK_Z), math.pi, name=f'Rm_Up_FilingCab{k}')
put('rm_papers', RM, (8.55, -4.2, DECK_Z + cl.z), 0.3, name='Rm_Up_Papers')
# the back: a round meeting table with three chairs, a speakerphone, the track map on the wall; the water cooler
MTX, MTY = 10.3, 7.95
lathe('Rm_Meet_Top', RM, [(0.0, 0.73), (0.45, 0.73), (0.45, 0.76), (0.0, 0.76)], (MTX, MTY, DECK_Z), worktop, segs=16)
lathe('Rm_Meet_Base', RM, [(0.0, 0.0), (0.28, 0.0), (0.27, 0.02), (0.04, 0.04), (0.035, 0.73), (0.0, 0.73)], (MTX, MTY, DECK_Z), blackp, segs=10)
gs = size_of('rm_chair_g')
for k, (dx, dy, rz) in enumerate(((-0.75, 0.0, -D90 + 0.2), (0.0, 0.62, math.pi + 0.3), (0.75, -0.05, D90 - 0.4))):
    put('rm_chair_g', RM, (MTX + dx, MTY + dy, DECK_Z), rz + math.pi, name=f'Rm_Meet_Chair{k}')
lathe('Rm_Speakerphone', RM, [(0.0, 0.0), (0.1, 0.0), (0.06, 0.04), (0.0, 0.045)], (MTX + 0.05, MTY, DECK_Z + 0.76), greyp, segs=3)
put('rm_papers', RM, (MTX - 0.2, MTY - 0.15, DECK_Z + 0.76), 0.6, name='Rm_Meet_Papers')
bbox('Rm_TrackMap_Frame', RM, (1.24, 0.03, 0.8), (MTX, Y1 - 0.02, DECK_Z + 1.55), blackp, bev=0.008)
cd('Rm_TrackMap', RM, 1.16, 0.72, (MTX, Y1 - 0.037, DECK_Z + 1.19), art('Rm_TrackMapArt', 'trackmap', 0.05))
put('rm_cooler', RM, (6.55, Y1 - 0.35, DECK_Z), 0.0, name='Rm_Up_Cooler')
plant('Rm_UpPlant', 7.3, Y1 - 0.4, 1.1)
# the sim room: foam panels behind the rig and under the window, the sofa against the glass, the TV on a low unit
for i in range(6):
    for j in range(3):
        y = -8.33 + i * 0.68; z = DECK_Z + 0.5 + j * 0.68   # (from clear of the corner column)
        if y > -4.85: continue
        bbox(f'Rm_Foam_Back{i}{j}', RM, (0.04, 0.62, 0.62), (X1 - 0.022, y, z + 0.31), blackp, bev=0.004)
        cd(f'Rm_Foam_Face{i}{j}', RM, 0.6, 0.6, (X1 - 0.043, y, z + 0.01), foam, rotz=-D90)
for i in range(6):
    x = 7.25 + i * 0.7
    bbox(f'Rm_Foam_Front{i}', RM, (0.62, 0.04, 0.4), (x, Y0 + 0.022, DECK_Z + 0.42 + 0.2), blackp, bev=0.004)   # (under the window's sill)
    cd(f'Rm_Foam_FrontFace{i}', RM, 0.6, 0.38, (x, Y0 + 0.043, DECK_Z + 0.43), foam, rotz=math.pi)
put('rm_couch', RM, (7.6, -4.6 - cs.y / 2, DECK_Z), 0.0, name='Rm_Sim_Sofa')
bbox('Rm_Sim_TVUnit', RM, (1.2, 0.42, 0.45), (7.6, Y0 + 0.3, DECK_Z + 0.225), blackp, bev=0.01)
crt_tv('Rm_Sim_TV', (7.6, Y0 + 0.3, DECK_Z + 0.45), math.pi, 'tv_sim', w=0.62)
o = bbox('Rm_Sim_Rug', RM, (1.8, 1.4, 0.008), (7.6, -6.5, DECK_Z + 0.011), plain_mat('Rm_SimRug', (0.1, 0.1, 0.12), dirt=0.1), bev=0.002)
put('rm_can', RM, (8.1, Y0 + 0.35, DECK_Z + 0.45), 0.3, name='Rm_Sim_Cans')

# =====================================================================================================================
# where people go: at the table, the kettle, the sofas, upstairs by the table, behind the stores' hatch
(p0, f0) = seats[0]; stand('STAND_any.010', (p0.x, p0.y, 0), f0, 'sit_idle')
(p1, f1) = seats[2]; stand('STAND_any.011', (p1.x, p1.y, 0), f1, 'sit_idle')
stand('STAND_any.012', (KX - 0.45, KTY - 0.1, 0), D90, 'lean')
stand('STAND_any.013', (7.5, Y0 + 0.08 + cs.y * 0.55, 0), math.pi, 'sit_idle')
stand('STAND_any.014', (7.6, -4.6 - cs.y * 0.55, DECK_Z), 0.0, 'sit_idle')
stand('STAND_any.015', (7.2, 7.4, DECK_Z), D90, 'talk'); stand('STAND_any.016', (7.95, 7.5, DECK_Z), -D90, 'talk')   # (past the data room's end)
stand('STAND_any.017', (-3.1, 5.15, 0), 0.0, 'lean')
print('ROOMS: tires', nt, 'couch', tuple(round(v, 2) for v in cs))
