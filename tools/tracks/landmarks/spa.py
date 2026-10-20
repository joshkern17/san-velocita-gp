# Spa-Francorchamps's landmarks, in the game's PS1-plus style, where the real ones stand (the map's outlines, measured
# against the road: tools/tracks/landmarks/places.mjs -> spa-layout.json): the old Hôtel de l'Eau Rouge and the Salons
# at the bottom of Eau Rouge, the conciergerie, the old customs house (the Ancienne douane, by Raidillon), the old pits
# down the hill from La Source, and the Hôtel de la Source above the hairpin. The grandstands are the trackside pack's
# (lines along the real stands' fronts, in the layout). Recognisable, not exact.
#   /opt/homebrew/bin/python3.13 tools/tracks/landmarks/spa-art.py   (the printed art, once)
#   node --import ./tools/tracks/three-hook.mjs tools/tracks/landmarks/places.mjs spa
#   Blender -b --python-exit-code 1 --python tools/tracks/landmarks/spa.py -- [--blend]
#   node tools/tracks/landmarks.mjs spa
import os, sys, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lmkit as K
importlib.reload(K)
args = K.setup('spa', seed=1921)
M = K.M
L = json.load(open(os.path.join(K.HERE, 'spa-layout.json')))

# ---------------- materials ----------------
win_cream = K.windows('Sp_WinCream', (0.86, 0.83, 0.74), shutters=(0.16, 0.3, 0.2))
win_stone = K.windows('Sp_WinStone', (0.5, 0.48, 0.44), frame=(0.84, 0.84, 0.8), w=0.36, h=0.46)
win_hotel = K.windows('Sp_WinHotel', (0.9, 0.88, 0.82), frame=(0.3, 0.3, 0.32), w=0.5, h=0.55, sill=0.22)
glass = K.curtain('Sp_Glass', (0.16, 0.22, 0.28), (0.18, 0.19, 0.2), cols=3, rows=1)
glass_lo = K.curtain('Sp_GlassLow', (0.2, 0.3, 0.34), (0.2, 0.21, 0.22), cols=2, rows=1)
clad = K.grimy_tile('Sp_Clad', 'metal_plate_02.png', dirt=0.25, tint=(0.3, 0.31, 0.33))
signs = {k: K.art('sign_' + k) for k in ('spa', 'hoteleaurouge', 'eaurouge', 'douane', 'source')}
doors = [K.art(f'door_{k}', dirt=0.3) for k in range(4)]


def frame(b):
    # the building's own frame: u along its long side, v across, + towards the track
    c, s = math.cos(b['rot']), math.sin(b['rot'])
    return K.Frame(b['x'], b['z'], b['rot'], 1 if (b['to'][0] * -s + b['to'][1] * c) >= 0 else -1)


def walls(r, F, name, hw, hd, h0, h1, mat, bay, sides=('front', 'back', 'left', 'right')):
    for sd in sides: K.wall_f(r, f'{name}_{sd}', F, sd, -hw, hw, -hd, hd, h0, h1, mat, u=bay)


# the old Hôtel de l'Eau Rouge: a white rendered house, two floors and an attic under slate, green shutters, its
# name across the front between the floors
def hotel_eaurouge(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'body', F, -hw, hw, -hd, hd, 0, 6.6, M['cream'])
    for k, (h0, h1) in enumerate(((0.4, 3.2), (3.6, 6.4))): walls(r, F, f'win{k}', hw, hd, h0, h1, win_cream, 3.0)
    K.wall_f(r, 'name', F, 'front', -hw * 0.7, hw * 0.7, -hd, hd + 0.05, 3.1, 3.7, signs['hoteleaurouge'])
    K.gable_f(r, 'roof', F, -hw, hw, -hd, hd, 6.6, 4.2, M['slate'])


# the Salons de l'Eau Rouge: a modern hospitality block, glazed ground floor, dark cladding over, a roof terrace
# with its rail, EAU ROUGE across the parapet facing the track
def salons(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'base', F, -hw, hw, -hd, hd, 0, 4.2, M['concrete_d'])
    walls(r, F, 'glass', hw, hd, 0.2, 4.0, glass_lo, 2.0)
    K.box_f(r, 'upper', F, -hw - 0.6, hw + 0.6, -hd - 0.6, hd + 0.6, 4.2, 8.4, clad)
    walls(r, F, 'band', hw + 0.6, hd + 0.6, 5.6, 7.4, glass, 2.0)
    K.box_f(r, 'roof', F, -hw - 0.6, hw + 0.6, -hd - 0.6, hd + 0.6, 8.4, 8.7, M['roof'])
    K.wall_f(r, 'sign', F, 'front', -10, 10, -hd - 0.6, hd + 0.7, 8.7, 10.6, signs['eaurouge'])
    for k, sd in enumerate(('back', 'left', 'right')): K.wall_f(r, f'rail{k}', F, sd, -hw - 0.6, hw + 0.6, -hd - 0.6, hd + 0.6, 8.7, 9.8, M['railing'], u=1.2)


# a small stone lodge under slate (the conciergerie)
def lodge(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'body', F, -hw, hw, -hd, hd, 0, 3.6, M['stone'])
    walls(r, F, 'win', hw, hd, 0.5, 3.2, win_stone, 3.5, ('front', 'back'))
    K.gable_f(r, 'roof', F, -hw, hw, -hd, hd, 3.6, 3.0, M['slate'])


# the Ancienne douane: the old Belgian customs house by the old road at Raidillon, grey stone, two floors under a
# steep slate roof, DOUANE over the door
def douane(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'body', F, -hw, hw, -hd, hd, 0, 6.4, M['stone'])
    for k, (h0, h1) in enumerate(((0.4, 3.1), (3.4, 6.1))): walls(r, F, f'win{k}', hw, hd, h0, h1, win_stone, 3.2, ('front', 'back'))
    K.wall_f(r, 'sign', F, 'front', -2.2, 2.2, -hd, hd + 0.06, 3.0, 3.7, signs['douane'])
    K.gable_f(r, 'roof', F, -hw, hw, -hd, hd, 6.4, 4.6, M['slate'], over=0.6)
    K.box_f(r, 'chimney', F, hw * 0.6, hw * 0.6 + 1.0, -0.5, 0.5, 8.0, 12.2, M['brick'])


# the old pits, down the hill from La Source: a long two-storey block, the garages' roll-up doors along the ground
# floor towards the track, glazed hospitality over with a rail along the roof, SPA-FRANCORCHAMPS on the roof
def pits_old(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'ground', F, -hw, hw, -hd, hd, 0, 4.4, M['concrete'])
    n = int(2 * hw // 6)
    for k in range(n):
        u0 = -hw + k * (2 * hw / n) + 0.6; u1 = u0 + 2 * hw / n - 1.2
        K.wall_f(r, f'door{k}', F, 'front', u0, u1, -hd, hd, 0.0, 3.8, doors[k % 4])
    K.box_f(r, 'upper', F, -hw, hw, -hd + 1.5, hd, 4.4, 8.0, clad)
    K.wall_f(r, 'band', F, 'front', -hw, hw, -hd + 1.5, hd, 4.9, 7.6, glass, u=2.0)
    K.box_f(r, 'roof', F, -hw - 0.3, hw + 0.3, -hd + 1.2, hd + 0.3, 8.0, 8.3, M['roof'])
    K.wall_f(r, 'rail', F, 'front', -hw, hw, -hd + 1.5, hd + 0.3, 8.3, 9.4, M['railing'], u=1.2)
    # (the name on a frame over the roof, at the middle)
    K.wall_f(r, 'sign', F, 'front', -24, 24, -hd + 2, hd - 1, 9.6, 12.6, signs['spa'])
    for k, u in enumerate((-23, -8, 8, 23)):
        x, z = F.at(u, hd - 1.2); K.rodv(r, f'post{k}', (x, z, 8.3), (x, z, 12.8), 0.12, M['steel'])


# the Hôtel de la Source, up the hill behind the hairpin: four floors of windows under a slate roof, its name across
# the front
def hotel_source(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'body', F, -hw, hw, -hd, hd, 0, 12.4, M['cream'])
    for k in range(4): walls(r, F, f'win{k}', hw, hd, 0.4 + k * 3.0, 3.2 + k * 3.0, win_hotel, 3.6)
    K.gable_f(r, 'roof', F, -hw, hw, -hd, hd, 12.4, 5.0, M['slate'])
    K.wall_f(r, 'name', F, 'front', -16, 16, -hd, hd + 0.4, 12.6, 14.4, signs['source'])


BUILD = {'hotel_eaurouge': hotel_eaurouge, 'salons': salons, 'lodge': lodge, 'douane': douane, 'pits_old': pits_old, 'hotel_source': hotel_source}
for b in L['buildings']: BUILD[b['as']](b)
STANDS = [{'pts': s['pts'], 'f': s['f'], 'fam': s['fam']} for s in L['stands']]
K.finish('spa', STANDS, args=args)
