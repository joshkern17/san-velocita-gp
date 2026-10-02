# Porsche 935, stage 2 of 2. Usage: python3 tools/cars/fix935b.py /tmp/stage1.glb models/cars/porsche935.glb
# Stage 2: faces sharing texels with a face of another livery panel (nose faces unwrapped onto the bonnet tip in the top
# photo; a few left/right slivers) get their own copy of those pixels, packed into the texture's blank top-left corner.
import json, struct, sys, io, numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1:3]
f = open(src, 'rb').read(); jl = struct.unpack_from('<I', f, 12)[0]; j = json.loads(f[20:20 + jl]); bin_ = f[20 + jl + 8:]
views = [bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']] for bv in j['bufferViews']]
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(i):
    a_ = j['accessors'][i]; n = NC[a_['type']]
    return np.frombuffer(views[a_['bufferView']], dtype=CT[a_['componentType']], count=a_['count'] * n, offset=a_.get('byteOffset', 0)).reshape(a_['count'], n).copy()
def add(arr, like, target):
    a_ = dict(j['accessors'][like]); a_.pop('byteOffset', None)
    a_['componentType'] = {np.dtype(np.float32): 5126, np.dtype(np.uint16): 5123, np.dtype(np.uint32): 5125}[arr.dtype]
    views.append(arr.tobytes()); j['bufferViews'].append({'buffer': 0, 'byteLength': len(views[-1]), 'target': target})
    a_['bufferView'] = len(j['bufferViews']) - 1; a_['count'] = len(arr)
    if 'min' in a_: a_['min'] = arr.min(0).tolist(); a_['max'] = arr.max(0).tolist()
    j['accessors'].append(a_); return len(j['accessors']) - 1
img = j['images'][0]; tex = Image.open(io.BytesIO(views[img['bufferView']])).convert('RGB'); W, H = tex.size
body = next(n for n in j['nodes'] if n['name'] == 'Body')
p = next(p for p in j['meshes'][body['mesh']]['primitives'] if j['materials'][p['material']].get('pbrMetallicRoughness', {}).get('baseColorTexture'))
attrs = {k: read(v) for k, v in p['attributes'].items()}; I = read(p['indices']).ravel().reshape(-1, 3)
P, N, U = attrs['POSITION'], attrs['NORMAL'], attrs['TEXCOORD_0']
def panel(t):  # the same rule as roadcar.js assignPanel, on the face's own normal (the game may rebuild normals)
    v = P[I[t]]; n = np.cross(v[1] - v[0], v[2] - v[0]); n = n / (np.linalg.norm(n) or 1)
    if np.dot(n, N[I[t]].sum(0)) < 0: n = -n
    x = P[I[t], 0].mean()
    if n[1] > 0.55: return 'top'
    if abs(n[2]) > 0.6 and abs(n[2]) > abs(n[0]): return 'front' if n[2] > 0 else 'rear'
    return 'sideL' if ((n[0] > 0) if abs(n[0]) > 0.2 else x >= 0) else 'sideR'
names = [panel(t) for t in range(len(I))]
owner, pair = {}, {}
for t in range(len(I)):
    m = Image.new('L', (W, H)); ImageDraw.Draw(m).polygon([(float(U[i, 0]) * W, float(U[i, 1]) * H) for i in I[t]], fill=255)
    ys, xs = np.nonzero(np.array(m.filter(ImageFilter.MinFilter(3))))   # interiors: touching edges don't count
    for k in zip(ys.tolist(), xs.tolist()):
        prev = owner.setdefault(k, [])
        for o in prev:
            if names[o] != names[t]: pair[(o, t)] = pair.get((o, t), 0) + 1
        prev.append(t)
# who moves: in a top/side vs nose/tail clash the nose/tail face (the photo sees the top / side squarely); left vs right:
# the right-side face
rank = {'top': 0, 'sideL': 1, 'sideR': 2, 'front': 3, 'rear': 3}
move = sorted({(a if rank[names[a]] > rank[names[b]] else b) for (a, b), c in pair.items() if c >= 20})
print('moving', len(move), 'faces:', [names[t] for t in move])
# shelf-pack their uv boxes (2 px padding) into the blank corner (the top-left white area of the texture)
area = (0, 0, int(W * 0.39), int(H * 0.24)); pad = 2; x, y, rowh = area[0] + pad, area[1] + pad, 0
newU = {}; ext = []
for t in move:
    uv = U[I[t]] * [W, H]; x0, y0 = np.floor(uv.min(0)).astype(int) - pad; x1, y1 = np.ceil(uv.max(0)).astype(int) + pad
    w, h = x1 - x0, y1 - y0
    if x + w > area[2]: x, y, rowh = area[0] + pad, y + rowh + pad, 0
    assert y + h <= area[3], 'blank corner is full'
    tex.paste(tex.crop((x0, y0, x1, y1)), (x, y))
    newU[t] = (uv - [x0, y0] + [x, y]) / [W, H]; x += w + pad; rowh = max(rowh, h)
# every moved face gets 3 vertices of its own
for t in move:
    base = len(attrs['POSITION'])
    for k in attrs: attrs[k] = np.concatenate([attrs[k], attrs[k][I[t]]])
    attrs['TEXCOORD_0'][base:base + 3] = newU[t]; I[t] = [base, base + 1, base + 2]
for k, arr in attrs.items(): p['attributes'][k] = add(arr.astype(np.float32) if arr.dtype != np.float32 else arr, p['attributes'][k], 34962)
p['indices'] = add(I.reshape(-1, 1).astype(np.uint16 if len(attrs['POSITION']) < 65536 else np.uint32), p['indices'], 34963)
jb = io.BytesIO(); tex.save(jb, 'JPEG', quality=90); views[img['bufferView']] = jb.getvalue(); img['mimeType'] = 'image/jpeg'
# repack: only the buffer views something uses, then the accessors something uses
used = set()
for m in j['meshes']:
    for q in m['primitives']: used |= set(q['attributes'].values()) | {q['indices']}
amap = {o: n for n, o in enumerate(sorted(used))}; j['accessors'] = [j['accessors'][o] for o in sorted(used)]
for m in j['meshes']:
    for q in m['primitives']: q['attributes'] = {k: amap[v] for k, v in q['attributes'].items()}; q['indices'] = amap[q['indices']]
refs = sorted({a_['bufferView'] for a_ in j['accessors']} | {im['bufferView'] for im in j['images']}); vmap = {o: n for n, o in enumerate(refs)}
for a_ in j['accessors']: a_['bufferView'] = vmap[a_['bufferView']]
for im in j['images']: im['bufferView'] = vmap[im['bufferView']]
j['bufferViews'] = [j['bufferViews'][o] for o in refs]; views = [views[o] for o in refs]
data = b''
for bv, v in zip(j['bufferViews'], views):
    data += b'\0' * ((4 - len(data) % 4) % 4); bv['byteOffset'] = len(data); bv['byteLength'] = len(v); bv.pop('byteStride', None); data += v
data += b'\0' * ((4 - len(data) % 4) % 4); j['buffers'] = [{'byteLength': len(data)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(data)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(data), 0x004E4942) + data)
print('wrote', out, 28 + len(js) + len(data), 'bytes')
