# The Race Workshop's setup pad and trophy wall art (tools/workshop/setup.py, trophies.py), drawn flat; the grime goes on
# in Blender. Run with the system Python (Pillow): python3 tools/workshop/art_setup.py -> models/garage/src/workshop_art/ws_su_*.png
import os, math
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'workshop_art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s)
BOLD = lambda s: font('Arial Bold.ttf', s)
MONO = lambda s: font('Courier New Bold.ttf', s)
HAND = lambda s: font('Marker Felt.ttc', s) if os.path.exists(F + 'Supplemental/Marker Felt.ttc') or os.path.exists(F + 'Marker Felt.ttc') else font('Chalkboard.ttc', s)

def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)
def save(im, n): im.save(os.path.join(OUT, n + '.png')); print('wrote', n)

# the scales' readout: four corners round a car outline, the total and the cross weight, green on black (an LCD panel)
im = Image.new('RGB', (320, 220), (8, 14, 10)); d = ImageDraw.Draw(im); G = (110, 255, 140); g = (40, 110, 60)
d.rectangle((4, 4, 315, 215), outline=g, width=2)
centered(d, (10, 8, 310, 30), 'CORNER WEIGHTS  kg', BOLD(16), G)
d.rounded_rectangle((132, 46, 188, 168), 12, outline=g, width=3)   # (the car, from above)
for x in (122, 186):
    for y in (58, 138): d.rectangle((x, y, x + 12, y + 22), fill=g)
for (x, y, lab, v) in ((14, 46, 'LF', '153.4'), (200, 46, 'RF', '149.8'), (14, 126, 'LR', '187.1'), (200, 126, 'RR', '190.6')):
    d.text((x, y), lab, font=BOLD(14), fill=g); d.text((x, y + 16), v, font=MONO(30), fill=G)
d.line((10, 176, 310, 176), fill=g, width=2)
d.text((14, 184), 'TOTAL 680.9', font=MONO(19), fill=G); d.text((182, 184), 'CROSS 50.4%', font=MONO(19), fill=G)
save(im, 'ws_su_readout')

# the pad's stencil on the floor, at its back end: SETUP PAD / NO WORK ON PAD (white, worn)
im = Image.new('RGB', (512, 128), (60, 62, 66)); d = ImageDraw.Draw(im)
centered(d, (0, 6, 512, 74), 'SETUP PAD', BLACK(58), (232, 232, 226))
centered(d, (0, 78, 512, 120), 'LEVEL TO 0.5 mm  -  NO JACKS ON PAD', BOLD(26), (232, 200, 40))
save(im, 'ws_su_stencil')

# a scale's label: the maker, the corner, the rating
for c in ('LF', 'RF', 'LR', 'RR'):
    im = Image.new('RGB', (128, 48), (24, 24, 26)); d = ImageDraw.Draw(im)
    d.text((6, 4), 'SV SCALE', font=BOLD(15), fill=(240, 200, 40)); d.text((6, 24), '1500 kg', font=BOLD(13), fill=(200, 200, 200))
    centered(d, (84, 2, 124, 46), c, BLACK(24), (240, 240, 240))
    save(im, 'ws_su_scale_' + c.lower())

# a turn plate's degree ring: ticks every 5, numbers every 10, either way of 0
N = 256; im = Image.new('RGB', (N, N), (150, 152, 156)); d = ImageDraw.Draw(im); c = N / 2
d.ellipse((4, 4, N - 4, N - 4), outline=(40, 40, 44), width=3)
for a in range(-40, 41, 5):
    t = math.radians(a - 90); r0 = c - 8; r1 = c - (24 if a % 10 == 0 else 16)
    d.line((c + r0 * math.cos(t), c + r0 * math.sin(t), c + r1 * math.cos(t), c + r1 * math.sin(t)), fill=(30, 30, 34), width=3 if a % 10 == 0 else 2)
    if a % 20 == 0:
        s = str(abs(a)); f = BOLD(16); b = d.textbbox((0, 0), s, font=f); rr = c - 38
        d.text((c + rr * math.cos(t) - (b[2] - b[0]) / 2, c + rr * math.sin(t) - (b[3] - b[1]) / 2 - b[1]), s, font=f, fill=(30, 30, 34))
d.ellipse((c - 30, c - 30, c + 30, c + 30), outline=(60, 60, 64), width=2)
save(im, 'ws_su_turnplate')

# the setup sheet on the trolley's clipboard: the car's numbers, a few changed in pen
im = Image.new('RGB', (210, 280), (236, 234, 226)); d = ImageDraw.Draw(im); K = (30, 30, 34)
centered(d, (0, 6, 210, 30), 'SETUP SHEET', BLACK(20), K)
rows = [('RIDE F', '32 mm'), ('RIDE R', '45 mm'), ('CAMBER F', '-3.2'), ('CAMBER R', '-1.8'), ('TOE F', '0.5 out'), ('TOE R', '1.0 in'),
        ('SPRING F', '160'), ('SPRING R', '140'), ('ARB F', '3 / 5'), ('ARB R', '2 / 5'), ('WING', '7 / 6')]
for k, (a, b) in enumerate(rows):
    y = 38 + k * 19; d.line((8, y + 17, 202, y + 17), fill=(180, 180, 176)); d.text((10, y), a, font=BOLD(13), fill=K); d.text((112, y), b, font=MONO(15), fill=K)
y = 38 + 2 * 19   # (camber F, changed in pen: the old number struck through, the new one beside it)
d.line((110, y + 8, 160, y + 8), fill=(20, 40, 160), width=2); d.text((166, y - 2), '-3.0', font=HAND(15), fill=(20, 40, 160))
d.text((10, 254), "DON'T CHANGE W/O ASKING - D", font=HAND(12), fill=(20, 40, 160))
save(im, 'ws_su_sheet')

# the laser heads' labels
im = Image.new('RGB', (128, 32), (220, 40, 30)); d = ImageDraw.Draw(im)
centered(d, (0, 0, 128, 32), 'LASER CLASS 2', BOLD(15), (250, 240, 230)); save(im, 'ws_su_laser')

# the trophy cabinet's header: HALL OF FAME, gold on black, a stripe either side
im = Image.new('RGB', (768, 96), (12, 12, 14)); d = ImageDraw.Draw(im); GOLD = (222, 180, 70)
centered(d, (0, 8, 768, 88), 'HALL OF FAME', BLACK(62), GOLD)
for x0 in (16, 640): d.rectangle((x0, 44, x0 + 112, 50), fill=GOLD)
save(im, 'ws_su_halloffame')

# the note on an empty cabinet's glass: reserved, in Danny's marker
im = Image.new('RGB', (200, 140), (250, 236, 120)); d = ImageDraw.Draw(im); B = (30, 40, 120)
centered(d, (0, 8, 200, 56), 'RESERVED', HAND(36), B)
centered(d, (0, 62, 200, 92), 'for the first one.', HAND(20), B)
centered(d, (0, 96, 200, 126), 'no pressure  - D', HAND(18), B)
save(im, 'ws_su_reserved')
