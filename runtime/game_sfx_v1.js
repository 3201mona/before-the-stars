(function(){
  'use strict';
  const SOURCES={
    month_bell:'assets/audio/sfx/month_start_chime.wav',
    kiran:'assets/audio/sfx/success_kiran_v1.ogg',
    status_up:'assets/audio/sfx/status_up_shakiin_v2.ogg',
    status_down:'assets/audio/sfx/status_down_bururiran_v1.ogg',
    battle_alert:'assets/audio/sfx/battle_alert_buin_v2.ogg'
  };
  const VOLUME={month_bell:.46,kiran:.50,status_up:.48,status_down:.46,battle_alert:.56};
  const preload={};
  function ensure(name){
    if(preload[name])return preload[name];
    const src=SOURCES[name];if(!src)return null;
    const audio=document.createElement('audio');audio.preload='auto';audio.src=src;audio.setAttribute('playsinline','');audio.setAttribute('aria-hidden','true');audio.hidden=true;document.body.appendChild(audio);preload[name]=audio;return audio;
  }
  function play(name){
    const base=ensure(name);if(!base)return false;
    try{
      const audio=base.cloneNode(true);audio.volume=VOLUME[name]??.5;audio.setAttribute('aria-hidden','true');audio.hidden=true;document.body.appendChild(audio);
      const cleanup=()=>audio.remove();audio.addEventListener('ended',cleanup,{once:true});audio.addEventListener('error',cleanup,{once:true});
      const promise=audio.play();if(promise&&typeof promise.catch==='function')promise.catch(()=>cleanup());
      window.setTimeout(cleanup,4000);return true;
    }catch(_error){return false;}
  }
  for(const name of Object.keys(SOURCES))window.setTimeout(()=>ensure(name),0);
  // Enemy attack presentation waits for the actual end, with a bounded fallback
  // for missing media or an autoplay rejection. Existing one-shot calls stay synchronous.
  function playAndWait(name,{signal,timeoutMs=3000}={}){
    return new Promise(resolve=>{
      let audio=null,timer=null,finished=false,played=false;
      const abort=()=>finish('cancelled');
      function finish(reason){if(finished)return;finished=true;if(timer!==null)window.clearTimeout(timer);signal?.removeEventListener?.('abort',abort);if(audio){audio.removeEventListener('ended',ended);audio.removeEventListener('error',failed);try{audio.pause();}catch(_error){}audio.remove();}resolve({played,reason});}
      const ended=()=>{played=true;finish('ended');},failed=()=>finish('error');
      if(signal?.aborted){finish('cancelled');return;}
      try{
        const base=ensure(name);if(!base){finish('missing');return;}
        audio=base.cloneNode(true);audio.volume=VOLUME[name]??.5;audio.hidden=true;audio.setAttribute('aria-hidden','true');document.body.appendChild(audio);
        audio.addEventListener('ended',ended);audio.addEventListener('error',failed);signal?.addEventListener?.('abort',abort,{once:true});
        timer=window.setTimeout(()=>finish('timeout'),Math.min(4000,Math.max(250,Number(timeoutMs)||3000)));
        const promise=audio.play();if(promise?.then)promise.then(()=>{played=true;},()=>finish('blocked'));else played=true;
      }catch(_error){finish('error');}
    });
  }
  window.__gameSFX={play,playAndWait,sources:{...SOURCES}};
})();
