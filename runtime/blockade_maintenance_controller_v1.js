(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BlockadeMaintenanceController=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function shouldAiMaintain(military,cityId,naval){
    const battle=Object.values(military?.battles||{}).find(b=>b.city_id===cityId&&b.attacker_faction===naval.faction&&['active','awaiting_tactic','awaiting_continuation'].includes(b.status));
    if(!battle)return false;
    const attacker=(battle.attacker_army_ids||[]).reduce((sum,id)=>sum+Math.max(0,Number(military.field_armies?.[id]?.manpower)||0),0);
    const defender=(battle.defender_army_ids||[]).reduce((sum,id)=>sum+Math.max(0,Number(military.field_armies?.[id]?.manpower)||0),0)+Math.max(0,Number(military.garrisons?.[cityId]?.manpower)||0);
    const morale=(battle.attacker_army_ids||[]).map(id=>military.field_armies?.[id]).filter(a=>Number(a?.manpower)>0).reduce((sum,a)=>sum+Number(a.morale||0),0);
    const count=(battle.attacker_army_ids||[]).filter(id=>Number(military.field_armies?.[id]?.manpower)>0).length;
    return attacker>0&&count>0&&morale/count>=20&&attacker>=defender*.65;
  }
  function resolve(city,military,pending,keep,period,navalEngine,armyEngine){
    const target=navalEngine.pendingBlockadeMaintenance(city,period).find(row=>row.city_id===pending.city_id&&row.faction===pending.faction);
    if(!target)throw new Error('BLOCKADE_MAINTENANCE_NOT_PENDING');
    if(keep&&armyEngine.canSpendCommand(military,target.faction,1)){
      const renewed=navalEngine.activateOperation(city,target.zone_id,target.faction,'BLOCKADE',period,{target_city_id:target.city_id});
      const spent=armyEngine.spendCommand(military,target.faction,'BLOCKADE_MONTHLY_MAINTENANCE',1);
      return{city:renewed.state,military:spent,kept:true,city_id:target.city_id,events:renewed.events};
    }
    const cleared=navalEngine.setPortBlockade(city,target.city_id,null,null);
    return{city:navalEngine.recalculateAll(cleared.state,period,'港湾封鎖の解除').state,military:copy(military),kept:false,city_id:target.city_id,events:[cleared.event].filter(Boolean)};
  }
  function monthStart(city,military,period,navalEngine,armyEngine){
    const prepared=navalEngine.prepareMonthlyBlockadeMaintenance(city,military,period);
    let nextCity=prepared.state,nextMilitary=military;const decisions=[];
    for(const pending of prepared.pending){
      if(pending.faction===military.player_faction)continue;
      const keep=shouldAiMaintain(nextMilitary,pending.city_id,pending)&&armyEngine.canSpendCommand(nextMilitary,pending.faction,1);
      const result=resolve(nextCity,nextMilitary,pending,keep,period,navalEngine,armyEngine);
      nextCity=result.city;nextMilitary=result.military;decisions.push({city_id:pending.city_id,faction:pending.faction,kept:result.kept});
    }
    return{city:nextCity,military:nextMilitary,pending:navalEngine.pendingBlockadeMaintenance(nextCity,period).filter(row=>row.faction===military.player_faction),released:prepared.released,decisions};
  }
  return{shouldAiMaintain,resolve,monthStart};
});
