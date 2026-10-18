(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CityCommandEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const copy=v=>JSON.parse(JSON.stringify(v));
  const SEA_COMMANDS=new Set(['SEA_MOVE','SEA_TRANSPORT','LANDING_ATTACK']);
  const MOVE_COMMANDS=new Set(['MOVE','SEA_MOVE']);
  const TRANSPORT_COMMANDS=new Set(['TRANSPORT_LAND','SEA_TRANSPORT']);
  const ATTACK_COMMANDS=new Set(['ATTACK','LANDING_ATTACK']);
  const assertResource=r=>{if(r!=='FOOD'&&r!=='MATERIALS')throw new Error('RESOURCE_INVALID');};
  const city=(state,id)=>{const value=state.cities[id];if(!value)throw new Error('CITY_NOT_FOUND');return value;};
  const isFriendly=(c,faction)=>c.politics.military_control===faction;
  const isUncontrolled=c=>c.politics.military_control==='UNCONTROLLED';
  const enemyFaction=faction=>faction==='PATRIOT'?'BRITISH':'PATRIOT';
  const hasDefenders=c=>(Number(c.garrison?.troops)||0)>0||(Number(c.stationed_field_army_troops)||0)>0;
  const isPortOperational=c=>Boolean(c?.geography?.is_port)&&Number(c?.condition?.damage_severity||0)<3&&!c?.naval?.blockaded_by;
  const economicZoneId=c=>c.economic_zone_id||(c.state_id==='ME'?'MAINE':c.state_id==='MA'?'MA_MAIN':c.state_id);
  function outputFactor(c,config){return config.damage_output_factor[c.condition?.damage_severity||0]??1;}
  function cooperationOutputFactor(c){const v=Number(c?.politics?.public_cooperation)||0;return v>=85?1.15:v>=70?1.10:v<15?0.80:v<30?0.90:1;}
  function capacityFactor(c,config){return config.capacity_damage_factor?.[c.condition?.damage_severity||0]??outputFactor(c,config);}
  function economicZoneSummary(state,zoneId){const values=Object.values(state.cities).filter(c=>economicZoneId(c)===zoneId);return{economic_zone_id:zoneId,city_count:values.length,agriculture:values.reduce((n,c)=>n+c.bases.agriculture,0),industry:values.reduce((n,c)=>n+c.bases.industry,0)};}
  function baseCapacity(state,c,resource,config){assertResource(resource);const zone=economicZoneSummary(state,economicZoneId(c)),rules=config.capacity,scale=Math.max(1,Number(config.resource_unit_scale)||1);const local=resource==='FOOD'?c.bases.agriculture:c.bases.industry,total=resource==='FOOD'?zone.agriculture:zone.industry,base=resource==='FOOD'?rules.food_base:rules.materials_base,raw=base+local*rules.local_factor+Math.min(rules.zone_bonus_cap,total*rules.zone_factor);return Math.round(raw/scale)*scale;}
  function recalculateCityCapacity(state,cityId,config,events=[]){const c=city(state,cityId),lost={FOOD:0,MATERIALS:0},scale=Math.max(1,Number(config.resource_unit_scale)||1);for(const resource of ['FOOD','MATERIALS']){const next=Math.floor((baseCapacity(state,c,resource,config)/scale)*capacityFactor(c,config))*scale;c.capacity[resource]=next;if(c.stockpile[resource]>next){lost[resource]=c.stockpile[resource]-next;c.stockpile[resource]=next;events.push({type:'CAPACITY_OVERFLOW_LOST',city_id:cityId,resource,amount:lost[resource]});}}return{city_id:cityId,economic_zone_id:economicZoneId(c),capacity:{...c.capacity},lost};}
  function recalculateCapacities(state,config,events=[]){for(const id of Object.keys(state.cities))recalculateCityCapacity(state,id,config,events);return state;}
  function damageChangedEvent(target,before,severity,cause){return{type:'CITY_DAMAGE_CHANGED',city_id:target.city_id,city_name:target.city_name,before,severity,cause:cause||'DIRECT'};}
  function appendPortDamageEvent(events,target,portBefore,portAfter){if(target.geography.is_port&&portBefore!==portAfter)events.push({type:'PORT_OPERATION_CHANGED',city_id:target.city_id,city_name:target.city_name,zone_id:target.geography.sea_zone_id,operational:portAfter,reason:portAfter?'DAMAGE_RECOVERED':'MAJOR_CITY_DAMAGE'});}
  function applyCityDamage(state,cityId,severity,config){if(!Number.isInteger(severity)||severity<0||severity>=config.capacity_damage_factor.length)throw new Error('DAMAGE_SEVERITY_INVALID');const next=copy(state),events=[],target=next.cities[cityId],portBefore=isPortOperational(target),before=target.condition.damage_severity;target.condition.damage_severity=severity;target.condition.damage_recovery_elapsed=0;const result=recalculateCityCapacity(next,cityId,config,events),portAfter=isPortOperational(target);events.unshift(damageChangedEvent(target,before,severity,'DIRECT'));appendPortDamageEvent(events,target,portBefore,portAfter);return{state:next,result,events};}
  function recordBattleDamage(state,cityId,periodKey,config){if(!periodKey)throw new Error('BATTLE_PERIOD_REQUIRED');const next=copy(state),events=[],target=city(next,cityId),condition=target.condition||(target.condition={}),before=Number(condition.damage_severity)||0,alreadyRecorded=condition.last_battle_damage_period===periodKey,portBefore=isPortOperational(target);condition.last_battle_period=periodKey;condition.damage_recovery_elapsed=0;if(alreadyRecorded)return{state:next,result:{city_id:cityId,before,severity:before,changed:false,period:periodKey},events};condition.last_battle_damage_period=periodKey;condition.damage_severity=Math.min(config.capacity_damage_factor.length-1,before+1);condition.damage_types=[];const severity=condition.damage_severity,result={...recalculateCityCapacity(next,cityId,config,events),before,severity,changed:severity!==before,period:periodKey};events.unshift({type:'BATTLE_CITY_DAMAGE',city_id:cityId,city_name:target.city_name,before,severity,changed:severity!==before,period:periodKey});appendPortDamageEvent(events,target,portBefore,isPortOperational(target));return{state:next,result,events};}
  function previewDamageRepair(state,cityId,faction,politics,periodKey,config){const target=city(state,cityId),rules=config.damage_repair;if(!rules)throw new Error('DAMAGE_REPAIR_CONFIG_MISSING');if(target.politics.military_control!==faction)throw new Error('CITY_NOT_CONTROLLED');const severity=Number(target.condition?.damage_severity)||0;if(severity<=0)throw new Error('CITY_NOT_DAMAGED');const political=Number.isFinite(Number(politics))?Number(politics):null,bands=rules.politics_cost_factor||[],factor=political===null?1:(bands.find(entry=>political>=entry.min)?.factor??1),base=rules.base_cost_by_severity[String(severity)],civic=rules.civic_gain_by_severity?.[String(severity)]||{cooperation:0,support:0};if(!base)throw new Error('DAMAGE_REPAIR_COST_MISSING');const supportDirection=faction==='PATRIOT'?1:-1,beforeSupport=Number(target.politics?.independence_support)||0,beforeCooperation=Number(target.politics?.public_cooperation)||0,afterSupport=Math.max(0,Math.min(100,beforeSupport+supportDirection*(Number(civic.support)||0))),afterCooperation=Math.max(0,Math.min(100,beforeCooperation+(Number(civic.cooperation)||0)));return{city_id:cityId,faction,period:periodKey,before:severity,after:severity-1,politics:political,cost_factor:factor,materials_cost:Math.ceil(base.materials*factor),treasury_cost:Math.ceil(base.treasury*factor),command_cost:rules.command_cost||1,before_support:beforeSupport,after_support:afterSupport,support_change:afterSupport-beforeSupport,before_cooperation:beforeCooperation,after_cooperation:afterCooperation,cooperation_change:afterCooperation-beforeCooperation};}
  function executeDamageRepair(state,cityId,faction,politics,periodKey,config,commandContext=null){const result=previewDamageRepair(state,cityId,faction,politics,periodKey,config),next=copy(state),target=next.cities[cityId],portBefore=isPortOperational(target);if(target.stockpile.MATERIALS<result.materials_cost)throw new Error('MATERIALS_INSUFFICIENT');let militaryState=null;if(commandContext?.military_state){militaryState=copy(commandContext.military_state);const armyId=commandContext.army_id,army=armyId?militaryState.field_armies?.[armyId]:null;if(!army||army.faction!==faction||army.location_city_id!==cityId)throw new Error('REPAIR_COMMANDER_NOT_AVAILABLE');if(army.acted_this_month)throw new Error('ARMY_ALREADY_ACTED');if((Number(militaryState.factions?.[faction]?.commands_remaining)||0)<result.command_cost)throw new Error('COMMANDS_EXHAUSTED');if((Number(militaryState.factions?.[faction]?.treasury)||0)<result.treasury_cost)throw new Error('TREASURY_INSUFFICIENT');militaryState.factions[faction].treasury-=result.treasury_cost;militaryState.factions[faction].commands_remaining-=result.command_cost;militaryState.field_armies[armyId].acted_this_month=true;}target.stockpile.MATERIALS-=result.materials_cost;target.condition.damage_severity=result.after;target.condition.damage_recovery_elapsed=0;if(result.after===0)target.condition.damage_types=[];target.politics.independence_support=result.after_support;target.politics.public_cooperation=result.after_cooperation;next.civil_command_history=next.civil_command_history||[];next.civil_command_history.push({period:periodKey,city_id:cityId,faction,command_type:'DAMAGE_REPAIR',materials_cost:result.materials_cost,treasury_cost:result.treasury_cost,politics:result.politics,support_change:result.support_change,cooperation_change:result.cooperation_change});const events=[damageChangedEvent(target,result.before,result.after,'DAMAGE_REPAIR'),{type:'DAMAGE_REPAIR_CIVIC_RECOVERY',city_id:cityId,city_name:target.city_name,faction,support_change:result.support_change,cooperation_change:result.cooperation_change,before_support:result.before_support,after_support:result.after_support,before_cooperation:result.before_cooperation,after_cooperation:result.after_cooperation}];recalculateCityCapacity(next,cityId,config,events);appendPortDamageEvent(events,target,portBefore,isPortOperational(target));if(militaryState){if(militaryState.city_logistics?.[cityId]){militaryState.city_logistics[cityId].food_stock=target.stockpile.FOOD;militaryState.city_logistics[cityId].material_stock=target.stockpile.MATERIALS;}militaryState.action_log=militaryState.action_log||[];militaryState.action_log.push({type:'DAMAGE_REPAIR',faction,city_id:cityId,army_id:commandContext.army_id,commander_id:commandContext.commander_id||militaryState.field_armies?.[commandContext.army_id]?.commander_id||null,treasury_cost:result.treasury_cost,materials_cost:result.materials_cost,support_change:result.support_change,cooperation_change:result.cooperation_change,year:militaryState.calendar?.year??null,month:militaryState.calendar?.month??null});}return{state:next,military_state:militaryState,result,events};}
  function monthlyBalance(c,resource,config){assertResource(resource);const scale=Math.max(1,Number(config.resource_unit_scale)||1),production=Math.round(((c.monthly_local_surplus[resource]||0)/scale)*outputFactor(c,config)*cooperationOutputFactor(c))*scale;const garrisonTroops=(c.garrison?.troops||0),fieldTroops=Number.isFinite(Number(c.stationed_field_army_consumption_troops))?Number(c.stationed_field_army_consumption_troops):(c.stationed_field_army_troops||0),troops=garrisonTroops+fieldTroops;const consumption=Math.ceil(troops/1000*config.consumption_per_1000_troops_per_month[resource]);return{production,consumption,net:production-consumption,troops};}
  function supportLabel(value,config){return config.support_bands.find(b=>value>=b.min)?.label||'—';}
  function landNeighbors(state,id){const out=[];for(const e of state.topology.edges){if(e.type.startsWith('water_'))continue;if(e.a===id)out.push(e.b);else if(e.b===id)out.push(e.a);}return [...new Set(out)].sort();}
  function seaCandidates(state,id,controlledSeaZones,commandType='SEA_TRANSPORT'){const origin=city(state,id),zone=origin.geography.sea_zone_id;if(!isPortOperational(origin)||!zone)return[];const landing=commandType==='LANDING_ATTACK';const seaMove=commandType==='SEA_MOVE';return Object.values(state.cities).filter(c=>c.city_id!==id&&c.geography?.sea_zone_id&&(landing?c.geography.is_coastal:seaMove?(isPortOperational(c)||(c.geography.naval_class==='LANDING_ONLY'&&isUncontrolled(c))):isPortOperational(c))).map(c=>c.city_id).sort();}
  function getCommandCandidates(state,request){
    const {command_type,origin_city_id,faction,controlled_sea_zones=[]}=request,origin=city(state,origin_city_id);
    if(!isFriendly(origin,faction))return[];
    const pool=SEA_COMMANDS.has(command_type)?seaCandidates(state,origin_city_id,controlled_sea_zones,command_type):landNeighbors(state,origin_city_id);
    return pool.filter(id=>{const target=state.cities[id];if(MOVE_COMMANDS.has(command_type))return isFriendly(target,faction)||isUncontrolled(target);if(TRANSPORT_COMMANDS.has(command_type))return isFriendly(target,faction);if(ATTACK_COMMANDS.has(command_type))return target.politics.military_control===enemyFaction(faction) /* Occupied-but-ungarrisoned cities remain attackable. Actual defenders are checked by BattleEngine. */;return false;});
  }
  function validateCommand(state,command,context){
    const candidates=getCommandCandidates(state,{command_type:command.command_type,origin_city_id:command.origin_city_id,faction:context.faction,controlled_sea_zones:context.controlled_sea_zones});
    if(!candidates.includes(command.destination_city_id))throw new Error('DESTINATION_NOT_ELIGIBLE');
    return{origin:city(state,command.origin_city_id),destination:city(state,command.destination_city_id)};
  }
  function transportPlan(next,command,context){
      const o=next.cities[command.origin_city_id],d=next.cities[command.destination_city_id];
      const amounts=command.food_amount!==undefined||command.materials_amount!==undefined?{FOOD:Math.floor(Number(command.food_amount)||0),MATERIALS:Math.floor(Number(command.materials_amount)||0)}:{[command.resource]:Math.floor(Number(command.amount)||0)};
      if(Object.values(amounts).some(v=>!Number.isInteger(v)||v<0)||Object.values(amounts).every(v=>v<=0))throw new Error('AMOUNT_INVALID');
      let arrivalRate=1,routeProfile=null;if(command.command_type==='SEA_TRANSPORT'){const N=globalThis.NavalControlEngine;if(!N)throw new Error('NAVAL_ENGINE_MISSING');routeProfile=N.seaRouteProfile(next,o.geography.sea_zone_id,d.geography.sea_zone_id,context.faction,'SEA_TRANSPORT',context.period_key);arrivalRate=routeProfile.arrival_rate;}
      const arriving={},discarded={},transitLoss={},lost={};
      for(const [resource,amount] of Object.entries(amounts)){
        assertResource(resource);
        if(o.stockpile[resource]<amount)throw new Error('ORIGIN_STOCK_INSUFFICIENT');
        const reached=amount>0&&arrivalRate>0?Math.max(1,Math.floor(amount*arrivalRate)):0;
        const free=Math.max(0,d.capacity[resource]-d.stockpile[resource]);
        arriving[resource]=Math.min(reached,free);
        transitLoss[resource]=amount-reached;
        discarded[resource]=reached-arriving[resource];
        lost[resource]=amount-arriving[resource];
      }
      return{arrival_rate:arrivalRate,route_profile:routeProfile,shipped:amounts,arrived:arriving,lost,transit_loss:transitLoss,discarded,
        origin_before:{FOOD:o.stockpile.FOOD,MATERIALS:o.stockpile.MATERIALS},destination_before:{FOOD:d.stockpile.FOOD,MATERIALS:d.stockpile.MATERIALS},destination_capacity:{FOOD:d.capacity.FOOD,MATERIALS:d.capacity.MATERIALS}};
  }
  function previewTransportCommand(state,command,config,context){
    if(!TRANSPORT_COMMANDS.has(command.command_type))throw new Error('TRANSPORT_COMMAND_INVALID');
    const next=copy(state);recalculateCapacities(next,config);validateCommand(next,command,context);
    return transportPlan(next,command,context);
  }
  function moveSupplyPlan(next,command,context){
    if(!MOVE_COMMANDS.has(command.command_type))throw new Error('MOVE_SUPPLY_COMMAND_INVALID');
    const o=next.cities[command.origin_city_id],d=next.cities[command.destination_city_id];
    const amounts={FOOD:Math.floor(Number(command.food_amount)||0),MATERIALS:Math.floor(Number(command.materials_amount)||0)};
    if(Object.values(amounts).some(v=>!Number.isInteger(v)||v<0))throw new Error('AMOUNT_INVALID');
    let arrivalRate=1,routeProfile=null;
    if(command.command_type==='SEA_MOVE'){
      const N=globalThis.NavalControlEngine;if(!N)throw new Error('NAVAL_ENGINE_MISSING');
      routeProfile=N.seaRouteProfile(next,o.geography.sea_zone_id,d.geography.sea_zone_id,context.faction,'SEA_TRANSPORT',context.period_key);arrivalRate=routeProfile.arrival_rate;
    }
    const arriving={FOOD:0,MATERIALS:0},discarded={FOOD:0,MATERIALS:0},transitLoss={FOOD:0,MATERIALS:0},lost={FOOD:0,MATERIALS:0};
    for(const resource of ['FOOD','MATERIALS']){
      const amount=amounts[resource];
      if(o.stockpile[resource]<amount)throw new Error('ORIGIN_STOCK_INSUFFICIENT');
      const reached=amount>0&&arrivalRate>0?Math.max(1,Math.floor(amount*arrivalRate)):0;
      const free=Math.max(0,d.capacity[resource]-d.stockpile[resource]);
      arriving[resource]=Math.min(reached,free);
      transitLoss[resource]=amount-reached;
      discarded[resource]=reached-arriving[resource];
      lost[resource]=amount-arriving[resource];
    }
    return{arrival_rate:arrivalRate,route_profile:routeProfile,shipped:amounts,arrived:arriving,lost,transit_loss:transitLoss,discarded,
      origin_before:{FOOD:o.stockpile.FOOD,MATERIALS:o.stockpile.MATERIALS},destination_before:{FOOD:d.stockpile.FOOD,MATERIALS:d.stockpile.MATERIALS},destination_capacity:{FOOD:d.capacity.FOOD,MATERIALS:d.capacity.MATERIALS}};
  }
  function previewMoveSupply(state,command,config,context){
    if(!MOVE_COMMANDS.has(command.command_type))throw new Error('MOVE_SUPPLY_COMMAND_INVALID');
    const next=copy(state);recalculateCapacities(next,config);validateCommand(next,command,context);
    return moveSupplyPlan(next,command,context);
  }
  function executeMoveSupply(state,command,config,context){
    if(!MOVE_COMMANDS.has(command.command_type))throw new Error('MOVE_SUPPLY_COMMAND_INVALID');
    const next=copy(state);recalculateCapacities(next,config);validateCommand(next,command,context);
    const result=moveSupplyPlan(next,command,context),o=next.cities[command.origin_city_id],d=next.cities[command.destination_city_id];
    for(const resource of ['FOOD','MATERIALS']){o.stockpile[resource]-=result.shipped[resource];d.stockpile[resource]+=result.arrived[resource];}
    return{state:next,result};
  }
  function executeCommand(state,command,config,context){
    const next=copy(state);recalculateCapacities(next,config);validateCommand(next,command,context);next.order_log=next.order_log||[];
    let transportResult=null;
    if(TRANSPORT_COMMANDS.has(command.command_type)){
      transportResult=transportPlan(next,command,context);
      const o=next.cities[command.origin_city_id],d=next.cities[command.destination_city_id];
      for(const [resource,amount] of Object.entries(transportResult.shipped)){o.stockpile[resource]-=amount;d.stockpile[resource]+=transportResult.arrived[resource];}
    }else if(command.command_type==='MOVE'||command.command_type==='SEA_MOVE'){
      if(!Number.isInteger(command.troops)||command.troops<=0)throw new Error('TROOPS_INVALID');
      const o=next.cities[command.origin_city_id],d=next.cities[command.destination_city_id];
      if(o.garrison.troops<command.troops)throw new Error('TROOPS_INSUFFICIENT');o.garrison.troops-=command.troops;d.garrison.troops+=command.troops;
    }
    const order={...command,month:next.elapsed_months||0,status:ATTACK_COMMANDS.has(command.command_type)?'QUEUED_FOR_COMBAT_RESOLUTION':'EXECUTED',...(transportResult?{transport_result:transportResult}:{})};next.order_log.push(order);return{state:next,result:order};
  }
  function advanceCommonRecovery(c,config,events,currentPeriod){if(!(c.condition.damage_severity>0))return;if(c.condition.last_battle_period===currentPeriod){c.condition.damage_recovery_elapsed=0;return;}const portBefore=isPortOperational(c),before=c.condition.damage_severity;c.condition.damage_recovery_elapsed=(c.condition.damage_recovery_elapsed||0)+1;if(c.condition.damage_recovery_elapsed>=config.common_damage_recovery_months_per_step){c.condition.damage_severity--;c.condition.damage_recovery_elapsed=0;if(c.condition.damage_severity===0)c.condition.damage_types=[];events.push({type:'COMMON_DAMAGE_RECOVERY',city_id:c.city_id,city_name:c.city_name,before,severity:c.condition.damage_severity,peaceful_months:config.common_damage_recovery_months_per_step});appendPortDamageEvent(events,c,portBefore,isPortOperational(c));}}
  function advanceMonth(state,config){
    const next=copy(state),events=[],currentPeriod=`M${Number(next.elapsed_months)||0}`;recalculateCapacities(next,config,events);
    for(const c of Object.values(next.cities)){
      const shortageResources=[];
      for(const resource of ['FOOD','MATERIALS']){
        const balance=monthlyBalance(c,resource,config),before=c.stockpile[resource],raw=before+balance.net,after=Math.max(0,Math.min(c.capacity[resource],raw));
        c.stockpile[resource]=after;
        const detail={city_id:c.city_id,resource,before,after,capacity:c.capacity[resource],production:balance.production,consumption:balance.consumption,net:balance.net,unmet:Math.max(0,-raw)};
        if(before>0&&after===0&&balance.net<0)events.push({type:`${resource}_DEPLETED`,...detail});
        if(after===0&&balance.net<0&&balance.consumption>0){events.push({type:`${resource}_SHORTAGE`,...detail});shortageResources.push(resource);}
      }
      const cooperationLoss=config.shortage.cooperation_loss_per_shortage_resource_month??config.shortage.cooperation_loss_per_food_shortage_month??4;
      const fieldArmyMoraleLoss=config.shortage.field_army_morale_loss_per_shortage_resource_month??config.shortage.field_army_morale_loss_per_food_shortage_month??8;
      const garrisonDesertionRate=config.shortage.garrison_desertion_rate_per_shortage_resource_month??config.shortage.garrison_desertion_rate_per_food_shortage_month??.10;
      c.consecutive_food_shortage_months=shortageResources.includes('FOOD')?(c.consecutive_food_shortage_months||0)+1:0;
      c.consecutive_materials_shortage_months=shortageResources.includes('MATERIALS')?(c.consecutive_materials_shortage_months||0)+1:0;
      if(shortageResources.length){
        const totalCooperationLoss=cooperationLoss*shortageResources.length;
        c.politics.public_cooperation=Math.max(0,c.politics.public_cooperation-totalCooperationLoss);
        for(const resource of shortageResources){
          const shortageEvent=[...events].reverse().find(event=>event.type===`${resource}_SHORTAGE`&&event.city_id===c.city_id);
          if(shortageEvent)Object.assign(shortageEvent,{shortage_months:resource==='FOOD'?c.consecutive_food_shortage_months:c.consecutive_materials_shortage_months,cooperation_loss:cooperationLoss,field_army_morale_loss:fieldArmyMoraleLoss,garrison_desertion_rate:garrisonDesertionRate,shortage_resource_count:shortageResources.length,total_cooperation_loss:totalCooperationLoss,total_field_army_morale_loss:fieldArmyMoraleLoss*shortageResources.length,total_garrison_desertion_rate:garrisonDesertionRate*shortageResources.length});
        }
      }
      advanceCommonRecovery(c,config,events,currentPeriod);recalculateCityCapacity(next,c.city_id,config,events);
    }
    next.elapsed_months=(next.elapsed_months||0)+1;return{state:next,events};
  }
  function stateSummary(state,stateId){const values=Object.values(state.cities).filter(c=>c.state_id===stateId);const avg=k=>Math.round(values.reduce((s,c)=>s+k(c),0)/Math.max(1,values.length));return{city_count:values.length,patriot:values.filter(c=>c.politics.military_control==='PATRIOT').length,british:values.filter(c=>c.politics.military_control==='BRITISH').length,contested:values.filter(c=>!['PATRIOT','BRITISH'].includes(c.politics.military_control)).length,support:avg(c=>c.politics.independence_support),agriculture:values.reduce((n,c)=>n+c.bases.agriculture,0),industry:values.reduce((n,c)=>n+c.bases.industry,0)};}
  return{economicZoneId,economicZoneSummary,baseCapacity,recalculateCityCapacity,recalculateCapacities,applyCityDamage,recordBattleDamage,previewDamageRepair,executeDamageRepair,monthlyBalance,supportLabel,landNeighbors,seaCandidates,isPortOperational,getCommandCandidates,validateCommand,previewTransportCommand,previewMoveSupply,executeMoveSupply,executeCommand,advanceMonth,stateSummary};
});
