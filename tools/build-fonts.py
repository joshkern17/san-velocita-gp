#!/usr/bin/env python3
"""Build the UI fonts and regenerate css/fonts.css.

  python3 tools/build-fonts.py            (reads fonts from ~/Library/Fonts)
  SV_FONT_DIR=/some/dir python3 tools/build-fonts.py

The design language (docs/DESIGN.md) uses role-named families, so the actual
typefaces can be swapped here without touching any CSS:

  'SV Display'  big titles (GARAGE, SAN VELOCITA)        <- Helvetica Now Display Condensed
  'SV UI'       labels, menu items, HUD readouts         <- Helvetica Now Display Condensed
  'SV Body'     sentences (descriptions, help text)      <- Helvetica Now Display
  'SV Num'      dense data: tables, timing, telemetry    <- Helvetica Now Micro Condensed

Digits are remapped to the fonts' tabular figures (tnum), so timers and speed
readouts don't jitter as they tick. Needs: pip install fonttools brotli

Helvetica Now is a commercial Monotype face: it's embedded in css/fonts.css, so
shipping the game needs a licence that covers app/web embedding.
"""
import base64, os
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser(os.environ.get('SV_FONT_DIR', '~/Library/Fonts'))

# (css family, weight, source file in SRC)
BUILD = [
    ('SV Display', 700, 'HelveticaNowDisplay-CnBd.otf'),
    ('SV Display', 800, 'HelveticaNowDisplay-CnXBd.otf'),
    ('SV UI', 500, 'HelveticaNowDisplay-CnMed.otf'),
    ('SV UI', 700, 'HelveticaNowDisplay-CnBd.otf'),
    ('SV Body', 400, 'HelveticaNowDisplay.otf'),
    ('SV Body', 500, 'HelveticaNowDisplayMedium.otf'),
    ('SV Body', 700, 'HelveticaNowDisplayBold.otf'),
    ('SV Num', 500, 'HelveticaNowMicro-CnMd.otf'),
    ('SV Num', 700, 'HelveticaNowMicro-CnBold.otf'),
]
# Each role is normalised so font-size means the same thing whatever the typeface:
# capital letters are CAP x font-size tall and sit exactly centred in a LINE-high line box
# (no more text riding high in its box). Swap a typeface above and every layout keeps its size.
#   family: (cap height in em, normal line height in em)
ROLE = {'SV Display': (0.80, 1.10), 'SV UI': (0.86, 1.20), 'SV Num': (0.60, 1.00), 'SV Body': (0.69, 1.30)}
# plain/400 text gets the Medium cut (the house weight); 700 is opt-in for titles and hero numbers
ALIAS = [('SV Display', 400, 'SV Display', 700), ('SV UI', 400, 'SV UI', 500), ('SV Num', 400, 'SV Num', 500)]
# fonts kept as-is: the old menu faces are still painted into world textures (signage, liveries)
LEGACY = [('Anton', 400, 'Anton-400'), ('Arimo', 400, 'Arimo-400'), ('Arimo', 700, 'Arimo-700'),
          ('Pirata One', 400, 'PirataOne-400'), ('VT323', 400, 'VT323-400')]

UNICODES = [*range(0x20, 0x7f), *range(0xa0, 0x100), *range(0x2010, 0x2028), 0x2039, 0x203a,
            0x20ac, 0x2122, *range(0x2190, 0x2194), 0x2212, 0x25b2, 0x25b6, 0x25bc, 0x25c0]


def tabular_digits(font):
    """Point 0-9 at the font's tabular figures, so they're the default."""
    gsub = font['GSUB'].table
    lookups = {i for fr in gsub.FeatureList.FeatureRecord if fr.FeatureTag == 'tnum' for i in fr.Feature.LookupListIndex}
    swap = {}
    for i in lookups:
        for st in gsub.LookupList.Lookup[i].SubTable:
            st = getattr(st, 'ExtSubTable', st)
            swap.update(getattr(st, 'mapping', {}))
    if not swap:
        raise SystemExit(f'no tabular figures in {font.reader.file.name}')
    for table in font['cmap'].tables:
        for c in '0123456789':
            g = table.cmap.get(ord(c))
            if g in swap: table.cmap[ord(c)] = swap[g]


def build(family, weight, file):
    font = TTFont(os.path.join(SRC, file))
    tabular_digits(font)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'case']
    opts.name_IDs = []
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    out = os.path.join(ROOT, 'fonts', f"{family.replace(' ', '')}-{weight}.woff2")
    font.flavor = 'woff2'
    font.save(out)
    print(f'  {family} {weight}: {os.path.getsize(out) // 1024} KB')
    return out


def face(family, weight, path):
    data = base64.b64encode(open(path, 'rb').read()).decode()
    metrics = ''
    if family in ROLE:
        cap, line = ROLE[family]
        f = TTFont(path)
        scale = cap / (f['OS/2'].sCapHeight / f['head'].unitsPerEm)
        desc = (line - cap) / 2
        # size-adjust scales the metric overrides too, so they're divided back out
        metrics = (f"size-adjust:{scale * 100:.1f}%;ascent-override:{(cap + desc) / scale * 100:.1f}%;"
                   f"descent-override:{desc / scale * 100:.1f}%;line-gap-override:0%;")
    return (f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};font-display:swap;{metrics}"
            f"src:url(data:font/woff2;base64,{data}) format('woff2');}}")


if __name__ == '__main__':
    for old in os.listdir(os.path.join(ROOT, 'fonts')):
        if old.startswith('SV'): os.remove(os.path.join(ROOT, 'fonts', old))
    built = {(f, w): build(f, w, file) for f, w, file in BUILD}
    faces = [face(f, w, p) for (f, w), p in built.items()]
    faces += [face(f, w, built[(src, sw)]) for f, w, src, sw in ALIAS]
    faces += [face(f, w, os.path.join(ROOT, 'fonts', name + '.woff2')) for f, w, name in LEGACY]
    with open(os.path.join(ROOT, 'css', 'fonts.css'), 'w') as fh:
        fh.write('/* fonts embedded so they always load, even from a cold cache.\n'
                 '   GENERATED by tools/build-fonts.py - edit that, not this. */\n' + '\n'.join(faces) + '\n')
    print('wrote css/fonts.css')
