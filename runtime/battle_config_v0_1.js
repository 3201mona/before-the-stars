(function(){
  'use strict';
  // phase2_data_v0_9_funds.js is generated from source_data/phase2_config_v0_9_funds.json.
  // Do not override battle_engine here: the browser and the Node AI must read the same rules.
  if(!window.PHASE2_CONFIG?.battle_engine?.result_thresholds ||
     !window.PHASE2_CONFIG.battle_engine.tactics?.garrison_defense)
    throw new Error('BATTLE_CONFIG_MISSING');
  window.PHASE2_CONFIG.deferred={
    ...(window.PHASE2_CONFIG.deferred||{}),
    battle_formula:false,casualty_formula:false,battle_reinforcement:false,multi_army_coordination:false
  };
})();
