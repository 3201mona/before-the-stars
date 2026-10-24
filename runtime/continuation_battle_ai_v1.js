(function(){'use strict';
 const B=window.BattleEngine,E=window.ArmyPhase2Engine,P=window.PoliticalPhaseEngine,C=window.CityCommandEngine,phase=window.PHASE2_CONFIG,politicalConfig=window.POLITICAL_PHASE_CONFIG,cityConfig=window.CITY_COMMAND_CONFIG;
 if(!B||!E||!phase?.battle_engine)return;
 const copy=v=>JSON.parse(JSON.stringify(v));
 const opposite=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
 const N=window.NavalControlEngine;
 const MIN_VOLUNTARY_SEA_ARRIVAL=.70,MIN_CHIEF_RESCUE_SEA_ARRIVAL=.35;
 function trustAllows(m,c,faction,a){const policy=(faction==='PATRIOT'?window.PatriotAiTurn:window.RoyalistAiTurn)?.TrustPolicy;return !policy||policy.allowsAction(m,c,faction,a);}
 function landAdjacent(c,a,b){return (c.topology?.edges||[]).some(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a)));}
 function cityImportance(c,id){return Number(c.cities?.[id]?.politics?.political_importance)||1;}
 function battleGarrison(m,b){const g=m.garrisons?.[b.city_id];if(!g||g.faction!==b.defender_faction||Number(g.manpower||0)<=0)return null;return{...g,morale:Number.isFinite(Number(b.garrison_morale))?Number(b.garrison_morale):Number(phase.battle_engine.garrison_defaults?.morale??60)};}
 function sidePower(m,c,b,role,extraIds=[]){
   const isAttacker=role==='attacker',baseIds=isAttacker?b.attacker_army_ids:b.defender_army_ids,ids=[...new Set([...(baseIds||[]),...(extraIds||[])])].filter(id=>m.field_armies?.[id]&&Number(m.field_armies[id].manpower||0)>0);
   const leaderId=B.selectBattlefieldLeader(m,ids),commanderId=leaderId?m.field_armies[leaderId]?.commander_id:null,garrison=isAttacker?null:battleGarrison(m,b);
   if(!ids.length&&!garrison)return 0;
   const summary=B.forceSummary(m,ids,garrison,commanderId,phase.battle_engine,cityImportance(c,b.city_id),isAttacker);
   return B.basePower(summary,phase.battle_engine,!isAttacker);
 }
 function dangerRatio(m,c,b,faction,extraIds=[]){
   const ownRole=b.attacker_faction===faction?'attacker':'defender',enemyRole=ownRole==='attacker'?'defender':'attacker';
   const own=sidePower(m,c,b,ownRole,extraIds),enemy=sidePower(m,c,b,enemyRole,[]);
   return own>0?enemy/own:99;
 }
 function chiefIds(m,b,faction){const ids=b.attacker_faction===faction?b.attacker_army_ids:b.defender_army_ids;return(ids||[]).filter(id=>m.commanders?.[m.field_armies?.[id]?.commander_id]?.role==='総司令官');}
 function chiefMorale(m,b,faction){const ids=chiefIds(m,b,faction);return ids.length?Math.min(...ids.map(id=>Number(m.field_armies?.[id]?.morale??50))):null;}
 function reinforcementGroups(m,c,b,faction){
   const already=new Set([...(b.attacker_army_ids||[]),...(b.defender_army_ids||[])]),groups=new Map(),target=c.cities?.[b.city_id],period=`${m.calendar?.year||1775}-${String(m.calendar?.month||6).padStart(2,'0')}`;
   for(const army of Object.values(m.field_armies||{})){
     if(army.faction!==faction||already.has(army.id)||army.battle_id||army.acted_this_month||Number(army.manpower||0)<50||Number(army.morale||0)<10)continue;
     const origin=army.location_city_id,originCity=c.cities?.[origin],access=N?.coastalBattleLandingStatus?.(target);if(!origin)continue;let mode=null,arrival=1;
     if(landAdjacent(c,origin,b.city_id))mode='LAND';else if(N?.isPortOperational?.(originCity)&&originCity?.geography?.sea_zone_id&&access?.available){mode='SEA';arrival=N.seaRouteProfile(c,originCity.geography.sea_zone_id,target.geography.sea_zone_id,faction,'SEA_TRANSPORT',period).arrival_rate;}else continue;
     const key=`${origin}|${mode}`;if(!groups.has(key))groups.set(key,{origin,mode,ids:[],arrival,arrival_access_mode:mode==='SEA'?access.mode:null});groups.get(key).ids.push(army.id);
   }
   // Each candidate is one legal command. Ordinary commanders travel separately;
   // a joint group must include its unacted chief or theater commander.
   const commandGroups=[...groups.values()].flatMap(g=>g.ids.length<2||B.canLeadJointReinforcement(m,g.ids)?[g]:g.ids.map(id=>({...g,ids:[id]})));
   return commandGroups.filter(g=>trustAllows(m,c,faction,{type:'BATTLE_REINFORCEMENT',battle_id:b.id,origin:g.origin,ids:g.ids})).map(g=>{const projected=copy(m);if(g.mode==='SEA')for(const id of g.ids){const a=projected.field_armies[id],before=Number(a?.manpower||0);if(a)a.manpower=before>0&&g.arrival>0?Math.max(1,Math.floor(before*g.arrival)):0;}return{...g,manpower:g.ids.reduce((n,id)=>n+Number(projected.field_armies[id]?.manpower||0),0),projected_ratio:dangerRatio(projected,c,b,faction,g.ids)};}).sort((a,b2)=>a.projected_ratio-b2.projected_ratio||b2.manpower-a.manpower||a.origin.localeCompare(b2.origin));
 }
 function projectedWithGroups(m,c,b,faction,groups,count){const projected=copy(m),selected=groups.slice(0,count);for(const g of selected)if(g.mode==='SEA')for(const id of g.ids){const a=projected.field_armies[id];if(a)a.manpower=Math.max(1,Math.floor(Number(a.manpower||0)*g.arrival));}return dangerRatio(projected,c,b,faction,selected.flatMap(g=>g.ids));}
 function minimumUsefulGroup(m,c,b,faction,g,target){
   if(g.ids.length<2)return g;
   const singles=g.ids.map(id=>{const projected=copy(m);if(g.mode==='SEA')projected.field_armies[id].manpower=Math.max(1,Math.floor(Number(projected.field_armies[id].manpower||0)*g.arrival));return{id,ratio:dangerRatio(projected,c,b,faction,[id])};}).filter(x=>x.ratio<=target&&trustAllows(m,c,faction,{type:'BATTLE_REINFORCEMENT',battle_id:b.id,origin:g.origin,ids:[x.id]})).sort((a,b)=>Number(m.field_armies[a.id].manpower)-Number(m.field_armies[b.id].manpower)||a.ratio-b.ratio);
   return singles.length?{...g,ids:[singles[0].id],projected_ratio:singles[0].ratio}:g;
 }

 function battleSupplyMonths(m,c,b,faction){
   if(!C||!cityConfig)return 99;
   const role=b.attacker_faction===faction?'attacker':'defender',id=role==='attacker'?b.origin_city_id:b.city_id,city=c.cities?.[id];if(!city)return 99;
   const totals=E.logisticsConsumptionTroopsByCity?.(m,phase)?.totals||{},local={...city,stationed_field_army_consumption_troops:totals[id]||0};
   const fm=C.monthlyBalance(local,'FOOD',cityConfig),mm=C.monthlyBalance(local,'MATERIALS',cityConfig),fs=Number(city.stockpile?.FOOD)||0,ms=Number(city.stockpile?.MATERIALS)||0;
   const months=(stock,net)=>net>=0?99:stock/Math.max(1,-net);return Math.min(months(fs,fm.net),months(ms,mm.net));
 }
 function safeWithdrawal(m,c,b,faction){
   const role=b.attacker_faction===faction?'attacker':'defender',reinf=new Set(role==='attacker'?(b.attacker_reinforcement_ids||[]):(b.defender_reinforcement_ids||[])),ids=(role==='attacker'?b.attacker_army_ids:b.defender_army_ids).filter(id=>!reinf.has(id)&&m.field_armies?.[id]);
   if(!ids.length)return null;
   try{return B.selectRetreatPlan(m,c,b,faction,E,ids,phase.battle_engine)||null;}catch{return null;}
 }
 function review(m,c,faction){
   const commands=Math.max(0,Number(m.factions?.[faction]?.commands_remaining)||0),battles=Object.values(m.battles||{}).filter(b=>[b.attacker_faction,b.defender_faction].includes(faction)&&['active','awaiting_continuation'].includes(b.status)&&(b.history||[]).length>0);
   if(!battles.length)return null;
   const assessed=battles.map(b=>{const ratio=dangerRatio(m,c,b,faction),chief=chiefIds(m,b,faction).length>0,morale=chiefMorale(m,b,faction),supplyMonths=battleSupplyMonths(m,c,b,faction),supplyCrisis=supplyMonths<.45&&ratio>1.02,supplyWarning=supplyMonths<1.05,clearAdvantage=ratio<=.82,severe=ratio>=1.30||(morale!==null&&morale<=28&&ratio>=1.15)||supplyCrisis,groups=reinforcementGroups(m,c,b,faction).filter(g=>g.mode!=='SEA'||g.arrival>=MIN_VOLUNTARY_SEA_ARRIVAL||(chief&&severe&&g.arrival>=MIN_CHIEF_RESCUE_SEA_ARRIVAL)),trigger=chief?.95:1.00,retreat=safeWithdrawal(m,c,b,faction),maxGroups=Math.min(commands,groups.length),bestPossible=maxGroups?projectedWithGroups(m,c,b,faction,groups,maxGroups):ratio;return{b,ratio,chief,morale,supplyMonths,supplyCrisis,supplyWarning,clearAdvantage,groups,severe,trigger,retreat,bestPossible};}).sort((x,y)=>(y.severe-x.severe)||(y.chief-x.chief)||(y.ratio-x.ratio)||x.b.id.localeCompare(y.b.id));
   for(const x of assessed){const b=x.b;
   // Logistics is a battle factor, not an automatic retreat switch. A clearly superior force may accept roughly one month of scarcity to finish the fight.
   if(x.clearAdvantage){
     if(commands>0&&x.groups.length&&x.ratio>=x.trigger){const g=minimumUsefulGroup(m,c,b,faction,x.groups[0],1.05);return{type:'BATTLE_REINFORCEMENT',battle_id:b.id,city:b.city_id,target:b.city_id,origin:g.origin,ids:g.ids,projected_ratio:g.projected_ratio,current_ratio:x.ratio,supply_months:x.supplyMonths,strategic_reason:'CONTINUATION_REINFORCE_ADVANTAGE'};}
     continue;
   }
   // A badly outmatched force, or a force that is both supply-collapsed and not winning, should not feed reinforcements indefinitely.
   if(x.severe){
     if(commands>0&&x.groups.length&&x.bestPossible<=1.20){const g=minimumUsefulGroup(m,c,b,faction,x.groups[0],1.20);return{type:'BATTLE_REINFORCEMENT',battle_id:b.id,city:b.city_id,target:b.city_id,origin:g.origin,ids:g.ids,projected_ratio:g.projected_ratio,current_ratio:x.ratio,strategic_reason:'CONTINUATION_REINFORCE_TO_STABILIZE'};}
     if(x.retreat&&trustAllows(m,c,faction,{type:'BATTLE_WITHDRAW',battle_id:b.id}))return{type:'BATTLE_WITHDRAW',battle_id:b.id,city:b.city_id,target:b.city_id,free_decision:true,current_ratio:x.ratio,projected_ratio:x.bestPossible,retreat_city_id:x.retreat.destination_city_id,supply_months:x.supplyMonths,strategic_reason:x.supplyCrisis?'CONTINUATION_WITHDRAW_SUPPLY_AND_ODDS':'CONTINUATION_WITHDRAW_UNSALVAGEABLE'};
     if(commands>0&&x.groups.length){const g=x.groups[0];return{type:'BATTLE_REINFORCEMENT',battle_id:b.id,city:b.city_id,target:b.city_id,origin:g.origin,ids:g.ids,projected_ratio:g.projected_ratio,current_ratio:x.ratio,strategic_reason:'CONTINUATION_REINFORCE_NO_RETREAT'};}
     continue;
   }
   // Ongoing battles are re-evaluated even below the crisis threshold. If the enemy is roughly equal or stronger,
   // or the commander-in-chief is exposed in a near-even battle, use adjacent reinforcement before normal strategy.
   if(commands>0&&x.groups.length&&x.ratio>=x.trigger){const g=minimumUsefulGroup(m,c,b,faction,x.groups[0],1.10);return{type:'BATTLE_REINFORCEMENT',battle_id:b.id,city:b.city_id,target:b.city_id,origin:g.origin,ids:g.ids,projected_ratio:g.projected_ratio,current_ratio:x.ratio,strategic_reason:'CONTINUATION_REINFORCE'};}
   }
   return null;
 }
 function patch(api,faction){
   if(!api||api.__continuationBattleAiV1)return;
   const originalChoose=api.chooseAction?.bind(api),originalExecute=api.executeNonBattle?.bind(api),originalAvailable=api.available?.bind(api);
   // A continuing battle consumes no command. Do not suppress the entire enemy
   // turn merely because ordinary command points have been exhausted.
   const enemyTurn=(m)=>m?.player_faction===opposite(faction)&&m?.current_faction===m.player_faction;
   const continuing=(m)=>Object.values(m?.battles||{}).some(b=>
     [b.attacker_faction,b.defender_faction].includes(faction)&&
     ['active','awaiting_continuation'].includes(b.status)&&(b.history||[]).length>0);
   const freeContinuation=(m)=>{
     const month=`${m.calendar?.year}-${String(m.calendar?.month||0).padStart(2,'0')}`;
     const battle=Object.values(m.battles||{}).find(b=>b.attacker_faction===faction&&
       b.status==='active'&&(b.history||[]).length>0&&b.last_resolution?.month!==month);
     return battle?{type:'CONTINUE',battle_id:battle.id,city:battle.city_id,target:battle.city_id,command_cost:0,strategic_reason:'CONTINUATION_FREE_MONTHLY_RESOLUTION'}:null;
   };
   api.available=function(m){return Boolean((originalAvailable&&originalAvailable(m))||(enemyTurn(m)&&continuing(m)));};
   api.continuationBattleReview=(m,c)=>review(m,c,faction);
   api.chooseAction=function(m,c,...args){
     const action=review(m,c,faction);if(action)return action;
     if(Number(m?.factions?.[faction]?.commands_remaining||0)<=0)return freeContinuation(m);
     return originalChoose?originalChoose(m,c,...args):null;
   };
   api.executeNonBattle=function(m,c,a,engines){
     if(a?.type==='BATTLE_REINFORCEMENT'){
       const out=B.reinforceBattle(m,a.battle_id,a.ids,c,E);
       return{military:out.state,cities:c,kind:'BATTLE_REINFORCEMENT',battle_id:a.battle_id,city_id:a.city,command_cost:1};
     }
     if(a?.type==='BATTLE_WITHDRAW'){
       const before=P?.militaryControl?P.militaryControl(m,a.city,politicalConfig):faction,out=B.withdrawBattle(m,a.battle_id,faction,c,E,phase);let next=out.state;
       if(out.withdrawn&&P?.militaryControl&&P?.recordCityControlTransition){const after=P.militaryControl(next,a.city,politicalConfig);next=P.recordCityControlTransition(next,c,a.city,faction,before,after,'AI_CONTINUATION_WITHDRAWAL',politicalConfig).state;}
       return{military:next,cities:c,kind:'BATTLE_WITHDRAW',battle_id:a.battle_id,city_id:a.city,withdrawn:out.withdrawn,withdrawal:out.withdrawal||null,command_cost:0};
     }
     return originalExecute?originalExecute(m,c,a,engines):{military:m,cities:c};
   };
   api.__continuationBattleAiV1=true;
 }
 patch(window.RoyalistAiTurn,'BRITISH');patch(window.PatriotAiTurn,'PATRIOT');
 window.__continuationBattleAiV1={version:'1.3-trust-survival',review,dangerRatio,reinforcementGroups,battleSupplyMonths};
})();
