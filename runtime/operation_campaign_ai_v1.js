/* BEFORE THE STARS — bounded, adversarial two-month operational choice (experimental).
 * Loaded after continuation_battle_ai_v1. No changes to combat / map / naval rules.
 * Switch: window.BTS_OPERATIONAL_AI_FLAGS={PATRIOT:false,BRITISH:false} for matched old-AI control.
 */
(function(){'use strict';
const B=window.BattleEngine, E=window.ArmyPhase2Engine, P=window.PoliticalPhaseEngine, N=window.NavalControlEngine,
      C=window.CityCommandEngine, phase=window.PHASE2_CONFIG, political=window.POLITICAL_PHASE_CONFIG;
if(!B||!E||!P||!N||!C||!phase?.battle_engine)return;
const enemy=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
const serial=m=>Number(m.calendar?.year||1775)*12+Number(m.calendar?.month||6);
const control=(m,id)=>P.militaryControl(m,id,political);
const land=(c,a,b)=>(c.topology?.edges||[]).some(e=>e.counts_as_land_adjacency!==false&&!String(e.type||'').startsWith('water_')&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a)));
const neighbors=(c,id)=>(c.topology?.edges||[]).filter(e=>e.counts_as_land_adjacency!==false&&!String(e.type||'').startsWith('water_')&&(e.a===id||e.b===id)).map(e=>e.a===id?e.b:e.a);
const activeBattle=b=>b&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status);
const ready=a=>a&&a.manpower>=100&&!a.acted_this_month&&!a.battle_id&&(a.morale??60)>=28;
const chief=(m,a)=>m.commanders?.[a?.commander_id]?.role==='総司令官';
const value=(c,id)=>4*(Number(c.cities?.[id]?.politics?.political_importance)||1)+(c.cities?.[id]?.geography?.is_port?9:0);
const enabled=f=>window.BTS_OPERATIONAL_AI_FLAGS?.[f]!==false;
const copy=x=>JSON.parse(JSON.stringify(x));
// This helper uses real engine summaries, not soldier counts; forecast still excludes future dice.
function forecastPower(m,c,ids,garrison,id,attacker){
 const a=ids.filter(x=>m.field_armies?.[x]&&m.field_armies[x].manpower>0);
 if(!a.length&&!garrison)return 0;
 const lead=B.selectBattlefieldLeader(m,a);
 return B.basePower(B.forceSummary(m,a,garrison,lead?m.field_armies[lead].commander_id:null,phase.battle_engine,Number(c.cities?.[id]?.politics?.political_importance)||1,attacker),phase.battle_engine,!attacker);
}
function garrison(m,id,f){const g=m.garrisons?.[id];return g?.faction===f&&g.manpower>0?g:null;}
function lockedAt(m,id,f){return Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0&&activeBattle(m.battles?.[a.battle_id]));}
function reserved(m,c,f,id,exclude){
 let options=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&ready(a)&&!exclude.includes(a.id)&&land(c,a.location_city_id,id));
 options=options.filter(a=>!chief(m,a)); // Hold the supreme commander out of the bait-and-reinforce commitment.
 return options.sort((a,b)=>forecastPower(m,c,[b.id],null,id,true)-forecastPower(m,c,[a.id],null,id,true));
}
function sourceSafety(m,c,f,origin,attacking,target){
 const remaining=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===origin&&!attacking.includes(a.id)&&a.manpower>0&&!a.battle_id);
 const guards=(garrison(m,origin,f)?.manpower||0)+remaining.reduce((s,a)=>s+a.manpower,0);
 // Do not sever a locked army's actual supply anchor to conduct this plan.
 if(lockedAt(m,origin,f).length&&guards<200)return false;
 const attackers=neighbors(c,origin).filter(id=>id!==target).flatMap(id=>Object.values(m.field_armies||{}).filter(a=>a.faction===enemy(f)&&a.location_city_id===id&&a.manpower>0&&!a.battle_id));
 return !attackers.length || guards>=Math.max(200,attackers.reduce((n,a)=>n+a.manpower,0)*.40);
}
function agePlan(m,p){return serial(m)-p.started;}
function planSlot(m,f,create){
 if(!create)return m.ai_runtime?.operational_campaign?.[f]||null;
 m.ai_runtime=m.ai_runtime||{};m.ai_runtime.operational_campaign=m.ai_runtime.operational_campaign||{};
 return m.ai_runtime.operational_campaign[f]||(m.ai_runtime.operational_campaign[f]={plans:[],last_reinforced:{},cooldowns:{}});
}
function rivalResponse(m,c,f,target,initialIds){
 const e=enemy(f),pre=Object.values(m.field_armies||{}).filter(a=>a.faction===e&&ready(a)&&land(c,a.location_city_id,target)&&!initialIds.includes(a.id));
 const scores=pre.map(a=>forecastPower(m,c,[a.id],null,target,false)).sort((a,b)=>b-a);
 return scores[0]||0;
}
function horizonValue(row,c){
 const a=row.action||{},v=value(c,a.target||a.city||a.origin);
 // All options are considered over the same next three orders, not just one battle round.
 if(a.type==='ATTACK')return row.score+(Number(row.combat_value?.expected||0)>=1.45?15:Number(row.combat_value?.expected||0)>=1.2?8:0)+Math.min(6,v*.12);
 if(a.type==='MOVE')return row.score+Math.min(8,v*.18);
 if(['RECRUIT','TRAINING','IMPROVE','FORM'].includes(a.type))return row.score+Math.min(8,Number(row.field_value?.power_gain||0)/140);
 return row.score;
}
function planCandidate(m,c,f,origin,target,ids,alternativeRows){
 if(ids.some(id=>!ready(m.field_armies[id])||chief(m,m.field_armies[id])))return null;
 if(!sourceSafety(m,c,f,origin,ids,target))return null;
 const reserve=reserved(m,c,f,target,ids);
 if(!reserve.length)return null;
 if((m.factions?.[f]?.commands_remaining||0)<2)return null;
 const cohorts=reserve.slice(0,3);
 let first;try{first=B.prepareBattle(m,{origin_city_id:origin,city_id:target,attacker_army_ids:ids,leader_army_id:B.selectBattlefieldLeader(m,ids),route_type:'LAND_ATTACK'},c,phase);}catch{return null;}
 if(first.battle.unopposed||first.battle.attacker_faction!==f||first.battle.defender_faction!==enemy(f))return null;
 const attacker=forecastPower(m,c,ids,null,target,true);
 const initialEnemy=forecastPower(m,c,first.battle.defender_army_ids||[],garrison(m,target,enemy(f)),target,false);
 if(!initialEnemy)return null;
 const ratio=attacker/initialEnemy;
 // The engine's initial engagement needs to survive pessimistic dice; no suicidal bait.
 if(ratio<.89||ratio>1.08)return null;
 // A direct push with a strong existing assault is superior to locking troops for a month.
 if(alternativeRows.some(row=>row.action?.type==='ATTACK'&&row.action.target===target&&Number(row.combat_value?.expected)>1.32&&row.score>=90))return null;
 // Don't repeatedly reopen the exact target; reset after three months.
 const previous=planSlot(m,f,false)?.cooldowns?.[target]||0;
 if(previous&&serial(m)-previous<4)return null;
 let best=null;
 for(const reinforcement of cohorts){
  const reinforcementPower=forecastPower(m,c,[reinforcement.id],null,target,true);
  const enemyReinf=rivalResponse(m,c,f,target,ids);
  const projected=(attacker+reinforcementPower)/(initialEnemy+enemyReinf*.85);
  const noCounter=(attacker+reinforcementPower)/initialEnemy;
  // One reinforcement must decide the matter despite one plausible counter-reinforcement.
  if(projected<1.35||noCounter<1.5)continue;
  // City value, breakthrough opportunity, lost resources, alternate use and two commands priced together.
  const gain=25+value(c,target)*1.15+(Math.min(1.95,projected)-1.3)*34;
  const risk=(1.08-ratio)*35+(enemyReinf>0?9:0);
  const opportunity=(Number(reinforcement.manpower)||0)/500;
  const time=13, score=69+gain-risk-opportunity-time;
  const item={operation:'DELIBERATE_ENGAGEMENT',score,forecast:{horizon_months:3,first_ratio:ratio,decisive_ratio:projected,enemy_reinforcement_power:enemyReinf,own_reinforcement_id:reinforcement.id,alternative_best:alternativeRows[0]?.operation||null,alternative_score:Math.max(0,...alternativeRows.map(r=>horizonValue(r,c)))},action:{type:'ATTACK',ids,leader:B.selectBattlefieldLeader(m,ids),origin,target,route:'ATTACK',tactic:'normal_attack',strategic_reason:'THREE_MONTH_OPERATION_COMPARISON',operational_reason:'DELIBERATE_ENGAGEMENT',planned_reinforcement_id:reinforcement.id}};
  if(!best||score>best.score)best=item;
 }
 return best;
}
function candidates(m,c,f,normal){
 const base=normal?.candidates||[];
 if(!enabled(f)||!Number(m.factions?.[f]?.commands_remaining)||Object.values(m.battles||{}).some(b=>activeBattle(b)&&b.attacker_faction===f&&b.history?.length))return [];
 const slots=planSlot(m,f,false),current=(slots?.plans||[]).find(x=>!x.closed&&agePlan(m,x)<=3);
 if(current)return [];
 const rows=[];
 for(const origin of new Set(Object.values(m.field_armies||{}).filter(a=>a.faction===f&&ready(a)).map(a=>a.location_city_id))){
  const armies=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===origin&&ready(a)&&!chief(m,a));
  if(!armies.length)continue;
  let targets=[];try{targets=C.getCommandCandidates(c,{command_type:'ATTACK',origin_city_id:origin,faction:f});}catch{}
  const groups=armies.slice(0,6).map(a=>[a.id]); // Never assemble a fictitious or commander-ineligible combined group.
  for(const target of targets.filter(id=>control(m,id)===enemy(f)&&land(c,origin,id))){
   for(const ids of groups){const item=planCandidate(m,c,f,origin,target,ids,base);if(item)rows.push(item);}
  }
 }
 return rows.sort((a,b)=>b.score-a.score);
}
function battleForPlan(m,f,p){return Object.values(m.battles||{}).find(b=>b.attacker_faction===f&&b.city_id===p.target&&b.origin_city_id===p.origin&&b.attacker_army_ids?.some(id=>p.first_ids.includes(id))&&activeBattle(b));}
function closeOld(m,f){const s=planSlot(m,f,false);if(!s)return;
 for(const p of s.plans||[]){if(p.closed)continue;
  const battle=battleForPlan(m,f,p);
  if(agePlan(m,p)>3||agePlan(m,p)>=1&&!battle){p.closed=true;p.closed_reason='FINISHED_OR_CANCELLED';}
  else if(battle){p.battle_id=battle.id;if((battle.history||[]).length&&agePlan(m,p)>=2&&p.reinforcements_sent===0){p.closed=true;p.closed_reason='NO_TIMELY_REINFORCEMENT';}}
 }
}
function plannedReinforcement(m,c,f){
 const s=planSlot(m,f,false);if(!s)return null;
 closeOld(m,f);
 for(const p of s.plans||[]){if(p.closed||p.reinforcements_sent||agePlan(m,p)<1||agePlan(m,p)>2)continue;
  const b=battleForPlan(m,f,p),a=m.field_armies?.[p.reserve_id];if(!b||(b.history||[]).length===0||!ready(a)||!land(c,a.location_city_id,b.city_id)||!Number(m.factions?.[f]?.commands_remaining))continue;
  const own=forecastPower(m,c,b.attacker_army_ids||[],null,b.city_id,true);
  const foe=forecastPower(m,c,b.defender_army_ids||[],garrison(m,b.city_id,enemy(f)),b.city_id,false);
  const ratio=own/Math.max(1,foe);
  const withOne=forecastPower(m,c,[...(b.attacker_army_ids||[]),a.id],null,b.city_id,true)/Math.max(1,foe);
  const enemyExpected=rivalResponse(m,c,f,b.city_id,b.defender_army_ids||[]);
  const conservative=forecastPower(m,c,[...(b.attacker_army_ids||[]),a.id],null,b.city_id,true)/(foe+enemyExpected*.7);
  // Cancel, rather than start a leapfrog reinforcement race if a single burst cannot finish the battle.
  if(conservative<1.25||withOne<1.43||ratio>1.32||ratio<.72){p.closed=true;p.closed_reason='REFORECAST_INVALID';continue;}
  // Actual legal command (not a 3-month speculative army transfer).
  return{type:'BATTLE_REINFORCEMENT',battle_id:b.id,city:b.city_id,target:b.city_id,origin:a.location_city_id,ids:[a.id],strategic_reason:'THREE_MONTH_OPERATION_COMPARISON',operational_reason:'PLANNED_DECISIVE_REINFORCEMENT',forecast_decisive_ratio:conservative};
 }
 return null;
}
function note(m,f,a){if(!a||!enabled(f))return;
 const slot=planSlot(m,f,true);
 if(a.operational_reason==='DELIBERATE_ENGAGEMENT'){
  // Record only genuine issued commands; engine will validate execution separately.
  slot.plans.push({started:serial(m),origin:a.origin,target:a.target,first_ids:[...a.ids],reserve_id:a.planned_reinforcement_id,reinforcements_sent:0,closed:false});
  slot.cooldowns[a.target]=serial(m);
  if(slot.plans.length>24)slot.plans.splice(0,slot.plans.length-24);
 }else if(a.operational_reason==='PLANNED_DECISIVE_REINFORCEMENT'){
  const p=slot.plans.find(p=>!p.closed&&p.target===a.target);
  if(p){p.reinforcements_sent++;p.closed=true;p.closed_reason='DECISIVE_REINFORCEMENT_SENT';}
  slot.last_reinforced[a.battle_id]=serial(m);
 }
}
// Shared continuation policy. The first campaign prototype only tracked its *planned*
// reinforcements; ordinary continuation responses could still leapfrog indefinitely.
function evaluateOrdinaryReinforcement(m,c,f,a){
 const b=m.battles?.[a.battle_id];if(!b)return{allow:true,reason:'BATTLE_NOT_FOUND'};
 const ownAttack=b.attacker_faction===f,ownIds=ownAttack?b.attacker_army_ids:b.defender_army_ids,
       foeIds=ownAttack?b.defender_army_ids:b.attacker_army_ids;
 const ownGarrison=ownAttack?null:garrison(m,b.city_id,f),foeGarrison=ownAttack?garrison(m,b.city_id,enemy(f)):null;
 const own=forecastPower(m,c,ownIds,ownGarrison,b.city_id,ownAttack),foe=forecastPower(m,c,foeIds,foeGarrison,b.city_id,!ownAttack);
 const danger=foe/Math.max(1,own);
 const projected=copy(m),origin=c.cities?.[a.origin],target=c.cities?.[b.city_id];
 if(origin&&target&&!land(c,a.origin,b.city_id)&&origin.geography?.sea_zone_id&&target.geography?.sea_zone_id){
  const period=`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
  const rate=N.seaRouteProfile(c,origin.geography.sea_zone_id,target.geography.sea_zone_id,f,'SEA_TRANSPORT',period).arrival_rate;
  for(const id of a.ids||[])if(projected.field_armies[id])projected.field_armies[id].manpower=Math.max(0,Math.floor(projected.field_armies[id].manpower*rate));
 }
 const incoming=forecastPower(projected,c,[...(ownIds||[]),...(a.ids||[])],ownGarrison,b.city_id,ownAttack);
 const projectedBare=incoming/Math.max(1,foe),counter=rivalResponse(m,c,f,b.city_id,foeIds||[]),
       projectedCounter=incoming/Math.max(1,foe+counter*.7);
 const slot=planSlot(m,f,false),last=slot?.last_reinforced?.[a.battle_id]||0,
       age=last?serial(m)-last:99;
 const chiefAtRisk=(ownIds||[]).some(id=>m.commanders?.[m.field_armies?.[id]?.commander_id]?.role==='総司令官');
 const chiefMorale=chiefAtRisk?Math.min(...ownIds.filter(id=>m.commanders?.[m.field_armies?.[id]?.commander_id]?.role==='総司令官').map(id=>Number(m.field_armies?.[id]?.morale??60))):99;
 const lifeOrDeath=danger>=1.65||(chiefAtRisk&&danger>=1.30&&chiefMorale<=32);
 // No double reinforcement within one decision month: the alternate army is better kept in reserve.
 if(last&&age===0)return{allow:false,reason:'REINFORCEMENT_SAME_MONTH_DUPLICATE',danger,projectedBare,projectedCounter};
 // One reinforcement per side per battle within a three-month operational window,
 // except a verifiable collapse requiring emergency assistance.
 if(last&&age>=0&&age<=2&&!lifeOrDeath)return{allow:false,reason:'REINFORCEMENT_STAIRCASE_COOLDOWN',danger,projectedBare,projectedCounter};
 // Avoid transferring the next 1,000 men into an indefinitely stalemated battle.
 const decisive=projectedBare>=1.35&&projectedCounter>=1.25;
 // One limited initiative can exploit a near-certain local breakthrough, even
 // if the enemy's *possible* reserve may force another stalemate. It cannot
 // become the first step of repeated monthly escalation.
 const oneShotOpportunity=!last&&projectedBare>=1.28&&projectedCounter>=.97&&danger>=.93;
 if(!decisive&&!oneShotOpportunity&&!lifeOrDeath)return{allow:false,reason:'REINFORCEMENT_NOT_DECISIVE',danger,projectedBare,projectedCounter,counter};
 return{allow:true,reason:lifeOrDeath?'REINFORCEMENT_EMERGENCY':decisive?'REINFORCEMENT_DECISIVE':'REINFORCEMENT_ONE_SHOT_OPPORTUNITY',danger,projectedBare,projectedCounter};
}
function patch(api,f){
 if(!api||api.__operationCampaignV1)return;
 const originalCandidates=api.operationalCandidates?.bind(api),originalChoose=api.chooseAction?.bind(api);
 if(!originalChoose||!originalCandidates)return;
 api.operationalCandidates=function(m,c){const base=originalCandidates(m,c);if(!enabled(f))return base;const added=candidates(m,c,f,base);if(!added.length)return base;const merged=[...base.candidates,...added].sort((a,b)=>b.score-a.score);return{...base,candidates:merged,choice:merged[0],operational_comparison:{horizon_months:3,alternatives:base.candidates.slice(0,6).map(x=>({operation:x.operation,score:x.score})),deliberate:added[0].forecast}};};
 api.chooseAction=function(m,c,...args){
  if(!enabled(f))return originalChoose(m,c,...args);
  const staged=plannedReinforcement(m,c,f);
  if(staged){note(m,f,staged);return staged;}
  // Old patched continuation holds precedence for urgent rescue, free battles, and critical crisis.
  const original=originalChoose(m,c,...args);
  if(original?.type==='BATTLE_REINFORCEMENT'){
   const check=evaluateOrdinaryReinforcement(m,c,f,original);
   if(check.allow){
    const slot=planSlot(m,f,true);
    slot.last_reinforced[original.battle_id]=serial(m);
    return original;
   }
   // If a battle has turned against us and one reinforcement cannot reverse it,
   // preserve the trapped formation by an actual legal withdrawal, when possible.
   const b=m.battles?.[original.battle_id];
   if(b&&check.danger>=1.25&&check.projectedBare<1.15){
    const ownIds=b.attacker_faction===f?b.attacker_army_ids:b.defender_army_ids;
    const excluded=new Set(b.attacker_faction===f?(b.attacker_reinforcement_ids||[]):(b.defender_reinforcement_ids||[]));
    const mains=(ownIds||[]).filter(id=>!excluded.has(id)&&m.field_armies?.[id]);
    let retreat=null;
    try{if(mains.length)retreat=B.selectRetreatPlan(m,c,b,f,E,mains,phase.battle_engine);}catch{}
    const withdrawal={type:'BATTLE_WITHDRAW',battle_id:b.id,city:b.city_id,target:b.city_id,free_decision:true,strategic_reason:'OPERATIONAL_AVOID_PIECEMEAL_REINFORCEMENTS'};
    if(retreat&&(!api.TrustPolicy?.allowsAction||api.TrustPolicy.allowsAction(m,c,f,withdrawal)))return withdrawal;
   }
   // Blocking a wasteful reinforcement does not consume the turn. Compare alternative
   // front movement, force improvement and civil operations at the same decision step.
   const alternatives=originalCandidates(m,c)?.candidates||[];
   const choice=alternatives.find(row=>row?.action&&row.action.type!=='BATTLE_REINFORCEMENT');
   return choice?.action||null;
  }
  if(!original||['BATTLE_WITHDRAW','CONTINUE'].includes(original.type)||original.strategic_reason?.startsWith('BREAKTHROUGH_CRISIS'))return original;
  const base=originalCandidates(m,c),proposals=candidates(m,c,f,base),best=proposals[0];
  const alternative=Math.max(0,...(base.candidates||[]).map(row=>horizonValue(row,c)));
  if(!best||best.score<alternative+6)return original;
  if(best.action.origin===original.origin&&best.action.target===original.target&&original.type==='ATTACK')return original;
  const trust=api.TrustPolicy;
  if(trust?.allowsAction&&!trust.allowsAction(m,c,f,best.action))return original;
  note(m,f,best.action);
  return best.action;
 };
 api.__operationCampaignV1=true;
}
patch(window.RoyalistAiTurn,'BRITISH');patch(window.PatriotAiTurn,'PATRIOT');
window.__BTSOperationalCampaignV1={version:'1.1-reinforcement-coordination-experimental',candidates,plannedReinforcement,forecastPower,note,planSlot,enabled,evaluateOrdinaryReinforcement};
})();
