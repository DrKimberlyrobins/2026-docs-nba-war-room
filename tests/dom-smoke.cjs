/* Run with NODE_PATH pointing to a jsdom installation: node tests/dom-smoke.cjs. */
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),errors=[];let replacementSnapshot=null;
class LocalResources extends ResourceLoader{fetch(url){const u=new URL(url);if(u.hostname==='nba.test')return Promise.resolve(fs.readFileSync(path.join(root,u.pathname)));return null;}}
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://nba.test/',runScripts:'dangerously',resources:new LocalResources(),virtualConsole:vc,beforeParse(w){w.fetch=async url=>{const u=new URL(url,'https://nba.test/');if(u.pathname==='/data/nba-current.json'&&replacementSnapshot)return {ok:true,json:async()=>replacementSnapshot};if(u.hostname==='nba.test')return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,u.pathname),'utf8'))};return {ok:true,json:async()=>({events:[]})};};w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=message=>{throw Error(message)};}});
const w=dom.window,delay=()=>new Promise(r=>setTimeout(r,25));
(async()=>{for(let i=0;i<200&&!w.document.querySelector('#nbaImpactProjection');i++)await delay();
assert.equal(w.eval('status.season'),'2026-27');assert.equal(w.eval('teams.length'),30);assert(w.document.querySelector('#nbaImpactProjection').textContent.includes('Player Impact'));
assert.equal(w.document.querySelectorAll('#awayTeam option').length,30);
// Fixed three-game fixture in memory: the test must keep passing as the real season grows.
w.eval("var smokePlayer=players.find(p=>p.name==='Bam Adebayo'); smokePlayer.gameLogs=smokePlayer.gameLogs.slice(0,3).map((g,i)=>({...g,points:[20,4,15][i]})); openPlayer(smokePlayer.playerId)");await delay();await delay();
assert(w.document.querySelector('#docRealPlayerVolume'));assert(!w.document.querySelector('#docRealPlayerVolume').textContent.includes('Last 20'));assert(w.document.querySelector('#docRealPlayerVolume').textContent.includes('(3/3)')); assert(w.document.querySelector('#nbaPropPanel'));assert(w.document.querySelector('#saveVerifiedProp'));assert(!w.document.querySelector('#docRollingPanel'));
const controls=w.document.querySelectorAll('#nbaPropPanel input,#nbaPropPanel select');
controls[1].value='10.5';controls[3].value='-110';controls[5].value='Kambi';controls[1].dispatchEvent(new w.Event('input'));
assert.equal(w.document.querySelector('#nbaPropPanel').consistency.tier,'WATCH');
replacementSnapshot=JSON.parse(fs.readFileSync(path.join(root,'data/nba-current.json'),'utf8'));
replacementSnapshot.generatedAt='2099-10-26T12:00:00Z';
const updated=replacementSnapshot.players.find(p=>p.name==='Bam Adebayo');updated.gameLogs=JSON.parse(w.eval('JSON.stringify(smokePlayer.gameLogs)'));
updated.gameLogs.push({...updated.gameLogs[0],eventId:'test-new-final',date:'2026-10-26T04:00:00Z',points:20});updated.gamesPlayed++;
await w.eval('NBAView.refreshCurrent()');await delay();await delay();
assert.equal(w.document.querySelector('#nbaPropPanel').consistency.season.games,4);
assert.equal(w.document.querySelector('#nbaPropPanel').consistency.tier,'EARLY QUALIFIED');
assert.equal(w.document.querySelectorAll('#nbaPropPanel input,#nbaPropPanel select')[1].value,'10.5');
w.document.querySelector('#saveVerifiedProp').click();const receipt=JSON.parse(w.localStorage.getItem('docs_nba_prop_receipts_v1'));assert.equal(receipt.length,1);assert.equal(receipt[0].historicalSeason,'2026-27 regular season');assert.equal(receipt[0].consistency.season.games,4);assert(receipt[0].trendScreen.startsWith('EARLY QUALIFIED'));
w.eval('closeModal()');const select=w.document.querySelector('#nbaDataSeason');select.value='historical';select.dispatchEvent(new w.Event('change'));for(let i=0;i<200&&w.eval('status.season')!=='2025-26';i++)await delay();assert.equal(w.eval('status.season'),'2025-26');assert.equal(JSON.parse(w.localStorage.getItem('docs_nba_prop_receipts_v1')).length,1);
assert.deepEqual(errors,[]);console.log('PASS DOM smoke: current load, 30 teams, projection, player popout, volume, prop panel, automatic fourth-game recalculation, preserved prop input, receipt save, historical switch, saved-record retention; no script errors.');w.close();})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
