# The Race Workshop's printed bits on the walls (tools/workshop/services.py puts them up): safety signs, the fire
# points' ID signs, the call points, the first aid box, the eye wash station, the clock face, the notice board's
# papers, the distribution board's labels, the heaters' plates, the air drops' gauge, the sponsor boards (the game's
# own sponsors, assets/sponsors). PNGs into models/garage/src/stations_gen/art, ws_sv_ names. System python3 (Pillow):
#   python3 tools/workshop/services_art.py
import os, math, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s); BOLD = lambda s: font('Arial Bold.ttf', s); REG = lambda s: font('Arial.ttf', s)
MARK = lambda s: font('MarkerFelt.ttc', s, 1); MONO = lambda s: font('Monaco.ttf', s)
R = random.Random(2003)
WHITE, RED, BLUE, GREEN, YELLOW, INK = (246, 246, 242), (200, 24, 28), (20, 70, 160), (18, 128, 70), (250, 204, 20), (20, 20, 22)

def fit(d, text, mk, size, w):   # (the biggest size up to `size` that fits w)
    while size > 6 and d.textbbox((0, 0), text, font=mk(size))[2] - d.textbbox((0, 0), text, font=mk(size))[0] > w: size -= 1
    return mk(size)
def ctext(d, cx, y, text, mk, size, w, fill):
    f = fit(d, text, mk, size, w); b = d.textbbox((0, 0), text, font=f)
    d.text((cx - (b[2] - b[0]) / 2 - b[0], y - b[1]), text, font=f, fill=fill); return b[3] - b[1]
def save(im, n): im.save(os.path.join(OUT, 'ws_sv_' + n + '.png'))

# ---- a mandatory sign (blue disc, white pictogram) with its words underneath: 128 x 160
def mandatory(name, words, picto):
    im = Image.new('RGB', (128, 160), WHITE); d = ImageDraw.Draw(im)
    d.ellipse([22, 8, 106, 92], fill=BLUE); picto(d)
    for i, w in enumerate(words): ctext(d, 64, 102 + i * 26, w, BLACK, 20, 116, INK)
    d.rectangle([0, 0, 127, 159], outline=(150, 150, 150), width=2); save(im, name)
def ears(d):
    d.arc([42, 26, 86, 70], 180, 360, fill=WHITE, width=6)
    for x in (36, 80): d.rounded_rectangle([x, 44, x + 12, 70], 4, fill=WHITE)
def goggles(d):
    d.rounded_rectangle([36, 40, 92, 62], 10, fill=WHITE); d.rectangle([62, 46, 66, 56], fill=BLUE)
    for x in (40, 68): d.ellipse([x, 43, x + 20, 59], fill=(120, 170, 230))
mandatory('ears', ('EAR DEFENDERS', 'MUST BE WORN'), ears)
mandatory('eyes', ('EYE PROTECTION', 'MUST BE WORN'), goggles)

# ---- warnings (yellow triangle, words): 192 x 96
def warning(name, words, mark='!'):
    im = Image.new('RGB', (192, 96), WHITE); d = ImageDraw.Draw(im)
    d.polygon([(46, 10), (84, 78), (8, 78)], fill=YELLOW, outline=INK); d.polygon([(46, 20), (74, 72), (18, 72)], outline=INK)
    ctext(d, 46, 38, mark, BLACK, 30, 30, INK)
    for i, w in enumerate(words): ctext(d, 140, 18 + i * 24, w, BLACK, 18, 96, INK)
    d.rectangle([0, 0, 191, 95], outline=(150, 150, 150), width=2); save(im, name)
warning('testcell', ('ENGINE', 'TEST CELL', 'NO ENTRY'))
warning('welding', ('WELDING', 'IN', 'PROGRESS'), '*')

# ---- the fab shop's header over its opening: 256 x 48
im = Image.new('RGB', (256, 48), (30, 34, 40)); d = ImageDraw.Draw(im)
ctext(d, 128, 9, 'FABRICATION', BLACK, 28, 236, YELLOW); save(im, 'fabhead')

# ---- no smoking: red ring and bar over a cigarette, 128 x 160
im = Image.new('RGB', (128, 160), WHITE); d = ImageDraw.Draw(im)
d.rectangle([34, 48, 94, 58], fill=INK); d.rectangle([86, 48, 94, 58], fill=(230, 120, 30))
d.ellipse([20, 8, 108, 96], outline=RED, width=10); d.line([(34, 22), (94, 82)], fill=RED, width=10)
for i, w in enumerate(('NO', 'SMOKING')): ctext(d, 64, 104 + i * 26, w, BLACK, 22, 116, INK)
d.rectangle([0, 0, 127, 159], outline=(150, 150, 150), width=2); save(im, 'nosmoking')

# ---- the fire points: FIRE POINT header, each extinguisher's ID sign (its color band, what it's for), 128 x 64 / 96 x 128
im = Image.new('RGB', (192, 48), RED); d = ImageDraw.Draw(im); ctext(d, 96, 8, 'FIRE POINT', BLACK, 30, 176, WHITE); save(im, 'firepoint')
def idsign(name, band, title, lines):
    im = Image.new('RGB', (96, 128), WHITE); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 95, 34], fill=band); ctext(d, 48, 6, title, BLACK, 22, 88, WHITE if band != WHITE else INK)
    for i, w in enumerate(lines): ctext(d, 48, 44 + i * 20, w, BOLD, 14, 88, INK)
    d.rectangle([0, 0, 95, 127], outline=(150, 150, 150), width=2); save(im, name)
idsign('id_water', RED, 'WATER', ('Wood, paper', 'and fabric', 'NOT for', 'electrical'))
idsign('id_co2', INK, 'CO2', ('Electrical', 'fires', 'Do not hold', 'the horn'))
idsign('id_foam', (240, 210, 140), 'FOAM', ('Fuel and', 'oil fires', 'Wood, paper', 'and fabric'))
# the extinguishers' own labels, wrapped round the body (a band, 128 x 64): their color, the type
for n, col, t in (('lab_water', RED, 'WATER'), ('lab_co2', (26, 26, 28), 'CO2'), ('lab_foam', RED, 'FOAM')):
    im = Image.new('RGB', (128, 64), col); d = ImageDraw.Draw(im)
    if n == 'lab_foam': d.rectangle([0, 0, 127, 22], fill=(240, 210, 140))
    d.rectangle([28, 24, 100, 60], fill=WHITE); ctext(d, 64, 30, t, BLACK, 18, 64, INK); save(im, n)

# ---- a manual call point's face: 64 x 64 (white window, FIRE, the press-here mark)
im = Image.new('RGB', (64, 64), RED); d = ImageDraw.Draw(im)
d.rectangle([8, 8, 55, 55], fill=WHITE); ctext(d, 32, 12, 'FIRE', BLACK, 14, 44, RED)
d.rectangle([18, 32, 45, 49], outline=INK, width=2); ctext(d, 32, 35, 'PUSH', BOLD, 10, 24, INK); save(im, 'callpoint')

# ---- the first aid box: green, a white cross, 96 x 96; the eye wash station's board, 128 x 160
im = Image.new('RGB', (96, 96), GREEN); d = ImageDraw.Draw(im)
d.rectangle([38, 16, 58, 64], fill=WHITE); d.rectangle([24, 30, 72, 50], fill=WHITE); ctext(d, 48, 72, 'FIRST AID', BLACK, 14, 86, WHITE); save(im, 'firstaid')
im = Image.new('RGB', (128, 160), GREEN); d = ImageDraw.Draw(im)
d.ellipse([34, 18, 94, 58], fill=WHITE); d.ellipse([54, 28, 74, 48], fill=GREEN)
for i, (x0, y0) in enumerate(((44, 60), (64, 60), (84, 60))): d.line([(x0, y0), (x0 - 4 + i * 4, y0 + 14)], fill=WHITE, width=4)
ctext(d, 64, 86, 'EYE WASH', BLACK, 22, 116, WHITE); ctext(d, 64, 114, 'STATION', BLACK, 20, 116, WHITE)
ctext(d, 64, 140, 'Rinse 10 minutes', BOLD, 12, 116, WHITE); save(im, 'eyewash')

# ---- the clock's face: 128 x 128 (ticks, numbers, no hands: the hands are modelled)
im = Image.new('RGB', (128, 128), (238, 236, 228)); d = ImageDraw.Draw(im)
for k in range(60):
    a = k / 60 * math.tau; r0 = 54 if k % 5 else 48
    d.line([(64 + math.sin(a) * r0, 64 - math.cos(a) * r0), (64 + math.sin(a) * 60, 64 - math.cos(a) * 60)], fill=INK, width=3 if k % 5 == 0 else 1)
for h in range(1, 13):
    a = h / 12 * math.tau; f = BOLD(12); t = str(h); b = d.textbbox((0, 0), t, font=f)
    d.text((64 + math.sin(a) * 38 - (b[2] - b[0]) / 2 - b[0], 64 - math.cos(a) * 38 - (b[3] - b[1]) / 2 - b[1]), t, font=f, fill=INK)
ctext(d, 64, 82, 'SVGP', BLACK, 9, 40, (150, 30, 30)); save(im, 'clock')

# ---- the notice board's papers (each its own sheet), 96 x 128 each
def sheet(name, title, lines, paper=(240, 238, 228), hand=False, head=INK):
    im = Image.new('RGB', (96, 128), paper); d = ImageDraw.Draw(im)
    ctext(d, 48, 6, title, MARK if hand else BLACK, 15, 88, head)
    mk, sz = (MARK, 12) if hand else (REG, 11)
    while sz > 6 and max(d.textbbox((0, 0), w, font=mk(sz))[2] for w in lines if w) > 84: sz -= 1   # (every line inside the sheet)
    for i, w in enumerate(lines): d.text((7, 28 + i * 12), w, font=mk(sz), fill=(40, 40, 46))
    save(im, name)
sheet('n_rules', 'SHOP RULES', ('1 Tools back by 6pm', '2 Clean your bay', '3 No phones on the', '   dyno desk', '4 Danny is NOT', '   allowed the forklift', '5 Ear defenders. Yes,', '   you, Danny'))
sheet('n_rota', 'CLEANING ROTA', ('MON  Kev', 'TUE  Sam', 'WED  Danny', 'THU  Danny (again)', 'FRI  whoever lost', '     at darts', ''), paper=(250, 248, 236))
sheet('n_bbq', 'END OF SEASON BBQ!', ('Sat after the', 'last round', 'Bring your own', 'chair. And meat.', 'NOT the parts', 'washer this time'), paper=(255, 236, 120), hand=True, head=(180, 30, 30))
sheet('n_cal', 'RACE CALENDAR', ('R1  ......  Apr', 'R2  ......  May', 'R3  ......  Jun', 'R4  ......  Jul', 'R5  ......  Aug', 'R6  ......  Sep', 'TEST  every Tue'), paper=(232, 240, 250))
sheet('n_wanted', 'WANTED', ('Whoever took the', '10mm socket.', 'All of them.', 'We know.'), paper=(250, 250, 250), hand=True)

# ---- the distribution board's labels: the danger triangle with "400 V", the board's name, 128 x 64
im = Image.new('RGB', (128, 64), YELLOW); d = ImageDraw.Draw(im)
d.polygon([(24, 6), (44, 44), (4, 44)], fill=YELLOW, outline=INK); d.line([(26, 14), (20, 28), (28, 28), (22, 40)], fill=INK, width=3)
ctext(d, 86, 6, 'DANGER', BLACK, 18, 76, INK); ctext(d, 86, 30, '400 VOLTS', BOLD, 14, 76, INK)
ctext(d, 64, 48, 'DB-1  WORKSHOP', BOLD, 11, 120, INK); save(im, 'db')
im = Image.new('RGB', (128, 48), (40, 40, 44)); d = ImageDraw.Draw(im)
ctext(d, 64, 6, 'MAIN ISOLATOR', BOLD, 14, 120, WHITE); ctext(d, 64, 26, 'ON  -  OFF', BOLD, 12, 120, YELLOW); save(im, 'isolator')

# ---- the heaters' plates: 128 x 32, and the gauge dial on the air drops: 64 x 64
im = Image.new('RGB', (128, 32), (200, 198, 190)); d = ImageDraw.Draw(im)
ctext(d, 64, 4, 'THERMOBLAST 60', BLACK, 14, 120, (150, 30, 30)); ctext(d, 64, 20, 'GAS FIRED  60 kW', BOLD, 9, 120, INK); save(im, 'heaterplate')
im = Image.new('RGB', (64, 64), (240, 240, 236)); d = ImageDraw.Draw(im)
for k in range(11):
    a = math.radians(-135 + k * 27); d.line([(32 + math.sin(a) * 22, 32 - math.cos(a) * 22), (32 + math.sin(a) * 28, 32 - math.cos(a) * 28)], fill=INK, width=2)
d.arc([6, 6, 58, 58], -45 - 90, -45 - 90 + 60, fill=(30, 150, 60), width=4)
a = math.radians(-20); d.line([(32, 32), (32 + math.sin(a) * 24, 32 - math.cos(a) * 24)], fill=RED, width=3); d.ellipse([28, 28, 36, 36], fill=INK)
ctext(d, 32, 44, 'PSI', BOLD, 9, 30, INK); save(im, 'gauge')

# ---- the twin 13 A socket's face, 96 x 48
im = Image.new('RGB', (96, 48), (236, 236, 232)); d = ImageDraw.Draw(im)
for x in (6, 52):
    d.rectangle([x + 10, 12, x + 14, 22], fill=INK); d.rectangle([x + 22, 26, x + 32, 30], fill=INK); d.rectangle([x + 2, 26, x + 12, 30], fill=INK)
    d.rectangle([x + 28, 8, x + 34, 14], fill=(200, 40, 30))
d.rectangle([0, 0, 95, 47], outline=(180, 180, 176), width=2); save(im, 'socket')

# ---- the sponsor boards: the game's own sponsors on white (assets/sponsors/<slug>/color.webp)
def board(name, slugs, size=(512, 128)):
    W, H = size; im = Image.new('RGB', size, (240, 240, 236)); d = ImageDraw.Draw(im)
    n = len(slugs); cw = W // n
    for i, s in enumerate(slugs):
        p = os.path.join(ROOT, 'assets', 'sponsors', s, 'color.webp')
        if not os.path.exists(p): continue
        lg = Image.open(p).convert('RGBA'); k = min((cw - 16) / lg.width, (H - 20) / lg.height); lg = lg.resize((max(1, int(lg.width * k)), max(1, int(lg.height * k))))
        im.paste(lg, (i * cw + (cw - lg.width) // 2, (H - lg.height) // 2), lg)
        if i: d.line([(i * cw, 10), (i * cw, H - 10)], fill=(200, 200, 196), width=2)
    save(im, name)
board('spons_a', ['svgp', 'volta-cola', 'apex-energy', 'neon-fm'])
board('spons_b', ['triton-watches', 'rapid', 'gold-coast-airlines', 'kobra'])
board('spons_c', ['dales-tire-and-lube', 'max-hardware', 'volt-rush-energy'], (384, 128))
board('spons_d', ['sunrise-insurance', 'metro-cab-co', 'pine-hollow-credit-union'], (384, 128))
print('wrote ws_sv_ art')
