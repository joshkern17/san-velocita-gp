# Facility props: the shopping list

World Career's facilities (Team app, Facilities tab; `FACILITIES` in `js/wcareer.js`) don't show in the garage yet.
This is what to get so they can. Keep to the PSX look of the phone and trailer packs: low poly (a few hundred to a
couple of thousand triangles a prop), small textures (128-256 px), no normal maps. Check each pack's licence allows
use in a game you might sell.

Good searches on itch.io / Sketchfab: "PSX garage props", "PSX workshop", "low poly mechanic tools", "PS1 style
industrial", "retro computer CRT low poly", "low poly car lift".

## The premises (one level at a time)

| Level | What makes it read as that level |
| --- | --- |
| Rented lock-up (start) | Bare bulb, mattress in the corner, camping chair, cheap plastic toolbox, jerry cans, pizza boxes, a kettle, bills on the desk |
| Industrial unit | Roller door, strip lights, a proper workbench, steel shelving with parts boxes, a whiteboard |
| Race workshop | Painted floor, team-coloured wall, an office window, spare wings and bodywork hung on the wall, a compressor |
| Factory | Several bays, a glass-walled office, a trophy cabinet. Probably its own model later rather than props |

## The facilities

| Facility | Props |
| --- | --- |
| Proper tools | Rolling tool chest, wall board of spanners, floor jack, axle stands |
| Lift and engine hoist | Two-post car lift, engine crane, engine on a stand |
| Machine shop | Lathe, milling machine, pillar drill, welding cart |
| Engine dyno | Dyno stand with an engine on it, a control desk with a CRT, an exhaust extraction hose |
| Fabrication bay | Welding table, sheet-metal folder, plasma cutter, offcuts |
| Composites shop | Curing oven, layup table, rolls of carbon cloth, mould tools |
| Sim rig | Bucket-seat rig with wheel and pedals, three CRTs (it's the 90s) |
| Pro simulator | A motion platform and a projector screen |
| Data room | Desk with two or three CRTs, a tower PC, a dot-matrix printer with telemetry printouts, headsets |
| Transporter | A race truck, seen through the door (or outside, if the hub ever goes outdoors) |
| Wind tunnel (Formula) | A scale model on a sting, a section of tunnel |

## The garage remembering things (from the backlog)

Trophy shelf (a few trophy shapes), picture frames for clippings, a corkboard, sponsor stickers on the toolbox,
the handwritten goals list on the wall (a paper texture is enough), a pile of envelopes for bills.

## How they'll go in

When you have them, put them in `garage.glb` in collections or objects named for what they belong to, and the game
will show each only once the team has it:

| Name starts with | Shown when the team has |
| --- | --- |
| `FAC_base1`, `FAC_base2`, `FAC_base3` | those premises or better (and `FAC_base0` only in the lock-up) |
| `FAC_tools1`, `FAC_tools2`, `FAC_tools3` | that tools level or better |
| `FAC_dyno`, `FAC_fab1`, `FAC_fab2`, `FAC_sim1`, `FAC_sim2`, `FAC_data`, `FAC_truck`, `FAC_tunnel` | that facility |

(Not wired up yet: say when the props are in and it's a small change in `js/pitgarage.js`.)
