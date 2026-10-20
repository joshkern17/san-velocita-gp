# Suzuka's landmarks, in the game's PS1-plus style, where the real ones stand (the map's outlines measured against the
# road: tools/tracks/landmarks/places.mjs -> suzuka-layout.json): the Center House behind the pits and the west
# control tower; the grandstands are the trackside pack's, in lines along the real lettered stands (V1, V2, A1, B2,
# C, D5, G, Q1, Q2, S). The Ferris wheel is the map's (js/realworld.js). Recognisable, not exact.
#   /opt/homebrew/bin/python3.13 tools/tracks/landmarks/suzuka-art.py   (the printed art, once)
#   node --import ./tools/tracks/three-hook.mjs tools/tracks/landmarks/places.mjs suzuka
#   Blender -b --python-exit-code 1 --python tools/tracks/landmarks/suzuka.py -- [--blend]
#   node tools/tracks/landmarks.mjs suzuka
import os, sys, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lmkit as K
importlib.reload(K)
args = K.setup('suzuka', seed=1962)
M = K.M
L = json.load(open(os.path.join(K.HERE, 'suzuka-layout.json')))

glass = K.curtain('Sz_Glass', (0.2, 0.32, 0.42), (0.78, 0.8, 0.82), cols=3, rows=1)
glass_cab = K.curtain('Sz_Cab', (0.16, 0.24, 0.3), (0.2, 0.21, 0.22), cols=4, rows=1)
win = K.windows('Sz_Win', (0.88, 0.89, 0.9), frame=(0.6, 0.62, 0.66), w=0.6, h=0.5, sill=0.25, dirt=0.12)
signs = {k: K.art('sign_' + k, dirt=0.08) for k in ('suzuka', 'control')}


def frame(b):
    c, s = math.cos(b['rot']), math.sin(b['rot'])
    return K.Frame(b['x'], b['z'], b['rot'], 1 if (b['to'][0] * -s + b['to'][1] * c) >= 0 else -1)


def walls(r, F, name, hw, hd, h0, h1, mat, bay, sides=('front', 'back', 'left', 'right')):
    for sd in sides: K.wall_f(r, f'{name}_{sd}', F, sd, -hw, hw, -hd, hd, h0, h1, mat, u=bay)


# the Center House: a white three-storey block behind the paddock, its top floor glazed all round, SUZUKA CIRCUIT
# along the roof towards the track
def center_house(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'])
    K.box_f(r, 'body', F, -hw, hw, -hd, hd, 0, 7.2, M['white'])
    for k, (h0, h1) in enumerate(((0.5, 3.3), (3.9, 6.7))): walls(r, F, f'win{k}', hw, hd, h0, h1, win, 3.0)
    K.box_f(r, 'top', F, -hw + 1, hw - 1, -hd + 1, hd - 1, 7.2, 10.8, M['white'])
    walls(r, F, 'glass', hw - 1, hd - 1, 7.5, 10.5, glass, 2.0)
    K.box_f(r, 'roof', F, -hw + 0.6, hw - 0.6, -hd + 0.6, hd - 0.6, 10.8, 11.2, M['steel'])
    K.wall_f(r, 'sign', F, 'front', -12, 12, -hd + 0.6, hd - 0.6, 11.2, 13.4, signs['suzuka'])


# the west control tower: a concrete shaft with a glazed cab on top, a walkway rail round it, RACE CONTROL on the front
def tower(b):
    F, hw, hd = frame(b), b['hw'], b['hd']; r = K.root(b['key'], b['x'], b['z'], hw, hd, b['rot'], kind='tower')
    K.box_f(r, 'shaft', F, -hw * 0.55, hw * 0.55, -hd * 0.6, hd * 0.6, 0, 9.0, M['concrete'])
    K.box_f(r, 'deck', F, -hw, hw, -hd, hd, 9.0, 9.4, M['concrete_d'])
    K.box_f(r, 'cab', F, -hw + 0.5, hw - 0.5, -hd + 0.5, hd - 0.5, 9.4, 12.4, M['white'])
    walls(r, F, 'glass', hw - 0.5, hd - 0.5, 9.7, 12.1, glass_cab, 1.6)
    K.box_f(r, 'roof', F, -hw - 0.3, hw + 0.3, -hd - 0.3, hd + 0.3, 12.4, 12.8, M['dark'])
    for k, sd in enumerate(('front', 'back', 'left', 'right')): K.wall_f(r, f'rail{k}', F, sd, -hw, hw, -hd, hd, 9.4, 10.4, M['railing'], u=1.2)
    K.wall_f(r, 'sign', F, 'front', -hw * 0.5, hw * 0.5, -hd * 0.6, hd * 0.6, 6.6, 8.2, signs['control'])


BUILD = {'center_house': center_house, 'tower': tower}
for b in L['buildings']: BUILD[b['as']](b)
K.finish('suzuka', [{'pts': s['pts'], 'f': s['f'], 'fam': s['fam']} for s in L['stands']], args=args)
