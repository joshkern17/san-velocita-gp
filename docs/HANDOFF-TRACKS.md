# Tracks work: handoff (2026-10-19)

The tracks session's uncommitted work was committed for it by the editor session, as one commit, so the
3D-editor work can start on world.js. Read this before picking the track work up again.

## What the commit holds

| Area | Files | What it does |
| --- | --- | --- |
| Curve points (stage 2 of the editor plan) | js/spline.js, js/track.js `densePath`, js/editor.js (finishDraw, simplify, double-click split) | A drawn road is fitted with one point per corner plus curve handles (`fitStroke`); Simplify refits any track within 0.25 m line / 8 cm height / 0.2 m width / 0.5° bank (`simplifyTrack`), carrying the dressing over by world position (`lapRemap`, `remapDress`); double-click splits a curve exactly (de Casteljau). |
| Ground From Photo | js/groundmap.js, tools/tracks/ground.mjs, js/world.js (`groundTintMap`, `gTint` shader), js/editor.js (MAP tab `groundHtml` / `makeGround`), js/realtracks.js, tracks/real/ground/zandvoort.json | Colors the land round a real circuit from open aerial photos (grass, dry grass, sand, woods, car parks). The Grass paint brush wins over it. Only Zandvoort has a ground map so far. |
| Pit wall ends | js/track.js (`MAIN`, `pitAlong(..., wall)`), js/edpit.js (white dots, `pitWallEnds`), js/world.js, js/race.js (two lines: `pit.MAIN`), js/editor.js (pit drawing, hint) | The pit wall can run on past the garages, beside the lane, to where it meets the track; its ends are dragged as the two white dots. `MAIN` = along the garages, `WALL` = where the wall stands. |
| Track builds | tools/tracks/build.mjs, tools/tracks/official.mjs, tracks/real/index.json, tracks/real/zandvoort.json | The ground map is kept out of the light index like `osm` / `terrain`; Zandvoort's file points at its ground map. |
| Checks | .devtest/spline.mjs, .devtest/edground.mjs, .devtest/edpitwall.mjs, .devtest/groundshot.mjs | `node --import ./tools/tracks/three-hook.mjs .devtest/spline.mjs` measures Simplify on every circuit. |

## Checked when committed

- Run from a copy of exactly what was committed (no other session's uncommitted changes): Zandvoort opens in
  the Circuit Designer with its ground map and "Ready to race", the pit lane tool shows the lane, the 3D view
  builds and draws.
- `.devtest/spline.mjs`: all circuits within limits except **Monaco** (Simplify changes its lap by 0.88 m, the
  limit is 0.5 m). Same result before and after the commit, so it's open work, not a regression. Monaco's source
  line also has a known zig-zag near 180 m.

## Open when you pick it up

- Monaco's Simplify lap-length miss (above).
- Ground From Photo for the other circuits: only Zandvoort has one (tools/tracks/ground.mjs).
- Step 3 of the launch cleanup (per-track pass and landmarks): Spa and Suzuka done; next Laguna, Watkins Glen,
  Road Atlanta, Zandvoort. Known: a grey box floating on a hill at Spa ~5000 m, a map house hard by Suzuka at
  1500 m.
- js/trackview.js (the reference-model Track Viewer) is still uncommitted: its page, trackview.html, isn't in the
  repo, and the reference models were shelved.

## Changed since (editor session, 2026-10-20)

- Hairpins (9698107 and the commit after it): runoff and barriers no longer reach over another stretch across a
  hairpin's nose (track.js sameStretch), and a kink in the road's line (a tight node where it turns tighter than the
  road can) is eased in sampleTrack (track.js unkink). Of the real circuits only **Monaco** changes: its map glitch at
  ~180 m is smoothed (the line moves up to 1.2 m, the lap is 3 m shorter, the estimated lap 2.5 s quicker; Track Check
  11 fails -> 8). The new barrier rules (down the middle of a hairpin's tongue, round its nose, short gaps closed)
  are for drawn circuits only (no osm): real circuits keep their open infields. Check: .devtest/hairpins.mjs.

## Coming next in world.js (coordinate before editing it)

The 3D editor (plan: https://claude.ai/code/artifact/a98f11f5-03df-4ab5-b35d-a381775b2149) starts by splitting
`buildWorld` into a road layer, a ground layer and a scenery layer that rebuild on their own and only near an
edit. Races must look identical (checked with side-by-side race shots), and `placed` (used by
tools/tracks/checklib.js) keeps its shape. If track work needs world.js while that's under way, commit small
and often so the two don't collide.
