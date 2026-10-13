# Reference models of real circuits (dev only: the models are reference, never shipped). From a circuit model (.glb)
# and the circuit's own build (tracks/real/<id>.json), everything tools/tracks/build.mjs --ref needs to rebuild the
# circuit on the model's road with the model as its scenery:
#   - the model's materials sorted by what they are, from their geometry and texture colour (names are often just
#     "material_23"): road, edge lines, ground (paved / gravel / grass), walls, the rest
#   - the model placed on the track (2D rigid fit of its road onto the centre line, from coarse rotations)
#   - the road as the model has it, every 2 m: centre line (between its edge lines), width, height, camber
#   - its barriers as wall segments, its ground (surface classes 1 m, heights 2 m) for the physics off the road
# usage: python3 tools/tracks/ref/refkit.py <id> <model.glb> [out.json]   (then: node tools/tracks/build.mjs <id> --ref out.json)
import json, sys, struct, io, base64, os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CACHE = os.path.join(ROOT, 'tools', 'tracks', 'cache', 'ref')


def log(*a): print(' ', *a, flush=True)


# ---------- the model: world-space triangles by material, and each material's look ----------
def load_glb(f):
    b = open(f, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + n])
    o = 20 + n; bl = struct.unpack('<I', b[o:o + 4])[0]; BIN = memoryview(b)[o + 8:o + 8 + bl]
    CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def acc(i):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or dt.itemsize * nc
        if stride == dt.itemsize * nc: return np.frombuffer(BIN, dtype=dt, count=a['count'] * nc, offset=start).reshape(a['count'], nc)
        raw = np.frombuffer(BIN, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * nc, offset=start)
        return np.stack([np.frombuffer(raw[k * stride:k * stride + dt.itemsize * nc].tobytes(), dtype=dt) for k in range(a['count'])])

    def local(nd):
        if 'matrix' in nd: return np.array(nd['matrix'], dtype=np.float64).reshape(4, 4).T
        x, y, z, w = nd.get('rotation', [0, 0, 0, 1]); sx, sy, sz = nd.get('scale', [1, 1, 1]); t = nd.get('translation', [0, 0, 0])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4); M[:3, :3] = R * [sx, sy, sz]; M[:3, 3] = t; return M

    mats = g.get('materials', [])
    names = [m.get('name', f'm{i}') + f'#{i}' for i, m in enumerate(mats)]  # (#i: names repeat)
    tris = {}

    def walk(ni, P):
        nd = g['nodes'][ni]; M = P @ local(nd)
        if 'mesh' in nd:
            for p in g['meshes'][nd['mesh']]['primitives']:
                pos = acc(p['attributes']['POSITION']).astype(np.float64); pos = (M[:3, :3] @ pos.T).T + M[:3, 3]
                idx = acc(p['indices']).reshape(-1) if 'indices' in p else np.arange(len(pos))
                tris.setdefault(p.get('material', -1), []).append(pos[idx].reshape(-1, 3, 3).astype(np.float32))
        for c in nd.get('children', []): walk(c, M)
    for r in g['scenes'][g.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    tris = {k: np.concatenate(v) for k, v in tris.items()}

    # each material's colour: its base colour texture's mean (alpha-weighted) times its colour factor; and how
    # see-through it is
    def image_mean(ti):
        try:
            im = g['images'][g['textures'][ti]['source']]
            v = g['bufferViews'][im['bufferView']]; data = bytes(BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
            I = Image.open(io.BytesIO(data)).convert('RGBA'); I.thumbnail((64, 64)); a = np.asarray(I).reshape(-1, 4).astype(float)
            w = a[:, 3] / 255; return (a[:, :3] * w[:, None]).sum(0) / max(w.sum(), 1e-6), w.mean()
        except Exception: return None, 1.0
    look = {}
    for i, m in enumerate(mats):
        pb = m.get('pbrMetallicRoughness', {}); f = np.array(pb.get('baseColorFactor', [1, 1, 1, 1]))
        col, alpha = (None, 1.0)
        if 'baseColorTexture' in pb: col, alpha = image_mean(pb['baseColorTexture']['index'])
        col = (col if col is not None else np.array([255.0, 255, 255])) * f[:3]
        look[i] = {'rgb': col, 'alpha': alpha * f[3], 'blend': m.get('alphaMode', 'OPAQUE') != 'OPAQUE', 'name': names[i]}
    look[-1] = {'rgb': np.array([200.0, 200, 200]), 'alpha': 1, 'blend': False, 'name': 'none'}
    return tris, look


def hue(rgb):
    r, g, b = rgb; v = max(rgb); mn = min(rgb); sat = (v - mn) / max(v, 1)
    return v, sat, r, g, b


def colour_class(rgb):
    # (tuned on Spa's model, whose materials have names to check against: its grass textures are olive, not green;
    # its gravel light and a little warm; kerbs, painted runoff and tyre walls strongly coloured)
    v, sat, r, g, b = hue(rgb)
    if v > 175 and sat < 0.2 and g <= r * 1.08: return 'white'  # (not a pale green: painted runoff isn't a line)
    if sat > 0.42: return 'paint'
    if g > r * 1.03 and g > b * 1.1 and sat > 0.12: return 'green'
    if abs(r - g) < 14 and b < g * 0.82 and v < 135 and sat > 0.18: return 'green'  # (olive: dry or shaded grass)
    if v >= 140 and r >= b + 10 and 0.08 <= sat <= 0.38: return 'tan'
    if sat < 0.14: return 'grey'
    return 'other'


# ---------- geometry helpers ----------
def tri_normals(t):
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]); a = np.linalg.norm(n, axis=1); return n / np.maximum(a, 1e-9)[:, None], a / 2


class Near:  # nearest of a set of 2D points: brute force for a few thousand, a grid of buckets beyond that
    def __init__(s, D, cell=4.0):
        s.D = np.asarray(D, float); s.big = len(s.D) > 6000; s.cell = cell
        if s.big:
            g = np.floor(s.D / cell).astype(np.int64); s.lo = g.min(0); g -= s.lo; s.dims = g.max(0) + 1
            key = g[:, 1] * s.dims[0] + g[:, 0]; o = np.argsort(key, kind='stable'); s.order = o; ks = key[o]
            s.start = np.searchsorted(ks, np.arange(s.dims[0] * s.dims[1])); s.end = np.searchsorted(ks, np.arange(s.dims[0] * s.dims[1]), side='right')
    def query(s, X):
        X = np.asarray(X, float)
        if not s.big:
            d = np.empty(len(X)); j = np.empty(len(X), int)
            for a in range(0, len(X), 1500):
                Q = X[a:a + 1500]; M = ((Q[:, None, :] - s.D[None]) ** 2).sum(-1); k = M.argmin(1); j[a:a + 1500] = k; d[a:a + 1500] = np.sqrt(M[np.arange(len(Q)), k])
            return d, j
        d = np.full(len(X), np.inf); j = np.zeros(len(X), int)
        g = np.floor(X / s.cell).astype(np.int64) - s.lo
        for i in range(len(X)):
            gx, gz = g[i]
            for r in range(0, 64):  # (rings of buckets outwards until the nearest found can't be beaten)
                if r and d[i] <= (r - 1) * s.cell: break
                for bz in range(gz - r, gz + r + 1):
                    if bz < 0 or bz >= s.dims[1]: continue
                    for bx in ((gx - r, gx + r) if (bz != gz - r and bz != gz + r and r) else range(gx - r, gx + r + 1)):
                        if bx < 0 or bx >= s.dims[0]: continue
                        k = bz * s.dims[0] + bx; a, b = s.start[k], s.end[k]
                        if a == b: continue
                        idx = s.order[a:b]; dd = ((s.D[idx] - X[i]) ** 2).sum(1); m = dd.argmin()
                        if dd[m] < d[i] ** 2: d[i] = np.sqrt(dd[m]); j[i] = idx[m]
                if r > 0 and gx - r < 0 and gz - r < 0 and gx + r >= s.dims[0] and gz + r >= s.dims[1]: break
        return d, j


def dense_line(track, step=2.0):
    P = np.array([[p['x'], p['z']] for p in track['points']]); D = []
    n = len(P); segs = n - 1 if track.get('open') else n
    for i in range(segs):
        a, b = P[i], P[(i + 1) % n]; k = max(1, int(np.hypot(*(b - a)) / step)); D += [a + (b - a) * j / k for j in range(k)]
    return np.array(D)


# ---------- 1. which materials are the road, and where the model sits on the track ----------
def fit(S, D, tree, R0, it=40, trim=0.8):
    Rm, tv = R0.copy(), D.mean(0) - S.mean(0) @ R0.T
    for _ in range(it):
        X = S @ Rm.T + tv; d, j = tree.query(X); keep = d <= np.quantile(d, trim)
        a, b = S[keep], D[j[keep]]; ma, mb = a.mean(0), b.mean(0); U, _, Vt = np.linalg.svd((a - ma).T @ (b - mb)); Rn = (U @ Vt).T
        if np.linalg.det(Rn) * np.linalg.det(R0) < 0: Vt[-1] *= -1; Rn = (U @ Vt).T
        Rm, tv = Rn, mb - ma @ Rn.T
    d, _ = tree.query(S @ Rm.T + tv); return Rm, tv, float(np.median(d))


def fit_lap(D, M, tree, R0, t0, it=30, trim=0.9):
    # our points D onto the model's road points M (tree: Near(M)): the rigid move (rotation, shift) of D that puts it
    # nearest M; the model can have far more road than D (other layouts, car parks) and none of that counts against
    # a fit. Returns the model -> track transform (Rm, tv), how much of D ends up within 4 m of M, and the median.
    G, g = R0.copy(), t0.copy()  # (track -> model)
    for _ in range(it):
        X = D @ G.T + g; d, j = tree.query(X); keep = d <= np.quantile(d, trim)
        if keep.sum() < 10: break
        a, b = D[keep], M[j[keep]]; ma, mb = a.mean(0), b.mean(0); U, _, Vt = np.linalg.svd((a - ma).T @ (b - mb)); Gn = (U @ Vt).T
        if np.linalg.det(Gn) * np.linalg.det(R0) < 0: Vt[-1] *= -1; Gn = (U @ Vt).T
        if not np.all(np.isfinite(Gn)): break
        G, g = Gn, mb - ma @ Gn.T
    d, _ = tree.query(D @ G.T + g)
    Rm = np.linalg.inv(G); tv = -g @ Rm.T  # (model -> track)
    return Rm, tv, float(np.mean(d < 4)), float(np.median(d))


def align(tris, look, D, anchors=None):
    # the model's road candidates: mostly level, grey, big enough, spread over hundreds of metres
    cand = []
    for k, t in tris.items():
        n, a = tri_normals(t); lvl = a[np.abs(n[:, 1]) > 0.9].sum() / max(a.sum(), 1e-9)
        ext = np.ptp(t.reshape(-1, 3)[:, [0, 2]], axis=0).max() if len(t) else 0
        if lvl > 0.85 and a.sum() > 2000 and ext > 300 and colour_class(look[k]['rgb']) in ('grey', 'other') and hue(look[k]['rgb'])[0] < 170: cand.append(k)
    pts = np.concatenate([tris[k].mean(1)[:, [0, 2]] for k in cand]).astype(np.float64)
    rng = np.random.default_rng(1); S = pts[rng.choice(len(pts), min(3000, len(pts)), replace=False)]
    tree = Near(D); cands = []
    # (each way round scored by how much of the lap has the model's road along it, not how near the model's road is
    # to the lap on average: a near-symmetric layout fits nearly as well turned round)
    Dk = D[::3]
    def cover(Rm, tv): return float(np.mean(Near(S @ Rm.T + tv).query(Dk)[0] < 5))
    for mirror in (1, -1):
        for deg in range(0, 360, 10):
            th = np.radians(deg); R0 = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.diag([1, mirror])
            Rm, tv, med = fit(S, D, tree, R0, it=20)
            cands.append((cover(Rm, tv), -med, Rm, tv))
    cands.sort(key=lambda c: (round(c[0], 2), c[1]), reverse=True)
    Rm, tv = cands[0][2], cands[0][3]
    # ... and the other way of placing it: our lap moved onto the model's road (where the model has several layouts on
    # the same ground, an oval's other half, car parks, none of that pulls the lap off). Whichever puts more of the lap
    # on the model's road wins.
    Mall = pts[rng.choice(len(pts), min(25000, len(pts)), replace=False)]; mtall = Near(Mall)
    on_road = lambda Rm, tv: float(np.mean(mtall.query(Dk @ np.linalg.inv(Rm).T - tv @ np.linalg.inv(Rm).T)[0] < 4))
    lapc = []
    for mirror in (1, -1):
        for deg in range(0, 360, 15):
            th = np.radians(deg); R0 = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]) @ np.diag([1, mirror])
            R2, t2, c2, m2 = fit_lap(Dk, Mall, mtall, R0, Mall.mean(0) - Dk.mean(0) @ R0.T, it=20)
            if np.all(np.isfinite(R2)): lapc.append((c2, -m2, R2, t2))
    lapc.sort(key=lambda c: (round(c[0], 2), c[1]), reverse=True)
    G0 = np.linalg.inv(lapc[0][2]); g0 = -lapc[0][3] @ G0.T
    R2, t2, c2, m2 = fit_lap(D.astype(np.float64), Mall, mtall, G0, g0, it=40, trim=0.95)
    c1 = on_road(Rm, tv)
    log(f'placing: fitting the model to the lap puts {c1 * 100:.0f}% of the lap on its road, fitting the lap to the model {c2 * 100:.0f}%')
    if c2 > c1 + 0.02: Rm, tv = R2, t2
    # refined on the materials that really are the road (most of each near the line, together covering the lap)
    for _ in range(2):
        road = []
        for k in cand:
            c = tris[k].mean(1)[:, [0, 2]] @ Rm.T + tv; c = c[::max(1, len(c) // 4000)]
            d, j = tree.query(c); near = np.mean(d < 12); covk = len(np.unique(j[d < 8])) / len(D)
            if (near > 0.7 and covk > 0.03) or (near > 0.3 and covk > 0.15): road.append(k)
        if not road: raise SystemExit('  no material follows the circuit: is the outline the layout the model has?')
        S2 = np.concatenate([tris[k].mean(1)[:, [0, 2]] for k in road]).astype(np.float64)
        d2, _ = tree.query((S2[::max(1, len(S2) // 20000)]) @ Rm.T + tv); S2 = S2[::max(1, len(S2) // 20000)][d2 < 15]
        S2 = S2[rng.choice(len(S2), min(4000, len(S2)), replace=False)]
        if c2 <= c1 + 0.02: Rm, tv, med = fit(S2, D, tree, Rm, it=40, trim=0.9)
    M = np.concatenate([tris[k].mean(1)[:, [0, 2]] for k in road]).astype(np.float64); M = M[rng.choice(len(M), min(20000, len(M)), replace=False)]
    mt = Near(M); G0 = np.linalg.inv(Rm); g0 = -tv @ G0.T
    lapcov = lambda G, g: float(np.mean(mt.query(D[::2] @ G.T + g)[0] < 3))
    c0 = lapcov(G0, g0)
    log(f'placed: rotation {np.degrees(np.arctan2(Rm[1, 0], Rm[0, 0])):.1f}°, shift {tv.round(1).tolist()} m · {c0 * 100:.0f}% of the lap within 3 m of the model\'s road (next best way round {cands[1][0] * 100:.0f}%)')
    # then, as a last step, on the circuit's mapped raceways (accurate to a metre or so, where the outline is a
    # sketch): kept only if more of the lap ends up on the model's road
    if anchors is not None and len(anchors) > 200:
        A = anchors[rng.choice(len(anchors), min(4000, len(anchors)), replace=False)]
        R2, t2, c2, m2 = fit_lap(A, M, mt, G0, g0, it=40, trim=0.7)
        G2 = np.linalg.inv(R2); g2 = -t2 @ G2.T; c1 = lapcov(G2, g2) if np.all(np.isfinite(G2)) else 0
        keep = c1 > c0 + 0.01
        log(f'refit on the mapped raceways: {c1 * 100:.0f}% of the lap within 3 m of the model\'s road ({"kept" if keep else "not kept"})')
        if keep: Rm, tv = R2, t2
    return Rm, tv, road, cand


# ---------- 2. the road every 2 m ----------
def rasterise(tris_list, Rm, tv, lo, W, H, res, flags=None):
    mask = np.zeros((H, W), bool); hgt = np.full((H, W), -1e9, np.float32); fl = np.zeros((H, W), np.uint8)
    for ti, tri in enumerate(tris_list):
        xz = tri[:, :, [0, 2]].astype(np.float64) @ Rm.T + tv; y = tri[:, :, 1]
        for (a, b, c), (ya, yb, yc) in zip(xz, y):
            x0, z0 = np.floor((np.minimum(np.minimum(a, b), c) - lo) / res).astype(int); x1, z1 = np.ceil((np.maximum(np.maximum(a, b), c) - lo) / res).astype(int)
            x0, z0 = max(x0, 0), max(z0, 0); x1, z1 = min(x1, W - 1), min(z1, H - 1)
            if x1 < x0 or z1 < z0 or (x1 - x0) * (z1 - z0) > 250000: continue
            gx, gz = np.meshgrid(np.arange(x0, x1 + 1), np.arange(z0, z1 + 1)); px = lo[0] + (gx + 0.5) * res; pz = lo[1] + (gz + 0.5) * res
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9: continue
            l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[1])) / d; l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[1])) / d; l3 = 1 - l1 - l2
            m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            if not m.any(): continue
            hv = (l1 * ya + l2 * yb + l3 * yc)[m]; zz, xx = gz[m], gx[m]
            up = hv > hgt[zz, xx] - 0.02
            hgt[zz[up], xx[up]] = np.maximum(hgt[zz[up], xx[up]], hv[up]); mask[zz, xx] = True
            if flags is not None: fl[zz[up], xx[up]] = flags[ti]
    return mask, hgt, fl


def road_line(tris, road, lines, Rm, tv, D, closed=True, waypoints=None, extra=(), retrace=()):
    # (retrace: stretches given by their two ends [[x, z], [x, z]] traced on the model's road whatever the line finds)
    # (extra: more of the model's asphalt to trace the lap over: all of it, when the lap goes where the guide doesn't)
    road = list(road) + [k for k in extra if k not in road]
    allp = np.concatenate([tris[k].reshape(-1, 3)[:, [0, 2]] for k in road]) @ Rm.T + tv
    lo = np.maximum(allp.min(0), D.min(0) - 60) - 2; hi = np.minimum(allp.max(0), D.max(0) + 60) + 2; RES = 0.5
    W, H = np.ceil((hi - lo) / RES).astype(int)
    mask, hgt, _ = rasterise([tris[k] for k in road + lines], Rm, tv, lo, W, H, RES)
    lmask = rasterise([tris[k] for k in lines], Rm, tv, lo, W, H, RES)[0] if lines else np.zeros((H, W), bool)
    pad = np.pad(mask, 1); nb = sum(pad[1 + dz:H + 1 + dz, 1 + dx:W + 1 + dx] for dz in (-1, 0, 1) for dx in (-1, 0, 1)); mask |= nb >= 6
    def cell(p): g = np.floor((p - lo) / RES).astype(int); return (g[1], g[0]) if 0 <= g[0] < W and 0 <= g[1] < H else None
    on = lambda p: (lambda c: c is not None and mask[c])(cell(p))
    online = lambda p: (lambda c: c is not None and lmask[c])(cell(p))
    def hat(p):
        c = cell(p)
        if c is None: return np.nan
        v = hgt[max(0, c[0] - 1):c[0] + 2, max(0, c[1] - 1):c[1] + 2]; v = v[v > -1e8]; return float(np.median(v)) if len(v) else np.nan
    def normals(C):
        F = np.roll(C, -2, 0) - np.roll(C, 2, 0); F /= np.linalg.norm(F, axis=1)[:, None]; return np.stack([-F[:, 1], F[:, 0]], 1)
    def walk(C):
        Rn = normals(C); res = []
        for i in range(len(C)):
            c, r = C[i], Rn[i]
            Ls = next((-s for s in np.arange(3, 10.01, 0.25) if online(c - r * s)), None) if lines else None
            Rs = next((s for s in np.arange(3, 10.01, 0.25) if online(c + r * s)), None) if lines else None
            if Ls is not None and Rs is not None and 7 <= Rs - Ls <= 20: res.append((Ls, Rs)); continue
            s0 = next((s for s in sorted(np.arange(-8, 8.01, 0.25), key=abs) if on(c + r * s)), None)
            if s0 is None: res.append(None); continue
            L = s0
            while L - 0.25 > s0 - 22 and on(c + r * (L - 0.25)): L -= 0.25
            Rr = s0
            while Rr + 0.25 < s0 + 22 and on(c + r * (Rr + 0.25)): Rr += 0.25
            res.append((L, Rr))
        return res
    # The lap: given waypoints (tools/tracks/ref/<id>.waypoints.json, [[x, z], ...] in driving order: a circuit whose
    # model has several layouts on the same ground) are joined by tracing the model's road between them; otherwise the
    # guide line (the outline, the map's layout) is moved onto the middle of the model's road, and where the road isn't
    # found along it for 10 m or more (the model's layout differs there: a chicane since rebuilt) the model's own road
    # is traced from the last good sample to the next.
    if waypoints: C = model_lap(mask, lo, RES, D, waypoints)  # ('strict': the guide's points on the model's road, the rest traced)
    else: C = D.copy()
    N = len(C); idx = np.arange(N)
    for it in range(1 if waypoints else 3):
        res = walk(C); wid = np.array([r[1] - r[0] if r else np.nan for r in res]); med = np.nanmedian(wid)
        good = np.array([r is not None and abs(r[1] - r[0] - med) < 6 for r in res])
        off = np.array([(r[0] + r[1]) / 2 if g else np.nan for r, g in zip(res, good)])
        if waypoints: off = np.where(np.abs(off) < 3, off, np.nan)  # (the trace keeps to the middle already)
        ok = ~np.isnan(off)
        if ok.sum() < 3: break
        off = np.interp(idx, idx[ok], off[ok], period=N)
        k = 5; off = np.convolve(np.r_[off[-k:], off, off[:k]], np.ones(2 * k + 1) / (2 * k + 1), 'valid')
        C = C + normals(C) * off[:, None]
    if not waypoints:
        res = walk(C); wid = np.array([r[1] - r[0] if r else np.nan for r in res]); med = np.nanmedian(wid)
        good = np.array([r is not None and abs(r[1] - r[0] - med) < 6 for r in res])
        gaps, k0 = [], None
        for i in range(N + 1):
            g = good[i % N] if i < N else True
            if not g and k0 is None: k0 = i
            if g and k0 is not None:
                if i - k0 >= 5: gaps.append((k0, i))
                k0 = None
        for A0, B0 in retrace:  # (a stretch the check found off the model's road, as indices on this line)
            a = int(np.argmin(np.linalg.norm(C - np.array(A0), axis=1))); b = int(np.argmin(np.linalg.norm(C - np.array(B0), axis=1)))
            if 0 < a < b < N: gaps.append((a, b))
        gaps = sorted(gaps)
        merged = []
        for a, b in gaps:
            if merged and a <= merged[-1][1] + 2: merged[-1] = (merged[-1][0], max(merged[-1][1], b))
            else: merged.append((a, b))
        gaps = merged
        if gaps:
            f = max(1, int(round(1.0 / RES))); M1 = mask[::f, ::f]; dt1 = edge_distance(M1)
            newC, last = [], 0
            for a, b in gaps:
                A, B = C[(a - 1) % N], C[b % N]
                path = trace_dt(M1, dt1, lo, RES * f, A, B, margin=60)
                newC.extend(C[last:a]); last = b
                if path is not None:
                    Lp = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]; n = max(2, int(Lp[-1] / 2) + 1); s2 = np.linspace(0, Lp[-1], n)
                    path = np.c_[np.interp(s2, Lp, path[:, 0]), np.interp(s2, Lp, path[:, 1])]
                    newC.extend(path[1:-1]); log(f'road: traced the model\'s own road for {(b - a) * 2} m from {a * 2} m (its layout differs from the outline there)')
                else: newC.extend(C[a:b])
            newC.extend(C[last:]); C = np.array(newC); N = len(C); idx = np.arange(N)
    res = walk(C); wid = np.array([r[1] - r[0] if r else np.nan for r in res]); med = np.nanmedian(wid)
    good = np.array([r is not None and abs(r[1] - r[0] - med) < 8 for r in res])
    wid = np.interp(idx, idx[good], wid[good], period=N)
    wid = np.array([np.median(np.take(wid, range(i - 5, i + 6), mode='wrap')) for i in range(N)])
    Rn = normals(C)
    hc = np.array([hat(C[i]) for i in range(N)])
    e = np.maximum(2, wid / 2 - 1.5)
    hl = np.array([hat(C[i] - Rn[i] * e[i]) for i in range(N)]); hr = np.array([hat(C[i] + Rn[i] * e[i]) for i in range(N)])
    bank = np.degrees(np.arcsin(np.clip((hr - hl) / (2 * e), -1, 1)))
    ok = ~np.isnan(hc); hc = np.interp(idx, idx[ok], hc[ok], period=N)
    lim = 35 if np.nanmax(np.abs(bank)) > 15 else 12  # (an oval's banking is real; elsewhere more than 12° is the scan's edge)
    bank = np.where(np.isnan(bank) | (np.abs(bank) > lim), 0, bank)
    bank = np.convolve(np.r_[bank[-10:], bank, bank[:10]], np.ones(21) / 21, 'valid')
    log(f'road: found on {good.mean() * 100:.0f}% of the lap ({"edge lines" if lines else "the road surface"}), width {np.percentile(wid, 10):.1f}/{np.median(wid):.1f}/{np.percentile(wid, 90):.1f} m, rises {hc.max() - hc.min():.1f} m, camber {bank.min():.1f}..{bank.max():.1f}°')
    return {'x': C[:, 0].round(2).tolist(), 'z': C[:, 1].round(2).tolist(), 'w': wid.round(2).tolist(), 'y': hc.round(2).tolist(), 'b': bank.round(1).tolist()}


def edge_distance(mask, most=40):
    # every road cell's distance to the road's edge, in cells (up to most): erosion by erosion
    dt = np.zeros(mask.shape, np.float32); cur = mask.copy()
    for k in range(most):
        if not cur.any(): break
        dt[cur] += 1
        p = np.pad(cur, 1); cur = cur & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return dt


def model_lap(mask, lo, res, D, waypoints=None, every=150):
    # (traced on a 1 m grid: four times fewer cells, the middle of a road found as well)
    f = max(1, int(round(1.0 / res))); M1 = mask[::f, ::f]; r1 = res * f; dt = edge_distance(M1)
    H, W = M1.shape
    def snap(p, reach=25 if waypoints != 'strict' else 5):
        g = np.floor((p - lo) / r1).astype(int); k = int(reach / r1)
        z0, z1, x0, x1 = max(0, g[1] - k), min(H, g[1] + k + 1), max(0, g[0] - k), min(W, g[0] + k + 1)
        if z1 <= z0 or x1 <= x0: return None
        win = dt[z0:z1, x0:x1]
        if not (win >= 2).any(): return None
        zz, xx = np.nonzero(win >= max(2, win.max() * 0.6))  # (well inside the road: its middle, near the guide point)
        d = (zz + z0 - g[1]) ** 2 + (xx + x0 - g[0]) ** 2; q = d.argmin()
        return np.array([lo[0] + (xx[q] + x0 + 0.5) * r1, lo[1] + (zz[q] + z0 + 0.5) * r1])
    if waypoints and waypoints != 'strict': wps = [np.array(w, float) for w in waypoints]; src = 'given'
    else:
        step = max(1, int(every / 2)); wps = [snap(D[i]) for i in range(0, len(D), step)]; n0 = len(wps)
        wps = [w for w in wps if w is not None]; src = f'{len(wps)} of {n0} guide points on the model\'s road'
        if len(wps) < 6: raise SystemExit('  the model has no road along the guide line')
    out, fails = [], 0
    for k in range(len(wps)):
        A, B = wps[k], wps[(k + 1) % len(wps)]
        path = trace_dt(M1, dt, lo, r1, A, B, margin=max(40, min(400, np.hypot(*(B - A)) * 0.6)))
        if path is None: fails += 1; path = np.array([A, B])
        out.extend(path[:-1])
    C = np.array(out)
    # every 2 m, lightly smoothed
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.r_[C, C[:1]], axis=0), axis=1))]; n = int(L[-1] / 2)
    s2 = np.linspace(0, L[-1], n, endpoint=False); P = np.r_[C, C[:1]]
    C = np.c_[np.interp(s2, L, P[:, 0]), np.interp(s2, L, P[:, 1])]
    k = 3; C = np.array([np.take(C, range(i - k, i + k + 1), axis=0, mode='wrap').mean(0) for i in range(len(C))])
    log(f'lap: traced on the model\'s road from {src}, {len(C) * 2 / 1000:.2f} km' + (f' ({fails} stretches had no way through: straight there)' if fails else ''))
    return C


def trace_dt(M, dt, lo, res, A, B, margin=60):
    # cheapest path A -> B over road cells, a step costing more the nearer it is to the road's edge (so it keeps to
    # the middle), in a box round the two; resampled every 2 m. None if there's no way through.
    import heapq
    a = np.floor((A - lo) / res).astype(int); b = np.floor((B - lo) / res).astype(int); m = int(margin / res)
    x0, z0 = max(0, min(a[0], b[0]) - m), max(0, min(a[1], b[1]) - m); x1, z1 = min(M.shape[1] - 1, max(a[0], b[0]) + m), min(M.shape[0] - 1, max(a[1], b[1]) + m)
    Mb = M[z0:z1 + 1, x0:x1 + 1]; Db = dt[z0:z1 + 1, x0:x1 + 1]; H, W = Mb.shape
    s, t = (a[1] - z0, a[0] - x0), (b[1] - z0, b[0] - x0)
    if not (0 <= s[0] < H and 0 <= s[1] < W and 0 <= t[0] < H and 0 <= t[1] < W): return None
    cost = np.where(Mb, 1 + 6 / (1 + Db), np.inf)
    INF = 1e18; dist = np.full((H, W), INF); dist[s] = 0; prev = np.full((H, W, 2), -1, np.int32); heap = [(0.0, s)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == t: break
        if d > dist[u]: continue
        for dz, dx, step in ((1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414)):
            v = (u[0] + dz, u[1] + dx)
            if not (0 <= v[0] < H and 0 <= v[1] < W): continue
            c = cost[v] if v != t else 1.0
            if c == np.inf: continue
            nd = d + step * c
            if nd < dist[v]: dist[v] = nd; prev[v] = u; heapq.heappush(heap, (nd, v))
    if dist[t] >= INF: return None
    cells = [t]
    while cells[-1] != s: q = prev[cells[-1]]; cells.append((int(q[0]), int(q[1])))
    P = np.array([[lo[0] + (x0 + c[1] + 0.5) * res, lo[1] + (z0 + c[0] + 0.5) * res] for c in cells[::-1]])
    P[0], P[-1] = A, B
    return P


def trace(mask, lo, res, A, B, margin=60):
    # cheapest path A -> B over road cells, a step's cost 1 + 4 / (1 + distance to the road's edge in cells), in a box
    # round the two; resampled every 2 m. None if there's no way through.
    import heapq
    a = np.floor((A - lo) / res).astype(int); b = np.floor((B - lo) / res).astype(int); m = int(margin / res)
    x0, z0 = max(0, min(a[0], b[0]) - m), max(0, min(a[1], b[1]) - m); x1, z1 = min(mask.shape[1] - 1, max(a[0], b[0]) + m), min(mask.shape[0] - 1, max(a[1], b[1]) + m)
    M = mask[z0:z1 + 1, x0:x1 + 1]; H, W = M.shape
    # distance to the edge (two-pass chamfer)
    INF = 1e6; dt = np.where(M, INF, 0.0)
    for z in range(H):
        for x in range(W):
            if dt[z, x]: dt[z, x] = min(dt[z, x], (dt[z - 1, x] + 1) if z else 1, (dt[z, x - 1] + 1) if x else 1)
    for z in range(H - 1, -1, -1):
        for x in range(W - 1, -1, -1):
            if dt[z, x]: dt[z, x] = min(dt[z, x], (dt[z + 1, x] + 1) if z < H - 1 else 1, (dt[z, x + 1] + 1) if x < W - 1 else 1)
    s, t = (a[1] - z0, a[0] - x0), (b[1] - z0, b[0] - x0)
    if not (0 <= s[0] < H and 0 <= s[1] < W and 0 <= t[0] < H and 0 <= t[1] < W): return None
    dist = {s: 0.0}; prev = {}; heap = [(0.0, s)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == t: break
        if d > dist.get(u, INF): continue
        for dz, dx, step in ((1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414)):
            v = (u[0] + dz, u[1] + dx)
            if not (0 <= v[0] < H and 0 <= v[1] < W) or (not M[v] and v != t): continue
            nd = d + step * (1 + 4 / (1 + dt[v]))
            if nd < dist.get(v, INF): dist[v] = nd; prev[v] = u; heapq.heappush(heap, (nd, v))
    if t not in prev: return None
    cells = [t]
    while cells[-1] != s: cells.append(prev[cells[-1]])
    P = np.array([[lo[0] + (x0 + c[1] + 0.5) * res, lo[1] + (z0 + c[0] + 0.5) * res] for c in cells[::-1]])
    k = 4; P = np.array([P[max(0, i - k):i + k + 1].mean(0) for i in range(len(P))]); P[0], P[-1] = A, B  # (smoothed)
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]; n = max(2, int(L[-1] / 2) + 1)
    s2 = np.linspace(0, L[-1], n); return np.c_[np.interp(s2, L, P[:, 0]), np.interp(s2, L, P[:, 1])]


def check_on_road(tris, road, Rm, tv, Ln):
    C = np.c_[Ln['x'], Ln['z']]; W = np.array(Ln['w'])
    lo = C.min(0) - 30; hi = C.max(0) + 30; RES = 0.5; Wd, Hd = np.ceil((hi - lo) / RES).astype(int)
    mask = rasterise([tris[k] for k in road], Rm, tv, lo, Wd, Hd, RES)[0]
    pad = np.pad(mask, 2); mask = sum(pad[2 + dz:Hd + 2 + dz, 2 + dx:Wd + 2 + dx] for dz in range(-2, 3) for dx in range(-2, 3)) > 0  # (1 m of slack)
    F = np.roll(C, -2, 0) - np.roll(C, 2, 0); F /= np.linalg.norm(F, axis=1)[:, None]; Rn = np.stack([-F[:, 1], F[:, 0]], 1)
    def on(p): g = np.floor((p - lo) / RES).astype(int); return 0 <= g[0] < Wd and 0 <= g[1] < Hd and mask[g[1], g[0]]
    hits = []; bad = []
    for i in range(len(C)):
        e = max(1, W[i] / 2 - 1); r = [on(C[i]), on(C[i] + Rn[i] * e), on(C[i] - Rn[i] * e)]
        hits.append(sum(r) / 3)
        if sum(r) < 3: bad.append(i)
    S = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    runs, k0, badset = [], None, set(bad)
    for i in range(len(C) + 1):
        b = i < len(C) and i in badset
        if b and k0 is None: k0 = i
        if not b and k0 is not None:
            if i - k0 >= 5: runs.append(f'{S[k0]:.0f}-{S[i - 1]:.0f} m')
            k0 = None
    f = float(np.mean(hits)); log(f'check: {f * 100:.1f}% of the lap (centre and both edges) on the model\'s road' + (f'; off at {", ".join(runs[:8])}' if runs else ''))
    # (the stretches off it, as their two ends on the lap, 10 m beyond each)
    off, k0 = [], None
    for i in range(len(C) + 1):
        b = i < len(C) and i in badset
        if b and k0 is None: k0 = i
        if not b and k0 is not None:
            if i - k0 >= 3: off.append((C[(k0 - 5) % len(C)].tolist(), C[(i + 5) % len(C)].tolist()))
            k0 = None
    check_on_road.off = off
    return f


# ---------- 3. what the rest is ----------
def sort_materials(tris, look, road, Rm, tv, Ln):
    C = np.c_[Ln['x'], Ln['z']]; Y = np.array(Ln['y']); half = np.array(Ln['w']) / 2; tree = Near(C)
    out = {'lines': [], 'paved': [], 'gravel': [], 'grass': [], 'walls': [], 'trees': [], 'other': []}
    for k, t in tris.items():
        if k in road or not len(t): continue
        n, a = tri_normals(t); c = t.mean(1); xz = c[:, [0, 2]].astype(np.float64) @ Rm.T + tv
        sub = slice(None, None, max(1, len(t) // 3000)); d, j = tree.query(xz[sub]); dh = c[sub, 1] - Y[j]
        tops = t[sub][:, :, 1].max(1) - Y[j]
        A = max(a.sum(), 1e-9); up = a[n[:, 1] > 0.5].sum() / A; vert = a[np.abs(n[:, 1]) < 0.3].sum() / A
        cls = colour_class(look[k]['rgb']); blend = look[k]['blend']; near = np.median(d)
        if near > 150: out['other'].append(k); continue
        if blend and up < 0.5:  # (see-through and upright: a fence if it's low, else trees)
            (out['walls'] if np.median(tops) < 4.5 and near < 60 else out['trees']).append(k); continue
        if up > 0.7 and not blend:
            if cls != 'green' and np.median(dh) > 4: out['other'].append(k); continue  # (a roof, a grandstand's top)
            if cls == 'white' and np.median(d - half[j]) < 3: out['lines'].append(k)
            elif cls == 'green': out['grass'].append(k)
            elif cls == 'tan': out['gravel'].append(k)
            elif cls in ('grey', 'white', 'paint'): out['paved'].append(k)
            else: out['other'].append(k)
        elif vert > 0.3 and up < 0.7 and near < 60 and np.median(tops) < 4.5 and cls != 'green': out['walls'].append(k)
        elif cls == 'green' and np.median(dh) > 3: out['trees'].append(k)
        else: out['other'].append(k)
    for g, ks in out.items(): log(f'{g}: {len(ks)} materials' + (f' ({", ".join(look[k]["name"] for k in ks[:8])}{"…" if len(ks) > 8 else ""})' if ks else ''))
    return out


def walls_of(tris, ks, Rm, tv, Ln):
    C = np.c_[Ln['x'], Ln['z']]; Y = np.array(Ln['y']); tree = Near(C); walls, seen = [], set()
    for k in ks:
        t = tris[k].astype(np.float64); n, _ = tri_normals(t.astype(np.float32)); xz = t[:, :, [0, 2]] @ Rm.T + tv
        d, j = tree.query(xz.mean(1)); top = t[:, :, 1].max(1) - Y[j]
        keep = (np.abs(n[:, 1]) < 0.5) & (d < 80) & (top < 4.5) & (top > 0.2)
        for t3, y3 in zip(xz[keep], t[keep][:, :, 1]):
            best = None
            for a, b in ((0, 1), (1, 2), (2, 0)):
                L = np.hypot(*(t3[b] - t3[a]))
                if L > 0.6 and abs(y3[b] - y3[a]) < 0.5 * L and (best is None or L > best[0]): best = (L, a, b)
            if not best: continue
            p, q = t3[best[1]], t3[best[2]]; key = tuple(np.round((p + q) / 2).astype(int)) + (int(round(np.degrees(np.arctan2(*(q - p))) / 20)) % 9,)
            if key in seen: continue
            seen.add(key); walls.append({'k': 'rail', 'p': [[round(p[0], 2), round(p[1], 2)], [round(q[0], 2), round(q[1], 2)]]})
    log(f'walls: {len(walls)} segments')
    return walls


def ground_of(tris, groups, Rm, tv, Ln):
    C = np.c_[Ln['x'], Ln['z']]; BAND, RES, HRES = 90, 1.0, 2.0
    lo = C.min(0) - BAND - 2; hi = C.max(0) + BAND + 2
    W, H = np.ceil((hi - lo) / RES).astype(int); HW, HH = np.ceil((hi - lo) / HRES).astype(int)
    lst, flags = [], []
    for v, name in ((3, 'grass'), (2, 'gravel'), (1, 'paved'), (1, 'road'), (1, 'lines')):
        for k in groups.get(name, []): lst.append(tris[k]); flags.append(v)
    _, top, cls = rasterise(lst, Rm, tv, lo, W, H, RES, flags)
    _, hg, _ = rasterise(lst, Rm, tv, lo, HW, HH, HRES)
    band = np.zeros((H, W), bool); r = int(BAND / RES)
    for p in C[::4]:
        cx, cz = ((p - lo) / RES).astype(int)
        for dz in range(-r, r + 1):
            z = cz + dz
            if 0 <= z < H: w = int((r * r - dz * dz) ** 0.5); band[z, max(0, cx - w):min(W, cx + w + 1)] = True
    cls[~band] = 0
    hv = np.where(hg > -1e8, hg, np.nan)
    with np.errstate(all='ignore'):
        import warnings; warnings.simplefilter('ignore')
        for _ in range(3):
            pad = np.pad(hv, 1, constant_values=np.nan); nb = np.stack([pad[1 + dz:1 + dz + HH, 1 + dx:1 + dx + HW] for dz in (-1, 0, 1) for dx in (-1, 0, 1)])
            hv = np.where(np.isnan(hv), np.nanmean(nb, axis=0), hv)
        pad = np.pad(hv, 1, mode='edge'); nb = np.stack([pad[1 + dz:1 + dz + HH, 1 + dx:1 + dx + HW] for dz in (-1, 0, 1) for dx in (-1, 0, 1)])
        hv = np.where(np.isnan(hv), hv, np.nanmedian(nb, axis=0))
    hcm = np.where(np.isnan(hv), -32768, np.round(hv * 100)).astype('<i2')
    out = bytearray(); flat = cls.reshape(-1); idx = np.flatnonzero(np.diff(flat)) + 1; starts = np.r_[0, idx]; ends = np.r_[idx, len(flat)]
    for s0, e0 in zip(starts, ends):
        out.append(int(flat[s0])); m = int(e0 - s0)
        while m >= 128: out.append((m & 127) | 128); m >>= 7
        out.append(m)
    inb = cls[band]
    log(f'ground: paved {np.mean(inb == 1) * 100:.0f}% gravel {np.mean(inb == 2) * 100:.0f}% grass {np.mean(inb == 3) * 100:.0f}% none {np.mean(inb == 0) * 100:.0f}% · heights on {np.mean(hcm != -32768) * 100:.0f}% of the grid')
    return ({'res': RES, 'x0': float(lo[0]), 'z0': float(lo[1]), 'w': int(W), 'h': int(H), 'rle': base64.b64encode(bytes(out)).decode()},
            {'res': HRES, 'x0': float(lo[0]), 'z0': float(lo[1]), 'w': int(HW), 'h': int(HH), 'cm': base64.b64encode(hcm.tobytes()).decode()})


if __name__ == '__main__':
    cid, glb = sys.argv[1], sys.argv[2]; out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(CACHE, cid + '.refline.json')
    track = json.load(open(os.path.join(ROOT, 'tracks', 'real', cid + '.json')))
    print(f'{cid}: {os.path.basename(glb)}')
    tris, look = load_glb(glb); log(f'model: {sum(len(t) for t in tris.values()):,} triangles, {len(tris)} materials')
    D = dense_line(track)
    rw = (track.get('osm') or {}).get('raceways') or []
    anchors = None
    if rw:
        pts = []
        for P in rw:
            P = np.array(P, float)
            for a, b in zip(P[:-1], P[1:]):
                k = max(1, int(np.hypot(*(b - a)) / 3)); pts += [a + (b - a) * j / k for j in range(k)]
        anchors = np.unique(np.round(np.array(pts), 1), axis=0)
    Rm, tv, road, asphalt = align(tris, look, D, anchors)
    # (the road from its surface, the materials sorted against it, then the road again from its edge lines)
    wpf = os.path.join(ROOT, 'tools', 'tracks', 'ref', cid + '.waypoints.json'); wps = json.load(open(wpf)) if os.path.exists(wpf) else None
    Ln = road_line(tris, road, [], Rm, tv, D, waypoints=wps)
    groups = sort_materials(tris, look, road, Rm, tv, Ln)
    if groups['lines']:
        Ln = road_line(tris, road, groups['lines'], Rm, tv, D, waypoints=wps)
        groups = sort_materials(tris, look, road, Rm, tv, Ln)
    groups['road'] = road
    # the check: how much of the lap's centre line and edges (1 m in) lies on the model's road. A build that's off
    # isn't written.
    ok = check_on_road(tris, road + groups['lines'], Rm, tv, Ln)
    if ok < 0.999 and not wps and check_on_road.off:
        # the stretches off the model's road traced on it instead (the line found road nearby, but not the right road)
        log(f'tracing the model\'s road through the {len(check_on_road.off)} stretches off it')
        Ln2 = road_line(tris, road, groups['lines'], Rm, tv, D, retrace=check_on_road.off, extra=asphalt)
        ok2 = check_on_road(tris, list(dict.fromkeys(road + asphalt)) + groups['lines'], Rm, tv, Ln2)
        if ok2 > ok: Ln, ok = Ln2, ok2
    if ok < 0.95 and not wps:
        # the guide's layout differs from the model's for long stretches: the lap from the guide's points that are on
        # the model's road, the model's own road traced between them
        log('the lap leaves the model\'s road: tracing it between the guide\'s points that are on it')
        Ln2 = road_line(tris, road, groups['lines'], Rm, tv, D, waypoints='strict', extra=asphalt)
        ok2 = check_on_road(tris, list(dict.fromkeys(road + asphalt)) + groups['lines'], Rm, tv, Ln2)
        if ok2 > ok: Ln, ok = Ln2, ok2
    if ok < 0.95 and not os.environ.get('REF_FORCE'):
        raise SystemExit(f'  FAIL: only {ok * 100:.0f}% of the lap is on the model\'s road (needs 95%): the model is misplaced, or its layout differs (REF_FORCE=1 writes it anyway)')
    Ln['walls'] = walls_of(tris, groups['walls'], Rm, tv, Ln)
    Ln['surface'], Ln['ground'] = ground_of(tris, groups, Rm, tv, Ln)
    Ln['model'] = {'url': f'models/tracks/{cid}_ref.glb', 'R': Rm.tolist(), 't': tv.tolist()}
    os.makedirs(os.path.dirname(out), exist_ok=True); json.dump(Ln, open(out, 'w'))
    print(f'  -> {os.path.relpath(out, ROOT)}')
