'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const base=path.resolve(__dirname,'../runtime'),ctx={console};ctx.window=ctx;vm.createContext(ctx);
for(const fn of ['phase2_data_v0_9_funds.js','political_phase_data_v0_1.js'])vm.runInContext(fs.readFileSync(path.join(base,fn),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(base,'canonical_city_runtime_v0_74_retreat.js'),'utf8').split('\n')[0],ctx);
vm.runInContext(fs.readFileSync(path.join(base,'commander_roster_runtime_v0_77_portraits.js'),'utf8'),ctx);
for(const [k,fn] of Object.entries({ArmyPhase2Engine:'army_phase2_engine_v0_74_retreat.js',BattleEngine:'battle_engine_v0_74_retreat.js',PoliticalPhaseEngine:'political_phase_engine_v0_77_portraits.js',CityCommandEngine:'city_command_engine_v0_18.js',NavalControlEngine:'canonical_naval_runtime_v0_67.js'}))ctx[k]=require(path.join(base,fn));
for(const fn of ['royalist_ai_turn_v1_15.js','patriot_sparring_ai_v1_15.js','commander_survival_policy_v1.js','royalist_ai_official_browser_v3.js','patriot_ai_official_browser_v2.js'])vm.runInContext(fs.readFileSync(path.join(base,fn),'utf8'),ctx);
const {BattleEngine:B,ArmyPhase2Engine:E,PHASE2_CONFIG:CFG,CITY_COMMAND_DATA:C,PoliticalPhaseEngine:P,POLITICAL_PHASE_CONFIG:POL}=ctx;
globalThis.NavalControlEngine=ctx.NavalControlEngine;
const clone=x=>JSON.parse(JSON.stringify(x));
const plans=[
 {label:'patriot_into_boston',faction:'PATRIOT',attacker:'ARM_PAT_GREENE',attackerHQ:'ARM_PAT_WASHINGTON',defender:'ARM_BRI_GAGE',reinforcement:'ARM_PAT_WARD',enemyReinforcement:'ARM_BRI_HOWE',origin:'MA_02',target:'MA_03',reinfOrigin:'MA_04',enemyReinfOrigin:'CT_03'},
 {label:'british_into_worcester',faction:'BRITISH',attacker:'ARM_BRI_HOWE',attackerHQ:'ARM_BRI_GAGE',defender:'ARM_PAT_WASHINGTON',reinforcement:'ARM_BRI_CLINTON',enemyReinforcement:'ARM_PAT_GREENE',origin:'MA_03',target:'MA_02',reinfOrigin:'CT_03',enemyReinfOrigin:'NH_03'}
];
const enemy=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
function mk(scenario,seed){
 let m=clone(ctx.PHASE2_STATE_SEED),c=clone(C);let ids=[scenario.attacker,scenario.attackerHQ,scenario.defender,scenario.reinforcement,scenario.enemyReinforcement];m.field_armies=Object.fromEntries(ids.map(id=>[id,m.field_armies[id]]));
 m.field_armies[scenario.attacker].location_city_id=scenario.origin;
 m.field_armies[scenario.attackerHQ].location_city_id=scenario.faction==='PATRIOT'?'CT_01':'MA_04';
 m.field_armies[scenario.defender].location_city_id=scenario.target;
 m.field_armies[scenario.reinforcement].location_city_id=scenario.reinfOrigin;
 m.field_armies[scenario.enemyReinforcement].location_city_id=scenario.enemyReinfOrigin;
 m.field_armies[scenario.reinforcement].manpower=5500;
 m.field_armies[scenario.enemyReinforcement].manpower=4000;
 for(let a of Object.values(m.field_armies)){a.acted_this_month=false;a.battle_id=null;a.morale=75;}
 for(const x of Object.keys(m.garrisons)){m.garrisons[x].faction=null;m.garrisons[x].manpower=0;}
 m.garrisons[scenario.faction==='PATRIOT'?'MA_04':'CT_03']={...m.garrisons[scenario.faction==='PATRIOT'?'MA_04':'CT_03'],faction:scenario.faction,manpower:150};
 m.garrisons[scenario.faction==='PATRIOT'?'CT_03':'NH_03']={...m.garrisons[scenario.faction==='PATRIOT'?'CT_03':'NH_03'],faction:enemy(scenario.faction),manpower:100};
 m.garrisons[scenario.target]={...m.garrisons[scenario.target],faction:enemy(scenario.faction),manpower:200};
 m.random={algorithm:'mulberry32',initial_seed:seed,state:seed,calls:0};m.battles={};m.current_faction=scenario.faction;m.player_faction=scenario.faction;for(const f of ['PATRIOT','BRITISH'])m.factions[f].commands_remaining=3;
 m=P.ensureState(m,POL);
 return{m,c};
}
function prepare(m,c,sc){return B.prepareBattle(m,{origin_city_id:sc.origin,city_id:sc.target,attacker_army_ids:[sc.attacker],leader_army_id:sc.attacker,route_type:'LAND_ATTACK'},c,CFG);}
const tunedCache=new Map();
function tune(sc,desired){
 const cacheKey=sc.label+'|'+desired; if(tunedCache.has(cacheKey)) return tunedCache.get(cacheKey);
 let {m,c}=mk(sc,123);let lo=100,hi=70000;for(let k=0;k<25;k++){let mid=Math.floor((lo+hi)/2);m.field_armies[sc.attacker].manpower=mid;let prep=prepare(m,c,sc);let raw=B.basePower(prep.attacker,CFG.battle_engine,false)/B.basePower(prep.defender,CFG.battle_engine,true);if(raw<desired)lo=mid+1;else hi=mid;}
 m.field_armies[sc.attacker].manpower=hi;let prep=prepare(m,c,sc);let raw=B.basePower(prep.attacker,CFG.battle_engine,false)/B.basePower(prep.defender,CFG.battle_engine,true);const value={manpower:hi,ratio:raw};tunedCache.set(cacheKey,value);return value;
}
function trial(sc,rawTarget,seed,tactic='normal_attack',reinforce='own'){
 let {m,c}=mk(sc,seed),tuned=tune(sc,rawTarget);m.field_armies[sc.attacker].manpower=tuned.manpower;
 let p=prepare(m,c,sc),def=ctx[sc.faction==='PATRIOT'?'RoyalistAiTurn':'PatriotAiTurn'].defenseDecision(p,c);
 const data={prewithdraw:Boolean(def?.withdraw),preRatio:def?.ratio,preDecision:def?.reason,preTactic:def?.tactic,manpower:tuned.manpower};
 if(def?.withdraw){let wd=B.withdrawDefenderBeforeBattle(p.state,p.battle.id,c,E,CFG,def.preferredRetreatCityId);data.withdrawLegal=wd.withdrawn; if(wd.withdrawn)return data;}
 let r=B.resolveBattle(p.state,p.battle.id,tactic,c,CFG,E,def?.tactic||'hold_line');let s=r.state;data.firstBand=r.resolution.band;data.firstDecisive=r.resolution.decisive;data.lossA=r.resolution.attacker_loss;data.lossD=r.resolution.defender_loss;data.firstRatio=r.resolution.ratio;
 if(!r.resolution.decisive){
  s=B.continueBattle(s,p.battle.id,E).state;s.calendar.month=7;
  const reinforcementId=reinforce==='own'?sc.reinforcement:reinforce==='enemy'?sc.enemyReinforcement:null;
  if(reinforcementId){
   try{let rr=B.reinforceBattle(s,p.battle.id,[reinforcementId],c,E);s=rr.state;data.reinforcementUsed=true;data.reinfArrival=rr.arrival_rate;}catch(e){data.reinfError=e.message;}
  }
  try{let r2=B.resolveBattle(s,p.battle.id,tactic,c,CFG,E,def?.tactic||'hold_line');data.secondBand=r2.resolution.band;data.secondDecisive=r2.resolution.decisive;data.secondRatio=r2.resolution.ratio;data.secondWinner=r2.resolution.decisive?(['victory','major_victory'].includes(r2.resolution.band)?'attacker':['defeat','major_defeat'].includes(r2.resolution.band)?'defender':'other'):'none';data.secondLossA=r2.resolution.attacker_loss;data.secondLossD=r2.resolution.defender_loss;}catch(e){data.secondError=e.message;}
 }
 return data;
}
function aggregate(){const rows=[];for(const sc of plans){for(const x of [.85,.95,1.05,1.15,1.25,1.35,1.5]){const rec=tune(sc,x),arr=[];for(let seed=1;seed<=16;seed++)arr.push(trial(sc,x,seed,'normal_attack','own'));
 const tab={scenario:sc.label,raw_target:x,raw_actual:Math.round(rec.ratio*1000)/1000,attacker_manpower:rec.manpower,simulations:arr.length,prewithdraw:arr.filter(y=>y.prewithdraw&&y.withdrawLegal).length,prewithdraw_decision:arr.filter(y=>y.prewithdraw).length,first_not_decisive:arr.filter(y=>y.firstDecisive===false).length,first_lossA_avg:Math.round(arr.reduce((n,y)=>n+(y.lossA||0),0)/arr.length),first_lossD_avg:Math.round(arr.reduce((n,y)=>n+(y.lossD||0),0)/arr.length),second_played:arr.filter(y=>y.secondBand).length,second_win_attacker:arr.filter(y=>y.secondWinner==='attacker').length,second_win_defender:arr.filter(y=>y.secondWinner==='defender').length,second_draw:arr.filter(y=>y.secondWinner==='none').length,reinforcement_added:arr.filter(y=>y.reinforcementUsed).length,errors:arr.filter(y=>y.reinfError||y.secondError).map(y=>y.reinfError||y.secondError).slice(0,4)};rows.push(tab);}
}
let tactics=[];for(const sc of plans){for(const x of [1.05,1.15,1.25])for(const tactic of ['normal_attack','war_of_attrition','all_out_attack'])for(const reinforce of ['none','own','enemy']){let arr=[];for(let seed=101;seed<=109;seed++)arr.push(trial(sc,x,seed,tactic,reinforce));tactics.push({scenario:sc.label,raw_target:x,tactic,reinforce,total:arr.length,prewithdraw:arr.filter(y=>y.prewithdraw&&y.withdrawLegal).length,initial_stalemate:arr.filter(y=>y.firstDecisive===false).length,win_2:arr.filter(y=>y.secondWinner==='attacker').length,loss_2:arr.filter(y=>y.secondWinner==='defender').length,unresolved_2:arr.filter(y=>y.secondWinner==='none').length,reinforce_success:arr.filter(y=>y.reinforcementUsed).length,errors:arr.filter(y=>y.reinfError||y.secondError).length});}}
return {baselineCommit:'77b50bdd10f096991e8c466182a40ed20d42cbf5',source:'zip_beta5_matching_beta6_AI',method:'engine 1st round plus engine 2nd round without supply/monthly attrition or opponent actions',rows,tactics};
}
if(require.main===module){const out=aggregate();fs.writeFileSync('/mnt/data/BTS_STAGE3_COMBAT_MONTE_CARLO_20261019.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out.rows,null,2));}
module.exports={mk,prepare,tune,trial,plans,ctx};
