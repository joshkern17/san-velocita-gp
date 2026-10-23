# Eevee preview renders of the sprint car: test livery colour, dirt ground, sun + studio reflections (for the chrome).
#   After sprintcar.py, in the open Blender: exec(open('tools/cars/sprintpreview.py').read()) with OUT_DIR set.
# Preview only: the ground / sun / world live in 'SprintCar_ref' and the scene world; the car's materials are reset to
# the game's values by the next sprintcar.py run.
import bpy, math, glob
from mathutils import Vector

OUT = globals().get('OUT_DIR', '/tmp/')
SHOTS = globals().get('SHOTS_WANTED') or ['hero_front', 'hero_rear', 'hero_side', 'wheel_rr', 'wheel_fl']
# name: (target, azimuth deg from the nose (+ = car's left), elevation, lens mm, distance m)
VIEWS = {'hero_front': ((0, 0.05, 0.85), -38, 22, 85, 12.0), 'hero_rear': ((0, 0.05, 0.85), -145, 18, 85, 12.0),
         'hero_side': ((0, 0.0, 1.0), -90, 5, 85, 15.0), 'hero_left': ((0, 0.0, 1.0), 90, 5, 85, 15.0),
         'wheel_rr': ((-0.8, 1.07, 0.42), -110, 10, 85, 3.2), 'wheel_fl': ((0.70, -1.07, 0.32), 70, 10, 85, 2.6),
         'top': ((0, 0.0, 0.8), 0, 89, 85, 15.0)}

sc = bpy.context.scene
rc = bpy.data.collections.get('SprintCar_ref')
liv = bpy.data.materials['Livery']
liv.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.95, 0.30, 0.03, 1)
if 'RefGround' not in bpy.data.objects:
  me = bpy.data.meshes.new('RefGround'); me.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
  gm = bpy.data.materials.get('RefDirt') or bpy.data.materials.new('RefDirt'); gm.use_nodes = True
  gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.20, 0.13, 0.08, 1)
  gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
  me.materials.append(gm); rc.objects.link(bpy.data.objects.new('RefGround', me))
sun = bpy.data.objects.get('RefSun')
if not sun:
  sun = bpy.data.objects.new('RefSun', bpy.data.lights.new('RefSun', 'SUN')); rc.objects.link(sun)
sun.data.energy = 3.5; sun.data.angle = math.radians(3); sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
for n in ('Light',):
  if bpy.data.objects.get(n): bpy.data.objects[n].hide_render = True
# world: Blender's studio HDRI (reflections for the chrome), seen dimmed as the backdrop
w = bpy.data.worlds.get('RefWorld') or bpy.data.worlds.new('RefWorld'); w.use_nodes = True; sc.world = w
nt = w.node_tree; bg = nt.nodes.get('Background')
env = nt.nodes.get('Env') or nt.nodes.new('ShaderNodeTexEnvironment'); env.name = 'Env'
hdr = (glob.glob('/Applications/Blender.app/Contents/Resources/*/datafiles/studiolights/world/courtyard.exr') or [None])[0]
if hdr: env.image = bpy.data.images.load(hdr, check_existing=True); nt.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
# the camera sees a plain sky; everything else (reflections, light) sees the HDRI
sky = nt.nodes.get('Sky') or nt.nodes.new('ShaderNodeBackground'); sky.name = 'Sky'
sky.inputs['Color'].default_value = (0.55, 0.62, 0.75, 1); sky.inputs['Strength'].default_value = 0.9
lp = nt.nodes.get('LP') or nt.nodes.new('ShaderNodeLightPath'); lp.name = 'LP'
mix = nt.nodes.get('Mix') or nt.nodes.new('ShaderNodeMixShader'); mix.name = 'Mix'
nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs[0]); nt.links.new(bg.outputs[0], mix.inputs[1])
nt.links.new(sky.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], nt.nodes['World Output'].inputs['Surface'])
sc.render.engine = 'BLENDER_EEVEE'; sc.view_settings.view_transform = 'AgX'
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
cam = bpy.data.objects.get('ShotCam')
if not cam: cam = bpy.data.objects.new('ShotCam', bpy.data.cameras.new('ShotCam')); sc.collection.objects.link(cam)
sc.camera = cam
for name in SHOTS:
  T, az, el, lens, d = VIEWS[name]; T = Vector(T); cam.data.lens = lens
  a, e = math.radians(az), math.radians(el)
  cam.location = T + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d
  cam.rotation_euler = (T - cam.location).to_track_quat('-Z', 'Y').to_euler()
  sc.render.filepath = OUT + name + '.png'; bpy.ops.render.render(write_still=True)
result = {'shots': SHOTS}
