# A detailed (mid/high-poly) car model straight into the game, no low-poly pass: a look test of the original style.
#
#   Blender -b -P tools/cars/hdcar.py -- <source.glb> <out.glb> <low-poly counterpart.glb | -> <tire mat> [lamps json]
#
# Without a counterpart ('-'): kept at the model's own size (LEN=<m> scales it to that length) with the centre of mass
# CG=<share of the wheelbase behind the front axle, default 0.55> at the origin; it prints the a / b / body numbers for
# the car's spec in js/cars.js. Env: PAINT, DROP (material names to leave out, e.g. fake motion-blur rim discs);
# '=name' matches a material name exactly, anything else as a substring. NOSE=-y|+y: which end of the source is the front
# (default: the end with the narrower tires). Sources whose tires share a material with other parts, or sit in two
# materials: tools/cars/hdprep.py first.
#
# Normalizes the source into car space (metres, nose -Y in Blender = +Z in the game, ground at the tire bottom), finds
# its four wheels (the tires by material, then every loose part inside a tire's cylinder spins with it; calipers and
# springs stay on the body), then scales / slides it so its axles sit where the low-poly counterpart's do: the car can
# then share that car's spec unchanged. Writes top-level Body / Wheel_FL.. / Light_Head / Light_Tail (js/roadcar.js).
# lamps json: {"<material substring>": "head" | "tail" | "split"} (split: front half head, rear half tail)
import bpy, sys, json, math, os
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, LOW, TK = a[0], a[1], a[2], a[3].lower()
LAMPS = {k.lower(): v for k, v in json.loads(a[4]).items()} if len(a) > 4 else {}
STAY = ('brembo', 'caliper', 'spring', 'mechanic')                          # inside the rim but not spinning
STAY_EXACT = ('brake',)

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in obs:
        o.data = o.data.copy() if o.data.users > 1 else o.data
        o.data.transform(o.matrix_world)
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH': bpy.data.objects.remove(o)
    for o in obs: o.parent = None; o.matrix_world = Matrix.Identity(4)
    return obs

matches = lambda m, keys: any(m == k[1:] if k.startswith('=') else k in m for k in keys)
envlist = lambda k: [x.strip().lower() for x in os.environ.get(k, '').split(',') if x.strip()]
PAINT, DROP = envlist('PAINT'), envlist('DROP')
# the low-poly counterpart's axles (its Wheel_* centres)
if LOW != '-':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=LOW)
    lw = {}
    for o in bpy.context.scene.objects:
        t = o
        while t.parent: t = t.parent
        if o.type == 'MESH' and t.name.startswith('Wheel_'):
            lw.setdefault(t.name[6:8], []).extend(o.matrix_world @ v.co for v in o.data.vertices)
    lowY = {k: (min(v.y for v in vs) + max(v.y for v in vs)) / 2 for k, vs in lw.items()}
    lowF, lowR = (lowY['FL'] + lowY['FR']) / 2, (lowY['RL'] + lowY['RR']) / 2

obs = load(SRC)
for o in [o for o in obs if not any(o.data.materials)]: obs.remove(o); bpy.data.objects.remove(o)
mname = lambda o, p: (o.data.materials[p.material_index].name if o.data.materials and o.data.materials[p.material_index] else '').lower()
tire = lambda o, p: TK in mname(o, p)

def tire_verts():
    return [o.data.vertices[i].co.copy() for o in obs for p in o.data.polygons if tire(o, p) for i in p.vertices]

# centre on x / y, ground at the tire bottom; the end with the wider tires is the tail (+Y)
vs = tire_verts()
allv = [v.co for o in obs for v in o.data.vertices]
cx = (min(v.x for v in allv) + max(v.x for v in allv)) / 2; cy = (min(v.y for v in allv) + max(v.y for v in allv)) / 2
gz = min(v.z for v in vs)
width = lambda sel: (max(v.x for v in sel) - min(v.x for v in sel)) if sel else 0
front = [v for v in vs if v.y < cy and v.x > cx]; rear = [v for v in vs if v.y > cy and v.x > cx]
rot = 0 if width(rear) >= width(front) else math.pi
# (NOSE=-y / +y: the source's nose end, for cars with the same tires all round, where the width test is a coin toss:
# the GT-One came out backwards)
if os.environ.get('NOSE'): rot = 0 if os.environ['NOSE'] == '-y' else math.pi
M = Matrix.Rotation(rot, 4, 'Z') @ Matrix.Translation((-cx, -cy, -gz))
for o in obs: o.data.transform(M)

# loose parts: each vertex's root (union-find over the edges)
def islands(me):
    par = list(range(len(me.vertices)))
    def f(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for e in me.edges:
        x, y = f(e.vertices[0]), f(e.vertices[1])
        if x != y: par[x] = y
    return [f(i) for i in range(len(me.vertices))]
# the four tires: centre, radius, x range
def corners():
    # (stray specks in the tire material, e.g. the XJR-9's loose triangles in the nose, would pull a corner off: pieces
    # under 8 vertices don't count. Tires can be many pieces: tread blocks)
    W = {}
    for o in obs:
        me = o.data; tv = {i for p in me.polygons if tire(o, p) for i in p.vertices}
        if not tv: continue
        root = islands(me); size = {}
        for i in tv: size[root[i]] = size.get(root[i], 0) + 1
        for i in tv:
            if size[root[i]] >= 8:
                v = me.vertices[i].co.copy(); W.setdefault(('F' if v.y < 0 else 'R') + ('L' if v.x > 0 else 'R'), []).append(v)
    out = {}
    for k, s in W.items():
        lo = [min(v[i] for v in s) for i in range(3)]; hi = [max(v[i] for v in s) for i in range(3)]
        out[k] = {'c': Vector([(l + h) / 2 for l, h in zip(lo, hi)]), 'r': (hi[2] - lo[2]) / 2, 'x': (lo[0], hi[0])}
    return out
C = corners()
hdF, hdR = (C['FL']['c'].y + C['FR']['c'].y) / 2, (C['RL']['c'].y + C['RR']['c'].y) / 2
if LOW != '-':
    s = (lowR - lowF) / (hdR - hdF)
    # scale about the ground, then slide the axles onto the low-poly's
    M = Matrix.Translation((0, lowF - hdF * s, 0)) @ Matrix.Scale(s, 4)
else:
    ys = [v.co.y for o in obs for v in o.data.vertices]
    s = float(os.environ['LEN']) / (max(ys) - min(ys)) if os.environ.get('LEN') else 1.0
    # the centre of mass at the origin, CG of the wheelbase behind the front axle
    M = Matrix.Translation((0, -(hdF + float(os.environ.get('CG', 0.55)) * (hdR - hdF)) * s, 0)) @ Matrix.Scale(s, 4)
for o in obs: o.data.transform(M)
C = corners()
print('HD scale', round(s, 4), 'rot', rot, {k: ([round(x, 3) for x in w['c']], round(w['r'], 3)) for k, w in C.items()})

# per face: Body / Wheel_xx / Light_Head / Light_Tail, by loose part
def wheel_box(lo, hi):
    # the wheel whose slot (its tire's x range, a square round the tire) holds the part's box
    for k, w in C.items():
        x0, x1 = w['x']; inner = 0.06 # (hubs / discs reach a little inside the tire)
        if w['c'].x > 0: x0 -= inner
        else: x1 += inner
        if lo[0] < x0 - 0.01 or hi[0] > x1 + 0.01: continue
        R = w['r'] * 1.01
        if lo[1] >= w['c'].y - R and hi[1] <= w['c'].y + R and lo[2] >= w['c'].z - R and hi[2] <= w['c'].z + R: return k
    return None
def wheel_of(me, root, box):
    # then every vertex inside the tire's circle (a box test alone takes in bits of the arch past the tire's corners)
    lab = {r: wheel_box(*b) for r, b in box.items()}
    far = {r: 0.0 for r, k in lab.items() if k}
    for v in me.vertices:
        r = root[v.index]
        if r in far:
            w = C[lab[r]]['c']; far[r] = max(far[r], math.hypot(v.co.y - w.y, v.co.z - w.z))
    return {r: ('Wheel_' + k if k and far[r] <= C[k]['r'] * 1.01 else None) for r, k in lab.items()}
def lamp_of(m, y):
    for k, v in LAMPS.items():
        if matches(m, [k]): return 'Light_' + ('Head' if v == 'head' or (v == 'split' and y < 0) else 'Tail')
    return None
# lamps by place (LAMPBOX: {"tail": [[x0, x1, z0, z1], ...], "head": [...]}, metres in car space, |x| so both sides):
# for lamps sharing a texture sheet with other parts. A face counts if its centre is in a box, within 0.9 m of that
# end of the car and facing out of it; not paint, unless the box has a fifth value 1 (lamps drawn on the paint's
# texture: the 787B's tail strips; keep that box tight round the lamp)
BOXES = json.loads(os.environ.get('LAMPBOX', '{}'))
REACH = float(os.environ.get('LAMP_REACH', 0.9)) # (how far back from the car's end a lamp face can be, m: the 944's pop-ups sit further back)
YLO = min(v.co.y for o in obs for v in o.data.vertices); YHI = max(v.co.y for o in obs for v in o.data.vertices)
def lamp_box(p, m):
    c, n, paint = p.center, p.normal, matches(m, PAINT)
    for kind, ok in (('tail', n.y > 0.3 and c.y > YHI - REACH), ('head', n.y < -0.3 and c.y < YLO + REACH)):
        if ok and any(b[0] <= abs(c.x) <= b[1] and b[2] <= c.z <= b[3] and (not paint or (len(b) > 4 and b[4])) for b in BOXES.get(kind, [])): return 'Light_' + kind.title()
    return None

groups = {}
for o in list(obs):
    me = o.data
    if not len(me.polygons): obs.remove(o); bpy.data.objects.remove(o); continue
    root = islands(me)
    box = {}
    for v in me.vertices:
        r = root[v.index]; b = box.get(r)
        if b is None: box[r] = [list(v.co), list(v.co)]
        else:
            for i in range(3): b[0][i] = min(b[0][i], v.co[i]); b[1][i] = max(b[1][i], v.co[i])
    lab = wheel_of(me, root, box)
    tags = []
    for p in me.polygons:
        m = mname(o, p)
        t = lab[root[p.vertices[0]]]
        if t and (any(k in m for k in STAY) or m in STAY_EXACT): t = None
        if not t: t = lamp_of(m, p.center.y) or (lamp_box(p, m) if BOXES else None)
        if matches(m, DROP): t = 'Drop'
        tags.append(t or 'Body')
    # split off each tag but the last; what's left of the object is the last. Each face carries its tag as a face
    # attribute through the splits (separate doesn't keep the rest of the faces in order: going by position mixed the
    # 962C's wheels and lamps up, each wheel then spanning the car)
    order = sorted(set(tags))
    if len(order) > 1:
        A = me.attributes.new('hdtag', 'INT', 'FACE'); A.data.foreach_set('value', [order.index(g) for g in tags])
    for k, t in enumerate(order[:-1]):
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
        me = o.data; tv = [0] * len(me.polygons); me.attributes['hdtag'].data.foreach_get('value', tv)
        me.polygons.foreach_set('select', [v == k for v in tv])
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
        groups.setdefault(t, []).append([x for x in bpy.context.selected_objects if x != o][0])
    groups.setdefault(order[-1], []).append(o)

for x in groups.pop('Drop', []): bpy.data.objects.remove(x)
for x in [x for x in bpy.data.objects if x.type == 'MESH' and 'hdtag' in x.data.attributes]: x.data.attributes.remove(x.data.attributes['hdtag'])
for t, list_ in groups.items():
    list_ = [x for x in list_ if len(x.data.polygons)]
    if not list_: continue
    bpy.ops.object.select_all(action='DESELECT')
    for x in list_: x.select_set(True)
    bpy.context.view_layer.objects.active = list_[0]
    if len(list_) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = t; ob.data.name = t
    print('HD part', t, len(ob.data.polygons), 'faces')
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH' and not len(o.data.polygons)]: bpy.data.objects.remove(o)
# glass: the game ignores glTF transmission (these models' windows came out opaque green): opaque, near black and
# glossy, as the other cars' windows (the cockpit behind it is never seen, so the cull below takes it out)
GLASS = lambda n: any(k in n for k in ('glass', 'window', 'windscreen')) and 'light' not in n
for m in bpy.data.materials:
    if not m.use_nodes or not GLASS(m.name.lower()): continue
    bsdf = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for k in ('Base Color', 'Alpha', 'Transmission Weight'):
        for l in list(bsdf.inputs[k].links): m.node_tree.links.remove(l)
    bsdf.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1); bsdf.inputs['Alpha'].default_value = 1
    bsdf.inputs['Transmission Weight'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.15
    m.surface_render_method = 'DITHERED'

# tail lamps: red. The game draws them unlit in their own texture (and brightens it on the brakes), so a clear lens
# (the F40's) or an unlit black strip (the 787B's) read white or black: each tail material gets a copy whose texture
# is the same in shades of red (the lens detail kept), on a copy of the material so other parts sharing it keep theirs.
# A texture that already has the lamp's reds in it (a cluster with amber indicators and white reversing lights: the
# 944's, the Corvette's) is left as it is; so is a plain colour that's already red, and a plain colour that isn't keeps
# its light and dark (a reflector behind a lens) as light and dark red
import numpy as np
def upstream_image(node, seen=0):
    # the image a base colour comes from, through mix / multiply nodes (vertex colours, tints)
    if node is None or seen > 6: return None
    if node.type == 'TEX_IMAGE': return node
    for inp in node.inputs:
        for l in inp.links:
            r = upstream_image(l.from_node, seen + 1)
            if r: return r
    return None
reddish = lambda r, g, b: (r > 0.25) & (r > g * 1.6) & (r > b * 1.6)
tail = bpy.data.objects.get('Light_Tail')
if tail and os.environ.get('TAIL_RED', '1') != '0':
    for i, m in enumerate(tail.data.materials):
        if not m or not m.use_nodes: continue
        m2 = m.copy(); m2.name = m.name + '_tail'; tail.data.materials[i] = m2
        bsdf = next((x for x in m2.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        src = upstream_image(bsdf.inputs['Base Color'].links[0].from_node) if bsdf.inputs['Base Color'].is_linked else None
        # (an image packed in the glTF isn't loaded until its pixels are read: has_data was False for the GT-One's and
        # NSX's lamps, and they lost their texture to a flat red)
        if src and src.image and len(src.image.pixels):
            px = np.empty(len(src.image.pixels), dtype=np.float32); src.image.pixels.foreach_get(px); px = px.reshape(-1, 4)
            seen = px[px[:, 3] > 0.1]
            share = float(np.mean(reddish(seen[:, 0], seen[:, 1], seen[:, 2]))) if len(seen) else 0
            if share > 0.08: print('HD tail texture kept', m.name, round(share, 2)); continue
            im = src.image.copy(); im.name = src.image.name + '_tail'
            l = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
            px[:, 0] = 0.35 + 0.65 * l; px[:, 1] = 0.02 + 0.1 * l; px[:, 2] = 0.02 + 0.08 * l
            im.pixels.foreach_set(px.ravel()); im.update(); im.pack(); src.image = im
        else:
            c = bsdf.inputs['Base Color'].default_value
            if reddish(c[0], c[1], c[2]): continue
            for l in list(bsdf.inputs['Base Color'].links): m2.node_tree.links.remove(l)
            k = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
            bsdf.inputs['Base Color'].default_value = (0.25 + 0.5 * k, 0.02, 0.02, 1)
    print('HD tail lamps red', len(tail.data.materials), 'materials')

# cull (CULL=0 skips): body faces no ray from outside reaches (cockpit, engine bay, the panels' inner skins, hidden
# brackets) are deleted. Rays come from 26 directions (below too: cars roll), on a jittered grid every CULL_STEP m;
# they pass through see-through materials (alpha-cut grilles, mesh: what's behind them shows). The wheels are neither
# culled nor occluders (they spin and steer: what they hide at one angle shows at another). Whole small parts are kept
# when any of them is seen, and the seen faces grow by two rings, so no pinholes open where a ray slipped past
import bmesh, random
from mathutils.bvhtree import BVHTree
def see_through(m):
    if not m or not m.use_nodes or GLASS(m.name.lower()): return False
    bsdf = next((x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED'), None)
    return bool(bsdf) and (bsdf.inputs['Alpha'].is_linked or bsdf.inputs['Alpha'].default_value < 0.99)
if os.environ.get('CULL', '1') != '0' and 'Body' in bpy.data.objects:
    body = bpy.data.objects['Body']; occ = [body] + [o for o in bpy.data.objects if o.name.startswith('Light_')]
    bm = bmesh.new(); thru = []
    for o in occ:
        n0 = len(bm.faces); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        st = [see_through(m) for m in o.data.materials]
        thru += [bool(st) and st[p.material_index] for p in o.data.polygons]
    nb = len(body.data.polygons); T = BVHTree.FromBMesh(bm)
    lo = [min(v.co[i] for v in bm.verts) for i in range(3)]; hi = [max(v.co[i] for v in bm.verts) for i in range(3)]
    ctr = Vector([(l + h) / 2 for l, h in zip(lo, hi)]); R = (Vector(hi) - Vector(lo)).length / 2 + 0.05
    STEP = float(os.environ.get('CULL_STEP', 0.008)); seen = bytearray(len(bm.faces)); rnd = random.Random(1)
    dirs = [Vector((x, y, z)).normalized() for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)]
    for d in dirs:
        u = d.orthogonal().normalized(); w = d.cross(u); n = int(2 * R / STEP)
        ox, oy = rnd.random() * STEP, rnd.random() * STEP
        for i in range(n):
            for j in range(n):
                o = ctr - d * R + u * (-R + ox + i * STEP) + w * (-R + oy + j * STEP)
                for _ in range(6):
                    hit = T.ray_cast(o, d, 2 * R)
                    if hit[0] is None: break
                    seen[hit[2]] = 1
                    if not thru[hit[2]]: break
                    o = hit[0] + d * 1e-4
    me = body.data; vis = [bool(seen[i]) for i in range(nb)]
    # small parts seen anywhere: kept whole
    root = islands(me); cnt = {}
    for p in me.polygons: r = root[p.vertices[0]]; cnt[r] = cnt.get(r, 0) + 1
    seenroot = {root[p.vertices[0]] for p in me.polygons if vis[p.index]}
    for p in me.polygons:
        r = root[p.vertices[0]]
        if r in seenroot and cnt[r] < 400: vis[p.index] = True
    for _ in range(2):  # (grow two rings)
        vv = bytearray(len(me.vertices))
        for p in me.polygons:
            if vis[p.index]:
                for v in p.vertices: vv[v] = 1
        vis = [vis[p.index] or any(vv[v] for v in p.vertices) for p in me.polygons]
    bm2 = bmesh.new(); bm2.from_mesh(me); bm2.faces.ensure_lookup_table()
    bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if not vis[f.index]], context='FACES')
    bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if not v.link_faces], context='VERTS')
    bm2.to_mesh(me); me.update()
    print('HD cull body', nb, '->', len(me.polygons), 'faces')
# wheels: dense ones (WHEEL_MAX faces each, default 30000; the F40's tread was 91k a wheel) simplified
WMAX = int(os.environ.get('WHEEL_MAX', 30000))
# (the mesh is read back from the evaluated modifier: bpy.ops.object.modifier_apply here mixed the four wheels' faces
# together, each wheel then spanning the whole car and orbiting its hub in the game: the 962C's and the F40's)
# (loose vertices / edges first: splitting the source's one all-wheels mesh leaves the other wheels' bare vertices in
# each piece; the exporter drops them, but the decimate joined them into faces, each wheel then spanning the car)
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    bm = bmesh.new(); bm.from_mesh(o.data)
    loose = [e for e in bm.edges if not e.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='EDGES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(o.data); o.data.update(); bm.free()
dg = bpy.context.evaluated_depsgraph_get()
for o in [o for o in bpy.data.objects if o.name.startswith('Wheel_')]:
    if len(o.data.polygons) > WMAX:
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = WMAX / len(o.data.polygons)
        dg.update(); new = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.remove(mod); o.data = new; new.name = o.name
        print('HD wheel', o.name, '->', len(o.data.polygons), 'faces')

# paint (PAINT env: material substrings, comma separated): those faces become Body_Livery, one material 'Livery' on a
# fresh non-overlapping unwrap and a white texture with the car's ambient occlusion baked in (panel gaps, vents and
# arches shade the paint like the white photos of the low-poly cars). The game paints liveries onto it (roadcar.js:
# the 'Livery' material's texture is the livery canvas, decals projected from 3D, so any unwrap works)
if PAINT:
    body = bpy.data.objects['Body']
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = body; body.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for p in body.data.polygons: p.select = matches(mname(body, p), PAINT)
    print('HD paint faces', sum(p.select for p in body.data.polygons))
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    liv = [x for x in bpy.context.selected_objects if x != body][0]; liv.name = liv.data.name = 'Body_Livery'
    me = liv.data
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='Livery')
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = liv; liv.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    RES = int(os.environ.get('LIVERY_RES', 2048))
    img = bpy.data.images.new('Livery', RES, RES, alpha=False)
    mat = bpy.data.materials.new('Livery'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.5; bsdf.inputs['Metallic'].default_value = 0
    me.materials.clear(); me.materials.append(mat)
    # bake the AO (the whole car occludes: everything is in the scene)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('AO_SAMPLES', 160))
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e: print('HD bake on CPU', e)
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.light_settings.distance = 0.35 # (AO reach, m: gaps and arches, not the whole underside)
    nt.nodes.active = tex
    bpy.ops.object.bake(type='AO', margin=8, use_clear=True)
    # white paint (~the low-poly photos' 200/255 on open panels), darkened by the AO; the gaps between islands plain paint
    import numpy as np
    px = np.empty(RES * RES * 4, dtype=np.float32); img.pixels.foreach_get(px)
    ao = px.reshape(-1, 4)[:, 0]
    v = 0.80 * (0.5 + 0.5 * np.clip(ao, 0, 1))          # linear: ~0.8 open (≈230 sRGB), dark in gaps
    v[ao <= 0] = 0.80
    out = np.repeat(v, 4).reshape(-1, 4); out[:, 3] = 1
    img.pixels.foreach_set(out.ravel()); img.update()
    img.file_format = 'PNG'; img.pack() # (packed, not saved next to OUT: parallel builds shared one temp file and swapped textures)
    print('HD livery', RES, 'open', float(np.mean(ao > 0.9)))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format=os.environ.get('IMG', 'WEBP'), export_image_quality=88) # (WebP: a fraction of the PNG size, alpha kept; IMG=AUTO when some textures won't encode as WebP)

for o in [o for o in bpy.data.objects if o.name.startswith('Wheel_')]:
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]
    w = C[o.name[6:8]]
    if max(xs) - min(xs) > 0.6 or max(ys) - min(ys) > 2.3 * w['r']: print('HD WARNING', o.name, 'spans', round(min(xs), 2), round(max(xs), 2), round(min(ys), 2), round(max(ys), 2))
# the numbers for the car's spec (js/cars.js): wheelbase, a / b (centre of mass to the axles), body [front, rear, half width]
# (C: the tires, measured after the last move)
vs = [o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Body') for v in o.data.vertices]
fa, ra = (C['FL']['c'].y + C['FR']['c'].y) / 2, (C['RL']['c'].y + C['RR']['c'].y) / 2
print('HD spec a', round(-fa, 3), 'b', round(ra, 3), 'body', [round(-min(v.y for v in vs), 2), round(max(v.y for v in vs), 2), round(max(abs(v.x) for v in vs), 2)],
      'wheelR', [round(C['FL']['r'], 3), round(C['RL']['r'], 3)], 'track', [round(C['FL']['c'].x - C['FR']['c'].x, 3), round(C['RL']['c'].x - C['RR']['c'].x, 3)])
