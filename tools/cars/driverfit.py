# Seat the game's racer (models/characters.glb: 'racer' + 'racer_helmet' on the Mixamo rig) in the sprint car and
# measure the fit. Run after sprintcar.py (needs its TUBES / SW / SWR / SAX globals) in the same exec namespace:
#   exec(open('tools/cars/driverfit.py').read(), g)      (g = the dict sprintcar.py ran in)
# Pose: hips in the seat, the body leaning back RECLINE degrees, feet on the pedals, hands at 9 and 3 on the wheel
# (a direct two-bone solve per limb). Reports the helmet's clearance under the cage and every part of the driver inside the car.
import bpy, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line

GLB = '/Users/joshkern/Downloads/Racing Game/models/characters.glb'
HIP = Vector(globals().get('SEAT_HIP', (0, 0.18, 0.38)))       # hip joint (seat pan ~ 0.09 below it)
RECLINE = globals().get('RECLINE', 12)                         # degrees back from upright
PEDAL = globals().get('PEDAL', (0.11, -0.50, 0.40))             # right foot's pedal (mirrored for the left)

fc = bpy.data.collections.get('DriverFit') or bpy.data.collections.new('DriverFit')
if 'DriverFit' not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(fc)
if 'Character' not in bpy.data.objects:
  before = set(bpy.data.objects)
  bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children['DriverFit']
  bpy.ops.import_scene.gltf(filepath=GLB)
  bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
  for o in [o for o in bpy.data.objects if o not in before]:
    if o.name not in ('Character', 'racer', 'racer_helmet'): bpy.data.objects.remove(o, do_unlink=True)
arm = bpy.data.objects['Character']; PB = arm.pose.bones; B = lambda n: 'mixamorig:' + n
if arm.animation_data:
  arm.animation_data.action = None
  for t in arm.animation_data.nla_tracks: t.mute = True
for pb in PB:
  pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
  for cn in list(pb.constraints): pb.constraints.remove(cn)

# targets: hands at 9 and 3 on the wheel (u = the car's left), feet on the pedals; elbows bend down and out, knees up
u, v = frame(SAX)
TGT = {'LeftHand': SW + u * SWR, 'RightHand': SW - u * SWR,
       'LeftFoot': Vector((PEDAL[0], PEDAL[1], PEDAL[2])), 'RightFoot': Vector((-PEDAL[0], PEDAL[1], PEDAL[2]))}
BEND = {'Left': Vector((0.0, 0.3, -1)), 'Right': Vector((0.0, 0.3, -1)), 'knee': Vector((0, -0.2, 1))}   # elbows down, inside the cage

for n in ('RefHelmet', 'RefTorso'):                   # an old build's stand-in driver
  if n in bpy.data.objects: bpy.data.objects[n].hide_viewport = bpy.data.objects[n].hide_render = True
# body: the rig rests lying along +Y (the game's clips stand it up through the hips): stand it up, face the nose (-Y),
# lean back about the hips, hips into the seat
S = Matrix.Diagonal((0.01, 0.01, 0.01, 1))          # the glb's cm -> m
up = Matrix.Rotation(math.radians(90), 4, 'X')
arm.matrix_world = up @ S; bpy.context.view_layer.update()
toe = arm.matrix_world @ PB[B('LeftToeBase')].head - arm.matrix_world @ PB[B('LeftFoot')].head
if toe.y > 0: up = Matrix.Rotation(math.pi, 4, 'Z') @ up
arm.matrix_world = Matrix.Rotation(-math.radians(RECLINE), 4, 'X') @ up @ S
bpy.context.view_layer.update()
hw = arm.matrix_world @ PB[B('Hips')].head
arm.matrix_world = Matrix.Translation(HIP - hw) @ arm.matrix_world
bpy.context.view_layer.update()

# limbs: a direct two-bone solve (no IK constraints: the rig rests dead straight, and the imported bones' tails are
# guesses). Each bone is turned so the next joint lands where it should, upper bone first.
W = lambda n: arm.matrix_world @ PB[B(n)].head
def aim(bone, child, target):
  """turn bone about its head so child's head points at target (world)"""
  pb = PB[B(bone)]; inv = arm.matrix_world.inverted()
  h, c, t = inv @ W(bone), inv @ W(child), inv @ target
  q = (c - h).rotation_difference(t - h)
  pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
  bpy.context.view_layer.update()
def two_bone(upper, mid, end, target, bend):
  s0, m0, e0 = W(upper), W(mid), W(end)
  L1, L2 = (m0 - s0).length, (e0 - m0).length
  d = target - s0; dist = min(d.length, (L1 + L2) * 0.999); dn = d.normalized()
  a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist); h = math.sqrt(max(L1 * L1 - a * a, 0))
  n = (bend - dn * bend.dot(dn)).normalized()          # bend direction, square to shoulder -> wrist
  joint = s0 + dn * a + n * h
  aim(upper, mid, joint); aim(mid, end, s0 + dn * dist)
for side in ('Left', 'Right'):
  two_bone(side + 'Arm', side + 'ForeArm', side + 'Hand', TGT[side + 'Hand'], BEND[side])
  two_bone(side + 'UpLeg', side + 'Leg', side + 'Foot', TGT[side + 'Foot'], BEND['knee'])
  aim(side + 'Foot', side + 'ToeBase', W(side + 'Foot') + Vector((0, -1, 0.45)) * 0.12)   # toes forward, up on the pedal


# ---------- measure ----------
dg = bpy.context.evaluated_depsgraph_get()
def world_verts(name):
  o = bpy.data.objects[name]; ev = o.evaluated_get(dg); me = ev.to_mesh()
  pts = [o.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear(); return pts
helmet = world_verts('racer_helmet'); body = world_verts('racer')
top = max(p.z for p in helmet)
def seg_dist(p, a, b):
  q, t = intersect_point_line(p, a, b); t = max(0.0, min(1.0, t)); return (p - (a + (b - a) * t)).length
frame_tubes = [t for t in TUBES if getattr(t['m'], 'name', '') in ('Frame', 'WingPosts', 'SteeringWheel')]
def tube_hits(pts):
  hits = {}
  for p in pts:
    for t in frame_tubes:
      d = seg_dist(p, t['a'], t['b']) - t['r']
      if d < 0:
        k = tuple(round(c, 2) for c in (t['a'] + t['b']) / 2); hits[k] = min(hits.get(k, 0), d)
  return hits
def clearance(pts):
  return min(seg_dist(p, t['a'], t['b']) - t['r'] for p in pts for t in frame_tubes)
def inside(pts, name):
  o = bpy.data.objects[name]; T = BVHTree.FromObject(o, dg); inv = o.matrix_world.inverted(); n = 0
  for p in pts:
    q = inv @ p; c = 0; d = Vector((0.0123, 0.0071, 1)).normalized(); s = q
    for _ in range(8):
      loc, nrm, i, dist = T.ray_cast(s, d)
      if loc is None: break
      c += 1; s = loc + d * 1e-4
    n += c % 2
  return n
FIT = {
  'helmet_top_z': round(top, 3),
  'helmet_clearance_to_tubes_m': round(clearance(helmet), 3),
  'helmet_in_tubes': len(tube_hits(helmet)),
  'body_in_tubes': {str(k): round(v, 3) for k, v in tube_hits(body).items()},
  'body_verts_in': {n: inside(body, n) for n in ('Body', 'Engine')},
  'hands': [[round(c, 3) for c in arm.matrix_world @ PB[B(s + 'Hand')].head] for s in ('Left', 'Right')],
  'feet': [[round(c, 3) for c in arm.matrix_world @ PB[B(s + 'Foot')].head] for s in ('Left', 'Right')],
}
print(FIT)
