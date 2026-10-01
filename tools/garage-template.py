# Builds models/garage-start.blend: a starting point for your own pit garage (models/garage.glb, see
# docs/GARAGE-MODEL.md). Run:  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-template.py
# Optional:  ... --python tools/garage-template.py -- --export path/to/test.glb   (also exports it, as the game wants it)
import bpy, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


def collection(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c


def material(name, rgb, rough=0.6, emit=0.0):
    m = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0): m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = 0.0
    if emit:
        p.inputs['Emission Color'].default_value = (*rgb, 1)
        p.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = (*rgb, 1)
    return m


def put(obj, coll, mat=None):
    for c in obj.users_collection: c.objects.unlink(obj)
    coll.objects.link(obj)
    if mat: obj.data.materials.clear(); obj.data.materials.append(mat)
    return obj


def box(name, coll, size, loc, mat=None, wire=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if wire: o.display_type = 'WIRE'; o.hide_render = True  # (F12 shows the game's view)
    return put(o, coll, mat)


def plane(name, coll, w, h, loc, rot, mat=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = (w, h, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return put(o, coll, mat)


def label(text, coll, loc, size=0.5):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object; o.name = 'GUIDE_Label_' + text.split()[0]
    o.data.body = text; o.data.size = size; o.data.align_x = 'CENTER'
    return put(o, coll)


guides = collection('GUIDES (left out by the game)')
garage = collection('Garage')
hooks = collection('Hooks (the game fills these in)')

# ---- guides: anything named GUIDE_... is ignored by the game ----
guide_mat = material('GUIDE_Car', (0.8, 0.15, 0.1))
box('GUIDE_Car', guides, (2.0, 5.6, 1.0), (0, 0, 0.5), guide_mat)                       # an F1 car, nose to -Y
bpy.ops.mesh.primitive_cone_add(radius1=0.35, depth=0.8, location=(0, -3.2, 0.5), rotation=(math.pi / 2, 0, 0))
put(bpy.context.active_object, guides, guide_mat).name = 'GUIDE_CarNose'               # points at the door
box('GUIDE_DefaultRoomSize', guides, (12, 14, 4.6), (0, 0.5, 2.3), wire=True)          # the placeholder room
box('GUIDE_CameraKeepClear', guides, (2.0, 1.6, 1.0), (4.3, -5.95, 2.0), wire=True)    # where the camera drifts
label('DOOR SIDE  (-Y)', guides, (0, -6.5, 3.2))
label('BACK WALL  (+Y)', guides, (0, 7.4, 3.8))

# the game's view: 40 deg vertical fov, 16:9, the car pushed right of the menu
cam = bpy.data.cameras.new('GUIDE_GameView')
cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(40); cam.shift_x = -0.2; cam.clip_start = 0.1
co = bpy.data.objects.new('GUIDE_GameView', cam); guides.objects.link(co)
a = 0.62
co.location = (math.sin(a) * 7.4, -math.cos(a) * 7.4, 2.0)
tgt = bpy.data.objects.new('GUIDE_CameraTarget', None); tgt.location = (0, 0, 0.5); guides.objects.link(tgt)
trk = co.constraints.new('TRACK_TO'); trk.target = tgt; trk.track_axis = 'TRACK_NEGATIVE_Z'; trk.up_axis = 'UP_Y'
scene.camera = co
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

# ---- a floor to start from (replace / extend with your own model) ----
plane('Floor', garage, 12, 14, (0, 0.5, 0), (0, 0, 0), material('Floor_Epoxy', (0.33, 0.35, 0.38), 0.45))
team_main = material('TeamMain', (0.8, 0.8, 0.8))
for nm, size, loc in [('BayLine_L', (0.1, 6.4, 0.01), (-1.6, 0, 0.005)), ('BayLine_R', (0.1, 6.4, 0.01), (1.6, 0, 0.005)),
                      ('BayLine_Back', (3.3, 0.1, 0.01), (0, 3.2, 0.005)), ('BayLine_Front', (3.3, 0.1, 0.01), (0, -3.2, 0.005))]:
    box(nm, garage, size, loc, team_main)

# ---- hooks ----
# timing monitor on the left wall (1.6 : 1), facing into the room
plane('TV_Screen', hooks, 1.6, 1.0, (-5.89, -2.3, 2.6), (math.pi / 2, 0, math.pi / 2), material('TV_Screen', (0.02, 0.02, 0.03)))
# team banner on the back wall (4 : 1), facing the door
plane('TeamBand', hooks, 6.0, 1.5, (0, 7.49, 2.5), (math.pi / 2, 0, 0), material('TeamBand', (0.5, 0.5, 0.5)))
# a tyre stack: the bands take the colour of the compound you'll go out on
rubber, band = material('Tyre_Rubber', (0.03, 0.03, 0.035), 0.9), material('TyreBand', (0.95, 0.82, 0.16))
for k in range(4):
    z = 0.15 + k * 0.31
    bpy.ops.mesh.primitive_cylinder_add(radius=0.36, depth=0.3, vertices=24, location=(-3.2, 6.3, z))
    put(bpy.context.active_object, hooks, rubber).name = f'TyreStack_Tyre{k}'
    bpy.ops.mesh.primitive_cylinder_add(radius=0.365, depth=0.04, vertices=24, location=(-3.2, 6.3, z))
    put(bpy.context.active_object, hooks, band).name = f'TyreStack_Band{k}'

out = os.path.join(ROOT, 'models', 'garage-start.blend')
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out)

if '--export' in args:
    path = os.path.abspath(args[args.index('--export') + 1])
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False)
    print('exported', path)
