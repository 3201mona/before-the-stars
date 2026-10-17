(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BattleEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const fail=code=>{throw new Error(code);};
  const opposite=faction=>faction==='PATRIOT'?'BRITISH':'PATRIOT';
  const round100=value=>Math.max(0,Math.round(value/10)*10);

  function commanderFactor(commander){
    const stats=commander?.stats||{};
    return clamp(1+(Number(stats.leadership||50)-50)*.0016+(Number(stats.tactics||50)-50)*.0022+(Number(stats.logistics||50)-50)*.0007,.82,1.18);
  }
  function appropriateManpower(commander,config){
    const rules=config.individual_command||{},leadership=Number(commander?.stats?.leadership||50);
    return Math.max(100,Math.round((Number(rules.appropriate_manpower_base)||1200)+leadership*(Number(rules.appropriate_manpower_per_leadership)||25)));
  }
  function battlefieldTacticsFactor(commander,config){
    if(!commander)return 1;
    const rules=config.individual_command||{},perPoint=Number(rules.battlefield_tactics_per_point)||.0012,min=Number(rules.battlefield_tactics_min)||.94,max=Number(rules.battlefield_tactics_max)||1.06;
    return clamp(1+(Number(commander.stats?.tactics||50)-50)*perPoint,min,max);
  }

  function moraleCombatState(morale,config,isAttacking=false){
    const m=clamp(Number(morale??50),0,100),rules=config.morale_combat||{};
    if(m<=Number(rules.routed??0))return{key:'routed',label:'潰走',factor:0,can_attack:false};
    if(m<=Number(rules.attack_stopped_max??9))return{key:'attack_stopped',label:'戦意喪失',factor:isAttacking?0:Number(rules.defense_attack_stopped_factor??.90),can_attack:false};
    if(m<=Number(rules.very_low_max??19))return{key:'very_low',label:'士気低迷',factor:Number(rules.very_low_factor??.92),can_attack:true};
    if(m<=Number(rules.low_max??39))return{key:'low',label:'士気低下',factor:Number(rules.low_factor??.96),can_attack:true};
    if(m<=Number(rules.normal_max??59))return{key:'normal',label:'平常',factor:1,can_attack:true};
    if(m<=Number(rules.good_max??79))return{key:'good',label:'士気良好',factor:Number(rules.good_factor??1.02),can_attack:true};
    if(m<=Number(rules.strong_max??89))return{key:'strong',label:'士気旺盛',factor:Number(rules.strong_factor??1.04),can_attack:true};
    return{key:'excellent',label:'士気最高',factor:Number(rules.excellent_factor??1.06),can_attack:true};
  }
  function armyIndividualPower(army,commander,config,isAttacking=false){
    const manpower=Number(army?.manpower||0);if(manpower<=0)return{base:0,adjusted:0,cap:0,eligible:0,command:1};
    const quality=qualityFactor(army),base=Math.pow(manpower,config.manpower_exponent)*quality,command=commanderFactor(commander),cap=appropriateManpower(commander,config),eligible=Math.min(manpower,cap),eligibleBase=Math.pow(eligible,config.manpower_exponent)*quality,moraleState=moraleCombatState(army.morale,config,isAttacking);
    return{base,adjusted:(base+eligibleBase*(command-1))*moraleState.factor,cap,eligible,command,morale_factor:moraleState.factor,morale_state:moraleState.key,can_attack:moraleState.can_attack};
  }
  function commanderRolePriority(commander){
    return({'総司令官':3,'方面軍司令官':2,'通常指揮官':1})[commander?.role]||0;
  }
  function selectBattlefieldLeader(state,armyIds){
    const commanderOrder=new Map(Object.keys(state.commanders||{}).map((id,index)=>[id,index]));
    return(armyIds||[]).filter(id=>state.field_armies?.[id]&&Number(state.field_armies[id].manpower||0)>0).sort((a,b)=>{
      const commanderA=state.commanders?.[state.field_armies[a].commander_id]||{},commanderB=state.commanders?.[state.field_armies[b].commander_id]||{};
      return commanderRolePriority(commanderB)-commanderRolePriority(commanderA)
        ||Number(commanderB.stats?.leadership||0)-Number(commanderA.stats?.leadership||0)
        ||Number(commanderB.stats?.tactics||0)-Number(commanderA.stats?.tactics||0)
        ||Number(commanderB.stats?.logistics||0)-Number(commanderA.stats?.logistics||0)
        ||(commanderOrder.get(commanderA?.id)??Number.MAX_SAFE_INTEGER)-(commanderOrder.get(commanderB?.id)??Number.MAX_SAFE_INTEGER);
    })[0]||null;
  }
  const selectDefenderLeader=selectBattlefieldLeader;
  function qualityFactor(force){
    return .70+Number(force.morale||0)/100*.15+Number(force.training||0)/100*.25+Number(force.equipment||0)/100*.20;
  }
  function weightedAverage(rows,key,fallback=50){
    const total=rows.reduce((sum,row)=>sum+Number(row.manpower||0),0);
    return total?rows.reduce((sum,row)=>sum+Number(row.manpower||0)*Number(row[key]??fallback),0)/total:fallback;
  }
  function forceSummary(state,armyIds,garrison,commanderId,config,cityImportance=1,isAttacking=false,allowEmpty=false){
    const armies=(armyIds||[]).map(id=>state.field_armies[id]).filter(Boolean);
    const rows=armies.map(army=>({...army}));
    if(garrison?.manpower>0)rows.push({id:garrison.id||'GARRISON',manpower:garrison.manpower,morale:garrison.morale??config.garrison_defaults.morale,training:garrison.training??config.garrison_defaults.training,equipment:garrison.equipment??config.garrison_defaults.equipment,is_garrison:true});
    const manpower=rows.reduce((sum,row)=>sum+Number(row.manpower||0),0);
    if(manpower<=0){if(!allowEmpty)fail('BATTLE_FORCE_EMPTY');return{army_ids:armies.map(a=>a.id),manpower:0,average:{morale:0,training:0,equipment:0},quality:0,command:1,battlefield_tactics:1,coordination:1,defense:1,commander_id:commanderId,commander_name:state.commanders?.[commanderId]?.name||'戦線離脱',garrison_manpower:0,individual_details:[]};}
    const average={morale:weightedAverage(rows,'morale'),training:weightedAverage(rows,'training'),equipment:weightedAverage(rows,'equipment')};
    const commander=state.commanders?.[commanderId]||null;
    const quality=qualityFactor(average);
    let individualBase=0,individualAdjusted=0;
    const individual_details=[];
    for(const army of armies){const armyCommander=state.commanders?.[army.commander_id]||null,detail=armyIndividualPower(army,armyCommander,config,isAttacking);individualBase+=detail.base;individualAdjusted+=detail.adjusted;individual_details.push({army_id:army.id,commander_id:army.commander_id,appropriate_manpower:detail.cap,eligible_manpower:detail.eligible,manpower:army.manpower,command_factor:detail.command,morale_factor:detail.morale_factor,morale_state:detail.morale_state,can_attack:detail.can_attack,base_power:detail.base,adjusted_power:detail.adjusted});}
    if(garrison?.manpower>0){const garrisonRow=rows.find(row=>row.is_garrison),base=Math.pow(garrison.manpower,config.manpower_exponent)*qualityFactor(garrisonRow),moraleState=moraleCombatState(garrisonRow.morale,config,false);individualBase+=base;individualAdjusted+=base*moraleState.factor;individual_details.push({army_id:garrison.id||'GARRISON',commander_id:null,appropriate_manpower:0,eligible_manpower:0,manpower:garrison.manpower,command_factor:1,morale_factor:moraleState.factor,morale_state:moraleState.key,base_power:base,adjusted_power:base*moraleState.factor,is_garrison:true});}
    const individualCommand=individualBase>0?individualAdjusted/individualBase:1;
    const battlefieldTactics=battlefieldTacticsFactor(commander,config);
    const garrisonShare=rows.filter(row=>row.is_garrison).reduce((sum,row)=>sum+row.manpower,0)/manpower;
    const defense=1+garrisonShare*(config.garrison_defense_base+(Math.max(1,cityImportance)-1)*config.garrison_defense_per_star);
    const coordination=Number(config.coordination_modifier)||1;
    return{army_ids:armies.map(a=>a.id),manpower,average,quality,command:individualCommand,battlefield_tactics:battlefieldTactics,coordination,defense,commander_id:commanderId,commander_name:commander?.name||'都市守備隊',garrison_manpower:garrison?.manpower||0,individual_details};
  }
  function tacticRecord(config,id){return config.tactics[id]||config.tactics.normal_attack;}
  function basePower(summary,config,isDefender=false){return Math.pow(summary.manpower,config.manpower_exponent)*summary.quality*summary.command*(summary.battlefield_tactics||1)*(summary.coordination??config.coordination_modifier??1)*(isDefender?summary.defense:1);}
  function chooseEnemyTactic(attacker,defender,config){
    const ratio=basePower(defender,config,true)/basePower(attacker,config,false);
    if(ratio<.78)return'hold_line';
    if(ratio>1.38)return'all_out_attack';
    if(ratio>1.08)return'war_of_attrition';
    return'hold_line';
  }
  function nextBattleId(state){
    const prefix=`BTL_${state.calendar.year}_${String(state.calendar.month).padStart(2,'0')}_`;
    const used=Object.keys(state.battles||{}).filter(id=>id.startsWith(prefix)).length+1;
    return`${prefix}${String(used).padStart(3,'0')}`;
  }
  function prepareBattle(state,args,cityState,phaseConfig){
    const config=phaseConfig.battle_engine;
    if(!config)fail('BATTLE_CONFIG_MISSING');
    const attackerIds=[...new Set(args.attacker_army_ids||[])],first=state.field_armies?.[attackerIds[0]];
    if(!first||!attackerIds.length)fail('ATTACKER_REQUIRED');
    if(attackerIds.some(id=>state.field_armies?.[id]?.faction!==first.faction))fail('ATTACKER_FACTION_MISMATCH');
    const origin=cityState?.cities?.[args.origin_city_id],city=cityState?.cities?.[args.city_id];
    if(!origin||!city)fail('BATTLE_CITY_INVALID');
    if(args.origin_city_id===args.city_id)fail('BATTLE_ROUTE_INVALID');
    if(Object.values(state.battles||{}).some(b=>b.city_id===args.city_id&&['awaiting_tactic','active','awaiting_continuation'].includes(b.status)))fail('BATTLE_CITY_ALREADY_ENGAGED');
    for(const id of attackerIds){const army=state.field_armies?.[id];if(!army)fail('ARMY_NOT_FOUND');if(army.location_city_id!==args.origin_city_id)fail('ATTACKER_ORIGIN_MISMATCH');if(army.battle_id)fail('ARMY_IN_OTHER_BATTLE');}
    const route=args.route_type==='ATTACK'?'LAND_ATTACK':args.route_type||'LAND_ATTACK',edges=cityState.topology?.edges||[];
    if(route==='LAND_ATTACK'){
      const adjacent=edges.some(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&((e.a===args.origin_city_id&&e.b===args.city_id)||(e.b===args.origin_city_id&&e.a===args.city_id)));
      if(!adjacent)fail('BATTLE_LAND_ROUTE_INVALID');
    }else if(route==='LANDING_ATTACK'){
      const naval=(typeof globalThis!=='undefined'?globalThis.NavalControlEngine:null);
      if(!origin.geography?.is_port||!origin.geography?.sea_zone_id||!naval?.isPortOperational?.(origin))fail('BATTLE_LANDING_ORIGIN_PORT_INVALID');
      if(!city.geography?.is_coastal||!city.geography?.sea_zone_id)fail('BATTLE_LANDING_TARGET_INVALID');
    }else fail('BATTLE_ROUTE_INVALID');
    const defenderFaction=opposite(first.faction);
    const defenderIds=Object.values(state.field_armies||{}).filter(a=>a.location_city_id===args.city_id&&a.faction===defenderFaction&&a.manpower>0&&!a.battle_id).map(a=>a.id);
    const garrison=state.garrisons?.[args.city_id];
    const activeGarrison=garrison?.faction===defenderFaction&&garrison.manpower>0?garrison:null;
    if(!defenderIds.length&&!activeGarrison)fail('DEFENDER_REQUIRED');
    const attackerLeader=args.leader_army_id&&attackerIds.includes(args.leader_army_id)?args.leader_army_id:attackerIds[0];
    const defenderLeader=selectDefenderLeader(state,defenderIds);
    const startMinimum=Number(config.attack_start_minimum_manpower??100);
    if(attackerIds.some(id=>Number(state.field_armies?.[id]?.manpower||0)<startMinimum))fail('BATTLE_ATTACK_MANPOWER_TOO_LOW');
    if(attackerIds.some(id=>Number(state.field_armies?.[id]?.morale??0)<10))fail('BATTLE_ATTACK_MORALE_TOO_LOW');
    const garrisonInitialMorale=Number(config.garrison_defaults?.morale??60),battleGarrison=activeGarrison?{...activeGarrison,morale:garrisonInitialMorale}:null,garrisonOnlyDefense=Boolean(activeGarrison&&!defenderIds.length);
    const attacker=forceSummary(state,attackerIds,null,state.field_armies[attackerLeader].commander_id,config,city.politics?.political_importance||1,true);
    const defender=forceSummary(state,defenderIds,battleGarrison,defenderLeader?state.field_armies[defenderLeader].commander_id:null,config,city.politics?.political_importance||1,false);
    const id=nextBattleId(state),next=copy(state);
    next.battles[id]={id,city_id:args.city_id,origin_city_id:args.origin_city_id,status:'awaiting_tactic',started_by_faction:first.faction,attacker_faction:first.faction,defender_faction:defenderFaction,attacker_army_ids:attackerIds,defender_army_ids:defenderIds,attacker_leader_army_id:attackerLeader,defender_leader_army_id:defenderLeader,garrison_id:activeGarrison?.id||null,garrison_only_defense:garrisonOnlyDefense,garrison_morale:activeGarrison?garrisonInitialMorale:null,battlefield_commander:{[first.faction]:attacker.commander_id,[defenderFaction]:defender.commander_id},result_band:null,tactic:{[first.faction]:null,[defenderFaction]:garrisonOnlyDefense?'garrison_defense':chooseEnemyTactic(attacker,defender,config)},started_month:`${state.calendar.year}-${String(state.calendar.month).padStart(2,'0')}`,continued_months:0,calculation_status:'READY',history:[],route_type:route};
    for(const armyId of attackerIds)if(next.field_armies[armyId]){next.field_armies[armyId].battle_id=id;next.field_armies[armyId].supply_city_id=args.origin_city_id;}
    for(const armyId of defenderIds)if(next.field_armies[armyId]){next.field_armies[armyId].battle_id=id;next.field_armies[armyId].supply_city_id=args.city_id;}
    return{state:next,battle:copy(next.battles[id]),attacker,defender};
  }
  function randomValue(state,armyEngine){const out=armyEngine.nextRandom(state);return out;}
  function resultBand(ratio,config){
    const t=config.result_thresholds;
    if(ratio>=t.major_victory)return'major_victory';
    if(ratio>=t.victory)return'victory';
    if(ratio>=t.advantage)return'advantage';
    if(ratio>=t.even)return'even';
    if(ratio>=t.defeat)return'disadvantage';
    if(ratio>=t.major_defeat)return'defeat';
    return'major_defeat';
  }
  function lossBandForSide(band,side){
    const attacker=['major_victory','victory','advantage','even','disadvantage','defeat','major_defeat'].indexOf(band);
    return side==='attacker'?attacker:6-attacker;
  }
  function distributeArmyLosses(next,ids,totalLoss){
    const existing=ids.map(id=>next.field_armies[id]).filter(Boolean),total=existing.reduce((sum,a)=>sum+a.manpower,0);let assigned=0;const details=[];
    existing.forEach((army,index)=>{const loss=index===existing.length-1?Math.min(army.manpower,totalLoss-assigned):Math.min(army.manpower,round100(totalLoss*army.manpower/total));assigned+=loss;army.manpower=Math.max(0,army.manpower-loss);details.push({army_id:army.id,loss,remaining:army.manpower});});
    return details;
  }
  function moraleDelta(index,lossRate,config){return config.morale_delta[index]-(lossRate>=.22?config.heavy_loss_morale_penalty:0);}
  function applyMorale(next,ids,delta){for(const id of ids){const army=next.field_armies[id];if(army)army.morale=clamp(Math.round(army.morale+delta),0,100);}}
  function markCommanderWithoutArmy(next,army,status){const commander=next.commanders?.[army.commander_id];if(commander){commander.assigned_army_id=null;commander.status=status;}}
  function armyRemovalRecord(next,army,reason){const commander=next.commanders?.[army.commander_id];return{army_id:army.id,army_name:army.name||army.id,commander_id:army.commander_id,commander_name:commander?.name||army.commander_id,faction:army.faction,reason};}
  function retreatConfig(config={}){return{attacker_safe_origin_arrival_rate:1,friendly_land_arrival_rate:1,uncontrolled_land_arrival_rate:.90,allow_uncontrolled_land:true,allow_uncontrolled_port:true,...(config?.retreat||config||{})};}
  function landRetreatNeighbors(cityState,cityId){const ids=[];for(const edge of cityState.topology?.edges||[]){if(String(edge.type||'').startsWith('water_'))continue;if(edge.a===cityId)ids.push(edge.b);else if(edge.b===cityId)ids.push(edge.a);}return[...new Set(ids)];}
  function retreatDestinationStatus(state,id,loserFaction,excludedArmyIds=[],battleId=null){
    const excluded=new Set(excludedArmyIds),present=new Set();let friendlyArmyPresent=false;
    for(const army of Object.values(state.field_armies||{})){
      if(excluded.has(army.id)||army.location_city_id!==id||Number(army.manpower||0)<=0)continue;
      const deployed=army.battle_id&&state.battles?.[army.battle_id]&&['awaiting_tactic','active','awaiting_continuation'].includes(state.battles[army.battle_id].status)&&state.battles[army.battle_id].city_id!==id;
      if(deployed)continue;
      present.add(army.faction);if(army.faction===loserFaction)friendlyArmyPresent=true;
    }
    const garrison=state.garrisons?.[id],friendlyGarrisonPresent=Boolean(garrison?.faction===loserFaction&&Number(garrison?.manpower||0)>=100);if(garrison?.faction&&Number(garrison?.manpower||0)>=100)present.add(garrison.faction);
    const activeBattle=Object.values(state.battles||{}).some(entry=>entry.id!==battleId&&entry.city_id===id&&['active','awaiting_tactic','awaiting_continuation'].includes(entry.status));
    // A reinforcement may return to its origin when this battle ends. Do not allow
    // the other faction to withdraw to a city which will then receive that army.
    // This is a reservation, not a change to military/political control.
    const pendingEnemyReturn=Object.values(state.battles||{}).some(entry=>
      entry.id===battleId&&['active','awaiting_tactic','awaiting_continuation'].includes(entry.status)&&
      Object.entries(entry.reinforcement_origins||{}).some(([armyId,meta])=>{
        const army=state.field_armies?.[armyId];
        return meta?.origin_city_id===id&&army?.battle_id===entry.id&&
          Number(army.manpower||0)>0&&army.faction!==loserFaction;
      })
    );
    const control=activeBattle||present.size>1?'CONFLICT':present.size===1?[...present][0]:'UNCONTROLLED';
    return{control,friendlyArmyPresent,friendlyGarrisonPresent,pending_enemy_return:pendingEnemyReturn,eligible:!pendingEnemyReturn&&(control===loserFaction||control==='UNCONTROLLED')};
  }
  function retreatSortRecord(state,cityState,id,loserFaction,excludedArmyIds=[],options={}){
    const city=cityState.cities[id],registrationOrder=new Map(Object.keys(cityState.cities||{}).map((cityId,index)=>[cityId,index])),status=retreatDestinationStatus(state,id,loserFaction,excludedArmyIds,options.battle_id||null);
    return{id,destination_city_id:id,mode:options.mode||'LAND',route_class:options.route_class||(status.control===loserFaction?'FRIENDLY':'UNCONTROLLED'),destination_control:status.control,friendlyArmyPresent:status.friendlyArmyPresent,friendlyGarrisonPresent:status.friendlyGarrisonPresent,arrival_rate:Number(options.arrival_rate??1),food:Number(city?.stockpile?.FOOD)||0,materials:Number(city?.stockpile?.MATERIALS)||0,stars:Number(city?.politics?.political_importance)||0,order:registrationOrder.get(id)??Number.MAX_SAFE_INTEGER,zone_id:options.zone_id||null,stage:options.stage||null};
  }
  function sortRetreatRoutes(routes){return[...routes].sort((a,b)=>Number(b.return_to_origin)-Number(a.return_to_origin)||b.arrival_rate-a.arrival_rate||Number(b.friendlyArmyPresent)-Number(a.friendlyArmyPresent)||Number(b.friendlyGarrisonPresent)-Number(a.friendlyGarrisonPresent)||Number(b.mode==='LAND')-Number(a.mode==='LAND')||b.food-a.food||b.materials-a.materials||b.stars-a.stars||a.order-b.order);}
  function buildLandRetreatRoutes(state,cityState,battle,loserFaction,excludedArmyIds=[],config={}){
    const rules=retreatConfig(config),routes=[];
    for(const id of landRetreatNeighbors(cityState,battle.city_id)){
      const status=retreatDestinationStatus(state,id,loserFaction,excludedArmyIds,battle.id);if(!status.eligible)continue;
      if(status.control==='UNCONTROLLED'&&!rules.allow_uncontrolled_land)continue;
      const arrivalRate=status.control===loserFaction?rules.friendly_land_arrival_rate:rules.uncontrolled_land_arrival_rate;
      routes.push(retreatSortRecord(state,cityState,id,loserFaction,excludedArmyIds,{mode:'LAND',route_class:status.control===loserFaction?'FRIENDLY_LAND':'UNCONTROLLED_LAND',arrival_rate:arrivalRate,battle_id:battle.id}));
    }
    return routes;
  }
  function buildSeaRetreatRoutes(state,cityState,battle,loserFaction,excludedArmyIds=[],config={}){
    const rules=retreatConfig(config),naval=(typeof globalThis!=='undefined'?globalThis.NavalControlEngine:null),origin=cityState.cities?.[battle.city_id];
    if(!naval?.seaRouteProfile||!naval?.isPortOperational||!origin?.geography?.is_port||!origin.geography?.sea_zone_id||!naval.isPortOperational(origin))return[];
    const periodKey=`${state.calendar?.year||1775}-${String(state.calendar?.month||6).padStart(2,'0')}`,routes=[];
    for(const city of Object.values(cityState.cities||{})){
      if(city.city_id===battle.city_id||!city.geography?.is_port||!city.geography?.sea_zone_id||!naval.isPortOperational(city))continue;
      const status=retreatDestinationStatus(state,city.city_id,loserFaction,excludedArmyIds,battle.id);if(!status.eligible)continue;if(status.control==='UNCONTROLLED'&&!rules.allow_uncontrolled_port)continue;
      const profile=naval.seaRouteProfile(cityState,origin.geography.sea_zone_id,city.geography.sea_zone_id,loserFaction,'SEA_RETREAT',periodKey);
      routes.push(retreatSortRecord(state,cityState,city.city_id,loserFaction,excludedArmyIds,{mode:'SEA',route_class:status.control===loserFaction?'FRIENDLY_SEA':'UNCONTROLLED_SEA',arrival_rate:profile.arrival_rate,zone_id:profile.worst_zone_id,stage:profile.worst_stage,battle_id:battle.id}));
    }
    return routes;
  }
  function selectRetreatCity(state,cityState,battle,loserFaction,armyEngine,excludedArmyIds=[],config={}){return sortRetreatRoutes(buildLandRetreatRoutes(state,cityState,battle,loserFaction,excludedArmyIds,config))[0]?.destination_city_id||null;}
  function selectRetreatPlan(state,cityState,battle,loserFaction,armyEngine,excludedArmyIds=[],config={}){
    const rules=retreatConfig(config),naval=(typeof globalThis!=='undefined'?globalThis.NavalControlEngine:null),periodKey=`${state.calendar?.year||1775}-${String(state.calendar?.month||6).padStart(2,'0')}`;
    if(loserFaction===battle.attacker_faction&&battle.origin_city_id){
      const originStatus=retreatDestinationStatus(state,battle.origin_city_id,loserFaction,excludedArmyIds,battle.id),originCity=cityState.cities?.[battle.origin_city_id],battleCity=cityState.cities?.[battle.city_id];
      if(originStatus.eligible){
        if(battle.route_type==='LANDING_ATTACK'){
          if(naval?.seaRouteProfile&&naval?.isPortOperational?.(originCity)&&battleCity?.geography?.sea_zone_id&&originCity?.geography?.sea_zone_id){const profile=naval.seaRouteProfile(cityState,battleCity.geography.sea_zone_id,originCity.geography.sea_zone_id,loserFaction,'SEA_RETREAT',periodKey);return{...retreatSortRecord(state,cityState,battle.origin_city_id,loserFaction,excludedArmyIds,{mode:'SEA',route_class:'ATTACKER_ORIGIN_SEA',arrival_rate:profile.arrival_rate,zone_id:profile.worst_zone_id,stage:profile.worst_stage,battle_id:battle.id}),success:true,return_to_origin:true};}
        }else return{...retreatSortRecord(state,cityState,battle.origin_city_id,loserFaction,excludedArmyIds,{mode:'LAND',route_class:'ATTACKER_ORIGIN',arrival_rate:rules.attacker_safe_origin_arrival_rate,battle_id:battle.id}),success:true,return_to_origin:true};
      }
    }
    let routes=[...buildLandRetreatRoutes(state,cityState,battle,loserFaction,excludedArmyIds,rules),...buildSeaRetreatRoutes(state,cityState,battle,loserFaction,excludedArmyIds,rules)];
    if(loserFaction===battle.attacker_faction&&battle.route_type==='LANDING_ATTACK'&&naval?.seaRouteProfile){
      const battleCity=cityState.cities?.[battle.city_id],startZone=battleCity?.geography?.sea_zone_id;
      if(startZone)for(const city of Object.values(cityState.cities||{})){
        if(!city.geography?.is_port||!city.geography?.sea_zone_id||!naval.isPortOperational?.(city))continue;
        const status=retreatDestinationStatus(state,city.city_id,loserFaction,excludedArmyIds,battle.id);if(!status.eligible)continue;if(status.control==='UNCONTROLLED'&&!rules.allow_uncontrolled_port)continue;
        const profile=naval.seaRouteProfile(cityState,startZone,city.geography.sea_zone_id,loserFaction,'SEA_RETREAT',periodKey);
        routes.push(retreatSortRecord(state,cityState,city.city_id,loserFaction,excludedArmyIds,{mode:'SEA',route_class:status.control===loserFaction?'EXPEDITIONARY_SEA':'EXPEDITIONARY_UNCONTROLLED_SEA',arrival_rate:profile.arrival_rate,zone_id:profile.worst_zone_id,stage:profile.worst_stage,battle_id:battle.id}));
      }
    }
    const selected=sortRetreatRoutes(routes)[0];return selected?{...selected,success:true}:null;
  }
  function resolveRetreatPlanRisk(state,plan){return{state,plan:plan?{...plan,success:true,intercepted:false,roll:null}:plan};}
  function applyRetreatPlan(next,ids,plan){
    const rate=clamp(Number(plan?.arrival_rate??1),0,1),loss_details=[];let transit_loss=0;
    for(const id of ids){const army=next.field_armies?.[id];if(!army)continue;const before=Math.max(0,Math.floor(Number(army.manpower)||0)),after=before>0&&rate>0?Math.max(1,Math.floor(before*rate)):0,lost=before-after;army.manpower=after;army.location_city_id=plan.destination_city_id;army.acted_this_month=true;transit_loss+=lost;loss_details.push({army_id:id,before,after,lost});}
    return{arrival_rate:rate,transit_loss,loss_details};
  }
  function removeCollapsedArmiesWithCommanderRisk(next,ids,reason,config,armyEngine){
    const removed=[],incidents=[];let current=next;
    const chances=config.commander_incident?.battle_collapse||{killed:.06,captured:.18};
    for(const id of ids){
      const army=current.field_armies?.[id];if(!army)continue;
      const collapsed=reason==='MORALE_ROUT'?Number(army.morale||0)<=0:Number(army.manpower||0)<=0;if(!collapsed)continue;
      const record=armyRemovalRecord(current,army,reason);let roll=randomValue(current,armyEngine);current=roll.state;const value=roll.value;let kind=null;
      if(value<Number(chances.killed||0))kind='KILLED';else if(value<Number(chances.killed||0)+Number(chances.captured||0))kind='CAPTURED';
      if(kind){record.commander_incident=kind;incidents.push({...record,kind});markCommanderWithoutArmy(current,army,kind);}
      else markCommanderWithoutArmy(current,army,reason==='MORALE_ROUT'?'INACTIVE_ROUTED':'INACTIVE_UNIT_LOST');
      removed.push(record);delete current.field_armies[id];
    }
    return{state:current,removed,incidents};
  }

  function removeNoRetreatArmiesWithCommanderRisk(next,ids,config,armyEngine){
    const removed=[],incidents=[];let current=next;
    const chances=config.commander_incident?.battle_collapse||{killed:.06,captured:.18};
    for(const id of ids){
      const army=current.field_armies?.[id];if(!army)continue;
      const record=armyRemovalRecord(current,army,'NO_RETREAT');let roll=randomValue(current,armyEngine);current=roll.state;const value=roll.value;let kind=null;
      if(value<Number(chances.killed||0))kind='KILLED';else if(value<Number(chances.killed||0)+Number(chances.captured||0))kind='CAPTURED';
      if(kind){record.commander_incident=kind;incidents.push({...record,kind});markCommanderWithoutArmy(current,army,kind);}else markCommanderWithoutArmy(current,army,'INACTIVE_ROUTED');
      removed.push(record);delete current.field_armies[id];
    }
    return{state:current,removed,incidents};
  }
  function reinforcementIds(battle,role){return [...new Set((role==='attacker'?battle.attacker_reinforcement_ids:battle.defender_reinforcement_ids)||[])];}
  function reinforcementOriginMap(battle){battle.reinforcement_origins ||= {};return battle.reinforcement_origins;}
  function canLeadJointReinforcement(state,armyIds){
    return (armyIds||[]).some(id=>commanderRolePriority(state.commanders?.[state.field_armies?.[id]?.commander_id])>=2);
  }
  function reinforceBattle(state,battleId,armyIds,cityState,armyEngine){
    const battle=state.battles?.[battleId];if(!battle||!['active','awaiting_continuation'].includes(battle.status)||(battle.history||[]).length<1)fail('BATTLE_NOT_REINFORCEABLE');
    const ids=[...new Set(armyIds||[])];if(!ids.length)fail('REINFORCEMENT_EMPTY');
    const first=state.field_armies?.[ids[0]];if(!first)fail('ARMY_NOT_FOUND');const faction=first.faction,originCityId=first.location_city_id;
    if(![battle.attacker_faction,battle.defender_faction].includes(faction))fail('REINFORCEMENT_FACTION_INVALID');
    const edges=cityState.topology?.edges||[],landAdjacent=(a,b)=>edges.some(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a))),origin=cityState.cities?.[originCityId],target=cityState.cities?.[battle.city_id],naval=(typeof globalThis!=='undefined'?globalThis.NavalControlEngine:null),periodKey=`${state.calendar?.year||1775}-${String(state.calendar?.month||6).padStart(2,'0')}`;
    let routeMode='LAND',routeProfile=null;
    if(!landAdjacent(originCityId,battle.city_id)){
      if(!naval?.seaRouteProfile||!naval?.isPortOperational?.(origin)||!target?.geography?.is_coastal||!origin?.geography?.sea_zone_id||!target.geography?.sea_zone_id)fail('REINFORCEMENT_NOT_ADJACENT');
      routeMode='SEA';routeProfile=naval.seaRouteProfile(cityState,origin.geography.sea_zone_id,target.geography.sea_zone_id,faction,'SEA_TRANSPORT',periodKey);
    }
    for(const id of ids){const army=state.field_armies?.[id];if(!army)fail('ARMY_NOT_FOUND');if(army.faction!==faction)fail('REINFORCEMENT_FACTION_INVALID');if(army.location_city_id!==originCityId)fail('REINFORCEMENT_ORIGIN_MISMATCH');if(army.acted_this_month)fail('ARMY_ALREADY_ACTED');if(army.battle_id)fail('ARMY_IN_OTHER_BATTLE');if(Number(army.manpower||0)<50||Number(army.morale||0)<10)fail('REINFORCEMENT_NOT_COMBAT_CAPABLE');}
    if(ids.length>1&&!canLeadJointReinforcement(state,ids))fail('REINFORCEMENT_JOINT_LEADER_REQUIRED');
    let next;if(armyEngine?.spendCommand)next=armyEngine.spendCommand(state,faction,'BATTLE_REINFORCEMENT',1);else{next=copy(state);if((Number(next.factions?.[faction]?.commands_remaining)||0)<1)fail('COMMANDS_EXHAUSTED');next.factions[faction].commands_remaining-=1;}
    const live=next.battles[battleId],added=[],transit=[];live.attacker_reinforcement_ids ||= [];live.defender_reinforcement_ids ||= [];live.reinforcement_origins ||= {};
    for(const id of ids){const army=next.field_armies[id],role=army.faction===live.attacker_faction?'attacker':'defender',originId=army.location_city_id,key=role==='attacker'?'attacker_army_ids':'defender_army_ids',rkey=role==='attacker'?'attacker_reinforcement_ids':'defender_reinforcement_ids',before=Number(army.manpower||0);let after=before;
      if(routeMode==='SEA'){after=before>0&&routeProfile.arrival_rate>0?Math.max(1,Math.floor(before*routeProfile.arrival_rate)):0;army.manpower=after;}
      live.reinforcement_origins[id]={army_id:id,commander_id:army.commander_id||null,origin_city_id:originId,battle_role:role,joined_turn:next.turn??null,joined_month:next.calendar?.month??null,route_mode:routeMode,arrival_rate:routeMode==='SEA'?routeProfile.arrival_rate:1,worst_zone_id:routeProfile?.worst_zone_id||null};
      if(!live[rkey].includes(id))live[rkey].push(id);if(!live[key].includes(id))live[key].push(id);
      army.acted_this_month=true;army.battle_id=battleId;army.supply_city_id=originId;army.reinforcement_role=role;army.reinforcement_route_mode=routeMode;if(routeMode!=='SEA')delete army.sea_supply_blockaded;added.push(id);transit.push({army_id:id,before,after,lost:before-after,route_mode:routeMode});
    }
    const aIds=live.attacker_army_ids.filter(id=>next.field_armies?.[id]),dIds=live.defender_army_ids.filter(id=>next.field_armies?.[id]),aLead=selectBattlefieldLeader(next,aIds),dLead=selectBattlefieldLeader(next,dIds);live.attacker_leader_army_id=aLead;live.defender_leader_army_id=dLead;live.battlefield_commander={[live.attacker_faction]:aLead?next.field_armies[aLead]?.commander_id:null,[live.defender_faction]:dLead?next.field_armies[dLead]?.commander_id:null};
    armyEngine?.appendAction?.(next,{type:'BATTLE_REINFORCEMENT',battle_id:battleId,army_ids:added,origin_city_id:originCityId,command_cost:1,route_mode:routeMode,arrival_rate:routeMode==='SEA'?routeProfile.arrival_rate:1,transit});return{state:next,battle:copy(live),added_army_ids:added,command_cost:1,route_mode:routeMode,arrival_rate:routeMode==='SEA'?routeProfile.arrival_rate:1,transit};
  }
  function reinforcementReturnPlan(state,cityState,battle,armyId,config){
    const army=state.field_armies?.[armyId],meta=battle.reinforcement_origins?.[armyId];if(!army||!meta)return null;const origin=meta.origin_city_id,status=retreatDestinationStatus(state,origin,army.faction,[armyId],battle.id),edges=cityState.topology?.edges||[],adj=edges.some(e=>!String(e.type||'').startsWith('water_')&&e.counts_as_land_adjacency!==false&&((e.a===battle.city_id&&e.b===origin)||(e.a===origin&&e.b===battle.city_id))),naval=(typeof globalThis!=='undefined'?globalThis.NavalControlEngine:null),periodKey=`${state.calendar?.year||1775}-${String(state.calendar?.month||6).padStart(2,'0')}`;
    if(meta.route_mode==='SEA'&&naval?.seaRouteProfile){const battleCity=cityState.cities?.[battle.city_id],originCity=cityState.cities?.[origin];if(status.eligible&&naval.isPortOperational?.(originCity)&&battleCity?.geography?.sea_zone_id&&originCity?.geography?.sea_zone_id){const profile=naval.seaRouteProfile(cityState,battleCity.geography.sea_zone_id,originCity.geography.sea_zone_id,army.faction,'SEA_RETREAT',periodKey);return{...retreatSortRecord(state,cityState,origin,army.faction,[armyId],{mode:'SEA',route_class:'REINFORCEMENT_ORIGIN_SEA',arrival_rate:profile.arrival_rate,zone_id:profile.worst_zone_id,stage:profile.worst_stage,battle_id:battle.id}),success:true,return_to_origin:true};}
      const routes=[];if(battleCity?.geography?.sea_zone_id)for(const city of Object.values(cityState.cities||{})){if(!city.geography?.is_port||!city.geography?.sea_zone_id||!naval.isPortOperational?.(city))continue;const st=retreatDestinationStatus(state,city.city_id,army.faction,[armyId],battle.id);if(!st.eligible)continue;const p=naval.seaRouteProfile(cityState,battleCity.geography.sea_zone_id,city.geography.sea_zone_id,army.faction,'SEA_RETREAT',periodKey);routes.push(retreatSortRecord(state,cityState,city.city_id,army.faction,[armyId],{mode:'SEA',route_class:'REINFORCEMENT_FALLBACK_SEA',arrival_rate:p.arrival_rate,zone_id:p.worst_zone_id,stage:p.worst_stage,battle_id:battle.id}));}return sortRetreatRoutes(routes)[0]||null;
    }
    if(adj&&status.eligible)return{...retreatSortRecord(state,cityState,origin,army.faction,[armyId],{mode:'LAND',route_class:'REINFORCEMENT_ORIGIN',arrival_rate:1,battle_id:battle.id}),success:true,return_to_origin:true};
    const fallbackBattle={...battle,origin_city_id:null};return selectRetreatPlan(state,cityState,fallbackBattle,army.faction,null,[armyId],config)||null;
  }
  function returnReinforcements(next,cityState,battle,role,config,armyEngine,destroyed,incidents){
    const moves=[];for(const id of reinforcementIds(battle,role)){const army=next.field_armies?.[id];if(!army)continue;const meta=battle.reinforcement_origins?.[id],plan=reinforcementReturnPlan(next,cityState,battle,id,config);if(plan){const tr=applyRetreatPlan(next,[id],plan);moves.push({army_id:id,role,battle_role:role,origin_city_id:meta?.origin_city_id||null,destination_city_id:plan.destination_city_id,route_class:plan.route_class,transit_loss:tr.transit_loss});}else{const trapped=removeNoRetreatArmiesWithCommanderRisk(next,[id],config,armyEngine);next=trapped.state;destroyed.push(...trapped.removed);incidents.push(...trapped.incidents);moves.push({army_id:id,role,battle_role:role,origin_city_id:meta?.origin_city_id||null,destination_city_id:null,route_class:'NO_RETREAT'});}if(next.field_armies?.[id]){next.field_armies[id].battle_id=null;delete next.field_armies[id].supply_city_id;delete next.field_armies[id].reinforcement_role;delete next.field_armies[id].reinforcement_route_mode;delete next.field_armies[id].sea_supply_blockaded;delete next.field_armies[id].sea_supply_blockaded_port_id;}}
    return{state:next,moves};
  }
  function commanderIncidents(next,ids,band,config,armyEngine){
    if(!['defeat','major_defeat'].includes(band))return{state:next,incidents:[]};
    const chances=config.commander_incident[band],incidents=[];let current=next;
    for(const id of ids){const army=current.field_armies[id];if(!army)continue;let roll=randomValue(current,armyEngine);current=roll.state;const value=roll.value;let kind=null;if(value<chances.killed)kind='KILLED';else if(value<chances.killed+chances.captured)kind='CAPTURED';if(!kind)continue;const commander=current.commanders[army.commander_id];incidents.push({army_id:id,army_name:army.name||id,faction:army.faction,commander_id:army.commander_id,commander_name:commander?.name||army.commander_id,kind});markCommanderWithoutArmy(current,army,kind);delete current.field_armies[id];}
    return{state:current,incidents};
  }
  function resolveBattle(state,battleId,playerTactic,cityState,phaseConfig,armyEngine,defenderTactic=null){
    const config=phaseConfig.battle_engine,battle=state.battles?.[battleId];if(!battle||!['awaiting_tactic','active'].includes(battle.status))fail('BATTLE_NOT_RESOLVABLE');
    const sourceGarrison=state.garrisons?.[battle.city_id],garrisonOnlyDefense=Boolean(sourceGarrison?.faction===battle.defender_faction&&Number(sourceGarrison.manpower||0)>0&&!battle.defender_army_ids.some(id=>Number(state.field_armies?.[id]?.manpower||0)>0)),effectiveDefenderTactic=garrisonOnlyDefense?'garrison_defense':defenderTactic;
    if(!config.tactics[playerTactic]||(effectiveDefenderTactic!==null&&!config.tactics[effectiveDefenderTactic]))fail('BATTLE_TACTIC_INVALID');
    if(config.tactics[playerTactic]?.garrison_only)fail('BATTLE_ATTACKER_GARRISON_TACTIC_INVALID');
    let next=copy(state);next.battles[battleId].garrison_only_defense=garrisonOnlyDefense;next.battles[battleId].tactic[battle.attacker_faction]=playerTactic;if(garrisonOnlyDefense)next.battles[battleId].tactic[battle.defender_faction]='garrison_defense';else if(effectiveDefenderTactic!==null)next.battles[battleId].tactic[battle.defender_faction]=effectiveDefenderTactic;for(const armyId of [...battle.attacker_army_ids,...battle.defender_army_ids])if(next.field_armies[armyId]){next.field_armies[armyId].acted_this_month=true;next.field_armies[armyId].battle_id=battleId;}
    const city=cityState.cities[battle.city_id],garrison=next.garrisons[battle.city_id];
    const continueMinimum=Number(config.attack_continue_minimum_manpower??50);
    const survivingAttackers=battle.attacker_army_ids.map(id=>next.field_armies?.[id]).filter(Boolean);
    const combatAttackerIds=battle.attacker_army_ids.filter(id=>{const army=next.field_armies?.[id];return army&&Number(army.manpower||0)>=continueMinimum&&Number(army.morale||0)>=10;});
    // Monthly supply/morale changes can exhaust an existing front before its next round.
    // Resolve through the ordinary defeat/retreat path without inventing another combat.
    const combatSkipped=combatAttackerIds.length===0;
    const garrisonMoraleBefore=garrison?.faction===battle.defender_faction&&garrison.manpower>0?clamp(Number(next.battles[battleId].garrison_morale??config.garrison_defaults?.morale??60),0,100):null,activeGarrison=garrisonMoraleBefore===null?null:{...garrison,morale:garrisonMoraleBefore};
    const activeAttackerLeaderId=next.field_armies[battle.attacker_leader_army_id]?battle.attacker_leader_army_id:selectBattlefieldLeader(next,combatAttackerIds),attackerLeaderArmy=activeAttackerLeaderId?next.field_armies[activeAttackerLeaderId]:null;
    const attacker=forceSummary(next,combatSkipped?battle.attacker_army_ids:combatAttackerIds,null,attackerLeaderArmy?.commander_id,config,city.politics?.political_importance||1,true,true);
    const activeDefenderLeaderId=next.field_armies[battle.defender_leader_army_id]?battle.defender_leader_army_id:selectBattlefieldLeader(next,battle.defender_army_ids),defender=forceSummary(next,battle.defender_army_ids,activeGarrison,activeDefenderLeaderId?next.field_armies[activeDefenderLeaderId]?.commander_id:null,config,city.politics?.political_importance||1,false);
    const attackTactic=tacticRecord(config,playerTactic),defenseTactic=tacticRecord(config,next.battles[battleId].tactic[battle.defender_faction]);
    let attackScore=0,defenseScore=0,ratio=0,band='defeat',attackerIndex='defeat',defenderIndex='victory',attackerLossRate=0,defenderLossRate=0,attackerLoss=0,defenderLoss=0;
    if(!combatSkipped){
    let roll=randomValue(next,armyEngine);next=roll.state;const attackRoll=(attackTactic.random_min??config.random_min)+((attackTactic.random_max??config.random_max)-(attackTactic.random_min??config.random_min))*roll.value;
    roll=randomValue(next,armyEngine);next=roll.state;const defenseRoll=(defenseTactic.random_min??config.random_min)+((defenseTactic.random_max??config.random_max)-(defenseTactic.random_min??config.random_min))*roll.value;
    attackScore=basePower(attacker,config,false)*attackTactic.power*attackRoll;
    defenseScore=basePower(defender,config,true)*defenseTactic.power*defenseRoll;
    ratio=attackScore/defenseScore;band=resultBand(ratio,config);attackerIndex=lossBandForSide(band,'attacker');defenderIndex=lossBandForSide(band,'defender');
    const pressureOnAttacker=defenseScore/(attackScore+defenseScore),pressureOnDefender=attackScore/(attackScore+defenseScore);
    attackerLossRate=clamp((config.casualty.base+config.casualty.pressure*pressureOnAttacker)*config.casualty.band_multiplier[attackerIndex]*attackTactic.loss_taken*defenseTactic.damage_dealt,config.casualty.minimum,config.casualty.maximum);
    defenderLossRate=clamp((config.casualty.base+config.casualty.pressure*pressureOnDefender)*config.casualty.band_multiplier[defenderIndex]*defenseTactic.loss_taken*attackTactic.damage_dealt,config.casualty.minimum,config.casualty.maximum);
    attackerLoss=Math.min(attacker.manpower,round100(attacker.manpower*attackerLossRate));defenderLoss=Math.min(defender.manpower,round100(defender.manpower*defenderLossRate));
    }
    const attackerArmyLoss=Math.min(attackerLoss,attacker.manpower),defenderFieldShare=defender.manpower?defender.army_ids.reduce((sum,id)=>sum+(next.field_armies[id]?.manpower||0),0)/defender.manpower:0,defenderArmyLoss=Math.min(defenderLoss,round100(defenderLoss*defenderFieldShare));
    const attackerLossDetails=distributeArmyLosses(next,combatAttackerIds,attackerArmyLoss),defenderLossDetails=distributeArmyLosses(next,battle.defender_army_ids,defenderArmyLoss);
    const garrisonLoss=Math.min(activeGarrison?.manpower||0,Math.max(0,defenderLoss-defenderArmyLoss));if(activeGarrison)next.garrisons[battle.city_id].manpower=Math.max(0,activeGarrison.manpower-garrisonLoss);
    const attackerMorale=combatSkipped?0:moraleDelta(attackerIndex,attackerLossRate,config),defenderMorale=combatSkipped?0:moraleDelta(defenderIndex,defenderLossRate,config);applyMorale(next,battle.attacker_army_ids,attackerMorale);applyMorale(next,battle.defender_army_ids,defenderMorale);
    const garrisonMoraleAfter=activeGarrison?clamp(Math.round(garrisonMoraleBefore+defenderMorale),0,100):null;if(activeGarrison)next.battles[battleId].garrison_morale=garrisonMoraleAfter;
    let incidents=[],destroyed=[];
    for(const [ids,reason] of [[battle.attacker_army_ids,'MORALE_ROUT'],[battle.defender_army_ids,'MORALE_ROUT'],[battle.attacker_army_ids,'UNIT_DESTROYED'],[battle.defender_army_ids,'UNIT_DESTROYED']]){
      const collapsed=removeCollapsedArmiesWithCommanderRisk(next,ids,reason,config,armyEngine);next=collapsed.state;destroyed.push(...collapsed.removed);incidents.push(...collapsed.incidents);
    }
    const attackerRemaining=battle.attacker_army_ids.reduce((sum,id)=>sum+Number(next.field_armies?.[id]?.manpower||0),0),defenderRemaining=battle.defender_army_ids.reduce((sum,id)=>sum+Number(next.field_armies?.[id]?.manpower||0),0)+Number(next.garrisons?.[battle.city_id]?.manpower||0);
    const attackCapableRemaining=battle.attacker_army_ids.filter(id=>{const army=next.field_armies?.[id];return army&&Number(army.manpower||0)>=continueMinimum&&Number(army.morale||0)>=10;});
    let effectiveBand=band;
    if(attackerRemaining<=0&&defenderRemaining>0)effectiveBand='major_defeat';
    else if(defenderRemaining<=0&&attackerRemaining>0)effectiveBand='major_victory';
    else if(!attackCapableRemaining.length&&defenderRemaining>0&&effectiveBand!=='major_defeat')effectiveBand='defeat';
    const decisive=['major_victory','victory','defeat','major_defeat'].includes(effectiveBand),attackerWon=['major_victory','victory'].includes(effectiveBand),loserIds=attackerWon?battle.defender_army_ids:['defeat','major_defeat'].includes(effectiveBand)?battle.attacker_army_ids:[];
    let retreatPlan=null,isolatedPredicted=false;if(loserIds.length){const loserFaction=attackerWon?battle.defender_faction:battle.attacker_faction;retreatPlan=selectRetreatPlan(next,cityState,battle,loserFaction,armyEngine,loserIds,config);isolatedPredicted=!retreatPlan;if(!isolatedPredicted){const loserBand=attackerWon?(effectiveBand==='major_victory'?'major_defeat':'defeat'):effectiveBand;const incident=commanderIncidents(next,loserIds,loserBand,config,armyEngine);next=incident.state;incidents.push(...incident.incidents);}}
    const retreat={required:decisive,faction:null,destination_city_id:null,isolated:false,mode:null,route_class:null,destination_control:null,arrival_rate:null,transit_loss:0,loss_details:[],sea:null,selection_priority:['ATTACKER_SAFE_ORIGIN','HIGHEST_ARRIVAL_RATE','FRIENDLY_FIELD_ARMY','FRIENDLY_GARRISON','LAND_ON_TIE','FOOD','MATERIALS','STARS','CITY_REGISTRATION_ORDER']};
    if(decisive){
      const atkReinf=new Set(reinforcementIds(battle,'attacker')),defReinf=new Set(reinforcementIds(battle,'defender'));
      const attackerMain=battle.attacker_army_ids.filter(id=>!atkReinf.has(id)),defenderMain=battle.defender_army_ids.filter(id=>!defReinf.has(id));
      retreat.faction=attackerWon?battle.defender_faction:battle.attacker_faction;
      const mainLoserIds=attackerWon?defenderMain:attackerMain;
      const loserFaction=retreat.faction,mainPlan=mainLoserIds.length?selectRetreatPlan(next,cityState,battle,loserFaction,armyEngine,mainLoserIds,config):null;
      const retreatCityId=mainPlan?.destination_city_id||null;retreat.mode=mainPlan?.mode||null;retreat.route_class=mainPlan?.route_class||null;retreat.destination_control=mainPlan?.destination_control||null;retreat.arrival_rate=mainPlan?.arrival_rate??null;if(mainPlan?.mode==='SEA')retreat.sea={zone_id:mainPlan.zone_id,stage:mainPlan.stage,arrival_rate:mainPlan.arrival_rate,intercepted:false};
      if(mainLoserIds.length){if(retreatCityId){const transit=applyRetreatPlan(next,mainLoserIds,mainPlan);retreat.destination_city_id=retreatCityId;retreat.transit_loss=transit.transit_loss;retreat.loss_details=transit.loss_details;for(const id of mainLoserIds)if(next.field_armies?.[id])next.field_armies[id].battle_id=null;}else{retreat.isolated=true;const trapped=removeNoRetreatArmiesWithCommanderRisk(next,mainLoserIds,config,armyEngine);next=trapped.state;destroyed.push(...trapped.removed);incidents.push(...trapped.incidents);}}
      if(attackerWon){
        if(next.garrisons[battle.city_id]){next.garrisons[battle.city_id].manpower=0;next.garrisons[battle.city_id].faction=null;}
        for(const id of attackerMain)if(next.field_armies[id])next.field_armies[id].location_city_id=battle.city_id;
        if(armyEngine?.cutBattleSupplyFromCity){const cut=armyEngine.cutBattleSupplyFromCity(next,battle.city_id,battle.defender_faction,'SUPPLY_SOURCE_CAPTURED',battleId);next=cut.state;next.battles[battleId].rear_supply_cut_army_ids=cut.army_ids;}
      }
      let rr=returnReinforcements(next,cityState,battle,'attacker',config,armyEngine,destroyed,incidents);next=rr.state;const reinforcementMoves=[...rr.moves];rr=returnReinforcements(next,cityState,battle,'defender',config,armyEngine,destroyed,incidents);next=rr.state;reinforcementMoves.push(...rr.moves);next.battles[battleId].reinforcement_resolution_moves=reinforcementMoves;
      for(const armyId of [...battle.attacker_army_ids,...battle.defender_army_ids])if(next.field_armies[armyId]){next.field_armies[armyId].battle_id=null;delete next.field_armies[armyId].supply_city_id;delete next.field_armies[armyId].reinforcement_role;delete next.field_armies[armyId].reinforcement_route_mode;delete next.field_armies[armyId].sea_supply_blockaded;}next.battles[battleId].status='resolved';next.battles[battleId].calculation_status='RESOLVED';
    }else{
      const nextAttackerLeader=selectBattlefieldLeader(next,attackCapableRemaining),survivingDefenders=battle.defender_army_ids.filter(id=>next.field_armies?.[id]&&Number(next.field_armies[id].manpower||0)>0),nextDefenderLeader=selectBattlefieldLeader(next,survivingDefenders);next.battles[battleId].attacker_leader_army_id=nextAttackerLeader;next.battles[battleId].defender_leader_army_id=nextDefenderLeader;next.battles[battleId].battlefield_commander={[battle.attacker_faction]:nextAttackerLeader?next.field_armies[nextAttackerLeader]?.commander_id:null,[battle.defender_faction]:nextDefenderLeader?next.field_armies[nextDefenderLeader]?.commander_id:null};next.battles[battleId].status='awaiting_continuation';next.battles[battleId].calculation_status='AWAITING_CONTINUE_OR_WITHDRAW';
    }
    const loot=decisive&&attackerWon?{food:Number(city.stockpile?.FOOD)||0,materials:Number(city.stockpile?.MATERIALS)||0,retained_in_city:true}:null;
    const resolution={...(combatSkipped?{combat_skipped:true,reason:'ATTACK_FORCE_UNABLE_TO_CONTINUE'}:{}),month:`${next.calendar.year}-${String(next.calendar.month).padStart(2,'0')}`,ratio,attack_score:attackScore,defense_score:defenseScore,band:effectiveBand,attacker_tactic:playerTactic,defender_tactic:next.battles[battleId].tactic[battle.defender_faction],attacker_commander_id:battle.battlefield_commander?.[battle.attacker_faction]||null,defender_commander_id:battle.battlefield_commander?.[battle.defender_faction]||null,attacker_loss:attackerLoss,defender_loss:defenderLoss,garrison_loss:garrisonLoss,garrison_morale_before:garrisonMoraleBefore,garrison_morale_after:garrisonMoraleAfter,attacker_loss_rate:attackerLossRate,defender_loss_rate:defenderLossRate,attacker_morale_delta:attackerMorale,defender_morale_delta:defenderMorale,attacker_loss_details:attackerLossDetails,defender_loss_details:defenderLossDetails,attack_capable_army_ids_after:attackCapableRemaining,attack_force_exhausted:attackCapableRemaining.length===0&&defenderRemaining>0,incidents,destroyed,retreat,loot,decisive};
    next.battles[battleId].result_band=effectiveBand;next.battles[battleId].last_resolution=copy(resolution);next.battles[battleId].history.push(copy(resolution));if(decisive)delete next.battles[battleId].garrison_morale;
    armyEngine.appendAction(next,{type:'BATTLE_RESOLVED',battle_id:battleId,city_id:battle.city_id,result_band:effectiveBand,attacker_loss:attackerLoss,defender_loss:defenderLoss,decisive,incidents:copy(incidents)});
    return{state:next,battle:copy(next.battles[battleId]),resolution,attacker,defender};
  }
  function continueBattle(state,battleId,armyEngine){
    const battle=state.battles?.[battleId];if(!battle||battle.status!=='awaiting_continuation')fail('BATTLE_CONTINUATION_NOT_AVAILABLE');
    const next=copy(state);next.battles[battleId].status='active';next.battles[battleId].calculation_status='CONTINUING';next.battles[battleId].continued_months=(next.battles[battleId].continued_months||0)+1;delete next.battles[battleId].pending_player_tactic;
    armyEngine.appendAction(next,{type:'BATTLE_CONTINUED',battle_id:battleId,city_id:battle.city_id,command_cost:0});
    return{state:next,battle:copy(next.battles[battleId])};
  }
  function withdrawBattle(state,battleId,withdrawingFaction,cityState,armyEngine,phaseConfig=null){
    const battle=state.battles?.[battleId],continuationBattle=Boolean(battle&&((battle.status==='awaiting_continuation')||(battle.status==='active'&&(battle.history||[]).length>0)));if(!continuationBattle)fail('BATTLE_WITHDRAWAL_NOT_AVAILABLE');
    if(![battle.attacker_faction,battle.defender_faction].includes(withdrawingFaction))fail('BATTLE_WITHDRAWAL_FACTION_INVALID');
    let next=copy(state);const isAttacker=withdrawingFaction===battle.attacker_faction,role=isAttacker?'attacker':'defender',allIds=isAttacker?battle.attacker_army_ids:battle.defender_army_ids,ownReinf=new Set(reinforcementIds(battle,role)),mainIds=allIds.filter(id=>!ownReinf.has(id)&&next.field_armies?.[id]),config=phaseConfig?.battle_engine||phaseConfig||(typeof globalThis!=='undefined'?globalThis.PHASE2_CONFIG?.battle_engine:null)||{},activeGarrison=!isAttacker&&next.garrisons?.[battle.city_id]?.faction===withdrawingFaction&&Number(next.garrisons[battle.city_id].manpower||0)>0;
    let plan=null,transit={arrival_rate:1,transit_loss:0,loss_details:[]},destination=null;
    if(mainIds.length){plan=selectRetreatPlan(next,cityState,battle,withdrawingFaction,armyEngine,mainIds,config);if(!plan)return{state:copy(state),battle:copy(battle),withdrawn:false,reason:'NO_WITHDRAWAL_DESTINATION'};destination=plan.destination_city_id;transit=applyRetreatPlan(next,mainIds,plan);for(const id of mainIds)if(next.field_armies?.[id])next.field_armies[id].battle_id=null;}else if(!ownReinf.size||activeGarrison)return{state:copy(state),battle:copy(battle),withdrawn:false,reason:'NO_MAIN_FORCE_TO_WITHDRAW'};
    const atkReinf=new Set(reinforcementIds(battle,'attacker')),defReinf=new Set(reinforcementIds(battle,'defender')),attackerMain=battle.attacker_army_ids.filter(id=>!atkReinf.has(id));
    if(!isAttacker){if(next.garrisons[battle.city_id]){next.garrisons[battle.city_id].manpower=0;next.garrisons[battle.city_id].faction=null;}for(const id of attackerMain)if(next.field_armies[id])next.field_armies[id].location_city_id=battle.city_id;}
    const destroyed=[],incidents=[];let rr=returnReinforcements(next,cityState,battle,'attacker',config,armyEngine,destroyed,incidents);next=rr.state;const reinforcementMoves=[...rr.moves];rr=returnReinforcements(next,cityState,battle,'defender',config,armyEngine,destroyed,incidents);next=rr.state;reinforcementMoves.push(...rr.moves);
    for(const id of [...battle.attacker_army_ids,...battle.defender_army_ids])if(next.field_armies?.[id]){next.field_armies[id].battle_id=null;delete next.field_armies[id].supply_city_id;delete next.field_armies[id].reinforcement_role;delete next.field_armies[id].reinforcement_route_mode;delete next.field_armies[id].sea_supply_blockaded;delete next.field_armies[id].sea_supply_blockaded_port_id;}
    next.battles[battleId].status='withdrawn';next.battles[battleId].calculation_status='WITHDRAWN';next.battles[battleId].reinforcement_resolution_moves=reinforcementMoves;next.battles[battleId].withdrawal={faction:withdrawingFaction,destination_city_id:destination,voluntary:true,commander_incidents:false,mode:plan?.mode||'REINFORCEMENTS_ONLY',route_class:plan?.route_class||'REINFORCEMENTS_ONLY',destination_control:plan?.destination_control||null,arrival_rate:transit.arrival_rate,transit_loss:transit.transit_loss,loss_details:transit.loss_details,sea:plan?.mode==='SEA'?{zone_id:plan.zone_id,stage:plan.stage,arrival_rate:plan.arrival_rate}:null};delete next.battles[battleId].pending_player_tactic;delete next.battles[battleId].garrison_morale;
    armyEngine.appendAction(next,{type:'BATTLE_WITHDRAWN',battle_id:battleId,city_id:battle.city_id,faction:withdrawingFaction,destination_city_id:destination,mode:plan?.mode||'REINFORCEMENTS_ONLY',route_class:plan?.route_class||'REINFORCEMENTS_ONLY',arrival_rate:transit.arrival_rate,transit_loss:transit.transit_loss,commander_incidents:false,reinforcement_resolution_moves:copy(reinforcementMoves)});
    return{state:next,battle:copy(next.battles[battleId]),withdrawn:true,destination_city_id:destination,withdrawal:copy(next.battles[battleId].withdrawal),reinforcement_moves:copy(reinforcementMoves)};
  }
  function withdrawDefenderBeforeBattle(state,battleId,cityState,armyEngine,phaseConfig,preferredDestinationCityId=null){
    const battle=state.battles?.[battleId];if(!battle||battle.status!=='awaiting_tactic')fail('BATTLE_NOT_AWAITING_DEFENSE');
    const ids=battle.defender_army_ids.filter(id=>state.field_armies?.[id]?.manpower>0);
    if(!ids.length)return{state:copy(state),withdrawn:false,reason:'NO_FIELD_ARMY_TO_WITHDRAW'};
    let plan=selectRetreatPlan(state,cityState,battle,battle.defender_faction,armyEngine,ids,phaseConfig.battle_engine);
    if(!plan)return{state:copy(state),withdrawn:false,reason:'NO_WITHDRAWAL_DESTINATION'};
    // An AI may prefer a different legal route. Keep the ordinary retreat order
    // and all arrival-rate rules when no valid preference is supplied.
    if(preferredDestinationCityId&&preferredDestinationCityId!==plan.destination_city_id){
      const routes=sortRetreatRoutes([
        ...buildLandRetreatRoutes(state,cityState,battle,battle.defender_faction,ids,phaseConfig.battle_engine),
        ...buildSeaRetreatRoutes(state,cityState,battle,battle.defender_faction,ids,phaseConfig.battle_engine)]);
      plan=routes.find(route=>route.destination_city_id===preferredDestinationCityId)||plan;
    }
    const next=copy(state),activeGarrison=next.garrisons?.[battle.city_id],abandonedGarrison=activeGarrison?.faction===battle.defender_faction?Math.max(0,Number(activeGarrison.manpower||0)):0,transit=applyRetreatPlan(next,ids,plan);
    if(abandonedGarrison>0){next.garrisons[battle.city_id].manpower=0;next.garrisons[battle.city_id].faction=null;}
    for(const id of ids)if(next.field_armies[id]){next.field_armies[id].battle_id=null;next.field_armies[id].acted_this_month=true;delete next.field_armies[id].supply_city_id;delete next.field_armies[id].reinforcement_route_mode;delete next.field_armies[id].sea_supply_blockaded;delete next.field_armies[id].sea_supply_blockaded_port_id;}
    for(const id of battle.attacker_army_ids)if(next.field_armies[id]){next.field_armies[id].location_city_id=battle.city_id;next.field_armies[id].battle_id=null;next.field_armies[id].acted_this_month=true;delete next.field_armies[id].supply_city_id;delete next.field_armies[id].reinforcement_route_mode;delete next.field_armies[id].sea_supply_blockaded;delete next.field_armies[id].sea_supply_blockaded_port_id;}
    next.battles[battleId].status='withdrawn';next.battles[battleId].calculation_status='WITHDRAWN';delete next.battles[battleId].garrison_morale;
    next.battles[battleId].withdrawal={faction:battle.defender_faction,destination_city_id:plan.destination_city_id,voluntary:true,before_combat:true,mode:plan.mode,route_class:plan.route_class,arrival_rate:transit.arrival_rate,transit_loss:transit.transit_loss,abandoned_garrison_manpower:abandonedGarrison,abandoned_garrison_faction:abandonedGarrison>0?battle.defender_faction:null};
    armyEngine.appendAction(next,{type:'BATTLE_DEFENDER_WITHDREW',battle_id:battleId,city_id:battle.city_id,faction:battle.defender_faction,destination_city_id:plan.destination_city_id,transit_loss:transit.transit_loss,abandoned_garrison_manpower:abandonedGarrison});
    return{state:next,battle:copy(next.battles[battleId]),withdrawn:true,withdrawal:copy(next.battles[battleId].withdrawal)};
  }
  return{prepareBattle,resolveBattle,continueBattle,withdrawBattle,withdrawDefenderBeforeBattle,reinforceBattle,canLeadJointReinforcement,selectBattlefieldLeader,selectDefenderLeader,selectRetreatCity,selectRetreatPlan,retreatDestinationStatus,buildLandRetreatRoutes,buildSeaRetreatRoutes,sortRetreatRoutes,applyRetreatPlan,forceSummary,basePower,qualityFactor,commanderFactor,appropriateManpower,battlefieldTacticsFactor,moraleCombatState,armyIndividualPower,resultBand,chooseEnemyTactic};
});
