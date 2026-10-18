# The Race Workshop's structure signs (tools/workshop/structure.py), drawn flat; the grime goes on in Blender.
# Run with the system Python (Pillow): python3 tools/workshop/art_structure.py -> models/garage/src/workshop_art/ws_st_*.png
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'workshop_art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s)
ARIALB = lambda s: font('Arial Bold.ttf', s)

def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)

# the fire exit sign: green, a white running man through a door, the arrow, the words
im = Image.new('RGB', (256, 96), (18, 140, 64)); d = ImageDraw.Draw(im)
d.rectangle((6, 6, 249, 89), outline=(240, 250, 240), width=3)
d.rectangle((16, 16, 58, 80), outline=(240, 250, 240), width=4)          # (the door)
W = (240, 250, 240)
d.ellipse((72, 16, 86, 30), fill=W)                                          # (head)
d.line((78, 32, 72, 56), fill=W, width=7)                                    # (body)
d.line((76, 38, 92, 46), fill=W, width=5); d.line((75, 38, 62, 48), fill=W, width=5)   # (arms)
d.line((72, 56, 86, 66), fill=W, width=6); d.line((86, 66, 84, 80), fill=W, width=6)   # (front leg)
d.line((72, 56, 62, 70), fill=W, width=6); d.line((62, 70, 52, 72), fill=W, width=6)   # (back leg)
d.polygon([(104, 40), (124, 40), (124, 30), (142, 48), (124, 66), (124, 56), (104, 56)], fill=W)   # (the arrow)
centered(d, (146, 22, 246, 74), 'EXIT', BLACK(34), W)
im.save(os.path.join(OUT, 'ws_st_exit.png'))

# the dyno room's door: a blue mandatory sign (ear defenders) and the cell's name
im = Image.new('RGB', (256, 160), (246, 246, 242)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 255, 159), outline=(30, 30, 30), width=3)
d.ellipse((14, 20, 104, 110), fill=(20, 80, 170))
d.arc((32, 34, 86, 88), 180, 360, fill=(255, 255, 255), width=7)            # (the headband)
d.rounded_rectangle((26, 58, 44, 92), 6, fill=(255, 255, 255)); d.rounded_rectangle((74, 58, 92, 92), 6, fill=(255, 255, 255))
centered(d, (112, 22, 248, 52), 'ENGINE', BLACK(26), (20, 20, 20))
centered(d, (112, 54, 248, 84), 'TEST CELL', BLACK(22), (20, 20, 20))
d.rectangle((10, 118, 245, 150), fill=(20, 80, 170))
centered(d, (14, 120, 241, 148), 'EAR PROTECTION REQUIRED', ARIALB(15), (255, 255, 255))
im.save(os.path.join(OUT, 'ws_st_dyno_sign.png'))

# the plates on the other doors
for name, text, bg, fg in (('parts', 'PARTS', (24, 40, 92), (255, 255, 255)), ('office', 'OFFICE', (190, 192, 196), (30, 30, 34))):
    im = Image.new('RGB', (192, 56), bg); d = ImageDraw.Draw(im)
    d.rectangle((3, 3, 188, 52), outline=fg, width=2)
    centered(d, (8, 6, 184, 50), text, BLACK(30), fg)
    im.save(os.path.join(OUT, f'ws_st_{name}.png'))

# the roll-up doors' warning, under each control station
im = Image.new('RGB', (256, 80), (250, 205, 20)); d = ImageDraw.Draw(im)
for k in range(-4, 40):
    d.polygon([(k * 16, 0), (k * 16 + 8, 0), (k * 16 - 4, 12), (k * 16 - 12, 12)], fill=(20, 20, 20))
    d.polygon([(k * 16, 68), (k * 16 + 8, 68), (k * 16 - 4, 80), (k * 16 - 12, 80)], fill=(20, 20, 20))
centered(d, (8, 15, 248, 40), 'KEEP CLEAR', BLACK(24), (20, 20, 20))
centered(d, (8, 42, 248, 64), 'AUTOMATIC DOOR', ARIALB(17), (20, 20, 20))
im.save(os.path.join(OUT, 'ws_st_door_warn.png'))

# the control station's legend: up, stop, down beside the buttons
im = Image.new('RGB', (64, 160), (200, 202, 205)); d = ImageDraw.Draw(im)
for k, t in enumerate(('UP', 'STOP', 'DOWN')):
    centered(d, (2, 8 + k * 50, 62, 40 + k * 50), t, ARIALB(15), (25, 25, 28))
im.save(os.path.join(OUT, 'ws_st_control.png'))
print('wrote', OUT)
