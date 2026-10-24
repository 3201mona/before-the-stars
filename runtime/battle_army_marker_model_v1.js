(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BattleArmyMarkerModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ACTIVE=new Set(['awaiting_tactic','active','awaiting_continuation']);
  function displayLocation(military,army){
    const battle=army?.battle_id?military?.battles?.[army.battle_id]:null;
    const engaged=Boolean(battle&&ACTIVE.has(battle.status));
    return{city_id:engaged?battle.city_id:army?.location_city_id||null,
      engaged,battle_id:engaged?battle.id:null,
      reinforcement:Boolean(engaged&&(army?.reinforcement_role||battle.reinforcement_origins?.[army?.id])),
      origin_city_id:engaged?(battle.reinforcement_origins?.[army?.id]?.origin_city_id||army.supply_city_id||battle.origin_city_id||army.location_city_id):null,
      supply_cut:Boolean(engaged&&(army?.supply_cut||army?.sea_supply_blockaded))};
  }
  function markerGroups(military){
    const groups={};
    for(const army of Object.values(military?.field_armies||{})){
      if(!army||Number(army.manpower||0)<=0)continue;
      const location=displayLocation(military,army);
      if(location.city_id)(groups[location.city_id]??=[]).push({army,location});
    }
    return groups;
  }
  return{displayLocation,markerGroups};
});
