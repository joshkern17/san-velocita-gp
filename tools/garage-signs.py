# The home garage stations' printed and handwritten bits, drawn flat (the grime goes on in Blender, tools/garagelib.py):
# signs, a sticky note, the data room's whiteboard, a dot-matrix printout, the screens. Writes PNGs to
# models/garage/src/stations_gen/art. Run with the system Python (it needs Pillow); tools/garage-stations.py runs it.
#   python3 tools/garage-signs.py
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
HAND = lambda s: font('Noteworthy.ttc', s, 1)
MARK = lambda s: font('MarkerFelt.ttc', s, 1)
MONO = lambda s: font('Monaco.ttf', s)
COUR = lambda s: font('Courier.ttc', s, 1)
R = random.Random(7)


def centered(d, y, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)


def warning(name, head, lines, size=(256, 192), head_fill=(20, 20, 20), bg=(236, 196, 30)):
    W, H = size; im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, H - 1], outline=(20, 20, 20), width=6)
    d.rectangle([10, 10, W - 11, 58], fill=head_fill)
    centered(d, 14, head, BLACK(34), bg, W)
    y = 70
    for t, s in lines:
        centered(d, y, t, ARIALB(s), (20, 20, 20), W); y += s + 8
    im.save(os.path.join(OUT, name + '.png'))


warning('sign_dyno', 'DANGER', [('ENGINE TEST', 30), ('IN PROGRESS', 30), ('EAR DEFENDERS ON', 20)])
warning('sign_weld', 'WARNING', [('WELDING AREA', 28), ("DON'T LOOK", 26), ('AT THE ARC', 26)])
warning('sign_lift', 'CAUTION', [('VEHICLE LIFT', 28), ('NOBODY UNDER IT', 22), ('TILL THE LOCKS CLICK', 18)], bg=(236, 196, 30))
warning('sign_ears', 'NOTICE', [('HEARING', 30), ('PROTECTION', 30), ('PAST THIS POINT', 20)], bg=(40, 110, 200), head_fill=(255, 255, 255))

# Danny's sticky note on the dyno desk
im = Image.new('RGB', (160, 160), (250, 226, 90)); d = ImageDraw.Draw(im)
for i, t in enumerate(("dont rev it", "past 9k again", "seriously", "  - D")):
    d.text((10, 8 + i * 34), t, font=HAND(24), fill=(30, 40, 120))
im = im.rotate(2, fillcolor=(250, 226, 90)); im.save(os.path.join(OUT, 'note_danny.png'))
# a second note: the fab bay
im = Image.new('RGB', (160, 160), (140, 220, 240)); d = ImageDraw.Draw(im)
for i, t in enumerate(("gas bottle", "is nearly out", "ORDER ONE", "")):
    d.text((10, 10 + i * 34), t, font=HAND(24), fill=(20, 20, 20))
im.save(os.path.join(OUT, 'note_gas.png'))

# the whiteboard: a track sketched with its problem corners, the setup changes, lap times, the week
W, H = 768, 384
im = Image.new('RGB', (W, H), (238, 240, 236)); d = ImageDraw.Draw(im)
blue, red, black, green = (30, 60, 170), (190, 30, 30), (25, 25, 25), (20, 120, 50)
pts = []
for i in range(60):
    a = i / 60 * math.tau
    r = 95 + 28 * math.sin(3 * a) + 14 * math.cos(5 * a + 1)
    pts.append((190 + r * math.cos(a) * 1.25, 190 + r * math.sin(a)))
d.line(pts + [pts[0]], fill=black, width=5, joint='curve')
for k, (i, t) in enumerate(((8, 'T3'), (24, 'T7'), (41, 'T11'))):
    x, y = pts[i]; d.ellipse([x - 16, y - 16, x + 16, y + 16], outline=red, width=4); d.text((x + 18, y - 18), t, font=MARK(26), fill=red)
d.text((40, 320), 'T3 - understeer on entry', font=MARK(24), fill=red)
d.text((40, 346), 'T7 - curb kills the rear', font=MARK(24), fill=red)
d.text((420, 18), 'SETUP v4', font=MARK(34), fill=blue)
for i, t in enumerate(('front wing +1', 'rear bar SOFT', 'ride height -2mm', 'brake bias 57 -> 56')):
    d.text((430, 64 + i * 32), '- ' + t, font=MARK(26), fill=blue)
d.text((430, 200), 'LAPS', font=MARK(30), fill=black)
for i, t in enumerate(('1:42.8', '1:42.3', '1:41.9 !!')):
    d.text((440 + i * 104, 238), t, font=MARK(26), fill=green if i == 2 else black)
d.text((430, 290), 'BUY: pads, gloves, COFFEE', font=MARK(24), fill=black)
d.text((430, 326), 'Wed - dyno 9am (D)', font=MARK(24), fill=red)
im.save(os.path.join(OUT, 'whiteboard.png'))

# dot-matrix telemetry printout: tractor-feed holes down the sides, faint green bands, columns of numbers
W, H = 192, 640
im = Image.new('RGB', (W, H), (240, 238, 228)); d = ImageDraw.Draw(im)
for y in range(0, H, 48): d.rectangle([18, y, W - 19, y + 23], fill=(214, 232, 214))
for y in range(8, H, 24):
    for x in (6, W - 12): d.ellipse([x, y, x + 6, y + 6], fill=(150, 150, 140))
d.text((26, 6), 'LAP 14  SECTORS', font=COUR(13), fill=(40, 40, 50))
for i in range(1, 40):
    rpm = 6000 + int(2500 * abs(math.sin(i * 0.37))) + R.randint(-90, 90)
    spd = 80 + int(90 * abs(math.sin(i * 0.21 + 1)))
    d.text((26, 6 + i * 15), f'{i * 50:5d} {rpm:5d} {spd:3d} {R.randint(0, 9)}', font=COUR(12), fill=(55, 55, 70))
im.save(os.path.join(OUT, 'printout.png'))

# screens (the glow's done in Blender): the dyno's power curve, telemetry traces, timing
def screen(name, draw, size=(256, 192), bg=(4, 10, 6)):
    im = Image.new('RGB', size, bg); d = ImageDraw.Draw(im); draw(d, *size)
    for y in range(0, size[1], 3): d.line([(0, y), (size[0], y)], fill=tuple(max(0, c - 3) for c in bg))
    im.save(os.path.join(OUT, name + '.png'))

def dyno(d, W, H):
    g = (40, 200, 90)
    for x in range(20, W, 24): d.line([(x, 20), (x, H - 24)], fill=(10, 40, 18))
    for y in range(20, H - 20, 20): d.line([(20, y), (W - 8, y)], fill=(10, 40, 18))
    pw = [(20 + i * 2.2, H - 30 - 120 * math.sin(min(math.pi * 0.62, i / 100 * math.pi * 0.7)) ** 1.4) for i in range(100)]
    tq = [(20 + i * 2.2, H - 70 - 60 * math.sin(i / 100 * math.pi) ** 0.8) for i in range(100)]
    d.line(pw, fill=g, width=2); d.line(tq, fill=(230, 200, 40), width=2)
    d.text((24, 2), 'PWR 287hp @ 8400', font=MONO(14), fill=g); d.text((150, H - 18), 'RPM x1000', font=MONO(11), fill=(90, 140, 100))
screen('screen_dyno', dyno)

def tele(d, W, H):
    cols = [(60, 220, 90), (240, 70, 60), (90, 160, 255)]
    for k, c in enumerate(cols):
        y0 = 30 + k * 55; pts = [(10 + i * 2.4, y0 + 22 * math.sin(i * (0.11 + k * 0.05) + k) * abs(math.sin(i * 0.03 + k))) for i in range(100)]
        d.line(pts, fill=c, width=2)
    d.text((8, 2), 'SPEED  THROTTLE  BRAKE', font=MONO(12), fill=(160, 200, 170))
screen('screen_tele', tele, bg=(6, 6, 18))

def timing(d, W, H):
    d.text((8, 4), 'POS  CAR  LAST     BEST', font=MONO(12), fill=(240, 200, 60))
    for i in range(9):
        t = 101.9 + i * 0.37 + R.random() * 0.2
        d.text((8, 24 + i * 18), f' {i + 1:2d}  #{R.randint(2, 88):2d}  {int(t // 60)}:{t % 60:06.3f}  {int(t // 60)}:{(t - 0.4) % 60:06.3f}', font=MONO(12), fill=(120, 230, 140) if i == 2 else (200, 210, 200))
screen('screen_timing', timing, bg=(4, 8, 20))

def gauges(d, W, H):
    d.rectangle([0, 0, W - 1, H - 1], outline=(70, 70, 70), width=4)
    for k, (cx, label) in enumerate(((44, 'OIL'), (128, 'WATER'), (212, 'EGT'))):
        d.ellipse([cx - 34, 30, cx + 34, 98], fill=(230, 228, 214), outline=(20, 20, 20), width=4)
        a = math.radians(200 - (40 + k * 45)); d.line([(cx, 64), (cx + 28 * math.cos(a), 64 - 28 * math.sin(a))], fill=(200, 20, 20), width=3)
        d.text((cx - 18, 104), label, font=ARIALB(14), fill=(220, 220, 220))
    for i in range(8): d.ellipse([20 + i * 28, 140, 32 + i * 28, 152], fill=(40, 220, 60) if i < 5 else (220, 160, 30) if i < 7 else (220, 40, 30))
    d.text((20, 162), 'DYNO CONTROL  WB-200', font=ARIALB(12), fill=(180, 180, 180))
screen('panel_gauges', gauges, bg=(46, 50, 54))
print('wrote', OUT)
