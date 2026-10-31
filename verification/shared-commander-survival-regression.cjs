'use strict';
// Symmetric policy checks. A mocked threat oracle is intentional here: the
// engine-wide campaign probe separately uses the actual Crisis/battle modules.
const assert=require('node:assert/strict');
const path=require('node:path');
const Policy=require('../runtime/commander_survival_policy_v1.js');
let checks=0;
function ok(v,label){assert.ok(v,label);checks++;}
function equal(a,b,label){assert.deepEqual(a,b,label);checks++;}
const other=f=>f==='PATRIOT'?'BRITISH':'PATRIOT';
function mk(f='BRITISH',enemies=4000){
 const foe=other(f),capital='HQ',island='ISLAND',safe='SAFE',enemy='ENEMY';
 const armies=[
  {id:'CHIEF',faction:f,commander_id:'C',location_city_id:capital,manpower:4200,morale:65},
  {id:'A1',faction:f,commander_id:'X1',location_city_id:capital,manpower:2700,morale:55},
  {id:'A2',faction:f,commander_id:'X2',location_city_id:capital,manpower:2400,morale:55},
  {id:'A3',faction:f,commander_id:'X3',location_city_id:capital,manpower:2100,morale:55},
  {id:'FOE',faction:foe,commander_id:'F',location_city_id:enemy,manpower:enemies,morale:60}
 ];
 const m={calendar:{year:1775,month:6},field_armies:Object.fromEntries(armies.map(a=>[a.id,a])),commanders:{C:{role:'総司令官'},X1:{role:'少将'},X2:{role:'少将'},X3:{role:'少将'},F:{role:'少将'}},garrisons:{},battles:{}};
 const c={cities:Object.fromEntries([capital,island,safe,enemy].map(id=>[id,{city_id:id,geography:{is_port:id===island,sea_zone_id:'NORTH'},politics:{military_control:id===enemy?foe:id===island?'UNCONTROLLED':f}}])),topology:{edges:[{a:capital,b:enemy,type:'land'},{a:capital,b:safe,type:'land'},{a:island,b:enemy,type:'land'}]}};
 return {m,c,f};
}
function deps(f){
 const control=(m,id)=>{const city=board.cities[id];return city?.politics?.military_control;};
 let board;
 const near=(c,id)=>c.topology.edges.filter(e=>e.a===id||e.b===id).map(e=>e.a===id?e.b:e.a);
 const troops=(m,id,f)=>Object.values(m.field_armies||{}).filter(a=>a.faction===f&&a.location_city_id===id&&a.manpower>0).reduce((n,a)=>n+a.manpower,0)+(m.garrisons?.[id]?.faction===f?m.garrisons[id].manpower:0);
 return {
  bind:c=>{board=c;},
  control,
  Crisis:{
   directThreat(m,c,f,id){const foe=other(f),attacking=Math.max(0,...near(c,id).map(x=>troops(m,x,foe)));return{ratio:attacking/Math.max(1,troops(m,id,f))};},
   nextTurnThreat(m,c,f,id){const current=this.directThreat(m,c,f,id);return{ratio:current.ratio};},
   supplyMonths:()=>4
  },
  Naval:{seaRouteProfile:()=>({arrival_rate:1}),isPortOperational:city=>Boolean(city.geography?.is_port)}
 };
}
function assessFixture(f,action,row){const data=mk(f),d=deps(f);d.bind(data.c);return Policy.assess(data.m,data.c,f,{action,...row},d);}
for(const f of ['BRITISH','PATRIOT']){
 const action={type:'MOVE',ids:['A1','A2','A3'],origin:'HQ',target:'SAFE',route:'MOVE'};
 const splitEval=assessFixture(f,action,{});
 ok(splitEval,'departure assessment exists for '+f);
 ok(splitEval.relative_risk>0,'stripping local strength increases HQ risk for '+f);
 ok(splitEval.score_delta<0,'risky split is down-ranked for '+f);
 ok(splitEval.admissible,'risky split is not made an arbitrary illegal move for '+f);
 const alone={type:'ATTACK',ids:['CHIEF'],origin:'HQ',target:'ISLAND',route:'LANDING_ATTACK'};
 const sample={operational_readiness:{samples:[{occupied:true,attacker_loss:400,post_month_enemy_ratio:0.5},{occupied:true,attacker_loss:750,post_month_enemy_ratio:0.8}]}};
 const landing=assessFixture(f,alone,sample);
 ok(landing,'solo amphibious attack is assessed for '+f);
 ok(landing.penalty>0,'isolated sea landing is penalized for '+f);
 ok(landing.admissible,'solo attack is not automatically forbidden for '+f);
 const dead=assessFixture(f,alone,{operational_readiness:{samples:[{occupied:false,attacker_loss:4200,chief_destroyed:true}]}});
 equal(dead.admissible,false,'modelled terminal commander loss vetoes the action for '+f);
 const data=mk(f);const d=deps(f);d.bind(data.c);
 const rows=[{score:140,action:alone,operational_readiness:sample.operational_readiness},{score:70,action:{type:'TRAINING'}}];
 const before=JSON.stringify(data.m);Policy.applyRows(data.m,data.c,f,rows,d);
 equal(JSON.stringify(data.m),before,'candidate projection does not mutate military state for '+f);
 ok(rows[0].score<140,'survival risk affects strategic scoring for '+f);
 equal(rows[1].score,70,'unrelated training remains unchanged for '+f);
}
const left=assessFixture('PATRIOT',{type:'MOVE',ids:['A1','A2','A3'],origin:'HQ',target:'SAFE',route:'MOVE'},{});
const right=assessFixture('BRITISH',{type:'MOVE',ids:['A1','A2','A3'],origin:'HQ',target:'SAFE',route:'MOVE'},{});
equal(left.score_delta,right.score_delta,'Washington and Gage are treated symmetrically');
// With no enemies, a large detached force is not banned just because the
// commander remains alone. The rules respond to risk, not an escort quota.
const quiet=mk('BRITISH',0),qDeps=deps('BRITISH');qDeps.bind(quiet.c);
const quietEval=Policy.assess(quiet.m,quiet.c,'BRITISH',{action:{type:'MOVE',ids:['A1','A2','A3'],origin:'HQ',target:'SAFE',route:'MOVE'}},qDeps);
ok(quietEval.admissible,'safe independent column remains eligible');
ok(quietEval.penalty<20,'riskless detachment receives no escort-count veto');
const endangered=mk('PATRIOT',16000),eDeps=deps('PATRIOT');eDeps.bind(endangered.c);
const rescue=Policy.assess(endangered.m,endangered.c,'PATRIOT',{action:{type:'MOVE',ids:['CHIEF'],origin:'HQ',target:'SAFE',route:'MOVE'}},eDeps);
ok(rescue.after.score<rescue.before.score,'moving Washington away from a reachable deadly threat reduces risk');
ok(rescue.rescue_bonus>0,'common policy rewards a safer HQ relocation');
const doomed=mk('BRITISH',4000),dDeps=deps('BRITISH');dDeps.bind(doomed.c);
dDeps.Naval.seaRouteProfile=()=>({arrival_rate:0});
const destruction=Policy.assess(doomed.m,doomed.c,'BRITISH',{action:{type:'MOVE',ids:['CHIEF'],origin:'HQ',target:'ISLAND',route:'SEA_MOVE'}},dDeps);
equal(destruction.admissible,false,'zero-manpower sea transit is a campaign-ending veto');
console.log('PASS shared commander-in-chief survival policy: '+checks+' symmetric risk cases');
