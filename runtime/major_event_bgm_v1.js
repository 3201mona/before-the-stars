(function(){
  'use strict';
  const SRC='assets/audio/major_event/BTS_MAJOR_EVENT_BGM_OFFICIAL.mp3';
  let audio=null,active=false,retryArmed=false,resumeTarget=null;
  function ensure(){
    if(audio)return audio;
    audio=document.createElement('audio');
    audio.id='major-event-bgm';
    audio.preload='auto';
    audio.loop=false;
    audio.src=SRC;
    audio.setAttribute('playsinline','');
    audio.setAttribute('aria-hidden','true');
    document.body.appendChild(audio);
    return audio;
  }
  function clearRetry(){if(!retryArmed)return;retryArmed=false;document.removeEventListener('pointerdown',retryFromGesture,true);document.removeEventListener('keydown',retryFromGesture,true);}
  function retryFromGesture(){clearRetry();if(active)play(false);}
  function armRetry(){if(retryArmed)return;retryArmed=true;document.addEventListener('pointerdown',retryFromGesture,true);document.addEventListener('keydown',retryFromGesture,true);}
  function captureUnderlying(){
    if(window.__openingBGM?.isPlaying?.())resumeTarget='opening';
    else if(window.__politicalPhaseBGM?.isPlaying?.())resumeTarget='political';
    else if(window.__commandPhaseBGM?.isPlaying?.())resumeTarget='command';
    else resumeTarget=null;
  }
  function pauseUnderlying(){window.__openingBGM?.stop?.(false);window.__politicalPhaseBGM?.stop?.(false);window.__commandPhaseBGM?.stop?.(false);}
  function resumeUnderlying(){
    if(!resumeTarget||!window.__bgmControl?.isEnabled?.())return;
    const target=resumeTarget;resumeTarget=null;
    if(target==='opening')window.__openingBGM?.sync?.();
    else if(target==='political')window.__politicalPhaseBGM?.sync?.();
    else if(target==='command')window.__commandPhaseBGM?.sync?.();
  }
  function play(restart=true){
    if(!active)return false;
    if(window.__bgmControl&&!window.__bgmControl.isEnabled()){stop(false);return false;}
    pauseUnderlying();
    const a=ensure();
    if(restart){try{a.currentTime=0;}catch(_error){}}
    const promise=a.play();if(promise&&typeof promise.catch==='function')promise.catch(()=>armRetry());
    return true;
  }
  function stop(reset=true){clearRetry();if(!audio)return;try{audio.pause();}catch(_error){}if(reset){try{audio.currentTime=0;}catch(_error){}}}
  function begin(){
    if(!active)captureUnderlying();
    active=true;
    pauseUnderlying();
    return play(true);
  }
  function end(resume=true){
    const target=resumeTarget;
    active=false;stop(true);
    if(resume){resumeTarget=target;resumeUnderlying();}else resumeTarget=null;
  }
  function sync(){
    if(!active){stop(false);return false;}
    if(window.__bgmControl&&!window.__bgmControl.isEnabled()){stop(false);return false;}
    if(!audio||audio.paused)return play(false);
    return true;
  }
  window.__majorEventBGM={begin,end,play,stop,sync,isActive:()=>active,isPlaying:()=>Boolean(audio&&!audio.paused),source:SRC};
})();
