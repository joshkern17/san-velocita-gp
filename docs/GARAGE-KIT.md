# The home garage kit

In World Career, your home garage is built from separate pieces: a **shell** for your premises and a **station** for
each facility you've bought, set down at the shell's slots. Buy the sim rig and it shows up in its corner; move to an
industrial unit and the whole room changes. Race weekends still use your pit box model (`models/garage.glb`, see
[GARAGE-MODEL.md](GARAGE-MODEL.md)).

```
models/garage/
  kit-start.blend          the template: every piece, in one file
  shell_lockup.glb         Rented lock-up        (FACILITIES.base level 0)
  shell_unit.glb           Industrial unit       (level 1)   from unit-start.blend (tools/garage-unit.py)
  shell_workshop.glb       Race workshop         (level 2)   not made yet
  shell_factory.glb        Factory               (level 3)   not made yet
  station_tools.glb        Proper tools (a workbench, a locker)
  station_sim.glb          Sim rig (a CRT on a stand, a wheel on a post with pedals, an office chair)
  station_<facility>.glb   one per facility: tools, dyno, fab, sim, data, truck, tunnel
  station_<facility><n>.glb  that facility at level n and up: station_tools2 is the lift (Tools level 2), tools3 the machine shop
  stations-start.blend     dyno, fab, data, tools2 (tools/garage-stations.py)
  src/                     the asset-pack files the template is built from
```

If a piece isn't there, the game leaves it out. With no shell for your premises it uses the next smaller one, and with
no shell at all it falls back to `models/garage.glb`. A station bought for a shell with no slot for it doesn't show.

## Seeing it in the game

Main Menu > **Home Garage** opens the room without a career: pick the premises, each facility's level and car two, and
**Look At** the room, car two or any station, or **Walk Around** it. Nothing is saved.

In World Career your days happen where you'd do them: the roll-up door (`INTERACT_door`) is going out for the day (the
day job, gigs, sponsor events, test days, days with your teammate, race day: the planner with just those), the car's
tag has a second action, X / F "Spend the day" (rebuilding a part, a project), and the sim rig is a sim session. The
calendar opens out the week, which stays up along the top while you walk. Your tires stand in stacks by the door
(`TIRES`): one per compound, and you order more there. There's no menu: you're on your feet from the first day (getting the
team going is done at the computer) to the season's end (the next one is out the door). Esc / B pauses (Keep Walking,
Career Options, Save & Quit). Painting the car is on the car's menu (A at the car).

**Walk Around** (here and on the World Career hub menu): left stick / WASD to walk, squeeze RT to jog (the walk eases
into the jog as you squeeze; Shift on a keyboard), right stick /
mouse drag / IJKL to look, A / Enter to use what you're facing (its prompt shows), B / Esc to stop. In a career each
prompt does what its hub menu item does (the computer, Work On The Car, The List, the day plan). You start at `SPAWN`;
you can't walk through anything standing on the floor (its bounding box, or a `COL_` mesh) or off `NAV_floor`.
At the computer you sit down first, the way you would on a swivel chair. You walk up to the desk chair (the object
named `...chair...` nearest the screen) from the room, turn your back to it, sit, and swivel round to the desk with it;
the camera goes on into the screen. Leaving the computer, you swivel back out and stand up. So leave the chair facing
out into the room, a little way from the desk: one facing the desk is turned out first. Its seat wants to be about
0.48 m up (the sit-down clip sits you that high). The computer's prompt shows at the chair. Without a chair you sit on
nothing, in front of the screen. After exporting from Blender, reload the page and open
it again.

## Editing in Blender

Open `models/garage/kit-start.blend` and **Save As** your own copy in the same folder. Running the template script again
overwrites `kit-start.blend`.

- **KIT** collection: one sub-collection per `.glb`. `shell_lockup` is your lock-up; its `hooks` sub-collection holds
  the bays, the slots and the rest.
- **STATIONS**: each station sits in a row beside the room (to the right, in front). Edit it there. The room shows a
  live copy at its `SLOT_` empty, so you can see it in place.
- **GUIDES**: car-sized red boxes on the bays (the small box is the nose), and the racer from the game, for size:
  standing at `SPAWN` (`GUIDE_Racer`, facing the way you walk in) and sat at the desk (`GUIDE_Racer_Seated`, as he sits
  there after swiveling round). The game leaves out anything named `GUIDE...`.

To **export**, open the Text Editor, pick `export_kit` and press Run Script. It writes `models/garage/<collection>.glb`
for every `shell_...` and `station_...` collection, next to the `.blend`. Reload the game to see it. Hidden objects (the
eye icon) are left out.

To **replace a model**, delete or hide what's there, Append or Import yours into the same collection, and line it up
with the guides. To add a **new station**, make a collection named `station_<facility>` inside STATIONS, set its
Instance Offset (Object Properties > Collection > Instancing) to where you built it, and add a `SLOT_<facility>`
empty to the shell.

## Layout

- **Metres**, floor at **Z = 0**. The door is towards **-Y**, and so is each car's nose.
- **Shells:** `BAY_1` is the room's origin in the game: the room is moved so your car sits on it.
- **Stations** are built around their own origin: on the floor, at the middle of the station's back (the side that goes
  against the wall). The front, where you'd stand to use it, faces **-Y**. The slot's position and turn place it.
- Lighting works as in GARAGE-MODEL.md: a shell with its own lights is lit by them alone. Stations can carry their own
  lamps (the bench's work light, the CRT's glow); they're added to the room's.

## Hooks

Names only have to start with these (`SLOT_sim.001` is fine).

| Name | In | What the game does |
| --- | --- | --- |
| `BAY_1`, `BAY_2` | shell (empty) | Where car one and car two sit, nose down the empty's -Y. Car two only shows in a shell with a `BAY_2` |
| `SLOT_<facility>` | shell (empty) | Where that facility's station goes, turned as the empty is |
| `SPAWN` | shell (empty) | Where you walk in (walking comes later) |
| `NAV_floor` | shell (mesh) | The floor you can walk on. Hidden in the game. More `NAV_` meshes (`NAV_stairs`, `NAV_deck`) are more floors: you stand on whichever is under you, so a ramp up the stairs takes you onto a mezzanine. What's in your way depends on the floor you're on |
| `WALK_...` | any (mesh) | Something you walk on (treads, the deck): never in your way |
| `WITHOUT_<facility>...` | shell (any) | Shown only till the team has that facility: the junk in the corner where it'll go |
| `COL_...` | any (mesh) | Invisible blockers. Hidden in the game |
| `STAND_<role>` | station or shell (empty) | Where a staff member stands. Custom properties: `clip` (what they're doing: `lean`, `kneel`, `sit_idle`...), `role` |
| `TIRES` | shell (empty) | Your tires: one stack per compound you have, as tall as its share of your sets (the most you have of any is five high), the compound's stripe on top. The first stands on the empty, the rest in a row along its +Y. Walk up to them to order more |
| `INTERACT_<what>` | any (empty) | Something you can use. Its red marker (and the A prompt, when you walk up to it) hangs here; you use it from within about a metre. Custom property `label` |
| `PC_Screen`, `TV_Screen`, `TeamMain`... | any | As in GARAGE-MODEL.md |

Custom properties are set in Object Properties > Custom Properties, and they come through to the game.

## What the template changed in your lock-up

`tools/garage-kit.py` copies `models/garage-attempt_001.blend` (your file isn't touched) and:

- moves car one 0.85 m left and adds car two's bay 3 m to its right, and takes out the bay lines
- moves the work light that stood in front of car one's nose 1 m left (same aim) and the boxes where car two goes into
  the back corner
- shows the right wall again (you had it hidden for the old fixed camera) and adds a front wall with a roll-up door and
  a corrugated roof, so the room is closed in for walking round
- drops the asset-pack samples parked outside the walls, and the dartboard's two darts (they came in about 37 x 52 m)
- adds the tire stacks' `TIRES` hook in the front corner by the door, and a bare bulb over it
- shrinks the desk and everything on it 0.75x against the wall (it came in 1.33x: a 1.0 m desktop) and sizes the chair
  so its seat is 0.48 m up, half a metre out from the desk, turned out to the room

Rebuild the template (this overwrites `kit-start.blend` and the `.glb`s):

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-kit.py -- --export
```

Check it in the game: `node .devtest/homekit.mjs <folder>` (screenshots of the lock-up, the stations, and the switch to
a race weekend's pit box and back).

## The Industrial unit

`tools/garage-unit.py` builds `models/garage/unit-start.blend` and, with `-- --export`, `shell_unit.glb`:

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-unit.py -- --export
```

It's Garage by LunaQuantica (`models/garage/src/luna`: its brick, roll-up door, windows, rails and signs) made into a
16 x 14 m unit with a mezzanine along the back (3.5 m deep, 2.7 m up, stairs up the right wall). The pack pieces keep
their own textures; everything the script builds (floor, walls, roof, trusses, columns, the deck and stairs) is
textured from the PSX Industrial textures (`src/psx_industrial`) or Luna's brick with grime baked in, written to
`src/unit_gen`. The props are from the packs in `src/unit`, `src/psx_industrial_pack.glb` and `models/pitprops.glb`;
your desk, chair, CRT, calendar and the vending machine come from `kit-start.blend` as they stand in the lock-up.

Slots: `tools`, `dyno` and `fab` along the left wall, `sim` under the mezzanine, `data` on it, `tools2` (the lift) in the third bay.
Until a team has the dyno, fabrication or the data room, those places hold junk (`WITHOUT_...`). Staff spots face the
empty's -Y, as you do at `SPAWN`; `STAND_any` is anyone's (idle: the couch, the vending machine, the rail upstairs).
Check it: `node .devtest/unitshot.mjs <folder>` (shots round the room, a walk up the stairs; `FAC=all` for everything
bought).

## The stations (tools/garage-stations.py)

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-stations.py -- --export
```

builds `models/garage/stations-start.blend` and exports `station_dyno`, `station_fab`, `station_data` and
`station_tools2` (station_tools and station_sim stay in kit-start.blend). Each is built round its own origin like
the rest (on the floor at the middle of its back, its front down -Y), from the packs in `src/stations` (their own
textures) and things built from boxes and cylinders with the grimy PSX Industrial textures (`tools/garagelib.py`,
shared with the unit). The printed bits (the signs, Danny's note on the dyno's CRT, the whiteboard, the dot-matrix
printout, the screens) are drawn by `tools/garage-signs.py` (system Python with Pillow; the stations script runs it
when they're missing, or with `-- --art`).

A facility at level n puts every station up to it in the room: Tools 2 is `tools` and `tools2`. The game passes those
keys (`main.js` stationKeys), so a shell gives a level its own place with `SLOT_tools2`, `WITHOUT_tools2...`.

- **Engine dyno** (3.5 x 3.4 m): an inline four on a test bed with the water brake, its barrel and hoses, a radiator,
  fuel on a shelf, the exhaust duct up to a board in the window, a chain-link screen, the control desk outside it
  (gauges, the CRT with the power curve, Danny's note), a cage lamp. Staff: `STAND_dyno` (sat at the desk), a kneel.
- **Fabrication** (3.5 x 3.4 m): a welding table with a frame clamped up on it, the welder trolley and gas bottle, an
  orange weld screen on the side by the bench, tube on wall brackets, sheet against the wall, a grinder and a pillar
  drill, the offcut bin. Staff: `STAND_fab`, a talk by the welder.
- **Data room** (9 x 3.5 m, on the mezzanine): three desks at the rail (two CRTs with telemetry and timing, a Win95
  PC), chairs facing the rail, filing, a bookcase of binders, the dot-matrix printer with its printout to the floor,
  the whiteboard (a track sketch, setup changes, lap times). Staff: two `STAND_data`, `STAND_manager`.
- **Lift and engine hoist** (`tools2`, stands in a bay, its origin the bay's middle): a two-post lift with its arms
  in, top beam, power unit, the engine crane folded by the door, axle stands, a drain caddy.

**In use.** `BUSY_<key>...` pieces show only while that station's in use, `IDLE_<key>...` only while it isn't
(`kit.setBusy`, no reload). In a career (`main.js` homeBusy): engine work puts the engine on the dyno, chassis and aero
work a frame on the welding table (with the arc's glow), any project the lift's engine out on the crane and wheels off;
the data room's screens are on while you have a data engineer. The Home Garage preview's **Stations** item flips it.

**Your people** (`js/homecrew.js`): your hired staff and your teammate about the room. They go to `STAND_` spots that
suit their job (`role`: mechanic, engineer/data, dyno, fab, manager, driver, any; `clip`: what they do there; they face
the empty's -Y), round the cars' wheels and the tire stacks, keener on a station that's in use, walk there round what's
in the way (both floors, up the stairs), and stop to talk in twos and threes. The mechanic carries a wrench, the
engineer and manager a clipboard. You walk round them. Preview: **Crew** in Home Garage. Check:
`node .devtest/crewshot.mjs <folder>`.

No station has an `INTERACT_` yet: there's nothing for them to do. Check them: `node .devtest/stationshot.mjs <folder>`
(three shots of each, in the unit with everything bought).
