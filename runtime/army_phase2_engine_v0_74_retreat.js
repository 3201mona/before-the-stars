(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArmyPhase2Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const FACTIONS = Object.freeze(['PATRIOT', 'BRITISH']);
  const MINIMUM_EFFECTIVE_GARRISON = 100;
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = code => { throw new Error(code); };
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const requireFaction = (state, faction) => {
    if (!FACTIONS.includes(faction) || !state.factions?.[faction]) fail('FACTION_NOT_FOUND');
    return state.factions[faction];
  };
  const requireArmy = (state, armyId) => {
    const army = state.field_armies?.[armyId];
    if (!army) fail('ARMY_NOT_FOUND');
    return army;
  };
  const requireCommander = (state, commanderId) => {
    const commander = state.commanders?.[commanderId];
    if (!commander) fail('COMMANDER_NOT_FOUND');
    return commander;
  };
  const positiveInteger = (value, code) => {
    if (!Number.isInteger(value) || value <= 0) fail(code);
  };
  const percentage = (value, code) => {
    if (!Number.isFinite(value) || value < 0 || value > 100) fail(code);
  };
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const roundTo = (value, step = 1) => Math.round(value / step) * step;

  function garrisonCapForCity(city, config) {
    const rules = config?.garrison_formation || {};
    const population = Number(city?.bases?.population) || 0;
    const band = (rules.population_cap_bands || []).find(entry => population <= Number(entry.max_population));
    if (band) return Number(band.cap);
    return 2500;
  }

  function normalizeGarrisonState(state, cityState, config) {
    if (!isObject(cityState?.cities)) fail('CANONICAL_CITY_STATE_REQUIRED');
    const next = copy(state), rules = config?.garrison_formation || {};
    for (const faction of FACTIONS) {
      if (!Number.isFinite(next.factions?.[faction]?.treasury)) next.factions[faction].treasury = rules.initial_treasury_per_faction || 3000;
      if (!Number.isFinite(next.factions?.[faction]?.mobilizable_manpower)) next.factions[faction].mobilizable_manpower = config?.field_army_actions?.initial_mobilizable_manpower?.[faction] || 24000;
    }
    if (!isObject(next.forced_recruitment_history)) next.forced_recruitment_history = {};
    if (!Array.isArray(next.opinion_campaign_history)) next.opinion_campaign_history = [];
    for (const [cityId, city] of Object.entries(cityState.cities)) {
      if (!next.garrisons?.[cityId]) continue;
      next.garrisons[cityId].cap = garrisonCapForCity(city, config);
      if (!Number.isFinite(next.garrisons[cityId].morale)) next.garrisons[cityId].morale = Number(city.garrison?.morale) || 60;
      if ((Number(next.garrisons[cityId].manpower) || 0) <= 0) next.garrisons[cityId].faction = null;
      next.garrisons[cityId].rules_status = 'OFFICIAL_POPULATION_BAND_CAP';
    }
    return next;
  }

  function hydrateCanonicalExtensions(seed, cityState, config) {
    if (!isObject(cityState?.cities)) fail('CANONICAL_CITY_STATE_REQUIRED');
    const next = copy(seed);
    next.city_logistics = {};
    next.garrisons = {};
    next.city_security = {};
    for (const cityId of Object.keys(cityState.cities).sort()) {
      const city = cityState.cities[cityId];
      next.city_logistics[cityId] = {
        city_id: cityId,
        food_stock: city.stockpile.FOOD,
        material_stock: city.stockpile.MATERIALS,
        food_production: Number(city.monthly_local_surplus?.FOOD) || 0,
        material_production: Number(city.monthly_local_surplus?.MATERIALS) || 0,
        production_status: 'CANONICAL_MONTHLY_LOCAL_SURPLUS'
      };
      const garrisonManpower = Math.max(0, Number(city.garrison.troops) || 0);
      next.garrisons[cityId] = {
        id: `GAR_${cityId}`,
        city_id: cityId,
        faction: garrisonManpower > 0 && FACTIONS.includes(city.politics.military_control) ? city.politics.military_control : null,
        manpower: garrisonManpower,
        morale: Number(city.garrison.morale) || 60,
        cap: garrisonCapForCity(city, config),
        rules_status: 'OFFICIAL_POPULATION_BAND_CAP'
      };
      next.city_security[cityId] = {
        city_id: cityId,
        unrest: 0,
        rebellion_active: false
      };
    }
    return normalizeGarrisonState(next, cityState, config);
  }

  function validateState(state, canonicalCityIds) {
    const errors = [];
    if (state.schema_version !== 'army-phase2-state/0.7.0') errors.push('SCHEMA_VERSION_INVALID');
    if (!Number.isInteger(state.calendar?.year) || !Number.isInteger(state.calendar?.month) || state.calendar.month < 1 || state.calendar.month > 12) errors.push('CALENDAR_INVALID');
    for (const faction of FACTIONS) {
      const f = state.factions?.[faction];
      if (!f) errors.push(`FACTION_MISSING:${faction}`);
      else if (!Number.isInteger(f.commands_remaining) || f.commands_remaining < 0 || f.commands_remaining > 3) errors.push(`COMMAND_COUNT_INVALID:${faction}`);
    }
    const commanderAssignments = new Map();
    for (const army of Object.values(state.field_armies || {})) {
      if (!state.commanders?.[army.commander_id]) errors.push(`ARMY_COMMANDER_MISSING:${army.id}`);
      if (commanderAssignments.has(army.commander_id)) errors.push(`COMMANDER_ASSIGNED_TWICE:${army.commander_id}`);
      commanderAssignments.set(army.commander_id, army.id);
      if (canonicalCityIds && !canonicalCityIds.includes(army.location_city_id)) errors.push(`ARMY_CITY_INVALID:${army.id}`);
      if (!Number.isInteger(army.manpower) || army.manpower <= 0) errors.push(`ARMY_MANPOWER_INVALID:${army.id}`);
      for (const key of ['morale','training','equipment']) if (!Number.isFinite(army[key]) || army[key] < 0 || army[key] > 100) errors.push(`ARMY_PERCENTAGE_INVALID:${army.id}:${key}`);
    }
    const statKeys = ['leadership','tactics','logistics','politics','charisma'];
    for (const commander of Object.values(state.commanders || {})) {
      for (const key of statKeys) if (!Number.isInteger(commander.stats?.[key]) || commander.stats[key] < 1 || commander.stats[key] > 100) errors.push(`COMMANDER_STAT_INVALID:${commander.id}:${key}`);
    }
    if (state.random?.algorithm !== 'mulberry32' || !Number.isInteger(state.random?.state) || !Number.isInteger(state.random?.calls)) errors.push('RANDOM_STATE_INVALID');
    if (!Array.isArray(state.action_log) || !Number.isInteger(state.next_action_sequence)) errors.push('ACTION_HISTORY_INVALID');
    for (const commander of Object.values(state.commanders || {})) {
      if (commander.assigned_army_id && state.field_armies?.[commander.assigned_army_id]?.commander_id !== commander.id) errors.push(`COMMANDER_ASSIGNMENT_BROKEN:${commander.id}`);
    }
    if (canonicalCityIds) {
      const logisticsIds = Object.keys(state.city_logistics || {}).sort();
      const garrisonIds = Object.keys(state.garrisons || {}).sort();
      const expected = [...canonicalCityIds].sort();
      if (JSON.stringify(logisticsIds) !== JSON.stringify(expected)) errors.push('CITY_LOGISTICS_ID_SET_INVALID');
      if (JSON.stringify(garrisonIds) !== JSON.stringify(expected)) errors.push('GARRISON_ID_SET_INVALID');
      const securityIds = Object.keys(state.city_security || {}).sort();
      if (JSON.stringify(securityIds) !== JSON.stringify(expected)) errors.push('CITY_SECURITY_ID_SET_INVALID');
      for (const cityId of expected) {
        const security = state.city_security?.[cityId];
        if (!Number.isFinite(security?.unrest) || security.unrest < 0 || security.unrest > 100) errors.push(`CITY_UNREST_INVALID:${cityId}`);
        if (typeof security?.rebellion_active !== 'boolean') errors.push(`CITY_REBELLION_STATE_INVALID:${cityId}`);
        const garrison = state.garrisons?.[cityId];
        if (!Number.isInteger(garrison?.manpower) || garrison.manpower < 0) errors.push(`GARRISON_MANPOWER_INVALID:${cityId}`);
        if (!Number.isInteger(garrison?.cap) || garrison.cap < 100 || garrison.manpower > garrison.cap) errors.push(`GARRISON_CAP_INVALID:${cityId}`);
      }
    }
    return { passed: errors.length === 0, errors };
  }

  function canSpendCommand(state, faction, amount = 1) {
    if (!Number.isInteger(amount) || amount < 0) return false;
    const record = state.factions?.[faction];
    return Boolean(record && record.commands_remaining >= amount);
  }

  function spendCommand(state, faction, reason, amount = 1) {
    positiveInteger(amount, 'COMMAND_AMOUNT_INVALID');
    requireFaction(state, faction);
    if (!canSpendCommand(state, faction, amount)) fail('COMMANDS_EXHAUSTED');
    const next = copy(state);
    next.factions[faction].commands_remaining -= amount;
    appendAction(next, {type: 'COMMAND_SPENT', faction, reason, amount});
    return next;
  }

  function representativeArmyAtCity(state, cityId, faction) {
    const rolePriority = {'総司令官': 3, '方面軍司令官': 2, '通常指揮官': 1};
    const commanderOrder = new Map(Object.keys(state.commanders || {}).map((id, index) => [id, index]));
    return Object.values(state.field_armies || {})
      .filter(army => army.location_city_id === cityId && army.faction === faction && army.manpower > 0)
      .sort((a, b) => {
        const commanderA = state.commanders?.[a.commander_id] || {};
        const commanderB = state.commanders?.[b.commander_id] || {};
        return Number(commanderB.stats?.politics || 0) - Number(commanderA.stats?.politics || 0)
          || Number(commanderB.stats?.charisma || 0) - Number(commanderA.stats?.charisma || 0)
          || (rolePriority[commanderB.role] || 0) - (rolePriority[commanderA.role] || 0)
          || Number(commanderB.stats?.leadership || 0) - Number(commanderA.stats?.leadership || 0)
          || (commanderOrder.get(commanderA.id) ?? Number.MAX_SAFE_INTEGER) - (commanderOrder.get(commanderB.id) ?? Number.MAX_SAFE_INTEGER);
      })[0] || null;
  }

  function previewOpinionCampaign(state, cityState, cityId, tierId, config, commanderId = undefined) {
    const rules = config.opinion_campaign;
    const faction = state.current_faction;
    const city = cityState?.cities?.[cityId];
    const tier = rules?.tiers?.[tierId];
    if (!FACTIONS.includes(faction)) fail('FACTION_INVALID');
    if (!city) fail('CITY_NOT_FOUND');
    if (!tier) fail('OPINION_TIER_INVALID');
    if (!canSpendCommand(state, faction, rules.command_cost || 1)) fail('COMMANDS_EXHAUSTED');
    if ((Number(state.factions[faction].treasury) || 0) < tier.treasury_cost) fail('TREASURY_INSUFFICIENT');
    const control = militaryStatus(state, cityId).control;
    const controlMultiplier = control === faction ? rules.control_multiplier.own : control === 'CONFLICT' || control === 'UNCONTROLLED' ? rules.control_multiplier.neutral : rules.control_multiplier.enemy;
    let representativeArmy = null, commander = null;
    if (commanderId !== undefined && commanderId !== null) {
      representativeArmy = Object.values(state.field_armies || {}).find(army => army.commander_id === commanderId && army.location_city_id === cityId && army.faction === faction && army.manpower > 0) || null;
      commander = representativeArmy ? state.commanders?.[representativeArmy.commander_id] : null;
      if (!representativeArmy || !commander || representativeArmy.acted_this_month) fail('COMMANDER_NOT_AVAILABLE');
      if (control !== faction) fail('COMMANDER_NOT_AVAILABLE');
    } else if (commanderId === undefined) {
      representativeArmy = representativeArmyAtCity(state, cityId, faction);
      commander = representativeArmy ? state.commanders?.[representativeArmy.commander_id] : null;
    }
    const politics = Number(commander?.stats?.politics || 0);
    const politicsRule=rules.politics_multiplier||{}, politicsBase=Number(politicsRule.base_at_50??1.15), politicsPerPoint=Number(politicsRule.per_point??0.006);
    const politicsMultiplier = !commander ? 1 : clamp(politicsBase + (politics - 50) * politicsPerPoint, Number(politicsRule.min??0.85), Number(politicsRule.max??1.45));
    const monthKey = `${state.calendar.year}-${state.calendar.month}`;
    const previousUses = (state.opinion_campaign_history || []).filter(entry => entry.month === monthKey && entry.city_id === cityId && entry.faction === faction).length;
    const repeatMultiplier = rules.repeat_multiplier[Math.min(previousUses, rules.repeat_multiplier.length - 1)];
    const support = Number(city.politics.independence_support) || 0;
    const resistanceMultiplier = Math.abs(support - 50) >= 36 ? rules.resistance_multiplier.strong : Math.abs(support - 50) >= 21 ? rules.resistance_multiplier.established : rules.resistance_multiplier.fluid;
    const magnitude = Math.max(1, Math.round(tier.base_effect * controlMultiplier * politicsMultiplier * repeatMultiplier * resistanceMultiplier));
    const requestedChange = faction === 'PATRIOT' ? magnitude : -magnitude;
    const after = clamp(support + requestedChange, 0, 100);
    return {
      city_id: cityId, faction, tier_id: tierId, tier_label: tier.label,
      treasury_cost: tier.treasury_cost, command_cost: rules.command_cost || 1,
      before: support, after, support_change: after - support, control,
      control_multiplier: controlMultiplier, representative_army_id: representativeArmy?.id || null,
      commander_id: commander?.id || null, commander_name: commander?.name || null,
      politics: commander ? politics : null, politics_multiplier: politicsMultiplier,
      previous_uses_this_month: previousUses, repeat_multiplier: repeatMultiplier,
      resistance_multiplier: resistanceMultiplier
    };
  }

  function executeOpinionCampaign(state, cityState, cityId, tierId, config, commanderId = undefined) {
    const result = previewOpinionCampaign(state, cityState, cityId, tierId, config, commanderId);
    const next = copy(state), nextCity = copy(cityState);
    next.factions[result.faction].treasury -= result.treasury_cost;
    next.factions[result.faction].commands_remaining -= result.command_cost;
    if (result.representative_army_id && next.field_armies?.[result.representative_army_id]) next.field_armies[result.representative_army_id].acted_this_month = true;
    nextCity.cities[cityId].politics.independence_support = result.after;
    next.opinion_campaign_history = next.opinion_campaign_history || [];
    next.opinion_campaign_history.push({month:`${next.calendar.year}-${next.calendar.month}`, ...copy(result)});
    appendAction(next, {type:'OPINION_CAMPAIGN_EXECUTED', ...copy(result)});
    return {state:next, city_state:nextCity, result};
  }

  function appendAction(state, entry) {
    if (!Array.isArray(state.action_log)) state.action_log = [];
    if (!Number.isInteger(state.next_action_sequence)) state.next_action_sequence = state.action_log.length + 1;
    state.action_log.push({sequence: state.next_action_sequence++, year: state.calendar.year, month: state.calendar.month, turn_index: state.calendar.turn_index, ...copy(entry)});
  }

  function nextRandom(state) {
    if (state.random?.algorithm !== 'mulberry32') fail('RANDOM_STATE_INVALID');
    const next = copy(state);
    let t = (next.random.state + 0x6D2B79F5) >>> 0;
    next.random.state = t;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    next.random.calls += 1;
    appendAction(next, {type:'RANDOM_USED', call:next.random.calls, value_numerator:Math.floor(value*4294967296)});
    return {state:next,value};
  }

  function createCommander(state, commander) {
    if (!commander?.id) fail('COMMANDER_ID_REQUIRED');
    if (state.commanders?.[commander.id]) fail('COMMANDER_ID_DUPLICATE');
    if (!FACTIONS.includes(commander.faction)) fail('COMMANDER_FACTION_INVALID');
    const next = copy(state);
    next.commanders[commander.id] = {
      ...copy(commander),
      assigned_army_id: null
    };
    return next;
  }

  function createFieldArmy(state, army) {
    if (!army?.id) fail('ARMY_ID_REQUIRED');
    if (state.field_armies?.[army.id]) fail('ARMY_ID_DUPLICATE');
    const commander = requireCommander(state, army.commander_id);
    if (commander.assigned_army_id) fail('COMMANDER_ALREADY_ASSIGNED');
    if (army.faction !== commander.faction) fail('ARMY_COMMANDER_FACTION_MISMATCH');
    if (!state.city_logistics?.[army.location_city_id]) fail('ARMY_CITY_INVALID');
    positiveInteger(army.manpower, 'ARMY_MANPOWER_INVALID');
    percentage(army.morale, 'ARMY_MORALE_INVALID');
    percentage(army.training, 'ARMY_TRAINING_INVALID');
    percentage(army.equipment, 'ARMY_EQUIPMENT_INVALID');
    const next = copy(state);
    next.field_armies[army.id] = {
      id: army.id,
      faction: army.faction,
      commander_id: army.commander_id,
      location_city_id: army.location_city_id,
      manpower: army.manpower,
      morale: army.morale,
      training: army.training,
      equipment: army.equipment,
      acted_this_month: false,
      battle_id: null
    };
    next.commanders[army.commander_id].assigned_army_id = army.id;
    return next;
  }

  function inUnresolvedBattle(state, army) {
    return Boolean(army.battle_id && ['awaiting_tactic','active','awaiting_continuation'].includes(state.battles?.[army.battle_id]?.status));
  }

  function executeArmyAction(state, armyId, actionType, config) {
    const army = requireArmy(state, armyId);
    if (inUnresolvedBattle(state, army)) fail('ARMY_IN_UNRESOLVED_BATTLE');
    if (army.acted_this_month) fail('ARMY_ALREADY_ACTED');
    const cost = config.command_costs?.[actionType];
    if (cost !== 1) fail('NORMAL_ARMY_ACTION_INVALID');
    if (!canSpendCommand(state, army.faction, cost)) fail('COMMANDS_EXHAUSTED');
    const next = copy(state);
    next.factions[army.faction].commands_remaining -= cost;
    next.field_armies[armyId].acted_this_month = true;
    appendAction(next, {type: 'ARMY_ACTION', action_type: actionType, army_id: armyId, faction: army.faction, command_cost: cost});
    return next;
  }

  function moveFieldArmy(state, armyId, destinationCityId, routeType, config) {
    const army = requireArmy(state, armyId);
    if (!state.city_logistics?.[destinationCityId]) fail('ARMY_DESTINATION_INVALID');
    if (destinationCityId === army.location_city_id) fail('ARMY_DESTINATION_SAME');
    let next = executeArmyAction(state, armyId, 'ARMY_MOVE', config);
    const originCityId = army.location_city_id;
    next.field_armies[armyId].location_city_id = destinationCityId;
    appendAction(next, {type:'ARMY_MOVED', army_id:armyId, faction:army.faction, origin_city_id:originCityId, destination_city_id:destinationCityId, route_type:routeType, naval_control_ignored:routeType==='SEA_MOVE'});
    return next;
  }

  function moveFieldArmies(state, armyIds, destinationCityId, routeType, config) {
    const ids=[...new Set(armyIds||[])];
    if(!ids.length) fail('ARMY_SELECTION_REQUIRED');
    const armies=ids.map(id=>requireArmy(state,id)), first=armies[0];
    if(!state.city_logistics?.[destinationCityId]) fail('ARMY_DESTINATION_INVALID');
    if(destinationCityId===first.location_city_id) fail('ARMY_DESTINATION_SAME');
    if(armies.some(a=>a.faction!==first.faction||a.location_city_id!==first.location_city_id)) fail('ARMY_GROUP_MOVE_INVALID');
    if(armies.some(a=>inUnresolvedBattle(state,a))) fail('ARMY_IN_UNRESOLVED_BATTLE');
    if(armies.some(a=>a.acted_this_month)) fail('ARMY_ALREADY_ACTED');
    if(!canSpendCommand(state,first.faction,1)) fail('COMMANDS_EXHAUSTED');
    let next=spendCommand(state,first.faction,'ARMY_GROUP_MOVE',1), originCityId=first.location_city_id;
    for(const id of ids){
      next.field_armies[id].acted_this_month=true;
      next.field_armies[id].location_city_id=destinationCityId;
      appendAction(next,{type:'ARMY_MOVED',army_id:id,faction:first.faction,origin_city_id:originCityId,destination_city_id:destinationCityId,route_type:routeType,naval_control_ignored:routeType==='SEA_MOVE',group_move:true});
    }
    appendAction(next,{type:'ARMY_GROUP_MOVED',faction:first.faction,army_ids:ids,origin_city_id:originCityId,destination_city_id:destinationCityId,route_type:routeType,command_cost:1});
    return next;
  }

  function politicalPeriodKey(state) {
    return `${state.calendar.year}-Q${Math.floor((state.calendar.month - 1) / 3) + 1}`;
  }

  // Forced conscription resets at the political-phase boundary, not calendar quarters.
  // Cycles: Mar-May, Jun-Aug, Sep-Nov, Dec-Feb.
  function conscriptionPeriodKey(state) {
    const year=Number(state.calendar.year), month=Number(state.calendar.month);
    if(month>=3&&month<=5)return `${year}-P03`;
    if(month>=6&&month<=8)return `${year}-P06`;
    if(month>=9&&month<=11)return `${year}-P09`;
    if(month===12)return `${year}-P12`;
    return `${year-1}-P12`;
  }

  function trainingInstructorScore(commander, params) {
    const weights=params.training_instructor_weights||{leadership:.6,tactics:.4},stats=commander?.stats||{};
    return clamp((Number(stats.leadership)||0)*(Number(weights.leadership)||.6)+(Number(stats.tactics)||0)*(Number(weights.tactics)||.4),0,100);
  }
  function trainingInstructorBonus(commander, params) {
    const score=trainingInstructorScore(commander,params),bands=params.training_instructor_bonus_bands||[{min:85,bonus:2},{min:70,bonus:1},{min:55,bonus:0},{min:0,bonus:-1}];
    const band=[...bands].sort((a,b)=>Number(b.min)-Number(a.min)).find(entry=>score>=Number(entry.min));
    let bonus=Number(band?.bonus)||0;
    const traitRule=params.training_instructor_trait_bonus||{tag:'TRAINING_INSTRUCTOR',trait:'大陸軍教練',bonus:1,max_bonus:2};
    const trainingInstructor=commander?.tags?.includes?.(traitRule.tag)||commander?.traits?.includes?.(traitRule.trait);
    if(trainingInstructor) bonus=Math.min(Number(traitRule.max_bonus??2),bonus+Number(traitRule.bonus??1));
    return bonus;
  }
  function trainingGain(army, commander, params) {
    const bands = params.training_gain_bands || [{max:29,gain:9},{max:49,gain:8},{max:69,gain:7},{max:84,gain:6},{max:100,gain:5}];
    const base = (bands.find(entry => army.training <= entry.max) || bands[bands.length - 1]).gain;
    return Math.min(100 - army.training, Math.max(0,base + trainingInstructorBonus(commander,params)));
  }

  function recruitmentQuality(army, recruits, quality) {
    const total = army.manpower + recruits;
    const weighted = key => Math.round((army[key] * army.manpower + quality[key] * recruits) / total);
    return {manpower:total, morale:weighted('morale'), training:weighted('training'), equipment:weighted('equipment')};
  }

  function forcedActionCooperationFactor(cityRecord, params) {
    const cooperation = clamp(Number(cityRecord?.politics?.public_cooperation) || 0, 0, 100);
    const bands = params.forced_action_cooperation_factor_bands || [
      {min:80,factor:1.00},{min:65,factor:0.95},{min:50,factor:0.85},
      {min:35,factor:0.75},{min:20,factor:0.60},{min:0,factor:0.45}
    ];
    const band = [...bands].sort((a,b)=>Number(b.min)-Number(a.min)).find(entry => cooperation >= Number(entry.min));
    return clamp(Number(band?.factor) || 1, 0.1, 1.25);
  }

  function previewFieldArmyAction(state, armyId, actionType, config, cityRecord, option = {}) {
    const army = requireArmy(state, armyId), commander = requireCommander(state, army.commander_id), params = config.field_army_actions || {};
    if (inUnresolvedBattle(state, army)) fail('ARMY_IN_UNRESOLVED_BATTLE');
    if (!['TRAINING','EQUIPMENT_PURCHASE','REGULAR_RECRUITMENT','FORCED_CONSCRIPTION','FORCED_REQUISITION'].includes(actionType)) fail('ARMY_IMPROVEMENT_INVALID');
    if (!cityRecord || cityRecord.city_id !== army.location_city_id) fail('ARMY_CITY_RECORD_REQUIRED');
    const logistics = commander.stats.logistics, logisticsFactor = clamp(1 - (logistics - 50) * (params.logistics_cost_rate || 0.003), params.logistics_cost_min_factor || 0.85, params.logistics_cost_max_factor || 1.15);
    const result = {action_type:actionType, army_id:armyId, city_id:army.location_city_id, command_cost:1, before:{manpower:army.manpower,morale:army.morale,training:army.training,equipment:army.equipment}, treasury_cost:0, materials_cost:0, mobilizable_manpower_cost:0, support_change:0, cooperation_change:0};
    if (actionType === 'TRAINING') {
      const gain = trainingGain(army, commander, params); if (gain <= 0) fail('TRAINING_ALREADY_MAXIMUM');
      const instructorScore=trainingInstructorScore(commander,params),instructorBonus=trainingInstructorBonus(commander,params),moraleGain=Math.max(0,Number(params.training_morale_gain??3)),moraleCap=clamp(Number(params.training_morale_cap??89),0,100),moraleAfter=army.morale>=moraleCap?army.morale:Math.min(moraleCap,army.morale+moraleGain);
      result.training_gain = gain; result.training_instructor_score=Math.round(instructorScore*10)/10;result.training_instructor_bonus=instructorBonus;result.morale_gain=moraleAfter-army.morale;result.after = {...result.before, morale:moraleAfter, training:army.training + gain};
    }
    if (actionType === 'EQUIPMENT_PURCHASE') {
      const requested = Number(option.equipment_gain || 10); if (![10,20,30].includes(requested)) fail('EQUIPMENT_GAIN_INVALID');
      const gain = Math.min(requested, 100 - army.equipment); if (gain <= 0) fail('EQUIPMENT_ALREADY_MAXIMUM');
      const thousand = army.manpower / 1000;
      result.equipment_gain = gain;
      result.materials_cost = Math.max(1, Math.ceil(thousand * gain * (params.equipment_materials_per_1000_per_point || 8) * logisticsFactor));
      result.treasury_cost = Math.max(1, Math.ceil(thousand * gain * (params.equipment_funds_per_1000_per_point || 2) * logisticsFactor));
      result.after = {...result.before, equipment:army.equipment + gain};
    }
    if (actionType === 'REGULAR_RECRUITMENT') {
      const recruits = roundTo(clamp(300 + commander.stats.charisma * 1.5 + Number(cityRecord.politics.public_cooperation) * 1.5, 300, 600), 10);
      result.recruits = recruits; result.mobilizable_manpower_cost = params.recruitment_mobilizable_manpower_cost===true?recruits:0;
      result.materials_cost = Math.max(1, Math.ceil(recruits * (params.regular_recruit_materials_per_man || 0.2) * logisticsFactor));
      result.treasury_cost = Math.max(1, Math.ceil(recruits * (params.regular_recruit_funds_per_man || 0.3) * logisticsFactor));
      result.after = recruitmentQuality(army, recruits, params.regular_recruit_quality || {morale:45,training:25,equipment:20});
    }
    if (actionType === 'FORCED_REQUISITION') {const rq=params.forced_requisition||{},period=politicalPeriodKey(state),key=`${period}:${army.faction}:FORCED_REQUISITION`,history=state.forced_requisition_history||{},count=Number(history[key])||0,steps=rq.penalty_steps||[2,4,6,8],penalty=steps[Math.min(count,steps.length-1)]||2,cooperationFactor=forcedActionCooperationFactor(cityRecord,params),logisticsRule=rq.logistics_multiplier||{},logisticsMultiplier=clamp(Number(logisticsRule.base_at_50??1)+(clamp(Number.isFinite(Number(commander?.stats?.logistics))?Number(commander.stats.logistics):50,0,100)-50)*Number(logisticsRule.per_point??0.003),Number(logisticsRule.min??0.85),Number(logisticsRule.max??1.15)),baseFood=Math.round((Number(rq.food_gain)||500)*cooperationFactor*logisticsMultiplier),baseMaterials=Math.round((Number(rq.materials_gain)||250)*cooperationFactor*logisticsMultiplier);result.food_gain=Math.min(baseFood,Math.max(0,(Number(cityRecord?.capacity?.FOOD)||0)-(Number(cityRecord?.stockpile?.FOOD)||0)));result.materials_gain=Math.min(baseMaterials,Math.max(0,(Number(cityRecord?.capacity?.MATERIALS)||0)-(Number(cityRecord?.stockpile?.MATERIALS)||0)));result.cooperation_factor=cooperationFactor;result.logistics_multiplier=logisticsMultiplier;result.support_change=army.faction==='PATRIOT'?-penalty:penalty;result.cooperation_change=-penalty;result.requisition_count=count+1;return result;}
    if (actionType === 'FORCED_CONSCRIPTION') {
      const period = `${conscriptionPeriodKey(state)}:${army.faction}`, history = state.forced_recruitment_history?.[period] || {total:0,cities:{}}, cityCount = history.cities?.[army.location_city_id] || 0;
      if (cityCount >= (params.forced_city_limit_per_period || 2)) fail('FORCED_CONSCRIPTION_CITY_LIMIT');
      const baseRecruits=clamp(500 + Number(cityRecord.bases.population) * 4, 500, 900), charismaFactor=clamp(0.90 + clamp(Number(commander.stats.charisma)||50,0,100)*0.002,0.90,1.10), cooperationFactor=forcedActionCooperationFactor(cityRecord,params), recruits = roundTo(baseRecruits*charismaFactor*cooperationFactor, 10), penalty = [2,4,6][Math.min(2, history.total || 0)];
      result.recruits = recruits; result.mobilizable_manpower_cost = params.recruitment_mobilizable_manpower_cost===true?recruits:0; result.cooperation_factor=cooperationFactor; result.support_change = army.faction === 'PATRIOT' ? -penalty : penalty; result.cooperation_change = -penalty; result.period_key = period; result.period_total_after = (history.total || 0) + 1; result.city_uses_after = cityCount + 1;
      result.treasury_cost = Math.max(1, Math.ceil(recruits * (params.forced_recruit_funds_per_man || 0.15) * logisticsFactor));
      result.after = recruitmentQuality(army, recruits, params.forced_recruit_quality || {morale:35,training:15,equipment:10});
    }
    return result;
  }

  function improveFieldArmy(state, armyId, actionType, config, cityRecord, option = {}) {
    const preview = previewFieldArmyAction(state, armyId, actionType, config, cityRecord, option), army = requireArmy(state, armyId);
    if ((state.factions[army.faction].treasury || 0) < preview.treasury_cost) fail('TREASURY_INSUFFICIENT');
    if ((state.city_logistics[army.location_city_id]?.material_stock || 0) < preview.materials_cost) fail('MATERIALS_INSUFFICIENT');
    if ((state.factions[army.faction].mobilizable_manpower || 0) < preview.mobilizable_manpower_cost) fail('MOBILIZABLE_MANPOWER_INSUFFICIENT');
    let next = executeArmyAction(state, armyId, actionType, config);
    Object.assign(next.field_armies[armyId], preview.after);
    next.factions[army.faction].treasury -= preview.treasury_cost;
    next.factions[army.faction].mobilizable_manpower -= preview.mobilizable_manpower_cost;
    next.city_logistics[army.location_city_id].material_stock -= preview.materials_cost;
    if (actionType === 'FORCED_REQUISITION') {const period=politicalPeriodKey(next),key=`${period}:${army.faction}:FORCED_REQUISITION`;next.forced_requisition_history=next.forced_requisition_history||{};next.forced_requisition_history[key]=(Number(next.forced_requisition_history[key])||0)+1;}
    if (actionType === 'FORCED_CONSCRIPTION') {
      const history = next.forced_recruitment_history[preview.period_key] || {total:0,cities:{}};
      history.total = preview.period_total_after; history.cities[army.location_city_id] = preview.city_uses_after; next.forced_recruitment_history[preview.period_key] = history;
    }
    appendAction(next, {type:'ARMY_IMPROVED', army_id:armyId, faction:army.faction, improvement:actionType, preview});
    return {state:next, result:preview};
  }

  const ACTIVE_BATTLE_STATUSES = new Set(['awaiting_tactic','active','awaiting_continuation']);

  function battleSupplyStatus(state, armyOrId) {
    const army = typeof armyOrId === 'string' ? state.field_armies?.[armyOrId] : armyOrId;
    if (!army) return {connected:false, reason:'ARMY_NOT_FOUND', city_id:null, food_stock:0, material_stock:0};
    const cityId = army.supply_city_id || null;
    if (!cityId || !army.battle_id) return {connected:true, reason:'NOT_BATTLE_SUPPLIED', city_id:cityId, food_stock:cityId?Number(state.city_logistics?.[cityId]?.food_stock)||0:0, material_stock:cityId?Number(state.city_logistics?.[cityId]?.material_stock)||0:0};
    const battle = state.battles?.[army.battle_id];
    if (!battle || !ACTIVE_BATTLE_STATUSES.has(battle.status)) return {connected:true, reason:'BATTLE_NOT_ACTIVE', city_id:cityId, food_stock:Number(state.city_logistics?.[cityId]?.food_stock)||0, material_stock:Number(state.city_logistics?.[cityId]?.material_stock)||0};
    if (army.reinforcement_route_mode==='SEA' && army.sea_supply_blockaded===true) return {connected:false, reason:'SEA_REINFORCEMENT_SUPPLY_PORT_BLOCKADED', city_id:cityId, food_stock:0, material_stock:0};
    const enemyFaction = army.faction === 'PATRIOT' ? 'BRITISH' : 'PATRIOT';
    const sourceGarrison = state.garrisons?.[cityId];
    const ownEffectiveGarrison = Boolean(sourceGarrison && sourceGarrison.faction === army.faction && Number(sourceGarrison.manpower||0) >= MINIMUM_EFFECTIVE_GARRISON);
    const ownPhysicalArmy = Object.values(state.field_armies||{}).some(other => {
      if (!other || other.id === army.id || other.faction !== army.faction || other.location_city_id !== cityId || Number(other.manpower||0) <= 0) return false;
      if (!other.battle_id) return true;
      const otherBattle = state.battles?.[other.battle_id];
      return Boolean(otherBattle && otherBattle.city_id === cityId && ACTIVE_BATTLE_STATUSES.has(otherBattle.status));
    });
    if ((army.supply_cut === true || army.control_anchor_lost === true) && !ownEffectiveGarrison && !ownPhysicalArmy) return {connected:false, reason:army.supply_cut_reason||'SUPPLY_SOURCE_CONTROL_LOST', city_id:cityId, food_stock:0, material_stock:0};
    if (sourceGarrison && sourceGarrison.faction === enemyFaction && Number(sourceGarrison.manpower||0) >= MINIMUM_EFFECTIVE_GARRISON) return {connected:false, reason:'SUPPLY_SOURCE_ENEMY_GARRISON', city_id:cityId, food_stock:0, material_stock:0};
    const enemyOccupier = Object.values(state.field_armies||{}).some(other => {
      if (!other || other.id === army.id || other.faction !== enemyFaction || other.location_city_id !== cityId || Number(other.manpower||0) <= 0) return false;
      if (!other.battle_id) return true;
      const otherBattle = state.battles?.[other.battle_id];
      return Boolean(otherBattle && otherBattle.city_id === cityId && ACTIVE_BATTLE_STATUSES.has(otherBattle.status));
    });
    if (enemyOccupier) return {connected:false, reason:'SUPPLY_SOURCE_ENEMY_OCCUPATION', city_id:cityId, food_stock:0, material_stock:0};
    return {connected:true, reason:'SUPPLY_SOURCE_HELD', city_id:cityId, food_stock:Number(state.city_logistics?.[cityId]?.food_stock)||0, material_stock:Number(state.city_logistics?.[cityId]?.material_stock)||0};
  }

  function syncBattleSeaSupplyBlockades(state, cityState) {
    const next=copy(state),changed=[];
    for(const army of Object.values(next.field_armies||{})){
      if(!army?.battle_id||army.reinforcement_route_mode!=='SEA'||!army.supply_city_id)continue;
      const source=cityState?.cities?.[army.supply_city_id],battle=next.battles?.[army.battle_id],destination=cityState?.cities?.[battle?.city_id],sourceBlockadedBy=source?.naval?.blockaded_by||null,destinationBlockadedBy=destination?.naval?.blockaded_by||null,sourceBlocked=Boolean(sourceBlockadedBy&&sourceBlockadedBy!==army.faction),destinationBlocked=Boolean(destinationBlockadedBy&&destinationBlockadedBy!==army.faction),blocked=sourceBlocked||destinationBlocked,before=Boolean(army.sea_supply_blockaded),blockedBy=sourceBlocked?sourceBlockadedBy:destinationBlockadedBy,blockedPortId=sourceBlocked?army.supply_city_id:(destinationBlocked?battle?.city_id:null);
      if(blocked){army.sea_supply_blockaded=true;army.sea_supply_blockaded_port_id=blockedPortId;}else{delete army.sea_supply_blockaded;delete army.sea_supply_blockaded_port_id;}
      if(before!==blocked){changed.push({army_id:army.id,battle_id:army.battle_id,city_id:army.supply_city_id,battle_city_id:battle?.city_id||null,blocked,blockaded_by:blockedBy,blocked_port_id:blockedPortId});appendAction(next,{type:blocked?'SEA_REINFORCEMENT_SUPPLY_BLOCKED':'SEA_REINFORCEMENT_SUPPLY_RESTORED',army_id:army.id,battle_id:army.battle_id,city_id:army.supply_city_id,battle_city_id:battle?.city_id||null,blockaded_by:blockedBy,blocked_port_id:blockedPortId,resources_zeroed:blocked?['FOOD','MATERIALS']:[]});}
    }
    return{state:next,changed};
  }

  function cutBattleSupplyFromCity(state, cityId, faction, reason='SUPPLY_SOURCE_CONTROL_LOST', excludeBattleId=null) {
    const next=copy(state),cut=[];
    for(const army of Object.values(next.field_armies||{})){
      if(!army?.battle_id||army.supply_city_id!==cityId)continue;
      if(faction&&army.faction!==faction)continue;
      const battle=next.battles?.[army.battle_id];
      if(excludeBattleId&&army.battle_id===excludeBattleId)continue;
      if(!battle||!ACTIVE_BATTLE_STATUSES.has(battle.status))continue;
      army.supply_cut=true;army.control_anchor_lost=true;army.supply_cut_city_id=cityId;army.supply_cut_reason=reason;army.supply_cut_since={year:next.calendar?.year??null,month:next.calendar?.month??null};
      cut.push(army.id);
      appendAction(next,{type:'BATTLE_SUPPLY_CUT',army_id:army.id,battle_id:army.battle_id,city_id:cityId,faction:army.faction,resources_zeroed:['FOOD','MATERIALS'],reason});
    }
    return{state:next,army_ids:cut};
  }

  function applyBattleSupplyCutMonthEffects(state, config) {
    const next=copy(state),applied=[],rules=config?.battle_supply_cut||{},perResource=Number(rules.morale_loss_per_resource_per_month??8),resources=Array.isArray(rules.resources_zeroed)?rules.resources_zeroed:['FOOD','MATERIALS'];
    for(const army of Object.values(next.field_armies||{})){
      if(!army?.battle_id||!army.supply_city_id)continue;
      const status=battleSupplyStatus(next,army);
      if(status.connected){
        if(army.supply_cut){army.supply_cut=false;army.control_anchor_lost=false;delete army.supply_cut_city_id;delete army.supply_cut_reason;delete army.supply_cut_since;appendAction(next,{type:'BATTLE_SUPPLY_RESTORED',army_id:army.id,battle_id:army.battle_id,city_id:army.supply_city_id});}
        continue;
      }
      army.supply_cut=true;army.supply_cut_city_id=army.supply_city_id;army.supply_cut_reason=status.reason||army.supply_cut_reason||'SUPPLY_SOURCE_CONTROL_LOST';
      if(!army.supply_cut_since)army.supply_cut_since={year:next.calendar?.year??null,month:next.calendar?.month??null};
      const before=Number(army.morale)||0,loss=Math.max(0,perResource*resources.length);army.morale=clamp(before-loss,0,100);
      const event={type:'BATTLE_SUPPLY_CUT_MONTH',army_id:army.id,battle_id:army.battle_id,city_id:army.supply_city_id,resources_zeroed:[...resources],food_stock:0,material_stock:0,before_morale:before,after_morale:army.morale,morale_loss:before-army.morale,reason:army.supply_cut_reason};applied.push(event);appendAction(next,event);
      if(army.morale<=0){const commander=next.commanders?.[army.commander_id];if(commander){commander.assigned_army_id=null;commander.status='INACTIVE_ROUTED';}appendAction(next,{type:'FIELD_ARMY_ROUTED',army_id:army.id,city_id:army.supply_city_id,reason:'BATTLE_SUPPLY_CUT_MORALE_ZERO'});delete next.field_armies[army.id];}
    }
    return{state:next,applied};
  }

  function applyLogisticsShortageEffects(state, events) {
    const next = copy(state), applied=[], groups=new Map();
    for (const event of events || []) if (['FOOD_SHORTAGE','MATERIALS_SHORTAGE'].includes(event.type)) {
      if (!groups.has(event.city_id)) groups.set(event.city_id,[]);
      groups.get(event.city_id).push(event);
    }
    for (const [cityId, cityEvents] of groups) {
      const fieldLoss=cityEvents.reduce((sum,event)=>sum+(Number(event.field_army_morale_loss)||0),0),desertionRate=cityEvents.reduce((sum,event)=>sum+(Number(event.garrison_desertion_rate)||0),0);
      for (const army of Object.values(next.field_armies || {})) if ((army.supply_city_id||army.location_city_id) === cityId && (!army.supply_city_id || battleSupplyStatus(next,army).connected)) { const before=army.morale; army.morale=clamp(before-fieldLoss,0,100); applied.push({type:'FIELD_ARMY_MORALE_LOSS',army_id:army.id,city_id:cityId,before,after:army.morale,loss:before-army.morale,shortage_resources:cityEvents.map(event=>event.resource)}); if(army.morale<=0){const commander=next.commanders?.[army.commander_id];if(commander){commander.assigned_army_id=null;commander.status='INACTIVE_ROUTED';}applied.push({type:'FIELD_ARMY_ROUTED',army_id:army.id,city_id:cityId,reason:'MORALE_ZERO'});delete next.field_armies[army.id];} }
      const garrison=next.garrisons?.[cityId];let deserted=0;
      if(garrison&&garrison.manpower>0){const before=garrison.manpower;deserted=Math.min(before,Math.max(10,Math.round(before*desertionRate/10)*10));garrison.manpower-=deserted;applied.push({type:'GARRISON_DESERTION',city_id:cityId,before,after:garrison.manpower,deserted,shortage_resources:cityEvents.map(event=>event.resource)});}
      for(const event of cityEvents){event.garrison_deserted=deserted;event.garrison_after=garrison?.manpower||0;event.total_field_army_morale_loss=fieldLoss;event.total_garrison_desertion_rate=desertionRate;}
    }
    for (const entry of applied) appendAction(next, entry);
    return {state:next, applied};
  }
  const applyFoodShortageEffects=applyLogisticsShortageEffects;

  function logisticsTroopsByCity(state) {
    const totals={};
    for(const army of Object.values(state.field_armies||{})){
      const cityId=army.supply_city_id||army.location_city_id;
      if(!cityId)continue;
      if(army.supply_city_id&&!battleSupplyStatus(state,army).connected)continue;
      totals[cityId]=(totals[cityId]||0)+Math.max(0,Number(army.manpower)||0);
    }
    return totals;
  }

  function logisticsConsumptionTroopsByCity(state, config) {
    const totals={},details={},rules=config?.field_army_actions||{},rate=Number(rules.logistics_cost_rate??0.003),minFactor=Number(rules.logistics_cost_min_factor??0.85),maxFactor=Number(rules.logistics_cost_max_factor??1.15);
    for(const army of Object.values(state.field_armies||{})){
      const cityId=army.supply_city_id||army.location_city_id;if(!cityId)continue;
      if(army.supply_city_id&&!battleSupplyStatus(state,army).connected)continue;
      const commander=state.commanders?.[army.commander_id],logistics=clamp(Number(commander?.stats?.logistics??50),0,100),factor=clamp(1-(logistics-50)*rate,minFactor,maxFactor),manpower=Math.max(0,Number(army.manpower)||0),effective=manpower*factor;
      totals[cityId]=(totals[cityId]||0)+effective;if(!details[cityId])details[cityId]=[];details[cityId].push({army_id:army.id,commander_id:army.commander_id,manpower,logistics,factor,effective_manpower:effective});
    }
    return{totals,details};
  }

  function calculateGarrisonFormation(state, cityId, troops, config) {
    const rules = config?.garrison_formation || {}, step = rules.troop_step || 100;
    if (!state.garrisons?.[cityId] || !state.city_logistics?.[cityId]) fail('CITY_NOT_FOUND');
    const monthlyLimit = Math.max(0, Number(rules.max_formations_per_city_per_month ?? 1));
    if (monthlyLimit > 0) {
      const used = (state.action_log || []).filter(entry => entry.type === 'GARRISON_FORMED' && entry.city_id === cityId && Number(entry.year) === Number(state.calendar?.year) && Number(entry.month) === Number(state.calendar?.month)).length;
      if (used >= monthlyLimit) fail('GARRISON_MONTHLY_CITY_LIMIT');
    }
    positiveInteger(troops, 'GARRISON_TROOPS_INVALID');
    if (troops < (rules.minimum_troops || 100) || troops % step !== 0) fail('GARRISON_TROOPS_INVALID');
    const units = troops / 100;
    return {
      troops,
      treasury_cost: units * (rules.treasury_cost_per_100_troops ?? 0),
      materials_cost: units * (rules.materials_cost_per_100_troops ?? 100),
      mobilizable_manpower_cost: troops,
      cap: state.garrisons[cityId].cap,
      remaining_capacity: state.garrisons[cityId].cap - state.garrisons[cityId].manpower
    };
  }

  function formGarrison(state, cityId, faction, troops, config) {
    requireFaction(state, faction);
    const estimate = calculateGarrisonFormation(state, cityId, troops, config), garrison = state.garrisons[cityId];
    if (militaryStatus(state, cityId).control !== faction) fail('GARRISON_CITY_NOT_CONTROLLED');
    if (garrison.faction && garrison.faction !== faction) fail('GARRISON_ENEMY_PRESENT');
    if (troops > estimate.remaining_capacity) fail('GARRISON_CAP_EXCEEDED');
    if (!canSpendCommand(state, faction, config.command_costs?.GARRISON_FORMATION || 1)) fail('COMMANDS_EXHAUSTED');
    if (state.factions[faction].treasury < estimate.treasury_cost) fail('TREASURY_INSUFFICIENT');
    if (state.city_logistics[cityId].material_stock < estimate.materials_cost) fail('MATERIALS_INSUFFICIENT');
    if (state.factions[faction].mobilizable_manpower < estimate.mobilizable_manpower_cost) fail('MOBILIZABLE_MANPOWER_INSUFFICIENT');
    const next = spendCommand(state, faction, 'GARRISON_FORMATION', config.command_costs?.GARRISON_FORMATION || 1);
    next.factions[faction].treasury -= estimate.treasury_cost;
    next.factions[faction].mobilizable_manpower -= estimate.mobilizable_manpower_cost;
    next.city_logistics[cityId].material_stock -= estimate.materials_cost;
    next.garrisons[cityId].faction = faction;
    next.garrisons[cityId].manpower += troops;
    appendAction(next, {type:'GARRISON_FORMED', faction, city_id:cityId, troops, treasury_cost:estimate.treasury_cost, materials_cost:estimate.materials_cost, mobilizable_manpower_cost:estimate.mobilizable_manpower_cost, resulting_manpower:next.garrisons[cityId].manpower});
    return {state:next, ...estimate, resulting_manpower:next.garrisons[cityId].manpower};
  }

  function previewFieldArmyFormation(state, cityId, commanderId, config) {
    const faction = state.current_faction;
    requireFaction(state, faction);
    const rules = config?.field_army_formation || {};
    if (!state.city_logistics?.[cityId]) fail('CITY_NOT_FOUND');
    if (militaryStatus(state, cityId).control !== faction) fail('FIELD_ARMY_CITY_NOT_CONTROLLED');
    if (Object.values(state.battles || {}).some(battle => ['awaiting_tactic','active','awaiting_continuation'].includes(battle?.status) && battle.city_id === cityId)) fail('FIELD_ARMY_CITY_IN_BATTLE');
    const reserve = state.political_phase?.commander_reserves?.[faction] || [];
    const commander = reserve.find(item => item.id === commanderId);
    if (!commander) fail('RESERVE_COMMANDER_NOT_FOUND');
    if (state.commanders?.[commanderId]) fail('COMMANDER_ALREADY_ACTIVE');
    const commandCost = Number(rules.command_cost ?? config?.command_costs?.FIELD_ARMY_FORMATION ?? 1);
    const treasuryCost = Number(rules.treasury_cost ?? 400);
    const manpower = Number(rules.initial_manpower ?? 500);
    const mobilizableManpowerCost = Number(rules.mobilizable_manpower_cost ?? manpower);
    if (!canSpendCommand(state, faction, commandCost)) fail('COMMANDS_EXHAUSTED');
    if ((Number(state.factions[faction].treasury) || 0) < treasuryCost) fail('TREASURY_INSUFFICIENT');
    if ((Number(state.factions[faction].mobilizable_manpower) || 0) < mobilizableManpowerCost) fail('MOBILIZABLE_MANPOWER_INSUFFICIENT');
    const quality = rules.initial_quality?.[faction] || (faction === 'PATRIOT' ? {morale:60,training:35,equipment:35} : {morale:55,training:45,equipment:50});
    const armyId = `ARM_RES_${commanderId.replace(/^CMD_/, '')}`;
    if (state.field_armies?.[armyId]) fail('ARMY_ID_DUPLICATE');
    return {faction, city_id:cityId, commander:copy(commander), commander_id:commanderId, army_id:armyId, treasury_cost:treasuryCost, command_cost:commandCost, manpower, morale:Number(quality.morale), training:Number(quality.training), equipment:Number(quality.equipment), mobilizable_manpower_cost:mobilizableManpowerCost, materials_cost:0, food_cost:0};
  }

  function formFieldArmyFromReserve(state, cityId, commanderId, config) {
    const preview = previewFieldArmyFormation(state, cityId, commanderId, config);
    const next = spendCommand(state, preview.faction, 'FIELD_ARMY_FORMATION', preview.command_cost);
    next.factions[preview.faction].treasury -= preview.treasury_cost;
    next.factions[preview.faction].mobilizable_manpower -= preview.mobilizable_manpower_cost;
    next.political_phase.commander_reserves[preview.faction] = (next.political_phase.commander_reserves[preview.faction] || []).filter(item => item.id !== commanderId);
    next.commanders[commanderId] = {...copy(preview.commander), faction:preview.faction, assigned_army_id:preview.army_id};
    next.field_armies[preview.army_id] = {id:preview.army_id,name:`${preview.commander.name}軍`,faction:preview.faction,commander_id:commanderId,location_city_id:cityId,manpower:preview.manpower,morale:preview.morale,training:preview.training,equipment:preview.equipment,acted_this_month:false,battle_id:null};
    appendAction(next,{type:'FIELD_ARMY_FORMED',faction:preview.faction,city_id:cityId,commander_id:commanderId,army_id:preview.army_id,manpower:preview.manpower,treasury_cost:preview.treasury_cost,mobilizable_manpower_cost:preview.mobilizable_manpower_cost,command_cost:preview.command_cost});
    return {state:next, result:preview, army:copy(next.field_armies[preview.army_id]), commander:copy(next.commanders[commanderId])};
  }

  function markArmyActed(state, armyId, reason = 'EXTERNAL_ACTION') {
    requireArmy(state, armyId);
    const next = copy(state);
    next.field_armies[armyId].acted_this_month = true;
    appendAction(next, {type: 'ARMY_MARKED_ACTED', army_id: armyId, reason});
    return next;
  }

  function battleArmiesThisMonth(state) {
    const ids=new Set(),year=Number(state.calendar?.year),month=Number(state.calendar?.month),battleTypes=new Set(['BATTLE_RESOLVED','BATTLE_CONTINUED','BATTLE_WITHDRAWN','BATTLE_DEFENDER_WITHDREW']);
    for(const entry of state.action_log||[]){
      if(Number(entry.year)!==year||Number(entry.month)!==month)continue;
      if(entry.type==='JOINT_ATTACK_FORMED'){for(const id of entry.participant_army_ids||[])ids.add(id);if(entry.army_id)ids.add(entry.army_id);continue;}
      if(!battleTypes.has(entry.type)||!entry.battle_id)continue;
      const battle=state.battles?.[entry.battle_id];if(!battle)continue;
      for(const id of [...(battle.attacker_army_ids||[]),...(battle.defender_army_ids||[])])ids.add(id);
    }
    for(const army of Object.values(state.field_armies||{}))if(army?.battle_id)ids.add(army.id);
    return ids;
  }
  function logisticsShortageArmiesThisMonth(state) {
    const ids=new Set(),year=Number(state.calendar?.year),month=Number(state.calendar?.month);
    for(const entry of state.action_log||[])if(Number(entry.year)===year&&Number(entry.month)===month&&['FIELD_ARMY_MORALE_LOSS','BATTLE_SUPPLY_CUT_MONTH'].includes(entry.type)&&entry.army_id)ids.add(entry.army_id);
    return ids;
  }
  function moraleConvergenceChange(morale,rules){
    const m=clamp(Number(morale??65),0,100),target=clamp(Number(rules?.target??65),0,100),bands=rules?.bands||[{min:81,max:100,change:-2},{min:66,max:80,change:-1},{min:65,max:65,change:0},{min:30,max:64,change:2},{min:1,max:29,change:3},{min:0,max:0,change:0}],band=bands.find(x=>m>=Number(x.min)&&m<=Number(x.max));
    let change=Number(band?.change)||0;if(m>target)change=Math.max(change,target-m);else if(m<target)change=Math.min(change,target-m);return change;
  }
  function applyMonthlyMoraleConvergence(state,config){
    const rules=config?.morale_monthly_convergence||{};if(rules.enabled===false)return{state:copy(state),applied:[]};
    const next=copy(state),battleIds=battleArmiesThisMonth(next),shortageIds=logisticsShortageArmiesThisMonth(next),applied=[];
    for(const army of Object.values(next.field_armies||{})){
      if(Number(army.manpower||0)<=0||Number(army.morale||0)<=0)continue;
      if(rules.skip_if_battle_this_month!==false&&battleIds.has(army.id))continue;
      if(rules.skip_if_logistics_shortage_this_month!==false&&shortageIds.has(army.id))continue;
      if(rules.skip_if_battle_supply_cut!==false&&(army.supply_cut||army.sea_supply_blockaded))continue;
      const before=Number(army.morale)||0,change=moraleConvergenceChange(before,rules);if(!change)continue;army.morale=clamp(before+change,0,100);const event={type:'FIELD_ARMY_MORALE_CONVERGENCE',army_id:army.id,city_id:army.location_city_id,before,after:army.morale,change,target:Number(rules.target??65)};applied.push(event);appendAction(next,event);
    }
    return{state:next,applied};
  }

  function advanceMonth(state, config) {
    let next = copy(state);
    const supplyCut=applyBattleSupplyCutMonthEffects(next,config);next=supplyCut.state;
    const moraleConvergence=applyMonthlyMoraleConvergence(next,config);next=moraleConvergence.state;
    next.calendar.month += 1;
    if (next.calendar.month > 12) {
      next.calendar.month = 1;
      next.calendar.year += 1;
    }
    next.calendar.turn_index += 1;
    const politicalMonth = config.time.political_months.includes(next.calendar.month);
    for (const faction of FACTIONS) {
      next.factions[faction].commands_remaining = config.time.monthly_action_commands_per_faction;
    }
    for (const army of Object.values(next.field_armies)) army.acted_this_month = false;
    appendAction(next, {type: 'MONTH_ADVANCED', monthly_actions_reset: true, political_commands_opened: politicalMonth});
    return next;
  }

  function militaryStatus(state, cityId) {
    if (!state.city_logistics?.[cityId]) fail('CITY_NOT_FOUND');
    const present = new Set();
    for (const army of Object.values(state.field_armies || {})) {
      const battle = army.battle_id && state.battles?.[army.battle_id];
      const battleStillInField = battle && ['awaiting_tactic','active','awaiting_continuation'].includes(battle.status);
      const departedAttacker = Boolean(battleStillInField && battle.origin_city_id === cityId && battle.attacker_army_ids?.includes(army.id) && battle.departure_committed);
      const lostRemoteAnchor=Boolean(army.control_anchor_lost&&army.battle_id&&army.supply_city_id===cityId);
      if (army.location_city_id === cityId && army.manpower > 0 && FACTIONS.includes(army.faction) && !departedAttacker && !lostRemoteAnchor) present.add(army.faction);
    }
    for (const battle of Object.values(state.battles || {})) {
      const attackerWon = ['major_victory','victory'].includes(battle.last_resolution?.band);
      if (battle.origin_city_id === cityId && battle.status === 'resolved' && attackerWon && !battle.departure_committed && FACTIONS.includes(battle.attacker_faction)) present.add(battle.attacker_faction);
    }
    const garrison = state.garrisons?.[cityId];
    if (garrison && garrison.manpower >= MINIMUM_EFFECTIVE_GARRISON && FACTIONS.includes(garrison.faction)) present.add(garrison.faction);
    const activeBattle = Object.values(state.battles || {}).some(battle => battle.city_id === cityId && ['active','awaiting_tactic','awaiting_continuation'].includes(battle.status));
    let control = 'UNCONTROLLED';
    if (activeBattle || present.size > 1) control = 'CONFLICT';
    else if (present.size === 1) control = [...present][0];
    const security = state.city_security?.[cityId] || {unrest: 0, rebellion_active: false};
    const unrest = Math.max(0, Math.min(100, Number(security.unrest) || 0));
    const unrest_status = security.rebellion_active || unrest >= 100 ? 'REBELLION_ACTIVE' : unrest >= 70 ? 'UPRISING_IMMINENT' : unrest >= 40 ? 'UNREST' : 'CALM';
    return {city_id: cityId, control, unrest, unrest_status, effective_garrison: Boolean(garrison && garrison.manpower >= MINIMUM_EFFECTIVE_GARRISON), present_factions: [...present].sort()};
  }

  function setCityUnrest(state, cityId, value, rebellionActive = false) {
    if (!state.city_logistics?.[cityId]) fail('CITY_NOT_FOUND');
    if (!Number.isFinite(Number(value))) fail('CITY_UNREST_INVALID');
    const next = copy(state);
    const unrest = Math.max(0, Math.min(100, Math.round(Number(value))));
    next.city_security[cityId] = {city_id: cityId, unrest, rebellion_active: Boolean(rebellionActive || unrest >= 100)};
    appendAction(next, {type: 'CITY_UNREST_SET', city_id: cityId, unrest, rebellion_active: next.city_security[cityId].rebellion_active});
    return next;
  }

  function createBattleShell(state,battle) {
    fail('CREATE_BATTLE_SHELL_DEPRECATED_USE_BATTLE_ENGINE');
  }

  return {
    FACTIONS, hydrateCanonicalExtensions, normalizeGarrisonState, validateState, canSpendCommand,
    spendCommand, representativeArmyAtCity, previewOpinionCampaign, executeOpinionCampaign, createCommander, createFieldArmy, executeArmyAction,
    moveFieldArmy,moveFieldArmies, previewFieldArmyAction, improveFieldArmy, applyFoodShortageEffects, applyLogisticsShortageEffects, battleSupplyStatus, syncBattleSeaSupplyBlockades, cutBattleSupplyFromCity, applyBattleSupplyCutMonthEffects, logisticsTroopsByCity, logisticsConsumptionTroopsByCity, nextRandom, appendAction,
    markArmyActed, advanceMonth, applyMonthlyMoraleConvergence, trainingInstructorScore, trainingInstructorBonus, trainingGain, createBattleShell, militaryStatus,
    setCityUnrest, calculateGarrisonFormation, formGarrison, previewFieldArmyFormation, formFieldArmyFromReserve, garrisonCapForCity, MINIMUM_EFFECTIVE_GARRISON
  };
});
