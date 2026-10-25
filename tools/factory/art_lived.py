# The Factory's lived-in art (tools/factory/lived.py): the rooms' names painted on the walls, the whiteboard by the
# tunnel hall's door, the prints of the great liveries along the walkway, the team's roundel for the banners. Drawn
# flat; the grime goes on in Blender.
#   /usr/local/bin/python3 tools/factory/art_lived.py <outdir>   (the system Python with Pillow; lived.py runs it)
import os, sys, random
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
DIN = lambda s: font('DIN Condensed Bold.ttf', s); MARK = lambda s: font('MarkerFelt.ttc', s, 1); BOLD = lambda s: font('Arial Bold.ttf', s)
R = random.Random(1997)
def save(im, n): im.save(os.path.join(OUT, 'fa_lv_' + n + '.png'))
def fit(d, t, f, w):
    while d.textbbox((0, 0), t, font=f)[2] > w and f.size > 8: f = font(os.path.basename(f.path), f.size - 2, getattr(f, 'index', 0))
    return f

# the rooms' names, painted on: tall condensed capitals in the factory's blue-grey, worn (alpha holes where it's flaked)
NAMES = {'tire': 'TIRE BAY', 'machine': 'MACHINE SHOP', 'dock': 'LOADING DOCK', 'comp': 'COMPOSITES', 'dyno1': 'ENGINE DYNO 1', 'dyno2': 'ENGINE DYNO 2', 'tunnel': 'WIND TUNNEL'}
for k, t in NAMES.items():
    W, H = 1024, 200; im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = fit(d, t, DIN(200), W - 40); b = d.textbbox((0, 0), t, font=f)
    d.text(((W - (b[2] - b[0])) / 2 - b[0], (H - (b[3] - b[1])) / 2 - b[1]), t, font=f, fill=(34, 58, 96, 255))
    px = im.load()
    for _ in range(2600):   # (flaked)
        x, y = R.randrange(W), R.randrange(H); r = R.choice((1, 1, 2, 3))
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if 0 <= x + dx < W and 0 <= y + dy < H and dx * dx + dy * dy <= r * r: px[x + dx, y + dy] = (0, 0, 0, 0)
    save(im, 'name_' + k)

# the whiteboard: the setups, a lap chart, the jobs, a warning in someone else's hand
W, H = 900, 600; im = Image.new('RGB', (W, H), (238, 240, 240)); d = ImageDraw.Draw(im)
for _ in range(14):   # (old marker, never quite wiped off)
    x, y = R.randrange(W), R.randrange(H); d.line((x, y, x + R.randrange(-160, 160), y + R.randrange(-30, 30)), fill=(222, 226, 228), width=R.randrange(4, 14))
blk, blu, red, grn = (30, 30, 40), (30, 70, 170), (190, 30, 30), (30, 120, 60)
d.text((28, 18), 'CAR 1  SETUP', font=MARK(40), fill=blk); d.line((28, 66, 300, 66), fill=blk, width=3)
for i, t in enumerate(('F WING  +2 clicks', 'R WING  -1', 'F ARB  soft (3)', 'R ARB  5', 'RIDE HT  F 32 / R 58', 'BRAKE BIAS  57.5', 'TIRE PSI: ask Danny')):
    d.text((34, 80 + i * 40), t, font=MARK(30), fill=blu if i < 6 else red)
d.text((480, 18), 'LONG RUN  (laps)', font=MARK(36), fill=blk); d.line((480, 62, 780, 62), fill=blk, width=3)
x0, y0 = 490, 250
d.line((x0, y0, x0 + 360, y0), fill=blk, width=2); d.line((x0, y0, x0, y0 - 170), fill=blk, width=2)
pts = [(x0 + 10 + i * 28, y0 - 30 - (i * 7 if i < 7 else 49 - (i - 7) * 9) + R.randrange(-6, 6)) for i in range(13)]
d.line(pts, fill=red, width=4)
for p in pts: d.ellipse((p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4), fill=red)
d.text((x0 + 240, y0 - 150), 'deg ~0.08s', font=MARK(24), fill=red)
d.text((480, 290), 'TO DO', font=MARK(36), fill=blk)
for i, t in enumerate(('[x] gearbox oil change', '[ ] wing stands -> paint shop', '[ ] new warmers (2 sets)', '[ ] who took the 10mm')):
    d.text((488, 336 + i * 38), t, font=MARK(28), fill=grn if i == 0 else blk)
d.text((40, 400), "DON'T TOUCH THE DIFF", font=MARK(44), fill=red); d.text((420, 520), '- D.', font=MARK(40), fill=red)
d.line((40, 452, 470, 452), fill=red, width=4)
d.ellipse((60, 480, 170, 560), outline=blu, width=4); d.text((80, 500), 'P3?', font=MARK(32), fill=blu)
save(im, 'whiteboard')

# the great liveries (along the walkway): a car side-on in the scheme, on a dark ground, the team and the year
def car_side(d, x, y, s, body, stripes, wing, num):
    P = lambda pts: [(x + a * s, y + b * s) for a, b in pts]
    d.polygon(P([(0, 60), (40, 48), (120, 44), (150, 30), (200, 26), (240, 30), (300, 44), (340, 50), (348, 70), (0, 74)]), fill=body)   # (the tub, the airbox, the engine cover)
    d.polygon(P([(170, 30), (196, 14), (214, 16), (208, 30)]), fill=(20, 20, 24))   # (the helmet and the roll hoop)
    n = len(stripes); h = 16 / n
    for i, (c, a0, a1) in enumerate(stripes): o = i * h; d.polygon(P([(a0, 50 + o), (a1, 44 + o), (a1, 44 + o + h), (a0, 50 + o + h)]), fill=c)   # (stacked: Martini's three)
    d.rectangle(P([(330, 6), (352, 50)]), fill=wing); d.rectangle(P([(318, 4), (356, 12)]), fill=wing)   # (the rear wing)
    d.rectangle(P([(-14, 66), (40, 74)]), fill=wing)   # (the front wing)
    for wx in (52, 292):
        d.ellipse(P([(wx - 26, 48), (wx + 26, 100)]), fill=(18, 18, 20)); d.ellipse(P([(wx - 12, 62), (wx + 12, 86)]), fill=(150, 150, 156))
    d.ellipse(P([(118, 50), (140, 70)]), fill=(245, 245, 245)); d.text((x + 121 * s, y + 50 * s), num, font=BOLD(int(16 * s)), fill=(20, 20, 20))
GREATS = [('gulf', 'GULFSTREAM RACING', '1971', (143, 200, 232), [((240, 122, 26), 60, 300)], (240, 122, 26), '2'),
          ('jps', 'KOBRA OIL GP', '1978', (12, 12, 14), [((201, 162, 58), 40, 320)], (12, 12, 14), '5'),
          ('martini', 'SILVERLINE', '1979', (244, 244, 242), [((14, 42, 85), 40, 300), ((58, 160, 224), 52, 300), ((208, 32, 42), 64, 300)], (14, 42, 85), '6'),
          ('rothmans', 'RAPID TYRES', '1984', (244, 244, 242), [((14, 42, 85), 100, 260), ((208, 32, 42), 120, 140)], (14, 42, 85), '1')]
for k, team, yr, body, stripes, wing, num in GREATS:
    W, H = 900, 560; im = Image.new('RGB', (W, H), (18, 20, 26)); d = ImageDraw.Draw(im)
    for y in range(H): d.line((0, y, W, y), fill=(18 + y // 40, 20 + y // 40, 28 + y // 30))
    car_side(d, 90, 150, 2.0, body, stripes, wing, num)
    d.line((60, 440, W - 60, 440), fill=(120, 130, 150), width=2)
    f = fit(d, team, DIN(70), W - 260); d.text((60, 452), team, font=f, fill=(240, 240, 236)); d.text((W - 190, 452), yr, font=DIN(70), fill=(150, 170, 200))
    d.text((60, 520), 'THE GREATS', font=BOLD(20), fill=(110, 130, 160))
    save(im, 'great_' + k)

# the roundel for the banners: white on clear (MASK), the factory's mark
W = 512; im = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.ellipse((16, 16, W - 16, W - 16), outline=(255, 255, 255, 255), width=28); d.ellipse((92, 92, W - 92, W - 92), outline=(255, 255, 255, 255), width=10)
f = DIN(150); b = d.textbbox((0, 0), 'SVGP', font=f); d.text(((W - (b[2] - b[0])) / 2 - b[0], (W - (b[3] - b[1])) / 2 - b[1]), 'SVGP', font=f, fill=(255, 255, 255, 255))
save(im, 'roundel')
print('lived art in', OUT)
