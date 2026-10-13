// The list: a sheet off a notepad, taped to the garage wall, in your handwriting (World Career). Why you're doing this
// at the top, the ladder to the San Velocita Grand Prix down the middle (crossed off in pen as it happens), this year's
// ambition at the bottom. Drawn on a canvas that js/pitgarage.js puts on the wall (setList); main.js says what's on it
// (draw) and plays the pen: a line being crossed off, an answer being written in, a choice pencilled in before you pick.
const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive'; // (the registry desk's pen: js/claimoffice.js)
const PEN = '#121c58', PENCIL = 'rgba(70,70,78,.55)', PAPER = '#f2eee2', RULE = 'rgba(70,120,190,.28)', MARGIN = 'rgba(200,60,60,.45)';
export const LIST_W = 768, LIST_H = 1088;
const X0 = 108, LINE = 58, TOP = 150; // (the margin, the ruled lines, the first line)

// a little wobble that's the same every time it's drawn (seeded by the line)
const wob = (seed, t) => Math.sin(seed * 12.9898 + t * 7.1) * 0.5 + Math.sin(seed * 78.233 + t * 3.3) * 0.5;

export class ListPaper {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = LIST_W; this.canvas.height = LIST_H;
    this.g = this.canvas.getContext('2d');
    this.state = null; this.anim = null; this.onDraw = null;
  }
  // state: { why, rungs: [{ key, text, done }], next, amb: { label, result } | null, whyPreview, ambPreview }
  // reveal: { key: 'why' | 'amb' | a rung's key, k: 0..1 } (the pen's progress on that line)
  draw(state = this.state, reveal = null) {
    this.state = state; if (!state) return;
    const g = this.g, W = LIST_W, H = LIST_H;
    g.save(); g.clearRect(0, 0, W, H);
    // the sheet (a little torn along the top, where it came off the pad)
    g.fillStyle = PAPER; g.beginPath(); g.moveTo(0, 18);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, 12 + Math.abs(wob(x, 1)) * 10);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    // (a few greys, so it isn't flat in the room's light)
    const sh = g.createLinearGradient(0, 0, W, H); sh.addColorStop(0, 'rgba(255,255,255,.12)'); sh.addColorStop(1, 'rgba(90,70,40,.1)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    g.strokeStyle = RULE; g.lineWidth = 2;
    for (let y = TOP + 14; y < H - 30; y += LINE) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = MARGIN; g.beginPath(); g.moveTo(X0 - 22, 30); g.lineTo(X0 - 22, H); g.stroke();
    // tape at the top corners
    for (const [x, r] of [[70, -0.5], [W - 70, 0.45]]) { g.save(); g.translate(x, 22); g.rotate(r); g.fillStyle = 'rgba(232,222,190,.78)'; g.fillRect(-58, -18, 116, 38); g.restore(); }

    let y = TOP;
    // why
    g.font = `700 36px ${HAND}`; g.fillStyle = PEN; g.textBaseline = 'alphabetic';
    g.fillText('Why?', X0, y);
    const wx = X0 + g.measureText('Why? ').width;
    this.write(state.why || state.whyPreview, wx, y, 38, state.why ? PEN : PENCIL, reveal && reveal.key === 'why' ? reveal.k : 1);
    y += LINE * 1.35;
    // the list
    g.font = `700 40px ${HAND}`; g.fillStyle = PEN; g.fillText('The list', X0, y);
    this.line(X0, y + 10, X0 + g.measureText('The list').width + 8, 77, 1, 2.5);
    y += LINE;
    const step = state.rungs.length > 12 ? 52 : LINE; // (a long list: a little closer, so this year's line keeps its room)
    for (const r of state.rungs) {
      const strikeK = reveal && reveal.key === r.key ? reveal.k : r.done ? 1 : 0, fresh = state.fresh && state.fresh.includes(r.key);
      const writeK = reveal && reveal.key === 'w:' + r.key ? reveal.k : r.hidden ? 0 : 1;
      g.font = `700 35px ${HAND}`;
      const tw = g.measureText(r.text).width;
      if (writeK < 1 || r.pencil) { this.write(r.text, X0, y, 35, r.pencil ? PENCIL : PEN, writeK, 700); y += step; continue; } // (being written in, or pencilled)
      // (a crossed-off line goes a little grey: the next one is the one that matters)
      g.fillStyle = strikeK >= 1 && !fresh ? 'rgba(29,43,110,.6)' : PEN; g.fillText(r.text, X0, y);
      if (strikeK > 0 && !(fresh && !reveal)) {
        this.line(X0 - 6, y - 10 + wob(r.text.length, 1) * 2, X0 + tw + 10, r.text.length, strikeK, 3.2);
        if (r.done && r.done.track && strikeK >= 1) { g.font = `600 24px ${HAND}`; g.fillStyle = PENCIL; g.fillText(`${r.done.track.split(' ').slice(0, 2).join(' ')} '${String(r.done.y).slice(2)}`, X0 + tw + 22, y); }
      }
      // the next one: an arrow in the margin
      if (r.key === state.next) this.arrow(X0 - 76, y - 11);
      y += step;
    }
    if (state.allDone) { g.font = `600 31px ${HAND}`; g.fillStyle = PEN; g.fillText('What now?', X0 + 40, y); y += LINE; }
    // this year
    y = Math.max(y + LINE * 0.3, H - LINE * 1.8);
    g.font = `700 38px ${HAND}`; g.fillStyle = PEN; g.fillText(`${state.year}:`, X0, y);
    const ax = X0 + g.measureText(`${state.year}: `).width + 10, a = state.amb;
    const atext = a ? a.label : state.ambPreview;
    this.write(atext, ax, y, 40, a ? PEN : PENCIL, reveal && reveal.key === 'amb' ? reveal.k : 1);
    if (a && atext) {
      g.font = `600 40px ${HAND}`; const aw = g.measureText(atext).width;
      // (boxed: it's the one you said out loud)
      this.box(ax - 10, y - 38, aw + 24, 52, reveal && reveal.key === 'amb' ? reveal.k : 1);
      if (a.result) {
        const k = reveal && reveal.key === 'amb-result' ? reveal.k : (state.fresh || []).includes('amb') && !reveal ? 0 : 1;
        if (k > 0) {
          if (a.result.made) this.tick(ax + aw + 40, y - 14, k); else this.line(ax - 6, y - 10, ax + aw + 10, 3, k, 3.2);
          if (k >= 1) { g.font = `700 36px ${HAND}`; g.fillStyle = PEN; g.fillText(`P${a.result.pos}`, ax + aw + (a.result.made ? 76 : 30), y); }
        }
      }
    } else if (!atext) { g.strokeStyle = 'rgba(29,43,110,.35)'; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(ax, y + 6); g.lineTo(ax + 300, y + 6); g.stroke(); g.setLineDash([]); }
    g.restore();
    if (this.onDraw) this.onDraw();
  }
  // handwriting, revealed left to right as the pen goes (k 0..1)
  write(text, x, y, size, color, k = 1, weight = 700) {
    if (!text || k <= 0) return;
    const g = this.g; g.save(); g.font = `${weight} ${size}px ${HAND}`;
    const w = g.measureText(text).width;
    if (k < 1) { g.beginPath(); g.rect(x - 4, y - size * 1.2, w * k + 4, size * 1.8); g.clip(); }
    g.fillStyle = color; g.fillText(text, x, y); g.restore();
  }
  // a pen stroke from (x0, y) to x1, drawn as far as k
  line(x0, y, x1, seed, k = 1, width = 3) {
    const g = this.g, x = x0 + (x1 - x0) * Math.min(1, k), n = Math.max(2, Math.ceil((x - x0) / 18));
    g.save(); g.strokeStyle = PEN; g.lineWidth = width; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i <= n; i++) { const t = i / n, px = x0 + (x - x0) * t; g[i ? 'lineTo' : 'moveTo'](px, y + wob(seed, px * 0.01) * 2.2 - t * 3); }
    g.stroke(); g.restore();
  }
  box(x, y, w, h, k = 1) {
    if (k <= 0) return;
    const g = this.g, per = 2 * (w + h), len = per * Math.min(1, k);
    g.save(); g.strokeStyle = PEN; g.lineWidth = 2.6; g.lineJoin = 'round'; g.setLineDash([len, per]); g.beginPath();
    g.moveTo(x, y + 2); g.lineTo(x + w, y - 1); g.lineTo(x + w + 2, y + h); g.lineTo(x - 1, y + h + 2); g.closePath(); g.stroke(); g.restore();
  }
  tick(x, y, k = 1) {
    const g = this.g, a = [x - 16, y], b = [x - 4, y + 14], c = [x + 22, y - 22], t1 = Math.min(1, k * 2), t2 = Math.max(0, k * 2 - 1);
    g.save(); g.strokeStyle = PEN; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(...a);
    g.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1);
    if (t2 > 0) g.lineTo(b[0] + (c[0] - b[0]) * t2, b[1] + (c[1] - b[1]) * t2);
    g.stroke(); g.restore();
  }
  arrow(x, y) {
    const g = this.g; g.save(); g.strokeStyle = PEN; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, y + 2); g.quadraticCurveTo(x + 24, y - 4, x + 48, y); g.moveTo(x + 36, y - 10); g.lineTo(x + 49, y); g.lineTo(x + 36, y + 10); g.stroke(); g.restore();
  }
  // play the pen on one line (key), then call done; each frame redraws the sheet
  play(key, ms, done) {
    const t0 = performance.now(), calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(this.anim);
    const step = (t) => {
      const k = calm ? 1 : Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 2);
      this.draw(this.state, { key, k: e });
      if (k < 1) this.anim = requestAnimationFrame(step); else { this.anim = null; done && done(); }
    };
    this.anim = requestAnimationFrame(step);
  }
  get busy() { return this.anim != null; }
}
