/* Shared browser/Node calculation engine. No market prices enter predictions. */
(function(root){
'use strict';
const n=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const mean=a=>{const xs=a.map(n).filter(x=>x!==null);return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;};
const sum=(gs,k)=>gs.reduce((s,g)=>s+(n(g[k])??0),0);
function impact(player){
 const gs=(player.gameLogs||[]).filter(g=>n(g.minutes)>0),minutes=sum(gs,'minutes');
 const paired=gs.filter(g=>n(g.fieldGoalsMade)!==null&&n(g.fieldGoalsAttempted)!==null&&n(g.threes)!==null);
 const fga=sum(paired,'fieldGoalsAttempted'),fgm=sum(paired,'fieldGoalsMade'),tpm=sum(paired,'threes');
 const three=gs.filter(g=>n(g.threePointersAttempted)!==null&&n(g.threes)!==null),tpa=sum(three,'threePointersAttempted');
 const defensive=gs.filter(g=>n(g.steals)!==null&&n(g.blocks)!==null&&n(g.defensiveRebounds)!==null);
 const usage=gs.filter(g=>n(g.usagePercentage)!==null);
 return {games:gs.length,minutes:mean(gs.map(g=>g.minutes)),points:mean(gs.map(g=>g.points)),pointsPerMinute:minutes?sum(gs,'points')/minutes:null,fieldGoalsAttempted:mean(paired.map(g=>g.fieldGoalsAttempted)),fgPct:fga?100*fgm/fga:null,effectiveFgPct:fga?100*(fgm+.5*tpm)/fga:null,threePct:tpa?100*sum(three,'threes')/tpa:null,usagePct:mean(usage.map(g=>g.usagePercentage)),shotAttemptsPer36:paired.length&&sum(paired,'minutes')?36*fga/sum(paired,'minutes'):null,defensiveEventsPer36:defensive.length&&sum(defensive,'minutes')?36*(sum(defensive,'steals')+sum(defensive,'blocks')+sum(defensive,'defensiveRebounds'))/sum(defensive,'minutes'):null,netPointsPer36:gs.some(g=>n(g.plusMinus)!==null)?36*sum(gs.filter(g=>n(g.plusMinus)!==null),'plusMinus')/sum(gs.filter(g=>n(g.plusMinus)!==null),'minutes'):null,availability:player.availability?.status||'Unknown',efficiencyGames:paired.length};
}
function rotation(roster,teamId){
 const events=new Map();for(const p of roster)for(const g of p.gameLogs||[])if(String(g.teamId)===String(teamId))events.set(g.eventId||g.date,g.date);
 const recentIds=new Set([...events].sort((a,b)=>b[1].localeCompare(a[1])).slice(0,5).map(e=>e[0]));
 const rows=roster.map(p=>{const logs=(p.gameLogs||[]).filter(g=>String(g.teamId)===String(teamId)&&n(g.minutes)>0);const x=impact({...p,gameLogs:logs});const recent=logs.filter(g=>recentIds.has(g.eventId||g.date));return {playerId:p.playerId,name:p.name,...x,baseMinutes:events.size?sum(logs,'minutes')/events.size:0,targetMinutes:recentIds.size?sum(recent,'minutes')/recentIds.size:0,status:p.availability?.status||'Unknown'};}).filter(p=>p.games);
 const baseTotal=rows.reduce((s,p)=>s+p.baseMinutes,0),active=rows.filter(p=>!['out','suspension','suspended'].includes(p.status.toLowerCase()));
 const total=active.reduce((s,p)=>s+p.targetMinutes,0);
 if(!baseTotal||!total)return {rows,adjustment:null,complete:false};
 // 240 regulation player-minutes; replacement minutes redistributed over active rotation.
 const baseline=rows.reduce((s,p)=>s+240*p.baseMinutes/baseTotal*p.pointsPerMinute,0);
 let projected=0;
 for(const p of rows){p.projectedMinutes=active.includes(p)?240*p.targetMinutes/total:0;p.projectedPoints=p.projectedMinutes*p.pointsPerMinute;projected+=p.projectedPoints;}
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
function predict(teams,roster,awayId,homeId,model,asOf){
 if(String(awayId)===String(homeId))return null;
 const history=gamesFromTeams(teams).filter(e=>!asOf||e.home.date.slice(0,10)<asOf.slice(0,10));
 const periods={};for(const field of ['q1','firstHalf','fullGame'])periods[field]=estimate(history,awayId,homeId,field);
 const p=periods.fullGame;if(!p)return null;
 const eligibleRoster=roster.map(p=>({...p,gameLogs:(p.gameLogs||[]).filter(g=>!asOf||g.date.slice(0,10)<asOf.slice(0,10)),availability:asOf&&asOf.slice(0,10)<new Date().toISOString().slice(0,10)?{status:'Unknown'}:p.availability}));
 const a=rotation(eligibleRoster.filter(x=>String(x.currentTeamId)===String(awayId)),awayId),h=rotation(eligibleRoster.filter(x=>String(x.currentTeamId)===String(homeId)),homeId);
 const adjusted=a.complete&&h.complete&&a.adjustment!==null&&h.adjustment!==null;
 const away=p.away+(adjusted?a.adjustment:0),home=p.home+(adjusted?h.adjustment:0),margin=home-away;
 const residuals=model?.residuals||[];
 return {away,home,margin,total:away+home,homeProbability:cdf(margin,residuals),awayProbability:residuals.length?1-cdf(margin,residuals):null,baselineHomeProbability:cdf(p.margin,residuals),periods,awayRotation:a,homeRotation:h,adjusted,awayGames:p.awayGames,homeGames:p.homeGames,status:'EXPERIMENTAL',limitations:['Box-score defensive activity is descriptive, not isolated defensive value.','Usage is unavailable unless supplied by source; shot rate is separately labeled.','Availability/minutes adjustments are scenarios and have not been validated historically.']};
}
const api={n,mean,impact,rotation,gamesFromTeams,estimate,fit,cdf,predict};if(typeof module!=='undefined')module.exports=api;root.NBAImpact=api;
})(typeof globalThis!=='undefined'?globalThis:this);
