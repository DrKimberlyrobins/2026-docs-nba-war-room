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

## Rotation V2 implementation

Adds a comparison panel with connected FGA, 3PA, points, rebounds, assists, blocks and PRA. The bounded allocator never gives a player more than 48 regulation minutes and exposes an underspecified rotation rather than inventing minutes. All roster members remain visible, with missing statistical history preserved as null. Returning starter appearance minutes require explicit Available/Probable status and recorded prior starts; otherwise the role remains unconfirmed. Ingestion now preserves starts and positions for that evidence.

`node scripts/evaluate_pregame.js` compares original and candidate calculations on identical player rows using expanding pretip history (minimum two prior games). Historical availability is Unknown, never inferred from who played. This is a structural audit, not independent validation: roster membership is current, and injury archives are incomplete. Candidate output remains separate pending evidence of improved out-of-sample accuracy. Attempt-based scoring with unchanged rates is algebraically equivalent to points-per-minute for complete records; merely expressing attempts explicitly is not claimed to improve accuracy.
