// Real circuits: where each one is and how to pick its layout out of OpenStreetMap.
//   guide:    { f1: '<name in f1-circuits.json>' } follows that outline (picks the right layout among many), or
//             { points: [[lat, lon], ...] } waypoints in driving order (the first one is the start line)
//   outline:  true: the guide's outline is the layout as it is (the map's roads don't trace this layout)
//   roads:    Overpass filter for the roads the layout runs on (raceway for circuits, real roads for street / touge)
//   skip:     names of ways never to drive on (pit lanes, kart tracks, other layouts)
//   skipIds:  OSM way ids never to drive on (unnamed alternative lines)
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
//   geo:      [lat, lon] the track's frame pinned (else the layout's middle): what's laid out in it (landmarks, stands,
//             runoff) stays put when the line is edited
//   lap:      a measured lap file (tools/tracks/ref/<id>.lap.json: { pts: [{ lat, lon, w }] }, start line first) used
//             as the layout as it is, centre line and widths (a layout the map doesn't have: measured off a reference)
//   own:      true: a circuit made by hand in the editor (tracks/real/<id>.json is the file itself, kept as made): the
//             build never bakes it from the map, only lists it
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
    clean: { minInner: 6, maxMove: 9 }, // (La Source drawn as a point on the map: rounded, more than the usual 4.5 m)
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
    // the classic layout (no chicanes): the Spec Miata Club's home circuit
    id: 'limerock', name: 'Lime Rock Park', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · a mile and a half in the Connecticut woods: Big Bend, the Uphill, West Bend and the blind Diving Turn onto the straight',
    guide: { points: [[41.92968, -73.38440], [41.92683, -73.37803], [41.92625, -73.38152], [41.92530, -73.38420], [41.92600, -73.38720], [41.92820, -73.38845], [41.92975, -73.38620]] },
    roads: RACEWAY, skip: /pit|chicane|autocross|skidpad|kart|paddock/i, width: 10,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 5, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1957 } },
    scatter: { mix: 'mixed', r: 70, d: 0.3 },
  },
  {
    // the full course (the chicane at 10a/10b, the bridge over the run down to 12): GT2's home in the north Georgia hills
    id: 'roadatlanta', name: 'Road Atlanta', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · the Esses climb and fall through the Georgia pines, then the long back straight dives under the bridge',
    guide: { points: [[34.1504, -83.81426], [34.1488, -83.81124], [34.14694, -83.81064], [34.14509, -83.81209], [34.14337, -83.81373], [34.13981, -83.81654], [34.13615, -83.81813], [34.1413, -83.81839], [34.14617, -83.81846], [34.15018, -83.81726]] },
    roads: RACEWAY, skip: /pit|club|short|motorcycle|kart|repair/i, skipIds: [396643998, 396644002], width: 12,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 4, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1970 } },
    scatter: { mix: 'mixed', r: 80, d: 0.25 },
  },
  {
    // the long course with the Boot, and the Inner Loop (since 1975): the Ninety, the Esses, the back straight, the Boot
    id: 'watkinsglen', name: 'Watkins Glen', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · the Ninety, the Esses, the Inner Loop and the Boot, in the hills above Seneca Lake',
    guide: { points: [[42.3410, -76.92882], [42.34423, -76.92765], [42.34239, -76.92354], [42.33841, -76.92067], [42.33371, -76.92043], [42.33173, -76.92036], [42.33221, -76.92464], [42.32934, -76.92622], [42.33380, -76.92837], [42.33354, -76.92519], [42.33649, -76.92483], [42.33719, -76.92610]] },
    roads: RACEWAY, skip: /pit|short course/i, skipIds: [343460633], width: 12,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1948 } },
    scatter: { mix: 'mixed', r: 80, d: 0.25 },
  },
  {
    // Big Willow, the 2.5-mile road course (1953), clockwise: the long front straight, the fast sweepers of Turns 8 and 9
    id: 'willow', name: 'Willow Springs', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · the fastest road in the West: nine turns over the Mojave hills, finishing with the flat-out sweepers of 8 and 9',
    guide: { points: [[34.87101, -118.26276], [34.87252, -118.26552], [34.87224, -118.26799], [34.87061, -118.27052], [34.87292, -118.27107], [34.87426, -118.26828], [34.87615, -118.26835], [34.87466, -118.26613], [34.87478, -118.26315], [34.87393, -118.26017], [34.87293, -118.25739], [34.87031, -118.25681], [34.86902, -118.25911], [34.87050, -118.26185]] },
    roads: RACEWAY, skip: /streets|horse thief|kart|speedway|stadium|autocross|pit/i, skipIds: [10412884, 34365657], width: 12,
    env: { theme: 'desert', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'desert', seed: 1953 } },
    scatter: { mix: 'desert', r: 90, d: 0.12 },
  },
  {
    // the main circuit (1969), clockwise
    id: 'summitpoint', name: 'Summit Point', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · two miles in the West Virginia countryside: club racing\'s East Coast home, short, quick and technical',
    guide: { points: [[39.23459, -77.96931], [39.23203, -77.97044], [39.23116, -77.97210], [39.23373, -77.97100], [39.23596, -77.97196], [39.23813, -77.97394], [39.23890, -77.97565], [39.24068, -77.97373], [39.24044, -77.97062], [39.23900, -77.96770], [39.23642, -77.96853]] },
    roads: RACEWAY, skip: /jefferson|shenn?andoah|kart|pit/i, skipIds: [471472805, 471472806, 471473072, 471488564, 954901941, 954901942, 954901943, 954901944, 1151047161, 1151047162, 1151047163, 1151047164, 1151047165, 1151047166], width: 11,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 4, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1969 } },
    scatter: { mix: 'mixed', r: 80, d: 0.25 },
  },
  {
    // the East course (1993): the home of the 25 Hours
    id: 'thunderhill', name: 'Thunderhill', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · three miles of the Sacramento Valley: blind crests, the long front straight and the 25 Hours, where small cars go all night',
    guide: { points: [[39.54024, -122.33119], [39.53753, -122.33117], [39.53603, -122.32893], [39.53690, -122.32665], [39.53828, -122.32949], [39.54068, -122.32916], [39.54261, -122.32910], [39.54464, -122.32997], [39.54497, -122.33338], [39.54307, -122.33586], [39.54071, -122.33565], [39.53802, -122.33508], [39.53936, -122.33284], [39.54213, -122.33279], [39.54381, -122.33176], [39.54132, -122.33120]] },
    roads: RACEWAY, skip: /pit|bypass/i, skipIds: [756822998, 756822999, 756823000, 1016088342, 892530996, 892530998, 44958782, 969660090], width: 12,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'meadow', seed: 1993 } },
    scatter: { mix: 'meadow', r: 90, d: 0.15 },
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
    // the full Grand Prix circuit (2012), anticlockwise: the climb to Turn 1, the esses, the long back straight, the
    // stadium section and the triple-apex Turn 16-18 round the observation tower. Tilke's paved runoff all round.
    id: 'cota', name: 'Circuit of the Americas', country: 'USA', category: 'gp',
    dem: 'usgs',
    desc: 'Grand Prix · Austin, Texas: up the wall to the Turn 1 hairpin, the fast esses, the long back straight and the triple-apex right round the tower',
    guide: { f1: 'Circuit of the Americas' }, roads: RACEWAY, skip: PIT, width: 15,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, runoffStyle: 'paved', edgeLine: 'band', edgeColor: '#c8102e', pitStyle: 'modern', barrier: 'armco', fenceH: 2.8, setting: { kind: 'none', flora: 'mixed', seed: 2012 } },
    scatter: { mix: 'meadow', r: 90, d: 0.12 },
  },
  {
    // the 12 Hours circuit (17 turns), on the old Hendricks Field airfield, clockwise from the start line by the pits:
    // Turn 1's kink, Gurney Bend, the Hairpin, Fangio, Cunningham, Collier, Tower Turn, Bishop and Gendebien bends,
    // the Le Mans Curve, the Ullman Straight and Sunset Bend (Turn 17) back onto the front straight. Waypoints from
    // the map's raceway chain (its ways tagged concrete: the runway slabs)
    id: 'sebring', name: 'Sebring International Raceway', country: 'USA', category: 'classic',
    dem: 'usgs',
    desc: 'Classic · Florida\'s old airfield: bumpy runway concrete, the Hairpin, Cunningham and Tower Turn, then the long, fast Sunset Bend onto the front straight',
    guide: { points: [[27.45023, -81.35214], [27.45256, -81.34871], [27.45409, -81.35138], [27.45263, -81.35623], [27.45512, -81.35528], [27.45639, -81.35105], [27.45479, -81.34788], [27.45062, -81.34613], [27.44828, -81.35519], [27.45022, -81.35518]] },
    roads: RACEWAY, skip: /pit|club|short|kart|paddock/i, skipIds: [1041888711, 1041893718, 1041893719, 1041893720, 1041893721, 1315957542, 1315190275], width: 14,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, pitStyle: 'classic', barrier: 'concrete', fenceH: 2.8, setting: { kind: 'none', flora: 'subtropic', seed: 1950 } },
    scatter: { mix: 'subtropic', r: 80, d: 0.1 },
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
    desc: 'Road course · the Brickyard\'s infield circuit: Turn 1 off the front straight, the Hulman straight, the short chute and the Turn 13 complex inside the oval',
    guide: { f1: 'Indianapolis Motor Speedway' }, lap: 'indy', geo: [39.794157, -86.236038], photoFit: false, roads: RACEWAY, skip: PIT, width: 14,
    env: { theme: 'grass', time: 'day', weather: 'clear', laps: 3, opponents: 11, setting: { kind: 'none', flora: 'mixed', seed: 1909 } },
    scatter: { mix: 'mixed', r: 60, d: 0.06 },
  },
  {
    // (the user's own, drawn in the editor and fitted to the map's roads + the real start, pits and stands, 2026-10-27;
    // the hillside sign: tools/tracks/landmarks/panorama_sign.py)
    id: 'panorama', name: 'Mount Panorama', country: 'Australia', category: 'classic', own: true,
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
