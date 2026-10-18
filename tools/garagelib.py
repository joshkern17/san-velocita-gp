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
