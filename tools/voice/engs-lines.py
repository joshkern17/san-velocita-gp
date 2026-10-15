# The engineer's radio answers (js/radioask.js) as whole sentences, a number already in each: writes the [engs]
# section of assets/voice/san_velocita_lines_with_announcer.txt (replacing it). Then: node tools/voice/gen.mjs --section engs
# The buckets (AMT, GAP, laps, places, percents) must match radioask.js amtKey / gapKey / clampN / pctKey.
import re, os
ROOT = os.path.join(os.path.dirname(__file__), '../..')
LINES = os.path.join(ROOT, 'assets/voice/san_velocita_lines_with_announcer.txt')
W = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
     'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five','twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty']
TENTHS = {f't{i}': ('a tenth' if i == 1 else f'{W[i]} tenths') for i in range(1, 10)}
AMT = {**TENTHS, 's1': 'a second', 's1h': 'a second and a half', 's2': 'two seconds', 's3': 'three seconds', 's4': 'four seconds', 's5': 'five seconds', 's5p': 'more than five seconds'}
GAP = {**TENTHS, **{f'g{i}': ('a second' if i == 1 else f'{W[i]} seconds') for i in range(1, 11)}, 'g15': 'fifteen seconds', 'g20': 'twenty seconds', 'g30': 'half a minute', 'g45': 'forty-five seconds', 'g60': 'over a minute'}
def pct(n):
    if n == 100: return 'a hundred'
    t, u = divmod(n, 10)
    return W[n] if n <= 20 else ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][t] + ('-' + W[u] if u else '')
laps = lambda n: 'a lap' if n == 1 else f'{W[n]} laps'
TY = {'soft': 'softs', 'medium': 'mediums', 'hard': 'hards', 'wet': 'wets', 'dirt': 'dirt tires'}
L = []
def add(k, v): L.append(f'engs.{k} = {v}')
def head(t): L.append(f'# {t}')
head('your pace'); [add(f'best.{k}', f"You're {v} off your best.") for k, v in AMT.items()]
add('onbest', "You're right on your best pace.")
add('rank.1', 'Quickest on track right now.')
for i in range(2, 11): add(f'rank.{i}', f"{['','','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'][i]} quickest out there.")
add('rank.back', 'Down the order on pace right now.')
add('nolaps', "No clean laps yet. Give me one and I'll have numbers.")
head('their pace (you just asked about them: no names)')
for k, v in AMT.items(): add(f'pace.q.{k}', f"They're {v} a lap quicker than you.")
for k, v in AMT.items(): add(f'pace.s.{k}', f"They're {v} a lap slower than you.")
add('pace.same', "They're on the same pace as you.")
for k, v in AMT.items(): add(f'bl.q.{k}', f"Their best lap is {v} quicker than yours.")
for k, v in AMT.items(): add(f'bl.s.{k}', f"Their best lap is {v} slower than yours.")
add('nolapsthem', 'No laps from them yet.')
head('the gap')
for k, v in GAP.items(): add(f'gap.a.{k}', f"They're {v} up the road.")
for k, v in GAP.items(): add(f'gap.b.{k}', f"They're {v} behind you.")
for n in (1, 2): add(f'gap.la.{n}', f"They're {laps(n)} up the road."); add(f'gap.lb.{n}', f"They're {laps(n)} down on you.")
add('gap.la.3', "They're three laps or more up the road."); add('gap.lb.3', "They're three laps or more down on you.")
add('gap.close', "They're right there with you.")
for n in range(1, 11): add(f'tr.catch.{n}', f"You're catching them. On them in about {laps(n)}.")
add('tr.catch.x', "You're catching them, slowly. More than ten laps out.")
for n in range(1, 11): add(f'tr.caught.{n}', f"They're catching you. On you in about {laps(n)}.")
add('tr.caught.x', "They're catching you, slowly. More than ten laps out.")
add('tr.away.them', "They're pulling away from you."); add('tr.away.you', "You're pulling away from them."); add('tr.hold', "The gap's holding.")
head('your tires')
for n in range(5, 101, 5): add(f'ti.pct.{n}', f'Tires are at {pct(n)} percent.')
for n in range(1, 16): add(f'ti.left.{n}', f'About {laps(n)} before they drop off.')
add('ti.left.x', "They've got plenty left in them.")
add('makeflag', "They'll make the flag."); add('dropthis', "They'll drop off this lap.")
add('cliff', "That's the cliff. You'll feel it everywhere.")
add('fronts', 'Fronts are wearing faster.'); add('rears', 'Rears are wearing faster.'); add('nowear', "Tire wear's off today.")
head('their tires')
for c, v in TY.items(): add(f'th.on.{c}', f"They're on {v}.")
for c, v in TY.items(): add(f'th.fresh.{c}', f"They're on a fresh set of {v}.")
for n in range(1, 31): add(f'th.age.{n}', f"That set's done {W[n]} lap{'s' if n > 1 else ''}.")
add('th.age.x', "That set's done more than thirty laps.")
for i, v in enumerate(['They look fresh.', 'They look good.', "They're past their best.", "They're going off.", "They're gone."]): add(f'w.{i}', v)
add('cmp.same', 'About the same as yours.'); add('cmp.better', 'Better than yours.'); add('cmp.worse', 'Worse than yours.')
add('stopsoon', 'Expect them to stop soon.'); add('nodata', 'No data on their wear.')
for n in range(5, 101, 5): add(f'th.pct.{n}', f"They're at {pct(n)} percent.")
head('where you are losing time')
add('lo.vs.ahead', 'Against the car ahead.'); add('lo.vs.fastest', 'Against the fastest car.'); add('lo.vs.best', 'Against your best lap.'); add('lo.vs.ideal', 'Against our ideal lap.')
for n in range(1, 21): add(f'lo.most.{n}', f"You're losing the most in Turn {W[n]}.")
add('lo.most.x', "You're losing the most late in the lap.")
for n in range(1, 21): add(f'lo.next.{n}', f'Next is Turn {W[n]}.')
add('lo.next.x', 'Next is late in the lap.')
for k, v in AMT.items(): add(f'lo.amt.{k}', f"{v[0].upper() + v[1:]} there.")
for k, v in {'hit': 'You hit the wall.', 'off': 'You ran wide off the road.', 'lock': "You're locking up.", 'late': "You're braking too late and overshooting.",
             'early': "You're braking too early.", 'under': "You've got understeer on the way in.", 'min': "You're too slow at the apex.", 'thr': "You're late on the throttle.",
             'coast': "You're coasting between the pedals.", 'slide': 'The rear is sliding on exit.', 'tc': 'Traction control is cutting in on exit.', 'exit': 'Your exit is slow.'}.items(): add(f'why.{k}', v)
add('smallbits', 'Only small bits everywhere. Nothing big.'); add('matching', "You're matching them everywhere. Keep it up."); add('needlap', 'Need a full lap of data first.')
head('the pit window')
add('pit.box.0', 'Plan says box this lap.')
for n in range(1, 31): add(f'pit.box.{n}', f'Plan says box in {laps(n)}.' if n > 1 else 'Plan says box next lap.')
add('pit.box.x', 'Plan says box in more than thirty laps.')
for c, v in TY.items():
    if c != 'dirt': add(f'pit.to.{c}', f"We'll go to {v}.")
add('wontmake', "Tires won't make it to the stop."); add('couldgo', 'Tires could go a few laps longer.')
for n in range(1, 25): add(f'pit.out.{n}', f"Stop now and you'd come out P{W[n]}.")
add('nostops', 'No more stops planned.')
head('orders to your teammate')
add('ord.letby', 'Copy. Asking them to let you by.'); add('ord.hold', 'Copy. Telling them to hold position.'); add('ord.push', 'Copy. Telling them to push.')
add('ord.save', 'Copy. Telling them to save tires.'); add('ord.wait', "Give them a minute. They've only just had the last one.")
add('ord.notahead', "They're not right in front of you."); add('ord.notbehind', "They're not right behind you.")
add('lost', 'Lost them on the data. Ask again.')

SEC = """# ── RADIO ANSWERS: WHOLE SENTENCES (js/radioask.js) ──────────────────────────
# What the engineer says when you ask on the radio (d-pad right / T): two or three of these one after another, never
# words spliced together. Each has its number in it, rounded the way radioask.js rounds it (the exact figure is on the
# radio panel). Made by tools/voice/engs-lines.py: edit that, not this.
[engs]
""" + '\n'.join(L) + '\n'
s = open(LINES).read()
# (the old word pieces, [engp], and any earlier [engs]: gone)
s = re.sub(r'\n# ── RADIO ANSWERS: PIECES.*?(?=\n# ──(?! RADIO ANSWERS: PIECES)|\Z)', '\n', s, flags=re.S)
s = re.sub(r'\n# ── RADIO ANSWERS: WHOLE SENTENCES.*?(?=\n# ──(?! RADIO ANSWERS: WHOLE)|\Z)', '\n', s, flags=re.S)
open(LINES, 'w').write(s.rstrip('\n') + '\n\n' + SEC)
print(len(L) - sum(1 for l in L if l.startswith('#')), 'sentences,', sum(len(l.split('=', 1)[1].strip()) for l in L if l.startswith('engs.')), 'characters')
