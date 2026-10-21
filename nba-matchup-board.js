"use strict";
(function(){
 const wrap=document.createElement("section");wrap.className="panel";wrap.id="nbaScheduleBoard";
 wrap.innerHTML='<h2>NBA One-Click Matchup Board</h2><p class="small">Scheduled NBA games from ESPN scoreboard. Times shown in Central Time. Select a matchup to load both teams and player intelligence automatically.</p><div id="nbaScheduleStatus" class="small">Loading upcoming games…</div><div id="nbaScheduleCards" class="grid" style="margin-top:12px"></div><button id="nbaScheduleRefresh" type="button" style="margin-top:12px">Refresh Schedule</button>';
 const teamsSection=document.getElementById("teams");if(!teamsSection)return;teamsSection.insertAdjacentElement("afterbegin",wrap);
 const status=document.getElementById("nbaScheduleStatus"),cards=document.getElementById("nbaScheduleCards");
 const fmt=d=>d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
 const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const aliases={"la clippers":"los angeles clippers","la lakers":"los angeles lakers","ny knicks":"new york knicks","gs warriors":"golden state warriors"};
 function findTeam(obj){
  const names=[obj.displayName,obj.shortDisplayName,obj.name,obj.abbreviation].filter(Boolean);
  const options=teams.filter(t=>names.some(n=>norm(t.team)===norm(n)||norm(t.team)===norm(aliases[String(n).toLowerCase()]||"")));
  if(options.length===1)return options[0];
  const nick=norm(obj.name);const matched=teams.filter(t=>nick&&norm(t.team).endsWith(nick));return matched.length===1?matched[0]:null;
 }
 function selectGame(away,home){
  const a=findTeam(away),h=findTeam(home);
  if(!a||!h){status.textContent="This matchup could not be matched to both historical team records. No teams were guessed.";return;}
  document.getElementById("awayTeam").value=String(a.teamId);
  document.getElementById("homeTeam").value=String(h.teamId);
  showTab("teams");analyzeTeams();
  document.getElementById("teamResults").scrollIntoView({behavior:"smooth",block:"start"});
 }
 async function load(){
  cards.replaceChildren();status.textContent="Loading NBA schedule for each of the next 7 days…";
  const today=new Date(),dates=[];
  for(let i=0;i<7;i++){const d=new Date(today);d.setDate(today.getDate()+i);dates.push(d);}
  const results=await Promise.allSettled(dates.map(async d=>{
   const url="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+fmt(d);
   const res=await fetch(url,{cache:"no-store"});if(!res.ok)throw Error("HTTP "+res.status);
   const data=await res.json();return {date:d,events:data.events||[]};
  }));
  let total=0,failed=0;
  for(let i=0;i<results.length;i++){
   const item=results[i];if(item.status!=="fulfilled"){failed++;continue;}
   const events=item.value.events.filter(e=>e.competitions?.[0]?.competitors?.length>=2).sort((a,b)=>new Date(a.date)-new Date(b.date));
   if(!events.length)continue;
   const heading=document.createElement("h3");heading.style.cssText="grid-column:1/-1;color:var(--gold);margin:10px 0 0";
   heading.textContent=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",weekday:"long",month:"long",day:"numeric"}).format(new Date(item.value.date.getFullYear(),item.value.date.getMonth(),item.value.date.getDate(),12))+" — "+events.length+" games";
   cards.append(heading);
   for(const event of events){
    const comp=event.competitions?.[0],away=comp?.competitors?.find(t=>t.homeAway==="away")?.team,home=comp?.competitors?.find(t=>t.homeAway==="home")?.team;
    if(!away||!home)continue;total++;
    const button=document.createElement("button");button.type="button";button.style.cssText="text-align:center;min-height:112px;display:flex;flex-direction:column;gap:10px;background:#081525;border:1px solid #36516b;border-radius:10px;padding:14px";
    const title=document.createElement("div");title.style.cssText="display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr);align-items:center;gap:5px";
    const teamLabel=team=>{
      const cell=document.createElement("div");cell.style.cssText="min-width:0;text-align:center";
      const abbr=document.createElement("div");abbr.style.cssText="font-size:18px;font-weight:800;color:#f5c765";abbr.textContent=team.abbreviation||team.shortDisplayName||"—";
      const full=document.createElement("div");full.style.cssText="font-size:11px;line-height:1.3;color:#d1deee;overflow-wrap:anywhere";full.textContent=team.displayName||team.name||"";
      cell.append(abbr,full);return cell;
    };
    const at=document.createElement("span");at.textContent="@";at.style.color="#35df93";
    title.append(teamLabel(away),at,teamLabel(home));button.append(title);
    const odds=Array.isArray(comp.odds)?comp.odds[0]:null;
    const oddsBox=document.createElement("div");oddsBox.style.cssText="border-top:1px solid #36516b;padding-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;text-align:center";
    const spread=document.createElement("div"),totalBox=document.createElement("div");
    const details=typeof odds?.details==="string"?odds.details.trim():"";
    const total=Number(odds?.overUnder);
    const validSpread=/^[A-Za-z0-9 .]+\s[-+]\d+(?:\.\d+)?$/.test(details);
    spread.textContent="Spread: "+(validSpread?details:"Unavailable");
    totalBox.textContent="Total: "+(Number.isFinite(total)&&total>0?total.toFixed(1):"Unavailable");
    oddsBox.append(spread,totalBox);button.append(oddsBox);
    const oddsNote=document.createElement("div");oddsNote.style.cssText="font-size:10px;color:#a5b7cd";
    oddsNote.textContent=validSpread||(Number.isFinite(total)&&total>0)?"ESPN scoreboard odds · check source for current price":"Odds not provided by ESPN scoreboard";
    button.append(oddsNote);
    const meta=document.createElement("span");meta.className="small";meta.textContent=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(event.date))+" • "+(event.status?.type?.shortDetail||"Scheduled");button.prepend(meta);const action=document.createElement("div");action.textContent="Analyze Matchup";action.style.cssText="background:#28d99a;color:#061521;padding:9px;border-radius:6px;font-weight:bold";button.append(action);
    button.addEventListener("click",()=>selectGame(away,home));cards.append(button);
   }
  }
  status.textContent=total+" NBA games loaded across "+(7-failed)+" of 7 days."+(failed?" "+failed+" day(s) failed to load; click Refresh Schedule to retry.":"")+" Source: ESPN daily scoreboard.";
  if(!total){status.textContent="ESPN schedule unavailable. Manual selection remains available; no games have been invented.";}
 }
 document.getElementById("nbaScheduleRefresh").addEventListener("click",load);
 load();
})();
