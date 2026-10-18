# The lift and engine hoist's printed bits (tools/garage-tools2.py): the lift's data plate, the power unit's buttons,
# the crane's capacity sticker, the parts washer's label, an alloy wheel's face (with its alpha: the round's cut out).
# Writes PNGs to models/garage/src/stations_gen/art. System python3 (Pillow).
#   python3 tools/garage-signs-tools2.py
import os, math
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
MONO = lambda s: font('Monaco.ttf', s)
HAND = lambda s: font('Noteworthy.ttc', s, 1)

def centered(d, y, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)

# the lift's data plate: riveted aluminium, stamped, an inspection tag scrawled on
im = Image.new('RGB', (256, 160), (178, 180, 174)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 255, 159], outline=(90, 92, 90), width=4)
for x, y in ((9, 9), (246, 9), (9, 150), (246, 150)): d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(118, 120, 116))
centered(d, 10, 'SVL  TP-4000', BLACK(24), (30, 34, 40), 256)
centered(d, 42, 'TWO POST VEHICLE LIFT', ARIALB(14), (30, 34, 40), 256)
centered(d, 64, 'RATED 4000 kg   1000 kg / ARM', MONO(11), (50, 52, 56), 256)
centered(d, 82, 'SER 0447-91   230V 2.2kW', MONO(11), (50, 52, 56), 256)
d.rectangle([24, 104, 232, 146], fill=(236, 220, 120)); d.text((32, 108), 'INSPECTED 03/26', font=HAND(18), fill=(30, 40, 120))
im.save(os.path.join(OUT, 'tools2_plate.png'))

# the power unit's push buttons and lowering label
im = Image.new('RGB', (128, 192), (40, 42, 46)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 127, 191], outline=(20, 20, 22), width=4)
d.ellipse([34, 18, 94, 78], fill=(30, 150, 50), outline=(10, 40, 10), width=4); centered(d, 34, 'UP', BLACK(22), (230, 255, 230), 128)
d.rectangle([20, 96, 108, 128], fill=(220, 180, 30)); centered(d, 100, 'LOWER', ARIALB(18), (20, 20, 20), 128)
centered(d, 140, 'PULL BOTH', ARIALB(13), (220, 220, 214), 128); centered(d, 158, 'LOCKS FIRST', ARIALB(13), (220, 220, 214), 128)
im.save(os.path.join(OUT, 'tools2_buttons.png'))

# the crane's boom sticker: the capacity at each pin hole
im = Image.new('RGB', (256, 48), (236, 196, 30)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 255, 47], outline=(20, 20, 20), width=3)
for i, t in enumerate(('2 T', '1.5 T', '1 T', '0.5 T')):
    x = 12 + i * 62; d.ellipse([x + 16, 6, x + 28, 18], fill=(20, 20, 20)); d.text((x + 6, 22), t, font=ARIALB(16), fill=(20, 20, 20))
im.save(os.path.join(OUT, 'tools2_crane.png'))

# the parts washer's label
im = Image.new('RGB', (256, 96), (200, 30, 22)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 255, 95], outline=(250, 240, 220), width=4)
centered(d, 10, 'PARTS WASHER', BLACK(20), (250, 240, 220), 256)
centered(d, 44, 'SOLVENT  -  NO SMOKING', ARIALB(15), (250, 240, 220), 256)
centered(d, 66, 'CLOSE LID AFTER USE', ARIALB(13), (250, 230, 200), 256)
im.save(os.path.join(OUT, 'tools2_washer.png'))

# an alloy wheel's face, 5 spokes, the lug nuts, a dusty barrel: RGBA, transparent outside the rim
S = 128; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = S / 2
d.ellipse([2, 2, S - 3, S - 3], fill=(150, 152, 150, 255))                       # (the rim's lip)
d.ellipse([10, 10, S - 11, S - 11], fill=(40, 40, 42, 255))                      # (the dark inside of the barrel)
for k in range(5):                                                               # (the spokes)
    a = k / 5 * math.tau - math.pi / 2
    for w, col in ((9, (175, 177, 176, 255)), (5, (198, 200, 198, 255))):
        p = [(c + math.cos(a + s * 0.12) * 18, c + math.sin(a + s * 0.12) * 18) for s in (-1, 1)] + [(c + math.cos(a + s * 0.06) * 56, c + math.sin(a + s * 0.06) * 56) for s in (1, -1)]
        d.polygon(p, fill=col)
d.ellipse([c - 20, c - 20, c + 20, c + 20], fill=(170, 172, 170, 255))
for k in range(5):
    a = k / 5 * math.tau - math.pi / 2 + math.pi / 5; x, y = c + math.cos(a) * 12, c + math.sin(a) * 12
    d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(60, 60, 64, 255))
d.ellipse([c - 6, c - 6, c + 6, c + 6], fill=(120, 30, 30, 255))                 # (the centre cap)
im.save(os.path.join(OUT, 'tools2_rim.png'))
print('wrote', OUT)
