// Press day (World Career): the season launch's questions, three of them, out of what's happened (moved up, last
// season, the car, the co-owner, the rival owner, the title sponsor). Each has three answers, a tone each (straight,
// bold, cheeky), and what saying it does, shown on the answer before you choose it (wcareer.js answerPress applies
// it): fx { rep, press, sponsor: +/- a missed target's patience for the title sponsor, mate: teammate morale, drep:
// drivers' view of you, rival: their grudge }, and a promise (a season target the Wire holds you to: wcareer.js
// settlePromises). The questions are the reporters'; what's said is short, the way it'd be printed.
//   pressQuestions(c) -> [{ id, who: { name, outlet }, to: 'P' | 'C', q, answers: [{ tone, text, fx, promise? }] }]
//   c: the context from wcareer.js pressContext (names, numbers, flags): no world in here, no randomness but c.rnd

const OUTLETS = [['Nadia Okafor', 'The Paddock Wire'], ['Dale Brucker', 'Velocita Sun-Herald'], ['Kim Arroyo', 'SVTV Motorsport Tonight'], ['Gus Pelham', 'Grid Magazine'], ['Teri Vance', 'WSVR 101.3 Morning Zoo']];
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function pressQuestions(c) {
  const who = (k) => { const [name, outlet] = OUTLETS[k % OUTLETS.length]; return { name, outlet }; };
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
