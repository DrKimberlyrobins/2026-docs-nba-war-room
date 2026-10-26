"""ESPN regular-season ingestion. Never overwrites the historical baseline.
Rejects incomplete games, mismatched scores, duplicate rows and wrong seasons.
"""
import json, math, os, urllib.request, time
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/'
ROOT=Path(__file__).resolve().parents[1]
NOW=datetime.now(ZoneInfo('America/Chicago'))
YEAR=NOW.year+1 if NOW.month>=9 else NOW.year
STAMP=NOW.isoformat()
def fetch(path):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE+path,timeout=25) as r:return json.load(r)
        except Exception:
            if attempt==2:raise
            time.sleep(attempt+1)
def number(v):
    try:
        if ':' in str(v):
            m,s=str(v).split(':');return float(m)+float(s)/60
        n=float(v);return n if math.isfinite(n) else None
    except (TypeError,ValueError):return None
def parse_stats(keys,values):
    result={}
    aliases={'MIN':'minutes','PTS':'points','REB':'rebounds','AST':'assists','TO':'turnovers','STL':'steals','BLK':'blocks','OREB':'offensiveRebounds','DREB':'defensiveRebounds','+/-':'plusMinus'}
    pairs={'FG':('fieldGoalsMade','fieldGoalsAttempted'),'3PT':('threes','threePointersAttempted'),'FT':('freeThrowsMade','freeThrowsAttempted')}
    for k,v in zip(keys,values):
        if k in pairs:
            bits=str(v).split('-')
            if len(bits)!=2:raise ValueError('invalid shot pair')
            made,att=map(number,bits)
            if made is None or att is None or not 0<=made<=att:raise ValueError('invalid shot pair')
            result.update(zip(pairs[k],(made,att)))
        elif k in aliases:result[aliases[k]]=number(v)
    return result
def parse_game(d):
    event=d['header']; comp=event['competitions'][0]
    if event['season']['year']!=YEAR or int(event['season']['type'])!=2:raise ValueError('wrong season')
    if not comp['status']['type']['completed']:raise ValueError('not final')
    competitors={str(c['team']['id']):c for c in comp['competitors']}
    teams=[];players=[]
    for tid,c in competitors.items():
        q=[number(x.get('value',x.get('displayValue'))) for x in c.get('linescores',[])]
        if len(q)<4 or any(x is None for x in q):raise ValueError('missing quarters')
        score=number(c['score'])
        if abs(sum(q)-score)>.01:raise ValueError('quarter total mismatch')
        opp=next(x for x in competitors if x!=tid)
        teams.append(dict(eventId=event['id'],date=comp['date'],teamId=tid,team=c['team']['displayName'],opponentId=opp,homeAway=c['homeAway'],q1=q[0],q2=q[1],q3=q[2],q4=q[3],firstHalf=sum(q[:2]),regulation=sum(q[:4]),fullGame=score,overtimePoints=sum(q[4:])))
    for group in d['boxscore']['players']:
        tid=str(group['team']['id']);c=competitors[tid]
        for block in group['statistics']:
            for row in block['athletes']:
                if row.get('didNotPlay'):continue
                if row.get('reason')=="COACH'S DECISION" and row.get('stats',[None])[0]=='--' and all(str(v) in ('0','0-0') for v in row['stats'][1:]):continue
                stats=parse_stats(block['labels'],row.get('stats',[]))
                if not stats or stats.get('minutes') is None:raise ValueError('missing player minutes')
                if any(stats.get(k) is None or stats[k]<0 for k in ['points','rebounds','assists','threes']):raise ValueError('missing player stats')
                players.append(dict(eventId=event['id'],date=comp['date'],sourceUrl=BASE+'summary?event='+event['id'],playerId=str(row['athlete']['id']),name=row['athlete']['displayName'],teamId=tid,team=c['team']['displayName'],**stats))
    if len({(p['teamId'],p['playerId']) for p in players})!=len(players):raise ValueError('duplicate player')
    for t in teams:
        if abs(sum(p['points'] for p in players if p['teamId']==t['teamId'])-t['fullGame'])>.01:raise ValueError('player points mismatch')
    return teams,players

def main():
    errors=[]
    def attempt(path):
        try:return fetch(path)
        except Exception as e:errors.append({'url':BASE+path,'error':str(e)});return None
    historical=json.loads((ROOT/'data/nba-teams-2026.json').read_text())['teams']
    start=datetime(YEAR-1,10,1);days=(NOW.replace(tzinfo=None)-start).days+1
    with ThreadPoolExecutor(max_workers=6) as pool:
        boards=list(pool.map(attempt,['scoreboard?dates='+(start+timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]))
        rosters=list(pool.map(attempt,['teams/'+t['teamId']+'/roster?season='+str(YEAR) for t in historical]))
    injuries=attempt('injuries')
    injury_map={str(i['athlete']['id']):i for team in (injuries or {}).get('injuries',[]) for i in team.get('injuries',[]) if i.get('athlete',{}).get('id')}
    events={str(e['id']):e for b in boards if b for e in b.get('events',[]) if e.get('season',{}).get('year')==YEAR and e.get('season',{}).get('type')==2 and e.get('status',{}).get('type',{}).get('completed')}
    with ThreadPoolExecutor(max_workers=6) as pool:summaries=list(pool.map(attempt,['summary?event='+eid for eid in events]))
    teamlogs={t['teamId']:[] for t in historical};playerlogs={};processed=[]
    for eid,d in zip(events,summaries):
        if not d:continue
        try:
            ts,ps=parse_game(d)
            for t in ts:teamlogs[t['teamId']].append(t)
            for p in ps:playerlogs.setdefault(p['playerId'],[]).append(p)
            processed.append(eid)
        except Exception as e:errors.append({'eventId':eid,'error':str(e)})
    players=[]
    for team,roster in zip(historical,rosters):
        if not roster:continue
        if roster.get('season',{}).get('year')!=YEAR:errors.append({'teamId':team['teamId'],'error':'wrong roster season'});continue
        for p in roster.get('athletes',[]):
            pid=str(p['id']);inj=injury_map.get(pid)
            logs=sorted(playerlogs.get(pid,[]),key=lambda g:g['date'],reverse=True)
            fields=['points','rebounds','assists','threes','minutes','steals','blocks']
            def averages(gs):return {k:sum(g[k] for g in gs if g.get(k) is not None)/len([g for g in gs if g.get(k) is not None]) if any(g.get(k) is not None for g in gs) else None for k in fields}
            players.append(dict(playerId=pid,name=p['displayName'],lastRecordedTeam=team['team'],currentTeamId=team['teamId'],gamesPlayed=len(logs),seasonAverages=averages(logs),last5={'averages':averages(logs[:5]),'complete':len(logs)>=5,'available':min(5,len(logs))},last10={'averages':averages(logs[:10]),'complete':len(logs)>=10,'available':min(10,len(logs))},gameLogs=logs,availability={'status':inj['status'] if inj else 'Not listed' if injuries else 'Unknown','reportedAt':inj.get('date') if inj else None,'checkedAt':STAMP,'source':BASE+'injuries','comment':inj.get('shortComment','') if inj else ''}))
    teams=[]
    for t in historical:
        logs=sorted(teamlogs[t['teamId']],key=lambda g:g['date'],reverse=True)
        def avg(gs):return {k:sum(g[k] for g in gs)/len(gs) if gs else None for k in ['q1','firstHalf','fullGame']}
        teams.append(dict(teamId=t['teamId'],team=t['team'],gameLogs=logs,gamesPlayed=len(logs),seasonScoring=avg(logs),homeScoring=avg([g for g in logs if g['homeAway']=='home']),awayScoring=avg([g for g in logs if g['homeAway']=='away']),homeGames=sum(g['homeAway']=='home' for g in logs),awayGames=sum(g['homeAway']=='away' for g in logs)))
    status=dict(generatedAt=STAMP,season=f'{YEAR-1}-{str(YEAR)[2:]}',espnSeason=YEAR,seasonType='regular',source='ESPN scoreboard, summary, roster, injuries',gamesDiscovered=len(events),gamesProcessed=len(processed),uniquePlayers=len(players),playerRecords=sum(len(p['gameLogs']) for p in players),playersWithLast5=sum(p['gamesPlayed']>=5 for p in players),playersWithLast10=sum(p['gamesPlayed']>=10 for p in players),failedSummaries=errors,dataStatus='VERIFIED_BOX_SCORES' if not errors else 'PARTIAL',bettingQualificationEnabled=False,rostersLoaded=sum(r is not None for r in rosters),injuriesLoaded=injuries is not None)
    payload=dict(**status,teams=teams,players=players)
    # Publish only a useful complete snapshot. Preserve previous good snapshot on upstream failure.
    if errors or len(teams)!=30 or not players or len(processed)!=len(events):
        (ROOT/'data/nba-refresh-failure.json').write_text(json.dumps(status,indent=2));raise RuntimeError(f'refresh rejected: {errors[:3]}')
    (ROOT/'data/nba-current.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
    failure=ROOT/'data/nba-refresh-failure.json'
    if failure.exists():failure.unlink()
    print(json.dumps(status,indent=2))
if __name__=='__main__':main()
