/* Append-only pretip snapshots; never reconstruct yesterday's forecast. */
const fs=require('node:fs'),crypto=require('node:crypto'),E=require('../nba-impact-engine');
const x=require('../data/nba-current.json'),m=require('../data/nba-probability-model.json');
const now=new Date(),version=crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../nba-impact-engine'))).digest('hex');
fs.mkdirSync('data/forecasts',{recursive:true});
for(const g of x.scheduledGames||[]){
 if(Date.parse(g.date)<=now.getTime()||g.status?.type?.state!=='pre')continue;
 const competitors=g.competitions?.[0]?.competitors||[],away=competitors.find(t=>t.homeAway==='away'),home=competitors.find(t=>t.homeAway==='home');
 if(!away||!home)continue;
 const forecast=E.predict(x.teams,x.players,away.team.id,home.team.id,m,g.date,x.officialInjuries);
 if(!forecast)continue;
 const record={eventId:g.id,tipoff:g.date,capturedAt:now.toISOString(),inputGeneratedAt:x.generatedAt,engineSha256:version,kind:'pregame-team-baseline-player-research',forecast,officialInjuries:x.officialInjuries,availability:x.players.filter(p=>[away.team.id,home.team.id].includes(String(p.currentTeamId))).map(p=>({playerId:p.playerId,...p.availability}))};
 const filename=`data/forecasts/${g.id}-${now.toISOString().replace(/[:.]/g,'-')}.json`;
 fs.writeFileSync(filename,JSON.stringify(record)+'\n',{flag:'wx'});
}
