# Blender (background): a reference circuit model made loadable in the browser: textures down to <= MAX px, same geometry.
#   blender -b -P tools/tracks/ref/shrink.py -- in.glb out.glb [MAX=512]
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]; src, dst = a[0], a[1]; MAX = int(a[2]) if len(a) > 2 else 512
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
n = 0
for im in bpy.data.images:
    w, h = im.size
    if max(w, h) > MAX:
        s = MAX / max(w, h); im.scale(max(1, int(w * s)), max(1, int(h * s))); n += 1
print(f'shrank {n} of {len(bpy.data.images)} textures to <= {MAX} px; {sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")} faces')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='AUTO', export_tangents=False, export_animations=False)
