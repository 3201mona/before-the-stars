'use strict';
// Bounded production-engine test of port access versus coastal combat landing.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {ctx,mk,prepare,plans}=require('./stage3-battle-scenario.cjs');
const {NavalControlEngine:N,CityCommandEngine:C,BattleEngine:B,ArmyPhase2Engine:E,PoliticalPhaseEngine:P,POLITICAL_PHASE_CONFIG:PC,PHASE2_CONFIG:CFG}=ctx;
const M=require('../runtime/blockade_maintenance_controller_v1.js');
const clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
function fixture(blockader='PATRIOT'){
  const sc=blockader==='PATRIOT'?plans[0]:{...plans[1],target:'MA_04'};
  const {m,c}=mk(sc,57);
  if(blockader==='BRITISH')m.field_armies[sc.attackerHQ].location_city_id='NY_04';
  for(const id of [sc.reinforcement,sc.enemyReinforcement]){
    const army=m.field_armies[id];army.location_city_id=army.faction==='PATRIOT'?'NY_02':'VA_04';
  }
  for(const [id,city]of Object.entries(c.cities))city.politics.military_control=P.militaryControl(m,id,PC);
  const zone=c.cities[sc.target].geography.sea_zone_id,enemy=N.enemyFaction(blockader);
  c.naval_control.zones[zone].factors[blockader].fleet=50;
  c.naval_control.zones[zone].factors[enemy].fleet=0;
  let city=N.activateOperation(c,zone,blockader,'BLOCKADE','1775-06',{target_city_id:sc.target}).state;
  const p=prepare(m,city,sc),military=p.state,battle=military.battles[p.battle.id];
  battle.status='awaiting_continuation';battle.history=[{result_band:'stalemate'}];
  city.cities[sc.target].politics.military_control='CONFLICT';
  city=N.recalculateAll(city,'1775-06').state;
  return{sc,city,military,battleId:p.battle.id,zone,blockader,enemy};
}
for(const blockader of ['PATRIOT','BRITISH']){
  const f=fixture(blockader),target=f.city.cities[f.sc.target];
  check(blockader+' 港湾封鎖は退路と通常港湾利用を停止する',()=>{
    assert.equal(N.portStatus(target).reason,'BLOCKADED');
    assert.equal(N.isPortOperational(target),false);
    assert.equal(N.seaRetreatCandidates(f.city,f.sc.target,f.enemy,'1775-06').available,false);
    assert.equal(N.coastalBattleLandingStatus(target).mode,'COASTAL_LANDING');
    assert(!C.seaCandidates(f.city,'NY_02',[],'SEA_TRANSPORT').includes(f.sc.target));
  });
  for(const [role,id]of [['封鎖側',f.sc.reinforcement],['被封鎖側',f.sc.enemyReinforcement]]){
    // In the British scenario the original reinforcement IDs have opposite roles.
    const actual=f.military.field_armies[id].faction===blockader?'封鎖側':'被封鎖側';
    check(blockader+' '+actual+' 強行上陸と即時補給判定',()=>{
      const army=f.military.field_armies[id],before=army.manpower,commands=f.military.factions[army.faction].commands_remaining;
      const sea=N.seaRouteProfile(f.city,f.city.cities[army.location_city_id].geography.sea_zone_id,target.geography.sea_zone_id,army.faction,'SEA_TRANSPORT','1775-06');
      const out=B.reinforceBattle(f.military,f.battleId,[id],f.city,E),after=out.state.field_armies[id],meta=out.battle.reinforcement_origins[id];
      assert.equal(out.route_mode,'SEA');assert.equal(out.arrival_access_mode,'COASTAL_LANDING');
      assert.equal(meta.arrival_access_reason,'BLOCKADED');assert.equal(out.command_cost,1);
      assert.equal(out.state.factions[army.faction].commands_remaining,commands-1);
      assert.equal(after.manpower,Math.max(1,Math.floor(before*sea.arrival_rate)));
      assert.equal(after.sea_supply_blockaded===true,actual==='被封鎖側');
      const effect=E.applyBattleSupplyCutMonthEffects(out.state,CFG).state.field_armies[id];
      assert.equal(effect.morale,after.morale-(actual==='被封鎖側'?16:0));
    });
  }
  check(blockader+' 継続維持の翌月も強行上陸可能',()=>{
    const next=E.advanceMonth(f.military,CFG),pending=N.prepareMonthlyBlockadeMaintenance(f.city,next,'1775-07');
    assert.equal(pending.pending.length,1);
    const kept=M.resolve(pending.state,next,pending.pending[0],true,'1775-07',N,E);
    assert.equal(kept.kept,true);
    const result=B.reinforceBattle(kept.military,f.battleId,[f.sc.reinforcement],kept.city,E);
    assert.equal(result.arrival_access_mode,'COASTAL_LANDING');
  });
  check(blockader+' 都市被害大は港閉鎖だが海岸上陸は許可',()=>{
    const damaged=clone(f.city),city=damaged.cities[f.sc.target];
    city.naval.blockaded_by=null;city.naval.blockade_period=null;city.condition.damage_severity=3;
    assert.equal(N.portStatus(city).reason,'MAJOR_CITY_DAMAGE');
    const out=B.reinforceBattle(f.military,f.battleId,[f.sc.enemyReinforcement],damaged,E);
    assert.equal(out.arrival_access_mode,'COASTAL_LANDING');
    assert.equal(out.arrival_access_reason,'MAJOR_CITY_DAMAGE');
    assert.equal(out.state.field_armies[f.sc.enemyReinforcement].sea_supply_blockaded===true,false,'damage is not enemy blockade');
  });
}
const sample=fixture('PATRIOT');
check('港が正常なら通常の港湾到着として分類',()=>{
  const city=clone(sample.city);city.cities[sample.sc.target].naval.blockaded_by=null;
  assert.equal(N.coastalBattleLandingStatus(city.cities[sample.sc.target]).mode,'PORT');
  assert.equal(B.reinforceBattle(sample.military,sample.battleId,[sample.sc.reinforcement],city,E).arrival_access_mode,'PORT');
});
check('陸接援軍は海上処理に入らない',()=>{
  const f=fixture('PATRIOT');f.military.field_armies[f.sc.reinforcement].location_city_id='MA_04';
  const out=B.reinforceBattle(f.military,f.battleId,[f.sc.reinforcement],f.city,E);
  assert.equal(out.route_mode,'LAND');assert.equal(out.arrival_access_mode,null);
  assert.equal(out.arrival_rate,1);
});
check('内陸・上陸専用・損壊港の分類は異なる',()=>{
  const city=sample.city;
  assert.equal(N.coastalBattleLandingStatus(city.cities.MA_02).available,false);
  assert.equal(N.coastalBattleLandingStatus(city.cities.CT_02).reason,'NOT_A_PORT');
  assert.equal(N.coastalBattleLandingStatus(city.cities.CT_02).mode,'COASTAL_LANDING');
});
check('上陸専用地点への初期攻撃と継続戦闘援軍も同じ経路',()=>{
  const sc={...plans[0],origin:'RI_01',target:'CT_02',reinfOrigin:'NY_02'};
  const {m,c}=mk(sc,85);
  m.field_armies[sc.reinforcement].location_city_id='NY_02';
  for(const [id,city]of Object.entries(c.cities))city.politics.military_control=P.militaryControl(m,id,PC);
  assert(C.getCommandCandidates(c,{command_type:'LANDING_ATTACK',origin_city_id:sc.origin,faction:'PATRIOT'}).includes(sc.target));
  const p=B.prepareBattle(m,{origin_city_id:sc.origin,city_id:sc.target,attacker_army_ids:[sc.attacker],leader_army_id:sc.attacker,route_type:'LANDING_ATTACK'},c,CFG);
  assert.equal(p.battle.landing_access.mode,'COASTAL_LANDING');
  assert.equal(p.battle.landing_access.reason,'NOT_A_PORT');
  assert.equal(N.seaRetreatCandidates(c,sc.target,'BRITISH','1775-06').available,false);
  p.state.battles[p.battle.id].status='awaiting_continuation';
  p.state.battles[p.battle.id].history=[{result_band:'stalemate'}];
  const out=B.reinforceBattle(p.state,p.battle.id,[sc.reinforcement],c,E);
  assert.equal(out.route_mode,'SEA');assert.equal(out.arrival_access_mode,'COASTAL_LANDING');
  assert.equal(out.arrival_access_reason,'NOT_A_PORT');
});
check('上陸攻撃の稼働港・封鎖港・損壊港を区別',()=>{
  const f=fixture('PATRIOT'),m=clone(f.military),c=clone(f.city);
  delete m.battles[f.battleId];m.field_armies[f.sc.attacker].battle_id=null;
  const id=f.sc.reinforcement;m.field_armies[id].battle_id=null;
  const from=m.field_armies[id].location_city_id,to=f.sc.target;
  for(const [reason,change]of [['BLOCKADED',()=>{}],['MAJOR_CITY_DAMAGE',()=>{c.cities[to].naval.blockaded_by=null;c.cities[to].condition.damage_severity=3;}],['OPERATIONAL',()=>{c.cities[to].condition.damage_severity=0;}]]){
    change();const p=B.prepareBattle(m,{origin_city_id:from,city_id:to,attacker_army_ids:[id],leader_army_id:id,route_type:'LANDING_ATTACK'},c,CFG);
    assert.equal(p.battle.landing_access.reason,reason);
  }
});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../runtime/continuation_battle_ai_v1.js'),'utf8'),ctx);
check('AIも封鎖港を強行上陸候補と認識し、到着率を維持',()=>{
  const f=fixture('PATRIOT'),groups=ctx.__continuationBattleAiV1.reinforcementGroups(f.military,f.city,f.military.battles[f.battleId],'BRITISH');
  assert(groups.some(g=>g.mode==='SEA'&&g.arrival_access_mode==='COASTAL_LANDING'));
});
check('敵味方が強行上陸した継続戦闘を再開・解決できる',()=>{
  const f=fixture('PATRIOT');
  let s=B.reinforceBattle(f.military,f.battleId,[f.sc.reinforcement],f.city,E).state;
  s=B.reinforceBattle(s,f.battleId,[f.sc.enemyReinforcement],f.city,E).state;
  s=B.continueBattle(s,f.battleId,E).state;
  const out=B.resolveBattle(s,f.battleId,'normal_attack',f.city,CFG,E,'hold_line');
  assert(out.resolution);assert(['resolved','awaiting_continuation'].includes(out.battle.status));
  assert.equal(out.battle.history.length,2);
});
check('強行上陸の記録はJSON保存復元後も補給判定と共存',()=>{
  const f=fixture('BRITISH');
  const id=f.sc.enemyReinforcement;
  const saved=JSON.stringify(B.reinforceBattle(f.military,f.battleId,[id],f.city,E).state);
  const loaded=JSON.parse(saved),meta=loaded.battles[f.battleId].reinforcement_origins[id];
  assert.equal(meta.arrival_access_mode,'COASTAL_LANDING');
  assert.equal(meta.arrival_access_reason,'BLOCKADED');
  assert.equal(loaded.field_armies[id].battle_id,f.battleId);
  assert.equal(E.battleSupplyStatus(loaded,id).connected,false);
});
check('強行上陸軍の海岸からの再乗船は本隊の封鎖港脱出を許さない',()=>{
  const f=fixture('PATRIOT'),id=f.sc.enemyReinforcement;
  const s=B.reinforceBattle(f.military,f.battleId,[id],f.city,E).state;
  const noLand=clone(f.city);noLand.topology.edges=[];
  const denied=B.withdrawBattle(s,f.battleId,'BRITISH',noLand,E,CFG);
  assert.equal(denied.withdrawn,false);
  assert.equal(denied.reason,'NO_WITHDRAWAL_DESTINATION');
  const allowed=B.withdrawBattle(s,f.battleId,'BRITISH',f.city,E,CFG);
  assert.equal(allowed.withdrawn,true);
  assert.equal(allowed.withdrawal.mode,'LAND');
  const shore=allowed.reinforcement_moves.find(move=>move.army_id===id);
  assert(shore);assert.equal(shore.route_class,'REINFORCEMENT_ORIGIN_SEA');
  assert(shore.transit_loss>0,'the beach extraction is exposed to sea-control losses');
});
console.log('FORCED_COASTAL_BATTLE_REGRESSION',checks,'/',checks);
