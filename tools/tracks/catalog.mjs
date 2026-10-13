// Real circuits: where each one is and how to pick its layout out of OpenStreetMap.
//   guide:    { f1: '<name in f1-circuits.json>' } follows that outline (picks the right layout among many), or
//             { points: [[lat, lon], ...] } waypoints in driving order (the first one is the start line)
//   outline:  true: the guide's outline is the layout as it is (the map's roads don't trace this layout)
//   roads:    Overpass filter for the roads the layout runs on (raceway for circuits, real roads for street / touge)
//   skip:     names of ways never to drive on (pit lanes, kart tracks, other layouts)
//   width:    default road width (m); widths: { 'way name': m } overrides
//   scatter:  { mix, r, d } a Nature-brush stroke along the whole lap where the map has no trees (FLORA mixes in scenery.js)
//   startBefore: { name, m } start line m metres before the section with that name
//   sea:      coastal: the sea is drawn at sea level
//   dem:      where the road's real (laser-scanned) ground heights come from: wallonia | ign | gsi | usgs | ahn (dem.mjs)
//   photo:    open aerial photos the runoff's surfaces are read from (paved / gravel / grass): wallonia (surface.mjs)
//   photoFit: false to keep OSM's centre line and widths (else where the country has open aerial photos, the road is
//             moved to the middle of the edges they show and takes their width: photofit.js)
//   camber:   false to keep the road level across; true to measure it from gsi's 5 m model anyway (build.mjs roadCamber)
//   env:      track env (time, weather, laps, setting...) merged over the defaults
//   maxGrade: the steepest the real road gets (default 0.18): the elevation data is coarse and smears hillsides
//             into the road profile, so it's fitted smooth and never steeper than this (js/terrain.js roadProfile)
// Data: © OpenStreetMap contributors (ODbL); outlines from bacinger/f1-circuits (MIT).

const RACEWAY = '["highway"="raceway"]';
const STREETS = '["highway"~"^(raceway|motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]';
const ROADS = '["highway"~"^(primary|secondary|tertiary|unclassified|primary_link|secondary_link|tertiary_link)$"]';
const PIT = /pit|box|kart|moto|support|paddock|service|garage|drift|skid|gp kurs|anbindung/i;

export const CATALOG = [
  {
    id: 'spa', name: 'Spa-Francorchamps', country: 'Belgium', category: 'gp',
    dem: 'wallonia', photo: 'wallonia',
    desc: 'Grand Prix · Eau Rouge, Raidillon and the Kemmel straight through the Ardennes forest',
    guide: { f1: 'Circuit de Spa-Francorchamps' }, roads: RACEWAY, skip: PIT, width: 13,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'pine', seed: 1925 } },
    scatter: { mix: 'pine', r: 70, d: 0.35 },
  },
  {
    id: 'suzuka', name: 'Suzuka', country: 'Japan', category: 'gp',
    dem: 'gsi',
    desc: 'Grand Prix · the figure-of-eight: the Esses, Degner, the Spoon and 130R over the crossover bridge',
    guide: { f1: 'Suzuka International Racing Course' }, roads: RACEWAY, skip: PIT, width: 13,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1962 } },
    scatter: { mix: 'meadow', r: 60, d: 0.3 },
  },
  {
    id: 'monaco', name: 'Monaco', country: 'Monaco', category: 'street',
    dem: 'ign',
    desc: 'Street · the harbour, Casino Square, the hairpin and the tunnel: barriers inches away',
    guide: { f1: 'Circuit de Monaco' }, maxGrade: 0.13, roads: STREETS, skip: /pit|parking|car park/i, width: 10, maxSnap: 40,
    startBefore: { name: 'Rond-Point Sainte-Dévote', m: 230 }, sea: true,
    env: { theme: 'city', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', seed: 1929 } },
  },
  {
    id: 'laguna', name: 'Laguna Seca', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · the Corkscrew drops five storeys in a few car lengths, in the dry Monterey hills',
    guide: { points: [[36.58423, -121.75383], [36.58176, -121.74924], [36.58454, -121.74907], [36.58652, -121.74970], [36.58696, -121.75052], [36.58281, -121.75774], [36.58316, -121.75699]] },
    roads: RACEWAY, skip: PIT, width: 12,
    env: { theme: 'desert', time: 'day', weather: 'clear', laps: 4, opponents: 9, setting: { kind: 'none', flora: 'mixed', seed: 1957 } },
    scatter: { mix: 'mixed', r: 160, d: 0.08 },
  },
  {
    id: 'zandvoort', name: 'Zandvoort', country: 'Netherlands', category: 'gp',
    dem: 'ahn',
    desc: 'Grand Prix · in the dunes by the North Sea: Tarzan, the Hugenholtz banking and the steep banked Arie Luyendyk',
    guide: { f1: 'Circuit Zandvoort' }, roads: RACEWAY, skip: PIT, width: 12,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1948 } },
    scatter: { mix: 'meadow', r: 50, d: 0.2 },
  },
  {
    id: 'madring', name: 'Madring', country: 'Spain', category: 'street',
    desc: 'Street · Madrid\'s new circuit round IFEMA and Valdebebas, with the banked La Monumental',
    guide: { f1: 'Circuito de Madring' }, outline: true, roads: STREETS, skip: /pit|parking|car park|aparcamiento/i, width: 12, maxSnap: 40,
    env: { theme: 'city', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', seed: 2026 } },
  },
  {
    id: 'indy', name: 'Indianapolis', country: 'USA', category: 'gp',
    dem: 'usgs',
    desc: 'Grand Prix · the road course inside the Brickyard, out onto the oval\'s banked Turn 1 and down its front straight',
    guide: { f1: 'Indianapolis Motor Speedway' }, outline: true, roads: RACEWAY, skip: PIT, width: 14,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1909 } },
    scatter: { mix: 'mixed', r: 60, d: 0.06 },
  },
  {
    id: 'haruna', name: 'Mt. Haruna Downhill', country: 'Japan', category: 'touge', open: true,
    dem: 'gsi',
    desc: 'Touge · point-to-point · Route 33 from Lake Haruna down to Ikaho: the hairpins Akina was drawn from',
    guide: { points: [[36.47238, 138.88464], [36.47443, 138.88720], [36.48197, 138.89623], [36.49773, 138.91287]] },
    roads: ROADS, skip: null, width: 7.5, maxSnap: 80, maxGrade: 0.11,
    env: { theme: 'grass', time: 'night', weather: 'clear', laps: 1, opponents: 1, runoff: 3, barrier: 'armco', kerbs: false, setting: { kind: 'none', flora: 'autumn', seed: 33 } },
    scatter: { mix: 'mixed', r: 60, d: 0.6 },
  },
];
