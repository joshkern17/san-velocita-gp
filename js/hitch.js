// dev: the freeze log. Every frame that takes over LONG ms (the picture stops), written down with what the game was
// doing: the screen, the slow calls inside it (hitch.wrap / hitch.time, the ones over SLOW ms), browser tasks outside
// the frame that ran long (a model parsed, a save written) and the last things that happened (hitch.note). Kept in
// localStorage svgp.hitchLog (serve.py mirrors it to saves/storage/svgp.hitchLog.txt, so a session's freezes can be read
// back after playing), the newest MAX.
//   hitch.start(() => screenName)   hitch.frame(now) each rAF   hitch.note('what')   hitch.wrap(obj, 'method', 'label')
//   hitch.time('label', () => work)   hitch.log() -> entries   hitch.clear()
const LONG = 100, SLOW = 25, MAX = 300, KEY = 'svgp.hitchLog';
let on = false, last = 0, where = () => '', notes = [], slow = [], tasks = [], log = [], dirty = false, saveT = 0;
const now = () => performance.now();
const trim = (a, t) => { while (a.length && a[0].t < t) a.shift(); };

export const hitch = {
  start(screenFn) {
    if (on) return; on = true; where = screenFn || where;
    try { log = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { log = []; }
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) tasks.push({ t: e.startTime + e.duration, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch {}
    addEventListener('pagehide', () => this.save());
  },
  note(what) { if (on) { notes.push({ t: now(), what }); if (notes.length > 60) notes.shift(); } },
  // a slow call: its time, if it's worth a note
  time(label, fn) {
    if (!on) return fn();
    const t0 = now(); try { return fn(); } finally { const ms = now() - t0; if (ms > SLOW) slow.push({ t: now(), what: `${label} ${Math.round(ms)}ms` }); }
  },
  wrap(obj, name, label = name) {
    const f = obj && obj[name]; if (typeof f !== 'function' || f.__hitch) return;
    const w = function (...a) { return hitch.time(label, () => f.apply(this, a)); }; w.__hitch = true; obj[name] = w;
  },
  frame(t) {
    if (!on) return;
    const gap = last ? t - last : 0, from = last; last = t;
    if (gap > LONG && !document.hidden) {
      const in_ = (a) => a.filter(x => x.t >= from - 20).map(x => x.what || `task ${x.ms}ms`);
      log.push({ at: new Date().toISOString().slice(0, 19), ms: Math.round(gap), screen: where(), slow: in_(slow), tasks: in_(tasks), before: notes.filter(x => x.t >= from - 1500).map(x => x.what).slice(-6) });
      if (log.length > MAX) log.splice(0, log.length - MAX);
      dirty = true;
    }
    trim(slow, t - 3000); trim(tasks, t - 3000); trim(notes, t - 5000);
    if (dirty && t - saveT > 5000) this.save();
  },
  save() { if (!dirty) return; dirty = false; saveT = now(); try { localStorage.setItem(KEY, JSON.stringify(log)); } catch {} },
  log: () => log,
  clear() { log = []; dirty = true; hitch.save(); },
};
