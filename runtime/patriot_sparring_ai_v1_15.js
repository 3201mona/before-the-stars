(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PatriotSparringAI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const troops=(m,id)=>Object.values(m.field_armies||{}).filter(a=>a.location_city_id===id&&a.faction==='PATRIOT'&&a.manpower>0);
 function action(){return null;}
 function execute(m,c,a,engine){const E=engine.army,F=engine.phaseConfig;if(a.type==='FORM'){const next=clone(m);next.current_faction='PATRIOT';const out=E.formFieldArmyFromReserve(next,a.city,a.commander_id,F);out.state.current_faction=m.current_faction;return{military:out.state,cities:c};}
  if(a.type==='IMPROVE'){const out=E.improveFieldArmy(m,a.army_id,a.kind,F,c.cities[m.field_armies[a.army_id].location_city_id]);const cities=clone(c),record=cities.cities[out.result.city_id];record.stockpile.MATERIALS-=out.result.materials_cost;record.politics.independence_support=Math.max(0,Math.min(100,record.politics.independence_support+out.result.support_change));record.politics.public_cooperation=Math.max(0,Math.min(100,record.politics.public_cooperation+out.result.cooperation_change));return{military:out.state,cities};}
  if(a.type==='GARRISON'){const out=E.formGarrison(m,a.city,'PATRIOT',a.troops,F),cities=clone(c);cities.cities[a.city].stockpile.MATERIALS-=out.materials_cost;return{military:out.state,cities};}
  if(a.type==='MOVE'){const origin=m.field_armies[a.ids[0]].location_city_id,next=E.moveFieldArmies(m,a.ids,a.target,a.route,F);if(a.route==='SEA_MOVE'){const profile=engine.naval.seaRouteProfile(c,c.cities[origin].geography.sea_zone_id,c.cities[a.target].geography.sea_zone_id,'PATRIOT','LANDING',`${m.calendar.year}-${String(m.calendar.month).padStart(2,'0')}`);for(const id of a.ids){const before=m.field_armies[id].manpower;next.field_armies[id].manpower=before>0&&profile.arrival_rate>0?Math.max(1,Math.floor(before*profile.arrival_rate)):0;}E.appendAction(next,{type:'SEA_MOVE_ATTRITION',faction:'PATRIOT',army_ids:a.ids,origin_city_id:origin,destination_city_id:a.target,arrival_rate:profile.arrival_rate});}const before=engine.political.militaryControl(m,origin,engine.politicalConfig),after=engine.political.militaryControl(next,origin,engine.politicalConfig),transition=engine.political.recordCityControlTransition(next,c,origin,'PATRIOT',before,after,'ARMY_MOVE',engine.politicalConfig);return{military:transition.state,cities:c};}
  throw new Error('PATRIOT_SPARRING_ACTION_UNSUPPORTED');
 }
 return{action,execute};
});
