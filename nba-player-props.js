"use strict";
(function(){
const MARKETS=[["Points","points"],["Rebounds","rebounds"],["Assists","assists"],["Blocks","blocks"],["Steals","steals"],["3-pointers made","threes"],["Points + Rebounds + Assists","pra"],["Points + Rebounds","pr"],["Points + Assists","pa"],["Rebounds + Assists","ra"]];
const num=v=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
const percent=v=>(100*v).toFixed(1)+"%";
const be=odds=>odds<0?-odds/(-odds+100):100/(odds+100);
const value=(g,k)=>{const p=num(g.points),r=num(g.rebounds),a=num(g.assists);if(k==="pra")return [p,r,a].every(x=>x!==null)?p+r+a:null;if(k==="pr")return p!==null&&r!==null?p+r:null;if(k==="pa")return p!==null&&a!==null?p+a:null;if(k==="ra")return r!==null&&a!==null?r+a:null;return num(g[k]);};
function attach(){
 const modal=document.getElementById("modal"),body=document.getElementById("modalContent");
 if(!modal||!body||!modal.classList.contains("open")||!selectedPlayerId)return;
 const player=playerById.get(String(selectedPlayerId));if(!player)return;
 if(body.querySelector("#nbaPropPanel"))return;
 const panel=document.createElement("section");panel.id="nbaPropPanel";panel.className="panel";panel.style.marginTop="20px";
 const h=document.createElement("h3");h.textContent="NBA Player Props — Verified Game Logs";panel.append(h);
 const explain=document.createElement("p");explain.className="small";explain.textContent="Adaptive consistency: all verified games this season, updated with each refreshed game log. Starts at 3 appearances. 70% qualifies; 80% is strong from 6 games. Three to five games are labeled EARLY. No 20-game endpoint. Latest-five form below 60% moves a season qualifier to WATCH.";panel.append(explain);
 const grid=document.createElement("div");grid.className="grid";panel.append(grid);
 function field(label,tag){const wrap=document.createElement("label");wrap.textContent=label;wrap.style.display="block";const el=document.createElement(tag);el.style.marginTop="6px";wrap.append(el);grid.append(wrap);return el;}
 const market=field("Player prop","select");for(const [label,key] of MARKETS){const o=new Option(label,key);market.add(o);}
 const line=field("Current sportsbook line","input");line.type="number";line.step="0.5";line.placeholder="Verified line";
 const priceType=field("Price format","select");priceType.add(new Option("American odds","american"));priceType.add(new Option("Kalshi cents","kalshi"));const odds=field("Current price","input");odds.type="number";odds.placeholder="e.g. -110";odds.step="any";const conversion=document.createElement("p");conversion.className="small";grid.append(conversion);function americanFromCents(c){const p=c/100;return p>=.5?-Math.round(100*p/(1-p)):Math.round(100*(1-p)/p);}function priceInfo(){const raw=num(odds.value);if(priceType.value==="kalshi"){odds.placeholder="e.g. 52";odds.min="1";odds.max="99";if(raw===null||raw<=0||raw>=100){conversion.textContent="Enter the price of the contract you are buying, from 1 to 99 cents.";return null;}const american=americanFromCents(raw);conversion.textContent=raw+"¢ = "+raw+"% price-implied probability ≈ "+(american>0?"+":"")+american+" American odds (before Kalshi fees).";return {american,probability:raw/100};}odds.placeholder="e.g. -110";odds.removeAttribute("min");odds.removeAttribute("max");conversion.textContent="American sportsbook odds; enter e.g. -110 or +125.";return raw!==null&&Number.isInteger(raw)&&Math.abs(raw)>=100?{american:raw,probability:be(raw)}:null;}panel.dataset.priceFormat="american";priceType.addEventListener("change",()=>{odds.value="";panel.dataset.priceFormat=priceType.value;calc();});panel.getPriceInfo=priceInfo;panel.getPriceType=()=>priceType.value;
 const side=field("Side","select");side.add(new Option("OVER","OVER"));side.add(new Option("UNDER","UNDER"));
 const source=field("Sportsbook / source","select");source.add(new Option("Select source",""));source.add(new Option("Kambi","Kambi"));source.add(new Option("Kalshi","Kalshi"));
 const result=document.createElement("div");result.className="notice";result.style.whiteSpace="pre-line";result.style.marginTop="15px";panel.append(result);
 const scroll=document.createElement("div");scroll.className="scroll";panel.append(scroll);
 const table=document.createElement("table");scroll.append(table);
 body.append(panel);
 function calc(){
 const k=market.value,t=num(line.value),priceData=priceInfo();
 const screen=NBAConsistency.evaluate(player.gameLogs,k,t,side.value);
 const valid=screen.rows;
 const format=x=>x.rate===null?'enter line':x.hits+'/'+x.games+' ('+percent(x.rate)+')'+(x.pushes?' · '+x.pushes+' push(es)':'');
 panel.consistency=screen;
 const oddsValid=!!priceData;
 const lines=[
 'Data: '+status.season+' regular season · '+status.generatedAt,
 'Season consistency: '+format(screen.season),
 'Recent '+screen.recent5.games+' (up to 5): '+format(screen.recent5),
 'Recent '+screen.recent10.games+' (up to 10): '+format(screen.recent10),
 'Consistency screen: '+screen.tier+' — '+screen.reason,
 'Required now: '+screen.requiredHits+' hits in '+screen.season.games+' games for 70%. Sample grows every game.',
 'If next game hits: '+screen.nextGame.hit.hits+'/'+screen.nextGame.hit.games+' ('+percent(screen.nextGame.hit.rate)+'); if it misses: '+screen.nextGame.miss.hits+'/'+screen.nextGame.miss.games+' ('+percent(screen.nextGame.miss.rate)+')',
 'Pushes remain in the played-game denominator and do not count as hits. Missing statistics are flagged, not filled with zero.',
 'Sportsbook break-even: '+(oddsValid?percent(priceData.probability):'enter verified price'),
 'Consistency is an observed record at this line, separate from model win probability. Price and availability remain separate checks.'
 ];
 result.textContent=lines.join("\n");
 table.replaceChildren();
 const head=document.createElement("tr");table.append(head);
 for(const title of ["Date","Opponent","Points","Rebounds","Assists","3PM",market.options[market.selectedIndex].text,"Result"]){const th=document.createElement("th");th.textContent=title;head.append(th);}
 for(const {g,v} of valid){const tr=document.createElement("tr");table.append(tr);const outcome=t===null?"—":v===t?"PUSH":side.value==="OVER"?(v>t?"HIT":"MISS"):(v<t?"HIT":"MISS");for(const cell of [String(g.date||"").slice(0,10),g.opponent||g.opponentAbbreviation||"—",g.points,g.rebounds,g.assists,g.threes,v,outcome]){const td=document.createElement("td");td.textContent=cell??"—";tr.append(td);}}
 if(!valid.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=8;td.textContent="No verified historical game logs for this market.";tr.append(td);table.append(tr);}
 }
 [market,line,odds,side,source].forEach(x=>x.addEventListener("input",calc));panel.recalculateConsistency=calc;calc();
}
document.addEventListener("nba:data-updated",attach);
const modal=document.getElementById("modal");if(modal)new MutationObserver(attach).observe(modal,{attributes:true,attributeFilter:["class"]});
document.addEventListener("click",e=>{if(e.target.closest?.("[data-player]"))setTimeout(attach,0)});
})();
