# The fabrication bay's printed bits (tools/garage-fab.py): the MIG welder's front panel, the fire blanket's pouch, the
# fixture table's chalk marks, a spark. PNGs into models/garage/src/stations_gen/art (fab_...). System python3 (Pillow).
#   python3 tools/garage-signs-fab.py
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
R = random.Random(11)

def centered(d, y, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)

# the welder's front panel: brand strip, the volts/amps readout, two dials, the euro torch socket
W, H = 256, 192
im = Image.new('RGB', (W, H), (34, 70, 140)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, W - 1, 40], fill=(22, 24, 28)); centered(d, 6, 'SVT  MIG 250', BLACK(22), (240, 200, 40), W)
d.rectangle([28, 52, 228, 86], fill=(12, 14, 12), outline=(80, 84, 90), width=2)
d.text((40, 56), '21.5V', font=MONO(22), fill=(255, 150, 40)); d.text((140, 56), '180A', font=MONO(22), fill=(255, 150, 40))
for cx, lab in ((70, 'WIRE'), (186, 'VOLTS')):
    d.ellipse([cx - 26, 98, cx + 26, 150], fill=(18, 18, 20), outline=(200, 200, 200), width=2)
    a = math.radians(R.randint(200, 330)); d.line([(cx, 124), (cx + 20 * math.cos(a), 124 + 20 * math.sin(a))], fill=(240, 240, 240), width=4)
    d.text((cx - 20, 154), lab, font=ARIALB(13), fill=(230, 230, 230))
d.ellipse([112, 150, 144, 182], fill=(20, 20, 20), outline=(150, 150, 150), width=3)
im.save(os.path.join(OUT, 'fab_welder.png'))

# the fire blanket's red pouch
im = Image.new('RGB', (128, 160), (196, 26, 22)); d = ImageDraw.Draw(im)
d.rectangle([4, 4, 123, 155], outline=(250, 240, 230), width=3)
centered(d, 24, 'FIRE', BLACK(28), (255, 255, 255), 128); centered(d, 60, 'BLANKET', BLACK(20), (255, 255, 255), 128)
d.rectangle([30, 104, 98, 116], fill=(250, 240, 230)); centered(d, 122, 'PULL TABS', ARIALB(13), (255, 255, 255), 128)
im.save(os.path.join(OUT, 'fab_blanket.png'))

# chalk on the fixture table: dimensions, a sketch of the front clip, a tally
im = Image.new('RGBA', (256, 128), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
chalk = (232, 232, 222, 235)
d.text((8, 4), '612 c/c', font=MARK(22), fill=chalk); d.text((150, 6), '38 x 1.6', font=MARK(20), fill=chalk)
d.line([(20, 90), (110, 90), (120, 60), (30, 60), (20, 90)], fill=chalk, width=3); d.line([(30, 60), (60, 40), (110, 40), (120, 60)], fill=chalk, width=3)
d.text((150, 70), 'IIII I', font=MARK(26), fill=chalk); d.text((150, 100), 'tack only!', font=MARK(18), fill=chalk)
im.save(os.path.join(OUT, 'fab_chalk.png'))

# a spark: hot centre, a few streaks (alpha cut in Blender)
im = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
for k in range(9):
    a = R.uniform(0, math.tau); L = R.uniform(14, 30)
    d.line([(32, 32), (32 + L * math.cos(a), 32 + L * math.sin(a))], fill=(255, 190 + R.randint(0, 60), 80, 255), width=2)
d.ellipse([26, 26, 38, 38], fill=(255, 250, 220, 255))
im.save(os.path.join(OUT, 'fab_spark.png'))
print('wrote fab art', OUT)
