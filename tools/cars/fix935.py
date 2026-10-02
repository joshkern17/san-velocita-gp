# Porsche 935, stage 1 of 2 (then fix935b.py). Usage: python3 tools/cars/fix935.py Porsche_935.glb /tmp/stage1.glb
# Porsche 935: both sides were mapped onto the lower side photo (nose left = the car's left side). Give the right
# side (-X) the upper photo (nose right) through the fitted mirror transform, duplicating seam vertices; texture -> JPEG.
import json, struct, sys, io, numpy as np
from PIL import Image
src, out = sys.argv[1:3]
# lower side photo -> upper (mirrored): x_up = (a - x_lo) * s, y_up = (y_lo - b) * sy, in texture pixels (fitted on the
# car's silhouette in the two photos, 91% overlap)
a, b, s, sy = 1992.9, 308.0, 0.9976, 0.9790
f = open(src, 'rb').read(); jl = struct.unpack_from('<I', f, 12)[0]; j = json.loads(f[20:20 + jl]); bin_ = f[20 + jl + 8:]
views = [bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']] for bv in j['bufferViews']]
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5122: np.int16, 5121: np.uint8, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(i):
    a_ = j['accessors'][i]; bv = j['bufferViews'][a_['bufferView']]; n = NC[a_['type']]
    assert not bv.get('byteStride') or bv['byteStride'] == n * np.dtype(CT[a_['componentType']]).itemsize
    return np.frombuffer(views[a_['bufferView']], dtype=CT[a_['componentType']], count=a_['count'] * n, offset=a_.get('byteOffset', 0)).reshape(a_['count'], n).copy()
def add(arr, like, target=None):
    a_ = dict(j['accessors'][like]); a_.pop('byteOffset', None); a_.pop('sparse', None)
    views.append(arr.astype(CT[a_['componentType']]).tobytes()); bv = {'buffer': 0, 'byteLength': len(views[-1])}
    if target: bv['target'] = target
    j['bufferViews'].append(bv); a_['bufferView'] = len(j['bufferViews']) - 1; a_['count'] = len(arr)
    if 'min' in a_: a_['min'] = arr.min(0).tolist(); a_['max'] = arr.max(0).tolist()
    j['accessors'].append(a_); return len(j['accessors']) - 1
img = j['images'][0]; tex = Image.open(io.BytesIO(views[img['bufferView']])); W, H = tex.size
body = next(n for n in j['nodes'] if n['name'] == 'Body')
moved = 0
for p in j['meshes'][body['mesh']]['primitives']:
    if not j['materials'][p['material']].get('pbrMetallicRoughness', {}).get('baseColorTexture'): continue
    attrs = {k: read(v) for k, v in p['attributes'].items()}; I = read(p['indices']).ravel()
    P, U = attrs['POSITION'], attrs['TEXCOORD_0']; assert U.dtype == np.float32
    tri = I.reshape(-1, 3)
    right = (P[tri, 0] < -0.02).all(1) & (U[tri, 1] * H > 726).all(1)   # right-side faces on the lower photo
    moved = int(right.sum())
    used_other = np.zeros(len(P), bool); used_other[tri[~right].ravel()] = True
    remap = {}; extra = []
    newtri = tri.copy()
    for t in np.nonzero(right)[0]:
        for k in range(3):
            v = tri[t, k]
            if v not in remap:
                if used_other[v]: remap[v] = len(P) + len(extra); extra.append(v)   # seam: own copy
                else: remap[v] = v
            newtri[t, k] = remap[v]
    for k in attrs: attrs[k] = np.concatenate([attrs[k], attrs[k][extra]]) if extra else attrs[k]
    U = attrs['TEXCOORD_0']; mv = np.array(sorted(set(remap.values())))
    px, py = U[mv, 0] * W, U[mv, 1] * H
    U[mv, 0] = (a - px) * s / W; U[mv, 1] = (py - b) * sy / H
    for k, arr in attrs.items(): p['attributes'][k] = add(arr, p['attributes'][k], 34962)
    p['indices'] = add(newtri.reshape(-1, 1).astype(np.uint32 if len(attrs['POSITION']) > 65535 else np.uint16), p['indices'], 34963)
    print('moved', moved, 'faces;', len(extra), 'seam vertices duplicated')
jb = io.BytesIO(); tex.convert('RGB').save(jb, 'PNG'); views[img['bufferView']] = jb.getvalue(); img['mimeType'] = 'image/png'  # (stage 2 makes the JPEG)
# drop views nothing references any more, then repack
refs = {a_['bufferView'] for a_ in j['accessors'] if 'bufferView' in a_} | {im['bufferView'] for im in j['images']}
keep = [i for i in range(len(views)) if i in refs]; newidx = {o: n for n, o in enumerate(keep)}
for a_ in j['accessors']: a_['bufferView'] = newidx[a_['bufferView']]
for im in j['images']: im['bufferView'] = newidx[im['bufferView']]
used_acc = set()
for m in j['meshes']:
    for p in m['primitives']: used_acc |= set(p['attributes'].values()) | {p['indices']}
j['bufferViews'] = [j['bufferViews'][i] for i in keep]; views = [views[i] for i in keep]
data = b''
for bv, v in zip(j['bufferViews'], views):
    data += b'\0' * ((4 - len(data) % 4) % 4); bv['byteOffset'] = len(data); bv['byteLength'] = len(v); data += v
data += b'\0' * ((4 - len(data) % 4) % 4); j['buffers'] = [{'byteLength': len(data)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(data)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(data), 0x004E4942) + data)
print('wrote', out, 28 + len(js) + len(data), 'bytes; unused accessors left:', len(j['accessors']) - len(used_acc))
