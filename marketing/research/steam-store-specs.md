# Steam store page: specs and rules (checked 2026-10-19)

Checked against Valve's live docs and howtomarketagame, 2026-10-19. "UNCONFIRMED" means no primary Valve source was
found. Sources are at the bottom; re-check them before upload, because Valve changes sizes (the Aug 2024 change made
the old sizes invalid).

## Graphical assets
| Asset | Size (px) | Notes | Src |
|---|---|---|---|
| Header capsule | 920×430 | Store page top, Recommended, Daily Deal. Logo "easily legible"; "no quotes or other strings of text beyond the title." | B |
| Small capsule | 462×174 | Search and lists. Steam scales it to 184×69 and 120×45. The "logo should nearly fill the capsule" and stay readable at the smallest size. Art can differ from the other capsules. | B |
| Main capsule | 1232×706 | Front-page carousel. Same rules. | B |
| Vertical capsule | 748×896 | Seasonal sales. Same rules. | B |
| Page background | 1438×810 | Optional; "ambient". If none, Steam uses the last screenshot. | B |
| Library capsule | 600×900 | Key art plus the logo; no other text. | C |
| Library header | 920×430 | Falls back to the store header. | C |
| Library hero | 3840×1240 | **No text at all.** Safe area: a centered 860×380. | C |
| Library logo | 1280 wide and/or 720 tall, transparent PNG | Logotype (plus logomark) only. | C |
| Shortcut icon | 256×256 or 512×512 | .png or .ico. | D |
| App icon | 184×184 .jpg | Shows properly only once the page is Coming Soon. | D |
| Event cover / header | 800×450 / 1920×622 | Per event. | E |

- **Capsule rules (since Sept 2022):** only artwork, the game name and an official subtitle.
  - Not allowed: review scores, awards, discounts, calls to action, other products, or "other miscellaneous text."
  - All art must be PG-13. [F]
- **Before Coming Soon:** everything in "Your Store Presence" is required. [G]

## Screenshots [B]
- At least 5. "1920x1080 minimum, 16:9."
- Gameplay only: no concept art, no pre-rendered stills, no marketing text.
- Mark at least 4 as suitable for all ages, or the game is left out of the front-page hover.
- The hover tooltip cycles the **first 4** screenshots. Make them 4 distinct parts of the loop, with at least one
  showing the HUD that signals the genre. [M]

## Descriptions
- **Short description:** plain text, "a few hundred characters." **The 300-character limit is UNCONFIRMED** in Valve's docs.
  It is the counter shown in the Steamworks editor, per third parties. Avoid time-based words like "Now Available". [I]
- **About This Game:** headers and bold through the editor. [I]
  - Images under 5 MB each; all screenshots and GIFs together under 15 MB.
- **Newer page assets** [J]:
  - PNG, JPG, GIF, WEBP, MP4 or WEBM.
  - **1170 px wide recommended** (the old 616 px figure is out of date).
  - Animated assets: **12 s max**, BT.709.
- **Not allowed** [I][K]: links or implied URLs, fake Steam buttons, promoting other games. Text baked into images
  must be redone for each language, so keep images textless.

## Tags [L][M2]
- Up to 20 count. Valve: "The tags given the most weight govern your visibility more than those given less." "Some
  store filters look at the first 15 tags."
- Similar-game matching uses the top 20. Overlap with similar games matters more than order, and rare tags weigh
  more than common ones.
- Zukowski: the top 5 matter most and should be specific. Keep Indie, Action, Adventure and Casual out of them.
- **Live tag vocabulary (store.steampowered.com/tagdata/populartags, 429 tags):** "Sim Racing", "PS1", "Low-poly",
  "Driving Sim", "Online PvP", "Track Editor" and "Customization" **do not exist**. "Racing", "Automobile Sim",
  "Driving", "Level Editor", "Retro", "1990's", "Old School", "Management", "Co-op", "Online Co-Op", "PvP", "Physics",
  "Time Attack" and "Nostalgia" do.
- **Comparable games' top tags (store pages, 2026-10-19):**
  - Old School Rally: Racing, Arcade, Driving, Retro, Old School, 1990's, Simulation, Nostalgia, 3D, Indie, Automobile Sim.
  - Backseat Champions: Early Access, Racing, Strategy, Roguelite, Auto Battler, Simulation, Management, … Online Co-Op, PvP, Automobile Sim.
  - Motor Town: Early Access, Driving, Open World, Simulation, Transportation, Automobile Sim, Multiplayer, …

## Trailer [N][M][O]
- **File:** .mp4 (H.264 + AAC), up to 1920×1080, 30 or 60 fps, 5,000+ kbps (Valve's preset is 20 Mbps), stereo 44.1/48 kHz.
- **Placement:** the first 2 trailers show before the screenshots. Steam cuts a 6 s looping microtrailer from the first
  one by itself, and it can't be customized. So the first 6 s must be the best gameplay.
- **Valve's advice:** mostly gameplay with the HUD visible. Assume no audio and under 10 s to impress (Discovery Queue).
- **Zukowski:** no logos or title cards in the first 5-15 s; about 30 s of gameplay is enough for Coming Soon; one
  really good trailer.
- **UNCONFIRMED:** no length limit or trailer count is stated by Valve.

## Timeline [G][H][P][Q]
- **Store page review:** 3-5 business days. Submit at least 7 business days before the page should be live.
- **Coming Soon page:** must be up at least 2 weeks before release.
- **After paying the fee:** a **21-day** wait before release (older guides say 30). Tax verification can take up to 30 days.
- **For Nov 13:** to be live on Nov 13, the page goes to review by about **Nov 4**.

## Steam Direct fee [S]
- $100 per app, non-refundable.
- Recouped in the payment after the app reaches $1,000 adjusted gross revenue.

## Sources
A /doc/store/assets · B /doc/store/assets/standard · C /doc/store/assets/libraryassets · D /doc/store/assets/community ·
E /doc/store/assets/eventassets · F /doc/store/assets/rules · G /doc/store/coming_soon · H /doc/store/releasing ·
I /doc/store/page/description · J /doc/store/page/assets · K /doc/store/page · L /doc/store/tags · N /doc/store/trailer ·
P /doc/store/review_process · Q /doc/gettingstarted/onboarding · S /doc/gettingstarted/appfee (all on
partner.steamgames.com) · M howtomarketagame.com/2020/05/25/10tips-summer-sale/ ·
M2 howtomarketagame.com/2020/11/12/steam-101-how-to-tag-your-game/ ·
O howtomarketagame.com/2025/03/10/when-should-i-post-my-steam-coming-soon-page/ · tag list
store.steampowered.com/tagdata/populartags/english
