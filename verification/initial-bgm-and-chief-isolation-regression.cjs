'use strict';
// Focused regression against the shipped JavaScript, without game-rule stubs
// being mistaken for a full campaign or a real browser audio test.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..','runtime');
const bgm=fs.readFileSync(path.join(root,'command_phase_bgm_v3.js'),'utf8');
const political=fs.readFileSync(path.join(root,'political_phase_bgm_v1.js'),'utf8');
const royalist=fs.readFileSync(path.join(root,'royalist_ai_official_browser_v3.js'),'utf8');
const completion=fs.readFileSync(path.join(root,'official_completion_v0_88_hq_collapse.js'),'utf8');
let count=0;
function check(actual,expected,label){assert.deepEqual(actual,expected,label);count++;}
function extract(source,name,next,environment){
  const nextAt=source.indexOf('function '+next+'(');
  const begin=source.lastIndexOf('function '+name+'(',nextAt);
  const boundary=new RegExp('\\n[ \\t]*function '+next+'\\(').exec(source.slice(begin));
  const end=boundary?begin+boundary.index:-1;
  assert.ok(begin>=0&&end>begin,'production function '+name+' found');
  return vm.runInNewContext(source.slice(begin,end)+';'+name,environment);
}

// An ending modal which has not yet been inserted must not steal BGM ownership.
const elements=new Map([['game-start-screen',{hidden:true}]]);
let phase='POLITICAL',conclusion=null,major=false;
const document={getElementById:id=>elements.get(id)||null};
const window={
  BeforeTheStarsOpening:{isActive:()=>false},
  __majorEventUI:{isOpen:()=>major},
  __majorEventBGM:{isActive:()=>false},
  __phase2UI:{getState:()=>({runtime_flow_phase:phase,game_conclusion:conclusion})}
};
const owner=extract(bgm,'currentOwner','syncAll',{document,window});
check(owner(),'political','first political phase before ending modals are constructed');
phase='COMMAND';check(owner(),'command','first command phase before ending modals');
elements.set('game-conclusion-screen',{hidden:true});
elements.set('game-conclusion-intro',{hidden:true});
phase='POLITICAL';check(owner(),'political','hidden ending modals leave political owner intact');
elements.get('game-conclusion-intro').hidden=false;
check(owner(),'ending','visible ending introduction takes BGM ownership');
elements.get('game-conclusion-intro').hidden=true;
conclusion={outcome:'VICTORY'};check(owner(),'ending','final conclusion state takes ownership');
conclusion=null;major=true;check(owner(),'major','major event takes precedence');
major=false;elements.get('game-start-screen').hidden=false;
check(owner(),'opening','title takes precedence');
elements.get('game-start-screen').hidden=true;
assert.match(completion,/window\.__bgmControl\?\.syncAll\?\.\(\)/);
count++;

let played=0;
const soundElements=[];
const audioDoc={
  ...document,
  body:{appendChild:a=>soundElements.push(a)},
  createElement:()=>({
    id:'',paused:true,readyState:4,currentTime:0,
    setAttribute(){},
    play(){played++;this.paused=false;return Promise.resolve();},
    pause(){this.paused=true;}
  }),
  addEventListener(){},
  removeEventListener(){}
};
window.__bgmControl={isEnabled:()=>true,currentOwner:owner};
window.__openingBGM={stop(){}};
window.__commandPhaseBGM={stop(){}};
vm.runInNewContext(political,{window,document:audioDoc,Promise});
check(window.__politicalPhaseBGM.play(),true,'political playback begins even before ending UI exists');
check(soundElements.map(a=>a.id),['political-phase-bgm'],'political player is constructed');
check(played,1,'political media play is requested');

// Commander survival is now evaluated by a shared comparative-risk policy.
const patriot=fs.readFileSync(path.join(root,'patriot_ai_official_browser_v2.js'),'utf8');
const survival=fs.readFileSync(path.join(root,'commander_survival_policy_v1.js'),'utf8');
assert.match(royalist,/window\.CommanderSurvivalPolicy/);count++;
assert.match(patriot,/window\.CommanderSurvivalPolicy/);count++;
assert.match(survival,/COMPARATIVE_HQ_SURVIVAL/);count++;
assert.doesNotMatch(royalist,/CHIEF_LEFT_WITHOUT_FIELD_ESCORT|CHIEF_SOLO_ATTACK|CHIEF_AMPHIBIOUS_ASSAULT_WITHOUT_SECURE_LAND_EXIT/);count++;
console.log('PASS initial BGM and shared commander-survival wiring: '+count+' checks');
