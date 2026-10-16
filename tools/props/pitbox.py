# A team's pit box as one Blender file you can edit (models/pitbox.blend), and the model the game reads from it
# (models/pitbox.glb: js/pitbox.js). Made once from the game's own box (tools/props/pitbox-dump.mjs), the furniture
# (models/pitprops.glb) and the desk from your garage (models/garage.glb); after that the .blend is the source.
#
#   node tools/props/pitbox-dump.mjs /tmp/pitbox.json
#   blender -b --python tools/props/pitbox.py -- /tmp/pitbox.json models/pitprops.glb models/garage.glb assets/textures \
#     models/pitbox.blend models/pitbox.glb
#
# The names the game looks for (docs/PIT-BOX-MODEL.md):
#   PLAYER_COMPUTER     your computer (the race-weekend menu's): only in your box, and the camera's shots are set from it
#   PLAYER_SCREEN       its glass: the computer's screen is drawn there
#   PLAYER_*            the rest of your desk: only in your box
#   TIMING_SCREEN       the glass the session's live timing shows on, in your box
#   TEAM_NAME           the plane the team's name is written on
#   TEAM_MAIN / TEAM_ACCENT (materials)   painted in each team's colors
#   REF_*               for reference only: the room (the game builds it to each box's width) and your car's spot
import bpy, bmesh, json, math, os, re, sys

argv = sys.argv[sys.argv.index('--') + 1:]
DUMP, PROPS, GARAGE, TEXDIR, OUT_BLEND, OUT_GLB = argv
J = json.load(open(DUMP))
CAR_Z = 6.5      # (your car's spot: this far in from the door; js/pitgarage.js CAR_Z)

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
sc = bpy.context.scene
def coll(name):
    c = bpy.data.collections.new(name); sc.collection.children.link(c); return c
C_BOX, C_DESK, C_REF = coll('Box'), coll('Your desk'), coll('Reference (the game ignores it)')

def srgb(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in v] + [1]

MATS = {}
def material(key, glow=False):
    if key in MATS: return MATS[key]
    name = {'MAIN': 'TEAM_MAIN', 'ACCENT': 'TEAM_ACCENT'}.get(key, ('GLOW_' if glow else 'col_') + key)
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    col = srgb('cc2222') if key == 'MAIN' else srgb('ffffff') if key == 'ACCENT' else srgb(key)
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = 0.9; m.diffuse_color = col
    if glow:
        b.inputs['Emission Color'].default_value = col; b.inputs['Emission Strength'].default_value = 1.0
    MATS[key] = m; return m

def textured(name, tex):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF'); b.inputs['Roughness'].default_value = 0.9
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEXDIR, tex + '.png')); t.interpolation = 'Closest'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m

def mesh(name, d, collection, mats_for):
    """d: the dump's mesh (triangle soup, Blender coords); mats_for(tri) -> material"""
    P, UV = d['pos'], d['uv']
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap') if UV else None
    slots = []
    for t in range(len(P) // 9):
        vs = [bm.verts.new(P[t * 9 + k * 3: t * 9 + k * 3 + 3]) for k in range(3)]
        try: f = bm.faces.new(vs)
        except ValueError: continue
        m = mats_for(t)
        if m not in slots: slots.append(m)
        f.material_index = slots.index(m)
        if uvl:
            for k, l in enumerate(f.loops): l[uvl].uv = (UV[(t * 3 + k) * 2], UV[(t * 3 + k) * 2 + 1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me); bm.free()
    for m in slots: me.materials.append(m)
    o = bpy.data.objects.new(name, me); collection.objects.link(o)
    # (its origin under its middle, on its bottom)
    xs, ys, zs = (P[0::3], P[1::3], P[2::3])
    c = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs))
    me.transform(__import__('mathutils').Matrix.Translation((-c[0], -c[1], -c[2]))); o.location = c
    return o

# the room, for reference (textured as in the game)
for d in J['shell']:
    if d['kind'] == 'glow': mesh('REF_' + d['name'][6:], d, C_REF, lambda t: material('f4f8ff', True))
    elif d['tex']: mt = textured('REF_' + d['tex'], d['tex']); mesh('REF_' + d['name'][6:], d, C_REF, lambda t, mt=mt: mt)
    else: mesh('REF_' + d['name'][6:], d, C_REF, lambda t, d=d: material(d['col'][t]))
# the team's things
names = {}
for d in J['dress']:
    glow = d['kind'] == 'glow'
    o = mesh(d['name'], d, C_BOX, lambda t, d=d, glow=glow: material(d['col'][t], glow))
    names[d['name']] = o
# (the glow on a thing (the timing screen's text): its own object, parented to it)
for d in J['dress']:
    if d['name'].endswith('_glow') and d['name'][:-5] in names:
        o, p = names[d['name']], names[d['name'][:-5]]
        mw = o.matrix_world.copy(); o.parent = p; o.matrix_world = mw
# the team's name: the game writes it on this plane
bx = J['box']
me = bpy.data.meshes.new('TEAM_NAME')
me.from_pydata([(-5.6, 0, 0), (5.6, 0, 0), (5.6, 0, 1.4), (-5.6, 0, 1.4)], [], [(0, 1, 2, 3)])
uv = me.uv_layers.new(name='UVMap')
for l, u in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[l.index].uv = u
tn = bpy.data.materials.new('TEAM_NAME'); tn.use_nodes = True; tn.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.35
tn.blend_method = 'BLEND' if hasattr(tn, 'blend_method') else None
me.materials.append(tn)
o = bpy.data.objects.new('TEAM_NAME', me); o.location = (0, bx['depth'] - 0.04, 2.25); C_BOX.objects.link(o)

# the furniture (models/pitprops.glb), each a linked copy of the pack's model
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=PROPS)
src = {o.name: o for o in bpy.data.objects if o not in before and o.parent is None}
for p in J['props']:
    s = src.get(p['name'])
    if not s: print('MISSING prop', p['name']); continue
    o = s.copy(); o.data = s.data; o.name = p['name']; C_BOX.objects.link(o)
    o.location = p['at']; o.rotation_mode = 'XYZ'; o.rotation_euler = (0, 0, p['rot']); o.scale = (1, 1, 1)
# (the pack's own copies: kept, out of sight, so you can add more of any: Shift+D one in the Box collection)
C_SPARE = coll('Spare props (the game ignores it)')
for s in src.values():
    for c in list(s.users_collection): c.objects.unlink(s)
    C_SPARE.objects.link(s); s.name = 'REF_spare_' + s.name; s.location = (0, -6, 0)
C_SPARE.hide_viewport = True; C_SPARE.hide_render = True
x = 0
for s in src.values(): s.location = (x, -6, 0); x += 1.2

# your desk: the one from your garage (models/garage.glb), where it stands in your box now
DESK = re.compile(r'^(Desk|Computer|CrtMonitor|Keyboard|Speaker|Lamp Desk|Mouse|disk|office_chair)')
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=GARAGE)
new = [o for o in bpy.data.objects if o not in before]
keep = set()
for o in new:
    t = o
    while t.parent: t = t.parent
    if DESK.match(t.name): keep.add(o)
for o in new:
    if o not in keep: bpy.data.objects.remove(o)
for o in keep:
    for c in list(o.users_collection): c.objects.unlink(o)
    C_DESK.objects.link(o)
for o in [o for o in keep if o.parent is None]:
    o.location.y += CAR_Z; o.location.z += bx['floor']
    o.name = 'PLAYER_COMPUTER' if o.name.startswith('CrtMonitor') else 'PLAYER_' + o.name
crt = bpy.data.objects['PLAYER_COMPUTER']
# its glass (js/pitgarage.js attachScreen's: 0.391 x 0.34, in the monitor's frame), facing out of it
w, h, c = 0.391, 0.34, (-0.0015, -0.2245, 0.30)
me = bpy.data.meshes.new('PLAYER_SCREEN')
me.from_pydata([(c[0] - w / 2, c[1], c[2] - h / 2), (c[0] + w / 2, c[1], c[2] - h / 2), (c[0] + w / 2, c[1], c[2] + h / 2), (c[0] - w / 2, c[1], c[2] + h / 2)], [], [(0, 1, 2, 3)])
uv = me.uv_layers.new(name='UVMap')
for l, u in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[l.index].uv = u
gl = bpy.data.materials.new('PLAYER_SCREEN'); gl.use_nodes = True
b = gl.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.02, 0.05, 0.12, 1); b.inputs['Emission Color'].default_value = (0.05, 0.12, 0.3, 1); b.inputs['Emission Strength'].default_value = 1
me.materials.append(gl)
o = bpy.data.objects.new('PLAYER_SCREEN', me); C_DESK.objects.link(o); o.parent = crt; o.matrix_parent_inverse.identity()

# your car's spot (the menu's car parks here, nose to the door): a box the size of a car, drawn as wire
me = bpy.data.meshes.new('REF_your_car'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bm.to_mesh(me); bm.free()
o = bpy.data.objects.new('REF_your_car', me); C_REF.objects.link(o)
o.scale = (1.9, 4.6, 1.1); o.location = (0, CAR_Z, bx['floor'] + 0.55); o.display_type = 'WIRE'

sc.unit_settings.system = 'METRIC'
# (Solid view: each material's own color, the textured ones a mid grey, the glass dark)
for m in bpy.data.materials:
    if m.name.startswith('REF_'): m.diffuse_color = (0.6, 0.6, 0.6, 1)
gl.diffuse_color = (0.03, 0.08, 0.2, 1)
for a in bpy.data.screens:
    for ar in a.areas:
        if ar.type == 'VIEW_3D':
            for sp in ar.spaces:
                if sp.type == 'VIEW_3D': sp.shading.type = 'MATERIAL'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT_BLEND), compress=True)
print('WROTE', OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT_GLB), export_format='GLB', export_yup=True, export_apply=True, use_visible=False,
                          export_animations=False, export_lights=False, export_cameras=False)
print('WROTE', OUT_GLB)
