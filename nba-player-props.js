"use strict";
(function(){
const MARKETS=[["Points","points"],["Rebounds","rebounds"],["Assists","assists"],["3-pointers made","threes"],["Points + Rebounds + Assists","pra"],["Points + Rebounds","pr"],["Points + Assists","pa"],["Rebounds + Assists","ra"]];
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
 const explain=document.createElement("p");explain.className="small";explain.textContent="Historical 2025–26 player logs. Last-20 consistency requires at least 16 hits in 20 games (80%). Enter a verified line and price; current-season data and odds are not invented.";panel.append(explain);
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
 const games=(Array.isArray(player.gameLogs)?player.gameLogs:[]).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const k=market.value,t=num(line.value),priceData=priceInfo();
 const valid=games.map(g=>({g,v:value(g,k)})).filter(x=>x.v!==null);
 const recent=valid.slice(0,20);
 const hits=xs=>t===null?null:xs.filter(x=>side.value==="OVER"?x.v>t:x.v<t).length;
 const rate=xs=>xs.length&&t!==null?hits(xs)/xs.length:null;
 const complete=recent.length===20;
 const r20=complete?rate(recent):null;
 const rAll=rate(valid);
 const historicalQualified=complete&&t!==null&&hits(recent)>=16;
 const oddsValid=!!priceData;
 const lines=[
 "Data: 2025–26 regular season (historical, not current-season)",
 "Recorded games: "+valid.length,
 "Last 20: "+(!complete?"INSUFFICIENT DATA ("+recent.length+"/20 verified)":r20===null?"enter line":hits(recent)+"/20 ("+percent(r20)+")"),
 "Season hit rate (reference): "+(rAll===null?"enter line":hits(valid)+"/"+valid.length+" ("+percent(rAll)+")"),
 "Sportsbook break-even: "+(oddsValid?percent(priceData.probability):"enter verified price"),
 "Consistency screen (80% · 16/20): "+(!complete?"INSUFFICIENT DATA":t===null?"AWAITING LINE":historicalQualified?"MEETS 80% CONSISTENCY":"BELOW 80% — PASS"),
 "Bet qualification: REVIEW — historical consistency is not a validated betting edge; current form, opponent and price must be verified."
 ];
 result.textContent=lines.join("\n");
 table.replaceChildren();
 const head=document.createElement("tr");table.append(head);
 for(const title of ["Date","Opponent","Points","Rebounds","Assists","3PM",market.options[market.selectedIndex].text,"Result"]){const th=document.createElement("th");th.textContent=title;head.append(th);}
 for(const {g,v} of valid){const tr=document.createElement("tr");table.append(tr);const outcome=t===null?"—":v===t?"PUSH":side.value==="OVER"?(v>t?"HIT":"MISS"):(v<t?"HIT":"MISS");for(const cell of [String(g.date||"").slice(0,10),g.opponent||g.opponentAbbreviation||"—",g.points,g.rebounds,g.assists,g.threes,v,outcome]){const td=document.createElement("td");td.textContent=cell??"—";tr.append(td);}}
 if(!valid.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=8;td.textContent="No verified historical game logs for this market.";tr.append(td);table.append(tr);}
 }
 [market,line,odds,side,source].forEach(x=>x.addEventListener("input",calc));calc();
}
const modal=document.getElementById("modal");if(modal)new MutationObserver(attach).observe(modal,{attributes:true,attributeFilter:["class"]});
document.addEventListener("click",e=>{if(e.target.closest?.("[data-player]"))setTimeout(attach,0)});
})();
