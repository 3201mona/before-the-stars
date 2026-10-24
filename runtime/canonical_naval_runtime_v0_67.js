(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NavalControlEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const copy=value=>JSON.parse(JSON.stringify(value));
  const ZONES=Object.freeze({NORTH:'北部海域',CENTRAL:'中部海域',SOUTH:'南部海域'}),FACTIONS=Object.freeze(['PATRIOT','BRITISH']);
  const BALANCES=Object.freeze(['PATRIOT_CONTROL','PATRIOT_ADVANTAGE','CONTESTED','BRITISH_ADVANTAGE','BRITISH_CONTROL']),VIEW_LABELS=Object.freeze(['制海','優勢','拮抗','劣勢','制海権なし']);
  const OPERATIONS=Object.freeze({PATROL:{label:'海上哨戒',points:2},PRIVATEERING:{label:'私掠活動',points:1},BLOCKADE:{label:'港湾封鎖',points:0},COASTAL_GUARD:{label:'沿岸警備',points:1},SHIPPING_DISRUPTION:{label:'海運妨害',points:1}});
  const DEFAULT_FACTORS=Object.freeze({NORTH:{PATRIOT:{fleet:2,foreign:0},BRITISH:{fleet:10,foreign:2}},CENTRAL:{PATRIOT:{fleet:1,foreign:0},BRITISH:{fleet:10,foreign:2}},SOUTH:{PATRIOT:{fleet:2,foreign:0},BRITISH:{fleet:9,foreign:2}}});
  function assertZone(zoneId){if(!ZONES[zoneId])throw new Error('SEA_ZONE_INVALID');}function assertFaction(faction){if(!FACTIONS.includes(faction))throw new Error('FACTION_INVALID');}function assertBalance(balance){if(!BALANCES.includes(balance))throw new Error('NAVAL_BALANCE_INVALID');}function enemyFaction(faction){assertFaction(faction);return faction==='PATRIOT'?'BRITISH':'PATRIOT';}
  function isPortOperational(city,options={}){return Boolean(city?.geography?.is_port)&&Number(city?.condition?.damage_severity||0)<3&&(options.ignoreBlockades||!city?.naval?.blockaded_by);}function portStatus(city,options={}){if(!city?.geography?.is_port)return{operational:false,reason:'NOT_A_PORT'};if(Number(city.condition?.damage_severity||0)>=3)return{operational:false,reason:'MAJOR_CITY_DAMAGE'};if(!options.ignoreBlockades&&city.naval?.blockaded_by)return{operational:false,reason:'BLOCKADED',blockaded_by:city.naval.blockaded_by};return{operational:true,reason:'OPERATIONAL'};}
  function portNetwork(state,zoneId,options={}){assertZone(zoneId);const result={zone_id:zoneId,zone_name:ZONES[zoneId],PATRIOT:[],BRITISH:[],UNCONTROLLED:[],disabled:[]};for(const city of Object.values(state?.cities||{})){if(!city.geography?.is_port||city.geography.sea_zone_id!==zoneId)continue;const status=portStatus(city,options);if(!status.operational){result.disabled.push({city_id:city.city_id,city_name:city.city_name,reason:status.reason});continue;}const control=city.politics?.military_control,key=FACTIONS.includes(control)?control:'UNCONTROLLED';result[key].push(city.city_id);}result.counts={PATRIOT:result.PATRIOT.length,BRITISH:result.BRITISH.length,UNCONTROLLED:result.UNCONTROLLED.length,disabled:result.disabled.length};return result;}function allPortNetworks(state,options={}){return Object.keys(ZONES).map(zoneId=>portNetwork(state,zoneId,options));}
  function ensureState(state){const next=copy(state);next.naval_control=next.naval_control||{};Object.assign(next.naval_control,{schema_version:'naval-control/0.3.0',calculation_status:'ACTIVE_SMALL_POINT_MODEL',score_visibility:'MASKED'});next.naval_control.zones=next.naval_control.zones||{};for(const zoneId of Object.keys(ZONES)){const zone=next.naval_control.zones[zoneId]||{};zone.balance=zone.balance||null;zone.factors=zone.factors||{};zone.operations=zone.operations||{PATRIOT:[],BRITISH:[]};for(const faction of FACTIONS){zone.factors[faction]={fleet:DEFAULT_FACTORS[zoneId][faction].fleet,foreign:DEFAULT_FACTORS[zoneId][faction].foreign,...zone.factors[faction]};zone.operations[faction]=Array.isArray(zone.operations[faction])?zone.operations[faction]:[];}zone.operation_influence=clampInfluence(zone.operation_influence);next.naval_control.zones[zoneId]=zone;}for(const city of Object.values(next.cities||{}))city.naval={blockaded_by:null,blockade_period:null,blockade_pending_period:null,...city.naval};return next;}
  function stageForFaction(balance,faction){assertBalance(balance);assertFaction(faction);const index=BALANCES.indexOf(balance),viewIndex=faction==='PATRIOT'?index:BALANCES.length-1-index;return{key:['CONTROL','ADVANTAGE','CONTESTED','DISADVANTAGE','NO_CONTROL'][viewIndex],label:VIEW_LABELS[viewIndex],level:viewIndex};}function balanceFromDifference(diff){return diff>=8?'PATRIOT_CONTROL':diff>=3?'PATRIOT_ADVANTAGE':diff>=-2?'CONTESTED':diff>=-7?'BRITISH_ADVANTAGE':'BRITISH_CONTROL';}
  // Naval operations build a persistent signed advantage. Both factions' points are netted
  // once per calendar month before clamping; this prevents AI/player turn order from
  // changing the final influence near the +/-15 limit.
  const MAX_MONTHLY_OPERATION_POINTS=3,MAX_OPERATION_INFLUENCE=15;
  function clampInfluence(value){const n=Number(value);return Number.isFinite(n)?Math.max(-MAX_OPERATION_INFLUENCE,Math.min(MAX_OPERATION_INFLUENCE,Math.trunc(n))):0;}
  function operationPoints(zone,faction,periodKey){return Math.min(MAX_MONTHLY_OPERATION_POINTS,(zone.operations?.[faction]||[]).filter(item=>!periodKey||item.period_key===periodKey).reduce((sum,item)=>sum+(OPERATIONS[item.type]?.points||0),0));}
  function accumulatedOperationInfluence(zone,periodKey,onlyPrior=false){
    let influence=clampInfluence(zone.operation_influence);
    const monthly=new Map();
    for(const faction of FACTIONS)for(const item of zone.operations?.[faction]||[]){
      const month=String(item?.period_key||'');
      if(!/^\d{4}-\d{2}$/.test(month)||(periodKey&&(onlyPrior?month>=periodKey:month>periodKey)))continue;
      const points=OPERATIONS[item?.type]?.points||0;
      if(!monthly.has(month))monthly.set(month,{PATRIOT:0,BRITISH:0});
      monthly.get(month)[faction]+=points;
    }
    for(const month of [...monthly.keys()].sort()){
      const points=monthly.get(month);
      influence=clampInfluence(influence+Math.min(MAX_MONTHLY_OPERATION_POINTS,points.PATRIOT)-Math.min(MAX_MONTHLY_OPERATION_POINTS,points.BRITISH));
    }
    return influence;
  }
  function portPoints(network,faction){const controlled=network.counts.PATRIOT+network.counts.BRITISH;return controlled?Math.round(6*network.counts[faction]/controlled):0;}
  // Read-only naval queries must not deep-copy the entire 50-city game board.
  // Match ensureState's default projection for only the fields these queries read.
  // Do not cache by state object identity: AI and game logic can mutate nested fields.
  function readZone(state,zoneId){
    const original=state?.naval_control?.zones?.[zoneId]||{};
    const sourceFactors=original.factors||{},sourceOperations=original.operations||{};
    const factors={},operations={};
    for(const faction of FACTIONS){
      factors[faction]={...DEFAULT_FACTORS[zoneId][faction],...sourceFactors[faction]};
      operations[faction]=Array.isArray(sourceOperations[faction])?sourceOperations[faction]:[];
    }
    return{factors,operations,operation_influence:clampInfluence(original.operation_influence)};
  }

  function zoneCalculation(state,zoneId,periodKey,options={}){assertZone(zoneId);const zone=readZone(state,zoneId),network=portNetwork(state,zoneId,{ignoreBlockades:Boolean(options.ignoreBlockades)}),totals={},influence=accumulatedOperationInfluence(zone,periodKey);for(const faction of FACTIONS){const factors=zone.factors[faction];totals[faction]={fleet:Number(factors.fleet)||0,ports:portPoints(network,faction),operations:faction==='PATRIOT'?Math.max(0,influence):Math.max(0,-influence),foreign:Number(factors.foreign)||0};totals[faction].total=Object.values(totals[faction]).reduce((sum,value)=>sum+value,0);}const difference=totals.PATRIOT.total-totals.BRITISH.total,balance=balanceFromDifference(difference);return{zone_id:zoneId,zone_name:ZONES[zoneId],period_key:periodKey||null,totals,difference,balance,network,operation_influence:influence};}
  function recalculateAll(state,periodKey,cause='四要素の再集計'){let next=ensureState(state);const events=[];for(const city of Object.values(next.cities||{}))if(city.naval?.blockaded_by){const blockader=city.naval.blockaded_by,base=zoneCalculation(next,city.geography.sea_zone_id,periodKey,{ignoreBlockades:true}),stillControls=stageForFaction(base.balance,blockader).key==='CONTROL',control=city.politics?.military_control;
    // During an active battle the city's control becomes CONFLICT before either
    // side has won. The original enemy garrison is still inside the besieged
    // port, so this intermediate value must NOT release its blockade (and
    // accidentally reopen the defender's sea-retreat route).
    const stillEnemy=control===enemyFaction(blockader)||control==='CONFLICT';
    if(!stillControls||!stillEnemy){city.naval.blockaded_by=null;city.naval.blockade_period=null;city.naval.blockade_pending_period=null;events.push({type:'PORT_OPERATION_CHANGED',city_id:city.city_id,city_name:city.city_name,zone_id:city.geography.sea_zone_id,operational:Number(city.condition?.damage_severity||0)<3,reason:'BLOCKADE_ENDED',previous_reason:'BLOCKADED'});}}for(const zoneId of Object.keys(ZONES)){const before=next.naval_control.zones[zoneId].balance,calc=zoneCalculation(next,zoneId,periodKey);next.naval_control.zones[zoneId]={...next.naval_control.zones[zoneId],balance:calc.balance,calculation_status:'CALCULATED',last_calculation:calc};if(before&&before!==calc.balance)events.push({type:'NAVAL_CONTROL_CHANGED',zone_id:zoneId,zone_name:ZONES[zoneId],before,balance:calc.balance,cause,patriot:stageForFaction(calc.balance,'PATRIOT'),british:stageForFaction(calc.balance,'BRITISH')});}return{state:next,events};}
  function setZoneBalance(state,zoneId,balance,cause='海上情勢の変化'){assertZone(zoneId);assertBalance(balance);const next=ensureState(state),before=next.naval_control.zones[zoneId].balance;next.naval_control.zones[zoneId]={...next.naval_control.zones[zoneId],balance,calculation_status:'EXPLICIT_RUNTIME_VALUE'};const event=before===balance?null:{type:'NAVAL_CONTROL_CHANGED',zone_id:zoneId,zone_name:ZONES[zoneId],before,balance,cause,patriot:stageForFaction(balance,'PATRIOT'),british:stageForFaction(balance,'BRITISH')};return{state:next,event};}
  function setPortBlockade(state,cityId,blockadingFaction=null,periodKey=null){if(blockadingFaction!==null)assertFaction(blockadingFaction);const next=ensureState(state),city=next.cities?.[cityId];if(!city)throw new Error('CITY_NOT_FOUND');if(!city.geography?.is_port)throw new Error('NOT_A_PORT');const before=portStatus(city);city.naval.blockaded_by=blockadingFaction;city.naval.blockade_period=blockadingFaction?periodKey:null;city.naval.blockade_pending_period=null;const after=portStatus(city),event=before.operational===after.operational?null:{type:'PORT_OPERATION_CHANGED',city_id:cityId,city_name:city.city_name,zone_id:city.geography.sea_zone_id,operational:after.operational,reason:after.reason,previous_reason:before.reason};return{state:next,event};}
  function activeSiege(state,cityId,blockader){return Object.values(state?.battles||{}).find(b=>b.city_id===cityId&&b.attacker_faction===blockader&&b.defender_faction===enemyFaction(blockader)&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status)&&((b.defender_army_ids||[]).some(id=>Number(state.field_armies?.[id]?.manpower||0)>0)||Number(state.garrisons?.[cityId]?.manpower||0)>0))||null;}
  // Reserve an uninterrupted blockade through the month's opening decisions.
  // It must then be explicitly renewed for one normal command, or released.
  // Only a still-active assault on the originally enemy-held port may qualify.
  function prepareMonthlyBlockadeMaintenance(state,militaryState,periodKey){let next=ensureState(state);const pending=[],released=[];for(const city of Object.values(next.cities||{})){
    const faction=city.naval?.blockaded_by;if(!faction||city.naval.blockade_period===periodKey)continue;
    const siege=activeSiege(militaryState,city.city_id,faction),sea=zoneCalculation(next,city.geography?.sea_zone_id,periodKey,{ignoreBlockades:true}),fullyControlled=stageForFaction(sea.balance,faction).key==='CONTROL';
    if(siege&&city.politics?.military_control==='CONFLICT'&&fullyControlled){city.naval.blockade_pending_period=periodKey;pending.push({city_id:city.city_id,zone_id:city.geography.sea_zone_id,faction,battle_id:siege.id});}
    else{city.naval.blockaded_by=null;city.naval.blockade_period=null;city.naval.blockade_pending_period=null;released.push(city.city_id);}
  }next=expirePeriod(next,periodKey).state;next=recalculateAll(next,periodKey,'港湾封鎖の月初維持判定').state;return{state:next,pending:pending.filter(entry=>next.cities[entry.city_id]?.naval?.blockade_pending_period===periodKey),released};}
  function pendingBlockadeMaintenance(state,periodKey){return Object.values(state?.cities||{}).filter(city=>city.naval?.blockaded_by&&city.naval.blockade_pending_period===periodKey).map(city=>({city_id:city.city_id,city_name:city.city_name,zone_id:city.geography.sea_zone_id,faction:city.naval.blockaded_by}));}
  function expirePeriod(state,periodKey){let next=ensureState(state),changed=false;for(const zone of Object.values(next.naval_control.zones)){
    const committed=accumulatedOperationInfluence(zone,periodKey,true);
    if(zone.operation_influence!==committed){zone.operation_influence=committed;changed=true;}
    for(const faction of FACTIONS){const kept=zone.operations[faction].filter(item=>item.period_key===periodKey);if(kept.length!==zone.operations[faction].length)changed=true;zone.operations[faction]=kept;}
  }for(const city of Object.values(next.cities||{}))if(city.naval?.blockaded_by&&city.naval.blockade_period!==periodKey&&city.naval.blockade_pending_period!==periodKey){city.naval.blockaded_by=null;city.naval.blockade_period=null;city.naval.blockade_pending_period=null;changed=true;}return{state:next,changed};}
  function operationAvailability(state,zoneId,faction,type,periodKey){assertZone(zoneId);assertFaction(faction);if(!OPERATIONS[type])throw new Error('NAVAL_OPERATION_INVALID');const ready=state,zone=readZone(state,zoneId);if(zone.operations[faction].some(item=>item.type===type&&item.period_key===periodKey))return{available:false,reason:'OPERATION_ALREADY_ACTIVE'};if(type==='PRIVATEERING'){const network=portNetwork(ready,zoneId);if(!network[faction].length)return{available:false,reason:'PRIVATEERING_PORT_REQUIRED'};}if(type==='BLOCKADE'){const base=zoneCalculation(ready,zoneId,periodKey,{ignoreBlockades:true}),stage=stageForFaction(base.balance,faction);if(stage.key!=='CONTROL')return{available:false,reason:'FULL_NAVAL_CONTROL_REQUIRED'};const targets=Object.values(ready.cities).filter(city=>city.geography?.sea_zone_id===zoneId&&city.geography?.is_port&&((city.politics?.military_control===enemyFaction(faction)&&isPortOperational(city))||(city.politics?.military_control==='CONFLICT'&&city.naval?.blockaded_by===faction&&city.naval?.blockade_pending_period===periodKey)));if(!targets.length)return{available:false,reason:'BLOCKADE_TARGET_EMPTY'};return{available:true,targets:targets.map(city=>city.city_id)};}return{available:true};}
  function activateOperation(state,zoneId,faction,type,periodKey,option={}){const ready=expirePeriod(state,periodKey).state,availability=operationAvailability(ready,zoneId,faction,type,periodKey);if(!availability.available)throw new Error(availability.reason);const operation={type,label:OPERATIONS[type].label,points:OPERATIONS[type].points,period_key:periodKey,executed_by:faction};let next=ready,portEvent=null;if(type==='BLOCKADE'){if(!availability.targets.includes(option.target_city_id))throw new Error('BLOCKADE_TARGET_INVALID');const previous=Object.values(next.cities).find(city=>city.geography?.sea_zone_id===zoneId&&city.naval?.blockaded_by===faction);if(previous){const cleared=setPortBlockade(next,previous.city_id,null,null);next=cleared.state;}const blocked=setPortBlockade(next,option.target_city_id,faction,periodKey);next=blocked.state;portEvent=blocked.event;operation.target_city_id=option.target_city_id;}next.naval_control.zones[zoneId].operations[faction].push(operation);const recalculated=recalculateAll(next,periodKey,`${OPERATIONS[type].label}の実施`);return{state:recalculated.state,result:{...operation,zone_id:zoneId,zone_name:ZONES[zoneId]},events:[portEvent,...recalculated.events].filter(Boolean)};}
  const SEA_ARRIVAL_RATES=Object.freeze({CONTROL:1.00,ADVANTAGE:.90,CONTESTED:.75,DISADVANTAGE:.55,NO_CONTROL:.35});
  const SEA_ACTION_PROFILES=Object.freeze({
    SEA_RETREAT:{label:'海上撤退',arrival:SEA_ARRIVAL_RATES},
    OVERSEAS_SUPPLY:{label:'海外補給',arrival:SEA_ARRIVAL_RATES},
    BRITISH_HOME_SUPPLY:{label:'英国本国補給',arrival:SEA_ARRIVAL_RATES},
    FOREIGN_AID:{label:'外国援助',arrival:SEA_ARRIVAL_RATES},
    SEA_TRANSPORT:{label:'海上輸送',arrival:SEA_ARRIVAL_RATES},
    LANDING:{label:'上陸作戦',arrival:SEA_ARRIVAL_RATES}
  });
  function seaActionProfile(state,zoneId,faction,actionType,periodKey){assertZone(zoneId);assertFaction(faction);const profile=SEA_ACTION_PROFILES[actionType];if(!profile)throw new Error('SEA_ACTION_INVALID');const calc=zoneCalculation(state,zoneId,periodKey),stage=stageForFaction(calc.balance,faction),arrival=profile.arrival?.[stage.key],success=profile.success?.[stage.key];return{action_type:actionType,label:profile.label,zone_id:zoneId,zone_name:ZONES[zoneId],faction,stage,arrival_rate:Number.isFinite(arrival)?arrival:null,success_rate:Number.isFinite(success)?success:(Number.isFinite(arrival)?arrival:null),interception_rate:Number.isFinite(success)?1-success:0,cargo_loss_rate_on_interception:0,calculation:calc};}
  function resolveSeaAction(state,zoneId,faction,actionType,periodKey,roll=.5){const profile=seaActionProfile(state,zoneId,faction,actionType,periodKey);if(Number.isFinite(profile.arrival_rate))return{...profile,roll:null,success:true,intercepted:false,expected_total_loss_rate:1-profile.arrival_rate};const r=Math.max(0,Math.min(.999999,Number(roll))),success=r<profile.success_rate;return{...profile,roll:r,success,intercepted:!success,expected_total_loss_rate:0};}
  const SEA_ZONE_ORDER=['NORTH','CENTRAL','SOUTH'];
  function seaRouteZones(originZone,destinationZone){assertZone(originZone);assertZone(destinationZone);const a=SEA_ZONE_ORDER.indexOf(originZone),b=SEA_ZONE_ORDER.indexOf(destinationZone),lo=Math.min(a,b),hi=Math.max(a,b);return SEA_ZONE_ORDER.slice(lo,hi+1);}
  function seaRouteProfile(state,originZone,destinationZone,faction,actionType='SEA_TRANSPORT',periodKey){const zones=seaRouteZones(originZone,destinationZone),profiles=zones.map(zoneId=>seaActionProfile(state,zoneId,faction,actionType,periodKey)),arrivalProfiles=profiles.filter(item=>Number.isFinite(item.arrival_rate));if(arrivalProfiles.length){const worst=arrivalProfiles.reduce((a,b)=>b.arrival_rate<a.arrival_rate?b:a);return{action_type:actionType,faction,zones,profiles,arrival_rate:worst.arrival_rate,worst_zone_id:worst.zone_id,worst_zone_name:worst.zone_name,worst_stage:worst.stage};}const worst=profiles.reduce((a,b)=>b.stage.level>a.stage.level?b:a);return{action_type:actionType,faction,zones,profiles,arrival_rate:null,worst_zone_id:worst.zone_id,worst_zone_name:worst.zone_name,worst_stage:worst.stage};}
  function applyArrivalRate(amount,rate){const shipped=Math.max(0,Math.floor(Number(amount)||0)),arrivalRate=Math.max(0,Math.min(1,Number(rate)||0)),arrived=shipped>0&&arrivalRate>0?Math.max(1,Math.floor(shipped*arrivalRate)):0;return{shipped,arrival_rate:arrivalRate,arrived,lost:shipped-arrived};}
  function friendlyOperationalPorts(state,zoneId,faction,excludeCityId=null){assertZone(zoneId);assertFaction(faction);return Object.values(state?.cities||{}).filter(city=>city.city_id!==excludeCityId&&city.geography?.sea_zone_id===zoneId&&city.politics?.military_control===faction&&isPortOperational(city)).map(city=>city.city_id);}
  function seaRetreatCandidates(state,originCityId,faction,periodKey,options={}){
    assertFaction(faction);const origin=state?.cities?.[originCityId];
    if(!origin||!origin.geography?.is_port||!origin.geography?.sea_zone_id||!isPortOperational(origin))return{available:false,reason:'ORIGIN_PORT_UNAVAILABLE',candidates:[]};
    const zoneId=origin.geography.sea_zone_id,profile=seaActionProfile(state,zoneId,faction,'SEA_RETREAT',periodKey),controlForCity=typeof options.controlForCity==='function'?options.controlForCity:city=>city.politics?.military_control;
    const friendly=[],uncontrolled=[];
    for(const city of Object.values(state?.cities||{})){
      if(city.city_id===originCityId||city.geography?.sea_zone_id!==zoneId||!isPortOperational(city))continue;
      const control=controlForCity(city);
      if(control===faction)friendly.push(city.city_id);else if(control==='UNCONTROLLED'&&options.allowUncontrolled!==false)uncontrolled.push(city.city_id);
    }
    const candidates=[...friendly,...uncontrolled];
    if(!candidates.length)return{available:false,reason:'RETREAT_PORT_EMPTY',zone_id:zoneId,profile,candidates:[],friendly_candidates:[],uncontrolled_candidates:[]};
    return{available:true,zone_id:zoneId,profile,candidates,friendly_candidates:friendly,uncontrolled_candidates:uncontrolled};
  }
  return{ZONES,FACTIONS,BALANCES,VIEW_LABELS,OPERATIONS,DEFAULT_FACTORS,SEA_ARRIVAL_RATES,SEA_ACTION_PROFILES,isPortOperational,portStatus,portNetwork,allPortNetworks,ensureState,stageForFaction,balanceFromDifference,operationPoints,portPoints,zoneCalculation,recalculateAll,setZoneBalance,activeSiege,prepareMonthlyBlockadeMaintenance,pendingBlockadeMaintenance,setPortBlockade,expirePeriod,operationAvailability,activateOperation,seaActionProfile,resolveSeaAction,seaRouteZones,seaRouteProfile,applyArrivalRate,friendlyOperationalPorts,seaRetreatCandidates,enemyFaction};
});
