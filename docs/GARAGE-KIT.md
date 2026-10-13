# The home garage kit

In World Career, your home garage is built from separate pieces: a **shell** for your premises and a **station** for
each facility you've bought, set down at the shell's slots. Buy the sim rig and it shows up in its corner; move to an
industrial unit and the whole room changes. Race weekends still use your pit box model (`models/garage.glb`, see
[GARAGE-MODEL.md](GARAGE-MODEL.md)).

```
models/garage/
  kit-start.blend          the template: every piece, in one file
  shell_lockup.glb         Rented lock-up        (FACILITIES.base level 0)
  shell_unit.glb           Industrial unit       (level 1)   not made yet
  shell_workshop.glb       Race workshop         (level 2)   not made yet
  shell_factory.glb        Factory               (level 3)   not made yet
  station_tools.glb        Proper tools (a workbench, a locker)
  station_sim.glb          Sim rig (a CRT on a stand, a wheel on a post with pedals, an office chair)
  station_<facility>.glb   one per facility: tools, dyno, fab, sim, data, truck, tunnel
  src/                     the asset-pack files the template is built from
```

If a piece isn't there, the game leaves it out. With no shell for your premises it uses the next smaller one, and with
no shell at all it falls back to `models/garage.glb`. A station bought for a shell with no slot for it doesn't show.

## Seeing it in the game

Main Menu > **Home Garage** opens the room without a career: pick the premises, each facility's level and car two, and
**Look At** the room, car two or any station, or **Walk Around** it. Nothing is saved.

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
| `NAV_floor` | shell (mesh) | The floor you can walk on. Hidden in the game |
| `COL_...` | any (mesh) | Invisible blockers. Hidden in the game |
| `STAND_<role>` | station or shell (empty) | Where a staff member stands. Custom properties: `clip` (what they're doing: `lean`, `kneel`, `sit_idle`...), `role` |
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
- shrinks the desk and everything on it 0.75x against the wall (it came in 1.33x: a 1.0 m desktop) and sizes the chair
  so its seat is 0.48 m up, half a metre out from the desk, turned out to the room

Rebuild the template (this overwrites `kit-start.blend` and the `.glb`s):

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/garage-kit.py -- --export
```

Check it in the game: `node .devtest/homekit.mjs <folder>` (screenshots of the lock-up, the stations, and the switch to
a race weekend's pit box and back).
