# Turn a car's painted texture white (keeping its shading), so the livery/paint editor starts from a white car.
#   Blender -b -P tools/cars/whiten.py -- <in.glb> <out.glb>
# The paint = the most common strongly coloured hue in the textures (as roadcar.js finds it); every texel within
# ~25 degrees of that hue and saturated enough becomes a grey whose brightness follows the texel's value, scaled so
# the typical paint texel lands at ~232 (white, with the photo's highlights and shadows kept).
import bpy, sys, numpy as np, colorsys
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

def hsv(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    mx, mn = px[..., :3].max(-1), px[..., :3].min(-1); d = mx - mn + 1e-9
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, np.where(mx > 0, (mx - mn) / (mx + 1e-9), 0), mx

ims = [im for im in bpy.data.images if im.size[0] > 0]
bins = np.zeros(36)
for im in ims:
    px = np.array(im.pixels[:]).reshape(-1, 4); h, s, v = hsv(px)
    m = (s > 0.35) & (v > 0.15); bins += np.bincount((h[m] * 36).astype(int) % 36, minlength=36)
best = int(bins.argmax()); hue = (best + 0.5) / 36
print('paint hue', round(hue * 360), 'deg')
for im in ims:
    px = np.array(im.pixels[:]).reshape(-1, 4); h, s, v = hsv(px)
    dh = np.abs(((h - hue) + 0.5) % 1 - 0.5)
    m = (dh < 25 / 360) & (s > 0.3) & (v > 0.12)
    if m.sum() < 0.02 * len(px): continue
    ref = np.percentile(v[m], 75)
    g = np.clip(v[m] / ref * 0.91, 0, 1)
    # (sRGB in the pixels: keep it a neutral grey)
    px[m, 0] = g; px[m, 1] = g; px[m, 2] = g
    im.pixels[:] = px.ravel(); im.pack()
    print('whitened', im.name, f'{100 * m.mean():.0f}% of texels')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_image_format='AUTO',
    export_cameras=False, export_lights=False, use_selection=False)
print('exported', out)
