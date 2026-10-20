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
 const explain=document.createElement("p");explain.className="small";explain.textContent="Historical 2025–26 regular-season player results. Enter a real current sportsbook line and price; no sportsbook odds or 2026–27 stats are invented.";panel.append(explain);
 const grid=document.createElement("div");grid.className="grid";panel.append(grid);
 function field(label,tag){const wrap=document.createElement("label");wrap.textContent=label;wrap.style.display="block";const el=document.createElement(tag);el.style.marginTop="6px";wrap.append(el);grid.append(wrap);return el;}
 const market=field("Player prop","select");for(const [label,key] of MARKETS){const o=new Option(label,key);market.add(o);}
 const line=field("Current sportsbook line","input");line.type="number";line.step="0.5";line.placeholder="Verified line";
 const odds=field("Current American odds","input");odds.type="number";odds.placeholder="e.g. -110";
 const side=field("Side","select");side.add(new Option("OVER","OVER"));side.add(new Option("UNDER","UNDER"));
 const source=field("Sportsbook / source","input");source.placeholder="Enter verified sportsbook";
 const result=document.createElement("div");result.className="notice";result.style.whiteSpace="pre-line";result.style.marginTop="15px";panel.append(result);
 const scroll=document.createElement("div");scroll.className="scroll";panel.append(scroll);
 const table=document.createElement("table");scroll.append(table);
 body.append(panel);
 function calc(){
 const games=(Array.isArray(player.gameLogs)?player.gameLogs:[]).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const k=market.value,t=num(line.value),price=num(odds.value);
 const valid=games.map(g=>({g,v:value(g,k)})).filter(x=>x.v!==null);
 const recent=valid.slice(0,10);
 const hits=xs=>t===null?null:xs.filter(x=>side.value==="OVER"?x.v>t:x.v<t).length;
 const rate=xs=>xs.length&&t!==null?hits(xs)/xs.length:null;
 const r5=rate(valid.slice(0,5)),r10=rate(recent),rAll=rate(valid);
 const historicalQualified=valid.length>=3&&t!==null&&rAll>=.65;
 const oddsValid=price!==null&&Number.isInteger(price)&&Math.abs(price)>=100;
 const lines=["Data: 2025–26 regular season (historical, not current-season)","Recorded games: "+valid.length,"Last 5: "+(r5===null?"enter line":hits(valid.slice(0,5))+"/"+Math.min(5,valid.length)+" ("+percent(r5)+")"),"Last 10: "+(r10===null?"enter line":hits(recent)+"/"+recent.length+" ("+percent(r10)+")"),"Season hit rate: "+(rAll===null?"enter line":hits(valid)+"/"+valid.length+" ("+percent(rAll)+")"),"Sportsbook break-even: "+(oddsValid?percent(be(price)):"enter verified odds"),"Trend screen (65% minimum): "+(t===null?"AWAITING LINE":historicalQualified?"MEETS HISTORICAL TREND":"BELOW THRESHOLD"),"Bet qualification: REVIEW — 2026–27 form, opponent matchup and calibrated pricing model not verified."];
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
