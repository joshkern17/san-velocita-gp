# Honda Civic EK: your Blender export -> the game's car. Usage: python3 tools/cars/civic.py models/Civic_Model.glb models/cars/civic.glb
#   then: node tools/cars/uvrepair.mjs <out.glb>   (livery texels of its own for every face; see docs/CAR-MODELS.md)
# - real size: the export is ~6% big (4.44 m long, 1.45 m tall); scaled to a real EK hatch's 4.18 m (which also gives
#   its 1.36 m height), centred on the wheels across (the export sits 2.7 cm to the left)
# - Light_Front -> Light_Head (the game's lamp name)
# - the rear spoiler: its material had no texture (a flat 80% grey), so it couldn't take the paint. It gets the body
#   texture, laid flat (from above) on a white patch of its own in an unused corner, so the livery paints it like the
#   rest of the body (its UVs onto the roof would share the roof's texels: it would show the roof's paint, not its own)
# - textures -> JPEG
import json, struct, sys, io, numpy as np
from PIL import Image
src, out = sys.argv[1:3]
K = 4.18 / 4.44                       # real EK hatch length / the export's
CX = (0.733 + -0.679) / 2             # wheel centres across (left +X, right -X)
PATCH = (60, 20, 580, 110)            # the spoiler's white patch in the body texture (pixels: x0, y0, x1, y1)

f = open(src, 'rb').read(); jl = struct.unpack_from('<I', f, 12)[0]; j = json.loads(f[20:20 + jl]); bin_ = f[20 + jl + 8:]
views = [bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']] for bv in j['bufferViews']]
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(i):
    a_ = j['accessors'][i]; bv = j['bufferViews'][a_['bufferView']]; n = NC[a_['type']]
    return np.frombuffer(views[a_['bufferView']], dtype=CT[a_['componentType']], count=a_['count'] * n, offset=a_.get('byteOffset', 0)).reshape(a_['count'], n).copy()

for n in j['nodes']:
    if n['name'] == 'Light_Front': n['name'] = 'Light_Head'
    t = n.get('translation', [0, 0, 0]); n['translation'] = [(t[0] - CX) * K, t[1] * K, t[2] * K]
    n['scale'] = [s * K for s in n.get('scale', [1, 1, 1])]

body_mat = next(i for i, m in enumerate(j['materials']) if m['name'] == 'Material')
tex_img = j['textures'][j['materials'][body_mat]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
body = next(n for n in j['nodes'] if n['name'] == 'Body')
spoiler = next(p for p in j['meshes'][body['mesh']]['primitives'] if j['materials'][p['material']]['name'] == 'Material.003')
P = read(spoiler['attributes']['POSITION']); lo, hi = P.min(0), P.max(0)
img = Image.open(io.BytesIO(views[j['images'][tex_img]['bufferView']])).convert('RGB'); W, H = img.size
x0, y0, x1, y1 = PATCH
U = np.stack([(x0 + (P[:, 0] - lo[0]) / (hi[0] - lo[0]) * (x1 - x0)) / W, (y0 + (P[:, 2] - lo[2]) / (hi[2] - lo[2]) * (y1 - y0)) / H], 1).astype(np.float32)
views.append(U.tobytes()); j['bufferViews'].append({'buffer': 0, 'byteLength': len(views[-1]), 'target': 34962})
a_ = dict(j['accessors'][spoiler['attributes']['TEXCOORD_0']]); a_.pop('byteOffset', None)
a_.update(bufferView=len(j['bufferViews']) - 1, min=U.min(0).tolist(), max=U.max(0).tolist()); j['accessors'].append(a_)
spoiler['attributes']['TEXCOORD_0'] = len(j['accessors']) - 1; spoiler['material'] = body_mat
img.paste((236, 236, 236), (x0 - 4, y0 - 4, x1 + 4, y1 + 4))   # (plain white paint; a margin against bleed)

for k, im in enumerate(j['images']):
    pic = img if k == tex_img else Image.open(io.BytesIO(views[im['bufferView']])).convert('RGB')
    o = io.BytesIO(); pic.save(o, 'JPEG', quality=88); views[im['bufferView']] = o.getvalue(); im['mimeType'] = 'image/jpeg'

data = b''
for bv, v in zip(j['bufferViews'], views):
    data += b'\0' * ((4 - len(data) % 4) % 4); bv['byteOffset'] = len(data); bv['byteLength'] = len(v); data += v
data += b'\0' * ((4 - len(data) % 4) % 4); j['buffers'] = [{'byteLength': len(data)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open(out, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(data)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(data), 0x004E4942) + data)
print('wrote', out, 28 + len(js) + len(data), 'bytes')
