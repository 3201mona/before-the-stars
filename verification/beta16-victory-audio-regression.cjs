'use strict';
// Exercise the actual ending audio/presentation functions in a small DOM fixture.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../runtime');
const code=fs.readFileSync(path.join(root,'official_completion_v0_88_hq_collapse.js'),'utf8');
const a=code.indexOf('  function victorySlides('),b=code.indexOf('  // A battle owns',a);assert(a>=0&&b>a);
function fixture(enabled=true,reject=false){
  const elements=new Map(),stops=[];
  function $(id){if(!elements.has(id))elements.set(id,{hidden:true,loop:true,volume:1,currentTime:18,plays:0,pauses:0,handlers:{},classList:{add(){},remove(){}},addEventListener(type,fn){this.handlers[type]=fn;},pause(){this.pauses++;},play(){this.plays++;return reject?Promise.reject(new Error('autoplay blocked')):Promise.resolve();}});return elements.get(id);}
  const win={__bgmControl:{isEnabled:()=>enabled},__openingBGM:{stop:()=>stops.push('opening')},__commandPhaseBGM:{stop:()=>stops.push('command')},__politicalPhaseBGM:{stop:()=>stops.push('political')}};
  const ctx={window:win,$,ensureSaveDialog(){},document:{documentElement:{classList:{add(){}}}},ui:{getState:()=>({})},conclusionComments:()=>[{name:'Test',text:'Victory',note:'',portrait:''}],clearInterval(){},setInterval(){return 7;},setTimeout(){},slideTimer:null,conclusionVisible:false};
  vm.createContext(ctx);vm.runInContext(code.slice(a,b),ctx);return{ctx,$,win,stops};
}
(async()=>{
  let count=0;
  for(const faction of ['PATRIOT','BRITISH']){
    const f=fixture();f.ctx.showConclusion({outcome:'VICTORY',player_faction:faction});
    assert.equal(f.$('ending-victory-audio').plays,1);assert.equal(f.$('ending-victory-audio').volume,.75);assert.equal(f.$('ending-victory-audio').loop,false);assert.equal(f.$('ending-victory-audio').currentTime,0);assert.equal(f.$('ending-defeat-audio').plays,0);assert.equal(f.$('game-conclusion-screen').hidden,false);assert.equal(f.stops.length,3);
    assert.equal(f.$('ending-scene-a').src,faction==='PATRIOT'?'assets/endings/victory_parade.png':'assets/endings/victory_british_parade.png');count++;
  }
  const off=fixture(false);off.ctx.showConclusion({outcome:'VICTORY',player_faction:'PATRIOT'});assert.equal(off.$('ending-victory-audio').plays,0);count++;
  const defeat=fixture();defeat.ctx.showConclusion({outcome:'DEFEAT',player_faction:'BRITISH'});assert.equal(defeat.$('ending-defeat-audio').plays,1);assert.equal(defeat.$('ending-defeat-audio').volume,1);assert.equal(defeat.$('ending-victory-audio').plays,0);count++;
  const stop=fixture();stop.ctx.stopSlideshow();for(const id of ['ending-victory-audio','ending-defeat-audio']){assert.equal(stop.$(id).pauses,1);assert.equal(stop.$(id).currentTime,0);}count++;
  const blocked=fixture(true,true);blocked.ctx.playEndingAudio('ending-victory-audio',.75);await Promise.resolve();assert.equal(typeof blocked.$('game-conclusion-screen').handlers.pointerdown,'function');blocked.win.__bgmControl.isEnabled=()=>false;blocked.$('game-conclusion-screen').handlers.pointerdown();assert.equal(blocked.$('ending-victory-audio').plays,1);count++;
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/victory/victory_clear_manifest.json')));
  for(const ext of ['mp3','ogg']){const file=fs.readFileSync(path.join(root,`assets/audio/victory/victory_clear.${ext}`));assert.equal(crypto.createHash('sha256').update(file).digest('hex'),manifest[`${ext}_sha256`]);assert(code.includes(`victory_clear.${ext}?v=20261028-beta16-victory`));}
  console.log(`PASS: ${count} ending behavior scenarios; approved audio hashes and cache URLs`);
})().catch(error=>{console.error(error);process.exitCode=1;});
