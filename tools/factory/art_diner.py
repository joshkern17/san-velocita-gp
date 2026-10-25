# The diner's printed art (tools/factory/diner.py): the neon signs, the menu board, the race posters, the wall of shame,
# the TV's picture, the checker strip. Drawn flat; the grime goes on in Blender.
#   /usr/local/bin/python3 tools/factory/art_diner.py <outdir>   (the system Python with Pillow; diner.py runs it)
import os, sys, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
DIN = lambda s: font('DIN Condensed Bold.ttf', s); CHALK = lambda s: font('Chalkduster.ttf', s); MARK = lambda s: font('MarkerFelt.ttc', s, 1)
SCRIPT = lambda s: font('Brush Script.ttf', s); BLACK = lambda s: font('Arial Black.ttf', s); BOLD = lambda s: font('Arial Bold.ttf', s)
R = random.Random(1955)
def save(im, n): im.save(os.path.join(OUT, 'fa_dn_' + n + '.png'))
def fit(d, t, f, w):
    while d.textbbox((0, 0), t, font=f)[2] > w and f.size > 8: f = font(os.path.basename(f.path), f.size - 2, getattr(f, 'index', 0))
    return f
def centre(d, t, f, W, y, fill, **k):
    b = d.textbbox((0, 0), t, font=f, stroke_width=k.get('stroke_width', 0)); d.text(((W - (b[2] - b[0])) / 2 - b[0], y - b[1]), t, font=f, fill=fill, **k)

# neon: the tubes (a solid core, MASK) on clear; the halo is the light's, not the card's
def neon(name, lines, W, H):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for t, f, col, y in lines:
        f = fit(d, t, f, W - 40); centre(d, t, f, W, y, col + (255,), stroke_width=2, stroke_fill=tuple(min(255, c + 60) for c in col) + (255,))
    save(im, 'neon_' + name)
neon('name', [('PIT STOP', BLACK(150), (255, 40, 30), 10), ('DINER', DIN(130), (60, 170, 255), 175)], 1024, 320)
neon('volta', [('Volta Cola', SCRIPT(170), (255, 40, 40), 20)], 900, 240)
neon('duck', [('BURGER DUCK', DIN(150), (255, 200, 30), 30)], 900, 220)
neon('open', [('OPEN', BLACK(170), (255, 50, 40), 20)], 600, 230)
im = Image.open(os.path.join(OUT, 'fa_dn_neon_open.png')); d = ImageDraw.Draw(im); d.rounded_rectangle((6, 6, 594, 224), 30, outline=(60, 170, 255, 255), width=12); im.save(os.path.join(OUT, 'fa_dn_neon_open.png'))

# the menu: chalk on a blackboard, the dishes named for the trade
W, H = 800, 1000; im = Image.new('RGB', (W, H), (28, 34, 30)); d = ImageDraw.Draw(im)
for _ in range(60): x, y = R.randrange(W), R.randrange(H); d.line((x, y, x + R.randrange(-120, 120), y + R.randrange(-20, 20)), fill=(40, 48, 42), width=R.randrange(6, 24))
centre(d, 'PIT STOP', CHALK(70), W, 30, (240, 240, 230)); centre(d, '~ MENU ~', CHALK(34), W, 112, (230, 200, 120))
ITEMS = [('Parc Fermé Burger', '8.50', 'locked in, no changes'), ('Undercut Fries', '3.00', 'out before you know it'), ('Dirty Air Chili', '5.50', 'hard to follow'),
         ('Blue Flag Pancakes', '6.00', 'let them by'), ('DNF Dog', '4.00', "didn't finish it either"), ('Pit Lane Pie', '4.50', 'slice, 2.4 sec'),
         ('Safety Car Salad', '7.00', 'nobody orders it'), ('Lap 1 Espresso', '2.50', 'all elbows')]
y = 180
for n_, p, sub in ITEMS:
    d.text((50, y), n_, font=CHALK(36), fill=(240, 240, 230)); b = d.textbbox((0, 0), p, font=CHALK(36)); d.text((W - 50 - b[2], y), p, font=CHALK(36), fill=(240, 220, 140))
    d.text((70, y + 46), sub, font=CHALK(22), fill=(170, 190, 175)); y += 96
centre(d, 'NO CREDIT. NOT EVEN FOR DRIVERS.', CHALK(24), W, H - 50, (230, 120, 110))
save(im, 'menu')

# the race posters: '60s / '70s prints, a sun, a car flat out, the circuit and the year
POSTERS = [('SEBRING', '12 HOURS  1970', (238, 200, 120), (200, 70, 40), (30, 50, 90)), ('SPA', 'FRANCORCHAMPS  1968', (180, 210, 220), (30, 90, 60), (200, 40, 40)),
           ('LAGUNA SECA', 'MONTEREY  1975', (250, 220, 170), (220, 120, 40), (40, 60, 110)), ('SUZUKA', 'JAPAN  1987', (240, 240, 235), (200, 30, 40), (20, 20, 30)),
           ('ROAD ATLANTA', 'GEORGIA  1972', (230, 210, 160), (40, 110, 160), (180, 60, 30))]
for k, (name, sub, bg, sun, car) in enumerate(POSTERS):
    W, H = 600, 900; im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    d.ellipse((90, 140, 510, 560), fill=sun)
    for i in range(6): d.rectangle((0, 470 + i * 26, W, 470 + i * 26 + 12), fill=bg)   # (the sun cut into bands)
    d.polygon([(0, 700), (W, 560), (W, 640), (0, 780)], fill=(60, 60, 64))   # (the road, in perspective)
    d.polygon([(150, 640), (420, 586), (470, 604), (470, 626), (170, 686), (130, 676)], fill=car)   # (a car, flat out)
    for wx, wy in ((205, 674), (420, 622)): d.ellipse((wx - 26, wy - 26, wx + 26, wy + 26), fill=(20, 20, 20))
    centre(d, name, fit(d, name, BLACK(110), W - 60), W, 30, (30, 30, 34)); centre(d, sub, DIN(60), W, 800, (30, 30, 34))
    save(im, f'poster{k}')

# the wall of shame: snapshots, a caption in marker under each (the crew's, about the drivers, mostly about you)
SHAME = [('roof', '"it felt fine" - Spa'), ('gravel', 'Turn 1. Lap 1. Again.'), ('fire', 'the 10mm was in there'), ('pit', 'box box box (he did not box)'),
         ('wall', 'new barrier, $8,000'), ('tow', 'free ride home'), ('wing', 'it was like that when I got it'), ('kerb', 'track limits are a suggestion')]
for k, (kind, cap) in enumerate(SHAME):
    W, H = 300, 340; im = Image.new('RGB', (W, H), (238, 236, 228)); d = ImageDraw.Draw(im)
    d.rectangle((16, 16, W - 16, 256), fill=(120, 140, 110) if kind in ('gravel', 'kerb', 'tow') else (90, 100, 110))
    if kind == 'gravel': d.rectangle((16, 160, W - 16, 256), fill=(190, 170, 130))
    if kind == 'kerb':
        for i in range(8): d.rectangle((16 + i * 34, 210, 16 + i * 34 + 17, 236), fill=(220, 30, 30))
    car = [(70, 180), (220, 170), (240, 200), (60, 210)]
    if kind == 'roof': car = [(70, 200), (230, 210), (220, 180), (80, 175)]
    d.polygon(car, fill=(200, 40, 40))
    up = kind == 'roof'   # (wheels and the cockpit: on its roof, the wheels in the air)
    for wx in (95, 205): wy = (165 if up else 212); d.ellipse((wx - 18, wy - 18, wx + 18, wy + 18), fill=(20, 20, 22))
    d.polygon([(130, 205), (175, 203), (165, 225), (138, 226)] if up else [(130, 178), (175, 175), (165, 158), (140, 160)], fill=(30, 30, 34))
    if kind == 'fire':
        for i in range(10): d.ellipse((120 + R.randrange(-40, 40), 120 + R.randrange(-30, 30), 160 + R.randrange(-30, 30), 170), fill=(255, 140 + R.randrange(80), 20))
    if kind == 'wall': d.rectangle((230, 90, 280, 240), fill=(170, 170, 175))
    if kind == 'tow': d.rectangle((180, 130, 280, 200), fill=(230, 190, 40))
    if kind == 'wing': d.rectangle((100, 140, 120, 175), fill=(30, 30, 30)); d.line((110, 140, 170, 120), fill=(30, 30, 30), width=8)
    im2 = im.filter(ImageFilter.GaussianBlur(1.2)); d = ImageDraw.Draw(im2)
    f = fit(d, cap, MARK(30), W - 30); centre(d, cap, f, W, 280, (30, 40, 120))
    save(im2, f'shame{k}')

# the TV: a race, the old broadcast look (the tower, the lap count)
W, H = 512, 384; im = Image.new('RGB', (W, H), (60, 120, 50)); d = ImageDraw.Draw(im)
d.polygon([(0, 260), (W, 180), (W, 260), (0, 340)], fill=(70, 70, 76)); d.rectangle((0, 0, W, 120), fill=(140, 180, 220))
for x, c in ((180, (200, 30, 30)), (300, (30, 90, 200))): d.polygon([(x, 250), (x + 90, 232), (x + 96, 248), (x + 6, 266)], fill=c)
d.rectangle((14, 14, 150, 190), fill=(10, 10, 20)); d.text((22, 18), 'LAP 23/40', font=BOLD(18), fill=(255, 220, 40))
for i, n_ in enumerate(('1 VOLTA', '2 KOBRA', '3 YOU', '4 AZURE', '5 VERDE', '6 NEON')): d.text((22, 46 + i * 23), n_, font=BOLD(17), fill=(255, 255, 255) if i != 2 else (255, 220, 40))
d.text((W - 110, H - 34), 'LIVE', font=BLACK(24), fill=(255, 40, 40))
for y_ in range(0, H, 3): d.line((0, y_, W, y_), fill=(0, 0, 0), width=1) if y_ % 6 == 0 else None
save(im, 'tv')

# the checker strip for the wainscot's top (tiles as it repeats)
im = Image.new('RGB', (64, 32), (240, 240, 236)); d = ImageDraw.Draw(im)
for i in range(4):
    for j in range(2):
        if (i + j) % 2: d.rectangle((i * 16, j * 16, i * 16 + 15, j * 16 + 15), fill=(16, 16, 18))
save(im, 'checker')
print('diner art in', OUT)
