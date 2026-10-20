# Printed art for Spa-Francorchamps's landmarks (tools/tracks/landmarks/spa.py): the signs and the old pits' doors.
# Drawn small and chunky (PSX: nearest-sampled in the game), with a python that has PIL, into models/landmarks/src/spa/.
#   /opt/homebrew/bin/python3.13 tools/tracks/landmarks/spa-art.py   (a python with PIL)
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'models', 'landmarks', 'src', 'spa'); os.makedirs(OUT, exist_ok=True)
FB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FS = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
font = lambda p, s: ImageFont.truetype(p, s)


def centred(d, box, text, f, fill):
    x0, y0, x1, y1 = box; l, t, r, b = d.textbbox((0, 0), text, font=f)
    d.text(((x0 + x1 - (r - l)) / 2 - l, (y0 + y1 - (b - t)) / 2 - t), text, font=f, fill=fill)


def sign(name, text, W, H, bg, fg=(245, 245, 240), f=FB, border=None):
    im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    if border: d.rectangle((1, 1, W - 2, H - 2), outline=border, width=2)
    size = int(H * 0.62)
    while size > 8 and d.textbbox((0, 0), text, font=font(f, size))[2] > W * 0.9: size -= 1
    centred(d, (0, 0, W, H), text, font(f, size), fg)
    im.save(os.path.join(OUT, name + '.png'))


# a garage's roll-up door: pale slats, a dark rubber foot, a number plate above
def door(name, num):
    W, H = 64, 64; im = Image.new('RGB', (W, H), (52, 54, 58)); d = ImageDraw.Draw(im)
    d.rectangle((4, 12, W - 5, H - 1), fill=(196, 198, 196))
    for y in range(14, H - 2, 4): d.line((5, y, W - 6, y), fill=(160, 162, 160))
    d.rectangle((4, H - 3, W - 5, H - 1), fill=(30, 30, 30))
    d.rectangle((W // 2 - 9, 2, W // 2 + 9, 10), fill=(200, 30, 36)); centred(d, (W // 2 - 9, 1, W // 2 + 9, 11), str(num), font(FB, 8), (255, 255, 255))
    im.save(os.path.join(OUT, name + '.png'))


sign('sign_spa', 'SPA-FRANCORCHAMPS', 512, 48, (196, 22, 30))
sign('sign_hoteleaurouge', "HÔTEL DE L'EAU ROUGE", 256, 32, (238, 232, 216), fg=(120, 24, 28), f=FS)
sign('sign_eaurouge', 'EAU ROUGE', 256, 48, (24, 26, 30), fg=(220, 40, 44))
sign('sign_douane', 'DOUANE', 128, 32, (236, 230, 214), fg=(30, 40, 70), f=FS, border=(30, 40, 70))
sign('sign_source', 'HÔTEL DE LA SOURCE', 384, 40, (236, 230, 214), fg=(40, 40, 46), f=FS)
for k in range(4): door(f'door_{k}', 41 + k * 7)
print('art ->', OUT)
