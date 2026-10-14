# Preview sheet: one row per logo folder, color on dark + light, then main / black / white flats.
# python3 tools/sponsors/preview.py <out.jpg> <logo_dir> [<logo_dir> ...]
import sys
from PIL import Image

TW, TH = 400, 200
CELLS = [('color', '#1a1a1a'), ('color', '#efefef'), ('main', '#efefef'), ('black', '#f2c21a'), ('white', '#1d3f7a')]
dirs = sys.argv[2:]
sheet = Image.new('RGB', (TW * len(CELLS), TH * len(dirs)), '#000')
for j, d in enumerate(dirs):
    for i, (name, bg) in enumerate(CELLS):
        im = Image.open(f'{d}/{name}.png')
        im.thumbnail((TW - 24, TH - 24))
        t = Image.new('RGB', (TW, TH), bg)
        t.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2), im)
        sheet.paste(t, (i * TW, j * TH))
sheet.save(sys.argv[1], quality=88)
