'use strict';
// Exercise actual production functions with controlled threat inputs. These
// focused VM checks complement the real-engine strategy/campaign regressions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
function extract(src,name,next,context){
 const start=src.indexOf(`function ${name}(`),end=src.indexOf(`\nfunction ${next}(`,start);
 assert.ok(start>=0&&end>start,name+' source exists');
 return vm.runInNewContext(src.slice(start,end)+`;${name}`,context);
}
for(const [f,file] of [['BRITISH','royalist_ai_official_browser_v3.js'],['PATRIOT','patriot_ai_official_browser_v2.js']]){
 const src=fs.readFileSync(path.join(__dirname,'../runtime',file),'utf8');
 let input;
 const snapshot=extract(src,'buildSnapshot','lifecycle',{
  chiefArmy:()=>input.chief,
  directThreat:()=>input.now,nextTurnThreat:()=>input.next,
  safeRetreatTargets:()=>Array.from({length:input.exits},()=>({})),
  troopsAt:()=>input.friendly,landNeighbors:()=>[],supplyMonths:()=>input.supply,
  phase:{battle_engine:{result_thresholds:{victory:1.35}}},
 });
 function run(over={}){
  input={chief:{id:'HQ',location_city_id:'HOME',manpower:2000,morale:60},
   now:{ratio:1,assaultRatio:1.1,manpower:2000},
   next:{ratio:1.4,virtualMoveTo:'NEXT',manpower:3000},
   exits:3,friendly:3000,supply:4,...over};
  return snapshot({battles:input.battles||{}},{},f);
 }
 let out=run();check(!out.crisisTriggered&&out.speculativeThreatWatch,f+' safe speculative approach is watched');
 check(out.potentialNextTurnEnemyToFriendlyPowerRatio===1.4&&out.nextTurnEnemyToFriendlyPowerRatio===1,f+' projected risk remains in diagnostics');
 for(const [label,over] of [
  ['low supply',{supply:2.99}],['low morale',{chief:{id:'HQ',location_city_id:'HOME',manpower:2000,morale:49}}],
  ['one exit',{exits:1}],['no friendly concentration',{friendly:2000}],
  ['ongoing battle',{battles:{B:{status:'active',attacker_army_ids:['HQ']}}}],
  ['direct decisive attack',{now:{ratio:1.15,assaultRatio:1.35,manpower:2300}}],
  ['strong direct attack',{now:{ratio:1.3,assaultRatio:1.3,manpower:2600}}],
  ['real adjacent threat',{now:{ratio:1.4,assaultRatio:1.6,origin:'ENEMY',manpower:3000},next:{ratio:1.4,origin:'ENEMY',manpower:3000}}],
 ])check(run(over).crisisTriggered,f+' retains crisis: '+label);
 check(run({now:{ratio:1.15,assaultRatio:1.2,manpower:2300},exits:2}).crisisTriggered,f+' moderate direct risk needs three exits');
 check(!run({now:{ratio:1.15,assaultRatio:1.2,manpower:2300}}).crisisTriggered,f+' secure moderate pressure resumes normal planning');
 check(!run({now:{ratio:1.0,assaultRatio:1.1},exits:2,supply:3,chief:{id:'HQ',location_city_id:'HOME',manpower:2000,morale:50}}).crisisTriggered,f+' inclusive safety thresholds');
 check(run({chief:null}).chiefAlive===false,f+' missing chief remains severe');

 const stalled=extract(src,'repeatedSecurityWithoutProgress','safeReserves',{
  monthIndex:(y,m)=>Number(y)*12+Number(m),
 });
 const support=f==='PATRIOT'?50:52,after=support+(f==='PATRIOT'?1:-1);
 const entry=(month,extra={})=>({type:'CIVIL_SECURITY_EXECUTED',city_id:'CITY',faction:f,year:1775,month,support_before:support,support_after:after,...extra});
 const state=log=>({calendar:{year:1775,month:12},action_log:log});
 const repeated=log=>stalled(state(log),'CITY',f,support);
 check(repeated([entry(8),entry(10)]),f+' repeated return to support baseline');
 check(!repeated([entry(10)]),f+' one prior action is insufficient');
 check(!repeated([entry(6),entry(10)]),f+' excludes action older than five months');
 check(!repeated([entry(10),entry(12)]),f+' excludes current month');
 check(!repeated([entry(8),entry(10,{support_before:support-1})]),f+' genuine progress is preserved');
 check(!repeated([entry(8),entry(10,{support_after:support})]),f+' requires support-changing actions');
 check(!repeated([entry(8),entry(10,{faction:f==='PATRIOT'?'BRITISH':'PATRIOT'})]),f+' other faction ignored');
 check(!repeated([{type:'CIVIL_SECURITY_EXECUTED',city_id:'CITY',faction:f,year:1775,month:8},entry(10)]),f+' old logs without new fields ignored');

 const candidates=extract(src,'candidates','unresolvedBattleAt',{
  candidateEnabled:true,politicalFocus:()=>[],enemyOf:()=>f==='PATRIOT'?'BRITISH':'PATRIOT',
  P:{militaryControl:()=>f},political:{},recent:()=>false,
  stateIdForCity:()=> 'STATE',neighbors:()=>[],troopsAt:()=>0,
  preview:()=>({support_change:1,cooperation_change:3}),
  repeatedSecurityWithoutProgress:stalled,
  safeReserves:()=>({food:1000,materials:1000,food_net:0,materials_net:0}),
 });
 function rows(s,log){return candidates(state(log),{cities:{CITY:{city_id:'CITY',politics:{independence_support:s,political_importance:3,public_cooperation:50},bases:{population:100},stockpile:{FOOD:0,MATERIALS:0}}}},f);}
 const base=rows(support,[])[0],penalized=rows(support,[entry(8),entry(10)])[0];
 check(base.score-penalized.score===40&&penalized.civil_stagnation_penalty===40,f+' real candidate receives exact 40-point penalty');
 const near=f==='PATRIOT'?56:44;
 const nearLog=[entry(8,{support_before:near,support_after:near+1}),entry(10,{support_before:near,support_after:near+1})];
 check(!rows(near,nearLog)[0].civil_stagnation_penalty,f+' within two support points of goal is exempt');

 const execute=extract(src,'execute','recent',{
  preview:()=>({before:support,after,after_cooperation:53,food:0,materials:0,support_change:after-support,cooperation_change:3}),
  copy:o=>JSON.parse(JSON.stringify(o)),E:{appendAction:(m,a)=>(m.action_log||=[]).push(a)},
 });
 const old={factions:{[f]:{commands_remaining:3}},action_log:[]};
 const result=execute(old,{cities:{CITY:{stockpile:{FOOD:0,MATERIALS:0},politics:{independence_support:support,public_cooperation:50}}}},f,{type:'SECURITY',city:'CITY'});
 check(result.m.action_log[0].support_before===support&&result.m.action_log[0].support_after===after,f+' actual execution records support before and after');
 check(result.m.factions[f].commands_remaining===2&&old.factions[f].commands_remaining===3,f+' execution retains command cost and input immutability');
}
console.log(`PASS beta11 AI tempo: ${checks} focused VM checks across both factions`);
