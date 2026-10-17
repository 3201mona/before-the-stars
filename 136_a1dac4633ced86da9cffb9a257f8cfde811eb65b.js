(function(){
  'use strict';
  const SRC_WAV='assets/audio/opening/before_the_stars_opening_bgm_official_v2.wav';
  const SRC_OGG='assets/audio/opening/before_the_stars_opening_bgm_official_v2.ogg';
  let audio=null,retryArmed=false,generation=0;
  function ensure(){
    if(audio)return audio;
    audio=document.createElement('audio');
    audio.id='opening-bgm';
    audio.preload='auto';
    audio.loop=true;
    audio.setAttribute('playsinline','');
    audio.setAttribute('aria-hidden','true');
    const wav=document.createElement('source');wav.src=SRC_WAV;wav.type='audio/wav';
    const ogg=document.createElement('source');ogg.src=SRC_OGG;ogg.type='audio/ogg';
    audio.append(wav,ogg);
    document.body.appendChild(audio);
    return audio;
  }
  function openingActive(){return window.__bgmControl?.currentOwner?.()==='opening';}
  function clearRetry(){if(!retryArmed)return;retryArmed=false;document.removeEventListener('pointerdown',retryFromGesture,true);document.removeEventListener('keydown',retryFromGesture,true);}
  function retryFromGesture(){clearRetry();if(openingActive())play(false);}
  function armRetry(){if(retryArmed)return;retryArmed=true;document.addEventListener('pointerdown',retryFromGesture,true);document.addEventListener('keydown',retryFromGesture,true);}
  function play(restart=true){
    if(window.__bgmControl&&!window.__bgmControl.isEnabled()){stop(false);return false;}
    if(!openingActive()){stop(false);return false;}
    const a=ensure();
    window.__politicalPhaseBGM?.stop?.(true);
    window.__commandPhaseBGM?.stop?.(true);
    const v=document.getElementById('ending-victory-audio');if(v){try{v.pause();v.currentTime=0;}catch(_error){}}
    if(restart){try{a.currentTime=0;}catch(_error){}}
    const playToken=++generation;
    const promise=a.play();if(promise&&typeof promise.catch==='function')promise.catch(()=>{if(generation===playToken&&openingActive())armRetry();});
    return true;
  }
  function stop(reset=true){generation++;clearRetry();if(!audio)return;try{audio.pause();}catch(_error){}if(reset){try{audio.currentTime=0;}catch(_error){}}}
  function sync(){if(window.__bgmControl&&!window.__bgmControl.isEnabled()){stop(false);return;}if(openingActive()){if(!audio||audio.paused)play(false);}else stop(true);}
  window.__openingBGM={play,stop,sync,isPlaying:()=>Boolean(audio&&!audio.paused),source:SRC_WAV,fallback:SRC_OGG};
  setTimeout(sync,0);
})();
