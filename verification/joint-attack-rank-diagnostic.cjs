'use strict';
/* Unified joint-attack command hierarchy regression.
 * Both official AIs, direct battle entry and each reinforcement order
 * must apply the identical common command-authority rule.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {ctx}=require('./stage3-battle-scenario.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const B=ctx.BattleEngine;
const runtime=path.resolve(__dirname,'../runtime');
const ui=fs.readFileSync(path.join(runtime,'army_phase2_ui_v0_77_portraits.js'),'utf8');
assert.match(ui,/window\.BattleEngine\.canCoordinateJointAttack/,
  'player UI uses the engine command-hierarchy rule');
const cityUi=fs.readFileSync(path.join(runtime,'canonical_city_runtime_v0_74_retreat.js'),'utf8');
assert.match(cityUi,/eligibleReinforcementArmies\(leaderId,battle\)/,
  'human reinforcement picker uses the distinct per-order engine rule');
const uiFunctions=ui.split('\n').filter(line=>line.startsWith('  function eligibleAttackArmies(')||line.startsWith('  function previewAttackFormation(')).join('\n')+'\n'+ui.match(/  function eligibleReinforcementArmies\([\s\S]+?\n  \}/)[0];
assert.ok(uiFunctions.includes('function previewAttackFormation('));

const scenarios=[
  {faction:'PATRIOT',ids:['ARM_PAT_LEE','ARM_PAT_PUTNAM'],senior:'ARM_PAT_WASHINGTON',enemy:'ARM_BRI_GAGE',origin:'MA_02',target:'MA_03',ai:ctx.PatriotAiTurn},
  {faction:'BRITISH',ids:['ARM_BRI_HOWE','ARM_BRI_CLINTON'],senior:'ARM_BRI_GAGE',enemy:'ARM_PAT_WASHINGTON',origin:'MA_03',target:'MA_02',ai:ctx.RoyalistAiTurn}
];
let checks=1;
for(const s of scenarios){
  const m=clone(ctx.PHASE2_STATE_SEED),c=clone(ctx.CITY_COMMAND_DATA);
  for(const id of Object.keys(m.field_armies))if(![...s.ids,s.enemy].includes(id))delete m.field_armies[id];
  for(const id of s.ids){
    const army=m.field_armies[id];
    assert.equal(m.commanders[army.commander_id].role,'通常指揮官',s.faction+' uses no higher-rank leader');checks++;
    Object.assign(army,{location_city_id:s.origin,manpower:14000,morale:85,acted_this_month:false,battle_id:null});
  }
  Object.assign(m.field_armies[s.enemy],{location_city_id:s.target,manpower:900,acted_this_month:false,battle_id:null});
  m.battles={};
  for(const faction of ['PATRIOT','BRITISH'])m.factions[faction].commands_remaining=3;
  const leader=B.selectBattlefieldLeader(m,s.ids);
  assert.ok(s.ids.includes(leader));checks++;
  assert.equal(B.canLeadJointReinforcement(m,s.ids),false,'joint reinforcement correctly rejects ordinary-only group');checks++;
  assert.equal(B.canCoordinateJointAttack(m,s.ids),false,'ordinary-only joint attack is illegal');checks++;
  assert.equal(B.canCoordinateJointAttack(m,[s.ids[0]]),true,'ordinary single-army attack is legal');checks++;
  assert.throws(()=>B.prepareBattle(m,{origin_city_id:s.origin,city_id:s.target,attacker_army_ids:s.ids,
    leader_army_id:leader,route_type:'LAND_ATTACK'},c,ctx.PHASE2_CONFIG),/BATTLE_JOINT_LEADER_REQUIRED/);checks++;
  const single=B.prepareBattle(m,{origin_city_id:s.origin,city_id:s.target,attacker_army_ids:[s.ids[0]],
    leader_army_id:s.ids[0],route_type:'LAND_ATTACK'},c,ctx.PHASE2_CONFIG);
  assert.equal(single.battle.attacker_army_ids.length,1,'ordinary single attack still works');checks++;
  const defenseState=clone(m),extraEnemy=Object.values(ctx.PHASE2_STATE_SEED.field_armies).find(a=>
    a.faction!==s.faction&&a.id!==s.enemy&&ctx.PHASE2_STATE_SEED.commanders[a.commander_id]?.role==='通常指揮官');
  assert.ok(extraEnemy,'ordinary defender is in roster');checks++;
  defenseState.field_armies[extraEnemy.id]={...clone(extraEnemy),location_city_id:s.target,manpower:900,morale:75,battle_id:null,acted_this_month:false};
  const defended=B.prepareBattle(defenseState,{origin_city_id:s.origin,city_id:s.target,attacker_army_ids:[s.ids[0]],
    leader_army_id:s.ids[0],route_type:'LAND_ATTACK'},c,ctx.PHASE2_CONFIG);
  assert.equal(defended.battle.defender_army_ids.length,2,'defense still auto-joins multiple armies without senior command');checks++;
  const candidates=s.ai.operationalCandidates(m,c).candidates.filter(row=>
    row.action?.type==='ATTACK'&&row.action?.ids?.length>1&&
    row.action.ids.every(id=>s.ids.includes(id))&&row.action.target===s.target);
  assert.equal(candidates.length,0,s.faction+' AI does not offer illegal ordinary-only joint attack');checks++;
  assert.throws(()=>s.ai.prepareAttack(m,c,{type:'ATTACK',ids:s.ids,leader,origin:s.origin,target:s.target,route:'ATTACK',tactic:'normal_attack'},
    {army:ctx.ArmyPhase2Engine,battle:B,phaseConfig:ctx.PHASE2_CONFIG}),/BATTLE_JOINT_LEADER_REQUIRED/,
    'even direct AI execution cannot bypass the engine');checks++;
  const senior=clone(ctx.PHASE2_STATE_SEED.field_armies[s.senior]);
  assert.ok(senior,'the senior army exists in game seed');checks++;
  Object.assign(senior,{location_city_id:s.origin,manpower:14000,morale:85,acted_this_month:false,battle_id:null});
  m.field_armies[s.senior]=senior;
  assert.equal(B.canCoordinateJointAttack(m,[...s.ids,s.senior]),true,'joint army led by a senior is legal');checks++;
  assert.equal(B.canCoordinateJointAttack(m,[...s.ids,s.senior],s.ids[0]),false,'ordinary leader cannot command multiple armies');checks++;
  const prepared=B.prepareBattle(m,{origin_city_id:s.origin,city_id:s.target,attacker_army_ids:[...s.ids,s.senior],
    leader_army_id:s.senior,route_type:'LAND_ATTACK'},c,ctx.PHASE2_CONFIG);
  assert.equal(prepared.battle.attacker_army_ids.length,3,'senior-led joint attack is accepted');checks++;
  assert.equal(prepared.battle.defender_army_ids.length,1,'automatic defensive army participation is unchanged');checks++;
  const playerUi={state:m,clone,window:{BattleEngine:B,PHASE2_CONFIG:ctx.PHASE2_CONFIG},E:{appendAction(){}},
    getArmiesAt:(city,opt)=>Object.values(m.field_armies).filter(a=>a.location_city_id===city&&a.faction===opt.faction&&!a.acted_this_month&&!a.battle_id)};
  vm.runInNewContext(uiFunctions+'\nthis.attackUi={eligibleAttackArmies,eligibleReinforcementArmies,previewAttackFormation};',playerUi);
  assert.deepEqual(Array.from(playerUi.attackUi.eligibleAttackArmies(s.ids[0]),a=>a.id),[s.ids[0]],
    'real player UI limits an ordinary leader to its own army');checks++;
  assert.equal(playerUi.attackUi.eligibleAttackArmies(s.senior).length,3,
    'real player UI exposes senior-led joint formation');checks++;
  assert.throws(()=>playerUi.attackUi.previewAttackFormation(s.ids[0],s.ids,s.target),/ATTACK_FORMATION_INVALID/,
    'real player UI preview cannot be bypassed with injected ordinary IDs');checks++;
  assert.equal(playerUi.attackUi.previewAttackFormation(s.senior,[...s.ids,s.senior],s.target).armies.length,3,
    'real player UI preview accepts the same senior-led formation');checks++;
  console.log(JSON.stringify({faction:s.faction,origin:s.origin,target:s.target,
    rejected_ordinary_joint:s.ids,senior:s.senior,ai_illegal_candidates:candidates.length,
    ordinary_single_accepted:true,senior_joint_accepted:true}));
}

// A second path: separately ordered single-army relief must remain legal
// even when the combined ongoing attacking roster contains no senior.
vm.runInContext(fs.readFileSync(path.join(runtime,'continuation_battle_ai_v1.js'),'utf8'),ctx);
for(const s of [
  {faction:'PATRIOT',initial:'ARM_PAT_LEE',reinforcement:'ARM_PAT_PUTNAM',senior:'ARM_PAT_WASHINGTON',enemy:'ARM_BRI_GAGE',origin:'MA_02',supportOrigin:'MA_04',target:'MA_03'},
  {faction:'BRITISH',initial:'ARM_BRI_HOWE',reinforcement:'ARM_BRI_CLINTON',senior:'ARM_BRI_GAGE',enemy:'ARM_PAT_WASHINGTON',origin:'MA_03',supportOrigin:'CT_03',target:'MA_02'}
]){
  const m=clone(ctx.PHASE2_STATE_SEED),c=clone(ctx.CITY_COMMAND_DATA);
  for(const id of Object.keys(m.field_armies))if(![s.initial,s.reinforcement,s.senior,s.enemy].includes(id))delete m.field_armies[id];
  for(const [id,where] of [[s.initial,s.origin],[s.reinforcement,s.supportOrigin],[s.senior,s.supportOrigin],[s.enemy,s.target]]){
    Object.assign(m.field_armies[id],{location_city_id:where,manpower:3000,morale:75,acted_this_month:false,battle_id:null});
  }
  // Make the senior unavailable for this turn: only an ordinary relief column
  // is eligible for the AI to consider after the first battle round.
  m.field_armies[s.senior].acted_this_month=true;
  m.battles={};m.random={algorithm:'mulberry32',initial_seed:23,state:23,calls:0};
  for(const faction of ['PATRIOT','BRITISH'])m.factions[faction].commands_remaining=3;
  const first=B.prepareBattle(m,{origin_city_id:s.origin,city_id:s.target,attacker_army_ids:[s.initial],
    leader_army_id:s.initial,route_type:'LAND_ATTACK'},c,ctx.PHASE2_CONFIG);
  const resolved=B.resolveBattle(first.state,first.battle.id,'normal_attack',c,ctx.PHASE2_CONFIG,
    ctx.ArmyPhase2Engine,'hold_line');
  assert.equal(resolved.resolution.decisive,false,s.faction+' first ordinary-only attack can remain unresolved');checks++;
  const active=resolved.state.battles[first.battle.id];
  const groups=ctx.__continuationBattleAiV1.reinforcementGroups(resolved.state,c,active,s.faction);
  assert.ok(groups.some(g=>g.ids.length===1&&g.ids[0]===s.reinforcement),
    s.faction+' continuation AI offers ordinary single-army relief');checks++;
  assert.equal(B.canJoinBattleReinforcement(resolved.state,active,[s.reinforcement]),true);checks++;
  const preCommands=resolved.state.factions[s.faction].commands_remaining;
  const relief=B.reinforceBattle(resolved.state,first.battle.id,[s.reinforcement],c,ctx.ArmyPhase2Engine);
  assert.equal(relief.command_cost,1,'single relief costs one command');checks++;
  assert.equal(relief.state.factions[s.faction].commands_remaining,preCommands-1);checks++;
  assert.equal(relief.battle.attacker_army_ids.length,2,'ordinary-only continued battle now admits relief');checks++;
  assert.equal(relief.state.field_armies[s.reinforcement].battle_id,first.battle.id);checks++;
  assert.equal(relief.battle.reinforcement_origins[s.reinforcement].origin_city_id,s.supportOrigin);checks++;
  assert.equal(B.canCoordinateJointAttack(relief.state,relief.battle.attacker_army_ids),false,
    'the same pair would still be forbidden as an initial joint attack');checks++;
  const reliefUiContext={state:resolved.state,clone,window:{BattleEngine:B,PHASE2_CONFIG:ctx.PHASE2_CONFIG},
    getArmiesAt:(city,opt)=>Object.values(resolved.state.field_armies).filter(a=>a.location_city_id===city&&a.faction===opt.faction&&!a.acted_this_month&&!a.battle_id)};
  vm.runInNewContext(uiFunctions+'\nthis.attackUi={eligibleAttackArmies,eligibleReinforcementArmies};',reliefUiContext);
  assert.deepEqual(Array.from(reliefUiContext.attackUi.eligibleReinforcementArmies(s.reinforcement,active),a=>a.id),[s.reinforcement],
    'player interface offers ordinary relief without requiring senior');checks++;
  const small=clone(resolved.state);
  small.field_armies[s.reinforcement].manpower=75;
  const smallUi={...reliefUiContext,state:small,
    getArmiesAt:(city,opt)=>Object.values(small.field_armies).filter(a=>a.location_city_id===city&&a.faction===opt.faction&&!a.acted_this_month&&!a.battle_id)};
  vm.runInNewContext(uiFunctions+'\nthis.attackUi={eligibleAttackArmies,eligibleReinforcementArmies};',smallUi);
  assert.equal(smallUi.attackUi.eligibleAttackArmies(s.reinforcement).length,0,
    '75-man army still cannot open an initial attack');checks++;
  assert.deepEqual(Array.from(smallUi.attackUi.eligibleReinforcementArmies(s.reinforcement,active),a=>a.id),[s.reinforcement],
    '75-man army can be selected as a reinforcement');checks++;
  const smallRelief=B.reinforceBattle(small,first.battle.id,[s.reinforcement],c,ctx.ArmyPhase2Engine);
  assert.equal(smallRelief.added_army_ids[0],s.reinforcement,
    'battle engine accepts the same 75-man army offered by the UI');checks++;
  small.field_armies[s.reinforcement].manpower=49;
  assert.equal(smallUi.attackUi.eligibleReinforcementArmies(s.reinforcement,active).length,0,
    '49-man army is hidden from the reinforcement picker');checks++;
  assert.throws(()=>B.reinforceBattle(small,first.battle.id,[s.reinforcement],c,ctx.ArmyPhase2Engine),
    /REINFORCEMENT_NOT_COMBAT_CAPABLE/,'battle engine rejects 49-man relief');checks++;
  small.field_armies[s.reinforcement].manpower=75;
  small.field_armies[s.reinforcement].morale=9;
  assert.equal(smallUi.attackUi.eligibleReinforcementArmies(s.reinforcement,active).length,0,
    'morale 9 army is hidden from the reinforcement picker');checks++;
  assert.equal(B.canJoinBattleReinforcement(resolved.state,active,[s.reinforcement,s.initial]),false,
    'simultaneous group of ordinary commanders remains forbidden');checks++;
  const defender=Object.values(ctx.PHASE2_STATE_SEED.field_armies).find(a=>a.faction!==s.faction&&a.id!==s.enemy&&ctx.PHASE2_STATE_SEED.commanders[a.commander_id]?.role==='通常指揮官');
  assert.ok(defender,'a normal defender is available for the symmetric relief test');checks++;
  const defending=clone(resolved.state);
  defending.field_armies[defender.id]={...clone(defender),location_city_id:s.supportOrigin,manpower:75,morale:70,acted_this_month:false,battle_id:null};
  assert.equal(B.canJoinBattleReinforcement(defending,defending.battles[first.battle.id],[defender.id]),true,
    'defending side has the same single-army reinforcement authority');checks++;
  const defensiveRelief=B.reinforceBattle(defending,first.battle.id,[defender.id],c,ctx.ArmyPhase2Engine);
  assert.equal(defensiveRelief.battle.reinforcement_origins[defender.id].battle_role,'defender');checks++;
  assert.equal(defensiveRelief.battle.defender_reinforcement_ids.includes(defender.id),true);checks++;
  assert.equal(B.canJoinBattleReinforcement(resolved.state,active,[s.senior]),true);checks++;
  assert.equal(B.canJoinBattleReinforcement(resolved.state,active,[s.senior,s.reinforcement]),true);checks++;
  const withSeniorAvailable=clone(relief.state);
  withSeniorAvailable.field_armies[s.senior].acted_this_month=false;
  const seniorArrival=B.reinforceBattle(withSeniorAvailable,first.battle.id,[s.senior],c,ctx.ArmyPhase2Engine);
  assert.equal(seniorArrival.battle.attacker_army_ids.length,3,'senior may join a battle with prior ordinary relief');checks++;
  assert.equal(seniorArrival.battle.reinforcement_origins[s.senior].battle_role,'attacker');checks++;
  assert.equal(seniorArrival.battle.attacker_leader_army_id,s.senior);checks++;
  console.log(JSON.stringify({faction:s.faction,route:'SEQUENTIAL_SINGLE_REINFORCEMENT',
    first_result:resolved.resolution.band,ordinary_single_reinforcement_accepted:true,
    combined_attackers:seniorArrival.battle.attacker_army_ids,higher_commander_arrived_later:true}));
}
console.log('PASS unified joint-attack command authority: '+checks+' assertions across both factions and attack/reinforcement paths');
