# The sim rig's printed bits (tools/garage-sim.py): the racing game on the CRT, the lap sheet taped to the wall, three
# game boxes, a poster, the PC's front, the wheel's hub. PNGs into models/garage/src/stations_gen/art, sim_ names.
# System python3 (Pillow):   python3 tools/garage-signs-sim.py
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
IMPACT = lambda s: font('Impact.ttf', s)
R = random.Random(98)
save = lambda im, n: im.save(os.path.join(OUT, n + '.png'))

def centered(d, y, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)

# the game on the CRT: a late-90s racer from the cockpit: sky, hills, the track running off in perspective, a car
# ahead, the HUD (lap, position, speed, gear), scanlines
W, H = 256, 192
im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
for y in range(90): d.line([(0, y), (W, y)], fill=(70 + y, 110 + y // 2, 200 - y // 3))
d.polygon([(0, 90), (40, 70), (90, 84), (150, 66), (210, 80), (256, 72), (256, 96), (0, 96)], fill=(70, 96, 60))
d.rectangle([0, 92, W, H], fill=(64, 120, 52))
d.polygon([(110, 92), (146, 92), (240, H), (16, H)], fill=(78, 78, 82))
for k in range(6):   # kerbs and the centre line
    y0 = 92 + (k / 6) ** 1.6 * 100; y1 = 92 + ((k + 0.5) / 6) ** 1.6 * 100
    d.line([(128, y0), (128, y1)], fill=(230, 230, 220), width=1 + k // 2)
    for sx, ex in ((110, 16), (146, 240)):
        t0, t1 = (y0 - 92) / 100, (y1 - 92) / 100
        d.line([(sx + (ex - sx) * t0, y0), (sx + (ex - sx) * t1, y1)], fill=(200, 30, 30) if k % 2 else (235, 235, 235), width=2 + k)
d.rectangle([112, 108, 140, 124], fill=(30, 60, 170)); d.rectangle([108, 120, 144, 128], fill=(20, 20, 24)); d.rectangle([116, 104, 136, 110], fill=(240, 200, 30))
d.rectangle([0, 150, W, H], fill=(18, 18, 22)); d.ellipse([92, 140, 164, 212], outline=(40, 40, 46), width=8)   # (the cockpit, the wheel)
d.text((6, 4), 'LAP 3/10', font=MONO(12), fill=(255, 255, 255)); d.text((6, 18), 'POS 4', font=MONO(12), fill=(255, 220, 60))
d.text((180, 4), '1:32.8', font=MONO(12), fill=(255, 255, 255)); d.text((196, 160), '187', font=IMPACT(22), fill=(255, 210, 40)); d.text((232, 168), 'km/h', font=MONO(9), fill=(230, 230, 230))
d.text((176, 160), '5', font=IMPACT(22), fill=(255, 255, 255))
px = im.load()
for y in range(0, H, 3):   # (scanlines: every third row a quarter darker)
    for x in range(W): r, g, b_ = px[x, y]; px[x, y] = (r * 3 // 4, g * 3 // 4, b_ * 3 // 4)
save(im, 'sim_screen')

# the lap sheet: lined paper, times in biro, the best ringed, a note
im = Image.new('RGB', (160, 220), (242, 240, 228)); d = ImageDraw.Draw(im)
for y in range(30, 220, 16): d.line([(0, y), (160, y)], fill=(170, 190, 220))
d.line([(22, 0), (22, 220)], fill=(220, 140, 140))
d.text((28, 6), 'SIM TIMES', font=MARK(16), fill=(30, 40, 120))
rows = (('MONZA', '1:31.9'), ('MONZA', '1:31.4'), ('SPA', '2:08.7'), ('SUZUKA', '1:47.2'), ('MAPLE R.', '1:22.6'), ('MAPLE R.', '1:22.1'), ('LIME RK', '0:58.9'), ('LIME RK', '0:58.3'), ('ZANDV.', '1:36.0'), ('', ''), ('', ''))
for i, (t, l) in enumerate(rows):
    y = 30 + i * 16; d.text((28, y), t, font=HAND(13), fill=(30, 40, 120)); d.text((104, y), l, font=HAND(13), fill=(30, 40, 120))
d.ellipse([98, 140, 150, 160], outline=(200, 30, 30), width=2)
d.text((28, 190), 'beat 58 flat!!', font=MARK(15), fill=(200, 30, 30))
save(im, 'sim_laps')

# three game boxes (made-up 90s racers): the spines and covers
for k, (title, sub, c1, c2) in enumerate((('GT TOURING', 'CHAMPIONSHIP 2', (20, 40, 110), (230, 190, 30)),
                                          ('RACE SEASON', "'98 EDITION", (150, 20, 20), (240, 240, 240)),
                                          ('OVAL KINGS', 'STOCK CAR SIM', (20, 90, 40), (250, 210, 40)))):
    im = Image.new('RGB', (96, 128), c1); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 95, 127], outline=(10, 10, 10), width=2)
    for i in range(6): d.line([(0, 60 + i * 9), (96, 40 + i * 9)], fill=tuple(min(255, v + 30) for v in c1), width=3)
    centered(d, 8, title, IMPACT(15), c2, 96); centered(d, 28, sub, ARIALB(8), (255, 255, 255), 96)
    d.polygon([(20, 104), (34, 88), (66, 86), (80, 100), (78, 108), (22, 110)], fill=c2); d.ellipse([26, 102, 38, 114], fill=(10, 10, 10)); d.ellipse([62, 102, 74, 114], fill=(10, 10, 10))
    d.rectangle([4, 116, 30, 124], fill=(240, 240, 240)); d.text((6, 116), 'PC CD', font=ARIALB(7), fill=(10, 10, 10))
    save(im, f'sim_box{k}')

# a poster on the wall: a made-up 1990s GP poster
im = Image.new('RGB', (192, 256), (18, 18, 26)); d = ImageDraw.Draw(im)
for i in range(40): d.line([(0, 256 - i * 9), (192, 150 - i * 9)], fill=(40 + i, 20, 20 + i // 2), width=4)
d.polygon([(20, 180), (60, 150), (150, 146), (176, 168), (170, 182), (24, 190)], fill=(220, 30, 30)); d.ellipse([34, 176, 58, 200], fill=(10, 10, 10)); d.ellipse([134, 172, 158, 196], fill=(10, 10, 10))
centered(d, 14, 'SAN VELOCITA', IMPACT(26), (255, 210, 40), 192); centered(d, 46, 'GRAND PRIX', IMPACT(22), (255, 255, 255), 192)
centered(d, 76, 'SEPT 13  1998', ARIALB(13), (230, 230, 230), 192); centered(d, 228, 'TICKETS AT THE GATE', ARIALB(10), (200, 200, 200), 192)
save(im, 'sim_poster')

# the PC tower's front: beige, drive bays, a floppy, the power and turbo buttons, LEDs
im = Image.new('RGB', (64, 128), (196, 188, 166)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 63, 127], outline=(150, 142, 122), width=2)
for i, y in enumerate((10, 26)): d.rectangle([6, y, 57, y + 12], fill=(186, 178, 156), outline=(140, 132, 114)); d.rectangle([10, y + 5, 40, y + 7], fill=(60, 60, 60)) if i == 0 else None
d.rectangle([16, 46, 47, 56], fill=(180, 172, 150), outline=(130, 122, 104)); d.rectangle([20, 50, 43, 52], fill=(40, 40, 40))
d.ellipse([8, 66, 18, 76], fill=(130, 124, 108)); d.rectangle([24, 68, 34, 74], fill=(150, 144, 126)); d.text((38, 66), 'TURBO', font=MONO(6), fill=(90, 86, 76))
d.ellipse([10, 82, 14, 86], fill=(40, 220, 60)); d.ellipse([20, 82, 24, 86], fill=(230, 160, 30))
for y in range(96, 122, 4): d.line([(8, y), (56, y)], fill=(160, 152, 132))
save(im, 'sim_pcfront')

# the wheel's hub: a made-up brand
im = Image.new('RGB', (64, 64), (24, 24, 26)); d = ImageDraw.Draw(im)
d.ellipse([4, 4, 60, 60], fill=(40, 40, 44), outline=(70, 70, 76), width=3); centered(d, 18, 'FORCE', ARIALB(11), (220, 40, 30), 64); centered(d, 32, 'PRO', ARIALB(11), (230, 230, 230), 64)
save(im, 'sim_hub')
# the seat maker's sticker on the back of the shell (a made-up brand), peeling at a corner
im = Image.new('RGB', (128, 64), (230, 230, 226)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 127, 63], fill=(16, 16, 18)); d.rectangle([4, 4, 123, 59], outline=(220, 30, 30), width=3)
centered(d, 8, 'VELOX', IMPACT(30), (240, 240, 236), 128); centered(d, 44, 'COMPETITION SEATS', ARIALB(8), (220, 30, 30), 128)
d.polygon([(110, 0), (128, 0), (128, 18)], fill=(90, 90, 92))
save(im, 'sim_sticker')
print('wrote', OUT)
