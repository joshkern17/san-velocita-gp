# 410 winged sprint car, built from scratch (no source model): tube frame, tin body, top + nose wings, staggered tyres.
#   In the open Blender (MCP):  exec(open('tools/cars/sprintcar.py').read())
#   Headless:                   Blender -b -P tools/cars/sprintcar.py -- <out.blend>
# Real sizes (a 410): 84" wheelbase, 25 sq ft top wing (5' x 5') with ~30" side boards, 6 sq ft nose wing,
# right rear 105" round x 18" wide, left rear ~96" x 16", fronts 78" x 9".
# Game space: metres, nose along -Y, tyres on Z = 0, centred on the wheelbase. Car's right side = -X.
# Everything lives in the 'SprintCar' collection; a rerun replaces it.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

WB = 2.134                       # wheelbase
YF, YR = -WB / 2, WB / 2         # axles
# tyres: (name, x, y, radius, width)
TYRES = [('Wheel_FL', 0.72, YF, 0.316, 0.26), ('Wheel_FR', -0.72, YF, 0.316, 0.26),
         ('Wheel_RL', 0.77, YR, 0.390, 0.42), ('Wheel_RR', -0.81, YR, 0.425, 0.48)]
RIM_R = 0.20                     # 15" wheels
SIDES = 22                       # tyre segments
TUBE_R, TUBE_N = 0.021, 6        # 1.75" chrome-moly, 6-sided (shaded smooth)
WING_DEG = 28                    # top wing angle of attack (leading edge low)
# cage roof (front / rear hoop tops): set by the game's racer (1.83 m, tools/cars/driverfit.py) seated upright,
# helmet top ~1.20 m + clearance; the top wing sits on the cage, so it rises with it (WDZ)
ROOF_F, ROOF_R = 1.27, 1.31
WDZ = ROOF_F - 0.96
# race adjustments (the game moves the Wing_Top / Wing_Nose objects; these only preview them here)
WING_SLIDE = 0.0                 # top wing slid back along its rails, m (+ = back; the cockpit slider gives about +-0.15)
WING_LEFT = 0.0                  # top wing offset to the car's left, m (real cars run 0-0.15)
NOSE_LEFT = 0.0                  # nose wing offset to the left, m
TIRE_TEXT = 'VELOCITA'           # sidewall lettering (white, round every outer sidewall)
HERE = os.path.dirname(os.path.abspath(globals().get('__file__') or sys.argv[0]))

# ---------- scene ----------
COLL = 'SprintCar'
if COLL in bpy.data.collections:
  c = bpy.data.collections[COLL]
  for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
else:
  c = bpy.data.collections.new(COLL); bpy.context.scene.collection.children.link(c)

def mat(name, rgb, rough=1.0, metal=0.0):
  m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
  m.use_nodes = True; p = m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = rough
  p.inputs['Metallic'].default_value = metal
  if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = 0 if metal == 0 else 0.5
  m.diffuse_color = (*rgb, 1); return m
M = {'Livery': mat('Livery', (0.9, 0.9, 0.9)), 'Black': mat('Black', (0.03, 0.03, 0.03)),
     'Tyre': mat('Tyre', (0.05, 0.05, 0.05)), 'Rim': mat('Rim', (0.7, 0.7, 0.72), 0.4, 1.0),
     'Metal': mat('Metal', (0.75, 0.72, 0.68), 0.35, 1.0), 'FrameBlack': mat('FrameBlack', (0.06, 0.06, 0.06), 0.6)}
M['Rim'] = mat('Rim', (0.92, 0.92, 0.94), 0.2, 1.0)    # polished aluminium

def tire_wall_texture(text, path):
  """white sidewall lettering on black rubber: one strip, wrapped round the sidewall (u = round, v = rim -> shoulder)"""
  s2 = bpy.data.scenes.get('TireTex') or bpy.data.scenes.new('TireTex')
  for o in list(s2.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
  WD, HT = 8.0, 1.0
  cu = bpy.data.curves.new('TireText', 'FONT'); cu.body = text; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
  cu.shear = 0.18; cu.space_character = 1.06
  try: cu.font = bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Impact.ttf', check_existing=True)
  except Exception: pass
  t = bpy.data.objects.new('TireText', cu); s2.collection.objects.link(t)
  tm = bpy.data.materials.get('TireTextWhite') or bpy.data.materials.new('TireTextWhite'); tm.diffuse_color = (0.9, 0.9, 0.9, 1)
  cu.materials.append(tm)
  bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
  t.scale = (1, 1, 1); h = max(t.evaluated_get(dg).dimensions.y, 1e-3)
  k = 0.58 * HT / h; t.scale = (k, k, 1); t.location = (WD / 2, HT / 2, 0)
  cam = bpy.data.objects.new('TireCam', bpy.data.cameras.new('TireCam')); s2.collection.objects.link(cam)
  cam.data.type = 'ORTHO'; cam.data.ortho_scale = WD; cam.location = (WD / 2, HT / 2, 5); s2.camera = cam
  w = bpy.data.worlds.get('TireTexWorld') or bpy.data.worlds.new('TireTexWorld'); w.color = (0.03, 0.03, 0.03); s2.world = w
  s2.render.engine = 'BLENDER_WORKBENCH'; s2.display.shading.light = 'FLAT'; s2.display.shading.color_type = 'MATERIAL'
  s2.view_settings.view_transform = 'Standard'
  s2.render.resolution_x, s2.render.resolution_y, s2.render.resolution_percentage = 2048, 256, 100
  s2.render.filepath = path; s2.render.image_settings.file_format = 'PNG'
  bpy.ops.render.render(write_still=True, scene=s2.name)
  img = bpy.data.images.get(os.path.basename(path))
  if img: img.reload()
  else: img = bpy.data.images.load(path)
  return img

def wall_material(img):
  m = bpy.data.materials.get('TyreWall') or bpy.data.materials.new('TyreWall'); m.use_nodes = True
  nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
  tx = nt.nodes.get('Letters') or nt.nodes.new('ShaderNodeTexImage'); tx.name = 'Letters'; tx.image = img
  tx.extension = 'REPEAT'; tx.interpolation = 'Linear'
  nt.links.new(tx.outputs['Color'], p.inputs['Base Color'])
  p.inputs['Roughness'].default_value = 1.0
  if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = 0
  m.diffuse_color = (0.05, 0.05, 0.05, 1); return m
M['TyreWall'] = wall_material(tire_wall_texture(TIRE_TEXT, os.path.join(HERE, 'sprintcar_tirewall.png')))

def tread_texture(path, W=512, H=256):
  """a dirt tyre's block tread: staggered blocks, dark grooves (u = round the tyre, v = across it)"""
  import numpy as np
  px = np.full((H, W, 4), 1.0, np.float32); px[..., :3] = 0.07
  cols, rows, g = 16, 6, 0.22                       # blocks round one repeat, rows across, groove share of a block
  for r in range(rows):
    y0, y1 = int(H * r / rows), int(H * (r + 1) / rows)
    off = 0.5 if r % 2 else 0.0
    px[y0:y0 + max(2, int((y1 - y0) * g)), :, :3] = 0.018            # groove along the tyre
    for cidx in range(cols + 1):
      x = int(W * ((cidx + off) / cols)) % W
      px[y0:y1, x:x + max(2, int(W / cols * g)), :3] = 0.018          # groove across
  img = bpy.data.images.get('SprintTread') or bpy.data.images.new('SprintTread', W, H)
  img.scale(W, H); img.pixels.foreach_set(px.ravel()); img.filepath_raw = path; img.file_format = 'PNG'; img.save()
  return img
def tread_material(img):
  m = bpy.data.materials.get('TyreTread') or bpy.data.materials.new('TyreTread'); m.use_nodes = True
  nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
  tx = nt.nodes.get('Tread') or nt.nodes.new('ShaderNodeTexImage'); tx.name = 'Tread'; tx.image = img; tx.extension = 'REPEAT'
  nt.links.new(tx.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 1.0
  if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = 0
  m.diffuse_color = (0.05, 0.05, 0.05, 1); return m
M['TyreTread'] = tread_material(tread_texture(os.path.join(HERE, 'sprintcar_tread.png')))

class Mesh:
  def __init__(s): s.bm = bmesh.new(); s.mats = []; s.uv = s.bm.loops.layers.uv.new('UVMap')
  def mi(s, m):
    if m not in s.mats: s.mats.append(m)
    return s.mats.index(m)
  def face(s, pts, m, uv=None):
    f = s.bm.faces.new([s.bm.verts.new(p) for p in pts]); f.material_index = s.mi(m)
    if uv:
      for l, t in zip(f.loops, uv): l[s.uv].uv = t
    return f
  def finish(s, name, angle=30, origin=None):
    """angle = Shade Auto Smooth angle (degrees); origin = the object's pivot (the mesh is kept where it is)"""
    s.name = name; me = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(s.bm, verts=s.bm.verts, dist=1e-5)
    s.bm.normal_update(); s.bm.to_mesh(me); s.bm.free()
    for m in s.mats: me.materials.append(M[m])
    o = bpy.data.objects.new(name, me); c.objects.link(o)
    if origin is not None:
      me.transform(Matrix.Translation(-Vector(origin))); o.location = origin
    auto_smooth(o, angle); return o

def auto_smooth(o, angle):
  """Shade Auto Smooth (the Smooth by Angle modifier); without it, the same result as sharp edges in the mesh"""
  for p in o.data.polygons: p.use_smooth = True
  try:
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
      bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    if any(md.type == 'NODES' for md in o.modifiers): return
  except Exception: pass
  bm = bmesh.new(); bm.from_mesh(o.data)
  for e in bm.edges:
    e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle))
  bm.to_mesh(o.data); bm.free()

def frame(d):
  """two unit vectors perpendicular to d"""
  ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
  u = d.cross(ref).normalized(); return u, d.cross(u).normalized()

TUBES = []                                          # every tube segment, for the connection check at the end
def bent(m, pts, r, n, mt, cap_mt, end_plane=None):
  """one continuous tube through pts: rings square to the bend at each joint (no notches), capped ends;
  end_plane = (point, normal): the last end is cut along that plane instead (sits flush on a sloped surface)"""
  P = [Vector(p) for p in pts]; D = [(q - p).normalized() for p, q in zip(P, P[1:])]
  T = [D[0]] + [(D[i - 1] + D[i]).normalized() for i in range(1, len(D))] + [D[-1]]
  u = frame(D[0])[0]; rings = []
  for c, t in zip(P, T):
    u = (u - t * u.dot(t)).normalized(); v = t.cross(u)      # carried along the tube, so it never twists
    rings.append([c + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r for k in range(n)])
  if end_plane and abs(T[-1].dot(Vector(end_plane[1]))) > 0.5:   # (a tube meeting the plane at a shallow angle keeps its square end)
    q, nn = Vector(end_plane[0]), Vector(end_plane[1]); t = T[-1]
    rings[-1] = [v + t * ((q - v).dot(nn) / t.dot(nn)) for v in rings[-1]]
  for A, B in zip(rings, rings[1:]):
    for k in range(n):
      j = (k + 1) % n; m.face([A[k], A[j], B[j], B[k]], mt)
  m.face(rings[0][::-1], cap_mt[0]); m.face(rings[-1], cap_mt[1])

def tube(m, a, b, r=TUBE_R, n=TUBE_N, mt='FrameBlack', ends=(True, True), label='', end_plane=None):
  """ends = which ends must be attached to something (checked at the end)"""
  TUBES.append({'m': m, 'a': Vector(a), 'b': Vector(b), 'r': r, 'ends': ends, 'label': label, 'g': len(TUBES)})
  bent(m, [a, b], r, n, mt, (mt, mt), end_plane)

def path(m, pts, open_end=False, r=TUBE_R, n=TUBE_N, mt='FrameBlack'):
  """a bent tube; open_end = its last end is meant to be free (an exhaust outlet: capped black, reads as a hole)"""
  g0 = len(TUBES); k = len(pts) - 1
  for i, (p, q) in enumerate(zip(pts, pts[1:])):
    TUBES.append({'m': m, 'a': Vector(p), 'b': Vector(q), 'r': r, 'ends': (i == 0, i == k - 1 and not open_end), 'label': '', 'g': g0})
  bent(m, pts, r, n, mt, (mt, 'Black' if open_end else mt))

def mirror(pts):
  return [(-x, y, z) for x, y, z in pts]

def loft(m, secs, mt, cap0=None, cap1=None):
  """sections = list of (y, [(x, z), ...]) closed loops, same count, listed anticlockwise seen from the nose"""
  rings = [[Vector((x, y, z)) for x, z in pts] for y, pts in secs]
  for R0, R1 in zip(rings, rings[1:]):
    n = len(R0)
    for k in range(n):
      j = (k + 1) % n; m.face([R0[k], R1[k], R1[j], R0[j]], mt)
  if cap0: m.face(list(reversed(rings[0])), cap0)
  if cap1: m.face(rings[-1], cap1)

def slab_x(m, poly_yz, x0, x1, mt):
  """flat plate: a (y, z) outline extruded across x0..x1 (x0 < x1)"""
  A = [Vector((x0, y, z)) for y, z in poly_yz]; B = [Vector((x1, y, z)) for y, z in poly_yz]
  m.face(A, mt); m.face(list(reversed(B)), mt)
  n = len(A)
  for k in range(n):
    j = (k + 1) % n; m.face([A[k], B[k], B[j], A[j]], mt)

# ---------- tyres + wheels ----------
def wheel(name, x, y, R, W):
  m = Mesh(); out = 1 if x > 0 else -1           # outer face direction
  RB = RIM_R + 0.015                                # the bead (where the tyre meets the rim)
  RS = R - 0.055                                    # top of the flat outer sidewall (the lettering band)
  # tyre profile across (offset from the wheel's centre plane, radius), inner bead -> tread -> outer bead
  prof = [(-W / 2, RB), (-W / 2, RS), (-W * 0.46, R - 0.018), (-W * 0.34, R),
          (W * 0.34, R), (W * 0.46, R - 0.018), (W / 2, RS), (W / 2, RB)]
  ang = [2 * math.pi * k / SIDES for k in range(SIDES + 1)]   # (last = first, so the lettering's u can wrap)
  P = lambda dx, r, a: Vector((x + dx * out, y + r * math.cos(a), R + r * math.sin(a)))
  def ring_band(d0, r0, d1, r1, mt, uv=None, outward=True):
    """one band of faces round the wheel; outward = the profile runs inner bead -> tread -> outer bead -> hub"""
    for k in range(SIDES):
      a, b = ang[k], ang[k + 1]
      f = [P(d0, r0, a), P(d1, r1, a), P(d1, r1, b), P(d0, r0, b)]
      t = uv(k) if uv else None
      if (out > 0) == outward: f = f[::-1]; t = t[::-1] if t else None
      m.face(f, mt, t)
  # lettering: repeats so it keeps its shape on every tyre size, reads clockwise seen from outside
  rep = max(2, round(2 * math.pi * (RB + RS) / 2 / ((RS - RB) * 7.2)))
  U = lambda k: -out * rep * k / SIDES
  trep = max(3, round(2 * math.pi * R / (0.92 * W * 2)))         # tread repeats (the texture is 2:1)
  TV = lambda d: (d + 0.46 * W) / (0.92 * W)                       # across the tread, shoulder to shoulder
  for i, ((d0, r0), (d1, r1)) in enumerate(zip(prof, prof[1:])):
    if 2 <= i <= 4:                                 # shoulders + tread: the block pattern
      ring_band(d0, r0, d1, r1, 'TyreTread', lambda k, a=TV(d0), b=TV(d1): [(trep * k / SIDES, a), (trep * k / SIDES, b),
                                                                            (trep * (k + 1) / SIDES, b), (trep * (k + 1) / SIDES, a)])
      continue
    if i == len(prof) - 2:                          # outer sidewall: shoulder (v 1) down to the bead (v 0)
      ring_band(d0, r0, d1, r1, 'TyreWall', lambda k: [(U(k), 1), (U(k), 0), (U(k + 1), 0), (U(k + 1), 1)])
    else: ring_band(d0, r0, d1, r1, 'Tyre')
  # polished beadlock wheel, outer face: the lock ring stands proud of the tyre, then a deep dish to the hub
  o2 = W / 2
  wface = [(o2 - 0.004, RB), (o2 + 0.014, RIM_R + 0.030), (o2 + 0.016, RIM_R - 0.022), (o2 - 0.045, RIM_R - 0.034),
           (o2 - 0.055, 0.105), (o2 - 0.022, 0.080), (o2 - 0.018, 0.045)]
  for (d0, r0), (d1, r1) in zip(wface, wface[1:]): ring_band(d0, r0, d1, r1, 'Rim')
  cap = [P(o2 - 0.018, 0.045, a) for a in ang[:-1]]; m.face(cap if out > 0 else cap[::-1], 'Rim')
  # beadlock bolts round the lock ring: little four-sided heads
  for k in range(16):
    a = 2 * math.pi * (k + 0.5) / 16; rb = RIM_R + 0.004; hb, e = 0.011, 0.009
    tip = P(o2 + 0.016 + hb, rb, a)
    bs = [P(o2 + 0.016, rb + e * dr, a + e * da / rb) for dr, da in ((1, 0), (0, 1), (-1, 0), (0, -1))]
    if out < 0: bs = bs[::-1]
    for i in range(4): m.face([bs[i], bs[(i + 1) % 4], tip], 'Rim')
  # inner face (car side): plain dish
  ring_band(-W / 2 + 0.004, RB, -W / 2 + 0.03, 0.09, 'Rim', outward=False)
  cap = [P(-W / 2 + 0.03, 0.09, a) for a in ang[:-1]]; m.face(cap[::-1] if out > 0 else cap, 'Rim')
  return m.finish(name, angle=35)

for t in TYRES: wheel(*t)

# ---------- frame, cage, bars ----------
F = Mesh()
ZB = 0.24                                           # frame rails' bottom
# main rails, left side (mirrored): nose to rear bumper mount
rail = [(0.16, -1.50, 0.30), (0.20, -1.15, 0.26), (0.28, -0.40, ZB), (0.30, 0.55, ZB), (0.26, 1.05, 0.30), (0.20, 1.40, 0.36)]
path(F, rail); path(F, mirror(rail))
upper = [(0.16, -1.50, 0.30), (0.14, -1.45, 0.52), (0.20, -1.10, 0.56), (0.26, -0.30, 0.64)]   # from the rail's nose up
path(F, upper); path(F, mirror(upper))
# cage: front hoop, rear hoop, top rails, braces
fh = [(0.28, -0.32, ZB), (0.27, -0.30, 0.64), (0.25, -0.22, 0.98), (0.22, -0.12, ROOF_F),
      (-0.22, -0.12, ROOF_F), (-0.25, -0.22, 0.98), (-0.27, -0.30, 0.64), (-0.28, -0.32, ZB)]
rh = [(0.30, 0.50, ZB), (0.28, 0.50, 0.70), (0.27, 0.49, 1.00), (0.24, 0.44, ROOF_R),
      (-0.24, 0.44, ROOF_R), (-0.27, 0.49, 1.00), (-0.28, 0.50, 0.70), (-0.30, 0.50, ZB)]
path(F, fh); path(F, rh)
for s in (1, -1):
  tube(F, (0.22 * s, -0.12, ROOF_F), (0.24 * s, 0.44, ROOF_R))        # top rails
  tube(F, (0.28 * s, 0.50, 0.70), (0.26 * s, 1.05, 0.30))             # rear hoop stays
  tube(F, (0.27 * s, -0.30, 0.64), (0.28 * s, 0.50, 0.70))            # shoulder bars
  tube(F, (0.20 * s, -1.10, 0.56), (0.20 * s, -1.15, 0.26))           # front uprights
  # nerf bars between the wheels (outer loop)
  path(F, [(0.265 * s, -0.55, 0.25), (0.56 * s, -0.45, 0.30), (0.60 * s, 0.35, 0.32), (0.30 * s, 0.55, 0.25)])
  tube(F, (0.56 * s, -0.45, 0.30), (0.56 * s, -0.40, 0.42)); tube(F, (0.56 * s, -0.40, 0.42), (0.60 * s, 0.35, 0.44))
  tube(F, (0.60 * s, 0.35, 0.44), (0.60 * s, 0.35, 0.32))
tube(F, (0.22, -0.12, ROOF_F), (-0.24, 0.44, ROOF_R))                 # roof X brace
tube(F, (0.27, -0.30, 0.64), (-0.27, -0.30, 0.64))                    # dash bar
# front bumper + rear bumper
path(F, [(0.16, -1.50, 0.30), (0.20, -1.60, 0.31), (0.20, -1.63, 0.48), (0.10, -1.66, 0.55), (-0.10, -1.66, 0.55),
         (-0.20, -1.63, 0.48), (-0.20, -1.60, 0.31), (-0.16, -1.50, 0.30)], r=0.016)       # nose hoop
path(F, [(0.20, -1.60, 0.31), (0.12, -1.67, 0.33), (-0.12, -1.67, 0.33), (-0.20, -1.60, 0.31)], r=0.016)
path(F, [(0.20, 1.40, 0.36), (0.34, 1.62, 0.40), (-0.34, 1.62, 0.40), (-0.20, 1.40, 0.36)])
path(F, [(0.20, 1.40, 0.36), (0.30, 1.52, 0.40), (0.30, 1.58, 0.62), (0.18, 1.61, 0.76), (-0.18, 1.61, 0.76),
         (-0.30, 1.58, 0.62), (-0.30, 1.52, 0.40), (-0.20, 1.40, 0.36)], r=0.016)       # tail hoop round the tank
# suspension. Every link ends in hardware, never as a bare cut tube: the front axle in a kingpin boss each side, the
# rear axle in a birdcage each side (inboard of the wheel), the shocks in eyelet bushings
def shock(a, b):
  """body + thinner shaft, an eyelet bushing (crosswise) at each end"""
  a, b = Vector(a), Vector(b); d = (b - a).normalized(); mid = a + (b - a) * 0.55
  tube(F, a, mid, r=0.026, mt='Metal'); tube(F, mid - d * 0.01, b, r=0.011, mt='Metal', ends=(False, True))
  e = d.cross(Vector((0, 0, 1))).normalized()
  for q in (a, b): tube(F, q - e * 0.024, q + e * 0.024, r=0.019, n=8, mt='FrameBlack', ends=(False, False))
YT = -1.123                                         # front torsion tube: through the front uprights
tube(F, (0.54, YF, 0.30), (-0.54, YF, 0.30), r=0.032, mt='Metal')                    # front axle, boss to boss
tube(F, (0.42, YT, 0.42), (-0.42, YT, 0.42), r=0.026)
tube(F, (0.40, YR - 0.20, 0.42), (-0.40, YR - 0.20, 0.42), r=0.026)
for s in (1, -1):
  KP = Vector((0.54 * s, YF, 0.30))                 # kingpin boss (a little caster; just inboard of the wheel), spindle out to the hub
  tube(F, KP + Vector((0, -0.012, -0.09)), KP + Vector((0, 0.012, 0.12)), r=0.036, n=8, mt='Metal')
  tube(F, KP, KP + Vector((0.10 * s, 0, 0.016)), r=0.024, n=8, mt='Metal', ends=(True, False))
  tube(F, KP + Vector((0, 0, -0.05)), (0.264 * s, -0.55, 0.25), r=0.015, mt='Metal')     # radius rods: boss to the rails
  tube(F, KP + Vector((0, 0, 0.07)), (0.18 * s, -1.22, 0.545), r=0.015, mt='Metal')
  tube(F, (0.42 * s, YT, 0.42), KP + Vector((0, -0.01, 0.10)), r=0.012)                # torsion arm into the boss top
  shock((0.47 * s, YF, 0.352), (0.21 * s, -0.98, 0.575))                               # axle up to the upper rail
  zc = 0.39 if s > 0 else 0.425                     # rear axle height this side (the stagger)
  BC = Vector((0.495 * s, YR, zc))                  # birdcage round the axle, inboard of the wheel
  tube(F, BC - Vector((0.055 * s, 0, 0)), BC + Vector((0.055 * s, 0, 0)), r=0.07, n=8, mt='Metal')
  tube(F, BC + Vector((0, 0, -0.04)), (0.296 * s, 0.60, 0.246), r=0.015, mt='Metal')     # four-bar: lower rod to the rail,
  tube(F, BC + Vector((0, 0, 0.05)), (0.273 * s, 0.70, 0.555), r=0.015, mt='Metal')      # upper rod to the hoop stay
  tube(F, (0.40 * s, YR - 0.20, 0.42), BC + Vector((0, -0.03, 0.04)), r=0.012)         # torsion arm into the cage
  shock(BC + Vector((0, 0, 0.088)), (0.276 * s, 0.62, 0.613))                          # cage top up to the hoop stay
# rear axle (between the birdcages; tilts a touch with the stagger)
tube(F, (0.55, YR, 0.390), (-0.56, YR, 0.425), r=0.04, mt='Metal')
# headers: four pipes each side out of the engine bay, up and back along the body
for s in (1, -1):
  for k in range(4):
    y0 = -1.09 + 0.11 * k; dz = 0.02 * k                 # out of the engine's sides
    path(F, [(0.18 * s, y0, 0.42), (0.36 * s, y0 + 0.04, 0.40 - dz), (0.40 * s, y0 + 0.30, 0.36 - dz),
             (0.38 * s, 0.30 - 0.03 * k, 0.33 - dz * 0.5)], r=0.022, n=6, mt='Metal', open_end=True)
# steering wheel column (the wheel itself is its own object, below)
COLB, SW, SWR = Vector((0, -0.76, 0.55)), Vector((0, -0.02, 0.83)), 0.165   # column foot (engine top), wheel centre, 13" wheel
SAX = (SW - COLB).normalized()                      # steering axis (points at the driver)
tube(F, COLB, SW - SAX * 0.09, r=0.013, n=6, mt='Metal')
F.finish('Frame', angle=65)        # 65: six-sided tubes shade round, bends stay crisp

# engine block under the hood (the headers bolt to its sides, the column runs to its top)
E = Mesh()
def box(m, x0, x1, y0, y1, z0, z1, mt):
  v = [Vector((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
  for f in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
    m.face([v[i] for i in f], mt)
box(E, -0.17, 0.17, -1.15, -0.73, 0.28, 0.55, 'Black')              # ends at the motor plate, ahead of the driver's feet
E.finish('Engine')

# steering wheel (its own object, pivot at the centre: the game turns it about steer_axis)
S = Mesh(); u, v = frame(SAX)                       # u = car's left, v = down the wheel
NR, NT, GR = 18, 6, 0.016                          # padded grip: one smooth torus, 18 x 6
rings = []
for k in range(NR):
  th = 2 * math.pi * k / NR; dr = u * math.cos(th) + v * math.sin(th)
  rings.append([SW + dr * (SWR + GR * math.cos(2 * math.pi * j / NT)) + SAX * GR * math.sin(2 * math.pi * j / NT)
                for j in range(NT)])
for k in range(NR):
  A, B = rings[k], rings[(k + 1) % NR]
  for j in range(NT):
    jj = (j + 1) % NT; S.face([A[j], B[j], B[jj], A[jj]], 'Black')
HUB = SW - SAX * 0.035                              # dished: the spokes run forward to the hub
for th in (0, math.pi, math.pi / 2):                # flat aluminium spokes at 9, 3 and 6 o'clock
  d = u * math.cos(th) + v * math.sin(th); sd = SAX.cross(d)        # sd = across the spoke, in the wheel's plane
  p0, p1 = HUB + d * 0.03, SW + d * (SWR - 0.008)
  q = [p0 + sd * 0.014, p1 + sd * 0.014, p1 - sd * 0.014, p0 - sd * 0.014]
  top = [x + SAX * 0.004 for x in q]; bot = [x - SAX * 0.004 for x in q]
  S.face(top, 'Metal'); S.face(bot[::-1], 'Metal')
  for i in range(4): S.face([bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]], 'Metal')
tube(S, HUB - SAX * 0.02, HUB + SAX * 0.015, r=0.034, n=8, mt='Metal')                     # hub
tube(S, HUB - SAX * 0.055, HUB - SAX * 0.02, r=0.022, n=8, mt='Black')                     # quick release
cap = [HUB + SAX * 0.015 + (u * math.cos(2 * math.pi * k / 8) + v * math.sin(2 * math.pi * k / 8)) * 0.034 for k in range(8)]
S.face(cap, 'Black')                                # centre cap, facing the driver
sw_o = S.finish('SteeringWheel', angle=65, origin=SW); sw_o['steer_axis'] = list(SAX)

# ---------- body: hood, side panels, belly, tail tank ----------
B = Mesh()
def sec(w, zb, zt, r, n=3):                         # cross-section with round top corners, anticlockwise seen from the nose
  arc = [math.pi / 2 * i / n for i in range(n + 1)]
  return ([(w, zb)] + [(w - r + r * math.cos(a), zt - r + r * math.sin(a)) for a in arc] +
          [(-w + r - r * math.sin(a), zt - r + r * math.cos(a)) for a in arc] + [(-w, zb)])
loft(B, [(-1.36, sec(0.12, 0.34, 0.56, 0.10, 4)), (-1.26, sec(0.19, 0.30, 0.66, 0.16, 4)), (-1.10, sec(0.24, 0.27, 0.75, 0.20, 4)),
         (-0.88, sec(0.28, 0.25, 0.83, 0.24, 4)), (-0.60, sec(0.30, 0.24, 0.89, 0.26, 4)), (-0.30, sec(0.31, 0.24, 0.93, 0.26, 4))],
     'Livery', cap0='Black')                          # round nose cone, the radiator opening black
# cockpit side panels: flat plates from the cowl back to the tank, the top edge dipping round the driver's arms
cock = [(-0.30, 0.24), (-0.30, 0.93), (-0.12, 0.84), (0.02, 0.74), (0.28, 0.72), (0.50, 1.05), (0.62, 1.05), (0.62, 0.24)]
slab_x(B, cock, 0.300, 0.312, 'Livery'); slab_x(B, cock, -0.312, -0.300, 'Livery')
B.face([(0.29, -1.10, 0.235), (-0.29, -1.10, 0.235), (-0.29, 0.62, 0.235), (0.29, 0.62, 0.235)], 'Black')   # belly pan
# tail tank: tall, behind the seat, the top rolling down to the back
loft(B, [(0.62, sec(0.31, 0.30, 1.02, 0.26, 4)), (0.85, sec(0.31, 0.31, 1.02, 0.27, 4)), (1.05, sec(0.30, 0.33, 0.98, 0.27, 4)),
         (1.22, sec(0.27, 0.36, 0.90, 0.24, 4)), (1.36, sec(0.21, 0.40, 0.78, 0.19, 4)), (1.46, sec(0.13, 0.45, 0.64, 0.11, 4))],
     'Livery', cap0='Livery', cap1='Livery')
B.finish('Body')

# ---------- wings ----------
def wing(m, LE, chord, half, aoa, sag, board, bth, ts=(0, 0.04, 0.1, 0.2, 0.32, 0.45, 0.6, 0.75, 0.88, 1)):
  """cupped panel (a downforce wing: it sags below the chord line, deepest ~40% back) between two side boards;
  board = outline in the wing's own (along chord, up from chord) metres"""
  a = math.radians(aoa); d = Vector((0, math.cos(a), math.sin(a))); n = Vector((0, -math.sin(a), math.cos(a)))
  L = lambda s, h: Vector(LE) + d * s + n * h
  cr = lambda t: -sag * math.sin(math.pi * min(1.0, max(0.0, t)) ** 0.62)   # deepest ~30% back: the leading edge curls down
  top = [L(chord * t, cr(t) + 0.012) for t in ts]; bot = [L(chord * t, cr(t)) for t in ts]
  X = lambda p, x: Vector((x, p.y, p.z))
  for P, flip in ((top, False), (bot, True)):
    for i in range(len(ts) - 1):
      f = [X(P[i], half), X(P[i + 1], half), X(P[i + 1], -half), X(P[i], -half)]
      m.face(f[::-1] if flip else f, 'Livery')
  for x, flip in ((half, False), (-half, True)):
    f = [X(p, x) for p in top] + [X(p, x) for p in reversed(bot)]; m.face(f if flip else f[::-1], 'Livery')
  m.face([X(top[-1], -half), X(bot[-1], -half), X(bot[-1], half), X(top[-1], half)], 'Livery')
  m.face([X(top[0], half), X(bot[0], half), X(bot[0], -half), X(top[0], -half)], 'Livery')
  bw = [(p.y, p.z) for p in (L(s, h) for s, h in board)]
  slab_x(m, bw, half, half + bth, 'Livery'); slab_x(m, bw, -half - bth, -half, 'Livery')
  def under(y, x_r=0.0):
    """height of the panel's underside at side-view position y (lowest within +-x_r of it)"""
    zs = []
    for yy in (y - x_r, y, y + x_r):
      t = (yy - LE[1]) / (chord * math.cos(a))
      for _ in range(6): p = L(chord * t, cr(t)); t += (yy - p.y) / (chord * math.cos(a))
      zs.append(L(chord * t, cr(t)).z)
    return min(zs)
  return L, cr, d, under

def to_wing(LE, aoa, pts_yz):
  """a board drawn in side view (y, z) -> the wing's own (along chord, up from chord) metres"""
  a = math.radians(aoa)
  return [((y - LE[1]) * math.cos(a) + (z - LE[2]) * math.sin(a), -(y - LE[1]) * math.sin(a) + (z - LE[2]) * math.cos(a))
          for y, z in pts_yz]

Wg = Mesh()
CH, HALF = 1.52, 0.84                               # 5' chord; a little wider than the rule 5', out over the rear tyres
TLE = (0, -0.15, 1.15 + WDZ)                        # leading edge: high enough over the cage roof for the slider
# 72" side board, drawn in side view: upright front and back edges, hanging under the panel, ~1.98 m at the back
_te = (TLE[1] + CH * math.cos(math.radians(WING_DEG)), TLE[2] + CH * math.sin(math.radians(WING_DEG)))
TB = to_wing(TLE, WING_DEG, [(-0.27, TLE[2] - 0.32), (-0.27, TLE[2] + 0.22), (_te[0] + 0.10, _te[1] + 0.50),
                             (_te[0] + 0.10, _te[1] - 0.30)])      # near-rectangular: tall at the front too
L, cr, TD, under = wing(Wg, TLE, CH, HALF, WING_DEG, 0.11, TB, 0.012)
btop = TB[1:3]
for s in (1, -1):                                   # stays: board's top edge down to the panel
  for sc in (0.45, 0.9, 1.35):
    (s0, h0), (s1, h1) = next((p, q) for p, q in zip(btop, btop[1:]) if p[0] <= sc - 0.1 <= q[0])
    hb = h0 + (h1 - h0) * (sc - 0.1 - s0) / (s1 - s0) - 0.05
    p0, p1 = L(sc - 0.1, hb), L(sc, cr(sc / CH) + 0.012)
    tube(Wg, (HALF * s, p0.y, p0.z), (0.32 * s, p1.y, p1.z), r=0.006, n=4, mt='Black')
_a = math.radians(WING_DEG)
# pivot at the leading edge: the game slides it along TD and across x
wt = Wg.finish('Wing_Top', origin=TLE)
wt.location = Vector(TLE) + TD * WING_SLIDE + Vector((WING_LEFT, 0, 0))
wt['slide_axis'] = list(TD); wt['slide_range'] = [-0.15, 0.15]; wt['offset_range'] = [0.0, 0.15]

# struts, as on the real cars: four from the cage corners straight up to the wing's underside, and two thin braces
# crossing between them. Their top ends carry the 'wing_follow' attribute (1): when the game slides / offsets the wing
# it moves those vertices with it, so the struts lean a little instead of coming apart.
Ps = Mesh(); TOPS = []
def strut(foot, y_top, x_top, r, mt):
  """foot on the cage, top cut flush along the panel's underside (its slope there), 2 mm under it"""
  z0, z1 = under(y_top - 0.02), under(y_top + 0.02)
  nn = Vector((0, -(z1 - z0), 0.04)).normalized()   # the underside's normal at y_top (side view)
  if r > 0.012:                                     # main strut: flush cut
    top = Vector((x_top, y_top, under(y_top))) - nn * 0.002
    tube(Ps, foot, top, r=r, n=8, mt=mt, end_plane=(top, nn))
  else:                                             # thin brace: meets the panel at a shallow angle, stops just under it
    top = Vector((x_top, y_top, under(y_top, 0.02) - 0.006)); tube(Ps, foot, top, r=r, n=4, mt=mt)
  TOPS.append((top, r))
for s in (1, -1):
  strut((0.22 * s, -0.12, ROOF_F), -0.02, 0.21 * s, 0.020, 'Metal')                   # front: front hoop corners
  strut((0.24 * s, 0.44, ROOF_R), 0.56, 0.23 * s, 0.020, 'Metal')                     # rear: rear hoop corners
  strut((0.24 * s, 0.44, ROOF_R), 0.44, -0.24 * s, 0.007, 'Black')                    # thin braces: an X across the rear hoop, up to the wing over the other foot
Ps.finish('WingPosts', angle=65)
wp = bpy.data.objects['WingPosts']
att = wp.data.attributes.new('wing_follow', 'FLOAT', 'POINT')
for v in wp.data.vertices:
  att.data[v.index].value = 1.0 if any((v.co - t).length < r * 2.5 for t, r in TOPS) else 0.0
MOUNT = []

N = Mesh()
NLE, NCH, NDEG = (0, -1.62, 0.84), 0.78, 16
NB = to_wing(NLE, NDEG, [(-1.66, 0.70), (-1.66, 1.02), (-0.82, 1.30), (-0.82, 0.92)])   # tall, near-rectangular boards
Ln, _, _, nunder = wing(N, NLE, NCH, 0.52, NDEG, 0.05, NB, 0.010, ts=(0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 1))
NP = Mesh()                                         # mounts (fixed to the frame; the wing offsets over them)
for s in (1, -1):
  for sc, foot in ((0.12, (0.14 * s, -1.45, 0.52)), (0.50, (0.20 * s, -1.10, 0.56))):
    y = Ln(sc, 0).y; tube(NP, (0.14 * s, y, nunder(y, 0.03) - 0.015), foot, r=0.014, mt='Metal')
NP.finish('NosePosts', angle=65)
wn = N.finish('Wing_Nose', origin=NLE); wn.location = Vector(NLE) + Vector((NOSE_LEFT, 0, 0))
wn['offset_range'] = [0.0, 0.10]

# ---------- preview-only bits (not exported). The driver: tools/cars/driverfit.py seats the game's racer ----------
RC = 'SprintCar_ref'
rc = bpy.data.collections.get(RC) or bpy.data.collections.new(RC)
if RC not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(rc)
for n in ('RefHelmet', 'RefTorso'):
  if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
M['Livery'].diffuse_color = (0.95, 0.38, 0.05, 1)  # viewport-only test colour (orange, like the #18 car)

# ---------- check: every tube end is attached to something ----------
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line
dg = bpy.context.evaluated_depsgraph_get()
solids = [bpy.data.objects[n] for n in ('Body', 'Engine', 'Wing_Top', 'Wing_Nose', 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR')]
bvh = [(BVHTree.FromObject(o, dg), o.matrix_world.inverted(), o.name) for o in solids]
def seg_dist(p, a, b):
  q, t = intersect_point_line(p, a, b); t = max(0.0, min(1.0, t)); return (p - (a + (b - a) * t)).length
LOOSE = []
for t in TUBES:
  owner = getattr(t['m'], 'name', '')
  if owner not in ('Frame', 'WingPosts', 'NosePosts', 'SteeringWheel'): continue
  for end, p in zip(t['ends'], (t['a'], t['b'])):
    if not end: continue
    gap = min((seg_dist(p, u['a'], u['b']) - t['r'] - u['r'] for u in TUBES if u['g'] != t['g']), default=9)
    for tr, inv, nm in bvh:
      hit = tr.find_nearest(inv @ p)
      if hit[0] is not None: gap = min(gap, hit[3] - t['r'] - 0.01)   # (posts stop just under the wings)
    if gap > 0.012: LOOSE.append({'in': owner, 'end': [round(c, 3) for c in p], 'gap_m': round(gap, 3)})

# ---------- report ----------
objs = list(c.objects)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
result = {'objects': {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs}, 'tris': tris, 'loose': LOOSE, 'wing_mount': MOUNT}
if '--' in sys.argv and bpy.app.background:
  bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index('--') + 1])
print(result)
