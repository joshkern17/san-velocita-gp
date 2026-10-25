# The Factory's structure signs (tools/factory/structure.py), drawn flat. Run with a Python that has Pillow:
#   /usr/local/bin/python3 tools/factory/art_structure.py -> models/garage/src/factory_art/fa_st_*.png
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'factory_art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
BOLD = lambda s: font('Arial Bold.ttf', s)
REG = lambda s: font('Arial.ttf', s)
def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)
def save(im, n): im.save(os.path.join(OUT, n + '.png')); print('wrote', n)
W = (240, 252, 244)
def runner(d, x, y, s=1.0):   # the running man through a door
    d.rectangle((x, y, x + 34 * s, y + 60 * s), outline=W, width=max(2, int(4 * s)))
    d.ellipse((x + 50 * s, y + 2 * s, x + 62 * s, y + 14 * s), fill=W)
    d.line((x + 56 * s, y + 16 * s, x + 50 * s, y + 38 * s), fill=W, width=int(7 * s))
    d.line((x + 54 * s, y + 22 * s, x + 68 * s, y + 30 * s), fill=W, width=int(5 * s)); d.line((x + 53 * s, y + 22 * s, x + 40 * s, y + 30 * s), fill=W, width=int(5 * s))
    d.line((x + 50 * s, y + 38 * s, x + 64 * s, y + 48 * s), fill=W, width=int(6 * s)); d.line((x + 64 * s, y + 48 * s, x + 62 * s, y + 60 * s), fill=W, width=int(6 * s))
    d.line((x + 50 * s, y + 38 * s, x + 42 * s, y + 52 * s), fill=W, width=int(6 * s)); d.line((x + 42 * s, y + 52 * s, x + 30 * s, y + 54 * s), fill=W, width=int(6 * s))

# the exit sign (a lit box: the green face, the running man, EXIT, the arrow)
im = Image.new('RGB', (320, 112), (14, 150, 70)); d = ImageDraw.Draw(im)
d.rectangle((5, 5, 314, 106), outline=W, width=3)
runner(d, 18, 24, 1.05)
centered(d, (110, 18, 250, 94), 'EXIT', BOLD(56), W)
d.polygon([(262, 44), (288, 44), (288, 32), (308, 56), (288, 80), (288, 68), (262, 68)], fill=W)
save(im, 'fa_st_exit')
# the emergency light's little label strip
im = Image.new('RGB', (128, 32), (236, 236, 232)); d = ImageDraw.Draw(im); d.rectangle((0, 22, 128, 32), fill=(20, 150, 70))
centered(d, (0, 0, 128, 22), 'EMERGENCY', BOLD(14), (40, 40, 44)); save(im, 'fa_st_emerg')
# door signs: a frosted white plate, the room's name in the house face, a thin blue line
for key, text in (('office', 'TEAM PRINCIPAL'), ('ops', 'RACE OPERATIONS'), ('cafe', 'PIT STOP DINER'), ('sim', 'SIMULATOR'), ('control', 'TUNNEL CONTROL'),
                  ('machine', 'MACHINE SHOP'), ('composites', 'COMPOSITES'), ('dyno', 'DYNO CELLS'), ('dock', 'LOADING DOCK'), ('tunnel', 'WIND TUNNEL')):
    im = Image.new('RGB', (384, 96), (232, 236, 240)); d = ImageDraw.Draw(im)
    d.rectangle((0, 84, 384, 96), fill=(40, 120, 220))
    centered(d, (10, 10, 374, 78), text, BOLD(34), (34, 38, 46)); save(im, 'fa_st_door_' + key)
# the dock door: KEEP CLEAR, yellow and black
im = Image.new('RGB', (384, 96), (240, 196, 30)); d = ImageDraw.Draw(im)
for k in range(-4, 20): d.polygon([(k * 24, 96), (k * 24 + 12, 96), (k * 24 + 12 + 30, 0), (k * 24 + 30, 0)], fill=(20, 20, 22)) if k % 2 == 0 else None
d.rectangle((40, 18, 344, 78), fill=(240, 196, 30)); centered(d, (40, 18, 344, 78), 'DOOR KEEP CLEAR', BOLD(29), (20, 20, 22)); save(im, 'fa_st_keepclear')
# the dock door's button station
im = Image.new('RGB', (96, 160), (220, 222, 224)); d = ImageDraw.Draw(im)
for k, (c, t) in enumerate((((30, 160, 60), 'OPEN'), ((200, 30, 30), 'STOP'), ((30, 160, 60), 'CLOSE'))):
    y = 18 + k * 46; d.ellipse((12, y, 44, y + 32), fill=c, outline=(40, 40, 40), width=2); d.text((50, y + 8), t, font=BOLD(14), fill=(30, 30, 34))
save(im, 'fa_st_buttons')
# a skylight's frosted panel (cool, a faint grid of the glazing bars' shadow)
im = Image.new('RGB', (64, 64), (210, 226, 240)); d = ImageDraw.Draw(im)
for k in range(0, 64, 16): d.line((k, 0, k, 64), fill=(170, 186, 204), width=2); d.line((0, k, 64, k), fill=(170, 186, 204), width=2)
save(im, 'fa_st_skylight')
