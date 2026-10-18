/* Unified military-control evaluator. A deployment is continuity of existing control,
 * not an additional garrison and never a defensive combatant. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CityControlPolicy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FACTIONS=['PATRIOT','BRITISH'];
  const ACTIVE=new Set(['awaiting_tactic','active','awaiting_continuation']);
  const validFaction=x=>FACTIONS.includes(x);
  function militaryStatus(state,cityId,minimumEffectiveGarrison=100,options={}){
    const ignore=new Set(options.excludeArmyIds||[]);
    const present=new Set(),deployed=new Set(),armies=state?.field_armies||{},battles=state?.battles||{};
    for(const army of Object.values(armies)){
      if(ignore.has(army.id))continue;
      if(army.location_city_id!==cityId||!validFaction(army.faction)||!(Number(army.manpower)>0))continue;
      const battle=army.battle_id&&battles[army.battle_id];
      const live=Boolean(battle&&battle.id===army.battle_id&&ACTIVE.has(battle.status));
      const attackerListed=Boolean(battle?.attacker_faction===army.faction&&battle.attacker_army_ids?.includes(army.id));
      const defenderListed=Boolean(battle?.defender_faction===army.faction&&battle.defender_army_ids?.includes(army.id));
      const mainDeparted=live&&attackerListed&&battle.departure_committed&&battle.origin_city_id===cityId&&battle.attacker_army_ids?.includes(army.id)&&!(battle.attacker_reinforcement_ids||[]).includes(army.id);
      const reinforcement=live&&battle.city_id!==cityId&&Boolean(battle.reinforcement_origins?.[army.id]?.origin_city_id===cityId)&&
        ((attackerListed&&(battle.attacker_reinforcement_ids||[]).includes(army.id))||(defenderListed&&(battle.defender_reinforcement_ids||[]).includes(army.id)));
      if(mainDeparted||reinforcement){
        const legal=mainDeparted?battle.origin_control_verified===army.faction:
          battle.reinforcement_origins?.[army.id]?.origin_control_verified===army.faction;
        if(legal&&!army.control_anchor_lost)deployed.add(army.faction);
      }else if(!(live&&battle.city_id!==cityId))present.add(army.faction);
    }
    const g=state?.garrisons?.[cityId];
    const effective=Boolean(g&&Number(g.manpower)>=minimumEffectiveGarrison&&validFaction(g.faction));
    if(effective)present.add(g.faction);
    // Invading *physical* occupants supersede absent forces' governance anchors.
    // A battle at this city still reports CONFLICT until occupation is resolved.
    if(present.size===0)for(const f of deployed)present.add(f);
    const activeBattle=Object.values(battles).some(b=>b.id!==options.excludeBattleId&&b.city_id===cityId&&ACTIVE.has(b.status));
    const control=activeBattle||present.size>1?'CONFLICT':present.size===1?[...present][0]:'UNCONTROLLED';
    return {city_id:cityId,control,present_factions:[...present].sort(),effective_garrison:effective,
      deployed_control_factions:[...deployed].sort(),active_battle:activeBattle};
  }
  return{militaryStatus};
});
