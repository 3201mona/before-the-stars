(function(){
  'use strict';
  const SRC_WAV='assets/audio/political_phase/before_the_stars_political_phase_bgm_official_v1_loop.wav';
  let audio=null,retryArmed=false,generation=0;
  function ensure(){
    if(audio)return audio;
    audio=document.createElement('audio');
    audio.id='political-phase-bgm';
    audio.preload='auto';
    audio.loop=true;
    audio.src=SRC_WAV;
    audio.setAttribute('playsinline','');
    audio.setAttribute('aria-hidden','true');
    document.body.appendChild(audio);
    return audio;
  }
  function politicalActive(){
    const state=window.__phase2UI?.getState?.();
    return state?.runtime_flow_phase==='POLITICAL' && window.__bgmControl?.currentOwner?.()==='political';
  }
  function clearRetry(){
    if(!retryArmed)return;
    retryArmed=false;
    document.removeEventListener('pointerdown',retryFromGesture,true);
    document.removeEventListener('keydown',retryFromGesture,true);
  }
  function retryFromGesture(){
    clearRetry();
    if(politicalActive())play(false);
  }
  function armRetry(){
    if(retryArmed)return;
    retryArmed=true;
    document.addEventListener('pointerdown',retryFromGesture,true);
    document.addEventListener('keydown',retryFromGesture,true);
  }
  function play(restart=true){
    if(window.__bgmControl && !window.__bgmControl.isEnabled()){stop(false);return false;}
    if(!politicalActive()){stop(false);return false;}
    const a=ensure();
    window.__openingBGM?.stop?.(true);
    window.__commandPhaseBGM?.stop?.(true);
    if(restart){try{a.currentTime=0;}catch(_error){}}
    const playToken=++generation;
    const promise=a.play();
    if(promise&&typeof promise.catch==='function')promise.catch(()=>{if(generation===playToken&&politicalActive())armRetry();});
    return true;
  }
  function stop(reset=true){
    generation++;clearRetry();
    if(!audio)return;
    try{audio.pause();}catch(_error){}
    if(reset){try{audio.currentTime=0;}catch(_error){}}
  }
  function sync(){
    if(window.__bgmControl && !window.__bgmControl.isEnabled()){stop(false);return;}
    if(politicalActive())play(audio?audio.paused:false);
    else stop(true);
  }
  window.__politicalPhaseBGM={play,stop,sync,isPlaying:()=>Boolean(audio&&!audio.paused),source:SRC_WAV,fallback:SRC_OGG};
})();
