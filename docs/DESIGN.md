# San Velocita design language: "neon signal"

Every screen (menus, HUD, garages, pop-ups) is built from one small kit: glowing red-orange type on dark,
one cool cyan accent, and a cyan→violet "signal" ramp for anything that measures. Tokens and primitives live in
`css/sv.css`, fonts are built by `tools/build-fonts.py`, and `styleguide.html` (open it through `serve.py`)
shows every piece live. When you build something new, start from those, not from scratch.

## The rules

1. **Frameless.** No boxes, cards or bevels. Text floats on the scene; a screen gets a dark side-shade
   (`.menu-shade`), and where text sits over a bright world it gets a *plate* (`--sv-plate`) edged by one hairline.
   No skews, no gradients on buttons, no drop-shadowed bevels.
2. **One hot family, one cool accent.** Red/orange carries everything. SV blue means *the cursor* or *good/live*.
   (UI Colour: Blue swaps them: SV blue carries everything and red is the accent.)
   Amber means *focus*: only the highlighted thing is amber.
3. **Soft text, never shadows.** Letters are drawn as *two blurred copies of themselves stacked*, in exactly their
   own colour, with no crisp fill on top (`text-shadow: var(--sv-glow); -webkit-text-fill-color: transparent;`):
   type reads soft and lit, never razor-sharp. No dark drop-shadows, ever. If you switch it off on something
   (`text-shadow: none`), give the fill back (`-webkit-text-fill-color: currentColor`) or the text vanishes.
   Text: `--sv-glow` (blur grows a little with size); menu rows and the GRAND PRIX caption: `--sv-glow-strong`
   (a touch softer); sentences: `--sv-glow-body` (tighter). Lines/rules:
   `--sv-glow-line` (draw them as a 1-2px element or pseudo-element). Outlines: `--sv-glow-box`. Filled things:
   `--sv-glow-fill`. Gradient titles: `--sv-glow-title` (a blur plus a soft copy).
4. **Tight type.** All type runs at `-2%` tracking (`--track`), condensed or not. The only exception is the spaced
   caption (`--track-caption`, e.g. G R A N D  P R I X), used sparingly under titles and as section heads.
5. **Fixed slots.** Things don't jump around. Values change in place, digits are tabular, descriptions live in a
   fixed spot, and a cursor moving never reflows a list.

## Colour

| Token | Use |
|---|---|
| `--sv-hot` #ff6a1c → `--sv-hot-deep` | titles (as a vertical gradient), hero numbers (speed, position, timers) |
| `--sv-red` #FF2B00 | **default**: labels, menu rows, values, rules, keycaps, table text |
| `--sv-red-dim` | secondary: units, section heads, inactive bits, descriptions' quieter parts |
| `--sv-amber` #ffc21a | focus: the selected row/tab/value. One amber thing per list |
| `--sv-cyan` SV blue #2D36F2 | the accent: the cursor ▶, value chevrons on the focused row, "saved"/"live", good news (the token keeps its old name) |
| `--sv-signal` | SV-blue ramp (pale blue → #2D36F2 → violet) for meters only (rpm, tyre life, volume, progress) |
| `--sv-paper` | text on a solid red bar (e.g. *you* in a timing table). Nowhere else |
| `--sv-good` / `--sv-bad` / `--sv-best` | faster / slower or damage / personal best (purple, racing convention) |

Real-world semantic colours stay real: flags, tyre compounds, team colours, medal positions.

## Type

Four role families; the build normalises them so `font-size` means the same thing in each (caps are centred in
the line box, so text never rides high):

| Role | Font | Use |
|---|---|---|
| `--f-display` | Helvetica Now Display Cn Bold | screen titles, the wordmark, hero numbers |
| `--f-ui` | Helvetica Now Display Cn **Medium** (700 = Bold, opt-in) | everything uppercase: menu rows, labels, values, HUD |
| `--f-body` | Helvetica Now Display (not condensed) | sentences: descriptions, help, tips |
| `--f-num` | Helvetica Now Micro Cn | dense small numbers: tables, telemetry, timing |

Digits are tabular in every role, so timers don't jitter. UI text is uppercase; body text is sentence case.

Weight: Medium is the default; Bold only for titles and hero numbers. Keep sizes modest.

Scale (px at `--ui` 1): hero 104 · title 72 · head 30 · main-menu row 30 · panel row 22/20 · label 15 ·
caption 14 · body 15 · small 12.

## Components

- **Screen header**: `.scr-head h1` (display, hot gradient, glow) + `.scr-sub` spaced caption. The wordmark is
  `.logo` = title + caption + hairline + `.sv-signal`.
- **Menu** (`Menu` widget in main.js): red rows; focused row amber with the cyan cursor in the left gutter;
  values sit between `‹ ›` chevrons that turn cyan on the focused row. Section heads are spaced captions over a
  hairline. Free-standing menus (main menu, `inlineDesc`) add a hairline under the focused row and tuck its
  description beneath it.
- **Buttons** (`.sv-btn`, `.item.action.primary`, editor buttons, key prompts in the footer): outlined and glowing
  at rest; on hover / focus they **fill amber with ink text** and radiate (`--sv-glow-fill`). The ink text is soft
  too (`--sv-glow-ink`), and so is paper text on a solid red bar (`--sv-glow` in its own colour): nothing goes crisp.
- **Description**: plain body text in a fixed slot (`.desc-bar`, `.main-desc`). No box.
- **Key prompts**: outlined caps (`kbd`), pad buttons as outlined circles in their face colour, labels in UI caps.
  Footer has no bar, just a soft dark fade.
- **Tabs**: words; the open tab is amber, underlined, with the cursor before it.
- **Stat strip** (`.ti-grid`, `.sv-stats`): label over value, columns split by glowing vertical hairlines.
- **Table** (`.tbl`): header row over a glowing rule; rows red; *you* is a solid red bar with paper text.
- **Signal meter** (`.sv-signal`, `.meter`): segmented pills in the cyan→violet ramp, unlit pips at ~16%.
- **Frame** (`.sv-frame`): a crisp dark box (never blurred) with glowing corner brackets. The one box we allow,
  for data that must read over the bright world (HUD timing tower, HUD lap block).
- **Swatch** (`.sv-swatch`): flat colour square; selected gets a cyan outline.

## HUD specifics

HUD text uses `--sv-glow-hud` (adds a dark halo so it reads against sky and grass). Corners are anchored:
timing tower top-left (full surnames, *you* as the red bar), POSITION `03 / 12` + LAP/LAST/BEST top-right,
the current LAP TIME big at top centre (framed; live delta under it in qualifying / time trial; a rear-view mirror
can take the slot above it via `--mirror-h`; race control's flag board and messages stack beneath it),
the ring map bottom-left (blue circuit, red ring, hot arrow), car status | GEAR | SPEED bottom-right with the rpm
signal meter and the six aid slots under it. The tower, the lap timer and the lap block sit in `.sv-frame` boxes; the map and the bottom-right cluster float.
Big numbers are hot, labels red, numbers zero-padded where the mockup does (`02 / 08`). Canvases (map, car status)
draw with the same colours and `shadowBlur` for glow.

## Building something new: checklist

- Pick colours, fonts, spacing (`--s1`..`--s12`, 4px grid, `--edge` 5% side margin) and motion (`--m-*`) from tokens.
- Uppercase UI in `--f-ui`, sentences in `--f-body`, -2% tracking.
- Exactly one amber thing; the cursor is cyan; nothing else is cyan unless it means "good/live".
- No boxes; if it's unreadable over the world, add a plate, not a border.
- Check symmetry, even spacing, centred text and that nothing shifts while navigating.
- Add it to `styleguide.html` if it's a new reusable piece.
