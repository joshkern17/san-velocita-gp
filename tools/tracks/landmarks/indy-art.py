# Printed art for the Indianapolis landmarks (tools/tracks/landmarks/indy.py): the scoring pylon's positions, the
# Pagoda's leader board, the garages' doors and signs, the video boards. Drawn small and chunky (PSX: nearest-sampled
# in the game), with system python3 (PIL), into models/landmarks/src/indy/.
#   python3 tools/tracks/landmarks/indy-art.py
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'models', 'landmarks', 'src', 'indy'); os.makedirs(OUT, exist_ok=True)
FB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
font = lambda p, s: ImageFont.truetype(p, s)


def centred(d, box, text, f, fill):
    x0, y0, x1, y1 = box; l, t, r, b = d.textbbox((0, 0), text, font=f)
    d.text(((x0 + x1 - (r - l)) / 2 - l, (y0 + y1 - (b - t)) / 2 - t), text, font=f, fill=fill)


# the scoring pylon: a black board, the positions 1-33 down it, each a car number beside; a lit top with the lap count
def pylon():
    W, H = 64, 768; im = Image.new('RGB', (W, H), (18, 20, 22)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W - 1, 62), fill=(36, 40, 44)); centred(d, (0, 4, W, 30), 'LAP', font(FN, 18), (230, 230, 225))
    centred(d, (0, 28, W, 60), '47', font(FB, 26), (255, 196, 40))
    cars = [3, 12, 2, 10, 27, 26, 9, 60, 5, 28, 15, 18, 30, 7, 20, 11, 14, 21, 8, 45, 51, 4, 6, 77, 29, 48, 59, 19, 98, 23, 24, 33, 66]
    rows = 33; top = 70; step = (H - top - 6) / rows
    for k in range(rows):
        y = top + k * step
        d.rectangle((2, y + 1, W - 3, y + step - 2), fill=(10, 11, 12))
        centred(d, (2, y, 26, y + step), str(k + 1), font(FN, 15), (210, 212, 205))
        centred(d, (28, y, W - 2, y + step), str(cars[k]), font(FB, 16), (255, 255, 250))
    im.save(os.path.join(OUT, 'pylon_face.png'))


# the Pagoda's leader board (the top cab): positions 1-10 with car numbers, the lap at the end
def pagoda_board():
    W, H = 512, 48; im = Image.new('RGB', (W, H), (14, 15, 16)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 70, H - 1), fill=(30, 32, 34)); centred(d, (0, 0, 70, H), 'LAP 47', font(FN, 18), (255, 196, 40))
    cars = [3, 12, 2, 10, 27, 26, 9, 60, 5, 28]
    for k in range(10):
        x = 76 + k * 43.5
        centred(d, (x, 2, x + 40, 20), str(k + 1), font(FN, 14), (200, 202, 196))
        centred(d, (x, 18, x + 40, H - 2), str(cars[k]), font(FB, 22), (255, 255, 250))
    im.save(os.path.join(OUT, 'pagoda_board.png'))


# a sign: white letters on a coloured band
def sign(name, text, W, H, bg, fg=(245, 245, 240), f=FB, size=None):
    im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    size = size or int(H * 0.62)
    while size > 8 and d.textbbox((0, 0), text, font=font(f, size))[2] > W * 0.92: size -= 1
    centred(d, (0, 0, W, H), text, font(f, size), fg)
    im.save(os.path.join(OUT, name + '.png'))


# a garage's roll-up door: white slats, a dark rubber foot, the bay number on a plate above
def door(name, num):
    W, H = 64, 64; im = Image.new('RGB', (W, H), (40, 42, 44)); d = ImageDraw.Draw(im)
    d.rectangle((4, 12, W - 5, H - 1), fill=(214, 214, 206))
    for y in range(14, H - 2, 4): d.line((5, y, W - 6, y), fill=(178, 178, 170))
    d.rectangle((4, H - 3, W - 5, H - 1), fill=(30, 30, 30))
    d.rectangle((22, 2, 42, 10), fill=(232, 120, 24)); centred(d, (22, 1, 42, 11), str(num), font(FB, 9), (255, 255, 255))
    im.save(os.path.join(OUT, name + '.png'))


# a video board: a race picture (two cars on the bricks), a ticker along the bottom
def screen():
    W, H = 128, 72; im = Image.new('RGB', (W, H), (24, 44, 70)); d = ImageDraw.Draw(im)
    d.rectangle((0, 40, W, H), fill=(52, 54, 58)); d.rectangle((0, 46, W, 50), fill=(150, 72, 52))
    for x, c in ((30, (220, 40, 30)), (70, (240, 200, 30))):
        d.polygon([(x, 44), (x + 26, 44), (x + 30, 38), (x + 8, 36)], fill=c); d.ellipse((x + 2, 42, x + 9, 49), fill=(10, 10, 10)); d.ellipse((x + 20, 42, x + 27, 49), fill=(10, 10, 10))
    d.rectangle((0, H - 12, W, H), fill=(12, 12, 14)); centred(d, (0, H - 12, W, H), 'P1 #3   P2 #12   P3 #2', font(FN, 9), (255, 220, 60))
    im.save(os.path.join(OUT, 'screen.png'))


# the victory podium's checkered band
def checker():
    W, H = 64, 16; im = Image.new('RGB', (W, H), (240, 240, 236)); d = ImageDraw.Draw(im)
    for i in range(0, W, 8):
        for j in range(0, H, 8):
            if (i // 8 + j // 8) % 2: d.rectangle((i, j, i + 7, j + 7), fill=(16, 16, 16))
    im.save(os.path.join(OUT, 'checker.png'))


pylon(); pagoda_board(); screen(); checker()
sign('sign_indy', 'INDIANAPOLIS', 256, 32, (20, 70, 64))
sign('sign_gasoline', 'GASOLINE ALLEY', 256, 32, (18, 22, 26), (255, 196, 40))
sign('sign_museum', 'HALL OF FAME MUSEUM', 256, 32, (120, 20, 26))
sign('sign_media', 'MEDIA CENTER', 256, 32, (20, 70, 64))
sign('sign_medical', 'INFIELD CARE CENTER', 256, 32, (180, 30, 30))
sign('sign_suites', 'TOWER TERRACE', 256, 32, (20, 70, 64))
for k in range(4): door(f'door_{k}', [12, 27, 48, 63][k])
print('art ->', OUT)

