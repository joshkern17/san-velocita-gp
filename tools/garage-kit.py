# Builds models/garage/kit-start.blend: the home garage kit (World Career), see docs/GARAGE-KIT.md. Run:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-kit.py               (the .blend)
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-kit.py -- --export   (+ the GLBs)
# After editing the .blend (Save As your own copy first: re-running this overwrites kit-start.blend), export from
# inside Blender: Text Editor > export_kit > Run Script. It writes models/garage/<collection>.glb for every
# collection named shell_... or station_...
#
# The pieces:
#   shell_lockup      your lock-up (models/garage-attempt_001.blend), two bays, the station slots
#   station_tools     "Proper tools": a workbench and a locker (FACILITIES.tools)
#   station_sim       "Sim rig": an office chair, a wheel clamped to a desk, a CRT (FACILITIES.sim)
# Stations are built beside the room (each at its own spot off to the right) and shown in the room at their
# SLOT_ empties as collection instances: edit a station where it stands beside the room, the room shows the change.
import bpy, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'models', 'garage', 'src')
OUT = os.path.join(ROOT, 'models', 'garage')
LOCKUP = os.path.join(ROOT, 'models', 'garage-attempt_001.blend')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
D90 = math.pi / 2


def collection(name, parent=None):
    c = bpy.data.collections.new(name); (parent or scene.collection).children.link(c); return c


def move_to(obj, coll):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
    for ch in obj.children: move_to(ch, coll)
    return obj


def material(name, rgb, rough=0.7, image=None):
    m = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0): m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = 0.0
    if image:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(image); t.interpolation = 'Closest'
        m.node_tree.links.new(t.outputs['Color'], p.inputs['Base Color'])
    m.diffuse_color = (*rgb, 1)
    return m


def empty(name, coll, loc, rotz=0.0, kind='PLAIN_AXES', size=0.4, **props):
    e = bpy.data.objects.new(name, None); e.empty_display_type = kind; e.empty_display_size = size
    e.location = loc; e.rotation_euler = (0, 0, rotz); coll.objects.link(e)
    for k, v in props.items(): e[k] = v
    return e


def bulb(name, coll, loc, watts, rgb):
    # a point light (the game takes Blender's watts: a 300 W bulb 3 m up lights a car in a warm pool)
    L = bpy.data.lights.new(name, 'POINT'); L.energy = watts; L.color = rgb; L.shadow_soft_size = 0.2
    o = bpy.data.objects.new(name, L); o.location = loc; coll.objects.link(o); return o


def box(name, coll, size, loc, mat=None):
    me = bpy.data.meshes.new(name)
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    me.from_pydata(v, [], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    o = bpy.data.objects.new(name, me); o.location = loc; coll.objects.link(o)
    if mat: me.materials.append(mat)
    return o


# one mesh out of a model file (its parents' transforms baked in), its origin at the bottom middle, set down at loc
def take(path, prefix, coll, loc, rotz=0.0, height=None, name=None):
    before = set(bpy.data.objects)
    if path.endswith('.glb'): bpy.ops.import_scene.gltf(filepath=path)
    else: bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    picked = [o for o in new if o.type == 'MESH' and o.name.startswith(prefix)]
    if not picked: raise RuntimeError(f'{prefix} not in {path}: {[o.name for o in new if o.type == "MESH"]}')
    meshes = []
    for o in picked:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.data = o.data.copy(); o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4); meshes.append(o)
    for o in new:
        if o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
    o = meshes[0]
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=o, selected_editable_objects=meshes): bpy.ops.object.join()
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    k = height / (hi.z - lo.z) if height else 1.0
    o.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    o.rotation_mode = 'XYZ'  # (the glTF importer leaves objects on quaternions: the angle below would do nothing)
    o.location = loc; o.rotation_euler = (0, 0, rotz); o.name = name or prefix
    move_to(o, coll)
    return o


# ---------------- the lock-up: your garage, as it is, with two bays ----------------
kit = collection('KIT (each collection is one .glb)')
lock = collection('shell_lockup', kit)
with bpy.data.libraries.load(LOCKUP, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if not n.startswith('GUIDE')]
for o in dst.objects:
    if o is None: continue
    lock.objects.link(o)
    if o.type == 'CAMERA': bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()  # (an appended object's matrix_world is stale until then: Wall_Back read as x = 6)


def world_box(o):
    pts = [d.matrix_world @ Vector(c) for d in [o] + list(o.children_recursive) if d.type == 'MESH' for c in d.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))) if pts else None


# the asset pack samples parked outside the walls aren't part of the room
ROOM = (-4.3, 4.3, -6.5, 6.25)
for n in [o.name for o in lock.objects]:
    o = bpy.data.objects.get(n)
    if not o or o.parent or o.type not in ('MESH', 'EMPTY'): continue
    b = world_box(o)
    if b and (b[0].x > ROOM[1] or b[1].x < ROOM[0] or b[0].y > ROOM[3] or b[1].y < ROOM[2]):
        for d in [o] + list(o.children_recursive): bpy.data.objects.remove(d, do_unlink=True)
for n in [o.name for o in lock.objects]:
    o = bpy.data.objects.get(n)
    if o and o.type == 'MESH' and o.parent and not o.name.startswith(('Floor', 'Walls')):
        b = world_box(o)
        if b and (b[0].x > ROOM[1] or b[1].x < ROOM[0] or b[0].y > ROOM[3] or b[1].y < ROOM[2]): bpy.data.objects.remove(o, do_unlink=True)


# (the dartboard's two darts came in about 37 x 52 m: dropped)
for o in list(lock.objects):
    if o.type == 'MESH' and max(o.dimensions) > 20: print('  dropped', o.name, tuple(round(v) for v in o.dimensions)); bpy.data.objects.remove(o, do_unlink=True)


def quad(name, coll, pts, mat, inward, uv_per_m=(0.104, 0.073)):
    # a flat wall / ceiling from four corners, its face turned to `inward`, UVs from its size (your wood's scale)
    me = bpy.data.meshes.new(name); me.from_pydata([Vector(p) for p in pts], [], [(0, 1, 2, 3)])
    if me.polygons[0].normal.dot(Vector(inward)) < 0: me.flip_normals()
    uv = me.uv_layers.new(); a, b, c = (Vector(p) for p in pts[:3]); ux, uy = (b - a).normalized(), (c - b).normalized()
    for li in me.polygons[0].loop_indices:
        p = me.vertices[me.loops[li].vertex_index].co - a; uv.data[li].uv = (p.dot(ux) * uv_per_m[0], p.dot(uy) * uv_per_m[1])
    o = bpy.data.objects.new(name, me); coll.objects.link(o); me.materials.append(mat); return o


# closed in, to walk round: your right wall shown again (hidden for the old fixed camera), a front wall with a roll-up
# door, a corrugated roof
X0, X1, Y0, Y1, H = -4.15, 4.15, -6.39, 6.08, 4.52
wood = bpy.data.objects['Walls'].data.materials[0]
wb = bpy.data.objects.get('Wall_Back')
if wb:
    wb.hide_set(False); wb.hide_viewport = False; wb.hide_render = False
    if (wb.matrix_world.to_3x3() @ wb.data.polygons[0].normal).x > 0: wb.data.flip_normals()
DOOR_X, DOOR_W, DOOR_H = 0.65, 5.52, 3.08
quad('Wall_Front_L', lock, [(X0, Y0, 0), (DOOR_X - DOOR_W / 2, Y0, 0), (DOOR_X - DOOR_W / 2, Y0, H), (X0, Y0, H)], wood, (0, 1, 0))
quad('Wall_Front_R', lock, [(DOOR_X + DOOR_W / 2, Y0, 0), (X1, Y0, 0), (X1, Y0, H), (DOOR_X + DOOR_W / 2, Y0, H)], wood, (0, 1, 0))
quad('Wall_Front_Top', lock, [(DOOR_X - DOOR_W / 2, Y0, DOOR_H), (DOOR_X + DOOR_W / 2, Y0, DOOR_H), (DOOR_X + DOOR_W / 2, Y0, H), (DOOR_X - DOOR_W / 2, Y0, H)], wood, (0, 1, 0))
take(os.path.join(SRC, 'low-poly_psx_style_garage_doors_pack.glb'), 'Garage Door_008', lock, Vector((DOOR_X, Y0 + 0.02, 0)), name='Door')
quad('Roof', lock, [(X0, Y0, H), (X1, Y0, H), (X1, Y1, H), (X0, Y1, H)], material('Roof', (1, 1, 1), 0.8, os.path.join(SRC, 'corrugated_metal.png')), (0, 0, -1), (0.5, 0.5))


def shift(name, dx, dy):
    o = bpy.data.objects.get(name)
    if not o: print('  (no', name + ')'); return
    o.matrix_world = Matrix.Translation((dx, dy, 0)) @ o.matrix_world


# two bays: car one moves left, car two goes where the boxes were; the work light and the boxes move out of the way
BAY1, BAY2 = Vector((-0.85, 0, 0)), Vector((2.15, 0, 0))
shift('Industrial_Light', -1.0, 0)                        # (in front of car one's nose: a metre left, still aimed the same; it lights the desk wall)
shift('Cardboard_box_01_Storage_Shelves_0.002', -0.75, 2.85)   # (the boxes where car two goes: into the back corner)
shift('Cardboard_box_01_Storage_Shelves_0.003', -0.75, 2.85)
shift('Cardboard_box_04_Storage_Shelves_0.001', 1.75, 3.25)
# the floor: concrete from the PSX Industrial Textures pack, a tile every 1.5 m (UVs from where each corner is)
fl = bpy.data.objects.get('Floor')
if fl:
    fl.data = fl.data.copy(); fl.data.materials.clear(); fl.data.materials.append(material('Floor_Concrete', (1, 1, 1), 0.85, os.path.join(SRC, 'industrial_concrete_floor.png')))
    uv = fl.data.uv_layers.new(name='Concrete'); fl.data.uv_layers.active = uv
    for li, lp in enumerate(fl.data.loops):
        w = fl.matrix_world @ fl.data.vertices[lp.vertex_index].co; uv.data[li].uv = (w.x / 1.5, w.y / 1.5)
    for i in range(len(fl.data.uv_layers) - 1, -1, -1):
        if fl.data.uv_layers[i].name != 'Concrete': fl.data.uv_layers.remove(fl.data.uv_layers[i])

# no bay lines (they were painted in the team colour: a square round the car)
for n in ('BayLine_Back', 'BayLine_Front', 'BayLine_L', 'BayLine_R'):
    if bpy.data.objects.get(n): bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)

# the lighting: the big spot above the roof line went (it lit the whole room evenly from 5.7 m up: flat, shadows
# straight down); three fluorescent fittings hang under the roof instead, one over each car and one over the back by the
# desk, each a spot aimed at the floor (pools of light, darker corners, shadows across the floor). Your two work lights stay.
for o in [o for o in lock.objects if o.type == 'LIGHT' and o.data.type == 'SPOT' and o.matrix_world.translation.z > H]:
    print('  dropped light', o.name); bpy.data.objects.remove(o, do_unlink=True)
tube = material('Fluorescent', (0.92, 0.96, 1.0), 0.5); tube.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (0.92, 0.96, 1.0, 1)
tube.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 6.0
housing = material('Fitting', (0.25, 0.26, 0.27), 0.6)
for n, (x, y) in enumerate(((BAY1.x, 0.3), (BAY2.x, 0.3), (-2.0, 4.0))):
    box(f'Fitting_{n}', lock, (0.22, 1.3, 0.07), (x, y, H - 0.38), housing)
    box(f'Tube_{n}', lock, (0.08, 1.2, 0.04), (x, y, H - 0.43), tube)
    for k, dz in ((0, -0.45), (1, 0.45)):   # (the chains it hangs from)
        box(f'Chain_{n}_{k}', lock, (0.012, 0.012, 0.36), (x, y + dz, H - 0.17), housing)
    L = bpy.data.lights.new(f'Light_Tube_{n}', 'SPOT'); L.energy = 650; L.color = (0.9, 0.95, 1.0); L.spot_size = math.radians(125); L.spot_blend = 0.6; L.shadow_soft_size = 0.4
    lo = bpy.data.objects.new(f'Light_Tube_{n}', L); lo.location = (x, y, H - 0.47); lock.objects.link(lo)   # (spots point down -Z: at the floor)

hooks = collection('shell_lockup hooks', lock)
# (the car's nose points down -Y, at the door, as in the garage template)
empty('BAY_1', hooks, BAY1, kind='SINGLE_ARROW', size=1.0, label='Car one')
empty('BAY_2', hooks, BAY2, kind='SINGLE_ARROW', size=1.0, label='Car two')
empty('SPAWN', hooks, (0.65, -4.4, 0), rotz=math.pi, kind='SINGLE_ARROW', size=0.6)   # (you, walking in from the door)
empty('INTERACT_calendar', hooks, (-4.0, 3.42, 2.1), kind='SPHERE', size=0.25, label='The calendar')
nav = box('NAV_floor', hooks, (7.3, 12.2, 0.0), (0.4, -0.15, 0.0)); nav.display_type = 'WIRE'; nav.hide_render = True

# ---------------- stations: built beside the room, shown at their slots ----------------
stations = collection('STATIONS (edit them here; the room shows them at their SLOT_ empties)', kit)


def station(name, x):
    c = collection(name, stations); c.instance_offset = (x, -12.0, 0.0); return c, Vector((x, -12.0, 0.0))


IND = os.path.join(SRC, 'psx_industrial_pack.glb')
# Proper tools: a workbench along the wall, a locker beside it, a jerrycan under the bench
tools, o = station('station_tools', 9.0)
take(os.path.join(SRC, 'Wooden_Table.fbx'), 'SM_Table', tools, o + Vector((0, -0.56, 0)), name='Workbench')
bench = bpy.data.objects['Workbench']; bench.data.materials.clear(); bench.data.materials.append(material('Workbench', (1, 1, 1), image=os.path.join(SRC, 'Wooden_Table_Base_color.png')))
take(IND, 'Locker_M', tools, o + Vector((-1.6, -0.21, 0)), name='Locker')
take(IND, 'Jerrycan', tools, o + Vector((0.55, -0.35, 0)), rotz=0.3, name='Jerrycan')
take(IND, 'CrateMetal_M', tools, o + Vector((-0.55, -0.45, 0.96)), height=0.22, name='Toolbox')
bpy.data.objects['Toolbox'].scale = (0.55, 0.3, 1.0)
empty('STAND_mechanic', tools, o + Vector((0, -1.45, 0)), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='lean', role='mechanic')
bulb('Light_Bench', tools, o + Vector((0, -0.7, 2.3)), 220, (1.0, 0.85, 0.65))   # (a work lamp over the bench)
empty('INTERACT_tools', tools, o + Vector((0, -1.1, 1.1)), kind='SPHERE', size=0.25, label='The workbench')

# Sim rig (a lottery winner's first one): a CRT on a stand against the wall, a wheel on a post with the pedals under
# it, an office chair facing them. Which way the chair and the CRT face is measured from their shapes, not guessed.
def facing(o, kind):
    # the way a model faces, in its own XY: a chair away from its backrest (its top), a CRT out of its wide end
    vs = [v.co for v in o.data.vertices]; c = sum(vs, Vector()) / len(vs); zs = [v.z for v in vs]; h = max(zs) - min(zs)
    if kind == 'chair':
        top = [v for v in vs if v.z > min(zs) + 0.8 * h]; t = sum(top, Vector()) / len(top)
        return Vector((c.x - t.x, c.y - t.y)).normalized()
    best = None
    for ax in (0, 1):
        lo, hi = min(v[ax] for v in vs), max(v[ax] for v in vs); span = hi - lo
        w = lambda sel: (lambda xs: max(xs) - min(xs))([v[1 - ax] for v in vs if sel(v[ax])] or [0])
        a, b = w(lambda x: x < lo + 0.15 * span), w(lambda x: x > hi - 0.15 * span)
        if best is None or abs(a - b) > best[0]: best = (abs(a - b), Vector((-1, 0) if ax == 0 else (0, -1)) if a > b else Vector((1, 0) if ax == 0 else (0, 1)))
    return best[1]


def turn_to(o, kind, want):
    f = facing(o, kind); o.rotation_euler.z = math.atan2(want[1], want[0]) - math.atan2(f.y, f.x)


sim, o = station('station_sim', 13.0)
dark = material('SimFrame', (0.06, 0.06, 0.07), 0.6)
box('SimStand', sim, (0.8, 0.45, 0.62), o + Vector((0, -0.25, 0.31)), material('SimStand', (0.22, 0.2, 0.19), 0.8))
take(os.path.join(ROOT, 'models', 'office', 'CrtMonitor.glb'), '', sim, o + Vector((0, -0.27, 0.62)), height=0.45, name='SimCRT')
turn_to(bpy.data.objects['SimCRT'], 'crt', (0, -1))                       # (the screen at the driver)
box('SimPost', sim, (0.06, 0.06, 0.72), o + Vector((0, -0.82, 0.36)), dark)       # (the wheel's post, its foot, the pedal tray)
box('SimFoot', sim, (0.5, 0.5, 0.04), o + Vector((0, -0.95, 0.02)), dark)
box('SimPedalL', sim, (0.07, 0.03, 0.18), o + Vector((-0.08, -1.08, 0.12)), material('Pedal', (0.55, 0.55, 0.58), 0.4)).rotation_euler.x = math.radians(-25)
box('SimPedalR', sim, (0.07, 0.03, 0.18), o + Vector((0.08, -1.08, 0.12)), bpy.data.materials['Pedal']).rotation_euler.x = math.radians(-25)
box('SimWheelBase', sim, (0.2, 0.16, 0.1), o + Vector((0, -0.84, 0.75)), dark)
bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.018, major_segments=12, minor_segments=4)
wo = bpy.context.active_object; wo.name = 'SimWheel'; wo.location = o + Vector((0, -0.95, 0.86)); wo.rotation_euler = (math.radians(75), 0, 0)  # (rim towards the driver, leaned back)
wo.data.materials.append(dark); move_to(wo, sim)
take(os.path.join(ROOT, 'models', 'office', 'office_chair_grey_alt.glb'), '', sim, o + Vector((0, -1.55, 0)), name='SimChair')
turn_to(bpy.data.objects['SimChair'], 'chair', (0, 1))                    # (facing the wheel)
empty('STAND_driver', sim, o + Vector((0, -1.55, 0)), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='sit_idle', role='driver')
bulb('Light_CRT', sim, o + Vector((0, -0.7, 1.1)), 70, (0.6, 0.75, 1.0))      # (the screen's glow)
empty('INTERACT_sim', sim, o + Vector((0, -1.6, 1.0)), kind='SPHERE', size=0.25, label='The sim rig')

# the slots in the lock-up: the stations' backs to the right wall, facing into the room
slots = {'tools': ((4.15, 4.05, 0), -D90), 'sim': ((-3.0, -6.39, 0), math.pi)}   # (the sim: in the front corner by the door, facing in)
for k, (loc, rz) in slots.items():
    e = empty('SLOT_' + k, hooks, loc, rotz=rz, kind='ARROWS', size=0.5)
    e.instance_type = 'COLLECTION'; e.instance_collection = bpy.data.collections['station_' + k]

# ---------------- guides (left out by the game) ----------------
guides = collection('GUIDES (left out by the game)')
gm = material('GUIDE', (0.9, 0.1, 0.1), 0.9); pm = material('GUIDE_person', (0.1, 0.5, 0.9), 0.9)
for i, b in ((1, BAY1), (2, BAY2)):
    g = box(f'GUIDE_Car{i}', guides, (2.0, 5.6, 1.0), (0, 0, 0.5), gm); g.parent = bpy.data.objects[f'BAY_{i}']; g.display_type = 'WIRE'
    n = box(f'GUIDE_Car{i}Nose', guides, (0.7, 0.8, 0.7), (0, -3.2, 0.5), gm); n.parent = bpy.data.objects[f'BAY_{i}']; n.display_type = 'WIRE'
p = box('GUIDE_Person', guides, (0.5, 0.3, 1.8), (0, 0, 0.9), pm); p.parent = bpy.data.objects['SPAWN']; p.display_type = 'WIRE'
for c in (guides,):
    for ob in c.objects: ob.hide_render = True

# ---------------- the exporter (also kept in the .blend as a text block) ----------------
EXPORT = r'''
import bpy, os
from mathutils import Matrix
OUT = bpy.path.abspath('//')   # (next to the .blend: models/garage/)
def export_kit(out=OUT, only=None):
    done = []
    for coll in bpy.data.collections:
        if not coll.name.startswith(('shell_', 'station_')) or coll.name.endswith(' hooks'): continue
        if only and coll.name not in only: continue
        objs = [o for o in coll.all_objects if not o.name.startswith('GUIDE') and o.visible_get()]
        off = Vector(coll.instance_offset) if coll.name.startswith('station_') else None
        slots = [o for o in objs if o.instance_type == 'COLLECTION']
        for s in slots: s['_inst'] = s.instance_collection.name; s.instance_type = 'NONE'
        roots = [o for o in objs if not o.parent or o.parent not in objs]
        if off is not None:
            for o in roots: o.matrix_world = Matrix.Translation(-off) @ o.matrix_world
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        path = os.path.join(out, coll.name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_cameras=False, export_lights=True,
                                  export_extras=True, export_apply=True, export_yup=True)
        if off is not None:
            for o in roots: o.matrix_world = Matrix.Translation(off) @ o.matrix_world
        for s in slots: s.instance_type = 'COLLECTION'; del s['_inst']
        done.append(path)
    print('exported:', *done, sep='\n  ')
    return done
from mathutils import Vector
if __name__ == '__main__': export_kit()
'''
t = bpy.data.texts.new('export_kit'); t.write(EXPORT)

os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, 'kit-start.blend')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=path)
print('wrote', path)
if '--export' in args:
    ns = {'__name__': 'kit'}; exec(EXPORT, ns); ns['export_kit'](OUT)
