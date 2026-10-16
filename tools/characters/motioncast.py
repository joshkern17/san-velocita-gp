# Motion Cast's "Racing Team" mocap (Animation Pack #03 Vol. 1, Blender files: not in the repo, the pack's licence)
# onto the game's Mixamo skeleton, as clips like any other (mixamo.py calls add() before it exports).
# Each take is its own .blend: a mannequin (53 bones, "mannequin.mc"), one action, 30 fps. Both skeletons rest in a
# T-pose, so the retarget is world-space: each Mixamo bone turns the way its Motion Cast bone turns from rest
#     W_mixamo(f) = Y · W_mc(f) · W_mc(rest)⁻¹ · Y⁻¹ · W_mixamo(rest)
# (Y: the turn between the two skeletons' facing, about the vertical), then back into each bone's own rest frame.
# The hips' position follows the mannequin's, scaled by the two hip heights. Bones with no partner (the Mixamo
# end bones) keep their rest pose under their parent.
import bpy, os
from mathutils import Quaternion, Vector, Matrix

# clip name -> the take's file (Motion Cast 1.5 naming)
TAKES = {
  'pit_gun': "4-Gunman F1-10'style-Take1",            # kneeling at a wheel: waits, undoes the nut, waits, tightens
  'pit_jack_front': '2-Mechanic with front jack-Take1',  # walks up to the nose, levers the car up, holds, drops it, backs off
  'pit_jack_rear': '3-Mechanic holding the rear jack',  # the rear jack: down on it, holds, up
  'pit_lollipop': '1-Lollipop man-Take1',               # steps out, the board down in front of the car, holds, lifts it
}
MAP = {  # Mixamo bone (without 'mixamorig:') <- Motion Cast bone
  'Hips': 'Hip', 'Spine': 'LowerSpine', 'Spine1': 'MiddleSpine', 'Spine2': 'Chest', 'Neck': 'Neck', 'Head': 'Head',
  'LeftShoulder': 'LClavicle', 'LeftArm': 'LShoulder', 'LeftForeArm': 'LForearm', 'LeftHand': 'LHand',
  'RightShoulder': 'RClavicle', 'RightArm': 'RShoulder', 'RightForeArm': 'RForearm', 'RightHand': 'RHand',
  'LeftUpLeg': 'LThigh', 'LeftLeg': 'LShin', 'LeftFoot': 'LFoot', 'LeftToeBase': 'LToe',
  'RightUpLeg': 'RThigh', 'RightLeg': 'RShin', 'RightFoot': 'RFoot', 'RightToeBase': 'RToe',
}

def _wq(arm, bone):  # a pose bone's world rotation
    return (arm.matrix_world @ arm.pose.bones[bone].matrix).to_quaternion()
def _rq(arm, bone):  # its rest world rotation
    return (arm.matrix_world @ arm.data.bones[bone].matrix_local).to_quaternion()
def _yaw_between(a, b):  # the turn about +Z taking ground direction a to b
    import math
    return Quaternion((0, 0, 1), math.atan2(b.y, b.x) - math.atan2(a.y, a.x))
def _fwd(arm, toe, foot):  # which way a skeleton faces at rest: from the ankle to the toe, on the ground
    d = arm.matrix_world @ arm.data.bones[toe].head_local - arm.matrix_world @ arm.data.bones[foot].head_local
    return Vector((d.x, d.y, 0)).normalized()

def load_take(path):
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n == 'mannequin.mc']
    arm = dst.objects[0]
    bpy.context.scene.collection.objects.link(arm)
    return arm

def retarget(rig, P, src, name):
    scene = bpy.context.scene
    act_src = src.animation_data.action
    f0, f1 = int(act_src.frame_range[0]), int(act_src.frame_range[1])
    names = [b.name for b in rig.data.bones]  # parents before children
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
    rigq = rig.matrix_world.to_quaternion(); rigqi = rigq.inverted()
    # rest: each side's world rotations, their facing, their hip heights
    # (rest straight from the bones' rest matrices: the take's pose bones are left alone, their keys are Euler)
    bpy.context.view_layer.update()
    Ws0 = {s: _rq(src, s) for s in MAP.values()}
    Wt0 = {P + t: _rq(rig, P + t) for t in MAP}
    Y = _yaw_between(_fwd(src, 'LToe', 'LFoot'), _fwd(rig, P + 'LeftToeBase', P + 'LeftFoot')); Yi = Y.inverted()
    k = (rig.matrix_world @ rig.data.bones[P + 'Hips'].head_local).z / (src.matrix_world @ src.data.bones['Hip'].head_local).z
    rest_rel = {}
    for n in names:
        b = rig.data.bones[n]
        rest_rel[n] = (b.parent.matrix_local.inverted() @ b.matrix_local).to_quaternion() if b.parent else b.matrix_local.to_quaternion()
    hips = rig.data.bones[P + 'Hips']; hips_rest_inv = hips.matrix_local.inverted(); rig_inv = rig.matrix_world.inverted()
    act = bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action = act
    prev = {}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        Qa = {}
        for n in names:
            t = n[len(P):] if n.startswith(P) else None
            if t in MAP:
                s = MAP[t]
                D = Y @ (_wq(src, s) @ Ws0[s].inverted()) @ Yi
                Qa[n] = rigqi @ (D @ Wt0[n])
            else:
                b = rig.data.bones[n]
                Qa[n] = (Qa[b.parent.name] @ rest_rel[n]) if b.parent else (rigqi @ _rq(rig, n))
        key = f - f0 + 1
        for n in names:
            b = rig.data.bones[n]; pb = rig.pose.bones[n]
            q = rest_rel[n].inverted() @ (Qa[b.parent.name].inverted() if b.parent else Quaternion()) @ Qa[n] if b.parent else rest_rel[n].inverted() @ Qa[n]
            if n in prev and prev[n].dot(q) < 0: q.negate()
            prev[n] = q.copy(); pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=key, group=n)
        # the hips: where the mannequin's are, scaled to this skeleton, turned to its facing
        hw = src.matrix_world @ src.pose.bones['Hip'].head
        pw = Y @ (hw * k)
        pa = rig_inv @ pw
        rig.pose.bones[P + 'Hips'].location = hips_rest_inv @ pa
        rig.pose.bones[P + 'Hips'].keyframe_insert('location', frame=key, group=P + 'Hips')
    rig.animation_data.action = None
    return act, f1 - f0 + 1

# every take that's there, as an NLA track on the rig (as mixamo.py does its own clips). Returns the clip names made.
def add(rig, folder, P='mixamorig:'):
    made = []
    for name, take in TAKES.items():
        path = os.path.join(folder, take + '.blend')
        if not os.path.exists(path): print('MISSING motioncast', take); continue
        src = load_take(path)
        act, n = retarget(rig, P, src, name)
        act.use_fake_user = True
        track = rig.animation_data.nla_tracks.new(); track.name = name
        track.strips.new(name, 1, act); track.mute = True
        bpy.data.objects.remove(src, do_unlink=True)
        print('CLIP', name, '(motioncast)', n, 'frames')
        made.append(name)
    return made
