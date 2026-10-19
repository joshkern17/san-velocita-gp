# Steam capsule drafts: 3 directions

Status: **NEEDS OK** (BRAND §7: capsule art is yours). The question: *which direction, A, B or C, or a mix (for example
C's layout with B's car)?*

**Review sheet:** `capsules/review.png`. It shows every capsule side by side, plus the small capsule at Steam's real
184×69 and 120×45.

- **Art:** real in-game renders (director stills at hd lines), one hero car on a real track. Nothing is
  AI-generated.
- **Text:** the game's wordmark (the site's `.wordmark`, the game's fonts). No other text, per Valve's capsule rules.

| Direction | The image | What it says | Strength | Weakness |
|---|---|---|---|---|
| **A · The race** | Heli shot: the F40 leading a GT1 car through Les Combes at Spa. Wordmark top-left. | "A racing game on real circuits." | Reads instantly as racing, and the curbs make a strong graphic. | Generic: it could be any racer, and the car is small at header size. |
| **B · The car** | A low dolly on the 935 (original blue/yellow livery) at Laguna Seca. Wordmark top-right. | "These cars, in this look." | The car-as-character (STRATEGY pillar 3), and the most "Gran Turismo 2" of the three. | Says nothing about the track editor. The real car shape is a [YOUR OK] naming question. |
| **C · Draw it, drive it** | The Capri in the rain at Suzuka, with an ink panel. Suzuka's outline is drawn the way the Circuit Designer draws a road: glowing edge, asphalt, dashed center line, node squares. | "You draw the track, then you drive it." | The only one that shows pillar 1, the hook, and the most "ours" (it uses the UI's own drawing). | The busiest one. The outline is a stylized overlay, not a screenshot (allowed: it's artwork, not text). |

**My pick: C**, for the header, main and vertical capsules. It's the only capsule that carries the hook before anyone
reads a word, and Zukowski's rule is that a capsule has to tell a shopper the genre and the twist. The small capsule is
the wordmark over a darkened frame in all three, so it works whichever wins.

## Files (per direction folder `A/`, `B/`, `C/`)
| File | Size | Valve slot |
|---|---|---|
| `header_920x430.png` | 920×430 | Header capsule (also library header) |
| `small_462x174.png` | 462×174 | Small capsule. `small_preview_184x69.png` and `small_preview_120x45.png` are Steam's own downscales, for checking only and not for upload. |
| `main_1232x706.png` | 1232×706 | Main capsule |
| `vertical_748x896.png` | 748×896 | Vertical capsule |
| `library_600x900.png` | 600×900 | Library capsule |
| `hero_3840x1240.png` | 3840×1240 | Library hero. **No text**, as Valve requires; the subject sits in the centered 860×380 safe area. |
| `logo_1280x720.png` | 1280×720 | Library logo (transparent PNG, wordmark only) |
| `background_1438x810.png` | 1438×810 | Page background (optional; darkened so it stays "ambient") |

Still to make once a direction is picked:
- the shortcut icon (256 or 512 px);
- the 184×184 app icon;
- the 800×450 event cover.

## Honest notes
- **Resolution:**
  - The art is 1080p stills scaled up, by up to 2× for the 3840 hero and 1.3-1.7× for the zoomed crops.
  - The PS1 look hides most of it, but the hero is soft.
  - For final art, I'd add a director option to render one frame at 4K (the post chain at native res) for the chosen
    direction.
- **Zukowski's research favors an illustrated capsule over a screenshot with a logo.** You asked for real in-game
  renders, which is also the honest choice for a game whose look is the point. If the drafts test weak, a painted
  version of the winning direction is the next step, and that's your call (it costs money or your time).
- **Small things to fix in the final:**
  - B's header has a pale haze triangle at the far left, where a distant hill is drawn flat.
  - A's header cuts off the chasing car at the bottom edge.
- **Re-make them:**
  - `node marketing/steam/capsules/src/render.mjs [A|B|C]` (layout in `src/directions.json`, page in `src/capsule.html`);
  - then `node marketing/steam/capsules/src/review.mjs` for the sheet.
