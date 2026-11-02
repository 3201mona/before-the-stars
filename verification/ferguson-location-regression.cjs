'use strict';
/* Ferguson's published southern-uprising selection and month-opening effects.
 * The ranking changes below are synthetic scenarios, not edits to the game map.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {ctx}=require('./stage3-battle-scenario.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../runtime/commander_event_engine_v0_77_portraits.js'),'utf8'),ctx);
const E=ctx.CommanderEventEngine;
const seed=()=>({cities:clone(ctx.CITY_COMMAND_DATA),military:clone(ctx.PHASE2_STATE_SEED)});
const choose=(cities,military)=>E.chooseFergusonCity(cities,military)?.city_id;
let checks=0;
const expect=(actual,want,label)=>{assert.equal(actual,want,label);checks++;};

{
  const {cities,military}=seed();
  const southern=Object.values(cities.cities).filter(c=>['NC','SC','GA'].includes(c.state_id));
  expect(southern.length,12,'twelve southern cities are eligible geographically');
  expect(choose(cities,military),'SC_01','baseline lowest eligible support: inland Ninety Six 40%');
  expect(cities.cities.SC_01.politics.independence_support,40,'map seed is unchanged');
  expect(cities.cities.GA_02.politics.independence_support,41,'inland Augusta is next');
  expect(cities.cities.GA_04.politics.independence_support,45,'Savannah port starts above the preferred threshold');
  const shifted=clone(cities);
  shifted.cities.GA_04.politics.independence_support=39;
  expect(choose(shifted,military),'GA_04','a synthetic 6-point support shift moves uprising to Savannah port');
  const tied=clone(cities);
  tied.cities.GA_02.politics.independence_support=40;
  expect(choose(tied,military),'SC_01','support ties break by political importance');
  const occupied=clone(military);
  occupied.field_armies.OCCUPY_NINETY_SIX={id:'OCCUPY_NINETY_SIX',faction:'PATRIOT',location_city_id:'SC_01',manpower:1};
  expect(choose(cities,occupied),'GA_02','any active army excludes an occupied first choice');
  occupied.field_armies.OCCUPY_AUGUSTA={id:'OCCUPY_AUGUSTA',faction:'BRITISH',location_city_id:'GA_02',manpower:1};
  expect(choose(cities,occupied),'SC_02','fallback removes the 42% support limit when preferred cities are occupied');
  for(const city of southern)occupied.field_armies['OCCUPY_'+city.city_id]={id:'OCCUPY_'+city.city_id,faction:'PATRIOT',location_city_id:city.city_id,manpower:1};
  expect(choose(cities,occupied),'SC_01','if all cities are occupied, global support ranking is last fallback');
}

{
  const {cities,military}=seed();
  const original=ctx.PoliticalPhaseEngine;
  try{
    ctx.PoliticalPhaseEngine={strategicStars:()=>({PATRIOT:29,BRITISH:0,UNCLAIMED:0,total:29})};
    const notYet=E.processMonthOpening(military,clone(cities),ctx.POLITICAL_PHASE_CONFIG);
    expect(Boolean(notYet.state.field_armies.ARM_BRI_FERGUSON),false,'29 independent stars cannot trigger uprising');
    ctx.PoliticalPhaseEngine={strategicStars:()=>({PATRIOT:30,BRITISH:0,UNCLAIMED:0,total:30})};
    const eventCities=clone(cities),spawned=E.processMonthOpening(military,eventCities,ctx.POLITICAL_PHASE_CONFIG);
    expect(spawned.state.field_armies.ARM_BRI_FERGUSON.location_city_id,'SC_01','30 independent stars trigger at selected city');
    expect(spawned.state.field_armies.ARM_BRI_FERGUSON.manpower,1200,'uprising spawns the configured force');
    expect(eventCities.cities.SC_01.politics.independence_support,15,'event reduces local support by 25 points');
    expect(spawned.state.action_log.some(x=>x.type==='FERGUSON_LOYALIST_UPRISING'&&x.city_id==='SC_01'),true,'location is recorded in action log');
    const repeated=E.processMonthOpening(spawned.state,eventCities,ctx.POLITICAL_PHASE_CONFIG);
    expect(repeated.state.action_log.filter(x=>x.type==='FERGUSON_LOYALIST_UPRISING').length,1,'uprising occurs once');
  }finally{ctx.PoliticalPhaseEngine=original;}
}
console.log('PASS Ferguson dynamic location and event thresholds: '+checks+' assertions');
