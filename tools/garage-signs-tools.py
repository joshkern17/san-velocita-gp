# The workbench's printed bits (tools/garage-tools.py), drawn flat; the grime goes on in Blender (tools/garagelib.py).
# Writes tools_*.png to models/garage/src/stations_gen/art. System Python (Pillow):
#   python3 tools/garage-signs-tools.py
import os, math, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s)
ARIALB = lambda s: font('Arial Bold.ttf', s)
MARK = lambda s: font('MarkerFelt.ttc', s, 1)
MONO = lambda s: font('Monaco.ttf', s)
R = random.Random(31)

def centered(d, y, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)

# the pegboard: hardboard, its holes on a 25 mm grid, the tools' shapes painted on it (where each one hangs: the 3D
# tools hang over most of them; a couple are out, their outlines empty, which is how you know someone's using them).
# 512 x 384 px over the 1.35 x 0.95 m board
W, H = 512, 384
im = Image.new('RGB', (W, H), (150, 118, 82)); d = ImageDraw.Draw(im)
for y in range(6, H, 10):
    for x in range(6, W, 10): d.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=(70, 52, 36))
paint = (40, 40, 44)
def outline(poly): d.polygon(poly, outline=paint, width=3)
# a row of spanners (left, small to big), screwdrivers, the hammer, pliers; the torque wrench long along the bottom
for i in range(6):
    x = 30 + i * 22; L = 70 + i * 8
    d.line([(x, 40), (x, 40 + L)], fill=paint, width=4 + i // 2); d.ellipse([x - 7 - i, 30 - i, x + 7 + i, 46 + i], outline=paint, width=3)
for i in range(4):
    x = 190 + i * 22; d.rectangle([x - 6, 36, x + 6, 80], outline=paint, width=3); d.line([(x, 80), (x, 150)], fill=paint, width=3)
outline([(290, 40), (350, 40), (350, 62), (290, 62)]); d.line([(320, 62), (320, 170)], fill=paint, width=6)
outline([(380, 40), (395, 120), (405, 120), (420, 40)]); outline([(385, 120), (380, 175), (392, 175), (400, 122), (408, 175), (420, 175), (415, 120)])
d.rectangle([40, 300, 470, 316], outline=paint, width=3); d.ellipse([462, 294, 492, 322], outline=paint, width=3)
d.text((40, 322), 'TORQUE', font=ARIALB(14), fill=paint)
# a socket rail's outline, the sockets' circles along it
d.rectangle([40, 222, 300, 232], outline=paint, width=3)
for i in range(10): r = 6 + i * 0.7; d.ellipse([52 + i * 24 - r, 246 - r, 52 + i * 24 + r, 246 + r], outline=paint, width=2)
# names in marker on tape, someone's (D's) rules
d.rectangle([330, 200, 490, 222], fill=(230, 226, 210)); d.text((336, 201), 'PUT IT BACK - D', font=MARK(18), fill=(30, 30, 120))
d.rectangle([330, 240, 470, 262], fill=(230, 226, 210)); d.text((336, 241), 'METRIC ONLY', font=MARK(18), fill=(160, 20, 20))
im.save(os.path.join(OUT, 'tools_pegboard.png'))

# a parts supplier's calendar: a car photo up top (a painted, grainy one), the month's grid under it
W, H = 192, 256
im = Image.new('RGB', (W, H), (236, 232, 222)); d = ImageDraw.Draw(im)
for y in range(0, 110):
    t = y / 110; d.line([(0, y), (W, y)], fill=(int(40 + 120 * t), int(70 + 60 * t), int(140 - 40 * t)))
d.polygon([(20, 92), (40, 70), (110, 64), (150, 76), (175, 92)], fill=(200, 30, 24)); d.rectangle([20, 90, 175, 100], fill=(40, 40, 40))
for x in (50, 145): d.ellipse([x - 13, 88, x + 13, 112], fill=(20, 20, 20))
d.rectangle([0, 110, W, 132], fill=(200, 30, 24)); centered(d, 112, 'SV PARTS & SPARES', ARIALB(15), (255, 240, 220), W)
centered(d, 134, 'OCTOBER', BLACK(16), (20, 20, 20), W)
for k in range(35):
    c, r = k % 7, k // 7; x, y = 12 + c * 25, 158 + r * 19; d.rectangle([x, y, x + 23, y + 17], outline=(150, 150, 150))
    if 2 <= k < 33: d.text((x + 2, y + 1), str(k - 1), font=MONO(10), fill=(40, 40, 40))
d.ellipse([12 + 5 * 25 - 2, 158 + 2 * 19 - 2, 12 + 5 * 25 + 25, 158 + 2 * 19 + 19], outline=(200, 20, 20), width=2)   # (race day, ringed)
im.save(os.path.join(OUT, 'tools_calendar.png'))

# labels: engine oil, brake fluid (round the tins), a parts-bin card
for name, bg, fg, top, mid in (('tools_oil', (24, 60, 140), (250, 210, 40), 'VELO', '10W-60 RACING'), ('tools_brake', (220, 220, 214), (200, 20, 20), 'DOT 5.1', 'BRAKE FLUID')):
    im = Image.new('RGB', (256, 64), bg); d = ImageDraw.Draw(im)
    centered(d, 4, top, BLACK(26), fg, 256); centered(d, 38, mid, ARIALB(16), fg if name == 'tools_brake' else (240, 240, 240), 256)
    im.save(os.path.join(OUT, name + '.png'))
im = Image.new('RGB', (128, 48), (232, 228, 214)); d = ImageDraw.Draw(im)
for k, t in enumerate(('M6 BOLTS', 'M8 NUTS', 'WASHERS')): pass
centered(d, 10, 'M8 / M10', ARIALB(20), (30, 30, 30), 128)
im.save(os.path.join(OUT, 'tools_bin.png'))
print('wrote', OUT)
