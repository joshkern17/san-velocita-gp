#!/usr/bin/env python3
"""Score the pre-registered tests in EXPERIMENTS.md from the post ledger.

Usage: python3 marketing/abtest.py marketing/ledger.csv [--min-posts 6] [--max-posts 12]

Ledger columns used: experiment, arm, views, hold (a 0-1 rate, or a percent).
For each experiment: a beta-binomial posterior per arm on the hold rate, with each
post's viewers capped at 500 (viewers of one post aren't independent), then
P(each arm is best) from 20k draws, and the EXPERIMENTS.md stopping rule.
"""
import csv, random, sys
from collections import defaultdict

CAP = 500
DRAWS = 20000


def rate(v):
    v = float(v)
    return v / 100 if v > 1 else v


def score(rows, min_posts, max_posts):
    arms = defaultdict(lambda: [1.0, 1.0, 0])  # alpha, beta, posts (uniform prior)
    for r in rows:
        if not r.get('views') or not r.get('hold'):
            continue
        n = min(float(r['views']), CAP)
        k = rate(r['hold']) * n
        a = arms[r['arm']]
        a[0] += k
        a[1] += n - k
        a[2] += 1
    if len(arms) < 2:
        return arms, {}, 'waiting for a second arm'
    rng = random.Random(1)
    wins = defaultdict(int)
    for _ in range(DRAWS):
        draw = {arm: rng.betavariate(a, b) for arm, (a, b, _) in arms.items()}
        wins[max(draw, key=draw.get)] += 1
    p = {arm: wins[arm] / DRAWS for arm in arms}
    fewest = min(a[2] for a in arms.values())
    best = max(p, key=p.get)
    if p[best] > 0.95 and fewest >= min_posts:
        verdict = f'{best} wins'
    elif fewest >= max_posts:
        verdict = 'tie: keep the cheaper arm'
    else:
        verdict = f'keep running ({fewest} posts in the smallest arm, need {min_posts})'
    return arms, p, verdict


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    min_posts = int(args[args.index('--min-posts') + 1]) if '--min-posts' in args else 6
    max_posts = int(args[args.index('--max-posts') + 1]) if '--max-posts' in args else 12
    with open(args[0], newline='') as f:
        rows = [r for r in csv.DictReader(f) if r.get('experiment')]
    by_exp = defaultdict(list)
    for r in rows:
        by_exp[r['experiment']].append(r)
    if not by_exp:
        print('No experiment posts in the ledger yet.')
    for exp, rs in sorted(by_exp.items()):
        arms, p, verdict = score(rs, min_posts, max_posts)
        print(f'\n{exp}: {verdict}')
        for arm, (a, b, posts) in sorted(arms.items()):
            mean = a / (a + b)
            print(f'  arm {arm}: {posts} posts, hold {mean:.1%}, P(best) {p.get(arm, 0):.2f}')


if __name__ == '__main__':
    main()
