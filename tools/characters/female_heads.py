# The female racers' heads: cut from BitSoft's "Rigged Low-Poly Female NPCs" (the six looks share one mesh, a face
# texture each), everything in the skin material above the neck, rest pose, metres, +Y up once exported. The game
# fits them onto the racer's head bone (js/characters.js) in place of the man's head when the helmet's off.
#   blender -b "<pack>/Rigged Low-Poly Female NPCs.blend" --python tools/characters/female_heads.py -- models/heads-female.glb
import bpy, sys, bmesh
out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'heads-female.glb'
NECK = 1.37  # metres up: below it the skin is her chest (a low top) and then hands and arms; the suit covers the rest
keep = []
for o in sorted([o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('character')], key=lambda o: o.name):
    skin = next((i for i, m in enumerate(o.data.materials) if m and m.name.startswith('skin-female')), None)
    if skin is None: continue
    tex = o.data.materials[skin].name
    me = o.data.copy(); h = bpy.data.objects.new('head_' + tex.replace('skin-female', 'f'), me)
    bpy.context.collection.objects.link(h); h.matrix_world = o.matrix_world.copy()
    bm = bmesh.new(); bm.from_mesh(me)
    mw = o.matrix_world
    gone = [f for f in bm.faces if f.material_index != skin or (mw @ f.calc_center_median()).z < NECK]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(bpy.data.materials[tex])
    h.vertex_groups.clear(); h.modifiers.clear()
    keep.append(h); print('HEAD', h.name, len(me.vertices), 'verts')
for o in bpy.data.objects: o.select_set(o in keep)
bpy.context.view_layer.objects.active = keep[0]
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_apply=True, export_animations=False, export_skins=False, export_morph=False, export_yup=True)
print('WROTE', out)
