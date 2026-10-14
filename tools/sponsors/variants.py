# Sponsor logo variants from one generated logo on flat black.
# python3 tools/sponsors/variants.py <src.png> <out_dir> <#hexcolor> [sil_threshold]
# Writes color.png (cut out, transparent), main.png / black.png / white.png (flat one-color silhouettes),
# all trimmed to the logo with an even margin.
import sys
from PIL import Image, ImageChops, ImageFilter

src, out, hexcol = sys.argv[1], sys.argv[2], sys.argv[3]
SIL_LO = int(sys.argv[4]) if len(sys.argv) > 4 else 45  # brightness where the flat shape starts; neon logos need ~110 to drop the glow
im = Image.open(src).convert('RGB')
W, H = im.size

# Alpha from brightness (screen key): black anywhere, inside letters too, goes clear; glow stays soft.
r, g, b = im.split()
bright = ImageChops.lighter(ImageChops.lighter(r, g), b)
alpha = bright.point(lambda v: min(255, max(0, (v - 6) * 6)))

# Un-premultiply over black so glow keeps its color instead of going muddy.
px, pa = im.load(), alpha.load()
color = Image.new('RGBA', (W, H))
cp = color.load()
for y in range(H):
    for x in range(W):
        a = pa[x, y]
        if a == 0:
            cp[x, y] = (0, 0, 0, 0); continue
        rr, gg, bb = px[x, y]
        k = 255 / a if a < 255 else 1
        cp[x, y] = (min(255, int(rr * k)), min(255, int(gg * k)), min(255, int(bb * k)), a)

# Trim to the logo plus 4% margin.
box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox() or (0, 0, W, H)
m = int(max(box[2] - box[0], box[3] - box[1]) * 0.04)
box = (max(0, box[0] - m), max(0, box[1] - m), min(W, box[2] + m), min(H, box[3] + m))
color = color.crop(box)
color.save(f'{out}/color.png')

# One-color silhouettes from the bright cores only, so neon glow doesn't fatten the lines.
sil = bright.crop(box).point(lambda v: 0 if v < SIL_LO else (255 if v > SIL_LO + 50 else (v - SIL_LO) * 255 // 50))
sil = sil.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))  # close stripe-fill gaps
hexcol = hexcol.lstrip('#')
main = tuple(int(hexcol[i:i + 2], 16) for i in (0, 2, 4))
for name, c in (('main', main), ('black', (17, 17, 20)), ('white', (255, 255, 255))):
    flat = Image.new('RGBA', color.size, c + (0,))
    flat.putalpha(sil)
    flat.save(f'{out}/{name}.png')
print(out, color.size)
