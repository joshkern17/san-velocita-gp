# The factory workshops' printed art: the composites shop (station_fab2: tools/garage-fab2.py) and the machine shop
# (station_tools3: tools/garage-tools3.py). Flat PNGs; the grime goes on in Blender.
#   /usr/local/bin/python3 tools/garage-signs-ws3.py   -> models/garage/src/stations_gen/art/f2_*.png, t3_*.png
import os, math
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
BOLD = lambda s: font('Arial Bold.ttf', s); REG = lambda s: font('Arial.ttf', s); MONO = lambda s: font('Courier New Bold.ttf', s)
BLACK = lambda s: font('Arial Black.ttf', s)
def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)
def save(im, n): im.save(os.path.join(OUT, n + '.png')); print('wrote', n)

# ---- composites ----
# the autoclave's controller: the cure cycle, temperature and pressure against time, where it is now
im = Image.new('RGB', (256, 192), (6, 10, 16)); d = ImageDraw.Draw(im); C = (90, 200, 255); T = (255, 140, 60); G = (120, 255, 150)
d.text((8, 6), 'CURE CYCLE  CF-NOSE-07', font=BOLD(13), fill=C)
d.rectangle((8, 26, 248, 150), outline=(40, 60, 80))
pts_t = [(8, 146), (60, 146), (110, 70), (190, 70), (230, 140), (248, 146)]; d.line(pts_t, fill=T, width=3)
pts_p = [(8, 146), (40, 100), (200, 100), (215, 146), (248, 146)]; d.line(pts_p, fill=C, width=2)
d.line((150, 28, 150, 148), fill=G, width=2)
d.text((10, 156), 'T 135C  P 6.9 bar', font=MONO(14), fill=T); d.text((10, 172), 'DWELL 01:12 / 02:00', font=MONO(14), fill=G)
save(im, 'f2_cure')
# the autoclave's maker's plate
im = Image.new('RGB', (192, 96), (190, 192, 194)); d = ImageDraw.Draw(im); K = (25, 25, 30)
d.rectangle((3, 3, 188, 92), outline=K, width=2)
centered(d, (0, 8, 192, 32), 'AUTOCLAVE AC-1500', BOLD(16), K)
for i, t in enumerate(('MAX 10 bar  200 C', 'VESSEL No. 2004-117', 'INSPECT: SEP 2004')): d.text((12, 38 + i * 17), t, font=REG(13), fill=K)
save(im, 'f2_plate')
# the clean room sign, over the door side
im = Image.new('RGB', (384, 96), (235, 238, 240)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 383, 22), fill=(30, 90, 170)); centered(d, (0, 0, 384, 22), 'COMPOSITES  CLEAN ROOM', BOLD(16), (255, 255, 255))
centered(d, (0, 26, 384, 58), 'NO DUST. NO FOOD. NO EXCUSES.', BLACK(18), (30, 30, 34))
centered(d, (0, 62, 384, 90), 'Gloves on. Pre-preg back in the freezer.', REG(16), (60, 60, 66))
save(im, 'f2_sign')
# the ply book on the table: the lay-up sequence, ticked
im = Image.new('RGB', (200, 260), (240, 238, 230)); d = ImageDraw.Draw(im); K = (30, 30, 34); B = (30, 60, 160)
centered(d, (0, 6, 200, 28), 'PLY BOOK  NOSE  R4', BOLD(14), K)
for i in range(12):
    y = 34 + i * 18; d.line((8, y + 16, 192, y + 16), fill=(190, 190, 186))
    d.text((10, y), f'P{i + 1:02d}', font=MONO(13), fill=K); d.text((52, y), ('0', '45', '-45', '90')[i % 4] + ' deg', font=REG(12), fill=K)
    d.text((120, y), 'T300' if i % 3 else 'M46J', font=REG(12), fill=K)
    if i < 7: d.line((168, y + 8, 174, y + 13, 186, y + 1), fill=B, width=2)
save(im, 'f2_plybook')
# the freezer's door: -18 C, the log
im = Image.new('RGB', (128, 96), (20, 24, 28)); d = ImageDraw.Draw(im)
centered(d, (0, 4, 128, 40), '-18.4 C', MONO(26), (120, 220, 255)); centered(d, (0, 46, 128, 66), 'PRE-PREG', BOLD(14), (220, 230, 240))
centered(d, (0, 70, 128, 90), 'LOG OUT TIMES', REG(12), (180, 190, 200))
save(im, 'f2_freezer')

# ---- machine shop ----
# a CNC control's screen: the program, the position, spindle speed
im = Image.new('RGB', (256, 192), (10, 14, 20)); d = ImageDraw.Draw(im); C = (120, 255, 160); W = (220, 230, 240); A = (255, 200, 80)
d.rectangle((0, 0, 255, 20), fill=(30, 50, 90)); d.text((6, 3), 'O1207 UPRIGHT-FL OP2', font=BOLD(13), fill=W)
for i, ln in enumerate(('N140 G43 H12 Z25.', 'N150 S12000 M03', 'N160 G01 X-42.5 Y18.2', 'N170 Z-6.35 F900', 'N180 X-38.1 Y22.7')):
    d.text((6, 26 + i * 16), ln, font=MONO(13), fill=C if i != 2 else A)
d.line((0, 110, 255, 110), fill=(60, 80, 110))
for i, (ax, v) in enumerate((('X', '-42.500'), ('Y', ' 18.200'), ('Z', ' -6.350'))): d.text((8, 116 + i * 22), f'{ax} {v}', font=MONO(18), fill=W)
d.text((150, 120), 'S 12000', font=MONO(15), fill=A); d.text((150, 142), 'F  900', font=MONO(15), fill=A); d.text((150, 164), 'RUN', font=BOLD(16), fill=C)
save(im, 't3_cnc')
# its maker's badge
im = Image.new('RGB', (256, 48), (230, 232, 234)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 70, 47), fill=(200, 30, 30)); centered(d, (0, 0, 70, 48), 'VMC', BLACK(22), (255, 255, 255))
centered(d, (74, 0, 256, 48), 'MILLTEK 5X-800', BOLD(20), (40, 40, 46))
save(im, 't3_badge')
# the drawing pinned over the bench: an upright, dimensioned
im = Image.new('RGB', (256, 192), (232, 234, 238)); d = ImageDraw.Draw(im); K = (30, 40, 90)
d.rectangle((4, 4, 251, 187), outline=K, width=2); d.rectangle((150, 150, 251, 187), outline=K, width=1)
d.text((154, 154), 'UPRIGHT FL', font=BOLD(12), fill=K); d.text((154, 170), 'SVGP-SUS-0412  C', font=REG(10), fill=K)
d.polygon([(60, 30), (100, 24), (118, 60), (110, 130), (84, 160), (56, 140), (48, 80)], outline=K, width=2)
d.ellipse((70, 70, 100, 100), outline=K, width=2); d.ellipse((78, 132, 92, 146), outline=K, width=2); d.ellipse((74, 34, 88, 48), outline=K, width=2)
for y in (30, 160): d.line((130, y, 140, y), fill=K)
d.line((135, 30, 135, 160), fill=K); d.text((138, 88), '136.0', font=REG(11), fill=K)
d.line((48, 172, 118, 172), fill=K); d.text((66, 174), '70.0 +/-0.05', font=REG(10), fill=K)
save(im, 't3_drawing')
# the shop's rule board
im = Image.new('RGB', (384, 128), (245, 205, 40)); d = ImageDraw.Draw(im); K = (25, 25, 25)
d.rectangle((3, 3, 380, 124), outline=K, width=3)
centered(d, (0, 8, 384, 44), 'MACHINE SHOP', BLACK(28), K)
for i, t in enumerate(('Safety glasses on. Sleeves rolled down.', 'Measure twice. Tolerances are not a suggestion.', 'Swarf in the bins, not on the floor.')):
    centered(d, (0, 48 + i * 24, 384, 70 + i * 24), t, REG(15), K)
save(im, 't3_rules')
