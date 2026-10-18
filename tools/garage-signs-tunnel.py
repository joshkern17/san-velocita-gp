# The wind tunnel's printed bits (tools/garage-tunnel.py): its signs, the model crate's stencil, the bins' labels, the
# smoke wand's plume. Drawn flat with PIL; the grime goes on in Blender.
#   /usr/local/bin/python3 tools/garage-signs-tunnel.py   -> models/garage/src/stations_gen/art/tn_*.png
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art'); os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s); BOLD = lambda s: font('Arial Bold.ttf', s); MONO = lambda s: font('Courier New Bold.ttf', s)
def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)
def save(im, n): im.save(os.path.join(OUT, n + '.png')); print('wrote', n)

# the test section's sign: TUNNEL 1 and the warning under it
im = Image.new('RGB', (512, 128), (16, 18, 22)); d = ImageDraw.Draw(im)
centered(d, (0, 6, 512, 70), 'WIND TUNNEL 1', BLACK(52), (235, 238, 242))
d.rectangle((0, 78, 512, 128), fill=(230, 180, 20))
centered(d, (0, 80, 512, 126), 'FAN RUNNING: NO ENTRY TO TEST SECTION', BOLD(21), (20, 20, 20))
save(im, 'tn_sign')
# the access door's plate
im = Image.new('RGB', (256, 96), (200, 30, 26)); d = ImageDraw.Draw(im)
centered(d, (0, 4, 256, 50), 'TEST SECTION', BOLD(30), (250, 245, 240)); centered(d, (0, 52, 256, 92), 'LOCK OFF FAN FIRST', BOLD(22), (250, 245, 240))
save(im, 'tn_door')
# the model crate's stencil
im = Image.new('RGB', (512, 160), (150, 118, 76)); d = ImageDraw.Draw(im)
centered(d, (0, 6, 512, 70), 'SVGP AERO  60% MODEL', BLACK(36), (30, 26, 20))
centered(d, (0, 76, 512, 116), 'FRAGILE  -  THIS WAY UP  -  DO NOT STACK', BOLD(22), (30, 26, 20))
centered(d, (0, 118, 512, 156), 'RETURN TO: SVGP TECHNOLOGY CENTRE', MONO(22), (30, 26, 20))
save(im, 'tn_crate')
# the parts rack's bin labels
im = Image.new('RGB', (512, 32), (235, 232, 222)); d = ImageDraw.Draw(im)
for k, t in enumerate(('FW FLAPS', 'ENDPLATES', 'GURNEYS', 'BARGEBRD', 'FLOOR LIPS', 'TUFT TAPE', 'SCREWS M3', 'PRESS TAPS')):
    x = k * 64; d.rectangle((x + 2, 2, x + 61, 29), outline=(60, 60, 60)); centered(d, (x + 3, 4, x + 61, 28), t, BOLD(9), (20, 20, 20))
save(im, 'tn_bins')
# the smoke wand's plume: soft white wisps, its alpha in the image's own (an RGBA PNG)
W, H = 256, 128; m = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(m)
for k in range(5):
    y0 = H / 2 + (k - 2) * 7
    for x in range(0, W, 2):
        t = x / W; y = y0 + math.sin(x / 18 + k) * (3 + 14 * t) + (k - 2) * 10 * t; r = 2 + 9 * t
        dm.ellipse((x - r, y - r * 0.6, x + r, y + r * 0.6), fill=int(150 * (1 - t * 0.7)))
m = m.filter(ImageFilter.GaussianBlur(2.0))
rgba = Image.merge('RGBA', (Image.new('L', (W, H), 235), Image.new('L', (W, H), 240), Image.new('L', (W, H), 245), m))
save(rgba, 'tn_smoke')
