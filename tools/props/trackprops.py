# Bakes the race-track prop pack (RaceTrackPropCollection Vol1, your purchase) and your stadium light mast into the
# scenery library: assets/env/trackprops.glb, and their entries in assets/env/catalog.json (replacing an earlier bake).
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b "<unzipped pack>/RaceTrackPropCollection Vol1.blend" \
#     --python tools/props/trackprops.py -- ~/Downloads/stadium_light.glb
#
# Every piece goes into the library's own space (envlib.js): metres, +Y up, front facing +Z (the track side), centred on
# x/z with its base at y = 0. In the pack everything faces +X (Blender), so it's turned a quarter to face -Y (glTF +Z).
# Textures are shrunk (the PS1 filters hide the rest): the logo sheet stays at 1024 so the logos still read, and keeps
# its layout (the game redraws it with custom logos: js/trackprops.js). WebP (small, and keeps the alpha cut-outs).
# The heavier pieces are simplified (a lamp post doesn't need 1,300 triangles). Normal / roughness / metal maps are dropped
# (the game lights everything Lambert); alpha cut-outs (truss lattices, fence mesh) and lamp glow maps are kept.
#
# Extras the game needs, in each catalogue entry:
#   seats   grandstands: one per chair, [x, y, z] in the model's space, y = the seat pan's height (js/trackprops.js
#           sits a fan on each, with the crowd from js/crowd.js)
#   span    goes over the track (gantries, arches): placed across it, not beside it
#   lamps   floodlights: [x, y, z] of the lamp heads (they light what's in front of them)
#   heads   ad towers: [x, y, z] of their spotlights. The heads are cut off the tower and baked once on their own
#           (tp_adtower_head, the lens facing +Z, centred on its pivot): the game puts them back aimed at the track
# The start-light gantry (tp_start_gantry, not in the palette) has five lamp boxes (the pack's six, one taken out and
# the rest centred, like a Formula One gantry), each lamp its own material: LampR0..4 / LampG0..4, 0 = the drivers' left.
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MAST = os.path.expanduser(args[0]) if args else None
OUT = os.path.join(ROOT, 'assets', 'env', 'trackprops.glb')
CAT = os.path.join(ROOT, 'assets', 'env', 'catalog.json')
TURN = Matrix.Rotation(-math.pi / 2, 4, 'Z')  # (+X front -> -Y, which is glTF +Z)

# id, source object, family (the editor's tile), label, extras
PIECES = [
  ('tp_stand_roof_a', 'RaceTrackSeats_0', 'stand_roof', 'Covered Grandstand', {}),
  ('tp_stand_roof_b', 'RaceTrackSeats_1', 'stand_roof', 'Covered Grandstand', {}),
  ('tp_stand_flags_a', 'RaceTrackSeats_0.001', 'stand_flags', 'Grandstand with Flags', {}),
  ('tp_stand_flags_b', 'RaceTrackSeats_1.001', 'stand_flags', 'Grandstand with Flags', {}),
] + [('tp_adtower_%d' % k, 'Brands_Towers_%02d' % k, 'adtower', 'Ad Tower', {}) for k in range(7)] \
  + [('tp_gantry_%d' % k, 'Tower_%d' % (k + 1), 'gantry', 'Banner Gantry', {'span': 1}) for k in range(5)] \
  + [('tp_gantry_wide_%d' % k, 'Billboard_Tower_%d' % k, 'gantry_wide', 'Wide Banner Gantry', {'span': 1}) for k in range(3)] \
  + [('tp_board_%d' % k, 'Brands_%02d' % k, 'board', 'Ad Board', {}) for k in range(7)] \
  + [('tp_flag_%d' % k, 'Flags_%02d' % k, 'flag', 'Sponsor Flag', {}) for k in range(8)] \
  + [('tp_lamppost_%d' % k, 'Poles_%d' % k, 'lamppost', 'Lamp Post with Banner', {'decimate': 0.5}) for k in range(5)] \
  + [
  ('tp_lamppost_plain', 'Poles_5', 'lamppost_plain', 'Lamp Post', {'decimate': 0.5}),
  ('tp_lamppost_slim', 'Poles_6', 'lamppost_plain', 'Lamp Post', {}),
  ('tp_worklight_a', 'Poles_7', 'worklight', 'Work Light', {}),
  ('tp_worklight_b', 'Poles_8', 'worklight', 'Work Light', {}),
  ('tp_stadium_light', 'StadiumLight', 'stadium_light', 'Stadium Light', {}),
  ('tp_camera_tower', 'CameraTower', 'camera_tower', 'Camera Tower', {}),
  ('tp_arch_balloons', 'Arch', 'arch_balloons', 'Balloon Arch', {'span': 1, 'decimate': 0.14}),
  ('tp_arch_0', 'Arch_2', 'arch', 'Truss Arch', {'span': 1, 'decimate': 0.5}),
  ('tp_arch_1', 'Arch_3', 'arch', 'Truss Arch', {'span': 1, 'decimate': 0.5}),
  ('tp_arch_2', 'Arch_4', 'arch', 'Truss Arch', {'span': 1, 'decimate': 0.5}),
  ('tp_festoon', 'Decoration Lights', 'festoon', 'Festoon Lights', {'decimate': 0.3}),
  ('tp_fence_0', 'Rails_00', 'fence', 'Paddock Fence', {}),
  ('tp_fence_1', 'Rails_01', 'fence', 'Paddock Fence', {}),
  ('tp_fence_2', 'Rails_02', 'fence', 'Paddock Fence', {}),
  ('tp_fence_3', 'Rails_03', 'fence', 'Paddock Fence', {}),
  ('tp_fence_4', 'Rails_04', 'fence', 'Paddock Fence', {}),
  ('tp_tire_rack', 'TireRack', 'tire_rack', 'Tire Rack', {'decimate': 0.3}),
  ('tp_pit_building_a', 'Pitlane_1', 'pit_building', 'Pit Building', {}),
  ('tp_pit_building_b', 'Pitlane_2', 'pit_building', 'Pit Building', {'turn': 0}),
  ('tp_start_gantry', 'StartingLight', 'start_gantry', 'Start Lights', {'start': 1, 'hidden': 1}),
]
TEX_MAX = {'Brands_Color': 1024, 'PitlaneTrim': 512, 'MetalTrim_Base': 512, 'MetalTrim_2_Base': 512}

# ---------- materials: base colour (+ alpha cut-out, + glow) only, textures shrunk ----------
def feeding(inp):
    if not inp.is_linked: return None
    n = inp.links[0].from_node
    while n.type != 'TEX_IMAGE' and n.inputs and any(i.is_linked for i in n.inputs):
        n = [i for i in n.inputs if i.is_linked][0].links[0].from_node
    return n.image if n.type == 'TEX_IMAGE' else None
shrunk = {}
def small(img, alpha=False):
    if img is None: return None
    key = img.name
    if key in shrunk: return shrunk[key]
    mx = 256
    for k, v in TEX_MAX.items():
        if k in img.name: mx = v
    w, h = img.size
    c = img.copy(); c.name = 'tp_' + os.path.splitext(img.name)[0].replace('TextureTrim_', '')
    if max(w, h) > mx: c.scale(max(1, w * mx // max(w, h)), max(1, h * mx // max(w, h)))
    c.file_format = 'PNG' if alpha else 'JPEG'
    shrunk[key] = c
    return c
clean = {}
def simple(m):
    if m is None: return None
    if m.name in clean: return clean[m.name]
    b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m.use_nodes else None
    base = feeding(b.inputs['Base Color']) if b else None
    alpha = feeding(b.inputs['Alpha']) if b else None
    emis = feeding(b.inputs['Emission Color']) if b and 'Emission Color' in b.inputs else None
    n = bpy.data.materials.new('tp_' + m.name.replace('.001', '_b')); n.use_nodes = True
    nb = n.node_tree.nodes['Principled BSDF']; nb.inputs['Roughness'].default_value = 0.9; nb.inputs['Metallic'].default_value = 0
    if b: nb.inputs['Base Color'].default_value = b.inputs['Base Color'].default_value
    if base:
        t = n.node_tree.nodes.new('ShaderNodeTexImage'); t.image = small(base, alpha is not None)
        n.node_tree.links.new(t.outputs['Color'], nb.inputs['Base Color'])
        if alpha is not None:
            n.node_tree.links.new(t.outputs['Alpha'], nb.inputs['Alpha'])
            n.blend_method = 'CLIP'; n.alpha_threshold = 0.45
    if emis is not None and emis != base:
        e = n.node_tree.nodes.new('ShaderNodeTexImage'); e.image = small(emis)
        n.node_tree.links.new(e.outputs['Color'], nb.inputs['Emission Color']); nb.inputs['Emission Strength'].default_value = 1
    clean[m.name] = n
    return n

# ---------- pieces into an export scene ----------
src_scene = bpy.context.scene
ex = bpy.data.scenes.new('trackprops_export')
def bounds(obs):
    pts = [o.matrix_world @ v.co for o in obs for v in o.data.vertices]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
def bake_piece(o, turn=True, decimate=None):
    c = o.copy(); c.data = o.data.copy(); c.parent = None; c.animation_data_clear(); c.modifiers.clear()
    ex.collection.objects.link(c)
    # (the transform baked into the mesh)
    c.data.transform((TURN if turn else Matrix()) @ o.matrix_world); c.matrix_world = Matrix()
    if decimate:
        mod = c.modifiers.new('dec', 'DECIMATE'); mod.ratio = decimate
        vl = ex.view_layers[0]; vl.update(); dg = vl.depsgraph  # (the export scene's own: the piece lives there)
        ev = c.evaluated_get(dg); me = bpy.data.meshes.new_from_object(ev); c.modifiers.clear(); c.data = me
    for s in c.material_slots: s.material = simple(s.material)
    mn, mx = bounds([c])
    c.data.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
    return c
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

# grandstands: every chair is its own piece of the mesh; a seat on each, at the top of its seat pan
def chair_seats(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen, seats = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        isl, stack = [], [f]; seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        vs = {v for g in isl for v in g.verts}
        xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
        dx, dy, dz = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
        if not (0.25 < dx < 0.9 and 0.25 < dy < 0.9 and 0.3 < dz < 1.1 and len(vs) < 400): continue
        z0 = min(zs)
        pans = [g for g in isl if g.normal.z > 0.7 and g.calc_center_median().z < z0 + dz * 0.75]
        top = max((g.calc_center_median().z for g in pans), default=z0 + 0.42)
        # (the pan's middle across, a little in front of the back: where a sitter's hips go)
        cx = (min(xs) + max(xs)) / 2
        py = [g.calc_center_median().y for g in pans if abs(g.calc_center_median().z - top) < 0.05] or [(min(ys) + max(ys)) / 2]
        seats.append([round(cx, 3), round(top, 3), round(-sum(py) / len(py), 3)])  # (Blender -Y = glTF +Z)
    bm.free()
    seats.sort(key=lambda s: (s[1], s[0]))
    return seats

# the start lights: six boxes in the pack -> five, centred; each lamp its own material, by column
def five_lamps(o):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    mats = [s.material for s in o.material_slots]
    lamp_mi = {i for i, m in enumerate(mats) if m and ('Light_Red' in m.name or 'Light_Green' in m.name)}
    lf = [f for f in bm.faces if f.material_index in lamp_mi]
    lx0 = min(v.co.x for f in lf for v in f.verts) - 0.8; lx1 = max(v.co.x for f in lf for v in f.verts) + 0.8
    lz0 = min(v.co.z for f in lf for v in f.verts) - 1.0; lz1 = max(v.co.z for f in lf for v in f.verts) + 1.0
    # pieces wholly inside the light cluster's box, grouped into columns by x
    seen, isls = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        isl, stack = [], [f]; seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        vs = {v for g in isl for v in g.verts}
        xs = [v.co.x for v in vs]; zs = [v.co.z for v in vs]
        if min(xs) > lx0 and max(xs) < lx1 and min(zs) > lz0 and max(zs) < lz1 and max(xs) - min(xs) < 1.2:
            isls.append(((min(xs) + max(xs)) / 2, isl))
    isls.sort(key=lambda t: t[0])
    cols, cur = [], []
    for cx, isl in isls:
        if cur and cx - cur[-1][0] > 0.35: cols.append(cur); cur = []
        cur.append((cx, isl))
    if cur: cols.append(cur)
    print('start lights: columns', len(cols), [round(sum(c[0] for c in col) / len(col), 2) for col in cols])
    centre = lambda col: sum(c[0] for c in col) / len(col)
    gx = sum(v.co.x for v in bm.verts) / len(bm.verts)
    if len(cols) == 6:
        drop = cols[-1] if abs(centre(cols[-1]) - gx) > abs(centre(cols[0]) - gx) else cols[0]
        cols.remove(drop)
        bmesh.ops.delete(bm, geom=list({f for _, isl in drop for f in isl}), context='FACES')
    shift = gx - centre(cols[len(cols) // 2])
    moved = set()
    for col in cols:
        for _, isl in col:
            for g in isl:
                for v in g.verts:
                    if v.index not in moved and v.is_valid: moved.add(v.index); v.co.x += shift
    # a material per lamp: LampR0..4 / LampG0..4 (0 = lowest x: the drivers' left, looking at the gantry from the grid)
    base = {}
    for i in lamp_mi: base[i] = 'R' if 'Red' in mats[i].name else 'G'
    for k, col in enumerate(cols):
        for kind in 'RG':
            src = next(mats[i] for i in lamp_mi if base[i] == kind)
            m = src.copy(); m.name = 'Lamp%s%d' % (kind, k)
            o.data.materials.append(m)
            mi = len(o.data.materials) - 1
            for _, isl in col:
                for g in isl:
                    if g.is_valid and g.material_index in lamp_mi and base[g.material_index] == kind: g.material_index = mi
    bm.to_mesh(me); bm.free()
    return len(cols)

def lamp_heads(o, lens_test):
    """centres of the lamp heads (faces whose material passes lens_test), clustered 1 m apart"""
    pts = []
    for p in o.data.polygons:
        m = o.material_slots[p.material_index].material if o.material_slots else None
        if m and lens_test(m): pts.append(p.center.copy())
    heads = []
    for q in pts:
        for h in heads:
            if (h[0] / h[1] - q).length < 1.0: h[0] += q; h[1] += 1; break
        else: heads.append([q.copy(), 1])
    return [[round(c.x / n, 2), round(c.z / n, 2), round(-c.y / n, 2)] for c, n in heads]

# the ad tower's spotlights: small pieces (a housing and its lens) up its corners. Cut out of the tower's mesh; the
# first tower's first pair becomes tp_adtower_head. Returns the heads' pivots (glTF space)
head_tpl = [None]
def islands(bm):
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        isl, stack = [], [f]; seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        out.append(isl)
    return out
def cut_heads(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    small = []
    for isl in islands(bm):
        vs = {v for g in isl for v in g.verts}
        mn = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs))); mx = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
        if (mx - mn).length < 1.6 and len(isl) >= 10 and mn.z > 5: small.append({'isl': isl, 'c': (mn + mx) / 2, 'n': len(isl)})
    lenses = [q for q in small if q['n'] <= 14]; housings = [q for q in small if q['n'] > 14]
    heads = []
    for L in lenses:
        H = min(housings, key=lambda q: (q['c'] - L['c']).length, default=None)
        if H is None or (H['c'] - L['c']).length > 1.2: continue
        d = Vector()
        for g in L['isl']: d += g.normal * g.calc_area()
        heads.append({'faces': L['isl'] + H['isl'], 'c': (L['c'] + H['c']) / 2, 'd': d.normalized()})
    if heads and head_tpl[0] is None:
        h = heads[0]
        nb = bmesh.new(); uv0 = bm.loops.layers.uv.active; uv1 = nb.loops.layers.uv.new('UVMap') if uv0 else None; vmap = {}
        rot = h['d'].rotation_difference(Vector((0, -1, 0))).to_matrix()  # (the lens to -Y: glTF +Z)
        for f in h['faces']:
            vv = []
            for v in f.verts:
                if v not in vmap: vmap[v] = nb.verts.new(rot @ (v.co - h['c']))
                vv.append(vmap[v])
            try: nf = nb.faces.new(vv)
            except ValueError: continue
            nf.material_index = f.material_index
            if uv0:
                for l0, l1 in zip(f.loops, nf.loops): l1[uv1].uv = l0[uv0].uv
        me = bpy.data.meshes.new('tp_adtower_head'); nb.to_mesh(me); nb.free()
        for m in o.data.materials: me.materials.append(m)
        ho = bpy.data.objects.new('tp_adtower_head', me); ex.collection.objects.link(ho)
        head_tpl[0] = ho
    bmesh.ops.delete(bm, geom=list({f for h in heads for f in h['faces']}), context='FACES')
    bm.to_mesh(o.data); bm.free()
    return [[round(h['c'].x, 3), round(h['c'].z, 3), round(-h['c'].y, 3)] for h in heads]

entries = []
def add_entry(c, pid, fam, label, extra):
    mn, mx = bounds([c])
    e = {'cat': 'trackside', 'cls': fam, 'tags': ['circuit'], 'id': pid, 'pack': 'trackprops', 'label': label,
         'w': round(mx.x - mn.x, 2), 'h': round(mx.z - mn.z, 2), 'd': round(mx.y - mn.y, 2), 'tris': tris(c)}
    for k in ('span', 'hidden', 'start'):
        if extra.get(k): e[k] = 1
    entries.append(e)
    return e

for pid, src, fam, label, extra in PIECES:
    o = bpy.data.objects.get(src)
    if not o: print('missing', src); continue
    if extra.get('start'):
        c = o.copy(); c.data = o.data.copy(); c.parent = None; ex.collection.objects.link(c)
        c.data.transform(TURN @ o.matrix_world); c.matrix_world = Matrix()  # (turned first: the boxes run along x)
        n = five_lamps(c)
        for s in c.material_slots:
            if not s.material.name.startswith('Lamp'): s.material = simple(s.material)
        for s in c.material_slots:  # (the lamps keep their LED textures, shrunk)
            if s.material.name.startswith('Lamp'):
                b = s.material.node_tree.nodes.get('Principled BSDF')
                for nd in s.material.node_tree.nodes:
                    if nd.type == 'TEX_IMAGE' and nd.image: nd.image = small(nd.image)
        mn, mx = bounds([c]); c.data.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
        c.name = pid; add_entry(c, pid, fam, label, extra)['boxes'] = n
        continue
    c = bake_piece(o, turn=extra.get('turn', 1) != 0, decimate=extra.get('decimate'))
    c.name = pid
    e = add_entry(c, pid, fam, label, extra)
    if fam.startswith('stand'): e['seats'] = chair_seats(c); print(pid, 'seats', len(e['seats']))
    if fam == 'stadium_light': e['lamps'] = lamp_heads(c, lambda m: 'MetalTrim' in m.name and False) or []
    if fam == 'adtower':
        e['heads'] = cut_heads(c); e['tris'] = tris(c); print(pid, 'spotlights', len(e['heads']))

if head_tpl[0] is not None:
    e = add_entry(head_tpl[0], 'tp_adtower_head', 'adtower_head', 'Ad Tower Spotlight', {'hidden': 1})

# ---------- the stadium light mast (stadium_light.glb): its ground plane dropped, the lamp domes simplified ----------
if MAST and os.path.exists(MAST):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=MAST)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in new:
        if o.name.startswith('Plane'): bpy.data.objects.remove(o); continue
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get()
    parts = []
    for o in new:
        if len(o.data.polygons) > 3000:
            mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = 0.07
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world)
        parts.append(me)
    # one object out of them (each part's material slots renumbered into one list first)
    mats = []
    for me in parts:
        for m in me.materials:
            if m not in mats: mats.append(m)
    for me in parts:
        for p in me.polygons: p.material_index = mats.index(me.materials[p.material_index])
    bm = bmesh.new()
    for me in parts: bm.from_mesh(me)
    mesh = bpy.data.meshes.new('tp_floodmast'); bm.to_mesh(mesh); bm.free()
    # (materials by colour: the white lenses glow at night)
    for m in mats:
        b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        col = b.inputs['Base Color'].default_value if b else (0.1, 0.1, 0.1, 1)
        lens = sum(col[:3]) / 3 > 0.45
        n = bpy.data.materials.new('tp_MastLens' if lens else 'tp_MastSteel'); n.use_nodes = True
        nb = n.node_tree.nodes['Principled BSDF']; nb.inputs['Base Color'].default_value = (0.93, 0.92, 0.88, 1) if lens else (0.09, 0.09, 0.1, 1)
        mesh.materials.append(n)
    ob = bpy.data.objects.new('tp_floodmast', mesh); ex.collection.objects.link(ob)
    mn, mx = bounds([ob]); H = mx.z - mn.z
    k = 27.0 / H  # (a 27 m mast)
    mesh.transform(Matrix.Scale(k, 4)); mesh.transform(TURN)
    mn, mx = bounds([ob]); mesh.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
    e = add_entry(ob, 'tp_floodmast', 'floodmast', 'Floodlight Mast', {})
    e['lamps'] = lamp_heads(ob, lambda m: m.name.startswith('tp_MastLens'))
    print('floodmast', e['tris'], 'tris', len(e['lamps']), 'lamps')

# the pack's stadium light: its lamp panel is the top of the mast, facing front
for e in entries:
    if e['cls'] == 'stadium_light' and not e.get('lamps'):
        e['lamps'] = [[0, round(e['h'] - 2.6, 2), 0.6]]

# ---------- export + catalogue ----------
bpy.context.window.scene = ex if bpy.context.window else ex
for o in list(ex.collection.objects): o.select_set(False)
with bpy.context.temp_override(scene=ex):
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, use_active_scene=True, export_apply=True,
                              export_yup=True, export_image_format='WEBP', export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
cat = json.load(open(CAT))
cat['packs']['trackprops'] = {'title': 'Race Track Prop Collection Vol. 1 + Stadium Light', 'author': 'see pack', 'license': 'see pack', 'source': ''}
cat['assets'] = [a for a in cat['assets'] if a.get('pack') != 'trackprops'] + entries
open(CAT, 'w').write(json.dumps(cat, indent=1, ensure_ascii=False))
print('trackprops', len(entries), 'pieces', round(os.path.getsize(OUT) / 1024), 'KB')
