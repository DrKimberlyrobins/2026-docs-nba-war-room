/* Observed consistency at the selected line; not a future win probability. */
(function(root){
'use strict';
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
function value(g,key){
 const fields={pra:['points','rebounds','assists'],pr:['points','rebounds'],pa:['points','assists'],ra:['rebounds','assists']}[key]||[key];
 const ns=fields.map(k=>number(g[k]));return ns.every(v=>v!==null)?ns.reduce((a,b)=>a+b,0):null;
}
function evaluate(logs,key,line,side='OVER'){
 const distinct=new Map();for(const g of logs||[])if(g&&g.date&&Number.isFinite(Date.parse(g.date))&&!g.didNotPlay)distinct.set(String(g.eventId||g.date),g);
 const games=[...distinct.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 const rows=games.map(g=>({g,v:value(g,key)})).filter(r=>r.v!==null),t=number(line);
 const valid=t!==null&&t>=0&&['OVER','UNDER'].includes(side);
 const summarize=xs=>{const hits=valid?xs.filter(x=>side==='OVER'?x.v>t:x.v<t).length:null;return {games:xs.length,hits,pushes:valid?xs.filter(x=>x.v===t).length:null,rate:hits===null||!xs.length?null:hits/xs.length};};
 const season=summarize(rows),recent5=summarize(rows.slice(0,5)),recent10=summarize(rows.slice(0,10));
 const requiredHits=Math.ceil(7*season.games/10),early=season.games<6;
 const missing=games.length-rows.length;
 let tier='PASS',qualified=false,reason='Below 70%';
 if(!valid){tier='AWAITING LINE';reason='Enter a nonnegative line and OVER or UNDER';}
 else if(missing){tier='DATA GAP';reason=missing+' game(s) lack this statistic';}
 else if(season.games<3){tier='BUILDING SAMPLE';reason='Starts at 3 verified appearances; no 20-game requirement';}
 else if(season.hits>=requiredHits){
  if(recent5.games===5&&recent5.hits<3){tier='WATCH';reason='Season clears 70%, but latest five are below 60%';}
  else {qualified=true;tier=early?'EARLY QUALIFIED':season.rate>=.8?'STRONG':'QUALIFIED';reason=early?'3–5 games: early signal':season.rate>=.8?'80%+ observed consistency':'70%+ observed consistency';}
 }else if(season.rate>=.6){tier='WATCH';reason='60–69.9% observed consistency';}
 return {version:'adaptive-season-v1',season,recent5,recent10,rows,missing,requiredHits,early,qualified,tier,reason,nextGame:{hit:{hits:(season.hits||0)+1,games:season.games+1,rate:((season.hits||0)+1)/(season.games+1)},miss:{hits:season.hits||0,games:season.games+1,rate:(season.hits||0)/(season.games+1)}}};
}
const api={value,evaluate};if(typeof module!=='undefined')module.exports=api;root.NBAConsistency=api;
})(typeof globalThis!=='undefined'?globalThis:this);
