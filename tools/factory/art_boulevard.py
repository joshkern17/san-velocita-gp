# The Factory's Boulevard art (tools/factory/boulevard.py), drawn flat; grime and glow go on in Blender. Run with a Python
# that has Pillow:   /usr/local/bin/python3 tools/factory/art_boulevard.py -> models/garage/src/factory_art/fa_bv_*.png
# the plinths' plaque (a blank the game prints the car on), the Hall of Fame's header, the hanging wayfinding signs and
# the EXIT signs, the team's timeline under the walkway, the sponsors' board
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
BLACK = lambda s: font('Arial Black.ttf', s)
BOLD = lambda s: font('Arial Bold.ttf', s)
REG = lambda s: font('Arial.ttf', s)
def centered(d, box, text, f, fill):
    x0, y0, x1, y1 = box; b = d.textbbox((0, 0), text, font=f); w, h = b[2] - b[0], b[3] - b[1]
    assert w <= x1 - x0 + 1, (text, w, x1 - x0)
    d.text((x0 + (x1 - x0 - w) / 2 - b[0], y0 + (y1 - y0 - h) / 2 - b[1]), text, font=f, fill=fill)
def left(d, x, box_y, text, f, fill, maxw):
    b = d.textbbox((0, 0), text, font=f); assert b[2] - b[0] <= maxw, (text, b[2] - b[0], maxw)
    d.text((x - b[0], box_y - b[1]), text, font=f, fill=fill)
def save(im, n): im.save(os.path.join(OUT, n + '.png')); print('wrote', n)
WHITE, BLUE, GREY = (240, 242, 245), (70, 160, 255), (120, 126, 136)

# the plaque: brushed dark, a blue rule, "reserved" in small caps (the game prints the car over it)
im = Image.new('RGB', (512, 352), (28, 30, 34)); d = ImageDraw.Draw(im)
for y in range(0, 352, 3): d.line((0, y, 512, y), fill=(32 + (y * 7) % 5, 34 + (y * 7) % 5, 38 + (y * 7) % 5))   # (the brushing)
d.rectangle((6, 6, 505, 345), outline=(90, 96, 106), width=3)
d.rectangle((36, 120, 476, 124), fill=BLUE)
centered(d, (36, 60, 476, 112), 'SAN VELOCITA GP', BOLD(30), (150, 156, 166))
centered(d, (36, 150, 476, 200), 'RESERVED', BLACK(44), (110, 116, 126))
centered(d, (36, 214, 476, 250), 'for the next car in the story', REG(24), (110, 116, 126))
save(im, 'fa_bv_plaque')

# the Hall of Fame's header: white on dark, blue rules either side
im = Image.new('RGB', (1024, 128), (16, 18, 22)); d = ImageDraw.Draw(im)
centered(d, (0, 10, 1024, 118), 'HALL OF FAME', BLACK(78), WHITE)
for x0 in (24, 864): d.rectangle((x0, 60, x0 + 136, 66), fill=BLUE)
save(im, 'fa_bv_halloffame')

# hanging wayfinding: dark blades, white words, a blue arrow, a blue rule along the top
ARROWS = {'up': [(0, -1), (0.62, 0), (0.22, 0), (0.22, 1), (-0.22, 1), (-0.22, 0), (-0.62, 0)],
          'left': [(-1, 0), (0, -0.62), (0, -0.22), (1, -0.22), (1, 0.22), (0, 0.22), (0, 0.62)],
          'right': [(1, 0), (0, -0.62), (0, -0.22), (-1, -0.22), (-1, 0.22), (0, 0.22), (0, 0.62)]}
def arrow(d, cx, cy, r, kind, fill):
    d.polygon([(cx + x * r, cy + y * r) for x, y in ARROWS[kind]], fill=fill)
def sign(name, lines, kind, bg=(22, 24, 28), fg=WHITE, ac=BLUE, side='left'):
    im = Image.new('RGB', (768, 192), bg); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 768, 8), fill=ac)
    ax = 96 if side == 'left' else 672
    arrow(d, ax, 100, 52, kind, ac)
    x0 = 190 if side == 'left' else 40
    if len(lines) == 1: left(d, x0, 70, lines[0], BLACK(56), fg, 520)
    else: left(d, x0, 40, lines[0], BLACK(50), fg, 520); left(d, x0, 112, lines[1], BOLD(34), (190, 196, 206), 520)
    save(im, name)
sign('fa_bv_sign_bays_up', ['RACE BAYS', 'AND YOUR OFFICE, UPSTAIRS'], 'up')
sign('fa_bv_sign_exit_left', ['WAY OUT', 'THE ROTUNDA'], 'left')
sign('fa_bv_sign_bays_right', ['RACE BAYS'], 'right', side='right')
sign('fa_bv_sign_tunnel_right', ['WIND TUNNEL', 'TEST SECTION'], 'right', side='right')
sign('fa_bv_sign_halloffame_right', ['HALL OF FAME'], 'right', side='right')
sign('fa_bv_sign_office_left', ['YOUR OFFICE'], 'left')
sign('fa_bv_sign_ops_left', ['RACE OPS'], 'left')
sign('fa_bv_sign_cafe_right', ['CAFE', 'AND SIM SUITE'], 'right', side='right')
sign('fa_bv_sign_stairs_down', ['WAY OUT', 'DOWN THE STAIRS'], 'up')
sign('fa_bv_sign_exit_ahead', ['WAY OUT', 'THE ROTUNDA'], 'up')
sign('fa_bv_sign_halloffame_ahead', ['HALL OF FAME', 'AT THE END'], 'up')

# EXIT: green, the running man through a door, the arrow (a lit box: both faces)
def exit_sign(name, kind):
    im = Image.new('RGB', (384, 128), (14, 150, 64)); d = ImageDraw.Draw(im); W_ = (240, 252, 240)
    d.rectangle((6, 6, 377, 121), outline=W_, width=4)
    d.rectangle((22, 22, 72, 106), outline=W_, width=5)
    d.ellipse((88, 20, 106, 38), fill=W_); d.line((97, 40, 90, 70), fill=W_, width=9)
    d.line((95, 46, 114, 56), fill=W_, width=6); d.line((94, 46, 78, 58), fill=W_, width=6)
    d.line((90, 70, 106, 82), fill=W_, width=7); d.line((106, 82, 104, 104), fill=W_, width=7)
    d.line((90, 70, 80, 88), fill=W_, width=7); d.line((80, 88, 68, 92), fill=W_, width=7)
    centered(d, (130, 14, 300, 114), 'EXIT', BLACK(58), W_)
    arrow(d, 336, 64, 30, kind, W_)
    save(im, name)
exit_sign('fa_bv_exit_left', 'left'); exit_sign('fa_bv_exit_right', 'right'); exit_sign('fa_bv_exit_up', 'up')

# the timeline: the team from a lottery ticket to this, under the walkway's edge (12 x 1.2 m)
W, H = 2400, 240
im = Image.new('RGB', (W, H), (232, 236, 240)); d = ImageDraw.Draw(im)
d.rectangle((0, 112, W, 118), fill=BLUE)
STEPS = [('THE TICKET', 'Won the state lottery.', 'Bought a Civic.'),
         ('THE LOCK-UP', 'Rented a lock-up.', 'Slept in it. Twice.'),
         ('FIRST WIN', "Mom cut it out", 'of the Gazette.'),
         ('THE UNIT', 'Moved into a unit.', 'The roof leaked.'),
         ('THE WORKSHOP', 'A real race shop.', 'A real coffee machine.'),
         ('THIS PLACE', 'A lake. A wind tunnel.', 'Danny wanted a moat.')]
cw = W // len(STEPS)
for i, (t, a, b) in enumerate(STEPS):
    cx = i * cw + cw // 2
    d.ellipse((cx - 16, 99, cx + 16, 131), fill=BLUE, outline=(20, 40, 80), width=3)
    centered(d, (i * cw + 12, 22, (i + 1) * cw - 12, 84), t, BLACK(38), (24, 28, 36))
    centered(d, (i * cw + 12, 142, (i + 1) * cw - 12, 180), a, BOLD(28), (60, 66, 78))
    centered(d, (i * cw + 12, 186, (i + 1) * cw - 12, 224), b, REG(28), (90, 96, 108))
save(im, 'fa_bv_timeline')

# the sponsors' board: the team's partners, two columns on white
SP = ['svgp', 'volta-cola', 'triton-watches', 'gold-coast-airlines', 'apex-energy', 'neon-fm', 'rapid', 'kobra', 'velocita-state-lottery', 'sunrise-insurance']
im = Image.new('RGB', (512, 896), (244, 245, 246)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, 512, 92), fill=(22, 24, 28)); centered(d, (0, 10, 512, 82), 'OUR PARTNERS', BLACK(48), WHITE)
d.rectangle((0, 92, 512, 98), fill=BLUE)
cols, rows = 2, 5; cw_, rh = 512 // cols, (896 - 120) // rows
for k, s in enumerate(SP):
    p = os.path.join(ROOT, 'assets', 'sponsors', s, 'color.webp')
    if not os.path.exists(p): continue
    lg = Image.open(p).convert('RGBA'); r, c = divmod(k, cols)
    sc = min((cw_ - 40) / lg.width, (rh - 36) / lg.height); lg = lg.resize((max(1, int(lg.width * sc)), max(1, int(lg.height * sc))))
    im.paste(lg, (c * cw_ + (cw_ - lg.width) // 2, 112 + r * rh + (rh - lg.height) // 2), lg)
    if c: d.line((cw_, 120 + r * rh, cw_, 112 + (r + 1) * rh - 14), fill=(214, 216, 220), width=2)
save(im, 'fa_bv_sponsors')
