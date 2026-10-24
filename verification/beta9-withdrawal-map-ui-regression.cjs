'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
function extractedFunction(filename,name,nextName,context={}){
  const src=fs.readFileSync(path.join(root,'runtime',filename),'utf8');
  const begin=src.indexOf(`  function ${name}(`),end=src.indexOf(`\n  function ${nextName}(`,begin);
  check(begin>=0&&end>begin,`${name} not located in UI source`);
  return vm.runInNewContext(`${src.slice(begin,end)}\n${name};`,context);
}
const report=extractedFunction('battle_ui_v0_1.js','withdrawalReport','chooseWithdrawal',{
  retreatRouteLabel:route=>route.route_class==='ATTACKER_ORIGIN'?'出発地への帰還':'陸路撤退',
});
const Marker=require('../runtime/battle_army_marker_model_v1.js');
const flagCounts=extractedFunction('strategy_battle_map_ui_v1.js','battlefieldFlagCounts','refresh',{
  window:{BattleArmyMarkerModel:Marker},
});
const c={cities:{BATTLE:{city_name:'戦場都市'},HOME:{city_name:'出撃地'},PORT:{city_name:'補給港'},LAND:{city_name:'陸路拠点'}}};
for(const faction of ['PATRIOT','BRITISH']){
  const battle={city_id:'BATTLE',attacker_faction:faction};
  const main=report({withdrawal:{mode:'LAND',route_class:'ATTACKER_ORIGIN',arrival_rate:.9,transit_loss:10},destination_city_id:'HOME',reinforcement_moves:[]},c,battle,faction);
  check(main.speech.includes('出撃地')&&main.log.includes('到着率90%'),`${faction}: ordinary withdrawal unchanged`);
  const reinfs=report({withdrawal:{mode:'REINFORCEMENTS_ONLY'},destination_city_id:null,reinforcement_moves:[
    {role:'attacker',destination_city_id:'PORT',transit_loss:12},
    {role:'attacker',destination_city_id:'LAND',transit_loss:0},
    {role:'defender',destination_city_id:'HOME'},
  ]},c,battle,faction);
  check(reinfs.speech.includes('援軍のみ')&&reinfs.speech.includes('2部隊が帰還'),`${faction}: reinforcements-only branch`);
  check(reinfs.log.includes('補給港')&&reinfs.log.includes('陸路拠点')&&!reinfs.log.includes('出撃地'),`${faction}: actual friendly destinations and transit losses only`);
  const trapped=report({withdrawal:{mode:'REINFORCEMENTS_ONLY'},destination_city_id:null,reinforcement_moves:[
    {role:'attacker',destination_city_id:null,route_class:'NO_RETREAT'},
  ]},c,battle,faction);
  check(trapped.speech.includes('退路喪失')&&trapped.speech.includes('0部隊が帰還'),`${faction}: no retreat destination`);
  const noFriendly=report({withdrawal:{mode:'REINFORCEMENTS_ONLY'},destination_city_id:null,reinforcement_moves:[
    {role:'defender',destination_city_id:'PORT'},
  ]},c,battle,faction);
  check(noFriendly.speech.includes('該当する援軍はありません'),`${faction}: enemy only`);
}
const sample={battles:{B1:{id:'B1',city_id:'BATTLE',status:'awaiting_continuation'}},field_armies:{
  MAIN:{id:'MAIN',battle_id:'B1',manpower:850,location_city_id:'HOME'},
  REINF:{id:'REINF',battle_id:'B1',manpower:300,location_city_id:'PORT'},
  HOME:{id:'HOME',manpower:100,location_city_id:'HOME'},
  LOST:{id:'LOST',manpower:0,location_city_id:'HOME'},
  FREE:{id:'FREE',manpower:75,location_city_id:'LAND'},
}};
let counts=flagCounts(sample);
check(counts.get('BATTLE')===2,'attacker and reinforcement flags must be counted on battle city');
check(counts.get('HOME')===1&&counts.get('PORT')===undefined,'origin city does not gain duplicate battle flags');
check(counts.get('LAND')===1,'unengaged army stays in garrison city');
sample.battles.B1.status='withdrawn';counts=flagCounts(sample);
check(!counts.has('BATTLE')&&counts.get('HOME')===2&&counts.get('PORT')===1,'ended battle returns to actual army positions');
const fallback=extractedFunction('strategy_battle_map_ui_v1.js','battlefieldFlagCounts','refresh',{window:{}});
sample.battles.B1.status='active';counts=fallback(sample);
check(counts.get('BATTLE')===2&&counts.get('HOME')===1,'fallback also follows engagement location');
console.log(`PASS β9 撤収画面・戦場旗配置 UI 回帰: ${checks} assertions`);
