"use strict";
(function(){
 const cache=new Map();
 async function loadEspn(player){
  const id=String(player.playerId||"");
  if(!/^\d+$/.test(id))return [];
  if(!cache.has(id))cache.set(id,(async()=>{
   const url="https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/"+encodeURIComponent(id)+"/gamelog?season=2027&seasontype=2";
   const response=await fetch(url);
   if(!response.ok)throw Error("ESPN HTTP "+response.status);
   if(typeof docEspnRows!=="function")return [];
   return docEspnRows(await response.json());
  })());
  try{return await cache.get(id);}catch(e){cache.delete(id);return [];}
 }
 const keys=[["minutes","Minutes",["minutes","min"]],["usage","Usage %",["usagePercentage","usagePct","usage","usgPct"]],["fieldGoalsAttempted","FG attempts",["fieldGoalsAttempted","fga"]],["fieldGoalsMade","FG made",["fieldGoalsMade","fgm"]],["threePointersAttempted","3PT attempts",["threePointersAttempted","threePointAttempts","3pa"]],["threePointersMade","3PT made",["threePointersMade","threes","3pm"]],["points","Points",["points"]],["rebounds","Rebounds",["rebounds"]],["assists","Assists",["assists"]],["reboundChances","Rebound chances",["reboundChances"]],["potentialAssists","Potential assists",["potentialAssists"]],["fgPct","FG %",["fgPct"]],["effectiveFgPct","Effective FG %",["effectiveFgPct"]],["threePct","3PT %",["threePointPct","threePct"]]];
 const numeric=v=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
 const get=(g,aliases)=>{for(const k of aliases){const n=numeric(g?.[k]);if(n!==null)return n;}return null;};
 const fmt=(v,k)=>v===null?"—":k==="usage"?v.toFixed(1)+"%":v.toFixed(1);
 function draw(){
  const modal=document.getElementById("modal"),root=document.getElementById("modalContent");
  if(!modal?.classList.contains("open")||!root||typeof selectedPlayerId==="undefined"||!selectedPlayerId||typeof playerById==="undefined")return;
  const player=playerById.get(String(selectedPlayerId));if(!player)return;
  let section=root.querySelector("#docRealPlayerVolume");
  if(!section){section=document.createElement("section");section.id="docRealPlayerVolume";section.className="panel";root.prepend(section);}
  const historical=Array.isArray(player.gameLogs)?player.gameLogs:[];
  const espn=typeof docAttemptCache!=="undefined"?docAttemptCache.get(String(selectedPlayerId)):null;
  Promise.resolve(espn).then(rows=>{if(!section.isConnected||String(selectedPlayerId)!==String(player.playerId))return;render(section,player,historical,Array.isArray(rows)?rows:[]);}).catch(()=>render(section,player,historical,[]));
  render(section,player,historical,[]);
  loadEspn(player).then(rows=>{if(section.isConnected&&String(selectedPlayerId)===String(player.playerId))render(section,player,historical,rows);});
 }
 function render(el,player,history,attempts){
  const map=new Map();
  for(const g of history){if(g?.date)map.set(String(g.date).slice(0,10),{...g});}
  for(const g of attempts){const d=String(g.date||"").slice(0,10);if(d)map.set(d,{...(map.get(d)||{}),...g});}
  for(const g of map.values()){const fga=get(g,["fieldGoalsAttempted","fga"]),fgm=get(g,["fieldGoalsMade","fgm"]),tpa=get(g,["threePointersAttempted","threePointAttempts","3pa"]),tpm=get(g,["threePointersMade","threes","3pm"]);if(fga>0){g.fgPct=100*fgm/fga;if(tpa!==null&&tpm!==null)g.effectiveFgPct=100*(fgm+0.5*tpm)/fga;}if(tpa>0&&tpm!==null)g.threePct=100*tpm/tpa;}
  const games=[...map.values()].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  const windows=[games,games.slice(0,5),games.slice(0,10),games.slice(0,20)];
  const summary=(arr,aliases,k)=>{const values=arr.map(g=>get(g,aliases)).filter(v=>v!==null);const mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;return fmt(mean,k)+" <small>("+values.length+"/"+arr.length+")</small>";};
  const rows=keys.map(([key,label,aliases])=>"<tr><td>"+label+"</td>"+windows.map(w=>"<td>"+summary(w,aliases,key)+"</td>").join("")+"</tr>").join("");
  const gameRows=games.slice(0,20).map(g=>"<tr>"+[String(g.date||"").slice(0,10),...keys.map(([key,,aliases])=>fmt(get(g,aliases),key))].map(v=>"<td>"+v+"</td>").join("")+"</tr>").join("");
  el.innerHTML='<h3 class="gold">Player Volume · Minutes, Usage & Actuals</h3><p class="small">Verified historical games only. Season / last 5 / last 10 / last 20. Each cell shows the number of games with that statistic. — means unavailable, not zero. No free throws or estimated values. Shooting efficiency calculated from verified makes and attempts.</p><div class="scroll"><table><thead><tr><th>Metric</th><th>Season</th><th>Last 5</th><th>Last 10</th><th>Last 20</th></tr></thead><tbody>'+rows+'</tbody></table></div><h4>Actual game-by-game results</h4><div class="scroll"><table><thead><tr><th>Date</th>'+keys.map(k=>'<th>'+k[1]+'</th>').join('')+'</tr></thead><tbody>'+gameRows+'</tbody></table></div><p class="small">Source: existing verified player game logs; ESPN historical shooting splits when available. Usage and tracking fields appear only when supplied by verified records. ESPN request targets the 2026–27 regular season. Missing fields are not estimated; no win probability is inferred from this table.</p>';
 }
 const modal=document.getElementById("modal");
 if(modal)new MutationObserver(()=>setTimeout(draw,0)).observe(modal,{attributes:true,attributeFilter:["class"]});
 document.addEventListener("click",e=>{if(e.target.closest?.("[data-player]"))setTimeout(draw,150);});
})();
