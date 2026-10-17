(function(){
  'use strict';
  const B=window.BattleEngine,E=window.ArmyPhase2Engine;
  if(!B||!E)throw new Error('RETREAT_RECOVERY_BOOTSTRAP_MISSING');
  const monthKey=s=>`${s?.calendar?.year||1775}-${String(s?.calendar?.month||6).padStart(2,'0')}`;
  const copy=v=>JSON.parse(JSON.stringify(v));
  function isOpponentDefender(state,battle){return Boolean(state?.player_faction&&battle?.defender_faction&&battle.defender_faction!==state.player_faction);}
  function lockActive(state,army){return Boolean(army&&army.retreat_recovery_no_attack_month===monthKey(state));}
  function grant(state,battle,ids,reason){
    if(!state||!battle||!isOpponentDefender(state,battle))return state;
    const key=monthKey(state),eligible=ids||[];
    for(const id of eligible){
      const army=state.field_armies?.[id];if(!army)continue;
      army.acted_this_month=false;
      army.retreat_recovery_no_attack_month=key;
      army.retreat_recovery_reason=reason||'DEFENDER_RETREAT';
    }
    if(eligible.length&&E.appendAction)E.appendAction(state,{type:'AI_RETREAT_RECOVERY_GRANTED',faction:battle.defender_faction,battle_id:battle.id,army_ids:eligible.filter(id=>Boolean(state.field_armies?.[id])),month:key,attack_locked:true,reason:reason||'DEFENDER_RETREAT'});
    return state;
  }
  const originalPrepare=B.prepareBattle.bind(B);
  B.prepareBattle=function(state,args,cityState,phaseConfig){
    const locked=(args?.attacker_army_ids||[]).filter(id=>lockActive(state,state.field_armies?.[id]));
    if(locked.length)throw new Error('RETREAT_RECOVERY_ATTACK_LOCKED');
    return originalPrepare(state,args,cityState,phaseConfig);
  };
  const originalPre=B.withdrawDefenderBeforeBattle.bind(B);
  B.withdrawDefenderBeforeBattle=function(state,battleId,cityState,armyEngine,phaseConfig,preferredDestinationCityId=null){
    const before=state.battles?.[battleId],out=originalPre(state,battleId,cityState,armyEngine,phaseConfig,preferredDestinationCityId);
    if(out?.withdrawn&&before){grant(out.state,before,before.defender_army_ids,'PREBATTLE_WITHDRAWAL');out.battle=copy(out.state.battles?.[battleId]||out.battle);}
    return out;
  };
  const originalResolve=B.resolveBattle.bind(B);
  B.resolveBattle=function(state,battleId,playerTactic,cityState,phaseConfig,armyEngine,defenderTactic=null){
    const before=state.battles?.[battleId],out=originalResolve(state,battleId,playerTactic,cityState,phaseConfig,armyEngine,defenderTactic);
    if(before&&out?.resolution?.decisive&&out.resolution.retreat?.faction===before.defender_faction&&!out.resolution.retreat?.isolated){
      grant(out.state,before,before.defender_army_ids,'BATTLE_DEFEAT_RETREAT');out.battle=copy(out.state.battles?.[battleId]||out.battle);
    }
    return out;
  };
  const originalWithdraw=B.withdrawBattle.bind(B);
  B.withdrawBattle=function(state,battleId,withdrawingFaction,cityState,armyEngine,phaseConfig=null){
    const before=state.battles?.[battleId],out=originalWithdraw(state,battleId,withdrawingFaction,cityState,armyEngine,phaseConfig);
    if(out?.withdrawn&&before&&withdrawingFaction===before.defender_faction){grant(out.state,before,before.defender_army_ids,'DEFENDER_VOLUNTARY_WITHDRAWAL');out.battle=copy(out.state.battles?.[battleId]||out.battle);}
    return out;
  };
  B.isRetreatRecoveryAttackLocked=function(state,armyOrId){const army=typeof armyOrId==='string'?state?.field_armies?.[armyOrId]:armyOrId;return lockActive(state,army);};
  B.retreatRecoveryMonthKey=monthKey;
  const originalAdvance=E.advanceMonth.bind(E);
  E.advanceMonth=function(state,config){const next=originalAdvance(state,config);for(const army of Object.values(next.field_armies||{})){delete army.retreat_recovery_no_attack_month;delete army.retreat_recovery_reason;}return next;};
  window.__retreatRecoveryRule={version:'1.0',ai_defender_only:true,attack_locked_same_month:true,isAttackLocked:(state,id)=>B.isRetreatRecoveryAttackLocked(state,id)};
})();
