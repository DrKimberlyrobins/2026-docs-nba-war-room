# Pregame availability repair

This change fixes ingestion and adds evidence without tuning to October 26 results.

- ESPN injuries with missing athlete IDs match through playercard IDs, then unique team/name matches. Ambiguous entries remain unresolved and are counted.
- NBA Official report PDFs are downloaded and parsed with Poppler. Exact player/team/game-date matches override secondary statuses only when the report predates the forecast cutoff. Not-yet-submitted teams remain unknown. PDF failures are exposed in snapshot diagnostics; ESPN remains a labelled secondary source.
- Availability reported after a historical cutoff cannot enter that historical scenario.
- Team/player game history uses exact timestamps rather than UTC calendar dates.
- FGA and 3PA scenario columns use recorded attempts per minute, preserving missing values. They are research allocations, not a newly validated scoring model.
- Minutes per appearance are displayed separately from the original allocation. The existing allocation is retained for comparison: changing to appearance minutes for every player would inflate fringe players without lineup/role evidence.
- Unvalidated player scoring adjustments are disabled in team probabilities.
- Scheduled future games get append-only forecast snapshots at refresh time. CapturedAt, inputs timestamp, engine hash and availability evidence distinguish actual pregame records from reconstructed research. This does not retroactively recover missing pregame snapshots, nor connect the Previous Game UI to archives yet.

Validation: Node engine/consistency/usage/free-throw tests, Python ingestion tests, browser DOM smoke. Live-source matching checked separately. No accuracy improvement is claimed; lineup-aware minute redistribution, attempted-shot scoring, held-out evaluation and archive browsing remain unfinished.
