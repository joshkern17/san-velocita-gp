// Saved liveries: every save is an entry of its own (a design is never written over), newest first, each with a small
// photo of the car (carphoto.js) to pick it by. The Garage's Saved Liveries list and the Livery Designer's Files tab
// both read and write it. Stored as before (svgp.teams), so older saves are all still there.
import { carPhoto } from './carphoto.js';

const KEY = 'svgp.teams', MAX = 60;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
// (full storage: the oldest go, photos first, until it fits)
function write(list) {
  list = list.slice(0, MAX);
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { const k = list.findLastIndex(x => x.thumb); if (k > 0) list[k] = { ...list[k], thumb: null }; else if (list.length > 1) list.pop(); else return false; }
  }
}
// (saves from before they had ids get one, from when they were made)
export function savedLiveries() {
  const list = read(); let fix = false;
  list.forEach((e, i) => { if (!e.id) { e.id = 'lv' + (e.saved || i).toString(36) + i; fix = true; } });
  if (fix) write(list);
  return list;
}
// a small JPEG of the car wearing it
function thumbOf(car) {
  return new Promise((res) => {
    let src; try { src = carPhoto(car, 7); } catch (e) { return res(null); }
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 168; c.height = 109; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); };
    img.onerror = () => res(null); img.src = src;
  });
}
// save the livery as a new entry (its photo follows a moment later); false: no room at all
export function saveLivery(car, onThumb) {
  const e = { id: 'lv' + Date.now().toString(36), name: car.teamName || 'My Team', car: JSON.parse(JSON.stringify(car)), saved: Date.now(), thumb: null };
  if (!write([e, ...savedLiveries()])) return false;
  thumbOf(e.car).then(t => { if (!t) return; const list = savedLiveries(), x = list.find(y => y.id === e.id); if (x) { x.thumb = t; write(list); if (onThumb) onThumb(); } });
  return e;
}
export function deleteLivery(id) { write(savedLiveries().filter(e => e.id !== id)); }
// (the photo for one without: older saves, made when it's first shown)
const making = new Set();
export function ensureThumb(id, onThumb) {
  const e = savedLiveries().find(x => x.id === id); if (!e || e.thumb || making.has(id)) return;
  making.add(id);
  thumbOf(e.car).then(t => { if (!t) return; const list = savedLiveries(), x = list.find(y => y.id === id); if (x) { x.thumb = t; write(list); if (onThumb) onThumb(); } });
}
// (the day, and the time: saves of the same team on the same day tell apart)
export const liveryDate = (e) => { if (!e.saved) return ''; const d = new Date(e.saved); return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; };
