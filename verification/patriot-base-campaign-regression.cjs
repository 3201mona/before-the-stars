'use strict';
// Fast, bounded strategy-to-operations regression; no UI, no game-state writes.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const runtime=path.resolve(__dirname,'../runtime'),ctx={console};ctx.window=ctx;vm.createContext(ctx);
function load(file){let js=fs.readFileSync(path.join(runtime,file),'utf8');
 if(file==='patriot_ai_official_browser_v2.js'){
  const marker='const api=load("AI_OFFICIAL_CURRENT/patriot_strategic_ai_v10_official.js");';
  assert.equal(js.split(marker).length,2);
  js=js.replace(marker,'window.__PatriotCampaignTest=load("AI_OFFICIAL_CURRENT/patriot_base_campaign_v1.js");window.__PatriotNormalTest=load("AI_OFFICIAL_CURRENT/normal_operations_v1.js");'+marker);
 }vm.runInContext(js,ctx,{filename:file});}
for(const file of ['phase2_data_v0_9_funds.js','political_phase_data_v0_1.js'])load(file);
vm.runInContext(fs.readFileSync(path.join(runtime,'canonical_city_runtime_v0_74_retreat.js'),'utf8').split('\n')[0],ctx);
load('commander_roster_runtime_v0_77_portraits.js');
for(const [name,file] of Object.entries({ArmyPhase2Engine:'army_phase2_engine_v0_74_retreat.js',BattleEngine:'battle_engine_v0_74_retreat.js',PoliticalPhaseEngine:'political_phase_engine_v0_77_portraits.js',CityCommandEngine:'city_command_engine_v0_18.js',NavalControlEngine:'canonical_naval_runtime_v0_67.js'}))ctx[name]=require(path.join(runtime,file));
for(const file of ['royalist_ai_turn_v1_15.js','patriot_sparring_ai_v1_15.js','royalist_ai_official_browser_v3.js','patriot_ai_official_browser_v2.js','continuation_battle_ai_v1.js','operation_campaign_ai_v1.js'])load(file);
const clone=x=>JSON.parse(JSON.stringify(x)),T=ctx.__PatriotCampaignTest,Normal=ctx.__PatriotNormalTest;
const E=ctx.ArmyPhase2Engine,P=ctx.PoliticalPhaseEngine,PC=ctx.POLITICAL_PHASE_CONFIG;
const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/STATE_beta7_1776_04_seed101.json'),'utf8'));
function get(){const m=clone(snap.military),c=clone(snap.cities);m.current_faction='PATRIOT';m.player_faction='BRITISH';m.factions.PATRIOT.commands_remaining=3;
 const totals=E.logisticsTroopsByCity(m),cons=E.logisticsConsumptionTroopsByCity(m,ctx.PHASE2_CONFIG).totals||{};
 for(const [id,city] of Object.entries(c.cities)){city.politics.military_control=P.militaryControl(m,id,PC);city.garrison={...city.garrison,troops:Number(m.garrisons?.[id]?.manpower)||0};city.stationed_field_army_troops=totals[id]||0;city.stationed_field_army_consumption_troops=cons[id]||0;}
 return{m,c};}
function ok(label,predicate,data){assert.ok(predicate,label);console.log('PASS',label,JSON.stringify(data||{}));}
const {m,c}=get(),before=JSON.stringify(m),beforeC=JSON.stringify(c),goal=T.evaluate(m,c);
ok('Five-plus votes activates a meaningful British base objective',goal.active&&goal.votes>=5&&goal.target==='NC_02'&&goal.phase==='APPROACH_BASE',{votes:goal.votes,target:goal.target,ranked:goal.ranked});
ok('Enemy commander is not selected for a forced-win campaign',goal.ranked.every(x=>!x.enemy_chief));
ok('Strategy read-only evaluation does not mutate a saved game',JSON.stringify(m)===before&&JSON.stringify(c)===beforeC);
const raw=Normal.operationalCandidates(m,c,'PATRIOT'),approach=raw.candidates.filter(r=>r.action?.type==='MOVE'&&r.action.origin==='NC_04'&&r.action.target==='NC_03');
const moves=approach.map(r=>({ids:r.action.ids,score:r.score,departure:r.departure}));
T.apply(m,c,raw.candidates,goal);
const changed=approach.filter(r=>r.patriot_base_campaign?.role==='ADVANCE_TO_ASSAULT_BASE');
console.log('AUDIT southern staging MOVE rows',JSON.stringify({raw:moves,boosted:approach.map(r=>({ids:r.action.ids,score:r.score,campaign:r.patriot_base_campaign}))}));
ok('Whole safe maneuver group earns preference, not an exposed single detachment',changed.length>0&&changed.every(x=>x.patriot_base_campaign.bonus<=66&&x.action.ids.length>1),changed.map(x=>({score:x.score,ids:x.action.ids})));
const mk=(type,origin,target,ids,route)=>({score:60,action:{type,origin,target,ids,route}});
const a=mk('ATTACK','NC_03','NC_02',['ARM_PAT_LEE'],'ATTACK'),no=mk('ATTACK','MA_03','NH_03',['ARM_PAT_WASHINGTON'],'ATTACK');
const sea=mk('MOVE','NC_04','NC_03',['ARM_PAT_LEE'],'SEA_MOVE');
const land=mk('MOVE','NC_04','NC_03',['ARM_PAT_LEE','ARM_RES_PAT_ARNOLD'],'MOVE');
const off=mk('MOVE','NC_04','VA_04',['ARM_PAT_LEE'],'MOVE');
T.apply(m,c,[a,no,sea,land,off],goal);
ok('Assault preference applies only to target and non-commander group',a.score>60&&no.score===60);
ok('Campaign advances over land, never forces sea transit or irrelevant move',land.score>60&&sea.score===60&&off.score===60);
T.record(m,c,goal,land.action);
ok('Campaign mission survives as a save-game field',m.ai_strategy_state.PATRIOT.base_campaign.target==='NC_02'&&m.ai_strategy_state.PATRIOT.base_campaign.target_since===goal.target_since);
const preserved=JSON.stringify(m.ai_strategy_state.PATRIOT.base_campaign);
T.record(m,c,undefined,{type:'FORM',strategic_reason:'BREAKTHROUGH_CRISIS'});
ok('Emergency crisis formation does not erase the multi-month campaign',JSON.stringify(m.ai_strategy_state.PATRIOT.base_campaign)===preserved);
const again=T.evaluate(m,c);
ok('Same target persists across repeated operational planning',again.target===goal.target);
const vacated=get();vacated.m.ai_strategy_state=clone(m.ai_strategy_state);
for(const a of Object.values(vacated.m.field_armies))if(a.faction==='BRITISH'&&a.location_city_id==='NC_02')a.location_city_id='SC_04';
vacated.m.field_armies.ARM_PAT_LEE.location_city_id='NC_03';vacated.m.field_armies.ARM_RES_PAT_ARNOLD.location_city_id='NC_03';
const empty=T.evaluate(vacated.m,vacated.c);
ok('British withdrawal preserves the objective until the vacant base is secured',empty.target==='NC_02'&&empty.phase==='OCCUPY_VACATED_BASE');
const occupy={score:48,departure:{safe:true,target_ratio:.55},action:{type:'MOVE',route:'MOVE',origin:'NC_03',target:'NC_02',ids:['ARM_PAT_LEE','ARM_RES_PAT_ARNOLD']}};
T.apply(vacated.m,vacated.c,[occupy],empty);
ok('Empty former British base gets a legal occupation operation bonus',occupy.score>100&&occupy.patriot_base_campaign?.role==='OCCUPY_ABANDONED_ENEMY_BASE');
const formerlyPenalized={score:-25,departure:{safe:true,target_ratio:.55,trust_policy:{allowed:true}},action:{...occupy.action}};
const dangerous={score:30,departure:{safe:false,target_ratio:1.40,trust_policy:{allowed:true}},action:{...occupy.action}};
const solo={score:60,departure:{safe:true,target_ratio:.35,trust_policy:{allowed:true}},action:{...occupy.action,ids:['ARM_PAT_LEE']}};
T.apply(vacated.m,vacated.c,[formerlyPenalized,dangerous,solo],empty);
ok('Vacated stronghold overcomes ordinary expansion penalty only for safely held fronts',formerlyPenalized.score>100&&dangerous.score===30);
ok('A lone detachment is not promoted to an exposed vacant enemy base',solo.score===60);
const aligned=get();aligned.m.ai_strategy_state=clone(m.ai_strategy_state);for(const a of Object.values(aligned.m.field_armies))if(a.faction==='BRITISH'&&a.location_city_id==='NC_02')a.location_city_id='SC_04';
aligned.m.field_armies.ARM_PAT_LEE.location_city_id='NC_03';aligned.m.field_armies.ARM_RES_PAT_ARNOLD.location_city_id='NC_03';aligned.c.cities.NC_03.politics.independence_support=65;
const protectedSource={score:60,departure:{safe:true,target_ratio:.35,trust_policy:{allowed:true,loss:0}},action:{...occupy.action}};
T.apply(aligned.m,aligned.c,[protectedSource],T.evaluate(aligned.m,aligned.c));
ok('Vacant-base strategy cannot sacrifice a politically aligned source city',protectedSource.score===60);
const captured=get();captured.m.ai_strategy_state=clone(m.ai_strategy_state);for(const a of Object.values(captured.m.field_armies))if(a.faction==='BRITISH'&&a.location_city_id==='NC_02')a.location_city_id='SC_04';
captured.m.field_armies.ARM_PAT_LEE.location_city_id='NC_02';
const success=T.evaluate(captured.m,captured.c); // read-only determination; the next action persists the phase.
T.record(captured.m,captured.c,success,{type:'MOVE'});
const secure=T.evaluate(captured.m,captured.c);
ok('Capturing a British stronghold triggers short consolidation instead of instant next chase',secure.phase==='SECURE_CAPTURED_BASE'&&secure.target==='NC_02',secure);
const hold={score:40,action:{type:'GARRISON',city:'NC_02'}};T.apply(captured.m,captured.c,[hold],secure);
ok('Consolidation helps retain captured foothold',hold.score>40&&hold.patriot_base_campaign?.role==='SECURE_CAPTURE');
const start=get();for(const city of Object.values(start.c.cities))city.politics.independence_support=30;
const offStage=T.evaluate(start.m,start.c);
ok('No five votes: retain existing political/defense strategy',!offStage.active&&offStage.phase==='BUILD_FIVE_VOTES');
const remote=get();for(const unit of Object.values(remote.m.field_armies)){
 if(unit.faction==='BRITISH')unit.location_city_id=remote.m.commanders?.[unit.commander_id]?.role==='総司令官'?'GA_02':'SC_04';
 if(unit.faction==='PATRIOT'&&unit.location_city_id==='NC_04')unit.location_city_id='MA_03';
}
for(const guard of Object.values(remote.m.garrisons||{}))if(guard.faction==='BRITISH'&&guard.manpower>0){guard.faction=null;guard.manpower=0;}
for(const [id,city] of Object.entries(remote.c.cities))city.politics.military_control=P.militaryControl(remote.m,id,PC);
const remoteGoal=T.evaluate(remote.m,remote.c);
console.log('NAVAL FALLBACK PROBE',JSON.stringify(remoteGoal));
ok('When Royalists abandon the northern front, Patriot strategy plans a sea approach',remoteGoal.active&&remoteGoal.naval&&remoteGoal.phase==='NAVAL_ACCESS_PREPARATION'&&remoteGoal.naval.arrival_rate<.70,remoteGoal);
const seaZone=remoteGoal.naval.worst_zone,naval={score:46,action:{type:'NAVAL',operation:'PATROL',zone:seaZone}},otherSea={score:46,action:{type:'NAVAL',operation:'PATROL',zone:seaZone==='NORTH'?'CENTRAL':'NORTH'}};
T.apply(remote.m,remote.c,[naval,otherSea],remoteGoal);
ok('Naval patrol strengthens the limiting sea zone, not an arbitrary naval action',naval.score>100&&otherSea.score===46);
const reckless={score:70,action:{type:'ATTACK',route:'LANDING_ATTACK',target:remoteGoal.target,ids:['ARM_PAT_LEE']}};
T.apply(remote.m,remote.c,[reckless],remoteGoal);
ok('Low sea arrival never receives an amphibious assault incentive',reckless.score===70);
const fullNaval=ctx.PatriotAiTurn.operationalCandidates(remote.m,remote.c);
console.log('NAVAL FULL AI',JSON.stringify({choice:fullNaval.choice?.action,campaign:fullNaval.patriot_base_campaign,top:(fullNaval.candidates||[]).slice(0,3).map(x=>({score:x.score,action:x.action}))}));
ok('Actual full AI prioritizes a naval-access operation after north-front evacuation',fullNaval.choice?.action?.type==='NAVAL'&&fullNaval.choice?.action?.operation==='PATROL'&&fullNaval.choice?.action?.zone===seaZone);
console.log('SYNTHETIC NAVAL INFLUENCE TABLE',JSON.stringify([0,4,8,12,15].map(influence=>{const board=clone(remote.c);for(const zone of Object.values(board.naval_control.zones))zone.operation_influence=influence;const profile=ctx.NavalControlEngine.seaRouteProfile(board,remoteGoal.naval.source_zone,remoteGoal.naval.destination_zone,'PATRIOT','LANDING','1776-04');return{influence,arrival_rate:profile.arrival_rate,worst:profile.worst_zone_id};})));
const capped=clone(remote.c);for(const zone of Object.values(capped.naval_control.zones))zone.operation_influence=15;
const cappedGoal=T.evaluate(remote.m,capped);
ok('Maximum accumulated patrol without safe sea control declares an operational stalemate',cappedGoal.phase==='NAVAL_ACCESS_STALLED'&&cappedGoal.naval.stalled===true&&cappedGoal.naval.arrival_rate<.85,cappedGoal);
const futile={score:42,action:{type:'NAVAL',operation:'PATROL',zone:cappedGoal.naval.worst_zone}};
T.apply(remote.m,capped,[futile],cappedGoal);
ok('Patrol at the naval influence cap is not endlessly promoted',futile.score===42);
const viableSea=clone(remote.c);for(const zone of Object.values(viableSea.naval_control.zones))zone.factors.PATRIOT.fleet=20;
const viableGoal=T.evaluate(remote.m,viableSea),seaMove={score:60,departure:{safe:true,target_ratio:.20},action:{type:'MOVE',route:'SEA_MOVE',origin:viableGoal.naval?.launch_port,target:viableGoal.naval?.staging_port,ids:[viableGoal.naval?.launch_army]}};
ok('Recovered naval control shifts the campaign from patrol to bridgehead preparation',viableGoal.phase==='SEA_BRIDGEHEAD_PREPARATION'&&viableGoal.naval.arrival_rate>=.85,viableGoal);
T.apply(remote.m,viableSea,[seaMove],viableGoal);
ok('Only a safe high-arrival amphibious bridgehead receives strategy support',seaMove.score>60);
console.log('PASS patriot base campaign: 25 focused tests');
if(process.env.BTS_PROBE_GAME_SNAPSHOT){const d=JSON.parse(fs.readFileSync(process.env.BTS_PROBE_GAME_SNAPSHOT,'utf8'));
 const p=d.military,c=d.cities,pair=Object.values(p.field_armies||{}).filter(a=>a.faction==='PATRIOT'&&a.location_city_id==='NC_03').map(a=>a.id),move={type:'MOVE',ids:pair,origin:'NC_03',target:'NC_02',route:'MOVE'};
 const normal=Normal.operationalCandidates(p,c,'PATRIOT'),patriot=ctx.PatriotAiTurn.operationalCandidates(p,c);
 console.log('SNAPSHOT PROBE',JSON.stringify({date:p.calendar,control:P.militaryControl(p,'NC_02',PC),prior:p.ai_strategy_state?.PATRIOT?.base_campaign,assessed:T.evaluate(p,c),origin_armies:pair,departure:Normal.departure(p,c,'PATRIOT',move),normal_target:normal.candidates.filter(x=>x.action?.origin==='NC_03'&&x.action?.target==='NC_02').map(x=>({score:x.score,action:x.action,departure:x.departure})).slice(0,6),garrison_rows:patriot.candidates.filter(x=>x.action?.type==='GARRISON'&&x.action?.city==='NC_03').map(x=>({score:x.score,action:x.action})).slice(0,6)}));}
