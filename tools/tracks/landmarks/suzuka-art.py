# Printed art for Suzuka's landmarks (tools/tracks/landmarks/suzuka.py): the signs. Drawn small and chunky (PSX:
# nearest-sampled in the game) into models/landmarks/src/suzuka/.
#   /opt/homebrew/bin/python3.13 tools/tracks/landmarks/suzuka-art.py   (a python with PIL)
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'models', 'landmarks', 'src', 'suzuka'); os.makedirs(OUT, exist_ok=True)
FB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
font = lambda p, s: ImageFont.truetype(p, s)


def sign(name, text, W, H, bg, fg, f=FB):
    im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    size = int(H * 0.62)
    while size > 8 and d.textbbox((0, 0), text, font=font(f, size))[2] > W * 0.9: size -= 1
    l, t, r, b = d.textbbox((0, 0), text, font=font(f, size)); d.text(((W - (r - l)) / 2 - l, (H - (b - t)) / 2 - t), text, font=font(f, size), fill=fg)
    im.save(os.path.join(OUT, name + '.png'))


sign('sign_suzuka', 'SUZUKA CIRCUIT', 384, 48, (240, 240, 236), (206, 20, 32))
sign('sign_control', 'RACE CONTROL', 192, 32, (24, 26, 30), (240, 240, 236))
print('art ->', OUT)
