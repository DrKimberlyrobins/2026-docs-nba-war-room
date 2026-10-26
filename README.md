# Doc's NBA War Room

Current site: https://drkimberlyrobins.github.io/2026-docs-nba-war-room/

## Connected features

- Current 2026–27 ESPN regular-season snapshot, all 30 current rosters, injury report timestamps, box-score minutes, points/rebounds/assists/threes/blocks/steals, made/attempted shots, turnovers and plus/minus.
- Separate current and historical views; existing schedule history, Top Performers, scoring lab, player popouts, receipts, local saves, import/export, outcomes and Google Sheets controls retained. Current receipts carry the active season and selected game date.
- Shared `nba-impact-engine.js` serves browser projections and Node verification. Player minutes and scoring rates flow into a 240-minute availability scenario and adjust team score and win estimates. Full-game scenario is separate from the 1Q/1H baseline.
- Offensive shooting efficiency uses ratios of matched totals. Defensive activity and plus/minus are explicitly descriptive; unavailable tracking stays missing. Estimated usage is calculated from complete matched player/team box scores, with reconstructed team totals; it is not an official tracking-based rate. Usage measures possession endings, while shots/assists/rebounds/turnovers per 36 show separate activity. No FT tables or rolling-last-20 panel. The adaptive prop consistency screen uses all season appearances: starts at 3; 70% qualifies; 80% is strong from 6 appearances; 3–5 are EARLY. Latest-five hit rate below 60% moves a season qualifier to WATCH. Pushes count in the denominator but are not hits; missing statistics block qualification. No 20-game requirement or endpoint. An open page checks the committed snapshot every minute and preserves selected teams, player and prop inputs when new games arrive. GitHub scheduling and upstream publication may delay arrival; this is not an instant final-buzzer feed. Receipts save the same screen result.
- Automatic refresh workflow every fifteen minutes and manual Actions dispatch. Rebuild rejects incomplete/wrong-season games, duplicates, score mismatches and missing rosters; a failure preserves the last good snapshot. Pages serves the committed snapshot.

## Model and verification

`node scripts/build_model.js` learns an empirical margin-error distribution from the first 70% of the committed 2025–26 game history. The final 30% is held out; each prediction uses only earlier dates. Team offense and defense shrink toward league scoring with ten prior games; league home margin supplies home advantage. No odds or market probabilities are inputs.

Current historical evaluation: 370 held-out games, Brier 0.179218, accuracy 73.78%, margin MAE 11.85. These results describe this single provisional historical dataset; they do not establish calibration, profitability, superiority over sportsbooks or current-season accuracy. The injury/minutes scenario has not been historically validated. All betting qualification remains disabled.

Run:

```sh
node --test tests/*.test.js
python -m unittest discover -s tests -p 'test_*.py'
npm install --prefix /tmp/nba-qa jsdom@26.1.0 --no-audit --no-fund
NODE_PATH=/tmp/nba-qa/node_modules node tests/dom-smoke.cjs
python scripts/refresh_current.py
node scripts/build_model.js
```

Data provenance: ESPN `scoreboard?dates=YYYYMMDD`, `summary?event=ID`, `teams/ID/roster?season=YEAR`, and `injuries`, under `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/`. Player log records retain summary URLs. ESPN season year is the ending year (2027 for 2026–27). Current snapshot timestamps use America/Chicago.

## Remaining limitations

Official usage percentage, potential assists, rebound chances and isolated individual defensive impact are not supplied by this feed. A labeled standard box-score usage estimate is now available wherever its player/team inputs are complete. The estimate uses the Basketball-Reference formula (https://www.basketball-reference.com/about/glossary.html); windows aggregate used plays divided by estimated play exposure. Defensive events are not a causal defensive rating. Questionable players remain in the displayed scenario; Not listed is not confirmation of playing. Stale injury snapshots cannot alter the baseline. Past-date team estimates exclude future results; current injury reports are not applied retrospectively.

Kambi/Kalshi price entry and cents/American conversion remain manual. No authenticated automatic market feed is connected. Google Sheets controls and configured endpoint are retained, but remote write success cannot be established without submitting a real row; local receipts remain browser-specific. Source reconciliation checks internal consistency, not independent provider agreement. Very small current-season samples remain prominently counted. Historical data has unresolved audit findings and is not relabeled verified.
