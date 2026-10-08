# San Velocita Grand Prix

A PS2-era F1 racer with a built-in circuit designer. Low-poly, fogged-out horizons,
frame "trails", San Andreas–style menus and radar. Runs in the browser (Three.js, no install).

## Run it
- **Mac app:** double-click **`San Velocita GP.app`** — opens the game in its own window (Chrome/Edge app mode,
  or your default browser). Drag it to your Dock for one-click launching. The background server shuts itself
  down ~90 s after you close the game. If you move the game folder, run `tools/make-app.sh` to rebuild the app.
- **Mac (old way):** double-click `Play San Velocita.command` (opens http://localhost:8000)
- **Anywhere:** `python3 serve.py` then open http://localhost:8000
  (it must be served over http — opening index.html directly won't load the modules)

Chrome, Edge, Safari or Firefox. Gamepads work (Xbox/PS layout).

**Windows / sending it to a friend:** run `cd tools && npm install && node build.mjs`. That makes
`dist/San Velocita GP.html`, one self-contained file (about 1 MB) that runs straight from a double-click with no
server and no install, plus `dist/San Velocita GP.zip` (the file and a READ ME) to send. Rebuild and resend it
whenever the game changes, because online players must run the same version.

**Racing line:** a true minimum-curvature line (wide on entry, clip the apex, wide on exit), solved exactly with
the track edges as limits. The AI drives the same line. Tested against the car physics, it's 1–11% quicker per
lap than the old shortest-path line.

**AI racecraft:** AI drivers leave a car's width when alongside you, brake in time for a slower car ahead instead
of running into it, and make one move to cover the inside when you're attacking into a corner (no weaving).
In the pit lane they stay in the fast lane until just before their own box, so they no longer clip cars that are
stopped.

**AI difficulty:** Rookie, Pro, Legend, Alien. Before every race the AI runs hidden practice laps on the circuit
(including your own tracks) to learn how fast each corner can be taken; difficulty is a percentage of that limit.
Legend and Alien never slow down to let you catch up.

**Practice run plan:** in practice, the garage's Run Plan gives you a job from the engineer instead of free
running (`js/practice.js`). **Track Acclimatization**: gates on the line at each corner's braking (red), apex
(amber) and exit (green), each showing the speed to carry, taken from a clean reference lap in your car. Through
the middle at the speed is PERFECT, close is GOOD; a lap rated 70% or better does the job. Every brake point you
nail gets a marker board beside the track for the rest of the weekend (qualifying and the race too; in the World
Career a test day's count for race weekend). The gates can also be switched on from the pause menu in a time
trial, and they're out from the start on a test day.

## Rendering (post processing)
The main menu's background race uses a generated setting (town, city, Japanese streets or industrial) at dusk or night,
with the same effects as a race.

One render pipeline, built on **pmndrs/postprocessing** (`vendor/postprocessing`): scene → frame trails → **PSX Fog**
→ sun glow + violet distance tint + **god rays** (pmndrs GodRaysEffect, from a sun disc occluded by the scene) +
mipmap **bloom** + colour grade (a 3D lookup table per time of day / weather) + vignette → optional colour fringe →
**one retro stage** → **PSX CRT** (the CRT filter, and/or its film grain and scanlines on a flat screen).
All five threejs-psx-shader pieces are used, as the library's own classes (`vendor/psx`, run inside the composer by
`PSXLibPass` in js/post.js): **FogEffect** (depth fog with drifting noise), **PixelationEffect** (sets the render
resolution and crushes colour to 32 levels), **DitheringEffect** (the PS1 GPU pattern), **CRTEffect** (Options →
CRT Filter: Flat / Curved, with its scanlines, vignette and fringe; its grain is the Film Grain option) and **PSXMaterial** (vertex snapping + affine
texture warping on the world). The world renders at a low resolution (Options → Resolution: PS1 240p / 288p,
Arcade 360p, PS2 448p, HD, Native) and the canvas is upscaled crisp or soft; the HUD is HTML so it stays sharp.
- **Retro Filter**: *PSX Dither* (PixelationEffect colour crush + DitheringEffect) or *RetroPass
  Palette* (mesmotronic/three-retropass's RetroPass class, `vendor/retropass`: every pixel snapped to a hand-built "Arcade Sunset" palette of 64 / 128 / 256
  colours that keeps road, paint, sky, foliage and neon apart), or Off.
- **PSX Materials** (threejs-psx-shader, `vendor/psx`): vertex snapping to the virtual pixel grid + bounded affine
  texture warping on the world's materials (not the cars). Off / Subtle / Strong.
- **Clouds**: billboard cumulus clusters on a ring round the circuit, adapted from procedural-clouds-threejs (wrap
  lighting, subsurface glow towards the sun, darker bases, sunset colours, slow drift).
- The Options screen is grouped into Display / Retro / Effects / Racing / HUD & Sound and scrolls inside its panel.
- **Screen Look** presets: **Arcade Sunset** (default: PS2 448p soft, PSX dither, strong PSX materials, flat CRT, light grain, colour fringe, shadows, shafts, trails), **RetroPass Palette**,
  **PS2 CRT**, **Film** (HD, grain, fringe), **Light** (fast: 288p, no shadows / shafts / trails), **Effects Off**
  (bypass, for comparison), Custom.

## Soundtrack
`assets/music/t1.mp3` … `t8.mp3` play in order and then loop, in the menus and on track (js/audio.js). Options → Game → **Music**
sets their volume separately from the engines and effects (OFF stops the music). It sits in the background: fuller in the menus,
about a third of that while racing, almost silent on the grid during the start lights, with slow fades between. To change the soundtrack, replace the files
and keep the names. The single-file build can't hold 80 MB of MP3s, so `node build.mjs` puts a `music/` folder beside the HTML and in the zip.

## Atmosphere
Every race gets a colour grade and atmosphere for its time of day and weather (in the PS2 post pass, so it all
still dithers and bands): cool shadows and warm light by day, orange-and-purple dusk with the haze glowing around
the low sun, sodium-orange nights with blue shadows and mist lying low, cold grey rain. Mist gathers in low ground
and thins with height. Lights bloom (low-res, blocky, like the old consoles). In the rain, lamps and tail lights
reflect in long streaks on the wet road, cars throw up spray, and streetlights come on for a wet dusk.
- **Light shafts** break through buildings and trees towards a low sun (strongest at dusk). Options → Light Shafts.
- **Baked lighting**, PS1 style: models darken towards the ground and under ledges, and buildings, trees and props
  sit on soft contact shadows.
- **Dust in the air** drifts around you and catches the light (golden at dusk); leaves fall from nearby trees.
- **Options → Screen Look**: *PS2 CRT* (low-res, scanlines, dither), *Film* (HD, stop-motion film grain that
  flickers about 12 times a second, colour fringing at the edges), *Clean*, or *Custom*. **Film Grain** (Off / Light /
  Medium / Heavy) and **Colour Fringe** can be set on their own, with or without the CRT filters.
- **Bloom** has a tight glow that hugs bright shapes plus a faint wide halo.
- **Shadows** (Options): trees, props and buildings cast sun shadows near you (day / dusk, not in cloud or rain).

## Corner boards
Every corner that needs real braking gets **150 / 100 / 50 m** boards, measured along the lap to the corner's turn-in.
Corners are found from the track's own speed profile (the maths the AI drives by): a slow point at least ~55 km/h below
the straight before it. Each braking zone gets its own set: boards only stand after the previous corner's slowest point,
so sets never mix, and the second part of a chicane (under 70 m after the first) gets none. Boards stand on the outside of the corner, bolted to the top of the barrier on a post and arm
and leaning in over the runoff; with no barrier there, on a short post. Boards only go on the straight leading in
(never inside the previous corner) and move to the other side if the pit lane is in the way.

## Controls
| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake (hold when stopped to reverse) |
| Space (pad: A / ✕) | Handbrake: flick it to start a drift |
| A D / ← → | Steer |
| E / Q | Shift up / down (manual gearbox) |
| C | Cycle camera (chase, far chase, T-cam, nose) |
| R | Reset car to track |
| L | Racing line: full / braking only / off (gamepad: D-pad up) |
| M | Minimap zoom: close / normal / far / very far (gamepad: D-pad down) |
| Esc / P | Pause |

**Drift points** (Race Setup → *Drift Points: On*; works in races and Time Trial): slide past 12° at speed and a live
chain starts counting. Points flow faster the quicker and more sideways you are. The chain multiplier grows the longer
you hold it (+0.5 every 2 s), jumps +1 for every **transition** (flip the slide from one side to the other; both drifts must reach 25°, so a fishtail doesn't count), +0.5 for a big
angle (45°+) and there are bonuses for long drifts. Straighten up and the chain waits 1.25 s for the next drift, so
linked corners become one chain; then it banks (points × multiplier) into your total. **Crash, spin out or run off the
track and the chain is lost** (the digits fall off the screen). Your drift score and the track's drift record are on
the results screen. Scoring lives in `js/drift.js` (one scorer per car, ready for online drift battles), the HUD and
sounds in `js/drifthud.js`.


## Race strategy
- **Strategy screen:** before every race the camera circles your car on the grid while you choose a plan:
  **Recommended** (fastest projection), an **Aggressive/Conservative** alternative, an **Undercut** (stop a few laps
  early), or **Custom** (set stops, compounds and pit laps yourself). Each card shows projected race time, a
  tyre-life chart and lap-time trend. Your plan picks the starting tyre. The HUD shows *BOX LAP n*, the
  engineer calls you in on that lap, and the crew has the planned compound ready. Online, everyone gets a
  20 s strategy window, and whatever you have highlighted is used when it runs out.
- **Minimap:** tracks built on a real location show the satellite (or street) map under the minimap
  (Options → Minimap Map). The pit lane is marked, and turns blue when the racing line is on.
- **Blue pit line:** with the racing line on, a blue line shows the way into the pits and down to your own box.
  It's faint normally and bright on your planned box lap, when the engineer calls you in or you're badly damaged.
- **Tyres:** Soft (fastest, ~6 laps on a 2.5 km track), Medium (~10), Hard (~16), Wet (for rain; overheats in the dry).
  Fronts and rears wear separately; below 30% they fall off a cliff. Tyre life is measured per circuit.
- **Damage:** front wing, rear wing and suspension. Costs downforce, grip and power; wings bend and break off.
  On Realistic a big enough hit puts a car out: a wheel torn off or a corner's suspension folded, the car snapping
  round and sliding to a stop. The wreck stays where it stopped (the AI sees it and goes round), out comes the safety
  car (the VSC with no pit lane), and it's craned away about half a minute later, classified DNF. Yours: the moment,
  then you're out.
- **Pit stops:** a pit lane is generated beside the start straight (toggle / side in the editor's Circuit tab).
  Drive into the entry and the crew takes over: 80 km/h limiter, drive to your box, pick tyres and repairs
  with the arrows / d-pad, then go. AI teams plan 0–2 stop strategies and react to wear, damage and rain.
- **Race Setup:** up to 50 laps, Tyre Wear (Off / Normal / Fast), Damage (Off / Normal / Realistic), Start Tyre.

## Career & Grand Prix
Main menu → **Career**.
- **Career (roguelike):** 4/6/8 rounds on random circuits with random time of day and weather; the AI gets
  faster every round. The Team Principal sets a finishing target each round — miss it and you lose a ★;
  lose all three and you're fired. Prize money (finish, places gained, fastest lap, clean race) buys
  upgrades: Engine, Aero, Suspension, Tyre Management, Durability, Pit Crew. After every race pick one of
  three perk cards (Slipstream King, Glass Cannon, Tyre Whisperer, Lucky Charm...). No restarts; runs autosave.
- **Grand Prix:** a straight championship over a series of circuits with F1 points (+1 fastest lap).
- Grid is set by the championship standings after round 1; the same teams race all season.
- **Slipstream** (all modes): run close behind another car on a straight for less drag (up to ~+25 km/h).

## Online
Main Menu → **Online**. One player picks **Host Game** and gets a 5-letter room code. Friends pick **Join Game**
and type it in. The host chooses the circuit (presets, saved tracks or the one open in the editor), laps,
AI cars to fill the grid, AI difficulty, grid order, time, weather, wear, damage and drift points. On the grid everyone
gets 15 seconds to pick a car (whatever is highlighted when time runs out is locked in), then 20 seconds for strategy.
The AI field is built from the host's Garage car class. Up to 8 drivers and 12 cars in total. Session points (F1 scoring)
add up over the races you do together, and with **Drift Points** on, so does everyone's drift score.

- Browsers connect directly peer-to-peer (WebRTC). The public PeerJS server (0.peerjs.com) only introduces them.
- Each player simulates their own car and streams it 20×/s. The host runs the AI and relays everyone's state.
  Other players' cars are extrapolated to the present so side-by-side racing lines up.
- Online races don't pause. Your car brakes to a stop while the menu is open. **Retire** or **Leave** any time.
- The host scores the race once everyone has finished, or 60 s after the winner, or via **End Race For Everyone**.
- If joining times out with the right code, one of the networks is blocking peer-to-peer (strict NAT, some
  work or school networks). Try another network or a phone hotspot, or put both computers on a free
  [Tailscale](https://tailscale.com) network.

## Garage
**Chassis:** *Your F1 Car* is the model built in Blender (`models/car.glb`). Its wheels spin and steer, the 12
suspension links follow the wheels as the body rolls and pitches, and liveries are projected onto it. *SVGP
Classic* is the original procedural car with swappable bodywork. Options → **AI Car Model** chooses what the AI
teams drive. To update your model, export a new `.glb` over `models/car.glb` (see `docs/CAR-MODELS.md`).

Main menu → **Garage**: a turntable showroom for your car. Swap the nose, front wing, sidepods, engine cover,
rear wing, halo and wheels; pick a livery pattern, three colours, race number and sponsor. Drag to rotate,
scroll to zoom. Your build is what you race (or pick a team in Race Setup to race in their colours).
AI teams each get their own mix of parts. The suspension arms move as the car rolls, dives and rides kerbs.

**Pit garage:** during practice and qualifying you wait in your team's garage. Build your own in Blender and
export it to `models/garage.glb` (see `docs/GARAGE-MODEL.md`; `tools/garage-template.py` makes a starter file).

**Livery Designer** (Garage → Livery Designer):
- **Team:** team name (shown in results and online), title sponsor, number, three colours, pattern.
- **Decals:** import **PNG or SVG** logos (SVGs stay sharp) or add **text** decals (5 fonts, colour, outline).
  Pick one and **click on the car** to place it, or drag to slide it. Adjust size, rotation and opacity.
  **Both sides** mirrors it onto the other side so it reads correctly there too. Delete removes it.
- **Helmet:** base, design and trim colours, 7 designs, 5 visor tints, number, your own logo.
- **Suit:** colours, 5 designs, team name or sponsor on the chest, shoulder patches. Your driver stands
  next to the car in the garage, and you'll see the suit in the cockpit.
- **Files:** save several teams, export/import a livery file (includes your images) to share. For 3D
  modellers there's a UV template and the painted texture. Liveries are stored per panel, not per model,
  so they carry over to new car models: see `docs/CAR-MODELS.md`.
- Online, everyone's liveries and custom images are sent to the other players automatically.

## Circuit Designer
- **Draw** a loop freehand — it becomes a smooth spline circuit.
- **Edit** nodes: drag, double-click road to insert, Del to remove, Shift/box to multi-select.
- Per-node **width, elevation, banking**; sculpt hills by dragging nodes in the elevation profile.
- Crossings where one side is 5m+ higher become **bridges with pillars** automatically.
- **Circuit** tab: laps, opponents, runoff width, barrier type (tyres / armco / concrete), kerbs.
- **Settings** (World tab): generate a whole environment around the circuit from PS1-style models: **Small Town**,
  **Big City**, **Industrial Estate**, **Harbour Docks**, **Forest**, **Countryside** or **Japanese Streets** (or
  **Classic** for the original procedural scenery). Towns and cities get a grid of side streets off the straights (closed
  off at the circuit like a real street circuit, with sidewalks and lamps), shops and blocks fronting the circuit and the
  streets, houses and towers behind, street furniture (lamps, bins, phone boxes, vending machines, parking meters,
  mailboxes, dumpsters), trees and landmarks (a church, water towers, tanks, chimneys, gantry cranes). Big City gets a
  skyline that lights up at night. Buildings line up in orderly rows: their fronts sit flush on a line that follows
  the circuit and every street, with **Spacing** (0 m = wall to wall), **Setback from the road** and **Alleys** sliders.
  Alleys get dumpsters, piled bin bags, bins, a payphone at the mouth and litter. With a setting on, every building is
  a PS1 model: zone and OpenStreetMap buildings are fitted with the closest model and the old blocks are not used.
  **Behind the pit lane**: keep it clear, or line it with buildings behind the pit garages.
  Sidewalks along every street get furniture (bins, meters, phone boxes, vending
  machines, mailboxes), litter and bags against the walls, and street trees. Sliders: **Density**, **Building height**,
  **Greenery**, **Street furniture**, **Litter & trash**, **Street trees**, **Ambient life**;
  **New Layout** rerolls it; town streets can be switched off. It's generated from a seed, so the same track always looks
  the same (and online players all see the same world). Every generated building can be moved, turned or deleted with the
  PROPS tool. **Zone & map buildings: PS1 models** swaps the plain blocks of zones and OpenStreetMap imports for the
  best-fitting models (odd shapes stay as blocks). Houses are always one of the **PSX houses** (postdev's PSX Houses
  pack: 10 shapes, 6 wall and 6 roof textures), from zones, the map, settings and the Classic scenery alike.
  - **Ambient life**: paper and leaves blowing along the pavements in the gusts (passing cars kick them up), steam
    rising from vents in the road, pigeons circling over town (dry days), and at night vending machines, phone
    boxes and signboards glow, with a few flickering.
  - New street furniture drops straight in: give it one of these classes in `tools/assets/manifest.mjs` and the
    generator uses it: `bench`, `hydrant`, `planter`, `newsbox`, `bin`, `meter`, `phone`, `vending`, `mailbox`
    (sidewalks); trees `broad` / `thin` / `pine`, and `cat: 'bush'`.
  - The models come from the Sketchfab packs listed in **Credits** (main menu). To add more: download the glTF zip
    into `~/Downloads/Racing Game Assets for claude`, list its pieces in `tools/assets/manifest.mjs` (see
    `node tools/assets/bake.mjs --auto` to split a pack into pieces), then run `node tools/assets/bake.mjs`. That writes
    `assets/env/` (textures shrunk to PS1 size). Rebuild `dist/` afterwards.
- **World** tab: location (Countryside, Desert, City Streets, Coastal Island), time of day,
  weather (clear / overcast / rain / fog), auto-scenery density.
- **Props** (3): a palette in the side panel in four groups. **Houses**: a random house every click, or any of the
  10 shapes; **Buildings**: a random shop, apartment block, office, skyscraper or industrial building from the model
  library, plus the branded businesses and the courthouse; **Nature**: single trees and plants; **Trackside**:
  grandstands, billboards, tyre stacks, cones, floodlights. Houses and buildings turn to face the nearest road or the
  track (Q/E adds a turn) and you can keep holding to drag them into place. Click any house (placed, zone, map or
  setting) to **paint** it: shape, walls (brick, siding in four colours, stone), roof (six) and a paint colour
  (presets or any colour). Other buildings can be tinted or swapped for another of the same kind.
- **Paint** (6): **Grass**, **Nature** (tree mixes), **Houses** (a wide brush lays a street of houses facing each other
  across your stroke, a narrow one a single row facing the nearest road) and **Erase**. The eraser removes anything you
  tick under it: grass, every tree and plant (painted, the World tab's woods, zone tree lines, map trees, placed
  ones) and buildings of any kind.
- **Sculpt** (8): raise, lower, smooth or flatten the land with a brush (size and strength). The editor shows it as a
  shaded relief with 2 m contours. In the 3D world it's applied to the ground as you'd see it (after the circuit's
  embankments), fading out only at the runoff and barriers, so the track and roads never move.
- **How the ground is built round the circuit** (every track, editor or real):
  - **Runoff** (`js/verge.js`): its own mesh following the circuit, flat at the track edge from the road out to the
    barrier (or the end of the runoff). The terrain grid (5-14 m) is too coarse to keep a narrow strip flat beside a
    slope, so the terrain under it is tucked out of sight. Where two sections run back to back at different heights
    (a hairpin's two legs, a figure of eight, switchbacks) each keeps its own flat runoff and they meet at the wall.
  - **Barriers** stand on the higher of the track edge and the ground behind them; where the ground behind is
    higher a concrete retaining wall (level along its length, capped on top) holds it back. Never buried, never
    floating.
  - **Bridges** only where the road really passes over another part of the track (two legs of a hillside chicane
    running close at different heights stay on the ground).
  - **Real elevation** (`roadProfile` in `js/terrain.js`): the road is a smooth best fit to the elevation data,
    never steeper than a real road (`maxGrade`, default 18%; per circuit in `tools/tracks/catalog.mjs`), because the
    coarse data smears steep hillsides into the road. Node heights are interpolated per metre, so uneven node
    spacing can't kink the road.
  - **Grandstands** are built in ~12 m modules, each sat on its own ground on a concrete base (they step up a hill).
- **Buildings on hills**: every building (placed, painted, zones, the map, settings, businesses) gets a level plot:
  the ground under it is levelled to its average height, dug into the hill on the uphill side and built up on the
  downhill side, with banks back to the natural ground (about 1 in 1.6). Rows of houses on a slope step down it as
  terraces. The plots are re-meshed at ~2.5 m so even a small house gets an exact level plot, and the game's ground
  height includes them (trees, props and cars sit on them too). The track, its runoff and roads are never changed;
  right next to them a building stands on the highest ground under it with a concrete foundation filling any drop
  (`js/pads.js`).
  The PSX houses are baked by `node tools/assets/bakehouses.mjs` (from `~/Downloads/PSX_Houses_100`, or set
  `HOUSE_SRC`) into `assets/env/psx_houses.glb`; the full `bake.mjs` runs it too.
- **Map tab (real places)**: search any town/street (or "Use My Location"), show a Streets or Satellite
  map under the editor at true scale, and trace real roads with DRAW.
  - **Import Around Circuit** pulls real building footprints and trees from OpenStreetMap. Buildings are
    extruded to their mapped height (houses get pitched roofs); anything on the track or runoff is removed.
  - **Get Real Elevation** projects the real hills onto the circuit (AWS Terrain Tiles, free, no account).
    Node heights follow the ground, smoothed along the road, and nodes are added where the hills change
    between them. The land around the track uses the real heights too, out to about 1.6 km ("Road only"
    switches that off), so buildings you place out in the real landscape sit on the real hills and show from
    the track. Embankments and cuttings are only as wide as the road needs. On these tracks you also see
    further in clear weather.
    **Exaggeration** (0.25×–4×) scales it all live. The heights are stored in the track (~30 KB), so they
    work offline and are sent to friends online. **Re-project** after moving the circuit.
- **Roads tool** (7): drag to draw streets, then click one to edit its nodes (drag nodes, double-click to add one, DEL removes it): Street, Avenue or Alley (width, sidewalks and markings adjustable).
  They follow the ground (levelling it underneath), get sidewalks, kerbs, lane markings and street lamps, and
  form junctions where they cross. **Freeway** adds six lanes and concrete barriers. Roads that meet the circuit run right up to the
  track edge, like a real street circuit: the kerbs sweep round in curved corners onto the track edge, the sidewalks
  follow the curve (and taper off, or join the circuit's own sidewalks), a stop line is painted across the road, and the
  ground underneath is levelled. A road drawn to stop just short of the track is carried on to meet it. Streets use
  textured asphalt, paving slabs, granite kerbstones and gutters with drains (the circuit's sidewalks get the same slabs), and each road chooses how the junction is handled: **Closed** (the circuit's
  barrier runs across it, as on race day), **Open** (the barrier opens and the road meets the track
  edge, blended in height), **Gate** (a closed see-through gate), **Bridge over** (the road rises on a viaduct with
  ramps and pillars) or **Track bridges it** (the track climbs about 4.5 m onto a bridge over the road on smooth
  ramps, and the road dips about 3 m underneath on gentle banks; this adds a crest to the track). The overpass gets kerbed sidewalks, a concrete parapet and tall anti-throw fences that
  curve in over the track. Both apply where
  a road crosses right over the circuit. Cars can drive on them. "Buildings along it" lines a road with a zone in one click.
  Roads show on the minimap.
- **Individual buildings** (Props tool): click any building (from a zone, an OpenStreetMap import or a placed
  business) to select it. Drag moves it, Q/E rotates, DEL removes, and non-business buildings get a height
  slider. Edited ones are kept as your own buildings, so rerolling a zone won't undo them. "Restore" brings
  the originals back.
- **Sidewalks** (Circuit tab): raised pavements along the track edges (outside the corner kerbs) with a painted red and white kerb ramp up to them, width
  adjustable, for a street-circuit look. Cars can drive up onto them.
- **Paint tool** (6): drag to paint grass onto the ground: lawns, verges, parks. It shows in the race as mown
  grass, and cars running onto it get grass grip. Erase brush, brush size ([ ] keys), undo, clear.
- **Businesses:** Coffee Shop (Bean Machine), Burger Joint (Burger Duck), Pizza Place (Tony's), Gas Station
  (Volta Fuel), Mini Mart (24/7 Quick Mart) and Tyre Shop (Rapid Tyres). Place them one at a time from the
  Props palette, or draw a **Shops** / **Businesses** zone: its **Business mix** slider decides how many lots
  become businesses, and you can toggle which ones to use. Signs and shop windows light up at night.
- **Landmarks:** the Props palette includes the **Auburn Courthouse** (Placer County, 1898): granite base,
  brick upper floors, pediments with statues, columned dome, porch, balcony portico and the grand staircase.
- **Zones tool**: draw a line and houses / shops / apartments / offices / skyscrapers / warehouses / a tree line
  spawn along it. Sliders for min/max height, spacing, setback, size and side; Reroll for a new layout.
  Zone buildings replace imported ones they overlap.

Maps need an internet connection. Map data © OpenStreetMap contributors; imagery © Esri.
Very large towns may not fit in browser storage — use Export to keep them as a file.
- Smooth / Simplify / Reverse / Auto-bank / Flatten tools, undo/redo, save, JSON import/export,
  Test Drive and Race It straight from the editor.

Saved circuits, best laps and settings live in your browser's localStorage.

## Files
- `js/track.js` – spline sampling, bridges, barriers, racing line, presets
- `js/world.js` – terrain, road, kerbs, barriers, scenery, sky, weather
- `js/glbcar.js` – your imported car (`models/car.glb`): loader, wheels, suspension links, projected liveries
- `js/characters.js` – people (`models/characters.glb`): 16 looks, Mixamo clips, `makeCharacter()`; preview in `characters.html`, rebuild with `tools/characters/build.sh`
- `js/pitlife.js` – the pit lane comes alive: each team's sign over its garage (team, driver, live position / PIT / OUT) and a 7-person crew per box that walks out for a stop, works the wheels and jacks, and waves the car out with the lollipop
- `js/carmodel.js` – procedural F1 car: swappable parts, suspension, its livery panel map (`MODEL`)
- `js/livery.js` – model-independent liveries: painter, decals (PNG/SVG in IndexedDB), helmet, suit, UV template
- `js/liverydesigner.js` – the Livery Designer UI
- `js/garage.js` – Garage showroom
- `js/car.js` – tyre-slip physics, tyres and damage
- `js/race.js` – race rules, AI, cameras, skid marks, particles, online car sync
- `js/net.js` – online rooms (PeerJS/WebRTC), clock sync; `vendor/peerjs.min.js`
- `tools/build.mjs` – single-file build for Windows / sharing (`dist/`)
- `js/post.js` – PS2 post-processing (448p, trails, grade, dither, scanlines)
- `js/geo.js` – map tiles, place search, OpenStreetMap import
- `js/zones.js` – building zones, footprints, track-clearance filtering
- `js/editor.js` – circuit designer, `js/hud.js` – HUD & radar, `js/audio.js` – synth audio
