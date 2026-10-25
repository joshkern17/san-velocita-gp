# The street kit's printed faces (tools/props/streetkit.py): road signs, the railroad crossbuck, the guard rail's end
# marker, the pole's tag, the transformer's number, drawn flat at their real proportions and then worn the way
# real ones are (lightly: the user's "light grunge, worn in"): the red sun-faded, fine scratches and speckle, a little
# road dirt up from the bottom edge, the odd sticker. Writes PNGs to models/trackside/src/streetkit_gen/art.
# Run with a Python that has Pillow (streetkit.py runs it):  /usr/local/bin/python3 tools/props/streetsigns.py
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'models', 'trackside', 'src', 'streetkit_gen', 'art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
# (the US sign alphabet, FHWA Series, is a narrow bold sans: Helvetica Condensed Bold is close at this resolution)
HWY = lambda s: font('HelveticaNeue.ttc', s, 4)   # Condensed Bold
ARIALB = lambda s: font('Arial Bold.ttf', s)
R = random.Random(1987)

RED = (178, 22, 30); WHITE = (238, 236, 228); BLACK = (24, 24, 26); YELLOW = (236, 190, 26)


def centered(d, cy, text, f, fill, W, sx=1.0):
    b = d.textbbox((0, 0), text, font=f); d.text(((W - (b[2] - b[0])) / 2 - b[0], cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)


def squeeze_text(text, f, fill, h, w_target):
    # text drawn, then squeezed to w_target wide (the sign alphabet is narrower than any font here)
    b = f.getbbox(text); im = Image.new('RGBA', (b[2] - b[0] + 4, b[3] - b[1] + 4), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((2 - b[0], 2 - b[1]), text, font=f, fill=fill)
    return im.resize((w_target, h), Image.LANCZOS)


def wear(im, fade=0.12, scratch=40, dirt=0.18, seed=0, sticker=False):
    # sun fade (towards a pale pink-grey), speckle and fine scratches, road grime rising from the bottom edge
    r = random.Random(seed); W, H = im.size
    px = im.convert('RGB')
    pale = Image.new('RGB', (W, H), (214, 196, 196))
    px = Image.blend(px, pale, fade)
    d = ImageDraw.Draw(px)
    for _ in range(scratch // 3):  # (a few faint short ones: light wear, not vandalism)
        x = r.uniform(0, W); y = r.uniform(0, H); a = r.uniform(0, math.pi); L = r.uniform(3, 9)
        p0 = px.getpixel((int(x), int(y))); v = r.choice([22, -18])
        d.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], fill=tuple(max(0, min(255, c + v)) for c in p0), width=1)
    for _ in range(int(W * H / 90)):
        x = r.randrange(W); y = r.randrange(H); v = r.randint(-26, 18)
        p = px.getpixel((x, y)); px.putpixel((x, y), tuple(max(0, min(255, c + v)) for c in p))
    # grime: a soft dark gradient up from the bottom, blotchy
    g = Image.new('L', (W, H), 0); gd = ImageDraw.Draw(g)
    for y in range(H):
        t = max(0.0, (y / H - 0.55) / 0.45); gd.line([(0, y), (W, y)], fill=int(255 * dirt * t * t))
    blot = Image.effect_noise((W // 8, H // 8), 60).resize((W, H), Image.BILINEAR)
    g = ImageChops.multiply(g, blot.point(lambda v: min(255, v * 2)))
    px = Image.composite(Image.new('RGB', (W, H), (70, 60, 48)), px, g)
    if sticker:  # a peeling skate / band sticker someone put on it
        sx, sy = r.randint(int(W * 0.15), int(W * 0.55)), r.randint(int(H * 0.62), int(H * 0.75))
        d = ImageDraw.Draw(px); d.rectangle([sx, sy, sx + W // 7, sy + H // 14], fill=(240, 240, 235)); d.rectangle([sx + 3, sy + 3, sx + W // 7 - 3, sy + H // 14 - 3], fill=(30, 90, 170))
    return px


def octagon(cx, cy, r):
    return [(cx + r * math.cos(math.pi / 8 + k * math.pi / 4), cy + r * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]


# STOP (R1-1, 30 in): red octagon, a white border, white STOP. The texture's square holds the octagon flat to flat.
def stop(name, seed, sticker=False):
    W = 256; im = Image.new('RGB', (W, W), RED); d = ImageDraw.Draw(im)
    R0 = W / 2 / math.cos(math.pi / 8)            # (corner radius when flat-to-flat is the full width)
    d.polygon(octagon(W / 2, W / 2, R0 * 0.985), fill=WHITE)
    d.polygon(octagon(W / 2, W / 2, R0 * 0.93), fill=RED)
    t = squeeze_text('STOP', HWY(120), WHITE, 82, 196)
    im.paste(t, ((W - t.width) // 2, (W - t.height) // 2 - 2), t)
    wear(im, fade=0.10 + R.random() * 0.1, seed=seed, sticker=sticker).save(os.path.join(OUT, name + '.png'))


# YIELD (R1-2, 36 in): a downward red triangle, a white triangle inside, red YIELD
def yield_(name, seed):
    W, H = 256, 222; im = Image.new('RGB', (W, H), RED); d = ImageDraw.Draw(im)
    inset = 30; d.polygon([(inset * 1.15, inset * 0.72), (W - inset * 1.15, inset * 0.72), (W / 2, H - inset * 1.3)], fill=WHITE)
    t = squeeze_text('YIELD', HWY(70), RED, 30, 100)   # (in the wide top of the white: 30 px tall it fits inside)
    im.paste(t, ((W - t.width) // 2, 36), t)
    wear(im, fade=0.14, seed=seed).save(os.path.join(OUT, name + '.png'))


# the crossbuck (R15-1): two white blades, RAILROAD / CROSSING in black, a black edge
def crossbuck(name, seed):
    W, H = 512, 128; im = Image.new('RGB', (W, H), WHITE); d = ImageDraw.Draw(im)
    for k, word in enumerate(('RAILROAD', 'CROSSING')):
        y0 = k * 64; d.rectangle([0, y0, W - 1, y0 + 63], outline=BLACK, width=4)
        t = squeeze_text(word, HWY(60), BLACK, 40, 380); im.paste(t, ((W - t.width) // 2, y0 + 12), t)
    wear(im, fade=0.06, scratch=60, seed=seed).save(os.path.join(OUT, name + '.png'))


# the guard rail's end marker (OM-3): yellow and black stripes down to the road
def marker(name, seed):
    W, H = 64, 192; im = Image.new('RGB', (W, H), YELLOW); d = ImageDraw.Draw(im)
    for k in range(-4, 12):
        y = k * 32; d.polygon([(0, y), (W, y - 32), (W, y - 16), (0, y + 16)], fill=BLACK)
    wear(im, fade=0.05, seed=seed).save(os.path.join(OUT, name + '.png'))


# a wooden pole's aluminium tag: a number stamped on it
def pole_tag(name, seed):
    W, H = 64, 96; r = random.Random(seed); im = Image.new('RGB', (W, H), (176, 178, 172)); d = ImageDraw.Draw(im)
    d.rectangle([2, 2, W - 3, H - 3], outline=(110, 112, 108), width=2)
    for k, line in enumerate(('PG&E' if seed % 2 else 'PCWA', str(r.randint(1000, 9999)), str(r.randint(100, 999)))):
        centered(d, 20 + k * 28, line, ARIALB(17 if k else 14), (40, 42, 44), W)
    wear(im, fade=0.0, scratch=30, dirt=0.1, seed=seed).save(os.path.join(OUT, name + '.png'))


# the transformer's kVA number (the big black digits on the can) and its red/white danger sticker
def tx_label(name, kva):
    W, H = 64, 64; im = Image.new('RGB', (W, H), (136, 142, 138)); d = ImageDraw.Draw(im)
    centered(d, 22, kva, ARIALB(30), (22, 22, 22), W)
    d.rectangle([12, 44, 52, 58], fill=WHITE); d.rectangle([12, 44, 52, 49], fill=RED)
    wear(im, fade=0.0, scratch=14, dirt=0.25, seed=len(kva)).save(os.path.join(OUT, name + '.png'))


stop('sk_stop_a', 1); stop('sk_stop_b', 2, sticker=True)
yield_('sk_yield', 3)
crossbuck('sk_crossbuck', 4)
marker('sk_endmark', 5)
pole_tag('sk_poletag_a', 6); pole_tag('sk_poletag_b', 7)
tx_label('sk_txlabel', '25')
print('street signs ->', OUT)
