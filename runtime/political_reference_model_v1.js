(function(root,factory){
  const model=factory();
  if(typeof module==='object'&&module.exports)module.exports=model;
  if(root)root.BTSPoliticalReferenceModel=model;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const amount=value=>Math.max(0,Math.floor(Number(value)||0));

  function supplyPlan(military,cities,faction,config,engine){
    const records=[],pending=military.political_phase?.pending_effects?.[faction]||{};
    const add=(source,route,food,materials)=>{
      const record={source,route,food:amount(food),materials:amount(materials)};
      if(record.food||record.materials)records.push(record);
    };
    const base=config.overseas_supply?.quarterly_base?.[faction]||{};
    add('本国定期補給','OVERSEAS',base.FOOD,base.MATERIALS);
    add('議決済み・本国補給追加分','OVERSEAS',pending.overseas_supply?.FOOD,pending.overseas_supply?.MATERIALS);
    if(faction==='PATRIOT'){
      const progress=military.political_phase?.foreign_intervention?.PATRIOT||{};
      for(const [id,country] of Object.entries(config.foreign_aid?.countries||{})){
        const stage=engine.foreignAidStage(Number(progress[id])||0,config);
        const support=country.quarterly_supply?.[stage.id]||{};
        add(`${country.label}・${stage.label}`,'OVERSEAS',support.FOOD,support.MATERIALS);
      }
    }
    const domestic=new Map();
    for(const support of pending.domestic_support||[]){
      const city=cities.cities?.[support.city_id];
      if(!city)continue;
      const prior=domestic.get(support.city_id)||{source:`議決済み・${city.city_name}へ直接支援`,route:'DOMESTIC',food:0,materials:0};
      prior.food+=amount(support.food);prior.materials+=amount(support.materials);
      domestic.set(support.city_id,prior);
    }
    for(const record of domestic.values())add(record.source,record.route,record.food,record.materials);
    return{
      records,
      totals:records.reduce((sum,record)=>({food:sum.food+record.food,materials:sum.materials+record.materials}),{food:0,materials:0})
    };
  }

  function deployedCommanders(military,cities,faction,locationModel){
    const result=[];
    for(const army of Object.values(military.field_armies||{})){
      const commander=military.commanders?.[army.commander_id];
      if(army.faction!==faction||!commander||commander.faction!==faction||amount(army.manpower)===0)continue;
      const location=locationModel?.displayLocation?.(military,army)||{},cityId=location.city_id||army.location_city_id;
      const city=cities.cities?.[cityId],cityName=city?.city_name||cityId||'所在未詳';
      const stateName=city?.state_id==='ME'?'マサチューセッツ州・メーン地区':city?.state_name?`${city.state_name}州`:city?.state_id?`${city.state_id}州`:'州不明';
      const originId=location.origin_city_id,originName=originId&&cities.cities?.[originId]?.city_name;
      result.push({armyId:army.id,commanderId:commander.id,name:commander.name,rank:commander.historical_rank||'',role:commander.role||'',armyName:army.name,manpower:amount(army.manpower),stateName,cityName,locationNote:location.reinforcement?`援軍${originName?`（${originName}発）`:''}`:location.engaged?'交戦中':'駐留'});
    }
    const priority=role=>role==='総司令官'?0:role==='方面軍司令官'?1:2;
    return result.sort((a,b)=>priority(a.role)-priority(b.role)||a.cityName.localeCompare(b.cityName,'ja')||a.name.localeCompare(b.name,'ja'));
  }
  function theaterCommanderCount(military,faction){
    return Object.values(military.commanders||{}).filter(commander=>commander.faction===faction&&commander.role==='方面軍司令官').length;
  }
  return{supplyPlan,deployedCommanders,theaterCommanderCount};
});
