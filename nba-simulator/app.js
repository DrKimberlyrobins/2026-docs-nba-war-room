(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,text,parent,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(parent)parent.append(e);return e;};
  const pct=v=>(v*100).toFixed(1)+'%';
  const one=v=>Number.isFinite(v)?v.toFixed(1):'—';
  const signed=v=>(v>0?'+':'')+Number(v.toFixed(1));
  const ct=v=>new Date(v).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' CT';
  const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  let data;

  function table(parent,headers,rows){const wrap=el('div',undefined,parent,'table-scroll'),t=el('table',undefined,wrap),head=el('tr',undefined,el('thead',undefined,t));headers.forEach(h=>el('th',h,head));const body=el('tbody',undefined,t);rows.forEach(row=>{const tr=el('tr',undefined,body);row.forEach(v=>el('td',String(v),tr));});}

  function chart(parent,hist,runs){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 520 155');svg.classList.add('histogram');svg.setAttribute('role','img');svg.setAttribute('aria-label','Distribution of combined scores across '+runs+' simulations');parent.append(svg);
    const bins=new Map(),min=hist[0][0],max=hist.at(-1)[0],size=Math.max(1,Math.ceil((max-min+1)/45));
    for(const [v,n] of hist){const key=min+Math.floor((v-min)/size)*size;bins.set(key,(bins.get(key)||0)+n);}
    const peak=Math.max(...bins.values()),barWidth=470/Math.ceil((max-min+1)/size);
    const line=document.createElementNS(ns,'line');line.setAttribute('x1','30');line.setAttribute('x2','500');line.setAttribute('y1','125');line.setAttribute('y2','125');line.setAttribute('stroke','#cbd9ce');svg.append(line);
    for(const [v,n] of bins){const r=document.createElementNS(ns,'rect'),h=n/peak*100;r.setAttribute('x',30+(v-min)/size*barWidth);r.setAttribute('y',125-h);r.setAttribute('width',Math.max(1,barWidth-1));r.setAttribute('height',h);r.setAttribute('fill','#27805a');const title=document.createElementNS(ns,'title');title.textContent=`${v}–${v+size-1} points: ${n} of ${runs} runs`;r.append(title);svg.append(r);}
    for(const [x,v] of [[30,min],[260,Math.round((min+max)/2)],[500,max]]){const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y','145');t.setAttribute('text-anchor',x===30?'start':x===500?'end':'middle');t.setAttribute('fill','#607269');t.setAttribute('font-size','10');t.textContent=v;svg.append(t);}
  }

  function render(){
    const period=$('period').value,search=$('search').value.trim().toLowerCase(),date=$('date').value;
    const all=data.forecasts.filter(g=>g.date===date),games=all.filter(g=>(g.name+' '+g.away.abbr+' '+g.home.abbr).toLowerCase().includes(search));
    const periodName={full:'Full game + OT',h1:'First half',q1:'First quarter'}[period];
    $('boardTitle').textContent=new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
    $('gameCount').textContent=`${games.length}${search?' of '+all.length:''} games · ${periodName}`;
    $('today').classList.toggle('active',date===day(new Date()));const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);$('tomorrow').classList.toggle('active',date===day(tomorrow));
    $('board').replaceChildren();
    if(!games.length){el('div',all.length?'No team matches your search.':'No scheduled games were collected for this date. Choose another date.',$('board'),'empty');return;}
    for(const g of games){
      const card=el('article',undefined,$('board'),'game'),top=el('div',undefined,card,'game-top');
      el('strong',g.away.abbr+' @ '+g.home.abbr,top);el('span',ct(g.tip),top);el('span',g.grade?'FINAL · GRADED':new Date(g.tip)<=new Date()?'LOCKED':'PREGAME',top,'game-state');
      const p=g.simulation.periods?.[period];
      if(!p){el('div',g.simulation.status==='no_pregame_receipt'?'No pregame forecast was saved before tipoff.':'Team history is unavailable for this projection.',card,'not-saved');continue;}
      const scores=el('div',undefined,card,'scores');
      for(const side of ['away','home']){if(side==='home')el('div','PROJECTED',scores,'score-vs');const block=el('div',undefined,scores);el('div',g[side].name,block,'team-name');el('div',one(p[side].mean),block,'team-score');el('div',side+' score',block,'score-label');}
      const picks=el('div',undefined,card,'picks');
      function pick(label,title,prob,count,extra){const box=el('div',undefined,picks,'pick');el('div',label,box,'pick-label');el('strong',title,box,'pick-direction');if(prob!==null){el('span',pct(prob),box,'pick-percent');el('span',`${count} / ${g.simulation.runs} runs`,box,'pick-count');}if(extra)el('span',extra,box,'pick-count');}
      pick('WINNING SIDE',p.winner.side?g[p.winner.side].abbr:'Even projection',p.winner.probability,p.winner.count,p.ties?`${p.ties} tied runs`:'');
      const s=p.spread,t=p.totalDirection,fair=p.projectedHomeSpread;
      if(s)pick('SPREAD',s.side?g[s.side].abbr+' '+signed(s.line):'Even projection',s.probability,s.count,s.pushes?`${s.pushes} pushes`:'');
      else pick('MODEL SPREAD',fair===0?'Pick’em':g[fair>0?'away':'home'].abbr+' '+signed(-Math.abs(fair)),null,null,period==='full'?'Market unavailable':'Projected fair line');
      if(t)pick('OVER / UNDER',t.side?t.side.toUpperCase()+' '+t.line:'Even projection',t.probability,t.count,t.pushes?`${t.pushes} pushes`:'');
      else pick('MODEL TOTAL',one(p.total.mean),null,null,period==='full'?'Market unavailable':'Projected fair total');
      const ranges=el('div',undefined,card,'range-strip');el('span','Model total '+one(p.total.mean),ranges);el('span',`Middle 80%: ${p.total.p10}–${p.total.p90}`,ranges);
      if(period==='full'&&g.market)el('p',`${g.market.provider} via ESPN · Market captured ${ct(g.market.fetchedAt)} · Forecast saved ${ct(g.savedAt)}`,card,'market-source');
      else el('p',`Forecast saved ${ct(g.savedAt)} · ${period==='full'?'No current market quote supplied.':'Period market comparisons are not connected.'}`,card,'market-source');
      if(g.grade&&period==='full')el('p',Object.entries(g.grade.markets).map(([k,v])=>k.toUpperCase()+': '+v.toUpperCase()).join(' · '),card,'grade');
      const details=el('details',undefined,card);el('summary','Score ranges, simulation distribution & receipt',details);
      table(details,['Period',g.away.abbr,g.home.abbr,'Total','Total range'],[['q1','1Q'],['h1','1H'],['full','Full + OT']].map(([k,label])=>{const d=g.simulation.periods[k];return [label,one(d.away.mean),one(d.home.mean),one(d.total.mean),d.total.p10+'–'+d.total.p90];}));
      el('div',periodName+' total · '+g.simulation.runs.toLocaleString()+' outcomes',details,'chart-title');chart(details,p.total.hist,g.simulation.runs);
      el('p','Each bar counts simulated outcomes. The range is the 10th–90th percentile, not an established future accuracy rate.',details,'chart-caption');
      el('p',`Current-season team samples: ${g.away.abbr} ${g.simulation.samples.away.current} games; ${g.home.abbr} ${g.simulation.samples.home.current} games. Prior-season history contributes six effective games per team.`,details,'chart-caption');
      el('p',`First receipt ${ct(g.firstSavedAt)} · Latest ${ct(g.savedAt)} · ${g.version}`,details,'chart-caption');
      if(g.grade?.periods[period]){const r=g.grade.periods[period];el('p',`Actual ${r.awayActual}–${r.homeActual}. Projection errors: away ${signed(r.awayError)}, home ${signed(r.homeError)}, total ${signed(r.totalError)}.`,details);}
      const a=el('a','Open the preserved pregame receipt',details,'receipt-link');a.href='data/receipts/'+g.id+'.json';a.target='_blank';a.rel='noopener';
    }
  }

  function record(){
    const m=data.metrics;$('recordStatus').textContent=m.gradedGames?`${m.gradedGames} games graded against forecasts actually saved before tipoff. Pushes are excluded from hit rates.`:'The record starts here. No games have been graded for this new simulator yet.';
    const grid=el('div',undefined,$('record'),'record-cards');
    for(const [key,label] of [['winner','Winning side'],['spread','Spread'],['total','Over / under']]){const r=m.markets[key],c=el('div',undefined,grid,'record-card');el('h3',label,c);el('div',`${r.wins}–${r.losses}`,c,'record-big');el('div',`${r.pushes} pushes · ${r.hitRate===null?'Accuracy pending':pct(r.hitRate)}`,c,'record-sub');}
  }

  fetch('data/latest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(result=>{
    data=result;$('status').textContent=`Saved ${ct(data.updatedAt)} · ${data.runs.toLocaleString()} runs per matchup`;$('version').textContent=data.version;
    const dates=[...new Set(data.forecasts.map(f=>f.date))].sort(),today=day(new Date());$('date').value=dates.includes(today)?today:dates.find(d=>d>=today)||dates.at(-1)||today;
    for(const id of ['date','period','search'])$(id).addEventListener(id==='search'?'input':'change',render);
    $('today').addEventListener('click',()=>{$('date').value=day(new Date());render();});$('tomorrow').addEventListener('click',()=>{const d=new Date();d.setDate(d.getDate()+1);$('date').value=day(d);render();});
    $('method').textContent=data.method;
    el('p',`Current-season source updated ${ct(data.evidence.currentSeasonThrough)}. Prior-season source: ${data.evidence.priorSeason} (${data.evidence.priorStatus}).`,$('evidence'));
    data.limitations.forEach(t=>el('li',t,$('limitations')));data.issues.forEach(t=>el('p',t,$('issues')));record();render();
  }).catch(error=>{$('status').textContent='Saved simulator data could not be loaded: '+error.message;el('div','Check the NBA Simulator refresh workflow.',$('board'),'empty');});
})();
