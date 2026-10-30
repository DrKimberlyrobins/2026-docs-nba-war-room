# DOC'S NBA SIMULATOR

A separate all-games NBA projection board. Neither existing NBA War Room is modified.

Every matchup runs **exactly 1,000 simulations**, producing projected scores,
winning side, spread direction, over/under direction, probabilities, outcome
counts, and 10th–90th percentile ranges. Full-game quotes are captured automatically
from the ESPN-listed provider. 1Q/1H projections are available without invented
period-market lines. All times and date tabs use America/Chicago.

## Data and model

Read-only source feeds:

* Public `2026-docs-nba-war-room/data/nba-current.json`: current-season completed team box scores.
* Public `2026-docs-nba-war-room/data/nba-teams-2026.json`: prior-season quarter history,
  labeled provisional by its source. Weighted as six effective games per team.
* ESPN NBA scoreboards: the entire daily slate, current full-game odds and final results.

The independent model fits quarter scoring using ridge offense, opponent-defense
and venue terms. It draws whole paired quarter residuals, retaining correlations
between teams and periods. Quarters accumulate into first halves and regulation.
Tied regulation scores add observed historical overtime pairs. A deterministic
seed makes identical team inputs reproduce the same scores. Market updates affect
market comparisons but do not change the underlying simulated scores.

The model does not yet incorporate confirmed injuries, starters or rotation changes.
Its probabilities are model estimates; no established prospective accuracy is claimed.
Choosing a side is separate from proving profitable performance at its price.

## Pregame records

`data/receipts/<event-id>.json` preserves the first saved forecast and
the latest revision. The latest can update before tipoff only. A game already
underway is never assigned a newly created pregame forecast. Finals grade the
latest saved pregame winner, spread and total as win/loss/push; score errors are
measured separately. Compressed input-history snapshots allow reproduction.

## Run

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python scripts/build.py --days 3
```

This independent module is served at `/nba-simulator/` inside the existing NBA War Room. GitHub Pages uses the entire repository as its
source, with the included workflow. It refreshes at minutes 12 and 42 UTC hourly,
plus manual runs and code pushes. GitHub schedules can be delayed; actual timestamps
are visible. It needs no API secret and has no write access to the existing rooms.
Only the simulator folder receives data commits; the original engine is not edited. The input cache is local and ignored.
