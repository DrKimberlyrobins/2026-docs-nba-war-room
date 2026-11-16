/* Chronological structural audit. Historical injury/lineup reports unavailable: never infer them from who played. */
const fs=require('node:fs'),E=require('../nba-impact-engine'),x=require('../data/nba-current.json');
const metrics={},add=(version,field,pred,actual)=>{if(pred===null||!Number.isFinite(pred)||!Number.isFinite(actual))return;const key=version+':'+field,m=metrics[key]||(metrics[key]={n:0,absoluteError:0,bias:0});m.n++;m.absoluteError+=Math.abs(pred-actual);m.bias+=pred-actual;};
let games=0;
for(const event of E.gamesFromTeams(x.teams)){
 const cutoff=Date.parse(event.home.date),ids=[event.away.teamId,event.home.teamId];
 // Require two prior team games. This fixed split was not chosen by examining outcomes.
 if(ids.some(id=>x.teams.find(t=>t.teamId===id).gameLogs.filter(g=>Date.parse(g.date)<cutoff).length<2))continue;
 games++;
 for(const id of ids){
  const roster=x.players.filter(p=>String(p.currentTeamId)===String(id)).map(p=>({...p,availability:{status:'Unknown'},gameLogs:p.gameLogs.filter(g=>Date.parse(g.date)<cutoff)}));
  const old=E.rotation(roster,id),next=E.rotationV2(roster,id);
  const actual=new Map(x.players.flatMap(p=>p.gameLogs).filter(g=>g.eventId===event.home.eventId&&String(g.teamId)===String(id)).map(g=>[g.playerId,g]));
  const comparable=new Set(old.rows.filter(r=>next.rows.some(q=>q.playerId===r.playerId)).map(r=>r.playerId));
  for(const [version,result] of [['original',old],['candidate',next]])for(const row of result.rows){
   if(!comparable.has(row.playerId))continue;const a=actual.get(row.playerId);add(version,'minutes',row.projectedMinutes,a?.minutes||0);
   // Playing-player stat errors; absent players are included in minutes errors above.
   if(!a)continue;
   for(const [field,pred,key] of [['points',row.projectedPoints,'points'],['rebounds',version==='original'?row.reboundsPer36*row.projectedMinutes/36:row.projectedRebounds,'rebounds'],['assists',version==='original'?row.assistsPer36*row.projectedMinutes/36:row.projectedAssists,'assists']]){const other=(version==='original'?next:old).rows.find(r=>r.playerId===row.playerId);if(field==='points'&&(pred===null||other.projectedPoints===null))continue;add(version,field,pred,a[key]);}
  }
 }
}
const result={games,method:'Expanding history; minimum two prior team games; unavailable historical injuries remain Unknown; current roster membership limits historical reconstruction',accuracyPromotionApproved:false,metrics:Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,{n:m.n,mae:m.absoluteError/m.n,bias:m.bias/m.n}]))};
console.log(JSON.stringify(result,null,2));
