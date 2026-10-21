# Nissan Skyline GT-R (R34): your Blender export -> the game's car. Usage:
#   python3 tools/cars/r34.py models/R34-Skyline_002.glb models/cars/r34.glb
#   then: node tools/cars/uvrepair.mjs <out.glb>   (livery texels of its own for every face; see docs/CAR-MODELS.md)
# - already at real size (4.60 m long, 1.79 m wide, 2.67 m wheelbase, as the real car); centred on the wheels across
#   (the export sits 3 mm to the left)
# - the rear wing: its material had no texture (a flat white), so it couldn't take the paint. It gets the body texture,
#   laid flat (from above) on a white patch of its own in the sheet's empty top-left corner, so the livery paints it
#   like the rest of the body
# - textures -> JPEG (the PNG sheet is 1.3 MB)
import json, struct, sys, io, numpy as np
from PIL import Image
src, out = sys.argv[1:3]
CX = (0.70397 + -0.69723) / 2         # wheel centres across (left +X, right -X)
PATCH = (40, 30, 480, 140)            # the wing's white patch in the body texture (pixels: x0, y0, x1, y1)

f = open(src, 'rb').read(); jl = struct.unpack_from('<I', f, 12)[0]; j = json.loads(f[20:20 + jl]); bin_ = f[20 + jl + 8:]
views = [bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']] for bv in j['bufferViews']]
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(i):
    a_ = j['accessors'][i]; n = NC[a_['type']]
    return np.frombuffer(views[a_['bufferView']], dtype=CT[a_['componentType']], count=a_['count'] * n, offset=a_.get('byteOffset', 0)).reshape(a_['count'], n).copy()

for n in j['nodes']:
    t = n.get('translation', [0, 0, 0]); n['translation'] = [t[0] - CX, t[1], t[2]]

body_mat = next(i for i, m in enumerate(j['materials']) if m['name'] == 'Liver')
tex_img = j['textures'][j['materials'][body_mat]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
body = next(n for n in j['nodes'] if n['name'] == 'Body')
wing = next(p for p in j['meshes'][body['mesh']]['primitives'] if j['materials'][p['material']]['name'] == 'White')
P = read(wing['attributes']['POSITION']); lo, hi = P.min(0), P.max(0)
img = Image.open(io.BytesIO(views[j['images'][tex_img]['bufferView']])).convert('RGB'); W, H = img.size
x0, y0, x1, y1 = PATCH
U = np.stack([(x0 + (P[:, 0] - lo[0]) / (hi[0] - lo[0]) * (x1 - x0)) / W, (y0 + (P[:, 2] - lo[2]) / (hi[2] - lo[2]) * (y1 - y0)) / H], 1).astype(np.float32)
views.append(U.tobytes()); j['bufferViews'].append({'buffer': 0, 'byteLength': len(views[-1]), 'target': 34962})
a_ = dict(j['accessors'][wing['attributes']['TEXCOORD_0']]); a_.pop('byteOffset', None)
a_.update(bufferView=len(j['bufferViews']) - 1, min=U.min(0).tolist(), max=U.max(0).tolist()); j['accessors'].append(a_)
wing['attributes']['TEXCOORD_0'] = len(j['accessors']) - 1; wing['material'] = body_mat
img.paste((236, 236, 236), (x0 - 4, y0 - 4, x1 + 4, y1 + 4))   # (plain white paint; a margin against bleed)

# the windscreen and rear glass: their photo has light grey glare, which the livery reads as paint, so a stripe over
# the bonnet carried on across the glass. Glass faces = sloped (not the roof or bonnet) and mostly dark in the photo;
# their glare texels (mid greys) that no other face uses are darkened to glass. Near-white texels stay as they are:
# where the mesh's glass reaches past the photo's frame (the windscreen's corners) they're body, as in Blender, and
# darkening them drew flat grey wedges and a ragged fringe round the glass
from PIL import ImageDraw
prim = next(p for p in j['meshes'][body['mesh']]['primitives'] if p['material'] == body_mat)
Np, Up, Ip = read(prim['attributes']['NORMAL']), read(prim['attributes']['TEXCOORD_0']), read(prim['indices']).ravel()
A = np.asarray(img).astype(np.float32); Lum = (A.max(2) + A.min(2)) / 510
glass, other, paint = Image.new('L', (W, H)), Image.new('L', (W, H)), Image.new('L', (W, H)); dg, do, dp = ImageDraw.Draw(glass), ImageDraw.Draw(other), ImageDraw.Draw(paint)
for t in range(0, len(Ip), 3):
    k = Ip[t:t + 3]; n = Np[k].mean(0); n /= np.linalg.norm(n) + 1e-9
    poly = [(Up[q, 0] * W, Up[q, 1] * H) for q in k]
    m = Image.new('L', (W, H)); ImageDraw.Draw(m).polygon(poly, fill=1); M = np.asarray(m) > 0
    (dg if 0.25 < n[1] < 0.97 and M.sum() >= 20 and Lum[M].mean() < 0.42 else do).polygon(poly, fill=1)
    if M.sum() and Lum[M].mean() > 0.6: dp.polygon(poly, fill=1)   # (mostly paint)
# (and nothing within 2 px of a painted face: the polygon fills don't quite meet the faces next door, and the body's
# filtering reads those edge texels)
from PIL import ImageFilter
near = np.asarray(paint.filter(ImageFilter.MaxFilter(5))) > 0
G = (np.asarray(glass) > 0) & ~(np.asarray(other) > 0) & ~near & (Lum > 0.3) & (Lum < 0.8)
A[G] *= (0.3 / Lum[G])[:, None]
img = Image.fromarray(A.clip(0, 255).astype(np.uint8))

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
