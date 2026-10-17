(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RoyalistAiTurn=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const BRITISH='BRITISH',PATRIOT='PATRIOT';
  function available(state){return state.player_faction===PATRIOT&&state.current_faction===PATRIOT&&Number(state.factions?.BRITISH?.commands_remaining)>0;}
  function armyAt(state,id,city){const army=state.field_armies?.[id];return army?.manpower>0&&army.location_city_id===city?army:null;}
  function britishAt(state,city){return Object.values(state.field_armies||{}).filter(a=>a.faction===BRITISH&&a.location_city_id===city&&a.manpower>0);}
  function cityControl(state,city){const present=Object.values(state.field_armies||{}).filter(a=>a.location_city_id===city&&a.manpower>0).map(a=>a.faction);const g=state.garrisons?.[city];if(g?.manpower>=100)present.push(g.faction);return new Set(present).size>1?'CONFLICT':present[0]||'UNCONTROLLED';}
  function chooseAction(m){const active=Object.values(m.battles||{}).find(b=>b.attacker_faction===BRITISH&&b.status==='active');return active?{type:'CONTINUE',battle_id:active.id,target:active.city_id}:null;}
  function executeNonBattle(m,c,action,engines){
    const {army:E,naval:N,political:P,phaseConfig:F,cityConfig:G}=engines;
    if(action.type==='FORM'){const input=clone(m);input.current_faction=BRITISH;const out=E.formFieldArmyFromReserve(input,action.city,action.commander_id,F);out.state.current_faction=m.current_faction;return{military:out.state,cities:c,kind:'FORM',city_id:action.city};}
    if(action.type==='RECRUIT'){
      const out=E.improveFieldArmy(m,action.army_id,'REGULAR_RECRUITMENT',F,c.cities[action.city]);
      const cities=clone(c);cities.cities[action.city].stockpile.MATERIALS-=out.result.materials_cost;
      return{military:out.state,cities,kind:'RECRUIT',city_id:action.city};
    }
    if(action.type==='OPINION'){const input=clone(m);input.current_faction=BRITISH;const out=E.executeOpinionCampaign(input,c,action.city,action.tier,F,null);out.state.current_faction=PATRIOT;return{military:out.state,cities:out.city_state,kind:'OPINION',city_id:action.city};}
    if(action.type==='MOVE'){
      if(action.ids.some(id=>m.field_armies[id]?.acted_this_month))throw new Error('AI_ARMY_ALREADY_ACTED');
      let next=E.moveFieldArmies(m,action.ids,action.target,action.route,F);
      if(action.route==='SEA_MOVE'){
        const from=c.cities[action.origin],to=c.cities[action.target];
        const profile=N.seaRouteProfile(c,from.geography.sea_zone_id,to.geography.sea_zone_id,BRITISH,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`);
        for(const id of action.ids){const before=m.field_armies[id].manpower;next.field_armies[id].manpower=before>0&&profile.arrival_rate>0?Math.max(1,Math.floor(before*profile.arrival_rate)):0;}
        E.appendAction(next,{type:'SEA_MOVE_ATTRITION',faction:BRITISH,army_ids:action.ids,origin_city_id:action.origin,destination_city_id:action.target,arrival_rate:profile.arrival_rate});
      }
      const before=cityControl(m,action.origin),after=cityControl(next,action.origin);
      const transition=P.recordCityControlTransition(next,c,action.origin,BRITISH,before,after,'ARMY_MOVE',engines.politicalConfig);next=transition.state;
      return{military:next,cities:c,kind:action.route==='SEA_MOVE'?'SEA_MOVE':'MOVE',city_id:action.target,transition:transition.event};
    }
    throw new Error('AI_ACTION_UNSUPPORTED');
  }
  function prepareAttack(m,c,action,engines){const {army:E,battle:B,phaseConfig:F,naval:N}=engines;
    if(action.ids.some(id=>m.field_armies[id]?.acted_this_month))throw new Error('AI_ARMY_ALREADY_ACTED');
    let next=E.spendCommand(m,BRITISH,'AI_ATTACK',1);
    for(const id of action.ids)next.field_armies[id].acted_this_month=true;
    if(action.route==='LANDING_ATTACK'){
      const from=c.cities[action.origin],to=c.cities[action.target],profile=N.seaRouteProfile(c,from.geography.sea_zone_id,to.geography.sea_zone_id,BRITISH,'LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`);
      for(const id of action.ids){const before=next.field_armies[id].manpower;next.field_armies[id].manpower=before>0&&profile.arrival_rate>0?Math.max(1,Math.floor(before*profile.arrival_rate)):0;}
      E.appendAction(next,{type:'LANDING_TRANSIT_ATTRITION',faction:BRITISH,army_ids:action.ids,destination_city_id:action.target,arrival_rate:profile.arrival_rate});
    }
    E.appendAction(next,{type:'JOINT_ATTACK_FORMED',faction:BRITISH,army_id:action.leader,participant_army_ids:action.ids,destination_city_id:action.target,route_type:action.route||'LAND_ATTACK'});
    return B.prepareBattle(next,{origin_city_id:action.origin,city_id:action.target,attacker_army_ids:action.ids,leader_army_id:action.leader,route_type:action.route||'LAND_ATTACK'},c,F);
  }
  function politicalDecisions(m,c,P,config){const votes=P.voteTally(c,config).BRITISH,choices=votes>=2?['BRI_GENERAL_DISPATCH','BRI_BUDGET_STANDARD','BRI_ADDITIONAL_MILITARY_SUPPORT']:votes>=1?['BRI_BUDGET_SMALL']:[];
    let state=m;const results=[];for(const id of choices){if(state.political_phase?.proposal_ids_used?.BRITISH?.includes(id))continue;
      try{const out=P.submitProposal(state,c,BRITISH,id,config);state=out.state;results.push(out.result);}catch(error){if(!['POLITICAL_PROPOSAL_LIMIT_REACHED','STATE_VOTES_INSUFFICIENT','NATIONAL_BUDGET_INSUFFICIENT','DISPATCH_CANDIDATE_EMPTY'].includes(error.message))throw error;}
    }return{state,results};
  }
  return{available,chooseAction,executeNonBattle,prepareAttack,politicalDecisions,cityControl};
});
