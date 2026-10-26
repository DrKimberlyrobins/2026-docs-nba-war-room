'use strict';
const NBAView={model:null,current:null,mode:'current',error:null};
async function nbaPrepare(){
 const read=async path=>{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(path+': HTTP '+r.status);return r.json();};
 const results=await Promise.allSettled([read('./data/nba-current.json'),read('./data/nba-probability-model.json')]);
 if(results[0].status==='fulfilled')NBAView.current=results[0].value;else NBAView.error=String(results[0].reason);
 if(results[1].status==='fulfilled')NBAView.model=results[1].value;
}
function nbaSourceControls(){
 let host=document.getElementById('nbaSourceControls');
 if(!host){host=document.createElement('section');host.className='panel';host.id='nbaSourceControls';document.getElementById('teams').prepend(host);}
 host.innerHTML='<h3>Data season</h3><label>View <select id="nbaDataSeason"><option value="current">Current regular season · verified box scores</option><option value="historical">2025–26 historical research</option></select></label><p class="small" id="nbaSourceDescription"></p>';
 host.querySelector('select').value=NBAView.mode;
 host.querySelector('select').onchange=e=>{NBAView.mode=e.target.value;loadEngine();};
 document.getElementById('nbaSourceDescription').textContent='Active season: '+status.season+' · Refreshed '+status.generatedAt+' · '+status.gamesProcessed+' reconciled games. ESPN source checks confirm internal box-score totals; model validation is reported separately.'+(NBAView.error?' Current snapshot error: '+NBAView.error:'');
}
function nbaRenderProbability(away,home){
 const host=document.getElementById('teamResults');
 host.querySelector('#nbaImpactProjection')?.remove();
 const box=document.createElement('section');box.id='nbaImpactProjection';box.className='panel';host.prepend(box);
 if(NBAView.mode!=='current'||!NBAView.current){box.innerHTML='<h3>Team Probability Engine</h3><p>Select the current season to connect current rosters and availability. Historical tables remain available below.</p>';return;}
 const selected=window.nbaSelectedGame;
 const asOf=selected&&String(selected.awayId)===String(away.teamId)&&String(selected.homeId)===String(home.teamId)?selected.date:new Date().toISOString();
 const fresh=Date.now()-Date.parse(status.generatedAt)<=36*3600000;
 const roster=fresh?players:players.map(p=>({...p,availability:{status:'Unknown'}}));
 const p=NBAImpact.predict(teams,roster,away.teamId,home.teamId,NBAView.model,asOf);
 if(!p){box.innerHTML='<h3>Team Probability Engine</h3><p>Insufficient completed current-season games for both teams before this matchup. No probability is substituted.</p>';return;}
 const fmt=v=>v===null||!Number.isFinite(v)?'—':v.toFixed(1),pct=v=>v===null?'—':(100*v).toFixed(1)+'%';
 const stale=Date.now()-Date.parse(status.generatedAt)>36*3600000;
 const v=NBAView.model?.validation;
 const table=(team,rotation,opponent)=>'<h4>'+safe(team.team)+'</h4><div class="scroll"><table><thead><tr><th>Player</th><th>Availability</th><th>Games</th><th>Min/game</th><th>Scenario minutes</th><th>Scenario points</th><th>FG%</th><th>eFG%</th><th>Shots/36</th><th>Def. activity/36</th><th>On-court net/36</th></tr></thead><tbody>'+rotation.rows.sort((a,b)=>(b.projectedPoints||0)-(a.projectedPoints||0)).map(r=>'<tr><td><button data-player="'+safe(r.playerId)+'">'+safe(r.name)+'</button></td><td>'+safe(r.status)+'</td><td>'+r.games+'</td><td>'+fmt(r.minutes)+'</td><td>'+fmt(r.projectedMinutes)+'</td><td>'+fmt(r.projectedPoints)+'</td><td>'+fmt(r.fgPct)+'</td><td>'+fmt(r.effectiveFgPct)+'</td><td>'+fmt(r.shotAttemptsPer36)+'</td><td>'+fmt(r.defensiveEventsPer36)+'</td><td>'+fmt(r.netPointsPer36)+'</td></tr>').join('')+'</tbody></table></div>';
 box.innerHTML='<h2>Player Impact → Team Probability</h2><p class="small">'+safe(status.season)+' · ESPN box scores + roster + injury report · '+safe(status.generatedAt)+'</p>'+(stale?'<div class="notice">STALE SNAPSHOT — refresh is more than 36 hours old. Availability scenarios require a new report.</div>':'')+'<div class="grid">'+statCard(away.team+' win',pct(p.awayProbability),'Experimental model estimate')+statCard(home.team+' win',pct(p.homeProbability),'Experimental model estimate')+statCard('Projected score',fmt(p.away)+' – '+fmt(p.home),'Away – Home · includes overtime in full-game data')+statCard('Projected total',fmt(p.total),'No market price used')+'</div><p>Baseline home probability: '+pct(p.baselineHomeProbability)+'. Player scenario changes scoring by '+fmt(p.awayRotation.adjustment)+' away / '+fmt(p.homeRotation.adjustment)+' home points. '+(p.adjusted?'Scenario connected.':'Player scenario unavailable; baseline only.')+' Samples: '+p.awayGames+' away-team and '+p.homeGames+' home-team games.</p><details><summary>Calculation and validation</summary><p>Team offense and opponent points allowed are shrunk toward league scoring with ten prior games. Home advantage comes from historical home scoring margins. Last-five minutes and points per minute allocate 240 regulation player-minutes; players reported Out are excluded and remaining minutes redistributed. This scoring difference adjusts the baseline. Questionable / day-to-day players remain in the scenario: '+safe([...p.awayRotation.uncertain,...p.homeRotation.uncertain].join(', ')||'none listed')+'. Injuries are reports, not confirmed lineups.</p><p>Win probability is the empirical margin-residual distribution learned from 2025–26 games. '+(v?'Held-out: '+v.games+' games; Brier '+v.brier.toFixed(4)+' (coin-flip .2500); margin MAE '+v.marginMAE.toFixed(2)+' points. '+safe(v.method):'Validation file unavailable.')+'. Historical source remains provisional. Probability calibration, sportsbook comparison and player adjustments have not passed independent validation.</p><p>Defensive activity = (steals + blocks + defensive rebounds) per 36 minutes. On-court net uses plus/minus and includes teammates and opponents. These are descriptive measures; individual causal defense and usage percentage are unavailable. Team points allowed feeds the defensive matchup calculation.</p></details><h3>Period scoring baseline</h3><div class="grid">'+['q1','firstHalf','fullGame'].map(k=>statCard({q1:'1Q',firstHalf:'1H',fullGame:'Full game'}[k],p.periods[k]?fmt(p.periods[k].away)+' – '+fmt(p.periods[k].home):'—','Away – Home; player scenario applies to full game only')).join('')+'</div>'+table(away,p.awayRotation,home)+table(home,p.homeRotation,away)+'<p class="small">Scenario points are scoring allocations, not independently validated player prop projections. FT fields are omitted. Market qualification remains PASS until current prices and validated model edges are connected.</p>';
 box.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>openPlayer(b.dataset.player));
}
function nbaPlayerImpact(player){
 if(!window.NBAImpact)return;
 const root=document.getElementById('modalContent'),x=NBAImpact.impact(player),fmt=v=>v===null?'—':v.toFixed(1);
 const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h3>Player Impact Evidence</h3><div class="grid">'+statCard('Availability',safe(x.availability),safe(player.availability?.reportedAt||'Not listed is not lineup confirmation'))+statCard('Scoring per minute',x.pointsPerMinute===null?'—':x.pointsPerMinute.toFixed(3),x.games+' games with minutes')+statCard('eFG%',fmt(x.effectiveFgPct),x.efficiencyGames+' paired shooting games; ratio of totals')+statCard('Usage %',fmt(x.usagePct),'Unavailable unless reported by source')+statCard('Defensive activity /36',fmt(x.defensiveEventsPer36),'Steals + blocks + defensive rebounds')+statCard('On-court net /36',fmt(x.netPointsPer36),'Plus/minus; includes lineup effects')+'</div><p class="small">Current roster and minutes feed the matchup scenario above. Defensive activity and net are descriptive, not isolated individual defensive value.</p>';root.prepend(panel);
}

// Check the committed snapshot while the page is open; preserve matchup and prop inputs.
NBAView.refreshCurrent=async function(){
 if(NBAView.mode!=='current'||!NBAView.prepared||NBAView.refreshing)return;
 NBAView.refreshing=true;
 try{
  const response=await fetch('./data/nba-current.json',{cache:'no-store'});if(!response.ok)return;
  const snapshot=await response.json();
  if(snapshot.generatedAt===NBAView.current?.generatedAt||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.teams))return;
  const away=document.getElementById('awayTeam').value,home=document.getElementById('homeTeam').value;
  const playerId=document.getElementById('modal')?.classList.contains('open')?selectedPlayerId:null;
  const inputs=[...document.querySelectorAll('#nbaPropPanel input,#nbaPropPanel select')].map(el=>el.value);
  NBAView.current=snapshot;await loadEngine();
  document.getElementById('awayTeam').value=away;document.getElementById('homeTeam').value=home;analyzeTeams();
  if(playerId&&playerById.has(String(playerId))){
   openPlayer(playerId);document.dispatchEvent(new CustomEvent('nba:data-updated'));
   setTimeout(()=>{
    const controls=document.querySelectorAll('#nbaPropPanel input,#nbaPropPanel select');
    controls.forEach((el,i)=>{if(inputs[i]!==undefined)el.value=inputs[i];});
    const panel=document.getElementById('nbaPropPanel');
    if(controls[2])panel.dataset.priceFormat=controls[2].value;
    panel?.recalculateConsistency?.();
   },0);
  }
 }catch(error){console.warn('Current snapshot refresh deferred: '+error.message);}
 finally{NBAView.refreshing=false;}
};
setInterval(()=>{if(document.visibilityState!=='hidden')NBAView.refreshCurrent();},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')NBAView.refreshCurrent();});
