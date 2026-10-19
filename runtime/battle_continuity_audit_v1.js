/* BEFORE THE STARS: observational battle continuity diagnostics.
 * Does not mutate game state, save data, battle results, or UI decisions.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BattleContinuityAudit=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LIVE=new Set(['awaiting_tactic','active','awaiting_continuation']);
  const WATCHED=new Set(['BATTLE_CONTINUED','BATTLE_WITHDRAWN','BATTLE_RESOLVED','FIELD_ARMY_ROUTED','BATTLE_SUPPLY_CUT_MONTH','BATTLE_REINFORCEMENT']);
  const LIMIT=100;
  const recent=[];
  let lastSignature=null,lastWarningSignature=null;
  function inspect(state){
    const findings=[],armies=state?.field_armies||{},battles=state?.battles||{};
    const report=(severity,code,battle_id,army_id=null,details=null)=>findings.push({severity,code,battle_id,army_id,details});
    for(const [key,b] of Object.entries(battles)){
      if(!LIVE.has(b?.status))continue;
      const id=b.id||key,atk=b.attacker_army_ids||[],def=b.defender_army_ids||[];
      const both=[...atk,...def],seen=new Set();
      for(const aid of both){
        if(seen.has(aid)){report('error','BATTLE_DUPLICATE_PARTICIPANT',id,aid);continue;}
        seen.add(aid);
        const a=armies[aid];
        if(!a){report('warning','BATTLE_LISTED_ARMY_MISSING',id,aid);continue;}
        const expected=atk.includes(aid)?b.attacker_faction:b.defender_faction;
        if(a.faction!==expected)report('error','BATTLE_ARMY_FACTION_MISMATCH',id,aid,{expected,actual:a.faction});
        if(a.battle_id!==id)report('error','BATTLE_ARMY_LOCK_MISMATCH',id,aid,{actual:a.battle_id||null});
      }
      for(const role of ['attacker','defender']){
        const ids=(b[role+'_reinforcement_ids']||[]),main=(b[role+'_army_ids']||[]);
        for(const aid of ids){if(!main.includes(aid))report('error','BATTLE_REINFORCEMENT_NOT_ROSTERED',id,aid,{role});}
      }
      const attackerAlive=atk.some(aid=>Number(armies[aid]?.manpower||0)>0),
        defenderAlive=def.some(aid=>Number(armies[aid]?.manpower||0)>0),
        g=state.garrisons?.[b.city_id],garrisonAlive=g?.faction===b.defender_faction&&Number(g.manpower||0)>0,
        mainAttackers=atk.filter(aid=>!(b.attacker_reinforcement_ids||[]).includes(aid)),
        supportAlive=(b.attacker_reinforcement_ids||[]).some(aid=>Number(armies[aid]?.manpower||0)>0);
      if(!attackerAlive&&!defenderAlive&&!garrisonAlive)report('error','BATTLE_NO_FORCES_REMAIN',id);
      else if(!attackerAlive||(!defenderAlive&&!garrisonAlive))report('warning','BATTLE_FORCE_EMPTY_AWAITING_RESOLUTION',id);
      if(mainAttackers.length&&!mainAttackers.some(aid=>Number(armies[aid]?.manpower||0)>0)&&supportAlive)
        report('warning','BATTLE_MAIN_ATTACKERS_GONE_REINFORCEMENT_ONLY',id);
    }
    for(const [key,a] of Object.entries(armies)){
      if(!a?.battle_id)continue;
      const b=battles[a.battle_id];
      if(!b||!LIVE.has(b.status))report('error','ARMY_LOCK_WITHOUT_LIVE_BATTLE',a.battle_id,a.id||key);
      else if(![...(b.attacker_army_ids||[]),...(b.defender_army_ids||[])].includes(a.id||key))report('error','ARMY_LOCK_NOT_IN_BATTLE_ROSTER',a.battle_id,a.id||key);
    }
    return findings;
  }
  function snapshot(state,checkpoint){
    const armies=state?.field_armies||{},battles=state?.battles||{};
    const relevant=Object.values(battles).filter(b=>b&& (LIVE.has(b.status)||b.status==='withdrawn')).map(b=>{
      const ids=[...new Set([...(b.attacker_army_ids||[]),...(b.defender_army_ids||[])])];
      return {id:b.id,city_id:b.city_id,origin_city_id:b.origin_city_id,status:b.status,
        attacker_faction:b.attacker_faction,defender_faction:b.defender_faction,
        attacker_army_ids:b.attacker_army_ids||[],defender_army_ids:b.defender_army_ids||[],
        attacker_reinforcement_ids:b.attacker_reinforcement_ids||[],defender_reinforcement_ids:b.defender_reinforcement_ids||[],
        last_resolution_month:b.last_resolution?.month||null,history_length:b.history?.length||0,
        armies:ids.map(id=>{const a=armies[id];return{id,present:!!a,faction:a?.faction||null,battle_id:a?.battle_id||null,location_city_id:a?.location_city_id||null,supply_city_id:a?.supply_city_id||null,manpower:a?.manpower??null,morale:a?.morale??null,supply_cut:!!a?.supply_cut};})};
    });
    return {checkpoint,calendar:state?.calendar?{year:state.calendar.year,month:state.calendar.month}:null,
      current_faction:state?.current_faction||null,
      battles:relevant,
      recent_actions:(state?.action_log||[]).filter(a=>WATCHED.has(a.type)).slice(-6).map(a=>({type:a.type,battle_id:a.battle_id||null,faction:a.faction||null,city_id:a.city_id||null,year:a.year??null,month:a.month??null}))};
  }
  function observe(state,checkpoint='STATE_UPDATED'){
    const findings=inspect(state),frame=snapshot(state,checkpoint);
    // Ignore checkpoint alone: repeated UI renders must not flood the ring buffer.
    const signature=JSON.stringify({calendar:frame.calendar,battles:frame.battles,actions:frame.recent_actions,findings});
    if(signature!==lastSignature){lastSignature=signature;recent.push({sequence:(recent.at(-1)?.sequence||0)+1,...frame,findings});if(recent.length>LIMIT)recent.shift();}
    const warningSignature=JSON.stringify(findings);
    if(findings.length&&warningSignature!==lastWarningSignature&&typeof console!=='undefined'&&console.warn){
      console.warn('[BTS battle continuity audit] state mismatch detected',findings);
    }
    lastWarningSignature=warningSignature;
    return findings;
  }
  function exportReport(state){return {version:'1.0-observational',generated_at:new Date().toISOString(),findings:inspect(state),current:snapshot(state,'EXPORT'),trace:recent.slice()};}
  return {inspect,snapshot,observe,exportReport,recent:()=>recent.slice(),reset:()=>{recent.length=0;lastSignature=null;lastWarningSignature=null;}};
});
