'use strict';
// Bounded deterministic engine regressions; deliberately no years-long autoplay.
const assert=require('node:assert/strict');
const {ctx,mk,prepare,plans}=require('./stage3-battle-scenario.cjs');
const path=require('node:path');
const runtime=path.resolve(__dirname,'../runtime');
const N=ctx.NavalControlEngine,E=ctx.ArmyPhase2Engine,B=ctx.BattleEngine,P=ctx.PoliticalPhaseEngine,PC=ctx.POLITICAL_PHASE_CONFIG,CFG=ctx.PHASE2_CONFIG;
const M=require(path.join(runtime,'blockade_maintenance_controller_v1.js'));
const Marker=require(path.join(runtime,'battle_army_marker_model_v1.js'));
const Route=require(path.join(runtime,'strategy_battle_map_model_v1.js'));
const clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;const test=(label,fn)=>{fn();checks++;console.log('PASS',label);};
function fixture(sc,blockader){
  const {m,c}=mk(sc,33);if(blockader==='BRITISH')m.field_armies[sc.attackerHQ].location_city_id='NY_04';
  for(const [id,city]of Object.entries(c.cities))city.politics.military_control=P.militaryControl(m,id,PC);
  const city=c.cities[sc.target],zone=city.geography.sea_zone_id,enemy=N.enemyFaction(blockader);
  c.naval_control.zones[zone].factors[blockader].fleet=50;c.naval_control.zones[zone].factors[enemy].fleet=0;
  const blocked=N.activateOperation(c,zone,blockader,'BLOCKADE','1775-06',{target_city_id:sc.target}).state;
  m.field_armies[sc.attacker].manpower=18000;
  const p=prepare(m,blocked,sc);for(const [id,entry]of Object.entries(blocked.cities))entry.politics.military_control=P.militaryControl(p.state,id,PC);
  const military=E.advanceMonth(p.state,CFG);
  return{city:blocked,military,zone,target:sc.target,blockader,enemy,battleId:p.battle.id};
}
for(const [label,scenario,blockader]of [
  ['独立派',plans.find(s=>s.label==='patriot_into_boston'),'PATRIOT'],
  ['王党派',{...plans.find(s=>s.label==='british_into_worcester'),origin:'MA_03',target:'MA_04'},'BRITISH']
]){
  const f=fixture(scenario,blockader);
  test(label+' 軍の主力が進攻中なら封鎖は翌月の判断まで保持',()=>{
    const result=N.prepareMonthlyBlockadeMaintenance(f.city,f.military,'1775-07');
    assert.equal(result.pending.length,1);
    assert.equal(result.state.cities[f.target].naval.blockaded_by,blockader);
    assert.equal(N.expirePeriod(result.state,'1775-07').state.cities[f.target].naval.blockaded_by,blockader);
    assert.equal(N.seaRetreatCandidates(result.state,f.target,f.enemy,'1775-07').available,false);
  });
  test(label+' プレイヤー維持はコマンド1・翌月封鎖を確定',()=>{
    const prepared=N.prepareMonthlyBlockadeMaintenance(f.city,f.military,'1775-07');
    const result=M.resolve(prepared.state,f.military,prepared.pending[0],true,'1775-07',N,E);
    assert.equal(result.kept,true);
    assert.equal(result.military.factions[blockader].commands_remaining,f.military.factions[blockader].commands_remaining-1);
    assert.equal(result.city.cities[f.target].naval.blockade_period,'1775-07');
    assert.equal(result.city.cities[f.target].naval.blockade_pending_period,null);
    assert.equal(N.seaRetreatCandidates(result.city,f.target,f.enemy,'1775-07').available,false);
    assert.throws(()=>M.resolve(result.city,result.military,prepared.pending[0],true,'1775-07',N,E),/NOT_PENDING/);
  });
  test(label+' 維持拒否で封鎖が解け、コマンド非消費',()=>{
    const prepared=N.prepareMonthlyBlockadeMaintenance(f.city,f.military,'1775-07');
    const result=M.resolve(prepared.state,f.military,prepared.pending[0],false,'1775-07',N,E);
    assert.equal(result.kept,false);assert.equal(result.city.cities[f.target].naval.blockaded_by,null);
    assert.equal(result.military.factions[blockader].commands_remaining,f.military.factions[blockader].commands_remaining);
  });
  test(label+' 戦闘終了または制海権喪失なら延長不可',()=>{
    const resolved=clone(f.military);resolved.battles[f.battleId].status='resolved';
    assert.equal(N.prepareMonthlyBlockadeMaintenance(f.city,resolved,'1775-07').pending.length,0);
    const lost=clone(f.city);lost.naval_control.zones[f.zone].factors[blockader].fleet=0;lost.naval_control.zones[f.zone].factors[f.enemy].fleet=50;
    assert.equal(N.prepareMonthlyBlockadeMaintenance(lost,f.military,'1775-07').pending.length,0);
  });
  test(label+' AIは実コマンドを消費して維持、兵力劣勢なら解除',()=>{
    const ai=clone(f.military);ai.player_faction=f.enemy;
    const good=M.monthStart(f.city,ai,'1775-07',N,E);
    assert.equal(good.decisions.length,1);assert.equal(good.decisions[0].kept,true);
    assert.equal(good.military.factions[blockader].commands_remaining,ai.factions[blockader].commands_remaining-1);
    const bad=clone(ai);bad.field_armies[scenario.attacker].manpower=10;
    const dropped=M.monthStart(f.city,bad,'1775-07',N,E);
    assert.equal(dropped.decisions[0].kept,false);assert.equal(dropped.city.cities[f.target].naval.blockaded_by,null);
  });
}
for(const mode of ['LAND','SEA']){
  const sc=plans[0],{m,c}=mk(sc,55),p=prepare(m,c,sc),s=clone(p.state),b=s.battles[p.battle.id],army=s.field_armies[sc.reinforcement];
  b.status='awaiting_continuation';b.history=[{result_band:'stalemate'}];
  b.attacker_army_ids.push(army.id);b.attacker_reinforcement_ids=[army.id];
  b.reinforcement_origins={[army.id]:{origin_city_id:army.location_city_id,route_mode:mode}};
  army.battle_id=b.id;army.supply_city_id=army.location_city_id;army.reinforcement_route_mode=mode;
  const from=army.location_city_id,to=b.city_id;
  test(mode+' 援軍元が敵に落ちても戦場の旗と出発元の矢印が残る',()=>{
    const before=Marker.displayLocation(s,army);assert.equal(before.city_id,to);assert.equal(before.origin_city_id,from);
    assert.equal(before.reinforcement,true);
    assert.equal(Marker.displayLocation(s,s.field_armies[sc.attacker]).reinforcement,false,'主攻軍を援軍と誤表示しない');
    assert(Marker.markerGroups(s)[to].some(item=>item.army.id===army.id));
    assert(Route.collectRoutes(s).some(item=>item.kind==='REINFORCEMENT'&&item.origin===from&&item.target===to&&item.army_ids.includes(army.id)));
    s.garrisons[from].faction='BRITISH';s.garrisons[from].manpower=500;
    s.city_logistics[from].military_control='BRITISH';
    assert(Marker.markerGroups(s)[to].some(item=>item.army.id===army.id));
    assert(Route.collectRoutes(s).some(item=>item.kind==='REINFORCEMENT'&&item.army_ids.includes(army.id)));
    assert(s.field_armies[army.id],'army deleted by map policy');
  });
  test(mode+' 真の部隊崩壊時には原因を説明するアクション記録',()=>{
    army.morale=8;army.supply_cut=true;army.supply_cut_reason='SUPPLY_SOURCE_CONTROL_LOST';
    const r=E.applyBattleSupplyCutMonthEffects(s,CFG);
    assert.equal(r.state.field_armies[army.id],undefined);
    const event=r.state.action_log.find(item=>item.type==='FIELD_ARMY_ROUTED'&&item.army_id===army.id);
    assert(event);assert.equal(event.army_name,army.name);assert.equal(event.faction,'PATRIOT');
    assert.equal(event.battle_city_id,to);assert.equal(event.city_id,from);
  });
}
console.log('MONTHLY_BLOCKADE_REINFORCEMENT_REGRESSION',checks,'/',checks);
