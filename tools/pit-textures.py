# The race weekend garages' surfaces (js/pitboxes.js roomMeshes), drawn here in the PSX pack's style (64-128 px,
# 5 bits a channel with an ordered dither, nearest-filtered in the game; they tile): a pro team's garage, not a lock-up.
#   python3 tools/pit-textures.py        -> assets/textures/pit_epoxy.png, pit_panel.png, pit_ceiling.png
# pit_epoxy:   the floor: pale grey epoxy, a fine fleck, faint scuffs (a 1.6 m tile: nothing big that'd repeat)
# pit_panel:   the walls: off-white composite panels, a seam and its fixings at the tile's edge, grubbier low down
# pit_ceiling: the ceiling: pale grey tiles in a grid with a darker seam
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'textures')
R = np.random.default_rng(1105)

def vnoise(n, cell):   # tileable value noise, n x n, cells of `cell` px
    k = n // cell; g = R.random((k, k)); y, x = np.mgrid[0:n, 0:n] / cell
    x0, y0 = x.astype(int) % k, y.astype(int) % k; x1, y1 = (x0 + 1) % k, (y0 + 1) % k; fx, fy = x - np.floor(x), y - np.floor(y)
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0, x0] * (1 - sx) + g[y0, x1] * sx; b = g[y1, x0] * (1 - sx) + g[y1, x1] * sx
    return a * (1 - sy) + b * sy

def fbm(n, cells, w=(0.55, 0.3, 0.15)):
    return sum(wi * vnoise(n, c) for wi, c in zip(w, cells))

def psx(col):
    B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
    h, w = col.shape[:2]; d = B[np.arange(h) % 4][:, np.arange(w) % 4][..., None]
    return np.clip(np.floor(np.clip(col, 0, 1) * 31 + 0.5 + d * 0.8) / 31, 0, 1)

def save(name, col):
    Image.fromarray((psx(col) * 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, name + '.png')); print('wrote', name)

n = 128
# the floor: a cool pale grey, a fine fleck (the epoxy's chips), soft darker patches where it's been walked and rolled
base = np.array([0.66, 0.68, 0.7], np.float32)
fleck = (R.random((n, n)) > 0.93) * (R.random((n, n)) - 0.5) * 0.18
soft = (fbm(n, (64, 32, 16)) - 0.5) * 0.08
col = base[None, None] * (1 + fleck + soft)[..., None]
scuff = np.clip(fbm(n, (32, 16, 8)) - 0.62, 0, 1) * 0.6   # (scuffs: a little warmer and darker)
col = col * (1 - scuff[..., None] * np.array([0.35, 0.37, 0.4]))
save('pit_epoxy', col)

# the walls: off-white panels, one panel a tile (2 m), its seam and four fixings at the edge; dirtier towards the bottom
col = np.ones((n, n, 3), np.float32) * np.array([0.9, 0.9, 0.88], np.float32)
col *= (1 + (fbm(n, (32, 16, 4)) - 0.5) * 0.06)[..., None]
y = np.arange(n)[:, None] / n   # (image row 0 is the tile's top)
col *= (1 - 0.1 * np.clip((y - 0.55) / 0.45, 0, 1) * (0.6 + fbm(n, (16, 8, 4))))[..., None]
for e in (0, n - 1): col[:, e] *= 0.72; col[e, :] *= 0.78
col[:, 1] *= 0.9; col[1, :] *= 0.92
for cx in (5, n - 6):
    for cy in (6, n // 2, n - 7): col[cy - 1:cy + 2, cx - 1:cx + 2] *= 0.6
save('pit_panel', col)

# the ceiling: 0.6 m tiles in a grid (a 1.2 m texture tile holds 2 x 2), the grid darker
m = 64; col = np.ones((m, m, 3), np.float32) * np.array([0.8, 0.81, 0.82], np.float32)
col *= (1 + (fbm(m, (32, 16, 4)) - 0.5) * 0.08)[..., None]
for e in (0, 1, m // 2, m // 2 + 1): col[:, e] *= 0.6; col[e, :] *= 0.6
save('pit_ceiling', col)
