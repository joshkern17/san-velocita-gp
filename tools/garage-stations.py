# Builds models/garage/stations-start.blend: the facilities' stations for the home garage (World Career), see
# docs/GARAGE-KIT.md. Run:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-stations.py               (the .blend)
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-stations.py -- --export   (+ the GLBs)
# Re-running overwrites stations-start.blend: Save As your own copy to edit, then export from inside Blender (Text
# Editor > export_kit > Run Script). station_tools and station_sim stay in kit-start.blend (tools/garage-kit.py).
#
#   station_dyno     Engine dyno: an engine on a test bed, the water brake, a chain-link screen, the control desk
#   station_fab      Fabrication bay: a welding table with a frame on it, the welder, a weld screen, tube and sheet
#   station_data     Data room: three desks at the mezzanine's rail, CRTs, the printer, the whiteboard
#   station_tools2   Lift and engine hoist (Tools, level 2): a two-post lift and an engine crane, for the third bay
#
# Each is built round its own origin: on the floor at the middle of its back (against the wall), its front (where you
# stand to use it) down -Y, as kit-start's are; the shell's SLOT_<key> places it (models/garage/src/... packs keep
# their own textures; what's built here is the PSX Industrial textures with grime baked in, tools/garagelib.py). The
# printed bits (signs, notes, screens, the whiteboard) are drawn by tools/garage-signs.py.
import bpy, math, os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'models', 'garage', 'src')
OUT = os.path.join(ROOT, 'models', 'garage')
ST = os.path.join(SRC, 'stations')
ART = os.path.join(SRC, 'stations_gen', 'art')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
import garagelib as G
from garagelib import *
G.configure(os.path.join(SRC, 'stations_gen'), seed=2205)
D90 = math.pi / 2
if not os.path.exists(os.path.join(ART, 'whiteboard.png')) or '--art' in args:
    subprocess.run(['python3', os.path.join(ROOT, 'tools', 'garage-signs.py')], check=True)
A = lambda n: os.path.join(ART, n + '.png')
S_ = lambda n: os.path.join(ST, n)

# ---- materials: built things get grime ----
steel = grimy_tile('St_Steel', 'dark_industrial_metal.png', dirt=0.4, rust=0.5)
blue = grimy_tile('St_Blue', 'painted_metal.png', dirt=0.45, rust=0.3, wear_light=0.2)
red = grimy_tile('St_Red', 'painted_metal.png', dirt=0.45, rust=0.25, wear_light=0.25, tint=(0.62, 0.1, 0.08))
yellow = grimy_tile('St_Yellow', 'painted_metal.png', dirt=0.5, rust=0.3, wear_light=0.25, tint=(0.78, 0.6, 0.08))
green = grimy_tile('St_GasGreen', 'painted_metal.png', dirt=0.4, rust=0.2, tint=(0.18, 0.3, 0.2))
grey = grimy_tile('St_Grey', 'painted_metal.png', dirt=0.45, rust=0.15, tint=(0.42, 0.43, 0.42))
cast = grimy_tile('St_Cast', 'scratched_metal.png', dirt=0.55, rust=0.35, tint=(0.36, 0.35, 0.33))
alloy = grimy_tile('St_Alloy', 'galvanized_metal.png', dirt=0.35, rust=0.0)
plate = grimy_tile('St_Plate', 'metal_plate_01.png', dirt=0.55, rust=0.3)
rubber = grimy_tile('St_Rubber', 'rubber.png', dirt=0.25)
hazard = grimy_tile('St_Hazard', 'hazard_stripes_01.png', dirt=0.5, wear_light=0.3)
wood = grimy_tile('St_Ply', 'wood.png', dirt=0.5)
brass = grimy_tile('St_Brass', 'cooper.png', dirt=0.35, tint=(0.62, 0.5, 0.2))
oilpan = grimy_tile('St_Oily', 'oil_stained_asphalt.png', dirt=0.6, rust=0.2)
board_white = mat_img('St_BoardFrame', None, 0.6); board_white.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.56, 0.57, 1)
curtain = bpy.data.materials.new('St_WeldCurtain')
cp = curtain.node_tree.nodes['Principled BSDF']; cp.inputs['Base Color'].default_value = (0.95, 0.38, 0.05, 1); cp.inputs['Alpha'].default_value = 0.72
cp.inputs['Emission Color'].default_value = (0.9, 0.3, 0.03, 1); cp.inputs['Emission Strength'].default_value = 0.25
curtain.surface_render_method = 'BLENDED'
glow = lambda n, png, k=1.6: art_mat(n, A(png), dirt=0.05, emit=k, rough=0.3)
sign = lambda n, png: art_mat(n, A(png), dirt=0.5)

# ---- props from the packs (their own textures) ----
PIT = os.path.join(ROOT, 'models', 'pitprops.glb')
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=PIT)
for o in [o for o in bpy.data.objects if o not in before]:
    if o.type == 'MESH': o.rotation_mode = 'XYZ'; link(o, lib_collection()); o.hide_set(True); LIB[o.name] = o; o.name = 'LIB_' + o.name
    else: bpy.data.objects.remove(o, do_unlink=True)
IND = os.path.join(SRC, 'psx_industrial_pack.glb')
lib('crtmon', S_('CrtMonitor.glb'), height=0.4); lib('pc', S_('computer.glb'), height=0.42); lib('kbd', S_('keyboard.glb'), scale=0.9)
lib('mouse', S_('mouse.glb'), scale=0.8); lib('floppy', S_('floppy35.glb')); lib('speaker', S_('speaker.glb'), height=0.18)
lib('desk_a', S_('desk1_weathered.glb'), scale=0.8); lib('desk_b', S_('desk2.glb'), scale=0.8); lib('desk_c', S_('desk1_alt2_weathered.glb'), scale=0.72)
lib('chair_k', S_('office_chair_black.glb'), height=0.95); lib('chair_g', S_('office_chair_grey.glb'), height=0.95); lib('chair_b', S_('office_chair_blue.glb'), height=0.95)
lib('phone', S_('desk_phone_with_cable.glb'), scale=0.55); lib('lamp', S_('square_desklamp.glb'), scale=0.9); lib('mug', S_('mug_alt.glb'), height=0.1)
lib('binder', S_('file_binder.glb'), scale=0.8); lib('binder2', S_('file_binder_alt.glb'), scale=0.8); lib('bookcase', S_('book_case_with_back_Small.glb'), height=1.9)
lib('cab_low', S_('file_cabinet_larger.glb'), scale=0.72); lib('cab_tall', S_('file_cabinet_small.glb'), height=1.3)
lib('papers', S_('paper_stack_large.glb'), scale=0.7); lib('sheet', S_('paper_single_sheet.glb'), scale=0.7)
lib('win95', S_('psx_win95_pc._90s/scene.gltf'), ('Old_PC_crt', 'Old_PC_WinBox', 'Old_PC_Keyboard', 'Old_PC_Mouse'), height=0.42)
lib('fence', S_('psx_style_chain_fence/scene.gltf'), ('Object_4', 'Object_5'), height=1.75)
lib('ashtray', S_('psx_style_smoking_pack/scene.gltf'), ('Cube', 'Cigarette'), height=0.06)
lib('cig_box', S_('psx_style_smoking_pack/scene.gltf'), 'Cigarette Box', height=0.09)
lib('can', S_('trash_and_debris/scene.gltf'), 'Can_2_Cans', height=0.12); lib('can_crushed', S_('trash_and_debris/scene.gltf'), 'Can_3_Crushed', height=0.1)
lib('scrap', S_('trash_and_debris/scene.gltf'), 'Sheet_Metal_1', scale=0.5); lib('rebar', S_('trash_and_debris/scene.gltf'), 'Rebar', scale=0.45)
lib('coffee_cup', S_('trash_and_debris/scene.gltf'), 'Coffee_Cup_WithLid', height=0.13)
lib('drum_blue', os.path.join(SRC, 'unit', 'psx_barrels_pack.glb'), 'Blue Plastic Drum', height=0.95)
lib('trashcan', IND, 'TrashCan_M'); lib('jerrycan', IND, 'Jerrycan_M', height=0.45); lib('tire', IND, 'Tire_M', scale=0.85); lib('propane', IND, 'PropaneTankSmall_M')
lib('crate_wood', IND, 'CrateWood_M'); lib('pallet', IND, 'Pallet_M')

kit = collection('KIT (each collection is one .glb)')
stations = collection('STATIONS', kit)


def station(name, x):
    c = collection(name, stations); c.instance_offset = (x, 0.0, 0.0); return c, Vector((x, 0.0, 0.0))


def in_use(coll, key, starts, idle=False):
    # what shows only while the station's in use (BUSY_<key>..., a project on it), or only while it isn't (IDLE_<key>...)
    for ob in list(coll.objects):
        if ob.name.startswith(starts): ob.name = f"{'IDLE' if idle else 'BUSY'}_{key}_{ob.name}"


off_screen = art_mat('St_ScreenOff', A('screen_dyno'), dirt=0.0); off_screen.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.03, 0.03, 1)
for n_ in [n for n in off_screen.node_tree.nodes if n.type == 'TEX_IMAGE']: off_screen.node_tree.nodes.remove(n_)   # (a screen that's off: dark glass)


def guide_wall(c, o, w, h=3.0):   # (a wall behind it to see it against: GUIDE_, left out of the game)
    gm = bpy.data.materials.get('GUIDE') or mat_img('GUIDE', None, 0.9)
    g = box('GUIDE_Wall_' + c.name, c, (w, 0.1, h), o + Vector((0, 0.05, h / 2)), gm); g.display_type = 'WIRE'; g.hide_render = True


# ======================================================================================================================
# Engine dyno (left wall by the door in the unit): x along the wall -1.75..1.75, out to y -3.4
dy, o = station('station_dyno', 0.0)
P = lambda x, y, z=0.0: o + Vector((x, y, z))
guide_wall(dy, o, 3.6)
# the test bed: two steel rails on pads, cross members, engine mounts
for y in (-1.0, -1.6):
    box(f'Dyno_Rail_{y:+.1f}', dy, (2.3, 0.12, 0.14), P(-0.3, y, 0.12), steel)
for x in (-1.35, -0.3, 0.75):
    box(f'Dyno_Cross_{x:+.2f}', dy, (0.1, 0.72, 0.1), P(x, -1.3, 0.1), steel)
    for y in (-1.0, -1.6): box(f'Dyno_Pad_{x:+.2f}_{y:+.1f}', dy, (0.2, 0.2, 0.05), P(x, y, 0.025), steel)
box('Dyno_DripTray', dy, (1.15, 0.8, 0.04), P(-0.7, -1.3, 0.02), oilpan)
for x in (-1.05, -0.45):
    for y in (-1.08, -1.52): box(f'Dyno_Mount_{x:+.2f}_{y:+.2f}', dy, (0.08, 0.08, 0.16), P(x, y, 0.27), rubber)
# the engine: an inline four, block and sump, red crinkle cam cover, intake on the wall side, headers on the room side
box('Engine_Sump', dy, (0.62, 0.34, 0.14), P(-0.75, -1.3, 0.42), cast)
box('Engine_Block', dy, (0.7, 0.42, 0.4), P(-0.75, -1.3, 0.69), cast)
box('Engine_Head', dy, (0.68, 0.36, 0.13), P(-0.75, -1.3, 0.955), alloy)
box('Engine_CamCover', dy, (0.64, 0.26, 0.09), P(-0.75, -1.3, 1.065), red)
cyl('Engine_OilCap', dy, 0.035, 0.04, P(-0.95, -1.25, 1.13), steel)
for i in range(4):
    x = -1.0 + i * 0.165
    rod(f'Engine_Runner_{i}', dy, P(x, -1.1, 0.95), P(x, -0.82, 1.08), 0.03, alloy)
    hose(f'Engine_Header_{i}', dy, [P(x, -1.5, 0.9), P(x, -1.66, 0.86), P(-0.75 + (x + 0.75) * 0.35, -1.78, 0.62)], 0.022, steel, 6)
box('Engine_Plenum', dy, (0.66, 0.14, 0.12), P(-0.75, -0.76, 1.1), alloy)
cyl('Engine_Throttle', dy, 0.06, 0.1, P(-0.38, -0.76, 1.1), steel, rot=(0, D90, 0))
cyl('Engine_Collector', dy, 0.05, 0.22, P(-0.75, -1.8, 0.55), steel)
for x, r in ((-1.16, 0.09), (-1.16, 0.05)):
    cyl(f'Engine_Pulley_{r}', dy, r, 0.04, P(x, -1.3, 0.55 if r > 0.06 else 0.85), steel, rot=(0, D90, 0))
cyl('Engine_Alternator', dy, 0.07, 0.14, P(-1.12, -1.52, 0.85), alloy, rot=(0, D90, 0))
cyl('Engine_Bellhousing', dy, 0.21, 0.18, P(-0.31, -1.3, 0.62), alloy, rot=(0, D90, 0))
rod('Dyno_Shaft', dy, P(-0.22, -1.3, 0.62), P(0.2, -1.3, 0.62), 0.04, steel)
box('Dyno_ShaftGuard', dy, (0.42, 0.24, 0.04), P(-0.01, -1.3, 0.76), yellow)
# the water brake: a blue drum on its stand, the load arm, water in and out from the barrel
box('Dyno_BrakeStand', dy, (0.42, 0.52, 0.32), P(0.42, -1.3, 0.3), steel)
cyl('Dyno_WaterBrake', dy, 0.3, 0.36, P(0.42, -1.3, 0.62), blue, rot=(0, D90, 0), verts=14)
box('Dyno_LoadArm', dy, (0.06, 0.4, 0.06), P(0.62, -1.5, 0.45), steel)
cyl('Dyno_LoadCell', dy, 0.03, 0.12, P(0.62, -1.72, 0.38), alloy)
put('drum_blue', dy, P(1.25, -0.45), 0.4)
hose('Dyno_WaterIn', dy, [P(0.42, -1.1, 0.4), P(0.5, -0.8, 0.12), P(1.0, -0.55, 0.06), P(1.25, -0.45, 0.95)], 0.025, rubber)
hose('Dyno_WaterOut', dy, [P(0.6, -1.15, 0.85), P(0.9, -0.8, 0.95), P(1.12, -0.5, 0.97)], 0.025, rubber)
# a radiator on a stand at the engine's front, hoses to it; the fuel can on a shelf by the wall, its line to the rail
box('Dyno_Rad', dy, (0.06, 0.55, 0.5), P(-1.55, -1.3, 0.75), steel)
box('Dyno_RadCore', dy, (0.03, 0.5, 0.44), P(-1.52, -1.3, 0.75), plate)
rod('Dyno_RadLegA', dy, P(-1.55, -1.1, 0.0), P(-1.55, -1.1, 0.5), 0.02, steel); rod('Dyno_RadLegB', dy, P(-1.55, -1.5, 0.0), P(-1.55, -1.5, 0.5), 0.02, steel)
hose('Dyno_RadHose', dy, [P(-1.5, -1.2, 0.9), P(-1.3, -1.2, 0.95), P(-1.12, -1.25, 0.9)], 0.03, rubber)
box('Dyno_FuelShelf', dy, (0.4, 0.3, 0.03), P(-1.4, -0.16, 1.1), steel)
put('jerrycan', dy, P(-1.4, -0.18, 1.115), 0.0)
hose('Dyno_FuelLine', dy, [P(-1.3, -0.25, 1.2), P(-1.15, -0.5, 1.0), P(-0.95, -0.8, 1.05)], 0.008, rubber, 6)
# the exhaust: a flexible duct from the collector up to a board fitted in the window, a fan in it
box('Dyno_WindowBoard', dy, (1.0, 0.03, 0.7), P(-0.35, -0.1, 2.9), wood)
cyl('Dyno_DuctCollar', dy, 0.16, 0.12, P(-0.35, -0.17, 2.85), steel, rot=(D90, 0, 0), verts=12)
hose('Dyno_Duct', dy, [P(-0.75, -1.85, 0.45), P(-0.78, -2.0, 0.85), P(-0.7, -1.7, 1.75), P(-0.45, -0.75, 2.5), P(-0.35, -0.25, 2.85)], 0.12, rubber, 10)
# the screen: a panel of chain-link between the bed and the room, the way in at its end
put('fence', dy, P(-0.4, -2.05), 0.0)
for x in (-1.75, 0.95): box(f'Dyno_FenceFoot_{x:+.2f}', dy, (0.3, 0.3, 0.04), P(x, -2.05, 0.02), steel)
card('Dyno_EarsSign', dy, 0.4, 0.3, P(0.3, -2.09, 1.1), sign('St_SignEars', 'sign_ears'))
card('Dyno_DangerSign', dy, 0.48, 0.36, P(1.35, -0.03, 1.6), sign('St_SignDyno', 'sign_dyno'))
# the extinguisher on the wall by the way in
cyl('Dyno_Extinguisher', dy, 0.075, 0.5, P(1.55, -0.12, 0.65), red); cyl('Dyno_ExtTop', dy, 0.03, 0.08, P(1.55, -0.12, 0.94), steel)
rod('Dyno_ExtHose', dy, P(1.6, -0.18, 0.92), P(1.62, -0.2, 0.55), 0.012, rubber, 6)
# the control desk outside the screen: gauges, the CRT with the power curve, keyboard, papers, Danny's note, a chair
put('desk_a', dy, P(-0.75, -2.62), math.pi)
TOP = 0.71
box('Dyno_GaugeBox', dy, (0.52, 0.3, 0.36), P(-1.3, -2.45, TOP + 0.18), grey)
card('Dyno_Gauges', dy, 0.48, 0.34, P(-1.3, -2.605, TOP + 0.01), glow('St_Gauges', 'panel_gauges', 0.6))
put('crtmon', dy, P(-0.62, -2.4, TOP), 0.0, name='DynoCRT')   # (the model's glass faces -Y)
card('Dyno_Screen', dy, 0.3, 0.23, P(-0.62, -2.57, TOP + 0.09), glow('St_ScreenDyno', 'screen_dyno'), tilt=-0.08)
put('kbd', dy, P(-0.6, -2.85, TOP), math.pi); put('mouse', dy, P(-0.3, -2.85, TOP), math.pi + 0.3)
put('papers', dy, P(-0.05, -2.7, TOP), 0.3); put('mug', dy, P(0.05, -2.9, TOP), 1.2)
card('Dyno_Note', dy, 0.09, 0.09, P(-0.48, -2.625, TOP + 0.33), sign('St_NoteDanny', 'note_danny'), rotz=0.05)
put('chair_k', dy, P(-0.65, -3.2), 0.15, name='DynoChair')
put('coffee_cup', dy, P(-1.65, -2.4, 0.0), 0.0)
hose('Dyno_Cable', dy, [P(-1.1, -2.3, 0.5), P(-1.0, -2.2, 0.03), P(-0.6, -1.95, 0.03), P(0.2, -1.95, 0.03), P(0.55, -1.75, 0.3)], 0.012, rubber, 6)
# a cage lamp over the engine, the CRT's glow
for k, dx in enumerate((-0.15, 0.15)): box(f'Dyno_LampChain_{k}', dy, (0.012, 0.012, 0.8), P(-0.6 + dx, -1.3, 2.75), steel)
box('Dyno_LampShade', dy, (0.5, 0.2, 0.08), P(-0.6, -1.3, 2.32), steel)
bulb_m = mat_img('St_Bulb', None, 0.5, emit=((1.0, 0.85, 0.6), 18.0)); box('Dyno_LampTube', dy, (0.44, 0.05, 0.03), P(-0.6, -1.3, 2.27), bulb_m)
spot('Light_Dyno', dy, P(-0.6, -1.3, 2.25), 320, (1.0, 0.86, 0.65), deg=110)
bulb('Light_DynoCRT', dy, P(-0.62, -2.9, 1.0), 25, (0.55, 1.0, 0.65))
in_use(dy, 'dyno', ('Engine_', 'Dyno_Mount', 'Dyno_Shaft_', 'Dyno_Shaft', 'Dyno_RadHose', 'Dyno_FuelLine', 'Dyno_Screen'))
card('IDLE_dyno_Screen', dy, 0.3, 0.23, P(-0.62, -2.57, TOP + 0.09), off_screen, tilt=-0.08)
put('box_b', dy, P(-0.8, -1.25, 0.2), 0.2, name='IDLE_dyno_Box'); put('toolbox', dy, P(-0.2, -1.05, 0.19), 1.5, name='IDLE_dyno_Toolbox')
put('box_a', dy, P(-1.1, -1.5, 0.2), -0.3, name='IDLE_dyno_Box2')
empty('STAND_dyno', dy, P(-0.65, -3.2), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='sit_desk', role='dyno')
empty('STAND_any', dy, P(0.55, -2.0), rotz=-D90 - 0.3, kind='SINGLE_ARROW', size=0.5, clip='kneel', role='any')
empty('STAND_dynobed', dy, P(-0.75, -2.0), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='kneel_point', role='mechanic')   # (at the engine: busy only)

# ======================================================================================================================
# Fabrication bay (left wall, behind the bench): x -1.75..1.75, out to y -3.4
fb, o = station('station_fab', 7.0)
P = lambda x, y, z=0.0: o + Vector((x, y, z))
guide_wall(fb, o, 3.6)
# the welding table: a thick steel top on box legs, burnt and spattered, a frame tacked up on it
box('Fab_TableTop', fb, (1.8, 0.95, 0.04), P(-0.3, -1.7, 0.86), plate)
for x in (-1.1, 0.5):
    for y in (-1.35, -2.05): box(f'Fab_TableLeg_{x:+.1f}_{y:+.2f}', fb, (0.08, 0.08, 0.84), P(x, y, 0.42), steel)
box('Fab_TableShelf', fb, (1.65, 0.8, 0.03), P(-0.3, -1.7, 0.2), steel)
T = 0.88
for i, (a, b) in enumerate((((-0.95, -1.4), (0.35, -1.4)), ((-0.95, -2.0), (0.35, -2.0)), ((-0.95, -1.4), (-0.95, -2.0)), ((0.35, -1.4), (0.35, -2.0)),
                            ((-0.3, -1.4), (-0.3, -2.0)), ((-0.95, -1.4), (-0.3, -2.0)), ((-0.3, -1.4), (0.35, -2.0)))):
    rod(f'Fab_Frame_{i}', fb, P(*a, T + 0.03), P(*b, T + 0.03), 0.02, alloy, 6)
for i, (a, b) in enumerate((((-0.95, -1.4), (-0.95, -1.4)), ((0.35, -2.0), (0.35, -2.0)), ((-0.3, -1.4), (-0.3, -1.4)))):
    rod(f'Fab_Upright_{i}', fb, P(*a, T + 0.03), P(*a, T + 0.45), 0.02, alloy, 6)
for i, (x, y) in enumerate(((-0.95, -1.7), (0.35, -1.7), (-0.6, -1.4))):
    box(f'Fab_Clamp_{i}', fb, (0.05, 0.14, 0.09), P(x, y, T + 0.05), red)
put('hammer', fb, P(0.45, -2.08, T), 1.4, tilt=(D90, 0)); put('tape', fb, P(-1.1, -1.95, T), 0.0)
box('Fab_Grinder', fb, (0.26, 0.07, 0.07), P(0.2, -2.12, T + 0.035), grey); cyl('Fab_GrinderDisc', fb, 0.06, 0.012, P(0.06, -2.12, T + 0.035), steel, rot=(0, D90, 0))
box('Fab_Helmet', fb, (0.24, 0.26, 0.22), P(-1.05, -1.5, T + 0.11), steel); box('Fab_HelmetLens', fb, (0.1, 0.01, 0.05), P(-1.05, -1.635, T + 0.13), board_white)
put('scrap', fb, P(-0.6, -1.7, 0.215), 0.4)
# the welder on its trolley, the gas bottle strapped on behind, torch lead to the table
box('Fab_TrolleyBase', fb, (0.45, 0.75, 0.05), P(0.95, -1.15, 0.15), steel)
for x, y in ((0.75, -0.85), (1.15, -0.85), (0.75, -1.45), (1.15, -1.45)): cyl(f'Fab_Wheel_{x}_{y}', fb, 0.07, 0.04, P(x, y, 0.07), rubber, rot=(0, D90, 0))
box('Fab_Welder', fb, (0.36, 0.55, 0.42), P(0.95, -1.25, 0.39), blue)
box('Fab_WelderPanel', fb, (0.3, 0.01, 0.16), P(0.95, -1.528, 0.47), grey)
for k, dx in enumerate((-0.08, 0.06)): cyl(f'Fab_Knob_{k}', fb, 0.025, 0.03, P(0.95 + dx, -1.54, 0.49), rubber, rot=(D90, 0, 0), verts=8)
cyl('Fab_Bottle', fb, 0.1, 1.05, P(0.95, -0.82, 0.68), green, verts=12); cyl('Fab_BottleValve', fb, 0.03, 0.12, P(0.95, -0.82, 1.26), brass)
box('Fab_Strap', fb, (0.24, 0.02, 0.04), P(0.95, -0.94, 0.9), steel)
card('Fab_GasNote', fb, 0.09, 0.09, P(1.07, -1.53, 0.52), sign('St_NoteGas', 'note_gas'), rotz=-0.06)
hose('Fab_TorchLead', fb, [P(0.85, -1.5, 0.45), P(0.7, -1.75, 0.12), P(0.55, -2.2, 0.03), P(0.6, -2.3, 0.6), P(0.5, -2.13, T + 0.02), P(0.1, -1.95, T + 0.02)], 0.015, rubber, 6)
# the weld screen: an orange curtain on a frame, shielding the bench next door
for y in (-0.35, -1.75):
    rod(f'Fab_ScreenPost_{y}', fb, P(-1.62, y, 0.0), P(-1.62, y, 1.85), 0.02, steel)
    box(f'Fab_ScreenFoot_{y}', fb, (0.5, 0.06, 0.04), P(-1.62, y, 0.02), steel)
rod('Fab_ScreenRail', fb, P(-1.62, -0.35, 1.85), P(-1.62, -1.75, 1.85), 0.015, steel)
card('Fab_Curtain', fb, 1.36, 1.65, P(-1.62, -1.05, 0.15), curtain, rotz=D90)
# tube and angle on wall brackets, sheet leant against the wall, offcuts in a bin
for x in (-1.0, 0.0, 1.0):
    for z in (1.25, 1.65): box(f'Fab_Bracket_{x:+.0f}_{z}', fb, (0.04, 0.3, 0.04), P(x, -0.15, z), steel)
for k, (z, y, r) in enumerate(((1.29, -0.08, 0.02), (1.29, -0.16, 0.025), (1.29, -0.24, 0.015), (1.69, -0.1, 0.022), (1.69, -0.2, 0.02))):
    rod(f'Fab_Stock_{k}', fb, P(-1.5, y, z + r), P(1.45, y, z + r), r, alloy if k % 2 else steel, 6)
for k, (x, t) in enumerate(((0.15, 0.12), (0.3, 0.16), (0.42, 0.2))):
    box(f'Fab_Sheet_{k}', fb, (0.9, 0.006, 1.2), P(x - 0.05, -0.12 - k * 0.03, 0.58), alloy, rot=(t, 0, 0))
put('trashcan', fb, P(1.45, -2.3), 0.3, name='Fab_OffcutBin')
for k in range(5):
    a = k * 1.3; rod(f'Fab_Offcut_{k}', fb, P(1.45 + 0.08 * math.cos(a), -2.3 + 0.08 * math.sin(a), 0.3), P(1.45 + 0.13 * math.cos(a + 0.4), -2.3 + 0.13 * math.sin(a + 0.4), 1.15 - k * 0.06), 0.015, steel, 6)
# the bench grinder on its pedestal, a pillar drill against the wall
cyl('Fab_GrinderPed', fb, 0.04, 0.85, P(1.45, -0.55, 0.425), grey); box('Fab_GrinderFoot', fb, (0.3, 0.3, 0.03), P(1.45, -0.55, 0.015), grey)
cyl('Fab_GrinderMotor', fb, 0.08, 0.2, P(1.45, -0.55, 0.92), blue, rot=(0, D90, 0))
for s in (-1, 1): cyl(f'Fab_GrinderWheel_{s}', fb, 0.09, 0.03, P(1.45 + s * 0.14, -0.55, 0.92), grey, rot=(0, D90, 0), verts=12)
box('Fab_DrillBase', fb, (0.36, 0.4, 0.06), P(0.45, -0.32, 0.03), grey); cyl('Fab_DrillColumn', fb, 0.04, 1.55, P(0.45, -0.22, 0.8), alloy)
box('Fab_DrillTable', fb, (0.28, 0.28, 0.03), P(0.45, -0.42, 0.75), grey); box('Fab_DrillHead', fb, (0.24, 0.42, 0.24), P(0.45, -0.35, 1.45), blue)
rod('Fab_DrillChuck', fb, P(0.45, -0.48, 1.33), P(0.45, -0.48, 1.22), 0.025, steel)
card('Fab_WeldSign', fb, 0.48, 0.36, P(-0.3, -0.03, 2.05), sign('St_SignWeld', 'sign_weld'))
in_use(fb, 'fab', ('Fab_Frame_', 'Fab_Upright_', 'Fab_Clamp_'))
in_use(fb, 'fab', ('Fab_Helmet',), idle=True)
bulb('BUSY_fab_Light_Weld', fb, P(-0.4, -1.75, 1.15), 35, (0.55, 0.75, 1.0))   # (the arc's glow on the frame)
spot('Light_Fab', fb, P(-0.3, -1.7, 2.6), 260, (1.0, 0.9, 0.75), deg=115)
empty('STAND_fab', fb, P(-0.3, -2.5), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='fab')
empty('STAND_any', fb, P(0.95, -2.0), rotz=math.pi - 0.4, kind='SINGLE_ARROW', size=0.5, clip='talk', role='any')

# ======================================================================================================================
# Data room (on the mezzanine, its back to the back wall): x -4.5..4.5, out to the rail at y -3.45
dt, o = station('station_data', 16.0)
P = lambda x, y, z=0.0: o + Vector((x, y, z))
guide_wall(dt, o, 9.0, 2.4)
DT = 0.71
screens = (('screen_tele', 'St_ScreenTele'), ('screen_timing', 'St_ScreenTiming'), ('screen_dyno', 'St_ScreenDyno2'))
for i, (x, desk, chair) in enumerate(((-2.0, 'desk_b', 'chair_g'), (0.0, 'desk_a', 'chair_b'), (2.0, 'desk_b', 'chair_k'))):
    put(desk, dt, P(x, -3.0), 0.0, name=f'Data_Desk_{i}')
    if i == 1: put('win95', dt, P(x - 0.25, -3.15, DT), math.pi, name='Data_Win95')   # (its own screen: Windows)
    else:
        put('crtmon', dt, P(x - 0.25, -3.2, DT), math.pi, name=f'DataCRT_{i}'); put('pc', dt, P(x + 0.5, -3.2, DT), 0.0, name=f'Data_PC_{i}')
        put('kbd', dt, P(x - 0.25, -2.8, DT), 0.0, name=f'Data_Kbd_{i}')
    if i != 1: card(f'Data_Screen_{i}', dt, 0.3, 0.23, P(x - 0.25, -3.03, DT + 0.09), glow(screens[i][1], screens[i][0]), rotz=math.pi, tilt=0.08)
    put(chair, dt, P(x - 0.2 + 0.1 * i, -2.15), math.pi + 0.3 - 0.3 * i, name=f'Data_Chair_{i}')
    put('mug', dt, P(x + 0.45, -2.7, DT), i * 2.0, name=f'Data_Mug_{i}')
    put('papers', dt, P(x - 0.7, -2.85, DT), 0.4 + i, name=f'Data_Papers_{i}')
put('phone', dt, P(2.55, -2.95, DT), 0.3); put('lamp', dt, P(-2.7, -3.15, DT), 0.4); put('lamp', dt, P(1.3, -3.2, DT), -0.3, name='lamp.001')
for k in range(3): put('floppy', dt, P(0.6 + k * 0.03, -2.8, DT + 0.002 * k), 0.2 * k, name=f'floppy.{k:03d}')
put('speaker', dt, P(-2.8, -3.25, DT), 0.0); put('ashtray', dt, P(-1.35, -2.75, DT), 0.0); put('cig_box', dt, P(-1.2, -2.8, DT), 0.6)
put('can', dt, P(2.75, -2.75, DT), 0.0); put('can_crushed', dt, P(-2.5, -2.4, 0.0), 1.0)
for k in range(5): put('binder' if k % 2 else 'binder2', dt, P(-0.9 + k * 0.1, -3.32, DT), 0.0, name=f'Data_Binder_{k}')
# along the back wall: filing, a bookcase of binders, the dot-matrix printer on a cabinet, its printout down to the floor
put('cab_low', dt, P(-3.6, -0.32), math.pi); put('cab_tall', dt, P(-2.6, -0.3), math.pi); put('bookcase', dt, P(3.2, -0.3), math.pi)
for k in range(8): put('binder' if k % 3 else 'binder2', dt, P(2.85 + k * 0.1, -0.3, 1.25), 0.0, name=f'Data_ShelfBinder_{k}')
put('cab_low', dt, P(-1.6, -0.32), math.pi, name='cab_low.001')
PT = 0.76
box('Data_Printer', dt, (0.55, 0.32, 0.16), P(-1.6, -0.35, PT + 0.08), grey); box('Data_PrinterLid', dt, (0.5, 0.18, 0.05), P(-1.6, -0.3, PT + 0.18), board_white)
paper = art_mat('St_Printout', A('printout'), dirt=0.15)
card('Data_PrintoutUp', dt, 0.36, 0.5, P(-1.6, -0.48, PT + 0.17), paper, tilt=-0.5)
for k in range(5):   # (the printout folded on the floor in front, zigzag)
    card(f'Data_PrintoutFold_{k}', dt, 0.36, 0.22, P(-1.6, -0.8 - k * 0.03, 0.005 + k * 0.012), paper, tilt=-1.45 + (k % 2) * 0.2)
put('papers', dt, P(-3.6, -0.32, 0.76), 0.2, name='Data_CabPapers')
# the whiteboard between the windows, the printouts pinned beside it, the clock's in the shell
box('Data_BoardFrame', dt, (1.9, 0.04, 1.0), P(0.6, -0.03, 1.4), board_white)
card('Data_Whiteboard', dt, 1.82, 0.92, P(0.6, -0.055, 0.94), art_mat('St_Whiteboard', A('whiteboard'), dirt=0.2))
box('Data_BoardTray', dt, (1.5, 0.08, 0.03), P(0.6, -0.08, 0.89), board_white)
for k, x in enumerate((1.85, 2.2)): card(f'Data_Pinned_{k}', dt, 0.28, 0.75, P(x, -0.02, 0.85 + k * 0.05), paper, rotz=0.03 - k * 0.06)
for k, (x, z) in enumerate(((-0.95, 1.6), (-0.7, 1.55))): card(f'Data_Sheet_{k}', dt, 0.21, 0.3, P(x, -0.02, z), sign('St_SheetTele', 'screen_tele') if k else paper, rotz=0.05 * (k - 0.5))
for i_, x_ in ((0, -2.0), (2, 2.0)): card(f'IDLE_data_Screen_{i_}', dt, 0.3, 0.23, P(x_ - 0.25, -3.03, DT + 0.09), off_screen, rotz=math.pi, tilt=0.08)
in_use(dt, 'data', ('Data_Screen_',))
empty('STAND_any', dt, P(0.6, -0.75), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='point', role='any')        # (at the whiteboard)
empty('STAND_any.001', dt, P(-1.6, -1.25), rotz=math.pi, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='any')  # (reading the printout)
bulb('Light_DataDesks', dt, P(-0.6, -2.7, 1.75), 90, (1.0, 0.85, 0.65))
bulb('BUSY_data_Light_Screens', dt, P(0.6, -2.5, 1.0), 45, (0.6, 0.85, 1.0))
for i, x in enumerate((-2.0, 2.0)): empty(f'STAND_data.{i:03d}', dt, P(x - 0.2 + 0.1 * i * 2, -2.15), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='sit_desk', role='data')
empty('STAND_manager', dt, P(0.9, -1.45), rotz=math.pi + 0.5, kind='SINGLE_ARROW', size=0.5, clip='talk_2', role='manager')

# ======================================================================================================================
# Lift and engine hoist (Tools, level 2): stands in a bay, not against a wall; its origin is the middle of the bay,
# the car's nose down -Y. A two-post lift with its arms swung in, the hydraulics, an engine crane folded by the door
lf, o = station('station_tools2', 24.0)
P = lambda x, y, z=0.0: o + Vector((x, y, z))
LX = 1.62
for s in (-1, 1):
    x = s * LX
    box(f'Lift_Base_{s}', lf, (0.55, 0.7, 0.02), P(x, 0.0, 0.01), steel)
    box(f'Lift_Post_{s}', lf, (0.3, 0.36, 3.6), P(x, 0.0, 1.8), red)
    box(f'Lift_Carriage_{s}', lf, (0.36, 0.42, 0.55), P(x - s * 0.04, 0.0, 0.45), steel)
    box(f'Lift_LockBar_{s}', lf, (0.04, 0.06, 2.9), P(x - s * 0.17, 0.12, 1.8), grey)
    for k, a in enumerate((0.55, -0.45)):   # (two arms each side, swung in under where the car goes)
        L = 1.05; ex = x - s * L * math.cos(a) * 0.95; ey = (1 if k == 0 else -1) * L * math.sin(abs(a)) * 0.95
        beam(f'Lift_Arm_{s}_{k}', lf, P(x - s * 0.15, (0.15 if k == 0 else -0.15), 0.2), P(ex, ey + (0.15 if k == 0 else -0.15), 0.2), 0.11, 0.07, steel)
        cyl(f'Lift_Pad_{s}_{k}', lf, 0.07, 0.07, P(ex, ey + (0.15 if k == 0 else -0.15), 0.27), rubber, verts=10)
box('Lift_TopBeam', lf, (2 * LX + 0.3, 0.2, 0.18), P(0.0, 0.0, 3.68), red)
box('Lift_TopSwitch', lf, (0.6, 0.12, 0.12), P(0.0, -0.1, 3.52), grey)
rod('Lift_Hydraulic', lf, P(-LX + 0.1, 0.2, 3.6), P(LX - 0.1, 0.2, 3.6), 0.015, rubber, 6)
box('Lift_PowerUnit', lf, (0.25, 0.3, 0.55), P(-LX - 0.3, 0.05, 1.0), blue); cyl('Lift_Motor', lf, 0.1, 0.25, P(-LX - 0.3, 0.05, 1.42), grey)
box('Lift_Button', lf, (0.08, 0.04, 0.12), P(-LX - 0.3, -0.12, 1.15), yellow)
hose('Lift_PowerHose', lf, [P(-LX - 0.3, 0.2, 0.75), P(-LX - 0.18, 0.25, 0.5), P(-LX, 0.2, 0.5)], 0.015, rubber, 6)
card('Lift_Sign', lf, 0.36, 0.27, P(-LX, -0.19, 1.4), sign('St_SignLift', 'sign_lift'))
for s in (-1, 1): box(f'Lift_Kick_{s}', lf, (0.31, 0.37, 0.25), P(s * LX, 0.0, 0.125), hazard)
# the engine crane, folded: two legs on castors, the mast, the boom with its chain and hook
CX, CY = -1.25, -2.4
for s in (-1, 1):
    rod(f'Crane_Leg_{s}', lf, P(CX + s * 0.3, CY + 0.35, 0.08), P(CX + s * 0.3, CY - 0.75, 0.08), 0.04, yellow, 6)
    cyl(f'Crane_Castor_{s}', lf, 0.05, 0.04, P(CX + s * 0.3, CY - 0.75, 0.05), rubber, rot=(0, D90, 0))
rod('Crane_Cross', lf, P(CX - 0.3, CY + 0.35, 0.1), P(CX + 0.3, CY + 0.35, 0.1), 0.05, yellow, 6)
rod('Crane_Mast', lf, P(CX, CY + 0.35, 0.1), P(CX, CY + 0.35, 1.45), 0.05, yellow, 6)
rod('Crane_Boom', lf, P(CX, CY + 0.35, 1.4), P(CX, CY - 0.55, 1.75), 0.045, yellow, 6)
rod('Crane_Ram', lf, P(CX, CY + 0.3, 0.45), P(CX, CY - 0.1, 1.55), 0.03, steel, 6)
rod('Crane_Chain', lf, P(CX, CY - 0.55, 1.73), P(CX, CY - 0.55, 1.2), 0.012, steel, 4)
bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.012, major_segments=10, minor_segments=4, location=P(CX, CY - 0.55, 1.15), rotation=(D90, 0, 0))
h_ = bpy.context.active_object; h_.name = 'Crane_Hook'; h_.data.materials.append(steel); link(h_, lf)
# round it: axle stands, a drain caddy, a wheel off, a tire, a pallet of parts waiting
for k, (x, y) in enumerate(((LX + 0.55, -1.6), (LX + 0.55, -2.1))):
    cyl(f'Stand_Base_{k}', lf, 0.12, 0.3, P(x, y, 0.15), red, verts=6); cyl(f'Stand_Post_{k}', lf, 0.03, 0.25, P(x, y, 0.42), steel, verts=6)
cyl('Drain_Tank', lf, 0.22, 0.5, P(1.15, -2.0, 0.35), yellow, verts=12); cyl('Drain_Funnel', lf, 0.25, 0.08, P(1.15, -2.0, 1.0), steel, verts=12)
rod('Drain_Post', lf, P(1.15, -2.0, 0.6), P(1.15, -2.0, 0.96), 0.02, steel, 6)
for x, y in ((1.0, -1.85), (1.3, -1.85), (1.0, -2.15), (1.3, -2.15)): cyl(f'Drain_Wheel_{x}_{y}', lf, 0.05, 0.03, P(x, y, 0.05), rubber, rot=(0, D90, 0))
put('tire', lf, P(-LX - 0.55, -1.3, 0.0), 0.3); put('tire', lf, P(-LX - 0.5, -1.25, 0.18), 1.2, name='tire.001')
put('pallet', lf, P(LX + 0.65, 1.1), D90 + 0.05); put('crate_wood', lf, P(LX + 0.6, 1.1, 0.13), 0.3)
HY = 0.62   # (an engine out, hanging off the crane's hook; the car's wheels off, leant on the post)
rod('BUSY_tools2_Chain2', lf, P(CX, CY - 0.55, 1.12), P(CX, CY - 0.55, HY + 0.62), 0.01, steel, 4)
box('BUSY_tools2_EngBlock', lf, (0.55, 0.4, 0.38), P(CX, CY - 0.55, HY + 0.19), cast); box('BUSY_tools2_EngHead', lf, (0.53, 0.34, 0.12), P(CX, CY - 0.55, HY + 0.44), alloy)
box('BUSY_tools2_EngCover', lf, (0.5, 0.24, 0.08), P(CX, CY - 0.55, HY + 0.54), red); box('BUSY_tools2_EngSump', lf, (0.48, 0.3, 0.12), P(CX, CY - 0.55, HY - 0.06), cast)
cyl('BUSY_tools2_EngBell', lf, 0.18, 0.14, P(CX + 0.33, CY - 0.55, HY + 0.15), alloy, rot=(0, D90, 0))
for k_, (x_, y_, rz_) in enumerate(((LX + 0.3, 0.45, 0.2), (LX + 0.32, -0.45, -0.25), (-LX - 0.32, 0.5, 0.1), (-LX - 0.3, -0.5, -0.15))):
    put('tire', lf, P(x_, y_, 0.31), rz_, name=f'BUSY_tools2_Wheel_{k_}', tilt=(0.0, 1.35 if x_ > 0 else -1.35))
empty('STAND_lift', lf, P(0.0, -0.4), rotz=0.0, kind='SINGLE_ARROW', size=0.5, clip='idle_look', role='mechanic')
empty('STAND_any', lf, P(LX - 0.4, -1.4), rotz=D90, kind='SINGLE_ARROW', size=0.5, clip='kneel', role='any')

for c in stations.children:
    for ob in c.objects:
        if ob.type == 'EMPTY': ob.empty_display_size = 0.5

# ---------------- the exporter (also kept in the .blend as a text block) ----------------
EXPORT = r'''
import bpy, os
from mathutils import Matrix, Vector
OUT = bpy.path.abspath('//')   # (next to the .blend: models/garage/)
def export_kit(out=OUT, only=None):
    done = []
    for coll in bpy.data.collections:
        if not coll.name.startswith(('shell_', 'station_')) or ' ' in coll.name: continue
        if only and coll.name not in only: continue
        objs = [o for o in coll.all_objects if not o.name.startswith('GUIDE') and o.visible_get()]
        off = Vector(coll.instance_offset) if coll.name.startswith('station_') else None
        roots = [o for o in objs if not o.parent or o.parent not in objs]
        if off is not None:
            for o in roots: o.matrix_world = Matrix.Translation(-off) @ o.matrix_world
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        path = os.path.join(out, coll.name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_cameras=False, export_lights=True,
                                  export_extras=True, export_apply=True, export_yup=True)
        if off is not None:
            for o in roots: o.matrix_world = Matrix.Translation(off) @ o.matrix_world
        done.append(path)
    print('exported:', *done, sep='\n  ')
    return done
if __name__ == '__main__': export_kit()
'''
t = bpy.data.texts.new('export_kit'); t.write(EXPORT)
path = os.path.join(OUT, 'stations-start.blend')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=path)
print('wrote', path)
if '--export' in args:
    ns = {'__name__': 'kit'}; exec(EXPORT, ns); ns['export_kit'](OUT)
