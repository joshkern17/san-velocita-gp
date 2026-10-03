# Contact sheet of the rigged NPCs: blender -b <npcs.blend> --python tools/characters/render.py -- <outdir> clip:frame,... [look]
import bpy, sys, os, math
argv = sys.argv[sys.argv.index('--') + 1:]
OUT, SHOTS = argv[0], argv[1].split(',')
LOOK = argv[2] if len(argv) > 2 else None
sc = bpy.context.scene
rig = bpy.data.objects['Character']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes: o.hide_render = bool(LOOK) and o.name != LOOK
if not LOOK:  # line the looks up side by side
    for i, o in enumerate(meshes): pass
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x, sc.render.resolution_y = 360, 480
sc.world = sc.world or bpy.data.worlds.new('W')
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.4
d = math.radians(35)
cam.location = (3.5 * math.sin(d), -3.5 * math.cos(d), 1.0); cam.rotation_euler = (math.radians(90), 0, d)
for sh in SHOTS:
    clip, fr = sh.split(':')
    rig.animation_data_create()
    for t in rig.animation_data.nla_tracks: t.mute = True
    if clip == 'rest':
        rig.animation_data.action = None
        for t in rig.animation_data.nla_tracks: t.mute = True
    else:
        rig.animation_data.nla_tracks[clip].mute = False
    sc.frame_set(int(fr))
    sc.render.filepath = os.path.join(OUT, f'{clip}_{fr}.png')
    bpy.ops.render.render(write_still=True)
