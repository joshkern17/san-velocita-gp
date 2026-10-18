// San Velocita GP site: fade sections in as they arrive, play clips only while they're on screen, and send sign-ups
// to the email service once one is set (SIGNUP_ENDPOINT: the provider's form-post URL; empty = not live yet).
const SIGNUP_ENDPOINT = "";
const SOCIALS = { tiktok: "", youtube: "", instagram: "", x: "", bluesky: "" };

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// pillar clips: load and play when in view, pause when not (keeps phones cool)
const clips = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting) { if (!v.src && v.dataset.src) v.src = v.dataset.src; v.play().catch(() => {}); }
    else v.pause();
  }
}, { threshold: 0.35 });
document.querySelectorAll(".pillar video").forEach((v) => clips.observe(v));

// socials: link the ones that exist, grey out the rest
document.querySelectorAll("[data-social]").forEach((a) => {
  const url = SOCIALS[a.dataset.social];
  if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; } else { a.setAttribute("aria-disabled", "true"); a.removeAttribute("href"); }
});

// sign-up
document.querySelectorAll(".signup").forEach((form) => {
  const note = form.querySelector(".form-note"), input = form.querySelector("input");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!input.checkValidity()) { note.textContent = "That email doesn't look right."; note.classList.remove("ok"); input.focus(); return; }
    if (!SIGNUP_ENDPOINT) { note.textContent = "Sign-ups open very soon. Check back in a few days."; return; }
    try {
      const body = new FormData(); body.append("email", input.value);
      await fetch(SIGNUP_ENDPOINT, { method: "POST", body, mode: "no-cors" });
      note.textContent = "You're on the list. See you on the grid."; note.classList.add("ok"); input.value = "";
    } catch { note.textContent = "Couldn't reach the server. Try again in a moment."; }
  });
});
