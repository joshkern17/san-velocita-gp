# Put the picked logos in the game: assets/sponsors/<slug>/{color,main,black,white}.webp, at most 768 px.
# python3 tools/sponsors/install.py <variants_dir> <picks.txt>
#   variants_dir: variants.py output, one folder per option (<slug>-<n>/color.png ...)
#   picks.txt:    one "<slug> <n>" line per sponsor (the picker page's Copy Picks, "slug: n" works too)
import os, sys
from PIL import Image

src, picks = sys.argv[1], sys.argv[2]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sponsors')
for line in open(picks):
    parts = line.replace(':', ' ').split()
    if len(parts) != 2 or not parts[1].isdigit(): continue
    slug, n = parts
    out = os.path.join(root, slug); os.makedirs(out, exist_ok=True)
    for v in ('color', 'main', 'black', 'white'):
        im = Image.open(os.path.join(src, f'{slug}-{n}', f'{v}.png'))
        im.thumbnail((768, 768), Image.LANCZOS)
        # (the full-color one lossy, the flat ones lossless: their edges stay clean)
        if v == 'color': im.save(os.path.join(out, 'color.webp'), 'WEBP', quality=88, method=6)
        else: im.save(os.path.join(out, f'{v}.webp'), 'WEBP', lossless=True, method=6)
    print(slug, n)
