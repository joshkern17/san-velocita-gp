# The pit boxes' props -> models/pitprops.glb: a PSX garage tools pack (benches, chests, shelving, stools, cans, boxes)
# and a CRT-era monitor, each a root node named for the game (js/pitprops.js), standing on its origin, its front to
# Blender -Y (the game's +Z), metres. The pack's FBX files don't link their textures: each material (MI_<name>) finds
# its PNG in the pack's Textures folder by name.
#
#   blender -b --python tools/props/pitprops.py -- "<psx_garage_tools_pack>" "<Monitor.fbx>" models/pitprops.glb
import bpy, sys, os, glob, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
PACK, MONITOR, OUT = argv[0], argv[1], argv[2]
M = os.path.join(PACK, 'Meshes')

# game name -> (file under Meshes, extra files joined in, turn about Z in degrees so the front faces -Y)
PROPS = {
  'tool_chest': ('Tool_Chest_01.FBX', [], 0), 'toolbox': ('ToolBox_01.FBX', [], 0),
  'bench': ('Work_Bench/Work_Bench_01_A.FBX', [], 0), 'bench_tall': ('Work_Bench/Work_Bench_01_E.FBX', [], 0),
  'tool_rack': ('Tool_Rack_01.FBX', [], 0),
  'shelving_a': ('Shelving_Units/Shelving_Unit_01_A_01.FBX', [], 0), 'shelving_b': ('Shelving_Units/Shelving_Unit_01_B_01.FBX', [], 0),
  'shelving_c': ('Shelving_Units/Shelving_Unit_01_C_01.FBX', [], 0),
  'stool': ('Stools/Stool_01_B_01.FBX', [], 0), 'stool_low': ('Stools/Stool_01_C_01.FBX', [], 0),
  'jerry': ('Jerry_Can_01.FBX', [], 0), 'bucket': ('Metal_Bucket_01.FBX', [], 0), 'broom': ('Broom_01.FBX', [], 0),
  'fuse': ('Fuse_Box_01.FBX', [], 0), 'paint': ('PaintCan_01.FBX', [], 0), 'spray': ('Spray_Paint_Can_01.FBX', ['Spray_Paint_Can_01_Lid.FBX'], 0),
  'box_a': ('Cardboard_Boxes/Cardboard_Box_01.FBX', [], 0), 'box_b': ('Cardboard_Boxes/Cardboard_Box_05.FBX', [], 0),
  'box_c': ('Cardboard_Boxes/Cardboard_Box_03.FBX', [], 0), 'mat': ('Slip_Mat_01/Slip_Mat_01_A.FBX', [], 0),
  'shelf': ('Wall_Shelves/Shelf_01_D_01.FBX', [], 0), 'screw_bin': ('Screw_Bin_01_B.FBX', [], 0),
  'wrench': ('Tools/Wrench_02.FBX', [], 0), 'hammer': ('Tools/Hammer_01.FBX', [], 0), 'tape': ('Tools/DuctTape/DuctTape_01_A.FBX', [], 0),
}
ALIAS = {'Wrench_01': 'Wrench_02'}   # (the wrench's material is named for the other one)
PNGS = glob.glob(os.path.join(PACK, 'Textures', '**', '*.PNG'), recursive=True) + glob.glob(os.path.join(PACK, 'Textures', '**', '*.png'), recursive=True)
def png_for(mat):
    want = mat[3:] if mat.startswith('MI_') else mat
    want = ALIAS.get(want.split('.')[0], want.split('.')[0])   # (Blender's .001 on a name used twice)
    names = {os.path.splitext(os.path.basename(p))[0].lower(): p for p in PNGS}
    w = want.lower()
    while w:
        if w in names: return names[w]
        if w + '_a' in names: return names[w + '_a']
        cut = w.rsplit('_', 1)
        if len(cut) < 2: break
        w = cut[0]
    return None

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.type == 'MESH'], [o for o in new if o.type != 'MESH']

def finish(name, meshes, extra, turn=0, scale=1.0):
    for o in extra: bpy.data.objects.remove(o)
    for o in meshes:
        o.parent = None
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    # turned to face -Y, scaled, its origin under its middle on the floor
    o.rotation_euler = (0, 0, math.radians(turn)); o.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bb = [mathutils.Vector(c) for c in o.bound_box]
    mn = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
    o.data.transform(mathutils.Matrix.Translation(-mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    o.location = (0, 0, 0)
    print('PROP', name, 'size', [round(mx[i] - mn[i], 2) for i in range(3)], 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons))
    return o

def texture(o):
    for slot in o.material_slots:
        m = slot.material
        if not m: continue
        m.use_nodes = True
        nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if not tex:
            p = png_for(m.name)
            if not p: print('MISSING texture', o.name, m.name); continue
            tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(p)
            if bsdf: nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        tex.interpolation = 'Closest'   # (PSX: nearest-filtered)
        if bsdf:
            bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.9
        print('TEX', o.name, m.name, os.path.basename(tex.image.filepath) or tex.image.name)

for name, (f, extra, turn) in PROPS.items():
    ms, ex = import_fbx(os.path.join(M, f))
    for e in extra: m2, x2 = import_fbx(os.path.join(M, e)); ms += m2; ex += x2
    texture(finish(name, ms, ex, turn))
# the monitor: modelled big, its screen to +X: down to a 0.56 m wide screen, turned to face -Y
ms, ex = import_fbx(MONITOR)
mon = finish('monitor', ms, ex, -90, 0.56 / 3.2)
texture(mon)
for im in bpy.data.images:
    if im.packed_file: im.filepath = '//' + im.name   # (embedded in the FBX: exported from the pack)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, use_selection=False,
                          export_animations=False, export_lights=False, export_cameras=False)
print('WROTE', OUT)
