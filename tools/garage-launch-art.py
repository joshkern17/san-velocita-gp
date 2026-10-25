# The season launch's printed bits (tools/garage-launch.py), drawn flat; the grime goes on in Blender. The backdrop
# and the name cards here are the Blender preview's (the game prints its own from your team and sponsors: the
# LAUNCH_BACKDROP / LAUNCH_NAME hooks); the rest is set dressing: the table's front banner, Danny's signs, the
# reserved seat, the running order taped to the lectern. Writes PNGs to models/garage/src/launch_gen/art.
# Run with a system Python that has Pillow:   python3 tools/garage-launch-art.py [team name] [sponsor-id ...]
import os, sys, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'launch_gen', 'art'); os.makedirs(OUT, exist_ok=True)
SP = os.path.join(ROOT, 'assets', 'sponsors')
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s)
ARIALB = lambda s: font('Arial Bold.ttf', s)
HELV = lambda s: font('HelveticaNeue.ttc', s, 1)   # (bold)
HAND = lambda s: font('Noteworthy.ttc', s, 1)
MARK = lambda s: font('MarkerFelt.ttc', s, 1)
R = random.Random(27)
TEAM = sys.argv[1] if len(sys.argv) > 1 else 'Shuttlecock Motors'
SPONS = sys.argv[2:] or ['sunrise-insurance', 'pinewood-feed-and-seed', 'max-hardware']
MAIN, ACC = (92, 70, 56), (244, 236, 214)   # (the preview's team colours: the game uses yours)


def centered(d, xy, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0] + xy[0], xy[1]), text, font=f, fill=fill)


def logo(sid, w, h, kind='color'):
    p = os.path.join(SP, sid, kind + '.webp')
    if not os.path.exists(p): return None
    im = Image.open(p).convert('RGBA'); im.thumbnail((w, h), Image.LANCZOS); return im


def backdrop():
    # a step-and-repeat: the team's name and the sponsors in a staggered grid on white, a band across the top with the
    # season, a darker band at the bottom where the stage meets it (6.1 x 2.0 m: 1220 x 400 px)
    W, H = 1220, 400; im = Image.new('RGB', (W, H), (238, 236, 230)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 54], fill=MAIN); centered(d, (0, 9), f'{TEAM.upper()}  ·  2027 SEASON LAUNCH', HELV(34), ACC, W)
    tiles = ['team'] + SPONS
    cw, ch = 244, 108   # (three rows, five tiles a row, the odd rows staggered half a tile)
    for r in range(3):
        y = 64 + r * ch
        for c in range(-1, W // cw + 1):
            x = c * cw + (cw // 2 if r % 2 else 0); t = tiles[(c + r * 2) % len(tiles)]
            if t == 'team':   # (the name, as big as fits the tile with a margin)
                for sz in range(30, 11, -1):
                    f = HELV(sz); b = d.textbbox((0, 0), TEAM.upper(), font=f)
                    if b[2] - b[0] <= cw - 40: break
                d.text((x + (cw - (b[2] - b[0])) / 2 - b[0], y + (ch - (b[3] - b[1])) / 2 - b[1]), TEAM.upper(), font=f, fill=MAIN)
            else:
                L = logo(t, cw - 64, ch - 34)
                if L: im.paste(L, (x + (cw - L.width) // 2, y + (ch - L.height) // 2), L)
    d.rectangle([0, H - 14, W, H], fill=(40, 38, 36))
    im.save(os.path.join(OUT, 'backdrop.png'))


def table_banner():
    # the tablecloth's printed front: the team in its colours, the title sponsor beside
    W, H = 512, 160; im = Image.new('RGB', (W, H), MAIN); d = ImageDraw.Draw(im)
    for sz in range(48, 15, -1):   # (as big as fits, a margin each side)
        f = HELV(sz); bb = d.textbbox((0, 0), TEAM.upper(), font=f)
        if bb[2] - bb[0] <= W - 60: break
    centered(d, (0, 26 + (48 - sz) // 2), TEAM.upper(), f, ACC, W)
    L = logo(SPONS[0], 220, 60, 'white')
    if L: im.paste(L, ((W - L.width) // 2, 92), L)
    im.save(os.path.join(OUT, 'table_banner.png'))


def tent(name, who, role):
    # a folded name card on the table: printed in a hurry, the team's line under it
    W, H = 256, 96; im = Image.new('RGB', (W, H), (246, 244, 238)); d = ImageDraw.Draw(im)
    for sz in range(30, 12, -1):   # (as big as fits the card)
        f = ARIALB(sz); bb = d.textbbox((0, 0), who.upper(), font=f)
        if bb[2] - bb[0] <= W - 24: break
    centered(d, (0, 14 + (30 - sz) // 2), who.upper(), f, (24, 24, 24), W); centered(d, (0, 56), role, ARIALB(17), (110, 104, 96), W)
    im.save(os.path.join(OUT, name + '.png'))


def hand_sign(name, lines, size, paper=(246, 242, 228), ink=(30, 30, 60), f=MARK, tape=True, arrow=False):
    # Danny's signs: marker on printer paper (or the back of a pizza box), slightly crooked, tape at the corners
    W, H = size; im = Image.new('RGB', (W, H), paper); d = ImageDraw.Draw(im)
    y = 10
    for t, s in lines:
        ff = f(s); b = d.textbbox((0, 0), t, font=ff); d.text(((W - (b[2] - b[0])) / 2 - b[0] + R.randint(-4, 4), y), t, font=ff, fill=ink); y += int(s * 1.15)
    if arrow:   # (drawn in marker: the font has no arrow)
        ay = y + 14; d.line([(W * 0.3, ay), (W * 0.7, ay)], fill=ink, width=9); d.polygon([(W * 0.7 + 22, ay), (W * 0.7 - 6, ay - 18), (W * 0.7 - 6, ay + 18)], fill=ink)
    if tape:
        for cx, cy in ((10, 8), (W - 34, 6)): d.rectangle([cx, cy, cx + 26, cy + 12], fill=(222, 214, 170))
    im = im.rotate(R.uniform(-1.5, 1.5), resample=Image.BICUBIC, fillcolor=paper)
    im.save(os.path.join(OUT, name + '.png'))


def running_order():
    W, H = 192, 256; im = Image.new('RGB', (W, H), (250, 250, 246)); d = ImageDraw.Draw(im)
    d.text((14, 12), 'RUNNING ORDER', font=ARIALB(16), fill=(20, 20, 20))
    for i, t in enumerate(['1. Welcome', '2. The season', '3. Questions', '4. THE CAR', '5. Photos', '6. Donuts']):
        d.text((16, 46 + i * 30), t, font=HAND(17), fill=(30, 40, 90))
    d.line([(14, 46 + 3 * 30 + 24), (120, 46 + 3 * 30 + 24)], fill=(200, 30, 30), width=2)   # (underlined, twice)
    d.line([(14, 46 + 3 * 30 + 28), (116, 46 + 3 * 30 + 28)], fill=(200, 30, 30), width=2)
    im.save(os.path.join(OUT, 'running_order.png'))


backdrop(); table_banner()
tent('tent_1', 'J. Shuttleworth', 'Owner / Driver'); tent('tent_2', 'G. Gray', 'Co-owner / Driver')
hand_sign('sign_press', [('PRESS', 54), ('THIS WAY', 40)], (320, 190), arrow=True)
hand_sign('sign_reserved', [('RESERVED', 30), ('The Paddock Wire', 22)], (220, 100), f=HAND)
hand_sign('sign_donuts', [('DONUTS', 34), ('ONE EACH', 22), ('(press only)', 16)], (220, 130), paper=(214, 186, 140), ink=(30, 24, 20))
hand_sign('sign_cover', [('DO NOT', 26), ('LIFT', 26)], (150, 90), tape=False)
running_order()
print('launch art ->', OUT)
