# The MOUNT PANORAMA / BATHURST sign on the hillside below Skyline (white letters of painted rocks, laid on the slope,
# read from down the hill), for the user's Mount Panorama custom track. Each letter is set in a heavy sans at the
# centre, angle and cap height traced off the aerial photo (panorama_sign.json), then cut into a 2 m grid and laid on
# whatever ground the game has there: the model is flat (heights over the ground) and the item is `drape`, so
# js/realworld.js lifts every vertex onto the ground as it loads (the editor's ground and the race's differ by metres
# on this slope). models/landmarks/src/panorama_sign_ground.json (world.groundHeight sampled every metre) is only for
# previewing it on the hill here.
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python tools/tracks/landmarks/panorama_sign.py
# Writes models/landmarks/panorama_sign.glb + .json (the track's landmarks: { url, items }).
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lmkit as K
from garagelib import grimy_tile, vnoise, fbm

CID = 'panorama_sign'
FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf'
LIFT, SKIRT, CELL, GAP = 0.2, 0.6, 2.5, 1.6   # top over the ground, sides down into it, grid, least gap between letters
args = K.setup(CID, seed=1989)
lay = json.load(open(os.path.join(K.HERE, CID + '.json')))['letters']
gnd = json.load(open(os.path.join(K.ROOT, 'models', 'landmarks', 'src', CID + '_ground.json')))
H = np.array(gnd['h'], np.float32); GX0, GZ0, GST = gnd['x0'], gnd['z0'], gnd['st']


def ground(x, z):  # the game's ground height (bilinear over the 1 m samples)
    fx = min(max((x - GX0) / GST, 0), H.shape[1] - 1.001); fz = min(max((z - GZ0) / GST, 0), H.shape[0] - 1.001)
    i, j = int(fx), int(fz); u, v = fx - i, fz - j
    return float((H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - v) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * v)


# one root for the sign (draped: the game seats each vertex on the ground; seat is only for the --preview)
xs = [l['x'] for l in lay]; zs = [l['z'] for l in lay]
cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
hw, hd = (max(xs) - min(xs)) / 2 + 14, (max(zs) - min(zs)) / 2 + 14
seat = max(ground(cx + u * hw, cz + v * hd) for u in (-1, 0, 1) for v in (-1, 0, 1)) - 0.05   # (js/realworld.js loadLandmarks)
r = K.root('sign', cx, cz, hw, hd, 0.0, kind='sign'); K.LM[-1]['drape'] = True

# painted rocks: a stone tile turned white, a little dirt through it
rock = grimy_tile('Lk_SignRock', 'stone_01.png', dirt=0.18, tint=(0.93, 0.93, 0.9))
font = bpy.data.fonts.load(FONT)


def glyph(ch):  # the letter as flat polygons in its own units (x along the line, y up the letter)
    cu = bpy.data.curves.new('g_' + ch, 'FONT'); cu.body = ch; cu.font = font; cu.align_x = 'CENTER'; cu.size = 1.0
    o = bpy.data.objects.new('g_' + ch, cu); K.TOP.objects.link(o)
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(o); bpy.data.curves.remove(cu)
    return me


cap = (lambda m: max(v.co.y for v in m.vertices) - min(v.co.y for v in m.vertices))(glyph('H'))
# each word's letters at their traced size; a letter the font makes too wide for its place is narrowed to its share of
# the room between its neighbours' centres (the real letters nearly touch)
words = {}
for l in lay: words.setdefault(l['w'], []).append(l)
for w, ls in words.items():
    for l in ls:
        me = glyph(l['ch']); xs_ = [v.co.x for v in me.vertices]; ys_ = [v.co.y for v in me.vertices]
        l['me'], l['k'] = me, l['h'] / cap
        l['mid'] = ((min(xs_) + max(xs_)) / 2, (min(ys_) + max(ys_)) / 2); l['half'] = (max(xs_) - min(xs_)) / 2 * l['k']
    for i, l in enumerate(ls):
        l['sx'] = min([1.0] + [(math.hypot(o['x'] - l['x'], o['z'] - l['z']) - GAP) / (l['half'] + o['half']) for o in (ls[i - 1] if i else None, ls[i + 1] if i + 1 < len(ls) else None) if o])
    print(w, 'cap %.1f m, widths' % ls[0]['h'], ' '.join('%s x%.2f' % (l['ch'], l['sx']) for l in ls))

bm = bmesh.new()
for l in lay:
    me, k, (mx, my) = l['me'], l['k'], l['mid']
    d = Vector((l['d'][0], l['d'][1])); n = Vector((-d.y, d.x))
    if n.y < 0: n = -n   # (up the letter: up the hill, +z)
    vmap = {}
    for v in me.vertices:
        u, t = (v.co.x - mx) * k * l['sx'], (v.co.y - my) * k
        gx, gz = l['x'] + d.x * u + n.x * t, l['z'] + d.y * u + n.y * t
        vmap[v.index] = bm.verts.new(K.P(gx, gz, 0))
    for p in me.polygons:
        try: bm.faces.new([vmap[i] for i in p.vertices])
        except ValueError: pass
    bpy.data.meshes.remove(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
# faces up (seen from the sky), then cut into a grid so the letters can follow the slope
for f in bm.faces:
    if f.normal.z < 0: f.normal_flip()
mn = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts))); mxv = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts)))
for ax, lo, hi in ((0, mn.x, mxv.x), (1, mn.y, mxv.y)):
    c = math.floor(lo / CELL) * CELL
    while c < hi:
        co = Vector((c, 0, 0)) if ax == 0 else Vector((0, c, 0)); no = Vector((1, 0, 0)) if ax == 0 else Vector((0, 1, 0))
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        c += CELL
bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
PREVIEW = '--preview' in args   # (on the hill in Blender, as the game will lay it; the export is always flat)
for v in bm.verts: v.co.z = LIFT + (ground(v.co.x, -v.co.y) - seat if PREVIEW else 0)
# the rim: walls down into the hill so no edge shows a gap on the slope
rim = [e for e in bm.edges if e.is_boundary]
ext = bmesh.ops.extrude_edge_only(bm, edges=rim)
for v in (g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)): v.co.z -= SKIRT
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
me = bpy.data.meshes.new('Sign'); bm.to_mesh(me); bm.free()
# world-mapped UVs (the rock tile every 4 m); mottled white in the vertex colours, the rim in shadow
uv = me.uv_layers.new(); col = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER'); me.color_attributes.active_color = col
nz = fbm(64, 64, (16, 4), wrap=True)
for p in me.polygons:
    for li in p.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        uv.data[li].uv = (co.x / 4, co.y / 4)
        g = nz[int(co.y * 2) % 64, int(co.x * 2) % 64]; s = (0.86 + 0.14 * g) * (0.62 if p.normal.z < 0.5 else 1.0)
        col.data[li].color = (s, s * 0.99, s * 0.96, 1)
me.materials.append(rock)
o = bpy.data.objects.new('Sign', me); K.TOP.objects.link(o)
bpy.context.view_layer.update(); o.parent = r; o.matrix_parent_inverse = r.matrix_world.inverted()
tri = sum(len(p.vertices) - 2 for p in me.polygons)
print('sign: %d letters, %d triangles, root at %.1f, %.1f (seat %.2f m)' % (len(lay), tri, cx, cz, seat))
# (lmkit's shading bake is for buildings - shade by height over the ground - so the sign keeps its own colours)
K.PARTS.clear()
K.finish(CID, args=args)
