// Press day (World Career): the season launch's questions, three of them, out of what's happened (moved up, last
// season, the car, the co-owner, the rival owner, the title sponsor). Each has three answers, a tone each (straight,
// bold, cheeky), and what saying it does, shown on the answer before you choose it (wcareer.js answerPress applies
// it): fx { rep, press, sponsor: +/- a missed target's patience for the title sponsor, mate: teammate morale, drep:
// drivers' view of you, rival: their grudge }, and a promise (a season target the Wire holds you to: wcareer.js
// settlePromises). The questions are the reporters'; what's said is short, the way it'd be printed.
//   pressQuestions(c) -> [{ id, who: { name, outlet, woman }, to: 'P' | 'C', q, answers: [{ tone, text, fx, promise? }] }]
//   c: the context from wcareer.js pressContext (names, numbers, flags): no world in here, no randomness but c.rnd

const OUTLETS = [['Nadia Okafor', 'The Paddock Wire', 1], ['Dale Brucker', 'Velocita Sun-Herald'], ['Kim Arroyo', 'SVTV Motorsport Tonight', 1], ['Gus Pelham', 'Grid Magazine'], ['Teri Vance', 'WSVR 101.3 Morning Zoo', 1]];   // (1: a woman, for who's seen asking)
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function pressQuestions(c) {
  const who = (k) => { const [name, outlet, woman] = OUTLETS[k % OUTLETS.length]; return { name, outlet, woman: !!woman }; };
  const qs = [];
  // 1. the season: moving up, defending a title, or what's different after a bad one
  if (c.movedUp) qs.push({ id: 'up', who: who(0), to: 'P', q: `First season in the ${c.series}. Last year you were racing in the ${c.fromSeries}. Is this team ready?`, answers: [
    { tone: 'Straight', text: `We'll be learning every weekend. Points would be a nice surprise.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `We didn't come up to make up the numbers. Top ${c.topHalf} in the championship.`, fx: { rep: 2, press: 2, sponsor: 1 }, promise: { kind: 'finish', pos: c.topHalf } },
    { tone: 'Cheeky', text: `Honestly? We heard the catering's better up here.`, fx: { press: 3, rep: -1, sponsor: c.sponsorWantsResults ? -1 : 0 } },
  ] });
  else if (c.lastPos === 1) qs.push({ id: 'defend', who: who(0), to: 'P', q: `Champions in the ${c.series}, and you stayed. Defending it, or scared of the next step?`, answers: [
    { tone: 'Straight', text: `Unfinished business. One more year, then we go up properly.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `We're keeping the number one. Write that down.`, fx: { rep: 2, press: 2, sponsor: 1 }, promise: { kind: 'finish', pos: 1 } },
    { tone: 'Cheeky', text: `The trophy cabinet has room for exactly one more. We measured.`, fx: { press: 3 } },
  ] });
  else qs.push({ id: 'again', who: who(0), to: 'P', q: c.lastPos ? `${ord(c.lastPos)} last year. What's different this time?` : `New team, new season. Why should anyone care?`, answers: [
    { tone: 'Straight', text: `We've done the work over the winter. The results will say if it was the right work.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `Podiums. Plural. ${c.lastPos ? 'Last year was the warm-up.' : 'Starting now.'}`, fx: { rep: 2, press: 2, sponsor: 1 }, promise: { kind: 'podiums', n: 2 } },
    { tone: 'Cheeky', text: `Different? The coffee machine works now. Mostly.`, fx: { press: 3, rep: -1 } },
  ] });
  // 2. the car (the one under the cover)
  if (c.newCar) qs.push({ id: 'car', who: who(1), to: 'P', q: `There's a ${c.car} under that sheet, we're told. Why that car?`, answers: [
    { tone: 'Straight', text: `It suits the tracks on the calendar, and it was the best one we could afford.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `Because it's quick. We'll be on the podium at ${c.homeTrack}.`, fx: { rep: 2, press: 2 }, promise: { kind: 'podium_at', round: c.homeRound, track: c.homeTrack } },
    { tone: 'Cheeky', text: `It was that or a minivan, and the minivan had a waiting list.`, fx: { press: 3 } },
  ] });
  else qs.push({ id: 'oldcar', who: who(1), to: 'P', q: `Same ${c.car} as last season, under a brand new sheet. Is it still quick enough?`, answers: [
    { tone: 'Straight', text: `We know every bolt on it now. That's worth more than a new one we don't.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `Quick enough for a podium at ${c.homeTrack}. You'll see.`, fx: { rep: 2, press: 2 }, promise: { kind: 'podium_at', round: c.homeRound, track: c.homeTrack } },
    { tone: 'Cheeky', text: `The sheet's new. We put most of the budget there.`, fx: { press: 3, sponsor: c.sponsorWantsResults ? -1 : 0 } },
  ] });
  // 3. the people: the co-owner, the rival owner, or the title sponsor (the first that applies)
  if (c.coop) qs.push({ id: 'coop', who: who(2), to: 'C', q: `${c.coopFirst}, you ${c.coopStake}. Any pressure, racing your business partner?`, answers: [
    { tone: 'Straight', text: `We push each other. That's the whole point of two cars.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `I'll be ahead of ${c.youFirst} by the end of the year. ${c.youFirst} knows it.`, fx: { press: 2 }, promise: { kind: 'beat_mate' } },
    { tone: 'Cheeky', text: `The pressure's on ${c.youFirst}. It's my ${c.coopStakeThing} on the line, not theirs.`, fx: { press: 3 } },
  ] });
  else if (c.rivalName) qs.push({ id: 'rival', who: who(3), to: 'P', q: `${c.rivalName} of ${c.rivalTeam} says lottery teams last a season and a half. Your reply?`, answers: [
    { tone: 'Straight', text: `I'd rather answer that on the track.`, fx: { rep: 1, press: 1 } },
    { tone: 'Bold', text: `We'll finish ahead of ${c.rivalTeam}. Ask them again in October.`, fx: { rep: 1, press: 2, rival: 1 }, promise: { kind: 'beat_team', tid: c.rivalTid, team: c.rivalTeam } },
    { tone: 'Cheeky', text: `A season and a half? That's longer than most of their drivers.`, fx: { press: 3, rival: 2, drep: -1 } },
  ] });
  else if (c.sponsor) qs.push({ id: 'sponsor', who: who(3), to: 'P', q: `${c.sponsor} have their name on the car. What do they get for their money?`, answers: [
    { tone: 'Straight', text: `A team that turns up, finishes races and says thank you.`, fx: { rep: 1, sponsor: 1 } },
    { tone: 'Bold', text: `A win. This season.`, fx: { rep: 2, press: 2, sponsor: 1 }, promise: { kind: 'win' } },
    { tone: 'Cheeky', text: `Exposure. Mostly to rain, at the Glen.`, fx: { press: 3, sponsor: -1 } },
  ] });
  return qs;
}

// what a promise says, as the Wire prints it and the game shows it where you race
export function promiseText(p) {
  if (!p) return '';
  return { finish: p.pos === 1 ? 'Win the championship' : `Finish the championship in the top ${p.pos}`, podiums: `${p.n} podiums this season`, podium_at: `A podium at ${p.track}`,
    beat_mate: 'Finish ahead of your teammate', beat_team: `Finish ahead of ${p.team}`, win: 'Win a race this season' }[p.kind] || '';
}

// The media pen, after every race: one reporter, one question about what just happened, three answers (the press
// day's tones and effects), answered by whoever runs the team (co-op: the Team Principal). What it's about, the first
// that applies: the two cars hitting each other, a win, your driver taking someone out, a failure, a podium, a DNF,
// the teammate ahead, else the result.
//   penQuestion(c) -> { id, who, q, answers }   c: from wcareer.js penOf (names and the race's facts)
export function penQuestion(c) {
  const [name, outlet] = OUTLETS[(c.round * 2 + 1) % OUTLETS.length], who = { name, outlet, woman: !!OUTLETS[(c.round * 2 + 1) % OUTLETS.length][2] };
  const Q = (id, q, answers) => ({ id, who, q, answers });
  if (c.teamHit) return Q('teamhit', `${c.you} and ${c.mate} made contact at ${c.track}. Team orders from now on?`, [
    { tone: 'Straight', text: `Racing incident. They'll talk it through, and that's the end of it.`, fx: { rep: 1, mate: 3 } },
    { tone: 'Bold', text: `Whoever caused it knows. It won't happen twice.`, fx: { press: 2, mate: -5, drep: -1 } },
    { tone: 'Cheeky', text: `They're sharing a hotel room until they sort it out.`, fx: { press: 3, mate: 1 } },
  ]);
  if (c.pos === 1) return Q('win', `A win at ${c.track}. Where does ${c.team} go from here?`, [
    { tone: 'Straight', text: `It's one race. We'll enjoy tonight and start again on Monday.`, fx: { rep: 2, press: 1, sponsor: 1 } },
    { tone: 'Bold', text: `The front. Everyone else had better get used to it.`, fx: { press: 3, rep: 1, drep: -1, rival: 1 } },
    { tone: 'Cheeky', text: `The bar. We're going to the bar.`, fx: { press: 3 } },
  ]);
  if (c.hit) return Q('crash', `Contact with ${c.hit} ended ${c.hitWhose} race. Your driver's fault?`, [
    { tone: 'Straight', text: `Ours. We'll own it, and ${c.you} will apologize.`, fx: { rep: 1, drep: 2 } },
    { tone: 'Bold', text: `${c.hit} left the door open. We went through it.`, fx: { press: 2, drep: -2 } },
    { tone: 'Cheeky', text: `The car's fine. Mostly. The steering wheel's fine.`, fx: { press: 2, rep: -1 } },
  ]);
  if (c.part) return Q('broke', `The ${c.part} let go at ${c.track}. Is the car up to this?`, [
    { tone: 'Straight', text: `It wasn't today. We'll find out why before the next one.`, fx: { rep: 1, sponsor: 1 } },
    { tone: 'Bold', text: `That part's been replaced. So has the supplier.`, fx: { press: 2, rep: 1 } },
    { tone: 'Cheeky', text: `It's a race car. They do that. Not usually in front of the sponsors.`, fx: { press: 3, sponsor: c.sponsor ? -1 : 0 } },
  ]);
  if (c.pos && c.pos <= 3) return Q('podium', `P${c.pos} at ${c.track}. Happy, or does it sting not to win?`, [
    { tone: 'Straight', text: `A podium's a podium. We'll take it.`, fx: { rep: 1, press: 1, sponsor: 1 } },
    { tone: 'Bold', text: `It stings. Next time it's the top step.`, fx: { press: 2, rep: 1 } },
    { tone: 'Cheeky', text: `The trophy's bigger than the one for winning. We checked.`, fx: { press: 3 } },
  ]);
  if (c.dnf) return Q('dnf', `Nothing to show from ${c.track}. What happened?`, [
    { tone: 'Straight', text: `A bad day. We'll be back in two weeks.`, fx: { rep: 1 } },
    { tone: 'Bold', text: `We were quick enough to win until we weren't.`, fx: { press: 2 } },
    { tone: 'Cheeky', text: `We wanted to give everyone else a chance.`, fx: { press: 3, rep: -1, sponsor: c.sponsor ? -1 : 0 } },
  ]);
  if (c.mateAhead) return Q('mate', `${c.mate} finished ahead of ${c.you}. Who's the number one at ${c.team}?`, [
    { tone: 'Straight', text: `Both of them. That's how it works here.`, fx: { rep: 1, mate: 3 } },
    { tone: 'Bold', text: `Whoever's ahead at the end of the year. Right now, that's ${c.mate}.`, fx: { press: 2, mate: 2, drep: -1 } },
    { tone: 'Cheeky', text: `The one who buys lunch. ${c.you}'s been avoiding the bill.`, fx: { press: 3, mate: 1 } },
  ]);
  return Q('mid', `P${c.pos} at ${c.track}. Is that where this team is?`, [
    { tone: 'Straight', text: `It's where we are today. It isn't where we'll stay.`, fx: { rep: 1 } },
    { tone: 'Bold', text: `Give us three races. Then ask again.`, fx: { press: 2, rep: 1 } },
    { tone: 'Cheeky', text: `P${c.pos} sounds better if you say it quickly.`, fx: { press: 3, rep: -1 } },
  ]);
}
