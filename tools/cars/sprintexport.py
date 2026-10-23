# Export the sprint car (the 'SprintCar' collection sprintcar.py builds) to the game: models/cars/sprint410.glb.
#   In the open Blender, after sprintcar.py: exec(open('tools/cars/sprintexport.py').read(), g)   (g: sprintcar.py's namespace)
#   then: .devtest/guard.sh node tools/cars/uvrepair.mjs --check models/cars/sprint410.glb
# The livery (js/roadcar.js, livery: true) paints white texels: every Livery face (body, both wings) gets texels of its
# own in one white texture (a smart unwrap packed across the three objects). Everything else keeps its own material.
# Custom properties go along as glTF extras (SteeringWheel.steer_axis, Wing_Top.slide_axis ...): roadcar.js reads them.
import bpy, bmesh, math, os

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = globals().get('EXPORT_TO') or os.path.join(ROOT, 'models', 'cars', 'sprint410.glb')
car = list(bpy.data.collections['SprintCar'].objects)
painted = [o for o in car if any(m and m.name == 'Livery' for m in o.data.materials)]

# the white paint texture
TEX = 1024
img = bpy.data.images.get('SprintLivery') or bpy.data.images.new('SprintLivery', TEX, TEX, alpha=False)
img.pixels.foreach_set([0.95] * (TEX * TEX * 4)); img.pack()
liv = bpy.data.materials['Livery']; nt = liv.node_tree; p = nt.nodes['Principled BSDF']
tx = nt.nodes.get('Paint') or nt.nodes.new('ShaderNodeTexImage'); tx.name = 'Paint'; tx.image = img; tx.interpolation = 'Closest'
nt.links.new(tx.outputs['Color'], p.inputs['Base Color'])
p.inputs['Base Color'].default_value = (1, 1, 1, 1); p.inputs['Roughness'].default_value = 1.0
if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = 0

# unwrap the Livery faces of all painted objects together (one texture: their islands must not overlap)
win = bpy.context.window_manager.windows[0]
area = next(a for a in win.screen.areas if a.type == 'VIEW_3D'); reg = next(r for r in area.regions if r.type == 'WINDOW')
with bpy.context.temp_override(window=win, area=area, region=reg):
  if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
  bpy.ops.object.select_all(action='DESELECT')
  for o in painted: o.select_set(True)
  bpy.context.view_layer.objects.active = painted[0]
  bpy.ops.object.mode_set(mode='EDIT')
  for o in painted:
    bm = bmesh.from_edit_mesh(o.data); li = [i for i, m in enumerate(o.data.materials) if m and m.name == 'Livery']
    for f in bm.faces: f.select = f.material_index in li
    bmesh.update_edit_mesh(o.data)
  bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
  bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
  bpy.ops.object.mode_set(mode='OBJECT')
  bpy.ops.object.select_all(action='DESELECT')
  for o in car: o.select_set(True)
  bpy.context.view_layer.objects.active = car[0]
  bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_extras=True,
                            export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
                            export_animations=False, export_skins=False, export_morph=False,
                            export_vertex_color='NAME', export_vertex_color_name='wing_follow')   # (the strut tops that follow the wing)
  bpy.ops.object.select_all(action='DESELECT')

xs = [(o.matrix_world @ v.co) for o in car for v in o.data.vertices]
SIZE = [round(max(v.x for v in xs) - min(v.x for v in xs), 2), round(max(v.z for v in xs) - min(v.z for v in xs), 2),
        round(max(v.y for v in xs) - min(v.y for v in xs), 2)]          # width, height, length (cars.json)
EXPORTED = {'file': OUT, 'bytes': os.path.getsize(OUT), 'objects': sorted(o.name for o in car), 'size': SIZE}
print(EXPORTED)
