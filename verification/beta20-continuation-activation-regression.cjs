'use strict';
// Regression for January 1778 'awaiting_continuation' campaign stall.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {mk,prepare,plans,ctx}=require('./stage3-battle-scenario.cjs');
const B=ctx.BattleEngine,E=ctx.ArmyPhase2Engine,FC=ctx.PHASE2_CONFIG;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../runtime/continuation_battle_ai_v1.js'),'utf8'),ctx);
let checks=0;
function equal(a,b,msg){assert.equal(a,b,msg);checks++;}
function ok(x,msg){assert.ok(x,msg);checks++;}
function setup(sc){
 const {m:c0,c}=mk(sc,13);let m=c0;
 m.field_armies[sc.attacker].manpower=15000;m.field_armies[sc.defender].manpower=700;
 const prepared=prepare(m,c,sc);m=prepared.state;const battle=m.battles[prepared.battle.id];
 battle.status='awaiting_continuation';battle.calculation_status='AWAITING_CONTINUE_OR_WITHDRAW';
 battle.history=[{month:'1775-06',band:'even',decisive:false}];battle.last_resolution=battle.history[0];
 m.calendar.month=7;m.current_faction=sc.faction;
 for(const a of Object.values(m.field_armies))if(a.battle_id!==battle.id)a.acted_this_month=true;
 return{m,c,battle,ai:ctx[sc.faction==='PATRIOT'?'PatriotAiTurn':'RoyalistAiTurn']};
}
for(const sc of plans){
 let {m,c,battle,ai}=setup(sc);
 for(const remaining of [3,1,0]){
  m.factions[sc.faction].commands_remaining=remaining;
  const chosen=ai.chooseAction(m,c);
  equal(chosen?.type,'CONTINUE',`${sc.faction} ${remaining} commands: next month must choose continuation`);
  equal(chosen?.battle_id,battle.id,`${sc.faction} select correct battle`);
 }
 m.factions[sc.faction].commands_remaining=0;
 const r=B.continueBattle(m,battle.id,E);equal(r.state.battles[battle.id].status,'active', 'continuation allowed by engine');
 equal(r.state.factions[sc.faction].commands_remaining,0,'continuation is free');
 const out=B.resolveBattle(r.state,battle.id,'normal_attack',c,FC,E,'hold_line');
 ok(out.state.battles[battle.id].history.length===2,'second combat round recorded');
 equal(out.state.battles[battle.id].last_resolution.month,'1775-07','next round date');
 // A second free continuation in the same month must not occur.
 const again=ai.chooseAction(out.state,c);ok(again?.type!=='CONTINUE','no duplicate battle resolution in same month');
 // Supports transitional 'active' state with historical round as well.
 let {m:legacy,c:legacyCities,battle:legacyBattle,ai:legacyAI}=setup(sc);legacyBattle.status='active';
 legacy.factions[sc.faction].commands_remaining=0;
 equal(legacyAI.chooseAction(legacy,legacyCities)?.type,'CONTINUE','legacy active battle also supported');
}
console.log(JSON.stringify({suite:'beta20-continuation-activation-regression',checks,passed:true}));
