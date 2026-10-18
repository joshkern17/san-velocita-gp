# sanvelocita site (v1)

One static page in the game's neon-signal look. Built 2026-10-18.

- `index.html`, `style.css`, `main.js`, `fonts/`, `media/`.
- Videos in `media/` are gitignored (they come from `marketing/footage/`, cut with ffmpeg). Rebuild them before deploying:
  - hero = Spa heli, Spa dolly (F40), GT2 chase, Spa orbit, Miata dolly;
  - p1–p5 = Spa heli, Spa wheel, GT2 dolly, Miata dolly, Miata heli;
  - shot lists in `shots/`.
- **To go live:**
  - set `SIGNUP_ENDPOINT` in `main.js` (the email service's form-post URL);
  - fill in `SOCIALS`;
  - deploy the folder, media included, to the free host.
- **Open question:** the Helvetica Now woff2 files. Publishing them on a website needs a web-font licence. Check the
  game's font licence, or swap in a free lookalike for the site.

## Gotcha: glow-only text
The game draws type as glow with a transparent fill. That only works in Chromium: Safari paints nothing. On the web,
text keeps a solid fill with the glow on top. Only the wordmark keeps transparent fill (it uses background-clip:text,
which Safari supports). Check in WebKit before shipping (playwright-core `webkit`, installed 2026-10-18).
