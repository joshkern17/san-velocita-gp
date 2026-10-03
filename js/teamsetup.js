// The Team Setup Wizard (World Career): how you get in, the car, a title sponsor, your second driver, then the lights.
// It's game UI over the garage, not the computer: the steps run along the top like sectors (what you picked is
// written under each), the choices are columns with a bracket that slides to the one you're on, the money rolls as
// you choose, and starting the season runs the start lights. The picks and the money live in js/wcareer.js
// (setupPick / setupMove / setupBudget / setupApply); main.js opens it and says what happens when it's done (src.apply).
// Controls: left / right choose, A / Enter next (select a column twice with the mouse), B / Esc back (or out to the
// garage from the first step), LB / RB step back and forward.
import * as WC from './wcareer.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + ((c ?? 0x888888) >>> 0).toString(16).padStart(6, '0');
const NAME = { entry: 'How you get in', car: 'The car', sponsor: 'Title sponsor', mate: 'Second driver', ready: 'Ready' };
const WANTS = { top: 'results', finish: 'finishing', clean: 'clean racing', gain: 'overtakes', lead: 'leading', beat: 'beating a rival team' };
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// a meter: the signal ramp in segments, filling from empty whenever it's shown (--tv is 0..1)
const meter = (v, n = 10) => `<i class="tsw-m" style="--tv:${Math.max(0, Math.min(1, v)).toFixed(3)};--n:${n}"></i>`;
const tag = (t, cls = '') => `<span class="tsw-tag ${cls}">${t}</span>`;
const stat = (k, v, f, n) => `<div class="tsw-st"><span>${k}</span>${meter(f, n)}<em>${v}</em></div>`;
// a driver's photo, or a silhouette drawn in light until the portraits arrive
const face = (p) => p && p.photo ? `<img class="tsw-face" src="${p.photo}">`
  : `<svg class="tsw-face" viewBox="0 0 40 40"><circle cx="20" cy="15" r="7" /><path d="M6 39c0-8.5 6.2-13 14-13s14 4.5 14 13" /></svg>`;

export class TeamSetup {
  constructor(el, src) {
    this.el = el; this.src = src; this.isOpen = false; this.busy = false; this.sel = 0; this.shown = null;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('mousemove', (e) => { const c = e.target.closest('.tsw-col'); if (c && !this.busy && +c.dataset.i !== this.sel && !c.classList.contains('dis')) this.focus(+c.dataset.i); });
    addEventListener('resize', () => { if (this.isOpen) this.place(true); });
  }
  get w() { return this.src.world(); }
  get steps() { return WC.setupSteps(this.w); }
  get at() { return Math.min(this.w.setup.at || 0, this.steps.length - 1); }
  get step() { return this.steps[this.at]; }

  open() {
    const w = this.w; if (!w || WC.setupDone(w)) return;
    this.isOpen = true; this.busy = false; this.money = null;
    const t = w.teams[w.player.team];
    this.el.innerHTML = `<div class="tsw-shade"></div><div class="tsw-scan"></div>
      <header class="tsw-head"><h1>Team Setup</h1><p>${esc(t.name)} &middot; ${esc(WC.seriesById(w.player.series).name)} &middot; ${w.year}</p></header>
      <div class="tsw-money"><div><small>In the bank</small><b data-k="now"></b></div><div><small>After your choices</small><b data-k="after"></b><em class="tsw-delta"></em></div></div>
      <nav class="tsw-rail"></nav>
      <div class="tsw-stage"><div class="tsw-q"><h2></h2><p></p></div><div class="tsw-cols"></div><div class="tsw-focus"></div></div>
      <div class="tsw-foot"><span class="tsw-count"></span><button class="sv-btn hot tsw-next" data-act="next"></button></div>
      <div class="tsw-lights"><div class="tsw-lamps">${'<i></i>'.repeat(5)}</div><b>Lights out</b><small></small></div>`;
    this.el.hidden = false;
    this.el.classList.remove('leave'); this.el.classList.add('enter');
    setTimeout(() => this.el.classList.remove('enter'), 1400);
    this.render(0);
    // (the classifieds' photos take a moment to render: do them now, while you read the first step)
    setTimeout(() => { if (this.isOpen) (w.ads || []).slice(0, 3).forEach(a => this.src.photo(a)); }, 1500);
  }
  close(done = false) {
    if (!this.isOpen) return;
    this.isOpen = false; this.el.classList.add('leave');
    setTimeout(() => this.el.parentElement.classList.remove('tsw-lit'), done ? 500 : 0);
    setTimeout(() => { if (!this.isOpen) { this.el.hidden = true; this.el.innerHTML = ''; this.el.classList.remove('leave'); } }, done ? 700 : 300);
  }

  // ---------- input ----------
  input({ left, right, ok, back, tabPrev, tabNext }) {
    if (!this.isOpen) return false;
    if (this.busy) { if (ok && this.lights) this.lights.skip(); return true; }
    const n = this.options().length;
    if (left && n) this.focus(this.nextOpen(-1));
    else if (right && n) this.focus(this.nextOpen(1));
    else if (ok || tabNext) this.next();
    else if (back || tabPrev) this.back(!!tabPrev);
    return true;
  }
  // the next column you can afford, that way (or stay put)
  nextOpen(d) { const o = this.options(); for (let i = this.sel + d; i >= 0 && i < o.length; i += d) if (!o[i].dis) return i; return this.sel; }
  click(e) {
    if (this.busy) { if (this.lights) this.lights.skip(); return; }
    const c = e.target.closest('.tsw-col'), b = e.target.closest('[data-act]'), r = e.target.closest('.tsw-rail li.done');
    if (c) { const i = +c.dataset.i; if (c.classList.contains('dis')) { this.src.sfx('error'); return; } if (i !== this.sel) this.focus(i); else this.next(); }
    else if (b && b.dataset.act === 'next') this.next();
    else if (b && b.dataset.act === 'back') this.back();
    else if (r) { const d = +r.dataset.i - this.at; if (d < 0) { WC.setupMove(this.w, d); this.src.sfx('back'); this.src.save(); this.render(-1); } }
  }
  focus(i) {
    if (i === this.sel) return;
    this.sel = i; this.src.sfx('move');
    this.el.querySelectorAll('.tsw-col').forEach((c, k) => c.classList.toggle('on', k === i));
    this.place(); this.foot();
  }
  next() {
    const w = this.w, S = w.setup, step = this.step;
    if (step === 'ready') return this.start();
    const o = this.options()[this.sel]; if (!o) return;
    if (o.dis) { this.src.sfx('error'); this.src.toast(`That's more than you have (${WC.money$(w.money.balance)}).`); return; }
    WC.setupPick(w, step, o.val); WC.setupMove(w, 1);
    this.src.sfx('select'); this.src.save(); this.render(1);
  }
  back(stay = false) {
    if (this.at === 0) { if (!stay) { this.src.sfx('back'); this.close(); this.src.closed(); } return; }
    WC.setupMove(this.w, -1); this.src.sfx('back'); this.src.save(); this.render(-1);
  }

  // ---------- what's on offer at this step: [{ val, dis, html }] ----------
  options() {
    const w = this.w, S = w.setup, step = this.step;
    if (step === 'entry') return WC.setupEntries(w).map(e => ({ val: e.key, ...this.leaves(step, e.key) }));
    if (step === 'car') return (w.ads || []).slice(0, 3).map(a => ({ val: a.id, ...this.leaves(step, a.id) }));
    if (step === 'sponsor') return S.sponsors.map((o, i) => ({ val: i, ...this.leaves(step, i) }));
    if (step === 'mate') return S.drivers.filter(pid => w.people[pid]).map(pid => ({ val: pid, ...this.leaves(step, pid) }));
    return [];
  }
  // what your money would be after this pick (and the others you've made): picked for a moment, then put back
  leaves(step, val) {
    const S = this.w.setup, keep = { ...S.picks };
    WC.setupPick(this.w, step, val); const after = WC.setupBudget(this.w).after; S.picks = keep;
    return { after, dis: after < 0 };
  }

  // ---------- drawing ----------
  render(dir) {
    const w = this.w, S = w.setup, step = this.step, opts = this.options();
    const was = opts.findIndex(o => o.val === S.picks[step]);
    this.sel = was >= 0 ? was : Math.max(0, opts.findIndex(o => !o.dis));
    this.rail(); this.purse();
    const [q, sub] = this.question(step);
    const stage = this.el.querySelector('.tsw-stage'), cols = stage.querySelector('.tsw-cols'), qel = stage.querySelector('.tsw-q');
    const draw = () => {
      qel.querySelector('h2').textContent = q; qel.querySelector('p').textContent = sub;
      cols.className = `tsw-cols n${step === 'ready' ? 0 : opts.length}`;
      cols.innerHTML = step === 'ready' ? this.ready() : opts.map((o, i) => `<div class="tsw-col${i === this.sel ? ' on' : ''}${o.dis ? ' dis' : ''}" data-i="${i}"><i class="tsw-cur"></i>${this.card(step, o, i)}
        <div class="tsw-left"><small>Leaves you</small><b class="${o.dis ? 'neg' : ''}">${o.dis ? 'More than you have' : WC.money$(o.after)}</b></div></div>`).join('');
      this.place(true); this.foot();
      // in: the question wipes on, the columns rise one after another (from the side you're heading)
      if (calm()) return;
      qel.classList.remove('wipe'); void qel.offsetWidth; qel.classList.add('wipe');
      [...cols.children].forEach((c, i) => c.animate([{ opacity: 0, transform: `translate(${(dir || 0) * 36}px, ${dir ? 0 : 14}px)` }, { opacity: 0.25, offset: 0.3 }, { opacity: 0.1, offset: 0.45 }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 60 + i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
      const f = stage.querySelector('.tsw-focus'); f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 60 + this.sel * 70 + 200, fill: 'backwards' });
    };
    if (!dir || calm() || !cols.children.length) return draw();
    // out first: the old columns slide away the other way
    this.busy = true;
    const out = [...cols.children, stage.querySelector('.tsw-focus'), qel].map(c => c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 36}px)` }], { duration: 170, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(() => { out.forEach(a => a.cancel()); this.busy = false; draw(); }, 170);
  }
  question(step) {
    const kept = this.w.setup.picks.entry === 'takeover';
    return {
      entry: ['How do you want to get in?', 'Your winnings, and how much of them you spend before your first race. Everything after this is up to you.'],
      car: ['Pick a car', 'Off the classifieds: Danny sent the links. A tired car is down on power, and its parts are closer to failing.'],
      sponsor: ['Choose a title sponsor', 'Three local businesses want their name on your car. The one you choose sets a target for every race. The others will be watching.'],
      mate: ['Who drives the second car?', `Their points count for the teams' championship, and their car earns prize money too. Potential is your scout's best guess.${kept ? ' The old team\'s driver is still under contract, at what they were paid.' : ''}`],
      ready: ['Ready to go racing', 'Check it over. Nothing is bought or signed until the lights go out.'],
    }[step];
  }
  card(step, o, i) {
    const w = this.w, S = w.setup, $ = WC.money$;
    if (step === 'entry') {
      const e = WC.setupEntries(w)[i];
      return `<div class="tsw-top">${tag(e.level, e.key === 'fresh' ? 'bad' : e.key === 'running' ? 'good' : '')}</div><h3>${esc(e.name)}</h3><div class="tsw-price">${e.cost ? $(e.cost) : 'Free'}</div>
        <p class="tsw-blurb">${esc(e.blurb)}</p><ul class="tsw-gets">${e.gets.map(g => `<li>${esc(g)}</li>`).join('')}</ul>`;
    }
    if (step === 'car') {
      const ad = (w.ads || [])[i], c = this.src.carInfo(ad.chassis), ph = this.src.photo(ad);
      return `${ph ? `<img class="tsw-photo" src="${ph}">` : '<div class="tsw-photo none"></div>'}<div class="tsw-hrow"><h3>${ad.year} ${esc(ad.name)}</h3><div class="tsw-price">${$(ad.price)}</div></div>
        ${stat('Condition', esc(WC.condName(ad.cond)), ad.cond)}${c ? stat('Power', `${c.hp} hp`, c.hp / 450) + stat('Weight', `${c.kg} kg`, 1 - (c.kg - 1100) / 700) : ''}
        <p class="tsw-blurb q" title="${esc(ad.blurb)}">&ldquo;${esc(ad.blurb)}&rdquo;</p><p class="tsw-seller">${esc(ad.seller)}</p>`;
    }
    if (step === 'sponsor') {
      const x = S.sponsors[i], sp = WC.sponsorInfo(x.sid), logo = this.src.logo(x.sid);
      return `<div class="tsw-top">${tag(esc(x.tag), i === 0 ? 'bad' : i === 2 ? 'good' : '')}</div>${logo ? `<img class="tsw-logo" src="${logo}">` : ''}<h3>${esc(sp.name)}</h3>
        <div class="tsw-kpis"><div><small>A round</small><b>${$(x.fee)}</b></div><div><small>Target bonus</small><b>${$(x.bonus)}</b></div><div><small>Signing</small><b>${x.signing ? $(x.signing) : '&mdash;'}</b></div></div>
        ${stat('Patience', `${x.patience} miss${x.patience === 1 ? '' : 'es'}`, x.patience / 6, 6)}
        <p class="tsw-blurb">${esc(x.brand)}. Targets: ${sp.wants.map(k => WANTS[k]).join(', ')}.</p>`;
    }
    // the second driver
    const pid = o.val, p = w.people[pid], a = WC.askOf(w, p), [lo, hi] = S.scout[pid] || [p.pot, p.pot], tr = WC.traitsOf(w, p), under = S.picks.entry === 'takeover' && pid === S.inherited;
    const st = (k, v) => stat(k, Math.round(v), v / 100);
    const cost = a.fee ? `<b class="pos">Brings ${$(a.fee)}</b>` : `<b>${$(under ? Math.round(a.wage * 0.8 / 50) * 50 : a.wage)}<small> a round</small></b>`;
    return `<div class="tsw-who">${face(p)}<div><h3>${esc(p.first)} ${esc(p.last)}</h3><small>${WC.ageOf(w, p)} &middot; ${esc(p.nat)} &middot; ${p.starts ? `${p.starts} starts, ${p.wins} win${p.wins === 1 ? '' : 's'}` : 'no races yet'}</small></div></div>
      <div class="tsw-top">${under ? tag('Under contract') : ''}${tr.map(t => tag(esc(WC.TRAITS[t].name), t === 'paydriver' ? 'good' : '')).join('')}${!under && !tr.length ? tag('No reputation yet', 'dim') : ''}</div>
      ${st('Pace', p.pace)}${st('Consistency', p.cons)}${st('Racecraft', p.craft)}${st('Wet', p.wet)}${st('Aggression', p.aggr)}
      <div class="tsw-pot"><span>Potential</span><i><b style="left:${lo}%;width:${Math.max(3, hi - lo)}%"></b><u style="left:${p.pace}%"></u></i><em>${lo}&ndash;${hi}</em></div>
      <div class="tsw-cost"><span>${a.fee ? 'Seat money' : 'Wage'}</span><span class="tsw-pay">${cost}</span></div>`;
  }
  // the last step: the team, and every number
  ready() {
    const w = this.w, S = w.setup, P = S.picks, $ = WC.money$, B = WC.setupBudget(w), t = WC.myTeam(w);
    const e = WC.setupEntries(w).find(x => x.key === P.entry), ad = P.car && (w.ads || []).find(a => a.id === P.car), o = S.sponsors[P.sponsor], q = w.people[P.mate], logo = o && this.src.logo(o.sid);
    const row = (k, v, cls = '') => `<div class="tsw-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="tsw-ready">
      <div class="tsw-team"><div class="tsw-sw"><i style="background:${hex(t.main)}"></i><i style="background:${hex(t.accent)}"></i></div><h4>${esc(t.name)}</h4>
        <p>${esc(WC.TOWNS[w.home]?.name || '')} &middot; ${esc(WC.seriesById(w.player.series).name)} ${w.year}</p>${ad && this.src.photo(ad) ? `<img class="tsw-photo" src="${this.src.photo(ad)}">` : ''}${logo ? `<img class="tsw-logo" src="${logo}">` : ''}</div>
      <div class="tsw-rows">
        ${row('Way in', e ? esc(e.name) : '')}${row('Car', ad ? `${ad.year} ${esc(ad.name)}` : P.entry === 'running' ? 'A good, developed car' : 'The old team\'s car (tired)')}
        ${row('Title sponsor', o ? esc(WC.sponsorInfo(o.sid).name) : '')}${row('Car 1', `${esc(w.player.name)} (you)`)}${row('Car 2', q ? `${esc(q.first)} ${esc(q.last)}` : '')}
        <i class="tsw-rule"></i>${row('In the bank', $(w.money.balance))}
        ${B.rows.map(([k, v]) => row(esc(k), `${v < 0 ? '&minus;' : '+'}${$(Math.abs(v))}`, v < 0 ? 'out' : 'in')).join('')}
        <i class="tsw-rule"></i>${row('Money after', $(B.after), 'tot' + (B.after < 0 ? ' neg' : ''))}</div></div>`;
  }
  // the steps, like sectors: done ones say what you picked
  rail() {
    const w = this.w, S = w.setup, P = S.picks, steps = this.steps, at = this.at;
    const said = (k) => {
      if (k === 'entry') return WC.setupEntries(w).find(e => e.key === P.entry)?.name;
      if (k === 'car') { const a = (w.ads || []).find(x => x.id === P.car); return a && `${a.year} ${a.name}`; }
      if (k === 'sponsor') return P.sponsor != null && WC.sponsorInfo(S.sponsors[P.sponsor].sid).name;
      if (k === 'mate') { const p = w.people[P.mate]; return p && `${p.first} ${p.last}`; }
    };
    const el = this.el.querySelector('.tsw-rail'), n = steps.length;
    el.style.setProperty('--n', n);
    el.innerHTML = `<i class="tsw-line"><b style="width:${(at / Math.max(1, n - 1) * 100).toFixed(2)}%"></b></i><ol>${steps.map((k, i) => `<li class="${i < at ? 'done' : i === at ? 'on' : ''}" data-i="${i}"><i></i><span>${String(i + 1).padStart(2, '0')}</span><b>${NAME[k]}</b><small>${i < at ? esc(said(k) || '') : '&nbsp;'}</small></li>`).join('')}</ol>`;
    // (the line grows from where it was)
    const b = el.querySelector('.tsw-line b'), from = this.railAt ?? at; this.railAt = at;
    if (from !== at && !calm()) b.animate([{ width: `${(from / Math.max(1, n - 1) * 100).toFixed(2)}%` }, { width: b.style.width }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  // the money, rolling to its new number (and what this step changed, floating off it)
  purse() {
    const w = this.w, now = w.money.balance, after = WC.setupBudget(w).after, el = this.el.querySelector('.tsw-money');
    const set = (k, v) => { el.querySelector(`[data-k="${k}"]`).textContent = WC.money$(v); el.querySelector(`[data-k="${k}"]`).classList.toggle('neg', v < 0); };
    set('now', now);
    const from = this.money ?? after; this.money = after;
    if (from === after || calm()) return set('after', after);
    const d = after - from, dl = el.querySelector('.tsw-delta');
    dl.textContent = `${d < 0 ? '−' : '+'}${WC.money$(Math.abs(d))}`; dl.className = `tsw-delta ${d < 0 ? 'neg' : 'pos'}`;
    dl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none', offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 1600, easing: 'ease-out', fill: 'both' });
    const t0 = performance.now(), T = 650, tick = (t) => { const k = Math.min(1, (t - t0) / T), e = 1 - Math.pow(1 - k, 3); set('after', Math.round(from + d * e)); if (k < 1 && this.isOpen) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  // the bracket: fades out where it was and back in on the column you're on (no sliding: it's 2005)
  place(snap = false) {
    const f = this.el.querySelector('.tsw-focus'), c = this.el.querySelectorAll('.tsw-col')[this.sel];
    if (!f) return;
    f.hidden = !c; if (!c) return;
    const move = () => { const p = c.parentElement; f.style.transform = `translate(${p.offsetLeft + c.offsetLeft}px, ${p.offsetTop + c.offsetTop}px)`; f.style.width = c.offsetWidth + 'px'; f.style.height = c.offsetHeight + 'px'; };
    clearTimeout(this.fadeT); this.fadeA?.cancel();
    if (snap || calm()) { f.style.opacity = ''; return move(); }
    this.fadeA = f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
    this.fadeT = setTimeout(() => { this.fadeA.cancel(); move(); this.fadeA = f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' }); }, 90);
  }
  foot() {
    const step = this.step, o = this.options()[this.sel], w = this.w;
    let next = 'Start the season';
    if (step !== 'ready') {
      const lab = !o ? '' : step === 'entry' ? WC.setupEntries(w).find(e => e.key === o.val)?.name : step === 'car' ? (w.ads || []).find(a => a.id === o.val)?.name
        : step === 'sponsor' ? WC.sponsorInfo(w.setup.sponsors[o.val].sid).name : `${w.people[o.val].first} ${w.people[o.val].last}`;
      next = `Next${lab ? `: ${esc(lab)}` : ''}`;
    }
    this.el.querySelector('.tsw-next').innerHTML = `${next} &rsaquo;`;
    this.el.querySelector('.tsw-count').textContent = `Step ${String(this.at + 1).padStart(2, '0')} / ${String(this.steps.length).padStart(2, '0')}`;
  }

  // ---------- the start: five lights, then out (and the season's started) ----------
  start() {
    const w = this.w, B = WC.setupBudget(w);
    if (B.after < 0) { this.src.sfx('error'); this.src.toast(`That's more than you have. Go back and change something.`); return; }
    const L = this.el.querySelector('.tsw-lights'), lamps = [...L.querySelectorAll('i')], R = w.series[w.player.series].cal[w.round];
    L.querySelector('small').textContent = `${w.teams[w.player.team].name} · Round ${w.round + 1}: ${R ? R.name : ''}`;
    this.busy = true; L.classList.add('on'); this.el.parentElement.classList.add('tsw-lit'); this.src.sfx('select');
    const step = calm() ? 120 : 520, timers = [];
    let n = 0, out = false;
    const go = () => {
      if (out) return; out = true; timers.forEach(clearTimeout);
      lamps.forEach(l => l.classList.add('lit'));
      requestAnimationFrame(() => { lamps.forEach(l => l.classList.remove('lit')); L.classList.add('go'); this.src.sfx('go'); });
      setTimeout(() => {
        const r = this.src.apply();
        if (!r.ok) { this.busy = false; L.classList.remove('on', 'go'); this.el.parentElement.classList.remove('tsw-lit'); this.lights = null; return; }
        this.lights = null; this.close(true);
      }, calm() ? 300 : 1300);
    };
    const light = () => { lamps[n++].classList.add('lit'); this.src.sfx('light'); if (n < 5) timers.push(setTimeout(light, step)); else timers.push(setTimeout(go, step + (calm() ? 0 : 300 + Math.random() * 700))); };
    timers.push(setTimeout(light, calm() ? 50 : 450));
    this.lights = { skip: () => { if (n >= 1) go(); } };
  }
}
