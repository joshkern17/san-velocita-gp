# The data room's printed bits (tools/garage-data.py): the laptop's screen, photos and sheets for the cork board, a
# setup sheet on the desk, the radio rack's label strip. Writes data_*.png to models/garage/src/stations_gen/art.
# System python3 (needs Pillow): python3 tools/garage-signs-data.py
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
ARIALB = lambda s: font('Arial Bold.ttf', s); MONO = lambda s: font('Monaco.ttf', s); MARK = lambda s: font('MarkerFelt.ttc', s, 1)
COUR = lambda s: font('Courier.ttc', s, 1)
R = random.Random(31)

# the laptop: a lap's trace over the track map, a sector table (the download)
im = Image.new('RGB', (256, 160), (8, 10, 22)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 255, 12], fill=(30, 40, 110)); d.text((4, 0), 'PI DATALOG  -  LAP 14', font=MONO(10), fill=(220, 220, 240))
pts = [(70 + 52 * math.cos(a) * (1 + 0.25 * math.sin(3 * a)), 86 + 50 * math.sin(a)) for a in [i / 40 * math.tau for i in range(41)]]
for i in range(40): d.line([pts[i], pts[i + 1]], fill=[(60, 220, 90), (240, 210, 60), (240, 70, 60)][(i // 5) % 3], width=3)
for k in range(6):
    y = 22 + k * 20; d.text((140, y), f'S{k % 3 + 1}  {R.randint(28, 36)}.{R.randint(100, 999)}', font=MONO(11), fill=(160, 230, 170) if k == 2 else (200, 205, 220))
im.save(os.path.join(OUT, 'data_laptop.png'))

# photos for the cork board: a car at speed, the team round the car, the trophy; white borders, faded
def photo(name, draw, tint):
    im = Image.new('RGB', (96, 112), (236, 232, 222)); d = ImageDraw.Draw(im)
    ph = Image.new('RGB', (84, 80), tint); pd = ImageDraw.Draw(ph); draw(pd); im.paste(ph, (6, 6))
    im.save(os.path.join(OUT, name + '.png'))
def car(pd):
    pd.rectangle([0, 50, 84, 80], fill=(70, 72, 70)); pd.rectangle([0, 46, 84, 50], fill=(220, 220, 210))
    pd.polygon([(14, 46), (22, 34), (52, 32), (66, 40), (72, 46)], fill=(200, 30, 30)); pd.rectangle([14, 42, 72, 47], fill=(200, 30, 30))
    for x in (24, 62): pd.ellipse([x - 6, 42, x + 6, 54], fill=(20, 20, 20))
    for k in range(6): pd.line([(0, 38 + k * 2), (10, 38 + k * 2)], fill=(150, 160, 170))
def team(pd):
    pd.rectangle([0, 56, 84, 80], fill=(90, 86, 80)); pd.polygon([(20, 56), (28, 44), (58, 44), (68, 56)], fill=(200, 30, 30))
    for k, x in enumerate((10, 22, 36, 50, 64, 76)):
        c = [(30, 40, 90), (200, 30, 30), (30, 40, 90), (220, 220, 220), (30, 40, 90), (200, 30, 30)][k]
        pd.rectangle([x - 4, 26, x + 4, 50], fill=c); pd.ellipse([x - 4, 16, x + 4, 25], fill=(210, 170, 140))
def trophy(pd):
    pd.rectangle([0, 0, 84, 80], fill=(60, 70, 90)); pd.polygon([(30, 20), (54, 20), (50, 44), (34, 44)], fill=(220, 180, 60))
    pd.rectangle([38, 44, 46, 56], fill=(200, 160, 50)); pd.rectangle([30, 56, 54, 62], fill=(90, 60, 30))
    pd.ellipse([22, 22, 32, 34], outline=(220, 180, 60), width=2); pd.ellipse([52, 22, 62, 34], outline=(220, 180, 60), width=2)
photo('data_photo_car', car, (140, 160, 180)); photo('data_photo_team', team, (150, 160, 170)); photo('data_photo_trophy', trophy, (60, 70, 90))

# a setup sheet: the team's form, filled in by hand
im = Image.new('RGB', (160, 224), (238, 236, 228)); d = ImageDraw.Draw(im)
d.rectangle([4, 4, 155, 22], fill=(40, 40, 46)); d.text((8, 6), 'SETUP SHEET  rd 3', font=ARIALB(11), fill=(240, 240, 240))
for k, lab in enumerate(('RIDE F/R', 'SPRINGS', 'BARS', 'CAMBER', 'TOE', 'WING', 'BIAS', 'TYRES')):
    y = 30 + k * 24; d.line([(6, y + 18), (154, y + 18)], fill=(170, 170, 170)); d.text((8, y + 2), lab, font=ARIALB(10), fill=(60, 60, 70))
    d.text((80, y), R.choice(('45 / 52', '850 / 700', 'S / 3', '-2.8 / -2.1', '0 / +1', '+1', '57', 'S/S/M/M')), font=MARK(15), fill=(30, 50, 150))
im.save(os.path.join(OUT, 'data_setup.png'))

# the radio rack's label: a dymo strip
im = Image.new('RGB', (256, 24), (20, 20, 20)); d = ImageDraw.Draw(im)
d.text((6, 3), 'PIT RADIOS  1  2  3  4  5  6', font=MONO(14), fill=(235, 235, 235))
im.save(os.path.join(OUT, 'data_radios.png'))
# the donut box's lid
im = Image.new('RGB', (128, 96), (232, 120, 160)); d = ImageDraw.Draw(im)
d.text((12, 30), 'DUNK-O', font=ARIALB(26), fill=(255, 250, 240)); d.text((22, 62), 'a dozen', font=MARK(16), fill=(120, 30, 60))
im.save(os.path.join(OUT, 'data_donuts.png'))
print('wrote', OUT)
