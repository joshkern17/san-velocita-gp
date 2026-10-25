# The commercial builder's surfaces (js/housebuild.js buildShops): tiling walls (stucco, brick, split-face block),
# a flat gravel roof, and the storefront atlas (a glass shop bay, a glass door bay, a roll-up service door, a
# supermarket's sliding entrance), drawn at PSX size with light wear (the user's "light grunge, worn in"): a little
# grime up from the ground, dust in the glass corners, scuffs on the kick plates. Writes assets/textures/shop_*.png.
#   /usr/local/bin/python3 tools/props/shoptextures.py
import os, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'textures')
R = random.Random(2026)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()

def noise(im, amt, seed):
    r = random.Random(seed); px = im.load(); W, H = im.size
    for y in range(H):
        for x in range(W):
            v = r.randint(-amt, amt); p = px[x, y]; px[x, y] = tuple(max(0, min(255, c + v)) for c in p[:3])
    return im

def grime_up(im, k, seed):  # dirt rising from the bottom edge (splash-back), blotchy
    W, H = im.size; g = Image.new('L', (W, H), 0); d = ImageDraw.Draw(g)
    for y in range(H):
        t = max(0.0, (y / H - 0.72) / 0.28); d.line([(0, y), (W, y)], fill=int(255 * k * t * t))
    blot = Image.effect_noise((max(2, W // 8), max(2, H // 8)), 70).resize((W, H), Image.BILINEAR).point(lambda v: min(255, v * 2))
    from PIL import ImageChops
    g = ImageChops.multiply(g, blot)
    return Image.composite(Image.new('RGB', (W, H), (64, 56, 46)), im, g)

def tileable_noise_tex(base, var, seed, size=128):
    r = random.Random(seed); im = Image.new('RGB', (size, size), base); px = im.load()
    for y in range(size):
        for x in range(size):
            v = r.randint(-var, var); px[x, y] = tuple(max(0, min(255, c + v)) for c in base)
    return im.filter(ImageFilter.GaussianBlur(0.6))

# ---------------- tiling walls and roof (one tile: 2 m) ----------------
def stucco():
    im = tileable_noise_tex((196, 178, 150), 14, 1)
    noise(im, 6, 2)
    return im

def brick():
    S = 128; im = Image.new('RGB', (S, S), (150, 150, 146)); d = ImageDraw.Draw(im)
    rows, cols = 16, 4   # (~6 cm mortar courses at 2 m a tile: 12.5 cm per course, 50 cm bricks... close enough at PSX size)
    for r in range(rows):
        y0 = r * S // rows; off = (S // cols // 2) if r % 2 else 0
        for c in range(-1, cols + 1):
            x0 = c * S // cols + off; tint = R.randint(-16, 14)
            d.rectangle([x0 + 1, y0 + 1, x0 + S // cols - 1, y0 + S // rows - 1], fill=(150 + tint, 66 + tint // 2, 50 + tint // 3))
    return noise(im, 8, 3)

def block():
    S = 128; im = Image.new('RGB', (S, S), (120, 114, 104)); d = ImageDraw.Draw(im)
    rows, cols = 10, 3
    for r in range(rows):
        y0 = r * S // rows; off = (S // cols // 2) if r % 2 else 0
        for c in range(-1, cols + 1):
            x0 = c * S // cols + off; t = R.randint(-10, 10)
            d.rectangle([x0 + 1, y0 + 1, x0 + S // cols - 1, y0 + S // rows - 1], fill=(176 + t, 164 + t, 142 + t))
    return noise(im, 12, 4)

def roof():
    im = tileable_noise_tex((70, 70, 72), 22, 5)
    return noise(im, 10, 6)

# ---------------- the storefront atlas (512 x 512: four 256 panels) ----------------
BRONZE = (52, 46, 40)
def glass_pane(d, box, seed):
    # dark glass with a soft sky reflection band, a hint of the shelves inside, dust in the lower corners
    x0, y0, x1, y1 = box; r = random.Random(seed)
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0); base = (int(44 + 40 * (1 - t)), int(58 + 46 * (1 - t)), int(70 + 54 * (1 - t)))
        d.line([(x0, y), (x1, y)], fill=base)
    for k in range(3):  # shelves / a display behind the glass
        yy = y0 + int((y1 - y0) * (0.45 + k * 0.16)); d.line([(x0 + 3, yy), (x1 - 3, yy)], fill=(36, 40, 44), width=3)
        for _ in range(6): xx = r.randint(x0 + 4, x1 - 10); d.rectangle([xx, yy - r.randint(4, 12), xx + r.randint(3, 8), yy], fill=r.choice([(120, 60, 50), (60, 90, 120), (150, 140, 90), (70, 110, 70)]))
    d.polygon([(x0, y0 + 10), (x0 + (x1 - x0) * 0.35, y0), (x0 + (x1 - x0) * 0.55, y0), (x0, y0 + (y1 - y0) * 0.55)], fill=(110, 128, 140))  # (a reflection streak)

def storefront(door):
    W = 256; im = Image.new('RGB', (W, W), BRONZE); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 18], fill=(64, 58, 52))                    # (the transom header)
    glass_pane(d, (10, 26, W - 11, 60), 11)                               # (transom glass)
    d.rectangle([0, 62, W - 1, 68], fill=BRONZE)
    if door:
        glass_pane(d, (10, 74, 70, 226), 12); glass_pane(d, (W - 71, 74, W - 11, 226), 13)   # (sidelights)
        d.rectangle([78, 70, W - 79, 250], fill=BRONZE); glass_pane(d, (88, 80, W - 89, 236), 14)  # (the door)
        d.rectangle([92, 150, W - 93, 156], fill=(170, 170, 166))         # (its push bar)
        f = font('Arial Bold.ttf', 11); d.text((W / 2 - 22, 200), 'OPEN', font=f, fill=(220, 60, 50))
    else:
        glass_pane(d, (10, 74, W // 2 - 4, 226), 15); glass_pane(d, (W // 2 + 4, 74, W - 11, 226), 16)
        d.rectangle([W // 2 - 4, 70, W // 2 + 4, 230], fill=BRONZE)
    d.rectangle([0, 230, W - 1, W - 1], fill=(88, 82, 74))                # (the kick plate)
    for _ in range(14): x = R.randint(4, W - 20); d.line([(x, 236 + R.randint(0, 14)), (x + R.randint(4, 16), 238 + R.randint(0, 14))], fill=(70, 64, 58))
    return grime_up(im, 0.25, 21)

def rollup():
    W = 256; im = Image.new('RGB', (W, W), (198, 198, 192)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 14], fill=(110, 108, 104))                  # (the header box)
    for y in range(16, W, 12): d.line([(6, y), (W - 7, y)], fill=(160, 160, 154), width=2)   # (the slats)
    for k in range(5): x = 24 + k * 44; d.rectangle([x, 64, x + 30, 76], fill=(60, 70, 80))   # (a row of little windows)
    d.rectangle([0, 0, 6, W - 1], fill=(130, 128, 122)); d.rectangle([W - 7, 0, W - 1, W - 1], fill=(130, 128, 122))  # (the guides)
    d.rectangle([W // 2 - 10, W - 22, W // 2 + 10, W - 14], fill=(90, 90, 86))  # (the handle)
    return grime_up(noise(im, 6, 22), 0.4, 23)

def entrance():
    W = 256; im = Image.new('RGB', (W, W), (170, 170, 166)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 40], fill=(210, 206, 196))                  # (the canopy fascia)
    for k in range(2):
        x0 = 14 + k * 118; d.rectangle([x0, 48, x0 + 110, W - 6], fill=(150, 150, 146))
        glass_pane(d, (x0 + 6, 54, x0 + 52, W - 12), 31 + k); glass_pane(d, (x0 + 58, 54, x0 + 104, W - 12), 33 + k)
        f = font('Arial Bold.ttf', 12); d.text((x0 + 36, 70), 'ENTER' if k == 0 else 'EXIT', font=f, fill=(240, 240, 236))
    return grime_up(im, 0.2, 35)

def atlas():
    A = Image.new('RGB', (512, 512)); A.paste(storefront(False), (0, 0)); A.paste(storefront(True), (256, 0)); A.paste(rollup(), (0, 256)); A.paste(entrance(), (256, 256)); return A

for name, im in (('shop_stucco', stucco()), ('shop_brick', brick()), ('shop_block', block()), ('shop_roof', roof()), ('shop_front', atlas())):
    im.save(os.path.join(OUT, name + '.png')); print('wrote', name)

# ---------------- for the shop kit's modelled pieces (tools/props/shopkit.py) ----------------
def clay_tile():
    # Spanish barrel tile: rows of rounded tiles, each a light crown and dark gaps, a few weathered darker ones
    S = 128; im = Image.new('RGB', (S, S), (120, 52, 34)); d = ImageDraw.Draw(im)
    rows, cols = 8, 6
    for r in range(rows):
        y0 = r * S // rows; off = (S // cols // 2) if r % 2 else 0
        for c in range(-1, cols + 1):
            x0 = c * S // cols + off; t = R.randint(-18, 14)
            w = S // cols
            for k in range(w):   # (the curve of each tile: light at its crown, dark at its edges)
                f = 1 - abs((k - w / 2) / (w / 2)) ** 1.6
                col = (int(150 + 50 * f + t), int(70 + 30 * f + t // 2), int(46 + 18 * f + t // 3))
                d.line([(x0 + k, y0), (x0 + k, y0 + S // rows - 2)], fill=col)
            d.line([(x0, y0 + S // rows - 2), (x0 + w, y0 + S // rows - 2)], fill=(70, 34, 24), width=2)
    return noise(im, 8, 41)

def awning(base, stripe):
    S = 64; im = Image.new('RGB', (S, S), base); d = ImageDraw.Draw(im)
    if stripe:
        for x in range(0, S, 16): d.rectangle([x, 0, x + 7, S - 1], fill=stripe)
    return noise(im, 7, sum(base))

def sign_face():
    # a blank backlit sign cabinet's face (the game writes the shop's name over it): plastic, a faint inner frame
    W, H = 128, 32; im = Image.new('RGB', (W, H), (236, 232, 222)); d = ImageDraw.Draw(im)
    d.rectangle([2, 2, W - 3, H - 3], outline=(210, 206, 196), width=2)
    return noise(im, 4, 51)

for name, im in (('shop_tile', clay_tile()), ('shop_awning_red', awning((150, 34, 30), None)), ('shop_awning_green', awning((38, 84, 52), (30, 70, 44))),
                 ('shop_awning_blue', awning((30, 58, 110), None)), ('shop_awning_tan', awning((176, 150, 108), (150, 124, 86))), ('shop_signface', sign_face())):
    im.save(os.path.join(OUT, name + '.png')); print('wrote', name)

def price_panel():
    # a gas station's price sign: three grades on a dark panel, red LED digits, white labels
    W, H = 256, 192; im = Image.new('RGB', (W, H), (24, 24, 26)); d = ImageDraw.Draw(im)
    fl, fd = font('Arial Bold.ttf', 20), font('Arial Bold.ttf', 46)
    for k, (grade, p) in enumerate((('UNLEADED', '4.59'), ('PLUS', '4.79'), ('DIESEL', '5.09'))):
        y = 10 + k * 60; d.rectangle([6, y, W - 7, y + 52], outline=(70, 70, 74), width=2)
        d.text((14, y + 16), grade, font=fl, fill=(236, 236, 230)); d.text((136, y + 2), p, font=fd, fill=(255, 54, 40))
    return noise(im, 4, 61)

def ice_label():
    W, H = 128, 64; im = Image.new('RGB', (W, H), (236, 240, 244)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 18], fill=(30, 90, 170)); d.text((34, 20), 'ICE', font=font('Arial Black.ttf', 34), fill=(30, 90, 170))
    return noise(im, 4, 62)

def stained():
    # tall church window glass: leaded panes in deep colours
    W, H = 64, 128; im = Image.new('RGB', (W, H), (40, 40, 50)); d = ImageDraw.Draw(im); r = random.Random(63)
    for y in range(0, H, 16):
        for x in range(0, W, 16): d.rectangle([x + 1, y + 1, x + 14, y + 14], fill=r.choice([(140, 30, 40), (40, 70, 150), (190, 150, 40), (40, 110, 70), (120, 60, 140)]))
    return noise(im, 6, 64)

for name, im in (('shop_price', price_panel()), ('shop_ice', ice_label()), ('shop_stained', stained())):
    im.save(os.path.join(OUT, name + '.png')); print('wrote', name)
