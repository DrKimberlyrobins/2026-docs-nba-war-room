/* Shared browser/Node calculation engine. No market prices enter predictions. */
(function(root){
'use strict';
const n=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const mean=a=>{const xs=a.map(n).filter(x=>x!==null);return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;};
const sum=(gs,k)=>gs.reduce((s,g)=>s+(n(g[k])??0),0);
// Standard box-score USG estimate. Team totals are reconstructed from matched player logs.
function usageGame(g,context=g?.usageContext){
 const fields=['minutes','fieldGoalsAttempted','freeThrowsAttempted','turnovers'];
 if(!context||fields.some(k=>n(g[k])===null||n(g[k])<0)||!(g.minutes>0))return null;
 if(['minutes','fieldGoalsAttempted','freeThrowsAttempted','turnovers'].some(k=>n(context[k])===null||n(context[k])<0)||!(context.minutes>0))return null;
 const used=g.fieldGoalsAttempted+.44*g.freeThrowsAttempted+g.turnovers;
 const exposure=g.minutes*(context.fieldGoalsAttempted+.44*context.freeThrowsAttempted+context.turnovers)/(context.minutes/5);
 return exposure>0?{used,exposure,percentage:100*used/exposure}:null;
}
function usageSummary(logs){
 const matched=(logs||[]).map(g=>usageGame(g)).filter(Boolean);
 const used=matched.reduce((a,x)=>a+x.used,0),exposure=matched.reduce((a,x)=>a+x.exposure,0);
 return {percentage:exposure?100*used/exposure:null,games:matched.length,used,exposure};
}
function connectUsage(players){
 const groups=new Map();
 for(const p of players)for(const g of p.gameLogs||[]){
  delete g.usageContext;delete g.estimatedUsagePct;
  if(!g.eventId||!g.teamId)continue;
  const key=String(g.eventId)+':'+String(g.teamId),group=groups.get(key)||[];group.push(g);groups.set(key,group);
 }
 for(const rows of groups.values()){
  const fields=['minutes','fieldGoalsAttempted','freeThrowsAttempted','turnovers'];
  if(rows.some(g=>fields.some(k=>n(g[k])===null||n(g[k])<0))||new Set(rows.map(g=>g.playerId)).size!==rows.length)continue;
  const context=Object.fromEntries(fields.map(k=>[k,sum(rows,k)]));
  if(rows.length<5||context.minutes<230)continue;
  for(const g of rows){const x=usageGame(g,context);if(x){g.usageContext=context;g.estimatedUsagePct=x.percentage;}}
 }
 return players;
}
function per36(gs,key){const valid=gs.filter(g=>n(g[key])!==null&&n(g.minutes)>0);return valid.length?36*sum(valid,key)/sum(valid,'minutes'):null;}
function freeThrowsSummary(logs){
 const gs=logs||[],valid=v=>n(v)!==null&&n(v)>=0;
 const attempted=gs.filter(g=>valid(g.freeThrowsAttempted));
 const made=gs.filter(g=>valid(g.freeThrowsMade));
 const paired=gs.filter(g=>valid(g.freeThrowsAttempted)&&valid(g.freeThrowsMade)&&g.freeThrowsMade<=g.freeThrowsAttempted);
 const scoring=paired.filter(g=>valid(g.points)&&g.freeThrowsMade<=g.points);
 const attempts=sum(paired,'freeThrowsAttempted'),points=sum(scoring,'points');
 return {attempts:mean(attempted.map(g=>g.freeThrowsAttempted)),made:mean(made.map(g=>g.freeThrowsMade)),percentage:attempts?100*sum(paired,'freeThrowsMade')/attempts:null,pointShare:points?100*sum(scoring,'freeThrowsMade')/points:null,attemptedGames:attempted.length,madeGames:made.length,percentageGames:paired.length,pointShareGames:scoring.length};
}
function impact(player){
 const gs=(player.gameLogs||[]).filter(g=>n(g.minutes)>0),minutes=sum(gs,'minutes');
 const paired=gs.filter(g=>n(g.fieldGoalsMade)!==null&&n(g.fieldGoalsAttempted)!==null&&n(g.threes)!==null);
 const fga=sum(paired,'fieldGoalsAttempted'),fgm=sum(paired,'fieldGoalsMade'),tpm=sum(paired,'threes');
 const three=gs.filter(g=>n(g.threePointersAttempted)!==null&&n(g.threes)!==null),tpa=sum(three,'threePointersAttempted');
 const defensive=gs.filter(g=>n(g.steals)!==null&&n(g.blocks)!==null&&n(g.defensiveRebounds)!==null);
 const usage=gs.filter(g=>n(g.usagePercentage)!==null),estimated=usageSummary(gs),ft=freeThrowsSummary(player.gameLogs);
 return {freeThrowsAttempted:ft.attempts,freeThrowsMade:ft.made,freeThrowPct:ft.percentage,freeThrowPointShare:ft.pointShare,freeThrowGames:ft.attemptedGames,games:gs.length,minutes:mean(gs.map(g=>g.minutes)),points:mean(gs.map(g=>g.points)),pointsPerMinute:minutes?sum(gs,'points')/minutes:null,fieldGoalsAttempted:mean(paired.map(g=>g.fieldGoalsAttempted)),fgPct:fga?100*fgm/fga:null,effectiveFgPct:fga?100*(fgm+.5*tpm)/fga:null,threePct:tpa?100*sum(three,'threes')/tpa:null,usagePct:mean(usage.map(g=>g.usagePercentage)),estimatedUsagePct:estimated.percentage,usageGames:estimated.games,assistsPer36:per36(gs,'assists'),reboundsPer36:per36(gs,'rebounds'),turnoversPer36:per36(gs,'turnovers'),shotAttemptsPer36:paired.length&&sum(paired,'minutes')?36*fga/sum(paired,'minutes'):null,defensiveEventsPer36:defensive.length&&sum(defensive,'minutes')?36*(sum(defensive,'steals')+sum(defensive,'blocks')+sum(defensive,'defensiveRebounds'))/sum(defensive,'minutes'):null,netPointsPer36:gs.some(g=>n(g.plusMinus)!==null)?36*sum(gs.filter(g=>n(g.plusMinus)!==null),'plusMinus')/sum(gs.filter(g=>n(g.plusMinus)!==null),'minutes'):null,availability:player.availability?.status||'Unknown',efficiencyGames:paired.length};
}
function rotation(roster,teamId){
 const events=new Map();for(const p of roster)for(const g of p.gameLogs||[])if(String(g.teamId)===String(teamId))events.set(g.eventId||g.date,g.date);
 const recentIds=new Set([...events].sort((a,b)=>b[1].localeCompare(a[1])).slice(0,5).map(e=>e[0]));
 const rows=roster.map(p=>{const logs=(p.gameLogs||[]).filter(g=>String(g.teamId)===String(teamId)&&n(g.minutes)>0);const x=impact({...p,gameLogs:logs});const recent=logs.filter(g=>recentIds.has(g.eventId||g.date));return {playerId:p.playerId,name:p.name,...x,baseMinutes:events.size?sum(logs,'minutes')/events.size:0,targetMinutes:recentIds.size?sum(recent,'minutes')/recentIds.size:0,appearanceMinutes:recent.length?mean(recent.map(g=>g.minutes)):null,minutesEvidence:recent.length,status:p.availability?.status||'Unknown'};}).filter(p=>p.games);
 const baseTotal=rows.reduce((s,p)=>s+p.baseMinutes,0),active=rows.filter(p=>!['out','suspension','suspended'].includes(p.status.toLowerCase()));
 const total=active.reduce((s,p)=>s+p.targetMinutes,0);
 if(!baseTotal||!total)return {rows,adjustment:null,complete:false};
 // 240 regulation player-minutes; replacement minutes redistributed over active rotation.
 const baseline=rows.reduce((s,p)=>s+240*p.baseMinutes/baseTotal*p.pointsPerMinute,0);
 let projected=0;
 for(const p of rows){p.projectedMinutes=active.includes(p)?240*p.targetMinutes/total:0;p.projectedPoints=p.projectedMinutes*p.pointsPerMinute;projected+=p.projectedPoints;
 // Candidate minutes are conditional on appearing. Keep separate from the unvalidated team model.
 p.conditionalMinutes=p.appearanceMinutes;
 for(const [field,key] of [['projectedAttempts','fieldGoalsAttempted'],['projectedThreeAttempts','threePointersAttempted'],['projectedThrees','threes'],['projectedRebounds','rebounds'],['projectedAssists','assists']]){const rate=per36((roster.find(x=>x.playerId===p.playerId)?.gameLogs||[]).filter(g=>String(g.teamId)===String(teamId)),key);p[field]=rate===null?null:rate*p.projectedMinutes/36;}
 }
 return {rows,adjustment:projected-baseline,baselinePoints:baseline,projectedPoints:projected,complete:rows.every(p=>p.status!=='Unknown'),uncertain:rows.filter(p=>/questionable|doubtful|day.to.day/i.test(p.status)).map(p=>p.name)};
}
function gamesFromTeams(teams){
 const map=new Map();for(const t of teams)for(const g of t.gameLogs||[]){if(n(g.fullGame)===null)continue;const e=map.get(String(g.eventId))||{};e[g.homeAway]=g;map.set(String(g.eventId),e);}
 return [...map.values()].filter(e=>e.home&&e.away&&String(e.home.opponentId)===String(e.away.teamId)&&String(e.away.opponentId)===String(e.home.teamId)).sort((a,b)=>a.home.date.localeCompare(b.home.date));
}
function estimate(history,awayId,homeId,field='fullGame'){
 const observations=history.flatMap(e=>[{...e.home,allowed:e.away[field]},{...e.away,allowed:e.home[field]}]).filter(g=>n(g[field])!==null&&n(g.allowed)!==null);
 const league=mean(observations.map(g=>g[field]));if(league===null)return null;
 const allHome=history.filter(e=>n(e.home[field])!==null&&n(e.away[field])!==null),homeEdge=mean(allHome.map(e=>e.home[field]-e.away[field]))||0;
 const profile=id=>{const rows=observations.filter(g=>String(g.teamId)===String(id));return {n:rows.length,scored:mean(rows.map(g=>g[field])),allowed:mean(rows.map(g=>g.allowed))};};
 const a=profile(awayId),h=profile(homeId);if(!a.n||!h.n)return null;
 // Shrink each team's offense and defense toward league mean with 10 prior games.
 const shrink=(v,count)=>(v*count+league*10)/(count+10);
 const away=shrink(a.scored,a.n)+shrink(h.allowed,h.n)-league-homeEdge/2;
 const home=shrink(h.scored,h.n)+shrink(a.allowed,a.n)-league+homeEdge/2;
 return {away,home,margin:home-away,total:home+away,awayGames:a.n,homeGames:h.n};
}
function fit(teams){
 const games=gamesFromTeams(teams),residuals=[],checks=[],cut=Math.floor(games.length*.7);
 for(let i=0;i<games.length;i++){
  const e=games[i],prior=games.slice(0,i).filter(g=>g.home.date.slice(0,10)<e.home.date.slice(0,10));
  const p=estimate(prior,e.away.teamId,e.home.teamId);if(!p||Math.min(p.awayGames,p.homeGames)<10)continue;
  const actual=e.home.fullGame-e.away.fullGame;
  if(i<cut)residuals.push(actual-p.margin);
  else if(residuals.length>=100){const probability=cdf(p.margin,residuals);checks.push({eventId:e.home.eventId,date:e.home.date,probability,win:actual>0?1:0,error:actual-p.margin});}
 }
 return {version:'scoring-residual-v1',residuals,validation:{method:'Chronological 70% residual fit / 30% held-out games; same-date results excluded from inputs',games:checks.length,brier:mean(checks.map(x=>(x.probability-x.win)**2)),accuracy:mean(checks.map(x=>(x.probability>=.5)===(x.win===1)?1:0)),marginMAE:mean(checks.map(x=>Math.abs(x.error))),coinFlipBrier:.25,calibrated:false,playerAdjustmentValidated:false},checks};
}
function cdf(margin,residuals){if(!residuals.length)return null;return (residuals.filter(r=>r> -margin).length+.5*residuals.filter(r=>r===-margin).length+1)/(residuals.length+2);}
function predict(teams,roster,awayId,homeId,model,asOf,officialReport=null){
 if(String(awayId)===String(homeId))return null;
 const history=gamesFromTeams(teams).filter(e=>!asOf||Date.parse(e.home.date)<Date.parse(asOf));
 const periods={};for(const field of ['q1','firstHalf','fullGame'])periods[field]=estimate(history,awayId,homeId,field);
 const p=periods.fullGame;if(!p)return null;
 const eligibleRoster=roster.map(p=>({...p,gameLogs:(p.gameLogs||[]).filter(g=>!asOf||Date.parse(g.date)<Date.parse(asOf)),availability:asOf&&((p.availability?.checkedAt&&Date.parse(p.availability.checkedAt)>Date.parse(asOf))||asOf.slice(0,10)<new Date().toISOString().slice(0,10))?{status:'Unknown'}:p.availability}));
 const report=officialReport;
 if(report && asOf && Date.parse(report.reportedAt)<=Date.parse(asOf)){
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(asOf));
  const normalize=v=>String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const player of eligibleRoster){const team=teams.find(t=>String(t.teamId)===String(player.currentTeamId));const submission=report.teams?.find(r=>r.gameDate===date&&r.team===team?.team);if(submission?.status==='not submitted')player.availability={status:'Unknown',source:report.source,reportedAt:report.reportedAt};const entries=report.entries.filter(r=>r.gameDate===date&&r.team===team?.team&&normalize(r.name)===normalize(player.name));if(entries.length===1)player.availability={status:entries[0].status,reportedAt:report.reportedAt,source:report.source};}
 }
 const a=rotation(eligibleRoster.filter(x=>String(x.currentTeamId)===String(awayId)),awayId),h=rotation(eligibleRoster.filter(x=>String(x.currentTeamId)===String(homeId)),homeId);
 const adjusted=false; // Player adjustments require held-out validation before activation.
 const away=p.away+(adjusted?a.adjustment:0),home=p.home+(adjusted?h.adjustment:0),margin=home-away;
 const residuals=model?.residuals||[];
 return {away,home,margin,total:away+home,homeProbability:cdf(margin,residuals),awayProbability:residuals.length?1-cdf(margin,residuals):null,baselineHomeProbability:cdf(p.margin,residuals),periods,awayRotation:a,homeRotation:h,adjusted,awayGames:p.awayGames,homeGames:p.homeGames,status:'EXPERIMENTAL',limitations:['Box-score defensive activity is descriptive, not isolated defensive value.','Usage is a reconstructed box-score estimate, not tracking-based touches or an official feed value.','Availability/minutes adjustments are scenarios and have not been validated historically.']};
}
const api={n,mean,freeThrowsSummary,usageGame,usageSummary,connectUsage,per36,impact,rotation,gamesFromTeams,estimate,fit,cdf,predict};if(typeof module!=='undefined')module.exports=api;root.NBAImpact=api;
})(typeof globalThis!=='undefined'?globalThis:this);
