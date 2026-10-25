/* Copyright © 2026 さつまいモナ（satumaimona）. 利用条件: ../LICENSE.txt */

(function(){
  'use strict';
  const SAVE_KEY=window.__phase2UI?.saveKey||'american-revolution-slg/army-phase2/v0.36-political-ui-unified-candidate',CITY_SAVE_KEY=window.__cityCommandUI?.saveKey||'american-revolution-slg/city-command/v0.37-political-layout-candidate',STARTED_KEY='american-revolution-slg/v0.29/game-started',AUTO_START_KEY='american-revolution-slg/v0.29/auto-start-once',PENDING_KEY='american-revolution-slg/v0.29/pending-faction',PENDING_RANDOM_SEED_KEY='american-revolution-slg/v0.53/pending-random-seed',MANUAL_SAVE_KEY='american-revolution-slg/manual-save/v0.71-slot1',UNIFIED_AUTO_SAVE_KEY='before-the-stars/save/v1/auto',UNIFIED_MANUAL_SAVE_KEY='before-the-stars/save/v1/manual-slot-1',UNIFIED_RESCUE_SAVE_KEY='before-the-stars/save/v1/pre-load-rescue',$=id=>document.getElementById(id);
  const storage=window.localStorage;
  const style=document.createElement('style');style.textContent=`
    #game-start-screen{position:fixed;inset:0;z-index:400;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 35%,#35494d 0,#101b20 46%,#05090c 100%);color:#f5edda}
    #game-start-screen[hidden]{display:none!important}
    .game-start-card{position:relative;isolation:isolate;overflow:hidden;width:min(820px,94vw);border:6px double #c9a03b;background:linear-gradient(180deg,#293b40,#101a1f);box-shadow:0 22px 80px #000;padding:28px 34px;text-align:center}
    .game-start-card>*:not(.title-star-trails){position:relative;z-index:1}
    .game-title-en{margin:0;color:#ffe279;font-family:'Palatino Linotype','Book Antiqua',Palatino,Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:clamp(43px,7vw,72px);line-height:.82;letter-spacing:.015em;text-shadow:0 3px 0 #563d00,0 0 18px #d7a62c42}
    .game-title-en span{display:block}.game-title-en .stars{font-size:1.18em;letter-spacing:.075em}
    .title-star-trails{position:absolute;z-index:0;inset:0;overflow:hidden;pointer-events:none;opacity:.82}.title-star-trail{position:absolute;left:-28%;width:250px;height:1px;background:linear-gradient(90deg,transparent,#dccb83aa 72%,#fff2a8);filter:drop-shadow(0 0 4px #f2d76c);transform:rotate(-12deg);animation:title-star-sweep 8.5s ease-in-out infinite}.title-star-trail::after{content:'✦';position:absolute;right:-8px;top:-10px;color:#ffe58a;font-size:17px;text-shadow:0 0 8px #ffdc65}.title-star-trail.one{top:24%;animation-delay:-1.6s}.title-star-trail.two{top:42%;width:170px;opacity:.55;animation-duration:10.5s;animation-delay:-6.2s}@keyframes title-star-sweep{0%,58%{transform:translateX(0) rotate(-12deg);opacity:0}63%{opacity:.85}80%{opacity:.6}100%{transform:translateX(1100px) rotate(-12deg);opacity:0}}
    .game-title-divider{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:13px;margin:17px auto 5px;color:#d6c386;font-family:'Yu Mincho','Hiragino Mincho ProN',serif;font-size:16px;letter-spacing:.22em}.game-title-divider::before,.game-title-divider::after{content:'';height:1px;background:linear-gradient(90deg,transparent,#bda55f)}.game-title-divider::after{background:linear-gradient(90deg,#bda55f,transparent)}
    .game-title-ja{color:#f1d992;font-family:'Yu Mincho','Hiragino Mincho ProN',serif;font-size:25px;font-weight:800;letter-spacing:.16em;margin:3px 0 16px}.title-bgm-row{display:flex;justify-content:center;margin:0 0 13px}.title-bgm-row .bgm-toggle-button{border:1px solid #8f773b!important;background:#1b282e!important;color:#e8dca9!important;padding:6px 12px!important;min-width:92px;font-size:13px!important;font-weight:800!important}.title-bgm-row .bgm-toggle-button[aria-pressed="false"]{color:#9da9a9!important;border-color:#59696d!important}
    .game-start-prompt{font-size:18px;font-weight:900;margin-bottom:12px}
    .faction-choices{display:grid;grid-template-columns:1fr 1fr;gap:14px}.faction-choice{min-height:92px;font-size:23px;font-weight:900;border-width:3px}.faction-choice small{display:block;font-size:13px;margin-top:6px;font-weight:600}.faction-choice.patriot{background:linear-gradient(#285f9c,#173452);border-color:#7fb9e7;color:#fff}.faction-choice.british{background:linear-gradient(#96333d,#51232a);border-color:#dc7b82;color:#fff}
    .start-secondary-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.game-start-secondary{font-size:16px;padding:10px 16px;background:linear-gradient(#59685f,#303a34);border:2px solid #91a596;color:#fff}.game-start-secondary.almanac{background:linear-gradient(#746139,#4a3920);border-color:#ddc17a;color:#fff3cf}
    .game-start-note a{color:#d8c58b}.game-start-note{margin-top:15px;color:#b9c7c7;font-size:12px;line-height:1.5}
    #game-almanac-screen{position:fixed;inset:0;z-index:780;display:flex;flex-direction:column;background:#10181d;color:#f1ead7}
    #game-almanac-screen[hidden]{display:none!important}
    .game-almanac-toolbar{display:flex;justify-content:flex-end;padding:8px 14px;background:#1c2b32;border-bottom:2px solid #b89442}
    #game-almanac-close{padding:8px 16px;border:1px solid #c9a03b;background:#42351d;color:#ffe5a2;font-size:16px;cursor:pointer}
    #game-almanac-frame{flex:1;min-height:0;width:100%;border:0;background:#10181d}
    .public-version{margin:0 0 12px;color:#e8d49b;font-size:14px}.public-copyright{margin-top:16px;color:#bac6c6;font-size:12px;line-height:1.8}.public-copyright a{color:#e6ce90}#game-start-screen{box-sizing:border-box;overflow:auto} .game-start-card{box-sizing:border-box;max-height:calc(100dvh - 48px);overflow:auto;flex-shrink:0}
    @media(max-width:560px){.game-start-card{padding:20px}.game-title-en{font-size:39px}.game-title-divider{font-size:13px}.game-title-ja{font-size:20px}.faction-choices,.start-secondary-row{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
  const start=document.createElement('div');start.id='game-start-screen';start.innerHTML='<section class="game-start-card"><div class="title-star-trails" aria-hidden="true"><span class="title-star-trail one"></span><span class="title-star-trail two"></span></div><h1 class="game-title-en"><span>BEFORE THE</span><span class="stars">STARS</span></h1><div class="game-title-divider">星々が輝く前</div><div class="game-title-ja">アメリカ独立戦争</div><div class="public-version">Ver.1.0 β13</div><div class="title-bgm-row"><button id="bgm-toggle-title" class="bgm-toggle-button" type="button">BGM ON</button></div><div class="game-start-prompt">プレイする陣営を選択してください</div><div class="faction-choices"><button class="faction-choice patriot" data-start-faction="PATRIOT">アメリカ独立派<small>大陸会議と大陸軍を指揮</small></button><button class="faction-choice british" data-start-faction="BRITISH">イギリス王党派<small>本国議会と北米英軍を指揮</small></button></div><div class="start-secondary-row"><button id="game-continue-button" class="game-start-secondary">続きから</button><button id="game-open-almanac" class="game-start-secondary almanac">人物図鑑</button></div><div class="game-start-note">1775年6月から新しく開始します。人物図鑑では全登場予定人物の肖像・能力・略歴を確認できます。</div><footer class="public-copyright">© 2026 さつまいモナ（satumaimona）<br><a href="../about.html" target="_blank" rel="noopener">遊び方・クレジット・利用条件</a></footer></section>';document.body.appendChild(start);
	  function dismissGameOverlays(){document.querySelectorAll('#political-phase-modal,#opinion-command-modal,#routine-order-confirm,#field-army-modal,#battle-modal,#event-notification-modal').forEach(el=>{if(el)el.hidden=true;});}
  function showStart(){window.__politicalPhaseBGM?.stop?.(true);window.__commandPhaseBGM?.stop?.(true);dismissGameOverlays();start.hidden=false;$('game-continue-button').hidden=storage.getItem(STARTED_KEY)!=='1';window.__bgmControl?.render?.();window.__bgmControl?.syncAll?.();}
  function clearSavedGame(){storage.removeItem(SAVE_KEY);storage.removeItem(CITY_SAVE_KEY);storage.removeItem(MANUAL_SAVE_KEY);storage.removeItem(UNIFIED_AUTO_SAVE_KEY);storage.removeItem(UNIFIED_MANUAL_SAVE_KEY);storage.removeItem(UNIFIED_RESCUE_SAVE_KEY);}
  function freshRandomSeed(){return Math.floor(Math.random()*2147483646)+1;}
  function manualSave(){if(window.__phase2UI?.saveState)window.__phase2UI.saveState();}
  function manualLoad(){if(window.__phase2UI?.loadState)window.__phase2UI.loadState();}
  function startNew(faction){window.__openingBGM?.stop?.(true);clearSavedGame();storage.setItem(PENDING_KEY,faction);storage.setItem(PENDING_RANDOM_SEED_KEY,String(freshRandomSeed()));storage.setItem(STARTED_KEY,'1');storage.setItem(AUTO_START_KEY,'1');location.reload();}
  function requestNew(faction){if(window.BeforeTheStarsOpening?.requestStart)window.BeforeTheStarsOpening.requestStart(faction);else startNew(faction);}

  function savedFlowPhase(state){
    const phase=state?.runtime_flow_phase;
    if(phase==='POLITICAL'||phase==='COMMAND')return phase;
    /* Backward compatibility: old saves did not persist phase. Only a genuinely unopened political month defaults to POLITICAL. */
    const key=`${state?.calendar?.year}-${state?.calendar?.month}`;
    const opened=state?.political_phase?.last_opened;
    const openedKey=opened?`${opened.year}-${opened.month}`:'';
    return window.POLITICAL_PHASE_CONFIG?.political_months?.includes(state?.calendar?.month)&&openedKey!==key?'POLITICAL':'COMMAND';
  }
  function resumeSavedFlow(){
    if(start.hidden===false)return;
    window.__openingBGM?.stop?.(true);
    const state=window.__phase2UI.getState();
    window.__cityCommandUI.setFaction(state.current_faction);
    window.__cityCommandUI.syncCalendar(state.calendar);
    document.querySelectorAll('#political-phase-modal,#political-notice-modal,#political-close-confirm').forEach(el=>{if(el)el.hidden=true;});
    const resume=()=>{if(window.__eventNotificationUI?.resumeCommandFlow)window.__eventNotificationUI.resumeCommandFlow();else window.__battleUI?.resumePendingBattle?.();};
    if(savedFlowPhase(state)==='POLITICAL')window.__politicalPhaseUI.open(resume);else resume();
    window.__bgmControl?.syncAll?.();
  }
  start.querySelectorAll('[data-start-faction]').forEach(button=>button.addEventListener('click',()=>requestNew(button.dataset.startFaction)));
  $('game-continue-button').addEventListener('click',()=>{window.__openingBGM?.stop?.(true);start.hidden=true;resumeSavedFlow();});
  const almanac=document.createElement('section');almanac.id='game-almanac-screen';almanac.hidden=true;
  almanac.setAttribute('role','dialog');almanac.setAttribute('aria-modal','true');almanac.setAttribute('aria-label','人物図鑑');
  almanac.innerHTML='<div class="game-almanac-toolbar"><button id="game-almanac-close" type="button">ゲーム本体へ戻る</button></div><iframe id="game-almanac-frame" title="人物図鑑"></iframe>';
  document.body.appendChild(almanac);
  const almanacFrame=$('game-almanac-frame');
  let almanacFocus=null,almanacOverflow='';
  function closeAlmanac(){
    if(almanac.hidden)return;
    almanac.hidden=true;start.inert=false;document.body.style.overflow=almanacOverflow;
    almanacFocus?.focus();
  }
  function openAlmanac(){
    if(!almanac.hidden)return;
    almanacFocus=document.activeElement;almanacOverflow=document.body.style.overflow;
    if(!almanacFrame.getAttribute('src'))almanacFrame.src='almanac.html?embedded=1';
    almanac.hidden=false;start.inert=true;document.body.style.overflow='hidden';$('game-almanac-close').focus();
  }
  $('game-open-almanac').addEventListener('click',openAlmanac);
  $('game-almanac-close').addEventListener('click',closeAlmanac);
  window.addEventListener('message',event=>{
    if(event.source===almanacFrame.contentWindow&&event.data?.type==='BTS_ALMANAC_CLOSE')closeAlmanac();
  });
  almanac.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeAlmanac();}});
  const autoStart=storage.getItem(AUTO_START_KEY)==='1';storage.removeItem(AUTO_START_KEY);start.hidden=autoStart;if(!autoStart)showStart();else setTimeout(resumeSavedFlow,0);window.__bgmControl?.render?.();
  window.__gameStartUI={showStart,startNew,requestNew,clearSavedGame,manualSave,manualLoad,storageKeys:{military:SAVE_KEY,city:CITY_SAVE_KEY},isActive:()=>!start.hidden};
  if(new URLSearchParams(location.search).get('almanac')==='1')openAlmanac();
})();
