# BMW M3 GTR (E46): your Blender export -> the game's car. Usage:
#   python3 tools/cars/m3gtr.py models/m3gtr_main.glb models/cars/m3gtr.glb
# - already at real size (4.57 m long, 1.85 m wide, 2.74 m wheelbase); centred on the wheels across (the export sits
#   1.4 mm to the left)
# - two roof triangles whose uvs slipped onto the bonnet are put back on the roof (see below)
# - lamps: the export has none, so Light_Head / Light_Tail are cut out of the body: the body's own triangles clipped
#   (in the texture) to the lamp outlines in the front and rear views of the reference sheet, lifted 3 mm off the
#   body. They light up at night and under braking like the other cars' lamps
# - the reference sheet -> half size, JPEG (the PNG is 4 MB)
import json, struct, sys, io, numpy as np
from PIL import Image
src, out = sys.argv[1:3]
CX = (0.78596 + -0.78313) / 2         # wheel centres across (left +X, right -X)
# lamp outlines in the sheet (pixels, full size; convex). The car's left lamp, then the right one mirrored about the
# middle of the view (front x 1174 - x, rear x 1185 - x)
HEAD = [[(172, 882), (185, 825), (220, 814), (375, 815), (422, 880)]]
TAIL = [[(170, 1590), (185, 1548), (270, 1545), (285, 1590)], [(165, 1590), (375, 1590), (375, 1655), (165, 1655)]]
HEAD += [[(1174 - x, y) for x, y in reversed(p)] for p in HEAD]
TAIL += [[(1185 - x, y) for x, y in reversed(p)] for p in TAIL] + [[(555, 1503), (628, 1503), (628, 1527), (555, 1527)]]  # (+ the third brake light)

f = open(src, 'rb').read(); jl = struct.unpack_from('<I', f, 12)[0]; j = json.loads(f[20:20 + jl]); bin_ = f[20 + jl + 8:]
views = [bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']] for bv in j['bufferViews']]
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(i):
    a_ = j['accessors'][i]; n = NC[a_['type']]
    return np.frombuffer(views[a_['bufferView']], dtype=CT[a_['componentType']], count=a_['count'] * n, offset=a_.get('byteOffset', 0)).reshape(a_['count'], n).copy()
def add(arr, typ, target=34962):
    arr = np.ascontiguousarray(arr, dtype=np.float32); views.append(arr.tobytes())
    j['bufferViews'].append({'buffer': 0, 'byteLength': len(views[-1]), 'target': target})
    j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': len(arr), 'type': typ, 'min': arr.min(0).tolist(), 'max': arr.max(0).tolist()})
    return len(j['accessors']) - 1

for n in j['nodes']:
    t = n.get('translation', [0, 0, 0]); n['translation'] = [t[0] - CX, t[1], t[2]]

body_mat = next(i for i, m in enumerate(j['materials']) if m['name'] == 'Body')
tex_img = j['textures'][j['materials'][body_mat]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
img = Image.open(io.BytesIO(views[j['images'][tex_img]['bufferView']])).convert('RGB'); W, H = img.size
body = next(n for n in j['nodes'] if n['name'] == 'Body')
prim = next(p for p in j['meshes'][body['mesh']]['primitives'] if p['material'] == body_mat)
P, N, U = read(prim['attributes']['POSITION']), read(prim['attributes']['NORMAL']), read(prim['attributes']['TEXCOORD_0'])
I = read(prim['indices']).ravel() if 'indices' in prim else np.arange(len(P))

# the roof: two of its triangles (left of the middle, by the B-pillars) have their uvs squashed onto a sliver of the
# bonnet in the top view, so a livery stripe over the roof showed the bonnet's paint there (and the bonnet the roof's).
# The roof is projected straight from the top view, so its uvs are one affine map of (x, z): fit it (ignoring
# outliers) and put any roof vertex more than 100 px off it (that only roof faces use) back on it
fn = np.cross(P[I[1::3]] - P[I[0::3]], P[I[2::3]] - P[I[0::3]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
fc = (P[I[0::3]] + P[I[1::3]] + P[I[2::3]]) / 3
roof = (np.abs(fn[:, 1]) > 0.85) & (fc[:, 1] > 1.15)
RV = np.unique(I.reshape(-1, 3)[roof].ravel()); A = np.c_[P[RV, 0], P[RV, 2], np.ones(len(RV))]
keep = np.ones(len(RV), bool)
for _ in range(4):
    coef = np.linalg.lstsq(A[keep], U[RV][keep], rcond=None)[0]
    err = np.linalg.norm((A @ coef - U[RV]) * [W, H], axis=1); keep = err < max(15, 3 * np.median(err))
others = set(I.reshape(-1, 3)[~roof].ravel().tolist())
moved = [v for v, e in zip(RV, err) if e > 100 and v not in others]   # (only real slips: the roof's curve leaves a few px)
U[moved] = A[np.isin(RV, moved)] @ coef
if moved: prim['attributes']['TEXCOORD_0'] = add(U, 'VEC2')
print('roof uvs: fit to', round(float(np.median(err)), 1), 'px; moved', len(moved), 'vertices', np.round(err[np.isin(RV, moved)]).tolist())

def clip(poly, a, b, s):   # Sutherland-Hodgman: keep the part of poly on the outline's inside of its edge a -> b (s: which way it winds)
    out = []
    side = lambda p: s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
    for k in range(len(poly)):
        p, q = poly[k], poly[(k + 1) % len(poly)]; sp, sq = side(p), side(q)
        if sp >= 0: out.append(p)
        if (sp >= 0) != (sq >= 0): t = sp / (sp - sq); out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out
def lamp(outlines):
    pos, nor, uv = [], [], []
    for t in range(0, len(I), 3):
        k = I[t:t + 3]; T = U[k] * [W, H]
        det = (T[1, 0] - T[0, 0]) * (T[2, 1] - T[0, 1]) - (T[2, 0] - T[0, 0]) * (T[1, 1] - T[0, 1])
        if abs(det) < 1e-6: continue
        for o in outlines:
            s = np.sign(sum(o[e][0] * o[(e + 1) % len(o)][1] - o[(e + 1) % len(o)][0] * o[e][1] for e in range(len(o))))
            poly = [tuple(x) for x in T]
            for e in range(len(o)):
                poly = clip(poly, o[e], o[(e + 1) % len(o)], s)
                if not poly: break
            if len(poly) < 3: continue
            # each corner back to the triangle's barycentrics: its position, normal and texture coordinate
            vs = []
            for x, y in poly:
                l1 = ((x - T[0, 0]) * (T[2, 1] - T[0, 1]) - (T[2, 0] - T[0, 0]) * (y - T[0, 1])) / det
                l2 = ((T[1, 0] - T[0, 0]) * (y - T[0, 1]) - (x - T[0, 0]) * (T[1, 1] - T[0, 1])) / det
                w = np.array([1 - l1 - l2, l1, l2]); nn = w @ N[k]; nn /= np.linalg.norm(nn) + 1e-9
                vs.append((w @ P[k] + nn * 0.003, nn, (x / W, y / H)))
            for m in range(1, len(vs) - 1):
                for v in (vs[0], vs[m], vs[m + 1]): pos.append(v[0]); nor.append(v[1]); uv.append(v[2])
    return np.array(pos), np.array(nor), np.array(uv)
for name, outlines in (('Light_Head', HEAD), ('Light_Tail', TAIL)):
    pos, nor, uv = lamp(outlines)
    print(name, len(pos) // 3, 'triangles', 'z', pos[:, 2].min().round(3), '..', pos[:, 2].max().round(3))
    j['meshes'].append({'name': name, 'primitives': [{'attributes': {'POSITION': add(pos, 'VEC3'), 'NORMAL': add(nor, 'VEC3'), 'TEXCOORD_0': add(uv, 'VEC2')}, 'material': body_mat}]})
    j['nodes'].append({'name': name, 'mesh': len(j['meshes']) - 1, 'translation': list(body['translation'])})
    j['scenes'][0]['nodes'].append(len(j['nodes']) - 1)

for k, im in enumerate(j['images']):
    pic = Image.open(io.BytesIO(views[im['bufferView']])).convert('RGB')
    if k == tex_img: pic = pic.resize((W // 2, H // 2), Image.LANCZOS)
    o = io.BytesIO(); pic.save(o, 'JPEG', quality=88); views[im['bufferView']] = o.getvalue(); im['mimeType'] = 'image/jpeg'

data = b''
for bv, v in zip(j['bufferViews'], views):
    data += b'\0' * ((4 - len(data) % 4) % 4); bv['byteOffset'] = len(data); bv['byteLength'] = len(v); data += v
data += b'\0' * ((4 - len(data) % 4) % 4); j['buffers'] = [{'byteLength': len(data)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(data)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(data), 0x004E4942) + data)
print('wrote', out, 28 + len(js) + len(data), 'bytes')
