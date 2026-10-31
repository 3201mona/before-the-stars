// Shared operational-risk model for BOTH factions' commander-in-chief.
// The loss of this army ends the entire campaign. This policy evaluates the
// changed risk of a proposed order; it never checks a named commander, city,
// fixed escort count, or mandatory land exit.
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CommanderSurvivalPolicy=api;
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const clamp=(n,lo=0,hi=100)=>Math.max(lo,Math.min(hi,n));
 const other=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
 const num=x=>Number.isFinite(Number(x))?Number(x):0;
 const active=b=>b&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status);
 function chiefArmy(m,f){return Object.values(m.field_armies||{}).find(a=>a.faction===f&&num(a.manpower)>0&&m.commanders?.[a.commander_id]?.role==='総司令官')||null;}
 function landNeighbors(c,id){const result=new Set();for(const e of c.topology?.edges||[]){if(String(e.type||'').startsWith('water_')||e.counts_as_land_adjacency===false)continue;if(e.a===id)result.add(e.b);else if(e.b===id)result.add(e.a);}return [...result];}
 function localPower(m,f,id){let total=0;for(const a of Object.values(m.field_armies||{}))if(a.faction===f&&a.location_city_id===id&&num(a.manpower)>0&&(!active(m.battles?.[a.battle_id])||m.battles[a.battle_id].city_id===id))total+=num(a.manpower);const g=m.garrisons?.[id];if(g?.faction===f)total+=num(g.manpower);return total;}
 function seaRouteQuality(m,c,f,city,deps){
  const Naval=deps.Naval,from=c.cities?.[city];
  if(!Naval?.seaRouteProfile||!Naval?.isPortOperational||!from||!Naval.isPortOperational(from))return 0;
  const zone=from.geography?.sea_zone_id;if(!zone)return 0;
  let best=0;const period=`${m.calendar?.year}-${String(m.calendar?.month||1).padStart(2,'0')}`;
  for(const port of Object.values(c.cities||{})){
   if(port.city_id===city||!Naval.isPortOperational(port)||port.geography?.sea_zone_id!==zone)continue;
   if(deps.control(m,port.city_id)!==f||localPower(m,f,port.city_id)<=0)continue;
   try{const rate=num(Naval.seaRouteProfile(c,zone,port.geography.sea_zone_id,f,'LANDING',period).arrival_rate);best=Math.max(best,clamp((rate-.45)/.55,0,1));}catch{}
  }
  // A sea route is less reliable than a defended land retreat: a blockade can
  // change the available exit after the battle.
  return best*.55;
 }
 function landRouteQuality(m,c,f,city,deps){
  let exits=0;
  for(const id of landNeighbors(c,city)){
   if(deps.control(m,id)===other(f)||localPower(m,other(f),id)>0)continue;
   const threat=deps.Crisis.directThreat(m,c,f,id).ratio;
   if(threat>=1.30)continue;
   const support=localPower(m,f,id),ctl=deps.control(m,id);
   exits+=ctl===f&&support>0?1:ctl===f?0.75:0.50;
  }
  return clamp(exits/2,0,1);
 }
 function riskAt(m,c,f,chief,deps){
  const id=chief.location_city_id;
  const direct=deps.Crisis.directThreat(m,c,f,id),next=deps.Crisis.nextTurnThreat(m,c,f,id);
  const now=num(direct.ratio),future=num(next.ratio);
  const land=landRouteQuality(m,c,f,id,deps),sea=seaRouteQuality(m,c,f,id,deps),escape=clamp(land+sea,0,1);
  const local=Math.max(1,localPower(m,f,id));
  const pressure=clamp((now-.55)*100);
  // A hypothetical enemy staging move followed by a later attack is weaker
  // evidence than an assault already reachable on this turn. This matches
  // the existing crisis lifecycle's distinction between direct and projected.
  const futurePressure=clamp((future-.8)*75)*(next.virtualMoveTo?0.35:1);
  const escapePressure=(1-escape)*(9+pressure*.45+futurePressure*.28);
  // Reliance on a single sea route remains precarious even before an enemy
  // appears in direct range; the enemy may close it by blockade next turn.
  const dislocation=land<.5?(1-land)*(20+20*(1-sea)):0;
  const concentration=clamp((1-num(chief.manpower)/local)*20,0,20);
  const unsupported=clamp(20-concentration,0,20);
  // No escorts is not itself an illegal state. It only increases the cost of
  // a threatened command post whose total nearby force has been depleted.
  const isolation=unsupported*Math.min(1,Math.max(now,future)*.7);
  let supply=0;try{const months=deps.Crisis.supplyMonths(m,c,id);if(Number.isFinite(months)&&months<1.5)supply=(1.5-months)*11;}catch{}
  const morale=clamp((42-num(chief.morale??60))*.7,0,24);
  return {score:clamp(Math.max(pressure,futurePressure*.65)+escapePressure+dislocation+isolation+supply+morale),direct:now,next:future,land,sea,escape,local,chief:num(chief.manpower)};
 }
 function project(m,c,f,action,row,deps){
  const ids=new Set(action.ids||[]),chief=chiefArmy(m,f),origin=action.origin||m.field_armies?.[action.ids?.[0]]?.location_city_id;
  const moved=(action.type==='MOVE'||action.type==='ATTACK')&&ids.size>0;
  if(!moved||!chief)return null;
  if(!ids.has(chief.id)&&origin!==chief.location_city_id)return null;
  const virtual={...m,field_armies:{...m.field_armies},garrisons:{...m.garrisons}};
  const board={...c,cities:{...c.cities}};
  let arrival=1;
  if(action.route==='SEA_MOVE'||action.route==='LANDING_ATTACK'){
   if(row.combat_value?.arrival!=null)arrival=num(row.combat_value.arrival);
   else try{const from=c.cities[origin],to=c.cities[action.target];arrival=num(deps.Naval.seaRouteProfile(c,from.geography.sea_zone_id,to.geography.sea_zone_id,f,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`).arrival_rate);}catch{}
  }
  for(const id of ids){const unit=m.field_armies?.[id];if(!unit)continue;virtual.field_armies[id]={...unit,location_city_id:action.target,manpower:Math.max(0,Math.floor(num(unit.manpower)*arrival))};}
  if(action.type==='ATTACK'&&ids.has(chief.id)){
   // Evaluate the bridgehead AFTER a successful attack, not with defeated
   // enemies still counted as stationed defenders. Defeat risk is separate.
   for(const unit of Object.values(m.field_armies||{}))if(unit.faction===other(f)&&unit.location_city_id===action.target)virtual.field_armies[unit.id]={...unit,manpower:0};
   const guard=m.garrisons?.[action.target];if(guard?.faction===other(f))virtual.garrisons[action.target]={...guard,manpower:0};
   const city=c.cities?.[action.target];if(city)board.cities[action.target]={...city,politics:{...city.politics,military_control:f}};
   const losses=(row.operational_readiness?.samples||[]).map(s=>num(s.attacker_loss));
   const loss=losses.length?Math.max(...losses):0;
   const committed=[...ids].reduce((sum,id)=>sum+num(m.field_armies?.[id]?.manpower)*arrival,0);
   const virtualChief=virtual.field_armies[chief.id];
   if(virtualChief)virtualChief.manpower=Math.max(0,Math.floor(virtualChief.manpower-loss*virtualChief.manpower/Math.max(1,committed)));
  }
  return {m:virtual,c:board,chief:virtual.field_armies[chief.id]||chief,chiefCommitted:ids.has(chief.id),origin};
 }
 function assess(m,c,f,row,deps){
  const a=row.action||{},beforeChief=chiefArmy(m,f);
  if(!beforeChief||!['ATTACK','MOVE'].includes(a.type))return null;
  const projected=project(m,c,f,a,row,deps);if(!projected)return null;
  const before=deps._beforeRisk||(deps._beforeRisk=riskAt(m,c,f,beforeChief,deps)),after=riskAt(projected.m,projected.c,f,projected.chief,deps);
  const samples=row.operational_readiness?.samples||[];
  const defeatSamples=samples.filter(s=>!s.occupied).length;
  const chancePenalty=projected.chiefCommitted&&a.type==='ATTACK'?(samples.length?defeatSamples/samples.length*66:32):0;
  const counterRisk=projected.chiefCommitted&&a.type==='ATTACK'&&samples.length?clamp((Math.max(...samples.map(s=>num(s.post_month_enemy_ratio)))-.8)*90):0;
  const exposure=clamp(after.score+chancePenalty+counterRisk);
  const delta=exposure-before.score;
  const penalty=Math.min(170,Math.max(0,delta)*1.55+(projected.chiefCommitted&&a.type==='ATTACK'?exposure*.55:0));
  const rescueBonus=delta<0?Math.min(34,-delta*.55):0;
  const lossInSamples=num(projected.chief.manpower)<=0||(projected.chiefCommitted&&a.type==='ATTACK'&&samples.some(s=>s.chief_destroyed===true));
  // Only a modelled destruction of the commander's army is an absolute veto.
  // Other bad positions stay ranked: the AI can still select the least risky
  // legal action during a genuine crisis with no good options.
  return {before,after,projected_risk:exposure,relative_risk:delta,penalty,rescue_bonus:rescueBonus,score_delta:Math.round((rescueBonus-penalty)*10)/10,admissible:!lossInSamples,reason:lossInSamples?'PROJECTED_HQ_DESTRUCTION':'COMPARATIVE_HQ_SURVIVAL',chief_committed:projected.chiefCommitted};
 }
 function applyRows(m,c,f,rows,deps){
  if(!deps?.Crisis?.directThreat||!deps.Crisis.nextTurnThreat||!deps.control)return rows;
  for(const row of rows){if(row.commander_survival)continue;const evaluation=assess(m,c,f,row,deps);if(!evaluation)continue;row.commander_survival=evaluation;row.score+=(evaluation.admissible?evaluation.score_delta:-10000);}
  return rows;
 }
 return {chiefArmy,riskAt,assess,applyRows,version:'1.0.0-BOTH-FACTIONS'};
});
