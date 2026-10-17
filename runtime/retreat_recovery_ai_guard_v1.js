(function(){'use strict';
 const B=window.BattleEngine;if(!B?.isRetreatRecoveryAttackLocked)return;
 const clone=v=>JSON.parse(JSON.stringify(v));
 function lockedIds(state,action){
   if(action?.type!=='ATTACK')return [];
   return (action.ids||[]).filter(id=>B.isRetreatRecoveryAttackLocked(state,id));
 }
 function actionAllowed(state,action){return lockedIds(state,action).length===0;}
 function chooseAlternative(api,state,c,args){
   if(typeof api?.operationalCandidates!=='function')return null;
   try{
     // Replan against a clone so crisis-lifecycle bookkeeping on the live state is not touched twice.
     const shadow=clone(state),plan=api.operationalCandidates(shadow,c,...args);
     const rows=Array.isArray(plan?.candidates)?plan.candidates:[];
     for(const row of rows){const action=row?.action;if(action&&actionAllowed(state,action))return action;}
   }catch(error){console.warn('Retreat recovery alternative-plan lookup failed',error);}
   return null;
 }
 function guard(api,label){
   if(!api)return;
   if(api.chooseAction&&!api.__retreatRecoveryChooseGuarded){
     const originalChoose=api.chooseAction.bind(api);
     api.chooseAction=function(m,c,...args){
       const chosen=originalChoose(m,c,...args);
       const locked=lockedIds(m,chosen);
       if(!locked.length)return chosen;
       const alternative=chooseAlternative(api,m,c,args);
       if(alternative)return alternative;
       console.info(`${label||'AI'} retreat-recovery attack skipped`,{locked_army_ids:locked});
       return null;
     };
     api.__retreatRecoveryChooseGuarded=true;
   }
   if(api.prepareAttack&&!api.__retreatRecoveryGuarded){
     const original=api.prepareAttack.bind(api);
     api.prepareAttack=function(m,c,a,eng){
       const locked=lockedIds(m,a);
       if(locked.length)throw new Error('RETREAT_RECOVERY_ATTACK_LOCKED');
       return original(m,c,a,eng);
     };
     api.__retreatRecoveryGuarded=true;
   }
 }
 guard(window.RoyalistAiTurn,'BRITISH');guard(window.PatriotAiTurn,'PATRIOT');
 window.__retreatRecoveryAiGuard={version:'1.1',actionAllowed:(state,action)=>actionAllowed(state,action)};
})();
