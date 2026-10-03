# Put the rebuilt NPCs (tools/characters/rebuild.py) on the Mixamo skeleton and pull in every Mixamo clip.
#   blender -b <npcs_clean.blend> --python tools/characters/mixamo.py -- <mixamo dir> <out.glb> [check]
# The skeleton comes from <mixamo dir>/T-Pose.fbx (auto-rigged on this exact body, so its joints sit on the mesh).
# Skin weights stay the pack's own: each Rigify deform group is merged into the Mixamo bone it corresponds to.
# Every other .fbx in the folder is a clip ("Without Skin"); CLIPS maps its file name to the clip name in the game.
import bpy, sys, os, glob
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
CHECK = 'check' in argv[2:]

CLIPS = {
  'Standing Idle': 'idle', 'Look Around': 'idle_look', 'Arm Stretching': 'idle_stretch', 'Waving': 'wave', 'Victory': 'victory',
  'Pointing': 'point', 'Angry Point': 'point_angry', 'Shaking Hands 2': 'handshake',
  'Walking': 'walk', 'Walking(1)': 'walk_2',
  'Sitting': 'sit', 'Sitting Idle': 'sit_idle', 'Sitting Clap': 'sit_clap', 'Sitting Clap(1)': 'sit_clap_2',
  'Sitting Yell': 'sit_yell', 'Sitting Yell(1)': 'sit_yell_2', 'Sitting Rubbing Arm': 'sit_rub_arm',
}
M = 'mixamorig:'
GROUPS = {  # Rigify deform group -> Mixamo bone
  'spine': 'Hips', 'pelvis.L': 'Hips', 'pelvis.R': 'Hips', 'spine.001': 'Spine', 'spine.002': 'Spine1',
  'spine.003': 'Spine2', 'breast.L': 'Spine2', 'breast.R': 'Spine2', 'spine.004': 'Neck', 'spine.005': 'Neck', 'spine.006': 'Head',
}
for s, S in (('L', 'Left'), ('R', 'Right')):
  GROUPS.update({f'shoulder.{s}': f'{S}Shoulder', f'upper_arm.{s}': f'{S}Arm', f'upper_arm.{s}.001': f'{S}Arm',
                 f'forearm.{s}': f'{S}ForeArm', f'forearm.{s}.001': f'{S}ForeArm', f'hand.{s}': f'{S}Hand',
                 f'thigh.{s}': f'{S}UpLeg', f'thigh.{s}.001': f'{S}UpLeg', f'shin.{s}': f'{S}Leg', f'shin.{s}.001': f'{S}Leg',
                 f'foot.{s}': f'{S}Foot', f'toe.{s}': f'{S}ToeBase'})

scene = bpy.context.scene
scene.render.fps = 30  # Mixamo clips are 30 fps
old = bpy.data.objects['Skeleton']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']

def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=False)
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.type == 'ARMATURE'][0], new

rig, _ = import_fbx(os.path.join(SRC, 'T-Pose.fbx'))
rig.name = 'Character'; rig.data.name = 'Character'
if rig.animation_data: rig.animation_data.action = None
for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
bpy.context.view_layer.update()

# sanity: the Mixamo joints should land on the Rigify ones
def head(arm, bone): return arm.matrix_world @ arm.pose.bones[bone].head
for a, b in (('spine', 'Hips'), ('hand.L', 'LeftHand'), ('foot.R', 'RightFoot'), ('spine.006', 'Head')):
    print('ALIGN', a, b, round((head(old, a) - head(rig, M + b)).length, 3))

# The pack's meshes are modelled in an A-pose; Mixamo's skeleton rests in a T-pose. Swing the Rigify limbs onto the
# Mixamo joints and bake that into the meshes, so mesh and skeleton agree at rest.
AIM = {}
for s, S in (('L', 'Left'), ('R', 'Right')):
    AIM.update({f'upper_arm.{s}': f'{S}ForeArm', f'forearm.{s}': f'{S}Hand', f'hand.{s}': f'{S}HandIndex1',
                f'thigh.{s}': f'{S}Leg', f'shin.{s}': f'{S}Foot', f'foot.{s}': f'{S}ToeBase'})
order = ['thigh', 'shin', 'foot', 'upper_arm', 'forearm', 'hand']
for part in order:
    for s in 'LR':
        pb = old.pose.bones[f'{part}.{s}']
        c = pb.constraints.new('DAMPED_TRACK'); c.target = rig; c.subtarget = M + AIM[pb.name]
bpy.context.view_layer.update()
for o in meshes:
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=[m.name for m in o.modifiers if m.type == 'ARMATURE'][0])
bpy.context.view_layer.update()
for a, b in (('hand.L', 'LeftHand'), ('forearm.R', 'RightForeArm'), ('foot.R', 'RightFoot')):
    print('ALIGN posed', a, b, round((head(old, a) - head(rig, M + b)).length, 3))

for o in meshes:
    for vg in list(o.vertex_groups):
        tgt = M + GROUPS[vg.name]
        dst = o.vertex_groups.get(tgt) or o.vertex_groups.new(name=tgt)
        idx = vg.index
        for v in o.data.vertices:
            for g in v.groups:
                if g.group == idx and g.weight > 0: dst.add([v.index], g.weight, 'ADD')
        o.vertex_groups.remove(vg)
    mw = o.matrix_world.copy()
    o.parent = rig; o.matrix_world = mw
    o.modifiers.new('Armature', 'ARMATURE').object = rig
bpy.data.objects.remove(old, do_unlink=True)

# clips: each import brings its own armature + action; keep the action, drop the armature
for f in sorted(glob.glob(os.path.join(SRC, '*.fbx'))):
    base = os.path.splitext(os.path.basename(f))[0]
    if base not in CLIPS:
        if base != 'T-Pose': print('SKIP', base)
        continue
    arm, new = import_fbx(f)
    act = arm.animation_data.action
    act.name = CLIPS[base]; act.use_fake_user = True
    slot = arm.animation_data.action_slot
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    rig.animation_data_create()
    rig.animation_data.action = act
    if slot: rig.animation_data.action_slot = slot
    track = rig.animation_data.nla_tracks.new(); track.name = act.name
    strip = track.strips.new(act.name, int(act.frame_range[0]), act); track.mute = True
    rig.animation_data.action = None
    print('CLIP', act.name, tuple(act.frame_range))
for a in list(bpy.data.actions):
    if a.name not in CLIPS.values(): bpy.data.actions.remove(a)

if CHECK:
    bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.glb', '.blend'))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='NLA_TRACKS', export_anim_single_armature=True,
                          export_force_sampling=True, export_frame_step=1, export_def_bones=False, export_skins=True,
                          export_yup=True, export_apply=False, export_cameras=False, export_lights=False)
print('WROTE', OUT, os.path.getsize(OUT))
