"use strict";
(function(){
 const cache=new Map();
 async function loadEspn(player){
  if(typeof NBAView!=="undefined"&&NBAView.mode==="current")return [];
  const id=String(player.playerId||"");
  if(!/^\d+$/.test(id))return [];
  if(!cache.has(id))cache.set(id,(async()=>{
   const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/"+encodeURIComponent(id)+"/gamelog?season=2026&seasontype=2";
   const response=await fetch(url);
   if(!response.ok)throw Error("ESPN HTTP "+response.status);
   if(typeof docEspnRows!=="function")return [];
   return docEspnRows(await response.json());
  })());
  try{return await cache.get(id);}catch(e){cache.delete(id);return [];}
 }
 const keys=[["minutes","Minutes",["minutes","min"]],["usage","Usage % (estimated)",["estimatedUsagePct"]],["shots36","Shots /36",["shotsPer36"]],["assists36","Assists /36",["assistsPer36"]],["rebounds36","Rebounds /36",["reboundsPer36"]],["turnovers36","Turnovers /36",["turnoversPer36"]],["turnovers","Turnovers",["turnovers"]],["fieldGoalsAttempted","FG attempts",["fieldGoalsAttempted","fga"]],["fieldGoalsMade","FG made",["fieldGoalsMade","fgm"]],["threePointersAttempted","3PT attempts",["threePointersAttempted","threePointAttempts","3pa"]],["threePointersMade","3PT made",["threePointersMade","threes","3pm"]],["freeThrowsAttempted","FT attempts /game",["freeThrowsAttempted","fta"]],["freeThrowsMade","FT made /game",["freeThrowsMade","ftm"]],["ftPct","FT %",["freeThrowPct"]],["ftPointShare","FT share of points",["freeThrowPointShare"]],["points","Points",["points"]],["rebounds","Rebounds",["rebounds"]],["assists","Assists",["assists"]],["reboundChances","Rebound chances",["reboundChances"]],["potentialAssists","Potential assists",["potentialAssists"]],["fgPct","FG %",["fgPct"]],["effectiveFgPct","Effective FG %",["effectiveFgPct"]],["threePct","3PT %",["threePointPct","threePct"]]];
 const numeric=v=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
 const get=(g,aliases)=>{for(const k of aliases){const n=numeric(g?.[k]);if(n!==null)return n;}return null;};
 const fmt=(v,k)=>v===null?"—":["usage","ftPct","ftPointShare"].includes(k)?v.toFixed(1)+"%":v.toFixed(1);
 function draw(){
  const modal=document.getElementById("modal"),root=document.getElementById("modalContent");
  if(!modal?.classList.contains("open")||!root||typeof selectedPlayerId==="undefined"||!selectedPlayerId||typeof playerById==="undefined")return;
  const player=playerById.get(String(selectedPlayerId));if(!player)return;
  let section=root.querySelector("#docRealPlayerVolume");
  if(!section){section=document.createElement("section");section.id="docRealPlayerVolume";section.className="panel";root.prepend(section);}
  const historical=Array.isArray(player.gameLogs)?player.gameLogs:[];
  const espn=typeof NBAView!=="undefined"&&NBAView.mode==="current"?null:typeof docAttemptCache!=="undefined"?docAttemptCache.get(String(selectedPlayerId)):null;
  Promise.resolve(espn).then(rows=>{if(!section.isConnected||String(selectedPlayerId)!==String(player.playerId))return;render(section,player,historical,Array.isArray(rows)?rows:[]);}).catch(()=>render(section,player,historical,[]));
  render(section,player,historical,[]);
  loadEspn(player).then(rows=>{if(section.isConnected&&String(selectedPlayerId)===String(player.playerId))render(section,player,historical,rows);});
 }
 function render(el,player,history,attempts){
  const map=new Map();
  const localDate=g=>{const d=new Date(g.date);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(d):'';};
  for(const g of history){if(g?.date)map.set(String(g.eventId||g.date),{...g});}
  for(const g of attempts){
   const candidates=[...map.entries()].filter(([,row])=>localDate(row)===localDate(g));
   const key=g.eventId?String(g.eventId):candidates.length===1?candidates[0][0]:candidates.length===0?String(g.date):null;
   if(key)map.set(key,{...(map.get(key)||{}),...g});
  }
  for(const g of map.values()){
   const ft=NBAImpact.freeThrowsSummary([g]);g.freeThrowPct=ft.percentage;g.freeThrowPointShare=ft.pointShare;
   for(const [key,field] of [['shotsPer36','fieldGoalsAttempted'],['assistsPer36','assists'],['reboundsPer36','rebounds'],['turnoversPer36','turnovers']])g[key]=NBAImpact.per36([g],field);
   const fga=get(g,["fieldGoalsAttempted","fga"]),fgm=get(g,["fieldGoalsMade","fgm"]),tpa=get(g,["threePointersAttempted","threePointAttempts","3pa"]),tpm=get(g,["threePointersMade","threes","3pm"]);if(fga>0&&fgm!==null){g.fgPct=100*fgm/fga;if(tpa!==null&&tpm!==null)g.effectiveFgPct=100*(fgm+0.5*tpm)/fga;}if(tpa>0&&tpm!==null)g.threePct=100*tpm/tpa;}
  const games=[...map.values()].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  const windows=[games,games.slice(0,5),games.slice(0,10)];
  const summary=(arr,aliases,k)=>{
   let values=arr.map(g=>get(g,aliases)).filter(v=>v!==null),mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
   if(k==='ftPct'||k==='ftPointShare'){const x=NBAImpact.freeThrowsSummary(arr);mean=k==='ftPct'?x.percentage:x.pointShare;values=Array(k==='ftPct'?x.percentageGames:x.pointShareGames);}
   if(k==='usage'){const x=NBAImpact.usageSummary(arr);mean=x.percentage;values=Array(x.games);}
   const rates={shots36:'fieldGoalsAttempted',assists36:'assists',rebounds36:'rebounds',turnovers36:'turnovers'};
   if(rates[k]){mean=NBAImpact.per36(arr,rates[k]);values=arr.filter(g=>numeric(g[rates[k]])!==null&&numeric(g.minutes)>0);}
   if(['fgPct','effectiveFgPct','threePct'].includes(k)){
    const paired=arr.filter(g=>k==='threePct'?get(g,['threes','threePointersMade'])!==null&&get(g,['threePointersAttempted'])!==null:get(g,['fieldGoalsMade'])!==null&&get(g,['fieldGoalsAttempted'])!==null&&(k!=='effectiveFgPct'||get(g,['threes','threePointersMade'])!==null));
    const total=aliases=>paired.reduce((sum,g)=>sum+(get(g,aliases)||0),0),den=total(k==='threePct'?['threePointersAttempted']:['fieldGoalsAttempted']);
    mean=den?100*(k==='threePct'?total(['threes','threePointersMade']):total(['fieldGoalsMade'])+(k==='effectiveFgPct'?.5*total(['threes','threePointersMade']):0))/den:null;values=paired;
   }
   return fmt(mean,k)+" <small>("+values.length+"/"+arr.length+")</small>";
  };
  const rows=keys.map(([key,label,aliases])=>"<tr><td>"+label+"</td>"+windows.map(w=>"<td>"+summary(w,aliases,key)+"</td>").join("")+"</tr>").join("");
  const gameRows=games.slice(0,20).map(g=>"<tr>"+[localDate(g),...keys.map(([key,,aliases])=>fmt(get(g,aliases),key))].map(v=>"<td>"+v+"</td>").join("")+"</tr>").join("");
  el.innerHTML='<h3 class="gold">Player Volume · Minutes, Usage & Actuals</h3><p class="small">Verified recorded games only. Season / last 5 / last 10. Each cell shows the number of games with that statistic. — means unavailable, not zero. Usage is a labeled box-score estimate; all other displayed counts come from verified records. Per-36 rates let you compare activity across different minutes. Shooting efficiency uses verified makes and attempts. FT % uses total makes ÷ total attempts; FT share uses free-throw points ÷ total points, with matched-game coverage. The FT attempts/made rows show per-game averages above and actual counts below.</p><div class="scroll"><table><thead><tr><th>Metric</th><th>Season</th><th>Last 5</th><th>Last 10</th></tr></thead><tbody>'+rows+'</tbody></table></div><h4>Actual game-by-game results</h4><div class="scroll"><table><thead><tr><th>Date</th>'+keys.map(k=>'<th>'+k[1]+'</th>').join('')+'</tr></thead><tbody>'+gameRows+'</tbody></table></div><p class="small">Source: existing verified player game logs; ESPN historical shooting splits when available. Estimated usage uses the standard box-score formula with matched player/team inputs, weighted by estimated play exposure across games. It measures possession endings, not touches or assists. Team totals are reconstructed from the verified player box scores. Tracking fields remain unavailable unless supplied. Current mode uses the reconciled snapshot; historical mode requests 2025–26 only. Missing fields are not estimated; no win probability is inferred from this table.</p>';
 }
 document.addEventListener("nba:data-updated",draw);
 const modal=document.getElementById("modal");
 if(modal)new MutationObserver(()=>setTimeout(draw,0)).observe(modal,{attributes:true,attributeFilter:["class"]});
 document.addEventListener("click",e=>{if(e.target.closest?.("[data-player]"))setTimeout(draw,150);});
})();
