# The GT-One road car (Sketchfab, a model from its author's own game) before tools/cars/hdcar.py: its 'glow' material is
# on the lamps (lights_* nodes) and also on the decorative edge-glow strips round the body, doors and rims (*_zz_light
# nodes): the strips go. The lamps are Material.005 (the light) behind Material.010 (the lens); the front lamp's object
# also carries the headlight beam cones reaching ~1.2 m past the nose: the faces in front of the nose go too.
#   Blender -b -P tools/cars/gtone_prep.py -- <toyota_gt-one_road_car.glb> <out.glb>
#   then: PAINT='=material.001' CG=0.57 Blender -b -P tools/cars/hdcar.py -- <out.glb> models/cars/gtone.glb - material.006 '{"material.005":"split","material.010":"split"}'
import bpy, bmesh, sys
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
gone = [o for o in bpy.context.scene.objects if o.type == 'MESH' and 'zz_light' in o.name]
for o in gone: bpy.data.objects.remove(o)
print('GTONE removed', len(gone), 'edge-glow parts')
# the beams: in the source the nose is at y -2.39 (the beams reach -3.64)
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH' and 'lights_position_front' in o.name]:
    bm = bmesh.new(); bm.from_mesh(o.data); W = o.matrix_world
    cut = [f for f in bm.faces if min((W @ v.co).y for v in f.verts) < -2.42]
    bmesh.ops.delete(bm, geom=cut, context='FACES'); bm.to_mesh(o.data); bm.free()
    print('GTONE beam faces removed', len(cut))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
