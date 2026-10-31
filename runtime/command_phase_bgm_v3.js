(function(){
  'use strict';
  const SRC='assets/audio/command_phase/liberty_across_the_atlantic_loop.ogg';
  let audio=null,retryArmed=false,generation=0;
  if(!window.__bgmControl){
    let enabled=true;
    try{enabled=window.localStorage.getItem('before_the_stars_bgm_enabled_v1')!=='0';}catch(_error){}
    function renderButtons(){for(const id of ['bgm-toggle-command','bgm-toggle-political','bgm-toggle-title']){const b=document.getElementById(id);if(!b)continue;b.textContent=enabled?'BGM ON':'BGM OFF';b.setAttribute('aria-pressed',enabled?'true':'false');b.title=enabled?'BGMを停止':'BGMを再生';}}
    function stopAll(){window.__openingBGM?.stop?.(false);window.__commandPhaseBGM?.stop?.(false);window.__politicalPhaseBGM?.stop?.(false);window.__majorEventBGM?.stop?.(false);for(const id of ['ending-victory-audio','ending-defeat-audio']){const audio=document.getElementById(id);if(audio){try{audio.pause();}catch(_error){}}}}
    // One authoritative owner for all phase music; overlays take precedence over saved phase.
    function currentOwner(){
      if((document.getElementById('game-start-screen')&&!document.getElementById('game-start-screen').hidden)||window.BeforeTheStarsOpening?.isActive?.())return 'opening';
      if(window.__majorEventUI?.isOpen?.()||window.__majorEventBGM?.isActive?.())return 'major';
      // Missing conclusion overlays are not open. On a fresh start the first
      // political phase may open before the completion UI has installed them.
      if(document.getElementById('game-conclusion-screen')?.hidden===false||document.getElementById('game-conclusion-intro')?.hidden===false)return 'ending';
      if(window.__phase2UI?.getState?.()?.game_conclusion)return 'ending';
      const phase=window.__phase2UI?.getState?.()?.runtime_flow_phase;
      return phase==='POLITICAL'?'political':phase==='COMMAND'?'command':null;
    }
    function syncAll(){
      const owner=enabled?currentOwner():null;
      if(owner!=='opening')window.__openingBGM?.stop?.(true);
      if(owner!=='command')window.__commandPhaseBGM?.stop?.(true);
      if(owner!=='political')window.__politicalPhaseBGM?.stop?.(true);
      if(owner!=='major'&&window.__majorEventBGM?.isActive?.())window.__majorEventBGM?.end?.(false);
      if(!owner)return;
      if(owner==='opening')window.__openingBGM?.sync?.();
      else if(owner==='command')window.__commandPhaseBGM?.sync?.();
      else if(owner==='political')window.__politicalPhaseBGM?.sync?.();
      else if(owner==='major')window.__majorEventBGM?.sync?.();
    }
    function resumeCurrent(){syncAll();}
    function setEnabled(value){enabled=Boolean(value);try{window.localStorage.setItem('before_the_stars_bgm_enabled_v1',enabled?'1':'0');}catch(_error){}renderButtons();if(enabled)resumeCurrent();else stopAll();return enabled;}
    function toggle(){return setEnabled(!enabled);}
    window.__bgmControl={isEnabled:()=>enabled,setEnabled,toggle,render:renderButtons,currentOwner,syncAll,stopAll};
    document.addEventListener('click',event=>{const id=event.target?.id;if(id==='bgm-toggle-command'||id==='bgm-toggle-political'||id==='bgm-toggle-title'){event.preventDefault();toggle();}},true);
    setTimeout(renderButtons,0);
  }
  function ensure(){
    if(audio)return audio;
    audio=document.createElement('audio'); audio.id='command-phase-bgm'; audio.preload='auto'; audio.loop=true; audio.src=SRC;
    audio.setAttribute('playsinline',''); audio.setAttribute('aria-hidden','true'); document.body.appendChild(audio); return audio;
  }
  function commandActive(){
    const state=window.__phase2UI?.getState?.();
    return state?.runtime_flow_phase==='COMMAND' && window.__bgmControl?.currentOwner?.()==='command';
  }
  function clearRetry(){if(!retryArmed)return;retryArmed=false;document.removeEventListener('pointerdown',retryFromGesture,true);document.removeEventListener('keydown',retryFromGesture,true);}
  function retryFromGesture(){clearRetry();if(commandActive())play(false);}
  function armRetry(){if(retryArmed)return;retryArmed=true;document.addEventListener('pointerdown',retryFromGesture,true);document.addEventListener('keydown',retryFromGesture,true);}
  function play(restart=true){
    if(window.__bgmControl && !window.__bgmControl.isEnabled()){stop(false);return false;}
    if(!commandActive()){stop(false);return false;}
    const a=ensure();
    window.__openingBGM?.stop?.(true);
    window.__politicalPhaseBGM?.stop?.(true);
    if(restart){try{a.currentTime=0;}catch(_error){}}
    const playToken=++generation;
    const promise=a.play(); if(promise&&typeof promise.catch==='function')promise.catch(()=>{if(generation===playToken&&commandActive())armRetry();}); return true;
  }
  function stop(reset=true){generation++;clearRetry();if(!audio)return;try{audio.pause();}catch(_error){}if(reset){try{audio.currentTime=0;}catch(_error){}}}
  function sync(){if(window.__bgmControl && !window.__bgmControl.isEnabled()){stop(false);return;}if(commandActive()){if(!audio||audio.paused)play(false);}else stop(true);}
  window.__commandPhaseBGM={play,stop,sync,isPlaying:()=>Boolean(audio&&!audio.paused),source:SRC};
})();
