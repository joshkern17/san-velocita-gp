// The broadcast package: mid-2000s TV graphics over a race (css/tv.css), in the look of the channel your series is
// on. The production value climbs with the career: 'local' (cable access, on a worn VHS: the shitbox class), 'blade'
// (black and orange cable sports: the street series), 'tech' (electric blue cable motorsport: a club series), 'chrome'
// (network: GT, Formula, quick races).
//   tv.start(theme, crt)    a race begins (crt: 'off' | 'light' | 'full')
//   tv.intro(d) / tv.introOut()    the intro card over the flyover (d: tvCard() in main.js)
//   tv.ticker(d)            the scoring ticker, every frame or so (d: { lap, laps, flag, rows: [{ pos, name, gap, you }] })
//   tv.battle(d)            the battle box (d: { pos, a: { name, color, pos }, b, gap }) / tv.battleGap(gap)
//   tv.cap(c)               a lower third (broadcast.js caption: { tag, name, sub, alert, win })
//   tv.winner(d)            the winner card (d: { name, team, margin, best, led, grid })
//   tv.stop()               the race is over: everything off
// Each piece flies in and out in its look's own over-the-top way (css: .in / .out).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// a big name fits its box: the size goes down as the name gets longer
const fit = (name, big, chars) => Math.round(big * Math.min(1, chars / Math.max(1, String(name).length)));
// the track map: an SVG of the outline (d.map: { path, sf: [x, y], w, h })
const mapSvg = (m, cls = 'map') => m ? `<svg class="${cls}" viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="xMidYMid meet"><path class="glow" d="${m.path}"/><path class="edge" d="${m.path}"/><path class="line" d="${m.path}"/><circle cx="${m.sf[0]}" cy="${m.sf[1]}" r="${Math.max(m.w, m.h) / 44}"/></svg>` : '';

// The local channel's sense of humour: things a cable-access station would put on screen
const LOCAL = {
  station: ['SVC-7', 'KSVL-3', 'CHANNEL 12½'],
  sponsors: ["KEV'S TIRE SHACK · WE TAKE CASH", "SAL'S MUFFLER & BAIT", "LENNY'S PAWN · NO QUESTIONS", "TONY'S PIZZA · NOW WITH DELIVERY (SOMETIMES)",
    'MOUNT VELOCITA FIRST BAPTIST · BAKE SALE SUNDAY', "DANNY'S DETAILING · ASK FOR DANNY"],
  crawl: ['BINGO TONIGHT AT THE VFW 7PM', 'LOST DOG: ANSWERS TO "TURBO"', 'CITY COUNCIL MEETING POSTPONED AGAIN', 'GO HORNETS!', 'PLEASE STAND BY',
    'HAPPY 80TH BIRTHDAY GRANDMA JUNE', 'GARAGE SALE ON ELM ST · EVERYTHING MUST GO'],
  weather: { clear: 'NICE', overcast: 'MEH', rain: 'WET', night: 'DARK', dusk: 'GETTING DARK' },
  turns: (n) => n > 14 ? `LOTS (${n})` : n > 8 ? `SOME (${n})` : `A FEW (${n})`,
};

const T = {
  chrome: {
    intro: (d) => `<div class="tv-i"><div class="fc">
      <div class="top"><div class="series red"><span class="us">${esc(d.series)}</span></div><div class="round cbar"><span class="us">${esc(d.round)}</span></div></div>
      <div class="chk"></div>
      <div class="body navy"><div class="name us"><div class="country gtext">${esc(d.country)}</div><div class="track ctext" style="--tn:${fit(d.longest, 66, 13)}px">${d.lines.map(esc).join('<br>')}</div><div class="rule"></div><div class="corners">${esc(d.corners)}</div></div>${mapSvg(d.map, 'map us')}<div class="flare"></div></div>
      <div class="stats cbar">${d.stats.map(([k, v]) => `<div class="cell"><div class="us"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div></div>`).join('')}</div>
    </div><div class="glint" style="left:-12px;top:-12px"></div><div class="glint" style="right:30px;top:52px;animation-delay:1.1s"></div><div class="glint" style="left:380px;bottom:-10px;animation-delay:.6s"></div><div class="flash"></div></div>`,
    ticker: () => `<div class="tv-i" style="display:contents"><div class="lap red"><small>LAP</small><b></b><small></small></div><div class="flag"></div><div class="run"><div class="strip"></div><div class="flare" style="animation-duration:4s"></div></div><div class="logo cbar"><span class="us">SVGP</span></div></div>`,
    row: (r) => `<div class="p${r.you ? ' you' : ''}"><span class="n cbar">${r.pos}</span>${esc(r.name)}${r.gap ? ` <span class="g gtext">${esc(r.gap)}</span>` : ''}</div>`,
    battle: (d) => `<div class="tv-i"><div class="fc"><div class="h red"><span class="us">BATTLE FOR ${ord(d.pos)}</span></div><div class="navy">
      <div class="r"><span class="pos us gtext">${d.a.pos}</span><span class="car" style="background:${hex(d.a.color)}"></span><span class="nm us">${esc(d.a.name)}</span><span class="iv us"><small class="gtext">LEADER</small></span></div>
      <div class="r"><span class="pos us gtext">${d.b.pos}</span><span class="car" style="background:${hex(d.b.color)}"></span><span class="nm us">${esc(d.b.name)}</span><span class="iv us gap">+${d.gap}</span></div>
      <div class="flare" style="animation-delay:.8s"></div></div></div><div class="vs red"><span class="us">VS</span></div><div class="flash"></div></div>`,
    cap: (c) => `<div class="tv-i" style="display:contents"><div class="tag ${c.win ? 'goldbar' : 'red'}"><b class="us">${esc(c.tag)}</b></div><div class="main navy"><div class="nm us">${esc(c.name)}</div>${c.sub ? `<div class="sub us gtext">${esc(c.sub)}</div>` : ''}<div class="flare"></div></div></div>`,
    winner: (d) => `<div class="tv-i"><div class="fc"><div class="top goldbar"><span class="us">WINNER</span></div><div class="chk"></div>
      <div class="body navy"><div class="us"><div class="who ctext" style="--wn:${fit(d.name, 100, 10)}px">${esc(d.name)}</div><div class="team gtext">${esc(d.team)}</div>
      <div class="stats">${d.stats.map(([k, v]) => `<div>${esc(k)}<b>${esc(v)}</b></div>`).join('')}</div></div><div class="flare"></div></div></div>
      <div class="glint" style="left:-10px;top:40px"></div><div class="glint" style="right:-10px;top:120px;animation-delay:.9s"></div><div class="flash"></div></div>`,
  },
  blade: {
    intro: (d) => `<div class="tv-i"><div class="b1 blk"></div><div class="b2 org">${esc(d.series)} · ${esc(d.round)}</div>
      <div class="name" style="--tn:${fit(d.longest, 70, 13)}px">${d.lines.map((l, i) => i === d.lines.length - 1 && d.lines.length > 1 ? `<em>${esc(l)}</em>` : esc(l)).join('<br>')}</div>
      <div class="kicker otext">${esc([d.country, d.corners].filter(Boolean).join(' · '))}</div>${mapSvg(d.map)}
      <div class="b3 blk">${d.stats.map(([k, v]) => `<div class="cell"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <div class="slash" style="left:680px;top:334px;width:120px"></div><div class="slash" style="left:712px;top:346px;width:70px"></div></div>`,
    ticker: () => `<div class="tv-i" style="display:contents"><div class="lap org"><small>LAP&nbsp;</small><b></b><small></small></div><div class="run blk"><div class="strip"></div></div></div>`,
    row: (r) => `<div class="p${r.you ? ' you' : ''}"><span class="n org">${r.pos}</span>${esc(r.name)}${r.gap ? ` <span class="g">${esc(r.gap)}</span>` : ''}</div>`,
    battle: (d) => `<div class="tv-i"><div class="b blk"></div><div class="h org">BATTLE FOR ${ord(d.pos)}</div>
      <div class="r"><span class="pos">${d.a.pos}</span><span class="car" style="background:${hex(d.a.color)}"></span>${esc(d.a.name)}<span class="iv">LEADER</span></div>
      <div class="r"><span class="pos">${d.b.pos}</span><span class="car" style="background:${hex(d.b.color)}"></span>${esc(d.b.name)}<span class="iv gap">+${d.gap}</span></div></div>`,
    cap: (c) => `<div class="tv-i"><div class="b blk"></div><div class="tag org">${esc(c.tag || '')}</div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.sub || '')}</div></div>`,
    winner: (d) => `<div class="tv-i"><div class="b blk"></div><div class="h org">WINNER</div><div class="who" style="--wn:${fit(d.name, 96, 11)}px">${esc(d.name)}</div><div class="team">${esc(d.team)}</div>
      <div class="slash" style="left:30px;top:250px;width:200px"></div><div class="slash" style="left:600px;top:250px;width:200px"></div></div>`,
  },
  tech: {
    intro: (d) => `<div class="tv-i carbon grid" style="position:absolute;inset:0"><div class="brk tl"></div><div class="brk tr"></div><div class="brk bl"></div><div class="brk br"></div>
      <div class="tag blue">${esc(d.series)} // ${esc(d.round)}</div><div class="name" style="--tn:${fit(d.longest, 64, 13)}px">${d.lines.map(esc).join('<br>')}</div><div class="bar"></div>
      <div class="stats">${d.stats.map(([k, v]) => `<div><span>${esc(k)}</span><b class="lcd">${esc(v)}</b></div>`).join('')}</div>${mapSvg(d.map)}<div class="scan"></div></div>`,
    ticker: () => `<div class="tv-i" style="display:contents"><div class="lap carbon lcd">LAP <b></b><small></small></div><div class="run"><div class="strip"></div></div></div>`,
    row: (r) => `<div class="p carbon${r.you ? ' you' : ''}"><span class="n">${r.pos}</span>${esc(r.name)}${r.gap ? ` <span class="g">${esc(r.gap)}</span>` : ''}</div>`,
    battle: (d) => `<div class="tv-i carbon" style="padding:inherit;margin:-12px -22px -14px"><div style="padding:12px 22px 14px"><div class="brk tl"></div><div class="brk br"></div><div class="h">// BATTLE FOR P${d.pos}</div>
      <div class="r"><span class="pos">${String(d.a.pos).padStart(2, '0')}</span><span class="car" style="background:${hex(d.a.color)}"></span>${esc(d.a.name)}<span class="iv lcd">LEAD</span></div>
      <div class="r"><span class="pos">${String(d.b.pos).padStart(2, '0')}</span><span class="car" style="background:${hex(d.b.color)}"></span>${esc(d.b.name)}<span class="iv lcd gap">+${d.gap}</span></div>
      <div class="meter"><i style="width:${Math.max(4, 100 - d.gap * 60)}%"></i></div></div></div>`,
    cap: (c) => `<div class="tv-i carbon" style="margin:-10px -22px -12px;padding:10px 22px 12px"><div class="brk tl"></div><div class="brk br"></div><div class="tag">// ${esc(c.tag || 'LIVE')}</div><div class="nm">${esc(c.name)}</div>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}</div>`,
    winner: (d) => `<div class="tv-i carbon grid" style="padding:26px 0 30px;margin:-26px 0 -30px"><div class="brk tl"></div><div class="brk tr"></div><div class="brk bl"></div><div class="brk br"></div>
      <div class="h">// RACE WINNER</div><div class="who" style="--wn:${fit(d.name, 92, 11)}px">${esc(d.name)}</div>
      <div class="stats">${d.stats.map(([k, v]) => `<div><span>${esc(k)}</span><b class="lcd">${esc(v)}</b></div>`).join('')}</div><div class="scan"></div></div>`,
  },
  local: {
    intro: (d) => `<div class="tv-i"><div class="series">${esc(d.station)} PRESENTS: <span>${esc(d.series)}</span> &nbsp;·&nbsp; ${esc(d.roundLocal)}</div>
      <div class="wordart" style="--tn:${fit(d.longest, 72, 14)}px">${d.lines.map(l => esc(l.charAt(0) + l.slice(1).toLowerCase())).join('<br>')}</div>
      <div class="facts">${d.localFacts.map(([k, v]) => `<div>${esc(k)}: <b>${esc(v)}</b></div>`).join('')}</div>
      <div class="clip">${mapSvg(d.map, 'cl')}<div class="cap">THE TRACK (NOT TO SCALE)</div></div></div>`,
    ticker: () => `<div class="tv-i" style="display:contents"><div class="lap">LAP <b>&nbsp;</b><small></small></div><div class="run"><div class="strip"></div></div></div>`,
    row: (r) => r.msg ? `<div class="p msg">${esc(r.msg)}</div>` : `<div class="p${r.you ? ' you' : ''}"><span class="n">${r.pos}</span>${esc(r.name)}</div>`,
    battle: (d) => `<div class="tv-i"><div class="h">WHO'S AHEAD?!</div><div class="r"><span class="pos">${d.a.pos}</span>${esc(d.a.name)}</div><div class="r"><span class="pos">${d.b.pos}</span>${esc(d.b.name)}<span class="iv">(<span class="gap">${d.gap}</span> SEC BEHIND!!)</span></div></div>`,
    cap: (c) => `<div class="tv-i">${c.tag ? `<div class="tag">${esc(c.tag)}</div>` : ''}<div class="nm">${esc(c.name)}</div>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}</div>`,
    winner: (d) => `<div class="tv-i"><div class="wordart">WINNER!!!</div><div class="who">${esc(d.name)}</div><div class="team">${esc(d.localLine)}</div></div>`,
  },
};

export class TVGfx {
  constructor(hud) { this.hud = hud; this.root = null; this.theme = null; this.on = {}; this.tickX = 0; }
  // a race begins: the channel's look and the old-TV strength
  start(theme, crt = 'full') {
    this.stop();
    if (!this.root) { this.root = document.createElement('div'); this.root.id = 'tv'; this.hud.appendChild(this.root); }
    this.theme = T[theme] ? theme : 'chrome';
    this.root.className = `tv-${this.theme} crt-${crt}`;
    const local = this.theme === 'local';
    this.station = pick(LOCAL.station);
    this.root.innerHTML = `<div class="gfx"></div><div class="crt">${local ? `<div class="vhs-band"></div><div class="vhs-osd play">PLAY ▶</div><div class="vhs-osd sp">SP</div><div class="vhs-osd date"></div>` : ''}</div>`;
    this.gfx = this.root.firstChild;
    if (local) {
      const d = new Date(), date = this.root.querySelector('.vhs-osd.date');
      const yr = 2003 + Math.floor(Math.random() * 5), hh = d.getHours() % 12 || 12;
      date.textContent = `${d.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${String(d.getDate()).padStart(2, '0')} ${yr}  ${hh}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
      this.show('bug', `<div class="tv-i">${esc(this.station)}<small>CABLE ACCESS</small></div>`);
    }
  }
  stop() { if (this.root) this.root.innerHTML = ''; this.on = {}; this.gfx = null; this.hud.classList.remove('tvon'); }
  // a piece on screen: kind (one of each at a time), html, how long (0: until taken off)
  show(kind, html, ms = 0) {
    if (!this.gfx) return null;
    this.off(kind);
    const el = document.createElement('div'); el.className = `el ${kind} in`; el.innerHTML = html;
    this.gfx.appendChild(el); this.on[kind] = el;
    el.addEventListener('animationend', (e) => { if (e.target === el && el.classList.contains('in')) el.classList.remove('in'); });
    if (ms) el._t = setTimeout(() => this.off(kind), ms);
    return el;
  }
  off(kind) {
    const el = this.on[kind]; if (!el) return;
    clearTimeout(el._t); this.on[kind] = null;
    el.classList.remove('in'); el.classList.add('out');
    setTimeout(() => el.remove(), 700);
  }
  intro(d) {
    if (!this.gfx) return;
    const L = { ...d, station: this.station, roundLocal: d.round.replace(/^ROUND (\d+).*/, 'RACE $1!!'),
      localFacts: [['LENGTH', d.length], ['TURNS', LOCAL.turns(d.turns)], ['LAPS', d.laps], ['WEATHER', LOCAL.weather[d.cond] || 'OK']] };
    this.show('ic', T[this.theme].intro(L));
    if (this.theme === 'local') this.show('star', 'LIVE!');
  }
  introOut() { this.off('ic'); this.off('star'); }
  // the scoring ticker: built once, then its entries kept up to date and scrolled
  ticker(d) {
    if (!this.gfx) return;
    let el = this.on.tk;
    if (!el) { el = this.show('tk', T[this.theme].ticker()); this.hud.classList.add('tvon'); this.tickX = 0; this.rowsKey = ''; }
    const lap = el.querySelector('.lap b'), of = el.querySelector('.lap small:last-child');
    if (lap) lap.textContent = Math.max(1, d.lap); if (of && of !== lap) of.textContent = this.theme === 'tech' ? `/${d.laps}` : `${this.theme === 'local' ? ' OF ' : '/ '}${d.laps}`;
    const flag = el.querySelector('.flag'); if (flag) flag.classList.toggle('y', !!d.yellow);
    let rows = d.rows;
    if (this.theme === 'local') { rows = rows.slice(); if (!this.crawl || Math.random() < 0.002) this.crawl = pick(LOCAL.crawl); rows.push({ msg: this.crawl }); }
    const key = rows.map(r => `${r.pos}${r.name}${r.gap || ''}${r.msg || ''}`).join('|');
    if (key !== this.rowsKey) { this.rowsKey = key; const html = rows.map(T[this.theme].row).join(''); el.querySelector('.strip').innerHTML = html + html; } // (twice: it scrolls round)
  }
  tick(dt) {
    const el = this.on.tk; if (!el) return;
    const strip = el.querySelector('.strip'), run = el.querySelector('.run'); if (!strip || !run) return;
    const half = strip.scrollWidth / 2;
    if (half <= run.clientWidth) { strip.style.transform = ''; this.tickX = 0; return; } // (it all fits: no need to scroll)
    this.tickX = (this.tickX + dt * 60) % half;
    strip.style.transform = `translateX(${-this.tickX}px)`;
  }
  tickerOff() { this.off('tk'); this.hud.classList.remove('tvon'); }
  battle(d, ms = 7000) {
    if (!this.gfx) return;
    this.off('lt');
    this.show('bt', T[this.theme].battle(d), ms);
    if (this.theme === 'local') this.show('sponsor', `THIS BATTLE BROUGHT TO YOU BY<br><b>${esc(pick(LOCAL.sponsors))}</b>`, ms);
  }
  battleGap(gap) {
    const el = this.on.bt; if (!el) return;
    el.querySelectorAll('.gap').forEach(g => { g.textContent = this.theme === 'local' ? gap : `+${gap}`; });
    const m = el.querySelector('.meter i'); if (m) m.style.width = Math.max(4, 100 - gap * 60) + '%';
  }
  cap(c, ms = 5500) {
    if (!this.gfx || !c) return;
    if (this.on.bt) return; // (the battle box is up: it says it)
    const el = this.show('lt', T[this.theme].cap(c), ms);
    if (el) el.classList.toggle('alert', !!c.alert);
  }
  winner(d) {
    if (!this.gfx) return;
    for (const k of ['bt', 'lt', 'sponsor']) this.off(k);
    if (this.theme === 'chrome') this.show('burst', '', 9000); // (the sunburst behind it, centred on the screen)
    this.show('wn', T[this.theme].winner({ ...d, localLine: `WON BY ${d.margin} SECONDS. CONGRATULATIONS FROM ALL OF US AT ${this.station}` }), 9000);
  }
}
