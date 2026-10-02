// Your saves, kept somewhere safer than the browser. Browsers can throw a site's storage away (Chrome rebuilds its
// storage database when it finds it damaged, and drops sites' data when the disk is nearly full), so:
//  - everything the game saves (localStorage keys starting svgp.) is mirrored to serve.py, which writes it to saves/
//    next to the game, with a dated copy each day (see serve.py);
//  - your livery images (IndexedDB svgp-assets) are mirrored there too;
//  - at start-up, anything missing from the browser is restored from saves/ before the game reads it;
//  - the browser is asked to keep the game's storage (persistent storage);
//  - Options > Backup exports everything to a file, and imports one.
// Served any other way (the single-file build, a test server), the mirror quietly does nothing.

const PREFIX = 'svgp.';
let online = false;            // serve.py is keeping saves
const pending = new Map(), timers = new Map();
export const backupState = { online: false, restored: 0, restoredAssets: 0 };

// ---------- start-up: restore, then start mirroring ----------
export async function restoreSaves() {
  try { navigator.storage?.persist?.(); } catch (e) {}
  let data = null;
  try {
    const r = await fetch('__saves', { cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) data = await r.json();
  } catch (e) {}
  if (!data) return backupState;
  online = backupState.online = true;
  // the browser lost something: put it back (anything the browser still has is newer, and stays)
  for (const [k, v] of Object.entries(data.keys || {})) {
    if (!k.startsWith(PREFIX)) continue;
    try { if (localStorage.getItem(k) === null) { localStorage.setItem(k, v); backupState.restored++; } } catch (e) {}
  }
  // and the other way: whatever the browser has that the backup doesn't (first run, or saved while it was offline)
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX) && !(k in (data.keys || {}))) queue(k); }
  } catch (e) {}
  watchStorage();
  syncAssets(new Set(data.assets || []));
  return backupState;
}

// every localStorage write and delete of a game key goes to the backup too (a moment later, once per burst)
function watchStorage() {
  const proto = Storage.prototype, set = proto.setItem, del = proto.removeItem;
  proto.setItem = function (k, v) { set.call(this, k, v); if (this === window.localStorage && String(k).startsWith(PREFIX)) queue(String(k)); };
  proto.removeItem = function (k) { del.call(this, k); if (this === window.localStorage && String(k).startsWith(PREFIX)) queue(String(k), true); };
}
function queue(k, gone = false) {
  if (!online) return;
  pending.set(k, gone);
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => send(k), 600));
}
function send(k) {
  const gone = pending.get(k); pending.delete(k); timers.delete(k);
  const v = gone ? null : localStorage.getItem(k);
  const url = (gone || v === null ? '__del' : '__save') + '?k=' + encodeURIComponent(k);
  fetch(url, { method: 'POST', body: v ?? '', keepalive: (v || '').length < 60000 }).catch(() => {});
}
// before the window closes: anything still waiting goes now
window.addEventListener('pagehide', () => { for (const k of [...pending.keys()]) send(k); });

// ---------- livery images (IndexedDB) ----------
function assetDB() {
  return new Promise((res) => {
    if (!('indexedDB' in window)) return res(null);
    const r = indexedDB.open('svgp-assets', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('assets');
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  });
}
const idbAll = (d) => new Promise(res => {
  const out = {}, q = d.transaction('assets').objectStore('assets').openCursor();
  q.onsuccess = () => { const c = q.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
  q.onerror = () => res(out);
});
const idbPut = (d, id, v) => new Promise(res => { const tx = d.transaction('assets', 'readwrite'); tx.objectStore('assets').put(v, id); tx.oncomplete = res; tx.onerror = res; });
async function syncAssets(saved) {
  const d = await assetDB(); if (!d) return;
  const have = await idbAll(d);
  // images the browser has lost: fetch them back
  for (const id of saved) {
    if (id in have) continue;
    try { const r = await fetch('__asset?id=' + encodeURIComponent(id)); if (r.ok) { await idbPut(d, id, await r.text()); backupState.restoredAssets++; } } catch (e) {}
  }
  // images the backup hasn't got: send them
  for (const [id, v] of Object.entries(have)) if (!saved.has(id) && typeof v === 'string') backupAsset(id, v);
}
// called whenever a livery image is stored (livery.js)
export function backupAsset(id, dataUrl) {
  if (!online || typeof dataUrl !== 'string') return;
  fetch('__asset?id=' + encodeURIComponent(id), { method: 'POST', body: dataUrl }).catch(() => {});
}

// ---------- a backup file you keep yourself ----------
export async function exportBackup() {
  const keys = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys[k] = localStorage.getItem(k); }
  const d = await assetDB(), assets = d ? await idbAll(d) : {};
  const blob = new Blob([JSON.stringify({ kind: 'svgp-backup', v: 1, made: new Date().toISOString(), keys, assets })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `san-velocita-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { keys: Object.keys(keys).length, assets: Object.keys(assets).length };
}
// read a backup file and write it all back (then the game reloads to pick it up)
export function importBackup() {
  return new Promise((res) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return res(null);
      try {
        const b = JSON.parse(await f.text());
        if (!b || b.kind !== 'svgp-backup') return res({ error: 'That isn\'t a San Velocita backup file.' });
        for (const [k, v] of Object.entries(b.keys || {})) if (k.startsWith(PREFIX)) localStorage.setItem(k, v);
        const d = await assetDB();
        if (d) for (const [id, v] of Object.entries(b.assets || {})) { await idbPut(d, id, v); backupAsset(id, v); }
        res({ keys: Object.keys(b.keys || {}).length, assets: Object.keys(b.assets || {}).length });
      } catch (e) { res({ error: 'Couldn\'t read that file.' }); }
    };
    inp.click();
  });
}
