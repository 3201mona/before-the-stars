(function(){'use strict';
const process={env:{}};
const modules=Object.create(null),cache=Object.create(null);
modules['AI_OFFICIAL_CURRENT/civil_operations_v1.js']=function(require,module,exports){
'use strict';
// AI-side use of V1.28 civilian commands plus political-expansion coordination.
// Paid opinion campaigns should normally expand into nearby neutral states; repeated
// counter-campaign sinks are handed back to the military layer when practical.
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const cityConfig=require('../source_data/city_command_config_v0_17.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const clamp=(x,lo=0,hi=100)=>Math.max(lo,Math.min(hi,x));
const copy=x=>JSON.parse(JSON.stringify(x));
const enemyOf=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
let candidateEnabled=true;
function neighbors(c,id){return (c.topology?.edges||[]).filter(e=>!String(e.type).startsWith('water_')&&e.counts_as_land_adjacency!==false&&(e.a===id||e.b===id)).map(e=>e.a===id?e.b:e.a);}
function stateIdForCity(city){const id=city?.parent_colony_id;return id==='ME'?'MA':id;}
function stateCities(c,colony){return Object.values(c.cities||{}).filter(city=>stateIdForCity(city)===colony);}
function troopsAt(m,id,f){return Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0).reduce((n,a)=>n+a.manpower,0)+(m.garrisons?.[id]?.faction===f?m.garrisons[id].manpower:0);}
function monthIndex(year,month){return Number(year)*12+Number(month);}
function historyMonthIndex(entry){const parts=String(entry?.month||'').split('-').map(Number);return parts.length>=2&&Number.isFinite(parts[0])&&Number.isFinite(parts[1])?monthIndex(parts[0],parts[1]):-999999;}
function currentMonthOpinionCount(m,f){const key=`${m.calendar.year}-${m.calendar.month}`;return(m.opinion_campaign_history||[]).filter(x=>x.faction===f&&x.month===key).length;}
function recentOpinionCounts(m,colony,months=6){const now=monthIndex(m.calendar.year,m.calendar.month),counts={PATRIOT:0,BRITISH:0};for(const x of m.opinion_campaign_history||[]){const city=String(x.city_id||''),entryColony=city.startsWith('ME_')?'MA':city.slice(0,2);if(entryColony!==colony)continue;const age=now-historyMonthIndex(x);if(age<0||age>=months)continue;if(x.faction in counts)counts[x.faction]++;}return counts;}
function bestPoliticalCommander(m,id,f){return Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0&&!a.acted_this_month&&(!a.battle_id||!['active','awaiting_tactic','awaiting_continuation'].includes(m.battles?.[a.battle_id]?.status))).sort((a,b)=>(Number(m.commanders?.[b.commander_id]?.stats?.politics)||0)-(Number(m.commanders?.[a.commander_id]?.stats?.politics)||0))[0]||null;}
function politicalFocus(m,c,f){
 const enemy=enemyOf(f),summaries=P.stateSummaries(c,political),ownControlled=new Set(Object.values(c.cities||{}).filter(city=>P.militaryControl(m,city.city_id,political)===f).map(city=>city.city_id));
 const rows=[];
 for(const summary of summaries){
  if(summary.vote!=='NEUTRAL')continue;
  const cities=stateCities(c,summary.colony_id);if(!cities.length)continue;
  const ownFootprint=cities.filter(city=>ownControlled.has(city.city_id)).length;
  const adjacentOwn=new Set();for(const city of cities)for(const id of neighbors(c,city.city_id))if(ownControlled.has(id))adjacentOwn.add(id);
  const enemyFootprint=cities.filter(city=>P.militaryControl(m,city.city_id,political)===enemy).length;
  const counts=recentOpinionCounts(m,summary.colony_id,6),sink=counts[f]>=2&&counts[enemy]>=2;
  const opinion=Number(summary.opinion),gap=f==='PATRIOT'?Math.max(0,60-opinion):Math.max(0,opinion-39.9);
  const proximity=ownFootprint*18+Math.min(24,adjacentOwn.size*8)+Math.max(0,8-enemyFootprint*2);
  const score=proximity+Math.max(0,18-gap*1.1)+(ownFootprint?12:0)-(sink?18:0);
  rows.push({colony:summary.colony_id,opinion,vote:summary.vote,gap,ownFootprint,adjacentOwn:adjacentOwn.size,enemyFootprint,recentOwn:counts[f],recentEnemy:counts[enemy],sink,score});
 }
 rows.sort((a,b)=>b.score-a.score||a.gap-b.gap||b.ownFootprint-a.ownFootprint);return rows;
}
function opinionCandidates(m,c,f){
 if(!candidateEnabled||currentMonthOpinionCount(m,f)>=1)return[];
 const cash=Number(m.factions?.[f]?.treasury)||0;if(cash<150)return[];
 const focus=politicalFocus(m,c,f),near=focus.filter(x=>x.ownFootprint>0||x.adjacentOwn>0),pool=(near.length?near:focus).slice(0,5),rows=[];
 for(const ctx of pool){
  const before=P.stateSummaries(c,political).find(x=>x.colony_id===ctx.colony);if(!before)continue;
  let best=null;
  for(const city of stateCities(c,ctx.colony))for(const tier of ['SMALL','MEDIUM','LARGE']){try{
   const input=copy(m);input.current_faction=f;const commander=P.militaryControl(m,city.city_id,political)===f?bestPoliticalCommander(m,city.city_id,f):null;
   const p=E.previewOpinionCampaign(input,c,city.city_id,tier,phase,commander?.commander_id||null),direction=f==='PATRIOT'?p.after-p.before:p.before-p.after;if(direction<=0||p.treasury_cost>cash)continue;
   const board=copy(c);board.cities[city.city_id].politics.independence_support=p.after;const after=P.stateSummaries(board,political).find(x=>x.colony_id===ctx.colony);if(!after)continue;
   const delta=f==='PATRIOT'?Number(after.opinion)-Number(before.opinion):Number(before.opinion)-Number(after.opinion),finishes=after.vote===f;
   const reserve=Math.min(600,Math.max(200,Math.round(cash*.18)));if(cash-p.treasury_cost<reserve&&!finishes)continue;
   const futureCommands=finishes?0:Math.ceil(Math.max(0,ctx.gap-delta)/Math.max(.25,delta));
   let score=68+Math.min(32,ctx.score*.52)+Math.min(30,delta*6)+(finishes?40:0)+(P.militaryControl(m,city.city_id,political)===f?6:0)-p.treasury_cost/18-Math.min(30,futureCommands*5);
   // A campaign costs one full command regardless of tier. Repeating SMALL when MEDIUM can materially shorten the job is command-inefficient.
   if(tier==='SMALL'&&!finishes&&futureCommands>=1)score-=14;
   if(tier==='MEDIUM'&&!finishes)score+=8;
   if(tier==='LARGE'&&!finishes&&cash<2200)score-=8;
   // Once troops hold a foothold, prefer free security / stockpile distribution before paying for more propaganda unless this action finishes the vote.
   if(ctx.ownFootprint>0&&!finishes)score-=12;
   // If the state is adjacent but has no footprint yet, military entry is usually more valuable than paying repeatedly from outside.
   if(ctx.ownFootprint===0&&ctx.adjacentOwn>0&&!finishes)score-=10;
   if(ctx.sink)score-=finishes?10:52;
   const row={operation:'NEUTRAL_STATE_POLITICAL_EXPANSION',score,action:{type:'OPINION',city:city.city_id,tier,strategic_reason:`EXPAND_NEUTRAL_${ctx.colony}`,operational_reason:'NEARBY_NEUTRAL_STATE_EXPANSION'},politicalFocus:ctx,finishesVote:finishes,futureCommands};
   if(!best||row.score>best.score)best=row;
  }catch{}}
  if(best)rows.push(best);
 }
 return rows.sort((a,b)=>b.score-a.score).slice(0,6);
}
function reweightPoliticalRows(m,c,f,rows){
 const enemy=enemyOf(f),focus=politicalFocus(m,c,f),map=Object.fromEntries(focus.map(x=>[x.colony,x])),top=new Set(focus.slice(0,2).map(x=>x.colony)),paidUsed=currentMonthOpinionCount(m,f)>=1,summaries=P.stateSummaries(c,political),summaryMap=Object.fromEntries(summaries.map(x=>[x.colony_id,x]));
 for(const row of rows){const a=row.action||{},city=c.cities?.[a.city||a.target],colony=stateIdForCity(city),ctx=map[colony],summary=summaryMap[colony];
  if(a.type==='OPINION'){
   if(paidUsed)row.score-=90;
   if(summary?.vote==='NEUTRAL'&&top.has(colony))row.score+=10;
   if(summary?.vote===enemy)row.score-=22;
   if(String(a.strategic_reason||'').includes('DENY_'))row.score-=16;
   if(ctx?.sink&&!row.finishesVote)row.score-=42;
   if(summary?.vote==='NEUTRAL'&&ctx?.ownFootprint>0&&!row.finishesVote)row.score-=8;
   if(summary?.vote==='NEUTRAL'&&ctx?.ownFootprint===0&&ctx?.adjacentOwn>0&&!row.finishesVote)row.score-=8;
  }
  if(['SECURITY','STOCKPILE_AID'].includes(a.type)&&summary?.vote==='NEUTRAL'&&ctx?.ownFootprint>0&&(top.has(colony)||ctx.adjacentOwn>0)){row.score+=18;row.political_expansion_role='CONSOLIDATE_CONTROLLED_NEUTRAL';}
  if(['ATTACK','MOVE'].includes(a.type)&&summary?.vote==='NEUTRAL'&&ctx&&(top.has(colony)||ctx.adjacentOwn>0||ctx.ownFootprint>0)&&a.target){row.score+=ctx?.ownFootprint?5:12;row.political_expansion_role='ESTABLISH_MILITARY_FOOTPRINT';}
  if(['ATTACK','MOVE'].includes(a.type)&&ctx?.sink&&a.target){row.score+=a.type==='ATTACK'?24:14;row.political_sink_switch='MILITARY_CONTROL';}
 }
 // Within a nearby neutral state, prefer a coherent sequence: establish military control, then use free security/stockpile work, and pay for opinion only when it is clearly the better shortcut or finishes the vote.
 for(const ctx of focus){
  const summary=summaryMap[ctx.colony];if(summary?.vote!=='NEUTRAL')continue;
  const local=rows.filter(row=>{const a=row.action||{},city=c.cities?.[a.city||a.target];return stateIdForCity(city)===ctx.colony;});
  const paid=local.filter(row=>row.action?.type==='OPINION'&&!row.finishesVote);if(!paid.length)continue;
  const free=local.filter(row=>['SECURITY','STOCKPILE_AID'].includes(row.action?.type)&&row.political_expansion_role==='CONSOLIDATE_CONTROLLED_NEUTRAL').sort((a,b)=>b.score-a.score)[0];
  const entry=local.filter(row=>['ATTACK','MOVE'].includes(row.action?.type)&&row.political_expansion_role==='ESTABLISH_MILITARY_FOOTPRINT').sort((a,b)=>b.score-a.score)[0];
  if(ctx.ownFootprint>0&&free&&free.score>=45){for(const row of paid){const cap=free.score-8;if(row.score>cap){row.political_sequence_original_score=row.score;row.score=cap;row.political_sequence='FREE_CONSOLIDATION_FIRST';}}}
  else if(ctx.ownFootprint===0&&ctx.adjacentOwn>0&&entry&&entry.score>=65){for(const row of paid){const cap=entry.score-6;if(row.score>cap){row.political_sequence_original_score=row.score;row.score=cap;row.political_sequence='MILITARY_FOOTPRINT_FIRST';}}}
 }
 return rows;
}
function isPoliticalExpansionRow(row){const a=row.action||{},reason=String(a.strategic_reason||''),op=String(row.operation||'');return a.type==='OPINION'||['SECURITY','STOCKPILE_AID'].includes(a.type)||reason.includes('EXPAND_NEUTRAL_')||reason.includes('CIVIL_CONSOLIDATION')||op==='NEUTRAL_STATE_POLITICAL_EXPANSION';}
function isOperationalMilitaryRow(row){const a=row.action||{},reason=String(a.strategic_reason||'');if(isPoliticalExpansionRow(row))return false;if(['ATTACK','RECRUIT','IMPROVE','TRAINING','EQUIPMENT','FORM','GARRISON','TRANSPORT','SEA_TRANSPORT','FORCED_REQUISITION_AI'].includes(a.type))return true;if(a.type==='MOVE'&&!reason.includes('VOTE')&&!reason.includes('EXPAND_NEUTRAL'))return true;return false;}
function applyStrategicBalance(m,c,f,rows){
 const military=rows.filter(isOperationalMilitaryRow).sort((a,b)=>b.score-a.score),best=military[0];if(!best)return rows;
 const bestAttack=military.filter(x=>x.action?.type==='ATTACK').sort((a,b)=>b.score-a.score)[0];
 let gap=0;if(best.score>=115)gap=18;else if(best.score>=95)gap=11;else if(best.score>=80)gap=5;
 for(const row of rows){if(!isPoliticalExpansionRow(row))continue;let cap=Infinity;if(gap)cap=Math.min(cap,best.score-gap);if(bestAttack?.score>=90&&row.action?.type==='OPINION')cap=Math.min(cap,bestAttack.score-15);if(Number.isFinite(cap)&&row.score>cap){row.strategic_balance_original_score=row.score;row.score=cap;row.strategic_balance_cap=cap;}}
 return rows;
}
function preview(m,c,f,a){
 const city=c.cities?.[a.city];if(!city||P.militaryControl(m,a.city,political)!==f)throw new Error('CIVIL_CITY_NOT_CONTROLLED');
 if((m.factions?.[f]?.commands_remaining||0)<1)throw new Error('COMMANDS_EXHAUSTED');
 const army=a.commander_id?Object.values(m.field_armies||{}).find(x=>x.commander_id===a.commander_id&&x.faction===f&&x.location_city_id===a.city&&x.manpower>0&&!x.acted_this_month):null;
 if(a.commander_id&&!army)throw new Error('COMMANDER_NOT_AVAILABLE');
 const commander=army&&m.commanders[a.commander_id],sign=f==='PATRIOT'?1:-1;
 let cooperation=0,magnitude=0,food=0,materials=0;
 if(a.type==='SECURITY'){
  const score=commander?Math.round(commander.stats.charisma*.60+commander.stats.politics*.40):0;
  cooperation=commander?(score>=85?7:score>=65?6:score>=45?5:4):3;
  magnitude=commander?(score>=65?3:2):1;
 }else if(a.type==='STOCKPILE_AID'){
  food=Math.floor(Number(a.food)||0);materials=Math.floor(Number(a.materials)||0);
  if(food<0||materials<0||food+materials<=0||food>city.stockpile.FOOD||materials>city.stockpile.MATERIALS)throw new Error('STOCKPILE_AID_AMOUNT_INVALID');
  const score=commander?commander.stats.logistics*.7+commander.stats.charisma*.3:0,mult=commander?(.75+score/150):.75;
  cooperation=clamp(Math.round((food+materials)/250*mult),1,10);
  magnitude=clamp(Math.round(cooperation*.45),1,5);
 }else throw new Error('CIVIL_ACTION_INVALID');
 const before=city.politics.independence_support,after=clamp(before+sign*magnitude),beforeCoop=city.politics.public_cooperation,afterCoop=clamp(beforeCoop+cooperation);
 return{city:a.city,type:a.type,faction:f,commander_id:commander?.id||null,army_id:army?.id||null,food,materials,before,after,before_cooperation:beforeCoop,after_cooperation:afterCoop,support_change:after-before,cooperation_change:afterCoop-beforeCoop,command_cost:1};
}
function execute(m,c,f,a){const effect=preview(m,c,f,a),state=copy(m),cities=copy(c),city=cities.cities[a.city];
 city.stockpile.FOOD-=effect.food;city.stockpile.MATERIALS-=effect.materials;city.politics.independence_support=effect.after;city.politics.public_cooperation=effect.after_cooperation;
 if(effect.army_id)state.field_armies[effect.army_id].acted_this_month=true;
 state.factions[f].commands_remaining--;
 E.appendAction(state,{type:a.type==='SECURITY'?'CIVIL_SECURITY_EXECUTED':'STOCKPILE_AID_EXECUTED',faction:f,city_id:a.city,food:effect.food,materials:effect.materials,support_change:effect.support_change,cooperation_change:effect.cooperation_change});
 return{m:state,c:cities,effect};
}
function recent(m,id,f){return(m.action_log||[]).some(x=>x.year===m.calendar.year&&x.month===m.calendar.month&&x.faction===f&&x.city_id===id&&['CIVIL_SECURITY_EXECUTED','STOCKPILE_AID_EXECUTED'].includes(x.type));}
function safeReserves(m,c,id){const city=c.cities[id],troops=E.logisticsConsumptionTroopsByCity(m,phase).totals[id]||0,cloneCity={...city,stationed_field_army_consumption_troops:troops};const food=C.monthlyBalance(cloneCity,'FOOD',cityConfig),materials=C.monthlyBalance(cloneCity,'MATERIALS',cityConfig);
 return{food:Math.ceil(Math.max(200,-food.net*6+200)),materials:Math.ceil(Math.max(150,-materials.net*6+150)),food_net:food.net,materials_net:materials.net};}
function candidates(m,c,f){
 if(!candidateEnabled)return[];
 const rows=[],chief=Object.values(m.field_armies||{}).find(a=>a.faction===f&&m.commanders?.[a.commander_id]?.role==='総司令官'&&a.manpower>0),allCities=Object.values(c.cities||{}),focus=politicalFocus(m,c,f),focusMap=Object.fromEntries(focus.map(x=>[x.colony,x])),topFocus=new Set(focus.slice(0,2).map(x=>x.colony));
 // A small coastal garrison can deny supplies to a real, legal enemy landing route.
 const landingTargets=new Set(),enemy=enemyOf(f);
 for(const origin of new Set(Object.values(m.field_armies||{}).filter(a=>a.faction===enemy&&a.manpower>=1000&&c.cities[a.location_city_id]?.geography?.is_port).map(a=>a.location_city_id))){
  try{for(const id of C.getCommandCandidates(c,{command_type:'LANDING_ATTACK',origin_city_id:origin,faction:enemy}))landingTargets.add(id);}catch{}
 }
 for(const city of allCities){const id=city.city_id;if(P.militaryControl(m,id,political)!==f||recent(m,id,f))continue;
  const support=Number(city.politics.independence_support);
  if(support===(f==='PATRIOT'?100:0))continue;
  const selected=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0&&!a.acted_this_month&&m.commanders?.[a.commander_id]?.role!=='総司令官'&&(!a.battle_id||!['active','awaiting_tactic','awaiting_continuation'].includes(m.battles?.[a.battle_id]?.status))).sort((a,b)=>(m.commanders?.[b.commander_id]?.stats?.charisma||0)-(m.commanders?.[a.commander_id]?.stats?.charisma||0))[0];
  const star=city.politics.political_importance,goal=f==='PATRIOT'?58:42,dist=f==='PATRIOT'?Math.max(0,goal-support):Math.max(0,support-goal),colony=allCities.filter(x=>stateIdForCity(x)===stateIdForCity(city)),pop=colony.reduce((n,x)=>n+Number(x.bases.population||0),0),share=pop?city.bases.population/pop:0;
  const colonyOpinion=pop?Math.round(colony.reduce((n,x)=>n+Number(x.bases.population||0)*Number(x.politics.independence_support||0),0)/pop):50;
  const voteMargin=f==='PATRIOT'?60-colonyOpinion:colonyOpinion-39;
  const voteProgress=voteMargin>0&&voteMargin<=12&&((m.political_phase?.commander_reserves?.[f]?.length||0)<2)?8:0;
  const colonyId=stateIdForCity(city),ctx=focusMap[colonyId],focusBonus=topFocus.has(colonyId)?18:ctx?.sink?12:0;
  const enemyAdj=neighbors(c,id).reduce((n,x)=>n+troopsAt(m,x,enemy),0),own=troopsAt(m,id,f),threatened=enemyAdj>=Math.max(1000,own*1.2)||landingTargets.has(id),remote=chief?.location_city_id!==id;
  const commander=selected?.commander_id||null;
  for(const commanderId of [null,...(selected?[commander]:[])]){
   const base={type:'SECURITY',city:id,commander_id:commanderId,strategic_reason:'CIVIL_CONSOLIDATION',operational_reason:'SECURE_LOCAL_SUPPORT'};
   try{const p=preview(m,c,f,base),gain=Math.abs(p.support_change);if(gain<=0)continue;let score=48+gain*share*8+(dist>0&&gain>=dist?star*12:dist>0?Math.max(0,9-dist)*1.4:-16)+voteProgress+focusBonus+(p.cooperation_change>=3&&city.politics.public_cooperation<70?3:0)-(commanderId?7:0)-(threatened&&own>1000?8:0);
    if(dist>12)score-=8;rows.push({operation:'CIVIL_CONSOLIDATION',score,action:base,politicalFocus:ctx||null});}catch{}
  }
  const reserve=safeReserves(m,c,id),scorch=threatened&&remote&&own<=900&&reserve.food_net>=0&&reserve.materials_net>=0&&Number(city.stockpile.FOOD)+Number(city.stockpile.MATERIALS)>900;
  const normalFood=Math.max(0,Math.min(1200,city.stockpile.FOOD-reserve.food)),normalMaterials=Math.max(0,Math.min(700,city.stockpile.MATERIALS-reserve.materials));
  const plans=[{food:normalFood,materials:normalMaterials,scorch:false}];
  if(scorch)plans.push({food:city.stockpile.FOOD,materials:city.stockpile.MATERIALS,scorch:true});
  for(const plan of plans){if(plan.food+plan.materials<350)continue;
   for(const commanderId of [null,...(selected?[commander]:[])]){
    const a={type:'STOCKPILE_AID',city:id,food:Math.floor(plan.food),materials:Math.floor(plan.materials),commander_id:commanderId,strategic_reason:plan.scorch?'DENY_INVADER_SUPPLY':'CIVIL_CONSOLIDATION',operational_reason:plan.scorch?'SCORCHED_STOCKPILE_AID':'DISTRIBUTE_SURPLUS_STOCKPILE'};
    try{const p=preview(m,c,f,a),gain=Math.abs(p.support_change);if(gain<2&&!plan.scorch)continue;let score=42+gain*share*9+(dist>0&&gain>=dist?star*12:dist===0?-12:0)+voteProgress+focusBonus+(p.cooperation_change>=5&&city.politics.public_cooperation<70?5:0)-(plan.scorch?10:0)-(commanderId?6:0)-(plan.food+plan.materials)/550;
     if(dist>12)score-=8;rows.push({operation:plan.scorch?'SCORCHED_STOCKPILE_AID':'CIVIL_STOCKPILE_AID',score,action:a,politicalFocus:ctx||null});}catch{}
   }
  }
 }
 return rows.sort((a,b)=>b.score-a.score).slice(0,24);
}

function unresolvedBattleAt(m,id){return Object.values(m.battles||{}).some(b=>b.city_id===id&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status));}
function repairSupplyMonths(m,c,id){const city=c.cities?.[id];if(!city)return 0;const troops=E.logisticsConsumptionTroopsByCity(m,phase).totals?.[id]||0,local={...city,stationed_field_army_consumption_troops:troops},food=C.monthlyBalance(local,'FOOD',cityConfig),materials=C.monthlyBalance(local,'MATERIALS',cityConfig),months=(stock,net)=>net>=0?99:Number(stock||0)/Math.max(1,-net);return Math.min(months(city.stockpile?.FOOD,food.net),months(city.stockpile?.MATERIALS,materials.net));}
function urgentSupplyElsewhere(m,c,f,excludeId){for(const city of Object.values(c.cities||{})){const id=city.city_id;if(id===excludeId||P.militaryControl(m,id,political)!==f)continue;const troops=troopsAt(m,id,f);if(troops<1000)continue;if(repairSupplyMonths(m,c,id)<.75)return true;}return false;}
function repairCandidates(m,c,f){
 if(!candidateEnabled||(m.factions?.[f]?.commands_remaining||0)<1)return[];
 const enemy=enemyOf(f),rows=[];
 for(const city of Object.values(c.cities||{})){
  const id=city.city_id,severity=Number(city.condition?.damage_severity)||0;if(severity<=0||P.militaryControl(m,id,political)!==f||unresolvedBattleAt(m,id))continue;
  const armies=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0&&!a.acted_this_month&&!a.battle_id).sort((a,b)=>{const ca=m.commanders?.[a.commander_id],cb=m.commanders?.[b.commander_id],sa=(Number(ca?.stats?.logistics)||0)*.6+(Number(ca?.stats?.politics)||0)*.4,sb=(Number(cb?.stats?.logistics)||0)*.6+(Number(cb?.stats?.politics)||0)*.4;return sb-sa;});
  if(!armies.length)continue;
  const own=troopsAt(m,id,f),enemyAdj=neighbors(c,id).reduce((n,x)=>n+troopsAt(m,x,enemy),0),importance=Number(city.politics?.political_importance)||1,supplyMonths=repairSupplyMonths(m,c,id),portDown=Boolean(city.geography?.is_port)&&!C.isPortOperational(city),portRestored=portDown&&severity===3&&!city.naval?.blockaded_by,battleScar=Boolean(city.condition?.last_battle_period||city.condition?.last_battle_damage_period||(m.action_log||[]).some(x=>x.type==='BATTLE_CITY_DAMAGE'&&x.city_id===id)),baseWorth=importance*10+(city.geography?.is_port?12:0)+Math.min(22,own/180)+(Number(city.monthly_local_surplus?.FOOD)||0)*.15+(Number(city.monthly_local_surplus?.MATERIALS)||0)*.2;
  // Repair is deliberately non-crisis work. Do not spend a scarce command while another important force is already starving.
  if(urgentSupplyElsewhere(m,c,f,id))continue;
  // A battered city is worth repairing only if it is becoming a real operating base, or if one step restores a disabled port/retreat route.
  const operatingBase=battleScar&&own>=1500&&(importance>=3||baseWorth>=55),stalledPort=portRestored&&own>=700&&enemyAdj<=Math.max(2200,own*1.15);
  if(!operatingBase&&!stalledPort)continue;
  if(supplyMonths<1.25&&!stalledPort)continue;
  if(enemyAdj>Math.max(3500,own*1.35)&&!stalledPort)continue;
  const army=armies[0],commander=m.commanders?.[army.commander_id];if(!commander)continue;
  const effective=Math.round((Number(commander.stats?.logistics)||0)*.60+(Number(commander.stats?.politics)||0)*.40);
  try{
   const p=C.previewDamageRepair(c,id,f,effective,`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`,cityConfig);
   if(Number(m.factions?.[f]?.treasury||0)<p.treasury_cost||Number(city.stockpile?.MATERIALS||0)<p.materials_cost)continue;
   const reserveAfter=Number(m.factions?.[f]?.treasury||0)-p.treasury_cost;if(reserveAfter<250&&!portRestored)continue;
   let score=38+baseWorth*.45+severity*5+Math.min(18,p.cooperation_change*1.2+Math.abs(p.support_change)*1.4)+(supplyMonths>=3?12:supplyMonths>=2?6:0)-(enemyAdj>own?12:0)-p.treasury_cost/35-p.materials_cost/120;
   if(portRestored)score+=38;
   if(own>=3000)score+=10;
   rows.push({operation:portRestored?'RESTORE_PORT_RETREAT_ROUTE':'POST_BATTLE_BASE_REPAIR',score,action:{type:'DAMAGE_REPAIR',city:id,army_id:army.id,commander_id:commander.id,strategic_reason:portRestored?'RESTORE_PORT_RETREAT_ROUTE':'RESTORE_OPERATIONAL_BASE',operational_reason:'POST_BATTLE_RECOVERY'},repair_preview:p,supply_months:Math.round(supplyMonths*10)/10,own_force:own,enemy_adjacent:enemyAdj});
  }catch{}
 }
 return rows.filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
}
function executeRepair(m,c,f,a){
 const army=m.field_armies?.[a.army_id],commander=army&&m.commanders?.[army.commander_id];if(!army||army.faction!==f||army.location_city_id!==a.city||army.acted_this_month)throw new Error('REPAIR_COMMANDER_NOT_AVAILABLE');
 if(unresolvedBattleAt(m,a.city))throw new Error('REPAIR_DURING_BATTLE_FORBIDDEN');
 const effective=Math.round((Number(commander?.stats?.logistics)||0)*.60+(Number(commander?.stats?.politics)||0)*.40),periodKey=`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`,out=C.executeDamageRepair(c,a.city,f,effective,periodKey,cityConfig,{military_state:m,army_id:army.id,commander_id:commander?.id||null});
 return{m:out.military_state,c:out.state,effect:out.result,events:out.events};
}

module.exports={preview,execute,candidates,repairCandidates,executeRepair,safeReserves,politicalFocus,opinionCandidates,reweightPoliticalRows,applyStrategicBalance,currentMonthOpinionCount,setCandidateEnabled(value){candidateEnabled=Boolean(value);}};
};
modules['AI_OFFICIAL_CURRENT/trust_strategy_v1.js']=function(require,module,exports){
'use strict';
// Shared political-survival policy. Projections do not spend commands or roll battles.
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const B=require('../runtime/battle_engine_v0_74_retreat.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const config=require('../source_data/political_phase_config_v0_1.json');
const clamp=n=>Math.max(0,Math.min(100,n));
const LOSS_LIMIT=10,CRITICAL_TRUST=25;
const ANCHORS=[[10,64],[18,40],[25,28],[40,14],[55,6],[70,3],[100,1.5]];
function weight(value){
 const v=clamp(value);if(v<=10)return 64;
 for(let i=1;i<ANCHORS.length;i++){const [lo,a]=ANCHORS[i-1],[hi,b]=ANCHORS[i];if(v<=hi)return a+(b-a)*(v-lo)/(hi-lo);}return 1.5;
}
function forecast(m,c,f){
 const p=m.political_phase||{},current=Number(p.trust_value?.[f]??(f==='PATRIOT'?64:62));
 const stars=P.strategicStars(c,m,config)[f],previous=p.evaluation_snapshot?.[f];
 const raw=previous?(p.battle_trust_ledger?.[f]||[]).reduce((n,e)=>n+Number(e.raw_change||0),0):0;
 const cap=Number(config.battle_trust.quarterly_cap),battle=Math.max(-cap,Math.min(cap,raw));
 const delta=previous?stars-Number(previous.strategic_stars):0;
 const star=previous?(config.national_indicators.strategic_star_trust_change.find(r=>delta>=r.min_delta)?.change||0):0;
 const next=clamp(current+battle+star),effective=Math.min(current,next);
 return {current,next,battle,star,stars,star_delta:delta,effective,weight:weight(effective),critical:effective<=CRITICAL_TRUST};
}
function evaluate(m,projected,c,board,f,transition=null,before=forecast(m,c,f)){
 const direct=Number(transition?.trust_change)||0,currentAfter=clamp(before.current+direct);
 const probe={...projected,political_phase:{...m.political_phase,trust_value:{...m.political_phase?.trust_value,[f]:currentAfter}}};
 const after=forecast(probe,board,f),loss=Math.max(0,-direct,before.next-after.next);
 const effective=Math.min(before.effective,after.effective),cost=loss*weight(effective);
 const blocked=loss>0&&(currentAfter<=LOSS_LIMIT||after.next<=LOSS_LIMIT||before.critical||after.effective<=CRITICAL_TRUST);
 const recovery=Math.max(0,after.next-before.next),starGain=Math.max(0,after.stars-before.stars);
 return {allowed:!blocked,reason:blocked?(currentAfter<=LOSS_LIMIT||after.next<=LOSS_LIMIT?'POLITICAL_DEFEAT_FROM_OWN_ORDER':'CRITICAL_TRUST_PRESERVE'):'TRUST_WITHIN_SURVIVAL_MARGIN',before,after,direct_change:direct,loss,weight:weight(effective),penalty:cost,recovery,star_gain:starGain};
}
function departure(m,projected,c,board,f,origin,cause='ARMY_MOVE',before){
 const transition=P.previewCityControlTransition(projected,c,origin,f,P.militaryControl(m,origin,config),P.militaryControl(projected,origin,config),cause,config);
 return {transition,policy:evaluate(m,projected,c,board,f,transition,before)};
}
function project(m,c,f,a,before){
 let projected=m,board=c,transition=null;
 if(['MOVE','ATTACK'].includes(a.type)){
  const origin=a.origin||m.field_armies?.[a.ids?.[0]]?.location_city_id;
  if(!origin||!c.cities[a.target])return null;
  projected={...m,field_armies:{...m.field_armies}};
  for(const id of a.ids||[])if(m.field_armies[id])projected.field_armies[id]={...m.field_armies[id],location_city_id:a.target};
  return departure(m,projected,c,c,f,origin,a.type==='ATTACK'?'ATTACK_DEPARTURE_CONFIRMED':'ARMY_MOVE',before).policy;
 }
 if(a.type==='BATTLE_REINFORCEMENT'){
  projected=B.reinforceBattle(m,a.battle_id,a.ids,c,E).state;
  const origin=a.origin||m.field_armies?.[a.ids?.[0]]?.location_city_id;
  if(origin)transition=P.previewCityControlTransition(projected,c,origin,f,P.militaryControl(m,origin,config),P.militaryControl(projected,origin,config),'AI_REINFORCEMENT',config);
 }else if(['BATTLE_WITHDRAW','PREBATTLE_WITHDRAW'].includes(a.type)){
  const out=a.type==='PREBATTLE_WITHDRAW'?B.withdrawDefenderBeforeBattle(m,a.battle_id,c,E,phase,a.retreat_city_id):B.withdrawBattle(m,a.battle_id,f,c,E,phase);
  if(!out.withdrawn)return null;projected=out.state;const city=m.battles[a.battle_id].city_id;
  transition=P.previewCityControlTransition(projected,c,city,f,P.militaryControl(m,city,config),P.militaryControl(projected,city,config),'AI_CONTINUATION_WITHDRAWAL',config);
 }else if(a.type==='GARRISON'){
  const old=m.garrisons?.[a.city];if(!old)return null;
  projected={...m,garrisons:{...m.garrisons,[a.city]:{...old,faction:f,manpower:Number(old.manpower||0)+Number(a.troops||0)}}};
 }else if(a.type==='OPINION'){
  const p=E.previewOpinionCampaign({...m,current_faction:f},c,a.city,a.tier,phase,null);
  board={...c,cities:{...c.cities,[a.city]:{...c.cities[a.city],politics:{...c.cities[a.city].politics,independence_support:p.after}}}};
 }else if(['SECURITY','STOCKPILE_AID'].includes(a.type)){
  const p=require('./civil_operations_v1.js').preview(m,c,f,a);
  board={...c,cities:{...c.cities,[a.city]:{...c.cities[a.city],politics:{...c.cities[a.city].politics,independence_support:p.after,public_cooperation:p.after_cooperation}}}};
 }else if(a.type==='FORCED_REQUISITION_AI'||(['IMPROVE','RECRUIT','TRAINING'].includes(a.type)&&a.kind)){
  const kind=a.type==='FORCED_REQUISITION_AI'?'FORCED_REQUISITION':a.kind;
  const effect=E.previewFieldArmyAction({...m,current_faction:f},a.army_id,kind,phase,c.cities[a.city]);
  const city=c.cities[a.city];board={...c,cities:{...c.cities,[a.city]:{...city,politics:{...city.politics,independence_support:clamp(Number(city.politics.independence_support)+Number(effect.support_change||0)),public_cooperation:clamp(Number(city.politics.public_cooperation)+Number(effect.cooperation_change||0))}}}};
 }else if(a.type==='DAMAGE_REPAIR'){
  const out=require('./civil_operations_v1.js').executeRepair(m,c,f,a);projected=out.m;board=out.c;
 }else return evaluate(m,m,c,c,f,null,before);
 return evaluate(m,projected,c,board,f,transition,before);
}
function applyRows(m,c,f,rows){
 const before=forecast(m,c,f),cache=new Map(),out=[];
 for(const row of rows){
  const a=row.action||{},existing=row.departure?.trust_policy||row.combat_value?.departure?.trust_policy||row.rescue_value?.departure?.trust_policy;
  let policy=existing;
  try{if(!policy){const key=JSON.stringify(a);if(!cache.has(key))cache.set(key,project(m,c,f,a,before));policy=cache.get(key);}}catch{continue;}
  if(!policy||!policy.allowed)continue;
  let bonus=policy.recovery*before.weight;
  bonus+=policy.star_gain*Math.min(9,Math.max(0,before.weight-3)*.3);
  if(a.type==='GARRISON'&&Number(m.garrisons?.[a.city]?.manpower||0)<100&&P.supportFaction(c.cities[a.city]?.politics?.independence_support,config)===f)bonus+=Math.min(48,Math.max(0,before.weight-3)*1.1);
  out.push({...row,score:row.score-(existing?0:policy.penalty)+bonus,trust_policy:policy,trust_priority_bonus:bonus});
 }
 return out;
}
function allowsAction(m,c,f,a){try{return Boolean(project(m,c,f,a)?.allowed);}catch{return false;}}
module.exports={forecast,weight,evaluate,departure,project,applyRows,allowsAction,LOSS_LIMIT,CRITICAL_TRUST,ANCHORS};
};
modules['AI_OFFICIAL_CURRENT/combat_projection_v1.js']=function(require,module,exports){
'use strict';
// Pure combat probes need the live board, forces and battle status, not campaign diary payloads.
// Only probe states discard these histories; executable military states retain every record.
function compact(m){
 return {...m,action_log:[],political_phase:undefined,opinion_campaign_history:undefined,ai_runtime:undefined,ai_strategy_state:undefined,
  battles:Object.fromEntries(Object.entries(m.battles||{}).map(([id,b])=>[id,{...b,history:[]}]))};
}
function copy(m){return JSON.parse(JSON.stringify(compact(m)));}
module.exports={compact,copy};
};
modules['AI_OFFICIAL_CURRENT/logistics_strategy_v1.js']=function(require,module,exports){
'use strict';
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const cityConfig=require('../source_data/city_command_config_v0_17.json');
const political=require('../source_data/political_phase_config_v0_1.json');
function control(m,id){return P.militaryControl(m,id,political);}
function activeBattle(m,a){const b=a?.battle_id&&m.battles?.[a.battle_id];return !!b&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status);}
function totals(m){return E.logisticsConsumptionTroopsByCity(m,phase).totals||{};}
function balanceFor(m,c,id,extra=0){return require('./operational_readiness_v1.js').balanceFor(m,c,id,extra);}
function arrivalManpower(m,a){return (a?.ids||[]).reduce((n,id)=>n+(Number(m.field_armies?.[id]?.manpower)||0),0);}
function reweightRows(m,c,faction,rows){for(const row of rows){const a=row.action||{};if(a.type==='MOVE'&&a.target){let plan=null;try{plan=planMoveSupply(m,c,faction,a);}catch{}const b=plan?.destination_balance||balanceFor(m,c,a.target,arrivalManpower(m,a));if(b){const months=plan?plan.destination_supply_months:b.months;if(months<.75)row.score-=55;else if(months<1.2)row.score-=25;else if(months>=2.5)row.score+=10;row.logistics_months=Math.round(months*10)/10;if(plan)row.move_supply={mode:plan.mode,food:plan.command.food_amount,materials:plan.command.materials_amount,origin_reserve:plan.origin_reserve,arrived:plan.preview.arrived};}}
 if(a.type==='FORM'&&a.city){const b=balanceFor(m,c,a.city,Number(phase.field_army_formation?.initial_manpower)||1000);if(b){if(b.months<1.0)row.score-=50;else if(b.months>=2.0)row.score+=12;row.logistics_months=Math.round(b.months*10)/10;}}
 if(['RECRUIT','IMPROVE'].includes(a.type)&&a.city){const b=balanceFor(m,c,a.city,500);if(b&&b.months<.8)row.score-=35;}
 if(a.type==='ATTACK'&&a.target){const origin=a.origin||(a.ids?.[0]&&m.field_armies?.[a.ids[0]]?.location_city_id);const ob=origin?balanceFor(m,c,origin,0):null,target=c.cities?.[a.target];if(target){const booty=(Number(target.stockpile?.FOOD)||0)+(Number(target.stockpile?.MATERIALS)||0)*1.35;const weakSupply=ob&&ob.months<1.3;if(weakSupply&&booty>=1800)row.score+=Math.min(38,12+booty/180);else if(booty>=2800)row.score+=Math.min(18,booty/300);row.supply_capture_value=Math.round(booty);}}
 }
 return rows;
}
function executeTransport(m,c,faction,a){
 const board=JSON.parse(JSON.stringify(c));for(const city of Object.values(board.cities))city.politics.military_control=control(m,city.city_id);
 const route=a.route||'TRANSPORT_LAND';if(!['TRANSPORT_LAND','SEA_TRANSPORT'].includes(route))throw new Error('AI_TRANSPORT_ROUTE_INVALID');
 const result=C.executeCommand(board,{command_type:route,origin_city_id:a.origin,destination_city_id:a.target,food_amount:a.food||0,materials_amount:a.materials||0},cityConfig,{faction,controlled_sea_zones:[],period_key:m.calendar.year+'-'+String(m.calendar.month).padStart(2,'0')});
 const military=E.spendCommand(m,faction,'SUPPLY_TRANSPORT',1);for(const id of [a.origin,a.target])if(military.city_logistics?.[id]){military.city_logistics[id].food_stock=result.state.cities[id].stockpile.FOOD;military.city_logistics[id].material_stock=result.state.cities[id].stockpile.MATERIALS;}
 return{military,cities:result.state,kind:'TRANSPORT',city_id:a.target,transport_result:result.result};
}
function transportCandidates(m,c,faction){
 const rows=[],board=JSON.parse(JSON.stringify(c));for(const city of Object.values(board.cities))city.politics.military_control=control(m,city.city_id);C.recalculateCapacities(board,cityConfig);
 for(const [id,city] of Object.entries(board.cities)){
  if(control(m,id)!==faction)continue;const b=balanceFor(m,board,id);if(!b||b.months>=1.5)continue;
  const chief=Object.values(m.commanders||{}).find(x=>x.faction===faction&&x.role==='総司令官'),chiefHere=chief&&m.field_armies?.[chief.assigned_army_id]?.location_city_id===id;
  for(const [origin,donor] of Object.entries(board.cities)){
   if(origin===id||control(m,origin)!==faction)continue;const db=balanceFor(m,board,origin);if(!db||db.months<2)continue;
   const available={FOOD:Math.max(0,db.foodStock-Math.max(700,Math.max(0,-db.foodNet)*2+1)),MATERIALS:Math.max(0,db.materialStock-Math.max(450,Math.max(0,-db.materialNet)*2+1))};
   for(const route of ['TRANSPORT_LAND','SEA_TRANSPORT'])try{
    if(!C.getCommandCandidates(board,{command_type:route,origin_city_id:origin,faction}).includes(id))continue;
    const rate=route==='SEA_TRANSPORT'?require('./naval_api_v1.js').seaRouteProfile(board,donor.geography.sea_zone_id,city.geography.sea_zone_id,faction,'SEA_TRANSPORT',m.calendar.year+'-'+String(m.calendar.month).padStart(2,'0')).arrival_rate:1;if(!(rate>0))continue;
    const needFood=b.foodMonths<1.5?Math.min(Math.max(0,city.capacity.FOOD-b.foodStock),Math.max(500,1200-b.foodStock)):0,needMaterials=b.materialMonths<1.5?Math.min(Math.max(0,city.capacity.MATERIALS-b.materialStock),Math.max(300,750-b.materialStock)):0;
    const food=Math.floor(Math.min(1800,available.FOOD,Math.ceil(needFood/rate))),materials=Math.floor(Math.min(1200,available.MATERIALS,Math.ceil(needMaterials/rate)));
    if(food<250&&materials<200)continue;
    const preview=C.previewTransportCommand(board,{command_type:route,origin_city_id:origin,destination_city_id:id,food_amount:food,materials_amount:materials},cityConfig,{faction,period_key:m.calendar.year+'-'+String(m.calendar.month).padStart(2,'0')});
    if((preview.arrived?.FOOD||0)<250&&(preview.arrived?.MATERIALS||0)<200)continue;
    const stockMonths=(stock,net)=>net>=0?99:stock/Math.max(1,-net),after=Math.min(stockMonths(b.foodStock+(preview.arrived.FOOD||0),b.foodNet),stockMonths(b.materialStock+(preview.arrived.MATERIALS||0),b.materialNet));
    if(after<=b.months+.1)continue;
    rows.push({operation:'LOGISTICS_RESUPPLY',score:(chiefHere?245:175)+(1.5-b.months)*32-Math.max(0,1-rate)*24,transport_preview:preview,action:{type:'TRANSPORT',route,origin,target:id,food,materials,strategic_reason:chiefHere?'SUPPLY_COMMANDER_IN_CHIEF':'SUPPLY_THREATENED_FRONT',operational_reason:'LOGISTICS_RESUPPLY'}});
   }catch{}
  }
 }
 return rows.sort((a,b)=>b.score-a.score).slice(0,6);
}
function disperseCandidates(m,c,faction){const rows=[];for(const [id,city] of Object.entries(c.cities||{})){if(control(m,id)!==faction)continue;const b=balanceFor(m,c,id);if(!b||b.months>=.8)continue;const armies=Object.values(m.field_armies||{}).filter(a=>a.faction===faction&&a.location_city_id===id&&!a.acted_this_month&&!activeBattle(m,a)&&a.manpower>0).sort((a,b)=>{const ar=m.commanders?.[a.commander_id]?.role==='総司令官'?1:0,br=m.commanders?.[b.commander_id]?.role==='総司令官'?1:0;return ar-br||a.manpower-b.manpower;});for(const a of armies){let legal=[];try{legal=C.getCommandCandidates(c,{command_type:'MOVE',origin_city_id:id,faction});}catch{}for(const target of legal){if(control(m,target)!==faction)continue;const tb=balanceFor(m,c,target,a.manpower);if(!tb||tb.months<1.35||tb.months<=b.months+.45)continue;const chief=m.commanders?.[a.commander_id]?.role==='総司令官';if(chief&&b.months>.3)continue;const action={type:'MOVE',ids:[a.id],origin:id,target,route:'MOVE',strategic_reason:'RELIEVE_SUPPLY_PRESSURE',operational_reason:'LOGISTICS_DISPERSAL'};const leave=require('./normal_operations_v1.js').departure(m,c,faction,action);if(!leave.safe)continue;rows.push({operation:'LOGISTICS_DISPERSAL',score:(chief?255:165)+(0.8-b.months)*35+(tb.months>=2?12:0)-leave.penalty,action,departure:leave});}}
 }
 return rows.sort((a,b)=>b.score-a.score).slice(0,6);}

function enemyOf(faction){return faction==='PATRIOT'?'BRITISH':'PATRIOT';}
function landNeighbors(c,id){const out=[];for(const e of c.topology?.edges||[]){if(String(e.type||'').startsWith('water_')||e.counts_as_land_adjacency===false)continue;if(e.a===id)out.push(e.b);else if(e.b===id)out.push(e.a);}return [...new Set(out)];}
function troopsAt(m,id,faction){return Object.values(m.field_armies||{}).filter(a=>a.faction===faction&&a.location_city_id===id&&a.manpower>0).reduce((n,a)=>n+Number(a.manpower||0),0)+(m.garrisons?.[id]?.faction===faction?Number(m.garrisons[id].manpower||0):0);}
function requisitionCandidates(m,c,faction){
 const rows=[],enemy=enemyOf(faction),resupplyTargets=new Set(transportCandidates(m,c,faction).map(row=>row.action?.target).filter(Boolean));
 for(const [id,city] of Object.entries(c.cities||{})){
  if(control(m,id)!==faction||resupplyTargets.has(id))continue;
  const b=balanceFor(m,c,id);if(!b)continue;
  const emergency=b.months<.75||b.foodStock<=120||b.materialStock<=60;if(!emergency)continue;
  const own=troopsAt(m,id,faction),enemyAdj=landNeighbors(c,id).reduce((n,x)=>n+troopsAt(m,x,enemy),0),importance=Number(city.politics?.political_importance)||1,armies=Object.values(m.field_armies||{}).filter(a=>a.faction===faction&&a.location_city_id===id&&a.manpower>0&&!a.acted_this_month&&!activeBattle(m,a));
  if(!armies.length)continue;
  const chiefHere=armies.some(a=>m.commanders?.[a.commander_id]?.role==='総司令官'),frontValue=importance*12+(city.geography?.is_port?9:0)+Math.min(32,own/120)+Math.min(28,enemyAdj/140)+(chiefHere?34:0),worthHolding=frontValue>=58&&(enemyAdj>=500||importance>=4||chiefHere||own>=2500);
  // If the place is not worth holding, do not punish the population to save it; movement/dispersal remains the preferred answer.
  if(!worthHolding)continue;
  for(const army of armies){try{
    const p=E.previewFieldArmyAction(m,army.id,'FORCED_REQUISITION',phase,city);if((p.food_gain||0)+(p.materials_gain||0)<150)continue;
    const penalty=Math.abs(Number(p.cooperation_change)||0)+Math.abs(Number(p.support_change)||0),depth=b.months<.25?65:b.months<.5?42:20,score=150+depth+frontValue*.55+Math.min(28,(p.food_gain||0)*.022+(p.materials_gain||0)*.035)-penalty*4;
    rows.push({operation:'EMERGENCY_FORCED_REQUISITION',score,action:{type:'FORCED_REQUISITION_AI',army_id:army.id,city:id,strategic_reason:'HOLD_VALUABLE_STARVING_FRONT',operational_reason:'NO_RESUPPLY_FOR_VALUABLE_FRONT'},supply_months:Math.round(b.months*10)/10,front_value:Math.round(frontValue),enemy_adjacent:enemyAdj,requisition_preview:p});
  }catch{}}
 }
 return rows.sort((a,b)=>b.score-a.score).slice(0,6);
}
function executeRequisition(m,c,faction,a){
 const army=m.field_armies?.[a.army_id];if(!army||army.faction!==faction||army.location_city_id!==a.city||army.acted_this_month||activeBattle(m,army))throw new Error('REQUISITION_ARMY_NOT_AVAILABLE');
 const out=E.improveFieldArmy(m,army.id,'FORCED_REQUISITION',phase,c.cities[a.city]),cities=JSON.parse(JSON.stringify(c)),city=cities.cities[a.city],effect=out.result;
 if(effect.food_gain)city.stockpile.FOOD=Math.min(city.capacity.FOOD,Number(city.stockpile.FOOD||0)+effect.food_gain);
 if(effect.materials_gain)city.stockpile.MATERIALS=Math.min(city.capacity.MATERIALS,Number(city.stockpile.MATERIALS||0)+effect.materials_gain);
 if(effect.support_change)city.politics.independence_support=Math.max(0,Math.min(100,Number(city.politics.independence_support||0)+effect.support_change));
 if(effect.cooperation_change)city.politics.public_cooperation=Math.max(0,Math.min(100,Number(city.politics.public_cooperation||0)+effect.cooperation_change));
 if(out.state.city_logistics?.[a.city]){out.state.city_logistics[a.city].food_stock=city.stockpile.FOOD;out.state.city_logistics[a.city].material_stock=city.stockpile.MATERIALS;}
 return{military:out.state,cities,effect};
}


// Cargo accompanies the existing movement command; it is never a separate transport order.
const MOVE_SUPPLY_RULES=Object.freeze({reserve_months:3,origin_food_buffer:650,origin_materials_buffer:400,destination_food_buffer:800,destination_materials_buffer:500,destination_materials_per_moving_man:.03});
function moveBalance(m,c,id,extra=0){
 const city=c.cities[id],effective=(totals(m)[id]||0)+Math.max(0,extra),gar=Math.max(0,Number(m.garrisons?.[id]?.manpower)||0);
 const local={...city,garrison:{...city.garrison,troops:gar},stationed_field_army_consumption_troops:effective};
 const food=C.monthlyBalance(local,'FOOD',cityConfig),materials=C.monthlyBalance(local,'MATERIALS',cityConfig);
 return{foodStock:Number(city.stockpile.FOOD)||0,materialStock:Number(city.stockpile.MATERIALS)||0,foodNet:food.net,materialNet:materials.net,troops:effective,garrison:gar};
}
function planMoveSupply(m,c,faction,a){
 if(a?.type!=='MOVE')throw new Error('AI_MOVE_SUPPLY_ACTION_INVALID');
 const ids=[...new Set(a.ids||[])],first=m.field_armies?.[ids[0]],origin=first?.location_city_id,target=a.target,route=a.route||'MOVE';
 if(!first||first.faction!==faction||!['MOVE','SEA_MOVE'].includes(route)||!c.cities?.[origin]||!c.cities?.[target])throw new Error('AI_MOVE_SUPPLY_ROUTE_INVALID');
 // Moving a cloned force checks availability and models the troops which still need the old depot.
 // This is a supply probe only. Campaign diaries and political payloads are
 // retained by the real move executor, and are not inputs to consumption/control.
 const projected=E.moveFieldArmies(require('./combat_projection_v1.js').compact(m),ids,target,route,phase),board=JSON.parse(JSON.stringify(c));
 C.recalculateCapacities(board,cityConfig);
 for(const city of Object.values(board.cities))city.politics.military_control=control(m,city.city_id);
 const context={faction,period_key:m.calendar.year+'-'+String(m.calendar.month).padStart(2,'0')};
 const command={command_type:route,origin_city_id:origin,destination_city_id:target,food_amount:0,materials_amount:0};
 const empty=C.previewMoveSupply(board,command,cityConfig,context);
 const remaining=troopsAt(projected,origin,faction),source=moveBalance(projected,board,origin),destination=moveBalance(projected,board,target);
 const neighbors=landNeighbors(board,origin),enemy=enemyOf(faction),enemyNear=Math.max(0,...neighbors.map(id=>Object.values(projected.field_armies||{}).filter(x=>x.faction===enemy&&x.location_city_id===id&&!activeBattle(projected,x)).reduce((n,x)=>n+Math.max(0,Number(x.manpower)||0),0)));
 // Use legal landing attacks as well as land adjacency. An empty depot needs
 // a hypothetical minimum guard solely for the battle engine's defender check.
 const Crisis=require('./breakthrough_crisis_v2.js'),threatState=JSON.parse(JSON.stringify(projected));
 if(control(threatState,origin)!==faction)threatState.garrisons[origin]={...threatState.garrisons[origin],faction,manpower:100};
 const directThreat=Crisis.directThreat(threatState,board,faction,origin);
 // Keep a small reserve only at a junction which an enemy cannot currently attack.
 let incoming=0;
 if(!remaining&&source.troops<=0&&enemyNear===0&&!directThreat.manpower){
  const futureBoard=JSON.parse(JSON.stringify(board));futureBoard.cities[origin].politics.military_control=control(projected,origin);
  for(const id of neighbors.filter(id=>id!==target)){
   const candidates=Object.values(projected.field_armies||{}).filter(x=>x.faction===faction&&x.location_city_id===id&&!x.acted_this_month&&!activeBattle(projected,x)&&x.manpower>0);
   if(candidates.length&&C.getCommandCandidates(futureBoard,{command_type:'MOVE',origin_city_id:id,faction}).includes(origin))incoming=Math.max(incoming,candidates.reduce((n,x)=>n+x.manpower,0));
  }
 }
 const retained=remaining>0||source.troops>0||control(projected,origin)===faction||incoming>0;
 const atRisk=(enemyNear>0&&enemyNear>remaining*1.30)||directThreat.ratio>=1.30;
 const mode=!retained?'EVACUATE_DEPOT':atRisk?'RECOVER_THREATENED_SURPLUS':incoming>0&&remaining===0?'PRESERVE_REAR_JUNCTION':'REBALANCE_SUPPLY';
 const reservedBalance=incoming>0?moveBalance(projected,board,origin,incoming):source,origin_reserve={FOOD:0,MATERIALS:0},moving=ids.reduce((n,id)=>n+Math.max(0,Number(m.field_armies[id]?.manpower)||0),0);
 const nets={FOOD:reservedBalance.foodNet,MATERIALS:reservedBalance.materialNet},targetNets={FOOD:destination.foodNet,MATERIALS:destination.materialNet};
 for(const resource of ['FOOD','MATERIALS']){
  const stock=Number(board.cities[origin].stockpile[resource])||0,buffer=resource==='FOOD'?MOVE_SUPPLY_RULES.origin_food_buffer:MOVE_SUPPLY_RULES.origin_materials_buffer;
  origin_reserve[resource]=retained?Math.min(stock,Math.ceil(buffer+Math.max(0,-nets[resource])*MOVE_SUPPLY_RULES.reserve_months)):0;
  const available=Math.max(0,stock-origin_reserve[resource]),free=Math.max(0,Number(board.cities[target].capacity[resource])-Number(board.cities[target].stockpile[resource]));
  const desiredBuffer=resource==='FOOD'?MOVE_SUPPLY_RULES.destination_food_buffer:MOVE_SUPPLY_RULES.destination_materials_buffer+moving*MOVE_SUPPLY_RULES.destination_materials_per_moving_man;
  const targetNeed=Math.max(0,Math.ceil(desiredBuffer+Math.max(0,-targetNets[resource])*MOVE_SUPPLY_RULES.reserve_months)-Number(board.cities[target].stockpile[resource]));
  const recover=mode==='EVACUATE_DEPOT'||mode==='RECOVER_THREATENED_SURPLUS',wanted=Math.min(free,recover?free:targetNeed),rate=Number(empty.arrival_rate)||0;
  command[resource==='FOOD'?'food_amount':'materials_amount']=rate>0?Math.min(available,Math.ceil(wanted/rate)):0;
 }
 const preview=C.previewMoveSupply(board,command,cityConfig,context),months=(stock,net)=>net>=0?99:stock/Math.max(1,-net);
 return{origin,target,mode,command,context,origin_reserve,remaining_friendly_manpower:remaining,incoming_possible_manpower:incoming,enemy_adjacent_manpower:enemyNear,enemy_direct_threat:directThreat,destination_balance:destination,destination_supply_months:Math.min(months(destination.foodStock+preview.arrived.FOOD,destination.foodNet),months(destination.materialStock+preview.arrived.MATERIALS,destination.materialNet)),preview};
}
function executeMoveWithSupply(m,c,faction,a,engines,moveExecutor){
 const plan=planMoveSupply(m,c,faction,a),board=JSON.parse(JSON.stringify(c));
 for(const city of Object.values(board.cities))city.politics.military_control=control(m,city.city_id);
 // Both calls return new states. If route or army validation fails, the input campaign stays untouched.
 const supply=C.executeMoveSupply(board,plan.command,cityConfig,plan.context);
 const moved=moveExecutor(m,supply.state,{...a,origin:plan.origin,route:plan.command.command_type},engines),military=moved.military,cities=moved.cities||supply.state;
 for(const id of [plan.origin,plan.target]){
  cities.cities[id].politics.military_control=control(military,id);
  if(military.city_logistics?.[id]){military.city_logistics[id].food_stock=cities.cities[id].stockpile.FOOD;military.city_logistics[id].material_stock=cities.cities[id].stockpile.MATERIALS;}
 }
 E.appendAction(military,{type:'AI_MOVE_SUPPLY',faction,army_ids:[...new Set(a.ids||[])],origin_city_id:plan.origin,destination_city_id:plan.target,route_type:plan.command.command_type,mode:plan.mode,origin_reserve:plan.origin_reserve,remaining_friendly_manpower:plan.remaining_friendly_manpower,incoming_possible_manpower:plan.incoming_possible_manpower,enemy_adjacent_manpower:plan.enemy_adjacent_manpower,enemy_direct_threat:plan.enemy_direct_threat,shipped:supply.result.shipped,arrived:supply.result.arrived,transit_loss:supply.result.transit_loss,discarded:supply.result.discarded,command_cost:0,included_in_move_command:true});
 return{...moved,military,cities,move_supply:supply.result};
}

function chiefSupplyCandidate(m,c,faction){
  const chief=require('./breakthrough_crisis_v2.js').chiefArmy(m,faction);if(!chief)return null;
  const id=chief.location_city_id,city=c.cities?.[id];if(!city||control(m,id)!==faction)return null;
  const troops=E.logisticsConsumptionTroopsByCity(m,phase).totals;
  const balance=r=>C.monthlyBalance({...city,stationed_field_army_consumption_troops:troops[id]||0},r,cityConfig);
  const food=balance('FOOD'),materials=balance('MATERIALS');
  const foodStock=Number(city.stockpile.FOOD)||0,materialStock=Number(city.stockpile.MATERIALS)||0;
  const foodNeed=Math.max(0,500-foodStock-food.net*3),materialNeed=Math.max(0,250-materialStock-materials.net*3);
  if(foodNeed<250&&materialNeed<200)return null;
  const rows=[];
  for(const origin of Object.keys(c.cities||{})){
    const donor=c.cities[origin];if(control(m,origin)!==faction)continue;
    if(!C.getCommandCandidates(c,{command_type:'TRANSPORT_LAND',origin_city_id:origin,faction:faction}).includes(id))continue;
    const ownTroops=troops[origin]||0;
    const donorBalance=r=>C.monthlyBalance({...donor,stationed_field_army_consumption_troops:ownTroops},r,cityConfig);
    const foodReserve=Math.max(650,350-Math.min(0,donorBalance('FOOD').net)*3);
    const materialReserve=Math.max(400,200-Math.min(0,donorBalance('MATERIALS').net)*3);
    const availableFood=Math.max(0,Math.min(Number(donor.stockpile.FOOD)-foodReserve,Number(city.capacity.FOOD)-foodStock));
    const availableMaterials=Math.max(0,Math.min(Number(donor.stockpile.MATERIALS)-materialReserve,Number(city.capacity.MATERIALS)-materialStock));
    const foodAmount=foodNeed>=250?Math.floor(Math.min(1600,availableFood,Math.max(800,foodNeed+500))):0;
    const materialsAmount=materialNeed>=200?Math.floor(Math.min(1000,availableMaterials,Math.max(400,materialNeed+250))):0;
    if(foodAmount<250&&materialsAmount<200)continue;
    const action={type:'TRANSPORT',origin,target:id,food:foodAmount,materials:materialsAmount,strategic_reason:'SUSTAIN_COMMANDER_FRONT',operational_reason:'SUPPLY_COMMANDER_IN_CHIEF'};
    try{const p=C.previewTransportCommand(c,{command_type:'TRANSPORT_LAND',origin_city_id:origin,destination_city_id:id,food_amount:foodAmount,materials_amount:materialsAmount},cityConfig,{faction:faction});if((p.arrived.FOOD||0)<250&&(p.arrived.MATERIALS||0)<200)continue;}catch{continue;}
    const immediate=foodStock+food.net<150||materialStock+materials.net<100;
    rows.push({operation:'SUSTAIN_COMMANDER_FRONT',score:(immediate?275:210)+foodAmount*.013+materialsAmount*.005,action});
  }
  rows.sort((a,b)=>b.score-a.score);return rows[0]||null;
}

module.exports={executeTransport,chiefSupplyCandidate,MOVE_SUPPLY_RULES,planMoveSupply,executeMoveWithSupply,balanceFor,reweightRows,transportCandidates,disperseCandidates,requisitionCandidates,executeRequisition};
};
modules['AI_OFFICIAL_CURRENT/royalist_strategy_ai_v6_base.js']=function(require,module,exports){
const Normal=require('./normal_operations_v1.js');
const native=require('../runtime/royalist_ai_turn_v1_15.js');
const BRITISH='BRITISH',PATRIOT='PATRIOT';
const date=m=>`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
function operationalCandidates(m,c){return Normal.operationalCandidates(m,c,BRITISH);}
function strategicCandidates(m,c){return Normal.strategicCandidates(m,c,BRITISH);}
function chooseAction(m,c){if((m.factions?.BRITISH?.commands_remaining||0)<1)return null;return Normal.continuation(m,BRITISH)||operationalCandidates(m,c).choice?.action||null;}
function strategicMode(m,c){return strategicCandidates(m,c)[0]?.id||'ROYALIST_GENERAL';}
function executeNonBattle(m,c,a,engines){
 if(a.type==='GARRISON'){const out=engines.army.formGarrison(m,a.city,BRITISH,a.troops,engines.phaseConfig),cities=JSON.parse(JSON.stringify(c));cities.cities[a.city].stockpile.MATERIALS-=out.materials_cost;return{military:out.state,cities,kind:'GARRISON',city_id:a.city};}
 if(a.type==='TRAINING'){
   const out=engines.army.improveFieldArmy(m,a.army_id,'TRAINING',engines.phaseConfig,c.cities[a.city]);
   return{military:out.state,cities:c,kind:'TRAINING',city_id:a.city};
 }
 if(a.type==='NAVAL'){
   const cities=JSON.parse(JSON.stringify(c));for(const city of Object.values(cities.cities))city.politics.military_control=engines.political.militaryControl(m,city.city_id,engines.politicalConfig);
   const activated=engines.naval.activateOperation(cities,a.zone,BRITISH,a.operation,date(m),{target_city_id:a.target_city_id||a.target});
   let next=engines.army.spendCommand(m,BRITISH,'NAVAL_OPERATION',1);
   if(a.operation==='PRIVATEERING'&&a.foreign_target){const map=next.political_phase.foreign_intervention.PATRIOT;map[a.foreign_target]=Math.max(0,(Number(map[a.foreign_target])||0)-3);}
   if(['COASTAL_GUARD','SHIPPING_DISRUPTION'].includes(a.operation)){const targetFaction=a.operation==='COASTAL_GUARD'?BRITISH:'PATRIOT',coopDelta=a.operation==='COASTAL_GUARD'?1:-1;for(const city of Object.values(activated.state.cities))if(city.geography.sea_zone_id===a.zone&&city.geography.naval_class!=='INLAND'&&city.politics.military_control===targetFaction){city.politics.public_cooperation=Math.max(0,Math.min(100,city.politics.public_cooperation+coopDelta));city.politics.independence_support=Math.max(0,Math.min(100,city.politics.independence_support-1));}}
   if(engines.army.syncBattleSeaSupplyBlockades)next=engines.army.syncBattleSeaSupplyBlockades(next,activated.state).state;
   engines.army.appendAction(next,{type:'NAVAL_OPERATION',operation_type:a.operation,zone_id:a.zone,faction:BRITISH,foreign_target:a.foreign_target||null,target_city_id:a.target_city_id||a.target||null});
   return{military:next,cities:activated.state,kind:'NAVAL',city_id:null};
 }
 return native.executeNonBattle(m,c,a,engines);
}
module.exports={availableDefendersAt:Normal.availableDefendersAt,available:native.available,prepareAttack:native.prepareAttack,chooseAction,executeNonBattle,strategicMode,strategicCandidates,operationalCandidates,cityHoldValue:(m,c,P,config,id)=>Normal.cityValue(m,c,BRITISH,id)};
};
modules['AI_OFFICIAL_CURRENT/operational_readiness_v1.js']=function(require,module,exports){
'use strict';
// Shared, non-mutating operational forecasts. No access to the campaign's future random draws.
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const B=require('../runtime/battle_engine_v0_74_retreat.js');
const N=require('./naval_api_v1.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const cityConfig=require('../source_data/city_command_config_v0_17.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const copy=x=>JSON.parse(JSON.stringify(x)),enemy=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
const active=b=>b&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status);
const period=m=>`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
const engines=()=>({army:E,battle:B,political:P,naval:N,phaseConfig:phase,politicalConfig:political,cityConfig});
function probeCopy(m){return copy({...m,action_log:(m.action_log||[]).filter(x=>Number(x.year)===Number(m.calendar.year)&&Number(x.month)===Number(m.calendar.month)),ai_runtime:undefined,ai_strategy_state:undefined,battles:Object.fromEntries(Object.entries(m.battles||{}).map(([id,b])=>[id,{...b,history:[]}]))});}
function synchronize(m,c){
 const troops=E.logisticsTroopsByCity(m),consumption=E.logisticsConsumptionTroopsByCity(m,phase).totals||{};
 for(const [id,city] of Object.entries(c.cities||{})){
  city.politics.military_control=P.militaryControl(m,id,political);city.garrison={...city.garrison,troops:Number(m.garrisons?.[id]?.manpower)||0};
  city.stationed_field_army_troops=troops[id]||0;city.stationed_field_army_consumption_troops=consumption[id]||0;
  if(m.city_logistics?.[id]){m.city_logistics[id].food_stock=city.stockpile.FOOD;m.city_logistics[id].material_stock=city.stockpile.MATERIALS;}
 }
}
function balanceFor(m,c,id,extra=0,totals=null){
 const city=c.cities?.[id];if(!city)return null;
 const troops=((totals||E.logisticsConsumptionTroopsByCity(m,phase).totals||{})[id]||0)+Math.max(0,extra);
 const local={...city,garrison:{...city.garrison,troops:Number(m.garrisons?.[id]?.manpower)||0},stationed_field_army_consumption_troops:troops};
 const food=C.monthlyBalance(local,'FOOD',cityConfig),materials=C.monthlyBalance(local,'MATERIALS',cityConfig),foodStock=Number(city.stockpile.FOOD)||0,materialStock=Number(city.stockpile.MATERIALS)||0;
 const months=(stock,net)=>net>=0?99:stock/Math.max(1,-net),foodMonths=months(foodStock,food.net),materialMonths=months(materialStock,materials.net);
 return{foodStock,materialStock,foodNet:food.net,materialNet:materials.net,foodMonths,materialMonths,months:Math.min(foodMonths,materialMonths),troops};
}
function status(m,c,id,totals=null){const balance=balanceFor(m,c,id,0,totals);if(!balance)return null;
 const blockers=[];for(const r of ['food','material'])if(balance[r+'Net']<0&&balance[r+'Stock']+balance[r+'Net']<=0)blockers.push(r==='food'?'FOOD_NEXT_MONTH_CLOSE':'MATERIALS_NEXT_MONTH_CLOSE');
 return{city:id,balance,stage:blockers.length?'STABILIZE':'SUSTAINABLE',blockers,at:period(m)};
}
function monthClose(m,c){
 m=probeCopy(m);c=copy(c);synchronize(m,c);m=P.evaluateMonthEnd(m,c,political).state;
 const adv=C.advanceMonth(c,cityConfig);c=adv.state;m=E.applyLogisticsShortageEffects(m,adv.events).state;m=P.applyMonthlyShortageWarWill(m,c,adv.events,political).state;m=E.advanceMonth(m,phase);synchronize(m,c);
 return{m,c,events:adv.events,assumptions:'No new orders, enemy actions, political deliveries or foreign arrivals'};
}
function enemyWindow(m,f,id){const ongoing=Object.values(m.battles||{}).some(b=>b.city_id===id&&active(b));return{kind:ongoing||Number(m.factions?.[enemy(f)]?.commands_remaining)>0?'CURRENT_MONTH':'AFTER_MONTH_CLOSE',ongoing_battle:ongoing,enemy_commands:Number(m.factions?.[enemy(f)]?.commands_remaining)||0};}
function projectAction(m,c,f,a){
 let mm=probeCopy(m),cc=copy(c);synchronize(mm,cc);mm.current_faction=f;if(!a)return{m:mm,c:cc};
 let out;
 if(a.type==='GARRISON'){out=E.formGarrison(mm,a.city,f,a.troops,phase);mm=out.state;cc.cities[a.city].stockpile.MATERIALS-=out.materials_cost;}
 else if(a.type==='FORM'){out=E.formFieldArmyFromReserve(mm,a.city,a.commander_id,phase);mm=out.state;}
 else if(['IMPROVE','RECRUIT','TRAINING'].includes(a.type)){
  const id=a.city||mm.field_armies[a.army_id]?.location_city_id;out=E.improveFieldArmy(mm,a.army_id,a.kind||(a.type==='TRAINING'?'TRAINING':'REGULAR_RECRUITMENT'),phase,cc.cities[id]);mm=out.state;
  cc.cities[id].stockpile.MATERIALS-=out.result.materials_cost||0;cc.cities[id].politics.independence_support=Math.max(0,Math.min(100,cc.cities[id].politics.independence_support+(out.result.support_change||0)));cc.cities[id].politics.public_cooperation=Math.max(0,Math.min(100,cc.cities[id].politics.public_cooperation+(out.result.cooperation_change||0)));
 }else if(a.type==='MOVE'){
  const L=require('./logistics_strategy_v1.js'),execute=f==='PATRIOT'?require('./patriot_strategic_ai_v6_base.js').execute:require('./royalist_strategy_ai_v6_base.js').executeNonBattle;
  out=L.executeMoveWithSupply(mm,cc,f,a,engines(),execute);mm=out.military;cc=out.cities;
 }else if(a.type==='TRANSPORT'){out=require('./logistics_strategy_v1.js').executeTransport(mm,cc,f,a);mm=out.military;cc=out.cities;}
 else if(['SECURITY','STOCKPILE_AID'].includes(a.type)){out=require('./civil_operations_v1.js').execute(mm,cc,f,a);mm=out.m;cc=out.c;}
 else if(a.type==='DAMAGE_REPAIR'){out=require('./civil_operations_v1.js').executeRepair(mm,cc,f,a);mm=out.m;cc=out.c;}
 else if(a.type==='FORCED_REQUISITION_AI'){out=require('./logistics_strategy_v1.js').executeRequisition(mm,cc,f,a);mm=out.military;cc=out.cities;}
 else throw new Error('READINESS_ACTION_NOT_MODELED');
 synchronize(mm,cc);return{m:mm,c:cc};
}
function summarize(m,c,ids){const totals=E.logisticsConsumptionTroopsByCity(m,phase).totals||{};return Object.fromEntries([...new Set(ids.filter(Boolean))].map(id=>[id,status(m,c,id,totals)]).filter(([,v])=>v));}
function forecastAfterAction(m,c,f,a){
 const projected=projectAction(m,c,f,a),next=monthClose(projected.m,projected.c),ids=[a?.origin,a?.target,a?.city],at=summarize(projected.m,projected.c,ids),after=summarize(next.m,next.c,ids);
 return{projected,next,summary:{at:period(m),action:a?.type||'END',current:at,after_month_close:after,window:enemyWindow(m,f,a?.city||a?.target),shortages:next.events.filter(e=>e.type.endsWith('_SHORTAGE')&&ids.includes(e.city_id)),treasury_after:projected.m.factions[f].treasury,mobilizable_after:projected.m.factions[f].mobilizable_manpower,assumptions:next.assumptions}};
}
// Fixed quantile probes use actual battle rules but never the campaign's seeded RNG.
function battleSample(m,c,f,a,rolls){
 let mm=probeCopy(m),cc=copy(c);synchronize(mm,cc);mm.current_faction=f;
 if(Number(mm.factions[f].commands_remaining)<1)throw new Error('COMMANDS_EXHAUSTED');
 if(!a.ids?.length||a.ids.some(id=>!mm.field_armies[id]||mm.field_armies[id].acted_this_month||mm.field_armies[id].battle_id))throw new Error('NO_UNACTED_ARMY');
 if(!C.getCommandCandidates(cc,{command_type:a.route==='LANDING_ATTACK'?'LANDING_ATTACK':'ATTACK',origin_city_id:a.origin,faction:f}).includes(a.target))throw new Error('ATTACK_ROUTE_INVALID');
 mm=E.spendCommand(mm,f,'AI_ATTACK_PROBE',1);
 if(a.route==='LANDING_ATTACK'){const r=N.seaRouteProfile(cc,cc.cities[a.origin].geography.sea_zone_id,cc.cities[a.target].geography.sea_zone_id,f,'LANDING',period(mm)).arrival_rate;for(const id of a.ids)mm.field_armies[id].manpower=Math.floor(mm.field_armies[id].manpower*r);}
 const pre=B.prepareBattle(mm,{origin_city_id:a.origin,city_id:a.target,attacker_army_ids:a.ids,leader_army_id:a.leader||a.ids[0],route_type:a.route==='LANDING_ATTACK'?'LANDING_ATTACK':'LAND_ATTACK'},cc,phase);let n=0;
 const probeEngine={...E,nextRandom:state=>({state:copy(state),value:rolls[n++]??.5})};
 const result=B.resolveBattle(pre.state,pre.battle.id,a.tactic||'normal_attack',cc,phase,probeEngine,'hold_line');mm=result.state;cc=C.recordBattleDamage(cc,a.target,pre.battle.id,cityConfig).state;
 const won=['victory','major_victory'].includes(result.resolution.band),city=cc.cities[a.target];
 if(result.resolution.decisive){
  const magnitude=['major_victory','major_defeat'].includes(result.resolution.band)?5:3,winner=won?f:enemy(f),before=city.politics.independence_support,supported=before>=58?'PATRIOT':before<=42?'BRITISH':'NEUTRAL';
  city.politics.independence_support=Math.max(0,Math.min(100,before+(winner==='PATRIOT'?magnitude:-magnitude)));
  if(won){let shock=supported==='NEUTRAL'?-5:supported===winner?10:-15;const damage=Number(city.condition.damage_severity)||0;if(damage>=3)shock-=10;else if(damage===2)shock-=5;city.politics.public_cooperation=Math.max(0,Math.min(100,city.politics.public_cooperation+shock));
   mm.battles[pre.battle.id].departure_committed=true;mm.battles[pre.battle.id].departure_transition_recorded=true;
   mm=P.recordCityControlTransition(mm,cc,a.origin,f,f,P.militaryControl(mm,a.origin,political),'ATTACK_DEPARTURE_CONFIRMED',political).state;
  }
 }else mm=B.continueBattle(mm,pre.battle.id,E).state;
 synchronize(mm,cc);const next=monthClose(mm,cc),ids=[a.origin,a.target],importantShortages=next.events.filter(e=>e.type.endsWith('_SHORTAGE')&&ids.includes(e.city_id)&&P.militaryControl(next.m,e.city_id,political)===f);
 const Crisis=require('./breakthrough_crisis_v2.js'),defense=won?Crisis.directThreat(next.m,next.c,f,a.target):null;
 return{band:result.resolution.band,occupied:won&&P.militaryControl(mm,a.target,political)===f,attacker_loss:result.resolution.attacker_loss,stock:summarize(next.m,next.c,ids),shortages:importantShortages,post_month_enemy_ratio:defense?.ratio??null,random_assumption:rolls,origin_control:P.militaryControl(mm,a.origin,political)};
}
function assessAttack(m,c,f,row){const a=row.action,blockers=[],unknowns=[],samples=[];
 try{for(const rolls of [[.5,.5],[.25,.75]])samples.push(battleSample(m,c,f,a,rolls));}catch(e){return{stage:'PREPARING_ADVANCE',blockers:[e.message],unknowns:[],samples,score_delta:-10000,legal:false,admissible:false};}
 if(samples.some(x=>x.shortages.length))blockers.push('SUPPLY_AFTER_BATTLE');
 if(samples.some(x=>x.occupied&&x.post_month_enemy_ratio>=1.30))blockers.push('COUNTERATTACK_AFTER_MONTH_CLOSE');
 if(samples.some(x=>!x.occupied))unknowns.push('OCCUPATION_NOT_REACHED_IN_SAMPLE');
 const containsChief=(a.ids||[]).some(id=>m.commanders?.[m.field_armies[id]?.commander_id]?.role==='総司令官');
 const chiefExposed=containsChief&&blockers.includes('COUNTERATTACK_AFTER_MONTH_CLOSE');
 if(chiefExposed)blockers.push('COMMANDER_IN_CHIEF_COUNTERATTACK_EXPOSURE');
 const ready=!blockers.length&&!unknowns.length;
 // Uncertain occupation does not ban a limited attack. Known post-battle shortages cost real value.
 const penalty=(blockers.includes('SUPPLY_AFTER_BATTLE')?38:0)+(blockers.includes('COUNTERATTACK_AFTER_MONTH_CLOSE')?24:0);
 return{stage:ready?'ADVANCE_READY':'PREPARING_ADVANCE',blockers,unknowns,samples,score_delta:chiefExposed?-10000:-penalty,legal:true,admissible:!chiefExposed,scope:'Two fixed tactical samples; no foreign arrivals, future enemy orders or political deliveries. Enemy ratio is a threat screen, not a forecast of an enemy choice.'};
}
function applyRows(m,c,f,rows){const out=[];
 for(const row of rows){if(row.operational_readiness){out.push(row);continue;}const a=row.action||{};
  if(a.type==='ATTACK'){const assessment=assessAttack(m,c,f,row);row.score+=assessment.score_delta;row.operational_readiness=assessment;out.push(row);}
  else if(['MOVE','FORM','IMPROVE','RECRUIT','TRAINING','TRANSPORT','SECURITY','STOCKPILE_AID','DAMAGE_REPAIR','FORCED_REQUISITION_AI'].includes(a.type)){
   try{const value=forecastAfterAction(m,c,f,a),id=a.target||a.city,local=value.summary.current[id],before=status(m,c,id),shortage=value.summary.shortages.some(e=>e.city_id===id),improves=before&&local&&local.balance.months>before.balance.months+.1;
    let delta=shortage&&!a.strategic_reason?.includes('CRISIS')?-24:0;
    row.score+=delta;row.operational_readiness={stage:shortage?'STABILIZE':'SUSTAINABLE',blockers:shortage?['SUPPLY_NEXT_MONTH_CLOSE']:[],unknowns:a.type==='MOVE'?['POST_MOVE_ATTACK_NOT_EVALUATED']:[],score_delta:delta,improves_supply:!!improves,forecast:value.summary};out.push(row);
   }catch(e){row.operational_readiness={stage:'STABILIZE',legal:false,blockers:[e.message],unknowns:[],score_delta:0};}
  }else out.push(row);
 }
 return out;
}
module.exports={balanceFor,status,synchronize,probeCopy,monthClose,enemyWindow,projectAction,forecastAfterAction,assessAttack,applyRows,battleSample,VERSION:'2026-10-17-SUPPLY-READINESS-HQ-GUARD'};
};
modules['AI_OFFICIAL_CURRENT/crisis_lifecycle_official_v1.js']=function(require,module,exports){
'use strict';
const battleVictoryThreshold = require('../source_data/phase2_config_v0_9_funds.json').battle_engine.result_thresholds.victory;

/*
 * BEFORE THE STARS — BREAKTHROUGH_CRISIS lifecycle controller
 * OFFICIAL AI SUBSYSTEM V1 (V1.28 AI upgrade candidate -> official subsystem)
 * Date: 2026-09-24
 *
 * Design contract
 * ---------------
 * 1) 1.30 is the HQ-preservation severe threshold using enemy/friendly effective combat power.
 * 2) 1.35 belongs to the battle-result engine and is intentionally NOT used here.
 * 3) Crisis actions are temporary emergency routing. They may not become a permanent strategy.
 * 4) Crisis completion is re-evaluated after EVERY crisis command.
 * 5) On completion, stale crisis/strategic/operational plans are invalidated and rebuilt from
 *    the CURRENT board state. Remaining commands may be spent by the normal AI in the same turn.
 * 6) Two-city HQ shuttle loops and repeated HQ-only reinforcement are guarded against.
 * 7) The V1.28 game integration uses zero post-exit cooldown: renewed real danger may re-enter crisis
 *    immediately. Anti-oscillation is handled by completion hysteresis and HQ shuttle suppression.
 *
 * This module intentionally owns only lifecycle state. Royalist/Patriot strategic planners remain
 * authoritative for NORMAL mode and for choosing concrete legal commands.
 */

const OFFICIAL_META = Object.freeze({
  subsystem: 'BREAKTHROUGH_CRISIS_LIFECYCLE',
  version: '1.0.0',
  gameUpgrade: 'V1.28',
  baseline: 'V1.27 OFFICIAL',
  royalistBaseline: 'V8',
  patriotBaseline: 'V9',
  hqSevereEffectivePowerRatio: 1.30,
  battleResultThreshold: battleVictoryThreshold,
  status: 'OFFICIAL_AI_SUBSYSTEM',
  date: '2026-09-24',
});

const DEFAULT_CONFIG = Object.freeze({
  // HQ preservation severe line. Ratio = enemy effective base power / friendly effective base power.
  severePowerRatio: 1.30,

  // Broader early-warning detector retained from V1.27 BREAKTHROUGH_CRISIS.
  crisisEntryPowerRatio: 1.12,
  crisisEntryMorale: 42,
  emergencyMorale: 28,

  // Crisis completion hysteresis. The AI need not become locally dominant; it needs a sustainable
  // line that is no longer a realistic HQ-collapse situation.
  immediateExitPowerRatio: 1.12,
  stableExitPowerRatio: 1.20,
  nextTurnSevereRatio: 1.30,
  minExitMorale: 32,
  minStableMorale: 35,
  minSupplyMonths: 1.0,
  stableChecksRequired: 1,

  // Official V1.28 integration permits immediate re-entry if danger genuinely returns.
  reentryCooldownTurns: 0,

  // Anti-pathology limits.
  hqCityHistoryLimit: 6,
  repeatedHQReinforcementLimit: 2,
  crisisActionHistoryLimit: 16,

  // Safety valve for a single AI turn.
  maxActionsPerTurn: 32,
});

function num(v, fallback = 0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}
function bool(v, fallback = false) {
  return typeof v === 'boolean' ? v : fallback;
}
function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function makeInitialState(faction = null) {
  return {
    schema: 'BTS_CRISIS_LIFECYCLE_V1',
    faction,
    mode: 'NORMAL',
    crisisEpisode: 0,
    crisisEnteredTurn: null,
    crisisExitTurn: null,
    lastTransition: null,
    lastCrisisReason: null,
    lastExitReason: null,
    stableChecks: 0,
    reentryCooldownUntilTurn: null,
    strategicPlanRevision: 0,
    operationalPlanRevision: 0,
    needsStrategicReplan: false,
    needsOperationalReplan: false,
    hqCityHistory: [],
    crisisActionHistory: [],
    consecutiveHQReinforcements: 0,
    lastCountedCrisisTurn: null,
    normalActionSeenAfterExit: false,
    metrics: {
      crisisEntries: 0,
      crisisExits: 0,
      reentries: 0,
      crisisTurns: 0,
      crisisActions: 0,
      normalActions: 0,
      normalActionsAfterExit: 0,
      sameTurnReplans: 0,
      twoCityLoopsDetected: 0,
      twoCityMovesSuppressed: 0,
      hqReinforcementSuppressions: 0,
      maxActionGuardTrips: 0,
    },
  };
}

function normalizeState(raw, faction = null) {
  const base = makeInitialState(faction || raw?.faction || null);
  if (!raw || typeof raw !== 'object') return base;
  const next = { ...base, ...clone(raw) };
  next.metrics = { ...base.metrics, ...(clone(raw.metrics) || {}) };
  next.hqCityHistory = Array.isArray(raw.hqCityHistory) ? clone(raw.hqCityHistory) : [];
  next.crisisActionHistory = Array.isArray(raw.crisisActionHistory) ? clone(raw.crisisActionHistory) : [];
  next.schema = base.schema;
  return next;
}

function normalizeSnapshot(snapshot = {}, config = DEFAULT_CONFIG) {
  const powerRatio = Math.max(0, num(snapshot.enemyToFriendlyPowerRatio, 1));
  const nextTurnRatio = Math.max(0, num(snapshot.nextTurnEnemyToFriendlyPowerRatio, powerRatio));
  const morale = clamp(num(snapshot.chiefMorale, 50), 0, 100);
  const chiefAlive = snapshot.chiefAlive !== false;
  const ongoingBattle = bool(snapshot.ongoingBattle, false);
  const supplyMonths = Math.max(0, num(snapshot.supplyMonths, 99));
  const safeRetreatRoutes = Math.max(0, Math.floor(num(snapshot.safeRetreatRoutes, 0)));
  const frontAnchored = bool(snapshot.frontAnchored, false);
  const friendlyConcentrationReady = bool(snapshot.friendlyConcentrationReady, false);
  const enemyCanAttackNextTurn = bool(
    snapshot.enemyCanAttackNextTurn,
    nextTurnRatio >= config.crisisEntryPowerRatio,
  );
  const enemyDisengaged = bool(snapshot.enemyDisengaged, false);
  const forcedWithdrawalPending = bool(snapshot.forcedWithdrawalPending, false);

  const emergency = powerRatio >= config.severePowerRatio ||
    (morale <= config.emergencyMorale && enemyCanAttackNextTurn);
  const severe = emergency || bool(snapshot.severeThreat, false);
  const broadTrigger = bool(
    snapshot.crisisTriggered,
    powerRatio >= config.crisisEntryPowerRatio ||
      (morale <= config.crisisEntryMorale && enemyCanAttackNextTurn),
  );
  const nextTurnSevere = bool(
    snapshot.nextTurnSevereThreat,
    enemyCanAttackNextTurn && nextTurnRatio >= config.nextTurnSevereRatio,
  );

  // A viable front may be a proper anchored line, or a concentrated force with real depth/retreat.
  // A naked HQ is not considered safe merely because the ratio dipped for one command.
  const depthOrLine = frontAnchored ||
    (friendlyConcentrationReady && (safeRetreatRoutes > 0 || enemyDisengaged));

  const supplySustainable = bool(snapshot.supplySustainable, supplyMonths >= config.minSupplyMonths);
  const chiefSafe = bool(
    snapshot.chiefSafe,
    chiefAlive && !ongoingBattle && !forcedWithdrawalPending && morale > config.emergencyMorale,
  );

  return {
    ...snapshot,
    powerRatio,
    nextTurnRatio,
    morale,
    chiefAlive,
    ongoingBattle,
    supplyMonths,
    safeRetreatRoutes,
    frontAnchored,
    friendlyConcentrationReady,
    enemyCanAttackNextTurn,
    enemyDisengaged,
    forcedWithdrawalPending,
    emergency,
    severe,
    broadTrigger,
    nextTurnSevere,
    depthOrLine,
    supplySustainable,
    chiefSafe,
    hqCityId: snapshot.hqCityId || snapshot.chiefCityId || null,
  };
}

function assessCrisisCompletion(snapshot, config = DEFAULT_CONFIG) {
  const s = normalizeSnapshot(snapshot, config);
  const blockers = [];
  if (!s.chiefAlive) blockers.push('CHIEF_LOST');
  if (s.ongoingBattle) blockers.push('ONGOING_BATTLE');
  if (s.forcedWithdrawalPending) blockers.push('WITHDRAWAL_PENDING');
  if (s.severe) blockers.push('SEVERE_THREAT');
  if (s.nextTurnSevere) blockers.push('NEXT_TURN_SEVERE_THREAT');
  if (!s.supplySustainable) blockers.push('SUPPLY_UNSUSTAINABLE');
  if (!s.depthOrLine && !s.enemyDisengaged) blockers.push('NO_VIABLE_FRONT_OR_DEPTH');
  if (!s.chiefSafe) blockers.push('CHIEF_NOT_SAFE');

  const immediate = blockers.length === 0 &&
    s.powerRatio <= config.immediateExitPowerRatio &&
    s.morale >= config.minExitMorale;
  const stable = blockers.length === 0 &&
    s.powerRatio <= config.stableExitPowerRatio &&
    s.morale >= config.minStableMorale;

  let reason = null;
  if (immediate) reason = 'CRISIS_OBJECTIVE_COMPLETE_STRONG';
  else if (stable) reason = 'CRISIS_OBJECTIVE_COMPLETE_STABLE';

  return {
    complete: immediate || stable,
    immediate,
    stable,
    reason,
    blockers,
    normalized: s,
  };
}

function recordHQCity(state, cityId, config = DEFAULT_CONFIG) {
  if (!cityId) return { state: normalizeState(state), loopDetected: false };
  const next = normalizeState(state);
  const h = next.hqCityHistory;
  if (h[h.length - 1] !== cityId) h.push(cityId);
  if (h.length > config.hqCityHistoryLimit) {
    next.hqCityHistory = h.slice(-config.hqCityHistoryLimit);
  }
  const hh = next.hqCityHistory;
  const loopDetected = hh.length >= 4 &&
    hh[hh.length - 1] === hh[hh.length - 3] &&
    hh[hh.length - 2] === hh[hh.length - 4];
  if (loopDetected) next.metrics.twoCityLoopsDetected += 1;
  return { state: next, loopDetected };
}

function isTwoCityShuttleCandidate(state, destinationCityId) {
  const h = state?.hqCityHistory || [];
  if (!destinationCityId || h.length < 2) return false;
  // A -> B -> candidate A is already enough to reject a pointless immediate reversal when another
  // safe destination exists. Emergency conditions may override this guard.
  return destinationCityId === h[h.length - 2];
}

function noteCrisisAction(state, action = {}, config = DEFAULT_CONFIG) {
  const next = normalizeState(state);
  const type = action.type || 'UNKNOWN';
  const target = action.targetCityId || action.cityId || null;
  next.crisisActionHistory.push({ type, target });
  if (next.crisisActionHistory.length > config.crisisActionHistoryLimit) {
    next.crisisActionHistory = next.crisisActionHistory.slice(-config.crisisActionHistoryLimit);
  }

  const hqReinforce = [
    'RECRUIT', 'REGULAR_RECRUITMENT', 'FORCED_RECRUIT', 'FORCED_CONSCRIPTION',
    'REINFORCE_HQ', 'TRAIN_HQ', 'TRAINING', 'EQUIP_HQ', 'EQUIPMENT_PURCHASE',
    'REORGANIZE_HQ', 'REORGANIZE',
  ].includes(type);
  if (hqReinforce) next.consecutiveHQReinforcements += 1;
  else next.consecutiveHQReinforcements = 0;
  next.metrics.crisisActions += 1;
  return next;
}

function shouldSuppressCrisisAction(state, action, snapshot, alternatives = [], config = DEFAULT_CONFIG) {
  const s = normalizeSnapshot(snapshot, config);
  const type = action?.type || 'UNKNOWN';

  if (type === 'MOVE_HQ' && isTwoCityShuttleCandidate(state, action.targetCityId)) {
    const hasSafeAlternative = alternatives.some(a =>
      a && a.type === 'MOVE_HQ' && a.targetCityId !== action.targetCityId && a.safe !== false);
    if (hasSafeAlternative && !s.emergency) {
      return { suppress: true, reason: 'TWO_CITY_SHUTTLE', preferAlternative: true };
    }
  }

  const hqReinforce = [
    'RECRUIT', 'REGULAR_RECRUITMENT', 'FORCED_RECRUIT', 'FORCED_CONSCRIPTION',
    'REINFORCE_HQ', 'TRAIN_HQ', 'TRAINING', 'EQUIP_HQ', 'EQUIPMENT_PURCHASE',
    'REORGANIZE_HQ', 'REORGANIZE',
  ].includes(type);
  if (hqReinforce && state.consecutiveHQReinforcements >= config.repeatedHQReinforcementLimit) {
    const completion = assessCrisisCompletion(s, config);
    const hasDifferentUsefulAction = alternatives.some(a => a && ![
      'RECRUIT', 'REGULAR_RECRUITMENT', 'FORCED_RECRUIT', 'FORCED_CONSCRIPTION',
      'REINFORCE_HQ', 'TRAIN_HQ', 'TRAINING', 'EQUIP_HQ', 'EQUIPMENT_PURCHASE',
      'REORGANIZE_HQ', 'REORGANIZE',
    ].includes(a.type));
    if ((completion.complete || !s.severe) && hasDifferentUsefulAction) {
      return { suppress: true, reason: 'HQ_REINFORCEMENT_TUNNEL_VISION', preferAlternative: true };
    }
  }

  return { suppress: false, reason: null, preferAlternative: false };
}

function enterCrisis(state, turn, reason = 'CRISIS_TRIGGER', snapshot = null) {
  let next = normalizeState(state);
  const hadPriorEpisode = next.crisisEpisode > 0;
  next.mode = 'BREAKTHROUGH_CRISIS';
  next.crisisEpisode += 1;
  next.crisisEnteredTurn = turn;
  next.crisisExitTurn = null;
  next.lastTransition = 'ENTER_CRISIS';
  next.lastCrisisReason = reason;
  next.stableChecks = 0;
  next.needsStrategicReplan = false;
  next.needsOperationalReplan = false;
  next.consecutiveHQReinforcements = 0;
  next.normalActionSeenAfterExit = false;
  next.metrics.crisisEntries += 1;
  if (hadPriorEpisode) next.metrics.reentries += 1;
  const s = snapshot ? normalizeSnapshot(snapshot) : null;
  if (s?.hqCityId) next = recordHQCity(next, s.hqCityId).state;
  return next;
}

function exitCrisisToReplan(state, turn, reason, config = DEFAULT_CONFIG) {
  const next = normalizeState(state);
  next.mode = 'REPLAN_NORMAL';
  next.crisisExitTurn = turn;
  next.lastTransition = 'EXIT_CRISIS_REPLAN';
  next.lastExitReason = reason;
  next.stableChecks = 0;
  next.needsStrategicReplan = true;
  next.needsOperationalReplan = true;
  next.reentryCooldownUntilTurn = turn + config.reentryCooldownTurns;
  next.metrics.crisisExits += 1;
  return next;
}

function finishReplan(state) {
  const next = normalizeState(state);
  next.mode = 'NORMAL';
  next.lastTransition = 'NORMAL_PLAN_REBUILT';
  next.needsStrategicReplan = false;
  next.needsOperationalReplan = false;
  next.strategicPlanRevision += 1;
  next.operationalPlanRevision += 1;
  next.metrics.sameTurnReplans += 1;
  next.normalActionSeenAfterExit = false;
  return next;
}

function touchCrisisTurn(state, turn) {
  const next = normalizeState(state);
  if (next.lastCountedCrisisTurn !== turn) {
    next.lastCountedCrisisTurn = turn;
    next.metrics.crisisTurns += 1;
  }
  return next;
}

function stepLifecycle(state, snapshot, turn, config = DEFAULT_CONFIG) {
  let next = normalizeState(state, snapshot?.faction || null);
  const s = normalizeSnapshot(snapshot, config);

  if (!s.chiefAlive) {
    next.lastTransition = 'HQ_COLLAPSED';
    return { state: next, assessment: null, event: 'HQ_COLLAPSED', normalized: s };
  }

  if (next.mode === 'NORMAL') {
    const cooldown = next.reentryCooldownUntilTurn != null && turn <= next.reentryCooldownUntilTurn;
    const hardOverride = s.severe;
    if ((s.broadTrigger || hardOverride) && (!cooldown || hardOverride)) {
      next = enterCrisis(next, turn, hardOverride ? 'SEVERE_OR_EMERGENCY' : 'CRISIS_TRIGGER', s);
      next = touchCrisisTurn(next, turn);
      return { state: next, assessment: null, event: 'ENTER_CRISIS', normalized: s };
    }
    return { state: next, assessment: null, event: 'STAY_NORMAL', normalized: s };
  }

  if (next.mode === 'BREAKTHROUGH_CRISIS') {
    next = touchCrisisTurn(next, turn);
    const assessment = assessCrisisCompletion(s, config);
    if (assessment.immediate) {
      next = exitCrisisToReplan(next, turn, assessment.reason, config);
      return { state: next, assessment, event: 'EXIT_CRISIS_REPLAN', normalized: s };
    }
    if (assessment.stable) {
      next.stableChecks += 1;
      if (next.stableChecks >= config.stableChecksRequired) {
        next = exitCrisisToReplan(next, turn, assessment.reason, config);
        return { state: next, assessment, event: 'EXIT_CRISIS_REPLAN', normalized: s };
      }
      return { state: next, assessment, event: 'CRISIS_STABLE_CONFIRM', normalized: s };
    }
    next.stableChecks = 0;
    return { state: next, assessment, event: 'CONTINUE_CRISIS', normalized: s };
  }

  if (next.mode === 'REPLAN_NORMAL') {
    return { state: next, assessment: null, event: 'REPLAN_REQUIRED', normalized: s };
  }

  throw new Error(`Unknown crisis lifecycle mode: ${next.mode}`);
}

/*
 * runAITurn
 * ---------
 * Required hook: buildSnapshot(ctx, state)
 * Crisis hook:   runCrisisAction(ctx, state, snapshot) -> {ctx, action, alternatives?}
 * Optional:      selectCrisisAlternative(...)
 * Replan hooks:  invalidatePlans / rebuildStrategicPlan / rebuildOperationalPlan
 * Normal hook:   runNormalAction(ctx, state, snapshot) -> {ctx, action}
 * Command hook:  hasCommands(ctx)
 *
 * In strictReplan mode (default), crisis completion may not silently drop back to NORMAL unless the
 * strategic and operational rebuild hooks are present. This prevents a superficially "fixed" AI
 * that exits crisis but continues to use stale objectives.
 */
function runAITurn({
  ctx,
  lifecycleState,
  faction,
  turn,
  hooks,
  config = DEFAULT_CONFIG,
  maxActions = null,
  strictReplan = true,
}) {
  if (!hooks || typeof hooks.buildSnapshot !== 'function') throw new Error('hooks.buildSnapshot required');
  let state = normalizeState(lifecycleState, faction);
  let work = ctx;
  const log = [];
  let actions = 0;
  const actionCap = maxActions == null ? config.maxActionsPerTurn : maxActions;

  const hasCommands = () => typeof hooks.hasCommands === 'function'
    ? !!hooks.hasCommands(work)
    : actions < actionCap;

  while (hasCommands() && actions < actionCap) {
    const snapshot = hooks.buildSnapshot(work, state);
    const stepped = stepLifecycle(state, snapshot, turn, config);
    state = stepped.state;
    log.push({
      kind: 'LIFECYCLE', event: stepped.event, mode: state.mode,
      powerRatio: stepped.normalized.powerRatio,
      nextTurnRatio: stepped.normalized.nextTurnRatio,
      blockers: stepped.assessment?.blockers || [],
    });

    if (stepped.event === 'HQ_COLLAPSED') break;

    if (state.mode === 'REPLAN_NORMAL') {
      if (strictReplan) {
        if (typeof hooks.rebuildStrategicPlan !== 'function') throw new Error('rebuildStrategicPlan hook required after crisis exit');
        if (typeof hooks.rebuildOperationalPlan !== 'function') throw new Error('rebuildOperationalPlan hook required after crisis exit');
      }
      if (typeof hooks.invalidatePlans === 'function') work = hooks.invalidatePlans(work, state, snapshot) ?? work;
      if (typeof hooks.rebuildStrategicPlan === 'function') work = hooks.rebuildStrategicPlan(work, state, snapshot) ?? work;
      if (typeof hooks.rebuildOperationalPlan === 'function') work = hooks.rebuildOperationalPlan(work, state, snapshot) ?? work;
      state = finishReplan(state);
      log.push({
        kind: 'LIFECYCLE', event: 'NORMAL_PLAN_REBUILT', mode: state.mode,
        strategicPlanRevision: state.strategicPlanRevision,
        operationalPlanRevision: state.operationalPlanRevision,
      });
      // Deliberately continue within the SAME turn. Remaining commands now route through NORMAL.
      continue;
    }

    if (state.mode === 'BREAKTHROUGH_CRISIS') {
      if (typeof hooks.runCrisisAction !== 'function') break;
      let out = hooks.runCrisisAction(work, state, snapshot) || {};
      const alternatives = Array.isArray(out.alternatives) ? out.alternatives : [];
      const suppression = shouldSuppressCrisisAction(state, out.action, snapshot, alternatives, config);
      if (suppression.suppress) {
        if (suppression.reason === 'TWO_CITY_SHUTTLE') state.metrics.twoCityMovesSuppressed += 1;
        if (suppression.reason === 'HQ_REINFORCEMENT_TUNNEL_VISION') state.metrics.hqReinforcementSuppressions += 1;
        if (typeof hooks.selectCrisisAlternative === 'function') {
          out = hooks.selectCrisisAlternative(work, state, snapshot, out.action, alternatives, suppression) || out;
        } else {
          // If no selector hook exists, take the first explicitly safe non-suppressed alternative.
          const fallback = alternatives.find(a => {
            if (!a) return false;
            if (suppression.reason === 'TWO_CITY_SHUTTLE') return a.type === 'MOVE_HQ' && a.targetCityId !== out.action?.targetCityId && a.safe !== false;
            return a.type !== out.action?.type || a.targetCityId !== out.action?.targetCityId;
          });
          if (fallback) out = { ...out, action: fallback };
        }
      }
      if (!out.action) break;
      work = out.ctx ?? work;
      state = noteCrisisAction(state, out.action, config);
      if (out.action.type === 'MOVE_HQ') {
        const rec = recordHQCity(state, out.action.targetCityId, config);
        state = rec.state;
      }
      log.push({
        kind: 'ACTION', mode: 'BREAKTHROUGH_CRISIS',
        action: out.action.type, target: out.action.targetCityId || null,
        suppression: suppression.suppress ? suppression.reason : null,
      });
      actions += 1;
      // Critical behavior: immediately re-snapshot and re-check completion after this command.
      continue;
    }

    if (state.mode === 'NORMAL') {
      if (typeof hooks.runNormalAction !== 'function') break;
      const out = hooks.runNormalAction(work, state, snapshot) || {};
      if (!out.action) break;
      work = out.ctx ?? work;
      state.metrics.normalActions += 1;
      if (state.crisisExitTurn != null && !state.normalActionSeenAfterExit) {
        state.normalActionSeenAfterExit = true;
        state.metrics.normalActionsAfterExit += 1;
        log.push({ kind: 'LIFECYCLE', event: 'FIRST_NORMAL_ACTION_AFTER_CRISIS', action: out.action.type });
      }
      log.push({
        kind: 'ACTION', mode: 'NORMAL',
        action: out.action.type, target: out.action.targetCityId || null,
      });
      actions += 1;
      continue;
    }
  }

  if (hasCommands() && actions >= actionCap) {
    state.metrics.maxActionGuardTrips += 1;
    log.push({ kind: 'GUARD', event: 'MAX_ACTION_GUARD', actionCap });
  }

  return { ctx: work, lifecycleState: state, log, actions };
}

function getStore(gameState, create = true) {
  if (!gameState || typeof gameState !== 'object') return null;
  if (!gameState.ai_runtime && create) gameState.ai_runtime = {};
  if (!gameState.ai_runtime) return null;
  if (!gameState.ai_runtime.crisis_lifecycle && create) gameState.ai_runtime.crisis_lifecycle = {};
  return gameState.ai_runtime.crisis_lifecycle || null;
}

function loadPersistedState(gameState, faction) {
  const store = getStore(gameState, false);
  return normalizeState(store?.[faction], faction);
}

function savePersistedState(gameState, faction, lifecycleState) {
  const store = getStore(gameState, true);
  store[faction] = normalizeState(lifecycleState, faction);
  return gameState;
}

function clearPersistedState(gameState, faction = null) {
  const store = getStore(gameState, false);
  if (!store) return gameState;
  if (faction == null) {
    gameState.ai_runtime.crisis_lifecycle = {};
  } else {
    delete store[faction];
  }
  return gameState;
}

module.exports = {
  OFFICIAL_META,
  DEFAULT_CONFIG,
  makeInitialState,
  normalizeState,
  normalizeSnapshot,
  assessCrisisCompletion,
  recordHQCity,
  isTwoCityShuttleCandidate,
  noteCrisisAction,
  shouldSuppressCrisisAction,
  enterCrisis,
  exitCrisisToReplan,
  finishReplan,
  touchCrisisTurn,
  stepLifecycle,
  runAITurn,
  loadPersistedState,
  savePersistedState,
  clearPersistedState,
};
};
modules['AI_OFFICIAL_CURRENT/breakthrough_crisis_v2.js']=function(require,module,exports){
'use strict';
const Trust=require('./trust_strategy_v1.js');
const Readiness=require('./operational_readiness_v1.js');
// BEFORE THE STARS — Breakthrough Crisis doctrine v2 OFFICIAL (2026-09-24)
// V1.28: effective-power HQ danger, explicit crisis lifecycle completion/replan,
// anti-shuttle movement, next-turn re-break screening, supply/front viability.
const C=require('../runtime/city_command_engine_v0_18.js');
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const B=require('../runtime/battle_engine_v0_74_retreat.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const cityConfig=require('../source_data/city_command_config_v0_17.json');
const Lifecycle=require('./crisis_lifecycle_official_v1.js');
const N=require('./naval_api_v1.js');
const CombatProjection=require('./combat_projection_v1.js');

const LIFECYCLE_CONFIG=Object.freeze({...Lifecycle.DEFAULT_CONFIG,reentryCooldownTurns:0});
const META=Object.freeze({version:'2.1.0',game:'V1.28',date:'2026-10-08',hqSevereEffectivePowerRatio:1.30,battleResultThreshold:phase.battle_engine.result_thresholds.victory});
const enemyOf=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
const copy=x=>JSON.parse(JSON.stringify(x));
const control=(m,id)=>P.militaryControl(m,id,political);
function landNeighbors(c,id){const out=[];for(const e of c.topology?.edges||[]){if(String(e.type||'').startsWith('water_')||e.counts_as_land_adjacency===false)continue;if(e.a===id)out.push(e.b);else if(e.b===id)out.push(e.a);}return [...new Set(out)];}
function armiesAt(m,id,f){return Object.values(m.field_armies||{}).filter(a=>{
  if(a.faction!==f||a.location_city_id!==id||Number(a.manpower)<=0)return false;
  // Reinforcements retain their origin city while fighting at another city.
  // Do not count those men as a local garrison, reserve, or source of an attack.
  const battle=a.battle_id&&m.battles?.[a.battle_id];
  return !battle||['resolved','withdrawn'].includes(battle.status)||battle.city_id===id;
 });}
function troopsAt(m,id,f){return armiesAt(m,id,f).reduce((n,a)=>n+(Number(a.manpower)||0),0);}
function chiefArmy(m,f){return Object.values(m.field_armies||{}).find(a=>a.faction===f&&Number(a.manpower)>0&&m.commanders?.[a.commander_id]?.role==='総司令官')||null;}
function periodSerial(m){return Number(m?.calendar?.year||1775)*12+Number(m?.calendar?.month||1);}
function directRoute(c,origin,target,faction){if(landNeighbors(c,origin).includes(target))return'LAND_ATTACK';try{if(C.getCommandCandidates(c,{command_type:'LANDING_ATTACK',origin_city_id:origin,faction}).includes(target))return'LANDING_ATTACK';}catch{}return null;}
function battleRatioForOrigin(m,c,attackerFaction,origin,target,route=null){const ids=armiesAt(m,origin,attackerFaction).map(a=>a.id);if(!ids.length)return null;route=route||directRoute(c,origin,target,attackerFaction);if(!route)return null;try{const state=CombatProjection.copy(m);for(const id of ids)if(state.field_armies?.[id])state.field_armies[id].acted_this_month=false;const leader=ids.find(id=>state.commanders?.[state.field_armies?.[id]?.commander_id]?.role==='総司令官')||ids[0];const pre=B.prepareBattle(state,{origin_city_id:origin,city_id:target,attacker_army_ids:ids,leader_army_id:leader,route_type:route},c,phase);const atk=B.basePower(pre.attacker,phase.battle_engine,false),def=B.basePower(pre.defender,phase.battle_engine,true);const baseRatio=def>0?atk/def:99,assaultPower=Number(phase.battle_engine.tactics?.all_out_attack?.power||1.12),holdingPower=Number(phase.battle_engine.tactics?.hold_line?.power||.95);return{ratio:baseRatio,assaultRatio:baseRatio*assaultPower/Math.max(.1,holdingPower),attackerPower:atk,defenderPower:def,origin,target,route,manpower:pre.attacker.manpower};}catch{return null;}}
function directThreat(m,c,f,target){const enemy=enemyOf(f),rows=[];for(const origin of Object.keys(c.cities||{})){if(troopsAt(m,origin,enemy)<=0)continue;const route=directRoute(c,origin,target,enemy);if(!route)continue;const row=battleRatioForOrigin(m,c,enemy,origin,target,route);if(row)rows.push(row);}rows.sort((a,b)=>b.ratio-a.ratio);return rows[0]||{ratio:0,manpower:0,origin:null,target,route:null};}
function nextTurnThreat(m,c,f,target){const enemy=enemyOf(f);let best=directThreat(m,c,f,target);for(const origin of Object.keys(c.cities||{})){const moving=armiesAt(m,origin,enemy);if(!moving.length)continue;const moves=landNeighbors(c,origin);for(const staging of moves){if(staging===target||control(m,staging)===f)continue;if(!directRoute(c,staging,target,enemy))continue;try{const virtual=CombatProjection.copy(m);for(const a of moving)if(virtual.field_armies?.[a.id]){virtual.field_armies[a.id].location_city_id=staging;virtual.field_armies[a.id].acted_this_month=false;}const row=battleRatioForOrigin(virtual,c,enemy,staging,target);if(row&&row.ratio>best.ratio)best={...row,virtualMoveFrom:origin,virtualMoveTo:staging};}catch{}}
  }
  return best;
}
function supplyMonths(m,c,id){return Readiness.balanceFor(m,c,id)?.months??0;}
function safeRetreatTargets(m,c,f,id){const enemy=enemyOf(f);let legal=[];try{legal=C.getCommandCandidates(c,{command_type:'MOVE',origin_city_id:id,faction:f});}catch{legal=landNeighbors(c,id).filter(x=>control(m,x)!==enemy);}const rows=[];for(const target of legal){if(control(m,target)===enemy||troopsAt(m,target,enemy)>0)continue;const now=directThreat(m,c,f,target);if(now.ratio>=1.30)continue;const enemyAdj=landNeighbors(c,target).reduce((n,x)=>n+troopsAt(m,x,enemy),0),friendly=troopsAt(m,target,f)+landNeighbors(c,target).reduce((n,x)=>n+troopsAt(m,x,f),0),nextApprox=friendly>0?enemyAdj/friendly:(enemyAdj>0?9:0);if(nextApprox>=1.8)continue;const exits=landNeighbors(c,target).filter(dest=>dest!==id&&control(m,dest)!==enemy&&troopsAt(m,dest,enemy)===0).length;rows.push({target,now:now.ratio,next:nextApprox,food:Number(c.cities?.[target]?.stockpile?.FOOD)||0,friendly,exits,ownControl:control(m,target)===f});}return rows.sort((a,b)=>Number(b.ownControl)-Number(a.ownControl)||(b.exits-a.exits)||(b.friendly-a.friendly)||(b.food-a.food)||(a.next-b.next));}
function buildSnapshot(m,c,f){const chief=chiefArmy(m,f);if(!chief)return{chiefAlive:false,hqCityId:null,chiefMorale:0,enemyToFriendlyPowerRatio:99,nextTurnEnemyToFriendlyPowerRatio:99,crisisTriggered:false,severeThreat:true};const id=chief.location_city_id,now=directThreat(m,c,f,id),next=nextTurnThreat(m,c,f,id),safe=safeRetreatTargets(m,c,f,id),friendlyHere=troopsAt(m,id,f),friendlyAdj=landNeighbors(c,id).reduce((n,x)=>n+troopsAt(m,x,f),0),otherHere=Math.max(0,friendlyHere-(Number(chief.manpower)||0)),morale=Number(chief.morale)||0,ongoing=Object.values(m.battles||{}).some(b=>!['resolved','withdrawn'].includes(b.status)&&((b.attacker_army_ids||[]).includes(chief.id)||(b.defender_army_ids||[]).includes(chief.id))),threatManpower=Math.max(now.manpower||0,next.manpower||0),ratio=Math.max(0,now.ratio||0),nextRatio=Math.max(ratio,next.ratio||0),supply=supplyMonths(m,c,id),friendlyConcentrationReady=otherHere>=500||friendlyAdj>=1200,frontAnchored=ratio<=1.20&&(friendlyConcentrationReady||safe.length>0),enemyCanAttackNextTurn=Boolean(next.origin||next.virtualMoveTo);
  const pressurePresent=threatManpower>=500||enemyCanAttackNextTurn;
  return{chiefAlive:true,chiefMorale:morale,hqCityId:id,enemyToFriendlyPowerRatio:ratio,nextTurnEnemyToFriendlyPowerRatio:nextRatio,enemyCanAttackNextTurn,safeRetreatRoutes:safe.length,frontAnchored,friendlyConcentrationReady,supplyMonths:supply,supplySustainable:supply>=1,ongoingBattle:Boolean(ongoing),forcedWithdrawalPending:false,crisisTriggered:Math.max(ratio,nextRatio)>=1.12||(morale<=42&&pressurePresent),severeThreat:ratio>=1.30||(morale<=30&&pressurePresent),nextTurnSevereThreat:enemyCanAttackNextTurn&&nextRatio>=1.30,currentThreat:now,nextTurnThreat:next,safeTargets:safe};}
function lifecycle(m,c,f){let state=Lifecycle.loadPersistedState(m,f);const snapshot=buildSnapshot(m,c,f),turn=periodSerial(m);let stepped=Lifecycle.stepLifecycle(state,snapshot,turn,LIFECYCLE_CONFIG);state=stepped.state;let replanned=false;if(state.mode==='REPLAN_NORMAL'){state=Lifecycle.finishReplan(state);replanned=true;}const recorded=Lifecycle.recordHQCity(state,snapshot.hqCityId);state=recorded.state;Lifecycle.savePersistedState(m,f,state);return{state,snapshot,event:stepped.event,replanned,completion:stepped.assessment||null,loopDetected:recorded.loopDetected};}
function assess(m,c,f){const life=lifecycle(m,c,f),s=life.snapshot;return{active:life.state.mode==='BREAKTHROUGH_CRISIS',severe:Boolean(s.severeThreat||s.nextTurnSevereThreat),chief:chiefArmy(m,f),city:s.hqCityId,own:troopsAt(m,s.hqCityId,f),enemy:s.currentThreat?.manpower||0,adjEnemy:landNeighbors(c,s.hqCityId||'').reduce((n,x)=>n+troopsAt(m,x,enemyOf(f)),0),projectedEnemy:Math.max(s.currentThreat?.manpower||0,s.nextTurnThreat?.manpower||0),ratio:s.enemyToFriendlyPowerRatio,effectiveRatio:s.enemyToFriendlyPowerRatio,nextTurnEffectiveRatio:s.nextTurnEnemyToFriendlyPowerRatio,morale:s.chiefMorale,reason:life.state.mode==='BREAKTHROUGH_CRISIS'?'BREAKTHROUGH_CRISIS':life.replanned?'CRISIS_COMPLETE_REPLANNED':'STABLE',lifecycle:life.state,snapshot:s,replanned:life.replanned};}
function safeMoveCandidate(m,c,f,a){
  if(!a.active||!a.chief||a.chief.acted_this_month||a.chief.battle_id)return null;
  const state=a.lifecycle||Lifecycle.loadPersistedState(m,f),safe=a.snapshot?.safeTargets||safeRetreatTargets(m,c,f,a.city);
  if(!safe.length)return null;
  const group=armiesAt(m,a.city,f).filter(x=>!x.acted_this_month).map(x=>x.id);
  if(!group.includes(a.chief.id))group.unshift(a.chief.id);
  const recent=new Set((state.hqCityHistory||[]).slice(-4));
  const rows=safe.map(r=>{
    const target=r.target,friendAt=troopsAt(m,target,f),friendAdj=landNeighbors(c,target).reduce((n,x)=>n+troopsAt(m,x,f),0);
    const isReturn=Lifecycle.isTwoCityShuttleCandidate(state,target);
    const score=(a.severe?258:178)+(friendAt+friendAdj*.35)/220+r.food/180-r.next*28+(r.ownControl?18:-14)+Math.min(3,r.exits)*12-(r.exits===0?42:0);
    const trust=Trust.project(m,c,f,{type:'MOVE',ids:group,origin:a.city,target,route:'MOVE'});
    return{score:score-trust.penalty,target,isReturn,recent:recent.has(target),allowed:trust.allowed};
  }).filter(r=>r.allowed);
  // A possible attack next month alone must not make the HQ spend every turn revisiting the
  // same two cities. When an attack is already possible now, survival takes precedence.
  const novel=rows.filter(r=>!r.recent);
  const choices=a.ratio<1.30?(novel.length?novel:[]):rows;
  choices.sort((x,y)=>y.score-x.score);
  const best=choices[0];if(!best)return null;
  return{operation:'BREAKTHROUGH_EMERGENCY_RETREAT',score:best.score,action:{type:'MOVE',ids:group,origin:a.city,target:best.target,route:'MOVE',strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:best.isReturn?'PRESERVE_HQ_ONLY_ROUTE':'PRESERVE_COMMANDER_IN_CHIEF'}};
}
function reinforcementCandidate(m,c,f,a){
 if(!a.active)return [];
 const rows=[];
 // An urgent rescue must deliver force to the HQ with this month's single legal command.
 const ready=Object.values(m.field_armies||{}).filter(x=>x.faction===f&&!x.acted_this_month&&x.manpower>0&&m.commanders?.[x.commander_id]?.role!=='総司令官'&&!['active','awaiting_tactic','awaiting_continuation'].includes(m.battles?.[x.battle_id]?.status));
 for(const origin of new Set(ready.map(x=>x.location_city_id))){
  if(origin===a.city)continue;
  const force=ready.filter(x=>x.location_city_id===origin),groups=[...force.map(x=>[x.id]),...(force.length>1?[force.map(x=>x.id)]:[])];
  for(const ids of groups){
  for(const route of ['MOVE','SEA_MOVE']){let legal=[];try{legal=C.getCommandCandidates(c,{command_type:route,origin_city_id:origin,faction:f});}catch{}
   if(!legal.includes(a.city))continue;
   rows.push({operation:'BREAKTHROUGH_EMERGENCY_REINFORCE',score:218,action:{type:'MOVE',ids,origin,target:a.city,route,strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'REBUILD_FRONT'}});
  }
  }
 }
 return rows;
}
function distance(c,start,goal){if(start===goal)return 0;const q=[[start,0]],seen=new Set([start]);while(q.length){const [x,d]=q.shift();for(const n of landNeighbors(c,x)){if(seen.has(n))continue;if(n===goal)return d+1;seen.add(n);q.push([n,d+1]);}}return 99;}
function formationCandidate(m,c,f,a){
 if(!a.active||control(m,a.city)!==f)return [];
 const rows=[];
 for(const reserve of m.political_phase?.commander_reserves?.[f]||[])try{
  E.formFieldArmyFromReserve({...m,current_faction:f},a.city,reserve.id,phase);
  rows.push({operation:'BREAKTHROUGH_EMERGENCY_FORM',score:201,action:{type:'FORM',city:a.city,commander_id:reserve.id,strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'EMERGENCY_NEW_ARMY'}});
 }catch{}
 return rows;
}
function garrisonCandidate(m,c,f,a){
  if(!a.active||!a.city||control(m,a.city)!==f)return null;
  const g=m.garrisons?.[a.city],log=m.city_logistics?.[a.city];
  if(!g||!log||(g.faction&&g.faction!==f))return null;
  // Once per HQ city and month. A garrison may act even after all field armies have acted.
  if((m.action_log||[]).some(x=>x.type==='GARRISON_FORMED'&&x.faction===f&&x.city_id===a.city&&x.year===m.calendar.year&&x.month===m.calendar.month))return null;
  const treasury=Number(m.factions?.[f]?.treasury)||0,materials=Math.min(Number(log.material_stock)||0,Number(c.cities[a.city].stockpile.MATERIALS)||0),mobilizable=Number(m.factions?.[f]?.mobilizable_manpower)||0;
  const treasuryPer100=Math.max(1,Number(phase?.garrison_formation?.treasury_cost_per_100_troops)||15),materialsPer100=Math.max(1,Number(phase?.garrison_formation?.materials_cost_per_100_troops)||100),affordable=Math.floor(Math.min(Number(g.cap)-Number(g.manpower),treasury/treasuryPer100*100,materials/materialsPer100*100,mobilizable,2000)/100)*100;
  if(affordable<100)return null;
  const pressure=Math.max(a.ratio||0,a.nextTurnEffectiveRatio||0);
  const desired=Math.ceil(Math.max(.25,Math.min(1,pressure-1))*20)*100;
  const troops=Math.min(affordable,desired);
  try{E.formGarrison(copy(m),a.city,f,troops,phase);}catch{return null;}
  return[{operation:'BREAKTHROUGH_EMERGENCY_GARRISON',score:205,action:{type:'GARRISON',city:a.city,troops,strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'DEFEND_COMMANDER_CITY'}}];
}
function navalEscapeCandidate(m,c,f,a){
  if(!a.active||!a.city)return null;
  const city=c.cities?.[a.city],zone=city?.geography?.sea_zone_id;
  if(!city?.geography?.is_port||!zone)return null;
  const period=`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
  try{
    const sea=N.seaActionProfile(c,zone,f,'SEA_RETREAT',period);
    if(sea.stage.key==='CONTROL'||!N.operationAvailability(c,zone,f,'PATROL',period).available)return null;
    return{operation:'BREAKTHROUGH_PREPARE_SEA_RETREAT',score:187+(a.snapshot?.safeRetreatRoutes===0?12:0),action:{type:'NAVAL',zone,operation:'PATROL',strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'PREPARE_SEA_RETREAT'}};
  }catch{return null;}
}
function recruitCandidate(m,c,f,a){
 if(!a.active)return [];
 // The same legal reinforcement choices apply to every local army, regardless of its age.
 const normal=require('./normal_operations_v1.js');
 return normal.fieldCandidates(m,c,f).filter(r=>m.field_armies[r.action.army_id]?.location_city_id===a.city).map(r=>({...r,operation:'BREAKTHROUGH_EMERGENCY_IMPROVE',action:{...r.action,strategic_reason:'BREAKTHROUGH_CRISIS'}}));
}

// BEGIN BTS EXPERIMENT: 1-3 month operational front relocation (not a rules change).
// A plan belongs to the existing crisis lifecycle, but NOT to its mode: a completed
// immediate crisis does not forcibly hold the AI in crisis merely to pursue the plan.
function frontOperationCandidates(m,c,f,a){
 const state=a.lifecycle||Lifecycle.loadPersistedState(m,f),chief=a.chief,turn=periodSerial(m);
 const prior=state.frontRelocationPlan;
 if(!chief||chief.manpower<1||chief.battle_id)return [];
 const enemy=enemyOf(f),localArmies=Object.values(m.field_armies||{}).filter(x=>x.faction===f&&x.manpower>0&&!x.battle_id),hq=chief.location_city_id;
 const nearby=landNeighbors(c,hq).reduce((s,id)=>s+troopsAt(m,id,f),0);
 const pressure=Math.max(a.ratio||0,a.nextTurnEffectiveRatio||0);
 const viablePrior=prior&&prior.faction===f&&prior.chief_id===chief.id&&turn>=prior.start_turn&&turn<=prior.end_turn&&c.cities?.[prior.target]&&control(m,prior.target)===f&&troopsAt(m,prior.target,enemy)===0;
 if(!a.active&&!viablePrior)return [];
 if(!viablePrior&&(pressure<1.12||nearby>=Math.max(2500,chief.manpower*.7)))return [];
 const occupied=new Set(Object.values(m.battles||{}).filter(b=>!['resolved','withdrawn'].includes(b.status)).map(b=>b.city_id));
 const legalCache=new Map(),routeCache=new Map(),period=`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
 function legal(from){if(legalCache.has(from))return legalCache.get(from);
  const rows=[];for(const route of ['MOVE','SEA_MOVE']){
   let cities=[];try{cities=C.getCommandCandidates(c,{command_type:route,origin_city_id:from,faction:f})||[];}catch{}
   for(const dest of cities){if(!c.cities?.[dest]||control(m,dest)===enemy||troopsAt(m,dest,enemy)>0||occupied.has(dest))continue;
    let rate=1;if(route==='SEA_MOVE'){
      try{const z1=c.cities[from].geography?.sea_zone_id,z2=c.cities[dest].geography?.sea_zone_id;
       if(!z1||!z2||!c.cities[from].geography?.is_port||!c.cities[dest].geography?.is_port)continue;
       rate=Number(N.seaRouteProfile(c,z1,z2,f,'LANDING',period).arrival_rate);
      }catch{continue;}
      // Do not trade a repeat land-withdrawal loss for an even more dangerous sea transfer.
      if(!Number.isFinite(rate)||rate<.96)continue;
    }
    rows.push({dest,route,rate});
   }
  }
  legalCache.set(from,rows);return rows;
 }
 function path(from,to,limit=3){const key=from+'>'+to+'@'+limit;if(routeCache.has(key))return routeCache.get(key);
  if(from===to)return [];
  const q=[{city:from,steps:[],seen:new Set([from])}];let best=null;
  while(q.length){const p=q.shift();if(p.steps.length>=limit)continue;
   for(const e of legal(p.city)){if(p.seen.has(e.dest))continue;const steps=[...p.steps,{from:p.city,...e}];
    if(e.dest===to){best=steps;break;}
    q.push({city:e.dest,steps,seen:new Set([...p.seen,e.dest])});
   }if(best)break;
  }
  routeCache.set(key,best);return best;
 }
 function attackPressure(id){let enemyNear=0;
  for(const army of Object.values(m.field_armies||{}))if(army.faction===enemy&&army.manpower>0&&army.location_city_id!==id&&!army.battle_id){
    if(landNeighbors(c,army.location_city_id).includes(id))enemyNear+=army.manpower;
    else if(directRoute(c,army.location_city_id,id,enemy)==='LANDING_ATTACK')enemyNear+=army.manpower*.8;
  }
  return enemyNear;
 }
 function supportAt(target){return localArmies.filter(x=>x.id!==chief.id&&(target===hq||x.location_city_id!==hq)).reduce((v,x)=>{
    if(x.location_city_id===target)return v+x.manpower;
    return landNeighbors(c,target).includes(x.location_city_id)?v+x.manpower*.65:v;
  },0);}
 function scoreTarget(target,hqPath){const support=supportAt(target),enemyNear=attackPressure(target),own=troopsAt(m,target,f),food=supplyMonths(m,c,target);
   if(support<1200||food<.9||enemyNear>Math.max(1200,own+troopsAt(m,hq,f)*.65+support*.55))return null;
   const seaLoss=hqPath.reduce((x,p)=>x+(1-p.rate),0);
   const score=Math.min(100,support/70)+Math.min(24,food*7)+Math.min(35,Math.max(0,3-distance(c,hq,target))*13)
      +Math.min(20,own/180)-(hqPath.length-1)*17-seaLoss*160-enemyNear/175;
   return {score,support,enemyNear,food,seaLoss};
 }
 const targets=[];
 if(viablePrior){const p=path(hq,prior.target,3);if(p){const s=scoreTarget(prior.target,p);if(s)targets.push({target:prior.target,steps:p,...s,persistent:true});}}
 if(!targets.length&&a.active){for(const target of Object.keys(c.cities||{})){
   if(target===hq||control(m,target)!==f||occupied.has(target))continue;
   const p=path(hq,target,3);if(!p||!p.length)continue;
   const s=scoreTarget(target,p);if(!s)continue;
   const history=(state.hqCityHistory||[]).slice(-3);
   if(history.includes(target))continue;
   targets.push({target,steps:p,...s,persistent:false});
 }}
 if(!targets.length)return [];
 targets.sort((x,y)=>Number(y.persistent)-Number(x.persistent)||y.score-x.score);
 const goal=targets[0],validPlan=viablePrior&&goal.persistent;
 const plan={schema:1,faction:f,chief_id:chief.id,target:goal.target,start_turn:validPlan?prior.start_turn:turn,end_turn:validPlan?prior.end_turn:turn+2};
 const rows=[];
 // Stage one: shift the headquarters toward the middle/forward rear base.
 if(!chief.acted_this_month&&goal.steps[0]&&chief.location_city_id===hq){
  const step=goal.steps[0],group=armiesAt(m,hq,f).filter(x=>!x.acted_this_month&&!x.battle_id).map(x=>x.id);
  if(group.includes(chief.id)){
   const projectedDanger=attackPressure(step.dest),local=troopsAt(m,step.dest,f),moving=group.reduce((v,id)=>v+(m.field_armies[id]?.manpower||0),0);
   if(projectedDanger<=Math.max(1200,(local+moving)*1.15))rows.push({
    operation:'BREAKTHROUGH_OPERATION_FRONT_RELOCATE',score:(validPlan?286:267)+Math.min(22,goal.support/240)+(a.severe?4:0),
    action:{type:'MOVE',ids:group,origin:hq,target:step.dest,route:step.route,strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'FRONT_RELOCATION_HQ',front_operation_plan:plan},
    operational_horizon_months:goal.steps.length,operational_objective:goal.target,operational_gain:{support:goal.support,food_months:goal.food,sea_loss:goal.seaLoss}
   });
  }
 }
 // Stage two: bring independent divisions toward the SAME base. Do not move a field army
 // away from an already threatened city just to manufacture apparent HQ safety.
 for(const origin of new Set(localArmies.map(x=>x.location_city_id))){if(origin===hq||origin===goal.target)continue;
  const units=armiesAt(m,origin,f).filter(x=>x.id!==chief.id&&!x.acted_this_month&&!x.battle_id);
  if(!units.length)continue;
  const old=path(origin,goal.target,3);if(!old||!old.length)continue;
  const step=old[0],originPressure=attackPressure(origin),atOrigin=troopsAt(m,origin,f);
  if(originPressure>=Math.max(1500,atOrigin*.9))continue;
  const moving=units.reduce((v,x)=>v+x.manpower,0),destPressure=attackPressure(step.dest);
  if(destPressure>Math.max(1200,(troopsAt(m,step.dest,f)+moving)*1.1))continue;
  rows.push({operation:'BREAKTHROUGH_OPERATION_RENDEZVOUS',score:(validPlan?267:231)+Math.min(20,moving/300)-old.length*6-(a.severe?35:0),
   action:{type:'MOVE',ids:units.map(x=>x.id),origin,target:step.dest,route:step.route,strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'FRONT_RELOCATION_SUPPORT',front_operation_plan:plan},
   operational_horizon_months:old.length,operational_objective:goal.target});
 }
 // No rescueValue: first-month operational gain need not improve instantaneous power ratio.
 // Validity, trust, sea attrition and the ordinary movement/supply guards still apply downstream.
 return rows;
}
// END BTS EXPERIMENT

function rescueValue(m,c,f,row,a){
 const action=row.action,normal=require('./normal_operations_v1.js');if(!['MOVE','FORM','GARRISON','IMPROVE','RECRUIT','TRAINING'].includes(action.type))return row;
 try{
  const cost=action.type==='MOVE'?normal.departure(m,c,f,action):null;if(cost&&!cost.safe)return null;
  const value=Readiness.forecastAfterAction(m,c,f,action),projected=value.projected.m,board=value.projected.c,chief=chiefArmy(projected,f);if(!chief)return null;
  const now=directThreat(projected,board,f,chief.location_city_id).ratio,closedChief=chiefArmy(value.next.m,f);if(!closedChief)return null;
  const next=Math.max(directThreat(value.next.m,value.next.c,f,closedChief.location_city_id).ratio,nextTurnThreat(value.next.m,value.next.c,f,closedChief.location_city_id).ratio);
  const window=a.enemyWindow||Readiness.enemyWindow(m,f,a.city),after=window.kind==='AFTER_MONTH_CLOSE'?next:now,before=a.windowRatio??Math.max(a.ratio,a.nextTurnEffectiveRatio);
  if(!(after<before-.001))return null;
  const supply=supplyMonths(projected,board,chief.location_city_id),shortages=value.next.events.filter(e=>e.city_id===chief.location_city_id&&e.type.endsWith('_SHORTAGE'));
  const safe=now<1.30&&next<1.30&&shortages.length===0&&supply>=1,immediateSafe=now<1.30;
  const funds=Math.max(0,m.factions[f].treasury-projected.factions[f].treasury),materials=Object.keys(c.cities).reduce((n,id)=>n+Math.max(0,c.cities[id].stockpile.MATERIALS-board.cities[id].stockpile.MATERIALS),0);
  const transitLoss=action.type==='MOVE'&&action.route==='SEA_MOVE'?Math.max(0,1-N.seaRouteProfile(c,c.cities[action.origin].geography.sea_zone_id,c.cities[action.target].geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate):0;
  row.score=160+(safe?100:immediateSafe&&a.ratio>=1.30?45:0)+(safe?40:Math.min(35,Math.max(0,before-after)*24))-(cost?.penalty||0)-transitLoss*60-funds/65-materials/500;
  row.rescue_value={arrives_before_crisis:true,current_ratio:now,next_ratio:next,window_ratio:after,baseline_window_ratio:before,enemy_window:window.kind,safe,immediate_safe:immediateSafe,supply_months:supply,departure:cost,treasury_cost:funds,materials_cost:materials,transit_loss_rate:transitLoss,objective_class:safe?2:immediateSafe?1:0,shortages_before_next_turn:shortages.map(e=>({type:e.type,city_id:e.city_id,unmet:e.unmet,desertion:e.garrison_desertion_rate}))};
  row.operational_readiness={stage:shortages.length?'STABILIZE':'SUSTAINABLE',blockers:shortages.map(e=>e.type),unknowns:next>=1.30?['FRONT_NOT_SECURED']:[],score_delta:0,forecast:value.summary};return row;
 }catch{return null;}
}
function actionDescriptor(action,chief){if(!action)return{type:'UNKNOWN'};const movesHQ=action.type==='MOVE'&&Array.isArray(action.ids)&&chief&&action.ids.includes(chief.id);if(movesHQ)return{type:'MOVE_HQ',targetCityId:action.target,safe:true};if(action.type==='RECRUIT'||action.type==='IMPROVE')return{type:action.kind||action.type,targetCityId:action.city||chief?.location_city_id||null};return{type:action.type,targetCityId:action.target||action.city||null};}
function screeningCounterattackCandidate(m,c,f,a){
  // Stage IV: strike an exposed pursuer with a separate field detachment.
  // Never throw the supreme commander into an opportunistic battle.
  if(!a.active||!a.chief||Math.max(a.ratio||0,a.nextTurnEffectiveRatio||0)<1.15)return null;
  const target=a.snapshot?.currentThreat?.origin||a.snapshot?.nextTurnThreat?.origin;
  if(!target||target===a.city||troopsAt(m,target,enemyOf(f))<=0)return null;
  const options=[];
  for(const origin of landNeighbors(c,target)){
    if(origin===a.city||control(m,origin)===enemyOf(f))continue;
    for(const army of armiesAt(m,origin,f)){
      if(army.acted_this_month||army.battle_id||Number(army.morale||0)<45||Number(army.manpower||0)<100)continue;
      try{
        const prepared=B.prepareBattle(m,{origin_city_id:origin,city_id:target,attacker_army_ids:[army.id],leader_army_id:army.id,route_type:'LAND_ATTACK'},c,phase);
        const ratio=B.basePower(prepared.attacker,phase.battle_engine,false)/Math.max(1,B.basePower(prepared.defender,phase.battle_engine,true));
        if(ratio<1.55)continue;
        options.push({operation:'BREAKTHROUGH_SCREEN_PURSUER',score:222+Math.min(24,(ratio-1.55)*25),action:{type:'ATTACK',origin,target,ids:[army.id],leader:army.id,route:'LAND_ATTACK',strategic_reason:'BREAKTHROUGH_CRISIS',operational_reason:'INTERCEPT_EXPOSED_PURSUER'}});
      }catch{}
    }
  }
  options.sort((x,y)=>y.score-x.score);
  return options[0]||null;
}
function crisisCandidates(m,c,f){const a=assess(m,c,f);const operationRows=frontOperationCandidates(m,c,f,a);if(!a.active)return{assessment:a,candidates:operationRows,operation_active:operationRows.length>0};a.enemyWindow=Readiness.enemyWindow(m,f,a.city);if(a.enemyWindow.kind==='AFTER_MONTH_CLOSE'){const closed=Readiness.monthClose(m,c);a.windowRatio=Math.max(directThreat(closed.m,closed.c,f,a.city).ratio,nextTurnThreat(closed.m,closed.c,f,a.city).ratio);}else a.windowRatio=a.ratio;let rows=[];for(const fn of [safeMoveCandidate,reinforcementCandidate,formationCandidate,recruitCandidate,garrisonCandidate,navalEscapeCandidate,screeningCounterattackCandidate]){const x=fn(m,c,f,a);rows.push(...(Array.isArray(x)?x:x?[x]:[]));}rows=[...rows.map(r=>rescueValue(m,c,f,r,a)).filter(Boolean),...operationRows];
 // A rescue that guarantees political defeat cannot preserve the campaign.
 rows=rows.filter(r=>!r.rescue_value?.departure?.trust_policy||r.rescue_value.departure.trust_policy.allowed);
 rows.sort((x,y)=>y.score-x.score);if(rows.length>1){const state=a.lifecycle;const mapped=rows.map(r=>({...r,_desc:actionDescriptor(r.action,a.chief)}));const first=mapped[0],sup=Lifecycle.shouldSuppressCrisisAction(state,first._desc,a.snapshot,mapped.slice(1).map(x=>x._desc),LIFECYCLE_CONFIG);if(sup.suppress){mapped.shift();mapped.push({...first,score:first.score-120,suppressed_reason:sup.reason});mapped.sort((x,y)=>y.score-x.score);}rows=mapped.map(({_desc,...r})=>r);}return{assessment:a,candidates:rows};}
function noteChosenAction(m,f,action,c=null){const state=Lifecycle.loadPersistedState(m,f);const chief=chiefArmy(m,f),desc=actionDescriptor(action,chief);let next=Lifecycle.noteCrisisAction(state,desc);if(action?.type==='MOVE'&&chief&&Array.isArray(action.ids)&&action.ids.includes(chief.id))next=Lifecycle.recordHQCity(next,action.target).state;if(action?.front_operation_plan)next.frontRelocationPlan=action.front_operation_plan;Lifecycle.savePersistedState(m,f,next);return next;}
function noteNormalAction(m,f){let state=Lifecycle.loadPersistedState(m,f);state.metrics.normalActions=(state.metrics.normalActions||0)+1;if(state.crisisExitTurn!=null&&!state.normalActionSeenAfterExit){state.normalActionSeenAfterExit=true;state.metrics.normalActionsAfterExit=(state.metrics.normalActionsAfterExit||0)+1;}Lifecycle.savePersistedState(m,f,state);return state;}
function noteSecondaryAction(m,f){const state=Lifecycle.loadPersistedState(m,f);state.lastTransition='CRISIS_SECONDARY_COMMAND';state.metrics.crisisSecondaryActions=(state.metrics.crisisSecondaryActions||0)+1;Lifecycle.savePersistedState(m,f,state);return state;}
function noteNoLegalCrisisAction(m,f){const state=Lifecycle.loadPersistedState(m,f);state.lastTransition='CRISIS_NO_LEGAL_COMMAND';state.metrics.crisisNoLegalCommands=(state.metrics.crisisNoLegalCommands||0)+1;Lifecycle.savePersistedState(m,f,state);return state;}
function preferredPrebattleRetreat(prepared,c,f){
  if(!c)return null;
  const {state,battle}=prepared,ids=battle.defender_army_ids.filter(id=>state.field_armies?.[id]?.manpower>0);
  const normal=B.selectRetreatPlan(state,c,battle,f,E,ids,phase.battle_engine);
  if(!normal)return null;
  const routes=B.sortRetreatRoutes([
    ...B.buildLandRetreatRoutes(state,c,battle,f,ids,phase.battle_engine),
    ...B.buildSeaRetreatRoutes(state,c,battle,f,ids,phase.battle_engine)]);
  function risk(route){
    const virtual=copy(state);
    B.applyRetreatPlan(virtual,ids,route);
    const g=virtual.garrisons?.[battle.city_id];
    if(g?.faction===f){g.manpower=0;g.faction=null;}
    for(const id of battle.attacker_army_ids)if(virtual.field_armies?.[id])virtual.field_armies[id].location_city_id=battle.city_id;
    virtual.battles[battle.id].status='withdrawn';
    const exitCount=landNeighbors(c,route.destination_city_id).filter(dest=>dest!==battle.city_id&&control(virtual,dest)!==enemyOf(f)&&troopsAt(virtual,dest,enemyOf(f))===0).length;return{immediate:directThreat(virtual,c,f,route.destination_city_id).ratio,next:nextTurnThreat(virtual,c,f,route.destination_city_id).ratio,supply:supplyMonths(virtual,c,route.destination_city_id),exitCount};
  }
  // The existing ordering is generally useful. Intervene only if it sends the
  // commander straight back under a decisive attack, while a nearby route with
  // no additional transit loss and adequate provisions avoids the immediate attack.
  // Prefer an actually safe next turn, then stay close to the front. Never
  // increase the projected next-turn risk just to avoid one immediate attack.
  const normalThreat=risk(normal);
  if(normalThreat.immediate<1.30&&normalThreat.exitCount>0&&normal.arrival_rate>=.995)return null;
  const viable=[],seen=new Set([normal.destination_city_id]);
  for(const route of routes){
    const city=route.destination_city_id;
    if(seen.has(city))continue;
    seen.add(city);
    if(route.arrival_rate<normal.arrival_rate)continue;
    const distanceFromBattle=distance(c,battle.city_id,city);
    if(distanceFromBattle>3)continue;
    const threat=risk(route);
    if(threat.immediate>=1.30||threat.next>Math.max(1.30,normalThreat.next+.05)||threat.supply<1||threat.exitCount===0)continue;
    viable.push({city,distanceFromBattle,stars:route.stars,food:route.food,next:threat.next});
  }
  viable.sort((a,b)=>Number(a.next>=1.30)-Number(b.next>=1.30)||a.distanceFromBattle-b.distanceFromBattle||b.stars-a.stars||a.next-b.next||b.food-a.food);
  return viable[0]?.city||null;
}
function defenseDecision(prepared,f,c){
 const b=prepared?.battle;if(!b||b.defender_faction!==f)return{withdraw:false,tactic:'hold_line',reason:'NOT_OUR_DEFENSE'};
 const chiefIds=(b.defender_army_ids||[]).filter(id=>prepared.state.commanders?.[prepared.state.field_armies?.[id]?.commander_id]?.role==='総司令官');
 if(!chiefIds.length)return{withdraw:false,tactic:'hold_line',reason:'CHIEF_NOT_PRESENT'};
 const morale=Math.min(...chiefIds.map(id=>Number(prepared.state.field_armies[id]?.morale)||0));
 const atk=B.basePower(prepared.attacker,phase.battle_engine,false),def=B.basePower(prepared.defender,phase.battle_engine,true),ratio=def>0?atk/def:99;
 const tactics=phase.battle_engine.tactics||{},allOut=Number(tactics.all_out_attack?.power||1.12),hold=Number(tactics.hold_line?.power||.95),expectedAssault=ratio*allOut/Math.max(.1,hold);
 const retreatNeeded=ratio>=1.30||expectedAssault>=1.35||(morale<=28&&expectedAssault>=1.15);
 const legalRetreat=retreatNeeded&&c?B.selectRetreatPlan(prepared.state,c,b,f,E,b.defender_army_ids.filter(id=>prepared.state.field_armies?.[id]?.manpower>0),phase.battle_engine):null;
 const recommended=legalRetreat?preferredPrebattleRetreat(prepared,c,f):null;
 const preferredRetreatCityId=recommended||legalRetreat?.destination_city_id||null;
 const chosenRoute=preferredRetreatCityId&&c?B.sortRetreatRoutes([...B.buildLandRetreatRoutes(prepared.state,c,b,f,b.defender_army_ids,phase.battle_engine),...B.buildSeaRetreatRoutes(prepared.state,c,b,f,b.defender_army_ids,phase.battle_engine)]).find(x=>x.destination_city_id===preferredRetreatCityId):null;
 // With low morale or overwhelming assault, survival matters. But never repeatedly sacrifice
 // ten percent of the army for a marginal risk on a weak or isolated withdrawal route.
 const goodWithdrawal=Boolean(chosenRoute&&chosenRoute.arrival_rate>=.995&&chosenRoute.destination_control===f);
 let withdraw=Boolean(preferredRetreatCityId)&&(ratio>=1.30||(expectedAssault>=1.35&&goodWithdrawal)||(morale<=28&&expectedAssault>=1.15&&goodWithdrawal));
 let trust=null;if(withdraw&&c){try{trust=Trust.project(prepared.state,c,f,{type:'PREBATTLE_WITHDRAW',battle_id:b.id,retreat_city_id:preferredRetreatCityId});}catch{}if(trust&&!trust.allowed)withdraw=false;}
 return{withdraw,tactic:withdraw?null:'hold_line',reason:trust&&!trust.allowed?'POLITICAL_SURVIVAL_HOLD':withdraw?'BREAKTHROUGH_PREBATTLE_WITHDRAWAL':'CRISIS_HOLD',ratio,effectiveRatio:ratio,morale,threshold:1.30,assaultRiskRatio:expectedAssault,withdrawalArrivalRate:chosenRoute?.arrival_rate??null,preferredRetreatCityId:withdraw?preferredRetreatCityId:null,trust_policy:trust};
}
module.exports={META,LIFECYCLE_CONFIG,assess,buildSnapshot,crisisCandidates,defenseDecision,noteChosenAction,noteNormalAction,noteSecondaryAction,noteNoLegalCrisisAction,safeMoveCandidate,garrisonCandidate,navalEscapeCandidate,chiefArmy,landNeighbors,troopsAt,distance,directThreat,nextTurnThreat,safeRetreatTargets,supplyMonths,lifecycle};
};
modules['AI_OFFICIAL_CURRENT/front_mission_value_v1.js']=function(require,module,exports){
'use strict';
// Compare achieved front objectives for formation, improvement and concentration alike.
const B=require('../runtime/battle_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const N=require('./naval_api_v1.js');
const CombatProjection=require('./combat_projection_v1.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function attackReadiness(m,c,f,id){
 const enemy=f==='PATRIOT'?'BRITISH':'PATRIOT',rows=[];
 const ids=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0&&!a.battle_id).map(a=>a.id);
 if(!ids.length)return rows;
 for(const route of ['ATTACK','LANDING_ATTACK']){let targets=[];try{targets=C.getCommandCandidates(c,{command_type:route,origin_city_id:id,faction:f});}catch{}
 for(const target of targets){if(P.militaryControl(m,target,political)!==enemy)continue;try{
  const virtual=CombatProjection.copy(m);for(const army of Object.values(virtual.field_armies))army.acted_this_month=false;
  if(route==='LANDING_ATTACK'){const rate=N.seaRouteProfile(c,c.cities[id].geography.sea_zone_id,c.cities[target].geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate;if(rate<.70)continue;for(const armyId of ids)virtual.field_armies[armyId].manpower=Math.floor(virtual.field_armies[armyId].manpower*rate);}
  const pre=B.prepareBattle(virtual,{origin_city_id:id,city_id:target,attacker_army_ids:ids,leader_army_id:B.selectBattlefieldLeader(virtual,ids),route_type:route==='ATTACK'?'LAND_ATTACK':route},c,phase);
  const cfg=phase.battle_engine,t=cfg.tactics.normal_attack,raw=B.basePower(pre.attacker,cfg,false)/Math.max(1,B.basePower(pre.defender,cfg,true));
  const expected=raw*t.power/(cfg.tactics[pre.battle.tactic[enemy]]||cfg.tactics.hold_line).power;
  const worst=raw*t.power*t.random_min/Math.max(...Object.values(cfg.tactics).map(x=>x.power*x.random_max));
  const chief=ids.some(a=>m.commanders[m.field_armies[a].commander_id]?.role==='総司令官');
  const readiness=Math.min(expected/1.05,worst/(chief?1.12:.80));
  rows.push({target,route,readiness,expected,worst});
 }catch{}}
 }
 return rows;
}
function snapshot(m,c,f,id){const Crisis=require('./breakthrough_crisis_v2.js');return {threat:Math.max(Crisis.directThreat(m,c,f,id).ratio,Crisis.nextTurnThreat(m,c,f,id).ratio),attacks:attackReadiness(m,c,f,id)};}
function compare(m,projected,c,f,id,beforeValue=null){
 const Crisis=require('./breakthrough_crisis_v2.js');
 beforeValue=beforeValue||snapshot(m,c,f,id);
 const beforeThreat=beforeValue.threat;
 const afterThreat=Math.max(Crisis.directThreat(projected,c,f,id).ratio,Crisis.nextTurnThreat(projected,c,f,id).ratio);
 const before=beforeValue.attacks,after=attackReadiness(projected,c,f,id);
 const unlocked=after.filter(a=>a.readiness>=1&&!before.some(b=>b.target===a.target&&b.route===a.route&&b.readiness>=1));
 const progress=Math.max(0,...after.map(a=>Math.min(1,a.readiness)-Math.min(1,before.find(b=>b.target===a.target&&b.route===a.route)?.readiness||0)));
 const defenseSecured=beforeThreat>=1.30&&afterThreat<1.30;
 const defenseProgress=Math.max(0,Math.min(1.30,beforeThreat)-Math.min(1.30,afterThreat));
 const bonus=(defenseSecured?45:Math.min(20,defenseProgress*24))+(unlocked.length?40:Math.min(24,progress*48));
 return {bonus,defense_secured:defenseSecured,before_threat:beforeThreat,after_threat:afterThreat,unlocked_attacks:unlocked,attack_progress:progress};
}
module.exports={compare,attackReadiness,snapshot};
};
modules['AI_OFFICIAL_CURRENT/formation_mission_planner_v1.js']=function(require,module,exports){
 'use strict';
// Persistent, generic formation missions. Advisory scoring only: no forced march,
// no new command point, no free garrison, and no city-name special cases.
const Logistics=require('./logistics_strategy_v1.js');
const Readiness=require('./operational_readiness_v1.js');
const Political=require('../runtime/political_phase_engine_v0_77_portraits.js');
const political=require('../source_data/political_phase_config_v0_1.json');
const serial=m=>Number(m.calendar?.year||1775)*12+Number(m.calendar?.month||6);
const enemy=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
const control=(m,id)=>Political.militaryControl(m,id,political);
function neighbors(c,id){const result=[];for(const e of c.topology?.edges||[]){if(String(e.type||'').startsWith('water_')||e.counts_as_land_adjacency===false)continue;if(e.a===id)result.push(e.b);else if(e.b===id)result.push(e.a);}return [...new Set(result)];}
function troopIndex(m){const index={};for(const a of Object.values(m.field_armies||{})){if(!(a.manpower>0)||a.battle_id)continue;const key=a.location_city_id+'|'+a.faction;index[key]=(index[key]||0)+Number(a.manpower);}return index;}
function grouped(m,f){const result=new Map();for(const a of Object.values(m.field_armies||{}))if(a.faction===f&&a.manpower>0&&!a.battle_id){if(!result.has(a.location_city_id))result.set(a.location_city_id,{city:a.location_city_id,ids:[],manpower:0,chief:false});const g=result.get(a.location_city_id);g.ids.push(a.id);g.manpower+=Number(a.manpower);if(m.commanders?.[a.commander_id]?.role==='総司令官')g.chief=true;}return [...result.values()].filter(g=>g.manpower>=2500||g.ids.length>=2);}
function plan(m,c,f,rows=[]){const now=serial(m),prev=m.ai_runtime?.operations?.[f]?.group_missions||{},troops=troopIndex(m),plans={};
 for(const group of grouped(m,f)){
  const city=c.cities?.[group.city];if(!city)continue;
  const near=neighbors(c,group.city),e=enemy(f),adjEnemy=near.reduce((n,id)=>n+(troops[id+'|'+e]||0),0),frontier=near.filter(id=>control(m,id)!==f).length,loc=Logistics.balanceFor(m,c,group.city),months=loc?.months??99,importance=Number(city.politics?.political_importance)||1;
  const relevant=rows.filter(r=>(r.score>0||r.operational_readiness?.admissible===false)&&['MOVE','ATTACK'].includes(r.action?.type)&&r.action?.origin===group.city&&r.action?.ids?.length);
  // A front line may be held intentionally as a deterrent, even where its local
  // independence support does not grant a star to the occupying faction.
  const deterrence=adjEnemy>0||frontier>0&&(group.manpower>=4500||importance>=4);
  const starving=months<1.5;
  const existing=Object.values(prev).find(p=>p.city===group.city&&p.ids?.some(id=>group.ids.includes(id))&&now-Number(p.reviewed||now)<4);
  const attack=relevant.filter(r=>r.action.type==='ATTACK').sort((a,b)=>b.score-a.score)[0];
  const advance=relevant.filter(r=>r.action.type==='MOVE'&&!r.operational_command?.defense_lost&&r.departure?.safe!==false).sort((a,b)=>b.score-a.score)[0];
  // Do not change an active objective at every monthly scoring pass. The
  // mission is reviewed earlier only if its role changes (e.g. supply crisis).
  let role=starving?'SUSTAIN_OR_REDISTRIBUTE':deterrence?'HOLD_AND_SCREEN':relevant.length?'PREPARE_ADVANCE':'RESERVE';
  if(existing&&!starving&&existing.role==='HOLD_AND_SCREEN'&&frontier)role='HOLD_AND_SCREEN';
  const continued=!!(existing&&existing.role===role&&now<Number(existing.review_by||0)&&!existing.readiness_replan_required&&c.cities?.[existing.objective]);
  const objective=continued?existing.objective:(attack?.action?.target||advance?.action?.target||group.city);
  const resource=Readiness.status(m,c,group.city),ready=relevant.find(r=>r.action.type==='ATTACK'&&r.operational_readiness?.stage==='ADVANCE_READY'),preparing=relevant.find(r=>r.action.type==='ATTACK');const readiness={stage:resource.blockers.length?'STABILIZE':ready?'ADVANCE_READY':preparing?'PREPARING_ADVANCE':'SUSTAINABLE',blockers:resource.blockers.length?resource.blockers:(preparing?.operational_readiness?.blockers||[]),unknowns:preparing?.operational_readiness?.unknowns||[],attack_target:ready?.action.target||preparing?.action.target||null};
  plans[group.city]={city:group.city,ids:group.ids,manpower:group.manpower,chief:group.chief,role,objective,readiness,reviewed:continued?existing.reviewed:now,review_by:continued?existing.review_by:now+2,months_of_supply:Number.isFinite(months)?Math.round(months*100)/100:99,frontier_links:frontier,enemy_adjacent:adjEnemy,deterrence,importance,prior_role:existing?.role||null};
 }
 return plans;
}
function applyRows(m,c,f,rows){const plans=plan(m,c,f,rows);for(const row of rows){if(row.formation_mission)continue;const a=row.action||{},origin=a.type==='TRANSPORT'?a.target:(a.origin||a.city||a.target),mission=plans[origin];if(!mission)continue;
  let bonus=0;const months=mission.months_of_supply;
  if(a.type==='MOVE'){
   const count=(a.ids||[]).length,moved=(a.ids||[]).reduce((n,id)=>n+(Number(m.field_armies?.[id]?.manpower)||0),0);
   const partial=moved<mission.manpower*.85;
   if(months<1.5){const destination=Logistics.balanceFor(m,c,a.target,moved);if(destination?.months>=1.4)bonus+=Math.min(28,9+(1.5-months)*12);} // coherent redistribution to a sustainable base
   if(mission.role==='HOLD_AND_SCREEN'&&partial&&!row.operational_command?.defense_lost)bonus+=Math.min(11,mission.frontier_links*3+4); // screen plus mobile reserve
   if(mission.role==='HOLD_AND_SCREEN'&&!partial&&!row.mission?.defense_secured&&!a.strategic_reason?.includes('CRISIS'))bonus-=Math.min(20,8+mission.frontier_links*3); // do not abandon a deterrent blindly
   if(mission.role==='PREPARE_ADVANCE'&&a.target===mission.objective)bonus+=9;
  }else if(a.type==='ATTACK'){
   const city=c.cities?.[a.target],stock=city?.stockpile||{};
   if(months<1.65&&Number(stock.FOOD||0)>=900)bonus+=Math.min(22,Math.floor(Number(stock.FOOD)/120));
   if(mission.role==='HOLD_AND_SCREEN')bonus+=5; // local limited attack instead of endless immobility
  }else if(a.type==='TRANSPORT'&&a.target===origin){if(months<2)bonus+=Math.min(18,Math.round((2-months)*10));}
  else if(a.type==='FORCED_REQUISITION_AI'&&months>=.4){bonus-=Math.min(18,6+mission.frontier_links*3);}
  else if(a.type==='GARRISON'&&mission.ids.length>1&&mission.role==='PREPARE_ADVANCE'){bonus+=10;}
  if(bonus){row.score+=bonus;}row.formation_mission={role:mission.role,city:origin,objective:mission.objective,supply_months:months,score_delta:bonus};
 }
 return rows;
}
function record(m,c,f,rows,chosen){if(!chosen)return;const plans=plan(m,c,f,rows);m.ai_runtime=m.ai_runtime||{};m.ai_runtime.operations=m.ai_runtime.operations||{};
 const existing=m.ai_runtime.operations[f]||{};const old=existing.group_missions||{};const next={};const now=serial(m);
 for(const group of Object.values(plans)){
   const prior=old[group.city],changed=chosen.origin===group.city||chosen.city===group.city||chosen.target===group.city;
   const readinessSince=prior?.readiness?.stage===group.readiness.stage&&prior?.readiness?.attack_target===group.readiness.attack_target&&!(changed&&rows.find(r=>r.action===chosen)?.operational_readiness?.improves_supply)?(prior.readiness_since??now):now;const stalled=group.readiness.stage==='PREPARING_ADVANCE'&&now-readinessSince>=2;
   next[group.city]={...group,readiness_since:readinessSince,readiness_review_by:readinessSince+2,readiness_replan_required:stalled,readiness_review_reason:stalled?'PREPARATION_STALLED_REPLAN':'CURRENT_RESOURCE_AND_ATTACK_CHECK',started:prior?.role===group.role?(prior.started||now):now,last_action:changed?chosen.type:(prior?.last_action||'HOLD'),last_action_turn:changed?now:(prior?.last_action_turn||now)};
 }
 m.ai_runtime.operations[f]={...existing,group_missions:next};
}
module.exports={plan,applyRows,record};
};
modules['AI_OFFICIAL_CURRENT/operational_command_v1.js']=function(require,module,exports){
'use strict';
// Operational roles follow the live force, not named commanders or historical cities.
// They add no orders, movement range, combat modifiers or command points.
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const political=require('../source_data/political_phase_config_v0_1.json');
const serial=m=>Number(m.calendar.year)*12+Number(m.calendar.month);
const engaged=(m,a)=>['active','awaiting_tactic','awaiting_continuation'].includes(m.battles?.[a.battle_id]?.status);
function groups(m,f){
 const byCity=new Map();
 for(const a of Object.values(m.field_armies||{}))if(a.faction===f&&a.manpower>0&&!engaged(m,a)){
  if(!byCity.has(a.location_city_id))byCity.set(a.location_city_id,[]);
  byCity.get(a.location_city_id).push(a);
 }
 return [...byCity].map(([city,armies])=>({city,ids:armies.map(a=>a.id),manpower:armies.reduce((n,a)=>n+a.manpower,0),
  role:armies.some(a=>['総司令官','方面軍司令官'].includes(m.commanders?.[a.commander_id]?.role))?'THEATER_ARMY':armies.length>1?'STRIKE_GROUP':'RAIDER'}));
}
function createContext(m,c,f,front){
 const formation=groups(m,f),losses=new Map(),tasks=m.ai_runtime?.operations?.[f]?.assignments||{};
 return {formation,tasks,loss(ids,origin){
  const key=ids.slice().sort().join('|');if(losses.has(key))return losses.get(key);
  const before=front.mission(origin),units={...m.field_armies};for(const id of ids)delete units[id];
  const after=require('./front_mission_value_v1.js').snapshot({...m,field_armies:units},c,f,origin);
  const lost=before.attacks.filter(a=>a.readiness>=1&&!after.attacks.some(b=>b.target===a.target&&b.route===a.route&&b.readiness>=1));
  const value={lost_attacks:lost,defense_lost:before.threat<1.30&&after.threat>=1.30};losses.set(key,value);return value;
 }};
}
function assessMove(m,c,f,row,ctx){
 const a=row.action,group=ctx.formation.find(g=>g.city===a.origin),ids=new Set(a.ids||[]);
 const emergency=a.strategic_reason==='BREAKTHROUGH_CRISIS'||a.strategic_reason==='PRESERVE_THREATENED_FIELD_FORCE';
 const supply=a.strategic_reason==='RELIEVE_SUPPLY_PRESSURE';
 const partial=group&&group.ids.length>1&&group.ids.some(id=>!ids.has(id));
 const loss=!emergency&&!supply?ctx.loss([...ids],a.origin):{lost_attacks:[],defense_lost:false};
 const moving=[...ids].reduce((n,id)=>n+(m.field_armies[id]?.manpower||0),0);
 // A small detachment may occupy an empty city if the main body keeps its mission.
 const raid=partial&&ids.size===1&&P.militaryControl(m,a.target,political)==='UNCONTROLLED'&&group.ids.length-ids.size>=2&&moving<=group.manpower*.25&&!loss.lost_attacks.length&&!loss.defense_lost;
 let penalty=partial&&!emergency&&!supply&&!raid?64:0;
 penalty+=loss.lost_attacks.length?42:0;
 if(loss.defense_lost)penalty+=48;
 const stale=Object.entries(ctx.tasks).filter(([id,t])=>ids.has(id)&&t&&serial(m)-t.turn>=0&&serial(m)-t.turn<2&&m.field_armies[id]?.location_city_id===t.station&&c.cities[t.station]);
 const changesTask=stale.some(([,t])=>a.target!==t.objective);
 if(changesTask&&!emergency&&!supply)penalty+=42;
 const from=c.cities[a.origin]?.geography?.sea_zone_id,to=c.cities[a.target]?.geography?.sea_zone_id;
 const distant=a.route==='SEA_MOVE'&&from&&to&&from!==to;
 // A distant transfer needs a concrete new attack or an actual rescue, rather than
 // merely the largest threat ratio at an almost empty friendly outpost.
 if(distant&&!emergency&&!supply)penalty+=18;
 const improvesDefense=row.mission?.defense_secured||row.departure?.target_ratio<1.30&&row.mission?.before_threat>=1.30;
 if(a.strategic_reason==='CURRENT_FRONT_CONCENTRATION'&&!row.mission?.unlocked_attacks?.length&&!improvesDefense&&!emergency)penalty+=24;
 const role=raid||group?.role==='RAIDER'?'RAIDER':group?.role||'THEATER_ARMY';
 return {role,group_ids:group?.ids||[...ids],partial,raid,supply_exception:supply,emergency_exception:emergency,lost_attacks:loss.lost_attacks,defense_lost:loss.defense_lost,changes_task:changesTask,penalty};
}
function applyRows(m,c,f,rows,front=null){
 if(!front)front=require('./normal_operations_v1.js').context(m,c,f);
 const ctx=createContext(m,c,f,front);
 for(const row of rows){
  if(row.operational_command)continue;
  const a=row.action||{};
  if(a.type==='MOVE'){
   const value=assessMove(m,c,f,row,ctx);
   value.bonus=(a.ids||[]).length>1&&value.emergency_exception&&row.rescue_value?.safe?8:0;
   row.score+=value.bonus-value.penalty;row.operational_command=value;
   a.operational_role=value.role;
  }else if(a.type==='ATTACK'){
   const group=ctx.formation.find(g=>g.city===a.origin),ids=a.ids||[];
   const combined=ids.length>1&&group&&ids.length>=group.ids.filter(id=>m.commanders?.[m.field_armies[id]?.commander_id]?.role!=='総司令官').length;
   const bonus=combined?18:0;row.score+=bonus;
   row.operational_command={role:group?.role||'RAIDER',group_ids:group?.ids||ids,combined_attack:!!combined,bonus};a.operational_role=row.operational_command.role;
  }
 }
 require('./formation_mission_planner_v1.js').applyRows(m,c,f,rows);
 return rows;
}
function noteAction(m,f,a){
 if(!a||!['MOVE','ATTACK'].includes(a.type)||!a.ids?.length)return;
 m.ai_runtime=m.ai_runtime||{};m.ai_runtime.operations=m.ai_runtime.operations||{};
 const prior=m.ai_runtime.operations[f]?.assignments||{},assignments={};
 for(const [id,t] of Object.entries(prior))if(m.field_armies[id]?.faction===f&&m.field_armies[id].manpower>0&&serial(m)-t.turn<3)assignments[id]=t;
 for(const id of a.ids)assignments[id]={role:a.operational_role||'THEATER_ARMY',objective:a.target,station:a.target,origin:a.origin,turn:serial(m)};
 m.ai_runtime.operations[f]={...m.ai_runtime.operations[f],version:2,assignments};
}
function noteMissions(m,c,f,rows,action){require('./formation_mission_planner_v1.js').record(m,c,f,rows,action);}
module.exports={groups,createContext,assessMove,applyRows,noteAction,noteMissions};
};
modules['AI_OFFICIAL_CURRENT/normal_operations_v1.js']=function(require,module,exports){
'use strict';
const Trust=require('./trust_strategy_v1.js');
// Normal planning has no opening layout, named army, city order or lifetime assault quota.
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const B=require('../runtime/battle_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const Crisis=require('./breakthrough_crisis_v2.js');
const Logistics=require('./logistics_strategy_v1.js');
const N=require('./naval_api_v1.js');
const Mission=require('./front_mission_value_v1.js');
const Operations=require('./operational_command_v1.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const clone=x=>JSON.parse(JSON.stringify(x));
const enemyOf=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
const control=(m,id)=>P.militaryControl(m,id,political);
const chief=(m,a)=>m.commanders?.[a.commander_id]?.role==='総司令官';
const active=b=>b&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status);
const ready=(m,a)=>a.manpower>0&&!a.acted_this_month&&!active(m.battles?.[a.battle_id]);
const power=(m,a)=>B.armyIndividualPower(a,m.commanders?.[a.commander_id],phase.battle_engine,false).adjusted;
function reverseMovePenalty(m,f,id,origin,target){
 const now=m.calendar.year*12+m.calendar.month;
 const recent=(m.action_log||[]).filter(x=>x.faction===f&&x.type==='ARMY_MOVED'&&x.army_id===id).slice(-3).reverse();
 const age=x=>now-(Number(x.year)*12+Number(x.month));
 if(recent[0]&&age(recent[0])>=0&&age(recent[0])<=2&&recent[0].origin_city_id===target&&recent[0].destination_city_id===origin)return 30;
 return recent.some(x=>age(x)>=0&&age(x)<=3&&x.origin_city_id===target&&x.destination_city_id===origin)?13:0;
}
function cityValue(m,c,f,id){
 const city=c.cities[id];if(!city)return 0;
 const near=Crisis.landNeighbors(c,id),support=Number(city.politics?.independence_support)||50;
 const friendly=f==='PATRIOT'?support>=58:support<=42;
 const own=near.filter(x=>control(m,x)===f).length;
 const bridge=own>=2?6:0;
 return (Number(city.politics?.political_importance)||1)*4+(city.geography?.is_port?9:0)+(friendly?6:0)+Math.min(10,own*3)+bridge;
}
function context(m,c,f){
 const army=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.manpower>0);
 const threats=new Map(),missions=new Map();
 return {army,mission(id){if(!missions.has(id))missions.set(id,Mission.snapshot(m,c,f,id));return missions.get(id);},at:id=>army.filter(a=>a.location_city_id===id),threat(id){if(!threats.has(id))threats.set(id,Crisis.directThreat(m,c,f,id));return threats.get(id);}};
}
function departure(m,c,f,a,ctx=context(m,c,f)){
 const ids=new Set(a.ids||[]),origin=a.origin||m.field_armies?.[a.ids?.[0]]?.location_city_id;
 if(!origin)return {safe:false,penalty:0};
 const virtual={...m,field_armies:{...m.field_armies}};
 for(const id of ids)if(virtual.field_armies[id])virtual.field_armies[id]={...virtual.field_armies[id],location_city_id:a.target};
 if(a.route==='SEA_MOVE'){const rate=N.seaRouteProfile(c,c.cities[origin].geography.sea_zone_id,c.cities[a.target].geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate;for(const id of ids)virtual.field_armies[id].manpower=Math.floor(virtual.field_armies[id].manpower*rate);}
 const left=ctx.at(origin).filter(unit=>!ids.has(unit.id));
 const ownGuard=m.garrisons?.[origin]?.faction===f?Number(m.garrisons[origin].manpower)||0:0;
 const board={...c,cities:{...c.cities}};
 for(const id of [origin,a.target])if(board.cities[id])board.cities[id]={...board.cities[id],politics:{...board.cities[id].politics,military_control:control(virtual,id)}};
 const after=left.length||ownGuard>=100?Crisis.directThreat(virtual,board,f,origin):{ratio:0};
 // The chief's actual location, not a historical city, is the hard survival constraint.
 if(left.some(unit=>chief(m,unit))&&after.ratio>=Crisis.META.hqSevereEffectivePowerRatio)return{safe:false,penalty:0,origin_ratio:after.ratio};
 let penalty=Math.max(0,after.ratio-Math.max(1,ctx.threat(origin).ratio))*24;
 if(!left.length&&ownGuard<100){
  const supplying=Object.values(m.field_armies||{}).filter(unit=>unit.faction===f&&unit.supply_city_id===origin&&active(m.battles?.[unit.battle_id])&&!ids.has(unit.id)).reduce((n,unit)=>n+unit.manpower,0);
  penalty+=cityValue(m,c,f,origin)*.3+(supplying?Math.min(70,20+supplying/150):0);
 }
 if([...ids].some(id=>chief(m,m.field_armies[id]))){
  // For an attack the hostile defenders have not disappeared. Attack evaluation handles that risk.
  if(a.type==='MOVE'&&Crisis.directThreat(virtual,board,f,a.target).ratio>=Crisis.META.hqSevereEffectivePowerRatio)return{safe:false,penalty:0};
 }
 // Price the engine's real abandonment consequences alongside the military objective.
 const trust=Trust.departure(m,virtual,c,board,f,origin);
 const transition=trust.transition;
 if(!trust.policy.allowed)return {safe:false,penalty:trust.policy.penalty,control_transition:transition,trust_policy:trust.policy};
 penalty+=trust.policy.penalty;
 const targetRatio=a.type==='MOVE'?Crisis.directThreat(virtual,board,f,a.target).ratio:0;
 if(a.type==='MOVE'&&targetRatio>=1.30&&targetRatio>=ctx.threat(origin).ratio)return{safe:false,penalty:0,target_ratio:targetRatio};
 return {safe:true,penalty,origin_ratio:after.ratio,target_ratio:targetRatio,control_transition:transition,trust_policy:trust.policy};
}
function fieldCandidates(m,c,f,ctx=context(m,c,f)){
 const rows=[],state={...m,current_faction:f};
 for(const army of ctx.army.filter(a=>ready(m,a))){
  const city=c.cities[army.location_city_id];if(!city||control(m,city.city_id)!==f)continue;
  for(const kind of ['REGULAR_RECRUITMENT','TRAINING','EQUIPMENT_PURCHASE'])try{
   const p=E.previewFieldArmyAction(state,army.id,kind,phase,city),out=E.improveFieldArmy(state,army.id,kind,phase,city);
   if(Number(city.stockpile.MATERIALS)<Number(p.materials_cost||0))continue;
   const after=out.state.field_armies[army.id],gain=power(m,after)-power(m,army);if(gain<=0)continue;
   const supply=Logistics.balanceFor(m,c,city.city_id,Math.max(0,after.manpower-army.manpower));
   if(!supply||supply.months<1)continue;
   const threat=ctx.threat(city.city_id),front=Crisis.landNeighbors(c,city.city_id).some(id=>control(m,id)===enemyOf(f));
   // Use engine power gain and actual local threat. No troop ceiling or regional premium.
   const mission=Mission.compare(m,out.state,c,f,city.city_id,ctx.mission(city.city_id));
   const score=mission.bonus+45+(front?14:0)+Math.min(37,gain/70)-p.treasury_cost/65-p.materials_cost/500+Math.min(18,threat.ratio*12);
   const type=f==='PATRIOT'?'IMPROVE':kind==='TRAINING'?'TRAINING':'RECRUIT';
   rows.push({operation:'FIELD_FORCE_VALUE',score,field_value:{power_gain:gain,supply_months:supply.months,mission},action:{type,kind,army_id:army.id,city:city.city_id,strategic_reason:'STRENGTHEN_EXISTING_FRONT',operational_reason:kind}});
  }catch{}
 }
 return rows;
}
// Operational landing policy: pay the casualty cost BEFORE ranking a tactical victory.
// Ordinary LANDING_ATTACK remains legal for the human player.  These are AI-only limits.
function landingAssessment(m,c,f,ids,origin,target){
 const from=c.cities?.[origin],to=c.cities?.[target];
 if(!from||!to||!from.geography?.sea_zone_id||!to.geography?.sea_zone_id)return{allowed:false,reason:'LANDING_ROUTE_UNKNOWN'};
 const period=`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
 // Crossing a recognized land/strait link never justifies a lossy sea landing.
 if(C.getCommandCandidates(c,{command_type:'ATTACK',origin_city_id:origin,faction:f}).includes(target))return{allowed:false,reason:'LANDING_DUPLICATES_LAND_ATTACK'};
 const profile=N.seaRouteProfile(c,from.geography.sea_zone_id,to.geography.sea_zone_id,f,'LANDING',period);
 const rate=Number(profile.arrival_rate);
 if(!Number.isFinite(rate)||rate<=0)return{allowed:false,reason:'LANDING_NO_ARRIVAL'};
 const departed=ids.reduce((sum,id)=>sum+Math.max(0,Number(m.field_armies?.[id]?.manpower)||0),0);
 const arrived=ids.reduce((sum,id)=>sum+Math.max(0,Math.floor((Number(m.field_armies?.[id]?.manpower)||0)*rate)),0);
 const lost=departed-arrived;
 const foe=enemyOf(f),near=Crisis.landNeighbors(c,target);
 const counter=Object.values(m.field_armies||{}).filter(a=>a.faction===foe&&!a.battle_id&&a.manpower>0&&near.includes(a.location_city_id)).reduce((sum,a)=>sum+Number(a.manpower||0),0);
 const targetDefenders=Object.values(m.field_armies||{}).filter(a=>a.faction===foe&&a.manpower>0&&a.location_city_id===target).reduce((sum,a)=>sum+Number(a.manpower||0),0)+(m.garrisons?.[target]?.faction===foe?Number(m.garrisons[target].manpower)||0:0);
 const landEscape=near.some(id=>control(m,id)===f&&(Object.values(m.field_armies||{}).some(a=>a.faction===f&&a.manpower>0&&a.location_city_id===id)||(m.garrisons?.[id]?.faction===f&&m.garrisons[id].manpower>=100)));
 const seaEscape=Boolean(N.isPortOperational(to)&&rate>=.90&&Object.values(c.cities||{}).some(x=>x.city_id!==target&&x.geography?.sea_zone_id===to.geography.sea_zone_id&&control(m,x.city_id)===f&&N.isPortOperational(x)));
 const hasEscape=landEscape||seaEscape;
 const counterRatio=counter/Math.max(1,arrived);
 const costly=(rate>=.90?lost>1800:lost>950);
 if(ids.some(id=>chief(m,m.field_armies[id]))&&rate<.90)return{allowed:false,reason:'LANDING_CHIEF_TRANSIT_RISK',rate,lost,arrived};
 // Without sea control, only a genuinely tiny, almost undefended, secure bridgehead
 // could justify the gamble. Never sacrifice thousands to seize a minor garrison.
 if(rate<.70){
  const importance=Number(to.politics?.political_importance)||1;
  const minorSurgical=importance>=4&&lost<=250&&arrived>=100&&targetDefenders<=60&&counter===0&&hasEscape;
  if(!minorSurgical)return{allowed:false,reason:'LANDING_UNCONTROLLED_SEA_HIGH_ATTRITION',rate,lost,arrived,counter,hasEscape};
 }
 if(costly)return{allowed:false,reason:'LANDING_EXCESSIVE_EXPECTED_LOSS',rate,lost,arrived};
 // After occupation the beachhead cannot be held against an immediately adjacent army.
 // A strait landing without a usable retreat route requires extra local superiority.
 if(counter>=300&&(counterRatio>(hasEscape?1.05:.72)))return{allowed:false,reason:'LANDING_COUNTERATTACK_TRAP',rate,lost,arrived,counter,hasEscape};
 if(!hasEscape&&rate<.90&&counter>Math.max(100,arrived*.25))return{allowed:false,reason:'LANDING_ISOLATED_BEACHHEAD',rate,lost,arrived,counter};
 const penalty=lost/65+Math.max(0,1-rate)*22+(hasEscape?0:counterRatio*18);
 return{allowed:true,reason:'LANDING_OPERATIONALLY_ACCEPTABLE',rate,lost,arrived,counter,hasEscape,targetDefenders,penalty,worst_stage:profile.worst_stage.key};
}
function attackCandidate(m,c,f,ids,origin,target,route,ctx){
 const landing=route==='LANDING_ATTACK'?landingAssessment(m,c,f,ids,origin,target):null;
 if(landing&&!landing.allowed)return null;
 if(ids.some(id=>!ready(m,m.field_armies[id])||B.isRetreatRecoveryAttackLocked?.(m,id)))return null;
 let state=require('./combat_projection_v1.js').copy(m),arrival=1;
 if(route==='LANDING_ATTACK'){
  arrival=N.seaRouteProfile(c,c.cities[origin].geography.sea_zone_id,c.cities[target].geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate;
  for(const id of ids)state.field_armies[id].manpower=Math.floor(state.field_armies[id].manpower*arrival);
 }
 const leader=B.selectBattlefieldLeader(state,ids);
 let pre;try{pre=B.prepareBattle(state,{origin_city_id:origin,city_id:target,attacker_army_ids:ids,leader_army_id:leader,route_type:route==='LANDING_ATTACK'?route:'LAND_ATTACK'},c,phase);}catch{return null;}
 const cfg=phase.battle_engine,tactic='normal_attack',raw=B.basePower(pre.attacker,cfg,false)/Math.max(1,B.basePower(pre.defender,cfg,true));
 const defense=cfg.tactics[pre.battle.tactic[enemyOf(f)]]||cfg.tactics.hold_line;
 const expected=raw*cfg.tactics[tactic].power/defense.power;
 const worst=raw*cfg.tactics[tactic].power*cfg.tactics[tactic].random_min/Math.max(...Object.values(cfg.tactics).map(t=>t.power*t.random_max));
 const containsChief=ids.some(id=>chief(m,m.field_armies[id]));
 if(expected<1.05||worst<(containsChief?1.12:.80))return null;
 const action={type:'ATTACK',ids,leader,origin,target,route:route==='LANDING_ATTACK'?route:'ATTACK',tactic,strategic_reason:'CURRENT_FRONT_OPPORTUNITY',operational_reason:'EFFECTIVE_POWER_ATTACK'};
 const leave=departure(m,c,f,action,ctx);if(!leave.safe)return null;
 const score=67+cityValue(m,c,f,target)*.35+Math.min(32,(expected-1)*20)+(worst>=cfg.result_thresholds.victory?14:0)-leave.penalty-(landing?.penalty||0);
 return {operation:'EFFECTIVE_POWER_ATTACK',score,combat_value:{expected,worst,arrival,departure:leave,landing_assessment:landing},action};
}
function movementCandidates(m,c,f,ctx){
 const rows=[],enemy=enemyOf(f),owned=id=>control(m,id)===f;
 const objectives=Object.keys(c.cities).filter(id=>!owned(id));
 function distanceToObjective(start){
  const queue=[[start,0]],seen=new Set([start]);
  while(queue.length){const [id,d]=queue.shift();if(id!==start&&objectives.includes(id))return d;for(const next of Crisis.landNeighbors(c,id)){if(seen.has(next))continue;seen.add(next);queue.push([next,d+1]);}}
  return 99;
 }
 const distances=new Map(),distance=id=>{if(!distances.has(id))distances.set(id,distanceToObjective(id));return distances.get(id);};
 for(const origin of new Set(ctx.army.filter(a=>ready(m,a)).map(a=>a.location_city_id))){
  const force=ctx.at(origin).filter(a=>ready(m,a)),nonChief=force.filter(a=>!chief(m,a));
  const selections=[...nonChief.map(a=>[a.id]),...(nonChief.length>1?[nonChief.map(a=>a.id)]:[]),...(force.length>1?[force.map(a=>a.id)]:[])];
  const groups=[...new Map(selections.map(ids=>[ids.join('|'),ids])).values()];
  for(const ids of groups){
  for(const route of ['MOVE','SEA_MOVE']){
   let targets=[];try{targets=C.getCommandCandidates(c,{command_type:route,origin_city_id:origin,faction:f});}catch{}
   for(const target of targets){
    const ctl=control(m,target);if(ctl===enemy||ctl==='CONFLICT')continue;
    const reverse=Math.max(...ids.map(id=>reverseMovePenalty(m,f,id,origin,target)));
    const expansion=ctl==='UNCONTROLLED',threat=owned(target)?ctx.threat(target).ratio:0;
    const virtual={...m,field_armies:{...m.field_armies}};
    for(const id of ids)virtual.field_armies[id]={...m.field_armies[id],location_city_id:target};
    if(route==='SEA_MOVE'){const rate=N.seaRouteProfile(c,c.cities[origin].geography.sea_zone_id,c.cities[target].geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate;for(const id of ids)virtual.field_armies[id].manpower=Math.floor(m.field_armies[id].manpower*rate);}
    const mission=owned(target)&&ctx.at(target).length?Mission.compare(m,virtual,c,f,target,ctx.mission(target)):{bonus:0,unlocked_attacks:[]};
    const concentration=threat>1&&threat>ctx.threat(origin).ratio+.1||mission.bonus>0;
    const retreat=ctx.threat(origin).ratio>=1.30;
    const redeploy=!expansion&&!concentration&&distance(target)<distance(origin);
    if(!expansion&&!concentration&&!redeploy&&!retreat)continue;
    const action={type:'MOVE',ids,origin,target,route,strategic_reason:retreat?'PRESERVE_THREATENED_FIELD_FORCE':expansion?'CURRENT_FRONT_EXPANSION':concentration?'CURRENT_FRONT_CONCENTRATION':'CURRENT_FRONT_REDEPLOYMENT',operational_reason:'CURRENT_FRONT_MOVE'};
    const leave=departure(m,c,f,action,ctx);if(!leave.safe)continue;
    let score=mission.bonus+(retreat?116:expansion?47+cityValue(m,c,f,target)*.55:concentration?68+Math.min(30,(threat-1)*24):54)-reverse-leave.penalty;
    if(route==='SEA_MOVE'){
     const arrival=N.seaRouteProfile(c,c.cities[origin].geography.sea_zone_id,c.cities[target].geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate;
     if(arrival<.70)continue; // catastrophic loss is never an ordinary redeployment
     const embarked=ids.reduce((sum,id)=>sum+Number(m.field_armies[id]?.manpower||0),0);
     score-=Math.max(0,1-arrival)*60+Math.floor(embarked*(1-arrival))/65;
    }
    rows.push({operation:retreat?'CURRENT_FRONT_RETREAT':'CURRENT_FRONT_MOVE',score,reverse_move_penalty:reverse,departure:leave,mission,action});
   }
  }
  }
 }
 return rows;
}
function strategicCandidates(m,c,f,ctx=context(m,c,f)){
 const chiefArmy=Crisis.chiefArmy(m,f),hq=chiefArmy?ctx.threat(chiefArmy.location_city_id).ratio:0;
 const votes=P.voteTally(c,political)[f],fronts=ctx.army.filter(a=>Crisis.landNeighbors(c,a.location_city_id).some(id=>control(m,id)===enemyOf(f))).length;
 return [{id:'PRESERVE_COMMANDER_IN_CHIEF',score:hq>1?100:70,reason:'現在の総司令官の位置と実効戦力で安全を判断'},
 {id:'CURRENT_FRONT_OPERATIONS',score:fronts?85:60,reason:'現在の配置と到達可能な目標から作戦を比較'},
 {id:'POLITICAL_POWER_CONVERSION',score:votes<2?88:66,reason:'州票を陣営固有の提案・補給・援軍へ変換'},
 {id:'SUSTAIN_FIELD_FORCE',score:ctx.army.some(a=>(Logistics.balanceFor(m,c,a.location_city_id)?.months??99)<1.5)?95:65,reason:'実際の消費と生産に応じて維持・育成'}].sort((a,b)=>b.score-a.score);
}
function operationalCandidates(m,c,f){
 const ctx=context(m,c,f),rows=[...movementCandidates(m,c,f,ctx),...fieldCandidates(m,c,f,ctx)];
 for(const origin of new Set(ctx.army.filter(a=>ready(m,a)).map(a=>a.location_city_id))){
  const force=ctx.at(origin).filter(a=>ready(m,a)),nonChief=force.filter(a=>!chief(m,a));
  const groups=[...force.map(a=>[a.id]),...(nonChief.length>1?[nonChief.map(a=>a.id)]:[]),...(force.length>1?[force.map(a=>a.id)]:[])];
  for(const route of ['ATTACK','LANDING_ATTACK']){
   let targets=[];try{targets=C.getCommandCandidates(c,{command_type:route,origin_city_id:origin,faction:f});}catch{}
   for(const target of targets.filter(id=>control(m,id)===enemyOf(f)))for(const ids of groups){const row=attackCandidate(m,c,f,ids,origin,target,route,ctx);if(row)rows.push(row);}
  }
 }
 Operations.applyRows(m,c,f,rows,ctx);
 rows.sort((a,b)=>b.score-a.score);
 return {profile:strategicCandidates(m,c,f,ctx),candidates:rows,choice:rows[0]||null};
}
function continuation(m,f){const month=`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;const b=Object.values(m.battles||{}).find(b=>b.attacker_faction===f&&b.status==='active'&&b.last_resolution?.month!==month);return b?{type:'CONTINUE',battle_id:b.id,target:b.city_id,free_decision:true}:null;}
function availableDefendersAt(m,id,f){return Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0&&!a.battle_id).reduce((n,a)=>n+a.manpower,0)+(m.garrisons?.[id]?.faction===f?Number(m.garrisons[id].manpower)||0:0);}
module.exports={context,availableDefendersAt,operationalCandidates,strategicCandidates,fieldCandidates,cityValue,departure,reverseMovePenalty,continuation};
};
modules['AI_OFFICIAL_CURRENT/patriot_strategic_ai_v6_base.js']=function(require,module,exports){
const Normal=require('./normal_operations_v1.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const politicalConfig=require('../source_data/political_phase_config_v0_1.json');
const native=require('../runtime/patriot_sparring_ai_v1_15.js');
const PATRIOT='PATRIOT',BRITISH='BRITISH';
const date=m=>`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
function operationalCandidates(m,c){return Normal.operationalCandidates(m,c,PATRIOT);}
function strategicCandidates(m,c){return Normal.strategicCandidates(m,c,PATRIOT);}
function action(m,c){if((m.factions?.PATRIOT?.commands_remaining||0)<1)return null;return Normal.continuation(m,PATRIOT)||operationalCandidates(m,c).choice?.action||null;}
function strategicMode(m,c){return strategicCandidates(m,c)[0]?.id||'PATRIOT_GENERAL';}
function execute(m,c,a,engine){
 if(a.type==='NAVAL'){
   const cities=JSON.parse(JSON.stringify(c));for(const city of Object.values(cities.cities))city.politics.military_control=P.militaryControl(m,city.city_id,politicalConfig);
   const activated=engine.naval.activateOperation(cities,a.zone,PATRIOT,a.operation,date(m),{target_city_id:a.target_city_id||a.target});
   let next=engine.army.spendCommand(m,PATRIOT,'NAVAL_OPERATION',1);
   if(['COASTAL_GUARD','SHIPPING_DISRUPTION'].includes(a.operation)){
     const targetFaction=a.operation==='COASTAL_GUARD'?PATRIOT:BRITISH,coopDelta=a.operation==='COASTAL_GUARD'?1:-1;
     for(const city of Object.values(activated.state.cities))if(city.geography?.sea_zone_id===a.zone&&city.geography?.naval_class!=='INLAND'&&city.politics?.military_control===targetFaction){
       city.politics.public_cooperation=Math.max(0,Math.min(100,Number(city.politics.public_cooperation||0)+coopDelta));
       city.politics.independence_support=Math.max(0,Math.min(100,Number(city.politics.independence_support||0)+1));
     }
   }
   if(a.operation==='PRIVATEERING'){
     const ports=(engine.naval.portNetwork(activated.state,a.zone).PATRIOT||[]).map(id=>activated.state.cities[id]).filter(Boolean);
     const distribute=(resource,amount)=>{let remaining=amount;const ranked=ports.map(city=>({city,free:Math.max(0,Number(city.capacity?.[resource]||0)-Number(city.stockpile?.[resource]||0))})).filter(x=>x.free>0).sort((x,y)=>y.free-x.free||String(x.city.city_id).localeCompare(String(y.city.city_id)));for(const entry of ranked){if(remaining<=0)break;const stored=Math.min(entry.free,remaining);entry.city.stockpile[resource]+=stored;remaining-=stored;const log=next.city_logistics?.[entry.city.city_id];if(log){if(resource==='FOOD')log.food_stock=entry.city.stockpile.FOOD;else log.material_stock=entry.city.stockpile.MATERIALS;}}};
     distribute('FOOD',120);distribute('MATERIALS',80);
     if(next.political_phase?.national_budget_value)next.political_phase.national_budget_value.BRITISH=Math.max(0,Number(next.political_phase.national_budget_value.BRITISH||0)-2);
   }
   if(engine.army.syncBattleSeaSupplyBlockades)next=engine.army.syncBattleSeaSupplyBlockades(next,activated.state).state;
   engine.army.appendAction(next,{type:'NAVAL_OPERATION',operation_type:a.operation,zone_id:a.zone,faction:PATRIOT,target_city_id:a.target_city_id||a.target||null});
   return{military:next,cities:activated.state};
 }
 return native.execute(m,c,a,engine);
}
module.exports={action,execute,strategicMode,strategicCandidates,operationalCandidates,cityValue:(m,c,id)=>Normal.cityValue(m,c,PATRIOT,id)};
};
modules['AI_OFFICIAL_CURRENT/patriot_strategic_ai_v8_official.js']=function(require,module,exports){
// Compatibility module: normal operations use the current board, without historical campaign ordering.
module.exports=require('./patriot_strategic_ai_v6_base.js');
};
modules['AI_OFFICIAL_CURRENT/movement_discipline_v1.js']=function(require,module,exports){
'use strict';
// Same-month exchange suppression is shared; real role and force differences remain allowed.
function swapArmyValue(m,army){if(!army)return 0;const cmd=m.commanders?.[army.commander_id],stats=cmd?.stats||{},quality=.45+(Number(army.morale)||0)/200+(Number(army.training)||0)/250+(Number(army.equipment)||0)/250,command=.9+((Number(stats.leadership)||0)+(Number(stats.tactics)||0)+(Number(stats.logistics)||0))/600;return Math.max(1,Number(army.manpower)||0)*quality*command;}
function crossSwapPenalty(m,faction,row){const a=row.action||{};if(a.type!=='MOVE'||(a.ids||[]).length!==1)return 0;const id=a.ids[0],army=m.field_armies?.[id],origin=a.origin||army?.location_city_id,target=a.target;if(!army||!origin||!target)return 0;const prior=(m.action_log||[]).slice().reverse().find(x=>x.faction===faction&&x.type==='ARMY_MOVED'&&Number(x.year)===Number(m.calendar.year)&&Number(x.month)===Number(m.calendar.month)&&x.army_id!==id&&x.origin_city_id===target&&x.destination_city_id===origin);if(!prior)return 0;const other=m.field_armies?.[prior.army_id];if(!other)return 0;const roleA=m.commanders?.[army.commander_id]?.role||'',roleB=m.commanders?.[other.commander_id]?.role||'';if(roleA!==roleB&&(roleA==='総司令官'||roleB==='総司令官'||roleA==='方面軍司令官'||roleB==='方面軍司令官'))return 0;const va=swapArmyValue(m,army),vb=swapArmyValue(m,other),ratio=va/vb;if(ratio>=.82&&ratio<=1.22)return 34;if(ratio>=.70&&ratio<=1.43)return 12;return 0;}
module.exports={crossSwapPenalty};
};
modules['AI_OFFICIAL_CURRENT/garrison_strategy_v1.js']=function(require,module,exports){
'use strict';
// Shared policy for both official AIs. A target is total garrison strength, not each order's increment.
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const Crisis=require('./breakthrough_crisis_v2.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const cityConfig=require('../source_data/city_command_config_v0_17.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const active=b=>b&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status);
const control=(m,id)=>P.militaryControl(m,id,political);
const step=n=>Math.floor(Math.max(0,n)/100)*100;
function context(m,c,f){
 const consumption=E.logisticsConsumptionTroopsByCity(m,phase).totals||{},threats=new Map();
 return {consumption,threat(id){if(!threats.has(id))threats.set(id,Crisis.directThreat(m,c,f,id));return threats.get(id);}};
}
function planFormation(m,c,f,id,ctx=context(m,c,f)){
 const city=c.cities?.[id],g=m.garrisons?.[id],account=m.factions?.[f];
 if(!city||!g||!account||control(m,id)!==f||(g.faction&&g.faction!==f))return null;
 if(Object.values(m.battles||{}).some(b=>b.city_id===id&&active(b)))return null;
 // Preservation spending must not compete with escaping an overwhelming attack.
 const threat=ctx.threat(id);if(threat.ratio>=1.30)return null;
 const current=Number(g.manpower)||0,remaining=step(Number(g.cap)-current);
 if(remaining<100||Number(account.commands_remaining)<1)return null;
 const near=Crisis.landNeighbors(c,id),friendly=near.filter(n=>control(m,n)===f);
 const enemy=f==='PATRIOT'?'BRITISH':'PATRIOT';
 const border=near.some(n=>control(m,n)===enemy);
 const remote=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.manpower>0&&a.supply_city_id===id&&a.location_city_id!==id&&active(m.battles?.[a.battle_id])&&!a.control_anchor_lost).reduce((n,a)=>n+Number(a.manpower),0);
 const importance=Number(city.politics?.political_importance)||1;
 const exports=(c.order_log||[]).filter(a=>['TRANSPORT_LAND','SEA_TRANSPORT'].includes(a.command_type)&&a.status==='EXECUTED'&&a.origin_city_id===id&&
  Number(a.month)>=Number(c.elapsed_months||0)-5&&Number(a.month)<=Number(c.elapsed_months||0)&&control(m,a.destination_city_id)===f);
 const shipped=exports.reduce((n,a)=>n+(Number(a.transport_result?.arrived?.FOOD)||0)+(Number(a.transport_result?.arrived?.MATERIALS)||0),0);
 const frontNearby=near.some(n=>control(m,n)===enemy||Crisis.landNeighbors(c,n).some(x=>control(m,x)===enemy));
 // A used battle supply source is a stronger reason than a port icon or road degree alone.
 let target=200,role='HOLD_CITY';
 if(remote>=4000){target=2000;role='BATTLE_SUPPLY_HUB';}
 else if(exports.length>=2&&shipped>=2000&&friendly.length>=2&&importance>=4&&frontNearby){target=2000;role='ACTIVE_TRANSPORT_HUB';}
 else if(remote>=1000||(border&&friendly.length>=2&&(importance>=4||city.geography?.is_port))){target=1000;role='DEFENSIVE_ROUTE_NODE';}
 target=Math.min(target,step(Number(g.cap)));
 const cash=Number(account.treasury)||0,manpower=Number(account.mobilizable_manpower)||0;
 const material=Math.min(Number(m.city_logistics?.[id]?.material_stock)||0,Number(city.stockpile?.MATERIALS)||0);
 const tight=cash<250||manpower<1000||material<300;
 if(tight){target=Math.min(target,100);role='MINIMUM_HOLD_RESOURCE_PRESSURE';}
 const desired=step(Math.max(0,target-current));if(desired<100)return null;
 // Always account for formation cost and local production before assessing three months' upkeep.
 for(let troops=Math.min(desired,remaining);troops>=100;troops-=100){
  let estimate;try{estimate=E.calculateGarrisonFormation(m,id,troops,phase);}catch{return null;}
  if(estimate.treasury_cost>cash||estimate.materials_cost>material||troops>manpower)continue;
  const large=current+troops>200;
  if(large&&(cash-estimate.treasury_cost<500||manpower-troops<1000))continue;
  const local={...city,garrison:{...city.garrison,troops:current+troops},stationed_field_army_consumption_troops:ctx.consumption[id]||0};
  const food=C.monthlyBalance(local,'FOOD',cityConfig),materials=C.monthlyBalance(local,'MATERIALS',cityConfig);
  const foodLeft=Number(city.stockpile?.FOOD)||0,materialLeft=material-estimate.materials_cost;
  if(foodLeft<Math.max(0,-food.net)*3||materialLeft<Math.max(0,-materials.net)*3)continue;
  if(large&&materialLeft<200)continue;
  // Avoid spending the final stock on 200 when 100 can retain control and a useful reserve.
  if(current+troops===200&&current<100&&materialLeft<100&&troops>100)continue;
  return {troops,target_total:target,resulting_total:current+troops,role,
   resource_constrained:tight||troops<desired,remote_supply_manpower:remote, recent_supply_exports:exports.length,
   treasury_cost:estimate.treasury_cost,materials_cost:estimate.materials_cost,
   monthly_net:{FOOD:food.net,MATERIALS:materials.net}};
 }
 return null;
}
function applyPolicy(m,c,f,rows,{crisis=false}={}){
 const ctx=context(m,c,f),plans=new Map(),get=id=>{if(!plans.has(id))plans.set(id,crisis?null:planFormation(m,c,f,id,ctx));return plans.get(id);};
 const out=[],existing=new Set();
 for(const row of rows){
  if(row.action?.type!=='GARRISON'){out.push(row);continue;}
  // Emergency defense of the commander is part of the crisis doctrine, not passive city retention.
  if(row.operation==='BREAKTHROUGH_EMERGENCY_GARRISON'){out.push(row);continue;}
  const id=row.action.city,plan=get(id);if(!plan)continue;
  existing.add(id);out.push({...row,action:{...row.action,troops:plan.troops,garrison_plan:plan}});
 }
 if(crisis)return out;
 const commands=Number(m.factions?.[f]?.commands_remaining)||0;
 const monthForms=(m.action_log||[]).filter(a=>a.type==='GARRISON_FORMED'&&a.faction===f&&Number(a.year)===Number(m.calendar?.year)&&Number(a.month)===Number(m.calendar?.month)).length;
 for(const [id,city] of Object.entries(c.cities||{})){
  if(existing.has(id)||monthForms>=1)continue;
  const plan=get(id);if(!plan)continue;
  const current=Number(m.garrisons[id].manpower)||0,importance=Number(city.politics?.political_importance)||1;
  let score=plan.resulting_total>200?66+importance*2:current>=100?44+importance:58+importance*3;
  // Reserve one command for the planned departure. Never make this a requirement on the move itself.
  const departures=out.filter(row=>row.action?.type==='MOVE'&&row.score>0&&
   (row.action.origin||m.field_armies?.[row.action.ids?.[0]]?.location_city_id)===id&&
   P.militaryControl({...m,field_armies:Object.fromEntries(Object.entries(m.field_armies||{}).filter(([armyId])=>!row.action.ids?.includes(armyId)))},id,political)!==f);
  if(current<100&&commands>=2&&departures.length)score=Math.max(score,...departures.map(row=>row.score+1));
  if(commands<=1)score-=15;
  out.push({operation:'ADAPTIVE_GARRISON',score,action:{type:'GARRISON',city:id,troops:plan.troops,garrison_plan:plan,strategic_reason:plan.role,operational_reason:'ADAPTIVE_GARRISON'}});
 }
 return out;
}
module.exports={planFormation,applyPolicy};
};
modules['AI_OFFICIAL_CURRENT/reserve_formation_strategy_v1.js']=function(require,module,exports){
'use strict';
// Shared purpose and engine-value comparison, without opening-region or total-army quotas.
// Costs, qualities, combat power, route legality and upkeep come from the engines.
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const B=require('../runtime/battle_engine_v0_74_retreat.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const Crisis=require('./breakthrough_crisis_v2.js');
const Logistics=require('./logistics_strategy_v1.js');
const Mission=require('./front_mission_value_v1.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function landNeighbors(c,id){return [...new Set((c.topology?.edges||[]).filter(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&(e.a===id||e.b===id)).map(e=>e.a===id?e.b:e.a))];}
function power(army,commander){return B.armyIndividualPower(army,commander,phase.battle_engine,false).adjusted;}
function candidates(m,c,faction,existing=[]){
 const reserves=m.political_phase?.commander_reserves?.[faction]||[];
 if(!reserves.length)return [];
 const own=Object.values(m.field_armies||{}).filter(a=>a.faction===faction&&a.manpower>0);
 const enemy=faction==='PATRIOT'?'BRITISH':'PATRIOT',rows=[];
 const state={...m,current_faction:faction};
 for(const city of Object.values(c.cities||{})){
  const id=city.city_id;if(P.militaryControl(m,id,political)!==faction)continue;
  const local=own.filter(a=>a.location_city_id===id);
  const adjacent=landNeighbors(c,id),near=own.filter(a=>adjacent.includes(a.location_city_id));
  // An independent field command needs an uncovered, reachable objective, not just spare cash.
  let moves=[];try{moves=C.getCommandCandidates(c,{command_type:'MOVE',origin_city_id:id,faction});}catch{}
  const objective=adjacent.find(target=>{
   const control=P.militaryControl(m,target,political),targetCity=c.cities[target];
   if(!targetCity||control===faction)return false;
   if(control===enemy)return true;
   const support=Number(targetCity.politics?.independence_support)||50;
   return moves.includes(target)&&Number(targetCity.politics?.political_importance)>=3&&(faction==='PATRIOT'?support>=58:support<=42);
  });
  const independent=local.length===0&&near.length===0&&objective;
  const replacing=local.some(a=>m.commanders?.[a.commander_id]?.role==='総司令官')&&local.length===1||Boolean(objective)&&local.length===1&&Crisis.directThreat(m,c,faction,id).ratio>=.9;
  if(!independent&&!replacing)continue;
  let best=null;
  for(const commander of reserves){try{
   const preview=E.previewFieldArmyFormation(state,id,commander.id,phase);
   const value=power({...preview,manpower:preview.manpower},preview.commander);
   if(!best||value>best.value)best={preview,value};
  }catch{}}
  if(!best)continue;
  const p=best.preview,balance=Logistics.balanceFor(m,c,id,p.manpower);
  if(!balance||balance.months<3)continue;
  const projected=E.formFieldArmyFromReserve(state,id,p.commander_id,phase).state;
  if((Crisis.directThreat(projected,c,faction,id)?.ratio||0)>=1.30||(Crisis.nextTurnThreat(projected,c,faction,id)?.ratio||0)>=1.30)continue;
  // Compare real incremental combat power against recruiting a local existing army.
  let recruit=null;
  for(const army of local){if(army.acted_this_month||army.battle_id)continue;try{
   const preview=E.previewFieldArmyAction(state,army.id,'REGULAR_RECRUITMENT',phase,city);
   const result=E.improveFieldArmy(state,army.id,'REGULAR_RECRUITMENT',phase,city);
   const gain=power(result.state.field_armies[army.id],m.commanders[army.commander_id])-power(army,m.commanders[army.commander_id]);
   const efficiency=gain/Math.max(1,preview.command_cost||1)/Math.max(1,preview.treasury_cost||1);
   if(!recruit||efficiency>recruit.efficiency)recruit={army_id:army.id,gain,cost:preview.treasury_cost,efficiency};
  }catch{}}
  const efficiency=best.value/Math.max(1,p.command_cost)/Math.max(1,p.treasury_cost);
  const localRecruitRows=existing.filter(row=>row.action?.army_id===recruit?.army_id&&['RECRUIT','IMPROVE'].includes(row.action?.type)&&row.action?.kind==='REGULAR_RECRUITMENT');
  const recruitScore=Math.max(0,...localRecruitRows.map(row=>row.score));
  const mission=Mission.compare(m,projected,c,faction,id);
  const front=Boolean(objective);
  let score=replacing?45+(front?14:0)+Math.min(37,best.value/70)-p.treasury_cost/65-(p.materials_cost||0)/500+mission.bonus:80;
  if(recruit){const advantage=recruit.efficiency>0?efficiency/recruit.efficiency:Infinity;
   // Keep the shared mission score; efficiency is evidence, never an age-based priority.
   if(!replacing)score+=Math.max(-12,Math.min(12,(advantage-1)*12));
  }
  if(existing.some(row=>row.action?.type==='FORM'&&row.action.city===id&&row.action.commander_id===p.commander_id))continue;
  rows.push({operation:'PURPOSEFUL_RESERVE_FORMATION',score,formation_value:{mission,purpose:replacing?'REINFORCE_ACTIVE_FRONT':'UNCOVERED_FRONT',objective:objective||null,power:best.value,treasury_cost:p.treasury_cost,command_cost:p.command_cost,supply_months:balance.months,recruit_comparison:recruit,efficiency},action:{type:'FORM',city:id,commander_id:p.commander_id,strategic_reason:replacing?'REINFORCE_ACTIVE_FRONT':'UNCOVERED_FRONT',operational_reason:'PURPOSEFUL_RESERVE_FORMATION'}});
 }
 return rows.sort((a,b)=>b.score-a.score);
}
module.exports={candidates};
};
modules['AI_OFFICIAL_CURRENT/patriot_strategic_ai_v10_official.js']=function(require,module,exports){
const TrustPolicy=require('./trust_strategy_v1.js');
// BEFORE THE STARS — Patriot AI V10 OFFICIAL (2026-09-24)
// V8 normal three-layer planner + V1.28 BREAKTHROUGH_CRISIS lifecycle/effective-power guard.
const base=require('./patriot_strategic_ai_v8_official.js');
const Crisis=require('./breakthrough_crisis_v2.js');
const C=require('../runtime/city_command_engine_v0_18.js');
const E=require('../runtime/army_phase2_engine_v0_74_retreat.js');
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const N=require('../runtime/canonical_naval_runtime_v0_67.js');
const phase=require('../source_data/phase2_config_v0_9_funds.json');
const cityConfig=require('../source_data/city_command_config_v0_17.json');
const political=require('../source_data/political_phase_config_v0_1.json');
const Logistics=require('./logistics_strategy_v1.js');
function crossSwapPenalty(m,row){return require('./movement_discipline_v1.js').crossSwapPenalty(m,'PATRIOT',row);}
function applyCrossSwapGuard(m,rows){for(const row of rows){const penalty=crossSwapPenalty(m,row);if(penalty){row.score-=penalty;row.cross_swap_penalty=penalty;}}return rows;}
const Civil=require('./civil_operations_v1.js');
const Garrison=require('./garrison_strategy_v1.js');
const ReserveFormation=require('./reserve_formation_strategy_v1.js');
const Operations=require('./operational_command_v1.js');
const period=m=>`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`;
function patriotEquipmentCandidates(m,c){return require('./normal_operations_v1.js').fieldCandidates(m,c,'PATRIOT').filter(row=>row.action.kind==='EQUIPMENT_PURCHASE');}
function navalPoliticalLeverage(board,zone,f){const direction=f==='PATRIOT'?1:-1;let score=0;for(const city of Object.values(board.cities||{})){if(city.geography?.sea_zone_id!==zone||city.geography?.naval_class==='INLAND')continue;const support=Number(city.politics?.independence_support)||50,importance=Number(city.politics?.political_importance)||1,next=support+direction;if(f==='PATRIOT'&&support>=52&&support<60)score+=importance*(next>=60?3:1);if(f==='BRITISH'&&support>=40&&support<=48)score+=importance*(next<40?3:1);}return Math.min(16,score);}
function patriotNavalCandidates(m,c){const rows=[],foreign=m.political_phase?.foreign_intervention?.PATRIOT||{},foreignMax=Math.max(0,...Object.values(foreign).map(Number)),britBudget=Number(m.political_phase?.national_budget_value?.BRITISH??50);for(const zone of Object.keys(N.ZONES)){const board=JSON.parse(JSON.stringify(c));for(const city of Object.values(board.cities))city.politics.military_control=P.militaryControl(m,city.city_id,political);const calc=N.zoneCalculation(board,zone,period(m)),stage=N.stageForFaction(calc.balance,'PATRIOT'),has=op=>N.operationAvailability(board,zone,'PATRIOT',op,period(m)),own=Object.values(board.cities).filter(x=>x.geography?.sea_zone_id===zone&&x.geography?.naval_class!=='INLAND'&&x.politics.military_control==='PATRIOT'),enemy=Object.values(board.cities).filter(x=>x.geography?.sea_zone_id===zone&&x.geography?.naval_class!=='INLAND'&&x.politics.military_control==='BRITISH'),leverage=navalPoliticalLeverage(board,zone,'PATRIOT');const patrol=has('PATROL');if(patrol.available&&stage.key!=='CONTROL'){rows.push({operation:'NAVAL_ACCESS_FOREIGN_SUPPORT',score:34+(stage.key==='NO_CONTROL'?14:stage.key==='DISADVANTAGE'?10:stage.key==='CONTESTED'?4:0)+(foreignMax>=25?8:0),action:{type:'NAVAL',operation:'PATROL',zone,strategic_reason:'NAVAL_ACCESS_AND_FOREIGN_SUPPORT'}});}const guard=has('COASTAL_GUARD');if(guard.available&&own.length){const vulnerable=own.filter(x=>Number(x.politics.public_cooperation)<70||Number(x.politics.independence_support)<62).length;rows.push({operation:'NAVAL_COASTAL_POLITICAL_SUPPORT',score:27+Math.min(10,vulnerable*2)+leverage*.6+(stage.key==='NO_CONTROL'?7:0),action:{type:'NAVAL',operation:'COASTAL_GUARD',zone,strategic_reason:'NAVAL_POLITICAL_SUPPORT'}});}const disrupt=has('SHIPPING_DISRUPTION');if(disrupt.available&&enemy.length){rows.push({operation:'NAVAL_SHIPPING_POLITICAL_PRESSURE',score:27+(stage.key==='NO_CONTROL'?14:stage.key==='DISADVANTAGE'?10:stage.key==='CONTESTED'?5:0)+leverage+Math.min(8,enemy.length*2)+(foreignMax>=50?5:0),action:{type:'NAVAL',operation:'SHIPPING_DISRUPTION',zone,strategic_reason:'NAVAL_POLITICAL_PRESSURE'}});}const priv=has('PRIVATEERING');if(priv.available){const budgetPressure=Math.max(0,50-britBudget)/2;rows.push({operation:'NAVAL_PRIVATEERING_STRATEGIC_PRESSURE',score:28+Math.min(16,budgetPressure)+Math.min(10,foreignMax/10),action:{type:'NAVAL',operation:'PRIVATEERING',zone,strategic_reason:'WEAKEN_BRITISH_BUDGET_AND_SUPPLY'}});}const blockade=has('BLOCKADE');if(blockade.available){const target=(blockade.targets||[]).map(id=>board.cities[id]).filter(Boolean).sort((a,b)=>(Number(b.politics?.political_importance)||1)-(Number(a.politics?.political_importance)||1))[0];if(target){const enemyTroops=Object.values(m.field_armies||{}).filter(a=>a.faction==='BRITISH'&&a.location_city_id===target.city_id).reduce((n,a)=>n+Number(a.manpower||0),0);rows.push({operation:'NAVAL_BLOCKADE_STRATEGIC_PORT',score:34+(Number(target.politics?.political_importance)||1)*4+Math.min(12,enemyTroops/500),action:{type:'NAVAL',operation:'BLOCKADE',zone,target_city_id:target.city_id,strategic_reason:'DENY_ENEMY_SEA_ROUTE'}});}}}return rows;}
// Keep the commander-in-chief supplied after the Boston campaign, as well as at Worcester.
// A transport is useful only if it can reach this month's threatened city from a friendly neighbor.
function chiefSupplyCandidate(m,c){return Logistics.chiefSupplyCandidate(m,c,'PATRIOT');}
function available(m,row){const a=row.action||{},ids=[...(a.ids||[]),a.army_id].filter(Boolean);if(a.type==='GARRISON'&&(m.action_log||[]).some(x=>x.type==='GARRISON_FORMED'&&x.faction==='PATRIOT'&&x.city_id===a.city&&Number(x.year)===Number(m.calendar.year)&&Number(x.month)===Number(m.calendar.month)))return false;if(a.type==='ATTACK'){
  // An army reinforcing another active battle can remain physically at its origin.
  // It cannot defend a second attack there; prepareBattle requires an unengaged defender.
  const defenders=Object.values(m.field_armies||{}).some(unit=>unit.location_city_id===a.target&&unit.faction==='BRITISH'&&unit.manpower>0&&!unit.battle_id);
  const garrison=m.garrisons?.[a.target],guard=garrison?.faction==='BRITISH'&&garrison.manpower>0;
  if(!defenders&&!guard&&control(m,a.target)!=='BRITISH')return false; // Verified deployment-controlled, empty cities are valid unopposed targets.
}
return ids.every(id=>{const army=m.field_armies?.[id],battle=army?.battle_id&&m.battles?.[army.battle_id];return !battle||!['awaiting_tactic','active','awaiting_continuation'].includes(battle.status);});}
function availablePlan(m,plan,c){Operations.applyRows(m,c,'PATRIOT',plan.candidates||[]);const evaluated=require('./operational_readiness_v1.js').applyRows(m,c,'PATRIOT',TrustPolicy.applyRows(m,c,'PATRIOT',plan.candidates||[]).filter(row=>row.score>0&&available(m,row)));const candidates=evaluated.filter(row=>row.score>0).sort((a,b)=>b.score-a.score);return{...plan,readiness_rejections:evaluated.filter(r=>r.operational_readiness?.admissible===false),candidates,choice:candidates[0]||null,trust:TrustPolicy.forecast(m,c,'PATRIOT')};}
function operationalCandidates(m,c,variant='ADAPTIVE_PRESSURE'){
  const crisis=Crisis.crisisCandidates(m,c,'PATRIOT');
  const supply=chiefSupplyCandidate(m,c);
  if(crisis.assessment.active||crisis.operation_active){
    const profile=[{id:'BREAKTHROUGH_CRISIS',score:200,reason:'総司令官保存・戦線再構築を最優先。直接の危機行動が尽きたら他方面の有効な命令を使う'}];
    if(crisis.candidates.length){const candidates=[...crisis.candidates,...Logistics.transportCandidates(m,c,'PATRIOT'),...Logistics.disperseCandidates(m,c,'PATRIOT'),...Logistics.requisitionCandidates(m,c,'PATRIOT'),...(supply?[supply]:[])];Logistics.reweightRows(m,c,'PATRIOT',candidates);candidates.sort((a,b)=>b.score-a.score);return availablePlan(m,{profile,lifecycle:{breakthrough_crisis:crisis.assessment},candidates:Garrison.applyPolicy(m,c,'PATRIOT',candidates),choice:candidates[0],voteThreats:[]},c);}
    const normal=base.operationalCandidates(m,c,variant);
    const chiefId=Crisis.chiefArmy(m,'PATRIOT')?.id;
    const candidates=(normal.candidates||[]).filter(row=>row.action?.type!=='GARRISON'&&(!['ATTACK','MOVE'].includes(row.action?.type)||!(row.action?.ids||[]).includes(chiefId))).map(row=>({...row,action:{...row.action,crisis_secondary_original_reason:row.action?.strategic_reason||null,strategic_reason:'BREAKTHROUGH_CRISIS_SECONDARY'}}));
    candidates.push(...Civil.candidates(m,c,'PATRIOT'),...Logistics.transportCandidates(m,c,'PATRIOT'),...Logistics.disperseCandidates(m,c,'PATRIOT'),...Logistics.requisitionCandidates(m,c,'PATRIOT'));
    if(supply)candidates.push(supply);
    Operations.applyRows(m,c,'PATRIOT',candidates);
    Logistics.reweightRows(m,c,'PATRIOT',candidates);
    Civil.reweightPoliticalRows(m,c,'PATRIOT',candidates);
    Civil.applyStrategicBalance(m,c,'PATRIOT',candidates);
    const viable=candidates.filter(row=>row.score>0);
    viable.sort((a,b)=>b.score-a.score);
    return availablePlan(m,{profile,lifecycle:{breakthrough_crisis:crisis.assessment},candidates:Garrison.applyPolicy(m,c,'PATRIOT',viable),choice:viable[0]||null,voteThreats:normal.voteThreats||[],fallback_reason:'NO_DIRECT_CRISIS_ACTION'},c);
  }
  const normal=base.operationalCandidates(m,c,variant);
  let candidates=[...(normal.candidates||[]),...patriotNavalCandidates(m,c),...Civil.opinionCandidates(m,c,'PATRIOT'),...Civil.candidates(m,c,'PATRIOT'),...Civil.repairCandidates(m,c,'PATRIOT'),...Logistics.transportCandidates(m,c,'PATRIOT'),...Logistics.disperseCandidates(m,c,'PATRIOT'),...Logistics.requisitionCandidates(m,c,'PATRIOT'),...(supply?[supply]:[])];
  candidates.push(...ReserveFormation.candidates(m,c,'PATRIOT',candidates));
  Operations.applyRows(m,c,'PATRIOT',candidates);
  Logistics.reweightRows(m,c,'PATRIOT',candidates);
  Civil.reweightPoliticalRows(m,c,'PATRIOT',candidates);
  Civil.applyStrategicBalance(m,c,'PATRIOT',candidates);
  candidates=Garrison.applyPolicy(m,c,'PATRIOT',candidates);
  const viable=applyCrossSwapGuard(m,candidates).filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
  return availablePlan(m,{...normal,candidates:viable,choice:viable[0]||null,lifecycle:{...(normal.lifecycle||{}),breakthrough_crisis:crisis.assessment}},c);
}
function action(m,c,variant='ADAPTIVE_PRESSURE'){
  if((m.factions?.PATRIOT?.commands_remaining||0)<1)return null;
  const continuation=require('./normal_operations_v1.js').continuation(m,'PATRIOT');
  if(continuation)return continuation;
  const p=operationalCandidates(m,c,variant),a=p.choice?.action||null;
  if(a&&p.choice?.operational_readiness){const v=p.choice.operational_readiness;a.readiness_decision={stage:v.stage,blockers:v.blockers||[],unknowns:v.unknowns||[],score_delta:v.score_delta||0};}
  Operations.noteMissions(m,c,'PATRIOT',[...(p.candidates||[]),...(p.readiness_rejections||[])],a);
 Operations.noteAction(m,'PATRIOT',a);
  if(a){if(a.strategic_reason==='BREAKTHROUGH_CRISIS')Crisis.noteChosenAction(m,'PATRIOT',a,c);else if(a.strategic_reason==='BREAKTHROUGH_CRISIS_SECONDARY')Crisis.noteSecondaryAction(m,'PATRIOT');else Crisis.noteNormalAction(m,'PATRIOT');}
  else if(p.lifecycle?.breakthrough_crisis?.active)Crisis.noteNoLegalCrisisAction(m,'PATRIOT');
  return a;
}
function strategicMode(m,c,variant='ADAPTIVE_PRESSURE'){const a=Crisis.assess(m,c,'PATRIOT');return a.active?'BREAKTHROUGH_CRISIS':base.strategicMode(m,c,variant);}
function defenseDecision(prepared,c){return Crisis.defenseDecision(prepared,'PATRIOT',c);}
function execute(m,c,a,engine){if(a?.type==='TRANSPORT')return Logistics.executeTransport(m,c,'PATRIOT',a);if(a?.type==='MOVE')return Logistics.executeMoveWithSupply(m,c,'PATRIOT',a,engine,(military,cities,action,eng)=>base.execute(military,cities,action,eng));if(['SECURITY','STOCKPILE_AID'].includes(a?.type)){const r=Civil.execute(m,c,'PATRIOT',a);return{military:r.m,cities:r.c};}if(a?.type==='DAMAGE_REPAIR'){const r=Civil.executeRepair(m,c,'PATRIOT',a);return{military:r.m,cities:r.c};}if(a?.type==='FORCED_REQUISITION_AI'){const r=Logistics.executeRequisition(m,c,'PATRIOT',a);return{military:r.military,cities:r.cities};}return base.execute(m,c,a,engine);}
function explainPlan(m,c,variant='ADAPTIVE_PRESSURE'){const p=operationalCandidates(m,c,variant);return{readiness_rejections:(p.readiness_rejections||[]).map(x=>({action:x.action,readiness:x.operational_readiness})),lifecycle:p.lifecycle,strategy:p.profile?.slice?.(0,10)||[],operations:(p.candidates||[]).slice(0,14).map(x=>({operation:x.operation,score:Math.round(x.score*10)/10,readiness:x.operational_readiness,action:x.action})),choice:p.choice?{operation:p.choice.operation,score:Math.round(p.choice.score*10)/10,action:p.choice.action}:null};}
module.exports={...base,action,operationalCandidates,strategicMode,defenseDecision,execute,explainPlan,crossSwapPenalty,Crisis,TrustPolicy,patriotEquipmentCandidates,patriotNavalCandidates,OFFICIAL_AI_REVISION:'2026-10-17-SUPPLY-READINESS-HQ-GUARD',OFFICIAL_AI_BASELINE:'2026-09-30-V10-LOGISTICS-CIVIL-NAVAL-EQUIPMENT-OFFICIAL'};
};
modules['AI_OFFICIAL_CURRENT/political_strategy_official_v1.js']=function(require,module,exports){
// Political strategy shared by the official AI development baseline.
// Goal: convert state votes into military/strategic freedom without wasting finite national budget or manpower proposals.
const P=require('../runtime/political_phase_engine_v0_77_portraits.js');
const config=require('../source_data/political_phase_config_v0_1.json');
const Trust=require('./trust_strategy_v1.js');
const PATRIOT='PATRIOT',BRITISH='BRITISH';
function proposalHistory(m,f,id){return(m.political_phase?.proposal_history||[]).filter(x=>x.faction===f&&x.proposal_id===id);}
function approvedEver(m,f,id){return proposalHistory(m,f,id).some(x=>x.approved);}
function nationalBudget(m,f){return Number(m.political_phase?.national_budget_value?.[f])||0;}
function treasury(m,f){return Number(m.factions?.[f]?.treasury)||0;}
function mobilizable(m,f){return Number(m.factions?.[f]?.mobilizable_manpower)||0;}
function warWill(m,f){return Number(m.political_phase?.war_will_value?.[f])||0;}
function manpowerUrgency(m,f){const n=mobilizable(m,f);if(n<2500)return 4;if(n<5000)return 3;if(n<7500)return 2;if(n<10000)return 1;return 0;}
function budgetProposal(m,f,votes){
 const prefix=f==='PATRIOT'?'PAT':'BRI';
 return ['LARGE','STANDARD','SMALL'].map(size=>P.proposalById(f,`${prefix}_BUDGET_${size}`,config)).find(proposal=>proposal&&votes>=proposal.required_votes&&P.proposalAffordability(m,f,proposal,config).affordable)?.id||null;
}
function budgetPriority(m,f){const cash=treasury(m,f);return cash<500?106:cash<1000?94:cash<1800?68:cash<2500?30:8;}
function mobilisationPriority(m,f){const base=[0,34,66,91,108][manpowerUrgency(m,f)],will=warWill(m,f),penalty=will<=20?45:will<=30?28:will<=40?16:will<=55?8:0;return Math.max(0,base-penalty);}
function theaterAppointmentCandidate(m,cityState,f){
 const commanders=Object.values(m.commanders||{}).filter(x=>x.faction===f),existing=commanders.filter(x=>x.role==='方面軍司令官').length;
 if(existing>=3)return null;
 const armies=Object.values(m.field_armies||{}).filter(a=>a.faction===f&&Number(a.manpower||0)>0),byId=Object.fromEntries(armies.map(a=>[a.id,a]));
 const cities=cityState?.cities||{},edges=cityState?.topology?.edges||[];
 const neighbors=id=>edges.filter(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&(e.a===id||e.b===id)).map(e=>e.a===id?e.b:e.a);
 const enemyAdjacent=id=>neighbors(id).some(n=>P.militaryControl(m,n,config)===(f==='PATRIOT'?'BRITISH':'PATRIOT'));
 const frontlineCities=new Set(armies.filter(a=>enemyAdjacent(a.location_city_id)).map(a=>a.location_city_id));
 let best=null;
 for(const c of commanders){
  if(c.role!=='通常指揮官')continue;
  const army=byId[c.assigned_army_id];
  if(!army||Number(army.manpower||0)<700)continue;
  const coLocated=armies.filter(a=>a.id!==army.id&&a.location_city_id===army.location_city_id&&Number(a.manpower||0)>=300).length;
  const stats=c.stats||{},quality=(Number(stats.leadership||0)*.35+Number(stats.tactics||0)*.35+Number(stats.logistics||0)*.2+Number(stats.charisma||0)*.1);
  const atFront=enemyAdjacent(army.location_city_id);
  const operationalNeed=(coLocated?34:0)+(atFront?14:0)+(frontlineCities.size>=2?10:0)+(Number(army.manpower||0)>=1800?8:0);
  if(operationalNeed<20&&quality<82)continue;
  const score=46+quality*.32+operationalNeed+(existing===0?7:0);
  const row={commander_id:c.id,score,quality,operational_need:operationalNeed,co_located_armies:coLocated,frontline_city_count:frontlineCities.size};
  if(!best||row.score>best.score)best=row;
 }
 return best;
}

function add(rows,id,score,target=null){if(!id||rows.some(x=>x.id===id))return;rows.push(target?{id,score,target}:{id,score});}
function finalize(rows,m,c,f){
 const urgency=Trust.forecast(m,c,f),used=new Set(m.political_phase?.proposal_ids_used?.[f]||[]);
 const ranked=rows.filter(r=>!used.has(r.id)).map(r=>{
  const proposal=P.proposalById(f,r.id,config);let gain=0;
  if(proposal?.effect_type==='DIPLOMACY'){
   const current=Number(m.political_phase?.foreign_intervention?.PATRIOT?.[proposal.country])||0;
   const after=Math.max(0,Math.min(100,current+(f==='PATRIOT'?1:-1)*Number(proposal.amount||0)));
   if(P.foreignAidStage(current,config).id!==P.foreignAidStage(after,config).id)gain=Number(config.diplomatic_stage_trust_change)||1;
  }else if(proposal?.effect_type==='GERMAN_AUXILIARY_DIPLOMACY'){
   const current=Number(m.political_phase?.german_auxiliaries?.BRITISH)||0;
   if(P.germanAuxiliaryStage(current,config).id!==P.germanAuxiliaryStage(Math.min(100,current+Number(proposal.amount||0)),config).id)gain=Number(config.diplomatic_stage_trust_change)||1;
  }
  const chance=proposal?P.approvalChance(proposal,P.indicatorSummary(m,f,config).trust_level,config)/100:0;
  return {...r,score:r.score+gain*urgency.weight*chance};
 });
 return ranked.sort((a,b)=>b.score-a.score).slice(0,3).map(({id,target})=>target?{id,target}:{id});
}
function domesticSupportTarget(m,c,faction){
 const chief=Object.values(m.commanders||{}).find(x=>x.faction===faction&&x.role==='総司令官');
 const chiefCity=m.field_armies?.[chief?.assigned_army_id]?.location_city_id;
 const owned=Object.values(c.cities||{}).filter(city=>P.militaryControl(m,city.city_id,config)===faction);
 // The headquarters may have moved or abandoned Worcester. Never propose support
 // for a city that the receiving faction no longer controls.
 owned.sort((a,b)=>(Number(b.city_id===chiefCity)-Number(a.city_id===chiefCity))||
  Number(b.politics?.political_importance||0)-Number(a.politics?.political_importance||0)||
  Number(a.stockpile?.FOOD||0)-Number(b.stockpile?.FOOD||0)||a.city_id.localeCompare(b.city_id));
 return owned[0]?.city_id||null;
}

function supplyProposal(m,c,f,votes,target){
 const prefix=f==='PATRIOT'?'PAT':'BRI',stock=target&&c.cities?.[target];
 const remaining=stock?Math.max(0,Number(stock.capacity?.FOOD||0)-Number(stock.stockpile?.FOOD||0)):0;
 const remainingMaterials=stock?Math.max(0,Number(stock.capacity?.MATERIALS||0)-Number(stock.stockpile?.MATERIALS||0)):0;
 // Do not purchase the largest shipment into an almost full warehouse.
 const demand=f==='PATRIOT'?Math.max(remaining/2800,remainingMaterials/1800):Math.max(0.25,Math.min(1.3,(3000-(Number(m.political_phase?.pending_overseas_supply?.BRITISH?.FOOD)||0))/3000));
 const sizes=(demand>=0.85?['LARGE','STANDARD','SMALL']:demand>=0.30?['STANDARD','SMALL']:['SMALL']);
 for(const size of sizes){const id=`${prefix}_ADDITIONAL_MILITARY_SUPPORT_${size}`,p=P.proposalById(f,id,config);
  if(p&&votes>=p.required_votes&&P.proposalAffordability(m,f,p,config).affordable)return p.id;}
 return null;
}

function patriotPlan(m,c){
 const votes=P.voteTally(c,config).PATRIOT,reserves=m.political_phase?.commander_reserves?.PATRIOT?.length||0,candidates=m.political_phase?.dispatch_candidates?.PATRIOT?.length||0,rows=[];
 const budget=budgetProposal(m,PATRIOT,votes);if(budget)add(rows,budget,budgetPriority(m,PATRIOT));
 if(votes>=2&&candidates&&reserves<=1)add(rows,'PAT_GENERAL_DISPATCH',reserves===0?96:82);
 const supportTarget=domesticSupportTarget(m,c,PATRIOT);
 {const support=supplyProposal(m,c,PATRIOT,votes,supportTarget);if(support&&supportTarget)add(rows,support,56,supportTarget);}
 if(votes>=3&&manpowerUrgency(m,PATRIOT)>0)add(rows,'PAT_MOBILIZATION',mobilisationPriority(m,PATRIOT));
 if(votes>=3)add(rows,'PAT_DUTCH_TRADE',48);
 const theater=theaterAppointmentCandidate(m,c,PATRIOT);if(votes>=4&&theater)add(rows,'PAT_THEATER_APPOINTMENT',Math.min(104,theater.score),theater.commander_id);
 const manpowerReady=approvedEver(m,PATRIOT,'PAT_MOBILIZATION')||mobilizable(m,PATRIOT)>=10000;
 if(votes>=4&&(manpowerReady||Trust.forecast(m,c,PATRIOT).critical))add(rows,'PAT_SPANISH_AID',61);
 if(votes>=5&&(manpowerReady||Trust.forecast(m,c,PATRIOT).critical))add(rows,'PAT_FRENCH_SUPPORT',72);
 return finalize(rows,m,c,PATRIOT);
}
function britishPlan(m,c){
 const votes=P.voteTally(c,config).BRITISH,reserves=m.political_phase?.commander_reserves?.BRITISH?.length||0,candidates=m.political_phase?.dispatch_candidates?.BRITISH?.length||0,rows=[];
 const budget=budgetProposal(m,BRITISH,votes);if(budget)add(rows,budget,budgetPriority(m,BRITISH));
 if(votes>=2&&candidates&&reserves<=1)add(rows,'BRI_GENERAL_DISPATCH',reserves===0?96:82);
 {const support=supplyProposal(m,c,BRITISH,votes,null);if(support)add(rows,support,55);}
 if(votes>=3&&manpowerUrgency(m,BRITISH)>0)add(rows,'BRI_MOBILIZATION',mobilisationPriority(m,BRITISH));
 if(votes>=3)add(rows,'BRI_DUTCH_TRADE',48);
 const theater=theaterAppointmentCandidate(m,c,BRITISH);if(votes>=4&&theater)add(rows,'BRI_THEATER_APPOINTMENT',Math.min(104,theater.score),theater.commander_id);
 const german=Number(m.political_phase?.german_auxiliaries?.BRITISH)||0;if(votes>=1&&german<75)add(rows,'BRI_GERMAN_AUXILIARIES',68);
 if(votes>=4)add(rows,'BRI_SPANISH_AID',57);
 if(votes>=5)add(rows,'BRI_FRENCH_SUPPORT',70);
 return finalize(rows,m,c,BRITISH);
}
function plan(m,c,faction){return faction===PATRIOT?patriotPlan(m,c):britishPlan(m,c);}
function execute(m,c,faction){let state=m;const results=[];for(const step of plan(state,c,faction)){try{if(step.target)globalThis.__pendingPoliticalProposalTarget=step.target;const out=P.submitProposal(state,c,faction,step.id,config);state=out.state;results.push(out.result);}catch(error){if(!['POLITICAL_PROPOSAL_LIMIT_REACHED','POLITICAL_PROPOSAL_ALREADY_USED','STATE_VOTES_INSUFFICIENT','NATIONAL_BUDGET_INSUFFICIENT','DISPATCH_CANDIDATE_EMPTY','PROPOSAL_TARGET_REQUIRED','THEATER_COMMANDER_LIMIT','COMMANDER_NOT_ELIGIBLE'].includes(error.message))throw error;}finally{globalThis.__pendingPoliticalProposalTarget=null;}}return{state,results};}
module.exports={plan,execute,approvedEver,budgetProposal,manpowerUrgency,theaterAppointmentCandidate,domesticSupportTarget,OFFICIAL_POLITICAL_AI_BASELINE:'2026-09-29-THEATER-APPOINTMENT-REVISION'};
};
const aliases=Object.create(null);
aliases["runtime/canonical_naval_runtime_v0_67.js"]=()=>(window.NavalControlEngine);
aliases["runtime/army_phase2_engine_v0_74_retreat.js"]=()=>(window.ArmyPhase2Engine);
aliases["runtime/battle_engine_v0_74_retreat.js"]=()=>(window.BattleEngine);
aliases["runtime/city_command_engine_v0_18.js"]=()=>(window.CityCommandEngine);
aliases["runtime/political_phase_engine_v0_77_portraits.js"]=()=>(window.PoliticalPhaseEngine);
aliases["runtime/patriot_sparring_ai_v1_15.js"]=()=>(window.PatriotSparringAI);
aliases["runtime/royalist_ai_turn_v1_15.js"]=()=>(window.RoyalistAiTurnLegacy||window.RoyalistAiTurn);
aliases["source_data/phase2_config_v0_9_funds.json"]=()=>(window.PHASE2_CONFIG);
aliases["source_data/political_phase_config_v0_1.json"]=()=>(window.POLITICAL_PHASE_CONFIG);
aliases["source_data/city_command_config_v0_17.json"]=()=>(window.CITY_COMMAND_CONFIG);
aliases["AI_OFFICIAL_CURRENT/naval_api_v1.js"]=()=>(window.NavalControlEngine);

function resolve(parent,req){if(!req.startsWith('.'))return req;const parts=(parent.split('/').slice(0,-1).join('/')+'/'+req).split('/'),out=[];for(const p of parts){if(!p||p==='.')continue;if(p==='..')out.pop();else out.push(p);}let id=out.join('/');if(!/\.[a-z0-9]+$/i.test(id))id+='.js';return id;}
function load(id,parent){id=parent?resolve(parent,id):id;if(aliases[id])return aliases[id]();if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('AI bundle module missing: '+id+' from '+(parent||''));const module={exports:{}};cache[id]=module;modules[id]((req)=>load(req,id),module,module.exports);return module.exports;}

const api=load("AI_OFFICIAL_CURRENT/patriot_strategic_ai_v10_official.js");const politics=load('AI_OFFICIAL_CURRENT/political_strategy_official_v1.js');
api.available=(state)=>state?.player_faction==='BRITISH'&&state?.current_faction==='BRITISH'&&Number(state?.factions?.PATRIOT?.commands_remaining)>0;
api.chooseAction=(m,c)=>api.action(m,c);
api.prepareAttack=function(m,c,a,eng){let next=window.ArmyPhase2Engine.spendCommand(m,'PATRIOT','AI_ATTACK',1);for(const id of a.ids||[])if(next.field_armies?.[id])next.field_armies[id].acted_this_month=true;if(a.route==='LANDING_ATTACK'&&window.NavalControlEngine){const from=c.cities?.[a.origin],to=c.cities?.[a.target],p=window.NavalControlEngine.seaRouteProfile(c,from.geography.sea_zone_id,to.geography.sea_zone_id,'PATRIOT','LANDING',`${next.calendar.year}-${String(next.calendar.month).padStart(2,'0')}`);for(const id of a.ids||[])if(next.field_armies?.[id]){const before=Number(next.field_armies[id].manpower||0);next.field_armies[id].manpower=before>0&&p.arrival_rate>0?Math.max(1,Math.floor(before*p.arrival_rate)):0;}}const battle=window.BattleEngine.prepareBattle(next,{origin_city_id:a.origin,city_id:a.target,attacker_army_ids:a.ids,leader_army_id:a.leader||a.ids?.[0],route_type:a.route==='LANDING_ATTACK'?'LANDING_ATTACK':'LAND_ATTACK'},c,window.PHASE2_CONFIG);return battle;};
api.executeNonBattle=function(m,c,a,eng){if(a.type==='TRANSPORT')return api.execute(m,c,a,eng);if(a.type==='OPINION'){const input=JSON.parse(JSON.stringify(m));input.current_faction='PATRIOT';const applied=window.ArmyPhase2Engine.executeOpinionCampaign(input,c,a.city,a.tier,window.PHASE2_CONFIG,null);applied.state.current_faction=m.current_faction;return{military:applied.state,cities:applied.city_state};}return api.execute(m,c,a,eng);};
api.politicalDecisions=function(m,c){return politics.execute(m,c,'PATRIOT');};
window.PatriotAiTurn=api;window.__PatriotAiTurnRuntimeInfo={default_latest:true,baseline:api.OFFICIAL_AI_BASELINE||'2026-09-24'};
})();
