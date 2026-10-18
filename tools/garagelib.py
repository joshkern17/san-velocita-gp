# Shared by the home garage kit's Blender scripts (tools/garage-unit.py, tools/garage-stations.py): PSX textures with
# grime baked in, boxes and walls with UVs from where they are, lights, and props from the packs (one source each in a
# LIB collection that isn't exported; copies share its mesh). Import after bpy.ops.wm.read_factory_settings, then
# configure(gen) with the folder the baked textures go in.
import bpy, math, os
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'models', 'garage', 'src')
TEX = os.path.join(SRC, 'psx_industrial')
GEN = os.path.join(SRC, 'unit_gen')
RNG = np.random.default_rng(1987)
LIB = {}
_lib = []


def configure(gen, seed=1987):
    global GEN, RNG
    GEN = gen; RNG = np.random.default_rng(seed); os.makedirs(GEN, exist_ok=True); LIB.clear(); _lib.clear()


def lib_collection():
    if not _lib or _lib[0].name not in bpy.data.collections:
        c = bpy.data.collections.new('LIB (prop sources: not exported)'); bpy.context.scene.collection.children.link(c); c.hide_render = True
        _lib[:] = [c]
    return _lib[0]


def collection(name, parent=None):
    c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c); return c


def link(o, coll):
    for c in list(o.users_collection): c.objects.unlink(o)
    coll.objects.link(o); return o


# ---------------- textures: a PSX tile, laid out at its size, grime on top ----------------
def load_px(path):
    im = bpy.data.images.load(path, check_existing=True); w, h = im.size
    return np.array(im.pixels[:], np.float32).reshape(h, w, 4)[..., :3]   # (row 0 at the bottom, as UV v 0)


def resample(px, h, w):   # nearest, PSX
    ys = (np.arange(h) * px.shape[0] / h).astype(int); xs = (np.arange(w) * px.shape[1] / w).astype(int)
    return px[ys][:, xs]


def tile(px, h, w, th, tw):   # the tile, th x tw pixels, repeated over h x w
    t = resample(px, th, tw); ys = np.arange(h) % th; xs = np.arange(w) % tw
    return t[ys][:, xs]


def vnoise(h, w, cell, wrap=False):
    gh, gw = (max(1, h // cell), max(1, w // cell)) if wrap else (h // cell + 2, w // cell + 2)
    g = RNG.random((gh, gw)).astype(np.float32)
    y, x = np.arange(h) / cell, np.arange(w) / cell
    y0, x0 = np.floor(y).astype(int), np.floor(x).astype(int); fy, fx = y - y0, x - x0
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    y1, x1 = y0 + 1, x0 + 1
    if wrap: y0, y1, x0, x1 = y0 % gh, y1 % gh, x0 % gw, x1 % gw
    a, b, c, d = g[y0][:, x0], g[y0][:, x1], g[y1][:, x0], g[y1][:, x1]
    top = a + (b - a) * fx; bot = c + (d - c) * fx
    return top + (bot - top) * fy[:, None]


def fbm(h, w, cells, wrap=False):
    n, tot = np.zeros((h, w), np.float32), 0.0
    for i, c in enumerate(cells): k = 0.5 ** i; n += k * vnoise(h, w, max(1, int(c)), wrap); tot += k
    return n / tot


DIRT = np.array([0.13, 0.11, 0.085], np.float32)   # (old dirt: dark, a little warm)
OIL = np.array([0.05, 0.045, 0.04], np.float32)
RUST = np.array([0.36, 0.17, 0.07], np.float32)


def grime(col, amt, to=DIRT):
    a = np.clip(amt, 0, 1)[..., None]; return col * (1 - a) + to * a


def psx(col):   # 5 bits a channel with a little ordered dither, like the rest of the pack
    B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
    h, w = col.shape[:2]; d = B[np.arange(h) % 4][:, np.arange(w) % 4][..., None]
    return np.clip(np.floor(np.clip(col, 0, 1) * 31 + 0.5 + d * 0.8) / 31, 0, 1)


def save(name, col):
    h, w = col.shape[:2]; rgba = np.ones((h, w, 4), np.float32); rgba[..., :3] = psx(col)
    im = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=False)
    if tuple(im.size) != (w, h): im.scale(w, h)
    im.pixels = rgba.ravel(); im.filepath_raw = os.path.join(GEN, name + '.png'); im.file_format = 'PNG'; im.save()
    return im


def mat_img(name, im, rough=0.9, emit=None):
    m = bpy.data.materials.new(name)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = 0.0
    if im is not None:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = im; t.interpolation = 'Closest'
        m.node_tree.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if emit:
        p.inputs['Base Color'].default_value = (*emit[0], 1); p.inputs['Emission Color'].default_value = (*emit[0], 1)
        p.inputs['Emission Strength'].default_value = emit[1]
    return m


def blobs(h, w, spots, ppm):   # dark patches: (x px, y px, radius m, strength), ragged edges
    out = np.zeros((h, w), np.float32); rag = fbm(h, w, (ppm * 0.6, ppm * 0.25))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for (cx, cy, r, k) in spots:
        d = np.hypot(xx - cx, yy - cy) / (r * ppm) + (rag - 0.5) * 0.9
        out = np.maximum(out, k * np.clip(1.15 - d, 0, 1) ** 0.7)
    return out


# a grimy tile for the steelwork and other boxes built here (wraps, so it tiles: one tile is 2 m)
def grimy_tile(name, base, dirt=0.35, rust=0.0, wear_light=0.0, tint=None):
    px = load_px(os.path.join(TEX, base)); n = 128
    col = tile(px, n, n, 64, 64)
    if tint is not None:   # (paint of another colour: the texture's light and dark, in that colour)
        lum = col.mean(axis=2, keepdims=True); col = np.clip(lum / max(1e-3, float(lum.mean())) * np.array(tint, np.float32), 0, 1)
    g = fbm(n, n, (64, 32, 8), wrap=True); fine = vnoise(n, n, 4, wrap=True)
    col = grime(col, (g - 0.35) * 1.3 * dirt + fine * 0.12)
    if rust: col = grime(col, np.clip((fbm(n, n, (32, 16, 4), wrap=True) - 0.62) * 4, 0, 1) * rust, RUST)
    if wear_light: col = col * (1 + wear_light * (vnoise(n, n, 8, wrap=True) - 0.5))[..., None]
    return mat_img(name, save(name, col))


# ---------------- geometry built here: boxes and walls with UVs from where they are ----------------
def uv_world(me, mw, scale=0.5):
    # each face mapped flat along its main axis: one texture tile per 1/scale metres (2 m)
    uv = me.uv_layers.new()
    for f in me.polygons:
        n = (mw.to_3x3() @ f.normal); ax = max(range(3), key=lambda i: abs(n[i]))
        for li in f.loop_indices:
            p = mw @ me.vertices[me.loops[li].vertex_index].co
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            uv.data[li].uv = (p[a] * scale, p[b] * scale)


def box(name, coll, size, loc, mat, rot=(0, 0, 0), uvs=0.5):
    me = bpy.data.meshes.new(name); sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    me.from_pydata(v, [], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    o = bpy.data.objects.new(name, me); o.location = loc; o.rotation_euler = rot; coll.objects.link(o)
    me.materials.append(mat); uv_world(me, Matrix.LocRotScale(Vector(loc), o.rotation_euler.to_quaternion(), None), uvs)
    return o


def beam(name, coll, p0, p1, w, h, mat):   # a box from p0 to p1, w wide, h deep (its up kept up)
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; L = d.length
    yaw = math.atan2(d.y, d.x); pitch = math.atan2(d.z, Vector((d.x, d.y)).length)
    return box(name, coll, (L, w, h), (p0 + p1) / 2, mat, rot=(0, -pitch, yaw))


def quad(name, coll, pts, mat, inward, uvs=None):
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p in pts], [], [tuple(range(len(pts)))])
    if me.polygons[0].normal.dot(Vector(inward)) < 0: me.flip_normals()
    uv = me.uv_layers.new()
    for li in me.polygons[0].loop_indices: uv.data[li].uv = uvs[me.loops[li].vertex_index] if uvs else (0, 0)
    o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return o


def wall(name, coll, a, b, top, openings, mat, inward, uspan, vspan):
    # a wall from a to b (on the floor), top(u) its height along it; openings [(u0, u1, z0, z1)] left open. Cut into
    # cells at the openings' edges (and every 2 m), each cell's UVs from where it is: one texture over the whole wall
    a, b = Vector(a), Vector(b); L = (b - a).length; dirv = (b - a) / L
    us = sorted({0.0, L, *[round(x, 4) for o in openings for x in o[:2]], *[float(i) for i in range(2, int(L), 2)]})
    vs, fs, uvs = [], [], []
    def vert(u, z):
        p = a + dirv * u; vs.append((p.x, p.y, z)); uvs.append((u / uspan, z / vspan)); return len(vs) - 1
    for ua, ub in zip(us, us[1:]):
        cut = [o for o in openings if o[0] <= ua + 1e-4 and ub <= o[1] + 1e-4]
        zs = sorted({0.0, *[z for o in cut for z in o[2:]]}); zt = min(top(ua), top(ub))
        zs = [z for z in zs if z < zt - 1e-3]
        for k, za in enumerate(zs):
            zb = zs[k + 1] if k + 1 < len(zs) else None
            if zb is None:   # (the top cell: up to the wall's top, sloping on a gable)
                if any(o[2] <= za + 1e-4 and zt <= o[3] + 1e-4 for o in cut): continue
                fs.append((vert(ua, za), vert(ub, za), vert(ub, top(ub)), vert(ua, top(ua))))
            else:
                if any(o[2] <= za + 1e-4 and zb <= o[3] + 1e-4 for o in cut): continue
                fs.append((vert(ua, za), vert(ub, za), vert(ub, zb), vert(ua, zb)))
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs)
    for f in me.polygons:
        if f.normal.dot(Vector(inward)) < 0: f.flip()
    uv = me.uv_layers.new()
    for f in me.polygons:
        for li in f.loop_indices: uv.data[li].uv = uvs[me.loops[li].vertex_index]
    me.update(); o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return o


def empty(name, coll, loc, rotz=0.0, kind='PLAIN_AXES', size=0.4, **props):
    e = bpy.data.objects.new(name, None); e.empty_display_type = kind; e.empty_display_size = size
    e.location = loc; e.rotation_euler = (0, 0, rotz); coll.objects.link(e)
    for k, v in props.items(): e[k] = v
    return e


def bulb(name, coll, loc, watts, rgb):
    L = bpy.data.lights.new(name, 'POINT'); L.energy = watts; L.color = rgb; L.shadow_soft_size = 0.2
    o = bpy.data.objects.new(name, L); o.location = loc; coll.objects.link(o); return o


def spot(name, coll, loc, watts, rgb, deg=125):   # aimed straight down
    L = bpy.data.lights.new(name, 'SPOT'); L.energy = watts; L.color = rgb; L.spot_size = math.radians(deg); L.spot_blend = 0.6; L.shadow_soft_size = 0.4
    o = bpy.data.objects.new(name, L); o.location = loc; coll.objects.link(o); return o


# ---------------- props from the packs: one source each (LIB, not exported), copies share its mesh ----------------


def lib(key, path, prefix='', height=None, scale=None, keep_z=False):
    # the meshes in a model file (names starting prefix), joined, parents' transforms baked in, origin at the bottom
    # middle, scaled (to a height, or by a factor). Pack textures as they come (nearest-filtered)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]; bpy.context.view_layer.update()
    picked = [o for o in new if o.type == 'MESH' and o.name.startswith(prefix)]
    if not picked: raise RuntimeError(f'{prefix} not in {path}: {[o.name for o in new if o.type == "MESH"]}')
    meshes = []
    for o in picked:
        mw = o.matrix_world.copy(); o.parent = None; o.data = o.data.copy(); o.data.transform(mw); o.matrix_world = Matrix.Identity(4); meshes.append(o)
    for o in new:
        if o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
    o = meshes[0]
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=o, selected_editable_objects=meshes): bpy.ops.object.join()
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    k = height / (hi.z - lo.z) if height else (scale or 1.0)
    o.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0 if keep_z else lo.z))))
    for m in o.data.materials:
        if m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE': n.interpolation = 'Closest'
                if n.type == 'BSDF_PRINCIPLED': n.inputs['Metallic'].default_value = 0.0
    o.name = 'LIB_' + key; o.rotation_mode = 'XYZ'; link(o, lib_collection()); o.hide_set(True); LIB[key] = o
    return o


def put(key, coll, loc, rotz=0.0, s=1.0, name=None, tilt=(0, 0)):
    src = LIB[key]; o = bpy.data.objects.new(name or key, src.data)
    o.location = loc; o.rotation_euler = (tilt[0], tilt[1], rotz); o.scale = (s, s, s); coll.objects.link(o); return o




# ---------------- more for the stations: cylinders, hoses, printed art and glowing screens ----------------
def cyl(name, coll, r, depth, loc, mat, rot=(0, 0, 0), verts=10, cap=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot, end_fill_type='NGON' if cap else 'NOTHING')
    o = bpy.context.active_object; o.name = name; o.data.name = name; link(o, coll)
    while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
    o.data.materials.append(mat); uv_world(o.data, o.matrix_world, 0.5); return o


def rod(name, coll, p0, p1, r, mat, verts=8):   # a cylinder from p0 to p1
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    q = d.normalized().to_track_quat('Z', 'Y')
    return cyl(name, coll, r, d.length, (p0 + p1) / 2, mat, rot=q.to_euler(), verts=verts)


def hose(name, coll, pts, r, mat, verts=8):
    # a hose through the points, rounded at the joins (a short cylinder from each point to the next, a ball at each)
    parts = [rod(f'{name}_{i:02d}', coll, a, b, r, mat, verts) for i, (a, b) in enumerate(zip(pts, pts[1:]))]
    for i, p in enumerate(pts[1:-1]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=verts, ring_count=4, radius=r, location=p); s = bpy.context.active_object; s.name = f'{name}_j{i:02d}'
        link(s, coll); s.data.materials.append(mat); parts.append(s)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = name
    return o


def art_mat(name, png, dirt=0.3, emit=None, rough=0.85):
    # a flat print (a sign, a note, a screen) with grime on it; emit: strength, for a screen that glows
    px = load_px(png); h, w = px.shape[:2]
    if dirt:
        g = fbm(h, w, (max(4, w // 4), max(2, w // 16), 2)); edge = np.minimum.reduce(np.meshgrid(np.minimum(np.arange(w), w - 1 - np.arange(w)), np.minimum(np.arange(h), h - 1 - np.arange(h))))
        px = grime(px, (g - 0.45) * dirt + np.clip(1 - edge / (0.08 * min(h, w)), 0, 1) * dirt * 0.8)
    im = save(name, px); m = mat_img(name, im, rough)
    if emit:
        p = m.node_tree.nodes.get('Principled BSDF'); t = [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'][0]
        m.node_tree.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    return m


def card(name, coll, w, h, loc, mat, rotz=0.0, tilt=0.0):
    # a flat picture, w x h, standing up, its face to -Y turned rotz (tilt: leaned back about its bottom edge)
    me = bpy.data.meshes.new(name); me.from_pydata([(-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, 0, h), (-w / 2, 0, h)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for li, (u, v) in zip(me.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))): uv.data[li].uv = (u, v)
    if me.polygons[0].normal.y > 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); o.location = loc; o.rotation_euler = (tilt, 0, rotz); coll.objects.link(o); me.materials.append(mat); return o


# ======================================================================================================================
# Detailed stations (tools/garage-dyno.py and after; the method: .claude/skills/garage-station/SKILL.md). Shapes that
# read as the real thing: chamfered boxes, lathed parts, smooth swept tubes with textures that run along them, steel
# sections; a see-through cutout; ambient occlusion baked into vertex colours; the export. Everything made with these
# is kept in BUILT (what the AO bake works on); wrap a garagelib box/cyl/rod/card in mk() to add it.
import bmesh
BUILT = []

def _obj(name, coll, me, mat):
    o = bpy.data.objects.new(name, me); coll.objects.link(o)
    if isinstance(mat, (list, tuple)):
        for m in mat: me.materials.append(m)
    else: me.materials.append(mat)
    BUILT.append(o); return o

def mk(o): BUILT.append(o); return o

def bbox(name, coll, size, loc, mat, rot=(0, 0, 0), bev=0.012):
    # a box with its edges chamfered (catches the light along them: no more razor boxes)
    o = box(name, coll, size, loc, mat, rot)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bev, min(size) * 0.3), offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES')
    bm.to_mesh(o.data); bm.free()
    while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
    uv_world(o.data, o.matrix_world, 0.5); return mk(o)

def bx(*a, **k): return mk(box(*a, **k))
def cy(*a, **k): return mk(cyl(*a, **k))
def rd(*a, **k): return mk(rod(*a, **k))
def cd(*a, **k): return mk(card(*a, **k))

def lathe(name, coll, prof, loc, mat, segs=14, rot=(0, 0, 0), cap0=True, cap1=True, vscale=None):
    # a profile [(r, z)] turned about Z (then rot): trumpets, pulleys, the absorber, the beacon
    verts, faces, uvs = [], [], []
    L = [0.0]
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]): L.append(L[-1] + math.hypot(r1 - r0, z1 - z0))
    for i, (r, z) in enumerate(prof):
        for j in range(segs + 1):
            a = j / segs * math.tau; verts.append((r * math.cos(a), r * math.sin(a), z))
    n = segs + 1
    for i in range(len(prof) - 1):
        for j in range(segs): faces.append((i * n + j, i * n + j + 1, (i + 1) * n + j + 1, (i + 1) * n + j))
    if cap0 and prof[0][0] > 1e-4: faces.append(tuple(range(segs - 1, -1, -1)))
    if cap1 and prof[-1][0] > 1e-4: k = (len(prof) - 1) * n; faces.append(tuple(k + j for j in range(segs)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(); vs = vscale or (1.0 / max(1e-3, L[-1]))
    for f in me.polygons:
        for li in f.loop_indices:
            vi = me.loops[li].vertex_index; i, j = divmod(vi, n); uv.data[li].uv = (j / segs, L[min(i, len(L) - 1)] * vs)
    me.validate(); me.update()
    o = _obj(name, coll, me, mat); o.location = loc; o.rotation_euler = rot
    for p in me.polygons: p.use_smooth = True
    return o

def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)

def sweep(name, coll, pts, r, mat, segs=8, per_m=10, vscale=None, closed=False, caps=True, rv=None):
    # a tube along a smooth (Catmull-Rom) path through pts: headers, hoses, the flex duct, a belt. UVs run along it
    # (u round, v along: 1 over its length unless vscale, per metre), so a texture can change along a pipe.
    # rv: radius along it, a function of 0..1
    P = [Vector(p) for p in pts]
    if closed: P = P + P[:3]
    ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    S = []
    for i in range(1, len(ext) - 2 - (2 if closed else 0)):
        n = max(2, int((ext[i + 1] - ext[i]).length * per_m))
        for k in range(n): S.append(_cr(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / n))
    if closed: S.append(S[0].copy())
    else: S.append(P[-1].copy())
    T = [(S[min(k + 1, len(S) - 1)] - S[max(k - 1, 0)]).normalized() for k in range(len(S))]
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = [T[0].cross(ref).normalized()]
    for k in range(1, len(S)):
        q = T[k - 1].rotation_difference(T[k]); N.append((q @ N[-1]).normalized())
    L = [0.0]
    for k in range(1, len(S)): L.append(L[-1] + (S[k] - S[k - 1]).length)
    vs = vscale if vscale else 1.0 / max(1e-3, L[-1])
    verts, faces = [], []
    for k, c in enumerate(S):
        B = T[k].cross(N[k]); rr = r * (rv(L[k] / L[-1]) if rv else 1)
        for j in range(segs + 1):
            a = j / segs * math.tau; verts.append(c + (N[k] * math.cos(a) + B * math.sin(a)) * rr)
    m = segs + 1
    for k in range(len(S) - 1):
        for j in range(segs): faces.append((k * m + j, (k + 1) * m + j, (k + 1) * m + j + 1, k * m + j + 1))
    if caps and not closed:
        faces.append(tuple(range(segs - 1, -1, -1))); e = (len(S) - 1) * m; faces.append(tuple(e + j for j in range(segs)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new()
    for f in me.polygons:
        for li in f.loop_indices:
            vi = me.loops[li].vertex_index; k, j = divmod(vi, m); uv.data[li].uv = (j / segs, L[k] * vs)
    me.validate(); me.update()
    for p in me.polygons: p.use_smooth = True
    return _obj(name, coll, me, mat)

def ibeam(name, coll, x0, x1, y, z, mat, w=0.12, h=0.16, t=0.016):
    # a steel I-section along X, its bottom at z
    prof = [(-w / 2, 0), (w / 2, 0), (w / 2, t), (t / 2, t), (t / 2, h - t), (w / 2, h - t), (w / 2, h), (-w / 2, h), (-w / 2, h - t), (-t / 2, h - t), (-t / 2, t), (-w / 2, t)]
    n = len(prof); verts = [(x0, y + a, z + b) for a, b in prof] + [(x1, y + a, z + b) for a, b in prof]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.validate(); me.update(); uv_world(me, Matrix.Identity(4), 0.5)
    return _obj(name, coll, me, mat)

def tiled_card(name, coll, w, h, loc, mat, tile=0.3, **k):
    # a card whose texture repeats every `tile` metres (the mesh: wires every 7.5 cm), not stretched over it
    o = card(name, coll, w, h, loc, mat, **k)
    for d in o.data.uv_layers[0].data: d.uv = (d.uv[0] * w / tile, d.uv[1] * h / tile)
    return mk(o)

def retile(o, scale):
    while o.data.uv_layers: o.data.uv_layers.remove(o.data.uv_layers[0])
    uv_world(o.data, o.matrix_world, scale); return o

def grid_out(o, cell=0.3):
    # more vertices on big flat faces, for the vertex-colour AO to land somewhere
    bm = bmesh.new(); bm.from_mesh(o.data)
    long = max((e.calc_length() for e in bm.edges), default=0)
    cuts = min(14, int(long / cell))
    if cuts > 0: bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    bm.to_mesh(o.data); bm.free(); o.data.update()

def px_tex(name, col, alpha=None):
    h, w = col.shape[:2]; rgba = np.ones((h, w, 4), np.float32); rgba[..., :3] = psx(col)
    if alpha is not None: rgba[..., 3] = alpha
    im = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=alpha is not None)
    if tuple(im.size) != (w, h): im.scale(w, h)
    im.pixels = rgba.ravel(); im.filepath_raw = os.path.join(GEN, name + '.png'); im.file_format = 'PNG'; im.save(); return im


def cutout_mat(name, col, alpha, rough=0.6):
    # a material you see through where alpha < 0.5 (welded mesh, grating, a fence): glTF alphaMode MASK. Leave it out
    # of bake_ao (skip=), it doesn't shade
    m = mat_img(name, px_tex(name, col, alpha=alpha), rough)
    nt = m.node_tree; t = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]; g = nt.nodes.new('ShaderNodeMath'); g.operation = 'GREATER_THAN'; g.inputs[1].default_value = 0.5
    nt.links.new(t.outputs['Alpha'], g.inputs[0]); nt.links.new(g.outputs[0], nt.nodes['Principled BSDF'].inputs['Alpha'])
    return m


def plain_mat(name, rgb, dirt=0.25, fleck=0.03, rough=0.7):
    # a smooth surface (laminate, beige plastic, painted board): its colour with a fine fleck and soft grime. The metal
    # tiles' blotches read as camouflage on these
    m_ = 64; c = np.ones((m_, m_, 3), np.float32) * np.array(rgb, np.float32)
    c = c * (1 + fleck * (vnoise(m_, m_, 1, wrap=True) - 0.5) * 2)[..., None]
    return mat_img(name, px_tex(name, grime(c, np.clip(fbm(m_, m_, (32, 8), wrap=True) - 0.35, 0, 1) * dirt)), rough)


def art_cutout(name, png, emit=None):
    # a printed card that uses the PNG's own transparency (chalk marks, sparks, a decal): glTF MASK; emit: it glows
    im = bpy.data.images.load(png, check_existing=True); m = bpy.data.materials.new(name)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']; t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    g = nt.nodes.new('ShaderNodeMath'); g.operation = 'GREATER_THAN'; g.inputs[1].default_value = 0.5
    nt.links.new(t.outputs['Alpha'], g.inputs[0]); nt.links.new(g.outputs[0], p.inputs['Alpha'])
    p.inputs['Roughness'].default_value = 0.9; p.inputs['Metallic'].default_value = 0.0
    if emit: nt.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    return m


def solid_mat(name, rgb, rough=0.5):
    m = mat_img(name, None, rough); m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1); return m


def bake_ao(coll, skip=(), distance=0.55, samples=64, wall=True):
    # ambient occlusion into a vertex colour ('AO') on everything built here (BUILT) in coll, against a floor and a wall
    # where the station stands (its back on y = 0), lifted so it darkens without blacking out; every material those use
    # gets its base colour multiplied by it (glTF COLOR_0: three.js multiplies it in). skip: materials left out (a
    # see-through cutout); those meshes get plain white AO so they aren't black in the game
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.device = 'CPU'
    if not sc.world: sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = distance; sc.cycles.samples = samples
    occ = bpy.data.materials.get('TMP_Occluder') or mat_img('TMP_Occluder', None)
    tmp = [box('TMP_Floor', coll, (12, 12, 0.02), (0, -2, -0.01), occ)] + ([box('TMP_Wall', coll, (12, 0.02, 6), (0, 0.01, 3), occ)] if wall else [])   # (wall=False: a piece out in the room, a car bay)
    mine = set(coll.all_objects)
    objs = [o for o in BUILT if o in mine and o.type == 'MESH' and not any(m in skip for m in o.data.materials)]
    for o in objs:
        a = o.data.color_attributes.get('AO') or o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER'); o.data.color_attributes.active_color = a
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for o in objs:   # (lifted: AO darkens, never blacks out; a little warm in the dark)
        a = o.data.color_attributes['AO']; v = np.empty(len(a.data) * 4, np.float32); a.data.foreach_get('color', v); v = v.reshape(-1, 4)
        k = 0.42 + 0.58 * np.clip(v[:, 0], 0, 1) ** 0.85; v[:, 0] = k; v[:, 1] = k * 0.985; v[:, 2] = k * 0.96; v[:, 3] = 1; a.data.foreach_set('color', v.ravel())
    for t in tmp: bpy.data.objects.remove(t, do_unlink=True)
    # every material the built things use: base colour times the AO
    mats = {m for o in objs for m in o.data.materials if m}
    for m in mats:
        nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
        if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'AO'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        src = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
        if src: nt.links.new(src, mix.inputs['A'])
        else: mix.inputs['A'].default_value = p.inputs['Base Color'].default_value
        nt.links.new(ca.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    # (anything built that wasn't baked, the mesh: plain white AO so it isn't black in the game)
    for o in BUILT:
        if o in mine and o.type == 'MESH' and 'AO' not in o.data.color_attributes:
            a = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER'); v = np.ones(len(a.data) * 4, np.float32); a.data.foreach_set('color', v)
    return len(objs)

def export_station(coll, path):
    # the station's collection to a .glb: lights, extras (the hooks' clip/role), the AO as COLOR_0
    objs = [o for o in coll.all_objects if not o.name.startswith(('GUIDE', 'TMP'))]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_cameras=False, export_lights=True,
                              export_extras=True, export_apply=True, export_yup=True, export_vertex_color='ACTIVE')
    print('exported', path)


def tris(coll):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in coll.all_objects if o.type == 'MESH')
