# The pro simulator's and the transporter's printed art (tools/garage-sim2.py, tools/garage-truck.py), drawn flat; the
# grime goes on in Blender. System Python with Pillow: /usr/local/bin/python3 tools/garage-signs-sim2truck.py
#   -> models/garage/src/stations_gen/art/s2_*.png, tk_*.png
import os, math, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s)
BOLD = lambda s: font('Arial Bold.ttf', s)
MONO = lambda s: font('Courier New Bold.ttf', s)
def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)
def save(im, n): im.save(os.path.join(OUT, n + '.png')); print('wrote', n)
R = random.Random(7)

# the wraparound screen: the view from the cockpit going into a fast left-hander at dusk. A panorama 180 degrees wide:
# sky, the far hills, the grandstand, the track running away to a vanishing point, red-white curbs, the nose and wheels
W, H = 1024, 256; im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
for y in range(H):
    t = y / H
    if t < 0.5: c = (int(60 + 140 * t), int(90 + 120 * t), int(150 + 60 * t))
    else: c = (40, 60, 34)
    d.line((0, y, W, y), fill=c)
for x in range(0, W, 4): h = 108 + int(10 * math.sin(x / 47) + 6 * math.sin(x / 13)); d.rectangle((x, h, x + 4, 128), fill=(48, 66, 52))   # (hills)
d.rectangle((560, 104, 760, 126), fill=(110, 112, 120))   # (a grandstand)
for x in range(565, 755, 6): d.rectangle((x, 108, x + 3, 112 + (x % 5)), fill=(R.randint(80, 220), R.randint(60, 200), R.randint(60, 200)))
vx, vy = 470, 128   # (the vanishing point: the road bends left)
d.polygon([(vx - 6, vy), (vx + 6, vy), (W * 0.82, H), (W * 0.18, H)], fill=(58, 60, 64))
for k in range(14):   # (the curbs: alternating red and white, out from the vanishing point)
    t0, t1 = (k / 14) ** 2, ((k + 1) / 14) ** 2
    for side, edge in ((-1, W * 0.18), (1, W * 0.82)):
        xa = vx + side * 6 + (edge - vx - side * 6) * t0; xb = vx + side * 6 + (edge - vx - side * 6) * t1
        ya, yb = vy + (H - vy) * t0, vy + (H - vy) * t1; wd = 4 + 30 * t1
        d.polygon([(xa, ya), (xb, yb), (xb + side * wd, yb), (xa + side * wd * 0.6, ya)], fill=(220, 30, 30) if k % 2 else (235, 235, 235))
d.line((vx, vy + 4, W / 2, H), fill=(230, 230, 230), width=2)   # (the racing line's skid marks, faint)
d.polygon([(W / 2 - 60, H), (W / 2 - 18, H - 46), (W / 2 + 18, H - 46), (W / 2 + 60, H)], fill=(190, 20, 30))   # (the nose)
for s in (-1, 1): d.ellipse((W / 2 + s * 150 - 46, H - 70, W / 2 + s * 150 + 46, H + 30), fill=(18, 18, 20))   # (front wheels)
d.text((W - 180, 8), 'LAP 14  1:41.882', font=MONO(16), fill=(255, 230, 80)); d.text((20, 8), 'P3  +0.412', font=MONO(16), fill=(255, 230, 80))
save(im, 's2_track')

# the engineer's desk screens: telemetry traces (speed, throttle, brake, steer) and the motion platform's status
im = Image.new('RGB', (320, 200), (6, 10, 18)); d = ImageDraw.Draw(im)
d.text((8, 6), 'SIM  RUN 07  SAN VELOCITA', font=MONO(13), fill=(120, 200, 255))
for k, (col, amp, fr) in enumerate(((80, 230, 120), (240, 200, 60), (240, 80, 70), (150, 150, 255))):
    y0 = 40 + k * 40; pts = [(8 + i * 3, y0 + int(amp % 30 * math.sin(i / (6 + k * 2) + k) * 0.6)) for i in range(102)]
    d.line(pts, fill=col, width=2)
save(im, 's2_tele')
im = Image.new('RGB', (320, 200), (8, 12, 10)); d = ImageDraw.Draw(im)
d.text((8, 6), 'MOTION PLATFORM', font=MONO(15), fill=(120, 255, 150))
for k, lab in enumerate(('HEAVE', 'PITCH', 'ROLL', 'YAW', 'SURGE', 'SWAY')):
    y = 36 + k * 26; d.text((10, y), lab, font=MONO(13), fill=(150, 220, 160)); v = 40 + (k * 37) % 90
    d.rectangle((90, y + 2, 90 + 200, y + 14), outline=(60, 120, 70)); d.rectangle((90, y + 2, 90 + 2 * v, y + 14), fill=(80, 200, 110))
save(im, 's2_motion')
im = Image.new('RGB', (128, 128), (230, 190, 20)); d = ImageDraw.Draw(im)
d.ellipse((14, 14, 114, 114), fill=(200, 20, 20)); centered(d, (0, 40, 128, 88), 'STOP', BLACK(26), (255, 255, 255))
save(im, 's2_estop')
im = Image.new('RGB', (256, 64), (20, 22, 26)); d = ImageDraw.Draw(im)
centered(d, (0, 4, 256, 36), 'MOTION ACTIVE', BLACK(22), (255, 60, 40)); centered(d, (0, 36, 256, 60), 'KEEP CLEAR OF PLATFORM', BOLD(15), (240, 200, 40))
save(im, 's2_warn')

# the transporter: the team's script along the trailer (white: the livery tint goes over the panel), the cab's number
# plate, the rear's KEEP CLEAR, the hazard chevrons on the tail lift's edge
im = Image.new('RGB', (1024, 128), (0, 0, 0)); d = ImageDraw.Draw(im)
centered(d, (0, 10, 1024, 90), 'SAN VELOCITA GRAND PRIX', BLACK(62), (255, 255, 255))
centered(d, (0, 90, 1024, 124), 'RACE TEAM  -  TECHNICAL CENTRE  -  LAKESIDE', BOLD(24), (210, 210, 210))
im.putalpha(im.convert('L').point(lambda v: 255 if v > 40 else 0)); save(im, 'tk_script')
im = Image.new('RGB', (256, 56), (245, 200, 30)); d = ImageDraw.Draw(im)
d.rectangle((2, 2, 253, 53), outline=(20, 20, 20), width=3); centered(d, (0, 4, 256, 52), 'SV05 RCE', BLACK(34), (15, 15, 15))
save(im, 'tk_plate')
im = Image.new('RGB', (256, 64), (240, 240, 235)); d = ImageDraw.Draw(im)
centered(d, (0, 4, 256, 60), 'TAIL LIFT - KEEP CLEAR', BLACK(17), (200, 20, 20)); save(im, 'tk_keepclear')
im = Image.new('RGB', (128, 32), (240, 200, 20)); d = ImageDraw.Draw(im)
for x in range(-32, 160, 24): d.polygon([(x, 32), (x + 12, 32), (x + 44, 0), (x + 32, 0)], fill=(15, 15, 15))
save(im, 'tk_chevron')
