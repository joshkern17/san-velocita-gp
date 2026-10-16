# models/pitbox.blend -> models/pitbox.glb (what File > Export > glTF 2.0 does with the defaults: see docs/PIT-BOX-MODEL.md)
#   blender -b models/pitbox.blend --python tools/props/pitbox-export.py -- models/pitbox.glb
import bpy, os, sys
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', export_yup=True, export_apply=True, use_visible=False,
                          export_animations=False, export_lights=False, export_cameras=False)
print('WROTE', out)
