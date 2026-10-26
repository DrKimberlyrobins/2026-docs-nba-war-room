/* Run with NODE_PATH pointing to a jsdom installation: node tests/dom-smoke.cjs. */
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),errors=[];
class LocalResources extends ResourceLoader{fetch(url){const u=new URL(url);if(u.hostname==='nba.test')return Promise.resolve(fs.readFileSync(path.join(root,u.pathname)));return null;}}
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://nba.test/',runScripts:'dangerously',resources:new LocalResources(),virtualConsole:vc,beforeParse(w){w.fetch=async url=>{const u=new URL(url,'https://nba.test/');if(u.hostname==='nba.test')return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,u.pathname),'utf8'))};return {ok:true,json:async()=>({events:[]})};};w.HTMLElement.prototype.scrollIntoView=function(){};w.alert=message=>{throw Error(message)};}});
const w=dom.window,delay=()=>new Promise(r=>setTimeout(r,25));
(async()=>{for(let i=0;i<200&&!w.document.querySelector('#nbaImpactProjection');i++)await delay();
assert.equal(w.eval('status.season'),'2026-27');assert.equal(w.eval('teams.length'),30);assert(w.document.querySelector('#nbaImpactProjection').textContent.includes('Player Impact'));
assert.equal(w.document.querySelectorAll('#awayTeam option').length,30);
w.eval("openPlayer(players.find(p=>p.gamesPlayed>2).playerId)");await delay();await delay();
assert(w.document.querySelector('#docRealPlayerVolume'));assert(!w.document.querySelector('#docRealPlayerVolume').textContent.includes('Last 20'));assert(w.document.querySelector('#docRealPlayerVolume').textContent.includes('(3/3)')); assert(w.document.querySelector('#nbaPropPanel'));assert(w.document.querySelector('#saveVerifiedProp'));assert(!w.document.querySelector('#docRollingPanel'));
const controls=w.document.querySelectorAll('#nbaPropPanel input,#nbaPropPanel select');
controls[1].value='10.5';controls[3].value='-110';controls[5].value='Kambi';controls[1].dispatchEvent(new w.Event('input'));
w.document.querySelector('#saveVerifiedProp').click();const receipt=JSON.parse(w.localStorage.getItem('docs_nba_prop_receipts_v1'));assert.equal(receipt.length,1);assert.equal(receipt[0].historicalSeason,'2026-27 regular season');
w.eval('closeModal()');const select=w.document.querySelector('#nbaDataSeason');select.value='historical';select.dispatchEvent(new w.Event('change'));for(let i=0;i<200&&w.eval('status.season')!=='2025-26';i++)await delay();assert.equal(w.eval('status.season'),'2025-26');assert.equal(JSON.parse(w.localStorage.getItem('docs_nba_prop_receipts_v1')).length,1);
assert.deepEqual(errors,[]);console.log('PASS DOM smoke: current load, 30 teams, projection, player popout, volume, prop panel, receipt save, historical switch, saved-record retention; no script errors.');w.close();})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
