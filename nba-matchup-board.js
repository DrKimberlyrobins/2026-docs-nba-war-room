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
  analyzeTeams();showTab("matchupPlayers");
  document.getElementById("matchupPlayers").scrollIntoView({behavior:"smooth",block:"start"});
 }
 async function load(){
  cards.replaceChildren();status.textContent="Loading upcoming NBA schedule…";
  const today=new Date(),end=new Date(today);end.setDate(end.getDate()+7);
  const url="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+fmt(today)+"-"+fmt(end)+"&limit=150";
  try{
   const res=await fetch(url,{cache:"no-store"});if(!res.ok)throw Error("HTTP "+res.status);
   const data=await res.json();
   const events=(data.events||[]).filter(e=>{const dt=new Date(e.date);return Number.isFinite(dt.getTime())&&dt>=new Date(today.getTime()-4*3600000)&&e.season?.type===2;}).sort((a,b)=>new Date(a.date)-new Date(b.date));
   status.textContent=events.length?events.length+" NBA regular-season games listed for the next 7 days. Source: ESPN scoreboard.":"No regular-season games returned for this window.";
   for(const event of events){
    const comp=event.competitions?.[0],away=comp?.competitors?.find(t=>t.homeAway==="away")?.team,home=comp?.competitors?.find(t=>t.homeAway==="home")?.team;
    if(!away||!home)continue;
    const button=document.createElement("button");button.type="button";button.style.cssText="text-align:left;min-height:90px;display:flex;flex-direction:column;gap:8px";
    const title=document.createElement("strong");title.textContent=(away.displayName||away.name)+" @ "+(home.displayName||home.name);button.append(title);
    const meta=document.createElement("span");meta.className="small";meta.textContent=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(event.date))+" • "+(event.status?.type?.shortDetail||"Scheduled");button.append(meta);
    button.addEventListener("click",()=>selectGame(away,home));cards.append(button);
   }
  }catch(err){status.textContent="Could not retrieve the live NBA schedule ("+err.message+"). Existing manual team selection still works.";}
 }
 document.getElementById("nbaScheduleRefresh").addEventListener("click",load);
 load();
})();
