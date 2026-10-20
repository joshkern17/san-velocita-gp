// Circuit Designer: My Circuits with a picture of each, and share codes. A share code is the circuit itself, packed
// (deflate, then base64url) into a line of text to paste anywhere; Open › Enter A Share Code turns it back. The map's
// scenery, the photo ground and the real land heights stay out (they'd make it huge): whoever opens it pulls them again
// from the MAP tab. The points keep their heights, so the road is the same. (Steam Workshop later, on the same codes.)
import { sampleTrack, THEMES, minNodes } from './track.js';
import { sfx } from './audio.js';
import { bigSet } from './backup.js';

const $ = (id) => document.getElementById(id);
const PREFIX = 'SVGP1.';
const LEAVE_OUT = ['osm', 'ground', 'terrain'];

// the circuit as a line, fitted in a box (an SVG string), and its length; kept per circuit while it's unchanged
const thumbs = new Map();
export function trackThumb(t) {
  const key = t.name + '|' + (t.saved || '') + '|' + t.points.length;
  if (thumbs.has(key)) return thumbs.get(key);
  let out = { svg: '', km: 0 };
  try {
    if (t.points.length >= minNodes(t)) {
      const T = sampleTrack(t), step = Math.max(1, Math.round(T.N / 160));
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); c = Math.min(c, T.Z[i]); d = Math.max(d, T.Z[i]); }
      const s = 84 / Math.max(b - a, d - c, 1), ox = 50 - (a + b) / 2 * s, oz = 50 - (c + d) / 2 * s;
      const p = (i) => `${(T.X[i] * s + ox).toFixed(1)},${(T.Z[i] * s + oz).toFixed(1)}`;
      let path = 'M' + p(0);
      for (let i = step; i < T.N; i += step) path += 'L' + p(i);
      if (!T.open) path += 'Z';
      const [sx, sz] = p(T.open ? (T.cut + 1) % T.N : 0).split(',');
      out = { svg: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${path}"/><circle cx="${sx}" cy="${sz}" r="4"/></svg>`, km: (T.raceL ?? T.L) / 1000 };
    }
  } catch (e) {}
  thumbs.set(key, out);
  return out;
}

export async function shareCode(t) {
  const lean = { ...t }; for (const k of LEAVE_OUT) delete lean[k]; delete lean.saved;
  const z = new Blob([JSON.stringify(lean)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const u = new Uint8Array(await new Response(z).arrayBuffer());
  let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return PREFIX + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// a code back into a circuit (spaces, line breaks and anything round it pasted along are ignored); throws if it isn't one
export async function readCode(text) {
  const m = String(text).replace(/\s+/g, '').match(/SVGP1\.([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('code');
  const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), u = Uint8Array.from(b, ch => ch.charCodeAt(0));
  const z = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const t = JSON.parse(await new Response(z).text());
  if (!Array.isArray(t.points) || t.points.length < minNodes(t)) throw new Error('code');
  return t;
}

export function installShare(Editor) {
  Object.assign(Editor.prototype, {
    // a row's picture and its length (the pop-up lists take { thumb, desc })
    thumbRow(t, desc) {
      const th = trackThumb(t);
      return { thumb: th.svg, desc: [th.km ? th.km.toFixed(2) + ' km' : '', desc].filter(Boolean).join(' · ') };
    },
    openModal() {
      const list = this.savedList();
      const rows = [
        { title: 'Enter A Share Code', desc: 'A circuit someone sent you, pasted in.', pick: () => this.codeModal() },
        { title: 'From A File', desc: 'A circuit saved as a file (.svgp.json).', pick: () => { this.closeModal(); $('ed-file').value = ''; $('ed-file').click(); } },
        ...list.map((p, i) => ({
          title: p.name, ...this.thumbRow(p, `${THEMES[p.env?.theme || 'grass'].label} · ${new Date(p.saved || 0).toLocaleDateString()}`),
          pick: () => this.load(p, true),
          share: () => this.shareModal(p),
          del: () => { const l = this.savedList(); l.splice(i, 1); bigSet('svgp.tracks', JSON.stringify(l)); this.openModal(); },
        })),
      ];
      this.modalList('My Circuits', rows, '', list.length ? (this.padOn ? 'Y: share the one picked · X: delete it.' : '') : 'Nothing saved yet: Save keeps the circuit you\'re on here.');
    },
    // Share: this circuit as a code to copy, or a file
    async shareModal(t = this.track) {
      if (t === this.track && !this.needTrack('SHARE')) return;
      const box = $('ed-modal-box');
      box.innerHTML = `<h3>Share</h3><p class="muted">Send this code to anyone with the game: Open › Enter A Share Code turns it back into "${esc(t.name)}". Map scenery and photo ground stay out of it; they can pull those again from the MAP tab.</p>
        <textarea id="ed-code" class="ed-code" readonly spellcheck="false">Packing…</textarea><p class="muted" id="ed-code-msg"></p>
        <div class="foot"><button data-file>Save As A File</button> <button data-close>Close</button> <button data-ok class="hot">Copy Code</button></div>`;
      $('ed-modal').hidden = false;
      $('ed-modal').onclick = (e) => { if (e.target.id === 'ed-modal') this.closeModal(); };
      box.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
      box.querySelector('[data-file]').addEventListener('click', () => { this.exportFile(t); this.closeModal(); });
      const ta = $('ed-code'), msg = $('ed-code-msg');
      let code = '';
      try { code = await shareCode(t); } catch (e) { msg.textContent = 'Couldn\'t pack it: save it as a file instead.'; return; }
      if ($('ed-code') !== ta) return; // (closed or replaced meanwhile)
      ta.value = code; msg.textContent = `${code.length.toLocaleString()} characters.`;
      box.querySelector('[data-ok]').addEventListener('click', async () => {
        ta.select();
        try { await navigator.clipboard.writeText(code); } catch (e) { document.execCommand && document.execCommand('copy'); }
        sfx.select(); msg.textContent = 'Copied. Paste it anywhere.';
      });
    },
    // Open › Enter A Share Code
    codeModal() {
      const box = $('ed-modal-box');
      box.innerHTML = `<h3>Share Code</h3><p class="muted">Paste the code (it starts SVGP1.). The circuit opens here; Save keeps it in My Circuits.</p>
        <textarea id="ed-code" class="ed-code" spellcheck="false" placeholder="SVGP1.…"></textarea><p class="muted" id="ed-code-msg"></p>
        <div class="foot"><button data-close>Cancel</button> <button data-ok class="hot">Open It</button></div>`;
      $('ed-modal').hidden = false;
      $('ed-modal').onclick = (e) => { if (e.target.id === 'ed-modal') this.closeModal(); };
      const ta = $('ed-code'), msg = $('ed-code-msg');
      const go = async () => {
        try { const t = await readCode(ta.value); t.name = t.name || 'Shared Circuit'; this.load(t); }
        catch (e) { sfx.error(); msg.textContent = 'That isn\'t a whole share code. Copy all of it, from SVGP1. to the end.'; }
      };
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') this.closeModal(); if (e.code === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
      box.querySelector('[data-ok]').addEventListener('click', go);
      box.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
      ta.focus();
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(s => { if (!ta.value && /SVGP1\./.test(s)) { ta.value = s.trim(); msg.textContent = 'Pasted from the clipboard.'; } }, () => {});
    },
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
