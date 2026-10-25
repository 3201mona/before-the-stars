'use strict';
// A reproducible engine-level AI-vs-AI campaign probe. This deliberately does
// NOT claim the complete DOM narration, event artwork, or save/load paths run.
// Every monthly checkpoint is emitted immediately and the runner is bounded.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {ctx}=require('./stage3-battle-scenario.cjs');
const E=ctx.ArmyPhase2Engine,B=ctx.BattleEngine,C=ctx.CityCommandEngine;
const P=ctx.PoliticalPhaseEngine,N=ctx.NavalControlEngine;
const PC=ctx.POLITICAL_PHASE_CONFIG,FC=ctx.PHASE2_CONFIG,CC=ctx.CITY_COMMAND_CONFIG;
const Marker=require('../runtime/battle_army_marker_model_v1.js');
const Route=require('../runtime/strategy_battle_map_model_v1.js');
const CommanderEvents=require('../runtime/commander_event_engine_v0_77_portraits.js');
const clone=o=>JSON.parse(JSON.stringify(o));
const factions=['PATRIOT','BRITISH'];
const other=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
const Ai={PATRIOT:ctx.PatriotAiTurn,BRITISH:ctx.RoyalistAiTurn};
const period=m=>`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
const number=(s,v)=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const opts=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
const seed=number('seed',opts.seed)||11,player=opts.player||'PATRIOT';
const maxMonths=Math.min(60,Math.max(1,number('months',opts.months)||24));
const reportDir=path.resolve(__dirname,'results');
fs.mkdirSync(reportDir,{recursive:true});
const prefix=`beta10_campaign_${player.toLowerCase()}_seed${seed}${opts.tag?'_'+String(opts.tag).replace(/[^a-z0-9_-]/gi,''):''}`;
const checkpointPath=path.join(reportDir,`${prefix}.jsonl`);
const summaryPath=path.join(reportDir,`${prefix}_summary.json`);
fs.writeFileSync(checkpointPath,''); // This test owns this seed-specific generated output.
const events=[];let failures=[],counts={},battleStats={started:0,resolved:0,continued:0,routed:0,reinforced:0,withdrawn:0},invariantChecks=0;
let m=clone(ctx.PHASE2_STATE_SEED),c=clone(ctx.CITY_COMMAND_DATA);
m=P.ensureState(m,PC);m.random={algorithm:'mulberry32',initial_seed:seed,state:seed,calls:0};
m.player_faction=player;
const engine={army:E,battle:B,naval:N,political:P,phaseConfig:FC,politicalConfig:PC,cityConfig:CC};
function sync(){
 const troops=E.logisticsTroopsByCity(m),cons=E.logisticsConsumptionTroopsByCity(m,FC).totals||{};
 for(const [id,city] of Object.entries(c.cities)){
  city.politics.military_control=P.militaryControl(m,id,PC);
  city.garrison={...city.garrison,troops:Number(m.garrisons?.[id]?.manpower)||0};
  city.stationed_field_army_troops=troops[id]||0;
  city.stationed_field_army_consumption_troops=cons[id]||0;
 }
}
function observe(){
 let troops={PATRIOT:0,BRITISH:0},armies={PATRIOT:0,BRITISH:0},reserves={PATRIOT:0,BRITISH:0},occupied={PATRIOT:0,BRITISH:0};
 for(const a of Object.values(m.field_armies||{}))if(a?.manpower>0&&factions.includes(a.faction)){troops[a.faction]+=a.manpower;armies[a.faction]++;}
 for(const a of Object.values(m.commanders||{}))if(factions.includes(a.faction)&&!a.assigned_army_id&&!a.dead)reserves[a.faction]++;
 for(const [id,city] of Object.entries(c.cities)){
  const f=P.militaryControl(m,id,PC);if(occupied[f]!==undefined)occupied[f]++;
 }
 let star=null,vote=null;
 try{const s=P.strategicStars(c,m,PC);star={PATRIOT:s.PATRIOT,BRITISH:s.BRITISH,UNCLAIMED:s.UNCLAIMED};}catch{}
 try{vote=P.voteTally(c,PC);}catch{}
 return{period:period(m),troops,armies,reserves,occupied,treasury:Object.fromEntries(factions.map(f=>[f,m.factions[f].treasury])),mobilizable:Object.fromEntries(factions.map(f=>[f,m.factions[f].mobilizable_manpower])),war_will:Object.fromEntries(factions.map(f=>[f,m.political_phase?.war_will_value?.[f]??null])),trust:Object.fromEntries(factions.map(f=>[f,m.political_phase?.trust_value?.[f]??null])),battles_active:Object.values(m.battles||{}).filter(b=>!['resolved','withdrawn'].includes(b.status)).length,votes:vote,star};
}
function validate(stage){
 const groups=Marker.markerGroups(m),displayed=Object.values(groups).flat().map(x=>x.army.id),seen=new Set(displayed),routes=Route.collectRoutes(m);
 assert.equal(displayed.length,seen.size,stage+' marker duplicated');invariantChecks++;
 for(const a of Object.values(m.field_armies||{})){
  if(Number(a.manpower)<=0)continue;
  const b=m.battles?.[a.battle_id],active=Boolean(b&&!['resolved','withdrawn'].includes(b.status));
  const city=active?b.city_id:a.location_city_id;
  assert.equal(Marker.displayLocation(m,a).city_id,city,stage+' location '+a.id);invariantChecks++;
  assert.ok((groups[city]||[]).some(r=>r.army.id===a.id),stage+' missing flag '+a.id);invariantChecks++;
 }
 for(const r of routes)if(r.battle_id){
  const b=m.battles[r.battle_id];assert.ok(b&&!['resolved','withdrawn'].includes(b.status),stage+' obsolete route');invariantChecks++;
 }
}
function battleAction(f,a){
 let p;if(a.type==='ATTACK'){p=Ai[f].prepareAttack(m,c,a,engine);m=p.state;battleStats.started++;}
 else {const b=m.battles[a.battle_id];if(!b)throw new Error('BATTLE_NOT_FOUND');p={state:m,battle:b};}
 const defender=other(p.battle.attacker_faction),decision=Ai[defender].defenseDecision?.(p,c)||{};
 if(decision.withdraw&&!p.battle.history?.length){
  const wd=B.withdrawDefenderBeforeBattle(m,p.battle.id,c,E,FC,decision.preferredRetreatCityId);
  if(wd.withdrawn){m=wd.state;battleStats.withdrawn++;return{status:'withdrawn',city:p.battle.city_id};}
 }
 if(p.battle.status==='awaiting_continuation'){m=B.continueBattle(m,p.battle.id,E).state;}
 let tactic='normal_attack';
 if(p.battle.attacker_faction==='BRITISH')tactic='normal_attack';
 const result=B.resolveBattle(m,p.battle.id,tactic,c,FC,E,decision.tactic||'hold_line');
 m=result.state;
 if(result.resolution.decisive)battleStats.resolved++;else battleStats.continued++;
 if(result.resolution.destroyed?.length)battleStats.routed+=result.resolution.destroyed.length;
 sync();
 return{status:result.resolution.band,city:p.battle.city_id,decisive:result.resolution.decisive,attacker_loss:result.resolution.attacker_loss,defender_loss:result.resolution.defender_loss};
}
function takeTurn(f){
 m.current_faction=f;
 const log=[];const start=Date.now();
 let guard=0,failedActions=new Set();
 while(m.factions[f].commands_remaining>0&&guard++<12){
  sync();let a;
  try{a=Ai[f].chooseAction(m,c);}catch(e){failures.push({period:period(m),f,stage:'choose',error:String(e)});break;}
  if(!a)break;
  const key=JSON.stringify(a);
  if(failedActions.has(key))break;
  try{
   const before=m.factions[f].commands_remaining;
   const cityBefore=a.city&&c.cities[a.city]?{support:c.cities[a.city].politics.independence_support,cooperation:c.cities[a.city].politics.public_cooperation}:null;
   let res;
   if(['ATTACK','CONTINUE'].includes(a.type))res=battleAction(f,a);
   else if(a.type==='BATTLE_REINFORCEMENT'){res=B.reinforceBattle(m,a.battle_id,a.ids,c,E);m=res.state;}
   else{res=Ai[f].executeNonBattle(m,c,a,engine);m=res.military||res.state;c=res.cities||c;}
   if(a.type==='BATTLE_REINFORCEMENT')battleStats.reinforced++;
   counts[a.type]=(counts[a.type]||0)+1;
   const cityAfter=a.city&&c.cities[a.city]?{support:c.cities[a.city].politics.independence_support,cooperation:c.cities[a.city].politics.public_cooperation}:null;
   log.push({type:a.type,origin:a.origin||null,target:a.target||a.city||null,route:a.route||null,result:res?.status||res?.kind||null,command_remaining:m.factions[f].commands_remaining,...(cityBefore&&cityAfter?{support_before:cityBefore.support,support_after:cityAfter.support,cooperation_before:cityBefore.cooperation,cooperation_after:cityAfter.cooperation}:{})});
   if(before===m.factions[f].commands_remaining&&!['CONTINUE'].includes(a.type)){
    failedActions.add(key);if(failedActions.size>3)break;
   }
  }catch(e){failures.push({period:period(m),f,stage:'execute',type:a.type,target:a.target||a.city,error:String(e)});failedActions.add(key);if(failedActions.size>=3)break;}
 }
 return{f,log,duration_ms:Date.now()-start,guard};
}
function monthly(){
 sync();
 m=P.evaluateMonthEnd(m,c,PC).state;
 let r=C.advanceMonth(c,CC);c=r.state;
 m=E.applyLogisticsShortageEffects(m,r.events).state;
 m=P.applyMonthlyShortageWarWill(m,c,r.events,PC).state;
 m=E.advanceMonth(m,FC);
 const special=CommanderEvents.processMonthOpening(m,c,PC);
 m=special.state;c=special.city_state||c;
 sync();
 if(N.recalculateAll){const n=N.recalculateAll(c,period(m),'軍事支配・港湾網の変化');c=n.state;}
 return{shortages:r.events.filter(e=>(e.type||'').includes('SHORTAGE')).length};
}
function political(){
 if(!FC.time.political_months.includes(m.calendar.month))return[];
 const notices=[];
 try{m=P.openPoliticalPhase(m,c,PC).state;}catch(e){failures.push({period:period(m),stage:'political_open',error:String(e)});}
 for(const f of factions){try{const r=Ai[f].politicalDecisions(m,c);m=r.state||m;notices.push({f,proposals:r.results?.length||0});}catch(e){failures.push({period:period(m),f,stage:'political',error:String(e)});}}
 for(const f of factions){try{const r=P.resolvePoliticalPhaseClose(m,c,f,PC,N);m=r.state;c=r.city_state||c;}catch(e){failures.push({period:period(m),f,stage:'political_close',error:String(e)});}}
 return notices;
}
sync();
const startTime=Date.now();
for(let i=0;i<maxMonths;i++){
 const before=observe(),politics=political(),actions=[];
 for(const f of [player,other(player)])actions.push(takeTurn(f));
 sync();
 try{validate('end-'+period(m));}catch(e){failures.push({period:period(m),stage:'invariant',error:String(e)});}
 const closed=monthly(),after=observe();
 try{validate('start-'+period(m));}catch(e){failures.push({period:period(m),stage:'invariant-after-month',error:String(e)});}
 const record={month:i+1,before,after,politics,actions,closed,failures_so_far:failures.length,elapsed_ms:Date.now()-startTime};
 fs.appendFileSync(checkpointPath,JSON.stringify(record)+'\n');
 console.log('CHECKPOINT',JSON.stringify({month:i+1,period:after.period,player,seed,actions:actions.map(x=>({f:x.f,n:x.log.length,types:x.log.map(a=>a.type),duration_ms:x.duration_ms})),active_battles:after.battles_active,stars:after.star,failures:failures.length,elapsed_s:Math.round(record.elapsed_ms/1000)}));
 if(m.game_conclusion){console.log('GAME_CONCLUSION',JSON.stringify(m.game_conclusion));break;}
}
const result={source_commit:'7f3106b5e0dd5ac26ec84107cfea075f2f92a9c8',mode:'ENGINE_ONLY_AI_VS_AI',limitations:['Uses production engine modules including political phase and commander events, but DOM battle presentation, notifications, human-tactic choice and localStorage persistence are not simulated','Neither side is a human player; player flag only defines action order and UI role','Defender AI tactic and retreat decisions are used; attacker selects normal attack'],player,seed,requested_months:maxMonths,completed_months:fs.readFileSync(checkpointPath,'utf8').trim().split('\n').filter(Boolean).length,duration_ms:Date.now()-startTime,counts,battleStats,invariantChecks,failures,last:observe(),checkpointPath};
fs.writeFileSync(summaryPath,JSON.stringify(result,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(result));
if(failures.some(x=>x.stage.startsWith('invariant')))process.exitCode=2;
