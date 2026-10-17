(function(){'use strict';
 window.__opponentAiTurnUI={
  run(){const s=window.__phase2UI?.getState?.();return s?.player_faction==='BRITISH'?window.__patriotAiTurnUI?.run?.():window.__royalistAiTurnUI?.run?.();},
  runPolitical(m,c){return m?.player_faction==='BRITISH'?window.__patriotAiTurnUI?.runPolitical?.(m,c):window.__royalistAiTurnUI?.runPolitical?.(m,c);},
  isRunning(){return Boolean(window.__patriotAiTurnUI?.isRunning?.()||window.__royalistAiTurnUI?.isRunning?.());}
 };
})();
