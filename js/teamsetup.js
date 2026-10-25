// The Team Setup Wizard (World Career): how you get in, the car, a title sponsor, your second driver, then the lights.
// The same screen is the Season Setup at the start of each season in a series with seats (w.setup.kind 'season': a car
// if you need one, the second seat, a title sponsor after moving up, then the lights), with the season's money, roughly.
// It's game UI over the garage, not the computer: the steps run along the top like sectors (what you picked is
// written under each), the choices are columns with a bracket that slides to the one you're on, the money rolls as
// you choose, and starting the season runs the start lights. The picks and the money live in js/wcareer.js
// (setupPick / setupMove / setupBudget / setupApply); main.js opens it and says what happens when it's done (src.apply).
// More than four choices (every car on the classifieds) scroll sideways: the next one cut off at the edge, with a cue.
// Controls: left / right choose, A / Enter next (select a column twice with the mouse), B / Esc back (or out to the
// garage from the first step), LB / RB step back and forward.
import * as WC from './wcareer.js';
import { faceHTML } from './drivers.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + ((c ?? 0x888888) >>> 0).toString(16).padStart(6, '0');
const NAME = { roles: 'Who runs what', entry: 'How you get in', car: 'The car', car2: 'Car two', livery: 'Livery', sponsor: 'Title sponsor', mate: 'Second driver', seat: 'Second seat', ready: 'Ready' };
// (what each kind of second-seat deal asks of you, in a line each)
const SEAT_COSTS = {
  gent: ['A day of your week each round, coaching', 'Crashes: you pay car 2\'s repairs', 'Might walk after a big one'],
  pro: ['Points for the teams\' championship', 'Car 2 earns real prize money', 'A wage every round, whatever happens'],
  share: ['A day of coaching each weekend', 'If one walks, the other still pays'],
  junior: ['Free to run, and the maker pays you', 'Target: the top 8, every round', 'Three misses and the maker takes them back'],
};
const WANTS = { top: 'results', finish: 'finishing', clean: 'clean racing', gain: 'overtakes', lead: 'leading', beat: 'beating a rival team' };
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// a meter: the signal ramp in segments, filling from empty whenever it's shown (--tv is 0..1)
const meter = (v, n = 10) => `<i class="tsw-m" style="--tv:${Math.max(0, Math.min(1, v)).toFixed(3)};--n:${n}"></i>`;
const tag = (t, cls = '') => `<span class="tsw-tag ${cls}">${t}</span>`;
const stat = (k, v, f, n) => `<div class="tsw-st"><span>${k}</span>${meter(f, n)}<em>${v}</em></div>`;
// a driver's portrait (js/drivers.js), or a silhouette drawn in light while it's being made
const face = (p) => faceHTML(p, 'tsw-face', '<svg viewBox="0 0 40 40"><circle cx="20" cy="15" r="7" /><path d="M6 39c0-8.5 6.2-13 14-13s14 4.5 14 13" /></svg>');

export class TeamSetup {
  constructor(el, src) {
    this.el = el; this.src = src; this.isOpen = false; this.busy = false; this.sel = 0; this.shown = null;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('mousemove', (e) => { const c = e.target.closest('.tsw-col'); if (c && !this.busy && +c.dataset.i !== this.sel && !c.classList.contains('dis')) this.focus(+c.dataset.i); });
    addEventListener('resize', () => { if (this.isOpen) { this.reveal(); this.place(true); this.edges(); } });
  }
  get w() { return this.src.world(); }
  get season() { return WC.setupKind(this.w) === 'season'; }
  get steps() { return WC.setupSteps(this.w); }
  get at() { return Math.min(this.w.setup.at || 0, this.steps.length - 1); }
  get step() { return this.steps[this.at]; }

  open() {
    const w = this.w; if (!w || WC.setupDone(w)) return;
    this.isOpen = true; this.busy = false; this.money = null;
    const t = w.teams[w.player.team];
    this.el.innerHTML = `<div class="tsw-shade"></div><div class="tsw-scan"></div>
      <header class="tsw-head"><h1>${this.season ? 'Season Setup' : 'Team Setup'}</h1><p>${esc(t.name)} &middot; ${esc(WC.seriesById(w.player.series).name)} &middot; ${w.year}</p></header>
      <div class="tsw-money"><div><small>In the bank</small><b data-k="now"></b></div><div><small>After your choices</small><b data-k="after"></b><em class="tsw-delta"></em></div>${this.season ? '<div title="The running costs, the lease, the staff, the sponsors\' fees and the second-seat deal: what\'s certain once it\'s signed. Prize money is up to you."><small>Season, before prizes</small><b data-k="season"></b></div>' : ''}</div>
      <nav class="tsw-rail"></nav>
      <div class="tsw-stage"><div class="tsw-q"><h2></h2><p></p></div><div class="tsw-cols"></div><div class="tsw-focus"></div><div class="tsw-more l" hidden><i>&lsaquo;</i><small></small></div><div class="tsw-more r" hidden><i>&rsaquo;</i><small></small></div></div>
      <div class="tsw-foot"><span class="tsw-count"></span><button class="sv-btn hot tsw-next" data-act="next"></button></div>
      <div class="tsw-lights"><div class="tsw-lamps">${'<i></i>'.repeat(5)}</div><b>Lights out</b><small></small></div>`;
    // (more choices than fit: the columns scroll sideways; a mouse wheel scrolls them too)
    const cols = this.el.querySelector('.tsw-cols');
    cols.addEventListener('scroll', () => { this.place(true); this.edges(); });
    cols.addEventListener('wheel', (e) => { if (!cols.classList.contains('strip') || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; cols.scrollLeft += e.deltaY; e.preventDefault(); }, { passive: false });
    this.el.hidden = false;
    this.el.classList.remove('leave'); this.el.classList.add('enter');
    setTimeout(() => this.el.classList.remove('enter'), 1400);
    this.render(0);
    // (the classifieds' photos take a moment to render: do them now, while you read the first step)
    const ads = this.season ? (w.setup.cars || []).filter(x => x.how === 'ad').map(x => x.c) : (w.ads || []);
    setTimeout(() => { if (this.isOpen) ads.forEach(a => this.src.photo(a)); }, 1500);
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
    const c = e.target.closest('.tsw-col'), b = e.target.closest('[data-act]'), r = e.target.closest('.tsw-rail li.done'), m = e.target.closest('.tsw-more');
    if (m) { const i = this.hiddenNext(m.classList.contains('r') ? 1 : -1); if (i != null) this.focus(i); }
    else if (c) { const i = +c.dataset.i; if (c.classList.contains('dis')) { this.src.sfx('error'); return; } if (i !== this.sel) this.focus(i); else this.next(); }
    else if (b && b.dataset.act === 'next') this.next();
    else if (b && b.dataset.act === 'back') this.back();
    else if (r) { const d = +r.dataset.i - this.at; if (d < 0) { WC.setupMove(this.w, d); this.src.sfx('back'); this.src.save(); this.render(-1); } }
  }
  focus(i) {
    if (i === this.sel) return;
    this.sel = i; this.src.sfx('move');
    this.el.querySelectorAll('.tsw-col').forEach((c, k) => c.classList.toggle('on', k === i));
    this.reveal(); this.place(); this.foot();
  }
  next() {
    const w = this.w, S = w.setup, step = this.step;
    if (step === 'ready') return this.start();
    const o = this.options()[this.sel]; if (!o) return;
    if (o.dis) { this.src.sfx('error'); this.src.toast(`That's more than you have (${WC.money$(w.money.balance)}).`); return; }
    // (painting it: off to the livery designer on this season's car; it comes back here, a step on: main.js paintForSetup)
    if (step === 'livery' && o.val === 'paint') { WC.setupPick(w, step, 'paint'); this.src.sfx('select'); this.src.save(); this.src.paint(WC.setupChassis(w)); return; }
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
    if (step === 'roles') return ['boss', 'tech'].map(k => ({ val: k, after: WC.setupBudget(w).after, dis: false })); // (co-op: the host's role; the co-owner has the other)
    if (step === 'entry') return WC.setupEntries(w).map(e => ({ val: e.key, ...this.leaves(step, e.key) }));
    if (step === 'car' && this.season) return S.cars.map((o, i) => ({ val: i, ...this.leaves(step, i) }));
    if (step === 'seat') return S.seats.map((d, i) => ({ val: i, ...this.leaves(step, i) }));
    if (step === 'livery') return ['keep', 'paint'].map(k => ({ val: k, after: WC.setupBudget(w).after, dis: false }));
    if (step === 'car2') return ['', ...WC.car2Models(w).map(m => m.key)].map(k => ({ val: k, ...this.leaves(step, k) })); // (co-op: keep car two, or the co-owner's pick)
    if (step === 'car') return (w.ads || []).map(a => ({ val: a.id, ...this.leaves(step, a.id) }));
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
    const was = opts.findIndex(o => o.val === (step === 'roles' ? S.picks.roles || WC.roleOf(w, 'P') : S.picks[step]));
    this.sel = was >= 0 ? was : Math.max(0, opts.findIndex(o => !o.dis));
    this.rail(); this.purse();
    const [q, sub] = this.question(step);
    const stage = this.el.querySelector('.tsw-stage'), cols = stage.querySelector('.tsw-cols'), qel = stage.querySelector('.tsw-q');
    const draw = () => {
      qel.querySelector('h2').textContent = q; qel.querySelector('p').textContent = sub;
      cols.className = `tsw-cols n${step === 'ready' ? 0 : opts.length}${opts.length > 4 ? ' strip' : ''}`;
      cols.innerHTML = step === 'ready' ? this.ready() : opts.map((o, i) => `<div class="tsw-col${i === this.sel ? ' on' : ''}${o.dis ? ' dis' : ''}" data-i="${i}"><i class="tsw-cur"></i>${this.card(step, o, i)}
        ${step === 'seat' || step === 'roles' ? '' : `<div class="tsw-left"><small>Leaves you</small><b class="${o.dis ? 'neg' : ''}">${o.dis ? 'More than you have' : WC.money$(o.after)}</b></div>`}</div>`).join(''); // (a seat deal costs nothing today: its money is on the card)
      cols.scrollLeft = 0; this.reveal(); this.place(true); this.edges(); this.foot();
      // in: the question wipes on, the columns rise one after another (from the side you're heading)
      if (calm()) return;
      qel.classList.remove('wipe'); void qel.offsetWidth; qel.classList.add('wipe');
      [...cols.children].forEach((c, i) => c.animate([{ opacity: 0, transform: `translate(${(dir || 0) * 36}px, ${dir ? 0 : 14}px)` }, { opacity: 1, transform: 'none' }],
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
    const kept = this.w.setup.picks.entry === 'takeover', S = this.w.setup, sn = WC.seriesById(this.w.player.series).name;
    if (this.season) return {
      car: S.cars[0]?.how === 'ad' ? ['Pick a car', `Your old car isn't eligible for the ${sn}. These are off the classifieds; the dealer takes the old one in part exchange. A tired car is down on power.`]
        : ['Pick a car', `Cars must be homologated for the ${sn}. A lease is a deposit now and a payment every round; buying is all of it now. Your old car is traded in.`],
      livery: ['How does it look?', `The ${this.src.carInfo(WC.setupChassis(this.w))?.name || 'car'} in your colors. Paint it now, before the press see it.`],
      roles: ['Who runs what?', `You both drive. Off the track, one of you runs the business and the other runs the cars. Whatever's the other one's call, you can suggest: they say yes or no.`],
      car2: [`${WC.coopPerson(this.w)?.first || 'Your co-owner'}'s car`, `Car two doesn't have to be a car like yours. Any car homologated for the ${sn}, bought from the team account.`],
      seat: ['Who pays for the second car?', 'Every deal pays its way differently: money now, or a driver whose prize money pays later. Pace is what decides where car 2 finishes.'],
      sponsor: ['Choose a title sponsor', `Bigger companies follow the ${sn}. The one you choose sets a target for every race.`],
      ready: [`Ready for the ${this.w.year} season`, 'Check it over. Nothing is bought or signed until the lights go out.'],
    }[step];
    return {
      entry: ['How do you want to get in?', 'Your winnings, and how much of them you spend before your first race. Everything after this is up to you.'],
      car: ['Pick a car', 'Off the classifieds. Danny\'s been through the listings and marked his pick. A tired car is down on power, and its parts are closer to failing.'],
      sponsor: ['Choose a title sponsor', 'Three local businesses want their name on your car. The one you choose sets a target for every race. The others will be watching.'],
      mate: ['Who drives the second car?', `Their points count for the teams' championship, and their car earns prize money too. Potential is your scout's best guess.${kept ? ' The old team\'s driver is still under contract, at what they were paid.' : ''}`],
      ready: ['Ready to go racing', 'Check it over. Nothing is bought or signed until the lights go out.'],
    }[step];
  }
  card(step, o, i) {
    const w = this.w, S = w.setup, $ = WC.money$;
    if (this.season && step === 'car' && S.cars[i].how === 'ad') return this.adCard(S.cars[i].c);
    if (this.season && step === 'car') {
      const x = S.cars[i], c = x.c, how = { lease: 'Lease', used: 'Last year\'s, ex-works', buy: 'New' }[x.how];
      // (backed by a maker: which cars keep the support, which end it)
      const W = WC.worksOf(w), works = W ? `<div class="tsw-cost tsw-works"><span>${esc(W.maker)} support</span><span class="tsw-pay">${WC.worksCar(w, c.name) ? `<b class="gain">+${$(W.per)}<small> a round</small></b>` : '<b class="bad">Ends</b>'}</span></div>` : '';
      return `<div class="tsw-top">${tag(how, x.how === 'lease' ? '' : x.how === 'used' ? 'good' : 'bad')}</div><h3>${esc(c.name)}</h3><div class="tsw-price">${$(x.how === 'lease' ? c.deposit : c.price)}<small>${x.how === 'lease' ? ' deposit' : ''}</small></div>
        ${x.how === 'lease' ? `<div class="tsw-kpis"><div><small>A round</small><b>${$(c.perRound)}</b></div><div><small>Season</small><b>${$(c.deposit + c.perRound * w.opts.len)}</b></div></div>` : ''}
        ${c.hp ? stat('Power', `${c.hp} hp`, c.hp / 700) + stat('Weight', `${c.kg} kg`, 1 - (c.kg - 900) / 600) : ''}${x.how === 'used' ? stat('Condition', `${Math.round(c.cond * 100)}%`, c.cond) : ''}
        ${works || `<p class="tsw-blurb">${esc(x.how === 'used' ? `From ${c.team}, a season old.` : c.note || '')}</p>`}<p class="tsw-seller">${esc(c.prog || '')}</p>`;
    }
    if (step === 'roles') {
      const me = this.w.player.name.split(' ')[0], co = WC.coopPerson(this.w)?.first || 'Your co-owner', R = WC.COOP_ROLES, other = o.val === 'boss' ? 'tech' : 'boss';
      const half = (who, k) => `<div class="tsw-role"><small>${esc(who)}</small><b>${esc(R[k].name)}</b><ul class="tsw-gets">${R[k].does.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
      return `<div class="tsw-top">${WC.roleOf(this.w, 'P') === o.val ? tag('As now', 'dim') : ''}</div><h3>${esc(o.val === 'boss' ? `${me} runs the team` : `${co} runs the team`)}</h3>${half(`${me} (you)`, o.val)}${half(co, other)}`;
    }
    if (step === 'livery') {
      const ch = WC.setupChassis(w), ph = this.src.lookPhoto(ch), paint = o.val === 'paint';
      return `${ph ? `<img class="tsw-photo" src="${ph}">` : '<div class="tsw-photo none"></div>'}<div class="tsw-hrow"><h3>${paint ? 'Paint it' : 'Keep it'}</h3><div class="tsw-price">${$(0)}</div></div>
        <p class="tsw-blurb">${paint ? 'The livery designer, on this car: colors, stripes, your sponsors\' decals, the number. Back here when you\'re done.' : 'Race it as it is.'}</p><p class="tsw-seller">${paint ? 'Livery designer' : 'Your colors'}</p>`;
    }
    if (step === 'car2') {
      // (laid out like a classifieds card: the photo, name and price on one line, the numbers, a line under)
      const m = o.val && WC.car2Models(w).find(x => x.key === o.val), c2 = WC.car2Of(w), key = m ? m.key : c2?.kind === 'own' ? c2.chassis : null;
      const c = key && this.src.carInfo(key), ph = key && this.src.photo({ id: `c2${9000 + i}`, chassis: key, color: WC.myTeam(w)?.main });
      return `${ph ? `<img class="tsw-photo" src="${ph}">` : '<div class="tsw-photo none"></div>'}<div class="tsw-hrow"><h3>${esc(m ? m.name : c2 ? c2.name : '')}</h3><div class="tsw-price">${$(m ? m.price : 0)}</div></div>
        ${c ? stat('Power', `${c.hp} hp`, c.hp / 450) + stat('Weight', `${c.kg} kg`, 1 - (c.kg - 1100) / 700) : ''}
        <p class="tsw-blurb">${!m ? 'Keep car two as it is.' : WC.car2Sale(w) ? `The car two you have now sells for ${$(WC.car2Sale(w))}.` : 'Theirs to race, the team\'s to pay for.'}</p><p class="tsw-seller">${m ? `${esc(WC.coopPerson(w)?.first || '')}'s pick` : 'Keep'}</p>`;
    }
    if (step === 'seat') {
      const d = S.seats[i], K = WC.SEAT_KINDS[d.kind], ps = d.pids.map(pid => w.people[pid]).filter(Boolean), L = w.opts.len;
      const money = d.wage ? `<b>&minus;${$(d.wage)}<small> a round</small></b>` : `<b class="gain">+${$(d.per)}<small> a round</small></b>`;
      return `<div class="tsw-top">${tag(esc(K.tag), d.kind === 'pro' ? '' : 'good')}</div><h3>${esc(K.name)}</h3>
        <div class="tsw-whos${ps.length > 1 ? ' two' : ''}">${ps.map(p => `<div class="tsw-who">${face(p)}<div><b>${esc(ps.length > 1 ? p.last : `${p.first} ${p.last}`)}</b><small>${WC.ageOf(w, p)}${ps.length > 1 ? '' : ` &middot; ${p.biz ? esc(p.biz) : d.maker ? `${esc(d.maker)} junior` : `${p.starts} starts, ${p.wins} win${p.wins === 1 ? '' : 's'}`}`}</small></div></div>`).join('')}</div>
        ${stat('Pace', Math.round(ps[0].pace), ps[0].pace / 100)}
        <div class="tsw-cost"><span>${d.wage ? 'Wage' : d.kind === 'junior' ? 'Maker pays' : 'Seat money'}</span><span class="tsw-pay">${money}</span></div>
        <div class="tsw-cost"><span>Season</span><span class="tsw-pay"><b class="${d.wage ? '' : 'gain'}">${d.wage ? '&minus;' : '+'}${$((d.wage || d.per) * L)}</b></span></div>
        <ul class="tsw-gets">${SEAT_COSTS[d.kind].map(g => `<li>${esc(g)}</li>`).join('')}</ul>`;
    }
    if (step === 'entry') {
      const e = WC.setupEntries(w)[i];
      return `<div class="tsw-top">${tag(e.level, e.key === 'fresh' ? 'bad' : e.key === 'running' ? 'good' : '')}</div><h3>${esc(e.name)}</h3><div class="tsw-price">${e.cost ? $(e.cost) : 'Free'}</div>
        <p class="tsw-blurb">${esc(e.blurb)}</p><ul class="tsw-gets">${e.gets.map(g => `<li>${esc(g)}</li>`).join('')}</ul>`;
    }
    if (step === 'car') return this.adCard((w.ads || [])[i]);    if (step === 'sponsor') {
      const x = S.sponsors[i], sp = WC.sponsorInfo(x.sid), logo = this.src.logo(x.sid);
      return `<div class="tsw-top">${tag(esc(x.tag), x.hosp ? '' : i === 0 ? 'bad' : i === 2 ? 'good' : '')}</div>${logo ? `<img class="tsw-logo" src="${logo}">` : ''}<h3>${esc(sp.name)}</h3>
        <div class="tsw-kpis"><div><small>A round</small><b>${$(x.fee)}</b></div><div><small>Target bonus</small><b>${$(x.bonus)}</b></div><div><small>Signing</small><b>${x.signing ? $(x.signing) : '&mdash;'}</b></div></div>
        ${S.sponsors.length > 3 ? stat('Misses OK', x.patience, x.patience / 6, 6) : stat('Patience', `${x.patience} miss${x.patience === 1 ? '' : 'es'}`, x.patience / 6, 6)}
        <p class="tsw-blurb">${x.hosp ? 'Their clients, a day of your week, every week: miss one and it counts as a missed target.' : `${esc(x.brand)}.`} Targets: ${sp.wants.map(k => WANTS[k]).join(', ')}.</p>`;
    }
    // the second driver
    const pid = o.val, p = w.people[pid], a = WC.askOf(w, p), [lo, hi] = S.scout[pid] || [p.pot, p.pot], tr = WC.traitsOf(w, p), under = S.picks.entry === 'takeover' && pid === S.inherited;
    const st = (k, v) => stat(k, Math.round(v), v / 100);
    const cost = a.fee ? `<b class="gain">Brings ${$(a.fee)}</b>` : `<b>${$(under ? Math.round(a.wage * 0.8 / 50) * 50 : a.wage)}<small> a round</small></b>`;
    return `<div class="tsw-who">${face(p)}<div><h3>${esc(p.first)} ${esc(p.last)}</h3><small>${WC.ageOf(w, p)} &middot; ${esc(p.nat)} &middot; ${p.starts ? `${p.starts} starts, ${p.wins} win${p.wins === 1 ? '' : 's'}` : 'no races yet'}</small></div></div>
      <div class="tsw-top">${under ? tag('Under contract') : ''}${tr.map(t => tag(esc(WC.TRAITS[t].name), t === 'paydriver' ? 'good' : '')).join('')}${!under && !tr.length ? tag('No reputation yet', 'dim') : ''}</div>
      ${st('Pace', p.pace)}${st('Consistency', p.cons)}${st('Racecraft', p.craft)}${st('Wet', p.wet)}${st('Aggression', p.aggr)}
      <div class="tsw-pot"><span>Potential</span><i><b style="left:${lo}%;width:${Math.max(3, hi - lo)}%"></b><u style="left:${p.pace}%"></u></i><em>${lo}&ndash;${hi}</em></div>
      <div class="tsw-cost"><span>${a.fee ? 'Seat money' : 'Wage'}</span><span class="tsw-pay">${cost}</span></div>`;
  }
  // a car off the classifieds: its photo, the price, how tired it is, the seller's pitch (and Danny's word on it)
  adCard(ad) {
    const $ = WC.money$, c = this.src.carInfo(ad.chassis), ph = this.src.photo(ad);
    return `${ph ? `<img class="tsw-photo" src="${ph}">` : '<div class="tsw-photo none"></div>'}<div class="tsw-hrow"><h3>${ad.year} ${esc(ad.name)}</h3><div class="tsw-price">${$(ad.price)}</div></div>
        ${stat('Condition', esc(WC.condName(ad.cond)), ad.cond)}${c ? stat('Power', `${c.hp} hp`, c.hp / 450) + stat('Weight', `${c.kg} kg`, 1 - (c.kg - 1100) / 700) : ''}
        <p class="tsw-blurb q" title="${esc(ad.blurb)}">&ldquo;${esc(ad.blurb)}&rdquo;</p><p class="tsw-seller">${esc(ad.seller)}${ad.tip ? ` &middot; <b class="tsw-danny">Danny: &ldquo;${esc(ad.tip)}&rdquo;</b>` : ''}</p>`;
  }
  // the last step: the team, and every number
  ready() {
    if (this.season) return this.readySeason();
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
  // the season's last step: what you've picked, today's money, and the season, roughly
  readySeason() {
    const w = this.w, S = w.setup, P = S.picks, $ = WC.money$, B = WC.setupBudget(w), t = WC.myTeam(w), o = P.car != null ? S.cars[P.car] : null, d = S.seats[P.seat], sp = P.sponsor != null ? S.sponsors[P.sponsor] : null;
    const row = (k, v, cls = '') => `<div class="tsw-row ${cls}"><span>${k}</span><b>${v}</b></div>`, sign = (v) => `${v < 0 ? '&minus;' : '+'}${$(Math.abs(v))}`;
    const q = d && w.people[d.pids[0]], car = o ? o.c.name : w.car ? w.car.name : '';
    return `<div class="tsw-ready">
      <div class="tsw-team"><div class="tsw-sw"><i style="background:${hex(t.main)}"></i><i style="background:${hex(t.accent)}"></i></div><h4>${esc(t.name)}</h4>
        <p>${esc(WC.seriesById(w.player.series).name)} ${w.year}</p>${sp && this.src.logo(sp.sid) ? `<img class="tsw-logo" src="${this.src.logo(sp.sid)}">` : ''}</div>
      <div class="tsw-rows">
        ${row('Car', esc(car))}${sp ? row('Title sponsor', esc(WC.sponsorInfo(sp.sid).name)) : ''}${row('Car 1', `${esc(w.player.name)} (you)`)}${row('Car 2', w.coop ? esc(`${WC.coopPerson(w)?.first || ''}: ${P.car2 ? WC.car2Models(w).find(m => m.key === P.car2)?.name || '' : WC.car2Of(w)?.name || ''}`) : d ? `${esc(q.first)} ${esc(q.last)}${d.pids.length > 1 ? ` / ${esc(w.people[d.pids[1]].last)}` : ''} &middot; ${esc(WC.SEAT_KINDS[d.kind].name)}` : '')}
        ${w.coop ? (() => { const hr = w.setup.picks.roles || WC.roleOf(w, 'P'), me = w.player.name.split(' ')[0], co = WC.coopPerson(w)?.first || ''; return row('Team Principal', esc(hr === 'boss' ? me : co)) + row('Technical Director', esc(hr === 'boss' ? co : me)); })() : ''}
        <i class="tsw-rule"></i>${row('In the bank', $(w.money.balance))}${B.rows.map(([k, v]) => row(esc(k), sign(v), v < 0 ? 'out' : 'in')).join('')}${row('Money after', $(B.after), 'tot' + (B.after < 0 ? ' neg' : ''))}
        <i class="tsw-rule"></i>${row('The season, before prize money', sign(B.season.net), 'out')}</div></div>`; // (prize money: what your racing decides)
  }
  // the steps, like sectors: done ones say what you picked
  rail() {
    const w = this.w, S = w.setup, P = S.picks, steps = this.steps, at = this.at;
    const said = (k) => {
      if (k === 'entry') return WC.setupEntries(w).find(e => e.key === P.entry)?.name;
      if (k === 'car' && this.season) return P.car != null && (S.cars[P.car].how === 'ad' ? `${S.cars[P.car].c.year} ${S.cars[P.car].c.name}` : S.cars[P.car].c.name);
      if (k === 'seat') return P.seat != null && WC.SEAT_KINDS[S.seats[P.seat].kind].name;
      if (k === 'livery') return P.livery && (P.livery === 'paint' ? 'Painted' : 'Kept');
      if (k === 'car2') return P.car2 != null && (P.car2 ? WC.car2Models(w).find(m => m.key === P.car2)?.name : 'Keep');
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
    const w = this.w, B = WC.setupBudget(w), now = w.money.balance, after = B.after, el = this.el.querySelector('.tsw-money');
    const set = (k, v) => { el.querySelector(`[data-k="${k}"]`).textContent = WC.money$(v); el.querySelector(`[data-k="${k}"]`).classList.toggle('neg', v < 0); };
    set('now', now);
    if (B.season) { const v = B.season.net, e = el.querySelector('[data-k="season"]'); e.textContent = `${v < 0 ? '−' : '+'}${WC.money$(Math.abs(v))}`; e.classList.toggle('neg', v < 0); }
    const from = this.money ?? after; this.money = after;
    if (from === after || calm()) return set('after', after);
    const d = after - from, dl = el.querySelector('.tsw-delta');
    dl.textContent = `${d < 0 ? '−' : '+'}${WC.money$(Math.abs(d))}`; dl.className = `tsw-delta ${d < 0 ? 'neg' : 'gain'}`;
    dl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none', offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 1600, easing: 'ease-out', fill: 'both' });
    const t0 = performance.now(), T = 650, tick = (t) => { const k = Math.min(1, (t - t0) / T), e = 1 - Math.pow(1 - k, 3); set('after', Math.round(from + d * e)); if (k < 1 && this.isOpen) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  // the bracket: fades out where it was and back in on the column you're on (no sliding: it's 2005)
  place(snap = false) {
    const f = this.el.querySelector('.tsw-focus'), c = this.el.querySelectorAll('.tsw-col')[this.sel];
    if (!f) return;
    f.hidden = !c; if (!c) return;
    const move = () => { const p = c.parentElement; f.style.transform = `translate(${p.offsetLeft + c.offsetLeft - p.scrollLeft}px, ${p.offsetTop + c.offsetTop}px)`; f.style.width = c.offsetWidth + 'px'; f.style.height = c.offsetHeight + 'px'; };
    clearTimeout(this.fadeT); this.fadeA?.cancel();
    if (snap || calm()) { f.style.opacity = ''; return move(); }
    this.fadeA = f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
    this.fadeT = setTimeout(() => { this.fadeA.cancel(); move(); this.fadeA = f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' }); }, 90);
  }
  // the strip: the column you're on, fully in view (a jump, not a scroll: it's 2005). Three columns whole, and a sliver
  // of the next one showing at whichever end has more, so the cue there never sits over a whole column
  reveal() {
    const cols = this.el.querySelector('.tsw-cols'), c = cols?.children[this.sel];
    if (!c || !cols.classList.contains('strip')) return;
    const W = c.offsetWidth, L = cols.scrollLeft, R = L + cols.clientWidth;
    if (c.offsetLeft >= L - 1 && c.offsetLeft + W <= R + 1) return;
    const first = c.offsetLeft < L ? this.sel : this.sel - 2;
    cols.scrollLeft = Math.max(0, Math.min(cols.scrollWidth - cols.clientWidth, first * W - (first > 0 ? W * 0.2 : 0)));
  }
  // the first column that's cut off or out of view, that way
  hiddenNext(d) {
    const cols = this.el.querySelector('.tsw-cols'), o = this.options(), L = cols.scrollLeft, R = L + cols.clientWidth;
    const out = [...cols.children].map((c, i) => (c.offsetLeft < L - 1 || c.offsetLeft + c.offsetWidth > R + 1) && !o[i]?.dis ? i : -1).filter(i => i >= 0 && (d > 0 ? i > this.sel : i < this.sel));
    return out.length ? (d > 0 ? out[0] : out[out.length - 1]) : null;
  }
  // the cues at the strip's ends: a fade over the cut-off column, an arrow, and how many more there are that way
  edges() {
    const cols = this.el.querySelector('.tsw-cols'), strip = cols.classList.contains('strip'), L = cols.scrollLeft, R = L + cols.clientWidth;
    for (const side of ['l', 'r']) {
      const el = this.el.querySelector(`.tsw-more.${side}`);
      const n = strip ? [...cols.children].filter(c => side === 'r' ? c.offsetLeft + c.offsetWidth > R + 1 : c.offsetLeft < L - 1).length : 0;
      el.hidden = !n; if (!n) continue;
      el.style.top = cols.offsetTop + 'px'; el.style.height = cols.clientHeight + 'px';
      el.querySelector('small').textContent = `${n} more`;
    }
  }
  foot() {
    const step = this.step, o = this.options()[this.sel], w = this.w;
    let next = 'Start the season';
    if (step !== 'ready') {
      const lab = !o ? '' : step === 'seat' ? WC.SEAT_KINDS[w.setup.seats[o.val].kind].name : step === 'car' && this.season ? w.setup.cars[o.val].c.name : step === 'entry' ? WC.setupEntries(w).find(e => e.key === o.val)?.name : step === 'car' ? (w.ads || []).find(a => a.id === o.val)?.name
        : step === 'sponsor' ? WC.sponsorInfo(w.setup.sponsors[o.val].sid).name : step === 'car2' ? (o.val ? WC.car2Models(w).find(m => m.key === o.val)?.name : 'Keep car two') : step === 'livery' ? (o.val === 'paint' ? 'Paint it' : 'Keep it') : `${w.people[o.val].first} ${w.people[o.val].last}`;
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
