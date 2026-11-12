#!/usr/bin/env python3
"""Fetch verified NBA player-vs-defender season matchup records.

No estimated assignments. A failed NBA tracking request exits nonzero and
never overwrites the last verified output. Requires: pip install nba_api
"""
import argparse
import datetime as dt
import json
import os
import tempfile
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2026-27")
    parser.add_argument("--output", default="data/nba_defensive_matchups.json")
    args = parser.parse_args()
    from nba_api.stats.endpoints import leagueseasonmatchups
    endpoint = leagueseasonmatchups.LeagueSeasonMatchups(
        season=args.season, season_type_playoffs="Regular Season",
        per_mode_simple="Totals", timeout=45
    )
    datasets = endpoint.get_data_frames()
    if not datasets or datasets[0].empty:
        raise RuntimeError("NBA returned no matchup rows; existing data preserved")
    df = datasets[0]
    cols = set(df.columns)
    required = {"OFF_PLAYER_ID", "DEF_PLAYER_ID", "PARTIAL_POSS", "PLAYER_PTS"}
    if not required.issubset(cols):
        raise RuntimeError(f"Unexpected NBA schema, missing: {sorted(required-cols)}")
    records = df.where(df.notna(), None).to_dict(orient="records")
    result = {
        "source": "NBA Stats LeagueSeasonMatchups",
        "season": args.season,
        "season_type": "Regular Season",
        "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "record_type": "historical_defensive_matchups_not_confirmed_future_assignments",
        "count": len(records),
        "records": records,
    }
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=".matchups-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(result, stream, allow_nan=False, separators=(",", ":"))
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(f"Saved {len(records)} verified matchup records to {target}")

if __name__ == "__main__":
    main()
