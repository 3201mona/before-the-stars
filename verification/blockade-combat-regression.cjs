'use strict';
// Production-engine regression for the active-battle blockade lifecycle.
// Deliberately tiny and deterministic: no AI Monte Carlo or long campaign.
const assert=require('node:assert/strict');
const {ctx,mk,prepare,plans}=require('./stage3-battle-scenario.cjs');
const {NavalControlEngine:N,PoliticalPhaseEngine:P,BattleEngine:B,ArmyPhase2Engine:E,PHASE2_CONFIG:CFG,POLITICAL_PHASE_CONFIG:PC}=ctx;
const clone=x=>JSON.parse(JSON.stringify(x)),period='1775-06';
let checks=0;function check(label,fn){fn();checks++;console.log('PASS',label);}

function runBattleCase(label,sc,blockader){
 const {m,c}=mk(sc,29);
 // Stage3's British setup puts its HQ in Plymouth, the reverse-test target.
 // Move that unrelated friendly army away from the port.
 if(blockader==='BRITISH')m.field_armies[sc.attackerHQ].location_city_id='NY_04';
 for(const [id,city] of Object.entries(c.cities))city.politics.military_control=P.militaryControl(m,id,PC);
 const target=c.cities[sc.target],zone=target.geography.sea_zone_id,enemy=blockader==='PATRIOT'?'BRITISH':'PATRIOT';
 check(label+' opening port belongs to the blockaded faction',()=>{
  assert.equal(target.politics.military_control,enemy);
  assert.equal(target.geography.is_port,true);
 });
 // A legal naval operation, not a directly fabricated blockaded_by field.
 c.naval_control.zones[zone].factors[blockader].fleet=50;
 c.naval_control.zones[zone].factors[enemy].fleet=0;
 let cities=N.activateOperation(c,zone,blockader,'BLOCKADE',period,{target_city_id:sc.target}).state;
 check(label+' blockade active before battle',()=>{
  assert.equal(cities.cities[sc.target].naval.blockaded_by,blockader);
  assert.equal(N.isPortOperational(cities.cities[sc.target]),false);
 });
 const battle=prepare(m,cities,sc);
 for(const [id,city] of Object.entries(cities.cities))city.politics.military_control=P.militaryControl(battle.state,id,PC);
 check(label+' during active battle is CONFLICT',()=>assert.equal(cities.cities[sc.target].politics.military_control,'CONFLICT'));
 const recalculated=N.recalculateAll(cities,period,'交戦中の港湾網再計算');cities=recalculated.state;
 check(label+' does not prematurely unblock combat port',()=>{
  assert.equal(cities.cities[sc.target].naval.blockaded_by,blockader);
  assert(!recalculated.events.some(e=>e.city_id===sc.target&&e.reason==='BLOCKADE_ENDED'));
 });
 check(label+' port network still records an active blockade',()=>{
  assert(N.portNetwork(cities,zone).disabled.some(item=>item.city_id===sc.target&&item.reason==='BLOCKADED'));
 });
 check(label+' sea retreat availability API rejects the origin port',()=>{
  const option=N.seaRetreatCandidates(cities,sc.target,enemy,period);
  assert.equal(option.available,false);assert.equal(option.reason,'ORIGIN_PORT_UNAVAILABLE');
 });
 const landPlan=B.selectRetreatPlan(battle.state,cities,battle.battle,enemy,E,battle.battle.defender_army_ids,CFG.battle_engine);
 check(label+' legitimate land retreat remains possible',()=>{
  assert(landPlan, 'no legal land retreat in this deterministic fixture');assert.equal(landPlan.mode,'LAND');
 });
 const noLand=clone(cities);noLand.topology.edges=[];
 const defenders=battle.battle.defender_army_ids;
 const retreat=B.selectRetreatPlan(battle.state,noLand,battle.battle,enemy,E,defenders,CFG.battle_engine);
 check(label+' enemy cannot choose a sea retreat',()=>assert(!retreat||retreat.mode!=='SEA',JSON.stringify(retreat)));
 const attempted=B.withdrawDefenderBeforeBattle(battle.state,battle.battle.id,noLand,E,CFG);
 check(label+' actual before-battle retreat is denied without land routes',()=>{
  assert.equal(attempted.withdrawn,false);assert.equal(attempted.reason,'NO_WITHDRAWAL_DESTINATION');
 });
 const ongoing=clone(battle.state);ongoing.battles[battle.battle.id].status='awaiting_continuation';
 ongoing.battles[battle.battle.id].history=[{result_band:'stalemate'}];
 const lateAttempt=B.withdrawBattle(ongoing,battle.battle.id,enemy,noLand,E,CFG);
 check(label+' voluntary retreat during a continuing battle is also denied',()=>{
  assert.equal(lateAttempt.withdrawn,false);assert.equal(lateAttempt.reason,'NO_WITHDRAWAL_DESTINATION');
 });
 const captured=clone(cities);captured.cities[sc.target].politics.military_control=blockader;
 const ended=N.recalculateAll(captured,period,'敵都市の占領');
 check(label+' ends blockade after actual occupation',()=>{
  assert.equal(ended.state.cities[sc.target].naval.blockaded_by,null);
  assert(ended.events.some(e=>e.city_id===sc.target&&e.reason==='BLOCKADE_ENDED'));
 });
 const evacuated=clone(cities);evacuated.cities[sc.target].politics.military_control='UNCONTROLLED';
 check(label+' still clears blockade after port is truly abandoned',()=>{
  assert.equal(N.recalculateAll(evacuated,period).state.cities[sc.target].naval.blockaded_by,null);
 });
 const navalLost=clone(cities);navalLost.naval_control.zones[zone].factors[blockader].fleet=0;navalLost.naval_control.zones[zone].factors[enemy].fleet=50;
 check(label+' ends blockade if naval supremacy is lost',()=>{
  assert.equal(N.recalculateAll(navalLost,period).state.cities[sc.target].naval.blockaded_by,null);
 });
 check(label+' expires the operation in the following month',()=>{
  assert.equal(N.expirePeriod(cities,'1775-07').state.cities[sc.target].naval.blockaded_by,null);
 });
}

runBattleCase('PATRIOT blockades British Boston',plans.find(s=>s.label==='patriot_into_boston'),'PATRIOT');
runBattleCase('BRITISH blockades Patriot Plymouth',{
 ...plans.find(s=>s.label==='british_into_worcester'),origin:'MA_03',target:'MA_04'
},'BRITISH');
console.log('BLOCKADE_COMBAT_REGRESSION',checks,'/',checks);
