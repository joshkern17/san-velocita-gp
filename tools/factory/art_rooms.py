# The Factory's rooms' printed art (tools/factory/rooms.py): screens, the season plan, the cafe's menu, the clocks, the
# livery drawings, magazines, notices. Drawn flat; the grime goes on in Blender.
#   /usr/local/bin/python3 tools/factory/art_rooms.py <outdir>   (the system Python with Pillow; rooms.py runs it)
import os, sys, math, random
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s); BOLD = lambda s: font('Arial Bold.ttf', s); ARIAL = lambda s: font('Arial.ttf', s)
MONO = lambda s: font('Courier New Bold.ttf', s); MARK = lambda s: font('MarkerFelt.ttc', s, 1); CHALK = lambda s: font('Chalkboard.ttc', s)
R = random.Random(2006)
def save(im, n): im.save(os.path.join(OUT, 'fa_rm_' + n + '.png'))
def ctext(d, box, t, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), t, font=f)
    while b[2] - b[0] > x1 - x0 and f.size > 7: f = font(os.path.basename(f.path), f.size - 1, getattr(f, 'index', 0)); b = d.textbbox((0, 0), t, font=f)
    d.text((x0 + (x1 - x0 - (b[2] - b[0])) / 2 - b[0], y0 + (y1 - y0 - (b[3] - b[1])) / 2 - b[1]), t, font=f, fill=fill)
BG = (8, 12, 22); GRID = (26, 36, 56); CY_ = (90, 200, 255)

def frame(d, W, H, title):
    d.rectangle((0, 0, W - 1, H - 1), outline=(40, 70, 110), width=2); d.rectangle((0, 0, W, 18), fill=(18, 40, 80))
    d.text((6, 3), title, font=BOLD(11), fill=(200, 230, 255))

# telemetry: speed, throttle, brake over a lap
W, H = 320, 200; im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im); frame(d, W, H, 'TELEMETRY  LAP 23  vs  BEST')
for y in range(30, H, 20): d.line((6, y, W - 6, y), fill=GRID)
def trace(y0, amp, col, f, ph=0.0):
    pts = [(6 + x, y0 - amp * f(x / (W - 12) * math.tau * 2 + ph)) for x in range(0, W - 12, 3)]; d.line(pts, fill=col, width=2)
trace(70, 30, (120, 255, 150), lambda t: math.sin(t) * 0.8 + 0.2 * math.sin(3 * t))
trace(72, 30, (60, 120, 80), lambda t: math.sin(t + 0.1) * 0.8 + 0.2 * math.sin(3 * t + 0.2))
trace(125, 20, (255, 210, 80), lambda t: 1 if math.sin(t * 2) > -0.4 else -1)
trace(170, 16, (255, 90, 80), lambda t: 1 if math.sin(t * 2 + 1.6) > 0.75 else -1)
for i, (t, c) in enumerate((('SPEED', (120, 255, 150)), ('THROTTLE', (255, 210, 80)), ('BRAKE', (255, 90, 80)))): d.text((W - 70, 24 + i * 50), t, font=BOLD(10), fill=c)
save(im, 'tele')
# the timing tower
im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im); frame(d, W, H, 'LIVE TIMING   SESSION Q2')
names = ['YOU', 'MATE', 'RIVERA', 'OKAFOR', 'BRANDT', 'KOVAC', 'SATO', 'DUVAL', 'HALE']
for i, n in enumerate(names):
    y = 24 + i * 19; c = (255, 120, 60) if n in ('YOU', 'MATE') else (210, 220, 235)
    if i % 2: d.rectangle((4, y - 1, W - 4, y + 16), fill=(14, 20, 34))
    d.text((8, y), f'{i + 1:>2}', font=MONO(14), fill=(150, 160, 180)); d.text((40, y), n, font=BOLD(13), fill=c)
    d.text((150, y), f'1:{38 + i // 3}.{R.randint(100, 999)}', font=MONO(14), fill=c); d.text((250, y), f'+{i * 0.137:.3f}' if i else 'LEAD', font=MONO(12), fill=(140, 200, 140))
save(im, 'timing')
# the track map, the sectors coloured, two dots
im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im); frame(d, W, H, 'TRACK  -  SECTORS')
pts = [(160 + 110 * math.cos(a) + 25 * math.cos(3 * a), 108 + 62 * math.sin(a) + 14 * math.sin(2 * a)) for a in [i * math.tau / 90 for i in range(91)]]
for k, col in enumerate(((255, 220, 60), (160, 90, 255), (90, 230, 120))): d.line(pts[k * 30:(k + 1) * 30 + 1], fill=col, width=5)
for i, c in ((12, (255, 120, 60)), (55, (255, 255, 255))): x, y = pts[i]; d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=c)
save(im, 'trackmap')
# the weather radar
im = Image.new('RGB', (W, H), (10, 20, 16)); d = ImageDraw.Draw(im); frame(d, W, H, 'WEATHER  RADAR  +45 MIN')
for k in range(5): d.ellipse((160 - k * 28, 110 - k * 20, 160 + k * 28, 110 + k * 20), outline=(30, 70, 50))
for k in range(26):
    x, y, r = R.randint(30, 300), R.randint(30, 190), R.randint(6, 20); c = R.choice(((40, 160, 60), (60, 200, 70), (220, 210, 40), (220, 90, 40)))
    d.ellipse((x - r, y - r * 0.6, x + r, y + r * 0.6), fill=c)
save(im, 'weather')
# the tunnel's pressure map: a car's outline from above in rainbow, the scale
im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im); frame(d, W, H, 'TUNNEL  RUN 0412  Cp  TOP')
for x in range(40, 280):
    t = (x - 40) / 240; half = 34 * (1 - abs(2 * t - 1) ** 3) + 8
    for y in range(int(105 - half), int(105 + half)):
        v = (math.sin(t * 9) * 0.5 + 0.5) * 0.6 + abs(y - 105) / 80
        c = (int(255 * min(1, v * 1.6)), int(255 * (1 - abs(v - 0.5) * 2)), int(255 * max(0, 1 - v * 1.8)))
        d.point((x, y), fill=c)
for i in range(100): d.line((300, 180 - i * 1.5, 312, 180 - i * 1.5), fill=(int(255 * i / 100), int(255 * (1 - abs(i / 50 - 1))), int(255 * (1 - i / 100))))
save(im, 'cfd')
# the tunnel's run log: force coefficients
im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im); frame(d, W, H, 'RUN LOG')
for i in range(9):
    y = 26 + i * 19; d.text((8, y), f'0{404 + i}', font=MONO(13), fill=(150, 170, 200)); d.text((70, y), f'CL -{3.1 + i * 0.04:.2f}', font=MONO(13), fill=(120, 255, 150))
    d.text((180, y), f'CD {0.92 + (i % 3) * 0.01:.2f}', font=MONO(13), fill=(255, 210, 80))
save(im, 'runlog')
# the sim suite's big screen: the lap, the inputs
W2, H2 = 512, 256; im = Image.new('RGB', (W2, H2), BG); d = ImageDraw.Draw(im); frame(d, W2, H2, 'SIM  -  DRIVER IN LOOP  -  SESSION 3')
ctext(d, (20, 30, 250, 110), '1:37.904', BLACK(46), (255, 255, 255)); ctext(d, (20, 110, 250, 140), 'BEST  -0.212', BOLD(18), (120, 255, 150))
for x0, c in ((280, (255, 210, 80)), (340, (255, 90, 80)), (400, (90, 200, 255))):
    d.rectangle((x0, 40, x0 + 40, 220), outline=(60, 80, 110), width=2); h = R.randint(40, 170); d.rectangle((x0 + 3, 218 - h, x0 + 37, 217), fill=c)
for i, t in enumerate(('THR', 'BRK', 'STR')): d.text((288 + i * 60, 224), t, font=BOLD(14), fill=(200, 210, 230))
pts = [(30 + x, 200 - 40 * (math.sin(x / 26) * 0.5 + 0.5) - 10 * math.sin(x / 7)) for x in range(0, 230, 3)]; d.line(pts, fill=CY_, width=2)
save(im, 'simtele')
# the season plan, on a glass board: months, rounds, tests, marker notes
im = Image.new('RGB', (512, 256), (236, 240, 244)); d = ImageDraw.Draw(im)
ctext(d, (0, 4, 512, 34), 'SEASON PLAN', BLACK(24), (20, 30, 60))
mon = ('MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT')
for i, m in enumerate(mon):
    x = 12 + i * 61; d.line((x, 40, x, 248), fill=(180, 190, 200)); ctext(d, (x, 40, x + 61, 60), m, BOLD(14), (40, 50, 70))
for i in range(8):
    x = 18 + i * 61; d.text((x, 70), f'R{i + 1}', font=MARK(20), fill=(200, 30, 30))
    if i in (1, 4): d.text((x, 104), 'TEST', font=MARK(16), fill=(30, 90, 200))
    if i in (2, 6): d.text((x - 2, 136), 'UPGR.', font=MARK(15), fill=(20, 140, 60))
d.ellipse((380, 64, 440, 100), outline=(200, 30, 30), width=3); d.text((330, 200), 'WIN HERE', font=MARK(22), fill=(200, 30, 30))
d.text((20, 200), 'tunnel: 40 hrs left', font=MARK(18), fill=(30, 30, 30))
save(im, 'season')
# the cafe's menu board
im = Image.new('RGB', (256, 320), (22, 26, 24)); d = ImageDraw.Draw(im)
ctext(d, (0, 8, 256, 44), 'PADDOCK CAFE', BOLD(26), (240, 240, 230))
items = (('FLAT WHITE', '2.20'), ('ESPRESSO', '1.60'), ('BACON ROLL', '3.40'), ('POLE POSITION', '6.90'), ('  (full breakfast)', ''), ('SOUP OF THE DAY', '3.10'),
         ('PIT STOP PASTA', '5.50'), ('ENERGY DRINK', '1.90'), ('CAKE', 'ASK'))
for i, (a, b) in enumerate(items):
    y = 60 + i * 27; d.text((14, y), a, font=CHALK(16), fill=(235, 235, 220)); d.text((200, y), b, font=CHALK(16), fill=(255, 210, 120))
d.text((14, 296), 'no work talk before coffee', font=CHALK(13), fill=(150, 220, 160))
save(im, 'menu')
# clocks: a face each, the city under it
for k, (city, hh, mm) in enumerate((('SAN VELOCITA', 10, 10), ('LONDON', 6, 10), ('TOKYO', 2, 10), ('NEW YORK', 1, 10))):
    S = 128; im = Image.new('RGB', (S, S + 28), (16, 18, 22)); d = ImageDraw.Draw(im)
    d.ellipse((6, 6, S - 6, S - 6), fill=(236, 238, 240), outline=(170, 174, 180), width=4)
    for i in range(12):
        a = i / 12 * math.tau; r0, r1 = 50, 42 if i % 3 == 0 else 46
        d.line((64 + r0 * math.sin(a), 64 - r0 * math.cos(a), 64 + r1 * math.sin(a), 64 - r1 * math.cos(a)), fill=(20, 20, 24), width=3 if i % 3 == 0 else 2)
    ah = (hh % 12 + mm / 60) / 12 * math.tau; am = mm / 60 * math.tau
    d.line((64, 64, 64 + 28 * math.sin(ah), 64 - 28 * math.cos(ah)), fill=(20, 20, 24), width=5); d.line((64, 64, 64 + 42 * math.sin(am), 64 - 42 * math.cos(am)), fill=(20, 20, 24), width=3)
    d.ellipse((60, 60, 68, 68), fill=(220, 40, 30)); ctext(d, (0, S + 2, S, S + 26), city, BOLD(14), (220, 230, 240))
    save(im, f'clock{k}')
# livery drawings: a car side on, its scheme coloured in, the notes round it
for k, (a, b, note) in enumerate((((200, 30, 30), (240, 240, 240), 'SCHEME A - CLASSIC'), ((20, 40, 110), (255, 200, 30), 'SCHEME B - SPONSOR'), ((30, 30, 34), (90, 200, 255), 'SCHEME C - LAUNCH'))):
    im = Image.new('RGB', (256, 160), (244, 242, 236)); d = ImageDraw.Draw(im)
    body = [(20, 108), (40, 86), (110, 80), (140, 62), (180, 62), (214, 84), (238, 92), (240, 110)]
    d.polygon(body, fill=a, outline=(20, 20, 20)); d.polygon([(60, 96), (150, 92), (226, 98), (230, 104), (50, 104)], fill=b)
    for x in (62, 196): d.ellipse((x - 18, 94, x + 18, 130), fill=(30, 30, 30)); d.ellipse((x - 8, 104, x + 8, 120), fill=(180, 180, 180))
    d.text((12, 8), note, font=BOLD(13), fill=(20, 20, 30)); d.text((12, 136), 'v3  - approved?', font=MARK(15), fill=(30, 60, 160)); d.rectangle((2, 2, 253, 157), outline=(150, 150, 150))
    save(im, f'livery{k}')
# magazines
for k, (title, col, bg, line) in enumerate((('GRID WEEKLY', (230, 30, 30), (240, 236, 228), 'THE NEW FACTORY'), ('AERO', (40, 120, 230), (235, 235, 235), 'THE TUNNEL WARS'), ('PIT TALK', (250, 200, 20), (25, 30, 45), 'WHO SIGNS FOR 2008?'))):
    im = Image.new('RGB', (120, 160), bg); d = ImageDraw.Draw(im); d.rectangle((0, 0, 120, 30), fill=col); ctext(d, (4, 2, 116, 28), title, BLACK(18), (255, 255, 255) if k != 2 else (20, 20, 20))
    d.polygon([(14, 110), (30, 92), (70, 86), (104, 100), (108, 112)], fill=(R.randint(40, 220), R.randint(20, 90), R.randint(20, 200)))
    for x in (34, 90): d.ellipse((x - 9, 104, x + 9, 122), fill=(20, 20, 20))
    d.text((6, 38), line, font=BOLD(9), fill=(20, 20, 20) if k != 2 else (240, 240, 240))
    save(im, f'mag{k}')
# notices (corridor, dock): the shift rota, a safety notice, a lost-and-found
im = Image.new('RGB', (192, 256), (246, 244, 236)); d = ImageDraw.Draw(im); ctext(d, (0, 6, 192, 34), 'SHIFT ROTA', BLACK(20), (20, 20, 20))
for i, (a, b) in enumerate((('EARLY', 'Sal, Ruby'), ('LATE', 'Kev, Priya'), ('NIGHT', 'the tunnel'), ('WKND', 'race team'))): d.text((12, 50 + i * 44), a, font=BOLD(16), fill=(30, 30, 30)); d.text((84, 50 + i * 44), b, font=MARK(18), fill=(30, 40, 150))
save(im, 'rota')
im = Image.new('RGB', (192, 256), (250, 210, 40)); d = ImageDraw.Draw(im); ctext(d, (0, 10, 192, 50), 'FORKLIFT', BLACK(26), (20, 20, 20)); ctext(d, (0, 50, 192, 90), 'OPERATING', BLACK(22), (20, 20, 20))
d.polygon([(96, 110), (156, 214), (36, 214)], outline=(20, 20, 20), width=6); ctext(d, (36, 140, 156, 210), '!', BLACK(60), (20, 20, 20)); save(im, 'forklift')
im = Image.new('RGB', (128, 96), (250, 238, 120)); d = ImageDraw.Draw(im)
for i, t in enumerate(('WHO PARKED', 'THE PALLET', 'TRUCK IN', 'THE LANE??')): d.text((6, 4 + i * 22), t, font=MARK(16), fill=(30, 30, 30))
save(im, 'pallet')
# a flight case's stencil
im = Image.new('RGB', (160, 64), (24, 24, 26)); d = ImageDraw.Draw(im); ctext(d, (0, 4, 160, 36), 'SVGP RACE', BLACK(20), (235, 235, 230)); ctext(d, (0, 36, 160, 60), 'FRAGILE  - THIS WAY UP', BOLD(11), (255, 200, 40))
save(im, 'case')
# a team-name roundel for the tire covers / lockers (white on near-white: the team colour goes over it)
im = Image.new('RGB', (128, 128), (235, 235, 235)); d = ImageDraw.Draw(im); d.ellipse((10, 10, 118, 118), outline=(120, 120, 120), width=6); ctext(d, (14, 40, 114, 88), 'SVGP', BLACK(30), (90, 90, 90))
save(im, 'roundel')
print('art ok')
