# Rebuild the BitSoft "Rigged Low-Poly Male Job NPCs" pack onto ONE clean game skeleton.
#   blender -b "<pack>/Rigged Male Jobs Low-Poly NPCs.blend" --python tools/characters/rebuild.py -- <tshirt-mod.blend> <out.blend>
# The pack ships 12 identical Rigify rigs (222 bones each, control bones + constraints). We keep only the 35 deform
# bones of the first rig (renamed: DEF-upper_arm.L -> upper_arm.L), bind every mesh to it, and throw the rest away.
# The 4 t-shirt variants from the mod .blend are appended too. Output: a .blend with "Skeleton" + 16 meshes
# named after their look, ready for tools/characters/animate.py.
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
MOD, OUT = argv[0], argv[1]

LOOKS = {  # mesh object -> look id
  'NPC-male-job': 'scrubs_blue', 'NPC-male-job.006': 'scrubs_green',
  'NPC-male-job.001': 'prisoner_1', 'NPC-male-job.009': 'prisoner_2',
  'NPC-male-job.002': 'coveralls_gray', 'NPC-male-job.003': 'coveralls_tan', 'NPC-male-job.004': 'coveralls_navy',
  'NPC-male-job.005': 'coveralls_black', 'NPC-male-job.007': 'polo_beige', 'NPC-male-job.008': 'polo_maroon',
  'NPC-male-job.010': 'polo_navy', 'NPC-male-job.011': 'polo_white',
}
MOD_LOOKS = {'NPC-male-job.007': 'tee_beige', 'NPC-male-job.008': 'tee_maroon', 'NPC-male-job.010': 'tee_blue', 'NPC-male-job.011': 'tee_white'}
# Rigify parents some DEF bones to ORG/MCH bones that we delete; re-home them on the nearest deform bone.
REPARENT = {'pelvis.L': 'spine', 'pelvis.R': 'spine', 'thigh.L': 'spine', 'thigh.R': 'spine',
            'shoulder.L': 'spine.003', 'shoulder.R': 'spine.003', 'upper_arm.L': 'shoulder.L', 'upper_arm.R': 'shoulder.R',
            'breast.L': 'spine.003', 'breast.R': 'spine.003', 'spine': None}

scene = bpy.context.scene
# --- append the t-shirt meshes (their own rigs come along as parents; deleted below)
want = None
with bpy.data.libraries.load(MOD, link=False) as (src, dst):
    want = [n for n in src.objects if n in MOD_LOOKS]
    dst.objects = list(want)
for name, o in zip(want, dst.objects):  # appended names get suffixed (.012 ...), so pair them by request order
    scene.collection.objects.link(o)
    LOOKS[o.name] = MOD_LOOKS[name]

# the mod's skin textures point at its own textures/ folder, which only holds the shirts: find each image wherever it is
import os
dirs = [os.path.join(os.path.dirname(bpy.data.filepath), 'textures'), os.path.join(os.path.dirname(MOD), 'textures')]
for img in bpy.data.images:
    if img.source != 'FILE': continue
    for d in dirs:
        p = os.path.join(d, os.path.basename(img.filepath))
        if os.path.exists(p): img.filepath = p; img.reload(); break
    if img.size[0] == 0: print('MISSING IMAGE', img.name, img.filepath)

rig = bpy.data.objects['rig']
skel_data = rig.data.copy(); skel = bpy.data.objects.new('Skeleton', skel_data)
scene.collection.objects.link(skel)
skel.matrix_world = rig.matrix_world.copy()
for o in scene.objects: o.select_set(False)
bpy.context.view_layer.objects.active = skel; skel.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = skel_data.edit_bones
keep = {b.name for b in eb if b.use_deform}
for b in list(eb):
    if b.name in keep: b.name = b.name[4:]
for b in eb:
    if b.name in REPARENT: b.parent = eb[REPARENT[b.name]] if REPARENT[b.name] else None
    b.use_connect = False
for b in list(eb):
    if b.name.startswith(('ORG-', 'MCH-', 'DEF-', 'VIS', 'WGT')) or ('DEF-' + b.name) not in keep: eb.remove(b)
bpy.ops.object.mode_set(mode='OBJECT')
for pb in skel.pose.bones:
    for c in list(pb.constraints): pb.constraints.remove(c)
    pb.custom_shape = None; pb.rotation_mode = 'QUATERNION'
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
for k in list(skel_data.keys()): del skel_data[k]
if skel.animation_data: skel.animation_data_clear()
for coll in list(skel_data.collections_all) if hasattr(skel_data, 'collections_all') else []:
    pass
print('BONES', len(skel_data.bones), [(b.name, b.parent.name if b.parent else None) for b in skel_data.bones])

# --- bind every mesh to the skeleton
meshes = []
for name, look in LOOKS.items():
    if not look: continue
    o = bpy.data.objects[name]
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for vg in list(o.vertex_groups):
        if vg.name.startswith('DEF-'): vg.name = vg.name[4:]
        else: o.vertex_groups.remove(vg)
    for m in list(o.modifiers):
        if m.type == 'ARMATURE': m.object = skel
        else: o.modifiers.remove(m)
    o.parent = skel; o.matrix_parent_inverse = skel.matrix_world.inverted()
    o.name = look; o.data.name = look
    for c in list(o.users_collection): c.objects.unlink(o)
    scene.collection.objects.link(o)
    meshes.append(o)

# --- delete everything else
for o in list(bpy.data.objects):
    if o is not skel and o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for arm in list(bpy.data.armatures):
    if arm is not skel_data: bpy.data.armatures.remove(arm)
bpy.ops.outliner.orphans_purge(do_recursive=True) if bpy.context.area else None
print('MESHES', [(o.name, len(o.data.vertices), [m.name for m in o.data.materials], tuple(round(v, 3) for v in o.matrix_world.translation)) for o in meshes])
bpy.ops.wm.save_as_mainfile(filepath=OUT)
