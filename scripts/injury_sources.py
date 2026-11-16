"""Timestamped injury sources. Missing data never means confirmed available."""
import re, json, unicodedata, urllib.request, subprocess, tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

def norm(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower())

def espn_index(payload, rosters):
    lookup={}
    for team, roster in rosters:
        for p in (roster or {}).get('athletes',[]):
            lookup.setdefault((str(team['teamId']),norm(p['displayName'])),[]).append(str(p['id']))
    matched={};unmatched=[]
    for team in (payload or {}).get('injuries',[]):
        for injury in team.get('injuries',[]):
            athlete=injury.get('athlete',{});pid=athlete.get('id')
            if not pid:
                # Public feed can omit athlete.id. Playercard URL contains the ID.
                ids={m.group(1) for link in athlete.get('links',[]) for m in [re.search(r'/id/(\d+)',link.get('href',''))] if m}
                if len(ids)==1:pid=ids.pop()
            if not pid:
                ids=lookup.get((str(team.get('id')),norm(athlete.get('displayName',''))),[])
                if len(ids)==1:pid=ids[0]
            if pid:matched[str(pid)]=injury
            else:unmatched.append({'teamId':team.get('id'),'name':athlete.get('displayName')})
    return matched,unmatched

def official_report(season, team_names):
    page=f'https://official.nba.com/nba-injury-report-{season}-season/'
    with urllib.request.urlopen(page,timeout=25) as r:html=r.read().decode()
    urls=re.findall(r'https://ak-static.cms.nba.com/referee/injury/Injury-Report_[^"<>\s]+\.pdf',html)
    if not urls:raise ValueError('No official report links')
    def report_time(url):
        s=re.search(r'Injury-Report_(\d{4}-\d\d-\d\d_\d\d_\d\d[AP]M)',url).group(1)
        return datetime.strptime(s,'%Y-%m-%d_%I_%M%p').replace(tzinfo=ZoneInfo('America/New_York'))
    url=max(urls,key=report_time)
    with tempfile.TemporaryDirectory() as tmp:
        pdf=tmp+'/report.pdf';txt=tmp+'/report.txt'
        urllib.request.urlretrieve(url,pdf)
        subprocess.run(['pdftotext','-layout',pdf,txt],check=True,capture_output=True)
        text=open(txt).read()
    rows=[];teams={};team=None;date=None
    for line in text.splitlines():
        d=re.search(r'\b(\d{2}/\d{2}/\d{4})\b',line)
        if d:date=datetime.strptime(d.group(1),'%m/%d/%Y').date().isoformat()
        for name in team_names:
            if name in line:team=name;teams[(date,team)]='submitted'
        if 'NOT YET SUBMITTED' in line and team:teams[(date,team)]='not submitted'
        m=re.search(r'([A-Za-zÀ-ž .’\'-]+,\s*[A-Za-zÀ-ž .’\'-]+?)\s{2,}(Out|Doubtful|Questionable|Probable|Available)\b\s*(.*)',line)
        if m and team and date:
            last,first=m.group(1).strip().split(',',1)
            rows.append({'team':team,'gameDate':date,'name':first.strip()+' '+last.strip(),'status':m.group(2),'reason':m.group(3).strip()})
    if not rows:raise ValueError('Official report parsed no player entries')
    return {'source':url,'reportedAt':report_time(url).isoformat(),'entries':rows,'teams':[{'gameDate':d,'team':t,'status':s} for (d,t),s in teams.items()]}
