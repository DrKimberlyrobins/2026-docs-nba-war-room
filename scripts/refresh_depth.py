"""Publish public ESPN depth order and timestamped NBA game-day report rows."""
import datetime as dt
import io
import json
import re
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from refresh_current import BASE, ROOT, fetch

UTC = timezone.utc
OUTPUT = ROOT / 'data/nba-depth.json'
POSITIONS = ('pg', 'sg', 'sf', 'pf', 'c')


def team_chart(team_id):
    path = f'teams/{team_id}/depthcharts'
    chart = fetch(path)['depthchart'][0]['positions']
    positions = {}
    for position in POSITIONS:
        athletes = chart.get(position, {}).get('athletes', [])
        positions[position.upper()] = [
            {'id': str(player['id']), 'name': player['displayName']}
            for player in athletes
        ]
    if not any(positions.values()):
        raise ValueError(f'Empty chart for team {team_id}')
    return {'source': BASE + path, 'checkedAt': datetime.now(timezone.utc).isoformat(),
            'positions': positions}


def report_bytes(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'DocsNBAWarRoom/1.0'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()


def injuries(season):
    import pdfplumber
    url=f'https://official.nba.com/nba-injury-report-{season}-{str(season+1)[-2:]}-season/'
    raw=report_bytes(url);links=set(re.findall(r'https://ak-static\.cms\.nba\.com/referee/injury/Injury-Report_[^\s\"\x27<>]+\.pdf',raw.decode()))
    def timestamp(u):
        m=re.search(r'_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)',u)
        if not m:raise ValueError('Unrecognized injury report timestamp')
        return dt.datetime.strptime(' '.join(m.groups()),'%Y-%m-%d %I %M %p').replace(tzinfo=ZoneInfo('America/New_York'))
    links=[u for u in links if timestamp(u)<=dt.datetime.now(UTC)]
    if not links:raise ValueError('No timestamped injury report available')
    u=max(links,key=timestamp);pdf=report_bytes(u);rows=[];date=None;matchup=None;team=None;last=None
    with pdfplumber.open(io.BytesIO(pdf)) as doc:
        for page in doc.pages:
            words=page.extract_words();page_header={w['text']:w['x0'] for w in words if w['text'] in ['GameDate','GameTime','Matchup','Team','PlayerName','CurrentStatus','Reason']}
            header=page_header
            if len(header)==7: retained_header=header
            elif 'retained_header' in locals():header=retained_header
            else:raise ValueError('Injury PDF columns changed; parser refuses uncertain layout')
            cuts=[header[k]-2 for k in ['GameDate','GameTime','Matchup','Team','PlayerName','CurrentStatus','Reason']]+[page.width+10]
            lines={}
            for w in words:
                if w['top']<75 or (len(page_header)==7 and w['top']<122) or w['text'].startswith('Page'):continue
                y=round(w['top']/3)*3;cols=lines.setdefault(y,['']*7)
                for i in range(7):
                    if cuts[i]<=w['x0']<cuts[i+1]:cols[i]+=w['text']
            anchors=[y for y,c in lines.items() if c[5] in ['Out','Doubtful','Questionable','Probable','Available']]
            for y,c in list(lines.items()):
                if c[6] and not any(c[:6]) and c[6]!='NOTYETSUBMITTED' and anchors:
                    near=min(anchors,key=lambda a:abs(a-y))
                    lines[near][6]=(c[6]+lines[near][6]) if y<near else (lines[near][6]+c[6]);c[6]=''
            for _,cols in sorted(lines.items()):
                d,tm,ma,te,pl,st,reason=cols
                if re.fullmatch(r'\d{2}/\d{2}/\d{4}',d):date=dt.datetime.strptime(d,'%m/%d/%Y').date().isoformat()
                if '@' in ma:matchup=ma
                if te:team=te
                if 'NOTYETSUBMITTED' in ''.join(cols):
                    rows.append({'date':date,'matchup':matchup,'team':team,'submitted':False});last=None
                elif pl and st in ['Out','Doubtful','Questionable','Probable','Available']:
                    last={'date':date,'matchup':matchup,'team':team,'player':pl,'status':st,'reason':reason,'submitted':True};rows.append(last)
                elif reason and last:last['reason']+=reason
    if not rows:raise ValueError('Injury PDF parsed zero rows')
    return {'published_at':timestamp(u).astimezone(UTC).isoformat(),'source':u,'rows':rows}

def name_key(name):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFD', name).lower())


def official_reports(day):
    season = int(day[:4]) - (int(day[5:7]) < 9)
    report = injuries(season)
    board = fetch('scoreboard?dates=' + day.replace('-', ''))
    reports = {}
    for event in board.get('events', []):
        teams = {}
        for competitor in event['competitions'][0]['competitors']:
            team = competitor['team']
            rows = [row for row in report['rows'] if row['date'] == day and
                    name_key(row['team'] or '') == name_key(team['displayName'])]
            teams[str(team['id'])] = {
                'submitted': bool(rows) and all(row['submitted'] for row in rows),
                'players': {
                    name_key(' '.join(reversed(row['player'].split(',')))):
                    {'status': row['status'], 'reason': row['reason']}
                    for row in rows if row.get('player')
                }
            }
        reports[str(event['id'])] = {
            'date': day, 'tip': event['date'], 'publishedAt': report['published_at'],
            'source': report['source'], 'teams': teams
        }
    return reports


def main():
    day = datetime.now(ZoneInfo('America/Chicago')).date().isoformat()
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    charts = previous.get('charts', {})
    reports = previous.get('reports', {})
    reports = {key: value for key, value in reports.items() if value['date'] == day}
    team_ids = [str(team['teamId']) for team in
                json.loads((ROOT / 'data/nba-teams-2026.json').read_text())['teams']]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {team_id: pool.submit(team_chart, team_id) for team_id in team_ids}
        try:
            for key, value in official_reports(day).items():
                if value['publishedAt'] >= reports.get(key, {}).get('publishedAt', ''):
                    reports[key] = value
        except (OSError, ValueError, KeyError) as error:
            print(f'Official report refresh deferred: {error}')
        for team_id, future in futures.items():
            try:
                charts[team_id] = future.result()
            except (OSError, ValueError, IndexError, KeyError) as error:
                print(f'Team {team_id} depth chart refresh deferred: {error}')
    OUTPUT.write_text(json.dumps({'charts': charts, 'reports': reports}, separators=(',', ':')) + '\n')
    print(f'{len(charts)} team depth charts and {len(reports)} game-day reports')


if __name__ == '__main__':
    main()
