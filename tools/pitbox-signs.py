# The race-weekend pit box's printed bits (tools/pitbox-build.py puts them on): the pit board, the parts bins' labels,
# the tire warmers' control box, the sponsor boards (the game's own sponsors, assets/sponsors), the garage rules sign,
# a setup sheet. PNGs into models/garage/src/stations_gen/art, pit_ names. System python3 (Pillow):
#   python3 tools/pitbox-signs.py
import os, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'models', 'garage', 'src', 'stations_gen', 'art')
os.makedirs(OUT, exist_ok=True)
F = '/System/Library/Fonts/'
def font(name, size, index=0):
    for p in (F + name, F + 'Supplemental/' + name):
        if os.path.exists(p): return ImageFont.truetype(p, size, index=index)
    return ImageFont.load_default()
BLACK = lambda s: font('Arial Black.ttf', s); ARIALB = lambda s: font('Arial Bold.ttf', s); MONO = lambda s: font('Monaco.ttf', s)
MARK = lambda s: font('MarkerFelt.ttc', s, 1)
R = random.Random(14)

def centered(d, y, text, f, fill, w):
    b = d.textbbox((0, 0), text, font=f); d.text(((w - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=fill)

def fit(d, text, mk, size, w):   # (the biggest size up to `size` that fits w)
    while size > 8 and d.textbbox((0, 0), text, font=mk(size))[2] > w: size -= 1
    return mk(size)

# the pit board: black slots, white letters (what you'd hold out on the pit wall)
im = Image.new('RGB', (128, 256), (18, 18, 20)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 127, 255], outline=(200, 200, 200), width=5)
for i, t in enumerate(('P3', '+0.8', 'L14', 'PUSH')):
    y = 14 + i * 60; d.rectangle([12, y, 115, y + 50], fill=(8, 8, 8))
    f = fit(d, t, BLACK, 40, 98); centered(d, y + 2, t, f, (250, 250, 240) if i != 3 else (250, 210, 40), 128)
im.save(os.path.join(OUT, 'pit_board.png'))

# the parts bins' label strip
im = Image.new('RGB', (256, 32), (232, 230, 220)); d = ImageDraw.Draw(im)
for i, t in enumerate(('M8 NUTS', 'DZUS', 'CLIPS', 'FUSES')):
    x = i * 64; d.rectangle([x, 0, x + 63, 31], outline=(60, 60, 60), width=2); centered(d, 8, t, ARIALB(12), (20, 20, 20), 64) if False else d.text((x + 6, 8), t, font=ARIALB(12), fill=(20, 20, 20))
im.save(os.path.join(OUT, 'pit_bins.png'))

# the tire warmers' control box: a dial and a temperature per blanket
im = Image.new('RGB', (128, 96), (40, 44, 48)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 127, 95], outline=(16, 16, 18), width=4)
d.text((8, 6), 'WARMERS', font=ARIALB(12), fill=(230, 230, 220))
for i in range(4):
    x, y = 8 + (i % 2) * 60, 26 + (i // 2) * 32
    d.rectangle([x, y, x + 52, y + 24], fill=(8, 22, 10)); d.text((x + 4, y + 4), f'{78 + R.randint(0, 6)}°', font=MONO(14), fill=(90, 255, 120))
im.save(os.path.join(OUT, 'pit_warmer.png'))

# the sponsors' boards on the back wall: four of the game's own (assets/sponsors/<slug>/color.webp) on white
def board(name, slugs, size=(512, 128)):
    W, H = size; im = Image.new('RGB', size, (240, 240, 236)); d = ImageDraw.Draw(im)
    n = len(slugs); cw = W // n
    for i, s in enumerate(slugs):
        p = os.path.join(ROOT, 'assets', 'sponsors', s, 'color.webp')
        if not os.path.exists(p): continue
        lg = Image.open(p).convert('RGBA'); k = min((cw - 16) / lg.width, (H - 20) / lg.height); lg = lg.resize((max(1, int(lg.width * k)), max(1, int(lg.height * k))))
        im.paste(lg, (i * cw + (cw - lg.width) // 2, (H - lg.height) // 2), lg)
        if i: d.line([(i * cw, 10), (i * cw, H - 10)], fill=(200, 200, 196), width=2)
    im.save(os.path.join(OUT, name + '.png'))
board('pit_sponsors_a', ['svgp', 'volta-cola', 'apex-energy', 'neon-fm'])
board('pit_sponsors_b', ['triton-watches', 'rapid', 'gold-coast-airlines', 'kobra'])
# a cola sticker for the fridge
lg = Image.open(os.path.join(ROOT, 'assets', 'sponsors', 'volta-cola', 'color.webp')).convert('RGBA'); bg = Image.new('RGBA', lg.size, (245, 245, 245, 255)); bg.alpha_composite(lg)
bg.convert('RGB').resize((128, int(128 * lg.height / lg.width))).save(os.path.join(OUT, 'pit_cola.png'))

# the garage's rules
im = Image.new('RGB', (256, 96), (236, 236, 230)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 255, 95], outline=(190, 20, 20), width=6); d.rectangle([6, 6, 249, 34], fill=(190, 20, 20))
centered(d, 8, 'GARAGE RULES', BLACK(20), (255, 255, 255), 256)
for i, t in enumerate(('NO SMOKING - FUEL', 'EAR DEFENDERS IN SESSION', 'CREW ONLY BEYOND THIS LINE')): d.text((12, 40 + i * 17), t, font=ARIALB(13), fill=(20, 20, 20))
im.save(os.path.join(OUT, 'pit_rules.png'))

# a setup sheet on a clipboard
im = Image.new('RGB', (96, 128), (238, 236, 228)); d = ImageDraw.Draw(im)
d.text((6, 4), 'SETUP  Q', font=ARIALB(12), fill=(20, 30, 90))
for i in range(9):
    y = 22 + i * 11; d.line([(6, y + 9), (90, y + 9)], fill=(190, 190, 200)); d.text((6, y), R.choice(['FW +1', 'RW 7', 'ARB F 3', 'RH -2', 'PSI 23.5', 'CAMB -3.2', 'TOE 0.1', 'BB 57', 'SPR R 9']), font=MARK(11), fill=(30, 40, 120))
im.save(os.path.join(OUT, 'pit_sheet.png'))
print('wrote', OUT)
