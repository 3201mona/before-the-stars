'use strict';
// Deterministic, bounded sequence audit of the *unchanged* beta9 engine.
// The city-capture and forced-end variations explicitly insert the aftermath
// of other commands; they are not claims of full AI-played conquest.
const assert=require('node:assert/strict');
const {ctx,mk,prepare,plans}=require('./stage3-battle-scenario.cjs');
const N=ctx.NavalControlEngine,B=ctx.BattleEngine,E=ctx.ArmyPhase2Engine;
const P=ctx.PoliticalPhaseEngine,PC=ctx.POLITICAL_PHASE_CONFIG,CFG=ctx.PHASE2_CONFIG;
const Marker=require('../runtime/battle_army_marker_model_v1.js');
const Map=require('../runtime/strategy_battle_map_model_v1.js');
const Maintenance=require('../runtime/blockade_maintenance_controller_v1.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const other=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
let assertions=0,scenarios=0;
const ok=(condition,message)=>{assert.ok(condition,message);assertions++;};
const eq=(actual,want,message)=>{assert.equal(actual,want,message);assertions++;};
const ACTIVE=new Set(['awaiting_tactic','active','awaiting_continuation']);

function validate(s,stage){
  const markers=Marker.markerGroups(s),routes=Map.collectRoutes(s);
  const allMarkers=Object.values(markers).flat().map(x=>x.army.id);
  eq(allMarkers.length,new Set(allMarkers).size,stage+': duplicate field army flag');
  for(const a of Object.values(s.field_armies||{})){
    if(Number(a.manpower||0)<=0)continue;
    const b=s.battles?.[a.battle_id],engaged=Boolean(b&&ACTIVE.has(b.status));
    const display=Marker.displayLocation(s,a),expected=engaged?b.city_id:a.location_city_id;
    eq(display.city_id,expected,stage+': wrong flag city '+a.id);
    eq((markers[expected]||[]).filter(x=>x.army.id===a.id).length,1,stage+': flag missing '+a.id);
    eq(display.engaged,engaged,stage+': engagement mismatch '+a.id);
    if(engaged){
      const listed=(a.faction===b.attacker_faction?b.attacker_army_ids:b.defender_army_ids)||[];
      ok(listed.includes(a.id),stage+': battling army absent from roster '+a.id);
      if(Map.ongoing(b)){
        const meta=b.reinforcement_origins?.[a.id];
        if(meta){
          ok(routes.some(r=>r.kind==='REINFORCEMENT'&&r.battle_id===b.id&&r.origin===meta.origin_city_id&&r.target===b.city_id&&r.mode===meta.route_mode&&r.army_ids.includes(a.id)),stage+': reinforcement arrow absent '+a.id);
        }else if(a.faction===b.attacker_faction){
          ok(routes.some(r=>r.kind==='MAIN'&&r.battle_id===b.id&&r.origin===b.origin_city_id&&r.target===b.city_id&&r.army_ids.includes(a.id)),stage+': main attack arrow absent '+a.id);
        }
      }
    }
  }
  for(const route of routes){
    const b=s.battles[route.battle_id];
    ok(Map.ongoing(b),stage+': stale resolved arrow');
    for(const id of route.army_ids){
      const a=s.field_armies[id];
      ok(a&&a.battle_id===b.id,stage+': arrow references dead/non-engaged army '+id);
      eq(Marker.displayLocation(s,a).city_id,route.target,stage+': arrow points away from flag '+id);
    }
  }
}

function fixture(blockader,targetMode){
  const sc=blockader==='PATRIOT'?{...plans[0]}:{...plans[1],target:'MA_04'};
  const {m,c}=mk(sc,89);
  // British HQ may occupy the Patriot target in the generic fixture.
  if(blockader==='BRITISH')m.field_armies[sc.attackerHQ].location_city_id='NY_04';
  for(const [id,city] of Object.entries(c.cities))city.politics.military_control=P.militaryControl(m,id,PC);
  const target=c.cities[sc.target],zone=target.geography.sea_zone_id;
  c.naval_control.zones[zone].factors[blockader].fleet=50;
  c.naval_control.zones[zone].factors[other(blockader)].fleet=0;
  let city;
  if(targetMode==='BLOCKADED')city=N.activateOperation(c,zone,blockader,'BLOCKADE','1775-06',{target_city_id:sc.target}).state;
  else {city=clone(c);if(targetMode==='DAMAGED')city.cities[sc.target].condition.damage_severity=3;}
  const p=prepare(m,city,sc),s=p.state;
  s.battles[p.battle.id].status='awaiting_continuation';
  s.battles[p.battle.id].history=[{result_band:'even',decisive:false,month:'1775-06'}];
  city.cities[sc.target].politics.military_control='CONFLICT';
  return {s,c:city,battleId:p.battle.id,sc,blockader};
}

function reinforce(f,role,mode){
  const id=role==='ATTACKER'?f.sc.reinforcement:f.sc.enemyReinforcement;
  const faction=role==='ATTACKER'?f.blockader:other(f.blockader);
  const target=f.c.cities[f.sc.target];
  const landOrigin=f.blockader==='PATRIOT'?(role==='ATTACKER'?'MA_04':'CT_03'):(role==='ATTACKER'?'CT_03':'RI_01');
  const origin=mode==='SEA'?(faction==='PATRIOT'?'NY_02':'VA_04'):landOrigin;
  f.s.field_armies[id].location_city_id=origin;
  f.s.field_armies[id].acted_this_month=false;
  const before=f.s.field_armies[id].manpower;
  const commands=f.s.factions[faction].commands_remaining;
  const out=B.reinforceBattle(f.s,f.battleId,[id],f.c,E);
  f.s=out.state;
  eq(out.route_mode,mode,'route '+f.blockader+'/'+role+'/'+mode);
  eq(out.command_cost,1,'command cost');
  eq(f.s.factions[faction].commands_remaining,commands-1,'spending '+faction);
  if(mode==='LAND')eq(f.s.field_armies[id].manpower,before,'land must be lossless');
  else {
    ok(f.s.field_armies[id].manpower<=before,'sea arrival should not add soldiers');
    eq(out.arrival_access_mode,targetMode(f.c,f.sc.target)==='OPERATIONAL'?'PORT':'COASTAL_LANDING','coastal mode');
    eq(Boolean(f.s.field_armies[id].sea_supply_blockaded),target.naval.blockaded_by===other(faction),'blockade supply side');
  }
  return {id,origin,role,mode};
}
function targetMode(city,id){const port=N.portStatus(city.cities[id]);return port.reason;}

function captureSource(f,cityId,occupier){
  const originalControl=P.militaryControl(f.s,cityId,PC);
  f.s.garrisons[cityId].faction=occupier;
  f.s.garrisons[cityId].manpower=800;
  f.c.cities[cityId].politics.military_control=P.militaryControl(f.s,cityId,PC);
  eq(f.c.cities[cityId].politics.military_control,occupier,'source capture control '+cityId+' was '+originalControl);
  const cut=E.cutBattleSupplyFromCity(f.s,cityId,other(occupier),'SUPPLY_SOURCE_CAPTURED');
  f.s=cut.state;
  return cut;
}

function endBattle(f,who){
  const b=f.s.battles[f.battleId];
  if(who==='ATTACKER'){
    for(const id of b.defender_army_ids)if(f.s.field_armies[id])f.s.field_armies[id].manpower=0;
    f.s.garrisons[b.city_id].manpower=0;
  }else{
    for(const id of b.attacker_army_ids)if(f.s.field_armies[id])f.s.field_armies[id].morale=9;
  }
  f.s=B.continueBattle(f.s,f.battleId,E).state;
  const out=B.resolveBattle(f.s,f.battleId,'normal_attack',f.c,CFG,E,'hold_line');
  f.s=out.state;
  ok(out.resolution.decisive,'forced resolution not decisive');
  eq(out.battle.status,'resolved','battle end status');
  eq(out.resolution.band.startsWith('major_')||['victory','defeat'].includes(out.resolution.band),true,'end band');
  for(const army of Object.values(f.s.field_armies)){
    ok(army.battle_id!==f.battleId,'battle survivor stuck after resolution '+army.id);
  }
  ok(!Map.collectRoutes(f.s).some(r=>r.battle_id===f.battleId),'battle arrows linger after finalization');
}

for(const blockader of ['PATRIOT','BRITISH'])
for(const mode of ['BLOCKADED','DAMAGED','OPERATIONAL'])
for(const combination of [['LAND','LAND'],['LAND','SEA'],['SEA','LAND'],['SEA','SEA']])
for(const capture of ['NONE','REINFORCEMENTS','MAIN','BOTH']){
  const f=fixture(blockader,mode),tag=`${blockader}/${mode}/${combination.join('+')}/${capture}`;
  try{
    validate(f.s,tag+' initial');
    const att=reinforce(f,'ATTACKER',combination[0]);
    const def=reinforce(f,'DEFENDER',combination[1]);
    validate(f.s,tag+' both sides joined');
    if(capture==='REINFORCEMENTS'||capture==='BOTH'){
      if(att.origin!==f.sc.origin)captureSource(f,att.origin,other(f.blockader));
      if(def.origin!==f.sc.origin&&def.origin!==att.origin)captureSource(f,def.origin,f.blockader);
    }
    if(capture==='MAIN'||capture==='BOTH')captureSource(f,f.sc.origin,other(f.blockader));
    validate(f.s,tag+' captured');
    // Check that all source-city changes survive a serialized-game round trip.
    f.s=clone(f.s);f.c=clone(f.c);
    validate(f.s,tag+' restored');
    for(const winner of ['ATTACKER','DEFENDER']){
      const g={...f,s:clone(f.s),c:clone(f.c)};
      endBattle(g,winner);
      validate(g.s,tag+' ended/'+winner);
    }
    scenarios++;
  }catch(e){e.message=tag+': '+e.message;throw e;}
}

// Mixed withdrawal, origin capture, alternate shore landing and morale rout.
for(const blockader of ['PATRIOT','BRITISH']){
  const f=fixture(blockader,'BLOCKADED');
  const att=reinforce(f,'ATTACKER','SEA'),def=reinforce(f,'DEFENDER','LAND');
  const original=clone(f.s);
  for(const [side,origin] of [[f.blockader,att.origin],[other(f.blockader),def.origin]]){
    const g={...f,s:clone(original),c:clone(f.c)};
    const out=B.withdrawBattle(g.s,g.battleId,side,g.c,E,CFG);
    ok(out.withdrawn,'withdrawal should have land routes '+side);
    g.s=out.state;
    validate(g.s,'voluntary withdrawal '+side);
    ok(!Map.collectRoutes(g.s).some(r=>r.battle_id===g.battleId),'withdrawal must remove arrows');
  }
  // Both reinforcement origins lost, then sea reinforcement cut to morale 0.
  captureSource(f,att.origin,other(blockader));
  captureSource(f,def.origin,blockader);
  f.s.field_armies[att.id].morale=1;
  const cut=E.applyBattleSupplyCutMonthEffects(f.s,CFG);
  f.s=cut.state;
  eq(Boolean(f.s.field_armies[att.id]),false,'cut reinforcement routed');
  ok(f.s.action_log.some(e=>e.type==='FIELD_ARMY_ROUTED'&&e.army_id===att.id),'rout report must exist');
  validate(f.s,'morale rout '+blockader);
  const g={...f,s:clone(f.s)};
  endBattle(g,'DEFENDER');validate(g.s,'post-rout battle conclusion '+blockader);
  scenarios+=3;
}

// Landing-only combat remains accessible to naval reinforcement, including
// after physical source-city seizure; the target never becomes a port.
for(const faction of ['PATRIOT','BRITISH']){
  const sc=faction==='PATRIOT'?{...plans[0],origin:'RI_01',target:'CT_02'}:{...plans[1],origin:'MA_03',target:'CT_02'};
  const {m,c}=mk(sc,91);
  if(faction==='BRITISH')m.field_armies[sc.attackerHQ].location_city_id='NY_04';
  m.field_armies[sc.reinforcement].location_city_id=faction==='PATRIOT'?'NY_02':'VA_04';
  for(const [id,city]of Object.entries(c.cities))city.politics.military_control=P.militaryControl(m,id,PC);
  const p=B.prepareBattle(m,{origin_city_id:sc.origin,city_id:sc.target,attacker_army_ids:[sc.attacker],leader_army_id:sc.attacker,route_type:'LANDING_ATTACK'},c,CFG);
  const f={sc,s:p.state,c,battleId:p.battle.id,blockader:faction};
  f.s.battles[f.battleId].status='awaiting_continuation';f.s.battles[f.battleId].history=[{result_band:'even'}];
  eq(p.battle.landing_access.mode,'COASTAL_LANDING','existing landing-only assault');
  const out=B.reinforceBattle(f.s,f.battleId,[sc.reinforcement],c,E);
  f.s=out.state;eq(out.arrival_access_reason,'NOT_A_PORT','landing-only shore reinf');
  validate(f.s,'landing-only '+faction);
  captureSource(f,sc.origin,other(faction));
  validate(f.s,'landing origin captured '+faction);
  endBattle(f,'DEFENDER');validate(f.s,'landing-only battle end '+faction);
  scenarios++;
}

// A genuine second battle captures an army's departure city while the first
// battle remains unresolved.  Unlike captureSource() above, this goes through
// BattleEngine.prepareBattle()/resolveBattle() and its supply-cut callbacks.
for(const blockader of ['PATRIOT','BRITISH'])
for(const victim of ['MAIN','ATTACK_REINFORCEMENT','DEFEND_REINFORCEMENT']){
  const f=fixture(blockader,'BLOCKADED');
  const att=reinforce(f,'ATTACKER','LAND'),def=reinforce(f,'DEFENDER','LAND');
  const id=victim==='MAIN'?f.sc.attacker:victim==='ATTACK_REINFORCEMENT'?att.id:def.id;
  const source=victim==='MAIN'?f.sc.origin:victim==='ATTACK_REINFORCEMENT'?att.origin:def.origin;
  const victimFaction=f.s.field_armies[id].faction,conqueror=other(victimFaction);
  const allCities=f.c.cities;
  const neighbors=f.c.topology.edges.filter(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&(e.a===source||e.b===source)).map(e=>e.a===source?e.b:e.a);
  const start=neighbors.find(city=>city!==f.sc.target&&city!==f.sc.origin&&city!==att.origin&&city!==def.origin)||neighbors.find(city=>city!==f.sc.target&&city!==source);
  ok(start&&start!==source,'second attack origin available '+blockader+'/'+victim);
  const template=Object.values(ctx.PHASE2_STATE_SEED.field_armies).find(a=>a.faction===conqueror&&!f.s.field_armies[a.id]);
  ok(template,'spare attacker '+blockader+'/'+victim);
  f.s.field_armies[template.id]={...clone(template),location_city_id:start,battle_id:null,acted_this_month:false,manpower:40000,morale:90};
  // The second attacker must itself be based somewhere it can legitimately hold.
  f.s.garrisons[start].faction=conqueror;f.s.garrisons[start].manpower=600;
  allCities[start].politics.military_control=P.militaryControl(f.s,start,PC);
  allCities[source].politics.military_control=P.militaryControl(f.s,source,PC);
  const p=B.prepareBattle(f.s,{origin_city_id:start,city_id:source,attacker_army_ids:[template.id],leader_army_id:template.id,route_type:'LAND_ATTACK'},f.c,CFG);
  f.s=p.state;
  const r=B.resolveBattle(f.s,p.battle.id,'all_out_attack',f.c,CFG,E,'hold_line');
  f.s=r.state;
  eq(r.battle.status,'resolved','second battle must resolve '+victim);
  ok(['victory','major_victory'].includes(r.resolution.band),'second battle conquest '+victim);
  allCities[source].politics.military_control=P.militaryControl(f.s,source,PC);
  eq(allCities[source].politics.military_control,conqueror,'origin seized by actual battle '+victim);
  ok(f.s.field_armies[id]?.battle_id===f.battleId,'ongoing first battle survivor '+victim);
  eq(E.battleSupplyStatus(f.s,id).connected,false,'capture must cut battle supply '+victim);
  ok(f.s.action_log.some(e=>e.type==='BATTLE_SUPPLY_CUT'&&e.army_id===id),'origin conquest must emit supply event '+victim);
  validate(f.s,'actual source conquest '+blockader+'/'+victim);
  // A real captured port must not erase the original blockade on the still
  // contested target, nor create a phantom second field army at its source.
  f.c=N.recalculateAll(f.c,'1775-06').state;
  eq(f.c.cities[f.sc.target].naval.blockaded_by,blockader,'still contested original blockade');
  validate(f.s,'post naval recalc '+blockader+'/'+victim);
  scenarios++;
}

// UI-facing corner case: no main army survives, but reinforcements do. The
// engine supports this legitimate withdrawal; the caller must handle its
// REINFORCEMENTS_ONLY result without dereferencing a null destination city.
for(const blockader of ['PATRIOT','BRITISH']){
  const f=fixture(blockader,'BLOCKADED');
  reinforce(f,'ATTACKER','SEA');
  const b=f.s.battles[f.battleId];
  delete f.s.field_armies[f.sc.attacker];
  validate(f.s,'reinforcements only before withdrawal '+blockader);
  const out=B.withdrawBattle(f.s,f.battleId,blockader,f.c,E,CFG);
  eq(out.withdrawn,true,'reinforcements only withdrawal should succeed');
  eq(out.withdrawal.mode,'REINFORCEMENTS_ONLY','no main force withdrawal mode');
  eq(out.destination_city_id,null,'no destination at command-level result');
  validate(out.state,'reinforcements only after withdrawal '+blockader);
  scenarios++;
}

// Two concurrent fronts recruit from one source city, with independent sea
// arrows and independent disposition when one battle ends.
{
  const f=fixture('PATRIOT','BLOCKADED');
  const secondMain=clone(ctx.PHASE2_STATE_SEED.field_armies.ARM_PAT_PUTNAM);
  secondMain.location_city_id='MA_02';secondMain.battle_id=null;secondMain.acted_this_month=false;
  secondMain.manpower=5000;secondMain.morale=75;
  f.s.field_armies[secondMain.id]=secondMain;
  f.s.garrisons.CT_02.faction='BRITISH';f.s.garrisons.CT_02.manpower=500;
  f.c.cities.CT_02.politics.military_control=P.militaryControl(f.s,'CT_02',PC);
  const second=B.prepareBattle(f.s,{origin_city_id:'MA_02',city_id:'CT_02',attacker_army_ids:[secondMain.id],leader_army_id:secondMain.id,route_type:'LAND_ATTACK'},f.c,CFG);
  f.s=second.state;
  f.s.battles[second.battle.id].status='awaiting_continuation';
  f.s.battles[second.battle.id].history=[{result_band:'even'}];
  const navyId1=f.sc.reinforcement,navyId2='ARM_PAT_SCHUYLER';
  f.s.field_armies[navyId1].location_city_id='NY_02';
  f.s.field_armies[navyId2]={...clone(ctx.PHASE2_STATE_SEED.field_armies[navyId2]),location_city_id:'NY_02',acted_this_month:false,battle_id:null,morale:75};
  f.s=B.reinforceBattle(f.s,f.battleId,[navyId1],f.c,E).state;
  const sea=B.reinforceBattle(f.s,second.battle.id,[navyId2],f.c,E);
  f.s=sea.state;eq(sea.arrival_access_mode,'COASTAL_LANDING','second simultaneous battle landing-only coast');
  validate(f.s,'simultaneous two fronts');
  const routes=Map.collectRoutes(f.s).filter(r=>r.kind==='REINFORCEMENT'&&r.origin==='NY_02');
  eq(routes.length,2,'two independent reinforcement arrows from one port');
  eq(new Set(routes.map(r=>r.target)).size,2,'reinforcements must point at different battles');
  captureSource(f,'NY_02','BRITISH');
  eq(E.battleSupplyStatus(f.s,navyId1).connected,false,'first expedition supply lost');
  eq(E.battleSupplyStatus(f.s,navyId2).connected,false,'second expedition supply lost');
  validate(f.s,'simultaneous two fronts source conquered');
  const first={...f,s:clone(f.s),c:clone(f.c)};
  endBattle(first,'DEFENDER');
  eq(Map.collectRoutes(first.s).filter(r=>r.kind==='REINFORCEMENT'&&r.origin==='NY_02').length,1,'only surviving battle retains arrow');
  validate(first.s,'after first of two fronts concluded');
  scenarios++;
}

// Unforced rounds: let the production power/loss/morale and retreat formulas
// decide the outcome over several real monthly transitions and seeds.
const randomOutcomes={resolved:0,continued:0,routed:0,maintenance:0,losses:0};
for(const blockader of ['PATRIOT','BRITISH'])
for(const coastalState of ['BLOCKADED','DAMAGED','OPERATIONAL'])
for(const routes of [['LAND','LAND'],['LAND','SEA'],['SEA','LAND'],['SEA','SEA']])
for(let seed=1;seed<=6;seed++){
  const f=fixture(blockader,coastalState);
  f.s.random={algorithm:'mulberry32',initial_seed:seed,state:seed,calls:0};
  reinforce(f,'ATTACKER',routes[0]);reinforce(f,'DEFENDER',routes[1]);
  // Vary force ratios without directly controlling the win/loss branch.
  f.s.field_armies[f.sc.attacker].manpower=Math.max(500,Math.floor(f.s.field_armies[f.sc.defender].manpower*(.5+(seed-1)*.21)));
  for(let round=0;round<4;round++){
    if(f.s.battles[f.battleId].status==='resolved')break;
    f.s=B.continueBattle(f.s,f.battleId,E).state;
    const outcome=B.resolveBattle(f.s,f.battleId,seed%2?'normal_attack':'war_of_attrition',f.c,CFG,E,'hold_line');
    f.s=outcome.state;
    randomOutcomes.losses+=Number(outcome.resolution.attacker_loss||0)+Number(outcome.resolution.defender_loss||0);
    for(const a of Object.values(f.s.field_armies)){
      ok(Number.isFinite(a.manpower)&&a.manpower>=0,'no invalid manpower after real combat');
      ok(Number.isFinite(a.morale)&&a.morale>=0&&a.morale<=100,'no invalid morale after real combat');
    }
    validate(f.s,`natural ${blockader}/${coastalState}/${routes}/${seed}/round${round}`);
    if(outcome.resolution.decisive){randomOutcomes.resolved++;break;}
    randomOutcomes.continued++;
    const beforeCount=Object.keys(f.s.field_armies).length;
    f.s=E.advanceMonth(f.s,CFG);
    randomOutcomes.routed+=beforeCount-Object.keys(f.s.field_armies).length;
    f.c.cities[f.sc.target].politics.military_control=P.militaryControl(f.s,f.sc.target,PC);
    const plan=N.prepareMonthlyBlockadeMaintenance(f.c,f.s,`${f.s.calendar.year}-${String(f.s.calendar.month).padStart(2,'0')}`);
    f.c=plan.state;
    if(plan.pending.length){
      const decision=Maintenance.resolve(f.c,f.s,plan.pending[0],true,`${f.s.calendar.year}-${String(f.s.calendar.month).padStart(2,'0')}`,N,E);
      f.c=decision.city;f.s=decision.military;randomOutcomes.maintenance++;
    }
    f.s=E.syncBattleSeaSupplyBlockades(f.s,f.c).state;
    validate(f.s,`natural next month ${blockader}/${coastalState}/${routes}/${seed}`);
  }
  scenarios++;
}

console.log('BETA9_COMBINED_BATTLE_STATE_AUDIT',JSON.stringify({scenarios,assertions,randomOutcomes}));
