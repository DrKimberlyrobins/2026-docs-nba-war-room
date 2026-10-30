#!/usr/bin/env python3
"""Independent NBA Simulator. Read-only upstreams; 10,000 Monte Carlo draws.

Writes only inside this new project. Never updates either existing NBA room.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.request
from zoneinfo import ZoneInfo

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
VERSION='nba-simulator-1.1'
RUNS=10000
CT=ZoneInfo('America/Chicago')
ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/'
UPSTREAM='https://raw.githubusercontent.com/DrKimberlyrobins/2026-docs-nba-war-room/main/data/'


def when(value):return datetime.fromisoformat(value.replace('Z','+00:00'))
def stamp(value):return value.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def read(path,default=None):return json.loads(path.read_text()) if path.exists() else default
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,separators=(',',':'),allow_nan=False));tmp.replace(path)


def num(value):
    try:
        n=float(value)
        return n if value is not None and value!='' and math.isfinite(n) else None
    except (TypeError,ValueError):return None


def fetch_json(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Docs-NBA-Simulator/1.0'})
    with urllib.request.urlopen(request,timeout=35) as response:return json.load(response)


def parse_market(comp,captured,url):
    quotes=sorted(comp.get('odds',[]),key=lambda x:x.get('provider',{}).get('priority',999))
    for quote in quotes:
        # Prefer signed per-side close lines. Do not silently substitute openers.
        hs=num(quote.get('pointSpread',{}).get('home',{}).get('close',{}).get('line'))
        if hs is None:
            magnitude=num(quote.get('spread'))
            if magnitude is not None:
                if quote.get('homeTeamOdds',{}).get('favorite') is True:hs=-abs(magnitude)
                elif quote.get('awayTeamOdds',{}).get('favorite') is True:hs=abs(magnitude)
                elif magnitude==0:hs=0
        total=num(quote.get('overUnder'))
        if hs is None and total is None:continue
        return {'provider':quote.get('provider',{}).get('name','ESPN-listed provider'),
                'homeSpread':hs,'total':total,
                'homeMoneyline':num(quote.get('moneyline',{}).get('home',{}).get('close',{}).get('odds')),
                'awayMoneyline':num(quote.get('moneyline',{}).get('away',{}).get('close',{}).get('odds')),
                'fetchedAt':captured,'source':url,
                'semantics':'Current quote retrieved from ESPN; bookmaker publication time not provided.'}
    return None


def parse_board(board,captured,url):
    games=[]
    for event in board.get('events',[]):
        if event.get('season',{}).get('type')!=2:continue
        comp=event['competitions'][0]
        sides={c['homeAway']:c for c in comp['competitors']}
        if not all(s in sides for s in ('away','home')):continue
        status=comp.get('status',event.get('status',{})).get('type',{})
        row={'id':str(event['id']),'tip':event['date'],'name':event['name'],
             'date':when(event['date']).astimezone(CT).date().isoformat(),
             'state':status.get('state','pre'),'completed':status.get('completed') is True,
             'neutral':bool(comp.get('neutralSite')),'source':{'url':url,'fetchedAt':captured},
             'market':parse_market(comp,captured,url)}
        for side in ('away','home'):
            c=sides[side]
            row[side]={'id':str(c['team']['id']),'name':c['team']['displayName'],
                       'abbr':c['team'].get('abbreviation',c['team']['displayName']),
                       'score':num(c.get('score')) if row['completed'] else None,
                       'quarters':[num(q.get('value',q.get('displayValue'))) for q in c.get('linescores',[])]}
        games.append(row)
    return games


def normalize_history(doc,season,asof):
    by_game={}
    for team in doc.get('teams',[]):
        for row in team.get('gameLogs',[]):
            if when(row['date'])>=asof:continue
            quarters=[num(row.get('q'+str(i))) for i in range(1,5)]
            full=num(row.get('fullGame'));reg=num(row.get('regulation'))
            if any(q is None or q<0 for q in quarters) or full is None or reg is None:continue
            if abs(sum(quarters)-reg)>.01 or full<reg:continue
            by_game.setdefault(str(row['eventId']),{})[str(row['teamId'])]={
                'teamId':str(row['teamId']),'opponentId':str(row['opponentId']),
                'date':row['date'],'homeAway':row['homeAway'],'quarters':quarters,'score':full}
    games=[]
    for gid,rows in by_game.items():
        if len(rows)!=2:continue
        sides={r['homeAway']:r for r in rows.values()}
        if set(sides)!= {'home','away'}:continue
        if sides['home']['opponentId']!=sides['away']['teamId'] or sides['away']['opponentId']!=sides['home']['teamId']:continue
        if sides['home']['date']!=sides['away']['date']:continue
        games.append({'id':gid,'tip':sides['home']['date'],'season':season,
                      'away':sides['away'],'home':sides['home']})
    return sorted(games,key=lambda g:(g['tip'],g['id']))


def fit(history):
    teams=sorted({g[s]['teamId'] for g in history for s in ('away','home')})
    idx={t:i for i,t in enumerate(teams)};n=len(teams)
    x=np.zeros((len(history)*2,2*n+2));y=np.zeros((len(history)*2,4));weights=np.zeros(len(history)*2)
    current_counts={t:sum(g['season']=='current' and t in (g['away']['teamId'],g['home']['teamId']) for g in history) for t in teams}
    prior_counts={t:sum(g['season']=='prior' and t in (g['away']['teamId'],g['home']['teamId']) for g in history) for t in teams}
    for i,g in enumerate(history):
        for j,(s,o) in enumerate((('away','home'),('home','away'))):
            r=2*i+j;tid=g[s]['teamId'];opp=g[o]['teamId']
            x[r,0]=1;x[r,1+idx[tid]]=1;x[r,1+n+idx[opp]]=1;x[r,-1]=-.5 if s=='away' else .5
            y[r]=g[s]['quarters']
            # A prior season contributes six effective games per team, rather
            # than overwhelming a new season's three-to-six observed games.
            weights[r]=1 if g['season']=='current' else 6/max(1,prior_counts[tid])
    penalty=np.eye(x.shape[1])*4;penalty[0,0]=1e-8
    beta=np.linalg.solve(x.T@(weights[:,None]*x)+penalty,x.T@(weights[:,None]*y))
    residuals=(y-x@beta).reshape(len(history),2,4)
    paired_weights=weights.reshape(-1,2).mean(axis=1)
    paired_weights/=paired_weights.sum()
    residuals-=np.average(residuals,axis=0,weights=paired_weights)
    return {'index':idx,'beta':beta,'residuals':residuals,'weights':paired_weights,
            'currentCounts':current_counts,'priorCounts':prior_counts}


def summarize(values):
    vals,counts=np.unique(values,return_counts=True)
    return {'mean':round(float(np.mean(values)),2),'median':round(float(np.median(values)),2),
            'p10':round(float(np.quantile(values,.1)),2),'p90':round(float(np.quantile(values,.9)),2),
            'hist':[[int(v),int(c)] for v,c in zip(vals,counts)]}


def probability(values,line,mode):
    results=values+line if mode=='spread' else values-line
    return {'win':int(np.count_nonzero(results>0)),'loss':int(np.count_nonzero(results<0)),
            'push':int(np.count_nonzero(results==0))}


def simulate(game,history,asof,runs=RUNS):
    eligible=[g for g in history if when(g['tip'])<asof]
    if len(eligible)<30:return {'status':'insufficient_history','runs':0}
    model=fit(eligible);idx=model['index'];n=len(idx)
    if game['away']['id'] not in idx or game['home']['id'] not in idx:
        return {'status':'missing_team_history','runs':0}
    beta=model['beta'];target=[]
    for side,other in (('away','home'),('home','away')):
        venue=0 if game.get('neutral') else (-.5 if side=='away' else .5)
        target.append(np.maximum(1,beta[0]+beta[1+idx[game[side]['id']]]+beta[1+n+idx[game[other]['id']]]+venue*beta[-1]))
    # Seed excludes market prices and retrieval timestamps: identical team data
    # produce identical simulated scores, even when a bookmaker changes a line.
    seed=int(digest([VERSION,game['id'],np.array(target).tolist(),eligible])[:16],16)
    rng=np.random.default_rng(seed)
    residuals=model['residuals'][rng.choice(len(eligible),runs,p=model['weights'])]
    quarter=np.maximum(0,np.floor(np.array(target)+residuals+rng.random((runs,2,4)))).astype(int)
    final=quarter.sum(axis=2)
    ties=final[:,0]==final[:,1]
    overtime=[]
    for g in eligible:
        a=g['away']['score']-sum(g['away']['quarters']);h=g['home']['score']-sum(g['home']['quarters'])
        if sum(g['away']['quarters'])==sum(g['home']['quarters']) and a!=h and a>=0 and h>=0:
            overtime.extend(((a,h),(h,a)))
    if ties.any() and overtime:final[ties]+=np.array(overtime,dtype=int)[rng.integers(len(overtime),size=int(ties.sum()))]
    periods={}
    market=game.get('market')
    for key,scores in [('q1',quarter[:,:,0]),('h1',quarter[:,:,:2].sum(axis=2)),('full',final)]:
        a=scores[:,0];h=scores[:,1];wins=int(np.count_nonzero(a>h));losses=int(np.count_nonzero(h>a));tied=runs-wins-losses
        side='away' if wins>losses else 'home' if losses>wins else None
        p={'away':summarize(a),'home':summarize(h),'total':summarize(a+h),'margin':summarize(a-h),
           'winner':{'side':side,'count':max(wins,losses),'probability':max(wins,losses)/runs},
           'awayWins':wins,'homeWins':losses,'ties':tied,
           'projectedHomeSpread':round(float(np.mean(a-h)),2)}
        if key=='full' and market:
            hs=market.get('homeSpread');line=market.get('total')
            if hs is not None:
                result=probability(a-h,-hs,'spread')
                side='away' if result['win']>result['loss'] else 'home' if result['loss']>result['win'] else None
                p['spread']={'side':side,'line':-hs if side=='away' else hs if side=='home' else None,
                             'count':max(result['win'],result['loss']),'probability':max(result['win'],result['loss'])/runs,'pushes':result['push']}
            if line is not None:
                result=probability(a+h,line,'total')
                side='over' if result['win']>result['loss'] else 'under' if result['loss']>result['win'] else None
                p['totalDirection']={'side':side,'line':line,'count':max(result['win'],result['loss']),
                                     'probability':max(result['win'],result['loss'])/runs,'pushes':result['push']}
        periods[key]=p
    return {'status':'ready','runs':runs,'seed':str(seed),'periods':periods,
            'samples':{s:{'current':model['currentCounts'][game[s]['id']],
                           'prior':model['priorCounts'][game[s]['id']]} for s in ('away','home')},
            'historicalGames':len(eligible)}


def grade(forecast,game):
    if when(forecast['savedAt'])>=when(game['tip']) or not game['completed']:return None
    if forecast['simulation']['status']!='ready':return None
    outcome={'gameId':game['id'],'savedAt':forecast['savedAt'],'markets':{},'periods':{}}
    for key,n in [('q1',1),('h1',2),('full',4)]:
        if key=='full':a=game['away']['score'];h=game['home']['score']
        else:
            aq=game['away'].get('quarters',[]);hq=game['home'].get('quarters',[])
            if len(aq)<n or len(hq)<n or any(x is None for x in aq[:n]+hq[:n]):continue
            a=sum(aq[:n]);h=sum(hq[:n])
        if a is None or h is None:continue
        p=forecast['simulation']['periods'][key]
        outcome['periods'][key]={'awayActual':a,'homeActual':h,
                                 'awayError':round(p['away']['mean']-a,2),'homeError':round(p['home']['mean']-h,2),
                                 'totalError':round(p['total']['mean']-a-h,2),
                                 'totalIn80Range':p['total']['p10']<=a+h<=p['total']['p90']}
        if key!='full':continue
        for name,pred in [('winner',p['winner']),('spread',p.get('spread')),('total',p.get('totalDirection'))]:
            if not pred or not pred['side']:continue
            if name=='total':result=(a+h-pred['line'])*(1 if pred['side']=='over' else -1)
            else:result=(a-h if pred['side']=='away' else h-a)+(pred['line'] if name=='spread' else 0)
            outcome['markets'][name]='win' if result>0 else 'loss' if result<0 else 'push'
    return outcome


def metrics(grades):
    result={'gradedGames':len(grades),'markets':{},'periods':{}}
    for key in ('winner','spread','total'):
        v=[g['markets'].get(key) for g in grades];w=v.count('win');l=v.count('loss');p=v.count('push')
        result['markets'][key]={'wins':w,'losses':l,'pushes':p,'hitRate':w/(w+l) if w+l else None}
    for key in ('q1','h1','full'):
        rows=[g['periods'][key] for g in grades if key in g['periods']]
        result['periods'][key]={'games':len(rows),'teamMAE':round(float(np.mean([abs(r[k]) for r in rows for k in ('awayError','homeError')])),2) if rows else None,
                               'totalMAE':round(float(np.mean([abs(r['totalError']) for r in rows])),2) if rows else None}
    return result


def collect(root,now,start,days,offline=False):
    cache=root/'.cache';cache.mkdir(exist_ok=True)
    issues=[];sources=[]
    def get(name,url,refresh=True):
        path=cache/name
        if not offline and refresh:
            try:
                value=fetch_json(url);write(path,{'retrievedAt':stamp(datetime.now(timezone.utc)),'value':value})
            except Exception as exc:
                issues.append(f'{name}: refresh failed ({type(exc).__name__}); prior cache retained if available.')
        stored=read(path)
        if not stored:raise ValueError('No source available: '+name)
        sources.append({'url':url,'retrievedAt':stored['retrievedAt'],'sha256':digest(stored['value'])})
        return stored['value'],stored['retrievedAt']
    prior,pt=get('historical.json',UPSTREAM+'nba-teams-2026.json',refresh=not (cache/'historical.json').exists())
    current,ct=get('current.json',UPSTREAM+'nba-current.json')
    history=normalize_history(prior,'prior',now)+normalize_history(current,'current',now)
    # Deduplicate IDs, preferring current season records.
    history=sorted({g['id']:g for g in history}.values(),key=lambda g:(g['tip'],g['id']))
    schedule={}
    wanted=[start+timedelta(days=i) for i in range(days)]
    # Re-fetch dates with existing receipts so final grading happens automatically.
    for p in (root/'data/receipts').glob('*.json'):
        wanted.append(when(read(p)['latest']['tip']).astimezone(CT).date())
    for d in sorted(set(wanted)):
        url=ESPN+'scoreboard?dates='+d.strftime('%Y%m%d')
        try:
            board,at=get('scoreboard-'+d.isoformat()+'.json',url)
            for g in parse_board(board,at,url):schedule[g['id']]=g
        except Exception as exc:issues.append(f'{d}: schedule unavailable ({type(exc).__name__}).')
    return history,sorted(schedule.values(),key=lambda g:g['tip']),sources,issues,{
        'currentSeasonThrough':current.get('generatedAt'),'priorSeason':prior.get('season'),
        'priorStatus':prior.get('status'),'currentSeason':current.get('season')}


def build(root,now,start,days=3,offline=False):
    history,games,sources,issues,evidence=collect(root,now,start,days,offline)
    # Collection can take time. Never stamp a forecast before the evidence used
    # to create it was fetched, or create a late forecast during a tipoff race.
    now=max([now,datetime.now(timezone.utc)]+[when(s['retrievedAt']) for s in sources])
    public=root/'data';receipts=public/'receipts';receipts.mkdir(parents=True,exist_ok=True)
    input_hash=digest(history)
    input_path=public/'inputs'/(input_hash+'.json.gz')
    if not input_path.exists():
        input_path.parent.mkdir(exist_ok=True)
        input_path.write_bytes(gzip.compress(json.dumps(history,separators=(',',':')).encode(),mtime=0))
    for g in games:
        # No first-time forecasts, or rewrites, for a game already started.
        if g['state']!='pre' or g['completed'] or when(g['tip'])<=now:continue
        path=receipts/(g['id']+'.json');old=read(path,{})
        if old and when(old['latest']['tip'])<=now:continue
        fingerprint=digest([VERSION,input_hash,g['id'],g['tip'],g.get('market'),g['away']['id'],g['home']['id']])
        if old.get('latest',{}).get('fingerprint')==fingerprint:continue
        simulation=simulate(g,history,now)
        saved_at=max(now,datetime.now(timezone.utc))
        if saved_at>=when(g['tip']):continue
        forecast={'id':g['id'],'date':g['date'],'name':g['name'],'tip':g['tip'],
                  'away':g['away'],'home':g['home'],'market':g.get('market'),
                  'savedAt':stamp(saved_at),'version':VERSION,'fingerprint':fingerprint,
                  'inputHistoryHash':input_hash,'inputHistoryFile':'inputs/'+input_path.name,
                  'sources':sources,'evidence':evidence,'simulation':simulation}
        write(path,{'first':old.get('first',forecast),'latest':forecast,'revisions':old.get('revisions',0)+1})
    views=[];grades=[];by_id={g['id']:g for g in games}
    for path in receipts.glob('*.json'):
        receipt=read(path);f=receipt['latest'];actual=by_id.get(f['id'])
        if actual and actual['completed']:
            receipt['grade']=grade(f,actual);write(path,receipt)
        if receipt.get('grade'):grades.append(receipt['grade'])
        views.append({**f,'firstSavedAt':receipt['first']['savedAt'],'revisions':receipt['revisions'],
                      'state':actual['state'] if actual else 'pre' if when(f['tip'])>now else 'post',
                      'grade':receipt.get('grade')})
    saved={f['id'] for f in views}
    for g in games:
        if g['id'] not in saved:
            views.append({**g,'savedAt':None,'simulation':{'status':'no_pregame_receipt','runs':0}})
    result={'title':"DOC'S NBA SIMULATOR",'version':VERSION,'runs':RUNS,'updatedAt':stamp(max(now,datetime.now(timezone.utc))),
            'forecasts':sorted(views,key=lambda f:f['tip']),'issues':issues,'metrics':metrics(grades),
            'evidence':evidence,'sources':sources,
            'method':'Ridge quarter scoring model: team offense, opponent defense and venue. Prior season weighted as six effective games per team. Exactly 10,000 joint historical residual draws; quarters accumulate into halves and regulation. Historical overtime pairs resolve tied regulation outcomes.',
            'limitations':['Prospective accuracy is not yet established.',
                           'Team score model does not yet adjust for confirmed injury or rotation changes.',
                           'Prior-season source is labeled provisional; current-season box scores are preferred.',
                           'Only full-game market quotes are connected; first-quarter and first-half fair lines are projections.']}
    write(public/'latest.json',result)
    print(json.dumps({'games':len(views),'simulated':sum(f['simulation']['status']=='ready' for f in views),
                      'runsPerGame':RUNS,'graded':len(grades),'issues':issues}))
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--date');p.add_argument('--days',type=int,default=3)
    p.add_argument('--offline',action='store_true');p.add_argument('--root',type=Path,default=ROOT)
    args=p.parse_args();now=datetime.now(timezone.utc)
    start=datetime.fromisoformat(args.date).date() if args.date else now.astimezone(CT).date()
    build(args.root,now,start,args.days,args.offline)
