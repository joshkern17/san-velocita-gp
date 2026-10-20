# The kit a circuit's landmark script builds with (tools/tracks/landmarks/<id>.py; Indianapolis's indy.py came first
# and has its own copy): pieces in the game's PS1-plus style (PSX textures with grime, ambient light baked into the
# vertex colours), laid out in the track's own frame (game x, z -> Blender x, -z; h up from the ground), each landmark's
# root an empty LM_<key> at the middle of its footprint, at ground level 0 - the game seats it on its ground
# (js/realworld.js loadLandmarks) and keeps the scenery out of its footprint (tools/tracks/landmarks.mjs, js/world.js).
#   import lmkit as K; K.setup('spa', seed=1921); ...build with K.root / K.blk / K.face...; K.finish('spa', stands)
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import importlib, garagelib as G
importlib.reload(G)
from garagelib import grimy_tile, plain_mat, cutout_mat, art_mat, px_tex, mat_img, vnoise, fbm, grime

PARTS = []          # (object, root) for the shading bake
LM = []             # the footprints written to <id>.json
TOP = None
ART = None
P = lambda x, z, h=0.0: Vector((x, -z, h))
M = {}              # the shared materials (setup)


def setup(cid, seed=1):
    global TOP, ART
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if bpy.app.background: bpy.ops.wm.read_factory_settings(use_empty=True)
    else:
        sc = bpy.data.scenes.get(cid + ' landmarks') or bpy.data.scenes.new(cid + ' landmarks')
        for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.context.window.scene = sc
    G.configure(os.path.join(ROOT, 'models', 'landmarks', 'src', cid + '_gen'), seed=seed)
    ART = os.path.join(ROOT, 'models', 'landmarks', 'src', cid)
    TOP = bpy.context.scene.collection
    PARTS.clear(); LM.clear()
    M.update(
        concrete=grimy_tile('Lk_Concrete', 'concrete_02.png', dirt=0.25),
        concrete_d=grimy_tile('Lk_ConcreteDark', 'dirty_concrete.png', dirt=0.3),
        stone=grimy_tile('Lk_Stone', 'stone_02.png', dirt=0.3),
        stone_l=grimy_tile('Lk_StoneLight', 'stone_01.png', dirt=0.2),
        brick=grimy_tile('Lk_Brick', 'brick.png', dirt=0.25),
        roof=grimy_tile('Lk_Roof', 'asphalt_02.png', dirt=0.3),
        slate=grimy_tile('Lk_Slate', 'painted_metal.png', dirt=0.35, tint=(0.2, 0.22, 0.26)),
        steel=grimy_tile('Lk_Steel', 'painted_metal.png', dirt=0.3, rust=0.05, tint=(0.52, 0.54, 0.56)),
        dark=grimy_tile('Lk_Dark', 'painted_metal.png', dirt=0.25, tint=(0.11, 0.12, 0.13)),
        galv=grimy_tile('Lk_Galv', 'galvanized_metal.png', dirt=0.35),
        white=plain_mat('Lk_White', (0.86, 0.86, 0.83), dirt=0.14),
        cream=plain_mat('Lk_Cream', (0.88, 0.85, 0.76), dirt=0.14),
    )
    n = 32; al = np.zeros((n, n), np.float32); al[:3] = 1; al[n // 2:n // 2 + 2] = 1; al[:, :2] = 1; al[:, n // 2:n // 2 + 2] = 1
    M['railing'] = cutout_mat('Lk_Railing', np.ones((n, n, 3), np.float32) * 0.62, al)
    return args


def art(name, dirt=0.12, emit=None):
    return art_mat('Lk_' + name, os.path.join(ART, name + '.png'), dirt=dirt, emit=emit)


def curtain(name, pane, frame, cols=4, rows=2):
    # a glass curtain wall tile: panes with a sky sheen top to bottom, mullions and transoms
    n = 64; col = np.ones((n, n, 3), np.float32) * np.array(pane, np.float32)
    col = col * np.linspace(1.15, 0.8, n)[:, None, None]
    col = col * (1 + 0.08 * (vnoise(n, n, 8, wrap=True) - 0.5))[..., None]
    for k in range(cols): col[:, k * n // cols:k * n // cols + 2] = frame
    for k in range(rows): col[k * n // rows:k * n // rows + 3, :] = frame
    return mat_img(name, px_tex(name, col), 0.25)


def windows(name, wall, glass=(0.14, 0.17, 0.2), frame=(0.92, 0.92, 0.88), w=0.42, h=0.5, sill=0.25, shutters=None, dirt=0.18):
    # one bay of a storey's wall (a tile, repeated along it): the wall's colour, a window in the middle (w, h: its
    # share of the tile; sill: how high its foot is), a frame round it, shutters either side if a colour is given
    n = 64; col = np.ones((n, n, 3), np.float32) * np.array(wall, np.float32)
    col = col * (1 + 0.06 * (vnoise(n, n, 16, wrap=True) - 0.5))[..., None]
    x0, x1 = int(n * (0.5 - w / 2)), int(n * (0.5 + w / 2)); y1 = int(n * (1 - sill)); y0 = int(y1 - n * h)
    col[y0 - 2:y1 + 2, x0 - 2:x1 + 2] = frame
    col[y0:y1, x0:x1] = np.array(glass, np.float32) * np.linspace(1.25, 0.8, y1 - y0)[:, None, None]
    col[y0:y1, (x0 + x1) // 2:(x0 + x1) // 2 + 1] = frame
    if shutters is not None:
        sw = (x1 - x0) // 2
        col[y0 - 2:y1 + 2, max(0, x0 - 2 - sw):x0 - 2] = shutters; col[y0 - 2:y1 + 2, x1 + 2:min(n, x1 + 2 + sw)] = shutters
    col[y1 + 2:y1 + 4, x0 - 4:x1 + 4] = np.array(frame) * 0.8   # (the sill)
    return mat_img(name, px_tex(name, grime(col, np.clip(fbm(n, n, (16, 8), wrap=True) - 0.45, 0, 1) * dirt)), 0.85)


def root(key, cx, cz, hw, hd, rot=0.0, kind='building'):
    e = bpy.data.objects.new('LM_' + key, None); e.location = P(cx, cz); e.empty_display_size = 3; TOP.objects.link(e)
    LM.append({'key': key, 'x': round(cx, 2), 'z': round(cz, 2), 'hw': round(hw, 2), 'hd': round(hd, 2), 'rot': round(rot, 4), 'kind': kind})
    return e


def own(o, r):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy(); o.parent = r; o.matrix_world = mw; PARTS.append((o, r)); return o


def blk(r, name, x0, x1, z0, z1, h0, h1, mat, uvs=0.5):
    # a box between game x0..x1, z0..z1, h0..h1 (world-mapped UVs: textures tile at their size)
    o = G.box(name, TOP, (abs(x1 - x0), abs(z1 - z0), h1 - h0), P((x0 + x1) / 2, (z0 + z1) / 2, (h0 + h1) / 2), mat, uvs=uvs)
    return own(o, r)


def face(r, name, a, b, h0, h1, mat, out, u=None):
    # a flat card from game point a to b (x, z), h0..h1, facing out ((nx, nz), game), its art stretched once over it
    # unless u (metres per repeat across); art reads left to right as seen from outside
    right = Vector((-out[0], out[1], 0)).cross(Vector((0, 0, 1)))
    if (P(*b) - P(*a)).dot(right) < 0: a, b = b, a
    ax, az = a; bx_, bz = b
    me = bpy.data.meshes.new(name)
    me.from_pydata([P(ax, az, h0), P(bx_, bz, h0), P(bx_, bz, h1), P(ax, az, h1)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(); L = math.hypot(bx_ - ax, bz - az); us = (L / u) if u else 1.0
    for li, c in zip(me.polygons[0].loop_indices, ((0, 0), (us, 0), (us, 1), (0, 1))): uv.data[li].uv = c
    me.update()
    if me.polygons[0].normal.dot(Vector((out[0], -out[1], 0))) < 0: me.flip_normals()
    o = bpy.data.objects.new(name, me); TOP.objects.link(o); me.materials.append(mat)
    return own(o, r)


def cylv(r, name, x, z, rad, h0, h1, mat, verts=16):
    return own(G.cyl(name, TOP, rad, h1 - h0, P(x, z, (h0 + h1) / 2), mat, verts=verts), r)


def rodv(r, name, p0, p1, rad, mat, verts=6):
    return own(G.rod(name, TOP, P(*p0), P(*p1), rad, mat, verts=verts), r)


def rail_ring(r, name, x0, x1, z0, z1, h, hgt=1.1):
    for k, (a, b, o) in enumerate((((x0, z0), (x1, z0), (0, -1)), ((x1, z0), (x1, z1), (1, 0)), ((x1, z1), (x0, z1), (0, 1)), ((x0, z1), (x0, z0), (-1, 0)))):
        face(r, f'{name}_{k}', a, b, h, h + hgt, M['railing'], o, u=1.2)


def flat_roof(r, name, x0, x1, z0, z1, h, mat=None, parapet=0.6):
    blk(r, name, x0, x1, z0, z1, h, h + 0.3, mat or M['roof'])
    for k, (a0, a1, b0, b1) in enumerate(((x0, x1, z0, z0 + 0.3), (x0, x1, z1 - 0.3, z1), (x0, x0 + 0.3, z0, z1), (x1 - 0.3, x1, z0, z1))):
        blk(r, f'{name}_p{k}', a0, a1, b0, b1, h + 0.3, h + 0.3 + parapet, M['concrete'])


# ---------------- in a building's own frame: local u along it, v across (v+ towards the track) ----------------
class Frame:
    # a building's footprint turned to the map's: centre (x, z), rot (its long side's direction), and which way across
    # is towards the track (toward: +1 / -1 on local v)
    def __init__(self, x, z, rot, toward=1):
        self.x, self.z, self.c, self.s, self.t = x, z, math.cos(rot), math.sin(rot), toward

    def at(self, u, v):   # local (u along, v across, + towards the track) -> game x, z
        v *= self.t
        return (self.x + self.c * u - self.s * v, self.z + self.s * u + self.c * v)

    def out(self, du, dv):   # a local direction -> game (nx, nz)
        dv *= self.t
        return (self.c * du - self.s * dv, self.s * du + self.c * dv)


def mesh(r, name, verts, faces, mat, uvs=0.5):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); TOP.objects.link(o); me.materials.append(mat); G.uv_world(me, Matrix(), uvs)
    return own(o, r)


def box_f(r, name, F, u0, u1, v0, v1, h0, h1, mat, uvs=0.5):
    # a box in a building's frame (turned with it)
    c = [F.at(u, v) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    vs = [P(x, z, h0) for x, z in c] + [P(x, z, h1) for x, z in c]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh(r, name, vs, f, mat, uvs)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    return o


def gable_f(r, name, F, u0, u1, v0, v1, h, rise, mat, over=0.5):
    # a pitched roof along u (the ridge along the building), eaves over by `over`
    u0 -= over; u1 += over; v0 -= over; v1 += over; vm = (v0 + v1) / 2
    p = lambda u, v, hh: P(*F.at(u, v), hh)
    vs = [p(u0, v0, h), p(u1, v0, h), p(u1, v1, h), p(u0, v1, h), p(u0, vm, h + rise), p(u1, vm, h + rise)]
    o = mesh(r, name, vs, [(0, 1, 5, 4), (2, 3, 4, 5), (3, 0, 4), (1, 2, 5)], mat)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    return o


def wall_f(r, name, F, side, u0, u1, v0, v1, h0, h1, mat, u=None):
    # a card on one side of a building's box (side: 'front' (towards the track), 'back', 'left' (u0), 'right' (u1))
    if side == 'front': a, b, o = F.at(u0, v1 + 0.02), F.at(u1, v1 + 0.02), F.out(0, 1)
    elif side == 'back': a, b, o = F.at(u0, v0 - 0.02), F.at(u1, v0 - 0.02), F.out(0, -1)
    elif side == 'left': a, b, o = F.at(u0 - 0.02, v0), F.at(u0 - 0.02, v1), F.out(-1, 0)
    else: a, b, o = F.at(u1 + 0.02, v0), F.at(u1 + 0.02, v1), F.out(1, 0)
    return face(r, name, a, b, h0, h1, mat, o, u)


# ---------------- the shading bake: dark at the foot of walls and under overhangs (the PS1 way) ----------------
def shade():
    for o, r in PARTS:
        if o.type != 'MESH': continue
        me = o.data; bpy.context.view_layer.update(); mw = o.matrix_world
        g0 = r.matrix_world.translation.z
        bm = bmesh.new(); bm.from_mesh(me)
        zs = [(mw @ v.co).z - g0 for v in bm.verts]
        if zs and max(zs) - min(zs) > 4 and min(zs) < 0.5:
            inv = mw.inverted()
            for hcut in (1.2, 3.2):
                co = inv @ Vector((0, 0, g0 + hcut)); no = (inv.to_3x3().transposed() @ Vector((0, 0, 1))).normalized()
                bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        bm.to_mesh(me); bm.free()
        a = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER'); me.color_attributes.active_color = a
        nm = mw.to_3x3()
        for poly in me.polygons:
            ny = (nm @ poly.normal).normalized().z
            for li in poly.loop_indices:
                h = (mw @ me.vertices[me.loops[li].vertex_index].co).z - g0
                t = min(1, max(0, h / 3.2)); k = 0.55 + 0.45 * (t * t * (3 - 2 * t))
                if ny < -0.3: k *= 0.72
                a.data[li].color = (k, k * 0.985, k * 0.96, 1)
    for m in {m for o, _ in PARTS if o.type == 'MESH' for m in o.data.materials if m}:
        nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
        if any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'AO'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        src = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
        if src: nt.links.new(src, mix.inputs['A'])
        else: mix.inputs['A'].default_value = p.inputs['Base Color'].default_value
        nt.links.new(ca.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])


def finish(cid, stand_lines=None, grounds=None, args=()):
    # bake the shading, write models/landmarks/<id>.glb and <id>.json (the footprints, the stand lines)
    shade()
    tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o, _ in PARTS if o.type == 'MESH')
    print(f'landmarks: {len(LM)} pieces, {tri:,} triangles')
    out = os.path.join(ROOT, 'models', 'landmarks', cid + '.glb'); os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump({'url': f'models/landmarks/{cid}.glb', 'grounds': grounds, 'items': LM, 'standLines': stand_lines or []}, open(out.replace('.glb', '.json'), 'w'), indent=0)
    if bpy.app.background or '--export' in args:
        bpy.ops.object.select_all(action='DESELECT')
        for o in TOP.all_objects: o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
                                  export_extras=True, export_apply=True, export_yup=True, export_vertex_color='ACTIVE')
        print('exported', out)
    if '--blend' in args: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'models', 'landmarks', 'src', cid + '-landmarks.blend'))
