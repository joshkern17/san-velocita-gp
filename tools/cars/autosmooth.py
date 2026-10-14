# Shade auto smooth (30 degrees) on a game car's glb: every mesh smooth-shaded, edges sharper than 30 degrees kept hard.
#   Blender -b -P tools/cars/autosmooth.py -- <in.glb> <out.glb> [angle]
# The glb is imported with its vertices merged (glTF splits them at every hard edge, so a flat-shaded model has no
# shared vertices to smooth across), textures, UVs and object names (Body, Wheel_*, Light_*) kept as they are.
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
ang = math.radians(float(a[2]) if len(a) > 2 else 30)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src, merge_vertices=True)
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    # (its stored normals go: they'd override the smoothing; faces turned to point outwards, so the game's
    # roadcar.js orient() trusts the normals instead of rebuilding them flat)
    bpy.context.view_layer.objects.active = o
    if o.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=ang)
    print('smoothed', o.name, len(o.data.polygons), 'faces')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_image_format='AUTO',
    export_cameras=False, export_lights=False, use_selection=False)
print('exported', out)
